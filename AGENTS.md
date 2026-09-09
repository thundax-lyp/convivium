# Repository Guidelines

## Project And Authority

Convivium 是使用 TypeScript 独立实现的纯 DSH 插件。项目边界以 [Architecture](docs/00-governance/ARCHITECTURE.md) 为准；根 `README.md` 只提供项目简介，不是需求或实现依据。

当前实现范围、验证证据与未覆盖项见 [Current Implementation Coverage](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)；不得从设计文档推断功能已经实现。

不得根据讨论稿自行确定未决产品范围、框架、数据库、通信方式或部署形态。找不到覆盖目标行为和验收标准的有效需求时，不得开始产品功能实现，应先记录并确认需求。

## Read Order

已读取且未变化的规则复用上下文，无须每轮重读；文件发生变化、上下文缺失或任务进入新的规则范围时补读。只读取当前任务必需的文档，不默认全量加载 `docs/` 或无依赖关系的模块文档。文档职责、优先级和冲突处理以 [Document Rules](docs/00-governance/DOCUMENT-RULES.md) 为准；`docs/60-human/` 仅用于必要背景，不覆盖正式工程依据。

| 任务 | 必读依据 |
| --- | --- |
| 产品实现或代码/设计评审 | [Architecture](docs/00-governance/ARCHITECTURE.md)、[Engineering Rules](docs/00-governance/ENGINEERING-RULES.md) 与相关 `docs/10-requirements/` |
| 只读治理规则评审 | 被评审规则及其直接引用；涉及架构或工程取舍时补读对应规则，不默认加载产品需求 |
| 文档修改 | [Document Rules](docs/00-governance/DOCUMENT-RULES.md) |
| 协议、事件、配置或数据格式 | 相关 `docs/20-interfaces/` |
| 具体实现方案 | 相关 `docs/30-designs/` |
| 创建、修改或关闭已登记 TODO | [TODO Rules](docs/00-governance/TODO-RULES.md) |
| 验证或交付收口 | [Engineering Rules](docs/00-governance/ENGINEERING-RULES.md) 与相关 `docs/40-readiness/`；涉及文档同步时读取 Document Rules |
| 运行、诊断或发布操作 | 相关 `docs/50-operations/` |
| 创建、修改、审计、执行或收口 RUNBOOK | [RUNBOOK Rules](docs/00-governance/RUNBOOK-RULES.md)，并使用 `.agents/skills/convivium-runbook/` |
| 暂存、提交或提交历史 | [Commit Rules](docs/00-governance/COMMIT-RULES.md) |
| 分支、PR、Review、CI 或合并 | [PR Rules](docs/00-governance/PR-RULES.md) |

## Key Constraints

- 必须遵守 [Engineering Rules 的 Implementation Economy](docs/00-governance/ENGINEERING-RULES.md#implementation-economy)：新增机制必须有当前依据，采用保持必要不变量的最小安全改动，不顺带扩张范围。
- 必须遵守 [Import Paths](docs/00-governance/ARCHITECTURE.md#import-paths) 和 [Public Module Entrypoints](docs/00-governance/ARCHITECTURE.md#public-module-entrypoints)：源码禁止父级相对导入；测试引用源码使用 `@/`；生产代码跨模块只引用登记的公开入口。不得通过禁用 lint、放宽规则或创建转发文件绕过检查。
- 实现前明确业务不变量与反例，测试检查可观察行为；具体要求见 [Engineering Checks](docs/00-governance/ENGINEERING-RULES.md#engineering-checks) 和 [Test Naming](docs/00-governance/ENGINEERING-RULES.md#test-naming)。

## Collaboration

- 保留用户已有改动，不混入与当前任务无关的修改。
- 行为、接口、架构或流程变化时，按 Document Rules 同步对应文档；只提升已确认结论，未决内容留在 `TODO.md` 或 `docs/60-human/`。
- 使用最窄的相关验证，明确未验证边界，不把未执行检查描述为通过。
- 开发改动通过独立分支和 PR 进入 `main`；不自动合并 PR，除非用户明确要求。
- 面向仓库协作者的 review comment、PR review summary 与 review reply 使用中文；代码、协议、类型、字段、错误码、命令和工具名称保留英文原文。
