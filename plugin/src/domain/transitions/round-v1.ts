import type { MeetingState, OpaqueId, RoundV1 } from "@/domain/index.js";
import type { MeetingTransitionResultV1 } from "./result-v1.js";

type OpenRoundInput = {
    roundId: OpaqueId;
    agendaId: OpaqueId;
    managerId: OpaqueId;
    now: number;
    deadlineAt?: number;
};

const terminalContributionStatuses = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "closed"
]);

function rejected(
    state: MeetingState,
    code: Extract<MeetingTransitionResultV1, { kind: "rejected" }>["error"]["code"],
    message: string,
    targetId?: OpaqueId
): MeetingTransitionResultV1 {
    return {
        kind: "rejected",
        state,
        relatedIds: [],
        effectRequests: [],
        error: { code, message, ...(targetId === undefined ? {} : { targetId }) }
    };
}

export function openRoundV1(state: MeetingState, input: OpenRoundInput): MeetingTransitionResultV1 {
    if (
        input.roundId.trim().length === 0 ||
        input.agendaId.trim().length === 0 ||
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
    const agenda = state.agenda.find((item) => item.id === input.agendaId);
    if (!agenda) return rejected(state, "NOT_FOUND", "agenda not found", input.agendaId);
    if (agenda.status !== "active") return rejected(state, "INVALID_STATE", "agenda is not active");
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
        opportunityRequests: state.opportunityRequests.filter(
            (request) => request.agendaId !== input.agendaId
        ),
        pendingHandRaises
    };
    return { kind: "accepted", state: next, relatedIds: [input.roundId], effectRequests: [] };
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
        const reviewerIds =
            state.agenda.find((agenda) => agenda.id === round.agendaId)?.requiredReviewerIds ?? [];
        const finalReview = reviews.find((review) => reviewerIds.includes(review.reviewerId));
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
