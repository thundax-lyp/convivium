# Document Rules

## Purpose

本文档定义 Convivium 工程文档的分类、命名、真相源、写作、同步和迁移规则，使文档能够被人类审阅、被 Agent 最小化加载，并随代码一起通过 Git 维护。

## Authority And Read Order

文档按以下顺序提供约束：

1. `docs/00-governance/`：稳定工程规则和文档路由。
2. `docs/10-requirements/`：已确认、可验收的产品行为。
3. `docs/20-interfaces/`：跨边界契约和兼容性要求。
4. `docs/30-designs/`：满足需求与契约的当前实现方案。
5. `docs/40-readiness/`：实现覆盖、验证事实和未覆盖边界。
6. `docs/50-operations/`：运行、诊断、恢复、升级和发布操作。

`docs/60-human/` 保存调研、讨论、决策背景和历史材料，不作为默认实现依据。其结论只有迁移到前述工程文档后，才能约束实现。

当文档之间发生冲突时，不得静默选择方便实现的一方。应先判断文档职责和更新时间；无法消解时，将冲突记录为待讨论项并请求人工确认。

## Directory Responsibilities

### `00-governance`

- 保存稳定、跨任务适用的工程规则。
- 不记录一次任务的执行过程、临时方案或完成历史。
- 规则变化时必须检查根 `AGENTS.md`、`docs/AGENTS.md` 和相关 Skill 是否需要同步。
- 暂存、提交和历史修改规则统一由 `COMMIT-RULES.md` 定义。
- 分支、PR、Review、CI 和合并规则统一由 `PR-RULES.md` 定义。

### `10-requirements`

- 只保存已经确认、可以形成验收标准的需求。
- 必须区分 Scope、Non-goals、业务规则和 Acceptance Criteria。
- 不保存框架选型、类结构、数据库实现或仍待讨论的产品问题。

### `20-interfaces`

- 保存进程、模块和外部系统之间的接口、事件、状态、错误、权限、配置与数据格式契约。
- 契约应说明 producer、consumer、所有权、兼容策略和失败语义。
- 可机器校验的 Schema 应与说明文档放在同一目录，并明确哪一方是真相源。

### `30-designs`

- 保存模块设计、状态机、数据所有权、依赖方向和专项设计。
- 设计必须关联需求或契约，不能替代产品决策。
- 复杂临时任务可以使用 `RUNBOOK-*.md`；任务关闭时必须迁移长期结论并删除 RUNBOOK。

### `40-readiness`

- 保存实现覆盖矩阵、测试结果、运行时证据、未覆盖项和交付状态。
- 证据必须记录日期、验证范围、环境或 commit 边界、执行方式、结果和 `Not Covered`。
- “进程已启动”“端口正在监听”或单次命令成功不能自动证明业务就绪。

### `50-operations`

- 保存可重复执行的启动、停止、诊断、恢复、升级、发布和故障处置流程。
- 操作文档必须列出前置条件、执行步骤、成功判据、失败处理和恢复方式。
- 自动化脚本是执行入口时，文档应引用脚本而不是复制一份可能漂移的实现。

### `60-human`

- 保存产品讨论稿、外部调研、决策背景、会议记录和历史材料。
- 文件必须清楚标记其状态以及是否可以作为实现依据。
- 已确认结论应迁移到对应工程文档；不在多处保留相互竞争的当前口径。

## File Naming

- 工程文档文件名使用大写英文单词，以 `-` 分隔，不使用中文或空格。
- 固定入口文件可以使用 `README.md`、`AGENTS.md` 和 `TODO.md`。
- 需求文档命名为 `*-REQUIREMENTS.md`。
- 接口文档命名为 `*-INTERFACE.md`，机器契约使用相同主题名称。
- 模块设计命名为 `*-DESIGN.md`，专项设计命名为 `*-SPECIAL-DESIGN.md`。
- 临时执行手册命名为 `RUNBOOK-*.md`。
- 可重复操作说明命名为 `HOW-TO-*.md`，统一放在 `50-operations/`。
- 验证证据命名为 `*-EVIDENCE.md`，实现覆盖命名为 `*-IMPLEMENTATION-COVERAGE.md`。
- 讨论材料应通过文件名明确标记 `DRAFT`、`RESEARCH` 或 `ARCHIVE` 等状态。

## Language And Style

- 业务和工程说明使用中文。
- 协议名、类型名、字段名、模块名、命令和工具名保留英文原文。
- 文档应明确、简洁、可执行，不使用宣传性语言代替边界、规则或验收标准。
- 事实、已确认规则、候选方案和推断必须明确区分。
- 同一规则只保留一个当前真相源，其他文档使用链接引用。
- Mermaid 流程图应显式使用 ELK 布局；非流程图不强制。

## Required Structures

需求文档至少包含：

- `Purpose`
- `Scope`
- `Non-goals`
- `Functional Requirements`
- `Business Rules`
- `Acceptance Criteria`
- `Related Documents`

接口文档至少包含：

- `Purpose`
- `Boundary And Ownership`
- `Transport Or Invocation`
- `Data And State Contract`
- `Error And Permission Semantics`
- `Compatibility`
- `Related Documents`

设计文档至少包含：

- `Purpose`
- `Scope And Non-goals`
- `Related Requirements And Interfaces`
- `Responsibilities And Dependencies`
- `State And Failure Handling`
- `Security And Observability`
- `Acceptance`

readiness 证据至少包含：

- `Scope`
- `Validated Contract`
- `Executed Validation`
- `Not Covered`
- `Closure`

## Document Lifecycle

1. 未确认的讨论和调研保存在 `60-human/` 或 `TODO.md`。
2. 产品结论确认后，迁移到 `10-requirements/` 并写明验收标准。
3. 跨边界语义稳定后，形成 `20-interfaces/` 契约。
4. 实现方案确认后，形成或更新 `30-designs/`。
5. 实现和验证完成后，在 `40-readiness/` 记录证据及未覆盖项。
6. 稳定的运行流程进入 `50-operations/`。
7. 原讨论稿中的当前结论迁移完成后，应删除重复内容或明确归档状态。

## Document Sync

变更收口前至少检查：

- 产品行为变化：`10-requirements/`。
- 接口、事件、IPC、配置或数据格式变化：`20-interfaces/`。
- 进程边界、依赖方向或固定工程做法变化：`00-governance/`。
- 实现结构、状态机或失败处理变化：`30-designs/`。
- 验证范围、交付状态或已知缺口变化：`40-readiness/`。
- 启动、恢复、升级或发布方式变化：`50-operations/`。
- 文档路由变化：根 `AGENTS.md` 和 `docs/AGENTS.md`。
- 项目工程工作流变化：对应 `.agents/skills/`。
- Commit 规则变化：`COMMIT-RULES.md`、根 `AGENTS.md` 和 `docs/AGENTS.md`。
- PR 交付规则变化：`PR-RULES.md` 和 `.github/pull_request_template.md`。

纯实现补齐且未改变既有口径时，不应顺手改写无关文档。

## Skill Boundary

- `.agents/skills/` 保存项目专用、可重复执行的 Agent 工程工作流。
- 仓库通用 Skill 放在仓库根 `.agents/skills/`；只有确实限定于子工程时，才放在该子目录的 `.agents/skills/`。
- 跨仓库个人 Skill 放在 `$HOME/.agents/skills/`，不得作为 Convivium 仓库交付内容。
- Skill 可以引用治理、需求、接口、设计和操作文档，但不能成为产品需求或业务契约的唯一真相源。
- `.agents/skills/` 中的 Skill 不能直接作为 Convivium 产品运行时角色或会议模板的真相源。

| 内容 | 归属 | 当前路径 |
| --- | --- | --- |
| 开发、审查、启动和发布等工程工作流 | 项目 Skill | `.agents/skills/<skill>/` |
| 产品内角色 Prompt 和角色模板 | 产品数据或版本化模板 | 待产品需求与工程结构确认 |
| Meeting Runtime 的主持、摘要和推荐模板 | 对应运行时模块的版本化资源 | 待模块设计确认 |
| 一次性操作指令 | 不作为长期工程资产保存 | 无 |

在产品数据和运行时源码结构确认前，不得为了存放 Prompt 自行创建新的顶层目录。
