# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `A1 / plugin completion-end protocol`：补齐闭环 A 的最小正式契约
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T1、T4；`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：先运行 `plugin/` 下的 `pnpm verify:environment` 和 `pnpm verify:contract`，再只修改协议文档及 `plugin/src/protocol/`，使 completion claims、end input/result、错误码和 terminal status 的文档、类型、Schema 一致；若完成依据需要新增 canonical domain 字段则停止并记录缺口。
    - 验收点：`pnpm exec vitest run tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts` 和 `pnpm verify:contract` 通过，且未新增 TeamTask、HandRaise 或 Archive 接口。

- [ ] `A2 / plugin completion domain`：实现 CompletionFact 校验与确定性完成判断
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T2、6.1；`docs/30-designs/DOMAIN-MODEL-DESIGN.md` CompletionFact
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：只修改 `plugin/src/domain/model.ts`、`completion.ts` 和 `transitions.ts`，补齐 canonical CompletionFact，并校验 output、criterion、review、question、agenda、risk claim 的对象、状态、authority 和 message evidence；合法 claim 生成不可变事实，非法 claim 整体失败，且不得由 claim 自动派生 partial、no_consensus 或 cancelled。
    - 验收点：`pnpm exec vitest run tests/unit/domain/completion.spec.ts tests/unit/domain/transitions.spec.ts` 通过，并覆盖合法 claim、无效或跨 Meeting ID、旧 revision、无证据、无 authority、事实替代和 objective 未满足。

- [ ] `A3 / plugin submit-turn completion`：将 completion claims 接入既有原子提交
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` 4.1、T3、T4、6.1
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：新增最小 `plugin/src/runtime/task-evidence.ts`，并只修改 `submitTurn` completion 分支，在现有 `MeetingRepository.execute()` 的同一锁定 snapshot 内校验真实 Participant caller、evidence 和 CompletionFact；默认 resolver 对非空 `taskIds` 返回 `UNSUPPORTED_CAPABILITY` 且零副作用，其他未实现 `changes` 继续拒绝。
    - 验收点：`pnpm exec vitest run tests/unit/runtime/meeting-runtime.spec.ts tests/contract/meeting-runtime.spec.ts` 通过，并证明越权或非法 claim 不写 transcript、fact、event 或 receipt，相同请求不重复写入，resolver 与 commit 不存在 TOCTOU。

- [ ] `A4 / plugin captain-end`：实现 Captain 结束事务与活动执行收口
    - 依据文档：`docs/30-designs/RUNBOOK-COMPLETION-CLOSURE.md` T2、T3、6.2；`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md` Completion And Termination
    - 确认依据：2026-08-27 用户确认闭环 A RUNBOOK 待执行；`codex://threads/01a04210-fa01-7091-b554-4c94a5cf0186`
    - 处理动作：只修改 completion/end 相关 domain、runtime 和 tool 分支，注册 `convivium_end_meeting`，并通过唯一 `MeetingRepository.execute()` 校验真实 Captain、version、outcome、完成条件和 Meeting 内引用，原子提交 termination/event/version/receipt、撤销活动 attempt、截断 Turn 并使旧 dispatch 授权失败；不得读取、取消或转移 TeamTask。
    - 验收点：`pnpm exec vitest run tests/unit/domain/transitions.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/repository.spec.ts` 通过，并覆盖四种 outcome、权限、version conflict、幂等、跨 Meeting 引用、事务回滚和终态后写入拒绝。

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
