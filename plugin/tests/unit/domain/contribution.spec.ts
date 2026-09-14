import {
    applyContributionCommand,
    applyPublicSubmission,
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
            questions: [
                {
                    id: "question-contribution-1",
                    text: "What remains?",
                    blocking: false,
                    createdAt: contributionNow
                }
            ]
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
