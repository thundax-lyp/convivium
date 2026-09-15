# Meeting Interface

## Purpose And Ownership

本文是 Meeting 的唯一跨边界类型契约。它定义写命令、读投影、提交记录、Remote 刷新和 Markdown 输入；领域字段与不变量以 [Domain Design](../30-designs/DOMAIN-DESIGN.md) 为准，转换顺序以 [Meeting Design](../30-designs/MEETING-DESIGN.md) 为准。

DSH/Remote transport 提供可信 caller binding；Meeting Runtime 是唯一业务写入者；Repository 原子保存 Runtime 交付的提交包；projection 只读已提交状态。请求体不得包含 actorId、roles、Session ID、ownership、baseline、authority、当前时间或任何可由 Runtime 推导的字段。

## Wire Conventions

所有 JSON 字段使用 lowerCamelCase；时间是 Unix epoch milliseconds 的安全整数；ID 是不透明、非空字符串；数组字段始终存在且元素按写入顺序排列。领域 ID 不可互换。未知字段可以忽略；未知 discriminant、缺失必填字段、null 替代非 null 字段、错误 ID 类型或无效枚举返回 `INVALID_ARGUMENT`。

```ts
type EpochMs = number;
type OpaqueId = string;
interface MeetingCommandV1 {
  protocolVersion: 1;
  meetingId: OpaqueId;              // createMeeting 时必须为 "new"
  expectedMeetingVersion: number;   // createMeeting 为 0，其余为正整数
  requestId: OpaqueId;
  action: MeetingActionV1;
}
interface CallerBinding {
  channel: "dsh_tool" | "loopback_remote" | "runtime_recovery" | "deadline_handler";
  principalId: OpaqueId;
  sessionBindingId?: OpaqueId;
}
```

`CallerBinding` 只由 adapter 传给 Runtime。receipt 键为 `(meetingId, principalId, requestId)`；同键必须拥有相同 action kind 和规范化 payload。相同请求返回原结果，不同 payload 返回 `IDEMPOTENCY_CONFLICT`。授权检查先于 receipt 查找。

## Command Action Union

除非另有说明，全部 action 只能在非 `terminal|archiving|archived` Meeting 执行。所有 `reason`、`rationale`、`text`、`title`、`body`、`instructions` 均为去首尾空白后的非空字符串；引用数组不得为空且不得重复。

```ts
type MeetingActionV1 =
  | CreateMeeting | PauseMeeting | ResumeMeeting | EndMeeting
  | ActivateAgenda | RaiseAgendaCandidate | DisposeAgendaCandidate
  | RecordQuestion | ResolveQuestion | RecordIssue | DisposeIssue
  | RequestEvidenceOpportunity | DisposeEvidenceOpportunity | OpenRound | RaiseHand | DisposeHandRaise
  | ReviewEvidenceDraft | SubmitEvidence | SubmitReview | RecordReviewDelivery
  | RaiseSupplementHand | DisposeSupplementHand
  | CloseContribution | PublishRound | AbortRound
  | RecordProposalRevision | RecordPosition | RecordDecisionCandidate | Decide | ChangeDecision
  | DisposeRisk | SubmitCompletionDeclaration | RecordCompletionFact | ChangeCompletionFact
  | PlanNextStep | CreateTask | ClaimTask | CompleteTask | CancelTask | ExpireTask | ReassignTask
  | SendPrivateMail | StartPrivateMail | CompletePrivateMail | CancelPrivateMail | ExpirePrivateMail
  | StartArchive | RecordArchiveSessionResult
  | RecommendIdentity | DisposeIdentityRecommendation;
```

### Lifecycle, agenda and planning

```ts
interface CreateMeeting { kind: "create_meeting"; objective: ObjectiveInput; identities: InitialIdentityInput[]; initialAgenda: AgendaInput[]; initialActiveAgendaId: OpaqueId; limits: MeetingLimitsInput; continuation?: ContinuationInput }
interface PauseMeeting { kind: "pause_meeting"; reason: string }
interface ResumeMeeting { kind: "resume_meeting"; reason: string }
interface EndMeeting {
  kind: "end_meeting";
  outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
  reason: string; decisionIds: OpaqueId[]; completionFactIds: OpaqueId[];
  unresolvedQuestionIds: OpaqueId[]; unresolvedIssueIds: OpaqueId[];
}
interface ActivateAgenda { kind: "activate_agenda"; agendaId: OpaqueId; previousDisposition: "completed" | "deferred" | "closed"; reason: string }
interface RaiseAgendaCandidate { kind: "raise_agenda_candidate"; title: string; reason: string; sourceMessageId?: OpaqueId }
interface DisposeAgendaCandidate { kind: "dispose_agenda_candidate"; candidateId: OpaqueId; disposition: "promoted" | "parked" | "rejected"; reason: string; promotedAgenda?: AgendaInput }
interface RecordQuestion { kind: "record_question"; agendaId: OpaqueId; text: string; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[]; blocking: boolean }
interface ResolveQuestion { kind: "resolve_question"; questionId: OpaqueId; status: "answered" | "withdrawn" | "deferred"; rationale: string; evidenceIds: OpaqueId[] }
interface RecordIssue { kind: "record_issue"; agendaId: OpaqueId; description: string; riskLevel: "low" | "medium" | "high"; classification: "blocking" | "follow_up" | "pending_discussion" | "accepted_risk" | "out_of_scope"; blocking: boolean; rationale: string }
interface DisposeIssue { kind: "dispose_issue"; issueId: OpaqueId; status: "resolved" | "deferred" | "out_of_scope"; rationale: string; evidenceIds: OpaqueId[] }
interface RecommendIdentity { kind: "recommend_identity"; definitionId: OpaqueId; definitionVersion: string; catalogId: OpaqueId; catalogVersion: string; agendaId: OpaqueId; rationale: string; expectedContribution: string; evidenceGap: string }
interface DisposeIdentityRecommendation { kind: "dispose_identity_recommendation"; recommendationId: OpaqueId; disposition: "accepted" | "rejected"; rationale: string }
```

`create_meeting` 仅允许可信 local Convener，且 Runtime 已完成 role definition/session preflight。`dispose_identity_recommendation` 仅 Captain 可用；accepted 的 result 仅在 Definition admission 和 Session ownership 都成功后含新 identityId。

### Round, evidence and review

```ts
interface OpenRound { kind: "open_round"; agendaId: OpaqueId; deadlineAt?: EpochMs }
interface RequestEvidenceOpportunity { kind: "request_evidence_opportunity"; agendaId: OpaqueId; purpose: string }
interface DisposeEvidenceOpportunity { kind: "dispose_evidence_opportunity"; requestId: OpaqueId; disposition: "rejected" | "deferred"; reason: string }
interface RaiseHand { kind: "raise_hand"; roundId: OpaqueId; purpose: string }
interface DisposeHandRaise { kind: "dispose_hand_raise"; roundId: OpaqueId; contributorId: OpaqueId; disposition: "accepted" | "rejected" | "deferred"; reason: string }
interface ReviewEvidenceDraft { kind: "review_evidence_draft"; contributionId: OpaqueId; evidenceHash: string; disposition: "accepted" | "rejected" | "deferred"; missingFields: EvidenceFieldName[]; rationale: string }
interface SubmitEvidence { kind: "submit_evidence"; contributionId: OpaqueId; evidence: EvidenceInput }
interface SubmitReview { kind: "submit_review"; versionId: OpaqueId; dimensions: ReviewDimensionsInput; scope: string }
interface RecordReviewDelivery { kind: "record_review_delivery"; reviewId: OpaqueId; status: "sent" | "failed"; failureReason?: string }
interface RaiseSupplementHand { kind: "raise_supplement_hand"; contributionId: OpaqueId; purpose: string }
interface DisposeSupplementHand { kind: "dispose_supplement_hand"; contributionId: OpaqueId; disposition: "accepted" | "rejected" | "deferred"; reason: string }
interface CloseContribution { kind: "close_contribution"; contributionId: OpaqueId; exit: "withdrawn" | "submission_missing" | "timed_out"; reason: string }
interface PublishRound { kind: "publish_round"; roundId: OpaqueId }
interface AbortRound { kind: "abort_round"; roundId: OpaqueId; reason: string }
type EvidenceFieldName = "observation" | "interpretation" | "method" | "falsifiers" | "uncertainties" | "limitations" | "claims" | "materials";
```

`ReviewEvidenceDraft` 只由 Manager 对作者私下保留并送交的草稿执行格式处置，`evidenceHash` 是该 `EvidenceInput` 规范 JSON 的 SHA-256 小写十六进制；请求不包含草稿正文。规范 JSON 的唯一算法：先按本文 `EvidenceInput`/`TextWithReason`/`EvidenceClaimInput`/`MaterialInput` 声明顺序重建已通过 Wire validation 的字段，忽略未知字段、保留数组顺序和文本原值，optional reason 不存在时省略键；再用 JavaScript `JSON.stringify` 生成 UTF-8 字节并计算 SHA-256。accepted 的 `missingFields` 必须为空，在聚合内建立仅含 contributionId、hash、Manager、时间的待消费格式批准；rejected 的 `missingFields` 必须非空，deferred 必有 rationale，两者不写 EvidencePackage、EvidenceVersion、Registration、Review 或草稿正文，只经最小通知向作者反馈。作者的 `SubmitEvidence` 必须提交与未消费批准 hash 完全一致的材料，Runtime 原子消费批准并创建当前 EvidenceVersion 与 complete Registration。首份是 ordinal 1、补充是同包 ordinal + 1；首份及格式驳回后的重新送交不计补充，已有已登记版本的更新必须消费获接纳的补充举手且计数 + 1。Review delivery 仅可信 effect dispatcher 可提交：sent 不带 failureReason，failed 必带。deadline handler 只能使用 `CloseContribution` 且 Runtime 必须验证 deadline 已到。

`RequestEvidenceOpportunity` 是运行中且没有 open Round 时的初次申请，必须指向 active Agenda；Runtime 在确认 caller 自己的 Session active、无未结束 Contribution/MeetingTask 后把它登记为 pending request，不自动开轮。`DisposeEvidenceOpportunity` 由 Manager 移除 rejected/deferred request 并反馈理由。Manager `OpenRound` 原子把该 Agenda 的 pending requests 转为本轮 pending hand raises，逐个仍须 `DisposeHandRaise` 才取得 Contribution。open Round 期间作者直接使用 `RaiseHand`；任一身份已有未结束任务时两种初次申请均返回 `PRECONDITION_FAILED`。

`RaiseHand` 成功时只在 MeetingState 增加 `(roundId, caller contributorId)` 的 pending request，收到重复 pending 或本轮已有 Contribution 返回 `PRECONDITION_FAILED`；`DisposeHandRaise` 只处理这条 pending request。accepted 原子移除 pending 并创建 Contribution；rejected/deferred 原子移除 pending、返回申请者理由，不创建 Contribution，也不在 MeetingView 留存该次举手。追加 command fact 可保留审计，不构成当前 Meeting 举手记录。

```ts
interface EvidenceInput {
  observation: string; interpretation: string; method: string;
  falsifiers: TextWithReason[]; uncertainties: TextWithReason[]; limitations: TextWithReason[];
  claims: EvidenceClaimInput[]; materials: MaterialInput[];
}
interface TextWithReason { value: string; reason?: string }
interface EvidenceClaimInput { id: OpaqueId; statement: string; materialIds: OpaqueId[]; qualification: string }
interface MaterialInput {
  id: OpaqueId;
  kind: "document" | "dataset" | "experiment" | "observation" | "tool_output" | "unknown" | "not_applicable";
  originator: string; originalSource: string; sourcePublishedAt: string; acquiredAt: string;
  version: string; locator: string; location: string;
  verificationConditions: string; limitations: string; sharedDependencies: string[]; reason?: string;
}
interface ReviewDimensionsInput { source: ReviewDimensionInput; credibility: ReviewDimensionInput; completeness: ReviewDimensionInput; support: ReviewDimensionInput }
interface ReviewDimensionInput { score: 0 | 1 | 2 | 3 | "unable_to_assess"; scope: string; reason: string; baselineEvidenceIds: OpaqueId[] }
```

`falsifiers`、`uncertainties`、`limitations`、`claims`、`materials` 各至少一项；每个 `TextWithReason.value` 必须非空，填写“无”或“未知”时必须有非空 `reason`，不能由公开模板替作者生成缺项理由。每个 claim 至少引用一个本 evidence 的 material。kind 为 unknown/not_applicable 时必须给出 reason；Runtime 从 Round 注入固定 `baselinePublicationIds`，请求不得提供它。每维 `scope` 与 `reason` 均须非空；每维 `baselineEvidenceIds` 只可引用固定 baseline 中 Publication.finalVersionIds 所列的版本；未引用上一轮依据时数组明确为 []，不能用本轮其他证据补入。reviewer 不能审核作者 identity 的版本，且只能审核当前、已 complete 的版本。

每个 current version 指定一个最终 reviewer：依 Agenda.requiredReviewerIds 原顺序取首位非作者、具有 evidence_reviewer 角色且 reviewResponsibilityIds 含该 Agenda 的 identity；无合格者原子拒绝本次提交，不消耗 FormatApproval。`SubmitReview` 只接纳该指定 reviewer 的当前 complete version，每版最终 Review 至多一个。

已接纳但还没有登记证据的 Contribution 的准备期限为 acceptedAt + limits.taskDeadlineMs，并与存在的 Round.deadlineAt、该作者同 Agenda 未结束 MeetingTask.deadlineAt 取最早值；期限到达后可信 deadline handler 才能记录 submission_missing，绝不造空包。当前版审核或 ReviewDelivery 尚未成功时，不能据作者沉默记录 timed_out 或正常 PublishRound；reviewDeadlineMs 到达须报告未审/未送达包并交由后续异常轮次处置，不把该包视为最终已审。

`MaterialInput.originator`、`originalSource`、`sourcePublishedAt`、`acquiredAt`、`version`、`locator`、`location`、`verificationConditions`、`limitations` 均须非空；sourcePublishedAt/acquiredAt 不适用或无法获知时填写“未知”或“不适用”并给出非空 reason，不得删字段或代填时间。原始作者/机构不明时 originator=“未知”且给出 reason。Manager 的格式审核只检查这些字段与可定位说明，不作内容可信度判断。

格式 rejected/deferred 的 rationale 均须非空；rejected 还须至少一个 missingFields，rationale 用文字定位该顶层字段内的具体缺项（例如 materials 中的 sourcePublishedAt），不能只回一个笼统的“格式不对”。accepted 只记录批准 hash，不为草稿建立审核/登记历史。

### Deliberation, outcome, task and mail

```ts
interface RecordProposalRevision { kind: "record_proposal_revision"; proposalId?: OpaqueId; supersedesRevisionId?: OpaqueId; agendaId: OpaqueId; summary: string; body: string; evidenceIds: OpaqueId[] }
interface RecordPosition { kind: "record_position"; proposalRevisionId: OpaqueId; stance: "support" | "oppose" | "abstain" | "conditional"; rationale: string; evidenceIds: OpaqueId[] }
interface RecordDecisionCandidate { kind: "record_decision_candidate"; proposalRevisionId: OpaqueId; outcome: "adopt" | "reject" | "defer"; rationale: string; evidenceIds: OpaqueId[]; positionIds: OpaqueId[] }
interface Decide { kind: "decide"; candidateId: OpaqueId }
interface ChangeDecision { kind: "change_decision"; decisionId: OpaqueId; status: "superseded" | "revoked"; rationale: string; evidenceIds: OpaqueId[]; replacementCandidateId?: OpaqueId }
interface DisposeRisk { kind: "dispose_risk"; issueId: OpaqueId; action: "accept" | "reject"; scope: string; rationale: string; evidenceIds: OpaqueId[] }
interface SubmitCompletionDeclaration { kind: "submit_completion_declaration"; outputId: OpaqueId; criterionId?: OpaqueId; statement: string; evidenceIds: OpaqueId[]; taskId?: OpaqueId }
interface RecordCompletionFact { kind: "record_completion_fact"; outputId: OpaqueId; criterionId?: OpaqueId; statement: string; rationale: string; evidenceIds: OpaqueId[]; decisionIds: OpaqueId[] }
interface ChangeCompletionFact { kind: "change_completion_fact"; factId: OpaqueId; status: "superseded" | "revoked"; rationale: string; replacement?: Omit<RecordCompletionFact, "kind"> }
interface PlanNextStep { kind: "plan_next_step"; agendaId: OpaqueId; planKind: "open_round" | "continue_agenda" | "stop_agenda" | "raise_agenda_candidate" | "wait_for_required_identity"; rationale: string; blockingReason?: string }
interface CreateTask { kind: "create_task"; assigneeId: OpaqueId; agendaId?: OpaqueId; title: string; instructions: string; deadlineAt?: EpochMs }
interface ClaimTask { kind: "claim_task"; taskId: OpaqueId }
interface CompleteTask { kind: "complete_task"; taskId: OpaqueId; result: string }
interface CancelTask { kind: "cancel_task"; taskId: OpaqueId; reason: string }
interface ExpireTask { kind: "expire_task"; taskId: OpaqueId; reason: string }
interface ReassignTask { kind: "reassign_task"; taskId: OpaqueId; assigneeId: OpaqueId; reason: string; deadlineAt?: EpochMs }
interface SendPrivateMail { kind: "send_private_mail"; recipientId: OpaqueId; agendaId?: OpaqueId; body: string; relatedIds: OpaqueId[] }
interface StartPrivateMail { kind: "start_private_mail"; mailId: OpaqueId }
interface CompletePrivateMail { kind: "complete_private_mail"; mailId: OpaqueId }
interface CancelPrivateMail { kind: "cancel_private_mail"; mailId: OpaqueId; reason: string }
interface ExpirePrivateMail { kind: "expire_private_mail"; mailId: OpaqueId; reason: string }
interface StartArchive { kind: "start_archive" }
interface RecordArchiveSessionResult { kind: "record_archive_session_result"; sessionOwnershipId: OpaqueId; status: "closed" | "failed"; failureReason?: string }
```

local controller performs create, pause, resume and end; it is not an Agent identity. Captain is required for agenda disposition/activation, Decision, RiskDisposition and CompletionFact; local controller may only decide, supersede/revoke Decision, or accept/reject Risk using the same field validation and separate local audit facts. Manager opens/publishes normal Rounds, handles all hand-raise dispositions, registers evidence and recommends. A contributor may submit own evidence/proposal/position/candidate/task result; reviewer only submits assigned reviews. Runtime rejects role-confused actions.

A DecisionCandidate is accepted only when it names the current ProposalRevision and its evidence/positions are visible, valid and meeting-local. Decide accepts exactly one such candidate. Supersede requires replacementCandidateId and atomically accepts it, creates its Decision and marks the old accepted Decision superseded; revoke must not contain replacementCandidateId. Candidate reject/revoke does not exist. Risk accept/reject checks the exact Issue, its riskLevel against acceptableRiskLevel, hard constraints, Issue status, lifecycle, non-empty rationale and meeting-local evidence; accept updates only that Issue to accepted_risk and non-blocking, reject keeps it open and blocking.

RaiseSupplementHand is author-only within the same nonterminal Contribution and requires a nonempty description of the intended correction or additional evidence. It may occur before review delivery; after the first successful delivery of the current Review it must occur strictly before sentAt + responseDeadlineMs. It must also occur before any persisted Round or applicable MeetingTask deadline. When substantiveSupplementCount is below two and the current registered version is under review, Manager may only defer acceptance and the package cannot change; a third application follows the count-exhausted rejection rule regardless of review stage. DisposeSupplementHand is Manager-only; accepted is permitted only when the current version is not under review, there is no other pending/accepted supplement hand, and substantiveSupplementCount is below two. An accepted hand permits a new private draft format review; the author uses the same SubmitEvidence action after format approval, which atomically consumes the hand and approval and increments the count only when replacing a registered current version. Rejected/deferred draft reviews or supplement requests create no new EvidenceVersion and do not mean withdrawal. SubmitCompletionDeclaration is participant-only: it creates an immutable declaration but never changes output, criterion, Agenda, lifecycle or completion status. RecordCompletionFact may consume a declaration only after authorization, public-evidence, required-review and risk checks pass.

ContinuationInput is accepted only for a new Meeting when local controller selects an immutable, caller-visible ArchivePackage and a distinct non-empty subset of its exported material IDs. It imports copies with sourceArchiveId/sourceMaterialId provenance; it never imports old Meeting ID, identity, Session, capability, full transcript, task, mail or running state.

PlanNextStep is Manager-only and is rejected while a Round is open; a new plan supersedes the current active plan for its Agenda. CreateTask requires the caller's active authorization and matching context. ReassignTask is local-controller-only, atomically revokes the old authorization and creates a replacement task; all later commands against the revoked task return PRECONDITION_FAILED. ExpireTask and ExpirePrivateMail are deadline-handler-only and require the respective persisted deadline to be no later than Runtime clock. StartPrivateMail is a trusted dispatcher action and is rejected if the recipient owns a claimed formal Contribution or another processing mail. It fixes the processing-visible Publication range; retries never recompute it. StartArchive is local-controller-only from terminal and atomically materializes the ArchivePackage before archiving; RecordArchiveSessionResult is trusted session-owner-only. Any failed Session close leaves lifecycle archiving and rejects discussion; archived is entered only after every meeting-owned Session reports closed.

补正申请在首次登记前还须严格早于 Contribution.acceptedAt + limits.taskDeadlineMs；这条准备期限即使没有单独 Round/MeetingTask deadline 也适用。

审核意见成功送达后，作者在响应期限内用 `RaiseSupplementHand` 携非空 purpose 明确“继续举手并申请补证”，该动作无论审核是否已送达都把 purpose 写入原 Contribution.response；放弃则由作者用 `CloseContribution(withdrawn)` 明确提交。没有独立的空文字“继续”动作。已登记版 substantiveSupplementCount=2 时第三次申请仍可作为待处置举手送给 Manager，但 accepted 必须返回 LIMIT_EXCEEDED；Manager 只能 rejected/deferred 并说明次数已尽，两者都收口为 supplement_rejected，不伪称作者主动放弃。Manager 处置前的 pending hand 不能因作者沉默自动超时；已明确继续但补充未推进者只可在原 Contribution 准备/持久 Round 或适用 Task 期限到期后以“继续申请未完成”原因 timed_out，区别于送达后无任何明确响应的 60 秒超时。新版本完整登记时清除旧 response，新的审核送达重新开启响应期限。

已有登记版但仍在原 Contribution 内的补证准备期限，以当前 EvidenceVersion.submittedAt + limits.taskDeadlineMs 为默认界；再与存在的 Round.deadlineAt、同 Agenda 未结束 MeetingTask.deadlineAt 取最早值。`RaiseSupplementHand`、获批准草稿后的 `SubmitEvidence` 均须严格早于此界；送达后申请还须严格早于 sentAt + 60000。期限到达而 Manager 申请仍 pending 时，不能将 Manager 未处置归因于作者沉默。

## Input Components

```ts
interface ObjectiveInput { statement: string; requiredOutputs: TargetInput[]; acceptanceCriteria: TargetInput[]; hardConstraints: TargetInput[]; acceptableRiskLevel: "low" | "medium" | "high" }
interface TargetInput { id: OpaqueId; text: string }
interface InitialIdentityInput { definitionId?: OpaqueId; definitionVersion?: string; displayName: string; roles: Array<"captain" | "manager" | "contributor" | "evidence_reviewer">; agendaResponsibilityIds: OpaqueId[]; reviewResponsibilityIds: OpaqueId[]; riskAuthority: boolean; required: boolean }
interface AgendaInput { id: OpaqueId; title: string; question: string; requiredOutputIds: OpaqueId[]; requiredReviewerIds: OpaqueId[]; ownerId?: OpaqueId }
interface MeetingLimitsInput { maxFormalMessages: number; maxDurationMs: number; taskDeadlineMs: number; reviewDeadlineMs: number }
interface ContinuationInput { sourceArchiveId: OpaqueId; selectedMaterialIds: OpaqueId[] }
```

IDs supplied during creation must be locally unique and all references validate before Runtime allocates Meeting ID. Runtime fixes `responseDeadlineMs` to 60000; clients cannot configure it.

## Results, Errors And Precedence

```ts
type MeetingCommandResultV1 = MeetingCommandAcceptedV1 | MeetingCommandRejectedV1;
interface MeetingCommandAcceptedV1 {
  kind: "accepted"; meetingId: OpaqueId; committedVersion: number; receiptId: OpaqueId;
  factIds: OpaqueId[];
  effects: Array<{ id: OpaqueId; kind: "refresh" | "session_mail" | "agent_notice" | "review_delivery" | "markdown_projection" | "archive"; status: "queued" }>;
}
interface MeetingCommandRejectedV1 { kind: "rejected"; error: MeetingErrorV1 }
interface MeetingErrorV1 {
  code: "INVALID_ARGUMENT" | "MEETING_NOT_FOUND" | "UNAUTHORIZED" | "STALE_AUTHORIZATION" |
    "IDEMPOTENCY_CONFLICT" | "MEETING_TERMINAL" | "VERSION_CONFLICT" | "NOT_FOUND" |
    "INVALID_STATE" | "PRECONDITION_FAILED" | "REVIEWER_CONFLICT" | "ROUND_NOT_CLOSABLE" |
    "LIMIT_EXCEEDED" | "RECOVERY_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "INCOMPATIBLE_VERSION";
  message: string; currentMeetingVersion?: number; targetKind?: string; targetId?: OpaqueId;
}
```

错误优先级固定为：协议结构 → Meeting 可见性 → caller ownership/authorization → requestId binding → terminal/archive → expected version → 对象存在性 → action state/precondition → Domain invariant/limit → storage/recovery。拒绝结果不含 effects、隐藏事实或其他 caller 的版本。

## Read, Remote And Projection

```ts
interface ListMeetingsRequestV1 { protocolVersion: 1 }
interface MeetingSummaryV1 { meetingId: OpaqueId; version: number; objective: string; lifecycle: "preparing" | "running" | "paused" | "converging" | "ending" | "terminal" | "archiving" | "archived"; activeAgenda?: { id: OpaqueId; title: string }; updatedAt: EpochMs; unavailableReason?: string }
interface ReadMeetingRequestV1 { protocolVersion: 1; meetingId: OpaqueId }
interface MeetingViewV1 {
  meetingId: OpaqueId; version: number; objective: ObjectiveView; lifecycle: LifecycleView;
  agenda: AgendaView[]; opportunityRequests: EvidenceOpportunityRequestView[]; rounds: RoundView[]; publications: PublicationView[];
  evidencePackages: EvidencePackageView[]; evidenceReviews: EvidenceReviewView[];
  messages: FormalMessageView[]; outcomes: OutcomeView; managerPlans: ManagerPlanView[]; tasks: TaskView[];
  privateMail: PrivateMailView[]; controls: AllowedControl[];
}
interface RefreshNoticeV1 { kind: "refresh"; meetingId: OpaqueId; committedVersion: number }
```

各 `*View` 为 Domain 同名实体的 caller-filtered DTO，保留稳定 ID 以支持下一命令；它们不得增加可写业务字段。Manager 读取全部 pending opportunity requests 与本轮 pending hand raises；普通 contributor 只读取自己的 pending request，不能读取他人的申请内容。普通 participant 永不读取他人私信、未审版本、未分配 review、Session/ownership/capability、decision candidate 或 Captain-only risk disposition。controls 仅是提示，Runtime 仍是唯一授权者。

Remote 只暴露 `list()`、`read(request)`、`control(command)`、`subscribeRefresh()`，仅 loopback 可用。断线禁写；重连、focus 或 notice 后必须 read，不自动重试 command 或轮询。notice 可丢失/重复且不携带事实。

    interface ObjectiveView {
      statement: string;
      requiredOutputs: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "unsatisfied" }>;
      acceptanceCriteria: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "unsatisfied" }>;
      hardConstraints: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "violated" }>;
      acceptableRiskLevel: "low" | "medium" | "high";
    }
    interface LifecycleView { status: "preparing" | "running" | "paused" | "converging" | "ending" | "terminal" | "archiving" | "archived"; changedAt: EpochMs; reason?: string }
    interface AgendaView { id: OpaqueId; title: string; question: string; status: "pending" | "active" | "blocked" | "completed" | "deferred" | "closed"; ownerId?: OpaqueId; requiredOutputIds: OpaqueId[]; requiredReviewerIds: OpaqueId[] }
    interface EvidenceOpportunityRequestView { id: OpaqueId; agendaId: OpaqueId; contributorId: OpaqueId; purpose: string; requestedAt: EpochMs }
    interface RoundView { id: OpaqueId; agendaId: OpaqueId; status: "open" | "published" | "aborted"; baselinePublicationIds: OpaqueId[]; openedAt: EpochMs; deadlineAt?: EpochMs; publicationId?: OpaqueId; pendingHandRaises: PendingHandRaiseView[]; contributions: ContributionView[] }
    interface PendingHandRaiseView { roundId: OpaqueId; contributorId: OpaqueId; purpose: string; raisedAt: EpochMs }
    interface ContributionView { id: OpaqueId; contributorId: OpaqueId; status: "preparing" | "format_correction" | "registered" | "under_review" | "awaiting_response" | "withdrawn" | "submission_missing" | "timed_out" | "supplement_rejected" | "closed"; packageId?: OpaqueId; substantiveSupplementCount: number; exitReason?: string }
    interface PublicationView { id: OpaqueId; roundId: OpaqueId; seq: number; finalVersionIds: OpaqueId[]; finalReviewIds: OpaqueId[]; exitReasons: string[]; publishedAt: EpochMs }
    interface EvidencePackageView { id: OpaqueId; roundId: OpaqueId; contributionId: OpaqueId; authorId: OpaqueId; agendaId: OpaqueId; currentVersion: EvidenceVersionView }
    interface EvidenceVersionView { id: OpaqueId; ordinal: number; observation: string; interpretation: string; method: string; falsifiers: TextWithReason[]; uncertainties: TextWithReason[]; limitations: TextWithReason[]; claims: EvidenceClaimInput[]; materials: MaterialInput[]; submittedAt: EpochMs }
    interface EvidenceReviewView { id: OpaqueId; versionId: OpaqueId; reviewerId: OpaqueId; baselinePublicationIds: OpaqueId[]; scope: string; dimensions: ReviewDimensionsInput; createdAt: EpochMs }
    interface FormalMessageView { id: OpaqueId; seq: number; actorId: OpaqueId; agendaId: OpaqueId; kind: string; body: string; publicationId: OpaqueId; relatedIds: OpaqueId[]; createdAt: EpochMs }
interface DecisionCandidateView { id: OpaqueId; proposalRevisionId: OpaqueId; outcome: "adopt" | "reject" | "defer"; rationale: string; evidenceIds: OpaqueId[]; positionIds: OpaqueId[]; createdAt: EpochMs }
interface DecisionView { id: OpaqueId; candidateId: OpaqueId; proposalRevisionId: OpaqueId; status: "accepted" | "superseded" | "revoked"; outcome: "adopt" | "reject" | "defer"; rationale: string; evidenceIds: OpaqueId[]; positionIds: OpaqueId[]; createdAt: EpochMs }
    interface QuestionView { id: OpaqueId; agendaId: OpaqueId; text: string; blocking: boolean; status: "open" | "answered" | "withdrawn" | "deferred"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[] }
    interface IssueView { id: OpaqueId; agendaId: OpaqueId; description: string; riskLevel: "low" | "medium" | "high"; classification: "blocking" | "follow_up" | "pending_discussion" | "accepted_risk" | "out_of_scope"; blocking: boolean; status: "open" | "resolved" | "deferred" | "out_of_scope"; rationale: string }
    interface OutcomeView { decisions: DecisionView[]; completionFacts: CompletionFactView[]; riskDispositions: RiskDispositionView[]; pendingDecisionCandidates?: DecisionCandidateView[]; termination?: TerminationView }
    interface CompletionFactView { id: OpaqueId; outputId: OpaqueId; criterionId?: OpaqueId; status: "active" | "superseded" | "revoked"; statement: string; rationale: string; evidenceIds: OpaqueId[]; decisionIds: OpaqueId[]; createdAt: EpochMs }
    interface RiskDispositionView { id: OpaqueId; issueId: OpaqueId; action: "accept" | "reject"; scope: string; rationale: string; evidenceIds: OpaqueId[]; createdAt: EpochMs }
    interface TerminationView { outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed"; reason: string; endedAt: EpochMs; decisionIds: OpaqueId[]; completionFactIds: OpaqueId[]; unresolvedQuestionIds: OpaqueId[]; unresolvedIssueIds: OpaqueId[]; unclosedContributionIds: OpaqueId[] }
    interface ArchiveView { id: OpaqueId; status: "pending" | "complete" | "failed"; createdAt: EpochMs; publicSnapshotVersion: number; includedPublicationIds: OpaqueId[]; includedDecisionIds: OpaqueId[]; includedCompletionFactIds: OpaqueId[] }
    interface ManagerPlanView { id: OpaqueId; agendaId: OpaqueId; managerId: OpaqueId; basedOnPublicationId?: OpaqueId; kind: "open_round" | "continue_agenda" | "stop_agenda" | "raise_agenda_candidate" | "wait_for_required_identity"; rationale: string; blockingReason?: string; status: "active" | "superseded" | "completed"; createdAt: EpochMs }
    interface TaskView { id: OpaqueId; assigneeId: OpaqueId; agendaId?: OpaqueId; title: string; status: "open" | "claimed" | "completed" | "cancelled" | "expired"; authorizationId: OpaqueId; authorizationStatus: "active" | "revoked" | "expired"; attempt: number; reassignedFromTaskId?: OpaqueId; deadlineAt?: EpochMs; result?: string; exitReason?: string; startedAt?: EpochMs; completedAt?: EpochMs }
    interface PrivateMailView { id: OpaqueId; senderId: OpaqueId; recipientId: OpaqueId; agendaId?: OpaqueId; body: string; relatedIds: OpaqueId[]; sendContextPublicationUpperBound: OpaqueId[]; processingContextPublicationUpperBound?: OpaqueId[]; status: "queued" | "processing" | "completed" | "timed_out" | "cancelled"; deadlineAt: EpochMs; createdAt: EpochMs; processingStartedAt?: EpochMs; completedAt?: EpochMs; failureReason?: string }
    type AllowedControl = MeetingActionV1["kind"];

evidencePackages/evidenceReviews 的普通 contributor 投影只含已在 Publication.finalVersionIds/finalReviewIds 中公开的当前版，以及自己同轮已登记的当前版和针对它已送达的审核；Manager 能处理本轮各包，指定 reviewer 只额外读取被分配的当前版、对应审核和固定 Round baseline。其他 contributor 的本轮未公开版与审核从数组中完全省略，不能仅隐藏正文而泄露存在性、资料 ID 或评分。旧版本留在聚合审计历史，不是公共当前版投影。

```ts
interface MarkdownProjectionInputV1 {
  meetingId: OpaqueId; committedVersion: number;
  publicPublications: PublicationView[]; formalMessages: FormalMessageView[];
  decisions: DecisionView[]; questions: QuestionView[]; issues: IssueView[];
  termination?: TerminationView; archive?: ArchiveView;
}
```

Markdown 异步从已提交 snapshot 生成；生成、映射、写入、替换、清理失败只产生诊断，不改变 Meeting state、receipt 或 result。它不含私信、Session、capability、未审 Evidence、tool trace 或隐藏推理。

## Persistence And Effects

```ts
interface MeetingCommitV1 {
  meetingId: OpaqueId; expectedVersion: number; nextState: MeetingStateRecordV1;
  receipt: ReceiptRecordV1; facts: CommittedFactRecordV1[]; outbox: OutboxEffectRecordV1[];
}
type MeetingStateRecordV1 = MeetingState; // exact lossless JSON codec of meeting/domain aggregate
interface CommittedFactRecordV1 {
  factId: OpaqueId; kind: MeetingActionV1["kind"]; actorId: OpaqueId;
  occurredAt: EpochMs; meetingVersion: number; relatedIds: OpaqueId[];
  resultingState: MeetingStateRecordV1;
}
interface ReceiptRecordV1 {
  receiptId: OpaqueId; meetingId: OpaqueId; principalId: OpaqueId; requestId: OpaqueId;
  actionKind: MeetingActionV1["kind"]; normalizedPayloadHash: string;
  result: MeetingCommandAcceptedV1; committedVersion: number; createdAt: EpochMs;
}
interface OutboxEffectRecordV1 {
  id: OpaqueId; meetingId: OpaqueId; committedVersion: number;
  kind: "refresh" | "session_mail" | "agent_notice" | "review_delivery" | "markdown_projection" | "archive";
  payload: OutboxPayloadV1; status: "pending" | "delivered" | "failed"; attempts: number;
  createdAt: EpochMs; deliveredAt?: EpochMs; lastFailure?: string;
}
type OutboxPayloadV1 =
  | { kind: "refresh"; meetingId: OpaqueId; committedVersion: number }
  | { kind: "session_mail"; mailId: OpaqueId; recipientId: OpaqueId; contextPublicationUpperBound: OpaqueId[] }
  | { kind: "agent_notice"; noticeKind: "meeting_started" | "transcript_update" | "opportunity_request" | "opportunity_disposition" | "hand_request" | "hand_disposition" | "format_disposition" | "review_request"; meetingId: OpaqueId; recipientId: OpaqueId; agendaId: OpaqueId; publicMessageId?: OpaqueId; relatedId?: OpaqueId; disposition?: "accepted" | "rejected" | "deferred"; reason?: string; missingFields?: EvidenceFieldName[] }
  | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId }
  | { kind: "markdown_projection"; meetingId: OpaqueId; committedVersion: number }
  | { kind: "archive"; archiveId: OpaqueId; meetingId: OpaqueId };
```

`MeetingStateRecordV1` 是 Domain `MeetingState` 的无损序列化；`CommittedFactRecordV1` 是带 `factId, kind, actorId, occurredAt, meetingVersion, relatedIds, resultingState` 的追加事实。Repository 的 `commit` 必须原子保存 state、receipt、facts 和 outbox，结果只能是 accepted、version_conflict 或 unavailable；不得部分确认。outbox payload 只能包含最小效果输入，不含私有草稿正文、secrets 或隐藏推理。`agent_notice` 只提示已提交公开消息或私有格式/举手处置；dispatcher 投递前重新验证 recipient 的会议 Session ownership 与 active 状态，重复效果使用同一个 effect ID，投递成功不推断 Agent 已申请或提交。

## Compatibility And Acceptance

V1 不适配 legacy Turn、Attempt、贡献 DTO、tool 名、URL 或持久格式。本轮 `MeetingActionV1`、`MeetingViewV1` 和目标存储尚未实现或对外发布，因此本次在首个 V1 实现之前收敛了旧草案的 format/review discriminant，不需要 legacy 兼容或双写。V1 首次发布后，可增加 optional read field；改变 required field、enum 语义、授权、幂等键、效果语义或 fact 意义必须引入新版本并明确迁移读写策略；未知 action 必须 fail closed。

1. TypeScript 实现可从本文声明每个 command、result、error 和 port，而无需 untyped 业务 payload。
2. 每个 action 具有唯一 discriminant、确定字段、角色边界、原子成功结果和拒绝条件。
3. 调用方不能提交 actor、authority、baseline、timer 或派生完成值。
4. Repository 测试可证明 commit/replay 原子性，adapter 测试可证明 refresh 仅通知、读取严格过滤。

## Related Documents

- [Domain Design](../30-designs/DOMAIN-DESIGN.md)
- [Meeting Design](../30-designs/MEETING-DESIGN.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [DSH Role Interface](./DSH-ROLE-INTERFACE.md)
