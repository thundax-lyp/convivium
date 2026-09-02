# Current Implementation Coverage

## Scope

本文记录当前代码相对已确认需求的实现覆盖，不替代需求、接口或设计文档。

- 记录日期：2026-09-02
- 代码基线：`b0753d86a63312ff9a19f2f4464eda8989ec8c88`
- 环境：macOS、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`
- `已实现` 表示存在正式路径和相称验证；`部分实现` 表示存在局部路径但未闭合；`未实现` 表示没有产品运行路径。
- 历史真实 profile 证据只适用于其原始 commit，不外推为当前 HEAD 证据。

## Validated Contract

- DSH plugin package、Host/Client 构建、`spawn` provider gate 和 loopback HTTP。
- Meeting/Participant/Session 隔离、caller/capability 校验、顺序发言、timeout/reassign/drain 和恢复。
- Storage Domain 原子 commit、幂等、checkpoint/tail recovery、outbox 和 catalog recovery。
- MeetingTask、HandRaise、meeting mail、completion/end、risk disposition、archive 和 continuation。
- Proposal/Position、Decision acceptance、Question/Issue/Agenda candidate 的已实现子集及对应 projection。

## Requirement Coverage

| Requirement | 状态 | 当前覆盖 | 主要缺口 |
| --- | --- | --- | --- |
| FR-1 DSH 插件形态 | 已实现 | package、双 bundle、provider gate、profile evidence | 高于最低版本的兼容与分发策略未决定 |
| FR-2 会议与身份隔离 | 已实现 | Meeting、Participant、Session、repository ownership 隔离 | 远程、多用户、跨 Host 不支持，属于 V1 非目标 |
| FR-3 有序连续发言 | 已实现 | 单一 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝、reassign/skip | 无 |
| FR-4 发言计划与选择 | 部分实现 | Manager/round-robin planning、资格校验、required Participant waiting | fallback、自动 stall/refocus/replan 未闭环 |
| FR-5 异步任务与举手 | 已实现 | MeetingTask、HandRaise、恢复、幂等和 task evidence | 外部副作用 exactly-once、长期压力未覆盖 |
| FR-6 议题范围与发散控制 | 部分实现 | Question/Issue/Proposal/Position/Agenda candidate 的已实现提交和 blocking Question 校验 | required-review/risk evidence、candidate 管理、stall/refocus 未闭环 |
| FR-7 提案、立场与决策 | 部分实现 | Proposal revision、Position、Decision candidate、Captain acceptance、单 Issue risk disposition | auto-accept、candidate/public projection、revoke/supersede、risk acceptance/UI 未实现 |
| FR-8 完成事实与会议结束 | 已实现 | completion/end、task evidence、终态 projection、恢复和幂等 | Decision/Agenda 细节与 stall/refocus 属其他未完成范围 |
| FR-9 暂停、恢复与故障隔离 | 已实现 | pause/resume、timeout、reassign/skip、interrupt/drain、cold rebind、per-Meeting isolation | 无 |
| FR-10 记录、隐私与归档 | 部分实现 | transcript、meeting mail、archive、Session cleanup、continuation | Scribe minutes 契约、projection、状态/归档路径未实现 |
| FR-11 可观察性与用户控制 | 已实现 | Meeting list/status、pause/resume/reassign/end、Client polling/refetch 和主要状态区块 | metrics、远程/多用户、完整 browser evidence 未覆盖 |
| FR-12 Agent 内部能力边界 | 已实现 | 只消费正式提交和授权 task projection，不写自定义 DSH Session Event | 后续 Mail/Web/UI 路径须保持该边界 |
| FR-13 Agent 角色目录与参会推荐 | 未实现 | 已有接口契约和样本 | Catalog、recommendation、Captain disposition、admission、provisioning、恢复、UI |
| FR-14 Agent Definition 与 DSH composition | 未实现 | 9 个样本、hash 和负向 fixture | Definition resolution、Preset/Skill validation、差异化 Session composition |

## Executed Validation

2026-09-02，在当前 HEAD 执行 `pnpm --dir plugin verify`：

- Pass：format、lint、Host/Client typecheck、build、environment、contract、Agent Definition samples、package verifier。
- Pass：68 test files、481 tests。
- 未执行 `smoke:profile` 或其他真实 DSH profile selector；当前 HEAD 不新增真实 profile 证据。

历史真实 profile 验证覆盖 timeout、reassign、MeetingTask、completion/end、risk disposition、cold rebind、archive continuation、mail race 和跨 Meeting/Team isolation；其提交、命令和结果索引如下，详见 [DSH Runtime Vertical Slice Evidence](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md)。

| 历史基线 | 命令 | 结果与边界 |
| --- | --- | --- |
| `23fbbb5` | `CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile` | Pass；timeout 后旧 Speaker Activation drain，后续 Speaker 提交，旧发言不入 transcript。 |
| `75e7a7d` | `CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile` | Pass；旧 attempt revoke、旧 Activation drain、replacement attempt 提交。 |
| `7d2ee89` | `CONVIVIUM_SMOKE_SCENARIO=task-handraise pnpm --dir plugin smoke:profile` | Pass；task delivery、finish、HandRaise 和后续 planning/evidence submit。 |
| `4fb7b13` | `CONVIVIUM_SMOKE_SCENARIO=completion-end pnpm --dir plugin smoke:profile` | Pass；completion/end 竞争只产生一个终态，terminal 写入被拒绝。 |
| `b5c415b` | `CONVIVIUM_SMOKE_SCENARIO=risk-reopen pnpm --dir plugin smoke:profile` | Pass；risk disposition、同 request replay 和 hash conflict。 |
| `83c2cd3` | `CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile` | Pass；新 Host PID 中 exact Captain Session rebind 和后续提交。 |
| `479d994` | `CONVIVIUM_SMOKE_SCENARIO=archive-continuation pnpm --dir plugin smoke:profile` | Pass；source archive、target 新身份和 final summary-only continuation。 |
| `6a01518` | `CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile` | Pass；mail 单一 terminal、稳定 delivery ID 和隐私边界。 |
| `0a7110d` | `CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile` | Pass；跨 Meeting ownership 隔离和清理隔离。 |

上述记录是各自历史提交的证据，不外推为当前 HEAD 的 smoke 结果；当前代码的 persistence 边界为 Storage Domain/JSONL，历史基线的实际介质以对应提交为准。

## Not Covered

- 遗留 SQLite 数据不读取、不迁移、不删除。
- 不支持 multi-Host writer、远程 filesystem、远程访问、多用户和网络部署。
- risk disposition、reassign 尚无 browser 控制证据；risk UI 未实现。
- Question 的 required-review/risk evidence、Agenda candidate 管理、Decision candidate 完整生命周期和自动 stall/refocus/replan 未实现。
- Agent role catalog、Manager recommendation、Captain admission 和 Meeting Agent Definition runtime 未实现。
- Developer Markdown、结构化 metrics、stress/长期资源泄漏和生产发布验证未实现。

## Closure

当前代码可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不可描述为完整会议产品、真实模型链路或发布就绪。当前 HEAD 的真实 DSH profile selector 仍待重跑。
