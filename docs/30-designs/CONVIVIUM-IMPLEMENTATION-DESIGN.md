# Convivium Implementation Design

## Purpose

本文定义 Convivium 独立 DSH 插件的源码落点、模块职责、依赖方向、持久化入口、DSH adapter、启动恢复和验证结构。本文解决“实现放在哪里、模块如何协作、哪些入口必须唯一”的问题；会议业务规则和跨边界字段分别以 Requirements、Protocol Interface 和 Meeting Orchestration Design 为准。

## Scope And Non-goals

### Scope

- `plugin/` 内唯一产品工程的目录和构建边界。
- Meeting domain、SQLite repository、Meeting Runtime、DSH adapter、HTTP、projection 和 client 的依赖关系。
- SQLite driver、schema migration、事务入口和连接生命周期。
- 所有 meeting-owned AgentSession 的统一调用和 capability revoke 检查入口。
- 插件启动、创建、运行、暂停、恢复、归档和冷恢复的代码协作顺序。
- 单元、契约、集成、恢复和压力验证的源码位置及最低覆盖。

### Non-goals

- 不重复定义协议输入、输出和错误字段。
- 不修改会议状态机、议题控制、完成判断和终止语义。
- 不规定 Agent 内部 Prompt、Skills、Tools、MCP 或执行流程。
- 不建立独立服务、通用 Agent 平台或脱离 DSH 的运行模式。
- 不导入、派生或兼容外部参考项目的源码、协议和持久化格式。

## Related Requirements And Interfaces

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)

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
    └── smoke-profile.mjs
```

`src/index.ts` 只负责解析配置、构造依赖、注册 DSH 插件能力和绑定 disposer。业务转换不得直接写在插件入口、HTTP handler 或 tool handler 中。

### Package topology and build faces

Convivium 是一个职责闭合的树外 DSH bundle，因此保持单 package，不复制 DSH 仓库内部的 `packages/<group>/<pkg>` monorepo 布局。只有出现能够独立演进、独立发布且具有稳定 service definition/provider 边界的第二项能力时，才可以提出拆包设计。

同一个 package 提供两个构建面：

| Face | Source entry | Published entry | Runtime |
|---|---|---|---|
| Host | `src/index.ts` | `lib/index.js`、`lib/types/index.d.ts` | DSH Host / Node.js |
| Client | `src/client/index.tsx` | `lib/client.js`、`lib/types/client/index.d.ts` | DSH Web Client / Browser |

`package.json` MUST：

- 通过 `dsh.bundle.patch` 指向 `cordis.patch.yml`；package 是 bundle，不是 profile，仓库不得维护用户 profile manifest。
- 同时导出 `.`、`./client`、`./cordis.patch.yml` 和 `./package.json`。
- 声明 `dsh.client.platform = "web"`，并在 `dsh.client.inject` 中列出 Client 启动所需的 DSH client packages。
- 使用 `files` allowlist 只发布 Host bundle、Client bundle、类型声明、patch、README 和必要资产。
- 将 Cordis、React 和 DSH 共享 runtime identity 声明为 peer；构建、类型检查和测试所需版本同时出现在 dev dependencies。只由插件内部使用且不要求与 Host 共享 identity 的库使用普通 dependency。

构建分为两个明确步骤：TypeScript 生成 `lib/types/**` 声明和构建中间 JavaScript，`tsdown` 生成 `lib/index.js` 与 `lib/client.js`。Client 构建使用独立 `tsconfig.client.json`，不得把 Node.js、SQLite、workspace 文件系统或 Host-only DSH service 打入浏览器 bundle。

`cordis.patch.yml` 只插入稳定 row ID `convivium` 并按 package name 加载 Host entry。Client entry 由 `package.json.dsh.client` 进入 DSH browser roster，不在 Host `apply()` 中手工加载或注册。

### Dependency direction

```text
client ──> protocol
client ──HTTP contract──> http ──> runtime ──> domain
                               │       │
tools ──> protocol             │       ├──> repository
tools ──caller context─────────┘       ├──> dsh
                                       └──> projection

repository ──> domain types
dsh        ──> domain ports
projection ──> domain read models + protocol projections
protocol   ──> no infrastructure or domain module
domain     ──> no infrastructure module
```

依赖规则：

1. `protocol/` 只保存 Host/Client 共享的 transport-neutral 类型、常量和无副作用 codec，不导入 domain 或 infrastructure。
2. `domain/` 不导入 protocol、DSH、SQLite、HTTP、React 或文件系统模块。
3. `repository/` 不调用 DSH，也不选择 speaker 或判断会议完成。
4. `dsh/` 只实现 Runtime 所需 port，不写 Meeting 领域状态。
5. `tools/` 和 `http/` 只做 transport 解析、caller binding、调用 Runtime 和结果编码。
6. `client/` 只使用 `protocol/` 定义的 Web projection，不导入 host 代码、domain aggregate 或数据库类型。
7. `projection/` 只能读取已提交事实并映射为 protocol projection；Markdown 和 UI projection 都不能反向驱动状态转换。

### Module map

| Path | Required responsibility |
|---|---|
| `src/config.ts` | 插件配置 Schema、默认值和启动期能力检查 |
| `src/protocol/*` | Interface 对应的 Host/Client 共享 transport 类型、常量和无副作用 codec |
| `src/domain/model.ts` | Meeting 聚合、值对象和领域 read model |
| `src/domain/transitions.ts` | 唯一领域状态转换集合 |
| `src/domain/planning.ts` | candidate filtering、selection mode、turn plan 校验 |
| `src/domain/completion.ts` | 完成事实、停滞和终止派生计算 |
| `src/domain/errors.ts` | 内部领域错误分类；由 transport 映射为协议错误 |
| `src/repository/schema.ts` | 当前完整 DDL、索引和 schema version |
| `src/repository/migrations.ts` | 线性、事务化、不可跳级的 migration registry |
| `src/repository/meeting-repository.ts` | 事务、聚合读写、receipt、event 和 outbox 原子提交 |
| `src/repository/meeting-locator.ts` | `teamId/meetingId` 路径解析和目录所有权检查 |
| `src/runtime/meeting-runtime.ts` | 所有公开命令的唯一应用服务入口 |
| `src/runtime/turn-runner.ts` | Manager plan、逐 speaker dispatch、submit 和下一 step 推进 |
| `src/runtime/outbox-worker.ts` | 提交后 DSH 副作用、重投和结果回写 |
| `src/runtime/mail-processor.ts` | meeting-scoped mail context 固化和独立处理 attempt |
| `src/runtime/recovery.ts` | 冷启动扫描、租约回收、outbox 恢复和 orphan 归属修复 |
| `src/runtime/archive.ts` | 终态快照、capability revoke、Activation drain 和 archived commit |
| `src/dsh/session-adapter.ts` | meeting-owned Session 创建、followup、interrupt、drain 和枚举 |
| `src/dsh/task-adapter.ts` | 受控 Captain 路径创建、关联和读取 TeamTask fact |
| `src/dsh/caller-resolver.ts` | 将真实 DSH caller Session 解析为 Captain、Manager 或 Participant |
| `src/tools/register-tools.ts` | 注册 `convivium_*` 工具并绑定协议 Schema |
| `src/http/register-routes.ts` | 注册 `/api/convivium/*` 并绑定用户授权 |
| `src/projection/status.ts` | caller-specific Meeting status projection |
| `src/projection/markdown.ts` | SQLite 到开发者 Markdown 的 best-effort 单向生成 |
| `src/client/*` | 状态读取、暂停/继续控制和会议 UI |

上述文件可以在实现增长后拆分，但不得跨越职责边界或创建第二个 Meeting 写入口。

## SQLite Repository

### Driver and connection model

- 使用 Node.js 内置 `node:sqlite`，不引入原生第三方 SQLite driver。
- 每个 `<workspace>/.convivium/<teamId>/meetings/<meetingId>/meeting.sqlite` 使用独立连接。
- repository 在单次命令或 worker lease 内独占连接；完成后关闭，不维护跨 workspace 的全局长连接池。
- 打开数据库后必须执行 `PRAGMA foreign_keys = ON`、`PRAGMA journal_mode = WAL` 和有界 `busy_timeout`。
- 所有写事务使用 `BEGIN IMMEDIATE`，先取得写锁再读取 expected version，避免读后升级锁产生竞态。
- SQLite 同步 API 只能存在于 `repository/`，Runtime 不直接持有数据库对象。

Convivium 支持的最低 Node 版本必须覆盖所用 `node:sqlite` API。插件启动时如果运行时缺失该模块或所需方法，必须以结构化启动错误失败，不能切换到 JSON 或内存状态。

### Schema ownership and migration

`schema.ts` 是完整 DDL 的代码真相源，`PRAGMA user_version` 是已应用 schema version。`migrations.ts` 按连续整数登记 migration：

```ts
interface Migration {
  from: number
  to: number
  apply(db: SqliteConnection): void
}
```

规则：

1. 新数据库在一个事务中创建完整当前 schema 并设置 `user_version`。
2. 旧数据库只允许逐版本前进，不允许跳级、降级或猜测未知版本。
3. migration 与目标 `user_version` 更新必须处于同一事务。
4. migration 失败回滚并阻止该 Meeting 恢复，不影响其他 Meeting。
5. 测试必须覆盖空库创建、每个相邻版本升级、重复打开和未知新版本拒绝。

### Repository API

Runtime 只通过以下语义级 API 读写：

完整的类型、幂等、lease、错误和 migration 契约见
`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`。本设计只保留模块边界和事务约束。

```ts
interface MeetingRepository {
  create(input: CreateMeetingRecord): Promise<MeetingSnapshot>
  read(meetingId: string): Promise<MeetingSnapshot>
  execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>
  claimOutbox(batchSize: number, lease: WorkerLease): Promise<OutboxItem[]>
  completeOutbox(result: OutboxCompletion): Promise<void>
  recover(now: number): Promise<RecoverySnapshot>
  close(): Promise<void>
}
```

`execute` 是正式会议事实的唯一写入口。它在一个事务中完成：

1. Runtime 先通过 `RepositoryAuthorizationValidator` 校验真实 caller binding、capability 和当前 attempt；Repository 在 transition 前调用该端口，并校验 `expectedMeetingVersion`。
2. 调用纯 `domain/transitions.ts` 得到新聚合和 effects。
3. 写入聚合状态、不可变 `meeting_events`、幂等 receipt 和 outbox。
4. 单调递增 meeting version 与 event sequence。
5. `COMMIT` 后返回 `CommittedResult`；提交前不得调用 DSH 或生成成功响应。

`requestId + commandKind + callerBinding` 形成幂等键。相同键和相同 request hash 返回已提交 receipt；相同键但不同 hash 返回冲突。已提交的 message IDs、meeting version 和结果必须来自 receipt，不能重新执行转换。

### Directory creation

创建流程固定为：

1. 生成稳定 `meetingId`。
2. 原子创建 Meeting 独立目录。
3. 创建 SQLite 并提交 bootstrap record。
4. 通过 outbox 创建 Manager 和 Participant Sessions。
5. Session 创建成功后回写 ownership；全部 required Sessions 就绪后会议才可进入 `running`。

进程在第 2 至 5 步中断时，冷恢复根据 bootstrap record 和 Session label 修复归属。不存在 bootstrap record 的空目录可以清理；有 bootstrap record 的 Meeting 必须恢复或进入结构化 `failed`，不能成为部分可用会议。

## Meeting Session Adapter

### Single invocation boundary

所有 meeting-owned AgentSession 操作必须经过 `MeetingSessionAdapter`：

```ts
interface MeetingSessionAdapter {
  createManager(input: CreateManagerSession): Promise<OwnedSession>
  createParticipant(input: CreateParticipantSession): Promise<OwnedSession>
  followup(input: AuthorizedFollowup): Promise<DeliveryResult>
  interrupt(input: AuthorizedInterrupt): Promise<InterruptResult>
  drain(input: AuthorizedDrain): Promise<DrainResult>
  inspectOwnedSessions(meetingId: string): Promise<OwnedSessionObservation[]>
}
```

禁止其他模块直接调用 DSH subagent `spawn`、`followup`、`interrupt`、`listChildren`、`listDescendants`、`drainContinuableChildren` 或 `drainContinuableDescendants`。

### Capability check

每次 `followup`、`interrupt` 和 `drain` 前，adapter 必须从 SQLite 读取并验证：

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

SQLite ownership record 是授权依据，label 只用于冷恢复定位和交叉校验。仅有 label、显示名称或父子关系不足以获得会议 capability。

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

长任务由 `TaskAdapter` 转为后台 TeamTask并释放 speaker。任务结果先作为 DSH-owned observation 进入 Runtime，验证绑定后创建 HandRaise 或 evidence，不直接写 transcript 或完成状态。

### Outbox worker

- outbox item 必须有稳定 ID、kind、payload、attempt count、lease owner 和 lease deadline。
- worker 使用有界 batch 和租约 claim，不在数据库事务中执行 DSH 调用。
- 成功、可重试失败和终止失败通过独立事务提交。
- 进程退出后，过期 lease 可被冷恢复重新领取。
- meeting 级 speaker/manager 失败预算由领域设计控制；Agent 内部 tool failure 不进入该预算。

### Pause, resume and archive

- `pause` 在事务中改变 Meeting 状态并撤销尚未开始的 dispatch capability；运行中的 DSH 调用由 outbox 请求 interrupt。
- `resume` 从最新 SQLite 事实重新计算阻塞条件和下一动作，不复用暂停前未提交的 attempt。
- archive 先生成完整终态 SQLite snapshot 和 archive projection，再 revoke 全部 meeting capability、drain resident Activation，最后提交 `archived`。
- Markdown 生成始终是 best-effort；失败不阻止 pause、resume、archive 或 Session drain。
- 持久 DSH Session 数据不删除；归档后的不可继续语义由 capability revoke 保证。

## Projection And Frontend

### Status projection

`projection/status.ts` 接收真实 caller authorization 和已提交 snapshot，生成 Interface 定义的 caller-specific projection。它不得读取 Agent 隐藏上下文或未提交 outbox 结果。

### Developer Markdown

- `projection/markdown.ts` 从 SQLite snapshot 生成单份人类可读文档。
- 文件位于 Meeting 自有目录，只用于开发和诊断。
- 生成失败只记录日志；文件缺失、陈旧或被人工修改都不触发修复事务。
- Markdown 不提供 HTTP 接口，也不按 caller 生成权限投影。

### Frontend

- `client/` 通过 `/api/convivium/meetings/:meetingId` 读取完整 projection。
- polling、写成功后的立即 refetch 和页面重新聚焦后的 refetch 整体替换缓存。
- 请求失败时保留带 stale 标记的最后成功 projection，并禁用写操作。
- 暂停和继续按钮调用 Interface 定义的路由，不直接调用 DSH Session 或 Runtime 内部 API。

## Plugin Composition And Lifecycle

`src/index.ts` 的启动顺序：

1. 解析 Config 并检查 Node、DSH service 和 SQLite capability。
2. 构造 locator、repository factory 和 DSH adapters。
3. 构造 Meeting Runtime、outbox worker 和 recovery coordinator。
4. 完成 schema 检查与冷恢复扫描。
5. 注册 tools、HTTP routes 和 system prompt contribution；Client bundle 由 DSH 根据 package manifest 独立装载。
6. 启动有界 outbox worker。

若步骤 1 至 4 失败，插件加载失败且不暴露部分工具或路由。所有注册动作必须返回 disposer；插件停止时先停止接收新命令，再停止 worker、释放租约和连接，最后注销 routes/tools。停止过程不把进行中 Meeting 改成业务终态，后续启动通过 recovery 继续处理。

## State And Failure Handling

| Failure | Required handling |
|---|---|
| SQLite busy | 在 `busy_timeout` 后返回可重试错误，不在 Runtime 无限重试 |
| Unknown schema version | 隔离该 Meeting 并拒绝恢复 |
| DSH unavailable during dispatch | outbox 保持可重试；Meeting 按领域规则进入 waiting 或 failure |
| Session created but ownership write failed | recovery 通过 bootstrap 和 label 关联；无法证明归属时不操作该 Session |
| Delivery succeeded but completion write failed | 使用稳定 delivery ID 重投/查询；提交端幂等 receipt 防止重复 message |
| Late speaker or manager result | 当前 capability 校验失败，记录 rejected observation，不修改正式事实 |
| Markdown generation failed | 记录日志并继续；不影响正式状态 |
| Required speaker not dispatchable | 返回 Interface 定义的结构化错误，不自动换人 |
| Process crash | 回滚未提交事务；恢复过期 lease、未完成 outbox 和非终态 Meeting |

恢复扫描只读取 `.convivium` 下能通过 locator 校验的 Meeting 目录。单个 Meeting 损坏不得阻止其他 Meeting 恢复；全局配置或 DSH capability 缺失则阻止插件加载。

## Security And Observability

- 所有路径由 validated `teamId` 和 `meetingId` 解析，禁止调用方提供任意文件路径。
- repository 不接受未绑定 caller 的通用 JSON patch 或 SQL。
- 日志必须包含 meeting ID、command/outbox kind、attempt ID 和结构化错误码，不记录隐藏推理、完整私聊或敏感凭据。
- metrics 至少覆盖 active/waiting meetings、outbox backlog、dispatch latency、recovery count、rejected stale submissions 和 repository failures。
- DSH 原生 tool/session events 由 DSH 持有；Convivium 不声明自定义持久化 DSH Session Event。
- Plugin Frontend 不能访问 SQLite、workspace 任意文件或 Session capability token。

## Verification Design

### Test layers

| Test path | Minimum coverage |
|---|---|
| `tests/unit/domain` | 状态转换、speaker selection、议题漂移、完成/硬限制顺序、停滞和终止 |
| `tests/unit/repository` | DDL、migration、事务回滚、version CAS、receipt 和 outbox |
| `tests/contract` | 所有 `convivium_*` Schema、caller binding、错误、package manifest 和 projection |
| `tests/integration/dsh` | create/followup/interrupt/drain、capability revoke 和迟到结果 |
| `tests/integration/runtime` | 创建、连续 turn、后台任务、mail、暂停/继续和归档 |
| `tests/recovery` | 每个事务边界 crash、orphan Session、lease expiry 和重复 delivery |
| `tests/stress` | 并发命令、长任务、重复提交、多 Meeting 隔离和冷恢复 |

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
2. 实现 SQLite schema、migration、repository transaction、receipt 和 outbox。
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
2. SQLite driver、schema version、migration、事务和 repository API 已确定。
3. 所有 meeting-owned Session 操作只能经过统一 adapter 和 capability 检查。
4. tool、HTTP、worker 和 recovery 共享同一个 Runtime/Repository 写入口。
5. 创建中断、迟到结果、重复投递、暂停恢复和归档都有确定处理路径。
6. Markdown、Plugin Frontend 和 DSH Session Event 都不能成为会议事实写入口。
7. 验证目录和命令能够覆盖成功、失败、权限、恢复和压力边界。
8. 文档不依赖或承诺兼容任何外部参考项目实现。
9. package manifest、Host/Client exports、构建产物、bundle patch 和 DSH browser roster 声明相互一致。
10. 至少一种选定分发方式通过临时 DSH profile 的真实安装与启动验证。
