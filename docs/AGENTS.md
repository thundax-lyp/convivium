# Docs Agent

Convivium 工程文档路由入口。只读取当前任务必需的文档，并优先遵循治理文档。

## Rules

- `00-governance/` 中的稳定规则优先于需求、接口和设计文档。
- `10-requirements/` 只保存已经确认、可以验收的需求。
- `20-interfaces/` 保存跨进程、跨模块和外部协议契约。
- `30-designs/` 保存当前设计与专项实现方案。
- `40-readiness/` 保存实现覆盖、测试和发布验证证据。
- `50-operations/` 保存启动、诊断、恢复、升级和发布流程。
- `60-human/` 保存调研、决策背景、讨论记录和历史归档，不作为实现真相源。
- 工程执行工作流应沉淀为仓库 `.agents/skills/` 下的 Skill，不在 `docs/` 中保存 Prompt 集合。
- 根目录 `README.md` 只提供项目简介，不是需求或实现依据。

## Loading

- 实现或评审前，读取 `00-governance/ARCHITECTURE.md`。
- 修改文档时，读取 `00-governance/DOCUMENT-RULES.md`。
- 处理 TODO、验证或任务收口时，读取 `00-governance/TODO-RULES.md`。
- 处理暂存、提交或提交历史时，读取 `00-governance/COMMIT-RULES.md`。
- 处理分支、PR、Review、CI 或合并时，读取 `00-governance/PR-RULES.md`。
- 业务行为以 `10-requirements/` 为准。
- 找不到覆盖目标行为和验收标准的有效需求文档时，不得开始产品功能实现；应先记录并确认需求。
- 涉及协议、事件、IPC、配置或数据格式时读取 `20-interfaces/`。
- 涉及具体实现方案时读取 `30-designs/`。
- 涉及验收、发布或运行问题时读取 `40-readiness/` 和 `50-operations/`。
- 仅在需要理解调研依据、决策背景或历史时读取 `60-human/`。

## Load Limits

- 只读取当前任务需要的文档，不默认全量加载 `docs/`。
- 治理文档优先于需求、接口和设计文档。
- 单模块任务不读取无依赖关系的其他模块文档。
- `60-human/` 仅用于理解背景，不得覆盖正式工程文档中的当前口径。
