import {
    applyContributionCommand,
    applyPublicSubmission,
    assertContributionEvidenceMessages,
    contributionWorkComplete,
    type MeetingState,
    isMeetingStateV2
} from "@/domain/index.js";
import {
    boundaryReviewState,
    captainContext,
    contributionMeeting,
    contributionNow,
    evidenceReviewState,
    evidenceVersion,
    managerContext,
    validContributionState,
    withNewPublicMessage
} from "../../fixtures/contribution.js";
import { describe, expect, it } from "vitest";

describe("contribution evidence support", () => {
    it.each(["supports", "partially_supports", "does_not_support", "unverifiable"] as const)(
        "preserves the %s verdict from the independent reviewer",
        (verdict) => {
            const state = evidenceReviewState();
            const result = applyContributionCommand(
                state,
                {
                    action: "evidence_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    reviews: [
                        {
                            evidenceKey: "evidence-1:1",
                            claim: "fixture",
                            verdict,
                            method: "fixture",
                            result: "fixture",
                            limitations: "fixture"
                        }
                    ]
                },
                {
                    ...managerContext(),
                    actor: {
                        kind: "participant",
                        participantId: state.contributions!.reviewerId
                    }
                }
            );
            expect(result.state.contributions!.tasks["contribution-1"]!.reviewStatus).toBe(
                "complete"
            );
            expect(
                result.state.contributions!.tasks["contribution-1"]!.evidenceReviews[0]!.verdict
            ).toBe(verdict);
            expect(result.state.transcript).toEqual(state.transcript);
            expect(result.effect.events.map(({ type }) => type)).toEqual([
                "contribution.evidence_reviewed",
                "contribution.manager_notified"
            ]);
        }
    );

    it("rejects a material author reviewing their own evidence without mutation", () => {
        const state = evidenceReviewState();
        const before = structuredClone(state);
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "evidence_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    reviews: [
                        {
                            evidenceKey: "evidence-1:1",
                            claim: "fixture",
                            verdict: "supports",
                            method: "fixture",
                            result: "fixture",
                            limitations: "fixture"
                        }
                    ]
                },
                {
                    ...managerContext(),
                    actor: {
                        kind: "participant",
                        participantId: state.participants[0]!.id
                    }
                }
            )
        ).toThrow("Only the independent reviewer can review evidence.");
        expect(state).toEqual(before);
    });

    it("rejects a reviewer-owned patch dependency in a previously published draft", () => {
        const state = evidenceReviewState() as MeetingState;
        const reviewerId = state.contributions!.reviewerId;
        state.contributions!.evidence["reviewer-patch:1"] = {
            ...evidenceVersion(1),
            evidenceId: "reviewer-patch",
            key: "reviewer-patch:1",
            submittedBy: reviewerId
        } as never;
        state.contributions!.evidence["evidence-1:1"]!.kind = "code";
        state.contributions!.evidence["evidence-1:1"]!.code = {
            repository: "repo",
            revision: "commit",
            pathsAndSymbols: "src/a.ts",
            patchEvidenceKeys: ["reviewer-patch:1"],
            validation: "static_only",
            reproduction: "inspection",
            expected: "yes",
            observed: "yes",
            notCovered: "execution"
        };
        expect(isMeetingStateV2(state)).toBe(true);
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "evidence_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    reviews: [
                        {
                            evidenceKey: "evidence-1:1",
                            claim: "fixture",
                            verdict: "supports",
                            method: "read",
                            result: "yes",
                            limitations: "none"
                        }
                    ]
                },
                {
                    ...managerContext(),
                    actor: { kind: "participant", participantId: reviewerId }
                }
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });

    it("requires supports for every cited claim before a completion message can be used", () => {
        const state = evidenceReviewState();
        const task = state.contributions!.tasks["contribution-1"]!;
        const draft = task.drafts["1"]!;
        const before = structuredClone(state);
        expect(() => assertContributionEvidenceMessages(state, [draft.message.id])).toThrow(
            "require supported evidence messages"
        );
        expect(state).toEqual(before);
        const completionFact = {
            id: "completion-output",
            kind: "output_evidence" as const,
            subjectId: "output",
            assertedBy: task.participantId,
            result: "supported" as const,
            evidenceMessageIds: [draft.message.id],
            taskIds: [],
            status: "active" as const,
            createdAt: contributionNow
        };
        expect(contributionWorkComplete({ ...state, completionFacts: [completionFact] })).toBe(
            false
        );

        const reviewed = applyContributionCommand(
            state,
            {
                action: "evidence_review",
                contributionId: task.id,
                generation: task.generation,
                draftRevision: draft.revision,
                reviews: [
                    {
                        evidenceKey: "evidence-1:1",
                        claim: "fixture",
                        verdict: "supports",
                        method: "fixture",
                        result: "fixture",
                        limitations: "fixture"
                    }
                ]
            },
            {
                ...managerContext(),
                actor: { kind: "participant", participantId: state.contributions!.reviewerId }
            }
        ).state;
        assertContributionEvidenceMessages(reviewed, [draft.message.id]);
        expect(contributionWorkComplete({ ...reviewed, completionFacts: [completionFact] })).toBe(
            true
        );
    });

    it("does not treat a supports verdict for one claim as support for another claim", () => {
        const state = evidenceReviewState();
        const task = state.contributions!.tasks["contribution-1"]!;
        const draft = task.drafts["1"]!;
        const withSecondClaim = {
            ...state,
            contributions: {
                ...state.contributions!,
                tasks: {
                    ...state.contributions!.tasks,
                    [task.id]: {
                        ...task,
                        drafts: {
                            ...task.drafts,
                            [String(draft.revision)]: {
                                ...draft,
                                citations: [
                                    ...draft.citations,
                                    {
                                        evidenceKey: "evidence-1:1",
                                        claim: "different claim",
                                        locator: "fixture",
                                        inference: "fixture"
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        };
        const before = structuredClone(withSecondClaim);
        expect(() =>
            applyContributionCommand(
                withSecondClaim,
                {
                    action: "evidence_review",
                    contributionId: task.id,
                    generation: task.generation,
                    draftRevision: draft.revision,
                    reviews: [
                        {
                            evidenceKey: "evidence-1:1",
                            claim: "fixture",
                            verdict: "supports",
                            method: "fixture",
                            result: "fixture",
                            limitations: "fixture"
                        }
                    ]
                },
                {
                    ...managerContext(),
                    actor: {
                        kind: "participant",
                        participantId: withSecondClaim.contributions!.reviewerId
                    }
                }
            )
        ).toThrow("exactly cover contribution citations");
        expect(withSecondClaim).toEqual(before);
    });

    it("requires every required contribution to be published and reviewed", () => {
        const state = evidenceReviewState();
        const task = state.contributions!.tasks["contribution-1"]!;
        expect(contributionWorkComplete(state)).toBe(true);
        expect(
            contributionWorkComplete({
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        ...state.contributions!.tasks,
                        [task.id]: {
                            ...task,
                            requiredForCompletion: true,
                            reviewStatus: "pending"
                        }
                    }
                }
            })
        ).toBe(false);
        expect(
            contributionWorkComplete({
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        ...state.contributions!.tasks,
                        [task.id]: {
                            ...task,
                            requiredForCompletion: true,
                            phase: "cancelled"
                        }
                    }
                }
            })
        ).toBe(false);
    });
});

describe("contribution task control", () => {
    it("does not retry a private review task authored by the fixed reviewer", () => {
        const state = boundaryReviewState() as MeetingState;
        const task = state.contributions!.tasks["contribution-1"]!;
        task.phase = "cancelled";
        task.requiresEvidenceReview = true;
        task.participantId = state.contributions!.reviewerId;
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "retry",
                    contributionId: task.id,
                    generation: 1,
                    reason: "Resume"
                },
                captainContext()
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });
    it("retries a cancelled private contribution with a new generation", () => {
        const state = withNewPublicMessage(boundaryReviewState());
        const task = state.contributions!.tasks["contribution-1"]!;
        const cancelled = {
            ...state,
            contributions: {
                ...state.contributions!,
                tasks: {
                    ...state.contributions!.tasks,
                    [task.id]: { ...task, phase: "cancelled" as const, returnCount: 2 }
                }
            }
        };
        const result = applyContributionCommand(
            cancelled,
            { action: "retry", contributionId: task.id, generation: 1, reason: "Resume." },
            captainContext()
        );
        const next = result.state.contributions!.tasks[task.id]!;
        expect(next).toMatchObject({
            phase: "preparing",
            generation: 2,
            returnCount: 0,
            basedOnSeq: 1
        });
        expect(next.drafts).toEqual(task.drafts);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "contribution.controlled",
            "contribution.manager_notified"
        ]);
    });

    it("retries only the review of an already published contribution", () => {
        const state = evidenceReviewState();
        const task = state.contributions!.tasks["contribution-1"]!;
        const blockedReview = {
            ...state,
            contributions: {
                ...state.contributions!,
                tasks: {
                    ...state.contributions!.tasks,
                    [task.id]: { ...task, reviewStatus: "captain_action" as const }
                }
            }
        };
        const result = applyContributionCommand(
            blockedReview,
            {
                action: "retry",
                contributionId: task.id,
                generation: 1,
                reason: "Review again."
            },
            captainContext()
        );
        expect(result.state.transcript).toEqual(blockedReview.transcript);
        expect(result.state.contributions!.tasks[task.id]).toMatchObject({
            phase: "published",
            reviewStatus: "pending",
            generation: 2
        });
    });

    it("cancels only private work and notify_manager wakes a waiting meeting once", () => {
        const state = boundaryReviewState();
        const task = state.contributions!.tasks["contribution-1"]!;
        const cancelled = applyContributionCommand(
            state,
            { action: "cancel", contributionId: task.id, generation: 1, reason: "Stop." },
            captainContext()
        );
        expect(cancelled.state.contributions!.tasks[task.id]).toMatchObject({
            phase: "cancelled",
            generation: 2,
            reason: "Stop."
        });
        expect(cancelled.state.contributions!.tasks[task.id]!.drafts).toEqual(task.drafts);
        expect(() =>
            applyContributionCommand(
                cancelled.state,
                { action: "cancel", contributionId: task.id, generation: 2, reason: "Overwrite." },
                captainContext()
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        expect(cancelled.state.contributions!.tasks[task.id]).toMatchObject({
            phase: "cancelled",
            generation: 2,
            reason: "Stop."
        });
        const notified = applyContributionCommand(
            { ...state, status: "waiting" },
            { action: "notify_manager", reason: "Need attention." },
            captainContext()
        );
        expect(notified.state.status).toBe("running");
        expect(notified.state.contributions!.managerNoticeSeq).toBe(1);
        expect(notified.effect.events).toHaveLength(1);
    });
});

describe("contribution state validation", () => {
    it("applies public claims without a current Turn", () => {
        const state = contributionMeeting();
        delete state.currentTurn;
        const participantId = state.participants[0]!.id;
        const result = applyPublicSubmission(state, participantId, {
            agendaItemId: state.agenda[0]!.id,
            now: contributionNow,
            message: {
                id: "message-contribution-1-1",
                content: "A public question.",
                kind: "question",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                createdAt: contributionNow
            },
            claims: {
                questions: [
                    {
                        id: "question-contribution-1",
                        text: "What remains?",
                        blocking: false,
                        createdAt: contributionNow
                    }
                ],
                issues: [],
                proposals: [],
                positions: [],
                agendaCandidates: [],
                decisionCandidates: []
            },
            authorizedTaskIds: [],
            completionFactId: (kind, index) => `completion-${kind}-${index}`
        });
        expect(result.state.openQuestions).toHaveLength(1);
        expect(result.effect.events.map(({ type }) => type)).toEqual(["question.added"]);
    });

    it("keeps a legacy meeting readable and accepts one complete contribution state", () => {
        const legacy = contributionMeeting();
        expect(isMeetingStateV2(legacy)).toBe(true);
        expect(
            isMeetingStateV2({
                ...legacy,
                contributions: validContributionState()
            } as unknown as MeetingState)
        ).toBe(true);
    });

    it("rejects a contribution whose task references an unknown participant", () => {
        const state = validContributionState();
        state.tasks["contribution-1"]!.participantId = "participant-missing";

        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: state
            } as unknown as MeetingState)
        ).toBe(false);
    });

    it("rejects non-contiguous material revisions and mixed message origins", () => {
        const contribution = validContributionState();
        contribution.evidence = { "evidence-1:2": evidenceVersion(2) };
        const mixedOrigin = {
            ...contributionMeeting(),
            transcript: [
                {
                    id: "message-1",
                    seq: 1,
                    turnSeq: 1,
                    turnId: "turn-1",
                    stepId: "step-1",
                    attemptId: "attempt-1",
                    contributionId: "contribution-1",
                    contributionRevision: 1,
                    speaker: contributionMeeting().participants[0]!.id,
                    agendaItemId: contributionMeeting().agenda[0]!.id,
                    agendaRelation: "on_topic",
                    content: "fixture",
                    kind: "statement",
                    mentions: [],
                    taskIds: [],
                    createdAt: contributionNow
                }
            ],
            contributions: contribution
        };

        expect(isMeetingStateV2(mixedOrigin as unknown as MeetingState)).toBe(false);
    });

    it("accepts 128 material versions and rejects the 129th", () => {
        const contribution = validContributionState();
        contribution.evidence = Object.fromEntries(
            Array.from({ length: 128 }, (_, index) => {
                const revision = index + 1;
                return [`evidence-1:${revision}`, evidenceVersion(revision)];
            })
        );
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(true);

        contribution.evidence = {
            ...contribution.evidence,
            "evidence-1:129": evidenceVersion(129)
        };
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(false);
    });
});
