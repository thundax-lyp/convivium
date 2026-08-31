import { cancelNonTerminalMeetingTasks } from "../meeting-task.js";
import { DomainError } from "../errors.js";
import type {
    CompletionFact,
    DomainEffect,
    MeetingState,
    MeetingStatus,
    TransitionResult
} from "../model.js";
import { transitionMeeting } from "./meeting.js";

export interface EndMeetingTransitionContext {
    meetingId: string;
    captainBinding: string;
    outcome: "completed" | "partial" | "no_consensus" | "cancelled";
    reason: string;
    acceptedDecisionIds: readonly string[];
    deferredAgendaItemIds: readonly string[];
    waivers: readonly {
        subjectId: string;
        kind: "required_review" | "agenda_item";
        reason: string;
    }[];
    now: number;
    factId: (index: number) => string;
}

export const executionTerminalStatuses: readonly MeetingStatus[] = [
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
];

export function endMeeting(
    state: MeetingState,
    context: EndMeetingTransitionContext
): TransitionResult<MeetingState> {
    if (context.meetingId !== state.id) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command targets another meeting", {
            entityType: "meeting",
            entityId: context.meetingId,
            meetingVersion: state.version
        });
    }
    if (executionTerminalStatuses.includes(state.status)) {
        throw new DomainError("IMMUTABLE_MEETING", `meeting ${state.id} is immutable`, {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (!context.reason.trim()) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command requires a reason", {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (
        new Set(context.acceptedDecisionIds).size !== context.acceptedDecisionIds.length ||
        context.acceptedDecisionIds.some(
            (id) =>
                !state.decisions.some(
                    (decision) => decision.id === id && decision.status === "accepted"
                )
        )
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "end command references an invalid decision",
            {
                entityType: "meeting",
                entityId: state.id,
                meetingVersion: state.version
            }
        );
    }
    if (
        new Set(context.deferredAgendaItemIds).size !== context.deferredAgendaItemIds.length ||
        context.deferredAgendaItemIds.some((id) => !state.agenda.some((item) => item.id === id))
    ) {
        throw new DomainError("INVALID_ENTITY_STATE", "end command references an invalid agenda", {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    if (
        context.outcome !== "partial" &&
        (context.deferredAgendaItemIds.length > 0 || context.waivers.length > 0)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "only a partial outcome may defer agenda or waive requirements",
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }

    let completionFacts = [...state.completionFacts];
    const agenda = state.agenda.map((item) =>
        context.deferredAgendaItemIds.includes(item.id)
            ? { ...item, status: "deferred" as const }
            : item
    );
    const waiverFacts: CompletionFact[] = [];
    const waiverKeys = new Set<string>();
    for (const [index, waiver] of context.waivers.entries()) {
        const key = `${waiver.kind}:${waiver.subjectId}`;
        const validSubject =
            waiver.kind === "required_review"
                ? state.objectiveContract.requiredReviewers.includes(waiver.subjectId)
                : state.agenda.some((item) => item.id === waiver.subjectId);
        if (!waiver.reason.trim() || !validSubject || waiverKeys.has(key)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "end command contains an invalid waiver",
                {
                    entityType: "meeting",
                    entityId: state.id,
                    meetingVersion: state.version
                }
            );
        }
        waiverKeys.add(key);
        const waiverFact: CompletionFact = {
            id: context.factId(index),
            kind: "waiver",
            subjectId: waiver.subjectId,
            assertedBy: context.captainBinding,
            authority: "captain",
            result: "waived",
            evidenceMessageIds: [],
            taskIds: [],
            reason: waiver.reason,
            status: "active",
            createdAt: context.now
        };
        completionFacts = [
            ...completionFacts.map((existing) =>
                existing.status === "active" &&
                existing.kind === "waiver" &&
                existing.subjectId === waiver.subjectId
                    ? { ...existing, status: "superseded" as const }
                    : existing
            ),
            waiverFact
        ];
        waiverFacts.push(waiverFact);
    }

    const prepared: MeetingState = { ...state, agenda, completionFacts };
    const dissentingPositionIds = prepared.proposals
        .filter((proposal) => proposal.status !== "superseded")
        .flatMap((proposal) =>
            proposal.positions
                .filter(({ position }) =>
                    ["object", "needs_revision", "abstain"].includes(position)
                )
                .map(({ id }) => id)
        );
    const blockingAgendaItemIds = prepared.agenda
        .filter((item) => item.status === "blocked")
        .map((item) => item.id);
    const unresolvedQuestionIds = prepared.openQuestions
        .filter((question) => question.status === "open" || question.status === "deferred")
        .map((question) => question.id);
    if (
        context.outcome === "no_consensus" &&
        dissentingPositionIds.length === 0 &&
        blockingAgendaItemIds.length === 0 &&
        unresolvedQuestionIds.length === 0
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "no-consensus outcome requires unresolved or dissenting facts",
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }

    const code = {
        completed: "objective_satisfied",
        partial: "captain_accepted",
        no_consensus: "no_consensus",
        cancelled: "user_cancelled"
    }[context.outcome] as NonNullable<MeetingState["termination"]>["code"];
    const ended = transitionMeeting(prepared, context.outcome, {
        now: context.now,
        reason: context.reason,
        termination: {
            code,
            reason: context.reason,
            decisionIds: [...context.acceptedDecisionIds],
            unresolvedQuestionIds,
            dissentingPositionIds,
            blockingAgendaItemIds,
            finalMessage: context.reason,
            endedAt: context.now
        }
    });
    const factEvents: DomainEffect["events"] = waiverFacts.map((waiverFact) => ({
        type: "completion_fact.added",
        payload: {
            meetingId: state.id,
            completionFactId: waiverFact.id,
            kind: waiverFact.kind,
            subjectId: waiverFact.subjectId,
            meetingVersion: ended.state.version
        }
    }));
    const cancelled = cancelNonTerminalMeetingTasks(ended.state, context.now);
    const events = [...factEvents, ...ended.effect.events, ...cancelled.effect.events];
    return {
        state: { ...cancelled.state, eventSeq: state.eventSeq + events.length },
        effect: { events }
    };
}
