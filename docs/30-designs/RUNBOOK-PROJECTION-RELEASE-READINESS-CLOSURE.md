# RUNBOOK C：FR-11 Client 可观察性最小闭环

状态：滚动执行中；T0–T1 PASS，下一步为 T2；Author 与 Audit 结论为 `Executable`

建立日期：2026-08-31

调查基线：`main@42a7bfb`

执行边界：只在执行者自己的独立 checkout 中顺序执行；不建 worktree、不安装依赖、不 commit、不 push、不创建 PR。执行前记录实际 HEAD 和既有工作树修改，证据只对该边界成立。

## 1. 执行者契约

执行者必须按 `T2 → T3 → T4 → T5 → T6 → T7` 顺序执行；T0–T1 已完成并从本文删除。不得跳步、合并步骤或在失败后继续修改。

允许修改：

- T1-T5：`plugin/src/client/meeting-panel.tsx`、`plugin/src/client/meeting-panel-view.tsx`（T1 唯一新增）、`plugin/tests/client/client-entry.client.spec.ts`。
- T7：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`，并在全部检查通过后删除本 RUNBOOK。
- `meeting-panel-view.tsx` 只能由 `ConviviumMeetingPanel` 和 `client-entry.client.spec.ts` 两个当前消费者导入；不得导出 React component、通用 renderer 或扩展 API。

禁止修改：

- `plugin/src/protocol/**`、`plugin/src/projection/**`、Host、HTTP、Domain、Runtime、SQLite、tools、Client registration、CSS、package、lockfile、依赖、其他 tests/docs。
- developer Markdown、metrics、stress、resource-leak framework、新 browser/profile runner和 `plugin/scripts/smoke-profile.mjs`。
- Decision acceptance、pending Decision、AgendaCandidate disposition、Question 新 evidence、stall/refocus 或任何新控制。
- 组件库、design system、视觉重设计、主题、图表、路由或新抽象。
- 原始 JSON `<pre>` 的替代 debug dump；测试不得依赖 JSON 字符串。
- `skipLibCheck`、类型断言、放宽 Schema/断言、删除测试或 `--passWithNoTests`。

PASS：本步骤全部命令退出 `0`，且 PASS 段的 DOM、状态和副作用断言全部成立。

STOP：任一前置、文件、symbol、字段、状态适用性、命令或断言不成立时立即停止。报告最后 PASS 步骤、文件/symbol、最小复现、stdout/stderr 和继续所需的 RUNBOOK 修订；不得改协议或寻找替代字段。

恢复：T1-T6 不产生数据库、网络外部系统或临时目录。失败时保留当前 diff 供审阅，不手工逆向 patch、不覆盖用户修改。T7 删除后失败时只用执行者当前 turn 保存的 Add File patch 恢复本文。

## 2. 目标、起点与完整链路

### 当前起点

- `ConviviumMeetingPanel` 已保留顶部 Meeting selector、5 秒 polling、focus refetch、pause/resume/skip/end controls、写成功/结构化错误后的 full refetch、最后成功 projection 和 stale 禁写。
- 会议详情主要通过 `<pre aria-label="Meeting status details">` 暴露，未形成 FR-11 AC-16 所需的专用语义 DOM。
- `MeetingStatusResultV1` 已包含本任务所需的 topic、status、version、current agenda/turn/speaker/wait、messages、blocking facts、tasks、accepted decisions 和 termination。

### 预期终点

```text
GET /api/convivium/meetings/:meetingId
  -> existing MeetingStatusResultSchema validation
  -> replace the complete successful detail cache
  -> component-local deterministic view mapping
  -> Summary / Current activity / Transcript / Blocking items /
     Meeting tasks / Accepted decisions / conditional Termination
  -> existing Pause / Resume / Skip current speaker / End controls

poll / focus / write success / structured write error
  -> full list + detail refetch
transport or validation failure
  -> retain last successful projection + fixed error + disable every write control
```

## 3. Scope 与 Non-goals

Scope 只有 FR-11 的 Client observability 最小闭环：保留 Meeting selector；建立七个固定语义 section；删除默认 JSON `<pre>`；保持四类现有 controls；验证 stale/error/refetch；运行 Client focused tests、consumer Schema regression、Client typecheck、full verify；只迁移实际证据到 readiness。

Non-goals/Not Covered：developer Markdown、structured metrics、stress、长期资源泄漏 framework、真实 browser/profile、end/reassign DSH 生命周期证据、`smoke-profile.mjs`、远程/多用户、视觉重设计、组件库、依赖、Decision/Agenda 新契约。真实 DSH end/reassign/profile 证据归 RUNBOOK B，不由本文关闭。

RUNBOOK A 冻结点：本文只展示当前 `acceptedDecisions`，不新增 pending Decision、Decision action、AgendaCandidate control 或新字段。执行时若 RUNBOOK A 已改变 `MeetingStatusResultV1` 或 Client controls，T0 STOP 并由作者修订本文。

## 4. 真相源、字段与文件

正式依据：[Architecture](../00-governance/ARCHITECTURE.md) `Plugin Frontend`、[Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-11 与 AC-16、[Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) `Authorized status projection`、[Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md) `Projection And Frontend`、[Readiness](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) FR-11/Not Covered。

代码入口：

| 责任 | 文件与 symbol |
| --- | --- |
| Client component/cache/control | `plugin/src/client/meeting-panel.tsx#ConviviumMeetingPanel` |
| Client-local mapper | `plugin/src/client/meeting-panel-view.tsx#mapMeetingPanelView`（T1 新增） |
| response validation | 同文件 `readList`、`readStatus`、`readControl`、`readReassign`、`readEnd` |
| refresh | 同文件 `loadList`、`loadDetail`、`refreshSelectedMeeting`、`controlMeeting` 内部 callbacks |
| consumer Schema | `plugin/src/protocol/status.ts#MeetingStatusResultSchema` |
| DTO | `plugin/src/protocol/types.ts#MeetingStatusResultV1` 及下表类型 |
| Client tests | `plugin/tests/client/client-entry.client.spec.ts#describe("client entry framework")` |
| Schema regression | `plugin/tests/contract/protocol-schema.spec.ts`、`status-projection.spec.ts`，只运行不修改 |

字段不存在或适用状态与下表不同即 STOP；固定规则是省略该行/section，不改协议。

## 5. 精确字段到 DOM 映射

所有 section 使用 `<section aria-label="…">`。标签和值使用 `<dl><dt><dd>`；集合使用 `<ol>`，保持下表顺序。React text node 提供转义，禁止 `dangerouslySetInnerHTML`。

| section | DOM/selector | source 与状态 | 顺序、fallback、行规则 |
| --- | --- | --- | --- |
| Meeting summary | `section[aria-label="Meeting summary"]` | 所有状态：`detail.topic/status/meetingVersion`；`activeAgendaItem` 只存在于 active/execution-terminal discussion projection | 固定行 Topic、Status、Meeting version；存在 agenda 时追加 Current agenda title、Current agenda objective；不存在时这两行各为 `None` |
| Current activity | `section[aria-label="Current activity"]` | active：`currentTurn.steps[].participantId`、`currentSpeakerId`、`waitState.reason/participantIds`；terminal/archiving/archived 无这些字段 | 固定四行 Planned speaker order、Current speaker、Waiting reason、Waiting participants；steps 按 producer 数组顺序以 ` → ` 连接；participants 按 producer 顺序以 `, ` 连接；缺失或空数组均为 `None` |
| Transcript | `section[aria-label="Transcript"]` | active/execution-terminal：`messages`; archiving/archived 字段不存在 | 复制数组后按 `seq` 数值升序；每个 `<li data-message-seq=String(seq)>` 固定显示 Speaker、Kind、Content、Agenda item；字段实际 required；section 无字段或空数组时唯一文本 `No committed messages.` |
| Blocking items | `section[aria-label="Blocking items"]` | active/execution-terminal：`blockingFacts`; archiving/archived 不存在 | 保持 producer 顺序；每个 `<li data-blocking-id=id>` 固定显示 Kind、Summary、Subject；无字段或空数组时 `No blocking items.` |
| Meeting tasks | `section[aria-label="Meeting tasks"]` | 所有状态：`meetingTasks` | 保持 producer 顺序；每个 `<li data-task-id=meetingTaskId>` 固定显示 Title、Status、Participant；`resultSummary` 字段存在时追加 Result，不存在则省略该行；空数组时 `No meeting tasks.` |
| Accepted decisions | `section[aria-label="Accepted decisions"]` | active/execution-terminal：`acceptedDecisions`; archiving/archived 顶层不存在，不从 archive 反推 | 保持 producer 顺序；每个 `<li data-decision-id=id>`：`statement` 存在时显示 Statement，`rationale` 存在时显示 Rationale，`dissentingPositionIds` 存在时显示 Dissent IDs，数组空值显示 `None`；optional 字段不存在就省略该行；无字段或空数组时 `No accepted decisions.` |
| Termination | `section[aria-label="Termination"]` | 只在 execution-terminal、archiving、archived：`termination.code/reason/decisionIds` | 固定 Code、Reason、Decision IDs；IDs 保持 producer 顺序并以 `, ` 连接，空数组为 `None`；active 完全不渲染该 section |

`active` 精确定义为 `created | running | waiting | paused | converging`；execution-terminal 为 `completed | partial | no_consensus | cancelled | failed`。不得从 `archive.package`、文本内容、ID 命名或 JSON dump 补造缺失字段。

唯一 Client-local mapper 必须逐字导出：

```ts
export interface MeetingPanelView {
  readonly agendaTitle: string;
  readonly agendaObjective: string;
  readonly plannedSpeakerOrder: string;
  readonly currentSpeaker: string;
  readonly waitingReason: string;
  readonly waitingParticipants: string;
  readonly messages: readonly PublicMeetingMessageV1[];
  readonly blockingFacts: readonly PublicBlockingFactV1[];
  readonly meetingTasks: readonly MeetingTaskProjectionV1[];
  readonly acceptedDecisions: readonly PublicDecisionV1[];
  readonly termination?: PublicTerminationV1;
}

export function mapMeetingPanelView(detail: MeetingStatusResultV1): MeetingPanelView;
```

mapper 在字段不存在时使用第 5 节 fallback；只用 `"field" in detail` 判别 union；`messages` 必须复制后按 `seq` 升序并返回新数组；其他数组保持原引用和 producer 顺序；`termination` 只在字段存在时返回。不得读取 archive package、修改输入、包含 JSX 或产生副作用。

该文件的 type-only import 固定为：

```ts
import type {
  MeetingStatusResultV1,
  MeetingTaskProjectionV1,
  PublicBlockingFactV1,
  PublicDecisionV1,
  PublicMeetingMessageV1,
  PublicTerminationV1,
} from "../protocol/index.js";
```

实现算法唯一固定为：discussion 字段存在时读取，否则使用空数组；`agendaTitle`/`agendaObjective` 分别为 `activeAgendaItem?.title ?? "None"` 和 `activeAgendaItem?.objective ?? "None"`；`plannedSpeakerOrder` 为 `currentTurn.steps.map(step => step.participantId).join(" → ") || "None"`；`currentSpeaker` 为 `currentSpeakerId ?? "None"`；`waitingReason` 为 `waitState?.reason ?? "None"`；`waitingParticipants` 为 `waitState?.participantIds.join(", ") || "None"`；`meetingTasks` 直接取 `detail.meetingTasks`；`termination` 仅在 `"termination" in detail` 时取 `detail.termination`。不得采用第二套 fallback 或排序规则。

## 6. 不变量

1. Client 只消费已通过 `MeetingStatusResultSchema` 的完整 projection，不访问 SQLite、Markdown、AgentSession 或 Host implementation。
2. producer 顺序保持不变；只有 transcript 按正式 `seq` 升序显示，不修改输入数组。
3. stale/error 保留最后成功的 `detail`；不清空、不用失败 body 替换。
4. `listCached || detailCached || writePending` 时全部现有写按钮 disabled。
5. 写成功或经 `validateProtocolError` 验证的结构化错误都恰好执行一次 `refreshSelectedMeeting`，即并发发起 list/detail 两个 GET；POST 不重试。
6. 所有 list/detail/write 的 transport、JSON、Schema 或已验证 Protocol error 对用户都显示固定 `Meeting data is unavailable.`，不得显示服务端 message；结构化 write error 仍触发一次 full refetch，普通 transport/JSON/Schema write failure 不自动重试 POST。error banner 一直保留到下一次成功的完整 detail GET；该 GET 成功后才清除 error/stale，并用新 projection 整体替换缓存。
7. polling 仍为 `5_000ms`，focus 与 polling 整体替换缓存；unmount 继续 abort 三个 controller 并清理 interval/listener。
8. 控制可见性和 payload 不变：Pause/Resume/Skip current speaker/End；不新增 Decision/Agenda control。

## 7. 机械执行步骤

### T2：实现 Summary 与 Current activity

前置状态：T1 PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：其他五个新 section、controls、fetch/cache callbacks。

执行：在 `renderObservabilitySections` 内消费 T1 `view`，以 Summary、Current activity 顺序新增第 5 节两个 section；删除原独立 status `<p data-meeting-status>`、paused/waiting `<dl>`，其事实只由两个新 section 表达；tests 覆盖 running/waiting/terminal、agenda 有无、steps/participants 顺序及全部 `None` fallback。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：两个 aria-label 各恰好一个；字段/顺序/fallback 与表一致；terminal activity 四行均为 `None`；现有 selector 与 controls 回归通过。

STOP：需要从 archive/text 推断字段、改变 controls 或新增 CSS/组件。保留 diff并停止。

恢复：无外部副作用；保留 diff。

### T3：实现 Transcript 与 Blocking items

前置状态：T2 PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：Summary/Activity 语义、Tasks/Decisions/Termination、controls、cache。

执行：按第 5 节在 Activity 后新增 Transcript、Blocking items，分别消费 `view.messages` 和 `view.blockingFacts`；tests 输入逆序 seq 并断言 DOM 升序、四字段、data attributes、两个空态和 archiving 无 discussion 字段的空态。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：两个 section 各恰好一个；原 fixture 数组顺序未改变；DOM seq 升序；字段与空态逐字匹配；无 HTML 注入。

STOP：需要修改 producer/Schema、原地 sort 或显示私有字段。保留 diff并停止。

恢复：无外部副作用；保留 diff。

### T4：实现 Tasks、Decisions 与 conditional Termination

前置状态：T3 PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：前四 section、controls、cache、archive mapping。

执行：按第 5 节依次新增 Meeting tasks、Accepted decisions，消费 `view.meetingTasks` 和 `view.acceptedDecisions`；最后仅在 `view.termination !== undefined` 时新增 Termination。tests 覆盖 optional result/statement/rationale/dissent 行的存在/省略、空数组 fallback、所有状态任务、active 无 Termination、五个 terminal 状态及 archiving/archived 有 Termination。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：三个 section 的适用状态、顺序、字段、optional 行和空态逐字匹配；active 查询 Termination 返回不存在；不从 archive.package 读取 decisions。

STOP：字段不存在、需要新 public field 或出现 Decision/Agenda action。保留 diff并停止。

恢复：无外部副作用；保留 diff。

### T5：删除 JSON 并收口 controls/stale/refetch regression

前置状态：T4 PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：七个 section 映射、control payload、protocol/read functions、其他文件。

执行：删除 `<pre aria-label="Meeting status details">`；将函数签名固定为 `function failureMessage(_error: unknown): string` 并对任何输入返回 `"Meeting data is unavailable."`；将旧测试的 JSON 查询全部改为第 5 节语义 selectors；新增/补齐固定 error、最后成功 projection、所有可见写按钮 disabled、写 success 和 structured error 后各两个 GET、transport error 无自动 POST retry、poll/focus/unmount 回归。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
rg -n "Meeting status details|JSON.stringify\(detail|<pre" plugin/src/client/meeting-panel.tsx plugin/tests/client/client-entry.client.spec.ts
```

PASS：前两条退出 `0`；最后 `rg` 无输出且退出 `1`；selector 保持；四类 controls 的可见性/payload 不变；stale/refetch/unmount 不变量全部通过。

STOP：需要修改协议、control payload、poll interval、Client registration 或保留 debug dump。保留 diff并停止。

恢复：无外部副作用；保留 diff。

### T6：focused Client、consumer Schema 与 bundle 门禁

前置状态：T5 PASS。

允许修改：只允许 Prettier 对 `meeting-panel.tsx`、`meeting-panel-view.tsx` 和 `client-entry.client.spec.ts` 的机械格式化结果。

禁止修改：其他文件及任何行为/断言。

执行：格式化三个允许文件；运行 Client、consumer Schema、status projection、双 typecheck 与 build。任一失败立即 STOP，不在 T6 修代码。

验证：

```bash
pnpm --dir plugin exec prettier src/client/meeting-panel.tsx src/client/meeting-panel-view.tsx tests/client/client-entry.client.spec.ts --write
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin build
```

PASS：全部退出 `0`；consumer Schema/producer projection 无回归；Host/Client programs 和 bundle build 通过；格式化未触碰其他文件。

STOP：任一失败或 Prettier 修改范围越界。报告失败并回到对应 T1-T5 修订 RUNBOOK后再执行；不得在本步判断修复。

恢复：构建产物由现有 build 管理；不手工删除。保留源码 diff。

### T7：full verify、readiness 迁移与删除

前置状态：T6 PASS；工作树只包含三个 Client 文件、本 RUNBOOK，及本步 readiness 修改。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、删除本 RUNBOOK。

禁止修改：其他文件。

执行：先运行 full verify。PASS 后，把 readiness 的 FR-11 整行替换为以下唯一内容：

```markdown
| FR-11 可观察性与用户控制  | 部分实现 | caller-specific status、Captain reassign/skip tool、loopback list/status/pause/resume/reassign/end HTTP、固定 `local_host/loopback-web` authority、current attempt projection、Plugin Client Meeting selector，以及 `Meeting summary`、`Current activity`、`Transcript`、`Blocking items`、`Meeting tasks`、`Accepted decisions`、conditional `Termination` semantic sections；Client 自动化覆盖 polling/focus/write-result full refetch、stale cache、固定错误、全部写控制禁用及 Pause/Resume/Skip/End 回归，不再暴露默认 JSON dump | 结构化 metrics、远程/多用户控制，以及 RUNBOOK B 所属 end/reassign 的真实 DSH browser/profile 证据尚未完成 |
```

在 `Executed Validation` 最后追加一行：命令列逐字为 `` `pnpm --dir plugin verify` ``；结果列只写该次真实输出中的 `Pass`、实际 test file/test 数、format/lint/Host+Client typecheck/build/environment/contract/package 均通过，以及上述七 section/stale/refetch Client tests 已包含。不得填写未从输出取得的数字。代码基线只替换为 T0 记录的实际 HEAD literal；日期使用执行当天。现有 Not Covered 中 developer Markdown、metrics、stress/resource、browser/profile、远程/多用户、存储迁移和生产发布全部保留，不删除其他句子。检查 RUNBOOK 与 readiness 的链接、diff、scope 和外部引用；全部 PASS 后删除本文并复验。

验证（删除前）：

```bash
pnpm --dir plugin verify
node -e 'const fs=require("node:fs"),p=require("node:path");for(const f of ["docs/30-designs/RUNBOOK-PROJECTION-RELEASE-READINESS-CLOSURE.md","docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md"]){const s=fs.readFileSync(f,"utf8");for(const m of s.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const t=m[1].split("#",1)[0];if(!t||/^https?:/.test(t))continue;if(!fs.existsSync(p.resolve(p.dirname(f),t)))throw Error(f+" -> "+t)}}'
git diff --check
git status --short
rg -n "RUNBOOK-PROJECTION-RELEASE-READINESS-CLOSURE|FR-11 Client 可观察性最小闭环" . --glob '!docs/30-designs/RUNBOOK-PROJECTION-RELEASE-READINESS-CLOSURE.md'
```

PASS（删除前）：`verify`、链接、diff 退出 `0`；status 只列三个 Client 文件、readiness 和本 RUNBOOK；最后 `rg` 无输出且退出 `1`；readiness 保留全部 Not Covered 并只记录实际证据。

STOP：任一失败、范围外文件、RUNBOOK B 证据被误写完成、metrics/Markdown/stress/profile 被误写完成或引用残留。不得删除本文。

恢复（删除前）：保留本文和 diff；不修改其他文件。

删除后验证：

```bash
test ! -e docs/30-designs/RUNBOOK-PROJECTION-RELEASE-READINESS-CLOSURE.md
test -z "$(rg -l 'RUNBOOK-PROJECTION-RELEASE-READINESS-CLOSURE|FR-11 Client 可观察性最小闭环' . || true)"
git diff --check
```

PASS（最终）：三条命令退出 `0`。此时才可报告完成；仍不得 commit/push/建 PR。

STOP（删除后）：立即用执行者当前 turn 保存的本文 Add File patch 恢复同一路径，再运行 `git diff --check` 并报告；不得从其他 checkout 或 Git 历史复制。

恢复（删除后）：只恢复本文，不覆盖 Client/readiness 修改。

## 8. 验证矩阵

| 风险 | 步骤 | 可观察 PASS |
| --- | --- | --- |
| 字段/状态漂移 | T0/contract | 当前 V1 字段和 union 分支匹配第 5 节 |
| summary/activity | T2 | 固定行、producer order、`None` fallback |
| transcript | T3 | seq 升序、原数组不变、空态逐字 |
| blocking | T3 | producer order、字段和空态逐字 |
| tasks | T4 | 所有状态可见、optional result 省略 |
| decisions | T4 | 仅 discussion projection；optional 行/空态准确 |
| termination | T4 | active 不渲染；terminal/archiving/archived 显示三字段 |
| controls | T5 | Pause/Resume/Skip/End 可见性和 payload 无变化 |
| stale/error | T5 | 最后成功 projection 保留、固定错误、全部写 disabled |
| refetch/lifecycle | T5 | write success/structured error full refetch；poll/focus/unmount 保持 |
| consumer/bundle | T6 | Client + Schema + projection + typecheck + build PASS |
| full/readiness | T7 | verify PASS；只迁移实际证据；Not Covered 保留 |

真实外部运行：`Not Applicable` 于本文，因为用户明确把 end/reassign/profile 证据分配给 RUNBOOK B；本文不修改 Host、route、bundle manifest 或 profile runner。数据库、事务、idempotency、recovery、migration：`Not Applicable`，因为本文只消费既有 V1 projection。metrics、Markdown、stress 和资源泄漏：`Not Covered`，已移出 FR-11 最小实现范围。

## 9. 完成定义

只有 T0-T7 全部 PASS、七个 section 和 controls/stale/refetch 全部满足、第 5 节字段没有补造、consumer/full verify 通过、readiness 仅记录实际证据、RUNBOOK B/metrics/Markdown/stress/profile 缺口继续保留，并完成删除后复验，才可关闭。

## 10. Author 全量 Audit

结论：`Executable`。

- Required Structure：状态、边界、目标、链路、断点、scope/non-goals、真相源、字段表、不变量、八个机械步骤、验证矩阵、readiness 和删除均齐全。
- Decision Completeness：每个字段固定 source、状态、排序、fallback、DOM、aria-label 和 selector；缺字段只省略对应行，不改协议。
- Implementation Economy：只新增一个由组件与测试直接消费的 Client-local mapper；不建立通用 renderer、组件库、依赖或 runner。出现第三消费者时必须 STOP 重审。
- 步骤颗粒度：T1 helper、T2 summary/activity、T3 transcript/blocking、T4 tasks/decisions/termination、T5 controls/stale、T6 focused/bundle、T7 full/closure，各自一个稳定语义单元。
- STOP：任何字段漂移、协议/Host 需求、范围外修改或验证失败均停止；没有产品 bug 修复分支或开放式“直接修复”。
- RUNBOOK A/B：A 的 Decision/Agenda 契约冻结；B 独占真实 DSH end/reassign/profile 证据。
- DSH Skill 影响：Client 双 program typecheck 与 bundle build 已列入 T6；真实 Web profile 明确由 B 覆盖，本文不重复建设 runner。
- readiness：只在 full verify PASS 后写实际日期/HEAD/命令/result，不预写 test count 或整项 FR 完成。
- Author 验证边界：本轮未实现代码、未运行产品 tests/full verify；这些属于 Execute。作者只运行链接、path/symbol 和 `git diff --check` 自审。

本 RUNBOOK 可交给弱 LLM 从 T0 开始执行。
