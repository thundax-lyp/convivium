import { describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

const spec = storageDomain.defineDomain({
    name: "convivium_provider_test",
    version: 1,
    tables: { records: storageDomain.domainTable<string, number>(z.number()) }
});

describe("Storage provider composition", () => {
    it("gates consumers on provider availability and preserves confirmed writes after explicit close", async () => {
        const directory = await mkdtemp(join(tmpdir(), "convivium-provider-"));
        const contexts: Context[] = [];
        const domains: Array<{ close(): Promise<void> }> = [];
        const path = join(directory, "storage.sqlite");
        try {
            const ctx = new Context();
            contexts.push(ctx);
            await ctx.plugin(Storage);
            await ctx.plugin(
                {
                    name: storageDomain.name,
                    inject: storageDomain.inject,
                    apply: storageDomain.apply
                },
                { backend: "sqlite" }
            );
            let active = false;
            let domain: Awaited<ReturnType<typeof ctx.storageDomain.open<typeof spec>>> | undefined;
            await ctx.plugin({
                name: "provider-test-consumer",
                inject: ["storageDomain"],
                async apply(consumer: Context) {
                    domain = await consumer.storageDomain.open(spec);
                    const handle = domain;
                    domains.push(handle);
                    consumer.effect(() => {
                        active = true;
                        return async () => {
                            active = false;
                            await handle.close();
                        };
                    });
                }
            });
            expect(active).toBe(false);
            expect(domain).toBeUndefined();
            const provider = ctx.plugin(storageSqlite, { path, journalMode: "wal" });
            await provider;
            await vi.waitFor(() => expect(active).toBe(true));
            await domain!.table("records").put("retained", 1);
            await domain!.table("records").put("deleted", 2);
            expect(await domain!.table("records").delete("deleted")).toBe(true);
            expect(domain!.table("records").get("retained")).toBe(1);
            expect(domain!.table("records").get("deleted")).toBeUndefined();
            await domain!.close();
            await provider.dispose();
            expect(active).toBe(false);
            await expect(domain!.table("records").put("after-close", 3)).rejects.toThrow();
            await ctx.fiber.dispose();

            const reopened = new Context();
            contexts.push(reopened);
            await reopened.plugin(Storage);
            await reopened.plugin(storageSqlite, { path, journalMode: "wal" });
            await reopened.plugin(
                {
                    name: storageDomain.name,
                    inject: storageDomain.inject,
                    apply: storageDomain.apply
                },
                { backend: "sqlite" }
            );
            const recovered = await reopened.storageDomain.open(spec);
            domains.push(recovered);
            expect([...recovered.table("records").entries()]).toEqual([["retained", 1]]);
            await recovered.close();
        } finally {
            for (const domain of domains.reverse()) await domain.close();
            for (const ctx of contexts.reverse()) await ctx.fiber.dispose();
            await rm(directory, { recursive: true, force: true });
        }
    });
});
