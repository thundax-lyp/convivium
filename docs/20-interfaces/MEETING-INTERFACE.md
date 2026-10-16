# Meeting Interface

## Purpose And Ownership

本文是 Meeting 的唯一跨边界类型契约。它定义写命令、读投影、提交记录、Remote 刷新和 Markdown 输入；领域字段与不变量以 [Domain Design](../30-designs/DOMAIN-DESIGN.md) 为准，转换顺序以 [Meeting Design](../30-designs/MEETING-DESIGN.md) 为准。

DSH/Remote transport 提供可信 caller binding；Meeting Runtime 是唯一业务写入者；Repository 原子保存 Runtime 交付的提交包；projection 只读已提交状态。请求体不得包含 actorId、roles、Session ID、ownership、baseline、authority、当前时间或任何可由 Runtime 推导的字段。当前契约的 `meetingId` 在 Convivium Host/profile Storage Domain 内全局唯一，是 Meeting、catalog、receipt、outbox、Session ownership 与恢复的唯一 Meeting namespace；协议和持久化 port 均不存在 `teamId`。未来多 Team 不是当前契约的兼容扩展，必须以新契约定义 authority、隔离与迁移。

## Wire Conventions

所有 JSON 字段使用 lowerCamelCase；时间是 Unix epoch milliseconds 的安全整数；ID 是不透明、非空字符串；数组字段始终存在且元素按写入顺序排列。领域 ID 不可互换。除结构化 Captain `create_meeting` 明确拒绝内部身份字段和其它未知字段外，未知字段可以忽略；未知 discriminant、缺失必填字段、null 替代非 null 字段、错误 ID 类型或无效枚举返回 `INVALID_ARGUMENT`。

```ts
type EpochMs = number;
type OpaqueId = string;
interface MeetingCommand {
  protocolVersion: 1;
  meetingId: OpaqueId; // createMeeting 时必须为 "new"
  expectedMeetingVersion?: number; // create_meeting 为 0；SubmitEvidenceReview 禁止携带；其余 action 必填
  requestId: OpaqueId;
  action: MeetingAction;
}
interface CaptainMeetingCommand {
  protocolVersion: 1;
  meetingId: OpaqueId;
  expectedMeetingVersion?: number;
  requestId: OpaqueId;
  action: CaptainMeetingAction;
}
interface CallerBinding {
  channel:
    | "dsh_tool"
    | "loopback_remote"
    | "skill_invocation"
    | "runtime_recovery"
    | "deadline_handler";
  principalId: OpaqueId;
  sessionBindingId?: OpaqueId;
}
```

`CallerBinding` 只由可信 adapter 传给 Runtime。当前单 Host 单用户的 Captain 就是本地用户；结构化控制入口为已受 loopback Host 边界约束的 `conviviumMeetings.control`，adapter 固定注入 `{channel:"loopback_remote",principalId:"local-controller"}`，不设置 sessionBindingId。用户提交结构化 `CaptainMeetingCommand`；Session、actor、authority 和内部身份引用不接受 wire payload 提交。显式 `/convivium` Skill 是另一条受限的可信用户入口：DSH `agent/pre-step` 只接受直接用户消息、核对可由用户调用的已部署 Skill，并为该输入 Session 的当前 turn 发出单次授权；`convivium_start_meeting` 从 `/convivium <目标>` 的原始用户文字构造内部 `CreateMeeting`，`convivium_cancel_meeting` 从 `/convivium cancel <meetingId> <原因>` 构造指定会议的 `cancelled` 终止命令，两者仅在消费各自授权后以 `{channel:"skill_invocation",principalId:"local-controller"}` 提交。普通自然语言、Agent 文本和没有对应授权的工具调用不形成 Captain 权限。

`create_meeting` 接受上述两个可信用户入口；`end_meeting` 的 `cancelled` 结果还可由上述显式取消 Skill 提交，其它 Captain 控制 action 只接受结构化用户入口。普通 DSH Agent tool caller 一律拒绝；pause/resume/end 同属用户控制，start_archive 与归档结果仍由 Runtime 执行。关闭创建时的聊天 Session、重新打开面板或 Host 冷重启，不改变用户对当前 Host 内 Meeting 的控制权限；不引入 Session 权限转移或多用户身份系统。结构化创建先校验角色名称并转换为内部身份引用；内部创建命令通过完整引用校验后、Definition/session preflight 前，以 `meetingIdFor(requestId)` 的 canonical hash 生成真实 meetingId，不混入 caller、Session、随机值或 teamId。Skill 入口的 requestId 由已接受的直接用户消息 ID 派生，不能由模型选择。receipt 键为 `(meetingId,principalId,requestId)`；同键同规范化 payload 返回原结果，不同 payload 返回 IDEMPOTENCY_CONFLICT。可信入口授权先于 receipt 查找。

Repository 的私有 bootstrap 保存创建来源 `creator`，它是审计来源，不是每场 Meeting 的 Session 授权锁。`sourceSessionId` 仅允许可信 Host 用户输入 adapter 从实际用户输入上下文提供；当前面板 control 和 Skill 创建入口均不写入该字段。模型参数和 wire payload 不能补填此字段；缺席不影响创建或后续控制。`captainActorId` 精确为 `"captain_actor-" + sha256Hex(encodeCanonicalJson([meetingId,"captain_actor","captain"])).slice(0,32)`；Domain 用户操作使用 `{kind:"captain_user",id:captainActorId}`，公开事实与归档不含 Session ID，不进入 MeetingState.identities。

```ts
interface MeetingBootstrap {
  status: "creating" | "ready" | "creation_failed";
  createRequestId: OpaqueId;
  requestHash: string;
  creator: {
    kind: "local_user";
    principalId: "local-controller";
    sourceSessionId?: OpaqueId;
  };
  createResult?: MeetingCommandAccepted;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  failureCode?: string;
}
```

创建事务写入 creating、createRequestId、requestHash、creator 和 Runtime createdAt=updatedAt=now；所选初始身份的 ownership 全 active 才进入 ready 并保存 createResult。ready 前失败进入 creation_failed、保存安全 failureCode，先 revoke 再清理已创建 Session；creator 创建后不可修改。重放先授权用户入口，再按 requestId/hash 与已有创建记录/receipt 定位，复用原 descriptor 与所有 ID，不重新预检生成 TTL。用户关闭输入 Session 不删除或使该记录失效。

每个生产 Agent command tool 的 arguments 根对象直接使用本节的完整 `MeetingCommand` envelope，并把该 tool 唯一允许的 action shape 投影为模型可见的精确 object schema；不得额外包装 `input`、`arguments` 或 JSON string，也不得只暴露无结构 `json`、依赖 Skill 文本让模型猜测嵌套字段。tool schema 负责调用前的结构可见性与基础参数校验，`MeetingCommandSchema` 和 action schema 仍是 wire 解析真相源，Runtime 继续独立执行 caller、版本、幂等和领域授权校验。DSH Host 中的全局 tool 注册只表示可发现的实现入口，不表示任何 Meeting role 获得调用权；Meeting Definition 必须按角色收窄模型可见工具面，Runtime 对所有实际调用再次 fail closed。

## Command Action Union

除非另有说明，全部 action 只能在非 `terminal|archiving|archived` Meeting 执行。所有 `reason`、`rationale`、`text`、`title`、`question`、`description`、`body`、`instructions` 均为去首尾空白后的非空字符串；引用数组不得重复。引用数组默认不得为空；`RecordQuestion` 和 `RecordIssue` 的 affected 数组允许单组为空，但 blocking 必须满足下述明确的非空关联、`requiresEvidenceReview` 或 high 风险条件。

```ts
type MeetingAction =
  | CreateMeeting
  | PauseMeeting
  | ResumeMeeting
  | EndMeeting
  | ActivateAgenda
  | RaiseAgendaCandidate
  | DisposeAgendaCandidate
  | RecordQuestion
  | ResolveQuestion
  | RecordIssue
  | DisposeIssue
  | OpenRound
  | RaiseHand
  | DeclineHand
  | ExpireRoundParticipation
  | DisposeHandRaise
  | SubmitEvidence
  | ClaimEvidenceReview
  | FailEvidenceValidation
  | RecordContributionFailure
  | SubmitEvidenceReview
  | RecordReviewDelivery
  | CloseContribution
  | PublishRound
  | AbortRound
  | DisposeRisk
  | RecordCompletionFact
  | ChangeCompletionFact
  | PlanNextStep
  | StartArchive
  | RecordArchiveSessionResult
  | RecommendIdentity
  | RecordIdentityAdmissionResult;
```

### Lifecycle, agenda and planning

```ts
interface CreateMeeting {
  kind: "create_meeting";
  objective: ObjectiveInput;
  identities: InitialIdentityInput[];
  managerIdentityKey: OpaqueId;
  evidenceReviewerIdentityKey: OpaqueId;
  initialAgenda: InitialAgendaInput[];
  initialActiveAgendaId: OpaqueId;
  limits: MeetingLimitsInput;
  continuation?: ContinuationInput;
}
interface CaptainCreateMeeting {
  kind: "create_meeting";
  objective: ObjectiveInput;
  participantRoleNames?: string[]; // 省略等价于 []
  initialAgenda: CaptainInitialAgendaInput[];
  initialActiveAgendaId: OpaqueId;
  limits: MeetingLimitsInput;
  continuation?: ContinuationInput;
}
interface PauseMeeting {
  kind: "pause_meeting";
  reason: string;
}
interface ResumeMeeting {
  kind: "resume_meeting";
  reason: string;
}
interface EndMeeting {
  kind: "end_meeting";
  outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
  reason: string;
  completionFactIds: OpaqueId[];
  unresolvedQuestionIds: OpaqueId[];
  unresolvedIssueIds: OpaqueId[];
}

interface ActivateAgenda {
  kind: "activate_agenda";
  agendaId: OpaqueId;
  previousDisposition: "completed" | "deferred" | "closed";
  reason: string;
}
interface RaiseAgendaCandidate {
  kind: "raise_agenda_candidate";
  title: string;
  reason: string;
  sourceMessageId?: OpaqueId;
}
interface DisposeAgendaCandidate {
  kind: "dispose_agenda_candidate";
  candidateId: OpaqueId;
  disposition: "promoted" | "parked" | "rejected";
  reason: string;
  promotedAgenda?: AgendaInput;
}
interface RecordQuestion {
  kind: "record_question";
  agendaId: OpaqueId;
  text: string;
  affectedOutputIds: OpaqueId[];
  affectedCriterionIds: OpaqueId[];
  affectedConstraintIds: OpaqueId[];
  blocking: boolean;
}
interface ResolveQuestion {
  kind: "resolve_question";
  questionId: OpaqueId;
  status: "answered" | "withdrawn" | "deferred";
  rationale: string;
  evidenceIds: OpaqueId[];
}
interface RecordIssue {
  kind: "record_issue";
  agendaId: OpaqueId;
  description: string;
  riskLevel: "low" | "medium" | "high";
  classification:
    "blocking" | "follow_up" | "pending_discussion" | "out_of_scope";
  affectedOutputIds: OpaqueId[];
  affectedCriterionIds: OpaqueId[];
  affectedConstraintIds: OpaqueId[];
  requiresEvidenceReview: boolean;
  blocking: boolean;
  rationale: string;
}
interface DisposeIssue {
  kind: "dispose_issue";
  issueId: OpaqueId;
  status: "resolved" | "deferred" | "out_of_scope";
  rationale: string;
  evidenceIds: OpaqueId[];
}
interface RecommendIdentity {
  kind: "recommend_identity";
  candidateId: OpaqueId;
  definitionId: OpaqueId;
  catalogId: OpaqueId;
  catalogVersion: string;
  agendaId: OpaqueId;
  decision: "admit" | "reject";
  rationale: string;
  expectedContribution: string;
  evidenceGap: string;
}
interface RecordIdentityAdmissionResult {
  kind: "record_identity_admission_result";
  recommendationId: OpaqueId;
}
```

`EndMeeting` 由当前 Manager 以 `completed|partial|no_consensus` 正常收口，或由可信 loopback Captain 以 `cancelled|failed` 异常终止；已消费显式取消授权的 Skill 入口只能提交 `cancelled`。其它 actor/outcome 组合返回 `UNAUTHORIZED` 且不写入。`stop_agenda` 只是 Manager 的计划事实，不指定后续任务，也不隐式触发 `EndMeeting`；其提交另行生成面向 Manager 的 `agenda_stopped` notice，供其重新读取当前会议并扫描后续工作。各路径均要求没有 open Round、非空理由、三组 ID 与当前 active CompletionFact、open/deferred Question 和 Issue 的顺序与内容精确一致，并只写一次 Termination 和归档 effect。`completed` 还要求确定性目标条件满足且没有未收口贡献或未决 Question/Issue；证据不足应以明确限制的 `partial` 或 `no_consensus` 记录，不得伪装完成。

`create_meeting` 仅允许上述可信 loopback 用户入口或已消费当前 turn 一次性创建授权的 Skill 入口，且 Runtime 已完成 role definition/session preflight。`recommend_identity` 仅当前 `running` Meeting Manager 可用；Runtime 在同一 Host Catalog producer 重读 snapshot，要求 catalog/candidate/Definition 引用一致、candidate `available`、Agenda 属于本 Meeting 且 Manager 不能接纳自己。`reject` 原子提交 rejected 事实，不创建 Session。candidate 在本 Meeting 没有 active identity 时，`admit` 原子提交不可调度的 provisioning 意图和一次 `identity_provision` effect；`record_identity_admission_result` 仅由 Runtime outbox/recovery 在验证该意图和 Session owner 结果后使用，不能由 Agent 或 loopback caller 提交。该结果只有在 Definition/preflight、Session 和 durable ownership 都成功时才能原子激活普通可选 identity；失败原子记载安全 failureCode 且无 identity。candidate 已有 active identity 时，另一 Agenda 的合法 `admit` 原子新增独立 active recommendation，复用原 recommendation 的 identityId、sessionId、definitionId 和 definitionHash，并以本次决定的 Runtime now 写入 createdAt/resolvedAt；不产生 `identity_provision` effect，不新增 identity，也不改变角色、授权或 capability。复用请求的 Definition provenance 必须与既有 active recommendation 精确一致，否则返回 `PRECONDITION_FAILED`。两个动作均使用原 Meeting version/idempotency/终态拒写边界；同一 `candidateId + agendaId` 已有 provisioning 或 active recommendation 时不能再次准入，同一 candidate 尚有 provisioning recommendation 时其他 Agenda 也不能准入。`end_meeting` 在自身终态提交中把尚在 provisioning 的意图标为 `failed/ADMISSION_CONFLICT`，effect dispatcher 在创建前后重验 lifecycle 并清理已创建但未激活的 Session；不得在终态激活身份。

`ResumeMeeting` 只允许可信 local controller 恢复普通 paused Meeting。若 pause reason 是不可恢复的 message budget exhausted，返回 `LIMIT_EXCEEDED` 且不写 state、receipt、effect 或 version；此时只允许保持暂停或 `EndMeeting`。

`recommend_identity` 缺 Catalog producer、Meeting/snapshot/version 不匹配、candidate 非 available 或目录外时映射 `PRECONDITION_FAILED`；自荐、同一 `candidateId + agendaId` 已有 provisioning/active recommendation，或同 candidate 尚有 provisioning recommendation 时映射 `INVALID_STATE`，不提交 state/fact/receipt/outbox/version；已有 active identity 但 Definition provenance 不一致映射 `PRECONDITION_FAILED`。caller 非 Manager 映射 `UNAUTHORIZED`，expected version 不符映射 `VERSION_CONFLICT`，终态映射 `MEETING_TERMINAL`。成功 `reject` 的 `identityDecision.status` 为 `rejected`；首次成功 `admit` 为 `provisioning`，跨 Agenda 复用 active identity 的成功 `admit` 直接为 `active`，每个决定均有唯一 recommendationId。Session/Definition/preflight 的可判定失败不回滚已提交意图：`record_identity_admission_result` 原子写 `failed` 与 [RoleError](./DSH-ROLE-INTERFACE.md#role-errors-and-authorization) code，返回已提交 `identityDecision.status=failed`；成功时写 `active`、identityId 与 ownership 引用。`identity_provision` 只有该结果 commit 完成后才能标记 delivered；结果 commit 因 Storage 不可用或 version 冲突未完成时保留可重试 effect，重试同一 admissionId，不创建第二 Session/identity。若已创建平级 AgentSession 的 descriptor/ownership 无法证明或持久记录损坏，返回 `RECOVERY_UNAVAILABLE` 并停止该 Meeting 写入，保留 provisioning/outbox；不得把该不确定性提交为普通 `failed` 或创建替代 AgentSession。

### Round, evidence and review

```ts
interface SubmitManagerPlan {
  kind: "submit_manager_plan";
  agendaId: OpaqueId;
  planKind:
    | "open_round"
    | "continue_agenda"
    | "stop_agenda"
    | "raise_agenda_candidate"
    | "wait_for_required_identity";
  roundGoal?: { question: string; evidenceGap: string; expectedOutput: string };
  rationale: string;
  blockingReason?: string;
}
interface OpenRound {
  kind: "open_round";
  agendaId: OpaqueId;
  planId: OpaqueId;
  deadlineAt?: EpochMs;
}
interface RaiseHand {
  kind: "raise_hand";
  roundId: OpaqueId;
  purpose: string;
}
interface DeclineHand {
  kind: "decline_hand";
  roundId: OpaqueId;
  reason: string;
}
interface ExpireRoundParticipation {
  kind: "expire_round_participation";
  roundId: OpaqueId;
  contributorId: OpaqueId;
}
interface DisposeHandRaise {
  kind: "dispose_hand_raise";
  roundId: OpaqueId;
  contributorId: OpaqueId;
  disposition: "accepted" | "rejected" | "deferred";
  reason: string;
}
interface SubmitEvidence {
  kind: "submit_evidence";
  contributionId: OpaqueId;
  evidence: EvidenceInput;
}
interface ClaimEvidenceReview {
  kind: "claim_evidence_review";
  sourceEffectId: OpaqueId;
  roundId: OpaqueId;
  versionId: OpaqueId;
}
interface FailEvidenceValidation {
  kind: "fail_evidence_validation";
  roundId: OpaqueId;
  claimId: OpaqueId;
  reason: "review_timeout" | "review_interrupted" | "dispatch_failed";
}
interface RecordContributionFailure {
  kind: "record_contribution_failure";
  contributionId: OpaqueId;
  sourceEffectId: OpaqueId;
  stage: string;
  failureCode: string;
  failureSummary: string;
  attemptCount: number;
  retryable: boolean;
}
interface SubmitEvidenceReview {
  kind: "submit_evidence_review";
  roundId: OpaqueId;
  claimId: OpaqueId;
  versionId: OpaqueId;
  dimensions: ReviewDimensionsInput;
  scope: string;
}
interface RecordReviewDelivery {
  kind: "record_review_delivery";
  reviewId: OpaqueId;
  status: "sent" | "failed";
  failureReason?: string;
}
interface CloseContribution {
  kind: "close_contribution";
  contributionId: OpaqueId;
  exit: "withdrawn" | "submission_missing";
  reason: string;
}
interface PublishRound {
  kind: "publish_round";
  roundId: OpaqueId;
}
interface AbortRound {
  kind: "abort_round";
  roundId: OpaqueId;
  reason: string;
}
```

`record_review_delivery(sent)` 立即把已登记 Contribution 置 `closed` 并记 `review_delivered`，无送达后等待或本轮补证；失败送达不结算。

`SubmitEvidence` 只由 Contribution 作者提交准备公开的内容。`summary` 必须是非空作者观点摘要，与完整证据同版本受审核；轮末以摘要原文生成 `FormalMessage.body`，不删除完整证据、不合并作者或改变消息预算。Runtime 原子校验结构、必填字段、引用、caller、Contribution 授权和期限；任一失败不写 EvidencePackage、EvidenceVersion、Registration、Review、receipt、outbox 或 Meeting version。首份合法提交创建 ordinal 1 和 complete Registration，已有登记版本不可在本轮更新。Manager 不接收草稿、hash 或证据正文，也没有格式审批 action。Review delivery 仅可信 effect dispatcher 可提交：sent 不得带 failureReason，failed 必须携带 trim 后非空 failureReason。deadline handler 可使用 `CloseContribution` 或 `ExpireRoundParticipation`，Runtime 必须验证相应 deadline 已到。


`Round.invitedContributorIds` 固定开轮时负责该 Agenda 的全部 Contributor，`participationResponses` 记录每位受邀者一次 `raised|declined|no_response` 选择。举手或拒绝必须早于 `min(openedAt+taskDeadlineMs, deadlineAt?)`；可信 deadline handler 仅在期限到达后写 `no_response`。Manager/Captain 可读全部选择，Contributor 只读自己的选择。

`RaiseHand` 成功时只在 MeetingState 增加 `(roundId, caller contributorId)` 的 pending request，收到重复 pending、本轮已记录选择或已有 Contribution 返回 `PRECONDITION_FAILED`；`DisposeHandRaise` 只处理这条 pending request。accepted 原子移除 pending 并创建 Contribution；rejected/deferred 原子移除 pending、返回申请者理由，不创建 Contribution，也不在 MeetingView 留存该次举手。追加 command fact 可保留审计，不构成当前 Meeting 举手记录。

`DisposeHandRaise` accepted 前须验证 `state.messages.length + 全部 open Round 已接纳 Contribution 数 + 1 <= limits.maxFormalMessages`，并为新 Contribution 保留一个 FormalMessage 名额；拒绝或暂缓不预留。预留从 Contribution 创建起持续到所属 Round `published|aborted`，不因 Contribution 进入 `withdrawn|submission_missing|execution_failed|aborted|closed` 等终态提前释放；Round published 时相应 FormalMessage 已计入 `state.messages`，Round aborted 才无消息地释放预留。`PublishRound` 只统计 FormalMessage，整批发布后的总数不得超过上限，Publication、举手和系统通知不计数。名额损坏、竞态或持久状态不一致导致整批放不下时返回 `PRECONDITION_FAILED`，不得合并作者记录、删除完整证据仅保留摘要或部分发布；UI/Markdown 折叠不改变领域计数。发布提交必须在加入整批公开事实后重算完成条件：若恰好达到上限且条件满足，同一提交进入 converging；若恰好达到上限但条件不满足，同一提交进入 paused 并以 message budget exhausted 为原因，之后只能保持暂停或由 local controller 结束，不能恢复后继续接纳或开轮。

```ts
// 提交必须提供非空作者摘要。
interface EvidenceInput {
  summary: string;
  observation: string;
  interpretation: string;
  method: string;
  falsifiers: TextWithReason[];
  uncertainties: TextWithReason[];
  limitations: TextWithReason[];
  claims: EvidenceClaimInput[];
  materials: MaterialInput[];
}
interface TextWithReason {
  value: string;
  reason?: string;
}
interface EvidenceClaimInput {
  id: OpaqueId;
  statement: string;
  materialIds: OpaqueId[];
  qualification: string;
}
interface MaterialInput {
  id: OpaqueId;
  kind:
    | "document"
    | "dataset"
    | "experiment"
    | "observation"
    | "tool_output"
    | "unknown"
    | "not_applicable";
  originator: string;
  originalSource: string;
  sourcePublishedAt: string;
  acquiredAt: string;
  version: string;
  locator: string;
  location: string;
  verificationConditions: string;
  limitations: string;
  sharedDependencies: string[];
  reason?: string;
}
interface ReviewDimensionsInput {
  source: ReviewDimensionInput;
  credibility: ReviewDimensionInput;
  completeness: ReviewDimensionInput;
  support: ReviewDimensionInput;
}
interface ReviewDimensionInput {
  score: 0 | 1 | 2 | 3 | "unable_to_assess";
  scope: string;
  reason: string;
  baselineEvidenceIds: OpaqueId[];
}
```

`falsifiers`、`uncertainties`、`limitations`、`claims`、`materials` 各至少一项；每个 `TextWithReason.value` 必须非空，填写“无”或“未知”时必须有非空 `reason`，不能由公开模板替作者生成缺项理由。每个 claim 至少引用一个本 evidence 的 material。kind 为 unknown/not_applicable 时必须给出 reason；Runtime 从 Round 注入固定 `baselinePublicationIds`，请求不得提供它。每维 `scope` 与 `reason` 均须非空；每维 `baselineEvidenceIds` 只可引用固定 baseline 中 Publication.finalVersionIds 所列的版本；未引用上一轮依据时数组明确为 []，不能用本轮其他证据补入。reviewer 不能审核作者 identity 的版本，且只能审核当前、已 complete 的版本。

Meeting 的 `evidenceReviewerId` 指向唯一专职 evidence_reviewer identity；该身份的 roles 必须精确为 `["evidence_reviewer"]`。每个 immutable EvidenceVersion 都携带 `status`、`failureCount` 和可选 `lastFailureReason`：新版本为 `submitted/0`；`ClaimEvidenceReview` 以普通 Meeting version CAS 为一个 current、complete 版本创建独立 `EvidenceReviewClaim` 并置为 `validating`；claim 记录 `claimId`、`sourceEffectId`、`roundId`、reviewerId、versionId、claimedAt 和由 `reviewDeadlineMs` 派生的 expiresAt。同一 version 同时只能有一个 claim，不限制同一 Round 的其它 version 独立认领。reviewer coordinator 只调用一次 `convivium_run_review_worker` 把该 version 交给一个 DSH 原生 one-shot worker；工具 arguments 为 `{input: {meetingId, versionId}}`，不接受 prompt、claimId 或审核字段。Runtime 在启动前重验 active claim、reviewer ownership，从持久 MeetingState 构造 immutable version 与固定公开 baseline，并在模型之外捕获 claimId 和 roundId；缺少有效 claim 或绑定时返回 `REVIEWER_CONFLICT`，不启动 worker。工具固定使用 `spawn` provider、无工具权限的 child 与本节 `ReviewDimensionsInput` 对应的 object-rooted output schema；Runtime 再校验 structured object 的完整 schema、非空业务字段及精确 versionId，不容忍额外字段。第一轮各维 `baselineEvidenceIds: []` 合法。

worker 未 completed、version 不匹配或结构无效分别返回 `{kind: "failed", code: "REVIEW_WORKER_NOT_COMPLETED" | "REVIEW_WORKER_VERSION_MISMATCH" | "REVIEW_WORKER_OUTPUT_INVALID"}`，不调用提交；取消时不提交，所有取得的 worker run 均须 dispose。合法结果由 Runtime 直接构造 `SubmitEvidenceReview`，使用启动前捕获的 claimId/roundId、原 reviewer caller 和 `requestId = evidence-review:${claimId}`，不携带 `expectedMeetingVersion`，不改用后来创建的 claim。工具直接返回应用层的 `MeetingCommandResult`：`accepted` 表示已原子提交的 receipt，`rejected` 表示未接纳，不返回供 coordinator 转抄的 Review object。模型工具面不注册 `convivium_submit_evidence_review`；内部 action 契约保留。

`SubmitEvidenceReview` 只由 Runtime 在该 reviewer caller 权限下提交，必须携带所属 `roundId`、未过期 `claimId` 和精确 `versionId`，不得携带全局 `expectedMeetingVersion`。应用层提交时重验 caller ownership、claim、版本仍是 current、complete、`validating` 且没有最终 Review，以及每维的固定 baseline 引用；不绕过事务、权限或并发保护。成功时原子追加一份 Review、把版本置为 `validated`、移除 claim 并创建 delivery effect。0 分、负面意见和 `unable_to_assess` 仍是 `validated`。`FailEvidenceValidation` 只消费精确 claim，把版本置为 `validation_failed`、递增 `failureCount` 并记录 `review_timeout | review_interrupted | dispatch_failed`；`failureCount < 5` 才能重新认领。相同 submit requestId 重放返回原 receipt；其它覆盖同一 version 的 effect 在有效 claim 存在时去重完成，原 source effect 延后到 expiresAt。已观察到 coordinator turn 完成而无 Review 且原 claim 仍有效时立即记 `dispatch_failed`；未观察到 turn 结束时，claim 保留到 expiresAt，再以 `review_timeout` 失败；冷恢复从持久 EvidenceStatus、claim 与 Review 继续。

`RecordContributionFailure` 只允许可信 `runtime_recovery` caller 在已接纳但尚无 EvidencePackage 的 Contribution 上执行。Runtime 只在观察到承接已接纳 `hand_disposition` 消息的确切 Contributor turn 以异常结束后提交；转换把 Contribution 置为 `execution_failed`，同时固化 `{sourceEffectId,stage,failureCode,failureSummary,attemptCount,retryable,occurredAt}`，其中 `sourceEffectId` 是触发该 turn 的 outbox effect，`occurredAt` 由 Runtime 时钟注入。该结构是执行失败证据，不是 EvidenceVersion，不触发 Review；相同 source effect 在失败事实已提交但 outbox delivered 尚未提交时直接幂等完成，不再次唤醒 Agent；其它重复或已有 package 的记录拒绝。若这使 Round 全部 Contribution 终态，转换同事务生成 `round_ready`。

Meeting 从 running 暂停时，所有 `submitted | validating` 版本转为 `validation_cancelled` 并移除 claim，不增加 failureCount、不写 lastFailureReason；旧 review request 完成而不在暂停期间轮询。恢复时为这些 current、complete 版本重新创建 review request，重新领取后回到 `validating`。暂停前旧 turn 的迟到提交因 claim 已不存在返回 `REVIEWER_CONFLICT`。Outbox delivered/failed 只表示运输结果，不改变 EvidenceStatus，也不得提前耗尽 EvidenceVersion 的固定失败预算；ReviewDelivery 只描述已形成 Review 向作者的送达。

已接纳但还没有登记证据的 Contribution 的准备期限为 acceptedAt + limits.taskDeadlineMs，并与存在的 Round.deadlineAt 取最早值；期限到达后可信 deadline handler 才能记录 submission_missing，绝不造空包。当前版审核或 ReviewDelivery 尚未成功时，不能据作者沉默正常 PublishRound；reviewDeadlineMs 到达须报告未审/未送达包并交由后续异常轮次处置，不把该包视为最终已审。

`AbortRound` 只允许Captain（本地用户） 在 `running` Meeting 对 open Round 执行并提供非空 reason；`preparing|paused|converging|ending` 返回 `INVALID_STATE`，`terminal|archiving|archived` 返回 `MEETING_TERMINAL`，不得隐式 resume 或改变原 lifecycle。成功时原子把全部未终态 Contribution 关闭为 aborted exit、移除该 Round 的 pending hand raises 和消息预算预留、把 Round 置 `aborted`，不创建 Publication/FormalMessage；已登记 EvidenceVersion、Review、ReviewDelivery 保留为非公开审计事实。Meeting 保持 running 且预算允许时可再开 Round；预算已耗尽时 `OpenRound` 拒绝，只能 pause 或按明确 outcome end。

`MaterialInput.originator`、`originalSource`、`sourcePublishedAt`、`acquiredAt`、`version`、`locator`、`location`、`verificationConditions`、`limitations` 均须非空；sourcePublishedAt/acquiredAt 不适用或无法获知时填写“未知”或“不适用”并给出非空 reason，不得删字段或代填时间。原始作者/机构不明时 originator=“未知”且给出 reason。Runtime 只做上述确定性校验；来源真实性、可访问性、完整性和观点支撑由 evidence reviewer 评价。

`sourceEffectId` 由 dispatcher 从当前 outbox effect 注入并持久化；只有该原始 effect 在有效期内重投时保持 retryable，覆盖同一 version 的其它 effect 直接去重完成。这样重复通知不会形成写竞争，而原 effect 在进程崩溃后仍能等到 claim 过期并重新认领。

### Deliberation, outcome

```ts
interface DisposeRisk {
  kind: "dispose_risk";
  issueId: OpaqueId;
  action: "accept" | "reject";
  scope: string;
  rationale: string;
  evidenceIds: OpaqueId[];
}
interface RecordCompletionFact {
  kind: "record_completion_fact";
  outputId: OpaqueId;
  criterionId?: OpaqueId;
  statement: string;
  rationale: string;
  evidenceIds: OpaqueId[];
}
interface ChangeCompletionFact {
  kind: "change_completion_fact";
  factId: OpaqueId;
  status: "superseded" | "revoked";
  rationale: string;
  replacement?: Omit<RecordCompletionFact, "kind">;
}
interface PlanNextStep {
  kind: "plan_next_step";
  agendaId: OpaqueId;
  planKind:
    | "open_round"
    | "continue_agenda"
    | "stop_agenda"
    | "raise_agenda_candidate"
    | "wait_for_required_identity";
  rationale: string;
  blockingReason?: string;
}
interface StartArchive {
  kind: "start_archive";
}
interface RecordArchiveSessionResult {
  kind: "record_archive_session_result";
  sessionOwnershipId: OpaqueId;
  status: "closed" | "failed";
  failureReason?: string;
}
```

`DisposeRisk|RecordCompletionFact|ChangeCompletionFact` 只在 lifecycle=`running` 接受。它们在 `paused|preparing|converging|ending` 返回 `INVALID_STATE`，在 `terminal|archiving|archived` 返回 `MEETING_TERMINAL`；当前契约不通过这些 action 从 `converging` 重新打开 Meeting。

Captain 是当前单 Host 的本地用户，负责创建、候选议题处置/手工议题激活、Question/Issue 处置、RiskDisposition、CompletionFact、abort Round 及暂停/恢复/异常终止。原 local controller 是同一用户入口的实现名称，不是另一个权限角色。Manager 可通过 `activate_agenda` 激活已有 pending Agenda，并打开/发布正常 Round、处置 hand、推荐并判断正常结束，不读取 evidence draft、代作者提交 evidence 或审核正文。Contributor 提交自己的 evidence；Captain 不提交 Contributor 贡献。唯一专职 reviewer 只读取待审证据并逐版本提交 Review。

### Captain Control Surface

结构化控制统一经 `CaptainMeetingCommand`；loopback 用户控制经 `conviviumMeetings.control`，下表是用户可提交的 action 闭集。除了 `create_meeting` 使用 `CaptainCreateMeeting`，其它 action 与内部 `MeetingCommand` 同形。旧 `convivium_create_meeting` Agent tool 保持移除；`convivium_start_meeting` 只消费 `/convivium <目标>` 的一次性授权。`convivium_cancel_meeting` 只消费 `/convivium cancel <meetingId> <原因>` 的一次性授权，从最新可信 Meeting 读取结果构造 `cancelled` 命令，并使用独立 `skill_invocation` caller provenance。两者参数均为 `{}`，不能执行其它 Captain action；普通对话和 Meeting-owned Agent 不取得授权。用户 read/list 使用已有 loopback Remote，投影由 Runtime 授权。参数保持本接口的 action 字段、版本、幂等和领域前置，不增加任意 json wrapper。

```ts
type CaptainMeetingAction =
  | CaptainCreateMeeting
  | ActivateAgenda
  | DisposeAgendaCandidate
  | ResolveQuestion
  | DisposeIssue
  | AbortRound
  | DisposeRisk
  | RecordCompletionFact
  | ChangeCompletionFact
  | PauseMeeting
  | ResumeMeeting
  | EndMeeting;
```

`CaptainCreateMeeting.participantRoleNames` 是可选的 Contributor 角色显示名称数组，省略时由 schema 规范化为 `[]`。名称必须与已装载 Definition 的唯一 `displayName` 精确匹配，数组不得重复，也不得选择 `meeting_manager` 或 `verification_reviewer`；Definition 配置本身不得有重复 `displayName`。adapter 自动补齐 Manager、Reviewer 和内部 `identityKey/definitionId`，所选 Contributor 均为 `required:true`、`riskAuthority:false` 并负责全部初始议题。`CaptainInitialAgendaInput.ownerRoleName` 若存在，必须命中 Manager、Reviewer 或本次已选择 Contributor 的显示名称，并转换为内部 `ownerIdentityKey`。未知、未选中或歧义名称返回 `PRECONDITION_FAILED`，不调用应用创建、不分配 Meeting/identity ID、不创建 Session 或持久事实。Captain wire 上出现 `identities`、`managerIdentityKey`、`evidenceReviewerIdentityKey` 或其它未知创建字段返回 `INVALID_ARGUMENT`。

`convivium_start_meeting` 的 arguments 精确为空对象，目标取斜杠后的非空原始用户文字，且一次输入最多提交一次。适配器补齐 Manager、Reviewer 和 Host `initialContributorRoleIds` 选中的 Contributor 初始身份的 `convivium.<role>` Definition、全部 `required:true`、唯一 Manager 和 Evidence Reviewer、一个 `initial` pending active Agenda；一个 `primary` 必需产出是完成原始目标，一个 `verifiable` 验收条件要求可核验的产出、依据和剩余限制，一个 `evidence` 硬约束禁止把未经验证的推断当作事实。默认 `acceptableRiskLevel=low`；`maxFormalMessages=200`、`maxDurationMs=86400000`、`taskDeadlineMs=3600000`、`reviewDeadlineMs=900000`。这些是创建时固化的保守默认值，不表示目标已完成或风险已接受。缺失 Skill、目标为空、非直接用户来源、已消费授权或 Meeting-owned Session 均拒绝创建；模型不能通过工具参数改写上述字段。

| 用户操作          | action schema                     | 来源              |
| ----------------- | --------------------------------- | ----------------- |
| 创建会议          | CaptainCreateMeeting              | loopback 本地用户 |
| 手工激活议题      | ActivateAgenda                    | loopback 本地用户 |
| 处置议题候选      | DisposeAgendaCandidate            | loopback 本地用户 |
| 解决问题          | ResolveQuestion                   | loopback 本地用户 |
| 处置 Issue        | DisposeIssue                      | loopback 本地用户 |
| 中止轮次          | AbortRound                        | loopback 本地用户 |
| 处置风险          | DisposeRisk                       | loopback 本地用户 |
| 记录完成事实      | RecordCompletionFact              | loopback 本地用户 |
| 替换/撤销完成事实 | ChangeCompletionFact              | loopback 本地用户 |
| 暂停/恢复         | PauseMeeting / ResumeMeeting      | loopback 本地用户 |
| 异常终止          | EndMeeting（`cancelled\|failed`） | loopback 本地用户 |

`start_archive` 与 `record_archive_session_result` 继续为 Runtime recovery 操作；Manager 正常结束或 Captain 异常终止命令触发现有归档链。用户控制不得取得 Contributor 或 Manager/Reviewer 权限，Agent 不得凭“用户让我做”的文字取得控制权限；只有当前 Manager 可通过专用 `convivium_end_meeting` 提交 `completed|partial|no_consensus`。非 loopback 装载不注册本地用户 Remote；无需新增账户、token 或每 Session 授权系统。任一已授权 MeetingIdentity 可 record_question/record_issue，用户只通过 resolve_question/dispose_issue 处置，不冒充身份提交记录。来源不符返回 UNAUTHORIZED 且零 receipt/fact/outbox；已授权请求再检查目标/版本/领域前提。

`RecordIssue` 的三组 affected ID 数组必须显式存在，可为空但不可含重复 ID；它们分别引用本 Meeting 的 `ObjectiveContract.requiredOutputs`、`acceptanceCriteria` 和 `hardConstraints`。`requiresEvidenceReview` 明确表示该 Issue 需要唯一 evidence reviewer 处理，不保存 reviewer ID 数组。调用者不得提交 `accepted_risk`，也不得用 `blocking=false` 表示风险已接受；`accepted_risk` 只由合法 `dispose_risk` accept 写入持久 Issue。`blocking=true` 仅在至少一个受影响目标尚未满足、`requiresEvidenceReview=true` 或该 Issue 为尚未接受的 `high` 风险时有效；无此资格而请求 blocking 必须拒绝，不能从自由文本推断影响或填补默认 `riskLevel`。在 `record_issue` 创建 open Issue 时，未接受的 `high` 风险必须 `blocking=true`；`classification="blocking"` 与 `blocking=true` 必须成对，其他分类必须 `blocking=false`。不匹配的 caller 字段拒绝而非自动改写；终结处置可以把 blocking 清零并保留原 classification 作为历史分类，deferred 不改变旧分类或 blocking。

`resolve_question` 仅从 `open|deferred` 进入 `answered|withdrawn|deferred`：`answered|withdrawn` 置 `blocking=false`，`deferred` 保留旧 blocking。`dispose_issue` 仅在 Meeting `running` 时从 `open|deferred` 进入 `resolved|deferred|out_of_scope`：`resolved|out_of_scope` 置 `blocking=false`，`deferred` 保留旧 blocking；其它非终态 lifecycle 返回 `INVALID_STATE`，终态、`archiving` 和 `archived` 返回 `MEETING_TERMINAL`。这保证清除最后 blocking Issue 与完成重算在同一次 running transition 中完成，不在 paused 期间制造无法合法进入 converging 的快照。终结处置后的重复处置拒绝；暂缓不等于解决或接受风险，未接受 high Issue 不能借 `deferred` 清除阻塞。处置 actor、时间、理由、证据、目标旧/新 status 与 blocking 只写入一次不可变 committed fact payload；当前 Question/Issue 只保存 status/blocking，不复制处置历史。receipt 仅用于幂等，不是唯一审计来源。

Risk accept/reject only accepts an exact `status=open` Issue and checks its riskLevel against acceptableRiskLevel, every hard constraint named by that Issue's `affectedConstraintIds`, lifecycle, non-empty rationale and meeting-local evidence; `resolved|deferred|out_of_scope` is rejected. Accept requires those constraints to be satisfied and updates only that Issue to accepted_risk and non-blocking. Reject is not limited by acceptableRiskLevel and keeps the Issue open and blocking.

`RecordCompletionFact` 由 Captain 在 running Meeting 中提交，独立验证 output/criterion、非空已公开证据及其最终 Review 与成功送达记录；不携带独立提案或决策依据字段。`ChangeCompletionFact` 只处置 active fact：revoke 仅标记目标 revoked；supersede 原子标记旧 fact 为 superseded，并追加一个依据同样完整的新 active fact，其 `supersedesFactId` 固定为旧 fact ID。


ContinuationInput is accepted only for a new Meeting when its authenticated Captain explicitly selects an immutable, caller-visible ArchivePackage and a distinct non-empty subset of exported material IDs whose kind is `published_evidence|formal_message|active_completion_fact`. It imports read-only ContinuationMaterial copies with sourceArchiveId/sourceMaterialId provenance; selecting published evidence atomically includes its Materials, source locators and final Review as one evidence bundle. It never imports old Meeting ID, identity, Session, capability, full transcript, mail, authority, running state or a prior completion conclusion.

PlanNextStep is Manager-only and is rejected while a Round is open; a new plan supersedes the current active plan for its Agenda. StartArchive is runtime-recovery-only from terminal and atomically materializes the ArchivePackage before archiving; RecordArchiveSessionResult is trusted session-owner-only. Any failed Session close leaves lifecycle archiving and rejects discussion; archived is entered only after every meeting-owned Session reports closed.

## Input Components

```ts
interface ObjectiveInput {
  statement: string;
  requiredOutputs: TargetInput[];
  acceptanceCriteria: TargetInput[];
  hardConstraints: TargetInput[];
  acceptableRiskLevel: "low" | "medium" | "high";
}
interface TargetInput {
  id: OpaqueId;
  text: string;
}
interface InitialIdentityInput {
  identityKey: OpaqueId;
  definitionId: OpaqueId;
  displayName: string;
  roles: Array<"manager" | "contributor" | "evidence_reviewer">;
  agendaResponsibilityIds: OpaqueId[];
  riskAuthority: boolean;
  required: boolean;
}
interface InitialAgendaInput {
  id: OpaqueId;
  title: string;
  question: string;
  requiredOutputIds: OpaqueId[];
  ownerIdentityKey?: OpaqueId;
}
interface CaptainInitialAgendaInput {
  id: OpaqueId;
  title: string;
  question: string;
  requiredOutputIds: OpaqueId[];
  ownerRoleName?: string;
}
interface AgendaInput {
  id: OpaqueId;
  title: string;
  question: string;
  requiredOutputIds: OpaqueId[];
  ownerId?: OpaqueId;
}
interface MeetingLimitsInput {
  maxFormalMessages: number;
  maxDurationMs: number;
  taskDeadlineMs: number;
  reviewDeadlineMs: number;
}
interface ContinuationInput {
  sourceArchiveId: OpaqueId;
  selectedMaterialIds: OpaqueId[];
}
```

内部 `CreateMeeting` 的 ID 与 identityKey 必须在请求内唯一，所有引用在 Runtime 分配 Meeting ID 或正式 identity ID 前完成校验；这些字段不属于结构化 Captain wire 契约。

`InitialIdentityInput.agendaResponsibilityIds` 的元素是本 Meeting 的 `AgendaItem.id`；`InitialAgendaInput.ownerIdentityKey`、`CreateMeeting.managerIdentityKey` 和 `CreateMeeting.evidenceReviewerIdentityKey` 引用同一内部请求中的 `InitialIdentityInput.identityKey`。Runtime 完整验证后在同一创建事务中分配正式 identity ID 并重写这些引用；Domain 和 Repository 不再从 displayName、Definition ID、自然语言或数组位置推断引用。managerIdentityKey 必须精确命中唯一 roles=`["manager"]` 的专职身份，evidenceReviewerIdentityKey 必须精确命中唯一 roles=`["evidence_reviewer"]` 的专职身份，其他身份不得包含这两个 role；两 key 缺失、相同、未命中、重复角色或角色不匹配均拒绝且不创建 Meeting。初始身份数量为二加 adapter 实际选择的 Contributor 数量，范围为 2–7，均须绑定精确 Definition ID；Manager 只接受 `meeting_manager`，Reviewer 只接受 `verification_reviewer`，Contributor Definition 不得重复。结构化 Captain adapter 依据本节的唯一显示名称规则选择 0–5 个 Contributor；Skill adapter 依据 Host `initialContributorRoleIds` 选择默认 Contributor。Definition 缺失、指纹或 role 不匹配、preflight 失败均返回 `PRECONDITION_FAILED`，不分配 Meeting/identity ID，不创建 Session 或持久事实。

`dispose_agenda_candidate` 的 promoted 分支须在同一转换中将 pending candidate 标 promoted 并 append 完整 pending Agenda；`AgendaInput.ownerId` 若存在必须直接引用已存在 Meeting identity。任一引用失败须整条拒绝，不提交半个 Agenda 或 candidate 状态；不授予新 role、不改变全局 evidenceReviewerId 或当前 active Agenda。park/reject 不改变身份责任。

## Results, Errors And Precedence

```ts
type MeetingCommandResult = MeetingCommandAccepted | MeetingCommandRejected;
interface MeetingCommandAccepted {
  kind: "accepted";
  meetingId: OpaqueId;
  committedVersion: number;
  receiptId: OpaqueId;
  factIds: OpaqueId[];
  effects: Array<{
    id: OpaqueId;
    kind:
      | "refresh"
      | "agent_notice"
      | "review_delivery"
      | "markdown_projection"
      | "archive"
      | "identity_provision";
    status: "queued";
  }>;
  identityDecision?: {
    recommendationId: OpaqueId;
    decision: "admit" | "reject";
    status: "provisioning" | "rejected" | "active" | "failed";
    identityId?: OpaqueId;
    failureCode?: RoleError["code"];
  };
}
interface MeetingCommandRejected {
  kind: "rejected";
  error: MeetingError;
}
interface MeetingError {
  code:
    | "INVALID_ARGUMENT"
    | "MEETING_NOT_FOUND"
    | "UNAUTHORIZED"
    | "STALE_AUTHORIZATION"
    | "IDEMPOTENCY_CONFLICT"
    | "MEETING_TERMINAL"
    | "VERSION_CONFLICT"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "PRECONDITION_FAILED"
    | "REVIEWER_CONFLICT"
    | "ROUND_NOT_CLOSABLE"
    | "LIMIT_EXCEEDED"
    | "RECOVERY_UNAVAILABLE"
    | "STORAGE_UNAVAILABLE"
    | "INCOMPATIBLE_VERSION";
  message: string;
  currentMeetingVersion?: number;
  targetKind?: string;
  targetId?: OpaqueId;
}
```

本接口的 `MeetingRole` 与 `RoleError["code"]` 引用 [DSH Role Interface](./DSH-ROLE-INTERFACE.md) 的同名定义；Protocol 仅公开该 code union 和角色枚举，不导入 Host adapter 类型。错误优先级固定为：协议结构 → Meeting 可见性 → caller ownership/authorization → requestId binding → terminal/archive → expected version → 对象存在性 → action state/precondition → Domain invariant/limit → storage/recovery。拒绝结果不含 effects、隐藏事实或其他 caller 的版本。

## Meeting Deletion Boundary

删除完成后原 Meeting ID 不得重新创建；原 `create_meeting` requestId 重放在写入新的 creating/bootstrap 或 provisioning 前返回 `INVALID_STATE`。Catalog 的 `deleted` 表只保留以 catalogKey 为键的布尔删除标记，不保存目标、事实、Session ID 或请求内容；该非业务标记在意图提交后、领域清理前写入，并跨冷重启阻止 ID 复用。关闭的 Session 和历史仍保留，不为解决 ID 冲突删除或覆盖它们。

清理未完成的 catalog 意图保留最小 `deletionSummary: { objective, version, lifecycle }`，仅用于显示目标与显式重试；不作为可恢复业务 snapshot。列表将其映射为 `deletionStatus: "deleting"`，Client 显示未完成提示并允许可信用户再次确认同一删除；不开放业务修改、详情恢复或 Session 权限。成功清理后删除该摘要与 catalog 登记，仅保留上述布尔标记。旧意图缺少摘要时不解析残缺 projection，仍由冷启动清理。

MO-FR-19 的删除入口只接受可信本地用户的显式确认，不向 Meeting Agent 或用户 Skill 授予删除权限。服务端重新检查指定会议已终止、无待处理后台工作，且关联 Session 已关闭和撤权；运行中、暂停中和归档清理中的会议拒绝删除。

删除范围为该会议的业务持久记录：catalog 登记、creation、正式事实与状态、证据与审核、归档、receipt、outbox、Session ownership 与 checkpoint。Host 所有的已关闭 Agent/worker Session 及其聊天历史必须保留，不调用 Session 物理删除接口；删除 ownership 后，这些历史 Session 不再取得会议身份权限。普通用户聊天、其它会议和共享配置不受影响。

清理未完成不得返回成功；失败反馈和确认文案必须明确区分会议业务数据与保留的 Session 历史。删除完成后列表和详情不可恢复该会议，包括 Host 冷启动和迟到的 Client 请求结果。

`conviviumMeetings.deleteMeeting(request, signal)` 是独立于 `MeetingAction` 的本地资源删除操作，不追加随后就会被删除的业务 receipt 或 event。输入为严格对象 `{ protocolVersion: 1, meetingId, expectedMeetingVersion }`，不接受 actor、Session ID 或权限字段。服务端在目标 Repository 的写队列内重验版本和删除条件；版本不匹配返回 `rejected / VERSION_CONFLICT`，条件不满足返回 `rejected / PRECONDITION_FAILED`。清理全部完成后返回 `{ kind: "deleted", meetingId }`；目标已不存在时返回同样结果，使网络结果未知后的显式重试幂等。结构错误及存储失败仍按 Remote 错误契约报告，不伪装为成功。

Runtime 为摘要提供可选 `deletionStatus: "allowed" | "active" | "pending_work" | "sessions_open" | "deleting"`：已提交的删除意图仅显示为 deleting 并允许显式重试；普通可恢复会议的终态之外（包括 archiving）为 active；仍有 pending/leased outbox、review claim 或 provisioning intent 为 pending_work；任何 ownership 未 closed/revoked，或任何 identity 缺少匹配的 ownership，为 sessions_open；其余为 allowed。旧摘要缺少此字段时 Client 禁用删除，不能仅从生命周期推断许可。此字段不暴露 Session 标识或私有运行内容。

Catalog 的 `deleting` 是持久删除意图，不是 Meeting lifecycle 或业务 event。写入意图后禁止该会议的新业务读写，先停止其投递和期限扫描，再按公开 Storage Domain 表 API 清理 commits、checkpoint pages/roots/pointer 和 creation，关闭领域句柄，最后删除 catalog 登记。清理失败保留意图；同一删除重试或冷启动仅依据已确认的意图继续清理，不解析不完整的业务 projection，也不重新启动该会议或重验已清除的事实。未写入意图的失败不改变可读数据。目录与业务领域不具备跨域事务，因此不能先移除登记后丢失清理目标。

## Read, Remote And Projection

```ts
interface ListMeetingsRequest {
  protocolVersion: 1;
}
interface MeetingSummary {
  meetingId: OpaqueId;
  version: number;
  objective: string;
  lifecycle:
    | "preparing"
    | "running"
    | "paused"
    | "converging"
    | "ending"
    | "terminal"
    | "archiving"
    | "archived";
  activeAgenda?: { id: OpaqueId; title: string };
  updatedAt: EpochMs;
  unavailableReason?: string;
  deletionStatus?: "allowed" | "active" | "pending_work" | "sessions_open" | "deleting";
}
interface ReadMeetingRequest {
  protocolVersion: 1;
  meetingId: OpaqueId;
}
interface IdentityView {
  id: OpaqueId;
  displayName: string;
  roles: MeetingRole[];
}
interface IdentityRecommendationView {
  id: OpaqueId;
  candidateId: OpaqueId;
  agendaId: OpaqueId;
  decision: "admit" | "reject";
  status: "provisioning" | "rejected" | "active" | "failed";
  rationale: string;
  createdAt: EpochMs;
  identityId?: OpaqueId;
  failureCode?: RoleError["code"];
}
type MeetingEventKind =
  | "meeting.created"
  | "meeting.lifecycle_changed"
  | "agenda.activated"
  | "agenda_candidate.disposed"
  | "manager_plan.recorded"
  | "round.opened"
  | "round.participation_recorded"
  | "hand_raise.recorded"
  | "hand_raise.disposed"
  | "evidence.submitted"
  | "contribution.closed"
  | "contribution.failed"
  | "evidence_review.claimed"
  | "evidence_validation.failed"
  | "evidence_review.submitted"
  | "review_delivery.recorded"
  | "round.published"
  | "formal_message.published"
  | "round.aborted"
  | "identity.recommended"
  | "identity.admission_recorded"
  | "question.disposed"
  | "issue.disposed"
  | "risk.disposed"
  | "completion_fact.recorded"
  | "completion_fact.changed"
  | "meeting.ended"
  | "archive.started"
  | "archive.completed";
type MeetingEventObjectKind =
  | "meeting"
  | "agenda"
  | "agenda_candidate"
  | "manager_plan"
  | "round"
  | "contribution"
  | "evidence_version"
  | "evidence_review"
  | "review_delivery"
  | "publication"
  | "formal_message"
  | "identity_recommendation"
  | "identity"
  | "question"
  | "issue"
  | "completion_fact"
  | "risk_disposition"
  | "termination"
  | "archive";
interface MeetingEventObjectRef {
  kind: MeetingEventObjectKind;
  id: OpaqueId;
}
type EmptyMeetingEventData = Record<string, never>;
interface MeetingEventDataByKind {
  "meeting.created": EmptyMeetingEventData;
  "meeting.lifecycle_changed": {
    from:
      | "preparing"
      | "running"
      | "paused"
      | "converging"
      | "ending"
      | "terminal"
      | "archiving"
      | "archived";
    to:
      | "preparing"
      | "running"
      | "paused"
      | "converging"
      | "ending"
      | "terminal"
      | "archiving"
      | "archived";
    reason?: string;
  };
  "agenda.activated": {
    previousDisposition: "completed" | "deferred" | "closed";
    reason: string;
  };
  "agenda_candidate.disposed": {
    disposition: "promoted" | "parked" | "rejected";
    reason: string;
  };
  "manager_plan.recorded": {
    planKind:
      | "open_round"
      | "continue_agenda"
      | "stop_agenda"
      | "raise_agenda_candidate"
      | "wait_for_required_identity";
    rationale: string;
    blockingReason?: string;
  };
  "round.opened": { deadlineAt?: EpochMs };
  "round.participation_recorded":
    | { contributorId: OpaqueId; status: "declined"; reason: string }
    | { contributorId: OpaqueId; status: "no_response" };
  "hand_raise.recorded": { contributorId: OpaqueId; purpose: string };
  "hand_raise.disposed":
    | {
        contributorId: OpaqueId;
        disposition: "accepted";
        reason: string;
        contributionId: OpaqueId;
      }
    | {
        contributorId: OpaqueId;
        disposition: "rejected" | "deferred";
        reason: string;
      };
  "evidence.submitted": { summary: string };
  "contribution.closed": {
    exit: "withdrawn" | "submission_missing";
    reason: string;
  };
  "contribution.failed": {
    sourceEffectId: OpaqueId;
    stage: string;
    failureCode: string;
    failureSummary: string;
    attemptCount: number;
    retryable: boolean;
  };
  "evidence_review.claimed": { claimId: OpaqueId; sourceEffectId: OpaqueId };
  "evidence_validation.failed": {
    claimId: OpaqueId;
    reason: "review_timeout" | "review_interrupted" | "dispatch_failed";
  };
  "evidence_review.submitted": { claimId: OpaqueId; scope: string };
  "review_delivery.recorded":
    { status: "sent" } | { status: "failed"; failureReason: string };
  "round.published": EmptyMeetingEventData;
  "formal_message.published": { messageKind: string };
  "round.aborted": { reason: string };
  "identity.recommended":
    | { decision: "reject"; status: "rejected"; rationale: string }
    | {
        decision: "admit";
        status: "provisioning" | "active";
        rationale: string;
      };
  "identity.admission_recorded":
    { status: "active" } | { status: "failed"; failureCode: string };
  "question.disposed": {
    status: "answered" | "withdrawn" | "deferred";
    rationale: string;
  };
  "issue.disposed": {
    status: "resolved" | "deferred" | "out_of_scope";
    rationale: string;
  };
  "risk.disposed": {
    action: "accept" | "reject";
    scope: string;
    rationale: string;
  };
  "completion_fact.recorded": {
    outputId: OpaqueId;
    statement: string;
    rationale: string;
  };
  "completion_fact.changed":
    | { status: "superseded"; rationale: string; replacementFactId: OpaqueId }
    | { status: "revoked"; rationale: string };
  "meeting.ended": {
    outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
    reason: string;
  };
  "archive.started": { status: "complete" };
  "archive.completed": { status: "complete" };
}
type MeetingEventView = {
  [K in MeetingEventKind]: {
    eventSeq: number;
    meetingVersion: number;
    kind: K;
    occurredAt: EpochMs;
    actor:
      | { kind: "captain"; actorId: OpaqueId }
      | { kind: "identity"; actorId: OpaqueId }
      | { kind: "system" };
    subject: MeetingEventObjectRef;
    relatedObjects: MeetingEventObjectRef[];
    data: MeetingEventDataByKind[K];
  };
}[MeetingEventKind];
interface ManagerCatalogView {
  catalogId: OpaqueId;
  catalogVersion: string;
  candidates: Array<{
    candidateId: OpaqueId;
    definitionId: OpaqueId;
    displayName: string;
    availability: "available" | "unavailable";
    meetingRoles: MeetingRole[];
    responsibilitySummary: string;
    capabilitySummary: Array<{
      kind: "preset" | "skill" | "tool" | "mcp";
      label: string;
    }>;
    suitability: Array<{ scope: string; rationale: string }>;
  }>;
}
interface MeetingView {
  executionBlocks?: readonly {
    identityId: string;
    code: "ACP_CODEX_OUTCOME_UNKNOWN" | "ACP_CODEX_RECOVERY_REQUIRED";
    since: number;
    allowedActions: readonly ["pause_meeting", "end_meeting"];
  }[];
  meetingId: OpaqueId;
  version: number;
  objective: ObjectiveView;
  lifecycle: LifecycleView;
  continuation?: ContinuationProvenanceView;
  identities: IdentityView[];
  identityRecommendations?: IdentityRecommendationView[];
  managerCatalog?: ManagerCatalogView;
  agenda: AgendaView[];
  rounds: RoundView[];
  publications: PublicationView[];
  evidencePackages: EvidencePackageView[];
  evidenceValidationStatuses: EvidenceValidationStatusView[];
  evidenceReviews: EvidenceReviewView[];
  reviewDeliveries: ReviewDeliveryView[];
  messages: FormalMessageView[];
  questions: QuestionView[];
  issues: IssueView[];
  outcomes: OutcomeView;
  archive?: ArchiveView;
  managerPlans: ManagerPlanView[];
  timelineEvents?: MeetingEventView[];
  controls: AllowedControl[];
}
interface RefreshNotice {
  kind: "refresh";
  meetingId: OpaqueId;
  committedVersion: number;
}
```

Agent 侧通过 DSH tool `convivium_read_meeting` 读取，arguments 为 `{input:ReadMeetingRequest}`；adapter 必须从 exec.agent 解析 active meeting-owned ownership，并核对 meetingId、identityId、角色与 sessionOwnershipId。Agent 无绑定或跨 Meeting 一律 UNAUTHORIZED，不再有 Captain Session 回退。用户侧通过可信 loopback `conviviumMeetings.read` 获取用户投影；无需 Session。两条路径均不提交 command、不改变 version、不产生 receipt/fact/event/outbox。解析错误 INVALID_ARGUMENT，恢复失败不得返回不完整事实。

`timelineEvents` 对可信 loopback local controller 必须返回，Agent identity projection 必须缺席（因此共享 DTO 字段为 optional，不表示旧数据兼容）；它按 `eventSeq` 升序复制下述安全字段。基础事件排除 private content、Session 和 capability，因此当前唯一接收者可以读取完整事件序列；未来若向普通 identity 开放，必须另行定义 event-level caller filtering，不得复用本契约扩大可见性。`eventSeq` 是 Meeting 内单调递增的 Repository 序号，`(meetingId,eventSeq)` 是唯一身份，不新增 event ID。`occurredAt` 由 application 的一次 `Clock.now()` 注入，同一 command 产生的全部 event 与 fact 使用该值；Repository 不为事件另取发生时间。`meetingVersion` 是该提交的新版本；actor、subject、typed relations 和 `data` 由 Runtime 从可信 caller scope、action、transition result 与提交前后状态生成，caller 不能提交。

一个形成公开 Meeting 事实的成功 command 追加 `0..n` 条基础事件；事件 kind 描述实际发生结果而不是复用 command 名称，一条事件只表达一个 occurrence。一次发布若物化一个 Publication 和多个 FormalMessage，必须分别追加一条 `round.published` 和每个消息各一条 `formal_message.published`；同一次提交发生 lifecycle 变化时另追加 `meeting.lifecycle_changed`。无公开结果的内部 Session ownership 更新可以产生零事件。读取、协议或领域拒绝、version conflict、receipt 重放、outbox claim/lease/delivery、refresh、Session notice 和 Client 交互不追加事件。

`data` 保存该 occurrence 在未来重放时仍需成立的最小不可变值，例如 disposition/status、reason、outcome、failure code 或发生时摘要；不能仅依赖当前 DTO 恢复已被替换、删除或改变的历史。契约明确列出的 `summary`、`statement`、`rationale`、`reason`、`scope` 和失败摘要是允许的最小不可变文本，不等于允许复制完整领域对象。所有 `OpaqueId` 和 string 文本必须非空，`EpochMs` 必须是非负安全整数，`attemptCount` 必须是正安全整数；`meeting.lifecycle_changed.from` 与 `to` 必须不同，discriminated union 中未出现的字段必须缺席。`data` 不保存 milestone、occurrence、title、lane、group status、折叠状态、私信、Session、capability、凭据或隐藏推理。事件 payload 必须按 kind 使用 strict schema，不接受任意扩张字段。`CommittedFactRecord`、事件日志与 outbox 分别负责命令审计、可见发生历史与待投递效果，任何一个都不替代另外两个。

事件数据契约按下表固定；未列字段不得进入对应 `data`。表中的可选字段只有在该次 occurrence 实际存在时出现：

| event kind                     | `subject`               | `data` source                                            |
| ------------------------------ | ----------------------- | -------------------------------------------------------- |
| `meeting.created`              | meeting                 | `MeetingEventDataByKind["meeting.created"]`              |
| `meeting.lifecycle_changed`    | meeting                 | `MeetingEventDataByKind["meeting.lifecycle_changed"]`    |
| `agenda.activated`             | agenda                  | `MeetingEventDataByKind["agenda.activated"]`             |
| `agenda_candidate.disposed`    | agenda_candidate        | `MeetingEventDataByKind["agenda_candidate.disposed"]`    |
| `manager_plan.recorded`        | manager_plan            | `MeetingEventDataByKind["manager_plan.recorded"]`        |
| `round.opened`                 | round                   | `MeetingEventDataByKind["round.opened"]`                 |
| `round.participation_recorded` | round                   | `MeetingEventDataByKind["round.participation_recorded"]` |
| `hand_raise.recorded`          | round                   | `MeetingEventDataByKind["hand_raise.recorded"]`          |
| `hand_raise.disposed`          | round                   | `MeetingEventDataByKind["hand_raise.disposed"]`          |
| `evidence.submitted`           | evidence_version        | `MeetingEventDataByKind["evidence.submitted"]`           |
| `contribution.closed`          | contribution            | `MeetingEventDataByKind["contribution.closed"]`          |
| `contribution.failed`          | contribution            | `MeetingEventDataByKind["contribution.failed"]`          |
| `evidence_review.claimed`      | evidence_version        | `MeetingEventDataByKind["evidence_review.claimed"]`      |
| `evidence_validation.failed`   | evidence_version        | `MeetingEventDataByKind["evidence_validation.failed"]`   |
| `evidence_review.submitted`    | evidence_review         | `MeetingEventDataByKind["evidence_review.submitted"]`    |
| `review_delivery.recorded`     | review_delivery         | `MeetingEventDataByKind["review_delivery.recorded"]`     |
| `round.published`              | publication             | `MeetingEventDataByKind["round.published"]`              |
| `formal_message.published`     | formal_message          | `MeetingEventDataByKind["formal_message.published"]`     |
| `round.aborted`                | round                   | `MeetingEventDataByKind["round.aborted"]`                |
| `identity.recommended`         | identity_recommendation | `MeetingEventDataByKind["identity.recommended"]`         |
| `identity.admission_recorded`  | identity_recommendation | `MeetingEventDataByKind["identity.admission_recorded"]`  |
| `question.disposed`            | question                | `MeetingEventDataByKind["question.disposed"]`            |
| `issue.disposed`               | issue                   | `MeetingEventDataByKind["issue.disposed"]`               |
| `risk.disposed`                | risk_disposition        | `MeetingEventDataByKind["risk.disposed"]`                |
| `completion_fact.recorded`     | completion_fact         | `MeetingEventDataByKind["completion_fact.recorded"]`     |
| `completion_fact.changed`      | completion_fact         | `MeetingEventDataByKind["completion_fact.changed"]`      |
| `meeting.ended`                | termination             | `MeetingEventDataByKind["meeting.ended"]`                |
| `archive.started`              | archive                 | `MeetingEventDataByKind["archive.started"]`              |
| `archive.completed`            | archive                 | `MeetingEventDataByKind["archive.completed"]`            |

Meeting 的首条 `meeting.created` 持久事件 payload 必须含 `{logVersion:1,actor,subject,relatedObjects,data}`；这是事件历史完整标记。该标记存在时，local controller 的 `timelineEvents` 必须包含从 eventSeq 1 到当前最大序号的完整映射；任一序号缺失、kind 未知或 payload 非法使读取返回不可重试的 `RECOVERY_UNAVAILABLE`，不得返回部分数组。缺少完整事件日志的既有测试会议应删除，不提供旧数据识别、兼容或迁移路径。

各 `*View` 为 Domain 同名实体的 caller-filtered DTO，保留稳定 ID 以支持下一命令；它们不得增加可写业务字段。Manager 读取本轮全部 pending hand raises；普通 contributor 只读取自己的 pending hand raise，不能读取他人的申请内容。Manager 可读取本轮 ReviewDelivery 状态；作者只读取自己 EvidenceVersion 的 delivery，唯一 evidence reviewer 读取自己提交的全部 Review delivery。其他普通 participant 不读取未公开版本的 delivery。普通 participant 永不读取未审版本、Session/ownership/capability、Captain-only risk disposition。controls 仅是提示，Runtime 仍是唯一授权者。

Round 的受邀选择在 MeetingView 中向 Captain 和 Manager 显示全部受邀者及状态，普通 Contributor 仅显示自己；尚未选择者由受邀名单减去已记录响应派生。

`IdentityView` 只投影已激活 identity。`IdentityRecommendationView` 只向当前 Manager、Captain（本地用户） 返回；普通 Participant 缺席。`managerCatalog` 仅 Manager 可见，由同一 Host producer 在只读请求时按需生成，缺 producer、非法 snapshot 或暂不可用时缺席，普通 Meeting 读取继续；它不是可写 MeetingState，也不从旧状态缓存。Catalog view 只拷贝 producer 的安全能力标签和适用性摘要，丢弃 `model|sandbox|approval` 类能力；三类 view 均不含 Definition 正文、descriptor、Session、ownership 或 capability 正文/私有配置。

Remote 只暴露 `list()`、`read(request)`、`control(command)`、`subscribeRefresh()`，仅 loopback 可用。断线禁写；重连、focus 或 notice 后必须 read，不自动重试 command 或轮询。notice 可丢失/重复且不携带事实。

    interface ObjectiveView {
      statement: string;
      requiredOutputs: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "unsatisfied" }>;
      acceptanceCriteria: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "unsatisfied" }>;
      hardConstraints: Array<{ id: OpaqueId; text: string; status: "pending" | "satisfied" | "violated" }>;
      acceptableRiskLevel: "low" | "medium" | "high";
    }
    interface LifecycleView { status: "preparing" | "running" | "paused" | "converging" | "ending" | "terminal" | "archiving" | "archived"; changedAt: EpochMs; reason?: string }
    interface AgendaView { id: OpaqueId; title: string; question: string; status: "pending" | "active" | "blocked" | "completed" | "deferred" | "closed"; ownerId?: OpaqueId; requiredOutputIds: OpaqueId[] }
    interface AgendaCandidateView { id: OpaqueId; title: string; reason: string; sourceMessageId?: OpaqueId; status: "pending" | "promoted" | "parked" | "rejected" }
    interface RoundView { id: OpaqueId; agendaId: OpaqueId; planId: OpaqueId; roundGoal: { question: string; evidenceGap: string; expectedOutput: string }; status: "open" | "published" | "aborted"; baselinePublicationIds: OpaqueId[]; openedAt: EpochMs; deadlineAt?: EpochMs; publicationId?: OpaqueId; abortReason?: string; abortedAt?: EpochMs; invitedContributorIds: OpaqueId[]; participationResponses: Array<{ contributorId: OpaqueId; status: "raised" | "declined" | "no_response"; recordedAt: EpochMs }>; pendingHandRaises: PendingHandRaiseView[]; contributions: ContributionView[] }
    interface PendingHandRaiseView { roundId: OpaqueId; contributorId: OpaqueId; purpose: string; raisedAt: EpochMs }
    interface ContributionView { id: OpaqueId; contributorId: OpaqueId; status: "preparing" | "registered" | "under_review" | "withdrawn" | "submission_missing" | "execution_failed" | "aborted" | "closed"; packageId?: OpaqueId; exitReason?: string; failure?: ContributionFailure }
    interface ContributionFailure { sourceEffectId: OpaqueId; stage: string; failureCode: string; failureSummary: string; attemptCount: number; retryable: boolean; occurredAt: EpochMs }
    interface PublicationView { id: OpaqueId; roundId: OpaqueId; seq: number; finalVersionIds: OpaqueId[]; finalReviewIds: OpaqueId[]; exitReasons: string[]; contributionFailures?: Array<{contributionId:OpaqueId;failure:ContributionFailure}>; publishedAt: EpochMs }
    interface EvidencePackageView { id: OpaqueId; roundId: OpaqueId; contributionId: OpaqueId; authorId: OpaqueId; agendaId: OpaqueId; currentVersion: EvidenceVersionView }
    type EvidenceStatus = "submitted" | "validating" | "validated" | "validation_failed" | "validation_cancelled";
    type EvidenceValidationFailureReason = "review_timeout" | "review_interrupted" | "dispatch_failed";
    interface EvidenceValidationStatusView { packageId: OpaqueId; contributionId: OpaqueId; versionId: OpaqueId; status: EvidenceStatus; failureCount: number; lastFailureReason?: EvidenceValidationFailureReason }
    interface EvidenceVersionView { id: OpaqueId; ordinal: number; summary: string; observation: string; interpretation: string; method: string; falsifiers: TextWithReason[]; uncertainties: TextWithReason[]; limitations: TextWithReason[]; claims: EvidenceClaimInput[]; materials: MaterialInput[]; submittedAt: EpochMs; status: EvidenceStatus; failureCount: number; lastFailureReason?: EvidenceValidationFailureReason }
    interface EvidenceReviewView { id: OpaqueId; versionId: OpaqueId; reviewerId: OpaqueId; baselinePublicationIds: OpaqueId[]; scope: string; dimensions: ReviewDimensionsInput; createdAt: EpochMs }
    interface ReviewDeliveryView { id: OpaqueId; reviewId: OpaqueId; authorId: OpaqueId; status: "sent" | "failed"; sentAt?: EpochMs; failedAt?: EpochMs; failureReason?: string }
    interface FormalMessageView { id: OpaqueId; seq: number; actorId: OpaqueId; agendaId: OpaqueId; kind: string; body: string; publicationId: OpaqueId; relatedIds: OpaqueId[]; createdAt: EpochMs }
                    interface QuestionView { id: OpaqueId; actorId: OpaqueId; agendaId: OpaqueId; text: string; blocking: boolean; status: "open" | "answered" | "withdrawn" | "deferred"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[] }
    interface IssueView { id: OpaqueId; actorId: OpaqueId; agendaId: OpaqueId; description: string; riskLevel: "low" | "medium" | "high"; classification: "blocking" | "follow_up" | "pending_discussion" | "accepted_risk" | "out_of_scope"; affectedOutputIds: OpaqueId[]; affectedCriterionIds: OpaqueId[]; affectedConstraintIds: OpaqueId[]; requiresEvidenceReview: boolean; blocking: boolean; status: "open" | "resolved" | "deferred" | "out_of_scope"; rationale: string }
    interface OutcomeView { completionFacts: CompletionFactView[]; riskDispositions: RiskDispositionView[]; termination?: TerminationView }
    interface CompletionFactView { id: OpaqueId; actorId: OpaqueId; outputId: OpaqueId; criterionId?: OpaqueId; status: "active" | "superseded" | "revoked"; statement: string; rationale: string; evidenceIds: OpaqueId[]; createdAt: EpochMs }
    interface RiskDispositionView { id: OpaqueId; actorId: OpaqueId; issueId: OpaqueId; action: "accept" | "reject"; scope: string; rationale: string; evidenceIds: OpaqueId[]; createdAt: EpochMs }
    interface TerminationView { id: OpaqueId; outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed"; reason: string; endedAt: EpochMs; completionFactIds: OpaqueId[]; unresolvedQuestionIds: OpaqueId[]; unresolvedIssueIds: OpaqueId[]; unclosedContributionIds: OpaqueId[] }
    interface ArchiveView {
      id: OpaqueId; status: "pending" | "complete" | "failed"; createdAt: EpochMs; publicSnapshotVersion: number; terminationId: OpaqueId;
      objective: ObjectiveView; agenda: AgendaView[]; agendaCandidates: AgendaCandidateView[];
      publications: PublicationView[]; messages: FormalMessageView[];
      evidenceBundles: Array<{ packageId: OpaqueId; authorIdentityId: OpaqueId; agendaId: OpaqueId; version: EvidenceVersionView; review: EvidenceReviewView }>;
      questions: QuestionView[]; issues: IssueView[]; riskDispositions: RiskDispositionView[];
      questionIssueDispositionFacts: CommittedFactView[]; termination: TerminationView; unresolvedItemIds: OpaqueId[];
      unclosedContributions: UnclosedContributionView[];
      identityProvenance: Array<{ identityId: OpaqueId; displayName: string; roles: MeetingRole[]; definitionId?: OpaqueId; definitionHash?: string }>;
      controlActorProvenance: Array<{ actorId: OpaqueId; kind: "captain" }>;
      exportMaterials: ArchiveMaterialView[];
    }
    interface CommittedFactViewBase { factId: OpaqueId; actorId: OpaqueId; occurredAt: EpochMs; relatedIds: OpaqueId[] }
    type CommittedFactView =
      | (CommittedFactViewBase & { kind: "resolve_question"; payload: Extract<CommittedFactPayload, { kind: "question_disposition" }> })
      | (CommittedFactViewBase & { kind: "dispose_issue"; payload: Extract<CommittedFactPayload, { kind: "issue_disposition" }> });
    interface UnclosedContributionView { contributionId: OpaqueId; contributorIdentityId: OpaqueId; agendaId: OpaqueId; status: ContributionView["status"]; exitReason?: string }
    interface ContinuationProvenanceView { sourceArchiveId: OpaqueId; selectedMaterialIds: OpaqueId[]; materials: ContinuationMaterialView[] }
    interface ContinuationFormalMessageContentView { kind: string; body: string; createdAt: EpochMs }
    interface ContinuationCompletionFactContentView { statement: string; rationale: string; createdAt: EpochMs }
    interface ContinuationReviewDimensionView { score: 0 | 1 | 2 | 3 | "unable_to_assess"; scope: string; reason: string }
    interface ContinuationEvidenceReviewContentView { scope: string; dimensions: { source: ContinuationReviewDimensionView; credibility: ContinuationReviewDimensionView; completeness: ContinuationReviewDimensionView; support: ContinuationReviewDimensionView }; createdAt: EpochMs }
    type ContinuationMaterialView =
      | { kind: "published_evidence"; sourceArchiveId: OpaqueId; sourceMaterialId: OpaqueId; title: string; evidence: { version: EvidenceVersionView; review: ContinuationEvidenceReviewContentView } }
      | { kind: "formal_message"; sourceArchiveId: OpaqueId; sourceMaterialId: OpaqueId; title: string; message: ContinuationFormalMessageContentView }
      | { kind: "active_completion_fact"; sourceArchiveId: OpaqueId; sourceMaterialId: OpaqueId; title: string; completionFact: ContinuationCompletionFactContentView };
    interface ManagerPlanView { id: OpaqueId; agendaId: OpaqueId; managerId: OpaqueId; basedOnPublicationId?: OpaqueId; kind: "open_round" | "continue_agenda" | "stop_agenda" | "raise_agenda_candidate" | "wait_for_required_identity"; rationale: string; blockingReason?: string; status: "active" | "superseded" | "completed"; createdAt: EpochMs }
    type AllowedControl = MeetingAction["kind"];

evidencePackages/evidenceReviews 的普通 contributor 投影只含已在 Publication.finalVersionIds/finalReviewIds 中公开的当前版，以及自己同轮已登记的当前版和针对它已送达的审核。Manager 可读取已发布版本及对应的独立 Review，不读取本轮未发布版本或 Review；其 `evidenceValidationStatuses` 只含当前 version 的 packageId、contributionId、versionId、EvidenceStatus、failureCount 与可选 lastFailureReason，不含本轮证据正文、资料 ID 或评分；其他 caller 得到空数组。唯一 evidence reviewer 读取全部当前待审版本、对应审核和各自固定 Round baseline。其他 contributor 的本轮未公开版与审核从数组中完全省略，不能仅隐藏正文而泄露存在性、资料 ID 或评分。`EvidenceReviewView.reviewerId` 指审核者，`ReviewDeliveryView.authorId` 指反馈接收者（证据作者）；送达不构成作者自行审核。每个 EvidencePackage 只有一个已登记版本。

`ReviewDeliveryView` 保留每次投递尝试：sent 必有 `sentAt` 且无 `failedAt/failureReason`，failed 必有 `failedAt` 与非空 `failureReason` 且无 `sentAt`。它只证明 dispatcher 的该次投递结果，不证明作者已响应或 Review 已公开。

ArchiveView 仅从完整 ArchivePackage 读取，`terminationId` 必须等于 `termination.id`；`unclosedContributions` 按 `termination.unclosedContributionIds` 的顺序逐项物化贡献者、Agenda、终止时状态和退出原因，且两组 ID 必须精确相等，使归档不依赖原 MeetingState 解释未收口项。ArchiveMaterialView 只是可选目录；新 Meeting 的 ContinuationMaterialView 是按值复制的只读内容，保留 sourceArchiveId/sourceMaterialId，但剥离旧 identity、Session、authority 和领域状态。formal_message 和 active_completion_fact 只复制上方显式 content DTO，不保留旧 `agendaId|relatedIds|evidenceIds|outputId|criterionId` 等领域引用；published_evidence 的副本不可拆分地包含 EvidenceVersion、Materials、来源定位和最终 Review 的内容 DTO，不保留旧 `reviewerId|id|versionId|baselinePublicationIds|baselineEvidenceIds` 引用。

```ts
interface MarkdownProjectionInput {
  meetingId: OpaqueId;
  committedVersion: number;
  publicPublications: PublicationView[];
  formalMessages: FormalMessageView[];
  questions: QuestionView[];
  issues: IssueView[];
  termination?: TerminationView;
  archive?: ArchiveView;
}
```

Markdown 异步从已提交 snapshot 生成；生成、映射、写入、替换、清理失败只产生诊断，不改变 Meeting state、receipt 或 result。它不含私信、Session、capability、未审 Evidence、tool trace 或隐藏推理。

## Persistence And Effects

```ts
interface MeetingCommit {
  meetingId: OpaqueId;
  expectedVersion: number;
  nextState: MeetingStateRecord;
  receipt: ReceiptRecord;
  facts: CommittedFactRecord[];
  outbox: OutboxEffectRecord[];
}
type MeetingStateRecord = MeetingState; // exact lossless JSON codec of meeting/domain aggregate
interface CommittedFactRecord {
  factId: OpaqueId;
  kind: MeetingAction["kind"];
  actorId: OpaqueId;
  occurredAt: EpochMs;
  meetingVersion: number;
  relatedIds: OpaqueId[];
  payload: CommittedFactPayload;
  resultingState: MeetingStateRecord;
}
type CommittedFactPayload =
  | { kind: "references"; relatedIds: OpaqueId[] }
  | {
      kind: "question_disposition";
      questionId: OpaqueId;
      oldStatus: "open" | "deferred";
      newStatus: "answered" | "withdrawn" | "deferred";
      oldBlocking: boolean;
      newBlocking: boolean;
      rationale: string;
      evidenceIds: OpaqueId[];
    }
  | {
      kind: "issue_disposition";
      issueId: OpaqueId;
      oldStatus: "open" | "deferred";
      newStatus: "resolved" | "deferred" | "out_of_scope";
      oldBlocking: boolean;
      newBlocking: boolean;
      rationale: string;
      evidenceIds: OpaqueId[];
    };
interface ReceiptRecord {
  receiptId: OpaqueId;
  meetingId: OpaqueId;
  principalId: OpaqueId;
  requestId: OpaqueId;
  actionKind: MeetingAction["kind"];
  normalizedPayloadHash: string;
  result: MeetingCommandAccepted;
  committedVersion: number;
  createdAt: EpochMs;
}
interface OutboxEffectRecord {
  id: OpaqueId;
  meetingId: OpaqueId;
  committedVersion: number;
  kind:
    | "refresh"
    | "agent_notice"
    | "review_delivery"
    | "markdown_projection"
    | "archive"
    | "identity_provision";
  payload: OutboxPayload;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  createdAt: EpochMs;
  deliveredAt?: EpochMs;
  lastFailure?: string;
}
type OutboxPayload =
  | { kind: "refresh"; meetingId: OpaqueId; committedVersion: number }
  | {
      mailId: OpaqueId;
      recipientId: OpaqueId;
      contextPublicationUpperBound: OpaqueId[];
    }
  | AgentNoticePayload
  | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId }
  | {
      kind: "markdown_projection";
      meetingId: OpaqueId;
      committedVersion: number;
    }
  | { kind: "archive"; archiveId: OpaqueId; meetingId: OpaqueId }
  | {
      kind: "identity_provision";
      recommendationId: OpaqueId;
      admissionId: OpaqueId;
    };
interface AgentNoticeBase {
  kind: "agent_notice";
  meetingId: OpaqueId;
  recipientId: OpaqueId;
  agendaId: OpaqueId;
}
type AgentNoticePayload =
  | { kind: "agent_notice"; noticeKind: "meeting_resumed"; meetingId: OpaqueId; recipientId: OpaqueId }
  | (AgentNoticeBase & { noticeKind: "meeting_started" })
  | (AgentNoticeBase & { noticeKind: "agenda_stopped"; planId: OpaqueId })
  | (AgentNoticeBase & { noticeKind: "round_opened"; roundId: OpaqueId })
  | (AgentNoticeBase & {
      noticeKind: "transcript_update";
      publicMessageId: OpaqueId;
    })
  | (AgentNoticeBase & {
      noticeKind: "hand_request";
      requestKind: "initial";
      roundId: OpaqueId;
      contributorId: OpaqueId;
    })
  | (AgentNoticeBase & {
      noticeKind: "hand_request";
      requestKind: "supplement";
      contributionId: OpaqueId;
    })
  | (AgentNoticeBase & {
      noticeKind: "hand_disposition";
      requestKind: "initial";
      roundId: OpaqueId;
      contributorId: OpaqueId;
      disposition: "accepted";
      reason: string;
      contributionId: OpaqueId;
    })
  | (AgentNoticeBase & {
      noticeKind: "hand_disposition";
      requestKind: "initial";
      roundId: OpaqueId;
      contributorId: OpaqueId;
      disposition: "rejected" | "deferred";
      reason: string;
    })
  | (AgentNoticeBase & {
      noticeKind: "hand_disposition";
      requestKind: "supplement";
      contributionId: OpaqueId;
      disposition: "accepted" | "rejected" | "deferred";
      reason: string;
    })
  | (AgentNoticeBase & { noticeKind: "review_request"; versionId: OpaqueId });
```

`meeting_started` 与 `transcript_update` 是公开 Meeting notice。producer 分别为创建提交和轮末公开提交中的每个 Meeting identity 生成独立 effect；dispatcher 不按 role、Agenda responsibility 或未结束任务筛选 recipient，但必须重新验证 Meeting/Agenda 状态、payload 引用、recipient identity、active meeting-owned Session ownership、精确 Session ID 与 active capability。接收者使用 notice 的 `meetingId` 调用 `convivium_read_meeting` 取得 caller-filtered 内容并自行决定是否行动，notice 不增加其 `AllowedControl` 或数据可见范围。`hand_*`、`review_request`、review delivery 与 deadline 类效果仍按明确 recipient 和各自可见性规则定向投递。公开 notice payload 只含定位已提交公开事实所需的 ID，不复制 Evidence 正文、私有 Session 历史或隐藏推理。

`round_ready` 是定向 Manager notice，由使非空 open Round 首次满足正常收口条件的提交生成；payload 仅含 `roundId`、`agendaId` 和接收方 ID。dispatcher 重新验证接收方为该 Agenda 的 active Manager、Round 仍 open 且可收口后才投递。该通知不自动公开证据或代替 Manager 的 `publish_round` 决定。

`activate_agenda` 允许 Captain 或当前 Meeting Manager 提交；Agent 入口为 `convivium_activate_agenda`，沿用相同命令字段、版本、幂等与事务。只接受本会议已有 pending Agenda，拒绝非 running、旧议题有 open Round、未知或非 pending 目标；Manager 的 fact/event actor 保留真实 identity，不冒充 Captain。切换同事务将目标加入有显式责任列表的专职 Manager，不改变其角色、Session、Definition 或工具能力，不扩张 Contributor 责任；空列表仍表示全部议题。切换不提升 candidate、不完成目标或解除阻塞，保留旧议题 plan 与记录。

Manager 的局部阻塞记录复用 `ManagerPlan.blockingReason`，`rationale` 说明受影响结论、解除条件及仍可推进的路径；它随 plan 原子提交并进入 `manager_plan.recorded` 事件，不新增异常实体或改变 Issue/Agenda/lifecycle。`blockingReason` 可与 `open_round` 或 `continue_agenda` 同时存在，不隐式触发 `stop_agenda`、结束或议题激活。记录只表示阻塞判断，不自动满足目标、处置 Issue 或解除依赖。局部阻塞后的继续与正常停止条件见 [ER-FR-7](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划)。

`meeting_resumed` 由 accepted `resume_meeting` 的同一事务为当前唯一 Manager 生成一次 durable outbox effect。内部 effect 为 `{kind:"agent_notice",noticeKind:"meeting_resumed",recipientId:OpaqueId}`，字段全部 required；不携带 `agendaId`，用于扫描整场会议而非恢复某个旧轮次；原 MeetingState 的活动议题合法性门禁保持不变。内部 effect 不接收 caller 提交的身份、Session、版本或 prompt；recipientId 来自已验证 MeetingState 的 Manager，outbox/deliveryId 沿同一 command commit 的既有生成机制，meetingId 在投递时由原 snapshot 补齐。沿既有 delivery text 格式只输出 `{effectId,meetingId,noticeKind:"meeting_resumed"}`。dispatcher 必须验证 running 生命周期、接收方当前唯一 manager 角色，以及原同 Meeting active ownership、精确 Session ID 和 active capability；投递前后授权复核、flush/原 deliveryId、ACP unknown 阻断均保持。暂停/终态不投递，撤权或错身份拒绝，不通过延长 descriptor 或替换 Session 继续。Manager 仅据此重读当前事实并自行选择后续操作，通知不是自动开轮或结束命令。相同 resume requestId 重放复用原 receipt，不追加 effect；不同已接受的恢复请求各有自己的通知，不重发已消费输入。

`agenda_stopped` 由接受 `stop_agenda` 的同一事务为当前 Manager 生成一次 durable outbox effect；payload 仅含 `planId`、`agendaId` 和接收方 ID。dispatcher 只在该计划仍是当前 active `stop_agenda` 且接收方仍为负责该 Agenda 的 Manager 时投递；失效通知不得驱动后续动作。Manager 收到后另行读取会议、扫描后续工作并决定继续或正常结束；通知本身不改变议题或会议状态。

`round_opened` 由 `open_round` 提交为负责该 Agenda 的每位 Contributor 分别生成；payload 仅含 `roundId`、`agendaId` 和接收方 ID。dispatcher 重新验证接收方仍是负责该 Agenda 的 active Contributor、Round 仍 open，才投递到其独立 Session。通知只提示重新读取 caller-visible Meeting，不自动举手或授予 Contribution。

`MeetingStateRecord` 是 Domain `MeetingState` 的无损序列化；`CommittedFactRecord` 是带 `factId, kind, actorId, occurredAt, meetingVersion, relatedIds, payload, resultingState` 的追加事实。Repository catalog key、Meeting domain name、open/read/list、receipt、outbox 与 recovery 均只以 `meetingId` 定位，不得保留固定、caller 提交或从 Session 推断的 `teamId` compatibility namespace。`resolve_question` 必须使用 `question_disposition` payload，`dispose_issue` 必须使用 `issue_disposition` payload；其它 action 使用最小 `references` payload，不得复制私信正文、Session、凭据或隐藏推理。Repository 的 `commit` 必须原子保存 state、receipt、facts 和 outbox，结果只能是 accepted、version_conflict 或 unavailable；不得部分确认。底层可以使用单一 commit record 或以最终 pointer 发布的分页 checkpoint，但不得因单条 record 大小限制拆分同一业务 command。outbox payload 只能包含最小效果输入，不含 secrets 或隐藏推理。initial hand accepted 必须给出新 `contributionId`，supplement hand 始终用既有 `contributionId` 定位。dispatcher 投递前重新验证 recipient 的会议 Session ownership、active 状态及该 notice 的当前可见性，重复效果使用同一个 effect ID，投递成功不推断 Agent 已申请或提交。`ArchivePackage` 必须按本节 ArchiveView 白名单按值固化；它不是对当前 MeetingState 的无类型 clone，也不能只保存对象 ID。

## Compatibility And Acceptance

创建结果在 `completeCreate` 中固化，Repository 不提供事后修改创建结果或按 delivery ID 将已完成 outbox 重新入队的辅助入口。持久化 projection 只接受当前 strict schema；

当前契约不适配 legacy Turn、Attempt、私有草稿/FormatApproval、贡献 DTO、tool 名、URL 或持久格式。持久化记录保留 `formatVersion`，但读取只接受当前 schema；不存在旧格式识别、转换、双写或回写。`MeetingAction`、`MeetingView` 和目标存储尚未对外发布，因此删除旧草案的格式审批、收敛 reviewer batch 和 archive schema 不需要 legacy 兼容或双写。首次发布后可增加 optional read field；改变 required field、enum 语义、授权、幂等键、效果语义或 fact 意义必须引入新版本并明确迁移读写策略；未知 action 必须 fail closed。

1. TypeScript 实现可从本文声明每个 command、result、error 和 port，而无需 untyped 业务 payload。
2. 每个 action 具有唯一 discriminant、确定字段、角色边界、原子成功结果和拒绝条件。
3. 调用方不能提交 actor、authority、baseline、timer 或派生完成值。
4. Repository 测试可证明 commit/replay 原子性，adapter 测试可证明 refresh 仅通知、读取严格过滤。

## Related Documents

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Domain Design](../30-designs/DOMAIN-DESIGN.md)
- [Meeting Design](../30-designs/MEETING-DESIGN.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [DSH Role Interface](./DSH-ROLE-INTERFACE.md)

## ACP Execution Diagnostics

`MeetingView.executionBlocks` 为可选技术诊断，由 Runtime 将 provider 技术记录与当前 Meeting ownership 关联生成；空时省略，按 identityId 排序。仅公开该读取入口有权查看的身份、稳定 code、安全非负整数毫秒 since 和固定 allowedActions，不暴露 Session ID、模型、路径、凭据或隐藏推理。不是领域状态或权限授予，不增加 Meeting version、领域事件、receipt 或 Archive 事实。精确技术状态见 [ACP Execution Interface](./DSH-ACP-EXECUTION-INTERFACE.md)。

provider 持久阻断后通知 Runtime 的 refreshListeners，用当前 committedVersion 发刷新；Client 即使 version 相同也重新读取技术诊断。提示受影响身份、已停止自动执行以及可暂停/异常结束；复用现有 Captain 控制，仍按真实 caller/lifecycle 校验，不自动暂停、不增加清锁动作，resume 不解除阻断。原生非 ACP 路径保持原行为。
