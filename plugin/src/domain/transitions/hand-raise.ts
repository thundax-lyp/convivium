import type { Contribution, MeetingState, OpaqueId } from "@/domain/index.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResult } from "./result.js";

type RaiseInput = { roundId: OpaqueId; contributorId: OpaqueId; purpose: string; now: number };
type DisposeInput = {
    roundId: OpaqueId;
    contributorId: OpaqueId;
    managerId: OpaqueId;
    disposition: "accepted" | "rejected" | "deferred";
    reason: string;
    contributionId?: OpaqueId;
    now: number;
};
const terminal = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "aborted",
    "closed"
]);

function reservedFormalMessages(state: MeetingState): number {
    return state.rounds
        .filter((round) => round.status === "open")
        .reduce((total, round) => total + round.contributionIds.length, 0);
}

function managerFor(state: MeetingState, agendaId: OpaqueId) {
    return state.identities.find(
        (identity) =>
            identity.roles.includes("manager") &&
            (identity.agendaResponsibilityIds.length === 0 ||
                identity.agendaResponsibilityIds.includes(agendaId))
    );
}
function validTime(now: number) {
    return Number.isSafeInteger(now) && now >= 0;
}

export function raiseHand(state: MeetingState, input: RaiseInput): MeetingTransitionResult {
    if (
        input.roundId.trim() === "" ||
        input.contributorId.trim() === "" ||
        input.purpose.trim() === "" ||
        !validTime(input.now)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid hand request");
    if (state.lifecycle.status !== "running")
        return reject(state, "MEETING_TERMINAL", "meeting is not running");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    if (round.status !== "open") return reject(state, "INVALID_STATE", "round is not open");
    const agenda = state.agenda.find((candidate) => candidate.id === round.agendaId);
    if (!agenda) return reject(state, "INVALID_STATE", "round agenda is missing");
    const contributor = state.identities.find((candidate) => candidate.id === input.contributorId);
    if (!contributor || !contributor.roles.includes("contributor"))
        return reject(state, "UNAUTHORIZED", "identity is not a contributor");
    if (
        contributor.agendaResponsibilityIds.length > 0 &&
        !contributor.agendaResponsibilityIds.includes(round.agendaId)
    )
        return reject(state, "UNAUTHORIZED", "contributor is not assigned to agenda");
    const manager = managerFor(state, round.agendaId);
    if (!manager) return reject(state, "PRECONDITION_FAILED", "no eligible manager");
    if (
        state.pendingHandRaises.some(
            (hand) => hand.roundId === input.roundId && hand.contributorId === input.contributorId
        )
    )
        return reject(state, "PRECONDITION_FAILED", "hand is already pending");
    if (
        state.contributions.some(
            (contribution) =>
                contribution.roundId === input.roundId &&
                contribution.contributorId === input.contributorId &&
                !terminal.has(contribution.status)
        )
    )
        return reject(
            state,
            "PRECONDITION_FAILED",
            "contributor already has an unfinished contribution"
        );
    if (
        state.tasks.some(
            (task) =>
                task.assigneeId === input.contributorId &&
                (task.status === "open" || task.status === "claimed") &&
                (task.agendaId === undefined || task.agendaId === round.agendaId)
        )
    )
        return reject(state, "PRECONDITION_FAILED", "contributor has an unfinished task");
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        pendingHandRaises: [
            ...state.pendingHandRaises,
            {
                roundId: input.roundId,
                contributorId: input.contributorId,
                purpose: input.purpose,
                raisedAt: input.now
            }
        ]
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [input.roundId, input.contributorId],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "hand_request",
                requestKind: "initial",
                recipientId: manager.id,
                agendaId: round.agendaId,
                roundId: round.id,
                contributorId: input.contributorId
            }
        ]
    };
}

export function disposeHandRaise(
    state: MeetingState,
    input: DisposeInput
): MeetingTransitionResult {
    if (
        input.roundId.trim() === "" ||
        input.contributorId.trim() === "" ||
        input.managerId.trim() === "" ||
        input.reason.trim() === "" ||
        !validTime(input.now)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid hand disposition");
    const hand = state.pendingHandRaises.find(
        (candidate) =>
            candidate.roundId === input.roundId && candidate.contributorId === input.contributorId
    );
    if (!hand) return reject(state, "NOT_FOUND", "pending hand not found");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    const manager = state.identities.find((candidate) => candidate.id === input.managerId);
    if (!manager || !manager.roles.includes("manager"))
        return reject(state, "UNAUTHORIZED", "identity is not a manager");
    if (
        manager.agendaResponsibilityIds.length > 0 &&
        !manager.agendaResponsibilityIds.includes(round.agendaId)
    )
        return reject(state, "UNAUTHORIZED", "manager is not assigned to agenda");
    if (input.disposition === "accepted") {
        if (input.contributionId === undefined || input.contributionId.trim() === "")
            return reject(state, "INVALID_ARGUMENT", "accepted hand requires contribution id");
        if (state.contributions.some((candidate) => candidate.id === input.contributionId))
            return reject(state, "INVALID_ARGUMENT", "contribution id already exists");
        if (
            state.messages.length + reservedFormalMessages(state) + 1 >
            state.limits.maxFormalMessages
        )
            return reject(state, "LIMIT_EXCEEDED", "formal message budget is exhausted");
        if (
            state.privateMails.some(
                (mail) => mail.recipientId === input.contributorId && mail.status === "processing"
            )
        )
            return reject(state, "PRECONDITION_FAILED", "contributor is processing private mail");
        const contribution: Contribution = {
            id: input.contributionId,
            roundId: round.id,
            contributorId: input.contributorId,
            handRaise: { raisedAt: hand.raisedAt, purpose: hand.purpose },
            acceptedAt: input.now,
            status: "preparing",
            substantiveSupplementCount: 0
        };
        const nextRound = {
            ...round,
            contributionIds: [...round.contributionIds, contribution.id]
        };
        return {
            kind: "accepted",
            state: {
                ...state,
                version: state.version + 1,
                updatedAt: input.now,
                rounds: state.rounds.map((candidate) =>
                    candidate.id === round.id ? nextRound : candidate
                ),
                pendingHandRaises: state.pendingHandRaises.filter(
                    (candidate) => candidate !== hand
                ),
                contributions: [...state.contributions, contribution]
            },
            relatedIds: [round.id, contribution.id],
            effectRequests: [
                {
                    kind: "agent_notice",
                    noticeKind: "hand_disposition",
                    requestKind: "initial",
                    recipientId: input.contributorId,
                    agendaId: round.agendaId,
                    roundId: round.id,
                    contributorId: input.contributorId,
                    disposition: "accepted",
                    reason: input.reason,
                    contributionId: contribution.id
                }
            ]
        };
    }
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            pendingHandRaises: state.pendingHandRaises.filter((candidate) => candidate !== hand)
        },
        relatedIds: [round.id, input.contributorId],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "hand_disposition",
                requestKind: "initial",
                recipientId: input.contributorId,
                agendaId: round.agendaId,
                roundId: round.id,
                contributorId: input.contributorId,
                disposition: input.disposition,
                reason: input.reason
            }
        ]
    };
}
