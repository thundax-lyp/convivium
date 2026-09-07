import type { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { DomainFacilityPort } from "../../repository/domain/domain-repository-registry.js";
import type { RepositoryAuthorizationValidator } from "../meeting-runtime.js";
import type { AuthorizedTaskEvidenceResolver } from "../task-evidence.js";
import type { AgentCatalogPort } from "../services/agent-catalog.js";
import type { DeveloperMarkdownWarning } from "../services/developer-markdown-service.js";
import type { MeetingOwnershipLookup } from "../../dsh/index.js";
import type {
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
    LocalMeetingListResponseV1,
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
} from "../../protocol/index.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { MeetingRepositoryRuntime } from "../meeting-runtime.js";

export interface StoredMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepositoryRuntime;
    parent?: Agent;
}

export type MeetingControlSource =
    { readonly kind: "captain"; readonly sessionId: string } | { readonly kind: "local_host" };

export interface MeetingToolCaller {
    readonly sessionId: string;
    readonly agent?: Agent;
    readonly kind: "captain" | "manager" | "participant";
    readonly meetingId?: string;
    readonly participantId?: string;
}

export interface MeetingToolRuntime {
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

export interface CreateStatusRuntimeOptions {
    readonly storageDomain: Pick<DomainFacility, "open"> | DomainFacilityPort;
    readonly provider: string;
    readonly continuable: Pick<
        SubagentRuntime,
        "startContinuable" | "followup" | "listDescendants"
    > &
        Partial<Pick<SubagentRuntime, "listChildren" | "interrupt" | "drainContinuableChildren">>;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly maxParticipants?: number;
    readonly outboxPollMs?: number;
    readonly speakerAttemptTimeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
    readonly taskEvidenceResolver?: AuthorizedTaskEvidenceResolver;
    readonly timeoutScanSleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    readonly agentCatalog?: AgentCatalogPort;
    readonly developerMarkdown?: {
        readonly workspaceRoot: string;
        readonly warn: (warning: DeveloperMarkdownWarning) => void;
    };
}

export interface LocalMeetingWebRuntime {
    acceptLocalDecision(
        input: CaptainDecisionAcceptanceInputV1
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>;
    disposeLocalDecision(
        input: CaptainDecisionDispositionInputV1
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1>;
    disposeLocalRisk(
        input: CaptainRiskDispositionInputV1
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1>;
    listLocalMeetings(): Promise<LocalMeetingListResponseV1>;
    getLocalMeetingStatus(
        input: MeetingStatusInputV1
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
    pauseLocalMeeting(
        input: PauseMeetingInputV1
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    resumeLocalMeeting(
        input: ResumeMeetingInputV1
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    reassignLocalTurn(
        input: ReassignTurnInputV1
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1> | ProtocolErrorV1>;
    endLocalMeeting(
        input: EndMeetingInputV1
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1> | ProtocolErrorV1>;
}

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime &
    MeetingOwnershipLookup & {
        scanExpiredSpeakerAttempts(): Promise<void>;
    } & LocalMeetingWebRuntime & { dispose(): Promise<void> };
