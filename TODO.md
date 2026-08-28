# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `plugin/src/protocol/types.ts`、`plugin/src/protocol/results.ts`：将 `MeetingTaskFinishResultV1.handRaiseId` 改为 optional
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T1 已锁定该兼容修正
  - 处理动作：保持 protocol version 和 DTO 不变，规定 completed 必须返回 `handRaiseId`，failed 成功省略该字段。
  - 验收点：protocol types、result schema 和 contract test 接受 failed 无 `handRaiseId`，拒绝 completed 缺少该字段；无新增 DTO/version。

- [ ] `plugin/src/domain/model.ts`：补齐 MeetingTask source binding 字段
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK 数据结构契约
  - 处理动作：增加 `sourceTurnId`、`sourceStepId`、`sourceContextFromSeq`、`sourceContextThroughSeq` 及 queued 后写入的 `sourceMessageId`、`sourceMessageSeq`，保持 SpeakerAttempt 与 MeetingTaskSnapshot 不变。
  - 验收点：requested 不含 formal message binding；queued/running/terminal 均具备 immutable source binding；旧 MeetingState read compatibility 通过。

- [ ] `plugin/src/domain/meeting-task.ts`：实现 MeetingTask 字段时点与基础状态转换
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T2/T3
  - 处理动作：固定 create、queue、start、finish、cancel 的输入/输出 shape、状态前置条件和既有 task event。
  - 验收点：重复、foreign、错误状态和 terminal 调用返回唯一协议映射所需的领域结果，失败不产生 state/event effect。

- [ ] `plugin/src/domain/hand-raise.ts`：实现 task-linked HandRaise 校验与去重
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T3
  - 处理动作：校验 participant/task identity，禁止 failed task 形成完成型 HandRaise，保持 pending raise 去重和单次 consume。
  - 验收点：错误 participant、重复 execution、failed task、terminal task 均无 raise；合法 completed task 只形成一个 pending raise。

- [ ] `plugin/src/domain/transitions.ts`：在 originating short submit 中原子绑定 source 并排队任务
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T4
  - 处理动作：在既有 `submitSpeakerAndAdvanceMeeting` transition 中写 formal message、补 source binding、调用 `queueMeetingTasks`、写既有 dispatch outbox 并释放 attempt。
  - 验收点：同一 `repository.execute()` 提交 message/source/queued/outbox；提交前或 rollback 后四者均不存在；不新增写入口。

- [ ] `plugin/src/runtime/task-evidence.ts`：实现 ephemeral AuthorizedTaskEvidence resolver
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK 数据结构与 T5
  - 处理动作：按 meeting、participant、task、attempt、execution、source message、context bounds、completed result 和 finishedAt 生成精确 evidence shape。
  - 验收点：resolver 只读同一锁内 MeetingState；taskId-only、finishedAt-only、foreign、缺 source 和迟到 execution 全部拒绝；不持久化 evidence 或 observedMeetingVersion。

- [ ] `plugin/src/domain/completion.ts`、`plugin/src/domain/transitions.ts`：将 completion claim 的 taskIds 解析到锁内 evidence
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T5
  - 处理动作：让 taskIds 只解析当前 meeting/participant/attempt 的 completed task，并调用 evidence resolver；保留 required review 和 CompletionFact 规则。
  - 验收点：完整 identity/source 匹配才可形成 claim 输入；completed task 不自动变为 accepted 或 Meeting completed。

- [ ] `plugin/src/tools/meeting-runtime.ts`：接入 startMeetingTask 的 caller、execution 和 terminal guard
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T6/T7
  - 处理动作：复用现有 Participant Session ownership、receipt、expected version 和 `repository.execute()`，只允许 queued task start。
  - 验收点：错误 caller/task、重复 start、execution terminal、archiving、archived 均返回唯一 `ProtocolErrorV1` 映射并零领域写入。

- [ ] `plugin/src/tools/meeting-runtime.ts`：实现 completed finish 与 HandRaise 的同事务提交
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T6
  - 处理动作：在同一 `finish_meeting_task` transaction 调用 finish transition 和 createHandRaise；completed 返回 handRaiseId，failed 不创建 HandRaise 且省略 handRaiseId。
  - 验收点：提交前 task/raise 均不存在，提交后 completed task/raise 同时存在；failed 只写 failed task/result，不写 HandRaise。

- [ ] `plugin/src/domain/planning.ts`：消费 task-linked HandRaise 并保持确定性候选规则
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T7
  - 处理动作：复用 pending HandRaise consume、candidate priority 和 active-task 排除，创建后续 SpeakerAttempt。
  - 验收点：未选中的 raise 保持 pending，选中的 raise 只消费一次；HandRaise 不写 transcript、decision 或 CompletionFact。

- [ ] `plugin/src/domain/transitions.ts`：补齐 execution terminal、archiving、archived 的 task/planning guard
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T7
  - 处理动作：仅依据当前 main 状态类型和本线 fixture，在 start/finish/raise/planning 入口统一拒绝不可写阶段。
  - 验收点：每类阶段及并发迟到调用均返回 `INVALID_STATE_TRANSITION`、`retryable: false`，不写 state/event/receipt/outbox/transcript；不实现 C 的 revoke/drain/close。

- [ ] `plugin/src/tools/register-tools.ts`：同步现有 task tool 的 result/error registration
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Required File Changes
  - 处理动作：接入 optional handRaiseId 的现有 finish result 和既有错误映射，不新增 tool、command 或公开字段。
  - 验收点：注册 contract 与 runtime 返回 shape 一致，既有 caller binding、commandKind 和 request hash 不变。

- [ ] `plugin/tests/unit/domain/meeting-task.spec.ts`：覆盖 task 字段时点与状态失败路径
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Test Matrix
  - 处理动作：增加 requested source 缺失、submit queue source 完整、wrong execution、重复和三类 terminal guard cases。
  - 验收点：每个失败 case 断言 state、event 和派生副作用不变。

- [ ] `plugin/tests/unit/domain/hand-raise.spec.ts`：覆盖 failed finish、raise 去重和 planner consume
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Test Matrix
  - 处理动作：增加 `does not raise for failed finish` 和 task execution identity 去重/单次消费测试。
  - 验收点：failed、foreign、duplicate 和 terminal 输入不产生额外 HandRaise 或 transcript。

- [ ] `plugin/tests/unit/domain/completion.spec.ts`：覆盖 locked task evidence 与 claim acceptance 边界
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Test Matrix
  - 处理动作：测试完整 execution/source 匹配、taskId-only、finishedAt-only、缺 source 和 required review 未通过。
  - 验收点：只有授权 evidence 可进入 claim；task completed 不直接产生 accepted output 或 Meeting completion。

- [ ] `plugin/tests/contract/meeting-runtime.spec.ts`：覆盖 runtime 原子性、权限、幂等和错误 DTO
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T4/T6/T8
  - 处理动作：增加 short submit rollback、completed finish/raise、failed optional result、wrong caller/execution、duplicate request 和 version conflict cases。
  - 验收点：每个失败场景使用唯一 protocol code/retryable；无多余 receipt/event/outbox/transcript。

- [ ] `plugin/tests/contract/protocol-schema.spec.ts`：验证 optional handRaiseId 和公开 DTO 边界
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T1/Test Matrix
  - 处理动作：增加 failed result 无 `handRaiseId`、completed result 必须有 `handRaiseId` 的 schema cases。
  - 验收点：同一 protocol version 通过，未新增 execution/source/internal evidence 字段。

- [ ] `plugin/tests/contract/status-projection.spec.ts`：验证公开 projection 保留正式字段且隐藏内部字段
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK projection boundary
  - 处理动作：断言 `finishedAt`、`resultSummary` 按正式 Interface 保留，execution/source/context/evidence/授权判定不泄露。
  - 验收点：projection contract 通过且不新增 DTO/version。

- [ ] `plugin/tests/recovery/recovery.spec.ts`：验证任务绑定、finish/raise 和迟到结果恢复
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T8/Test Matrix
  - 处理动作：覆盖 create 后 submit 前、short submit 前后、finish transaction 前后、重启后 evidence 和 terminal guard。
  - 验收点：恢复不产生半提交状态、重复 fact 或迟到 task result。

- [ ] `plugin/scripts/smoke-profile.mjs`：加入真实 task finish→raise→later submit_turn 场景
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T9
  - 处理动作：在现有 current Speaker submit 后、profile 收尾前插入真实 Participant continuable Session task flow，不改 profile 基础设施。
  - 验收点：独立 profile 观察 start、finish、pending HandRaise、后续正式 submit_turn 和 evidence 引用；失败执行 Prepare→Execute→Assert→Restore。

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
