import {
    beginArchiveFromTermination,
    terminationIdentity
} from "@/runtime/services/meeting-archive-service.js";
import type { LegacyMeetingState } from "@/domain/model.js";
import type { RepositoryCommand } from "@/repository/types.js";
import { describe, expect, it } from "vitest";

describe("meeting termination archival", () => {
    const terminal = (): LegacyMeetingState => ({
        formatVersion: 2,
        id: "meeting-1",
        teamId: "team-1",
        status: "completed",
        participants: [],
        manager: { promptVersion: "test", status: "idle" },
        agenda: [],
        topic: "topic",
        objective: "objective",
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
        meetingTasks: [],
        completionFacts: [],
        attendanceRecommendations: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        managerPlanningSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "hybrid",
        limits: {
            maxTurns: 10,
            maxSpeakersPerTurn: 5,
            maxTotalMessages: 100,
            maxConsecutiveSpeechesPerSpeaker: 3,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 5,
            maxStalls: 3,
            maxReplans: 1
        },
        version: 4,
        createdAt: 1,
        updatedAt: 2,
        termination: {
            code: "objective_satisfied",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "done",
            endedAt: 3
        }
    });

    it("uses one stable internal receipt and materializes the committed terminal snapshot", async () => {
        const committed = terminal();
        let command: RepositoryCommand<{ status: "archiving" }> | undefined;
        await beginArchiveFromTermination({
            repository: {
                execute: async (received) => {
                    command = received;
                    const transition = received.transition({
                        teamId: committed.teamId,
                        meetingId: committed.id,
                        version: committed.version,
                        state: committed as never,
                        createdAt: committed.createdAt,
                        updatedAt: committed.updatedAt
                    });
                    expect(transition.state).toMatchObject({
                        status: "archiving",
                        archive: { package: { materializedAt: 9, finalSummary: "done" } }
                    });
                    expect(transition.events.map((event) => event.type)).toEqual([
                        "meeting.archiving"
                    ]);
                    return {
                        requestId: received.requestId,
                        meetingId: committed.id,
                        meetingVersion: 5,
                        result: transition.result,
                        eventSeqs: [1]
                    };
                }
            },
            terminal: committed,
            now: 9
        });

        const identity = terminationIdentity(committed);
        expect(command).toMatchObject({
            requestId: `internal:archive:${identity}`,
            commandKind: "internal_archive_begin",
            authorization: {
                callerBinding: `internal:termination:${identity}`,
                capabilityId: `internal:termination:${identity}`
            },
            expectedMeetingVersion: 4
        });
    });

    it("rejects a non-terminal input and a snapshot with a different termination", async () => {
        await expect(
            beginArchiveFromTermination({
                repository: { execute: async () => ({}) as never },
                terminal: { ...terminal(), status: "running" },
                now: 9
            })
        ).rejects.toThrow(/execution-terminal/);

        const committed = terminal();
        await expect(
            beginArchiveFromTermination({
                repository: {
                    execute: async (received) => {
                        received.transition({
                            teamId: committed.teamId,
                            meetingId: committed.id,
                            version: committed.version,
                            state: {
                                ...committed,
                                termination: { ...committed.termination!, endedAt: 4 }
                            } as never,
                            createdAt: committed.createdAt,
                            updatedAt: committed.updatedAt
                        });
                        return {} as never;
                    }
                },
                terminal: committed,
                now: 9
            })
        ).rejects.toThrow(/does not match/);
    });
});
