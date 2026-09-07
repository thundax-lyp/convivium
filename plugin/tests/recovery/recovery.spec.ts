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

describe("recovery controls", () => {
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
            managerPlanningSeq: 0,
            progressFingerprint: "fingerprint-1",
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
            updatedAt: 20,
            formatVersion: 2,
            attendanceRecommendations: []
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
            expect((await first.read()).state).toMatchObject({
                managerPlanningSeq: 0,
                progressFingerprint: "fingerprint-1",
                stallCount: 0,
                replanCount: 0
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
                    managerPlanningSeq: 0,
                    progressFingerprint: "fingerprint-1",
                    stallCount: 0,
                    replanCount: 0,
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
