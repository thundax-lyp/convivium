import type { MeetingState } from "@/domain/model.js";

import { questionState } from "../unit/domain/transitions/fixtures.js";

export const contributionNow = 1_700_000_000_000;

export function contributionMeeting(): MeetingState {
    const state = questionState();
    state.status = "running";
    state.activeAgendaItemId = state.agenda[0]!.id;
    return state;
}

export function validContributionState() {
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

export function evidenceVersion(revision: number) {
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

export function boundaryReviewState() {
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

export function managerContext(now = contributionNow) {
    return {
        now,
        actor: { kind: "manager" as const },
        newContributionId: "unused",
        newEvidenceId: "unused",
        completionFactId: (kind: string, index: number) => `${kind}-${index}`
    };
}

export function captainContext(now = contributionNow) {
    return { ...managerContext(now), actor: { kind: "captain" as const } };
}

export function evidenceReviewState() {
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
                    messageId: publishedMessage.id,
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
