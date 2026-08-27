# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `A5 / plugin terminal-status`：实现 execution-terminal 状态投影
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T4、7；`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md` Authorized status projection
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：只修改 `plugin/src/projection/status.ts` 的 execution-terminal 分支，从 canonical MeetingState 显式映射 termination、decision、未解决事项和正式契约允许的完成依据，不改 active task/HandRaise 分支，不从 transcript 推断完成。
    - 验收点：`pnpm exec vitest run tests/contract/status-projection.spec.ts` 通过，五种执行终态均通过 Schema，且不包含 current Turn、speaker、attempt、Session ID 或 pending HandRaise。

- [ ] `A6 / plugin completion-closure verification`：验证并收口闭环 A
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T5、7—10；`docs/00-governance/TODO-RULES.md`
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：补齐 SQLite 重开、失败回滚、恢复和同 version 竞争测试，先运行 `pnpm test:integration`、`pnpm test:recovery` 再运行 `pnpm verify`，并将环境、命令、结果和 Not Covered 写入 `docs/40-readiness/`；只有实际触及 DSH composition/Session lifecycle 才运行独立 profile smoke。
    - 验收点：恢复得到相同终态、失败无半写入、A/B 同 version 最多一个 Meeting transaction 成功且终态后 B 不新增 Meeting fact；长期结论已迁移，获得提交授权并真正完成时在完成 commit 中删除 RUNBOOK 和 A1—A6 TODO。

## 待审阅任务项

## 待讨论项
