import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { endMeeting, type MeetingState } from "../../src/domain/index.js";
import {
    MeetingRepository,
    type JsonObject,
    type RepositoryCommand
} from "../../src/repository/index.js";
import {
    pauseMeetingRuntime,
    type PauseRecoveryDependencies
} from "../../src/runtime/application-service/meeting-control.js";
import { rebindCaptainParent } from "../../src/runtime/services/meeting-recovery-service.js";

const ownership = {
    sessionId: "participant-session",
    parentSessionId: "captain-session",
    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
    provider: "spawn",
    role: "participant" as const,
    participantId: "participant-a",
    lifecycleStatus: "active" as const,
    capabilityStatus: "active" as const,
    createdAt: 1,
    updatedAt: 1
};

function pauseDependencies(overrides: Partial<PauseRecoveryDependencies> = {}) {
    const recorded: unknown[] = [];
    const interrupted: unknown[] = [];
    const dependencies: PauseRecoveryDependencies = {
        repository: {
            execute: async (command) => ({
                requestId: command.requestId,
                meetingId: "meeting-1",
                meetingVersion: 1,
                result: { status: "paused", changed: true },
                eventSeqs: [1]
            }),
            recordSessionOwnership: async (value) => {
                recorded.push(value);
                return value as never;
            }
        },
        authorization: { callerBinding: "session:captain", capabilityId: "captain:captain" },
        requestId: "pause-1",
        expectedMeetingVersion: 0,
        reason: "operator request",
        ownerships: [ownership],
        parent: { id: "captain-session" } as never,
        lifecycle: {
            interrupt: (...args) => interrupted.push(args),
            drainContinuableChildren: async (...args) => interrupted.push(args)
        },
        signal: new AbortController().signal,
        now: () => 10,
        ...overrides
    };
    return { dependencies, recorded, interrupted };
}

describe("recovery controls", () => {
    it("revokes ownership before interrupting and closes after exact drain", async () => {
        const { dependencies, recorded, interrupted } = pauseDependencies();
        await pauseMeetingRuntime(dependencies);
        expect(recorded).toEqual([
            expect.objectContaining({ capabilityStatus: "revoked", lifecycleStatus: "active" }),
            expect.objectContaining({ capabilityStatus: "revoked", lifecycleStatus: "closed" })
        ]);
        expect(interrupted).toHaveLength(2);
    });

    it("revokes without touching DSH when the Captain parent is absent", async () => {
        const { dependencies, recorded, interrupted } = pauseDependencies({ parent: undefined });
        const result = await pauseMeetingRuntime(dependencies);
        expect(result).toMatchObject({ revokedOwnerships: 1 });
        expect(recorded).toHaveLength(1);
        expect(interrupted).toEqual([]);
    });

    it("does not rebind an Agent with a different persisted parent id", async () => {
        await expect(
            rebindCaptainParent({
                parent: { id: "wrong-captain" } as never,
                expectedParentSessionId: "captain-session",
                meetingId: "meeting-1",
                ownerships: [ownership],
                inspection: { listDescendants: async () => [] },
                signal: new AbortController().signal
            })
        ).rejects.toThrow(/exact persisted parent/);
    });

    it("reopens the same complete terminal snapshot and receipt from SQLite", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-completion-recovery-"));
        const databasePath = join(root, "meeting.sqlite");
        const authorization = {
            callerBinding: "session:captain-1",
            capabilityId: "captain:captain-1"
        };
        const validator = {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        };
        const initialState = {
            id: "meeting-1",
            teamId: "team-1",
            status: "converging",
            participants: [],
            manager: { promptVersion: "test", status: "idle" },
            agenda: [],
            topic: "Topic",
            objective: "Objective",
            objectiveContract: {
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                requiredReviewers: [],
                riskAcceptanceAuthority: [],
                acceptableRiskLevel: "low"
            },
            issues: [],
            agendaCandidates: [],
            transcript: [],
            proposals: [],
            decisions: [],
            openQuestions: [],
            handRaises: [],
            completionFacts: [],
            artifactRefs: [],
            continuationMaterials: [],
            turnSeq: 1,
            messageSeq: 1,
            eventSeq: 1,
            stallCount: 0,
            replanCount: 0,
            selectionMode: "round_robin",
            limits: {
                maxTurns: 10,
                maxSpeakersPerTurn: 5,
                maxTotalMessages: 100,
                maxConsecutiveSpeechesPerSpeaker: 2,
                maxConsecutiveAttemptFailuresPerParticipant: 3,
                maxDeliveryRetries: 5,
                maxStalls: 3,
                maxReplans: 1
            },
            version: 1,
            createdAt: 10,
            updatedAt: 20
        } as MeetingState;
        const command: RepositoryCommand<{ status: string; terminationCode: string }> = {
            requestId: "end-1",
            commandKind: "end_meeting",
            authorization,
            requestHash: "end-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => {
                const transition = endMeeting(snapshot.state as unknown as MeetingState, {
                    meetingId: "meeting-1",
                    captainBinding: "captain:captain-1",
                    outcome: "completed",
                    reason: "Objective satisfied",
                    acceptedDecisionIds: [],
                    deferredAgendaItemIds: [],
                    waivers: [],
                    now: 30,
                    factId: (index) => `waiver-${index}`
                });
                return {
                    state: transition.state as unknown as JsonObject,
                    result: {
                        status: transition.state.status,
                        terminationCode: transition.state.termination!.code
                    },
                    events: transition.effect.events as never,
                    outbox: []
                };
            }
        };
        let first: MeetingRepository | undefined;
        let reopened: MeetingRepository | undefined;

        try {
            first = await MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: validator
            });
            await first.create({
                requestId: "create-1",
                authorization,
                requestHash: "create-hash",
                initialState: initialState as unknown as JsonObject,
                createdAt: 10
            });
            await first.completeCreate({
                requestId: "create-1",
                authorization,
                requestHash: "create-hash",
                initialState: initialState as unknown as JsonObject,
                createdAt: 10
            });
            const ended = await first.execute(command);
            await first.close();

            reopened = await MeetingRepository.open({
                databasePath,
                teamId: "team-1",
                meetingId: "meeting-1",
                authorizationValidator: validator
            });
            const recovered = await reopened.recover({ now: 40 });
            expect(recovered.snapshot).toMatchObject({
                version: 1,
                state: {
                    status: "completed",
                    termination: {
                        code: "objective_satisfied",
                        reason: "Objective satisfied",
                        endedAt: 30
                    }
                }
            });
            await expect(reopened.execute(command)).resolves.toEqual(ended);
            expect((await reopened.read()).version).toBe(1);
            await reopened.close();
        } finally {
            await reopened?.close();
            await first?.close();
            await rm(root, { recursive: true, force: true });
        }
    });
});
