import type { MeetingState, OpaqueId, RoundV1 } from "@/domain/index.js";
import { rejectedTransitionV1 as rejected, type MeetingTransitionResultV1 } from "./result.js";

type OpenRoundInput = {
    roundId: OpaqueId;
    agendaId: OpaqueId;
    planId: OpaqueId;
    managerId: OpaqueId;
    now: number;
    deadlineAt?: number;
};

const terminalContributionStatuses = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "aborted",
    "awaiting_response",
    "closed"
]);

function reservedFormalMessages(state: MeetingState): number {
    return state.rounds
        .filter((round) => round.status === "open")
        .reduce((total, round) => total + round.contributionIds.length, 0);
}

export function openRoundV1(state: MeetingState, input: OpenRoundInput): MeetingTransitionResultV1 {
    if (
        input.roundId.trim().length === 0 ||
        input.agendaId.trim().length === 0 ||
        input.planId === undefined ||
        input.planId.trim().length === 0 ||
        input.managerId.trim().length === 0 ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return rejected(state, "INVALID_ARGUMENT", "invalid round input");
    if (
        input.deadlineAt !== undefined &&
        (!Number.isSafeInteger(input.deadlineAt) || input.deadlineAt <= input.now)
    )
        return rejected(state, "PRECONDITION_FAILED", "round deadline must be after now");
    if (state.lifecycle.status !== "running")
        return rejected(state, "MEETING_TERMINAL", "meeting is not running");
    if (state.messages.length + reservedFormalMessages(state) >= state.limits.maxFormalMessages)
        return rejected(state, "LIMIT_EXCEEDED", "formal message budget is exhausted");
    const agenda = state.agenda.find((item) => item.id === input.agendaId);
    if (!agenda) return rejected(state, "NOT_FOUND", "agenda not found", input.agendaId);
    if (agenda.status !== "active") return rejected(state, "INVALID_STATE", "agenda is not active");
    const plan = state.managerPlans.find(
        (candidate) =>
            candidate.id === input.planId &&
            candidate.agendaId === input.agendaId &&
            candidate.status === "active" &&
            candidate.kind === "open_round"
    );
    if (!plan?.roundGoal)
        return rejected(state, "PRECONDITION_FAILED", "active open-round plan is required");
    const manager = state.identities.find((identity) => identity.id === input.managerId);
    if (!manager || !manager.roles.includes("manager"))
        return rejected(state, "UNAUTHORIZED", "identity is not a manager", input.managerId);
    if (
        manager.agendaResponsibilityIds.length > 0 &&
        !manager.agendaResponsibilityIds.includes(input.agendaId)
    )
        return rejected(state, "UNAUTHORIZED", "manager is not assigned to agenda");
    if (!state.rounds.every((round) => round.id !== input.roundId))
        return rejected(state, "INVALID_ARGUMENT", "round id already exists", input.roundId);
    if (state.rounds.some((round) => round.agendaId === input.agendaId && round.status === "open"))
        return rejected(state, "PRECONDITION_FAILED", "an open round already exists");
    const opportunityRequests = state.opportunityRequests.filter(
        (request) => request.agendaId === input.agendaId
    );
    const round: RoundV1 = {
        id: input.roundId,
        agendaId: input.agendaId,
        planId: input.planId,
        roundGoal: plan.roundGoal,
        publicBaselinePublicationIds: state.publications.map((publication) => publication.id),
        openedAt: input.now,
        status: "open",
        contributionIds: [],
        ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt })
    };
    const pendingHandRaises = [
        ...state.pendingHandRaises,
        ...opportunityRequests.map((request) => ({
            roundId: input.roundId,
            contributorId: request.contributorId,
            purpose: request.purpose,
            raisedAt: request.requestedAt
        }))
    ];
    const next: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        rounds: [...state.rounds, round],
        managerPlans: state.managerPlans.map((candidate) =>
            candidate.id === plan.id ? { ...candidate, status: "completed" as const } : candidate
        ),
        opportunityRequests: state.opportunityRequests.filter(
            (request) => request.agendaId !== input.agendaId
        ),
        pendingHandRaises
    };
    return { kind: "accepted", state: next, relatedIds: [input.roundId], effectRequests: [] };
}

type AbortRoundInput = {
    roundId: OpaqueId;
    actor: { kind: "local_controller" | "identity"; id: OpaqueId };
    reason: string;
    now: number;
};

export function abortRoundV1(
    state: MeetingState,
    input: AbortRoundInput
): MeetingTransitionResultV1 {
    if (
        input.roundId.trim() === "" ||
        input.actor.id.trim() === "" ||
        input.reason.trim() === "" ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return rejected(state, "INVALID_ARGUMENT", "invalid round abort input");
    if (["terminal", "archiving", "archived"].includes(state.lifecycle.status))
        return rejected(state, "MEETING_TERMINAL", "meeting is terminal");
    if (state.lifecycle.status !== "running")
        return rejected(state, "INVALID_STATE", "meeting is not running");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) return rejected(state, "NOT_FOUND", "round not found", input.roundId);
    if (round.status !== "open")
        return rejected(state, "INVALID_STATE", "round is not open", input.roundId);
    if (input.actor.kind === "identity") {
        const captain = state.identities.find((identity) => identity.id === input.actor.id);
        if (!captain?.roles.includes("captain"))
            return rejected(state, "UNAUTHORIZED", "identity is not a captain", input.actor.id);
    }
    const abortedContributionIds = round.contributionIds.filter((id) => {
        const contribution = state.contributions.find((candidate) => candidate.id === id);
        return contribution !== undefined && !terminalContributionStatuses.has(contribution.status);
    });
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            rounds: state.rounds.map((candidate) =>
                candidate.id === round.id
                    ? {
                          ...candidate,
                          status: "aborted" as const,
                          abortReason: input.reason,
                          abortedAt: input.now
                      }
                    : candidate
            ),
            pendingHandRaises: state.pendingHandRaises.filter((hand) => hand.roundId !== round.id),
            reviewClaims: state.reviewClaims.filter((claim) => claim.roundId !== round.id),
            contributions: state.contributions.map((contribution) =>
                abortedContributionIds.includes(contribution.id)
                    ? {
                          ...contribution,
                          status: "aborted" as const,
                          exitReason: input.reason
                      }
                    : contribution
            )
        },
        relatedIds: [round.id, ...abortedContributionIds],
        effectRequests: []
    };
}

export function isRoundClosableV1(state: MeetingState, roundId: OpaqueId): boolean {
    const round = state.rounds.find((candidate) => candidate.id === roundId);
    if (!round || round.status !== "open") return false;
    if (state.pendingHandRaises.some((hand) => hand.roundId === roundId)) return false;
    for (const contributionId of round.contributionIds) {
        const contribution = state.contributions.find(
            (candidate) => candidate.id === contributionId
        );
        if (!contribution || !terminalContributionStatuses.has(contribution.status)) return false;
        if (contribution.packageId === undefined) continue;
        const pkg = state.evidencePackages.find(
            (candidate) => candidate.id === contribution.packageId
        );
        if (!pkg) return false;
        const registration = state.registrations.find(
            (candidate) =>
                candidate.versionId === pkg.currentVersionId && candidate.status === "complete"
        );
        if (!registration) return false;
        const reviews = state.reviews.filter((review) => review.versionId === pkg.currentVersionId);
        const finalReview = reviews.find(
            (review) => review.reviewerId === state.evidenceReviewerId
        );
        if (!finalReview || reviews.filter((review) => review.id === finalReview.id).length !== 1)
            return false;
        if (
            !state.reviewDeliveries.some(
                (delivery) => delivery.reviewId === finalReview.id && delivery.status === "sent"
            )
        )
            return false;
    }
    return true;
}
