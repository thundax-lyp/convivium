# SQLite Repository Interface

## Purpose

本文定义 Meeting Runtime 与单个 Meeting SQLite 数据库之间的类型化持久化契约。SQLite 是 Meeting 领域事实的唯一持久化路径；本文不定义 DSH Session Event、HTTP route 或前端 projection。

## Boundary And Ownership

- `MeetingRepository` 只服务一个已验证的 `teamId + meetingId`，不接受任意文件路径、SQL 或通用 JSON patch。
- Repository 负责连接、schema migration、聚合快照、领域事件、幂等 receipt 和 outbox 的原子持久化。
- Domain transition 由 Runtime 提供纯函数；Repository 不选择 speaker、不调用 DSH、不执行外部副作用。
- Runtime 通过 `RepositoryAuthorizationValidator` 验证真实 caller、会议 capability 和当前 attempt；Repository 只接受已带 `CommandAuthorization` 的 command，并在 transition 前调用该验证端口。
- Repository 的所有公开方法返回 Promise，但 SQLite 调用只发生在 `repository/` 模块内。

## Transport Or Invocation

```ts
interface MeetingRepository {
  readonly teamId: string
  readonly meetingId: string
  create(input: CreateMeetingInput): Promise<MeetingBootstrap>
  completeCreate(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>>
  updateCreateResult(input: UpdateCreateResultInput): Promise<CreateMeetingResult>
  updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>
  recordSessionOwnership(input: SessionOwnershipInput): Promise<SessionOwnership>
  read(): Promise<MeetingSnapshot>
  execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>
  claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>
  completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>
  recover(input: RecoverInput): Promise<RecoveryResult>
  close(): Promise<void>
}
```

`create` 是 bootstrap 专用写入口：它先实时校验当前 caller，然后持久化 `creating` bootstrap、`createRequestId` 与 `requestHash`，但不创建公开 Meeting、领域事件或成功 receipt。Bootstrap 只保存创建 correlation，不保存 caller ownership；Runtime 可以安全创建并通过 `recordSessionOwnership` 记录 DSH Session ownership。崩溃恢复可据此识别未完成创建，且不能把它当作可运行 Meeting。`updateBootstrap` 只允许把 `creating` 转为 `creation_failed`，并保留安全失败码。

全部必需 Session 已创建后，Runtime 使用同一原始创建输入调用 `completeCreate`。该方法重新校验当前 caller，在一个 SQLite 事务中创建 `meetings`、写入 `meeting.created`、初始 outbox 和成功 receipt，保存 `createResult` 并把 bootstrap 转为 `ready`。不要求当前 caller 与 `create` caller 相同；只有 `completeCreate` 当前 caller 通过授权校验且 request ID/hash 匹配时才能创建公开 Meeting。只有 `ready` bootstrap 对应公开 Meeting；`creation_failed` 不生成公开 Meeting。重复 `create` 只接受相同 request ID/hash，重复 `completeCreate` 返回原 receipt。

若首个 Turn 或 Manager planning 在 `completeCreate` 后由独立领域事务启动，Runtime 必须在首次成功响应前调用 `updateCreateResult`，以当前 Meeting version 原子替换 bootstrap 和 `create_meeting` receipt 中的公开结果。该方法不修改 MeetingState、不新增领域事件或 outbox，只允许 `ready` Meeting 且要求 `result.meetingId`、`result.meetingVersion` 与当前快照完全一致。崩溃重试可以幂等补齐启动事务和该结果；已经返回给 caller 的创建结果后续必须原样重放，不得用当前状态重新合成。

## Data And State Contract

### Command and transition

```ts
interface RepositoryCommand<T> {
  requestId: string
  commandKind: string
  authorization: CommandAuthorization
  requestHash: string
  expectedMeetingVersion: number
  transition: (snapshot: MeetingSnapshot) => TransitionResult<T>
}

interface TransitionResult<T> {
  state: JsonObject
  result: T
  events: DomainEventInput[]
  outbox: OutboxInput[]
}
```

`execute` 使用 `BEGIN IMMEDIATE`，先获取写锁再读取 version。成功时一次性提交 `state_json`、`meetings.version`、events、receipt 和 outbox；任一写入失败全部回滚。transition 不得执行 DSH、文件写入或其他外部副作用。

`CommandAuthorization` 至少包含稳定 `callerBinding`、capability ID 和可选 attempt ID。重复请求仍先验证真实 caller binding；只有验证通过的相同 caller 才可读取原 receipt。

### Idempotency

幂等键为 `requestId + commandKind + callerBinding`，其中 `requestId` 是调用方提供的稳定幂等身份；`requestHash` 是规范化请求内容的 hash。`attemptId`、`planningAttemptId` 等领域对象 ID 不参与 receipt 查询，也不要求 Repository 提供按这些 ID 反查提交结果的能力。

- 相同幂等键和相同 hash：返回原 receipt，不再次运行 transition。
- 相同幂等键和不同 hash：返回 `IDEMPOTENCY_CONFLICT`。
- 相同 `requestId` 在不同领域 attempt 标识下仍由 command kind 和 caller binding 区分；同一幂等键不得产生第二份提交。
- receipt 必须保存 result、meetingVersion、message IDs 和创建时间。

### Events and sequence

`DomainEventInput.type` 必须来自集中注册的 `MeetingEventType`；每个改变 Meeting 状态的成功 transition 至少提供一个 event，Repository 负责写入 `eventSeq`、提交后的 `meetingVersion` 和时间戳。单个事务的事件序号连续递增，事务内顺序与输入顺序一致。校验失败、回滚和幂等命中不新增领域事件。

### Outbox

每个 outbox item 具有稳定 `id`、`deliveryId`、集中注册的 `kind`（当前为 `dispatch`）、JSON payload、attempt count、状态、lease owner、lease token、lease deadline、retry time 和最后错误。Repository 在写入和 lease 前拒绝未注册 kind；claim 在事务内原子取得 lease；completion 必须带回同一 owner/token，且当前时间严格早于 lease deadline。过期或旧 lease 的 completion 返回 `LEASE_LOST`，不得覆盖新 worker 的状态。

外部调用不在 SQLite 事务内执行。成功、可重试失败和终止失败都通过独立事务完成；相同 `deliveryId` 重投不得产生重复领域事实。

### Recovery

`open` 必须在 migration 和任何持久 PRAGMA（包括 `journal_mode`）前对已知 schema 只读验证数据库中仅有一个 Meeting，且 `teamId`、`meetingId`、bootstrap ID 与所有完整解析的 Session ownership label 一致；不一致时以 `CORRUPT_DATABASE` 隔离且不得写入该数据库。Session ownership 的 session ID、parent session ID、provider、label、role 与 participant identity 首次写入后不可变；只允许首次补写稳定 `initialMessageId`、生命周期前进（`provisioning → active → closed`）和 capability 的不可逆 revoke。`read` 与其他公开方法把损坏 JSON 或 SQLite 数据统一映射为带当前 `meetingId` 的非重试 `CORRUPT_DATABASE`。`recover` 只处理当前 Meeting 数据库：回收过期 lease，并返回带创建 correlation 的 bootstrap record 和已证明的 Session ownership。只有 `ready` bootstrap 才返回公开 Meeting `snapshot`；`creating` 或 `creation_failed` 返回时不得包含 snapshot，使上层 `RecoveryCoordinator` 能恢复或安全关闭中断创建的 Session。workspace 目录扫描、跨 Meeting 隔离和 DSH orphan Session 处理属于上层 `RecoveryCoordinator`，不由 Repository 隐式完成。

`SessionOwnershipInput` 的 `sessionLabel` 只接受以下稳定格式：

```text
convivium:meeting-manager:<teamId>:<meetingId>
convivium:meeting-participant:<teamId>:<meetingId>:<participantId>
```

`SessionOwnership` 和 `SessionOwnershipInput` 使用以下字段；Repository 实现不得另建同义 ownership 结构：

```ts
interface SessionOwnership {
  sessionId: string
  parentSessionId: string
  sessionLabel: string
  provider: string
  initialMessageId?: string
  role: 'manager' | 'participant'
  participantId?: string
  lifecycleStatus: 'provisioning' | 'active' | 'closed'
  capabilityStatus: 'active' | 'revoked'
  createdAt: number
  updatedAt: number
}
```

`parentSessionId` 是创建 meeting-owned Session 时使用的精确 DSH direct parent Session；当前会议树中必须等于创建会议的 Captain Session。`provider` 是首次创建时解析的 continuable provider name。两者与 `sessionId`、`sessionLabel`、`role`、`participantId` 一样，首次写入后不可修改。

Runtime 可以在调用 `startContinuable()` 前使用 caller-reserved `sessionId` 写入 `provisioning` ownership。DSH 接受首次 prompt 后，Runtime 把返回的 `initialMessageId` 写入同一 ownership 并将 lifecycle 前进为 `active`；`initialMessageId` 只允许从缺失变为一个稳定值，写入后不可修改。恢复只能通过 `parentSessionId`、DSH 持久 parent-child 关系、完整 label、当前 locator identity 和 SQLite identity 的共同证明操作 Session；目标目录迁移完成后 locator identity 还必须包含 Meeting 目录名。

### Schema and migration

`schema.ts` 是完整当前 DDL 真相源，`PRAGMA user_version` 是已应用版本。migration 必须连续前进，并与 version 更新处于同一事务；未知新版本、降级和 migration 失败都拒绝打开当前 Meeting。

当前 schema 至少包含：`meetings`、`meeting_events`、`idempotency_receipts`、`outbox`、`meeting_bootstrap` 和 `session_ownership`。`meeting_bootstrap` 是创建前唯一允许不引用公开 Meeting 的根记录；预创建 session ownership 与 outbox 通过 `meeting_bootstrap.meeting_id` 关联。`session_ownership` 以 `sessionId` 仅更新生命周期、capability 和首次 `initialMessageId`，同时保留不可变的 parent、provider、identity 和创建时间。JSON 字段必须带稳定对象结构，由上层 transition 负责领域 schema 校验。空库直接使用当前 DDL 初始化为当前 `user_version`；非空 version-zero 数据库必须隔离，不得用 `CREATE TABLE IF NOT EXISTS` 猜测其结构；已发布版本只能执行不可变的相邻 migration。

## Error And Permission Semantics

Repository 错误必须使用结构化 `RepositoryError`，至少区分：`MEETING_NOT_FOUND`、`VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`CONSTRAINT_VIOLATION`、`INVALID_INPUT`、`SQLITE_BUSY`、`SCHEMA_VERSION_UNSUPPORTED`、`CORRUPT_DATABASE`、`LEASE_LOST`、`INVALID_STATE` 和 `CLOSED`。

每个错误包含 `code`、`retryable` 和 `meetingId`；错误不会把 SQLite 原始路径或敏感 payload 返回给调用方。`SQLITE_BUSY` 在有界 `busy_timeout` 后返回可重试错误；schema 或数据损坏只隔离当前 Meeting。

## Compatibility

- 只使用 Node.js 内置 `node:sqlite`，不引入原生第三方 driver。
- 新增 event/outbox kind 必须先更新类型注册和 migration/兼容说明，不能用任意字符串静默扩展。
- Schema 只允许连续向前 migration；不支持自动降级或未知版本猜测。

## Related Documents

- `docs/00-governance/ARCHITECTURE.md`
- `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
