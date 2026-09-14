# Meeting Contribution Design

状态：最小并行贡献的目标设计，尚未实现。行为、字段、权限、容量和兼容策略唯一依据为 [Contribution Interface](../20-interfaces/MEETING-CONTRIBUTION-INTERFACE.md)。本文固定代码所有权、接线与验证。本版本不要求兼容旧版本；不新增旧启动分支、兼容适配器或历史测试迁移。保留的内部旧类型不代表对旧记录的执行承诺，用户数据不自动迁移或删除。

## Responsibility And Dependency

Domain 保存纯数据和状态转换，不依赖 Protocol、DSH、Repository。Runtime 把已校验的 wire 输入转换为 Domain 数据，生成 ID／时间、授权、原子 commit 和 outbox；DSH adapter 只执行已授权发送；Projection 显式选择可见字段。通过各模块 index 导出跨模块所需符号，不新增包、服务或存储 provider。

新文件固定如下；没有别名路径或替代位置。以下签名使用 TypeScript 类型约束，不是伪代码；实现时所有列出的函数、interface、type 均具名 export，由对应 index 显式导出实际跨模块使用项。类型引用的现有文件在 File Manifest 中列明。ContributionDelivery 是 Interface 的 outbox 子联合，由 domain/contribution.ts 导出；不依赖 Protocol。

## Domain Symbols

`plugin/src/domain/contribution.ts` 定义接口中的 EvidenceMaterial、EvidenceCitation、EvidenceVersion、BoundaryReview、EvidenceReview、ContributionDraft、ContributionClaims、ContributionTask、ContributionState、ContributionPhase、EvidenceVerdict。

同文件定义 `ContributionActor = {kind:"manager"|"captain"|"local_host"|"runtime"} | {kind:"participant";participantId:string}`。`DomainContributionCommand` 复制 wire action 子联合的业务字段，去除 protocolVersion/meetingId/requestId/expectedMeetingVersion；submit 的 body/citations/basedOnSeq 换为一个 `draft:ContributionDraft`，保留 contributionId/generation/expectedDraftRevision；其余 action 字段类型完全同接口，不导入 Protocol 类型。Runtime 必须逐 action 构造，不用类型断言把 wire 冒充 Domain command。

```ts
// domain/contribution.ts
function createContributionState(reviewerId: string, now: number): ContributionState;
function isContributionState(value: unknown): value is ContributionState;
function contributionWorkComplete(state: MeetingState): boolean;
function assertContributionEvidenceMessages(state: MeetingState, messageIds: readonly string[]): void;
function assertContributionCapacity(state: MeetingState): void;

// domain/transitions/contribution.ts
interface ContributionTransitionContext {
  now: number;
  actor: ContributionActor;
  newContributionId: string;
  newEvidenceId: string;
  completionFactId: (kind: string, index: number) => string;
}
function applyContributionCommand(
  state: MeetingState, command: DomainContributionCommand,
  context: ContributionTransitionContext
): TransitionResult<MeetingState>;
function evaluateContributionProgress(state: MeetingState, now: number): TransitionResult<MeetingState>;
function transitionContributionLifecycle(
  state: MeetingState, action: "pause" | "resume" | "end" | "recover" | "tick",
  now: number
): TransitionResult<MeetingState>;

function failContributionDelivery(state: MeetingState, input:
  ({kind:"task";contributionId:string;generation:number} |
   {kind:"manager";noticeSeq:number}) & {reason:string;now:number}
): TransitionResult<MeetingState>;

// domain/transitions/public-submission.ts
interface PublicSubmissionContext {
  agendaItemId: string; message: SpeakerSubmissionContext["message"]; claims: ContributionClaims;
  now: number; authorizedTaskIds: readonly string[];
  completionFactId: (kind: string, index: number) => string;
}
function applyPublicSubmission(
  state: MeetingState, participantId: string, context: PublicSubmissionContext
): TransitionResult<MeetingState>;
```

createContributionState 初始化 empty maps、managerNoticeSeq=0、managerDeadlineAt=now+600000。isContributionState 完整检查 required/optional、枚举、map key 等于记录 ID、引用存在及当前版本存在；不能只看 schemaVersion。assertContributionCapacity 检查接口的字节／数量限制，超限 DomainError(INVALID_ARGUMENT)。isMeetingStateV2 另检查跨对象引用：reviewer/author 在 roster，task agenda/target 在本会议，draft revision 连续且 current 为最大值；published 的 messageId 唯一并匹配该贡献来源，其他 phase 无 messageId；每条 review 指向存在的 draft/citation，review actor 不是材料作者；citation/patch key 在 evidence map。Evidence key 为 evidenceId:revision，同一 evidenceId 各版本 owner 一致；非法全部 fail closed。

contributionWorkComplete 对 legacy 返回 true；对新状态计算 required 任务／核验门槛及 active 正向完成事实的证据支持，不调用 isObjectiveSatisfied，避免递归。assertContributionEvidenceMessages 对 legacy 无操作；新状态按接口检查引用消息、材料／claim 及 supports，非法抛 INVALID_STATE_TRANSITION。Participant 完成声明和 Captain 接受都复用它，不能各写不同判据。

同一 public-submission.ts 新增 `assertPublicMinutes(state:MeetingState, message:SpeakerSubmissionContext["message"], contextFromSeq:number, contextThroughSeq:number):void`，从 speaker-attempt.ts 的 assertMinutesDraft 提取正文／覆盖范围检查，旧 caller 传 attempt 上下界，新 caller 传 0 和 draft.basedOnSeq；不制造 SpeakerAttempt。

applyPublicSubmission 从原 submitSpeakerAndAdvanceMeeting 提取同一份 claims 逻辑，顺序固定 Question→Issue→Proposal/Position→AgendaCandidate→DecisionCandidate→completion。原有 minutesDraft 不得混带 claims 的验证保留；不包含 Speaker attempt 验证、追加消息、queueMeetingTasks 或 advanceAfterSpeakerSubmission。旧调用仍在提交 Speaker 后调用它，然后执行原 MeetingTask 队列和 Turn 推进；新调用在边界批准追加原文后调用它，authorizedTaskIds=[]。不得重复实现 claims。

applyContributionCommand 先校验 caller/实体/generation/phase，再按接口转换；发布前校验 message mentions/replyTo/agendaRelation/minutes coverage 与原 Speaker 提交相同规则。新增 message 只提供 contribution 来源；禁止借调用 submitSpeakerAttempt 伪造 Turn。每次 Domain transition 只返回一个整体 state/effect，version 使用原 state.version+1；组合内部 helper 不重复累加 version，最终 eventSeq 由原 repository 规则写入。

evaluateContributionProgress 对 legacy、created、paused、已执行终态原样返回；其它状态先检查 isObjectiveSatisfied && contributionWorkComplete，满足则 completed/objective_satisfied；否则 messageSeq>=maxTotalMessages 时 partial/message_limit；否则 now-createdAt>=maxDurationMs 时 partial/time_limit；否则执行下文 Agenda Advancement 的唯一规则。命中前述终止条件时用 transitionMeeting(state, outcome, {now,termination})，termination 字段固定：code/reason/finalMessage 均为所命中 code，endedAt=now；decisionIds 为当前 accepted decisions 的 id；unresolvedQuestionIds 为 open/deferred question id；blockingAgendaItemIds 为 status=blocked 的议题 id；dissentingPositionIds 为每个 Proposal 当前最大 revision 上的 blocking object/needs_revision position id；四个数组按 ID 排序。transitionMeeting 同事务撤销贡献，Runtime commit 后调用已有 beginArchiveFromTermination，不另行造归档 worker。正式 claims、Captain decision/risk/agenda 处置、review 完成及 tick/resume 均调用该函数；pause 期间不自动完成，resume/tick 仅在非 paused 时评估，resume 在同一事务中先构造恢复为 running 的候选状态，再执行 evaluateContributionProgress；命中终止则直接提交终止状态，不递增恢复 generation、不创建恢复 outbox；未命中才恢复阶段 deadline、generation 和投递授权。保持原 Captain 显式 endMeeting 的 waiver/理由语义。

transitionContributionLifecycle 不运行 DSH，不直接写 termination；pause/resume 在原 transitionMeeting 的同一事务内调用，end 在原 termination 同一事务内调用，recover/tick 是 Runtime 的独立内部 command。对 legacy 原样返回无事件。所有已有 Captain 事实变更调用后执行完成／预算检查；终止的必要门槛统一加到 assertCompletionReady，禁止只在新工具上拦截。

## Runtime Symbols And Call Chain

```ts
// runtime/services/public-submission-service.ts
function preparePublicSubmission(
  body: ContributionBodyV1,
  source: { messageId: string; idSeed: string; agendaItemId: string; now: number }
): Pick<ContributionDraft, "message" | "claims">;

// runtime/application-service/meeting-contribution.ts
interface MeetingContributionApplicationOptions {
  options: CreateStatusRuntimeOptions;
  meetings: Map<string, StoredMeeting>;
  recovery: MeetingRehydrationService;
  deliveryWorkers: MeetingDeliveryWorkerService;
}
function createMeetingContributionApplication(
  dependencies: MeetingContributionApplicationOptions
): Pick<MeetingToolRuntime, "applyContribution" | "readContribution"> &
   Pick<LocalMeetingWebRuntime, "controlLocalContribution" | "readLocalContribution">;

// runtime/services/contribution-runtime-service.ts
function contributionOutbox(
  before: MeetingState, after: MeetingState, events: readonly DomainEvent[]
): readonly {deliveryId: string; kind: "dispatch"; payload: JsonObject}[];
function scanContributionTimeouts(input: {
  repository: MeetingRepositoryRuntime; now: number;
}): Promise<void>;
function recordContributionDeliveryFailure(input: {
  repository: MeetingRepositoryRuntime; item: OutboxItem; errorCode: string; now: number;
}): Promise<void>;
function recoverContributionWork(input: {
  repository: MeetingRepositoryRuntime; now: number; recoveryEpoch: string;
}): Promise<void>;
```

preparePublicSubmission 提取原 meeting-turn.ts 的 message 和六类 changes 的转换代码；旧 Turn 使用原 deliveryId seed，新贡献使用 contributionId-revision seed；保留原每类实体前缀和数组索引，不重新排序。缺失 changes 数组→[]，completion 缺失→省略；不要把 authorizedTaskEvidence resolver 或 Catalog 查询移入该函数。旧路径仍自己解析授权 MeetingTask。

MeetingToolRuntime 新签名：

```ts
applyContribution(input: ContributionCommandV1, caller: MeetingToolCaller, signal: AbortSignal):
  Promise<ProtocolSuccessV1<ContributionResultV1> | ProtocolErrorV1>;
readContribution(input: ReadContributionInputV1, caller: MeetingToolCaller, signal: AbortSignal):
  Promise<ProtocolSuccessV1<ReadContributionResultV1> | ProtocolErrorV1>;
```

LocalMeetingWebRuntime 的 controlLocalContribution/readLocalContribution 与上述签名相同，但移除 caller 参数；control input 是 action=retry/cancel/notify_manager 的子联合。本地 actor 固定 local_host、binding/capability 沿现有 local-host:loopback-web，不能构造 Agent actor。

完整写调用顺序固定：Tool/Remote Schema→真实 caller/本地边界→rehydrate→找同 Meeting repository→read→构造一次 now/ID/hash→execute（现有授权、receipt、CAS）→transition（normalize submit、业务校验、原子 state/events/outbox）→已提交 success→wake 既有 worker。读取：同权限入口→read durable snapshot→projectContributionRead→Result Schema→envelope。不在 read 中创建 Session、改变任务或抓取来源。

Runtime 的预检查不得阻挡已有成功 receipt 的重放；generation/phase/当前稿件检查位于 repository transition 内。显式 caller 身份绑定与可见性先于 receipt，沿既有安全策略。abort 在 commit 前不写；commit 后返回丢失由相同请求重放恢复。

contributionOutbox 只从本次 events 生成投递：assigned→prepare；returned 且未超限→prepare；approved 且 reviewStatus=pending→evidence_review；controlled:retry/resume、recover 后按任务状态生成对应准备／审核投递；manager_notified→Manager notice；pause/end/cancel/expired 不生成该任务研究投递。recover 对原活跃任务发 controlled(action=resume,reason="runtime_recovery")；tick 的 task 超时发 expired；会议总预算命中则只发终止/撤权事件，不生成恢复研究投递。同 command 以 deliveryId 去重；不用“遍历所有未完成任务就再次投递”。

onTerminalFailure 对 contribution/contribution_manager 调 recordContributionDeliveryFailure；其内部 requestId=`contribution-delivery-failed:<item.deliveryId>`、hash 同值，调用 failContributionDelivery；stale 回调直接无操作，不重复通知。旧 manager fallback 分支只接收 legacy role=manager。

tick requestId=`contribution-tick:<snapshot.version>:<earliestDueDeadline>`，commandKind=contribution:tick，authorization 固定现有 runtime binding，hash 为同字符串。没有 due deadline 且未触发预算／完成则不写。CAS 竞争失败留待下一次已有扫描，不额外紧密重试。任务失败通知走原状态刷新和 Manager notice；不新增邮件系统。

## DSH Delivery And Recovery

新增 adapter 位于现有 `plugin/src/dsh/session-adapter.ts`，不新增目录：

```ts
interface FollowupContributionSessionInput {
  runtime: Pick<SubagentRuntime, "sendMessage">;
  parent: Agent; ownership: MeetingOwnershipRecord;
  expectedRole: "manager" | "participant";
  participantId?: string;
  prompt: ContinuableStartSpec["request"]["prompt"];
  signal: AbortSignal;
  authorize: (phase: "before" | "after") => Promise<void>;
}
function followupContributionSession(input: FollowupContributionSessionInput):
  Promise<ContinuableStart["messageId"]>;
```

校验 parent.id=ownership.parentSessionId、ownership role、Participant 的 participantId、active lifecycle/capability；Manager 禁止 participantId。然后复用同文件 sendAuthorizedMeetingMessage。业务 generation/status 验证由 authorize 回调每次 recover 最新事实执行；旧 adapter 不改语义。

MeetingDeliveryDispatcher 增私有 dispatchContribution/dispatchContributionManager，签名均 `(input:MeetingDeliveryInput):Promise<void>`。现有 participantQueues 改按实际 ownership.sessionId 作 key，Manager 也进入同一队列；旧身份的队列语义保持。dispatch 后 ack 仅证明 DSH 接受消息；仍由后续合法 command 证明业务完成。旧 outbox generation 不匹配标记不可重试 STALE_ATTEMPT；Manager 过期 notice 直接 ack，不发送旧任务。

创建成功之后使用与旧 start_manager_planning 相同的 repository 原子启动点：status=running、首议题 discussing、无 currentTurn、manager 状态 idle、新增 noticeSeq=1 和 Manager outbox。updateCreateResult 及本版本 partial creation repair 继续原机制；创建和重放均先校验本版本输入，再验证原 caller/hash，不支持旧版本创建回执。新的 provisioning 指导同时说明“此消息只建立身份；等待正式任务／规划通知”，不能要求不存在的 Turn attempt。

恢复：在 createCreateStatusRuntime 内创建一次 `contributionRecoveryEpoch=randomUUID()`，并持有 `Set<string> recoveredContributionMeetings`。只有实际冷恢复、完成既有 Session reconcile 且原 parent 可用后，调用 recoverContributionWork；成功后入 Set，同一 runtime 后续 read 不重复增加 generation。fresh create 同时入 Set，避免首次 status 当成冷恢复。recover command requestId=`recover-contribution:<recoveryEpoch>`，commandKind=contribution:recover，hash 同 requestId；receipt 重放不生成新 outbox。缺 parent 不入 Set，保留后续合法恢复机会。退出 runtime 时集合自然释放；不写 recoveryEpoch 到产品模型。

恢复 paused Meeting 不重投、不变 generation；恢复终态只走旧 archive recovery；恢复 running/waiting 原 deadline 未过期则 generation+1 后重投准备／审核／Manager，过期走 tick 的 Captain 状态。暂停保留剩余时间；会议总预算沿现有 now-createdAt，包括暂停与停机时间，不新增暂停累计时长字段。resume 与正常进度检查使用相同顺序：先判断 completed，未满足再判断总预算；耗尽则 partial。两种终止都不发送新研究任务。

## Release Boundary

本版本不实现 `initializeLegacyMeeting` 或历史 Runtime fixture；create-meeting.ts 只启动贡献模型。当前输入必须显式提供有效 evidenceReviewerKey，Schema 与 Runtime 均拒绝缺失或非法值；启动事务写入 running、首议题 discussing、noticeSeq=1、无 currentTurn。本版本 partial creation 可用原 receipt 修复，旧版本记录不进入执行或自动迁移。旧 Turn／Mailbox／MeetingTask 写入口返回 UNSUPPORTED_CAPABILITY，不增设按记录版本分流的适配器。

测试按当前有效业务意图迁移：身份、权限、原子性、幂等、恢复和归档反例继续覆盖；只测试已取消旧 Turn 行为的用例可删除，并在提交中列明被替代的行为与新断言。不得为通过门禁删除当前模型的安全断言或使用 skip。

## Public DTO And UI

Protocol 新文件 `plugin/src/protocol/contribution.ts` 定义 Wire Contract 的全部 input/result/DTO/Schema，并从 protocol/index.ts 导出；types.ts 只添加 creation/status/message/archive 字段。新增 schemas 名称固定 ContributionCommandSchema、ReadContributionInputSchema、ContributionResultSchema、ReadContributionResultSchema、LocalContributionControlSchema、ContributionSummarySchema。规范化调用原 request-idempotency.ts，不更换序列化算法。

Projection 新文件 `plugin/src/projection/contribution.ts`：

```ts
function projectContributionContext(state: MeetingState, viewer: MeetingProjectionCaller,
  delivery: ContributionDelivery, deliveryId: string): ContributionContextV1;
function projectContributionSummaries(state: MeetingState, viewer: MeetingProjectionCaller):
  readonly ContributionSummaryV1[];
function projectContributionRead(state: MeetingState, viewer: MeetingProjectionCaller,
  input: ReadContributionInputV1): ReadContributionResultV1;
```

MeetingProjectionCaller 复用现有 status.ts 的同名 exported type，不创造另一套角色模型。context/summary/read 字段逐项遵守接口白名单；context 安全字段与固定 Transcript 上界严格按 Interface；public read 拒绝私有 draft/material，与不存在相同错误。材料 key 的访问依赖引用闭包（含 patch），不依赖 URL 是否能被服务器打开。

ConviviumRemoteService 新 `readContribution(input:RemoteReadContributionInput, signal:AbortSignal)`、`controlContribution(input:RemoteContributionControlInput, signal:AbortSignal)`；对应 RemoteInput 类型放 remote/types.ts，输入经 validateInput 保留未知字段再拒绝。Client 的 MeetingClient 同名方法返回 ProtocolSuccess；使用现有请求取消与 envelope/result Schema。生成物只能运行 generate:typert 得到。

现有面板新增标题精确为 `Contributions` 的区：任务摘要行显示作者、状态、核验状态；选择任务调用 readContribution；材料按版本 key 显示正文／来源、主张、核验方法和限制。材料详情标签固定 Material/Source/Claim/Verification/Method/Limitations；按钮文案固定 View contribution、Retry contribution、Cancel contribution、Notify Manager，原因输入标签 Reason，历史稿件选择标签 Draft revision，默认当前版本。Captain/local 可见 retry/cancel/notify_manager 表单，按钮出现条件与接口状态表完全相同，reason 必填。刷新到最新版本后再提交；取消切换会议请求并清除前一会议 detail；禁止缓存状态写入。面板不提供 Turn reassign，不要求保留旧版本视图。

产品角色资源固定更新 `plugin/meeting-roles/definitions.json`：Manager 与 Scribe 均加入 convivium_contribution/convivium_read_contribution，definitionVersion 从 1.0.0 升为 1.1.0；其余 Definition 版本保持。meeting-management 和 referenced-minutes Skill 只指导当前贡献提交入口，不提供旧版本分流。Scribe 的纪要通过 contribution submit 保存（kind=summary、minutesDraft、changes={}、无 completionClaims），仍由 Manager 批准后公开；不保留旧 submit_turn 成功路径的验收要求。verification-review Skill 固定逐版本／主张、独立审核、不得执行提交代码。只更新未来角色资源，不改历史固化 descriptor。

## File Manifest

已有文件及准确改动责任：

| 路径（均相对仓库根） | 符号与固定改动 |
| --- | --- |
| `plugin/src/domain/model.ts` | MeetingState、MeetingMessage、ArchiveMessage、ArchivePackage、DomainEventTypes：增加贡献字段／来源／事件，不改变 legacy 实体 |
| `plugin/src/domain/meeting-state-validation.ts` | isMeetingStateV2：present contributions 全量校验；无字段沿原路径；新旧消息各自来源校验 |
| `plugin/src/domain/transitions/speaker-submission.ts` | submitSpeakerAndAdvanceMeeting：提取并复用 applyPublicSubmission，旧 Task/Turn 行为保留 |
| `plugin/src/domain/transitions/meeting-guards.ts` | assertCompletionReady：增加 contributionWorkComplete |
| `plugin/src/domain/transitions/meeting.ts` | transitionMeeting：pause/resume/end 原子接入贡献 lifecycle |
| `plugin/src/domain/transitions/termination.ts` | endMeeting：先校验正式完成事实与贡献门槛，再撤销在途任务 |
| `plugin/src/domain/transitions/archive.ts` | assertArchivePackageMatchesMeeting、snapshotArchive：新引用白名单与封存校验 |
| `plugin/src/domain/index.ts`、`plugin/src/domain/transitions/index.ts` | 仅导出本文 Runtime 使用的新符号 |
| `plugin/src/runtime/meeting-runtime.ts` | prepareMeetingCreation：校验 evidenceReviewerKey 并初始化贡献；createMeetingApplication 在首次存储和 provisioning 前执行同一约束 |
| `plugin/src/runtime/application-service/create-meeting.ts` | createMeetingApplication：当前输入 preflight、初次 notice、本版本合法请求幂等；不分流旧启动 |
| `plugin/src/runtime/application-service/meeting-turn.ts` | createMeetingTurnApplication：新状态旧工具拒绝；复用 normalizer |
| `plugin/src/runtime/application-service/meeting-task.ts`、`plugin/src/runtime/application-service/meeting-mail.ts`、`plugin/src/runtime/application-service/meeting-attendance.ts` | 停用的写入口拒绝，不分流旧会议；当前有效查询保留 |
| `plugin/src/runtime/application-service/meeting-control.ts` | createMeetingControlApplication：新暂停／恢复无 Turn 重规划；新 reassignTurn 拒绝；risk 处置后检查贡献完成 |
| `plugin/src/runtime/application-service/meeting-decision.ts`、`plugin/src/runtime/application-service/meeting-agenda-candidate.ts` | Captain 正式事实变更后检查完成／预算，再 Manager notice；不创建 Turn |
| `plugin/src/runtime/application-service/meeting-end.ts` | createMeetingEndApplication：新终态路径复用归档，结束后不投递 |
| `plugin/src/runtime/application-service/index.ts`、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/index.ts` | 装配签名、恢复 epoch、扫描分支、worker 失败分支和公开导出 |
| `plugin/src/runtime/services/meeting-dispatch-service.ts` | createMeetingDeliveryDispatcher：新增角色分支、Session 队列和前后授权 |
| `plugin/src/runtime/services/meeting-session-recovery.ts` | reconcileMeetingSessions：新状态不修复／启动旧 Speaker，沿原 ownership 恢复；返回后由 application 接恢复贡献 |
| `plugin/src/runtime/services/meeting-archive-service.ts` | materializeArchivePackage：引用已发布任务／证据；不复制私有 map；cleanupOwnedSessions/finalizeArchive 保持原成功判据 |
| `plugin/src/repository/domain/schemas.ts`、`plugin/src/repository/domain/domain-meeting-repository.ts` | state Schema 保持单写；所有新状态入 commit 前调用容量校验，非法命令转 INVALID_ARGUMENT；恢复不回填 |
| `plugin/src/dsh/session-adapter.ts`、`plugin/src/dsh/index.ts`、`plugin/src/dsh/provisioning.ts` | 新 adapter/导出及不提前授权的初始指导 |
| `plugin/src/protocol/types.ts`、`plugin/src/protocol/commands.ts`、`plugin/src/protocol/status.ts`、`plugin/src/protocol/index.ts` | 创建输入、来源、status/archive/result Schema 和公开导出 |
| `plugin/src/projection/status.ts`、`plugin/src/projection/index.ts`、`plugin/src/projection/developer-markdown.ts` | 新摘要／显式可见性、message 来源；Markdown 仅公开内容，不复制私有草稿 |
| `plugin/src/tools/register-tools.ts` | registerCreateAndStatusTools/registerSubmitAndControlTools：注册两个新工具与 Schema；复用 caller resolver |
| `plugin/src/remote/index.ts`、`plugin/src/remote/types.ts` | 两个本地方法与 RemoteInput 类型 |
| `plugin/src/client/meeting-client.ts`、`plugin/src/client/meeting-panel.tsx`、`plugin/src/client/meeting-panel-view.tsx`、`plugin/src/client/meeting-panel-sections.tsx` | typed client、任务区、受控材料详情、三个 local action；不改样式系统 |

消息消费的机械更新只允许上述 public mapper/schema 和 `plugin/src/domain/planning.ts`、`plugin/src/domain/completion.ts`、`plugin/src/domain/transitions/kernel.ts`、`plugin/src/domain/transitions/speaker-attempt.ts`：读取 legacy turn 字段前验证旧来源；新贡献消息不参与按 Turn 计数。不得给 undefined 添 0、空字符串或 currentTurn 值。发现另一个消费者需要业务改动时 STOP，不能把可选字段断言为非空来通过编译。

## Verification Ownership

纯 Domain 反例、Repository 原子性、真实 caller／DSH 投递、冷恢复、Client 可见性分别验收；具体命令和逐项断言由临时 RUNBOOK 编排。长期 readiness 记录最小切片与全部目标需求的差距。完整验证为 plugin verify、代表性真实 DSH scenario、Browser 与固定业务讨论的机械结构/系统回执；语义质量及真实用户价值另记 Not Covered，不能由 deterministic probe 或结构检查替代。


## Agenda Advancement

由现有目标签名 evaluateContributionProgress 实现 Interface 同名节，不新增调度器或配置；该函数在 T6 完成。agenda 数组顺序为唯一顺序，不调用旧 Turn advance。追加事件 contribution.agenda_advanced 后由 contributionOutbox 在同事务根据新 notice 生成一次 Manager 投递；取消私稿的 controlled:cancel 仅撤销该任务投递。Runtime 对本次 controlled:cancel 的作者在 commit 后经既有 adapter interrupt，已公开待核验 Session 不受影响。事件字段／顺序、无下一议题行为与 required 门槛由 Interface 固定。
