# Meetings View 概览与时间线实施 RUNBOOK

## 状态、边界与执行者契约

- 状态：`Executable`
- 建立日期：2026-09-23
- 基线：执行分支 `codex/web-ui-optimization`，`417ad45` 必须是当前 `HEAD` 的 ancestor；执行开始时工作树必须干净。
- 边界：在唯一 `convivium-meetings` View 内重构已有数据的展示，只保留已接通的 pause/resume/end 写入。

执行者必须从 T0 开始按序执行，前一步 PASS 前不进入后一步。只修改每步“允许修改”列出的文件和 symbol。指定路径、symbol、Schema 或命令不存在，基线失败，需越出 Scope，或需放宽 Schema/类型/断言时必须 STOP。PASS 要求命令退出码为 0 且指定断言全部成立。STOP 报告必须包含最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、实际输出和所需人工决定。保留用户已有改动；未获明确授权时不 commit、push、创建 PR 或合并。

## 目标、断点、Scope 与 Non-goals

```text
mount -> list -> user selects -> read caller-filtered MeetingView
      -> shared Header + overview/timeline
      -> overview renders existing facts read-only
      -> timeline builds disposable client nodes and five swimlanes
      -> pause/resume/end reuses MeetingClient.control
      -> refresh/reconnect performs full list/read; failures retain last-good and disable writes
```

当前断点：`runtime.list` 会静默跳过空 snapshot；`meeting-panel.tsx` 不清除已消失 ID，无 mode/timeline/freshness 状态；layout 无 Navigator/Workspace/tabs/drawer；sections 只展示少量摘要；无 Timeline projection/泳道/筛选/键盘/定位；新 i18n/time/a11y 未实现。

Scope：修复 list 完整性；建立唯一 Workspace/freshness state；实现侧栏/drawer、Header/tabs、七组只读 Overview、活动/Archive 五泳道 Timeline、筛选/缩放/滚动/折叠/回到最新/定位、a11y、`zh`/`en`、last-good，完成自动验证和真实 DSH Web 人工门禁。

Non-goals：不增加 Contribution/Decision/Risk 写入面；不改 `MeetingCommandSchema`、`AllowedControlSchema`、Domain transitions 或 pause/resume/end payload；不恢复 HTTP，不增 route/Web user/Team authority/跨 Host/轮询；不增领域数据、持久化 Timeline、event/ID、因果箭头、全文搜索、独立 Timeline View 或多 Panel；不从无 target kind 的 `relatedIds` 猜测；不增 npm dependency、router、store、CSS/chart/timeline/date library。

## 真相源与追踪

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：MO-FR-11.2–11.10、MO-FR-16、MO-FR-17、Acceptance 52–59。
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)：`MeetingSummary`、`MeetingView`、`ArchiveView`、Remote `list/read/control/subscribeRefresh`。
- [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md)：Workspace、Overview、Timeline projection、responsive/failure handling。
- [Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Test Rules](../00-governance/TEST-RULES.md)。
- [Install And Run](../50-operations/HOW-TO-INSTALL-AND-RUN.md)：真实 DSH Web 人工门禁入口。

```text
requirement -> MeetingView/ArchiveView -> DSH Plugin Design
            -> controller/layout/overview/timeline -> focused tests
            -> plugin verify -> human Web gate -> readiness
```

## 精确 Client 状态与转换

```ts
// plugin/src/client/meeting-workspace-state.ts
export type MeetingMode = "overview" | "timeline";
export type TimelineLane = "captain" | "manager" | "contributor" | "reviewer" | "system";
export type TimelineZoom = 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;
export type DataFreshness = "idle" | "loading" | "fresh" | "stale";
export type ConnectionState = "connecting" | "connected" | "disconnected";
export interface TimelineObjectRef { objectKind: string; objectId: string }
export interface MeetingFocusTarget { meetingId: string; objectKind: string; objectId: string }
export interface TimelineFilterState {
  identityIds: readonly string[]; objectKinds: readonly string[];
  statuses: readonly string[]; relatedObjects: readonly TimelineObjectRef[];
  zoom: TimelineZoom; collapsedLanes: readonly TimelineLane[];
}
export interface MeetingsWorkspaceState {
  selectedMeetingId?: string; activeMode: MeetingMode; focusTarget?: MeetingFocusTarget;
  timeline: TimelineFilterState; viewportRevision: number;
}
export interface MeetingsFreshnessState {
  connection: ConnectionState; list: DataFreshness; detail: DataFreshness;
}
export const INITIAL_TIMELINE_FILTERS: TimelineFilterState;
export const INITIAL_WORKSPACE: MeetingsWorkspaceState;
export const INITIAL_FRESHNESS: MeetingsFreshnessState;
export function resetWorkspaceForMeeting(meetingId: string, previousRevision: number): MeetingsWorkspaceState;
export function controlsEnabled(input: {
  freshness: MeetingsFreshnessState; selectedMeetingId?: string; writePending: boolean;
}): boolean;
```

`INITIAL_TIMELINE_FILTERS` 的四个 filter 数组为空，`zoom=1`，`collapsedLanes=[]`。`INITIAL_WORKSPACE` 为 overview/无选择/无 focus/revision 0。`INITIAL_FRESHNESS` 为 connecting/loading/idle。`resetWorkspaceForMeeting` 设新 ID、overview、无 focus、初始 filters、`viewportRevision=previousRevision+1`；Timeline 组件监听 revision 并将 scroll 归零。

`controlsEnabled` 的唯一公式是：`connection === "connected" && list === "fresh" && detail === "fresh" && selectedMeetingId !== undefined && !writePending`。无选择时 detail 必须是 `idle`；此时无 control。

转换固定为：

| 输入 | list | detail | connection | 其他 |
| --- | --- | --- | --- | --- |
| mount | loading | idle | connecting | 只调 list，建立一个 reconnecting RemoteStream |
| initial list success/no selection | fresh | idle | connected | 原子替换 summaries |
| non-recovery list success/selection exists | fresh | 保持 | 保持 | 不改 mode/viewport |
| non-recovery list success/selection missing | fresh | idle | 保持 | 清选择/detail/focus，不改选 |
| list failure | stale | 保持 | 保持 | 保留 last-good summaries |
| select different ID | 保持 | loading | 保持 | reset workspace 并清除旧 ID detail，不把旧详情当作新 ID last-good |
| detail success/current ID | 保持 | fresh | 保持 | 替换当前 ID last-good detail |
| detail failure/current ID | 保持 | stale | 保持 | 保留 ID 和该 ID last-good，无则显错误 |
| stale ID read settles | 不变 | 不变 | 不变 | 丢弃 success/failure |
| carrierFailed | stale | selected ? stale : idle | disconnected | 保留 last-good；carrier retry 由 RemoteStream supervisor 管理 |
| terminal stream failure | stale | selected ? stale : idle | disconnected | 设 `streamTerminalRef=true`；该挂载周期不再恢复 connected，重新挂载才建新 stream |
| generationReopened | loading | selected ? loading : idle | disconnected | 开始 recovery generation，并发一次 list + captured selected detail |
| recovery list 缺 captured ID | fresh | idle | connected | 原子清选择/detail/focus；丢弃该 ID detail 结果 |
| recovery 所需 reads 全成功 | fresh | selected ? fresh : idle | connected | 同一 generation 原子提交 list/detail，才解除 disconnected |
| recovery list 失败/detail 成功 | stale | fresh | disconnected | 保留 list last-good，更新当前 detail last-good |
| recovery list 成功且 ID 存在/detail 失败 | fresh | stale | disconnected | 替换 summaries，保留当前 detail last-good |
| recovery list/detail 都失败 | stale | selected ? stale : idle | disconnected | 保留全部 last-good |
| refresh notice while connected | loading | selected ? loading : idle | connected | accept 后开始 non-recovery generation，一次 list + captured selected detail |
| refresh notice while disconnected | loading | selected ? loading : idle | disconnected | accept 后以 recovery=true 开始新 generation，取代旧 recovery |
| Browser focus | loading | selected ? loading : idle | 保持 | `streamTerminalRef=false` 且 connection 非 connected 时 recovery=true；terminal 时只补读展示且保持 disconnected |

每次 full refresh 使用递增 `refreshGenerationRef`，开始时捕获 `selectedMeetingId`。list 与所需 detail 通过同一个 `Promise.allSettled` 收集；generation 已过期或选择已改变时整批丢弃。recovery generation 只有在 `streamTerminalRef=false` 且 list 成功、captured ID 仍存在时 detail 也成功，或 list 成功且 captured ID 已消失时，才把 `connection` 设为 `connected`。RemoteStream 本身按 DSH Gateway 契约跨 carrier generation 自动重开；`MeetingClient` 在第一次 open 后的每次 physical generation open 调用 `generationReopened`，第一次 open 不调用。Client 不新建定时器或第二个 stream。

```ts
// plugin/src/client/meeting-client.ts
export interface MeetingRefreshCallbacks {
  carrierFailed(): void;
  generationReopened(): void;
}
export interface MeetingClient {
  list(signal?: AbortSignal): Promise<MeetingListResult>;
  read(request: ReadMeetingRequest, signal?: AbortSignal): Promise<MeetingReadResult>;
  control(command: MeetingCommand, signal?: AbortSignal): Promise<MeetingCommandResult>;
  subscribeRefresh(callbacks: MeetingRefreshCallbacks): RemoteStream<RefreshNotice>;
}
```

`createMeetingClient.subscribeRefresh` 在该 logical stream 的 closure 内维护 `opened=false`。`RemoteStreamOptions.open` 第一次调用只设 `opened=true`；以后每次调用先同步执行 `callbacks.generationReopened()`，再返回 `service.subscribeRefresh(signal)`。`RemoteStreamOptions.carrierFailed` 只调用 `callbacks.carrierFailed()`。这只是 Client 对既有 transport generation 的观察，不改变 Remote `subscribeRefresh`、`RefreshNotice` 或领域事实。

## 精确组件、Overview 和 Locale symbol

以下 props 是 T12 完成后的最终签名。T8–T9 的临时 `OverviewProps` 精确为 `SectionProps`；T10–T11 的临时 `TimelineProps`/`TimelineViewportProps` 从下方最终接口中删去 `focusTarget|onFocusConsumed|onLocateInOverview` 三项，其余字段不变。T12 只把这些临时 props 扩为最终签名并接入定位，不得提前实现定位行为。

```ts
// plugin/src/client/meeting-panel-overview.tsx
export interface SectionProps {
  detail: MeetingView; t: MeetingTranslate;
}
export interface OverviewProps extends SectionProps {
  focusTarget?: MeetingFocusTarget;
  onFocusConsumed(): void;
  onLocateInTimeline(target: MeetingFocusTarget): void;
}
export function MeetingPanelOverview(props: OverviewProps): ReactElement;
export function OverviewObjective(props: SectionProps): ReactElement;
export function OverviewProgress(props: SectionProps): ReactElement;
export function OverviewOutcomes(props: SectionProps): ReactElement;
export function OverviewOpenItems(props: SectionProps): ReactElement;
export function OverviewTranscript(props: SectionProps): ReactElement;
export function OverviewEvidence(props: SectionProps): ReactElement;
export function OverviewTechnical(props: SectionProps): ReactElement;
```

七个 renderer 依次拥有：Objective/Agenda/lifecycle/version；Round/Contribution/request/plan/recommendation/task/waiting reason；pending candidate/Decision/CompletionFact；Question/Issue/RiskDisposition；Publication/Message；EvidenceVersion/Review/Delivery；Task detail/meeting ID/object IDs。

```ts
// plugin/src/client/meeting-panel-timeline.tsx
export type TimelineDirection = "up" | "down" | "left" | "right";
export interface TimelineProps {
  detail: MeetingView; filters: TimelineFilterState; focusTarget?: MeetingFocusTarget;
  viewportRevision: number; t: MeetingTranslate;
  onFiltersChange(filters: TimelineFilterState): void;
  onFocusConsumed(): void;
  onLocateInOverview(target: MeetingFocusTarget): void;
}
export interface TimelineFiltersProps {
  nodes: readonly TimelineNode[]; filters: TimelineFilterState; t: MeetingTranslate;
  onChange(filters: TimelineFilterState): void;
}
export interface TimelineViewportProps {
  detail: MeetingView; nodes: readonly TimelineNode[]; filters: TimelineFilterState;
  focusTarget?: MeetingFocusTarget; viewportRevision: number; t: MeetingTranslate;
  onFiltersChange(filters: TimelineFilterState): void;
  onFocusConsumed(): void;
  onLocateInOverview(target: MeetingFocusTarget): void;
}
export interface AdjacentTimelineInput {
  nodes: readonly TimelineNode[]; currentKey: string; direction: TimelineDirection;
  collapsedLanes: readonly TimelineLane[];
}
export function MeetingPanelTimeline(props: TimelineProps): ReactElement;
export function TimelineFilters(props: TimelineFiltersProps): ReactElement;
export function TimelineViewport(props: TimelineViewportProps): ReactElement;
export function findAdjacentTimelineKey(input: AdjacentTimelineInput): string | undefined;
```

新增 locale key 使用以下封闭清单：

- shell：`panel.navigator.{title,current,open,close,empty,loading,stale}`、`panel.mode.{overview,timeline}`、`panel.header.{version,status}`、`panel.state.{stale,retrying,focusMissing,archiveUnavailable}`。
- Overview sections：`panel.overview.{objective,progress,outcomes,openItems,transcript,evidence,technical}`。
- Timeline：`panel.timeline.{title,disclaimer,empty,latest,zoomIn,zoomOut,collapse,expand}`，`panel.timeline.filter.{identity,type,status,related,clear}`，`panel.timeline.lane.{captain,manager,contributor,reviewer,system}`，`panel.timeline.aria.{node,viewport,drawer}`。
- object kinds：每个 `TimelineObjectKind` 必须有 `enum.timelineKind.<snake_case_kind>`。
- phases：`enum.timelinePhase.{changed,opened,aborted,requested,raised,submitted,created,sent,failed,published,started,completed,ended,resolve_question,dispose_issue}`。
- Overview 已知 enum 使用 `enum.<field>.<wire_value>`。除现有 lifecycle/round/archive key 外，本任务固定新增以下封闭集合：`agenda={pending,active,blocked,completed,deferred,closed}`、`contribution={preparing,registered,under_review,awaiting_response,withdrawn,submission_missing,timed_out,supplement_rejected,aborted,closed}`、`recommendation={provisioning,rejected,active,failed}`、`decisionOutcome={adopt,reject,defer}`、`decisionStatus={accepted,superseded,revoked}`、`completionStatus={active,superseded,revoked}`、`questionStatus={open,answered,withdrawn,deferred}`、`issueStatus={open,resolved,deferred,out_of_scope}`、`issueClassification={blocking,follow_up,pending_discussion,accepted_risk,out_of_scope}`、`riskAction={accept,reject}`、`reviewDelivery={sent,failed}`、`task={open,claimed,completed,cancelled,expired}`、`authorization={active,revoked,expired}`。每个值对应唯一 `enum.<group>.<wire_value>` key。测试必须断言 `Object.keys(zh) === Object.keys(en)` 并逐集合取到非空翻译。不得把未知 wire value 当 translation key；未知值直接显示原值。

## Timeline projection 精确映射

```ts
// plugin/src/client/meeting-timeline-projection.ts
export type TimelineObjectKind =
  | "lifecycle" | "round" | "opportunity_request" | "hand_raise"
  | "evidence_version" | "evidence_review" | "review_delivery" | "publication"
  | "formal_message" | "identity_recommendation" | "proposal_revision" | "position"
  | "decision_candidate" | "decision" | "completion_fact" | "risk_disposition"
  | "disposition_fact" | "manager_plan" | "task" | "termination" | "archive";
export interface TimelineNode {
  key: string; objectKind: TimelineObjectKind; objectId: string; phase: string; time: number;
  lane: TimelineLane; identityId?: string; status?: string;
  relatedObjects: readonly TimelineObjectRef[];
}
export interface TimelineNodeContent { title: string; detail?: string }
export function buildTimelineNodes(view: MeetingView): readonly TimelineNode[];
export function filterTimelineNodes(nodes: readonly TimelineNode[], filters: TimelineFilterState): readonly TimelineNode[];
export function resolveTimelineNodeContent(view: MeetingView, node: TimelineNode): TimelineNodeContent | undefined;
```

| kind | active source / archive source | objectId | time/phase | status | actor |
| --- | --- | --- | --- | --- | --- |
| lifecycle | `view.lifecycle` / none | `view.meetingId` | `changedAt/changed` | `status` | system |
| round | `view.rounds[]` / none | `id` | `openedAt/opened`,`abortedAt/aborted` | `status` | system |
| opportunity_request | `view.opportunityRequests[]` / none | `id` | `requestedAt/requested` | none | contributorId |
| hand_raise | `view.rounds[].pendingHandRaises[]` / none | `roundId:contributorId` | `raisedAt/raised` | none | contributorId |
| evidence_version | `view.evidencePackages[].currentVersion` / `archive.evidenceBundles[].version` | version `id` | `submittedAt/submitted` | none | package `authorId` / bundle `authorIdentityId` |
| evidence_review | `view.evidenceReviews[]` / `archive.evidenceBundles[].review` | `id` | `createdAt/created` | none | reviewerId |
| review_delivery | `view.reviewDeliveries[]` / none | `id` | `sentAt/sent` or `failedAt/failed` | `status` | system |
| publication | `view.publications[]` / `archive.publications[]` | `id` | `publishedAt/published` | none | system |
| formal_message | `view.messages[]` / `archive.messages[]` | `id` | `createdAt/created` | `kind` | actorId |
| identity_recommendation | `view.identityRecommendations ?? []` / none | `id` | `createdAt/created` | `status` | system |
| proposal_revision | none / `archive.proposalRevisions[]` | `id` | `createdAt/created` | none | actorId |
| position | none / `archive.positions[]` | `id` | `createdAt/created` | `stance` | actorId |
| decision_candidate | `view.outcomes.pendingDecisionCandidates ?? []` / `archive.decisionCandidates[]` | `id` | `createdAt/created` | `outcome` | actorId |
| decision | `view.outcomes.decisions[]` / `archive.decisions[]` | `id` | `createdAt/created` | `status` | actorId |
| completion_fact | `view.outcomes.completionFacts[]` / `archive.completionFacts[]` | `id` | `createdAt/created` | `status` | actorId |
| risk_disposition | `view.outcomes.riskDispositions[]` / `archive.riskDispositions[]` | `id` | `createdAt/created` | `action` | actorId |
| disposition_fact | none / `archive.questionIssueDispositionFacts[]` | `factId` | `occurredAt/kind` | `payload.newStatus` | actorId |
| manager_plan | `view.managerPlans[]` / none | `id` | `createdAt/created` | `status` | managerId |
| task | `view.tasks[]` / none | `id` | `startedAt/started`,`completedAt/completed` | `status` | system |
| termination | `view.outcomes.termination` / `archive.termination` | `id` | `endedAt/ended` | `outcome` | system |
| archive | none / `archive` | `id` | `createdAt/created` | `status` | system |

活动 Meeting 只用 active source。`lifecycle.status === "archived"` 时只有 `archive.status === "complete"` 才用 archive source，否则返回空 nodes。`key=${objectKind}:${objectId}:${phase}`。排序是 `time -> objectKind 上表顺序 -> objectId.localeCompare -> phase order`，phase 仅 `opened<aborted`、`started<completed`。

显式 contributor/manager/reviewer 字段直接决定 lane。`actorId` 只有一个角色时映射，0/多角色进 system。active 使用 `view.identities`，archive 使用 `archive.identityProvenance`。`assigneeId` 不是 actor。

typed relations 固定为：`roundId->round`、`publicationId|basedOnPublicationId->publication`、`reviewId|finalReviewIds->evidence_review`、`versionId|finalVersionIds|evidenceIds->evidence_version`、`proposalRevisionId->proposal_revision`、`positionIds->position`、`candidateId->decision_candidate`、`decisionIds->decision`、`issueId->issue`、`questionId->question`、`reassignedFromTaskId->task`。`relatedIds|sourceObjectIds|unresolvedItemIds` 忽略。Question/Issue 可作 filter ref 但不建 node。

`resolveTimelineNodeContent` 必须按上表同一 source path + objectId 反查；hand raise 按 composite ID，lifecycle/archive 按单例。`title/detail` 固定如下，不拼接额外领域解释：

| kind | title | detail |
| --- | --- | --- |
| lifecycle | `status` | `reason` |
| round | `roundGoal.question` | `abortReason ?? roundGoal.evidenceGap` |
| opportunity_request / hand_raise | `purpose` | none |
| evidence_version | `observation` | `interpretation` |
| evidence_review | `scope` | none |
| review_delivery | `failureReason ?? status` | none |
| publication | `id` | `exitReasons.join("; ") || undefined` |
| formal_message | `kind` | `body` |
| identity_recommendation | `rationale` | `status` |
| proposal_revision | `summary` | `body` |
| position | `stance` | `rationale` |
| decision_candidate / decision | `outcome` | `rationale` |
| completion_fact | `statement` | `rationale` |
| risk_disposition | `action` | `rationale` |
| disposition_fact | `kind` | `payload.rationale` |
| manager_plan | `kind` | `blockingReason ?? rationale` |
| task | `title` | `result ?? exitReason` |
| termination | `outcome` | `reason` |
| archive | `status` | `id` |

返回值只引用 caller-filtered DTO 的原始字符串，不写回 node。无唯一命中时返回 `undefined`，组件显示 `panel.state.focusMissing` 对应的中性 unavailable，不猜测。

## 机械执行步骤

### T0：锁定工作树和基线

前置状态：位于仓库根，本 RUNBOOK 存在。

允许修改：无。禁止修改：全部文件。

执行：确认当前分支、ancestor 和空工作树，再运行基线测试。

验证：
```bash
test "$(git branch --show-current)" = "codex/web-ui-optimization"
git merge-base --is-ancestor 417ad45 HEAD
test -z "$(git status --porcelain)"
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-local-controls.client.spec.ts tests/client/meeting-panel-locales.client.spec.ts tests/client/meeting-panel-visibility.client.spec.ts
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-lifecycle.spec.ts
```
PASS：三项 Git 检查退出 0，9 client + 2 host tests PASS；已知 source-map warning 不单独判失败。

STOP：分支错误、`417ad45` 不是 ancestor、工作树非空或任一测试失败；报告当前 branch、HEAD、`git status --short` 和测试输出，不清理工作树。失败恢复：本步只读，无副作用。

### T1：修复 list 完整性

前置状态：T0 PASS。
允许修改：`plugin/tests/unit/runtime/meeting-lifecycle.spec.ts`、`plugin/tests/contract/remote-boundary.spec.ts`、`plugin/src/runtime/meeting-lifecycle.ts` `runtime.list`。
禁止修改：Summary Schema、repository/registry、Remote errors。

执行：先红测试两 record 中一个缺 snapshot 时 list reject 且 Remote 为 `convivium/internal`；再将空 snapshot 改为 `throw new Error("Meeting is not ready.")`。不返回部分数组，不新增 `unavailableReason`。

验证：
```bash
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-lifecycle.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/remote-boundary.spec.ts
```
PASS：退出 0，正常 list 完整，缺 snapshot 整体失败。STOP：必须改 Remote 契约或 repository 才能通过。失败恢复：无外部副作用，保留红测试证据。

### T2：实现纯 Workspace/freshness 转换

前置状态：T1 PASS。
允许修改：新增 `plugin/src/client/meeting-workspace-state.ts`、`plugin/tests/client/meeting-workspace-state.client.spec.ts`。
禁止修改：React components、Remote/Protocol。

执行：先对上述初始值、reset、revision 递增、zoom union、`controlsEnabled` 真值表和转换表可纯验证部分写红测试，再按签名实现纯类型/函数。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-workspace-state.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，公式/重置无 React/I/O。STOP：必须增 store/URL/Remote state。失败恢复：纯函数。

### T3：接入 list、选择、详情读取与 last-good

前置状态：T2 PASS，`MeetingClient` 签名未变。
允许修改：`plugin/src/client/meeting-panel.tsx` `ConviviumMeetingPanel`、`plugin/tests/client/meeting-panel-lifecycle.client.spec.ts`。
禁止修改：layout、command payload、MeetingClient/RemoteStream 实现、断线恢复行为。

执行：先红测试 mount 只 list 且不自动 read、重复选择 no-op、切 ID reset、迟到 success/failure 丢弃、non-recovery list 后 ID 消失清选择、detail 失败保留 ID/last-good。按转换表接线；只有 captured ID 仍当前时提交 read result。本步保留现有唯一 RemoteStream，但不新增 recovery generation 测试。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-lifecycle.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，list/selection/read/last-good 转换均有 API-call/DOM 断言。STOP：必须改 Gateway 契约、增轮询或第二 stream。失败恢复：纯 Client state。

### T4：接入 refresh generation 与断线恢复

前置状态：T3 PASS。
允许修改：`plugin/src/client/meeting-client.ts` `MeetingRefreshCallbacks|MeetingClient|createMeetingClient.subscribeRefresh`、`plugin/tests/client/meeting-client.client.spec.ts`、`plugin/src/client/meeting-panel.tsx` `ConviviumMeetingPanel`；新增 `plugin/tests/client/meeting-panel-recovery.client.spec.ts`。
禁止修改：layout、DSH `RemoteStream` 实现、Remote method/RefreshNotice、command payload、timer/polling。

执行：先在 MeetingClient 测试第一次 open 不回调、`carrierFailed` 只报告失败、同一 logical stream 的第二次 open 调用一次 `generationReopened`；按上方签名实现 closure。再在 Panel 红测试 connected 时 refresh notice 的一次 `accept` + 一个 non-recovery generation、disconnected 时 notice 以 recovery generation 取代旧 generation、Browser `focus` 按当前 connection/terminal 状态选择 recovery 且 unmount 移除 listener、`carrierFailed` 立即 stale/disconnected、terminal failure 设置 terminal 后任何补读都不恢复 connected、`generationReopened` 启动 recovery、同 generation 的 list 与 captured detail 全成功前不恢复、list 缺 captured ID 时清选择并丢弃 detail、三种 recovery failure 组合、旧 generation 与切换选择后的 generation 整批丢弃。实现唯一 `refreshGenerationRef`、同步更新的 `connectionRef`、`streamTerminalRef` 和一个 `refreshAll({ recovery: boolean })`；每个 generation 只调用一次 list 与至多一次 captured detail，并用 `Promise.allSettled` 后统一提交。只消费既有 reconnecting stream，不新建 timer、polling 或第二 stream。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-client.client.spec.ts tests/client/meeting-panel-recovery.client.spec.ts tests/client/meeting-panel-lifecycle.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，reopened callback、generation barrier、stale、单 stream、完整恢复和旧结果丢弃成立。STOP：必须改 Gateway/Remote/RefreshNotice 契约、增轮询、第二 stream 或 command retry。失败恢复：纯 Client state；无外部副作用。

### T5：实现 Navigator 响应式外壳

前置状态：T4 PASS。
允许修改：`plugin/src/client/meeting-panel-layout.tsx`、`plugin/src/client/meeting-panel.tsx` 仅 props/callback、`plugin/src/client/locales.ts`；新增 `plugin/tests/client/meeting-panel-navigator.client.spec.tsx`。
禁止修改：Header/tabs/Overview/Timeline/command、CSS file。

执行：先红测试宽屏 `nav+main`，窄屏打开按钮/drawer/Escape/遮罩/焦点返回，两种呈现共享同 ID。用 `matchMedia("(max-width: 760px)")` 监听 change 并 unmount 移除。宽屏 inline style 固定 `gridTemplateColumns:"minmax(220px, 280px) minmax(0, 1fr)"`、`gap:16`；窄屏 fixed drawer 宽 `min(86vw, 320px)`，`role=dialog aria-modal=true`。只用已有 primitives。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-navigator.client.spec.tsx tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，响应式/单一选择/焦点行为成立。STOP：必须增 CSS bundling/dependency。失败恢复：纯 DOM。

### T6：实现 Header 与 mode tabs

前置状态：T5 PASS。
允许修改：`plugin/src/client/meeting-panel-layout.tsx`、`plugin/src/client/meeting-panel.tsx` 仅 props/callback、`plugin/src/client/locales.ts`、`plugin/tests/client/meeting-panel-local-controls.client.spec.ts`；新增 `plugin/tests/client/meeting-panel-tabs.client.spec.tsx`。
禁止修改：Overview/Timeline content、command payload。

执行：先红测试未选择无 Header/tabs/content；Header objective/lifecycle/version；仅 controls 允许的 pause/resume/end；`controlsEnabled=false` 全禁用；tablist/tab/tabpanel 左右键；切模式共享 detail。保留 command payload，接线 locale keys。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-tabs.client.spec.tsx tests/client/meeting-panel-local-controls.client.spec.ts tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，Header/tabs/controls 行为成立。STOP：需改 command/Protocol。失败恢复：纯 DOM/state。

### T7：实现纯 Timeline projection

前置状态：T6 PASS。
允许修改：新增 `plugin/src/client/meeting-timeline-projection.ts`、`plugin/tests/client/meeting-timeline-fixtures.ts`、`plugin/tests/client/meeting-timeline-projection.client.spec.ts`。
禁止修改：Schema、Domain/Remote/Runtime、React components。

执行：先红测试映射表每行、active/archive 单一来源、非 complete archive 空结果、multi-phase、排序、lane、typed refs/裸 IDs、content resolver，再实现纯函数。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-timeline-projection.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，映射每行有断言，无混合/重复/推断。STOP：DTO 冲突或必须猜 actor/kind。失败恢复：纯函数。

### T8：实现 Overview 前三组

前置状态：T7 PASS，Schema 与映射表一致。
允许修改：新增 `plugin/src/client/meeting-panel-overview.tsx`、`plugin/tests/client/meeting-panel-overview-primary.client.spec.tsx`；修改 `plugin/src/client/meeting-panel-sections.tsx`、`plugin/src/client/meeting-panel-layout.tsx` 仅 Overview 接线、`plugin/src/client/locales.ts`。
禁止修改：后四组、Timeline UI、跨模式定位、Protocol/Runtime、对象写入。

执行：先红测试 Objective、Progress、Outcomes 顺序/字段/缺席；实现主组件和前三 renderer。只展示 DTO 原值/已知 enum，Contribution/Decision 只读；本步不渲染 locate 按钮，也不消费 focus target。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-overview-primary.client.spec.tsx tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，三组和只读边界成立，无定位 UI。STOP：必须扩 DTO。失败恢复：纯 rendering。

### T9：实现 Overview 后四组

前置状态：T8 PASS。
允许修改：`plugin/src/client/meeting-panel-overview.tsx`、`plugin/src/client/meeting-panel-sections.tsx`、`plugin/src/client/locales.ts`、`plugin/tests/client/meeting-panel-visibility.client.spec.ts`；新增 `plugin/tests/client/meeting-panel-overview-secondary.client.spec.tsx`。
禁止修改：Timeline UI、跨模式定位、Protocol/Runtime、写入按钮。

执行：先红测试 OpenItems、Transcript、Evidence、Technical 顺序/字段/缺席，用户原文和 Risk 只读；实现后四 renderer。本步不渲染 locate 按钮，也不消费 focus target。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-overview-secondary.client.spec.tsx tests/client/meeting-panel-visibility.client.spec.ts tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，七组、原文、visibility 和只读边界成立，无定位 UI。STOP：需外部数据或新业务摘要。失败恢复：纯 rendering。

### T10：实现 Timeline 卡片与五泳道

前置状态：T9 PASS。
允许修改：新增 `plugin/src/client/meeting-panel-timeline.tsx`、`plugin/tests/client/meeting-panel-timeline-lanes.client.spec.tsx`；修改 `plugin/src/client/meeting-panel-layout.tsx` 和 `plugin/src/client/meeting-panel.tsx` 仅 Timeline 接线、`plugin/src/client/locales.ts`。
禁止修改：projection 规则、filters/键盘/定位、CSS file/dependency。

执行：先红测试全局时间 DOM order、五个泳道 header、卡片文字、archive unavailable、窄屏水平滚动。使用一个按全局时间排序的 node map；viewport inner CSS grid 固定五个泳道行，每个 node 按 `lane` 设置 `gridRow`，按排序索引设置 `gridColumn=index+2`，第一列是固定 `160px` 泳道 label，后续 node 列宽固定 `220px`，初始列间距 `12px`，inner `minWidth=160 + nodes.length*220 + max(nodes.length-1,0)*12`，container `overflowX:auto`。卡片显示 lane/displayName/system/type/phase/time/status，不只靠颜色。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-timeline-lanes.client.spec.tsx tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，DOM order/泳道/文字语义成立。STOP：必须分五 DOM lists 或增 dependency。失败恢复：纯 DOM。

### T11：实现筛选、缩放、折叠与滚动

前置状态：T10 PASS。
允许修改：`plugin/src/client/meeting-panel-timeline.tsx`、`plugin/src/client/meeting-panel.tsx` 仅 filter/revision callbacks、`plugin/src/client/locales.ts`；新增 `plugin/tests/client/meeting-panel-timeline-controls.client.spec.tsx`。
禁止修改：projection 规则、键盘/定位。

执行：先红测试四 filter 之间 AND/同类 OR、每个 option 集合只从未应用 UI filter 的 caller-visible projection nodes 生成、zoom 六档边界、lane collapse/expand、latest 滚到最大 time node、viewportRevision 变更将 `scrollLeft=0`。缩放只把 node 列间距设为 `12px * zoom`，并按同一公式重算 inner `minWidth`；不改 `160px` label、`220px` 卡片列宽、字体或泳道高度。实现 `TimelineFilters`/viewport controls。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-timeline-controls.client.spec.tsx
pnpm --dir plugin typecheck:client
```
PASS：退出 0，filters/zoom/collapse/latest/reset 成立，options 不随当前 filter 自缩减。STOP：需更改 projection 或将缩放变为整页缩放。失败恢复：纯 DOM/state。

### T12：实现键盘、焦点和跨模式定位

前置状态：T11 PASS，Overview 和 Timeline 均已渲染且 T7 projection 可用。
允许修改：`plugin/src/client/meeting-panel-timeline.tsx`、`plugin/src/client/meeting-panel-overview.tsx`、`plugin/src/client/meeting-panel-layout.tsx` 仅 final props 接线、`plugin/src/client/meeting-panel.tsx` 仅 focus/mode callbacks、`plugin/src/client/locales.ts`；新增 `plugin/tests/client/meeting-panel-timeline-focus.client.spec.tsx`。
禁止修改：projection/filter 规则、Overview 内容分组、业务写入。

执行：先红测试 roving tabindex（当前 node 为 `0`，其余为 `-1`），左右为同 lane 前后 node，上下为相邻未折叠 lane 中时间最近 node，无目标保持焦点；Overview 只对 `buildTimelineNodes(detail)` 中存在 objectKind/objectId 的对象显示 locate；Overview->Timeline 定位最晚 phase；Timeline->Overview；missing target 中性提示且不改 filters/Meeting；ARIA 包含 time/identity/type/status。实现最终 props 和 `findAdjacentTimelineKey`。定位先展开 lane，再 `scrollIntoView({block:"nearest",inline:"center"})` + `focus()`，成功/失败都调用 `onFocusConsumed()`。jsdom 仅可在当前 test file stub `scrollIntoView`。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-panel-timeline-focus.client.spec.tsx tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-locales.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：退出 0，键盘/焦点/双向定位/中性失败/ARIA 成立，Overview locate 复用 T7 projection，不复制映射。STOP：需改 projection 规则、DOM 时间顺序或跳过聚焦。失败恢复：纯 DOM/state。

### T13：执行自动验证

前置状态：T0–T12 PASS，无 skipped/only tests。
允许修改：无。禁止修改：全部文件；不得放宽 lint/type/Schema/test 或增加 Non-goals。

验证：
```bash
pnpm --dir plugin exec vitest run --project client
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-lifecycle.spec.ts
pnpm --dir plugin exec vitest run --project contract
pnpm --dir plugin verify
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：全部退出 0，无新 warning/error；基线 source-map warning 记录但不单独判失败。STOP：任一非零或需越 Scope；记录失败后退出本步骤，回到最早相关 T1–T12 的允许边界修复，再从该步顺序重跑，禁止在 T13 内直接改文件。失败恢复：从最早失败步骤重跑后续门禁。

### T14：安装已验证构建物并准备验收 profile

前置状态：T13 PASS；仓库根执行；人工操作者可以在不回显凭据的前提下填写新 profile 的 `dev.env` 并通过真实 Captain Session 建立 fixture。

允许修改：无仓库文件；允许创建一个新的 `/tmp/convivium-meetings-view.*` DSH workspace 及其中的 profile/SQLite。禁止修改：现有 DSH profile、现有 release、仓库源码、测试和文档。

执行：

1. 在同一 shell 运行 `meetings_view_root="$(mktemp -d /tmp/convivium-meetings-view.XXXXXX)"`、`meetings_view_workspace="$meetings_view_root/dsh-workspace"` 和 `meetings_view_install_root="$meetings_view_root/convivium-user"`，再运行 `CONVIVIUM_INSTALL_ROOT="$meetings_view_install_root" ./scripts/install-from-source.sh --workspace "$meetings_view_workspace"`；必须同时传入 install root 环境变量和独立 workspace，不得复用已有路径，因为相同版本 release 不允许覆盖。
2. 记录 `git rev-parse HEAD`、`git status --short`、三个绝对路径，运行 `cat "$meetings_view_install_root/release"`、`test -x "$meetings_view_install_root/start.sh"`；再运行 `meetings_view_artifact="$(find "$meetings_view_install_root/artifacts" -maxdepth 1 -type f -name '*.tgz')"` 和 `shasum -a 256 "$meetings_view_artifact"`，该 hash 是 T15 验收构建物标识。
3. 人工操作者只编辑新 profile 的 `dev.env` 填入真实 key，不在记录中输出 key；缺 key 时 STOP。
4. 运行 `(cd "$meetings_view_install_root" && ./start.sh)`，在真实 DSH Web 新建 Captain Session 并选择 `convivium` Preset。通过 `convivium_create_meeting` 建立两个最小 fixture：A 的 objective 固定为 `[Meetings View Gate] Running` 且 lifecycle 为 `running`；B 的 objective 固定为 `[Meetings View Gate] Archive`，经正式 lifecycle control 进入 `archived` 且 `archive.status=complete`。记录两个 `meetingId`，T15 只按 ID 选择。不得复制 SQLite、调用内部 repository 或改 Domain 状态造 fixture。
5. Ctrl+C 停止 Host，保留新 workspace，不删除 SQLite。

验证：
```bash
test -n "$meetings_view_workspace"
test -n "$meetings_view_install_root"
test -n "$meetings_view_artifact"
test -x "$meetings_view_install_root/start.sh"
test -f "$meetings_view_install_root/release"
test "$(find "$meetings_view_install_root/artifacts" -maxdepth 1 -type f -name '*.tgz' | wc -l | tr -d ' ')" = "1"
```
PASS：六条命令退出 0，记录含 HEAD、工作树、release 和唯一 artifact hash，且记录唯一 fixture A/B `meetingId` 并人工确认 A=`running`、B=`archived/complete`。STOP：安装失败、目标路径预先存在、artifact 不是唯一文件、凭据/Provider/Preset 缺失、fixture 无法通过正式入口建立、fixture ID 不唯一或安装期间源码变化；保留命令、Host 输出和新路径，不改用旧 profile/smoke/复制 SQLite。失败恢复：只重跑同一新路径的安装失败恢复；若 release 已成功则创建另一个全新 root，不覆盖。

### T15：真实 DSH Web 人工门禁与 readiness

前置状态：T14 PASS；使用 T14 记录的 `meetings_view_install_root` 和两个 `meetingId`，fixture A=`running`、fixture B=`archived/complete`。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`。禁止修改：产品代码；发现缺陷时回到对应 T1–T12 修复并重跑 T13–T15，重新安装到全新 workspace。

执行：

1. 人工操作者运行 `(cd "$meetings_view_install_root" && ./start.sh)` 并保持前台；不得重新安装、覆盖 release、复制 SQLite 或改用日常 profile。
2. Browser 打开 `http://127.0.0.1:31828`；若该 install root 的 start script 配置了不同端口，STOP 并先按正式操作文档重建固定 31828 profile，不临场替换 URL。
3. 初始记录：只有 Navigator 列表和选择提示，无 Header/detail；选择 fixture A 后才出现 Header/detail（精确调用次数由 T3–T4 自动测试负责）；切到其他应用再回到 Browser，确认同一选择完成补读且不重置 mode/viewport；宽屏侧栏与 760px 以下 drawer 共用选择；切换 Meeting 回 overview 并重置 filters/zoom/scroll/collapse。
4. 在 fixture A 依次执行 pause、确认 paused/继续按钮，再执行 resume、确认 running/暂停按钮；不得跳过中间完整补读。验证七组 Overview 只读、active Timeline 五条水平泳道、filters/zoom/collapse/latest、Tab、左右沿时间、上下跨泳道、focus/Browser accessibility tree 顺序。
5. fixture A 为 running 时在 Host 终端 Ctrl+C，保持 Browser 页面；确认 stale 且 pause/end 禁用。再从同一 install root 运行同一 `start.sh`；确认 reconnecting stream 自动重开、完整 list + fixture A detail 成功后 stale 消失且 pause/end 恢复。
6. 选择 fixture B，验证 archive Timeline 只使用 complete archive；再回到 fixture A，记录当前 version 后执行 end。确认按钮在 pending 时禁用，accepted 后完整补读得到更大 version、lifecycle 属于 `ending|terminal|archiving|archived` 且不再显示 pause/resume/end；不要求跳过领域流程或固定 archive 完成时长。
7. 在中文 -> English -> 中文间同页切换；确认无 Contribution/Decision/Risk 写按钮、独立 Timeline View 或裸-ID relation。
8. Ctrl+C 停止 Host；不删除 profile/SQLite。只有清单全部 PASS 后才修改 readiness：在 Feature Coverage 新增或替换唯一 `MO-FR-17 | Meetings View 概览与时间线` 行，状态写 `已实现`，当前覆盖写 Navigator、共享 Header、七组 Overview、五泳道 Timeline、generation 恢复和 `zh/en`，缺口只保留 Browser 自动化/性能；在 Executed Validation 追加一行 T13 自动命令证据和一行 T14–T15 真实 Web 证据，后者必须包含日期、HEAD、`git status --short`、workspace/install root/release、artifact SHA-256、fixture A/B、断线重连及人工清单结果。不得改写既有历史证据。

验证：
```bash
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：人工清单和两命令全部 PASS，readiness 证据完整。STOP：缺 profile/fixture/key，端口被占用，Host 失败，任一清单 FAIL，或人工未确认；保留精确 Host 输出和 profile。失败恢复：代码缺陷回对应 T1–T12；环境/fixture 缺陷回 T14；之后必须重跑 T13–T15。

### T16：收口并删除 RUNBOOK

前置状态：T15 PASS，readiness 已包含 T13–T15 的真实证据。
允许修改：删除 `docs/30-designs/RUNBOOK-MEETINGS-VIEW.md`。禁止修改：其他文件；若发现其他文件引用本 RUNBOOK，STOP，不自行判断其是否为临时引用。

执行：先运行以下命令，退出码必须为 0；随后删除本 RUNBOOK，不保留 completed/archive 副本。

```bash
test "$(rg -l "RUNBOOK-MEETINGS-VIEW|Meetings View 概览与时间线实施 RUNBOOK" . --glob '!plugin/node_modules/**' --glob '!.git/**')" = "./docs/30-designs/RUNBOOK-MEETINGS-VIEW.md"
```

验证：
```bash
test -z "$(rg -l "RUNBOOK-MEETINGS-VIEW|Meetings View 概览与时间线实施 RUNBOOK" . --glob '!plugin/node_modules/**' --glob '!.git/**' || true)"
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：删除前引用检查只命中本文件，删除后三条命令退出 0，readiness 仍含完整证据。STOP：删除前 `rg` 命中其他文件、任一删除后检查失败或 readiness 证据不完整；恢复本文件并报告命中/输出。失败恢复：RUNBOOK 删除前无副作用；删除后检查失败则恢复本文件。

## 验证矩阵、Not Applicable 与删除

| 边界 | 预期 | 证据 |
| --- | --- | --- |
| list/recovery | 完整成功或整体 internal failure | T1 host/contract |
| selection/freshness | 无迟到覆盖/自动改选，generation 完整恢复，last-good stale 禁写 | T2–T4 |
| lifecycle controls | payload 不变，controls/freshness 决定可用 | T6 + T15 |
| Overview | 七组只读，caller-filtered 缺席不泄露 | T8–T9 |
| Timeline | active 只顶层，archive 只 complete archive，multi-phase/order/lane 确定 | T7、T10 |
| controls/a11y | typed filters，六档缩放，DOM order/keyboard/focus | T11–T12 + T15 |
| i18n/time | 中英同构动态切换，原文，Host locale/timezone | client tests + T15 |
| install/Web | T13 通过的工作树构建为唯一 artifact，并在真实持久 profile 验收 | T14–T15 |

Not Applicable：无新 command，因此无新 caller/stale-version/idempotency/rollback/outbox 语义；无数据库迁移、兼容读写、新 event/receipt/outbox；不改服务器容量/并发，不增压力测试；仅 `zh`/`en`。

Scope 全部有代码/focused test/PASS，Non-goals 未引入，T13 自动验证、T14 安装、T15 人工门禁与 readiness 全部 PASS 后，才由 T16 删除本文。长期结论属于 requirements/interfaces/designs，验证证据属于 readiness。

## Author Audit

结论：`Executable`。需求已缩减为已有数据展示和现有 lifecycle controls；纯状态、选择/读取、transport generation 恢复、响应式外壳、Header/tabs、projection、Overview 两批、泳道、视口控制、键盘定位、自动门禁、已验证构建安装、人工门禁和删除收口均按依赖拆分。执行者无需决定新 Remote/领域协议、对象写入、freshness 语义、Timeline 映射、裸 ID 推断、缩放语义或 Web 验收方式。

作者未运行 typecheck/build/full verify/真实 DSH Web，因为本次只修订 RUNBOOK；它们是 T13–T15 门禁，当前不是 PASS 证据。
