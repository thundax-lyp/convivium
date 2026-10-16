import { expect, it } from "vitest";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";
import { createFakeDomainFacility } from "../../fixtures/domain-storage.ts";
import { StorageDomainRepositoryRegistry } from "@/repository/storage-domain/storage-domain-repository-registry.ts";
import {
    encodeMeetingState,
    decodeMeetingState
} from "@/repository/storage-domain/meeting/meeting-state-codec.ts";
import { createMeetingCommandApplication } from "@/runtime/application-service/meeting-command.ts";
import type { MeetingAction, MeetingCommand } from "@/protocol/index.ts";
import type { MeetingState } from "@/domain/index.ts";

const setup = async (state = makeRunningMeetingStateV1()) => {
    const freshDomains = createFakeDomainFacility();
    const domains = new Map<string, Domain<DomainSpec>>();
    const registryOptions = {
        storageDomain: {
            open: async <S extends DomainSpec>(spec: S): Promise<Domain<S>> => {
                const existing = domains.get(spec.name);
                if (existing) {
                    return existing as Domain<S>;
                }
                const domain = await freshDomains.open(spec);
                domains.set(spec.name, domain as Domain<DomainSpec>);
                return domain;
            }
        },
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        now: () => 999
    };
    const registry = await StorageDomainRepositoryRegistry.open<MeetingState>(registryOptions);
    const creation = {
        requestId: "create",
        requestHash: "create",
        authorization: { callerBinding: "captain", capabilityId: "captain" },
        initialState: state,
        ...peerBindings(state.id, state.identities),
        createResult: { meetingId: state.id, meetingVersion: 1 },
        createdAt: 10
    };
    const repository = await registry.openMeeting({ meetingId: state.id, create: creation });
    for (const owner of creation.initialOwnership) {
        await repository.recordSessionOwnership({ ...owner, lifecycleStatus: "active" }, 10);
    }
    await repository.completeCreate(creation);
    let next = 0;
    const application = createMeetingCommandApplication({
        registry,
        creation: {
            create: async () => {
                throw new Error("not a create command");
            }
        },
        ids: { nextId: (kind) => `${kind}-${++next}` },
        clock: { now: () => 20 },
        resolveCallerScope: async ({ caller }) => ({
            caller,
            meetingId: state.id,
            role: caller.channel === "runtime_recovery" ? "runtime" : "captain"
        })
    });
    const run = (action: MeetingAction, requestId: string, expectedMeetingVersion: number) => {
        const runtime = action.kind === "record_archive_session_result";
        const command: MeetingCommand = {
            protocolVersion: 1,
            meetingId: state.id,
            requestId,
            expectedMeetingVersion,
            action
        };
        return application.execute(
            command,
            {
                caller: runtime
                    ? { channel: "runtime_recovery", principalId: "runtime-recovery" }
                    : { channel: "loopback_remote", principalId: "local-controller" }
            },
            new AbortController().signal
        );
    };
    return { registryOptions, registry, repository, run, ownership: creation.initialOwnership[0]! };
};

it("atomically records multiple occurrences with the fact's time/version and does not append for replay, rejection or conflict", async () => {
    const { registry, repository, run } = await setup();
    try {
        const action = {
            kind: "end_meeting",
            outcome: "cancelled",
            reason: "cancel",
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: []
        } as const;
        const accepted = await run(action, "end", 1);
        expect(accepted).toMatchObject({ kind: "accepted", committedVersion: 2 });
        const log = await repository.readCommittedEvents();
        expect(log.kind).toBe("complete");
        if (log.kind !== "complete") {
            throw new Error("complete log required");
        }
        expect(
            log.events.map((event) => [
                event.eventSeq,
                event.type,
                event.meetingVersion,
                event.createdAt
            ])
        ).toEqual([
            [1, "meeting.created", 1, 10],
            [2, "meeting.lifecycle_changed", 2, 20],
            [3, "meeting.ended", 2, 20]
        ]);
        expect(await repository.readCommittedFacts()).toMatchObject([
            { kind: "end_meeting", meetingVersion: 2, occurredAt: 20 }
        ]);
        expect(await run(action, "end", 1)).toEqual(accepted);
        expect(await run({ kind: "pause_meeting", reason: "pause" }, "stale", 1)).toMatchObject({
            kind: "rejected",
            error: { code: "VERSION_CONFLICT" }
        });
        expect(await run({ kind: "pause_meeting", reason: "pause" }, "invalid", 2)).toMatchObject({
            kind: "rejected"
        });
        expect(await repository.readCommittedEvents()).toEqual(log);
    } finally {
        await registry.close();
    }
});

it("records one lifecycle occurrence for pause and none for an accepted ownership-only archive update", async () => {
    const f = await setup();
    try {
        expect(await f.run({ kind: "pause_meeting", reason: "pause" }, "pause", 1)).toMatchObject({
            kind: "accepted"
        });
        const log = await f.repository.readCommittedEvents();
        expect(log.kind === "complete" && log.events.map((event) => event.type)).toEqual([
            "meeting.created",
            "meeting.lifecycle_changed"
        ]);
        const owner = f.ownership;
        await f.repository.recordSessionOwnership(
            { ...owner, lifecycleStatus: "active", capabilityStatus: "revoked" },
            20
        );
        expect(
            await f.run(
                {
                    kind: "record_archive_session_result",
                    sessionOwnershipId: owner.id,
                    status: "failed",
                    failureReason: "dispatch_failed"
                },
                "ownership",
                2
            )
        ).toMatchObject({ kind: "accepted", committedVersion: 3 });
        expect(await f.repository.readCommittedEvents()).toEqual(log);
    } finally {
        await f.registry.close();
    }
});

it("persists one Manager continuation with resume and preserves its delivery id across replay and reopen", async () => {
    const f = await setup();
    let reopened;
    try {
        expect(
            await f.run({ kind: "pause_meeting", reason: "operator pause" }, "pause", 1)
        ).toMatchObject({ kind: "accepted", committedVersion: 2 });
        const action = { kind: "resume_meeting", reason: "continue" } as const;
        const accepted = await f.run(action, "resume", 2);
        expect(accepted).toMatchObject({ kind: "accepted", committedVersion: 3 });
        expect(await f.run(action, "resume", 2)).toEqual(accepted);
        expect(await f.run({ ...action, reason: "conflict" }, "resume", 2)).toMatchObject({
            kind: "rejected",
            error: { code: "IDEMPOTENCY_CONFLICT" }
        });
        expect(await f.run(action, "stale", 2)).toMatchObject({
            kind: "rejected",
            error: { code: "VERSION_CONFLICT" }
        });
        expect(await f.run(action, "already-running", 3)).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_STATE" }
        });
        const items = await f.repository.claimOutbox({
            owner: "first",
            ttlMs: 1,
            batchSize: 100,
            now: 30
        });
        const notices = items.filter((item) => item.payload.noticeKind === "meeting_resumed");
        expect(notices).toHaveLength(1);
        expect(notices[0].payload).toEqual({
            kind: "agent_notice",
            noticeKind: "meeting_resumed",
            recipientId: "manager-v1"
        });
        const snapshot = await f.repository.read();
        expect(snapshot.version).toBe(3);
        expect(snapshot.state.lifecycle.status).toBe("running");
        expect(snapshot.state.rounds).toEqual([]);
        await f.registry.close();
        reopened = await StorageDomainRepositoryRegistry.open<MeetingState>(f.registryOptions);
        const repository = await reopened.openMeeting({ meetingId: snapshot.meetingId });
        await repository.recover({ now: 100 });
        const recovered = await repository.claimOutbox({
            owner: "reopened",
            ttlMs: 100,
            batchSize: 100,
            now: 100
        });
        expect(
            recovered
                .filter((item) => item.payload.noticeKind === "meeting_resumed")
                .map((item) => item.deliveryId)
        ).toEqual([notices[0].deliveryId]);
    } finally {
        await reopened?.close();
        await f.registry.close();
    }
});
