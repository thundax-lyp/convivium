import type {
    CaptainAttendanceDispositionInput,
    CaptainAttendanceDispositionResult,
    CreateMeetingInput,
    CreateMeetingResult,
    EndMeetingInput,
    EndMeetingResult,
    MeetingTaskRequest,
    MeetingTaskStatusInput,
    MeetingTaskStartInput,
    MeetingTaskFinishInput,
    MeetingTaskResult,
    MeetingTaskStatusResult,
    MeetingTaskStartResult,
    MeetingTaskFinishResult,
    HandRaiseSubmission,
    HandRaiseResult,
    ManagerPlanResult,
    ManagerPlanSubmission,
    MeetingControlResult,
    TurnSubmissionResult,
    ProtocolError,
    ProtocolSuccess,
    PauseMeetingInput,
    ResumeMeetingInput,
    ReassignTurnInput,
    ReassignTurnResult,
    CaptainRiskDispositionInput,
    CaptainRiskDispositionResult,
    FinishMeetingMailInput,
    MeetingMailResult,
    SendMeetingMessageInput,
    TurnSubmission,
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
    ): Promise<ProtocolSuccess<CaptainAttendanceDispositionResult> | ProtocolError>;
    acceptDecision(
        input: CaptainDecisionAcceptanceInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<CaptainDecisionAcceptanceResult> | ProtocolError>;
    disposeDecision(
        input: CaptainDecisionDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<CaptainDecisionDispositionResult> | ProtocolError>;
    disposeAgendaCandidate(
        input: CaptainAgendaCandidateDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<CaptainAgendaCandidateDispositionResult> | ProtocolError>;
    sendMeetingMessage(
        input: SendMeetingMessageInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingMailResult> | ProtocolError>;
    finishMeetingMail(
        input: FinishMeetingMailInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingMailResult> | ProtocolError>;
    createMeeting(
        input: CreateMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<CreateMeetingResult> | ProtocolError>;
    createMeetingTask(
        input: MeetingTaskRequest,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingTaskResult> | ProtocolError>;
    meetingTaskStatus(
        input: MeetingTaskStatusInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingTaskStatusResult> | ProtocolError>;
    startMeetingTask(
        input: MeetingTaskStartInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingTaskStartResult> | ProtocolError>;
    finishMeetingTask(
        input: MeetingTaskFinishInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingTaskFinishResult> | ProtocolError>;
    raiseHand(
        input: HandRaiseSubmission,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<HandRaiseResult> | ProtocolError>;
    submitTurn(
        input: TurnSubmission,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<TurnSubmissionResult> | ProtocolError>;
    submitManagerPlan(
        input: ManagerPlanSubmission,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<ManagerPlanResult> | ProtocolError>;
    pause(
        input: PauseMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingControlResult> | ProtocolError>;
    resume(
        input: ResumeMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<MeetingControlResult> | ProtocolError>;
    reassignTurn(
        input: ReassignTurnInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<ReassignTurnResult> | ProtocolError>;
    disposeRisk(
        input: CaptainRiskDispositionInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<CaptainRiskDispositionResult> | ProtocolError>;
    endMeeting(
        input: EndMeetingInput,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccess<EndMeetingResult> | ProtocolError>;
}
