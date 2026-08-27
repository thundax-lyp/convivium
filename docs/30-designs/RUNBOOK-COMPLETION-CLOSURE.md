# RUNBOOK：闭环 A——会议完成与结束

状态：闭环 A 独立实现已完成，等待闭环 B 的 MeetingTask 集成收口

## 1. 目标

在现有 Meeting Runtime 上闭合一条可验证的业务链路：

```text
Participant 提交结构化 completion claims
  -> Runtime 校验证据、身份、权限和版本
  -> 生成不可变 CompletionFact
  -> 确定性判断 objective 是否完成
  -> Captain 通过 convivium_end_meeting 结束会议
  -> meeting_status 展示执行终态
```

本 RUNBOOK 是实现前的专项执行边界，不改变需求、接口或既有状态机的真相源。实现完成后，长期有效的契约和验证证据必须迁移回对应正式文档，并删除本 RUNBOOK。

范围拆分依据为 2026-08-27 Codex 任务 `codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186` 中确认的并行方案。该任务只确认闭环 A/B 的交付拆分；产品行为、接口和实现约束仍以本仓库正式文档为准。

## 2. 范围

### 2.1 本次必须完成

- `convivium_submit_turn` 接收并校验结构化 `completionClaims`。
- 每个合法 claim 只能引用当前 Meeting 内、当前 revision 有效的对象和证据。
- Runtime 从真实 caller、authority、evidence 和当前 Meeting version 生成不可变 `CompletionFact`。
- CompletionFacts 只参与确定性判断 objective 是否满足；满足时允许形成 `completed`。
- `partial`、`no_consensus` 和 `cancelled` 由 Captain command、硬限制、stall 或其他正式终止条件形成，不得仅根据 completion claim 自动派生。
- `convivium_end_meeting` 仅允许真实 Captain 调用，支持正常结束、接受 partial、无共识结束和取消结束。
- 结束命令支持相同 request 的幂等重放、不同 hash 的 `IDEMPOTENCY_CONFLICT` 和过期 version 的 `VERSION_CONFLICT`。
- 结束事务原子写入 state、termination、completion facts、meeting event、receipt 和必要 outbox 状态；同时撤销活动 Speaker/Manager attempt、截断活动 Turn、取消非终态 MeetingTask，并确保旧 dispatch 不能继续投递；失败不得留下部分终态。
- 执行终态不可继续写入会议事实，重复结束返回原始 receipt 或 `IMMUTABLE_MEETING`，语义不得漂移。
- `meeting_status` 输出执行终态 projection，包含终止原因、未解决事项、异议、决策和完成依据；正式接口当前不能表达的字段必须先完成 T1 契约门，再进入 Runtime 实现。
- 终态 projection 不再暴露 current turn、speaker、活动 attempt 或 pending hand raise。
- 覆盖核心成功、权限、stale、幂等、跨 Meeting 引用和恢复读取测试。

### 2.2 明确不包含

- Archive、`archiving`、`archived`、Session close、capability revoke 和 continuation。
- MeetingTask 的创建、执行、结果提交、HandRaise 和任务调度。
- 新增 HTTP route、完整 Plugin Frontend、Conversation Node 或视觉交互。
- Manager 语义裁决、复杂 replan、selection mode 扩展和并行议题。
- 通过自然语言、transcript 文本或 UI projection 直接宣布完成。
- 修改 DSH-owned Session Events、Agent 内部 Prompt、Skills、Tools、MCP 或权限模型。

未纳入范围的接口不得以恒定返回值、mock fallback 或隐式旁路接入主路径。

### 2.3 与闭环 B 的并行边界

闭环 B 由另一个 AI 并行处理，范围固定为 Convivium-owned `MeetingTask` 与 HandRaise：任务创建、通过原 Participant continuable Session 投递、开始/完成、授权结果读取、举手，以及 planning 对这些输入的消费。MeetingTask 是 MeetingState 内的 canonical meeting fact，不使用 DSH/Agent Teams `TeamTask`。

闭环 A 不实现闭环 B 的任务生命周期；闭环 B 不决定 completion、termination 或 Archive。集成时 A 只调用 B 提供的纯 cancellation/round-robin helper，并把 helper 产生的 state/event 与 A transition 放进同一个既有 `MeetingRepository.execute()` 事务；不得新增 repository 回调、第二事务或通用 outbox 类型。

| 共享热点 | 闭环 A 允许修改 | 闭环 A 禁止修改 |
| --- | --- | --- |
| `plugin/src/domain/transitions.ts` | completion claim commit、Captain end、hard-limit/partial 终态、终态 attempt/Turn 收口；在这些终态分支调用 B 的纯 task cancellation helper | MeetingTask 生命周期、HandRaise 语义和无关状态机重构 |
| `plugin/src/tools/meeting-runtime.ts` | completion claim 处理、`endMeeting`、终态 dispatch 防护；复用 B 的 round-robin helper | MeetingTask handler、raise-hand、任务执行和通用 Runtime 重构 |
| `plugin/src/runtime/meeting-runtime.ts` | 只增加 completion/end 所需的类型化 Runtime 端口 | MeetingTask 投递、恢复、HandRaise/planning 入口 |
| `plugin/src/tools/register-tools.ts` | `convivium_end_meeting` 注册及既有 submit 的 completion 部分 | background-task、raise-hand 的 Schema 与 handler |
| `plugin/src/protocol/*` | completion、end、terminal status 相关类型和 Schema | MeetingTask、HandRaise 和 task status read 契约 |
| `plugin/src/domain/model.ts` / `DomainEventTypes` | CompletionFact、termination，只追加 completion/end 事件 | task/hand-raise 模型与事件；重排、改名或改变既有事件语义 |
| `plugin/src/projection/status.ts` | 只修改 execution-terminal mapper 分支 | active task/HandRaise projection |
| `plugin/src/repository/index.ts` | 复用现有 `execute`、receipt、event、outbox 契约 | MeetingTask 专用 repository API、幂等键变化、receipt 覆盖或通用 outbox 行为变化 |

闭环 A 独占新增或专项文件：

- `plugin/src/domain/completion.ts` 中的 completion 逻辑。
- `plugin/src/runtime/task-evidence.ts` 中的 resolver port、规范化 evidence 类型和默认拒绝实现；闭环 B 集成时把 evidence identity 收窄为 MeetingSnapshot 内已完成 MeetingTask 的稳定 ID。
- completion/end/status 专项测试文件。
- 本 RUNBOOK 和闭环 A readiness evidence。

闭环 A 不触碰以下闭环 B 文件：

- 闭环 B 新增的 MeetingTask runtime 文件。
- `plugin/src/domain/planning.ts` 中的 HandRaise/MeetingTask eligibility；A 只复用 B 抽取的 canonical helper。
- 闭环 B 的测试与 readiness evidence。

闭环 B 不新增 task-operation table、两阶段 finalize/recover API 或 `meeting_task.execute` outbox kind。任务命令继续通过既有 `execute` 原子提交 MeetingState、event、version、receipt 和现有 `dispatch` outbox；任务投递使用 payload role `meeting_task`。若集成必须改变 repository schema、幂等键、receipt 不可变语义、通用 outbox、caller binding 或 `submit_turn` 的整体流程，应停止并重新对齐。

## 3. 依据与关联文件

### 3.1 规范真相源

- [架构约束](../00-governance/ARCHITECTURE.md)
- [会议需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-8、BR-3、BR-6、BR-8 及相关验收标准
- [Agent 会议协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：`TurnSubmissionV1`、completion claims、`convivium_end_meeting`、`MeetingStatusResultV1`
- [Domain Model](./DOMAIN-MODEL-DESIGN.md)：`CompletionFact`、`MeetingTermination` 和终态模型
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：13、16.2、16.3、17.3、17.4、19.3
- [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)
- [实现设计](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [DSH 插件开发 Skill](../../.agents/skills/dsh-plugin-development/SKILL.md)
- 并行拆分确认：`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`

### 3.2 预期代码入口

| 文件 | 闭环 A 职责 |
| --- | --- |
| `plugin/src/domain/completion.ts` | claim 校验、CompletionFact 生成和完成派生 |
| `plugin/src/domain/transitions.ts` | `submit_turn` 与 `end_meeting` 的唯一状态转换 |
| `plugin/src/domain/model.ts` | 复用 canonical CompletionFact、termination 和 MeetingState |
| `plugin/src/tools/meeting-runtime.ts` | caller binding、command 编排、repository 提交 |
| `plugin/src/tools/register-tools.ts` | 注册/编码 `convivium_end_meeting` 与现有 submit/status 工具 |
| `plugin/src/projection/status.ts` | 生成 execution-terminal projection |
| `plugin/src/runtime/task-evidence.ts` | 定义 `AuthorizedTaskEvidenceResolver`、规范化 evidence 和默认拒绝实现 |
| `plugin/src/repository/*` | 复用原子事务、receipt、event、state 读写；默认不改 schema |
| `plugin/src/protocol/*` | 复用或补齐现有输入、输出和错误契约 |

实际文件若与当前代码布局不一致，应保持模块职责边界并在实现 PR 中说明映射，不创建第二套同义模型。

## 4. 不可违反的业务不变量

1. `completionClaims` 是声明和证据引用，不是状态覆盖指令；Runtime 不接受 `status`、任意 `completed: true` 或外部伪造的 CompletionFact 作为写入输入。
2. 每个 active CompletionFact 必须绑定一个真实 caller、有效 authority、当前 Meeting、当前对象 revision 和可验证 evidence。
3. 每个 claim 验证成功后生成不可变事实；事实失效只能新增替代事实并标记旧事实 `superseded` 或 `revoked`，不得原地改写历史来源。
4. `required output`、未满足 criterion、hard constraint、有效 blocking issue 或未完成必需 review 阻止 `completed`。
5. follow-up、Parking Lot、accepted risk 和少数非阻塞意见不阻止 `completed`。
6. Captain 的风险豁免、partial 接受、defer agenda 和 cancellation 必须保存结构化 actor、reason 与 affected IDs；自然语言不产生同等效果。
7. `MeetingTermination` 的所有 decision、question、position 和 agenda IDs 必须属于当前 Meeting；跨 Meeting 引用必须拒绝且不产生事件。
8. 会议进入执行终态后，任何新增 transcript、claim、decision、completion fact 或 turn 写入都必须拒绝。
9. 结束时必须撤销活动 SpeakerAttempt/ManagerPlanningAttempt、截断活动 Turn，并使已经排队或已领取的旧 dispatch 在投递前授权复查中失败；Session capability revoke 仍属于后续 Archive。
10. Captain end 与 B 的 MeetingTask start/finish、terminal result、HandRaise 或 planning 并发时，全部通过同一 Meeting version transaction 串行化；同一版本最多一个事务成功。终态先成功后，B 写入返回 `VERSION_CONFLICT` 或 `IMMUTABLE_MEETING`，不能创建 task result、HandRaise 或新 planning。
11. Captain end 和自动 hard-limit/partial 终态必须在各自同一 transition 内调用 B 的纯 `cancelNonTerminalMeetingTasks` helper，把 `requested | queued | running` MeetingTask 标记为 `cancelled` 并追加取消事件；终态事务不得写新的 task dispatch。取消只关闭会议事实，不声称中止已经被 Session 接受的模型、工具或外部工作；迟到 start/finish/raise 由 terminal/version gate 拒绝，Session close 仍属于 Archive/lifecycle。
12. 状态、事件、receipt 和 outbox 必须同事务提交或全部回滚；校验失败不写 `meeting_events`。
13. 恢复读取必须从 SQLite 的 state snapshot 和 active CompletionFacts 得到与结束前一致的公开终态，不从自然语言 transcript 推断完成。

### 4.1 Task evidence 扩展 seam

闭环 A 必须预留一个类型化、可替换的授权 task evidence resolver/validator：

```ts
interface AuthorizedTaskEvidenceResolver {
  resolve(input: {
    state: MeetingState
    meetingId: string
    participantId: string
    taskIds: readonly string[]
  }): readonly AuthorizedTaskEvidence[]
}
```

- Runtime 只能在 `repository.execute()` 已取得写锁并读取当前 Meeting snapshot 后，在同步 transition closure 内调用 resolver；resolver 只读取该 snapshot 中已经持久化且为 terminal-success 的 MeetingTask result，不调用 DSH、文件系统或其他外部服务。
- Resolver 输出只携带 completion domain 所需的稳定 MeetingTask identity；集成时删除旧的 `taskAttemptId`、`associationId`、`snapshotObservedAt` 占位字段。completion domain 只接收已经规范化并绑定当前 Meeting/Participant 的 evidence。
- 闭环 A 使用默认拒绝实现：空 `taskIds` 返回空 evidence，非空 `taskIds` 返回 `UNSUPPORTED_CAPABILITY`，且不产生 transcript、CompletionFact、event 或 receipt。
- 默认拒绝策略不得硬编码进共享 `submit_turn` handler、claim commit、caller binding、request hash 或 receipt 流程。
- 闭环 B 集成时只替换 resolver/validator 实现并读取当前 MeetingSnapshot 内的 terminal MeetingTask result；不得重写 completion claim commit、caller binding 或幂等语义。
- Resolver 校验与 CompletionFact commit 使用同一个已加锁 Meeting snapshot；不存在事务前异步取证与事务内提交之间的 TOCTOU 窗口。
- 确定性 completion judge 保留“已授权 MeetingTask result 存在”的已解析输入边界；B 接入前默认 resolver 继续拒绝非空 `taskIds`。

### 4.2 MeetingTask 调度与幂等集成边界

- MeetingTask 只持久化 `participantId` 与 `originatingSpeakerAttemptId` 等 canonical meeting identity；执行命令从正式 `session_ownership` 解析 Session，不复制 `participantSessionId` 或嵌套 `meetingId`。
- start command 的历史 receipt/result 永远不可变，只证明 start mutation 幂等，不代表当前 task 状态，也不得被 post-read 更新或覆盖。
- 执行 envelope 必须按“授权 status pre-read → 仅 `queued` 调用 start → 授权 status post-read → 仅 Meeting active 且 task `running` 时执行”处理。动态 `currentTask`、`observedMeetingVersion` 和 `mayExecute` 来自独立 task status read，不进入 start receipt。
- V1 不承诺外部工作的 exactly-once；Participant Session FIFO 是主要串行保证。无法证明该投递边界时停止实现，不增加 lease、generation 或隐藏恢复状态机。
- `running` 冷恢复只暴露 stalled/diagnostic，等待显式处置；不得自动“resume once”。
- blocking task queued 后进入 waiting，并跳过 completion judge/下一轮 planning；non-blocking task 可继续 judge，objective satisfied 时允许进入 `converging`，直至真正终态再取消仍未完成任务。
- blocking delivery 永久失败必须在同一事务把 task 标记为 `failed` 并写诊断事件，不伪造 HandRaise。Manager mode 复用 `startManagerPlanning`；round-robin 复用 B 从现有逻辑抽取的纯 `startRoundRobinTurn`。
- Manager 与 round-robin 共用 canonical speaker eligibility，排除拥有 `requested | queued | running` task 的 Participant。round-robin 选中有 pending HandRaise 的 Participant 时，在同一 transition 消费该 raise 并固化 terminal task snapshot；未选中的 raise 保持 pending。

## 5. 实施顺序

### T1：现状与契约核对

- 检查 `plugin/package.json`、锁文件、host/client tsconfig、构建配置和当前 domain/repository/tool/projection 实现。
- 运行 `pnpm verify:environment` 和 `pnpm verify:contract`，记录基线结果。
- 记录当前 merge base、闭环 A 文件清单和共享热点 diff；实现期间不吸收闭环 B 的未完成改动。
- 对照协议与设计确认当前枚举、错误码、receipt 和终态 projection 是否已存在；统一使用 repository 已定义的 `VERSION_CONFLICT`，不新增 `STALE_VERSION`。
- 当前 `PublicTerminationV1` 只能表达 `code`、`reason`、`decisionIds` 和 `unresolvedQuestionIds`，不能完整表达拆分任务要求的异议与完成依据。必须先更新 `AGENT-MEETING-PROTOCOL-INTERFACE.md` 及对应 TypeScript/Schema，明确最小公开字段，再实现 projection；不得只在 RUNBOOK 或 Runtime 内发明字段。
- 定义同步 `AuthorizedTaskEvidenceResolver` 内部端口、默认拒绝实现和已解析 evidence 输入；该端口只读取 `execute` transition 的当前 MeetingSnapshot，不得成为公开协议。
- 检查闭环 B 分支已经修改的共享热点；若双方修改同一函数或同一协议对象，先收窄为互不重叠的 helper/字段级改动，再继续实现。
- 若当前代码与正式文档冲突，停止扩张并记录冲突，不以实现方便为准。

### T2：Domain completion 与 transitions

- 保持 `domain/` 不依赖 protocol、DSH、SQLite、HTTP、React 或文件系统。
- 为每种 claim 定义纯校验结果、生成 CompletionFact 所需的最小事实和派生状态。
- completion domain 只消费 Runtime 提供的已授权 evidence；保留 task evidence 输入 seam，但不依赖 MeetingTask runtime 或 DSH 类型。
- 在统一 transition 中实现：合法 submit、Captain end、partial/无共识/取消路径、活动 attempt/Turn 收口和终态拒绝；集成时在 Captain end 与自动 hard-limit/partial 分支调用 B 的纯 task cancellation helper，version 检查继续由 repository transaction 负责。
- 为跨 Meeting ID、旧 proposal revision、无效 evidence、无 authority 和越界字段建立明确领域错误。

### T3：Repository 原子提交

- 通过现有 semantic repository API 执行 command，不让 Runtime 直接操作 SQLite。
- 写入顺序必须保证 termination 与 CompletionFact 的引用先经过同事务校验，并使终态后的旧 dispatch 不可继续授权。
- 使用 `requestId + commandKind + callerBinding` 作为幂等键；相同 hash 返回原始 receipt，不重复递增 version、事件或 outbox。
- 复用现有 repository schema、`execute` 和 receipt 语义；若无法在现有契约内完成，触发并行协调门，不在闭环 A 内重构通用持久化。
- 结束成功后不得在事务提交前调用 DSH 或产生成功响应。

### T4：Tools 与 projection

- `convivium_submit_turn` 只接受当前 SpeakerAttempt 对应的 Participant Session；Manager 继续只使用 `convivium_submit_manager_plan`。handler 解析 transport、绑定真实 caller 并调用 Runtime，不得把 caller 从 payload 中信任地读取。
- completion claim 的 `taskIds` 通过注入的 `AuthorizedTaskEvidenceResolver` 在 repository transition 的当前 snapshot 上处理；shared submit handler 不包含事务外 B task 查询或硬编码数组判定。
- `convivium_end_meeting` 只接受 Captain authority，并将正常、partial、no-consensus、cancelled 映射到协议定义的结构化输入。
- `meeting_status` 通过独立 mapper 输出 `ExecutionTerminalMeetingStatusResultV1`，禁止直接类型断言内部 `MeetingState`。
- 对共享 handler 只增加 completion/end 分支，不改 MeetingTask/HandRaise handler、task status read 或通用 caller resolver。
- 保持错误码、`retryable` 和公开字段与协议一致；不泄露 Session ID、隐藏推理、私有通信或任意文件路径。

### T5：验证与证据

- 先运行 domain/repository/projection 的最窄测试，再运行完整插件验证入口。
- 对每个成功结束路径读取 status，并重新打开同一 `meeting.sqlite` 验证终态、termination、CompletionFacts、receipt 和 event。
- 在测试中模拟提交前异常、重复请求、并发 stale version 和进程重启；确认无半提交状态。
- 增加 Captain 在活动 Participant dispatch 与 Manager planning dispatch 期间结束会议的并发测试，证明旧 attempt 被撤销且投递授权失败。
- 增加通用竞争事务测试：end 与一个模拟的同版本 B 写命令并发时只有一个 commit。真实 MeetingTask start/finish/result、HandRaise/planning 竞争测试在 A/B 集成后运行。
- 闭环 A 单独测试只使用 resolver port 的默认拒绝 fake，不引用 MeetingTask runtime、HandRaise fixture 或闭环 B 的新增 helper；完整交叉测试在两个闭环集成后运行一次。
- 将实际命令、commit、环境和未覆盖项写入 `docs/40-readiness/` 对应 evidence 文档。

### T6：A/B 集成收口（闭环 B 可用后执行）

1. 确认 B 已提供 MeetingTask model/transitions、`cancelNonTerminalMeetingTasks`、canonical speaker eligibility、`startRoundRobinTurn`、`convivium_meeting_task_status` 和 MeetingTask evidence resolver；缺少任一项则停止，不在 A 内补造替代实现。
2. 解决共享文件冲突，只在 A 的 Captain end、自动 hard-limit/partial、completion resolver 和现有 round-robin 调用点接入 B helper；保留 B 的 task/HandRaise active 分支。
3. 将 `AuthorizedTaskEvidence` 收窄为 MeetingTask 稳定 identity，移除 `taskAttemptId`、`associationId`、`snapshotObservedAt` 和旧默认错误文案；resolver 只读同一 `execute` 锁内 snapshot 的 terminal-success result。
4. 核对 submit 优先级为 hard-limit terminal → blocking task waiting → completion judge/planning；non-blocking task 允许继续到 `converging`。Runtime 只为非终态 task 写既有 `dispatch` outbox。
5. 核对 blocking delivery failure 的 Manager/round-robin 恢复、start receipt 不可变、独立 status pre/post-read 和 terminal/version gate；不得增加自动 running resume 或 exactly-once 机制。
6. 运行第 7 节真实集成矩阵和完整插件验证，更新 completion readiness；将长期规则迁移到正式文档后，在收口 commit 删除本 RUNBOOK 与 A6 TODO。

## 6. 命令与状态契约检查表

### 6.1 `submit_turn` completion claims

- Caller 必须是当前有效 SpeakerAttempt 对应的 Participant Session，且拥有对应 attempt/capability；Manager 不得调用 `submit_turn`。
- Claim 的对象、revision、evidence message IDs 和 issue IDs 必须属于当前 Meeting 且在授权可见范围内。
- 本闭环通过默认 `AuthorizedTaskEvidenceResolver` 拒绝非空 `EvidenceClaimV1.taskIds`；拒绝发生在统一 claim commit 前，且不产生 transcript、CompletionFact、event 或 receipt。闭环 B 集成时只替换 resolver 实现。
- claim 只能作用于本次合法 turn submission；不能越权创建 Decision、接受风险或结束 Meeting。
- 非法 claim 整体拒绝，不能部分写入 transcript、CompletionFact 或 termination。

### 6.2 `end_meeting`

- Caller 必须是创建该 Meeting 的真实 Captain binding。
- `expectedMeetingVersion` 必须匹配；不匹配返回 repository 现有的 `VERSION_CONFLICT`，`retryable: true`，不改变状态。若要新增公开别名，必须先更新正式接口，不能在本 RUNBOOK 中单独决定。
- `code`、`reason`、`affected IDs`、evidence 和豁免信息必须满足协议与领域约束。
- 正常结束必须满足确定性完成判断；Captain 的明确结构化接受才可允许 partial、风险豁免或 defer。
- `no_consensus` 必须保留有效异议和阻塞对象；`cancelled` 必须保留取消理由与 actor。
- 重复相同请求返回相同终态结果；相同 request ID 不同 hash 返回 `IDEMPOTENCY_CONFLICT`。

## 7. 验证矩阵

| 场景 | 预期结果 |
| --- | --- |
| 所有 required outputs/criteria/reviews 满足 | 生成 CompletionFact，可由 Captain 正常结束为 `completed` |
| 存在未满足 required output 或 blocking issue | 不得 `completed`；返回可解释的未完成依据 |
| 仅存在 follow-up、Parking Lot、accepted risk 或非阻塞 dissent | 允许 `completed` |
| Participant 只提交自然语言“已完成” | 不产生 CompletionFact，不改变终态 |
| Participant 调用 `end_meeting` | `UNAUTHORIZED_CALLER`，状态/version/termination 不变 |
| Manager 调用 `submit_turn` | `UNAUTHORIZED_CALLER`，不产生 transcript 或 CompletionFact |
| 默认 resolver 收到非空 `taskIds` | `UNSUPPORTED_CAPABILITY`，零副作用；shared submit/claim commit 不变 |
| Captain 接受 partial 或豁免 risk | 产生带 actor/reason/affected IDs 的结构化事实后才允许结束 |
| Captain 结束时 version 过期 | `VERSION_CONFLICT`，无事件、receipt 或状态变化 |
| 相同 end request 重放 | 返回原始 receipt，不重复事件或递增 version |
| 相同 request ID、不同 request hash | `IDEMPOTENCY_CONFLICT` |
| 引用其他 Meeting 的 decision/question/position | 拒绝，不写事件或终态 |
| 终态后 submit/end/pause/resume | 按协议返回 `IMMUTABLE_MEETING` 或对应终态错误，不产生写入 |
| 活动 Speaker/Manager dispatch 期间结束 | attempt 被撤销、Turn 被截断、旧 dispatch 授权失败 |
| end 与 MeetingTask start/finish/result、HandRaise/planning 同版本竞争 | 仅一个 transaction 成功；终态成功后 B 写入无 Meeting 事实副作用 |
| Captain end 或自动 hard-limit/partial 时存在非终态 MeetingTask | 同事务取消 task、追加取消事件且不写 task dispatch；迟到写入被拒绝 |
| 已运行的 Session 工作在 MeetingTask 被取消后返回 | 不声称物理中止；迟到 finish/raise 被 terminal/version gate 拒绝 |
| start request 在任务随后完成后重放 | start receipt 保持原值；独立授权 status read 返回当前 terminal task，receipt 不被覆盖 |
| blocking task delivery 永久失败 | 同事务标 failed；Manager/round-robin 复用既有 planning 入口，不生成 HandRaise |
| SQLite 在事务内失败并重启 | 不存在半完成状态；恢复后仍为原状态或完整终态 |
| status projection 读取执行终态 | 有 termination 和完成依据；无 current turn、speaker、attempt、pending hand raise |

## 8. 验证命令

在 `plugin/` 目录执行，具体脚本以当前 `package.json` 为准：

```sh
pnpm verify:environment
pnpm verify:contract
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:package
```

若新增专门测试入口，应优先运行其最窄命令，并在 readiness 证据中同时记录上面未运行的命令。若闭环触及真实 DSH composition 或 Session lifecycle，再执行独立临时 profile 的 `dump-config` 与 smoke；不能用 build/typecheck 代替运行时证据。

## 9. 失败处理与恢复

- Provider、AgentSession 或 DSH followup 失败不改变 Meeting 的 completion、termination、version 或状态；按既有 outbox/诊断边界记录。
- 事务提交前异常必须回滚 state、events、receipt 和 outbox；测试失败路径必须清理临时 profile、workspace、端口和进程。
- 发现已有 termination 但 receipt 缺失、或 state/event 不一致时，停止 scheduler 和新写入，按 repository recovery 规则诊断；不得通过重放自然语言或手工修改 Markdown 修复状态。
- 任何无法证明 caller、ownership、evidence 或对象归属的情况按拒绝处理，不采用“尽量完成”的 fallback。

## 10. 完成判据与收口

本 RUNBOOK 只有在以下条件同时满足时才可标记完成：

- 闭环 A 的成功和拒绝路径均有自动化测试。
- Captain end 的四种终止 code、幂等、version conflict、权限和跨 Meeting 引用均有证据。
- execution-terminal projection 与协议 schema 校验通过。
- 活动 Speaker/Manager attempt、Turn 和旧 dispatch 在终态转换中被确定性收口。
- 默认 task evidence resolver 与可替换 seam 已验证；B 接入不需要重写 submit、claim commit、caller binding 或 receipt。
- Task evidence 校验与 CompletionFact 使用同一已加锁 snapshot 原子提交；测试证明事务前后 task snapshot 变化不会形成 TOCTOU 接受。
- A/B 同版本竞争、非终态 MeetingTask 原子取消与终态后 B 写入拒绝有集成证据；取消没有被描述为 Session 外部工作的原子中止。
- SQLite 原子性和重启恢复边界已验证；未覆盖项已明确记录。
- 未混入 Archive、DSH TeamTask、Mail、HTTP 或完整 UI。
- 与闭环 B 的共享热点 diff 已复核；没有覆盖 task/hand-raise/planning 改动，也没有单方面改变 repository、caller binding、幂等键或通用 outbox 契约。
- 需求、接口、设计和 readiness 文档已按实际变化同步。
- 本 RUNBOOK 中仍有长期有效的规则已迁移到正式文档后，删除本文件及残留引用。
