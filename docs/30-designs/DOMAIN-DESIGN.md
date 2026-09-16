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

Domain 接受完整的当前 MeetingState 与已认证 actor、时间和命令，返回接受后的新 state 与领域事实，或稳定的拒绝原因；它不持久化、重试、发通知、读取时钟或裁剪 caller view。任何结构、引用、枚举、权限前提、生命周期或不变量失败都返回 rejection，且保持输入 state 值等价。Domain 通常只输出实体 ID、转换类型与受影响引用；Question/Issue 的结构化处置还须一次性输出目标旧/新 status 与 blocking、非空理由及本 Meeting 证据 ID，供 Runtime 连同 actor/time 组成不可变 committed fact。不得输出 Session、凭据、私信正文、Agent 内部过程或隐藏推理。

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
| `opportunityRequests` | 仅含无 open Round 时的未处置 `EvidenceOpportunityRequest[]`；按 requestId 和 `(agendaId, contributorId)` 唯一 |
| `pendingHandRaises` | 仅含未处置的 `PendingHandRaise[]`；按 `(roundId, contributorId)` 唯一 |
| `contributions` | 按 contributionId 唯一的 `Contribution[]` |
| `formatApprovals` | 仅含待消费的 `FormatApproval[]`；按 contributionId 唯一，不含草稿内容 |
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

所有数组始终存在。MeetingState 内带明确目标实体种类的跨对象引用必须指向本 Meeting 中该种类已存在对象，不能因另一种类的同字符串 ID 通过；非法 typed FK 使整个命令拒绝。指向当前聚合之外、但仍由受控边界持有的旧 Archive/素材、DSH Definition、授权记录、local controller 或 committed fact 的 ID，以及不带 target kind 的 message/mail `relatedIds[]`，在纯 snapshot validator 中只检验非空 ID/数组结构；其存在性、可见性和归属由创建/接线/恢复切片验证，不能称当前 Domain validator 已证明。Domain 不为缺失字段补默认值。

`ContinuationProvenance` 必含 `sourceArchiveId`、`selectedMaterialIds`、`importedAt`、`importedBy`。每个导入对象保留 sourceArchiveId/sourceMaterialId，只复制被明确选择且调用者有权读取的归档素材；不得复制旧 Meeting ID、identity、Session、capability、完整 transcript、task、mail 或运行状态。

## Identity And Authority Facts

召集人是可信 loopback local controller，不是 Agent identity、DSH Session 或角色 Definition。`MeetingIdentity` 字段为 `id`、`displayName`、`roles`、`agendaResponsibilityIds`、`reviewResponsibilityIds`、`riskAuthority`、`required`、`definitionId?`、`definitionVersion?`、`definitionHash?`、`sessionOwnershipId?`。两组 responsibility ID 都指本 Meeting 的 `AgendaItem.id`：前者表示该身份承担的 Agenda，后者表示该身份在这些 Agenda 上承担审核职责；未知 Agenda ID 拒绝，不从 displayName 或 Definition 推断。后两个 Definition/ownership 字段只用于 Runtime 证明已激活 identity 的精确 provenance/ownership，不进入公开 DTO 或 Archive；动态准入身份必须四个 Definition/ownership 字段同时存在。`roles` 仅允许 `captain|manager|contributor|evidence_reviewer`；同一身份可有多个角色，但正式命令仍逐 action 验证角色。`reviewResponsibilityIds` 非空的身份必须具有 `evidence_reviewer` role；每个 Agenda 的 `requiredReviewerIds`（元素为 `MeetingIdentity.id`）与对应身份的 `reviewResponsibilityIds` 必须双向一致：Agenda 列出的必需审核者须声明负责该 Agenda，声明负责审核该 Agenda 的身份也须在 Agenda 必需审核者列表中。

`IdentityRecommendation` 必含 `id`、`candidateId`、`definitionId`、`definitionVersion`、`catalogId`、`catalogVersion`、`agendaId`、`managerId`、`decision:admit|reject`、`status:provisioning|rejected|active|failed`、`rationale`、`expectedContribution`、`evidenceGap`、`createdAt`；`admit` 另必含 Runtime 预留的 `identityId`、`childSessionId` 和来自当前安全 Catalog candidate 的 `definitionHash`，`reject` 不含；optional `failureCode`、`resolvedAt`。`id` 同时是稳定 admissionId；全部 ID、时间和 Manager actor 由 Runtime 从可信 command/caller 生成，只有 candidate/catalog/Definition/Agenda 引用和理由由 Manager 提交。`reject` 直接终态 `rejected`，只含 resolvedAt；`admit` 初始 `provisioning`，预留 ID 不构成 `identities` 中的真实身份且不在该阶段公开；Session/ownership/Definition provenance 可验证后一次原子转换为 `active` 并设置 definitionHash、resolvedAt，失败一次原子转换为 `failed` 并设置 RoleError failureCode、resolvedAt。`end_meeting` 也在同一终态提交中将全部未完成 provisioning 置为 `failed/ADMISSION_CONFLICT`，再清理未激活 Session。`rejected|active|failed` 不再变更，同一 candidate 的 `provisioning|active` 阻止再次准入；`failed|rejected` 后可用新的 request 对该 candidate 重新决定。状态/失败投影只向 Manager、Captain、loopback local controller公开，Session/descriptor/ownership 永不投影。

local controller 不是 `captain` 的别名；`manager` 不能创建 Position、Decision、RiskDisposition 或 CompletionFact；`evidence_reviewer` 不得审核其作者 identity 的 EvidenceVersion。任一已授权 Meeting identity 可以记录 Question 或 Issue；只有具有 `captain` role 的 identity 可以 resolve Question 或 dispose Issue，local controller 不能执行这四个动作。所有正式事实记录 `actorId`。

`MeetingLifecycle` 必含 `status`、`changedAt`、`changedBy`、`reason?`。status 仅为 `preparing|running|paused|converging|ending|terminal|archiving|archived`；合法边为 `preparing→running`、`running→paused|converging|ending`、`paused→running|ending`、`converging→ending`、`ending→terminal`、`terminal→archiving`、`archiving→archived`。不存在隐式失败边：Agent、Session 或投递失败必须先成为 Issue、Contribution exit 或显式 termination 的理由。`terminal` 必有 termination；`archiving` 必有已物化 archive，Session 关闭失败时保持 archiving；`archived` 必有完整 archive 且所有 Meeting-owned Session 已停止、关闭并撤销会议 capability。 纯 MeetingState snapshot validator 可核对 termination/archive 的静态字段与引用，但 Session close/capability revoke 的证明保存在受控 Runtime/Repository 边界，不在聚合字段中；因此不能将静态 archived 校验称为该外部前提已满足。

## Objective, Agenda, Question And Issue

`ObjectiveContract` 必含 `statement`、`requiredOutputs[]`、`acceptanceCriteria[]`、`hardConstraints[]`、`acceptableRiskLevel`。每个 required output 与 criterion 含稳定 ID 和初始 `pending` 状态；创建时不得为 accepted/satisfied。

`AgendaItem` 必含 `id`、`title`、`question`、`status`、`requiredOutputIds`、`requiredReviewerIds`、`ownerId?`。状态仅为 `pending|active|blocked|completed|deferred|closed`；创建时由明确 initialActiveAgendaId 选定且仅有一个 active 项，除非 Meeting 已终止。

`AgendaCandidate` 必含 `id`、`title`、`reason`、`sourceMessageId?`、`status`；状态为 `pending|promoted|parked|rejected`，且只允许从 pending 转换一次。`parkingLot` 不是状态字段，而是所有 candidate 按 ID 排序的派生投影。

`Question` 必含 `id`、`actorId`、`agendaId`、`text`、`affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`blocking`、`status`；状态为 `open|answered|withdrawn|deferred`。blocking Question 至少关联一个仍未满足的目标引用。

`resolve_question` 仅从 `open|deferred` 进入 `answered|withdrawn|deferred`；answered/withdrawn 清除 blocking，deferred 保留旧 blocking。终结处置不能再次处置；理由、证据与旧/新 status/blocking 只保存在不可变 committed fact payload，不在当前 Question 复制历史。

`Issue` 必含 `id`、`agendaId`、`description`、`riskLevel`、`classification`、`affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`requiredReviewerIds`、`blocking`、`status`、`rationale`。四组显式数组按写入顺序保存且各自不得重复，分别引用本 Meeting 的必要产出、验收条件、硬约束及所属 Agenda 的必需审核者；不通过自由文本制造引用。持久 classification 为 `blocking|follow_up|pending_discussion|accepted_risk|out_of_scope`，但 `record_issue` 只能创建 `blocking|follow_up|pending_discussion|out_of_scope`；`accepted_risk` 只能由合法 `dispose_risk` accept 转换形成。status 为 `open|resolved|deferred|out_of_scope`；riskLevel 为 `low|medium|high`，缺失不得推断默认值。创建时未接受的 high 风险必须 `blocking=true`；其他 open Issue 只有明确关联尚未满足的必要产出、验收条件、硬约束或所属 Agenda 的必需审核者时才可 blocking。创建时 `classification="blocking"` 必须与 `blocking=true` 成对；其它分类必须 `blocking=false`，不匹配的 caller 字段和无资格的 blocking 请求均拒绝而非改写。终结处置可以清除 blocking 但保留原 classification 作为历史分类；deferred 保留原值。

`dispose_issue` 仅从 `open|deferred` 进入 `resolved|deferred|out_of_scope`；resolved/out_of_scope 清除 blocking，deferred 保留旧 blocking。未接受 high 风险不能借 deferred 变成 non-blocking；终结处置不能再次处置。理由、证据与旧/新 status/blocking 只保存在不可变 committed fact payload，不在当前 Issue 复制历史。

## Round, Contribution And Evidence

`Round` 必含 `id`、`agendaId`、`publicBaselinePublicationIds`、`openedAt`、`status`、`contributionIds`、`deadlineAt?`、`publicationId?`。status 为 `open|published|aborted`。baseline 必须恰等于创建时全部 Publication ID；published 后不可变。

`EvidenceOpportunityRequest` 必含 `id`、`agendaId`、`contributorId`、`purpose`、`requestedAt`；只在 running Meeting 没有 open Round 时创建，指向 active Agenda，同一身份/议题至多一条 pending request。它不授予 Contribution。Manager `open_round` 原子把该 Agenda 的请求转为本轮 `PendingHandRaise`，申请原记录随即移除；Manager `dispose_evidence_opportunity` 可拒绝/暂缓并移除，须将理由通知本人。跨 Agenda、重复、已有未结束贡献或任务均拒绝。

`PendingHandRaise` 必含 `roundId`、`contributorId`、`purpose`、`raisedAt`；只允许指向 open Round、已认证且可参与的 contributor，按 `(roundId, contributorId)` 唯一。`raise_hand` 原子加入一个 pending request；Manager `dispose_hand_raise` 原子移除它。接纳时将其内容写入新 Contribution 的 handRaise，拒绝/暂缓时不保留待处置记录，也不创建 Contribution。Repository 追加申请与处置 fact 用于审计，不是另一份待处置业务状态；恢复只读 MeetingState 的 pending 集合。

`Contribution` 必含 `id`、`roundId`、`contributorId`、`handRaise`、`acceptedAt`、`status`、`packageId?`、`substantiveSupplementCount`、`supplementHand?`、`exitReason?`、`response?`。status 为 `preparing|format_correction|registered|under_review|awaiting_response|withdrawn|submission_missing|timed_out|supplement_rejected|closed`。`supplementHand` 若存在，必含 `purpose`、`raisedAt`、`status: pending|accepted`、`acceptedAt?`；只在同一未结束 Contribution 内存在，Manager 接纳后才允许新私有草稿格式审核。格式驳回会移除该 hand，作者重新申请并说明补正内容；未登记私有草稿的重复申请不消耗实质补充次数。已送达当前审核后，重新申请须早于 sentAt + responseDeadlineMs；还须早于持久 Round 或适用 MeetingTask 期限。同一 contributor/round 至多一个 Contribution；同一 contributor 同时至多一个非终态 Contribution。拒绝或暂缓初次举手不创建 Contribution。

`FormatApproval` 必含 `id`、`contributionId`、`managerId`、`evidenceHash`、`approvedAt`，只保存草稿的规范 SHA-256 hash，不保存作者私有材料。每个 Contribution 至多一个未消费批准；新 accepted 审核替换旧批准，作者 `submit_evidence` 仅在 payload hash 完全匹配时原子消费。rejected/deferred 私有草稿不创建 FormatApproval、EvidencePackage、EvidenceVersion 或 Registration；只把 Contribution 置于格式补正阶段、回报缺失要素，原草稿由作者自行留存。已退出 Contribution 的未消费批准必须移除。

`EvidencePackage` 必含 `id`、`roundId`、`contributionId`、`authorId`、`agendaId`、`currentVersionId`、`versions[]`。`EvidenceVersion` 必含 `id`、`ordinal`、`observation`、`interpretation`、`method`、`falsifiers[]`、`uncertainties[]`、`limitations[]`、`claims[]`、`materials[]`、`submittedAt`。ordinal 从 1 连续递增；新版本不能改写旧版本。每个 Material 必含 `id`、`kind`、`originator`、`originalSource`、`sourcePublishedAt`、`acquiredAt`、`version`、`locator`、`location`、`verificationConditions`、`limitations`、`sharedDependencies`、`reason?`；unknown/not_applicable 使用显式 kind 及非空 reason。原始作者/机构、来源发布时刻、取得或观察时刻无法获知或不适用时，对应文本明确写“未知”或“不适用”并附非空 reason；其它 required 文本字段均非空。此结构与 Meeting Interface 的 `MaterialInput` 逐字段对应。

`Registration` 必含 `id`、`versionId`、`managerId`、`status=complete`、`missingFields=[]`、`createdAt`；只在作者提交与已批准草稿 hash 完全相同的材料、创建 EvidenceVersion 的同一转换中产生。格式驳回/暂缓无 Registration，不得存储评分、真实性或观点判断。

`EvidenceReview` 必含 `id`、`versionId`、`reviewerId`、`baselinePublicationIds`、`scope`、`dimensions`、`createdAt`。dimensions 的 source/credibility/completeness/support 每项均为 `{score:0|1|2|3|unable_to_assess, scope, reason, baselineEvidenceIds[]}`；引用上一轮证据时，ID 必属于所属 Round baseline 的已公开最终版本。baseline 必须等于所属 Round baseline。`ReviewDelivery` 必含 `id`、`reviewId`、`authorId`、`status`、`sentAt?`、`failedAt?`、`failureReason?`；failed 必有 `failedAt` 与非空 `failureReason` 且无 `sentAt`，sent 必有 `sentAt` 且无失败字段。同一 review 可有多次 failed 尝试，但最多一次 sent，仅 `sent` 可开启一分钟期限。Manager、作者与指定 reviewer 按 Meeting Interface 的过滤规则读取这些尝试，其他未授权身份不得读取未公开 Review 的投递信息。

每个 current version 的唯一指定 reviewer 按 Agenda.requiredReviewerIds 顺序选择首位非作者、具 evidence_reviewer 角色且 reviewResponsibilityIds 包含该 Agenda 的 identity；无合格者不得提交该版本，Review 不接受另一审核员代替。正常 Round 收口还要求每份最终当前 Review 至少有一次 sent ReviewDelivery；只有 failed 的审核不得被当作已向作者送达。

每次成功的 `raise_supplement_hand` 都把非空 purpose 同时写入 Contribution.response 作为明确继续事实；补充版登记时清除此旧响应。计数低于二且 current version 不在审核中时，Manager accepted 保留 hand 供格式审核，rejected 移除 hand 并把 Contribution 置 `supplement_rejected`，普通 deferred 只移除 hand、不退出。current version 正在审核时只能 deferred 且不退出。count=2 的第三次举手仍为 pending，Manager 只可 rejected/deferred，并将 Contribution 置 `supplement_rejected`。已明确继续但没有待 Manager 处置的 pending hand、到 currentVersion.submittedAt + taskDeadlineMs 与 Round/适用 Task deadline 的最早值仍未推进时，可以以“继续申请未完成” timed_out；有 pending hand 不因作者沉默超时。只有当前最终 Review 已 sent 才能按无响应的 sentAt+60000 标记静默超时。

原 Contribution 的默认准备期限：首次登记前是 acceptedAt + taskDeadlineMs，登记后补证是 package.currentVersion.submittedAt + taskDeadlineMs；两者分别与存在的 Round/适用 MeetingTask deadline 取最早值。重新申请与获批准后的正文提交都须早于该值，送达后的申请还须早于首次 sentAt + 60000。

## Publication, Outcome And Termination

`Publication` 必含 `id`、`roundId`、`seq`、`finalVersionIds`、`finalReviewIds`、`publishedAt`、`exitReasons[]`。本轮 pending hand raises 必须全部处置；每个接纳 Contribution 必须有确定终态，且每个登记 package 的 currentVersion 必须有最终 Review，才可创建 Publication。格式驳回而未登记的私有草稿不形成 finalVersionId/finalReviewId。

`FormalMessage` 必含 `id`、`seq`、`actorId`、`agendaId`、`kind`、`body`、`publicationId`、`relatedIds[]`、`createdAt`；seq 全局严格递增。Message 只在 Publication 时产生。

`ProposalRevision` 必含 `id`、`proposalId`、`ordinal`、`actorId`、`agendaId`、`summary`、`body`、`evidenceIds`、`supersedesRevisionId?`、`createdAt`；同 proposal 的 ordinal 从 1 连续递增，supersedes 只能指向同 proposal 的立即前序 revision。`Position` 必含 `id`、`proposalRevisionId`、`actorId`、`stance`、`rationale`、`evidenceIds`、`createdAt`；stance 为 `support|oppose|abstain|conditional`。`DecisionCandidate` 必含 `id`、`proposalRevisionId`、`actorId`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`createdAt`；它不可变且无 status。`Decision` 必含 `id`、`candidateId`、`proposalRevisionId`、`actorId`、`status`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`replacesDecisionId?`、`createdAt`；status 为 `accepted|superseded|revoked`，outcome 为 `adopt|reject|defer`。`RiskDisposition` 必含 `id`、`issueId`、`actorId`、`action`、`scope`、`rationale`、`evidenceIds`、`createdAt`；action 为 `accept|reject`。`CompletionDeclaration` 必含 `id`、`actorId`、`outputId`、`criterionId?`、`statement`、`evidenceIds`、`taskId?`、`createdAt`；它不可变且不是 CompletionFact。`CompletionFact` 必含 `id`、`outputId`、`criterionId?`、`actorId`、`status`、`statement`、`rationale`、`evidenceIds`、`decisionIds`、`supersedesFactId?`、`createdAt`；status 为 `active|superseded|revoked`。这些对象均不可变；新 ProposalRevision 不继承 Position、Candidate 或 Decision。

`MeetingTask` 必含 `id`、`createdBy`、`assigneeId`、`agendaId?`、`title`、`instructions`、`contextPublicationUpperBound`、`status`、`deadlineAt?`、`result?`、`exitReason?`、`createdAt`、`updatedAt`。status 为 `open|claimed|completed|cancelled|expired`；只有 assignee 可以 claim/complete，且 result 是任务结果而非 FormalMessage、Decision 或 CompletionFact。`ArchivePackage` 必含 `id`、`createdAt`、`createdBy`、`terminationId`、`publicSnapshotVersion`、`includedPublicationIds`、`includedDecisionIds`、`includedCompletionFactIds`、`identityProvenance`、`status`；`identityProvenance` 是所有已激活身份的 `{identityId,displayName,roles,definitionId?,definitionVersion?,definitionHash?}[]` 固化快照，不含 sessionOwnershipId。status 为 `pending|complete|failed`。归档包不含 Session、私信、未发布 Evidence、隐藏推理或运行诊断。

`MeetingLimits` 必含 `maxFormalMessages`、`maxDurationMs`、`taskDeadlineMs`、`reviewDeadlineMs`、`responseDeadlineMs=60000`。`Termination` 必含由后续 `end_meeting` 的受控 Runtime/Domain 命令上下文生成、调用者不得提交的 `id`，以及 `outcome`、`reason`、`endedAt`、`decisionIds`、`completionFactIds`、`unresolvedQuestionIds`、`unresolvedIssueIds`、`unclosedContributionIds`。outcome 为 `completed|partial|no_consensus|cancelled|failed`；`ArchivePackage.terminationId` 必须等于当前 `Termination.id`。

Task extension: MeetingTask also requires authorizationId, authorizationStatus, attempt, reassignedFromTaskId optional, startedAt optional, completedAt optional. authorizationStatus is active, revoked, or expired. Reassign atomically revokes the old authorization and creates a new task/authorization; a revoked task can never claim, complete, or project a result. Task creation requires the caller's active contribution/task authorization and matching agenda/context. An assignee cannot hold a claimed mail and a nonterminal formal Contribution simultaneously.

ManagerPlan requires id, agendaId, managerId, basedOnPublicationId optional, kind, rationale, blockingReason optional, createdAt, and status. kind is open_round, continue_agenda, stop_agenda, raise_agenda_candidate, or wait_for_required_identity. status is active, superseded, or completed. Manager creates a plan only when no Round is open; the plan does not alter Agenda, Round, Participant, or authority. Captain candidate disposition and Manager open-round execution remain separate transitions.

PrivateMail requires id, senderId, recipientId, agendaId optional, body, relatedIds, sendContextPublicationUpperBound, processingContextPublicationUpperBound optional, status, deadlineAt, createdAt, processingStartedAt optional, completedAt optional, failureReason optional. status is queued, processing, completed, timed_out, or cancelled. Processing starts by once computing the recipient-visible Publication range from the send upper bound through processing start; every retry reuses that range. A recipient may not process a mail while it has a claimed formal Contribution or another processing mail. Timeout/cancel releases the identity and never creates FormalMessage, Decision, or CompletionFact.

Publication.exitReasons 与所属 Round.contributionIds 等长且同顺序；每个已接纳 Contribution 的终态必须有非空 exitReason，私有草稿未登记而退出者的原因也保留，但不制造 finalVersionId 或 FormalMessage。

## Derived Rules

`isRoundClosable`、`isObjectiveSatisfied`、`pendingDecisionCandidates`、`parkingLot` 和 caller-visible projections 必须是纯派生函数，不持久化第二份状态。pendingDecisionCandidates 只含当前 ProposalRevision 中没有任何 Decision 引用的 Candidate，且只在 lifecycle=`running|paused` 时非空；`paused` 表示恢复后可继续，`preparing|converging|ending|terminal|archiving|archived` 均返回空集合。该集合仅 Captain/local 可见。业务完成只由已公开的 active CompletionFact、required review、Decision、ObjectiveContract、hard constraints 和 blocking Issue 推导；Task 完成、评分、轮次或自然语言总结不直接完成 Meeting。CompletionDeclaration 的 Participant 精确为 `MeetingIdentity.roles` 包含 `contributor` 的已存在 identity；该声明不授予 manager-only、evidence-reviewer-only、local controller 或仅 Captain 身份。会清除 blocking Issue 并触发完成重算的 `dispose_issue` 只在 running 合法，从而保持唯一的 `running→converging` 边。

## Acceptance

代码必须能以本文件逐项校验对象结构、引用、状态和值域；每个 Domain command 在拒绝时保持 state 引用等价，在成功时只产生本文件允许的新事实与确定的版本递增。
