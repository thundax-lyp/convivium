# RUNBOOK：DSH Runtime 可执行竖切

状态：待执行

## 1. 目标

在独立、临时的 DSH profile 中安装并加载 Convivium，使用真实 DSH Host、真实 continuable subagent provider、真实 AgentSession 和真实模型调用，完成一场最小会议的一次串行 Turn。

本 RUNBOOK 的完成结果必须是可在 DSH 中执行的插件能力，不是 mock adapter、空 provider、仅通过 TypeScript 的中间代码或独立 Vite 演示。

目标链路：

```text
DSH profile boot
  -> Convivium plugin load
  -> provider capability check
  -> Captain invokes convivium_create_meeting
  -> create one Manager + three Participant continuable Sessions
  -> accept one capability-free provisioning prompt per Session
  -> invoke one Participant at a time
  -> commit each formal message to SQLite
  -> next Participant receives the committed prefix
  -> read and control status through DSH tools
  -> pause/resume and restart recovery smoke
```

## 2. 完成边界

### 2.1 本次必须完成

- DSH `0.1.1-rc.2` profile 能组合 Convivium。
- Profile 中存在一个真实且具备 `prepareContinuable` 的 provider。
- Host 插件真实加载、卸载和清理。
- Captain 能创建包含一个 Manager 和三个 Participant 的会议。
- 每个会议身份拥有独立的 meeting-owned continuable Session。
- 每个 Session 的 direct parent、provider、首次 message 和 lifecycle ownership 能写入并从 SQLite 恢复。
- Session 创建期只投递无会议 capability 的 provisioning prompt；该输出不形成会议事实。
- 使用 `round_robin` 确定性计划执行一个 Turn。
- 同一 Turn 内严格执行 `request -> submit -> next request`。
- 后一个 Participant 能读取前一个 Participant 已正式提交的 transcript。
- 重复提交和迟到提交被拒绝，不污染正式会议事实。
- Captain 能暂停和恢复会议。
- DSH 进程重启后能重新读取未结束会议的 SQLite 状态。
- `smoke:profile` 使用临时 profile、临时 workspace 和真实安装路径完成上述验证。
- `typecheck`、`test`、`build`、`verify:package` 和 profile smoke 均有可重复命令。

### 2.2 本次明确不完成

- Manager 的语义规划、复杂 replan 和 semantic arbitration。
- `manager`、`hybrid` selection mode；首个可运行路径只使用 `round_robin`。
- TeamTask、HandRaise、meeting-scoped mailbox。
- proposal、position、decision、risk disposition 的完整业务流程。
- completion、stall、consensus、archive 和 continuation。
- 完整会议 UI、Conversation Node、视觉设计和浏览器交互。
- Plugin Frontend 的 HTTP status/pause/resume；DSH `0.1.1-rc.2` 的 WebServer route handler 不提供可直接证明 DSH 当前用户与 Team 权限的 caller context，本竖切不得伪造该授权。
- 多 Meeting 压力测试、完整崩溃矩阵和生产分发方案。
- 任何独立 Convivium Server、Electron 应用或外部参考项目兼容层。

不纳入本次的能力不得以假实现、恒定返回值或隐藏 fallback 方式接入主路径。若接口已经存在但本次不实现，必须在调用时返回明确的 `INTERNAL_ERROR` 或未支持错误，并且不能让会议错误地继续。

## 3. 依据与关联文件

### 3.1 规范真相源

- [架构约束](../00-governance/ARCHITECTURE.md)
- [会议需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Agent 会议协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)
- [实现设计](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [会议编排设计](./MEETING-ORCHESTRATION-DESIGN.md)
- [DSH 插件开发 Skill](../../.agents/skills/dsh-plugin-development/SKILL.md)

### 3.2 现有代码入口

| 文件                                        | 当前职责                  | 本 RUNBOOK 的目标变化                                                 |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `plugin/src/index.ts`                       | Host entry 和 inject 声明 | 组装 Runtime、adapter、tools、recovery 和 disposer                    |
| `plugin/src/config.ts`                      | 空配置 Schema             | 增加 provider 名称、目录和运行限制的最小配置；默认值必须可解释        |
| `plugin/src/dsh/index.ts`                   | 空导出                    | 实现 Session adapter、caller resolver、provider 能力检查              |
| `plugin/src/runtime/index.ts`               | 空导出                    | 实现 Meeting Runtime、Turn runner、outbox 和 recovery                 |
| `plugin/src/tools/index.ts`                 | 空导出                    | 注册本次纳入范围的 DSH tools                                          |
| `plugin/src/projection/index.ts`            | 空导出                    | 生成 Captain/meeting identity 可读的状态 projection                   |
| `plugin/src/domain/model.ts`                | 领域模型                  | 补齐本竖切需要的 Manager、Participant、Turn、Attempt 和 message 语义  |
| `plugin/src/domain/transitions.ts`          | 领域转换                  | 复用并补齐创建、分配、提交、暂停、恢复和迟到结果规则                  |
| `plugin/src/repository/index.ts`            | SQLite repository 基础    | 接入 Runtime 所需 command、receipt、event、outbox 和 ownership 操作   |
| `plugin/src/protocol/*`                     | 共享协议 Schema/类型      | 作为 Tool 和状态 projection 的共享契约                                |
| `plugin/scripts/verify-dsh-environment.mjs` | 依赖存在性检查            | 检查锁定版本和 provider 能力证据                                      |
| `plugin/scripts/smoke-profile.mjs`          | 待新增                    | 创建临时 profile，执行 dump-config、boot、create、turn、restart smoke |
| `plugin/tests/integration/dsh/*`            | 待新增                    | 验证真实 DSH composition 的 adapter 行为                              |
| `plugin/tests/integration/runtime/*`        | 待新增                    | 验证真实 runtime 的 create、串行 Turn、pause/resume                   |
| `plugin/tests/recovery/*`                   | 待新增                    | 验证重启、幂等、lease 和 ownership recovery                           |

## 4. 前置条件与决策门

### 4.1 固定条件

- Node 使用项目要求版本；当前基线为 Node `v22.23.2`。
- pnpm 使用 `10.7.0`。
- DSH 依赖版本锁定为 `0.1.1-rc.2`。
- 所有 DSH API 结论必须以 `plugin/node_modules` 当前类型/源码和官方来源为依据。
- 所有 profile、workspace、端口和日志目录必须是本次命令创建的临时资源。

### 4.2 Provider 决策门

已确认的工程决策：

- Convivium 作为 DSH bundle 发布。
- continuable subagent provider 默认属于宿主 DSH profile 的组合依赖，不由 Convivium 自行实现或隐式携带。
- `@deepseek-ai/dsh-subagent` 只提供 `ctx.subagents` service definition 和生命周期 API，不等于存在可用 provider。
- Convivium 配置使用必填 `provider` name，不使用隐式默认 provider。
- T1 必须证明 profile 能让 provider 在 Convivium 激活检查前完成注册；不得在 `apply()` 中抢跑并发 sibling provider effect。
- `apply()` 只通过公开 `ctx.subagents.getProvider(config.provider)` 检查 provider 可解析且 `prepareContinuable` 是函数；失败时不注册会议 tools，不使用 mock fallback。
- 真实 `startContinuable()` 需要 live parent Agent、初始 prompt 和 signal，只能在 T1 临时 profile 探针及正式 create command 中执行，不能作为 `apply()` 的无 caller 启动探针。
- 只有 T1 证明 provider 属于插件分发边界时，才同步修改 `plugin/package.json` 和 `plugin/pnpm-lock.yaml`。

在任何会议 Runtime 代码进入主路径前，必须完成以下事实记录：

```text
Provider package/name:
Provider exact version:
Provider installation source:
Profile manifest/config path:
Capability evidence: prepareContinuable
Verified DSH command:
Observed startContinuable result:
Observed cleanup result:
```

Provider 必须满足：

1. 能被独立 DSH profile 加载。
2. 注册到 `ctx.subagents` 可解析的 provider registry。
3. provider 具备 `prepareContinuable` 方法。
4. `ctx.subagents.startContinuable()` 能返回 `{ childId, messageId }`。
5. 通过 `followup()` 能唤醒或冷恢复 child。
6. 通过 `interrupt()` 和 `drainContinuableChildren()` 能结束本次 smoke 创建的 child。

当前不能从插件仓库直接推断具体 provider 包。若 profile 无法提供上述能力，停止后续实现，记录阻塞原因，不添加自制 provider 或 mock provider 伪造通过。

T1 取证完成后必须暂停，把上述完整记录提交给用户确认具体 provider package/name/exact version、安装来源和 profile manifest。只有确认结果写回本 RUNBOOK 或正式兼容性文档后才能进入 T2；“发现一个可能可用的 provider”不等于获得选型许可。

## 5. 数据结构

本节只定义本竖切新增的 Runtime 数据；完整业务对象以 [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)，跨边界输入输出以协议文档，持久化类型以 Repository 接口为准。

### 5.1 Plugin config

```ts
interface Config {
  provider: string;
  dataRoot?: string;
  maxParticipants: number;
  speakerTimeoutMs: number;
  outboxPollMs: number;
}
```

约束：

- `provider` 必填，不能使用未配置的隐式默认 provider。
- `maxParticipants` 本竖切至少为 `3`；超出配置上限的创建请求整体失败。
- 所有时间值必须为有限正整数。
- `dataRoot` 只能是受控 workspace 根下的相对配置或 DSH 提供的 workspace 路径，不接受前端任意路径。

### 5.2 Meeting bootstrap

`MeetingBootstrap`、`CreateMeetingInput`、`CreateMeetingResult`、`UpdateBootstrapInput` 和 `CommittedResult<T>` 直接复用 `plugin/src/repository/index.ts` 的 canonical 导出，字段与 [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md) 一致。Repository 实例已经固定绑定 `teamId + meetingId`，不得在 RUNBOOK 中再定义带重复 ID 或不同返回值的 bootstrap 类型。

创建流程必须先调用 repository `create()` 落 `creating` bootstrap，再产生 meeting-owned Session；所有 Session active 后调用 `completeCreate()` 原子创建公开 Meeting。没有 bootstrap 归属证明时不得操作任何 Session。

### 5.3 Session ownership

```ts
interface SessionOwnership {
  sessionId: string;
  parentSessionId: string;
  sessionLabel: string;
  provider: string;
  initialMessageId?: string;
  role: "manager" | "participant";
  participantId?: string;
  lifecycleStatus: "provisioning" | "active" | "closed";
  capabilityStatus: "active" | "revoked";
  createdAt: number;
  updatedAt: number;
}
```

Canonical `SessionOwnership` 不重复保存 repository 已绑定的 `meetingId`；跨 Meeting recovery observation 必须另带 `meetingId` 定位信息。`parentSessionId`、`provider`、identity 字段首次写入后不可变；`initialMessageId` 只允许从缺失变为 DSH 首次 inbox acceptance 返回的稳定值。

label 必须严格符合：

```text
convivium:meeting-manager:<teamId>:<meetingId>
convivium:meeting-participant:<teamId>:<meetingId>:<participantId>
```

所有 Manager/Participant 都是创建会议的 Captain Session 的 direct child。恢复可以使用持久 `parentSessionId` 枚举和验证 Session，但 followup/drain 只能在相同 Captain Session 已恢复为 live Agent 后执行。

### 5.4 Session provisioning envelope

```ts
interface SessionProvisioningEnvelope {
  kind: "convivium.session.provisioning";
  version: 1;
  meetingId: string;
  teamId: string;
  role: "manager" | "participant";
  participantId?: string;
  capability: "none";
  instruction: string;
}
```

该 envelope 序列化为 `startContinuable()` 的首次 user prompt。`instruction` 必须明确：当前消息只建立会议身份，Session 尚未获得 planning 或 speaker capability，应等待后续带 `attemptId + deliveryId` 的请求。Provisioning 输出不进入 SQLite transcript；Session 在 provisioning 阶段调用任何会议写 Tool 都返回 `UNAUTHORIZED_CALLER` 或 `STALE_ATTEMPT`，不产生领域事实。

### 5.5 Runtime meeting state

`MeetingState`、`MeetingTurn`、`SpeakerStep`、`SpeakerAttempt`、`MeetingMessage`、`MeetingAgendaItem`、`MeetingObjectiveContract` 和 `MeetingLimits` 的唯一数据结构真相源是 `plugin/src/domain/model.ts` 与 [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)。本 RUNBOOK 不定义裁剪版同名类型。

本竖切仍必须完整初始化 canonical `MeetingState`，包括：

| 数据组       | 本竖切处理规则                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Objective    | 从 `CreateMeetingInputV1.objectiveContract` 分配正式 ID 并初始化全部状态                        |
| Agenda       | 从输入 agenda 分配正式 `agendaItemId`；首个未完成议题作为本 Turn 的 active agenda               |
| Participants | 保存三个 smoke Participant 的完整 canonical 数据；运行时 Session identity 仅进入 ownership      |
| Limits       | 合并 canonical defaults 与输入 limits；不创建第二套 Runtime limits                              |
| Selection    | 仅接受省略或 `round_robin`；其他 mode 返回 `UNSUPPORTED_CAPABILITY`                             |
| Continuation | 本竖切不实现；输入存在时返回 `UNSUPPORTED_CAPABILITY`，不产生副作用                             |
| Formal facts | transcript 等集合按 canonical initial state 初始化；未实现的 claims 保持空集合                  |
| Progress     | Turn 必须携带 `agendaItemId`、intent、objective、expectedOutputs、prohibitedTopics 和有序 steps |

`UNSUPPORTED_CAPABILITY` 是 protocol 的扩展错误码，`retryable: false`；T5 必须把它加入 canonical protocol type/schema 和 contract tests。不得把合法但本竖切未支持的 mode/continuation 错报为 `INTERNAL_ERROR`。

### 5.6 DSH speaker context envelope

```ts
interface SpeakerContext {
  protocolVersion: 1;
  meetingId: string;
  meetingVersion: number;
  participantId: string;
  turnId: string;
  turnSeq: number;
  agendaItemId: string;
  stepId: string;
  attemptId: string;
  deliveryId: string;
  contextFromSeq: number;
  contextThroughSeq: number;
  objective: string;
  instruction: string;
  priorMessages: MeetingMessage[];
}
```

`priorMessages` 只能来自已经提交的 SQLite transcript。调用 DSH 前先固定 `contextThroughSeq`；调用返回后不能把新的消息偷偷追加到同一次 delivery 的上下文中。

### 5.7 命令、结果与公共类型

本节类型必须直接复用 `plugin/src/protocol/types.ts`、`plugin/src/repository/index.ts` 和 DSH 包的公开类型；实现不得另造同义 transport 类型。以下是本竖切必须闭合的应用服务类型：

```ts
type CreateMeetingCommand = CreateMeetingInputV1 & {
  authorization: CommandAuthorization;
  requestHash: string;
};

type StatusCommand = MeetingStatusInputV1 & {
  authorization: CommandAuthorization;
};

type StartTurnCommand = {
  protocolVersion: 1;
  requestId: string;
  meetingId: string;
  expectedMeetingVersion: number;
  authorization: CommandAuthorization;
};

type SubmitTurnCommand = TurnSubmissionV1 & {
  authorization: CommandAuthorization;
  requestId: string;
  requestHash: string;
};

type PauseMeetingCommand = PauseMeetingInputV1 & {
  authorization: CommandAuthorization;
  requestHash: string;
};

type ResumeMeetingCommand = ResumeMeetingInputV1 & {
  authorization: CommandAuthorization;
  requestHash: string;
};

interface TurnResult {
  turnId: string;
  firstStepId: string;
  firstAttemptId: string;
}

type SubmitTurnResult = TurnSubmissionResultV1;
type MeetingControlResult = MeetingControlResultV1;
type MeetingProjection =
  | ActiveMeetingStatusResultV1
  | ExecutionTerminalMeetingStatusResultV1
  | ArchivingMeetingStatusResultV1
  | ArchivedMeetingStatusResultV1;

interface OwnedSessionObservation {
  sessionId: string;
  parentSessionId: string;
  meetingId: string;
  sessionLabel: string;
  provider: string;
  initialMessageId?: string;
  role: "manager" | "participant";
  participantId?: string;
  lifecycleStatus: SessionOwnership["lifecycleStatus"];
  capabilityStatus: SessionOwnership["capabilityStatus"];
}

interface RecoverySummary {
  recoveredMeetingIds: string[];
  reclaimedOutbox: number;
  closedOrphanSessions: string[];
  rejectedUnknownSessions: string[];
}
```

其中 `CreateMeetingInputV1`、`MeetingStatusInputV1`、`TurnSubmissionV1`、`PauseMeetingInputV1`、`ResumeMeetingInputV1`、`ActiveMeetingStatusResultV1` 等名称以 `plugin/src/protocol/types.ts` 的实际导出为准；若当前源码缺少其中某个导出，先补齐 canonical protocol type，再实现 Runtime。`Agent` 从 `@deepseek-ai/dsh-agent` 导入；`ContentBlock`、`MessageId` 和 `MessageSource` 从 `@deepseek-ai/dsh-llm` 导入；`SessionId` 从 `@deepseek-ai/dsh-session` 导入；`SubagentInterruptAuthority` 从 `@deepseek-ai/dsh-subagent` 导入。不得使用 `any` 或私有路径。

## 6. DSH 与模块接口

### 6.1 Provider capability

```ts
interface ContinuableProviderRequirement {
  provider: string;
  packageName: string;
  version: string;
  supportsPrepareContinuable: boolean;
  verifiedBy: string;
}
```

能力判断必须在插件激活阶段完成。`supportsPrepareContinuable === false` 或无法读取 provider 时，插件加载失败，不暴露会议 tools。

### 6.2 MeetingSessionAdapter

```ts
interface MeetingSessionAdapter {
  assertContinuableProvider(): Promise<ContinuableProviderRequirement>;

  createManager(input: {
    parent: Agent;
    childId: SessionId;
    provider: string;
    teamId: string;
    meetingId: string;
    label: string;
    initialPrompt: ContentBlock[];
    persona: string;
    signal: AbortSignal;
  }): Promise<{ sessionId: SessionId; initialMessageId: MessageId }>;

  createParticipant(input: {
    parent: Agent;
    childId: SessionId;
    provider: string;
    teamId: string;
    meetingId: string;
    participantId: string;
    label: string;
    initialPrompt: ContentBlock[];
    persona: string;
    signal: AbortSignal;
  }): Promise<{ sessionId: SessionId; initialMessageId: MessageId }>;

  followup(input: {
    parent: Agent;
    childId: string;
    content: ContentBlock[];
    source: MessageSource;
    signal: AbortSignal;
  }): Promise<{ messageId: string }>;

  interrupt(input: {
    targetSessionId: string;
    authority: SubagentInterruptAuthority;
  }): Promise<void>;

  drain(input: { parent: Agent; childIds: string[] }): Promise<void>;

  inspectOwnedSessions(input: {
    parentSessionId: SessionId;
    meetingId: string;
    signal: AbortSignal;
  }): Promise<OwnedSessionObservation[]>;
}
```

实现约束：

- `createManager` 和 `createParticipant` 内部只能使用 `ctx.subagents.startContinuable()`。
- 创建前必须由 Runtime 分配 `childId`，以 `parent.session.id`、provider、label 和 `provisioning` 状态写入 ownership，再把同一 `childId` 传给 `startContinuable()`。
- `initialPrompt` 只能是 5.4 定义的 capability-free provisioning envelope；它不是 speaker delivery。
- `startContinuable()` 返回后必须校验返回 childId 与预留值一致，持久化 `initialMessageId` 并把 lifecycle 前进为 `active`。
- `followup` 内部只能使用 `ctx.subagents.followup()`。
- `interrupt` 内部只能使用 `ctx.subagents.interrupt()`。
- `drain` 内部只能使用 `ctx.subagents.drainContinuableChildren()`。
- Runtime、Tool、HTTP 和 recovery 不得直接调用 DSH subagent API。
- 每次 followup 前后都要校验 SQLite ownership、capability、Meeting status 和 attempt。

### 6.3 MeetingRuntime

```ts
interface MeetingRuntime {
  createMeeting(
    input: CreateMeetingCommand,
  ): Promise<CommittedResult<CreateMeetingResultV1>>;
  getStatus(input: StatusCommand): Promise<MeetingProjection>;
  startNextTurn(input: StartTurnCommand): Promise<CommittedResult<TurnResult>>;
  submitTurn(
    input: SubmitTurnCommand,
  ): Promise<CommittedResult<SubmitTurnResult>>;
  pause(
    input: PauseMeetingCommand,
  ): Promise<CommittedResult<MeetingControlResult>>;
  resume(
    input: ResumeMeetingCommand,
  ): Promise<CommittedResult<MeetingControlResult>>;
  recover(): Promise<RecoverySummary>;
  dispose(): Promise<void>;
}
```

Runtime 是所有正式会议事实的唯一应用服务入口。Tool、HTTP、worker 和 recovery 不得自行修改 `MeetingState`。

### 6.4 Repository 边界

```ts
interface MeetingRepository {
  readonly teamId: string;
  readonly meetingId: string;
  create(input: CreateMeetingInput): Promise<MeetingBootstrap>;
  completeCreate(
    input: CreateMeetingInput,
  ): Promise<CommittedResult<CreateMeetingResult>>;
  updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
  read(): Promise<MeetingSnapshot>;
  execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>;
  claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
  completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
  recover(input: RecoverInput): Promise<RecoveryResult>;
  recordSessionOwnership(
    input: SessionOwnershipInput,
  ): Promise<SessionOwnership>;
  close(): Promise<void>;
}
```

本接口直接复用 [SQLite Repository 契约](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md) 和 `plugin/src/repository/index.ts`，不得在 Runtime 为方便而更改签名。`create()` 只建立 bootstrap；`completeCreate()` 才创建公开 Meeting 和成功 receipt。

每次正式写入必须在一个 SQLite transaction 中完成：expected version 校验、domain transition、state、event、receipt 和 outbox。DSH 调用必须发生在 transaction commit 之后。

### 6.5 Tools

本竖切注册：

| Tool                       | Caller                       | 行为                                                                       |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `convivium_create_meeting` | Captain                      | 校验参与者配置，创建 bootstrap、Meeting state 和四个 meeting-owned Session |
| `convivium_meeting_status` | Captain/有效 meeting Session | 返回 caller-specific projection                                            |
| `convivium_submit_turn`    | 当前 Participant Session     | 只接受匹配 active attempt 的结构化提交                                     |
| `convivium_pause_meeting`  | Captain                      | 事务暂停并撤销可撤销 delivery                                              |
| `convivium_resume_meeting` | Captain                      | 从 SQLite 最新事实重新启动下一动作                                         |

每个 Tool 必须使用当前 `@deepseek-ai/dsh-tools` 的 `defineTool` 和 mandatory canonical `output`，并从 `exec.agent` 解析真实 caller。前端或 Tool 参数不得直接提供身份作为授权凭据。

### 6.6 Deferred HTTP boundary

本竖切不注册 Meeting HTTP routes。当前 `@deepseek-ai/dsh-host-webserver` `WebRoute.handler` 只接收 Node `IncomingMessage` 和 `ServerResponse`；在本项目当前注入和已确认接口中，没有可把原始请求绑定为 DSH 当前用户并验证 Team read/control 权限的公开 service。把 loopback、header、前端传入 Session ID 或显示名称当作授权均不成立。

[Agent Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) 中的 status/pause/resume Web routes 仍是后续正式目标。只有先形成并验证 DSH Web user authorization adapter 契约后，才能在后续范围实现；不得为了本竖切注册无授权 route。T5 和 profile smoke 只通过真实 DSH Tools 执行 status/pause/resume。

## 7. 执行任务

任务必须按顺序完成。每个任务完成后才进入下一任务；任何 gate 失败都回到当前任务处理，不通过空实现越过。

### T0：建立执行分支与证据基线

文件：无代码变更。

动作：

1. 创建独立 `codex/` 分支。
2. 记录 `git status --short --branch`。
3. 运行 `pnpm verify:environment`、`pnpm verify:contract`、`pnpm typecheck`、`pnpm test`。
4. 记录 Node、pnpm、DSH 包版本。

验收：工作区无无关改动，基线验证通过，证据可回溯。

### T1：确认真实 provider 与 profile 组合

文件：

- `plugin/package.json`
- `plugin/pnpm-lock.yaml`
- 新增或临时使用的 DSH profile manifest
- `plugin/scripts/verify-dsh-environment.mjs`

动作：

1. 从当前 DSH 安装和官方类型/源码定位 provider 包及 provider name。
2. 验证 provider 的 `prepareContinuable` 方法，而不是只验证 `ctx.subagents` 存在。
3. 建立临时 profile，组合 provider 与 Convivium bundle。
4. 运行 `dsh --profile <temporary-profile> --dump-config`。
5. 用临时 profile 创建专用 live parent Agent，运行 `startContinuable()`、followup、cold resume、interrupt 和 `drainContinuableChildren()` 探针。
6. 记录 provider package、版本、profile 配置和命令输出。
7. 提交完整 provider 决策表并暂停，等待用户确认 exact package/name/version、安装来源和 profile manifest。

provider 默认属于宿主 profile 的组合依赖，不自动加入 Convivium 的 `package.json`。只有当 T1 证明 provider 是插件分发边界的一部分，才可以同步修改 package manifest 和 lockfile；否则只记录 profile 的外部前置条件。

验收：`dump-config` 显示 provider；真实 `startContinuable()` 返回 child/message id；followup/cold resume 成功；cleanup 不影响其他 Session；用户确认结果已经写回正式文档。

停止条件：没有可用 provider、没有 `prepareContinuable`、provider 只能通过 mock 运行时提供、profile 无法保证 provider 先于 Convivium gate 注册、或用户尚未确认 exact provider tuple 时，停止并记录阻塞，不继续 T2。

### T2：实现启动期能力检查和配置

文件：

- `plugin/src/config.ts`
- `plugin/src/index.ts`
- `plugin/scripts/verify-dsh-environment.mjs`
- `plugin/tests/contract/package-contract.spec.ts`

动作：

1. 增加 provider 配置和数值限制 schema。
2. 使用 T1 已验证的 profile ordering/dependency，使 provider 注册先于 Convivium capability gate。
3. 在 `apply()` 初始阶段通过 `getProvider(config.provider)` 检查 provider 存在及 `prepareContinuable` 方法；不调用 `startContinuable()`。
4. provider 不满足能力时 fail loud。
5. 不暴露半初始化的 tools。
6. 使用 `ctx.effect()` 或当前官方 disposer 机制管理所有注册。

验收：能力缺失时插件加载失败；不会因 sibling provider 注册竞态误判；正常 profile 能继续完成组合；卸载后无 tool、timer 或 worker 残留。

### T3：实现 MeetingSessionAdapter

文件：

- `plugin/src/dsh/session-adapter.ts`
- `plugin/src/dsh/labels.ts`
- `plugin/src/dsh/provisioning.ts`
- `plugin/src/dsh/caller-resolver.ts`
- `plugin/src/dsh/index.ts`
- `plugin/src/repository/index.ts`
- `plugin/src/repository/schema.ts`
- `plugin/src/repository/migrations.ts`
- `plugin/tests/integration/dsh/session-adapter.spec.ts`

动作：

1. 实现 provider capability assertion。
2. 实现 manager/participant label 生成和反向校验。
3. 实现 deterministic capability-free provisioning envelope builder。
4. 扩展 ownership schema/migration，保存 `parentSessionId`、provider 和首次 `initialMessageId`。
5. 实现 caller-reserved childId 的 `startContinuable` 创建入口：先写 provisioning ownership，首次 inbox acceptance 后写 initialMessageId 并激活。
6. 实现 followup、interrupt、drain 和 ownership re-check。
7. 使用 `parentSessionId` 实现 `listChildren`/`listDescendants` inspection。
8. 实现真实 caller 到 Captain/Manager/Participant 的解析，并持久绑定创建会议的 Captain Session。
9. 禁止按显示名称、模糊前缀或客户端 participant id 获取授权。

验收：三类身份隔离；四个 Session 均保存相同 Captain direct parent、provider 和 initialMessageId；provisioning 阶段没有会议写 capability；无权 caller、错误 meeting、revoked capability、stale Session 和跨 Meeting 操作均失败。

### T4：实现最小 Meeting Runtime 与 round-robin Turn

文件：

- `plugin/src/domain/model.ts`
- `plugin/src/domain/transitions.ts`
- 新增 `plugin/src/domain/planning.ts`
- 新增 `plugin/src/runtime/meeting-runtime.ts`
- 新增 `plugin/src/runtime/turn-runner.ts`
- 新增 `plugin/src/runtime/outbox-worker.ts`
- `plugin/src/runtime/index.ts`

动作：

1. 校验 vertical-slice input：保留完整 canonical objective/agenda/limits；只接受省略或 `round_robin` selection mode，不支持 continuation 时返回 `UNSUPPORTED_CAPABILITY` 且无副作用。
2. 实现 create meeting 的 bootstrap → ownership provisioning → 四个 `startContinuable` → `completeCreate` 单一 Runtime command。
3. 四个 Session 首次 prompt 都是 capability-free provisioning envelope；任何 provisioning 输出不进入 MeetingState。
4. 使用首个未完成 agenda item 和 `round_robin` 生成完整、有序、无重复的 SpeakerStep 列表，并保存 canonical Turn 必填字段。
5. 每次只创建一个 active SpeakerAttempt。
6. 固定包含 `agendaItemId` 的 context range 后通过 adapter followup。
7. 等待合法 `submit_turn`，事务提交 transcript 后再请求下一 Participant。
8. `create_meeting` 提交成功后自动启动第一个 Turn；不增加额外的 `start_turn` Tool。内部 `startNextTurn()` 只由 Runtime/outbox 调用。
9. 首个竖切中 Manager Session 只完成 provisioning、ownership、恢复和清理，不接收语义规划 capability，不产生 Manager plan 事实。
10. Turn 结束后将 Meeting 置为 `waiting`；本竖切不自动进入未实现的复杂完成判断，也不把单个 Turn 误判为业务完成。
11. DSH 内部工具失败只作为 Agent execution observation；只有无法合法提交或 Session 不可用时才影响当前 attempt。

验收：A 提交后 B 才收到请求；B 的 context 包含 A；C 的 context 包含 A+B；并发请求数始终为 1。

### T5：接入 Tools 和 projection

文件：

- `plugin/src/tools/register-tools.ts`
- `plugin/src/tools/index.ts`
- `plugin/src/projection/status.ts`
- `plugin/src/projection/index.ts`
- `plugin/src/protocol/*`

动作：

1. 使用当前 DSH Tool API 注册五个纳入范围的 tools。
2. 使用 `exec.agent` 建立真实 caller binding。
3. 将完整 canonical 领域状态映射成不含 capability/私有数据的 `MeetingProjection`。
4. 为错误建立稳定 protocol error envelope，并增加 `UNSUPPORTED_CAPABILITY` schema/contract test。
5. 断言本竖切没有注册 Meeting HTTP routes。

验收：Captain 可通过真实 DSH Tool 创建、查询、暂停和恢复会议；Participant 只能提交匹配 active attempt 的发言；未授权请求不产生 SQLite 变化；没有无授权 HTTP 控制面。

### T6：实现 pause/resume、幂等和 recovery

文件：

- `plugin/src/runtime/recovery.ts`
- `plugin/src/runtime/outbox-worker.ts`
- `plugin/src/repository/index.ts`
- `plugin/src/repository/migrations.ts`
- `plugin/tests/recovery/*`

动作：

1. pause 事务撤销尚未开始的 delivery capability。
2. 对运行中的 Session 调用 adapter interrupt；迟到提交重新做 capability/attempt 校验。
3. resume 只从 SQLite 最新事实计算下一动作。
4. recovery 扫描 `creating`、`ready` 和未结束 Meeting。
5. 通过 repository-bound meetingId + `parentSessionId` + DSH parent-child relation + 精确 Session label 关联 orphan Session。
6. 进程重启后先恢复 SQLite 与 Session catalog，不在 parent Agent 缺席时 followup/drain；同一 Captain Session 的下一次 Tool 调用重新绑定 exact live parent。
7. 处理 outbox lease 过期、重复 delivery 和 receipt replay。
8. 无法证明归属的 Session 不操作，只记录诊断。

Recovery 状态规则必须固定如下：

| 发现状态                      | 恢复动作                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `creating`                    | 根据 bootstrap 和 ownership 继续补齐创建；无法补齐则写 `creation_failed` 并精确清理       |
| `ready` 且无 current attempt  | 恢复为 `waiting`；只有同一 Captain Session 重新成为 live parent 后才允许显式推进          |
| `running` 且有 active attempt | revoke 未知结果；不能直接重放未知副作用，parent rebind 后由 deliveryId/receipt 决定新动作 |
| `paused`                      | 保留正式事实，不发送新 delivery，等待 Captain resume                                      |
| 未结束且 ownership 不完整     | 只操作能由 bootstrap + 精确 label 证明归属的 Session                                      |

验收：重复 pause/resume、重复 submit、进程重启和迟到提交都不会产生重复 transcript 或跨 Meeting 变化。

### T7：实现真实 profile smoke

文件：

- `plugin/scripts/smoke-profile.mjs`
- `plugin/package.json`
- `plugin/tests/integration/dsh/profile-smoke.spec.ts`

动作：

1. 创建精确临时 profile、workspace、端口和日志目录。
2. 安装当前 package 的实际产物，而不是直接引用 `src/`。
3. 先执行 `--dump-config`，再启动 DSH Host。
4. 通过真实 DSH 工具完成 create/status/turn/pause/resume，不调用 Meeting HTTP route。
5. 记录 Session ids、ownership labels、meeting versions、message seq 和 provider name。
6. 停止进程并重启同一临时 profile；从相同 Captain Session 调用 status/resume，验证 exact parent rebind 和状态恢复。
7. 使用精确路径执行 restore，删除本次创建的临时资源。

结构化断言必须来自 Runtime/Repository 诊断或 DSH 原生 Session Event，不依赖模型自然语言完全一致。每个 delivery 至少记录：

```text
meetingId
turnId
stepId
attemptId
deliveryId
contextFromSeq
contextThroughSeq
priorMessageIds
```

断言 A 的 `priorMessageIds=[]`，B 的 `priorMessageIds` 包含 A 的 message id，C 的 `priorMessageIds` 按顺序包含 A、B 的 message id；对应的 `contextThroughSeq` 必须等于发送前 SQLite transcript 的最大 seq。

验收：脚本非零退出即视为失败；成功时所有临时进程退出、临时目录清理完成、日志中无未处理 rejection。

### T8：完成验证和 readiness 证据

文件：

- `plugin/package.json`
- `docs/40-readiness/CONVIVIUM-FRAMEWORK-EVIDENCE.md`
- 必要时新增 `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`

动作：

1. 运行离线且确定性的 `pnpm verify`，覆盖 format/lint、双 program typecheck、unit、contract、integration、recovery、build、environment、contract 和 package verifier。
2. 单独运行需要 provider、模型凭据和真实 DSH profile 的 `pnpm smoke:profile`；可新增显式 `pnpm verify:runtime` 顺序组合 `verify` 与 `smoke:profile`，但不得把外部依赖 smoke 隐式塞入默认 `verify`。
3. 记录 DSH、Node、pnpm、provider、profile、package version 和 commit。
4. 将未覆盖能力继续保留为 `Not Covered`，不得把竖切描述成完整会议产品。

验收：所有本 RUNBOOK 必选验收项都有命令或日志证据；失败路径和清理路径均已验证。

## 8. 验证矩阵

| 类别        | 必须验证               | 成功判据                                          |
| ----------- | ---------------------- | ------------------------------------------------- |
| Provider    | `prepareContinuable`   | provider 可解析且 `startContinuable` 返回两个 id  |
| Composition | `dump-config`          | Convivium 与 provider 同时出现在独立 profile      |
| Provision   | initial prompt         | 4 个 Session 仅收到 capability-free envelope      |
| Create      | Captain create         | bootstrap、Meeting、4 条完整 ownership 均存在     |
| Isolation   | Session labels         | manager/participant 各自唯一，跨 Meeting 不相同   |
| Parent      | direct parent/rebind   | ownership parent 一致，重启后由相同 Captain 重绑  |
| Sequential  | A -> B -> C            | B 看到 A，C 看到 A+B，活跃 attempt ≤ 1            |
| Commit      | submit                 | transcript、event、receipt、version 同一事务提交  |
| Stale       | revoke/late submit     | 返回 `STALE_ATTEMPT`，无新 transcript             |
| Idempotency | duplicate request      | 返回原 receipt，不重复写事实                      |
| Pause       | Captain pause          | 新 delivery 被拒，运行中调用可被 interrupt        |
| Resume      | Captain resume         | 从最新 SQLite 事实继续，不复用旧 attempt          |
| Restart     | stop/start             | 状态、ownership 和已提交 transcript 保留          |
| Cleanup     | drain/dispose          | meeting-owned Activation 释放，不影响其他 Session |
| Package     | build/package verifier | 实际发布入口可解析，无源码和测试泄漏              |
| Web scope   | route registry         | 本竖切没有注册无授权 Meeting HTTP route           |

## 9. 失败处理

| 失败                             | 处理                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| provider 不存在                  | 插件 fail loud，不注册会议 tools                                 |
| provider 无 `prepareContinuable` | 视为能力不满足，停止 profile smoke                               |
| provider 注册顺序无法证明        | 停止 T1；不得用同步抢跑检查或任意 sleep 猜测 ready               |
| Session 创建部分失败             | 保持 bootstrap creating/creation_failed，通过 ownership 精确清理 |
| provisioning Session 提前写入    | 权限校验拒绝，不写 MeetingState、event、receipt 或 transcript    |
| SQLite transaction 失败          | 不调用后续 DSH 副作用，返回可重试错误                            |
| followup 已接受但提交失败        | 以稳定 deliveryId 重查/重投，receipt 防止重复 transcript         |
| pause 与 submit 竞态             | 以 capability、attempt 和 expected version 的最终事务结果为准    |
| 迟到结果                         | 记录 rejected observation，不写正式会议事实                      |
| DSH 进程崩溃                     | 恢复 lease/outbox/ownership；等待同一 Captain live parent rebind |
| smoke 失败                       | 先收集日志和 profile dump，再执行精确清理；不得污染用户 profile  |

## 10. 完成定义

本 RUNBOOK 只有在以下条件全部满足时才算完成：

1. 真实 provider、版本、profile 配置和 `prepareContinuable` 证据已记录。
2. 独立 DSH profile 能加载当前 package 的真实构建产物。
3. Captain 能真实创建 1 Manager + 3 Participant meeting-owned Session，四条 ownership 均保存 direct parent、provider 和 initialMessageId。
4. 一次真实串行 Turn 完成，且后续 Participant 读取前序正式 transcript。
5. stale、duplicate、pause/resume 和 restart recovery 验证通过。
6. 所有 DSH Session 操作都经过 `MeetingSessionAdapter`。
7. 所有正式会议事实都经过 Runtime/Repository transaction。
8. smoke 结束后临时进程和目录均清理完成。
9. readiness 文档记录通过项、未覆盖项、环境、provider 和 commit。
10. 不把本竖切描述为完整会议产品；未纳入范围仍明确保留。
11. 本竖切没有注册缺少 DSH Web user authorization proof 的 Meeting HTTP route。

## 11. 收口规则

- 这份 RUNBOOK 执行期间如产生长期架构结论，迁移到 `ARCHITECTURE.md`、接口或设计文档。
- provider 的具体包、profile 形态和分发方式只有在真实验证后才能写入正式兼容性或发布文档。
- 任务完成后将运行证据写入 `docs/40-readiness/`，再删除或归档本 RUNBOOK；不能用删除 RUNBOOK 代替验证。
- 代码提交必须与测试、profile smoke 和 readiness 证据保持同一可解释范围，并遵守 `COMMIT-RULES.md` 与 `PR-RULES.md`。
