# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/package.json`：接入分层 Runtime 验证入口
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T7/T8
  - 处理动作：让默认 `verify` 确定性覆盖 format/lint/typecheck/tests/build/package checks；增加独立 `smoke:profile`，并可增加显式 `verify:runtime` 顺序组合两层。
  - 验收点：`pnpm verify` 不要求模型凭据且不使用空测试占位；`pnpm smoke:profile`/`verify:runtime` 不隐藏外部验证失败。

- [ ] `docs/40-readiness/`：记录 DSH Runtime 竖切 readiness 证据
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`、`docs/40-readiness/CONVIVIUM-FRAMEWORK-EVIDENCE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T8
  - 处理动作：记录 DSH、provider、profile、Node、pnpm、package version、commit、命令结果和未覆盖边界。
  - 验收点：RUNBOOK 验证矩阵逐项有证据；TeamTask、mail、archive、完整 UI 等仍标为 `Not Covered`。

- [ ] `plugin/`：执行最终全量验证并检查清理
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T8
  - 处理动作：运行 format、lint、双 program typecheck、unit、contract、integration、recovery、build、package verifier 和 profile smoke，检查 `git diff --check` 与工作区。
  - 验收点：所有必选检查通过；临时进程/目录已清理；只有真正完成的 TODO 才能在对应 commit 中删除。

## 待审阅任务项

## 待讨论项
