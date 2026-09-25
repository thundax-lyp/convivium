import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import {
    captainActorIdFor,
    abortRound,
    decide,
    changeDecision,
    disposeRisk,
    recordCompletionFact,
    changeCompletionFact,
    type TargetDomainFactPayload,
    closeContribution,
    claimEvidenceReview,
    completeMeetingArchive,
    disposeHandRaise,
    endMeeting,
    openRound,
    publishRound,
    raiseHand,
    failEvidenceValidation,
    recommendIdentity,
    recordIdentityAdmissionResult,
    recordReviewDelivery,
    startMeetingArchive,
    submitEvidence,
    submitEvidenceReview,
    transitionMeetingState,
    type MeetingDomainEffectRequest,
    type MeetingState,
    type MeetingTransitionResult
} from "@/domain/index.js";
import type { MeetingCommand } from "@/protocol/index.js";
import type { CommittedFactRecord } from "@/repository/types.js";
import type {
    MeetingCommandApplicationDependencies,
    MeetingCommandExecutionContext,
    ResolvedCallerScope
} from "./meeting-command.js";

export class TransitionRejected extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly targetKind?: string,
        readonly targetId?: string
    ) {
        super(message);
    }
}

export type CommandTransition = (
    | MeetingTransitionResult
    | {
          kind: "accepted";
          state: MeetingState;
          relatedIds: readonly string[];
          effectRequests: readonly {
              kind: "identity_provision";
              recommendationId: string;
              admissionId: string;
          }[];
      }
) & { factPayload?: TargetDomainFactPayload };

type TransitionInput = {
    snapshot: { state: MeetingState; version: number };
    repositoryContext: { allSessionOwnershipClosedAfterResult?: boolean };
    deps: MeetingCommandApplicationDependencies;
    command: MeetingCommand;
    context: MeetingCommandExecutionContext;
    scope: ResolvedCallerScope;
    now: number;
    factId: string;
    catalogDefinitionHash?: string;
    committedFacts: readonly CommittedFactRecord<MeetingState>[];
};

const resumedEvidenceReviewEffects = (state: MeetingState): readonly MeetingDomainEffectRequest[] =>
    state.evidencePackages.flatMap((pkg) =>
        pkg.versions
            .filter(
                (version) =>
                    version.id === pkg.currentVersionId && version.status === "validation_cancelled"
            )
            .map((version) => ({
                kind: "agent_notice" as const,
                noticeKind: "review_request" as const,
                recipientId: state.evidenceReviewerId,
                agendaId: pkg.agendaId,
                versionId: version.id
            }))
    );

const runArchiveTransition = (
    input: TransitionInput,
    action: Extract<
        MeetingCommand["action"],
        { kind: "start_archive" | "record_archive_session_result" }
    >,
    actorId: string
): CommandTransition => {
    const { snapshot, repositoryContext, context, now, committedFacts } = input;
    let transition: CommandTransition;
    switch (action.kind) {
        case "start_archive":
            transition = startMeetingArchive(snapshot.state, {
                archiveId: context.archiveEffect!.archiveId,
                actorId,
                now,
                questionIssueDispositionFacts: committedFacts
                    .filter(
                        (fact) =>
                            (fact.kind === "resolve_question" &&
                                fact.payload.kind === "question_disposition") ||
                            (fact.kind === "dispose_issue" &&
                                fact.payload.kind === "issue_disposition")
                    )
                    .sort(
                        (left, right) =>
                            left.occurredAt - right.occurredAt ||
                            left.factId.localeCompare(right.factId)
                    )
                    .map((fact) => ({
                        factId: fact.factId,
                        kind: fact.kind,
                        actorId: fact.actorId,
                        occurredAt: fact.occurredAt,
                        relatedIds: fact.relatedIds,
                        payload: fact.payload
                    })) as never
            });
            break;
        case "record_archive_session_result": {
            transition =
                action.status === "closed" &&
                repositoryContext.allSessionOwnershipClosedAfterResult === true
                    ? completeMeetingArchive(snapshot.state, {
                          actorId,
                          now,
                          allSessionOwnershipClosed: true
                      })
                    : {
                          kind: "accepted",
                          state: {
                              ...snapshot.state,
                              version: snapshot.state.version + 1,
                              updatedAt: now
                          },
                          relatedIds: [action.sessionOwnershipId],
                          effectRequests: []
                      };
            break;
        }
    }
    return transition;
};

const runAdmissionTransition = (
    input: TransitionInput,
    action: Extract<
        MeetingCommand["action"],
        { kind: "recommend_identity" | "record_identity_admission_result" }
    >,
    actorId: string
): CommandTransition => {
    const { snapshot, deps, context, now, catalogDefinitionHash } = input;
    const generated = (kind: string) => deps.ids.nextId(kind);
    let transition: CommandTransition;
    switch (action.kind) {
        case "recommend_identity": {
            const identityId =
                action.decision === "admit" ? generated("meeting_identity") : undefined;
            const result = recommendIdentity(
                snapshot.state,
                action,
                actorId,
                {
                    recommendationId: generated("identity_recommendation"),
                    ...(action.decision === "admit"
                        ? {
                              identityId,
                              sessionId: `meeting_agent_session-${sha256Hex(encodeCanonicalJson([snapshot.state.id, "meeting_agent_session", identityId!])).slice(0, 32)}`,
                              definitionHash: catalogDefinitionHash
                          }
                        : {})
                },
                now
            );
            if (result.kind === "rejected")
                throw new TransitionRejected(result.errorCode, result.errorCode);
            transition = {
                kind: "accepted",
                state: result.state,
                relatedIds: result.fact.relatedIds,
                effectRequests: result.effect === undefined ? [] : [result.effect]
            };
            break;
        }
        case "record_identity_admission_result": {
            if (context.identityAdmissionResult === undefined)
                throw new TransitionRejected(
                    "PRECONDITION_FAILED",
                    "Identity admission result is required"
                );
            const result = recordIdentityAdmissionResult(
                snapshot.state,
                action.recommendationId,
                context.identityAdmissionResult,
                now
            );
            if (result.kind === "rejected")
                throw new TransitionRejected(result.errorCode, result.errorCode);
            transition = {
                kind: "accepted",
                state: result.state,
                relatedIds: result.fact.relatedIds,
                effectRequests: []
            };
            break;
        }
    }
    return transition;
};

const runUserControlTransition = (
    input: TransitionInput,
    action: Extract<
        MeetingCommand["action"],
        {
            kind:
                | "activate_agenda"
                | "dispose_agenda_candidate"
                | "resolve_question"
                | "dispose_issue"
                | "pause_meeting"
                | "resume_meeting"
                | "abort_round"
                | "decide"
                | "change_decision"
                | "dispose_risk"
                | "record_completion_fact"
                | "change_completion_fact"
                | "end_meeting";
        }
    >,
    actorId: string
): CommandTransition => {
    const { snapshot, deps, now, factId } = input;
    const generated = (kind: string) => deps.ids.nextId(kind);
    let transition: CommandTransition;
    switch (action.kind) {
        case "activate_agenda":
        case "dispose_agenda_candidate":
        case "resolve_question":
        case "dispose_issue":
        case "pause_meeting":
        case "resume_meeting": {
            const result = transitionMeetingState(
                snapshot.state,
                action,
                { kind: "captain_user", id: actorId },
                now,
                factId
            );
            if (result.kind === "rejected") throw new TransitionRejected(result.code, result.code);
            transition = {
                kind: "accepted",
                state: result.state,
                relatedIds: result.facts[0].relatedIds,
                factPayload: result.facts[0].payload,
                effectRequests:
                    action.kind === "resume_meeting"
                        ? resumedEvidenceReviewEffects(result.state)
                        : []
            };
            break;
        }
        case "abort_round":
            transition = abortRound(snapshot.state, {
                roundId: action.roundId,
                reason: action.reason,
                actor: { kind: "captain_user", id: actorId },
                now
            });
            break;
        case "decide":
            transition = decide(snapshot.state, {
                decisionId: generated("decision"),
                candidateId: action.candidateId,
                actor: { kind: "captain_user", id: actorId },
                now
            });
            break;
        case "change_decision":
            transition = changeDecision(snapshot.state, {
                decisionId: action.decisionId,
                rationale: action.rationale,
                evidenceIds: action.evidenceIds,
                actor: { kind: "captain_user", id: actorId },
                now,
                ...(action.status === "superseded"
                    ? {
                          status: "superseded",
                          replacementCandidateId: action.replacementCandidateId!,
                          replacementDecisionId: generated("decision")
                      }
                    : { status: "revoked" })
            });
            break;
        case "dispose_risk":
            transition = disposeRisk(snapshot.state, {
                ...action,
                dispositionId: generated("risk_disposition"),
                actor: { kind: "captain_user", id: actorId },
                now
            });
            break;
        case "record_completion_fact":
            transition = recordCompletionFact(snapshot.state, {
                ...action,
                factId: generated("completion_fact"),
                actor: { kind: "captain_user", id: actorId },
                now
            });
            break;
        case "change_completion_fact":
            transition = changeCompletionFact(snapshot.state, {
                factId: action.factId,
                rationale: action.rationale,
                actor: { kind: "captain_user", id: actorId },
                now,
                ...(action.status === "superseded"
                    ? {
                          status: "superseded",
                          replacement: {
                              ...action.replacement!,
                              factId: generated("completion_fact")
                          }
                      }
                    : { status: "revoked" })
            });
            break;
        case "end_meeting":
            transition = endMeeting(snapshot.state, {
                ...action,
                terminationId: generated("termination"),
                actorId,
                now
            });
            break;
    }
    return transition;
};

const runManagerPlanTransition = (
    input: TransitionInput,
    action: Extract<MeetingCommand["action"], { kind: "submit_manager_plan" }>,
    actorId: string
): CommandTransition => {
    const { snapshot, deps, now, factId } = input;
    const generated = (kind: string) => deps.ids.nextId(kind);
    const result = transitionMeetingState(
        snapshot.state,
        {
            kind: "plan_next_step",
            agendaId: action.agendaId,
            planKind: action.planKind,
            ...(action.roundGoal === undefined ? {} : { roundGoal: action.roundGoal }),
            rationale: action.rationale,
            ...(action.blockingReason === undefined
                ? {}
                : { blockingReason: action.blockingReason })
        },
        { kind: "identity", id: actorId },
        now,
        factId,
        generated("manager_plan")
    );
    if (result.kind === "rejected") throw new TransitionRejected(result.code, result.code);
    return {
        kind: "accepted",
        state: result.state,
        relatedIds: result.facts[0].relatedIds,
        effectRequests: []
    };
};

export const runMeetingActionTransition = (input: TransitionInput): CommandTransition => {
    const { snapshot, deps, command, scope, now } = input;
    const generated = (kind: string) => deps.ids.nextId(kind);
    const action = command.action;
    const actorId =
        scope.role === "captain"
            ? captainActorIdFor(command.meetingId)
            : (scope.identityId ?? scope.caller.principalId);
    let transition: CommandTransition;
    switch (action.kind) {
        case "submit_manager_plan":
            transition = runManagerPlanTransition(input, action, actorId);
            break;
        case "open_round":
            transition = openRound(snapshot.state, {
                roundId: generated("round"),
                agendaId: action.agendaId,
                planId: action.planId,
                managerId: actorId,
                now,
                ...(action.deadlineAt === undefined ? {} : { deadlineAt: action.deadlineAt })
            });
            break;
        case "raise_hand":
            transition = raiseHand(snapshot.state, {
                roundId: action.roundId,
                contributorId: actorId,
                purpose: action.purpose,
                now
            });
            break;
        case "dispose_hand_raise":
            transition = disposeHandRaise(snapshot.state, {
                roundId: action.roundId,
                contributorId: action.contributorId,
                managerId: actorId,
                disposition: action.disposition,
                reason: action.reason,
                ...(action.disposition === "accepted"
                    ? { contributionId: generated("contribution") }
                    : {}),
                now
            });
            break;
        case "submit_evidence":
            transition = submitEvidence(snapshot.state, {
                contributionId: action.contributionId,
                authorId: actorId,
                evidence: action.evidence,
                packageId: generated("evidence_package"),
                versionId: generated("evidence_version"),
                now
            });
            break;
        case "close_contribution":
            transition = closeContribution(snapshot.state, {
                contributionId: action.contributionId,
                actorId,
                actorKind:
                    scope.caller.channel === "deadline_handler" ? "deadline_handler" : "author",
                exit: action.exit,
                reason: action.reason,
                now
            });
            break;
        case "submit_evidence_review":
            transition = submitEvidenceReview(snapshot.state, {
                reviewerId: actorId,
                roundId: action.roundId,
                claimId: action.claimId,
                versionId: action.versionId,
                dimensions: action.dimensions,
                scope: action.scope,
                reviewId: generated("review"),
                now
            });
            break;
        case "claim_evidence_review":
            transition = claimEvidenceReview(snapshot.state, {
                claimId: generated("review_claim"),
                sourceEffectId: action.sourceEffectId,
                reviewerId: snapshot.state.evidenceReviewerId,
                roundId: action.roundId,
                versionId: action.versionId,
                now,
                expiresAt: now + snapshot.state.limits.reviewDeadlineMs
            });
            break;
        case "fail_evidence_validation":
            transition = failEvidenceValidation(snapshot.state, {
                claimId: action.claimId,
                roundId: action.roundId,
                reason: action.reason,
                now
            });
            break;
        case "record_review_delivery":
            transition = recordReviewDelivery(snapshot.state, {
                reviewId: action.reviewId,
                dispatcherId: actorId,
                deliveryId: generated("review_delivery"),
                status: action.status,
                ...(action.failureReason === undefined
                    ? {}
                    : { failureReason: action.failureReason }),
                now
            });
            break;
        case "publish_round": {
            const round = snapshot.state.rounds.find(
                (candidate) => candidate.id === action.roundId
            );
            const count =
                round?.contributionIds.filter((id) => {
                    const contribution = snapshot.state.contributions.find(
                        (candidate) => candidate.id === id
                    );
                    return contribution?.packageId !== undefined;
                }).length ?? 0;
            transition = publishRound(snapshot.state, {
                roundId: action.roundId,
                managerId: actorId,
                publicationId: generated("publication"),
                messageIds: Array.from({ length: count }, () => generated("formal_message")),
                now
            });
            break;
        }
        case "activate_agenda":
        case "dispose_agenda_candidate":
        case "resolve_question":
        case "dispose_issue":
        case "pause_meeting":
        case "resume_meeting":
        case "abort_round":
        case "decide":
        case "change_decision":
        case "dispose_risk":
        case "record_completion_fact":
        case "change_completion_fact":
        case "end_meeting":
            transition = runUserControlTransition(input, action, actorId);
            break;
        case "start_archive":
        case "record_archive_session_result":
            transition = runArchiveTransition(input, action, actorId);
            break;
        case "recommend_identity":
        case "record_identity_admission_result":
            transition = runAdmissionTransition(input, action, actorId);
            break;
        case "create_meeting":
            throw new TransitionRejected(
                "INVALID_ARGUMENT",
                "Create must use the creation coordinator"
            );
    }
    return transition;
};
