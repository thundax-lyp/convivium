# RUNBOOK：离线最小会议协议与上下文一致性准备

## 1. 状态与执行者契约

- 建立/修订日期：2026-09-07；模式 Author + Audit，本轮只改本文，不执行 T0–T5。
- 基线：`1dd23b318f41531d02f7d03d3d543edef8259071`；分支 `codex/real-model-meeting-runbook`；指定目录直接工作，无额外 worktree。
- 本文保留原文件名以维持任务定位，**目标已缩减为离线准备包，不是真实模型会议闭环**。用户联合收敛授权允许此缩减。旧稿的真实模型步骤、全 STOP 占位命令和外部清理 PASS 条件全部移除。
- 自审目标结论：`Executable`；仅表示下述测试资料与验证交付决策完备，不表示新增测试已经运行或真实会议通过。最终交叉审查绑定文件 SHA-256，在任务消息中记录，不把文件自身 hash 写入自身。
- 后续 Execute 必须有用户明确许可；仅可创建 T1/T2 的测试文件、T5 专项 evidence，并最终删除本文。禁止生产代码、现有测试、其他 RUNBOOK、共享 coverage/TODO、正式需求/接口/操作文档、profile/凭据、Git commit/push/PR 和外部模型/Host/smoke 操作。
- 执行者顺序 T0→T5；每步全部 PASS 后继续。未知路径/符号、基线变化、测试失败、必须增加新依赖或产品修复均 STOP，报告最后 PASS、触发前提、精确文件/符号/命令/输出；不回滚用户改动，不放宽类型/Schema/断言。

## 2. 目标、范围与缩减说明

交付一个可复用、每次独立构造的测试样例工厂，以及一个调用生产 Schema、纯 transition、context projector、工具注册器的 contract suite。样例链路：合法 create 输入→生产初始状态→Manager planning context→合法 Manager plan→A context/固定离线发言→生产顺序推进→包含 A 的 B context/合法 B 输入。另采集真实注册器输出的工具参数 JSON Schema 与生产 provisioning envelope，记录协议字段可见性断点。它给后续真实模型验证提供可解析、ID/版本/引用自洽的参考数据，**不得把它注入模型冒充产品 prompt 或能力安装**。

| Scope | 唯一行为 | 步骤 / 验证 |
| --- | --- | --- |
| S1 | 无副作用的固定协议样例和生产上下文 | T1 / V1–V3 |
| S2 | A→B 顺序、前序内容与身份绑定；错误输入、stale/未分配身份负例 | T2 / V4–V6 |
| S3 | 模型可见工具参数与 provisioning/context 字段边界的离线记录 | T2 / V7 |
| S4 | 新增测试完整门禁、独立长期证据、范围披露与删除 | T3–T5 / V8–V9 |

从原目标移出：真实模型自主生成、真实 Captain/Manager/Participant Session、真实 provider/preset/model 配置、请求/费用硬上限、语义质量审阅、B 后续规划与 Captain end 的时序、结束归档、capability revoke/Activation drain、Host/profile/端口清理。原因分别是模型/费用/凭据未授权、无已验证运行/观察入口，且保留这些目标将迫使执行者设计新 harness 或修改产品。全部记为 Not Covered，不成为本离线任务删除前提。

Non-goals 还包括 A 的 UI、B 的 deterministic smoke、FR-13 admission/推荐、FR-14 composition、prompt/schema 产品修复、后台任务/私聊、通用 fixture 框架、snapshot 自动更新、HTTP/存储/恢复/归档模拟。只运行本地 keyless 验证，不运行 `smoke:profile` / `verify:runtime`，不读取 `dev.env`，不安装或升级依赖。

## 3. 真相源、当前断点及调用链

先完整读取 [Docs Agent](../AGENTS.md)、[Architecture](../00-governance/ARCHITECTURE.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md)、[PR Rules](../00-governance/PR-RULES.md) 与仓库 convivium-runbook Skill。涉及本测试方案已应用 dsh-plugin-development、right-size-changes；不由技能创造产品需求。

| 正式依据 | 当前生产文件 / symbol | 本次证明与边界 |
| --- | --- | --- |
| [需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-2、FR-3、FR-4、BR-2/6 | `plugin/src/runtime/meeting-runtime.ts::prepareMeetingCreation`；`plugin/src/domain/create.ts::createMeetingState` | 生产 key→canonical ID、未完成初态；不创建 Session/repository |
| [协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) Manager context/plan、speaker context、Turn submission | `plugin/src/protocol/commands.ts::CreateMeetingInputSchema/ManagerPlanSubmissionSchema/TurnSubmissionSchema` | 生产输入 Schema 可解析；不是模型理解证明 |
| [设计](./MEETING-ORCHESTRATION-DESIGN.md) §9、§12 | `plugin/src/domain/transitions/manager-planning.ts::startManagerPlanning/submitManagerPlan`；`plugin/src/domain/transitions/speaker-submission.ts::submitSpeakerAndAdvanceMeeting`；`plugin/src/domain/transitions/turn-advancement.ts::advanceAfterSpeakerSubmission` | 纯 transition 的首个 attempt 与 A 后 B 的 context；非正式工具/repository commit 证据 |
| 协议上下文与公开消息 | `plugin/src/projection/status.ts::projectManagerMeetingContext/projectSpeakerMeetingContext` | 从生产 state 投影，不从手写 context 自证 |
| FR-12；协议 DSH tool invocation | `plugin/src/tools/register-tools.ts::registerCreateAndStatusTools/registerSubmitAndControlTools/toolParameters`；`plugin/src/dsh/provisioning.ts::createSessionProvisioningEnvelope` | 工具注册元数据与生产 envelope 原样记录，不执行工具、不扩展 prompt |

相关既有测试为 `plugin/tests/unit/domain/transitions/manager-planning.spec.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/integration/dsh/session-adapter.spec.ts`、`plugin/tests/contract/status-projection.spec.ts`；仅参考，不修改、不把它们的 mock 当新证据。测试项目入口 `plugin/vitest.config.ts` 的 contract project，完整 gate 为 `plugin/package.json::verify`。

已核实的断点：

1. package/lockfile DSH `0.1.1-rc.2`，正式最低版本同此；[HOW-TO-DSH-SMOKE](../50-operations/HOW-TO-DSH-SMOKE.md) 的 `DeepSeek-V4-Flash`/OK 只是人工链路示例，当前 12 selector 则由脚本驱动工具；两者均不证明模型会议协议理解。
2. 生产 `toolParameters` 只有通用 `input:json`；rc.2 `defineTool` 转换为 §6 固定 JSON Schema，并未展开 Manager/Turn 内部字段。本任务记录此事实，不修复。
3. provisioning 的 instruction 要求后续 `attemptId` 和 `deliveryId` 才能写；生产 Manager context 提供 `planningAttemptId`、不提供 `attemptId`/`deliveryId`。这是离线字段/措辞不对齐证据，不是已复现的模型失败。不能在 fixture 修正 instruction，也不能自动增加 context 字段。
4. `startManagerSession/startParticipantSession` 使用 parent；已安装 rc.2 subagent 的 `resolveChildAgentOptions` 与 `applyChildComposition` 继承模型和 preset。实际 Host graph 与模型仍未验证，离线任务不推导模型选型。

完整离线链：测试 create input→Schema→prepareMeetingCreation.state→startManagerPlanning→projectManagerMeetingContext→Schema-valid plan→submitManagerPlan→projectSpeakerMeetingContext(A)→Schema-valid A input→submitSpeakerAndAdvanceMeeting→projectSpeakerMeetingContext(B)→Schema-valid B input→独立断言。工具 surface 则由生产 register 两函数→只收集 definition→断言 parameters；runtime/caller test double 一旦执行必须抛错。

## 4. 唯一文件与符号

后续仅允许新增：

1. `plugin/tests/fixtures/offline-meeting-protocol.ts`：`OfflineMeetingProtocolFixture`、`createOfflineMeetingProtocolFixture(): OfflineMeetingProtocolFixture`、私有 `speakerInput(context: SpeakerMeetingContextV1, content: string, replyTo?: string): TurnSubmissionV1`。唯一职责是构造一个新鲜、JSON 可序列化的离线参考；不得 import Vitest、FS、network、Session 或 test unit fixture。
2. `plugin/tests/contract/offline-meeting-protocol.spec.ts`：唯一 `describe("offline meeting protocol preparation", ...)`；私有 `collectToolDefinitions(): ToolDefinition[]`、`runManagerPlan(fixture: OfflineMeetingProtocolFixture, observedMeetingVersion: number): TransitionResult<MeetingState>`。前者只注册不执行，后者仅供正/负 Manager version 测试复用 §5 相同调用。
3. `docs/40-readiness/OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md`：T5 才创建，记录实际本地结果与移出范围。没有 JSON/快照生成文件或新 CLI/package script。

原 `RUNBOOK-REAL-MODEL-MEETING-VALIDATION.md` 是临时任务说明，完成后删除。三个计划文件当前不存在。production/现有 tests/lockfile/config 一律禁止修改，编译若要求扩大白名单则 STOP。

## 5. 固定样例数据与构造算法

### 数据所有权与返回类型

`OfflineMeetingProtocolFixture` 的全部字段 required、无 null/default；仅正式 DTO 内已有 optional 字段可省略：

```ts
interface OfflineMeetingProtocolFixture {
    createInput: CreateMeetingInputV1;
    planningState: MeetingState;
    managerContext: ManagerMeetingContextV1;
    managerSubmission: ManagerPlanSubmissionV1;
    plannedState: MeetingState;
    aContext: SpeakerMeetingContextV1;
    aSubmission: TurnSubmissionV1;
    afterAState: MeetingState;
    bContext: SpeakerMeetingContextV1;
    bSubmission: TurnSubmissionV1;
}
```

类型从 `plugin/src/protocol/index.ts` 和 `plugin/src/domain/index.ts` 导入；函数从表中唯一生产文件 import。test-only state 不写磁盘，也不代表持久 commit。每次工厂重新创建所有输入，不使用模块级可变状态；每一 transition 的输入使用 `structuredClone`，输出对应字段也不共享可变引用。固定时间 `now=1700000000000`，纯函数参数分别 now、now+1、now+2、now+3；不替换全局 clock。

### 创建输入（字段类型以生产 Schema 为准）

固定 `protocolVersion:1, requestId:"offline-create-1", teamId:"offline-team", topic:"Offline protocol preparation", objective:"A presents amber-47; B cites A from the delivered public context.", selectionMode:"manager"`。

`objectiveContract={requiredOutputs:[],acceptanceCriteria:[{key:"reference",description:"B cites A"}],hardConstraints:[],requiredReviewerKeys:[],riskAcceptanceAuthorityKeys:[],acceptableRiskLevel:"low"}`。

`agenda=[{key:"reference",title:"Sequential reference",objective:"A then B",inScope:["public reference"],outOfScope:["network"],completionCriteria:["reference"],requiredParticipantKeys:["a","b"]}]`；`participants=[{participantKey:"a",displayName:"A"},{participantKey:"b",displayName:"B"}]`。

`limits={maxTurns:2,maxSpeakersPerTurn:2,maxTotalMessages:4,speakerAttemptTimeoutMs:60000}`。`continuation/sourceMemberName/role/ownerKey/relatedTaskIds` 省略；不传 null、运行状态或 capabilities。其余内部 limits 由 production prepare 的 defaults 提供；本地无请求/费用，不能把这些 limits 当真实模型预算。

### 构造顺序（固定调用，不是 pseudocode）

1. 用 `CreateMeetingInputSchema(createInput)` 验证，保留类型化输入。调用 `prepareMeetingCreation(createInput,"offline-meeting",{callerBinding:"session:offline-captain",capabilityId:"captain:offline-captain"},{now})`；仅使用返回 state，不打开 createInput/repository。初始 version=0，participant IDs 为 participant-a/b，agenda ID=agenda-reference，criterion ID=criterion-reference；断言来源是 production allocator，不另造 mapping。
2. `startManagerPlanning(initialState,{meetingId:"offline-meeting",planningAttemptId:"offline-planning-1",deliveryId:"offline-manager-delivery-1",reason:"initial_plan",now:now+1,catalogBinding:{kind:"none"}})`。返回 planningState，version=1。`projectManagerMeetingContext(planningState,["participant-a","participant-b"])` 得到 managerContext。
3. 构造 managerSubmission：`protocolVersion:1`；meetingId/planningAttemptId/observedMeetingVersion/agendaItemId 分别取 managerContext 的 meetingId/planningAttemptId/meetingVersion/activeAgendaItem.id；`requestId:"offline-plan-1",intent:"explore",objective:"A then B",expectedOutputs:[],prohibitedTopics:["network"]`；steps 固定 `[{participantId:"participant-a",instruction:"Present amber-47",reason:"manager_selected"},{participantId:"participant-b",instruction:"Cite A",reason:"manager_selected"}]`；attendanceRecommendations 省略。运行 `ManagerPlanSubmissionSchema`，不把 protocol/request/version 字段传入领域 input。
4. `submitManagerPlan(planningState, domainInput, domainContext, ids)`：domainInput 仅拷贝 agendaItemId/intent/objective/expectedOutputs/prohibitedTopics/steps；domainContext 固定 meetingId/planningAttemptId/observedMeetingVersion 从 submission、deliveryId="offline-manager-delivery-1"、dispatchableParticipantIds=["participant-a","participant-b"]、now=now+2、managerSessionId="offline-manager"；ids 为 `{turnId:"offline-turn-1",stepId:(index)=>"offline-step-"+index}`。返回 plannedState，version=2，不含 currentPlanningAttempt，steps A→B，仅 A 有 running attempt。领域 fixture 的 managerSessionId 只是测试参数，不声称有真实 Session。
5. 从 plannedState.currentTurn.steps[0].attempt 取 attemptId，调用 `projectSpeakerMeetingContext(plannedState,"participant-a",attemptId)` 得 aContext。必要字段缺失立即 throw Error，不使用 non-null/type assertion 绕过；aContext recentMessages=[]，contextThroughSeq=0。
6. 调用 speakerInput 构造 A 输入：content 精确 `Marker: amber-47. Reason: a local fixture needs no network.`，replyTo 省略。helper 固定 protocolVersion=1；meetingId、turnId、stepId、attemptId、deliveryId、agendaItemId 分别来自 context.meetingId/turn.id/step.id/attempt.attemptId/attempt.deliveryId/activeAgendaItem.id；kind=statement、mentions=[]、taskIds=[]、agendaRelation=on_topic、changes={}；completionClaims 省略。直接调用 `TurnSubmissionSchema({ ...aSubmission })` 验证，返回原类型化对象，不对 Schema Record 输出作强制类型转换。
7. `submitSpeakerAndAdvanceMeeting(plannedState,"participant-a",advanceContext)` 得 afterAState。advanceContext 复制 A 的 meetingId/turnId/stepId/attemptId/deliveryId/agendaItemId，participantId="participant-a"，message 仅 `{id:"offline-message-a",content:aSubmission.content,kind:"statement",mentions:[],taskIds:[],agendaRelation:"on_topic",createdAt:now+3}`；`questions:[],now:now+3,nextPlanningAttemptId:"offline-planning-2",nextPlanningDeliveryId:"offline-manager-delivery-2",catalogBinding:{kind:"none"}`；不传 completion、issues、proposals 等。A 后 version=3、messageSeq=1，B running attempt 的 contextThroughSeq=1；不手工向 transcript/context 塞 A。
8. 从 afterAState.currentTurn.steps[1].attempt 取 B attemptId，调用 `projectSpeakerMeetingContext(afterAState,"participant-b",attemptId)` 得 bContext。其 recentMessages 由生产 projector生成，必须包含 A 的 id=offline-message-a、seq=1 和逐字 content。
9. B 使用同一 speakerInput，content=`I cite amber-47: a local fixture needs no network.`，replyTo 取 bContext.recentMessages 中唯一 A 的 id；kind 保持 statement，其他字段同 helper。运行 `TurnSubmissionSchema({ ...bSubmission })`；**不实际提交 B**，不继续规划、不结束/归档。工厂返回上列十字段的深拷贝。

所有 typed Turn DTO 调用生产 Schema 时统一传对象展开 `{ ...submission }`（包括 helper/V1/V6）；这是满足 `Schema<Record<string, unknown>>` 输入类型的对象字面量，不 cast interface 或解析结果。helper 校验后仍返回原 `TurnSubmissionV1`。缺失字段负例按 V4 的解构方式生成新对象，保留原 packet。

ManagerSubmission 字符串/number/数组字段均 required（attendanceRecommendations optional）；TurnSubmission 的 required 字段完整见第 6 步，只有 replyTo/completionClaims optional。公开 message 的 id/seq/speaker/createdAt 是本测试生产 transition 参数/输出，不能冒称真实 runtime 分配。context 中 required `agentCatalog=null` 由 none binding 投影，不能省略或补伪 catalog。

事务、receipt、requestHash、outbox、Session ownership、事件持久化、迁移和兼容写：Not Applicable，离线 factory 没有 repository/DSH 调用。domain effect event 只作纯函数输出，不作为正式事件提交证据。

## 6. 工具与 provisioning 的离线 surface 检查

只在新 contract spec 的 collectToolDefinitions 中调用两注册函数。`definitions:ToolDefinition[]`；registry.register 把 definition push 后返回空 disposer。runtime 的 19 个方法统一绑定同一个 `vi.fn(async ():Promise<never> => { ... })` sentinel，函数体仅 `throw new Error("Unexpected offline runtime execution")`：acceptDecision、disposeDecision、disposeAgendaCandidate、sendMeetingMessage、finishMeetingMail、createMeeting、getStatus、createMeetingTask、meetingTaskStatus、startMeetingTask、finishMeetingTask、raiseHand、submitTurn、submitManagerPlan、pause、resume、reassignTurn、disposeRisk、endMeeting。callers.resolve 也绑定该函数。以 `MeetingToolRuntime` 类型检查完整对象，不 cast 假 Agent、不执行任何 definition.execute。两注册器当前只捕获 dependencies，注册时不会调用 runtime；collectToolDefinitions 返回前对 sentinel 使用 `expect(sentinel).not.toHaveBeenCalled()`，若未来发生执行测试即失败。

取 `convivium_create_meeting`、`convivium_submit_manager_plan`、`convivium_submit_turn` 三个唯一 definition，逐个断言 parameters 精确为：

```json
{"type":"object","properties":{"input":{"description":"Protocol v1 command input."}},"required":["input"]}
```

这是生产 `defineTool` 输出而非作者复制的 JSON；上述独立 expected 检查它没有展开内部字段。不得把 type=json DSL 与输出 JSON Schema 混淆，根对象当前不带 additionalProperties。新增测试命名为记录当前 surface，不将弱结构当安全保证；以后有意修订生产工具，应另行审查该观察，不盲目 update snapshot。

调用 `createSessionProvisioningEnvelope({teamId:"offline-team",meetingId:"offline-meeting",role:"manager"})`，断言 kind="convivium.session.provisioning"、version=1、role=manager、capability=none、participantId 不存在，instruction 等于生产当前完整字符串：

```text
This message establishes your meeting identity only. You have no planning or speaker capability yet. Wait for a later request that includes attemptId and deliveryId before using any meeting write tool.
```

再核对 factory.managerContext 有 planningAttemptId，但没有 own property attemptId/deliveryId；A/B context 的 attempt 则都有这两个字符串字段。记录为现有措辞与字段不对齐；不增加 Prompt、Schema、DSH 配置或 Manager deliveryId。本任务不判断模型实际上会如何响应。

## 7. 验证矩阵与精确测试

所有新增 it 只在唯一 contract spec 内。独立 expected 固定如下，不把工厂返回值再当唯一 oracle；不以 snapshot 更新消除失败。

| ID / it 名称 | 精确断言 |
| --- | --- |
| V1 `builds schema-valid offline inputs` | create、Manager 各经过相应生产 Schema，A/B 使用 `TurnSubmissionSchema({ ...submission })`；create keys 无运行状态；planningState.version=1、plannedState.version=2、afterAState.version=3。planningState.participants IDs 精确 [participant-a,participant-b]，objectiveContract.acceptanceCriteria 精确 [{id:"criterion-reference",description:"B cites A",satisfied:false}]，agenda 首项 id=agenda-reference/status=discussing |
| V2 `plans only A before B` | plannedState 的 steps speaker 精确 [participant-a,participant-b]；status 精确 [running,pending]，仅一个 attempt；aContext.step.participantId=A、recentMessages=[]、throughSeq=0；Manager context.agentCatalog=null、无 attendanceRecommendations |
| V3 `projects the submitted A message into B context` | afterAState.transcript 长度1，id=offline-message-a、seq=1、speaker=A、content 逐字等于 §5 A 常量；bContext.recentMessages 长度1且上述四字段精确相同，throughSeq=1；B step=offline-step-1，A/B attempt 与 delivery 不相同，B input.replyTo=offline-message-a 且正文为 §5 B 常量 |
| V4 `rejects missing protocol fields and text-only replies` | 分别用解构排除 Manager planningAttemptId（`const { planningAttemptId: _planningAttemptId, ...missingPlanning } = structuredClone(f.managerSubmission)`）和 A deliveryId（`const { deliveryId: _deliveryId, ...missingDelivery } = structuredClone(f.aSubmission)`），再将另一 Turn 输入替换为 {content:"OK"}，生产 Schema 均 throw；不对 typed required 属性使用 delete。保持原 factory packet JSON 不变；不把自然语言 OK 当 input |
| V5 `rejects stale planning and unassigned speaker projection` | 对 planningState 的深拷贝调用 runManagerPlan(f, f.managerContext.meetingVersion+1)，抛 DomainError 且 code=STALE_MANAGER_ATTEMPT。对 plannedState 请求 participant-b + offline-turn-1-attempt-1，projectSpeakerMeetingContext 抛 TypeError（B 尚未分配）；对 afterAState 请求 participant-a + B attempt ID 同样抛 TypeError。两 state JSON 前后不变 |
| V6 `separates schema validity from reply reference evidence` | 复制 B input，把 replyTo 改为 offline-missing；使用 `TurnSubmissionSchema({ ...invalidSubmission })` 仍可解析（string Schema 不做此引用语义校验），但生产 bContext.recentMessages 中无该 ID；正确 B.replyTo 能定位唯一 A。此负例证明“可解析不等于有引用证据”，不声称生产工具拒绝错误 reply，也不新增通用 validator |
| V7 `records current tool and provisioning surfaces` | §6 三个 definition 名称唯一、parameters 完全匹配独立 expected；runtime/caller 函数未执行；生产 Manager envelope 完整 instruction 匹配，Manager context 缺 attemptId/deliveryId 而有 planningAttemptId；A/B context.attempt 则有两字段 |
| V8 `returns detached repeatable fixtures` | 两次工厂 JSON 完全相等；修改第一次 bContext.recentMessages[0].content 后，第一次 afterAState.transcript[0].content、第二次整个 packet 保持原值；证明返回深拷贝及无跨调用共享，而非盲目冻结对象 |
| V9 本地完整门禁与文档收口 | T3 新 fixture/spec 的明确 TypeScript 检查和 focused suite 通过；T4 完整 verify；T5 专项 evidence/链接/diff/删除检查通过 |

runManagerPlan 的实现严格重复 §5.4 的 domainInput/domainContext/ids 映射，只把 observedMeetingVersion 取形参；不改 planningState 内的 version。负例用 try/catch 捕获 unknown 后 `expect(error).toBeInstanceOf(DomainError)`，`if (!(error instanceof DomainError)) throw error` 后检查 code；不得 `as DomainError` 隐藏未知错误，未抛错则测试显式失败。

成功/边界输入/非法字段：V1–V6；纯身份/attempt 绑定：V2/V5。caller authority/capability、stale repository version、请求重放/idempotency conflict、数组部分非法 command 原子性、transaction rollback、receipt/outbox/event commit、restart/reopen/recovery、Archive/Session cleanup：**Not Applicable 于本次新增纯数据准备边界**；不是对应产品行为通过。其真实运行全部 Not Covered，现有 suite 随 verify 保持。模型/价格/凭据/真实外部验证亦 Not Covered，后续需单独决定与授权，不阻止离线资料完成。

## 8. 机械执行步骤

所有命令从仓库根目录运行。本轮没有执行这些实施步骤；后续执行者不得边读本文边改变 Scope。

已完成进度：T0 基线检查通过（33 tests）；T1 fixture/spec 与 V1/V2/V3/V8 断言通过（focused suite）。对应机械步骤已删除；T2 仍在执行。

### T2：补齐负向与生产 surface 断点

前置状态：T1 PASS。
允许修改：仅上述新 contract spec；fixture 仅修正本轮发现的不符合 §5 的机械实现错误，不改变规格。
禁止修改：生产 instruction、toolParameters、context 字段；不加 runtime、mock provider、profile 或模型请求。

执行：添加 §7 V4/V5/V6/V7 四个 it；按 §6 实现 collectToolDefinitions，按 §7 实现 runManagerPlan。固定注册 runtime 19 方法均为抛错 sentinel，禁止 tools.execute。负向输入用原 packet 的深拷贝，按矩阵分别检查 Schema 与 projector/domain 结果；不要声称 replyTo string Schema 验证了引用有效性。

验证：
```sh
pnpm --dir plugin exec vitest run --project contract tests/contract/offline-meeting-protocol.spec.ts
```
PASS：共八个 it 全部通过；证据同时包含合法自洽输入、无效输入拒绝、当前 surface 限制；未调用 runtime/caller sentinel。
STOP：捕获未知错误却放行、用快照更新抹掉字段差异、需要模型/prompt 修补或新授权。记录静态结构差异，不称已复现模型故障。

### T3：测试本身的类型与格式门禁

前置状态：T2 PASS。
允许修改：只对两个新文件执行以下 formatter；生成物不手工编辑。
禁止修改：tsconfig、existing tests、host/client source。

执行：Vitest 默认不做完整类型检查，因此对新 fixture/spec 显式运行 tsc；不得只依赖 package typecheck（其配置排除 tests）。

验证：
```sh
pnpm --dir plugin exec prettier tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts --write
pnpm --dir plugin exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --verbatimModuleSyntax tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/offline-meeting-protocol.spec.ts
git diff --check
```
PASS：全部退出 0，仍为八个测试；无 as any/as unknown/non-null assertion 用于掩盖 fixture 错误。`as const` 仅用于 literal 类型，不是放宽校验。
STOP：任何命令失败；只允许修正两个新文件使其符合既定规格，不能改 tsconfig/Schema/生产文件。修正后重跑本步骤，不扩展设计。

### T4：完整本地验证与未覆盖边界

前置状态：T3 PASS。
允许修改：本步骤无手工源码修改；`plugin/lib/` 仅允许现有 build 自动产生已忽略产物。
禁止修改：tracked product/现有 tests、共享 coverage/TODO、DSH_HOME/profile/dev.env；不使用 verify:runtime。

执行：运行完整 keyless verify，检查最终 diff 范围；构建产物不是新增交付文件，不清理用户原有 build 文件。

验证：
```sh
pnpm --dir plugin verify
git diff --check
git status --short
```
PASS：format/lint/typecheck/test/build/environment/contract/agent-definitions/package 全部退出 0，新增八个测试包含其中；tracked/untracked 差异只有本文和两个新增测试文件。
STOP：既有 gate 失败或出现白名单外 diff；报告，禁止顺手修产品。没有 Host/Session/临时 profile；Restore 为 Not Applicable，测试数据仅内存，Vitest 进程退出即释放。不删除用户文件或运行中的其他进程。

### T5：长期证据与删除

前置状态：S1–S4、V1–V9 除本步骤迁移外全部满足，T4 为最新代码结果。
允许修改：只新增 `docs/40-readiness/OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md` 并删除本文。
禁止修改：shared coverage/TODO、其他任务 evidence、正式需求/接口/设计/操作、产品与现有测试。

执行：
1. evidence 固定 Scope / Validated Contract / Executed Validation / Not Covered / Closure 五节，记录日期、HEAD 和两新增测试文件 hash、命令/退出码/八个 it 结果、固定 canonical mapping、A/B context 来源、当前三工具 parameters、生产 Manager instruction 与 context 字段不对齐。写明这是当前 surface 描述，不是模型能力或新产品规范。
2. Not Covered 完整迁移 §2 移出范围：模型/preset/provider费用与凭据尚需后续用户决定、真实 Host/Session/工具执行/cleanup 未验证、真实 B reply/语义质量未验证。旧真实模型计划没有完成，不在此证据暗示完成。readiness 不能含凭据/私有 Session/隐藏推理。
3. 稳定成果是 test-only 样例与 contract suite，不改变产品语义或运行入口，因此 requirements/interfaces/designs/operations 迁移 Not Applicable；长期验证事实全在专项 evidence。向原任务交付范围与证据用于总整合，但不等待其共享文件修改才关闭独立离线任务。
4. 搜索本文文件名与标题；只有本文自身引用才可删除，发现外部引用即 STOP，不修改别人的文档。删除前运行 §9 链接/diff 检查，再删除本文，再运行同样检查。删除后失败只恢复本次删除的本文并 STOP，不留下 completed/archive RUNBOOK。

验证：
```sh
test -s docs/40-readiness/OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md
rg -n '^## (Scope|Validated Contract|Executed Validation|Not Covered|Closure)' docs/40-readiness/OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md
rg -n 'RUNBOOK-REAL-MODEL-MEETING-VALIDATION|离线最小会议协议与上下文一致性准备' docs .agents TODO.md
git diff --check
```
PASS：五节完整且对应实际结果；evidence 不以本文名称/标题建立残留导航引用；删除前仅本文引用，删除后 rg 退出1表示无匹配；§9 链接检查、diff 检查退出0。无真实运行结果也能完成已授权离线交付，但必须保留全部移出边界。
STOP：证据失实、仍有唯一未覆盖信息仅在本文、外部引用或删除后断链；保留/恢复本文，不虚构真实会议闭环。

## 9. Author/Audit 核验与最终结论

当前只交付 RUNBOOK；两个新测试文件和 evidence 尚未创建，八个新测试和 T0–T5 均未执行。现有 source/类型/Schema/注册器/DSH defineTool 转换/测试入口已只读调查，未调用模型、读 dev.env 或修改 profile。

文档链接固定检查（作者与 T5 删除前后均运行；不访问网络）：

```sh
python3 - <<'PY'
from pathlib import Path
import re, subprocess
count = 0
for name in subprocess.check_output(['rg','--files','docs','-g','*.md'], text=True).splitlines():
    path = Path(name)
    body = re.sub(r'```.*?```','',path.read_text(),flags=re.S)
    for raw in re.findall(r'\[[^\]]*\]\(([^)]+)\)',body):
        target = raw.split('#',1)[0]
        if not target or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target):
            continue
        assert (path.parent/target.strip('<>')).exists(), (name,target)
        count += 1
print(f'PASS: {count} local link targets')
PY
git diff --check
```

新文件未跟踪时普通 git diff 不覆盖正文；另用 `git diff --no-index --check /dev/null docs/30-designs/RUNBOOK-REAL-MODEL-MEETING-VALIDATION.md`，无输出表示无 whitespace 报错，退出1可仅表示新增差异；再检查逐行无尾随空白/冲突标记/EOF 换行。路径核验区分 §4 的三个计划新增文件与既有入口，不把计划文件不存在误记缺陷。

| RUNBOOK Rules 审计项 | 对应位置与结论 |
| --- | --- |
| 状态/分支/执行者/授权 | §1，离线范围无需模型/费用/凭据决定；后续 Execute 仍需许可 |
| 起点终点/断点/范围 | §2–3，实质交付工厂+contract suite，原真实闭环清晰移出 |
| 精确结构/字段/owner/时间/ID/version | §4–6，全部新符号唯一位置，生产类型复用，固定十字段/1→2→3/引用链 |
| 调用链/不变量 | §3–7，纯函数证明与 runtime/模型证明分开；不手造 B context，不执行工具 |
| 机械顺序/聚焦验证/失败恢复 | T0–T5，同格式且无占位命令；8 it、显式 tests tsc、完整 verify；无外部资源 |
| 双向追踪/风险矩阵 | S1→V1–3，S2→V4–6，S3→V7，S4→V8–9；无一步落入产品修复或其他任务 |
| 非适用/未覆盖/迁移/删除 | §2/§7/T5，数据库和Session边界不适用，真实模型决定迁移专项 evidence；删除后失败恢复 |
| 实际检查 | 见下方作者执行记录；不把计划中的测试标 Pass |

自审结论：Executable，仅针对离线协议与上下文准备的缩减目标。另两位审核必须针对同一个最终文件 hash；如果指出新的决策缺口则先修订再核对，不能用旧 hash 的批准宣布完成。

作者实际检查记录（2026-09-07）：HEAD/分支和 status 已核对；只有本文为未跟踪新增。docs 全量 76 个本地 Markdown 链接目标存在；本文 whitespace、冲突标记、EOF 换行与计划路径检查通过。交叉审查发现的 Turn DTO→Record Schema 类型问题已固定为对象展开，缺失 required 字段负例固定为解构排除；shell block 仅做语法解析通过，未执行命令。生产类型/参数、状态 version、Schema、projector、注册器和 package 验证入口已只读核对。未执行 T0–T5，未创建计划文件，未运行新增测试/完整 verify/模型或 smoke；所有实现与运行结果仍为 Not Covered。
