import type {
    ActiveMeetingStatusResultV1,
    MeetingStatusResultV1,
    MeetingTaskProjectionV1,
    PublicBlockingFactV1,
    PublicDecisionV1,
    PublicDecisionCandidateV1,
    PublicArchiveAgendaCandidateV1,
    PublicArchiveIssueV1,
    PublicMeetingMessageV1,
    PublicProposalV1,
    PublicHandRaiseV1,
    PublicTerminationV1
} from "@/protocol/index.js";

export interface MeetingPanelView {
    readonly proposals: readonly PublicProposalV1[];
    readonly pendingHandRaises: readonly PublicHandRaiseV1[];
    readonly convergence?: {
        stallCount: number;
        maxStalls: number;
        replanCount: number;
        maxReplans: number;
    };
    readonly selectionReason: string;
    readonly agendaTitle: string;
    readonly agendaObjective: string;
    readonly plannedSpeakerOrder: string;
    readonly currentSpeaker: string;
    readonly waitingReason: string;
    readonly waitingParticipants: string;
    readonly turnIntent: string;
    readonly turnReason: string;
    readonly turnObjective: string;
    readonly messages: readonly PublicMeetingMessageV1[];
    readonly blockingFacts: readonly PublicBlockingFactV1[];
    readonly meetingTasks: readonly MeetingTaskProjectionV1[];
    readonly acceptedDecisions: readonly PublicDecisionV1[];
    readonly decisionHistory: readonly PublicDecisionV1[];
    readonly parkingLot: readonly PublicArchiveAgendaCandidateV1[];
    readonly pendingDecisionCandidates: readonly PublicDecisionCandidateV1[];
    readonly risks: readonly PublicArchiveIssueV1[];
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
        proposals: discussion?.proposals ?? archivePackage?.proposals ?? [],
        pendingHandRaises: active?.pendingHandRaises ?? [],
        convergence:
            active === undefined
                ? undefined
                : {
                      stallCount: active.stallCount,
                      maxStalls: active.maxStalls,
                      replanCount: active.replanCount,
                      maxReplans: active.maxReplans
                  },
        selectionReason:
            steps.find((step) => step.participantId === active?.currentSpeakerId)?.reason ?? "None",
        agendaTitle: agenda?.title ?? "None",
        agendaObjective: agenda?.objective ?? "None",
        plannedSpeakerOrder: steps.map((step) => step.participantId).join(" → ") || "None",
        currentSpeaker: active?.currentSpeakerId ?? "None",
        waitingReason: waitState?.reason ?? "None",
        waitingParticipants: waitState?.participantIds.join(", ") || "None",
        turnIntent: active?.currentTurn?.intent ?? "None",
        turnReason: active?.currentTurn?.reason ?? "None",
        turnObjective: active?.currentTurn?.objective ?? "None",
        messages,
        blockingFacts: discussion?.blockingFacts ?? [],
        meetingTasks: detail.meetingTasks,
        acceptedDecisions: discussion?.acceptedDecisions ?? archivePackage?.acceptedDecisions ?? [],
        decisionHistory: discussion?.decisionHistory ?? archivePackage?.decisionHistory ?? [],
        parkingLot: discussion?.parkingLot ?? archivePackage?.parkingLot ?? [],
        pendingDecisionCandidates: discussion?.pendingDecisionCandidates ?? [],
        risks: discussion?.risks ?? archivePackage?.issues ?? [],
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
