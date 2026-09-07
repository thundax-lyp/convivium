import { materializeArchivePackage } from "../../../../src/runtime/services/meeting-archive-service.js";
import { describe, expect, it } from "vitest";
import {
    transitionMeeting,
    failSpeakerAttempt,
    reassignTurn
} from "../../../../src/domain/index.js";
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

    it("requires every committed proposal revision in the archive", () => {
        const state = meeting("completed");
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Decide",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "resolved"
            }
        ];
        state.proposals = [
            {
                id: "proposal-1",
                title: "Old",
                description: "Old",
                proposedBy: "participant-1",
                revision: 1,
                status: "superseded",
                agendaItemId: "agenda-1",
                positions: [],
                createdAt: now - 1,
                updatedAt: now - 1
            },
            {
                id: "proposal-1",
                title: "New",
                description: "New",
                proposedBy: "participant-1",
                revision: 2,
                status: "under_review",
                agendaItemId: "agenda-1",
                positions: [],
                createdAt: now - 1,
                updatedAt: now
            }
        ];
        const archive = archivePackage();
        archive.agenda = state.agenda;
        archive.proposals = [state.proposals[1]!];

        expect(() =>
            transitionMeeting(state, "archiving", { now, archive: { package: archive } })
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

function minutesArchiveState() {
    const state = meeting("completed");
    state.meetingTasks = [];
    state.agenda = [
        {
            id: "agenda-1",
            title: "Agenda",
            objective: "Objective",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: [],
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.participants = ["a", "b"].map((id) => ({
        id,
        displayName: id,
        status: "available" as const,
        consecutiveSpeeches: 0,
        consecutiveAttemptFailures: 0,
        totalSpeeches: 0,
        lastDeliveredSeq: 0,
        lastAcknowledgedSeq: 0
    }));
    state.transcript = [1, 2, 3].map((seq) => ({
        id: `message-${seq}`,
        seq,
        turnSeq: 1,
        turnId: "turn-1",
        stepId: `step-${seq}`,
        attemptId: `attempt-${seq}`,
        speaker: "a",
        agendaItemId: "agenda-1",
        agendaRelation: "on_topic" as const,
        content: seq === 3 ? "Minutes" : "Source",
        kind: seq === 3 ? ("summary" as const) : ("statement" as const),
        mentions: [],
        taskIds: [],
        createdAt: now,
        ...(seq === 3
            ? {
                  minutesDraft: {
                      status: "draft" as const,
                      coverage: { fromSeq: 1, throughSeq: 2 },
                      referencedMessageIds: ["message-2", "message-1"]
                  }
              }
            : {})
    }));
    state.messageSeq = 3;
    return state;
}

describe("referenced minutes archive", () => {
    it.each(["status", "fromSeq", "throughSeq", "order", "remove", "inject", "null"])(
        "rejects metadata tampering: %s",
        (change) => {
            const state = minutesArchiveState();
            const before = structuredClone(state);
            const archive = materializeArchivePackage(state, now);
            const draft = archive.formalTranscript[2]!;
            if (change === "status") Object.assign(draft.minutesDraft!, { status: "accepted" });
            if (change === "fromSeq") Object.assign(draft.minutesDraft!.coverage, { fromSeq: 2 });
            if (change === "throughSeq")
                Object.assign(draft.minutesDraft!.coverage, { throughSeq: 3 });
            if (change === "order")
                Object.assign(draft.minutesDraft!, {
                    referencedMessageIds: ["message-1", "message-2"]
                });
            if (change === "remove") delete draft.minutesDraft;
            if (change === "inject") archive.formalTranscript[0]!.minutesDraft = draft.minutesDraft;
            if (change === "null") Object.assign(draft, { minutesDraft: null });
            expect(() =>
                transitionMeeting(state, "archiving", { now, archive: { package: archive } })
            ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
            expect(state).toEqual(before);
        }
    );
    it("snapshots draft and all sources without aliasing or replacing finalSummary", () => {
        const state = minutesArchiveState();
        const archive = materializeArchivePackage(state, now);
        const result = transitionMeeting(state, "archiving", {
            now,
            archive: { package: archive }
        });
        const expected = structuredClone(result.state.archive!.package);
        Object.assign(state.transcript[2]!.minutesDraft!.coverage, { fromSeq: 99 });
        Object.assign(archive.formalTranscript[2]!.minutesDraft!, { referencedMessageIds: [] });
        expect(result.state.archive!.package).toEqual(expected);
        expect(expected.formalTranscript.map((message) => message.id)).toEqual([
            "message-1",
            "message-2",
            "message-3"
        ]);
        expect(expected.finalSummary).toBe(state.termination!.finalMessage);
    });
    it.each(["absent", "timeout", "reassign"])(
        "ends and archives without a draft when Scribe is %s",
        (mode) => {
            let state = minutesArchiveState();
            state.status = "running";
            delete state.termination;
            state.transcript = state.transcript.slice(0, 2);
            state.messageSeq = 2;
            state.activeAgendaItemId = "agenda-1";
            state.selectionMode = "round_robin";
            state.participants[0]!.status = "speaking";
            state.currentTurn = {
                id: "turn-1",
                seq: 1,
                agendaItemId: "agenda-1",
                intent: "explore",
                objective: "Objective",
                expectedOutputs: [],
                prohibitedTopics: [],
                plan: ["a"],
                status: "running",
                currentStepIndex: 0,
                createdAt: now,
                steps: [
                    {
                        id: "step-a",
                        speaker: "a",
                        instruction: "summarize",
                        reason: "manager_selected",
                        status: "running",
                        attempt: {
                            attemptId: "scribe-attempt",
                            participantId: "a",
                            meetingId: state.id,
                            turnId: "turn-1",
                            stepId: "step-a",
                            deliveryId: "scribe-delivery",
                            contextFromSeq: 1,
                            contextThroughSeq: 2,
                            taskSnapshots: [],
                            assignedAt: now,
                            status: "running",
                            deliveryStatus: "pending"
                        }
                    }
                ]
            };
            const transcript = structuredClone(state.transcript);
            if (mode === "timeout")
                state = failSpeakerAttempt(state, {
                    meetingId: state.id,
                    participantId: "a",
                    turnId: "turn-1",
                    stepId: "step-a",
                    attemptId: "scribe-attempt",
                    deliveryId: "scribe-delivery",
                    agendaItemId: "agenda-1",
                    now,
                    nextPlanningAttemptId: "next-plan",
                    nextPlanningDeliveryId: "next-delivery",
                    catalogBinding: { kind: "none" }
                }).state;
            if (mode === "reassign")
                state = reassignTurn(state, {
                    currentAttemptId: "scribe-attempt",
                    action: "reassign",
                    replacementParticipantId: "b",
                    reason: "replace scribe",
                    now
                }).state;
            const termination = { ...meeting("cancelled").termination!, code: "user_cancelled" };
            const terminal = transitionMeeting(state, "cancelled", { now, termination }).state;
            const archived = transitionMeeting(terminal, "archiving", {
                now,
                archive: { package: materializeArchivePackage(terminal, now) }
            }).state;
            expect(archived.archive!.package.formalTranscript).toEqual(transcript);
            expect(
                archived.archive!.package.formalTranscript.every(
                    (message) => message.minutesDraft === undefined
                )
            ).toBe(true);
        }
    );
});
