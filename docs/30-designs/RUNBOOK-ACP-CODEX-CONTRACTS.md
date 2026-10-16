# RUNBOOK: ACP Codex — 契约迁移与草稿删除

## Status, Dependency And Boundary

2026-10-16；Execute；契约迁移 A1–A3 已完成，无剩余机械任务；当前全组入口 E1。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册无剩余任务；本轮授权及执行边界以总入口为准。

前置：用户授权 Execute，基线与总入口一致。Scope：正式化已确认需求/接口/设计，并在编码前删除已完整迁移的草稿。Non-goals 沿总入口，不新增业务决定。

产品当前仍无 ACP 实现；本册只迁移已确认的正式依据，不将计划提升为实现覆盖。

## Migration Ownership

| 草稿内容                                                                 | 唯一正式落点                                           | 步骤 |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ---- |
| 自研 provider、允许 codex-acp、技术存储所有权                            | Architecture                                           | A1   |
| 八角色/三初始贡献者、Reviewer/spawn、未知阻断/真实 deadline/人工控制验收 | Meeting Orchestration / Evidence Round requirements    | A1   |
| Definition 完整选择、hash、不可变快照、descriptor 到期                   | DSH Role Interface                                     | A2   |
| ACP 连接、三表、MCP caller、错误、receipt、防重放、公开消费面            | DSH-ACP-EXECUTION-INTERFACE.md                         | A2   |
| executionBlocks 安全 DTO                                                 | Meeting Interface                                      | A2   |
| owner/dispatcher/provider 装配与生命周期                                 | Peer Meeting Agents / DSH Plugin designs               | A3   |
| 未实现/未验证事实                                                        | 正式设计“实施与验证边界”小节；不写成已通过的 readiness | A3   |

草稿已完成逐段覆盖核对并删除，临时契约已移入正式来源；任何后续接口缺漏须在编码前 STOP，不能以本册补造产品决定。

## Formal Sources And Handoff

本册的机械任务已按用户要求在各自验证通过后删除。后续 C1 读取以下正式来源，不再从临时 Migration Input 或草稿取值：

- [Architecture](../00-governance/ARCHITECTURE.md)：自研 provider、官方 bridge 与技术存储边界。
- [Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：八角色、三位默认 Contributor、Codex 专项验收。
- [Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)：spawn worker、未知结果与真实 deadline。
- [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)：完整 Definition 选择、hash、快照、descriptor 到期。
- [ACP Execution Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md)：公开消费签名、三表、MCP/stream、receipt 与恢复。
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)：安全 executionBlocks DTO。
- [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md)：owner/worker/dispatcher、Web 资源及验证边界。
- [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md)：插件/provider 装配、诊断与 teardown。

## Validation, Handoff And Deletion

交接条件为 A1–A3 文档门禁通过，草稿已删除，正式来源覆盖全部有效决策；未执行产品实现、安装、真实 Codex 或互联网验收，不能提升 readiness。逐步文件清单、覆盖映射和运行记录保存在仓库外；Git 提交保存对应任务删除前后的证据。

本册文件继续参与全组 E3 的六册关闭清单，不以历史归档长期留存；没有剩余机械任务，不重新执行 A1 基线。当前全组下一步为验收与收口册 E1。
