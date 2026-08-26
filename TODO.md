# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/`：执行最终全量验证并检查清理
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T8
  - 处理动作：运行 format、lint、双 program typecheck、unit、contract、integration、recovery、build、package verifier 和 profile smoke，检查 `git diff --check` 与工作区。
  - 验收点：所有必选检查通过；临时进程/目录已清理；只有真正完成的 TODO 才能在对应 commit 中删除。

## 待审阅任务项

## 待讨论项
