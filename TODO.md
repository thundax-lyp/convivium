# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `A6 / plugin A-B integration closure`：完成闭环 A/B 集成竞争并删除临时 RUNBOOK
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T5、7—10；`docs/00-governance/TODO-RULES.md`
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：闭环 B 实现可用后，在集成分支运行真实 task association/snapshot、HandRaise、Manager planning 与 Captain end 的同 version 竞争和终态后拒绝测试，复核共享热点 diff，并更新 completion readiness 证据；不得用当前通用 Meeting fact 模拟测试冒充真实 B 集成。
    - 验收点：同 version 最多一个 Meeting transaction 成功，Captain end 成功后 B 不新增 Meeting fact、HandRaise 或 planning；长期结论迁移完成，并在最终收口 commit 中删除本 TODO、`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` 及残留引用。

## 待审阅任务项

## 待讨论项
