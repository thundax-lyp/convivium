# RUNBOOK：MeetingTask 证据回流与再次发言

状态：执行前最终规格；本文件不声明实现已完成。

## Purpose

B 从当前 `origin/main` 独立实现最小闭环：当前 Speaker 创建 `MeetingTask`，合法短 `submit_turn` 释放发言权并原子排队任务；原 Participant continuable Session 完成任务后，在同一 `repository.execute()` 中提交 terminal result 和 completed task 的 HandRaise；后续正式发言只能消费锁内复核的授权 task evidence。MeetingTask completed 不等于 output accepted、议题解决或 Meeting completed。

## Scope And Non-goals

本线保证 task/HandRaise/evidence 的最小成功路径，以及错误 caller、错误 execution、重复命令、终态竞争、迟到结果、恢复和必要事务边界。B 可以在本 PR 最小修改闭环所需共享 seam；共享文件只增加 review 风险，不构成实施许可依赖。

明确不实现：HTTP route、Plugin Client、Mail、Archive coordinator、Session close、capability revoke、DSH TeamTask/Agent Teams adapter、Proposal/Decision 新操作、DSH Session Event、自定义 worker、task table、migration、new outbox kind、new adapter，以及外部副作用 exactly-once。`archiving`/`archived` 只使用当前 `main` 的状态类型和本线 transition guard fixture；C 的 revoke/drain/close 不属于本线。

## Current Basis

- FR-5/FR-8 与验收标准要求短提交释放发言权、任务复用创建者 continuable Session、完成后可申请后续发言；完成事实仍须经过现有 required review、CompletionFact 和 Captain end 规则。
- `AGENT-MEETING-PROTOCOL-INTERFACE.md` 的现有 MeetingTask、HandRaise、TurnSubmission 和 completion claim DTO 是公开边界；本 RUNBOOK 不增加操作或 projection 字段。
- `MeetingState`、`meeting_events`、receipt、`dispatch` outbox 和 `repository.execute()` 是事实源与原子写入边界；公开 projection 不是事实源。
- 正式 `MeetingTaskProjectionV1` 保留 `createdAt`、`queuedAt`、`startedAt`、`finishedAt`、`resultSummary`；内部 evidence 不进入该 projection。

## Data Structure Contract

### MeetingTask

`plugin/src/domain/model.ts` 的 `MeetingTask` 采用以下 shape；除标明 optional 的字段外均 required：

```ts
interface MeetingTask {
  meetingTaskId: string;
  participantId: string;
  originatingSpeakerAttemptId: string;
  executionId: string;
  deliveryId: string;
  title: string;
  description: string;
  blocking: boolean;
  status:
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  sourceTurnId: string;
  sourceStepId: string;
  sourceContextFromSeq: number;
  sourceContextThroughSeq: number;
  sourceMessageId?: string;
  sourceMessageSeq?: number;
  resultSummary?: string;
  failureReason?: string;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}
```

字段时点固定如下：

| 状态                             | 必须存在                                                                                                                      | 规则                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `requested`                      | identity、`createdAt`、originating attempt、`sourceTurnId`、`sourceStepId`、`sourceContextFromSeq`、`sourceContextThroughSeq` | `sourceMessageId`/`sourceMessageSeq` 不存在；不生成 formal-message-bound evidence、dispatch 或消费任务 |
| `queued`                         | requested 全部字段，加 `sourceMessageId`、`sourceMessageSeq`、`queuedAt`                                                      | source 字段不可变；由 originating short `submit_turn` 同事务写入                                       |
| `running`                        | queued 全部字段，加 `startedAt`                                                                                               | 仅 owning Participant Session 可 start                                                                 |
| `completed`/`failed`/`cancelled` | 前态 immutable 字段，加 `finishedAt`；completed 有非空 `resultSummary`，failed 有非空 `failureReason`                         | terminal 字段和 source binding 不可变；failed/cancelled 不生成 completed evidence                      |

`sourceTurnId`、`sourceStepId` 和 context bounds 在 create 时从当前 SpeakerAttempt/Turn/Step 固化；`sourceMessageId` 与 `sourceMessageSeq` 只在 originating short `submit_turn` 生成正式 message 后写入。`MeetingTask` 是唯一 task canonical fact。

`SpeakerAttempt` 不改。`MeetingTaskSnapshot` 不改，仍是 `taskSnapshot(state, meetingTaskId, now)` 产生的只读观察值，不承载 source binding、execution identity 或 evidence 授权。公开 `MeetingTaskProjectionV1` 不扩字段。

### AuthorizedTaskEvidence

`plugin/src/runtime/task-evidence.ts` 定义以下 ephemeral resolver 输出；不是新的持久化实体，字段均来自同一 `repository.execute()` 锁内的当前 `MeetingState`：

```ts
interface AuthorizedTaskEvidence {
  meetingId: string;
  participantId: string;
  meetingTaskId: string;
  originatingSpeakerAttemptId: string;
  executionId: string;
  sourceMessageId: string;
  sourceMessageSeq: number;
  sourceTurnId: string;
  sourceStepId: string;
  sourceContextFromSeq: number;
  sourceContextThroughSeq: number;
  resultSummary: string;
  taskStatus: "completed";
  finishedAt: number;
}
```

来源与校验固定为：`meetingId` 来自锁内 snapshot；participant/task/attempt/execution/finishedAt/resultSummary 来自同一 completed task；source message 引用来自 immutable task binding，并在当前 transcript 中验证 seq、meeting、attempt、participant、turn、step；context bounds 来自 assignment snapshot，正式 message 必须位于 bounds 内。非 completed、cancelled、foreign、缺 source、迟到 execution 或 taskId-only 均拒绝。`observedMeetingVersion` 不属于 evidence，也不持久化；task status DTO 的公开 `observedMeetingVersion` 仍按 Interface 保留。所有 execution/source/internal evidence 和授权判定不得进入 HTTP/Client。

assignment-time snapshot 固化 execution、attempt、turn、step 和 context 上限；submit-time locked resolver 在当前写锁内复核 snapshot、source message 和 completed result，防止 TOCTOU、taskId 复用和迟到结果。

## Pure Functions And Transition Wiring

唯一函数 shape 如下；返回值使用现有 `TransitionResult<MeetingState>` 或现有 protocol result：

```ts
createMeetingTask(state: MeetingState, input: CreateMeetingTaskInput): TransitionResult<MeetingState>
queueMeetingTasks(state: MeetingState, meetingTaskIds: readonly string[], participantId: string, originatingSpeakerAttemptId: string, now: number): TransitionResult<MeetingState>
startMeetingTask(state: MeetingState, meetingTaskId: string, now: number): TransitionResult<MeetingState>
finishMeetingTask(state: MeetingState, meetingTaskId: string, input: { status: "completed" | "failed"; now: number; resultSummary?: string; failureReason?: string }): TransitionResult<MeetingState>
createHandRaise(state: MeetingState, input: CreateHandRaiseInput): TransitionResult<MeetingState>
consumeHandRaise(state: MeetingState, handRaiseId: string): TransitionResult<MeetingState>
resolveAuthorizedTaskEvidence(state: MeetingState, input: { participantId: string; meetingTaskId: string; executionId: string }): AuthorizedTaskEvidence
applyCompletionClaims(state: MeetingState, context: ApplyCompletionClaimsContext): TransitionResult<MeetingState>
submitSpeakerAndAdvanceMeeting(state: MeetingState, participantId: string, context: SubmitSpeakerAdvanceContext): TransitionResult<MeetingState>
```

`submitSpeakerAndAdvanceMeeting` 是唯一 short submit binding 入口：同一既有 `repository.execute()` 内写 formal transcript message，取得 `messageId`/`messageSeq`，补齐 submitted requested tasks 的 source binding，调用 `queueMeetingTasks`，写 `meeting_task.queued` 和既有 `dispatch` outbox（`kind: "dispatch"`, `payload.role: "meeting_task"`），最后释放 originating attempt。提交前 message binding、queue、outbox 均不存在；成功后三者同在。create 与 submit 不合并。

`finishMeetingTask` 与 `createHandRaise` 在 `finish_meeting_task` 的同一 `repository.execute()` 中提交。completed 写 `meeting_task.completed`、`hand_raise.created` 和 pending raise；failed 只写 `meeting_task.failed` 与 failure reason，不创建 HandRaise。

当前正式 `MeetingTaskFinishResultV1`/Schema 的 `handRaiseId` 改为 optional，保持同一 protocol version 和 DTO：completed 成功必须返回 `handRaiseId`，failed 成功省略 `handRaiseId`。这是本 RUNBOOK 唯一允许的兼容性修正，不新增 DTO 或版本。

planner 只消费 pending HandRaise：`consumeHandRaise` 后按既有 deterministic candidate 规则创建 SpeakerAttempt；HandRaise 不写 transcript、decision、CompletionFact 或 accepted 状态。completion claim 的 `taskIds` 在锁内解析 completed task，再调用 resolver；不得把 taskId、公开 projection 或 status completed 单独当作 evidence。

## Terminal, Permission, Idempotency And Errors

所有 task、raise、planning 入口在读取 snapshot 后、transition closure 内再次执行 guard。Meeting status 为 execution terminal（`completed|partial|no_consensus|cancelled|failed`）、`archiving` 或 `archived` 时，`start`、`finish`、`raise`、planning 及并发调用统一返回 `INVALID_STATE_TRANSITION`、`retryable: false`，零 state/event/receipt/outbox/transcript 写入。C 的 revoke/drain/close 不由 B 调用。

| 触发条件                                                             | code                       | retryable | 零副作用                                      |
| -------------------------------------------------------------------- | -------------------------- | --------: | --------------------------------------------- |
| 非 Participant、错误 meeting、错误 participant/session、foreign task | `UNAUTHORIZED_CALLER`      |     false | 所有领域写、receipt、event、outbox            |
| create/submit 的 originating attempt 不是当前 running attempt        | `STALE_ATTEMPT`            |     false | task、message、event、receipt、outbox         |
| task 不存在                                                          | `MEETING_NOT_FOUND`        |     false | 所有领域写                                    |
| task 状态不允许当前操作                                              | `INVALID_STATE_TRANSITION` |     false | task、event、raise、evidence                  |
| finish executionId 不匹配                                            | `UNAUTHORIZED_CALLER`      |     false | terminal task、event、raise、evidence         |
| expected Meeting version 过期                                        | `VERSION_CONFLICT`         |      true | state、event、receipt、outbox                 |
| 相同 requestId 不同 request hash                                     | `IDEMPOTENCY_CONFLICT`     |     false | 新事实、重复 event、重复 receipt              |
| required review 缺失或失败                                           | `INVALID_STATE_TRANSITION` |     false | accepted output、Meeting completion           |
| transient repository/provider failure                                | `INTERNAL_ERROR`           |      true | transaction rollback；不声明外部 exactly-once |
| implementation defect or unknown non-transient failure               | `INTERNAL_ERROR`           |     false | transaction rollback；不声明外部 exactly-once |

同一 `requestId + requestHash` 重放返回现有 immutable receipt/result，不递增 version，不重复 event、HandRaise 或 outbox。`commandKind`、caller binding 和 hash 继续使用现有 repository 规则。

## Existing Interface And Event Inventory

| 项目          | 现有值                                                                                                                                                                             | B 行为                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| tools         | `convivium_create_meeting_task`, `convivium_meeting_task_status`, `convivium_start_meeting_task`, `convivium_finish_meeting_task`, `convivium_raise_hand`, `convivium_submit_turn` | 复用，不新增 operation                               |
| input DTO     | `MeetingTaskRequestV1`, `MeetingTaskStatusInputV1`, `MeetingTaskStartInputV1`, `MeetingTaskFinishInputV1`, `HandRaiseSubmissionV1`, `TurnSubmissionV1`                             | 公开 shape 不变；finish 接收 executionId             |
| output DTO    | `MeetingTaskResultV1`, `MeetingTaskStatusResultV1`, `MeetingTaskStartResultV1`, `MeetingTaskFinishResultV1`, `HandRaiseResultV1`, `TurnSubmissionResultV1`                         | 仅将既有 `handRaiseId` 改为 optional；不新增 DTO     |
| commandKind   | `create_meeting_task`, `start_meeting_task`, `finish_meeting_task`, `raise_hand`, `submit_turn`                                                                                    | 复用，不新增 kind                                    |
| receipt       | `requestId`, `requestHash`, caller binding, expected version                                                                                                                       | 复用，不改变 hash/binding                            |
| domain events | `meeting_task.created`, `.queued`, `.started`, `.completed`, `.failed`, `.cancelled`, `hand_raise.created`, existing message/turn events                                           | 复用，不新增 event type                              |
| outbox        | `kind: "dispatch"`, task payload `role: "meeting_task"`                                                                                                                            | 只由 short submit queue 写入；不新增 kind/job/worker |

`TurnSubmissionV1.taskIds` 在锁内解析为当前 originating attempt 的 requested tasks并完成 source binding；completion claim 的 `taskIds` 在锁内解析为同 meeting、participant、attempt、execution、source formal message 全匹配的 completed task，再形成 ephemeral evidence。execution/source/internal evidence 不进入公开输入输出。

## Required File Changes

| 文件                                                             | 必改符号/区域                                             | 变更                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `plugin/src/domain/model.ts`                                     | `MeetingTask`                                             | 增加 source formal message/turn/step/context 字段；SpeakerAttempt/MeetingTaskSnapshot 不改 |
| `plugin/src/domain/meeting-task.ts`                              | create/queue/start/finish/cancel                          | 实现字段时点、唯一状态转换和既有事件                                                       |
| `plugin/src/domain/hand-raise.ts`                                | create/consume/snapshot                                   | 校验 task identity、去重和 deterministic 消费；不写 transcript                             |
| `plugin/src/domain/transitions.ts`                               | `submitSpeakerAndAdvanceMeeting`、planning/terminal gates | 接入 short submit binding、taskIds locked resolution、completion claim 与终态拒绝          |
| `plugin/src/domain/planning.ts`                                  | candidate eligibility                                     | 复用 pending HandRaise、completed evidence、active-task 排除                               |
| `plugin/src/runtime/task-evidence.ts`                            | resolver/rejection                                        | 实现 ephemeral exact evidence shape；不调用外部系统                                        |
| `plugin/src/tools/meeting-runtime.ts`                            | create/status/start/finish/raise/submit                   | 保留 caller binding，使用既有 execute；failed finish 省略 handRaiseId                      |
| `plugin/src/tools/register-tools.ts`                             | existing registration                                     | 同步 optional result schema/description；不新增 tool                                       |
| `plugin/src/protocol/types.ts`、`plugin/src/protocol/results.ts` | `MeetingTaskFinishResultV1`/Schema                        | `handRaiseId?: string`；不新增 DTO/version                                                 |
| `plugin/src/protocol/commands.ts`                                | existing command schemas                                  | 只验证现有输入不变；不新增 task/evidence 字段                                              |
| `plugin/tests/unit/domain/meeting-task.spec.ts`                  | task cases                                                | 字段时点、execution、terminal/error                                                        |
| `plugin/tests/unit/domain/hand-raise.spec.ts`                    | raise/planner cases                                       | identity、去重、failed/terminal                                                            |
| `plugin/tests/unit/domain/completion.spec.ts`                    | claims/evidence cases                                     | locked taskIds resolver、source rejection                                                  |
| `plugin/tests/contract/meeting-runtime.spec.ts`                  | runtime cases                                             | transaction、caller、receipt、finish/raise、failed DTO                                     |
| `plugin/tests/contract/protocol-schema.spec.ts`                  | result cases                                              | optional handRaiseId 与公开 DTO 边界                                                       |
| `plugin/tests/contract/status-projection.spec.ts`                | projection cases                                          | 隐藏内部字段，保留 finishedAt/resultSummary                                                |
| `plugin/tests/recovery/recovery.spec.ts`                         | restart cases                                             | create/submit、finish/raise、late result                                                   |
| `plugin/scripts/smoke-profile.mjs`                               | current Speaker submit 后、profile 收尾前                 | 插入真实 `start→finish→raise→later submit_turn` 场景，不改 profile 基础设施                |
| `docs/40-readiness/MEETINGTASK-HAND-RAISE-EVIDENCE.md`           | B readiness                                               | 记录实际命令、结果、Not Covered、commit 边界                                               |

不改 HTTP/Client、archive/lifecycle、Session adapter、repository schema/migrations；`repository/index.ts` 只复用既有 `execute`/receipt/event/outbox，不改动；公开 projection 只保留正式 Interface 字段。

## Implementation Order T1…T10

| 步骤                    | 输入                                     | 文件                                                       | 产出                                                       | 最窄测试                         | 完成判据                                           |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| T1 Interface correction | 当前 public types/results/schema         | `protocol/types.ts`, `protocol/results.ts`, contract tests | optional `handRaiseId`；completed required、failed omitted | protocol schema case             | 同版本 DTO 通过；无新 DTO/version                  |
| T2 state shape          | 当前 MeetingTask/model tests             | `model.ts`, `meeting-task.ts`                              | 字段时点和 immutable source shape                          | meeting-task unit                | requested 无 source message；queued 起 source 完整 |
| T3 pure task/raise      | T2 state                                 | `meeting-task.ts`, `hand-raise.ts`, `planning.ts`          | 唯一 pure transitions/helper                               | domain unit                      | duplicate/foreign/terminal 零 effect               |
| T4 short submit         | formal message allocator/current attempt | `transitions.ts`, `meeting-runtime.ts`                     | 同 execute 写 message、source、queue、dispatch、release    | runtime atomic binding           | commit 前后断点符合规格                            |
| T5 resolver/claims      | completed task/transcript                | `task-evidence.ts`, `completion.ts`, `transitions.ts`      | ephemeral evidence and locked taskIds                      | completion unit                  | source/execution/participant 全匹配                |
| T6 start/finish         | owning Session/current snapshot          | `meeting-runtime.ts`, `register-tools.ts`                  | start and finish wiring                                    | finish raise atomic + failed DTO | completed 同事务 raise；failed 无 raise 且省略 id  |
| T7 planner/terminal     | pending raises/current status            | `planning.ts`, `transitions.ts`                            | deterministic consume and three terminal guards            | terminal cases                   | `INVALID_STATE_TRANSITION`, false，零写入          |
| T8 idempotency/recovery | existing receipt/outbox/repository       | runtime/recovery tests                                     | replay/version/restart                                     | contract/recovery                | 无重复 fact；迟到写拒绝                            |
| T9 profile smoke        | independent profile/workspace/port       | `smoke-profile.mjs`                                        | real Participant Session flow                              | smoke command                    | 观察 finish→raise→later submit_turn                |
| T10 readiness/closure   | all results                              | readiness/RUNBOOK                                          | evidence and formal sync                                   | `pnpm verify` + affected tests   | independent completion check passed                |

## Test Matrix

| 文件                                 | case                                                                      | 判据                                                         |
| ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `unit/domain/meeting-task.spec.ts`   | `keeps source formal fields absent for requested task`                    | create 只有 assignment snapshot                              |
| 同上                                 | `binds immutable source fields when originating short submit queues task` | message/source/queue 同 transition                           |
| 同上                                 | `rejects wrong execution and every terminal status without mutation`      | 唯一错误、零 effect                                          |
| `unit/domain/hand-raise.spec.ts`     | `does not raise for failed finish`                                        | failed 无 raise                                              |
| 同上                                 | `deduplicates task execution raise and consumes one candidate`            | 不重复 raise/selection                                       |
| `unit/domain/completion.spec.ts`     | `resolves evidence only from locked matching execution and source`        | taskId-only、foreign、missing source、finishedAt-only 全拒绝 |
| `contract/meeting-runtime.spec.ts`   | `atomically commits completed task and hand raise`                        | transaction 前两者皆无、后两者皆有                           |
| 同上                                 | `rolls back short submit source binding and queue together`               | rollback 不留 binding、queue、outbox                         |
| 同上                                 | `returns optional handRaiseId only for completed finish`                  | failed 无 raise/id，completed 有 id                          |
| 同上                                 | `maps caller, execution, duplicate and version failures uniquely`         | 每场景唯一 code/retryable                                    |
| `contract/protocol-schema.spec.ts`   | `accepts failed result without handRaiseId`                               | schema 与 Interface 对齐                                     |
| `contract/status-projection.spec.ts` | `keeps finishedAt and resultSummary but hides internal task evidence`     | 公开字段保留，内部字段不泄露                                 |
| `recovery/recovery.spec.ts`          | `recovers requested before submit and atomic finish state after restart`  | 无半提交状态                                                 |
| 同上                                 | `rejects late task result in terminal and archiving states`               | 三类 guard 零写入                                            |
| `scripts/smoke-profile.mjs`          | `task finish then raise then later formal submit_turn`                    | 真实 Session、formal message、evidence 引用可观察            |

每个失败 case 断言无额外 transcript、decision、CompletionFact、dispatch、event 或 receipt；每个 recovery case 执行 Prepare → Execute → Assert → Restore。真实长时模型、外部工具和 exactly-once 列入 `Not Covered`。

## Independent Completion, Review And Merge

B 只从当前 `origin/main` checkout 实施，不读取 A/C worktree/branch，不等待事前批准。本 PR 只保证 B 的最小路径和必要失败、权限、事务边界；局部不完备项写入 `Not Covered`，不预建通用层。A 是后续 PR reviewer，检查公开 projection 不泄露内部字段；C 是后续 PR reviewer，检查 terminal/archiving guard 兼容性；reviewer 只检查当前不变量，不要求提前兼容尚未合并的实现。

Independent completion check：B 已完成 T1–T10 中适用步骤、必要代码和共享 seam diff、unit/contract/recovery/profile smoke、readiness 与 `Not Covered`；public DTO 未扩展，MeetingState、receipt、event、outbox、terminal guard 回归通过。后合并者必须基于已合入的 `main` rebase/merge，解决真实冲突后重跑受影响测试、全量验证、package verification 和 profile smoke；不提前抽象、不覆盖另一分支、不跳过验证。

RUNBOOK 仅在长期结论迁移到正式 design/interface/readiness、readiness 证据完整、Not Covered 明确且残留引用清理后删除；commit、push、PR 和删除动作仍需用户授权。
