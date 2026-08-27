# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/tests/integration/runtime/vertical-slice.spec.ts`：覆盖 Manager 到下一 Turn 的集成闭环
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 9.2。
  - 确认依据：2026-08-27 用户确认实现第一条真正闭环并补确定性验证。
  - 处理动作：覆盖 Manager plan、`A → C → B` committed prefix、next planning、completed/partial、并发 submit 和 retry exhaustion 的跨模块行为。
  - 验收点：`pnpm test:integration` 通过，且上述分支各有唯一测试用例，不依赖真实 profile 重复证明确定性状态分支。

- [ ] `plugin/tests/recovery/recovery.spec.ts`：覆盖 pause 与 restart recovery
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 7.3、7.4、9.2。
  - 确认依据：2026-08-27 用户确认闭环需要 pause、retry 和 restart recovery 测试。
  - 处理动作：覆盖 pause/resume 新 IDs、pending/leased outbox 恢复、receipt 去重和 stale attempt 隔离。
  - 验收点：`pnpm test:recovery` 通过，恢复不重复 transcript 或 planning；live parent 自动续投明确 Not Covered。

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
