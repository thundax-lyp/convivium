# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/src/domain/transitions.ts`：实现 Manager planning 启动转换
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 4.1、6.1、8。
  - 确认依据：2026-08-27 用户确认 Meeting 创建后先进入 Manager planning。
  - 处理动作：从合法 `created|waiting` state 创建唯一 `ManagerPlanningAttempt` 和审计事件，并令 `observedMeetingVersion` 等于预期 commit version；outbox 由 Runtime command 原子组装。
  - 验收点：`plugin/tests/unit/domain/transitions.spec.ts` 证明一次版本增长、唯一 active attempt、无 current Turn/Speaker，以及非法状态不产生部分结果。

- [ ] `plugin/src/domain/transitions.ts`：实现 Manager plan 提交转换
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 6.3、7.1、8。
  - 确认依据：2026-08-27 用户确认 Manager plan 到首位 Speaker dispatch 的原子边界。
  - 处理动作：生成已提交 planning attempt、Turn、首个 `SpeakerAttempt` 和事件；required speaker 不可调度时生成完整 `waiting` 结果；repository outbox 由 Runtime command 原子组装。
  - 验收点：`plugin/tests/unit/domain/transitions.spec.ts` 证明只产生首位 delivery descriptor、全部事件共享 commit version，失败分支没有部分 Turn 或 delivery effect。

- [ ] `plugin/src/domain/completion.ts`：实现确定性 Turn 完成判断
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 4.6、6.5、9.2。
  - 确认依据：2026-08-27 用户确认 Turn 完成后确定性判断完成或下一 Turn。
  - 处理动作：仅依据 canonical facts 和 limits 返回 `completed | partial | continue`，业务完成优先于 hard limit。
  - 验收点：`plugin/tests/unit/domain/completion.spec.ts` 覆盖 objective satisfied、开放阻塞项、`max_turns`、message/time limit、完成与限制同时命中的优先级。

- [ ] `plugin/src/domain/transitions.ts`：实现 Speaker 提交与 Turn 推进转换
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 6.4、6.5、7.2。
  - 确认依据：2026-08-27 用户确认逐 Speaker dispatch 与 Turn 生命周期闭环。
  - 处理动作：新增 `submitSpeakerAndAdvanceMeeting()`，在一次版本增长内提交 message、确认 delivery、创建下一 attempt，或收口为 `completed`、`partial`、next planning。
  - 验收点：`plugin/tests/unit/domain/transitions.spec.ts` 证明每次仅有一个 active attempt、committed prefix 单调、limit truncation 正确，duplicate/stale 不重复 transcript。

- [ ] `plugin/src/dsh/session-adapter.ts`：增加受授权的 Manager followup
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 5.1、6.2、7.2。
  - 确认依据：2026-08-27 用户确认使用真实 DSH Manager continuable Session。
  - 处理动作：实现 `followupManagerSession()`，复用 exact parent、ownership、capability 和 followup 前后授权检查；保留原 `deliveryId`。
  - 验收点：`plugin/tests/unit/dsh/session-adapter.spec.ts` 与 `plugin/tests/integration/dsh/session-adapter.spec.ts` 证明错误 parent/ownership、pre-accept stale、post-accept revoke 均 fail closed 且不会重复 followup。

- [ ] `plugin/src/runtime/outbox-worker.ts`：补齐 delivery worker 生命周期与重试分类
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 4.5、5.4、6.2、6.4、7.2。
  - 确认依据：2026-08-27 用户确认逐步调度使用持久 outbox。
  - 处理动作：只对 dispatch callback 标记的 retryable failure 重试，并实现显式 wake、可等待 stop 和 retry exhaustion 诊断；不在 worker 内持有 DSH Agent。
  - 验收点：`plugin/tests/unit/runtime/outbox-worker.spec.ts` 证明串行 claim、原 delivery 重试、确定性失败不重投、耗尽只更新 outbox，stop 后不再 claim/write。

- [ ] `plugin/src/tools/meeting-runtime.ts`：接通 Manager planning 与 plan command
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 6.1、6.2、6.3。
  - 确认依据：2026-08-27 用户确认 `manager` Meeting 不得绕过 Manager planning。
  - 处理动作：创建完成后仅为 `manager` 启动 planning，并实现 `submitManagerPlan()` 的 caller、ownership dispatchability、attempt/version、repository receipt、原子 outbox 和错误映射。
  - 验收点：`plugin/tests/unit/runtime/meeting-runtime.spec.ts` 证明 `manager` 与 `round_robin` 分支隔离、合法 plan 原子产生首个 delivery，不可调度/stale/unauthorized/conflict 返回规定错误。

- [ ] `plugin/src/tools/meeting-runtime.ts` 与 `plugin/src/runtime/turn-runner.ts`：接通逐 Speaker 推进
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 6.4、6.5、8。
  - 确认依据：2026-08-27 用户确认按计划逐 Speaker dispatch，并在 Turn 后判断下一步。
  - 处理动作：从最新 snapshot 构造固定 context，调用统一 Speaker 转换，并在 commit 后 wake 下一 Speaker 或 next Manager planning delivery。
  - 验收点：对应 runtime/turn-runner 单测证明 `A → C → B` 串行、后位 context 含前序已提交 message，终态不再 dispatch。

- [ ] `plugin/src/tools/meeting-runtime.ts` 与 `plugin/src/index.ts`：组装每 Meeting delivery worker
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 5.4、6.2、6.4、9.2。
  - 确认依据：2026-08-27 用户确认逐步调度使用持久 outbox。
  - 处理动作：仅在持有 create caller live parent 时启动唯一 worker；dispatch callback 按 payload `role` 调用 Manager/Participant adapter；Runtime dispose 依次 stop、等待 worker、关闭 repository。
  - 验收点：runtime 与 index lifecycle 测试证明同一 Meeting 最多一个 worker、新 outbox 会 wake、无 live parent 不自动续投、插件卸载后不再 claim/write。

- [ ] `plugin/src/tools/meeting-runtime.ts`：补齐 Manager pause/resume
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 7.3、9.2。
  - 确认依据：2026-08-27 用户确认闭环需要 pause/resume 测试。
  - 处理动作：pause 撤销 active planning attempt 和 pending outbox，resume 从最新事实创建新的 planning attempt、attempt ID 和 delivery ID；保持 `round_robin` 行为不变。
  - 验收点：`plugin/tests/unit/runtime/meeting-runtime.spec.ts` 证明旧 attempt fail closed、resume 不复用 ID，且 pause 不永久 revoke meeting-owned Session capability。

- [ ] `plugin/src/runtime/recovery.ts`：恢复 Manager/Turn 持久状态
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 7.4、9.2。
  - 确认依据：2026-08-27 用户确认闭环需要 restart recovery 测试。
  - 处理动作：`rehydrate()` 只恢复 ready snapshot、receipt、ownership、planning/Turn state 和 pending outbox，并回收 lease；不自动重绑 live parent 或续投。
  - 验收点：`plugin/tests/unit/runtime/recovery.spec.ts` 证明恢复不创建新 plan/attempt、不重复会议事实，无法证明 ownership 时不操作 DSH Session。

- [ ] `plugin/src/projection/status.ts`：保持 Manager planning 状态投影最小化
  - 依据文档：`docs/30-designs/RUNBOOK-MANAGER-TURN-CLOSURE.md` 8、9.1。
  - 确认依据：2026-08-27 用户确认 planning、Turn 和完成判断必须可审计。
  - 处理动作：保持 `MeetingStatusResultV1` 不扩展，planning 时输出 `status = "running"` 并省略 current Turn/Speaker，不暴露 planning attempt 私有细节。
  - 验收点：`plugin/tests/contract/status-projection.spec.ts` 证明 Captain/Manager/Participant projection 合法，且无 Session/capability/outbox/prompt 字段泄漏。

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
