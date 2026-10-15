import { Context } from "@deepseek-ai/cordis";
import {
    mountAgentLoopTestDependencies,
    mountAgentLoopTestHarness
} from "@deepseek-ai/dsh-agent-loop-testkit";
import { SessionId } from "@deepseek-ai/dsh-session";
import SessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { createMessage } from "@deepseek-ai/dsh-llm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCodexToolBridge } from "@/dsh/acp-codex/tool-bridge.ts";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const clean of cleanups.splice(0).reverse()) {
        await clean();
    }
});
const fixture = async () => {
    const ctx = new Context();
    const root = await mkdtemp(join(tmpdir(), "acp-tools-"));
    cleanups.push(async () => {
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    });
    await mountAgentLoopTestDependencies(ctx);
    await ctx.plugin(SessionPersistence, { root, compression: "none" });
    const harness = await mountAgentLoopTestHarness(ctx);
    const agent = await harness.create(SessionId("acp-tool-agent"), {}, { cwd: root });
    const results = [];
    ctx.on("tools/result", (exec, result) => {
        results.push({ name: exec.name, value: result.value });
    });
    const context = createMessage({
        role: "user",
        source: { kind: "user" },
        content: [{ type: "text", text: "next context" }]
    });
    let blocked = false;
    const calls = vi.fn(async (_args, exec) => {
        expect(exec.agent).toBe(agent);
        return { answer: "ok" };
    });
    ctx.tools.register({
        name: "read",
        description: "read",
        parameters: { type: "object", properties: {} },
        output: {
            schema: { type: "object" },
            render: () => [{ type: "text", text: "read result" }]
        },
        execute: calls
    });
    ctx.tools.register({
        name: "structured_output",
        description: "structured_output",
        parameters: { type: "object", properties: {} },
        output: { schema: { type: "object" }, render: () => [] },
        execute: async (_args, exec) => {
            exec.deferContext(context);
            exec.concludeTurn();
            return { finished: true };
        }
    });
    const unsafe = vi.fn(async () => {
        blocked = true;
    });
    const bridge = await openCodexToolBridge({
        agent,
        signal: new AbortController().signal,
        isBlocked: () => blocked,
        onUnsafeSettlement: unsafe
    });
    cleanups.push(() => bridge.close());
    const headers = {
        Authorization: bridge.mcpServer.headers[0].value,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25"
    };
    const post = async (id: number, method: string, params = {}, patch = {}) => {
        const response = await fetch(bridge.mcpServer.url, {
            method: "POST",
            headers: { ...headers, ...patch },
            body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : undefined };
    };
    const activate = (requestId = "req", tools = ctx.tools.schemas(agent)) =>
        bridge.setRequest({ requestId, tools, signal: new AbortController().signal });
    return {
        ctx,
        agent,
        harness,
        context,
        bridge,
        post,
        activate,
        calls,
        unsafe,
        results,
        block: () => {
            blocked = true;
        }
    };
};
describe("Codex Session MCP tool bridge", () => {
    it("discovers scoped tools with the official MCP client and binds execution to the real Agent", async () => {
        const f = await fixture();
        const client = new Client({ name: "test", version: "1" });
        await client.connect(
            new StreamableHTTPClientTransport(new URL(f.bridge.mcpServer.url), {
                requestInit: { headers: { Authorization: f.bridge.mcpServer.headers[0].value } }
            })
        );
        cleanups.push(() => client.close());
        expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
            "read",
            "structured_output"
        ]);
        expect((await client.callTool({ name: "read", arguments: {} })).isError).toBe(true);
        f.activate();
        expect(await client.callTool({ name: "read", arguments: {} })).toMatchObject({
            isError: false,
            structuredContent: { answer: "ok" }
        });
        expect(f.calls).toHaveBeenCalledOnce();
    });
    it("executes a repeated RPC only once and rejects different arguments or narrowed scope", async () => {
        const f = await fixture();
        f.activate(
            "req",
            f.ctx.tools.schemas(f.agent).filter((tool) => tool.name === "read")
        );
        const first = await f.post(17, "tools/call", { name: "read", arguments: {} });
        expect(first.body.result).toMatchObject({ isError: false });
        expect((await f.post(17, "tools/call", { name: "read", arguments: {} })).body).toEqual(
            first.body
        );
        expect(
            (await f.post(17, "tools/call", { name: "read", arguments: { changed: true } })).body
        ).toHaveProperty("error");
        expect(
            (await f.post(18, "tools/call", { name: "structured_output", arguments: {} })).body
                .result.isError
        ).toBe(true);
        f.agent.ctx.tools.restrict({ allow: [] });
        expect(
            (await f.post(19, "tools/call", { name: "read", arguments: {} })).body.result.isError
        ).toBe(true);
        expect(f.calls).toHaveBeenCalledOnce();
    });
    it("keeps original additional-context IDs once and forbids side effects after concludesTurn", async () => {
        const f = await fixture();
        f.activate();
        const result = await f.post(20, "tools/call", { name: "structured_output", arguments: {} });
        expect(result.body.result.structuredContent).toEqual({ finished: true });
        expect(f.results).toEqual([{ name: "structured_output", value: { finished: true } }]);
        expect(JSON.stringify(result.body)).not.toContain("next context");
        expect(f.harness.claim(f.agent, "next-step", 1).map((message) => message.id)).toEqual([
            f.context.id
        ]);
        expect(
            (await f.post(21, "tools/call", { name: "read", arguments: {} })).body.result.isError
        ).toBe(true);
        expect(f.calls).not.toHaveBeenCalled();
    });
    it("keeps separate Session bridges independent and rejects cross-Session tokens", async () => {
        const first = await fixture();
        const second = await fixture();
        first.activate();
        second.activate();
        let begin: () => void;
        let release: () => void;
        const started = new Promise<void>((resolve) => {
            begin = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        first.calls.mockImplementation(async () => {
            begin();
            await gate;
            return { answer: "ok" };
        });
        const pending = first.post(1, "tools/call", { name: "read", arguments: {} });
        await started;
        try {
            expect(
                (await second.post(2, "tools/call", { name: "read", arguments: {} })).body.result
                    .isError
            ).toBe(false);
            expect(
                (
                    await second.post(
                        3,
                        "tools/list",
                        {},
                        { Authorization: first.bridge.mcpServer.headers[0].value }
                    )
                ).status
            ).toBe(401);
        } finally {
            release();
            await pending;
        }
    });
    it("cancels and drains an active tool before closing the endpoint", async () => {
        const f = await fixture();
        f.activate();
        let begin: () => void;
        const started = new Promise<void>((resolve) => {
            begin = resolve;
        });
        f.calls.mockImplementation(async (_args, exec) => {
            begin();
            await new Promise<void>((resolve) => {
                exec.signal.addEventListener("abort", () => resolve(), { once: true });
            });
            return { answer: "cancelled" };
        });
        const pending = f
            .post(44, "tools/call", { name: "read", arguments: {} })
            .catch(() => undefined);
        await started;
        await f.bridge.close();
        await pending;
        expect(f.calls).toHaveBeenCalledOnce();
        expect(f.unsafe).toHaveBeenCalled();
        await expect(f.post(45, "tools/list")).rejects.toThrow();
    });
    it("blocks unsafe settlement when additional-context persistence fails", async () => {
        const f = await fixture();
        f.activate();
        vi.spyOn(f.ctx.sessions, "flush").mockResolvedValue(false);
        expect(
            (await f.post(1, "tools/call", { name: "structured_output", arguments: {} })).body
        ).toHaveProperty("error");
        expect(f.unsafe).toHaveBeenCalledOnce();
        expect(
            (await f.post(2, "tools/call", { name: "read", arguments: {} })).body.result.isError
        ).toBe(true);
        expect(f.calls).not.toHaveBeenCalled();
    });
    it("rejects bad credentials, origin, root blocking and oversized bodies before tool execution", async () => {
        const f = await fixture();
        f.activate();
        expect((await f.post(1, "tools/list", {}, { Authorization: "Bearer other" })).status).toBe(
            401
        );
        expect(
            (await f.post(1, "tools/list", {}, { Origin: "https://external.example" })).status
        ).toBe(403);
        const oversized = await fetch(f.bridge.mcpServer.url, {
            method: "POST",
            headers: { Authorization: f.bridge.mcpServer.headers[0].value },
            body: "x".repeat(1048577)
        });
        expect(oversized.status).toBe(413);
        f.block();
        expect(
            (await f.post(2, "tools/call", { name: "read", arguments: {} })).body.result.isError
        ).toBe(true);
        expect(f.calls).not.toHaveBeenCalled();
    });
});
