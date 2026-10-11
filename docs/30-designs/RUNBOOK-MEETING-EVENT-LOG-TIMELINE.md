# RUNBOOK：Meeting 基础事件日志与时间线投影

## 0. 状态与工作边界

- 状态：`Executable`
- 建立日期：2026-10-11
- 执行分支：`codex/meeting-event-timeline`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 起点：Repository 已持久化通用 `events` map，但除 `meeting.created` 外生产 command 均提交 `events: []`；MeetingView 不公开事件；Client 从 DTO 时间字段重建节点。
- 终点：新 Meeting 的 accepted command 按实际公开结果原子追加 `0..n` 条不含 milestone 语义的基础 occurrence event；local controller 读取完整 `timelineEvents`；Client 从事件建立节点并派生里程碑，旧 Meeting 只走原 DTO 兼容投影。
- 授权边界：本 RUNBOOK 只授权本文件列出的代码、测试和 readiness 修改；不授权 commit、push、PR、merge、重建 `dsh-workspace/` 或清空人工 SQLite。

## 1. 执行者契约

1. 严格按 T0 → T7 顺序执行。每步只有 PASS 后才能进入下一步。
2. 只修改该步骤“允许修改”的文件。编译错误若要求触碰未列文件，立即 STOP。
3. 每个步骤的“允许修改”清单最多包含 10 个唯一文件；执行中若完成该步骤必须修改第 11 个文件，立即 STOP，不得把额外文件并入当前步骤或借验证步骤修复。
4. 不引入 event bus、durable queue、consumer offset、ack、后台 worker、新数据库、通用 projection framework 或第三方依赖。
5. 不向 event type、payload 或 Repository 增加 `milestone`、`stageInstance`、`occurrence`、`title`、`lane`、`collapsed`、`groupStatus` 等展示字段。
6. 不用 `CommittedFactRecord` 或 outbox 替代基础事件；不删除或改写既有 fact/outbox 语义。
7. 不迁移、回填或删除旧 Meeting；不得把 legacy DTO 节点与 event 节点合并。
8. 任一步失败时保留工作树，禁止回滚用户已有修改。STOP 报告必须包含最后 PASS 步骤、文件与 symbol、复现命令、实际输出和所需人工决定。

## 2. 正式依据与当前断点

| 链路                         | 正式依据                                                                                                                              | 当前代码断点                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 事件是基础事实、里程碑是展示 | [MO-FR-17.8、17.10、17.18、17.21、17.22](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-17meetings-view-概览与时间线) | `plugin/src/runtime/application-service/meeting-command.ts:createRepositoryCommand` 固定 `events: []` |
| 跨边界 event DTO             | [MeetingEventView](../20-interfaces/MEETING-INTERFACE.md#read-remote-and-projection)                                                  | `plugin/src/protocol/meeting-view.ts:MeetingViewSchema` 无 `timelineEvents`                           |
| 原子持久化与重放             | [Meeting Design / 基础事件日志](./MEETING-DESIGN.md#基础事件日志)                                                                     | `appendEvents` 已与 snapshot/receipt/fact/outbox 同 commit；缺读取 port 和 typed payload              |
| local controller 读取        | [Meeting Interface / Read](../20-interfaces/MEETING-INTERFACE.md#read-remote-and-projection)                                          | `plugin/src/runtime/meeting-lifecycle.ts` 只把 snapshot 交给 `projectMeetingView`                     |
| Client 分组                  | [DSH Plugin Design / 时间线](./DSH-PLUGIN-DESIGN.md#时间线-client-projection)                                                         | `buildTimelineNodes` 扫描 DTO 时间；无 milestone group projection                                     |

当前可复用机制：

- `plugin/src/repository/domain/domain-meeting-repository.ts:appendEvents` 已分配连续 `eventSeq` 并把 seq 写入 receipt。
- `plugin/src/repository/domain/domain-meeting-repository-core.ts:completeCreate` 已写 `meeting.created`。
- `plugin/src/repository/domain/schemas.ts:PersistedEventSchema` 已拥有 `eventSeq`、`meetingVersion`、`type`、`payload`、`createdAt`。
- `plugin/src/repository/types.ts:DomainEventInput` 已是 transition 输入。

## 3. Scope、Non-goals 与 Not Applicable

### Scope

1. 定义基础事件 payload、持久记录读取类型和公开 `MeetingEventView` Schema。
2. 为创建和每个形成公开 Meeting 事实的 accepted command 生成 `0..n` 条 typed occurrence event。
3. 将事件与 snapshot/receipt/fact/outbox 原子提交并支持 reopen 后读取。
4. 只在 local controller MeetingView 中公开完整日志；identity view 缺席。
5. Client event-first projection、旧 Meeting legacy fallback、milestone 分组、关键/过程可见性。
6. focused tests、完整 `pnpm verify`、人工 Web smoke、readiness 迁移和 RUNBOOK 删除条件。

### Non-goals

- 不新增命令、领域对象、错误码、Remote method、Archive 字段或 Agent tool。
- 不保存 UI milestone，不新增 event ID；唯一键固定为 `(meetingId,eventSeq)`。
- 不记录读取、拒绝、冲突、receipt replay、outbox attempt、Session notice、PrivateMail 或 Client 交互。
- 不为尚无生产 action 的 ProposalRevision、Position、DecisionCandidate、MeetingTask 新增事件。
- 不改变现有授权、caller filtering、fact、outbox、checkpoint 和 SQLite schema。

### Not Applicable

- 网络、HTTP、跨 Host、多用户迁移：当前单 Host loopback 契约未变化。
- DSH Session event API：Meeting event 属于 Repository commit，不使用 DSH Session Events。
- 数据库 migration/backfill：旧 Meeting 通过 optional field 缺席和 Client legacy fallback 保留。

## 4. 精确数据结构与所有权

### 4.1 持久事件 payload

在新增的 `plugin/src/domain/meeting-event.ts` 定义以下精确类型，并由 `plugin/src/domain/index.ts` 导出；event envelope 顶层字段均 required，数组默认 `[]`，不得 nullable，kind-specific data 只有下列显式 `?` 字段可缺席。`MEETING_EVENT_KINDS` 必须显式列出第 5 节所有 occurrence kind，`MeetingEventKind` 从该 readonly tuple 派生，不得依赖 command action 或 Protocol：

```ts
export const MEETING_EVENT_LOG_VERSION = 1 as const;
export const MEETING_EVENT_KINDS = [
  "meeting.created",
  "meeting.lifecycle_changed",
  "agenda.activated",
  "agenda_candidate.disposed",
  "manager_plan.recorded",
  "round.opened",
  "round.participation_recorded",
  "hand_raise.recorded",
  "hand_raise.disposed",
  "evidence.submitted",
  "contribution.closed",
  "contribution.failed",
  "evidence_review.claimed",
  "evidence_validation.failed",
  "evidence_review.submitted",
  "review_delivery.recorded",
  "round.published",
  "formal_message.published",
  "round.aborted",
  "identity.recommended",
  "identity.admission_recorded",
  "question.disposed",
  "issue.disposed",
  "risk.disposed",
  "decision.recorded",
  "decision.changed",
  "completion_fact.recorded",
  "completion_fact.changed",
  "meeting.ended",
  "archive.started",
  "archive.completed",
] as const;
export type MeetingEventKind = (typeof MEETING_EVENT_KINDS)[number];
export type MeetingEventActor =
  | { kind: "captain"; actorId: string }
  | { kind: "identity"; actorId: string }
  | { kind: "system" };
export type MeetingEventObjectKind =
  | "meeting"
  | "agenda"
  | "agenda_candidate"
  | "manager_plan"
  | "round"
  | "contribution"
  | "evidence_version"
  | "evidence_review"
  | "review_delivery"
  | "publication"
  | "formal_message"
  | "identity_recommendation"
  | "identity"
  | "question"
  | "issue"
  | "decision"
  | "completion_fact"
  | "risk_disposition"
  | "termination"
  | "archive";
export interface MeetingEventObjectRef {
  kind: MeetingEventObjectKind;
  id: string;
}
export interface MeetingEventDataByKind {
  "meeting.created": Record<string, never>;
  "meeting.lifecycle_changed": {
    from:
      | "preparing"
      | "running"
      | "paused"
      | "converging"
      | "ending"
      | "terminal"
      | "archiving"
      | "archived";
    to:
      | "preparing"
      | "running"
      | "paused"
      | "converging"
      | "ending"
      | "terminal"
      | "archiving"
      | "archived";
    reason?: string;
  };
  "agenda.activated": {
    previousDisposition: "completed" | "deferred" | "closed";
    reason: string;
  };
  "agenda_candidate.disposed": {
    disposition: "promoted" | "parked" | "rejected";
    reason: string;
  };
  "manager_plan.recorded": {
    planKind:
      | "open_round"
      | "continue_agenda"
      | "stop_agenda"
      | "raise_agenda_candidate"
      | "wait_for_required_identity";
    rationale: string;
    blockingReason?: string;
  };
  "round.opened": { deadlineAt?: number };
  "round.participation_recorded":
    | { contributorId: string; status: "declined"; reason: string }
    | { contributorId: string; status: "no_response" };
  "hand_raise.recorded": { contributorId: string; purpose: string };
  "hand_raise.disposed":
    | {
        contributorId: string;
        disposition: "accepted";
        reason: string;
        contributionId: string;
      }
    | {
        contributorId: string;
        disposition: "rejected" | "deferred";
        reason: string;
      };
  "evidence.submitted": { summary: string };
  "contribution.closed": {
    exit: "withdrawn" | "timed_out" | "submission_missing";
    reason: string;
  };
  "contribution.failed": {
    sourceEffectId: string;
    stage: string;
    failureCode: string;
    failureSummary: string;
    attemptCount: number;
    retryable: boolean;
  };
  "evidence_review.claimed": { claimId: string; sourceEffectId: string };
  "evidence_validation.failed": {
    claimId: string;
    reason: "review_timeout" | "review_interrupted" | "dispatch_failed";
  };
  "evidence_review.submitted": { claimId: string; scope: string };
  "review_delivery.recorded":
    { status: "sent" } | { status: "failed"; failureReason: string };
  "round.published": Record<string, never>;
  "formal_message.published": { messageKind: string };
  "round.aborted": { reason: string };
  "identity.recommended":
    | { decision: "reject"; status: "rejected"; rationale: string }
    | {
        decision: "admit";
        status: "provisioning" | "active";
        rationale: string;
      };
  "identity.admission_recorded":
    { status: "active" } | { status: "failed"; failureCode: string };
  "question.disposed": {
    status: "answered" | "withdrawn" | "deferred";
    rationale: string;
  };
  "issue.disposed": {
    status: "resolved" | "deferred" | "out_of_scope";
    rationale: string;
  };
  "risk.disposed": {
    action: "accept" | "reject";
    scope: string;
    rationale: string;
  };
  "decision.recorded": { status: "accepted" };
  "decision.changed":
    | { status: "superseded"; rationale: string; replacementDecisionId: string }
    | { status: "revoked"; rationale: string };
  "completion_fact.recorded": {
    outputId: string;
    statement: string;
    rationale: string;
  };
  "completion_fact.changed":
    | { status: "superseded"; rationale: string; replacementFactId: string }
    | { status: "revoked"; rationale: string };
  "meeting.ended": {
    outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
    reason: string;
  };
  "archive.started": { status: "complete" };
  "archive.completed": { status: "complete" };
}
export interface MeetingEventPayload<
  K extends MeetingEventKind = MeetingEventKind,
> {
  logVersion: typeof MEETING_EVENT_LOG_VERSION;
  actor: MeetingEventActor;
  subject: MeetingEventObjectRef;
  relatedObjects: MeetingEventObjectRef[];
  data: MeetingEventDataByKind[K];
}
export type MeetingEventInput = {
  [K in MeetingEventKind]: {
    type: K;
    occurredAt: number;
    payload: MeetingEventPayload<K>;
  };
}[MeetingEventKind];
export type PersistedMeetingEvent = {
  [K in MeetingEventKind]: {
    eventSeq: number;
    meetingVersion: number;
    type: K;
    payload: MeetingEventPayload<K>;
    createdAt: number;
  };
}[MeetingEventKind];
```

上面的 mapping 与 Meeting Interface `MeetingEventDataByKind` 必须逐键相同；Domain 中 `OpaqueId`/`EpochMs` 分别使用既有 `string`/`number` 表示，不能自行增删字段或从当前实现推断替代类型。Domain 不导入 Protocol 或 Repository，因此此文件不引用 Repository 的 `JsonValue`。`turnId`、`attemptId` 继续留在内部 `PersistedEventSchema`，公开 mapper 丢弃。`plugin/src/repository/types.ts` 的通用 `DomainEventInput` 增加 optional `occurredAt`；`MeetingEventInput` 在 domain 内把 `type`、`payload` 和 `occurredAt` 收紧，且不声明 turn/attempt。只有生产 `buildMeetingEvents` 与 creation 使用 `MeetingEventInput`。Repository `appendEvents` 必须写 `createdAt = event.occurredAt ?? repositoryNow`；Meeting 生产路径总是传 `occurredAt`，fallback 只保留通用 Repository 兼容性。这样 occurrence、fact 与对象时间共享 application `now`，不会出现两个时钟，也不把 Meeting 业务词汇扩散到通用 Repository port。

`data` 按 Meeting Interface 的 `MeetingEventDataByKind` 建立 discriminated strict schema；禁止仅用 `Record<string, JsonValue>`、`unknown` 或 index signature 作为校验终点。`meeting.lifecycle_changed` 额外 refine `from!==to`；所有 ID/文本非空、时间为非负安全整数、attemptCount 为正安全整数，union 未出现的字段必须缺席。契约列出的 `summary`、`statement`、`rationale`、`reason`、`scope` 和失败摘要允许保存；完整对象、PrivateMail、Session、capability、凭据和隐藏推理禁止保存。递归拒绝 `milestone`、`milestoneId`、`stageInstance`、`occurrence`、`title`、`lane`、`collapsed`、`groupStatus`。subject 当前对象只用于补充展示，不能成为历史 occurrence 的唯一内容来源。

### 4.2 公开 DTO

在 `plugin/src/protocol/meeting-view.ts` 独立定义与 Domain 同值的 local `MEETING_EVENT_KINDS`，并增加与 Meeting Interface 同字段的 strict Zod schemas：`MeetingEventObjectRefSchema`、逐 kind 的 `MeetingEventDataSchemaByKind`、`MeetingEventActorSchema`、`MeetingEventViewSchema`；`MeetingEventViewSchema` 是以 `kind` 为 discriminator 的 31 分支 union，每个分支同时固定第 5 节表中的 `subject.kind` 和对应 data schema，不能只校验 generic object ref。`MeetingViewSchema` 增加 `timelineEvents: z.array(MeetingEventViewSchema).optional()`。`MeetingEventKindSchema` 固定为 `z.enum(MEETING_EVENT_KINDS)`，不用 `z.string()`。Protocol 不导入 Domain；`plugin/tests/contract/meeting-identity-view.spec.ts` 必须逐项断言 Domain tuple 与 Protocol schema 接受的 kind 集合完全相等、无重复并与 Meeting Interface 的 31 个键一致，任一侧增删都会使测试失败。不得新增 shared/contracts 模块或放宽 module-boundary lint。

映射固定为：`eventSeq ← persisted.eventSeq`，`meetingVersion ← persisted.meetingVersion`，`kind ← persisted.type`，`occurredAt ← persisted.createdAt`，其它字段包括 `data` 从 validated payload 复制。public DTO 不含 `logVersion`、turnId、attemptId。

### 4.3 完整性与兼容

- 新 Meeting 的 seq 1 必须为 `meeting.created` 且 payload.logVersion=1、actor=`{kind:"captain",actorId:captainActorIdFor(meetingId)}`、subject=`{kind:"meeting",id:meetingId}`、relatedObjects=`[]`、data=`{}`。
- `readCommittedEvents()` 若 seq 1 无 `logVersion:1`，返回 `{kind:"legacy"}`；此时不解析后续 event payload。
- 有完整标记时必须验证 seq 从 1 连续到 `nextEventSeq-1`、type 属于 union、payload strict 合法；否则抛 `RepositoryError("RECOVERY_UNAVAILABLE", false, meetingId, ...)`，不得重试或返回部分事件。
- `projectMeetingView` 只在 captain caller 且事件读取结果为 complete 时包含数组；legacy 与 identity caller 都省略字段。完整日志当前无需逐对象过滤，因为唯一消费者是可信 local controller；不得称其为 caller-filtered event log。
- Client 判别使用 `view.timelineEvents === undefined`，不能用 length；空数组不触发 fallback。

## 5. command → occurrence event 映射

`buildMeetingEvents` 输入 accepted action、可信 scope、提交前后 state、transition、meetingId 与同一个 application `now`，输出有序 `MeetingEventInput[]`。actor 优先级固定为 runtime → system、captain → captain、其余具有 `scope.identityId` → identity。若 lifecycle 变化，先输出 `meeting.lifecycle_changed`，再输出对象 occurrence；`publish_round` 输出一条 `round.published`，再按 FormalMessage `seq` 为每条新消息输出 `formal_message.published`。`pause_meeting`/`resume_meeting` 只有 lifecycle event；未完成归档且只更新内部 ownership 的 `record_archive_session_result` 输出 `[]`。

其它 command 与 occurrence kind 固定映射为：`activate_agenda → agenda.activated`、`dispose_agenda_candidate → agenda_candidate.disposed`、`submit_manager_plan → manager_plan.recorded`、`open_round → round.opened`、`raise_hand → hand_raise.recorded`、`decline_hand|expire_round_participation → round.participation_recorded`、`dispose_hand_raise → hand_raise.disposed`、`submit_evidence → evidence.submitted`、`close_contribution → contribution.closed`、`record_contribution_failure → contribution.failed`、`claim_evidence_review → evidence_review.claimed`、`fail_evidence_validation → evidence_validation.failed`、`submit_evidence_review → evidence_review.submitted`、`record_review_delivery → review_delivery.recorded`、`abort_round → round.aborted`、`resolve_question → question.disposed`、`dispose_issue → issue.disposed`、`dispose_risk → risk.disposed`、`decide → decision.recorded`、`change_decision → decision.changed`、`record_completion_fact → completion_fact.recorded`、`change_completion_fact → completion_fact.changed`、`recommend_identity → identity.recommended`、`record_identity_admission_result → identity.admission_recorded`、`end_meeting → meeting.ended`、`start_archive → archive.started`、首次完成归档的 `record_archive_session_result → archive.completed`。创建固定为 `meeting.created`。

下表逐 occurrence 固定 trigger、主对象、typed relations 与 `data` 来源；relations 按表中顺序生成且去重，不能把 `transition.relatedIds` 整体无类型复制。`before`/`after` 分别是提交前 state 与 accepted transition state。表中指定对象或 data 无法唯一解析时抛 `TransitionRejected("INVALID_STATE",...)` 并使整个 command 不提交。

| occurrence kind                | trigger                                                             | subject                                           | ordered relatedObjects                                                                                                                                                 | `data` 的唯一来源                                                                                      |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `meeting.created`              | create                                                              | meeting / meetingId                               | `[]`                                                                                                                                                                   | `{}`                                                                                                   |
| `meeting.lifecycle_changed`    | 任一 command 且 `before.lifecycle.status!==after.lifecycle.status`  | meeting / meetingId                               | `[]`                                                                                                                                                                   | `from=before.lifecycle.status`、`to=after.lifecycle.status`、`reason=after.lifecycle.reason`（存在时） |
| `agenda.activated`             | `activate_agenda`                                                   | agenda / action.agendaId                          | agenda / `before` active agenda ID                                                                                                                                     | action.previousDisposition、action.reason                                                              |
| `agenda_candidate.disposed`    | `dispose_agenda_candidate`                                          | agenda_candidate / action.candidateId             | promoted 时 agenda / action.promotedAgenda.id，否则 `[]`                                                                                                               | action.disposition、action.reason                                                                      |
| `manager_plan.recorded`        | `submit_manager_plan`                                               | manager_plan / `transition.relatedIds[1]`         | agenda / action.agendaId；存在时 manager_plan / `transition.relatedIds[3]`                                                                                             | after 中 subject plan 的 kind/rationale/blockingReason                                                 |
| `round.opened`                 | `open_round`                                                        | round / `transition.relatedIds[0]`                | agenda / after round.agendaId；manager_plan / after round.planId                                                                                                       | after round.deadlineAt（存在时）                                                                       |
| `round.participation_recorded` | `decline_hand`、`expire_round_participation`                        | round / action.roundId                            | identity / contributorId                                                                                                                                               | contributorId；status=`declined` 或 `no_response`；action.reason（存在时）                             |
| `hand_raise.recorded`          | `raise_hand`                                                        | round / action.roundId                            | identity / scope.identityId                                                                                                                                            | contributorId=scope.identityId、action.purpose                                                         |
| `hand_raise.disposed`          | `dispose_hand_raise`                                                | round / action.roundId                            | identity / action.contributorId；accepted 时 contribution / `transition.relatedIds[1]`                                                                                 | contributorId、action.disposition、action.reason、accepted 时 contributionId                           |
| `evidence.submitted`           | `submit_evidence`                                                   | evidence_version / `transition.relatedIds[1]`     | contribution / action.contributionId；round / owning contribution.roundId                                                                                              | after subject version.summary                                                                          |
| `contribution.closed`          | `close_contribution`                                                | contribution / action.contributionId              | round / owning contribution.roundId                                                                                                                                    | action.exit、action.reason                                                                             |
| `contribution.failed`          | `record_contribution_failure`                                       | contribution / action.contributionId              | round / owning contribution.roundId                                                                                                                                    | after contribution.failure 去除 occurredAt 后的六个字段                                                |
| `evidence_review.claimed`      | `claim_evidence_review`                                             | evidence_version / action.versionId               | round / action.roundId                                                                                                                                                 | claimId=after.reviewClaims 中 id=transition.relatedIds[0] 且 roundId/versionId/sourceEffectId 与 action 一致的唯一 claim.id；action.sourceEffectId                                                                  |
| `evidence_validation.failed`   | `fail_evidence_validation`                                          | evidence_version / before claim.versionId         | round / action.roundId                                                                                                                                                 | action.claimId、action.reason                                                                          |
| `evidence_review.submitted`    | `submit_evidence_review`                                            | evidence_review / `transition.relatedIds[0]`      | evidence_version / action.versionId；round / action.roundId                                                                                                            | action.claimId、after subject review.scope                                                             |
| `review_delivery.recorded`     | `record_review_delivery`                                            | review_delivery / `transition.relatedIds[0]`      | evidence_review / action.reviewId；round / review→version→package.roundId                                                                                              | action.status；failed 时 action.failureReason                                                          |
| `round.published`              | `publish_round`                                                     | publication / `transition.relatedIds[0]`          | round / action.roundId；after publication.finalVersionIds 的 evidence_version；本次新增 messages 的 formal_message（按 message.seq）                                   | `{}`                                                                                                   |
| `formal_message.published`     | `publish_round`，每个本次新增 message 一条                          | formal_message / message.id                       | publication / message.publicationId；round / action.roundId；message.relatedIds 中的 evidence_version 与 evidence_review                                               | message.kind                                                                                           |
| `round.aborted`                | `abort_round`                                                       | round / action.roundId                            | `transition.relatedIds[1..]` 中能够在 before/after 唯一解析的 contribution                                                                                             | action.reason                                                                                          |
| `identity.recommended`         | `recommend_identity`                                                | identity_recommendation / recommendation.id       | agenda / action.agendaId；recommendation.identityId 存在时 identity / 该 ID                                                                                            | after recommendation 的 decision/status/rationale                                                      |
| `identity.admission_recorded`  | `record_identity_admission_result`                                  | identity_recommendation / action.recommendationId | after recommendation.status=`active` 时 identity / recommendation.identityId，否则 `[]`                                                                                | active 为 `{status:"active"}`；failed 为 `{status:"failed",failureCode}`                               |
| `question.disposed`            | `resolve_question`                                                  | question / action.questionId                      | agenda / before question.agendaId；action.evidenceIds 的 evidence_version                                                                                              | action.status、action.rationale                                                                        |
| `issue.disposed`               | `dispose_issue`                                                     | issue / action.issueId                            | agenda / before issue.agendaId；action.evidenceIds 的 evidence_version                                                                                                 | action.status、action.rationale                                                                        |
| `risk.disposed`                | `dispose_risk`                                                      | risk_disposition / `transition.relatedIds[0]`     | issue / action.issueId；action.evidenceIds 的 evidence_version                                                                                                         | action.action、action.scope、action.rationale                                                          |
| `decision.recorded`            | `decide`                                                            | decision / `transition.relatedIds[0]`             | after decision.evidenceIds 的 evidence_version                                                                                                                         | `{status:"accepted"}`                                                                                  |
| `decision.changed`             | `change_decision`                                                   | decision / action.decisionId                      | superseded 时 decision / `transition.relatedIds[1]`；action.evidenceIds 的 evidence_version                                                                            | action.status、action.rationale；superseded 时 replacementDecisionId                                   |
| `completion_fact.recorded`     | `record_completion_fact`                                            | completion_fact / `transition.relatedIds[0]`      | action.evidenceIds 的 evidence_version；action.decisionIds 的 decision                                                                                                 | action.outputId、action.statement、action.rationale                                                    |
| `completion_fact.changed`      | `change_completion_fact`                                            | completion_fact / action.factId                   | superseded 时 completion_fact / `transition.relatedIds[1]`，并加入 replacement.evidenceIds 的 evidence_version 与 replacement.decisionIds 的 decision；revoked 时 `[]` | action.status、action.rationale；superseded 时 replacementFactId                                       |
| `meeting.ended`                | `end_meeting`                                                       | termination / after.termination.id                | after termination 的 decisionIds、completionFactIds、unresolvedQuestionIds、unresolvedIssueIds、unclosedContributionIds 分别转成 typed refs                            | after termination.outcome/reason                                                                       |
| `archive.started`              | `start_archive`                                                     | archive / after.archive.id                        | termination / after.termination.id                                                                                                                                     | `{status:"complete"}`                                                                                  |
| `archive.completed`            | 首次使 lifecycle 进入 `archived` 的 `record_archive_session_result` | archive / after.archive.id                        | `[]`                                                                                                                                                                   | `{status:"complete"}`                                                                                  |

`pause_meeting`/`resume_meeting` 只产生 lifecycle event。未完成归档且只更新内部 ownership 的 `record_archive_session_result` 输出 `[]`。构造 typed relation 时只允许使用上表指定的 action、transition、before 与 after 来源；同一 ID 匹配多个 kind、找不到必需对象、无法确定 occurrence data 或需要根据文本/时间猜测时 STOP，不得降级成无类型 ID。一个 accepted command 可以生成零条、一条或多条事件，测试不得把“一次 command 一条 event”写成不变量。

## 6. 调用链与不变量

```text
MeetingAction + trusted scope + Clock.now
  -> runCommandTransition
  -> buildMeetingEvents(action, scope, beforeState, transition, meetingId, now)
  -> RepositoryCommand.transition.events
  -> appendEvents + appendFacts + appendOutbox + appendReceipt (one atomic commit)
  -> readCommittedEvents
  -> captain projectMeetingView(snapshot, caller, undefined, events)
  -> MeetingView.timelineEvents
  -> buildTimelineNodesFromEvents
  -> groupTimelineMilestones
  -> Timeline UI
```

不可违反：

1. receipt replay 返回原 `eventSeqs`，不追加事件；version conflict、reject 和 storage failure 为零事件。
2. event input 的 occurredAt、持久记录的 createdAt 与 fact.occurredAt 使用同一个 command `now`；meetingVersion 等于新 snapshot version。
3. event 日志 append-only；无 update/delete/consume API。
4. payload 只含 kind-specific 最小不可变 occurrence data，不复制完整领域对象或 private data；当前 DTO 只能补充展示，不能覆盖历史 data。
5. event log 不知道 milestone；Client milestone 不反向修改 event、fact 或 Archive。
6. legacy 与 complete 两种来源互斥。

## 7. 机械执行步骤

### T3：为 accepted command 生成基础事件

前置状态：T2 PASS。

允许修改：

- `plugin/src/runtime/application-service/meeting-event.ts`（新增）
- `plugin/src/runtime/application-service/meeting-command.ts`
- `plugin/src/runtime/application-service/index.ts`
- `plugin/tests/unit/runtime/meeting-event.spec.ts`（新增）
- `plugin/tests/unit/runtime/meeting-command-application.spec.ts`（新增）

禁止修改：Domain transition、action schema、authorization、fact payload、outbox planning。

执行：

1. 新增 `buildMeetingEvents(input): readonly MeetingEventInput[]`；输入固定为 action、scope、beforeState、transition、meetingId、now，按第 5 节和 Meeting Interface data 契约映射。
2. `createRepositoryCommand` 在 transition accepted 后调用一次，用返回数组替换固定 `events: []`；同一次 commit 的 lifecycle event 排在对象 occurrence 前，publication 后按 message seq 排列。
3. 单测逐个覆盖第 5 节所有 action；至少断言 captain/identity/system actor、typed relation、immutable data、publish 多事件、lifecycle + occurrence 同时存在、archive no-op、无 milestone key。
4. application contract 断言 accepted commit 为 `0..n` events、全部 event 与 fact 共用 now/version，replay/reject/version conflict 零新增事件。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-event.spec.ts tests/unit/runtime/meeting-command-application.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin lint
```

PASS：退出 0；action union 的 `never` exhaustive check 编译通过，新增 action 未映射会使 typecheck 失败；所有 Meeting event 都显式传 occurredAt。

STOP：表中 action 无法从现有 action/transition/state 唯一取得 subject；报告该 action 和实际 transition，不猜测。

### T4：只向 local controller 投影完整事件

前置状态：T3 PASS。

允许修改：

- `plugin/src/projection/meeting-view.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/src/runtime/services/meeting-identity-read.ts`
- `plugin/tests/contract/meeting-identity-view.spec.ts`
- `plugin/tests/contract/meeting-timeline-events-view.spec.ts`（新增）

禁止修改：Remote methods、identity authorization、Meeting state filtering。

执行：

1. 把 `projectMeetingView` 第四参数固定为 optional complete events；captain 才投影 `timelineEvents`，identity 强制缺席。
2. `meeting-lifecycle.ts` captain read 在 repository recovery 后调用 `readCommittedEvents`；complete 传 events，legacy 传 undefined。
3. Host mapper 完整复制 validated safe events；因为当前只向 captain 返回，且 payload 只允许 Meeting Interface `MeetingEventDataByKind` 的最小不可变文本并禁止完整对象、PrivateMail、Session、capability、凭据和隐藏推理，所以不做对象存在性过滤。普通 identity 必须整体缺席，不能留下 redacted placeholder；文档和代码不得把当前结果误称为 caller-filtered event log。
4. identity reader 保持不读 event port，并显式传 undefined。
5. 测试 complete captain 顺序、legacy 缺席、identity 缺席、payload 无 private 字段、损坏日志读取失败。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-identity-view.spec.ts tests/contract/meeting-timeline-events-view.spec.ts --project contract
pnpm --dir plugin typecheck:host
```

PASS：退出 0；captain public event 不含 logVersion/turnId/attemptId/private content。

STOP：事件 payload 出现未被 `MeetingEventDataByKind` 列出的完整正文或完整对象、PrivateMail、Session、capability、凭据、隐藏推理或其它非 4.1 字段；契约明确允许的 summary/statement/rationale/reason/scope/失败摘要不触发本 STOP。

### T5：实现 event-first Client projection 与 milestone 分组

前置状态：T4 PASS。

允许修改：

- `plugin/src/client/meeting/regions/workspace/timeline/projection.ts`
- `plugin/src/client/meeting/regions/workspace/timeline/index.ts`
- `plugin/src/client/meeting/regions/workspace/timeline/timeline.tsx`
- `plugin/src/client/meeting/regions/workspace/timeline/timeline.module.css`
- `plugin/src/client/meeting/shared/locales.ts`
- `plugin/tests/client/meeting/meeting-timeline-fixtures.ts`
- `plugin/tests/client/meeting/meeting-timeline-projection.client.spec.ts`
- `plugin/tests/client/meeting/meeting-panel-timeline-focus.client.spec.tsx`

禁止修改：overview、navigator、Remote、Host projection。

执行：

1. 将原 `buildTimelineNodes` 内容原样移动为 `buildTimelineNodesFromLegacyView`；不得改变 legacy fixtures 的节点集合和排序。
2. 新增 `buildTimelineNodesFromEvents`，一条 event 生成一条 node，key=`event:${eventSeq}`，time=occurredAt；正文先使用 immutable event data，再从当前可见 subject 对象补充详情。
3. `buildTimelineNodes` 以 `timelineEvents === undefined` 唯一选择 legacy，否则选择 event path。
4. 新增 `TimelineMilestoneGroup` 和 `groupTimelineMilestones(nodes)`，先对完整 event nodes 按 eventSeq 单向扫描，严格实现 DSH Plugin Design 的固定 key、实例状态、边界 event 唯一归组、空组抑制、重复 occurrence 和分组表；group 仅含 Client 字段。
5. 分组完成后才应用过程详情与显式筛选；筛选不得重算 key/occurrence/status/time，筛选后无可见节点的组不渲染。UI 按 group，再按 `time → eventSeq` 渲染；关键事件默认显示，`round.opened` 固定左侧。补齐 zh/en 文案且 key 集合相同。
6. 测试事件顺序、同时间 seq、每事件只进一组、进入/重复进入/离开 converging、无 completion 时关闭、有 completion 时关闭、paused blocked、meeting.ended 按 outcome 关闭遗留活动阶段、空内部实例不渲染、筛选不改变组状态、round relation、other fallback、重复阶段实例、legacy 互斥、关键异常不隐藏、DOM/键盘顺序、focus key。

验证：

```bash
pnpm --dir plugin exec vitest run tests/client/meeting/meeting-timeline-projection.client.spec.ts tests/client/meeting/meeting-panel-timeline-focus.client.spec.tsx --project client
pnpm --dir plugin typecheck:client
```

PASS：退出 0；测试证明 event fixture 中无 milestone 字段，group 结果中无持久化字段。

STOP：渲染某 event 必须读取 caller-filtered view 中不存在的正文；显示中性类型/ID，不允许扩大 Host 可见性，若产品文案无法确定则 STOP。

### T6：全量静态与自动验证

前置状态：T5 PASS。

允许修改：无。

禁止修改：全仓库。

执行：只运行固定门禁并保存输出；本步骤不修复任何失败，也不运行会改写文件的格式化命令。

验证：

```bash
pnpm verify
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：三条命令全部退出 0，且 `git status --short` 与进入 T6 时相比没有新增或改写文件。

STOP：任一命令退出非 0、门禁改写文件，或验证失败要求修改任何文件；报告失败命令、实际输出、被指向的文件及其所属 T1-T5 步骤，不在 T6 回修、放宽 lint/schema/test 或扩大 Non-goals。

### T7：人工 smoke、readiness 迁移与关闭准备

前置状态：T6 PASS；人工环境必须使用既有 `dsh-workspace/`，不得重建。

允许修改：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `docs/30-designs/RUNBOOK-MEETING-EVENT-LOG-TIMELINE.md`（只记录验证结果；关闭时删除）

禁止修改：正式 requirements/interfaces/designs、operations 命令；禁止直接编辑、替换、清空或重建 `dsh-workspace/` 的安装与 SQLite 文件。只允许固定的 `meeting-business-loop` smoke 通过 Repository 正常提交路径向现有人工 SQLite 新增本步骤 Meeting；不得删除或改写既有 Meeting。

执行：

1. 从仓库根设置 `web_ui_workspace="$PWD/dsh-workspace"`、`web_ui_root="$web_ui_workspace/web-ui/convivium-user"`、`web_ui_home="$web_ui_workspace/dsh-home"`、`web_ui_project="$web_ui_workspace/projects/meetings-view"`；验证四者存在、`$web_ui_root/dev.env` 非空、`$web_ui_root/convivium-storage.sqlite` 是普通文件且 31828 没有监听进程。运行 `CONVIVIUM_INSTALL_ROOT="$web_ui_root" ./scripts/install-from-source.sh --workspace "$web_ui_workspace" --dev-refresh`，再次验证同一 SQLite 仍为普通文件且 dev.env 仍非空；不得读取或输出其中的 key。任一检查失败即 STOP，不创建替代环境。
2. 在 Host 停止时运行唯一 seed 命令：`CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop CONVIVIUM_SMOKE_STORAGE_PATH="$web_ui_root/convivium-storage.sqlite" pnpm --dir plugin smoke:profile --json`。要求退出 0、`storagePersistence="PRESERVED"`、scenario=`meeting-business-loop`、4 rounds、8 evidence versions、8 reviews、4 publications、status=`archived`；记录输出中的 `meetingId`，后续只验收该 Meeting。
3. 运行 `"$web_ui_root/start.sh"`，在 DSH Web 选择 `web_ui_project`，打开步骤 2 的 meetingId。时间线必须包含一个 meeting-start、四个按 round ID 分开的 round group、一个包含四条 `manager_plan.recorded` 且由 outcome=`partial` 的 `meeting.ended` 关闭为 aborted 的 convergence group，以及一个 closure；按 reducer 归入 other 的 lifecycle/Agenda 状态事件可以形成一个 other group。每个 round 恰有 1 个 `round.opened`、2 个 `evidence.submitted`、2 个 `evidence_review.claimed`、2 个 `evidence_review.submitted`、2 个 status=`sent` 的 `review_delivery.recorded`、1 个 `round.published`、2 个 `formal_message.published`，closure 恰有 `meeting.ended`、`archive.started`、`archive.completed`。同一事件不得出现在两个 group。
4. 默认视图确认 `round.opened`、证据、审核、publication、结束和归档等关键事件可见；打开“显示过程细节”后 claims、正常 delivery 和 formal messages 出现，关闭后只隐藏过程事件且各 group 的 occurrence/status/time 不变。对 event kind 做显式筛选时 group 元数据不变，空组不渲染。刷新页面后重复上述计数，顺序仍为 `occurredAt → eventSeq`。
5. 将 Meetings 摘要按 `meetingId` 字典序扫描并读取，选择第一个 `timelineEvents===undefined` 的既有 Meeting 作为唯一 legacy fixture，记录 meetingId；若不存在即 STOP 并报告“缺少 legacy fixture”，不得伪造或回写一个。打开该 Meeting 的时间线，浏览器 DOM 中 `[data-node-key^="event:"]` 数量必须为 0，且至少存在一个不以 `event:` 开头的 legacy `data-node-key`。
6. 在运行 `start.sh` 的终端发送 Ctrl-C，等待 `test -z "$(lsof -nP -iTCP:31828 -sTCP:LISTEN)"` 成立，再次运行 `"$web_ui_root/start.sh"`。重开步骤 2 和步骤 5 的 meetingId，重复事件计数与 legacy 断言；不得出现重复、缺失、顺序变化或旧 Meeting 改写。
7. 停止 Host并确认端口释放；保留固定 workspace、SQLite 与 smoke Meeting。在 readiness 记录 seed 命令、两个 meetingId、日期、环境、逐项计数、刷新/冷重启结果与未覆盖边界；Browser automation 和跨 Host 仍为 Not Covered。
8. 再运行 `pnpm verify`、doc links、`git diff --check`。

验证：

```bash
pnpm verify
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：seed 与自动门禁退出 0，步骤 3-6 的固定计数和重启断言全部满足，readiness 明确区分 smoke 自动证据、人工 Browser 证据和 Not Covered。

STOP：固定路径/SQLite/端口前置不满足、seed 结果不符合精确计数、没有 legacy fixture、人工 workspace 无法启动、旧数据变为不可读、新事件重复、筛选改变 group 状态、刷新/重启丢失或出现 caller 泄露；保留 RUNBOOK、SQLite 和日志，不清库重试。

## 8. 验证矩阵

| 风险                   | 固定证据                             | 预期                                                                  |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| 正常提交               | T2/T3 repository + application tests | 一次 commit 的 0..n events 均有连续 seq、同 version/time 和正确 actor |
| reject/conflict/replay | T2/T3 tests                          | 事件数不变，receipt replay 返回原 seq                                 |
| 原子性                 | repository contract + `pnpm verify`  | snapshot/fact/event/outbox/receipt 无半提交                           |
| cold reopen            | T2 test + T7 manual                  | 顺序与 payload 不变                                                   |
| legacy                 | T2/T4/T5 + T7                        | field 缺席，纯 DTO fallback，不回填                                   |
| caller filtering       | T4 tests                             | identity 不含 timelineEvents，隐藏对象不泄露                          |
| milestone 隔离         | T1/T3/T5 tests                       | event schema 拒绝展示字段，group 只存在 Client                        |
| UI 可访问性            | T5 client tests + T7                 | DOM/键盘按展示顺序，角色非颜色唯一表达                                |
| DSH/runtime            | T6/T7                                | build/contract/package 通过，真实 Web 刷新与重启稳定                  |

## 9. 完成定义与删除

仅当 T0-T7 全部 PASS，才可关闭：

1. `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 已记录真实证据与 Not Covered。
2. 本 RUNBOOK 中的长期结论已经分别存在于 requirements、Meeting Interface、Meeting Design 与 DSH Plugin Design；不得把新结论只留在 RUNBOOK。
3. 运行 `rg -n 'RUNBOOK-MEETING-EVENT-LOG-TIMELINE|Meeting 基础事件日志与时间线投影' .`，确认除本文件外无仅用于指向它的引用。
4. 删除本 RUNBOOK，再运行：

```bash
node .github/scripts/check-doc-links.mjs
git diff --check
```

5. 任一条件不满足则保留本文件，状态保持 `Executable`，不得改成 completed/archive。

## 10. Author Audit

结论：`Executable`。

- 正式行为、数据结构、owner、兼容策略、action 映射、文件/symbol、验证与 STOP 已固定。
- event 与 milestone、fact、outbox、legacy projection 的职责互斥。
- 未授权的迁移、通用抽象、额外事件源和相邻产品能力均列入 Non-goals。
- 单步允许修改文件数已经逐项核对：T0=0、T1=8、T2=6、T3=5、T4=5、T5=8、T6=0、T7=2；不存在超过 10 个文件的步骤或跨步骤通配修改范围。
- 作者验证：`node .github/scripts/check-doc-links.mjs` PASS（1130 个本地链接，0 error）；`git diff --check` PASS；五份目标文档的 Prettier check PASS；静态契约核对确认 31 个 event kind 唯一，RUNBOOK 与 Meeting Interface 的 data mapping 键集合及顺序一致。
- 作者 baseline：T0 的三份 focused test 共 29 tests PASS；Vite 报告 DSH UI primitives 缺少 `index.js.map` 的非阻断 warning，测试退出码仍为 0。
- 未运行：`pnpm verify`、新增事件测试、真实人工 Web smoke；这些属于执行 T1-T7 后的门禁，当前结论不把它们描述为通过。
