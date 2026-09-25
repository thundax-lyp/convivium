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

| 字段                                                              | 类型/约束                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                                                              | 非空 opaque Meeting ID                                                                                        |
| `version`                                                         | 从 1 开始的正整数；每次成功转换加一                                                                           |
| `createdAt` / `updatedAt`                                         | 有限非负时间戳                                                                                                |
| `continuation?`                                                   | 新 Meeting 由归档续会时的 ContinuationProvenance，否则不存在                                                  |
| `objective`                                                       | `ObjectiveContract`                                                                                           |
| `lifecycle`                                                       | `MeetingLifecycle`                                                                                            |
| `identities`                                                      | 按 identityId 唯一的 `MeetingIdentity[]`                                                                      |
| `evidenceReviewerId`                                              | 指向本 Meeting 唯一专职 evidence_reviewer identity                                                            |
| `identityRecommendations`                                         | 按 recommendationId 唯一的 `IdentityRecommendation[]`；包含 Manager 决定与非可调度 provisioning intent        |
| `agenda`                                                          | 按 agendaId 唯一的 `AgendaItem[]`                                                                             |
| `agendaCandidates`                                                | 按 candidateId 唯一的 `AgendaCandidate[]`                                                                     |
| `rounds`                                                          | 按 roundId 唯一的 `Round[]`                                                                                   |
| `opportunityRequests`                                             | 仅含无 open Round 时的未处置 `EvidenceOpportunityRequest[]`；按 requestId 和 `(agendaId, contributorId)` 唯一 |
| `pendingHandRaises`                                               | 仅含未处置的 `PendingHandRaise[]`；按 `(roundId, contributorId)` 唯一                                         |
| `contributions`                                                   | 按 contributionId 唯一的 `Contribution[]`                                                                     |
| `completionDeclarations`                                          | 按 declarationId 唯一的不可变 CompletionDeclaration 数组                                                      |
| `evidencePackages`                                                | 按 packageId 唯一的 `EvidencePackage[]`                                                                       |
| `registrations` / `reviews` / `reviewClaims` / `reviewDeliveries` | 按各自 ID 唯一的事实或处理中认领数组                                                                          |
| `publications` / `messages`                                       | 按 publicationId/messageId 唯一，发布序号严格递增                                                             |
| `proposals` / `positions` / `decisionCandidates` / `decisions`    | 不可变历史数组                                                                                                |
| `questions` / `issues` / `riskDispositions`                       | 按 ID 唯一的当前及历史事实                                                                                    |
| `tasks`                                                           | 按 taskId 唯一的 `MeetingTask[]`                                                                              |
| `managerPlans`                                                    | 按 planId 唯一的 ManagerPlan 数组；每个 Agenda 至多一个 active                                                |
| `privateMails`                                                    | 按 mailId 唯一的 PrivateMail 数组                                                                             |
| `completionFacts`                                                 | 按 factId 唯一的不可变事实                                                                                    |
| `limits`                                                          | `MeetingLimits`                                                                                               |
| `termination?` / `archive?`                                       | 仅终态或归档阶段存在                                                                                          |

所有数组始终存在。MeetingState 内带明确目标实体种类的跨对象引用必须指向本 Meeting 中该种类已存在对象，不能因另一种类的同字符串 ID 通过；非法 typed FK 使整个命令拒绝。指向当前聚合之外、但仍由受控边界持有的旧 Archive/素材、DSH Definition、授权记录、local controller 或 committed fact 的 ID，以及不带 target kind 的 message/mail `relatedIds[]`，在纯 snapshot validator 中只检验非空 ID/数组结构；其存在性、可见性和归属由创建/接线/恢复切片验证，不能称当前 Domain validator 已证明。Domain 不为缺失字段补默认值。

`ContinuationProvenance` 必含 `sourceArchiveId`、`selectedMaterialIds`、`importedAt`、`importedBy`。`ContinuationMaterial` 是只读按值副本，kind 仅为 `published_evidence|formal_message|accepted_decision|active_completion_fact`，并保留 sourceArchiveId/sourceMaterialId；选择 published evidence 时 EvidenceVersion、Materials、来源定位与最终 Review 作为一个不可拆分 bundle。不得复制旧 Meeting ID、identity、Session、capability、完整 transcript、task、mail、authority、运行状态或旧完成结论。

## Identity And Authority Facts

Captain 为本地用户控制身份，不进入 MeetingIdentity。Runtime 验证可信用户入口后注入 `{kind:"captain_user",id:captainActorId}`；Domain 不读取 Session 或用户环境。用户控制事实与归档仅保存脱敏 actor，bootstrap 的 creator 为私有来源记录；Contributor 贡献仍只接受 contributor identity。

创建输入以会议内唯一 identityKey 建立引用，并分别用 managerIdentityKey 与 evidenceReviewerIdentityKey 指定唯一专职 Manager 和 reviewer；Runtime 完整验证后在同一创建事务中分配正式 identity ID，持久 MeetingState 不保存 identityKey。`MeetingIdentity` 字段为 `id`、`displayName`、`roles`、`agendaResponsibilityIds`、`riskAuthority`、`required`、`definitionId?`、`definitionVersion?`、`definitionHash?`、`sessionOwnershipId?`。agendaResponsibilityIds 指本 Meeting 的 AgendaItem.id；未知 ID 拒绝，不从 displayName、Definition 或数组位置推断。Definition/ownership 字段只用于 Runtime 证明已激活 identity 的精确 provenance/ownership，不进入普通公开 DTO；动态准入身份必须四个 Definition/ownership 字段同时存在。`roles` 仅允许 `manager|contributor|evidence_reviewer`；创建后的 Meeting 必须恰有一个 roles 精确为 `["manager"]` 的身份和一个 roles 精确为 `["evidence_reviewer"]` 的身份，其他 identity 不得包含这两个 role；选择 Definition 时两者分别绑定 `meeting_manager` 与 `verification_reviewer`。`evidenceReviewerId` 指向该 reviewer，Manager 身份由其唯一 role 确定。Manager 与 Contributor 逐 action 验证角色；Captain 不进入身份列表。

`IdentityRecommendation` 必含 `id`、`candidateId`、`definitionId`、`definitionVersion`、`catalogId`、`catalogVersion`、`agendaId`、`managerId`、`decision:admit|reject`、`status:provisioning|rejected|active|failed`、`rationale`、`expectedContribution`、`evidenceGap`、`createdAt`；`admit` 另必含 Runtime 分配或从该 candidate 既有 active recommendation 复用的 `identityId`、`sessionId` 和安全 Catalog candidate 的 `definitionHash`，`reject` 不含；optional `failureCode`、`resolvedAt`。`id` 同时是稳定 admissionId；全部 ID、时间和 Manager actor 由 Runtime 从可信 command/caller 生成，只有 candidate/catalog/Definition/Agenda 引用和理由由 Manager 提交。`reject` 直接终态 `rejected`，只含 resolvedAt。candidate 没有 active identity 时，`admit` 初始 `provisioning`，预留 ID 不构成 `identities` 中的真实身份且不在该阶段公开；Session/ownership/Definition provenance 可验证后一次原子转换为 `active` 并设置 definitionHash、resolvedAt，失败一次原子转换为 `failed` 并设置 RoleError failureCode、resolvedAt。candidate 已有 active identity 时，另一 Agenda 的 `admit` 直接创建新的 `active` recommendation，精确复用原 active recommendation 的 identityId、sessionId 和 Definition provenance，并用本次 command 的 Runtime now 写 createdAt/resolvedAt；不产生 effect、不追加 identity、不改变角色或权限。`end_meeting` 也在同一终态提交中将全部未完成 provisioning 置为 `failed/ADMISSION_CONFLICT`，再清理未激活 Session。`rejected|active|failed` 不再变更；同一 `(candidateId, agendaId)` 的 `provisioning|active` 阻止重复准入，同一 candidate 的任一 `provisioning` 阻止其他 Agenda 并发准入，active 则仅允许上述复用；`failed|rejected` 后可用新的 request 对该 pair 重新决定。状态/失败投影只向 Manager、Captain（本地用户）公开，Session/descriptor/ownership 永不投影。

local controller 是 Captain（本地用户）的入口实现名称；`manager` 不能创建 Position、Decision、RiskDisposition 或 CompletionFact；专职 `evidence_reviewer` 不能举手、持有 Contribution 或提交 Evidence。任一已授权 Meeting identity 可以记录 Question 或 Issue；只有经 Runtime 验证的可信用户入口可以 resolve Question 或 dispose Issue，用户不能冒充 MeetingIdentity record Question/Issue。Captain 的领域 actor 为 `{kind:"captain_user",id:captainActorId}`，其中 `captainActorId` 由 Meeting ID 确定性派生，不含或公开原 Session ID；应用层在进入纯领域转换前完成来源鉴别。所有正式事实记录 `actorId`，Captain 控制事实使用该 `captainActorId`，归档以 `{actorId,kind:"captain"}` 私有来源脱敏条目解析，不能混入 `identityProvenance`。

`MeetingLifecycle` 必含 `status`、`changedAt`、`changedBy`、`reason?`。status 仅为 `preparing|running|paused|converging|ending|terminal|archiving|archived`；合法边为 `preparing→running`、`running→paused|converging|ending`、`paused→running|ending`、`converging→ending`、`ending→terminal`、`terminal→archiving`、`archiving→archived`。不存在隐式失败边：Agent、Session 或投递失败必须先成为 Issue、Contribution exit 或显式 termination 的理由。`terminal` 必有 termination；`archiving` 必有已物化 archive，Session 关闭失败时保持 archiving；`archived` 必有完整 archive 且所有 Meeting-owned Session 已停止、关闭并撤销会议 capability。 纯 MeetingState snapshot validator 可核对 termination/archive 的静态字段与引用，但 Session close/capability revoke 的证明保存在受控 Runtime/Repository 边界，不在聚合字段中；因此不能将静态 archived 校验称为该外部前提已满足。

## Objective, Agenda, Question And Issue

`ObjectiveContract` 必含 `statement`、`requiredOutputs[]`、`acceptanceCriteria[]`、`hardConstraints[]`、`acceptableRiskLevel`。每个 required output 与 criterion 含稳定 ID 和初始 `pending` 状态；创建时不得为 accepted/satisfied。

`AgendaItem` 必含 `id`、`title`、`question`、`status`、`requiredOutputIds`、`ownerId?`。审核责任由 Meeting.evidenceReviewerId 全局持有，不在 Agenda 复制。状态仅为 `pending|active|blocked|completed|deferred|closed`；创建时由明确 initialActiveAgendaId 选定且仅有一个 active 项，除非 Meeting 已终止。

`AgendaCandidate` 必含 `id`、`title`、`reason`、`sourceMessageId?`、`status`；状态为 `pending|promoted|parked|rejected`，且只允许从 pending 转换一次。`parkingLot` 不是状态字段，而是所有 candidate 按 ID 排序的派生投影。

`Question` 必含 `id`、`actorId`、`agendaId`、`text`、`affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`blocking`、`status`；状态为 `open|answered|withdrawn|deferred`。blocking Question 至少关联一个仍未满足的目标引用。

`resolve_question` 仅从 `open|deferred` 进入 `answered|withdrawn|deferred`；answered/withdrawn 清除 blocking，deferred 保留旧 blocking。终结处置不能再次处置；理由、证据与旧/新 status/blocking 只保存在不可变 committed fact payload，不在当前 Question 复制历史。

`Issue` 必含 `id`、`actorId`、`agendaId`、`description`、`riskLevel`、`classification`、`affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`requiresEvidenceReview`、`blocking`、`status`、`rationale`。三组显式数组按写入顺序保存且各自不得重复，分别引用本 Meeting 的必要产出、验收条件和硬约束；审核需要用 boolean 指向全局 reviewer，不复制 reviewer ID。持久 classification 为 `blocking|follow_up|pending_discussion|accepted_risk|out_of_scope`，但 `record_issue` 只能创建 `blocking|follow_up|pending_discussion|out_of_scope`；`accepted_risk` 只能由合法 `dispose_risk` accept 转换形成。status 为 `open|resolved|deferred|out_of_scope`；riskLevel 为 `low|medium|high`，缺失不得推断默认值。创建时未接受的 high 风险必须 `blocking=true`；其他 open Issue 只有明确关联尚未满足的必要产出、验收条件、硬约束或 requiresEvidenceReview=true 时才可 blocking。创建时 `classification="blocking"` 必须与 `blocking=true` 成对；其它分类必须 `blocking=false`，不匹配的 caller 字段和无资格的 blocking 请求均拒绝而非改写。终结处置可以清除 blocking 但保留原 classification 作为历史分类；deferred 保留原值。

`dispose_issue` 仅从 `open|deferred` 进入 `resolved|deferred|out_of_scope`；resolved/out_of_scope 清除 blocking，deferred 保留旧 blocking。未接受 high 风险不能借 deferred 变成 non-blocking；终结处置不能再次处置。理由、证据与旧/新 status/blocking 只保存在不可变 committed fact payload，不在当前 Issue 复制历史。

## Round, Contribution And Evidence

`Round` 必含 `id`、`agendaId`、`planId`、`roundGoal`、`publicBaselinePublicationIds`、`openedAt`、`status`、`contributionIds`、`deadlineAt?`、`publicationId?`、`abortReason?`、`abortedAt?`。Manager 先提交 active `ManagerPlan(kind=open_round)`，其中 `roundGoal` 包含 `question`、`evidenceGap` 与 `expectedOutput` 三个非空字段；`open_round(planId)` 只接受该 active plan，原子复制目标、固定 baseline 并将 plan 标为 completed。它只细化已授权 Agenda，不创建 Agenda candidate，也不改变 Captain 对宏观 Agenda 的处置权。status 为 `open|published|aborted`。baseline 必须恰等于创建时全部 Publication ID；published 后不可变。只有 aborted 同时具有非空 abortReason 和 abortedAt，open/published 均不得具有这两个字段。

`EvidenceOpportunityRequest` 必含 `id`、`agendaId`、`contributorId`、`purpose`、`requestedAt`；只在 running Meeting 没有 open Round 时创建，指向 active Agenda，同一身份/议题至多一条 pending request。它不授予 Contribution。Manager `open_round` 原子把该 Agenda 的请求转为本轮 `PendingHandRaise`，申请原记录随即移除；Manager `dispose_evidence_opportunity` 可拒绝/暂缓并移除，须将理由通知本人。跨 Agenda、重复、已有未结束贡献或任务均拒绝。

`PendingHandRaise` 必含 `roundId`、`contributorId`、`purpose`、`raisedAt`；只允许指向 open Round、已认证且可参与的 contributor，按 `(roundId, contributorId)` 唯一。`raise_hand` 原子加入一个 pending request；Manager `dispose_hand_raise` 原子移除它。接纳时将其内容写入新 Contribution 的 handRaise，拒绝/暂缓时不保留待处置记录，也不创建 Contribution。Repository 追加申请与处置 fact 用于审计，不是另一份待处置业务状态；恢复只读 MeetingState 的 pending 集合。

`Contribution` 必含 `id`、`roundId`、`contributorId`、`handRaise`、`acceptedAt`、`status`、`packageId?`、`substantiveSupplementCount`、`supplementHand?`、`exitReason?`、`response?`。status 为 `preparing|registered|under_review|awaiting_response|withdrawn|submission_missing|timed_out|supplement_rejected|aborted|closed`。`supplementHand` 若存在，必含 `purpose`、`raisedAt`、`status: pending|accepted`、`acceptedAt?`；只在同一未结束 Contribution 内存在，Manager 接纳后才允许作者直接提交准备公开的新 EvidenceVersion。未通过 Runtime 确定性校验的内容不进入 Meeting，也不消耗实质补充次数。已送达当前审核后，重新申请须早于 sentAt + responseDeadlineMs；还须早于持久 Round 或适用 MeetingTask 期限。同一 contributor/round 至多一个 Contribution；同一 contributor 同时至多一个非终态 Contribution。拒绝或暂缓初次举手不创建 Contribution。`abort_round` 只在 running lifecycle 接受，把所有非终态 Contribution 置为 aborted 并写入非空 exitReason；paused 等非终态状态拒绝且不隐式恢复，aborted Contribution 不能被正常 publish 使用。

`EvidencePackage` 必含 `id`、`roundId`、`contributionId`、`authorId`、`agendaId`、`currentVersionId`、`versions[]`。`EvidenceVersion` 必含 `id`、`ordinal`、`observation`、`interpretation`、`method`、`falsifiers[]`、`uncertainties[]`、`limitations[]`、`claims[]`、`materials[]`、`submittedAt`、`status`、`failureCount`、`lastFailureReason?`。ordinal 从 1 连续递增；新版本不能改写旧版本的证据内容，但验证生命周期字段通过 aggregate transition 更新。`EvidenceStatus` 为 `submitted | validating | validated | validation_failed | validation_cancelled`；只有 `validation_failed` 携带 `lastFailureReason`，且 failureCount 必须大于 0。每个 Material 必含 `id`、`kind`、`originator`、`originalSource`、`sourcePublishedAt`、`acquiredAt`、`version`、`locator`、`location`、`verificationConditions`、`limitations`、`sharedDependencies`、`reason?`；unknown/not_applicable 使用显式 kind 及非空 reason。原始作者/机构、来源发布时刻、取得或观察时刻无法获知或不适用时，对应文本明确写“未知”或“不适用”并附非空 reason；其它 required 文本字段均非空。此结构与 Meeting Interface 的 `MaterialInput` 逐字段对应。

`Registration` 必含 `id`、`versionId`、`status=complete`、`createdAt`；只在作者提交的准备公开材料通过 Runtime 确定性校验并创建 EvidenceVersion 的同一转换中产生。拒绝输入无 Registration，不得存储失败 payload、评分、真实性或观点判断。

`EvidenceReview` 必含 `id`、`versionId`、`reviewerId`、`baselinePublicationIds`、`scope`、`dimensions`、`createdAt`。reviewerId 必须等于 Meeting.evidenceReviewerId。dimensions 的 source/credibility/completeness/support 每项均为 `{score:0|1|2|3|unable_to_assess, scope, reason, baselineEvidenceIds[]}`；引用上一轮证据时，ID 必属于所属 Round baseline 的已公开最终版本。baseline 必须等于所属 Round baseline。`ReviewDelivery` 必含 `id`、`reviewId`、`authorId`、`status`、`sentAt?`、`failedAt?`、`failureReason?`；failed 必有 `failedAt` 与非空 `failureReason` 且无 `sentAt`，sent 必有 `sentAt` 且无失败字段。同一 review 可有多次 failed 尝试，但最多一次 sent，仅 `sent` 可开启一分钟期限。Manager只读取状态，作者读取自身 delivery，reviewer 读取全部 delivery；其他未授权身份不得读取未公开 Review 的投递信息。

`EvidenceReviewClaim` 必含 `id`、`sourceEffectId`、`roundId`、`reviewerId`、`versionId`、`claimedAt`、`expiresAt`。它只引用 open Round 中 current、complete、状态可领取且尚无最终 Review 的单一版本；reviewerId 必须是唯一专职审核人；同一 version 至多一个 claim。Runtime 使用 Meeting version CAS 创建 claim 后把版本置为 `validating`，再唤醒 reviewer coordinator。coordinator 使用一个 DSH 原生 worker 计算该 version，携带 claimId 通过 `submit_evidence_review` 独立提交；worker 不是 MeetingIdentity，不进入 MeetingState，内部过程不持久化。提交不使用全局 Meeting version，而是在事务内精确匹配未过期 claim 的 round、reviewer 和 version，并再次验证仍为 current complete version；成功追加 Review、置为 `validated`、创建 delivery effect 并移除 claim。同轮其它 version 的结果不参与该提交原子边界。

执行失败通过 `fail_evidence_validation` 消费精确 claim：版本进入 `validation_failed`、failureCount + 1 并记录失败原因。`failureCount < 5` 才可再次领取；达到 5 后保持失败状态，Outbox attempt 不提前终止这一预算。有效 claim 阻止同 version 重复 effect 再次调度；其它 effect 去重完成，source effect 等待 expiry。未观察到 turn 结束时，expiry 触发 `review_timeout`，再按版本失败次数判断重试。Meeting pause 把所有 `submitted | validating` 版本置为 `validation_cancelled`、移除 claim 并完成旧 effect，不增加 failureCount；resume 为 cancelled current version 重新创建 review request。`abort_round` 则把 validating 版本置为 `validation_failed/review_interrupted` 并移除 claim。冷恢复只依赖 EvidenceStatus、claim 与 Review。同一 submit requestId 重放复用 receipt。正常 Round 收口还要求每份最终当前 Review 至少有一次 sent ReviewDelivery；只有 failed 的送达不得被当作已向作者送达。

每次成功的 `raise_supplement_hand` 都把非空 purpose 同时写入 Contribution.response 作为明确继续事实；补充版登记时清除此旧响应。计数低于二且 current version 不在审核中时，Manager accepted 保留 hand，允许作者直接提交准备公开的新版本；rejected 移除 hand 并把 Contribution 置 `supplement_rejected`，普通 deferred 只移除 hand、不退出。current version 正在审核时只能 deferred 且不退出。count=2 的第三次举手仍为 pending，Manager 只可 rejected/deferred，并将 Contribution 置 `supplement_rejected`。已明确继续但没有待 Manager 处置的 pending hand、到 currentVersion.submittedAt + taskDeadlineMs 与 Round/适用 Task deadline 的最早值仍未推进时，可以以“继续申请未完成” timed_out；有 pending hand 不因作者沉默超时。只有当前最终 Review 已 sent 才能按无响应的 sentAt+60000 标记静默超时。

原 Contribution 的默认准备期限：首次登记前是 acceptedAt + taskDeadlineMs，登记后补证是 package.currentVersion.submittedAt + taskDeadlineMs；两者分别与存在的 Round/适用 MeetingTask deadline 取最早值。重新申请与获批准后的正文提交都须早于该值，送达后的申请还须早于首次 sentAt + 60000。

## Publication, Outcome And Termination

`Publication` 必含 `id`、`roundId`、`seq`、`finalVersionIds`、`finalReviewIds`、`publishedAt`、`exitReasons[]`。本轮 pending hand raises 必须全部处置；每个接纳 Contribution 必须有确定终态，且每个登记 package 的 currentVersion 必须有最终 Review，才可创建 Publication。始终未通过校验的私有材料不形成 finalVersionId/finalReviewId。

`FormalMessage` 必含 `id`、`seq`、`actorId`、`agendaId`、`kind`、`body`、`publicationId`、`relatedIds[]`、`createdAt`；seq 全局严格递增。Message 只在 Publication 时产生。

`ProposalRevision` 必含 `id`、`proposalId`、`ordinal`、`actorId`、`agendaId`、`summary`、`body`、`evidenceIds`、`supersedesRevisionId?`、`createdAt`；同 proposal 的 ordinal 从 1 连续递增，supersedes 只能指向同 proposal 的立即前序 revision。`Position` 必含 `id`、`proposalRevisionId`、`actorId`、`stance`、`rationale`、`evidenceIds`、`createdAt`；stance 为 `support|oppose|abstain|conditional`。`DecisionCandidate` 必含 `id`、`proposalRevisionId`、`actorId`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`createdAt`；它不可变且无 status。`Decision` 必含 `id`、`candidateId`、`proposalRevisionId`、`actorId`、`status`、`outcome`、`rationale`、`evidenceIds`、`positionIds`、`replacesDecisionId?`、`createdAt`；status 为 `accepted|superseded|revoked`，outcome 为 `adopt|reject|defer`。`RiskDisposition` 必含 `id`、`issueId`、`actorId`、`action`、`scope`、`rationale`、`evidenceIds`、`createdAt`；action 为 `accept|reject`。`CompletionDeclaration` 必含 `id`、`actorId`、`outputId`、`criterionId?`、`statement`、`evidenceIds`、`taskId?`、`createdAt`；它不可变且不是 CompletionFact。`CompletionFact` 必含 `id`、`outputId`、`criterionId?`、`actorId`、`status`、`statement`、`rationale`、`evidenceIds`、`decisionIds`、`supersedesFactId?`、`createdAt`；status 为 `active|superseded|revoked`。ProposalRevision、Position、DecisionCandidate、RiskDisposition 与 CompletionDeclaration 追加后不可变；Decision 和 CompletionFact 只允许按下述显式操作改变 `status` 并追加 replacement，旧对象的其它字段不变。新 ProposalRevision 不继承 Position、Candidate 或 Decision。

Position 与 DecisionCandidate 只引用各 proposal 的 current revision，Candidate 的全部 `positionIds` 必须引用同一 revision。每个 Candidate 最多被一个 Decision 使用，同一 ProposalRevision 最多一个 accepted Decision；replacement Decision 只能使用同一 proposal 的 current revision 上尚未使用的 Candidate，并通过 `replacesDecisionId` 指向数组中更早的旧 accepted Decision，旧对象同次变为 superseded。CompletionFact 的替代同样只指数组中更早的 active fact：旧对象同次变为 superseded，每个旧 fact 最多有一个直接 replacement；revoked fact 不可再替代。replacement 后续被 revoke 或再次 supersede 时仍保留自己的 `supersedesFactId` 历史引用。

`MeetingTask` 必含 `id`、`createdBy`、`assigneeId`、`agendaId?`、`title`、`instructions`、`contextPublicationUpperBound`、`status`、`deadlineAt?`、`result?`、`exitReason?`、`createdAt`、`updatedAt`。status 为 `open|claimed|completed|cancelled|expired`；只有 assignee 可以 claim/complete，且 result 是任务结果而非 FormalMessage、Decision 或 CompletionFact。

`ArchivePackage` 是按值固化的类型化公开快照，必含归档元数据、Objective 最终状态、Agenda 与 candidate 处置、全部公开 Publication/FormalMessage、每个已发布最终 EvidenceVersion 及其 Materials/最终 Review、ProposalRevision、Position、全部 DecisionCandidate/Decision、CompletionFact、Question、Issue、RiskDisposition、Question/Issue disposition committed facts、Termination、未解决项、未收口 Contribution 内容快照、来源引用、identityProvenance、exportMaterials 和 status。未收口快照按 Termination 的 `unclosedContributionIds` 顺序逐项固化 contributionId、contributorIdentityId、agendaId、终止时 status 与 exitReason，两组 ID 必须精确相等；归档内引用由同包 Agenda 和 identityProvenance 解析，不依赖原 MeetingState。Question/Issue disposition fact 以 action kind 判别并绑定对应 payload，不能形成 kind/payload 错配。`identityProvenance` 是所有已激活身份的 `{identityId,displayName,roles,definitionId?,definitionVersion?,definitionHash?}[]` 固化快照，不含 sessionOwnershipId。未被 Decision 使用的 Candidate 仍保留但仅 local archive view 可见。`exportMaterials` 只是四类可选续会素材的目录；新 Meeting 保存的 `ContinuationMaterial` 是所选内容的只读按值副本，并剥离旧 identity、Session、authority 和领域状态，其中 formal message、accepted decision 与 active completion fact 使用显式 content DTO，不复制旧领域引用。归档包不含 Session、ownership、descriptor、PrivateMail、未发布 Evidence/Review、ReviewDelivery、举手、opportunity request、完整运行配置、capability、凭据、隐藏推理、工具过程、Repository 路径、Developer Markdown 或运行诊断。status 为 `pending|complete|failed`。

`MeetingLimits` 必含 `maxFormalMessages`、`maxDurationMs`、`taskDeadlineMs`、`reviewDeadlineMs`、`responseDeadlineMs=60000`。`Termination` 必含由后续 `end_meeting` 的受控 Runtime/Domain 命令上下文生成、调用者不得提交的 `id`，以及 `outcome`、`reason`、`endedAt`、`decisionIds`、`completionFactIds`、`unresolvedQuestionIds`、`unresolvedIssueIds`、`unclosedContributionIds`。outcome 为 `completed|partial|no_consensus|cancelled|failed`；`ArchivePackage.terminationId` 必须等于当前 `Termination.id`。

`maxFormalMessages` 只计 FormalMessage。每个 open Round 已接纳的 Contribution 派生占用一个预留名额，不新增 reservation 实体；该预留不因 Contribution 先进入终态而释放，只在所属 Round published 后由已创建 FormalMessage 替代，或在 Round aborted 时无消息释放。Manager 接纳新 hand 前要求 `messages.length + 全部 open Round 已接纳 Contribution 数 + 1 <= maxFormalMessages`。PublishRound 必须整体适配上限，不能合并作者记录、摘要替代原文或部分发布；恰好达到上限合法。发布整批事实后先重算 `isObjectiveSatisfied`：满足则同一转换进入 converging；不满足且消息数恰好达到上限则同一转换进入 paused，并记录 message budget exhausted，防止继续接纳或开轮。UI/Markdown 折叠不改变该派生计数。

Task extension: MeetingTask also requires authorizationId, authorizationStatus, attempt, reassignedFromTaskId optional, startedAt optional, completedAt optional. authorizationStatus is active, revoked, or expired. Reassign atomically revokes the old authorization and creates a new task/authorization; a revoked task can never claim, complete, or project a result. Task creation requires the caller's active contribution/task authorization and matching agenda/context. An assignee cannot hold a claimed mail and a nonterminal formal Contribution simultaneously.

ManagerPlan requires id, agendaId, managerId, basedOnPublicationId optional, kind, rationale, blockingReason optional, createdAt, and status; `kind=open_round` additionally requires roundGoal. kind is open_round, continue_agenda, stop_agenda, raise_agenda_candidate, or wait_for_required_identity. status is active, superseded, or completed. Manager creates a plan only when no Round is open. `open_round` consumes the exact active open-round plan; other plan kinds remain a persisted Manager decision and do not alter Agenda, Participant, or authority. Captain candidate disposition remains separate.

PrivateMail requires id, senderId, recipientId, agendaId optional, body, relatedIds, sendContextPublicationUpperBound, processingContextPublicationUpperBound optional, status, deadlineAt, createdAt, processingStartedAt optional, completedAt optional, failureReason optional. status is queued, processing, completed, timed_out, or cancelled. `senderId` and `recipientId` are distinct existing Meeting identities. `relatedIds` is a nonempty, duplicate-free array whose elements resolve only to a published `Publication.id` or `FormalMessage.id`. `sendContextPublicationUpperBound` equals the complete Publication ID prefix visible at send; `processingContextPublicationUpperBound`, when present, is a complete later-or-equal Publication prefix and begins with the exact send prefix. `deadlineAt=createdAt+limits.taskDeadlineMs` and both operands/result are nonnegative safe integers.

`queued` has none of `processingContextPublicationUpperBound|processingStartedAt|completedAt|failureReason`; `processing` has both processing fields and neither terminal field; `completed` has both processing fields plus `completedAt` and no `failureReason`; `timed_out|cancelled` has `completedAt` and nonempty `failureReason`, and retains both processing fields together only if processing had started. `processingStartedAt` is at least `createdAt` and strictly before `deadlineAt`; `completedAt` is at least `createdAt`, is at least `processingStartedAt` when processing began, is strictly before `deadlineAt` for `completed`, and is at least `deadlineAt` for `timed_out`. At most one processing mail may target an identity, and no processing mail recipient may own a nonterminal Contribution. Start and Contribution acceptance enforce that invariant in both directions. Completion, timeout and cancellation never create FormalMessage, Decision, CompletionFact or MeetingTask and never modify either context prefix or deadline.

Publication.exitReasons 与所属 Round.contributionIds 等长且同顺序；每个已接纳 Contribution 的终态必须有非空 exitReason，始终未形成合法登记而退出者的原因也保留，但不制造 finalVersionId 或 FormalMessage。

归档中的 Captain 控制事实使用 `captainActorId`；`ArchivePackage.controlActorProvenance` 必含且仅含一条 `{actorId:captainActorId,kind:"captain"}`。公开归档不保存输入 Session ID；私有 bootstrap.creator 仅保留创建来源审计，不承载用户 Session 授权锁。

`EvidenceReviewClaim.sourceEffectId` 绑定实际创建 claim 的 outbox effect。其它覆盖同一 version 的 effect 可安全去重完成；同一 source effect 的崩溃重投保持 retryable，不能在 claim 到期前误记为 delivered。Outbox 状态只负责运输，不替代 EvidenceStatus 或 ReviewDelivery。

## Derived Rules

`isRoundClosable`、`isObjectiveSatisfied`、`pendingDecisionCandidates`、`parkingLot` 和 caller-visible projections 必须是纯派生函数，不持久化第二份状态。pendingDecisionCandidates 只含当前 ProposalRevision 中没有任何 Decision 引用的 Candidate，且只在 lifecycle=`running|paused` 时非空；`paused` 表示恢复后可继续，`preparing|converging|ending|terminal|archiving|archived` 均返回空集合。该集合仅 用户 可见。业务完成只由已公开、required review 完整且 Decision basis 仍指向 current ProposalRevision 的 active CompletionFact、ObjectiveContract、hard constraints 和 blocking Issue 推导；因 Decision 撤销、替代或 Proposal revision 更新而失效的 active CompletionFact 仍保留为不可变历史，但不再满足目标。Task 完成、评分、轮次、CompletionDeclaration 或自然语言总结不直接完成 Meeting；当前模型不建立 CompletionDeclaration 与 CompletionFact 的消费关系。CompletionDeclaration 的 Participant 精确为 `MeetingIdentity.roles` 包含 `contributor` 的已存在 identity；该声明不授予 manager-only、evidence-reviewer-only、local controller 或外部 Captain。Proposal、Position、Candidate 只能由 Contributor 提交，Decision、RiskDisposition 与 CompletionFact 使用经鉴别的 Captain（本地用户）来源；这些写 action 只在 running 合法，满足完成条件进入 converging 后不通过它们重新打开。会清除 blocking Issue 并触发完成重算的 `dispose_issue` 也只在 running 合法，从而保持唯一的 `running→converging` 边。`dispose_risk` 只处置 `status=open` 的 Issue，`resolved|deferred|out_of_scope` 均拒绝。

## Acceptance

代码必须能以本文件逐项校验对象结构、引用、状态和值域；每个 Domain command 在拒绝时保持 state 引用等价，在成功时只产生本文件允许的新事实与确定的版本递增。
