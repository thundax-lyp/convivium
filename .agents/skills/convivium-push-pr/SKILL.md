---
name: convivium-push-pr
description: Human-invoked workflow for publishing completed Convivium branch work as a GitHub Pull Request, including safe branch checks, optional curation of unpublished local commits, CI and review follow-up, and PR closeout. Do not invoke implicitly; do not merge unless explicitly requested.
---

# Convivium Push And PR

将当前已完成的小步工作安全收口为 GitHub Pull Request，并持续处理 PR 上的 CI 与 reviewer 反馈，直到 PR 处于可审状态。

## 授权边界

- `commit`、`push`、创建或更新 PR、回复评论、提交修复和 `merge` 是不同操作；只执行用户明确授权的操作。
- 用户要求 push 或创建/更新 PR 时，可以执行该流程中的必要 `commit`、`push` 和 PR 写操作，但仍不得自动 merge。
- 不要 squash merge；不要把改动直接 push 到 `main`。
- 只有在首次发布前、能够证明尚未发布且用户明确确认后，才可以整理本地 commit 历史；不得隐式 amend、rebase、force push 或改写远端历史。
- 保留用户已有改动；无法判断归属的改动不得混入本 PR。

## 上下文读取

开始前读取：

1. `docs/AGENTS.md`
2. `docs/00-governance/ARCHITECTURE.md`
3. `docs/00-governance/PR-RULES.md`
4. `.github/pull_request_template.md`
5. `.github/workflows/pr-verify.yml`

按实际操作追加最小必要上下文：

- 需要创建 commit、检查 commit message、整理历史，或创建/更新 PR 需要确定标题中的 Project Registry：完整读取 `docs/00-governance/COMMIT-RULES.md`；
- diff 涉及 TODO、RUNBOOK 或任务收口：完整读取 `docs/00-governance/TODO-RULES.md`；
- diff 涉及文档、治理、workflow 或 skill：读取 `docs/00-governance/DOCUMENT-RULES.md`；
- diff 涉及插件实现：按 diff 范围读取相关需求、接口和设计文档。

## 工作流

### 1. 建立发布边界

先检查：

```sh
git status --short --branch
git branch --show-current
git log --oneline --decorate --max-count=12
git diff --stat
git diff --cached --stat
git diff --stat main...HEAD
git remote -v
```

确认当前分支、未提交改动、相对 `main` 的提交和文件范围、upstream/远端同名分支，以及当前分支或相关 commit 是否已有 open PR。其他无关分支和 commit 的 open PR 不计入此判断。工作区有改动时，先区分本任务改动、用户已有改动和归属不明改动。

### 2. 分支安全

- 当前不是 `main`：在当前分支继续。
- 当前是 `main` 且存在可发布的本地领先提交：创建语义清楚的新分支承载它，不 push `main`。
- 当前是 `main` 且没有可发布差异：停止并说明没有可创建 PR 的分支差异。
- 不使用破坏性命令恢复或覆盖用户工作区。

### 3. 首次发布前的 commit 整理

只有在当前分支没有可确认的远端发布边界、当前分支或相关 commit 未进入任何 open PR，且能够证明相关 commit 从未发布时，才评估是否需要整理。这里的 open PR 仅指使用当前分支或包含相关 commit 的 PR；其他人的无关 PR 不影响判断。先识别：

- 过程性实现/review/fix commit 是否共同表达一个最终工程判断；
- 代码、测试、接口和必要文档是否被拆成不可独立验证的片段；
- 不同模块、风险或回滚边界是否被错误混合。

不为减少数量机械 squash。需要改写时，先向用户展示不可改写的远端基线、可整理的 commit 列表、新 commit 顺序及文件归属，并取得明确确认；确认只授权列出的未发布 commit，不授权 force push。整理后逐个检查 commit diff，并确认最终 `main...HEAD` 与预期一致。

### 4. 本地收口与验证

如果 diff 涉及 TODO、RUNBOOK 或任务收口，按 `TODO-RULES.md` 检查收口状态；所有 diff 都要检查文档同步和范围完整性。根据 diff 选择最窄验证：

- 文档、skill、PR 或 workflow：至少运行 `git diff --check`，检查旧路径引用和治理入口；
- 插件改动：按 `plugin/package.json` 运行受影响的 `format:check`、`lint`、`typecheck`、`test`、`build` 或 `verify:package`；
- 跨边界、权限、生命周期或恢复改动：补充对应的运行时/人工验证。

只记录实际执行过的验证。未运行、失败或无法复现的检查必须写入 PR 的 `Not Covered` 或 `Risks`。

### 5. Push 与 PR

- 仅 push 非 `main` 分支；无 upstream 时使用 `git push -u origin <branch>`。
- 当前分支有 open PR 时更新它；没有时创建目标为 `main` 的 PR。只关注当前分支或相关 commit 的 PR，不把无关 PR 当作当前交付的 PR。
- 标题使用 `Type(<project>[/<module>]): <阶段性交付结论>`，其中 project 必须来自已读取的 `COMMIT-RULES.md` Project Registry。
- 描述必须严格使用 `.github/pull_request_template.md` 的当前字段：`Closure`、`Scope`、`Verification Evidence`、`Not Covered`、`Cross-boundary Impact`、`Documentation And Task Closure`、`Risks`。
- PR 描述以最终远端 commit、diff 和 checks 为准；每轮修复 push 后，只在内容、验证、未覆盖项或风险变化时同步更新描述。

### 6. 观察 checks 与评论

PR 创建或更新后观察最多 5 分钟；每 20–30 秒检查 PR 状态、GitHub Actions、review 状态、Codex/reviewer comments 和 check annotations。稳定通过、明确失败或达到时限时结束观察；时限到达不视为失败。

将评论分类为：

- `Actionable`：读取上下文，修复、运行最小验证、提交并 push，然后回复改动和验证结果；
- `Question`：依据当前代码、文档和验证如实解释；
- `Non-actionable`：说明不修改的具体依据，不只回复“done”。

每轮 push 后重新检查 diff、CI 和未处理的 actionable 评论。无法处理的评论要明确记录 blocker 和需要用户决策的内容。

## 完成标准

只有在以下事实都确认后才报告 PR 已收口：

- 工作区干净，非 `main` 分支已 push；
- PR 已创建或更新并有 URL；
- 标题和描述符合当前模板及 PR 规则；
- 本地验证已运行，或未运行原因已记录；
- checks 已通过，或明确说明仍在运行/失败及下一步；
- actionable 评论已处理并回复，或明确列出剩余项；
- TODO、RUNBOOK 和文档同步已收口，或剩余风险已写入 PR。

不要把工程骨架的 build/typecheck 通过描述为会议能力已完成。

## 输出格式

```md
## PR closeout summary

* Branch:
* PR:
* Push status:
* Checks:
* Codex/reviewer comments:
* Local verification:
* Documentation/TODO/RUNBOOK closure:
* Remaining risks:
* Next action:
```
