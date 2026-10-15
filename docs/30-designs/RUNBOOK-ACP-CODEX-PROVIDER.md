# RUNBOOK: ACP Codex — Codex provider 与恢复门禁

## Status, Dependency And Boundary

2026-10-15；Execute；P1–P5（含压缩装配修复 P3a/P3b）已 PASS；ACP 聚焦测试 7 文件、47 项通过，插件 lint 和 Host typecheck 通过。尚未会议接线或真实 Codex 验收。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册不授权提交、安装到人工环境或额外模型用量。

前置：C7 PASS。Scope：协议连接、MCP、技术持久化、provider 与冷恢复。Non-goals 沿总入口，不新增业务决定。

当前断点：连接、MCP bridge、技术持久化、provider、正常冷 load 与保守阻断已落代码并通过确定性组合验证。官方 SDK/bridge 仍按锁定版本使用；本册证据不证明真实模型可用性、会议权限接线或人工环境部署完成。

## Mechanical Steps

各任务已在 PASS 后删除并分别提交。下一入口为[会议接线 D1](./RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md#d1接入可选-provider-的插件生命周期)；本册保留至 E3 全局收口。

## Formal Inputs And Traceability

读取 A2 新建的 `docs/20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md` 全部 Fixed Contracts；读取 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md) 的 Codex provider 装配。数据精确结构、函数签名与新文件唯一位置以这两份正式文档为准，不重新从第三方源码选择方案。模块目录入口仅导出本步已经存在的符号。

## Validation, Handoff And Deletion

本册门禁为各步全部验证与实际文件计数，断言见各 PASS；仅证明确定性组合，真实Codex/会议尚待接线验收。只有前述证据齐全才交接D1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
