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

- Convivium 已在 `plugin/` 初始化独立的 DSH 插件工程。
- `plugin/` 提供最小构建和类型检查入口；会议能力尚未实现，不得把工程骨架描述为产品已完成。
- 不得根据讨论稿自行确定未决产品范围、框架、数据库、通信方式或部署形态。

## Project Direction

- Convivium 是使用 TypeScript 独立实现的纯 DSH 插件。外部项目只能作为只读调研材料，不是源码基线、运行依赖或兼容目标。
- 插件前端不得直接管理 Agent Session、会议运行时、任意文件访问或敏感权限；这些能力只能由插件后端通过受控工具和路由提供。
- 每个 Agent 在具体会议身份下使用独立 DSH continuable AgentSession；不得跨身份共享会话状态。
- 后续新增顶层工程目录前，必须先在架构文档中明确其职责、依赖方向和验证入口。

## Implementation Economy

- 默认采用满足当前已确认行为和必要不变量的最小安全改动，不为仅有假设性未来价值的能力预建机制。
- 新增抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点前，必须指出至少一项当前依据：需求或接口契约、架构或安全不变量、可复现失败、必要隔离边界，或多个当前消费者需要的稳定共享语义。
- 单一消费者、单一实现、文件数量或代码行数只能触发进一步检查，不能单独证明过度设计；权限、事务、持久化、外部系统和生命周期边界可以因隔离责任而独立存在。
- finding 是否成立与建议方案是否合适必须分别判断；较小方案能够消除同一触发条件并保持必要边界时，采用较小方案。
- 未经当前任务确认，不顺带重构稳定路径、建立通用框架、扩展协议或实现后续阶段；完成当前范围必须扩张时，停止并报告新增范围。

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
