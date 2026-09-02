import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import { endMeeting, type MeetingState } from "../../src/domain/index.js";
import { DomainRepositoryRegistry } from "../../src/repository/domain/domain-repository-registry.js";
import type { JsonObject, RepositoryCommand } from "../../src/repository/types.js";
import { jsonlStoragePlugin } from "../../src/storage/index.js";
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

    it("reopens the same complete terminal snapshot and receipt from Storage Domain", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-completion-recovery-"));
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
            decisionCandidates: [],
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
        const context = new Context();
        const reopenedContext = new Context();
        let firstRegistry: DomainRepositoryRegistry | undefined;
        let reopenedRegistry: DomainRepositoryRegistry | undefined;

        try {
            await context.plugin(Storage);
            await context.plugin(jsonlStoragePlugin, { root: join(root, "storage") });
            await context.plugin(
                {
                    name: storageDomainPlugin.name,
                    inject: storageDomainPlugin.inject,
                    apply: storageDomainPlugin.apply
                },
                { backend: "convivium-jsonl" }
            );
            const create = {
                requestId: "create-1",
                authorization,
                requestHash: "create-hash",
                initialState: initialState as unknown as JsonObject,
                createdAt: 10
            };
            firstRegistry = await DomainRepositoryRegistry.open({
                storageDomain: context.storageDomain,
                authorizationValidator: validator
            });
            const first = await firstRegistry.openMeeting({
                teamId: "team-1",
                meetingId: "meeting-1",
                create
            });
            await first.completeCreate({
                ...create
            });
            const ended = await first.execute(command);
            await firstRegistry.close();
            await context.fiber.dispose();

            await reopenedContext.plugin(Storage);
            await reopenedContext.plugin(jsonlStoragePlugin, { root: join(root, "storage") });
            await reopenedContext.plugin(
                {
                    name: storageDomainPlugin.name,
                    inject: storageDomainPlugin.inject,
                    apply: storageDomainPlugin.apply
                },
                { backend: "convivium-jsonl" }
            );

            reopenedRegistry = await DomainRepositoryRegistry.open({
                storageDomain: reopenedContext.storageDomain,
                authorizationValidator: validator
            });
            const reopened = await reopenedRegistry.openMeeting({
                teamId: "team-1",
                meetingId: "meeting-1"
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
            await reopenedRegistry.close();
        } finally {
            await reopenedRegistry?.close();
            await firstRegistry?.close();
            await reopenedContext.fiber.dispose();
            await context.fiber.dispose();
            await rm(root, { recursive: true, force: true });
        }
    });
});
