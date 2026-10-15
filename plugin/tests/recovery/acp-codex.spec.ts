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
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexAcpProvider } from "@/dsh/acp-codex/provider.ts";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    const failures = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
        try {
            await cleanup();
        } catch (cause) {
            failures.push(cause);
        }
    }
    vi.unstubAllEnvs();
    if (failures.length) {
        throw new AggregateError(failures, "Recovery fixture cleanup failed");
    }
});
const fixture = async (existingRoot?: string, extraArgs: string[] = []) => {
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
    await ctx.plugin(Loader, { baseUrl: new URL("../../", import.meta.url).href });
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
    const script = fileURLToPath(new URL("../fixtures/scripted-acp-agent.mjs", import.meta.url));
    vi.stubEnv("CODEX_PATH", script);
    vi.stubEnv("CODEX_HOME", root);
    const provider = await createCodexAcpProvider(ctx, {
        command: process.execPath,
        args: [script, "provider", ...extraArgs]
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
    const resume = (id = "test", purpose = "delivery") =>
        ctx.agents.resume({
            resumeSessionId: SessionId(id),
            agentOptions,
            setup: setup(purpose)
        });
    const calls = async () =>
        (await readFile(join(root, "scripted-rpc.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .map(JSON.parse);
    const fault = (value: string) => writeFile(join(root, "scripted-fault"), value);
    const requests = () =>
        [...ctx.storageDomain.get("convivium_acp_codex").table("requests").entries()].map(
            ([, value]) => value
        );
    return { ctx, root, provider, make, resume, calls, fault, requests };
};

const user = (text = "original input") =>
    createMessage({ role: "user", source: { kind: "user" }, content: [{ type: "text", text }] });
const input = (agent, message = user()) => ({
    provider: "acp-codex",
    model: "scripted-codex",
    sessionId: agent.id,
    system: "reviewer identity",
    messages: [message]
});
const signal = () => new AbortController().signal;

describe("ACP durable recovery gates", () => {
    it.each([true, false])(
        "fails closed before sending and after restart when sending persistence fails (delivery=%s)",
        async (tracked) => {
            const f = await fixture();
            const handle = await f.make();
            const message = user();
            if (tracked) {
                await f.provider.beginDelivery({
                    sessionId: handle.agent.id,
                    deliveryId: message.id,
                    text: "original input"
                });
            }
            vi.spyOn(
                f.ctx.storageDomain.get("convivium_acp_codex").table("requests"),
                "put"
            ).mockRejectedValueOnce(new Error("sending persistence failed"));
            handle.agent.followup(message);
            await handle.agent.whenIdle();
            expect(f.requests()).toEqual([]);
            expect(
                (await f.calls()).filter((call) => call.method === "session/prompt")
            ).toHaveLength(0);
            await expect(
                f.provider.prepareCall("acp-codex", "scripted-codex")
            ).rejects.toMatchObject({
                code: "ACP_CODEX_RECOVERY_REQUIRED"
            });
            await handle.dispose();
            await f.provider.close();
            const cold = await fixture(f.root);
            let failure;
            try {
                const unexpected = await cold.resume();
                await unexpected.dispose();
            } catch (cause) {
                failure = cause;
            }
            expect(failure?.code).toBe("ACP_CODEX_RECOVERY_REQUIRED");
            expect(
                (await cold.calls()).filter((call) => call.method === "session/prompt")
            ).toHaveLength(0);
        }
    );
    it("recovers a sending gate after the external process exits even if the later block write was lost", async () => {
        const f = await fixture();
        const handle = await f.make();
        const bindings = f.ctx.storageDomain.get("convivium_acp_codex").table("bindings");
        const blockedWrite = vi
            .spyOn(bindings, "put")
            .mockRejectedValueOnce(new Error("crash before block durability"));
        await f.fault("kill-after-prompt");
        const message = user();
        await f.provider.beginDelivery({
            sessionId: handle.agent.id,
            deliveryId: message.id,
            text: "original input"
        });
        handle.agent.followup(message);
        await f.provider.markDeliveryQueued(handle.agent.id, message.id);
        await handle.agent.whenIdle();
        expect(f.requests().map((request) => request.phase)).toEqual(["sending"]);
        expect(bindings.get(handle.agent.id).state).toBe("ready");
        expect(f.provider.blockFor(handle.agent.id)?.code).toBe("ACP_CODEX_OUTCOME_UNKNOWN");
        blockedWrite.mockRestore();
        await handle.dispose();
        await f.provider.close();
        const cold = await fixture(f.root);
        await expect(cold.resume()).rejects.toMatchObject({ code: "ACP_CODEX_OUTCOME_UNKNOWN" });
        expect(cold.provider.blockFor("test")?.code).toBe("ACP_CODEX_OUTCOME_UNKNOWN");
        expect(
            (await cold.calls()).filter((call) => call.method === "session/prompt")
        ).toHaveLength(1);
        expect((await cold.calls()).filter((call) => call.method === "session/load")).toHaveLength(
            0
        );
    });
    it("blocks responded without a native receipt across a fresh Host instead of replaying its input", async () => {
        const f = await fixture();
        const handle = await f.make();
        await Array.fromAsync(f.provider.stream(input(handle.agent)));
        expect(f.requests().map((request) => request.phase)).toEqual(["responded"]);
        await handle.dispose();
        await f.provider.close();
        const cold = await fixture(f.root);
        await expect(cold.resume()).rejects.toMatchObject({ code: "ACP_CODEX_RECOVERY_REQUIRED" });
        expect(
            (await cold.calls()).filter((call) => call.method === "session/prompt")
        ).toHaveLength(1);
    });
    it("commits a flushed receipt and completes the original queued delivery without a second prompt", async () => {
        const f = await fixture();
        const handle = await f.make();
        const message = user();
        await f.provider.beginDelivery({
            sessionId: handle.agent.id,
            deliveryId: message.id,
            text: "original input"
        });
        const checkpoint = vi.spyOn(f.provider, "checkpoint").mockResolvedValue(undefined);
        handle.agent.followup(message);
        await f.provider.markDeliveryQueued(handle.agent.id, message.id);
        await handle.agent.whenIdle();
        expect(await f.ctx.sessions.flush(handle.agent.session)).toBe(true);
        expect(f.requests().map((request) => request.phase)).toEqual(["responded"]);
        checkpoint.mockRestore();
        await handle.dispose();
        await f.provider.close();
        const cold = await fixture(f.root);
        const events = [];
        cold.ctx.on("convivium/acp-checkpoint", (event) => {
            events.push(event.phase);
        });
        const resumed = await cold.resume();
        expect(cold.requests().map((request) => request.phase)).toEqual(["committed"]);
        expect(cold.provider.deliveryState("test", message.id)).toBe("completed");
        expect(events).toEqual(["committed", "delivery-completed", "loaded"]);
        await cold.provider.beginDelivery({
            sessionId: "test",
            deliveryId: message.id,
            text: "original input"
        });
        await expect(
            cold.provider.beginDelivery({
                sessionId: "test",
                deliveryId: message.id,
                text: "changed"
            })
        ).rejects.toMatchObject({ code: "ACP_CODEX_DELIVERY_CONFLICT" });
        expect(cold.provider.blockFor("test")).toBeUndefined();
        expect(
            (await cold.calls()).filter((call) => call.method === "session/prompt")
        ).toHaveLength(1);
        await resumed.dispose();
    });
    it.each(["load-fail", "fingerprint"])(
        "rejects %s without creating a replacement binding",
        async (failure) => {
            const f = await fixture();
            const handle = await f.make();
            handle.agent.followup(user());
            await handle.agent.whenIdle();
            await f.provider.checkpoint(handle.agent.id, signal());
            await handle.dispose();
            await f.provider.close();
            if (failure === "load-fail") {
                await f.fault("load-fail");
            }
            const cold = await fixture(f.root, failure === "fingerprint" ? ["changed-launch"] : []);
            await expect(cold.resume()).rejects.toMatchObject({
                code: "ACP_CODEX_RECOVERY_REQUIRED"
            });
            expect(
                (await cold.calls()).filter(
                    (call) => call.method === "session/new" && call.mcpCount === 1
                )
            ).toHaveLength(1);
            expect(
                (await cold.calls()).filter((call) => call.method === "session/prompt")
            ).toHaveLength(1);
        }
    );
    it("cancels only the worker subtree, persists the root block and leaves other roots usable", async () => {
        const f = await fixture();
        const parent = await f.make();
        parent.agent.followup(user("initial parent input"));
        await parent.agent.whenIdle();
        await f.provider.checkpoint(parent.agent.id, signal());
        const other = await f.make("other");
        const worker = await f.ctx.agents.create({
            sessionId: SessionId("worker"),
            parentAgent: parent.agent,
            meta: { cwd: f.root, parentSession: parent.agent.id, agentPreset: "acp" },
            agentOptions: parent.agent.options,
            setup: async (scope) => {
                f.ctx.agentPresets.composeFrom(scope, parent.agent.ctx);
            }
        });
        const closed = [];
        f.ctx.on("convivium/acp-checkpoint", (event) => {
            if (event.phase === "closed") {
                closed.push(event.sessionId);
            }
        });
        await f.fault("pending");
        worker.agent.followup(user("worker input"));
        await vi.waitFor(
            async () => {
                expect(
                    (await f.calls()).filter((call) => call.method === "session/prompt")
                ).toHaveLength(2);
            },
            { timeout: 5000 }
        );
        await f.provider.stopSession(worker.agent.id);
        await worker.agent.whenIdle();
        expect(closed).toEqual([worker.agent.id]);
        expect((await f.calls()).filter((call) => call.method === "session/cancel")).toHaveLength(
            1
        );
        expect(f.provider.blockFor(parent.agent.id)?.code).toBe("ACP_CODEX_OUTCOME_UNKNOWN");
        expect(f.ctx.agents.get(parent.agent.id)).toBe(parent.agent);
        expect(f.provider.blockFor(other.agent.id)).toBeUndefined();
        await rm(join(f.root, "scripted-fault"));
        other.agent.followup(user("other root input"));
        await other.agent.whenIdle();
        await f.provider.checkpoint(other.agent.id, signal());
        expect(f.provider.blockFor(other.agent.id)).toBeUndefined();
        await worker.dispose();
        await other.dispose();
        await parent.dispose();
        await f.provider.close();
        const cold = await fixture(f.root);
        await expect(cold.resume()).rejects.toMatchObject({ code: "ACP_CODEX_OUTCOME_UNKNOWN" });
        expect(cold.ctx.agents.get(SessionId("worker"))).toBeUndefined();
        expect(
            (await cold.calls()).filter((call) => call.method === "session/prompt")
        ).toHaveLength(3);
    });
    it("reconciles a flushed old-worker receipt without reviving that worker or blocking its clean root", async () => {
        const f = await fixture();
        const parent = await f.make();
        parent.agent.followup(user("parent input"));
        await parent.agent.whenIdle();
        await f.provider.checkpoint(parent.agent.id, signal());
        const worker = await f.ctx.agents.create({
            sessionId: SessionId("worker"),
            parentAgent: parent.agent,
            meta: { cwd: f.root, parentSession: parent.agent.id, agentPreset: "acp" },
            agentOptions: parent.agent.options,
            setup: async (scope) => {
                f.ctx.agentPresets.composeFrom(scope, parent.agent.ctx);
            }
        });
        const original = f.provider.checkpoint.bind(f.provider);
        const checkpoint = vi
            .spyOn(f.provider, "checkpoint")
            .mockImplementation((id, sig) =>
                id === worker.agent.id ? Promise.resolve() : original(id, sig)
            );
        worker.agent.followup(user("worker input"));
        await worker.agent.whenIdle();
        expect(await f.ctx.sessions.flush(worker.agent.session)).toBe(true);
        expect(f.requests().find((request) => request.sessionId === worker.agent.id).phase).toBe(
            "responded"
        );
        checkpoint.mockRestore();
        await worker.dispose();
        await parent.dispose();
        await f.provider.close();
        const cold = await fixture(f.root);
        const resumed = await cold.resume();
        expect(cold.provider.blockFor(parent.agent.id)).toBeUndefined();
        expect(cold.requests().every((request) => request.phase === "committed")).toBe(true);
        expect(cold.ctx.agents.get(SessionId("worker"))).toBeUndefined();
        expect((await cold.calls()).filter((call) => call.method === "session/load")).toHaveLength(
            1
        );
        expect(
            (await cold.calls()).filter((call) => call.method === "session/prompt")
        ).toHaveLength(2);
        await resumed.dispose();
    });
});
