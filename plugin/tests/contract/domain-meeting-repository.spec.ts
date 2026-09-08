import { submitSpeakerAttempt } from "@/domain/index.js";
import { meeting as domainMeeting, now } from "../unit/domain/transitions/fixtures.js";
import { createMeetingDomainSpec } from "@/repository/domain/specs.js";
import { createLocalDecisionRiskState } from "../fixtures/local-decision-risk.js";
import {
    now as localNow,
    meeting as lifecycleMeeting
} from "../unit/domain/transitions/fixtures.js";
import {
    acceptDecisionCandidate,
    disposeDecision,
    applyCompletionClaims,
    transitionMeeting
} from "@/domain/index.js";
import type { MeetingState } from "@/domain/model.js";
import type { JsonObject, RepositoryCommand, DomainEventInput } from "@/repository/types.js";
import { materializeArchivePackage } from "@/runtime/services/meeting-archive-service.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { defineMeetingRepositoryBehaviorContract } from "./meeting-repository-behavior.js";
import type { RepositoryAuthorizationValidator } from "@/repository/types.js";
import {
    createCommitRecord,
    createProjection,
    loadProjection
} from "@/repository/domain/projection.js";
import { catalogKey, receiptKey, seqKey } from "@/repository/domain/keys.js";
import { CommitRecordV1Schema } from "@/repository/domain/schemas.js";
import * as canonicalJson from "@/repository/domain/canonical-json.js";
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

async function openReadyState(state: Record<string, unknown>) {
    const base = createProjection({
        snapshot: {
            teamId: "team-1",
            meetingId: "meeting-1",
            version: 0,
            state: { count: 0 },
            createdAt: 1,
            updatedAt: 1
        },
        bootstrap: {
            status: "ready",
            createRequestId: "create",
            requestHash: "hash",
            createdAt: 1,
            updatedAt: 1
        },
        sessionOwnership: {}
    });
    const projection = { ...base, snapshot: { ...base.snapshot!, state } };
    const commit = createCommitRecord({
        formatVersion: 1,
        seq: 1,
        previousSeq: 0,
        previousDigest: null,
        operation: "create.complete",
        patch: [{ op: "set", path: [], value: projection }],
        committedAt: 1
    });
    const meetingDomain = createFakeMeetingDomain({
        initial: {
            creation: new Map([
                [
                    "current",
                    {
                        formatVersion: 1 as const,
                        teamId: "team-1",
                        meetingId: "meeting-1",
                        status: "ready" as const,
                        requestId: "create",
                        requestHash: "hash",
                        authorization: {
                            callerBinding: "captain:1",
                            capabilityId: "capability:1"
                        },
                        initialState: {},
                        createResult: null,
                        initialOutbox: [],
                        sessionOwnership: {},
                        createdAt: 1,
                        updatedAt: 1,
                        failureCode: null
                    }
                ]
            ]),
            commits: new Map([[seqKey(1), commit]])
        }
    });
    return DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
}

it("preserves legacy reopen and distinguishes unsupported from corrupt MeetingState", async () => {
    const legacy = await openReadyState({ count: 0 });
    await expect(legacy.read()).resolves.toMatchObject({ state: { count: 0 } });
    await legacy.close();
    await expect(openReadyState({ formatVersion: 3 })).rejects.toMatchObject({
        code: "SCHEMA_VERSION_UNSUPPORTED"
    });
    await expect(
        openReadyState({ formatVersion: 2, manager: {}, attendanceRecommendations: null })
    ).rejects.toMatchObject({ code: "CORRUPT_DATABASE" });
});

it("reads only the snapshot and returns an isolated nested value", async () => {
    const repository = await openReadyState({ nested: { values: [1, 2] } });
    const encode = vi.spyOn(canonicalJson, "encodeCanonicalJson");
    try {
        const snapshot = await repository.read();
        expect(encode).toHaveBeenCalled();
        for (const [value] of encode.mock.calls) {
            expect(value).toEqual(snapshot);
        }
        (snapshot.state.nested as { values: number[] }).values.push(3);
        snapshot.version = 99;
        await expect(repository.read()).resolves.toMatchObject({
            version: 0,
            state: { nested: { values: [1, 2] } }
        });
    } finally {
        encode.mockRestore();
        await repository.close();
    }
});

it("still rejects an unsupported MeetingState format on a live snapshot read", async () => {
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: createFakeMeetingDomain(),
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    try {
        const input = {
            requestId: "create",
            authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
            requestHash: "hash",
            initialState: { formatVersion: 3 }
        };
        await repository.create(input);
        await repository.completeCreate(input);
        await expect(repository.read()).rejects.toMatchObject({
            name: "UnsupportedMeetingStateFormatError",
            formatVersion: 3
        });
    } finally {
        await repository.close();
    }
});

it("writes the complete seq-one projection in one create commit", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const snapshots: unknown[] = [];
    const repository = await DomainMeetingRepository.open({
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1,
        onProjectionCommitted: (snapshot) => snapshots.push(snapshot)
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
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ teamId: "team-1", meetingId: "meeting-1", version: 0 });
    await repository.updateCreateResult({
        expectedMeetingVersion: 0,
        result: {
            meetingId: "meeting-1",
            meetingVersion: 0,
            status: "running",
            participants: []
        },
        now: 13
    });
    expect(snapshots).toHaveLength(2);
    await repository.close();
});

it("rejects duplicate outbox delivery identities across caller-bound mail requests", async () => {
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
    const createInput = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: {
            status: "created",
            version: 0,
            participants: [{ id: "p1" }, { id: "p2" }],
            transcript: [],
            messageSeq: 0
        },
        createdAt: 1
    };
    await repository.create(createInput);
    await repository.completeCreate(createInput);
    for (const participantId of ["p1", "p2"]) {
        await repository.recordSessionOwnership(
            {
                sessionId: `${participantId}-session`,
                parentSessionId: "captain-session",
                sessionLabel: `convivium:meeting-participant:team-1:meeting-1:${participantId}`,
                provider: "continuable-provider",
                initialMessageId: `${participantId}-initial`,
                role: "participant",
                participantId,
                lifecycleStatus: "active",
                capabilityStatus: "active"
            },
            2
        );
    }
    const mail = (senderParticipantId: string, recipientParticipantId: string, mailId: string) => ({
        mailId,
        handlingAttemptId: `${mailId}-attempt`,
        meetingId: "meeting-1",
        senderParticipantId,
        recipientParticipantId,
        content: mailId,
        meetingContext: {
            meetingId: "meeting-1",
            contextFromSeq: 0,
            contextThroughSeq: 0,
            relevantMessageIds: []
        },
        snapshotThroughSeq: 0,
        createdAt: 3
    });
    const send = (senderParticipantId: string, recipientParticipantId: string, mailId: string) =>
        repository.sendPrivateMeetingMail({
            requestId: "same-request",
            requestHash: mailId,
            authorization: {
                callerBinding: `session:${senderParticipantId}`,
                capabilityId: `participant:${senderParticipantId}`
            },
            expectedMeetingVersion: 0,
            isNewDeliveryAvailable: () => true,
            mail: mail(senderParticipantId, recipientParticipantId, mailId),
            outbox: {
                deliveryId: "duplicate-delivery",
                kind: "dispatch",
                priority: 0,
                payload: {
                    role: "meeting_mail",
                    mailId,
                    participantId: recipientParticipantId
                }
            }
        });
    await send("p1", "p2", "mail-1");
    await expect(send("p2", "p1", "mail-2")).rejects.toMatchObject({
        code: "INVALID_INPUT"
    });
    await repository.close();
});

it.each(["creation", "catalog"] as const)(
    "repairs ready publication after the %s write fails post-commit",
    async (failurePoint) => {
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
        if (failurePoint === "creation") meeting.failNextPut("creation", "current");
        else catalog.failNextPut("meetings", catalogKey("team-1", "meeting-1"));

        await expect(repository.completeCreate(input)).rejects.toThrow("fake put failure");
        await expect(
            repository.updateBootstrap({
                status: "creation_failed",
                failureCode: "READY_PUBLICATION_FAILED",
                now: 20
            })
        ).resolves.toMatchObject({ status: "ready" });
        await expect(repository.completeCreate(input)).resolves.toMatchObject({
            requestId: "create",
            meetingId: "meeting-1"
        });
        expect(meeting.table("creation").get("current")?.status).toBe("ready");
        expect(catalog.table("meetings").get(catalogKey("team-1", "meeting-1"))?.status).toBe(
            "ready"
        );
        await repository.close();
    }
);

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

it("updates the create receipt written by a separately authorized completer", async () => {
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
    const createInput = {
        requestId: "create",
        authorization: { callerBinding: "creator:1", capabilityId: "creator-capability" },
        requestHash: "hash",
        initialState: { status: "created" },
        createdAt: 10
    };
    await repository.create(createInput);
    await repository.completeCreate({
        ...createInput,
        authorization: { callerBinding: "completer:1", capabilityId: "completer-capability" }
    });
    const result = {
        meetingId: "meeting-1",
        meetingVersion: 0,
        status: "running" as const,
        participants: []
    };

    await expect(
        repository.updateCreateResult({ expectedMeetingVersion: 0, result, now: 20 })
    ).resolves.toEqual(result);
    expect(
        loadProjection({ domain: meeting }).receipts[
            receiptKey("create", "create_meeting", "completer:1")
        ]
    ).toMatchObject({ result });
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

async function maintenanceFixture(initialState: Record<string, unknown> = { count: 0 }) {
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
        initialState,
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
}, 20_000);

it("drains a mutation accepted immediately before close", async () => {
    const { repository, authorization } = await maintenanceFixture();
    const committed = appendVersion(repository, authorization, 0);
    const closed = repository.close();

    await expect(committed).resolves.toMatchObject({ meetingVersion: 1 });
    await expect(closed).resolves.toBeUndefined();
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

function minutesRepositoryState(): MeetingState {
    const state = domainMeeting("running");
    delete state.termination;
    state.version = 0;
    state.meetingTasks = [];
    state.participants = [
        {
            id: "scribe",
            displayName: "Scribe",
            status: "speaking",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.transcript = [
        {
            id: "source-1",
            seq: 1,
            turnSeq: 0,
            turnId: "source-turn",
            stepId: "source-step",
            attemptId: "source-attempt",
            speaker: "scribe",
            agendaItemId: "agenda-1",
            agendaRelation: "on_topic",
            content: "source",
            kind: "statement",
            mentions: [],
            taskIds: [],
            createdAt: now - 1
        }
    ];
    state.messageSeq = 1;
    state.currentTurn = {
        id: "turn-1",
        seq: 1,
        agendaItemId: "agenda-1",
        intent: "explore",
        objective: "objective",
        expectedOutputs: [],
        prohibitedTopics: [],
        plan: ["scribe"],
        status: "running",
        currentStepIndex: 0,
        createdAt: now,
        steps: [
            {
                id: "step-1",
                speaker: "scribe",
                instruction: "summarize",
                reason: "manager_selected",
                status: "running",
                attempt: {
                    attemptId: "attempt-1",
                    participantId: "scribe",
                    meetingId: state.id,
                    turnId: "turn-1",
                    stepId: "step-1",
                    deliveryId: "delivery-1",
                    contextFromSeq: 1,
                    contextThroughSeq: 1,
                    taskSnapshots: [],
                    assignedAt: now,
                    status: "running",
                    deliveryStatus: "pending"
                }
            }
        ]
    };
    return state;
}

it.each([false, true])(
    "persists referenced minutes atomically and reopens (checkpoint=%s)",
    async (checkpoint) => {
        const initialState = minutesRepositoryState();
        const { meeting, repository, authorization } = await maintenanceFixture(initialState);
        const context = {
            meetingId: initialState.id,
            participantId: "scribe",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            agendaItemId: "agenda-1",
            message: {
                id: "draft-2",
                kind: "summary" as const,
                content: "Minutes",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic" as const,
                createdAt: now,
                minutesDraft: {
                    status: "draft" as const,
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: ["source-1"]
                }
            }
        };
        const command = {
            commandKind: "submit_turn",
            requestId: "draft-2",
            requestHash: "draft-2",
            expectedMeetingVersion: 0,
            authorization,
            transition: (snapshot) => {
                const transition = submitSpeakerAttempt(
                    snapshot.state,
                    "scribe",
                    snapshot.version,
                    context
                );
                return {
                    state: transition.state,
                    events: transition.effect.events,
                    outbox: [],
                    result: { messageId: "draft-2" }
                };
            }
        };
        try {
            const before = structuredClone(loadProjection({ domain: meeting }));
            meeting.failPutsInTable("commits");
            await expect(repository.execute(command)).rejects.toThrow();
            expect(loadProjection({ domain: meeting })).toEqual(before);
            meeting.allowPutsInTable("commits");
            const committed = await repository.execute(command);
            expect(await repository.execute(command)).toEqual(committed);
            if (checkpoint) {
                const beforeCheckpoint = structuredClone(loadProjection({ domain: meeting }));
                for (let i = 1; i <= 126; i++) {
                    const snapshot = await repository.read();
                    const receipt = await repository.execute({
                        commandKind: "minutes_checkpoint_probe",
                        requestId: `minutes-checkpoint-${i}`,
                        requestHash: `minutes-checkpoint-${i}`,
                        expectedMeetingVersion: snapshot.version,
                        allowNoop: true,
                        authorization,
                        transition: () => ({
                            state: snapshot.state,
                            events: [],
                            outbox: [],
                            result: { index: i }
                        })
                    });
                    expect(receipt.meetingVersion).toBe(committed.meetingVersion);
                }
                const after = loadProjection({ domain: meeting });
                for (const field of ["snapshot", "events", "outbox"] as const)
                    expect(after[field]).toEqual(beforeCheckpoint[field]);
                expect(Object.keys(after.receipts)).toHaveLength(
                    Object.keys(beforeCheckpoint.receipts).length + 126
                );
            }
        } finally {
            meeting.allowPutsInTable("commits");
            await repository.close();
        }
        if (checkpoint)
            expect(
                meeting.table("checkpoint_pointer").get("current")?.baseSeq
            ).toBeGreaterThanOrEqual(128);
        else expect(meeting.table("checkpoint_pointer").get("current")).toBeUndefined();
        const initial = Object.fromEntries(
            Object.keys(createMeetingDomainSpec(meeting.name).tables).map((name) => [
                name,
                new Map(meeting.table(name).entries())
            ])
        );
        const copied = createFakeMeetingDomain({ name: meeting.name, initial });
        const reopened = await DomainMeetingRepository.open({
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: copied,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allow,
            now: () => 1000
        });
        try {
            const snapshot = await reopened.read();
            expect(snapshot.state.transcript).toHaveLength(2);
            expect(snapshot.state.transcript[1]).toMatchObject(context.message);
        } finally {
            await reopened.close();
        }
    }
);

it.each(["transcript", "archive"])(
    "rejects invalid persisted minutes in %s and accepts absent legacy metadata",
    async (location) => {
        for (const minutesDraft of [
            null,
            {},
            {
                status: "accepted",
                coverage: { fromSeq: 1, throughSeq: 1 },
                referencedMessageIds: ["source-1"]
            },
            {
                status: "draft",
                coverage: { fromSeq: 1, throughSeq: 1 },
                referencedMessageIds: ["source-1", "source-1"]
            }
        ]) {
            const state = minutesRepositoryState();
            const messages = [{ ...state.transcript[0], minutesDraft }];
            const invalid =
                location === "transcript"
                    ? { ...state, transcript: messages }
                    : { ...state, archive: { package: { formalTranscript: messages } } };
            await expect(openReadyState(invalid)).rejects.toThrow();
        }
        const legacy = await openReadyState(minutesRepositoryState());
        try {
            expect((await legacy.read()).state.transcript[0]).not.toHaveProperty("minutesDraft");
        } finally {
            await legacy.close();
        }
    }
);

it("keeps role provenance immutable through bootstrap, commit, checkpoint and reopen", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const options = {
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    };
    const repository = await DomainMeetingRepository.open(options);
    const authorization = { callerBinding: "captain", capabilityId: "cap" };
    const input = {
        requestId: "create",
        authorization,
        requestHash: "h",
        initialState: { count: 0 },
        createdAt: 1
    };
    const binding = {
        agentDefinitionId: "a",
        definitionVersion: "1",
        definitionHash: "a".repeat(64)
    };
    const owned = {
        sessionId: "s",
        parentSessionId: "captain",
        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
        provider: "spawn",
        role: "manager" as const,
        lifecycleStatus: "provisioning" as const,
        capabilityStatus: "active" as const,
        agentDefinition: binding
    };
    await repository.create(input);
    for (const invalid of [
        null,
        {},
        { ...binding, extra: true },
        { ...binding, definitionHash: "bad" }
    ]) {
        await expect(
            repository.recordSessionOwnership({ ...owned, agentDefinition: invalid })
        ).rejects.toMatchObject({
            code: "INVALID_INPUT",
            message: "Invalid agent definition binding"
        });
        expect(meeting.table("creation").get("current")?.sessionOwnership).toEqual({});
    }
    await repository.recordSessionOwnership(owned);
    const saved = structuredClone(meeting.table("creation").get("current"));
    for (const agentDefinition of [
        undefined,
        { ...binding, definitionVersion: "2" },
        { ...binding, agentDefinitionId: "b" },
        { ...binding, definitionHash: "b".repeat(64) }
    ]) {
        await expect(
            repository.recordSessionOwnership({ ...owned, agentDefinition })
        ).rejects.toMatchObject({ code: "INVALID_STATE" });
        expect(meeting.table("creation").get("current")).toEqual(saved);
    }
    const legacy = { ...owned, sessionId: "legacy", agentDefinition: undefined };
    await repository.recordSessionOwnership(legacy);
    await expect(
        repository.recordSessionOwnership({ ...legacy, agentDefinition: binding })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await repository.completeCreate(input);
    const active = { ...owned, lifecycleStatus: "active" as const, initialMessageId: "message" };
    meeting.failNextPut("commits", seqKey(2));
    await expect(repository.recordSessionOwnership(active)).rejects.toThrow();
    expect(loadProjection({ domain: meeting })?.sessionOwnership.s.lifecycleStatus).toBe(
        "provisioning"
    );
    expect(meeting.table("commits").get(seqKey(2))).toBeUndefined();
    await repository.recordSessionOwnership(active);
    await repository.recordSessionOwnership({
        ...active,
        lifecycleStatus: "closed",
        capabilityStatus: "revoked"
    });
    for (let version = 0; version < 125; version++)
        await appendVersion(repository, authorization, version);
    await repository.close();
    expect(meeting.table("checkpoint_pointer").get("current")).toBeDefined();
    const reopened = await DomainMeetingRepository.open(options);
    expect(loadProjection({ domain: meeting })?.sessionOwnership.s).toMatchObject({
        agentDefinition: binding,
        lifecycleStatus: "closed",
        capabilityStatus: "revoked"
    });
    expect(
        loadProjection({ domain: meeting })?.sessionOwnership.legacy.agentDefinition
    ).toBeUndefined();
    await expect(
        reopened.recordSessionOwnership({
            ...active,
            agentDefinition: undefined,
            lifecycleStatus: "closed",
            capabilityStatus: "revoked"
        })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await reopened.close();
});

it("local control commits roll back and reopen", async () => {
    const catalog = createFakeCatalogDomain();
    const meetingDomain = createFakeMeetingDomain();
    const open = () =>
        DomainMeetingRepository.open({
            catalogDomain: catalog,
            meetingDomain,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allow,
            now: () => localNow
        });
    let repository = await open();
    const create = {
        requestId: "create-local",
        requestHash: "create-local",
        authorization: { callerBinding: "session:captain-1", capabilityId: "captain:captain-1" },
        initialState: JSON.parse(
            JSON.stringify({ ...createLocalDecisionRiskState(), meetingTasks: [] })
        ) as JsonObject,
        createdAt: localNow
    };
    const context = {
        meetingId: "meeting-1",
        actorBinding: "local-host:loopback-web",
        authority: "local_host" as const,
        reason: "Reviewed evidence",
        evidenceMessageIds: ["message-1"],
        now: localNow
    };
    const authorization = {
        callerBinding: context.actorBinding,
        capabilityId: context.actorBinding
    };
    function command(
        index: number,
        evidenceMessageIds = context.evidenceMessageIds
    ): RepositoryCommand<JsonObject> {
        const requestId = `local-${index}`;
        const input = { ...context, evidenceMessageIds, requestId };
        return {
            requestId,
            commandKind:
                index === 0 ? "accept_decision" : index < 3 ? "dispose_decision" : "dispose_risk",
            authorization,
            requestHash: JSON.stringify(input),
            expectedMeetingVersion: index,
            transition(snapshot) {
                const state = snapshot.state as unknown as MeetingState;
                const transition =
                    index === 0
                        ? acceptDecisionCandidate(state, {
                              ...input,
                              decisionCandidateId: "candidate-1"
                          })
                        : index === 1
                          ? disposeDecision(state, {
                                ...input,
                                decisionId: "decision-candidate-1",
                                action: "supersede",
                                replacementCandidateId: "candidate-2"
                            })
                          : index === 2
                            ? disposeDecision(state, {
                                  ...input,
                                  decisionId: "decision-candidate-2",
                                  action: "revoke"
                              })
                            : applyCompletionClaims(state, {
                                  participantId: "local_host",
                                  assertedBy: context.actorBinding,
                                  riskAuthority: "local_host",
                                  now: localNow,
                                  authorizedTaskIds: [],
                                  factId: (_kind, n) => `completion-${requestId}-risk-${n}`,
                                  claims: {
                                      riskAcceptance: {
                                          issueId: "risk-1",
                                          decision: index === 3 ? "accept" : "reject",
                                          reason: input.reason,
                                          evidenceMessageIds
                                      }
                                  }
                              });
                const decision = transition.state.decisions.at(-1)!;
                const result: JsonObject =
                    index === 0
                        ? {
                              requestId,
                              decisionCandidateId: "candidate-1",
                              decisionId: decision.id,
                              proposalId: decision.proposalId,
                              proposalRevision: decision.proposalRevision,
                              completionFactId: "completion-candidate-1-acceptance"
                          }
                        : index < 3
                          ? {
                                requestId,
                                decisionId: `decision-candidate-${index}`,
                                action: index === 1 ? "supersede" : "revoke",
                                completionFactId: `completion-${requestId}-decision-${index === 1 ? "supersession" : "revocation"}`,
                                ...(index === 1 ? { replacementDecisionId: decision.id } : {})
                            }
                          : {
                                requestId,
                                issueId: "risk-1",
                                disposition: index === 3 ? "accepted" : "rejected",
                                completionFactId: transition.state.completionFacts.at(-1)!.id,
                                meetingStatus: transition.state.status
                            };
                return {
                    state: transition.state as unknown as JsonObject,
                    result,
                    events: transition.effect.events as unknown as DomainEventInput[],
                    outbox: []
                };
            }
        };
    }
    try {
        await repository.create(create);
        await repository.recordSessionOwnership(
            {
                sessionId: "manager-1",
                initialMessageId: "manager-initial-1",
                parentSessionId: "captain-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "spawn",
                role: "manager",
                lifecycleStatus: "active",
                capabilityStatus: "active"
            },
            localNow
        );
        await repository.completeCreate(create);
        const receipts = [];
        for (let index = 0; index < 5; index++) {
            const before = loadProjection({ domain: meetingDomain });
            const snapshot = await repository.read();
            await expect(
                repository.execute(command(index, ["message-1", "external-message"]))
            ).rejects.toMatchObject({ code: "INVALID_ENTITY_STATE" });
            expect(loadProjection({ domain: meetingDomain })).toEqual(before);
            meetingDomain.failNextPut("commits", "*");
            await expect(repository.execute(command(index))).rejects.toThrow("fake put failure");
            expect(await repository.read()).toEqual(snapshot);
            expect(loadProjection({ domain: meetingDomain })).toEqual(before);
            await repository.close();
            repository = await open();
            expect(await repository.read()).toEqual(snapshot);
            expect(loadProjection({ domain: meetingDomain })).toEqual(before);
            receipts.push(await repository.execute(command(index)));
            const after = loadProjection({ domain: meetingDomain });
            expect(after.snapshot!.version).toBe(before.snapshot!.version + 1);
            expect(Object.keys(after.receipts)).toHaveLength(
                Object.keys(before.receipts).length + 1
            );
            expect(after.outbox).toEqual(before.outbox);
        }
        await repository.close();
        repository = await open();
        const committed = loadProjection({ domain: meetingDomain });
        for (let index = 0; index < 5; index++)
            expect(await repository.execute(command(index))).toEqual(receipts[index]);
        expect(loadProjection({ domain: meetingDomain })).toEqual(committed);
        const state = (await repository.read())!.state as unknown as MeetingState;
        expect(state.decisions.map(({ status }) => status)).toEqual(["superseded", "revoked"]);
        expect(state.completionFacts).toHaveLength(6);
        expect(
            state.completionFacts.every(
                (fact) =>
                    fact.authority === "local_host" &&
                    fact.assertedBy === context.actorBinding &&
                    fact.evidenceMessageIds.join() === "message-1"
            )
        ).toBe(true);
        for (const target of ["partial", "archiving", "archived"] as const) {
            const snapshot = (await repository.read())!;
            await repository.execute({
                requestId: `archive-${target}`,
                commandKind: `internal_${target}`,
                authorization,
                requestHash: target,
                expectedMeetingVersion: snapshot.version,
                transition(current) {
                    const source = current.state as unknown as MeetingState;
                    const transition = transitionMeeting(
                        source,
                        target,
                        target === "partial"
                            ? {
                                  now: localNow,
                                  termination: {
                                      ...lifecycleMeeting("partial").termination!,
                                      code: "captain_accepted"
                                  }
                              }
                            : target === "archiving"
                              ? {
                                    now: localNow,
                                    archive: {
                                        package: materializeArchivePackage(source, localNow)
                                    }
                                }
                              : { now: localNow, archive: { archivedAt: localNow } }
                    );
                    return {
                        state: transition.state as unknown as JsonObject,
                        result: {},
                        events: transition.effect.events as unknown as DomainEventInput[],
                        outbox: []
                    };
                }
            });
        }
        const archived = loadProjection({ domain: meetingDomain });
        const archive = ((await repository.read())!.state as unknown as MeetingState).archive!
            .package;
        expect(archive.completionFacts).toEqual(state.completionFacts);
        expect(archive.decisionHistory.map(({ id, status }) => ({ id, status }))).toEqual(
            state.decisions.map(({ id, status }) => ({ id, status }))
        );
        expect(archive.formalTranscript).toEqual(state.transcript);
        await repository.close();
        repository = await open();
        expect(
            ((await repository.read())!.state as unknown as MeetingState).archive!.package
        ).toEqual(archive);
        expect(await repository.execute(command(0))).toEqual(receipts[0]);
        expect(loadProjection({ domain: meetingDomain })).toEqual(archived);
    } finally {
        await repository.close();
    }
});

function attendanceState() {
    return {
        formatVersion: 2,
        id: "meeting-1",
        teamId: "team-1",
        status: "running",
        manager: {},
        eventSeq: 0,
        attendanceRecommendations: [
            {
                id: "recommendation-1",
                candidateId: "candidate-1",
                roleDefinitionId: "domain_architect",
                roleDefinitionVersion: "1",
                displayName: "Architect",
                agentDefinitionId: "private-definition",
                agendaItemId: "agenda-1",
                rationale: "Review",
                expectedContribution: "Review",
                evidenceGapIds: [],
                urgency: "current_agenda",
                recommendedByManagerSessionId: "manager-private",
                catalogId: "catalog-1",
                catalogVersion: "1",
                planningAttemptId: "planning-1",
                status: "pending",
                createdAt: 1
            }
        ]
    };
}

it("atomically persists one attendance rejection with receipt and empty outbox after a failed commit", async () => {
    const { isMeetingStateV2, rejectAttendanceRecommendation } = await import("@/domain/index.js");
    const catalog = createFakeCatalogDomain(),
        domain = createFakeMeetingDomain();
    const options = {
        catalogDomain: catalog,
        meetingDomain: domain,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 100
    };
    const repository = await DomainMeetingRepository.open(options);
    let reopened: DomainMeetingRepository | undefined;
    try {
        const create = {
            requestId: "create",
            requestHash: "hash",
            authorization: {
                callerBinding: "session:captain-1",
                capabilityId: "captain:captain-1"
            },
            initialState: attendanceState()
        };
        await repository.create(create);
        await repository.completeCreate(create);
        const before = loadProjection({ domain });
        const command = {
            requestId: "reject-1",
            commandKind: "dispose_attendance_recommendation",
            requestHash: "reject-hash",
            authorization: create.authorization,
            expectedMeetingVersion: 0,
            transition: (snapshot: { state: unknown }) => {
                if (!isMeetingStateV2(snapshot.state)) throw new Error("invalid fixture");
                const result = rejectAttendanceRecommendation(snapshot.state, {
                    meetingId: "meeting-1",
                    requestId: "reject-1",
                    recommendationId: "recommendation-1",
                    actorBinding: "captain:captain-1",
                    reason: "Not needed",
                    now: 100
                });
                return {
                    state: result.state,
                    result: {
                        requestId: "reject-1",
                        recommendationId: "recommendation-1",
                        disposition: "rejected"
                    },
                    events: result.effect.events,
                    outbox: []
                };
            }
        };
        domain.failPutsInTable("commits");
        try {
            await expect(repository.execute(command)).rejects.toThrow();
        } finally {
            domain.allowPutsInTable("commits");
        }
        expect(loadProjection({ domain })).toEqual(before);
        await expect(repository.read()).resolves.toEqual(before.snapshot);
        const result = await repository.execute(command);
        expect(result.meetingVersion).toBe(1);
        const after = loadProjection({ domain });
        expect(Object.keys(after.receipts)).toHaveLength(Object.keys(before.receipts).length + 1);
        expect(Object.values(after.events)).toHaveLength(Object.keys(before.events).length + 1);
        expect(Object.values(after.events).at(-1)).toMatchObject({
            type: "attendance_recommendation.rejected",
            payload: {
                recommendationId: "recommendation-1",
                requestId: "reject-1",
                actorBinding: "captain:captain-1",
                reason: "Not needed",
                rejectedAt: 100
            }
        });
        expect(after.outbox).toEqual(before.outbox);
        expect(Object.keys(after.outbox)).toHaveLength(0);
        expect(after.sessionOwnership).toEqual(before.sessionOwnership);
        await repository.close();
        reopened = await DomainMeetingRepository.open(options);
        await expect(reopened.execute(command)).resolves.toEqual(result);
        expect(loadProjection({ domain })).toEqual(after);
    } finally {
        domain.allowPutsInTable("commits");
        await repository.close();
        await reopened?.close();
    }
});

it("maps malformed attendance rejection to repository errors without changing projection exceptions", async () => {
    const state = attendanceState();
    const rejection = {
        requestId: "reject-1",
        actorBinding: "captain:captain-1",
        reason: "Not needed",
        rejectedAt: 100
    };
    for (const change of [
        { status: "rejected" },
        { status: "rejected", rejection: null },
        { rejection },
        { status: "rejected", rejection: { ...rejection, extra: true } },
        { status: "rejected", rejection: { reason: "missing" } }
    ]) {
        await expect(
            openReadyState({
                ...state,
                attendanceRecommendations: [{ ...state.attendanceRecommendations[0], ...change }]
            })
        ).rejects.toMatchObject({ code: "CORRUPT_DATABASE" });
    }
    await expect(openReadyState({ formatVersion: 3 })).rejects.toMatchObject({
        code: "SCHEMA_VERSION_UNSUPPORTED"
    });
    for (const record of [
        state.attendanceRecommendations[0],
        { ...state.attendanceRecommendations[0], status: "rejected", rejection }
    ]) {
        const repository = await openReadyState({ ...state, attendanceRecommendations: [record] });
        try {
            await expect(repository.read()).resolves.toMatchObject({
                state: { attendanceRecommendations: [record] }
            });
        } finally {
            await repository.close();
        }
    }
});

it("requeues only selected accepted deliveries without changing facts or delivery identity", async () => {
    const options = {
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: createFakeMeetingDomain(),
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 10
    };
    let repository = await DomainMeetingRepository.open(options);
    try {
        const input = {
            requestId: "create",
            requestHash: "hash",
            authorization: { callerBinding: "captain", capabilityId: "captain" },
            initialState: { status: "created" },
            createdAt: 1,
            outbox: ["active", "completed"].map((id) => ({
                id,
                deliveryId: id + "-delivery",
                kind: "dispatch" as const,
                payload: { id }
            }))
        };
        await repository.create(input);
        await repository.completeCreate(input);
        const before = await repository.read();
        const items = await repository.claimOutbox({
            owner: "first",
            ttlMs: 100,
            batchSize: 2,
            now: 10
        });
        for (const item of items)
            await repository.completeOutbox({
                id: item.id,
                leaseOwner: item.leaseOwner,
                leaseToken: item.leaseToken,
                completion: { status: "delivered" },
                now: 11
            });
        await repository.close();
        repository = await DomainMeetingRepository.open(options);
        const recovery = {
            deliveryIds: ["active-delivery", "missing"],
            expectedMeetingVersion: before.version,
            now: 12
        };
        await expect(
            repository.requeueAcceptedOutbox({
                ...recovery,
                expectedMeetingVersion: before.version + 1
            })
        ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
        expect(await repository.requeueAcceptedOutbox(recovery)).toBe(1);
        expect(await repository.requeueAcceptedOutbox(recovery)).toBe(0);
        expect(await repository.read()).toEqual(before);
        await repository.close();
        repository = await DomainMeetingRepository.open(options);
        const replay = await repository.claimOutbox({
            owner: "second",
            ttlMs: 100,
            batchSize: 2,
            now: 13
        });
        expect(replay).toHaveLength(1);
        expect(replay[0]).toMatchObject({
            id: "active",
            deliveryId: "active-delivery",
            payload: { id: "active" },
            attempts: 2
        });
        expect(replay[0].leaseToken).not.toBe(
            items.find((item) => item.id === "active")?.leaseToken
        );
    } finally {
        await repository.close();
    }
});
