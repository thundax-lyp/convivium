# 自动收敛真实 DSH 运行验证 RUNBOOK

## 状态与工作边界

- 建立日期：2026-09-07。
- 模式：Execute；用户已明确授权继续执行并修正RUNBOOK和代码以解决问题。后文Author/Audit检查为历史记录；当前进度以逐步PASS记录为准。
- 作者基线：`main` HEAD `1dd23b318f41531d02f7d03d3d543edef8259071`，初始工作区干净；作者分支 `codex/convergence-runtime-runbook`，直接使用指定项目目录，无额外 worktree。
- 作者交付物：仅本文。实施及真实运行需要后续明确的 Execute 授权；不 commit、push、创建 PR、修改共享 coverage/TODO、正式需求、产品源码或测试。
- 审计结论：`Executable`，适用于本文固定的正式工具驱动范围及前置 STOP。不是 runtime PASS；自动从 `converging` 进入 `completed` 不在现有调用链中，不能冒称已验证。

## 执行者契约

按 T0–T8 顺序执行；每步 PASS 后才能继续。允许修改的文件以各步白名单为准。不得通过调用纯 transition、修改 MeetingState、repository 写入、设置 clock、mock provider、替换 capability、修改 Session 历史、直接调用 cleanup 实现来产生 runtime 证据。脚本单测可以使用测试替身验证 probe 的拒绝行为，但输出必须标为 unit evidence。

PASS 表示该步所有命令退出码 0 且所有规定断言成立；STOP 表示立即停止后续步骤并保留本次改动，不回滚用户状态，不放宽断言、Schema、错误码或超时，不改邻接产品代码。报告最后 PASS、触发条件、文件/symbol、最小命令、实际输出、继续所需决定。不得把有条件继续变成执行者自由选择。

用户已有总授权包含按步本地提交和 T7 隔离真实 DSH smoke，不包含真实 LLM、Browser、push/PR/merge。当前因监督要求暂停实现，仅做 Author/Audit；批准本修订恢复 Execute 后沿用已有授权，不重复索取。每个完成步骤删除自身机械段并与本步代码/测试同一提交；禁止把内部编辑批次当作已完成步骤。

## 目标与当前断点

起点：已有 12 个 selector；`convergence` 只提交非法 Manager plan，检查 deterministic fallback、同请求重放和 active status。没有正式 Speaker 提交，因此不证明 D10。

终点：保留原 selector，增加五个独立 selector；每个经真实 DSH Loader、spawn continuable Session、registered tool、repository commit、status/archive 与 lifecycle 服务得到证据，result validator 不能凭 assertions 标签接受伪绿色结果。最终业务链：create →真实 Speaker context→submit→首次进展基线→refocus→replan→自动 partial/no_consensus→Captain status 触发既有归档恢复→旧提交拒绝、Session drain→wrapper Restore。

| 当前事实 | 准确证据 | 缺口与固定处理 |
| --- | --- | --- |
| fallback 无 Speaker 提交 | `plugin/scripts/smoke-profile/probe/scenarios/convergence.js::runConvergenceScenario` | 原行为保留，不能更名或把它替换成新场景 |
| 首次 fingerprint、refocus、replan、终止已实现 | `plugin/src/domain/transitions/turn-advancement.ts::advanceAfterSpeakerSubmission`；`plugin/tests/unit/domain/transitions/turn-advancement.spec.ts` | 增加正式工具驱动证据；unit fixture 不迁移为运行证明 |
| 默认 `maxStalls=3,maxReplans=1` | `plugin/src/runtime/meeting-runtime.ts::defaultLimits` | 使用默认值，active status 必须回读为 3/1；公开 create limits 不含这两个字段，禁止向输入塞内部 limits |
| fingerprint 不在公开 DTO | `plugin/src/projection/status.ts::projectMeetingStatus` | 用第一 Turn 后 0/0、下一 Turn 1/0、结构变化后 0/0 的因果序列验证；canonical tuple 内容仅由既有 unit 覆盖 |
| 业务完成先于硬限制 | `plugin/src/domain/completion.ts::judgeTurnCompletion` | 分离 Turn 与 message budget，各用第二条正式提交完成条件 |
| 完成提交返回 `converging` | `advanceAfterSpeakerSubmission` completed 分支 | 先断言 `converging` 和无下一 Turn，再显式 Captain `convivium_end_meeting(outcome=completed)`；不得写“submit 自动 completed” |
| terminal status 读取会推进归档 | `plugin/src/runtime/application-service/meeting-query.ts::createMeetingQueryApplication.getStatus` | submit result 固定 execution outcome；status 轮询允许中间 terminal/archiving，最终必须 archived，不能要求一定观测到瞬时 partial |
| wrapper JSON 在 Restore 前输出 | `plugin/scripts/smoke-profile/index.mjs::main/restore/stopHost` | `ok:true` 不足，T7 另校验退出、临时根消失和端口释放；SIGKILL 超时分支不自行证明整个进程树退出 |

## Scope 与 Non-goals

Scope：S1 原 fallback 证据保持；S2 首次 fingerprint、refocus/replan、partial/stalled；S3 一个有合法未满足 criterion 依据的 blocking question 导致 no_consensus；S4 新 Proposal 进展重置两个计数；S5 Turn/message 两类最后有效讨论业务优先；S6 每个新增场景终态不可变、撤销及 drain、wrapper 清理；S7 selector/result/tests、长期证据与删除。

Non-goals：领域重构、Client、Manager/hybrid 全矩阵、改变收敛预算、时间预算（不得 mock 时间或以脆弱 sleep 造最后边界）、blocking Position 分支穷举、任务/邮件取消新场景、跨 Host、SQLite、压力、真实 LLM、自动完成产品新行为、共享 coverage/TODO 整合。数据库迁移/新事件/新路由/新 provider/新持久化格式/兼容写入：`Not Applicable`，本任务不改变产品协议或状态。

## 依据、结构和调用链

### 真相源

- [需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-4、FR-6、FR-8.8、BR-3、Confirmed Meeting Convergence Rules D6–D10。
- [Agent Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：CreateMeetingInputV1、TurnSubmissionV1、CompletionClaimsV1、EndMeetingInputV1、四阶段 MeetingStatusResultV1、工具调用者边界。
- [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)：Meeting convergence commands and commit contract。
- [Domain Model](./DOMAIN-MODEL-DESIGN.md)：Confirmed Meeting Convergence Domain；[Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：18.1、19。
- [Architecture](../00-governance/ARCHITECTURE.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md)、[PR Rules](../00-governance/PR-RULES.md)。
- [DSH smoke 操作](../50-operations/HOW-TO-DSH-SMOKE.md)：自动入口、凭据隔离、失败与 Restore；不使用其中人工模型启动流程。

### 正式输入与所有权

所有新增场景使用 `createInput()` 的现有基础值，仅覆盖以下字段；未列字段保留基础值，不添加 `undefined`/null 占位字段：

| 字段 | 固定值及来源 |
| --- | --- |
| `protocolVersion` | required literal `1` |
| `requestId` | required `smoke-` + 完整 selector + `-create-1`；每个 selector 唯一 |
| `teamId` | `smoke-team`，仅在本次独立临时 workspace |
| `selectionMode` | `rule_based`，避免手工 Manager plan 决定 refocus/replan 原因 |
| `participants` | `[{participantKey:"a",displayName:"A"}]`；`agenda[0].requiredParticipantKeys=["a"]` |
| `objectiveContract` | 基础值：requiredOutputs=[]、一个未满足 `smoke-order` criterion、无 constraints/reviewers/risk authorities，acceptableRiskLevel=low |
| `agenda` | 保留唯一 `agenda-1`，completionCriteria=["smoke-order"] |
| `limits` | S2/S3/S4：`{maxTurns:10,maxSpeakersPerTurn:1,maxTotalMessages:100}`；Turn budget：`{maxTurns:2,maxSpeakersPerTurn:1,maxTotalMessages:100}`；message budget：`{maxTurns:10,maxSpeakersPerTurn:1,maxTotalMessages:2}` |

`CreateMeetingInputSchema` 位于 `plugin/src/protocol/commands.ts`；`PublicMeetingLimitsV1` 位于 `plugin/src/protocol/types.ts`。maxStalls/maxReplans 使用 Runtime 默认值，不在 Config 中预建开关。`plugin/src/config.ts::Config` 的 speakerTimeoutMs 仍由原 smoke patch 设置 60000，不新增配置。

每次 `submit_turn` 的 required 字段：`protocolVersion=1`，`meetingId` 从 create result，`turnId/stepId/attemptId/deliveryId/agendaItemId` 分别来自 `waitForSpeakerContext` 返回的 `value.turn.id/value.step.id/value.attempt.attemptId/value.attempt.deliveryId/value.activeAgendaItem.id`；`kind="statement"`，`content=selector+":a:"+提交序号`，`mentions=[]`、`taskIds=[]`、`agendaRelation="on_topic"`、`changes={}`。completion 两场景第二次 kind 为 `evidence`。optional `replyTo` 不发送，optional `completionClaims` 仅在下文指定时发送。

- S3 第一提交 `changes.questions=[{text:"Unresolved smoke criterion",blocking:true,affectedOutputIds:[],affectedCriterionIds:[context.objectiveContract.acceptanceCriteria[0].id],violatedConstraintIds:[]}]`；不设置 directedTo，避免引入 direct-question 调度语义。依据 criterion 必须确实未满足。Runtime 生成 `question-${deliveryId}-1`；从 status.questions 取得并校验该 id、askedBy、blocking、status=open、criterion reference。
- S4 第四提交 `changes.proposals=[{title:"New structured progress",description:"A new proposal after replan"}]`，不带 proposalId/expectedRevision；Runtime 生成 `${deliveryId}-proposal-1`，revision=1。该 Proposal 不解决 agenda/criterion，因此必须继续讨论。
- S5 第二提交 `completionClaims={criterionClaims:[{subjectId:context.objectiveContract.acceptanceCriteria[0].id,evidenceMessageIds:[firstSubmit.result.messageId],taskIds:[]}],agendaResolution:{agendaItemId:context.activeAgendaItem.id,resolution:"Smoke criterion satisfied",evidenceMessageIds:[firstSubmit.result.messageId]}}`。证据必须是该会议第一条已提交消息；不使用第二次尚未提交的 ID、不引入 waiver。
- S5 在确认第二提交 result.meetingStatus=converging 后，Captain end 输入固定 `protocolVersion=1,meetingId,expectedMeetingVersion=最新 status.meetingVersion,outcome="completed",reason="Budget boundary objective satisfied",acceptedDecisionIds=[],deferredAgendaItemIds=[],waivers=[],requestId="smoke-"+selector+"-end-1"`。期望 result.status=completed、terminationCode=objective_satisfied。

调用者是工具 execute 的真实 `agent`，不是输入里自报 actor。Captain 复用原 probe captain；Speaker 必须使用 `waitForSpeakerContext(...).agent`，不能复用已 idle/disposed 的旧 Agent 提交下一 Turn。首次 attempt 可为 `attempt-0`，禁止推导为 `turn-1-attempt-0`。每次从最新 status.currentAttemptId 等待对应 context，并交叉校验 meeting/participant/turn/step/attempt/delivery。DSH callId 全部使用 `runtime.nextCall()`，只作调用追踪；submit receipt identity 是 deliveryId，不能加自造 requestId。messageId 为 Runtime 的 `message-${deliveryId}`。timestamps 由 Runtime `Date.now()` 产生；version 来自 command/status envelope，不假定初始 version 为 0；非终态一次 submit 应增加一个版本。

### 内部数据与公开映射

canonical owner 为 MeetingState；`progressFingerprint?:string` 仅在完成 Turn 后创建/替换，`stallCount:number,replanCount:number` 初始 0。fingerprint 固定七元 tuple：agenda `[id,status,resolution??""]`；accepted decisions `[id,proposalId,proposalRevision]`；open blocking questions `[id]`；current revision blocking objection positions `[proposalId,revision,positionId,participantId,position]`；terminal tasks `[id,status,resultSummary??""]`；latest proposals `[id,revision,status]`；active facts `[id,kind,subjectId,result,sortedEvidenceIds,sortedTaskIds]`。排序与序列化完全归 `createProgressFingerprint`，probe 不复制这个函数，不读取私有 repository。

active DTO `stallCount/maxStalls/replanCount/maxReplans` required numbers 逐字段映射 committed state；`currentTurn` optional，normal 公共 reason 为 `explore`（`projection/status.ts::turn` 的 `reason ?? intent`），refocus 为 intent=refocus/reason=refocus，replan 为 intent=refocus/reason=replan。terminal/archiving/archived 不输出 active counters/currentTurn/currentAttemptId/currentSpeakerId；不能对 terminal 写 stallCount=3 断言。

内部 termination 与 execution-terminal DTO required `{code,reason,decisionIds,unresolvedQuestionIds,dissentingPositionIds,blockingAgendaItemIds,finalMessage,endedAt}`，IDs 是 string[]，endedAt 为 Runtime number；archiving/archived 顶层 termination 只保留 required `{code,reason,decisionIds,unresolvedQuestionIds}`。archive.package.termination 的公开契约要求同四字段，当前 materializeArchivePackage 实际保留内部 termination 的附加字段；只比较两者共有四字段，不对完整对象 deep-equal。archive.package.endedAt 独立保存时间；不能向归档顶层 termination 索取执行阶段独有字段。S2/S4 code=stalled；S3 code=no_consensus，unresolvedQuestionIds 精确含第一提交 question；S5 code=objective_satisfied。archive.status 为 archived 时，归档包 `formalTranscript` 保存全部消息，`unresolvedQuestions` 保存 S3 question，`proposals` 保存 S4 Proposal，`completionFacts` 保存 S5 criterion_evidence/agenda_resolution；termination 的共有四字段在 status 与 archive.package 一致，当前控制与发言身份缺失、pendingHandRaises=[]。

### 唯一调用链与文件/symbol

1. `plugin/scripts/smoke-profile/index.mjs::main` 打包并安装插件/probe，通过 pinned `@deepseek-ai/dsh@0.1.1-rc.2` web profile 和 spawn provider 启动；`writeProbePackage` 复制已有 probe 目录。
2. `plugin/scripts/smoke-profile/probe/index.js::run/runSelectedScenario` →新函数；`createProbeSupport::callTool` → `ctx.tools.execute({callId,name,arguments:{input},agent,signal})`。
3. `plugin/src/tools/register-tools.ts::registerCreateAndStatusTools/registerSubmitAndControlTools` →既有 caller resolver、Schema → `plugin/src/runtime/application-service/create-meeting.ts::createMeetingApplication` → `plugin/src/runtime/application-service/initialize-meeting-turn.ts::initializeFirstMeetingTurn/assignTurnAttempt`。
4. Speaker inbox → `plugin/src/runtime/application-service/meeting-turn.ts::createMeetingTurnApplication.submitTurn` → `plugin/src/domain/transitions/speaker-submission.ts::submitSpeakerAndAdvanceMeeting` → `plugin/src/domain/transitions/question.ts::addSubmittedQuestions` / `plugin/src/domain/completion.ts::applyCompletionClaims` → `advanceAfterSpeakerSubmission` → `judgeTurnCompletion` → fingerprint、`planRuleBasedTurn` 或 termination。
5. `plugin/src/repository/domain/domain-meeting-repository.ts::DomainMeetingRepository.execute` 原子发布 state、events、receipt、outbox。submit requestHash=`JSON.stringify(input)`；后续 dispatch 在 commit 后，不由 probe直接调用。
6. status → `createMeetingQueryApplication.getStatus` → `recoverArchiveForCaptain` → `plugin/src/runtime/services/meeting-archive-service.ts::recoverArchive/beginArchiveFromTermination/cleanupOwnedSessions/finalizeArchive` → capability revoke、DSH interrupt/drain、关闭 ownership → `projectMeetingStatus`。
7. DSH `ctx.agents.get(id)` 验证 resident 消失，`ctx.subagents.listChildren(captain.agent.session.id,signal)` 验证持久 child 的 mode=continuable/activity=inactive；保留持久 Session 不等于未清理。rc.2 公开 `SubagentRuntime.listChildren`、`drainContinuableChildren` 已在本地安装声明中核对，probe只调用前者观察，绝不自己 drain。
8. `writeResult` 经临时 JSON rename → `validateScenarioResult(value,expectedScenario)` → wrapper stdout → finally Restore。result 不是新的产品协议。

事件顺序由现有 submit transition 组合：Speaker 提交事件→可选 question/proposal/completion_fact 事件→`meeting.replanned`（refocus/replan，payload meetingId/from/to/meetingVersion/reason）→下一 `turn.planned/turn.started/speaker.assigned/speaker.started/speaker_attempt.started`；耗尽时最后为 `meeting.ended`；事务编码再赋 eventSeq。仅 status/command 无法读取这些事件或 receipt/outbox 原文，因此 runtime 不宣称 event 精确顺序、rollback 或 receipt 物理内容已验证；由原有领域/repository tests 保持覆盖。

## 固定场景及可达性

新增 selector 与唯一 export 均位于既有 `plugin/scripts/smoke-profile/probe/scenarios/convergence.js`：

| selector | 新函数，签名均 `async (runtime)` | 提交序列与必需观察 | 依据/步骤 |
| --- | --- | --- | --- |
| convergence（原有） | `runConvergenceScenario`（保留） | 原三标签及 fallback/replay/status 原断言 | FR-4/D8，T1/T6 |
| convergence-stalled | `runConvergenceStalledScenario` | 空 changes ×4；前三次后 0/0 explore、1/0 refocus、2/1 replan；第四 result.meetingStatus=partial，archive code=stalled | FR-6/D10，T2 |
| convergence-no-consensus | `runConvergenceNoConsensusScenario` | 第一提交合法 blocking question，后面空 changes ×3；前三次相同计数；第四 result.meetingStatus=no_consensus，archive code=no_consensus 且 question 未消失 | FR-6/FR-8/D10，T3 |
| convergence-reset | `runConvergenceResetScenario` | 前三次空 changes 达到 2/1；第四新增 Proposal 后 0/0 explore；第五 1/0 refocus；第六 2/1 replan；第七 partial/stalled | FR-6/D10，T4 |
| convergence-turn-budget-completion | `runConvergenceTurnBudgetCompletionScenario` | maxTurns=2，maxTotalMessages=100；第一条证据，第二条 criterion+agenda claims；第二条提交前 context.turn.seq=2；result=converging，无下一 Turn；Captain completed/end；archive code=objective_satisfied | FR-8.8/BR-3，T5 |
| convergence-message-budget-completion | `runConvergenceMessageBudgetCompletionScenario` | maxTurns=10，maxTotalMessages=2；同上，第二条 result.messageSeq=2；证明没有 message_limit 抢先终止 | FR-8.8/BR-3，T5 |

S2–S4 通过默认 maxStalls/maxReplans 即可到达，无配置扩展。一个 required、available Participant 无 task，不因 consecutive scoring penalty 变为不可调度。S3 使用合法 unresolved criterion 依据，不能照搬 unit 中空依据 blocking fixture。S4 Proposal 更新 fingerprint 而不满足目标，足以重置两个计数并证明不是只重置 stallCount。S5 输入已被公开 create limits 支持，不需要 Config 或领域改动。每次 submit 是一个完整、单 Speaker Turn。

前置 STOP：基线无法满足本表（包括无 context、计划进入 waiting、第二 Turn 不存在、question 被拒、normal/refocus/replan 不匹配、limits 被忽略、converging 不可经 completed end 收口）时，保留实际 command/status，判为产品/组合缺口，不修改实现；如果验收被要求为“无需 Captain end 自动 completed”，当前代码无该分支，先 STOP，请求独立产品行为决定。不能新增后台结束器。maxDurationMs 临界时序、单独 maxReplans 耗尽而 maxStalls 未耗尽的分支不可用本文固定默认值独立区分，明确 Not Covered，不能伪称五个 selector 穷举全部限制。

## Result 合约与脚本单测

原 convergence result 兼容原结构与三标签，不能要求它输出新 observed。五个新增 selector 使用同一最小 schema；仅作本任务脚本输出，所有字段 required；只有结构中显式列出的 union 允许 null，禁止其他 null、缺失、额外字段和重复标签：

```ts
// 新的脚本 result 结构规范；不新增产品类型文件。
type ConvergenceProbeResult = {
  ok: true;
  scenario: string; // 仅上表五个新 literal
  assertions: string[];
  meetingId: string;
  observed: {
    submissions: Array<{
      turnId: string; turnSeq: number; attemptId: string; deliveryId: string;
      messageId: string; messageSeq: number; meetingVersion: number;
      meetingStatus: string;
    }>;
    checkpoints: Array<{
      afterSubmission: number; meetingVersion: number; status: "running" | "converging";
      stallCount: number; maxStalls: 3; replanCount: number; maxReplans: 1;
      nextTurnId: string | null; intent: string | null; reason: string | null;
    }>;
    questionId: string | null;
    proposalId: string | null;
    endResult: { status: "completed"; terminationCode: "objective_satisfied" } | null;
    archived: object; // 完整 archived status result，按下列字段关系校验
    archivedVersion: number;
    lateSubmit: { kind: "protocol" | "tool"; code: string };
    stableAfterLateSubmit: boolean;
    children: Array<{ id: string; mode: "continuable"; activity: "inactive" }>;
    residentSessionIds: string[];
  };
};
```

上面 null 是 result-only 的显式“未发生/无下一 Turn”，不得原样发送给产品 Schema。无 optional 字段。producer 为 probe 的实际返回值；consumer 为 result.mjs 与 scripts tests；结果仅属于当前临时运行，不参与恢复、领域状态或授权。`archived` 原样保留公开 DTO，不复制产品 Schema 或引入包依赖，validator 只严格校验以下本场景相关字段，允许该产品 DTO 的其他既有字段。

固定 assertions 数组按顺序构造：

- stalled：`["first-progress-baseline","refocus-observed","replan-observed","partial-stalled","terminal-submit-rejected","archive-consistent","sessions-drained"]`。
- no-consensus：同上把 `partial-stalled` 替换为 `blocking-question-no-consensus`。
- reset：`["first-progress-baseline","refocus-observed","replan-observed","progress-resets-both-counters","refocus-after-reset","replan-after-reset","partial-stalled","terminal-submit-rejected","archive-consistent","sessions-drained"]`。
- 两个 budget：`["last-valid-turn-before-budget","business-completion-before-budget","captain-completed-after-converging","terminal-submit-rejected","archive-consistent","sessions-drained"]`。

在 `plugin/scripts/smoke-profile/result.mjs::validateScenarioResult` 为五个新 literal 增加调用唯一私有 `validateConvergenceRuntimeResult(value,expectedScenario)`，失败统一抛 `Error("Convergence runtime result is invalid.")`。不更改其他 selector 的兼容规则。该私有函数同步返回 void，验证成功仍返回原 value；不得仅相信 booleans 或标签：

1. 顶层与 observed/每条 submission/checkpoint/lateSubmit/child exact keys；非空 string、有限非负整数 version/counters、正整数 seq；新五个 literal 与 expectedScenario 完全相等；assertions 精确顺序与长度一致。
2. submissions 数量分别 4/4/7/2/2，messageSeq=1..N、turnSeq=1..N、turnId/attemptId/deliveryId/messageId 各自唯一；messageId=`message-`+deliveryId；版本严格增加。非最后提交 meetingStatus=running；末条分别 partial/no_consensus/partial/converging/converging。
3. checkpoints 只保存前三次、前三次、前六次、两次、两次。afterSubmission 连续从 1 起；meetingVersion 等于对应 submit.meetingVersion（活跃读取无其他 command）。S2/S3 的三行 0/0 explore、1/0 refocus、2/1 replan；S4 六行重复此序列。前述 reason=explore 时 intent=explore；reason=refocus/replan 时 intent=refocus。每行 nextTurnId 非空且与下一 submission.turnId 一致，最后尚未提交的下一 Turn 也必须在 probe 回读验证。预算场景第一行同 normal，第二行 converging、0/0、nextTurnId/intent/reason=null。
4. `observed.archived.status="archived"`，`observed.archived.meetingId` 与顶层 meetingId 一致；`observed.archivedVersion` 为 status envelope version，等于 `observed.archived.meetingVersion` 且大于最后 submit.meetingVersion；`observed.archived.archive.package.meetingId` 相同。`observed.archived.termination` 与 `observed.archived.archive.package.termination` 两处抽取 code/reason/decisionIds/unresolvedQuestionIds 后深相等、code 符合场景；`observed.archived.archive.package.endedAt` 和 `observed.archived.archive.archivedAt` 为有限 number。`observed.archived` 无 currentTurn/currentSpeakerId/currentAttemptId/stallCount/replanCount，pendingHandRaises=[]，meetingTasks=[]。
5. `observed.archived.archive.package.formalTranscript` 与 `observed.submissions` 数量一致，逐项 transcript.id=submission.messageId、transcript.seq=submission.messageSeq、turnId相等，speaker 全为 participant-a，content 为 selector+":a:"+序号；无额外消息。S3 questionId 必须为第一 delivery 派生值，termination.unresolvedQuestionIds 精确为该单元素数组，`observed.archived.archive.package.unresolvedQuestions` 有同 id/open/blocking/askedBy=participant-a。其他场景 questionId=null、unresolvedQuestionIds=[]。S4 proposalId 必须为第四 delivery 派生值且 `observed.archived.archive.package.proposals` 中对应 proposal revision=1；其他场景 proposalId=null。所有场景归档 termination.decisionIds=[]；dissentingPositionIds/blockingAgendaItemIds 不在归档顶层 termination 中，禁止在顶层断言这些数组。
6. 预算两场景 `observed.endResult` 为规定 completed 对象；`observed.archived.archive.package.objectiveContract.acceptanceCriteria` 唯一条 satisfied=true，`observed.archived.archive.package.agenda` 唯一条 status=resolved；`observed.archived.archive.package.completionFacts` 含 active criterion_evidence 与 agenda_resolution，均以第一 messageId 为 evidenceMessageIds；`observed.archived.limits` 三个已设置公开字段精确匹配本场景，其他场景 endResult=null。
7. children 精确包含 `meetingId+"-manager-manager"` 与 `meetingId+"-participant-participant-a"` 两个不同 ID（排序输出），mode/activity 固定，residentSessionIds=[]。stableAfterLateSubmit 必须 true，同时 probe 自己深比较归档前后，不能自行硬编码 true。
8. lateSubmit.kind=protocol 时 code 仅 IMMUTABLE_MEETING/ARCHIVED_MEETING/UNAUTHORIZED_CALLER；kind=tool 时只允许下文从两个已知 DSH 错误精确归一化的 code。任意 ok=true、STALE_ATTEMPT、IDEMPOTENCY_CONFLICT 或未知异常在终态观察中失败。

唯一新增测试文件：`plugin/tests/unit/scripts/convergence-probe.spec.ts`。按实施顺序导入已创建的 exports：T2 只导入 runConvergenceStalledScenario；T3 增加 runConvergenceNoConsensusScenario；T4 增加 runConvergenceResetScenario；T5 才增加两个 budget exports。每步同步新增该 export 的 happy-path 和负例，不提前引用后续不存在的函数。用 runtime test double 顺序喂入与场景表一致的正式工具结果/context（不 import 领域函数），捕获 callTool/ctx.tools.execute/writeResult。它只证明脚本能够驱动、检查并拒绝错误输出，不是 DSH evidence。每个场景一个 happy-path，另用表驱动逐一注入错误 counter/reason、缺少 context、非法 question、未重置 replan、错误 budget outcome、late submit 成功、归档多一条消息、child active/resident；每项必须拒绝并且不能写 ok=true。fake clock 只加速测试轮询，不进入 smoke。

`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts` 保留原用例，新增五场景完整 fixture 的 accept 和单字段破坏 reject：每个 required key 删除、数字错类型、重复 message/child ID、错 selector、少/多/重复/乱序 label、只标签没有 observed、错误 counters、错误 terminal code、question 缺失、proposal 缺失、预算伪 completed、late failure 未拒绝、resident 非空、archive version/内容不一致。不得将 validator 自己输出作为 fixture oracle。

## 不变量及失败恢复

- 不调用 `runtime.setMeetingId` 为新场景触发旧自动 driver；在 `driveParticipant` 早退列表显式加入五个 selector，防止旧 `A/C/B` 提交与新 driver 竞争。
- 只复用 create、status、submit、budget completed end 四类正式工具；没有 Captain 手动 partial/no_consensus 来伪造自动终止。S2/S3/S4 不允许调用 endMeeting。
- 非终态提交失败不重试、不跳下一条；首次错误即 STOP。不得因后台超时把不同 attempt 当成同一次成功。等待 context、archive 上限均 30000ms，间隔 100ms；原 speaker timeout 保留 60000ms。
- terminal 后不 followup/resume Speaker，不自行 drain。保存最终提交的 Agent 对象和完全相同输入，通过 raw ctx.tools.execute 再调用，绕开会抛异常的 callTool，只观察失败。
- raw result.value.ok=false 时只接受上述三种 code；result.isError=true 时 error.message 必须包含 `caller Session capability has been revoked` 或 `is not live in this store`，依次归一化为 `CAPABILITY_REVOKED` / `AGENT_NOT_LIVE`；没有匹配即失败。不把任意 thrown Error 当通过。
- 先轮询到 archived，保存完整 result/version，再 late submit，再 Captain status：完整 result JSON 与 version 必须相等。这样不把归档自身合法版本推进误判为旧提交副作用。
- probe 失败仍由原 run catch 输出 ok=false，原 finally dispose captain，wrapper finally stopHost/restore；不保存新持久状态，不需要产品数据回滚。保留有界错误输出，不能删除别人的临时根、终止无关进程或回滚用户文件。
- wrapper 原 restore 验证临时根删除，但未显式 probe 端口释放；T7 独立复核。失败分支拿不到完整 JSON/PID/端口证据时 Restore 标 Not Covered 并 STOP，不补造路径、不顺手改 runner 生命周期。

## 机械执行步骤

以下命令工作目录均为仓库根目录。T0实际完成记录在下方；T1.0–T1.7及T2–T8均未完成。本轮修订不执行这些步骤。

### T0 已完成：基线与许可检查

实际结果：4bdcaf8 记录分支/工作区及三个既有 suite 共32 tests通过。此前检查了未在计划中的两个fixture路径，不能当作正式新增路径证据；T2执行前必须确认 plugin/tests/unit/scripts/convergence-probe.spec.ts 不存在，T8创建 evidence 前须确认目标归属。T0未产生代码或测试文件；T1当前未通过。

## 修订后的执行边界与保留定义

本节及“Result 合约”一直保留到 T8；删除某一步不能删除本节。2026-09-07 当前为 Author/Audit，待监督批准后才恢复 Execute。T0 已在 4bdcaf8 完成；7de37d6/2623f79 错误地实现并收口 T1，0fcb586 已追加纠正，三者均不是 T1 PASS，不重写历史。当前两份脚本增量均未验收，之前“3 tests PASS”只表示弱 validator 放行了不完整 fixture，不能作为成功证据。

后续 T1.0→T1.1→T1.2→T1.3→T1.4→T1.5→T1.6→T1.7→T2 顺序唯一。每步全部 PASS 后记录日期、实际命令/退出码、断言范围、Not Covered、先前提交；删除**仅本步**机械段，把本步所有代码/测试/本文变化放入一个新 commit。T1.7 只删除自身及空 T1 容器，不重复删除/提交已完成子步骤。每步提交前完整读 staged diff、运行 cached check，提交后读 status/log，向监督报告后继续；本轮 Author 不执行这些提交。T0 原基线及作者提交保留为祖先；自身合法提交前移不触发基线 STOP。

### 增量隔离的固定规则

恢复执行时只允许整理以下已知失败增量：
- result.mjs 当前 SHA-256 为 65c95f394c2bcbb1612a0c10611f60f446e8f745f03e927d754ff044821e85e9。
- contract spec 当前 SHA-256 为 e342cf97c2752359c19207172290199f3791247e0c3d1f2789ef476ad0b09bce。

文件完整路径分别是 plugin/scripts/smoke-profile/result.mjs、plugin/tests/unit/scripts/smoke-profile-contract.spec.ts。若 hash 改变，STOP 交监督确认新增改动归属，不能覆盖。T1.0 将两文件字节复制到独占 OS 临时目录并 cmp 验证；记录该目录和 hash 于任务消息及 commit body（不把机器绝对路径写进仓库）。只用 apply_patch 逆向移除这两文件相对 0fcb586 的已知失败增量，保留 HEAD 原有代码/原测试；不得改当前 RUNBOOK、其他文件或 Git 历史来恢复整棵树。完成后两文件对 0fcb586 必须无差异。备份保留供监督恢复，最终交付报告位置；不自动删除。后续每步从干净的上一合法提交开始，因此不会把后续半成品混入当步提交。此整理规则属于待批准的新 RUNBOOK Execute 动作，本 Author 回合只说明、不执行。

### Fixture 唯一位置、类型和独立来源

所有新增 fixture/test helper 仅位于 plugin/tests/unit/scripts/smoke-profile-contract.spec.ts：
- 私有类型 ConvergenceScenario：五个新 literal 的 union。
- 私有接口 ConvergenceFixture：逐字采用上方 ConvergenceProbeResult 的全部字段；scenario 使用该 union，archived 使用从 ../../../src/protocol/types.js 导入的 ArchivedMeetingStatusResultV1。不创建产品类型或新 fixture 文件。
- private createConvergenceFixture(scenario: ConvergenceScenario): ConvergenceFixture：按下列固定数据构造，每次返回独立新对象；不得 import validator 的常量、调用 validator/生产 transition 生成 expected、读取磁盘或 Session。
- private assertFixtureContract(fixture: ConvergenceFixture): void：调用生产 MeetingStatusResultSchema({ ...fixture.observed.archived }) 验证归档 DTO；从 ../../../src/protocol/status.js 导入 Schema。之后以本节固定 literal/公式逐一断言 ID、时间、版本、场景数组和跨字段关系。不能用 validateScenarioResult 代替此函数。生产 Schema 只验证 DTO，不证明 runtime。
- private mutateFixture(fixture: ConvergenceFixture, path: readonly (string | number)[], operation: "delete" | "replace", replacement?: unknown): unknown：structuredClone 后沿 path 查找对象；每层必须是非 null object，用 Reflect.get/Reflect.set/Reflect.deleteProperty 操作，缺失中间层 throw Error；禁止 as any、as unknown、non-null assertion。负例只改指定单个 leaf，不修正关联字段。
- 除上列函数外不新增 fixture builder/registry/新模块；表驱动 it 和本地常量可直接放 describe 中。所有正例先运行 assertFixtureContract 再测试 validator，并断言返回原对象（toBe），不是 truthy。

生产依据：protocol/types.ts 的 ArchivedMeetingStatusResultV1/PublicArchivePackageV1/PublicMeetingMessageV1，projection/status.ts::projectMeetingStatus 的 archive 分支，以及 runtime/services/meeting-archive-service.ts::materializeArchivePackage。后者保留部分内部额外字段，fixture 使用完整公开 DTO required 字段、省略 optional；validator 允许 DTO 合法额外字段。**消息字段名是 id，不是 messageId；archive.archivedAt 不属于 package。**

### 五场景固定数据

下列数字、短 ID 是 unit fixture 数据，不能复制到真实 probe 推导 ID/version。定义 s 为完整 selector；n 为提交数；b 为两个 budget 场景；q 为 no-consensus；p 为 reset：

| s 后缀 | n | checkpoints | 末 submission.meetingStatus | termination.code | maxTurns/maxTotalMessages |
| --- | --- | --- | --- | --- | --- |
| stalled | 4 | 3 | partial | stalled | 10/100 |
| no-consensus | 4 | 3 | no_consensus | no_consensus | 10/100 |
| reset | 7 | 6 | partial | stalled | 10/100 |
| turn-budget-completion | 2 | 2 | converging | objective_satisfied | 2/100 |
| message-budget-completion | 2 | 2 | converging | objective_satisfied | 10/2 |

共同 fixture：meetingId="m"，teamId="smoke-team"，topic="Convergence fixture"，objective="Verify convergence"，t=1700000000000。上述五行分别提供独立 expected 参数；不先造 stalled 再突变成为其他正例。assertions 必须采用“固定 assertions”原数组，各次 fresh array。

submissions 的零基 i=0..n-1：{turnId:"t"+i,turnSeq:i+1,attemptId:"a"+i,deliveryId:"d"+i,messageId:"message-d"+i,messageSeq:i+1,meetingVersion:11+i,meetingStatus:最后一条取表中值否则"running"}。每一种 ID 集合分别去重，不禁止不同种类碰巧同名。checkpoints 零基 i：afterSubmission=i+1，meetingVersion=11+i，maxStalls=3，maxReplans=1；b 且 i=1 时 status=converging、stallCount/replanCount=0、nextTurnId/intent/reason=null；否则 status=running、stallCount=i%3、replanCount=i%3===2?1:0、nextTurnId="t"+(i+1)、intent=i%3===0?"explore":"refocus"、reason=["explore","refocus","replan"][i%3]。

questionId=q?"question-d0-1":null；proposalId=p?"d3-proposal-1":null；endResult=b?{status:"completed",terminationCode:"objective_satisfied"}:null；archivedVersion=20+n；lateSubmit={kind:"protocol",code:"ARCHIVED_MEETING"}；stableAfterLateSubmit=true；children 精确 [{id:"m-manager-manager",mode:"continuable",activity:"inactive"},{id:"m-participant-participant-a",mode:"continuable",activity:"inactive"}]；residentSessionIds=[]。

完整 archived DTO 构造（每条 required 字段均列出，不能只写 archive={}）：
- meetingId="m"，meetingVersion=20+n，topic/objective 取上述常量，continuationMaterials=[]；limits={maxTurns:表中数,maxSpeakersPerTurn:1,maxTotalMessages:表中数}；meetingTasks=[]。
- status="archived"，pendingHandRaises=[]，pauseControl={action:"none"}。
- termination={code:表中值,reason:表中值,decisionIds:[],unresolvedQuestionIds:q?["question-d0-1"]:[]}。
- archive={package:下列完整对象,archivedAt:t+102}；禁止 package.archivedAt；禁止 active 状态字段。

完整 archive.package：
- schemaVersion=1，meetingId="m"，teamId="smoke-team"，finalSummary=termination.reason，endedAt=t+100，materializedAt=t+101。
- objectiveContract={requiredOutputs:[],acceptanceCriteria:[{id:"criterion-smoke-order",description:"Smoke criterion",satisfied:b}],hardConstraints:[],requiredReviewers:[],riskAcceptanceAuthority:[],acceptableRiskLevel:"low"}。
- agenda=[{id:"agenda-agenda-1",title:"Smoke agenda",objective:"Verify convergence",inScope:["convergence"],outOfScope:[],completionCriteria:["criterion-smoke-order"],requiredParticipants:["participant-a"],relatedTaskIds:[],status:b?"resolved":"discussing",...(b?{resolution:"Smoke criterion satisfied"}:{})}]。
- artifactRefs=[],acceptedDecisions=[],decisionHistory=[],issues=[],parkingLot=[]。
- participantProvenance=[{participantId:"participant-a",displayName:"A"}]。
- termination 使用另一次深拷贝的同四字段对象；内外值一致但不能共享可变引用。
- formalTranscript：对 i=0..n-1 构造 {id:"message-d"+i,seq:i+1,turnId:"t"+i,stepId:"step-"+i,speaker:"participant-a",agendaItemId:"agenda-agenda-1",kind:b&&i===1?"evidence":"statement",content:s+":a:"+(i+1),mentions:[],taskIds:[],createdAt:t+i}。optional replyTo 省略。
- unresolvedQuestions=q?[{id:"question-d0-1",text:"Unresolved smoke criterion",askedBy:"participant-a",agendaItemId:"agenda-agenda-1",blocking:true,affectedOutputIds:[],affectedCriterionIds:["criterion-smoke-order"],violatedConstraintIds:[],status:"open"}]:[]。
- proposals=p?[{id:"d3-proposal-1",agendaItemId:"agenda-agenda-1",title:"New structured progress",description:"A new proposal after replan",revision:1,status:"draft",positions:[]}]:[]。
- completionFacts=b?[{id:"fact-criterion",kind:"criterion_evidence",subjectId:"criterion-smoke-order",assertedBy:"participant-a",result:"supported",evidenceMessageIds:["message-d0"],taskIds:[],status:"active"},{id:"fact-agenda",kind:"agenda_resolution",subjectId:"agenda-agenda-1",assertedBy:"participant-a",result:"resolved",evidenceMessageIds:["message-d0"],taskIds:[],status:"active",reason:"Smoke criterion satisfied"}]:[]。事实 kind/result 来源为 domain/completion.ts::applyCompletionClaims；fixture fact ID 不声称是实际 runtime 分配。

### Validator 与反例的固定语义

只修改 result.mjs 的 validateScenarioResult 与私有 validateConvergenceRuntimeResult(value,expectedScenario)。其内部局部 helper 固定 exactKeys(value,keys):boolean、isRecord(value):boolean、nonempty(value):boolean、integer(value):boolean、requireValid(condition):void。integer=Number.isInteger(value)&&value>=0；nonempty=typeof value==="string"&&value.length>0；失败均 throw new Error("Convergence runtime result is invalid.")。在已有通用入口检查**之前**对当前步骤已支持的新 literal 分派并 return 原 value，保证新场景错误统一；其余 selector 原入口不变。每步只增加该步完整支持的 literal，尚未支持的 literal 沿原未知 selector 语义处理且 runner 未注册；T1.6 后五个 literal 完整接线。禁止 startsWith。对对象先 isRecord/数组先 Array.isArray 再读取内部字段，避免随机 TypeError 被误当正确拒绝。

Result 规则1–8保持完整。archive 子树只校验规则4–6相关字段，不复制整套产品 Schema；fixture 本身则由生产 Schema 保证所有 required 字段齐全。规则5 的准确映射为 formalTranscript[i].id === submissions[i].messageId，不读取 transcript.messageId。

每组反例都从该步完整合法 fixture 的独立深拷贝出发。所有负例先 expect(() => validateScenarioResult(mutated, originalScenario)).toThrow(new Error("Convergence runtime result is invalid."))，并核对原 fixture JSON 不变。没有失败不是 PASS，禁止只对抛任意异常断言。下表路径均从 fixture 起，O=observed，A=observed.archived，P=observed.archived.archive.package；缩写仅用于本文，测试输入 path 必须展开。

| 组 | 逐项单点破坏（各项独立 it.each case） | 最早步骤 |
| --- | --- | --- |
| K 键/类型 | 顶层、O、每条 submission/checkpoint、lateSubmit、每个 child 的每一 required key 分别 delete；分别添加 extra=true；分别替换为 null/[]；数组字段分别替换为 {}；ID/string分别为""/1；仅脚本version/counters/seq/afterSubmission数字leaf分别为"1"/-1/1.5/NaN/Infinity | T1.2 |
| L 标签/selector | ok=false；scenario="wrong"；assertions=[]、删最后标签、末尾加"x"、一个标签重复、前两项交换；O删除（只标签） | T1.2 |
| S 提交 | 数量少/多；messageSeq/turnSeq单点0或跳号；每种ID重复；messageId="bad"；第二版本=第一版本；末态改running；中间状态改partial | T1.2 |
| C checkpoint | 数量少/多；afterSubmission=0；version+1；逐行status="paused"、stallCount+1、replanCount+1、maxStalls=4、maxReplans=2、nextTurnId="wrong"、intent/reason="wrong" | T1.2 |
| A 归档 | A/archive/package/两处termination分别delete或null；A.status="running"；A/P.meetingId="other"；O.archivedVersion=最后提交版本或+1；P.endedAt/archive.archivedAt="bad"/NaN；A任一active字段加入"x"；pendingHandRaises/meetingTasks各加{}；两处termination各自code/reason/decisionIds/unresolvedQuestionIds删除、错类型、code="failed"或reason="other"、decisionIds=["x"]、unresolvedQuestionIds=["x"] | T1.2 |
| M transcript | formalTranscript删/多一条；逐行id/seq/turnId/speaker/content单点改"wrong"（seq用99）；完整transcript删除/改{}；把id删掉并非另补messageId的同一case，另单独用messageId字段取代id复现旧错位 | T1.2 |
| H 生命周期 | children少/多/重复ID/id="other"/mode="one-shot"/activity="active"；residentSessionIds=["x"]；stableAfterLateSubmit=false；late.kind="unknown"、code="STALE_ATTEMPT"/"IDEMPOTENCY_CONFLICT"/"unknown"、加入ok=true；protocol配CAPABILITY_REVOKED、tool配ARCHIVED_MEETING | T1.2 |
| Q 问题 | questionId=null/"question-d3-1"；P.unresolvedQuestions=[]或单question id/status/blocking/askedBy错误；内外unresolvedQuestionIds分别[]；把package.unresolvedQuestions移至archive属于命名回归case，先单独删除原字段测试，再另以错误层级新增字段验证不能补偿 | T1.3 |
| R reset | proposalId=null/"wrong"；P.proposals=[]；proposal.id="wrong"/revision=2；第四checkpoint.replanCount=1；第4–6checkpoint分别按C破坏 | T1.4 |
| B 完成 | endResult=null/多字段/status="partial"/terminationCode="stalled"；末submission="completed"；第二checkpoint三nullable字段各为"x"，counter各1；criterion.satisfied=false；agenda.status="discussing"；completionFacts=[]；两个fact各kind/status/evidenceMessageIds错误；limits三字段各+1；内外termination.code="max_turns"/"message_limit"各独立 | T1.5/T1.6 |

正向边界：合法五场景原样返回；protocol 三个允许 code 和 tool 两个允许 code 分别通过；archive/package/termination 额外合法字段仍通过（例如 package.termination.endedAt=t+100、内部 finalMessage="summary"）；每种ID在自身数组唯一即可，不要求跨种类唯一。非 q/p/b 的 questionId/proposalId/endResult 逐项改非 null 必须拒绝。fixture 的独立结构断言包含全部固定值；不把测试数量作为完成依据。


### 保留的 T6/T8 完整验证命令

以下命令保留到最终删除本文；T6机械段删除后，T8仍完整运行此处命令，不从已删除步骤寻找命令。

```sh
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/result.mjs scripts/smoke-profile/probe/index.js scripts/smoke-profile/probe/scenarios/convergence.js tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/convergence-probe.spec.ts --check
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/convergence-probe.spec.ts tests/unit/domain/transitions/turn-advancement.spec.ts
pnpm --dir plugin verify
git diff --check
```

### T1：结果合约分步交付

T1 是步骤容器；只有 T1.7 PASS 才满足后续“ T1 PASS ”。

执行进度 T1.0：PASS。两份失败增量已按hash备份并cmp通过；仅在白名单内恢复到0fcb586，diff相等；原contract 1项和Prettier通过。备份位置记录于任务消息，后续T1.1–T8未执行。用户本轮授权修订及继续执行，取代等待恢复许可。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.1：PASS。五场景完整归档DTO通过生产Schema与独立固定来源断言，深拷贝隔离通过；原contract保持，6项测试及格式检查通过。尚未接线新validator。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.2：PASS。stalled完整证据及K/L/S/C/A/M/H单点破坏矩阵通过，585项聚焦测试；生产Schema先检fixture，归档空对象、错误层级、终态重放、resident等假阳性已拒绝，格式/语法/diff通过。其他新selector未接线。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.3：PASS。no-consensus独立合法fixture及Q/共同破坏矩阵通过，1180项聚焦测试；第一delivery question ID和package归档字段严格关联。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.4：PASS。reset七提交/六checkpoint两组计数、第四delivery Proposal及R/共同矩阵通过；2124项聚焦测试与格式通过。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.5：PASS。Turn预算独立fixture及B/共同矩阵通过，2571项；预算末checkpoint三null、两条completionFacts、endResult与limits受严格校验。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.6：PASS。五个literal完整接线，独立message预算10/2与Turn预算2/100校验及B/共同矩阵通过；3018项聚焦测试、格式检查通过。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T1.7：PASS。K/L/S/C/A/M/H/Q/R/B逐组对应表驱动case；补齐旧messageId与archive层级回归、两预算互换、跨种类ID可同名正例。3055项contract+25项原source测试通过，格式/语法/diff通过。用户授权下仅补验证缺口，未弱化Result规则。T1全量完成，运行证据仍待T7。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T2：PASS。新增真实工具驱动与11项probe测试；两文件3066 tests PASS。为两个当前测试消费者提取convergence-fixture.ts并保持原3055项契约测试不变；根据用户允许修改RUNBOOK/代码的授权纳入本步，未改产品。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T3：PASS。criterion绑定的question正式提交、三个活动checkpoint及归档保留校验已实现；15 probe +3055 contract tests PASS，缺少criterion、question丢失、错误终止码均拒绝。 已完成机械段删除；本次提交包含本步全部变化。

执行进度 T4：PASS。七次提交与第四次唯一Proposal已实现；第四checkpoint保留replanCount=1和归档丢失Proposal的负例拒绝。18 probe+3055 contract tests PASS。 已完成机械段删除；本次提交包含本步全部变化。

### T5：两种硬预算边界优先业务完成

前置状态：T4 PASS。
允许修改：`plugin/scripts/smoke-profile/probe/scenarios/convergence.js`、`plugin/tests/unit/scripts/convergence-probe.spec.ts`。
禁止修改：completion guards、自动 terminal 行为、clock、Client。

执行：新增两函数，严格各自 limits。第一条证据提交后，第二条 completionClaims 使用本次 context 与 first messageId；让 submit helper 的 completionClaims 同样接受唯一局部同步 `(context)=>claims` 以取得正式 ID。第二条完成后先验证 converging/no next Turn 与相应预算边界，再按固定 Captain end 输入完成。新增私有 `runConvergenceBudgetCompletion(runtime, limits)` 供两个薄 export 调用，不另建通用场景配置 registry。

验证：
```sh
pnpm --dir plugin exec vitest run tests/unit/scripts/convergence-probe.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
```
PASS：两类 budget 独立通过；错误 partial/max_turns/message_limit/converging 缺失均失败；Captain end 不在其他三个新函数中出现。
STOP：需要把 converging 假装 completed、使用 waiver 或调用领域函数；报告“自动完成/显式完成”的准确边界，禁止实施产品修复。

### T6：selector 接线与完整本地验证

前置状态：T5 PASS。
允许修改：`plugin/scripts/smoke-profile/index.mjs`（仅 SMOKE_SCENARIOS）、`plugin/scripts/smoke-profile/probe/index.js`（仅 import、guard、dispatcher 和 driveParticipant 早退）、`plugin/tests/unit/scripts/smoke-profile.spec.ts`；T1–T5 文件仅格式化本次新增段。
禁止修改：environment.mjs、build/profile/credentials/timeout/Restore、原 selector 行为、package/lockfile、产品代码。

执行：五个唯一 selector 加入 SMOKE_SCENARIOS 和 run guard；switch 各只有一个 case→对应 export。driveParticipant 五个 selector 早退；新函数不调用 setMeetingId。更新 scripts source contract，检查五个 export/import/case/early-return，以及原 convergence 的三标签。禁止加总量“17 全绿”替代每项结果。

验证：
```sh
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/result.mjs scripts/smoke-profile/probe/index.js scripts/smoke-profile/probe/scenarios/convergence.js tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/convergence-probe.spec.ts --check
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/convergence-probe.spec.ts tests/unit/domain/transitions/turn-advancement.spec.ts
pnpm --dir plugin verify
git diff --check
```
PASS：所有检查退出 0，原 fallback/其他 11 selector source contract 保持；verify 覆盖 format/lint/typecheck/test/build/environment/contract/agent definitions/package，不代表真实 runtime。
STOP：出现白名单外修改或任何 gate 失败。只允许用同一 prettier 文件列表 `--write` 修正本次格式，其他失败停止，不顺带修复历史问题。

### T7：真实 DSH 验证与隔离恢复

前置状态：T6 PASS，用户明确授权本次真实 smoke；pinned DSH/provider 可用；按操作文档准备唯一根 dev.env，禁止打印内容。不设置 DSH_SMOKE_DSH_BIN，不使用 browser mode、个人 profile 或人工 dsh-workspace。
允许修改：无 tracked file；由原 wrapper 创建其独有 OS 临时目录/端口/profile；不得人为留存凭据。
禁止修改：任何产品/脚本；失败后不改 profile、断言、超时或切换 provider。

执行：下列固定 Node 命令顺序执行六个 selector（原 convergence + 五新增），捕获 wrapper 最后 JSON，待 wrapper 完整退出后验证 Restore。每个 selector 用全新进程/临时根；首次失败终止，不执行剩余场景。端口复核只对该次输出 port 在 127.0.0.1 bind 后立即 close；不是第二个服务。禁止把此命令持久化为新 runner。

验证：
```sh
node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, basename, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { validateScenarioResult } from './plugin/scripts/smoke-profile/result.mjs';
if (process.env.DSH_SMOKE_DSH_BIN || process.env.CONVIVIUM_SMOKE_BROWSER_MODE === '1') {
  throw new Error('STOP: nonstandard smoke environment');
}
for (const scenario of [
  'convergence', 'convergence-stalled', 'convergence-no-consensus',
  'convergence-reset', 'convergence-turn-budget-completion',
  'convergence-message-budget-completion'
]) {
  const run = spawnSync('pnpm', ['--dir', 'plugin', 'smoke:profile'], {
    env: {...process.env, CONVIVIUM_SMOKE_SCENARIO: scenario},
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  if (run.error || run.status !== 0) {
    console.error(scenario, run.error?.message, run.signal, run.status);
    console.error((run.stdout ?? '').slice(-8000), (run.stderr ?? '').slice(-8000));
    throw new Error('STOP: wrapper failed; Restore is not proven');
  }
  const text = run.stdout;
  const start = text.lastIndexOf('\n{\n  "ok": true,');
  if (start < 0) throw new Error('STOP: final wrapper JSON missing');
  const value = JSON.parse(text.slice(start + 1).trim());
  if (!value.ok || value.profile !== 'web' || value.provider !== 'spawn') {
    throw new Error('STOP: profile/provider mismatch');
  }
  validateScenarioResult(value.probe, scenario);
  const root = dirname(dirname(value.dumpConfig));
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !basename(root).startsWith('convivium-dsh-smoke-') || existsSync(root)) {
    throw new Error('STOP: temporary root cleanup not proven');
  }
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) {
    throw new Error('STOP: invalid recorded port');
  }
  await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen({host: '127.0.0.1', port: value.port, exclusive: true}, () => {
      server.close(error => error ? rejectPort(error) : resolvePort());
    });
  });
  console.log(JSON.stringify({scenario, restore: 'passed', probe: value.probe}));
}
NODE
```
PASS：六份结果逐一通过 validator，六次 wrapper 退出 0、独有临时根不存在、原端口可绑定且已释放。新增五个场景还必须 archived、两个 Session 均 inactive/无 resident；原 fallback 不提升为归档场景。记录实际日期、commit+dirty diff 边界、Node/pnpm/DSH/provider、每个 assertions/observed 与 Restore。
STOP：首个错误；包装器未完整输出、归档失败、清理不明均不记 PASS。保存有界 stdout/stderr、已知准确路径及 port；未知时写未知。原 wrapper finally 仍需完成，不执行全局 pkill、glob rm 或 profile 迁移；如果清理需要更改 runner 生命周期，单独报告前置缺口，由原任务决定范围。

### T8：长期证据迁移与删除

前置状态：T7 全部 PASS；原任务已授权接收本任务专属证据并安排共享整合。本轮 Author 不进入此步。
允许修改：新建 `docs/40-readiness/CONVERGENCE-RUNTIME-VALIDATION-EVIDENCE.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`、本文；共享 coverage/TODO 保留给原任务。
禁止修改：正式需求/接口以迎合测试、其他任务 evidence、共享 coverage/TODO。

执行：
1. 新 evidence 按 Scope/Validated Contract/Executed Validation/Not Covered/Closure 写实际证据，逐项映射 S1–S7；明确 fingerprint 间接观测、Captain end 边界、未覆盖时间预算/Position/事务故障/冷重启/模型。缺少真实结果时保留本文，不建立虚假的 PASS evidence。
2. operations 的 selector 清单追加原 convergence 和五个新 selector，说明对应 assertions 与本任务 T7 的 Restore 检查；保持既有凭据/profile/端口/失败清理政策，不复制领域规则。
3. 将 evidence 路径交原任务做总 coverage/跨任务整合；在收到“未覆盖项已进入正式 readiness、共享整合完成”证据前 STOP，不删除本文。长期产品/接口/设计规则未改变，无新增迁移；稳定 selector 入口进入 operations，实际状态进入专属 evidence。
4. 搜索本文引用，确认结果仅为本文或本任务本次新增的纯导航引用；有其他引用即 STOP 交原任务处理，不自行编辑未知文件。运行保留定义中的 T6/T8 完整验证命令与下列链接/格式检查后，删除本文及已核对只服务于本文的本任务导航引用。删除后重复检查；失败恢复本次删除的准确内容并 STOP，不留 completed/archive RUNBOOK。

验证：
```sh
rg -n 'RUNBOOK-CONVERGENCE-RUNTIME-VALIDATION|自动收敛真实 DSH 运行验证 RUNBOOK' docs TODO.md AGENTS.md
pnpm --dir plugin verify
git diff --check
```
执行下面 Author Audit 中的相对链接命令，迁移后将文件列表改为唯一新 evidence 和 HOW-TO 两个固定路径；删除后 `rg` 无引用（退出 1 为无匹配）。

PASS：专属 evidence 与操作说明落地、共享整合完成证据存在；所有验证满足、无残留引用，本文已删除且删除后检查通过。
STOP：任一 Scope/证据/整合未完成，或者删除后出现断链；恢复本文和本次删除引用，不修改其他历史内容。

## 验证矩阵与证据边界

| 风险/需求 | focused validation | runtime 预期 | 范围/收口 |
| --- | --- | --- | --- |
| FR-4/D8 fallback + replay | 原 scripts contract，T6 | convergence 原三断言，相同 result/version | S1，专属 evidence |
| FR-6/D10 首次/重复/终止 | domain 6 tests + 新 probe/validator tests | 4 次提交，0/0→1/0→2/1→partial/stalled | S2，T2/T7 |
| blocking disagreement | question 输入与 no_consensus fixture 拒绝测试 | 合法 criterion question，4 次后 no_consensus，未解决 ID 保留 | S3，T3/T7 |
| 新进展重置 | replanCount 故意错误负例 | 7 次，两组计数，Proposal 保留 | S4，T4/T7 |
| FR-8/BR-3 业务优先 | 两 budget fixture，与错误 partial 负例 | 第二条合法 claims→converging→Captain completed；limits 独立 | S5，T5/T7 |
| caller/capability/terminal immutability | raw late reply 负例 | 旧 Agent/旧输入失败、归档/版本不变、children inactive | S6，全新增 selector |
| stale version、同 key 异 hash | 现有 product tests 随 verify 保持 | 本新增 selector 不主动注入；Not Covered runtime | 不扩张 scope |
| 数组部分非法/事务 rollback/无半提交 | 现有 tests 随 verify；不新增领域测试 | status 无私有事务接口，Not Covered runtime | 不用 labels 伪造 commit 原子证据 |
| internal fingerprint/event/receipt/outbox | 原 domain/repository tests | 仅下一真实 context、结果及投影的因果证据；内部字节/事件顺序 Not Covered runtime | S2/S7 |
| restart/reopen/recovery | verify 既有 suite；原 cold-rebind 场景未在本次重跑 | 本任务仅 Captain status 驱动 archive recovery，冷重启 Not Covered | 不声称复测原 12 全绿 |
| archive、终态清理与 Restore | fixture 错内容/active/resident 负例 | 公开 archive、无后续发言、两个 child drained、临时根和端口恢复 | S6/S7 |
| build/typecheck/contract/full | T6 `pnpm verify` | 本地 gates 不代替 T7 | S7 |
| 真实模型、Browser、时间极限、独立 replan budget 耗尽、blocking Position | Not Covered，缺少本任务正式驱动步骤 | 不调用模型、不扩大 Client/config/clock 范围 | readiness 明确保留 |

## Author Audit 与实际检查

2026-09-07 已完整读取规定治理和需求相关 sections，应用 convivium-runbook、dsh-plugin-development、right-size-changes，核对 manifest/lockfile rc.2 与现有公开 DSH 声明、工具/Schema、源码和测试。

完整自审：Required Structure 十项齐全；Not Applicable 有原因；每个 S1–S7 均有步骤/验证/迁移，每步只服务于本范围；新文件/export/private helper 只有一个指定位置；创建/提交/claims/终态/输出字段及 owner 明确；无私有状态写入、产品重构、共享文件混改；失败恢复、逐步 PASS/STOP、T7 独立授权与 T8 删除前后检查明确。`Executable` 仅表示步骤已决策完备，不表示五个新 selector 已实现或通过真实 DSH。

初版 Author 历史检查（只适用于初版文档；不代表当前失败增量）：

- 起始 branch/HEAD/status：main、规定 HEAD、干净；已创建独立作者分支。
- `pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/domain/transitions/turn-advancement.spec.ts`：3 files、32 tests PASS。
- 相对 Markdown 链接检查：11 个相对链接通过；26 个正文代码/文档路径通过（含两个明确计划新增路径）。`git diff --check` 退出 0。本文为未跟踪新文件，另以 `git diff --no-index --check /dev/null docs/30-designs/RUNBOOK-CONVERGENCE-RUNTIME-VALIDATION.md` 检查正文，无 whitespace 输出；该命令退出 1 仅表示新文件有差异。T7 内嵌 JavaScript 通过 `node --check --input-type=module`，只检查语法，没有执行。

```sh
python3 - <<'PY'
from pathlib import Path
import re
files = [Path('docs/30-designs/RUNBOOK-CONVERGENCE-RUNTIME-VALIDATION.md')]
count = 0
for file in files:
    text = re.sub(r'```.*?```', '', file.read_text(), flags=re.S)
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if '://' in target or target.startswith('#'):
            continue
        path = (file.parent / target.split('#', 1)[0]).resolve()
        assert path.exists(), (file, target)
        count += 1
print(f'PASS: {count} relative links')
PY
git diff --check
```

当前 Not Covered：T1及五个新selector均未通过；此前增量测试的通过不构成完整Result验收。本轮Author只修改本文并静态核对正式DTO/Schema/投影/归档源码，未运行新增实现、全量verify、smoke或模型；未读取dev.env、未提交。若后续目标升级为无需Captain自动completed，需要独立产品决定，不在当前Scope。

联合审查澄清：接受 A 的两项建议，Result 校验使用完整 observed.archived 路径区分 status DTO 与内层 archive record；新增 probe 单测按 T2–T5 分阶段导入实际存在的 exports。原 Scope 不缩减，运行证据边界保持不变。


### 本次修订完整审计（2026-09-07）

正式结论：Executable（仅表示本次修订步骤决策完备；不是T1实现PASS，恢复执行仍按监督批准边界）。实际检查：77个docs本地链接、18个shell代码块仅语法解析、T7内嵌JS仅语法、八个子步骤固定字段检查、git diff --check均通过；两个脏实现文件hash与本轮开始一致。

| 审计项/监督缺口 | 修订后的依据和检查 |
| --- | --- |
| 1 archive检查依赖后续步骤 | T1.1只建立并独立验证完整fixture，不接validator；T1.2在stalled接线同时完成归档/生命周期全部相关保护，无archive={}过渡合法输入 |
| 2 budget输入出现过晚 | T1.1即构造五份合法fixture；budget校验及全部null负例到T1.5/T1.6与对应接线同时实现 |
| 3 一步一删一提交冲突 | T1.0–T1.7各删自身；T1.7只删剩余容器，不重新提交前面代码；失败历史保留，未完成增量不混入 |
| 4 步骤依赖被删除命令 | 八步各自完整列前置/白名单/禁止/执行/完整命令/PASS/STOP；公共类型、数据和矩阵不删除；T6/T8重复验证命令另行保留 |
| 5 fixture/符号不完备 | 保留定义逐一给出公开DTO所有required字段、固定值/公式/可省optional、helper唯一位置/签名；生产Schema+独立断言先验证fixture；消息id和归档时间层级明确 |
| 6 脏增量混入第一提交 | T1.0按两个已知hash保全到独占目录并cmp；只逆向移除已知增量到0fcb586内容；其他变化STOP归属审查；本Author没有执行整理 |
| 7 颗粒度与审计结论 | 原T1映射到保全→fixture→完整stalled→question→reset→Turn budget→message budget→矩阵复核；每个接线步骤是一个完整场景，固定结论如上 |
| Required Structure/双向追踪 | 目标、scope、输入/owner、调用链、状态、版本、事务/事件未覆盖、逐步验证和T8迁移删除保留；S1–S7未缩减，无新增产品接口 |
| 风险矩阵 | K/L/S/C/A/M/H/Q/R/B映射Result1–8；成功、非法输入、终态、archive一致性与生命周期对应正反例；真实运行仍仅T7证明 |
| 长期迁移/删除 | T8仍将结果和全部Not Covered迁移专项readiness/operations；共享整合交监督；删除后链接失败恢复本文并STOP |

此次检查方式是静态源码/类型/Schema对照、文档相对链接、shell/嵌入JS语法和diff检查；不执行文档中的安装、备份、测试、提交或真实运行命令。实现增量两文件SHA与保留定义相同，未改动。未决产品Scope为无；待批准事项仅恢复Execute及按本修订整理已知失败增量，不能把Author交付自动当作恢复执行许可。
