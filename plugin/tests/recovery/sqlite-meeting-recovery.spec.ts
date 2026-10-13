import { recoverTargetMeetingDeliveries } from "@/runtime/meeting-lifecycle.ts";
import { DatabaseSync } from "node:sqlite";
import { meetingDomainName } from "@/repository/storage-domain/format/keys.ts";
import { peerBindings } from "../fixtures/peer-ownership.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomain from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StorageDomainRepositoryRegistry } from "@/repository/storage-domain/storage-domain-repository-registry.ts";
import {
    decodeMeetingState,
    encodeMeetingState
} from "@/repository/storage-domain/meeting/meeting-state-codec.ts";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.ts";
import SessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SESSION_FORMAT_VERSION, SessionId, SessionSeq } from "@deepseek-ai/dsh-session";
import { MessageId } from "@deepseek-ai/dsh-llm";
import { createMeetingDomainSpec } from "@/repository/storage-domain/format/specs.ts";

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
        ? await StorageDomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow,
              codec
          })
        : await StorageDomainRepositoryRegistry.open({
              storageDomain: context.storageDomain,
              authorizationValidator: allow
          });
    return {
        context,
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
    for (const directory of directories.splice(0)) {
        await rm(directory, { recursive: true, force: true });
    }
});

describe("target Meeting persistence on SQLite", () => {
    it.each([false, true])(
        "keeps closed Session history after deletion and cold reopen (interrupted=%s)",
        async (interrupted) => {
            const path = await databasePath();
            const first = await open(path, false);
            const sessionRoot = join(path, "..", "sessions");
            await first.context.plugin(SessionPersistence, {
                root: sessionRoot,
                compression: "none"
            });
            const identities = [
                { id: "manager", roles: ["manager"] },
                { id: "reviewer", roles: ["evidence_reviewer"] },
                { id: "contributor", roles: ["contributor"] }
            ];
            const create = {
                requestId: "delete-create",
                requestHash: "delete-hash",
                authorization,
                initialState: { identities, count: 0 },
                ...peerBindings("meeting-delete", identities),
                createdAt: 1
            };
            const repository = await first.registry.openMeeting({
                meetingId: "meeting-delete",
                create
            });
            for (const item of create.initialOwnership) {
                await repository.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
            }
            await repository.completeCreate(create);
            const otherIdentities = identities.map((i) => ({ ...i, id: `other-${i.id}` }));
            const otherCreate = {
                ...create,
                requestId: "other-create",
                requestHash: "other-hash",
                initialState: { identities: otherIdentities, count: 73 },
                ...peerBindings("meeting-other", otherIdentities)
            };
            const otherRepository = await first.registry.openMeeting({
                meetingId: "meeting-other",
                create: otherCreate
            });
            for (const item of otherCreate.initialOwnership) {
                await otherRepository.recordSessionOwnership(
                    { ...item, lifecycleStatus: "active" },
                    2
                );
            }
            await otherRepository.completeCreate(otherCreate);
            const sessionId = SessionId(create.initialOwnership[0]!.sessionId);
            const writer = await first.context.sessionPersistence.create({
                version: SESSION_FORMAT_VERSION,
                id: sessionId,
                createdAt: 1,
                isSeeded: false
            });
            const events = [
                {
                    type: "user/message" as const,
                    seq: SessionSeq(0),
                    time: 1,
                    surfaceOp: "append" as const,
                    data: {
                        role: "user" as const,
                        id: MessageId("retained-message"),
                        source: { kind: "user" as const },
                        content: [{ type: "text" as const, text: "Retain this chat history" }]
                    }
                }
            ];
            await writer.append(events);
            await writer.close();
            if (interrupted) {
                await repository.beginDeletion(0, () => {});
            } else {
                await first.registry.deleteMeeting("meeting-delete", 0, () => {});
            }
            await first.close();

            const second = await open(path, false);
            try {
                await second.context.plugin(SessionPersistence, {
                    root: sessionRoot,
                    compression: "none"
                });
                expect(second.registry.listMeetings().map((item) => item.meetingId)).toEqual([
                    "meeting-other"
                ]);
                const otherRecovered = await (
                    await second.registry.openMeeting({ meetingId: "meeting-other" })
                ).recover();
                expect(otherRecovered.snapshot?.state.count).toBe(73);
                await expect(
                    second.registry.openMeeting({ meetingId: "meeting-delete" })
                ).rejects.toMatchObject({ code: "MEETING_NOT_FOUND" });
                await expect(
                    second.registry.openMeeting({ meetingId: "meeting-delete", create })
                ).rejects.toMatchObject({ code: "INVALID_STATE" });
                expect(second.registry.listMeetings().map((item) => item.meetingId)).toEqual([
                    "meeting-other"
                ]);
                const deletedDomain = await second.context.storageDomain.open(
                    createMeetingDomainSpec(meetingDomainName("meeting-delete"))
                );
                try {
                    for (const table of [
                        "creation",
                        "commits",
                        "checkpoint_pages",
                        "checkpoint_roots",
                        "checkpoint_pointer"
                    ] as const) {
                        expect(deletedDomain.table(table).size).toBe(0);
                    }
                } finally {
                    await deletedDomain.close();
                }
                const reader = await second.context.sessionPersistence.open(sessionId, "read");
                try {
                    expect((await reader.read()).events).toEqual(events);
                } finally {
                    await reader.close();
                }
            } finally {
                await second.close();
            }
        }
    );
    it("reopens target state, facts and atomic Session closure", async () => {
        const path = await databasePath();
        const first = await open(path, true);
        const state = makeRunningMeetingStateV1();
        for (let i = 0; i < 4; i++) {
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        }
        const create = {
            requestId: "create-target",
            requestHash: "create-target-hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities),
            createdAt: 1
        };
        const repository = await first.registry.openMeeting({ meetingId: state.id, create });
        for (const item of create.initialOwnership) {
            await repository.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
        }
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
            for (let i = 0; i < 4; i++) {
                state.identities.push({ ...state.identities[1], id: `extra-${i}` });
            }
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
        for (const item of create.initialOwnership) {
            await legacy.recordSessionOwnership({ ...item, lifecycleStatus: "active" }, 2);
        }
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
    for (let i = 0; i < 4; i++) {
        state.identities.push({ ...state.identities[1]!, id: `extra-${i}` });
    }
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
