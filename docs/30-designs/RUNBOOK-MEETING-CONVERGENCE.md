# RUNBOOK：Meeting Convergence（FR-4 / FR-6）

状态：`Executable`（受 P0 的 B-first/baseline 机械门禁约束）

模式：`Author` 完成；`Audit` 通过

确认日期：2026-09-03

执行分支：`codex/orchestration-convergence-runbook`

执行目录：仓库根

## 1. 结论与执行者契约

用户已于 2026-09-03 确认 D6-D10。本 RUNBOOK 只把该次人工决定机械迁移到正式 requirements/interfaces/designs，再实现 A 线；它不是长期产品真相源。

执行者必须从 P0 开始顺序执行，不得跳步。每步只修改“允许修改”列出的文件和 symbol；指定路径、symbol、签名、命令或断言与执行基线不一致时立即 STOP，不寻找替代入口。每个 command 的 `now` 只读取一次；任何失败都不得通过放宽 Schema、类型、错误、测试或删除断言继续。

PASS 仅指当前步骤全部命令退出码为 0 且该步列出的状态、event、receipt、outbox、projection 断言全部成立。STOP 报告固定包含：`lastCompletedStep`、`stopStep`、`trigger`、`files`、`symbols`、`reproductionCommand`、`exitCode`、`stdout`、`requiredExternalChange`、`forbiddenWorkaround`。

禁止：修改 B 拥有的 FR-7 fact lifecycle/contract；复制 `serializeValidatedRequestV1`；新增 convergence event、Repository、adapter、registry、feature flag、scheduler、database migration 或 DSH Session event；修改 C 的 readiness；commit、push、创建 PR、merge 或发布。

## 2. 目标、起点与终点

完整链路固定为：

```text
completed Speaker Turn + 已提交 B-owned FR-7 facts
  -> deterministic fingerprint/progress
  -> complete/limit/stall decision
  -> round_robin | rule_based | manager | hybrid
  -> required Participant wait OR Manager attempt OR deterministic Turn
  -> one Repository commit(state + ordered events + receipt + outbox)
  -> post-commit DSH followup
  -> timeout/retry-exhausted deterministic fallback
  -> restart/replay without duplicate state/event/outbox
  -> full authorized MeetingStatusResultV1 projection
```

当前起点是 HEAD `7291ba012475915e02648addb60ca3c6223425e1`：只有 `round_robin|manager` 部分路径；`rule_based|hybrid` 被拒绝；`replanCount` 错作 planning ID sequence；wait shape、fallback、fingerprint/stall 和 active projection 不完整。该 SHA 只记录 Author 基线，执行以 P0 rebase 后事实为准。

终点是 D6-D10 已进入正式文档且产品、focused/full/runtime 验证通过。最终 runtime/browser/stress readiness 由 C 在 B→A 合并后采集；A 不写 `docs/40-readiness/**`。

## 3. Scope、Non-goals 与跨线顺序

### 3.1 Scope

- D6：deterministic required/rule plan、recency、consecutive penalty、stable tie。
- D7：四种 `selectionMode` 与结构化 `needsSemanticArbitration`。
- D8：Manager unavailable/invalid/timeout/retry-exhausted fallback、幂等和 stale attempt。
- D9：required Participant waiting、去重、唯一 resume 恢复。
- D10：fingerprint、progress、refocus/replan、exhaustion terminal、projection。
- A 拥有上述 domain state/transition、Runtime、protocol/schema、projection、focused tests、fixture 和 `convergence` smoke selector。
- 先迁移长期结论到正式文档；实现后由 C 写最终 readiness。

### 3.2 Non-goals

- B 拥有的 Proposal/Position/Issue/DecisionCandidate/Decision/risk/CompletionFact lifecycle、tool、projection mapper 语义、archive history。
- Decision/risk UI、Agent catalog/admission、Meeting Agent Definition runtime、Scribe、metrics、发布。
- 新 HTTP route、Client control、后台 scheduler、第二 repository、迁移、双写、legacy fallback、远程/多用户支持。

### 3.3 B→A→C

1. B 先按 D1-D5 合入 `main`。
2. A rebase 到包含 B 的 `origin/main`；P0 必须同时证明五个最终 symbol 已存在。
3. A 只消费 `pendingDecisionCandidates`、`convivium_dispose_decision`、`decisionHistory`、`riskLevel/risks` 和 `serializeValidatedRequestV1`，不修改其 lifecycle、字段过滤、Schema 或 ID 语义。
4. A 合入后，C 基于包含 A merge commit 的 current HEAD 运行 runtime/browser/stress 并独占写 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 与 `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`。

### 3.4 B 输出的精确消费契约

P0 只接受 B 在 `origin/main` 已实现并导出的以下最终契约；A 不重声明、不包装、不改名：

| B producer                                                                                                                                                                                                                                                                                                                                   | A consumer                                                                                           | 精确契约                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin/src/protocol/request-idempotency.ts::serializeValidatedRequestV1`                                                                                                                                                                                                                                                                    | `plugin/src/runtime/application-service/meeting-turn.ts` 的 timeout/retry-exhausted fallback command | `export function serializeValidatedRequestV1(value: object): string`；A 传入按 insertion order 构造的 `{ attemptId, reasonCode, observedMeetingVersion }`                |
| `plugin/src/protocol/types.ts::PublicDecisionCandidateV1`、`DiscussionMeetingStatusBaseV1.pendingDecisionCandidates`                                                                                                                                                                                                                         | P0 compatibility gate；A projection regression assertion                                             | property 为 required `readonly PublicDecisionCandidateV1[]`；Captain/local 可见，Manager/Participant 为 `[]`；A 不读取它计算 domain state                                |
| `plugin/src/protocol/types.ts::CaptainDecisionDispositionInputV1`、`CaptainDecisionDispositionResultV1`；`plugin/src/protocol/commands.ts::CaptainDecisionDispositionInputSchema`；`plugin/src/protocol/results.ts::CaptainDecisionDispositionResultSchema`；`plugin/src/tools/register-tools.ts` 的 `convivium_dispose_decision` definition | P0 compatibility gate 与 T8 regression assertion                                                     | B 定义并实现；A 不调用该 command，也不修改 Schema、tool 或 lifecycle                                                                                                     |
| `plugin/src/protocol/types.ts::PublicArchivePackageV1.decisionHistory`                                                                                                                                                                                                                                                                       | P0 compatibility gate 与 termination/archive regression assertion                                    | required `readonly PublicDecisionV1[]`；A 终止只从 `MeetingState.decisions` 派生 IDs，不从 archive projection 反写                                                       |
| `plugin/src/domain/model.ts::MeetingIssue.riskLevel`、`plugin/src/protocol/types.ts::{IssueClaimV1.riskLevel,PublicRiskV1.riskLevel,DiscussionMeetingStatusBaseV1.risks}`                                                                                                                                                                    | D6/D7/D10 对 current domain facts 的只读判断与 T8 regression assertion                               | internal/claim `riskLevel` required；public/archive `riskLevel?` 仅兼容 legacy；`risks` required `readonly PublicRiskV1[]` 且按 caller 过滤；A 不创建默认值或第二 mapper |
| `plugin/src/domain/model.ts::{MeetingProposal.positions,MeetingDecision,CompletionFact}`                                                                                                                                                                                                                                                     | `rankRulePlanningCandidates`、`createProgressFingerprint`、`hasBlockingDisagreement`                 | A 按 B 最终 state shape 只读 current revision Position、accepted Decision 和 active Fact；不修改 revision、acceptance、risk 或 Fact replacement 规则                     |

P0 的 B focused tests 必须证明下列字段级 shape；任一 required/optional 差异均 STOP：

```ts
export interface PublicDecisionCandidateV1 {
  id: string;
  proposalId: string;
  proposalRevision: number;
  statement: string;
  rationale: string;
  proposedBy: string;
  sourceMessageId: string;
  agendaItemId: string;
  createdAt: number;
}
export interface CaptainDecisionDispositionInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  requestId: string;
  decisionId: string;
  action: "supersede" | "revoke";
  reason: string;
  evidenceMessageIds: readonly string[];
  replacementCandidateId?: string;
}
export interface CaptainDecisionDispositionResultV1 {
  requestId: string;
  decisionId: string;
  action: "supersede" | "revoke";
  completionFactId: string;
  replacementDecisionId?: string;
}
```

`PublicRiskV1` 的字段顺序与 optionality 固定为：`id,title,description,sourceMessageId` required；`agendaItemId?`；`affectedOutputIds,affectedCriterionIds,violatedConstraintIds,blockingObjectionIds,blocking` required；`riskLevel?` 仅 legacy compatibility；`impact,urgency,reversibility,safeDefaultAvailable,disposition,status` required；`rationale?,ownerId?`；`relatedTaskIds` required。`MeetingDecision.supersededByDecisionId?` 与 `PublicDecisionV1.supersededByDecisionId?` 仅 superseded producer 必填；`PublicArchivePackageV1.decisionHistory` required。A 不改变这些 optionality。

共享文件按 symbol/字段切片的唯一所有权固定如下；“先后编辑同文件”不授予双方修改同一字段：

| 文件                                                         | B 先实现                                                                                                                                           | A rebase 后唯一允许切片                                                                                                                                           | C              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md` | FR-7、FR-8.1/8.4/8.9 的 B fact/risk clauses、FR-11.1/11.5/11.7 的 candidate/risk visibility、AC-7/8/26/27 与 AC-13/16 的 B command/fact assertions | FR-4、FR-6.7、FR-8.7、FR-9.4/9.5、FR-11.1/11.5 的 wait/counter/Turn reason；AC-5/6/20 与 AC-13/16 的 A fallback/wait/stall assertions                             | 不修改         |
| `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`     | §3.4 表中的 B DTO/Schema/event/projection/archive symbols                                                                                          | `ManagerPlanResultV1`、`PublicMeetingWaitStateV1`、`ActiveMeetingStatusResultV1` 四 counters、`PublicTurnV1.reason`、A error/event payload                        | 不修改         |
| `docs/30-designs/DOMAIN-MODEL-DESIGN.md`                     | Proposal/Position/Candidate/Decision/Issue/CompletionFact/history                                                                                  | `MeetingState.managerPlanningSeq`、`MeetingTurn.reason`、`MeetingWaitState`、fingerprint/counters/termination                                                     | 不修改         |
| `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`            | FR-7 transition、projection、Client、archive、serializer                                                                                           | §12 D6-D9 planning/fallback/wait、§13 D10 stall/termination、§14 Manager delivery failure、§17-19 A events/defaults                                               | 不修改         |
| `plugin/src/domain/model.ts`                                 | `MeetingProposal`、nested Position、`MeetingDecision`、`MeetingDecisionCandidate`、`MeetingIssue`、B `CompletionFact` members、archive history     | `MeetingState.managerPlanningSeq`、`MeetingTurn.reason`、`MeetingWaitReason`、`MeetingWaitState`、`TurnConvergenceReason`                                         | 不修改         |
| `plugin/src/protocol/types.ts`                               | §3.4 的 B DTO 与 discussion/archive B fields                                                                                                       | `ManagerPlanResultV1`、`PublicMeetingWaitStateV1`、`ActiveMeetingStatusResultV1` counters、`PublicTurnV1.reason`、A error union members                           | 不修改         |
| `plugin/src/protocol/commands.ts`                            | B disposition input Schema 与 `IssueClaimV1` validation                                                                                            | existing `CreateMeetingInputSchema.selectionMode` regression only；A 不新增 command Schema                                                                        | 不修改         |
| `plugin/src/protocol/results.ts`                             | `CaptainDecisionDispositionResultSchema` 与 B result schemas                                                                                       | `CreateMeetingResultSchema` waiting branch、`ManagerPlanResultSchema` union                                                                                       | 不修改         |
| `plugin/src/protocol/schema.ts`                              | 无修改；保留 shared envelope/error primitives                                                                                                      | 无修改                                                                                                                                                            | 无修改         |
| `plugin/src/projection/status.ts`                            | `projectMeetingStatus` 中 `pendingDecisionCandidates`、`risks`、accepted filter、archive history expressions                                       | `turn` 的 `reason` 映射；`projectMeetingStatus` active return object 的 `waitState/stallCount/maxStalls/replanCount/maxReplans` expressions；不得改 B expressions | 不修改         |
| `plugin/src/domain/completion.ts`                            | risk branch、Fact replacement、Issue predicate                                                                                                     | 无修改，只由 planning/fingerprint 读取 resulting state                                                                                                            | 无修改         |
| `plugin/src/domain/transitions/types.ts`                     | `SubmittedIssueInput.riskLevel`                                                                                                                    | `SubmitManagerPlanContext`/A planning context members；不得改 `SubmittedIssueInput`                                                                               | 无修改         |
| `plugin/src/runtime/application-service/meeting-turn.ts`     | `createMeetingTurnApplication.submitTurn` 的 `issues` mapping 只增加 required `riskLevel`                                                          | 同一 function 的 planning IDs、Manager submission/fallback/wait orchestration；不得改 B issue mapping                                                             | 无修改         |
| `plugin/src/runtime/application-service/meeting-control.ts`  | `disposeRisk` 的 command validation、risk transition、result、serializer、Issue/Fact/event/receipt/idempotency                                     | `disposeRisk` 在 B fact commit 后既有 `judgeTurnCompletion`/`meeting.replanned` convergence tail 的 D10 收口；不得改 B 前半段                                     | 无修改         |
| `plugin/src/runtime/outbox-worker.ts`                        | 无修改                                                                                                                                             | 仅 `OutboxWorkerOptions.onTerminalFailure` 与 `createOutboxWorker().runOnce` 的 durable-failure 后 callback                                                       | 无修改         |
| `plugin/tests/unit/domain/transitions/fixtures.ts`           | `meeting()` 的 B fact fields；`archivePackage()` 的 `decisionHistory`                                                                              | `meeting()` 只增加 `managerPlanningSeq: 0`；不得改 B fields 或 `archivePackage()`                                                                                 | 无修改         |
| `plugin/tests/contract/meeting-runtime.spec.ts`              | `describe("decision and risk closure runtime", ...)`                                                                                               | `describe("meeting convergence runtime", ...)`                                                                                                                    | 无修改         |
| `plugin/tests/contract/status-projection.spec.ts`            | `describe("decision and risk projection", ...)`                                                                                                    | `describe("meeting convergence projection", ...)`                                                                                                                 | 无修改         |
| `plugin/scripts/smoke-profile.mjs`                           | selector `decision-risk-closure`、其 run/validate branch 和 assertions                                                                             | selector `convergence`、其 run/validate branch 和四 §T10 assertions；shared dispatcher 只各加一次对应 branch                                                      | 只运行，不编辑 |

## 4. 正式依据与当前断点

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-4、FR-6、FR-8、FR-9、FR-11；AC 5、6、11-13、16、20。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：Manager plan、required unavailable、status、resume、error。
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)：command、version、receipt、outbox、recovery。
- [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)：Meeting state、limits、wait、termination。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：§12、§13、§14、§17-19。
- [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)：Checkpointed Commit Log。
- [Architecture](../00-governance/ARCHITECTURE.md)：Storage Domain 唯一事实源；无自定义 Session event。

| 断点        | 当前事实                                                   | D6-D10 终点                                 |
| ----------- | ---------------------------------------------------------- | ------------------------------------------- |
| planning    | `planRoundRobinTurn` 只优先 HandRaise                      | required set + fixed score + stable order   |
| modes       | create 拒绝 `rule_based\|hybrid`                           | 四 mode 固定分支                            |
| Manager     | invalid 返回 error；terminal delivery 仅标 outbox failed   | deterministic fallback commit               |
| waiting     | `reason:string`，无 `waitingSince`；sync/background 不一致 | D9 唯一 shape/result/resume                 |
| counters    | `replanCount` 兼作 attempt sequence                        | 新 `managerPlanningSeq`；replan budget 独立 |
| convergence | fingerprint 无 producer；stall 无 transition               | D10 fixed tuple/state table                 |
| projection  | active status 无 stall/replan counters                     | 四个 required public number                 |

## 5. 精确数据与接口契约

### 5.1 Domain types

T2 必须形成以下唯一 shape；除下文点名的新增或替换 member 外，现有 interface member 不增删、不改名、不改 optionality：

```ts
export type MeetingWaitReason =
  "blocking_task" | "required_participant_unavailable" | "captain_action";

export interface MeetingWaitState {
  reason: MeetingWaitReason;
  waitingSince: number;
  taskIds: readonly string[];
  participantIds: readonly string[];
  deadlineAt?: number;
  resumeAgendaItemId?: string;
}

export type TurnConvergenceReason = "manager_fallback" | "refocus" | "replan";
```

`plugin/src/domain/model.ts::MeetingTurn` 只增加 optional `reason?: TurnConvergenceReason`；普通 round-robin/rule/Manager Turn 省略，Manager fallback、refocus、replan 分别写同名字面量。`plugin/src/domain/model.ts::MeetingState` 在 `eventSeq` 后增加 required `managerPlanningSeq: number`，其余 member 不改。`managerPlanningSeq` 初始为 0，每次创建 Manager attempt 恰好加 1；attempt ID 为 `${meetingId}-planning-${managerPlanningSeq}`，delivery ID 为 `${meetingId}-planning-delivery-${managerPlanningSeq}`。`replanCount` 初始为 0，只记录 D10 replan budget；结构化进展同时把 `stallCount`、`replanCount` 置 0。不得新增 last-speaker 或 dedupe 持久字段。

### 5.2 Rule score 与 arbitration

`plugin/src/domain/planning.ts` 的唯一新增 exports：

```ts
export type ConvergenceAction = "normal" | "refocus" | "replan";
export interface ScoredPlanningCandidate {
  participantId: string;
  required: boolean;
  score: number;
  registrationIndex: number;
}
export function rankRulePlanningCandidates(
  state: MeetingState,
): readonly ScoredPlanningCandidate[];
export function planRuleBasedTurn(
  state: MeetingState,
  ids: RoundRobinPlanIds,
  now: number,
  action: ConvergenceAction,
): MeetingTurn;
export function needsSemanticArbitration(
  state: MeetingState,
  ranked: readonly ScoredPlanningCandidate[],
  action: ConvergenceAction,
): boolean;
export function nextManagerPlanningIds(state: MeetingState): {
  managerPlanningSeq: number;
  planningAttemptId: string;
  deliveryId: string;
};
```

Feature 输入固定为当前 active agenda 和正式 state：latest active-agenda transcript message 的 `mentions` +100；open、blocking 且 `directedTo` 指向 participant 的 Question +80；尚无 active approved review 的 required reviewer +60；active agenda owner +50；拥有 `status='completed'` task 且对应 pending `task_completed` HandRaise 的 participant +40；当前 proposal revision 上 blocking `object|needs_revision` Position owner +25；当前 `turnSeq` 没有该 speaker transcript +20；recency 为从 transcript 取该 speaker最大 `turnSeq`，从未发言 15，否则 `min(15,max(0,state.turnSeq-lastTurnSeq))`；latest transcript speaker -25；再次选择会使 `consecutiveSpeeches >= maxConsecutiveSpeechesPerSpeaker` 时 -40。删除 repeated-content feature。

Required set 是：latest message mentions、open directed blocking Question、未完成 required reviewer、active agenda owner、fresh completed-task reporter、current blocking Position owner、active-agenda blocking HandRaise owner的去重并集。required 始终排在 optional 前；组内按 score 降序、再按 `MeetingState.participants[]` index 升序。required 不可调度，或 required 数量超过 `maxSpeakersPerTurn` 时不截断、不创建 plan，进入 D9；over-capacity 的 `participantIds` 是排好序后从 index `maxSpeakersPerTurn` 开始的 required IDs。

Hybrid 仅当最后可用席位边界两侧 score 相等、至少两个不同 participant 拥有 current blocking Position，或 action 为 `refocus|replan` 时返回 true。`manager` 始终尝试 Manager；`rule_based` 始终 rule；`round_robin` 保留现有 registration-order 轮询；`hybrid` false 时 rule。Manager 在 attempt 创建前缺少 active Manager Session ownership/capability 或缺少正数 `speakerAttemptTimeoutMs` 时视为不可用，直接 rule，Turn `reason='manager_fallback'`，不创建 attempt/event。可用时 attempt `deadlineAt=now+speakerAttemptTimeoutMs`。

### 5.3 Manager result、fallback 与 request identity

```ts
export type ManagerFallbackReasonCode =
  | "manager_plan_invalid"
  | "manager_timeout"
  | "manager_delivery_retry_exhausted";

export type ManagerPlanResultV1 =
  | {
      status: "planned";
      turnId: string;
      firstStepId: string;
      firstAttemptId: string;
      fallbackApplied: boolean;
      fallbackReason?: ManagerFallbackReasonCode;
    }
  | {
      status: "waiting";
      waitReason: "required_participant_unavailable";
      participantIds: readonly string[];
      fallbackApplied: boolean;
      fallbackReason?: ManagerFallbackReasonCode;
    };
```

正常 Manager plan 为 `fallbackApplied=false` 且省略 `fallbackReason`。业务非法 submission 与 timeout/retry-exhausted 为成功 receipt；planned/waiting 由 fallback rule 的结果决定。Schema 无法解析由 tool Schema 返回 `INVALID_ARGUMENT`、`retryable=false`、零 Meeting 副作用；当前 attempt 保持 running，deadline 后执行 timeout fallback。

Schema 有效但业务非法的 Manager submission 使用 caller 原有 `requestId`、`callerBinding`、`capabilityId`、validated submission hash 和 `expectedMeetingVersion`，在该 submission 的一个 commit 中写 failed attempt、fallback、receipt 与 outbox；不得另建 internal fallback receipt。

仅 timeout 与 Manager delivery retry exhausted 使用内部 fallback command：`commandKind='manager_fallback'`；`requestId=manager-fallback:<attemptId>:<reasonCode>`；`callerBinding=runtime:<meetingId>`；`capabilityId=runtime:manager-fallback`；`expectedMeetingVersion=attempt.observedMeetingVersion`。`requestHash` 必须 import B 的 `plugin/src/protocol/request-idempotency.ts::serializeValidatedRequestV1(value: object): string`，并传入按此 insertion order 构造的 `{attemptId,reasonCode,observedMeetingVersion}`，不得建立 A helper。same key/hash replay 原 receipt；same key/different hash `IDEMPOTENCY_CONFLICT`；旧/非 running attempt `STALE_MANAGER_ATTEMPT` 且零副作用。

### 5.4 Waiting 与 resume

Required blocker 统一提交：`status='waiting'`；`reason='required_participant_unavailable'`；`participantIds` 去重后按 participant ID code-point 升序；`taskIds=[]`；`waitingSince=command now`；active agenda 存在才设置 `resumeAgendaItemId`；清除 `currentTurn`，有 current Manager attempt 时置 failed 并清除。相同 snapshot version 的竞争提交只有一个成功；后续 status 已 waiting 时 scheduler 不重试。

唯一恢复入口是现有 Captain tool/loopback `convivium_resume_meeting` 与 `/resume`。Runtime 重新计算所有 required participants 的 domain dispatchability 与 active Session ownership；任一仍不可调度时返回 `REQUIRED_SPEAKER_UNAVAILABLE`、`retryable=false`，不提交。全部可调度时同一 `resume_meeting` commit 清除 wait、重新规划并写 turn/Manager outbox；禁止替换、豁免和部分 plan。

### 5.5 Fingerprint 与状态表

新 symbol：

```ts
export function createProgressFingerprint(state: MeetingState): string;
export function hasBlockingDisagreement(state: MeetingState): boolean;
```

`createProgressFingerprint` 返回 `JSON.stringify` 的固定 tuple；每个集合先按 canonical ID code-point 升序：

```text
[
  [agenda.id, agenda.status, agenda.resolution ?? ""],
  [acceptedDecision.id, proposalId, proposalRevision],
  [openBlockingQuestion.id],
  [currentProposal.id, revision, blockingPosition.id, participantId, position],
  [terminalTask.id, status, resultSummary ?? ""],
  [proposal.id, revision, status],
  [activeFact.id, kind, subjectId, result, sorted(evidenceMessageIds), sorted(taskIds)]
]
```

accepted Decision 仅 `status='accepted'`；current Proposal 是每个 proposal ID 的最大 revision；blocking Position 仅该 revision 的 `blocking=true` 且 `position='object'|'needs_revision'`；open blocking Question 为 `blocking=true,status='open'`；terminal task 为 `completed|failed|cancelled`；active fact 为 `status='active'`。不读文本相似度、当前时间、摘要、Map/Set 迭代顺序或 B public projection。`hasBlockingDisagreement` 仅检查上述 open blocking Question 或 current blocking Position。

Turn 完成后的唯一状态表：

| 条件                                                                       | state                                      | 后续动作                                               |
| -------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| 无 previous fingerprint                                                    | 保存 current；`stallCount=0`               | normal plan                                            |
| fingerprint 变化                                                           | 保存 current；`stallCount=0,replanCount=0` | normal plan                                            |
| 相同，next stall=1                                                         | `stallCount=1`                             | deterministic `intent='refocus',reason='refocus'` Turn |
| 相同，next stall>=2，`replanCount<maxReplans` 且 next stall `<maxStalls`   | `stallCount=next,replanCount++`            | action=`replan`，按 D7/D8 Manager/fallback             |
| 相同，next stall>=2，`replanCount>=maxReplans` 或 next stall `>=maxStalls` | 保存 counters                              | terminal                                               |

Terminal 有 blocking disagreement 时 `status='no_consensus',termination.code='no_consensus'`，否则 `status='partial',termination.code='stalled'`。`decisionIds` 为 current accepted Decision IDs；`unresolvedQuestionIds` 为 open/deferred Question IDs；`dissentingPositionIds` 为 current revision 的 non-support Position IDs；`blockingAgendaItemIds` 为 blocked Agenda IDs；四组都排序并逐项验证属于当前 state；`reason/finalMessage` 固定为 termination code；`endedAt=command now`。复用 `meeting.replanned` 与 `meeting.ended`，不加 event。

### 5.6 Event、receipt、outbox 与 projection

所有 payload 都由 transition 产生，Repository 填连续 `eventSeq`、提交后 `meetingVersion`、`createdAt`：

- waiting：有 active Manager attempt 时 `manager_plan.failed{meetingId,planningAttemptId,deliveryId,reasonCode:'required_participant_unavailable',meetingVersion}`，随后 `meeting.waiting{meetingId,from,to:'waiting',reason:'required_participant_unavailable',participantIds,meetingVersion}`；无 attempt 时只写后者。
- invalid/timeout/retry fallback 且 rule 可规划：`manager_plan.failed{meetingId,planningAttemptId,deliveryId,reasonCode,meetingVersion}` → `turn.planned` → `turn.started` → `speaker.assigned` → `speaker.started` → `speaker_attempt.started`。
- invalid/timeout/retry fallback 遇到 required blocker：`manager_plan.failed` 保留原 `reasonCode`，随后 `meeting.waiting{meetingId,from,to:'waiting',reason:'required_participant_unavailable',participantIds,meetingVersion}`；不产生 Turn/Speaker event 或 outbox。
- refocus direct Turn：`meeting.replanned{meetingId,from,to:'running',reason:'refocus',meetingVersion}` 后接 Turn/Speaker events。
- replan Manager：`meeting.replanned{...,reason:'replan'}` → `manager_plan.started`；replan fallback 则接 Turn/Speaker events。
- exhaustion：MeetingTask cancellation events 在前，`meeting.ended{meetingId,from,to,reason:'no_consensus'|'stalled',meetingVersion}` 最后。

每个成功 command 只递增 Meeting version 一次，state/events/result/receipt/outbox 同一 commit。Speaker outbox payload 固定 `{role:'participant',participantId,attemptId,turnId,stepId}`；Manager outbox 固定 `{role:'manager',planningAttemptId}`。外部 followup 仅 commit 后执行。

`ActiveMeetingStatusResultV1` 新增 required `stallCount,maxStalls,replanCount,maxReplans:number`；`PublicMeetingWaitStateV1` 精确映射 D9。fallback/refocus/replan 只通过 `currentTurn.intent`、`currentTurn.reason` 展示，不新增 convergence DTO。B 的 `pendingDecisionCandidates`、`decisionHistory`、`riskLevel`、`risks` mapper 不变。

## 6. 文件与 symbol 所有权

| 能力         | A 允许文件/symbol                                                                                                                                                                                                                               | 禁止相邻范围                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| formal truth | requirements；protocol/storage interfaces；Domain/Orchestration designs 的 D6-D10 sections                                                                                                                                                      | readiness、B lifecycle                   |
| model        | `domain/model.ts::{MeetingState,MeetingTurn,MeetingWaitState,MeetingWaitReason,TurnConvergenceReason}`；`domain/create.ts::createMeetingState`                                                                                                  | B fact types                             |
| planning     | `domain/planning.ts` §5.2 exports                                                                                                                                                                                                               | B transition/helper                      |
| transitions  | `manager-planning.ts::{startManagerPlanning,submitManagerPlan,failManagerPlanningAndCreateFallback}`；`turn-advancement.ts::{advanceAfterSpeakerSubmission,createProgressFingerprint,hasBlockingDisagreement}`；`transitions/types.ts` contexts | `speaker-submission.ts` FR-7 composition |
| Runtime      | `application-service/{create-meeting,meeting-turn,meeting-control,index}.ts`；`services/{meeting-dispatch-service,types}.ts`；`outbox-worker.ts::OutboxWorkerOptions/runOnce` terminal callback                                                 | Repository implementation、B tools       |
| protocol     | `protocol/types.ts::{ManagerPlanResultV1,PublicMeetingWaitStateV1,ActiveMeetingStatusResultV1,PublicTurnV1}`；`protocol/results.ts::{CreateMeetingResultSchema,ManagerPlanResultSchema}`；`protocol/index.ts` 对这些 symbol 的既有导出          | §3.4 B contracts；`protocol/schema.ts`   |
| projection   | `projection/status.ts::turn` 的 `reason` expression；`projectMeetingStatus` active return 的 `waitState/stallCount/maxStalls/replanCount/maxReplans` expressions；`projectManagerMeetingContext` 只消费 B-filtered status                       | B candidate/risk/history mapper          |
| tests        | §7 exact suites；共享 suite 只增加 §3.4 命名的 A `describe`；`fixtures.ts::meeting` 只增加 `managerPlanningSeq`                                                                                                                                 | B describe/fixture fields                |
| smoke        | `scripts/smoke-profile.mjs` convergence branch；新 `tests/unit/scripts/smoke-profile-contract.spec.ts`                                                                                                                                          | B selector、C evidence                   |

## 7. 机械执行步骤

### T1：迁移 D6-D10 到正式真相源

前置状态：P0 已通过；`refs/remotes/convivium-two/decision-risk-closure` 精确为 `975d9b76db83fd02c95a60e6c7fdc7fda8d2df8d`，共同基线 `7291ba012475915e02648addb60ca3c6223425e1` 是其 ancestor 且该 B ref 是当前 HEAD ancestor；P0 验证的 B symbols、focused tests、typecheck 与 shared-file diff gate 保持通过；A 仓库只保留本 RUNBOOK。

允许修改：`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`。

禁止修改：其他文件；禁止把 RUNBOOK 链接写成正式依据。

执行：只执行以下固定编辑，不创建新文档：

1. Requirements：保留 B 已写入 FR-7、FR-8.1/8.4/8.9、FR-11.1/11.5/11.7 candidate/risk bullets 和 AC-7/8/26/27；用 §5.2 的四 mode/arbitration 替换 FR-4.3；用 §5.3 替换 FR-4.6；用 §5.4 替换 FR-4.7-4.8；在 FR-4.8 后追加 §5.2 的 score/required-order 规则；用 §5.5 状态表替换 FR-6.7；只在 FR-8.7 增加 D10 `partial/no_consensus` threshold 与 termination-code distinction；只在 FR-9.4-9.5 增加 fallback/wait replay bullets；只在 FR-11.1/11.5 增加四 counters 与 Turn reason bullets；AC-5、6、20 增加 D6/D7/D10 assertions，AC-13、16 只增加 A fallback/wait/replay assertions，不改 B command/fact assertions。
2. Protocol interface：保留 §3.4 B DTO/Schema/event/projection/archive sections；在 `Manager plan submission` 写 §5.2 mode 与 Manager validation；在 `Required speaker unavailable` 写 §5.4；用 §5.1/§5.3/§5.6 的完整 TypeScript shape 替换 `PublicMeetingWaitStateV1`、`ManagerPlanResultV1` 并只给 `ActiveMeetingStatusResultV1`/`PublicTurnV1` 增加 A fields；在 `Pause and resume invocation` 写 waiting resume；error section 只增加 parse/stale/required-unavailable mappings。
3. Storage interface：在 `Idempotency` 后增加 `Manager fallback command` 小节，逐字段写 §5.3 的 command identity、B serializer producer/A consumer、replay/conflict/authorization/version；在 `Events and sequence` 与 `Outbox` 写 §5.6 的同 commit 和 post-commit callback 顺序。
4. Domain design：保留 B 的 Proposal/Position/Candidate/Decision/Issue/CompletionFact/history paragraphs；在 `MeetingState` 增加 `managerPlanningSeq`；在 `MeetingManagerRuntime` 固定 sequence/budget 分离；在 `MeetingTurn` 增加 optional `reason`；在 `Initial State And Defaults` 写初值；新增 `Waiting And Convergence` 小节，原样写 §5.1、§5.4、§5.5 的字段与状态表。
5. Orchestration design：保留 B 的 FR-7 transition/projection/Client/archive/serializer paragraphs；用 §5.2 替换 §12.2-12.4；用 §5.5 替换 §13.4 并补 §13.5 terminal；在 §14.1 写 timeout/retry-exhausted 同一 fallback command；用 §5.6 更新 §17.3-17.4 的 A event/order；§18 的 numeric defaults 仍精确为 `12/6/48/2/3/5/3/1/600000/120000`，只补 `managerPlanningSeq=0` 和 Manager `deadlineAt=now+speakerAttemptTimeoutMs`。
6. 从以上当前口径删除 repeated-content score、`评分接近/需要总结者/规则无法决定`、sync naked planning error、文本相似度、`replanCount` 作为 attempt sequence；不得保留“旧规则”段落。

验证：

```bash
rg -n 'managerPlanningSeq|required_participant_unavailable|waitingSince|fallbackApplied|manager-fallback:<attemptId>:<reasonCode>' docs/20-interfaces docs/30-designs
rg -n 'never spoke.*15|lastCommittedSpeakerTurnSeq|maxConsecutiveSpeechesPerSpeaker|最后可用席位|至少两个不同 Participant' docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
rg -n 'pendingDecisionCandidates|serializeValidatedRequestV1|meeting\.replanned|meeting\.ended' docs/20-interfaces docs/30-designs
test -z "$(rg -n '评分接近|需要总结者|规则无法决定|文本相似度只能|repeated content[^：]*-30' docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md docs/30-designs/DOMAIN-MODEL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md)"
pnpm --dir plugin exec prettier ../docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md ../docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md ../docs/20-interfaces/MEETING-STORAGE-INTERFACE.md ../docs/30-designs/DOMAIN-MODEL-DESIGN.md ../docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md --check
git diff --check
```

PASS：全部退出 0，且五份正式文档不存在与 §5 冲突的当前口径。

STOP：出现第二种字段、阈值、event、error 或 lifecycle 解释；报告冲突行，不改产品代码。失败恢复：仅文档改动；保留现场，不自动回滚。

### T2：Domain 与 protocol shape

前置状态：T1 PASS。

允许修改：`plugin/src/domain/model.ts`、`plugin/src/domain/create.ts`、`plugin/src/protocol/types.ts`、`plugin/src/protocol/commands.ts`、`plugin/src/protocol/results.ts`、`plugin/src/protocol/status.ts`、`plugin/src/protocol/index.ts`、`plugin/tests/unit/domain/create.spec.ts`、`plugin/tests/contract/protocol-schema.spec.ts`、`plugin/tests/unit/domain/completion.spec.ts`、`plugin/tests/unit/domain/transitions/fixtures.ts`、`plugin/tests/recovery/recovery.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`。

禁止修改：§3.4 B-owned types/Schema/fixture fields；`plugin/src/protocol/schema.ts`；Repository schema/backend。

执行：精确实现 §5.1、§5.3、§5.6；`createMeetingState`、`plugin/tests/unit/domain/create.spec.ts`、`plugin/tests/unit/domain/completion.spec.ts`、`plugin/tests/unit/domain/transitions/fixtures.ts::meeting`、`plugin/tests/recovery/recovery.spec.ts` 和 `plugin/tests/unit/runtime/archive.spec.ts` 的完整 MeetingState literals 只机械增加 `managerPlanningSeq:0`，其中 `fixtures.ts::meeting` 不改 B fields，`fixtures.ts::archivePackage` 不修改；special Turn 才增加 optional `reason`；`CreateMeetingResultV1/CreateMeetingResultSchema` 允许 `status='waiting'`；`ManagerPlanResultV1/ManagerPlanResultSchema` 对 planned/waiting 分支执行 exact-key 校验；`CreateMeetingInputSchema` 保持四 mode，不增加第五 mode。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/create.spec.ts tests/contract/protocol-schema.spec.ts
```

PASS：命令退出 0；缺 required protocol 字段、额外字段、错误 enum 或非法 result 分支均被拒绝；Domain 全局 typecheck 固定在完成所有构造点后的 T11，不能在本步外扩 fixture。

STOP：B symbols 需要改名/改 shape，或 fixture 需要修改未列文件；不复制 DTO。失败恢复：源码未产生外部副作用，保留 diff。

### T3：deterministic planning 与 arbitration

前置状态：T2 PASS。

允许修改：`plugin/src/domain/planning.ts`、`plugin/tests/unit/domain/planning.spec.ts`。

禁止修改：Runtime、Repository、B facts。

执行：实现 §5.2 四个 function exports；`planRoundRobinTurn` 仅保留显式 round-robin；normal `planRuleBasedTurn` 省略 `reason`，special action 写 `refocus|replan`；删除 repeated-content score。不得持久化 score 或 last speaker。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/planning.spec.ts
```

PASS：测试逐 feature 断言 exact score，覆盖 never/0/15 recency、penalty 边界、required overflow、不可调度、stable tie、三项 arbitration true 与其他 false、四 mode decision table；退出 0。

STOP：任一 feature 无法从 §5.2 指定字段取得，或需要 NLP/时间/新 state；不得补 heuristic。失败恢复：纯函数，无外部副作用。

### T4：Manager transition 与 deterministic fallback

前置状态：T3 PASS。

允许修改：`plugin/src/domain/transitions/manager-planning.ts`、`plugin/src/domain/transitions/types.ts`、`plugin/tests/unit/domain/transitions/manager-planning.spec.ts`。

禁止修改：outbox worker、Runtime、B transitions、`SubmittedIssueInput`。

执行：只给 `transitions/types.ts` 的 `SubmitManagerPlanContext` 增加 fallback 所需 A context members，不修改 B 的 `SubmittedIssueInput`；`startManagerPlanning` 用 `managerPlanningSeq`，不改 `replanCount`；`submitManagerPlan` 对业务非法 plan 调用唯一内部 `failManagerPlanningAndCreateFallback`，其签名为 `(state: MeetingState, context: SubmitManagerPlanContext & { reasonCode: ManagerFallbackReasonCode }, ids: ManagerPlanIds): TransitionResult<MeetingState>`；required blocker 转 D9 waiting；Schema parse failure 不进入 transition。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/manager-planning.spec.ts
```

PASS：正常 plan、每类业务非法 fallback、waiting、stale/terminal、event 顺序、无 mutation、counter 分离全部通过。

STOP：需要新 event/error 或修改 FR-7 fact；不得把 invalid 恢复为 error-only。失败恢复：纯 transition，无外部副作用。

### T5：required waiting 与唯一 resume

前置状态：T4 PASS。

允许修改：`plugin/src/domain/transitions/turn-advancement.ts`、`plugin/src/domain/transitions/meeting.ts`、`plugin/src/domain/transitions/speaker-attempt.ts`、`plugin/src/domain/transitions/reassign-turn.ts`、`plugin/src/runtime/application-service/meeting-control.ts`、`plugin/tests/unit/domain/transitions/speaker-attempt.spec.ts`、`plugin/tests/unit/domain/transitions/speaker-submission.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。

禁止修改：新增 resume command/route、自动替换/豁免、Client。

执行：实现 §5.4；blocking task wait 同步改用 `reason='blocking_task'` 与 `waitingSince`；Captain/local resume 共用同一 application path和 transition；resume waiting 前同时校验 domain dispatchability 与 recovered Session ownership。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/speaker-attempt.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/contract/meeting-runtime.spec.ts -t 'required|waiting|resume'
```

PASS：sync/background/overflow 均提交同 shape 且无 partial Turn；同 version 仅一 commit；未恢复返回 error 零副作用；全部恢复产生一个 plan/outbox。

STOP：需要第二 resume 入口、额外 wait 字段或部分计划；禁止改 route allowlist。失败恢复：测试 fixture 临时资源按 suite cleanup；产品无外部调用。

### T6：fingerprint、stall、refocus、replan 与 terminal

前置状态：T5 PASS。

允许修改：`plugin/src/domain/transitions/turn-advancement.ts`、新建 `plugin/tests/unit/domain/transitions/turn-advancement.spec.ts`、`plugin/tests/unit/domain/transitions/speaker-submission.spec.ts`。

禁止修改：B fact lifecycle、event vocabulary、Archive transition。

执行：实现 §5.5 helper、状态表、ID derivation 和 §5.6 event 顺序；completion 与 hard-limit 判定仍先于 stall；terminal 后不创建 outbox。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/turn-advancement.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts
```

PASS：每个 tuple component 的单独变化都会改变 fingerprint；数组乱序不改变；文本/time 不影响；first/change/refocus/replan/maxStalls/maxReplans/no_consensus/stalled 全状态表通过；termination IDs 排序且 ownership 非法时原子失败。

STOP：需要新 convergence event/state 或从 public B projection 反写 domain；不得增加摘要/NLP。失败恢复：纯 transition，无外部副作用。

### T8：authorized projection

前置状态：T7 PASS。

允许修改：`plugin/src/projection/status.ts`、`plugin/tests/contract/status-projection.spec.ts`。

禁止修改：B mapper、Client、readiness。

执行：只修改 `turn` 中 `reason` expression，以及 `projectMeetingStatus` active return object 中 `waitState/stallCount/maxStalls/replanCount/maxReplans` expressions；不得改 B 的 `pendingDecisionCandidates`、`risks`、`acceptedDecisions` 或 archive history expressions。只在 active union 输出 counters；terminal、archiving、archived 分支除共享 base 的既有字段外不得新增这四个 counters、current Turn 或 waitState。A 测试只新增 `describe("meeting convergence projection", ...)`。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/contract/protocol-schema.spec.ts
```

PASS：internal→DTO 每字段 exact；B 五项 projection 保持；Session/outbox/capability 不泄露；active/terminal exact keys 通过。

STOP：需要修改 B filter 或新增 Client state；不得建第二 projection。失败恢复：纯 mapper，无外部副作用。

### T9：repository、recovery 与原子性证明

前置状态：T8 PASS。

允许修改：`plugin/tests/contract/meeting-repository-behavior.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`、`plugin/tests/recovery/recovery.spec.ts`、`plugin/tests/unit/domain/transitions/fixtures.ts`。

禁止修改：`plugin/src/repository/**`、Storage backend/schema、migration。

执行：只增加 A command behavior assertions；reopen 后比较 wait/fingerprint/counters/managerPlanningSeq/termination/receipt/outbox；注入 commit put failure 验证 prior projection；corrupt record 继续 fail closed。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/domain-meeting-repository.spec.ts tests/recovery/recovery.spec.ts
```

PASS：checkpoint+tail、pending fallback、same receipt、different hash、rollback、corruption 全部满足 §5。

STOP：证明需要改 record format 或 migration；不得修改 persistence。失败恢复：fixture Restore 删除 exact temp root 并 close domains。

### T10：真实 DSH smoke fixture

前置状态：T9 PASS。

允许修改：`plugin/scripts/smoke-profile.mjs`、新建 `plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`。

禁止修改：B selector、profile/package、C readiness。

执行：在 B 的 `decision-risk-closure` selector/run/validation branch 已存在且不变的前提下，新增唯一 selector `convergence` 到 `SMOKE_SCENARIOS`、dispatch 和 `validateScenarioResult` 的独立 branch；不得抽取共享 scenario registry/adapter。Prepare 复用脚本独立 temp root/profile/port；Execute 固定环境命令；Assert labels 精确为 `deterministic-fallback`、`required-unavailable-deduped`、`stall-refocus-replan-exhausted`、`restart-idempotent`；Restore 必须调用 existing `restore()` 停 Host、释放 port、删除该 temp root。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile-contract.spec.ts
env CONVIVIUM_SMOKE_SCENARIO=convergence pnpm --dir plugin smoke:profile
```

PASS：contract test 证明 selector 只出现一次、unknown fail closed、assert set exact；真实命令输出 `ok:true,scenario:'convergence'` 且四 assertion 为 true，Restore 后无 Host/temp root。

STOP：spawn/provider/profile 不可用、输出不符或 Restore 失败；报告环境，不改 package/profile、不伪造 Pass。失败恢复：无论 Assert 成败都执行 `restore()`。

### T11：完整验证与 C handoff

前置状态：T10 PASS；working tree 只含本 RUNBOOK 授权文件。

允许修改：无。

禁止修改：readiness、产品代码、测试。

执行：顺序运行 focused aggregate、格式、lint、typecheck、test、build、contract/package 和 full verify；记录 HEAD、命令、退出码和 stdout 供 C 使用。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/planning.spec.ts tests/unit/domain/transitions/manager-planning.spec.ts tests/unit/domain/transitions/turn-advancement.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/unit/runtime/manager-fallback.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/recovery/recovery.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
pnpm --dir plugin format:check
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify:contract
pnpm --dir plugin verify:package
pnpm --dir plugin verify
git diff --exit-code origin/main -- plugin/src/domain/completion.ts plugin/src/domain/transitions/decision-candidate.ts plugin/src/domain/transitions/decision-acceptance.ts plugin/src/domain/transitions/decision-disposition.ts plugin/src/protocol/request-idempotency.ts plugin/src/tools/register-tools.ts
git diff --check
```

PASS：全部退出 0；A-exclusive diff 没有修改 B lifecycle/serializer/tool；scope 每行有 focused test；没有 readiness diff；交付 C 的记录含 exact HEAD/environment/commands/results/Not Covered。

STOP：任一失败；不得删 test、降级 Schema、忽略 flaky、更新 readiness 或宣告完成。失败恢复：验证只读；由所属测试完成 Restore。

## 8. 双向追踪与验证矩阵

| 行为        | requirement/interface/design                   | production                                                                                                                                                                                               | focused                                                                                                                                                                | full/readiness      |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| D6 plan     | FR-4/AC20；protocol Manager；Design §12.1-12.3 | `plugin/src/domain/planning.ts::{rankRulePlanningCandidates,planRuleBasedTurn}`                                                                                                                          | `plugin/tests/unit/domain/planning.spec.ts`                                                                                                                            | T11；C coverage     |
| D7 modes    | FR-4.3-4.6；Design §12.4                       | `plugin/src/domain/planning.ts::needsSemanticArbitration`；`plugin/src/runtime/application-service/{create-meeting,meeting-turn}.ts`                                                                     | `plugin/tests/unit/domain/planning.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`                                                                           | T11；C runtime      |
| D8 fallback | FR-4.6/FR-9.5；Storage command                 | `plugin/src/domain/transitions/manager-planning.ts::failManagerPlanningAndCreateFallback`；`plugin/src/runtime/application-service/meeting-turn.ts`                                                      | `plugin/tests/unit/domain/transitions/manager-planning.spec.ts`；`plugin/tests/unit/runtime/manager-fallback.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts` | T10/T11；C evidence |
| D9 waiting  | FR-4.7-4.8/AC20；wait/resume DTO               | `plugin/src/domain/transitions/turn-advancement.ts::advanceAfterSpeakerSubmission`；`plugin/src/runtime/application-service/meeting-control.ts`；`plugin/src/projection/status.ts::projectMeetingStatus` | `plugin/tests/unit/domain/transitions/{speaker-attempt,speaker-submission}.spec.ts`；`plugin/tests/contract/{meeting-runtime,status-projection}.spec.ts`               | T10/T11；C evidence |
| D10 stall   | FR-6.7/FR-8.7/FR-11.1；active status           | `plugin/src/domain/transitions/turn-advancement.ts::{createProgressFingerprint,hasBlockingDisagreement,advanceAfterSpeakerSubmission}`；`plugin/src/projection/status.ts::projectMeetingStatus`          | `plugin/tests/unit/domain/transitions/turn-advancement.spec.ts`；`plugin/tests/contract/status-projection.spec.ts`；`plugin/tests/recovery/recovery.spec.ts`           | T10/T11；C evidence |

验证必须覆盖：success；空/超限/非法数组原子失败；caller/capability；stale/terminal；same replay/different hash；commit rollback；restart/reopen/corruption；state/event/receipt/outbox/projection/archive termination 一致。T3-T10 的 PASS 逐项承担这些断言；任何新增步骤无法指向本表一行时删除该步骤。

## 9. 不变量、Not Applicable 与 Not Covered

不变量：每次最多一个 SpeakerAttempt；B facts 先提交后 A 读取；Repository 是唯一事实源；外部 DSH followup 在 commit 后；终态拒绝新 fact；archive 沿用现有物化/Session close/capability revoke；授权先于 receipt lookup；Client 不自行 fold。

Not Applicable：database migration（A 不改变 `formatVersion`，不增加 migration/fallback，并保留 B 对 legacy `MeetingIssue` 缺 `riskLevel` 的 optional read compatibility 与 disposition fail-closed）；DSH Session event（Meeting facts 属于 Storage Domain）；新 HTTP route/Client control（D9 复用 resume，D10 只扩展 status）；metrics/release（Non-goals）。

本次 Author/Audit 的 Not Covered：未执行 P0-T11；未迁移正式文档；未实现或测试产品代码；未产生 runtime/browser/stress evidence；未修改 readiness；未 commit/push/PR。

## 10. 完成、readiness 与删除

A 实现完成要求 T1-T11 全 PASS。随后 A 通过独立授权的 PR 合入，C 在 merged HEAD 完成最终 evidence/readiness；A 不编辑 C 文件。C 未完成时 RUNBOOK 保留，不写 completed/archive。

关闭时先确认 D6-D10 只存在于正式 requirements/interfaces/designs，实际结果已进入 C readiness，Not Covered 已迁移；运行 `rg -n 'RUNBOOK-MEETING-CONVERGENCE|Meeting Convergence' .` 清理仅指向本文件的引用，再删除本 RUNBOOK，重新执行 Markdown 相对链接检查、Prettier 和 `git diff --check`。任一条件失败即恢复文件并 STOP。

## 11. Audit

结论：`Executable`。D6-D10 已唯一确定；B-first、baseline 和验证失败仅形成机械 STOP，不再需要产品判断。Required Structure、数据/接口、文件/symbol、每步格式、失败恢复、双向追踪、验证矩阵、Not Applicable、readiness 与删除条件均已覆盖。执行者不得把当前 P0 可能因 B 尚未合入而 STOP 误写为 `Blocked` 或自行建立空接口。

## 12. Related Documents

- [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)
- [Document Rules](../00-governance/DOCUMENT-RULES.md)
- [TODO Rules](../00-governance/TODO-RULES.md)
- [PR Rules](../00-governance/PR-RULES.md)
- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)
- [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)
- [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)
