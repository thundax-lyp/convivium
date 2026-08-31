# Agent Meeting Protocol Interface

状态：已确认
协议所有者：Convivium DSH Plugin
基础运行时：DSH

## Purpose

本文定义 Convivium 在 DSH 上新增的 Agent 间会议协议。协议约束 Captain、Manager、Participant 与 Meeting Runtime 之间交换的身份、会议上下文、公开结果、权限、幂等信息和错误。

本文不复制 DSH 通用 Tool、AgentSession、MeetingTask、Session Event、Sandbox 或 Approval 契约，也不规定 Agent 内部 Prompt、Skills、Tools、MCP、推理、命令、工作流和重试策略。

## Boundary And Ownership

### Protocol participants

| Identity        | Responsibility                                                           | May produce                                                                        |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Captain         | 创建、控制和结束会议                                                     | 会议控制命令、明确接受、豁免和改派                                                 |
| Manager         | 建议下一 Turn 的议题、目标和有序 speakers                                | `ManagerPlanSubmission`                                                            |
| Participant     | 作为具体会议身份发言、创建 MeetingTask、异步私聊和申请后续发言           | `TurnSubmission`、`MeetingTaskRequest`、meeting-scoped mail、`HandRaiseSubmission` |
| Meeting Runtime | 验证身份、发言权、引用和权限，形成正式会议事实                           | Context、receipts、errors、status projections                                      |
| DSH             | 提供真实 caller Session、AgentSession、工具调用、Session FIFO 和生命周期 | DSH-owned runtime facts                                                            |

### Ownership rules

1. DSH caller Session 是调用者身份的来源；payload 中的显示名称、Participant ID 或 Manager ID 不能独立完成授权。
2. Meeting Runtime 拥有 Meeting、Turn、SpeakerStep、SpeakerAttempt、正式 transcript、完成事实和会议权限。
3. Agent 只拥有其内部工作过程，并通过本协议明确提交公开结果。
4. Agent 内部信息在未通过本协议提交前，不是会议事实。
5. MeetingTask 状态和结果是 Convivium-owned MeetingState facts；只有经过会议授权的 projection 才能进入其他会议上下文。
6. Plugin Frontend 本地缓存和 mailbox 不是会议状态真相源；meeting-scoped mail 及其处理状态仍是私有通信数据。
7. 正式 transcript message 只能由匹配当前 SpeakerAttempt 的合法 `convivium_submit_turn` 写入。其他正式领域事实只能由本协议明确授权的 Participant submission、Captain command 或经过验证的 DSH-owned fact 形成，并统一交给 Meeting Runtime 校验和提交；Manager、mailbox、Plugin Frontend projection 和开发者文件都不能直接写入。

### Out of boundary

本协议不定义：

- DSH 如何注册或执行通用 Tool；
- Agent 使用哪些 Prompt、Skills、Tools 或 MCP；
- Agent 如何推理、重试、运行命令或处理内部工具失败；
- Meeting Runtime 的数据库、事务、调度算法和恢复实现；
- workspace 中供开发者阅读的诊断 Markdown 或其他非产品辅助文件；
- 与会议控制无关的 Plugin Frontend Web route 或组件实现。

## Transport Or Invocation

### DSH tool invocation

协议命令通过 DSH tool registry 暴露。每次调用都包含 DSH 提供的不可伪造 caller Session context。Meeting Runtime 必须先解析 caller，再验证 payload。

协议版本为 `1`。所有成功响应和结构化错误都必须携带 `protocolVersion`。

```ts
type ProtocolVersion = 1;

interface ProtocolMeta {
  protocolVersion: ProtocolVersion;
  meetingId: string;
  meetingVersion: number;
}
```

### Command set

| Command                         | Authorized caller                                        | Purpose                                                       |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `convivium_create_meeting`      | Captain                                                  | 创建会议和会议身份                                            |
| `convivium_meeting_status`      | Captain；Session 仍有效时的该会议 Manager 或 Participant | 读取按身份裁剪的会议上下文                                    |
| `convivium_submit_manager_plan` | 当前 Manager Session                                     | 提交下一 Turn 建议                                            |
| `convivium_submit_turn`         | 当前 Speaker Session                                     | 提交正式发言和结构化声明                                      |
| `convivium_create_meeting_task` | 当前 Speaker Session                                     | 创建 Convivium-owned MeetingTask                              |
| `convivium_send_message`       | 当前 Meeting Participant Session                         | 仅发送 meeting-scoped Participant→Participant 私聊            |
| `convivium_finish_meeting_mail`| recipient Participant Session                            | 固化私聊处理 terminal status                                  |
| `convivium_meeting_task_status` | 该 MeetingTask 的原 Participant Session                  | 读取当前授权 task projection、Meeting terminal 状态和执行许可 |
| `convivium_start_meeting_task`  | 该 MeetingTask 的原 Participant Session                  | 幂等地将 queued MeetingTask 置为 running                      |
| `convivium_finish_meeting_task` | 该 MeetingTask 的原 Participant Session                  | 提交 terminal result 并申请后续发言                           |
| `convivium_raise_hand`          | 该会议的 Participant Session                             | 申请后续发言                                                  |
| `convivium_pause_meeting`       | Captain                                                  | 根据用户指令暂停会议                                          |
| `convivium_resume_meeting`      | Captain                                                  | 根据用户指令恢复会议                                          |
| `convivium_dispose_risk`        | Captain                                                  | 对指定风险作出结构化接受或拒绝处置                            |
| `convivium_reassign_turn`       | Captain                                                  | 撤销并改派或跳过当前发言位置                                  |
| `convivium_end_meeting`         | Captain                                                  | 正常、部分、无共识或取消结束                                  |

本协议不提供无约束 broadcast 或通用 `meeting_message`。Agent 私聊使用 Convivium mailbox；meeting-scoped mail 使用下述上下文结构，但不属于正式 transcript 协议。

### Meeting-scoped mailbox extension

本插件不实现普通 TeamMember mailbox。`convivium_send_message` 在 V1 仅接受 meeting-scoped Participant→Participant 模式；非 meeting recipient fail closed 为 `UNSUPPORTED_CAPABILITY`。普通 Convivium mail（如由其他产品提供）不携带 `meetingContext`，不受本插件改动影响。

```ts
interface MeetingMailboxRecipientV1 {
  kind: "meeting_participant";
  meetingId: string;
  participantId: string;
}

interface MeetingMailContextV1 {
  meetingId: string;
  agendaItemId?: string;
  contextFromSeq: number;
  contextThroughSeq: number;
  relevantMessageIds: readonly string[];
  snapshotSummary?: string;
}

interface MeetingMailExtensionV1 {
  recipient: MeetingMailboxRecipientV1;
  meetingContext: MeetingMailContextV1;
  replyToMailId?: string;
}
```

`convivium_send_message` 必须从真实 caller Session 解析发送方 Participant，并验证发送方、接收方属于同一 Meeting。调用方不能提供或覆盖 sender identity。`contextThroughSeq` 必须由 Meeting Runtime 固化为发送事务时发送方和接收方均有权查看的最大 transcript seq；调用方提供的更大值必须拒绝。

`relevantMessageIds` 和 `snapshotSummary` 只能引用或概括 `contextFromSeq..contextThroughSeq` 内双方有权查看的正式会议内容。mail 不得携带其他 Participant 的私有 mailbox、隐藏推理、Session 历史或未授权 task output。

### Mail processing contract

```ts
type MailHandlingStatusV1 =
  | "pending"
  | "processing"
  | "processed"
  | "obsolete"
  | "failed"
  | "timed_out"
  | "cancelled";

interface MailHandlingAttemptV1 {
  handlingAttemptId: string;
  mailId: string;
  meetingId: string;
  participantId: string;
  deliveryId?: string;
  snapshotThroughSeq: number;
  processingThroughSeq?: number;
  status: MailHandlingStatusV1;
}
```

`pending` 状态不得伪造尚不存在的处理范围。attempt 进入 `processing` 时，`deliveryId` 和 `processingThroughSeq` 必须在同一状态转换中固化；`processing|processed|obsolete|failed|timed_out` 状态下两者必须存在且不可修改。

Mail Processor 开始处理时必须：

1. 验证 mail、Meeting、recipient Participant 和 meeting-owned Session 仍有效；
2. 从 `snapshotThroughSeq + 1` 补充截至处理开始时接收者有权查看的正式 transcript；
3. 固化 `processingThroughSeq` 和稳定 `deliveryId`，形成不可漂移的处理输入；
4. 通过接收者现有的 meeting-owned Participant Session 执行串行 followup，不创建新的身份 Session；
5. 如果新增事实已使请求失效，允许将 attempt 标为 `obsolete`，不得继续制造过期工作。

同一 Participant Session 的 MailHandlingAttempt、SpeakerAttempt 和其他 followup 必须进入同一串行队列。重投使用相同 `handlingAttemptId`、`deliveryId` 和 `processingThroughSeq`；不得在重试时追加更新的 transcript。mail handling 达到 `mailHandlingTimeoutMs` 时必须 interrupt 并标记 `timed_out`，释放 Session 队列；不得自动把未提交的内部过程转换为 MeetingTask。

处理结果只能是私下回复、请求 MeetingTask、提交 HandRaise，或记录 `processed|obsolete|failed`。Mail Processor 不授予发言权，也不能直接创建 transcript message、Decision 或 CompletionFact。

### Control command payloads

```ts
interface ParticipantSpecV1 {
  participantKey: string;
  sourceMemberName?: string;
  displayName: string;
  role?: string;
}

interface ObjectiveContractSpecV1 {
  requiredOutputs: readonly { key: string; description: string }[];
  acceptanceCriteria: readonly { key: string; description: string }[];
  hardConstraints: readonly { key: string; description: string }[];
  requiredReviewerKeys: readonly string[];
  riskAcceptanceAuthorityKeys: readonly string[];
  acceptableRiskLevel: "low" | "medium" | "high";
}

interface AgendaItemSpecV1 {
  key: string;
  title: string;
  objective: string;
  inScope: readonly string[];
  outOfScope: readonly string[];
  // Each reference is an output/criterion key, description, or canonical ID;
  // creation stores the resolved canonical ID.
  completionCriteria: readonly string[];
  ownerKey?: string;
  requiredParticipantKeys: readonly string[];
  relatedTaskIds?: readonly string[];
}

interface CreateMeetingInputV1 {
  protocolVersion: 1;
  requestId: string;
  teamId: string;
  topic: string;
  objective: string;
  objectiveContract: ObjectiveContractSpecV1;
  agenda: readonly AgendaItemSpecV1[];
  participants: readonly ParticipantSpecV1[];
  continuation?: ContinuationSelectionV1;
  selectionMode?: "round_robin" | "rule_based" | "manager" | "hybrid";
  limits?: Partial<PublicMeetingLimitsV1>;
}

interface ContinuationSelectionV1 {
  sourceMeetingId: string;
  includeFinalSummary: boolean;
  decisionIds: readonly string[];
  unresolvedIssueIds: readonly string[];
  riskIds: readonly string[];
  evidenceIds: readonly string[];
  artifactIds: readonly string[];
}

interface CreateMeetingResultV1 {
  meetingId: string;
  meetingVersion: number;
  status: "created" | "running";
  participants: readonly {
    participantKey: string;
    participantId: string;
  }[];
}

interface MeetingStatusInputV1 {
  protocolVersion: 1;
  meetingId: string;
}

interface PauseMeetingInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  requestId: string;
  reason: string;
}

interface ResumeMeetingInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  requestId: string;
}

interface MeetingControlResultV1 {
  status: "paused" | "running" | "waiting";
  changed: boolean;
}

interface CaptainRiskDispositionInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  requestId: string;
  issueId: string;
  decision: "accept" | "reject";
  reason: string;
  evidenceMessageIds: readonly string[];
}

interface CaptainRiskDispositionResultV1 {
  requestId: string;
  issueId: string;
  disposition: "accepted" | "rejected";
  completionFactId: string;
  meetingStatus: MeetingStatusResultV1["status"];
}

interface ReassignTurnInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  currentAttemptId: string;
  action: "reassign" | "skip";
  replacementParticipantId?: string;
  reason: string;
  requestId: string;
}

interface EndMeetingInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  outcome: "completed" | "partial" | "no_consensus" | "cancelled";
  reason: string;
  acceptedDecisionIds: readonly string[];
  deferredAgendaItemIds: readonly string[];
  waivers: readonly {
    subjectId: string;
    kind: "required_review" | "agenda_item";
    reason: string;
  }[];
  requestId: string;
}
```

`selectionMode` 省略时默认使用 `hybrid`。四种模式都属于完整协议能力，不通过 feature flag 延后：`hybrid` 在规则足以决定时使用确定性 plan，在需要语义裁决时调用 Manager，并在 Manager 失败或建议无效时回退到 rule plan。

创建期 Spec 与运行期 Public projection 是不同契约，不得互相复用。`participantKey`、output/criterion/constraint key 和 agenda key 只在单次 `CreateMeetingInputV1` 内稳定，不是权限凭据，也不得在创建后冒充正式 ID。

Runtime 必须在产生任何 Meeting 状态前完成以下验证和转换：

1. 每类 key 非空且在自己的命名空间内唯一；
2. `requiredReviewerKeys`、`riskAcceptanceAuthorityKeys`、`ownerKey` 和 `requiredParticipantKeys` 全部引用现有 `participantKey`；
3. `sourceMemberName`、`relatedTaskIds` 及其 Team 权限合法；
4. 为 Meeting、Participant、output、criterion、constraint 和 agenda 分配正式稳定 ID；
5. 把所有 output 初始化为 `pending`、criterion 初始化为 `satisfied=false`、agenda 初始化为 `pending`，不得接受调用方提供的运行期状态或 resolution；
6. 原子创建完整 Meeting；任何 key 或引用无效时返回 `INVALID_ARGUMENT`，不得产生部分 Participant、Agenda 或 Objective state。

完成无副作用输入校验后，Runtime 必须先生成 `meetingId` 并建立独立 repository ownership，再创建 Manager/Participant Sessions。任何 Session 都必须携带相同 `meetingId` ownership；不得出现没有 Meeting ID 或无法经 locator 定位所属 Meeting repository 的 Session。

`continuation` 只表达对已归档素材的选择，不允许调用方提交或覆盖素材正文。Runtime 必须验证 Captain 有权访问 `sourceMeetingId`，源会议状态为 `archived`，所有选中 ID 属于该归档且可复用；随后把选中内容复制为带 `sourceMeetingId` 和源对象 ID 的只读初始素材。新 Meeting 不继承源会议的 Session、Participant ID、capability、完整 transcript、运行状态或未选中内容。

`CreateMeetingResultV1.participants` 返回请求 key 到正式 Participant ID 的映射，供调用方解释创建结果。后续协议只接受正式 ID，不接受创建期 key。

`CaptainRiskDispositionInputV1` 是正式会议控制命令的输入，不是 Captain 自然语言回答的格式。Captain 的文本、摘要或建议不得自动转换为风险处置。Runtime 必须验证真实 Captain Session、Meeting version、issue 当前状态、evidence 归属、objective hard constraints 和 `acceptableRiskLevel`；验证成功后生成不可变风险处置 CompletionFact，并重新计算确定性完成状态。

Captain 对风险具有独立的会议控制权限，不需要伪装成 Participant 或调用 `submit_turn`。该权限只覆盖 `issueId` 指定的风险：不能接受其他风险、不能接受无关 Decision，也不能绕过 objective contract。`decision='reject'` 表示拒绝接受该风险，风险继续按照其当前 blocking 规则处理，不等于风险已经解决。

`replacementParticipantId` 在 `action='reassign'` 时必须存在，在 `action='skip'` 时必须省略。Captain 的 `completed` 请求仍须通过确定性完成校验；不满足时必须使用 `partial`、`no_consensus` 或先提交合法 waiver。

### Pause and resume invocation

暂停和恢复共享同一组领域命令，但允许两个受控入口：

1. 用户向 DSH 发出自然语言指令后，由 Meeting 所属 Team 的 Captain Session 调用 `convivium_pause_meeting` 或 `convivium_resume_meeting`；
2. 用户点击插件会议面板的“暂停”或“继续”按钮后，由插件前端调用受控 Web route；V1 只在 `webServer.host === "127.0.0.1"` 的本地 DSH Host 注册该 route，所有到达该 Host 的请求共享同一个本地用户边界，不绑定 Web 用户身份或 Team 权限。

Web route 不得伪造 Captain Session，也不得绕过 `expectedMeetingVersion`、`requestId` 或状态转换。工具入口与按钮入口必须返回相同的 `MeetingControlResultV1` 和结构化错误；V1 的 Web route 不接受任何用户、Team、Agent Session 或会议身份字段作为授权输入。

通过 V1 Web route 的 pause 必须在正式 MeetingState 中记录 `pausedBy: { kind: "local_host", actorId: "loopback-web" }`；它是固定的 Host 边界标记，不表示、推断或持久化用户身份。通过 Captain tool 的 pause 继续记录 `kind: "captain"`。`MeetingStatusResultV1.pauseControl.pausedBy.kind` 的合法值为 `"user" | "captain" | "local_host"`。

插件面板使用以下类型化路由；路径中的 `meetingId` 必须与 body 解析后的 Meeting 一致：

| Method and route                                 | Body                   | Result                   |
| ------------------------------------------------ | ---------------------- | ------------------------ |
| `POST /api/convivium/meetings/:meetingId/pause`  | `PauseMeetingInputV1`  | `MeetingControlResultV1` |
| `POST /api/convivium/meetings/:meetingId/resume` | `ResumeMeetingInputV1` | `MeetingControlResultV1` |

注册时 `webServer.host !== "127.0.0.1"` 必须 fail closed，不注册上述路由。注册后的 V1 route 不解析用户或 Team authority；前端不得传入 Captain Session ID。

暂停语义：

- 允许从 `created`、`running` 或 `waiting` 进入 `paused`；
- Runtime 必须记录发起者、原因、暂停前状态和时间；
- 已提交的 transcript、claims、CompletionFacts 和 MeetingTask 关联不得回滚；
- 当前 SpeakerAttempt 和 ManagerPlanningAttempt 必须撤销，尚未投递或尚未确认的对应 outbox 不得继续发送；
- 当前 Turn 以 `paused` 原因截断，未执行的 SpeakerStep 不在恢复后直接复用；
- MeetingScheduler 停止创建新的 Turn、Step 和 Attempt；
- 已运行的 MeetingTask 可以继续执行并固化结果，但暂停期间不得触发新发言或推进会议；
- 重复暂停同一已暂停 Meeting 时，如果请求语义一致，返回 `changed=false`，不得重复撤销或生成重复事件。

恢复语义：

- 只允许从 `paused` 恢复；
- Runtime 使用暂停期间已经合法固化的最新事实重新计算状态；存在强阻塞等待条件时进入 `waiting`，否则进入 `running` 并重新规划，不恢复旧 Attempt 或旧 Turn capability；
- 暂停前的 attempt deadline 不顺延，因为对应 Attempt 已撤销；新 Attempt 使用新的完整 deadline；
- 重复恢复已通过同一 `requestId` 成功恢复的 Meeting 时返回原 receipt；其他非 `paused` 状态的恢复请求返回 `INVALID_STATE_TRANSITION`。

### MeetingTask request

```ts
interface MeetingTaskRequestV1 {
  protocolVersion: 1;
  meetingId: string;
  attemptId: string;
  requestId: string;
  title: string;
  description: string;
  blocking: boolean;
}

interface MeetingTaskResultV1 {
  requestId: string;
  meetingTaskId: string;
  participantId: string;
  originatingSpeakerAttemptId: string;
  status:
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";
}

interface MeetingTaskProjectionV1 {
  meetingTaskId: string;
  participantId: string;
  title: string;
  blocking: boolean;
  status:
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";
  resultSummary?: string;
  failureReason?: string;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}

interface MeetingTaskStatusResultV1 {
  task: MeetingTaskProjectionV1;
  observedMeetingVersion: number;
  meetingTerminal: boolean;
  mayExecute: boolean;
}

interface MeetingTaskStartResultV1 {
  requestId: string;
  meetingTaskId: string;
  status: "running";
}

interface MeetingTaskFinishResultV1 {
  requestId: string;
  meetingTaskId: string;
  status: "completed" | "failed";
  handRaiseId?: string;
}
```

字段约束：

- caller 必须是 `attemptId` 对应的当前 Speaker Session；
- Meeting Runtime 必须从真实 caller 和当前 SpeakerAttempt 绑定 participantId、originatingSpeakerAttemptId，不接受 payload 覆盖；
- create 成功只创建 `requested` MeetingTask，不完成 attempt、释放发言权或写 execution outbox；
- 原 SpeakerAttempt 提交 `submit_turn` 时必须在 `taskIds` 中包含该 attempt 创建的全部 `requested` MeetingTask，否则原子拒绝提交；
- 同一 Meeting/Participant 只能有一个 `requested | queued | running` MeetingTask；
- 相同 `requestId` 和相同 request hash 必须返回同一结果；相同 `requestId` 对应不同内容必须返回 `IDEMPOTENCY_CONFLICT`；
- MeetingTask 的运行、取消、重试和 terminal result 由 Convivium MeetingState 状态机拥有；底层模型、工具和 Session 生命周期仍由 DSH 拥有。

`convivium_meeting_task_status` 是只读授权观察，不使用 requestId 或成功 receipt。它返回当前 `MeetingTaskProjectionV1`、`observedMeetingVersion`、Meeting terminal 标识和 `mayExecute`。只有 Meeting active 且 task 为 `running` 时 `mayExecute` 为 true。

`convivium_start_meeting_task` 使用 envelope 的 `deliveryId` 作为稳定 requestId。Execution envelope 必须携带 `meetingTaskId`、`executionId` 和 `deliveryId`。相同 requestId/hash 必须完整返回首次成功的不可变 receipt/result；该 receipt 不构成继续执行许可。Execution envelope 必须在 start 前后读取 status，只有 post-read 的 `mayExecute=true` 才能执行工作。

`convivium_finish_meeting_task` 只接受原 Participant Session 对当前 `running` execution 的提交；成功时在一个 Meeting transaction 中写 terminal task event、result 和 task-linked pending HandRaise。失败不得伪造 HandRaise。

### Caller binding

- Captain-only command 必须匹配 Meeting 所属 Team 的 Captain Session。
- Manager command 必须匹配当前 Meeting Manager Session。
- Participant command 必须匹配 Meeting 中该 Participant 的专用 Session。
- `submit_turn` 和 `create_meeting_task` 还必须匹配当前有效 SpeakerAttempt；status/start/finish 必须匹配正式 `session_ownership` 和 task execution binding。
- Meeting Runtime 必须忽略或拒绝 payload 中试图覆盖真实 caller 身份的字段。

## Data And State Contract

### Identifier semantics

| Identifier          | Meaning                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| `meetingId`         | 一场会议的稳定 ID；先于任何 Meeting Session 或持久化副作用生成，并绑定独立存储边界 |
| `participantId`     | 会议内身份的稳定 ID                                                                |
| `turnId`            | 一个有序发言周期的稳定 ID                                                          |
| `stepId`            | Turn 内一个计划发言位置的稳定 ID                                                   |
| `attemptId`         | 对 SpeakerStep 的一次有效请求 capability                                           |
| `planningAttemptId` | 对 Manager 的一次有效规划请求 capability                                           |
| `deliveryId`        | 一次 DSH Session 投递及重投使用的稳定 ID                                           |
| `requestId`         | caller 为可重试命令提供的稳定请求 ID                                               |

ID 必须作为不透明字符串处理。调用方不得从 ID 格式推断权限、顺序或时间。

### Meeting context delivered to a speaker

```ts
interface SpeakerMeetingContextV1 {
  protocolVersion: 1;
  meetingId: string;
  meetingVersion: number;
  objective: string;
  objectiveContract: PublicObjectiveContractV1;
  activeAgendaItem: PublicAgendaItemV1;
  acceptedDecisions: readonly PublicDecisionV1[];
  blockingQuestions: readonly PublicQuestionV1[];
  recentMessages: readonly PublicMeetingMessageV1[];
  relevantHistorySummary?: string;
  taskResults: readonly AuthorizedTaskResultV1[];
  continuationMaterials: readonly PublicContinuationMaterialV1[];
  turn: PublicTurnV1;
  step: PublicSpeakerStepV1;
  attempt: {
    attemptId: string;
    deliveryId: string;
    contextFromSeq: number;
    contextThroughSeq: number;
    deadlineAt?: number;
  };
}
```

`recentMessages` 必须覆盖该 attempt 固化的 `contextFromSeq..contextThroughSeq`。同一 attempt 重投时不得刷新范围或替换 task results。

```ts
interface PublicObjectiveContractV1 {
  requiredOutputs: readonly {
    id: string;
    description: string;
    status: "pending" | "ready" | "accepted";
  }[];
  acceptanceCriteria: readonly {
    id: string;
    description: string;
    satisfied: boolean;
  }[];
  hardConstraints: readonly { id: string; description: string }[];
  requiredReviewers: readonly string[];
  riskAcceptanceAuthority: readonly string[];
  acceptableRiskLevel: "low" | "medium" | "high";
}

interface PublicAgendaItemV1 {
  id: string;
  title: string;
  objective: string;
  inScope: readonly string[];
  outOfScope: readonly string[];
  // Public projection contains the canonical IDs resolved during creation.
  completionCriteria: readonly string[];
  owner?: string;
  requiredParticipants: readonly string[];
  relatedTaskIds: readonly string[];
  status:
    "pending" | "discussing" | "waiting" | "resolved" | "deferred" | "blocked";
  resolution?: string;
}

interface PublicQuestionV1 {
  id: string;
  text: string;
  askedBy?: string;
  directedTo?: string;
  agendaItemId?: string;
  blocking?: boolean;
  status: "open" | "answered" | "withdrawn" | "deferred";
  answerMessageId?: string;
}

interface PublicDecisionV1 {
  id: string;
  agendaItemId: string;
  proposalId: string;
  proposalRevision: number;
  statement: string;
  rationale: string;
  status: "accepted" | "superseded" | "revoked";
  acceptedBy: readonly string[];
  dissentingPositionIds: readonly string[];
}

interface AuthorizedTaskResultV1 {
  taskId: string;
  attemptId?: string;
  status: string;
  output?: string;
  observedAt: number;
}

interface PublicTurnV1 {
  id: string;
  seq: number;
  agendaItemId: string;
  intent: string;
  objective: string;
  expectedOutputs: readonly string[];
  prohibitedTopics: readonly string[];
  steps: readonly PublicSpeakerStepV1[];
}

interface PublicSpeakerStepV1 {
  id: string;
  participantId: string;
  instruction: string;
  reason: string;
  status:
    | "pending"
    | "assigned"
    | "running"
    | "submitted"
    | "skipped"
    | "revoked"
    | "failed";
}
```

### Meeting context delivered to Manager

```ts
interface ManagerMeetingContextV1 {
  protocolVersion: 1;
  meetingId: string;
  meetingVersion: number;
  planningAttemptId: string;
  objective: string;
  activeAgendaItem: PublicAgendaItemV1;
  requiredSpeakerIds: readonly string[];
  dispatchableParticipantIds: readonly string[];
  recentPublicMessages: readonly PublicMeetingMessageV1[];
  blockingFacts: readonly PublicBlockingFactV1[];
  meetingTasks: readonly MeetingTaskProjectionV1[];
  pendingHandRaises: readonly PublicHandRaiseV1[];
  continuationMaterials: readonly PublicContinuationMaterialV1[];
  limits: PublicMeetingLimitsV1;
  planningReason: string;
}

interface PublicBlockingFactV1 {
  id: string;
  kind: "question" | "objection" | "issue" | "risk" | "required_review";
  subjectId: string;
  summary: string;
}

interface PublicHandRaiseV1 {
  id: string;
  participantId: string;
  reason: string;
  summary: string;
  taskIds: readonly string[];
  replyToMessageId?: string;
  agendaItemId?: string;
  priority: "normal" | "high" | "blocking";
}

interface PublicContinuationMaterialV1 {
  sourceMeetingId: string;
  sourceKind:
    "final_summary" | "decision" | "issue" | "risk" | "evidence" | "artifact";
  sourceObjectId?: string;
  summary: string;
  checksum?: string;
}

interface PublicMeetingLimitsV1 {
  maxTurns: number;
  maxSpeakersPerTurn: number;
  maxTotalMessages: number;
  maxDurationMs?: number;
  speakerAttemptTimeoutMs?: number;
  mailHandlingTimeoutMs?: number;
}
```

Manager context 不得包含 Participant 的隐藏推理、私有 mailbox、完整内部工具输出或无关 Session 历史。

### Public message

```ts
type PublicMessageKind =
  | "statement"
  | "question"
  | "answer"
  | "proposal"
  | "objection"
  | "evidence"
  | "review"
  | "summary"
  | "decision";

interface PublicMeetingMessageV1 {
  id: string;
  seq: number;
  turnId: string;
  stepId: string;
  speaker: string;
  agendaItemId: string;
  kind: PublicMessageKind;
  content: string;
  mentions: readonly string[];
  replyTo?: string;
  taskIds: readonly string[];
  createdAt: number;
}
```

`PublicQuestionV1.askedBy`、`agendaItemId` 和 `blocking` 在 V1 保持 optional，以兼容历史 Archive 读取中的缺失字段。内部 canonical `MeetingQuestion` 对这三个字段保持 required；active 和 execution-terminal status producer 对新建的 canonical Question 必须始终输出它们。

active 和 execution-terminal discussion status producer 始终输出 `questions`；该字段为 additive optional，旧 V1 caller 不提供时不影响 command 输入。

active 和 execution-terminal discussion status producer 始终输出 `proposals`，包含当前与已 `superseded` 的 canonical `proposalId + revision` 及各 revision 自有的 Position。后续 Participant 必须从该类型化 projection 获取可提交 `PositionClaimV1` 的 proposal revision；不得从 transcript 文本或本地生成规则推断 canonical ID。新 revision 必须保留旧 revision 快照，但旧 revision 的 Position 不参与新 revision 的当前共识或 termination dissent 计算。

### Manager plan submission

```ts
interface ManagerPlanSubmissionV1 {
  protocolVersion: 1;
  meetingId: string;
  planningAttemptId: string;
  observedMeetingVersion: number;
  requestId: string;
  agendaItemId: string;
  intent: string;
  objective: string;
  expectedOutputs: readonly string[];
  prohibitedTopics: readonly string[];
  steps: readonly {
    participantId: string;
    instruction: string;
    reason: string;
  }[];
}
```

Manager plan 是建议。Meeting Runtime 必须验证 agenda、required speakers、dispatchability、权限、会议限制和顺序后才能形成正式 Turn。

### Turn submission

```ts
interface TurnSubmissionV1 {
  protocolVersion: 1;
  meetingId: string;
  turnId: string;
  stepId: string;
  attemptId: string;
  deliveryId: string;
  agendaItemId: string;
  kind: PublicMessageKind;
  content: string;
  mentions: readonly string[];
  replyTo?: string;
  taskIds: readonly string[];
  agendaRelation:
    | "on_topic"
    | "supporting_context"
    | "new_topic_candidate"
    | "blocking_interrupt";
  changes: PublicMeetingChangesV1;
  completionClaims?: CompletionClaimsV1;
}
```

`TurnSubmissionV1` 的规范化内容构成幂等 request hash。相同 attempt 的重试不得改变内容。

### Public meeting changes

```ts
interface PublicMeetingChangesV1 {
  questions?: readonly QuestionClaimV1[];
  proposals?: readonly ProposalClaimV1[];
  positions?: readonly PositionClaimV1[];
  issues?: readonly IssueClaimV1[];
  decisionProposals?: readonly DecisionProposalClaimV1[];
  agendaCandidates?: readonly AgendaCandidateClaimV1[];
}

interface QuestionClaimV1 {
  text: string;
  directedTo?: string;
  blocking: boolean;
  affectedOutputIds?: readonly string[];
  affectedCriterionIds?: readonly string[];
  violatedConstraintIds?: readonly string[];
}

interface ProposalClaimV1 {
  proposalId?: string;
  expectedRevision?: number;
  title: string;
  description: string;
}

interface PositionClaimV1 {
  proposalId: string;
  proposalRevision: number;
  position: "support" | "accept" | "object" | "needs_revision" | "abstain";
  reason?: string;
  blocking: boolean;
}

interface IssueClaimV1 {
  title: string;
  description: string;
  affectedOutputIds: readonly string[];
  affectedCriterionIds: readonly string[];
  violatedConstraintIds: readonly string[];
  impact: "none" | "low" | "medium" | "high" | "critical";
  urgency: "now" | "before_release" | "later";
  safeDefaultAvailable: boolean;
}

interface DecisionProposalClaimV1 {
  proposalId: string;
  proposalRevision: number;
  statement: string;
  rationale: string;
}

interface AgendaCandidateClaimV1 {
  title: string;
  reason: string;
  relationToActiveAgenda: "related" | "adjacent" | "unrelated";
  urgency: "now" | "before_release" | "later";
  suggestedParticipants: readonly string[];
}
```

上述对象均为 claim。Meeting Runtime 生成正式 ID，绑定真实 caller，并验证 Meeting、agenda、proposal revision、blocking evidence 和授权。

`affectedOutputIds`、`affectedCriterionIds` 与 `violatedConstraintIds` 是 Question evidence claim；缺失值规范化为 `[]`。非 blocking Question 可以不引用 evidence，但如提供，每个 ID 都必须属于当前 Meeting objective contract。blocking Question 三组引用合并后必须至少有一个，全部必须属于 contract，且至少一个引用仍未满足：required output 未 `accepted`、criterion 为 `satisfied: false`，或引用 hard constraint。空、未知或仅指向已满足 output/criterion 的 blocking claim 返回非重试 `INVALID_ARGUMENT`；整个 turn 不产生 message、Question、event、receipt、version 或 outbox 副作用。required-review 与 risk evidence 不属于 V1 Question claim。

Question resolution 只能绑定当前 Meeting 中由 caller authored 的正式 answer message；成功后固化 `answerMessageId`，不得被另一答案覆盖，也不得改写 Question evidence。非法 Question claim 或 resolution 公开为非重试的 `INVALID_ARGUMENT`，不得泄露内部错误码。

Participant 的 Position 不得携带其他 Participant 的有效身份。正式 Decision 的 `status`、`acceptedBy`、`dissentingPositionIds` 和接受方式不得由 Participant 输入。

### Completion claims

```ts
interface CompletionClaimsV1 {
  outputClaims?: readonly EvidenceClaimV1[];
  criterionClaims?: readonly EvidenceClaimV1[];
  agendaResolution?: AgendaResolutionClaimV1;
  review?: ReviewClaimV1;
  questionResolutions?: readonly QuestionResolutionClaimV1[];
  riskAcceptance?: RiskAcceptanceClaimV1;
}

interface EvidenceClaimV1 {
  subjectId: string;
  evidenceMessageIds: readonly string[];
  taskIds: readonly string[];
}

interface AgendaResolutionClaimV1 {
  agendaItemId: string;
  resolution: string;
  evidenceMessageIds: readonly string[];
}

interface ReviewClaimV1 {
  outputId: string;
  result: "approved" | "changes_required";
  reason: string;
  evidenceMessageIds: readonly string[];
}

interface QuestionResolutionClaimV1 {
  questionId: string;
  answerMessageId: string;
}

interface RiskAcceptanceClaimV1 {
  issueId: string;
  decision: "accept" | "reject";
  reason: string;
  evidenceMessageIds: readonly string[];
}
```

Completion claim 只提交声明和证据，不直接覆盖 Meeting 状态。Meeting Runtime 必须验证真实 caller、authority、evidence 和当前版本，再派生正式完成事实。

`QuestionResolutionClaimV1` 只能引用当前 Meeting 中由真实 caller 已正式提交的 answer message。合法 resolution 将 Question 设为 `answered` 并固化 `answerMessageId`；已回答 Question 不得改绑另一 answer。

MeetingTask `completed` 默认只构成 evidence，不自动表示 output accepted、agenda resolved 或 Meeting completed。

### Authorized MeetingTask association

Meeting Runtime 将 `meetingTaskId`、`participantId` 和 `originatingSpeakerAttemptId` 作为 MeetingState 内不可变来源绑定。任务状态或结果进入 speaker context、HandRaise 或 CompletionFact 前，Runtime 必须验证当前 caller 权限，并只投影会议所需的过滤结果；不保存外部任务 association 或第二份 Session ownership。

meeting-owned Participant Session 只能通过 `convivium_create_meeting_task` 创建任务。协议 handler 将合法的 `MeetingTaskRequestV1` 交给 Meeting Runtime；Runtime 通过既有 repository transition 写入 MeetingState，不调用 DSH Captain task API，也不把 Participant 提升为 Captain。

### Hand raise submission

```ts
interface HandRaiseSubmissionV1 {
  protocolVersion: 1;
  meetingId: string;
  requestId: string;
  reason:
    | "task_completed"
    | "new_evidence"
    | "answer_ready"
    | "blocking_objection"
    | "correction"
    | "user_requested";
  summary: string;
  taskIds: readonly string[];
  replyToMessageId?: string;
  agendaItemId?: string;
  priority: "normal" | "high" | "blocking";
}
```

HandRaise 是调度输入，不是正式发言，不得直接形成 transcript、Decision 或 CompletionFact。

### Delivery acknowledgement

`submit_turn` 同时匹配当前 `attemptId` 和 `deliveryId` 时，成功提交必须原子完成：

1. delivery accepted；
2. context acknowledged；
3. message 和合法 claims commit。

之后到达的同一 `deliveryId` accepted 回写必须幂等成功，不得降低 acknowledgement、重复上下文或重复提交会议事实。

### Required speaker unavailable

Required speaker 当前不可调度时，规划命令必须失败并返回 `REQUIRED_SPEAKER_UNAVAILABLE`。失败不得创建部分 Turn、Step 或 Attempt，不得自动替换或豁免 required speaker。同一 Meeting version 不得自动重复调度相同失败。

### Authorized status projection

同一个 `MeetingStatusResultV1` 同时用于 Agent tool 和 Plugin Frontend 的类型化状态读取，避免形成两套状态语义。插件面板使用：

```ts
interface LocalMeetingListItemV1 {
  meetingId: string;
  teamId: string;
  topic: string;
  status: MeetingStatusResultV1["status"];
  meetingVersion: number;
  updatedAt: number;
}

interface LocalMeetingListResultV1 {
  meetings: readonly LocalMeetingListItemV1[];
}

interface LocalMeetingListResponseV1 {
  protocolVersion: 1;
  ok: true;
  result: LocalMeetingListResultV1;
}
```

`GET /api/convivium/meetings` 仅在 `webServer.host === "127.0.0.1"` 注册，body 为 `none`，返回 `LocalMeetingListResponseV1`。它不能使用 `ProtocolSuccessV1`，因为后者的 envelope 必须描述单一 Meeting 的 `meetingId` 与 `meetingVersion`，而 list 没有这两个全局值。Runtime 从本地 data root 中已进入 bootstrap `ready` 且可成功 rehydrate 的 Meeting repository 读取摘要；可读取的 `creating|creation_failed` repository 不是公开 Meeting，关闭后跳过。列表包含 active、execution-terminal、`archiving` 和 `archived` Meeting，按 `updatedAt` 降序、再按 `meetingId` 升序排序。列表不接受 filter、pagination、teamId、Agent Session 或任何身份字段，且不得返回 transcript、objective、Session ID、capability、SQLite 路径、outbox、私有运行数据或完整 status projection。data root 尚不存在（`ENOENT`）表示没有 Meeting，返回空 list；除此以外 data root 无法读取、repository 无法读取 bootstrap，或已为 `ready` 的 Meeting repository 无法 rehydrate/读取 snapshot 时，整个 list 返回 HTTP `503`、`Retry-After: 1` 和无 body，不得返回部分列表。

Client 必须先读取该 list；用户选择一项 `meetingId` 后才调用详情或控制 route。Client 不得从 URL/query 参数、当前 DSH Session、Agent tool result 或人工输入推断初始选择，也不得在本范围新增 Meeting 创建、跨 Meeting 导航或筛选 UI。

所有 Meeting Web route 通过一个 `prefix` registration `/api/convivium/meetings` 分派。精确允许的组合只有：`GET /api/convivium/meetings`、`GET /api/convivium/meetings/:meetingId`、`POST /api/convivium/meetings/:meetingId/pause`、`POST /api/convivium/meetings/:meetingId/resume`；结尾 `/`、其他 path 或其他 method 返回 HTTP `404` 和无 body。支持 route 带任意 query、URL 含非法 percent encoding，或 POST 缺失/错误的 JSON media type、body 超过 `16_384` bytes、JSON 无法解析、含未定义字段、path/body `meetingId` 不一致或 Schema 不合法时，返回 HTTP `400` 和 `ProtocolErrorV1`，其 `code` 固定为 `INVALID_ARGUMENT`、`message` 固定为 `Invalid meeting request.`、`retryable` 固定为 `false`；请求尚不能可信解析时省略 Meeting metadata。pause body 只允许 `protocolVersion | meetingId | expectedMeetingVersion | requestId | reason`，resume body 只允许前四项；因此用户、Team、Agent Session、Captain 或其他 authority 字段均被拒绝。`VERSION_CONFLICT` 与 `IDEMPOTENCY_CONFLICT` 返回 HTTP `409` 和 Runtime 提供的 `ProtocolErrorV1`；`MEETING_NOT_FOUND` 返回 HTTP `404` 和 Runtime 提供的 `ProtocolErrorV1`；其他领域 `ProtocolErrorV1` 返回 HTTP `400`。data root 尚不存在或目标 repository 尚未进入 `ready` 时，list 返回空/跳过该项且单 Meeting route 返回 `MEETING_NOT_FOUND`；除此以外目标 Meeting 冷恢复失败，或 list 中任一 `ready` Meeting repository 恢复/读取失败时返回 HTTP `503`、`Retry-After: 1` 和无 body；未知异常返回 HTTP `500` 和无 body。所有成功 JSON 与 `ProtocolErrorV1` response 均设置 `content-type: application/json; charset=utf-8`；成功状态为 HTTP `200`。

| Method and route                         | Body | Result                                     |
| ---------------------------------------- | ---- | ------------------------------------------ |
| `GET /api/convivium/meetings`            | none | `LocalMeetingListResponseV1`              |
| `GET /api/convivium/meetings/:meetingId` | none | `ProtocolSuccessV1<MeetingStatusResultV1>` |

V1 route 仅在 `webServer.host === "127.0.0.1"` 注册，且对所有到达该本地 Host 的请求返回相同的完整 Web projection；它不解析用户或 Team authority，也不得接受或伪造 Agent Session ID。Agent tool 仍使用真实 caller Session 进行身份裁剪。

Meeting 进入 `archived` 前，仍有效的 Manager/Participant Session 可以按身份读取状态。Meeting-owned Sessions 关闭并撤销 capability 后，Manager 和 Participant 不再具有可调用身份；`archived` 状态和归档内容只能由真实 Captain Session 或 V1 loopback Web route 读取。

```ts
interface PublicTerminationV1 {
  code: string;
  reason: string;
  decisionIds: readonly string[];
  unresolvedQuestionIds: readonly string[];
}

interface PublicExecutionTerminationV1 extends PublicTerminationV1 {
  dissentingPositionIds: readonly string[];
  blockingAgendaItemIds: readonly string[];
  finalMessage: string;
  endedAt: number;
}

interface MeetingStatusBaseV1 {
  meetingId: string;
  meetingVersion: number;
  topic: string;
  objective: string;
  continuationMaterials: readonly PublicContinuationMaterialV1[];
  limits: PublicMeetingLimitsV1;
}

interface DiscussionMeetingStatusBaseV1 extends MeetingStatusBaseV1 {
  activeAgendaItem?: PublicAgendaItemV1;
  messages: readonly PublicMeetingMessageV1[];
  questions?: readonly PublicQuestionV1[];
  proposals: readonly PublicProposalV1[];
  acceptedDecisions: readonly PublicDecisionV1[];
  blockingFacts: readonly PublicBlockingFactV1[];
}

interface ActiveMeetingStatusResultV1 extends DiscussionMeetingStatusBaseV1 {
  status: "created" | "running" | "waiting" | "paused" | "converging";
  currentTurn?: PublicTurnV1;
  currentSpeakerId?: string;
  waitState?: PublicMeetingWaitStateV1;
  pendingHandRaises: readonly PublicHandRaiseV1[];
  meetingTasks: readonly MeetingTaskProjectionV1[];
  pauseControl: {
    action: "pause" | "resume" | "none";
    pausedAt?: number;
    pausedBy?: {
      kind: "user" | "captain" | "local_host";
      actorId: string;
      displayName?: string;
    };
    reason?: string;
  };
  termination?: never;
  archive?: never;
}

interface PublicMeetingWaitStateV1 {
  reason: string;
  taskIds: readonly string[];
  participantIds: readonly string[];
  deadlineAt?: number;
  resumeAgendaItemId?: string;
}

interface ExecutionTerminalMeetingStatusResultV1 extends DiscussionMeetingStatusBaseV1 {
  status: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
  currentTurn?: never;
  currentSpeakerId?: never;
  pendingHandRaises: readonly [];
  pauseControl: { action: "none" };
  termination: PublicExecutionTerminationV1;
  completionFactIds: readonly string[];
  archive?: never;
}

interface ArchivingMeetingStatusResultV1 extends MeetingStatusBaseV1 {
  status: "archiving";
  currentTurn?: never;
  currentSpeakerId?: never;
  pendingHandRaises: readonly [];
  pauseControl: { action: "none" };
  termination: PublicTerminationV1;
  archive: PublicMaterializedArchiveRecordV1;
}

interface ArchivedMeetingStatusResultV1 extends MeetingStatusBaseV1 {
  status: "archived";
  currentTurn?: never;
  currentSpeakerId?: never;
  pendingHandRaises: readonly [];
  pauseControl: { action: "none" };
  termination: PublicTerminationV1;
  archive: PublicCompletedArchiveRecordV1;
}

type MeetingStatusResultV1 =
  | ActiveMeetingStatusResultV1
  | ExecutionTerminalMeetingStatusResultV1
  | ArchivingMeetingStatusResultV1
  | ArchivedMeetingStatusResultV1;

interface PublicMaterializedArchiveRecordV1 {
  package: PublicArchivePackageV1;
  archivedAt?: never;
}

interface PublicCompletedArchiveRecordV1 {
  package: PublicArchivePackageV1;
  archivedAt: number;
}

interface PublicArchivePackageV1 {
  schemaVersion: 1;
  meetingId: string;
  teamId: string;
  sourceMeetingId?: string;
  objectiveContract: PublicObjectiveContractV1;
  finalSummary: string;
  artifactRefs: readonly PublicArtifactRefV1[];
  acceptedDecisions: readonly PublicDecisionV1[];
  proposals: readonly PublicArchiveProposalV1[];
  completionFacts: readonly PublicArchiveCompletionFactV1[];
  agenda: readonly PublicAgendaItemV1[];
  issues: readonly PublicArchiveIssueV1[];
  unresolvedQuestions: readonly PublicQuestionV1[];
  parkingLot: readonly PublicArchiveAgendaCandidateV1[];
  formalTranscript: readonly PublicMeetingMessageV1[];
  participantProvenance: readonly {
    participantId: string;
    displayName: string;
    role?: string;
    templateVersion?: string;
  }[];
  termination: PublicTerminationV1;
  endedAt: number;
  materializedAt: number;
}

interface PublicProposalV1 {
  id: string;
  agendaItemId: string;
  title: string;
  description: string;
  revision: number;
  status: "draft" | "under_review" | "accepted" | "rejected" | "superseded";
  positions: readonly {
    id: string;
    participantId: string;
    position: "support" | "accept" | "object" | "needs_revision" | "abstain";
    reason?: string;
    blocking: boolean;
    proposalRevision: number;
  }[];
}

type PublicArchiveProposalV1 = PublicProposalV1;

interface PublicArchiveCompletionFactV1 {
  id: string;
  kind: string;
  subjectId: string;
  assertedBy: string;
  authority?: string;
  result: string;
  evidenceMessageIds: readonly string[];
  taskIds: readonly string[];
  reason?: string;
  status: "active" | "superseded" | "revoked";
}

interface PublicArchiveIssueV1 {
  id: string;
  title: string;
  description: string;
  disposition:
    "blocking" | "follow_up" | "parking_lot" | "accepted_risk" | "out_of_scope";
  status: "open" | "waiting" | "resolved" | "accepted" | "deferred";
  rationale: string;
  ownerId?: string;
  relatedTaskIds: readonly string[];
}

interface PublicArchiveAgendaCandidateV1 {
  id: string;
  title: string;
  reason: string;
  status: "pending" | "promoted" | "parked" | "rejected";
}

interface PublicArtifactRefV1 {
  artifactId: string;
  title: string;
  version?: string;
  checksum?: string;
  sourceTaskId?: string;
  uri?: string;
}
```

该 union 只表达字段结构显著不同的四个生命周期阶段，不为每个细粒度 `status` 建立独立接口。`waiting`、`paused` 和 `converging` 等 active 子状态继续共享 `ActiveMeetingStatusResultV1`；其 `pauseControl`、等待原因等细粒度一致性由 Runtime schema 和状态转换校验，不通过更多 TypeScript 分支复制完整 projection。

当 active Meeting 因 `REQUIRED_SPEAKER_UNAVAILABLE` 或其他已提交的等待条件停止推进时，Runtime 必须进入 `status='waiting'` 并输出 `waitState`。`reason` 与 `participantIds` 是面板和 Agent 可观察的正式状态，不得只留在 `manager_plan.failed` event 或日志中；该状态本身不创建部分 Turn、Step 或 Attempt。

Meeting Runtime 必须按 caller 身份裁剪 projection。任何 projection 都不得包含其他 Agent 的私有 Session 历史、隐藏推理、私有 mailbox、完整内部工具输出或可复用的 Session capability。

`archive.package` 在成果物化后即可只读展示；Meeting 仍可能处于 `archiving`。只有 meeting-owned Sessions 全部停止、关闭并撤销 capability，且最终事务写入关闭完成事实和 `meeting.archived` 后，Runtime 才能设置 `status='archived'` 和 `archive.archivedAt`。归档内容不得包含 AgentSession ID、完整 Agent 配置、delivery/outbox payload、私聊或可恢复 capability；底层已关闭 Session 数据是否保留不属于本协议。

归档包必须自包含 transcript、决策、完成依据、未解决事项和其他正式会议事实，不能只保存指向即将被裁剪的运行态对象 ID。归档只复制已提交 MeetingState 中存在的字段，不填造默认值：`PublicDecisionV1` 的 `agendaItemId`、`statement`、`rationale`、`acceptedBy`、`dissentingPositionIds`，`PublicArchiveIssueV1.rationale`，以及 `PublicQuestionV1` 的 `askedBy`、`agendaItemId`、`blocking` 均为 optional。`parkingLot` 逐项投影已提交 `agendaCandidates` 的 `id`、`title`、`reason`、`status`。Archive issue status 原样保留 MeetingIssue 已提交值，包含 `accepted_risk` 与 `out_of_scope`，不重写。artifact 内容不强制复制进归档；artifact ref 保存来源 ID、标题、版本、可选 URI 和可选 checksum，并在读取时重新执行授权。checksum 只是来源描述，不参与归档完成、状态转换或恢复判断。

当 `status='archiving'|'archived'` 时，`currentTurn`、`currentSpeakerId` 和 pending hand raises 必须为空。归档 transcript、提案、立场、决策、完成事实和未解决事项以 `archive` 为准；实现不得同时维护另一份可漂移的归档 projection。

所有成功 envelope 顶层的 `meetingId`、`meetingVersion` 与 result 中同名字段必须一致；实现不得让消费者在两个值之间选择。

### Success receipt

```ts
interface ProtocolSuccessV1<T> extends ProtocolMeta {
  ok: true;
  result: T;
}

interface ManagerPlanResultV1 {
  turnId: string;
  firstStepId: string;
  firstAttemptId: string;
}

interface TurnSubmissionResultV1 {
  messageId: string;
  messageSeq: number;
  turnStatus: "running" | "completed" | "truncated";
  nextStepId?: string;
  meetingStatus: MeetingStatusResultV1["status"];
}

interface HandRaiseResultV1 {
  handRaiseId: string;
  status: "pending" | "accepted" | "deferred" | "consumed" | "rejected";
}

interface ReassignTurnResultV1 {
  revokedAttemptId: string;
  replacementAttemptId?: string;
  action: "reassign" | "skip";
}

interface EndMeetingResultV1 {
  status: "completed" | "partial" | "no_consensus" | "cancelled";
  terminationCode: string;
}
```

相同幂等 key 和相同规范化内容必须返回首次成功 receipt；相同 key 和不同内容必须返回冲突错误。

### Command result mapping

| Command                         | `ProtocolSuccessV1<T>.result`    |
| ------------------------------- | -------------------------------- |
| `convivium_create_meeting`      | `CreateMeetingResultV1`          |
| `convivium_meeting_status`      | `MeetingStatusResultV1`          |
| `convivium_submit_manager_plan` | `ManagerPlanResultV1`            |
| `convivium_submit_turn`         | `TurnSubmissionResultV1`         |
| `convivium_create_meeting_task` | `MeetingTaskResultV1`            |
| `convivium_meeting_task_status` | `MeetingTaskStatusResultV1`      |
| `convivium_start_meeting_task`  | `MeetingTaskStartResultV1`       |
| `convivium_finish_meeting_task` | `MeetingTaskFinishResultV1`      |
| `convivium_raise_hand`          | `HandRaiseResultV1`              |
| `convivium_pause_meeting`       | `MeetingControlResultV1`         |
| `convivium_resume_meeting`      | `MeetingControlResultV1`         |
| `convivium_dispose_risk`        | `CaptainRiskDispositionResultV1` |
| `convivium_reassign_turn`       | `ReassignTurnResultV1`           |
| `convivium_end_meeting`         | `EndMeetingResultV1`             |

### Event and projection read contract

本协议不声明、注册或写入 `convivium/meeting-*` 等插件自定义持久化 DSH Session Event。当前 DSH 的已知事件集合不包含仓库外插件声明的事件；TypeScript declaration merge 不能构成运行时注册。

事件边界固定如下：

| Channel                                            | Owner           | Contract                                                                     |
| -------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| SQLite `meeting_events`                            | Meeting Runtime | 保存有序会议领域事件和审计事实；不是 DSH Session Event，也不是公开传输协议   |
| `convivium_meeting_status` 或类型化 Web projection | Meeting Runtime | 向本 Interface 允许的 Agent caller 或 V1 loopback Web 返回当前会议真相       |
| DSH 原生 `tool/call`、`tool/result`                | DSH             | 按 DSH 既有规则记录会议工具调用及结果；不替代会议状态、transcript 或审计事件 |

Plugin Frontend 必须定时读取完整 Web projection，在会议写操作成功后立即重新读取，并在会议页面重新获得焦点时重新读取。三种读取都整体替换本地缓存，不合并状态增量。协议不定义进程内 projection invalidation、状态增量通知或对应事件订阅。

Meeting Runtime 可以消费 DSH-owned Session Events 作为 DSH 工具或生命周期事实，但不得重新定义这些事件的 schema、持久化和兼容语义。

### Transport failure and host restart

本协议不定义 DSH Host 的全局 availability projection。Web route 无法连接、超时、冷恢复期间不可访问，或返回没有 `ProtocolErrorV1` envelope 的 HTTP `5xx`，属于传输失败，不是 Meeting 领域状态，也不伪装成已执行的会议命令。携带合法 `ProtocolErrorV1` 的 HTTP 响应仍按协议错误处理。Plugin Frontend 可以保留最后一次成功 projection 供只读参考，但必须将其标记为缓存、显示连接失败并禁用写操作；请求恢复后必须重新读取完整 projection。

插件冷恢复完成前不开放 Meeting Web route 和会议工具；如果宿主集成要求提前注册 route，则统一返回 HTTP `503 Service Unavailable` 和 `Retry-After`，不得返回旧 projection。Agent factory、continuable provider、Session resume 或 followup 在一次已到达的协议操作中失败时，Runtime 返回 `INTERNAL_ERROR` 和正确的 `retryable`，同时保留安全错误信息；此类失败不递增 Meeting version，不写 termination，也不把 Meeting 改为 `failed`。Participant 是否可调度仍由已有 `PARTICIPANT_NOT_DISPATCHABLE` 和 `REQUIRED_SPEAKER_UNAVAILABLE` 表达。

## Error And Permission Semantics

### Error envelope

```ts
interface ProtocolErrorV1 {
  protocolVersion: 1;
  ok: false;
  code: MeetingProtocolErrorCodeV1;
  message: string;
  meetingId?: string;
  meetingVersion?: number;
  turnId?: string;
  stepId?: string;
  attemptId?: string;
  deliveryId?: string;
  participantId?: string;
  retryable: boolean;
}
```

`message` 可以向 Agent 和用户展示，不得包含隐藏 prompt、私有工具输出、内部 Session payload 或其他敏感数据。

### Error codes

```ts
type MeetingProtocolErrorCodeV1 =
  | "INVALID_ARGUMENT"
  | "MEETING_NOT_FOUND"
  | "UNAUTHORIZED_CALLER"
  | "INVALID_STATE_TRANSITION"
  | "STALE_ATTEMPT"
  | "STALE_MANAGER_ATTEMPT"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "IMMUTABLE_MEETING"
  | "ARCHIVED_MEETING"
  | "SOURCE_MEETING_NOT_ARCHIVED"
  | "ARCHIVE_MATERIAL_NOT_FOUND"
  | "PARTICIPANT_NOT_DISPATCHABLE"
  | "REQUIRED_SPEAKER_UNAVAILABLE"
  | "MANAGER_PLAN_INVALID"
  | "DELIVERY_RETRY_EXHAUSTED"
  | "UNSUPPORTED_CAPABILITY"
  | "INTERNAL_ERROR";
```

`UNSUPPORTED_CAPABILITY` 表示输入在完整协议中合法，但当前已声明的插件运行范围尚未提供对应 capability，例如只启用 `round_robin` 的竖切收到 `manager` selection mode。该错误必须是 `retryable: false`，且在任何目录、bootstrap、Session、Meeting state、event、receipt 或 outbox 副作用前返回。实现缺陷、provider/SQLite 故障和未知异常仍使用 `INTERNAL_ERROR`，不得用它伪装明确的范围限制。

`submit_turn` 内部产生的 `INVALID_ENTITY_STATE` 统一公开为非重试的 `INVALID_ARGUMENT`，不得原样返回；这覆盖非法 Question claim/resolution，也保持其他 submit claim 的内部错误码不泄露。Question 场景包括空文本、无效 target、重复 ID、unknown Question、非 caller authored answer 和已回答 Question 的再次 resolution。

`VERSION_CONFLICT` 表示 command 的 expected Meeting version 已过期，必须是 `retryable: true`，且不得写入 state、event、receipt 或 outbox。

### Permission matrix

| Operation                | Captain | Manager | Current Speaker | Other Participant |
| ------------------------ | ------: | ------: | --------------: | ----------------: |
| Create meeting           |     yes |      no |              no |                no |
| Read authorized status   |     yes |     yes |             yes |               yes |
| Submit Manager plan      |      no |     yes |              no |                no |
| Submit current Turn      |      no |      no |             yes |                no |
| Request background task  |      no |      no |             yes |                no |
| Raise hand               |      no |      no |             yes |               yes |
| Send meeting-scoped mail |      no |      no |             yes |               yes |
| Pause/resume Meeting     |     yes |      no |              no |                no |
| Dispose specified risk   |     yes |      no |              no |                no |
| Reassign current speaker |     yes |      no |              no |                no |
| End/accept/waive         |     yes |      no |              no |                no |

如果 Captain 同时作为 Participant 发言，必须使用对应 Participant Session 调用 `submit_turn`，不能使用 Captain Session 绕过发言权。

表中的 Manager 和 Participant 读取权限仅在其 meeting-owned Session 仍有效时成立；Session 关闭后只保留 Captain tool 和 V1 loopback Web route 的读取入口。

### Permission composition

Convivium 权限只能收窄会议操作，不能扩大 DSH、Sandbox、Approval 或用户已经授予的权限。DSH 允许某个普通 Tool 不表示 caller 可以绕过 Convivium 的会议身份和发言 capability；Convivium 允许会议操作也不表示 Agent 获得额外的普通 DSH Tool 权限。

## Compatibility

Convivium 要求 DSH `>=0.1.1-rc.2`，并以该版本的 `dsh-subagent` 公开契约为最低能力基线。Meeting Runtime 可以使用 `listChildren`/`listDescendants` 枚举持久子 Session，使用 `interrupt` 停止当前 turn，并使用 `drainContinuableChildren` 等待指定 resident Activation 释放。`drainContinuableChildren` 不删除持久 Session，也不永久禁止 cold resume；持久的不可继续语义必须由 Meeting Runtime 撤销会议 capability，并在任何 meeting followup 前验证。

插件装配发现 DSH 或 `dsh-subagent` 低于该能力基线时必须拒绝加载会议能力并报告兼容错误，不得静默退化为只调用 `interrupt`。归档、恢复和权限判断不得依赖 DSH 物理删除 Session 数据。

1. 本协议版本固定为 `1`。
2. 新增 optional 字段属于向后兼容变化；调用方必须忽略未知 optional 字段。
3. 删除字段、改变字段含义、收紧既有合法值或改变幂等语义属于破坏性变化，必须提升协议版本。
4. 新增错误码属于兼容变化；调用方必须能把未知错误码作为不可自动重试的通用协议错误处理。
5. DSH 通用接口升级由插件适配层吸收，不应无条件改变本协议语义。
6. Agent 内部 Skills、Tools、MCP 或执行顺序变化，只要仍满足本协议，不构成协议版本变化。
7. Meeting Runtime 必须拒绝不支持的 `protocolVersion`，不得按相近版本猜测解释。
8. `meetingContext` 是 Convivium mail 的 optional 字段；不含该字段的普通 TeamMember mail 使用普通身份解析、投递和处理行为。
9. 不识别 meeting-scoped recipient 的实现必须明确拒绝，不能把 Participant ID 当成 TeamMember 名称进行投递。

## Related Documents

- 架构边界：[`../00-governance/ARCHITECTURE.md`](../00-governance/ARCHITECTURE.md)
- 产品需求：[`../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- 实现设计：[`../30-designs/MEETING-ORCHESTRATION-DESIGN.md`](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)

本文定义 Plugin Frontend Meeting route 的路径、payload 和共享状态 projection 语义。V1 不从 DSH Web 请求取得用户或 Team authority：仅当 `webServer.host === "127.0.0.1"` 时注册 route，所有到达该 loopback Host 的请求共享本地用户边界。Host 为 `0.0.0.0`、远程访问或多用户部署不属于 V1，且必须在 route 注册前 fail closed；未来引入这些能力前必须另建用户/Team authorization interface 并以当前 DSH 公开 API 取证。
