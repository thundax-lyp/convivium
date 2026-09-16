# RUNBOOK: MeetingState Core Structure And Transitions

状态：Executable（纯 Domain T1–T8；T9 有独立删除授权与历史门禁）
执行分支：`docs/runbook-meeting-state-transitions`
建立日期：2026-09-16

## 1. 执行者契约

本 RUNBOOK 的目标执行者不负责产品、授权、生命周期或接口决定。Author/Audit 阶段只可修改本 RUNBOOK 与本任务明确授权的正式真相源；进入 Execute 前必须有独立的实现授权。进入 Execute 前须通过第 8 节执行前检查；进入 Execute 后，执行者只能按 T1–T9 的允许文件、symbol、顺序和命令行动；T9 另须其精确删除授权，当前 Author/Audit 不运行。任何 STOP 都必须立即停止，不得改用未列文件或隐含方案。

禁止以 legacy `Turn`、`SpeakerAttempt`、`LegacyMeetingState`、旧 protocol 或旧 transition 作为目标模型的兼容层、默认值、fallback 或行为依据。禁止新增 DSH、Repository、Runtime、Remote、UI、outbox、Session、存储迁移和 effect 逻辑。禁止 commit、push、创建 PR 或合并。

PASS 仅指某一步规定的命令以退出码 0 结束且全部可观察断言成立。任何 STOP 都是强制结果：报告最后一个 PASS、触发条件、文件和 symbol、命令及实际输出；不得放宽类型、Schema、断言或生命周期规则以继续。

## 2. 目标

起点是目标类型已定义、但没有目标结构/引用校验或目标纯转换的 checkout：`plugin/src/domain/meeting-state-v1.ts` 定义 `MeetingState`，而 `plugin/src/domain/meeting-state-validation.ts` 和 `plugin/src/domain/transitions/` 仍只校验或转换 `LegacyMeetingState`。

终点应是一个不依赖 Runtime、Repository、DSH、Remote、时钟或文件系统的目标领域切片：它能逐项校验 `MeetingState` 的结构、值域和跨对象引用，并以当前 snapshot、已认证 actor、Runtime 提供的时间和 ID、一个已版本化的 action 为输入，纯粹地完成以下动作或返回稳定 rejection：`pause_meeting`、`resume_meeting`、`activate_agenda`、`raise_agenda_candidate`、`dispose_agenda_candidate`、Question、Issue 与 `plan_next_step`。成功只返回新 `MeetingState` 和最小领域事实；拒绝返回原 state 引用。此切片的完整业务链为：可信 Runtime 以后续工作提供 actor/time/ID 与 `MeetingActionV1` → Domain 结构/引用校验 → 一个纯转换 → Repository 才能在后续切片原子 commit。

用户已确认、且正式真相源已同步 Question/Issue 权限矩阵、`RecordIssue` 与 `dispose_risk` 的边界、Issue 的阻塞引用结构、处置矩阵、事实审计载荷、Termination ID、reviewer 责任及 candidate promotion 原子语义。目标 API、字段/FK 映射、执行前检查及 T1–T9 的逐步 PASS/STOP 已完成 Author/Audit dry-run。本状态只表示机械执行无需新增判断；进入 Execute 仍须独立实现授权，当前没有目标代码或目标测试。

## 3. 当前断点与证据

| 断点 | 证据 | 结论 |
| --- | --- | --- |
| 目标聚合已有固定类型 | [meeting-state-v1.ts](../../plugin/src/domain/meeting-state-v1.ts) 的 `MeetingState`、`MeetingLifecycleV1`、`AgendaItemV1`、`AgendaCandidateV1`、`QuestionV1`、`IssueV1`、`ManagerPlanV1` | 类型不是可运行的结构/引用校验，也没有 target transition。 |
| 现有校验和转换属于旧模型 | [meeting-state-validation.ts](../../plugin/src/domain/meeting-state-validation.ts) 的 `isMeetingStateV2`；[transitions/index.ts](../../plugin/src/domain/transitions/index.ts) 的公开 legacy exports | 不能复用或改名为目标实现；旧 runtime 仍依赖它们。 |
| 当前实现覆盖明确标为缺口 | [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#functional-coverage) 的“目标领域模型与命名”“Meeting 生命周期与本地控制”“Agenda、ManagerPlan 与轮次安排” | 新模型的校验、纯 transitions 与拒绝路径均未实现。 |
| Question/Issue 授权已固定 | [MO-FR-6](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-6议题范围与发散控制)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning)、[Domain Design](./DOMAIN-DESIGN.md#identity-and-authority-facts) | 任一已授权 identity record；仅 Captain identity resolve/dispose；local controller 禁止四个 action。角色不符为 `UNAUTHORIZED`，合法 caller 的对象/状态失败再按 Interface precedence 映射。 |
| `RecordIssue` 与结构化风险接受已分离 | [MO-FR-8.9](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-8完成事实与会议结束) 及 [RecordIssue / DisposeRisk](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning) | `record_issue` 的可创建分类排除 `accepted_risk`；持久 Issue 值域保留它，但只能由合法 `dispose_risk` accept 产生；四组 affected/required reviewer ID 显式输入，并按正式判据校验 blocking。当前 [IssueV1](../../plugin/src/domain/meeting-state-v1.ts) 尚缺四组引用字段，T1 必须同步目标类型；不得由 caller 直接创建 accepted risk。 |
| Archive termination FK 已明确 | [Domain Design — Publication, Outcome And Termination](./DOMAIN-DESIGN.md#publication-outcome-and-termination)、[Meeting Interface — Persistence And Effects](../20-interfaces/MEETING-INTERFACE.md#persistence-and-effects) | `ArchivePackage.terminationId` 必须匹配唯一 `Termination.id`，该 ID 由后续 `end_meeting` 受控上下文提供而非 caller。 | 当前 [TerminationV1](../../plugin/src/domain/meeting-state-v1.ts) 尚缺 `id`，T1 仅同步该目标类型与静态 FK；不实现 end/archive。 |
| ManagerPlan 的 `completed` 无当前 action | [Domain Design](./DOMAIN-DESIGN.md#publication-outcome-and-termination) 给出 `active|superseded|completed`；[Meeting Design](./MEETING-DESIGN.md#planning-tasks-and-mail) 只规定新 plan supersede 同 Agenda active plan，且五种 planKind 不直接改变控制状态 | 不阻塞本切片：`plan_next_step` 只创建或 supersede；`completed` 仅由后续实际执行 plan 的切片写入，本切片 validator 接受已持久的合法值但不产生该值。 |
| create/start 与 end/termination 依赖未实现的相邻行为 | [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning)、[Meeting Design](./MEETING-DESIGN.md#proposal-decision-risk-and-completion) | 不阻塞本切片：create/start 属于创建与 session-preflight slice，end/termination 依赖 completion/termination slice；本切片只实现 `running → paused` 和 `paused → running`。 |

## 4. Scope 和 Non-goals

### Scope

获本切片独立实现授权并通过第 8 节执行前检查后，本 RUNBOOK 的 T1–T8 只授权：

1. 为已存在的 `MeetingState` 增加目标结构、枚举、唯一 ID、时间、数组顺序、正式来源已经固定的 optional/conditional 组合和 typed cross-object 引用校验；不伪造外部 ID/历史前提的当前证明。
2. 实现并测试 `pause_meeting`、`resume_meeting`、Agenda、AgendaCandidate、Question、Issue、`plan_next_step` 的纯转换与 rejection 不变性。
3. 仅通过 `plugin/src/domain/index.ts` 公开这项切片必需的 target validator 和 target transition API。
4. 为这些可观察 Domain 行为新增确定性 unit tests；执行本 RUNBOOK 固定的验证集合。

### Non-goals

- 不接线 `MeetingActionV1` JSON decoding、caller binding、idempotency、expected version、Repository committed-fact/outbox 持久化、DSH Session、deadline、recovery、Remote DTO 或 projection；仅纯返回 Domain fact。
- 不实现 create/start、end/termination、Round、Contribution、Evidence、Review、Publication、Proposal、Decision、RiskDisposition、Completion、Task、Mail、archive 或 continuation transition。CreateMeeting caller-local identity key、Runtime identityId 分配与初始 Agenda.requiredReviewerIds 映射仍属后续创建切片的前置契约缺口，本切片只校验已经形成的 MeetingState，不能猜映射。immutable archive retention 不是本切片已验证结果，现有 ArchivePackage 也不能被描述为已满足 MO-FR-10.7；后续 archive 切片需补正式映射。
- 不改变 legacy 文件、legacy tests 或 legacy runtime；也不删除 legacy 路径。这些替换需要后续有独立调用链与验证范围的切片。
- 不修改 requirements、interface 或稳定 design 来猜测产品语义；只有人工确认后，作者可按 [Document Rules](../00-governance/DOCUMENT-RULES.md#document-sync) 把结论迁移至其正确真相源并重写本 RUNBOOK。

## 5. 真相源、数据与调用链

| 行为 | 正式依据 | 目标数据/动作 | 未来唯一生产位置 | focused test |
| --- | --- | --- | --- | --- |
| aggregate integrity | [Domain Design — MeetingState](./DOMAIN-DESIGN.md#meetingstate)、[Meeting Interface — Wire Conventions](../20-interfaces/MEETING-INTERFACE.md#wire-conventions) | `MeetingState` 的全部字段、ID/时间/数组/optional/引用 | 新建 `plugin/src/domain/meeting-state-v1-validation.ts`，`validateMeetingStateV1(value: unknown): MeetingStateValidationResultV1` | 新建 `plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts` |
| lifecycle | [Domain Design — Identity And Authority Facts](./DOMAIN-DESIGN.md#identity-and-authority-facts)、[Meeting Interface — Lifecycle, agenda and planning](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning) | `pause_meeting`、`resume_meeting` 与 `MeetingLifecycleV1` | 新建 `plugin/src/domain/meeting-state-v1-transitions.ts`，`transitionMeetingStateV1` | 新建 `plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts` |
| Agenda | [Domain Design — Objective, Agenda, Question And Issue](./DOMAIN-DESIGN.md#objective-agenda-question-and-issue)、[Meeting Design — Meeting lifecycle and agenda](./MEETING-DESIGN.md#meeting-lifecycle-and-agenda) | `activate_agenda` | 同上 | 同上 |
| AgendaCandidate | [MO-FR-6](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-6议题范围与发散控制)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning) | `raise_agenda_candidate`、`dispose_agenda_candidate` | 同上 | 同上 |
| Question / Issue | [Domain Design — Objective, Agenda, Question And Issue](./DOMAIN-DESIGN.md#objective-agenda-question-and-issue)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning) | `record_question`、`resolve_question`、`record_issue`、`dispose_issue` | 同上；仅在执行前检查的授权矩阵确认后 | 同上；仅在执行前检查通过后 |
| ManagerPlan | [Domain Design — Publication, Outcome And Termination](./DOMAIN-DESIGN.md#publication-outcome-and-termination)、[Meeting Design — Planning, tasks and mail](./MEETING-DESIGN.md#planning-tasks-and-mail) | `plan_next_step` 创建 active plan 或 supersede 同 Agenda active plan；不产生 `completed` | 同上 | 同上 |

目标 API 只能在 `plugin/src/domain/index.ts` 从 `@/domain/index.js` 对其他生产模块公开。`meeting-state-v1-transitions.ts` 只可导入同一 `domain/` 模块的 `./meeting-state-v1.js` 和 `./meeting-state-v1-validation.js`；禁止从或向 `runtime`、`repository`、`protocol`、`dsh`、`projection`、`tools` 和 `client` 导入。

T1–T7 的测试在 T8 entry 尚未建立时分别从 `@/domain/meeting-state-v1-validation.js`、`@/domain/meeting-state-v1-transitions.js` 与 `@/domain/meeting-state-v1.js` 引用目标源码；禁止测试用父级相对路径或 legacy entry。T8 的 `plugin/src/domain/index.ts` 只能增以下具名入口，不创建转发文件：

```ts
export { validateMeetingStateV1 } from "./meeting-state-v1-validation.js";
export type { MeetingStateValidationResultV1 } from "./meeting-state-v1-validation.js";
export { transitionMeetingStateV1 } from "./meeting-state-v1-transitions.js";
export type {
  TargetDomainActorV1,
  TargetAgendaInputV1,
  TargetMeetingActionV1,
  TargetDomainFactPayloadV1,
  TargetDomainFactV1,
  TargetTransitionResultV1,
} from "./meeting-state-v1-transitions.js";
```

## 6. 已确定的数据规则与不变量

以下规则已经由正式依据确定，后续作者在解除 STOP 时不得改变：

1. `MeetingState` 是唯一目标聚合；它的所有数组存在、ID 在各自实体种类内唯一，所有 cross-object ID 仅可引用本 Meeting 中已存在对象。缺字段、错误 enum、空/无效 ID、非法时间、重复 ID 或坏引用都必须 rejection，不能填补默认值。
2. `version` 从 1 开始；每次接受的 target command 恰增 1，`updatedAt` 恰等于 Runtime 传入的 `now`。rejection 保持输入 state 的引用等价，不增加版本、不产生事实。
3. `MeetingLifecycleV1.status` 仅允许 `preparing|running|paused|converging|ending|terminal|archiving|archived`，且只允许 Domain Design 列出的边。此切片只写 `running → paused` 与 `paused → running`；`terminal` 必有 `termination`，`archiving` 必有已物化 archive，`archived` 还必须具有完整 archive 和所有 meeting-owned Session 已停止、关闭、撤权的 Runtime 已验证事实。最后一项不在本切片实现，validator 只能检查 snapshot 已表达的 `archive` 前置，不能伪造 Session 证据。
4. 创建时仅 `initialActiveAgendaId` 指向的 Agenda 是 `active`；其他初始 Agenda 是 `pending`。`activate_agenda` 只可让一个明确 disposition 的当前 active Agenda 转为 `completed|deferred|closed`，并让一个 existing `pending` Agenda 变为 `active`；不能由 candidate promotion 隐式切换 active Agenda。
5. `AgendaCandidate` 只能 `pending → promoted|parked|rejected` 一次；promotion 原子标记 candidate、创建完整 `pending` AgendaItem，并向每个 `promotedAgenda.requiredReviewerIds` 指向的 evidence_reviewer identity.reviewResponsibilityIds append 新 Agenda.id，不能清空 caller 的必需审核者或新增 role；其他 disposition 只更新 candidate；三者都不改变当前 active Agenda，也不产生 outbox。
6. Question 的 blocking=true 必须至少关联一个仍未满足的 required output、criterion 或 hard constraint。Issue 的 `riskLevel` 永远存在，不能取默认值；四组 affected/required reviewer ID 显式存在、各自不重复，分别指向本 Meeting 的 required output、criterion、hard constraint 与所属 Agenda 的 required reviewer。创建 open Issue 时，尚未接受的 high 风险必须 `classification="blocking"`、`blocking=true`；其它 Issue 只有明确关联尚未满足的前三组目标或所属 Agenda 的必需审核者时才可 blocking；创建时无资格 blocking 或 classification/blocking 不匹配拒绝而非改写。`record_issue` 不产生 `accepted_risk`，只有后续 `dispose_risk` accept 能产生该值。终结处置可清除 blocking 并保留旧 classification；deferred 不改变两者。
7. 每 Agenda 至多一个 active `ManagerPlan`。Manager 仅能在没有 `open` Round 时通过 `plan_next_step` 创建 plan；新 plan 只 supersede 同 Agenda 的旧 active plan，且不得直接修改 Agenda、Round、identity 或 authority。`completed` 是 validator 接受的既有状态；它不在本切片的 transition output 中。
8. 普通 Domain facts 只携带转换类型与受影响实体 ID；Question/Issue 处置的单一 fact 另携带目标旧/新 status/blocking、非空 rationale、已公开 evidenceIds、actorId 与 occurredAt，供后续 committed fact 一次审计。不得带 Session、secret、private mail body、Agent process 或 hidden reasoning。此切片不创建 effect/outbox。

## 7. 固定实现结构

固定新增 production 文件只有 `plugin/src/domain/meeting-state-v1-validation.ts` 与 `plugin/src/domain/meeting-state-v1-transitions.ts`；固定新增测试文件只有 `plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts` 与 `plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。T1 唯一允许修改的既有目标类型是 `plugin/src/domain/meeting-state-v1.ts` 的 `IssueV1`（增 `affectedOutputIds`、`affectedCriterionIds`、`affectedConstraintIds`、`requiredReviewerIds` 四组 readonly OpaqueId 数组）与 `TerminationV1`（增 required `id: OpaqueId`）；不改其它类型。T2–T7 顺序扩充同一个 `transitionMeetingStateV1`，不建立平行 dispatch、shared types 文件或转发入口。T8 唯一允许修改的既有 production 文件是 `plugin/src/domain/index.ts`。禁止修改所有 legacy validator/transition、Runtime、Repository、Protocol、DSH、Projection、Client。

`plugin/src/domain/meeting-state-v1-transitions.ts` 必须在 T2 创建以下唯一目标 API（下列 TypeScript 是目标签名，不是 pseudocode）：

```ts
export type TargetDomainActorV1 =
  | { kind: "local_controller"; id: OpaqueId }
  | { kind: "identity"; id: OpaqueId };
export type TargetAgendaInputV1 = {
  id: OpaqueId; title: string; question: string;
  requiredOutputIds: readonly OpaqueId[]; requiredReviewerIds: readonly OpaqueId[];
  ownerId?: OpaqueId;
};
export type TargetMeetingActionV1 =
  | { kind: "pause_meeting" | "resume_meeting"; reason: string }
  | { kind: "activate_agenda"; agendaId: OpaqueId; previousDisposition: "completed" | "deferred" | "closed"; reason: string }
  | { kind: "raise_agenda_candidate"; title: string; reason: string; sourceMessageId?: OpaqueId }
  | { kind: "dispose_agenda_candidate"; candidateId: OpaqueId; disposition: "promoted" | "parked" | "rejected"; reason: string; promotedAgenda?: TargetAgendaInputV1 }
  | { kind: "record_question"; agendaId: OpaqueId; text: string; affectedOutputIds: readonly OpaqueId[]; affectedCriterionIds: readonly OpaqueId[]; affectedConstraintIds: readonly OpaqueId[]; blocking: boolean }
  | { kind: "resolve_question"; questionId: OpaqueId; status: "answered" | "withdrawn" | "deferred"; rationale: string; evidenceIds: readonly OpaqueId[] }
  | { kind: "record_issue"; agendaId: OpaqueId; description: string; riskLevel: RiskLevel; classification: "blocking" | "follow_up" | "pending_discussion" | "out_of_scope"; affectedOutputIds: readonly OpaqueId[]; affectedCriterionIds: readonly OpaqueId[]; affectedConstraintIds: readonly OpaqueId[]; requiredReviewerIds: readonly OpaqueId[]; blocking: boolean; rationale: string }
  | { kind: "dispose_issue"; issueId: OpaqueId; status: "resolved" | "deferred" | "out_of_scope"; rationale: string; evidenceIds: readonly OpaqueId[] }
  | { kind: "plan_next_step"; agendaId: OpaqueId; planKind: ManagerPlanV1["kind"]; rationale: string; blockingReason?: string };
export type TargetDomainFactPayloadV1 =
  | { kind: "references"; relatedIds: readonly OpaqueId[] }
  | { kind: "question_disposition"; questionId: OpaqueId; oldStatus: "open" | "deferred"; newStatus: "answered" | "withdrawn" | "deferred"; oldBlocking: boolean; newBlocking: boolean; rationale: string; evidenceIds: readonly OpaqueId[] }
  | { kind: "issue_disposition"; issueId: OpaqueId; oldStatus: "open" | "deferred"; newStatus: "resolved" | "deferred" | "out_of_scope"; oldBlocking: boolean; newBlocking: boolean; rationale: string; evidenceIds: readonly OpaqueId[] };
export type TargetDomainFactV1 = { id: OpaqueId; kind: TargetMeetingActionV1["kind"]; actorId: OpaqueId; occurredAt: EpochMs; relatedIds: readonly OpaqueId[]; payload: TargetDomainFactPayloadV1 };
export type TargetTransitionResultV1 =
  | { kind: "accepted"; state: MeetingState; facts: readonly [TargetDomainFactV1] }
  | { kind: "rejected"; state: MeetingState; code: "INVALID_ARGUMENT" | "UNAUTHORIZED" | "MEETING_TERMINAL" | "NOT_FOUND" | "INVALID_STATE" | "PRECONDITION_FAILED"; facts: readonly [] };
export function transitionMeetingStateV1(
  state: MeetingState, action: TargetMeetingActionV1, actor: TargetDomainActorV1,
  now: EpochMs, factId: OpaqueId, generatedId?: OpaqueId,
): TargetTransitionResultV1;
```

这些类型与函数从 `plugin/src/domain/index.ts` 具名导出，不复制 Interface JSON decoder；action 字段逐项对应 [MeetingActionV1](../20-interfaces/MEETING-INTERFACE.md#command-action-union) 当前切片的同名 action。Runtime 以后提供已绑定 actor、`now`、`factId`；仅 `raise_agenda_candidate`、`record_question`、`record_issue`、`plan_next_step` 需要 `generatedId`，其它 action 必须不使用它。candidate promotion 的 Agenda ID 唯一来自 caller 提交且已校验的 `promotedAgenda.id`，不是 Runtime 再分配。accepted 恰产生一个 fact，其 `id=factId`、`kind=action.kind`、`actorId=actor.id`、`occurredAt=now`；普通 action 的 payload 为最小 `references`，Question/Issue disposition 的 payload 分别为 `question_disposition` / `issue_disposition`。未来 Runtime 将 Domain fact 的 `id→factId`、`actorId`、`occurredAt`、`relatedIds`、`payload` 原样写入 [CommittedFactRecordV1](../20-interfaces/MEETING-INTERFACE.md#persistence-and-effects)，并填 `meetingVersion=nextState.version`、`resultingState=nextState`；receipt、Repository transaction 与 archive 由后续切片实现，不在此处伪造。rejected 必须返回原 state 引用和空 facts。不得抛出 legacy `DomainError`、clone rejection state、创建 effect/outbox、建立通用 framework 或 compatibility layer。

action 引用数组按 [Command Action Union](../20-interfaces/MEETING-INTERFACE.md#command-action-union) 校验：`promotedAgenda.requiredOutputIds`、`requiredReviewerIds`、`resolve_question.evidenceIds` 与 `dispose_issue.evidenceIds` 非空且组内不重复；`record_question` 与 `record_issue` 的 affected/required reviewer 数组必须显式存在，可逐组为空但不可重复。action 中 null 替代非 null、非法 discriminant、缺必填字段或重复引用数组项一律 `INVALID_ARGUMENT`；Domain 不忽略这些条件也不替 caller 填默认值。

执行顺序固定为：校验当前 state 与 action/actor/time/ID 的结构 → 从当前 state 查 identity 并按 action 判定 local/role → 拒绝 `terminal|archiving|archived`（本切片的十个 action 均无终态例外）→ 检查目标对象存在性 → 检查 lifecycle/status/round 与关联资格 → 应用纯转换 → 对 nextState 再运行目标 validator → 返回 accepted。结构/enum/null/缺字段/重复 action 引用数组项/非安全时间或 ID 为 `INVALID_ARGUMENT`；actor 与身份/角色不符为 `UNAUTHORIZED`；终态为 `MEETING_TERMINAL`；目标 ID 合法但对象不存在为 `NOT_FOUND`；已有对象但 lifecycle/status 不允许为 `INVALID_STATE`；关联资格、已存在对象的生成 ID 冲突、证据未公开、open Round 或其它 Domain invariant 失败为 `PRECONDITION_FAILED`。同一输入只返回首个符合该顺序的错误，任何 rejection 均不修改 state。meeting visibility、receipt/idempotency、expected version 和 storage 错误在未来 Runtime/Repository 处理，不在 Domain 假造。

`plugin/src/domain/meeting-state-v1-validation.ts` 必须导出唯一 `validateMeetingStateV1(value: unknown): MeetingStateValidationResultV1`；同时导出 `MeetingStateValidationResultV1`，结果类型固定为 `{ kind: "valid"; state: MeetingState } | { kind: "invalid"; code: "INVALID_ARGUMENT"; path: string }`。`path` 使用从 `$` 开始的 dot/index 路径，例如 `$.issues[0].affectedOutputIds[1]`；结构错误取当前 Zod schema `safeParse()` 返回的 `error.issues[0]`，直接映射其 `path`，不额外按字典序或 TS 声明顺序排序；同一输入的 path 必须稳定。缺失/null/错误值报该字段路径，数组元素坏值或坏 typed FK 报元素路径，跨对象互逆关系失败报按根字段声明顺序扫描到的第一个引用字段及其元素路径；结构扫描先于第 7 节 FK 表扫描，FK 表内按表的行顺序和数组输入顺序扫描。无默认值、无类型转换、无抛错；未知额外字段不作为 invalid。每个 interface 中无 `?` 的字段须为对象自身属性且非 null，带 `?` 的字段仅可缺席或有正确类型，不接受 null；所有 `readonly` 数组须实际为数组。`OpaqueId` 是 string 且 trim 后长度大于 0，校验时不改写原 ID；`EpochMs` 是非负安全整数；其余数值范围由下述固定数值判据给出，枚举逐字匹配 TS union；普通 string/boolean 字段逐项检验类型，`reason`、`rationale`、`title`、`text`、`question`、`description` 等当前 action 必填正文须 trim 后非空。字段结构由当前目标 TS interface 逐字段决定；T1 增加的五个 required 字段以本 RUNBOOK 第 7 节为唯一机械增量。

外键校验固定为下表；`[]` 表示数组内每个 ID 都检查，optional 引用只在字段存在时检查，`own` 表示同一父对象中查找；typed FK 不允许因另一个实体种类碰巧有同字符串 ID 而通过：

数值判据不能由执行者补选：`MeetingState.version`、Publication/FormalMessage 的 `seq`、EvidenceVersion/ProposalRevision 的 `ordinal` 为 `1..Number.MAX_SAFE_INTEGER`；`Contribution.substantiveSupplementCount` 为安全整数 `0..2`；`MeetingTask.attempt` 为非负安全整数（当前正式契约未承诺从 1 开始，validator 不额外拒绝 0）；`MeetingLimits.maxFormalMessages`、`maxDurationMs`、`taskDeadlineMs`、`reviewDeadlineMs` 为非负安全整数（正式来源未另定最小正值，validator 不加额外业务下限）且 `responseDeadlineMs` 恰为 `60000`；`ArchivePackage.publicSnapshotVersion` 为 `1..MeetingState.version`。其它 `EpochMs` 字段统一按非负安全整数，不额外猜测时钟顺序或 deadline 相对 now。

optional/conditional 只校验正式来源已经规定的组合：`MeetingIdentity.definitionId` 与 `definitionVersion` 同时有/无；`Round.status=published` 必有 `publicationId` 且指本 Round 的 Publication，`open|aborted` 不得有 `publicationId`；`Contribution.pendingSupplementHand` 仅在 `awaiting_response` 可存在；`Registration.status=complete` 时 missingFields 为空，`needs_correction` 时非空；`ReviewDelivery.status=sent` 只带 sentAt、`failed` 只带 failedAt；`EvidenceMaterial.kind=unknown|not_applicable` 必有非空 reason；`ProposalRevision.ordinal=1` 不带 supersedesRevisionId、后续 ordinal 必带同 proposal 立即前序 ID；`archived` 必有 status=complete 的 Archive，`archiving` 必有已物化 Archive，`terminal` 必有 Termination。其余 TS optional 字段只校验有值时类型和本表已列 typed FK，不根据字段名猜测新的状态-字段互斥或默认值；创建相邻实体的后续切片负责更深的历史前提。

| owner/字段 | 精确目标与附加条件 |
| --- | --- |
| `objective.requiredOutputs[]`、`acceptanceCriteria[]`、`hardConstraints[]` | 各组 `ObjectiveTargetV1.id` 内唯一；status 仅 TS 值域。 |
| `identities[].agendaResponsibilityIds[]`、`reviewResponsibilityIds[]` | 两组都指 `agenda[].id`；reviewResponsibilityIds 非空时 identity 必有 evidence_reviewer role，每个该 Agenda 的 `requiredReviewerIds` 必须反向包含本 identity.id。`definitionId`/`definitionVersion` 指外部 DSH role definition，必须同时存在或同时缺席，前者只做 ID 检查、后者只做非空 string 检查，真实版本匹配由后续 DSH preflight 验证；同身份 roles/ref 数组不得重复。 |
| `agenda[].requiredOutputIds[]`、`requiredReviewerIds[]`、`ownerId?` | 分别为 `objective.requiredOutputs[].id`、`identities[].id`、`identities[].id`；每个 requiredReviewer identity 必有 evidence_reviewer role 且其 `reviewResponsibilityIds` 包含本 Agenda.id，与前一行双向一致；各组不重复。非 execution-terminal 状态至多且应有一个 active Agenda，所有状态均不能有两个 active。 |
| `agendaCandidates[].sourceMessageId?` | `messages[].id`；candidate ID 唯一。 |
| `questions[].actorId`、`agendaId`、三组 affected IDs | 分别为 `identities[].id`、`agenda[].id`、对应的 requiredOutputs/acceptanceCriteria/hardConstraints target ID；每组不重复。仅 open/deferred 的 blocking=true 需要至少一个所指 target.status 不为 satisfied；answered/withdrawn 必须 non-blocking。 |
| `issues[].agendaId`、四组 affected/required reviewer IDs | 分别为 `agenda[].id`、对应的三组 ObjectiveTarget ID、所属 Agenda 的 `requiredReviewerIds`；每组不重复。open/deferred 时，high 且尚未接受必须 blocking；其他 blocking 必须有未 satisfied 的 target 或至少一个所属 Agenda 的 required reviewer。resolved/out_of_scope 必须 non-blocking；accepted_risk 必须 non-blocking，且在 `riskDispositions[]` 中须有同 Issue 的 accept 历史。由于 RiskDispositionV1 无 active/status 字段，静态 validator 不把“有 accept 历史”误称当前 active risk fact 的完整证明；风险处置与完成重算由后续切片验证。 |
| `rounds[].agendaId`、`publicBaselinePublicationIds[]`、`contributionIds[]`、`publicationId?` | 分别为 `agenda[].id`、`publications[].id`、`contributions[].id`（每项 `.roundId` 必须为本 Round）、`publications[].id`（`.roundId` 必须为本 Round）；各组不重复；status=open 的 Round 必须仍属于当前 active Agenda，不能挂在已收口的 Agenda 上。 |
| `contributions[].roundId`、`contributorId`、`packageId?`、`pendingSupplementHand.reviewId?` | 分别为 `rounds[].id`、`identities[].id`、`evidencePackages[].id`（`.contributionId` 必须为本 Contribution）、`reviews[].id`；同 contributor/round 不重复。 |
| `evidencePackages[].roundId`、`contributionId`、`authorId`、`agendaId`、`currentVersionId` | 分别为 `rounds[].id`、`contributions[].id`、`identities[].id`、`agenda[].id`、本 package 的 `versions[].id`；所指 Round/Contribution/Agenda/author 必须互相对应。`versions[].id` 在整个 Meeting 的 EvidenceVersion 种类中唯一，每个 version 的 `claims[].materialIds[]` 指向该 version 的 `materials[].id`；claim/material ID 在同 version 内各自唯一。 |
| `registrations[].versionId`、`managerId`；`reviews[].versionId`、`reviewerId`、`baselinePublicationIds[]` | version 指全 Meeting 的 EvidenceVersion ID；manager/reviewer 指对应 role 的 `identities[].id`；review baseline 指 `publications[].id` 且顺序等于所属 Round 的 `publicBaselinePublicationIds`。 |
| `reviewDeliveries[].reviewId`、`authorId` | 分别为 `reviews[].id`、所审 version 的 package.authorId；sent 只带 sentAt，failed 只带 failedAt。 |
| `publications[].roundId`、`finalVersionIds[]`、`finalReviewIds[]` | 分别为 `rounds[].id`、EvidenceVersion ID、`reviews[].id`；version/review 必须属于同 Round，组内不重复；publication seq 为正安全整数，按数组顺序严格递增。 |
| `messages[].actorId`、`agendaId`、`publicationId` | 分别为 `identities[].id`、`agenda[].id`、`publications[].id`；message seq 为正安全整数，按数组顺序严格递增。`relatedIds[]` 是混合 Meeting-local 实体/fact ID，不带 target kind；静态 validator 只校验 ID 类型和组内不重复，不能伪造外部 committed-fact 索引。 |
| `proposals[].actorId`、`agendaId`、`evidenceIds[]`、`supersedesRevisionId?` | identity、Agenda、已 published EvidenceVersion、同 proposal 的立即前序 revision；`proposalId` 是无独立 Proposal 实体的 opaque 分组 ID，校验非空及同组 ordinal 连续从 1 递增，不伪造不存在的 FK。 |
| `positions[].proposalRevisionId`、`actorId`、`evidenceIds[]` | ProposalRevision、identity、已 published EvidenceVersion；组内不重复。 |
| `decisionCandidates[].proposalRevisionId`、`actorId`、`evidenceIds[]`、`positionIds[]` | ProposalRevision、identity、已 published EvidenceVersion、同 revision 的 Position；组内不重复。 |
| `decisions[].candidateId`、`proposalRevisionId`、`actorId`、`evidenceIds[]`、`positionIds[]`、`replacesDecisionId?` | DecisionCandidate、其 revision/actor/evidence/positions 的相同值、已有 Decision；optional replaces 不得自指。 |
| `riskDispositions[].issueId`、`actorId`、`evidenceIds[]` | Issue、Captain identity 或受控 local controller ID、已 published EvidenceVersion；由于 local controller 不在 `identities[]`，静态 validator 只检查 actorId 非空，具体授权由创建该 fact 的切片验证。 |
| `completionDeclarations[].actorId`、`outputId`、`criterionId?`、`evidenceIds[]`、`taskId?` | identity、required output、acceptance criterion、已 published EvidenceVersion、MeetingTask。 |
| `completionFacts[].actorId`、`outputId`、`criterionId?`、`evidenceIds[]`、`decisionIds[]`、`supersedesFactId?` | Captain identity、required output、acceptance criterion、已 published EvidenceVersion、Decision、已有 CompletionFact；组内不重复。 |
| `tasks[].createdBy`、`assigneeId`、`agendaId?`、`contextPublicationUpperBound[]`、`reassignedFromTaskId?` | identity、identity、Agenda、Publication、已有 MeetingTask；`authorizationId` 是 Repository/Runtime 授权对象 ID，静态 validator 只检验非空而不伪造当前聚合内 FK。 |
| `managerPlans[].agendaId`、`managerId`、`basedOnPublicationId?` | Agenda、具有 manager role 的 identity、Publication（所属 Round 的 agendaId 必须相同）；每 Agenda 至多一个 active plan。 |
| `privateMails[].senderId`、`recipientId`、`agendaId?`、两组 contextPublicationUpperBound | identity、identity、Agenda、Publication；`relatedIds[]` 同 messages 的混合 ID 规则。 |
| `termination.id`、各组 decision/completion/unresolved question/issue/unclosed contribution IDs | termination.id 唯一且非空；其五组分别为 Decision、CompletionFact、Question、Issue、Contribution，组内不重复。 |
| `archive.terminationId`、`includedPublicationIds[]`、`includedDecisionIds[]`、`includedCompletionFactIds[]` | 必须等于 `termination.id`；其它三组分别为 Publication、Decision、CompletionFact；组内不重复。`publicSnapshotVersion` 为正且不超过 Meeting.version；archive.createdBy 可为 local controller，静态只验非空。 |
| `continuation.sourceArchiveId`、`selectedMaterialIds[]`、`importedBy`；`lifecycle.changedBy` | 旧 Meeting archive/material 与 local controller 都在当前聚合外，静态只检验非空 ID/数组类型；来源读取权限、local caller binding 与 Session close receipt 属后续 Runtime/Archive 切片，不能假称当前已验证。 |

每个有 `id` 的 Meeting-owned 实体数组按同实体种类唯一；version/material 等嵌套 ID 按本表指明的作用域唯一。数组保留输入顺序，validator 不排序、不修复。lifecycle 的 `terminal` 必有 termination，`archiving` 必有 termination 和 archive，`archived` 必有 termination 和 status=complete 的 archive；`archive` 在更早 lifecycle 不得出现。Round baseline 的历史生成时相等、旧 version 不变、Session close receipt 与调用者可见性不能由静态 snapshot 证明，不在本 validator 伪造证据。

## 8. 执行前检查

此检查是进入 T1a 前的一次性门禁，不编号为执行步骤，不修改产品、测试或正式文档。检查通过才可从 T1a 开始；STOP 时尚无已完成的实施步骤。

### 正式依据、checkout 与 baseline

检查前提：已获本切片独立实现授权；本 RUNBOOK 已重新审计并标为 `Executable`；分支为 `docs/runbook-meeting-state-transitions`；执行者以 `git status --short` 记录 baseline，保留执行前已有的文档改动，不把本 RUNBOOK 的 Author/Audit 改动当作产品代码。

允许修改：无。

禁止修改：`plugin/` 下所有文件、全部正式真相源、全部测试、package/lockfile、readiness 与本 RUNBOOK 以外的文件。

核对内容：读取 requirements、Meeting Interface、DSH Role Interface、Domain Design 与 Meeting Design 中已同步的权限、reviewer 责任和 Issue 数据规则，确认任意 identity 仅 record、Captain only resolve/dispose、local controller 四动作均禁止；确认 `record_issue` 排除 `accepted_risk`、四组引用已正式登记且 blocking 判据一致；确认两组 identity responsibility ID 均指 Agenda.id、requiredReviewerIds 指 identity.id 且双向一致。若本 RUNBOOK 的首页状态不再为 `Executable`，不得进入 T1a。

检查命令（从本 RUNBOOK 所在 checkout 的仓库根 `/Volumes/storage/workspace/convivium` 执行；不得切换到同名项目的另一 worktree；按顺序记录全部实际输出）：

```bash
git branch --show-current
git rev-parse --show-toplevel
git status --short
rg -n "record_question|resolve_question|record_issue|dispose_issue|accepted_risk|affectedOutputIds|requiredReviewerIds|reviewResponsibilityIds|Termination.id|error precedence" docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/20-interfaces/MEETING-INTERFACE.md docs/20-interfaces/DSH-ROLE-INTERFACE.md docs/30-designs/DOMAIN-DESIGN.md docs/30-designs/MEETING-DESIGN.md
pnpm --dir plugin verify
```

检查通过：branch 命令仅输出 `docs/runbook-meeting-state-transitions`，top-level 命令仅输出 `/Volumes/storage/workspace/convivium`；`git status --short` 中执行前允许的 dirty 范围仅为本 RUNBOOK 和已授权的 requirements/interface/design 文档，不能已有 `plugin/` 改动；`rg` 能在五个指定文件定位权限、Issue 创建/风险接受/阻塞字段、reviewer 责任、Termination.id 和 Interface 错误顺序，且与第 3、6、7 节一致；baseline `pnpm --dir plugin verify` 退出码 0；本 RUNBOOK 已重新审计并标为 `Executable`。

检查停止：本 RUNBOOK 不再为 `Executable`、branch/baseline/dirty 范围不符、任一正式来源缺失/冲突或 baseline verify 失败；报告路径和命令输出，不能从 legacy 或 caller 字段取默认值，不清理用户已有文件。

失败恢复：无状态、文件、数据库或外部副作用可回滚；此检查禁止写入。

## 9. 机械执行步骤

### T4：记录并处置 AgendaCandidate

前置状态：T1–T3 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：T1 文件、legacy/外部模块；只可扩充 candidate cases，不改变 T2/T3 行为。

执行：`raise_agenda_candidate` 允许任一现存、已绑定的 Meeting identity，用 `generatedId` append 一项 pending candidate；sourceMessageId? 必须指已有 FormalMessage。`dispose_agenda_candidate` 仅 Captain identity 可用，只对 pending candidate 处置一次：promoted 必有完整 `promotedAgenda`，其 caller-supplied `id` 在 Agenda 中未用，校验全部 AgendaInput 字段与 refs，先校验每个 requiredReviewerId 对应 identity 存在、具有 evidence_reviewer role、其旧 reviewResponsibilityIds 不含新 Agenda.id 且数组无重复；同次标 candidate promoted、append 一个完整 pending Agenda，并按 caller reviewer ID 顺序向每个 identity.reviewResponsibilityIds append 新 Agenda.id，三组状态原子更新，既不清空/改写 requiredReviewerIds 也不授新 role；parked/rejected 不带 promotedAgenda，只改 candidate。三种处置都不改 active Agenda 或产生 outbox；accepted root version/updatedAt 更新一次，raise fact refs `[meetingId,generatedId]`，dispose fact refs 为 park/reject `[meetingId,candidateId]`、promote `[meetingId,candidateId,promotedAgenda.id,...promotedAgenda.requiredReviewerIds]`，payload 为 references。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin exec prettier src/domain/meeting-state-v1-transitions.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts --check
```

PASS：两命令均退出码 0；raise append 恰一项，promote candidate+Agenda+每个 reviewer identity.reviewResponsibilityIds 原子变化，caller requiredReviewerIds 原样保留、reviewer role 不变，park/reject 无新 Agenda，active 不变，每次单一 fact/version+1；非 Captain dispose=`UNAUTHORIZED`、missing candidate/sourceMessage/reviewer identity=`NOT_FOUND`、重复处置=`INVALID_STATE`、重复 requiredReviewerId=`INVALID_ARGUMENT`；已用 Agenda ID/reviewer 无 evidence_reviewer role/已有非法责任/缺 promotedAgenda/非法附带 promotedAgenda=`PRECONDITION_FAILED`；拒绝均保持原 state 引用与空 facts；T2/T3 tests 仍 PASS。

STOP：需要 Runtime outbox、implicit Agenda activation 或第二次 candidate disposition；停止，不使用 legacy。

失败恢复：无外部副作用；保留已 PASS 与本步改动，不用 checkout/reset/删文件。

### T5：Question 记录与处置

前置状态：T1–T4 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：T1 文件、legacy/外部模块；只可扩充 Question cases，不改变 T2–T4 行为。

执行：`record_question` 允许任一现存、已绑定的 Meeting identity，用 `generatedId` append open Question，actorId=actor.id，Agenda/三组 ObjectiveTarget ID typed FK 与各组唯一性均按第 7 节校验；blocking=true 至少关联一个 status 非 satisfied 的目标。`resolve_question` 仅 Captain identity 可用，目标仅 open/deferred；answered/withdrawn 将 blocking=false，deferred 保留旧 blocking。rationale 非空；evidenceIds 非空、唯一，每个为已在 Publication.finalVersionIds 中公开的 EvidenceVersion.id；普通 record fact refs `[meetingId,generatedId]`，处置 refs `[meetingId,questionId,...evidenceIds]` 并以 question_disposition payload 一次包含旧/新 status/blocking、理由、证据。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin exec prettier src/domain/meeting-state-v1-transitions.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts --check
```

PASS：两命令均退出码 0；Captain/Manager/reviewer 可 record，只有 Captain 可 resolve，local 两动作=`UNAUTHORIZED`；answered/withdrawn 清阻塞、deferred 保留；单一 fact payload/actor/time 精确；不存在 target/evidence=`NOT_FOUND`、未公开 evidence/无资格 blocking=`PRECONDITION_FAILED`、终结对象重复处置=`INVALID_STATE`；rejection state identity/facts/version 不变，T2–T4 suite 不退化。

STOP：必须据自然语言判断影响、允许 local/Manager resolve 或使用未公开证据；报告字段与证据，不猜测。

失败恢复：无外部副作用；保留已 PASS 与本步改动，不用 checkout/reset/删文件。

### T6：Issue 记录与处置

前置状态：T1–T5 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：T1 文件、legacy/外部模块；只可扩充 Issue cases，不改变 T2–T5 行为。

执行：`record_issue` 允许任一现存、已绑定的 Meeting identity，用 `generatedId` append open Issue；四组显式 ID 数组分别按第 7 节 typed FK 与唯一性验证，riskLevel 不得缺失/默认，分类只用 `blocking|follow_up|pending_discussion|out_of_scope`。high 未接受必须 classification=blocking 与 blocking=true；其它 blocking 须有受影响的未 satisfied target 或所属 Agenda 的 requiredReviewer ID；创建时 classification/blocking 成对，不匹配与无资格 blocking 拒绝而非改写。`dispose_issue` 仅 Captain identity 可用，目标仅 open/deferred；resolved/out_of_scope 将 blocking=false 且保留旧 classification，deferred 保留两者；理由非空、证据 ID 须非空/唯一/已公开 EvidenceVersion.id。record refs `[meetingId,generatedId]`，处置 refs `[meetingId,issueId,...evidenceIds]` 且以 issue_disposition payload 一次记录旧/新 status/blocking、理由、证据。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin exec prettier src/domain/meeting-state-v1-transitions.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts --check
```

PASS：两命令均退出码 0；任一现存 identity 可 record，只有 Captain 可 dispose，local 两动作=`UNAUTHORIZED`；合法 high Issue 阻塞、合法非阻塞 follow-up、四组 typed FK、resolved/out_of_scope 清阻塞、deferred 保留，fact audit payload 精确；直接 `accepted_risk`、缺 riskLevel=`INVALID_ARGUMENT`，high non-blocking/无资格 blocking/不匹配 classification=`PRECONDITION_FAILED`，未公开 evidence=`PRECONDITION_FAILED`，已终结再次处置=`INVALID_STATE`；所有 rejection 原 state/facts/version 不变，T2–T5 suite 不退化。普通 identity 不能借 record/dispose 创建 accepted_risk；仅后续 `dispose_risk` accept 可做到。

STOP：需要自然语言判定风险接受、默认风险等级、local Issue disposal 或在此切片实现 dispose_risk；报告来源，不新增兼容层。

失败恢复：无外部副作用；保留已 PASS 与本步改动，不用 checkout/reset/删文件。

### T7：ManagerPlan 创建与替代

前置状态：T1–T6 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：T1 文件、Round/Agenda/Candidate execute 路径、legacy planning、Runtime；只可扩充 plan case，不改变 T2–T6 行为。

执行：`plan_next_step` 仅 manager-role identity 可用；Agenda 存在、任意 Round 均不得 open、planKind 为五值、rationale/optional blockingReason 非空。用 `generatedId` append active Plan，managerId=actor.id、agendaId=action.agendaId、kind=action.planKind、createdAt=now、basedOnPublicationId 缺席；同 Agenda old active Plan 同次 supersede，其它 Plan/Agenda/Round 不变。accepted root version/updatedAt 更新一次，fact refs `[meetingId,generatedId,agendaId,oldPlanId?]`、payload 为 references；不产生 completed。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin exec prettier src/domain/meeting-state-v1-transitions.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts --check
```

PASS：两命令均退出码 0；manager-only、missing Agenda=`NOT_FOUND`、open Round=`PRECONDITION_FAILED`、terminal=`MEETING_TERMINAL`；有/无旧 active Plan 两路径分别验证 append 与原子 supersede，别的 Agenda 不变，basedOnPublicationId 缺席、无 completed output，accepted version+1/updatedAt/fact 精确，rejection 原 state/空 facts/原版本；T2–T6 suite 不退化。

STOP：必须实现 Round、plan execution 或 DSH/Runtime；报告依赖，不新增消费者。

失败恢复：无外部副作用；保留已 PASS 与本步改动，不用 checkout/reset/删文件。

### T8：Domain entry、完整验证与 readiness

前置状态：T1–T7 PASS。

允许修改：`plugin/src/domain/index.ts`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`。

禁止修改：其它文件、legacy exports、package config。

执行：在 `plugin/src/domain/index.ts` 只具名导出 `validateMeetingStateV1`、`MeetingStateValidationResultV1`、`transitionMeetingStateV1` 及第 7 节六个公开 target 类型，不删除 legacy export。先运行下列四条工程命令，均 PASS 后记录 `git rev-parse HEAD` 与 `git status --short`，再只更新 readiness 的“目标领域模型与命名”“Meeting 生命周期与本地控制”“Agenda、ManagerPlan 与轮次安排”“新契约自动化测试”四行及 Executed Validation/Explicitly Not Covered，写入真实日期、HEAD、命令结果与 dirty 状态；仅称目标 validator 与十个纯 Domain action 已覆盖，Runtime/Repository/Archive/DSH/Remote/Browser、create/start/end、Round、legacy replacement 保留 Not Covered，不添加指向临时 RUNBOOK 的长期引用。最后执行文档与范围命令；不得在 T8 删除 RUNBOOK。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin lint
pnpm --dir plugin verify
git rev-parse HEAD
git status --short
node .github/scripts/check-doc-links.mjs
git diff --check
git diff --name-only
```

PASS：每条命令退出码 0；readiness 只在工程门禁 PASS 后更新，更新后链接/diff 门禁仍 PASS；status/diff 的代码文件仅第 7 节两个目标 production、两个目标 test、meeting-state-v1.ts 与 domain/index.ts，其它可见修改仅执行前 baseline 中允许的 docs 与本步 readiness；readiness 不把未接线功能写为对齐。

STOP：任一命令失败、必须编辑未列文件或 readiness 夸大覆盖；报告最后 PASS/首个失败，不缩减验证、不提交。

失败恢复：无数据库/外部副作用；保留最后 PASS 和用户原改动，禁止 reset、checkout 或删除文件。

### T9：已授权的 RUNBOOK 收口与删除

前置状态：T1–T8 全部 PASS；本切片的长期确认结论已在 requirements/interfaces/designs，真实验证与 Not Covered 已在 readiness；用户另行明确授权删除本 RUNBOOK。当前 Author/Audit 阶段不满足该前置，不运行 T9。

允许修改：只删除 `docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md`；不得改其它文件。

禁止修改：全部 production/test、正式真相源、readiness、TODO、其它 RUNBOOK、Git 历史；不得 stage、commit、push、创建 PR 或合并。

执行：先从仓库根逐条运行下列前置命令。`git ls-files` 与 `git log` 必须证明本 RUNBOOK 已进入可恢复 Git 历史，两个 `git diff --quiet` 必须证明本文件当前内容没有未提交/暂存增量；记录删除前 `git status --short`，`rg` 结果只可指向本 RUNBOOK 本身。任一不符即 STOP，不能先删除。全部满足且已获明确删除授权后，使用文件编辑工具精确删除本文件；不运行递归删除，也不删除其历史。随后执行四条后置验证命令。

验证：

```bash
git ls-files --error-unmatch docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git log -1 --format=%H -- docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git diff --quiet -- docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git diff --cached --quiet -- docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git status --short
rg -n "RUNBOOK-MEETING-STATE-CORE-TRANSITIONS|MeetingState Core Structure And Transitions" .
! rg -n "RUNBOOK-MEETING-STATE-CORE-TRANSITIONS|MeetingState Core Structure And Transitions" .
node .github/scripts/check-doc-links.mjs
git diff --check
git status --short
```

PASS：六条前置命令的退出码均为 0，`git log` 输出非空 commit ID、`rg` 只列本 RUNBOOK 路径；删除后 `! rg`、链接检查、diff check 均退出码 0；前后 `git status --short` 相比只多出本 RUNBOOK 的删除，不包含本步新增的其它改动。报告已删除的唯一文件与可由 Git 历史恢复的 commit ID；不要将未执行 commit 描述为已提交。

STOP：无单独删除授权、RUNBOOK 尚未进入历史或仍有未提交增量、已有其它引用、任一后置验证失败；报告最后 PASS/命令输出。删除前失败保持文件原样；删除后任一检查失败，必须按下述失败恢复精确恢复本 RUNBOOK 后 STOP，不使用递归删除或清理用户其它改动。

失败恢复：本步无数据库/外部副作用。若尚未删除，保持文件原样。若已删除且后置检查失败，执行以下仅恢复本 RUNBOOK 的固定命令；T9 前置两个 `git diff --quiet` 已证明 HEAD 中的本文件与删除前内容相同。

```bash
git show HEAD:docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md > docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git diff --quiet -- docs/30-designs/RUNBOOK-MEETING-STATE-CORE-TRANSITIONS.md
git status --short
```

三命令必须退出码 0、RUNBOOK 与 HEAD 无 diff、status 中其它路径与删除前记录相同，然后 STOP。若恢复或复核失败，STOP 并报告当前文件状态和实际输出，不触碰用户其它改动；不得把删除标为 PASS。

## 10. 验证矩阵

| 验证范围 | 固定命令 | 当前状态/预期 | 失败处理 |
| --- | --- | --- | --- |
| RUNBOOK 内部链接与 Markdown 本地链接 | `node .github/scripts/check-doc-links.mjs` | 作者交付时必须为退出码 0；只证明链接目标存在，不证明产品行为 | STOP；报告输出，不修改无关文档。 |
| 文档改动的空白/冲突标记 | `git diff --check` | 作者交付时必须为退出码 0 | STOP；只修复本 RUNBOOK 的空白错误后重跑。 |
| target validator 与 transitions | `pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/meeting-state-v1-transitions.spec.ts` | 剩余 T4–T7 必须 PASS；已完成步骤正文按执行约定删除 | 失败时不得降级断言。 |
| target TypeScript/API boundary | `pnpm --dir plugin typecheck && pnpm --dir plugin lint` | T8 必须 PASS；当前尚未执行 | 不得改 eslint 或 export 边界绕过。 |
| 此切片的完整工程验证 | `pnpm --dir plugin verify` | T8 必须 PASS；不证明 DSH runtime | 任一失败 STOP，报告首次失败及实际输出。 |
| DSH profile、Browser、Repository/recovery、Remote、outbox、legacy compatibility | 不运行 | `Not Applicable` 于本 RUNBOOK scope：本切片不得接线这些边界 | 不得将未运行写为通过。 |

## 11. 完成定义、readiness 与删除

当前状态未完成：已完成步骤正文按执行约定删除，剩余步骤仍须依序执行；不得提前删除整个 RUNBOOK，也不得称目标领域核心“已对齐”。

仅当 T1–T8 已完成规定 focused tests、`typecheck`、`lint`、`verify`、文档链接检查和 `git diff --check` 后，才可把实际命令、日期、commit 边界、结果和 Not Covered 写入 readiness。长期确认的行为已先迁移到 requirements/interfaces/designs；T9 才处理临时 RUNBOOK 删除与残留引用。无精确删除授权、无本 RUNBOOK 的可恢复提交历史或任一 T 步不满足则保留本文件；删除不等于 commit，当前任务也不授权 commit/push/PR。

## 12. Author Audit

逐项按 [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md#authoring-and-audit) 审计：已完成步骤正文依执行约定删除；剩余 Scope 2→T4–T7、Scope 3/4→T8、最终文件删除→T9。第 8 节执行前检查固定为当前 `docs/runbook-meeting-state-transitions` checkout `/Volumes/storage/workspace/convivium`，不得在另一 worktree 的 `main` 执行。T9 删除后检查失败必须精确恢复 RUNBOOK 再 STOP。每步允许文件、命令、可观察 PASS/STOP、失败恢复与 Non-goals 已重新核对；CreateMeeting identityId 映射、active risk fact 跨边界证明、Repository/archive retention 仍属后续切片，不由本纯 Domain 切片猜测。

审计结论：**Executable**，仅说明低级执行者可在第 8 节授权、checkout 与 baseline 门禁满足后按 T1–T8 实施或 STOP；T9 仍须独立删除授权及当时的 Git 历史/无增量门禁。2026-09-16 在 `docs/runbook-meeting-state-transitions` checkout 实际执行 `pnpm --dir plugin verify`：退出码 0，90 test files/961 tests PASS，且 build/environment/contract/agent-definitions/package 检查均通过（仅证明 legacy 基线，不证明目标行为）；`node .github/scripts/check-doc-links.mjs` 为 462 checked/0 errors（不查 anchors），`git diff --check` 退出码 0。目标 focused tests、目标 TypeScript、target lint/build/verify、真实 DSH 与 Browser 均未执行，不描述为通过。Execute 与 push/PR 仍须分别获授权。
