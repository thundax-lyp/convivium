import Loader from "@deepseek-ai/cordis-plugin-loader";
import AgentPresetRegistry from "@deepseek-ai/dsh-agent-preset-registry";
import AgentPreset from "@deepseek-ai/dsh-agent-preset";
import { SessionId } from "@deepseek-ai/dsh-session";
import { createMessage } from "@deepseek-ai/dsh-llm";
import CodexCompactionBoundary from "@/dsh/acp-codex/compaction.ts";
import { Context } from "@deepseek-ai/cordis";
import {
    mountAgentLoopTestDependencies,
    mountAgentLoopTestHarness
} from "@deepseek-ai/dsh-agent-loop-testkit";
import LocalSubprocess from "@deepseek-ai/dsh-subprocess-local";
import SessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import Storage from "@deepseek-ai/dsh-storage";
import * as Domains from "@deepseek-ai/dsh-storage-domain";
import * as Sqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexAcpProvider } from "@/dsh/acp-codex/provider.ts";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
        await cleanup();
    }
    vi.unstubAllEnvs();
});
const fixture = async (existingRoot?: string) => {
    const ctx = new Context();
    const root = existingRoot ?? (await mkdtemp(join(tmpdir(), "acp-provider-")));
    cleanups.push(async () => {
        await ctx.fiber.dispose();
        if (!existingRoot) {
            await rm(root, { recursive: true, force: true });
        }
    });
    await mountAgentLoopTestDependencies(ctx);
    await mountAgentLoopTestHarness(ctx);
    ctx.provide("tokenMeter", {});
    await ctx.plugin(Loader, { baseUrl: new URL("../../../", import.meta.url).href });
    ctx.loader.builtins["acp-boundary"] = CodexCompactionBoundary;
    await ctx.plugin(AgentPresetRegistry, { default: "acp" });
    await ctx.plugin(AgentPreset, {
        id: "acp",
        plugins: [{ id: "compaction", name: "cordis:acp-boundary", isolate: { compaction: true } }]
    });
    await ctx.plugin(SessionPersistence, { root: join(root, "sessions"), compression: "none" });
    await ctx.plugin(LocalSubprocess);
    await ctx.plugin(Storage);
    await ctx.plugin(Sqlite, { path: join(root, "storage.sqlite") });
    await ctx.plugin(Domains, { backend: "sqlite" });
    const script = fileURLToPath(new URL("../../fixtures/scripted-acp-agent.mjs", import.meta.url));
    vi.stubEnv("CODEX_PATH", script);
    vi.stubEnv("CODEX_HOME", root);
    const provider = await createCodexAcpProvider(ctx, {
        command: process.execPath,
        args: [script, "provider"]
    });
    cleanups.push(() => provider.close());
    const setup =
        (purpose = "provisioning") =>
        async (scope, agent) => {
            await ctx.agentPresets.mount(scope, "acp");
            scope.systemPrompt.section({
                name: "identity",
                order: 10,
                text: "You are the independent reviewer."
            });
            await provider.prepareSession(agent, purpose, new AbortController().signal);
        };
    const agentOptions = {
        provider: "acp-codex",
        model: "scripted-codex",
        reasoningEffort: "medium"
    };
    const make = (id = "test", purpose = "provisioning") =>
        ctx.agents.create({
            sessionId: SessionId(id),
            meta: { cwd: root, agentPreset: "acp" },
            agentOptions,
            setup: setup(purpose)
        });
    const resume = (id = "test") =>
        ctx.agents.resume({
            resumeSessionId: SessionId(id),
            agentOptions,
            setup: setup("delivery")
        });
    return { ctx, root, provider, make, resume };
};
describe("Codex provider lifecycle", () => {
    it("registers only the exact ACP route and discovers model/reasoning through the probe without prompting", async () => {
        const f = await fixture();
        expect(f.ctx.llm.listProviders()).toEqual([{ id: "acp-codex", name: "Codex (ACP)" }]);
        expect(await f.provider.listModels("acp-codex")).toEqual([
            {
                provider: "acp-codex",
                id: "scripted-codex",
                name: "Scripted Codex",
                inputModalities: ["text"]
            }
        ]);
        const model = await f.provider.resolveModel("acp-codex", "scripted-codex");
        expect(model.reasoning).toMatchObject({
            efforts: [{ id: "medium", name: "Medium" }],
            defaultEffort: "medium"
        });
        expect(model.context).toBeUndefined();
        await expect(f.provider.resolveModel("acp-codex", "missing")).rejects.toMatchObject({
            code: "ACP_CODEX_MODEL_UNAVAILABLE"
        });
        expect(f.provider.providerRetryPolicy("acp-codex").maxRetries).toBe(0);
    });
    it("persists sending before prompt and commits only after the native assistant receipt is flushed", async () => {
        const f = await fixture();
        const calls = [];
        f.ctx.tools.register({
            name: "read",
            description: "read",
            parameters: { type: "object", properties: {} },
            output: {
                schema: { type: "object" },
                render: () => [{ type: "text", text: "read result" }]
            },
            execute: async (_args, exec) => {
                const requests = [
                    ...f.ctx.storageDomain.get("convivium_acp_codex").table("requests").entries()
                ].map(([, value]) => value);
                expect(requests.filter((request) => request.phase === "sending")).toHaveLength(1);
                calls.push(exec.agent.id);
                return { ok: true };
            }
        });
        const events = [];
        f.ctx.on("convivium/acp-checkpoint", (event) => {
            events.push(event);
        });
        const handle = await f.make();
        const domain = f.ctx.storageDomain.get("convivium_acp_codex");
        expect(domain).toBeDefined();
        const message = createMessage({
            role: "user",
            source: { kind: "user" },
            content: [{ type: "text", text: "review the evidence" }]
        });
        await f.provider.beginDelivery({
            sessionId: handle.agent.id,
            deliveryId: message.id,
            text: "review the evidence"
        });
        handle.agent.followup(message);
        await f.provider.markDeliveryQueued(handle.agent.id, message.id);
        await handle.agent.whenIdle();
        await f.provider.finishDelivery(handle.agent.id, message.id, new AbortController().signal);
        expect(f.provider.deliveryState(handle.agent.id, message.id)).toBe("completed");
        expect(calls).toEqual([]);
        expect(f.provider.blockFor(handle.agent.id)).toBeUndefined();
        expect(events.map((event) => event.phase)).toEqual([
            "bound",
            "committed",
            "delivery-completed"
        ]);
        expect(JSON.stringify(events)).not.toContain("scripted-");
        const second = createMessage({
            role: "user",
            source: { kind: "user" },
            content: [{ type: "text", text: "second delivery" }]
        });
        await f.provider.beginDelivery({
            sessionId: handle.agent.id,
            deliveryId: second.id,
            text: "second delivery"
        });
        handle.agent.followup(second);
        await f.provider.markDeliveryQueued(handle.agent.id, second.id);
        await handle.agent.whenIdle();
        await f.provider.finishDelivery(handle.agent.id, second.id, new AbortController().signal);
        expect(calls).toEqual([]);
        const rpc = (await readFile(join(f.root, "scripted-rpc.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .map(JSON.parse);
        expect(rpc.filter((entry) => entry.method === "session/new")).toHaveLength(2);
        expect(rpc.filter((entry) => entry.method === "session/prompt")).toHaveLength(2);
        expect(rpc.some((entry) => entry.method === "session/load")).toBe(false);
        expect(
            rpc
                .filter((entry) => entry.method === "session/new")
                .every((entry) => entry.mcpCount === 0)
        ).toBe(true);
        const stored = await f.ctx.sessionPersistence.open(handle.agent.id, "read");
        try {
            const records = (await stored.read()).events;
            expect(
                records.some(
                    (event) =>
                        event.type === "assistant/message" &&
                        event.data.message.content.some(
                            (block) => block.type === "text" && block.text === "scripted result"
                        )
                )
            ).toBe(true);
        } finally {
            await stored.close();
        }
        await handle.dispose();
    });

    it("loads the same idle binding after a fresh Host process and accepts only a new persistent user prefix", async () => {
        const first = await fixture();
        const before = [];
        first.ctx.on("convivium/acp-checkpoint", (event) => {
            before.push(event);
        });
        const handle = await first.make();
        handle.agent.followup(
            createMessage({
                role: "user",
                source: { kind: "user" },
                content: [{ type: "text", text: "first" }]
            })
        );
        await handle.agent.whenIdle();
        await first.provider.checkpoint(handle.agent.id, new AbortController().signal);
        await handle.dispose();
        await first.provider.close();
        const cold = await fixture(first.root);
        const after = [];
        cold.ctx.on("convivium/acp-checkpoint", (event) => {
            after.push(event);
        });
        const restored = await cold.resume();
        expect(after[0].phase).toBe("loaded");
        expect(after[0].bindingSha256).toBe(before[0].bindingSha256);
        restored.agent.followup(
            createMessage({
                role: "user",
                source: { kind: "user" },
                content: [{ type: "text", text: "second" }]
            })
        );
        await restored.agent.whenIdle();
        await cold.provider.checkpoint(restored.agent.id, new AbortController().signal);
        expect(cold.provider.blockFor(restored.agent.id)).toBeUndefined();
        expect(after.map((event) => event.phase)).toEqual(["loaded", "committed"]);
        await restored.dispose();
    });
    it("refuses auxiliary requests without mutating a prepared binding", async () => {
        const f = await fixture();
        const handle = await f.make();
        const options = {
            provider: "acp-codex",
            model: "scripted-codex",
            sessionId: handle.agent.id,
            purpose: "compaction",
            system: "identity",
            messages: [
                createMessage({
                    role: "user",
                    source: { kind: "user" },
                    content: [{ type: "text", text: "input" }]
                })
            ]
        };
        await expect(Array.fromAsync(f.provider.stream(options))).rejects.toMatchObject({
            code: "ACP_CODEX_UNSUPPORTED_REQUEST"
        });
        expect(f.provider.blockFor(handle.agent.id)).toBeUndefined();
        const domain = f.ctx.storageDomain.get("convivium_acp_codex");
        expect([...domain.table("requests").entries()]).toEqual([]);
        await handle.dispose();
    });
    it("allows an owner-prepared cleanup Agent without opening an external session", async () => {
        const f = await fixture();
        const observed = [];
        f.ctx.on("convivium/acp-checkpoint", (event) => {
            observed.push(event);
        });
        const handle = await f.make("cleanup-only", "cleanup");
        expect(observed).toEqual([]);
        expect([
            ...f.ctx.storageDomain.get("convivium_acp_codex").table("bindings").entries()
        ]).toEqual([]);
        await handle.dispose();
    });
    it("does not commit a normal ACP stop without a durable DSH assistant receipt", async () => {
        const f = await fixture();
        const handle = await f.make();
        const chunks = await Array.fromAsync(
            f.provider.stream({
                provider: "acp-codex",
                model: "scripted-codex",
                sessionId: handle.agent.id,
                system: "reviewer identity",
                messages: [
                    createMessage({
                        role: "user",
                        source: { kind: "user" },
                        content: [{ type: "text", text: "direct input" }]
                    })
                ]
            })
        );
        expect(
            chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.text)
        ).toEqual(["scripted result"]);
        expect(
            chunks.some((chunk) => chunk.type === "usage" || chunk.type === "reasoning-delta")
        ).toBe(false);
        await expect(
            f.provider.checkpoint(handle.agent.id, new AbortController().signal)
        ).rejects.toMatchObject({ code: "ACP_CODEX_RECOVERY_REQUIRED" });
        expect(f.provider.blockFor(handle.agent.id)?.code).toBe("ACP_CODEX_RECOVERY_REQUIRED");
        await handle.dispose();
    });

    it("does not send a prompt while the binding durability barrier is held", async () => {
        const f = await fixture();
        const table = f.ctx.storageDomain.get("convivium_acp_codex").table("bindings");
        let enter;
        let release;
        const entered = new Promise((resolve) => {
            enter = resolve;
        });
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        const original = table.put.bind(table);
        vi.spyOn(table, "put").mockImplementationOnce(async (...args) => {
            enter();
            await gate;
            await original(...args);
        });
        const created = f.make();
        await entered;
        try {
            const calls = (await readFile(join(f.root, "scripted-rpc.jsonl"), "utf8"))
                .trim()
                .split("\n")
                .map(JSON.parse);
            expect(calls.some((entry) => entry.method === "session/prompt")).toBe(false);
            expect([...table.entries()]).toEqual([]);
        } finally {
            release();
        }
        const handle = await created;
        const closed = [];
        f.ctx.on("convivium/acp-checkpoint", (event) => {
            if (event.phase === "closed") {
                closed.push(event.sessionId);
            }
        });
        await handle.dispose();
        expect(closed).toEqual([handle.agent.id]);
    });
    it("projects supplied usage without inventing missing counters", async () => {
        const f = await fixture();
        const handle = await f.make();
        handle.agent.followup(
            createMessage({
                role: "user",
                source: { kind: "user" },
                content: [{ type: "text", text: "usage counters" }]
            })
        );
        await handle.agent.whenIdle();
        await f.provider.checkpoint(handle.agent.id, new AbortController().signal);
        const stored = await f.ctx.sessionPersistence.open(handle.agent.id, "read");
        try {
            const records = (await stored.read()).events;
            const receipt = records.find((event) => event.type === "assistant/message");
            expect(receipt?.data.usage).toEqual({
                inputTokens: 7,
                outputTokens: 3,
                totalTokens: 13,
                cacheReadTokens: 2,
                cacheWriteTokens: 1,
                reasoningTokens: 1
            });
        } finally {
            await stored.close();
        }
        await handle.dispose();
    });
    it("prepares a trusted fresh child with the inherited Preset and stopping that child leaves its parent usable", async () => {
        const f = await fixture();
        const parent = await f.make();
        const events = [];
        f.ctx.on("convivium/acp-checkpoint", (event) => {
            events.push(event);
        });
        const worker = await f.ctx.agents.create({
            sessionId: SessionId("worker"),
            parentAgent: parent.agent,
            meta: { cwd: f.root, parentSession: parent.agent.id, agentPreset: "acp" },
            agentOptions: parent.agent.options,
            setup: async (scope) => {
                f.ctx.agentPresets.composeFrom(scope, parent.agent.ctx);
            }
        });
        expect(events.map((event) => [event.phase, event.sessionId, event.rootSessionId])).toEqual([
            ["bound", worker.agent.id, parent.agent.id]
        ]);
        await f.provider.stopSession(worker.agent.id);
        expect(
            events.filter((event) => event.phase === "closed").map((event) => event.sessionId)
        ).toEqual([worker.agent.id]);
        parent.agent.followup(
            createMessage({
                role: "user",
                source: { kind: "user" },
                content: [{ type: "text", text: "parent is still active" }]
            })
        );
        await parent.agent.whenIdle();
        await f.provider.checkpoint(parent.agent.id, new AbortController().signal);
        expect(f.provider.blockFor(parent.agent.id)).toBeUndefined();
        expect(
            events.some(
                (event) => event.phase === "committed" && event.sessionId === parent.agent.id
            )
        ).toBe(true);
        await worker.dispose();
        await parent.dispose();
    });
});
