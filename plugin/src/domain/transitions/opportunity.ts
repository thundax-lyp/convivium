import type { EvidenceOpportunityRequest, MeetingState, OpaqueId } from "@/domain/index.js";
import { rejectedTransitionV1 as rejected, type MeetingTransitionResultV1 } from "./result.js";

type RequestInput = {
    requestId: OpaqueId;
    agendaId: OpaqueId;
    contributorId: OpaqueId;
    purpose: string;
    now: number;
};
type DisposeInput = {
    requestId: OpaqueId;
    managerId: OpaqueId;
    disposition: "rejected" | "deferred";
    reason: string;
    now: number;
};

const terminalContributionStatuses = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "closed"
]);

function accepted(
    state: MeetingState,
    relatedIds: readonly OpaqueId[],
    effectRequests: MeetingTransitionResultV1 extends infer _T
        ? readonly Extract<
              MeetingTransitionResultV1,
              { kind: "accepted" }
          >["effectRequests"][number][]
        : never
): MeetingTransitionResultV1 {
    return { kind: "accepted", state, relatedIds, effectRequests };
}

function hasCommonValidInput(id: string, text: string, now: number) {
    return id.trim().length > 0 && text.trim().length > 0 && Number.isSafeInteger(now) && now >= 0;
}

function findManager(state: MeetingState, agendaId: OpaqueId) {
    return state.identities.find(
        (identity) =>
            identity.roles.includes("manager") &&
            (identity.agendaResponsibilityIds.length === 0 ||
                identity.agendaResponsibilityIds.includes(agendaId))
    );
}

export function requestEvidenceOpportunityV1(
    state: MeetingState,
    input: RequestInput
): MeetingTransitionResultV1 {
    if (
        !hasCommonValidInput(input.requestId, input.purpose, input.now) ||
        input.agendaId.trim().length === 0 ||
        input.contributorId.trim().length === 0
    )
        return rejected(state, "INVALID_ARGUMENT", "invalid opportunity request");
    if (state.lifecycle.status !== "running")
        return rejected(state, "MEETING_TERMINAL", "meeting is not running");
    const agenda = state.agenda.find((item) => item.id === input.agendaId);
    if (!agenda) return rejected(state, "NOT_FOUND", "agenda not found", input.agendaId);
    if (agenda.status !== "active") return rejected(state, "INVALID_STATE", "agenda is not active");
    const contributor = state.identities.find((identity) => identity.id === input.contributorId);
    if (!contributor || !contributor.roles.includes("contributor"))
        return rejected(
            state,
            "UNAUTHORIZED",
            "identity is not a contributor",
            input.contributorId
        );
    if (
        contributor.agendaResponsibilityIds.length > 0 &&
        !contributor.agendaResponsibilityIds.includes(input.agendaId)
    )
        return rejected(state, "UNAUTHORIZED", "contributor is not assigned to agenda");
    const manager = findManager(state, input.agendaId);
    if (!manager) return rejected(state, "PRECONDITION_FAILED", "no eligible manager");
    if (state.rounds.some((round) => round.agendaId === input.agendaId && round.status === "open"))
        return rejected(state, "PRECONDITION_FAILED", "an open round already exists");
    if (
        state.opportunityRequests.some(
            (request) =>
                request.agendaId === input.agendaId && request.contributorId === input.contributorId
        )
    )
        return rejected(state, "PRECONDITION_FAILED", "opportunity request already pending");
    if (
        state.contributions.some(
            (contribution) =>
                contribution.contributorId === input.contributorId &&
                !terminalContributionStatuses.has(contribution.status)
        )
    )
        return rejected(state, "PRECONDITION_FAILED", "contributor has an unfinished contribution");
    if (
        state.tasks.some(
            (task) =>
                task.assigneeId === input.contributorId &&
                (task.status === "open" || task.status === "claimed") &&
                (task.agendaId === undefined || task.agendaId === input.agendaId)
        )
    )
        return rejected(state, "PRECONDITION_FAILED", "contributor has an unfinished task");
    if (state.opportunityRequests.some((request) => request.id === input.requestId))
        return rejected(state, "INVALID_ARGUMENT", "request id already exists", input.requestId);
    const request: EvidenceOpportunityRequest = {
        id: input.requestId,
        agendaId: input.agendaId,
        contributorId: input.contributorId,
        purpose: input.purpose,
        requestedAt: input.now
    };
    return accepted(
        {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            opportunityRequests: [...state.opportunityRequests, request]
        },
        [input.requestId],
        [
            {
                kind: "agent_notice",
                noticeKind: "opportunity_request",
                recipientId: manager.id,
                agendaId: input.agendaId,
                requestId: input.requestId
            }
        ]
    );
}

export function disposeEvidenceOpportunityV1(
    state: MeetingState,
    input: DisposeInput
): MeetingTransitionResultV1 {
    if (!hasCommonValidInput(input.requestId, input.reason, input.now))
        return rejected(state, "INVALID_ARGUMENT", "invalid opportunity disposition");
    const request = state.opportunityRequests.find((item) => item.id === input.requestId);
    if (!request)
        return rejected(state, "NOT_FOUND", "opportunity request not found", input.requestId);
    const manager = state.identities.find((identity) => identity.id === input.managerId);
    if (!manager || !manager.roles.includes("manager"))
        return rejected(state, "UNAUTHORIZED", "identity is not a manager", input.managerId);
    if (
        manager.agendaResponsibilityIds.length > 0 &&
        !manager.agendaResponsibilityIds.includes(request.agendaId)
    )
        return rejected(state, "UNAUTHORIZED", "manager is not assigned to agenda");
    const next = state.opportunityRequests.filter((item) => item.id !== input.requestId);
    return accepted(
        { ...state, version: state.version + 1, updatedAt: input.now, opportunityRequests: next },
        [input.requestId],
        [
            {
                kind: "agent_notice",
                noticeKind: "opportunity_disposition",
                recipientId: request.contributorId,
                agendaId: request.agendaId,
                requestId: request.id,
                disposition: input.disposition,
                reason: input.reason
            }
        ]
    );
}
