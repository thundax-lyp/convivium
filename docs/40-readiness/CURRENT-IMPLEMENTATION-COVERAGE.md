# Current Implementation Coverage

## Scope

本文记录当前代码相对已确认需求的实现覆盖，不替代需求、接口或设计文档。

- 记录日期：2026-09-02
- 代码基线：`4856c88bcc585d09c4d4b8a54300fc0501f0b769`
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
- Pass：68 test files、476 tests。
- 未执行 `smoke:profile` 或其他真实 DSH profile selector；当前 HEAD 不新增真实 profile 证据。

历史真实 profile 验证覆盖 timeout、reassign、MeetingTask、completion/end、risk disposition、cold rebind、archive continuation、mail race 和跨 Meeting/Team isolation；详见 [DSH Runtime Vertical Slice Evidence](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md)。

## Not Covered

- 遗留 SQLite 数据不读取、不迁移、不删除。
- 不支持 multi-Host writer、远程 filesystem、远程访问、多用户和网络部署。
- risk disposition、reassign 尚无 browser 控制证据；risk UI 未实现。
- Question 的 required-review/risk evidence、Agenda candidate 管理、Decision candidate 完整生命周期和自动 stall/refocus/replan 未实现。
- Agent role catalog、Manager recommendation、Captain admission 和 Meeting Agent Definition runtime 未实现。
- Developer Markdown、结构化 metrics、stress/长期资源泄漏和生产发布验证未实现。

## Closure

当前代码可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不可描述为完整会议产品、真实模型链路或发布就绪。当前 HEAD 的真实 DSH profile selector 仍待重跑。
