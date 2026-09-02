# RUNBOOK: Meeting Persistence Plugin Integration

## Status And Work Boundary

- 状态：Executable（T10F correction；T11 在 fixture contract 缺失处 STOP）
- 建立日期：2026-09-01
- 最后审计日期：2026-09-02
- 当前执行进度：T0–T10 已 PASS，T10 commit 为 `4a72063`。T11 因 T10 已提交的 fake Domain fixture contract 缺失而 STOP；正文第一项为 T10F。T10F PASS、删除并提交前不得恢复 T11。
- 执行目录：仓库根目录。执行前必须运行 `git rev-parse --show-toplevel`；文档和证据中不得记录机器绝对路径。
- 当前起点：`plugin/` 通过 `node:sqlite` 实现每 Meeting repository，`Config.dataRoot` 和目录扫描属于 Convivium。
- 目标终点：`plugin/src/storage/` 实现 package-private JSONL DSH `StorageBackend` provider child plugin；Meeting consumer child plugin 只使用 `@deepseek-ai/dsh-storage-domain` 和自身 record schema；验证切换后删除 SQLite 源码。
- 授权边界：本文授权修改本文列出的仓库文件、运行列出的本地验证，并按 `Executor Contract` 为每个 PASS 步骤创建一个本地 commit；不授权 push、PR、merge、修改用户 DSH profile、迁移或删除现存 `.sqlite` 数据。

## Executable Gate

本文只有在执行者能够把 T0–T10（T10=`4a72063`）视为固定历史，先执行 T10F，再恢复 T11 并继续到 T19，且不需要选择数据结构、接口、文件、symbol、实现方案、错误语义、测试范围或失败处理时才可保持 `Executable`。T10F 未 PASS、删除或提交不得恢复 T11。发现任何一步仍需上述判断时立即 STOP，并把本文状态改为 `Not Executable`；不得边猜边执行。

## Executor Contract

- T0–T10 只以固定历史提交为完成证据；T10=`4a72063`。严格从正文第一项未完成步骤 T10F 开始，T10F 未 PASS、未删除或未提交时不得恢复 T11。
- 每步只修改“允许修改”列出的文件和 symbol；不存在的既有路径/symbol 或必需的额外改动立即 STOP。
- T14 前 SQLite 是唯一 production truth；T14 后 Storage Domain 是唯一 production truth。
- 禁止双写、fallback、自动迁移、扫描或删除 legacy `.sqlite`。
- 禁止把完整 Meeting projection 作为一次 backend write；一次 command 只允许一个 `CommitRecordV1` write。
- 禁止用 `any`、`unknown as`、`@ts-ignore`、放宽 Schema/限制/断言或跳过测试绕过失败。
- PASS 是验证命令退出 0 且本步列出的断言全部成立；没有“基本通过”。
- STOP 报告必须包含：最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、实际输出、`git status --short`、继续所需人工决定。
- STOP 时保留工作树，不回滚用户已有改动，不运行 destructive Git 命令。
- 每步“允许修改”额外且只额外包含本文 RUNBOOK：该步全部验证 PASS 后，删除从当前 `### Tn` heading 到下一 `### Tn+1` heading 前的完整当前步骤；T19 删除全文。不得提前删除、改写后续步骤或修改本文其他 section。
- 删除当前步骤后运行 `git diff --check`，只 stage 本步允许文件和 RUNBOOK，复读 staged diff，再使用下表固定 commit message。commit PASS 后才进入下一步；commit 失败 STOP。不得 amend、squash、push 或把其他工作区文件纳入 commit。

| Step | Exact commit subject |
| --- | --- |
| T0 | `Docs(repo/runbook): 锁定存储切换执行基线` |
| T1 | `Docs(repo/persistence): 固化 Meeting Storage Interface` |
| T2 | `Build(plugin/storage): 锁定内置存储依赖` |
| T3 | `Feat(plugin/storage): 建立 JSONL 持久写入与故障边界` |
| T4 | `Feat(plugin/storage): 建立 JSONL unit 重放与变更语义` |
| T5 | `Fix(plugin/storage): 完成物理 checkpoint 与恢复边界` |
| T6 | `Feat(plugin/storage): 建立内置 backend 生命周期` |
| T7 | `Test(plugin/storage): 锁定 package-private backend 边界` |
| T7C | `Test(plugin/storage): 修正 package-private backend 边界验证` |
| T8 | `Test(plugin/storage): 证明 provider 与 Domain child 组合` |
| T9C | `Docs(repo/persistence): 补齐 Meeting Repository 私聊端口` |
| T9D | `Docs(repo/persistence): 修正 Meeting Repository 私聊签名` |
| T9 | `Refactor(plugin/repository): 提取稳定 Repository Port` |
| T10 | `Feat(plugin/repository): 固化 Domain schema 与 projection codec` |
| T10F | `Test(plugin/repository): 修正 Domain storage fixture 契约` |
| T11 | `Feat(plugin/repository): 建立应用 checkpoint` |
| T12 | `Feat(plugin/repository): 实现 Domain Meeting Repository` |
| T13 | `Feat(plugin/repository): 建立 catalog registry 与恢复` |
| T14 | `Feat(plugin/persistence): 切换到内置 storage child 组合` |
| T15 | `Feat(plugin/persistence): 接通单 package DSH profile` |
| T16 | `Test(plugin/persistence): 证明 SQLite 路径不可达` |
| T17 | `Feat(cross-project): 删除 SQLite 实现并收口存储设计` |
| T18 | `Docs(repo/readiness): 记录 Storage Domain 切换证据` |
| T19 | `Docs(repo/persistence): 关闭持久化接入 RUNBOOK` |

T17 commit body 必须追加三行：`Projects: plugin, repo`、`Decision: Storage Domain 已成为唯一 production truth，SQLite 实现与过渡文档必须原子删除。`、`Verification: pnpm --dir plugin verify`。其他步骤不添加固定 body。

## Goal And Complete Chain

工程链路固定为：

```text
DSH profile
  -> @deepseek-ai/dsh-storage hub
  -> @convivium/dsh-plugin top-level fiber
       -> jsonlStoragePlugin provider child (backend name: convivium-jsonl)
       -> meetingPlugin consumer child (injects storageDomain)
  -> @deepseek-ai/dsh-storage-domain (backend: convivium-jsonl; waits for provider service)
  -> meetingPlugin becomes active
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
| Backend ownership | `plugin/src/repository/index.ts` imports `node:sqlite` | JSONL IO only in `plugin/src/storage/` | T2–T7 |
| Repository location | `plugin/src/runtime/services/meeting-repository-locator.ts#locateMeetingRepository` | no production path locator | T14–T17 |
| Discovery | `plugin/src/runtime/services/meeting-recovery-service.ts#createMeetingRehydrationService` scans directories | enumerate `convivium_catalog.meetings` | T13–T14 |
| Runtime construction | `plugin/src/index.ts#apply` constructs SQLite Runtime directly | top-level mounts provider child and `storageDomain` consumer child | T14 |
| Repository surface | `plugin/src/repository/index.ts#MeetingRepository` combines types and SQLite | shared types + `MeetingRepositoryPort` + two temporary implementations | T9–T12 |
| Cold smoke | `plugin/scripts/smoke-profile.mjs` imports `DatabaseSync` | public tool/status assertions only | T15–T16 |
| Storage composition | web profile currently routes `storage-domain` to `json` | bundle/smoke patch routes it to child backend `convivium-jsonl` | T15 |
| SQLite removal | schema/migration/tests remain required by current implementation | delete only after production import graph proof | T17 |

## Scope And Non-goals

### Scope

- Add a package-private `plugin/src/storage/` provider child plugin implementing the locked DSH KV backend contract.
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
- A second package, lockfile, publishable backend entry, root workspace or monorepo.

### Implementation Economy Gate

本文只允许下列新增结构；表中“当前依据”是其存在理由，不得把任何一项扩展成通用框架：

| 新增结构 | 唯一职责 | 当前正式依据 |
| --- | --- | --- |
| `plugin/src/storage/` | 在同一 Convivium package 的 provider child 边界内兑现单 record JSONL durability | Architecture 的单 package child-plugin 组合；Persistence Design 的 bounded atomic record 要求 |
| `FileSystemPort` | 对 append、sync、rename、truncate 的已确认崩溃点做确定性故障注入 | Persistence Design Acceptance 1、4、7；真实文件崩溃不能稳定复现。它只在 `plugin/src/storage/` 内部使用且不从 package root 导出 |
| `MeetingRepositoryPort` | 保持现有 19 个 repository 方法的稳定业务边界，使 Runtime 不依赖 SQLite 或 DSH 实现 | 当前 SQLite Repository Interface；Architecture 要求 Convivium 只通过 DSH storage interface 接入 |
| `DomainMeetingRepository` | 把现有 repository 语义映射到一个 per-Meeting Domain | DSH consumer 必须使用 Storage Domain；Persistence Design 的 one-commit invariant |
| `DomainRepositoryRegistry` | 以 catalog 发现 Meeting，并集中拥有已打开 Domain 的关闭顺序 | FR-11 本地恢复/发现；DSH Domain 必须显式 open/close；替代现有目录扫描和 locator |
| catalog/Meeting `DomainSpec` 与 strict schema | 固定 provider/consumer child 之间经 DSH Domain 承载的数据结构，并在读取边界拒绝非法数据 | Architecture 的 child-plugin 边界；DSH Storage Domain `invalid-record` 契约 |
| deterministic patch、commit 与分页 checkpoint | 一个有界 commit 原子表示一次命令；在不大写入的前提下合成当前真相 | Meeting Persistence Design 全部算法不变量和 Acceptance 1–7 |
| physical checkpoint | 限制 JSONL backend 的 replay tail 和介质增长 | Meeting Persistence Design 的 bounded recovery/capacity；internal storage child 不能依赖 Meeting checkpoint 的存在 |
| repository `mutationChain` | 把 validation、head/seq allocation、diff 和 commit put 作为同一 Meeting 的顺序单元 | 当前并发 command/lease 行为；DSH Domain 只串行单次 table write，不串行 write 之前的 Convivium transition |
| per-unit operation queue | 保持直接并发 `KvUnit` mutation、segment rollover 和 physical checkpoint 的调用顺序 | Locked DSH API 明确 `KvUnit` 不负责串行；StorageBackend 必须独立兑现调用顺序 |
| active log + immutable segments + checkpoint pointer layout | 只允许修复 active EOF，并把历史介质损坏与崩溃尾部区分 | Persistence Design 的 fail-loud corruption、restart 和 bounded-tail acceptance |
| two layer-local canonical codecs | backend 校验任意 KV JSON，repository 独立计算业务 commit/checkpoint digest | 两层 digest 的 producer/consumer 和错误语义不同；不建立共享 codec、adapter 或第三层抽象 |

Application checkpoint runs only as a task appended to `mutationChain`; physical checkpoint runs only as a task appended to the per-unit operation queue. Neither layer creates a checkpoint queue, timer or worker. The single `maintenanceError` field at each layer records the last failed task solely so the next hard-tail write can retry-or-refuse and `close()` can drain; it is cleared after a successful checkpoint and has no callback/hook.

禁止新增 adapter registry、repository factory hierarchy、background worker、兼容层、migration layer、通用 event-sourcing framework、可插拔 codec、metrics framework、hook/callback 扩展点或未来版本字段。测试所需时间源只复用现有 `now?: () => number`；文件故障只使用上表的 `FileSystemPort`。执行中若必须新增表外结构、状态、事件、adapter、worker、依赖、兼容层或扩展点，立即 STOP，报告触发它的当前需求/失败/边界；没有需求/接口/架构不变量、可复现失败、必要隔离边界或多个当前消费者的稳定共享语义之一不得继续。

## Formal Sources And Locked Evidence

- [Architecture](../00-governance/ARCHITECTURE.md), sections `Confirmed Baseline`, `Dependency Rules`, `Source Layout And Verification`.
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md), `FR-2`, `FR-9`, `FR-10`, `FR-11` and Acceptance 13–15, 21–24.
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md), all current repository behavior until T14.
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

Backend child registration is exactly:

```ts
export const BACKEND_NAME = "convivium-jsonl";

export const jsonlStoragePlugin = {
  name: "convivium-storage-jsonl",
  inject: ["storage"] as const,
  apply(ctx: Context, config: JsonlStorageConfig): void {
    const backend = new JsonlStorageBackend(config.root);
    ctx.effect(() => {
        const unregister = ctx.storage.backend.register(BACKEND_NAME, backend);
        return async () => {
            unregister();
            await backend.close();
        };
    });
    ctx.provide(storageBackendServiceKey(BACKEND_NAME), backend);
  }
};
```

`plugin/src/index.ts#apply` mounts `jsonlStoragePlugin` with `root = resolve(process.cwd(), config.dataRoot ?? ".convivium", "storage")`, then registers `ctx.inject(["storageDomain"], meetingPlugin)`. Only `plugin/src/storage/index.ts` imports `BACKEND_NAME`; repository code imports only `@deepseek-ai/dsh-storage-domain`. `cordis.patch.yml` fixes the existing `storage-domain` row to `{ backend: "convivium-jsonl" }` and adds no backend row.

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

## Internal Storage Child Physical Contract

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

`nodeFileSystemPort` delegates one-for-one to `node:fs/promises`. Symlinks or non-regular files anywhere below a unit directory cause `StorageError("malformed-medium")`; the backend never follows them. Child config is exactly `export interface JsonlStorageConfig { root: string }`; it has no Schemastery export because the trusted top-level Convivium plugin constructs it internally. `plugin/src/index.ts` resolves the configured Convivium data root once and passes the absolute `<dataRoot>/storage` path.

Helper signatures are fixed:

```ts
encodeCanonicalJson(value: unknown): Uint8Array;
decodeCanonicalJson(bytes: Uint8Array): JsonValue;
sha256Hex(bytes: Uint8Array): string;
syncDirectory(path: string, fs?: FileSystemPort): Promise<void>;
replaceFileDurably(path: string, bytes: Uint8Array, fs?: FileSystemPort): Promise<void>;
createFileDurably(path: string, bytes: Uint8Array, fs?: FileSystemPort): Promise<void>;
appendLineDurably(path: string, line: Uint8Array, fs?: FileSystemPort): Promise<void>;
type AppendFailurePhase = "write" | "datasync";
appendFailurePhase(error: unknown): AppendFailurePhase | undefined;
readJsonl(
    path: string,
    policy: "immutable" | "active-tail",
    fs?: FileSystemPort
): Promise<readonly Uint8Array[]>;
```

`appendLineDurably` records the phase of an object-valued rejection in a module-private `WeakMap<object, AppendFailurePhase>` and rethrows the exact same rejection object. `appendFailurePhase()` is the only typed reader of that map. `JsonlKvUnit` uses it solely to poison an open unit after `datasync`; production code must not read `ScriptedFileSystem.calls()`, inspect error messages or cast the filesystem/error to `any`. No callback, hook or exported package API is added.

The test-only fault fixture is fixed and is never exported from `plugin/src/storage/`. Faults use semantic publication phases, never internal call counts:

```ts
type FaultPoint =
    | "append.write"
    | "append.datasync"
    | "active-tail.truncate"
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

`ScriptedFileSystem` assigns phases from the path role plus operation: non-checkpoint JSONL append → `append.*`; repair truncation performed by `readJsonl(..., "active-tail")` → `active-tail.truncate`; same-directory `.tmp` used by `replaceFileDurably` → `replace.*`; checkpoint `records.jsonl`, `root.json`, `checkpoint-pointer.json.tmp`, pointer rename, and covered-segment unlink → their literal checkpoint phase. Arming an unmatched phase is a test failure in `afterEach`; arming twice before consumption throws.

The exact T3 tests are:

| File / exact title | Initial bytes | Arm | Trigger | Exact assertion |
| --- | --- | --- | --- | --- |
| `jsonl.spec.ts#rejects before append write` | `active.jsonl` contains one valid LF-terminated line A | `failNext("append.write", fault)` | append valid line B | rejects `fault`; one write call; zero datasync; bytes equal A |
| `jsonl.spec.ts#repairs a short append on active-tail reopen` | A | `shortWriteNext("append.write", 5)` | append B, then `readJsonl(..., "active-tail")` | append rejects `short-write`; zero datasync; reopen returns only A and truncates to exact A byte length |
| `jsonl.spec.ts#observes a complete line after datasync reports failure` | A | `failNext("append.datasync", fault)` | append B, then active-tail read | append rejects `fault`; one full write and one datasync; read returns A,B; no truncate |
| `jsonl.spec.ts#reports active-tail truncate failure without appending` | A plus five-byte prefix of non-LF B | `failNext("active-tail.truncate", fault)` | active-tail read | rejects exact `fault`; bytes unchanged; one truncate attempt; zero append write/datasync |
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

interface UnitDescriptorRecordV1 {
    formatVersion: 1;
    name: string;
    unitVersion: number;
    tables: string[];
    hasGlobal: boolean;
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

Descriptor `digest` is `sha256Hex(encodeCanonicalJson(record without digest))`. A missing descriptor is written through `createFileDurably`; an existing descriptor is read through `FileSystemPort.open(..., "r").readFile()`. `unitVersion` alone differing from the requested DSH `descriptor.version` throws `StorageError("version-mismatch")`; invalid digest/format/name/table order/table set/`hasGlobal` throws `StorageError("malformed-medium")`. Directory create, descriptor IO, segment IO, replay, truncate and cleanup all use `FileSystemPort`; `plugin/src/storage/unit.ts` must not import `node:fs` or `node:fs/promises`.

Operation `digest` is `sha256Hex(encodeCanonicalJson(record without digest))`. Replay validates the digest, strictly continuous positive `opSeq`, exact `kind`, declared table, key/value shape and every encoded limit before applying. `loadAll()` is async and returns one empty object for every declared table plus `global: null` when never set or not declared. Undeclared table use and `setGlobal()` when `hasGlobal === false` throw plain `Error` before IO. Before appending record 257, or before an append whose resulting active bytes would exceed `SEGMENT_MAX_BYTES`, the queue renames the nonempty active log to `segments/<20-digit-first-op-seq>.jsonl`, syncs the segments directory, then creates the new active log; closed segments are replayed in numeric first-op-seq order and filename/order mismatch is malformed medium.

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

### `plugin/src/storage/` new files

| File | Symbols |
| --- | --- |
| `plugin/src/storage/config.ts` | `JsonlStorageConfig` internal interface |
| `plugin/src/storage/errors.ts` | `JsonlStorageErrorCode`, `JsonlStorageError` |
| `plugin/src/storage/canonical-json.ts` | `JsonValue`, `encodeCanonicalJson`, `decodeCanonicalJson`, `sha256Hex` |
| `plugin/src/storage/filesystem.ts` | `FileHandlePort`, `FileSystemPort`, `nodeFileSystemPort`, `syncDirectory`, `replaceFileDurably` |
| `plugin/src/storage/format.ts` | physical schemas, encoders, decoders, limits |
| `plugin/src/storage/jsonl.ts` | `appendLineDurably`, `readJsonl`, `createFileDurably` |
| `plugin/src/storage/checkpoint.ts` | `loadPhysicalCheckpoint`, `writePhysicalCheckpoint`, `collectPhysicalOrphans` |
| `plugin/src/storage/unit.ts` | `JsonlKvUnit`, `openJsonlUnit` |
| `plugin/src/storage/backend.ts` | `JsonlStorageBackend`, descriptor validation/open/close |
| `plugin/src/storage/index.ts` | `BACKEND_NAME`, `jsonlStoragePlugin`; internal source entry only |
| `plugin/tests/fixtures/storage/scripted-filesystem.ts` | test-only `ScriptedFileSystem`; exact failure injection surface above |

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
| `src/index.ts` | top-level provider/consumer child composition; retain `Config.dataRoot` as the single physical root input |
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
9. Repository and Meeting Runtime have no filesystem or `@deepseek-ai/dsh-storage` import after cutover.
10. `plugin/src/storage/` has no Convivium business dependency and is not exported from package root.
11. SQLite and Storage Domain are never production truths at the same time.
12. Existing `.sqlite` files are untouched.

## Mechanical Execution

Every step uses the fixed STOP report from `Executor Contract`. “Failure state” states whether repository or external data can have changed.

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

### T14 — Cut Production Over Through Child Plugins

前置状态：T13 PASS；SQLite remains the only production truth before this step；T8 已证明真实 Cordis provider/domain child composition。

允许修改：`plugin/src/runtime/meeting-runtime.ts`, `plugin/src/runtime/application-service/index.ts`, `plugin/src/runtime/application-service/create-meeting.ts`, `plugin/src/runtime/services/meeting-recovery-service.ts`, `plugin/src/index.ts`, `plugin/src/repository/index.ts`; `plugin/tests/contract/continuation.spec.ts`, `plugin/tests/contract/meeting-runtime.spec.ts`, `plugin/tests/recovery/recovery.spec.ts`, `plugin/tests/unit/index-inject.spec.ts`, `plugin/tests/unit/module-boundaries.spec.ts`。

禁止修改：`plugin/src/config.ts`、`plugin/cordis.patch.yml`、smoke/package metadata、protocol/domain/client、SQLite source/deletion、任何其他 Runtime test。

执行：

1. 保留 `Config.dataRoot` 及其现有 Schema/default/tests；它是内置 JSONL backend 的唯一物理 root 输入，不新增 backend/path 配置。
2. Change `CreateStatusRuntimeOptions.dataRoot` to required `repositoryRegistry: DomainRepositoryRegistry`. Creation calls `openMeeting({ teamId, meetingId })` then existing repository methods. Rehydration calls `listMeetings()` in catalog order and `recoverMeeting()`; delete all `readdir`, locator and repository-path use from these four Runtime files. Replace concrete repository annotations with `MeetingRepositoryPort`.
3. In the three contract/recovery suites, replace each `dataRoot` fixture with `DomainRepositoryRegistry.open({ facility: createFakeDomainFacility(), authorizationValidator, now })`; the existing fixture owns registry close through `runtime.dispose()`. Do not change test titles or behavior assertions.
4. In `plugin/src/index.ts`, keep the public `name` and `Config` exports. The exact public `inject` array is the prior seven service names plus one final `"storage"`; it must not contain `"storageDomain"`.
5. Move the current capability guard, repository registry open, Runtime construction, route/tool registration and all their effects into one non-exported `async function applyMeetingPlugin(ctx: Context, config: ConfigType): Promise<void>`. It opens `DomainRepositoryRegistry` from `ctx.storageDomain`, passes it to `createCreateStatusRuntime`, and registers only the existing single `runtime.dispose()` effect; Runtime disposal stops services then closes Meeting domains and catalog.
6. Make public `apply` exactly synchronous and limited to child composition:

```ts
export function apply(ctx: Context, config: ConfigType): void {
    ctx.plugin(jsonlStoragePlugin, {
        root: resolve(process.cwd(), config.dataRoot ?? ".convivium", "storage")
    });
    ctx.inject(["storageDomain"], (meetingCtx) => applyMeetingPlugin(meetingCtx, config));
}
```

Do not await either child, create a third child, add a disposer, import backend symbols other than `jsonlStoragePlugin`, or expose Meeting tools/routes outside `applyMeetingPlugin`. Cordis owns child disposal.
7. `plugin/src/repository/index.ts` exports shared types, errors, `MeetingRepositoryPort`, `DomainMeetingRepository`, and `DomainRepositoryRegistry`; it no longer exports `SqliteMeetingRepository as MeetingRepository`. Legacy SQLite suites import `SqliteMeetingRepository` directly until T17.
8. Update `index-inject.spec.ts` with exactly three cases: public inject array ends in `storage` and has no package-name keys; `apply` mounts `jsonlStoragePlugin` once with the exact resolved `<dataRoot>/storage` root and registers one `storageDomain` consumer; running the consumer then its Runtime disposer closes Meeting domains before catalog, while parent disposal closes provider afterward. Use a fake Context only for call capture; T8 already owns real Cordis behavior.
9. Update `module-boundaries.spec.ts` so repository may import only `@deepseek-ai/dsh-storage-domain` among DSH storage packages, storage source cannot import Meeting modules, and only `plugin/src/index.ts` may import `plugin/src/storage/index.ts`.

验证：

```bash
pnpm --dir plugin test -- tests/contract/continuation.spec.ts tests/contract/meeting-runtime.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin test -- tests/unit/index-inject.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin build
test -z "$(rg -l 'locateMeetingRepository|readdir|\.sqlite' plugin/src/index.ts plugin/src/runtime plugin/src/repository/index.ts || true)"
test "$(rg -l 'src/storage/index\.js' plugin/src --glob '*.ts')" = "plugin/src/index.ts"
```

PASS：全部命令退出 0；production entry compiles as one top-level plugin with exactly two child responsibilities; Storage Domain is the only Meeting truth; `dataRoot` only determines the child backend root and legacy files remain untouched。

STOP：unlisted file must change、consumer must start before `storageDomain`、a second persistence truth/path is required、or child lifecycle cannot compile against Cordis 4.0.1. Failure state：this is the single production cutover step; no real profile or legacy data is opened。

### T15 — Wire The Single Package In A Real Profile

前置状态：T14 PASS；production build is fully cut over and `plugin/cordis.patch.yml` still contains only the old Convivium insert operation。

允许修改：`plugin/cordis.patch.yml`, `plugin/scripts/smoke-profile.mjs`, `plugin/tests/contract/package-contract.spec.ts`, `plugin/tests/unit/scripts/smoke-environment.spec.ts` only if its existing expectations cover changed patch text。

禁止修改：all production TypeScript、package dependencies/exports/files、public protocol/client/domain behavior、SQLite source/deletion、用户 profile。

执行：

1. Replace `plugin/cordis.patch.yml` with exactly one existing-row patch plus one insert operation:

```yaml
- id: storage-domain
  config:
    backend: convivium-jsonl
- insert:
    - id: convivium
      name: '@convivium/dsh-plugin'
      config: {}
```

There is no backend row or second package. Package contract and `verify-plugin-contract.mjs` compare the complete patch bytes to the fenced block plus one final LF; built host `inject` must contain `storage` and must not contain `storageDomain`.
2. Keep `smoke-profile.mjs#packArtifact(artifactDir)` as a one-package operation. It builds and packs only repository `plugin/`, installs exactly that tarball into the temporary DSH profile, and rejects any second Convivium tarball/package.
3. `writeSmokePatch()` writes only these existing-row config patches, followed by the unchanged Convivium fields including `dataRoot`:

```js
const patch = [
    "- id: storage-domain",
    "  config:",
    "    backend: convivium-jsonl",
    "- id: convivium",
    "  config:",
    `    provider: ${PROVIDER}`,
    "    dataRoot: convivium-smoke-data",
    "    maxParticipants: 3",
    `    speakerTimeoutMs: ${SMOKE_SCENARIO === "timeout" ? 250 : 60000}`,
    `    outboxPollMs: ${SMOKE_SCENARIO === "timeout" ? 25 : 1000}`,
    ""
].join("\\n");
```

4. Add/retain one `assertRelativeRowOrder(dumpText, ["storage", "storage-domain", "convivium"])` helper using the existing fixed row-ID regex. Each ID must occur exactly once and indices must strictly increase. `convivium-jsonl` must not appear as a row ID; it appears exactly once as the `storage-domain.config.backend` value.
5. Remove imports and code paths using `DatabaseSync`, SQL strings, `.sqlite`, and direct medium/file inspection. Cold phase asserts only public probe/tool results: phase-2 PID differs from phase-1 PID, Meeting ID is equal, recovered Meeting version is not lower, the exact two child Session IDs are equal, and continuation succeeds. Keep every other existing smoke scenario assertion unchanged.
6. The script retains its one `mkdtemp` profile/root and existing `finally`; it deletes only that exact root and never reads or edits a user profile.

验证：

```bash
pnpm --dir plugin test -- tests/contract/package-contract.spec.ts tests/unit/scripts/smoke-environment.spec.ts
pnpm --dir plugin verify
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
test -z "$(rg -l 'DatabaseSync|node:sqlite|SELECT |PRAGMA|\.sqlite|storage-plugin' plugin/scripts/smoke-profile.mjs || true)"
test ! -e storage-plugin
```

PASS：全部命令退出 0；dump-config proves the fixed three-row single-package composition；cold public assertions prove restart recovery；no independent backend artifact/profile row exists。

STOP：effective config duplicates/reorders the three rows、bundle patch cannot configure the existing `storage-domain` row、a second tarball is needed、or public cold assertions fail. Failure state：only the script-owned mkdtemp DSH profile/root, removed in its existing `finally`; user profile/data and legacy SQLite remain untouched。

### T16 — Prove Cutover Before Deletion

前置状态：T15 PASS。

允许修改：`plugin/tests/unit/module-boundaries.spec.ts`, new `plugin/tests/contract/production-import-graph.spec.ts`。

禁止修改：production code、SQLite source、protocol/design、smoke script。

执行：

1. Import-graph test starts at `plugin/src/index.ts`, resolves relative static imports recursively, and rejects every reachable `node:sqlite`, `sqlite-meeting-repository.ts`, `schema.ts`, `migrations.ts` and `meeting-repository-locator.ts`.
2. The same test computes a second graph rooted at `plugin/src/repository/domain/` plus `plugin/src/runtime/`; that graph must reject `node:fs`, `node:path`, every `plugin/src/storage/*.ts`, and `@deepseek-ai/dsh-storage`, while allowing `@deepseek-ai/dsh-storage-domain`.
3. The whole-entry graph is allowed to reach `node:fs`/`node:path` only through `plugin/src/storage/` and the single root composition import; it must prove that only `plugin/src/index.ts` imports `plugin/src/storage/index.ts`.
4. Add the same exact partition rules to `module-boundaries.spec.ts`. Do not broaden them to a generic dependency framework.
5. Run the unchanged T15 public smoke assertions in `cold-rebind`, `mail-race` and `cross-meeting`.

验证：

```bash
pnpm --dir plugin test -- tests/contract/production-import-graph.spec.ts tests/unit/module-boundaries.spec.ts
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
pnpm --dir plugin verify
```

PASS：全部命令退出 0；root graph reaches the internal backend but no SQLite；Meeting repository/runtime graph reaches Storage Domain only；cold uses distinct Host PIDs and the same committed state；mail/cross-meeting assertions unchanged。

STOP：any scenario needs direct medium inspection、production reaches SQLite、or Meeting code reaches backend/file APIs. Failure state：only mkdtemp smoke roots, removed in `finally`; legacy data untouched。T17 forbidden。

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

Meeting persistence uses the `Checkpointed Commit Log` defined by [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md). The package-private `src/storage/` child owns JSONL media and DSH KV semantics; `src/repository/domain/` consumes only `@deepseek-ai/dsh-storage-domain` and owns Meeting record semantics.

### Domain ownership

- `convivium_catalog` contains only lightweight discovery and creation-status records.
- Each Meeting owns one Domain containing creation, commit and paged-checkpoint tables.
- `DomainRepositoryRegistry` owns catalog discovery, Meeting Domain cache and close order.
- `DomainMeetingRepository` implements `MeetingRepositoryPort`; one ready mutation writes zero or one `CommitRecordV1`.

### Recovery and compatibility

Current truth is the published checkpoint plus its continuous commit tail. Gap, digest error, missing ready commit or invalid schema fails loud. V1 does not read, migrate, delete or fall back to legacy SQLite. The stable record, method, error and recovery contract is [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md).
```
6. In the remainder of `CONVIVIUM-IMPLEMENTATION-DESIGN.md`, perform only these substitutions; every source phrase must match before edit: `从 SQLite 读取` → `从 Meeting Repository 读取`; `SQLite ownership record` → `Meeting Repository ownership record`; `最新 SQLite 事实` → `最新 Meeting Repository 事实`; `终态 SQLite snapshot` → `终态 Meeting Repository snapshot`; `从 SQLite snapshot` → `从 Meeting Repository snapshot`; `SQLite capability` → `storageDomain capability`; `SQLite、workspace` → `持久化介质、workspace`. Delete the error-table row whose first cell is `SQLite busy`. Delete the complete numbered item beginning `实现 SQLite schema` and the complete item beginning `SQLite driver、schema version`; leave Markdown automatic numbering as `1.`.
7. Do not change the single-package/child-plugin topology sections or any other document text, and do not add migration code, compatibility assertions or legacy path scanning.

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
test -z "$(rg -l '每个 Meeting 在任何会议副作用前.*当前未替换|Meeting Runtime 可以从 SQLite|Meeting 的 SQLite、开发者 Markdown|SQLite ownership record|从 SQLite 读取|SQLite busy|storage-plugin' docs/00-governance/ARCHITECTURE.md docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md || true)"
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

执行：run commands once; append one dated evidence section with exact versions, commands/results, backend name, single-package child composition, smoke scenarios, single-writer boundary, and `Not Covered: legacy SQLite migration/deletion, multi-Host writer, remote filesystem`.

验证：

```bash
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
git diff --check
```

PASS：all exit 0; readiness contains every command and Not Covered item; it states one package/provider child/consumer child and makes no claim of independent backend delivery or legacy migration/deletion.

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
| successful KV writes | `plugin/tests/contract/storage/backend.spec.ts` | reopen observes put/delete/global |
| partial/failed write | unit + tail recovery suites | no memory advance; only final tail repair |
| medium corruption/version | backend/recovery suites | malformed/version errors, no partial load |
| physical checkpoint crash | checkpoint recovery suite | old or new complete truth only |
| commit atomicity | domain repository contract spy | one commit put, zero other authoritative puts |
| idempotency/version/auth | domain repository contract | same replay, conflict, stale and unauthorized exact errors |
| mail/outbox lease | domain repository contract | current ordering/token/deadline behavior preserved |
| application checkpoint | app checkpoint suite | bounded pages, monotonic pointer, safe GC |
| creation interruption | registry recovery suite | every recovery matrix row exact |
| per-Meeting isolation | registry + cross-meeting smoke | no state/session crossover |
| restart | child-composition test + cold-rebind | distinct Host sees same committed truth |
| production path | import graph | storage owns file APIs; Meeting code reaches Domain only; no SQLite |
| package/profile | verify + dump config | one package, three rows, child backend route and lifecycle |
| full behavior | plugin `verify` plus three smoke scenarios | all exit 0 |

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
| JSONL backend | DSH API + physical contract | `plugin/src/storage/*` | backend/recovery suites | plugin verify/child composition |
| bounded commit/checkpoint | Persistence Design + storage interface | projection/repository/checkpoint | T10–T12 | plugin verify/cold |
| catalog discovery | FR-11 + registry contract | registry/recovery service | T13 | local/cross smoke |
| lifecycle/cutover | Architecture | entry/runtime/registry/storage child | T14–T16 | plugin verify/profile smoke |
| SQLite deletion | one-truth invariant | exact T17 files | import graph/rg | plugin verify |

完成定义：T0–T18 全部 PASS，Meeting production import graph 只到 Storage Domain，单一 package 的 provider/consumer child lifecycle 已验证，真实 profile 冷恢复通过，SQLite 源码删除且 legacy 数据未触碰，readiness 记录真实证据。T19 只负责在 review/merge 后迁移引用并删除临时 RUNBOOK。

## Author Audit Record

- 2026-09-02 T5 STOP correction Author + Audit conclusion: `Executable` for T5 only after the executor first restores the frozen install and `verify:environment` passes; T5 remains not PASS at authoring time. The correction fixes the actual baseline (`954bf10` last legal PASS; `cd3e2ef` incomplete T5 HEAD), replaces the non-focused `pnpm test -- ...` invocation with direct Vitest filtering, locks root/record reconstruction and digest validation, safe covered-segment GC, reopen tail accounting, seven exact unit titles, fourteen distinct recovery cases, and the required execute-PASS-delete-commit cadence. No T5 production/test/dependency change was executed by the author.
- 2026-09-01 child-plugin rewrite Author + Audit conclusion: `Executable`; all T0–T19 steps contain precondition, exact allowed/forbidden scope, execution, validation, PASS, STOP and failure state.
- Implementation Economy: repository remains one package/lockfile/build/publish unit；the independent scaffold, manifest, profile row, pack/install and duplicate verify steps are removed。Every production structure in File And Symbol Map maps to the gate table；no future adapter/factory/worker/compatibility/migration/hook/metrics framework remains。Application and physical checkpointing reuse their required ordering chain and add no checkpoint queue。
- Repository evidence: T0 fixes the 19-method/2-property surface; T9 fixes all 16 current barrel-import paths; T12/T17 fix the machine-checked 26-port/9-delete test partition.
- Previous execution failures are fixed in the instructions: T3 now assigns only its seven files/symbol groups and includes `active-tail.truncate`; T4 locks FileSystemPort-only media IO, typed rejection-phase tracking without `any`, descriptor format/version separation, SHA-256 operation digest, strict replay, cold-reopen assertions and both rollover thresholds.
- DSH evidence: Cordis `4.0.1` `ctx.plugin()`/`ctx.inject()` child Fiber API and DSH Storage/Storage Domain `0.1.1-rc.2` service contracts are fixed；provider is package-private and only the Meeting consumer injects `storageDomain`。
- Author checks run from repository root: all existing relative Markdown targets resolve；the five `MEETING-STORAGE-INTERFACE.md` links are planned outputs created by T1 and are the only intentionally absent targets；every Tn has all eight mechanical fields；`git diff --check` exits 0；baseline `pnpm --dir plugin verify` passes 49 files / 371 tests plus build and package checks。
- Not Covered at authoring time: no T0–T19 implementation or runtime validation has been executed; their results may only be recorded during RUNBOOK execution and T18 readiness.
