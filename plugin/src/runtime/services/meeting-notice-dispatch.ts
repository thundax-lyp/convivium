import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { MeetingIdentity, MeetingState } from "@/domain/index.js";
import { followupMeetingIdentitySession, type MeetingIdentitySessionLabel } from "@/dsh/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";

const supported = new Set([
    "meeting_started",
    "opportunity_request",
    "opportunity_disposition",
    "hand_request",
    "hand_disposition",
    "transcript_update"
]);

class NoticeDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean
    ) {
        super(code);
    }
}

function fail(code: string): never {
    throw new NoticeDispatchError(code, false);
}

function stringField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") fail("NOTICE_PAYLOAD_INVALID");
    return value;
}

function roleFor(identity: MeetingIdentity): MeetingIdentitySessionLabel["role"] {
    if (identity.roles.length !== 1) fail("NOTICE_IDENTITY_INVALID");
    switch (identity.roles[0]) {
        case "manager":
            return "manager";
        case "evidence_reviewer":
            return "evidence_reviewer";
        case "contributor":
            return "participant";
        default:
            return fail("NOTICE_IDENTITY_INVALID");
    }
}

function assigned(identity: MeetingIdentity, agendaId: string): boolean {
    return (
        identity.agendaResponsibilityIds.length === 0 ||
        identity.agendaResponsibilityIds.includes(agendaId)
    );
}

function assertRole(
    identity: MeetingIdentity,
    role: "manager" | "contributor",
    agendaId: string
): void {
    if (!identity.roles.includes(role) || !assigned(identity, agendaId))
        fail("NOTICE_VISIBILITY_INVALID");
}

function assertNoticeReferences(
    state: MeetingState,
    identity: MeetingIdentity,
    payload: Record<string, unknown>,
    noticeKind: string,
    agendaId: string
): Record<string, unknown> {
    const agenda = state.agenda.find((candidate) => candidate.id === agendaId);
    if (!agenda) fail("NOTICE_VISIBILITY_INVALID");
    switch (noticeKind) {
        case "meeting_started":
            if (state.lifecycle.status !== "running" || agenda.status !== "active")
                fail("NOTICE_VISIBILITY_INVALID");
            return {};
        case "opportunity_request": {
            assertRole(identity, "manager", agendaId);
            const requestId = stringField(payload, "requestId");
            if (
                !state.opportunityRequests.some(
                    (request) => request.id === requestId && request.agendaId === agendaId
                )
            )
                fail("NOTICE_VISIBILITY_INVALID");
            return { requestId };
        }
        case "opportunity_disposition": {
            assertRole(identity, "contributor", agendaId);
            const requestId = stringField(payload, "requestId");
            const disposition = stringField(payload, "disposition");
            const reason = stringField(payload, "reason");
            if (disposition !== "rejected" && disposition !== "deferred")
                fail("NOTICE_PAYLOAD_INVALID");
            return { requestId, disposition, reason };
        }
        case "hand_request": {
            assertRole(identity, "manager", agendaId);
            const requestKind = stringField(payload, "requestKind");
            if (requestKind === "initial") {
                const roundId = stringField(payload, "roundId");
                const contributorId = stringField(payload, "contributorId");
                if (
                    !state.rounds.some(
                        (round) => round.id === roundId && round.agendaId === agendaId
                    ) ||
                    !state.pendingHandRaises.some(
                        (hand) => hand.roundId === roundId && hand.contributorId === contributorId
                    )
                )
                    fail("NOTICE_VISIBILITY_INVALID");
                return { requestKind, roundId, contributorId };
            }
            if (requestKind === "supplement") {
                const contributionId = stringField(payload, "contributionId");
                const contribution = state.contributions.find(
                    (candidate) => candidate.id === contributionId
                );
                const round = state.rounds.find(
                    (candidate) => candidate.id === contribution?.roundId
                );
                if (
                    contribution?.supplementHand?.status !== "pending" ||
                    round?.agendaId !== agendaId
                )
                    fail("NOTICE_VISIBILITY_INVALID");
                return { requestKind, contributionId };
            }
            return fail("NOTICE_PAYLOAD_INVALID");
        }
        case "hand_disposition": {
            assertRole(identity, "contributor", agendaId);
            const requestKind = stringField(payload, "requestKind");
            const disposition = stringField(payload, "disposition");
            const reason = stringField(payload, "reason");
            if (!new Set(["accepted", "rejected", "deferred"]).has(disposition))
                fail("NOTICE_PAYLOAD_INVALID");
            if (requestKind === "initial") {
                const roundId = stringField(payload, "roundId");
                const contributorId = stringField(payload, "contributorId");
                if (
                    contributorId !== identity.id ||
                    !state.rounds.some(
                        (round) => round.id === roundId && round.agendaId === agendaId
                    )
                )
                    fail("NOTICE_VISIBILITY_INVALID");
                if (disposition === "accepted") {
                    const contributionId = stringField(payload, "contributionId");
                    if (
                        !state.contributions.some(
                            (candidate) =>
                                candidate.id === contributionId &&
                                candidate.roundId === roundId &&
                                candidate.contributorId === contributorId
                        )
                    )
                        fail("NOTICE_VISIBILITY_INVALID");
                    return {
                        requestKind,
                        roundId,
                        contributorId,
                        disposition,
                        reason,
                        contributionId
                    };
                }
                return { requestKind, roundId, contributorId, disposition, reason };
            }
            if (requestKind === "supplement") {
                const contributionId = stringField(payload, "contributionId");
                const contribution = state.contributions.find(
                    (candidate) => candidate.id === contributionId
                );
                const round = state.rounds.find(
                    (candidate) => candidate.id === contribution?.roundId
                );
                if (contribution?.contributorId !== identity.id || round?.agendaId !== agendaId)
                    fail("NOTICE_VISIBILITY_INVALID");
                return { requestKind, contributionId, disposition, reason };
            }
            return fail("NOTICE_PAYLOAD_INVALID");
        }
        case "transcript_update": {
            const publicMessageId = stringField(payload, "publicMessageId");
            if (
                !state.messages.some(
                    (message) => message.id === publicMessageId && message.agendaId === agendaId
                )
            )
                fail("NOTICE_VISIBILITY_INVALID");
            return { publicMessageId };
        }
        default:
            return fail("OUTBOX_ROUTE_UNAVAILABLE");
    }
}

function findOwnership(
    ownerships: readonly SessionOwnership[],
    identity: MeetingIdentity,
    meetingId: string,
    expectedRole: SessionOwnership["role"]
): SessionOwnership {
    const matches = ownerships.filter(
        (candidate) =>
            candidate.id === identity.sessionOwnershipId &&
            candidate.meetingId === meetingId &&
            candidate.identityId === identity.id &&
            candidate.role === expectedRole &&
            candidate.lifecycleStatus === "active" &&
            candidate.capabilityStatus === "active"
    );
    if (matches.length !== 1) fail("NOTICE_OWNERSHIP_INVALID");
    return matches[0]!;
}

export interface MeetingNoticeDispatcherDependencies {
    readonly sessions: Pick<SubagentRuntime, "sendMessage">;
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">;
}

export function createMeetingNoticeDispatcher(dependencies: MeetingNoticeDispatcherDependencies): {
    dispatch(input: { outboxItem: OutboxItem; parent: Agent; signal: AbortSignal }): Promise<void>;
} {
    return {
        async dispatch({ outboxItem, parent, signal }) {
            const payload = outboxItem.payload as Record<string, unknown>;
            if (outboxItem.kind !== "dispatch" || payload.kind !== "agent_notice")
                fail("OUTBOX_ROUTE_UNAVAILABLE");
            const noticeKind = stringField(payload, "noticeKind");
            if (!supported.has(noticeKind)) fail("OUTBOX_ROUTE_UNAVAILABLE");
            const recovered = await dependencies.repository.recover();
            const snapshot = recovered.snapshot;
            if (!snapshot) throw new NoticeDispatchError("NOTICE_STATE_UNAVAILABLE", true);
            const recipientId = stringField(payload, "recipientId");
            const agendaId = stringField(payload, "agendaId");
            const identity = snapshot.state.identities.find(
                (candidate) => candidate.id === recipientId
            );
            if (!identity) fail("NOTICE_VISIBILITY_INVALID");
            const ownership = findOwnership(
                recovered.sessionOwnership,
                identity,
                snapshot.meetingId,
                roleFor(identity)
            );
            if (ownership.parentSessionId !== String(parent.id)) fail("NOTICE_OWNERSHIP_INVALID");
            const details = assertNoticeReferences(
                snapshot.state,
                identity,
                payload,
                noticeKind,
                agendaId
            );
            const prompt = [
                {
                    type: "text" as const,
                    text: JSON.stringify({
                        effectId: outboxItem.id,
                        meetingId: snapshot.meetingId,
                        noticeKind,
                        agendaId,
                        ...details
                    })
                }
            ];
            await followupMeetingIdentitySession({
                runtime: dependencies.sessions,
                parent,
                ownership,
                meetingId: snapshot.meetingId,
                identityId: identity.id,
                prompt,
                signal
            });
        }
    };
}
