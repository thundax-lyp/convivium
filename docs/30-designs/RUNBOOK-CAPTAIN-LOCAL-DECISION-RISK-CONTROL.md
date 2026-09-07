# Captain/local 决策与风险控制闭环 RUNBOOK

## Status And Work Boundary

- Author/Audit 状态：`Executable`；产品执行状态：未开始。
- 建立与修订日期：2026-09-07；代码调查基线：`b4bed41634d4600e460040b1b93895b42c9671ac`。
- 确认来源：本任务中用户在“本地用户可执行五种操作；风险完成重算沿用现状、进入 converging、不自动结束；只同步正式文档并重新 Author/Audit”的说明后回复“同意”。P1/P2 已确认，原 B1/B2 不再是待决问题。
- 当前授权：同步正式需求/契约/设计、Author、Audit；本轮不执行产品实现、测试、smoke、commit、push 或 PR。`Executable` 只表示后续执行步骤决策完备，不表示代码已完成，也不是本轮 Execute 授权。
- 后续执行在 `codex/local-decision-risk-control` 独立分支；按 T0 处理本轮文档工作树，不覆盖用户改动。不得自动合并。

## Executor Contract

按 T0→T1→T2→T3→T4→T5→T6→T6B→T7→T8 顺序执行；每步 PASS 后才能进入下一步。只有一个允许的实现，不自行选择 actor、接口、权限、状态、持久化或失败语义。代码基线、指定文件/符号或正式契约不符时 STOP，报告最后 PASS、触发项、文件/symbol、最小复现命令及实际输出；不得改 RUNBOOK 后自行绕过。

禁止伪造 Captain Session、把 local user 转成 Participant、由自然语言推断批准、绕过 HTTP 直接从 Client 调 Runtime；禁止新增 dependency、service/provider、dispatcher、registry、adapter、feature flag、队列、数据库、migration、第二事实源或相邻能力。保留用户改动，不 reset/clean，不放宽 Schema/断言/类型来换 PASS。

所有步骤禁止运行 `smoke:profile`、`verify:runtime` 和直接启动 smoke Host。T6B 仅修改既有夹具并以 fake runtime 运行单测，不启动真实 Host。真实 DSH/Browser smoke 由协调者合并后统一执行，历史 evidence 不计本次结果。当前仍仅执行本文的 Author/Audit。

治理依据：[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[RUNBOOK Skill](../../.agents/skills/convivium-runbook/SKILL.md)、[Architecture](../00-governance/ARCHITECTURE.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md)、[Commit Rules](../00-governance/COMMIT-RULES.md)、[PR Rules](../00-governance/PR-RULES.md)。

## Goal, Scope And Current Breakpoints

终点：选 Meeting → 在对象行点击动作 → 单表单填写理由/核对证据（替换再选候选）→ 三个 loopback HTTP command → 独立 local 来源 → 既有 domain transition → 单 repository commit → 类型化结果 → 全量 GET 刷新；恢复与归档保留同一事实。Captain tool 保留真实 Session 权限。

| Scope | 正式依据 | 基线断点 / 文件与 symbol | 实施 / 验证 |
| --- | --- | --- | --- |
| S1 正式权限、输入、审计、事件 | [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-7、FR-8.9、FR-11.9、BR-6、Acceptance；[Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) Local decision and risk control、Control command payloads、Authorized status projection、Caller binding、Permission matrix | 本轮已同步；代码还没有 local 五动作 | T0、T8 / V0、V8 |
| S2 三种 Decision 和两种 Risk 本地写入 | [Domain Model](./DOMAIN-MODEL-DESIGN.md) MeetingDecision/CompletionFact；[Orchestration](./MEETING-ORCHESTRATION-DESIGN.md) 13.3、16.2、17.1、19.5 | `plugin/src/domain/model.ts::MeetingDecision` 尚无 local mode；decision transitions 和 `completion.ts::applyCompletionClaims` 固定 Captain authority；`meeting-decision.ts::createMeetingDecisionApplication`、`meeting-control.ts::createMeetingControlApplication` 仅有 Captain 三命令 | T1–T3 / V1–V3 |
| S3 HTTP/Client 最小操作闭环 | [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md) Local decision and risk control design、Client fact visibility | `plugin/src/http/index.ts::registerLocalMeetingHttpRoutes` 只有六 route；`types.ts::LocalMeetingWebRuntime` 缺三方法；`meeting-panel.tsx::ConviviumMeetingPanel` 缺行内编辑、命令结构化错误；sections 是只读 renderer | T4–T5、T6B / V4–V5、V6B |
| S4 原子性、receipt、恢复、归档 | [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) Events and sequence、Local decision and risk commit consistency；[Persistence](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md) Command commit、同名 consistency section | `plugin/src/domain/transitions/archive.ts::assertArchivePackageMatchesMeeting` 只允许 Participant/Captain assertedBy；Repository 已有原子 commit/replay/reopen，不另建机制 | T2、T6–T7 / V2、V6–V7 |
| S5 证据、覆盖、删除 | [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) FR-7/8/11、Not Covered；[Client Evidence](../40-readiness/CLIENT-FACT-VISIBILITY-EVIDENCE.md) V7、Not Covered | 历史只读证据不代表新写入口；TODO 按 LC-01–LC-08 登记文件范围 | T8 / V8 |

Non-goals：candidate reject/revoke、批量/自动接受、Proposal/Position 修改、Agenda disposition、attendance/admission、Scribe、创建会议、权限配置、远程/多用户、Session 生命周期改造、自动 end/archive、发布、stress、真实模型；不改现有 pause/resume/reassign/end 行为。

数据库迁移、新 DSH seam、凭据、部署形态：`Not Applicable`，复用当前 package、Storage Domain、WebServer 与 Client slot。真实 smoke 是明确后移的 `Not Covered`，不是不适用。无新增顶层目录。

## Fixed Minimal Design And Invariants

- 复用三个已有 DTO/结果和三个命令；新增三个 HTTP suffix：accept-decision、dispose-decision、dispose-risk。不合并成通用 command endpoint。local 和 Captain 在现有 application 内共享每个动作的提交代码，来源验证与事务提交分开。
- local callerBinding/capabilityId/Decision event.actorBinding/CompletionFact.assertedBy 固定 `local-host:loopback-web`；authority=`local_host`；新 Decision mode=`local_host_acceptance`。Captain 旧值不变；acceptedBy 仅来自支持/接受 Position 的 Participant IDs。保留历史，不迁移 legacy mode，不泛化 Captain 身份语义。
- 三命令仍使用 `accept_decision|dispose_decision|dispose_risk` 和现有 request serialization。receipt identity 隔离不等于实体 ID 隔离；不同来源同 requestId 不会重放另一来源 receipt，但仍可能被现有领域 ID/状态检查拒绝。不新增 ID 策略。
- Acceptance 保留 current proposal revision、source speaker、agenda、support/accept、无 blocking objection、有效证据及去重 guards。supersede 原子接受 replacement 后替代旧 Decision；revoke 只处置 accepted Decision。历史接受 facts/异议保留。
- Risk 保留 open/accepted_risk、riskLevel 存在且不超阈值、无 hard constraint 违反；accept → accepted_risk/accepted_risk/false，reject → open/blocking/true；旧 active risk facts 全部 superseded，再新增 active fact。Participant risk claim 权限不变。
- P2 保持现有 Runtime 重算：非 completed 仅 completion_fact.added；completed 同 commit 后接 meeting.replanned，converging、currentTurn/waitState 缺失、outbox=[]、version 一次。from/payload.meetingVersion 来自输入 state，外层版本来自 commit。不增加 lifecycle 副作用。
- 七种终态禁止新写；receipt replay 在终态 guard 之前。所有失败无 state/event/receipt/outbox/version 部分提交；不把 abort 当后端回滚。
- Client 只有一个行内表单，不重复选目标；reason 初始为空。已有来源消息存在于当前 messages 才预选，摘要可见、证据可改；revoke 初始证据为空，supersede 多一个 replacement 选择。提交本身是确认，不增加弹窗/向导。
- Risk UI：open 提供 Accept risk；accepted_risk 提供 Set as blocking；open 且 disposition!=blocking 也提供 Set as blocking。隐藏重复 accept/reject。缺 riskLevel 或存在 violatedConstraintIds 时禁写。当前 status DTO 不含 acceptableRiskLevel，阈值只由后端验证，不为禁用按钮扩展 projection。
- 只有 created/running/waiting/paused/converging 渲染动作；七终态不渲染。listCached/detailCached/writePending 禁写，单 writePendingRef 与现有控制互斥。不增加自动重试、乐观状态、草稿持久化或新 polling。
## Data, Mapping And Existing Call Chain

以下输入/结果复用既有 Schema；local 审计字段与事件差异以已同步的正式 Protocol 为准。

| 对象 | 精确字段与来源 |
| --- | --- |
| 三请求共同字段 | 全 required：`protocolVersion:1`、`meetingId:string`、`expectedMeetingVersion:number`、`requestId:string`、`reason:string`、`evidenceMessageIds:readonly string[]`。无 nullable、无默认值；ID 非空，reason trim 后非空，证据非空、唯一且全部属于该 Meeting。 |
| acceptance input | 另含 required `decisionCandidateId:string`；现有 `CaptainDecisionAcceptanceInputSchema` 在 protocol/commands.ts。 |
| disposal input | 另含 required `decisionId:string`、`action:"supersede"|"revoke"`；`replacementCandidateId:string` 仅 supersede required，revoke 禁止。现有 `CaptainDecisionDispositionInputSchema`。 |
| risk input | 另含 required `issueId:string`、`decision:"accept"|"reject"`；现有 `CaptainRiskDispositionInputSchema`。 |
| acceptance result | 全 required：requestId、decisionCandidateId、decisionId、proposalId、completionFactId 为 string；proposalRevision 为 number。`CaptainDecisionAcceptanceResultSchema`。 |
| disposal result | required requestId、decisionId、completionFactId 为 string，action 为 supersede/revoke；replacementDecisionId 仅 supersede required，revoke 禁止。`CaptainDecisionDispositionResultSchema`。 |
| risk result | required requestId、issueId、completionFactId 为 string，disposition 为 accepted/rejected，meetingStatus 为正式 Meeting status union。`CaptainRiskDispositionResultSchema`。 |
| success/error | 复用 ProtocolSuccessV1 和 ProtocolErrorV1；success 外层 protocolVersion/meetingId/meetingVersion/ok/result 均 required；error 的 code/message/retryable/protocolVersion/ok required，Meeting 与 attempt metadata optional，无虚构 metadata。 |

Schema 的位置：[commands.ts](../../plugin/src/protocol/commands.ts)、[results.ts](../../plugin/src/protocol/results.ts)、[types.ts](../../plugin/src/protocol/types.ts)、[index.ts](../../plugin/src/protocol/index.ts)。当前 acceptance Schema 不自行拒绝全部额外字段，证据为空/重复主要由 domain 拒绝；HTTP 的 `assertExactBodyKeys` 不能省略。不能把目前 Schema 的行为写成已经具备目标完整严格校验。

ID 与时间现状：acceptance 的 Decision ID 为 `decision-${candidate.id}`，fact ID 为 `completion-${candidate.id}-acceptance`；disposal fact 为 `completion-${requestId}-decision-supersession` 或 `completion-${requestId}-decision-revocation`；risk fact 为 `completion-${requestId}-risk-${index}`，单 risk 从 index=0 开始。Runtime 从 options.now/Date.now 取业务时间；Repository 分配提交版本与事件序号。ID 不由 Client 生成或推导。

现有 Captain 调用链：`plugin/src/tools/register-tools.ts::registerCreateAndStatusTools` → commands Schema → 真实 caller resolver → `plugin/src/runtime/application-service/index.ts::createCreateStatusRuntime` → decision/control application → `plugin/src/repository/domain/domain-meeting-repository.ts::DomainMeetingRepository.execute` → 纯 `acceptDecisionCandidate` / `disposeDecision` / `applyCompletionClaims` → 单 CommitRecordV1 → receipt/envelope。`serializeValidatedRequestV1` 位于 [request-idempotency.ts](../../plugin/src/protocol/request-idempotency.ts)，精确返回 JSON.stringify(value)，不能改成 crypto 或 canonical JSON。

Repository 顺序为 validateCommand → receipt lookup → hash conflict/replay → expected version → transition → commit。已成功请求在终态的重放不是新写入；不得把终态 guard 移到 receipt replay 前。生产 `plugin/src/index.ts::meetingConsumerPlugin` 注入的 validator 为 no-op，当前身份校验实际在 application 方法中；不能误认为 Repository 自动证明 Captain/local 权限。

读取链：`getLocalMeetingStatus` → [status.ts](../../plugin/src/projection/status.ts) `projectMeetingStatus` → `MeetingStatusResultSchema` → HTTP JSON → panel `readStatus/loadDetail` → [meeting-panel-view.tsx](../../plugin/src/client/meeting-panel-view.tsx) `mapMeetingPanelView` → `renderObservabilitySections`。active/execution-terminal 读取 discussion arrays；archiving/archived 从 archive.package 读取 history/issues。候选 immutable，无持久 status；accepted/revision update/terminal 后从 pending 消失。

## DSH rc.2 Investigation

已完整读取 [DSH Skill](../../.agents/skills/dsh-plugin-development/SKILL.md)、routing、web-ingress、client-ui、cordis-lifecycle、typert-remote-api、testing-docs-maintenance references，以及 [Right-size Skill](../../.agents/skills/right-size-changes/SKILL.md)。manifest 与 lockfile 的直接 DSH dev dependencies 固定 0.1.1-rc.2；未升级依赖。

- `@deepseek-ai/dsh-host-webserver` 的公开 `WebServer.register(route:WebRoute):()=>void`、`WebRoute.handler:(IncomingMessage,ServerResponse)=>void|Promise<void>`；已核对安装包 lib/types/index.d.ts、lib/index.js 和 README。service key 为 webServer，host 只支持 127.0.0.1/0.0.0.0。register 返回 disposer，不替调用方做 body/schema/auth 验证。
- 当前 `plugin/src/index.ts::meetingConsumerPlugin.apply` 在 loopback gate 内通过 ctx.effect 持有 route disposer；无需新增 service/provider。
- Client slot 所有者为 `@deepseek-ai/dsh-client-ui-conversation`；lib/types/client/contract/slots.d.ts 声明 conversation.view 为 list/session slot。`@deepseek-ai/dsh-client-runtime` 的 SlotRegistry.register 与 inject 负责 fiber teardown；现有 `plugin/src/client/index.tsx::apply` 注入 conversation.view、注册 convivium-meetings。保持该入口。
- Typert reference 已核对；本仓库正式 carrier 是受控 Web route，当前任务不调用 DSH Host Service Remote method，不新建 Typert Service、DTO registry 或 package export。
- 安装包不携带上游完整测试源码；未运行上游测试。已有本仓库 slot/HTTP tests 只证明其各自边界，不替代真实 Loader/Browser 组合证据。


## Fixed Symbols And Test Data

目标新增 symbol 均放在既有文件，只有一个测试 fixture 文件和一个 readiness 文件允许新建。此节的类型片段为必须采用的目标签名，不是伪代码。

### Domain and Runtime signatures

- `plugin/src/domain/transitions/decision-acceptance.ts::AcceptDecisionCandidateContext` 及 `plugin/src/domain/transitions/decision-disposition.ts::DisposeDecisionInput` 的两个 union 分支增加 optional `authority?: "captain" | "local_host"`；未提供时固定 captain，以保持现有纯函数调用兼容。acceptance mode 由该 authority 唯一映射，supersede 将同一 authority 传给 replacement acceptance。
- `plugin/src/domain/completion.ts::ApplyCompletionClaimsContext.riskAuthority` 从 optional boolean 改为 optional `"captain" | "local_host"`。现有 true 调用机械改为 captain；未提供仍走 Participant 权限。私有 `isCaptainRiskDisposition` 改名 `isControlRiskDisposition`，判定 authority 是上述两个值之一且 claims 仅有 riskAcceptance；不放宽混合 claims。生成 risk fact 时 authority=`context.riskAuthority ?? "risk_acceptance_authority"`。
- `plugin/src/runtime/application-service/types.ts::LocalMeetingWebRuntime` 增加下列三个 required 方法；输入/结果均为现有类型，无 signal/identity body 参数：

```ts
acceptLocalDecision(input: CaptainDecisionAcceptanceInputV1): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>;
disposeLocalDecision(input: CaptainDecisionDispositionInputV1): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1>;
disposeLocalRisk(input: CaptainRiskDispositionInputV1): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1>;
```

- `meeting-decision.ts::createMeetingDecisionApplication` 返回原两个 tool 方法加两个 local 方法（Pick 的对象为 MeetingToolRuntime & LocalMeetingWebRuntime）。在同一 closure 新增私有 `acceptDecisionForSource(input: CaptainDecisionAcceptanceInputV1, source: MeetingControlSource): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>` 与 `disposeDecisionForSource(input: CaptainDecisionDispositionInputV1, source: MeetingControlSource): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1>`，只承载原 try/execute/result/error 路径。
- `meeting-control.ts::createMeetingControlApplication` 的 Pick 增加 disposeLocalRisk，新增私有 `disposeRiskForSource(input: CaptainRiskDispositionInputV1, source: MeetingControlSource): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1>`；移动原 risk 提交段，不移动其他控制段。
- 三 tool wrapper 保留原 recovery.rehydrate 与 Session/Meeting 验证，成功才构造 captain source。risk wrapper 同时检查 caller.meetingId 存在时等于 input.meetingId（与 Decision 及既有 caller binding 契约一致）；拒绝仍 UNAUTHORIZED_CALLER。
- 三 local wrapper 都执行 recovery.rehydrate({kind:"local_meeting",meetingId:input.meetingId})；未返回该 ID 则 MEETING_NOT_FOUND / `Meeting not found.`；成功调用对应 ForSource，固定 `{kind:"local_host"}`。ForSource 从 meetings.get(input.meetingId) 取 StoredMeeting；缺失按 source 返回原 tool 未授权消息或 local 未找到消息。不得要求 stored.parent、调用 Session resolver 或触发 dispatch。
- ForSource 中 callerBinding/capabilityId/actor/authority 仅按 source 的两分支赋值。Risk context 的 participantId 固定为 source.kind（captain/local_host），assertedBy 为真实 actor，riskAuthority 为 source.kind；这不是创建 Participant。其余时间读取、factId、judge、事务、result、error mapping 原样保留。
- `plugin/src/runtime/application-service/index.ts::createCreateStatusRuntime` 返回对象接线三个 local 方法；不修改 tools/register-tools.ts、公共 DTO/Schema/exports 或新建 facade。

### Client signatures and ownership

在 `plugin/src/client/meeting-panel-sections.tsx` 新增导出类型：

```ts
export interface MeetingFactControls {
    renderCandidateActions(candidateId: string): ReactElement | null;
    renderDecisionActions(decisionId: string): ReactElement | null;
    renderRiskActions(issueId: string): ReactElement | null;
}
export function renderObservabilitySections(
    detail: MeetingStatusResultV1,
    controls?: MeetingFactControls
): ReactElement;
```

只在 pending、accepted、risk 对应行末调用 callback；不在 decisionHistory 重复渲染动作。未传 controls 时保持既有只读行为和测试。candidate 行增加 data-candidate-id，另两行复用既有 data-decision-id/data-risk-id。

`plugin/src/client/meeting-panel.tsx` 新增私有类型和状态：

```ts
type FactControlAction = "accept-decision" | "supersede-decision" | "revoke-decision" | "accept-risk" | "reject-risk";
interface FactControlDraft {
    action: FactControlAction;
    targetId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    replacementCandidateId?: string;
}
```

draft 初始 undefined，仅 supersede 设置 replacementCandidateId（初始空字符串）；一个 `factError: ProtocolErrorV1 | undefined`，初始 undefined。无第二个写锁、缓存或版本状态。目标草稿不是事实源。

新增 panel 内 `openFactControl(action: FactControlAction, targetId: string): void`、`submitFactControl(): Promise<void>`、`renderFactForm(): ReactElement | null`。三个 renderer callback 在对应目标行返回动作按钮，并且仅在 draft 所属行附加 renderFactForm；其他行不复制表单。初始 reason 空，证据按 Minimal Design 规则从已验证 detail 提取。

复用 ProtocolFailure 类，在构造器保存 required `readonly protocolError: ProtocolErrorV1` 并 super(protocolError.message)，protocolFailure(value) 传入已验证错误。旧控制仍读 error.message，新控制保留完整 protocolError，不另造 exception hierarchy。新成功解析在 submitFactControl 的三个路由分支分别使用已有 Captain 三种 ResultSchema + validateProtocolSuccessEnvelope，禁止接受未验证响应。

### Shared fixed fixture

唯一新增测试文件 `plugin/tests/fixtures/local-decision-risk.ts`，导出 `createLocalDecisionRiskState(): MeetingState`。复用 `plugin/tests/unit/domain/transitions/fixtures.ts::questionState` 与 now，每次返回独立 state，不导入另一个 spec。消费者为 T1/T2/T3/T6 的领域、Runtime 和存储测试；这是共享可验证领域数据，不是生产抽象。

固定数据：

- questionState() 的其余字段保留；version=0、eventSeq=0、messageSeq=1，createdAt/updatedAt=now，status=running。agenda-1.status=discussing 保证普通 risk 成功分支不完成；无 currentTurn/waitState。
- transcript 只有 message-1：seq=1、turnSeq=1、turnId=turn-1、stepId=step-1、attemptId=attempt-1、speaker=participant-1、agendaItemId=agenda-1、agendaRelation=on_topic、content=`Local control evidence`、kind=statement、mentions=[]、taskIds=[]、createdAt=now。
- proposals 只有 proposal-1：title=`Scope`、description=`Bounded scope`、proposedBy=participant-1、revision=1、status=under_review、agendaItemId=agenda-1、createdAt/updatedAt=now；positions 只有 position-1，participantId=participant-1、position=accept、blocking=false、proposalRevision=1。
- decisionCandidates 为 candidate-1、candidate-2：均引用 proposal-1/revision1、proposedBy=participant-1、sourceMessageId=message-1、agendaItemId=agenda-1、createdAt=now；statement 分别 `Scope A`/`Scope B`，rationale=`Supported scope`。decisions/completionFacts 初始为空。
- issues 只有 risk-1：title=`Bounded risk`、description=`A reversible risk`、sourceMessageId=message-1、agendaItemId=agenda-1、affectedOutputIds/affectedCriterionIds/violatedConstraintIds/blockingObjectionIds/relatedTaskIds=[]、blocking=true、riskLevel=low、impact=`Low impact`、urgency=before_release、reversibility=reversible、safeDefaultAvailable=true、disposition=blocking、status=open；不设置其他 optional 字段。
- 通用 reason=`Reviewed evidence`、evidenceMessageIds=[message-1]。五动作固定顺序 accept candidate-1、supersede 该 Decision 为 candidate-2、revoke replacement、risk accept、risk reject；requestId 分别 local-accept/local-replace/local-revoke/local-risk-accept/local-risk-reject，expected version 每次取最新 snapshot。每条成功动作单独留存 input/envelope 供 replay。
- completed 风险分支只将 fixture agenda-1.status 设 resolved，再执行 risk accept；objective 其余空集合已满足，风险此前是唯一阻塞项。非 completed 分支使用原 fixture。
- 终态表固定 completed/partial/no_consensus/cancelled/failed/archiving/archived。每次测试使用 fresh fixture/structuredClone，不复用上一拒绝的突变对象。

## Mechanical Steps

### T0：执行前核对和代码基线

前置状态：后续任务已明确要求 Execute；本轮 Author 不运行此步。正式文档包含上述确认，不再请求 P1/P2 批准。
允许修改：仅创建/切换指定开发分支；不修改文件内容。
禁止修改：产品文件、用户已有改动、其他分支。

执行：
1. 读取当前 status、branch、代码基线 diff。允许本轮以下文件的未提交变更：`TODO.md`、`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`、`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md` 及本文；其他未提交文件必须 STOP。任何 plugin 代码与调查基线不同必须 STOP，不能用旧 RUNBOOK 实施新代码。
2. 当前已经在 codex/local-decision-risk-control 时保持；不在该分支且同名分支不存在时执行 `git switch -c codex/local-decision-risk-control`，保留文档改动；同名分支存在而未 checkout 时 STOP，避免覆盖另一任务。此条件规则不由执行者另选分支。
3. 运行 V0 baseline 完整 verify；任一失败报告基线失败，不修复邻接问题。

验证：
```sh
git status --short
git branch --show-current
git diff b4bed41634d4600e460040b1b93895b42c9671ac -- plugin
pnpm --dir plugin verify
```

PASS：代码 diff 为空，分支正确，verify 全部 exit 0；记录实际 suite/test 数与输出。
STOP：缺 Execute 授权、基线变化、分支冲突或任一验证失败；不得把本轮文档批准当代码执行。恢复：无外部副作用，不 reset/clean 或撤销用户改动。

### T1：领域来源标识和风险权限参数

前置状态：T0 PASS。
允许修改：`plugin/src/domain/model.ts`、`plugin/src/domain/transitions/decision-acceptance.ts`、`plugin/src/domain/transitions/decision-disposition.ts`、`plugin/src/domain/completion.ts`；`plugin/src/runtime/application-service/meeting-control.ts` 仅 riskAuthority:true→captain；`plugin/tests/unit/domain/transitions/decision-acceptance.spec.ts`、`plugin/tests/unit/domain/transitions/decision-disposition.spec.ts`、`plugin/tests/unit/domain/completion.spec.ts`；新 fixture `plugin/tests/fixtures/local-decision-risk.ts`。
禁止修改：公开协议、Repository、其他 Runtime 逻辑、终止/Session 行为。

执行：
1. 按 Fixed Symbols 建 fixture、增加 local_host_acceptance（保留 model 的旧 legacy union 值，不新增 legacy 写入口），修改 authority 参数与 fact/mode 映射；disposal 向 replacement 传同一 authority。
2. 修改 riskAuthority 类型及 helper 判定；现有 tests 和 Runtime 的 true 全部机械改为 captain。未提供参数的 Participant 路径保持原状。
3. 三个 spec 各新增 `local control preserves authority and guards` suite，固定五成功动作与 authority/mode/assertedBy/event.actorBinding；Captain 默认值仍断言原值。每次 rejection 比较完整 state 与执行前 structuredClone。
4. Decision 拒绝表：空理由、空/重复/未知/跨 Meeting evidence、未知 candidate、旧 revision、无 support、blocking object、未知/non-accepted decision、无效 replacement、七终态。Risk 拒绝表：空理由、空/重复/未知 evidence、未知 Issue、缺 riskLevel、high 超 low、constraint-1、resolved/deferred/out_of_scope、七终态；混合 risk+output claim 且非 Participant 必须拒绝，不准新增 local waiver/review 权限。

验证：
```sh
pnpm --dir plugin exec vitest run --project host tests/unit/domain/transitions/decision-acceptance.spec.ts tests/unit/domain/transitions/decision-disposition.spec.ts tests/unit/domain/completion.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：V1 全 exit 0；旧 Captain assertions 不变；local 替换同时生成 local replacement acceptance 和 local supersession fact，旧 acceptance fact 保留。
STOP：失败、必须改新 ID/协议/生命周期或放宽 guard。恢复：保留文件供诊断；fresh fixture 无磁盘资源，测试不得污染其他用例。

### T2：归档接受可信 local facts

前置状态：T1 PASS。
允许修改：`plugin/src/domain/transitions/archive.ts::assertArchivePackageMatchesMeeting`、`plugin/tests/unit/domain/transitions/archive.spec.ts`。
禁止修改：archive Schema/字段、物化 mapper、终止或清理 Session 逻辑、旧 Captain/Participant 分支。

执行：
1. 在既有 completionFacts actor 检查增加一个 local 分支：authority===local_host、assertedBy===local-host:loopback-web、kind 属于 decision_acceptance/decision_supersession/decision_revocation/risk_acceptance、sourceCompletionById 必须找到同 ID 且 kind/authority/assertedBy 完全相同。继续执行所有 subject/result/status/evidence/Meeting 校验。
2. 新增 `archives only committed local decision and risk facts`，用 fixture 运行五种 pure transitions（risk factId 固定上述请求的 completion ID），构造 terminal state（status=partial，termination 从既有 meeting(partial) 取，清除 currentTurn/waitState），用既有 `plugin/src/runtime/services/meeting-archive-service.ts::materializeArchivePackage(state, now)` 生成 package 后 transitionMeeting 至 archiving。
3. 断言全部旧/新 facts/history 保存；逐项变异 authority、assertedBy、kind、未知 source fact ID、跨 Meeting evidence 和伪 local waiver 均拒绝且原 state 不变。保留既有 Captain waiver 测试。

验证：
```sh
pnpm --dir plugin exec vitest run --project host tests/unit/domain/transitions/archive.spec.ts
```

PASS：V2 exit 0；合法 local facts 可归档，来源伪造无一通过。
STOP：必须放宽来源/证据条件或改 archive 生命周期。恢复：仅内存 fixture，无外部恢复动作。

### T3：三个 Runtime local 入口接线

前置状态：T1–T2 PASS。
允许修改：`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/application-service/meeting-decision.ts`、`plugin/src/runtime/application-service/meeting-control.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`；`plugin/tests/contract/http-boundary.spec.ts::runtime` 仅补三个 required mock 方法保持类型完整。
禁止修改：tools caller resolver、Repository、恢复服务、HTTP handler、其他会议控制。

执行：
1. 按 Fixed Symbols 增加接口、local wrappers、私有 ForSource、index 返回值接线。移动原提交段复用，不复制两份。保留 receipt lookup 在 mutation guard 前和 P2 原完成重算代码。
2. 新增 `local decision and risk runtime` suite 与该 suite 私有 helper `setupLocalControlRuntime(state: MeetingState = createLocalDecisionRiskState()): Promise<{ runtime: ReturnType<typeof createCreateStatusRuntime>; registry: DomainRepositoryRegistry; meeting: FakeMeetingDomain; facility: DomainFacilityPort }>`：使用 createFakeCatalogDomain/createFakeMeetingDomain（name=meetingDomainName(team-1,meeting-1)）及 DomainRepositoryRegistry.open；DomainFacilityPort.open 只返回这两个匹配 spec.name 的 fake domain，未知 name 抛错。先构造 create input，再 registry.openMeeting({teamId:team-1,meetingId:meeting-1,create})（内部完成 create），随后 recordSessionOwnership/completeCreate；不得在空 catalog 上省略 create。create input 为 requestId=create-local、requestHash=create-local、authorization callerBinding=session:captain-1/capabilityId=captain:captain-1、initialState=JSON.parse(JSON.stringify({...state,meetingTasks:[]}))（去除纯领域 fixture 的 undefined optional 字段，符合 JSON 存储契约）、createdAt=now；无 outbox。ownership 为 sessionId=manager-1、initialMessageId=manager-initial-1（fake Session 的初始消息证明）、parentSessionId=captain-1、sessionLabel=convivium:meeting-manager:team-1:meeting-1、provider=spawn、role=manager、lifecycleStatus=active、capabilityStatus=active；recordSessionOwnership 的第二参数传 now，由 repository 生成 createdAt/updatedAt。
3. 在同 facility 上创建 createCreateStatusRuntime，provider=spawn、authorizationValidator 使用既有 allow no-op、now 固定 fixture now；continuable.startContinuable/followup/listDescendants 都设 spy（前两项一旦调用即抛错，listDescendants 返回 []），不创建真实 Agent。finally dispose Runtime、close registry，fake domain 不留磁盘。helper 返回 Runtime、registry、fake meeting domain 和同一 facility，供 loadProjection 与冷重开断言。每次 Runtime 命令后的 snapshot/version/events/receipts/outbox 都从 `loadProjection({domain: meeting})` 读取；初始化 registry 持有独立内存 projection，不用它的旧 repository.read 代表 Runtime 提交后状态。
4. 按 fixture 五动作调用 public local methods；每次 snapshot state、projection/events/receipts/outbox/version 断言。对照 Captain source 的相同五动作（fresh fixture、sessionId=captain-1）与 Manager/Participant/wrong Session/显式 wrong meetingId 拒绝。未找到 local Meeting 为 MEETING_NOT_FOUND；fake selected domain 恢复失败抛 LocalMeetingRecoveryUnavailableError，不转换领域成功。
5. 每个保存的成功 input 原样 replay 必须原 envelope；变 reason 同 identity 返回 IDEMPOTENCY_CONFLICT，新 requestId + stale version 返回 VERSION_CONFLICT。用另一来源提交同 requestId、旧 expected version 必须 VERSION_CONFLICT，不能重放 local receipt。七终态新请求拒绝；已成功 receipt 在终态仍可 replay。拒绝前后比较 loadProjection 完整事实与版本。
6. P2 两分支分别用普通/completed fixture：事件集合先保留并核对 completeCreate 产生的 meeting.created（eventSeq=1），本次动作事件从 eventSeq=2 开始；snapshot 版本字段为 version。事件外层 eventSeq 连续；completed 顺序 completion_fact.added→meeting.replanned，payload.meetingVersion=旧 version，外层=新 version；result.meetingStatus 与 snapshot 一致。只有一个新 commit，没有 outbox/Session 调用。不要把 P2 放进纯 completion transition 测试（重算 owner 是 Runtime）。
7. HTTP runtime mock 三方法分别返回三种合法 Result envelope；这里只补接口 stub，T4 才扩展 route 测试。

验证：
```sh
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：V3 全 exit 0，五动作、caller、重放、版本与两事件分支精确满足断言，无 live Captain、dispatch 或 Session side effect。
STOP：必须增加新的 recovery/lifecycle 行为或修改其他控制；失败报告最小用例。恢复：finally 关闭本用例 Runtime/registry；不关闭用户 Host。

### T4：三个 HTTP 分支及严格边界

前置状态：T3 PASS。
允许修改：`plugin/src/http/index.ts::registerLocalMeetingHttpRoutes`、`plugin/tests/contract/http-boundary.spec.ts`。
禁止修改：Host registration gate、旧六路由行为、公开 DTO/Schema、第二 prefix/Typert carrier。

执行：
1. controlMatch 扩为 pause|resume|reassign|end|accept-decision|dispose-decision|dispose-risk。在最终 resume 分支之前新增三个明确分支；每个分支按既有模式读 body、assertExactBodyKeys、对应 Captain InputSchema、path/body 一致、对应 local 方法、ProtocolError/result Schema、writeJson 后 return。supersede/revoke 的字段集合必须按 action 唯一选择；不得允许额外 replacement 或身份字段。
2. body 固定字段集、成功/失败 envelope 来自 Protocol Local decision and risk control。HTTP 只校验结构和 Schema；证据归属、空/重复 evidence 的 domain guards 不伪装为 HTTP 已完成。
3. 既有 `registers one prefix and serves all six successful routes` 改为 nine（原六断言保留）；追加五动作 body→唯一 runtime 方法精确参数→正确 ResultSchema，supersede/revoke 分别断言 replacement 有/无。
4. 新增 `local decision risk routes preserve strict HTTP boundary`：每条新 route 的 wrong method、尾斜杠、未知 path 为 404/no body；query、malformed URI、缺/错 media、16_385 bytes、坏 JSON、非 object、缺 required/多余 key、path/body mismatch、非法 action 为 400/固定 INVALID_ARGUMENT。结构/Schema 拒绝不调用 Runtime。
5. 新增 `local decision risk routes validate envelopes`：每条新 route mock 409 两种冲突、404 未找到、400 领域拒绝；恢复错误503/Retry-After1/no body、unknown/invalid result500/no body；success200 JSON。所有 response 不泄露内部异常。
6. 沿用 `plugin/src/index.ts::meetingConsumerPlugin` 的 loopback gate 与 ctx.effect disposer，执行其现有测试，不为新路由复制 gate。

验证：
```sh
pnpm --dir plugin exec vitest run --project contract tests/contract/http-boundary.spec.ts tests/contract/protocol-schema.spec.ts
pnpm --dir plugin exec vitest run --project host tests/unit/index-inject.spec.ts
```

PASS：V4 全 exit 0；一个 prefix、九 route、五动作严格映射；非 loopback 无注册，disposer 生效。accept archived 保留 IMMUTABLE_MEETING，dispose/risk archived 保留 ARCHIVED_MEETING，其他终态 IMMUTABLE_MEETING。
STOP：需放宽 schema/Host gate、改旧路由或增加 carrier。恢复：handler mocks 与 vi spies 在用例结束恢复，不启动 Host/网络服务。

### T5：单行内表单和既有写生命周期

前置状态：T4 PASS。
允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/src/client/meeting-panel-sections.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。
禁止修改：meeting-panel-view mapper、slot、公共 status、旧 pause/end 行为或错误断言、UI framework/新 dependency。

执行：
1. 按 Client signatures 增加 controls optional 参数及三个行内 callback、一个 draft、一个 factError。由 panel 传入 callback；只有五 active status 产生按钮，其他 return null。
2. 固定可访问标签：Accept decision、Replace decision、Revoke decision、Accept risk、Set as blocking。表单 aria-label=`Decision and risk control`；Reason 使用 textarea；Evidence messages 使用当前 messages 的 checkbox 列表（label 为 content 摘要，保留 ID 作为 value/key，不向用户要求输入 ID）；选中证据摘要始终显示。Replacement decision select 仅 supersede；Submit/Cancel 两按钮。取消清除 draft。reason 不自动填写，证据不从不存在的关联推断。
3. openFactControl 自动带入目标；仅在允许 lifecycle 且不 cached/pending 时生效。切换对象替换草稿。replacement 修改后将 evidence 重置为该 replacement 的有效来源或 []。用户可修改为当前消息集合的其他证据；trim 空理由、空证据、目标缺失、supersede 空/失效 replacement 禁 submit。
4. submitFactControl 开始前同步检查 selectedId/detail、active status、listCached/detailCached/writePendingRef 及 draft 有效性；生成一次 crypto.randomUUID，取当前 detail.meetingVersion。使用相同 writeController/writeGeneration/writePendingRef/setWritePending；每个 await 后更新 UI 前核对 mounted、generation、selectedId。三个 suffix 映射：accept-decision→accept-decision；supersede/revoke-decision→dispose-decision/action=supersede/revoke；accept/reject-risk→dispose-risk/decision=accept/reject。body 仅含 Protocol 固定字段，revoke 禁 replacement，reason 用用户文本，证据用已选 IDs。
5. 解析三种成功 envelope；验证成功后清 draft/factError、refreshSelectedMeeting；合法 ProtocolFailure 清 draft、保存完整 factError、刷新 list/detail，不自动重试。transport 或非法响应清 draft，保留已验证 detail、置 detailCached=true、显示既有通用读取失败文字；后续 GET 恢复。新提交开始、切 Meeting 或 clearSelection 清 factError；单独成功 GET 不清 factError。错误展示 message 和 code，并将 retryable 转为“Refresh before submitting again”提示，不提供自动 Retry 按钮。
6. 每次完整 GET 替换 detail；若 draft 目标不再在对应 active 数组、生命周期不可写，清 draft；replacement 不再 pending 则清 replacement/evidence；否则 evidence 仅保留新 messages 中存在的 IDs。reason 保留。不设乐观事实、不额外 poll；沿用 5 秒/focus/reopen。切 Meeting/卸载沿用 abort+generation 并清新状态，不把迟到响应写入另一 Meeting。
7. 新增 `local decision risk panel controls` suite。新增该 spec 私有 `localControlStatus(): MeetingStatusResultV1`：由既有 statusResult(running,2,true) 复制，messages 固定为一条 PublicMeetingMessage：id=message-1、seq=1、turnId=turn-1、stepId=step-1、speaker=participant-1、agendaItemId=agenda-1、kind=statement、content=`Local control evidence`、mentions=[]、taskIds=[]、createdAt=now（不包含内部 attemptId/turnSeq/agendaRelation）；pending 增加 fixture 两 candidate 的公开字段；accepted/decisionHistory 增加 PublicDecisionV1 `{id:"decision-old",proposalId:"proposal-1",proposalRevision:1,status:"accepted"}`；risks 使用 fixture risk-1 的 PublicRisk 字段。用既有 success/jsonResponse/selectMeeting/deferred helpers，mock fetch 验证五个实际 DOM 提交及精确 body。
8. 覆盖来源预选、revoke 空证据、supersede 专属选择、来源缺失回退、取消/切行只一个表单、重复 Risk 动作隐藏、已知非法 Risk 禁写、七终态隐藏、空输入禁止；与原控制共享锁、cached 禁写、409 message/code/retryable 跨 GET 保留且仅一个 POST、transport 失败不重试、完整事实更新、focus/poll/reopen、目标消失清表单、切换/卸载迟到响应隔离。
9. 保留 `new fact sections remain read only and escape text`，以不传 controls 的 renderer 继续断言只读与文本转义；不得删除整组原事实测试。

验证：
```sh
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：V5 全 exit 0；五操作由真实 panel DOM 发出；只有一表单，无多余目标选择/身份字段/自动 POST，旧控制回归通过。
STOP：必须扩大 DTO、重写 mapper、引入新框架或改旧控制错误语义。恢复：afterEach cleanup、restoreAllMocks、useRealTimers；卸载本测试组件，restore fetch/crypto，不触碰用户 Browser。

### T6：原子提交、冷恢复和端到端接线验证

前置状态：T1–T5 PASS。
允许修改：`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`。
禁止修改：全部生产文件、存储 Schema、恢复算法或 fixture 基础设施；发现生产问题按 STOP 回交作者，不能现场扩张实现。

执行：
1. 在 T3 suite 用同一 setupLocalControlRuntime 的 fake domains 记录五成功动作后完整 loadProjection；dispose Runtime/close registry，再同 facility 打开新 Runtime 与 registry（新建内存 owner，不共享 Runtime Map），用三个 local 方法重放原 inputs 和读取 getLocalMeetingStatus。全部 envelope、event seq/order、receipts、outbox、snapshot history/risks/facts 不变，无 live Captain 或 Session 调用。GET 的 pending/accepted/history/risks 与 committed state 对应；无 Manager/Participant 获权。
2. 在 T3 suite 导入 registerLocalMeetingHttpRoutes，使用 `http-boundary.spec.ts::registeredHandler/invoke` 的相同 IncomingMessage/ServerResponse 内存适配方式，在该 suite 内新增私有 `invokeLocalControl(handler: WebRoute["handler"], method: string, url: string, options: {body?: string; contentType?: string} = {}): Promise<{status: number; headers: Map<string, string>; body: string; json: unknown}>`，逐字段复用该内存适配实现（不从 spec 导入）。捕获一个 prefix handler，按 HTTP 五动作次序调用真实 Runtime、再 GET detail 并经 MeetingStatusResultSchema；每条 command 仅一个原子 commit，HTTP body 无 authority，最终 history 有 superseded/revoked，risk 为 open/blocking/true，旧 risk fact 保留。此为 HTTP→Runtime→Domain→Repository→GET 组合证据，不声称真实网络/Browser smoke。
3. 在 domain-meeting-repository.spec.ts 新增 `local control commits roll back and reopen`：使用 T3 相同 fake domain/create/ownership 初始化与 fresh fixture；直接 repository.execute 的 transition 复用 acceptDecisionCandidate/disposeDecision/applyCompletionClaims，返回 state/result/events/outbox=[]。每个动作前 `meeting.failNextPut("commits", "*")`；必须抛 fake put failure，重新 read/loadProjection/冷 reopen 与前一致（state/event/receipt/outbox/version 均不增）；再用相同 input 成功执行，一次提交。supersede 必须整体回滚 replacement 和旧 Decision 两侧。
4. 对 Decision acceptance/disposal 与 risk 的 evidence=[message-1,external-message] 分别断言整体拒绝，无 valid 前缀部分提交。Domain guards 已在 T1 覆盖，此处证明 repository 原子边界。
5. 冷 reopen 后按 T2 materializeArchivePackage + transitionMeeting 的路径以 repository.execute 原子写 archive；断言归档全部 local/Captain facts/history/evidence 与源 state 一致，并再 reopen 验证 package 不变。不会调用 Session cleanup；真实 archive lifecycle 仍由既有测试守护，本项只验证本次新增审计数据的持久保真。
6. 除动作-specific result 采用现有三个结果字段外，不 mock transition 的结果、不手工构造假成功 receipt。首次 acceptance receipt 在后续 terminal 状态重放仍不产生新 commit。

验证：
```sh
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-runtime.spec.ts tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin exec vitest run --project recovery tests/recovery/domain-recovery.spec.ts
```

PASS：V6 全 exit 0；五动作正常/故障/重放/冷恢复/归档保真与 HTTP 组合均有 assertions；所有 finally 恢复本次资源。现有 recovery suite 是补充回归，新增 local 冷恢复证据位于 contract suite。
STOP：出现半提交、状态丢失、caller 越权或必须修改生产恢复/事务机制；不得以跳过失败用例收口。恢复：finally dispose/close；fake failNextPut 消耗于本用例，不扫描 backend 物理目录。

### T6B：准备合并后 Browser 验证夹具

前置状态：T6 PASS。
允许修改：`plugin/scripts/smoke-profile/probe/scenarios/decision-risk-closure.js`、`plugin/scripts/smoke-profile/result.mjs`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`。
禁止修改：生产代码、wrapper/index、scenario selector、profile 配置、超时、依赖；禁止启动真实 Host 或 Browser smoke。

执行：
1. 按 [Smoke 操作规程](../50-operations/HOW-TO-DSH-SMOKE.md) 的 Decision/Risk 本地按钮验证 → Browser 夹具契约，修改 `runDecisionRiskClosureScenario(runtime)`：仅 browserMode 首次 submission 增加第二 candidate 与 risk；在首次 candidateStatus 后进入 Browser 分支，pause/status、flush/attach、写 ready 并 return。第二 candidate 除 statement 外沿用第一 candidate 字段。普通模式原有单 candidate 和后续工具断言保持不变。
2. `validateScenarioResult(value, expectedScenario, validateMeetingStatus)` 在普通 decision-risk assertions 之前新增本 scenario 的 browserReady=true 分支，按操作规程严格检查 outer/observed 全部字段与取值，成功返回原 value。保留现有通用 ok/scenario 校验及其他 scenario 分支；Browser 专属字段校验失败使用规程指定错误。
3. 在既有 `smoke-profile.spec.ts` 导入场景函数，新增 `local decision risk browser fixture` suite。以 fake runtime 执行真实场景函数：`callTool` 按 call ID 1100/1101/1102/1103/1104/1190/1191 返回 create、initial status、plan、submission、candidate status、pause、paused status；遇其他 ID 直接抛错。createInput 返回含 objectiveContract、单 agenda 的 fresh input；waitForAgent/ManagerContext/SpeakerContext 返回该函数所需 ID/version/turn/step/attempt/agenda 字段。全部 fake ID 固定非空，candidate ID 分别 candidate-1/candidate-2，risk-1、message-1，pause 前 version=3、后 version=4，candidate/风险数据严格遵循规程。
4. 成功用例断言 1103 payload 含两个候选与指定 risk，1190 使用 version=3，ready 使用 version=4 和真实 stub IDs；记录调用顺序，断言 pause/status→append→flush→attach→writeResult，没有 accept/dispose/end 调用。失败用例分别缺第二 candidate、错误 sourceMessageId、risk 非 open、暂停后仍有 currentAttemptId、workspace 缺失，均拒绝且不写 ready。fake assert 必须在条件不成立时抛错；每例 fresh runtime，afterEach restoreAllMocks，不启动进程或访问个人 profile。
5. 同一 spec 用合法 ready 对象验证原值返回；逐项删除 outer/observed 字段、追加字段、空 ID、重复 candidate ID、错误 Captain Session、非 paused、负数/小数 version、错误 assertion 均拒绝。保留普通 decision-risk 结果校验回归与现有 reassign tests。操作规程仅同步本步骤固定实现，不增加替代操作路径。

验证：
```sh
pnpm --dir plugin exec vitest run --project host tests/unit/scripts/smoke-profile.spec.ts
```

PASS：V6B exit 0；Browser 分支保留可点击对象、暂停后输出固定 ready，失败不输出 ready；普通场景与 reassign 校验回归通过；操作规程与字段、入口、七步、Restore 一致。
STOP：必须修改 wrapper/生产行为或运行真实 smoke 才能继续；记录缺口，不扩文件范围。恢复：还原本用例 mocks；本步骤不创建 Host/外部资源。真实验证留给合并后的 LC-08。

### T7：全量验证

前置状态：T0–T6 及 T6B PASS。
允许修改：无。本步骤仅执行检查；T1–T6 及 T6B 各自负责本步骤允许文件的格式修正，不在全量验证任务汇总跨文件修改。
禁止修改：无关文件、lockfile、package scripts、测试断言或 smoke 配置。

执行：
1. 运行下列固定文件集的 Prettier 检查；格式失败时 STOP，定位到对应 LC-01–LC-06 或 LC-06B 的文件范围修正后重跑，不在 LC-07 扩大修改范围。
2. 运行完整 verify，不用 verify:runtime。任一失败停止，记录真实输出和尚未通过边界；不放宽类型、lint 或 assertions。

验证：
```sh
pnpm --dir plugin exec prettier src/domain/model.ts src/domain/transitions/decision-acceptance.ts src/domain/transitions/decision-disposition.ts src/domain/completion.ts src/domain/transitions/archive.ts src/runtime/application-service/types.ts src/runtime/application-service/meeting-decision.ts src/runtime/application-service/meeting-control.ts src/runtime/application-service/index.ts src/http/index.ts src/client/meeting-panel.tsx src/client/meeting-panel-sections.tsx tests/fixtures/local-decision-risk.ts tests/unit/domain/transitions/decision-acceptance.spec.ts tests/unit/domain/transitions/decision-disposition.spec.ts tests/unit/domain/completion.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/http-boundary.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/client/client-entry.client.spec.ts scripts/smoke-profile/probe/scenarios/decision-risk-closure.js scripts/smoke-profile/result.mjs tests/unit/scripts/smoke-profile.spec.ts --check
pnpm --dir plugin verify
git diff --check
```

PASS：V7 全 exit 0；format/lint/Host+Client typecheck/test/build/environment/contract/agent-definition/package 全通过，记录实际 test 数/build 警告；没有运行 smoke。
STOP：验证失败或输出表明依赖/契约变化。恢复：build 的 lib 是既有生成产物，不手改生成文件；不恢复用户文件或关闭用户 Host。

### T8：有界任务收口、迁移证据并删除 RUNBOOK

前置状态：T0–T7 PASS；没有尚未处理的本范围失败。
允许修改：新建 `docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md`；修改 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`plugin/README.md`；删除本文。TODO.md 仅在确有对应任务时按本节精确规则收窄/删除。
禁止修改：扩大 FR-7 完成范围、把历史 smoke 当本次结果、关闭整个项目、写 completed RUNBOOK 副本、commit/push/PR/merge。

执行：
1. 新 evidence 按 Scope/Validated Contract/Executed Validation/Not Covered/Closure 五段记录日期、代码基线、实际验证命令/结果/test 数、五动作/权限/原子性/两事件/恢复/归档/UI 结果、失败及 Restore；明确当前仅自动化组合验证，真实 DSH/Browser smoke 由协调者合并后执行。无本次实际运行的项目不得写 Pass。
2. Coverage 的 FR-7/8/11 只补本范围已验证入口及该 evidence 链接，移除“没有正式 browser/HTTP/Client write control”中的 HTTP/Client 未实现结论，保留真实 Browser/DSH smoke 未覆盖。README 只说明五种行内操作、理由/证据、loopback 限制与现有类型化 HTTP；不得扩展其他操作。历史 CLIENT-FACT-VISIBILITY-EVIDENCE 不改写为新写入验证。
3. 根据用户要求，TODO 按 2–10 个文件拆为 LC-01–LC-08（另含 LC-06B，共九项）：T1→LC-01、T2→LC-02、T3→LC-03、T4→LC-04、T5→LC-05、T6→LC-06、T6B→LC-06B、T7–T8→LC-07，合并后真实 smoke→LC-08。T0 是共同前置，不单列无文件修改任务。LC-01–LC-07（含 LC-06B）合计形成“Captain/local 决策与风险控制闭环”；不得据此关闭全部 FR-7 或项目。
4. 逐项核对 `TODO.md` 中 LC-01–LC-07（含 LC-06B）的文件范围和验收点，只删除已完成条目；本轮完整收口时删除全部 LC-01–LC-07（含 LC-06B）。保留 LC-08，不能随 RUNBOOK 删除而丢失合并后 smoke。若已登记任务范围改变且不再对应上述映射，STOP 并报告差异。删除这些条目时，其 RUNBOOK 引用一并删除；保留 LC-08 的协议/长期操作规程依据与确认依据，合并后严格执行规程，不再临场设计 fixture 或操作。
5. plugin/README 更新后再次运行完整 `pnpm --dir plugin verify`，通过后运行 V8 文档链接检查与 git diff --check，记录结果到 evidence。然后 `rg -n 'RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL|Captain/local 决策与风险控制闭环 RUNBOOK' docs TODO.md .agents`：除本文外不应有仅指向本文的残留引用；若存在，先定位，限于上述允许文件且仅引用本文的条目才删除，其余 STOP。不删除正式依据/evidence。
6. 删除本文。再次执行 V8 链接/whitespace 检查，任一失败恢复本次删除的本文/引用并 STOP。最终交付 evidence/coverage 与 Not Covered，不保留 archived/completed 副本。

验证：
```sh
pnpm --dir plugin verify
rg -n 'RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL|Captain/local 决策与风险控制闭环 RUNBOOK' docs TODO.md .agents
git diff --check
```

另运行下节 V8 链接命令；删除后 rg exit1 表示无残留，为 PASS；其他命令要求 exit0。
PASS：证据完整、任务只在既定范围关闭、全部 links/diff 通过、本文已删除、剩余 smoke 明确有长期落点。
STOP：验收/证据/链接/删除前置不满足；禁止提前关闭任务或以删除 RUNBOOK 代替验证。恢复：仅恢复本次删除的本文/引用，保留所有用户改动。

## Validation Matrix

| ID / Scope | Owner 与入口 | 必须结果 |
| --- | --- | --- |
| V0 / S1 | T0 baseline verify、代码 diff | 基线可验证且未漂移；正式 local 权限已确认 |
| V1 / S2 | T1 三纯领域 specs + Host typecheck | 五动作、旧/新 authority/mode、guards、终态、原输入不变 |
| V2 / S4 | T2 archive spec | 可信 local facts 通过；伪造来源/扩权拒绝 |
| V3 / S2,S4 | T3 Runtime contract + Host typecheck | 三 local 方法、Captain gate、独立 caller receipt、版本、P2 两分支 |
| V4 / S3 | T4 HTTP/protocol/Host gate tests | 一个 prefix 九 route、五动作、严格输入/错误/响应、非 loopback 禁注册 |
| V5 / S3 | T5 panel DOM + Client typecheck | 单表单最短流程、真实 POST、锁/缓存/终态、结构化错误、刷新/迟到隔离 |
| V6 / S2,S4 | T6 Runtime/repository contract + recovery suite | 全链组合、故障零半提交、重放、冷恢复、archive facts 一致 |
| V6B / S3 | T6B smoke-profile host spec | 暂停夹具、严格 ready、失败不输出、普通模式回归；不启动真实 smoke |
| V7 / S4 | T7 pnpm verify、diff | 所有 package checks 通过，不运行 smoke |
| V8 / S1,S5 | T8 links、diff、完整 verify、引用检查 | readiness 准确、闭环边界明确、删除前后无失效引用 |

V8 固定文档链接检查（从仓库根执行；检查 docs、TODO 和 plugin README 的本地 Markdown 链接，忽略外链和 fragment-only）：

```sh
python3 - <<'PY'
import re
from pathlib import Path
files = sorted(Path('docs').rglob('*.md')) + [Path('TODO.md'), Path('plugin/README.md')]
missing = []
count = 0
for p in files:
    for raw in re.findall(r'\]\(([^)]+)\)', p.read_text()):
        target = raw.strip().split('#', 1)[0]
        if not target or '://' in target or target.startswith('mailto:'):
            continue
        target = target.removeprefix('<').removesuffix('>')
        count += 1
        if not (p.parent / target).resolve().exists():
            missing.append(f'{p}: {raw}')
print(f'Checked {count} local links; missing={len(missing)}')
for item in missing:
    print(item)
raise SystemExit(bool(missing))
PY
```

失败恢复的共通要求：测试使用 fresh fixture、finally dispose/close、afterEach cleanup/restore；仅删除本次创建的临时资源，不能关闭用户 Host、动个人 profile 或扫描生产 backend。命令失败不得扩大允许范围。

## Author Audit

| 审计项 | 结论 |
| --- | --- |
| 状态、日期、执行边界 | Author/Audit 与 Execute 分开；原 B1/B2 由本任务明确确认，正式七文档已同步 |
| Required Structure | 起点/终点、断点、scope/non-goals、数据/调用链、符号、步骤、验证/恢复、迁移/删除齐全 |
| 依据与 scope 双向追踪 | S1–S5 全有 T/V 映射；步骤仅服务五动作及其权限、持久化、UI 与收口 |
| 数据与来源 | DTO required/optional、三 carrier、local/Captain actor、ID、时间、hash/version、receipt、事件次序固定；无隐含用户身份 |
| 符号与文件 | 现有代码入口已核对；新增三 local/ForSource 方法、Client signatures、唯一共享测试 fixture/evidence 指定；无新生产文件 |
| 不变量 | caller gate、Participant 权限、历史事实、终态/重放、原子性、归档 source matching 保留 |
| 颗粒度与 PASS/STOP | T0–T8 按领域→归档→Runtime→HTTP→Client→恢复→Browser 夹具准备→全验→删除依赖排列；每步允许/禁止/命令/断言/恢复明确 |
| 执行接缝 | T0 显式允许 TODO/操作规程等十份文档；LC-06B 先准备夹具，LC-07 全验收口，合并后 LC-08 按长期规程完成七步与 Restore，无悬空 RUNBOOK 依赖 |
| 最小化 | 三现有命令、一个行内表单、真实来源证据预选；不扩 DTO 来获取 UI 阈值；无框架/新状态源/自动重试 |
| 验证与真实性 | 计划测试和本轮实际文档检查分开；无伪造 test/smoke Pass；runtime P2 测试不误放纯 transition |
| 收口 | 只关闭有界五动作闭环，TODO 按文件范围拆分，LC-01–LC-07（含 LC-06B）完成后删除、LC-08 独立保留；固定操作规程在 operations，结果迁入长期 evidence/coverage；删除后失败恢复 |

Audit：`Executable`。本轮没有执行 T0–T8；产品和新测试尚未实现。后续基线不符仍须 STOP，但不再要求用户重批 P1/P2。

## Executed Validation And Not Covered

2026-09-07 本次修订只补 TODO、本文及 Smoke 操作规程；保留此前已同步的七份正式文档。对既有场景、ready validator、Browser wrapper、UI/归档读取契约进行了静态核对。

- V8 Python 本地链接检查：128 个目标，0 个缺失，exit 0。
- TODO 静态检查：九项，文件数依次为 9/2/6/2/3/2/4/5/2；声明数与清单一致，路径存在或明确计划新建，依赖全部指向前项，无重复或倒置。
- `git diff --check` exit 0；未跟踪的本文另用 `git diff --no-index --check /dev/null docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md` 检查，exit 1 且无输出（新增 diff 的正常状态），无 whitespace diagnostic。
- `git diff --exit-code -- plugin` exit 0，无产品改动。
- 路径清单仅有计划新建的测试 fixture 与 readiness 文件尚不存在，当前未创建。
- 产品工作树没有改动；没有执行 T0–T8 或 T6B。新夹具、endpoint/Runtime/Client 与相应测试均仍待实现。

Not Covered：本轮未运行 focused tests、typecheck/build、pnpm verify、真实 HTTP、Loader、Browser、DSH smoke、模型、恢复/事务故障注入或压力测试；没有实现 endpoint/Runtime/Client/local actor，没有 commit、push、PR、merge 或 profile/凭据操作。
