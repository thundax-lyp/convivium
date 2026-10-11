import {
    captainActorIdFor,
    type MeetingEventActor,
    type MeetingEventInput,
    type MeetingEventObjectRef,
    type MeetingState
} from "@/domain/index.ts";
import type { MeetingAction } from "@/protocol/index.ts";
import { TransitionRejected, type CommandTransition } from "./meeting-action-transition.ts";
import type { ResolvedCallerScope } from "./meeting-command.ts";

export const buildMeetingEvents = (input: {
    action: MeetingAction;
    scope: ResolvedCallerScope;
    beforeState: MeetingState;
    transition: CommandTransition;
    meetingId: string;
    now: number;
}): readonly MeetingEventInput[] => {
    const { action, scope, beforeState: before, transition, meetingId, now } = input;
    const invalid = (description: string): never => {
        throw new TransitionRejected("INVALID_STATE", `Cannot map meeting event: ${description}`);
    };
    if (transition.kind !== "accepted") {
        return invalid("transition is not accepted");
    }
    const after = transition.state;
    const required = <T>(value: T | undefined, description: string): T =>
        value === undefined ? invalid(description) : value;
    const unique = <T extends { id: string }>(
        objects: readonly T[],
        id: string | undefined,
        description: string
    ): T => {
        const matches = objects.filter((object) => object.id === id);
        return matches.length === 1 ? required(matches[0], description) : invalid(description);
    };
    const idAt = (index: number): string =>
        required(transition.relatedIds[index], `relatedIds[${index}]`);
    const ref = (kind: MeetingEventObjectRef["kind"], id: string): MeetingEventObjectRef => ({
        kind,
        id
    });
    const refs = (
        kind: MeetingEventObjectRef["kind"],
        ids: readonly string[]
    ): MeetingEventObjectRef[] => ids.map((id) => ref(kind, id));
    const actor: MeetingEventActor =
        scope.role === "runtime"
            ? { kind: "system" }
            : scope.role === "captain"
              ? { kind: "captain", actorId: captainActorIdFor(meetingId) }
              : { kind: "identity", actorId: required(scope.identityId, "identity actor") };
    const payload = (
        subject: MeetingEventObjectRef,
        relatedObjects: MeetingEventObjectRef[] = []
    ) => ({
        logVersion: 1 as const,
        actor: { ...actor },
        subject,
        relatedObjects: relatedObjects.filter(
            (object, index, all) =>
                all.findIndex((other) => other.kind === object.kind && other.id === object.id) ===
                index
        )
    });
    const events: MeetingEventInput[] = [];
    if (before.lifecycle.status !== after.lifecycle.status) {
        events.push({
            type: "meeting.lifecycle_changed",
            occurredAt: now,
            payload: {
                ...payload(ref("meeting", meetingId)),
                data: {
                    from: before.lifecycle.status,
                    to: after.lifecycle.status,
                    ...(after.lifecycle.reason === undefined
                        ? {}
                        : { reason: after.lifecycle.reason })
                }
            }
        });
    }
    const contribution = (id: string) => unique(after.contributions, id, "contribution");
    const versions = after.evidencePackages.flatMap((pkg) => pkg.versions);
    switch (action.kind) {
        case "activate_agenda": {
            const active = unique(
                before.agenda.filter((agenda) => agenda.status === "active"),
                before.agenda.find((agenda) => agenda.status === "active")?.id,
                "previous active agenda"
            );
            events.push({
                type: "agenda.activated",
                occurredAt: now,
                payload: {
                    ...payload(ref("agenda", action.agendaId), [ref("agenda", active.id)]),
                    data: { previousDisposition: action.previousDisposition, reason: action.reason }
                }
            });
            break;
        }
        case "dispose_agenda_candidate":
            events.push({
                type: "agenda_candidate.disposed",
                occurredAt: now,
                payload: {
                    ...payload(
                        ref("agenda_candidate", action.candidateId),
                        action.disposition === "promoted"
                            ? [ref("agenda", required(action.promotedAgenda, "promoted agenda").id)]
                            : []
                    ),
                    data: { disposition: action.disposition, reason: action.reason }
                }
            });
            break;
        case "submit_manager_plan": {
            const plan = unique(after.managerPlans, idAt(1), "manager plan");
            events.push({
                type: "manager_plan.recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("manager_plan", plan.id), [
                        ref("agenda", action.agendaId),
                        ...(transition.relatedIds[3] === undefined
                            ? []
                            : [ref("manager_plan", transition.relatedIds[3])])
                    ]),
                    data: {
                        planKind: plan.kind,
                        rationale: plan.rationale,
                        ...(plan.blockingReason === undefined
                            ? {}
                            : { blockingReason: plan.blockingReason })
                    }
                }
            });
            break;
        }
        case "open_round": {
            const round = unique(after.rounds, idAt(0), "round");
            events.push({
                type: "round.opened",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", round.id), [
                        ref("agenda", round.agendaId),
                        ref("manager_plan", round.planId)
                    ]),
                    data: round.deadlineAt === undefined ? {} : { deadlineAt: round.deadlineAt }
                }
            });
            break;
        }
        case "decline_hand": {
            const contributorId = required(scope.identityId, "contributor identity");
            events.push({
                type: "round.participation_recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", action.roundId), [ref("identity", contributorId)]),
                    data: { contributorId, status: "declined", reason: action.reason }
                }
            });
            break;
        }
        case "expire_round_participation":
            events.push({
                type: "round.participation_recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", action.roundId), [
                        ref("identity", action.contributorId)
                    ]),
                    data: { contributorId: action.contributorId, status: "no_response" }
                }
            });
            break;
        case "raise_hand": {
            const contributorId = required(scope.identityId, "contributor identity");
            events.push({
                type: "hand_raise.recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", action.roundId), [ref("identity", contributorId)]),
                    data: { contributorId, purpose: action.purpose }
                }
            });
            break;
        }
        case "dispose_hand_raise": {
            const data =
                action.disposition === "accepted"
                    ? {
                          contributorId: action.contributorId,
                          disposition: action.disposition,
                          reason: action.reason,
                          contributionId: idAt(1)
                      }
                    : {
                          contributorId: action.contributorId,
                          disposition: action.disposition,
                          reason: action.reason
                      };
            events.push({
                type: "hand_raise.disposed",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", action.roundId), [
                        ref("identity", action.contributorId),
                        ...(action.disposition === "accepted" ? [ref("contribution", idAt(1))] : [])
                    ]),
                    data
                }
            });
            break;
        }
        case "submit_evidence": {
            const version = unique(versions, idAt(1), "submitted evidence version");
            events.push({
                type: "evidence.submitted",
                occurredAt: now,
                payload: {
                    ...payload(ref("evidence_version", version.id), [
                        ref("contribution", action.contributionId),
                        ref("round", contribution(action.contributionId).roundId)
                    ]),
                    data: { summary: required(version.summary, "evidence summary") }
                }
            });
            break;
        }
        case "close_contribution":
            events.push({
                type: "contribution.closed",
                occurredAt: now,
                payload: {
                    ...payload(ref("contribution", action.contributionId), [
                        ref("round", contribution(action.contributionId).roundId)
                    ]),
                    data: { exit: action.exit, reason: action.reason }
                }
            });
            break;
        case "record_contribution_failure": {
            const item = contribution(action.contributionId);
            const failure = required(item.failure, "contribution failure");
            events.push({
                type: "contribution.failed",
                occurredAt: now,
                payload: {
                    ...payload(ref("contribution", item.id), [ref("round", item.roundId)]),
                    data: {
                        sourceEffectId: failure.sourceEffectId,
                        stage: failure.stage,
                        failureCode: failure.failureCode,
                        failureSummary: failure.failureSummary,
                        attemptCount: failure.attemptCount,
                        retryable: failure.retryable
                    }
                }
            });
            break;
        }
        case "claim_evidence_review": {
            const claim = unique(
                after.reviewClaims.filter(
                    (item) =>
                        item.roundId === action.roundId &&
                        item.versionId === action.versionId &&
                        item.sourceEffectId === action.sourceEffectId
                ),
                idAt(0),
                "review claim"
            );
            events.push({
                type: "evidence_review.claimed",
                occurredAt: now,
                payload: {
                    ...payload(ref("evidence_version", action.versionId), [
                        ref("round", action.roundId)
                    ]),
                    data: { claimId: claim.id, sourceEffectId: action.sourceEffectId }
                }
            });
            break;
        }
        case "fail_evidence_validation": {
            const claim = unique(before.reviewClaims, action.claimId, "failed review claim");
            events.push({
                type: "evidence_validation.failed",
                occurredAt: now,
                payload: {
                    ...payload(ref("evidence_version", claim.versionId), [
                        ref("round", action.roundId)
                    ]),
                    data: { claimId: action.claimId, reason: action.reason }
                }
            });
            break;
        }
        case "submit_evidence_review": {
            const review = unique(after.reviews, idAt(0), "submitted review");
            events.push({
                type: "evidence_review.submitted",
                occurredAt: now,
                payload: {
                    ...payload(ref("evidence_review", review.id), [
                        ref("evidence_version", action.versionId),
                        ref("round", action.roundId)
                    ]),
                    data: { claimId: action.claimId, scope: review.scope }
                }
            });
            break;
        }
        case "record_review_delivery": {
            const review = unique(after.reviews, action.reviewId, "delivered review");
            const packages = after.evidencePackages.filter((pkg) =>
                pkg.versions.some((version) => version.id === review.versionId)
            );
            const pkg =
                packages.length === 1
                    ? required(packages[0], "review package")
                    : invalid("review package");
            events.push({
                type: "review_delivery.recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("review_delivery", idAt(0)), [
                        ref("evidence_review", review.id),
                        ref("round", pkg.roundId)
                    ]),
                    data:
                        action.status === "sent"
                            ? { status: "sent" }
                            : {
                                  status: "failed",
                                  failureReason: required(
                                      action.failureReason,
                                      "delivery failure reason"
                                  )
                              }
                }
            });
            break;
        }
        case "publish_round": {
            const publication = unique(after.publications, idAt(0), "publication");
            const messages = after.messages
                .filter((message) => !before.messages.some((old) => old.id === message.id))
                .sort((a, b) => a.seq - b.seq);
            events.push({
                type: "round.published",
                occurredAt: now,
                payload: {
                    ...payload(ref("publication", publication.id), [
                        ref("round", action.roundId),
                        ...refs("evidence_version", publication.finalVersionIds),
                        ...refs(
                            "formal_message",
                            messages.map((message) => message.id)
                        )
                    ]),
                    data: {}
                }
            });
            for (const message of messages) {
                const related = message.relatedIds.map((id) => {
                    const matches = [
                        ...versions
                            .filter((version) => version.id === id)
                            .map((version) => ref("evidence_version", version.id)),
                        ...after.reviews
                            .filter((review) => review.id === id)
                            .map((review) => ref("evidence_review", review.id))
                    ];
                    return matches.length === 1
                        ? required(matches[0], "message relation")
                        : invalid("message relation");
                });
                events.push({
                    type: "formal_message.published",
                    occurredAt: now,
                    payload: {
                        ...payload(ref("formal_message", message.id), [
                            ref("publication", message.publicationId),
                            ref("round", action.roundId),
                            ...related
                        ]),
                        data: { messageKind: message.kind }
                    }
                });
            }
            break;
        }
        case "abort_round": {
            const ids = transition.relatedIds.slice(1).map((id) => {
                const candidates = after.contributions.filter((item) => item.id === id);
                return unique(
                    candidates.length === 0 ? before.contributions : candidates,
                    id,
                    "aborted contribution"
                ).id;
            });
            events.push({
                type: "round.aborted",
                occurredAt: now,
                payload: {
                    ...payload(ref("round", action.roundId), refs("contribution", ids)),
                    data: { reason: action.reason }
                }
            });
            break;
        }
        case "recommend_identity": {
            const recommendation = unique(
                after.identityRecommendations,
                idAt(0),
                "identity recommendation"
            );
            const data =
                recommendation.decision === "reject"
                    ? {
                          decision: recommendation.decision,
                          status: recommendation.status,
                          rationale: recommendation.rationale
                      }
                    : recommendation.status === "failed"
                      ? invalid("failed initial recommendation")
                      : {
                            decision: recommendation.decision,
                            status: recommendation.status,
                            rationale: recommendation.rationale
                        };
            events.push({
                type: "identity.recommended",
                occurredAt: now,
                payload: {
                    ...payload(ref("identity_recommendation", recommendation.id), [
                        ref("agenda", action.agendaId),
                        ...(recommendation.identityId === undefined
                            ? []
                            : [ref("identity", recommendation.identityId)])
                    ]),
                    data
                }
            });
            break;
        }
        case "record_identity_admission_result": {
            const recommendation = unique(
                after.identityRecommendations,
                action.recommendationId,
                "admission recommendation"
            );
            if (recommendation.status !== "active" && recommendation.status !== "failed") {
                return invalid("admission status");
            }
            events.push({
                type: "identity.admission_recorded",
                occurredAt: now,
                payload: {
                    ...payload(
                        ref("identity_recommendation", recommendation.id),
                        recommendation.status === "active"
                            ? [
                                  ref(
                                      "identity",
                                      required(recommendation.identityId, "admitted identity")
                                  )
                              ]
                            : []
                    ),
                    data:
                        recommendation.status === "active"
                            ? { status: "active" }
                            : {
                                  status: "failed",
                                  failureCode: required(
                                      recommendation.failureCode,
                                      "admission failure code"
                                  )
                              }
                }
            });
            break;
        }
        case "resolve_question": {
            const question = unique(before.questions, action.questionId, "question");
            events.push({
                type: "question.disposed",
                occurredAt: now,
                payload: {
                    ...payload(ref("question", question.id), [
                        ref("agenda", question.agendaId),
                        ...refs("evidence_version", action.evidenceIds)
                    ]),
                    data: { status: action.status, rationale: action.rationale }
                }
            });
            break;
        }
        case "dispose_issue": {
            const issue = unique(before.issues, action.issueId, "issue");
            events.push({
                type: "issue.disposed",
                occurredAt: now,
                payload: {
                    ...payload(ref("issue", issue.id), [
                        ref("agenda", issue.agendaId),
                        ...refs("evidence_version", action.evidenceIds)
                    ]),
                    data: { status: action.status, rationale: action.rationale }
                }
            });
            break;
        }
        case "dispose_risk":
            events.push({
                type: "risk.disposed",
                occurredAt: now,
                payload: {
                    ...payload(ref("risk_disposition", idAt(0)), [
                        ref("issue", action.issueId),
                        ...refs("evidence_version", action.evidenceIds)
                    ]),
                    data: {
                        action: action.action,
                        scope: action.scope,
                        rationale: action.rationale
                    }
                }
            });
            break;
        case "decide": {
            const decision = unique(after.decisions, idAt(0), "decision");
            events.push({
                type: "decision.recorded",
                occurredAt: now,
                payload: {
                    ...payload(
                        ref("decision", decision.id),
                        refs("evidence_version", decision.evidenceIds)
                    ),
                    data: { status: "accepted" }
                }
            });
            break;
        }
        case "change_decision":
            events.push({
                type: "decision.changed",
                occurredAt: now,
                payload: {
                    ...payload(ref("decision", action.decisionId), [
                        ...(action.status === "superseded" ? [ref("decision", idAt(1))] : []),
                        ...refs("evidence_version", action.evidenceIds)
                    ]),
                    data:
                        action.status === "superseded"
                            ? {
                                  status: action.status,
                                  rationale: action.rationale,
                                  replacementDecisionId: idAt(1)
                              }
                            : { status: action.status, rationale: action.rationale }
                }
            });
            break;
        case "record_completion_fact":
            events.push({
                type: "completion_fact.recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("completion_fact", idAt(0)), [
                        ...refs("evidence_version", action.evidenceIds),
                        ...refs("decision", action.decisionIds)
                    ]),
                    data: {
                        outputId: action.outputId,
                        statement: action.statement,
                        rationale: action.rationale
                    }
                }
            });
            break;
        case "change_completion_fact": {
            const replacement =
                action.status === "superseded"
                    ? required(action.replacement, "replacement fact")
                    : undefined;
            events.push({
                type: "completion_fact.changed",
                occurredAt: now,
                payload: {
                    ...payload(
                        ref("completion_fact", action.factId),
                        replacement === undefined
                            ? []
                            : [
                                  ref("completion_fact", idAt(1)),
                                  ...refs("evidence_version", replacement.evidenceIds),
                                  ...refs("decision", replacement.decisionIds)
                              ]
                    ),
                    data:
                        action.status === "superseded"
                            ? {
                                  status: action.status,
                                  rationale: action.rationale,
                                  replacementFactId: idAt(1)
                              }
                            : { status: action.status, rationale: action.rationale }
                }
            });
            break;
        }
        case "end_meeting": {
            const termination = required(after.termination, "termination");
            events.push({
                type: "meeting.ended",
                occurredAt: now,
                payload: {
                    ...payload(ref("termination", termination.id), [
                        ...refs("decision", termination.decisionIds),
                        ...refs("completion_fact", termination.completionFactIds),
                        ...refs("question", termination.unresolvedQuestionIds),
                        ...refs("issue", termination.unresolvedIssueIds),
                        ...refs("contribution", termination.unclosedContributionIds)
                    ]),
                    data: { outcome: termination.outcome, reason: termination.reason }
                }
            });
            break;
        }
        case "start_archive":
            events.push({
                type: "archive.started",
                occurredAt: now,
                payload: {
                    ...payload(ref("archive", required(after.archive, "archive").id), [
                        ref("termination", required(after.termination, "termination").id)
                    ]),
                    data: { status: "complete" }
                }
            });
            break;
        case "record_archive_session_result":
            if (before.lifecycle.status !== "archived" && after.lifecycle.status === "archived") {
                events.push({
                    type: "archive.completed",
                    occurredAt: now,
                    payload: {
                        ...payload(ref("archive", required(after.archive, "archive").id)),
                        data: { status: "complete" }
                    }
                });
            }
            break;
        case "pause_meeting":
        case "resume_meeting":
            break;
        case "create_meeting":
            return invalid("creation belongs to the creation coordinator");
        default: {
            const exhaustive: never = action;
            return exhaustive;
        }
    }
    return events;
};
