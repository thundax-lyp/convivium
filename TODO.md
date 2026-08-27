# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/scripts/smoke-profile.mjs`：验证真实 DSH Manager 闭环
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 9.3、10、11。
  - 确认依据：2026-08-27 用户要求补真实 DSH profile 验证。
  - 处理动作：用隔离 profile 和 `spawn` provider 跑一个 `manager`、`maxTurns = 2` 的 `A → C → B → next planning` 代表路径，并精确清理临时资源。
  - 验收点：`pnpm smoke:profile` 和 `pnpm verify:runtime` 通过；输出证明真实 Session 顺序、transcript seq、next planning 与 host 正常停止。

- [ ] `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`：记录验证并收口 RUNBOOK
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 11、12；`docs/00-governance/TODO-RULES.md` Closure Rules。
  - 确认依据：2026-08-27 用户确认以 Manager planning 和 Turn 生命周期闭环为目标。
  - 处理动作：记录 commit、环境、命令、结果和 Not Covered；迁移长期结论，删除已完成 RUNBOOK 及残留引用。
  - 验收点：readiness 准确区分已验证范围与 timeout、live parent 自动续投、TeamTask/mail/archive/UI 等未覆盖项，工作区无残留 RUNBOOK 引用。

## 待审阅任务项

## 待讨论项
