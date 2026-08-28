# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `plugin/src/runtime/archive.ts`：物化 `ArchivePackage` 白名单快照
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：从 execution-terminal `MeetingState` 深复制现有 `ArchivePackage` 的全部白名单字段并排除私密 Session 数据。
  - 验收点：单元测试证明 package 覆盖正式 transcript、completion、proposal/decision、未解决事项与 provenance，且序列化结果不含私聊、Session/capability、prompt 或运行配置。

- [ ] `plugin/src/runtime/archive.ts`：构造并校验 expected ownership set
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：以 Meeting manager、participants、Captain parent 与 `session_ownership` 构造 Manager 加全部 Participants 的唯一 identity tuple 集合。
  - 验收点：缺失、重复、额外、team/meeting/parent/label/provider/role/participant 不一致均拒绝 cleanup 并保持 `archiving`。

- [ ] `plugin/src/tools/meeting-runtime.ts`：验证内部 termination archive authorization
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：为 `internal_archive_begin` 与 `internal_archive_finalize` 校验从 `meetingId + termination` 派生的 request、caller binding 和 capability identity。
  - 验收点：匹配 terminal/archive state 的内部命令可进入 repository transition；伪造 identity、错误状态或普通外部 caller 全部拒绝，且不新增公开 tool 或 route。

- [ ] `plugin/src/runtime/archive.ts`：提交 terminal 到 `archiving` 的内部事务
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：使用既有 `repository.execute()`、`transitionMeeting(..., 'archiving')` 和 materialized package 写入 begin receipt。
  - 验收点：一次提交原子写 state、`meeting.archiving` 和 receipt；重放返回原 receipt；失败不产生 DSH effect 或 outbox。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 archive direct-child ownership proof
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：以 rc.2 `listChildren(parentSessionId, signal)` 比对 expected ownership 的 direct child、mode 与 label。
  - 验收点：diagnostic、missing、unowned child、wrong parent 或 label mismatch 阻断 DSH effect；`listDescendants` 不产生 cleanup target。

- [ ] `plugin/src/runtime/archive.ts`：持久 revoke 后执行 interrupt 与 drain
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：逐条复用 `recordSessionOwnership(... revoked)`，全部提交后调用既有 `interruptAndDrainOwnedSessions`。
  - 验收点：fake runtime 断言调用顺序为 revoke → interrupt → drain；interrupt 不等待；drain reject/timeout 保持 `archiving` 且没有 `closed` 写入。

- [ ] `plugin/src/runtime/archive.ts`：在 drain fulfilled 后关闭 ownership
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：用 effect 前 proof tuple 与恢复 ownership 对账后，复用 `recordSessionOwnership(... revoked, closed)` 写 lifecycle。
  - 验收点：tuple 漂移或 capability 非 revoked 时不写 closed；drain fulfilled 且 tuple 不变时 closed 成功，durable child 仍被列举不构成失败。

- [ ] `plugin/src/domain/transitions.ts`：提交 archive finalize 事件序列
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：在 complete expected set 的 `archiving -> archived` transition 返回既有 `meeting.archived` 与 `archive.sessions_closed`。
  - 验收点：任一 ownership 非 `revoked+closed` 时不写 archived；成功事务不新增 outbox 或未登记事件类型。

- [ ] `plugin/src/runtime/archive.ts`：提交 archive finalize receipt
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：使用既有 `repository.execute()` 和 `internal_archive_finalize` 派生 identity 写入 `archivedAt` 与 finalize receipt。
  - 验收点：相同 finalize identity 重放原 receipt；package 不重物化；错误 termination identity 或不完整 ownership 不改变 state。

- [ ] `plugin/src/runtime/recovery.ts`：接入 terminal 与 archiving 的 archive recovery
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：在单 Meeting `recover()` 后按 terminal→begin、archiving→cleanup/finalize、archived→read-only 的固定路径调用 archive coordinator。
  - 验收点：每个 begin/revoke/interrupt/drain/close/finalize crash boundary 可重入；无 parent/runtime 时保持可读 `archiving` 并走既有 `503 + Retry-After` recovery-not-ready 语义。

- [ ] `plugin/src/tools/meeting-runtime.ts`：收紧 terminal/archive dispatch gate
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：在 `dispatchInitialDelivery()`、`dispatchManagerPlanningDelivery()`、`dispatchMeetingTaskDelivery()` 与 `ensureWorker()` callback 使用最新 state、attempt/delivery 与 capability 做前后复核。
  - 验收点：archiving/archived 与 execution terminal 的迟到 dispatch/completion 不产生 task、raise、transcript、decision、completion fact、event、receipt 或 outbox 领域事实。

- [ ] `plugin/src/projection/status.ts`：补 archive 四阶段 projection contract fixture
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：保持现有 projection 实现，仅为 archiving/archived 添加 status fixture contract coverage。
  - 验收点：`pauseControl.action='none'`，无运行态字段；archiving 有 package 且无 `archivedAt`，archived 有 `archivedAt`；archiving 不返回 503。

- [ ] `plugin/tests/unit/runtime/archive.spec.ts`：覆盖 materialization、identity 与 cleanup 调用顺序
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：新增纯 unit cases 覆盖 package 白名单、expected set 和 revoke/interrupt/drain 顺序。
  - 验收点：成功、wrong parent/team/label、diagnostic、drain reject 和 durable child remains listed 均有确定断言。

- [ ] `plugin/tests/integration/runtime/archive-lifecycle.spec.ts`：覆盖 begin、close、finalize 与 terminal race
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：新增 repository/runtime integration cases 覆盖 receipt replay、ownership close、archived guard 和 late delivery。
  - 验收点：completed task 保留、non-terminal task 取消、late command/delivery 零领域事实、archived 只在完整 ownership set 后出现。

- [ ] `plugin/tests/recovery/archive-recovery.spec.ts`：覆盖 archive 外部副作用断点恢复
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：新增 begin、每条 revoke、interrupt、drain、post-drain 对账、close 与 finalize 前后 crash cases。
  - 验收点：恢复不重物化 package、不提前 closed/archived，只重试仍有 ownership proof 的安全步骤。

- [ ] `plugin/tests/contract/status-projection.spec.ts`：覆盖 archive status public contract
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：新增 archiving/archived schema validation 与隐私字段排除 cases。
  - 验收点：公开 projection 不含 Session ID、capability、私密内容或运行配置。

- [ ] `plugin/tests/integration/dsh/archive-profile.spec.ts`：验证 rc.2 profile archive lifecycle
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：在独立 `spawn` profile 创建 owned children、执行 archive、重启 profile。
  - 验收点：drain 已释放 resident Activation、ownership closed、durable child 可保留并可枚举、旧 Session 不能 followup/dispatch/resume 或参与会议。

- [ ] `docs/40-readiness/ARCHIVE-SESSION-LIFECYCLE-EVIDENCE.md`：记录归档验证证据
  - 依据文档：`docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：记录 revision、环境、验证命令、测试结果、profile smoke 与 Not Covered。
  - 验收点：证据包含 Scope、Validated Contract、Executed Validation、Not Covered、Closure，且未把未运行验证描述为通过。

- [ ] `docs/30-designs/RUNBOOK-ARCHIVE-SESSION-LIFECYCLE.md`：完成归档 RUNBOOK 收口
  - 依据文档：`docs/00-governance/TODO-RULES.md`
  - 确认依据：2026-08-28 用户委派；仅登记待审阅任务，未授权实现
  - 处理动作：在实现、测试、profile smoke、readiness 与长期文档迁移完成后删除临时 RUNBOOK 及引用。
  - 验收点：关闭变更中无未覆盖实现项；长期设计、接口与 readiness 真相源可定位。

## 待讨论项
