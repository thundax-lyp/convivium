# RUNBOOK：闭环 B——MeetingTask 与举手

状态：待执行（实现 TODO 待逐项确认）

本 RUNBOOK 依据用户于 2026-08-27 确认的结论修订：Convivium 不再把 Agent Teams 的 `TeamTask` 当作会议异步工作能力。闭环 B 改为完整实现 Convivium-owned `MeetingTask`，实际执行复用 DSH continuable Participant Session。

文件名暂时保留原名，避免正在进行的 A/B 协作和 TODO 引用失效；T0 完成正式契约迁移时统一重命名并修复引用。

本 RUNBOOK 是一次性执行手册。实现完成后，长期结论和验证证据必须迁移到正式文档，并删除本文件。

## 1. 结论与目标

### 1.1 所有权

- `MeetingTask` 是 Convivium 的会议领域对象，事实源是该 Meeting 的 SQLite `MeetingState`。
- DSH 只拥有 Participant continuable AgentSession、FIFO followup、Session lifecycle 和底层模型/工具执行。
- `MeetingTask` 不是 DSH `TeamTask`、Agent Teams task board、`ctx.jobs` Job 或通用工作流节点。
- Meeting Runtime 不读取或修改 Agent Teams 的 roster、task DAG、mailbox 或状态文件。

### 1.2 闭环

```text
当前 Participant SpeakerSession
→ convivium_create_meeting_task
→ Runtime 原子创建 requested MeetingTask
→ Participant 调用 convivium_submit_turn 提交简短状态
→ 同一 Meeting transaction 释放 SpeakerAttempt、将 task 置为 queued、写 execution outbox
→ outbox 向原 Participant continuable Session 投递后台执行 prompt
→ Participant 先读取 convivium_meeting_task_status，再调用 convivium_start_meeting_task 领取同一 execution
→ Participant 再次读取 status，确认 Meeting active、task running 且 mayExecute
→ Participant 执行长时间工作
→ Participant 调用 convivium_finish_meeting_task 提交结果，并显式请求后续发言
→ Runtime 原子终结 MeetingTask 并创建 pending HandRaise
→ Manager 后续规划读取 HandRaise 和 MeetingTask result projection
→ 新 SpeakerAttempt 固化 task snapshot
→ Participant 正式报告结果
```

`convivium_create_meeting_task` 不提交 transcript、不完成 SpeakerAttempt、不推进 Turn，也不立即投递后台工作。只有发起者合法 `convivium_submit_turn` 后，任务才进入执行队列并释放发言权。

## 2. 范围与非目标

### 2.1 必须完成

- 把正式需求、协议、领域模型和设计中的闭环 B 名称与所有权从 DSH `TeamTask` 修正为 Convivium `MeetingTask`。
- 实现 `convivium_create_meeting_task`、`convivium_meeting_task_status`、`convivium_start_meeting_task`、`convivium_finish_meeting_task` 和 `convivium_raise_hand` 的协议、schema、caller binding、幂等与错误语义。
- 在 `MeetingState` 中持久化 MeetingTask、结果和 HandRaise；所有正式事实只通过 `MeetingRepository.execute()` 提交。
- 复用现有 outbox 和 `MeetingSessionAdapter`，向原 Participant Session 投递稳定的 task execution envelope。
- 保证同一 Participant Session 的 SpeakerAttempt 与 MeetingTask execution 不并发；DSH FIFO 负责底层排队，Meeting eligibility 和 Runtime command 负责业务串行。
- 完成 blocking/non-blocking、pause、waiting、Meeting terminal、冷恢复、重复投递和新 SpeakerAttempt snapshot 语义。
- 通过自动化测试和独立 DSH profile 证明真实 continuable Session 闭环。

### 2.2 明确不包含

- Agent Teams、Team roster、共享 task DAG、任务抢占、转派、跨 Participant 执行或通用 mailbox。
- 关联外部 task、导入 Agent Teams task、跨 Meeting task 或第二套通用任务平台。
- 同一 Participant 同时执行多个非终态 MeetingTask；V1 每个 Participant 每场 Meeting 最多一个非终态任务。
- 自动重试失败的业务工作或轮换执行者；失败后如需再次工作，Participant 在后续合法发言中创建新的 MeetingTask。
- meeting-scoped Mail、HTTP route、Client UI、Archive 和闭环 A 的 completion/end 规则。
- 把 MeetingTask `completed` 自动升级为 output accepted、agenda resolved 或 Meeting completed。

## 3. 与闭环 A 的边界

### 3.1 闭环 B 独占

- MeetingTask create/start/finish、execution outbox、task result projection 和恢复。
- HandRaise 创建、去重、pending/consumed 生命周期和 planning 输入。
- Participant task eligibility、task execution envelope 和 task snapshot。
- B 专属事件、协议、测试和 readiness 证据。

### 3.2 闭环 A 独占

- CompletionClaim、CompletionFact、完成状态计算和 `convivium_end_meeting`。
- execution-terminal projection、Archive、Session close 和 capability revoke。
- `plugin/src/domain/completion.ts`。

### 3.3 共享不变量

- MeetingTask create/start/finish、HandRaise、Manager plan 和 Captain end 使用同一个 Meeting terminal-state/version gate。
- 同一 expected Meeting version 的竞争只允许一个 `MeetingRepository.execute()` 成功。
- Captain end 先成功后，B command 返回 `VERSION_CONFLICT` 或 `IMMUTABLE_MEETING`，不得新增 task result、HandRaise、planning 或成功 receipt。
- 任何进入 execution-terminal 的 transition，包括 Captain end 和 hard-limit 自动 `partial`，必须把仍为 `requested | queued | running` 的 MeetingTask 原子标记为 `cancelled`；这只关闭 Meeting-owned 事实，不保证停止 DSH 已接受的模型、工具或外部副作用。
- B 在独立 meeting-task domain 模块中拥有纯 `cancelNonTerminalMeetingTasks(state)` helper，返回更新后的 task state 和 `meeting_task.cancelled` events；A-owned terminal transition 在构造终态时调用该 helper，并在原 `MeetingRepository.execute()` transaction 中合并 events。不得新增 repository API、callback 框架或第二套事务。
- end 不删除或改写既有 execution outbox。dispatcher 在投递前后同时复查 Meeting terminal state、task status、Session capability 和 deliveryId；task 已 cancelled 或 Meeting 已终态时停止投递且不形成 Meeting fact。
- V1 不把 best-effort Session interrupt 混入 MeetingTask cancellation。Session close、capability revoke 和立即停止底层执行继续归 Archive/后续 lifecycle；迟到的 Meeting command 由 terminal gate 拒绝。
- B 只通过 `AuthorizedTaskEvidenceResolver` 提供当前 `MeetingSnapshot` 内已持久化的 `completed` MeetingTask result；resolver 在 `execute()` 写锁内同步读取，不访问 DSH Session 或外部状态。
- resolver 集成时删除旧外部 TeamTask 方案遗留的 `taskAttemptId`、`associationId`、`snapshotObservedAt` 和 TeamTask 错误文案；completion domain 继续只消费规范化后的 authorized MeetingTask IDs。
- A/B 共享文件只做语义合并，不以整文件覆盖另一侧公开改动。

## 4. MeetingTask 领域设计

### 4.1 Canonical shape

T0/T1 必须在正式领域模型中定义等价于以下最小 shape 的类型；字段名可以在契约审阅时调整，但不得增加第二套近义 task 类型：

```ts
type MeetingTaskStatus =
  "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";

interface MeetingTask {
  id: string;
  participantId: string;
  originatingSpeakerAttemptId: string;
  executionId: string;
  deliveryId: string;
  title: string;
  description: string;
  blocking: boolean;
  status: MeetingTaskStatus;
  resultSummary?: string;
  failureReason?: string;
  createdAt: number;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}
```

约束：

- `id`、`executionId` 和 `deliveryId` 在 create transaction 中一次生成并持久化，重投和恢复不得更换。
- `participantId` 和 `originatingSpeakerAttemptId` 由 Runtime 从真实 caller 和当前 attempt 绑定，不接受 payload 覆盖。
- MeetingTask 不复制 `meetingId` 或 `participantSessionId`。Meeting 由所属 `MeetingState` 确定；Runtime 每次 start/finish 都从正式 `session_ownership` 解析并验证 active Session、meetingId 和 participantId，避免第二份身份真相源。
- `resultSummary` 是 Participant 明确提交的会议证据摘要，不是隐藏推理、DSH 自动抽取结果或完整执行日志。
- `failureReason` 只在 `failed` 时存在；`resultSummary` 只在 `completed` 时必须存在。
- V1 不提供 dependencies、assignee、attempt rotation、reopen、transfer 或 arbitrary metadata。

### 4.2 状态机

```text
requested --originating submit_turn--> queued
requested --originating attempt timeout/abort--> cancelled
queued --same Participant start--> running
running --same Participant finish(success)--> completed + pending HandRaise
running --same Participant finish(failure)--> failed + pending HandRaise
requested|queued|running --Meeting execution terminal--> cancelled
queued --permanent authorized delivery failure--> failed
```

禁止转换：

- create 后绕过 `submit_turn` 直接进入 `queued` 或 `running`；
- originating SpeakerAttempt 已 timeout、aborted 或失效后保留可执行的 `requested` task；
- `completed | failed | cancelled` 重开或改写结果；
- 非 originating Participant 启动或终结任务；
- Runtime 根据 AgentSession idle、turn end 或自由文本自动宣告任务完成；
- task terminal 自动完成 Meeting。

### 4.3 公开投影

协议只定义一个 canonical `MeetingTaskProjectionV1`，由 Manager context、active meeting status 和 SpeakerAttempt task snapshot 复用，再按读取者权限裁剪。

投影至少包含：`meetingTaskId`、`participantId`、`title`、`blocking`、`status`、可选 `resultSummary/failureReason` 和时间字段。不得暴露 Session ID、`executionId`、`deliveryId`、outbox lease 或内部错误堆栈。

## 5. 协议与调用语义

### 5.1 `convivium_create_meeting_task`

输入只包含：

- `protocolVersion`
- `meetingId`
- `attemptId`
- `requestId`
- `title`
- `description`
- `blocking`

规则：

- caller 必须是 `attemptId` 对应的当前 Participant SpeakerSession。
- 同一 Meeting/Participant 已有 `requested | queued | running` task 时返回 `MEETING_TASK_ALREADY_ACTIVE`。
- 成功 transaction 创建 `requested` task、`meeting_task.created` event 和 command receipt；不写 execution outbox。
- 相同幂等键和相同 request hash 返回原结果；不同 hash 返回 `IDEMPOTENCY_CONFLICT`。

### 5.2 `convivium_submit_turn` 集成

发起 MeetingTask 的 Participant 合法 submit 时，同一 `execute()` transaction 必须：

1. 提交 transcript 和完成当前 SpeakerAttempt；
2. 将该 attempt 创建的 `requested` task 转为 `queued`；
3. 在允许执行时插入唯一 `dispatch` outbox，payload 使用 `role: 'meeting_task'` 并携带持久 `deliveryId`；
4. 按当前 Turn 规则释放发言权；
5. blocking task 在 attempt 已完成后才允许 Meeting 进入 `waiting`。

任一步失败必须整体回滚。Task create 本身不得释放发言权。

合并顺序固定如下：

1. 先把该 attempt 的 `requested` task 纳入 canonical transition 候选，不提前写 outbox。
2. hard-limit execution terminal 优先级最高：同一 transaction 取消刚排队或既有的全部非终态 task、合并 `meeting_task.cancelled` events，且不写 task dispatch outbox。
3. 非 hard-limit 的 blocking task 进入 `queued` 后强制 Meeting 进入 `waiting`，写 task dispatch outbox，并跳过本次 completion judge 和 next planning。
4. non-blocking task 进入 `queued` 并写 task dispatch outbox后，继续既有 completion judge。objective satisfied 可以进入 `converging`，task 继续执行；真正进入 execution-terminal 时再由 cancellation helper 收口。
5. non-blocking 且 objective 未满足时继续既有 planning，但两种 selection mode 都必须通过 canonical eligibility 排除拥有 `requested | queued | running` task 的 Participant。

不得出现同一 transaction 既进入 execution-terminal 又留下可投递 task outbox，或 task owner 被即时下一轮再次分配 SpeakerAttempt。

### 5.3 Execution envelope、status read 与 `convivium_start_meeting_task`

outbox 通过现有 `MeetingSessionAdapter` 向原 Participant Session 投递版本化 envelope，至少包含：

- `meetingId`
- `meetingTaskId`
- `executionId`
- `deliveryId`
- `title`
- `description`
- 明确要求先调用 `convivium_meeting_task_status`，仅在 `queued` 时调用 `convivium_start_meeting_task`，随后再次读取 status；只有 post-read 明确允许执行时才开始工作，最后调用 `convivium_finish_meeting_task`

`convivium_meeting_task_status` 是显式的授权只读工具，不使用 requestId 或 command receipt。Runtime 从真实 caller Session 读取 `session_ownership`，验证 meetingId、participantId、task execution binding 和 capability，再通过既有 repository read/recover 模式读取当前 MeetingSnapshot；不新增 repository 级授权 read API。

status 返回当前 task projection、`observedMeetingVersion`、Meeting terminal 标识和 `mayExecute`。每次观察可以随 Meeting version 变化：Meeting execution-terminal 或 task terminal 时明确 stop；只有 Meeting active 且 task 为 `running` 时 `mayExecute = true`。

`start` 使用 envelope 的 `deliveryId` 作为稳定 `requestId`。相同 requestId/hash 必须完整返回首次成功的不可变 receipt/result；该 receipt 只证明 `queued → running` mutation 至多一次，永远不能作为继续执行许可。

`start` 规则：

- execution envelope 先调用 status；pre-read 发现 Meeting execution-terminal 或 task terminal 时停止，不调用 `start`。
- 只有 pre-read 中 task 为 `queued` 时才调用既有 `execute()` 完成 `queued → running`，写 `meeting_task.started` event 和不可变 receipt；并发重复 start 由同一 receipt 去重。
- start 返回后必须再次调用 status；只有 post-read 返回 `mayExecute: true` 时才开始外部工作。terminal/cancelled observation 明确 stop。
- status 是带 Meeting version 的线性观察，不承诺读取后没有新 transaction。
- task 仍为 `requested`、executionId 不匹配或 caller 不匹配时拒绝。

历史 command receipt 及其 result 不得被 status read 更新、覆盖或重新组装。测试必须证明 start 重放完整返回首次 result，而 status 可以返回更新后的 observed Meeting version 和 task projection。

稳定 envelope 加上 start mutation 是重复 followup 的业务去重边界。DSH followup 只承诺 FIFO acceptance，不把它描述成跨进程 exactly-once；重复 envelope 可以形成额外空转 turn，但不能重复启动或重复提交 MeetingTask 事实。

剩余保证边界：若两个 execution envelope 真正并发，二者都可能 pre-read `queued`、命中同一 start receipt，并在 post-read 时同时观察到 `running/mayExecute = true`。V1 依赖同一 Participant continuable Session 的 DSH FIFO 作为底层串行保证，只承诺 Meeting start/finish 事实幂等，不承诺模型、工具、workspace 或外部副作用 exactly-once。若真实 profile 无法证明该 FIFO 边界，必须停止实现；不得静默增加 execution lease/permit，也不得宣称只执行一次。

### 5.4 `convivium_finish_meeting_task`

输入包含 task/execution/request identity、`outcome: 'completed' | 'failed'`、结果摘要或失败原因，以及明确的后续发言请求：

```ts
interface MeetingTaskFollowupRequestV1 {
  reason: "task_completed" | "new_evidence" | "blocking_objection";
  summary: string;
  priority: "normal" | "urgent";
}
```

规则：

- caller 必须通过正式 `session_ownership` 解析为原 Participant 的 active Session，task 必须为该 execution 的 `running`。
- `completed` 必须提供非空 `resultSummary`；`failed` 必须提供非空 `failureReason`。
- completed task 的 followup reason 只能是 `task_completed | new_evidence`；failed task 只能是 `new_evidence | blocking_objection`。
- 同一 transaction 终结 task、写 terminal event、创建与该 task 绑定的 pending HandRaise，并写一个 command receipt。
- HandRaise 来自真实 Participant 的显式 finish payload，不是 Runtime 自动伪造。
- 重放返回原 task 和 HandRaise；不得重复 task result、event、version 或 HandRaise。
- finish 不写 transcript、Decision、CompletionFact，也不直接创建 SpeakerAttempt。

### 5.5 `convivium_raise_hand`

保留独立工具处理不依赖 task finish 的 `new_evidence | answer_ready | blocking_objection | correction | user_requested`。它只能由有效 Participant Session 调用。

相同 Participant、reason、关联 task/message 和规范化 summary 的 pending HandRaise 去重。V1 只实现 `pending → consumed`；不增加无协议入口的 withdrawn/deferred/rejected 状态。

## 6. Session 串行与调度

- MeetingTask 始终由创建它的 Participant continuable Session 执行，不创建额外 worker Session。
- 同一 Participant 每场 Meeting 只允许一个非终态 MeetingTask。
- `requested` task 不改变 Participant 可用性；当前 SpeakerAttempt 仍由 submit/timeout 规则拥有。
- task 转为 `queued | running` 后，该 Participant 不得被分配新的 SpeakerAttempt；其他 Participant 和非阻塞议题可以继续。
- Manager 与 round-robin 共用一个纯 canonical speaker eligibility，至少排除拥有 `requested | queued | running` MeetingTask 的 Participant；不得只在某个 Runtime 分支临时过滤，也不得通过同步修改 `participant.status` 建立可漂移的第二份 task eligibility。
- 底层 followup 使用 DSH Agent inbox FIFO；Runtime 不另建第二条 Session queue。
- task terminal 后 Participant 仍不会直接获得发言权；只有 pending HandRaise 被 Manager 纳入成功 plan 后才创建新 SpeakerAttempt。
- 抽取纯 `startRoundRobinTurn` helper，内部复用现有 `planRoundRobinTurn()` 并创建首个 SpeakerAttempt/events；既有 submit 路径和 blocking task failure 恢复共同调用，不新增 scheduler。Manager mode 继续复用 `startManagerPlanning()`。
- round-robin 选中持有 pending HandRaise 的 Participant 时，同一 transition 消费该 HandRaise，并把关联 terminal MeetingTask projection 固化到新 SpeakerAttempt snapshot；未选中的 HandRaise 保持 pending。Manager plan 仅在成功纳入 Participant 时执行相同消费与固化。
- 未来 Mail followup 必须复用同一 Participant eligibility 和 DSH FIFO 边界，本闭环不实现 Mail。

## 7. 持久化、事件与恢复

### 7.1 持久化

- MeetingTask、terminal result 和 HandRaise 属于 canonical `MeetingState.state_json`。
- 不新增 `task_operations` 或外部 task association 表；不存在 DSH create/Meeting commit 的跨系统两阶段事务。
- 复用现有 `outbox` 和 `kind = 'dispatch'`，只增加 `payload.role = 'meeting_task'` 的 worker 分支；不得新增 outbox kind、第二套 outbox、receipt key 或 repository transaction API。
- `MeetingState.handRaises` 已存在。只有取证证明存在非空旧 shape 时才增加明确版本的 normalizer；不得虚构全局 state migration。

### 7.2 事件

B 可以追加以下专属事件，不重排 `DomainEventTypes`，不改写 A 的 completion/end 事件：

- `meeting_task.created`
- `meeting_task.queued`
- `meeting_task.started`
- `meeting_task.completed`
- `meeting_task.failed`
- `meeting_task.cancelled`
- `hand_raise.created`
- `hand_raise.consumed`

一次 transaction 可以同时产生 `meeting_task.completed|failed` 和 `hand_raise.created`，但必须共享同一 Meeting version 与 receipt。

### 7.3 冷恢复

恢复按 canonical state 和 outbox 执行：

- `requested`：不投递；等待 originating SpeakerAttempt 的合法 submit，或由 Meeting terminal 取消。
- originating SpeakerAttempt 已 timeout、aborted 或被替代时，同一 attempt-closing transaction 必须取消其 `requested` task；恢复不得把该 task 排入执行。
- `queued` 且 outbox pending/leased：按原 `deliveryId` 恢复投递。
- `queued` 且 outbox delivered：等待原 Participant 调用 start；不得创建新 task 或换 executionId。
- `running`：恢复为只读可见的 stalled/diagnostic 状态，不自动 followup、不重复业务工作；V1 不增加 resume generation、marker 或新状态。
- terminal task：不重投执行；恢复其 pending HandRaise/planning 条件。
- outbox 永久失败：通过标准 `execute()` 将仍为 `queued` 的 task 标记 `failed` 并形成 Runtime 诊断事实；不得伪造 Participant HandRaise。若该 task blocking、Meeting 为 `waiting` 且未暂停，同一 transaction 清除 waiting，并按 selection mode 调用 `startManagerPlanning()` 或 `startRoundRobinTurn()`，返回既有 manager/speaker dispatch outbox。Meeting 已终态时不新增事实；paused 时只记录 failed，不启动 planning/Turn。

恢复不得根据自由文本、Agent idle 或缺少模型活动推断 `completed`。

## 8. Waiting、暂停和终态

- 非阻塞 task 为 `queued | running` 时，Meeting 可以继续安排其他可用 Participant。
- blocking task 只有在 originating Participant 合法 submit、task 与 outbox 同 transaction 进入 `queued` 后，Meeting 才能进入 `waiting`。
- task finish 原子创建 HandRaise；若 Meeting 正在 `waiting` 且未暂停，同一后续调度 transition 按 selection mode 调用既有 Manager 或 round-robin 入口，不新增 scheduler。
- Meeting 暂停期间允许 task start/finish 和 pending HandRaise 持久化，但不得消费 HandRaise、创建 plan、Turn 或 SpeakerAttempt。
- Captain end、hard-limit 自动终态与 B command 并发时由 expected version/terminal gate 决胜；终态成功时非终态 MeetingTask 同 transaction 变为 `cancelled`。
- DSH 已接受的 Participant turn 可能在 Meeting end 后继续到达工具调用；这些调用返回 `IMMUTABLE_MEETING`，不得形成新的会议事实。
- `cancelled` 是会议事实关闭，不承诺停止已经接受的模型、工具、workspace 或外部副作用；本闭环不新增 end 后 Session interrupt。

## 9. 实施顺序

### T0：修正正式口径

- 把正式需求、架构、Agent 协议、Domain Model、Meeting Orchestration Design 和 Implementation Design 中闭环 B 的 DSH `TeamTask` 语义改为 Convivium `MeetingTask`。
- 删除 external associate、受控 Captain TeamTask adapter、DSH task result observation 和跨系统 correlation 要求。
- 明确 DSH-owned 与 Convivium-owned 边界，以及五个工具的 producer、consumer、权限、错误和兼容语义。
- 与闭环 A 对齐 end 时取消非终态 MeetingTask 和 `AuthorizedTaskEvidenceResolver` 的新语义。
- 明确 cancellation helper/event 归 B、`endMeeting()` 调用点和 terminal transaction 归 A；清理 resolver 中旧 TeamTask 字段与错误文案。
- 更新 RUNBOOK 文件名、TODO 和 readiness 口径；保留旧 `UNSUPPORTED_CAPABILITY` 证据作为当时 TeamTask 方案的取证事实，不把它描述成 MeetingTask blocker。

### T1：领域模型与协议

- 实现 MeetingTask/Projection/ExecutionEnvelope/finish followup 类型和 schema。
- 实现状态机、每 Participant 单活跃任务约束、HandRaise shape 和 B 事件。
- 明确不可变 start receipt 与独立 status read 的响应 schema；不得改写通用 receipt、完整重放结果或幂等键。
- 补齐 Manager context、active status 和 SpeakerAttempt snapshot 的单一 task projection。
- 先完成纯领域与 contract tests，再接 Runtime。

### T2：Repository 与 submit-turn 原子集成

- 实现纯 MeetingTask create/queue/start/finish transitions 和非终态 task cancellation helper；本阶段不注册工具或编排 Runtime command。
- 在 SpeakerAttempt timeout/abort transition 中调用 B-owned helper，取消该 attempt 尚未提交的 `requested` task。
- 在 submit-turn transition 中原子完成 `requested → queued` 和 execution outbox 写入。
- 按 hard-limit、blocking、non-blocking 的固定优先级合并 completion judge 与 next planning；submit 内 hard-limit 调用 cancellation helper，取消 task 且不写 task outbox。
- submit transition 只生成既有 `kind = 'dispatch'`、`payload.role = 'meeting_task'` outbox 数据；worker 分支留给 T3，不新增 DDL 或 outbox kind。
- 覆盖纯 transition、submit rollback、同版本竞争和 submit 内 hard-limit；Captain end 接入留给 A/B 集成阶段。

### T3：Participant execution dispatch

- 注册 create/status/start/finish 工具，并通过既有 `MeetingRepository.execute()` 编排 create/start/finish command；不在 Runtime 重写 T2 的领域规则。
- 扩展 `MeetingSessionAdapter` 的受控 task followup，不允许其他模块直接调用 `ctx.subagents.followup()`。
- 固化 execution envelope，并在投递前后验证 Session ownership、capability、task status 和 deliveryId。
- 实现授权 status pre-read、幂等 start mutation、status post-read 和 finish 工具；重复 envelope 不重复 Meeting fact，terminal observation 明确 stop。
- 覆盖 receipt replay、hash conflict、rollback 和 version/terminal conflict。
- 证明 queued/running Participant 不会同时收到 SpeakerAttempt。

### T4：HandRaise、planning 与 snapshot

- finish transaction 原子创建 task-linked HandRaise。
- 实现独立 raise-hand、pending 去重和 plan 成功后的 consumed。
- Manager 只读取权限裁剪后的 MeetingTask projection。
- 抽取 `startRoundRobinTurn` 和 canonical speaker eligibility，Manager 与 round-robin 排除非终态 task owner。
- Manager/round-robin 成功选中 Participant 时消费对应 HandRaise并固化 terminal task snapshot；重投不漂移，未选中 HandRaise 保持 pending。
- blocking delivery failure 不伪造 HandRaise；同一失败 transaction 按 selection mode 恢复 planning/Turn，paused 时不调度。
- 完成 waiting、pause 和 end 竞争测试，不修改 completion 判定。

### T5：恢复与真实运行验证

- 恢复 queued/terminal task、execution outbox、pending HandRaise 和 waiting 条件；running 只暴露 stalled/diagnostic，不自动 resume。
- 使用独立 profile 验证真实 Participant continuable Session 的 submit-release、后台执行、finish+raise、replan 和正式报告。
- 记录重复投递的保证边界：Meeting fact 幂等，DSH turn 至少一次且 FIFO，不宣称模型内部副作用 exactly-once。
- 迁移长期结论和 readiness 证据，删除 RUNBOOK 与已完成 TODO。

## 10. 验证矩阵

| 场景                                       | 预期结果                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 当前 speaker 创建 task                     | 原子生成一个 `requested` MeetingTask；不写 outbox、不释放 attempt                           |
| 同 Participant 已有非终态 task             | `MEETING_TASK_ALREADY_ACTIVE`，无状态变化                                                   |
| 非当前 speaker 创建 task                   | `STALE_ATTEMPT` 或 `UNAUTHORIZED_CALLER`，无副作用                                          |
| create 同 request/hash 重放                | 返回原 task，不重复 event/version/receipt                                                   |
| create 同 request 不同 hash                | `IDEMPOTENCY_CONFLICT`                                                                      |
| task create 后未 submit                    | task 保持 `requested`，SpeakerAttempt 仍有效                                                |
| originating attempt timeout/abort          | 同一 transaction 将 `requested` task cancelled，不写 execution outbox                       |
| 合法 submit                                | transcript、attempt completion、`queued` task 和唯一 outbox 同 transaction 提交             |
| blocking task submit                       | attempt 结束后才进入 `waiting`                                                              |
| hard-limit 与 task queue 同次 submit       | Meeting 进入 execution-terminal；非终态 task cancelled；不写 task dispatch outbox           |
| non-blocking task 与 objective satisfied   | Meeting 可进入 `converging`；task/outbox 保留，真正终态时再收口                             |
| execution envelope 首次 start              | 原 Participant 将 `queued → running`                                                        |
| start 同 request/hash 重放                 | 完整返回首次 start receipt/result，不用当前 task 重组响应，不重复 event/version             |
| status 在 start 前后读取                   | 可返回不同 observedMeetingVersion；只有 Meeting active 且 task running 时 `mayExecute=true` |
| 相同 envelope 重投                         | 按 status→start→status 执行；不创建新 attempt 或重复 task fact                              |
| 错误 Participant/executionId start         | `UNAUTHORIZED_CALLER` 或 `STALE_TASK_EXECUTION`                                             |
| Participant finish completed               | task completed 与 pending HandRaise 同 transaction 提交                                     |
| Participant finish failed                  | task failed 与 blocking/normal HandRaise 同 transaction 提交                                |
| finish 重放                                | 返回原 task/HandRaise，不重复事实                                                           |
| Runtime/Agent idle                         | 不自动完成或失败 task                                                                       |
| 重启时 task 仍 running                     | 只投影 stalled/diagnostic；不自动 resume 或重复业务工作                                     |
| queued/running Participant 被 planner 选择 | 资格校验拒绝 plan；不投递并发 SpeakerAttempt                                                |
| 非阻塞 task 运行                           | 其他 Participant 可继续会议                                                                 |
| task finish while waiting                  | HandRaise pending；未暂停时可触发后续 planning                                              |
| 暂停期间 finish                            | 保存 task result/HandRaise，不消费、不创建 plan/Turn                                        |
| plan 成功纳入 Participant                  | 对应 HandRaise consumed，新 attempt 固化 task snapshot                                      |
| round-robin 未选中举手者                   | HandRaise 保持 pending，不创建该 Participant 的 snapshot                                    |
| plan 失败或版本冲突                        | HandRaise 仍 pending，snapshot 不创建                                                       |
| Captain end 与 task command 并发           | 只有一个 transaction 成功；end 胜出时非终态 task cancelled                                  |
| end 分别遇到 requested/queued/running task | 同一 terminal transaction 将 task cancelled，并各追加一个 cancellation event                |
| end 后迟到 finish/raise                    | `IMMUTABLE_MEETING`，无新事实                                                               |
| 迟到请求使用旧 expected version            | `VERSION_CONFLICT`；改用最新终态 version 重试为 `IMMUTABLE_MEETING`；两次均零副作用         |
| cancelled task 的 execution outbox 被领取  | dispatcher 授权复查后停止投递，不新增 Meeting fact                                          |
| outbox lease 恢复                          | 使用原 deliveryId；重复 envelope 不重复 MeetingTask execution fact                          |
| blocking outbox 永久失败                   | 同 transaction 标记 failed、清 waiting，并按 selection mode 恢复；不伪造 HandRaise          |
| paused 时 blocking outbox 永久失败         | 只记录 failed；不消费 HandRaise，不创建 planning/Turn                                       |
| task result 用作 completion evidence       | resolver 只接受当前 Meeting 的 completed task projection；completed 不自动完成 Meeting      |

## 11. 验证命令与真实证据

先运行最窄的 domain、protocol、repository、session adapter、planning、projection 和 recovery tests，再从 `plugin/` 执行：

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:environment
pnpm verify:contract
pnpm verify:package
```

独立 DSH profile smoke 必须证明：

- Participant 创建 MeetingTask 后仍需合法 submit 才释放发言权；
- 后台工作进入同一 Participant continuable Session 的后续 FIFO turn；
- 非阻塞任务期间其他 Participant 可继续发言；
- execution envelope 严格执行 status pre-read→start→status post-read，start receipt 不作为执行许可；
- 重复 execution envelope 不重复启动 MeetingTask 事实，并验证同一 Participant Session 的 FIFO 串行边界；
- Participant finish 显式、原子地产生 terminal result 和 HandRaise；
- Manager 后续计划纳入原 Participant，新 attempt 获得固化 task snapshot；
- pause、waiting、end race 和冷恢复符合验证矩阵。

证据记录 Node、pnpm、DSH package/version、插件 commit、profile、命令、结果、清理和 `Not Covered`。Mock 通过不能替代真实 continuable Session 路径。

## 12. 停止条件

- 当前 DSH continuable followup 无法向原 Participant Session 提供 FIFO 后续 turn，或无法验证 direct-parent authority。
- 独立 DSH profile 无法证明同一 Participant continuable Session 对 task execution envelope 的 FIFO 串行，因而需要 durable execution lease/permit 才能避免并发业务工作。
- 无法在 task dispatch 前后验证 Session ownership、capability、task status 和 deliveryId。
- 无法阻止 queued/running Participant 获得并发 SpeakerAttempt。
- 实现需要引入 Agent Teams、通用 task DAG、额外 worker Session、Mail、HTTP、UI 或第二套 outbox/repository transaction。
- 闭环 A 的公开 end/completion seam 与本 RUNBOOK 无法语义合并。
- 正式需求、协议和设计尚未完成 T0 口径修正。

触发停止条件时记录证据并请求人工决定，不得以社区 Agent Teams、`ctx.jobs` 或任意外部任务系统静默替代 MeetingTask。

## 13. 完成与收口

闭环 B 只有在以下条件全部满足后才算完成：

- create、submit-release、Session execution、status/start/status、finish+HandRaise、planning 和正式报告形成真实闭环。
- 权限、幂等、重复投递、Session 串行、waiting、pause、terminal race 和冷恢复均有测试。
- 真实 DSH profile 证明 continuable Participant Session 路径可运行。
- 未引入 Agent Teams、通用 task system 或闭环外能力。
- A/B 共享热点已基于公开 commit 完成语义合并，双方受影响测试通过。
- 需求、接口、设计、readiness 和 TODO 已按实际实现收口。
- 长期结论迁移后，本 RUNBOOK 及残留引用已删除。
