import { DomainMeetingRepository } from "../../src/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { defineMeetingRepositoryBehaviorContract } from "./meeting-repository-behavior.js";
import type { RepositoryAuthorizationValidator } from "../../src/repository/types.js";
import {
    createCommitRecord,
    createProjection,
    loadProjection
} from "../../src/repository/domain/projection.js";
import { catalogKey, receiptKey, seqKey } from "../../src/repository/domain/keys.js";
import { CommitRecordV1Schema } from "../../src/repository/domain/schemas.js";
import { expect, it, vi } from "vitest";

const allow: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};

defineMeetingRepositoryBehaviorContract("DomainMeetingRepository behavior contract", {
    open: async (authorizationValidator = allow) =>
        DomainMeetingRepository.open({
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: createFakeMeetingDomain(),
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator,
            now: () => 1
        }),
    rejectCorruptedReadyState: async () => {
        const projection = createProjection({
            snapshot: null,
            bootstrap: {
                status: "ready",
                createRequestId: "create",
                requestHash: "hash",
                createdAt: 1,
                updatedAt: 1
            },
            sessionOwnership: {}
        });
        const commit = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create.complete",
            patch: [{ op: "set", path: [], value: projection }],
            committedAt: 1
        });
        const badCommit = { ...commit, digest: "0".repeat(64) };
        const readyCreation = {
            formatVersion: 1 as const,
            teamId: "team-1",
            meetingId: "meeting-1",
            status: "ready" as const,
            requestId: "create",
            requestHash: "hash",
            authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
            initialState: {},
            createResult: null,
            initialOutbox: [],
            sessionOwnership: {},
            createdAt: 1,
            updatedAt: 1,
            failureCode: null
        };
        const domain = createFakeMeetingDomain({
            initial: {
                creation: new Map([["current", readyCreation]]),
                commits: new Map([[seqKey(1), badCommit]])
            }
        });
        const catalog = createFakeCatalogDomain();
        const repository = await DomainMeetingRepository.open({
            catalogDomain: catalog,
            meetingDomain: domain,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allow,
            now: () => 1
        });
        await repository.read();
        throw new Error("corrupt state was accepted");
    }
});

it("writes the complete seq-one projection in one create commit", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: { status: "created" },
        outbox: [
            {
                id: "outbox-1",
                deliveryId: "delivery-1",
                kind: "dispatch" as const,
                payload: { meetingId: "meeting-1" }
            }
        ],
        createdAt: 10
    };
    await repository.create(input);
    await repository.recordSessionOwnership(
        {
            sessionId: "session-1",
            parentSessionId: "captain-session-1",
            sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
            provider: "continuable-provider",
            role: "manager",
            lifecycleStatus: "provisioning",
            capabilityStatus: "active"
        },
        11
    );

    await repository.completeCreate({ ...input, createdAt: 12 });

    const commitCalls = meeting.putCalls.filter((call) => call.table === "commits");
    expect(commitCalls).toHaveLength(1);
    expect(commitCalls[0]?.key).toBe(seqKey(1));
    const commit = CommitRecordV1Schema.parse(commitCalls[0]?.value);
    expect(commit).toMatchObject({
        seq: 1,
        previousSeq: 0,
        previousDigest: null,
        operation: "create.complete",
        committedAt: 12
    });
    const projection = loadProjection({ domain: meeting });
    expect(projection).toMatchObject({
        snapshot: { version: 0, state: { status: "created" } },
        bootstrap: {
            status: "ready",
            createRequestId: "create",
            requestHash: "hash",
            createResult: { meetingId: "meeting-1", meetingVersion: 0 },
            createdAt: 10,
            updatedAt: 12
        },
        nextEventSeq: 2
    });
    expect(projection.events[seqKey(1)]).toMatchObject({
        eventSeq: 1,
        meetingVersion: 0,
        type: "meeting.created",
        payload: { meetingId: "meeting-1" }
    });
    expect(projection.receipts[receiptKey("create", "create_meeting", "captain:1")]).toMatchObject({
        requestHash: "hash",
        meetingVersion: 0,
        result: { meetingId: "meeting-1", meetingVersion: 0 },
        eventSeqs: [1]
    });
    expect(projection.outbox["outbox-1"]).toMatchObject({
        deliveryId: "delivery-1",
        kind: "dispatch",
        priority: 50,
        status: "pending",
        availableAt: 10,
        createdAt: 10
    });
    expect(projection.sessionOwnership["session-1"]).toMatchObject({
        createdAt: 11,
        updatedAt: 11
    });
    expect(meeting.table("creation").get("current")?.status).toBe("ready");
    expect(catalog.table("meetings").get(catalogKey("team-1", "meeting-1"))?.status).toBe("ready");
    await repository.close();
});

it("updates the create result with one projection-only commit", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: { status: "created" },
        createdAt: 10
    };
    await repository.create(input);
    await repository.completeCreate(input);
    const snapshot = await repository.read();
    const creationPuts = meeting.putCalls.filter((call) => call.table === "creation").length;
    const catalogPuts = catalog.putCalls.length;
    const result = {
        meetingId: "meeting-1",
        meetingVersion: 0,
        status: "running" as const,
        participants: [{ participantKey: "manager", participantId: "participant-1" }]
    };

    await expect(
        repository.updateCreateResult({ expectedMeetingVersion: 0, result, now: 20 })
    ).resolves.toEqual(result);

    expect(meeting.putCalls.filter((call) => call.table === "creation")).toHaveLength(creationPuts);
    expect(catalog.putCalls).toHaveLength(catalogPuts);
    const commits = meeting.putCalls.filter((call) => call.table === "commits");
    expect(commits).toHaveLength(2);
    expect(CommitRecordV1Schema.parse(commits[1]?.value)).toMatchObject({
        seq: 2,
        operation: "create.result",
        committedAt: 20
    });
    const projection = loadProjection({ domain: meeting });
    expect(projection.snapshot).toEqual(snapshot);
    expect(projection.bootstrap).toMatchObject({ createResult: result, updatedAt: 20 });
    expect(projection.receipts[receiptKey("create", "create_meeting", "captain:1")]).toMatchObject({
        result,
        meetingVersion: 0,
        eventSeqs: [1]
    });
    expect(meeting.table("creation").get("current")?.createResult).toEqual({
        meetingId: "meeting-1",
        meetingVersion: 0
    });
    await repository.close();
});

it("requires the authorization validator before replay and writes each accepted command once", async () => {
    let rejectCommands = false;
    const validateCommand = vi.fn(() => {
        if (rejectCommands) throw new Error("authorization rejected");
    });
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: { validateCreate: () => undefined, validateCommand },
        now: () => 20
    });
    const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
    const createInput = {
        requestId: "create",
        authorization,
        requestHash: "create-hash",
        initialState: { count: 0 },
        createdAt: 10
    };
    await repository.create(createInput);
    await repository.completeCreate(createInput);
    const transition = vi.fn(() => ({
        state: { count: 1 },
        result: { count: 1 },
        events: [
            { type: "message.added" as const, payload: { count: 1 } },
            { type: "turn.planned" as const, payload: { turnId: "turn-1" } }
        ],
        outbox: [
            {
                id: "outbox-1",
                deliveryId: "delivery-1",
                kind: "dispatch" as const,
                payload: { count: 1 }
            }
        ]
    }));
    const command = {
        requestId: "command",
        commandKind: "increment",
        authorization,
        requestHash: "command-hash",
        expectedMeetingVersion: 0,
        transition
    };

    const first = await repository.execute(command);

    expect(first).toMatchObject({ meetingVersion: 1, eventSeqs: [2, 3] });
    expect(transition).toHaveBeenCalledTimes(1);
    expect(validateCommand).toHaveBeenCalledTimes(1);
    const commits = meeting.putCalls.filter((call) => call.table === "commits");
    expect(commits).toHaveLength(2);
    expect(CommitRecordV1Schema.parse(commits[1]?.value)).toMatchObject({
        seq: 2,
        operation: "command:increment"
    });
    const projection = loadProjection({ domain: meeting });
    expect(projection).toMatchObject({
        snapshot: { version: 1, state: { count: 1, version: 1 } },
        nextEventSeq: 4
    });
    expect(projection.events[seqKey(2)]?.eventSeq).toBe(2);
    expect(projection.events[seqKey(3)]?.eventSeq).toBe(3);
    expect(projection.outbox["outbox-1"]?.priority).toBe(50);

    rejectCommands = true;
    await expect(repository.execute(command)).rejects.toThrow("authorization rejected");
    expect(transition).toHaveBeenCalledTimes(1);
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(2);
    rejectCommands = false;
    await expect(repository.execute(command)).resolves.toEqual(first);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(validateCommand).toHaveBeenCalledTimes(3);
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(2);
    await repository.close();
});

it("validates command event and outbox records before commit", async () => {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 20
    });
    const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
    const createInput = {
        requestId: "create",
        authorization,
        requestHash: "create-hash",
        initialState: { count: 0 },
        createdAt: 10
    };
    await repository.create(createInput);
    await repository.completeCreate(createInput);
    const badEvent = { type: "message.added" as const, payload: {} };
    Reflect.set(badEvent, "type", "unregistered.event");
    await expect(
        repository.execute({
            requestId: "bad-event",
            commandKind: "bad_event",
            authorization,
            requestHash: "bad-event-hash",
            expectedMeetingVersion: 0,
            transition: () => ({
                state: { count: 1 },
                result: { count: 1 },
                events: [badEvent],
                outbox: []
            })
        })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const badOutbox = {
        id: "outbox-1",
        deliveryId: "delivery-1",
        kind: "dispatch" as const,
        payload: {}
    };
    Reflect.set(badOutbox, "kind", "unregistered");
    await expect(
        repository.execute({
            requestId: "bad-outbox",
            commandKind: "bad_outbox",
            authorization,
            requestHash: "bad-outbox-hash",
            expectedMeetingVersion: 0,
            transition: () => ({
                state: { count: 1 },
                result: { count: 1 },
                events: [{ type: "message.added", payload: {} }],
                outbox: [badOutbox]
            })
        })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(1);
    await repository.close();
});

it("persists the current outbox lease before renewal and completion", async () => {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: {},
        outbox: [
            {
                id: "outbox-1",
                deliveryId: "delivery-1",
                kind: "dispatch" as const,
                payload: {}
            }
        ],
        createdAt: 0
    };
    await repository.create(input);
    await repository.completeCreate(input);
    const [first] = await repository.claimOutbox({
        owner: "worker-a",
        ttlMs: 10,
        batchSize: 1,
        now: 100
    });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(2);
    const [second] = await repository.claimOutbox({
        owner: "worker-b",
        ttlMs: 100,
        batchSize: 1,
        now: 111
    });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(3);
    expect(first).toMatchObject({ leaseOwner: "worker-a", leaseDeadline: 110 });
    expect(second).toMatchObject({ leaseOwner: "worker-b", leaseDeadline: 211 });
    expect(loadProjection({ domain: meeting }).outbox["outbox-1"]).toMatchObject({
        status: "leased",
        leaseOwner: "worker-b",
        leaseToken: second.leaseToken,
        leaseDeadline: 211
    });
    await expect(
        repository.renewOutboxLease({
            id: second.id,
            leaseOwner: second.leaseOwner,
            leaseToken: second.leaseToken,
            ttlMs: 10,
            now: 112
        })
    ).resolves.toBe(122);
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(4);
    await expect(
        repository.completeOutbox({
            id: second.id,
            leaseOwner: second.leaseOwner,
            leaseToken: second.leaseToken,
            completion: { status: "delivered" },
            now: 113
        })
    ).resolves.toEqual({ id: "outbox-1", status: "delivered" });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(5);
    await repository.close();
});

it("recovers expired outbox leases on the mutation chain with zero-or-one commit", async () => {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: {},
        outbox: [
            {
                id: "outbox-1",
                deliveryId: "delivery-1",
                kind: "dispatch" as const,
                payload: {}
            }
        ],
        createdAt: 0
    };
    await repository.create(input);
    await repository.completeCreate(input);
    await repository.claimOutbox({ owner: "worker", ttlMs: 10, batchSize: 1, now: 100 });
    const before = meeting.putCalls.filter((call) => call.table === "commits").length;

    await expect(repository.recover({ now: 109 })).resolves.toMatchObject({
        reclaimedOutbox: 0,
        pendingOutbox: 1,
        snapshot: { meetingId: "meeting-1" }
    });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(before);
    await expect(repository.recover({ now: 110 })).resolves.toMatchObject({
        reclaimedOutbox: 1,
        pendingOutbox: 1,
        snapshot: { meetingId: "meeting-1" }
    });
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(before + 1);
    expect(loadProjection({ domain: meeting }).outbox["outbox-1"]).toMatchObject({
        status: "pending",
        leaseOwner: null,
        leaseToken: null,
        leaseDeadline: null
    });
    const afterRecovery = meeting.putCalls.filter((call) => call.table === "commits").length;
    await expect(
        repository.cancelUnfinishedPrivateMeetingMail({
            requestId: "cancel-empty",
            requestHash: "cancel-empty-hash",
            authorization: input.authorization,
            expectedMeetingVersion: 0,
            now: 111
        })
    ).resolves.toBe(0);
    expect(meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(afterRecovery);
    await repository.close();
});

it("rolls back state, events and outbox when a commit put fails", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: { count: 0 }
    };
    await repository.create(input);
    await repository.completeCreate(input);
    const before = await repository.read();
    meeting.failNextPut("commits", seqKey(2));
    await expect(
        repository.execute({
            requestId: "command",
            commandKind: "increment",
            authorization: input.authorization,
            requestHash: "command-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { ...snapshot.state, count: 1 },
                result: { count: 1 },
                events: [{ type: "message.added" as const, payload: { count: 1 } }],
                outbox: []
            })
        })
    ).rejects.toThrow();
    await expect(repository.read()).resolves.toEqual(before);
    await repository.close();
});

async function maintenanceFixture() {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1000
    });
    const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
    const input = {
        requestId: "create",
        authorization,
        requestHash: "create-hash",
        initialState: { count: 0 },
        createdAt: 1
    };
    await repository.create(input);
    await repository.completeCreate(input);
    return { meeting, repository, authorization };
}

async function appendVersion(
    repository: DomainMeetingRepository,
    authorization: { callerBinding: string; capabilityId: string },
    expectedMeetingVersion: number
) {
    const nextVersion = expectedMeetingVersion + 1;
    return repository.execute({
        requestId: `command-${nextVersion}`,
        commandKind: "increment",
        authorization,
        requestHash: `hash-${nextVersion}`,
        expectedMeetingVersion,
        transition: () => ({
            state: { count: nextVersion },
            result: { count: nextVersion },
            events: [{ type: "message.added" as const, payload: { count: nextVersion } }],
            outbox: []
        })
    });
}

async function appendThroughRoutineThreshold(
    repository: DomainMeetingRepository,
    authorization: { callerBinding: string; capabilityId: string }
) {
    for (let version = 0; version < 126; version += 1)
        await appendVersion(repository, authorization, version);
}

it("queues application checkpoint behind the committed result", async () => {
    const { meeting, repository, authorization } = await maintenanceFixture();
    await appendThroughRoutineThreshold(repository, authorization);
    const block = meeting.blockNextPut("checkpoint_pages");

    await expect(appendVersion(repository, authorization, 126)).resolves.toMatchObject({
        meetingVersion: 127
    });
    await block.entered;

    expect(meeting.table("commits").get(seqKey(128))).toBeTruthy();
    expect(meeting.table("checkpoint_pointer").get("current")).toBeUndefined();
    block.release();
    await repository.close();
    expect(meeting.table("checkpoint_pointer").get("current")?.baseSeq).toBe(128);
});

it("blocks the next mutation behind application checkpoint", async () => {
    const { meeting, repository, authorization } = await maintenanceFixture();
    await appendThroughRoutineThreshold(repository, authorization);
    const block = meeting.blockNextPut("checkpoint_pages");
    await appendVersion(repository, authorization, 126);
    await block.entered;
    let settled = false;
    const next = appendVersion(repository, authorization, 127).finally(() => {
        settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    block.release();
    await expect(next).resolves.toMatchObject({ meetingVersion: 128 });
    expect(meeting.table("checkpoint_pointer").get("current")?.baseSeq).toBe(128);
    const firstAfterCheckpoint = CommitRecordV1Schema.parse(
        meeting.table("commits").get(seqKey(129))
    );
    expect(firstAfterCheckpoint.previousSeq).toBe(128);
    expect(typeof firstAfterCheckpoint.previousDigest).toBe("string");
    await repository.close();
});

it("retains checkpoint failure for hard-tail retry and close", async () => {
    const { meeting, repository, authorization } = await maintenanceFixture();
    await appendThroughRoutineThreshold(repository, authorization);
    meeting.failPutsInTable("checkpoint_pages");
    await appendVersion(repository, authorization, 126);
    for (let version = 127; version < 255; version += 1)
        await appendVersion(repository, authorization, version);

    await expect(appendVersion(repository, authorization, 255)).rejects.toMatchObject({
        code: "CONSTRAINT_VIOLATION"
    });
    expect(
        meeting.putCalls.filter((call) => call.table === "checkpoint_pages").length
    ).toBeGreaterThan(1);
    await expect(repository.close()).rejects.toThrow("fake persistent put failure");
    expect(meeting.closeCalls).toBe(1);
});

it("drains maintenance and closes the Domain exactly once", async () => {
    const { meeting, repository, authorization } = await maintenanceFixture();
    await appendThroughRoutineThreshold(repository, authorization);
    const block = meeting.blockNextPut("checkpoint_pages");
    await appendVersion(repository, authorization, 126);
    await block.entered;

    const firstClose = repository.close();
    const secondClose = repository.close();
    expect(meeting.closeCalls).toBe(0);
    block.release();
    await Promise.all([firstClose, secondClose]);

    expect(meeting.table("checkpoint_pointer").get("current")?.baseSeq).toBe(128);
    expect(meeting.closeCalls).toBe(1);
    await expect(repository.read()).rejects.toMatchObject({ code: "CLOSED" });
});
