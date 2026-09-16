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

除非另有说明，全部 action 只能在非 `terminal|archiving|archived` Meeting 执行。所有 `reason`、`rationale`、`text`、`title`、`question`、`description`、`body`、`instructions` 均为去首尾空白后的非空字符串；引用数组不得重复。引用数组默认不得为空；`RecordQuestion` 和 `RecordIssue` 的 affected/required reviewer 数组允许单组为空，但 blocking 必须满足下述明确的非空关联或 high 风险条件。

```ts
type MeetingActionV1 =
  | CreateMeeting | PauseMeeting | ResumeMeeting | EndMeeting
  | ActivateAgenda | RaiseAgendaCandidate | DisposeAgendaCandidate
  | RecordQuestion | ResolveQuestion | RecordIssue | DisposeIssue
  | OpenRound | RaiseHand | DisposeHandRaise | SubmitEvidence | RegisterEvidence
  | SubmitReview | RecordReviewDelivery | RespondToReview | RaiseSupplementHand | DisposeSupplementHand | SubmitSupplement
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
interface RecordIssue { kind: "record_issue"; agendaId: OpaqueId; description: string; riskLevel: "low" | "medium" | "high"; classification: "blocking" | "follow_up" | "pending_discussion" | "out_of_scope"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[]; requiredReviewerIds: OpaqueId[]; blocking: boolean; rationale: string }
interface DisposeIssue { kind: "dispose_issue"; issueId: OpaqueId; status: "resolved" | "deferred" | "out_of_scope"; rationale: string; evidenceIds: OpaqueId[] }
interface RecommendIdentity { kind: "recommend_identity"; definitionId: OpaqueId; definitionVersion: string; catalogId: OpaqueId; catalogVersion: string; agendaId: OpaqueId; rationale: string; expectedContribution: string; evidenceGap: string }
interface DisposeIdentityRecommendation { kind: "dispose_identity_recommendation"; recommendationId: OpaqueId; disposition: "accepted" | "rejected"; rationale: string }
```

`create_meeting` 仅允许可信 local Convener，且 Runtime 已完成 role definition/session preflight。`dispose_identity_recommendation` 仅 Captain 可用；accepted 的 result 仅在 Definition admission 和 Session ownership 都成功后含新 identityId。

### Round, evidence and review

```ts
interface OpenRound { kind: "open_round"; agendaId: OpaqueId; deadlineAt?: EpochMs }
interface RaiseHand { kind: "raise_hand"; roundId: OpaqueId; purpose: string }
interface DisposeHandRaise { kind: "dispose_hand_raise"; roundId: OpaqueId; contributorId: OpaqueId; disposition: "accepted" | "rejected" | "deferred"; reason: string }
interface SubmitEvidence { kind: "submit_evidence"; contributionId: OpaqueId; evidence: EvidenceInput }
interface RegisterEvidence { kind: "register_evidence"; versionId: OpaqueId; status: "complete" | "needs_correction" | "deferred"; missingFields: EvidenceFieldName[]; rationale: string }
interface SubmitReview { kind: "submit_review"; versionId: OpaqueId; dimensions: ReviewDimensionsInput; scope: string }
interface RecordReviewDelivery { kind: "record_review_delivery"; reviewId: OpaqueId; status: "sent" | "failed"; failureReason?: string }
interface RespondToReview { kind: "respond_to_review"; contributionId: OpaqueId; reviewId: OpaqueId; response: string }
interface RaiseSupplementHand { kind: "raise_supplement_hand"; contributionId: OpaqueId; responseToReviewId: OpaqueId; purpose: string }
interface DisposeSupplementHand { kind: "dispose_supplement_hand"; contributionId: OpaqueId; responseToReviewId: OpaqueId; disposition: "accepted" | "rejected" | "deferred"; reason: string }
interface SubmitSupplement { kind: "submit_supplement"; contributionId: OpaqueId; responseToReviewId: OpaqueId; evidence: EvidenceInput; rationale: string }
interface CloseContribution { kind: "close_contribution"; contributionId: OpaqueId; exit: "withdrawn" | "submission_missing" | "timed_out" | "supplement_rejected"; reason: string }
interface PublishRound { kind: "publish_round"; roundId: OpaqueId }
interface AbortRound { kind: "abort_round"; roundId: OpaqueId; reason: string }
type EvidenceFieldName = "observation" | "interpretation" | "method" | "falsifiers" | "uncertainties" | "limitations" | "claims" | "materials";
```

`RegisterEvidence` 的 missingFields 在 `complete` 时必须为空，在 `needs_correction` 时必须非空；`deferred` 必有 rationale。Review delivery 仅可信 effect dispatcher 可提交：sent 不带 failureReason，failed 必带。deadline handler 只能使用 `CloseContribution` 且 Runtime 必须验证 deadline 已到。

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
  originalSource: string; version: string; locator: string; location: string;
  verificationConditions: string; limitations: string; sharedDependencies: string[]; reason?: string;
}
interface ReviewDimensionsInput { source: ReviewDimensionInput; credibility: ReviewDimensionInput; completeness: ReviewDimensionInput; support: ReviewDimensionInput }
interface ReviewDimensionInput { score: 0 | 1 | 2 | 3 | "unable_to_assess"; reason: string }
```

每个 claim 至少引用一个本 evidence 的 material。kind 为 unknown/not_applicable 时必须给出 reason；Runtime 从 Round 注入固定 `baselinePublicationIds`，请求不得提供它。reviewer 不能审核作者 identity 的版本，且只能审核当前、已 complete 的版本。

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

Any authorized Meeting identity may use `record_question` and `record_issue`. Only an identity with the `captain` role may use `resolve_question` and `dispose_issue`; local controller may use none of these four actions. A caller that does not meet this role boundary is rejected as `UNAUTHORIZED` under the fixed error precedence; a permitted caller whose target is absent or whose state precondition fails is rejected by the subsequent `NOT_FOUND`, `INVALID_STATE`, or `PRECONDITION_FAILED` check.

`RecordIssue` 的四组 affected/required reviewer ID 数组必须显式存在，可为空但不可含重复 ID；它们分别引用本 Meeting 的 `ObjectiveContract.requiredOutputs`、`acceptanceCriteria`、`hardConstraints` 和目标 Agenda 的 `requiredReviewerIds`。调用者不得提交 `accepted_risk`，也不得用 `blocking=false` 表示风险已接受；`accepted_risk` 只由合法 `dispose_risk` accept 写入持久 Issue。`blocking=true` 仅在至少一个受影响的必要产出、验收条件或硬约束尚未满足，或至少一个该 Agenda 的必需审核者被明确关联，或该 Issue 为尚未接受的 `high` 风险时有效；无此资格而请求 blocking 必须拒绝，不能从自由文本推断影响或填补默认 `riskLevel`。在 `record_issue` 创建 open Issue 时，未接受的 `high` 风险必须 `blocking=true`；`classification="blocking"` 与 `blocking=true` 必须成对，其他分类必须 `blocking=false`。不匹配的 caller 字段拒绝而非自动改写；终结处置可以把 blocking 清零并保留原 classification 作为历史分类，deferred 不改变旧分类或 blocking。

`resolve_question` 仅从 `open|deferred` 进入 `answered|withdrawn|deferred`：`answered|withdrawn` 置 `blocking=false`，`deferred` 保留旧 blocking。`dispose_issue` 仅从 `open|deferred` 进入 `resolved|deferred|out_of_scope`：`resolved|out_of_scope` 置 `blocking=false`，`deferred` 保留旧 blocking。终结处置后的重复处置拒绝；暂缓不等于解决或接受风险，未接受 high Issue 不能借 `deferred` 清除阻塞。处置 actor、时间、理由、证据、目标旧/新 status 与 blocking 只写入一次不可变 committed fact payload；当前 Question/Issue 只保存 status/blocking，不复制处置历史。receipt 仅用于幂等，不是唯一审计来源。

A DecisionCandidate is accepted only when it names the current ProposalRevision and its evidence/positions are visible, valid and meeting-local. Decide accepts exactly one such candidate. Supersede requires replacementCandidateId and atomically accepts it, creates its Decision and marks the old accepted Decision superseded; revoke must not contain replacementCandidateId. Candidate reject/revoke does not exist. Risk accept/reject checks the exact Issue, its riskLevel against acceptableRiskLevel, hard constraints, Issue status, lifecycle, non-empty rationale and meeting-local evidence; accept updates only that Issue to accepted_risk and non-blocking, reject keeps it open and blocking.

RaiseSupplementHand is author-only after a sent review delivery and explicit response. DisposeSupplementHand is Manager-only; accepted is permitted only while the current version is fully reviewed and substantiveSupplementCount is below two. SubmitSupplement requires that exact accepted supplement hand, consumes it atomically, increments the count once and creates a new version for fresh registration/review. Rejected/deferred supplement requests create no new EvidenceVersion and do not mean withdrawal. SubmitCompletionDeclaration is participant-only: it creates an immutable declaration but never changes output, criterion, Agenda, lifecycle or completion status. RecordCompletionFact may consume a declaration only after authorization, public-evidence, required-review and risk checks pass.

ContinuationInput is accepted only for a new Meeting when local controller selects an immutable, caller-visible ArchivePackage and a distinct non-empty subset of its exported material IDs. It imports copies with sourceArchiveId/sourceMaterialId provenance; it never imports old Meeting ID, identity, Session, capability, full transcript, task, mail or running state.

PlanNextStep is Manager-only and is rejected while a Round is open; a new plan supersedes the current active plan for its Agenda. CreateTask requires the caller's active authorization and matching context. ReassignTask is local-controller-only, atomically revokes the old authorization and creates a replacement task; all later commands against the revoked task return PRECONDITION_FAILED. ExpireTask and ExpirePrivateMail are deadline-handler-only and require the respective persisted deadline to be no later than Runtime clock. StartPrivateMail is a trusted dispatcher action and is rejected if the recipient owns a claimed formal Contribution or another processing mail. It fixes the processing-visible Publication range; retries never recompute it. StartArchive is local-controller-only from terminal and atomically materializes the ArchivePackage before archiving; RecordArchiveSessionResult is trusted session-owner-only. Any failed Session close leaves lifecycle archiving and rejects discussion; archived is entered only after every meeting-owned Session reports closed.

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

`InitialIdentityInput.agendaResponsibilityIds` 与 `reviewResponsibilityIds` 的元素均是本 Meeting 的 `AgendaItem.id`，未知 Agenda ID 拒绝；review responsibility 仅对同时具有 `evidence_reviewer` role 的 identity 合法。已物化 `MeetingIdentity.id` 与 `AgendaItem.requiredReviewerIds`（元素为 identityId）须和 identity 的 reviewResponsibilityIds 双向一致，不能从 displayName、Definition 或自然语言补出责任。初始 caller 输入的 reviewer identityId 解析/映射尚未由本 Interface 固定，不由纯 Domain validator 切片实现或猜测；create/admission 切片须在分配 identityId、建立 Agenda refs 前补正式契约。

`dispose_agenda_candidate` 的 promoted 分支不得清空或改写 caller 提交的 `promotedAgenda.requiredReviewerIds`；同一目标转换须将 pending candidate 标 promoted、append 完整 pending Agenda，并向每个所列、已存在且有 `evidence_reviewer` role 的 MeetingIdentity.reviewResponsibilityIds append 新 Agenda.id。任一 reviewer/role/引用失败须整条拒绝，不提交半个 Agenda、candidate 状态或 identity 责任；不授予新 role 或改变当前 active Agenda。park/reject 不改变身份责任。

## Results, Errors And Precedence

```ts
type MeetingCommandResultV1 = MeetingCommandAcceptedV1 | MeetingCommandRejectedV1;
interface MeetingCommandAcceptedV1 {
  kind: "accepted"; meetingId: OpaqueId; committedVersion: number; receiptId: OpaqueId;
  factIds: OpaqueId[];
  effects: Array<{ id: OpaqueId; kind: "refresh" | "session_mail" | "review_delivery" | "markdown_projection" | "archive"; status: "queued" }>;
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
  agenda: AgendaView[]; rounds: RoundView[]; publications: PublicationView[];
  messages: FormalMessageView[]; outcomes: OutcomeView; managerPlans: ManagerPlanView[]; tasks: TaskView[];
  privateMail: PrivateMailView[]; controls: AllowedControl[];
}
interface RefreshNoticeV1 { kind: "refresh"; meetingId: OpaqueId; committedVersion: number }
```

各 `*View` 为 Domain 同名实体的 caller-filtered DTO，保留稳定 ID 以支持下一命令；它们不得增加可写业务字段。普通 participant 永不读取他人私信、未审版本、未分配 review、Session/ownership/capability、decision candidate 或 Captain-only risk disposition。controls 仅是提示，Runtime 仍是唯一授权者。

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
    interface RoundView { id: OpaqueId; agendaId: OpaqueId; status: "open" | "published" | "aborted"; baselinePublicationIds: OpaqueId[]; openedAt: EpochMs; deadlineAt?: EpochMs; publicationId?: OpaqueId; contributions: ContributionView[] }
    interface ContributionView { id: OpaqueId; contributorId: OpaqueId; status: "preparing" | "format_correction" | "registered" | "under_review" | "awaiting_response" | "withdrawn" | "submission_missing" | "timed_out" | "supplement_rejected" | "closed"; packageId?: OpaqueId; substantiveSupplementCount: number; exitReason?: string }
    interface PublicationView { id: OpaqueId; roundId: OpaqueId; seq: number; finalVersionIds: OpaqueId[]; finalReviewIds: OpaqueId[]; exitReasons: string[]; publishedAt: EpochMs }
    interface FormalMessageView { id: OpaqueId; seq: number; actorId: OpaqueId; agendaId: OpaqueId; kind: string; body: string; publicationId: OpaqueId; relatedIds: OpaqueId[]; createdAt: EpochMs }
interface DecisionCandidateView { id: OpaqueId; proposalRevisionId: OpaqueId; outcome: "adopt" | "reject" | "defer"; rationale: string; evidenceIds: OpaqueId[]; positionIds: OpaqueId[]; createdAt: EpochMs }
interface DecisionView { id: OpaqueId; candidateId: OpaqueId; proposalRevisionId: OpaqueId; status: "accepted" | "superseded" | "revoked"; outcome: "adopt" | "reject" | "defer"; rationale: string; evidenceIds: OpaqueId[]; positionIds: OpaqueId[]; createdAt: EpochMs }
    interface QuestionView { id: OpaqueId; agendaId: OpaqueId; text: string; blocking: boolean; status: "open" | "answered" | "withdrawn" | "deferred"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[] }
    interface IssueView { id: OpaqueId; agendaId: OpaqueId; description: string; riskLevel: "low" | "medium" | "high"; classification: "blocking" | "follow_up" | "pending_discussion" | "accepted_risk" | "out_of_scope"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[]; requiredReviewerIds: OpaqueId[]; blocking: boolean; status: "open" | "resolved" | "deferred" | "out_of_scope"; rationale: string }
    interface OutcomeView { decisions: DecisionView[]; completionFacts: CompletionFactView[]; riskDispositions: RiskDispositionView[]; pendingDecisionCandidates?: DecisionCandidateView[]; termination?: TerminationView }
    interface CompletionFactView { id: OpaqueId; outputId: OpaqueId; criterionId?: OpaqueId; status: "active" | "superseded" | "revoked"; statement: string; rationale: string; evidenceIds: OpaqueId[]; decisionIds: OpaqueId[]; createdAt: EpochMs }
    interface RiskDispositionView { id: OpaqueId; issueId: OpaqueId; action: "accept" | "reject"; scope: string; rationale: string; evidenceIds: OpaqueId[]; createdAt: EpochMs }
    interface TerminationView { id: OpaqueId; outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed"; reason: string; endedAt: EpochMs; decisionIds: OpaqueId[]; completionFactIds: OpaqueId[]; unresolvedQuestionIds: OpaqueId[]; unresolvedIssueIds: OpaqueId[]; unclosedContributionIds: OpaqueId[] }
    interface ArchiveView { id: OpaqueId; status: "pending" | "complete" | "failed"; createdAt: EpochMs; publicSnapshotVersion: number; includedPublicationIds: OpaqueId[]; includedDecisionIds: OpaqueId[]; includedCompletionFactIds: OpaqueId[] }
    interface ManagerPlanView { id: OpaqueId; agendaId: OpaqueId; managerId: OpaqueId; basedOnPublicationId?: OpaqueId; kind: "open_round" | "continue_agenda" | "stop_agenda" | "raise_agenda_candidate" | "wait_for_required_identity"; rationale: string; blockingReason?: string; status: "active" | "superseded" | "completed"; createdAt: EpochMs }
    interface TaskView { id: OpaqueId; assigneeId: OpaqueId; agendaId?: OpaqueId; title: string; status: "open" | "claimed" | "completed" | "cancelled" | "expired"; authorizationId: OpaqueId; authorizationStatus: "active" | "revoked" | "expired"; attempt: number; reassignedFromTaskId?: OpaqueId; deadlineAt?: EpochMs; result?: string; exitReason?: string; startedAt?: EpochMs; completedAt?: EpochMs }
    interface PrivateMailView { id: OpaqueId; senderId: OpaqueId; recipientId: OpaqueId; agendaId?: OpaqueId; body: string; relatedIds: OpaqueId[]; sendContextPublicationUpperBound: OpaqueId[]; processingContextPublicationUpperBound?: OpaqueId[]; status: "queued" | "processing" | "completed" | "timed_out" | "cancelled"; deadlineAt: EpochMs; createdAt: EpochMs; processingStartedAt?: EpochMs; completedAt?: EpochMs; failureReason?: string }
    type AllowedControl = MeetingActionV1["kind"];

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
  payload: CommittedFactPayloadV1;
  resultingState: MeetingStateRecordV1;
}
type CommittedFactPayloadV1 =
  | { kind: "references"; relatedIds: OpaqueId[] }
  | { kind: "question_disposition"; questionId: OpaqueId; oldStatus: "open" | "deferred"; newStatus: "answered" | "withdrawn" | "deferred"; oldBlocking: boolean; newBlocking: boolean; rationale: string; evidenceIds: OpaqueId[] }
  | { kind: "issue_disposition"; issueId: OpaqueId; oldStatus: "open" | "deferred"; newStatus: "resolved" | "deferred" | "out_of_scope"; oldBlocking: boolean; newBlocking: boolean; rationale: string; evidenceIds: OpaqueId[] };
interface ReceiptRecordV1 {
  receiptId: OpaqueId; meetingId: OpaqueId; principalId: OpaqueId; requestId: OpaqueId;
  actionKind: MeetingActionV1["kind"]; normalizedPayloadHash: string;
  result: MeetingCommandAcceptedV1; committedVersion: number; createdAt: EpochMs;
}
interface OutboxEffectRecordV1 {
  id: OpaqueId; meetingId: OpaqueId; committedVersion: number;
  kind: "refresh" | "session_mail" | "review_delivery" | "markdown_projection" | "archive";
  payload: OutboxPayloadV1; status: "pending" | "delivered" | "failed"; attempts: number;
  createdAt: EpochMs; deliveredAt?: EpochMs; lastFailure?: string;
}
type OutboxPayloadV1 =
  | { kind: "refresh"; meetingId: OpaqueId; committedVersion: number }
  | { kind: "session_mail"; mailId: OpaqueId; recipientId: OpaqueId; contextPublicationUpperBound: OpaqueId[] }
  | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId }
  | { kind: "markdown_projection"; meetingId: OpaqueId; committedVersion: number }
  | { kind: "archive"; archiveId: OpaqueId; meetingId: OpaqueId };
```

`MeetingStateRecordV1` 是 Domain `MeetingState` 的无损序列化；`CommittedFactRecordV1` 是带 `factId, kind, actorId, occurredAt, meetingVersion, payload` 的追加事实。`resolve_question` 必须使用 `question_disposition` payload，`dispose_issue` 必须使用 `issue_disposition` payload；其它 action 使用最小 `references` payload，不得复制私信正文、Session、凭据或隐藏推理。Repository 的 `commit` 必须原子保存 state、receipt、facts 和 outbox，结果只能是 accepted、version_conflict 或 unavailable；不得部分确认。outbox payload 只能包含最小效果输入，不含 secrets 或隐藏推理。当前 `ArchivePackageV1` 未表示 Question/Issue 处置事实的引用或内容；其归档映射须由后续 archive 切片在进入 archived 前补齐，不能把 Repository 事实保存当作已归档。

## Compatibility And Acceptance

V1 不适配 legacy Turn、Attempt、贡献 DTO、tool 名、URL 或持久格式。可增加 optional read field；改变 required field、enum 语义、授权、幂等键、效果语义或 fact 意义必须引入新版本并明确迁移读写策略；未知 action 必须 fail closed。

1. TypeScript 实现可从本文声明每个 command、result、error 和 port，而无需 untyped 业务 payload。
2. 每个 action 具有唯一 discriminant、确定字段、角色边界、原子成功结果和拒绝条件。
3. 调用方不能提交 actor、authority、baseline、timer 或派生完成值。
4. Repository 测试可证明 commit/replay 原子性，adapter 测试可证明 refresh 仅通知、读取严格过滤。

## Related Documents

- [Domain Design](../30-designs/DOMAIN-DESIGN.md)
- [Meeting Design](../30-designs/MEETING-DESIGN.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [DSH Role Interface](./DSH-ROLE-INTERFACE.md)
