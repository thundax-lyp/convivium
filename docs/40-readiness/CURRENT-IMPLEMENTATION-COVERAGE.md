# Current Implementation Coverage

## Scope

本文记录 Convivium 当前代码相对已确认会议需求的实现覆盖，不替代需求、接口或设计文档。

- 记录日期：2026-08-28
- 代码基线：`codex/feat/local-single-user-meeting-control`，起点 `f655001`；本次收口实现提交为 `f14ae00`、`08613fd`、`1b121e6`
- 环境：macOS、Node `v24.19.0`、pnpm `10.7.0`、DSH `0.1.1-rc.2`
- 本文只记录实际执行过的实现与验证；文档删除和本覆盖矩阵更新由收口提交记录。

覆盖状态含义：

- `已实现`：当前代码存在正式运行路径，并有与风险相称的自动化或真实 profile 证据。
- `部分实现`：模型、Schema、局部路径或自动化证据存在，但尚未满足整项需求或真实运行边界。
- `未实现`：当前产品路径没有对应 handler、route、UI 或运行机制。

## Validated Contract

当前已经形成实现和验证闭环的主干包括：

- 独立 DSH 插件 package、Host/Client 双构建面、bundle/profile 契约和 `spawn` continuable provider 组合。
- 每个 Meeting identity 使用独立 DSH continuable Session；caller、ownership、attempt 和 capability 在会议工具路径中校验。
- SQLite state、event、receipt 和 outbox 原子提交，支持幂等、version conflict、重开读取和恢复扫描。
- `round_robin` 与 Manager planning 的单一有效发言权、有序逐 Speaker delivery 和正式 transcript 提交。
- Convivium-owned MeetingTask、task status/start/finish、HandRaise、锁内 task evidence 和终态 task cancellation。
- completion claim、确定性完成判断、Captain end、execution-terminal projection 和终态后写入拒绝。
- archive package materialization、capability revoke、interrupt、drain、ownership close 和 archive recovery。
- loopback-only Meeting list/status/pause/resume HTTP、`local_host/loopback-web` 控制来源和 DSH Client `Meetings` slot；Client 只从 list 选择 Meeting，并在写后全量 refetch。

## Requirement Coverage

| Requirement               | 状态     | 当前证据                                                                                       | 剩余边界                                                                                                          |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| FR-1 DSH 插件形态         | 已实现   | package、双 bundle、provider capability、独立 profile smoke                                    | 高于最低版本的兼容与分发策略仍未决定                                                                              |
| FR-2 会议与身份隔离       | 部分实现 | Meeting/Participant/Manager/Captain、Session ownership、label 和 caller binding 已实现         | V1 loopback Web 按正式边界不绑定用户/Team authority；远程、多用户与跨 workspace Web 路径不支持                    |
| FR-3 有序连续发言         | 部分实现 | 单一 attempt、逐 Speaker dispatch、late/stale submit 拒绝、Captain reassign/skip 和 A→C→B 真实 profile smoke | timeout、interrupt 和 Captain reassign 的真实 DSH profile smoke 尚未形成完整运行路径                              |
| FR-4 发言计划与选择       | 部分实现 | Manager 和 round-robin planning、候选资格与 MeetingTask/HandRaise 消费已实现                   | required Participant unavailable、确定性 fallback、自动 failure/stall/replan 还未形成完整 runtime 路径            |
| FR-5 异步任务与举手       | 部分实现 | MeetingTask/HandRaise 的领域、工具、恢复、幂等、completion/end 集成自动化通过                  | `finish → HandRaise → 后续 submit_turn` 尚无真实 DSH profile smoke；不承诺外部副作用 exactly-once                 |
| FR-6 议题范围与发散控制   | 部分实现 | non-blocking Question create/read/resolve/archive 已通过 focused 与完整插件验证；canonical model、协议 Schema、status 和 completion blocking 规则存在 | proposal/position/issue/decision proposal/agenda candidate 声明尚未提交；blocking Question evidence、stall/refocus 未闭环 |
| FR-7 提案、立场与决策     | 部分实现 | model、公开 projection 和输入 Schema 已定义，completion/end 可读取正式事实                     | proposal/position/decision claims 尚无 Runtime/transition commit 路径；Captain 风险处置工具未实现                 |
| FR-8 完成事实与会议结束   | 部分实现 | completion/end、task evidence、终态 projection、幂等、恢复和 A/B 原子集成测试通过              | 独立 Captain risk disposition 尚未实现；真实 DSH completion/end 竞争 smoke 未执行                                 |
| FR-9 暂停、恢复与故障隔离 | 部分实现 | Captain tool 与 loopback Web pause/resume、outbox guard、SQLite recovery、archive recovery、stale gate、发言 reassign/skip、`speakerTimeoutMs` 到 SpeakerAttempt `deadlineAt` 的持久化，以及连续两轮本地 pause/resume 回归已实现 | timeout 扫描、interrupt、attempt failure counter、自动降级策略和 reassign 真实 cold restart/rebind smoke 未完成 |
| FR-10 记录、隐私与归档    | 部分实现 | transcript 隔离、archive materialization 和 Session cleanup 自动化已实现                       | meeting-scoped mailbox、continuation、developer Markdown 生成和 archive 真实 profile smoke 未实现                 |
| FR-11 可观察性与用户控制  | 部分实现 | caller-specific status、Captain reassign/skip tool、loopback list/status/pause/resume HTTP、Plugin Client Meetings slot、poll/refetch 和真实浏览器选择/暂停/恢复已实现 | 结构化 metrics、远程/多用户控制，以及面板 end/reassign 控制不在当前闭环                                           |
| FR-12 Agent 内部能力边界  | 已实现   | Convivium 只消费正式提交和授权 task projection，不写自定义 DSH Session Event；模块边界测试通过 | 仍需在未来 Mail、Web 和 UI 路径继续保持同一边界                                                                   |

## Executed Validation

2026-08-28 在本分支上述实现提交序列执行：

| 命令                                                                               | 结果                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts`         | Pass；1 file、18 tests；覆盖连续两轮本地 pause/resume，防止 Manager planning delivery ID 重用                         |
| `pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-environment.spec.ts`   | Pass；确定性 smoke 从 caller environment 与 command override 移除 `DEEPSEEK_API_KEY`                                  |
| `pnpm --dir plugin verify`                                                         | Pass；40 files、292 tests；format、lint、Host/Client typecheck、build、15-package environment、contract 和 package verifier 全部通过 |
| `pnpm --dir plugin smoke:profile`                                                  | Pass；真实临时 DSH web profile、spawn provider、loopback list/status/pause/resume，结果含 `httpRouteUsed: true`          |
| `CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`                   | Pass；真实 DSH Client 可见 `Runtime smoke`，选择后 running → paused → running，退出打印 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok` |

上述两条 smoke 均使用脚本创建并清理的 OS temp root，不读取 `dev.env`、不传递 `DEEPSEEK_API_KEY`、不调用 LLM，也不使用持久 `dsh-workspace/`；它们是确定性 Meeting 运行与 Client 证据，不是 [DSH 插件冒烟测试](../50-operations/HOW-TO-DSH-SMOKE.md)所述的人工真实模型链路验证。[DSH Runtime Vertical Slice Evidence](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md) 记录 `7b39065` 上的独立 `web` profile、真实 package、`spawn` provider、Manager planning 和逐 Speaker Turn smoke。该历史 smoke 不自动证明后续 MeetingTask、completion、archive 或 restart 场景。

2026-08-31 在当前工作区执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm --dir plugin verify` | Pass；40 files、295 tests；新增 `convivium_reassign_turn` 的 Captain reassign/skip、旧 attempt 迟到提交拒绝和工具注册契约覆盖；format、lint、Host/Client typecheck、build、15-package environment、contract 和 package verifier 全部通过。 |

## Not Covered

以下是当前真实缺口，不因 Schema、类型或历史测试存在而视为已实现：

- V1 loopback Web 已确认不绑定用户或 Team authority；远程、多用户、跨 Host 共享和网络部署不支持。
- 当前 `repositoryPath()`/`rehydrate()` 使用 Architecture 允许的过渡物理布局，尚未迁移到目标 `<teamId>/meetings/<meetingId>/` 目录；本地单用户会议控制闭环只复用现有 Runtime discovery，不在该分支修改存储布局。
- 接口声明的 `convivium_dispose_risk` 没有 Tool/Runtime/transition 实现；`convivium_reassign_turn` 已有 Captain tool、Runtime 和 transition，但尚无真实 DSH profile 或面板控制验证。
- `TurnSubmissionV1.changes` 的 non-blocking question 已写入正式 MeetingState 并支持 status、resolution、recovery 和 Archive；proposal、position、issue、decision proposal 和 agenda candidate 尚未写入正式 MeetingState。
- blocking Question 的正式创建、提交与验证尚未覆盖。
- meeting-scoped mailbox、MailHandlingAttempt、Participant Session 统一 mail/speaker queue 和 mail timeout 未实现。
- `speakerTimeoutMs` 已接入 SpeakerAttempt `deadlineAt` 持久化；timeout 扫描、interrupt、attempt failure policy 和自动降级策略尚未实现。
- 自动 stall/refocus、required Participant unavailable 和完整 deterministic fallback 未形成可运行闭环。
- continuation 创建新 Meeting 和显式导入 archive material 尚未实现，当前 fail closed。
- developer Markdown、结构化 metrics、stress/长期资源泄漏和生产发布验证未实现；浏览器只覆盖本地 list/select/pause/resume 确定性闭环。
- MeetingTask、completion/end、archive、cold restart/rebind 和跨 Meeting isolation 尚无对应的完整真实 DSH profile smoke。

## Closure

当前代码可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不能描述为完整会议产品、真实模型链路或发布就绪。V1 采用单个 loopback DSH Host 的单用户边界，并已以本地 Meeting list 作为面板入口完成 status/pause/resume Client 竖切。远程多用户、跨 Host 共享和网络部署不属于 V1。

真实 DSH Runtime 竖切的独立 profile 证据继续保留在 [DSH Runtime Vertical Slice Evidence](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md)；当前覆盖判断以本文为统一入口。
