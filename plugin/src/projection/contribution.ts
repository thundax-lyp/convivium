import {
    DomainError,
    isMeetingStateV2,
    type ContributionTask,
    type ContributionDraft,
    type EvidenceVersion,
    type MeetingState
} from "@/domain/index.js";
import {
    ReadContributionResultSchema,
    type ContributionSummaryV1,
    type ReadContributionInputV1,
    type ReadContributionResultV1
} from "@/protocol/index.js";
import type { MeetingProjectionCaller } from "./status.js";
import { projectMeetingStatus } from "./status.js";
import type { ContributionContextV1, ContributionDelivery } from "@/protocol/index.js";

export function projectContributionContext(
    state: MeetingState,
    viewer: MeetingProjectionCaller,
    delivery: ContributionDelivery,
    deliveryId: string
): ContributionContextV1 {
    if (!isMeetingStateV2(state) || state.contributions === undefined)
        throw new DomainError("INVALID_ARGUMENT", "Invalid contribution state.");
    const status = projectMeetingStatus(state, viewer);
    if (!("messages" in status) || status.activeAgendaItem === undefined)
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Contribution context requires an active agenda."
        );
    let work: ContributionContextV1["work"];
    if (delivery.role === "contribution_manager") {
        if (viewer.kind !== "manager") denied();
        work = {
            kind: "manager",
            pending: projectContributionSummaries(state, viewer).filter(
                (task) =>
                    task.phase !== "cancelled" &&
                    (task.phase !== "published" ||
                        task.reviewStatus === "pending" ||
                        task.reviewStatus === "captain_action")
            )
        };
    } else if (delivery.purpose === "prepare") {
        const task = state.contributions.tasks[delivery.contributionId];
        if (task === undefined || !author(task, viewer)) denied();
        work = {
            kind: "prepare",
            task: summary(task),
            instruction: task.instruction,
            ...(task.phase === "returned" && task.reason !== undefined
                ? { returnReason: task.reason }
                : {})
        };
    } else {
        work = {
            kind: "evidence_review",
            submission: projectContributionRead(state, viewer, {
                protocolVersion: 1,
                meetingId: state.id,
                contributionId: delivery.contributionId,
                draftRevision: delivery.draftRevision
            })
        };
    }
    return {
        protocolVersion: 1,
        meetingId: state.id,
        meetingVersion: state.version,
        deliveryId,
        purpose: delivery.role === "contribution_manager" ? "manager" : delivery.purpose,
        contextThroughSeq: delivery.contextThroughSeq,
        publicContext: {
            topic: state.topic,
            objective: state.objective,
            objectiveContract: {
                requiredOutputs: state.objectiveContract.requiredOutputs.map((v) => ({
                    id: v.id,
                    description: v.description,
                    status: v.status
                })),
                acceptanceCriteria: state.objectiveContract.acceptanceCriteria.map((v) => ({
                    id: v.id,
                    description: v.description,
                    satisfied: v.satisfied
                })),
                hardConstraints: state.objectiveContract.hardConstraints.map((v) => ({
                    id: v.id,
                    description: v.description
                })),
                requiredReviewers: [...state.objectiveContract.requiredReviewers],
                riskAcceptanceAuthority: [...state.objectiveContract.riskAcceptanceAuthority],
                acceptableRiskLevel: state.objectiveContract.acceptableRiskLevel
            },
            activeAgendaItem: status.activeAgendaItem,
            messages: status.messages.filter(
                (message) => message.seq <= delivery.contextThroughSeq
            ),
            acceptedDecisions: status.acceptedDecisions,
            blockingFacts: status.blockingFacts,
            participants: state.participants.map((v) => ({ id: v.id, displayName: v.displayName }))
        },
        work
    };
}

function summary(task: ContributionTask): ContributionSummaryV1 {
    return {
        id: task.id,
        participantId: task.participantId,
        agendaItemId: task.agendaItemId,
        phase: task.phase,
        generation: task.generation,
        currentDraftRevision: task.currentDraftRevision,
        requiredForCompletion: task.requiredForCompletion,
        requiresEvidenceReview: task.requiresEvidenceReview,
        reviewStatus: task.reviewStatus,
        deadlineAt: task.deadlineAt,
        ...(task.messageId === undefined ? {} : { messageId: task.messageId })
    };
}

const audit = (viewer: MeetingProjectionCaller) =>
    viewer.kind === "captain" || viewer.kind === "local_host";
const privileged = (viewer: MeetingProjectionCaller) => audit(viewer) || viewer.kind === "manager";
const author = (task: ContributionTask, viewer: MeetingProjectionCaller) =>
    viewer.kind === "participant" && viewer.participantId === task.participantId;

function publicTask(state: MeetingState, task: ContributionTask): boolean {
    return (
        task.phase === "published" &&
        (state.status !== "archived" ||
            state.archive?.package.contributionRefs?.taskIds.includes(task.id) === true)
    );
}

export function projectContributionSummaries(
    state: MeetingState,
    viewer: MeetingProjectionCaller
): readonly ContributionSummaryV1[] {
    return Object.values(state.contributions?.tasks ?? {})
        .filter(
            (task) =>
                audit(viewer) ||
                (state.status !== "archived" && (privileged(viewer) || author(task, viewer))) ||
                publicTask(state, task)
        )
        .sort(
            (left, right) =>
                left.createdAt - right.createdAt ||
                (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        )
        .map(summary);
}

function evidence(value: EvidenceVersion): EvidenceVersion {
    return {
        evidenceId: value.evidenceId,
        revision: value.revision,
        key: value.key,
        submittedBy: value.submittedBy,
        submittedAt: value.submittedAt,
        title: value.title,
        kind: value.kind,
        source: value.source,
        sourceDate: value.sourceDate,
        collectedAt: value.collectedAt,
        locator: value.locator,
        observation: value.observation,
        methodAndConditions: value.methodAndConditions,
        limitations: value.limitations,
        dependencies: value.dependencies,
        material:
            value.material.kind === "text"
                ? { kind: "text", text: value.material.text }
                : {
                      kind: "reference",
                      uri: value.material.uri,
                      sourceVersion: value.material.sourceVersion
                  },
        ...(value.code === undefined
            ? {}
            : {
                  code: {
                      repository: value.code.repository,
                      revision: value.code.revision,
                      pathsAndSymbols: value.code.pathsAndSymbols,
                      patchEvidenceKeys: [...value.code.patchEvidenceKeys],
                      validation: value.code.validation,
                      reproduction: value.code.reproduction,
                      expected: value.code.expected,
                      observed: value.code.observed,
                      notCovered: value.code.notCovered
                  }
              })
    };
}

function draft(value: ContributionDraft): ContributionDraft {
    const { message, claims } = value;
    const completion = claims.completion;
    return {
        revision: value.revision,
        basedOnSeq: value.basedOnSeq,
        submittedAt: value.submittedAt,
        message: {
            id: message.id,
            kind: message.kind,
            content: message.content,
            mentions: [...message.mentions],
            taskIds: [...message.taskIds],
            agendaRelation: message.agendaRelation,
            createdAt: message.createdAt,
            ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
            ...(message.minutesDraft === undefined
                ? {}
                : {
                      minutesDraft: {
                          status: message.minutesDraft.status,
                          coverage: {
                              fromSeq: message.minutesDraft.coverage.fromSeq,
                              throughSeq: message.minutesDraft.coverage.throughSeq
                          },
                          referencedMessageIds: [...message.minutesDraft.referencedMessageIds]
                      }
                  })
        },
        claims: {
            questions: claims.questions.map((v) => ({
                id: v.id,
                text: v.text,
                blocking: v.blocking,
                createdAt: v.createdAt,
                ...(v.directedTo === undefined ? {} : { directedTo: v.directedTo }),
                ...(v.affectedOutputIds === undefined
                    ? {}
                    : { affectedOutputIds: [...v.affectedOutputIds] }),
                ...(v.affectedCriterionIds === undefined
                    ? {}
                    : { affectedCriterionIds: [...v.affectedCriterionIds] }),
                ...(v.violatedConstraintIds === undefined
                    ? {}
                    : { violatedConstraintIds: [...v.violatedConstraintIds] })
            })),
            issues: claims.issues.map((v) => ({
                id: v.id,
                title: v.title,
                description: v.description,
                affectedOutputIds: [...v.affectedOutputIds],
                affectedCriterionIds: [...v.affectedCriterionIds],
                violatedConstraintIds: [...v.violatedConstraintIds],
                impact: v.impact,
                urgency: v.urgency,
                safeDefaultAvailable: v.safeDefaultAvailable,
                ...(v.riskLevel === undefined ? {} : { riskLevel: v.riskLevel })
            })),
            proposals: claims.proposals.map((v) => ({
                id: v.id,
                title: v.title,
                description: v.description,
                now: v.now,
                ...(v.proposalId === undefined ? {} : { proposalId: v.proposalId }),
                ...(v.expectedRevision === undefined
                    ? {}
                    : { expectedRevision: v.expectedRevision })
            })),
            positions: claims.positions.map((v) => ({
                id: v.id,
                proposalId: v.proposalId,
                proposalRevision: v.proposalRevision,
                position: v.position,
                blocking: v.blocking,
                now: v.now,
                ...(v.reason === undefined ? {} : { reason: v.reason })
            })),
            agendaCandidates: claims.agendaCandidates.map((v) => ({
                id: v.id,
                title: v.title,
                reason: v.reason,
                relationToActiveAgenda: v.relationToActiveAgenda,
                urgency: v.urgency,
                suggestedParticipants: [...v.suggestedParticipants],
                now: v.now
            })),
            decisionCandidates: claims.decisionCandidates.map((v) => ({
                id: v.id,
                proposalId: v.proposalId,
                proposalRevision: v.proposalRevision,
                statement: v.statement,
                rationale: v.rationale,
                sourceMessageId: v.sourceMessageId,
                agendaItemId: v.agendaItemId,
                createdAt: v.createdAt
            })),
            ...(completion === undefined
                ? {}
                : {
                      completion: {
                          ...(completion.outputClaims === undefined
                              ? {}
                              : {
                                    outputClaims: completion.outputClaims.map((v) => ({
                                        subjectId: v.subjectId,
                                        evidenceMessageIds: [...v.evidenceMessageIds],
                                        taskIds: [...v.taskIds]
                                    }))
                                }),
                          ...(completion.criterionClaims === undefined
                              ? {}
                              : {
                                    criterionClaims: completion.criterionClaims.map((v) => ({
                                        subjectId: v.subjectId,
                                        evidenceMessageIds: [...v.evidenceMessageIds],
                                        taskIds: [...v.taskIds]
                                    }))
                                }),
                          ...(completion.agendaResolution === undefined
                              ? {}
                              : {
                                    agendaResolution: {
                                        agendaItemId: completion.agendaResolution.agendaItemId,
                                        resolution: completion.agendaResolution.resolution,
                                        evidenceMessageIds: [
                                            ...completion.agendaResolution.evidenceMessageIds
                                        ]
                                    }
                                }),
                          ...(completion.review === undefined
                              ? {}
                              : {
                                    review: {
                                        outputId: completion.review.outputId,
                                        result: completion.review.result,
                                        reason: completion.review.reason,
                                        evidenceMessageIds: [
                                            ...completion.review.evidenceMessageIds
                                        ]
                                    }
                                }),
                          ...(completion.questionResolutions === undefined
                              ? {}
                              : {
                                    questionResolutions: completion.questionResolutions.map(
                                        (v) => ({
                                            questionId: v.questionId,
                                            answerMessageId: v.answerMessageId
                                        })
                                    )
                                }),
                          ...(completion.riskAcceptance === undefined
                              ? {}
                              : {
                                    riskAcceptance: {
                                        issueId: completion.riskAcceptance.issueId,
                                        decision: completion.riskAcceptance.decision,
                                        reason: completion.riskAcceptance.reason,
                                        evidenceMessageIds: [
                                            ...completion.riskAcceptance.evidenceMessageIds
                                        ]
                                    }
                                })
                      }
                  })
        },
        citations: value.citations.map((v) => ({
            evidenceKey: v.evidenceKey,
            claim: v.claim,
            locator: v.locator,
            inference: v.inference
        }))
    };
}

function denied(): never {
    throw new DomainError("UNAUTHORIZED_CALLER", "Contribution is not available to this caller.");
}

export function projectContributionRead(
    state: MeetingState,
    viewer: MeetingProjectionCaller,
    input: ReadContributionInputV1
): ReadContributionResultV1 {
    const task = state.contributions?.tasks[input.contributionId];
    if (input.meetingId !== state.id || task === undefined) denied();
    const historical =
        audit(viewer) ||
        (state.status !== "archived" && (privileged(viewer) || author(task, viewer)));
    const reviewer =
        state.status !== "archived" &&
        viewer.kind === "participant" &&
        viewer.participantId === state.contributions?.reviewerId &&
        task.requiresEvidenceReview &&
        task.phase === "boundary_review";
    if (!historical && !reviewer && !publicTask(state, task)) denied();
    const revision = input.draftRevision ?? task.currentDraftRevision;
    const selected = task.drafts[String(revision)];
    if (
        (!historical && revision !== task.currentDraftRevision) ||
        (input.draftRevision !== undefined && selected === undefined)
    )
        denied();
    if (!isMeetingStateV2(state))
        throw new DomainError("INVALID_ARGUMENT", "Contribution snapshot is malformed.");
    let selectedEvidence: EvidenceVersion | undefined;
    if (input.evidenceKey !== undefined) {
        const reachable = new Set<string>();
        const visit = (key: string): void => {
            if (reachable.has(key)) return;
            reachable.add(key);
            const material = state.contributions!.evidence[key];
            if (material === undefined)
                throw new DomainError("INVALID_ARGUMENT", "Contribution evidence is malformed.");
            material.code?.patchEvidenceKeys.forEach(visit);
        };
        selected?.citations.forEach((citation) => visit(citation.evidenceKey));
        selectedEvidence = state.contributions!.evidence[input.evidenceKey];
        if (
            selectedEvidence === undefined ||
            (!reachable.has(input.evidenceKey) &&
                !(
                    historical &&
                    (privileged(viewer) ||
                        (viewer.kind === "participant" &&
                            author(task, viewer) &&
                            selectedEvidence.submittedBy === viewer.participantId))
                ))
        )
            denied();
        if (
            state.status === "archived" &&
            !audit(viewer) &&
            !state.archive?.package.contributionRefs?.evidenceKeys.includes(input.evidenceKey)
        )
            denied();
    }
    return ReadContributionResultSchema({
        task: summary(task),
        drafts: selected === undefined ? [] : [draft(selected)],
        boundaryReviews: historical
            ? task.boundaryReviews
                  .filter((v) => v.draftRevision === revision)
                  .map((v) => ({
                      draftRevision: v.draftRevision,
                      decision: v.decision,
                      reason: v.reason,
                      checkedThroughSeq: v.checkedThroughSeq,
                      actor: v.actor,
                      reviewedAt: v.reviewedAt
                  }))
            : [],
        evidenceReviews: task.evidenceReviews
            .filter((v) => v.draftRevision === revision)
            .map((v) => ({
                draftRevision: v.draftRevision,
                evidenceKey: v.evidenceKey,
                claim: v.claim,
                verdict: v.verdict,
                method: v.method,
                result: v.result,
                limitations: v.limitations,
                actor: v.actor,
                reviewedAt: v.reviewedAt
            })),
        ...(selectedEvidence === undefined ? {} : { evidence: evidence(selectedEvidence) })
    });
}
