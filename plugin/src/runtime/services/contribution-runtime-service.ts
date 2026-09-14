import type { DomainEvent, MeetingState } from "@/domain/index.js";
import type { JsonObject } from "@/runtime/meeting-runtime.js";

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
