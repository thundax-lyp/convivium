import type {
    ActiveMeetingStatusResultV1,
    MeetingStatusResultV1,
    MeetingTaskProjectionV1,
    PublicBlockingFactV1,
    PublicDecisionV1,
    PublicMeetingMessageV1,
    PublicTerminationV1
} from "../protocol/index.js";

export interface MeetingPanelView {
    readonly agendaTitle: string;
    readonly agendaObjective: string;
    readonly plannedSpeakerOrder: string;
    readonly currentSpeaker: string;
    readonly waitingReason: string;
    readonly waitingParticipants: string;
    readonly messages: readonly PublicMeetingMessageV1[];
    readonly blockingFacts: readonly PublicBlockingFactV1[];
    readonly meetingTasks: readonly MeetingTaskProjectionV1[];
    readonly acceptedDecisions: readonly PublicDecisionV1[];
    readonly limits: MeetingStatusResultV1["limits"];
    readonly pauseReason: string;
    readonly pausedBy: string;
    readonly pausedAt: string;
    readonly termination?: PublicTerminationV1;
}

function isActive(detail: MeetingStatusResultV1): detail is ActiveMeetingStatusResultV1 {
    return ["created", "running", "waiting", "paused", "converging"].includes(detail.status);
}

export function mapMeetingPanelView(detail: MeetingStatusResultV1): MeetingPanelView {
    const archivePackage =
        detail.status === "archiving" || detail.status === "archived"
            ? detail.archive.package
            : undefined;
    const messages = [
        ...("messages" in detail ? detail.messages : (archivePackage?.formalTranscript ?? []))
    ].sort((a, b) => a.seq - b.seq);
    const discussion = "messages" in detail ? detail : undefined;
    const active = isActive(detail) ? detail : undefined;
    const agenda = discussion?.activeAgendaItem;
    const steps = active?.currentTurn?.steps ?? [];
    const waitState = active !== undefined && "waitState" in active ? active.waitState : undefined;
    return {
        agendaTitle: agenda?.title ?? "None",
        agendaObjective: agenda?.objective ?? "None",
        plannedSpeakerOrder: steps.map((step) => step.participantId).join(" → ") || "None",
        currentSpeaker: active?.currentSpeakerId ?? "None",
        waitingReason: waitState?.reason ?? "None",
        waitingParticipants: waitState?.participantIds.join(", ") || "None",
        messages,
        blockingFacts: discussion?.blockingFacts ?? [],
        meetingTasks: detail.meetingTasks,
        acceptedDecisions: discussion?.acceptedDecisions ?? archivePackage?.acceptedDecisions ?? [],
        limits: detail.limits,
        pauseReason: active?.pauseControl.reason ?? "None",
        pausedBy:
            active?.pauseControl.pausedBy === undefined
                ? "None"
                : `${active.pauseControl.pausedBy.displayName ?? active.pauseControl.pausedBy.actorId} (${active.pauseControl.pausedBy.kind})`,
        pausedAt:
            active?.pauseControl.pausedAt === undefined
                ? "None"
                : String(active.pauseControl.pausedAt),
        termination: "termination" in detail ? detail.termination : undefined
    };
}
