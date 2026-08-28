# RUNBOOK：正式问题 Question 事实闭环

状态：待实施
执行分支：`codex/feat/question-fact-closure`
建立日期：2026-08-28

## 0. 执行者契约

本 RUNBOOK 面向不能承担产品、架构或接口判断的低级 LLM。执行者只能按本文指定的顺序、文件、符号、数据结构、错误语义和验证命令工作。

执行者必须遵守以下规则：

1. 从 T0 开始顺序执行；前一任务未满足 PASS 条件，不得进入下一任务。
2. 不得选择替代数据结构、替代接口、替代文件、替代 ID 方案或替代错误码。
3. 不得把本文中的示例改写为“更通用”的 abstraction、factory、adapter、framework、event bus 或 shared utility。
4. 不得实现第 3.2 节内容，不得顺手修复无关测试、格式或历史代码。
5. 只允许修改第 6 节逐项列出的文件；测试 fixture 因新增必填内部字段而必须同步时，只修改直接失败的 fixture。
6. 遇到本文没有规定的产品行为、接口冲突、需要新增文件、需要数据库迁移或需要修改 DSH API 时，立即执行 STOP：停止编码，保留已通过步骤，报告文件、符号、冲突和最小复现命令。
7. 不得使用类型断言、默认值、忽略异常、跳过测试或放宽 Schema 来绕过失败。
8. 每完成一个任务，只运行该任务指定的验证；全部任务完成后再运行完整验证。
9. PASS 表示命令退出码为 0 且断言覆盖规定行为；“代码看起来正确”不算 PASS。
10. 本 RUNBOOK 没有授权 commit、push、创建 PR 或合并；只有用户明确要求后才能执行这些操作。

## 1. 目标

在现有 Meeting Runtime 上闭合一条小而完整的业务链路：

```text
Participant 通过 submit_turn 提交 changes.questions
  -> Runtime 校验并生成 canonical MeetingQuestion
  -> 同事务保存 message、question、event 和 receipt
  -> meeting_status 展示问题及其阻塞状态
  -> 后续合法 answer message 通过 questionResolutions 回答问题
  -> completion judge、终态和 Archive 使用一致的问题事实
```

本 RUNBOOK 是临时执行边界，不是新的需求或接口真相源。正式行为必须先进入需求、接口或设计文档，再进入代码。闭环完成后，将长期结论和验证证据迁移到正式文档及 `docs/40-readiness/`，随后删除本 RUNBOOK 及其残留引用。

## 2. 当前断点

| 入口 | 当前现状 | 本闭环要消除的断点 |
| --- | --- | --- |
| `TurnSubmissionV1.changes.questions` | 协议已有 `QuestionClaimV1` | Runtime 构造 message 时丢弃全部 `changes` |
| `MeetingQuestion` | 已有最小内部模型 | 缺少 `directedTo`、`blocking`、`answerMessageId`、`createdAt` 等 canonical 字段 |
| `questionResolutions` | completion 已能把问题标为 `answered` | 未固化 `answerMessageId`，也没有明确的问题领域事件 |
| completion judge | 会检查未关闭问题 | 当前所有 open question 都阻塞完成，未落实非阻塞问题语义 |
| `meeting_status` | 没有公开问题集合 | 无法检查创建、回答及阻塞状态 |
| Archive | 已保存 open/deferred unresolved questions | 需要验证与新 canonical question、回答事实一致，不新增第二套模型 |
| 测试 | 主要覆盖 fixture 和 resolution 局部行为 | 没有从正式 submit 到 status、resolution、completion、Archive 的闭环证据 |

基线验证（2026-08-28）：

- `pnpm --dir plugin verify:environment`：通过，检测到 15 个 DSH packages。
- `pnpm --dir plugin verify:contract`：通过。

## 3. 范围

### 3.1 本次必须完成

- 只接通 `TurnSubmissionV1.changes.questions`；提交者不能直接提供 question ID、状态、回答或时间戳。
- 将合法 claim 规范化为当前 Meeting、当前 agenda item、真实 speaker 身份下的 `MeetingQuestion`。
- canonical question 至少包含 `id`、`text`、`askedBy`、`agendaItemId`、`blocking`、`status`、`createdAt`；按输入和生命周期保存 `directedTo`、`answerMessageId`。
- 使用 Runtime 生成的稳定 question ID；相同 delivery 的幂等重放不得产生重复 question。
- message、questions、meeting version、领域事件和 command receipt 使用现有 `MeetingRepository.execute()` 原子提交；任一 claim 非法时整个 turn 零写入。
- 新增明确的 `question.added` 领域事件；合法回答时设置 `answerMessageId` 并新增 `question.answered`，同时保留已有 completion fact 审计链。
- 落实最小阻塞语义：本闭环只接受 `blocking: false`。当前 `QuestionClaimV1` 没有 affected output、criterion、constraint、review 或 risk evidence 字段，无法证明 FR-6 所要求的有效阻塞依据；`blocking: true` 必须返回 `UNSUPPORTED_CAPABILITY` 且整个 turn 零写入。open non-blocking question 不阻止完成；`answered | withdrawn | deferred` 也不阻止完成。
- `meeting_status` 通过正式 V1 契约和独立 mapper 暴露当前问题事实。为保持 V1 兼容，新增字段应为 additive optional，producer 对相关 discussion 状态稳定输出。
- 合法 `questionResolutions` 只能引用当前 Meeting 中由 caller 本次或既有正式消息提供的 answer；成功后 question 与 answer 的关联不可被另一答案覆盖。
- 验证终态与 Archive：open/deferred question 进入既有 unresolved questions；answered question 由正式 transcript、question 状态和 completion fact 保留证据，不扩张 Archive schema。
- 更新 implementation coverage/readiness，并记录实际验证命令、结果与未覆盖边界。

### 3.2 明确不包含

- `changes.proposals`、`positions`、`decisionProposals`、`issues` 或 `agendaCandidates`。
- blocking question 的证据模型和正式创建；本闭环固定拒绝 `blocking: true`，不得自行设计证据字段。
- 通用 fact framework、adapter、worker、event bus、LangGraph 或新的状态机框架。
- Captain 风险接受、问题转派、批量编辑、自动摘要或自然语言抽取。
- 新增 HTTP route、Plugin Frontend、邮件、continuation 或视觉交互。
- 修改 DSH-owned Session Events、Agent Prompt、Skills、Tools、MCP、profile composition 或权限模型。
- 新的 SQLite table、通用 repository API 或 schema migration；若现有 snapshot/transaction 契约无法承载本闭环，停止并重新评估范围。
- 仅为未来其他 `changes` 类别预建抽象、兼容层或扩展点。

### 3.3 Not Applicable

| 边界 | 结论 | 依据 |
| --- | --- | --- |
| SQLite schema migration | Not Applicable | `MeetingState` 以既有 snapshot JSON 保存，Question 不新增 table、index 或 repository API |
| DSH smoke/profile | Not Applicable | 本闭环不修改 DSH import、bundle/profile、Session 或 host/client API |
| HTTP/UI | Not Applicable | 本闭环只修改 command、domain、repository snapshot、status projection 和 Archive 测试 |
| 外部副作用恢复 | Not Applicable | Question 写入只发生在既有 `MeetingRepository.execute()`，不新增网络、文件或 Session 副作用 |

## 4. 依据与关联文件

- [架构约束](../00-governance/ARCHITECTURE.md)
- [RUNBOOK 规则](../00-governance/RUNBOOK-RULES.md)
- [会议需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-6、FR-8 及问题、完成、状态相关验收标准
- [Agent 会议协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：`QuestionClaimV1`、`PublicQuestionV1`、`questionResolutions`、status
- [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)
- [Domain Model](./DOMAIN-MODEL-DESIGN.md)
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)
- [DSH 插件开发 Skill](../../.agents/skills/dsh-plugin-development/SKILL.md)
- [当前实现覆盖](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)

预期代码入口：

| 文件 | 本闭环职责 |
| --- | --- |
| `plugin/src/protocol/commands.ts` | Question claim 输入校验 |
| `plugin/src/protocol/status.ts` | additive status question 字段与 Schema |
| `plugin/src/domain/model.ts` | canonical `MeetingQuestion` 和事件类型 |
| `plugin/src/domain/transitions.ts` | message/question 原子状态转换 |
| `plugin/src/domain/completion.ts` | question resolution 与 objective 阻塞判断 |
| `plugin/src/tools/meeting-runtime.ts` | caller binding、ID 分配和 repository 编排 |
| `plugin/src/projection/status.ts` | 内部 question 到公开 projection 的映射 |
| `plugin/src/runtime/archive.ts` | 复用现有 unresolved question Archive 路径 |
| `plugin/src/repository/*` | 复用既有 snapshot、event、receipt 和原子事务 |

任何表中路径或符号不存在时执行 STOP，不得自行选择替代入口。

### 4.1 需求到验证追踪

| 正式依据 | 本闭环行为 | Production symbol | Focused validation |
| --- | --- | --- | --- |
| FR-6.3、FR-6.5；AC-5 | 记录 non-blocking question | `TurnSubmissionSchema`、`addSubmittedQuestions` | `protocol-schema.spec.ts`、`transitions.spec.ts`、`meeting-runtime.spec.ts` |
| FR-6.4；AC-6 | 无有效依据不能创建 blocking question | `addSubmittedQuestions` | `transitions.spec.ts`、`meeting-runtime.spec.ts` |
| AC-10 | 授权 resolution 更新 question | `applyCompletionClaims` | `completion.spec.ts` |
| AC-11 | open non-blocking question 不阻止完成 | `isObjectiveSatisfied` | `completion.spec.ts` |
| AC-13 | 重启不丢失，重放不重复 | `MeetingRepository.execute` 既有契约 | `repository.spec.ts`、`recovery.spec.ts`、`meeting-runtime.spec.ts` |
| AC-16 | status 可观察 question | `DiscussionMeetingStatusBaseV1`、`projectMeetingStatus` | `protocol-schema.spec.ts`、`status-projection.spec.ts` |
| Protocol `QuestionResolutionClaimV1` | answer 绑定 caller authored message | `applyCompletionClaims` | `completion.spec.ts` |
| Domain Model `MeetingQuestion` | canonical 字段与生命周期 | `MeetingQuestion`、`DomainEventTypes` | `transitions.spec.ts`、`completion.spec.ts`、`archive.spec.ts` |

### 4.2 固定目标数据结构

执行者必须把内部模型改成以下精确形状；字段的 required/optional 不得改变：

```ts
export interface MeetingQuestion {
    id: string;
    text: string;
    askedBy: string;
    directedTo?: string;
    agendaItemId: string;
    blocking: boolean;
    status: "open" | "answered" | "withdrawn" | "deferred";
    answerMessageId?: string;
    createdAt: number;
}
```

在 `plugin/src/domain/transitions.ts` 增加以下输入类型，并在 `SubmitSpeakerAdvanceContext` 中增加 required `questions` 字段：

```ts
export interface SubmittedQuestionInput {
    id: string;
    text: string;
    directedTo?: string;
    blocking: boolean;
    createdAt: number;
}

export interface SubmitSpeakerAdvanceContext extends SpeakerSubmissionContext {
    now: number;
    nextPlanningAttemptId: string;
    nextPlanningDeliveryId: string;
    questions: readonly SubmittedQuestionInput[];
    completion?: Omit<ApplyCompletionClaimsContext, "participantId" | "now">;
}
```

字段来源固定如下：

| `MeetingQuestion` 字段 | 唯一来源 |
| --- | --- |
| `id` | Runtime 按 `question-${deliveryId}-${index + 1}` 生成，index 使用输入数组顺序 |
| `text` | `QuestionClaimV1.text.trim()` |
| `askedBy` | repository transition 内的真实 `participantId` |
| `directedTo` | claim 原值；存在时必须匹配 `state.participants[].id` |
| `agendaItemId` | 当前已校验 SpeakerAttempt 所属 `turn.agendaItemId` |
| `blocking` | 本闭环只保存 `false`；`true` 整体拒绝 |
| `status` | 创建时固定为 `"open"` |
| `answerMessageId` | 仅由合法 `questionResolutions` 设置 |
| `createdAt` | 与本次提交 message 相同的 `commandNow` |

公开结构保持现有 `PublicQuestionV1` 字段 optional 设计，不收紧 V1 输出兼容性。在 `DiscussionMeetingStatusBaseV1` 只增加：

```ts
questions?: readonly PublicQuestionV1[];
```

producer 必须始终为 active 和 execution-terminal discussion status 输出 `questions`；旧 caller 不提供该字段也不影响任何 command 输入。

### 4.3 固定接口与调用链

实现后的调用链必须严格为：

```text
TurnSubmissionSchema
  -> TurnSubmissionV1.changes.questions
  -> meeting-runtime.ts submitTurn
  -> SubmittedQuestionInput[]
  -> submitSpeakerAndAdvanceMeeting
  -> submitSpeakerAttempt
  -> addSubmittedQuestions
  -> applyCompletionClaims
  -> MeetingRepository.execute 单事务提交
  -> projectMeetingStatus / materializeArchivePackage
```

在 `plugin/src/domain/transitions.ts` 新增并导出以下函数，函数名和签名固定：

```ts
export function addSubmittedQuestions(
    state: MeetingState,
    participantId: string,
    agendaItemId: string,
    questions: readonly SubmittedQuestionInput[]
): TransitionResult<MeetingState>
```

`submitSpeakerAndAdvanceMeeting` 内部调用顺序固定为：

1. `submitSpeakerAttempt`；
2. `addSubmittedQuestions`；
3. requested MeetingTask omission check；
4. `applyCompletionClaims`；
5. `queueMeetingTasks`；
6. 既有 completion judge 和下一轮 planning。

不得把 question 写入移动到 Runtime、repository、projection 或 Archive。不得为 question 新增 repository method。

事件固定为：

```text
question.added
payload = {
  meetingId,
  questionId,
  askedBy,
  agendaItemId,
  blocking,
  meetingVersion
}

question.answered
payload = {
  meetingId,
  questionId,
  answerMessageId,
  answeredBy,
  meetingVersion
}
```

`question.added` 按输入 question 顺序追加；`question.answered` 在对应 `completion_fact.added` 之前追加。两类事件都加入 `DomainEventTypes`，不得复用 `message.added` 或只写自由文本 payload。

错误语义固定为：

| 条件 | Domain error | 固定 Domain message | 公开 command error |
| --- | --- | --- | --- |
| helper caller 不属于 Meeting | `INVALID_ENTITY_STATE` | `question caller is not a meeting participant` | `INVALID_ARGUMENT` |
| agenda 不存在或不是 active agenda | `INVALID_ENTITY_STATE` | `question agenda is not active` | `INVALID_ARGUMENT` |
| `blocking: true` | `UNSUPPORTED_CAPABILITY` | `blocking question evidence is not supported by QuestionClaimV1` | `UNSUPPORTED_CAPABILITY` |
| trim 后空文本 | `INVALID_ENTITY_STATE` | `question text must not be empty` | `INVALID_ARGUMENT` |
| `directedTo` 不属于当前 Meeting | `INVALID_ENTITY_STATE` | `question target is not a meeting participant` | `INVALID_ARGUMENT` |
| question ID 为空或已存在 | `INVALID_ENTITY_STATE` | `question id is invalid or already exists` | `INVALID_ARGUMENT` |
| unknown question | `INVALID_ENTITY_STATE` | `question resolution references an unknown question` | `INVALID_ARGUMENT` |
| unknown、foreign 或非 caller authored answer | `INVALID_ENTITY_STATE` | `question resolution must reference the caller's meeting answer` | `INVALID_ARGUMENT` |
| 已回答或已有 `answerMessageId` | `INVALID_ENTITY_STATE` | `question is not open for resolution` | `INVALID_ARGUMENT` |
| stale attempt | 保持既有 `STALE_ATTEMPT` | 保持既有 message | 保持既有映射 |
| terminal Meeting | 保持既有 `IMMUTABLE_MEETING` | 保持既有 message | 保持既有映射 |

## 5. 不可违反的不变量

1. Question claim 是不可信输入，不是状态覆盖；caller 不能指定 ID、actor、agenda、status、answer 或时间戳。
2. `askedBy` 必须来自真实 caller 与当前有效 SpeakerAttempt；`agendaItemId` 必须是提交时的当前 agenda item。
3. `directedTo` 若存在，必须是当前 Meeting 的 Participant；未知、跨 Meeting 或失效 identity 整体拒绝。
4. `text` trim 后必须非空；协议 Schema 与 domain transition 都不能接受空问题。
5. Runtime 生成的 question ID 必须对同一已接受 delivery 稳定，并与 caller 提供的文本无碰撞权限。
6. message、全部 questions、event、version 和 receipt 必须同事务成功或全部回滚；禁止只保存 transcript 或部分 questions。
7. 同一 request 和 hash 重放返回原 receipt；同 request ID 不同 hash 返回 `IDEMPOTENCY_CONFLICT`，不得重复写入。
8. stale version、无效 attempt、越权 caller、非法 directed target 或终态写入都不得产生 message、question、event 或 receipt。
9. 本闭环不能创建 blocking question；`blocking: true` 固定返回 `UNSUPPORTED_CAPABILITY`。open non-blocking question 不阻止 objective 完成。
10. 不得根据 `agendaRelation`、`directedTo` 或 question 文本推断有效阻塞依据，也不得自行增加阻塞证据字段。
11. 回答必须引用当前 Meeting 中由 caller authored 的正式 answer message；成功后设置 `answerMessageId`，同一 question 不得被后续不同 answer 覆盖。
12. `question.answered` 与既有 `completion_fact.added` 各自表达问题生命周期和完成审计，不用一个事件冒充另一个。
13. 终态 Meeting 不可新增或回答问题；Archive 不从自然语言重新推断问题状态。
14. 领域事件是 Convivium 的 SQLite 事实，不是 DSH Session Event；本闭环不新增或伪造 DSH 事件。

## 6. 机械执行步骤

### T0：基线门

前置状态：当前分支必须为 `codex/feat/question-fact-closure`。
允许修改：无；本步骤只读。
禁止修改：全部仓库文件、依赖和外部状态。

执行：无；本步骤只运行只读验证。

验证：工作目录固定为仓库根目录，依次执行：

```bash
pnpm --dir plugin verify:environment
pnpm --dir plugin verify:contract
git branch --show-current
git status --short
```

PASS：前两个命令退出码均为 0，第三个命令的唯一输出为 `codex/feat/question-fact-closure`，并保存第四个命令输出；后续不修改无关文件。
STOP：任一验证失败；报告完整命令和首个错误，不得先改代码。

### T1：修改正式文档

前置状态：T0 PASS。
允许修改：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`。
禁止修改：requirements、readiness、production code、tests 和本步骤未列出的文档。

执行：

只修改以下三份文档：

1. `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
   - 保持 `PublicQuestionV1.askedBy?`、`agendaItemId?`、`blocking?` 为 optional；内部 canonical model 仍为 required。
   - 在 `QuestionClaimV1` 后写明：V1 当前没有有效阻塞依据字段，本闭环只接受 `blocking: false`，`true` 返回 `UNSUPPORTED_CAPABILITY`。
   - 在 `DiscussionMeetingStatusBaseV1` 增加 `questions?: readonly PublicQuestionV1[]`。
   - 写明 producer 对 active 和 execution-terminal discussion status 始终输出 `questions`。
   - 写明 resolution 只能绑定 caller authored 的当前 Meeting message，成功后 `answerMessageId` 不可被另一答案覆盖。
   - 写明非法 Question claim/resolution 统一公开为非重试的 `INVALID_ARGUMENT`，内部 `INVALID_ENTITY_STATE` 不得泄露。
2. `docs/30-designs/DOMAIN-MODEL-DESIGN.md`
   - 保留现有 Question 字段要求。
   - 增加 `question.added`、`question.answered` 的事实含义。
   - 写明 `blocking: true` 在 V1 本闭环中不创建，因为 claim 无法携带 FR-6 所需依据。
3. `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
   - 写入第 4.3 节固定调用顺序。
   - 写明 open non-blocking question 不参与 objective 阻塞。
   - 写明回答由 active CompletionFact 驱动并固化 `answerMessageId`。

不得修改 requirements；本步骤只把既有 FR-6 的安全收窄落实到接口和设计。

验证：

```bash
rg -nF 'interface QuestionClaimV1' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
rg -nF 'blocking: false' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
rg -nF 'UNSUPPORTED_CAPABILITY' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
rg -nF 'questions?: readonly PublicQuestionV1[]' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
sed -n '/interface PublicQuestionV1 {/,/^}/p' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md | rg -nF 'askedBy?: string'
sed -n '/interface PublicQuestionV1 {/,/^}/p' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md | rg -nF 'agendaItemId?: string'
sed -n '/interface PublicQuestionV1 {/,/^}/p' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md | rg -nF 'blocking?: boolean'
rg -nF 'INVALID_ENTITY_STATE' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
rg -nF 'INVALID_ARGUMENT' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
rg -nF 'question.added' docs/30-designs/DOMAIN-MODEL-DESIGN.md
rg -nF 'question.answered' docs/30-designs/DOMAIN-MODEL-DESIGN.md
rg -nF 'open non-blocking question' docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
rg -nF 'answerMessageId' docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
git diff --check -- docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md docs/30-designs/DOMAIN-MODEL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
```

PASS：十三个 `rg` 命令和 `git diff --check` 均退出码为 0；三份文件均只发生本步骤列出的语义变化。
STOP：任一命令失败，或正式需求明确要求当前 `QuestionClaimV1` 在没有证据字段时创建 blocking question；报告冲突位置。

### T2：协议类型与 Schema

前置状态：T1 PASS，正式接口和设计已包含本闭环固定语义。
允许修改：`plugin/src/protocol/commands.ts`、`plugin/src/protocol/types.ts`、`plugin/src/protocol/status.ts`、`plugin/tests/contract/protocol-schema.spec.ts`。
禁止修改：domain、Runtime、repository、Archive 和其他 claim Schema。

执行：

1. 修改 `plugin/src/protocol/commands.ts`：
   - 把 `questionClaim.text` 从 `string()` 改成 `nonEmptyString()`。
   - 不修改 `QuestionClaimV1` 的其他字段，不修改其他 `meetingChanges` claim Schema。
2. 修改 `plugin/src/protocol/types.ts`：
   - 在 `DiscussionMeetingStatusBaseV1` 的 `messages` 后增加 `questions?: readonly PublicQuestionV1[];`。
   - 不修改现有 `PublicQuestionV1` optional 字段。
3. 修改 `plugin/src/protocol/status.ts`：
   - 在 `active` 和 `terminal` Schema 的 `messages` 后各增加 `questions: Schema.array(question),`。
   - 不给 `questions` 调用 `.required()`，以保持 additive V1 读取兼容。
4. 修改 `plugin/tests/contract/protocol-schema.spec.ts`：
   - 增加空白 question text 被 `TurnSubmissionSchema` 拒绝的测试。
   - 给 active 和 terminal status 各增加一个含 `questions` 的成功 Schema 测试。

验证：

```bash
pnpm --dir plugin vitest run tests/contract/protocol-schema.spec.ts
pnpm --dir plugin typecheck
```

PASS：两个命令退出码均为 0。
STOP：Schemastery 无法表达 optional question array；不得改成 required，不得放宽整个 status Schema。

### T3：内部模型与领域事件枚举

前置状态：T2 PASS。
允许修改：`plugin/src/domain/model.ts`，以及 `plugin/tests/unit/domain/completion.spec.ts`、`plugin/tests/unit/domain/transitions.spec.ts` 中下列三个既有 non-empty `MeetingQuestion` fixture。
禁止修改：production 兼容读取、repository schema、transition、completion 行为和测试断言语义。

执行：

1. 修改 `plugin/src/domain/model.ts`：
   - 用第 4.2 节精确结构替换现有 `MeetingQuestion`。
   - 在 `DomainEventTypes` 的 `message.added` 后依次加入 `question.added`、`question.answered`。
2. 精确更新三个既有 fixture：
   - `completion.spec.ts` 的 `completionState()` 中 `question-1` 增加 `blocking: true`、`createdAt: now`，保留现有 `askedBy` 和 `agendaItemId`。
   - `transitions.spec.ts` 的 `preserves unresolved facts for no-consensus termination` 中 `question-1` 增加 `blocking: true`、`createdAt: now`，保留现有 `askedBy` 和 `agendaItemId`。
   - `transitions.spec.ts` 的 `requires agenda and blocking facts to be settled before completion` 中 `question-1` 增加 `askedBy: "participant-1"`、`agendaItemId: "agenda-1"`、`blocking: true`、`createdAt: now`。
3. 不修改 `archive.spec.ts` 顶层经 `as unknown as MeetingState` 构造的缺字段 question；该 fixture 专门验证 Archive 不为缺失 optional 公开字段填造默认值。
4. 不修改其他 fixture。出现其他 required-field 错误时执行 STOP。

验证：

```bash
pnpm --dir plugin typecheck
```

PASS：`pnpm --dir plugin typecheck` 退出码为 0。
STOP：production 中存在来自历史数据库的缺字段读取并导致运行兼容问题；不得增加兼容默认值，报告读取入口和 fixture/数据库来源。

### T4：Question 创建 transition

前置状态：T3 PASS，内部 `MeetingQuestion` 和两个事件类型已经存在。
允许修改：`plugin/src/domain/transitions.ts`、`plugin/tests/unit/domain/transitions.spec.ts`。
禁止修改：Runtime、repository、completion、projection、Archive 和通用 fact abstraction。

执行：

1. 增加第 4.2 节 `SubmittedQuestionInput`。
2. 给 `SubmitSpeakerAdvanceContext` 增加 required `questions`。
3. 增加第 4.3 节 `addSubmittedQuestions`，按以下固定顺序校验全部输入，再创建任何 state：
   1. participantId 存在于 `state.participants`；
   2. agendaItemId 存在于 `state.agenda` 且等于 `state.activeAgendaItemId`；
   3. 所有 `id` 非空且不与 `state.openQuestions[].id` 重复，输入数组内也不重复；
   4. 所有 `text.trim()` 非空；
   5. 所有 `directedTo` 存在于 `state.participants[].id`；
   6. 任一 `blocking === true` 时抛出 `UNSUPPORTED_CAPABILITY`。
4. 校验全部通过后，按输入顺序创建第 4.2 节 `MeetingQuestion`，追加到 `state.openQuestions`。
5. 每个 question 追加一个第 4.3 节 `question.added`；`state.eventSeq` 增加事件数量。此 helper 不增加 `state.version`，因为 `submitSpeakerAttempt` 已为同一 command 增加一次 version。
6. 修改 `submitSpeakerAndAdvanceMeeting`，严格采用第 4.3 节调用顺序；后续步骤都使用 question helper 返回的 state/events。
7. 所有现有调用 `submitSpeakerAndAdvanceMeeting` 的测试 context 显式增加 `questions: []`，不得给 context 字段增加默认值。
8. 新增以下测试：合法单问题、合法多问题顺序、unknown directedTo、空文本、重复 ID、blocking true、数组部分非法零结果、事件顺序。

验证：

```bash
pnpm --dir plugin vitest run tests/unit/domain/transitions.spec.ts
pnpm --dir plugin typecheck
```

PASS：两个命令退出码均为 0，失败测试确认输入 state 未被原地修改。
STOP：必须修改 repository 才能保持原子性；现有 transition 在 `execute()` closure 内运行，禁止新增 repository API。

### T5：Question resolution

前置状态：T4 PASS，Question 创建 helper 已返回 canonical questions 和事件。
允许修改：`plugin/src/domain/completion.ts`、`plugin/tests/unit/domain/completion.spec.ts`。
禁止修改：CompletionFact schema、repository、Runtime、status、Archive 和其他 completion claim 语义。

执行：

1. 在处理每个 `questionResolutions` 时依次校验：
   1. question 存在；
   2. question.status 必须为 `open`；
   3. answer message 存在于当前 `state.transcript`；
   4. answer.speaker 等于 `context.participantId`；
   5. question.answerMessageId 必须为 `undefined`。
2. 校验成功后同时设置 `question.status = "answered"` 和 `question.answerMessageId = claim.answerMessageId`。
3. 在 `completion_fact.added` 之前追加第 4.3 节 `question.answered` event。不得删除或替代既有 `question_resolution` CompletionFact。
4. 修改 `isObjectiveSatisfied`：删除对所有 open question 关闭的要求，改成只拒绝 `question.blocking && question.status === "open"`。尽管本闭环不能新建 blocking question，该判断仍正确处理正式 fixture/未来已验证来源。
5. 新增以下测试：合法回答、foreign author、unknown message、unknown question、已回答后换答案、answerMessageId 固化、事件顺序、open non-blocking 不阻塞、open blocking 阻塞。

验证：

```bash
pnpm --dir plugin vitest run tests/unit/domain/completion.spec.ts
pnpm --dir plugin typecheck
```

PASS：两个命令退出码均为 0。
STOP：需要改变 CompletionFact schema 或 replace semantics；报告现有冲突，不得创建第二套 resolution fact。

### T6：Runtime 接线与原子性

前置状态：T5 PASS，domain 创建与回答行为均已通过 focused tests。
允许修改：`plugin/src/tools/meeting-runtime.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。
禁止修改：caller binding、request hash、repository API、outbox、MeetingTask、DSH API 和其他 command handler。

执行：

1. 在 `submitTurn` 中、调用 `repository.execute()` 前只计算一次：

```ts
const commandNow = options.now?.() ?? Date.now();
const questions = (input.changes.questions ?? []).map((claim, index) => ({
    id: `question-${input.deliveryId}-${index + 1}`,
    text: claim.text.trim(),
    ...(claim.directedTo === undefined ? {} : { directedTo: claim.directedTo }),
    blocking: claim.blocking,
    createdAt: commandNow
}));
```

2. `message.createdAt` 改为 `commandNow`。
3. 调用 `submitSpeakerAndAdvanceMeeting` 时传入 `questions`。
4. 不改变 `requestId`、`commandKind`、`callerBinding`、`requestHash`、`expectedMeetingVersion`、task evidence 或 outbox 逻辑。
5. `submitTurn` catch 调用 `commandError` 时传入固定 `codeMap`：`{ INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }`。不得修改通用 `commandError`；`UNSUPPORTED_CAPABILITY`、`STALE_ATTEMPT` 和 `IMMUTABLE_MEETING` 继续原样公开。
6. 增加 contract 测试：创建后 read snapshot、status 可见前置事实、相同 delivery 重放不重复、hash conflict、stale attempt、blocking true 零写入、多个问题中一个非法零写入；所有 Question `INVALID_ENTITY_STATE` 场景公开 code 精确为 `INVALID_ARGUMENT` 且 `retryable: false`。

验证：

```bash
pnpm --dir plugin vitest run tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck
```

PASS：两个命令退出码均为 0；所有失败场景的 snapshot version、message count、question count、event count 不变。
STOP：测试必须调用真实 DSH API 才能建立 question；本闭环禁止改变 DSH 边界。

### T7：Status、Repository 恢复与 Archive

前置状态：T6 PASS，正式 submit command 已能原子创建 Question。
允许修改：`plugin/src/projection/status.ts`、`plugin/tests/contract/status-projection.spec.ts`、`plugin/tests/unit/repository.spec.ts`、`plugin/tests/recovery/recovery.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`。
禁止修改：status V1 类型与 Schema、repository production API/schema、Archive production model/schema 和 HTTP/UI。

执行：

1. 修改 `plugin/src/projection/status.ts`：
   - import `PublicQuestionV1`。
   - 增加 `question(value: MeetingState["openQuestions"][number]): PublicQuestionV1` mapper，逐字段显式映射，optional 字段使用条件展开。
   - 在 `discussion` 的 `messages` 后增加 `questions: state.openQuestions.map(question)`。
   - 不把 question 加入 `blockingFacts`；本字段继续只投影既有 issue。
2. 修改 `plugin/tests/contract/status-projection.spec.ts`：覆盖 active、execution terminal、optional 字段不泄漏默认值。
3. 修改 `plugin/tests/unit/repository.spec.ts` 和 `plugin/tests/recovery/recovery.spec.ts`：覆盖 reopen 后完整 question 和 answerMessageId 不丢失；覆盖 transition throw 后无半提交。
4. 修改 `plugin/tests/unit/runtime/archive.spec.ts`：
   - open/deferred question 进入 `unresolvedQuestions`；
   - answered question 不进入 `unresolvedQuestions`；
   - 不修改 `MeetingArchivePackage` 或 `MeetingArchivePackageSchema`。

验证：

```bash
pnpm --dir plugin vitest run tests/contract/status-projection.spec.ts
pnpm --dir plugin vitest run tests/unit/repository.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin vitest run tests/unit/runtime/archive.spec.ts
pnpm --dir plugin typecheck
```

PASS：四个命令退出码均为 0。
STOP：Archive 需要新增字段才能满足现有正式接口；不得自行扩张 Archive schema。

### T8：完整验证与收口

前置状态：T7 PASS，T1-T7 所有 focused validation 均退出码 0。
允许修改：`docs/40-readiness/QUESTION-FACT-CLOSURE-EVIDENCE.md`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`TODO.md` 和本 RUNBOOK。
禁止修改：production code、tests、requirements、interfaces、design 行为和与本 RUNBOOK 无关的 readiness 证据。

执行：

1. 在仓库根目录运行完整验证并保存完整输出：

```bash
pnpm --dir plugin verify
```

PASS：命令退出码为 0。
STOP：命令失败时保留 RUNBOOK 和全部 TODO，记录首个失败、完整命令和实际输出，不得开始收口。

2. 新建 `docs/40-readiness/QUESTION-FACT-CLOSURE-EVIDENCE.md`，记录分支、最终 commit（未 commit 时写 `working tree`）、Node/pnpm/DSH 版本、T0-T8 的实际命令和结果、未覆盖的 blocking question evidence；不得写入本 RUNBOOK 的文件名或标题。
3. 更新 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`：只把 non-blocking Question create/read/resolve/archive 标为已覆盖；blocking Question 保持未覆盖；不得写入本 RUNBOOK 的文件名或标题。

验证：删除前执行文档、引用和格式门：

```bash
rg -nF '](' docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md
test -f docs/00-governance/ARCHITECTURE.md
test -f docs/00-governance/RUNBOOK-RULES.md
test -f docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md
test -f docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md
test -f docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md
test -f docs/30-designs/DOMAIN-MODEL-DESIGN.md
test -f docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
test -f .agents/skills/dsh-plugin-development/SKILL.md
test -f docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
rg -l 'RUNBOOK-QUESTION-FACT-CLOSURE|正式问题 Question 事实闭环' . | sort
git diff --check
```

PASS：前十个链接/目标检查与 `git diff --check` 均退出码为 0；引用列表的唯一输出精确为 `./TODO.md` 和 `./docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md`。出现其他引用路径时 STOP，由作者先固定该路径的删除方式。
STOP：任一命令失败或引用列表不精确匹配时，保留 RUNBOOK 与本组 TODO，报告命令和实际输出，不得进入删除阶段。

执行：删除阶段。

4. 执行以下精确备份：

```bash
test ! -e /tmp/convivium-question-fact-closure.runbook.backup
test ! -e /tmp/convivium-question-fact-closure.todo.backup
cp docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md /tmp/convivium-question-fact-closure.runbook.backup
cp TODO.md /tmp/convivium-question-fact-closure.todo.backup
```

任一 `test` 失败时 STOP：保留现状并报告已存在的备份路径，不得覆盖可能用于恢复的文件。

5. 从 `TODO.md` 删除 `Question Fact Closure / T0` 到 `Question Fact Closure / T8` 的完整九项，保留三个固定 section 标题；随后删除 `docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md`。不得删除或改写其他 TODO。

验证：删除后执行：

```bash
! rg -n "RUNBOOK-QUESTION-FACT-CLOSURE|正式问题 Question 事实闭环" .
test -f docs/40-readiness/QUESTION-FACT-CLOSURE-EVIDENCE.md
test -f docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
rg -nF '## 当前任务项' TODO.md
rg -nF '## 待审阅任务项' TODO.md
rg -nF '## 待讨论项' TODO.md
git diff --check
```

若删除后任一检查失败，执行以下恢复并 STOP：

```bash
cp /tmp/convivium-question-fact-closure.runbook.backup docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md
cp /tmp/convivium-question-fact-closure.todo.backup TODO.md
git diff --check
```

恢复后不得把删除状态报告为完成。

6. 全部检查通过后删除两个固定备份文件：

```bash
rm -f /tmp/convivium-question-fact-closure.runbook.backup /tmp/convivium-question-fact-closure.todo.backup
```

最终 PASS：`pnpm --dir plugin verify`、链接检查、删除前后 `git diff --check` 均通过；RUNBOOK 与本组九项 TODO 已删除；readiness 没有把 blocking question 误报为完成。
STOP：任一验证、链接、引用或恢复检查失败；保留或恢复 RUNBOOK 与本组 TODO，记录首个失败和复现命令，不得宣告完成。

## 7. 验证矩阵

| 场景 | 预期结果 |
| --- | --- |
| 合法 non-blocking question | 同事务写 message、question、`question.added`、version 和 receipt；status 可见 |
| 任意 `blocking: true` question | `UNSUPPORTED_CAPABILITY`，整个 turn 零副作用 |
| 未知或跨 Meeting `directedTo` | 拒绝，零副作用 |
| 空白 question text | protocol/domain 拒绝，零副作用 |
| 一次提交多个问题，其中一个非法 | message 和全部 questions 都不写入 |
| 相同 submit request 重放 | 返回原 receipt，question/event/version 不重复 |
| 相同 request ID、不同 hash | `IDEMPOTENCY_CONFLICT`，状态不变 |
| stale meeting version | `VERSION_CONFLICT`，状态不变 |
| 无效或过期 SpeakerAttempt | `STALE_ATTEMPT`，零副作用 |
| caller 不是当前 Meeting 的授权 speaker | `UNAUTHORIZED_CALLER`，零副作用 |
| open non-blocking question | 不阻止 objective completion；status 和 Archive 仍保留问题 |
| 既有正式 fixture 中的 open blocking question | 阻止 objective completion；本闭环不能通过 command 新建该 fixture |
| caller 用自己正式消息回答 open question | question 变为 `answered`，设置 `answerMessageId`，产生两个审计事件 |
| caller 引用他人或跨 Meeting answer message | resolution 拒绝，question 保持 open |
| 已 answered question 绑定另一 answer | 拒绝覆盖，历史关联不变 |
| resolution 事务中途失败 | question、completion fact、event、receipt 全部回滚 |
| 进程重启后读取 | question 状态、answer link、event 与 status 一致 |
| execution terminal 后新增/回答 question | `IMMUTABLE_MEETING`，零副作用 |
| Archive open/deferred question | 出现在既有 unresolved questions |
| Archive answered question | 不在 unresolved questions；transcript 与 completion fact 可追溯答案 |

## 8. 预期验证命令

以下命令清单固定，不得用较小命令替代最终完整验证：

```bash
pnpm --dir plugin verify:environment
pnpm --dir plugin verify:contract
pnpm --dir plugin vitest run tests/contract/protocol-schema.spec.ts
pnpm --dir plugin vitest run tests/unit/domain/transitions.spec.ts tests/unit/domain/completion.spec.ts
pnpm --dir plugin vitest run tests/contract/meeting-runtime.spec.ts tests/contract/status-projection.spec.ts
pnpm --dir plugin vitest run tests/unit/repository.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin vitest run tests/unit/runtime/archive.spec.ts
pnpm --dir plugin verify
```

本闭环不得修改 DSH host API、profile composition、Session 生命周期或真实 DSH 调用路径，也不得新增 DSH smoke。任何 production diff 新增 `@deepseek-ai/*` import、修改 profile/bundle 文件或改变 Session 调用时，立即执行 STOP 并报告 diff；不得继续本 RUNBOOK。

## 9. 失败处理与恢复

- claim 校验失败：返回正式协议错误，确认无 message、question、event、receipt 或 version 变化。
- repository transaction 失败：依赖 SQLite rollback；重开数据库核对 snapshot、events、receipts 和 outbox 均无半提交。
- status Schema 与 mapper 不一致：不得用类型断言绕过，回到 T1 同步接口、Schema 和 producer。
- 发现需要 schema migration、新 table、通用 outbox 或 DSH 生命周期改动：停止本闭环并报告新增范围，不在当前分支顺带实现。
- 发现非 T3 明确列出的 fixture 或 production 持久化数据缺少新增 canonical 字段：立即 STOP，报告读取路径、数据来源和最小复现；不得建立兼容层或扩大 fixture 修改范围。
- full verify 失败：立即 STOP，记录首个失败、完整命令和实际输出；不得修改 Non-goals、不得创建完成 evidence、不得将未通过项标为已完成。

## 10. 完成定义

只有同时满足以下条件，本闭环才算完成：

- 第 3.1 节全部能力通过正式入口可执行，没有 mock fallback 或手工改库步骤。
- 第 5 节不变量均有实现约束和对应自动化测试。
- 第 7 节验证矩阵全部通过，或正式文档明确删除了不再需要的行为。
- `pnpm --dir plugin verify` 通过，恢复读取和事务回滚有证据。
- requirements、interfaces、design 与实现一致，readiness 记录 commit、环境、命令和未覆盖边界。
- 未实现的其他 `changes` 类别仍明确处于未覆盖状态，没有被本闭环误报为完成。
- 本 RUNBOOK 的长期结论已迁移，文件及残留引用已删除。
