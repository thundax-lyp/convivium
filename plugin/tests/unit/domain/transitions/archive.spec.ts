import { describe, expect, it } from "vitest";
import { transitionMeeting } from "../../../../src/domain/index.js";
import { archivePackage, meeting, now } from "./fixtures.js";

describe("archive transitions", () => {
    it("requires a materialized archive before archived", () => {
        const archivingMeeting = meeting("archiving");
        expect(() => transitionMeeting(archivingMeeting, "archived", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_ARCHIVE" })
        );

        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: archivePackage() }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });
        expect(result.state.archive?.package.meetingId).toBe("meeting-1");
        expect(result.state.archive?.archivedAt).toBe(now);
    });

    it("rejects an archive package that disagrees with the terminal facts", () => {
        const archive = archivePackage();
        archive.termination = {
            ...archive.termination,
            finalMessage: "different"
        };
        expect(() =>
            transitionMeeting(meeting("completed"), "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects an archive package with an external artifact without changing the meeting", () => {
        const state = meeting("completed");
        state.artifactRefs = [{ artifactId: "artifact-1", title: "committed" }];
        const before = structuredClone(state);
        const archive = archivePackage();
        archive.artifactRefs = [{ artifactId: "artifact-external", title: "external" }];

        expect(() =>
            transitionMeeting(state, "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(state).toEqual(before);
        expect(state.status).toBe("completed");
    });

    it("requires archive packages to include committed facts", () => {
        const state = meeting("completed");
        state.transcript = [
            {
                id: "message-1",
                seq: 1,
                turnSeq: 1,
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                speaker: "participant-1",
                agendaItemId: "agenda-1",
                agendaRelation: "on_topic",
                kind: "statement",
                mentions: [],
                taskIds: [],
                createdAt: now,
                content: "committed fact"
            }
        ];

        expect(() =>
            transitionMeeting(state, "archiving", {
                now,
                archive: { package: archivePackage() }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("accepts Captain waiver facts during archive validation", () => {
        const state = meeting("partial");
        const waiver: CompletionFact = {
            id: "waiver-1",
            kind: "waiver",
            subjectId: "agenda-1",
            assertedBy: "captain:captain-1",
            authority: "captain",
            result: "waived",
            evidenceMessageIds: [],
            taskIds: [],
            reason: "Captain accepts the partial result",
            status: "active",
            createdAt: now
        };
        state.completionFacts = [waiver];
        const archive = archivePackage();
        archive.termination = state.termination!;
        archive.completionFacts = [waiver];

        expect(() =>
            transitionMeeting(state, "archiving", {
                now,
                archive: { package: archive }
            })
        ).not.toThrow();
    });

    it("rejects archive cross-references that are not meeting facts", () => {
        const archive = archivePackage();
        archive.proposals = [
            {
                id: "proposal-1",
                agendaItemId: "missing-agenda",
                title: "proposal",
                description: "proposal",
                revision: 1,
                status: "draft",
                positions: []
            }
        ];
        expect(() =>
            transitionMeeting(meeting("completed"), "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects termination references to unknown positions and agenda items", () => {
        const state = meeting("running");
        expect(() =>
            transitionMeeting(state, "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: ["missing-position"],
                    blockingAgendaItemIds: ["missing-agenda"],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects archive facts from another meeting or team", () => {
        const archive = archivePackage();
        archive.meetingId = "meeting-2";
        expect(() =>
            transitionMeeting(
                transitionMeeting(meeting("completed"), "archiving", {
                    now,
                    archive: { package: archivePackage() }
                }).state,
                "archived",
                {
                    now,
                    archive: { package: archive, archivedAt: now }
                }
            )
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("revokes active attempts before entering archiving", () => {
        const state = meeting("completed");
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: [],
            status: "running",
            currentStepIndex: 0,
            steps: [
                {
                    id: "step-1",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        participantId: "participant-1",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        status: "running",
                        deliveryStatus: "acknowledged",
                        contextFromSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        contextThroughSeq: 0
                    }
                }
            ]
        };

        const result = transitionMeeting(state, "archiving", {
            now,
            archive: { package: archivePackage() }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.effect.events.map(({ type }) => type)).toContain("speaker_attempt.revoked");
    });

    it("snapshots termination facts before returning the terminal state", () => {
        const termination = {
            code: "objective_satisfied" as const,
            reason: "done",
            decisionIds: [] as string[],
            unresolvedQuestionIds: [] as string[],
            dissentingPositionIds: [] as string[],
            blockingAgendaItemIds: [] as string[],
            finalMessage: "done",
            endedAt: now
        };
        const result = transitionMeeting(meeting("running"), "completed", {
            now,
            termination
        });

        termination.decisionIds.push("mutated-after-transition");
        termination.finalMessage = "mutated-after-transition";
        expect(result.state.termination?.decisionIds).toEqual([]);
        expect(result.state.termination?.finalMessage).toBe("done");
    });

    it("snapshots the archive so later input mutation cannot change committed state", () => {
        const input = { package: archivePackage(), archivedAt: now };
        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: input.package }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });

        input.package.finalSummary = "mutated after transition";
        expect(result.state.archive?.package.finalSummary).toBe("summary");
    });
});
