# RUNBOOK：Decision And Risk Closure

## 1. 状态与目标

- 模式：`Author` 后按 `Audit` 从零复核；结论：`Executable`。
- 建立日期：2026-09-03；实现基线：`7291ba012475915e02648addb60ca3c6223425e1`；DSH：`0.1.1-rc.2`。
- 执行分支：`codex/decision-risk-closure-runbook`。
- 当前交付只形成并审计本文件；不实现产品代码，不 commit、push 或创建 PR。
- 产品终点：FR-7 的 Proposal revision、Position、Decision candidate、Captain acceptance、Decision supersede/revoke 和单 Issue risk disposition 经同一 Meeting Domain、协议、Repository commit、projection、Client 和 archive 链路闭合。

用户于 2026-09-03 确认的 D1-D5 是正式人工决定。必须先把它们迁移到 requirements、interfaces、designs；本 RUNBOOK 不是长期真相源。

## 2. 执行者契约

执行者必须从当前最前面的未完成步骤按编号执行。每步只修改列出的文件和 symbol，不得提前后续步骤或替换同义 DTO、event、helper、adapter、测试入口。

`PASS` 表示所有命令退出码为 0 且断言成立。`STOP` 后不得继续；报告最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、实际输出和所需人工决定。不得清理、覆盖或回滚用户改动。

始终禁止：

- 修改 `MeetingRepositoryPort`、`DomainMeetingRepository`、receipt key/record、outbox worker、checkpoint/tail recovery、Storage backend 或 DSH Session event；
- 新增 HTTP decision/risk 写 route、第二 projection、registry、adapter、feature flag、fallback、迁移层、依赖或通用 canonical JSON；
- 修改 `advanceAfterSpeakerSubmission`、planning、required-Participant waiting、progress fingerprint、stall/refocus/replan、termination 或 A 线 smoke selector；
- 更新 `docs/40-readiness/`；C 在 B、A 合并后独占 readiness；
- 用类型断言、放宽 Schema、默认 riskLevel、吞错或删除断言使验证通过；
- 实现 deterministic consensus、authorized-risk auto-accept 或其他 auto-accept。V1 只有显式 Captain acceptance，以及 supersede 内部复用同一 guards 的 replacement acceptance。

## 3. Scope、Non-goals 与所有权

### Scope

- Proposal revision 独立保存，新 revision 的 `positions=[]`，不继承旧 Position、Decision 或 CompletionFact。
- `MeetingDecisionCandidate` 为内部不可变记录；Captain/loopback local user 获得派生 `pendingDecisionCandidates`，其他 caller 获得空数组。
- `convivium_accept_decision` 继续产生 `decision.accepted`；新增 Captain-only `convivium_dispose_decision` 原子 supersede/revoke。
- `convivium_dispose_risk` 按 D4 验证 riskLevel、hard constraint、状态、证据、幂等和终态，只处置一个 Issue。
- status、现有 loopback GET、Client 只读展示、event、receipt、recovery regression、archive required-set。
- B 拥有上述 facts/contracts/projection/focused tests 和一个固定 smoke fixture。

### Non-goals

- stall/refocus/replan、convergence、Agent catalog/admission、Meeting Agent Definition runtime、Scribe、通用 metrics/stress。
- Candidate reject/revoke command或持久 status；Client control；decision/risk HTTP 写接口；远程身份。
- shared repository/receipt/outbox/checkpoint/recovery 算法；本线只验证。
- 归档 Candidate；archive 只保存 Decision history、全部 Issue 和 CompletionFact。

### A/B/C 顺序

1. B 先提交 FR-7 facts/contracts/tests 和 `decision-risk-closure` smoke fixture。
2. A rebase 后只消费 B 类型和 `serializeValidatedRequestV1`，实现 convergence；不得复制 B state、transition、Schema、fixture 或 serializer。
3. C 在 B→A 最终 SHA 上验证并只写 readiness；不得修改 product、fixture 或 runner。

共享文件 `plugin/src/domain/model.ts`、`plugin/src/protocol/types.ts`、`plugin/src/projection/status.ts`、`plugin/src/runtime/application-service/meeting-turn.ts`、`plugin/tests/unit/domain/transitions/fixtures.ts`、`plugin/scripts/smoke-profile.mjs` 由 B 先改本文 FR-7 symbol；A rebase 后只改 §6.1 分配给 A 的 symbol。`plugin/src/domain/completion.ts` 仅 B 修改；`plugin/src/runtime/outbox-worker.ts` 仅 A 修改 `OutboxWorkerOptions.onTerminalFailure` 和 `runOnce` 的 terminal-failure callback。

## 4. 真相源与断点

裁决顺序：

1. [Architecture](../00-governance/ARCHITECTURE.md)：Meeting Domain 是唯一事实源；Frontend 只读类型化 projection；无 DSH Session event。
2. [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-7、FR-8、FR-11 与 AC-7/8/13/16/26/27。
3. [Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) command/status/event/error/archive。
4. [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) authorization/version/request/receipt/commit/recovery。
5. [Domain Design](./DOMAIN-MODEL-DESIGN.md)、[Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)、[Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)。
6. `plugin/src` 和 tests 是结构基线与证据，不覆盖 requirement 行为。

当前断点：接口仍称 candidate 不公开；设计仍含 `decision.added`、扁平 Position 或错误 Issue status；代码缺 pending/risk projection、Decision disposal/history、`riskLevel` 和统一 serializer。requirements、interfaces、designs 迁移先消除冲突；若 D1-D5 外仍需产品决定则 STOP。

DSH rc.2 边界：沿用 `defineTool`/registry/fiber、JSON result/纯 renderer；Meeting durable state 只入 Storage Domain Repository；Client 整体消费 wire projection。不新增 Service、Provider、job、Session projection或依赖。

## 5. Canonical 契约

### 5.1 Proposal、Position、Candidate

- `MeetingProposal` 由 `domain/model.ts` 拥有。同一 id 的 revision 为新数组记录；旧项 `superseded`，新项 `revision=old+1,status=under_review,positions=[]`；旧 Position/Decision/Candidate/Fact 保留但不复制。
- Position 唯一 shape：`{id,participantId,position,reason?,blocking,proposalRevision}`；`position` 为 `support|accept|object|needs_revision|abstain`。不加 `proposalId/updatedAt`。
- Candidate 保持 `{id,proposalId,proposalRevision,statement,rationale,proposedBy,sourceMessageId,agendaItemId,createdAt}`，全部 required、不可变、无 status。
- 新 `PublicDecisionCandidateV1` 同字段同 required。discussion status 的 `pendingDecisionCandidates` required；Captain/local 返回派生数组，manager/participant 返回 `[]`。
- pending 唯一谓词：Meeting status 为 `created|running|waiting|paused|converging`；candidate 对应非 superseded 且同 proposal 最大 revision；不存在 `id === "decision-" + candidate.id` 的 Decision。保持 state 顺序。acceptance、新 revision、execution-terminal 后不 pending。

### 5.2 Decision

`MeetingDecision`/`PublicDecisionV1` 新增 optional `supersededByDecisionId?: string`；新 producer 对 superseded 必填，对 accepted/revoked 省略。archive-facing `agendaItemId/statement/rationale/acceptedBy/dissentingPositionIds` 保持 optional，新 producer有事实即填。

新增协议类型：

```ts
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

唯一 Result Schema 位于 `plugin/src/protocol/results.ts`，并由 `plugin/src/protocol/index.ts` 直接导出：

```ts
export const CaptainDecisionDispositionResultSchema: Schema<
  Record<string, unknown>
>;
```

该 Schema 拒绝额外字段。`requestId`、`decisionId`、`action`、`completionFactId` 始终 required；`action="supersede"` 时 `replacementDecisionId` required；`action="revoke"` 时必须省略 `replacementDecisionId`。Schema 成功输出与 `CaptainDecisionDispositionResultV1` 同 shape，不增加第二个 DTO 或 mapper。

`validateCaptainDecisionDispositionInput(value: unknown)` 必须强制 ID non-empty、`reason.trim()` non-empty、evidence 至少一个且 non-empty/唯一；supersede 必须有 non-empty replacement，revoke 必须省略。结果仅 supersede 有 `replacementDecisionId`。

唯一新 transition：

```ts
export type DisposeDecisionInput =
  | Readonly<{
      meetingId: string;
      requestId: string;
      decisionId: string;
      action: "supersede";
      replacementCandidateId: string;
      actorBinding: string;
      reason: string;
      evidenceMessageIds: readonly string[];
      now: number;
    }>
  | Readonly<{
      meetingId: string;
      requestId: string;
      decisionId: string;
      action: "revoke";
      actorBinding: string;
      reason: string;
      evidenceMessageIds: readonly string[];
      now: number;
    }>;
export function disposeDecision(
  state: MeetingState,
  input: DisposeDecisionInput,
): TransitionResult<MeetingState>;
```

目标 Decision 必须 `accepted`。supersede 对 replacement 调用 `acceptDecisionCandidate` 的 current revision/source/agenda/support/blocking/evidence guards；同 transition 创建 replacement、将旧 Decision 改 `superseded` 并写 link、创建 supersession Fact。revoke 改旧 Decision 为 `revoked` 并创建 revocation Fact。旧 acceptance Fact 不删除或改写。

Decision disposal 在 `completed`、`partial`、`no_consensus`、`cancelled`、`failed`、`archiving` 抛 `IMMUTABLE_MEETING`，在 `archived` 抛 `ARCHIVED_MEETING`；两类错误均零副作用。

Fact ID 为 `completion-${requestId}-decision-supersession|decision-revocation`；`subjectId=旧 decisionId,assertedBy=actorBinding,authority=captain,reason=trim 后值,evidenceMessageIds=输入顺序,taskIds=[],status=active`。kind/result 只新增 `decision_supersession/superseded`、`decision_revocation/revoked`。

event：

- acceptance 保持 `decision.accepted` payload `{candidateId,decisionId,proposalId,proposalRevision,actorBinding}`；不支持 `decision.added` 或兼容层。
- supersede 同 commit 先 replacement `decision.accepted`，再 `decision.superseded` payload `{decisionId,supersededByDecisionId,completionFactId,actorBinding}`。
- revoke 为 `decision.revoked` payload `{decisionId,completionFactId,actorBinding}`。
- supersede `eventSeq +2`，revoke `+1`；Repository meetingVersion 均 `+1`；`outbox=[]`。

### 5.3 Risk

`RiskLevelV1="low"|"medium"|"high"`。`IssueClaimV1.riskLevel` 和新 `MeetingIssue.riskLevel` required。旧持久 JSON 可缺字段；public/archive 用 `riskLevel?` 表示 legacy；risk disposition 缺失即 fail closed，不推默认。新 Issue producer必须复制。

`PublicRiskV1` 精确字段：`id,title,description,sourceMessageId,agendaItemId?,affectedOutputIds,affectedCriterionIds,violatedConstraintIds,blockingObjectionIds,blocking,riskLevel?,impact,urgency,reversibility,safeDefaultAvailable,disposition,status,rationale?,ownerId?,relatedTaskIds`，类型对应 `MeetingIssue`。discussion `risks` required；Captain/local 返回全部，其他 caller `[]`，保持 state 顺序。

| 前置                                                                                                         | accept                                                          | reject                                           |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------ |
| status 是 `open` 或 `accepted_risk`；有 riskLevel；无 violatedConstraintIds；rank 不高于 acceptableRiskLevel | `status=accepted_risk,disposition=accepted_risk,blocking=false` | `status=open,disposition=blocking,blocking=true` |
| status 是 `resolved`、`deferred` 或 `out_of_scope`                                                           | `INVALID_ENTITY_STATE`                                          | `INVALID_ENTITY_STATE`                           |
| riskLevel 缺失                                                                                               | `INVALID_ENTITY_STATE`                                          | `INVALID_ENTITY_STATE`                           |
| riskLevel 超阈值或 violatedConstraintIds 非空                                                                | `INVALID_ENTITY_STATE`                                          | `INVALID_ENTITY_STATE`                           |

所有 action 要求 meeting 匹配、trim 后 reason 非空、evidence 至少一个且 non-empty/唯一/属于本 Meeting。execution terminal/archiving 返回 `IMMUTABLE_MEETING`；archived 返回 `ARCHIVED_MEETING`。不同 request 的合法处置将该 issue 所有旧 active `risk_acceptance` Fact supersede（不按 actor），再建 active Fact；result accept→`accepted`、reject→`rejected`，ID `completion-${requestId}-risk-0`。同 request 由 receipt replay。

risk 成功 result 保持 `{requestId,issueId,disposition:"accepted"|"rejected",completionFactId,meetingStatus}`。每次合法处置只产生现有 `completion_fact.added`，payload 为 `{meetingId,completionFactId,kind:"risk_acceptance",subjectId:issueId,meetingVersion:提交前 state.version}`；不新增 risk 专用 event，`outbox=[]`。

`blockingFacts` Issue 谓词唯一为 `status==="open" && disposition==="blocking" && blocking===true`；Question 分支不变。

### 5.4 Request、actor、version、错误

新增 `plugin/src/protocol/request-idempotency.ts`：

```ts
export function serializeValidatedRequestV1(value: object): string;
```

实现执行 `JSON.stringify(value)`；若结果 `undefined` 抛 `TypeError`，否则原样返回。只接收 Schema/validator 后对象；数组顺序有语义，undefined 省略，字符串不额外 normalization；无 crypto，不调 repository canonical-json，不改变 receipt 字符串语义。B 只迁移 `acceptDecision/disposeDecision/disposeRisk`，其他 command 不改；A 后续 import。

参数类型固定为内建 `object`，不是 `plugin/src/repository/types.ts:JsonObject`。`protocol/` 按既有依赖规则不得导入 `repository/`；A 的 plain object `{attemptId,reasonCode,observedMeetingVersion}` 可直接传入，不需要 alias、cast 或 adapter。

actor 不来自 payload。authorization 固定 `callerBinding=session:${caller.sessionId}`、`capabilityId=captain:${caller.sessionId}`；Fact actor 为 `captain:${caller.sessionId}`。application 每 command 只取一次 `now`。

Repository 固定顺序：authorization→receipt→idempotency conflict→expected version→transition→单 commit。相同 key/hash replay 原 result/version/eventSeqs；不同 serialization 为非重试 `IDEMPOTENCY_CONFLICT`；stale 为可重试 `VERSION_CONFLICT`；成功 version +1。Schema/validator 和 `INVALID_ENTITY_STATE` 映射非重试 `INVALID_ARGUMENT`；非 Captain/Meeting mismatch 为非重试 `UNAUTHORIZED_CALLER`；terminal 保留 domain code。失败无 state/event/receipt/outbox/memory publish。

### 5.5 Projection、HTTP、Client、archive、recovery

- `DiscussionMeetingStatusBaseV1` 新增 required `pendingDecisionCandidates`、`risks`；`acceptedDecisions` 只含 accepted。普通 participant/manager 两新数组为空且不进入 speaker/manager context。
- 现有 `GET /api/convivium/meetings/:meetingId` 用 `{kind:"local_host",sessionId:"loopback-web"}` 调同一 projection；不加 route。
- Client 在现有 panel 增只读 Pending decisions/Risks 区块和固定 empty state；无 button、mutation、缓存、second fetch。
- ArchivePackage/PublicArchivePackage 新增 required `decisionHistory`（全部 Decision）；`acceptedDecisions` 仅当前 accepted。Archive Decision含 optional superseded link。
- archive 保留全部 Issue（legacy riskLevel optional）和全部 Fact，包括旧 acceptance、superseded risk、新 disposition。
- archive assertion 比较全量 history、current accepted、Issue、Fact ID/status/reference；superseded target 必须存在于 history，其他 status 不得有 link。target 后续可以被 revoke，archive 不要求其最终仍为 accepted。
- 不改 recovery 或 formatVersion。legacy 无 riskLevel 可恢复、处置 fail closed；reopen 后 projection/history/Fact/event/receipt 一致。

## 6. 文件、symbol 与追踪

| 行为              | production symbol                                                                                                                                                                                          | focused test                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| revision/Position | `plugin/src/domain/transitions/proposal-position.ts:applySubmittedProposalPositionClaims`                                                                                                                  | `plugin/tests/unit/domain/transitions/proposal-position.spec.ts`                                                         |
| Issue producer    | `plugin/src/protocol/commands.ts:issueClaim`; `plugin/src/domain/transitions/issue.ts:addSubmittedIssues`                                                                                                  | `plugin/tests/unit/domain/transitions/issue.spec.ts`; `plugin/tests/contract/protocol-schema.spec.ts`                    |
| Candidate/pending | `plugin/src/domain/transitions/decision-candidate.ts:addSubmittedDecisionCandidates`; `plugin/src/projection/status.ts:projectMeetingStatus`                                                               | `plugin/tests/unit/domain/transitions/decision-candidate.spec.ts`; `plugin/tests/contract/status-projection.spec.ts`     |
| acceptance        | `plugin/src/domain/transitions/decision-acceptance.ts:acceptDecisionCandidate`; `plugin/src/runtime/application-service/meeting-decision.ts:createMeetingDecisionApplication`                              | `plugin/tests/unit/domain/transitions/decision-acceptance.spec.ts`; `plugin/tests/contract/meeting-runtime.spec.ts`      |
| disposal          | new `plugin/src/domain/transitions/decision-disposition.ts:disposeDecision`                                                                                                                                | new `plugin/tests/unit/domain/transitions/decision-disposition.spec.ts`; `plugin/tests/contract/meeting-runtime.spec.ts` |
| risk              | `plugin/src/domain/completion.ts:applyCompletionClaims`; `plugin/src/runtime/application-service/meeting-control.ts:disposeRisk`                                                                           | `plugin/tests/unit/domain/completion.spec.ts`; `plugin/tests/contract/meeting-runtime.spec.ts`                           |
| protocol/tool     | `plugin/src/protocol/types.ts`; `plugin/src/protocol/commands.ts`; `plugin/src/protocol/results.ts`; `plugin/src/protocol/status.ts`; `plugin/src/protocol/index.ts`; `plugin/src/tools/register-tools.ts` | `plugin/tests/contract/protocol-schema.spec.ts`; `plugin/tests/contract/tool-registration.spec.ts`                       |
| serializer        | new `plugin/src/protocol/request-idempotency.ts:serializeValidatedRequestV1`                                                                                                                               | new `plugin/tests/unit/protocol/request-idempotency.spec.ts`                                                             |
| Client            | `plugin/src/client/meeting-panel-view.tsx:createMeetingPanelView`; `plugin/src/client/meeting-panel.tsx:MeetingPanel`                                                                                      | `plugin/tests/client/client-entry.client.spec.ts`                                                                        |
| archive           | `plugin/src/runtime/services/meeting-archive-service.ts:materializeArchivePackage`; `plugin/src/domain/transitions/archive.ts:assertArchivePackageMatchesMeeting`                                          | `plugin/tests/unit/domain/transitions/archive.spec.ts`; `plugin/tests/unit/runtime/archive.spec.ts`                      |
| atomic/recovery   | shared symbols only, no production modification                                                                                                                                                            | `plugin/tests/contract/domain-meeting-repository.spec.ts`; `plugin/tests/recovery/domain-recovery.spec.ts`               |
| smoke             | `plugin/scripts/smoke-profile.mjs` selector `decision-risk-closure`                                                                                                                                        | `plugin/tests/unit/scripts/smoke-environment.spec.ts`; real profile                                                      |

不存在的新 symbol 只能使用上表路径。`plugin/src/domain/index.ts`、`plugin/src/protocol/index.ts`、`plugin/src/runtime/application-service/index.ts` 只加直接 export。

| Requirement           | Interface symbol                                                | Design responsibility                 | Production                                               | Focused                              | Full/readiness               |
| --------------------- | --------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- | ------------------------------------ | ---------------------------- |
| FR-7.1/4, AC-8        | `ProposalClaimV1`, `PositionClaimV1`                            | revision isolation/nested Position    | `applySubmittedProposalPositionClaims`                   | `proposal-position.spec.ts`          | `plugin verify`; C readiness |
| FR-7.2/3              | `PublicDecisionCandidateV1`, `pendingDecisionCandidates`        | immutable candidate/pending predicate | `addSubmittedDecisionCandidates`, `projectMeetingStatus` | candidate/status specs               | same gate/writer             |
| FR-7.3/5, AC-7        | `CaptainDecisionAcceptanceInputV1`, `decision.accepted`         | acceptance guards                     | `acceptDecisionCandidate`, `acceptDecision`              | acceptance/runtime specs             | same gate/writer             |
| FR-7.6, AC-27         | `CaptainDecisionDispositionInputV1`, `decisionHistory`          | atomic disposal/archive history       | `disposeDecision`, archive symbols                       | disposition/archive specs            | same gate/writer             |
| FR-7.7, FR-8.9, AC-26 | `IssueClaimV1`, `CaptainRiskDispositionInputV1`, `PublicRiskV1` | risk matrix/fact replacement          | `applyCompletionClaims`, `disposeRisk`                   | completion/runtime specs             | same gate/writer             |
| FR-11.1/5/7           | discussion status/HTTP response Schemas                         | caller projection/read-only Client    | `projectMeetingStatus`, Client symbols                   | status/http/client specs             | same gate/writer             |
| AC-13                 | `serializeValidatedRequestV1`, storage command contract         | validated JSON/atomic commit/recovery | serializer + unchanged repository                        | serializer/repository/recovery specs | same gate/writer             |

### 6.1 A/B 最终交叉矩阵

| 能力                          | 唯一 owner                             | producer                                             | consumer                                                                   | 精确文件/symbol                                                                                                                                                                                                                                                                                                                                                                     | 顺序             | 重复/冲突                                                                                   |
| ----------------------------- | -------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| D1-D5 requirements            | B                                      | B 已完成 requirements 迁移                           | A T1 只保留并引用                                                          | `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`：B 只改 FR-7、FR-8.1/8.4/8.9、FR-11.1/11.5/11.7 中 Decision/risk 句子及 AC-7/8/13/16/26/27 中 FR-7 断言                                                                                                                                                                                                                | B→A              | 无重复；A 只追加 D6-D10 句子                                                                |
| D6-D10 requirements           | A                                      | A T1                                                 | B 不消费                                                                   | 同文件：FR-4、FR-6.7、FR-8.7、FR-9.4/9.5、FR-11.1/11.5 中 counters/Turn reason及 AC-5/6/13/16/20 的 convergence 断言                                                                                                                                                                                                                                                                | B→A              | B 禁止修改这些句子                                                                          |
| Agent Protocol                | B lifecycle；A convergence             | B/A 各自产生所属 DTO/Schema                          | tools/runtime/Client                                                       | `AGENT-MEETING-PROTOCOL-INTERFACE.md`；B symbols 为 §5 的 Candidate/Decision/risk/status/archive；A symbols 为 `ManagerPlanResultV1`、`PublicMeetingWaitStateV1`、`PublicTurnV1.reason`、active counters                                                                                                                                                                            | B→A              | 同文档顺序编辑，无同名 member                                                               |
| Domain/Orchestration designs  | B lifecycle；A convergence             | B 已完成 designs 迁移；A T1                          | production steps                                                           | `DOMAIN-MODEL-DESIGN.md`、`MEETING-ORCHESTRATION-DESIGN.md`：B 只写 §5 lifecycle；A 只写 planning/wait/fingerprint/stall/terminal                                                                                                                                                                                                                                                   | B→A              | event vocabulary共享但不重复定义；B events固定，A复用既有 `meeting.replanned/meeting.ended` |
| Domain model                  | B fact types；A orchestration fields   | domain transitions                                   | projection/runtime/archive                                                 | `plugin/src/domain/model.ts`：B owns `DomainEventTypes` 的三类 Decision event、`MeetingIssue.riskLevel`、`MeetingDecision.supersededByDecisionId`、Candidate/CompletionFact/Archive FR-7 members；A owns `MeetingState.managerPlanningSeq`、`MeetingTurn.reason`、wait types                                                                                                        | B→A              | 无 member 重名；A 不改 B optionality                                                        |
| Protocol types/status/results | B FR-7；A D6-D10                       | protocol codec                                       | tools/projection/Client                                                    | `plugin/src/protocol/types.ts`、`status.ts`：B owns `PublicDecisionCandidateV1`、`CaptainDecisionDisposition*`、`PublicRiskV1`、`pendingDecisionCandidates`、`risks`、`decisionHistory`；`plugin/src/protocol/results.ts`：B owns `CaptainDecisionDispositionResultSchema`，A owns `CreateMeetingResultSchema`、`ManagerPlanResultSchema`；A owns Manager/wait/Turn reason/counters | B→A              | 同文件按 symbol/member 分工，无重复 Schema 或 mapper                                        |
| Base protocol Schema          | 无 D1-D10 新 owner                     | existing protocol                                    | all commands                                                               | `plugin/src/protocol/schema.ts` 保持不变；已含 A 所需 error codes                                                                                                                                                                                                                                                                                                                   | Not Modified     | A T2 明确禁止修改                                                                           |
| Request serialization         | B                                      | `serializeValidatedRequestV1(value: object): string` | B commands；A `manager_fallback`                                           | new `plugin/src/protocol/request-idempotency.ts`                                                                                                                                                                                                                                                                                                                                    | B→A import       | A 按最终 `object` 签名直接 import；无第二 helper                                            |
| Projection mapper             | B FR-7 fields；A convergence fields    | `MeetingState`                                       | status tool/local GET/Client                                               | `plugin/src/projection/status.ts:projectMeetingStatus`：B owns pending/risk/accepted/history filters；A owns counters/wait/Turn reason；`projectManagerMeetingContext` 仅 A                                                                                                                                                                                                         | B→A              | 一个 mapper，无 adapter/第二 projection                                                     |
| Completion/convergence seam   | B facts；A progression                 | B `applyCompletionClaims` 产生 facts                 | A `advanceAfterSpeakerSubmission`/completion recomputation读取提交后 state | `plugin/src/domain/completion.ts`：B only risk branch、risk Fact replacement、Issue predicate；A 不修改；`plugin/src/domain/transitions/turn-advancement.ts`：A only                                                                                                                                                                                                                | B→A              | 无重复 transition                                                                           |
| `submitTurn` seam             | B issue mapping；A planning/fallback   | `createMeetingTurnApplication.submitTurn`            | `submitSpeakerAndAdvanceMeeting`                                           | `plugin/src/runtime/application-service/meeting-turn.ts`：B 只给 issue mapping增加 `riskLevel`；A 后续只改 planning IDs、Manager fallback及调用 B serializer                                                                                                                                                                                                                        | B→A              | 同 function不同语句，A rebase后编辑                                                         |
| Risk command convergence tail | B risk commit；A post-fact progression | B `disposeRisk` 产生 Issue/Fact                      | 现有 `judgeTurnCompletion` block，随后由 A 收口 D6-D10                     | `plugin/src/runtime/application-service/meeting-control.ts:disposeRisk`：B owns validation/transition/result/serializer；A only owns该 transition 后的 convergence composition                                                                                                                                                                                                      | B→A              | B 保留现有 tail，只把其 `now` 改为 command single-read；A 不改 B contract                   |
| Shared fixture                | B FR-7 fields；A orchestration fields  | test builders                                        | both suites                                                                | `plugin/tests/unit/domain/transitions/fixtures.ts`：B 加 riskLevel/Decision fixtures；A 后加 `managerPlanningSeq:0`/wait/Turn fields                                                                                                                                                                                                                                                | B→A              | 同 builder顺序扩字段，无第二 fixture                                                        |
| Smoke runner                  | B/A 各一 selector                      | real profile                                         | C 最终执行                                                                 | `plugin/scripts/smoke-profile.mjs`：B `decision-risk-closure`；A `convergence`；B test为 `smoke-environment.spec.ts`，A test为 new `smoke-profile-contract.spec.ts`                                                                                                                                                                                                                 | B→A→C            | selector/label不重复，不复制 runner                                                         |
| Repository/recovery           | existing shared owner                  | `DomainMeetingRepository`                            | B/A commands                                                               | `plugin/src/repository/**`、checkpoint、receipt、recovery production均 Not Modified                                                                                                                                                                                                                                                                                                 | regressions only | 无 adapter、migration、compat layer                                                         |
| Outbox terminal failure       | A                                      | `OutboxWorkerOptions.onTerminalFailure`/`runOnce`    | A Manager fallback                                                         | `plugin/src/runtime/outbox-worker.ts`                                                                                                                                                                                                                                                                                                                                               | A after B        | B 禁止触碰；唯一获准 outbox worker变化                                                      |
| Readiness                     | C                                      | merged B→A SHA evidence                              | release decision                                                           | `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`                                                                                                                                                                                                                                                                                    | C last           | B/A均不写                                                                                   |

交叉结论：`Compatible`。A 的 P0 在 B 合入后校验最终 FR-7 types、conditional Result Schema、tool、projection、serializer 和 focused tests；A 后续只消费这些 contract 并实现 D6-D10，C 最后在 B→A merged SHA 写 readiness。双方未重复 state、Schema、transition、adapter、fixture、runner 或 readiness writer。

反向核对：每项剩余修改均属于表中行为；T11 仅验证。Non-goals 无 production step。

## 7. 不变量

1. Candidate 不等于 Decision；revision 后旧 Candidate 保留但不 pending/不可接受。
2. 新 revision 不继承 Position 或接受结果。
3. Captain/replacement acceptance 使用同一 guards；无 auto-accept。
4. actor/reason/evidence/time 和旧 Fact 不伪造、不删除。
5. risk command 只改一个 Issue；disposal 只改旧 Decision，supersede 另新增 replacement。
6. command 单 commit 写 state/ordered events/receipt/`outbox=[]`；put 失败不 publish。
7. authorization 先于 replay；replay 不增 version/event/Fact/outbox。
8. status/HTTP/Client/archive 均从 MeetingState 派生。
9. execution terminal、archiving、archived 拒写。
10. B 不实现 A convergence，不写 C readiness。

## 8. 机械步骤

### T7：Application、Runtime、tools

前置状态：T6 完成 commit 的产品/正式文档树已包含并验证 Issue/risk domain；T6 focused tests、ESLint 和 Prettier 已 PASS。

允许修改：`plugin/src/runtime/meeting-runtime.ts:MeetingToolRuntime`、`plugin/src/runtime/application-service/meeting-decision.ts:createMeetingDecisionApplication`、`plugin/src/runtime/application-service/meeting-control.ts:disposeRisk`、`plugin/src/runtime/application-service/index.ts`、`plugin/src/tools/register-tools.ts:registerCreateAndStatusTools`；`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`。

禁止修改：repository、meeting-turn、HTTP。

执行：新增 `disposeDecision` 和 tool；三个 B command 用 serializer、单次 now、Captain binding；disposal调纯 transition；risk调T6。`disposeRisk` 中现有 `judgeTurnCompletion`/`meeting.replanned` composition 由 A 拥有，B 不改变其判断、state 或 event；B 只把其时间参数改用同一 `commandNow`。两类 B command outbox空。测试 unauthorized/version/replay/hash conflict/terminal/result/event/receipt/outbox/put failure。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/runtime/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：authorization-before-replay、replay/conflict/version+1/zero outbox直接断言。

STOP：需 shared repository/A transition。

失败恢复：临时测试存储，无外部数据；保留 diff。

### T8：Projection、HTTP、Client

前置状态：T7 PASS。

允许修改：`plugin/src/projection/status.ts:projectMeetingStatus`、`plugin/src/client/meeting-panel-view.tsx:createMeetingPanelView`、`plugin/src/client/meeting-panel.tsx:MeetingPanel`；`plugin/tests/contract/status-projection.spec.ts`、`plugin/tests/contract/http-boundary.spec.ts`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：speaker/manager context shape、route table、Client mutation/cache/CSS framework。

执行：实现§5 mappers/caller visibility/accepted filter；Client 两只读区块。测试 revision/acceptance/terminal pending消失、隔离、blocking predicate、local GET、empty state。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/contract/http-boundary.spec.ts tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：三层字段一致，Participant 无实际 candidate/risk。

STOP：需写 route/button/second fetch。

失败恢复：无外部数据；保留 diff。

### T9：Archive 与 recovery compatibility

前置状态：T8 PASS。

允许修改：`plugin/src/domain/model.ts` archive types、`plugin/src/runtime/services/meeting-archive-service.ts:materializeArchivePackage`、`plugin/src/domain/transitions/archive.ts:assertArchivePackageMatchesMeeting`；`plugin/tests/unit/domain/transitions/archive.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`、`plugin/tests/recovery/domain-recovery.spec.ts`。

禁止修改：`plugin/src/repository/domain/schemas.ts`、formatVersion、repository/recovery算法、checkpoint/backend/Session cleanup。

执行：history/current accepted双 projection；全部 Issue/Fact；superseded link；legacy可读但处置fail closed；测试 checkpoint/tail/reopen一致。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/domain-recovery.spec.ts tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：archive、legacy、restart/replay、corruption、rollback通过。

STOP：需 formatVersion/migration/recovery算法。

失败恢复：仅临时 storage；保留 diff。

### T10：唯一 B smoke fixture

前置状态：T9 PASS。

允许修改：`plugin/scripts/smoke-profile.mjs` 的 scenario 列表、guard、新 `decision-risk-closure` run/validation；`plugin/tests/unit/scripts/smoke-environment.spec.ts`。

禁止修改：其他 selector、runner、A selector、readiness。

执行：真实 profile依次 candidate visibility→accept→new revision/replacement→supersede→revoke→risk accept→reject，每次重读 status；断言 history/current/pending/risk/blocking/replay/event order。不复制 mapper。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-environment.spec.ts
CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure pnpm --dir plugin smoke:profile
```

PASS：fixture与真实 profile成功。

STOP：环境不可用则记录命令/输出并标 runtime smoke `Not Covered`；不得模拟成功或改 runner。

失败恢复：现有 finally 清理临时 workspace；保留 diff。

### T11：完整验证与移交

前置状态：requirements、interfaces、designs 迁移已完成并验证 PASS；T7-T9 PASS；T10 fixture PASS；真实 smoke 可仅因环境为 Not Covered。

允许修改：无；本步骤只运行检查命令。

禁止修改：readiness、Non-goals、依赖、commit/push/PR。

执行：运行 focused aggregate、Prettier check、完整 verify、链接、唯一文件、禁词和 diff 检查；把输出交给 C，不写 readiness。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/protocol/request-idempotency.spec.ts tests/unit/domain/transitions/proposal-position.spec.ts tests/unit/domain/transitions/issue.spec.ts tests/unit/domain/transitions/decision-candidate.spec.ts tests/unit/domain/transitions/decision-acceptance.spec.ts tests/unit/domain/transitions/decision-disposition.spec.ts tests/unit/domain/completion.spec.ts tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts tests/contract/http-boundary.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/domain-recovery.spec.ts tests/client/client-entry.client.spec.ts tests/unit/scripts/smoke-environment.spec.ts
pnpm --dir plugin format:check
pnpm --dir plugin verify
python3 - <<'PY'
from pathlib import Path
import re,sys
p=Path('docs/30-designs/RUNBOOK-DECISION-RISK-CLOSURE.md'); bad=[]
for t in re.findall(r'\[[^]]+\]\(([^)]+)\)',p.read_text()):
    if '://' not in t and not (p.parent/t.split('#',1)[0]).resolve().exists(): bad.append(t)
print('\n'.join(bad)); sys.exit(bool(bad))
PY
test "$(find docs/30-designs -maxdepth 1 -type f -name 'RUNBOOK-*.md' -print)" = "docs/30-designs/RUNBOOK-DECISION-RISK-CLOSURE.md"
! rg -n 'decision\.added|RUNBOOK-CROSS-REVIEW' docs/10-requirements docs/20-interfaces docs/30-designs plugin/src plugin/tests -g '!RUNBOOK-DECISION-RISK-CLOSURE.md'
! rg -n '按[需]|相关文[件]|必要测[试]|或等[价]|自行选[择]|合适方[案]|合理兼[容]|必要时新[增]' docs/30-designs/RUNBOOK-DECISION-RISK-CLOSURE.md
git diff --check
```

PASS：focused/format/verify/link/unique-runbook/禁词/diff通过；smoke通过或仅环境Not Covered。

STOP：产品 test/type/lint/build/contract/package失败，不放宽。

失败恢复：检查命令不写产品文件；保留 diff/output。

## 9. 验证、完成与删除

| 风险                  | 必须断言                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| success               | discover→accept→supersede→revoke；risk accept→reject；唯一 state/result/event               |
| invalid/authority     | blank/duplicate/unknown/cross-meeting/conditional字段零副作用；Captain-only；projection隔离 |
| stale/terminal        | stale conflict；五 execution terminal、archiving、archived拒写                              |
| idempotency/atomicity | replay原 receipt；array reorder conflict；supersede event有序；put失败全不变                |
| lifecycle/projection  | revision清空 Position；pending三消失条件；blocking三条件；status→HTTP→Client一致            |
| archive/recovery      | history/current、全部 Issue/Fact、legacy risk、checkpoint/tail/reopen一致                   |
| DSH/full              | 现有 registry/renderer/fiber；无 Session event；T11 verify；T10 profile或环境Not Covered    |

完成条件：requirements、interfaces、designs 迁移已完成并验证 PASS；T7-T9/T11 PASS；T10 fixture PASS，真实 profile PASS或仅可复现环境缺失；双向追踪完整且无 Non-goal diff。数据库迁移 `Not Applicable`：D4 指定 optional read compatibility，formatVersion不变。

B 不写 readiness。C 只在 B→A 最终 SHA 更新 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 与 `DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`。

长期事实经 requirements、interfaces、designs 迁移后，删除本 RUNBOOK 前运行 `rg -n 'RUNBOOK-DECISION-RISK-CLOSURE|Decision And Risk Closure' docs .agents plugin`；仅剩本文件时删除，再做链接、Prettier、`git diff --check`。删除属于实现 PR 收口，不属于本次 Author/Audit。

## 10. Audit 与当前 Not Covered

本 RUNBOOK Audit：`Executable`。D1-D5 已关闭此前六项人工决策缺口，执行者无需决定生命周期、DTO、event、serializer、UI 写入口或所有权。

A/B 交叉 Audit：`Compatible`。对 A 最新 RUNBOOK 的上一轮六项 handoff disposition 均为 `Applied`：

1. serializer 的唯一签名已统一为 `(value: object) => string`，A 直接 import B helper，并固定 fallback 对象 insertion order；未引入 `JsonObject`、cast、alias 或第二 helper。
2. A T2 已把 `plugin/src/protocol/schema.ts` 列入禁止修改，D6-D10 不增加 error code。
3. A §9 已保留 B 对 legacy `MeetingIssue.riskLevel` 的 optional read compatibility 和 disposition fail-closed，且不改 `formatVersion`、不加 migration/fallback。
4. A 对 `meeting-control.ts:disposeRisk` 只拥有 B fact commit 后的 convergence composition；B 继续唯一拥有 command validation、risk transition、result、serializer、Issue/Fact/event/receipt/idempotency。
5. A P0 已加入 B exact signature、`CaptainDecisionDispositionResultSchema`、tool/projection token gate、B focused tests和 typecheck；任一失败均 STOP，不建 stub。
6. A RUNBOOK 已通过其自身 Prettier 检查；最终只读复核命令见本次审计记录。

B 本轮补齐 `plugin/src/protocol/results.ts:CaptainDecisionDispositionResultSchema` 的 DTO→Schema→direct export→contract test 链路。双方共享文件已按 §6.1 的 symbol/member/测试 `describe` 分配唯一 owner；执行顺序固定为 B 迁移并实现 D1-D5，A rebase 后 P0 验证再实现 D6-D10，C 最后在 merged SHA 取证。无 A 侧 remaining handoff。

| RUNBOOK-RULES       | 结论 | 位置                                                                      |
| ------------------- | ---- | ------------------------------------------------------------------------- |
| authority/structure | PASS | §1-4                                                                      |
| traceability        | PASS | §6                                                                        |
| data/interface      | PASS | §5                                                                        |
| file/symbol         | PASS | §6、所有剩余执行步骤                                                      |
| mechanical steps    | PASS | T7-T11 均含前置/允许/禁止/动作/命令/PASS/STOP/恢复                        |
| validation/failure  | PASS | §9 覆盖 success/invalid/authority/stale/terminal/replay/rollback/recovery |
| scope/non-goals     | PASS | §3、§6，B→A→C固定                                                         |
| readiness/deletion  | PASS | §9                                                                        |

当前 Not Covered：未执行剩余 T7-T11，T4-T6 已完成，未运行产品 focused/full verify/smoke，未更新 readiness；这是未来执行阶段，不影响 RUNBOOK 可执行性。本次不 push 或创建 PR。

## 11. Related Documents

- [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)
- [Document Rules](../00-governance/DOCUMENT-RULES.md)
- [TODO Rules](../00-governance/TODO-RULES.md)
- [PR Rules](../00-governance/PR-RULES.md)
- [Architecture](../00-governance/ARCHITECTURE.md)
- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)
- [Domain Design](./DOMAIN-MODEL-DESIGN.md)
- [Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)
- [Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)
- [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
