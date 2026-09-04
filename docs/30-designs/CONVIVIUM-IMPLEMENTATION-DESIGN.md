# Convivium Implementation Design

## Purpose

本文定义 Convivium 独立 DSH 插件的源码落点、模块职责、依赖方向、持久化入口、DSH adapter、启动恢复和验证结构。本文解决“实现放在哪里、模块如何协作、哪些入口必须唯一”的问题；会议业务规则和跨边界字段分别以 Requirements、Protocol Interface 和 Meeting Orchestration Design 为准。

## Scope And Non-goals

### Scope

- `plugin/` 内 Meeting consumer 与 JSONL backend provider 两个 Cordis child plugins 的职责和生命周期边界。
- Meeting domain、repository port、DSH Storage Domain adapter、Meeting Runtime、DSH adapter、HTTP、projection 和 client 的依赖关系。
- 当前 Storage Domain repository 的打开、关闭和恢复生命周期，以及遗留数据的 fail-closed 边界。
- 所有 meeting-owned AgentSession 的统一调用和 capability revoke 检查入口。
- 插件启动、创建、运行、暂停、恢复、归档和冷恢复的代码协作顺序。
- 单元、契约、集成、恢复和压力验证的源码位置及最低覆盖。

### Non-goals

- 不重复定义协议输入、输出和错误字段。
- 不修改会议状态机、议题控制、完成判断和终止语义。
- 不规定 Agent 内部 Prompt、Skills、Tools、MCP 或执行流程。
- 不建立独立服务、通用 Agent 平台或脱离 DSH 的运行模式。
- 不导入、派生或兼容外部参考项目的源码、协议和持久化格式。

### V1 deployment and user boundary

V1 固定运行于单个本地 DSH Host，并只面向该 Host 的一位本地用户。Meeting Web route 只可在 `webServer.host === "127.0.0.1"` 时注册；`plugin/` 不实现远程监听、多用户身份、跨 Host 共享、网络租户隔离、Web 用户/Team authority 或生产部署编排。

这项边界不放宽既有会议身份和 Session 隔离：前端不能伪造 Captain、Manager 或 Participant 身份；前端仍只能调用受控后端入口，Meeting Runtime 仍是领域状态和状态转换的唯一执行者。V1 Web request 本身不绑定上述会议身份，不做 per-user 或 Team authority 校验；loopback Host 是唯一 Web 访问边界。若未来需要远程或多用户能力，必须先在 Architecture、Requirements 和 Web authorization interface 中分别确认部署范围、用户/Team 身份来源、读取与控制权限、跨 workspace 隔离及失败语义，之后才能注册相应路由或复用 V1 的本地实现。

## Related Requirements And Interfaces

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Meeting Agent Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)
- [Meeting Agent Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)
- [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)
- [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)（当前持久化接入契约）

发生冲突时，Architecture、Requirements 和 Interface 优先；本文不得通过实现便利改变公开语义。

## Responsibilities And Dependencies

### Product tree

```text
plugin/
├── package.json
├── pnpm-lock.yaml
├── cordis.patch.yml
├── tsconfig.json
├── tsconfig.client.json
├── tsdown.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Host entry
│   ├── config.ts
│   ├── protocol/
│   ├── domain/
│   ├── repository/
│   ├── storage/                  # package-private JSONL backend child plugin
│   ├── runtime/
│   ├── dsh/
│   ├── tools/
│   ├── http/
│   ├── projection/
│   └── client/
│       └── index.tsx               # Browser entry
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── recovery/
│   └── stress/
└── scripts/
    ├── verify-package.mjs
    └── smoke-profile/
        ├── index.mjs
        ├── environment.mjs
        ├── result.mjs
        └── probe/
            ├── index.js
            ├── support.js
            └── scenarios/
                ├── archive.js
                ├── baseline.js
                ├── completion.js
                ├── convergence.js
                ├── decision-risk-closure.js
                ├── isolation.js
                ├── mail.js
                ├── reassign.js
                ├── recovery.js
                └── risk-reopen.js
```

`src/index.ts` 只负责解析配置、构造依赖、注册 DSH 插件能力和绑定 disposer。业务转换不得直接写在插件入口、HTTP handler 或 tool handler 中。

### Package topology and build faces

Convivium 保持为 `plugin/` 单 package、单 lockfile 和单发布物。`src/storage/` 实现只认识 DSH KV 语义的 JSONL `StorageBackend` provider child plugin；Meeting Runtime 作为 consumer child plugin，只通过 `@deepseek-ai/dsh-storage-domain` 使用自身 record schema。顶层 `src/index.ts` 负责挂载二者并约束生命周期；宿主组合中的 `storage-domain` row 只负责把 Domain Facility 路由到 `convivium-jsonl`。不建立第二个 package、backend 公共导出、adapter hierarchy 或未来 provider factory。

会议运行依赖宿主组合中的 continuable subagent provider。`@deepseek-ai/dsh-subagent` 只提供 `ctx.subagents` service definition；它不自动提供具备 `prepareContinuable` 能力的 provider。选定 provider 包、宿主 profile 组合和最终分发方式前，不能将会议 Session 创建描述为可运行；`smoke:profile` 必须在独立 profile 中验证 provider、`startContinuable()`、冷恢复和释放链路。

同一个 package 提供两个构建面：

| Face   | Source entry           | Published entry                                | Runtime                  |
| ------ | ---------------------- | ---------------------------------------------- | ------------------------ |
| Host   | `src/index.ts`         | `lib/index.js`、`lib/types/index.d.ts`         | DSH Host / Node.js       |
| Client | `src/client/index.tsx` | `lib/client.js`、`lib/types/client/index.d.ts` | DSH Web Client / Browser |

`package.json` MUST：

- 通过 `dsh.bundle.patch` 指向 `cordis.patch.yml`；package 是 bundle，不是 profile，仓库不得维护用户 profile manifest。
- 同时导出 `.`、`./client`、`./cordis.patch.yml` 和 `./package.json`。
- 声明 `dsh.client.platform = "web"`，并在 `dsh.client.inject` 中列出 Client 启动所需的 DSH client packages。
- 使用 `files` allowlist 只发布 Host bundle、Client bundle、类型声明、patch、README 和必要资产。
- 将 Cordis、React 和 DSH 共享 runtime identity 声明为 peer；构建、类型检查和测试所需版本同时出现在 dev dependencies。只由插件内部使用且不要求与 Host 共享 identity 的库使用普通 dependency。

构建分为两个明确步骤：TypeScript 生成 `lib/types/**` 声明和构建中间 JavaScript，`tsdown` 生成 `lib/index.js` 与 `lib/client.js`。Client 构建使用独立 `tsconfig.client.json`，不得把 Node.js、持久化实现、workspace 文件系统或 Host-only DSH service 打入浏览器 bundle。

`cordis.patch.yml` 插入稳定 row ID `convivium` 并把既有 `storage-domain` row 的默认 backend 固定为 `convivium-jsonl`；不新增独立 backend row。Client entry 由 `package.json.dsh.client` 进入 DSH browser roster，不在 Host `apply()` 中手工加载或注册。

### Dependency direction

```text
client ──> protocol
client ──HTTP contract──> http ──> runtime ──> domain
                               │       │
tools ──> protocol             │       ├──> repository
tools ──caller context─────────┘       ├──> dsh
                                       └──> projection

repository ──> domain types
repository/domain ──> @deepseek-ai/dsh-storage-domain
storage ──> @deepseek-ai/dsh-storage
index ──> storage provider child + Meeting consumer child
dsh        ──> domain ports
projection ──> domain read models + protocol projections
protocol   ──> no infrastructure or domain module
domain     ──> no infrastructure module
```

依赖规则：

1. `protocol/` 只保存 Host/Client 共享的 transport-neutral 类型、常量和无副作用 codec，不导入 domain 或 infrastructure。
2. `domain/` 不导入 protocol、DSH、repository、HTTP、React 或文件系统模块。
3. `repository/` 不调用 DSH，也不选择 speaker 或判断会议完成。
4. `dsh/` 只实现 Runtime 所需 port，不写 Meeting 领域状态。
5. `tools/` 和 `http/` 只做 transport 解析、caller binding、调用 Runtime 和结果编码。
6. `client/` 只使用 `protocol/` 定义的 Web projection，不导入 host 代码、domain aggregate 或数据库类型。
7. `projection/` 只能读取已提交事实并映射为 protocol projection；Markdown 和 UI projection 都不能反向驱动状态转换。

### Module map

| Path                                                           | Required responsibility                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/config.ts`                                                | 插件配置 Schema、默认值和启动期能力检查                                                              |
| `src/protocol/*`                                               | Interface 对应的 Host/Client 共享 transport 类型、常量和无副作用 codec                               |
| `src/domain/model.ts`                                          | Meeting 聚合、值对象和领域 read model                                                                |
| `src/domain/transitions.ts`                                    | 唯一领域状态转换集合                                                                                 |
| `src/domain/planning.ts`                                       | candidate filtering、selection mode、turn plan 校验                                                  |
| `src/domain/completion.ts`                                     | 完成事实、停滞和终止派生计算                                                                         |
| `src/domain/errors.ts`                                         | 内部领域错误分类；由 transport 映射为协议错误                                                        |
| `src/repository/domain/domain-meeting-repository.ts`           | 聚合读写、receipt、event 和 outbox 的单 commit 提交                                                  |
| `src/repository/domain/domain-repository-registry.ts`          | catalog discovery、每 Meeting domain 打开、缓存和关闭                                                |
| `src/repository/domain/schemas.ts`                             | catalog、creation、projection、commit、checkpoint 和 patch 的严格 record schema                      |
| `src/storage/index.ts`                                         | 注册 package-private `convivium-jsonl` backend provider child plugin                                 |
| `src/storage/backend.ts`                                       | DSH `StorageBackend`/`KvFacet` lifecycle；不导入 Meeting 业务                                        |
| `src/storage/unit.ts`                                          | JSONL KV unit 的 replay、mutation、physical checkpoint 和关闭顺序                                    |
| `src/runtime/application-service.ts#createCreateStatusRuntime` | 当前所有公开命令的唯一应用服务入口；增量功能复用该入口，不另建第二个 Runtime                         |
| `src/runtime/turn-runner.ts`                                   | Manager plan、逐 speaker dispatch、submit 和下一 step 推进                                           |
| `src/runtime/outbox-worker.ts`                                 | 提交后 DSH 副作用、重投和结果回写                                                                    |
| `src/runtime/mail-processor.ts`                                | meeting-scoped mail context 固化和独立处理 attempt                                                   |
| `src/runtime/recovery.ts`                                      | 冷启动扫描、租约回收、outbox 恢复和 orphan 归属修复                                                  |
| `src/runtime/archive.ts`                                       | 终态快照、capability revoke、Activation drain 和 archived commit                                     |
| `src/dsh/session-adapter.ts`                                   | meeting-owned Session 创建、followup、interrupt、drain 和枚举                                        |
| `examples/meeting-agent-definitions/*`                         | 不进入发布包的 Convivium Meeting Agent Definition 固定样本；不表示 DSH capability 已安装             |
| `scripts/verify-agent-definition-samples.mjs`                  | 校验九个固定 Definition、文件集合和 AGENT.md hash                                                    |
| `src/domain/meeting-task.ts`                                   | MeetingTask、HandRaise、状态转换和 task projection 的纯领域逻辑                                      |
| `src/dsh/caller-resolver.ts`                                   | 将真实 DSH caller Session 解析为 Captain、Manager 或 Participant                                     |
| `src/tools/register-tools.ts`                                  | 注册 `convivium_*` 工具并绑定协议 Schema                                                             |
| `src/http/index.ts`                                            | 仅在 loopback Host 注册 `/api/convivium/*`；提供本地 Meeting list、status、pause 和 resume transport |
| `src/projection/status.ts`                                     | caller-specific Meeting status projection                                                            |
| `src/client/*`                                                 | 状态读取、暂停/继续控制和会议 UI                                                                     |

上述文件可以在实现增长后拆分，但不得跨越职责边界或创建第二个 Meeting 写入口。

### FR-13 Phase 1 Runtime composition

`plugin/src/runtime/services/agent-catalog.ts` 是唯一 consumer port owner，定义 `AGENT_CATALOG_SERVICE_KEY`、`AgentCatalogPort`、`AgentCatalogReadResult`、Cordis `Context` augmentation 和 result-to-binding validation。`plugin/src/index.ts::meetingConsumerPlugin.apply` 使用 optional `ctx.get("convivium.agentCatalog")`，并把结果注入 `plugin/src/runtime/application-service/index.ts::CreateStatusRuntimeOptions`；该 key 不加入 required `inject`。Host/profile 负责实现并 `ctx.provide` 同一 service；Convivium 不实现 producer、第二 source 或 service framework。

Runtime 只在 source state 通过 `isMeetingStateV2` 且 existing pure transition preview 证明 command 将创建 Manager planning attempt 后读取 Catalog 一次；legacy source 不读取。preview 与最终 transition 复用同一 `now` 和 deterministic IDs；最终 transition 在 existing `MeetingRepositoryPort.execute` 中原子写 attempt binding。initial planning、task start/finish、Captain/local resume、speaker submission 和 speaker timeout 的现有 attempt producer 都使用该单一 capture helper；Domain transition 只接收 required binding，不导入 port。

Protocol owner 固定为：`plugin/src/protocol/types.ts` 定义 DTO；`plugin/src/protocol/schema.ts` 定义可复用 Catalog/recommendation value schemas；`plugin/src/protocol/commands.ts::ManagerPlanSubmissionSchema` 只拥有 command extension；`plugin/src/protocol/status.ts::MeetingStatusResultSchema` 只拥有 active/execution-terminal status extension。不得把 command 或 status object schema 移入 `schema.ts`，也不得增加 adapter、registry 或 compatibility mapper。

`plugin/src/domain/model.ts::MeetingState` 是 snapshot binding 与 pending recommendation 的唯一事实 owner。为遵守 Domain 不依赖 Protocol 的规则，该文件定义持久事实所需的内部同构 Catalog/claim fields，不导入 `protocol/`；`plugin/src/runtime/services/agent-catalog.ts::captureManagerCatalogBinding` 是 validated transport snapshot 到内部 snapshot 的唯一逐字段转换，不建立通用 mapper。`plugin/src/projection/status.ts::projectManagerMeetingContext` 只从当前 attempt binding 生成安全 Manager projection；`projectMeetingStatus` 只输出脱敏 pending recommendation。`plugin/src/runtime/application-service/meeting-turn.ts::submitManagerPlan` 与 `plugin/src/domain/transitions/manager-planning.ts::submitManagerPlanTransition` 复用现有 command/commit/fallback 边界，不增加 command、event、outbox worker 或 repository API。

## Persistence Algorithm And Repository Cutover

当前持久化算法是 `Checkpointed Commit Log`，抽象状态、checkpoint/commit/compaction 流程、不变量和验收点见 `MEETING-PERSISTENCE-SPECIAL-DESIGN.md`。它属于带 checkpoint 与 log compaction 的 log-structured persistence，不得简称为 `Event Sourcing` 或 `WAL`。repository 只使用 `@deepseek-ai/dsh-storage-domain`：一个轻量 catalog domain 用于发现，每个 Meeting 使用独立 domain；一次 command 只写一条 commit record，checkpoint 分页写入。`src/storage/` 以 JSONL 实现标准 DSH KV backend，但不认识 Meeting 数据语义；它是 Convivium package 内的 provider child plugin，不是独立产品或发布单元。

Storage Domain 是当前唯一会议事实源。实现不双写、不 fallback，也不定位、读取或扫描 backend 的物理布局。遗留 `.sqlite` 数据不读取、不迁移、不删除，属于当前实现和恢复流程之外；缺少 catalog record 时不得据遗留文件猜测 Meeting 存在。

### Storage Domain ownership and lifecycle

- catalog domain 只保存 `teamId + meetingId` 到 Meeting domain identity 的严格记录；每个 Meeting domain 独立持有 creation、projection、commit、checkpoint 与 pointer records。
- Runtime 只经 `DomainRepositoryRegistry` 打开 catalog 和 Meeting domains；registry 负责缓存、恢复隔离与关闭顺序。
- record schema 拒绝未知字段、危险 map key、digest 冲突、sequence gap 和超过上限的 projection/checkpoint。
- repository close 先排空 mutation/checkpoint maintenance，再关闭 Meeting domain；consumer 全部关闭后 provider 才注销 backend。
- backend 物理布局只属于 `src/storage/`，Meeting repository、Runtime、tools、HTTP 和 client 均不得导入文件系统、backend package 或物理路径规则。

### Repository API

Runtime 只通过以下语义级 API 读写：

完整的 Port、幂等、lease、错误和兼容契约以 [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 为唯一真相源；本设计不复制可能漂移的方法签名。

`updateCreateResult` 只在创建链路首次成功响应前，把首个 planning/Turn 提交后的公开创建结果同步写入 bootstrap 与 `create_meeting` receipt；它不修改领域状态。后续 create replay 必须直接返回该持久结果，不能根据当前 Meeting snapshot 重新合成。

`execute` 是正式会议事实的唯一写入口。它在一个 Repository commit 边界内完成：

1. Runtime 先通过 `RepositoryAuthorizationValidator` 校验真实 caller binding、capability 和当前 attempt；Repository 在 transition 前调用该端口，并校验 `expectedMeetingVersion`。
2. 调用纯 `domain/transitions.ts` 得到新聚合和 effects。
3. 在一条 Domain commit 中写入聚合 patch、不可变 event、幂等 receipt 和 outbox。
4. 单调递增 meeting version 与 event sequence。
5. commit record 持久化成功后返回 `CommittedResult`；提交前不得调用 DSH 或生成成功响应。

`requestId + commandKind + callerBinding` 形成幂等键。相同键和相同 request hash 返回已提交 receipt；相同键但不同 hash 返回冲突。已提交的 message IDs、meeting version 和结果必须来自 receipt，不能重新执行转换。

FR-7 implementation owns the Proposal revision, nested `Position`, immutable Decision candidate, Decision acceptance/disposal, `MeetingIssue.riskLevel`, risk disposition and their caller-specific status projection. `pendingDecisionCandidates` is derived for Captain/local only; `decisionHistory` contains all Decisions while `acceptedDecisions` contains current accepted Decisions. The only Decision events are `decision.accepted`, `decision.superseded` and `decision.revoked`; supersede orders replacement acceptance before superseding the old Decision in one commit. Risk disposition retains all risk facts and uses the existing completion fact event. These facts are projected and archived through the existing `projection/status.ts` and archive service; no second mapper, repository, adapter, or event vocabulary is added.

The sole request serializer is `plugin/src/protocol/request-idempotency.ts::serializeValidatedRequestV1(value: object): string`. It is called only after protocol Schema validation and returns `JSON.stringify(value)` with no crypto, repository canonical JSON, or receipt string changes. Convergence imports this helper after the B contract commit and does not implement another serializer.

### Meeting creation

创建流程固定为：

1. 生成稳定 `meetingId`。
2. 通过 `DomainRepositoryRegistry` 打开对应 Meeting domain，并在 catalog/creation records 中写入 `creating` correlation。
3. 创建 Manager 和 Participant Sessions，并逐个回写不可变 ownership identity。
4. 全部 required Sessions 就绪后，以 seq 1 `create.complete` commit 建立公开 Meeting、event、receipt 和初始 outbox，再发布 catalog/creation `ready`。
5. 若首个 planning/Turn 使用独立 commit 启动，在首次成功响应前以 `create.result` commit 固化最终 create result。

进程在第 2 至 5 步中断时，冷恢复根据 catalog、creation record、Session ownership 和 DSH parent-child/label 共同证明修复归属。Repository 对 `creating` 或 `creation_failed` bootstrap 返回 ownership 但不返回公开 Meeting snapshot，使上层能恢复或安全关闭 Session。没有 catalog record 时 Runtime 不扫描或猜测 backend 物理数据；有 bootstrap record 的 Meeting 必须恢复或进入结构化 `failed`，不能成为部分可用会议。

## Meeting Session Adapter

### Single invocation boundary

所有 meeting-owned AgentSession 操作必须经过 `MeetingSessionAdapter`：

```ts
interface MeetingSessionAdapter {
  createManager(input: CreateManagerSession): Promise<OwnedSession>;
  createParticipant(input: CreateParticipantSession): Promise<OwnedSession>;
  followup(input: AuthorizedFollowup): Promise<DeliveryResult>;
  interrupt(input: AuthorizedInterrupt): Promise<InterruptResult>;
  drain(input: AuthorizedDrain): Promise<DrainResult>;
  inspectOwnedSessions(meetingId: string): Promise<OwnedSessionObservation[]>;
}
```

Meeting Agent Definition resolution 与 per-child DSH preset composition 尚未接线；在 DSH 提供公开且可验证的 per-child preset API 前，`MeetingSessionAdapter` 保持当前创建、followup、interrupt、drain 和 ownership 行为。

禁止其他模块直接调用 DSH subagent `spawn`、`followup`、`interrupt`、`listChildren`、`listDescendants`、`drainContinuableChildren` 或 `drainContinuableDescendants`。

### Capability check

每次 `followup`、`interrupt` 和 `drain` 前，adapter 必须从 Meeting repository 读取并验证：

- `meetingId`、session ID 和会议身份绑定一致；
- capability 状态仍为 active；
- operation、turn/step/attempt 或 mail handling scope 匹配；
- Meeting 状态允许该操作；
- delivery 未被更新 attempt 取代。

检查通过到 DSH 调用之间仍可能发生 revoke，因此 adapter 返回值不能直接成为会议事实。DSH 结果必须通过 Runtime 的新事务再次验证当前 capability；已撤销或迟到结果只记录为被拒绝的 observation。

### Session ownership

Session label 使用：

```text
convivium:meeting-manager:<teamId>:<meetingId>
convivium:meeting-participant:<teamId>:<meetingId>:<participantId>
```

Meeting domain 中的 ownership record 是授权依据，label 只用于冷恢复交叉校验。仅有 label、显示名称或父子关系不足以获得会议 capability。

## Meeting Runtime

### Command pipeline

所有 tool 和 HTTP command 采用同一管线：

```text
decode protocol input
→ resolve real caller
→ load caller-specific authorization context
→ execute repository transaction
→ return committed protocol result
→ asynchronously wake outbox worker
```

HTTP 用户控制入口与 Captain tool 可以映射到同一 domain command，但必须保留不同 caller proof。HTTP handler 不伪造 Captain Session，tool handler 不接受前端用户身份替代真实 DSH caller。

### Turn runner

`TurnRunner` 只串行推进一个 Meeting：

1. claim 一个 planning 或 speaker outbox item；
2. 通过 Session adapter 投递已固化 context；
3. 等待合法提交、超时、interrupt 或 DSH failure observation；
4. 通过 Runtime command 原子提交结果；
5. 重新计算完成、硬限制和下一 step；
6. 当前 turn 完成后才请求下一 Manager plan。

长任务由 Participant 通过 `convivium_create_meeting_task` 创建为 MeetingTask；合法 `submit_turn` 后释放 speaker，任务通过同一 Participant continuable Session 的现有 dispatch/FIFO 执行。任务结果先作为 MeetingState canonical fact 提交，随后由 Runtime 生成 HandRaise 或 evidence，不直接写 transcript 或完成状态。

### Outbox worker

- outbox item 必须有稳定 ID、kind、payload、attempt count、lease owner 和 lease deadline。
- worker 使用有界 batch 和租约 claim，不在 Repository commit 中执行 DSH 调用。
- 成功、可重试失败和终止失败通过独立 commit 提交。
- 进程退出后，过期 lease 可被冷恢复重新领取。
- meeting 级 speaker/manager 失败预算由领域设计控制；Agent 内部 tool failure 不进入该预算。

#### Minimal implementation boundary

- Outbox 由 Convivium Meeting Runtime 和 Meeting Repository 共同拥有；DSH、Storage Domain 和 JSONL backend 只分别提供被调用能力或持久载体，不拥有 outbox 语义。
- V1 只允许 `OUTBOX_KINDS` 已声明的单一 `dispatch` kind。worker 只执行固定链路 `claim -> MeetingSessionAdapter call -> complete`，不得接受任意函数、脚本、tool name、backend operation 或调用方提供的 handler。
- pending item 必须与产生它的 Meeting 状态、event 和 receipt 位于同一个 repository commit；worker 不在 commit 前执行 DSH 调用，也不把调用中的临时结果当作 Meeting 事实。
- 实现只使用当前单 Host 内的一个有界 worker、batch claim、lease/renew、completion 和冷恢复；不增加独立进程、消息 broker、分布式锁、跨 Host 协调、通用 scheduler 或第二条持久化队列。
- `deliveryId` 只提供稳定投递身份和接收端幂等依据，不承诺跨 DSH 与 Repository 的 exactly-once。completion 写入失败时允许同一 `deliveryId` 重投。
- Outbox 不对 Plugin Frontend、Agent 或公共工具暴露 enqueue/inspect/cancel API；业务只能通过已定义的 Meeting command 在 transition 结果中产生 outbox item。
- 新增 kind、独立 consumer、优先级算法、定时任务、callback/hook、metrics framework 或通用重试策略不属于当前实现。只有先更新正式 Interface、指出当前消费者和验收失败，才能扩大该边界。

### Pause, resume and archive

- `pause` 在事务中改变 Meeting 状态并撤销尚未开始的 dispatch capability；运行中的 DSH 调用由 outbox 请求 interrupt。
- `resume` 从最新已提交 Meeting projection 重新计算阻塞条件和下一动作，不复用暂停前未提交的 attempt。
- archive 先提交完整终态 Meeting projection 和 archive projection，再 revoke 全部 meeting capability、drain resident Activation，最后提交 `archived`。
- Markdown 生成始终是 best-effort；失败不阻止 pause、resume、archive 或 Session drain。
- 持久 DSH Session 数据不删除；归档后的不可继续语义由 capability revoke 保证。

## Projection And Frontend

### Status projection

`projection/status.ts` 接收真实 caller authorization 和已提交 snapshot，生成 Interface 定义的 caller-specific projection。它不得读取 Agent 隐藏上下文或未提交 outbox 结果。

### Frontend

- `client/` 通过 `/api/convivium/meetings/:meetingId` 读取完整 projection。
- polling、写成功后的立即 refetch 和页面重新聚焦后的 refetch 整体替换缓存。
- 请求失败时保留带 stale 标记的最后成功 projection，并禁用写操作。
- 暂停和继续按钮调用 Interface 定义的路由，不直接调用 DSH Session 或 Runtime 内部 API。

## Plugin Composition And Lifecycle

`src/index.ts` 的启动顺序：

1. 顶层无依赖 compositor 解析 Config，使其可以在 `storage-domain` 等待 backend 时先激活。
2. 用 `<resolved dataRoot>/storage` 挂载 `src/storage/index.ts#jsonlStoragePlugin` provider child plugin；provider 注册 `convivium-jsonl` backend service。
3. 挂载依赖完整 DSH services 与 `storageDomain` 的 Meeting consumer child plugin；依赖尚未就绪时 consumer 保持 pending，不暴露部分 Meeting 能力。
4. consumer 打开 catalog domain 和 Meeting domains，完成冷恢复，再构造 Meeting Runtime、outbox worker 和 recovery coordinator。
5. consumer 注册 tools、HTTP routes 和 system prompt contribution；Client bundle 由 DSH 根据 package manifest 独立装载。
6. consumer 启动有界 outbox worker。

若步骤 1 至 4 失败，插件加载失败且不暴露部分工具或路由。所有注册动作必须返回 disposer；停止时 consumer 先停止接收新命令、停止 worker、释放租约并关闭 Meeting/catalog domains，随后 provider 注销 backend service、注销 backend name 并关闭介质。停止过程不把进行中 Meeting 改成业务终态，后续启动通过 recovery 继续处理。

## State And Failure Handling

| Failure                                        | Required handling                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Storage mutation conflict                      | 返回可重试冲突或按 expected version 拒绝，不在 Runtime 无限重试       |
| Unknown schema version                         | 隔离该 Meeting 并拒绝恢复                                             |
| DSH unavailable during dispatch                | outbox 保持可重试；Meeting 按领域规则进入 waiting 或 failure          |
| Session created but ownership write failed     | recovery 通过 bootstrap 和 label 关联；无法证明归属时不操作该 Session |
| Delivery succeeded but completion write failed | 使用稳定 delivery ID 重投/查询；提交端幂等 receipt 防止重复 message   |
| Late speaker or manager result                 | 当前 capability 校验失败，记录 rejected observation，不修改正式事实   |
| Markdown generation failed                     | 记录日志并继续；不影响正式状态                                        |
| Required speaker not dispatchable              | 返回 Interface 定义的结构化错误，不自动换人                           |
| Process crash                                  | 回滚未提交事务；恢复过期 lease、未完成 outbox 和非终态 Meeting        |

恢复只通过 catalog discovery 打开已登记的 Meeting domains，不扫描 data root 或 backend 物理路径。单个 Meeting 损坏不得阻止其他 Meeting 的 Agent best-effort 恢复；需要完整一致结果的本地 list 按 Interface 整体失败。全局配置或 DSH capability 缺失则阻止插件加载。

## Security And Observability

- 所有路径由 validated `teamId` 和 `meetingId` 解析，禁止调用方提供任意文件路径。
- repository 不接受未绑定 caller 的通用 JSON patch 或 backend operation。
- 日志必须包含 meeting ID、command/outbox kind、attempt ID 和结构化错误码，不记录隐藏推理、完整私聊或敏感凭据。
- metrics 至少覆盖 active/waiting meetings、outbox backlog、dispatch latency、recovery count、rejected stale submissions 和 repository failures。
- DSH 原生 tool/session events 由 DSH 持有；Convivium 不声明自定义持久化 DSH Session Event。
- Plugin Frontend 不能访问持久化介质、workspace 任意文件或 Session capability token。

## Verification Design

### Test layers

| Test path                   | Minimum coverage                                                                |
| --------------------------- | ------------------------------------------------------------------------------- |
| `tests/unit/domain`         | 状态转换、speaker selection、议题漂移、完成/硬限制顺序、停滞和终止              |
| `tests/unit/repository`     | record schema、commit rollback、version CAS、receipt、checkpoint 和 outbox      |
| `tests/contract`            | 所有 `convivium_*` Schema、caller binding、错误、package manifest 和 projection |
| `tests/integration/dsh`     | create/followup/interrupt/drain、capability revoke 和迟到结果                   |
| `tests/integration/runtime` | 创建、连续 turn、后台任务、mail、暂停/继续和归档                                |
| `tests/recovery`            | 每个事务边界 crash、orphan Session、lease expiry 和重复 delivery                |
| `tests/stress`              | 并发命令、长任务、重复提交、多 Meeting 隔离和冷恢复                             |

Host 测试运行在 Node.js；Client 测试运行在 browser-compatible test environment，分别验证 HTTP controller、locale、组件生命周期和 disposer。测试不得通过导入 Host 实现来伪造 Client contract。

### Package commands

`plugin/package.json` 最终必须提供：

```text
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:recovery
pnpm test:stress
pnpm build
pnpm verify:package
pnpm smoke:profile
pnpm verify
```

`verify` 必须执行类型检查、全部非外部依赖测试、Host/Client 构建和 package contract 检查。`verify:package` 至少检查 exports、`files` allowlist、bundle patch、Client manifest 和实际构建产物一致。`smoke:profile` 必须使用临时 DSH profile 安装当前 package、dump composed config、启动 Host 并确认 Host 与 Client entry 均可解析；不得污染开发者常用 profile。

### Distribution build

插件分发方式仍由 Architecture 决定，但每种方式必须满足对应构建契约：

- npm 或 tarball：发布物必须已经包含 `lib/index.js`、`lib/client.js` 和 `lib/types/**`，消费者安装时不依赖源码构建。
- Git dependency：package 必须提供自包含 `prepare` 构建，不能依赖相邻 DSH checkout、仓库外绝对路径或只存在于开发环境的 TypeScript project references；文档必须说明 pnpm 10 `allowBuilds` 授权和按 commit pin 安装。

选择 Git dependency 时，`prepare` 只负责从已下载源码生成可加载产物，不替代 CI 中的 typecheck 和 test。无论采用哪种分发方式，`smoke:profile` 都必须验证用户实际安装路径，而不只验证源码目录内直接 import。

## Implementation Order

以下顺序只表达依赖关系，不表示可省略的发布阶段；完整实现必须覆盖全部项：

1. 固化协议 Schema、domain model、纯 transitions 和错误映射。
2. 实现 Storage Domain record schema、repository commit、receipt、checkpoint 和 outbox。
3. 实现 caller resolver、MeetingSessionAdapter 和 TaskAdapter。
4. 实现 Meeting Runtime、TurnRunner、OutboxWorker、MailProcessor 和 Recovery。
5. 建立 Host/Client 双入口、package manifest、bundle patch 和 lifecycle disposer，再注册全部 tools 与 HTTP routes。
6. 实现 status、Markdown 和 archive projection。
7. 实现 Plugin Frontend 状态读取及暂停/继续控制，并通过独立 Client 构建和测试。
8. 完成 contract、integration、recovery、stress、package contract 和临时 DSH profile smoke 验证。

实现过程中不得用临时 JSON 状态、绕过 adapter 的直接 DSH 调用或不带事务的双写作为过渡实现进入主分支。

## Acceptance

本文设计满足以下条件时可作为无歧义实现依据：

1. 每个产品职责都有唯一源码目录和依赖方向。
2. Storage Domain record schema、commit/checkpoint、catalog lifecycle 和 repository API 已确定。
3. 所有 meeting-owned Session 操作只能经过统一 adapter 和 capability 检查。
4. tool、HTTP、worker 和 recovery 共享同一个 Runtime/Repository 写入口。
5. 创建中断、迟到结果、重复投递、暂停恢复和归档都有确定处理路径。
6. Markdown、Plugin Frontend 和 DSH Session Event 都不能成为会议事实写入口。
7. 验证目录和命令能够覆盖成功、失败、权限、恢复和压力边界。
8. 文档不依赖或承诺兼容任何外部参考项目实现。
9. package manifest、Host/Client exports、构建产物、bundle patch 和 DSH browser roster 声明相互一致。
10. 至少一种选定分发方式通过临时 DSH profile 的真实安装与启动验证。
