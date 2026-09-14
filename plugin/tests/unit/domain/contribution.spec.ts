import {
    applyContributionCommand,
    applyPublicSubmission,
    assertContributionEvidenceMessages,
    contributionWorkComplete,
    isMeetingStateV2
} from "@/domain/index.js";
import { contributionMeeting, contributionNow } from "../../fixtures/contribution.js";
import { describe, expect, it } from "vitest";

function validContributionState() {
    const state = contributionMeeting();
    const authorId = state.participants[0]!.id;
    const reviewerId = state.participants[1]!.id;
    const agendaItemId = state.agenda[0]!.id;
    return {
        schemaVersion: 1,
        reviewerId,
        managerNoticeSeq: 0,
        managerDeadlineAt: contributionNow + 600_000,
        tasks: {
            "contribution-1": {
                id: "contribution-1",
                participantId: authorId,
                agendaItemId,
                instruction: "Research the topic.",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false,
                generation: 1,
                phase: "preparing",
                basedOnSeq: 0,
                deadlineAt: contributionNow + 600_000,
                createdAt: contributionNow,
                updatedAt: contributionNow,
                currentDraftRevision: 0,
                returnCount: 0,
                drafts: {},
                boundaryReviews: [],
                evidenceReviews: [],
                reviewStatus: "not_required"
            }
        },
        evidence: {}
    };
}

function evidenceVersion(revision: number) {
    return {
        evidenceId: "evidence-1",
        revision,
        key: `evidence-1:${revision}`,
        submittedBy: contributionMeeting().participants[0]!.id,
        submittedAt: contributionNow,
        title: "Source",
        kind: "document",
        source: "fixture",
        sourceDate: "fixture",
        collectedAt: "fixture",
        locator: "fixture",
        observation: "fixture",
        methodAndConditions: "fixture",
        limitations: "fixture",
        dependencies: "fixture",
        material: { kind: "text", text: "fixture" }
    };
}

function boundaryReviewState() {
    const state = { ...contributionMeeting(), contributions: validContributionState() };
    const task = state.contributions!.tasks["contribution-1"]!;
    return {
        ...state,
        contributions: {
            ...state.contributions!,
            tasks: {
                ...state.contributions!.tasks,
                "contribution-1": {
                    ...task,
                    phase: "boundary_review" as const,
                    currentDraftRevision: 1,
                    drafts: {
                        "1": {
                            revision: 1,
                            basedOnSeq: 0,
                            submittedAt: contributionNow,
                            message: {
                                id: "message-contribution-1-1",
                                content: "A public question.",
                                kind: "question" as const,
                                mentions: [],
                                taskIds: [],
                                agendaRelation: "on_topic" as const,
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
                            citations: []
                        }
                    }
                }
            }
        }
    };
}

function managerContext(now = contributionNow) {
    return {
        now,
        actor: { kind: "manager" as const },
        newContributionId: "unused",
        newEvidenceId: "unused",
        completionFactId: (kind: string, index: number) => `${kind}-${index}`
    };
}

function evidenceReviewState() {
    const base = boundaryReviewState();
    const task = base.contributions!.tasks["contribution-1"]!;
    const draft = task.drafts["1"]!;
    const publishedMessage = {
        ...draft.message,
        seq: base.messageSeq + 1,
        contributionId: task.id,
        contributionRevision: draft.revision,
        speaker: task.participantId,
        agendaItemId: task.agendaItemId
    };
    return {
        ...base,
        transcript: [...base.transcript, publishedMessage],
        messageSeq: publishedMessage.seq,
        contributions: {
            ...base.contributions!,
            evidence: { "evidence-1:1": evidenceVersion(1) },
            tasks: {
                ...base.contributions!.tasks,
                "contribution-1": {
                    ...task,
                    phase: "published" as const,
                    requiresEvidenceReview: true,
                    reviewStatus: "pending" as const,
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
}

describe("contribution state structure", () => {
    describe("contribution preparation", () => {
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
                expect(result.state.contributions!.tasks["contribution-1"]!.phase).toBe(
                    expectedPhase
                );
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
            expect(result.state.openQuestions.map(({ id }) => id)).toContain(
                "question-contribution-1"
            );
            expect(result.state.contributions!.managerNoticeSeq).toBe(1);
            expect(result.state.contributions!.managerDeadlineAt).toBe(contributionNow + 600_000);
            expect(result.effect.events.map(({ type }) => type)).toContain(
                "contribution.manager_notified"
            );
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
            expect(
                contributionWorkComplete({ ...reviewed, completionFacts: [completionFact] })
            ).toBe(true);
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
