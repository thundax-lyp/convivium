# RUNBOOK: ACP Codex — 配置与角色资源

## Status, Dependency And Boundary

2026-10-15；Execute；配置与角色聚焦门禁通过，下一入口 P1。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本次用户授权逐项删除任务段落并单独提交；不授权安装到人工环境或额外模型用量。

前置：A3 PASS；草稿已删除。Scope：Definition 选择/指纹/准入，以及 Web 资源闭包。Non-goals 沿总入口，不新增业务决定。

配置与角色已实现：Definition 完整执行选择、稳定身份 hash、解析后 reasoning、不可变准入快照和到期处理，以及八角色/六能力与默认 GitHub/arXiv/Web 创建入口。本册任务段落已逐项删除；ACP provider 仍未实现，不能把配置与角色资源验收称为 Codex 已接通。

## Formal Inputs And Traceability

必读 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 的 Definition/PreparedDescriptor/ownership、[Peer Meeting Agents](./PEER-MEETING-AGENTS-DESIGN.md) 的 provisioning、[Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) MO-FR-14。ACP 配置精确结构由 A2 新建的 `docs/20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md` 提供；本册执行时必须存在。

后续 provider 实现只消费正式接口与设计。Definition 不承载 command/env，已有 Session 沿原持久绑定恢复；WEB ANALYZER 的会议权限仍为普通 Contributor。

## Validation, Handoff And Deletion

本册固定聚焦集合的 12 个测试文件、118 项测试通过；八角色发行定义校验、Host 类型检查、改动文件 ESLint/Prettier、文档链接及 git diff --check 通过。配置与角色资源完整，但尚无真实 ACP 执行证据，交接 P1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
