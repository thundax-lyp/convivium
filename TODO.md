# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `docs/40-readiness/MEETINGTASK-HAND-RAISE-EVIDENCE.md`：记录 B 闭环 readiness evidence
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T10
  - 处理动作：记录实际命令、环境、commit 边界、测试/profile 结果、Not Covered 和恢复证据。
  - 验收点：证据可复查，未验证范围未被描述为通过；完成对应实现 commit 时删除本 TODO 项。

- [ ] `plugin/` 全量受影响验证与临时 RUNBOOK 收口：迁移长期结论并删除残留引用
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Independent completion/closure
  - 处理动作：运行最窄测试、`pnpm verify`、package verification 和 profile smoke，确认 readiness 完整后迁移稳定结论并删除 RUNBOOK。
  - 验收点：所有适用 T1–T10 有实际结果，Not Covered 已记录；删除动作进入对应完成 commit，不提前删除未收口 RUNBOOK。

## 待讨论项
