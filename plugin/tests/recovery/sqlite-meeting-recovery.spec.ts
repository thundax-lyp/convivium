import { recoverTargetMeetingDeliveries } from "@/runtime/meeting-lifecycle.js";
import { DatabaseSync } from "node:sqlite";
import { meetingDomainName } from "@/repository/domain/keys.js";
import { peerBindings } from "../fixtures/peer-ownership.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";

const authorization = { callerBinding: "local", capabilityId: "local" };
const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const codec = { encode: encodeMeetingState, decode: decodeMeetingState };
const directories: string[] = [];

async function open(path: string, target: boolean) {
    const context = new Context();
    await context.plugin(Storage);
    await context.plugin(storageSqlite, { path, journalMode: "wal" });
    await context.plugin(
        { name: storageDomain.name, inject: storageDomain.inject, apply: storageDomain.apply },
        { backend: "sqlite" }
    );
    const registry = target
        ? await DomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow,
              codec
          })
        : await DomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow
          });
    return {
        registry,
        async close() {
            await registry.close();
            await context.fiber.dispose();
        }
    };
}

async function databasePath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "convivium-target-recovery-"));
    directories.push(directory);
    return join(directory, "storage.sqlite");
}

afterEach(async () => {
    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});

describe("target Meeting persistence on SQLite", () => {
    it("reopens target state, facts and atomic Session closure", async () => {
        const path = await databasePath();
        const first = await open(path, true);
        const state = makeRunningMeetingStateV1();
        for (let i = 0; i < 4; i++)
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        const create = {
            requestId: "create-target",
            requestHash: "create-target-hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities),
            createdAt: 1
        };
        const repository = await first.registry.openMeeting({ meetingId: state.id, create });
        for (const item of create.initialOwnership)
            await repository.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
        await repository.completeCreate(create);
        await repository.recordSessionOwnership(
            {
                ...create.initialOwnership[0],
                lifecycleStatus: "active",
                capabilityStatus: "revoked"
            },
            2
        );
        const resultingState = { ...state, version: 1, updatedAt: 2 };
        await repository.execute({
            requestId: "close-session",
            requestHash: "close-session-hash",
            commandKind: "record_archive_session_result",
            authorization,
            expectedMeetingVersion: 0,
            facts: [
                {
                    factId: "fact-close",
                    kind: "record_archive_session_result",
                    actorId: "runtime",
                    occurredAt: 2,
                    meetingVersion: 1,
                    relatedIds: ["manager-v1"],
                    payload: { kind: "references", relatedIds: ["manager-v1"] },
                    resultingState
                }
            ],
            archiveSessionResult: { sessionOwnershipId: "ownership-manager-v1", status: "closed" },
            transition: () => ({
                state: resultingState,
                result: { accepted: true },
                events: [],
                outbox: []
            })
        });
        await first.close();

        const second = await open(path, true);
        const reopened = await second.registry.openMeeting({ meetingId: state.id });
        await expect(reopened.read()).resolves.toMatchObject({ version: 1, state: resultingState });
        await expect(reopened.readCommittedFacts()).resolves.toHaveLength(1);
        await expect(reopened.recover()).resolves.toMatchObject({
            sessionOwnership: expect.arrayContaining([
                expect.objectContaining({
                    id: "ownership-manager-v1",
                    sessionId: "session-manager-v1",
                    identityId: "manager-v1",
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked"
                })
            ])
        });
        await second.close();
    });

    it.each([1, 2])(
        "rejects invalid creation format %s without writing storage",
        async (version) => {
            const path = await databasePath();
            const first = await open(path, true);
            const state = makeRunningMeetingStateV1();
            for (let i = 0; i < 4; i++)
                state.identities.push({ ...state.identities[1], id: `extra-${i}` });
            await first.registry.openMeeting({
                meetingId: state.id,
                create: {
                    requestId: "create",
                    requestHash: "hash",
                    authorization,
                    initialState: state,
                    ...peerBindings(state.id, state.identities),
                    createdAt: 1
                }
            });
            await first.close();
            const db = new DatabaseSync(path);
            const table = `u_${meetingDomainName(state.id)}_creation`;
            const original = db
                .prepare(`SELECT value FROM "${table}" WHERE key = ?`)
                .get("current");
            const changed = {
                ...JSON.parse(String(original!.value)),
                formatVersion: version,
                preparedDescriptors: null
            };
            const bytes = JSON.stringify(changed);
            db.prepare(`UPDATE "${table}" SET value = ? WHERE key = ?`).run(bytes, "current");
            db.close();
            const second = await open(path, true);
            try {
                await expect(
                    second.registry.openMeeting({ meetingId: state.id })
                ).rejects.toMatchObject({
                    code: version === 1 ? "SCHEMA_VERSION_UNSUPPORTED" : "CORRUPT_DATABASE"
                });
            } finally {
                await second.close();
            }
            const after = new DatabaseSync(path);
            expect(
                after.prepare(`SELECT value FROM "${table}" WHERE key = ?`).get("current")!.value
            ).toBe(bytes);
            after.close();
        }
    );

    it("rejects a legacy snapshot without migration", async () => {
        const path = await databasePath();
        const first = await open(path, false);
        const identities = Array.from({ length: 7 }, (_, i) => ({
            id: `identity-${i}`,
            roles: ["contributor"]
        }));
        const create = {
            ...peerBindings("meeting-legacy", identities),
            requestId: "create-legacy",
            requestHash: "create-legacy-hash",
            authorization,
            initialState: { count: 0, identities },
            createdAt: 1
        };
        const legacy = await first.registry.openMeeting({ meetingId: "meeting-legacy", create });
        for (const item of create.initialOwnership)
            await legacy.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
        await legacy.completeCreate(create);
        await first.close();

        const second = await open(path, true);
        await expect(
            second.registry.openMeeting({ meetingId: "meeting-legacy" })
        ).rejects.toMatchObject({
            code: "SCHEMA_VERSION_UNSUPPORTED"
        });
        await second.close();
    });
});

it("cold recovery finishes the original persisted creation and outbox without resubmitting user input", async () => {
    const path = await databasePath();
    const first = await open(path, true);
    const state = makeRunningMeetingStateV1();
    for (let i = 0; i < 4; i++)
        state.identities.push({ ...state.identities[1]!, id: `extra-${i}` });
    const bindings = peerBindings(state.id, state.identities);
    state.identities = state.identities.map((i) => ({
        ...i,
        sessionOwnershipId: bindings.initialOwnership.find((o) => o.identityId === i.id)!.id
    }));
    const result = {
        meetingId: state.id,
        meetingVersion: 1,
        kind: "accepted" as const,
        committedVersion: 1,
        receiptId: "original-receipt",
        factIds: [],
        effects: []
    };
    await first.registry.openMeeting({
        meetingId: state.id,
        create: {
            requestId: "original-create",
            requestHash: "original-hash",
            authorization,
            initialState: state,
            ...bindings,
            createResult: result,
            outbox: [
                {
                    id: "original-notice",
                    deliveryId: "original-notice",
                    kind: "dispatch",
                    payload: { kind: "agent_notice" }
                }
            ],
            createdAt: 1
        }
    });
    await first.close();
    const second = await open(path, true);
    try {
        const resume = vi.fn(async () => {});
        const ensureDelivery = vi.fn(async () => {});
        await recoverTargetMeetingDeliveries({
            registry: second.registry,
            owner: { resume, stop: vi.fn(), suspend: vi.fn() },
            definitions: bindings.initialOwnership.map((o) => o.definition),
            ensureDelivery,
            stopDelivery: vi.fn(),
            now: () => 50
        } as never);
        const recovered = await (
            await second.registry.openMeeting({ meetingId: state.id })
        ).recover();
        expect(recovered.bootstrap.status).toBe("ready");
        expect(recovered.bootstrap.createResult).toEqual(result);
        expect(recovered.snapshot?.state).toEqual(state);
        expect(recovered.pendingOutbox).toBe(1);
        expect(recovered.sessionOwnership.map((o) => o.sessionId)).toEqual(
            bindings.initialOwnership.map((o) => o.sessionId)
        );
        expect(resume).toHaveBeenCalledTimes(14);
        expect(ensureDelivery).toHaveBeenCalledWith(state.id);
    } finally {
        await second.close();
    }
});
