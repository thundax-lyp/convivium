# Domain Design

## Purpose

本文是 Convivium 领域代码的唯一映射规格。每个标题为一个代码对象或确定的派生规则；未在本文定义的持久 Meeting 字段、状态、枚举或引用不得自行增加。

## Scope And Non-goals

Domain 只定义纯 Meeting 事实、转换前提与不变量。它不依赖 DSH、Repository、Remote、UI、时钟、文件或工具调用；这些层只能传入已验证的 actor、时间、ID 与命令。

## Related Requirements And Design

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)

## Responsibility, Failure And Observability

Domain 接受完整的当前 MeetingState 与已认证 actor、时间和命令，返回接受后的新 state 与领域事实，或稳定的拒绝原因；它不持久化、重试、发通知、读取时钟或裁剪 caller view。任何结构、引用、枚举、权限前提、生命周期或不变量失败都返回 rejection，且保持输入 state 值等价。Domain 可输出的事实只含本文件实体 ID、转换类型与受影响引用；不能输出 Session、凭据、私信正文、Agent 内部过程或隐藏推理。

## MeetingState

`MeetingState` 是唯一聚合根，字段固定为：

| 字段 | 类型/约束 |
| --- | --- |
| `id` | 非空 opaque Meeting ID |
| `version` | 从 1 开始的正整数；每次成功转换加一 |
| `createdAt` / `updatedAt` | 有限非负时间戳 |
| `continuation?` | 新 Meeting 由归档续会时的 ContinuationProvenance，否则不存在 |
| `objective` | `ObjectiveContract` |
| `lifecycle` | `MeetingLifecycle` |
| `identities` | 按 identityId 唯一的 `MeetingIdentity[]` |
| `identityRecommendations` | 按 recommendationId 唯一的 `IdentityRecommendation[]`；包含 Manager 决定与非可调度 provisioning intent |
| `agenda` | 按 agendaId 唯一的 `AgendaItem[]` |
| `agendaCandidates` | 按 candidateId 唯一的 `AgendaCandidate[]` |
| `rounds` | 按 roundId 唯一的 `Round[]` |
| `contributions` | 按 contributionId 唯一的 `Contribution[]` |
| `completionDeclarations` | 按 declarationId 唯一的不可变 CompletionDeclaration 数组 |
| `evidencePackages` | 按 packageId 唯一的 `EvidencePackage[]` |
| `registrations` / `reviews` / `reviewDeliveries` | 按各自 ID 唯一的事实数组 |
| `publications` / `messages` | 按 publicationId/messageId 唯一，发布序号严格递增 |
| `proposals` / `positions` / `decisionCandidates` / `decisions` | 不可变历史数组 |
| `questions` / `issues` / `riskDispositions` | 按 ID 唯一的当前及历史事实 |
| `tasks` | 按 taskId 唯一的 `MeetingTask[]` |
| `managerPlans` | 按 planId 唯一的 ManagerPlan 数组；每个 Agenda 至多一个 active |
| `privateMails` | 按 mailId 唯一的 PrivateMail 数组 |
| `completionFacts` | 按 factId 唯一的不可变事实 |
| `limits` | `MeetingLimits` |
| `termination?` / `archive?` | 仅终态或归档阶段存在 |

所有数组始终存在。所有跨对象引用必须指向本 Meeting 已存在对象；非法引用使整个命令拒绝。Domain 不为缺失字段补默认值。

`ContinuationProvenance` 必含 `sourceArchiveId`、`selectedMaterialIds`、`importedAt`、`importedBy`。每个导入对象保留 sourceArchiveId/sourceMaterialId，只复制被明确选择且调用者有权读取的归档素材；不得复制旧 Meeting ID、identity、Session、capability、完整 transcript、task、mail 或运行状态。

## Identity And Authority Facts

召集人是可信 loopback local controller，不是 Agent identity、DSH Session 或角色 Definition。`MeetingIdentity` 字段为 `id`、`displayName`、`roles`、`agendaResponsibilityIds`、`reviewResponsibilityIds`、`riskAuthority`、`required`、`definitionId?`、`definitionVersion?`、`definitionHash?`、`sessionOwnershipId?`。后两者只用于 Runtime 证明已激活 identity 的精确 provenance/ownership，不进入公开 DTO 或 Archive；动态准入身份必须四个 Definition/ownership 字段同时存在。`roles` 仅允许 `captain|manager|contributor|evidence_reviewer`；同一身份可有多个角色，但正式命令仍逐 action 验证角色。

`IdentityRecommendation` 必含 `id`、`candidateId`、`definitionId`、`definitionVersion`、`catalogId`、`catalogVersion`、`agendaId`、`managerId`、`decision:admit|reject`、`status:provisioning|rejected|active|failed`、`rationale`、`expectedContribution`、`evidenceGap`、`createdAt`；`admit` 另必含 Runtime 预留的 `identityId`、`childSessionId` 和来自当前安全 Catalog candidate 的 `definitionHash`，`reject` 不含；optional `failureCode`、`resolvedAt`。`id` 同时是稳定 admissionId；全部 ID、时间和 Manager actor 由 Runtime 从可信 command/caller 生成，只有 candidate/catalog/Definition/Agenda 引用和理由由 Manager 提交。`reject` 直接终态 `rejected`，只含 resolvedAt；`admit` 初始 `provisioning`，预留 ID 不构成 `identities` 中的真实身份且不在该阶段公开；Session/ownership/Definition provenance 可验证后一次原子转换为 `active` 并设置 definitionHash、resolvedAt，失败一次原子转换为 `failed` 并设置 RoleError failureCode、resolvedAt。`end_meeting` 也在同一终态提交中将全部未完成 provisioning 置为 `failed/ADMISSION_CONFLICT`，再清理未激活 Session。`rejected|active|failed` 不再变更，同一 candidate 的 `provisioning|active` 阻止再次准入；`failed|rejected` 后可用新的 request 对该 candidate 重新决定。状态/失败投影只向 Manager、Captain、loopback local controller公开，Session/descriptor/ownership 永不投影。

local controller 不是 `captain` 的别名；`manager` 不能创建 Position、Decision、RiskDisposition 或 CompletionFact；`evidence_reviewer` 不得审核其作者 identity 的 EvidenceVersion。所有正式事实记录 `actorId`。

`MeetingLifecycle` 必含 `status`、`changedAt`、`changedBy`、`reason?`。status 仅为 `preparing|running|paused|converging|ending|terminal|archiving|archived`；合法边为 `preparing→running`、`running→paused|converging|ending`、`paused→running|ending`、`converging→ending`、`ending→terminal`、`terminal→archiving`、`archiving→archived`。不存在隐式失败边：Agent、Session 或投递失败必须先成为 Issue、Contribution exit 或显式 termination 的理由。`terminal` 必有 termination；`archiving` 必有已物化 archive，Session 关闭失败时保持 archiving；`archived` 必有完整 archive 且所有 Meeting-owned Session 已停止、关闭并撤销会议 capability。

## Objective, Agenda, Question And Issue

`ObjectiveContract` 必含 `statement`、`requiredOutputs[]`、`acceptanceCriteria[]`、`hardConstraints[]`、`acceptableRiskLevel`。每个 required output 与 criterion 含稳定 ID 和初始 `pending` 状态；创建时不得为 accepted/satisfied。

`AgendaItem` 必含 `id`、`title`、`question`、`status`、`requiredOutputIds`、`requiredReviewerIds`、`ownerId?`。状态仅为 `pending|active|blocked|completed|deferred|closed`；创建时由明确 initialActiveAgendaId 选定且仅有一个 active 项，除非 Meeting 已终止。

`AgendaCandidate` 必含 `id`、`title`、`reason`、`sourceMessageId?`、`status`；状态为 `pending|promoted|parked|rejected`，且只允许从 pending 转换一次。`parkingLot` 不是状态字段，而是所有 candidate 按 ID 排序的派生投影。

`Question` 必含 `id`、`actorId`、`agendaId`、`text`、`affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`blocking`、`status`；状态为 `open|answered|withdrawn|deferred`。blocking Question 至少关联一个仍未满足的目标引用。

`Issue` 必含 `id`、`agendaId`、`description`、`riskLevel`、`classification`、`blocking`、`status`、`rationale`。classification 为 `blocking|follow_up|pending_discussion|accepted_risk|out_of_scope`；status 为 `open|resolved|deferred|out_of_scope`；riskLevel 为 `low|medium|high`。缺失 riskLevel 不能按默认值处置。

## Round, Contribution And Evidence

`Round` 必含 `id`、`agendaId`、`publicBaselinePublicationIds`、`openedAt`、`status`、`contributionIds`、`deadlineAt?`、`publicationId?`。status 为 `open|published|aborted`。baseline 必须恰等于创建时全部 Publication ID；published 后不可变。

`Contribution` 必含 `id`、`roundId`、`contributorId`、`handRaise`、`acceptedAt`、`status`、`packageId?`、`substantiveSupplementCount`、`pendingSupplementHand?`、`exitReason?`、`response?`。status 为 `preparing|format_correction|registered|under_review|awaiting_response|withdrawn|submission_missing|timed_out|supplement_rejected|closed`。pendingSupplementHand 必含 reviewId、raisedAt、purpose，且只在 awaiting_response 存在；Manager 接纳后才允许新版本。同一 contributor/round 至多一个；同一 contributor 同时至多一个非终态 Contribution。拒绝或暂缓初次举手不创建 Contribution。

`EvidencePackage` 必含 `id`、`roundId`、`contributionId`、`authorId`、`agendaId`、`currentVersionId`、`versions[]`。`EvidenceVersion` 必含 `id`、`ordinal`、`observation`、`interpretation`、`method`、`falsifiers[]`、`uncertainties[]`、`limitations[]`、`claims[]`、`materials[]`、`submittedAt`。ordinal 从 1 连续递增；新版本不能改写旧版本。每个 Material 必含 `id`、`kind`、`originalSource`、`version`、`locator`、`location`、`verificationConditions`、`limitations`、`sharedDependencies`；unknown/not-applicable 使用显式值及原因。

`Registration` 必含 `id`、`versionId`、`managerId`、`status`、`missingFields[]`、`createdAt`；status 为 `complete|needs_correction|deferred`。它不得存储评分、真实性或观点判断。

`EvidenceReview` 必含 `id`、`versionId`、`reviewerId`、`baselinePublicationIds`、`scope`、`dimensions`、`createdAt`。dimensions 的 source/credibility/completeness/support 每项均为 `{score:0|1|2|3|unable_to_assess, reason}`。baseline 必须等于所属 Round baseline。`ReviewDelivery` 必含 `id`、`reviewId`、`authorId`、`status`、`sentAt?`、`failedAt?`；仅 `sent` 可产生 `sentAt` 并开启一分钟期限。

## Publication, Outcome And Termination

`Publication` 必含 `id`、`roundId`、`seq`、`finalVersionIds`、`finalReviewIds`、`publishedAt`、`exitReasons[]`。每个接纳 Contribution 必须有确定终态，且每个登记 package 的 currentVersion 必须有最终 Review，才可创建 Publication。

`FormalMessage` 必含 `id`、`seq`、`actorId`、`agendaId`、`kind`、`body`、`publicationId`、`relatedIds[]`、`createdAt`；seq 全局严格递增。Message 只在 Publication 时产生。

`ProposalRevision` 必含 `id`、`proposalId`、`ordinal`、`actorId`、`agendaId`、`summary`、`body`、`evidenceIds`、`supersedesRevisionId?`、`createdAt`；同 proposal 的 ordinal 从 1 连续递增，supersedes 只能指向同 proposal 的立即前序 revision。`Position` 必含 `id`、`proposalRevisionId`、`actorId`、`stance`、`rationale`、`evidenceIds`、`createdAt`；stance 为 `support|oppose|abstain|conditional`。`DecisionCandidate` 必含 `id`、`proposalRevisionId`、`actorId`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`createdAt`；它不可变且无 status。`Decision` 必含 `id`、`candidateId`、`proposalRevisionId`、`actorId`、`status`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`replacesDecisionId?`、`createdAt`；status 为 `accepted|superseded|revoked`，outcome 为 `adopt|reject|defer`。`RiskDisposition` 必含 `id`、`issueId`、`actorId`、`action`、`scope`、`rationale`、`evidenceIds`、`createdAt`；action 为 `accept|reject`。`CompletionDeclaration` 必含 `id`、`actorId`、`outputId`、`criterionId?`、`statement`、`evidenceIds`、`taskId?`、`createdAt`；它不可变且不是 CompletionFact。`CompletionFact` 必含 `id`、`outputId`、`criterionId?`、`actorId`、`status`、`statement`、`rationale`、`evidenceIds`、`decisionIds`、`supersedesFactId?`、`createdAt`；status 为 `active|superseded|revoked`。这些对象均不可变；新 ProposalRevision 不继承 Position、Candidate 或 Decision。

`MeetingTask` 必含 `id`、`createdBy`、`assigneeId`、`agendaId?`、`title`、`instructions`、`contextPublicationUpperBound`、`status`、`deadlineAt?`、`result?`、`exitReason?`、`createdAt`、`updatedAt`。status 为 `open|claimed|completed|cancelled|expired`；只有 assignee 可以 claim/complete，且 result 是任务结果而非 FormalMessage、Decision 或 CompletionFact。`ArchivePackage` 必含 `id`、`createdAt`、`createdBy`、`terminationId`、`publicSnapshotVersion`、`includedPublicationIds`、`includedDecisionIds`、`includedCompletionFactIds`、`identityProvenance`、`status`；`identityProvenance` 是所有已激活身份的 `{identityId,displayName,roles,definitionId?,definitionVersion?,definitionHash?}[]` 固化快照，不含 sessionOwnershipId。status 为 `pending|complete|failed`。归档包不含 Session、私信、未发布 Evidence、隐藏推理或运行诊断。

`MeetingLimits` 必含 `maxFormalMessages`、`maxDurationMs`、`taskDeadlineMs`、`reviewDeadlineMs`、`responseDeadlineMs=60000`。`Termination` 必含 `outcome`、`reason`、`endedAt`、`decisionIds`、`completionFactIds`、`unresolvedQuestionIds`、`unresolvedIssueIds`、`unclosedContributionIds`。outcome 为 `completed|partial|no_consensus|cancelled|failed`。

Task extension: MeetingTask also requires authorizationId, authorizationStatus, attempt, reassignedFromTaskId optional, startedAt optional, completedAt optional. authorizationStatus is active, revoked, or expired. Reassign atomically revokes the old authorization and creates a new task/authorization; a revoked task can never claim, complete, or project a result. Task creation requires the caller's active contribution/task authorization and matching agenda/context. An assignee cannot hold a claimed mail and a nonterminal formal Contribution simultaneously.

ManagerPlan requires id, agendaId, managerId, basedOnPublicationId optional, kind, rationale, blockingReason optional, createdAt, and status. kind is open_round, continue_agenda, stop_agenda, raise_agenda_candidate, or wait_for_required_identity. status is active, superseded, or completed. Manager creates a plan only when no Round is open; the plan does not alter Agenda, Round, Participant, or authority. Captain candidate disposition and Manager open-round execution remain separate transitions.

PrivateMail requires id, senderId, recipientId, agendaId optional, body, relatedIds, sendContextPublicationUpperBound, processingContextPublicationUpperBound optional, status, deadlineAt, createdAt, processingStartedAt optional, completedAt optional, failureReason optional. status is queued, processing, completed, timed_out, or cancelled. Processing starts by once computing the recipient-visible Publication range from the send upper bound through processing start; every retry reuses that range. A recipient may not process a mail while it has a claimed formal Contribution or another processing mail. Timeout/cancel releases the identity and never creates FormalMessage, Decision, or CompletionFact.

## Derived Rules

`isRoundClosable`、`isObjectiveSatisfied`、`pendingDecisionCandidates`、`parkingLot` 和 caller-visible projections 必须是纯派生函数，不持久化第二份状态。pendingDecisionCandidates 只含当前 ProposalRevision 的 Candidate、Meeting 可执行且尚未被接受为 Decision 的项；仅 Captain/local 可见。业务完成只由已公开的 active CompletionFact、required review、Decision、ObjectiveContract、hard constraints 和 blocking Issue 推导；Task 完成、评分、轮次或自然语言总结不直接完成 Meeting。

## Acceptance

代码必须能以本文件逐项校验对象结构、引用、状态和值域；每个 Domain command 在拒绝时保持 state 引用等价，在成功时只产生本文件允许的新事实与确定的版本递增。
