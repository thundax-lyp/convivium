# RUNBOOK：Manager Plan 到 Turn 闭环

状态：待执行

## 1. 目标

在现有 DSH Runtime 竖切之上，实现第一条持久化、可审计的 Manager 会议运行链路：

```text
Meeting created
  → Manager planning attempt created
  → Manager Session receives a committed planning delivery
  → Manager submits one validated plan
  → first SpeakerAttempt is committed and dispatched
  → one Speaker submits a formal message
  → next SpeakerAttempt is committed and dispatched
  → all planned SpeakerStep finish
  → deterministic completion judgment
       ├─ objective satisfied → completed
       ├─ hard limit reached  → partial
       └─ otherwise            → create next Manager planning attempt
```

本 RUNBOOK 是实现执行边界，不改变产品需求、Agent 会议协议或 DSH API。Manager 只提交结构化发言计划；Participant 只提交正式会议发言；会议完成状态只由 Runtime 基于已提交事实和确定性规则计算。

## 2. 完成边界

### 2.1 本次必须完成

- `selectionMode = "manager"` 的会议创建后不再直接初始化 Speaker Turn，必须先进入 Manager planning；现有省略值/`round_robin` 路径保持不变。
- 本次新增接受 `selectionMode = "manager"`；`rule_based`、`hybrid` 仍 fail closed。
- 每次规划拥有一个持久化的 `ManagerPlanningAttempt`。
- Manager 通过独立的 meeting-owned continuable Session 接收 planning context。
- Manager 通过结构化 `convivium_submit_manager_plan` 提交计划。
- Manager plan 提交必须校验会议、Manager Session、`planningAttemptId`、`observedMeetingVersion`、active agenda、Participant 资格、顺序和人数限制。
- 合法 plan 提交与第一位 `SpeakerAttempt` 的创建必须在一个 SQLite command transaction 中完成。
- 同一 Turn 内只能按 `SpeakerStep[]` 顺序逐个 dispatch；下一步只能在前一步正式消息提交后产生。
- 第二位 Speaker 的 context 必须读取 SQLite 中已提交的前序 transcript。
- Turn 完成后必须执行一次确定性完成判断。
- 业务目标满足时进入 `completed`；继续条件仍满足时创建下一次 Manager planning；硬限制阻止继续时进入 `partial`。
- 每个 Manager delivery、Speaker delivery、plan submission 和 turn submission 都有可重试且幂等的 outbox/receipt 边界。
- Manager plan、Speaker dispatch、Turn completion、completion judgment 和 next-plan scheduling 具有领域事件和测试覆盖。
- 更新离线验证、Runtime integration、recovery 和 profile smoke 证据。

### 2.2 本次不完成

- `rule_based`、`hybrid` 的自动语义选人；本次必须支持 Manager 提交经过约束校验的自定义有序 `steps`，包括非 `round_robin` 顺序，但不由 Runtime 自动推导该顺序。
- `round_robin` 的选人、排序、首 Turn 初始化和 fallback 行为；继续使用现有 `planRoundRobinTurn()` 路径。
- Speaker timeout 的自动推进、failure counter、Participant unavailable 和 interrupt 策略；本次只保证活动 attempt 的迟到/撤销提交 fail closed。
- Host restart 后重新取得 live Captain parent 并自动续投；本次只验证 SQLite/outbox 恢复不重复会议事实。
- TeamTask、HandRaise、meeting-scoped mail。
- proposal、position、decision、risk disposition 和完整 completion claims 的写入与授权处理。
- archive、continuation、HTTP route 和 Client UI。
- 多 Manager、并行 Turn、并行 Speaker delivery 或 token 级实时对话。
- 通过 DSH-owned Session Event 保存 Convivium 自定义领域事件。

不在本次范围内的结构化 claims 必须继续 fail closed，不能因为加入 Manager plan 而被当作已实现。

## 3. 规范真相源与相关文件

### 3.1 规范文档

- `docs/00-governance/ARCHITECTURE.md`：Host/Client/Runtime/DSH Session 边界、Session 隔离和 SQLite 所有权。
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`：FR-3、FR-4、FR-8、FR-9、FR-11 及 Acceptance Criteria 1、2、3、8、11、12、13、20。
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`：Manager context、`ManagerPlanSubmissionV1`、Turn submission、caller binding、错误和幂等语义。
- `docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`：`execute()`、receipt、event、outbox、lease 和 recovery 契约。
- `docs/30-designs/DOMAIN-MODEL-DESIGN.md`：`MeetingState`、`MeetingTurn`、`SpeakerAttempt`、`ManagerPlanningAttempt` 和状态字段。
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`：Manager planning、Turn runner、outbox 和完成判断设计。
- `docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md`：增量实现的范围控制、禁止顺带引入的机制和验证分层。
- `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`：模块职责和依赖方向。
- `docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`：已验证的 provider、Session adapter、profile smoke 和现有竖切边界。
- `.agents/skills/dsh-plugin-development/references/host-api.md`：当前 DSH Host、Tool、Session 和生命周期边界。
- `.agents/skills/dsh-plugin-development/references/testing-verification.md`：静态、组合、运行时验证要求。

### 3.2 现有代码入口

| 文件                                                       | 当前职责                                                        | 本 RUNBOOK 的精确变化                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `plugin/src/index.ts`                                      | Host 组装、tool registration、disposer                          | 组装 Runtime disposer；确保 outbox worker 停止后再关闭 repository                                |
| `plugin/src/config.ts`                                     | provider、dataRoot、参与人数和运行时限制                        | 不改配置；复用现有 `outboxPollMs`                                                                |
| `plugin/src/domain/create.ts`                              | 创建输入校验、canonical 初始状态和 selection mode               | 接受省略值/`round_robin`/`manager`；保留 `rule_based`、`hybrid` fail-closed；原样保存选定 mode   |
| `plugin/src/domain/model.ts`                               | Canonical `MeetingState`、Turn、Step、Attempt、Manager attempt  | 只在确有新状态字段时扩展；优先复用现有字段                                                       |
| `plugin/src/domain/planning.ts`                            | round-robin plan 生成                                           | 保持现有 round-robin 行为；只增加独立的 Manager plan 结构校验/转换入口，不能写状态               |
| `plugin/src/domain/transitions.ts`                         | 唯一领域状态转换                                                | 增加 Manager plan commit、Turn finish、completion judgment 所需纯转换                            |
| `plugin/src/domain/completion.ts`                          | 当前不存在                                                      | 新增确定性完成判断；不得调用 DSH、SQLite 或自然语言模型                                          |
| `plugin/src/runtime/meeting-runtime.ts`                    | 创建、状态、Speaker submit、pause/resume                        | 仅对 `manager` mode 启动 planning；新增 plan submit、逐发言推进和 next-plan                      |
| `plugin/src/runtime/turn-runner.ts`                        | 串行 Speaker runner 抽象                                        | 复用并补齐 Turn 完成和逐步 context；不得并发 dispatch                                            |
| `plugin/src/runtime/outbox-worker.ts`                      | claim、dispatch、retry、complete outbox                         | 支持两类 delivery；只重试 DSH 接受前的 retryable failure                                         |
| `plugin/src/dsh/session-adapter.ts`                        | Manager/Participant 创建、Participant followup、interrupt/drain | 增加受授权的 Manager followup；复用 exact parent、ownership 和 capability 校验                   |
| `plugin/src/dsh/index.ts`                                  | DSH adapter exports                                             | 导出 Manager followup 类型和函数                                                                 |
| `plugin/src/tools/register-tools.ts`                       | 注册 create/status/submit/pause/resume                          | 注册 `convivium_submit_manager_plan`，调用者必须是 meeting Manager                               |
| `plugin/src/tools/meeting-runtime.ts`                      | Tool-facing Runtime interface 和 command mapping                | 增加 `submitManagerPlan()`；保留 claims fail-closed                                              |
| `plugin/src/protocol/types.ts`                             | Shared protocol types                                           | 复用现有 `ManagerPlanSubmissionV1`；仅补充缺少的 result/command 类型，不造同义类型               |
| `plugin/src/protocol/commands.ts`                          | Schemastery input schemas                                       | 复用并补齐 `ManagerPlanSubmissionSchema` 的字段约束                                              |
| `plugin/src/protocol/results.ts`                           | Result schemas                                                  | 校验 `ManagerPlanResultSchema` 与 Turn result 对应字段                                           |
| `plugin/src/protocol/status.ts`                            | Status projection schema                                        | 保持现有 `status`、`currentTurn`、`currentSpeakerId` schema；不新增 planning attempt 字段        |
| `plugin/src/projection/status.ts`                          | Caller-specific status projection                               | planning 期间投影 `status = "running"` 且不设置 current Turn/Speaker；保留 wait/termination 投影 |
| `plugin/src/repository/index.ts`                           | SQLite snapshot、command、receipt、event、outbox、ownership     | 保持 `execute()` 原子性；扩展 outbox payload 类型和 recovery 读取，不增加第二写入口              |
| `plugin/src/repository/schema.ts` / `migrations.ts`        | SQLite schema/migrations                                        | 仅在新增持久化列确有必要时修改；优先 state JSON、events、receipt、outbox 现有结构                |
| `plugin/tests/unit/domain/create.spec.ts`                  | 创建和 canonical 初始状态                                       | 覆盖 `round_robin`/`manager` 接受、默认值及其余 mode 在副作用前拒绝                              |
| `plugin/tests/unit/domain/planning.spec.ts`                | 当前缺失或需补齐                                                | 覆盖 plan 合法性、Participant 资格、顺序、人数和重复身份                                         |
| `plugin/tests/unit/domain/transitions.spec.ts`             | 领域转换测试                                                    | 覆盖 plan commit、Turn complete、completed/partial/next planning 分支                            |
| `plugin/tests/unit/domain/completion.spec.ts`              | 当前缺失                                                        | 覆盖完成事实、硬限制、优先级和不满足条件                                                         |
| `plugin/tests/unit/runtime/turn-runner.spec.ts`            | Turn 串行 runner                                                | 覆盖 Manager plan 后逐步 dispatch 和 committed prefix                                            |
| `plugin/tests/unit/runtime/meeting-runtime.spec.ts`        | Runtime 单测                                                    | 覆盖 Manager caller、plan submission、下一 Turn 和 terminal judgment                             |
| `plugin/tests/unit/runtime/outbox-worker.spec.ts`          | outbox lease/retry 单测                                         | 覆盖 pre-accept retry、post-accept 不重投和 retry exhaustion                                     |
| `plugin/tests/contract/tool-registration.spec.ts`          | Tool 注册契约                                                   | 覆盖 Manager tool 的 schema、名称、caller 和 fail-closed                                         |
| `plugin/tests/contract/protocol-schema.spec.ts`            | 协议 schema 契约                                                | 覆盖 Manager plan input/result/error                                                             |
| `plugin/tests/integration/runtime/vertical-slice.spec.ts`  | Runtime 组合测试                                                | 覆盖 plan → A → C → B → next plan/terminal                                                       |
| `plugin/tests/integration/dsh/session-adapter.spec.ts`     | DSH adapter 测试                                                | 覆盖 Manager followup 的 exact parent、ownership、capability 和 post-acceptance recheck          |
| `plugin/tests/recovery/recovery.spec.ts`                   | 恢复测试                                                        | 覆盖 planning/speaker outbox、receipt 和 lease reclaim；不覆盖 live parent 自动续投              |
| `plugin/scripts/smoke-profile.mjs`                         | 独立 DSH profile smoke                                          | 一个 `manager` Meeting 验证 A/C/B 顺序、committed prefix 和 next-plan                            |
| `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` | 竖切运行证据                                                    | 更新已覆盖矩阵；保留未覆盖项，不描述为完整产品                                                   |

文件拆分可以发生，但职责和唯一写入口不得改变。

## 4. Canonical 数据结构

以下类型必须直接复用 `plugin/src/domain/model.ts` 和 `plugin/src/protocol/types.ts`。实现不得另造同义的 Runtime transport 类型。

### 4.1 Manager planning attempt

```ts
interface ManagerPlanningAttempt {
  id: string;
  meetingId: string;
  observedMeetingVersion: number;
  reason:
    | "initial_plan"
    | "next_turn"
    | "semantic_arbitration"
    | "refocus"
    | "stall"
    | "replan"
    | "termination_review";
  deliveryId: string;
  status: "pending" | "running" | "submitted" | "revoked" | "failed";
  createdAt: number;
  deadlineAt?: number;
}
```

规则：

- `id`、`meetingId`、`deliveryId`、`observedMeetingVersion` 创建后不可变。
- 一个 Meeting 同时最多存在一个 `manager.currentPlanningAttempt`；本 RUNBOOK 创建时直接使用 `status = "running"`，不使用 `pending` 中间态。
- `observedMeetingVersion` 是创建 planning attempt 的 repository transaction 提交后版本；它必须等于该 transaction 返回的 `CommittedResult.meetingVersion`、Manager context 的 `meetingVersion` 和 plan submit 时的当前 `MeetingState.version`。
- plan 提交成功后 `status = "submitted"`，随后 `manager.currentPlanningAttempt = undefined`，`manager.status = "idle"`。
- pause、terminal transition 或失效重试必须将活动 planning attempt 置为 `revoked`，不能继续接受提交。

### 4.2 Manager plan input

```ts
interface ManagerPlanSubmissionV1 {
  protocolVersion: 1;
  meetingId: string;
  planningAttemptId: string;
  observedMeetingVersion: number;
  requestId: string;
  agendaItemId: string;
  intent: string;
  objective: string;
  expectedOutputs: readonly string[];
  prohibitedTopics: readonly string[];
  steps: readonly {
    participantId: string;
    instruction: string;
    reason: string;
  }[];
}
```

`steps` 中每个对象的字段名必须保持 `participantId`、`instruction`、`reason`。`reason` 传输为 string，进入领域模型时只能转换为 `SpeakerSelectionReason` 的已知值；未知值拒绝，不得默认为 `round_robin_fallback`。

### 4.3 Manager context

Manager followup 的公开 payload 至少包含：

```ts
interface ManagerMeetingContextV1 {
  protocolVersion: 1;
  meetingId: string;
  meetingVersion: number;
  planningAttemptId: string;
  objective: string;
  activeAgendaItem: PublicAgendaItemV1;
  requiredSpeakerIds: readonly string[];
  dispatchableParticipantIds: readonly string[];
  recentPublicMessages: readonly PublicMeetingMessageV1[];
  blockingFacts: readonly PublicBlockingFactV1[];
  pendingHandRaises: readonly PublicHandRaiseV1[];
  continuationMaterials: readonly PublicContinuationMaterialV1[];
  limits: PublicMeetingLimitsV1;
  planningReason: string;
}
```

本次未实现的 `pendingHandRaises`、TeamTask 和 completion claim 来源必须为空集合，而不是伪造数据。`recentPublicMessages` 只能来自已提交 SQLite transcript；Manager 不收到隐藏推理、Session 历史或私有工具过程。

### 4.4 Turn and speaker attempt

```ts
interface MeetingTurn {
  id: string;
  seq: number;
  agendaItemId: string;
  intent: TurnIntent;
  objective: string;
  expectedOutputs: string[];
  prohibitedTopics: string[];
  plan: readonly string[];
  status:
    "planned" | "running" | "completed" | "truncated" | "cancelled" | "failed";
  currentStepIndex: number;
  steps: SpeakerStep[];
  createdAt: number;
  completedAt?: number;
}

interface SpeakerAttempt {
  attemptId: string;
  participantId: string;
  meetingId: string;
  turnId: string;
  stepId: string;
  deliveryId: string;
  contextFromSeq: number;
  contextThroughSeq: number;
  taskSnapshots: MeetingTaskSnapshot[];
  assignedAt: number;
  startedAt?: number;
  completedAt?: number;
  deadlineAt?: number;
  status: "assigned" | "running" | "submitted" | "revoked" | "failed";
  deliveryStatus: "pending" | "accepted" | "acknowledged" | "failed";
}
```

关键不变量：

- `currentTurn.currentStepIndex` 指向唯一有效 SpeakerStep；不能同时存在两个 `running` attempt。
- `SpeakerAttempt.contextThroughSeq` 在 DSH followup 前固定，不能在返回后追加消息。
- `contextFromSeq`/`contextThroughSeq` 只描述正式 transcript，不包括 Manager plan、hand raise、mail 或 DSH tool event。
- `deliveryId` 是 outbox 和 followup 的幂等边界；重试必须复用原值。
- 迟到、撤销、过期或错误 caller 的提交不得写入 `MeetingState.transcript`。

### 4.5 Outbox payload

继续复用 `plugin/src/repository/index.ts` 的 `OutboxInput`，`kind` 保持为现有值 `"dispatch"`，通过 payload discriminant 区分目标：

```ts
type MeetingDispatchPayload =
  | {
      role: "manager";
      meetingId: string;
      planningAttemptId: string;
      deliveryId: string;
    }
  | {
      role: "participant";
      meetingId: string;
      turnId: string;
      stepId: string;
      attemptId: string;
      participantId: string;
      deliveryId: string;
    };
```

若实现需要改变 `OutboxKind`，必须同时更新 repository interface、migration、worker、所有 lease/retry 测试和 readiness 证据；不得在 Runtime 内另建内存队列。

`OutboxInput.deliveryId` 必须严格等于 `MeetingDispatchPayload.deliveryId`。worker claim 后先校验二者相等及 payload discriminant 完整；不一致时将该 outbox 标记为 failed diagnostic，不调用 DSH。

### 4.6 Completion judgment

新增 `plugin/src/domain/completion.ts`，提供纯函数：

```ts
type CompletionJudgment =
  | {
      kind: "completed";
      code: "objective_satisfied";
      reason: string;
    }
  | {
      kind: "partial";
      code: "max_turns" | "message_limit" | "time_limit";
      reason: string;
    }
  | {
      kind: "continue";
      reason: string;
    };

function judgeTurnCompletion(
  state: MeetingState,
  now: number,
): CompletionJudgment;
```

判定顺序固定：

1. 以下条件全部成立时返回 `completed/objective_satisfied`：
   - `requiredOutputs.every(output.status === "accepted")`；
   - `acceptanceCriteria.every(criterion.satisfied === true)`；
   - `requiredReviewers` 中每个 ID 都有 `status = "active"`、`result = "approved"` 且 `reviewerId` 相同的 `CompletionFact`；
   - `agenda.every(status === "resolved" || status === "deferred")`；
   - 每个 blocking issue 的 `status` 为 `resolved`、`deferred`、`accepted_risk` 或 `out_of_scope`；
   - 每个 open question 的 `status` 为 `answered`、`withdrawn` 或 `deferred`。
2. `state.turnSeq >= state.limits.maxTurns`，返回 `partial/max_turns`。
3. `state.messageSeq >= state.limits.maxTotalMessages`，返回 `partial/message_limit`。
4. `maxDurationMs` 存在且 `now - state.createdAt >= maxDurationMs`，返回 `partial/time_limit`。
5. 其他情况返回 `continue`。

`judgeTurnCompletion()` 与 `transitionMeeting(..., "completed", ...)` 必须调用同一个 `isCompletionReady(state)` 纯函数，禁止复制两套完成谓词。业务完成优先于硬限制。当前正式 claims 尚未接入，因此真实 smoke 不要求自然达到 `completed`；单测必须构造满足上述全部条件的 state，锁定完成优先级。

## 5. 接口与调用边界

### 5.1 DSH Manager followup adapter

在 `plugin/src/dsh/session-adapter.ts` 新增：

```ts
interface ManagerFollowupAttempt {
  readonly deliveryId: string;
  readonly planningAttemptId: string;
}

interface FollowupManagerSessionInput {
  readonly runtime: ContinuableFollowupRuntime;
  readonly parent: Agent;
  readonly ownership: MeetingOwnershipRecord;
  readonly attempt: ManagerFollowupAttempt;
  readonly prompt: ContinuableStartSpec["request"]["prompt"];
  readonly signal: AbortSignal;
  readonly authorize: (input: {
    ownership: MeetingOwnershipRecord;
    attempt: ManagerFollowupAttempt;
    signal: AbortSignal;
  }) => Promise<void>;
}

function followupManagerSession(
  input: FollowupManagerSessionInput,
): Promise<ContinuableStart["messageId"]>;
```

实现必须与 `followupParticipantSession()` 对齐：

- `parent.id === ownership.parentSessionId`；
- `ownership.role === "manager"`；
- `ownership.participantId` 不存在；
- `lifecycleStatus === "active"` 且 `capabilityStatus === "active"`；
- DSH followup 前后各调用一次 `authorize`；
- adapter 必须让 worker 区分“DSH 尚未接受的 retryable provider/transport failure”和“确定性授权失败或 DSH 已接受后的失败”；具体使用内部 result 或 error metadata，不新增公开 transport 类型；
- `source.kind = "coordinator"`、`source.form = "relay"`、`senderSessionId = parent.id`；
- 不直接调用 DSH 私有 API，不把 DSH 返回 message 当作会议事实。

### 5.2 Runtime tool interface

在 `plugin/src/tools/register-tools.ts` 的 `MeetingToolRuntime` 新增：

```ts
submitManagerPlan(
  input: ManagerPlanSubmissionV1,
  caller: MeetingToolCaller,
  signal: AbortSignal
): Promise<ProtocolSuccessV1<ManagerPlanResultV1> | ProtocolErrorV1>;
```

`submitManagerPlan()` 只接受：

- `caller.kind === "manager"`；
- `caller.meetingId === input.meetingId`；
- `caller.sessionId` 与该 Meeting 的 Manager ownership 一致；
- `caller.participantId` 不存在。

在 `register-tools.ts` 注册：

```text
convivium_submit_manager_plan
```

parameters 继续采用现有 `{ input: { type: "json", required: true } }` 形态，使用 `ManagerPlanSubmissionSchema` 校验，输出使用 `ManagerPlanResultSchema` 和现有 `renderOutcome`。Tool input 不允许携带 caller identity、Session ID、capability 或任意文件路径。

### 5.3 Repository command

所有以下操作必须使用 `MeetingRepository.execute()`，不得在 Runtime 直接修改 snapshot：

```ts
type CommandKind = "start_manager_plan" | "submit_manager_plan" | "submit_turn";
```

`RepositoryCommand` 必须携带：

```ts
{
  requestId: string;
  commandKind: string;
  authorization: {
    callerBinding: string;
    capabilityId: string;
    attemptId?: string;
  };
  requestHash: string;
  expectedMeetingVersion: number;
  transition(snapshot): {
    state: JsonObject;
    result: unknown;
    events: DomainEventInput[];
    outbox: OutboxInput[];
  };
}
```

plan submit 的 `requestId` 为 `ManagerPlanSubmissionV1.requestId`，`requestHash` 覆盖完整 input，`expectedMeetingVersion` 使用 `observedMeetingVersion`。相同 `requestId + commandKind + callerBinding + requestHash` 返回原 receipt；同一幂等键不同 hash 返回 `IDEMPOTENCY_CONFLICT`。

最后一个 Speaker submit、Turn complete、completion judgment 和 next planning/termination 必须由同一个 `submit_turn` command transaction 提交，不再创建 `complete_turn` 第二写入口。首次和后续 planning 都使用 `start_manager_plan`；`ManagerPlanningAttempt.reason` 区分 `initial_plan` 与 `next_turn`。

### 5.4 Worker lifecycle

`createCreateStatusRuntime()` 返回的 Runtime 增加：

```ts
dispose(): Promise<void>;
```

每个 `StoredMeeting` 持有：

```ts
interface StoredMeeting {
  teamId: string;
  captainSessionId: string;
  repository: MeetingRepositoryRuntime;
  parent?: Agent;
  worker?: ReturnType<typeof createOutboxWorker>;
  workerTask?: Promise<void>;
}
```

规则：

- 新建 `manager` Meeting 并持有 create caller 的 exact Captain parent 时，最多启动一个 worker。
- cold recovery 恢复 snapshot、receipt、ownership 和 pending outbox，但本 RUNBOOK 不重新取得 live parent 或自动续投；没有本次 create 路径持有的 live parent 时不启动 worker。
- worker 的 dispatch callback 根据 `MeetingDispatchPayload.role` 调用 Manager 或 Participant adapter。
- `plugin/src/index.ts` 将 `runtime.dispose()` 加入 `PluginDisposerRegistry`。
- `dispose()` 先调用 `worker.stop()`，等待全部 `workerTask` settle，再关闭 repository；卸载后不得继续 claim outbox 或写状态。
- 每次产生新 outbox 后显式 wake worker；轮询只负责 recovery 和 missed wakeup。

## 6. 状态与执行流程

### 6.1 创建后启动 planning

修改 `plugin/src/tools/meeting-runtime.ts` 的创建路径：

1. 保留现有 `createMeetingRuntime()`：先写 bootstrap，再创建 Manager/Participant Session 并写 ownership。
2. 创建校验和 canonical state 固定为：
   - 省略 `selectionMode` 或显式 `round_robin` 时保持现有校验、state 和 `initializeFirstTurn()` 路径，本 RUNBOOK 不改变其行为；
   - `manager` 可以创建并原样保存到 `state.selectionMode`；
   - `rule_based`、`hybrid` 在任何 bootstrap、目录、Session 或 outbox 副作用前返回 `UNSUPPORTED_CAPABILITY`；
   - `manager` mode 中每个 agenda 的 required Participant 数量不得超过 `maxSpeakersPerTurn`；否则返回 `INVALID_ARGUMENT`，不产生副作用；
   - `manager` 创建完成后不调用 `initializeFirstTurn()`，首个 Turn 必须经过 Manager planning。
3. `manager` plan 接受通过 required speaker、dispatchability、人数和枚举校验的任意有序 Participant 子集，顺序原样保存；其他 selection mode 不调用 Manager plan submit 路径。
4. 新增 `startManagerPlanning(repository, reason = "initial_plan")`，只用于 `state.selectionMode === "manager"`：
   - 读取当前 `MeetingSnapshot`；
   - 确认 `status` 为 `created` 或 `waiting`，无 `currentTurn`，无活动 `currentPlanningAttempt`；
   - 在 transition 内计算 `planningVersion = snapshot.version + 1`；该值必须等于 repository 本次 command 的 commit version；
   - 生成 `planningAttemptId`、`deliveryId`；
   - 将 `manager.status = "planning"`，写入 `manager.currentPlanningAttempt`，其中 `status = "running"`、`observedMeetingVersion = planningVersion`，会议状态进入 `running`；
   - 写入 `manager_plan.started` 和必要的 `meeting.started`/`meeting.replanned` 事件；
   - 在同一 transaction 写入 Manager dispatch outbox；
   - commit 后由 outbox worker/dispatch helper 投递 Manager context。
5. command 返回后断言 `committed.meetingVersion === currentPlanningAttempt.observedMeetingVersion`；不满足时视为实现错误并停止 delivery。
6. 初始化返回的 `meetingVersion` 必须是 commit 后版本；不得硬编码为 `1`。

### 6.2 Manager dispatch

Manager dispatch 由 `plugin/src/runtime/outbox-worker.ts` 统一处理，payload `role = "manager"` 时：

1. 从 repository 读取最新 state 和 ownership。
2. 用 `ManagerMeetingContextV1` 生成 prompt；`meetingVersion`、`planningAttemptId`、`recentPublicMessages` 必须来自同一次读取。
3. followup 前授权检查：attempt 仍是当前 planning attempt，`status = "running"`，`attempt.observedMeetingVersion = state.version`，Manager capability active，Meeting 未暂停或 terminal。
4. 调用 `followupManagerSession()`，传递原始 `deliveryId`。
5. DSH 接受后再次读取并授权检查；不能把 DSH message ID 写入 transcript。
6. adapter 必须区分失败阶段：
   - DSH 接受前的可重试 provider/transport 失败：outbox 使用原 `deliveryId` retry；
   - 接受前已确定的 stale attempt、wrong parent/ownership 或 revoked capability：outbox 直接 failed diagnostic，不调用 DSH；
   - DSH 已接受后的授权失效：outbox 直接终止，不再次 followup；迟到 plan 由 `STALE_MANAGER_ATTEMPT` 拒绝。内部错误/result 表达由 adapter 实现决定。
7. 成功完成 outbox lease；不在该步骤创建 Turn，Turn 只能由合法 plan submit 创建。

### 6.3 Manager plan submit

`submitManagerPlan()` 的唯一事务流程：

1. caller resolver 先确认真实 DSH Manager Session。
2. Runtime 读取当前 snapshot 和 `manager.currentPlanningAttempt`。
3. 校验：
   - `input.meetingId === snapshot.meetingId`；
   - `input.planningAttemptId` 等于当前 attempt `id`；
   - `input.observedMeetingVersion === snapshot.version`；
   - `attempt.status === "running"`；不接受 `pending` 直接提交；
   - `attempt.observedMeetingVersion === input.observedMeetingVersion === snapshot.version`；
   - `input.agendaItemId === state.activeAgendaItemId`；
   - `steps.length > 0` 且 `steps.length <= state.limits.maxSpeakersPerTurn`；
   - Participant ID 全部属于本 Meeting，不能重复；
   - Participant 当前可调度；唯一 predicate 为 `isParticipantDispatchable(participant, ownership)`：`participant.status === "available"`、ownership `role === "participant"`、`lifecycleStatus === "active"`、`capabilityStatus === "active"`，且 ownership 的 Meeting/Participant ID 精确匹配；
   - `requiredSpeakerIds = activeAgendaItem.requiredParticipants`；每个 required speaker 必须且只能在 `steps` 中出现一次；
   - 先检查 required speaker dispatchability，再检查 plan 完整性：required speaker 不可调度时整体返回 `REQUIRED_SPEAKER_UNAVAILABLE`；required speaker 可调度但未出现在 `steps` 时返回可修正的 `MANAGER_PLAN_INVALID`；两者都不得形成部分 Turn；
   - `intent`、`objective`、每个 `instruction`、每个 `reason` 非空；
   - `steps` 顺序原样保存，不排序、不补人、不替换；
   - 未实现的 claims、hand raise、task 结果不得通过 plan input 注入。
4. 使用 `transitionManagerAttempt(attempt, "submitted", snapshot.version, ...)` 校验 attempt 上下文。
5. 把输入转换成 `MeetingTurn`：
   - `id = turn-${state.turnSeq + 1}`；
   - `seq = state.turnSeq + 1`；
   - `agendaItemId = input.agendaItemId`；
   - `intent` 转换为已知 `TurnIntent`，未知值拒绝；
   - `objective = input.objective`；
   - `expectedOutputs = input.expectedOutputs`；
   - `prohibitedTopics = input.prohibitedTopics`；
   - `plan = input.steps.map(step => step.participantId)`；顺序必须是 Manager 提交的顺序，允许与 `round_robin` 不同；
   - 每个 `SpeakerStep.id = step-${turn.id}-${index}`，`status = "pending"`。
6. 只给 index `0` 的 Step 创建 `SpeakerAttempt`：
   - `attemptId = ${turn.id}-attempt-0`；
   - `deliveryId = ${turn.id}-delivery-0`；
   - `contextFromSeq = 0`；
   - `contextThroughSeq = state.messageSeq`；
   - `status = "running"`；
   - `deliveryStatus = "pending"`；DSH 尚未接受 followup，不得预写 `accepted`；
   - `taskSnapshots = []`。
7. 更新：
   - `manager.currentPlanningAttempt = undefined`；
   - `manager.status = "idle"`；
   - `currentTurn = runningTurn`；
   - `turnSeq = runningTurn.seq`；
   - 第一位 Participant `status = "speaking"`；
   - 其他 Participant 不改变既有状态；
   - `status = "running"`。
8. 同一 transaction 写入：
   - `manager_plan.submitted`；
   - `turn.planned`、`turn.started`；
   - `speaker.assigned`、`speaker.started`、`speaker_attempt.started`；
   - Participant dispatch outbox。
9. 返回 `ManagerPlanResultV1`：

```ts
interface ManagerPlanResultV1 {
  turnId: string;
  firstStepId: string;
  firstAttemptId: string;
}
```

普通 plan 校验失败（包括漏写仍可调度的 required speaker）不创建替代 plan 或新 outbox，Manager 可以在同一 active planning attempt 上使用新 `requestId` 提交修正后的 plan。required speaker 不可调度属于独立失败分支：同一个 `submit_manager_plan` transaction 将 planning attempt 置为 `failed`，`manager.status = "idle"`，Meeting 置为 `waiting`，`waitState.participantIds` 保存不可调度 required speaker IDs，写入 `manager_plan.failed` 和 `meeting.waiting`，不创建 Turn 或 outbox，并返回带 commit 后 `meetingVersion` 的 `REQUIRED_SPEAKER_UNAVAILABLE` receipt。状态未发生后续变化时不得自动创建新 planning attempt。

### 6.4 Speaker dispatch and submit

1. Participant dispatch 从最新 snapshot 读取对应 `SpeakerAttempt` 和 ownership。
2. 构造 `SpeakerContextEnvelope` 时固定：
   - `meetingVersion`；
   - `attemptId`；
   - `deliveryId`；
   - `contextFromSeq`；
   - `contextThroughSeq`；
   - `priorMessages`，只取正式 transcript。
3. followup 前要求 attempt `status = "running"`、`deliveryStatus = "pending"`，并检查 delivery、Session capability、exact parent ownership 和 Meeting 状态；调用 `followupParticipantSession()` 后再次授权检查。
4. Participant adapter 使用与 6.2 相同的行为：只有 DSH 接受前的可重试 provider/transport 失败可以 retry；pre-accept stale 和 post-accept authorization failure 都直接终止，post-accept failure 不得再次 followup；不新增公开错误类型。
5. Participant 使用已有 `convivium_submit_turn` 提交；claims 非空仍返回 `UNSUPPORTED_CAPABILITY`。
6. `submitSpeakerAndAdvanceMeeting()` 成功后：
   - 原子追加一个 `MeetingMessage`；
   - 递增 `messageSeq` 和 event sequence；整个 command 仅在最终状态递增一次 `version`；
   - 当前 delivery 从 `pending` 原子确认到 `acknowledged`，当前 Step/Attempt 变为 `submitted`；不得依赖一个预先伪造的 `accepted` 状态；
   - 先处理本次合法提交，再检查是否还有 pending Step 以及 `maxTotalMessages`/`maxDurationMs` 是否允许继续；
   - 有 pending Step 且未命中限制时，只创建下一 attempt 和一个 participant dispatch outbox；
   - 没有 pending Step 时，Turn 变为 `completed`，进入 6.5；
   - 有 pending Step 但 message/time limit 已命中时，把剩余 Step 置为 `skipped`、当前 Turn 置为 `truncated`，不创建下一 attempt，并进入 6.5；`maxTurns` 只在 Turn 结束后判断，不截断已开始的 Turn。
7. 下一 attempt 的 `contextThroughSeq` 必须等于刚刚 commit 后的 `messageSeq`；不得使用前一 attempt 的旧快照。
8. duplicate request 使用原 receipt 返回；不同 hash、错误 Participant、错误 turn/step/attempt/delivery 或过期 version 返回结构化错误，不写 transcript。

### 6.5 Turn 完成与下一步

Turn 的最后一个合法 Speaker submit，或逐发言 limit 导致的 truncation，必须在唯一的 `submit_turn` repository transaction 内完成 Turn 收口：

1. 将当前 Step/Attempt 置为 `submitted`；limit 路径把未开始 Step 置为 `skipped`。
2. 全部 Step terminal 时设置 `currentTurn.status = "completed"`；因逐发言 limit 提前停止时设置为 `truncated`；两者都设置确定性 `completedAt`。
3. 调用 `judgeTurnCompletion(nextState, now)`，不得读取未提交 DSH 输出或自然语言总结。
4. 若 `kind = "completed"`：
   - 通过外层转换应用与 `transitionMeeting(..., "completed", termination)` 相同的状态校验和 termination 语义，但不调用会再次递增 version 的公开转换；
   - `termination.code = "objective_satisfied"`；
   - `termination.decisionIds`、`unresolvedQuestionIds`、`dissentingPositionIds`、`blockingAgendaItemIds` 取当前已提交事实；
   - `termination.finalMessage` 和 `termination.reason` 必须是确定性 Runtime 文本；
   - 清除 `currentTurn`；
   - 不创建下一 dispatch。
5. 若 `kind = "partial"`：
   - 通过外层转换应用与 `transitionMeeting(..., "partial", termination)` 相同的状态校验和 termination 语义，但不调用会再次递增 version 的公开转换；
   - code 为 `max_turns`、`message_limit` 或 `time_limit`；
   - 保留已提交 Turn/transcript；
   - 不创建下一 dispatch。
6. 若 `kind = "continue"`：
   - 清除 `currentTurn`；
   - 创建 `ManagerPlanningAttempt`，`reason = "next_turn"`、`status = "running"`、`observedMeetingVersion = snapshot.version + 1`；
   - 会议保持 `running`，清除旧 `waitState`，Manager status 为 `planning`；
   - 在同一 transaction 写入 Manager planning outbox。
7. 业务完成判断必须先于 hard limit 判断；最后一个 Turn 同时满足二者时必须为 `completed`。

`submitSpeakerAttempt()` 和 `transitionMeeting()` 当前都会各自递增领域 `version`，不得直接串联后把一次 repository command 变成两次版本增长。实现必须增加一个外层纯转换 `submitSpeakerAndAdvanceMeeting()`，或把两者重构为共享的 version-neutral 内部 helper；整个 `submit_turn` command 的最终 `MeetingState.version` 必须严格等于 `snapshot.version + 1`，所有本次事件 payload 使用同一个 commit version。

## 7. 失败、并发和恢复语义

### 7.1 Plan failure

- Schema 不合法：`INVALID_ARGUMENT`，不产生 state/event/outbox 写入。
- Manager 不属于该 Meeting：`UNAUTHORIZED_CALLER`。
- planning attempt 不存在、已提交、已撤销、已失败或版本过期：`STALE_MANAGER_ATTEMPT`。
- plan 为空、Participant 重复、超过 `maxSpeakersPerTurn`、agenda/intent/reason 不合法：`MANAGER_PLAN_INVALID`，不得 fallback。
- 非 required Participant 不存在或不可调度：`PARTICIPANT_NOT_DISPATCHABLE`。
- required speaker 可调度但未出现在 plan：`MANAGER_PLAN_INVALID`，保持 planning attempt active，允许修正提交。
- required speaker 不可调度：按 6.3 的持久失败分支返回 `REQUIRED_SPEAKER_UNAVAILABLE`，不得产生部分 Turn。
- repository `VERSION_CONFLICT` 在 Manager plan command 边界映射为 `STALE_MANAGER_ATTEMPT`，并返回当前 `meetingVersion`；Manager 必须取得新的 planning context，不能原样重试。
- SQLite busy、provider 或未知基础设施异常映射为 `INTERNAL_ERROR`，`retryable` 由底层错误决定。

### 7.2 Dispatch failure

- DSH followup 在接受前发生可重试 provider/transport 失败：只更新 outbox retry 状态，不写会议事实。
- 接受前的确定性授权失败或 post-acceptance capability 检查失败：outbox 直接 failed diagnostic；不得 retry、写 transcript 或将 plan 标为 submitted。
- 超过 `maxDeliveryRetries`：使用现有 outbox completion 把行置为 `failed`，保留 `deliveryId`、`attempts` 和安全的 `last_error`。worker 没有协议 caller，不返回 `ProtocolErrorV1`；不得递增 Meeting version、写 termination、把 Meeting 改为 `failed`、自动跳过 Speaker 或创建下一 plan。人工恢复和用户级 projection 不在本 RUNBOOK 范围内。
- pause、replan、terminal transition 发生后，旧 delivery 的迟到 submit 必须被 `STALE_ATTEMPT` 拒绝。

### 7.3 Pause/resume

- `manager` Meeting pause 必须在现有 pause 语义上同时撤销活动 Manager planning attempt，取消对应 pending planning outbox；活动 SpeakerAttempt 继续使用现有撤销和 interrupt 规则。pause 不得永久 revoke meeting-owned Session ownership capability。
- `manager` Meeting resume 从 SQLite 最新已提交事实创建新的 `ManagerPlanningAttempt(reason = "next_turn")`；不得恢复 pause 前的 `currentTurn` 或任何旧 attempt，不得复用已 revoked 的 `planningAttemptId`、`attemptId` 或 `deliveryId`。
- 省略值/`round_robin` 的 pause/resume 行为保持现状。

### 7.4 Cold recovery

`rehydrate()` 必须：

- 只加载 bootstrap `ready` 且 snapshot 可读的 Meeting；
- 恢复 `manager.currentPlanningAttempt`、`currentTurn`、Session ownership、receipt 和 pending outbox；
- 回收过期 lease，不重复创建新的 plan/attempt；
- 不从持久 Session ID 重建 live `Agent`，不自动启动 followup；自动续投进入后续恢复任务；
- 发现无法证明 parent、label、meeting 或 identity 所属时不得 followup、interrupt 或 drain；
- 不以 DSH Session 内部历史推断 Meeting 已完成或 Turn 已提交。

## 8. 事件、状态投影和可观察性

必须使用 `plugin/src/domain/model.ts` 的领域事件名，不新增 DSH-owned Session Event。payload 最低字段固定如下：

| Event type                                                                    | 必需 payload 字段                                                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `manager_plan.started`                                                        | `meetingId`、`planningAttemptId`、`deliveryId`、`observedMeetingVersion`、`reason`、`meetingVersion` |
| `manager_plan.submitted`                                                      | `meetingId`、`planningAttemptId`、`turnId`、`meetingVersion`                                         |
| `manager_plan.revoked`                                                        | `meetingId`、`planningAttemptId`、`reason`、`meetingVersion`                                         |
| `manager_plan.failed`                                                         | `meetingId`、`planningAttemptId`、`reason`、`participantIds`、`meetingVersion`                       |
| `turn.planned`                                                                | `meetingId`、`turnId`、`turnSeq`、`agendaItemId`、`participantIds`、`meetingVersion`                 |
| `turn.started`                                                                | `meetingId`、`turnId`、`meetingVersion`                                                              |
| `speaker.assigned`                                                            | `meetingId`、`turnId`、`stepId`、`participantId`、`attemptId`、`deliveryId`、`meetingVersion`        |
| `speaker.started`                                                             | `meetingId`、`turnId`、`stepId`、`participantId`、`attemptId`、`meetingVersion`                      |
| `speaker.submitted`                                                           | `meetingId`、`turnId`、`stepId`、`participantId`、`attemptId`、`messageId`、`meetingVersion`         |
| `speaker_attempt.started`                                                     | `meetingId`、`turnId`、`stepId`、`participantId`、`attemptId`、`deliveryId`、`meetingVersion`        |
| `speaker_attempt.submitted`                                                   | `meetingId`、`turnId`、`stepId`、`participantId`、`attemptId`、`deliveryId`、`meetingVersion`        |
| `turn.completed`                                                              | `meetingId`、`turnId`、`turnSeq`、`messageSeq`、`meetingVersion`                                     |
| `turn.truncated`                                                              | `meetingId`、`turnId`、`turnSeq`、`reason`、`messageSeq`、`meetingVersion`                           |
| `meeting.waiting` / `meeting.started` / `meeting.replanned` / `meeting.ended` | `meetingId`、`from`、`to`、`reason`、`meetingVersion`；`meeting.ended` 另含 `terminationCode`        |

同一 repository command 产生的所有事件使用同一 `meetingVersion`。payload 只保存审计所需 ID、状态和原因，不保存 prompt、完整 Manager context、Session 私有输出或 capability。

`projectMeetingStatus()` 必须：

- 对 Manager/Participant/Captain 仅输出其有权查看的会议事实；
- 输出当前 `status`、`meetingVersion`、`activeAgendaItem`、`messages`、`currentTurn`、`currentSpeakerId`、limits 和 termination；
- 本 RUNBOOK 不扩展 `MeetingStatusResultV1`：Manager planning 时使用现有 `status = "running"`，且省略 `currentTurn`、`currentSpeakerId`；planningAttempt 细节只进入 Manager context 和 SQLite events；
- 不输出 `sessionId`、`parentSessionId`、capability、outbox lease、prompt 或 DSH 私有过程；
- 不把 `ManagerPlanSubmission` 或 DSH tool call 当作正式 transcript。

## 9. 验证矩阵

### 9.1 静态和契约验证

```sh
cd plugin
pnpm verify:environment
pnpm verify:contract
pnpm format:check
pnpm lint
pnpm typecheck
```

必须覆盖：

- Manager tool 注册和 schema；
- `ManagerPlanResultSchema`；
- `UNSUPPORTED_CAPABILITY`、`MANAGER_PLAN_INVALID`、`STALE_MANAGER_ATTEMPT`、`PARTICIPANT_NOT_DISPATCHABLE`、`REQUIRED_SPEAKER_UNAVAILABLE`、`IDEMPOTENCY_CONFLICT`；
- repository `VERSION_CONFLICT` 到协议 `STALE_MANAGER_ATTEMPT` 的边界映射；
- Client bundle 不引入 Host/SQLite/Node 依赖。

### 9.2 单元和集成验证

```sh
cd plugin
pnpm test
pnpm test:integration
pnpm test:recovery
```

最小必测场景：

1. 省略 selection mode 和显式 `round_robin` 保持现有首 Turn 行为；`manager` 可创建且原样保存；`rule_based`、`hybrid` 在 bootstrap 前返回 `UNSUPPORTED_CAPABILITY`。
2. `manager` Meeting 创建后 state 只有一个 active Manager planning attempt，没有 current SpeakerAttempt。
3. `manager` plan `A → C → B` 提交后只生成 A 的 pending delivery，并保持顺序不被 Runtime 重排。
4. 首个 Attempt 在 DSH followup 前为 `deliveryStatus = "pending"`；submit 成功后原子变为 `acknowledged`。
5. A 提交后只生成 C 的 dispatch，C context 含 A 的 `messageId`/`seq`；C 提交后只生成 B 的 dispatch，B context 含 A、C 的 committed prefix。
6. A 提交后若达到 message/time limit，不创建 C；剩余 Step skipped、Turn truncated，并得到 completion 优先的 `completed` 或对应 `partial`。
7. B 最后提交后 Turn 为 `completed`，没有并发 attempt。
8. 未满足 objective contract 且未触达限制时在最终 `running` state 中创建唯一 `next_turn` Manager planning attempt，不写不可观察的 waiting 中间态。
9. 可调度 required speaker 被漏写时返回 `MANAGER_PLAN_INVALID` 且 attempt 可修正；required speaker 不可调度时得到持久化 `REQUIRED_SPEAKER_UNAVAILABLE`，无部分 Turn 且不自动重复规划。
10. planning attempt 的 `observedMeetingVersion` 等于 planning commit version；旧一版和未来版本都返回 `STALE_MANAGER_ATTEMPT`。
11. 已满足 outputs、criteria、required reviews、agenda、blocking issues 和 questions 全部条件时得到 `completed/objective_satisfied`。
12. 同时满足 objective 和 max limit 时得到 `completed`，不是 `partial`。
13. 超过 max turns/messages/duration 时得到对应 `partial`，不创建下一 plan。
14. Manager 伪造 Participant、重复 Participant、未知 intent/reason、旧 attempt 均拒绝且无部分写入。
15. Manager/Participant DSH followup 只在 DSH 接受前的 retryable provider/transport failure 重投；pre-accept stale 和 post-accept authorization failure 均不重投。
16. lease reclaim 不产生第二条 transcript；retry exhausted 只更新现有 outbox failed/last_error，不改变 Meeting status/version/termination。
17. pause 后旧 attempt 不可恢复；resume 创建新 planning/attempt/delivery ID。
18. cold recovery 恢复 snapshot、receipt、ownership 和 pending outbox，不重复会议事实；live parent 自动续投明确 Not Covered。
19. Runtime dispose 停止 worker、等待 worker task、关闭 repository，卸载后不再 claim/write。

### 9.3 真实 DSH profile smoke

```sh
cd plugin
pnpm smoke:profile
pnpm verify:runtime
```

smoke 必须使用临时 DSH home、临时 workspace、临时端口和已确认的：

```text
DSH: 0.1.1-rc.2
provider package: @deepseek-ai/dsh-subagent-spawn-in-process
provider name: spawn
```

临时 profile 内创建一个 `selectionMode = "manager"`、`maxTurns = 2` 的 Meeting。Manager 提交非 `round_robin` 顺序 `A → C → B`；首个 Turn 完成后必须出现唯一 `next_turn` planning attempt。`partial/max_turns` 由 deterministic integration test 覆盖，不在真实 profile 重复整条链路。

当前 claims 不在范围内，因此真实 profile 不伪造 `completed`；`completed/objective_satisfied` 由完整领域 fixture 的自动化测试覆盖。smoke 输出至少验证：

- `dump-config` 同时包含 Convivium、provider plugin 和 `spawn`；
- Captain create 后 Manager plan tool 可调用；
- Manager plan 生成 `turnId`/`firstAttemptId`；
- A/C/B 的真实 Participant Session 依次收到 delivery；
- transcript 顺序为 A、C、B，且 seq 单调递增；
- `next-plan` Meeting 明确进入下一 Manager planning；
- host 正常停止，临时目录只清理本次创建的精确路径。

## 10. 停止条件

遇到以下任一情况，停止扩大实现范围并记录阻塞：

- 当前锁定 DSH 版本没有可验证的 Manager `followup` 所需公开 API；
- `prepareContinuable`、`startContinuable()` 或 `followup()` 只能通过 mock 工作；
- 无法证明 Manager Session 是当前 Meeting 的 exact direct child；
- 无法在 DSH followup 前后执行 capability recheck；
- `ManagerPlanSubmissionSchema` 与 `ManagerPlanSubmissionV1` 无法在不改变正式协议语义的情况下闭合；
- repository 无法在同一 transaction 原子提交 plan、Turn、first attempt、event、receipt 和 outbox；
- 无法区分业务完成与硬限制，或必须依赖自然语言总结才能判断完成；
- 真实 profile smoke 需要访问用户现有 profile、固定 workspace、固定端口或未记录的凭据；
- 需要实现 HTTP/UI、TeamTask、mail、archive 才能完成本 RUNBOOK 的最小链路。

## 11. 完成定义

本 RUNBOOK 只有在以下条件全部满足时才算完成：

- 代码、测试和文档均只在本 RUNBOOK 范围内变化；
- `selectionMode = "manager"` 的创建不再绕过 Manager；省略值/`round_robin` 行为不变；
- Manager plan、Speaker dispatch、Turn completion 和 completion judgment 均经过 SQLite command/outbox 边界；
- 任何时刻最多一个活动 planning attempt 或一个活动 SpeakerAttempt；
- 一个 A/C/B 真实 DSH profile smoke 通过 next-plan，且每个后续 Speaker 读取前序已提交 transcript；
- 完成、partial、next-plan 三条分支有自动化测试；
- stale、duplicate、pause、retry 和持久数据 restart recovery 至少有对应测试；live parent 自动续投明确为 Not Covered；
- `pnpm verify:runtime` 通过；
- readiness 文档记录实际 commit、环境、命令、结果和 Not Covered；
- 未把本 RUNBOOK 的完成描述成完整会议产品。

## 12. 收口规则

- 本 RUNBOOK 执行期间不得自动 commit、push、创建 PR 或合并。
- 若任务产生稳定的模块职责、接口或状态语义，应迁移到对应 `20-interfaces/` 或 `30-designs/` 文档。
- 实现完成后更新 `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`，保留 round-robin 重构、Speaker timeout 自动推进、live parent 自动续投、TeamTask、mail、archive、UI、HTTP 和真实模型质量等未覆盖项。
- 任务若分阶段完成，只收窄剩余范围，不将未完成项标记为完成。
- 全部长期结论和验证证据迁移后，删除本 RUNBOOK 及其残留引用。
