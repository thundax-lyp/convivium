# RUNBOOK：闭环 B——异步 TeamTask 与举手

状态：待执行

本 RUNBOOK 依据 Codex 任务“盘点需求设计接口与代码缺口”（`01a04210-fa01-7091-b554-4c94a5cf0186`）中确认的双闭环拆分制定。该任务只提供本次执行范围和并行背景；产品行为、接口和工程约束仍以本仓库正式文档为真相源。

另一位 AI 正在独立工作区、分支 `codex/feat/completion-closure` 推进闭环 A。本分支 `feat/teamtask-hand-raise` 只推进闭环 B。两边均从 `e95133b` 开始，不读取或写入对方工作区的未提交文件。

本 RUNBOOK 是一次性执行手册。实现完成后，长期结论和验证证据必须迁移到正式文档，并删除本文件。

## 1. 目标

完成以下业务闭环：

```text
当前 Participant SpeakerSession
→ convivium_request_background_task
→ Runtime 校验 caller、SpeakerAttempt、Team、任务范围和授权
→ 受控 Captain adapter 创建或关联 DSH TeamTask
→ 持久化 TeamTask 与 Meeting/Participant/SpeakerAttempt 的不可变关联
→ Participant 通过 convivium_submit_turn 提交简短状态并释放发言权
→ Runtime 观测并固化经授权的 terminal task snapshot/result
→ 原 Participant Session 调用 convivium_raise_hand
→ Manager 后续规划读取 pending HandRaise 和授权 task result
→ 新 SpeakerAttempt 固化 task snapshot
→ Participant 正式报告任务结果
```

`convivium_request_background_task` 只创建或关联后台任务，不提交 transcript、不完成 SpeakerAttempt，也不推进 Turn。发言权只能在合法 `convivium_submit_turn` 提交后释放。

## 2. 范围

### 2.1 本次必须完成

- `convivium_request_background_task` 的协议、schema、工具注册、真实 caller binding 和 Runtime command。
- 受控 TeamTask adapter 的 create/associate/read-snapshot 能力；Participant 不获得 Captain Session、capability 或通用 Captain-only tool。
- `taskId + taskAttemptId ↔ meetingId + participantId + speakerAttemptId` 的不可变关联、来源追踪、权限裁剪和恢复。
- DSH 创建与 SQLite 提交之间的稳定 request correlation、幂等重试和不确定结果处理。
- terminal task result 的观测、授权 snapshot 固化，以及与原 Participant Session 的可证明通知/可见路径。
- `convivium_raise_hand` 的协议、schema、工具注册、caller binding、幂等、去重和状态转换。
- HandRaise 的原因、优先级、关联任务/议题、pending/consumed 生命周期和 Manager planning 输入。
- 非阻塞任务继续会议；blocking 任务只在发起者合法 `submit_turn` 释放当前 attempt 后进入 `waiting`；暂停期间任务可以继续固化结果，但 HandRaise 不被消费。
- task snapshot 在新 SpeakerAttempt 创建时固化，重投不漂移。
- task operation metadata 的 additive DDL migration、MeetingState 内 association/HandRaise shape 的有界兼容、冷恢复、契约、集成、并发和真实 DSH profile 验证。

### 2.2 明确不包含

- 闭环 A 的 `completionClaims`、CompletionFact、完成判断、`convivium_end_meeting` 和 execution-terminal projection。
- Archive、Session close、capability revoke 和 continuation。
- meeting-scoped mail、Mail Processor、HTTP route 和 Client UI。
- DSH TeamTask 的底层运行、取消、重试和 terminal result 语义；这些继续由 DSH 拥有。
- 把 `TeamTask completed` 自动升级为 output accepted、agenda resolved 或 Meeting completed。
- 并发多人发言、新 Session 身份体系或通用 Captain 权限代理。

## 3. 与闭环 A 的并行边界

### 3.1 独占职责

闭环 B 独占以下语义：

- TeamTask create/associate、task association、task snapshot 和 task result authorization。
- HandRaise 创建、去重、生命周期和 planning 消费。
- `plugin/src/dsh/task-adapter.ts` 及独立 task reconciliation 模块。
- 与上述语义直接对应的测试和 readiness 证据。

闭环 A 独占以下语义，本分支不得修改：

- completion claim 校验和 CompletionFact 派生。
- `completed | partial | no_consensus | cancelled` 判断和 `convivium_end_meeting`。
- termination、execution-terminal projection 和终态不可变规则。
- `plugin/src/domain/completion.ts`。

### 3.2 共享热点

以下文件或职责是两条闭环的共享热点：

| 共享热点 | 闭环 B 允许的最小变化 | 禁止混入的闭环 A 变化 |
| --- | --- | --- |
| `plugin/src/domain/model.ts` | HandRaise、task association/snapshot 字段 | CompletionFact、termination 重构 |
| `plugin/src/domain/transitions.ts` | background task/HandRaise transition | completion/end transition |
| `plugin/src/protocol/*` | 两个 B 工具及 task/HandRaise projection | completion/end schema |
| `plugin/src/tools/register-tools.ts` | 注册两个 B 工具 | 注册或调整 end tool |
| `plugin/src/tools/meeting-runtime.ts` | B command orchestration | completion/end orchestration |
| `plugin/src/runtime/meeting-runtime.ts` | task reconciliation、HandRaise/planning 入口 | completion/end lifecycle |
| `plugin/src/projection/status.ts` | active 状态的 task/HandRaise projection | execution-terminal projection |
| repository/schema/migrations | B 独占的 task operation metadata 表/API 和 additive migration；association 仍由 `execute()` 写入 MeetingState | 全局 `execute`、receipt key、通用 outbox 或 completion/termination schema |
| `plugin/src/domain/model.ts` 的 `DomainEventTypes` | 追加 B 专属 task/HandRaise 事件 | 重排枚举、改写既有事件名或 completion/end 事件语义 |

共享热点遵守以下顺序：

1. 先在闭环 B 独占的新模块和独立测试中完成 DSH API 取证、adapter、纯领域函数和 task reconciliation。
2. 不复制 caller binding、receipt、outbox、repository transaction 或 status mapper 建立 B 专用平行实现。
3. 进入共享热点前，读取闭环 A 已公开的 commit/PR diff；不读取其未提交实现作为源码基线。
4. 闭环 A 先进入 `main` 时，本分支在用户授权下以不重写已发布历史的方式同步最新 `main`，再做共享热点集成。
5. 闭环 B 先形成 PR 时，共享热点保持最小、可单独审阅；PR 明确列出闭环 A 的潜在冲突位置，不自动合并。
6. 冲突解决只做语义合并，不能选择一侧整文件覆盖；合并后同时运行 A、B 受影响测试。

闭环 A 可以提供一个默认拒绝非空 `EvidenceClaimV1.taskIds` 的 task evidence resolver seam，但不得把空数组限制硬编码进共享 claim commit。闭环 B 集成时只实现该 resolver 的“验证 association、权限和授权 snapshot”部分，不重写 completion 规则、caller binding、receipt 或 `submit_turn` 原子提交。

## 4. 规范与接口前置门槛

### 4.1 正式依据

- [架构约束](../00-governance/ARCHITECTURE.md)
- [会议需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-4、FR-5、FR-8、FR-10、FR-11 及相关验收标准
- [Agent 会议协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：background task、authorized TeamTask association、HandRaise、Manager context、status 和权限矩阵
- [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)
- [Domain Model](./DOMAIN-MODEL-DESIGN.md)：MeetingTaskSnapshot、MeetingHandRaise 和 Domain event ownership
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：9.3、11、12、14、16、17、19.4
- [实现设计](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [DSH 插件开发 Skill](../../.agents/skills/dsh-plugin-development/SKILL.md)

### 4.2 当前契约缺口必须先补齐

当前 `ManagerMeetingContextV1` 只有 `pendingHandRaises`，没有可承载授权 task result 的字段；`MeetingStatusResultV1` 也没有 background task projection。实现 Runtime 前必须先在 Agent 协议中定义一个最小公开任务投影类型，由 Manager context 和 active meeting status 复用同一 canonical shape，再分别按读取者权限裁剪。契约必须说明 producer/consumer、失败语义和兼容策略，并同步 TypeScript/schema 契约测试，不能形成两套近义 task 字段。

不得在 Runtime 私自添加未进入协议的字段，也不得只传 `taskId` 后要求 Manager 自行读取 DSH 内部状态。Manager 只能消费 Meeting Runtime 提供的授权、过滤投影。

### 4.3 DSH API 取证门槛

从 `plugin/` 执行：

```sh
pnpm verify:environment
pnpm verify:contract
pnpm list --depth 0
```

必须从当前锁定依赖的 `package.json`、exports、`lib/types` 和实现源码确认并记录：

- TeamTask create/associate 或等价能力的 service、包名、版本和调用形状。
- 稳定 request correlation/idempotency key 是否被 DSH 保存并可查询。
- Team、task、attempt、owner 和 result 的授权读取方式。
- terminal result 是通过事件、订阅、查询还是其他公开能力观察。
- task completion 如何可证明地到达原 meeting-owned Participant Session，使该 Session 能以真实 caller binding 调用 `convivium_raise_hand`。
- 如果通知需要 Runtime 对 Participant Session 执行 followup，该 followup 如何与 SpeakerAttempt 和其他 Participant followup 使用同一串行门；不得并发进入同一 Session，也不得借本闭环实现 Mail 语义。
- provider 生命周期、listener/timer disposer、错误和取消语义。

如果当前 DSH API 无法同时满足稳定 correlation、授权结果读取和 Participant 可见/通知路径，停止实现并记录 `UNSUPPORTED_CAPABILITY` 或正式设计缺口；不得自动创建 HandRaise 冒充 Participant submission，也不得建立第二套任务系统。

### 4.4 A/B 共同不变量

- task association/snapshot commit、terminal snapshot、HandRaise、Manager planning 和 Captain end 都必须经过同一个 Meeting terminal-state/version gate；同一 expected version 的竞争只有一个 Meeting transaction 成功。operation metadata 的 finalized 标记不属于 Meeting fact，不参与或替代该 gate。
- Captain end 先成功后，B command 返回 `VERSION_CONFLICT`/`IMMUTABLE_MEETING`，或仅更新 B operation diagnostic metadata；不得生成 task-result Meeting fact、HandRaise、planning 或成功 command receipt。
- 外部 TeamTask 可以继续遵守 DSH 生命周期，但闭环 A/B 都不得在执行终态后把其结果追加为会议事实，也不得在本切片取消、转移或接管该任务。
- B 只能通过 `AuthorizedTaskEvidenceResolver` seam 向已集成的闭环 A 提供经验证的 task evidence。resolver 必须在 `execute()` 已取得写锁后，仅同步读取当前 `MeetingSnapshot` 中已经持久化的 association/authorized snapshot；不得调用 DSH、读取事务外可变状态或修改 completion 判定、claim commit、caller binding 和通用 receipt 语义。

## 5. 实施顺序

### T1：协议与 migration 设计

- 补齐单一公开 task projection，并把同一类型加入 Manager context、active meeting status 和相关 schema。
- 明确 task result 只作为授权 evidence；不得触发 completion 或终态变化。
- 补齐 `MeetingHandRaise` 的 reason、summary、taskIds、priority、status、createdAt、可选 reply/agenda/resolvedAt。
- 定义 task association、snapshot、pending external operation 和 HandRaise 生命周期的 canonical state 映射。
- 数据库 DDL migration 只新增 B 独占的 task operation metadata 持久化，不重写通用 repository 表或既有 migration。正式 task association/authorized snapshot 继续属于 canonical MeetingState，由唯一 `execute()` 事务写入。
- `MeetingState.handRaises` 已存在。若现有非空 state 使用旧的 `{id, participant, status}` shape，B 是该 shape 演进的唯一 owner，必须通过明确 state version/normalizer 确定性补齐新增字段；若取证证明没有可持久化的旧非空 shape，则记录证据，不虚构一次全局 `state_json` migration。
- 先锁定 additive DDL、旧 state 读取和新旧 schema 契约测试，再接 Runtime。

### T2：受控 TeamTask adapter

- 新增 `plugin/src/dsh/task-adapter.ts`，只暴露经验证的 create/associate/read-snapshot/observe-terminal 最小端口。
- adapter 输入由 Runtime 构造，不接受 Participant 传入 Captain 身份、任意 tool name、任意 payload 或跨 Team task。
- `create` 要求 `title`、`description` 且拒绝 `existingTaskId`；`associate` 要求 `existingTaskId` 且拒绝 `title`、`description`。
- associate 必须验证同一 Team、caller 对 task/result 的访问权限；每次结果进入 context、HandRaise 或 evidence 前重新验证关联和读取范围。
- 根据 T1 取证选择 DSH 官方支持的 terminal observation 方式，并由 Cordis 生命周期管理 listener/timer disposer；插件卸载后不得继续写 Meeting。
- 若 terminal notification 需要对 meeting-owned Participant Session 执行 followup，复用或抽取最小的 per-Participant Session queue：SpeakerAttempt 优先，通知只能在 Session 空闲时投递，必须可取消/去重，且不得与 SpeakerAttempt、Manager 或未来 mail followup 并发。若当前 API 无法证明该串行性，触发停止条件。

### T3：跨系统幂等与 task reconciliation

- 新增 B 独占、additive 的 `task_operations` metadata 与 `prepareTaskOperation → recoverTaskOperation` API；`finalizeTaskOperation` 只能是 Runtime 编排/helper 名称，不能成为第二个 Meeting 正式事实写入口。不得修改全局 `MeetingRepository.execute()`、receipt 幂等键或通用 outbox 状态机。
- `prepare` 在第一次 DSH 副作用前保存 meeting/request/requestHash/caller/participant/speakerAttempt/correlation 和规范化请求，只产生 operation metadata；不得写成功 command receipt、Meeting event、association 或递增 Meeting version。
- DSH create/associate 使用 prepare 固化的 correlation。成功或恢复查询到原 task 后，Runtime 从不可变 operation metadata 构造原始 `requestId + commandKind + callerBinding + requestHash` 的标准 `RepositoryCommand`，并调用唯一 `MeetingRepository.execute()`。
- `execute()` 在其现有 `BEGIN IMMEDIATE` 事务中重新验证 authorization、Meeting terminal state/version 和 originating attempt，再原子提交 MeetingState association/authorized snapshot、Meeting version、`background_task.linked` event、原 command success receipt 和必要 outbox。
- `execute()` 成功或命中原 receipt 后，Runtime 才单独把 operation metadata 标记为 finalized。该 metadata 标记不是 Meeting fact；若此步崩溃，recover 重放同一 `execute()`，由原 receipt 幂等命中后再次标记 finalized。
- 进程在 DSH 成功与 `execute()` 之间崩溃时，`recover` 先按稳定 correlation 查询已有 task，再重放同一标准 command；不得再次无条件 create。
- DSH 返回结果不确定且无法查询时保留 uncertain/pending operation，返回可重试 `INTERNAL_ERROR`；不生成成功 command receipt 或虚假 association。
- 若 Meeting 已由闭环 A 进入执行终态，标准 `execute()` 返回 `VERSION_CONFLICT`/`IMMUTABLE_MEETING`；Runtime 只把 operation metadata 标记为不可提交的诊断状态，不追加 Meeting fact、HandRaise 或 planning。外部 TeamTask 后续生命周期仍归 DSH/Archive。
- terminal observation 的 Meeting 写入同样必须通过标准 `execute()`；它只固化授权 snapshot/result，不自动生成 HandRaise、transcript、Decision 或 CompletionFact。

### T4：工具、发言释放与 HandRaise

- 注册并实现 `convivium_request_background_task`；只允许真实 caller 匹配当前 SpeakerAttempt。
- background task 请求成功后 SpeakerAttempt 仍然有效；Participant 必须另行调用 `convivium_submit_turn` 提交简短状态，合法 submit 才完成 attempt 并释放发言权。
- blocking 标志只随 association 记录为后续等待条件；`request_background_task` 自身不得撤销 attempt、截断 Turn、进入 `waiting` 或创建下一 speaker。
- 注册并实现 `convivium_raise_hand`；只允许该 Meeting 的有效 Participant Session，Runtime 绑定 participant，不接受 payload 伪造。
- 相同 request ID/相同规范化内容返回首次 receipt；不同内容返回 `IDEMPOTENCY_CONFLICT`。
- 相同 participant/task/reason 的 pending HandRaise 去重。本切片只实现协议可达的 `pending → consumed`：提交成功创建 pending，在对应 Participant 的 plan/attempt 原子提交后 consumed。
- 当前协议没有 withdraw/defer/reject command；本切片不得生成 `withdrawn`、`deferred` 或 `rejected` transition。若未来需要这些状态，必须先扩展正式协议、caller、幂等、事件和结果契约。
- HandRaise 只作为调度输入，不直接写 transcript、Decision、CompletionFact 或当前 Turn 未执行 plan。

### T5：planning、snapshot 与等待语义

- Manager context 只接收 pending HandRaise、授权 task projection 和必要 blocking facts，不读取 DSH 内部 task object。
- 相关 task result owner 和 blocking HandRaise 进入 required/candidate 规则；不可调度的必需 Participant 仍遵守现有整体失败语义。
- 普通 HandRaise 进入下一 Turn；blocking HandRaise 最早在当前 speaker 合法 submit 后触发 replan，不并发打断 active attempt。
- 非阻塞 task 不冻结 Meeting。强阻塞 task 只有在发起者合法 `submit_turn` 完成当前 attempt 后，才能随同一推进路径进入 `waiting`；授权 terminal snapshot/有效条件变化后才可重新规划。
- 选择 Participant 后，将当前授权 task snapshot 固化进新 SpeakerAttempt；后续 task 变化不修改已投递 attempt，重投使用同一 snapshot。
- HandRaise 只有在对应 Participant 被纳入正式 plan/attempt 后才标记 `consumed`；失败的 partial plan 不消费。

### T6：恢复与真实运行验证

- 冷恢复扫描 pending task operations、associations、terminal snapshots、pending HandRaises 和 waiting 条件。
- 暂停期间允许固化 task result，但不消费 HandRaise、不创建 Turn；恢复时使用最新事实重新规划。
- Captain end 与 task association/snapshot commit、terminal snapshot、HandRaise 或 Manager planning 竞争时，必须通过同一 Meeting version/terminal-state gate 串行化：只有一个 Meeting transaction 成功；终态先成功后，B 写入返回 `VERSION_CONFLICT`/`IMMUTABLE_MEETING` 或 operation diagnostic outcome，且不产生新的 Meeting fact。
- 无法证明 Team/task/result/Participant ownership 时拒绝投影和唤醒，Meeting 保持可诊断状态。
- 使用独立临时 profile、workspace、端口和可清理任务运行真实 DSH smoke；不得操作用户正在运行的实例。

## 6. 验证矩阵

| 场景 | 预期结果 |
| --- | --- |
| 当前 speaker 合法 create/associate | 返回来源绑定的幂等结果并写唯一 association |
| background task 请求后未 submit turn | SpeakerAttempt 仍有效，不创建下一 speaker |
| background task 请求后合法 submit turn | 简短状态进入 transcript，随后释放发言权 |
| blocking task 请求后未 submit turn | Meeting 不进入 waiting，当前 attempt 保持有效 |
| blocking task 请求后合法 submit turn | attempt 完成后才进入 waiting，不产生并发 speaker |
| 非当前 speaker 请求 task | `STALE_ATTEMPT` 或 `UNAUTHORIZED_CALLER`，无 DSH/SQLite 副作用 |
| create/associate 字段组合非法 | `INVALID_ARGUMENT`，无副作用 |
| 相同 request ID/相同 hash 重放 | 返回首次结果，不重复 task、event、version 或 receipt |
| 相同 request ID/不同 hash | `IDEMPOTENCY_CONFLICT` |
| DSH 成功后、Meeting `execute()` 前崩溃 | 恢复按 correlation 找回原 task，重放原标准 command，只提交一次 Meeting fact |
| DSH 结果未知且不可查询 | 保留 pending operation，返回可重试错误，不重复创建 |
| prepare 成功但 DSH 未调用 | 只有 operation metadata；无成功 command receipt、event、association 或 Meeting version 增量 |
| `execute()` 成功但 metadata 未标 finalized | recover 命中原 command receipt，再补 metadata 标记；不重复 Meeting fact |
| 跨 Team/Meeting 或无权 task/result | 拒绝关联或投影，不泄漏结果 |
| terminal task result | 只形成授权 snapshot/evidence，不自动 HandRaise 或 completion |
| Participant 合法 raise hand | 生成去重 pending HandRaise，不写 transcript |
| 非 Participant 或已关闭 Session raise hand | `UNAUTHORIZED_CALLER` 或终态错误，无状态变化 |
| 两个相同 HandRaise 并发提交 | 只有一个 pending 事实和一致 receipt |
| 普通 HandRaise | 当前 Turn 不变，下一次 planning 可纳入 Participant |
| blocking HandRaise | active attempt 不被并发打断；合法 submit 后 replan/waiting |
| Participant 被正式计划 | 对应 HandRaise 在 plan commit 后 consumed；失败 plan 不消费 |
| 非阻塞 task 运行 | Meeting 可继续其他 speaker/agenda |
| blocking task 已关联且 speaker 已合法 submit | submit 完成 attempt 后的 Meeting transition 才可进入 waiting；授权 terminal snapshot 后可恢复 planning |
| 暂停期间 task 完成 | 可固化 snapshot，不消费 HandRaise、不创建 Turn |
| task 在 attempt 投递后变化 | 已固化 taskSnapshots 不漂移，下一 attempt 才见新结果 |
| 取证确认旧数据库存在非空旧 HandRaise shape | 有明确 state version/owner 的兼容迁移后确定性读取，恢复结果与新 schema 一致；无此证据则不新增 migration |
| TeamTask completed | 不自动接受 output、解决 agenda 或结束 Meeting |
| Captain end 与 task/HandRaise/planning 并发 | 只有一个 Meeting transaction 成功；终态后 B 不新增 Meeting fact |

## 7. 验证命令与证据

先运行最窄的 domain、protocol、repository、adapter、planning、projection 和 recovery tests，再从 `plugin/` 执行：

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

真实运行验证必须先执行独立 profile 的 `--dump-config`，再验证：

- current speaker 创建/关联 TeamTask 并通过 `submit_turn` 释放发言权；
- 非阻塞 task 期间其他 Participant 可继续发言；
- terminal result 通过已取证的公开 DSH 路径固化为授权 snapshot；
- 原 Participant Session 能以真实 caller binding 提交 HandRaise；
- 如使用 Participant Session followup 通知，证明它与 SpeakerAttempt/其他 followup 串行、可取消且不并发；
- Manager context 得到授权 task result 并在后续 plan 纳入 Participant；
- 重复请求、崩溃窗口和冷恢复不产生重复 task/association/HandRaise。

证据记录 Node、pnpm、DSH package/version、插件 commit、profile、命令、结果、清理和 `Not Covered`。`build` 或 mock adapter 通过不能替代真实 TeamTask 路径。

## 8. 停止条件

- 当前锁定 DSH 版本没有所需公开 TeamTask service 或授权查询能力。
- DSH 无法提供稳定 request correlation，且不能安全查询创建结果。
- task completion 无法通过公开能力可证明地到达原 Participant Session；此时不能自动伪造 Participant HandRaise。
- 无法证明 caller、Team、task、result 或 Participant ownership。
- 实现需要扩张到 Mail、Archive、HTTP、Client UI、completion 或 termination。
- 闭环 A 已改变共享契约/模型而本分支尚未同步其公开 commit，继续修改会造成语义覆盖。
- 正式接口、设计和当前 DSH API 发生无法消解的冲突。

触发停止条件时，保留已完成的只读取证和独占模块，记录具体证据与受影响范围，请求人工决定；不得自行扩大架构或覆盖另一分支。

## 9. 完成与收口

闭环 B 只有在以下条件全部满足后才算完成：

- background task、submit-turn release、terminal observation、HandRaise、Manager planning 和新 SpeakerAttempt task snapshot 形成真实闭环。
- 权限、幂等、跨系统崩溃、waiting、暂停、冷恢复、additive DDL 和必要的 state shape 兼容均有自动化测试。
- 当前 DSH 版本、真实 API 来源、独立 profile 和运行证据已记录。
- 未混入闭环 A、Mail、Archive、HTTP 或 Client UI。
- 与闭环 A 的共享热点已基于公开 commit 语义合并，双方受影响测试通过。
- 需求、接口、设计、readiness 和 TODO 已按实际变化收口。
- 长期结论迁移后，本 RUNBOOK 及残留引用已删除。
