# Repository Guidelines

## Read Order

- 先读取 `docs/AGENTS.md`，按当前任务选择最小必要文档。
- 实现或评审前，必须读取 `docs/00-governance/ARCHITECTURE.md`。
- 修改文档时，必须读取 `docs/00-governance/DOCUMENT-RULES.md`。
- 处理 TODO、验证或任务收口时，必须读取 `docs/00-governance/TODO-RULES.md`。
- 处理暂存、提交或提交历史时，必须读取 `docs/00-governance/COMMIT-RULES.md`。
- 处理分支、PR、Review、CI 或合并时，必须读取 `docs/00-governance/PR-RULES.md`。
- 根目录 `README.md` 只提供项目简介，不是需求或实现依据。

## Current State

- Convivium 当前处于产品讨论和工程治理初始化阶段。
- 尚未初始化应用脚手架，也没有可执行的构建、测试或启动命令。
- 不得根据讨论稿自行确定未决产品范围、框架、数据库、通信方式或部署形态。

## Project Direction

- Convivium 是独立的 Electron 桌面应用，核心代码使用 TypeScript。
- Renderer 不得直接管理 ACP Agent 进程、会议运行时、任意文件访问或敏感权限。
- 每个 Agent 在具体会议身份下使用独立 ACP Session；不得跨身份共享会话状态。
- 后续新增顶层工程目录前，必须先在架构文档中明确其职责、依赖方向和验证入口。

## Documentation Governance

- 稳定工程规则放在 `docs/00-governance/`。
- 已确认、可验收的需求放在 `docs/10-requirements/`。
- 接口、事件、IPC、配置和数据格式契约放在 `docs/20-interfaces/`。
- 模块设计、专项设计和临时 RUNBOOK 放在 `docs/30-designs/`。
- 实现覆盖、验证结果和发布准备证据放在 `docs/40-readiness/`。
- 启动、诊断、恢复、升级和发布操作放在 `docs/50-operations/`。
- 调研、讨论、决策背景和历史材料放在 `docs/60-human/`，不作为默认实现依据。
- 项目专用的 Codex 工作流放在 `.agents/skills/`，不在 `docs/` 中保存 Prompt 集合。

## Change Rules

- 保留用户已有改动，不混入与当前任务无关的修改。
- 行为、接口、架构规则或开发流程变化时，同步更新对应文档。
- 只把已经确认的结论提升为需求、契约或治理规则；未决内容留在 `TODO.md` 或 `docs/60-human/`。
- 使用最窄的相关验证；没有自动化验证时，明确记录未验证边界。
- 开发改动通过独立分支和 PR 进入 `main`；不自动合并 PR，除非用户明确要求。
