import type { DomainEvent, MeetingState } from "@/domain/index.js";
import { isMeetingStateV2 } from "@/domain/index.js";
import { transitionContributionLifecycle, failContributionDelivery } from "@/domain/index.js";
import type { OutboxItem } from "@/repository/types.js";
import { RepositoryError } from "@/repository/errors.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { MeetingRepositoryRuntime } from "@/runtime/meeting-runtime.js";
import type { JsonObject } from "@/runtime/meeting-runtime.js";

export async function scanContributionTimeouts(input: {
    repository: MeetingRepositoryRuntime;
    now: number;
}): Promise<void> {
    const snapshot = await input.repository.read();
    if (!isMeetingStateV2(snapshot.state) || snapshot.state.contributions === undefined) return;
    const state = snapshot.state;
    const preview = transitionContributionLifecycle(state, "tick", input.now);
    if (preview.effect.events.length === 0) return;
    const earliest = Math.min(
        state.contributions!.managerDeadlineAt,
        ...Object.values(state.contributions!.tasks)
            .filter(
                (task) =>
                    ["preparing", "returned", "boundary_review"].includes(task.phase) ||
                    (task.phase === "published" && task.reviewStatus === "pending")
            )
            .map((task) => task.deadlineAt),
        ...(state.limits.maxDurationMs === undefined
            ? []
            : [state.createdAt + state.limits.maxDurationMs])
    );
    const requestId = `contribution-tick:${snapshot.version}:${earliest}`;
    try {
        await input.repository.execute({
            requestId,
            commandKind: "contribution:tick",
            requestHash: requestId,
            authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:timeout" },
            expectedMeetingVersion: snapshot.version,
            transition(current) {
                if (!isMeetingStateV2(current.state))
                    throw new Error("Invalid contribution snapshot");
                const result = transitionContributionLifecycle(current.state, "tick", input.now);
                return {
                    state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(result.state))),
                    result: {},
                    events: result.effect.events.map((event) => ({
                        type: event.type,
                        payload: JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.payload)))
                    })),
                    outbox: [
                        ...contributionOutbox(current.state, result.state, result.effect.events)
                    ]
                };
            }
        });
    } catch (error) {
        if (
            error instanceof RepositoryError &&
            ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(error.code)
        )
            return;
        throw error;
    }
}

export async function recoverContributionWork(input: {
    repository: MeetingRepositoryRuntime;
    now: number;
    recoveryEpoch: string;
}): Promise<void> {
    const snapshot = await input.repository.read();
    if (
        !isMeetingStateV2(snapshot.state) ||
        snapshot.state.contributions === undefined ||
        !["running", "waiting"].includes(snapshot.state.status)
    )
        return;
    const requestId = `recover-contribution:${input.recoveryEpoch}`;
    await input.repository.execute({
        requestId,
        commandKind: "contribution:recover",
        requestHash: requestId,
        authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:recovery" },
        expectedMeetingVersion: snapshot.version,
        transition(current) {
            if (!isMeetingStateV2(current.state)) throw new Error("Invalid contribution snapshot");
            const result = transitionContributionLifecycle(current.state, "recover", input.now);
            return {
                state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(result.state))),
                result: {},
                events: result.effect.events.map((event) => ({
                    type: event.type,
                    payload: JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.payload)))
                })),
                outbox: [...contributionOutbox(current.state, result.state, result.effect.events)]
            };
        }
    });
}

export async function recordContributionDeliveryFailure(input: {
    repository: MeetingRepositoryRuntime;
    item: OutboxItem;
    errorCode: string;
    now: number;
}): Promise<void> {
    const payload = input.item.payload;
    const target =
        payload.role === "contribution" &&
        typeof payload.contributionId === "string" &&
        typeof payload.generation === "number"
            ? {
                  kind: "task" as const,
                  contributionId: payload.contributionId,
                  generation: payload.generation
              }
            : payload.role === "contribution_manager" && typeof payload.noticeSeq === "number"
              ? { kind: "manager" as const, noticeSeq: payload.noticeSeq }
              : undefined;
    if (target === undefined) return;
    const snapshot = await input.repository.read();
    if (!isMeetingStateV2(snapshot.state)) return;
    const command = { ...target, reason: input.errorCode, now: input.now };
    if (failContributionDelivery(snapshot.state, command).effect.events.length === 0) return;
    const requestId = `contribution-delivery-failed:${input.item.deliveryId}`;
    try {
        await input.repository.execute({
            requestId,
            commandKind: "contribution:delivery_failed",
            requestHash: requestId,
            authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:timeout" },
            expectedMeetingVersion: snapshot.version,
            transition(current) {
                if (!isMeetingStateV2(current.state))
                    throw new Error("Invalid contribution snapshot");
                const result = failContributionDelivery(current.state, command);
                return {
                    state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(result.state))),
                    result: {},
                    events: result.effect.events.map((event) => ({
                        type: event.type,
                        payload: JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.payload)))
                    })),
                    outbox: [
                        ...contributionOutbox(current.state, result.state, result.effect.events)
                    ]
                };
            }
        });
    } catch (error) {
        if (
            error instanceof RepositoryError &&
            ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(error.code)
        )
            return;
        throw error;
    }
}

export async function interruptCancelledContributions(input: {
    repository: MeetingRepositoryRuntime;
    parent?: Agent;
    runtime: Partial<Pick<SubagentRuntime, "interrupt">>;
    events: readonly DomainEvent[];
}): Promise<void> {
    const cancellations = input.events.filter(
        (event) => event.type === "contribution.controlled" && event.payload.action === "cancel"
    );
    if (
        cancellations.length === 0 ||
        input.parent === undefined ||
        input.runtime.interrupt === undefined
    )
        return;
    // Admission was already revoked atomically; cleanup cannot turn the committed receipt into failure.
    try {
        const recovered = await input.repository.recover();
        const state = recovered.snapshot?.state;
        if (!isMeetingStateV2(state) || state.contributions === undefined) return;
        for (const event of cancellations) {
            const task = state.contributions.tasks[String(event.payload.contributionId)];
            if (task?.phase !== "cancelled" || task.generation !== event.payload.generation)
                continue;
            if (
                Object.values(state.contributions.tasks).some(
                    (other) =>
                        other.participantId === task.participantId &&
                        other.id !== task.id &&
                        !["cancelled", "published"].includes(other.phase)
                )
            )
                continue;
            const ownership = recovered.sessionOwnership.find(
                (item) =>
                    item.role === "participant" &&
                    item.participantId === task.participantId &&
                    item.parentSessionId === String(input.parent!.id) &&
                    item.capabilityStatus === "active" &&
                    item.lifecycleStatus === "active"
            );
            if (ownership !== undefined)
                input.runtime.interrupt(
                    ownership.sessionId as Parameters<
                        NonNullable<typeof input.runtime.interrupt>
                    >[0],
                    { kind: "ancestor", agent: input.parent }
                );
        }
    } catch {
        // A later delivery still fails the durable generation check if DSH interruption is unavailable.
    }
}

export function contributionOutbox(
    before: MeetingState,
    after: MeetingState,
    events: readonly DomainEvent[]
): readonly { deliveryId: string; kind: "dispatch"; payload: JsonObject }[] {
    if (after.contributions === undefined || !["running", "waiting"].includes(after.status))
        return [];
    const deliveries = new Map<
        string,
        { deliveryId: string; kind: "dispatch"; payload: JsonObject }
    >();
    for (const event of events) {
        if (event.type === "contribution.manager_notified") {
            const noticeSeq = after.contributions.managerNoticeSeq;
            const deliveryId = `${after.id}:manager:${noticeSeq}`;
            deliveries.set(deliveryId, {
                deliveryId,
                kind: "dispatch",
                payload: {
                    role: "contribution_manager",
                    noticeSeq,
                    contextThroughSeq: after.messageSeq
                }
            });
            continue;
        }
        const id = event.payload.contributionId;
        if (typeof id !== "string") continue;
        const task = after.contributions.tasks[id];
        if (task === undefined) continue;
        const eligible =
            event.type === "contribution.assigned" ||
            (event.type === "contribution.boundary_reviewed" &&
                (event.payload.decision === "approve" || event.payload.decision === "return")) ||
            (event.type === "contribution.controlled" &&
                (event.payload.action === "retry" || event.payload.action === "resume"));
        if (!eligible) continue;
        const purpose =
            task.phase === "published" && task.reviewStatus === "pending"
                ? "evidence_review"
                : task.phase === "preparing" || task.phase === "returned"
                  ? "prepare"
                  : undefined;
        if (purpose === undefined) continue;
        const draftRevision = purpose === "prepare" ? 0 : task.currentDraftRevision;
        const contextThroughSeq = purpose === "prepare" ? task.basedOnSeq : after.messageSeq;
        const previous = before.contributions?.tasks[id];
        if (previous?.generation === task.generation && event.type === "contribution.controlled")
            continue;
        const deliveryId = `${id}:${task.generation}:${purpose}:${draftRevision}:${contextThroughSeq}`;
        deliveries.set(deliveryId, {
            deliveryId,
            kind: "dispatch",
            payload: {
                role: "contribution",
                contributionId: id,
                generation: task.generation,
                purpose,
                draftRevision,
                contextThroughSeq
            }
        });
    }
    return [...deliveries.values()];
}
