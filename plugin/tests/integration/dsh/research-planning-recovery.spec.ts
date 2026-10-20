import Storage from "@deepseek-ai/dsh-storage";
import * as Domains from "@deepseek-ai/dsh-storage-domain";
import * as Sqlite from "@deepseek-ai/dsh-storage-sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { zstdCompressSync } from "node:zlib";
const execFileAsync = promisify(execFile);
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { Session, SessionId, SESSION_FORMAT_VERSION } from "@deepseek-ai/dsh-session";
import Persistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { it, expect, vi } from "vitest";
import { createResearchPlanner } from "@/dsh/research-planning.ts";
import { createFakeDomainFacility } from "../../fixtures/domain-storage.ts";

it("cold opens a real persisted Manager Session after research planning without custom Session events", async () => {
    const root = await mkdtemp(join(tmpdir(), "convivium-planning-cold-"));
    let ctx = new Context();
    try {
        await ctx.plugin(Persistence, { root, compression: "none" });
        const id = SessionId("manager-cold");
        const header = {
            id,
            version: SESSION_FORMAT_VERSION,
            createdAt: 1,
            cwd: root,
            isSeeded: false
        };
        const session = Session.create(id, undefined, header);
        const append = vi.spyOn(session, "append");
        const handle = await ctx.sessionPersistence.create(header);
        const packageRoot = resolve(".");
        const facility = createFakeDomainFacility();
        const open = vi.fn(facility.open);
        let calls = 0;
        const plannerContext = {
            storageDomain: { open },
            effect: ctx.effect.bind(ctx),
            skills: {
                get: async () => ({
                    content: "planning skill",
                    resourceBase: {
                        kind: "directory",
                        path: join(packageRoot, "config/skills/research-planning")
                    }
                })
            },
            llm: {
                stream: async function* () {
                    if (calls++) {
                        throw new Error("review unavailable");
                    }
                    yield { type: "text-delta", text: "original candidate" };
                    yield { type: "finish", reason: { kind: "stop" } };
                }
            },
            sessions: { flush: async () => true }
        } as unknown as Context;
        const planner = await createResearchPlanner(plannerContext, packageRoot);
        const result = await planner({
            agent: { session } as Agent,
            question: "original question",
            signal: new AbortController().signal
        });
        expect(result.status).toBe("failed");
        const events = append.mock.results.map((r) => r.value);
        await handle.append(events);
        await handle.flush();
        await handle.close();
        await ctx.fiber.dispose();
        ctx = new Context();
        await ctx.plugin(Persistence, { root, compression: "none" });
        const reopened = await ctx.sessionPersistence.open(id, "read");
        try {
            const read = await reopened.read();
            expect(read.events).toHaveLength(0);
        } finally {
            await reopened.close();
        }
        expect(open).toHaveBeenCalledOnce();
        const domain = await open.mock.results[0]!.value;
        const records = [...domain.table("diagnostics").entries()].map(([, value]) => value);
        expect(records).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sessionId: id,
                    name: "attempt-0.list.txt",
                    content: "original candidate"
                })
            ])
        );
    } finally {
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    }
}, 20000);

it("cold recovers a legacy Session after an interrupted repair and refuses a mismatched backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "convivium-legacy-cold-"));
    let ctx = new Context();
    try {
        await ctx.plugin(Persistence, { root, compression: "none" });
        const id = SessionId("legacy-manager");
        const header = {
            id,
            version: SESSION_FORMAT_VERSION,
            createdAt: 1,
            cwd: root,
            isSeeded: false
        };
        const handle = await ctx.sessionPersistence.create(header);
        await handle.flush();
        await handle.close();
        await ctx.fiber.dispose();
        const files = await readdir(root, { recursive: true });
        const plain = join(
            root,
            files.find((path) => path.endsWith("session.v4.jsonl"))!
        );
        const legacy = {
            type: "convivium/research-planning",
            seq: 0,
            time: 2,
            data: { name: "attempt-0.list.txt", content: "original candidate" }
        };
        const original = Buffer.concat([
            zstdCompressSync(Buffer.from(`${(await readFile(plain, "utf8")).trimEnd()}\n`)),
            zstdCompressSync(Buffer.from(`${JSON.stringify(legacy)}\n`))
        ]);
        const file = `${plain}.zstd`;
        await writeFile(file, original);
        await rm(plain);
        ctx = new Context();
        await ctx.plugin(Persistence, { root, compression: "zstd" });
        await expect(ctx.sessionPersistence.open(id, "read")).rejects.toThrow(
            "unknown to this harness"
        );
        await ctx.fiber.dispose();
        const backup = join(root, "backup");
        const args = [
            resolve("scripts/repair-research-planning-session.mjs"),
            "--session-file",
            file,
            "--backup-dir",
            backup
        ];
        await execFileAsync(process.execPath, args);
        expect(await readFile(file)).toEqual(original);
        await execFileAsync(process.execPath, [...args, "--apply"]);
        const backupFile = join(
            backup,
            `session.v4.jsonl.zstd.${createHash("sha256").update(original).digest("hex")}.backup`
        );
        expect(await readFile(backupFile)).toEqual(original);
        // Recreate the on-disk state after backup succeeded but replacement was interrupted.
        await writeFile(file, original);
        const mismatched = Buffer.from("incomplete backup");
        await writeFile(backupFile, mismatched);
        await expect(execFileAsync(process.execPath, [...args, "--apply"])).rejects.toThrow();
        expect(await readFile(file)).toEqual(original);
        expect(await readFile(backupFile)).toEqual(mismatched);
        await writeFile(backupFile, original);
        await execFileAsync(process.execPath, [...args, "--apply"]);
        expect(await readFile(backupFile)).toEqual(original);
        const repaired = await readFile(file);
        await execFileAsync(process.execPath, [...args, "--apply"]);
        expect(await readFile(file)).toEqual(repaired);
        ctx = new Context();
        await ctx.plugin(Persistence, { root, compression: "zstd" });
        const reopened = await ctx.sessionPersistence.open(id, "read");
        try {
            expect((await reopened.read()).events).toEqual([{ ...legacy, ignorable: true }]);
        } finally {
            await reopened.close();
        }
    } finally {
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    }
}, 20000);

it("shares one real diagnostic Domain across overlapping meetings and closes it with the consumer", async () => {
    const root = await mkdtemp(join(tmpdir(), "convivium-planning-concurrent-"));
    const ctx = new Context();
    let release = () => {};
    let entered = () => {};
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    let first: Promise<unknown> | undefined;
    try {
        await ctx.plugin(Storage);
        await ctx.plugin(Sqlite, { path: join(root, "storage.sqlite") });
        await ctx.plugin(Domains, { backend: "sqlite" });
        let consumerContext: Context | undefined;
        const consumer = ctx.plugin({
            name: "planning-consumer-test",
            apply(owner: Context) {
                consumerContext = owner;
            }
        });
        await consumer;
        const packageRoot = resolve(".");
        let generations = 0;
        const plannerContext = {
            storageDomain: ctx.storageDomain,
            effect: consumerContext!.effect.bind(consumerContext!),
            skills: {
                get: async () => ({
                    content: "planning skill",
                    resourceBase: {
                        kind: "directory",
                        path: join(packageRoot, "config/skills/research-planning")
                    }
                })
            },
            llm: {
                stream: async function* (options: { model: string }) {
                    if (options.model === "deepseek-v4-pro") {
                        throw new Error("review unavailable");
                    }
                    const generation = generations++;
                    if (generation === 0) {
                        entered();
                        await blocked;
                    }
                    yield { type: "text-delta", text: `candidate-${generation}` };
                    yield { type: "finish", reason: { kind: "stop" } };
                }
            },
            sessions: { flush: async () => true }
        } as unknown as Context;
        const planner = await createResearchPlanner(plannerContext, packageRoot);
        const input = (id: string) => ({
            agent: {
                session: Session.create(SessionId(id), undefined, {
                    id: SessionId(id),
                    version: SESSION_FORMAT_VERSION,
                    createdAt: 1,
                    cwd: root,
                    isSeeded: false
                })
            } as Agent,
            question: id,
            signal: new AbortController().signal
        });
        first = planner(input("meeting-a-manager"));
        await started;
        const second = await planner(input("meeting-b-manager"));
        expect(second.status).toBe("failed");
        release();
        expect(await first).toMatchObject({ status: "failed" });
        const domain = ctx.storageDomain.get("convivium_research_planning")!;
        const records = [...domain.table("diagnostics").entries()].map(([, value]) => value);
        expect(records).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sessionId: "meeting-a-manager",
                    name: "attempt-0.list.txt",
                    content: "candidate-0"
                }),
                expect.objectContaining({
                    sessionId: "meeting-b-manager",
                    name: "attempt-0.list.txt",
                    content: "candidate-1"
                })
            ])
        );
        await consumer.dispose();
        expect(ctx.storageDomain.get("convivium_research_planning")).toBeUndefined();
        await expect(
            domain.table("diagnostics").put("after-close", {
                sessionId: "meeting-a-manager",
                name: "attempt-0.list.txt",
                content: "late"
            })
        ).rejects.toThrow();
    } finally {
        release();
        if (first) {
            await Promise.allSettled([first]);
        }
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    }
}, 20000);
