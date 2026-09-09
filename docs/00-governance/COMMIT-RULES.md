# Commit Rules

## Purpose

本文档定义 Convivium 的提交授权、Commit 边界、消息格式、验证、TODO 同步和历史修改规则。

Commit 用于记录一个明确的工程判断或小步能力变化，不代表阶段性交付完成。阶段性交付、Review、CI 和合并规则由 `PR-RULES.md` 定义。

## Authorization

- 修改完成后默认保留在工作区；只有用户明确要求“提交”时，才执行暂存和 commit。
- 暂存、commit、push、创建 PR 和合并 PR 是不同操作，不能从单项授权推断用户未表达的其他操作。用户可以在一句请求中同时授权多项操作；已明确的组合授权持续有效，不逐步重复确认。
- 用户只要求修改、检查或验证时，不得自动 commit。
- 用户明确要求提交时，只提交当前任务范围内的文件，不纳入无关或归属不明的工作区改动。

## Commit Boundary

- 一个 commit 表达一个可以用一句话说明的工程判断、小步能力变化、测试锁定、配置装配或文档规则落点。
- 同一判断需要的代码、测试、接口契约、配置和文档应放在同一个 commit。
- 不同判断、独立风险或可以单独回滚的变化应拆成不同 commit。
- Commit 可以是阶段任务的中间判断，但必须语义明确、范围可解释，并且不故意留下不清楚的破坏状态。
- 不为了减少 commit 数量机械 squash。
- 不为了追求小文件数拆出无法独立理解或验证的中间状态。
- 文件数量只用于帮助检查内聚性，不作为机械拆分或合并标准。
- 不混入与当前任务无关的格式化、重构、临时文件或用户已有改动。

## Commit Message

Commit message 使用：

```text
Type(<project>[/<module>]): <中文工程判断>
```

当前可用示例：

```text
Docs(repo/governance): 分离 Commit 与 PR 治理规则
CI(repo/pr): 建立无代码阶段治理门禁
```

要求：

- `Type` 准确表达 `Feat`、`Fix`、`Docs`、`Test`、`Refactor`、`CI` 等变化类型。
- `<project>` 必须从本文的 Project Registry 中选择，不能使用临时简称、业务域或自由文本。
- `<module>` 可选，用于定位已登记工程内部的稳定模块、工作流或治理域；不能替代 `<project>`。
- 中文说明必须表达本次形成的工程判断或能力结果，不使用“调整”“修改”“优化”等无法独立解释结论的描述。

## Project Registry

`<project>` 是固定标识，不是提交者临时决定的 scope。每个独立构建、测试或交付的工程在结构确认后登记一个唯一名称，并与实际工程目录或 workspace 一一对应。

| `<project>` | 对应范围 | 使用边界 |
| --- | --- | --- |
| `repo` | 仓库根治理、文档、CI 和公共工程配置 | 不用于某个具体应用或服务内部实现 |
| `plugin` | `plugin/` 下可独立构建、测试和交付的 Convivium DSH 插件 | 插件源码、资产、package 配置和插件内验证 |
| `cross-project` | 无法安全拆分的多工程原子判断 | Commit body 必须列出涉及的已登记工程 |

注册规则：

- 新建独立工程时，必须在同一工程初始化判断中把其固定名称加入本表。
- 名称应与实际顶层工程目录、workspace 或 package 的稳定名称一致。
- 同一个工程不得同时使用简称、旧名和业务别名。
- 业务域不等于工程名；业务域应放在 `<module>` 或中文工程判断中。
- 工程重命名时，必须同步更新本表、构建配置、CI 和相关治理文档。
- 未登记的 `<project>` 不得出现在 commit message 中。

跨工程且不可拆分的 commit 使用：

```text
Type(cross-project): <中文工程判断>

Projects: <project-a>, <project-b>
Decision: <为什么这些工程必须作为一个原子判断一起变化>
Verification: <覆盖各工程及跨工程契约的验证>
```

能够按工程独立理解、验证和回滚的变化不得使用 `cross-project`，应拆成多个 commit。

## Before Commit

提交前必须：

1. 检查 `git status` 并阅读完整待提交 diff，确认仅包含当前任务改动，无凭据、临时数据或无关个人路径。
2. 确认满足 [Engineering Rules](./ENGINEERING-RULES.md#validation-and-evidence) 的相关验证与证据要求；适用证据可以复用，不要求仅因 commit 再运行相同检查。
3. 按下节核对文档和已登记任务同步；明确本 commit 的工程判断，不能把未完成范围描述为完成。

## TODO And Document Sync

文档同步按 [Document Rules](./DOCUMENT-RULES.md#document-sync)。涉及已登记 TODO 时，按 [TODO Closure Rules](./TODO-RULES.md#closure-rules) 在完成该项的 commit 中删除或收窄；涉及 RUNBOOK 时按其 [Completion And Deletion](./RUNBOOK-RULES.md#completion-and-deletion) 处理。未涉及的项目不新增检查记录或文档。

## History Safety

- 不自动 amend、rebase、squash 或重写已有 commit；只有用户明确要求时才能修改历史。
- 不重写已经发布到远端或进入协作范围的历史，除非用户明确确认具体范围和风险。
- 需要更新已发布历史时，只使用安全的 lease 保护方式，不使用无保护的 force push。
- 不使用破坏性命令丢弃用户提交、工作区改动或未跟踪文件。
