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
  create(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>>
  read(): Promise<MeetingSnapshot>
  execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>
  claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>
  completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>
  recover(input: RecoverInput): Promise<RecoveryResult>
  close(): Promise<void>
}
```

`create` 是 bootstrap 专用写入口；Meeting 创建、`meeting.created`、初始 receipt 和初始 outbox 必须在同一 SQLite 事务中完成。创建请求与普通 command 使用相同的幂等规则。

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

幂等键为 `requestId + commandKind + callerBinding`，`requestHash` 是规范化请求内容的 hash。

- 相同幂等键和相同 hash：返回原 receipt，不再次运行 transition。
- 相同幂等键和不同 hash：返回 `IDEMPOTENCY_CONFLICT`。
- receipt 必须保存 result、meetingVersion、message IDs 和创建时间。

### Events and sequence

`DomainEventInput.type` 必须来自集中注册的 `MeetingEventType`；Repository 负责写入 `eventSeq`、提交后的 `meetingVersion` 和时间戳。单个事务的事件序号连续递增，事务内顺序与输入顺序一致。校验失败、回滚和幂等命中不新增领域事件。

### Outbox

每个 outbox item 具有稳定 `id`、`deliveryId`、`kind`、JSON payload、attempt count、状态、lease owner、lease token、lease deadline、retry time 和最后错误。claim 在事务内原子取得 lease；completion 必须带回同一 owner/token，且当前时间严格早于 lease deadline。过期或旧 lease 的 completion 返回 `LEASE_LOST`，不得覆盖新 worker 的状态。

外部调用不在 SQLite 事务内执行。成功、可重试失败和终止失败都通过独立事务完成；相同 `deliveryId` 重投不得产生重复领域事实。

### Recovery

`recover` 只处理当前 Meeting 数据库：回收过期 lease，并返回当前 snapshot、bootstrap record 和已证明的 Session ownership。workspace 目录扫描、跨 Meeting 隔离和 DSH orphan Session 处理属于上层 `RecoveryCoordinator`，不由 Repository 隐式完成。

### Schema and migration

`schema.ts` 是完整当前 DDL 真相源，`PRAGMA user_version` 是已应用版本。migration 必须连续前进，并与 version 更新处于同一事务；未知新版本、降级和 migration 失败都拒绝打开当前 Meeting。

当前 schema 至少包含：`meetings`、`meeting_events`、`idempotency_receipts`、`outbox`、`meeting_bootstrap` 和 `session_ownership`。JSON 字段必须带稳定对象结构，由上层 transition 负责领域 schema 校验。空库才可从 `user_version=0` 初始化；非空 version-zero 数据库必须隔离，不得用 `CREATE TABLE IF NOT EXISTS` 猜测其结构。

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
