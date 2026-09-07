# RUNBOOK：用户端正式事实展示闭环

## 1. 状态与执行者契约

- 建立日期：2026-09-07。
- 模式：Author + Audit；本轮只交付本文，不执行 T0–T6。
- 作者基线：`main` HEAD `1dd23b318f41531d02f7d03d3d543edef8259071`，起始工作区干净。
- 作者分支：`codex/client-fact-visibility-runbook`；直接使用指定项目目录，不建立 worktree，不操作其他任务目录。
- 审计结论：`Executable`，仅指下述有界实施方案决策完备，不代表实现、测试或 Browser 已通过。
- 后续 Execute 必须取得用户明确授权；当前授权不包含产品代码、测试、共享 coverage/TODO 修改、commit、push、PR、真实模型或外部运行验证。

执行者只允许按 T0 → T6 顺序执行。每一步全部 PASS 后才能进入下一步；不得自行选方案、修改协议、引入依赖或补做相邻产品能力。STOP 时保留现场，报告最后 PASS 步骤、触发条件、文件/symbol、复现命令、实际输出及继续所需决定，不回滚用户改动，不放宽类型、Schema、测试或空值规则。

## 2. 目标、Scope 与 Non-goals

起点：后端已有正式事实，Client mapper/renderer 未完整消费。终点：现有 Meetings 面板只读显示当前 accepted decisions、全部 Decision history、Parking Lot、风险/归档 issues 及已公开原因；首次读取、轮询、重新聚焦和重新打开均从完整 DTO 得到相同事实。

完整链路：已提交 MeetingState → status/archive producer → loopback GET → consumer Schema → 完整 detail 替换 → mapper → sections → 用户读取及刷新验证 → 独立 readiness evidence。

| Scope ID | 固定行为 | 正式依据 | 实施 / 验证 |
| --- | --- | --- | --- |
| S1 | 当前 accepted 与全部 history 分区；保留撤销、替代及替代 ID | FR-10.1/6/7，FR-11.1/7；Decision And Risk Closure、Authorized status projection | T1 / V1 |
| S2 | 四阶段显示全部 Parking Lot 候选的 title/reason/status，不仅筛 parked | FR-11.1/7；Agenda candidate disposition 的 `parkingLot` | T2 / V2 |
| S3 | 活动/执行终态 risks 与归档全部 issues 的共用字段展示；保留原因、owner、任务引用 | FR-10.7，FR-11.1/5/7；Archive issue、风险处置契约 | T3 / V3 |
| S4 | 当前 Turn intent/reason/objective，保留 waiting/pause/termination 原因 | FR-11.1/5；设计 §17.4、§18.1 | T4 / V4 |
| S5 | 完整读取、刷新替换、错误缓存及终态只读不回归 | FR-11.6/7；设计 §17.3/17.4 | T4–T5 / V5–V8 |
| S6 | 长期证据、未覆盖边界和 RUNBOOK 删除 | RUNBOOK Rules、TODO Rules | T6 / V9 |

Non-goals：不新增写按钮、路由、权限、Session 调用、运行态字段、状态机、事件、持久化、通用 UI 框架、第三方组件、分页/搜索/筛选；不展开 proposals/positions/Question/CompletionFact 的完整 UI；不显示未公开的内部降级日志、私聊、隐藏推理或 capability。本文补齐上述确定断点，不宣称完成整个 FR-10/FR-11。无须修改正式需求或接口来迎合实现。

## 3. 当前断点与依据

| 声明 / 证据 | 当前实现 | 缺口与固定结论 |
| --- | --- | --- |
| `plugin/src/projection/status.ts::projectMeetingStatus` | discussion 返回 `decisionHistory`、`parkingLot`、`risks`；归档返回 `archive.package` | 数据已存在，不修改后端 |
| `plugin/src/client/meeting-panel-view.tsx::MeetingPanelView/mapMeetingPanelView` | 没有 history/parkingLot；`discussion` 在归档为 undefined；`risks` 回落为 `[]` | 增加两个只读数组，risks 使用归档 issues；不是创建第二份正式 projection |
| `plugin/src/client/meeting-panel-sections.tsx::renderObservabilitySections` | Accepted decisions 仅 statement/rationale/dissent；Risks 仅 title/status/disposition，空时 `No risks.` | 补身份/状态、history、Parking Lot 和 risk 原因/owner；归档不能因 mapper 丢字段显示空 |
| 同 mapper/renderer | Turn 只有计划 speaker 顺序，没有 intent/reason/objective | 直接读取公开 Turn 字段；禁止从日志或 transcript 推导原因 |
| `plugin/src/client/meeting-panel.tsx::ConviviumMeetingPanel` | `loadDetail` 校验成功后 `setDetail(validated.result)`；5 秒 polling、focus、写后 refetch | 已满足整体替换，无需修改此文件 |
| `plugin/tests/client/client-entry.client.spec.ts` | history/parkingLot/archived issues fixture 为空；现有 mapper-only archived Decision 缺 proposal 字段，waiting reason 非合法 enum | 补非空且 Schema 可解析的 fixture；不能只靠 mapper 直调证明 GET 消费链 |

### 关联真相源

- [Architecture](../00-governance/ARCHITECTURE.md)：Plugin Frontend、Dependency Rules。
- [Document Rules](../00-governance/DOCUMENT-RULES.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md)、[PR Rules](../00-governance/PR-RULES.md)。
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-10、FR-11。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：`PublicDecisionV1`、`PublicRiskV1`、Authorized status projection、`PublicArchiveIssueV1`、`PublicArchiveAgendaCandidateV1`、Agenda candidate disposition。该文结构片段未列 discussion `parkingLot`，但后文明确 required，源码类型与 Schema 已落实；使用该明确条款，不修改接口正文。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：§6.2.1、§6.3、§17.3/17.4、§18.1；[Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)：Client/Host faces、FR-7 实现职责。
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：仅作既有验证边界参考，本任务不编辑。
- [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md)：Reassign browser-ready 模式及 Restore。

DSH manifest 与 lockfile 均锁定 `0.1.1-rc.2`；现有 `plugin/src/client/index.tsx::apply(ctx: Context): void` 通过 `ctx.slots.inject("conversation.view", callback)` 注册 `id="convivium-meetings"`、`label="Meetings"`。slot owner 为 `@deepseek-ai/dsh-client-ui-conversation/client`，公开 `conversation.view` 是 session-scoped list；保持此入口和现有 createElement 写法。已使用 convivium-runbook、dsh-plugin-development（client-ui/testing references）及 right-size-changes 审计。

## 4. 数据、所有权与调用链

### 4.1 结构与逐字段映射

以下为当前公开结构中本次触达的字段；`?` 表示 optional，可缺省但不接受 null；其余 required。DTO 无前端业务默认值。展示 fallback 只是文本，不写回 DTO。

| 对象 | 精确字段 / 类型 | owner、来源和展示 |
| --- | --- | --- |
| `PublicDecisionV1` | `id: string; proposalId: string; proposalRevision: number; status: "accepted" \| "superseded" \| "revoked"; agendaItemId?: string; statement?: string; rationale?: string; acceptedBy?: readonly string[]; dissentingPositionIds?: readonly string[]; supersededByDecisionId?: string` | Runtime decisions；原样传给两区。history 包含 accepted，不筛成只有旧项。superseded 才携带 replacement ID；UI 不补造缺失字段 |
| `PublicArchiveAgendaCandidateV1` | `id/title/reason: string; status: "pending" \| "promoted" \| "parked" \| "rejected"` | Runtime agendaCandidates；后端按 createdAt/id 排序，UI 保留输入顺序；没有 owner/time 字段，不推导 |
| `PublicArchiveIssueV1`（源码类型） | `id/title/description: string; disposition: "blocking" \| "follow_up" \| "parking_lot" \| "accepted_risk" \| "out_of_scope"; status: "open" \| "waiting" \| "resolved" \| "accepted" \| "deferred" \| "accepted_risk" \| "out_of_scope"; rationale?: string; ownerId?: string; relatedTaskIds: readonly string[]` | 归档 issues 原样保留；`accepted` 不改为 `accepted_risk`。协议文字对历史状态有较窄片段，但保留已提交值的规则、源码类型与 Schema 均支持这些值 |
| `PublicRiskV1` | 上述共同字段；status 不含 waiting/accepted；另有 required `sourceMessageId: string; affectedOutputIds/affectedCriterionIds/violatedConstraintIds/blockingObjectionIds: readonly string[]; blocking/safeDefaultAvailable: boolean; impact/urgency/reversibility: string`，optional `agendaItemId: string; riskLevel: "low" \| "medium" \| "high"` | local status 的全部 issues；本轮 UI 仅消费与 ArchiveIssue 一致的字段，不伪造归档缺少的 active 字段。riskLevel 不在源码 ArchiveIssue 类型内，本轮不展示或修改该契约 |
| `PublicTurnV1` | required `id/agendaItemId/intent/reason/objective: string; seq: number; expectedOutputs/prohibitedTopics: readonly string[]; steps: readonly PublicSpeakerStepV1[]` | producer `turn()` 输出 `reason = value.reason ?? value.intent`；Client 使用返回的 reason，不重复 fallback 算法 |
| `PublicSpeakerStepV1` | required `id/participantId/instruction/reason: string; status: "pending" \| "assigned" \| "running" \| "submitted" \| "skipped" \| "revoked" \| "failed"` | 已有 plannedSpeakerOrder 只连接 participantId；保持不变 |
| 活动态控制 | `currentTurn?`；`waitState?` 的 required `reason` enum 为 blocking_task/required_participant_unavailable/captain_action，`waitingSince: number; taskIds/participantIds: readonly string[]`，optional `deadlineAt: number; resumeAgendaItemId: string`；`pauseControl.reason?: string`、pausedAt/pausedBy 沿既有类型 | 不改变 waiting/pause 展示及控制 |
| `PublicTerminationV1` | required `code/reason: string; decisionIds/unresolvedQuestionIds: readonly string[]` | execution-terminal/archiving/archived 均有；现有 Termination 原样保持，不补历史 Turn。执行终态额外 finalMessage/endedAt/dissentingPositionIds/blockingAgendaItemIds 不新增展示 |

新增/修改字段仅在 `plugin/src/client/meeting-panel-view.tsx::MeetingPanelView`，目标签名固定：

```ts
readonly decisionHistory: readonly PublicDecisionV1[];
readonly parkingLot: readonly PublicArchiveAgendaCandidateV1[];
readonly risks: readonly PublicArchiveIssueV1[];
readonly turnIntent: string;
readonly turnReason: string;
readonly turnObjective: string;
```

保留 `mapMeetingPanelView(detail: MeetingStatusResultV1): MeetingPanelView` 与 `renderObservabilitySections(detail: MeetingStatusResultV1): ReactElement` 签名。不新增 mapper/helper/component/framework。`PublicRiskV1` 结构上满足 `PublicArchiveIssueV1`，因此可直接赋值，只拓宽现有 view.risks 的合法 status 范围，不需要转换或断言。

| view 字段 | active / execution-terminal | archiving / archived |
| --- | --- | --- |
| acceptedDecisions | `discussion.acceptedDecisions` | `archive.package.acceptedDecisions` |
| decisionHistory | `discussion.decisionHistory` | `archive.package.decisionHistory` |
| parkingLot | `discussion.parkingLot` | `archive.package.parkingLot` |
| risks | `discussion.risks` | `archive.package.issues`（全部，不过滤） |
| turnIntent/turnReason/turnObjective | 仅 active 从 `active.currentTurn` 读取；无 Turn 用 `None` | `None`，不得保留上次活动态值 |

以上数组遵循现有 `discussion?.field ?? archivePackage?.field ?? []` 模式；合法四阶段 DTO 对应数组必填，不把 missing required 视为真实空数组。`readStatus` 失败沿既有缓存错误路径，不进入 mapper。数组不原地 sort、不合并缓存；只有 transcript 沿现有拷贝后 seq 排序。

### 4.2 全链路与持久化边界

1. Runtime commands 在 `MeetingRepositoryPort.execute` 内提交 state/events/receipt/outbox；决策替代先 replacement `decision.accepted` 后旧 `decision.superseded`，撤销 `decision.revoked`。既有版本、requestId、actor、ID 生成与权限由后端拥有，本轮不新增 caller 输入。
2. `plugin/src/runtime/services/meeting-archive-service.ts::recoverArchive` → `beginArchiveFromTermination` → `materializeArchivePackage(state, materializedAt)`，复制 decisions、issues、agendaCandidates；domain `plugin/src/domain/transitions/archive.ts::assertArchivePackageMatchesMeeting/snapshotArchive` 验证并复制。cleanup/revoke 完成后 `finalizeArchive` 才进入 archived。Client 不触发或重算该状态机。
3. `plugin/src/runtime/application-service/meeting-query.ts::createMeetingQueryApplication().getLocalMeetingStatus` 从 recovery snapshot 读当前真相，调用 `projectMeetingStatus(state, {kind:"local_host", sessionId:"loopback-web"})`，运行 `MeetingStatusResultSchema` 后返回 commandSuccess。
4. `plugin/src/http/index.ts::registerLocalMeetingHttpRoutes` 的 GET `/api/convivium/meetings/:meetingId` 再校验 success envelope；route registration 保留既有 loopback gate。
5. `plugin/src/client/meeting-panel.tsx::readStatus` → `loadDetail` → `setDetail` → `renderObservabilitySections` → `mapMeetingPanelView`。网络/Schema 失败沿现有 `Meeting data is unavailable.`、data-cached、禁止写操作路径；不清空已成功事实。
6. 相同 GET 或页面重挂载只产生同一个展示结果；meetingVersion、ID、时间、actor 均来自已验证 DTO。不新建客户端业务状态、缓存、事件或持久副本。

数据库迁移、request hash/幂等键生成、receipt/outbox 修改、事务回滚实现、跨版本写兼容：`Not Applicable`，本次只读 UI 没有写入或新增协议。归档 optional 字段兼容通过省略对应展示行处理，不能填造历史事实。已有状态/事件/receipt/outbox 的正确性由原测试及全量 verify 保持，不宣称 Client 测试能验证数据库事务。

## 5. 文件与不变量

生产允许文件精确为两个：`plugin/src/client/meeting-panel-view.tsx`、`plugin/src/client/meeting-panel-sections.tsx`。测试仅 `plugin/tests/client/client-entry.client.spec.ts`。`meeting-panel.tsx` 已核对为无需修改，列入禁止修改；若测试证明必须改，STOP 并报告新增范围。

后续 T6 仅允许新增 `docs/40-readiness/CLIENT-FACT-VISIBILITY-EVIDENCE.md`，修改 `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md` 的 Client 展示职责说明，并删除本文。共享 coverage/TODO 由原任务整合，本文不修改。没有其他新增文件或生成物允许手工编辑。

不变量：正式事实只能来自 DTO；accepted/history 不互相替代；history 中 revoked/superseded 不得出现在当前 accepted 区；Parking Lot 不筛状态；归档 risks 保留全部 issues 和其原始状态；原因只显示已公开字符串；缺失 optional 不等于“无异议/风险已接受”；Decision.rationale 只标作决策自身理由，不标作撤销/替代操作原因，后者的 CompletionFact 展示不在本轮范围；当前 activity 不能跨终态残留；视图新增部分不得含 button/input/select、fetch、dangerouslySetInnerHTML、Session 或文件访问。所有内容通过 React 文本子节点渲染。

## 6. 固定测试数据

所有新增 helper 仅位于现有 client spec。不得导入 domain/runtime 来构造 Client fixture。

- 将 `statusResult` 返回类型收窄为其实际类型 `ActiveMeetingStatusResultV1`，`terminalStatusResult` 显式标注 `ExecutionTerminalMeetingStatusResultV1`；构造前从 active 基础对象解构移除 currentTurn/currentSpeakerId/currentAttemptId/waitState/stallCount/maxStalls/replanCount/maxReplans，仅将其余字段展开到 terminal，避免可选 active 字段污染终态类型；不改变已有正常控制 fixture 行为。修复现有 mapper-only waiting fixture 为 `reason="blocking_task"`、`waitingSince=100`，对应期望同步；现有 archive Decision 补 `proposalId="proposal-1"`、`proposalRevision=1`。
- 新增 `factDecisions(): PublicDecisionV1[]`，顺序固定为 d-old、d-revoked、d-current。各项 proposalId 为 p-old/p-revoked/p-current，proposalRevision=1，statement 为 `Old decision`/`Revoked decision`/`Current decision`，rationale 为 `Old rationale`/`Revoked rationale`/`Current rationale`，agendaItemId=agenda-1，acceptedBy=[participant-one]，dissentingPositionIds=[position-dissent]。status 分别 superseded/revoked/accepted；仅 d-old 带 supersededByDecisionId=d-current。acceptedDecisions 仅第三项。
- 新增 `factParkingLot(): PublicArchiveAgendaCandidateV1[]`：顺序 pending/promoted/parked/rejected，各项 id=`candidate-` 加 status，title=`Topic ` 加 status，reason=`Reason ` 加 status。不可只用 parked。
- 新增 `factRisks(): PublicRiskV1[]`：依次 id=risk-accepted/risk-follow-up/risk-out；title=`Risk accepted`/`Risk follow-up`/`Risk out`；description=`Description ` 加 id；status=accepted_risk/deferred/out_of_scope；disposition=accepted_risk/follow_up/out_of_scope；rationale=`Rationale ` 加 id；ownerId=participant-one；relatedTaskIds=[task-follow-up]。其余 required 公共字段固定 sourceMessageId=message-evidence，四个影响/约束/异议数组=[]，blocking=false，impact=bounded，urgency=later，reversibility=reversible，safeDefaultAvailable=true；agendaItemId/riskLevel 省略。
- 新增 `factStatus(status: ActiveMeetingStatusResultV1["status"]): ActiveMeetingStatusResultV1`：基于 `statusResult("running", 2, true)`，覆盖以上三组事实，status 按参数；paused 使用现有 paused metadata，created/running/waiting 的 pause action=pause，converging=none；waiting 分支明确移除 currentTurn/currentSpeakerId/currentAttemptId，pauseControl 固定 `{action:"pause"}`，waitState 固定 `{reason:"blocking_task",waitingSince:100,taskIds:[],participantIds:["participant-one"]}`；其他分支不带 waitState。非 waiting 分支的 Turn 固定 intent=refocus、reason=`No progress; refocus on the agenda`、objective=`Resolve remaining blockers`，其他 Turn 字段复用基础 fixture。
- 新增 `factTerminalStatus(status: ExecutionTerminalMeetingStatusResultV1["status"]): ExecutionTerminalMeetingStatusResultV1`：从 `terminalStatusResult()` 覆盖 status 及三组事实；termination.code=status、reason=`Budget exhausted`、decisionIds=[d-current]；其他 termination 字段沿原 fixture。禁止 currentTurn/currentSpeakerId/currentAttemptId，pending candidates=[]。
- 新增 `factArchiveStatus(status: "archiving" | "archived"): ArchivingMeetingStatusResultV1 | ArchivedMeetingStatusResultV1`：以现有 archive fixture 的合法完整结构提取；meetingVersion=6，accepted/history/parkingLot 同上，issues 包含 factRisks 的全部公共共用字段（不复制 active 专属字段），并追加 `{id:"issue-waiting", title:"Waiting issue", description:"Awaiting owner", disposition:"follow_up", status:"waiting", relatedTaskIds:[]}`。formalTranscript 保留现有非空 archive-message-1；termination.reason=`Budget exhausted`、decisionIds=[d-current]，顶层和包内一致；archivedAt=300 仅 archived 存在，endedAt=200、materializedAt=250。无 active 字段或顶层 discussion 数组。

### 刷新专用不同事实版本

新增 helper `refreshFactStatus(stage: "active" | "terminal" | "archived"): MeetingStatusResultV1`，仅位于同一 client spec，使用下列唯一规则，不修改前述全生命周期基础 helper：

- active：直接返回 factStatus(running)，version=2，三条 history/四条 Parking Lot/三条 risks 均为 §6 原值。
- terminal：从 factTerminalStatus(partial) 构造，version=5。history 精确为 d-old、d-current 两项（删除 d-revoked）；d-current 的 statement/rationale 改为 `Current decision v5`/`Current rationale v5`，其他字段沿 §6；acceptedDecisions 仅该更新后的 d-current。Parking Lot 精确为 candidate-pending、candidate-parked；前者 title/reason 改为 `Topic pending v5`/`Reason pending v5`，status 仍 pending；后者沿 §6；删除 promoted/rejected。risks 精确为 risk-accepted、risk-follow-up；前者 title/rationale 改为 `Risk accepted v5`/`Rationale risk-accepted v5`；后者沿 §6；删除 risk-out。termination.decisionIds=[d-current]。
- archived：从 factArchiveStatus(archived) 构造，version=6；只覆盖 archive.package 中对应数组及下列 termination。history 精确为 d-current、d-final：d-current 从 v5 记录改为 revoked，statement/rationale 改为 `Current decision revoked v6`/`Current rationale v6`，不带 supersededByDecisionId；d-final 固定 `{id:"d-final",proposalId:"p-final",proposalRevision:1,status:"accepted",statement:"Final decision v6",rationale:"Final rationale v6",agendaItemId:"agenda-1",acceptedBy:["participant-one"],dissentingPositionIds:[]}`。acceptedDecisions 仅 d-final；d-old/d-revoked 不存在。Parking Lot 精确为 `{id:"candidate-parked",title:"Topic promoted v6",reason:"Reason promoted v6",status:"promoted"}`、`{id:"candidate-final",title:"Final follow-up v6",reason:"Deferred for next meeting",status:"parked"}`，不保留 candidate-pending/promoted/rejected。issues 精确为 `{id:"risk-follow-up",title:"Follow-up resolved v6",description:"Follow-up complete",disposition:"follow_up",status:"resolved",rationale:"Resolved after review",ownerId:"participant-one",relatedTaskIds:["task-follow-up"]}`、`{id:"issue-final",title:"Final issue v6",description:"Remaining follow-up",disposition:"follow_up",status:"open",relatedTaskIds:[]}`；不保留 risk-accepted/risk-out/issue-waiting。顶层与 archive.package.termination.decisionIds 都设为 [d-final]，其他归档字段沿基础 fixture。

刷新断言必须 scope 到各 section，并比较完整条目 ID 数组及每个条目的文本，不只检查全页面包含字符串；旧文本消失使用对应行 dd.textContent 的精确不相等或 exact:true 的文本查询，不用子串判断（v5 文案包含 v2 的前缀）：v5 的 d-revoked、candidate-promoted/rejected、risk-out 消失，d-current/candidate-pending/risk-accepted 更新文本可见且其 v2 文本不再出现；v6 的 d-old、candidate-pending、risk-accepted 消失，d-current 状态变 revoked、d-final 只在 accepted 区成为当前项，candidate-parked 变 promoted、risk-follow-up 变 resolved。旧 v5 statement/rationale/title 必须消失；最终非空新增 d-final/candidate-final/issue-final 必须可见。各阶段前后保存输入 JSON，断言 mapper/render 未改写 fixture。

每个新增完整 fixture 都必须执行 `MeetingStatusResultSchema(JSON.parse(JSON.stringify(value)))` 并断言不抛错，HTTP mock 使用 `success(value, value.meetingVersion)` 包装。`satisfies` 或 helper 显式返回类型不能替代运行期校验：当前 vitest 不检查 TS 类型，client tsconfig 排除了 tests。

## 7. 机械执行步骤

全部 shell 命令从仓库根执行；不得照抄到其他目录。

### T0：基线与授权门禁

前置状态：用户已授权 Execute；Author 阶段不得执行本节。
允许修改：无。
禁止修改：所有文件、分支历史和其他目录。

执行：读取 §3 治理文档与技能；核对当前独立 codex/ 分支，不切回 main。只允许作者基线加本文这一文档差异；基线变化必须 STOP 交给作者重审，不 reset 或寻找替代符号。记录开始时 tracked/untracked 状态；任何允许文件已有他人改动都 STOP。

验证：
```sh
git branch --show-current
git rev-parse HEAD
git status --short
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
```
PASS：基线/范围符合上述条件，现有 client suite 退出码 0。
STOP：授权缺失、基线改变、冲突或测试失败；报告输出，不开始 T1。无运行时副作用，无需数据库恢复。

### T1：当前决策与历史决策

前置状态：T0 PASS。
允许修改：两个生产文件及现有 client spec（§5）。
禁止修改：Parking Lot、风险、activity、刷新和写控制逻辑。

执行：
1. view 增加 decisionHistory 数组并按 §4.1 映射。
2. Accepted decisions 保留原区名/空文案/顺序；每条先显示 `Decision ID`、`Status`、`Proposal ID`、`Proposal revision`，再显示既有 statement/rationale/dissent 行，新增 optional `Accepted by`、`Agenda item` 行。
3. 在 Accepted decisions 后、Pending decisions 前新增 section，aria-label/h4 均为 `Decision history`。说明文本精确为 `All decisions, including current accepted, superseded and revoked decisions.`；空时 `No decision history.`。每项 key=id、data-decision-id=id，行与 accepted 区相同，末尾在 replacement 字段存在时显示 `Superseded by`。两区独立行结构，不抽公共 renderer。
4. 字符串 optional 缺失时不渲染该行；optional 数组缺失时不渲染，存在但空时显示 `None`，非空 `join(", ")`；revision 用 String。所有 ID 可见，缺 statement 的旧记录也可辨认。
5. 按 §6 建 helper 和修复两个旧 mapper-only fixture；加入测试 `fact visibility: decisions across lifecycle`，对全部 12 个 status 检查 Schema、mapper 全数组及真实 panel DOM。accepted 区只有 d-current，history 依序三项、状态、rationale、replacement ID 均可见；Pending decisions 不与正式历史混合。另测去掉全部 optional 字段后仍显示 ID/status/proposal，缺行不伪造。

验证：
```sh
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts -t 'fact visibility: decisions'
pnpm --dir plugin typecheck:client
```
PASS：退出码均 0；指定测试确实运行，三项历史与当前一项区分成立，旧 fixture 通过 Schema。
STOP：解析或映射丢字段、需要修改协议/后端、测试被跳过或失败。保留未通过改动，不进入 T2，不回滚已有正式事实。

### T2：后续议题 Parking Lot

前置状态：T1 PASS。
允许修改：两个生产文件及现有 client spec。
禁止修改：后端候选处置、Task 模型、Decision 语义、写控制。

执行：view 增加 parkingLot 映射；在 Meeting tasks 后、Accepted decisions 前新增 `Parking Lot` section（aria-label=h4），说明 `All agenda candidates and their current disposition.`。空文案 `No parking lot items.`。非空 ol/li，key=id、data-candidate-id=id，固定行 `Candidate ID`、`Title`、`Reason`、`Status`。不筛状态、不重排。新增 `fact visibility: parking lot across lifecycle`，全部 12 个 status 均用非空 fixture 断言四项顺序、全部 title/reason/status；独立空 fixture 只显示空文案。

验证：
```sh
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts -t 'fact visibility: parking lot'
pnpm --dir plugin typecheck:client
```
PASS：两个命令退出码 0，四种处置在归档前后均保留。
STOP：缺候选、改排序、引入 owner/default 状态、断言失败；保留工作区，不执行下步。

### T3：风险与归档 issues

前置状态：T2 PASS。
允许修改：两个生产文件及现有 client spec。
禁止修改：风险接受/撤销 command、归档类型、riskLevel、blockingFacts 推导。

执行：
1. view.risks 类型改为 §4.1 的 `readonly PublicArchiveIssueV1[]`，归档从 issues 读取；移除不再使用的 PublicRiskV1 import，加入对应公开类型。直接赋值，不做 active-field 伪造或类型断言。
2. Risks 保留 aria-label/h4；归档时增加说明 `Archived issues and risks.`。每项 key=id、data-risk-id=id；固定行 `Issue ID`、`Title`、`Description`、`Status`、`Disposition`，optional `Rationale`、`Owner`，required `Related task IDs`（空为 None）。所有状态/处置原样显示。
3. 空数组在活动/执行终态为 `No risks.`，在归档两态为 `No archived issues or risks.`。非空任何状态均不得显示空文案。
4. 新增 `fact visibility: risks across lifecycle`，全部 12 个 status 使用 §6；归档四项含 waiting；补 parameterized archived issue 状态 accepted、resolved、open 检查原样显示。去掉 rationale/owner 后可渲染且缺对应行；relatedTaskIds=[] 为 None。风险接受/后续事项/范围外理由与 owner、task ID 均可见。

验证：
```sh
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts -t 'fact visibility: risks'
pnpm --dir plugin typecheck:client
```
PASS：退出码均 0；归档含 issue-waiting 且没有 No risks 假空态，optional 缺失无伪造。
STOP：需要把 ArchiveIssue 转成 PublicRisk、过滤掉非 open 或非 risk disposition 项、修改后台状态/Schema，或验证失败。只停止，无运行态回滚。

### T4：原因展示与刷新一致性

前置状态：T3 PASS。
允许修改：两个生产文件及现有 client spec。
禁止修改：meeting-panel.tsx、轮询周期、cache/error/写控制、后端原因规则。

执行：
1. view 增加 turnIntent/turnReason/turnObjective，仅从 active.currentTurn 读，缺 Turn 用 None。Current activity 在 Planned speaker order 前添加 `Turn intent`、`Turn reason`、`Turn objective` 三行。
2. 新增 `fact visibility: activity reasons across lifecycle`：created/running/paused/converging 的 fixture 有 Turn 时显示三字段；waiting 使用 §6 明确无 Turn 的分支，显示 None 且保留 blocking_task；paused 显示 Inspect output 和 loopback-web；终态两族显示 None 且 Termination 含 Budget exhausted；converging 显示 refocus 和完整 reason。该测试只证明已公开原因，不声称展示所有历史降级事件。
3. 新增 `fact visibility: full refresh and reopen`：以路径分发 fetch mock 的 list/detail，首次为 refreshFactStatus(active)，focus 后返回 refreshFactStatus(terminal)（version=5），推进 5000ms 后返回 refreshFactStatus(archived)（version=6）。每个阶段执行“刷新专用不同事实版本”的完整 ID/文本更新及旧项消失断言，核对 summary version 和非活动 Turn 值消失；unmount 后重新 render/select，从同一个最终 archived DTO 重建完全相同 section 文本与条目 ID，不能重新使用基础 factArchiveStatus。fake timers 遵循现有 cleanup/useRealTimers。
4. 新增 `fact visibility: malformed refresh preserves cached facts`：每个参数用例首读 refreshFactStatus(active)。三个非法 payload 唯一取值分别为该 active JSON 删除 decisionHistory、该 active JSON 删除 parkingLot、refreshFactStatus(archived) JSON 删除 archive.package.issues；focus 返回该 payload 后，等待 alert 和 data-cached=true，完整 v2 ID/文本保持不变，现有写控件 disabled。下一次 focus 固定返回合法 refreshFactStatus(archived)（version=6），核对最终精确 ID/文本及 v2 删除项消失，缓存标记/alert 消失且 Turn 为 None，不能只改 version。
5. 新增 `fact visibility: rendering is read only`：scope 到新 sections 与 Risks，断言没有 button/input/select；其读取和刷新仅发 GET。所有 execution-terminal/archiving/archived 无 Pause/Resume/Skip/End。加入 statement 为 `<img src=x onerror=alert(1)>` 的 literal 文本样本，断言显示原字符串、无 img 节点。将既有 `keeps writes exclusive and refetches status after a successful write` 的首次 detail 改为 factStatus(running)、写后 detail 改为 factStatus(paused) 且 meetingVersion=3/envelope=3，断言三组非空事实仍完整以及 paused 的原因；保留原请求 payload、独占、POST 次数断言。保留失败不自动重试 POST、polling/unmount 测试。

验证：
```sh
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```
PASS：整个 client entry suite 与 client typecheck 退出码 0；新测试全部运行；刷新无旧 activity 残留，失败缓存保留且恢复后整体替换。
STOP：需要更改 fetch/generation/缓存架构或新增运行字段，或任何原测试失败；报告最小复现，不扩大范围。

### T5：完整验证与真实 Browser

前置状态：T4 PASS；后续执行时另已获外部 smoke/Browser 授权。当前 Author 轮一律不运行。
允许修改：本文的执行结果记录；三个允许代码文件仅可由下列 Prettier 命令格式化，不作语义改动。
禁止修改：smoke selector、profile 组合、dev.env 内容、其他任务目录。

执行：
1. 对三个允许代码文件运行固定格式化命令后运行完整 verify；格式化不得触及其他文件。
2. 按 §8 Browser Prepare/Execute/Assert/Restore 完成实际 DSH 组合只读观察；失败保留记录并 STOP。非空 history/Parking Lot/archived issues 的真实 Browser 链路固定为 Not Covered，不能用 reassign 空 fixture 推断通过，也不自行扩展 smoke。

验证：
```sh
pnpm --dir plugin exec prettier src/client/meeting-panel-view.tsx src/client/meeting-panel-sections.tsx tests/client/client-entry.client.spec.ts --write
pnpm --dir plugin verify
git diff --check
```
PASS：命令全部退出码 0，verify 的 format/lint/Host+Client typecheck/test/build/environment/contract/agent-definition/package 均通过；Browser §8 所有断言和 Restore PASS，记录明确的 Not Covered。
STOP：完整验证或 Browser 失败、环境/凭据缺失、未授权外部运行；保留 RUNBOOK，不用单测代替 Browser。格式变化如果影响测试，重新运行完整 verify 后再判定。

### T6：证据迁移与删除

前置状态：T0–T5 全部 PASS；共享覆盖由原任务整合，不在此操作。
允许修改：§5 指定独立 evidence、Implementation Design 的 Client 展示职责段落、本文。
禁止修改：正式 requirements/interfaces、共享 coverage/TODO、其他任务文件、Git 历史。

执行：
1. 新增独立 evidence，固定 headings 为 Scope、Validated Contract、Executed Validation、Not Covered、Closure；记录执行日期、起止 HEAD/工作区边界、命令/退出码、逐 V 项结果、Browser marker/观察/cleanup，明确非空三组事实只有 component/Schema 证据，未跑真实非空 Browser 与真实模型。
2. 在 Implementation Design 增加一个 Client fact visibility 段落，迁移四阶段映射、accepted/history 区别、归档 issues 原样读取、仅展示公开原因与完整 detail 替换的稳定结论，引用协议而不复制 DTO。本文不产生新需求、接口、操作入口或 README API，因此无需修改这些文件。
3. 检查本文文件名及标题引用；只有本文自引用时才能删除。发现其他文件引用则 STOP 交由原任务处理，不越过允许列表修改。先执行 §9 链接检查、git diff --check；通过后删除本文，再执行同样检查。删除后检查失败恢复刚删除的本文并 STOP；不得覆盖用户文件。
4. 向原任务交付 evidence 路径及真实未覆盖列表用于总 coverage 整合。未整合不由本任务宣称全项目完成。

验证：
```sh
test -s docs/40-readiness/CLIENT-FACT-VISIBILITY-EVIDENCE.md
rg -n 'RUNBOOK-CLIENT-FACT-VISIBILITY|RUNBOOK：用户端正式事实展示闭环' docs TODO.md AGENTS.md
git diff --check
```
PASS：evidence 覆盖 V1–V9；长期结论已迁移；删除前引用只有本文，删除后 rg 无匹配（退出码 1 为预期）；链接检查与 diff check 为 0。完整 verify 结果必须来自 T5 最新代码。
STOP：证据缺失、其他引用、迁移扩大产品范围或删除后检查失败。保留/恢复本文，不能标 completed 或改名 archive。

## 8. 验证矩阵与 Browser 计划

| ID | 范围 | 预期结果 / 入口 |
| --- | --- | --- |
| V1 | S1，12 种 status，非空与 optional 缺失 | T1：当前仅 d-current；history 三项、状态和替代关系正确；缺 optional 不造事实 |
| V2 | S2，候选边界与排序 | T2：四种处置全部存在且顺序不变；空 fixture 有唯一空提示 |
| V3 | S3，active/terminal/两归档态 | T3：风险原因、owner、任务可见；所有 archived issue 原样，非空无假空提示 |
| V4 | S4，降级/收敛和终态 | T4：已提交 intent/reason/objective 可见；等待/暂停/终止原因保留；无 Turn 为 None |
| V5 | S5，刷新/reopen、projection/archive 一致性 | T4：HTTP JSON→Schema→panel 非空字段不丢；focus/poll/reopen 替换完整 DTO，无缓存混合 |
| V6 | S5，非法输入与失败 | T4：缺 required 数组进入缓存错误，保留上次事实并禁写，成功恢复清标记 |
| V7 | S5，authority/terminal/read-only | T4：仅消费 local 公共 DTO，无新写入口；terminal 无现有写控件；文本不执行 HTML |
| V8 | S5，full verification 与真实组合 | T5 verify 全部通过；Browser 按下方有限覆盖范围 PASS，不能升级其证据范围 |
| V9 | S6，文档与收口 | T6/§9：路径、链接、symbol、范围、自审、diff 检查通过；迁移后删除本文 |

stale version 写拒绝、相同请求重放、idempotency conflict、数组部分非法 command 原子性、transaction rollback、receipt/outbox 恢复：`Not Applicable` 于新增只读 mapper/renderer，无 command 或事务变更；保留原 suite 并通过 verify。Client malformed payload 不做部分合并由 V6 验证。Host restart/cold recovery 本轮未新增验证；页面 reopen 不等于 Host recovery。

### Browser Prepare

只使用 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md) 的现有 Reassign browser-ready 模式。先通过 T5 verify；确认该文 dev.env/临时 profile 前置条件已经满足，不读取或打印密钥，不改常用 profile。获取 Browser 工具实际能力后使用真实 UI；没有 Browser 能力立即 STOP。

```sh
env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

等待该 operations 文档的完整 ready 条件（ok/profile/provider、browserReady、browser-reassign-ready、固定 Captain ID、oldAttemptId/currentAttemptId 一致、唯一 URL/临时根 marker）。记录输出给出的 URL、精确临时根和 wrapper session 标识；禁止猜端口/路径。5 分钟 attempt 窗口失效时 STOP 并执行 Restore；重新验证必须重新启动完整命令。

### Browser Execute / Assert

1. 打开 marker URL，选择 `convivium-smoke-captain` Session，再选择 label=`Meetings` view，再选择 `Runtime smoke (running)`。面板未出现/slot 激活错误即 STOP，不改导航。
2. 只读观察：Current activity 包含 `Turn intent`=`explore`、`Turn objective`=`Reassign A to B`；`Turn reason` 非空且不是 None。使用该页面实际 GET response 的 `result.currentTurn.reason` 逐字核对 reason，不预猜后端选择文案。读取 response 只作比较，不可用 response 代替 UI。
3. 当前 fixture 的 Accepted decisions/Decision history/Parking Lot/Risks 应为空；检查新两个区块和各自固定空文案存在，且新区域没有写控件。记录这是空态组合证据。
4. 刷新真实页面，重新选择同一 Session/view/Meeting，重复第 2–3 项。记录可见文本、截图、console 中有无 bundle 错误；只要超时令 fixture 改变就 STOP，不更改预期来迁就结果。
5. 不点击 Skip/Pause/End，不创建非空数据，不调用模型。这个检查证明实际 built bundle 的 slot/组件和完整读取能显示新增行及空态；**不证明非空决策历史、Parking Lot、归档 issues 的真实 Browser 端到端链路，也不证明真实降级/收敛被触发**。上述非空行为由 V1–V6 的 component/Schema 覆盖，readiness 必须保留这项限制。

### Browser Restore（成功或失败都执行）

向记录的 wrapper session 发送一次 Ctrl-C，等待退出及 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。再在执行记录中将实际 marker 路径存为任务专用 `client_fact_temp_root`，只对该精确路径执行 `test ! -e "$client_fact_temp_root"`。该变量必须直接来自唯一 marker，未取得时 STOP，不使用示意路径或 glob 删除。关闭本次新开的 Browser tab，原有 tab 保留。缺 marker、进程未退出、路径仍存在均 Restore FAIL，保留日志、精确路径，不手动扩大清理范围。

## 9. 作者检查、链接检查与 Audit

仓库没有独立文档链接脚本；现有 Governance job 只检查治理结构和 diff。固定采用下面只读检查（仓库根，Author 和 T6 都可执行，包含删除后的情况）：

```sh
python3 - <<'PY'
from pathlib import Path
import re
paths = [Path('docs/30-designs/RUNBOOK-CLIENT-FACT-VISIBILITY.md'),
         Path('docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md'),
         Path('docs/40-readiness/CLIENT-FACT-VISIBILITY-EVIDENCE.md')]
checked = 0
for path in paths:
    if not path.exists():
        continue
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        assert (path.parent / target.split('#')[0]).exists(), (path, target)
        checked += 1
print(f'PASS: {checked} local link targets')
PY
git diff --check
```

作者必须另外用 `rg -n` 核对本文既有 source path 与 symbol；§6 明确标注的是计划新增 helper，不能误报缺失。全量逐项 Audit：

| 检查 | 结论 |
| --- | --- |
| RUNBOOK 适用性 | 跨 mapper、renderer、四生命周期、Schema、缓存和实际 Browser 证据边界，非单行局部任务 |
| Required Structure 1–10 | §1–§9 完整：状态/契约/起终点/断点/scope/数据链路/不变量/步骤/矩阵/迁移删除 |
| 数据与 ID/actor/time/version | §4 逐字段、optional、source、归档差异明确；无新身份或时间生成 |
| 文件/symbol/函数签名 | §3–§7 固定；排除 meeting-panel.tsx 和后端；新增 helper 唯一位置 |
| 调用链/错误/恢复 | 完整读取→Schema→替换→mapper→renderer；malformed 缓存；Browser finally/删除恢复明确 |
| 最小方案 | 现有 view 数组和 sections 局部扩展，复用结构兼容的 ArchiveIssue；无新运行态或框架 |
| 步骤颗粒度与顺序 | T1–T4 各单一展示语义及聚焦验证；每步允许/禁止/动作/命令/PASS/STOP 齐全 |
| scope 双向追踪 | §2 的每个 S 均映射 T/V，所有实施动作由对应 S 授权；不展开正式能力全集 |
| 验证边界 | 成功、空态、optional、非法响应、只读/终态、刷新均覆盖；事务类标 N/A 并说明原因 |
| 真实 Browser | 固定已有入口及有限证据；非空真实端到端明确 Not Covered，不伪造 selector 或 mock GUI |
| readiness/删除 | 独立 evidence 固定路径与字段；共享 coverage 原任务负责；删除前后检查及恢复门禁 |

作者实际检查记录（2026-09-07）：起始 HEAD 与交接一致、工作区干净；在独立 codex/ 分支新增本文；读取治理、正式依据、实际 mapper/renderer/controller、protocol types/schema、producer、archive/HTTP 链路、client fixtures、vitest/package 入口及 Browser harness。实际链接检查通过（22 个本地链接目标）；本文既有 source/test/config 路径检查通过（10 个）；既有 symbol/入口已逐项用 rg 核对（24 项通过）；git diff --check 通过，并对未跟踪新文件单独运行 git diff --no-index --check。未运行任何 T 步骤、产品 tests/typecheck/build/verify、smoke、Browser 或真实模型；这些均为本次 Author 的 Not Covered，不记作实施 PASS。

缺失决定：当前限定实施范围无未决产品/技术选择。若要求非空四阶段事实必须在真实 Browser 全链路证明，现有 reassign browser-ready fixture 不满足，属于新增验证范围；执行者必须 STOP 请求单独授权并由作者固定 fixture/harness 方案，不得自行扩展本 RUNBOOK。

本轮交叉审查修订：接受 C 的两项 P2 意见；waiting fixture 显式移除 Turn/attempt 三字段，刷新与非法恢复使用 v2/v5/v6 的不同事实集合并断言更新、删除和旧文本消失。仅修订本文，不执行实施步骤。
