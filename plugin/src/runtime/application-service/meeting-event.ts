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

interface MeetingEventMappingInput {
    action: MeetingAction;
    scope: ResolvedCallerScope;
    beforeState: MeetingState;
    transition: CommandTransition;
    meetingId: string;
    now: number;
}

const createEventMapping = (input: MeetingEventMappingInput) => {
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
    const contribution = (id: string) => unique(after.contributions, id, "contribution");
    const versions = after.evidencePackages.flatMap((pkg) => pkg.versions);
    return {
        action,
        transition,
        scope,
        before,
        after,
        meetingId,
        now,
        invalid,
        required,
        unique,
        idAt,
        ref,
        refs,
        payload,
        contribution,
        versions
    };
};

type EventMapping = ReturnType<typeof createEventMapping>;

type ActionByKind = {
    [K in MeetingAction["kind"]]: Extract<MeetingAction, { kind: K }>;
};

type EventConverters = {
    [K in MeetingAction["kind"]]: (
        action: ActionByKind[K],
        mapping: EventMapping
    ) => readonly MeetingEventInput[];
};

const converters: EventConverters = {
    activate_agenda: (action, mapping) => {
        const { before, now, unique, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    dispose_agenda_candidate: (action, mapping) => {
        const { now, required, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    submit_manager_plan: (action, mapping) => {
        const { transition, after, now, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    open_round: (action, mapping) => {
        const { after, now, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    decline_hand: (action, mapping) => {
        const { scope, now, required, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
        const contributorId = required(scope.identityId, "contributor identity");
        events.push({
            type: "round.participation_recorded",
            occurredAt: now,
            payload: {
                ...payload(ref("round", action.roundId), [ref("identity", contributorId)]),
                data: { contributorId, status: "declined", reason: action.reason }
            }
        });
        return events;
    },
    expire_round_participation: (action, mapping) => {
        const { now, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
        events.push({
            type: "round.participation_recorded",
            occurredAt: now,
            payload: {
                ...payload(ref("round", action.roundId), [ref("identity", action.contributorId)]),
                data: { contributorId: action.contributorId, status: "no_response" }
            }
        });
        return events;
    },
    raise_hand: (action, mapping) => {
        const { scope, now, required, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
        const contributorId = required(scope.identityId, "contributor identity");
        events.push({
            type: "hand_raise.recorded",
            occurredAt: now,
            payload: {
                ...payload(ref("round", action.roundId), [ref("identity", contributorId)]),
                data: { contributorId, purpose: action.purpose }
            }
        });
        return events;
    },
    dispose_hand_raise: (action, mapping) => {
        const { now, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    submit_evidence: (action, mapping) => {
        const { now, required, unique, idAt, ref, payload, contribution, versions } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    close_contribution: (action, mapping) => {
        const { now, ref, payload, contribution } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    record_contribution_failure: (action, mapping) => {
        const { now, required, ref, payload, contribution } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    claim_evidence_review: (action, mapping) => {
        const { after, now, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    fail_evidence_validation: (action, mapping) => {
        const { before, now, unique, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    submit_evidence_review: (action, mapping) => {
        const { after, now, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    record_review_delivery: (action, mapping) => {
        const { after, now, invalid, required, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    publish_round: (action, mapping) => {
        const {
            before,
            after,
            now,
            invalid,
            required,
            unique,
            idAt,
            ref,
            refs,
            payload,
            versions
        } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    abort_round: (action, mapping) => {
        const { transition, before, after, now, unique, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    recommend_identity: (action, mapping) => {
        const { after, now, invalid, unique, idAt, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    record_identity_admission_result: (action, mapping) => {
        const { after, now, invalid, required, unique, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    resolve_question: (action, mapping) => {
        const { before, now, unique, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    dispose_issue: (action, mapping) => {
        const { before, now, unique, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    dispose_risk: (action, mapping) => {
        const { now, idAt, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    record_completion_fact: (action, mapping) => {
        const { now, idAt, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
        events.push({
            type: "completion_fact.recorded",
            occurredAt: now,
            payload: {
                ...payload(ref("completion_fact", idAt(0)), [
                    ...refs("evidence_version", action.evidenceIds)
                ]),
                data: {
                    outputId: action.outputId,
                    statement: action.statement,
                    rationale: action.rationale
                }
            }
        });
        return events;
    },
    change_completion_fact: (action, mapping) => {
        const { after, now, unique, required, idAt, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
                              ...refs("evidence_version", replacement.evidenceIds)
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
        if (replacement !== undefined) {
            const fact = unique(after.completionFacts, idAt(1), "replacement fact");
            events.push({
                type: "completion_fact.recorded",
                occurredAt: now,
                payload: {
                    ...payload(ref("completion_fact", fact.id), [
                        ref("completion_fact", action.factId),
                        ...refs("evidence_version", fact.evidenceIds)
                    ]),
                    data: {
                        outputId: fact.outputId,
                        statement: fact.statement,
                        rationale: fact.rationale
                    }
                }
            });
        }
        return events;
    },
    end_meeting: (action, mapping) => {
        const { after, now, required, ref, refs, payload } = mapping;
        const events: MeetingEventInput[] = [];
        const termination = required(after.termination, "termination");
        events.push({
            type: "meeting.ended",
            occurredAt: now,
            payload: {
                ...payload(ref("termination", termination.id), [
                    ...refs("completion_fact", termination.completionFactIds),
                    ...refs("question", termination.unresolvedQuestionIds),
                    ...refs("issue", termination.unresolvedIssueIds),
                    ...refs("contribution", termination.unclosedContributionIds)
                ]),
                data: { outcome: termination.outcome, reason: termination.reason }
            }
        });
        return events;
    },
    start_archive: (action, mapping) => {
        const { after, now, required, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    record_archive_session_result: (action, mapping) => {
        const { before, after, now, required, ref, payload } = mapping;
        const events: MeetingEventInput[] = [];
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
        return events;
    },
    pause_meeting: () => [],
    resume_meeting: () => [],
    create_meeting: (action, mapping) => {
        const { invalid } = mapping;
        return invalid("creation belongs to the creation coordinator");
    }
};

const convertAction = <K extends MeetingAction["kind"]>(
    kind: K,
    action: ActionByKind[K],
    mapping: EventMapping
): readonly MeetingEventInput[] => converters[kind](action, mapping);

export const buildMeetingEvents = (
    input: MeetingEventMappingInput
): readonly MeetingEventInput[] => {
    const mapping = createEventMapping(input);
    const { action, before, after, meetingId, now, payload, ref } = mapping;
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
    return [...events, ...convertAction(action.kind, action, mapping)];
};
