# Meeting Storage Interface

## Purpose

本文定义 Convivium Meeting Repository 在 Storage Domain 上的稳定行为、持久 record、原子 commit、恢复和错误边界。DSH backend 的物理 JSONL 格式不属于本接口。

## Boundary And Ownership

- `MeetingRepositoryPort` 只服务一个已验证的 `teamId + meetingId`，不接受任意文件路径、SQL 或通用 JSON patch；链路为 DSH profile -> storage hub -> child backend `convivium-jsonl` -> Storage Domain -> repository。
- Repository 负责打开并关闭一个 Meeting Domain，把聚合快照、领域事件、幂等 receipt、outbox、Session ownership 和 private mail 作为一个可恢复 projection 原子推进。
- Domain transition 由 Runtime 提供纯函数；Repository 不选择 speaker、不调用 DSH、不执行外部副作用。
- Runtime 通过 `RepositoryAuthorizationValidator` 验证真实 caller、会议 capability 和当前 attempt；Repository 只接受已带 `CommandAuthorization` 的 command，并在 transition 前调用该验证端口。
- Repository 的所有公开方法返回 Promise；它只消费 `@deepseek-ai/dsh-storage-domain`，不依赖 backend、文件、SQL、物理路径或介质布局。

## Repository Port

```ts
export interface MeetingRepositoryPort {
  readonly teamId: string;
  readonly meetingId: string;
  create(input: CreateMeetingInput): Promise<MeetingBootstrap>;
  completeCreate(
    input: CreateMeetingInput,
  ): Promise<CommittedResult<CreateMeetingResult>>;
  updateCreateResult(
    input: UpdateCreateResultInput,
  ): Promise<CreateMeetingResult>;
  updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
  recordSessionOwnership(
    input: SessionOwnershipInput,
    now?: number,
  ): Promise<SessionOwnership>;
  read(): Promise<MeetingSnapshot>;
  readPrivateMeetingMail(
    mailId: string,
  ): Promise<PrivateMeetingMail | undefined>;
  listOverduePrivateMeetingMail(now: number): Promise<PrivateMeetingMail[]>;
  hasUnfinishedPrivateMeetingMail(): Promise<boolean>;
  sendPrivateMeetingMail(
    input: SendPrivateMeetingMailInput,
  ): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>>;
  startPrivateMeetingMail(
    input: StartPrivateMeetingMailInput,
  ): Promise<PrivateMeetingMail>;
  finishPrivateMeetingMail(
    input: FinishPrivateMeetingMailInput,
  ): Promise<PrivateMeetingMail>;
  cancelUnfinishedPrivateMeetingMail(
    input: CancelPrivateMeetingMailInput,
  ): Promise<number>;
  execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>;
  claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
  completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
  renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number>;
  recover(input?: RecoverInput): Promise<RecoveryResult>;
  close(): Promise<void>;
}
```

The seven private-mail methods belong to the same per-Meeting `MeetingRepositoryPort`; mail is private communication data, not formal transcript or `MeetingSnapshot` data. `readPrivateMeetingMail`, `listOverduePrivateMeetingMail`, and `hasUnfinishedPrivateMeetingMail` are read-only. `sendPrivateMeetingMail`, `startPrivateMeetingMail`, `finishPrivateMeetingMail`, and `cancelUnfinishedPrivateMeetingMail` follow the same authorization, expected-version, idempotency, sequential-commit, and recovery boundaries as other repository mutations. No second repository or mail port is introduced. See [Agent Meeting Protocol](./AGENT-MEETING-PROTOCOL-INTERFACE.md) sections `Meeting-scoped mailbox extension` and `Mail processing contract`.

`create` 是 bootstrap 专用写入口：它先实时校验当前 caller，然后持久化 `creating` bootstrap、`createRequestId` 与 `requestHash`，但不创建公开 Meeting、领域事件或成功 receipt。Bootstrap 只保存创建 correlation，不保存 caller ownership；Runtime 可以安全创建并通过 `recordSessionOwnership` 记录 DSH Session ownership。崩溃恢复可据此识别未完成创建，且不能把它当作可运行 Meeting。`updateBootstrap` 只允许把尚未提交 seq 1 的 `creating` 转为 `creation_failed`，并保留安全失败码；若 seq 1 已提交但 ready publication 部分失败，它必须补齐现有 creation/catalog `ready` publication 并返回已提交 bootstrap，Runtime 随后重放原 create receipt，不得把已提交 Meeting 标记为失败或清理其 Session。

全部必需 Session 已创建后，Runtime 使用同一原始创建输入调用 `completeCreate`。该方法重新校验当前 caller，并以 seq 1 的单个 `create.complete` commit 同时建立 ready snapshot、`meeting.created` event、初始 outbox、成功 create receipt、已记录的 Session ownership 和 ready bootstrap；该 commit 成功后才把 creation record 和 catalog record 发布为 `ready`。不要求当前 caller 与 `create` caller 相同；只有 `completeCreate` 当前 caller 通过授权校验且 request ID/hash 匹配时才能创建公开 Meeting。只有 `ready` bootstrap 对应公开 Meeting；`creation_failed` 不生成公开 Meeting。重复 `create` 只接受相同 request ID/hash，重复 `completeCreate` 在再次通过当前 caller 校验后返回原 receipt。

若首个 Turn 或 Manager planning 在 `completeCreate` 后由独立领域提交启动，Runtime 必须在首次成功响应前调用 `updateCreateResult`，以一个 `create.result` commit 原子替换 projection bootstrap 和 create receipt 中的公开结果。该方法不修改 MeetingState、不新增领域事件或 outbox，不直接更新 creation/catalog record；只允许 `ready` Meeting 且要求 `result.meetingId`、`result.meetingVersion` 与当前快照完全一致。崩溃重试可以幂等补齐启动提交和该结果；已经返回给 caller 的创建结果后续必须原样重放，不得用当前状态重新合成。

## Persistent Data Contract

### Command and transition

```ts
interface RepositoryCommand<T> {
  requestId: string;
  commandKind: string;
  authorization: CommandAuthorization;
  requestHash: string;
  expectedMeetingVersion: number;
  transition: (snapshot: MeetingSnapshot) => TransitionResult<T>;
}

interface TransitionResult<T> {
  state: JsonObject;
  result: T;
  events: DomainEventInput[];
  outbox: OutboxInput[];
}
```

`execute` 在该 Meeting 唯一顺序边界内读取当前 projection 和 version。成功时把新 snapshot、events、receipt 和 outbox 编码进一个 `CommitRecordV1`；commit put 成功前不得发布内存 projection，put 失败保持提交前 projection。transition 不得执行 DSH、文件写入或其他外部副作用。

`CommandAuthorization` 至少包含稳定 `callerBinding`、capability ID 和可选 attempt ID。每次请求都必须先调用 `RepositoryAuthorizationValidator`；只有当前 caller 验证通过后才查询或返回 receipt。授权失败优先于 replay、hash conflict 和 version 判断。

### Idempotency

幂等键为 `requestId + commandKind + callerBinding`，其中 `requestId` 是调用方提供的稳定幂等身份；`requestHash` 是规范化请求内容的 hash。`attemptId`、`planningAttemptId` 等领域对象 ID 不参与 receipt 查询，也不要求 Repository 提供按这些 ID 反查提交结果的能力。

B-owned Decision acceptance/disposal and risk disposition commands produce `requestHash` by calling `serializeValidatedRequestV1(value: object): string` from `plugin/src/protocol/request-idempotency.ts` on the already Schema-validated request. The function returns `JSON.stringify(value)` exactly: object insertion order and array order are significant, `undefined` properties are omitted, and strings receive no extra normalization. It does not use crypto, `repository` canonical JSON, or alter receipt string semantics. A later convergence command imports this function and does not define another serializer.

- 相同幂等键和相同 hash：返回原 receipt，不再次运行 transition。
- 相同幂等键和不同 hash：返回 `IDEMPOTENCY_CONFLICT`。
- 相同 `requestId` 在不同领域 attempt 标识下仍由 command kind 和 caller binding 区分；同一幂等键不得产生第二份提交。
- receipt 必须保存 result、meetingVersion、message IDs 和创建时间。

### Events and sequence

`DomainEventInput.type` 必须来自集中注册的 `MeetingEventType`；每个改变 Meeting 状态的成功 transition 至少提供一个 event，Repository 负责写入 `eventSeq`、提交后的 `meetingVersion` 和时间戳。单个 commit 的事件序号连续递增，顺序与输入顺序一致。校验失败、commit put 失败和幂等命中不新增领域事件。

Decision acceptance uses `decision.accepted`. Decision supersede writes replacement `decision.accepted` first and old `decision.superseded` second in the same commit; revoke writes `decision.revoked`. Risk disposition uses the existing `completion_fact.added` event and does not add a risk-specific event. The supersede commit has two events and the revoke commit has one; both advance Meeting version once and write `outbox=[]`. Completion facts add only `decision_supersession/superseded` and `decision_revocation/revoked` pairs for Decision disposal; prior acceptance facts are retained.

### Outbox

每个 outbox item 具有稳定 `id`、`deliveryId`、集中注册的 `kind`（当前为 `dispatch`）、JSON payload、attempt count、状态、lease owner、lease token、lease deadline、retry time 和最后错误。Repository 在写入和 lease 前拒绝未注册 kind；省略 `priority` 时固定为 `50`。claim 通过一个 commit 原子取得 lease。长时间 dispatch 可以在当前 lease 过期前调用 `renewOutboxLease`：请求必须带回同一 `id`、owner 和 token，且 `ttlMs` 必须为正数；Repository 在同一顺序边界内确认当前时间严格早于已有 deadline 后，将新 deadline 设置为 `now + ttlMs` 并返回该值。续租不改变 attempt count、owner 或 token。owner/token 不匹配、item 不存在、已有 lease 已过期，或 completion 在当前 deadline 时及之后到达时，均返回 `LEASE_LOST`，不得覆盖新 worker 的状态；completion 同样必须带回当前 owner/token。

外部调用不在 Repository commit 内执行。成功、可重试失败和终止失败都通过独立 commit 完成；相同 `deliveryId` 重投不得产生重复领域事实。

Outbox 的当前实现边界固定在 [Convivium Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md) 的 `Minimal implementation boundary`；本接口不授权把它扩展为通用队列、scheduler 或 DSH-owned facility。

### Recovery

`open` 必须先让 Storage Domain 对全部 record schema 完成验证，再读取 published checkpoint 与连续 commit tail；任何 identity、schema、digest、前驱或 sequence 不一致都映射为带当前 `meetingId` 的非重试 `CORRUPT_DATABASE`，且不得发布部分 projection。Session ownership 的 session ID、parent session ID、provider、label、role、participant identity 首次写入后不可变；只允许首次补写稳定 `initialMessageId`、生命周期前进（`provisioning → active → closed`）和 capability 的不可逆 revoke。`recover` 只处理当前 Meeting Domain：回收过期 lease，并返回带创建 correlation 的 bootstrap record 和已证明的 Session ownership。只有 `ready` bootstrap 才返回公开 Meeting `snapshot`；`creating` 或 `creation_failed` 返回时不得包含 snapshot，使上层 `RecoveryCoordinator` 能恢复或安全关闭中断创建的 Session。catalog discovery、跨 Meeting 隔离和 DSH orphan Session 处理属于上层 `RecoveryCoordinator`，不由 Repository 隐式完成。

`SessionOwnershipInput` 的 `sessionLabel` 只接受以下稳定格式：

```text
convivium:meeting-manager:<teamId>:<meetingId>
convivium:meeting-participant:<teamId>:<meetingId>:<participantId>
```

`SessionOwnership` 和 `SessionOwnershipInput` 使用以下字段；Repository 实现不得另建同义 ownership 结构：

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

`parentSessionId` 是创建 meeting-owned Session 时使用的精确 DSH direct parent Session；当前会议树中必须等于创建会议的 Captain Session。`provider` 是首次创建时解析的 continuable subagent provider name。两者与 `sessionId`、`sessionLabel`、`role`、`participantId` 一样，首次写入后不可修改。

校验顺序固定如下：先解析 label 并验证其中的 `teamId + meetingId` 属于当前 Repository，跨边界为 `INVALID_INPUT`；若同一 `sessionId` 已存在，随后比较全部不可变 identity，任一重写为 `INVALID_STATE`；只有新 `sessionId` 再验证 manager/participant 的 role、label segment 和 `participantId` 一致性，不一致为 `INVALID_INPUT`。因此既有 participant 以同一 label 改写 `participantId` 返回 `INVALID_STATE`。

Runtime 可以在调用 `startContinuable()` 前使用 caller-reserved `sessionId` 写入 `provisioning` ownership。DSH 接受首次 prompt 后，Runtime 把返回的 `initialMessageId` 写入同一 ownership 并将 lifecycle 前进为 `active`；`initialMessageId` 只允许从缺失变为一个稳定值，写入后不可修改。恢复只能通过 `parentSessionId`、DSH 持久 parent-child 关系、完整 label、catalog identity 和 Meeting Domain identity 的共同证明操作 Session。

### Storage Domain schema and format

`catalogDomainSpec` 和 `createMeetingDomainSpec` 是 V1 record schema 的机器真相源。打开 Domain 时必须验证全部 existing records；未知 format version、缺失字段、unknown field、危险 map key 或非法 record 均拒绝打开，不得用默认值或兼容读取猜测旧格式。

per-Meeting Domain 只包含 `creation`、`commits`、`checkpoint_pages`、`checkpoint_roots` 和 `checkpoint_pointer` tables。ready projection 中的 snapshot、events、receipts、outbox、Session ownership 和 private mail 只通过 seq 1 或后续 `CommitRecordV1` 形成，不建立第二组可独立漂移的 authoritative tables。V1 不提供 record migration；后续 format 变化必须先形成新的兼容契约。

### Commit chain and checkpoint anchor

无 published checkpoint 时，seq 1 commit 固定使用 `previousSeq: 0` 和 `previousDigest: null`。存在 `baseSeq` checkpoint 时，其后第一条 commit 固定使用 `previousSeq: baseSeq` 和 `previousDigest: projectionDigest(checkpoint projection)`；之后每条 commit 使用前一条 commit 的 `seq` 与 `digest`。恢复必须从同一 anchor 逐条验证连续 tail，不能要求已经被 checkpoint 安全回收的旧 commit 仍然存在。

## Error Mapping

Repository 错误必须使用结构化 `RepositoryError`，至少区分：`MEETING_NOT_FOUND`、`VERSION_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`CONSTRAINT_VIOLATION`、`INVALID_INPUT`、`UNSUPPORTED_CAPABILITY`、`SCHEMA_VERSION_UNSUPPORTED`、`CORRUPT_DATABASE`、`LEASE_LOST`、`INVALID_STATE` 和 `CLOSED`。

每个错误包含 `code`、`retryable` 和 `meetingId`；错误不会把 backend 原始路径、record 内容或敏感 payload 返回给调用方。Storage/Domain closed 映射为 `CLOSED`，缺少能力映射为 `UNSUPPORTED_CAPABILITY`，format version 不匹配映射为 `SCHEMA_VERSION_UNSUPPORTED`，schema、medium、digest、sequence 或 identity 损坏映射为 `CORRUPT_DATABASE`。

## Method-To-Write Mapping

每个 ready-state mutation 只写一个 `CommitRecordV1`；`PersistenceProjectionV1` 由 published checkpoint 与连续 commit tail 合成。`convivium_catalog` 仅保存 discovery record。

## Creation And Recovery

创建按 catalog creating、creation record、Session ownership、seq 1 commit、ready 发布顺序执行；恢复只接受 published checkpoint 和连续 commit tail。

## Compatibility

V1 不读取、迁移、删除或回退到 legacy SQLite；切换前后各只有一个 production truth。现存 SQLite 数据不在本接口范围内。

FR-13 Phase 1 不提升 `PersistenceProjectionV1.formatVersion`，该 envelope 继续为 `1` 并原样承载 MeetingState JSON。canonical `MeetingState` 使用 required literal `formatVersion: 2`；无 discriminator 的既有 state 走窄的 legacy decode，保留普通 Meeting 恢复，但不得进入 attendance context/claim path，也不得补 default、写回、cast 为 V2 或隐式 migration。

`plugin/src/repository/domain/schemas.ts::PersistenceProjectionV1Schema` 与 `plugin/src/repository/domain/projection.ts::decodeProjection` 是现有 schema/decoder owner，只允许增加局部 MeetingState format 识别：未知 format 返回 `SCHEMA_VERSION_UNSUPPORTED`；已识别 V2 format 但 required discriminator 或 current planning attempt Catalog binding 损坏返回 `CORRUPT_DATABASE`。`plugin/src/repository/domain/domain-meeting-repository.ts::DomainMeetingRepository.open` 必须保留前一种错误，不能统一重写为 corrupt。普通 Runtime 的既有 `plugin/src/repository/types.ts::MeetingSnapshot.state: JsonObject` transport 和 casts 不属于该兼容改造范围。

verified Catalog snapshot 只保存在当前 planning attempt binding，canonical UTF-8 JSON 子值不得超过 `16 * 1024` bytes；完整 commit 仍受 `MAX_COMMIT_VALUE_BYTES = 65_536` 限制。成功的 attendance claim 复用现有 `MeetingRepositoryPort.execute`，在一条 commit 中原子发布新 projection、既有 `manager_plan.submitted` event、receipt 和既有 Speaker outbox；失败不得发布其中任何一项。

### Meeting convergence commands and commit contract

Convergence uses the existing `MeetingRepositoryPort.execute<T>(command: RepositoryCommand<T>)` only. A successful planning, waiting, fallback, refocus, replan, or termination transition produces exactly one `CommitRecordV1` containing the new snapshot, ordered domain events, receipt, and required outbox items; a failed put publishes none of them. The transition is pure and runs after authorization, expected-version, stale-attempt, and idempotency checks.

Manager fallback uses request identity `manager-fallback:<attemptId>:<reasonCode>`, caller binding `runtime:<meetingId>`, and `serializeValidatedRequestV1({ attemptId, reasonCode, observedMeetingVersion })` as the request hash. A business-invalid Manager submission atomically writes the failed planning attempt, `manager_plan.failed`, deterministic fallback Turn, receipt, and Speaker outbox. Timeout and delivery-retry exhaustion use the same command. A Manager-unavailable branch creates no planning attempt. Equal request identity/hash replays the receipt; unequal hash returns `IDEMPOTENCY_CONFLICT`; an old attempt or terminal Meeting is rejected without side effects.

Required-unavailable planning atomically writes `status='waiting'` and `MeetingWaitState` with `reason='required_participant_unavailable'`, sorted canonical `participantIds`, `taskIds: []`, `waitingSince=Runtime now`, and optional current `resumeAgendaItemId`; it never writes a partial Turn. The same Meeting version and sorted participant IDs are committed once. The existing Captain/local resume command is the sole recovery entrypoint and creates a new plan only after all required Participants are dispatchable.

The existing event vocabulary is reused: convergence writes `meeting.replanned` for replan and `meeting.ended` for stall/no-consensus termination. Event payloads include the committed `meetingId`, `meetingVersion`, `eventSeq`, `turnId` when present, and deterministic reason/termination code; no new convergence event family, repository, table, or outbox worker is introduced. Outbox external delivery remains post-commit; only the A-owned terminal-failure callback may issue the fallback command after durable failed completion.

## Related Documents

- `docs/00-governance/ARCHITECTURE.md`
- `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
