import { applyContributionCommand, type MeetingState } from "@/domain/index.js";
import {
    boundaryReviewState,
    contributionMeeting,
    contributionNow,
    evidenceReviewState,
    evidenceVersion,
    managerContext,
    validContributionState
} from "../../fixtures/contribution.js";
import { describe, expect, it } from "vitest";

describe("contribution preparation", () => {
    it("rejects another author's material update and an unreadable private citation", () => {
        const state = {
            ...contributionMeeting(),
            contributions: validContributionState()
        } as MeetingState;
        const authorId = state.participants[0]!.id;
        const otherId = state.participants[1]!.id;
        state.contributions!.evidence["private:1"] = {
            ...evidenceVersion(1),
            evidenceId: "private",
            key: "private:1",
            submittedBy: otherId
        } as never;
        const context = {
            ...managerContext(),
            actor: { kind: "participant" as const, participantId: authorId }
        };
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "save_evidence",
                    contributionId: "contribution-1",
                    generation: 1,
                    evidenceId: "private",
                    expectedEvidenceRevision: 1,
                    material: { ...evidenceVersion(1) } as never
                },
                context
            )
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        const draft = boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "submit",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedDraftRevision: 0,
                    draft: {
                        ...draft,
                        citations: [{ evidenceKey: "private:1", claim: "private" }]
                    }
                },
                context
            )
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        expect(state.contributions!.tasks["contribution-1"]!.currentDraftRevision).toBe(0);
        expect(state.contributions!.evidence["private:2"]).toBeUndefined();
    });

    it("rejects a private patch dependency even when the new material belongs to the author", () => {
        const state = {
            ...contributionMeeting(),
            contributions: validContributionState()
        } as MeetingState;
        const authorId = state.participants[0]!.id;
        state.contributions!.evidence["private:1"] = {
            ...evidenceVersion(1),
            evidenceId: "private",
            key: "private:1",
            submittedBy: state.participants[1]!.id
        } as never;
        const material = {
            ...evidenceVersion(1),
            kind: "code" as const,
            code: {
                repository: "repo",
                revision: "commit",
                pathsAndSymbols: "src/a.ts",
                patchEvidenceKeys: ["private:1"],
                validation: "static_only" as const,
                reproduction: "inspection",
                expected: "a",
                observed: "a",
                notCovered: "execution"
            }
        };
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "save_evidence",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedEvidenceRevision: 0,
                    material
                },
                {
                    ...managerContext(),
                    actor: { kind: "participant", participantId: authorId },
                    newEvidenceId: "own-code"
                }
            )
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        expect(state.contributions!.evidence["own-code:1"]).toBeUndefined();
    });

    it("rejects a reviewer cited as material author and a reviewer approving their own draft", () => {
        const state = {
            ...contributionMeeting(),
            contributions: validContributionState()
        } as MeetingState;
        const reviewerId = state.contributions!.reviewerId;
        state.contributions!.tasks["contribution-1"]!.requiresEvidenceReview = true;
        state.contributions!.evidence["reviewer:1"] = {
            ...evidenceVersion(1),
            evidenceId: "reviewer",
            key: "reviewer:1",
            submittedBy: reviewerId
        } as never;
        const draft = boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "submit",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedDraftRevision: 0,
                    draft: {
                        ...draft,
                        citations: [{ evidenceKey: "reviewer:1", claim: "self" }]
                    }
                },
                {
                    ...managerContext(),
                    actor: { kind: "participant", participantId: state.participants[0]!.id }
                }
            )
        ).toThrow();
        const pending = evidenceReviewState() as MeetingState;
        pending.contributions!.tasks["contribution-1"]!.participantId = reviewerId;
        pending.contributions!.evidence["evidence-1:1"]!.submittedBy = state.participants[0]!.id;
        expect(() =>
            applyContributionCommand(
                pending,
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
        ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
    });

    it("allows a participant to cite a material already public through another task", () => {
        const state = evidenceReviewState() as MeetingState;
        state.contributions!.tasks["contribution-1"]!.reviewStatus = "complete";
        const authorId = state.participants[1]!.id;
        state.contributions!.tasks["contribution-2"] = {
            ...validContributionState().tasks["contribution-1"],
            id: "contribution-2",
            participantId: authorId,
            basedOnSeq: state.messageSeq
        } as never;
        const draft = boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
        const result = applyContributionCommand(
            state,
            {
                action: "submit",
                contributionId: "contribution-2",
                generation: 1,
                expectedDraftRevision: 0,
                draft: {
                    ...draft,
                    basedOnSeq: state.messageSeq,
                    citations: [{ evidenceKey: "evidence-1:1", claim: "fixture" }]
                }
            },
            { ...managerContext(), actor: { kind: "participant", participantId: authorId } }
        );
        expect(result.state.contributions!.tasks["contribution-2"]!.phase).toBe("boundary_review");
    });

    it("rejects a draft outside its task and current Transcript bounds", () => {
        const state = {
            ...contributionMeeting(),
            contributions: validContributionState()
        } as MeetingState;
        const draft = boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
        const context = {
            ...managerContext(),
            actor: { kind: "participant" as const, participantId: state.participants[0]!.id }
        };
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "submit",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedDraftRevision: 0,
                    draft: { ...draft, basedOnSeq: state.messageSeq + 1 }
                },
                context
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });
});

describe("contribution assignment and private drafts", () => {
    it("rejects self-review and research/review overlap at assignment", () => {
        const state = {
            ...contributionMeeting(),
            contributions: { ...validContributionState(), tasks: {} }
        } as MeetingState;
        const reviewerId = state.contributions!.reviewerId;
        const otherId = state.participants[0]!.id;
        const command = {
            action: "assign" as const,
            participantId: reviewerId,
            agendaItemId: state.agenda[0]!.id,
            instruction: "Research",
            targetIds: [],
            requiredForCompletion: false,
            requiresEvidenceReview: true
        };
        expect(() => applyContributionCommand(state, command, managerContext())).toThrow(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
        const pending = evidenceReviewState() as MeetingState;
        expect(() =>
            applyContributionCommand(
                pending,
                { ...command, requiresEvidenceReview: false },
                { ...managerContext(), newContributionId: "contribution-2" }
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        pending.contributions!.tasks["contribution-1"]!.reviewStatus = "captain_action";
        expect(() =>
            applyContributionCommand(
                pending,
                { ...command, requiresEvidenceReview: false },
                { ...managerContext(), newContributionId: "contribution-2" }
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        const researching = {
            ...state,
            contributions: {
                ...state.contributions!,
                tasks: {
                    "contribution-1": {
                        ...validContributionState().tasks["contribution-1"],
                        participantId: reviewerId
                    }
                }
            }
        } as MeetingState;
        expect(() =>
            applyContributionCommand(
                researching,
                { ...command, participantId: otherId },
                { ...managerContext(), newContributionId: "contribution-2" }
            )
        ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });
    it("allows two participants to prepare distinct contributions", () => {
        const state = {
            ...contributionMeeting(),
            contributions: { ...validContributionState(), tasks: {}, evidence: {} }
        };
        const context = {
            now: contributionNow,
            actor: { kind: "manager" as const },
            newContributionId: "contribution-1",
            newEvidenceId: "evidence-1",
            completionFactId: (kind: string, index: number) => `${kind}-${index}`
        };
        const first = applyContributionCommand(
            state,
            {
                action: "assign",
                participantId: state.participants[0]!.id,
                agendaItemId: state.agenda[0]!.id,
                instruction: "Research.",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false
            },
            context
        );
        const second = applyContributionCommand(
            first.state,
            {
                action: "assign",
                participantId: state.participants[1]!.id,
                agendaItemId: state.agenda[0]!.id,
                instruction: "Review.",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false
            },
            { ...context, newContributionId: "contribution-2" }
        );
        expect(Object.keys(second.state.contributions!.tasks)).toEqual([
            "contribution-1",
            "contribution-2"
        ]);
    });

    it("rejects a second active assignment for the same participant without mutation", () => {
        const state = {
            ...contributionMeeting(),
            contributions: { ...validContributionState() }
        };
        const before = structuredClone(state);
        const context = {
            now: contributionNow,
            actor: { kind: "manager" as const },
            newContributionId: "contribution-2",
            newEvidenceId: "evidence-1",
            completionFactId: (kind: string, index: number) => `${kind}-${index}`
        };
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "assign",
                    participantId: state.participants[0]!.id,
                    agendaItemId: state.agenda[0]!.id,
                    instruction: "Duplicate.",
                    targetIds: [],
                    requiredForCompletion: false,
                    requiresEvidenceReview: false
                },
                context
            )
        ).toThrow("Participant already has an active contribution.");
        expect(state).toEqual(before);
    });

    it("keeps evidence versions and submitted drafts private", () => {
        const state = { ...contributionMeeting(), contributions: validContributionState() };
        const actor = {
            kind: "participant" as const,
            participantId: state.participants[0]!.id
        };
        const context = {
            now: contributionNow,
            actor,
            newContributionId: "unused",
            newEvidenceId: "evidence-1",
            completionFactId: (kind: string, index: number) => `${kind}-${index}`
        };
        const saved = applyContributionCommand(
            state,
            {
                action: "save_evidence",
                contributionId: "contribution-1",
                generation: 1,
                expectedEvidenceRevision: 0,
                material: {
                    ...evidenceVersion(1),
                    evidenceId: undefined as never,
                    revision: undefined as never,
                    key: undefined as never,
                    submittedBy: undefined as never,
                    submittedAt: undefined as never
                }
            },
            context
        );
        const submitted = applyContributionCommand(
            saved.state,
            {
                action: "submit",
                contributionId: "contribution-1",
                generation: 1,
                expectedDraftRevision: 0,
                draft: {
                    revision: 1,
                    basedOnSeq: 0,
                    submittedAt: contributionNow,
                    message: {
                        id: "message-private",
                        content: "draft",
                        kind: "statement",
                        mentions: [],
                        taskIds: [],
                        agendaRelation: "on_topic",
                        createdAt: contributionNow
                    },
                    claims: {
                        questions: [],
                        issues: [],
                        proposals: [],
                        positions: [],
                        agendaCandidates: [],
                        decisionCandidates: []
                    },
                    citations: []
                }
            },
            context
        );
        expect(Object.keys(saved.state.contributions!.evidence)).toEqual(["evidence-1:1"]);
        expect(submitted.state.contributions!.tasks["contribution-1"]!.phase).toBe(
            "boundary_review"
        );
        expect(submitted.state.transcript).toEqual(state.transcript);
    });
});

describe("contribution publication", () => {
    it("returns twice then requires Captain action without publishing the draft", () => {
        let state = boundaryReviewState();
        for (const expectedPhase of ["returned", "returned", "captain_action"] as const) {
            const result = applyContributionCommand(
                state,
                {
                    action: "boundary_review",
                    contributionId: "contribution-1",
                    generation: state.contributions!.tasks["contribution-1"]!.generation,
                    draftRevision: 1,
                    decision: "return",
                    reason: "Needs more detail.",
                    checkedThroughSeq: state.messageSeq
                },
                managerContext()
            );
            expect(result.state.contributions!.tasks["contribution-1"]!.phase).toBe(expectedPhase);
            expect(result.state.transcript).toEqual(state.transcript);
            state = {
                ...result.state,
                contributions: {
                    ...result.state.contributions!,
                    tasks: {
                        ...result.state.contributions!.tasks,
                        "contribution-1": {
                            ...result.state.contributions!.tasks["contribution-1"]!,
                            phase: "boundary_review",
                            currentDraftRevision: 1
                        }
                    }
                }
            };
        }
    });

    it("rejects an approval for a returned generation without mutation", () => {
        const state = boundaryReviewState();
        const returned = applyContributionCommand(
            state,
            {
                action: "boundary_review",
                contributionId: "contribution-1",
                generation: 1,
                draftRevision: 1,
                decision: "return",
                reason: "Needs more detail.",
                checkedThroughSeq: state.messageSeq
            },
            managerContext()
        ).state;
        const before = structuredClone(returned);
        expect(() =>
            applyContributionCommand(
                returned,
                {
                    action: "boundary_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    decision: "approve",
                    reason: "Approved.",
                    checkedThroughSeq: returned.messageSeq
                },
                managerContext()
            )
        ).toThrow("Contribution review is stale.");
        expect(returned).toEqual(before);
    });

    it("publishes the exact approved draft and its claims atomically", () => {
        const base = boundaryReviewState();
        const draft = base.contributions!.tasks["contribution-1"]!.drafts["1"]!;
        const state = {
            ...base,
            contributions: {
                ...base.contributions!,
                tasks: {
                    ...base.contributions!.tasks,
                    "contribution-1": {
                        ...base.contributions!.tasks["contribution-1"]!,
                        requiresEvidenceReview: true,
                        drafts: {
                            "1": {
                                ...draft,
                                citations: [
                                    {
                                        evidenceKey: "evidence-1:1",
                                        claim: "fixture",
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
        const result = applyContributionCommand(
            state,
            {
                action: "boundary_review",
                contributionId: "contribution-1",
                generation: 1,
                draftRevision: 1,
                decision: "approve",
                reason: "Approved.",
                checkedThroughSeq: state.messageSeq
            },
            managerContext()
        );
        const task = result.state.contributions!.tasks["contribution-1"]!;
        expect(task.phase).toBe("published");
        expect(task.reviewStatus).toBe("pending");
        expect(task.messageId).toBe("message-contribution-1-1");
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.transcript).toHaveLength(state.transcript.length + 1);
        expect(result.state.openQuestions.map(({ id }) => id)).toContain("question-contribution-1");
        expect(result.state.contributions!.managerNoticeSeq).toBe(1);
        expect(result.state.contributions!.managerDeadlineAt).toBe(contributionNow + 600_000);
        expect(result.effect.events).toContainEqual({
            type: "contribution.manager_notified",
            payload: {
                noticeSeq: 1,
                contextThroughSeq: state.messageSeq + 1,
                actor: "manager",
                at: contributionNow
            }
        });
    });

    it("does not publish the body when any approved claim is invalid", () => {
        const base = boundaryReviewState();
        const draft = base.contributions!.tasks["contribution-1"]!.drafts["1"]!;
        const state = {
            ...base,
            contributions: {
                ...base.contributions!,
                tasks: {
                    ...base.contributions!.tasks,
                    "contribution-1": {
                        ...base.contributions!.tasks["contribution-1"]!,
                        drafts: {
                            "1": {
                                ...draft,
                                message: {
                                    ...draft.message,
                                    kind: "summary",
                                    minutesDraft: {
                                        status: "draft",
                                        coverage: { fromSeq: 1, throughSeq: 1 },
                                        referencedMessageIds: ["message-1"]
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const before = structuredClone(state);
        expect(() =>
            applyContributionCommand(
                state,
                {
                    action: "boundary_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    decision: "approve",
                    reason: "Approved.",
                    checkedThroughSeq: state.messageSeq
                },
                managerContext()
            )
        ).toThrow("Invalid minutes draft.");
        expect(state).toEqual(before);
    });
});
