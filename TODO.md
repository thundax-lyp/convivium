# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

以下任务按编号顺序执行。`F2.1` 与 `F2.2` 可在 `F1.4` 完成后分别实施，但 `F2.3` 必须等待两者完成；其他任务不得跳过前置项。每项只完成列出的主要目标，不顺带实现会议业务。

- [ ] `F5.2 / framework task closure`：迁移长期结论并清理 RUNBOOK 和已完成 TODO
    - 依据文档：`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md` §11；`docs/00-governance/TODO-RULES.md`
    - 前置任务：`F5.1`
    - 关联文件：`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/RUNBOOK-IMPLEMENT-CONVIVIUM-FRAMEWORK.md`、`TODO.md`
    - 处理动作：确认长期判断已有正式归属；在真正完成任务的 commit 中删除 RUNBOOK 和对应已完成 TODO。
    - 验收点：最终 HEAD 不包含临时 RUNBOOK、已完成 TODO、构建产物、临时 profile、测试数据库、绝对路径或凭据；`git diff --check` 通过。
    - 主验证：`git status --short`、`git diff --check`，并搜索 RUNBOOK 残留引用。
    - 停止条件：存在未完成任务时只收窄 TODO；不得提前删除 RUNBOOK 或把未验证工作描述为完成。

## 待讨论项
