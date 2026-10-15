import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as Domains from "@deepseek-ai/dsh-storage-domain";
import * as Sqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCodexAcpStore } from "@/dsh/acp-codex/store.ts";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
        await cleanup();
    }
});
const fixture = async () => {
    const directory = await mkdtemp(join(tmpdir(), "acp-store-"));
    const path = join(directory, "storage.sqlite");
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const mount = async () => {
        const ctx = new Context();
        cleanups.push(() => ctx.fiber.dispose());
        await ctx.plugin(Storage);
        await ctx.plugin(Sqlite, { path });
        await ctx.plugin(Domains, { backend: "sqlite" });
        return ctx;
    };
    const ctx = await mount();
    return { ctx, mount };
};
const bound = {
    sessionId: "session",
    rootSessionId: "session",
    acpSessionId: "remote",
    cwd: process.cwd(),
    launchFingerprint: "a".repeat(64),
    provider: "acp-codex" as const,
    model: "codex",
    state: "ready" as const,
    createdAt: 1,
    updatedAt: 1
};
const sent = {
    requestId: "request",
    sessionId: "session",
    rootSessionId: "session",
    inputMessageIds: ["message"],
    prefixMessageIds: ["message"],
    prefixSha256: "b".repeat(64),
    phase: "sending" as const,
    startedAt: 1
};
const admitted = {
    sessionId: "session",
    deliveryId: "delivery",
    textSha256: "c".repeat(64),
    state: "admitting" as const,
    createdAt: 1,
    updatedAt: 1
};
describe("Codex ACP technical Storage Domain", () => {
    it("durably reopens all three records and returns detached immutable snapshots", async () => {
        const f = await fixture();
        const store = await openCodexAcpStore(f.ctx);
        await store.putBinding(bound);
        await store.putRequest(sent);
        await store.putDelivery(admitted);
        expect(Object.isFrozen(store.request("request")?.inputMessageIds)).toBe(true);
        await store.close();
        await f.ctx.fiber.dispose();
        const recovered = await openCodexAcpStore(await f.mount());
        cleanups.push(() => recovered.close());
        expect(recovered.binding("session")).toEqual(bound);
        expect(recovered.requests("session")).toEqual([sent]);
        expect(recovered.deliveries("session")).toEqual([admitted]);
        expect(() => {
            recovered.requests("session").push(sent);
        }).toThrow();
    });
    it("rejects invalid phases, fields and conflicting delivery bodies without overwriting durable values", async () => {
        const f = await fixture();
        const store = await openCodexAcpStore(f.ctx);
        cleanups.push(() => store.close());
        await store.putDelivery(admitted);
        await expect(
            store.putDelivery({ ...admitted, textSha256: "d".repeat(64) })
        ).rejects.toMatchObject({ code: "ACP_CODEX_DELIVERY_CONFLICT" });
        await expect(store.putBinding({ ...bound, acpSessionId: undefined })).rejects.toThrow();
        await expect(store.putBinding({ ...bound, state: "blocked" })).rejects.toThrow();
        await expect(store.putRequest({ ...sent, phase: "committed" })).rejects.toThrow();
        await expect(store.putRequest({ ...sent, unexpected: true })).rejects.toThrow();
        expect(store.binding("session")).toBeUndefined();
        expect(store.requests("session")).toEqual([]);
        expect(store.delivery("session", "delivery")).toEqual(admitted);
    });
    it("rejects corrupted stored records instead of skipping them", async () => {
        const f = await fixture();
        const store = await openCodexAcpStore(f.ctx);
        await store.close();
        const raw = await f.ctx.storage.backend
            .get("sqlite")
            .kv.open({
                name: "convivium_acp_codex",
                version: 1,
                tables: ["bindings", "requests", "deliveries"],
                hasGlobal: false
            });
        await raw.putRecord("bindings", "damaged", { invalid: true });
        await raw.close();
        await expect(openCodexAcpStore(f.ctx)).rejects.toMatchObject({ code: "invalid-record" });
    });
    it("does not publish a failed write in memory and drains writes before close", async () => {
        const f = await fixture();
        const store = await openCodexAcpStore(f.ctx);
        const table = f.ctx.storageDomain.get("convivium_acp_codex").table("bindings");
        vi.spyOn(table, "put").mockRejectedValueOnce(new Error("durability failure"));
        await expect(store.putBinding(bound)).rejects.toThrow("durability failure");
        expect(store.binding("session")).toBeUndefined();
        const write = store.putBinding(bound);
        const close = store.close();
        await write;
        await close;
        await expect(store.putBinding(bound)).rejects.toThrow();
        await f.ctx.fiber.dispose();
        const recovered = await openCodexAcpStore(await f.mount());
        cleanups.push(() => recovered.close());
        expect(recovered.binding("session")).toEqual(bound);
    });
});
