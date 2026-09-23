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

### T14：安装已验证构建物并准备验收 profile

前置状态：T13 PASS；仓库根执行；仓库根 `dev.env` 已存在、权限为 `600`、`DEEPSEEK_API_KEY` 非空；人工操作者可以通过真实 Captain Session 建立 fixture。

允许修改：无仓库文件；允许创建一个新的 `/tmp/convivium-meetings-view.*` DSH workspace 及其中的 profile/SQLite。禁止修改：现有 DSH profile、现有 release、仓库源码、测试和文档。

执行：

1. 在同一 shell 运行 `meetings_view_root="$(mktemp -d /tmp/convivium-meetings-view.XXXXXX)"`、`meetings_view_workspace="$meetings_view_root/dsh-workspace"` 和 `meetings_view_install_root="$meetings_view_root/convivium-user"`，再运行 `CONVIVIUM_INSTALL_ROOT="$meetings_view_install_root" ./scripts/install-from-source.sh --workspace "$meetings_view_workspace"`；必须同时传入 install root 环境变量和独立 workspace，不得复用已有路径，因为相同版本 release 不允许覆盖。
2. 记录 `git rev-parse HEAD`、`git status --short`、三个绝对路径，运行 `cat "$meetings_view_install_root/release"`、`test -x "$meetings_view_install_root/start.sh"`；再运行 `meetings_view_artifact="$(find "$meetings_view_install_root/artifacts" -maxdepth 1 -type f -name '*.tgz')"` 和 `shasum -a 256 "$meetings_view_artifact"`，该 hash 是 T15 验收构建物标识。
   核对首次新建的 `"$meetings_view_install_root/dsh-home/profiles/web/package.json"` 中 `dsh.profile.patchReload` 精确为 `startup`；不得临场改动 profile manifest 绕过失败。
3. 安装完成后运行下列命令；任何检查失败立即 STOP，不继续到 `rm`。命令只在子进程检查 key 是否非空，不复制或回显凭据；删除的对象必须是安装器新建的空占位文件，随后链接到固定凭据。不得在构建、打包或安装前导出 key。

```bash
set -eu
meetings_view_repository_root="$(git rev-parse --show-toplevel)"
test -f "$meetings_view_repository_root/dev.env"
test ! -L "$meetings_view_repository_root/dev.env"
test "$(stat -f %Lp "$meetings_view_repository_root/dev.env")" = "600"
sh -c 'unset DEEPSEEK_API_KEY; . "$1"; test -n "${DEEPSEEK_API_KEY:-}"' sh "$meetings_view_repository_root/dev.env"
test ! -L "$meetings_view_install_root/dev.env"
test "$(cat "$meetings_view_install_root/dev.env")" = "DEEPSEEK_API_KEY="
rm -- "$meetings_view_install_root/dev.env"
ln -s "$meetings_view_repository_root/dev.env" "$meetings_view_install_root/dev.env"
```
4. 运行 `(cd "$meetings_view_install_root" && ./start.sh)`，在真实 DSH Web 新建 Captain Session 并选择 `convivium` Preset。通过 `convivium_create_meeting` 建立两个最小 fixture：A 的 objective 固定为 `[Meetings View Gate] Running` 且 lifecycle 为 `running`；B 的 objective 固定为 `[Meetings View Gate] Archive`，经正式 lifecycle control 进入 `archived` 且 `archive.status=complete`。记录两个 `meetingId`，T15 只按 ID 选择。不得复制 SQLite、调用内部 repository 或改 Domain 状态造 fixture。
5. Ctrl+C 停止 Host；保留临时 workspace/SQLite 到 T15 完成，之后由 T16 删除。

验证：
```bash
test -n "$meetings_view_workspace"
test -n "$meetings_view_install_root"
test -n "$meetings_view_artifact"
test -x "$meetings_view_install_root/start.sh"
test -f "$meetings_view_install_root/release"
test "$(find "$meetings_view_install_root/artifacts" -maxdepth 1 -type f -name '*.tgz' | wc -l | tr -d ' ')" = "1"
test -L "$meetings_view_install_root/dev.env"
test "$(readlink "$meetings_view_install_root/dev.env")" = "$(git rev-parse --show-toplevel)/dev.env"
node -e 'const p=require(process.argv[1]); if (p.dsh?.profile?.patchReload !== "startup") process.exit(1)' "$meetings_view_install_root/dsh-home/profiles/web/package.json"
```
PASS：九条命令退出 0，记录含 HEAD、工作树、release 和唯一 artifact hash，且记录唯一 fixture A/B `meetingId` 并人工确认 A=`running`、B=`archived/complete`。STOP：安装失败、目标路径预先存在、artifact 不是唯一文件、新 profile 不是 `patchReload: startup`、固定凭据不存在/权限不符/为空、安装器占位文件不是预期内容、Provider/Preset 缺失、fixture 无法通过正式入口建立、fixture ID 不唯一或安装期间源码变化；保留命令、Host 输出和新路径，不改用旧 profile/smoke/复制 SQLite 或复制 key。失败恢复：只重跑同一新路径的安装失败恢复；若 release 已成功则创建另一个全新 root，不覆盖。

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
8. Ctrl+C 停止 Host；暂不删除 profile/SQLite，待 T16 收口。只有清单全部 PASS 后才修改 readiness：在 Feature Coverage 新增或替换唯一 `MO-FR-17 | Meetings View 概览与时间线` 行，状态写 `已实现`，当前覆盖写 Navigator、共享 Header、七组 Overview、五泳道 Timeline、generation 恢复和 `zh/en`，缺口只保留 Browser 自动化/性能；在 Executed Validation 追加一行 T13 自动命令证据和一行 T14–T15 真实 Web 证据，后者必须包含日期、HEAD、`git status --short`、workspace/install root/release、artifact SHA-256、fixture A/B、断线重连及人工清单结果，并注明临时环境待 T16 删除、固定 `dev.env` 未复制。不得改写既有历史证据。

验证：
```bash
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：人工清单和两命令全部 PASS，readiness 证据完整。STOP：缺 profile/fixture/key，端口被占用，Host 失败，任一清单 FAIL，或人工未确认；保留精确 Host 输出和临时 profile 供失败诊断，不触碰仓库根 `dev.env`。失败恢复：代码缺陷回对应 T1–T12；环境/fixture 缺陷回 T14；之后必须重跑 T13–T15。

### T16：清理临时验收环境

前置状态：T15 PASS；Host 已停止，readiness 已记录 T14–T15 证据，固定 `dev.env` 位于仓库根且未被复制。
允许修改：只删除 T14 创建的 `/tmp/convivium-meetings-view.XXXXXX` 临时根及其中的 profile/SQLite，并修改 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 内 T14–T15 本次证据行的清理状态。禁止修改：仓库根 `dev.env`、日常 `dsh-workspace/`、其他临时根、其他仓库文件。

执行：先从 T14 记录恢复 `meetings_view_root` 和 `meetings_view_install_root`；确认二者与记录的绝对路径完全一致，再运行下列命令。`lsof` 查到任何占用验收端口的进程时 STOP，不终止该进程。只递归删除这个经核对的临时根；`rm` 不跟随其中的符号链接。

```bash
set -eu
case "$meetings_view_root" in /tmp/convivium-meetings-view.??????) ;; *) exit 1 ;; esac
test -d "$meetings_view_root"
test ! -L "$meetings_view_root"
test "$meetings_view_install_root" = "$meetings_view_root/convivium-user"
test -L "$meetings_view_install_root/dev.env"
test "$(readlink "$meetings_view_install_root/dev.env")" = "$(git rev-parse --show-toplevel)/dev.env"
test -f "$(git rev-parse --show-toplevel)/dev.env"
command -v lsof >/dev/null
test -z "$(lsof -nP -iTCP:31828 -sTCP:LISTEN)"
rm -r -- "$meetings_view_root"
```

删除成功后，只将 T14–T15 本次证据行中的“临时环境待 T16 删除”更新为“T16 PASS，临时环境已删除；仓库根 `dev.env` 保留且未复制”，不改写其他证据。

验证：
```bash
test ! -e "$meetings_view_root"
test -f "$(git rev-parse --show-toplevel)/dev.env"
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：四条命令退出 0，固定 `dev.env` 仍存在，只有本次临时验收环境被删除，readiness 记录清理结果。STOP：路径、链接目标或 Host 状态无法核对，删除失败，固定 `dev.env` 不存在，或文档检查失败；保留实际路径和错误，不扩大删除范围。失败恢复：不自动清理其他路径；报告未删除的残留，由人工按精确路径处置。

### T17：收口并删除 RUNBOOK

前置状态：T16 PASS，readiness 已包含 T13–T15 的真实证据及临时环境清理说明。
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
| install/Web | T13 通过的工作树构建为唯一 artifact，新 profile 采用 `patchReload: startup`，在隔离 profile 验证真实 Host 与重启恢复，凭据只读取固定 `dev.env`，验收后删除临时环境 | T14–T16 |

Not Applicable：无新 command，因此无新 caller/stale-version/idempotency/rollback/outbox 语义；无数据库迁移、兼容读写、新 event/receipt/outbox；不改服务器容量/并发，不增压力测试；仅 `zh`/`en`。

Scope 全部有代码/focused test/PASS，Non-goals 未引入，T13 自动验证、T14 安装、T15 人工门禁与 readiness、T16 临时环境清理全部 PASS 后，才由 T17 删除本文。长期结论属于 requirements/interfaces/designs，验证证据属于 readiness。

## Author Audit

结论：`Executable`。需求已缩减为已有数据展示和现有 lifecycle controls；纯状态、选择/读取、transport generation 恢复、响应式外壳、Header/tabs、projection、Overview 两批、泳道、视口控制、键盘定位、自动门禁、已验证构建安装、人工门禁和删除收口均按依赖拆分。执行者无需决定新 Remote/领域协议、对象写入、freshness 语义、Timeline 映射、裸 ID 推断、缩放语义或 Web 验收方式。

本次 HMR 修复的聚焦安装契约测试、`pnpm --dir plugin verify` 和文档链接检查已 PASS；隔离 profile 中的 `patchReload: startup` 也已使真实 DSH Web 监听固定端口，但该诊断环境不算 T14 PASS。仍须按 T14–T15 从修复后的干净工作树重新安装、建立 fixture 并完成人工 Web 清单。
