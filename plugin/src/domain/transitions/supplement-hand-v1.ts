import type { MeetingState, OpaqueId, SupplementHandV1 } from "../meeting-state-v1.js";
import type { MeetingTransitionResultV1 } from "./result-v1.js";

type RaiseInput = { contributionId: OpaqueId; authorId: OpaqueId; purpose: string; now: number };
type DisposeInput = {
    contributionId: OpaqueId;
    managerId: OpaqueId;
    disposition: "accepted" | "rejected" | "deferred";
    reason: string;
    now: number;
};
const terminal = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "closed"
]);
function reject(
    state: MeetingState,
    code: Extract<MeetingTransitionResultV1, { kind: "rejected" }>["error"]["code"],
    message: string
): MeetingTransitionResultV1 {
    return {
        kind: "rejected",
        state,
        relatedIds: [],
        effectRequests: [],
        error: { code, message }
    };
}
function managerFor(state: MeetingState, agendaId: OpaqueId) {
    return state.identities.find(
        (identity) =>
            identity.roles.includes("manager") &&
            (identity.agendaResponsibilityIds.length === 0 ||
                identity.agendaResponsibilityIds.includes(agendaId))
    );
}

export function raiseSupplementHandV1(
    state: MeetingState,
    input: RaiseInput
): MeetingTransitionResultV1 {
    if (
        input.contributionId.trim() === "" ||
        input.authorId.trim() === "" ||
        input.purpose.trim() === "" ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid supplement request");
    if (state.lifecycle.status !== "running")
        return reject(state, "MEETING_TERMINAL", "meeting is not running");
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) return reject(state, "NOT_FOUND", "contribution not found");
    if (contribution.contributorId !== input.authorId)
        return reject(state, "UNAUTHORIZED", "identity is not contribution author");
    if (terminal.has(contribution.status))
        return reject(state, "INVALID_STATE", "contribution is terminal");
    const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
    if (!round || round.status !== "open")
        return reject(state, "INVALID_STATE", "round is not open");
    if (contribution.supplementHand !== undefined)
        return reject(state, "PRECONDITION_FAILED", "supplement hand already exists");
    const packageValue =
        contribution.packageId === undefined
            ? undefined
            : state.evidencePackages.find((candidate) => candidate.id === contribution.packageId);
    const deadlines = [
        contribution.acceptedAt + state.limits.taskDeadlineMs,
        ...(round.deadlineAt === undefined ? [] : [round.deadlineAt]),
        ...state.tasks
            .filter(
                (task) =>
                    task.assigneeId === input.authorId &&
                    task.agendaId === round.agendaId &&
                    (task.status === "open" || task.status === "claimed") &&
                    task.deadlineAt !== undefined
            )
            .map((task) => task.deadlineAt!)
    ];
    if (packageValue !== undefined) {
        const currentReview = state.reviews.find(
            (review) => review.versionId === packageValue.currentVersionId
        );
        const sent =
            currentReview === undefined
                ? undefined
                : state.reviewDeliveries.find(
                      (delivery) =>
                          delivery.reviewId === currentReview.id && delivery.status === "sent"
                  );
        if (sent !== undefined) deadlines.push(sent.sentAt! + 60000);
        const version = packageValue.versions.find(
            (candidate) => candidate.id === packageValue.currentVersionId
        );
        if (version !== undefined)
            deadlines.push(version.submittedAt + state.limits.taskDeadlineMs);
    }
    if (deadlines.some((deadline) => input.now >= deadline))
        return reject(state, "PRECONDITION_FAILED", "supplement deadline has passed");
    if (!managerFor(state, round.agendaId))
        return reject(state, "PRECONDITION_FAILED", "no eligible manager");
    const hand: SupplementHandV1 = {
        purpose: input.purpose,
        raisedAt: input.now,
        status: "pending"
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id
                ? { ...candidate, supplementHand: hand, response: input.purpose }
                : candidate
        )
    };
    const manager = managerFor(state, round.agendaId)!;
    return {
        kind: "accepted",
        state: next,
        relatedIds: [contribution.id],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "hand_request",
                requestKind: "supplement",
                recipientId: manager.id,
                agendaId: round.agendaId,
                contributionId: contribution.id
            }
        ]
    };
}

export function disposeSupplementHandV1(
    state: MeetingState,
    input: DisposeInput
): MeetingTransitionResultV1 {
    if (
        input.contributionId.trim() === "" ||
        input.managerId.trim() === "" ||
        input.reason.trim() === "" ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid supplement disposition");
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) return reject(state, "NOT_FOUND", "contribution not found");
    if (contribution.supplementHand?.status !== "pending")
        return reject(state, "NOT_FOUND", "pending supplement hand not found");
    const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    const manager = state.identities.find((candidate) => candidate.id === input.managerId);
    if (!manager || !manager.roles.includes("manager"))
        return reject(state, "UNAUTHORIZED", "identity is not a manager");
    if (
        manager.agendaResponsibilityIds.length > 0 &&
        !manager.agendaResponsibilityIds.includes(round.agendaId)
    )
        return reject(state, "UNAUTHORIZED", "manager is not assigned to agenda");
    const packageValue =
        contribution.packageId === undefined
            ? undefined
            : state.evidencePackages.find((candidate) => candidate.id === contribution.packageId);
    const count = contribution.substantiveSupplementCount;
    if (count >= 2 && input.disposition === "accepted")
        return reject(state, "LIMIT_EXCEEDED", "supplement limit reached");
    if (contribution.status === "under_review" && input.disposition === "accepted")
        return reject(state, "INVALID_STATE", "reviewed contribution can only be deferred");
    const nextStatus =
        input.disposition === "rejected" || count >= 2
            ? "supplement_rejected"
            : contribution.status;
    const hand =
        input.disposition === "accepted"
            ? { ...contribution.supplementHand, status: "accepted" as const, acceptedAt: input.now }
            : undefined;
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id
                ? {
                      ...candidate,
                      status: nextStatus,
                      ...(hand === undefined
                          ? { supplementHand: undefined }
                          : { supplementHand: hand }),
                      ...(nextStatus === "supplement_rejected" ? { exitReason: input.reason } : {})
                  }
                : candidate
        )
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [contribution.id],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "hand_disposition",
                requestKind: "supplement",
                recipientId: contribution.contributorId,
                agendaId: round.agendaId,
                contributionId: contribution.id,
                disposition: input.disposition,
                reason: input.reason
            }
        ]
    };
}
