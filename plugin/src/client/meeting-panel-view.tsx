import type {
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
    readonly termination?: PublicTerminationV1;
}

export function mapMeetingPanelView(detail: MeetingStatusResultV1): MeetingPanelView {
    const messages = "messages" in detail ? [...detail.messages].sort((a, b) => a.seq - b.seq) : [];
    const discussion = "messages" in detail ? detail : undefined;
    const active = "currentTurn" in detail ? detail : undefined;
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
        acceptedDecisions: discussion?.acceptedDecisions ?? [],
        termination: "termination" in detail ? detail.termination : undefined
    };
}
