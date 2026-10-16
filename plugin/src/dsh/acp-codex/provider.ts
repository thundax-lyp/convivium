import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import type {} from "@deepseek-ai/dsh-session-persistence";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
    LlmAdapter,
    LlmError,
    ReasoningEffortId,
    type GenerateOptions,
    type LlmModelInfo,
    type LlmResolvedModelInfo,
    type StreamChunk,
    type PreparedAdapterCall,
    type TokenUsage
} from "@deepseek-ai/dsh-llm";
import {
    RequestError,
    type SessionConfigOption,
    type SessionNotification,
    type Usage
} from "@agentclientprotocol/sdk";
import { randomUUID } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { encodeCanonicalJson, sha256Hex } from "@/utils/index.ts";
import { CodexCompactionBoundary } from "./compaction.ts";
import { openCodexAcpConnection } from "./connection.ts";
import { openCodexAcpStore } from "./store.ts";
import { buildCodexPrompt } from "./prompt.ts";
import type {
    CodexAcpConfig,
    CodexAcpProviderPort,
    CodexAcpStore,
    CodexAcpBlock,
    CodexAcpBinding,
    CodexAcpRequest,
    CodexAcpConnection
} from "./types.ts";

const error = (code: string, message: string) => new LlmError(message, code);
const preflightError = (cause: unknown): LlmError =>
    cause instanceof LlmError && cause.code.startsWith("ACP_CODEX_")
        ? cause
        : cause instanceof RequestError && cause.code === RequestError.authRequired().code
          ? error("ACP_CODEX_AUTH_REQUIRED", "Codex login required")
          : error("ACP_CODEX_CONFIG_INVALID", "Codex ACP preparation failed");
const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value: unknown) => sha256Hex(encodeCanonicalJson(value));
const select = (options: readonly SessionConfigOption[], id: string) => {
    const option = options.find((entry) => entry.id === id);
    if (option?.type !== "select") {
        throw error("ACP_CODEX_MODEL_UNAVAILABLE", `Required ACP select unavailable: ${id}`);
    }
    const values = option.options.flatMap((entry) => ("group" in entry ? entry.options : [entry]));
    if (!values.some((entry) => entry.value === option.currentValue)) {
        throw error("ACP_CODEX_MODEL_UNAVAILABLE", "ACP default is outside the exact directory");
    }
    return { current: option.currentValue, values };
};
const projectUsage = (value: Usage): TokenUsage | undefined => {
    const counters = [
        value.inputTokens,
        value.outputTokens,
        value.cachedReadTokens,
        value.cachedWriteTokens,
        value.thoughtTokens
    ].filter((entry) => entry != null);
    if (counters.some((entry) => !Number.isSafeInteger(entry) || entry < 0)) {
        return undefined;
    }
    const input =
        value.inputTokens - (value.cachedReadTokens ?? 0) - (value.cachedWriteTokens ?? 0);
    if (input < 0) {
        return undefined;
    }
    return {
        inputTokens: input,
        outputTokens: value.outputTokens,
        ...(value.totalTokens === value.inputTokens + value.outputTokens
            ? { totalTokens: value.totalTokens }
            : {}),
        ...(value.cachedReadTokens == null ? {} : { cacheReadTokens: value.cachedReadTokens }),
        ...(value.cachedWriteTokens == null ? {} : { cacheWriteTokens: value.cachedWriteTokens }),
        ...(value.thoughtTokens == null ? {} : { reasoningTokens: value.thoughtTokens })
    };
};
interface Lease {
    agent: Agent;
    purpose: "provisioning" | "delivery";
    lifetime: AbortController;
    connection: CodexAcpConnection;
    buffer?: { requestId: string; text: string };
    active?: { done: Promise<void>; release: () => void; cancel: () => void };
    closing?: Promise<void>;
}

export class CodexAcpProvider extends LlmAdapter implements CodexAcpProviderPort {
    private readonly config: CodexAcpConfig;
    private readonly leases = new Map<string, Lease>();
    private readonly cleanupAgents = new WeakSet<Agent>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly preparations = new Map<string, Promise<void>>();
    private readonly checkpoints = new Map<string, Promise<void>>();
    private readonly blocked = new Map<string, CodexAcpBlock>();
    private readonly listeners = new Set<(root: string) => void>();
    private readonly disposers: (() => void)[] = [];
    private readonly models = new Map<string, LlmResolvedModelInfo>();
    private launch?: {
        commandRealpath: string;
        commandSha256: string;
        args: readonly string[];
        codexVersion: string;
        codexExecutableSha256: string;
        codeHomeRealpath: string;
    };
    private closing?: Promise<void>;
    private disabled = false;
    constructor(
        private readonly ctx: Context,
        config: CodexAcpConfig,
        private readonly store: CodexAcpStore
    ) {
        super();
        this.config = Object.freeze({
            command: config.command,
            args: Object.freeze([...config.args])
        });
        for (const binding of store.bindings()) {
            if (binding.block) {
                this.blocked.set(binding.rootSessionId, binding.block);
            }
        }
    }
    private usable = () => {
        if (this.closing || this.disabled) {
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP provider is unavailable");
        }
    };
    private serial = async <T>(id: string, action: () => Promise<T>): Promise<T> => {
        const previous = this.queues.get(id) ?? Promise.resolve();
        const next = previous.then(action);
        this.queues.set(
            id,
            next.then(
                () => {},
                () => {}
            )
        );
        return next;
    };
    private write = async (id: string, action: () => Promise<void>) => {
        try {
            await this.serial(id, action);
        } catch (cause) {
            if (cause instanceof LlmError && cause.code === "ACP_CODEX_DELIVERY_CONFLICT") {
                throw cause;
            }
            this.disabled = true;
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP technical persistence failed");
        }
    };
    private fingerprint = (cwd: string) => {
        if (!this.launch) {
            throw error("ACP_CODEX_CONFIG_INVALID", "ACP startup not prepared");
        }
        return hash({ ...this.launch, cwd, mode: "read-only" });
    };
    private diagnostic = (
        binding: CodexAcpBinding,
        phase: "bound" | "loaded" | "committed" | "delivery-completed" | "closed",
        extra: { requestId?: string; deliveryId?: string } = {}
    ) => {
        const identity = {
            sessionId: binding.sessionId,
            acpSessionId: binding.acpSessionId,
            launchFingerprint: binding.launchFingerprint,
            provider: binding.provider,
            model: binding.model,
            ...(binding.reasoningEffort === undefined
                ? {}
                : { reasoningEffort: binding.reasoningEffort })
        };
        // A missing remote identity is a blocked record, never a verification event.
        if (!binding.acpSessionId) {
            return;
        }
        this.ctx.emit("convivium/acp-checkpoint", {
            sessionId: binding.sessionId,
            rootSessionId: binding.rootSessionId,
            phase,
            bindingSha256: hash(identity),
            ...extra
        });
    };
    private block = async (sessionId: string, code: CodexAcpBlock["code"]) => {
        const binding = this.store.binding(sessionId);
        if (!binding) {
            this.disabled = true;
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "Missing ACP binding");
        }
        const block = this.blocked.get(binding.rootSessionId) ?? { code, since: Date.now() };
        this.blocked.set(binding.rootSessionId, block);
        // The shared flag denies tools synchronously, before any queued writes.
        const root = this.store.binding(binding.rootSessionId);
        for (const target of root && root.sessionId !== binding.sessionId
            ? [binding, root]
            : [binding]) {
            await this.write(target.sessionId, () =>
                this.store.putBinding({ ...target, state: "blocked", block, updatedAt: Date.now() })
            );
        }
        for (const listener of this.listeners) {
            listener(binding.rootSessionId);
        }
    };
    async initialize(): Promise<void> {
        for (const key of [
            "llm",
            "agents",
            "tools",
            "sessions",
            "sessionPersistence",
            "subprocess",
            "storageDomain"
        ]) {
            if (!this.ctx.get(key)) {
                throw error("ACP_CODEX_CONFIG_INVALID", `Missing Host service: ${key}`);
            }
        }
        if (
            !isAbsolute(this.config.command) ||
            !process.env.CODEX_PATH ||
            !isAbsolute(process.env.CODEX_PATH)
        ) {
            throw error(
                "ACP_CODEX_CONFIG_INVALID",
                "Absolute bridge and explicit CODEX_PATH required"
            );
        }
        const commandRealpath = await realpath(this.config.command);
        const codex = await realpath(process.env.CODEX_PATH);
        await access(commandRealpath, constants.X_OK);
        await access(codex, constants.X_OK);
        const home =
            process.env.CODEX_HOME ??
            (process.env.HOME ? join(process.env.HOME, ".codex") : undefined);
        if (!home) {
            throw error("ACP_CODEX_CONFIG_INVALID", "Codex home unavailable");
        }
        const lifetime = new AbortController();
        const timer = setTimeout(() => lifetime.abort(), 30000);
        let connection: CodexAcpConnection | undefined;
        let versionDrained: boolean;
        const version = this.ctx.subprocess.spawn({
            argv: [codex, "--version"],
            cwd: await realpath(process.cwd()),
            env: Object.fromEntries(
                Object.keys(process.env).map((key) => [
                    key,
                    ["PATH", "HOME", "CODEX_HOME", "CODEX_PATH"].includes(key)
                        ? process.env[key]
                        : undefined
                ])
            ),
            stdio: { stdin: "ignore", stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
            graceMs: 5000,
            signal: lifetime.signal
        });
        try {
            const outcome = await version.done;
            const stdout = version.collected.stdout?.readFrom(0);
            if (
                outcome.exitCode !== 0 ||
                !stdout ||
                stdout.lossy ||
                !/^codex-cli \S+\s*$/.test(stdout.text)
            ) {
                throw error("ACP_CODEX_CONFIG_INVALID", "Codex binary version unavailable");
            }
            this.launch = {
                commandRealpath,
                commandSha256: sha256Hex(await readFile(commandRealpath)),
                args: this.config.args,
                codexVersion: stdout.text.trim(),
                codexExecutableSha256: sha256Hex(await readFile(codex)),
                codeHomeRealpath: await realpath(home)
            };
            connection = await openCodexAcpConnection(
                this.ctx,
                this.config,
                await realpath(process.cwd()),
                lifetime.signal,
                async () => {}
            );
            const fresh = await connection.client.newSession({
                cwd: await realpath(process.cwd()),
                mcpServers: []
            });
            const catalog = select(fresh.configOptions ?? [], "model");
            for (const model of catalog.values) {
                const configured = await connection.client.setSessionConfigOption({
                    sessionId: fresh.sessionId,
                    configId: "model",
                    value: model.value
                });
                if (select(configured.configOptions, "model").current !== model.value) {
                    throw error(
                        "ACP_CODEX_MODEL_UNAVAILABLE",
                        "ACP model selection did not settle"
                    );
                }
                const effortOption = configured.configOptions.find(
                    (entry) => entry.id === "reasoning_effort"
                );
                const effort = effortOption
                    ? select(configured.configOptions, "reasoning_effort")
                    : undefined;
                this.models.set(
                    model.value,
                    Object.freeze({
                        provider: "acp-codex",
                        id: model.value,
                        name: model.name,
                        inputModalities: ["text" as const],
                        ...(effort
                            ? {
                                  reasoning: {
                                      efforts: effort.values.map((value) => ({
                                          id: ReasoningEffortId(value.value),
                                          name: value.name
                                      })),
                                      defaultEffort: ReasoningEffortId(effort.current)
                                  }
                              }
                            : {})
                    })
                );
            }
            this.disposers.push(this.ctx.llm.registerAdapter(["acp-codex"], this));
            this.disposers.push(
                this.ctx.on("agent/created", async ({ agent, source, signal }) => {
                    if (agent.options.provider !== "acp-codex") {
                        return;
                    }
                    if (this.cleanupAgents.has(agent)) {
                        return;
                    }
                    if (this.leases.get(agent.id)?.agent !== agent) {
                        const parent = agent.session.header.parentSession;
                        if (source !== "startup" || !parent || !this.leases.has(parent)) {
                            throw error(
                                "ACP_CODEX_UNSUPPORTED_REQUEST",
                                "ACP Agent must be prepared by its owner or trusted fresh parent"
                            );
                        }
                        await this.prepareSession(
                            agent,
                            "provisioning",
                            signal ?? new AbortController().signal
                        );
                    }
                })
            );
            this.disposers.push(
                this.ctx.on("agent/assistant-stream", ({ agent, frame }) => {
                    if (
                        this.leases.has(agent.id) &&
                        frame.type === "end" &&
                        frame.outcome.kind === "committed" &&
                        frame.outcome.eventType === "assistant/message"
                    ) {
                        void this.checkpoint(agent.id, new AbortController().signal).catch(() => {
                            this.disabled = true;
                        });
                    }
                })
            );
            this.disposers.push(
                this.ctx.on("agent/turn-stopping", async ({ agent, signal }) => {
                    if (this.leases.has(agent.id)) {
                        await this.checkpoint(agent.id, signal);
                    }
                })
            );
        } finally {
            clearTimeout(timer);
            await connection?.close();
            version.terminate();
            versionDrained = await version.waitForExit();
        }
        if (!versionDrained) {
            throw error("ACP_CODEX_CONFIG_INVALID", "Codex probe did not drain");
        }
    }
    override providerInfo = (_provider: string) => ({ id: "acp-codex", name: "Codex (ACP)" });
    override providerRetryPolicy = (_provider: string) => ({
        mode: "normal" as const,
        maxRetries: 0,
        retryableCodes: [],
        initialDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0
    });
    override listModels = async (_provider: string): Promise<readonly LlmModelInfo[]> => {
        this.usable();
        return [...this.models.values()].map(({ provider, id, name, inputModalities }) => ({
            provider,
            id,
            name,
            inputModalities
        }));
    };
    override resolveModel = async (
        provider: string,
        model: string
    ): Promise<LlmResolvedModelInfo> => {
        this.usable();
        const resolved = this.models.get(model);
        if (provider !== "acp-codex" || !resolved) {
            throw error("ACP_CODEX_MODEL_UNAVAILABLE", "Exact Codex model unavailable");
        }
        return resolved;
    };
    override prepareCall = async (
        provider: string,
        model: string
    ): Promise<PreparedAdapterCall> => {
        const resolved = await this.resolveModel(provider, model);
        return Object.freeze({
            model: resolved,
            stream: (options: GenerateOptions) => this.stream({ ...options, provider, model })
        });
    };
    private configure = async (
        connection: CodexAcpConnection,
        id: string,
        model: string,
        effort?: string
    ) => {
        const modelResult = await connection.client.setSessionConfigOption({
            sessionId: id,
            configId: "model",
            value: model
        });
        if (select(modelResult.configOptions, "model").current !== model) {
            throw error("ACP_CODEX_MODEL_UNAVAILABLE", "ACP model mismatch");
        }
        if (effort !== undefined) {
            const options = select(modelResult.configOptions, "reasoning_effort");
            if (!options.values.some((value) => value.value === effort)) {
                throw error("ACP_CODEX_MODEL_UNAVAILABLE", "ACP reasoning unavailable");
            }
            const result = await connection.client.setSessionConfigOption({
                sessionId: id,
                configId: "reasoning_effort",
                value: effort
            });
            if (select(result.configOptions, "reasoning_effort").current !== effort) {
                throw error("ACP_CODEX_MODEL_UNAVAILABLE", "ACP reasoning mismatch");
            }
        }
        const mode = await connection.client.setSessionConfigOption({
            sessionId: id,
            configId: "mode",
            value: "read-only"
        });
        if (select(mode.configOptions, "mode").current !== "read-only") {
            throw error("ACP_CODEX_CONFIG_INVALID", "ACP read-only mode unavailable");
        }
        if (
            select(mode.configOptions, "model").current !== model ||
            (effort !== undefined &&
                select(mode.configOptions, "reasoning_effort").current !== effort)
        ) {
            throw error(
                "ACP_CODEX_MODEL_UNAVAILABLE",
                "ACP final configuration changed the selected model or reasoning"
            );
        }
    };
    prepareSession = async (
        agent: Agent,
        purpose: "provisioning" | "delivery" | "cleanup",
        signal: AbortSignal
    ): Promise<void> => {
        const pending = this.preparations.get(agent.id) ?? Promise.resolve();
        const operation = pending.then(async () => {
            signal.throwIfAborted();
            if (purpose === "cleanup") {
                await this.stopSession(agent.id);
                this.cleanupAgents.add(agent);
                return;
            }
            this.usable();
            if (
                agent.options.provider !== "acp-codex" ||
                !(
                    this.ctx.get("agentPresets")?.serviceFor(agent, "compaction") instanceof
                    CodexCompactionBoundary
                )
            ) {
                throw error("ACP_CODEX_CONFIG_INVALID", "ACP Preset compaction boundary required");
            }
            const resolved = await this.resolveModel("acp-codex", agent.options.model ?? "");
            const effort = agent.options.reasoningEffort ?? resolved.reasoning?.defaultEffort;
            if (
                effort !== undefined &&
                !resolved.reasoning?.efforts.some((entry) => entry.id === effort)
            ) {
                throw error("ACP_CODEX_MODEL_UNAVAILABLE", "Exact reasoning unavailable");
            }
            if (!agent.session.header.cwd) {
                throw error("ACP_CODEX_CONFIG_INVALID", "Session cwd required");
            }
            const cwd = await realpath(agent.session.header.cwd);
            const fingerprint = this.fingerprint(cwd);
            const previous = this.store.binding(agent.id);
            let rootSessionId: string = agent.id;
            if (agent.session.header.parentSession) {
                const parent = this.store.binding(agent.session.header.parentSession);
                if (!parent || !this.leases.has(parent.sessionId)) {
                    throw error("ACP_CODEX_UNSUPPORTED_REQUEST", "ACP parent was not prepared");
                }
                rootSessionId = parent.rootSessionId;
            }
            if (previous) {
                await this.reconcileSession(agent.id, signal);
                if (
                    previous.cwd !== cwd ||
                    previous.launchFingerprint !== fingerprint ||
                    previous.model !== resolved.id ||
                    previous.reasoningEffort !== effort ||
                    previous.rootSessionId !== rootSessionId
                ) {
                    await this.block(agent.id, "ACP_CODEX_RECOVERY_REQUIRED");
                    throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP immutable binding mismatch");
                }
            } else {
                const events = await this.read(agent.id, signal);
                if (
                    events.some(
                        (event) =>
                            event.type === "request/header" ||
                            event.type === "user/message" ||
                            event.type === "assistant/message"
                    )
                ) {
                    const now = Date.now();
                    await this.write(agent.id, () =>
                        this.store.putBinding({
                            sessionId: agent.id,
                            rootSessionId,
                            cwd,
                            launchFingerprint: fingerprint,
                            provider: "acp-codex",
                            model: resolved.id,
                            ...(effort === undefined ? {} : { reasoningEffort: effort }),
                            state: "blocked",
                            block: { code: "ACP_CODEX_RECOVERY_REQUIRED", since: now },
                            createdAt: now,
                            updatedAt: now
                        })
                    );
                    await this.block(agent.id, "ACP_CODEX_RECOVERY_REQUIRED");
                    throw error(
                        "ACP_CODEX_RECOVERY_REQUIRED",
                        "Missing ACP binding for consumed history"
                    );
                }
            }
            const blocked = this.blockFor(agent.id) ?? this.blockFor(rootSessionId);
            if (blocked) {
                throw error(blocked.code, "ACP root is blocked");
            }
            const current = this.leases.get(agent.id);
            if (current?.agent === agent && current.purpose === purpose) {
                return;
            }
            if (
                current?.agent === agent &&
                current.purpose === "provisioning" &&
                purpose === "delivery"
            ) {
                if (current.active || current.closing || current.lifetime.signal.aborted) {
                    throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP warm activation is not idle");
                }
                current.purpose = "delivery";
                return;
            }
            if (current) {
                await this.stopLease(agent.id, current);
            }
            await this.connectSession({
                agent,
                purpose,
                cwd,
                rootSessionId,
                model: resolved.id,
                effort,
                previous,
                fingerprint,
                signal
            });
        });
        this.preparations.set(
            agent.id,
            operation.then(
                () => {},
                () => {}
            )
        );
        return operation;
    };
    private connectSession = async (input: {
        agent: Agent;
        purpose: "provisioning" | "delivery";
        cwd: string;
        rootSessionId: string;
        model: string;
        effort?: string;
        previous?: CodexAcpBinding;
        fingerprint: string;
        signal: AbortSignal;
    }) => {
        const { agent, purpose, cwd, rootSessionId, model, effort, previous, fingerprint, signal } =
            input;
        const lifetime = new AbortController();
        const abort = () => lifetime.abort(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        let connection: CodexAcpConnection | undefined;
        let lease: Lease | undefined;
        try {
            connection = await openCodexAcpConnection(
                this.ctx,
                this.config,
                cwd,
                lifetime.signal,
                async (notification: SessionNotification) => {
                    if (
                        lease?.buffer &&
                        notification.sessionId === this.store.binding(agent.id)?.acpSessionId &&
                        notification.update.sessionUpdate === "agent_message_chunk" &&
                        notification.update.content.type === "text"
                    ) {
                        lease.buffer.text += notification.update.content.text;
                    }
                }
            );
            let acpSessionId = previous?.acpSessionId;
            if (previous) {
                if (!acpSessionId) {
                    throw error("ACP_CODEX_RECOVERY_REQUIRED", "Missing original ACP identity");
                }
                const loaded = await connection.client.loadSession({
                    sessionId: acpSessionId,
                    cwd,
                    mcpServers: []
                });
                if (
                    select(loaded.configOptions ?? [], "model").current !== previous.model ||
                    (previous.reasoningEffort !== undefined &&
                        select(loaded.configOptions ?? [], "reasoning_effort").current !==
                            previous.reasoningEffort)
                ) {
                    throw error("ACP_CODEX_RECOVERY_REQUIRED", "Loaded configuration mismatch");
                }
            } else {
                acpSessionId = (await connection.client.newSession({ cwd, mcpServers: [] }))
                    .sessionId;
            }
            await this.configure(connection, acpSessionId, model, effort);
            signal.throwIfAborted();
            this.usable();
            if (!previous) {
                const now = Date.now();
                await this.write(agent.id, () =>
                    this.store.putBinding({
                        sessionId: agent.id,
                        rootSessionId,
                        acpSessionId,
                        cwd,
                        launchFingerprint: fingerprint,
                        provider: "acp-codex",
                        model: model,
                        ...(effort === undefined ? {} : { reasoningEffort: effort }),
                        state: "ready",
                        createdAt: now,
                        updatedAt: now
                    })
                );
            }
            lease = { agent, purpose, lifetime, connection };
            this.leases.set(agent.id, lease);
            agent.ctx.effect(() => () => this.stopSession(agent.id));
            const bound = this.store.binding(agent.id);
            if (bound) {
                this.diagnostic(bound, previous ? "loaded" : "bound");
            }
        } catch (cause) {
            lifetime.abort();
            await connection?.close();
            if (previous) {
                await this.block(agent.id, "ACP_CODEX_RECOVERY_REQUIRED");
                throw error("ACP_CODEX_RECOVERY_REQUIRED", "Original ACP session cannot be loaded");
            }
            throw preflightError(cause);
        } finally {
            signal.removeEventListener("abort", abort);
        }
    };
    private read = async (sessionId: string, signal: AbortSignal) => {
        signal.throwIfAborted();
        try {
            const stat = await this.ctx.sessionPersistence.stat(SessionId(sessionId));
            if (!stat) {
                return [];
            }
            const handle = await this.ctx.sessionPersistence.open(SessionId(sessionId), "read");
            try {
                return (await handle.read(undefined, undefined, { signal })).events;
            } finally {
                await handle.close();
            }
        } catch (_cause) {
            this.disabled = true;
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "DSH durable history is unavailable");
        }
    };
    checkpoint = (sessionId: string, signal: AbortSignal): Promise<void> => {
        const previous = this.checkpoints.get(sessionId) ?? Promise.resolve();
        const next = previous
            .then(async () => {
                signal.throwIfAborted();
                const agent =
                    this.leases.get(sessionId)?.agent ?? this.ctx.agents.get(SessionId(sessionId));
                if (agent && !(await this.ctx.sessions.flush(agent.session))) {
                    await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
                    throw error("ACP_CODEX_RECOVERY_REQUIRED", "DSH flush failed");
                }
                const events = await this.read(sessionId, signal);
                for (const request of this.store.requests(sessionId)) {
                    if (request.phase !== "responded") {
                        continue;
                    }
                    const found = events.some((event) => {
                        if (event.type !== "assistant/message" || event.data.interrupted) {
                            return false;
                        }
                        const source = event.data.message.source;
                        if (source.kind !== "model" || source.provider !== "acp-codex") {
                            return false;
                        }
                        const response = isObject(source.replayState)
                            ? source.replayState.response
                            : undefined;
                        return (
                            isObject(response) &&
                            isObject(response.conviviumAcp) &&
                            response.conviviumAcp.requestId === request.requestId
                        );
                    });
                    if (!found) {
                        await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
                        throw error(
                            "ACP_CODEX_RECOVERY_REQUIRED",
                            "ACP response lacks durable DSH receipt"
                        );
                    }
                    if (found) {
                        await this.write(sessionId, () =>
                            this.store.putRequest({
                                ...request,
                                phase: "committed",
                                committedAt: Date.now()
                            })
                        );
                        const binding = this.store.binding(sessionId);
                        if (binding) {
                            this.diagnostic(binding, "committed", { requestId: request.requestId });
                        }
                    }
                }
            })
            .catch(async (cause) => {
                if (!this.blockFor(sessionId)) {
                    this.disabled = true;
                    if (this.store.binding(sessionId)) {
                        await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
                    }
                }
                throw cause instanceof LlmError
                    ? cause
                    : error("ACP_CODEX_RECOVERY_REQUIRED", "DSH checkpoint could not be proven");
            });
        this.checkpoints.set(sessionId, next);
        return next;
    };
    private reconcileRequests = async (sessionId: string, signal: AbortSignal): Promise<void> => {
        await this.checkpoint(sessionId, signal);
        const pending = this.store
            .requests(sessionId)
            .find((request) => request.phase !== "committed");
        if (pending) {
            await this.block(
                sessionId,
                pending.phase === "sending"
                    ? "ACP_CODEX_OUTCOME_UNKNOWN"
                    : "ACP_CODEX_RECOVERY_REQUIRED"
            );
        }
        const requests = this.store.requests(sessionId);
        const ids = new Set(requests.flatMap((request) => [...request.inputMessageIds]));
        const events = await this.read(sessionId, signal);
        const missing = events.some((event) => {
            if (event.type === "user/message") {
                return !ids.has(event.data.id);
            }
            if (
                event.type === "request/header" &&
                event.data.header.config.provider === "acp-codex" &&
                !requests.length
            ) {
                return true;
            }
            if (
                event.type !== "assistant/message" ||
                event.data.message.source.kind !== "model" ||
                event.data.message.source.provider !== "acp-codex"
            ) {
                return false;
            }
            const replay = event.data.message.source.replayState;
            const response = isObject(replay) ? replay.response : undefined;
            if (!isObject(response) || !isObject(response.conviviumAcp)) {
                return true;
            }
            const receiptId = response.conviviumAcp.requestId;
            return !requests.some((request) => request.requestId === receiptId);
        });
        if (missing) {
            await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
            throw error(
                this.blockFor(sessionId)?.code ?? "ACP_CODEX_RECOVERY_REQUIRED",
                "Consumed DSH input or receipt lacks an ACP request record"
            );
        }
    };
    reconcileSession = async (sessionId: string, signal: AbortSignal): Promise<void> => {
        this.usable();
        const binding = this.store.binding(sessionId);
        if (!binding) {
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "Missing ACP recovery binding");
        }
        await this.reconcileRequests(sessionId, signal);
        for (const delivery of this.store.deliveries(sessionId)) {
            if (delivery.state !== "completed") {
                await this.finishDelivery(sessionId, delivery.deliveryId, signal);
            }
        }
        for (const child of this.store.bindings()) {
            if (child.rootSessionId === binding.rootSessionId && child.sessionId !== sessionId) {
                await this.reconcileRequests(child.sessionId, signal);
            }
        }
        const blocked = this.blockFor(sessionId);
        if (blocked) {
            throw error(blocked.code, "ACP recovery requires user action");
        }
    };
    override async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
        this.usable();
        // Reject auxiliary and unsupported inputs before acquiring or changing any binding.
        buildCodexPrompt(options, undefined);
        if (!options.sessionId) {
            throw error("ACP_CODEX_UNSUPPORTED_REQUEST", "Session identity required");
        }
        const sessionId = options.sessionId;
        const lease = this.leases.get(sessionId);
        const binding = this.store.binding(sessionId);
        if (!lease || !binding?.acpSessionId || options.provider !== "acp-codex") {
            throw error("ACP_CODEX_UNSUPPORTED_REQUEST", "Unprepared ACP Session");
        }
        while (lease.active) {
            await lease.active.done;
        }
        let release = () => {};
        const done = new Promise<void>((resolve) => {
            release = resolve;
        });
        lease.active = { done, release, cancel: () => deadline.abort() };
        let sent = false;
        let deliveredFinish = false;
        let callSignal: AbortSignal | undefined;
        const deadline = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abortSettlement: Promise<void> | undefined;
        let cancellation: Promise<void> | undefined;
        let promptOperation: ReturnType<CodexAcpConnection["client"]["prompt"]> | undefined;
        const abort = () => {
            abortSettlement ??= this.block(sessionId, "ACP_CODEX_OUTCOME_UNKNOWN");
            void abortSettlement.catch(() => {
                this.disabled = true;
            });
            cancellation ??= (async () => {
                let grace: ReturnType<typeof setTimeout> | undefined;
                try {
                    await lease.connection.client.cancel({ sessionId: binding.acpSessionId ?? "" });
                    if (promptOperation) {
                        await Promise.race([
                            promptOperation.then(
                                () => {},
                                () => {}
                            ),
                            new Promise<void>((resolve) => {
                                grace = setTimeout(resolve, 5000);
                            })
                        ]);
                    }
                } finally {
                    clearTimeout(grace);
                    await lease.connection.close();
                }
            })();
            void cancellation.catch(() => {
                this.disabled = true;
            });
        };
        try {
            await this.checkpoint(sessionId, options.signal ?? new AbortController().signal);
            if (this.store.requests(sessionId).some((request) => request.phase !== "committed")) {
                await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
            }
            const blocked = this.blockFor(sessionId);
            if (blocked) {
                throw error(blocked.code, "ACP root is blocked");
            }
            if (this.leases.get(sessionId) !== lease || lease.lifetime.signal.aborted) {
                throw error("ACP_CODEX_UNSUPPORTED_REQUEST", "ACP Session was stopped");
            }
            const resolved = await this.resolveModel(options.provider, options.model);
            const effort = options.reasoningEffort ?? resolved.reasoning?.defaultEffort;
            if (binding.model !== options.model || binding.reasoningEffort !== effort) {
                throw error("ACP_CODEX_MODEL_UNAVAILABLE", "Request changes immutable ACP binding");
            }
            const previous = this.store
                .requests(sessionId)
                .filter((request) => request.phase === "committed")
                .sort((a, b) => b.prefixMessageIds.length - a.prefixMessageIds.length)[0];
            const prompt = buildCodexPrompt(
                options,
                previous
                    ? { messageIds: previous.prefixMessageIds, sha256: previous.prefixSha256 }
                    : undefined
            );
            const signal = AbortSignal.any([
                lease.lifetime.signal,
                deadline.signal,
                ...(options.signal ? [options.signal] : [])
            ]);
            callSignal = signal;
            signal.throwIfAborted();
            const request: CodexAcpRequest = {
                requestId: randomUUID(),
                sessionId,
                rootSessionId: binding.rootSessionId,
                inputMessageIds: prompt.inputMessageIds,
                prefixMessageIds: prompt.prefixMessageIds,
                prefixSha256: prompt.prefixSha256,
                phase: "sending",
                startedAt: Date.now()
            };
            await this.write(sessionId, () => this.store.putRequest(request));
            sent = true;
            timer = setTimeout(() => deadline.abort(), 120000);
            lease.buffer = { requestId: request.requestId, text: "" };
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) {
                abort();
                signal.throwIfAborted();
            }
            promptOperation = lease.connection.client.prompt({
                sessionId: binding.acpSessionId,
                prompt: prompt.prompt
            });
            const response = await promptOperation;
            signal.throwIfAborted();
            const blockedAfter = this.blockFor(sessionId);
            if (blockedAfter) {
                throw error(blockedAfter.code, "Unsafe ACP tool settlement");
            }
            if (response.stopReason !== "end_turn" && response.stopReason !== "max_tokens") {
                await this.block(
                    sessionId,
                    response.stopReason === "cancelled"
                        ? "ACP_CODEX_OUTCOME_UNKNOWN"
                        : "ACP_CODEX_RECOVERY_REQUIRED"
                );
                throw error(
                    this.blockFor(sessionId)?.code ?? "ACP_CODEX_RECOVERY_REQUIRED",
                    "ACP response did not stop normally"
                );
            }
            await this.write(sessionId, () =>
                this.store.putRequest({ ...request, phase: "responded", respondedAt: Date.now() })
            );
            const text = lease.buffer.text;
            if (text) {
                yield { type: "block-start", index: 0, blockType: "text" };
                yield { type: "text-delta", index: 0, text };
                yield { type: "block-end", index: 0, block: { type: "text", text } };
            }
            if (response.usage) {
                const usage = projectUsage(response.usage);
                if (usage) {
                    yield { type: "usage", usage };
                }
            }
            signal.throwIfAborted();
            deliveredFinish = true;
            yield {
                type: "finish",
                reason: { kind: response.stopReason === "max_tokens" ? "max-tokens" : "stop" },
                replayState: { response: { conviviumAcp: { requestId: request.requestId } } }
            };
        } catch (cause) {
            if (sent) {
                await this.block(
                    sessionId,
                    this.blockFor(sessionId)?.code ?? "ACP_CODEX_OUTCOME_UNKNOWN"
                );
                await lease.connection.close();
                throw error(
                    this.blockFor(sessionId)?.code ?? "ACP_CODEX_OUTCOME_UNKNOWN",
                    "ACP response could not be durably completed"
                );
            }
            throw cause;
        } finally {
            clearTimeout(timer);
            callSignal?.removeEventListener("abort", abort);
            try {
                if (sent && !deliveredFinish && !this.blockFor(sessionId)) {
                    await this.block(sessionId, "ACP_CODEX_OUTCOME_UNKNOWN");
                }
                await abortSettlement;
                await cancellation;
            } finally {
                lease.buffer = undefined;
                lease.active = undefined;
                release();
            }
        }
    }

    deliveryState = (
        sessionId: string,
        deliveryId: string
    ): "unseen" | "pending" | "completed" | "blocked" => {
        const delivery = this.store.delivery(sessionId, deliveryId);
        if (delivery?.state === "completed") {
            return "completed";
        }
        if (this.blockFor(sessionId) || delivery?.state === "blocked") {
            return "blocked";
        }
        return delivery ? "pending" : "unseen";
    };
    beginDelivery = async (input: {
        sessionId: string;
        deliveryId: string;
        text: string;
    }): Promise<void> => {
        this.usable();
        if (!this.store.binding(input.sessionId)) {
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "Delivery requires a prepared binding");
        }
        const textSha256 = sha256Hex(new TextEncoder().encode(input.text));
        await this.serial(input.sessionId, async () => {
            const existing = this.store.delivery(input.sessionId, input.deliveryId);
            if (existing) {
                if (existing.textSha256 !== textSha256) {
                    throw error("ACP_CODEX_DELIVERY_CONFLICT", "Delivery text changed");
                }
                return;
            }
            const blocked = this.blockFor(input.sessionId);
            if (blocked) {
                throw error(blocked.code, "ACP root is blocked");
            }
            const now = Date.now();
            try {
                await this.store.putDelivery({
                    sessionId: input.sessionId,
                    deliveryId: input.deliveryId,
                    textSha256,
                    state: "admitting",
                    createdAt: now,
                    updatedAt: now
                });
            } catch (_cause) {
                this.disabled = true;
                throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP delivery persistence failed");
            }
        });
    };

    markDeliveryQueued = async (sessionId: string, deliveryId: string): Promise<void> => {
        const delivery = this.store.delivery(sessionId, deliveryId);
        const agent = this.leases.get(sessionId)?.agent;
        if (!delivery || !agent || !(await this.ctx.sessions.flush(agent.session))) {
            await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
            throw error("ACP_CODEX_RECOVERY_REQUIRED", "Delivery queue not durable");
        }
        if (delivery.state === "admitting") {
            await this.write(sessionId, () =>
                this.store.putDelivery({ ...delivery, state: "queued", updatedAt: Date.now() })
            );
        }
    };
    finishDelivery = async (
        sessionId: string,
        deliveryId: string,
        signal: AbortSignal
    ): Promise<void> => {
        if (this.store.delivery(sessionId, deliveryId)?.state === "completed") {
            return;
        }
        await this.checkpoint(sessionId, signal);
        const binding = this.store.binding(sessionId);
        const delivery = this.store.delivery(sessionId, deliveryId);
        const requests = this.store
            .requests(sessionId)
            .filter((request) => request.inputMessageIds.includes(deliveryId));
        const events = await this.read(sessionId, signal);
        const turns = events
            .filter(
                (event) =>
                    event.type === "assistant/message" &&
                    !event.data.interrupted &&
                    requests.some((request) => {
                        const source = event.data.message.source;
                        const response =
                            source.kind === "model" && isObject(source.replayState)
                                ? source.replayState.response
                                : undefined;
                        return (
                            isObject(response) &&
                            isObject(response.conviviumAcp) &&
                            response.conviviumAcp.requestId === request.requestId
                        );
                    })
            )
            .map((event) => (event.type === "assistant/message" ? event.data.turn : -1));
        if (
            !binding ||
            !delivery ||
            this.blockFor(sessionId) ||
            !requests.length ||
            this.store.requests(sessionId).some((request) => request.phase !== "committed") ||
            new Set(turns).size !== 1 ||
            !events.some(
                (event) => event.type === "user/message" && event.data.id === deliveryId
            ) ||
            !events.some(
                (event) =>
                    event.type === "turn/end" &&
                    event.data.turn === turns[0] &&
                    event.data.reason.kind === "completed"
            )
        ) {
            await this.block(sessionId, "ACP_CODEX_RECOVERY_REQUIRED");
            throw error(
                this.blockFor(sessionId)?.code ?? "ACP_CODEX_RECOVERY_REQUIRED",
                "Original delivery turn is not durably complete"
            );
        }
        await this.write(sessionId, () =>
            this.store.putDelivery({ ...delivery, state: "completed", updatedAt: Date.now() })
        );
        this.diagnostic(binding, "delivery-completed", { deliveryId });
    };
    blockFor = (sessionId: string): CodexAcpBlock | undefined =>
        this.blocked.get(this.store.binding(sessionId)?.rootSessionId ?? sessionId) ??
        this.store.binding(sessionId)?.block;
    subscribeBlocks = (listener: (rootSessionId: string) => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private stopLease = (sessionId: string, lease: Lease): Promise<void> => {
        if (lease.closing) {
            return lease.closing;
        }
        lease.closing = (async () => {
            const active = lease.active;
            // Cancel and await the active request before closing its connection.
            if (active) {
                active.cancel();
                await active.done;
            }
            lease.lifetime.abort();
            const failures: unknown[] = [];
            for (const result of await Promise.allSettled([lease.connection.close()])) {
                if (result.status === "rejected") {
                    failures.push(result.reason);
                }
            }
            if (failures.length) {
                throw new AggregateError(failures, "ACP Session did not drain");
            }
            this.leases.delete(sessionId);
            const binding = this.store.binding(sessionId);
            if (binding) {
                this.diagnostic(binding, "closed");
            }
        })();
        return lease.closing;
    };
    stopSession = async (sessionId: string): Promise<void> => {
        const descendants = new Set([sessionId]);
        let expanded = true;
        while (expanded) {
            expanded = false;
            for (const [id, lease] of this.leases) {
                if (
                    !descendants.has(id) &&
                    lease.agent.session.header.parentSession &&
                    descendants.has(lease.agent.session.header.parentSession)
                ) {
                    descendants.add(id);
                    expanded = true;
                }
            }
        }
        for (const id of [...descendants].reverse()) {
            const lease = this.leases.get(id);
            if (lease) {
                await this.stopLease(id, lease);
            }
        }
    };
    close = (): Promise<void> => {
        if (this.closing) {
            return this.closing;
        }
        this.disabled = true;
        this.closing = (async () => {
            const failures: unknown[] = [];
            const preparationResults = await Promise.allSettled(this.preparations.values());
            for (const result of preparationResults) {
                if (result.status === "rejected") {
                    failures.push(result.reason);
                }
            }
            for (const [id, lease] of this.leases) {
                try {
                    await this.stopLease(id, lease);
                } catch (cause) {
                    failures.push(cause);
                }
            }
            await Promise.allSettled([...this.checkpoints.values(), ...this.queues.values()]);
            for (const dispose of this.disposers.splice(0).reverse()) {
                try {
                    dispose();
                } catch (cause) {
                    failures.push(cause);
                }
            }
            try {
                await this.store.close();
            } catch (cause) {
                failures.push(cause);
            }
            if (failures.length) {
                throw new AggregateError(failures, "ACP provider cleanup failed");
            }
        })();
        return this.closing;
    };
}
export const createCodexAcpProvider = async (
    ctx: Context,
    config: CodexAcpConfig
): Promise<CodexAcpProvider> => {
    let store: CodexAcpStore;
    try {
        store = await openCodexAcpStore(ctx);
    } catch (_cause) {
        throw error("ACP_CODEX_RECOVERY_REQUIRED", "ACP technical domain cannot be opened");
    }
    const provider = new CodexAcpProvider(ctx, config, store);
    try {
        await provider.initialize();
        return provider;
    } catch (cause) {
        await provider.close();
        throw preflightError(cause);
    }
};
