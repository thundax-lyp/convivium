# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下 FR-10 任务按 T0 → T8 顺序执行，前一步 PASS 才能开始下一步。2026-09-07 用户明确要求“依次执行TODO LIST，一任务一删除一提交”；执行、逐项删除与逐项 commit 已获授权。允许文件、命令、PASS/STOP 和恢复方式以 RUNBOOK 对应步骤为准，不在此复制方案。

- [ ] `FR-10 / T8 / 验证与收口`：完成整项验收并迁移证据
    - 依据文档：[RUNBOOK T8](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t8完整验证证据与删除)、[TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交；push/PR/merge 未授权。
    - 处理动作：T7 PASS 后，完成完整 verify、固定回归集、Browser 观察与 Restore，迁移长期文档和证据，再按规则更新覆盖并清理临时任务。
    - 验收点：V1–V15 与 R1–R11 按规定证据口径收口；保留邮件增量跨层动态场景等 Not Covered；全部门禁通过才提升 FR-10、删除 RUNBOOK 及其任务引用；删除后链接与 diff 检查通过。仅关闭真正完成的 TODO，部分完成时收窄剩余范围。

## 待审阅任务项

## 待讨论项
