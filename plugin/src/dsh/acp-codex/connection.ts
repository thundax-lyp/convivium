import { Writable } from "node:stream";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subprocess";
import {
    ClientSideConnection,
    ndJsonStream,
    PROTOCOL_VERSION,
    type SessionNotification,
    type InitializeRequest,
    type NewSessionRequest,
    type LoadSessionRequest,
    type SetSessionConfigOptionRequest,
    type PromptRequest,
    type CancelNotification
} from "@agentclientprotocol/sdk";
import { LlmError } from "@deepseek-ai/dsh-llm";
import pkg from "@convivium/dsh-plugin/package.json" with { type: "json" };
import type { CodexAcpConfig, CodexAcpConnection } from "./types.ts";

export const openCodexAcpConnection = async (
    ctx: Context,
    config: CodexAcpConfig,
    cwd: string,
    signal: AbortSignal,
    onUpdate: (notification: SessionNotification) => Promise<void>
): Promise<CodexAcpConnection> => {
    signal.throwIfAborted();
    const env: NodeJS.ProcessEnv = Object.fromEntries(
        Object.keys(process.env).map((key) => [key, undefined])
    );
    for (const name of ["PATH", "HOME", "CODEX_HOME", "CODEX_PATH"]) {
        if (process.env[name] !== undefined) {
            env[name] = process.env[name];
        }
    }
    env.INITIAL_AGENT_MODE = "read-only";
    env.NO_BROWSER = "1";
    const child = ctx.subprocess.spawn({
        argv: [config.command, ...config.args],
        cwd,
        stdio: { stdin: "pipe", stdout: "pipe", stderr: { maxBytes: 65536 } },
        graceMs: 5000,
        env,
        signal
    });
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> =>
        (closing ??= (async () => {
            signal.removeEventListener("abort", onAbort);
            child.terminate();
            if (!(await child.waitForExit())) {
                throw new LlmError("Codex process did not close.", "ACP_CODEX_RECOVERY_REQUIRED");
            }
            child.stdin?.destroy();
            child.stdout?.destroy();
        })());
    const onAbort = () => {
        void close().catch(() => {});
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
        onAbort();
    }
    child.done.catch(() => {
        void close().catch(() => {});
    });
    if (!child.stdin || !child.stdout) {
        await close();
        throw new LlmError("Codex stdio unavailable.", "ACP_CODEX_CONFIG_INVALID");
    }
    const stdin = child.stdin;
    const stdout = child.stdout;
    const iterator = stdout[Symbol.asyncIterator]();
    const stream = ndJsonStream(
        Writable.toWeb(stdin),
        new ReadableStream<Uint8Array>({
            pull: async (controller) => {
                const next = await iterator.next();
                if (next.done) {
                    controller.close();
                } else if (next.value instanceof Uint8Array) {
                    controller.enqueue(new Uint8Array(next.value));
                } else {
                    controller.error(new Error("Non-byte ACP stdout."));
                }
            },
            cancel: () => {
                stdout.destroy();
            }
        })
    );
    class CodexClient extends ClientSideConnection {
        private readonly timed = async <T>(
            operation: () => Promise<T>,
            ms: number,
            code = "ACP_CODEX_CONFIG_INVALID"
        ): Promise<T> => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                return await Promise.race([
                    operation(),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(
                            () => reject(new LlmError("Codex ACP RPC timed out.", code)),
                            ms
                        );
                    })
                ]);
            } catch (error) {
                await close();
                throw error;
            } finally {
                clearTimeout(timer);
            }
        };
        override initialize = (params: InitializeRequest) =>
            this.timed(() => super.initialize(params), 30000);
        override newSession = (params: NewSessionRequest) =>
            this.timed(() => super.newSession(params), 30000);
        override loadSession = (params: LoadSessionRequest) =>
            this.timed(() => super.loadSession(params), 30000);
        override setSessionConfigOption = (params: SetSessionConfigOptionRequest) =>
            this.timed(() => super.setSessionConfigOption(params), 30000);
        override prompt = (params: PromptRequest) =>
            this.timed(() => super.prompt(params), 120000, "ACP_CODEX_OUTCOME_UNKNOWN");
        override cancel = (params: CancelNotification) =>
            this.timed(() => super.cancel(params), 30000, "ACP_CODEX_OUTCOME_UNKNOWN");
    }
    const client = new CodexClient(
        () => ({
            sessionUpdate: onUpdate,
            requestPermission: async () => ({ outcome: { outcome: "cancelled" } })
        }),
        stream
    );
    try {
        const initialized = await client.initialize({
            protocolVersion: PROTOCOL_VERSION,
            clientInfo: { name: "convivium", version: pkg.version },
            clientCapabilities: {
                fs: { readTextFile: false, writeTextFile: false },
                terminal: false
            }
        });
        if (
            initialized.protocolVersion !== PROTOCOL_VERSION ||
            !initialized.agentCapabilities?.loadSession
        ) {
            throw new LlmError(
                "Required ACP capabilities unavailable.",
                "ACP_CODEX_CONFIG_INVALID"
            );
        }
        signal.throwIfAborted();
        return { client, initialized, close };
    } catch (error) {
        await close();
        throw error;
    }
};
