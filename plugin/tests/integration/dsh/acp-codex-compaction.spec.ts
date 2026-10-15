import { Context } from "@deepseek-ai/cordis";
import {
    mountAgentLoopTestDependencies,
    mountAgentLoopTestHarness
} from "@deepseek-ai/dsh-agent-loop-testkit";
import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import { SessionId, SessionSeq } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it, vi } from "vitest";
import CodexCompactionBoundary from "@/dsh/acp-codex/compaction.ts";

const contexts: Context[] = [];
afterEach(async () => {
    vi.restoreAllMocks();
    for (const ctx of contexts.splice(0).reverse()) {
        await ctx.fiber.dispose();
    }
});
const fixture = async () => {
    const ctx = new Context();
    contexts.push(ctx);
    await mountAgentLoopTestDependencies(ctx);
    const meter = vi.fn(() => {
        throw new Error("ACP must not measure or mutate history");
    });
    ctx.provide("tokenMeter", { measure: meter, surface: meter });
    const harness = await mountAgentLoopTestHarness(ctx);
    const root = await harness.create(
        SessionId("root"),
        { provider: "acp-codex", model: "codex" },
        { cwd: process.cwd() }
    );
    const worker = await ctx.agents.create({
        sessionId: SessionId("worker"),
        parentAgent: root,
        meta: { cwd: process.cwd(), parentSession: root.id },
        agentOptions: { provider: "acp-codex", model: "codex" }
    });
    const native = await harness.create(
        SessionId("native"),
        { provider: "native", model: "model" },
        { cwd: process.cwd() }
    );
    let boundary: CodexCompactionBoundary;
    const isolated = ctx.isolate("compaction");
    await isolated.plugin(CodexCompactionBoundary);
    await isolated.inject(["compaction"], (scope) => {
        boundary = scope.compaction;
    });
    return { ctx, root, worker: worker.agent, native, boundary: boundary!, meter };
};
describe("Preset compaction boundary", () => {
    it("skips both ACP pressure triggers and rejects explicit root/worker compaction before writes", async () => {
        const f = await fixture();
        const signal = new AbortController().signal;
        const summary = vi.spyOn(BasicCompactionEngine.prototype, "compactNow");
        for (const agent of [f.root, f.worker]) {
            const count = agent.session.seq;
            expect(await f.boundary.compactIfNeeded(agent, "pressure", signal)).toBeNull();
            expect(await f.boundary.compactIfNeeded(agent, "context-overflow", signal)).toBeNull();
            await expect(f.boundary.compactNow(agent, signal)).rejects.toMatchObject({
                code: "ACP_CODEX_UNSUPPORTED_REQUEST"
            });
            await expect(
                f.boundary.compactRegion(SessionSeq(0), SessionSeq(1), agent, signal)
            ).rejects.toMatchObject({ code: "ACP_CODEX_UNSUPPORTED_REQUEST" });
            expect(agent.session.seq).toBe(count);
        }
        expect(summary).not.toHaveBeenCalled();
        expect(f.meter).not.toHaveBeenCalled();
    });
    it("delegates all non-ACP calls with their original arguments and result", async () => {
        const f = await fixture();
        const signal = new AbortController().signal;
        const automatic = vi
            .spyOn(BasicCompactionEngine.prototype, "compactIfNeeded")
            .mockResolvedValue(null);
        const manual = vi
            .spyOn(BasicCompactionEngine.prototype, "compactNow")
            .mockResolvedValue(null);
        const failure = new Error("original region error");
        const region = vi
            .spyOn(BasicCompactionEngine.prototype, "compactRegion")
            .mockRejectedValue(failure);
        expect(await f.boundary.compactIfNeeded(f.native, "pressure", signal)).toBeNull();
        expect(await f.boundary.compactNow(f.native, signal)).toBeNull();
        await expect(
            f.boundary.compactRegion(SessionSeq(2), SessionSeq(3), f.native, signal)
        ).rejects.toBe(failure);
        expect(automatic).toHaveBeenCalledExactlyOnceWith(f.native, "pressure", signal);
        expect(manual).toHaveBeenCalledExactlyOnceWith(f.native, signal);
        expect(region).toHaveBeenCalledExactlyOnceWith(
            SessionSeq(2),
            SessionSeq(3),
            f.native,
            signal
        );
    });
    it("mounts two isolated backends and dispatches the automatic hook through the override", async () => {
        const f = await fixture();
        await f.ctx.isolate("compaction").plugin(CodexCompactionBoundary);
        const automatic = vi
            .spyOn(BasicCompactionEngine.prototype, "compactIfNeeded")
            .mockResolvedValue(null);
        const done = vi.fn(async () => ({ kind: "continue" }));
        await f.ctx.waterfall(
            "agent/pre-step",
            { agent: f.root, turn: 1, step: 1, signal: new AbortController().signal },
            done
        );
        expect(done).toHaveBeenCalled();
        expect(automatic.mock.calls.length).toBe(0);
    });
});
