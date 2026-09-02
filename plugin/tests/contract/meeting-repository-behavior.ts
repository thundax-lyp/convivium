import { describe, expect, it, vi } from "vitest";
import { RepositoryError } from "../../src/repository/errors.js";
import type {
    CommandAuthorization,
    MeetingRepositoryPort,
    RepositoryAuthorizationValidator,
    RepositoryCommand,
    SessionOwnershipInput
} from "../../src/repository/types.js";

export interface MeetingRepositoryHarness {
    open(authorizationValidator?: RepositoryAuthorizationValidator): Promise<MeetingRepositoryPort>;
    rejectCorruptedReadyState(): Promise<never>;
}

const authorization: CommandAuthorization = {
    callerBinding: "captain:1",
    capabilityId: "capability:1",
    attemptId: "attempt:1"
};

async function createMeeting(
    repository: MeetingRepositoryPort,
    input: Parameters<MeetingRepositoryPort["completeCreate"]>[0]
) {
    await repository.create(input);
    return repository.completeCreate(input);
}
function ownership(overrides: Partial<SessionOwnershipInput> = {}): SessionOwnershipInput {
    return {
        sessionId: "session-1",
        parentSessionId: "captain-session-1",
        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
        provider: "continuable-provider",
        role: "manager",
        lifecycleStatus: "provisioning",
        capabilityStatus: "active",
        ...overrides
    };
}

export function defineMeetingRepositoryBehaviorContract(
    name: string,
    harness: MeetingRepositoryHarness
): void {
    describe(name, () => {
        const openRepository = () => harness.open();
        const openCreatingRepository = async () => {
            const repository = await openRepository();
            await repository.create({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" }
            });
            return repository;
        };
        it("bootstraps an empty domain and returns an idempotent create receipt", async () => {
            const repository = await openRepository();
            const input = {
                requestId: "request-1",
                authorization,
                requestHash: "hash-1",
                initialState: { status: "created" as const }
            };

            const bootstrap = await repository.create(input);
            expect(bootstrap).toMatchObject({
                status: "creating",
                createRequestId: "request-1",
                requestHash: "hash-1"
            });
            await expect(repository.read()).rejects.toMatchObject<RepositoryError>({
                code: "MEETING_NOT_FOUND"
            });
            await expect(repository.create(input)).resolves.toEqual(bootstrap);
            const first = await repository.completeCreate(input);
            const duplicate = await repository.completeCreate(input);

            expect(first).toEqual(duplicate);
            expect(await repository.read()).toMatchObject({
                version: 0,
                state: { status: "created" }
            });
            await repository.close();
        });

        it("allows a separately authorized caller to complete the bootstrap", async () => {
            const repository = await openRepository();
            const creator = {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" as const }
            };
            const completer = {
                ...creator,
                authorization: {
                    callerBinding: "captain:2",
                    capabilityId: "capability:2"
                }
            };

            await repository.create(creator);
            const result = await repository.completeCreate(completer);

            expect(result.result).toEqual({ meetingId: "meeting-1", meetingVersion: 0 });
            expect(await repository.read()).toMatchObject({
                version: 0,
                state: { status: "created" }
            });
            await repository.close();
        });

        it("recovers a creating bootstrap without requiring a public meeting", async () => {
            const repository = await openRepository();
            await repository.create({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 10
            });
            await repository.recordSessionOwnership(
                {
                    sessionId: "session-1",
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                    provider: "test-continuable-provider",
                    role: "manager",
                    lifecycleStatus: "provisioning",
                    capabilityStatus: "active",
                    initialMessageId: "m1"
                },
                11
            );

            const recovery = await repository.recover({ now: 12 });

            expect(recovery).toMatchObject({
                bootstrap: { status: "creating" },
                sessionOwnership: [{ sessionId: "session-1" }],
                reclaimedOutbox: 0,
                pendingOutbox: 0
            });
            expect(recovery).not.toHaveProperty("snapshot");
            await repository.close();
        });

        it("rejects a conflicting idempotency hash and stale version", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });

            const command: RepositoryCommand<{ count: number }> = {
                requestId: "command-1",
                commandKind: "increment",
                authorization,
                requestHash: "command-hash",
                expectedMeetingVersion: 0,
                transition: (snapshot) => ({
                    state: { count: Number(snapshot.state.count) + 1 },
                    result: { count: Number(snapshot.state.count) + 1 },
                    events: [{ type: "message.added", payload: { count: 1 } }],
                    outbox: []
                })
            };

            await repository.execute(command);
            await expect(
                repository.execute({ ...command, requestHash: "different-hash" })
            ).rejects.toMatchObject<RepositoryError>({ code: "IDEMPOTENCY_CONFLICT" });
            await expect(
                repository.execute({ ...command, requestId: "command-2" })
            ).rejects.toMatchObject<RepositoryError>({ code: "VERSION_CONFLICT" });
            expect((await repository.read()).version).toBe(1);
            await repository.close();
        });

        it("keeps the embedded MeetingState version in sync for plain commands", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created", version: 0, updatedAt: 1 }
            });

            await repository.execute({
                requestId: "plain-command",
                commandKind: "raise_hand",
                authorization,
                requestHash: "plain-command-hash",
                expectedMeetingVersion: 0,
                transition: (snapshot) => ({
                    state: { ...snapshot.state, status: "waiting" },
                    result: { status: "waiting" },
                    events: [{ type: "hand_raise.created", payload: {} }],
                    outbox: []
                })
            });

            expect(await repository.read()).toMatchObject({
                version: 1,
                state: { version: 1, status: "waiting" }
            });
            await repository.close();
        });

        it("rolls back and preserves a transition validation error", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });
            const validationError = Object.assign(new Error("stale manager attempt"), {
                code: "STALE_MANAGER_ATTEMPT",
                retryable: false
            });

            await expect(
                repository.execute({
                    requestId: "invalid-transition",
                    commandKind: "submit_manager_plan",
                    authorization,
                    requestHash: "invalid-transition-hash",
                    expectedMeetingVersion: 0,
                    transition: () => {
                        throw validationError;
                    }
                })
            ).rejects.toBe(validationError);
            expect((await repository.read()).version).toBe(0);
            await repository.close();
        });

        it("uses the generic receipt for speaker attempts and manager plans", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });

            const submitSpeaker = (
                authorizationOverride: CommandAuthorization
            ): RepositoryCommand<{
                committed: string;
            }> => ({
                requestId: "speaker-attempt-1",
                commandKind: "submit_speaker_attempt",
                authorization: authorizationOverride,
                requestHash: "speaker-hash",
                expectedMeetingVersion: 0,
                transition: (snapshot) => ({
                    state: { count: Number(snapshot.state.count) + 1 },
                    result: { committed: "speaker-attempt-1" },
                    events: [{ type: "message.added", payload: { count: 1 } }],
                    outbox: []
                })
            });

            const speakerFirst = await repository.execute(submitSpeaker(authorization));
            const speakerDuplicate = await repository.execute(
                submitSpeaker({ ...authorization, attemptId: "different-attempt" })
            );
            expect(speakerDuplicate).toEqual(speakerFirst);

            const managerAuthorization = {
                ...authorization,
                attemptId: undefined,
                callerBinding: "manager:1"
            } satisfies CommandAuthorization;
            const submitManagerPlan: RepositoryCommand<{ committed: string }> = {
                requestId: "manager-plan-1",
                commandKind: "submit_manager_plan",
                authorization: managerAuthorization,
                requestHash: "manager-hash",
                expectedMeetingVersion: 1,
                transition: (snapshot) => ({
                    state: { count: Number(snapshot.state.count) + 1 },
                    result: { committed: "manager-plan-1" },
                    events: [{ type: "turn.planned", payload: { turnId: "turn-1" } }],
                    outbox: []
                })
            };

            const managerFirst = await repository.execute(submitManagerPlan);
            const managerDuplicate = await repository.execute(submitManagerPlan);
            expect(managerDuplicate).toEqual(managerFirst);
            expect((await repository.read()).version).toBe(2);
            await repository.close();
        });

        it("serializes Captain end against a same-version meeting fact command", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "running", completionFactIds: [] }
            });
            const endCommand: RepositoryCommand<{ status: string }> = {
                requestId: "end-1",
                commandKind: "end_meeting",
                authorization,
                requestHash: "end-hash",
                expectedMeetingVersion: 0,
                transition: (snapshot) => ({
                    state: { ...snapshot.state, status: "completed" },
                    result: { status: "completed" },
                    events: [{ type: "meeting.ended", payload: { status: "completed" } }],
                    outbox: []
                })
            };
            const meetingFactCommand = (expectedMeetingVersion: number) => ({
                requestId: `fact-${expectedMeetingVersion}`,
                commandKind: "associate_task_snapshot",
                authorization: { ...authorization, callerBinding: "participant:1" },
                requestHash: `fact-hash-${expectedMeetingVersion}`,
                expectedMeetingVersion,
                transition: (snapshot: Awaited<ReturnType<MeetingRepositoryPort["read"]>>) => {
                    if (snapshot.state.status === "completed") {
                        throw Object.assign(new Error("terminal meeting is immutable"), {
                            code: "IMMUTABLE_MEETING",
                            retryable: false
                        });
                    }
                    return {
                        state: { ...snapshot.state, completionFactIds: ["task-fact-1"] },
                        result: { completionFactId: "task-fact-1" },
                        events: [
                            {
                                type: "completion_fact.added" as const,
                                payload: { completionFactId: "task-fact-1" }
                            }
                        ],
                        outbox: []
                    };
                }
            });

            const [endResult, factResult] = await Promise.allSettled([
                repository.execute(endCommand),
                repository.execute(meetingFactCommand(0))
            ]);

            expect(endResult.status).toBe("fulfilled");
            expect(factResult).toMatchObject({
                status: "rejected",
                reason: { code: "VERSION_CONFLICT" }
            });
            await expect(repository.execute(meetingFactCommand(1))).rejects.toMatchObject({
                code: "IMMUTABLE_MEETING"
            });
            expect(await repository.read()).toMatchObject({
                version: 1,
                state: { status: "completed", completionFactIds: [] }
            });
            await repository.close();
        });

        it("rejects stale outbox completion after lease expiry and reclaims the item", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 0,
                outbox: [
                    {
                        deliveryId: "delivery-1",
                        kind: "dispatch",
                        payload: { meetingId: "meeting-1" }
                    }
                ]
            });

            const first = await repository.claimOutbox({
                owner: "worker-a",
                ttlMs: 10,
                batchSize: 1,
                now: 100
            });
            const second = await repository.claimOutbox({
                owner: "worker-b",
                ttlMs: 100,
                batchSize: 1,
                now: 111
            });

            expect(first).toHaveLength(1);
            expect(second[0]?.leaseOwner).toBe("worker-b");
            await expect(
                repository.completeOutbox({
                    id: first[0].id,
                    leaseOwner: first[0].leaseOwner,
                    leaseToken: first[0].leaseToken,
                    completion: { status: "delivered" }
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "LEASE_LOST" });
            await expect(
                repository.completeOutbox({
                    id: second[0].id,
                    leaseOwner: second[0].leaseOwner,
                    leaseToken: second[0].leaseToken,
                    completion: { status: "delivered" },
                    now: 112
                })
            ).resolves.toMatchObject({ status: "delivered" });
            await repository.close();
        });

        it("renews an owned outbox lease before a long dispatch completes", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 0,
                outbox: [
                    {
                        deliveryId: "delivery-1",
                        kind: "dispatch",
                        payload: { meetingId: "meeting-1" }
                    }
                ]
            });
            const [lease] = await repository.claimOutbox({
                owner: "worker-a",
                ttlMs: 10,
                batchSize: 1,
                now: 100
            });

            await expect(
                repository.renewOutboxLease({
                    id: lease.id,
                    leaseOwner: lease.leaseOwner,
                    leaseToken: lease.leaseToken,
                    ttlMs: 10,
                    now: 105
                })
            ).resolves.toBe(115);
            await expect(
                repository.completeOutbox({
                    id: lease.id,
                    leaseOwner: lease.leaseOwner,
                    leaseToken: lease.leaseToken,
                    completion: { status: "delivered" },
                    now: 111
                })
            ).resolves.toMatchObject({ status: "delivered" });
            await repository.close();
        });

        it("replays a committed command without rerunning its transition or duplicating outbox", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });
            let transitionCalls = 0;
            const command: RepositoryCommand<{ count: number }> = {
                requestId: "command-1",
                commandKind: "increment",
                authorization,
                requestHash: "command-hash",
                expectedMeetingVersion: 0,
                transition: (snapshot) => {
                    transitionCalls += 1;
                    return {
                        state: { count: Number(snapshot.state.count) + 1 },
                        result: { count: 1 },
                        events: [{ type: "message.added", payload: { count: 1 } }],
                        outbox: [
                            {
                                deliveryId: "delivery-1",
                                kind: "dispatch",
                                payload: { count: 1 }
                            }
                        ]
                    };
                }
            };

            const first = await repository.execute(command);
            const replay = await repository.execute(command);

            expect(replay).toEqual(first);
            expect(transitionCalls).toBe(1);
            expect((await repository.read()).version).toBe(1);
            expect((await repository.recover()).pendingOutbox).toBe(1);
            await repository.close();
        });

        it("rejects completion after expiry even before another worker claims the item", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 0,
                outbox: [
                    {
                        deliveryId: "delivery-1",
                        kind: "dispatch",
                        payload: { meetingId: "meeting-1" }
                    }
                ]
            });
            const [lease] = await repository.claimOutbox({
                owner: "worker-a",
                ttlMs: 10,
                batchSize: 1,
                now: 100
            });

            await expect(
                repository.completeOutbox({
                    id: lease.id,
                    leaseOwner: lease.leaseOwner,
                    leaseToken: lease.leaseToken,
                    completion: { status: "delivered" },
                    now: 111
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "LEASE_LOST" });
            await repository.close();
        });

        it("persists bootstrap and session ownership for recovery", async () => {
            const repository = await openRepository();
            await repository.create({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 10
            });
            await repository.recordSessionOwnership(
                {
                    sessionId: "session-1",
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                    provider: "test-continuable-provider",
                    role: "manager",
                    lifecycleStatus: "provisioning",
                    capabilityStatus: "active"
                },
                12
            );
            await repository.recordSessionOwnership(
                {
                    sessionId: "session-1",
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                    provider: "test-continuable-provider",
                    role: "manager",
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked"
                },
                13
            );
            await expect(
                repository.recordSessionOwnership(
                    {
                        sessionId: "session-1",
                        parentSessionId: "captain-session-1",
                        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                        provider: "test-continuable-provider",
                        role: "manager",
                        lifecycleStatus: "active",
                        capabilityStatus: "active"
                    },
                    14
                )
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });

            await repository.completeCreate({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" },
                createdAt: 14
            });

            await expect(repository.recover({ now: 15 })).resolves.toMatchObject({
                bootstrap: {
                    status: "ready",
                    createRequestId: "create",
                    requestHash: "create-hash",
                    createResult: { meetingId: "meeting-1", meetingVersion: 0 },
                    createdAt: 10,
                    updatedAt: 14
                },
                sessionOwnership: [
                    {
                        sessionId: "session-1",
                        lifecycleStatus: "closed",
                        capabilityStatus: "revoked",
                        createdAt: 12,
                        updatedAt: 13
                    }
                ]
            });
            await repository.close();
        });

        it("requires the authorization validator before a new command commits", async () => {
            const rejecting: RepositoryAuthorizationValidator = {
                validateCreate: () => undefined,
                validateCommand: () => {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        "meeting-1",
                        "Capability is revoked"
                    );
                }
            };
            const repository = await harness.open(rejecting);
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });
            await expect(
                repository.execute({
                    requestId: "command",
                    commandKind: "increment",
                    authorization,
                    requestHash: "command-hash",
                    expectedMeetingVersion: 0,
                    transition: () => ({
                        state: { count: 1 },
                        result: { count: 1 },
                        events: [
                            { type: "hand_raise.created", payload: { handRaiseId: "hand-1" } }
                        ],
                        outbox: []
                    })
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("rejects a session label whose meeting segment only contains the requested id", async () => {
            const repository = await openCreatingRepository();
            await expect(
                repository.recordSessionOwnership({
                    sessionId: "session-1",
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-10",
                    provider: "test-continuable-provider",
                    role: "manager",
                    lifecycleStatus: "provisioning",
                    capabilityStatus: "active"
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_INPUT" });
            await repository.close();
        });

        it("rejects attempts to rewrite immutable session ownership identity", async () => {
            const repository = await openRepository();
            await repository.create({
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { status: "created" }
            });
            await repository.recordSessionOwnership({
                sessionId: "session-1",
                parentSessionId: "captain-session-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "test-continuable-provider",
                role: "manager",
                lifecycleStatus: "provisioning",
                capabilityStatus: "active"
            });

            await expect(
                repository.recordSessionOwnership({
                    sessionId: "session-1",
                    parentSessionId: "captain-session-1",
                    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-1",
                    provider: "test-continuable-provider",
                    initialMessageId: "initial-message-1",
                    role: "participant",
                    participantId: "participant-1",
                    lifecycleStatus: "active",
                    capabilityStatus: "active"
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("maps corrupted persisted state to RepositoryError", async () => {
            await expect(
                harness.rejectCorruptedReadyState()
            ).rejects.toMatchObject<RepositoryError>({
                code: "CORRUPT_DATABASE",
                meetingId: "meeting-1",
                retryable: false
            });
        });

        it("rejects unregistered outbox kinds before committing a create", async () => {
            const repository = await openRepository();
            await expect(
                createMeeting(repository, {
                    requestId: "create",
                    authorization,
                    requestHash: "create-hash",
                    initialState: { status: "created" },
                    outbox: [
                        {
                            deliveryId: "delivery-1",
                            kind: "unknown" as never,
                            payload: { meetingId: "meeting-1" }
                        }
                    ]
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_INPUT" });
            await repository.close();
        });

        it("rejects a state transition that has no domain event", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });

            await expect(
                repository.execute({
                    requestId: "eventless",
                    commandKind: "increment",
                    authorization,
                    requestHash: "eventless-hash",
                    expectedMeetingVersion: 0,
                    transition: () => ({
                        state: { count: 1 },
                        result: { count: 1 },
                        events: [],
                        outbox: []
                    })
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
            await repository.close();
        });

        it("persists an explicitly allowed no-op receipt without changing state", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create",
                authorization,
                requestHash: "create-hash",
                initialState: { count: 0 }
            });
            const command = {
                commandKind: "raise_hand",
                authorization,
                requestHash: "duplicate-hand-raise",
                expectedMeetingVersion: 0,
                allowNoop: true,
                transition: (snapshot: { state: Record<string, unknown> }) => ({
                    state: snapshot.state,
                    result: { handRaiseId: "existing-raise" },
                    events: [],
                    outbox: []
                })
            };
            const first = await repository.execute({ ...command, requestId: "duplicate-1" });
            expect(first).toMatchObject({
                meetingVersion: 0,
                eventSeqs: []
            });
            await expect(
                repository.execute({ ...command, requestId: "duplicate-1" })
            ).resolves.toEqual(first);
            await expect(
                repository.execute({
                    ...command,
                    requestId: "duplicate-1",
                    requestHash: "changed-hand-raise"
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "IDEMPOTENCY_CONFLICT" });
            expect(await repository.read()).toMatchObject({ version: 0, state: { count: 0 } });
            await repository.close();
        });

        it("keeps private mail lifecycle atomic, idempotent, and out of MeetingState", async () => {
            const repository = await openRepository();
            await createMeeting(repository, {
                requestId: "create-mail",
                authorization,
                requestHash: "create-mail-hash",
                initialState: {
                    status: "running",
                    messageSeq: 2,
                    participants: [{ id: "p1" }, { id: "p2" }],
                    transcript: [
                        { id: "m1", seq: 1 },
                        { id: "m2", seq: 2 }
                    ]
                }
            });
            await repository.recordSessionOwnership(
                {
                    sessionId: "participant-session-2",
                    parentSessionId: "parent-session",
                    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:p2",
                    provider: "test",
                    role: "participant",
                    participantId: "p2",
                    lifecycleStatus: "active",
                    capabilityStatus: "active",
                    initialMessageId: "m1"
                },
                1
            );
            const send = {
                requestId: "mail-request",
                requestHash: "mail-hash",
                authorization,
                expectedMeetingVersion: 0,
                isNewDeliveryAvailable: vi.fn(() => true),
                mail: {
                    mailId: "mail-1",
                    meetingId: "meeting-1",
                    senderParticipantId: "p1",
                    recipientParticipantId: "p2",
                    content: "private",
                    meetingContext: {
                        meetingId: "meeting-1",
                        contextFromSeq: 0,
                        contextThroughSeq: 2,
                        relevantMessageIds: ["m1", "m2"],
                        snapshotSummary: "summary"
                    },
                    handlingAttemptId: "attempt-1",
                    snapshotThroughSeq: 2,
                    createdAt: 10
                },
                outbox: {
                    deliveryId: "delivery-1",
                    kind: "dispatch" as const,
                    priority: 0,
                    payload: { role: "meeting_mail", mailId: "mail-1", participantId: "p2" }
                }
            };
            const sent = await repository.sendPrivateMeetingMail(send);
            expect(send.isNewDeliveryAvailable).toHaveBeenCalledTimes(1);
            expect(await repository.sendPrivateMeetingMail(send)).toEqual(sent);
            expect(send.isNewDeliveryAvailable).toHaveBeenCalledTimes(1);
            await expect(
                repository.sendPrivateMeetingMail({
                    ...send,
                    requestId: "mail-request-unavailable",
                    requestHash: "mail-hash-unavailable",
                    isNewDeliveryAvailable: () => false,
                    mail: { ...send.mail, mailId: "mail-unavailable" },
                    outbox: {
                        ...send.outbox,
                        deliveryId: "delivery-unavailable",
                        payload: { ...send.outbox.payload, mailId: "mail-unavailable" }
                    }
                })
            ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
            expect((await repository.read()).state).not.toHaveProperty("mailbox");
            expect(await repository.readPrivateMeetingMail("mail-1")).toMatchObject({
                status: "pending",
                snapshotThroughSeq: 2
            });
            const processing = await repository.startPrivateMeetingMail({
                requestId: "start-mail",
                requestHash: "start-mail-hash",
                authorization,
                expectedMeetingVersion: 0,
                mailId: "mail-1",
                processingThroughSeq: 2,
                deliveryId: "delivery-1",
                deadlineAt: 110,
                now: 10
            });
            expect(processing).toMatchObject({
                status: "processing",
                deliveryId: "delivery-1",
                deadlineAt: 110
            });
            await expect(
                repository.startPrivateMeetingMail({
                    requestId: "start-mail-2",
                    requestHash: "start-mail-2-hash",
                    authorization,
                    expectedMeetingVersion: 0,
                    mailId: "mail-1",
                    processingThroughSeq: 1,
                    deliveryId: "drifted",
                    deadlineAt: 120,
                    now: 10
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            const finished = await repository.finishPrivateMeetingMail({
                requestId: "finish-mail",
                requestHash: "finish-mail-hash",
                authorization,
                expectedMeetingVersion: 0,
                mailId: "mail-1",
                handlingAttemptId: "attempt-1",
                deliveryId: "delivery-1",
                status: "processed",
                now: 20
            });
            expect(finished.status).toBe("processed");
            await expect(
                repository.finishPrivateMeetingMail({
                    requestId: "late-mail",
                    requestHash: "late-mail-hash",
                    authorization,
                    expectedMeetingVersion: 0,
                    mailId: "mail-1",
                    handlingAttemptId: "attempt-1",
                    deliveryId: "delivery-1",
                    status: "failed",
                    now: 30
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("persists immutable parent/provider and permits one initial-message write", async () => {
            const repository = await openCreatingRepository();
            await expect(repository.recordSessionOwnership(ownership())).resolves.toMatchObject({
                parentSessionId: "captain-session-1",
                provider: "continuable-provider",
                lifecycleStatus: "provisioning"
            });

            await expect(
                repository.recordSessionOwnership(
                    ownership({ lifecycleStatus: "active", initialMessageId: "message-1" })
                )
            ).resolves.toMatchObject({ initialMessageId: "message-1", lifecycleStatus: "active" });
            await expect(
                repository.recordSessionOwnership(
                    ownership({ lifecycleStatus: "closed", capabilityStatus: "revoked" })
                )
            ).resolves.toMatchObject({ initialMessageId: "message-1", lifecycleStatus: "closed" });

            await expect(
                repository.recordSessionOwnership(
                    ownership({
                        lifecycleStatus: "closed",
                        capabilityStatus: "revoked",
                        initialMessageId: "message-2"
                    })
                )
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("rejects immutable ownership rewrites and active sessions without an initial message", async () => {
            const repository = await openCreatingRepository();
            await repository.recordSessionOwnership(ownership());

            await expect(
                repository.recordSessionOwnership(ownership({ parentSessionId: "other-captain" }))
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await expect(
                repository.recordSessionOwnership(ownership({ provider: "other-provider" }))
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await expect(
                repository.recordSessionOwnership(ownership({ lifecycleStatus: "active" }))
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("rejects labels and participant identities that cross the repository boundary", async () => {
            const repository = await openCreatingRepository();
            await expect(
                repository.recordSessionOwnership(
                    ownership({ sessionLabel: "convivium:meeting-manager:other-team:meeting-1" })
                )
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_INPUT" });
            await expect(
                repository.recordSessionOwnership(
                    ownership({
                        sessionId: "participant-session",
                        sessionLabel:
                            "convivium:meeting-participant:team-1:meeting-1:participant-1",
                        role: "participant",
                        participantId: "participant-1"
                    })
                )
            ).resolves.toMatchObject({ participantId: "participant-1" });
            await expect(
                repository.recordSessionOwnership(
                    ownership({
                        sessionId: "participant-session",
                        sessionLabel:
                            "convivium:meeting-participant:team-1:meeting-1:participant-1",
                        role: "participant",
                        participantId: "participant-2"
                    })
                )
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });

        it("does not reactivate a revoked capability or reopen a closed session", async () => {
            const repository = await openCreatingRepository();
            await repository.recordSessionOwnership(ownership({ initialMessageId: "message-1" }));
            await repository.recordSessionOwnership(
                ownership({ lifecycleStatus: "closed", capabilityStatus: "revoked" })
            );
            await expect(
                repository.recordSessionOwnership(
                    ownership({ lifecycleStatus: "active", capabilityStatus: "active" })
                )
            ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
            await repository.close();
        });
    });
}
