import type {
    ContributionCommandV1,
    ContributionResultV1,
    ReadContributionInputV1,
    ReadContributionResultV1,
    CaptainAttendanceDispositionInputV1,
    CaptainAttendanceDispositionResultV1,
    CreateMeetingInputV1,
    CreateMeetingResultV1,
    MeetingStatusInputV1,
    MeetingStatusResultV1,
    EndMeetingInputV1,
    EndMeetingResultV1,
    MeetingTaskRequestV1,
    MeetingTaskStatusInputV1,
    MeetingTaskStartInputV1,
    MeetingTaskFinishInputV1,
    MeetingTaskResultV1,
    MeetingTaskStatusResultV1,
    MeetingTaskStartResultV1,
    MeetingTaskFinishResultV1,
    HandRaiseSubmissionV1,
    HandRaiseResultV1,
    ManagerPlanResultV1,
    ManagerPlanSubmissionV1,
    MeetingControlResultV1,
    TurnSubmissionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    PauseMeetingInputV1,
    ResumeMeetingInputV1,
    ReassignTurnInputV1,
    ReassignTurnResultV1,
    CaptainRiskDispositionInputV1,
    CaptainRiskDispositionResultV1,
    FinishMeetingMailInputV1,
    MeetingMailResultV1,
    SendMeetingMessageInputV1,
    TurnSubmissionV1,
    CaptainDecisionAcceptanceInputV1,
    CaptainDecisionAcceptanceResultV1,
    CaptainDecisionDispositionInputV1,
    CaptainDecisionDispositionResultV1,
    CaptainAgendaCandidateDispositionInputV1,
    CaptainAgendaCandidateDispositionResultV1
} from "@/protocol/index.js";
import type { Agent } from "@deepseek-ai/dsh-agent";

export interface MeetingToolCaller {
    readonly sessionId: string;
    readonly agent?: Agent;
    readonly kind: "captain" | "manager" | "participant";
    readonly meetingId?: string;
    readonly participantId?: string;
}

export interface MeetingToolRuntime {
    applyContribution(
        input: ContributionCommandV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ContributionResultV1> | ProtocolErrorV1>;
    readContribution(
        input: ReadContributionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ReadContributionResultV1> | ProtocolErrorV1>;
    disposeAttendanceRecommendation(
        input: CaptainAttendanceDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainAttendanceDispositionResultV1> | ProtocolErrorV1>;
    acceptDecision(
        input: CaptainDecisionAcceptanceInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>;
    disposeDecision(
        input: CaptainDecisionDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1>;
    disposeAgendaCandidate(
        input: CaptainAgendaCandidateDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainAgendaCandidateDispositionResultV1> | ProtocolErrorV1>;
    sendMeetingMessage(
        input: SendMeetingMessageInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
    finishMeetingMail(
        input: FinishMeetingMailInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
    createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CreateMeetingResultV1> | ProtocolErrorV1>;
    getStatus(
        input: MeetingStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
    createMeetingTask(
        input: MeetingTaskRequestV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskResultV1> | ProtocolErrorV1>;
    meetingTaskStatus(
        input: MeetingTaskStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskStatusResultV1> | ProtocolErrorV1>;
    startMeetingTask(
        input: MeetingTaskStartInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskStartResultV1> | ProtocolErrorV1>;
    finishMeetingTask(
        input: MeetingTaskFinishInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskFinishResultV1> | ProtocolErrorV1>;
    raiseHand(
        input: HandRaiseSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<HandRaiseResultV1> | ProtocolErrorV1>;
    submitTurn(
        input: TurnSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<TurnSubmissionResultV1> | ProtocolErrorV1>;
    submitManagerPlan(
        input: ManagerPlanSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ManagerPlanResultV1> | ProtocolErrorV1>;
    pause(
        input: PauseMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    resume(
        input: ResumeMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    reassignTurn(
        input: ReassignTurnInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1> | ProtocolErrorV1>;
    disposeRisk(
        input: CaptainRiskDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1>;
    endMeeting(
        input: EndMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1> | ProtocolErrorV1>;
}
