# RUNBOOK：Decision、Risk、Completion 与 Convergence 纯 Domain 闭环

状态：Author/Audit，审计结论 `Executable`。执行分支必须包含已合入身份准入线的共同基线
`c2fd076afcd1303cba1a01e832516b1dde12b428` ；本文件的作者分支为
`codex/decision-risk-completion-runbook`。建立日期：2026-09-16。作者已在同一工作
边界内固定 CompletionDeclaration actor/Fact 关系、outcome action lifecycle、Risk
Issue status、paused 完成重算和 pending Candidate lifecycle 的正式定义；执行者只
消费这些冻结文档，不再修改它们。本文件不授权
commit、push、创建 PR、合并或执行外部写操作。

## 执行者契约

执行者必须按 T0→T8 顺序工作。T1—T6 每步先建立该步规定的最小 API stub，使测试能实际进入目标行为，再写测试并观察断言因 stub 的错误行为而 RED；只有该 RED 与本步反例一致，才实现 GREEN。新 symbol 不存在造成的编译失败不能单独算 RED。每步只修改“允许修改”列出的文件；不得创建替代入口、兼容层、通用 command framework、第二份 `MeetingState`、测试专用生产 API 或新的依赖。

PASS 必须同时满足：指定命令退出码为 0、该步列出的可观察断言成立、拒绝路径保持原 `state` 引用且 `relatedIds/effectRequests` 均为空。STOP 时立即停止，不执行后续步骤；报告最后 PASS 步骤、触发条件、相关文件和 symbol、最小复现命令、实际输出，以及继续所需的人工决定。不得通过放宽 Schema、删除断言、类型强转、复制 legacy `Decision`/`Turn` 逻辑、修改正式文档或进入 Non-goals 继续。

已有用户改动不得回滚。T0 要求工作区干净；若本 RUNBOOK 允许修改的任一现有文件包含未提交改动，执行者必须 STOP；新文件尚不存在不构成 STOP。当前共同基线已合入 Manager 身份准入线；只允许在 `plugin/src/domain/transitions/index.ts`、`plugin/src/domain/meeting-state-v1-validation.ts`、其测试及 `CURRENT-IMPLEMENTATION-COVERAGE.md` 中保留双方独立追加内容并机械合并；任何 outcome symbol 需要调用、导入或解释 `IdentityRecommendationV1`、身份准入 transition 或其 Runtime 结果时 STOP。

## 目标、起点与终点

验收目标：按当前正式 Requirements、Meeting Interface、Domain Design 和 Meeting Design，实现 `ProposalRevision → Position → DecisionCandidate → Decision → RiskDisposition → CompletionDeclaration/CompletionFact → converging` 的目标 `MeetingState` 纯领域闭环，以可观察状态转换和反例测试证明权限、引用、不可变历史及确定性完成判定；不接入 Runtime、Repository、身份准入、Remote、Client、结束或归档能力。

当前起点：

- `plugin/src/domain/meeting-state-v1.ts` 已声明 `ProposalRevisionV1`、`PositionV1`、`DecisionCandidateV1`、`DecisionV1`、`RiskDispositionV1`、`CompletionDeclarationV1`、`CompletionFactV1` 及其聚合数组。
- `plugin/src/domain/meeting-state-v1-validation.ts::validateMeetingStateV1` 已校验上述对象的基本 shape、typed refs、Proposal ordinal 和 Decision 对 Candidate 的字段复制，但未完整校验 Decision 替代链、Risk 最新处置与 Issue 当前态、CompletionFact 替代链及目标状态一致性。
- `plugin/src/domain/meeting-state-v1-transitions.ts::transitionMeetingStateV1` 只覆盖 lifecycle、Agenda、AgendaCandidate、Question、Issue 和 ManagerPlan；`plugin/src/domain/transitions/` 的目标 V1 action 文件只覆盖主动参与、Round、Evidence、Review 与 Publication。
- `plugin/src/domain/completion.ts`、`proposal-state.ts` 及 legacy `transitions/decision-*.ts` 操作 `LegacyMeetingState`，不是本 RUNBOOK 的复用或兼容入口。
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 将 Proposal/Decision/Risk/Completion/Convergence 标为旧模型部分已有、目标实现未对齐。

预期终点：新文件 `plugin/src/domain/transitions/outcome-v1.ts` 是本闭环唯一 outcome transition/derivation 实现；既有 `transitionMeetingStateV1` 只在 `dispose_issue` 成功后调用同一个完成重算 helper，不复制规则；`plugin/src/domain/transitions/index.ts` 公开业务 symbol；目标 validator 拒绝无法由合法历史产生的关联状态；focused tests 先 RED 后 GREEN；完整 `pnpm --dir plugin verify` 通过；readiness 只声明纯 Domain 覆盖；RUNBOOK 的长期结论迁移后删除本文件。

## Scope 与 Non-goals

Scope 与步骤追踪：

| Scope                                                 | 实现步骤 | 直接验证                              |
| ----------------------------------------------------- | -------- | ------------------------------------- |
| Proposal 首版与连续 Revision                          | T1       | `outcome-v1.spec.ts` Proposal cases   |
| Position 与 DecisionCandidate                         | T2       | 同文件 position/candidate cases       |
| `decide`、Decision `supersede/revoke`                 | T3       | 同文件 decision history cases         |
| Risk `accept/reject`                                  | T4       | 同文件 risk cases                     |
| CompletionDeclaration                                 | T5       | 同文件 declaration cases              |
| CompletionFact create/replace/revoke                  | T5       | 同文件 completion history cases       |
| `isObjectiveSatisfiedV1`、目标状态重算与 `converging` | T5       | outcome 与既有 issue transition cases |
| `pendingDecisionCandidatesV1`                         | T2/T3    | 同文件 derivation cases               |
| snapshot validator 不变量                             | T6       | `meeting-state-v1-validation.spec.ts` |
| 公开导出、完整 verify、readiness 与删除               | T7/T8    | typecheck/lint/verify/doc checks      |

Non-goals：Manager Catalog、`IdentityRecommendationV1`、Definition/preflight/Session provisioning、Repository/receipt/outbox/runtime command pipeline、committed fact payload 扩展、Remote/Client/Markdown projection、`end_meeting`、Archive、recovery、MeetingTask 实现、任何 legacy Decision/Turn 适配、当前或历史 `RUNBOOK-MANAGER-IDENTITY-ADMISSION.md` 的修改或执行。不得新增 Protocol DTO/Schema；本切片只消费已在目标聚合中存在的 plain data。

## 正式依据与追踪

- [Meeting Orchestration Requirements § MO-FR-7](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-7提案立场与决策)：本人立场、Candidate 非 Decision、当前 revision、pending projection、supersede/revoke 历史。
- [Meeting Orchestration Requirements § MO-FR-8](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-8完成事实与会议结束) 与 [BR-3](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#br-3完成判断边界)：声明不等于事实、风险处置、完成重算、进入 converging 但不结束。
- [Meeting Orchestration Acceptance Criteria](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#acceptance-criteria)：AC 5—12、16、26、49。
- [Meeting Interface § Deliberation, outcome, task and mail](../20-interfaces/MEETING-INTERFACE.md#deliberation-outcome-task-and-mail)：action 字段、actor 边界、current Candidate、风险与完成事实前提。
- [Meeting Interface § Results](../20-interfaces/MEETING-INTERFACE.md#results-errors-and-precedence)：目标 Domain 可返回的错误优先级子集。
- [Domain Design § Publication, Outcome And Termination](./DOMAIN-DESIGN.md#publication-outcome-and-termination)：对象精确字段和值域。
- [Domain Design § Derived Rules](./DOMAIN-DESIGN.md#derived-rules)：`isObjectiveSatisfied`、`pendingDecisionCandidates` 及非持久化要求。
- [Meeting Design § Proposal, decision, risk and completion](./MEETING-DESIGN.md#proposal-decision-risk-and-completion)：每个转换的 actor、前提和成功结果。
- [Architecture § Dependency Rules](../00-governance/ARCHITECTURE.md#dependency-rules) 与 [Public Module Entrypoints](../00-governance/ARCHITECTURE.md#public-module-entrypoints)：Domain 纯度与导出边界。

追踪终点固定为：上述 requirement/acceptance → Meeting Interface action → Domain Design entity/derived rule → `plugin/src/domain/transitions/outcome-v1.ts` → `plugin/tests/unit/domain/outcome-v1.spec.ts` 与 validator suite → `pnpm --dir plugin verify` → `CURRENT-IMPLEMENTATION-COVERAGE.md`。

## 精确数据、API 与所有权

### 目标实体

不得修改 `plugin/src/domain/meeting-state-v1.ts` 中现有实体字段、optional 性或枚举。字段以 Domain Design 为准：

- `ProposalRevisionV1`：`id, proposalId, ordinal, actorId, agendaId, summary, body, evidenceIds, supersedesRevisionId?, createdAt`。
- `PositionV1`：`id, proposalRevisionId, actorId, stance, rationale, evidenceIds, createdAt`。
- `DecisionCandidateV1`：`id, proposalRevisionId, actorId, outcome, rationale, evidenceIds, positionIds, createdAt`；无 status。
- `DecisionV1`：复制 Candidate 的业务字段，另有 `candidateId, status, replacesDecisionId?`。`actorId` 保持 Candidate 作者；接受/替代/撤销的实际 actor 将来由 command committed fact 记录，本切片不得给 `DecisionV1` 加第二个 actor 字段。
- `RiskDispositionV1`：`id, issueId, actorId, action, scope, rationale, evidenceIds, createdAt`；按数组顺序追加，旧处置不删除。
- `CompletionDeclarationV1`：`id, actorId, outputId, criterionId?, statement, evidenceIds, taskId?, createdAt`；不可变且不改变 objective/lifecycle。
- `CompletionFactV1`：`id, outputId, criterionId?, actorId, status, statement, rationale, evidenceIds, decisionIds, supersedesFactId?, createdAt`；只由 Captain identity 创建。

所有 `id`/文本为 trim 后非空字符串，`now` 为非负 safe integer，引用数组必须存在、非空且无重复；`criterionId`、`taskId`、`supersedesRevisionId`、`replacesDecisionId`、`supersedesFactId` 缺席时省略 key，不写 `undefined`。生产者是本文件规定的纯 transition，canonical owner 是 `MeetingState`；调用者提供业务字段，application 将来提供 entity ID、actor binding 与 `now`，但本切片不实现该 application。

### 唯一新增文件与签名

只新增 `plugin/src/domain/transitions/outcome-v1.ts`，并精确导出以下类型与函数：

```ts
export type OutcomeActorV1 =
  | { kind: "local_controller"; id: OpaqueId }
  | { kind: "identity"; id: OpaqueId };

export interface RecordProposalRevisionInputV1 {
  revisionId: OpaqueId;
  proposalId: OpaqueId;
  agendaId: OpaqueId;
  summary: string;
  body: string;
  evidenceIds: readonly OpaqueId[];
  supersedesRevisionId?: OpaqueId;
  actor: OutcomeActorV1;
  now: EpochMs;
}
export interface RecordPositionInputV1 {
  positionId: OpaqueId;
  proposalRevisionId: OpaqueId;
  stance: PositionV1["stance"];
  rationale: string;
  evidenceIds: readonly OpaqueId[];
  actor: OutcomeActorV1;
  now: EpochMs;
}
export interface RecordDecisionCandidateInputV1 {
  candidateId: OpaqueId;
  proposalRevisionId: OpaqueId;
  outcome: DecisionCandidateV1["outcome"];
  rationale: string;
  evidenceIds: readonly OpaqueId[];
  positionIds: readonly OpaqueId[];
  actor: OutcomeActorV1;
  now: EpochMs;
}
export interface DecideInputV1 {
  decisionId: OpaqueId;
  candidateId: OpaqueId;
  actor: OutcomeActorV1;
  now: EpochMs;
}
export type ChangeDecisionInputV1 = {
  decisionId: OpaqueId;
  rationale: string;
  evidenceIds: readonly OpaqueId[];
  actor: OutcomeActorV1;
  now: EpochMs;
} & (
  | {
      status: "superseded";
      replacementCandidateId: OpaqueId;
      replacementDecisionId: OpaqueId;
    }
  | {
      status: "revoked";
      replacementCandidateId?: never;
      replacementDecisionId?: never;
    }
);
export interface DisposeRiskInputV1 {
  dispositionId: OpaqueId;
  issueId: OpaqueId;
  action: "accept" | "reject";
  scope: string;
  rationale: string;
  evidenceIds: readonly OpaqueId[];
  actor: OutcomeActorV1;
  now: EpochMs;
}
export interface SubmitCompletionDeclarationInputV1 {
  declarationId: OpaqueId;
  outputId: OpaqueId;
  criterionId?: OpaqueId;
  statement: string;
  evidenceIds: readonly OpaqueId[];
  taskId?: OpaqueId;
  actor: OutcomeActorV1;
  now: EpochMs;
}
export interface RecordCompletionFactInputV1 {
  factId: OpaqueId;
  outputId: OpaqueId;
  criterionId?: OpaqueId;
  statement: string;
  rationale: string;
  evidenceIds: readonly OpaqueId[];
  decisionIds: readonly OpaqueId[];
  actor: OutcomeActorV1;
  now: EpochMs;
}
export type ChangeCompletionFactInputV1 = {
  factId: OpaqueId;
  rationale: string;
  actor: OutcomeActorV1;
  now: EpochMs;
} & (
  | {
      status: "superseded";
      replacement: Omit<RecordCompletionFactInputV1, "actor" | "now">;
    }
  | { status: "revoked"; replacement?: never }
);

export function recordProposalRevisionV1(
  state: MeetingState,
  input: RecordProposalRevisionInputV1,
): MeetingTransitionResultV1;
export function recordPositionV1(
  state: MeetingState,
  input: RecordPositionInputV1,
): MeetingTransitionResultV1;
export function recordDecisionCandidateV1(
  state: MeetingState,
  input: RecordDecisionCandidateInputV1,
): MeetingTransitionResultV1;
export function decideV1(
  state: MeetingState,
  input: DecideInputV1,
): MeetingTransitionResultV1;
export function changeDecisionV1(
  state: MeetingState,
  input: ChangeDecisionInputV1,
): MeetingTransitionResultV1;
export function disposeRiskV1(
  state: MeetingState,
  input: DisposeRiskInputV1,
): MeetingTransitionResultV1;
export function submitCompletionDeclarationV1(
  state: MeetingState,
  input: SubmitCompletionDeclarationInputV1,
): MeetingTransitionResultV1;
export function recordCompletionFactV1(
  state: MeetingState,
  input: RecordCompletionFactInputV1,
): MeetingTransitionResultV1;
export function changeCompletionFactV1(
  state: MeetingState,
  input: ChangeCompletionFactInputV1,
): MeetingTransitionResultV1;
export function isObjectiveSatisfiedV1(state: MeetingState): boolean;
export function pendingDecisionCandidatesV1(
  state: MeetingState,
): readonly DecisionCandidateV1[];

// 仅供同一 Domain 模块中的既有 transition 复用；不得从 transitions/index.ts 公开。
export function recalculateMeetingCompletionV1(
  state: MeetingState,
  actorId: OpaqueId,
  now: EpochMs,
): MeetingState;
```

`ChangeCompletionFactInputV1.replacement` 不重复提交 actor 或时间；replacement fact 的 `actorId` 固定取外层 `actor.id`，`createdAt` 固定取外层 `now`。replacement 的新 `factId` 是 replacement entity ID，旧 `factId` 是被替代 entity ID。所有成功结果均为 `MeetingTransitionResultV1`：`version + 1`、`updatedAt = now`、`relatedIds` 按 `[new/target primary id, ...direct referenced ids]` 固定顺序、`effectRequests=[]`。拒绝保持原 state 引用、空 related/effects。

transition 内的检查和错误优先级固定如下，不得按函数自行调换：

1. 先调用 `validateMeetingStateV1(state)`；invalid snapshot 返回 `INVALID_ARGUMENT`，不得尝试修复；
2. input shape、discriminant、required/optional key、ID/text/time、数组非空/去重、同一调用的新旧 entity ID 冲突；失败为 `INVALID_ARGUMENT`；不同 entity kind 可以使用相同字符串，typed reference 不因字符串碰撞跨 kind 解析；
3. actor 存在与角色：identity 必须属于 `state.identities`，Proposal/Position/Candidate 需 contributor 或 captain，Decision/Risk 需 captain 或 local，Declaration 需 contributor，CompletionFact 需 captain；失败为 `UNAUTHORIZED`；
4. lifecycle：`terminal|archiving|archived` 为 `MEETING_TERMINAL`，其它非 running 状态为 `INVALID_STATE`；
5. entity/typed reference 存在性，包括 Agenda、revision、position、candidate、decision、Issue、output、criterion、task、EvidenceVersion；失败为 `NOT_FOUND`；
6. current/status/previous-link、EvidenceVersion 已公开、required review、Decision basis、task consistency、risk level/hard constraint 和 completion history 前提；失败为 `PRECONDITION_FAILED`；
7. 构造 next state 后必须调用 `validateMeetingStateV1(nextState)`；若 invalid，则整个 transition 返回 `PRECONDITION_FAILED` 和原 state，不得提交半个 next state。

identity 同时拥有多个 role 时，只要包含本 action 需要的 role 即通过；`manager` 单角色不因它也是 Meeting identity 而取得 contributor/captain 权限。local controller 不在 `state.identities` 查找，但只可进入本表明确允许的 Decision/Risk 分支。

`MeetingTransitionResultV1.error.message` 必须是非空、稳定的英文诊断，但不属于产品契约，tests 不锁定具体文案。`UNAUTHORIZED`、`NOT_FOUND`、`INVALID_STATE` 与 `PRECONDITION_FAILED` 在存在单一目标对象时必须同时设置该对象的 `targetId`；无法归属于单一对象的数组/完成条件错误省略 `targetId`。本切片不新增 error code 或 `targetKind` 枚举。

每个成功结果的 `relatedIds` 顺序固定为：

| function                           | `relatedIds`                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordProposalRevisionV1`         | `[revisionId, proposalId, agendaId, ...(supersedesRevisionId ? [supersedesRevisionId] : []), ...evidenceIds]`                                                               |
| `recordPositionV1`                 | `[positionId, proposalRevisionId, ...evidenceIds]`                                                                                                                          |
| `recordDecisionCandidateV1`        | `[candidateId, proposalRevisionId, ...positionIds, ...evidenceIds]`                                                                                                         |
| `decideV1`                         | `[decisionId, candidateId]`                                                                                                                                                 |
| `changeDecisionV1` revoke          | `[decisionId, ...evidenceIds]`                                                                                                                                              |
| `changeDecisionV1` supersede       | `[decisionId, replacementDecisionId, replacementCandidateId, ...evidenceIds]`                                                                                               |
| `disposeRiskV1`                    | `[dispositionId, issueId, ...evidenceIds]`                                                                                                                                  |
| `submitCompletionDeclarationV1`    | `[declarationId, outputId, ...(criterionId ? [criterionId] : []), ...(taskId ? [taskId] : []), ...evidenceIds]`                                                             |
| `recordCompletionFactV1`           | `[factId, outputId, ...(criterionId ? [criterionId] : []), ...decisionIds, ...evidenceIds]`                                                                                 |
| `changeCompletionFactV1` revoke    | `[factId]`                                                                                                                                                                  |
| `changeCompletionFactV1` supersede | `[factId, replacement.factId, replacement.outputId, ...(replacement.criterionId ? [replacement.criterionId] : []), ...replacement.decisionIds, ...replacement.evidenceIds]` |

optional ID 是非空字符串，因此表中的 truthy 检查只表达“字段存在”，实现必须用 `!== undefined`，不能让空字符串绕过结构校验。`relatedIds` 是本切片的结果元数据，不是 committed fact、receipt 或持久化契约。

### 公开证据与 required review

`publishedVersionIds` 是全部 `Publication.finalVersionIds` 的集合。Proposal、Position、Candidate、Decision change、Risk、Declaration 与 CompletionFact 输入的每个 `evidenceId` 必须属于该集合；未知 EvidenceVersion 返回 `NOT_FOUND`，存在但未公开返回 `PRECONDITION_FAILED`。数组为空、重复或 ID 非法返回 `INVALID_ARGUMENT`。

CompletionFact 的每个 evidence version 还必须满足 required review：找到拥有该 version 的 `EvidencePackage` 与其 Agenda；按该 Agenda 的 `requiredReviewerIds` 原顺序选择第一位非 package author、具有 `evidence_reviewer` role 且 `reviewResponsibilityIds` 含该 Agenda 的 identity；必须存在该 reviewer 针对该 version 的唯一 `EvidenceReview`，其 ID 出现在包含该 version 的 Publication 的 `finalReviewIds`，且至少一条对应 `ReviewDelivery.status="sent"`。无指定 reviewer、缺 Review/finalReview/sent delivery 均返回 `PRECONDITION_FAILED`。不得从评分值推断完成。

### 当前 revision、Decision 与 pending 派生

每个 `proposalId` 的 current revision 是该组 ordinal 最大且链合法的 revision。首版必须无 `supersedesRevisionId` 且 ordinal 固定为 1；后续输入必须指定同 proposal 当前 revision 的 ID，新增 ordinal 固定为前序 + 1。调用者不能提交 ordinal。新 revision 只 append；旧 Position、Candidate 和 Decision 不复制、不改写。

Position 与 Candidate 只能引用 current revision。Candidate 的每个 `positionId` 必须存在且引用同一 revision。`decideV1` 只接受 current revision 的、尚无任何 Decision 的 Candidate；同一 `proposalRevisionId` 已有 status accepted 的 Decision 时必须使用 `changeDecisionV1` 而不能再次 `decide`。合法 decide 复制 Candidate 字段形成 status accepted 的 Decision。`changeDecisionV1` 只处置 status accepted 的 Decision：revoke 只把旧 Decision 置 revoked；supersede 的 replacement Candidate 必须尚无 Decision、属于相同 `proposalId` 的 current revision，且 replacement revision 不得已有另一个 status accepted 的 Decision；同一转换将旧 Decision 置 superseded并 append status accepted、`replacesDecisionId=旧 Decision.id` 的 replacement Decision。change action 的 rationale/evidence 只作当前 Domain 前置校验；本切片不扩展正式 `DecisionV1` 或 committed fact payload 来保存它们。

`pendingDecisionCandidatesV1` 只在 lifecycle 为 `running|paused` 时返回值；`paused` 仅表示 resume 后仍可执行，不授权当前接受。结果保留 `state.decisionCandidates` 写入顺序，只含 current revision 的 Candidate 且没有任何 Decision 使用其 `candidateId`。`preparing|converging|ending|terminal|archiving|archived` 返回 `[]`。函数不写 state、不缓存第二份数组、不做 caller visibility；Captain/local 过滤属于后续 projection，明确不在本切片。

### Risk 处置

Risk 目标必须是 `status="open"` 的 Issue；`resolved|deferred|out_of_scope` 拒绝。Captain identity 或 local controller 可处置，其他 actor 拒绝。accept 要求 `riskLevel` 等级不高于 `objective.acceptableRiskLevel`，且 Issue 引用的每个 hard constraint 当前为 `satisfied`；成功 append disposition，并仅把该 Issue 改为 `classification="accepted_risk", blocking=false`。reject 不接受风险，因此不受风险等级上限限制；成功 append disposition，并仅把该 Issue改为 `classification="blocking", blocking=true, status="open"`。两分支都保留旧 disposition，不修改其他 Issue；同一 open Issue 可由不同 command 重新处置，最后一条 disposition 决定当前 classification。Issue 后续若经既有 `dispose_issue` 进入 resolved/out_of_scope，可以合法清除 blocking 而不改写 RiskDisposition 历史；deferred 保留最后处置的 blocking。

### Declaration、CompletionFact 与完成重算

Declaration 只允许已存在且 `roles` 包含 `contributor` 的 identity，不允许 manager-only、evidence-reviewer-only、仅 Captain 或 local controller；Captain 只有在同时具有 contributor role 时才可提交。`outputId/criterionId/evidenceIds` 必须合法。提供 `taskId` 时，Task 必须存在、`assigneeId=actor.id`、`status="completed"`、`authorizationStatus="active"` 且有非空 result；否则拒绝。成功只 append declaration，不修改 objective、Agenda、Issue、CompletionFact 或 lifecycle。当前 Interface 没有 declarationId 写入 `RecordCompletionFact` 的字段，故本切片不得猜测自动匹配、消费或删除 declaration；后续 application 可以在正式接口扩展后建立显式关联。

CompletionFact 只允许 Captain identity，不允许 local controller、Manager 或普通 identity。新 fact 的 output/criterion、已公开且 required-review 完整的 evidence、非空 accepted Decision 基础必须合法；每个 `decisionId` 必须引用 status accepted、outcome adopt、其 Candidate 属于 current ProposalRevision 的 Decision。创建 append active fact。revoke 只把目标 active fact 置 revoked；supersede 原子把目标 active fact 置 superseded，并 append replacement active fact，replacement 的 `supersedesFactId` 固定为旧 fact ID，调用者不能另行提交。历史对象的其它字段不变。

“有效 active CompletionFact”定义为：`status="active"`，每个 decisionId 仍满足上一段 accepted/adopt/current 条件，且每个 evidenceId 仍满足公开和 required review 条件。每次 `decideV1`、`changeDecisionV1`、`disposeRiskV1`、`recordCompletionFactV1`、`changeCompletionFactV1` 成功后，使用转换后的数组重新计算：

1. required output 有至少一条有效 active fact 指向它时 status=`satisfied`，否则 status=`pending`；
2. acceptance criterion 有至少一条有效 active fact 的 `criterionId` 指向它时 status=`satisfied`，否则 status=`pending`；
3. hard constraint status 原样保留，本切片没有合法 action 改写它；
4. `isObjectiveSatisfiedV1` 为真，当且仅当所有 required output/criterion status 为 satisfied、所有 hard constraint status 为 satisfied、每个 required target 均有对应有效 active fact、并且不存在 `blocking=true` 的 Issue；空目标数组按 `every` 真值处理；
5. 若重算结果为真且旧 lifecycle 为 running，则 lifecycle 变为 `converging`，`changedAt=now`、`changedBy=actor.id`、`reason="objective_satisfied"`；否则 lifecycle 原样保留；
6. 进入 converging 不创建 `Termination`、`ArchivePackage`、effect 或自动 end，不清理 Round/Contribution/Task/ManagerPlan。停止新增贡献安排由这些既有 action 的 running 前置条件承担；本切片不修改它们。

本切片只处理正向事实及其失效：active fact 产生 `satisfied`，最后一条有效依据失效后恢复创建时的 `pending`。它不得自行生成 `unsatisfied` 或 `violated`；这两个值必须来自将来具有正式 action/依据的显式负向判断，不能由“当前没有 active fact”推断。

`recordProposalRevisionV1` 成功也必须调用重算：新 current revision 不继承旧 revision 的 Decision，因此引用旧 Decision 的 active CompletionFact 立即失效，相应 output/criterion 回到 pending。既有 `transitionMeetingStateV1` 的 `dispose_issue` 分支先将 lifecycle 限制为 running；通过后在完成 Issue status/blocking 更新并构造 version+1 的 next state 后、调用 validator 前，必须调用 `recalculateMeetingCompletionV1(nextState, actor.id, now)`；这样最后一个 blocking Issue 被 resolved/out_of_scope 时在同一 running transition 中进入 converging。paused、converging、preparing、ending 的 `dispose_issue` 返回 `INVALID_STATE`，terminal、archiving、archived 返回 `MEETING_TERMINAL`。该接缝不得改变 `resolve_question`、`record_issue` 或其它既有 action，不得重复实现完成算法。

`recalculateMeetingCompletionV1` 自身不验证 actor 权限、不递增 version、不改 `updatedAt`、不产生 result/effect；调用它的 transition 已完成这些职责。它只返回带重算 objective/lifecycle 的 `MeetingState`。如果条件不满足或 lifecycle 不是 running，lifecycle 原样保留。

本 RUNBOOK 的 outcome 写转换只在 lifecycle=`running` 时接受；paused、converging、preparing、ending 返回 `INVALID_STATE`，terminal/archiving/archived 返回 `MEETING_TERMINAL`。这样 converging 是本切片的单向收敛边界，撤销/替代必须在进入 converging 前完成；如产品需要 converging 后重新打开，必须先在正式 lifecycle 契约新增合法边并重审 RUNBOOK。

## 不可违反的不变量与反例

1. 任何拒绝保持 `state` 对象引用等价，version/updatedAt/数组/lifecycle 不变，零 effect。
2. Domain 不读取时钟、随机数、Session、Repository、Protocol、文件或网络；ID/actor/now 都由 input 给出并验证。
3. Proposal、Position、Candidate、Declaration、Disposition 和历史 Fact/Decision 只 append 或复制后改 status；不得原地 mutation 或删除历史。
4. Manager 不能创建 Position、Decision、RiskDisposition 或 CompletionFact；Participant 不能决定或制造 CompletionFact；local controller 只能 Decision/Risk，不可声明或写 CompletionFact。
5. 未公开 EvidenceVersion、别的 revision 的 Position、已用 Candidate、非 current Candidate、非 accepted/adopt Decision、缺 required review 的 evidence 均不能产生正式 outcome。
6. 新 Proposal revision 不继承旧 position/candidate/decision；旧记录仍可审计但不进入 pending/current 完成依据。
7. Candidate 无 reject/revoke transition；Decision 的 supersede 必须是旧状态更新与 replacement append 的单次 state 返回。
8. Risk accept 不能越过 acceptableRiskLevel 或未满足 hard constraint；reject 不删除旧 accept disposition，只以最新 disposition 恢复 blocking。
9. Declaration 永不直接改变 objective/lifecycle；Task completed 永不直接创建 CompletionFact。
10. Fact revoke/supersede 不删除旧 fact；仅有效 active facts参与目标和完成判断。
11. follow_up、pending_discussion、accepted_risk 等非 blocking Issue 不阻止完成；任何 blocking Issue 都阻止。
12. 满足完成条件只进入 converging；`termination` 和 `archive` 必须保持原值（正常 running fixture 中均为 undefined）。
13. `pendingDecisionCandidatesV1` 是纯派生、稳定顺序、无持久副本，普通 Participant 可见性不在 Domain 中伪造。
14. 不增加 legacy event `decision.added`、Turn/SpeakerAttempt bridge、兼容 mapper 或双写。

必须保留的反例至少包括：非当前 revision 的 Position/Candidate；Candidate position 跨 revision；普通 Participant decide；Manager 写 CompletionFact；local 写 CompletionFact；supersede 缺 replacement 或跨 proposal replacement；revoke 带 replacement；Risk accept 超等级/未满足 hard constraint；Risk reject 后旧 accept 仍在且当前 Issue blocking；Declaration 改变 objective 的错误实现；completed Task 自动满足 output 的错误实现；Fact 使用 revoked Decision 或未送达 Review；撤销最后有效 fact 后 target 回 pending；存在 blocking Issue 时不进入 converging；满足条件时生成 termination/archive 的错误实现。

## 文件与 symbol 映射

| 文件                                                            | 本 RUNBOOK 允许的唯一职责                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `plugin/src/domain/transitions/outcome-v1.ts`（新增）           | 11 个公开业务函数、1 个模块内复用重算函数、输入类型及私有 helper |
| `plugin/src/domain/transitions/index.ts`                        | 只追加 outcome-v1 的具名 export/type export                      |
| `plugin/src/domain/meeting-state-v1-transitions.ts`             | 只在 `dispose_issue` 成功 next state 上调用完成重算 helper       |
| `plugin/src/domain/meeting-state-v1-validation.ts`              | 只补 Decision/Risk/Completion 历史与目标一致性校验；不改无关实体 |
| `plugin/tests/unit/domain/outcome-v1.spec.ts`（新增）           | 本闭环行为、权限、引用、历史、派生和收敛测试                     |
| `plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts` | 只补 `dispose_issue` 清除最后阻塞后进入 converging 的 case       |
| `plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts`  | 只补/调整上述 snapshot invariant cases                           |
| `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`          | T8 记录实际覆盖、命令、结果与 Not Covered                        |
| 四份相关 requirements/interface/design 正式文档                 | 作者已固定权限、lifecycle 与派生语义；执行期只读                 |
| 本 RUNBOOK                                                      | T8 在全部门禁通过并完成迁移后删除                                |

禁止修改 `plugin/src/domain/meeting-state-v1.ts`、`plugin/src/domain/index.ts`、legacy `plugin/src/domain/completion.ts` 与 `plugin/src/domain/transitions/decision-*.ts`。`meeting-state-v1-transitions.ts` 只允许上述单点调用，不得把新 outcome action 并入其 action union。若 TypeScript 编译确实要求改变其它禁止文件，STOP 并报告缺少的正式结构；不得为了消除冲突或减少导出行而扩大范围。

## 机械执行步骤

### T0：共同基线与工作区门禁

前置状态：从仓库根执行；当前分支包含指定共同基线；本 RUNBOOK 与四份作者冻结正式文档已提交；工作区干净。

允许修改：无。

禁止修改：全仓库。

执行：

1. 运行下列命令；确认 `git status --short` 无输出。
2. 确认新文件 `outcome-v1.ts` 与 `outcome-v1.spec.ts` 不存在。
3. 确认正式 action/entity/derived rule 与本 RUNBOOK 的链接仍存在。

验证：

```bash
git merge-base --is-ancestor c2fd076afcd1303cba1a01e832516b1dde12b428 HEAD
git status --short
test -z "$(git status --short)"
test ! -e plugin/src/domain/transitions/outcome-v1.ts
test ! -e plugin/tests/unit/domain/outcome-v1.spec.ts
rg -n 'interface (RecordProposalRevision|RecordPosition|RecordDecisionCandidate|Decide|ChangeDecision|DisposeRisk|SubmitCompletionDeclaration|RecordCompletionFact|ChangeCompletionFact)' docs/20-interfaces/MEETING-INTERFACE.md
rg -n 'isObjectiveSatisfied|pendingDecisionCandidates' docs/30-designs/DOMAIN-DESIGN.md
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts
```

PASS：所有命令退出 0；git status 无输出；2 个既有 suite 全绿。

STOP：共同基线不是祖先、允许修改文件有未知改动、新文件已存在、symbol/依据缺失或 baseline test 失败。报告命令输出；不得通过覆盖现有文件继续。

失败恢复：本步只读，无恢复动作。

### T1：Proposal 连续 revision

前置状态：T0 PASS。

允许修改：`plugin/src/domain/transitions/outcome-v1.ts`、`plugin/tests/unit/domain/outcome-v1.spec.ts`。

禁止修改：validator、导出入口、其它 production/test 文件。

执行：

1. 新建 `outcome-v1.ts`，加入公共 rejected/accepted、ID/text/time/array、actor、published evidence、current revision 私有 helper；同时按已固定签名加入 `recalculateMeetingCompletionV1` identity stub，精确返回传入的 `state`。先让 `recordProposalRevisionV1` 对有效输入固定返回 `PRECONDITION_FAILED`。
2. 新建测试，证明首版、连续第二/第三版、不继承旧数组、非 contributor/captain、未公开 evidence、错误 predecessor、重复 entity ID、paused/terminal 和 state-reference rejection。
3. 运行 focused test，必须因有效首版/连续版仍被 stub 拒绝而 RED。
4. 实现唯一 Proposal 规则并运行 GREEN；成功 next state 必须调用 identity stub 后再交给 validator。此步不实现目标重算，fixture 的 required output/criterion 均保持 pending、hard constraint 至少一项未满足，确保 identity stub 不会误入 converging；不得实现 T2 以后行为。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/outcome-v1.spec.ts
```

PASS：首版 ordinal=1 且无 supersedes；连续版 ordinal 严格 +1、指向立即前序；旧 revision/历史数组不变；全部反例按固定 code 拒绝。

STOP：正确行为需要 caller 提交 ordinal、修改 model 字段、读取 legacy Proposal 或接受未公开 evidence。保留 RED 输出并停止。

失败恢复：只保留能编译的本步 stub/test；不得把半实现宣称 PASS。

### T2：Position、Candidate 与 pending 派生

前置状态：T1 PASS。

允许修改：T1 两个文件。

禁止修改：其它文件。

执行：

1. 为 `recordPositionV1`、`recordDecisionCandidateV1`、`pendingDecisionCandidatesV1` 加固定错误/空数组 stub。
2. 写 tests：current revision 成功；旧 revision、跨 revision position、角色混淆、未公开证据、重复/空引用拒绝；Position/Candidate 在 paused/preparing/converging/ending 返回 `INVALID_STATE`，在 terminal/archiving/archived 返回 `MEETING_TERMINAL`；pending 在 running/paused 可见，在 preparing/converging/ending/terminal/archiving/archived 为空；accepted candidate 与旧 revision candidate 消失；源数组顺序稳定；调用前后 state 深度与引用不变。
3. 观察有效 Position/Candidate 与 pending 断言 RED，再实现 GREEN。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/outcome-v1.spec.ts
```

PASS：Candidate 不创建 Decision/状态字段；pending 完全由 state 派生且不 mutation。

STOP：实现需要持久 pending 数组、caller visibility 参数或 candidate reject/revoke。不得加入这些能力。

失败恢复：保留 T1 GREEN；报告首个 T2 失败 case。

### T3：Decision 接受、替代与撤销

前置状态：T2 PASS。

允许修改：`outcome-v1.ts`、`outcome-v1.spec.ts`。

禁止修改：其它文件与 committed fact payload。

执行：

1. 加 `decideV1`/`changeDecisionV1` stub。
2. 写 tests 覆盖 Captain/local accept、Candidate 字段逐项复制、pending 消失、converging 时 pending 为空、Decision action 在 paused/preparing/converging/ending 返回 `INVALID_STATE` 且在 terminal/archiving/archived 返回 `MEETING_TERMINAL`、普通 identity/Manager 拒绝、同一 Candidate 重复 accept、同一 revision 第二个 `decide`、旧 revision candidate、revoke、同 proposal current replacement 的原子 supersede、replacement revision 已有 accepted Decision、跨 proposal/已用 replacement/非法 discriminated input/未公开 change evidence。
3. 观察有效 accept/supersede/revoke RED；实现并 GREEN。
4. 每个成功后调用 T1 已存在的 identity completion stub；本步 fixture 没有有效 facts、target 初始为 pending 且 hard constraint 未全部满足，因此应保持 target pending、lifecycle running。不得在本步实现 T5 的有效 fact、target 或 lifecycle 重算。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/outcome-v1.spec.ts
```

PASS：旧 Decision 保留且只改 status；replacement append 且 `replacesDecisionId` 正确；revoke 不 append；一个 Candidate 最多一个 Decision，同一 proposal revision 最多一个 accepted Decision。

STOP：需要给 Decision 增加 accepter/revocation reason 字段或修改 Interface committed payload；报告契约缺口，不发明字段。

失败恢复：保留 T1/T2 GREEN，未通过的 Decision stub 不得从 index 导出。

### T4：Risk accept/reject 与重新处置

前置状态：T3 PASS。

允许修改：`outcome-v1.ts`、`outcome-v1.spec.ts`。

禁止修改：其它文件。

执行：

1. 加 `disposeRiskV1` stub。
2. 写 tests 覆盖 Captain/local、published evidence、只改指定 Issue、append history、accept 等级/constraint 边界、reject 恢复 blocking、accept→reject→accept 的最后处置、非授权 actor、resolved/deferred/out_of_scope Issue、paused/preparing/converging/ending、terminal/archiving/archived、空 scope/rationale、重复 ID。
3. 观察有效 accept/reject RED，再实现 GREEN；成功后调用 T1 identity completion stub。fixture 必须保留至少一个未满足 hard constraint，使本步不要求进入 converging；不得提前实现 T5 重算。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/outcome-v1.spec.ts
```

PASS：旧 dispositions 全保留；Issue 当前 classification/blocking 精确匹配最后处置；其它 Issue/目标不变；单独 risk 操作不满足目标时不进入 converging。

STOP：需要修改 `IssueV1` 枚举、删除旧 disposition、允许 accept 绕过 hard constraint 或让 reject 受等级上限阻断。

失败恢复：保留 T1—T3 GREEN，报告首个 risk 反例差异。

### T5：Declaration、CompletionFact 与 converging

前置状态：T4 PASS。

允许修改：`outcome-v1.ts`、`outcome-v1.spec.ts`、`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：其它文件、`meeting-state-v1-transitions.ts` 中 `dispose_issue` 以外分支、MeetingTask transition、end/archive。

执行：

1. 加 declaration/fact/change/isObjectiveSatisfied stub；保留 T1 的 identity `recalculateMeetingCompletionV1` stub，不能在写完本步 RED tests 前替换它。
2. 构造最小真实公开 evidence fixture：EvidencePackage/Version、指定 reviewer、Review、sent ReviewDelivery 与包含 version/review 的 Publication；不得用 mock 绕过 required-review helper。
3. 写 declaration tests，证明 contributor declaration append 但 objective/lifecycle/facts 不变，且不会匹配、消费或删除任何 CompletionDeclaration；Captain+contributor 可提交，manager-only、evidence-reviewer-only、仅 Captain 和 local controller 被拒绝，task 引用条件正确；paused/preparing/converging/ending 返回 `INVALID_STATE`，terminal/archiving/archived 返回 `MEETING_TERMINAL`。
4. 写 fact tests，证明 Captain create、required review/accepted adopt current Decision、replace/revoke 历史、旧 Decision 或新 Proposal revision 使依据失效后的 target 重算、blocking Issue/hard constraint、全部条件满足时仅进入 converging；Record/ChangeCompletionFact 在 paused/preparing/converging/ending 返回 `INVALID_STATE`，在 terminal/archiving/archived 返回 `MEETING_TERMINAL`。
5. 在既有 transition suite 先写非 running 反例：paused、preparing、converging、ending 的 `dispose_issue` 返回 `INVALID_STATE`，terminal、archiving、archived 返回 `MEETING_TERMINAL`，均保持原 state/facts。再写目标 RED：完成 facts/targets/constraints 均已满足且只剩一个 blocking Issue 时，running 中合法 `dispose_issue` resolved/out_of_scope 应使 next lifecycle 进入 converging；断言原 Issue disposition fact payload、version 和其它 state 仍保持既有语义。
6. 先观察合法 declaration/fact tests 因各自 stub 被拒绝而 RED，并观察 Proposal revision 失效、Decision/Risk/Fact convergence 与 `dispose_issue` 重算 tests 因 identity completion stub 而 RED。然后只在本步将该 stub 替换为统一有效 fact、target recompute 和 objective judge 实现；`recordProposalRevisionV1`、Decision/Risk/Fact 成功路径继续调用同一函数，只在既有 `dispose_issue` 成功 next state 上新增对它的调用，运行 GREEN。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/outcome-v1.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts
```

PASS：所有反例成立；最后有效 fact 撤销或新 Proposal revision 使其 Decision basis 过期时 output/criterion 回 pending；全部 output/criterion/fact/review/decision/constraint/risk 条件满足，或合法 `dispose_issue` 清除最后 blocking Issue 时，lifecycle 仅变 converging，termination/archive 仍不存在且无新增 effects。

STOP：需要从评分/自然语言/Task completion 自动造 Fact，需要改 hard constraint 字段，或需要 converging→running。不得猜测产品行为。

失败恢复：保留已通过的 T1—T4；报告最小 state/input 与实际 result。

### T6：Snapshot validator 历史一致性

前置状态：T5 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-validation.ts`、`plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts`。

禁止修改：outcome production/test、其它 validator 范围。

执行：

1. 先写 validator cases 并观察 RED：Decision 一个 Candidate 多次使用、同一 proposal revision 多个 accepted Decision、replacement 跨 proposal/未把旧 Decision 标 superseded/非法 replacement ordering；open/deferred Issue 的 classification/blocking 不匹配最后 RiskDisposition，同时保留“后续 dispose_issue 可使 resolved/out_of_scope Issue 清除 blocking”的合法 case；Completion replacement 未把被指向的旧 fact 标 superseded、同一旧 fact 被多次直接替代、`supersedesFactId` 指向 revoked fact、有效 active fact 对应 target 非 satisfied、satisfied target 无有效 active fact。另加合法 case：Proposal revision 更新或 Decision 撤销/替代后，旧 CompletionFact 仍为 active 历史，但因 Decision basis 不再 current/accepted 而无效，对应 target 为 pending，snapshot 必须 valid。已经合法替代旧 fact 的 replacement 自身后来变为 revoked/superseded 时，其原有 `supersedesFactId` 仍须保留并保持 valid。
2. Declaration 的 `taskId` 继续只作 typed FK 校验，不把创建时的 Task status、authorizationStatus 或 assignee 前提升级为永久 snapshot invariant；这是因为 Declaration 不可变，而 Task 后续可被撤权或重分配。增加一个合法历史 case：Declaration 创建后关联 Task 已变为 revoked/cancelled，snapshot 仍 valid。
3. 对现有 complete-entity fixture 作唯一必要机械更新：其 active Fact `decisionIds` 改为合法非空 accepted/adopt Decision，并把对应 output status 设 satisfied；不删除原 FK 覆盖。
4. 实现线性扫描校验：replacement 必须只指前序对象，避免递归/通用 graph abstraction；RiskDisposition.actorId 只作非空 ID 校验，因为 local controller 合法且不属于 identities，snapshot 不能伪造外部 caller proof；Risk 最新处置始终约束 classification，只在 Issue.status 为 open/deferred 时约束 blocking，resolved/out_of_scope 仍必须 blocking=false；validator 不得导入 `outcome-v1.ts`，避免 outcome transition→validator→outcome 的循环依赖；不改变既有 error result shape/path 策略。
5. 运行 validator suite 与 outcome suite。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/outcome-v1.spec.ts
```

PASS：两 suite 全绿；新增 invalid state 均得到确定 path；合法三段 Decision/Risk/Fact history 可重复校验为 valid；原测试保护未被删除。

STOP：新增校验会要求 validator 查询 Runtime/Repository、改变历史正式对象字段、或无法用当前 snapshot 决定。不得把外部边界塞进 validator。

失败恢复：保留最小 RED case；不放宽原 validator。

### T7：公开入口与完整代码验证

前置状态：T6 PASS。

允许修改：`plugin/src/domain/transitions/index.ts`；格式化命令可机械更新 T1—T6 已允许文件的排版。

禁止修改：`plugin/src/domain/index.ts` 及其它源码。现有 `export * from "./transitions/index.js"` 已使具名 transition export 进入 Domain 公开入口。

执行：

1. 在 transitions index 具名导出 11 个函数及 10 个 input/actor type；不使用 `export *`，不导出私有 helper。
2. 从测试继续直接导入被测内部文件，不为测试改写 import path。
3. 依次运行 focused、format、lint、typecheck、完整 verify；format 若产生超出允许文件的 diff，STOP。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts tests/unit/domain/outcome-v1.spec.ts
pnpm --dir plugin exec prettier src/domain/transitions/outcome-v1.ts src/domain/transitions/index.ts src/domain/meeting-state-v1-transitions.ts src/domain/meeting-state-v1-validation.ts tests/unit/domain/outcome-v1.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts tests/unit/domain/meeting-state-v1-validation.spec.ts --write
git status --short
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin verify
git diff --check
test -z "$(git diff --no-index --check /dev/null plugin/src/domain/transitions/outcome-v1.ts 2>&1)"
test -z "$(git diff --no-index --check /dev/null plugin/tests/unit/domain/outcome-v1.spec.ts 2>&1)"
```

PASS：focused suites 全绿；format 后只有 RUNBOOK 允许文件变化；lint 无 error；typecheck 与 verify 退出 0；diff check 退出 0。

STOP：任一失败需要改 Non-goal 文件、放宽 lint/type/Schema/test、或完整 verify 暴露共享回归。报告第一条失败命令与输出；不得只报告后续命令。

失败恢复：格式变更保留；不手工回滚用户改动。修复只限已允许文件，否则 STOP。

### T8：Readiness 迁移与 RUNBOOK 删除

前置状态：T7 全部 PASS，工作树无范围外修改；取得 `git rev-parse HEAD` 作为实现边界，未提交工作树则同时记录 diff 边界而不伪称 commit 已包含改动。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK。

禁止修改：requirements、interfaces、stable designs、operations、源码和测试。

执行：

1. 将 Functional Coverage 的 Proposal/Decision/Risk 与完成声明/收敛两行更新为“目标纯 Domain 已对齐；外围未覆盖”，逐项列出实际实现。
2. 更新 Implementation Gap，只移除本切片已经补齐的纯 Domain 缺口，不把 Repository/Runtime/projection/end/archive 标为完成。
3. 在 Executed Validation 新增日期、源码/commit 或工作树边界、focused 命令与实际 case 数、完整 verify 结果；数字只能来自 T7 输出。
4. Explicitly Not Covered 保留并明确 Runtime、Repository、idempotency、committed fact/outbox、Remote/Client visibility、end/archive/recovery、真实 DSH/Browser 未验证。
5. 只格式化更新后的 coverage 文档。
6. `rg` 查找本 RUNBOOK 文件名和标题引用；只有引用为本文件自身或临时执行链接时删除本 RUNBOOK。删除后运行文档链接和 diff 检查。

验证：

```bash
git rev-parse HEAD
pnpm --dir plugin exec prettier ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md --write
test ! -e docs/30-designs/RUNBOOK-DECISION-RISK-COMPLETION-CONVERGENCE.md
! rg -n 'RUNBOOK-DECISION-RISK-COMPLETION-CONVERGENCE|Decision、Risk、Completion 与 Convergence 纯 Domain 闭环' . --glob '!node_modules/**' --glob '!plugin/lib/**'
node .github/scripts/check-doc-links.mjs
git diff --check
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts tests/unit/domain/outcome-v1.spec.ts
```

PASS：readiness 的每项完成声明都有实际命令证据；链接检查 0 error；RUNBOOK 已删除且无残留引用；focused suites 仍绿。

STOP：T7 证据缺失、链接检查失败、存在仍需本 RUNBOOK 承载的长期规则、或实际实现超出/少于 Scope。恢复本 RUNBOOK 后报告差异，不把状态写成 completed。

失败恢复：若删除后任一检查失败，恢复本 RUNBOOK 与仅服务于它的引用，保持 readiness 不宣称关闭。

## 验证矩阵

| 边界                             | 固定预期                                          | 证据                           |
| -------------------------------- | ------------------------------------------------- | ------------------------------ |
| 正常 Proposal→Candidate→Decision | append immutable history、连续 version            | T1—T3 focused                  |
| stale revision/跨 revision ref   | `PRECONDITION_FAILED`，原 state 引用              | T1/T2 focused                  |
| actor/role                       | contributor/captain 与 captain/local 精确分离     | T1—T5 focused                  |
| published evidence               | unknown=`NOT_FOUND`，未公开=`PRECONDITION_FAILED` | T1—T5 focused                  |
| Decision supersede/revoke        | 原子旧状态+新 Decision，或仅 revoke               | T3 focused + T6 validator      |
| Risk accept/reject/redisp        | 最新处置决定 Issue 当前态，旧历史保留             | T4 focused + T6 validator      |
| Completion declaration           | append only，不完成目标                           | T5 focused                     |
| Completion Fact history          | active/superseded/revoked 引用一致                | T5 focused + T6 validator      |
| required review/Decision basis   | 缺任一条件不能成为有效 fact                       | T5 focused                     |
| deterministic completion         | targets、constraints、blocking Issue 共同决定     | T5 focused                     |
| convergence                      | running→converging，无 end/archive/effect         | T5 focused                     |
| pending candidates               | current、unused、executable lifecycle、稳定顺序   | T2/T3 focused                  |
| malformed snapshot               | validator 返回固定 path，不查询外部系统           | T6 validator                   |
| terminal immutability            | terminal/archiving/archived 拒绝                  | 每个 action family 参数化 case |
| full regression                  | format/lint/typecheck/test/build/package 全部通过 | T7 `verify`                    |

## Not Applicable 与未覆盖边界

- stale `expectedMeetingVersion`、receipt、request hash、idempotency conflict、transaction rollback、outbox：Not Applicable，本切片没有 command envelope 或 Repository；由后续 application/persistence 验证，不能用纯 Domain tests 冒充。
- restart/reopen/recovery：Not Applicable，本切片不持久化；validator 只证明单个 snapshot 的静态一致性。
- caller Session ownership 与 local loopback 证明：Not Applicable，输入 actor 是 application 已解析的 plain binding；本切片只验证角色矩阵。
- Remote/Client visibility：Not Covered。`pendingDecisionCandidatesV1` 只生成 Domain 候选集合，不证明 Captain/local filtering。
- committed fact audit payload：Not Covered。当前 Interface 对除 Question/Issue 外 action 使用 `references` payload；本切片不扩展它。
- end/archive：Not Applicable。converging 只是一条 lifecycle transition，不生成终止或归档。
- 真实 DSH profile、Browser、网络、文件、数据库、并发和性能：Not Applicable，纯确定性 Domain 无这些依赖。
- legacy compatibility/migration：明确 Non-goal，V1 Interface 不承诺旧 Turn/Decision 读取或双写。

## 完成定义、审计与删除条件

完成必须同时满足：T0—T8 每步 PASS；Scope 表每项均有 production symbol 与能识别指定错误的测试；所有新增结构均由正式 action/entity/derived rule 直接授权；没有修改 Non-goal 文件；focused tests、lint、typecheck、完整 verify、文档链接和 diff check 实际通过；readiness 明确 Not Covered；长期结论没有只留在 RUNBOOK；RUNBOOK 已按 T8 删除。

作者逐项 dry-run 后的审计结论为 `Executable`：正式 Requirements、Interface、Domain Design 与 Meeting Design 对本切片的 actor、数据、引用、状态、失败和收敛边界足以形成唯一纯 Domain 实现；执行者无需选择产品、架构、兼容或外部生命周期方案。唯一保留的未来边界——committed audit、idempotency、Runtime/Repository、projection visibility、end/archive——均已明确列为 Non-goal/Not Covered，不能阻塞或被本切片伪实现。

若执行时发现正式文档已变化、`DecisionV1`/`CompletionFactV1` 字段与本文件不一致、converging 后需要重新打开、CompletionFact 必须显式引用 declaration，或 required review 的指定规则发生变化，则本审计结论立即失效，T0 或命中步骤必须 STOP，由作者更新正式依据或 RUNBOOK 并重新 Audit；低级执行者不得自行适配。
