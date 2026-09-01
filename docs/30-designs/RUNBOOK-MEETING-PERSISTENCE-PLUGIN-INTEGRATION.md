# RUNBOOK: Meeting Persistence Plugin Integration

## Status And Work Boundary

- 状态：Executable
- 建立日期：2026-09-01
- 最后审计日期：2026-09-01
- 执行目录：仓库根目录。执行前必须运行 `git rev-parse --show-toplevel`；文档和证据中不得记录机器绝对路径。
- 当前起点：`plugin/` 通过 `node:sqlite` 实现每 Meeting repository，`Config.dataRoot` 和目录扫描属于 Convivium。
- 目标终点：独立 `storage-plugin/` 实现通用 JSONL DSH `StorageBackend`；Convivium 只使用 `@deepseek-ai/dsh-storage-domain` 和自身 record schema；验证切换后删除 SQLite 源码。
- 授权边界：本文授权修改本文列出的仓库文件并运行列出的本地验证；不授权 commit、push、PR、merge、修改用户 DSH profile、迁移或删除现存 `.sqlite` 数据。

## Executable Gate

本文只有在执行者能够从 T0 顺序执行到 T19，且不需要选择数据结构、接口、文件、symbol、实现方案、错误语义、测试范围或失败处理时才可保持 `Executable`。发现任何一步仍需上述判断时立即 STOP，并把本文状态改为 `Not Executable`；不得边猜边执行。

## Executor Contract

- 严格按 T0–T19 顺序执行；前一步未 PASS 不得进入下一步。
- 每步只修改“允许修改”列出的文件和 symbol；不存在的既有路径/symbol 或必需的额外改动立即 STOP。
- T14 前 SQLite 是唯一 production truth；T14 后 Storage Domain 是唯一 production truth。
- 禁止双写、fallback、自动迁移、扫描或删除 legacy `.sqlite`。
- 禁止把完整 Meeting projection 作为一次 backend write；一次 command 只允许一个 `CommitRecordV1` write。
- 禁止用 `any`、`unknown as`、`@ts-ignore`、放宽 Schema/限制/断言或跳过测试绕过失败。
- PASS 是验证命令退出 0 且本步列出的断言全部成立；没有“基本通过”。
- STOP 报告必须包含：最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、实际输出、`git status --short`、继续所需人工决定。
- STOP 时保留工作树，不回滚用户已有改动，不运行 destructive Git 命令。

## Goal And Complete Chain

工程链路固定为：

```text
DSH profile
  -> @deepseek-ai/dsh-storage hub
  -> @convivium/dsh-storage-jsonl provider (backend name: convivium-jsonl)
  -> @deepseek-ai/dsh-storage-domain (backend: convivium-jsonl)
  -> @convivium/dsh-plugin consumer
  -> CatalogDomain
  -> per-Meeting Domain
  -> MeetingRepositoryPort
  -> Meeting Runtime / tools / HTTP / projection
```

一次 ready Meeting 写操作固定为：

```text
validate caller/idempotency/version
  -> run pure transition or operational state change
  -> create next PersistenceProjectionV1 in memory
  -> deterministic diff(previous, next)
  -> one bounded CommitRecordV1
  -> domain.table("commits").put(seqKey, commit)
  -> backend one JSONL append + datasync
  -> publish in-memory projection
  -> return result / allow external effect
```

当前真相固定为：

```text
PersistenceProjectionV1(headSeq)
  = fold(published checkpoint at baseSeq, commits baseSeq + 1 ... headSeq)
```

checkpoint page、root 和 pointer 是派生数据。pointer 最后写入；pointer 成功后才删除旧 commit/page/root。任何清理失败只留下冗余记录，不改变真相。

## Current Breakpoints

| Boundary | Current evidence | Required target | Implemented in |
| --- | --- | --- | --- |
| Backend ownership | `plugin/src/repository/index.ts` imports `node:sqlite` | JSONL IO only in `storage-plugin/` | T2–T8 |
| Repository location | `plugin/src/runtime/services/meeting-repository-locator.ts#locateMeetingRepository` | no production path locator | T14–T17 |
| Discovery | `plugin/src/runtime/services/meeting-recovery-service.ts#createMeetingRehydrationService` scans directories | enumerate `convivium_catalog.meetings` | T13–T14 |
| Runtime construction | `plugin/src/index.ts#apply` resolves `Config.dataRoot` | inject `storageDomain`, pass repository registry | T15 |
| Repository surface | `plugin/src/repository/index.ts#MeetingRepository` combines types and SQLite | shared types + `MeetingRepositoryPort` + two temporary implementations | T9–T12 |
| Cold smoke | `plugin/scripts/smoke-profile.mjs` imports `DatabaseSync` | public tool/status assertions only | T15–T16 |
| Storage composition | web profile currently routes `storage-domain` to `json` | smoke patch routes it to `convivium-jsonl` | T8, T15 |
| SQLite removal | schema/migration/tests remain required by current implementation | delete only after production import graph proof | T17 |

## Scope And Non-goals

### Scope

- Add independent `storage-plugin/` package implementing the locked DSH KV backend contract.
- Implement bounded JSONL append, recovery, physical checkpoint and lifecycle.
- Define catalog and per-Meeting DomainSpec with exact Zod schemas.
- Preserve the complete current `MeetingRepository` observable behavior.
- Switch creation, discovery, recovery and lifecycle to Storage Domain.
- Prove no production SQLite path, then delete SQLite implementation and implementation-only tests.
- Record final evidence and delete this RUNBOOK after normal repository review/merge.

### Non-goals

- SQLite data import, export, deletion, compatibility read, fallback or dual write.
- Cross-Host or multi-process writers; V1 requires one local DSH Host per configured backend root.
- Remote/network filesystems, compression, encryption or a general database framework.
- Changes to Meeting protocol DTOs, domain transitions, authorization, Session identity or UI behavior.
- Changing DSH-owned Session persistence.
- Root workspace/monorepo creation or source dependency between the two plugins.

### Implementation Economy Gate

本文只允许下列新增结构；表中“当前依据”是其存在理由，不得把任何一项扩展成通用框架：

| 新增结构 | 唯一职责 | 当前正式依据 |
| --- | --- | --- |
| `storage-plugin/` | 在 DSH provider 边界内兑现单 record JSONL durability | Architecture 的插件业务切割和 DSH provider/consumer 依赖方向；Persistence Design 的 bounded atomic record 要求 |
| `FileSystemPort` | 对 append、sync、rename、truncate 的已确认崩溃点做确定性故障注入 | Persistence Design Acceptance 1、4、7；真实文件崩溃不能稳定复现。它只在 `storage-plugin` 内部使用且不从 package root 导出 |
| `MeetingRepositoryPort` | 保持现有 19 个 repository 方法的稳定业务边界，使 Runtime 不依赖 SQLite 或 DSH 实现 | 当前 SQLite Repository Interface；Architecture 要求 Convivium 只通过 DSH storage interface 接入 |
| `DomainMeetingRepository` | 把现有 repository 语义映射到一个 per-Meeting Domain | DSH consumer 必须使用 Storage Domain；Persistence Design 的 one-commit invariant |
| `DomainRepositoryRegistry` | 以 catalog 发现 Meeting，并集中拥有已打开 Domain 的关闭顺序 | FR-11 本地恢复/发现；DSH Domain 必须显式 open/close；替代现有目录扫描和 locator |
| catalog/Meeting `DomainSpec` 与 strict schema | 固定跨插件唯一数据耦合并在读取边界拒绝非法数据 | Architecture 的数据结构耦合边界；DSH Storage Domain `invalid-record` 契约 |
| deterministic patch、commit 与分页 checkpoint | 一个有界 commit 原子表示一次命令；在不大写入的前提下合成当前真相 | Meeting Persistence Design 全部算法不变量和 Acceptance 1–7 |
| physical checkpoint | 限制通用 JSONL backend 的 replay tail 和介质增长 | Meeting Persistence Design 的 bounded recovery/capacity；Storage Plugin 不能依赖 Meeting checkpoint 的存在 |
| repository `mutationChain` | 把 validation、head/seq allocation、diff 和 commit put 作为同一 Meeting 的顺序单元 | 当前并发 command/lease 行为；DSH Domain 只串行单次 table write，不串行 write 之前的 Convivium transition |
| per-unit operation queue | 保持直接并发 `KvUnit` mutation、segment rollover 和 physical checkpoint 的调用顺序 | Locked DSH API 明确 `KvUnit` 不负责串行；StorageBackend 必须独立兑现调用顺序 |
| active log + immutable segments + checkpoint pointer layout | 只允许修复 active EOF，并把历史介质损坏与崩溃尾部区分 | Persistence Design 的 fail-loud corruption、restart 和 bounded-tail acceptance |
| two package-local canonical codecs | backend 校验任意 KV JSON，Convivium 独立计算业务 commit/checkpoint digest | 两个插件禁止源码依赖且两层 digest 的 producer/consumer 不同；建立第三个 shared package 反而违反当前 package 边界 |

Application checkpoint runs only as a task appended to `mutationChain`; physical checkpoint runs only as a task appended to the per-unit operation queue. Neither layer creates a checkpoint queue, timer or worker. The single `maintenanceError` field at each layer records the last failed task solely so the next hard-tail write can retry-or-refuse and `close()` can drain; it is cleared after a successful checkpoint and has no callback/hook.

禁止新增 adapter registry、repository factory hierarchy、background worker、兼容层、migration layer、通用 event-sourcing framework、可插拔 codec、metrics framework、hook/callback 扩展点或未来版本字段。测试所需时间源只复用现有 `now?: () => number`；文件故障只使用上表的 `FileSystemPort`。执行中若必须新增表外结构、状态、事件、adapter、worker、依赖、兼容层或扩展点，立即 STOP，报告触发它的当前需求/失败/边界；没有需求/接口/架构不变量、可复现失败、必要隔离边界或多个当前消费者的稳定共享语义之一不得继续。

## Formal Sources And Locked Evidence

- [Architecture](../00-governance/ARCHITECTURE.md), sections `Confirmed Baseline`, `Dependency Rules`, `Source Layout And Verification`.
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md), `FR-2`, `FR-9`, `FR-10`, `FR-11` and Acceptance 13–15, 21–24.
- [Current SQLite Repository Interface](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md), all current repository behavior until T14.
- [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md), `Algorithm invariants`, `Recovery`, `Checkpoint and compaction`, `Capacity boundary`.
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md), `Responsibilities And Dependencies` and current repository/runtime symbols.
- DSH `0.1.1-rc.2` package declarations: `@deepseek-ai/dsh-storage` exports `StorageBackend`, `KvFacet`, `KvUnit`, `KvUnitDescriptor`, `StorageError`, `storageBackendServiceKey`; `@deepseek-ai/dsh-storage-domain` exports `defineDomain`, `domainTable`, `DomainFacility`, `Domain`, `DomainError`.
- DSH official storage architecture: hub performs no IO, providers own media, product consumers use the domain form and do not import backends.

If the installed/packed `0.1.1-rc.2` declaration differs from the signatures below, STOP; do not adapt to a newer API.

## Locked DSH API

The following is normative target TypeScript, not pseudocode:

```ts
interface StorageBackend {
    readonly kv?: KvFacet;
    close(): Promise<void>;
}

interface KvFacet {
    open(descriptor: KvUnitDescriptor): Promise<KvUnit>;
}

interface KvUnitDescriptor {
    readonly name: string;
    readonly version: number;
    readonly tables: readonly string[];
    readonly hasGlobal: boolean;
}

interface KvUnit {
    loadAll(): Promise<{
        tables: Record<string, Record<string, unknown>>;
        global: unknown;
    }>;
    putRecord(table: string, key: string, value: unknown): Promise<void>;
    deleteRecord(table: string, key: string): Promise<void>;
    setGlobal(value: unknown): Promise<void>;
    close(): Promise<void>;
}
```

`KvUnit` does not serialize concurrent writes. DSH Storage Domain owns one per-domain chain. The custom backend may serialize internal maintenance, but must preserve call order and must not expose a second application transaction API.

Stable DSH errors:

```text
StorageErrorCode = backend-not-found | form-not-mounted | duplicate-backend |
                   duplicate-mount | version-mismatch | malformed-medium | closed
DomainErrorCode  = already-open | facet-unsupported | invalid-record | missing-key | closed
```

Backend registration is exactly:

```ts
export const name = "convivium-storage-jsonl";
export const inject = ["storage"] as const;
export const BACKEND_NAME = "convivium-jsonl";

export function apply(ctx: Context, config: Config): void {
    const backend = new JsonlStorageBackend(resolve(process.cwd(), config.root));
    ctx.effect(() => {
        const unregister = ctx.storage.backend.register(BACKEND_NAME, backend);
        return async () => {
            unregister();
            await backend.close();
        };
    });
    ctx.provide(storageBackendServiceKey(BACKEND_NAME), backend);
}
```

Convivium injects only `storageDomain`; it never imports `BACKEND_NAME` or `storage-plugin` code. The profile owns `{ backend: "convivium-jsonl" }`.

## Exact Persistent Data Contract

All schemas are strict Zod objects. Unknown fields reject. `optional` means omitted, never `undefined` in encoded JSON. `nullable` means the field is required and its value may be `null`. All timestamps are integer Unix milliseconds produced once by the repository call (`input.now`, existing domain timestamp, or one call to `Date.now()`).

Existing public types (`MeetingSnapshot`, `DomainEventInput`, `OutboxInput`, `MeetingBootstrap`, `SessionOwnership`, `PrivateMeetingMail` and all repository inputs/results) retain the exact fields in `plugin/src/repository/index.ts` at T0 and move unchanged to `plugin/src/repository/types.ts` in T9.

### Keys and identity

```ts
type SeqKey = string; // decimal, exactly 20 chars, 00000000000000000001..MAX_SAFE_INTEGER
type CatalogKey = string; // sha256Hex(canonicalJson([teamId, meetingId]))
type ReceiptKey = string; // base64url(UTF8(canonicalJson([requestId, commandKind, callerBinding])))

meetingId = "meeting-" + sha256Hex(UTF8(teamId + "\0" + requestId)).slice(0, 32);
meetingDomainName = "convivium_m_" + sha256Hex(UTF8(teamId + "\0" + meetingId)).slice(0, 32);
generation = seqKey(baseSeq) + "_" + projectionDigest.slice(0, 16);
```

`teamId`, `requestId` and `callerBinding` come from the already validated command. `meetingId`, domain name, keys, seq, generation, digest, eventSeq, leaseToken and timestamps are Runtime/repository generated; caller cannot supply them except existing input fields already defined by the public contract. Lease token remains `randomUUID()`.

### CatalogMeetingRecordV1

Owner: Convivium catalog domain. Producer: `DomainRepositoryRegistry`. Consumer: discovery/recovery.

```ts
interface CatalogMeetingRecordV1 {
    formatVersion: 1;
    teamId: string;
    meetingId: string;
    domainName: string;
    status: "creating" | "ready" | "creation_failed";
    createRequestId: string;
    requestHash: string;
    createdAt: number;
    updatedAt: number;
    failureCode: string | null;
}
```

No field is optional. Catalog records never contain snapshots, events, receipts, mail, outbox, Session IDs or checkpoint data.

### CreationRecordV1

Owner: per-Meeting domain table `creation`, key `current`. Used only while/after reconciling creation; ready truth comes from commits.

```ts
interface PersistedOutboxSeedV1 {
    formatVersion: 1;
    id: string;
    deliveryId: string;
    kind: OutboxKind;
    priority: number;
    payload: JsonObject;
    availableAt: number;
    createdAt: number;
}

interface CreationRecordV1 {
    formatVersion: 1;
    teamId: string;
    meetingId: string;
    status: "creating" | "ready" | "creation_failed";
    requestId: string;
    requestHash: string;
    authorization: CommandAuthorization;
    initialState: JsonObject;
    createResult: CreateMeetingResult | null;
    initialOutbox: PersistedOutboxSeedV1[];
    sessionOwnership: Record<string, SessionOwnership>;
    createdAt: number;
    updatedAt: number;
    failureCode: string | null;
}
```

`create()` writes it before Session creation. It normalizes each caller `OutboxInput` exactly once: `id = input.id ?? randomUUID()`, `priority = input.priority ?? 50`, `availableAt = input.availableAt ?? createdAt`, and `createdAt` equals the single resolved creation timestamp. All other seed fields copy the validated input. Retry reads the persisted seeds and never generates replacement IDs or times. While status is `creating`, `recordSessionOwnership()` replaces this single record after validating monotonic ownership. `completeCreate()` embeds its data in seq 1 projection, then replaces status with `ready`. Encoded size must be `<= MAX_COMMIT_VALUE_BYTES` before any Session is created.

### PersistenceProjectionV1

Owner: `DomainMeetingRepository`. Consumer: repository reads and Runtime. All maps use null-prototype objects on decode; dangerous keys `__proto__`, `prototype`, `constructor` reject.

```ts
interface PersistedReceiptV1 {
    formatVersion: 1;
    requestId: string;
    commandKind: string;
    callerBinding: string;
    requestHash: string;
    meetingVersion: number;
    result: JsonValue;
    eventSeqs: number[];
    createdAt: number;
}

interface PersistedEventV1 {
    formatVersion: 1;
    eventSeq: number;
    meetingVersion: number;
    type: MeetingEventType;
    payload: JsonObject;
    turnId: string | null;
    attemptId: string | null;
    createdAt: number;
}

interface PersistedOutboxV1 {
    formatVersion: 1;
    id: string;
    deliveryId: string;
    kind: OutboxKind;
    priority: number;
    payload: JsonObject;
    status: "pending" | "leased" | "delivered" | "failed";
    attempts: number;
    availableAt: number;
    leaseOwner: string | null;
    leaseToken: string | null;
    leaseDeadline: number | null;
    deliveredAt: number | null;
    failedAt: number | null;
    lastError: string | null;
    createdAt: number;
}

interface PersistenceProjectionV1 {
    formatVersion: 1;
    snapshot: MeetingSnapshot | null;
    bootstrap: MeetingBootstrap;
    receipts: Record<ReceiptKey, PersistedReceiptV1>;
    events: Record<SeqKey, PersistedEventV1>;
    outbox: Record<string, PersistedOutboxV1>;
    sessionOwnership: Record<string, SessionOwnership>;
    privateMail: Record<string, PrivateMeetingMail>;
    nextEventSeq: number;
}
```

Defaults for a new seq 1 projection are empty maps and `nextEventSeq: 1`. Optional fields inside reused public types keep their existing optionality. No persisted map or array has an implicit default during decode; every field above is required.

### Deterministic patch and CommitRecordV1

```ts
type JsonPath = readonly (string | number)[];
type JsonPatchOperationV1 =
    | { readonly op: "remove"; readonly path: JsonPath }
    | { readonly op: "set"; readonly path: JsonPath; readonly value: JsonValue }
    | {
          readonly op: "splice";
          readonly path: JsonPath;
          readonly start: number;
          readonly deleteCount: number;
          readonly items: readonly JsonValue[];
      };

interface CommitRecordV1 {
    formatVersion: 1;
    seq: number;
    previousSeq: number;
    previousDigest: string | null;
    operation: string;
    patch: JsonPatchOperationV1[];
    committedAt: number;
    digest: string;
}
```

`digest = sha256Hex(canonicalJson(record without digest))`. Seq 1 has `previousSeq: 0`, `previousDigest: null`; every later record references the immediately preceding commit. Diff rules are fixed: object keys sorted by Unicode code point, removes first, recursive common keys second, sets last; arrays use longest equal prefix and non-overlapping suffix and one `splice`; primitive/type/root replacement uses `set`. Apply is immutable and rejects illegal path/container/index/dangerous key. Empty patch is allowed only when the repository method persists a receipt or operational change already present elsewhere in the projection; a true no-op without a new receipt performs no write.

### Checkpoint records

```ts
interface CheckpointPageV1 {
    formatVersion: 1;
    generation: string;
    baseSeq: number;
    pageIndex: number;
    pageCount: number;
    payloadBase64: string;
    payloadDigest: string;
}

interface CheckpointRootV1 {
    formatVersion: 1;
    generation: string;
    baseSeq: number;
    pageCount: number;
    totalBytes: number;
    projectionDigest: string;
    createdAt: number;
}

interface CheckpointPointerV1 {
    formatVersion: 1;
    generation: string;
    baseSeq: number;
    rootDigest: string;
    publishedAt: number;
}
```

Canonical projection bytes are split into consecutive `20_000` byte slices, then each slice is base64 encoded. Page key is `${generation}_${pageIndex.toString().padStart(10, "0")}`; root key is generation; pointer key is `current`. Empty projection is impossible because bootstrap is required. Existing same key + same canonical bytes is an idempotent retry; different bytes is `CORRUPT_DATABASE`.

### DomainSpec

```ts
catalogDomainSpec = defineDomain({
    name: "convivium_catalog",
    version: 1,
    tables: { meetings: domainTable<CatalogKey, CatalogMeetingRecordV1>(CatalogMeetingRecordV1Schema) }
});

createMeetingDomainSpec(name) = defineDomain({
    name,
    version: 1,
    tables: {
        creation: domainTable<"current", CreationRecordV1>(CreationRecordV1Schema),
        commits: domainTable<SeqKey, CommitRecordV1>(CommitRecordV1Schema),
        checkpoint_pages: domainTable<string, CheckpointPageV1>(CheckpointPageV1Schema),
        checkpoint_roots: domainTable<string, CheckpointRootV1>(CheckpointRootV1Schema),
        checkpoint_pointer: domainTable<"current", CheckpointPointerV1>(CheckpointPointerV1Schema)
    }
});
```

No global slot is declared. Domain names and table names are immutable for version 1.

## Storage Plugin Physical Contract

### Limits

```ts
MAX_KEY_BYTES = 4_096
MAX_DOMAIN_VALUE_BYTES = 98_304
MAX_OPERATION_LINE_BYTES = 131_072
SEGMENT_MAX_RECORDS = 256
SEGMENT_MAX_BYTES = 4_194_304
PHYSICAL_CHECKPOINT_TRIGGER_RECORDS = 512
PHYSICAL_CHECKPOINT_TRIGGER_BYTES = 8_388_608
PHYSICAL_TAIL_HARD_RECORDS = 1_024
PHYSICAL_TAIL_HARD_BYTES = 16_777_216
MAX_UNIT_LOGICAL_BYTES = 67_108_864

MAX_COMMIT_VALUE_BYTES = 65_536
CHECKPOINT_PAGE_RAW_BYTES = 20_000
APPLICATION_CHECKPOINT_TRIGGER_COMMITS = 128
APPLICATION_CHECKPOINT_TRIGGER_BYTES = 2_097_152
APPLICATION_TAIL_HARD_COMMITS = 256
APPLICATION_TAIL_HARD_BYTES = 4_194_304
MAX_APPLICATION_CHECKPOINT_BYTES = 16_777_216
```

All sizes are canonical UTF-8 bytes. Operation-line limit includes LF. Before accepting a value, backend checks key, value, line and resulting logical current-state bytes. Convivium checks commit and checkpoint limits before Domain writes. Capacity rejection uses `JsonlStorageError("capacity-exceeded")`; Convivium maps unknown backend errors to non-retryable `CORRUPT_DATABASE`, while its own preflight capacity failure is non-retryable `CONSTRAINT_VIOLATION`.

Backend-local errors and filesystem test seam are exactly:

```ts
export type JsonlStorageErrorCode =
    | "invalid-json-value"
    | "record-too-large"
    | "capacity-exceeded"
    | "short-write"
    | "already-open";

export class JsonlStorageError extends Error {
    readonly name = "JsonlStorageError";
    constructor(
        readonly code: JsonlStorageErrorCode,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}

export interface FileHandlePort {
    write(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: null
    ): Promise<{ bytesWritten: number }>;
    datasync(): Promise<void>;
    sync(): Promise<void>;
    truncate(length: number): Promise<void>;
    readFile(): Promise<Buffer>;
    close(): Promise<void>;
}

export interface FileSystemPort {
    open(path: string, flags: "a" | "r" | "r+" | "wx"): Promise<FileHandlePort>;
    mkdir(path: string, options: { recursive: boolean; mode?: number }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    unlink(path: string): Promise<void>;
    rm(path: string, options: { recursive: true; force: true }): Promise<void>;
    stat(path: string): Promise<{
        size: number;
        isFile(): boolean;
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
    }>;
    lstat(path: string): Promise<{
        size: number;
        isFile(): boolean;
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
    }>;
    readdir(
        path: string,
        options: { withFileTypes: true }
    ): Promise<readonly import("node:fs").Dirent[]>;
}
```

`nodeFileSystemPort` delegates one-for-one to `node:fs/promises`. Symlinks or non-regular files anywhere below a unit directory cause `StorageError("malformed-medium")`; the backend never follows them. Config is exactly `interface Config { root: string }` and `export const Config: Schema<Config> = Schema.object({ root: Schema.string().required() })`. `root` may be absolute or relative because it is trusted profile composition; `apply` resolves it once with `resolve(process.cwd(), config.root)`.

Helper signatures are fixed:

```ts
encodeCanonicalJson(value: unknown): Uint8Array;
decodeCanonicalJson(bytes: Uint8Array): JsonValue;
sha256Hex(bytes: Uint8Array): string;
syncDirectory(path: string, fs?: FileSystemPort): Promise<void>;
replaceFileDurably(path: string, bytes: Uint8Array, fs?: FileSystemPort): Promise<void>;
createFileDurably(path: string, bytes: Uint8Array, fs?: FileSystemPort): Promise<void>;
appendLineDurably(path: string, line: Uint8Array, fs?: FileSystemPort): Promise<void>;
readJsonl(
    path: string,
    policy: "immutable" | "active-tail",
    fs?: FileSystemPort
): Promise<readonly Uint8Array[]>;
```

The test-only fault fixture is fixed and is never exported from `storage-plugin/src`. Faults use semantic publication phases, never internal call counts:

```ts
type FaultPoint =
    | "append.write"
    | "append.datasync"
    | "replace.temp-write"
    | "replace.temp-sync"
    | "replace.rename"
    | "replace.directory-sync"
    | "checkpoint.page-write"
    | "checkpoint.page-sync"
    | "checkpoint.page-directory-sync"
    | "checkpoint.root-write"
    | "checkpoint.root-sync"
    | "checkpoint.root-directory-sync"
    | "checkpoint.pointer-temp-write"
    | "checkpoint.pointer-temp-sync"
    | "checkpoint.pointer-rename"
    | "checkpoint.pointer-directory-sync"
    | "checkpoint.segment-unlink";

export class ScriptedFileSystem implements FileSystemPort {
    failNext(point: FaultPoint, error: Error): void;
    shortWriteNext(
        point:
            | "append.write"
            | "replace.temp-write"
            | "checkpoint.page-write"
            | "checkpoint.root-write"
            | "checkpoint.pointer-temp-write",
        bytesWritten: number
    ): void;
    calls(point: FaultPoint): readonly { readonly paths: readonly string[] }[];
    // exact FileSystemPort methods delegate to an isolated real mkdtemp root
}
```

`ScriptedFileSystem` assigns phases from the path role plus operation: non-checkpoint JSONL append → `append.*`; same-directory `.tmp` used by `replaceFileDurably` → `replace.*`; checkpoint `records.jsonl`, `root.json`, `checkpoint-pointer.json.tmp`, pointer rename, and covered-segment unlink → their literal checkpoint phase. Arming an unmatched phase is a test failure in `afterEach`; arming twice before consumption throws.

The exact T3 tests are:

| File / exact title | Initial bytes | Arm | Trigger | Exact assertion |
| --- | --- | --- | --- | --- |
| `jsonl.spec.ts#rejects before append write` | `active.jsonl` contains one valid LF-terminated line A | `failNext("append.write", fault)` | append valid line B | rejects `fault`; one write call; zero datasync; bytes equal A |
| `jsonl.spec.ts#repairs a short append on active-tail reopen` | A | `shortWriteNext("append.write", 5)` | append B, then `readJsonl(..., "active-tail")` | append rejects `short-write`; zero datasync; reopen returns only A and truncates to exact A byte length |
| `jsonl.spec.ts#observes a complete line after datasync reports failure` | A | `failNext("append.datasync", fault)` | append B, then active-tail read | append rejects `fault`; one full write and one datasync; read returns A,B; no truncate |
| `filesystem.spec.ts#preserves target when replacement temp write fails` | target = `old\n` | `failNext("replace.temp-write", fault)` | replace with `new\n` | rejects; target is old; temp absent |
| `filesystem.spec.ts#preserves target when replacement temp short-writes` | old | `shortWriteNext("replace.temp-write", 2)` | same | rejects `short-write`; target old; temp absent |
| `filesystem.spec.ts#preserves target when replacement temp sync fails` | old | `failNext("replace.temp-sync", fault)` | same | rejects; target old; temp absent |
| `filesystem.spec.ts#preserves target when replacement rename fails` | old | `failNext("replace.rename", fault)` | same | rejects; target old; temp absent |
| `filesystem.spec.ts#keeps complete new target when publish directory sync fails` | old | `failNext("replace.directory-sync", fault)` | same | rejects; target exactly new; temp absent |

The exact T4 tests are:

| File / exact title | Initial unit | Arm / trigger | Exact assertion |
| --- | --- | --- | --- |
| `unit.spec.ts#rolls back $kind when append write fails` with `kind = put, delete, set_global` | descriptor v1; table `records`; global enabled; persisted key `seed` and global `old` | for each fresh unit arm `append.write`; invoke the named mutation | rejects; `loadAll()` deep-equals pre-call; close/reopen deep-equals pre-call |
| `unit.spec.ts#rolls back memory and repairs medium after a short mutation append` | same | short-write 5; `putRecord("records","next",2)` | rejects; memory lacks `next`; close/reopen lacks `next`; active length returns to pre-call |
| `unit.spec.ts#poisons the open unit after datasync ambiguity and resolves on reopen` | same | fail `append.datasync`; put `next` | put rejects; memory lacks `next`; every later mutation rejects `StorageError("closed")`; close/reopen contains complete `next` |
| `tail-recovery.spec.ts#truncates every possible incomplete final-line suffix` | A plus each prefix length 1..B.length-1 of non-LF B | none; open unit for every prefix | each open returns only A and truncates exact A length |
| `tail-recovery.spec.ts#rejects LF-terminated corruption without repair` | A + invalid LF line | none; open | `malformed-medium`; zero truncate/write |
| `tail-recovery.spec.ts#rejects immutable segment corruption without repair` | valid descriptor, corrupted LF line in one closed segment | none; open | `malformed-medium`; zero truncate/write |

All T5 fault cases use `createPhysicalCheckpointFixture()`: descriptor `fault_unit` v1, table `records`, no global; operations 1..512 have been written, maintenance drained, unit closed and reopened with published pointer `throughOpSeq = 512`; operations 513..1023 are then written. The test arms exactly one phase, writes `putRecord("records", "k1024", 1024)`, awaits that successful mutation, then expects `close()` to reject the armed fault. Reopen must contain all keys `k1..k1024`. Parameterized suite title is `checkpoint-recovery.spec.ts#recovers complete truth after $case` with exactly:

| Case / arm | Pointer after reopen | Additional assertion |
| --- | --- | --- |
| `checkpoint.page-write` | 512 | orphan generation ignored |
| `checkpoint.page-sync` | 512 | orphan generation ignored |
| `checkpoint.page-directory-sync` | 512 | orphan generation ignored |
| `checkpoint.root-write` | 512 | orphan generation ignored |
| `checkpoint.root-sync` | 512 | orphan generation ignored |
| `checkpoint.root-directory-sync` | 512 | orphan generation ignored |
| `checkpoint.pointer-temp-write` | 512 | temp absent after cleanup |
| `checkpoint.pointer-temp-sync` | 512 | temp absent after cleanup |
| `checkpoint.pointer-rename` | 512 | old pointer bytes unchanged |
| `checkpoint.pointer-directory-sync` | 1024 | new pointer/root/pages all verify |
| `checkpoint.segment-unlink` | 1024 | at least one fully covered segment remains and is ignored |
| `short-checkpoint-page-write` / `shortWriteNext("checkpoint.page-write", 5)` | 512 | partial orphan page ignored |
| `short-checkpoint-root-write` / `shortWriteNext("checkpoint.root-write", 5)` | 512 | partial orphan root ignored |
| `short-checkpoint-pointer-temp-write` / `shortWriteNext("checkpoint.pointer-temp-write", 5)` | 512 | partial temp removed; old pointer unchanged |

For each of the first 11 rows, pass that row's first-column Point string as the first argument to `failNext(point, fault)`; the final three use the literal short-write arm shown. The parameterized title uses the exact Case string, so the suite has 14 tests. There is no old-or-new assertion: every case has the one pointer outcome above.

`MAX_UNIT_LOGICAL_BYTES` is the sum of canonical byte lengths of every present table name, key and value plus the declared global value; it is calculated incrementally and never by writing/encoding the whole unit as one record.

### Layout

```text
<root>/<base64url(UTF8(unitName))>/
├── descriptor.json
├── active.jsonl
├── segments/<20-digit-first-op-seq>.jsonl
├── checkpoints/<20-digit-through-op-seq>_<16-digest>/records.jsonl
├── checkpoints/<20-digit-through-op-seq>_<16-digest>/root.json
└── checkpoint-pointer.json
```

Multi-process locking is Not Applicable: Architecture fixes one local DSH Host; configuring two Hosts to the same root is unsupported. No persistent lock file is created, so crash restart cannot be blocked by stale lock state. `JsonlStorageBackend` rejects duplicate concurrent open of the same unit in-process.

### Physical records and publication

```ts
interface OperationRecordV1 {
    formatVersion: 1;
    opSeq: number;
    kind: "put" | "delete" | "set_global";
    table: string | null;
    key: string | null;
    value: JsonValue | null;
    digest: string;
}

interface PhysicalCheckpointRecordV1 {
    formatVersion: 1;
    table: string;
    key: string;
    value: JsonValue;
    digest: string;
}

interface PhysicalCheckpointRootV1 {
    formatVersion: 1;
    generation: string;
    throughOpSeq: number;
    descriptorDigest: string;
    recordCount: number;
    recordsDigest: string;
    global: JsonValue | null;
    globalDigest: string;
}

interface PhysicalCheckpointPointerV1 {
    formatVersion: 1;
    generation: string;
    throughOpSeq: number;
    rootDigest: string;
}
```

Every line is canonical JSON plus one LF. A mutation performs exactly one FileHandle `write(buffer, 0, length, null)` and one `datasync()` before resolve. A short write rejects and is never completed by a second write. A newly created file also syncs its parent directory before resolve.

Open reads the published physical checkpoint, then closed segments and active lines with `opSeq > throughOpSeq`. Only bytes after the final verified LF may be truncated. Any LF-terminated invalid JSON/digest line, earlier error, seq gap, duplicate conflicting seq, descriptor mismatch, checkpoint mismatch or immutable-file error throws `StorageError("malformed-medium")`. Descriptor version mismatch alone throws `StorageError("version-mismatch")`.

Physical checkpoint runs at a unit queue slot: capture current map and opSeq; create generation directory; append one current `(table,key,value)` per line; write root by create-exclusive + sync; reread/verify; publish pointer by same-directory temp + sync + rename + parent-directory sync; then delete closed segments fully covered by `throughOpSeq`. Crash before pointer leaves an ignored orphan; crash after pointer uses new checkpoint. Orphans are removed only after a valid pointer is loaded.

## Repository Port And Method Mapping

`plugin/src/repository/meeting-repository-port.ts` must declare exactly:

```ts
export interface MeetingRepositoryPort {
    readonly teamId: string;
    readonly meetingId: string;
    create(input: CreateMeetingInput): Promise<MeetingBootstrap>;
    completeCreate(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>>;
    updateCreateResult(input: UpdateCreateResultInput): Promise<CreateMeetingResult>;
    updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
    recordSessionOwnership(input: SessionOwnershipInput, now?: number): Promise<SessionOwnership>;
    read(): Promise<MeetingSnapshot>;
    readPrivateMeetingMail(mailId: string): Promise<PrivateMeetingMail | undefined>;
    listOverduePrivateMeetingMail(now: number): Promise<PrivateMeetingMail[]>;
    hasUnfinishedPrivateMeetingMail(): Promise<boolean>;
    sendPrivateMeetingMail(input: SendPrivateMeetingMailInput): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>>;
    startPrivateMeetingMail(input: StartPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    finishPrivateMeetingMail(input: FinishPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    cancelUnfinishedPrivateMeetingMail(input: CancelPrivateMeetingMailInput): Promise<number>;
    execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>;
    claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
    completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
    renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number>;
    recover(input?: RecoverInput): Promise<RecoveryResult>;
    close(): Promise<void>;
}
```

Method-to-write mapping is fixed:

| Method | Creating state | Ready state | Operation string |
| --- | --- | --- | --- |
| `create` | catalog put then creation put | idempotent read/conflict | no commit |
| `updateBootstrap` | creation put then catalog put | reject `INVALID_STATE` | no commit |
| `recordSessionOwnership` | one creation put | one commit | `session.ownership` |
| `completeCreate` | one seq 1 commit, creation ready put, catalog ready put | receipt replay/conflict | `create.complete` |
| `updateCreateResult` | reject | one commit | `create.result` |
| `execute` | reject | one commit | `command:${commandKind}` |
| `sendPrivateMeetingMail` | reject | one commit | `mail.send` |
| `startPrivateMeetingMail` | reject | one commit | `mail.start` |
| `finishPrivateMeetingMail` | reject | one commit | `mail.finish` |
| `cancelUnfinishedPrivateMeetingMail` | reject | zero commit when none; otherwise one | `mail.cancel` |
| `claimOutbox` | reject | zero commit when none; otherwise one | `outbox.claim` |
| `completeOutbox` | reject | one commit | `outbox.complete` |
| `renewOutboxLease` | reject | one commit | `outbox.renew` |
| `recover` | read creation | zero commit without expired leases; otherwise one | `outbox.recover` |
| read methods | read creation or projection as current contract allows | read projection | no write |

Every ready-state mutation clones the projection, runs the exact validation already present in `SqliteMeetingRepository`, calculates its patch, preflights size, and calls `commits.put()` once. It does not write separate event/receipt/outbox/mail tables. Replay applies patch; it never reruns `RepositoryCommand.transition`.

### Exact Convivium Storage Symbols

The following is normative target TypeScript, not pseudocode. No factory interface or callback extension point may wrap these classes.

```ts
type CatalogDomain = Domain<typeof catalogDomainSpec>;
type MeetingDomain = Domain<ReturnType<typeof createMeetingDomainSpec>>;

export interface DomainMeetingRepositoryOpenOptions {
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly teamId: string;
    readonly meetingId: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly now?: () => number;
}

export class DomainMeetingRepository implements MeetingRepositoryPort {
    static open(options: DomainMeetingRepositoryOpenOptions): Promise<DomainMeetingRepository>;
    // exactly the 2 readonly properties and 19 methods in MeetingRepositoryPort
}

export interface DomainRepositoryRegistryOpenOptions {
    readonly facility: Pick<DomainFacility, "open">;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly now?: () => number;
}

export class DomainRepositoryRegistry {
    static open(options: DomainRepositoryRegistryOpenOptions): Promise<DomainRepositoryRegistry>;
    listMeetings(): Promise<readonly CatalogMeetingRecordV1[]>;
    openMeeting(input: {
        readonly teamId: string;
        readonly meetingId: string;
    }): Promise<MeetingRepositoryPort>;
    recoverMeeting(input: {
        readonly teamId: string;
        readonly meetingId: string;
        readonly now?: number;
    }): Promise<RecoveryResult>;
    close(): Promise<void>;
}

export function loadProjection(input: {
    readonly domain: MeetingDomain;
}): PersistenceProjectionV1;

export function writeCheckpoint(input: {
    readonly domain: MeetingDomain;
    readonly projection: PersistenceProjectionV1;
    readonly baseSeq: number;
    readonly createdAt: number;
}): Promise<CheckpointPointerV1>;

export function collectApplicationOrphans(input: {
    readonly domain: MeetingDomain;
    readonly keepGeneration: string;
}): Promise<void>;
```

`loadProjection` is synchronous because DSH Domain tables are authoritative in-memory handles after `facility.open()` has validated `loadAll()`. It reads the published pointer, referenced generation and continuous commit tail without writing. `writeCheckpoint` receives a projection only as an in-process input; it encodes and writes pages one at a time and never passes that projection to a Domain `put`. `DomainMeetingRepository` owns its Meeting Domain and closes it exactly once. `DomainRepositoryRegistry` owns the catalog Domain and all repositories it opened; callers never close a repository returned by the registry independently.

`listMeetings()` returns a fresh array sorted by ECMAScript string `<` order on `teamId`, then `meetingId`. Catalog table iteration order is never exposed. `openMeeting()` cache key is `CatalogKey`; a cached entry must match both identities and derived `domainName` or reject `CORRUPT_DATABASE`.

## Creation, Recovery And Lifecycle

Creation saga:

1. Deterministically calculate meetingId/domain/catalog key.
2. `catalog.meetings.put(creating)`; same request/hash is idempotent, any identity/hash mismatch is `IDEMPOTENCY_CONFLICT`.
3. Open Meeting domain and `creation.put(current)`.
4. Record each reserved Session ownership by replacing `creation/current` before `startContinuable()`.
5. After DSH returns, replace the same ownership with `initialMessageId` and `active`.
6. `completeCreate()` writes seq 1 projection exactly once.
7. Replace creation and catalog status with `ready`.

Recovery matrix:

| Catalog | Creation | Seq 1 | Result |
| --- | --- | --- | --- |
| creating | absent | absent | list/recovery unavailable; same create request may recreate; no Session can exist |
| creating | creating | absent | close/reconcile recorded Sessions; same request resumes with same meetingId |
| creating | creation_failed | absent | change catalog to creation_failed; return recorded failure and ownership for Session cleanup |
| creating | any | valid | change creation/catalog to ready, then recover projection |
| ready | any | valid | recover checkpoint + continuous tail |
| ready | any | absent/invalid | `CORRUPT_DATABASE`, never empty reconstruction |
| creation_failed | creation_failed | absent | return recorded failure, close recorded Sessions |
| any | schema/digest/gap invalid | any | `CORRUPT_DATABASE`, fail the requested list/recovery operation |

`DomainRepositoryRegistry` opens catalog once, caches one Domain/repository per domainName, rejects duplicate team/meeting identity, and owns close. Runtime shutdown order is: stop the already-existing delivery/timeout services; await repository maintenance; close all Meeting repositories/domains; close catalog domain. Repeated close is idempotent. This design adds no worker.

Error mapping:

| Source | RepositoryError |
| --- | --- |
| `StorageError.backend-not-found`, `DomainError.facet-unsupported` | `UNSUPPORTED_CAPABILITY`, retryable false |
| `StorageError.closed`, `DomainError.closed` | `CLOSED`, retryable false |
| `StorageError.version-mismatch` | `SCHEMA_VERSION_UNSUPPORTED`, retryable false |
| `StorageError.malformed-medium`, `DomainError.invalid-record`, `DomainError.missing-key`, `DomainError.already-open`, unknown backend error | `CORRUPT_DATABASE`, retryable false |
| Convivium encoded record/capacity preflight | `CONSTRAINT_VIOLATION`, retryable false |

No raw path or record payload enters the public error message.

## File And Symbol Map

### `storage-plugin/` new files

| File | Symbols |
| --- | --- |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, formatting/lint config | independent package/build/test |
| `src/config.ts` | `Config` interface and `Config` Schemastery value |
| `src/errors.ts` | `JsonlStorageErrorCode`, `JsonlStorageError` |
| `src/canonical-json.ts` | `JsonValue`, `encodeCanonicalJson`, `decodeCanonicalJson`, `sha256Hex` |
| `src/filesystem.ts` | `FileHandlePort`, `FileSystemPort`, `nodeFileSystemPort`, `syncDirectory`, `replaceFileDurably` |
| `src/format.ts` | physical schemas, encoders, decoders, limits |
| `src/jsonl.ts` | `appendLineDurably`, `readJsonl`, `createFileDurably` |
| `src/checkpoint.ts` | `loadPhysicalCheckpoint`, `writePhysicalCheckpoint`, `collectPhysicalOrphans` |
| `src/unit.ts` | `JsonlKvUnit`, `openJsonlUnit` |
| `src/backend.ts` | `JsonlStorageBackend`, descriptor validation/open/close |
| `src/index.ts` | `name`, `inject`, `BACKEND_NAME`, `Config`, `apply` |
| `scripts/verify-*.mjs`, `scripts/smoke-profile.mjs` | environment/package/contract/profile validation |
| `tests/fixtures/scripted-filesystem.ts` | test-only `ScriptedFileSystem`; exact failure injection surface above |

### `plugin/` target files

| File | Symbols/action |
| --- | --- |
| `src/repository/types.ts` | exact moved public repository types |
| `src/repository/meeting-repository-port.ts` | exact port above |
| `src/repository/sqlite-meeting-repository.ts` | temporary renamed current class; deleted T17 |
| `src/repository/domain/keys.ts` | key/domain/generation derivation |
| `src/repository/domain/schemas.ts` | all strict Zod schemas above |
| `src/repository/domain/specs.ts` | catalog and Meeting DomainSpec |
| `src/repository/domain/canonical-json.ts` | app canonical JSON/digest; no filesystem |
| `src/repository/domain/json-patch.ts` | deterministic diff/apply |
| `src/repository/domain/projection.ts` | projection construction/validation/fold |
| `src/repository/domain/checkpoint.ts` | application pages/root/pointer/GC |
| `src/repository/domain/domain-meeting-repository.ts` | port implementation |
| `src/repository/domain/domain-repository-registry.ts` | catalog/discovery/cache/lifecycle |
| `src/repository/index.ts` | production exports only; SQLite export removed T14 |
| `src/runtime/meeting-runtime.ts` | port annotations and required repository registry option |
| `src/runtime/services/meeting-recovery-service.ts` | catalog discovery |
| `src/runtime/application-service/create-meeting.ts` | registry open instead of path locator |
| `src/runtime/application-service/index.ts` | `repositoryRegistry` option instead of `dataRoot` |
| `src/index.ts`, `src/config.ts` | inject/wire Storage Domain; remove dataRoot |
| `tests/fixtures/domain-storage.ts` | test-only `createFakeDomainFacility`, `createFakeCatalogDomain`, `createFakeMeetingDomain`, exact put/delete failure and call spies |

## Invariants

1. One command or ready-state operational mutation produces zero or one commit, never two.
2. A commit becomes visible only after Domain put resolves; rejected put leaves projection unchanged.
3. Idempotency validation precedes transition; replay does not append.
4. Seq/digest chain is continuous; conflict/gap fails loud.
5. Only published application and physical checkpoints participate in recovery.
6. Pointer publication is monotonic; cleanup follows pointer and cannot remove required tail.
7. Every backend call is bounded; checkpoint uses multiple bounded records.
8. Catalog stays lightweight and contains no private/session/payload data.
9. Convivium has no filesystem/backend package dependency after cutover.
10. Storage Plugin has no Convivium business dependency.
11. SQLite and Storage Domain are never production truths at the same time.
12. Existing `.sqlite` files are untouched.

## Mechanical Execution

Every step uses the fixed STOP report from `Executor Contract`. “Failure state” states whether repository or external data can have changed.

### T0 — Baseline And API Evidence

前置状态：current branch is not `main`; user changes are present only as reported by `git status`.

允许修改：无。

禁止修改：全部仓库文件、用户 DSH profile。

执行：运行下列命令并保留输出。当前 `plugin/src/repository/index.ts#MeetingRepository` 的 public instance surface 必须是下列有序集合；签名的唯一预期来源是本文 `Repository Port And Method Mapping` 中的完整 `MeetingRepositoryPort`：

```text
properties: teamId, meetingId
methods: create, completeCreate, updateCreateResult, updateBootstrap,
recordSessionOwnership, read, readPrivateMeetingMail,
listOverduePrivateMeetingMail, hasUnfinishedPrivateMeetingMail,
sendPrivateMeetingMail, startPrivateMeetingMail, finishPrivateMeetingMail,
cancelUnfinishedPrivateMeetingMail, execute, claimOutbox, completeOutbox,
renewOutboxLease, recover, close
```

The heredoc parser locates that exact class, excludes constructor/static/private members and compares sorted names; do not count `static open` as a port method.

验证：

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
node --version
pnpm --version
node --input-type=module <<'NODE'
import ts from "./plugin/node_modules/typescript/lib/typescript.js";
import { readFileSync } from "node:fs";
const file = ts.createSourceFile(
    "index.ts",
    readFileSync("plugin/src/repository/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
);
const klass = file.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === "MeetingRepository"
);
if (!klass) throw new Error("MeetingRepository class missing");
const has = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;
const methods = klass.members
    .filter((node) =>
        ts.isMethodDeclaration(node) &&
        !has(node, ts.SyntaxKind.PrivateKeyword) &&
        !has(node, ts.SyntaxKind.StaticKeyword)
    )
    .map((node) => node.name.getText(file))
    .sort();
const constructor = klass.members.find(ts.isConstructorDeclaration);
if (!constructor) throw new Error("MeetingRepository constructor missing");
const properties = constructor.parameters
    .filter((node) => has(node, ts.SyntaxKind.ReadonlyKeyword) && !has(node, ts.SyntaxKind.PrivateKeyword))
    .map((node) => node.name.getText(file))
    .sort();
const expectedMethods = [
    "cancelUnfinishedPrivateMeetingMail", "claimOutbox", "close", "completeCreate",
    "completeOutbox", "create", "execute", "finishPrivateMeetingMail",
    "hasUnfinishedPrivateMeetingMail", "listOverduePrivateMeetingMail", "read",
    "readPrivateMeetingMail", "recordSessionOwnership", "recover", "renewOutboxLease",
    "sendPrivateMeetingMail", "startPrivateMeetingMail", "updateBootstrap", "updateCreateResult"
].sort();
const expectedProperties = ["meetingId", "teamId"];
if (JSON.stringify(methods) !== JSON.stringify(expectedMethods)) throw new Error(JSON.stringify({ methods }));
if (JSON.stringify(properties) !== JSON.stringify(expectedProperties)) throw new Error(JSON.stringify({ properties }));
NODE
pnpm --dir plugin verify:environment
pnpm --dir plugin verify:contract
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify
```

PASS：仓库根目录命令成功；branch 非 `main`；heredoc 退出 0；全部 plugin 验证退出 0；DSH packages resolve to `0.1.1-rc.2`/Cordis `4.0.1`.

STOP：任一版本、method、命令或 baseline 不匹配。Failure state：无文件或外部数据变化。

### T1 — Formalize The Target Interface

前置状态：T0 PASS。

允许修改：rename `docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md` to `docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`; `docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`; `docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md`; `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`; this RUNBOOK only for its Formal Sources link.

禁止修改：code, tests, requirements, protocol interfaces, TODO.

执行：

1. `rg -l` must return exactly this RUNBOOK plus the three allowed design files; any fifth path STOPs. Rename the interface file with `git mv`.
2. Replace the old filename with `MEETING-STORAGE-INTERFACE.md` in all four `rg` result files. In Persistence Design change the link label to `Meeting Storage Interface`; in scope-control replace the complete prefix `SQLite repository 契约：` with `Meeting storage 契约：`; in this RUNBOOK change only `[Current SQLite Repository Interface]` to `[Meeting Storage Interface]`. No other text in the first two files or this RUNBOOK changes.
3. Replace the renamed interface file completely. Its heading order is exactly: `Purpose`, `Boundary And Ownership`, `Repository Port`, `Persistent Data Contract`, `Method-To-Write Mapping`, `Creation And Recovery`, `Error Mapping`, `Compatibility`, `Related Documents`. `Repository Port` is a verbatim copy of this RUNBOOK's `Repository Port And Method Mapping` TypeScript block. `Persistent Data Contract` is a verbatim copy from `Exact Persistent Data Contract` starting at its prose rules through `DomainSpec`. `Method-To-Write Mapping` is a verbatim copy of the mapping table and following one-commit paragraph. `Creation And Recovery` is a verbatim copy of the creation saga and recovery matrix. `Error Mapping` is a verbatim copy of the error table and no-raw-path sentence.
4. The interface `Purpose` text is exactly: `本文定义 Convivium Meeting Repository 在 Storage Domain 上的稳定行为、持久 record、原子 commit、恢复和错误边界。DSH backend 的物理 JSONL 格式不属于本接口。` `Boundary And Ownership` states exactly the complete chain from `Goal And Complete Chain` and Invariants 8–12. `Compatibility` is exactly: `V1 不读取、迁移、删除或回退到 legacy SQLite；切换前后各只有一个 production truth。现存 SQLite 数据不在本接口范围内。` `Related Documents` links Architecture, Requirements, Implementation Design and Persistence Design.
5. In `CONVIVIUM-IMPLEMENTATION-DESIGN.md`, change heading `Persistence Algorithm And Current SQLite Repository` to `Persistence Algorithm And Repository Cutover`; replace the paragraph beginning `本节及 SQL...` with: `下列 SQLite 小节只描述切换前实现。执行顺序固定为：先实现并验证独立 JSONL Storage Plugin，再让 Convivium 只通过 DSH Storage Domain 接入，验证 production import graph 后删除 SQLite 源码。全过程不双写、不 fallback、不迁移或删除既有 SQLite 数据。稳定 repository 行为以 Meeting Storage Interface 为准。` Do not rewrite any other SQLite-current-state paragraph until T17.

验证：

```bash
test ! -e docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md
test -e docs/20-interfaces/MEETING-STORAGE-INTERFACE.md
test -z "$(rg -l 'SQLITE-REPOSITORY-INTERFACE\.md' docs --glob '!RUNBOOK-MEETING-PERSISTENCE-PLUGIN-INTEGRATION.md')"
test "$(rg -c '^## (Purpose|Boundary And Ownership|Repository Port|Persistent Data Contract|Method-To-Write Mapping|Creation And Recovery|Error Mapping|Compatibility|Related Documents)$' docs/20-interfaces/MEETING-STORAGE-INTERFACE.md)" -eq 9
test "$(rg -c 'MeetingRepositoryPort|CommitRecordV1|PersistenceProjectionV1|convivium_catalog|convivium-jsonl' docs/20-interfaces/MEETING-STORAGE-INTERFACE.md)" -ge 5
git diff --check
```

PASS：all tests exit 0; the interface has exactly nine H2 headings and all five required symbols; diff check exits 0.

STOP：initial `rg` set differs, a verbatim source section is missing, or any fifth document must change. Failure state：documents only; no runtime data.

### T2 — Scaffold Independent Storage Package

前置状态：T1 PASS；`storage-plugin/` absent.

允许修改：new `storage-plugin/.gitignore`, `.prettierignore`, `.prettierrc.json`, `eslint.config.js`, `README.md`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `cordis.patch.yml`, `scripts/verify-dsh-environment.mjs`, `scripts/verify-plugin-contract.mjs`, `scripts/verify-package.mjs`, empty `src/index.ts`, `tests/contract/package-contract.spec.ts`.

禁止修改：`plugin/**`, docs, root workspace files.

执行：

1. Create `.gitignore`, `.prettierignore`, `.prettierrc.json`, `eslint.config.js`, and `tsconfig.json` byte-for-byte equal to the same five paths under `plugin/`; use `apply_patch`, then prove equality with `cmp`. Do not copy any other config.
2. Create `tsdown.config.ts` and `vitest.config.ts` with exactly:

```ts
// tsdown.config.ts
import { defineConfig } from "tsdown";

export default defineConfig({
    entry: { index: "src/index.ts" },
    outDir: "lib",
    platform: "node",
    target: "node22.19.0",
    clean: false,
    dts: false,
    fixedExtension: false,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    tsconfig: "tsconfig.json"
});

// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    include: ["tests/unit/**/*.spec.ts"],
                    environment: "node"
                }
            },
            {
                extends: true,
                test: {
                    name: "contract",
                    include: ["tests/contract/**/*.spec.ts"],
                    environment: "node"
                }
            },
            {
                extends: true,
                test: {
                    name: "recovery",
                    include: ["tests/recovery/**/*.spec.ts"],
                    environment: "node"
                }
            }
        ]
    }
});
```

3. Create `package.json` with only these complete fields and exact values:

```json
{
    "name": "@convivium/dsh-storage-jsonl",
    "version": "0.0.0",
    "description": "Generic local JSONL storage backend for DeepSeek Harness",
    "private": true,
    "license": "UNLICENSED",
    "type": "module",
    "main": "lib/index.js",
    "types": "lib/types/index.d.ts",
    "exports": {
        ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
        "./cordis.patch.yml": "./cordis.patch.yml",
        "./package.json": "./package.json"
    },
    "files": ["lib", "cordis.patch.yml", "README.md"],
    "engines": { "node": "^22.19.0 || >=24.11.0" },
    "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
    "scripts": {
        "format": "prettier . --write",
        "format:check": "prettier . --check",
        "lint": "eslint .",
        "lint:fix": "eslint . --fix",
        "build": "rm -rf lib && tsc -p tsconfig.json && tsdown --config tsdown.config.ts",
        "typecheck": "tsc -p tsconfig.json --noEmit",
        "test": "vitest run",
        "smoke:profile": "node scripts/smoke-profile.mjs",
        "verify:environment": "node scripts/verify-dsh-environment.mjs",
        "verify:contract": "node scripts/verify-plugin-contract.mjs",
        "verify:package": "node scripts/verify-package.mjs",
        "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:environment && pnpm verify:contract && pnpm verify:package"
    },
    "dependencies": { "@deepseek-ai/schemastery": "^3.18.1" },
    "peerDependencies": {
        "@deepseek-ai/cordis": "^4.0.1",
        "@deepseek-ai/dsh-storage": "^0.1.1-rc.2"
    },
    "peerDependenciesMeta": {
        "@deepseek-ai/cordis": { "optional": true },
        "@deepseek-ai/dsh-storage": { "optional": true }
    },
    "devDependencies": {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-storage": "0.1.1-rc.2",
        "@deepseek-ai/schemastery": "3.18.1",
        "@eslint/js": "10.0.1",
        "@types/node": "^22.15.0",
        "eslint": "10.6.0",
        "eslint-config-prettier": "10.1.8",
        "globals": "17.7.0",
        "prettier": "3.9.3",
        "tsdown": "^0.22.14",
        "typescript": "^5.9.3",
        "typescript-eslint": "8.62.0",
        "vitest": "^3.0.0"
    },
    "packageManager": "pnpm@10.7.0"
}
```

4. `cordis.patch.yml` bytes are exactly `- insert:\n    - id: convivium-storage-jsonl\n      name: '@convivium/dsh-storage-jsonl'\n      config:\n        root: convivium-storage\n`. `README.md` contains exactly the heading `# @convivium/dsh-storage-jsonl`, one blank line, and `Generic local JSONL implementation of the DSH StorageBackend KV facet.`, ending LF. `src/index.ts` contains exactly `export {};` plus LF.
5. `package-contract.spec.ts` has suite `storage package scaffold contract` and asserts deep equality for `exports`, `files`, `engines`, `dsh`, every dependency map and the patch parse result `{ id: "convivium-storage-jsonl", name: "@convivium/dsh-storage-jsonl", root: "convivium-storage" }`; it also asserts `dsh.client === undefined`.
6. `verify-dsh-environment.mjs` exits nonzero unless Node satisfies the manifest engine and resolved Cordis/storage package versions equal `4.0.1`/`0.1.1-rc.2`. `verify-plugin-contract.mjs` repeats the manifest/patch assertions from the contract suite and asserts no `src/client` path. At scaffold time it does not require runtime exports; T7 adds those checks after T6. `verify-package.mjs` packs to `mkdtemp(join(tmpdir(), "convivium-storage-pack-"))`, compares tar entries to `package/package.json`, `package/README.md`, `package/cordis.patch.yml`, `package/lib/index.js`, `package/lib/types/index.d.ts`, and removes that exact root in `finally`.
7. Generate the lockfile only with the listed command; do not add workspace, override or another dependency.

验证：

```bash
pnpm --dir storage-plugin install --lockfile-only
pnpm --dir storage-plugin install --frozen-lockfile
cmp -s plugin/.gitignore storage-plugin/.gitignore
cmp -s plugin/.prettierignore storage-plugin/.prettierignore
cmp -s plugin/.prettierrc.json storage-plugin/.prettierrc.json
cmp -s plugin/eslint.config.js storage-plugin/eslint.config.js
cmp -s plugin/tsconfig.json storage-plugin/tsconfig.json
pnpm --dir storage-plugin typecheck
pnpm --dir storage-plugin test
pnpm --dir storage-plugin build
pnpm --dir storage-plugin verify:environment
pnpm --dir storage-plugin verify:contract
pnpm --dir storage-plugin verify:package
test ! -e pnpm-workspace.yaml
```

PASS：all commands including five byte comparisons exit 0; contract suite proves the complete manifest/patch; no script uses `--passWithNoTests`.

STOP：dependency requires root workspace/override or a version not listed. Failure state：only new untracked package files; no medium created.

### T3 — Implement Canonical Format And Filesystem Port

前置状态：T2 PASS.

允许修改：`storage-plugin/src/config.ts`, `errors.ts`, `canonical-json.ts`, `filesystem.ts`, `format.ts`, `jsonl.ts`, `index.ts`; new `storage-plugin/tests/fixtures/scripted-filesystem.ts`; `storage-plugin/tests/unit/canonical-json.spec.ts`, `filesystem.spec.ts`, `format.spec.ts`, `jsonl.spec.ts`.

禁止修改：backend/unit/checkpoint, Convivium plugin.

执行：

1. Implement the exact symbols from `File And Symbol Map`.
2. `FileHandlePort` and `FileSystemPort` implement every method and exact signature in `Storage Plugin Physical Contract`, including `lstat`; no extra method is permitted. Every filesystem helper accepts final optional port defaulting to `nodeFileSystemPort`.
3. Canonical encoding recursively sorts object keys, preserves arrays, UTF-8/no whitespace, rejects non-finite numbers, bigint, undefined, sparse/cyclic values and dangerous keys.
4. `appendLineDurably` uses create-exclusive for first line and append for existing file, exactly one write, datasync, close; first creation syncs parent directory. Short write rejects `JsonlStorageError("short-write")`.
5. `replaceFileDurably` uses random same-directory `.tmp`, create-exclusive, one write, sync, close, rename, directory sync; failure removes only that temp.
6. Implement `ScriptedFileSystem` with the exact semantic `FaultPoint` API and every exact T3 title above. Use one fresh mkdtemp root per test, assert the armed phase was consumed, and remove only that root in `afterEach`.

验证：

```bash
pnpm --dir storage-plugin test -- tests/unit/canonical-json.spec.ts tests/unit/filesystem.spec.ts tests/unit/format.spec.ts tests/unit/jsonl.spec.ts
pnpm --dir storage-plugin typecheck
```

PASS：tests prove canonical equality/rejection and every T3 row in the fault matrix, including exact call ordering and allowed old/new boundary; commands exit 0.

STOP：Node port cannot express a required operation or Windows behavior would require silently weakening POSIX durability. Failure state：test temp directories only; exact temp roots removed by tests.

### T4 — Implement JSONL Unit Replay And Mutation

前置状态：T3 PASS.

允许修改：`storage-plugin/src/unit.ts`, `jsonl.ts`, `format.ts`; `storage-plugin/tests/unit/unit.spec.ts`, `tests/recovery/tail-recovery.spec.ts`.

禁止修改：backend registration, physical checkpoint, Convivium.

执行：implement descriptor file create/validate; in-memory table/global state; op seq; one queued mutation append; rollback in-memory candidate on append failure; segment rollover; load/replay; final active-tail truncation rules; closed behavior. Undeclared table/global misuse throws plain `Error`; closed throws `StorageError("closed")`; malformed durable content maps exactly as specified. After a full write whose `datasync` rejects, mark the open unit poisoned so all later mutations throw `StorageError("closed")`; only close/reopen resolves whether that complete record exists. Implement every exact T4 title and enumerate every final-record prefix length, not a sampled subset.

验证：

```bash
pnpm --dir storage-plugin test -- tests/unit/unit.spec.ts tests/recovery/tail-recovery.spec.ts
pnpm --dir storage-plugin typecheck
```

PASS：named tests cover put overwrite, delete missing no-op, global, seq continuity, rollover, write/short-write/datasync rollback, final-tail repair and middle corruption rejection.

STOP：any mutation requires two operation lines or recovery accepts partial middle data. Failure state：only isolated test roots; production package not registered.

### T5 — Implement Physical Checkpoint

前置状态：T4 PASS.

允许修改：`storage-plugin/src/checkpoint.ts`, `unit.ts`, `format.ts`; `storage-plugin/tests/unit/checkpoint.spec.ts`, `tests/recovery/checkpoint-recovery.spec.ts`.

禁止修改：backend/plugin entry, Convivium.

执行：implement the exact physical checkpoint records/publication. Maintenance is queued after resolved mutation at trigger; its failure is retained as the single internal `maintenanceError` needed by hard-tail enforcement and does not retroactively reject committed mutation. Before a new mutation would exceed hard tail, retry checkpoint first; if still failing, reject new mutation with `capacity-exceeded` before append. `close()` drains maintenance and rejects its retained error after the committed mutation is durable. Implement `createPhysicalCheckpointFixture()` and the exact 14-case T5 parameter table; do not inject by operation count.

验证：

```bash
pnpm --dir storage-plugin test -- tests/unit/checkpoint.spec.ts tests/recovery/checkpoint-recovery.spec.ts
pnpm --dir storage-plugin typecheck
```

PASS：tests prove bounded line count, pointer-before/after crash recovery, orphan collection, safe segment GC, hard-tail refusal before append and close drain.

STOP：checkpoint ever writes whole unit as one call or deletes active/uncovered log. Failure state：test roots only; last valid pointer/log remains recoverable.

### T6 — Implement Backend Lifecycle

前置状态：T5 PASS.

允许修改：`storage-plugin/src/backend.ts`, `unit.ts`, `index.ts`; `storage-plugin/tests/contract/backend.spec.ts`, `tests/unit/backend-lifecycle.spec.ts`.

禁止修改：profile smoke, Convivium.

执行：implement `JsonlStorageBackend` with `kv.open`, `open/opening` maps, descriptor validation, duplicate-open rejection, close drain/idempotency. Implement exact registration code from `Locked DSH API`. Backend must not add a write queue above the per-unit queue that reorders calls.

验证：

```bash
pnpm --dir storage-plugin test -- tests/contract/backend.spec.ts tests/unit/backend-lifecycle.spec.ts
pnpm --dir storage-plugin typecheck
pnpm --dir storage-plugin build
test -z "$(rg -l 'Meeting|teamId|meetingId|receipt|outbox|Session' storage-plugin/src storage-plugin/tests || true)"
```

PASS：first three exit 0; final rg has no output; contract covers exact KvUnit methods and errors.

STOP：DSH types differ or backend requires Convivium semantics. Failure state：test roots only.

### T7 — Verify Storage Package

前置状态：T6 PASS.

允许修改：`storage-plugin/scripts/verify-dsh-environment.mjs`, `verify-plugin-contract.mjs`, `verify-package.mjs`; `storage-plugin/tests/contract/package-contract.spec.ts`.

禁止修改：production behavior, Convivium.

执行：

1. Extend the scaffold contract/verify checks to import the built root and require exactly these public names: `name`, `inject`, `BACKEND_NAME`, `Config`, `apply`, `JsonlStorageBackend`, `JsonlStorageError`. Assert `name === "convivium-storage-jsonl"`, `inject` deep-equals `["storage"]`, and `BACKEND_NAME === "convivium-jsonl"`.
2. Assert manifest has no `dsh.client`, no dependency key containing `convivium`, no source dependency/file/workspace field, and repository root has no `pnpm-workspace.yaml`.
3. `verify-package.mjs` uses its T2 mkdtemp procedure and deep-equals sorted tar entries to exactly:

```text
package/README.md
package/cordis.patch.yml
package/lib/index.js
package/lib/types/backend.d.ts
package/lib/types/canonical-json.d.ts
package/lib/types/checkpoint.d.ts
package/lib/types/config.d.ts
package/lib/types/errors.d.ts
package/lib/types/filesystem.d.ts
package/lib/types/format.d.ts
package/lib/types/index.d.ts
package/lib/types/jsonl.d.ts
package/lib/types/unit.d.ts
package/package.json
```

Any additional declaration means a production source file outside the fixed File And Symbol Map and STOPs; do not widen the allowlist.

验证：

```bash
pnpm --dir storage-plugin verify
pnpm --dir storage-plugin verify:package
```

PASS：both exit 0; package output contains only allowlisted files; script temp root is removed.

STOP：pack requires publishing or output includes src/tests/local paths. Failure state：package build artifacts only; verify script removes its own temp root.

### T8 — Real DSH Backend/Domain Smoke

前置状态：T7 PASS.

允许修改：`storage-plugin/scripts/smoke-profile.mjs`, `storage-plugin/tests/contract/smoke-profile.spec.ts`, `storage-plugin/package.json`.

禁止修改：user profiles, Convivium.

执行：smoke creates one `mkdtemp` root and installs packed backend into DSH `web` profile `0.1.1-rc.2`. Temporary patch is exactly:

```yaml
- id: convivium-storage-jsonl
  config:
    root: !!js dshHomePath('convivium-storage-smoke')
- id: storage-domain
  config:
    backend: convivium-jsonl
```

Probe injects `storageDomain`, opens fixed spec `convivium_storage_smoke` version 1/table `records`, puts `alpha`, closes; Host stops; second Host opens and reads alpha, deletes, closes; third Host proves missing. It records PID per phase. Script runs `--dump-config` before boot and removes only its mkdtemp root in finally. Unregister-before-close is proven in `backend-lifecycle.spec.ts`, not inferred across a terminated process.

Both storage and Convivium smoke scripts implement the same `assertRelativeRowOrder(dumpText, expectedIds)` helper. It parses row IDs with `/^\s*-\s+id:\s+['"]?([^'"\s]+)['"]?\s*$/gm`; for each expected ID it requires exactly one match, maps the match to its row index, and throws unless every later expected index is strictly greater than the preceding index. T8 calls it before first boot with `["storage", "convivium-storage-jsonl", "storage-domain"]`. Patch text order and effective dump order are both backend-before-domain; only the effective dump assertion is PASS evidence. Unrelated rows may occur between these three rows, but cannot reverse or duplicate them.

验证：

```bash
pnpm --dir storage-plugin test -- tests/contract/smoke-profile.spec.ts
pnpm --dir storage-plugin smoke:profile
pnpm --dir storage-plugin verify
```

PASS：three distinct Host PIDs; exact relative-order assertion passes; persisted value survives first restart and deletion survives second; commands exit 0.

STOP：smoke needs an existing user profile/process or direct backend import to pass. Failure state：only script mkdtemp root, removed in finally.

### T9 — Extract Shared Repository Types And Port

前置状态：T8 PASS; SQLite remains production.

允许修改：`plugin/src/repository/index.ts`, new `plugin/src/repository/types.ts`, `plugin/src/repository/meeting-repository-port.ts`, renamed `plugin/src/repository/sqlite-meeting-repository.ts`, `plugin/tests/unit/repository-port.spec.ts`, and exactly the 16 import sites in the table below.

禁止修改：method behavior, Runtime construction, Config, profile, storage-domain dependency.

执行：first run this exact set assertion; a nonzero exit STOPs before edits:

```bash
test "$(rg -l 'repository/index\.js' plugin/src plugin/tests | sort)" = "$(printf '%s\n' \
  plugin/src/runtime/application-service/index.ts \
  plugin/src/runtime/application-service/meeting-control.ts \
  plugin/src/runtime/application-service/meeting-end.ts \
  plugin/src/runtime/meeting-runtime.ts \
  plugin/src/runtime/outbox-worker.ts \
  plugin/src/runtime/services/meeting-archive-service.ts \
  plugin/src/runtime/services/meeting-dispatch-service.ts \
  plugin/src/runtime/services/meeting-recovery-service.ts \
  plugin/src/runtime/services/types.ts \
  plugin/tests/contract/meeting-runtime.spec.ts \
  plugin/tests/recovery/recovery.spec.ts \
  plugin/tests/unit/repository.spec.ts \
  plugin/tests/unit/repository/session-ownership.spec.ts \
  plugin/tests/unit/runtime/archive.spec.ts \
  plugin/tests/unit/runtime/meeting-mail-dispatch.spec.ts \
  plugin/tests/unit/runtime/outbox-worker.spec.ts)"
```

Then move exported types/constants from current index to `types.ts` unchanged; move SQLite class/helpers to `sqlite-meeting-repository.ts` and rename class `SqliteMeetingRepository`; create exact port; barrel reexports types/errors/port and exports `SqliteMeetingRepository as MeetingRepository` temporarily. Apply only these import rewrites; imported symbols not listed for a row remain absent:

| Exact file | Import from `repository/types.js` | Import from `repository/errors.js` | Import from `meeting-repository-port.js` | Import from `sqlite-meeting-repository.js` |
| --- | --- | --- | --- | --- |
| `plugin/src/runtime/application-service/index.ts` | — | `RepositoryError` | — | — |
| `plugin/src/runtime/application-service/meeting-control.ts` | `CommandAuthorization`, `SessionOwnership` | `RepositoryError` | `MeetingRepositoryPort as MeetingRepository` | — |
| `plugin/src/runtime/application-service/meeting-end.ts` | — | `RepositoryError` | — | — |
| `plugin/src/runtime/meeting-runtime.ts` | `CommandAuthorization`, `CreateMeetingInput`, `JsonObject`, `DomainEventInput`, `RepositoryAuthorizationValidator` | — | `MeetingRepositoryPort as MeetingRepositoryType` | `SqliteMeetingRepository` |
| `plugin/src/runtime/outbox-worker.ts` | `OutboxItem`, `WorkerLease` | — | — | — |
| `plugin/src/runtime/services/meeting-archive-service.ts` | `CommandAuthorization`, `CommittedResult`, `JsonObject`, `SessionOwnership` | — | `MeetingRepositoryPort as MeetingRepository` | — |
| `plugin/src/runtime/services/meeting-dispatch-service.ts` | `OutboxItem` | `RepositoryError` | — | — |
| `plugin/src/runtime/services/meeting-recovery-service.ts` | `RecoveryResult`, `MeetingSnapshot` | — | `MeetingRepositoryPort as MeetingRepository` | — |
| `plugin/src/runtime/services/types.ts` | `OutboxItem` | — | — | — |
| `plugin/tests/contract/meeting-runtime.spec.ts` | — | `RepositoryError` | — | — |
| `plugin/tests/recovery/recovery.spec.ts` | `JsonObject`, `RepositoryCommand` | — | — | `SqliteMeetingRepository as MeetingRepository` |
| `plugin/tests/unit/repository.spec.ts` | `CommandAuthorization`, `RepositoryAuthorizationValidator`, `RepositoryCommand` | `RepositoryError` | — | `SqliteMeetingRepository as MeetingRepository` |
| `plugin/tests/unit/repository/session-ownership.spec.ts` | `RepositoryAuthorizationValidator`, `SessionOwnershipInput` | `RepositoryError` | — | `SqliteMeetingRepository as MeetingRepository` |
| `plugin/tests/unit/runtime/archive.spec.ts` | `RepositoryCommand` | — | — | — |
| `plugin/tests/unit/runtime/meeting-mail-dispatch.spec.ts` | — | `RepositoryError` | — | — |
| `plugin/tests/unit/runtime/outbox-worker.spec.ts` | `OutboxItem` | — | — | — |

The table has 16 rows because the fixed `rg` result has 16 paths; this count is normative. In `meeting-runtime.ts`, `MeetingRepositoryOpenInput = Parameters<typeof SqliteMeetingRepository.open>[0]`, `openMeetingRepository()` calls that class, and the dynamic import type is removed. Do not change any test body/title/assertion. Add structural test that SQLite class satisfies port.

验证：

```bash
pnpm --dir plugin test -- tests/unit/repository-port.spec.ts tests/unit/repository.spec.ts tests/unit/repository/session-ownership.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin build
test "$(rg -l 'repository/index\.js' plugin/src plugin/tests | wc -l | tr -d ' ')" -eq 0
```

PASS：initial path set equals the exact 16-row table; all commands and final zero-count test exit 0; existing repository tests are byte-identical below imports; production still exports SQLite alias.

STOP：port signature differs from exact contract or requires behavior changes. Failure state：source refactor only; SQLite files/data untouched.

### T10 — Add Domain Schemas And Pure Projection Codec

前置状态：T9 PASS.

允许修改：`plugin/package.json`, `plugin/pnpm-lock.yaml`; new `plugin/src/repository/domain/keys.ts`, `schemas.ts`, `specs.ts`, `canonical-json.ts`, `json-patch.ts`, `projection.ts`; new `plugin/tests/fixtures/domain-storage.ts`; new `plugin/tests/unit/repository/domain/keys.spec.ts`, `schemas.spec.ts`, `specs.spec.ts`, `canonical-json.spec.ts`, `json-patch.spec.ts`, `projection.spec.ts`.

禁止修改：Runtime, plugin entry, SQLite repository, production barrel.

执行：add dependency `zod: ^4.4.3`; add peer `@deepseek-ai/dsh-storage-domain: ^0.1.1-rc.2`, its optional peer meta, and dev exact `0.1.1-rc.2`; implement only the symbols assigned to the six source files in File And Symbol Map. The six same-basename suites test only their source file; `projection.spec.ts` owns fold/limit tests. Create the test-only fake symbols listed in File And Symbol Map; each fake table implements exact synchronous `get/entries/keys/size` and async `put/delete/update`, exposes `failNextPut(table,key)`, `failNextDelete(table,key)`, and ordered call arrays, and validates through the real DomainSpec schema on initial load. No file API or production export from the repository barrel. Update lockfile with the two listed install commands.

验证：

```bash
pnpm --dir plugin install --lockfile-only
pnpm --dir plugin install --frozen-lockfile
pnpm --dir plugin test -- tests/unit/repository/domain
pnpm --dir plugin typecheck
test -z "$(rg -l 'node:fs|node:path|node:sqlite|storage-plugin' plugin/src/repository/domain || true)"
```

PASS：first four exit 0; rg has no output; tests cover every schema, key formula, patch operation, deterministic digest, dangerous keys, over-limit rejection, fold gap/conflict.

STOP：a schema requires changing a public type or DomainSpec API differs. Failure state：new test-only modules and dependency metadata; production still SQLite.

### T11 — Implement Application Checkpoint

前置状态：T10 PASS.

允许修改：new `plugin/src/repository/domain/checkpoint.ts`; `plugin/tests/unit/repository/domain/checkpoint.spec.ts`.

禁止修改：repository implementation, Runtime, backend.

执行：implement pages/root/pointer/recovery/GC exactly as Persistent Data Contract and the three exact signatures. Every function accepts typed Domain and no path. Enforce monotonic pointer by checking current pointer immediately before put; stale generation becomes orphan and performs no deletion. The suite has exactly these titles and outcomes:

```text
loads a continuous commit tail without a checkpoint
writes more than one bounded page before root and pointer
rejects a missing referenced page
rejects page, root, pointer and projection digest mismatch
refuses a stale generation without publishing or deleting
keeps the old pointer when a checkpoint page put fails
keeps the old pointer when checkpoint root put fails
keeps the old pointer when pointer put fails
keeps new truth when obsolete commit deletion fails
collects only generations not named by the current pointer
```

Use `createFakeMeetingDomain()` from the fixed fixture. The three put-failure titles arm `failNextPut` respectively for `(checkpoint_pages, generated page 0 key)`, `(checkpoint_roots, generation)`, and `(checkpoint_pointer, current)`. The delete-failure title arms `failNextDelete(commits, seqKey(1))`; `writeCheckpoint` resolves the already-published pointer, retains redundant commit 1, and `loadProjection` ignores it because its seq is not above `baseSeq`. Every page-put spy value is `< MAX_DOMAIN_VALUE_BYTES` and no spy call receives `PersistenceProjectionV1`.

验证：

```bash
pnpm --dir plugin test -- tests/unit/repository/domain/checkpoint.spec.ts
pnpm --dir plugin typecheck
```

PASS：all ten exact titles pass; put/delete spy arguments and pointer outcomes match the fixed rules.

STOP：any function passes full projection to one Domain put. Failure state：test fake-domain state only.

### T12 — Implement DomainMeetingRepository Contract

前置状态：T11 PASS.

允许修改：new `plugin/src/repository/domain/domain-meeting-repository.ts`; new `plugin/tests/contract/domain-meeting-repository.spec.ts`; new `plugin/tests/contract/repository-title-migration.spec.ts`.

禁止修改：Runtime, entry, SQLite/barrel production export.

执行：implement every port method using the method mapping and the exact `DomainMeetingRepository.open` signature. Copy validation logic from `SqliteMeetingRepository` without changing conditions/error codes. Factor only pure private helpers inside this file; do not create an adapter/factory/base class and do not refactor domain/runtime. Ready mutation helper signature is:

```ts
private mutationChain: Promise<void> = Promise.resolve();

private enqueueMutation<T>(operation: () => Promise<T>): Promise<T>;

private async commit<T>(input: {
    operation: string;
    now: number;
    mutate(current: PersistenceProjectionV1): { next: PersistenceProjectionV1; result: T };
}): Promise<T>
```

`enqueueMutation` appends one settled link (`then(operation, operation)` followed by a swallowed tail used only to keep the chain live) and returns that call's unswallowed Promise. Every creating/ready mutation performs validation, seq allocation and writes inside this chain; read methods return the last published projection without joining it. `commit` clones current, mutates, diffs, preflights, puts one commit, then swaps projection. Application checkpoint is appended to the same chain after the committed method result; there is no second queue. Trigger/hard-tail rules mirror physical rules; committed result is not rejected by later maintenance failure. `close()` rejects new mutations, drains `mutationChain`, and closes its Domain exactly once.

Create `describe("DomainMeetingRepository behavior contract", ...)` with exactly these ported test titles; copy each named test body and replace only SQLite construction/fault injection with `createFakeMeetingDomain()` and its commit-put spy:

```text
bootstraps an empty domain and returns an idempotent create receipt
allows a separately authorized caller to complete the bootstrap
recovers a creating bootstrap without requiring a public meeting
rejects a conflicting idempotency hash and stale version
keeps the embedded MeetingState version in sync for plain commands
rolls back and preserves a transition validation error
uses the generic receipt for speaker attempts and manager plans
rolls back state, events and outbox when a commit put fails
serializes Captain end against a same-version meeting fact command
rejects stale outbox completion after lease expiry and reclaims the item
renews an owned outbox lease before a long dispatch completes
replays a committed command without rerunning its transition or duplicating outbox
rejects completion after expiry even before another worker claims the item
persists bootstrap and session ownership for recovery
requires the authorization validator before a new command commits
rejects a session label whose meeting segment only contains the requested id
rejects attempts to rewrite immutable session ownership identity
maps corrupted persisted state to RepositoryError
rejects unregistered outbox kinds before committing a create
rejects a state transition that has no domain event
persists an explicitly allowed no-op receipt without changing state
keeps private mail lifecycle atomic, idempotent, and out of MeetingState
persists immutable parent/provider and permits one initial-message write
rejects immutable ownership rewrites and active sessions without an initial message
rejects labels and participant identities that cross the repository boundary
does not reactivate a revoked capability or reopen a closed session
```

The fake exposes only `Domain` table behavior plus a `failNextPut(tableName, key)` fault; it is not production code. For each mutating title, assert the exact zero/one commit count from `Method-to-write mapping`; for the injected failure title assert projection deep-equality before/after and zero externally visible events/outbox changes.

Create `describe("repository title migration manifest", ...)` in `repository-title-migration.spec.ts`. Its `expectedDomainTitles` is exactly the 26-title list above. Derive `expectedOriginalPortedTitles` by replacing only these two names and leaving the other 24 byte-identical:

| Original SQLite title | Domain title |
| --- | --- |
| `bootstraps an empty database and returns an idempotent create receipt` | `bootstraps an empty domain and returns an idempotent create receipt` |
| `rolls back state, events and outbox when a transition write fails` | `rolls back state, events and outbox when a commit put fails` |

Its `sqliteOnlyTitles` is exactly the nine-title block in T17. A fixed regex `/\bit\("([^"]+)"/g` extracts titles from the two original suites and the domain suite. The test sorts and deep-equals `(original repository titles + original session titles)` to `(expectedOriginalPortedTitles + sqliteOnlyTitles)`, deep-equals domain titles to `expectedDomainTitles`, and asserts both expected sets have no duplicates. It does not classify titles dynamically.

验证：

```bash
pnpm --dir plugin test -- tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin test -- tests/contract/repository-title-migration.spec.ts
pnpm --dir plugin test -- tests/unit/repository.spec.ts tests/unit/repository/session-ownership.spec.ts
pnpm --dir plugin typecheck
```

PASS：all commands exit 0; the domain suite contains all 26 exact titles; the migration-manifest suite proves the fixed 26-port/9-delete partition with no extra original title; mutation spy proves fixed write counts.

STOP：an existing assertion cannot be preserved within exact port/error vocabulary or a ready mutation requires multiple commits. Failure state：new implementation and fake-domain fixture are not reachable from production.

### T13 — Implement Catalog Registry And Recovery

前置状态：T12 PASS.

允许修改：new `plugin/src/repository/domain/domain-repository-registry.ts`; `plugin/tests/contract/domain-repository-registry.spec.ts`; `plugin/tests/recovery/domain-recovery.spec.ts`.

禁止修改：Runtime/entry/SQLite/barrel.

执行：implement the exact `DomainRepositoryRegistry.open`, `listMeetings`, `openMeeting`, `recoverMeeting`, `close` signatures using one catalog Domain and cached Meeting domains. Implement creation saga/recovery matrix and exact error mapping. There is no public constructor, callback, hook, backend name or path. `open()` calls `facility.open(catalogDomainSpec)` once. `listMeetings()` uses the fixed sort above. `openMeeting()` derives/validates `domainName`, calls `facility.open(createMeetingDomainSpec(domainName))`, then calls `DomainMeetingRepository.open`; concurrent calls for the same CatalogKey share one in-flight Promise in the registry map. A rejected Promise is removed before rejection propagates. `close()` sets `closed`, rejects later opens as `RepositoryError("CLOSED")`, awaits all in-flight opens, closes cached repositories in ascending `domainName`, then closes catalog. Contract/recovery suites contain exactly:

```text
opens the catalog once and returns a deterministic sorted list
shares one in-flight open for the same CatalogKey
removes a rejected in-flight open before retry
rejects cached identity or domainName mismatch
recreates an absent creation record for the same creating request
resumes a creating record for the same request and hash
rejects a different request or hash for a creating catalog record
repairs creating catalog and creation status when seq 1 is valid
rejects ready catalog without valid seq 1
returns creation_failed and recorded ownership without reconstructing state
rejects invalid catalog or commit schema, digest and sequence gap
isolates two Meeting domains
closes Meeting domains in domainName order before catalog exactly once
```

验证：

```bash
pnpm --dir plugin test -- tests/contract/domain-repository-registry.spec.ts tests/recovery/domain-recovery.spec.ts
pnpm --dir plugin typecheck
```

PASS：all 13 exact titles pass; facility open/close spies, sorted output and every recovery outcome match the fixed matrices.

STOP：registry needs unit enumeration, filesystem access or backend-specific import. Failure state：fake domains only; production still SQLite.

### T14 — Cut Runtime To Repository Registry

前置状态：T13 PASS.

允许修改：`plugin/src/runtime/meeting-runtime.ts`, `plugin/src/runtime/application-service/index.ts`, `plugin/src/runtime/application-service/create-meeting.ts`, `plugin/src/runtime/services/meeting-recovery-service.ts`, `plugin/src/index.ts`, `plugin/src/config.ts`, `plugin/src/repository/index.ts`; `plugin/tests/contract/continuation.spec.ts`, `plugin/tests/contract/meeting-runtime.spec.ts`, `plugin/tests/recovery/recovery.spec.ts`, `plugin/tests/unit/config.spec.ts`, `plugin/tests/unit/index-inject.spec.ts`, `plugin/tests/unit/module-boundaries.spec.ts`.

禁止修改：profile patch/smoke/package metadata, protocol/domain/client, SQLite source/deletion, any additional Runtime test.

执行：

1. Remove `Config.dataRoot` and its schema/test cases. Do not add a replacement path/backend field.
2. Change `CreateStatusRuntimeOptions.dataRoot` to required `repositoryRegistry: DomainRepositoryRegistry`. Creation calls `openMeeting({ teamId, meetingId })` then the existing repository methods. Rehydration calls `listMeetings()` in catalog order and `recoverMeeting()`; delete all `readdir`, locator and repository path use from these four Runtime files. Replace concrete repository annotations with `MeetingRepositoryPort`.
3. In the three contract/recovery suites, replace each `dataRoot` fixture with `DomainRepositoryRegistry.open({ facility: createFakeDomainFacility(), authorizationValidator, now })`; the existing fixture owns registry close through `runtime.dispose()`. Do not change test titles or behavior assertions.
4. Make `apply` exactly `export async function apply(ctx: Context, config: ConfigType): Promise<void>`. Add `storageDomain` once to `inject`. After the existing capability guard, await `DomainRepositoryRegistry.open({ facility: ctx.storageDomain, authorizationValidator })`, pass it to `createCreateStatusRuntime`, and keep the single existing `ctx.effect(() => () => runtime.dispose(), "convivium:runtime")`. `runtime.dispose()` stops Runtime services first and then calls `repositoryRegistry.close()`; `apply` must not register a second registry disposer.
5. `plugin/src/repository/index.ts` exports the shared types, errors, `MeetingRepositoryPort`, `DomainMeetingRepository`, and `DomainRepositoryRegistry`; it no longer exports `SqliteMeetingRepository as MeetingRepository`. Legacy SQLite suites import `SqliteMeetingRepository` directly from `sqlite-meeting-repository.ts` until T17.
6. Update `index-inject.spec.ts`: exact inject array adds `"storageDomain"`; tests await `apply`; lifecycle test supplies fake `storageDomain`, runs collected disposer, and asserts Meeting Domain closes before catalog Domain exactly once. Update `module-boundaries.spec.ts` so repository may import only `@deepseek-ai/dsh-storage-domain` among DSH packages.

验证：

```bash
pnpm --dir plugin test -- tests/contract/continuation.spec.ts tests/contract/meeting-runtime.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin test -- tests/unit/config.spec.ts tests/unit/index-inject.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin build
test -z "$(rg -l 'dataRoot|locateMeetingRepository|readdir|\.sqlite' plugin/src/index.ts plugin/src/config.ts plugin/src/runtime plugin/src/repository/index.ts || true)"
```

PASS：all commands exit 0; final test has empty output; the complete production entry compiles and uses Storage Domain as its only Meeting persistence truth; all listed fixtures use fake Domain registry; lifecycle assertion has one ordered close sequence.

STOP：an unlisted file must change, a Runtime behavior/test requires path inspection/SQLite fallback, or the production entry cannot compile. Failure state：this is the single production cutover step; no real profile or legacy data is opened. Do not enter T15 until the whole step PASSes.

### T15 — Wire Plugin And Real Profile

前置状态：T14 PASS; production build is already fully cut over.

允许修改：`plugin/cordis.patch.yml`, `plugin/scripts/smoke-profile.mjs`, `plugin/tests/contract/package-contract.spec.ts`.

禁止修改：all production TypeScript, package dependencies, public protocol/client/domain behavior, SQLite source/deletion.

执行：

1. Keep `plugin/cordis.patch.yml` as one inserted Convivium row; add no backend package/config to it. Package contract asserts the row id/name and that built host exports `inject` containing `storageDomain`.
2. In `smoke-profile.mjs`, change `packArtifact(artifactDir)` to `packArtifact(packageRoot, artifactDir)` and run build/pack with `cwd: packageRoot`. Call it once for repository `plugin/` and once for repository `storage-plugin/`; install both returned tarballs into the same temporary DSH profile. No source import crosses packages.
3. `writeSmokePatch()` writes these existing-row config patches in this order, followed by the existing Convivium config fields without `dataRoot`:

```js
const patch = [
    "- id: convivium-storage-jsonl",
    "  config:",
    "    root: !!js dshHomePath('convivium-storage-smoke')",
    "- id: storage-domain",
    "  config:",
    "    backend: convivium-jsonl",
    "- id: convivium",
    "  config:",
    `    provider: ${PROVIDER}`,
    "    maxParticipants: 3",
    `    speakerTimeoutMs: ${SMOKE_SCENARIO === "timeout" ? 250 : 60000}`,
    `    outboxPollMs: ${SMOKE_SCENARIO === "timeout" ? 25 : 1000}`,
    ""
].join("\n");
```

After `--dump-config`, call the exact T8 helper with `["storage", "convivium-storage-jsonl", "storage-domain", "convivium"]` before boot. The helper's exactly-once and strictly-increasing checks are the only row-order rule; patch line order is not a substitute for this effective-config assertion.
4. Remove imports and code paths using `DatabaseSync`, SQL strings, `.sqlite`, and direct medium/file inspection. Cold phase asserts only probe/tool results: phase-2 PID differs from phase-1 PID, Meeting ID is equal, recovered Meeting version is not lower, the exact two recorded child Session IDs are equal, and continuation succeeds. Keep every other existing smoke scenario assertion unchanged.

验证：

```bash
pnpm --dir plugin test -- tests/contract/package-contract.spec.ts
pnpm --dir plugin verify
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
test -z "$(rg -l 'DatabaseSync|node:sqlite|SELECT |PRAGMA|\.sqlite|dataRoot' plugin/scripts/smoke-profile.mjs || true)"
```

PASS：all commands exit 0; final test has empty output; dump-config and cold assertions prove the fixed four-row composition and restart recovery through public surfaces.

STOP：row order differs, either tarball is not installed, profile requires Convivium production code/config to know the backend name, or public cold assertions fail. Failure state：only the script-owned mkdtemp DSH profile/root, removed in its existing `finally`; user profile/data and legacy SQLite remain untouched.

### T16 — Prove Cutover Before Deletion

前置状态：T15 PASS.

允许修改：`plugin/tests/unit/module-boundaries.spec.ts`, new `plugin/tests/contract/production-import-graph.spec.ts`.

禁止修改：production code, SQLite source, protocol/design.

执行：import-graph test starts at `plugin/src/index.ts`, resolves relative static imports recursively, and rejects `node:sqlite`, `sqlite-meeting-repository.ts`, `schema.ts`, `migrations.ts`, locator, repository `node:fs`/`node:path`. Add the same exact forbidden set to the repository row in `module-boundaries.spec.ts`. Do not change the smoke script; run its T15 assertions in the three listed scenarios.

验证：

```bash
pnpm --dir storage-plugin verify
pnpm --dir storage-plugin smoke:profile
pnpm --dir plugin test -- tests/contract/production-import-graph.spec.ts
pnpm --dir plugin test -- tests/contract/repository-title-migration.spec.ts
pnpm --dir plugin verify
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
```

PASS：all exit 0; cold uses distinct Host PIDs and same state; mail/cross-meeting assertions unchanged; import graph excludes every forbidden node.

STOP：any scenario needs direct medium inspection or production reaches SQLite. Failure state：only mkdtemp smoke roots, removed in finally; legacy data untouched. T17 forbidden.

### T17 — Delete SQLite Implementation

前置状态：T16 PASS.

允许删除：`plugin/src/repository/sqlite-meeting-repository.ts`, `plugin/src/repository/schema.ts`, `plugin/src/repository/migrations.ts`, `plugin/src/runtime/services/meeting-repository-locator.ts`, `plugin/tests/unit/repository/migrations.spec.ts`, `plugin/tests/unit/repository/schema.spec.ts`, `plugin/tests/unit/repository.spec.ts`, `plugin/tests/unit/repository/session-ownership.spec.ts`, `plugin/tests/contract/repository-title-migration.spec.ts`.

允许修改：`docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`, `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`, `docs/00-governance/ARCHITECTURE.md`.

禁止修改：`plugin/tests/contract/domain-meeting-repository.spec.ts`, every other production/test/script/package file, public protocol/domain/client behavior, user/legacy data files.

执行：

1. Before deletion run `pnpm --dir plugin test -- tests/contract/repository-title-migration.spec.ts`; it must PASS. Also assert `plugin/tests/contract/domain-meeting-repository.spec.ts` is unchanged since T12 and contains exactly 26 `it(...)` calls. The manifest test has already proven the complete 26-port/9-delete partition; no executor comparison or classification is permitted.
2. Delete the exact allowed source and test files, including the now-consumed temporary manifest test. The following nine SQLite-only titles are intentionally deleted without replacement because T1 declared no legacy format/migration/journal compatibility:

```text
rejects a second repository claiming the same initially empty database
rejects a non-empty version-zero database instead of treating it as fresh
reports the requested meeting for an unsupported schema version
upgrades a version-two bootstrap without replaying current schema DDL
isolates a database whose stored identity differs from the requested meeting
keeps an untrusted database in rollback journal mode before identity validation
defaults legacy meeting state without MeetingTasks at the read boundary
migrates legacy accepted Decision audit fields from its CompletionFact
rejects a mismatched version-two database before migration writes it
```

3. In `MEETING-STORAGE-INTERFACE.md#Compatibility`, replace its T1 sentence with exactly: `V1 只以 DSH Storage Domain 为 production truth；不读取、迁移、删除或回退到 legacy SQLite，现存 SQLite 数据不在本接口范围内。`
4. In `ARCHITECTURE.md`, replace the complete bullets identified by the following unique prefixes. Each prefix must match exactly once before edit and zero times after:

| Existing prefix | Fixed replacement |
| --- | --- |
| `目标仓库包含两个职责独立` | 仓库包含两个职责独立且已验证的 DSH 插件工程：`plugin/` 是 Convivium Meeting 产品插件，`storage-plugin/` 是通用 JSONL DSH Storage Backend；两者各自维护 package、lockfile、构建和验证入口，不建立根 workspace，也不在源码中互相依赖。 |
| `每个 Meeting 在任何会议副作用前` | 每个 Meeting 在任何会议副作用前获得稳定 `meetingId`，并以 `teamId + meetingId` 形成独立 repository ownership。Convivium 只通过 `@deepseek-ai/dsh-storage-domain` 使用轻量 catalog domain 和每 Meeting 独立 domain，不定位、扫描或依赖 backend 物理布局。 |
| `[Meeting Persistence Design]` | Replace exact substring `切换前 SQLite 是唯一事实源，切换后 Storage Domain 是唯一事实源；禁止双写、fallback 和自动迁移，旧 SQLite 源码只在切换验证后删除，现存数据不自动删除。` with `Storage Domain 是唯一 production truth；不存在双写、fallback 或自动迁移，现存 SQLite 数据不自动读取或删除。`; no other byte changes. |
| `Meeting Runtime 可以从 SQLite` | Meeting Runtime 可以从 repository snapshot best-effort 生成供开发者在 workspace 中阅读的 Markdown 辅助文件；Markdown 不是产品接口或事实源，不参与恢复、授权、状态计算、Session 关闭、capability 撤销或归档完成判断。 |
| `不直接管理 AgentSession，不直接访问 SQLite` | 不直接管理 AgentSession，不直接访问持久化介质、敏感配置或任意文件系统路径。 |
| `Meeting 的 SQLite、开发者 Markdown` | Meeting 的 Storage Domain records、开发者 Markdown、Session ownership 和归档数据必须以 `teamId + meetingId` 为共同生命周期 ownership；调用方不得假设 backend 物理路径。 |
| `Convivium 不得向 DSH Session 写入` | Keep the bullet byte-identical except replace `会议领域事件写入 SQLite meeting_events` with `会议领域事件由 Meeting Repository commit 持久化`. |
| `开发者 Markdown 只能单向派生自 SQLite` | Keep the bullet byte-identical except replace `SQLite` with `Meeting Repository snapshot`. |

5. In `CONVIVIUM-IMPLEMENTATION-DESIGN.md`, replace the complete range from heading `## Persistence Algorithm And Repository Cutover` through the line immediately before `## Meeting Session Adapter` with this exact Markdown (then retain the existing Meeting Session Adapter heading):

```md
## Persistence Algorithm And Storage Domain Repository

Meeting persistence uses the `Checkpointed Commit Log` defined by [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md). Convivium consumes only `@deepseek-ai/dsh-storage-domain`; the independent `storage-plugin/` owns JSONL media. The packages share no source dependency.

### Domain ownership

- `convivium_catalog` contains only lightweight discovery and creation-status records.
- Each Meeting owns one Domain containing creation, commit and paged-checkpoint tables.
- `DomainRepositoryRegistry` owns catalog discovery, Meeting Domain cache and close order.
- `DomainMeetingRepository` implements `MeetingRepositoryPort`; one ready mutation writes zero or one `CommitRecordV1`.

### Recovery and compatibility

Current truth is the published checkpoint plus its continuous commit tail. Gap, digest error, missing ready commit or invalid schema fails loud. V1 does not read, migrate, delete or fall back to legacy SQLite. The stable record, method, error and recovery contract is [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md).
```
6. In the remainder of `CONVIVIUM-IMPLEMENTATION-DESIGN.md`, perform only these substitutions; every source phrase must match before edit: `从 SQLite 读取` → `从 Meeting Repository 读取`; `SQLite ownership record` → `Meeting Repository ownership record`; `最新 SQLite 事实` → `最新 Meeting Repository 事实`; `终态 SQLite snapshot` → `终态 Meeting Repository snapshot`; `从 SQLite snapshot` → `从 Meeting Repository snapshot`; `SQLite capability` → `storageDomain capability`; `SQLite、workspace` → `持久化介质、workspace`. Delete the error-table row whose first cell is `SQLite busy`. Delete the complete numbered item beginning `实现 SQLite schema` and the complete item beginning `SQLite driver、schema version`; leave Markdown automatic numbering as `1.`.
7. Do not change any other document text, add migration code, compatibility assertions or legacy path scanning.

验证：

```bash
test -z "$(rg -l 'node:sqlite|DatabaseSync|\.sqlite|CREATE TABLE|PRAGMA|locateMeetingRepository' plugin/src plugin/scripts plugin/package.json || true)"
test "$(rg -c '^    it\(' plugin/tests/contract/domain-meeting-repository.spec.ts)" -eq 26
test ! -e plugin/src/repository/sqlite-meeting-repository.ts
test ! -e plugin/src/repository/schema.ts
test ! -e plugin/src/repository/migrations.ts
test ! -e plugin/src/runtime/services/meeting-repository-locator.ts
test ! -e plugin/tests/unit/repository/migrations.spec.ts
test ! -e plugin/tests/unit/repository/schema.spec.ts
test ! -e plugin/tests/unit/repository.spec.ts
test ! -e plugin/tests/unit/repository/session-ownership.spec.ts
test ! -e plugin/tests/contract/repository-title-migration.spec.ts
test -z "$(rg -l '目标仓库包含两个职责独立|每个 Meeting 在任何会议副作用前.*当前未替换|Meeting Runtime 可以从 SQLite|Meeting 的 SQLite、开发者 Markdown|SQLite ownership record|从 SQLite 读取|SQLite busy' docs/00-governance/ARCHITECTURE.md docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md || true)"
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify
```

PASS：all shell tests and commands exit 0; every exact legacy source/test path is absent; T12 contract retains 26 predeclared titles; fixed current-state documentation phrases are absent.

STOP：the fixed migration-manifest test fails, the T12 file changed/count differs, or any production/test import remains. Do not compare/classify titles manually and do not invent a replacement assertion or compatibility layer. Failure state：source deletion only and recoverable from Git; no data deletion.

### T18 — Full Validation And Readiness

前置状态：T17 PASS.

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` only.

禁止修改：all production/test code, TODO.

执行：run commands; append one dated evidence section with exact versions, commands/results, backend name, smoke scenarios, single-writer boundary, and `Not Covered: legacy SQLite migration/deletion, multi-Host writer, remote filesystem`.

验证：

```bash
pnpm --dir storage-plugin typecheck
pnpm --dir storage-plugin test
pnpm --dir storage-plugin build
pnpm --dir storage-plugin verify
pnpm --dir storage-plugin smoke:profile
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
git diff --check
```

PASS：all exit 0; readiness contains every command and Not Covered item; no claim of legacy migration/deletion.

STOP：any command fails or evidence would overstate coverage. Failure state：readiness document only; implementation remains uncommitted.

### T19 — Close And Delete RUNBOOK

前置状态：T18 PASS; implementation has completed normal review/PR and readiness contains final commit/PR identity. This step requires separate user authorization if it involves commit/PR operations; this RUNBOOK itself does not grant it.

允许修改：`docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`, `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`; delete this RUNBOOK.

禁止修改：production code, tests, TODO, readiness evidence except broken link repair.

执行：

1. Before edit run `test "$(rg -l 'RUNBOOK-MEETING-PERSISTENCE-PLUGIN-INTEGRATION|Meeting Persistence Plugin Integration' docs | sort)" = "$(printf '%s\n' docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md docs/30-designs/RUNBOOK-MEETING-PERSISTENCE-PLUGIN-INTEGRATION.md)"`; nonzero STOPs.
2. In Persistence Design, replace the complete paragraph beginning `上述插件实现细节暂存于` with `插件 record、Storage Domain 和 backend 接入边界由 [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 定义；实现不得反向改变本文算法语义。` Replace its Related Documents RUNBOOK bullet with `- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)`.
3. In Implementation Design Related Documents, replace its RUNBOOK bullet with `- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)`.
4. Delete this RUNBOOK. Do not archive it or modify another reference.

验证：

```bash
test -z "$(rg -l 'RUNBOOK-MEETING-PERSISTENCE-PLUGIN-INTEGRATION|Meeting Persistence Plugin Integration' docs)"
git diff --check
```

PASS：both exit 0; no dangling link; readiness retains evidence.

STOP：review/PR identity absent, the exact pre-delete path equality fails, or link check fails. Failure state：restore RUNBOOK/reference deletion before stopping; no runtime data.

## Validation Matrix

| Risk | Exact test/command | Expected result |
| --- | --- | --- |
| successful KV writes | `storage-plugin/tests/contract/backend.spec.ts` | reopen observes put/delete/global |
| partial/failed write | unit + tail recovery suites | no memory advance; only final tail repair |
| medium corruption/version | backend/recovery suites | malformed/version errors, no partial load |
| physical checkpoint crash | checkpoint recovery suite | old or new complete truth only |
| commit atomicity | domain repository contract spy | one commit put, zero other authoritative puts |
| idempotency/version/auth | domain repository contract | same replay, conflict, stale and unauthorized exact errors |
| mail/outbox lease | domain repository contract | current ordering/token/deadline behavior preserved |
| application checkpoint | app checkpoint suite | bounded pages, monotonic pointer, safe GC |
| creation interruption | registry recovery suite | every recovery matrix row exact |
| per-Meeting isolation | registry + cross-meeting smoke | no state/session crossover |
| restart | backend smoke + cold-rebind | distinct PID sees same committed truth |
| production path | import graph | no filesystem/backend/SQLite dependency |
| package/profile | verify + dump config | correct exports, rows, route and lifecycle |
| full behavior | both `verify` plus three smoke scenarios | all exit 0 |

Caller/authority, stale version, terminal immutability, array-invalid atomicity, receipt/event/outbox/projection/archive consistency remain covered by the existing `meeting-runtime`, continuation, recovery and domain repository contract suites. GUI visual testing is Not Applicable: this task changes no client code or visible UI contract.

## Failure Recovery

- T0–T13 failures cannot affect production because new adapter is not in the production entry.
- T14 is the complete production cutover and must compile/build independently; failure leaves only source changes and never opens a real profile.
- T15–T18 use only temporary smoke profiles and test roots. Failure cleanup removes only paths created by the corresponding script and printed in its output.
- A backend/application checkpoint failure never invalidates an already durable commit. It leaves the last valid pointer/log and an orphan generation.
- No step opens legacy SQLite after T14, and no step deletes legacy data.
- Source deletion at T17 is recoverable from Git, but user changes must not be reset; failed validation stops for human review.

## Traceability And Completion

| Scope item | Interface/design | Production symbols | Focused proof | Full proof |
| --- | --- | --- | --- | --- |
| JSONL backend | DSH API + physical contract | T3–T6 files | backend/recovery suites | storage verify/smoke |
| bounded commit/checkpoint | Persistence Design + storage interface | projection/repository/checkpoint | T10–T12 | plugin verify/cold |
| catalog discovery | FR-11 + registry contract | registry/recovery service | T13 | local/cross smoke |
| lifecycle/cutover | Architecture | entry/runtime/registry | T14–T16 | both verify suites |
| SQLite deletion | one-truth invariant | exact T17 files | import graph/rg | plugin verify |

完成定义：T0–T18 全部 PASS，production import graph 只到 Storage Domain，两个 package 分别验证，真实 profile 冷恢复通过，SQLite 源码删除且 legacy 数据未触碰，readiness 记录真实证据。T19 只负责在 review/merge 后迁移引用并删除临时 RUNBOOK。

## Author Audit Record

- 2026-09-01 Author + Audit conclusion: `Executable`; all T0–T19 steps contain precondition, exact allowed/forbidden scope, execution, validation, PASS, STOP and failure state.
- Implementation Economy: every production structure in File And Symbol Map maps to the gate table; no future adapter/factory/worker/compatibility/migration/hook/metrics framework remains. Application and physical checkpointing reuse their required existing ordering chain and add no checkpoint queue.
- Repository evidence: T0 fixes the 19-method/2-property surface; T9 fixes all 16 current barrel-import paths; T12/T17 fix the machine-checked 26-port/9-delete test partition.
- DSH evidence: all target signatures and profile assertions are locked to `0.1.1-rc.2`; a declaration/profile mismatch is STOP, not an adaptation task.
- Author checks run from repository root: existing relative Markdown targets resolve; the four `MEETING-STORAGE-INTERFACE.md` links are planned outputs created by T1 and are the only intentionally absent targets; `git diff --check` exits 0.
- Not Covered at authoring time: no T0–T19 implementation or runtime validation has been executed; their results may only be recorded during RUNBOOK execution and T18 readiness.
