import { isRoundClosable, type MeetingIdentity, type MeetingState } from "@/domain/index.ts";
import type { MeetingAgentDefinition } from "@/role-composition/index.ts";
import { type MeetingAgentOwner, type MeetingIdentitySessionLabel } from "@/dsh/index.ts";
import type { MeetingRepositoryPort } from "@/repository/index.ts";
import type { OutboxItem, SessionOwnership } from "@/repository/index.ts";
import {
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "@/runtime/application-service/index.ts";

const supported = new Set([
    "meeting_started",
    "agenda_stopped",
    "round_opened",
    "opportunity_request",
    "opportunity_disposition",
    "hand_request",
    "hand_disposition",
    "round_ready",
    "transcript_update"
]);

class NoticeDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
        readonly terminalOnAttemptLimit = !retryable
    ) {
        super(code);
    }
}

const fail: (code: string) => never = (code) => {
    throw new NoticeDispatchError(code, false);
};

const stringField = (payload: Record<string, unknown>, key: string): string => {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") {
        fail("NOTICE_PAYLOAD_INVALID");
    }
    return value;
};

const roleFor = (identity: MeetingIdentity): MeetingIdentitySessionLabel["role"] => {
    if (identity.roles.length !== 1) {
        fail("NOTICE_IDENTITY_INVALID");
    }
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
};

const assigned = (identity: MeetingIdentity, agendaId: string): boolean => {
    return (
        identity.agendaResponsibilityIds.length === 0 ||
        identity.agendaResponsibilityIds.includes(agendaId)
    );
};

const assertRole = (
    identity: MeetingIdentity,
    role: "manager" | "contributor",
    agendaId: string
): void => {
    if (!identity.roles.includes(role) || !assigned(identity, agendaId)) {
        fail("NOTICE_VISIBILITY_INVALID");
    }
};

const roundOpenedDetails = (
    state: MeetingState,
    identity: MeetingIdentity,
    payload: Record<string, unknown>,
    agendaId: string
): { roundId: string } => {
    assertRole(identity, "contributor", agendaId);
    const roundId = stringField(payload, "roundId");
    const round = state.rounds.find((candidate) => candidate.id === roundId);
    if (round?.agendaId !== agendaId || round.status !== "open") {
        fail("NOTICE_VISIBILITY_INVALID");
    }
    return { roundId };
};

const agendaStoppedDetails = (
    state: MeetingState,
    identity: MeetingIdentity,
    payload: Record<string, unknown>,
    agendaId: string
): { planId: string } => {
    assertRole(identity, "manager", agendaId);
    const planId = stringField(payload, "planId");
    if (
        !state.managerPlans.some(
            (plan) =>
                plan.id === planId &&
                plan.agendaId === agendaId &&
                plan.managerId === identity.id &&
                plan.kind === "stop_agenda" &&
                plan.status === "active"
        )
    ) {
        fail("NOTICE_VISIBILITY_INVALID");
    }
    return { planId };
};

const assertNoticeReferences = (
    state: MeetingState,
    identity: MeetingIdentity,
    payload: Record<string, unknown>,
    noticeKind: string,
    agendaId: string
): Record<string, unknown> => {
    const agenda = state.agenda.find((candidate) => candidate.id === agendaId);
    if (!agenda) {
        fail("NOTICE_VISIBILITY_INVALID");
    }
    switch (noticeKind) {
        case "meeting_started":
            if (state.lifecycle.status !== "running" || agenda.status !== "active") {
                fail("NOTICE_VISIBILITY_INVALID");
            }
            return {};
        case "agenda_stopped":
            return agendaStoppedDetails(state, identity, payload, agendaId);
        case "round_opened":
            return roundOpenedDetails(state, identity, payload, agendaId);
        case "opportunity_request": {
            assertRole(identity, "manager", agendaId);
            const requestId = stringField(payload, "requestId");
            if (
                !state.opportunityRequests.some(
                    (request) => request.id === requestId && request.agendaId === agendaId
                )
            ) {
                fail("NOTICE_VISIBILITY_INVALID");
            }
            return { requestId };
        }
        case "opportunity_disposition": {
            assertRole(identity, "contributor", agendaId);
            const requestId = stringField(payload, "requestId");
            const disposition = stringField(payload, "disposition");
            const reason = stringField(payload, "reason");
            if (disposition !== "rejected" && disposition !== "deferred") {
                fail("NOTICE_PAYLOAD_INVALID");
            }
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
                ) {
                    fail("NOTICE_VISIBILITY_INVALID");
                }
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
                ) {
                    fail("NOTICE_VISIBILITY_INVALID");
                }
                return { requestKind, contributionId };
            }
            return fail("NOTICE_PAYLOAD_INVALID");
        }
        case "hand_disposition": {
            assertRole(identity, "contributor", agendaId);
            const requestKind = stringField(payload, "requestKind");
            const disposition = stringField(payload, "disposition");
            const reason = stringField(payload, "reason");
            if (!new Set(["accepted", "rejected", "deferred"]).has(disposition)) {
                fail("NOTICE_PAYLOAD_INVALID");
            }
            if (requestKind === "initial") {
                const roundId = stringField(payload, "roundId");
                const contributorId = stringField(payload, "contributorId");
                if (
                    contributorId !== identity.id ||
                    !state.rounds.some(
                        (round) => round.id === roundId && round.agendaId === agendaId
                    )
                ) {
                    fail("NOTICE_VISIBILITY_INVALID");
                }
                if (disposition === "accepted") {
                    const contributionId = stringField(payload, "contributionId");
                    if (
                        !state.contributions.some(
                            (candidate) =>
                                candidate.id === contributionId &&
                                candidate.roundId === roundId &&
                                candidate.contributorId === contributorId
                        )
                    ) {
                        fail("NOTICE_VISIBILITY_INVALID");
                    }
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
                if (contribution?.contributorId !== identity.id || round?.agendaId !== agendaId) {
                    fail("NOTICE_VISIBILITY_INVALID");
                }
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
            ) {
                fail("NOTICE_VISIBILITY_INVALID");
            }
            return { publicMessageId };
        }
        case "round_ready": {
            assertRole(identity, "manager", agendaId);
            const roundId = stringField(payload, "roundId");
            const round = state.rounds.find((candidate) => candidate.id === roundId);
            if (round?.agendaId !== agendaId || !isRoundClosable(state, roundId)) {
                fail("NOTICE_VISIBILITY_INVALID");
            }
            return { roundId };
        }
        default:
            return fail("OUTBOX_ROUTE_UNAVAILABLE");
    }
};

const findOwnership = (
    ownerships: readonly SessionOwnership[],
    identity: MeetingIdentity,
    meetingId: string,
    expectedRole: SessionOwnership["role"]
): SessionOwnership => {
    const matches = ownerships.filter(
        (candidate) =>
            candidate.id === identity.sessionOwnershipId &&
            candidate.meetingId === meetingId &&
            candidate.identityId === identity.id &&
            candidate.role === expectedRole &&
            candidate.lifecycleStatus === "active" &&
            candidate.capabilityStatus === "active"
    );
    if (matches.length !== 1) {
        fail("NOTICE_OWNERSHIP_INVALID");
    }
    return matches[0]!;
};

export interface MeetingNoticeDispatcherDependencies {
    readonly owner: MeetingAgentOwner;
    readonly definitions: readonly MeetingAgentDefinition[];
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">;
    readonly application: MeetingCommandApplication;
}
export const createMeetingNoticeDispatcher = (
    dependencies: MeetingNoticeDispatcherDependencies
): {
    dispatch(input: { outboxItem: OutboxItem; signal: AbortSignal }): Promise<void>;
} => ({
    async dispatch({ outboxItem, signal }) {
        const payload = outboxItem.payload as Record<string, unknown>;
        if (outboxItem.kind !== "dispatch" || payload.kind !== "agent_notice") {
            fail("OUTBOX_ROUTE_UNAVAILABLE");
        }
        const noticeKind = stringField(payload, "noticeKind");
        if (!supported.has(noticeKind)) {
            fail("OUTBOX_ROUTE_UNAVAILABLE");
        }
        const recipientId = stringField(payload, "recipientId");
        const agendaId = stringField(payload, "agendaId");
        const resolve = async () => {
            signal.throwIfAborted();
            const recovered = await dependencies.repository.recover();
            const snapshot = recovered.snapshot;
            if (!snapshot) {
                throw new NoticeDispatchError("NOTICE_STATE_UNAVAILABLE", true);
            }
            if (["terminal", "archiving", "archived"].includes(snapshot.state.lifecycle.status)) {
                fail("INVALID_STATE");
            }
            if (snapshot.state.lifecycle.status !== "running") {
                throw new NoticeDispatchError("INVALID_STATE", true);
            }
            const identity = snapshot.state.identities.find((i) => i.id === recipientId);
            if (!identity) {
                fail("NOTICE_VISIBILITY_INVALID");
            }
            const ownership = findOwnership(
                recovered.sessionOwnership,
                identity,
                snapshot.meetingId,
                roleFor(identity)
            );
            const details = assertNoticeReferences(
                snapshot.state,
                identity,
                payload,
                noticeKind,
                agendaId
            );
            const contributionFailureRecorded =
                noticeKind === "hand_disposition" &&
                typeof payload.contributionId === "string" &&
                snapshot.state.contributions.some(
                    (contribution) =>
                        contribution.id === payload.contributionId &&
                        contribution.failure?.sourceEffectId === outboxItem.id
                );
            return {
                ownership,
                details,
                meetingId: snapshot.meetingId,
                contributionFailureRecorded
            };
        };
        const initial = await resolve();
        if (initial.contributionFailureRecorded) {
            return;
        }
        const definition = dependencies.definitions.find(
            (d) => d.agentDefinitionId === initial.ownership.definition.agentDefinitionId
        );
        if (!definition) {
            throw new NoticeDispatchError("RECOVERY_UNAVAILABLE", true);
        }
        const authorize = async () => {
            const current = await resolve();
            if (
                current.meetingId !== initial.meetingId ||
                current.ownership.id !== initial.ownership.id ||
                current.ownership.sessionId !== initial.ownership.sessionId
            ) {
                fail("NOTICE_OWNERSHIP_INVALID");
            }
        };
        await dependencies.owner.resume({
            ownership: initial.ownership,
            definition,
            purpose: "delivery",
            signal
        });
        const deliveryInput = {
            ownership: initial.ownership,
            deliveryId: outboxItem.deliveryId,
            text: JSON.stringify({
                effectId: outboxItem.id,
                meetingId: initial.meetingId,
                noticeKind,
                agendaId,
                ...initial.details
            }),
            authorize,
            signal
        };
        const observesContribution =
            noticeKind === "hand_disposition" &&
            payload.disposition === "accepted" &&
            typeof payload.contributionId === "string";
        const delivery = observesContribution
            ? await dependencies.owner.deliverObserved(deliveryInput)
            : {
                  durable: await dependencies.owner.deliver(deliveryInput),
                  outcome: "completed" as const
              };
        if (!delivery.durable) {
            throw new NoticeDispatchError("SESSION_FLUSH_FAILED", true);
        }
        if (delivery.outcome === "failed" && typeof payload.contributionId === "string") {
            const latest = await dependencies.repository.recover();
            if (!latest.snapshot) {
                throw new NoticeDispatchError("NOTICE_STATE_UNAVAILABLE", true);
            }
            const recorded = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: latest.snapshot.meetingId,
                    expectedMeetingVersion: latest.snapshot.version,
                    requestId: `contribution-failure:${outboxItem.id}`,
                    action: {
                        kind: "record_contribution_failure",
                        contributionId: payload.contributionId,
                        sourceEffectId: outboxItem.id,
                        stage: "contribution_turn",
                        failureCode: delivery.failureCode ?? "AGENT_TURN_FAILED",
                        failureSummary: delivery.failureSummary ?? "Contributor turn failed",
                        attemptCount: 1,
                        retryable: false
                    }
                },
                {
                    caller: {
                        channel: "runtime_recovery",
                        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
                    }
                },
                signal
            );
            if (recorded.kind === "rejected") {
                throw new NoticeDispatchError(recorded.error.code, true);
            }
        }
    }
});
