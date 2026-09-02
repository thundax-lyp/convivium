import { describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { JsonlStorageBackend, jsonlStoragePlugin } from "../../../src/storage/index.js";

const spec = defineDomain({
    name: "convivium_storage_child_test",
    version: 1,
    tables: { records: domainTable<string, number>(z.number()) }
});

async function rootWithConsumer(
    rootPath: string,
    lifecycle: string[],
    action: (ctx: Context) => Promise<void>
) {
    const root = new Context();
    await root.plugin(Storage);
    await root.plugin(
        {
            name: storageDomain.name,
            inject: storageDomain.inject,
            apply: storageDomain.apply
        },
        { backend: "convivium-jsonl" }
    );
    await root.plugin({
        name: "convivium-storage-child-test",
        apply: async (ctx: Context) => {
            await ctx.plugin(jsonlStoragePlugin, { root: join(rootPath, "storage") });
            await new Promise<void>((resolve, reject) => {
                ctx.inject(["storageDomain"], async (consumer) => {
                    try {
                        await action({
                            ...consumer,
                            storageDomain: new Proxy(consumer.storageDomain, {
                                get(target, property, receiver) {
                                    if (property !== "open")
                                        return Reflect.get(target, property, receiver);
                                    return async (...args: Parameters<typeof target.open>) => {
                                        const domain = await target.open(...args);
                                        const close = domain.close.bind(domain);
                                        domain.close = async () => {
                                            lifecycle.push("domain-close");
                                            return close();
                                        };
                                        return domain;
                                    };
                                }
                            })
                        });
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        }
    });
    return root;
}

describe("provider and Storage Domain child composition", () => {
    it("persists, deletes and closes through real Cordis child plugins", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "convivium-storage-child-"));
        const identities: Context[] = [];
        const lifecycle: string[] = [];
        const backendClose = JsonlStorageBackend.prototype.close;
        JsonlStorageBackend.prototype.close = async function () {
            lifecycle.push("backend-close");
            return backendClose.call(this);
        };
        try {
            const first = await rootWithConsumer(tempRoot, lifecycle, async (ctx) => {
                identities.push(ctx);
                const domain = await ctx.storageDomain.open(spec);
                await domain.table("records").put("alpha", 1);
                await domain.close();
            });
            await first.fiber.dispose();

            const second = await rootWithConsumer(tempRoot, lifecycle, async (ctx) => {
                identities.push(ctx);
                const domain = await ctx.storageDomain.open(spec);
                expect(domain.table("records").get("alpha")).toBe(1);
                expect(await domain.table("records").delete("alpha")).toBe(true);
                await domain.close();
            });
            await second.fiber.dispose();

            const third = await rootWithConsumer(tempRoot, lifecycle, async (ctx) => {
                identities.push(ctx);
                const domain = await ctx.storageDomain.open(spec);
                expect(domain.table("records").get("alpha")).toBeUndefined();
                await domain.close();
            });
            await third.fiber.dispose();
            expect(new Set(identities).size).toBe(3);
            expect(lifecycle.indexOf("domain-close")).toBeGreaterThanOrEqual(0);
            expect(lifecycle.indexOf("backend-close")).toBeGreaterThan(
                lifecycle.indexOf("domain-close")
            );
        } finally {
            JsonlStorageBackend.prototype.close = backendClose;
            await rm(tempRoot, { recursive: true, force: true });
        }
    }, 30_000);
});
