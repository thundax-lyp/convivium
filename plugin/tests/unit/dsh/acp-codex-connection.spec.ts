import { Context } from "@deepseek-ai/cordis";
import LocalSubprocess from "@deepseek-ai/dsh-subprocess-local";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCodexAcpConnection } from "@/dsh/acp-codex/connection.ts";
const contexts: Context[] = [];
afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
});
const open = async (mode = "", signal = new AbortController().signal) => {
    const ctx = new Context();
    contexts.push(ctx);
    await ctx.plugin(LocalSubprocess);
    const updates = [];
    const config = {
        command: process.execPath,
        args: [
            fileURLToPath(new URL("../../fixtures/scripted-acp-agent.mjs", import.meta.url)),
            mode
        ]
    };
    const connection = await openCodexAcpConnection(
        ctx,
        config,
        process.cwd(),
        signal,
        async (update) => {
            updates.push(update);
        }
    );
    return { connection, updates };
};
describe("Codex ACP subprocess connection", () => {
    it("negotiates real NDJSON and delivers updates before normal stop", async () => {
        const { connection, updates } = await open();
        try {
            const session = await connection.client.newSession({
                cwd: process.cwd(),
                mcpServers: []
            });
            expect(session.sessionId).toBe("fresh");
            expect(
                await connection.client.prompt({
                    sessionId: session.sessionId,
                    prompt: [{ type: "text", text: "test" }]
                })
            ).toEqual({ stopReason: "end_turn" });
            expect(updates).toHaveLength(1);
            await expect(
                connection.client.loadSession({
                    sessionId: "saved",
                    cwd: process.cwd(),
                    mcpServers: []
                })
            ).resolves.toBeDefined();
        } finally {
            await connection.close();
        }
        expect(connection.client.signal.aborted).toBe(true);
    });
    it("cancels the original pending prompt and closes its process", async () => {
        const { connection } = await open("pending");
        const response = connection.client.prompt({
            sessionId: "fresh",
            prompt: [{ type: "text", text: "pending" }]
        });
        await connection.client.cancel({ sessionId: "fresh" });
        expect(await response).toEqual({ stopReason: "cancelled" });
        await connection.close();
        await connection.close();
        expect(connection.client.signal.aborted).toBe(true);
    });
    it.each(["no-load", "exit"])(
        "rejects incompatible capabilities or early process exit: %s",
        async (mode) => {
            await expect(open(mode)).rejects.toThrow();
        }
    );
    it("bounds initialization RPC and drains the process after timeout", async () => {
        const ctx = new Context();
        contexts.push(ctx);
        await ctx.plugin(LocalSubprocess);
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const config = {
            command: process.execPath,
            args: [
                fileURLToPath(new URL("../../fixtures/scripted-acp-agent.mjs", import.meta.url)),
                "hang"
            ]
        };
        const result = expect(
            openCodexAcpConnection(
                ctx,
                config,
                process.cwd(),
                new AbortController().signal,
                async () => {}
            )
        ).rejects.toMatchObject({ code: "ACP_CODEX_CONFIG_INVALID" });
        await vi.advanceTimersByTimeAsync(30000);
        await result;
    });
    it("closes on lifetime cancellation and rejects outstanding RPC", async () => {
        const control = new AbortController();
        const { connection } = await open("pending", control.signal);
        const response = expect(
            connection.client.prompt({
                sessionId: "fresh",
                prompt: [{ type: "text", text: "pending" }]
            })
        ).rejects.toThrow();
        control.abort();
        await response;
        await connection.close();
        expect(connection.client.signal.aborted).toBe(true);
    });
    it("rejects a broken stdin pipe without an unhandled stream error", async () => {
        const ctx = new Context();
        contexts.push(ctx);
        await ctx.plugin(LocalSubprocess);
        const spawn = ctx.subprocess.spawn.bind(ctx.subprocess);
        vi.spyOn(ctx.subprocess, "spawn").mockImplementation((spec) => ({
            ...spawn(spec),
            stdin: new Writable({
                write: (_chunk, _encoding, callback) => {
                    callback(Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
                }
            })
        }));
        await expect(
            openCodexAcpConnection(
                ctx,
                { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] },
                process.cwd(),
                new AbortController().signal,
                async () => {}
            )
        ).rejects.toThrow();
    });
});
