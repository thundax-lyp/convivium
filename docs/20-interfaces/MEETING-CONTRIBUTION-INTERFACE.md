# Meeting Contribution Interface

状态：2026-09-15 最小并行切片的原接口已实现；同日用户确认 `save_evidence` 后选定材料立即对会议全员公开。下文标明新目标语义与尚未定义的公共材料读入口，不能将原 `readContribution` 或既有运行证据当作新语义已实现。实际运行与缺口见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

## Boundary

固定 roster；Manager 指派和审边界；Participant 提交自己的稿件和材料；固定审核员核验；Captain 接受正式成果、控制会议。所有写入经过同一个 Repository command，所有投递在 commit 后进行。材料保存在 Meeting domain，不新建文件服务器，不抓取 URL，不执行材料中的代码。

`save_evidence` 只保存作者主动选定的材料版本，并使其正文、来源、链接及本地路径文字在同 Meeting 对全体参会者可发现、可读；未保存的个人资料不进入 Meeting。它不发布待审稿正文或 claims，也不授予任何身份打开本地路径文件的额外权限。Manager 边界批准才发布确切稿件正文及关联 claims；固定 reviewer 不因核验身份预读私稿。证据核验是另一项事实：已共享材料和已发布稿可以仍为 pending，负面核验不得删改正文；影响完成的声明必须引用已经具备支持结论的公共依据。作者不能审核自己提交的材料，包括引用他人稿件中属于自己的材料。

## Creation And Compatibility

`CreateMeetingInputV1` 增加 required `evidenceReviewerKey:string`。省略返回 `INVALID_ARGUMENT`，不按姓名或 role 猜测；该 key 必须在 participants 中，且会议至少两位 Participant。Schema 与 Runtime 在持久化和 Session provisioning 前执行校验。只保证本版本合法输入的原 caller/hash 创建回执重放，不为旧版本输入绕过新增约束。

新会议总是初始化 `MeetingState.contributions`；仍为 formatVersion=2，不提供开关。按需求的本次新版本发布边界，不提供旧记录兼容、旧启动恢复或自动升级；缺少 contributions 的记录不进入新模型执行，返回 `UNSUPPORTED_CAPABILITY`，不改写记录。字段 present 但非法时恢复失败，不能作为缺省值继续执行。本版本的暂停、结束、冷恢复、归档和幂等保证不变。

新创建只接受 selectionMode 省略或 manager；拒绝非 manager 值及 limits 中 maxTurns/maxSpeakersPerTurn/maxConsecutiveSpeechesPerSpeaker/maxStalls/maxReplans。仍接收 maxTotalMessages、maxDurationMs，省略分别使用 32 和 1800000 ms；内部尚存的 Turn 字段不构成旧版本兼容承诺，新流程不消费 Turn 限制。contribution 与 review timeout 固定 600000 ms，不新增配置。

submitTurn、submitManagerPlan、raiseHand、reassignTurn、MeetingTask 创建／开始／完成、MeetingMail 发送／完成、动态 attendance 处置返回 `UNSUPPORTED_CAPABILITY` 且零副作用；不提供旧会议分流执行。研究在贡献任务中进行，原异步 MeetingTask／Mailbox 不接入新任务授权。Decision 接受／处置、Risk 处置、AgendaCandidate 处置、Scribe 正文及本版本 continuation 保留业务约束；不重新启动 Turn，改为下文 Manager 通知。此差异不删除用户数据。

## Wire Contract

新增 Agent 工具 `convivium_contribution`、`convivium_read_contribution`，均为 `{input:...}`。沿用 Protocol V1 success/error envelope、真实 caller resolver、规范化序列化、错误码。所有对象 exact-key，所有 ID trim 后 1～256 字符；数组拒绝重复；数字均为非负 safe integer。未标 `?` 的字段 required；没有 null。完整输入 UTF-8 规范 JSON ≤16384 bytes。required 文本字段 trim 后非空；规范化按定义的字段顺序重建对象，数组保持输入顺序，使相同字段内容不因输入属性排列而产生不同 hash。

```ts
type ContributionPhase = "preparing" | "boundary_review" | "returned" |
  "captain_action" | "published" | "cancelled";
type EvidenceVerdict = "supports" | "partially_supports" | "does_not_support" | "unverifiable";
interface ContributionWriteBaseV1 {
  protocolVersion: 1; meetingId: string; requestId: string; expectedMeetingVersion: number;
}
interface EvidenceMaterialV1 {
  title: string;
  kind: "web" | "document" | "data" | "experiment" | "code" | "interview";
  source: string; sourceDate: string; collectedAt: string; locator: string;
  observation: string; methodAndConditions: string; limitations: string; dependencies: string;
  material: { kind: "text"; text: string } |
    { kind: "reference"; uri: string; sourceVersion: string };
  code?: {
    repository: string; revision: string; pathsAndSymbols: string;
    patchEvidenceKeys: readonly string[];
    validation: "static_only" | "executed";
    reproduction: string; expected: string; observed: string; notCovered: string;
  };
}
interface EvidenceCitationV1 {
  evidenceKey: string; claim: string; locator: string; inference: string;
}
type ContributionBodyV1 = Omit<TurnSubmissionV1,
  "protocolVersion" | "meetingId" | "turnId" | "stepId" | "attemptId" |
  "deliveryId" | "agendaItemId">;
type ContributionCommandV1 = ContributionWriteBaseV1 & (
  | { action: "assign"; participantId: string; agendaItemId: string; instruction: string;
      targetIds: readonly string[]; requiredForCompletion: boolean; requiresEvidenceReview: boolean }
  | { action: "save_evidence"; contributionId: string; generation: number;
      evidenceId?: string; expectedEvidenceRevision: number; material: EvidenceMaterialV1 }
  | { action: "submit"; contributionId: string; generation: number; expectedDraftRevision: number;
      basedOnSeq: number; body: ContributionBodyV1; citations: readonly EvidenceCitationV1[] }
  | { action: "boundary_review"; contributionId: string; generation: number;
      draftRevision: number; decision: "approve" | "return"; reason: string; checkedThroughSeq: number }
  | { action: "evidence_review"; contributionId: string; generation: number; draftRevision: number;
      reviews: readonly { evidenceKey: string; claim: string; verdict: EvidenceVerdict;
        method: string; result: string; limitations: string }[] }
  | { action: "retry" | "cancel"; contributionId: string; generation: number; reason: string }
  | { action: "notify_manager"; reason: string }
);
interface ReadContributionInputV1 {
  protocolVersion: 1; meetingId: string; contributionId: string; evidenceKey?: string; draftRevision?: number;
}
interface ContributionResultV1 {
  contributionId?: string; generation?: number; phase?: ContributionPhase;
  evidenceKey?: string; draftRevision?: number; messageId?: string;
  managerNoticeSeq?: number;
}
```

结果字段规则：assign/retry/cancel 总有 contributionId/generation/phase；save_evidence 另有 evidenceKey；submit 另有 draftRevision；boundary_review 另有 draftRevision，approve 另有 messageId；evidence_review 另有 draftRevision/messageId；notify_manager 只有 managerNoticeSeq。不得把任意 optional 组合当作合法 result。

公共材料还需要让全体参会者枚举已保存的 evidenceKey 并按 key 读取确切版本；现有 `ReadContributionInputV1` 以 contributionId 和可见稿件为前提，不能作为未公开任务材料的公共读入口。其 wire 字段、投递上下文与 Schema 尚未定义，产品实现前须补成独立、可验证的接口契约；不得以扩大私稿读取权限或从状态猜测 evidenceKey 代替。

`ContributionBodyV1` 使用现有 TurnSubmission 正文字段的 Schema，不接受调度字段。taskIds 及 completionClaims 中所有 taskIds 必须空；非空报 UNSUPPORTED_CAPABILITY。共同论证五项继续体现在 content，并由 Manager 审核，不新增自动语义校验器。mentions、replyTo、changes、minutesDraft 与现有实体约束一致。

## Material And Capacity

每个 material（含元数据）规范 JSON ≤8192 bytes；每个 submit 输入 ≤8192 bytes；每个 evidence_review 输入 ≤8192 bytes。title≤256 字符；source/sourceDate/collectedAt/locator≤1024，其余元数据≤2048；instruction/reason≤2048；每条 citation 的 claim/locator/inference≤1024。正文 content≤4096 字符且受字节上限。text 非空；未知／不适用用明确说明，不省略 required 字段。

reference.uri 只接收无 username/password 的 HTTPS URL；sourceVersion 必填。本地文件路径作为 locator/source 等定位文字保存并公开，不自动读取、上传、复制或授予其他身份访问文件内容；仅有路径文字时必须如实标明材料内容不可访问或核验缺口。unknown 明确表示未固定，不得标为充分核验。二进制及以 base64 包装二进制不在范围内；Schema 不试图识别任意文本是否为编码，工具指导禁止用编码绕过材料范围，审核员确认实际材料可核验性。

kind=code 时 code 必填，其他 kind 禁止 code。revision 记录 commit 或受控快照版本，不能只填分支名；代码补丁及新文件内容保存为 text 材料，patchEvidenceKeys 指向固定版本。引用必须同 Meeting、已保存并公开、当前 caller 可读，禁止引用自身和未来版本；固定 reviewer 的身份不产生私有材料引用权。static_only 必须明确未执行；executed 提供实际命令／环境／输入／输出；Runtime 不认证文字真实性。

每 Meeting 最多 64 项任务、128 个稿件版本、128 个材料版本；每稿最多 8 条 citations，以 evidenceKey+claim 唯一。超限整体拒绝 INVALID_ARGUMENT，保留状态。材料和稿件以 keyed record 保存，不在数组中嵌入大对象。单条 commit 65536 bytes、checkpoint 16777216 bytes 保持不变。

新状态另有容量不变量：去除 contributions、archive、termination、pauseReason、pausedAt、pausedBy、pausedFromStatus、waitState、version、updatedAt、eventSeq、status 后的 canonical Meeting JSON≤24576 bytes；contributions 整体≤2097152 bytes。该校验在 repository schema 的新状态校验内执行，涵盖所有 Captain／领域写入口。归档只增加任务／材料引用，禁止复制 contributions。到达容量上限时不能截断或改上限。新会议单次 termination／waitState 的规范 JSON 各≤4096 bytes，pause/control reason≤2048 字符；超限控制请求拒绝，使用合限原因仍可暂停、结束和归档。

## Canonical Ownership And Mapping

canonical 精确字段见 [Domain Model — Minimal Contribution State](../30-designs/DOMAIN-MODEL-DESIGN.md#minimal-contribution-state)。wire 与 Domain 的字段映射按该节及 [Contribution Design](../30-designs/MEETING-CONTRIBUTION-DESIGN.md#domain-symbols) 执行，不保存函数、DSH 对象或 Protocol 实例。

ID/版本来源固定如下：

- Runtime 在一次请求开始取一个 now；所有 actor 来自授权身份：participantId、manager、captain 或 local_host，不接受输入 actor。
- assign 的 ID 为 `contribution-`+SHA256(meetingId+NUL+callerBinding+NUL+requestId) 前 32 个 hex。generation 初值 1，重试、暂停、取消、超时各 +1。
- 新材料省略 evidenceId 且 expectedEvidenceRevision=0；evidenceId 以相同 hash 输入派生，前缀 evidence-。更新须匹配材料所有者及最新 revision，生成 latest+1。key=`evidenceId:revision`；旧版本不可变。
- drafts key 为十进制 revision，初始 currentDraftRevision=0，新稿 +1；messageId=`message-<contributionId>-<revision>`。公开 seq 在批准 commit 时取 messageSeq+1。正文 createdAt 与 message.added 时间使用批准 now；submittedAt 保留作者提交时间。
- claims 的 ID 复用旧 normalizer 的各实体前缀，以 `<contributionId>-<revision>` 替换旧 deliveryId seed；同版本重放不重新生成。completion factId=`completion-<contributionId>-<revision>-<kind>-<index>`，在公开时由 Runtime 提供给纯 transition；不保存函数。
- 幂等键仍为 requestId+commandKind+callerBinding，commandKind=`contribution:<action>`，hash=serializeValidatedRequestV1 的结果。先按现有规则验证 caller，再查 receipt，命中后不再次验证 generation。CAS 冲突报 VERSION_CONFLICT，客户端读新版本并用新 requestId 重试，不隐式重试外部写入。

## State Transitions

assign 的 task 初始化：drafts={}、currentDraftRevision=0、boundaryReviews=[]、evidenceReviews=[]、returnCount=0、reviewStatus=not_required，省略 messageId/reason/pausedRemainingMs；createdAt=updatedAt=now。没有独立持久化的 draft working copy。

running/waiting 均允许 Manager 安排；assign 将 waiting 变回 running。paused 禁止贡献写入；终态仅允许既有授权下的成功 receipt 重放。一个作者未结束任务定义为非 published/cancelled，或 published 且 reviewStatus=pending/captain_action。审核员可以顺序处理多项核验，但有核验未结束时不能被指派自己的研究任务；其自己的研究未结束时也不能 assign 需要它审核的新任务，返回 INVALID_STATE_TRANSITION。

| action | caller／精确前置 | 原子结果及投递 |
| --- | --- | --- |
| assign | Manager；作者有效 ownership 且空闲；议题等于 activeAgendaItemId；targetIds 属于当前 required output/criterion，required 时非空 | preparing、generation=1、basedOnSeq=messageSeq、deadline=now+600000；准备投递；刷新 managerDeadlineAt |
| save_evidence | 当前任务作者；preparing/returned；匹配 generation；同一材料仅作者能更新 | 新版本加入 evidence map 并立即成为本会议全员可发现、可读的共享材料；不发布待审稿或 claims，材料公开不等于核验通过 |
| submit | 当前作者；preparing/returned；匹配 generation、expectedDraftRevision；task.basedOnSeq≤basedOnSeq≤messageSeq；引用可读 | 新不可变稿件；boundary_review；deadline=now+600000；通知 Manager |
| boundary_review:return | Manager；boundary_review；匹配 generation/revision；checkedThroughSeq=messageSeq | 保存审核；returnCount+1，≤2 时 returned、generation+1、deadline=now+600000 并投递作者；>2 时 captain_action、generation+1、通知 Captain |
| boundary_review:approve | Manager；同上；当前议题仍一致；全部 claims 可应用 | 同一 commit 发布原文和 claims，phase=published；requiresEvidenceReview 且 citations 非空时 reviewStatus=pending、deadline=now+600000 并投递审核员，否则 not_required；通知 Manager |
| evidence_review | 固定 reviewer，所有被审材料 submittedBy 均不是自己；phase=published；reviewStatus=pending；匹配 generation/revision；reviews 恰好覆盖全部 citations | 保存结果；reviewStatus=complete；正文不变；通知 Manager；部分／不支持／无法核验均保留原结论 |
| retry | Captain/local；未公开且 returned/captain_action/cancelled，或已公开且 reviewStatus=captain_action；身份可投递 | 未公开：generation+1、preparing、returnCount=0、刷新上下文／deadline；已公开：generation+1、reviewStatus=pending，仅重投审核；不重发正文，不复用旧授权 |
| cancel | Captain/local；尚未公开 | generation+1、cancelled，保留必需属性及全部历史；commit 后 interrupt 该作者 owned Session；通知 Manager |
| notify_manager | Captain/local；running/waiting | 新 notice，不改变稿件、材料和正式事实；waiting→running，刷新 managerDeadlineAt |

save_evidence/submit/boundary_review/evidence_review 必须 now<对应 deadlineAt；已到期而扫描尚未执行也报 STALE_ATTEMPT，零副作用，随后由周期扫描记录 expired。retry 还须检查作者没有另一项未结束贡献、reviewer 的研究／核验互斥条件，不能借恢复已取消任务绕过单人限制。

requiresEvidenceReview=true 必须有非空 citations，且固定 reviewer 不是作者或任何所引材料作者；在 assign 校验作者，在 submit 校验材料作者。普通假设可无材料、无需核验。一个证据主张可复用已有精确 evidenceKey+claim 的 supports 结论，但不能把结论泛化至另一个主张。

边界审核只绑定该稿件和 checkedThroughSeq；公共消息变化时 Manager 读取增量，确认无实质影响后按新上界批准，或明确退回。Runtime 只校验上界相等，不做语义判断。公开后不因后来新消息自动撤回、改稿或重审。

completionClaims 中 outputClaims、criterionClaims、agendaResolution、review=approved 的 evidenceMessageIds 必须非空并引用既有正式消息。引用消息必须含 citations，且每条 citation 有同 evidenceKey+claim 的 supports 独立结论；pending/其他结论不充当支持。在 submit 及 approve 都检查，失败 INVALID_STATE_TRANSITION；作者先提交证据，核验后再以新任务提交完成声明。questionResolutions、review=changes_required、riskAcceptance 继续原有规则，不把负面结论阻挡在公共记录之外。

completed 的门槛还统一检查全部 active 的正向 output/criterion/review/decision 完成事实所引用的 evidenceMessageIds：在新会议中，这些消息必须满足前段的支持依据规则；Captain 的接受入口也执行同一检查，不允许绕过 Participant claims 门槛。risk 接受只表明明确承担风险，不把材料标为 supports。completed 的其他门槛是既有 isObjectiveSatisfied 为真，且所有 requiredForCompletion 任务已 published，并且其 requiresEvidenceReview 核验均 complete。complete 表示核验已给出结论，不等于 supports；真正的完成声明还须通过前段的支持依据检查。cancel 不豁免 required 任务；可以 retry，或由 Captain 用原有授权结束为 partial。无关任务不阻塞目标完成。

每次正式事实写入后及周期扫描：先检查 completed，再检查 maxTotalMessages/maxDurationMs，命中预算且目标不满足则 partial（message_limit/time_limit），最后保留未结束任务。无任务可继续且 managerDeadlineAt 到期，会议进入 waiting，以 waitState={reason:"captain_action",waitingSince:now,taskIds:[],participantIds:[],resumeAgendaItemId:activeAgendaItemId} 写入既有 waiting 投影，不自动分派全员或 fallback。Manager 每次合法 assign/review 更新自己的 deadline；reviewer 完成核验或 Captain 处置生成的新 Manager notice 也刷新 deadline=now+600000；Captain notify_manager 可明确唤醒。任务／审核 deadline 到期分别进入 phase=captain_action 或 reviewStatus=captain_action，并增加 generation；不自动通过。

## Agenda Advancement

每次 evaluateContributionProgress 在 completed、message_limit、time_limit 均未命中后执行一次推进检查。当前议题 status 为 resolved/deferred，且属于它的全部 requiredForCompletion 任务均 published、所需核验 complete 时，选择 agenda 数组中首个 status=pending 的议题。没有符合项则保持 activeAgendaItemId，不循环、不重开 resolved/deferred 议题，仍允许当前议题的补充贡献以满足全局成果条件。当前议题尚未结束或 required 门槛未闭合时不切换。

切换同事务将旧议题全部未公开的非 required、未 cancelled 任务取消：generation+1、phase=cancelled、reason=agenda_advanced，保留历史并发 controlled(action=cancel,reason=agenda_advanced)。已公开任务及 pending 核验保留，可跨议题完成核验；旧私稿的 submit/approve/retry 不得恢复发布（retry 未公开任务必须仍属于当前议题，否则 INVALID_STATE_TRANSITION）。新议题 status=discussing，activeAgendaItemId=新 id；发 contribution.agenda_advanced，payload={fromAgendaItemId:string,toAgendaItemId:string,actor:"runtime",at:number}；最后生成一次 Manager notice，deadline=now+600000。事件顺序为本次事实事件→旧任务 controlled→agenda_advanced→manager_notified。若会议同时终止，不推进、不生成这些通知。

该规则适用于创建时多个议题及 Captain 正式接纳的新 pending 议题；不改变 Captain 接纳权限、既有议题完成条件或风险约束。

## Events, Delivery And Lifecycle

新增 Domain 事件：contribution.assigned、contribution.evidence_saved、contribution.submitted、contribution.boundary_reviewed、contribution.evidence_reviewed、contribution.controlled、contribution.expired、contribution.manager_notified、contribution.agenda_advanced。

前七种 payload 基本字段 `{contributionId:string,generation:number,actor:string,at:number}`；evidence_saved 增 evidenceKey；submitted 增 draftRevision；boundary_reviewed 增 draftRevision/decision（approve|return）；evidence_reviewed 增 draftRevision/verdicts（按 citation 顺序的 EvidenceVerdict[]）；controlled 增 action（retry|cancel|pause|resume|end|delivery_failed）/reason；expired 增 stage（prepare|boundary|evidence）。manager_notified 为 `{noticeSeq:number,contextThroughSeq:number,actor:string,at:number}`。不在 event 中复制稿件、材料、私有原因。

批准事件顺序：boundary_reviewed → message.added → 现有 Question/Issue/Proposal/Position/AgendaCandidate/DecisionCandidate/completion 事件 → meeting 状态事件 → manager_notified。receipt/result、state、event、outbox 同 commit；一个非法 claim 导致整体回滚，不能只发布正文或先应用完成事实。

Outbox kind=dispatch，新增两个 payload：

```ts
type ContributionDelivery =
  { role: "contribution"; contributionId: string; generation: number;
    purpose: "prepare" | "evidence_review"; draftRevision: number; contextThroughSeq: number } |
  { role: "contribution_manager"; noticeSeq: number; contextThroughSeq: number };
```

准备时 draftRevision=0；审核时为已公开版本。deliveryId 分别为 `<contributionId>:<generation>:<purpose>:<draftRevision>:<contextThroughSeq>` 与 `<meetingId>:manager:<noticeSeq>`。managerNoticeSeq 从 0 递增；创建完成、submit、publish、review、cancel、timeout、Captain 正式事实处置及 notify_manager 各生成一次通知；同 command 最多一次。通知若发生在 paused/终态，只产生状态刷新，不创建 DSH outbox；任务 timeout 进入 Captain 状态时刷新 Manager deadline，并记录摘要可见的 reason。没有定时全员唤醒。

上下文类型固定如下，定义在 protocol/contribution.ts，由 projection/contribution.ts 的 projectContributionContext 显式构造：

```ts
interface ContributionPublicContextV1 {
  topic: string; objective: string; objectiveContract: PublicObjectiveContractV1;
  activeAgendaItem: PublicAgendaItemV1;
  messages: readonly PublicMeetingMessageV1[];
  acceptedDecisions: readonly PublicDecisionV1[];
  blockingFacts: readonly PublicBlockingFactV1[];
  participants: readonly {id: string; displayName: string}[];
}
interface ContributionContextV1 {
  protocolVersion: 1; meetingId: string; meetingVersion: number; deliveryId: string;
  purpose: "prepare" | "evidence_review" | "manager"; contextThroughSeq: number;
  publicContext: ContributionPublicContextV1;
  work: {kind:"prepare";task:ContributionSummaryV1;instruction:string;returnReason?:string} |
    {kind:"evidence_review";submission:ReadContributionResultV1} |
    {kind:"manager";pending:readonly ContributionSummaryV1[]};
}
```

publicContext 只含 seq≤contextThroughSeq 的 Transcript；其他安全事实取投递前已提交的当前快照，不冒充历史状态快照。objectiveContract 复用现有 Speaker projector 的字段映射，activeAgendaItem/acceptedDecisions/blockingFacts 使用现有 status 安全 mapper；不能调用要求旧 attempt 的 projectSpeakerMeetingContext/projectManagerMeetingContext。participants 只含 id/displayName，不含 Session／provenance。

准备 work 只有任务摘要、指令和最新一次 returnReason（存在时）；核验 work 只有授权的已发布当前稿；Manager pending 只含 boundary_review 任务摘要，按 createdAt/id 排序；Manager 必须按 ID 调 readContribution 取得稿件后审核，不在通知里复制整个待审队列正文。其它公开任务通过 status 读取，不把所有私有稿件塞入广播。若 Manager noticeSeq 已不是当前 managerNoticeSeq，则 ack 旧通知，不再发送；新通知读取当时待审队列。

工具指导要求每次写前读取当前 meetingVersion；重投固定 Transcript 上界，其他当前状态可变且标识实际 meetingVersion。deliveryId 是输入投递的去重依据，不声称携带不可变完整 Meeting snapshot。Manager 批准始终受 checkedThroughSeq/CAS/稿件版本约束。

同 Session 投递按 ownership.sessionId 排队；不同 Session 不互相等待模型结果。复用 sendAuthorizedMeetingMessage 的 before/after 验证，校验任务 generation／状态、Meeting 状态及当前 ownership。DSH sendMessage 接收后即可 ack outbox，不等待模型研究完成；ack 丢失使用同 deliveryId 重投，业务提交靠 receipt 和任务状态防重。保留现有 worker lease/retry/stop，不新增后台 worker。

暂停先原子保存每项活跃阶段 `pausedRemainingMs=max(0,deadlineAt-now)`，增加 generation，保存 Manager 剩余时间；再 interrupt owned Sessions。恢复移除剩余时间字段，deadline=now+remaining，按 preparing/returned 或 published pending 重投；boundary_review 发 Manager notice。published complete/cancelled 不重投。会议总预算沿现有 now-createdAt 口径，包括暂停及停机时间；恢复时先判断目标 completed，再判断预算；目标未满足且预算耗尽才 partial，两种终止均禁止恢复投递。

永久投递失败或重试耗尽：仅对仍匹配的 task generation 设置未公开 phase=captain_action 或已公开 reviewStatus=captain_action，并增加 generation、记录 reason=errorCode；Manager notice 失败仅在 noticeSeq 仍为当前值时进入 waiting，waitState.reason=captain_action。失败前已提交的稿件／批准仍是成功，不撤回 receipt，不自动 fallback。过期失败回调无副作用。

cold recovery 先恢复 state/receipts/outbox，再做原 Captain 与 owned Sessions 的既有 reconcile。每个 Runtime 实例生成一次 recoveryEpoch，同一会议在本实例只处理一次；内部 requestId=`recover-contribution:<recoveryEpoch>`。活跃任务 generation+1，按原 deadline（含停机时间）处理过期或生成新投递；paused 不重投，终态只恢复归档。确切防重和调用顺序见 Contribution Design 的 DSH Delivery And Recovery。缺原 Captain 时保持可读、不可投递，不能自创 parent。

结束先校验 outcome，再失效所有活跃 generation；未公开项 cancelled，已公开未审项 reviewStatus=captain_action，reason=meeting_ended；不删除正文或材料。commit termination 后复用 interrupt、归档、capability revoke、清理验证。任何清理失败保持 archiving；新写拒绝，恢复重试不重复正文。

## Projection, Read And Archive

Status 增 optional `contributions:{reviewerId,tasks:ContributionSummaryV1[]}`，仅新会议存在。摘要字段固定 `{id,participantId,agendaItemId,phase,generation,currentDraftRevision,requiredForCompletion,requiresEvidenceReview,reviewStatus,deadlineAt,messageId?}`，按 task 的 createdAt/id 排序后映射；不含稿件、材料、指派理由、审核理由。Captain/local/Manager 可见全部摘要；Participant 可见自己的未公开项和全部 published 项，reviewer 另可见其已发布待核验项。

`readContribution` 返回 `{task:ContributionSummaryV1,drafts:ContributionDraftV1[],boundaryReviews:BoundaryReviewV1[],evidenceReviews:EvidenceReviewV1[],evidence?:EvidenceVersionV1}`。这里的三个 V1 记录逐字段等同上面 Domain 记录，经显式 mapper 输出，不传播 Session ID、capability 或 canonical state 的其他字段。

读取版本选择：draftRevision 省略时取 currentDraftRevision；显式值必须为现有正整数版本且在权限范围。drafts 长度为 0（尚无稿）或 1；boundaryReviews/evidenceReviews 仅返回所选版本的记录。Captain/local/作者/Manager 可按版本读取历史，不一次返回所有稿件；其他身份只能选当前公开／获指派版本。

稿件读取权限：Captain/local/Manager 可看本会议全部版本及边界记录；作者只看自己的未公开稿与记录；固定 reviewer 与其他 Participant 一样，只能通过 `readContribution` 读取 published 的 currentDraftRevision、空 boundaryReviews 和该稿的 evidenceReviews，不能读取 boundary_review 或 returned 私稿，也不能提前写核验结果。原 `readContribution` 的 evidenceKey 仍只限于该视图稿件引用的版本；公共材料的全员枚举和按 key 读取另须上文所述的新入口。不存在／无权限私稿统一 UNAUTHORIZED_CALLER，避免泄漏。

MeetingMessage、PublicMeetingMessageV1、ArchiveMessage 增 optional contributionId/contributionRevision。MeetingMessage 的旧 turnSeq/turnId/stepId/attemptId 改 optional；PublicMeetingMessageV1 和 ArchiveMessage 仅有的旧 turnId/stepId 改 optional，不新增其原本没有的字段。各层两套来源必须恰有一套完整；新消息不填虚构 Turn。公开序号、正文、作者、时间及其他字段沿用原有语义。这些内部来源类型不构成旧版本兼容承诺。Client 显示贡献状态，不提供 Turn 操作，不要求保留旧视图。

ArchivePackage 增 optional `contributionRefs:{taskIds:readonly string[],evidenceKeys:readonly string[]}`。taskIds 只含 published 任务；evidenceKeys 须覆盖全部已保存并公开的材料版本及其 patch 依赖闭包，排序去重；材料仍在封存的 snapshot，核验记录仍在任务，不能复制 contributions 到 archive。归档后公共材料按此白名单读取，公共稿件也只限于 published taskIds；Captain/local 的原审计读取权限保留，不能通过公共 archive 导出私有草稿。当前实现仍只收集已发布稿的引用闭包，见 readiness 的 Not Covered。

Local Remote 新增 readContribution、controlContribution；control 只接受 retry/cancel/notify_manager，分别复用上述 input 子联合。本地用户无权替 Manager 批准或代审核员核验。输入限制仍为 16384 bytes，保留原 Typert AbortSignal、错误和刷新流；成功 commit 发现有 refresh notice。UI 只渲染普通文本与用户显式打开的 HTTPS 链接。

## Errors

格式／长度／容量：INVALID_ARGUMENT；跨身份、跨会议、材料自审：UNAUTHORIZED_CALLER；不存在公开实体：INVALID_ENTITY_STATE；generation／draft 不匹配：STALE_ATTEMPT；状态、未核验完成依据及重复占用：INVALID_STATE_TRANSITION；旧入口用于新会议：UNSUPPORTED_CAPABILITY；CAS／receipt 内容冲突沿用 VERSION_CONFLICT／IDEMPOTENCY_CONFLICT；terminal 沿用 IMMUTABLE_MEETING／ARCHIVED_MEETING。所有拒绝零副作用，不泄漏材料内容。重试属性沿现有 mapCommandError，不增加同义错误。

## Related Documents

- [Agent Meeting Protocol](./AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Contribution Design](../30-designs/MEETING-CONTRIBUTION-DESIGN.md)
- [Storage Interface](./MEETING-STORAGE-INTERFACE.md)
- [Current Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
