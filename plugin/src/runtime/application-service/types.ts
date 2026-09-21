import type {
    CaptainAttendanceDispositionInput,
    CaptainAttendanceDispositionResult,
    CreateMeetingInput,
    CreateMeetingResult,
    EndMeetingInput,
    EndMeetingResult,
    MeetingTaskRequestV1,
    MeetingTaskStatusInputV1,
    MeetingTaskStartInputV1,
    MeetingTaskFinishInputV1,
    MeetingTaskResultV1,
    MeetingTaskStatusResultV1,
    MeetingTaskStartResultV1,
    MeetingTaskFinishResultV1,
    HandRaiseSubmission,
    HandRaiseResult,
    ManagerPlanResult,
    ManagerPlanSubmission,
    MeetingControlResultV1,
    TurnSubmissionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    PauseMeetingInputV1,
    ResumeMeetingInputV1,
    ReassignTurnInputV1,
    ReassignTurnResultV1,
    CaptainRiskDispositionInput,
    CaptainRiskDispositionResult,
    FinishMeetingMailInput,
    MeetingMailResultV1,
    SendMeetingMessageInputV1,
    TurnSubmissionV1,
    CaptainDecisionAcceptanceInput,
    CaptainDecisionAcceptanceResult,
    CaptainDecisionDispositionInput,
    CaptainDecisionDispositionResult,
    CaptainAgendaCandidateDispositionInput,
    CaptainAgendaCandidateDispositionResult
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
    disposeAttendanceRecommendation(
        input: CaptainAttendanceDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainAttendanceDispositionResult> | ProtocolErrorV1>;
    acceptDecision(
        input: CaptainDecisionAcceptanceInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResult> | ProtocolErrorV1>;
    disposeDecision(
        input: CaptainDecisionDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResult> | ProtocolErrorV1>;
    disposeAgendaCandidate(
        input: CaptainAgendaCandidateDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainAgendaCandidateDispositionResult> | ProtocolErrorV1>;
    sendMeetingMessage(
        input: SendMeetingMessageInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
    finishMeetingMail(
        input: FinishMeetingMailInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
    createMeeting(
        input: CreateMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CreateMeetingResult> | ProtocolErrorV1>;
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
        input: HandRaiseSubmission,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<HandRaiseResult> | ProtocolErrorV1>;
    submitTurn(
        input: TurnSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<TurnSubmissionResultV1> | ProtocolErrorV1>;
    submitManagerPlan(
        input: ManagerPlanSubmission,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ManagerPlanResult> | ProtocolErrorV1>;
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
        input: CaptainRiskDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResult> | ProtocolErrorV1>;
    endMeeting(
        input: EndMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<EndMeetingResult> | ProtocolErrorV1>;
}
