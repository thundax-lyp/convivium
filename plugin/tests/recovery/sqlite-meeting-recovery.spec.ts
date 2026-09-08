import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { type MeetingDomain } from "@/repository/domain/specs.js";
import { meetingDomainName, seqKey } from "@/repository/domain/keys.js";
import { loadProjection } from "@/repository/domain/projection.js";
import { writeCheckpoint } from "@/repository/domain/checkpoint.js";
import type { CreateMeetingInput, RepositoryCommand } from "@/repository/types.js";
import { meeting } from "../unit/domain/transitions/fixtures.js";

const identity = { teamId: "team-1", meetingId: "meeting-1" };
const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
const create: CreateMeetingInput = {
    requestId: "create",
    requestHash: "create-hash",
    authorization,
    initialState: JSON.parse(JSON.stringify(meeting())),
    createdAt: 1
};
const command: RepositoryCommand<{ topic: string }> = {
    requestId: "topic",
    requestHash: "topic-hash",
    commandKind: "topic",
    authorization,
    expectedMeetingVersion: 0,
    transition: (snapshot) => ({
        state: { ...snapshot.state, topic: "updated" },
        result: { topic: "updated" },
        events: [{ type: "message.added", payload: { content: "updated" } }],
        outbox: [
            {
                id: "dispatch-1",
                deliveryId: "delivery-1",
                kind: "dispatch",
                payload: { content: "updated" }
            }
        ]
    })
};
const resources: Array<{ close(): Promise<void> }> = [];
const directories: string[] = [];
async function open(path: string) {
    const ctx = new Context();
    resources.push({ close: () => ctx.fiber.dispose() });
    await ctx.plugin(Storage);
    await ctx.plugin(storageSqlite, { path, journalMode: "wal" });
    await ctx.plugin(
        { name: storageDomain.name, inject: storageDomain.inject, apply: storageDomain.apply },
        { backend: "sqlite" }
    );
    const registry = await DomainRepositoryRegistry.open({
        storageDomain: ctx.storageDomain,
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        now: () => 10
    });
    resources.push(registry);
    return {
        ctx,
        registry,
        async close() {
            await registry.close();
            await ctx.fiber.dispose();
        }
    };
}
async function ready() {
    const directory = await mkdtemp(join(tmpdir(), "convivium-sqlite-recovery-"));
    directories.push(directory);
    const path = join(directory, "storage.sqlite");
    const host = await open(path);
    const repository = await host.registry.openMeeting({ ...identity, create });
    await repository.completeCreate(create);
    const domain = host.ctx.storageDomain.get(
        meetingDomainName(identity.teamId, identity.meetingId)
    ) as MeetingDomain;
    return { ...host, path, repository, domain };
}
afterEach(async () => {
    vi.restoreAllMocks();
    for (const resource of resources.splice(0).reverse()) await resource.close();
    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});

describe("Meeting persistence on SQLite", () => {
    it("persists state, events, receipt and pending outbox in one bounded commit and replays after reopen", async () => {
        const first = await ready();
        const put = vi.spyOn(first.domain.table("commits"), "put");
        const result = await first.repository.execute(command);
        expect(put).toHaveBeenCalledTimes(1);
        expect(
            Buffer.byteLength(JSON.stringify(put.mock.calls[0]![1]), "utf8")
        ).toBeLessThanOrEqual(65_536);
        const expected = loadProjection({ domain: first.domain });
        expect(expected.snapshot).toMatchObject({ version: 1, state: { topic: "updated" } });
        expect(Object.values(expected.events).map((event) => event.type)).toEqual([
            "meeting.created",
            "message.added"
        ]);
        expect(Object.keys(expected.receipts)).toHaveLength(2);
        expect(Object.values(expected.outbox)).toEqual([
            expect.objectContaining({ status: "pending", deliveryId: "delivery-1" })
        ]);
        put.mockRestore();
        await first.close();
        const second = await open(first.path);
        const repository = await second.registry.openMeeting(identity);
        const domain = second.ctx.storageDomain.get(
            meetingDomainName(identity.teamId, identity.meetingId)
        ) as MeetingDomain;
        expect(loadProjection({ domain })).toEqual(expected);
        expect(await repository.execute(command)).toEqual(result);
        expect(loadProjection({ domain })).toEqual(expected);
    });
    it("keeps memory and disk unchanged when commit put fails and accepts the same request after reopen", async () => {
        const first = await ready();
        const before = loadProjection({ domain: first.domain });
        const snapshot = await first.repository.read();
        const put = vi
            .spyOn(first.domain.table("commits"), "put")
            .mockRejectedValueOnce(new Error("commit fault"));
        await expect(first.repository.execute(command)).rejects.toThrow("commit fault");
        expect(await first.repository.read()).toEqual(snapshot);
        expect(loadProjection({ domain: first.domain })).toEqual(before);
        put.mockRestore();
        await first.close();
        const second = await open(first.path);
        const repository = await second.registry.openMeeting(identity);
        const domain = second.ctx.storageDomain.get(
            meetingDomainName(identity.teamId, identity.meetingId)
        ) as MeetingDomain;
        expect(loadProjection({ domain })).toEqual(before);
        await expect(repository.execute(command)).resolves.toMatchObject({ meetingVersion: 1 });
    });
    it.each(["before pointer", "after pointer"] as const)(
        "recovers the full projection when checkpoint fails %s publication",
        async (phase) => {
            let first = await ready();
            const oldPointer = await writeCheckpoint({
                domain: first.domain,
                projection: loadProjection({ domain: first.domain }),
                baseSeq: 1,
                createdAt: 10
            });
            await first.close();
            const refreshed = await open(first.path);
            const repository = await refreshed.registry.openMeeting(identity);
            const refreshedDomain = refreshed.ctx.storageDomain.get(
                meetingDomainName(identity.teamId, identity.meetingId)
            ) as MeetingDomain;
            first = { ...refreshed, path: first.path, repository, domain: refreshedDomain };
            await first.repository.execute(command);
            const expected = loadProjection({ domain: first.domain });
            const fault =
                phase === "before pointer"
                    ? vi
                          .spyOn(first.domain.table("checkpoint_pointer"), "put")
                          .mockRejectedValueOnce(new Error("pointer fault"))
                    : vi
                          .spyOn(first.domain.table("commits"), "delete")
                          .mockRejectedValueOnce(new Error("cleanup fault"));
            const checkpoint = writeCheckpoint({
                domain: first.domain,
                projection: expected,
                baseSeq: 2,
                createdAt: 11
            });
            if (phase === "before pointer") {
                await expect(checkpoint).rejects.toThrow("pointer fault");
                expect(first.domain.table("checkpoint_pointer").get("current")).toEqual(oldPointer);
            } else {
                await expect(checkpoint).resolves.toMatchObject({ baseSeq: 2 });
                expect(first.domain.table("commits").get(seqKey(2))).toBeDefined();
            }
            expect(fault).toHaveBeenCalled();
            fault.mockRestore();
            await first.close();
            const second = await open(first.path);
            await second.registry.openMeeting(identity);
            const domain = second.ctx.storageDomain.get(
                meetingDomainName(identity.teamId, identity.meetingId)
            ) as MeetingDomain;
            expect(loadProjection({ domain })).toEqual(expected);
        }
    );
    it("rejects a corrupted commit digest after reopening", async () => {
        const first = await ready();
        const commits = first.domain.table("commits");
        await commits.put(seqKey(1), { ...commits.get(seqKey(1))!, digest: "0".repeat(64) });
        await first.close();
        const second = await open(first.path);
        await expect(second.registry.openMeeting(identity)).rejects.toMatchObject({
            code: "CORRUPT_DATABASE"
        });
    });
    it("rejects an incompatible domain version on the same SQLite medium", async () => {
        const first = await ready();
        const spec = storageDomain.defineDomain({
            name: "version_probe",
            version: 1,
            tables: { records: storageDomain.domainTable<string, number>(z.number()) }
        });
        const domain = await first.ctx.storageDomain.open(spec);
        await domain.table("records").put("retained", 1);
        await domain.close();
        await first.close();
        const second = await open(first.path);
        await expect(
            second.ctx.storageDomain.open(storageDomain.defineDomain({ ...spec, version: 2 }))
        ).rejects.toMatchObject({ code: "version-mismatch" });
    });
});
