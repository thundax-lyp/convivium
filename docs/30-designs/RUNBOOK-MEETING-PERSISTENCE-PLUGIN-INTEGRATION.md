# RUNBOOK: Meeting Persistence Plugin Integration

## Status And Work Boundary

- 状态：`Executable`
- 建立日期：2026-09-01；纠偏审计日期：2026-09-02。
- 执行目录：仓库根目录。
- 固定起点：T11A commit `53618af`，其直接后继必须是 subject `Docs(repo/persistence): 固化存储切换纠偏边界` 的 Author correction commit；T0–T11A 已提交。已完成步骤的实现细节不再保留在本文，长期语义以正式 Interface/Design 为准。
- 当前 STOP：`plugin/src/repository/domain/domain-meeting-repository.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`、`plugin/tests/contract/repository-title-migration.spec.ts` 三个未跟踪文件不是 PASS；T11B 前不得删除、stage 或提交。
- 终点：Meeting production path 只消费 `@deepseek-ai/dsh-storage-domain`；package-private JSONL child backend 提供介质；验证后删除 SQLite 源码；legacy `.sqlite` 不读取、不迁移、不删除。
- 授权：修改各步骤列出的文件、运行本地验证并创建固定 subject 的本地 commit；不授权 push、PR、merge、用户 profile 修改或 legacy 数据操作。

## Executor Contract

- 从 T11B 顺序执行；一步只修改“允许修改”的文件。
- PASS 必须同时满足命令退出 0 与可观察断言；随后删除本文当前步骤、运行 `git diff --check`、只 stage 本步文件和本文、复读 staged diff 并提交。
- STOP 保留工作树，不 reset/checkout/clean；报告最后 PASS、触发条件、文件/symbol、最小复现、完整输出和 `git status --short`。
- 禁止 `any`、`unknown as`、`as never`、`@ts-ignore`、Schema/限制/断言放宽、占位断言、跳过测试、双写、fallback、自动迁移，以及本文未授权的 adapter/factory/worker/hook。
- T14 前 SQLite 是唯一 production truth；T14 后 Storage Domain 是唯一 production truth。T14 是唯一切换点。
- 每个 ready mutation 写零或一条 `CommitRecordV1`；不另写 ready-state event/receipt/outbox/mail/ownership table。
- 正式真相源、symbol 或固定命令不一致时 STOP，不寻找替代入口。

| Step | Exact commit subject |
| --- | --- |
| T11B | `Fix(plugin/persistence): 修正 checkpoint 触发与验证基线` |
| T12A | `Test(plugin/repository): 建立 Repository 双实现行为契约` |
| T12B | `Feat(plugin/repository): 建立 Domain commit 顺序内核` |
| T12C | `Feat(plugin/repository): 实现 Domain 创建与 ownership` |
| T12D | `Feat(plugin/repository): 实现 Domain command 提交` |
| T12E | `Feat(plugin/repository): 实现 Domain mail 与 outbox` |
| T12F | `Fix(plugin/repository): 收口 Domain maintenance 生命周期` |
| T13 | `Feat(plugin/repository): 建立 catalog registry 与恢复` |
| T14 | `Feat(plugin/persistence): 切换到内置 storage child 组合` |
| T15 | `Feat(plugin/persistence): 接通单 package DSH profile` |
| T16 | `Test(plugin/persistence): 证明 SQLite 路径不可达` |
| T17 | `Feat(cross-project): 删除 SQLite 实现并收口存储设计` |
| T18 | `Docs(repo/readiness): 记录 Storage Domain 切换证据` |
| T19 | `Docs(repo/persistence): 关闭持久化接入 RUNBOOK` |

## Goal And Complete Chain

```text
DSH profile -> storage hub -> Convivium top-level plugin
  -> jsonlStoragePlugin provider child (convivium-jsonl)
  -> meetingPlugin consumer child (storageDomain)
  -> catalog Domain -> per-Meeting Domain
  -> DomainRepositoryRegistry -> DomainMeetingRepository
  -> MeetingRepositoryPort -> Runtime/tools/HTTP
```

```text
enqueue mutation -> validate caller -> receipt/hash/version/state
  -> pure transition -> complete next projection -> diff/preflight
  -> one commits.put -> publish projection -> resolve result
  -> requested checkpoint on the same chain before next mutation
```

Current truth is `fold(published checkpoint at baseSeq, continuous commits baseSeq+1...headSeq)`.

## Formal Sources

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)
- [Meeting Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)

讨论、STOP 裁决和旧 RUNBOOK Git 历史不是业务真相源。

## Current Breakpoints

| Evidence | Drift | Correction |
| --- | --- | --- |
| `storage/unit.ts#mutate` | routine checkpoint only checks 512 records | also trigger at 8 MiB durable tail |
| final two projection tests | titles do not exercise checkpoint behavior | real anchor/gap assertions |
| T12 repository | detached checkpoint, out-of-chain recover, direct result mutation | replace through T12B–T12F |
| T12 seq 1 | returns event 1 but persists empty event/receipt/outbox maps | complete `create.complete` commit |
| T12 replay | receipt lookup precedes authorization | authorize first |
| T12 tests | shallow bodies/placeholder | shared behavior body and put assertions |

## Locked Remaining Contract

### Commit and validation

- No checkpoint: seq 1 predecessor is `(0, null)`.
- First post-checkpoint commit predecessor is `(baseSeq, projectionDigest(checkpoint projection))`; later commits reference the preceding commit.
- Gap, key/seq mismatch, digest mismatch and missing ready seq 1 map to `CORRUPT_DATABASE`.
- Every authorized method validates current caller before receipt lookup. After authorization: receipt/hash replay, then version/state, then transition.
- Ownership label first validates current `teamId + meetingId` (`INVALID_INPUT`); an existing `sessionId` then compares immutable identity (`INVALID_STATE`); only a new session validates role/participant coherence (`INVALID_INPUT`). Closed/revoked never move backward.

### Creation and maintenance

`completeCreate` writes one `create.complete` commit containing ready snapshot, `meeting.created` eventSeq 1, create receipt with `[1]`, initial outbox with default priority 50, Session ownership, ready bootstrap and `nextEventSeq: 2`. Only after commit put succeeds does it publish creation/catalog ready. `updateCreateResult` writes one `create.result` commit updating projection bootstrap and create receipt; it writes no creation/catalog/event/outbox record.

`commit` only sets `maintenanceRequested`; it never starts detached work. `enqueueMutation` attaches maintenance after the operation Promise and assigns that settled Promise to `mutationChain` before returning. Later mutation and close wait for it; the already committed caller result does not. `recover` joins the chain whenever it may write. `close` rejects new work, drains, reports retained maintenance failure and closes the Domain exactly once.

| Method | Fixed write |
| --- | --- |
| create / updateBootstrap | catalog + creation puts; no commit |
| recordSessionOwnership | creating: creation put; ready: one `session.ownership` commit |
| completeCreate | seq 1 `create.complete`, then creation/catalog ready |
| updateCreateResult | one `create.result` commit |
| execute | replay zero; accepted one `command:${commandKind}` |
| mail methods | `mail.send/start/finish/cancel`; empty cancel zero |
| outbox methods | `outbox.claim/complete/renew`; empty claim zero |
| recover | expired leases one `outbox.recover`; otherwise zero |
| reads | zero |

## Scope And Non-goals

Scope：repair checkpoint evidence；implement Domain repository/registry；cut production composition；prove one truth；delete SQLite source；record readiness。

Non-goals：legacy import/export/delete；dual write/fallback；multi-Host writer；remote filesystem；public DTO/domain transition/UI change；second package；generic persistence framework。

## Mechanical Execution

### T12E — Implement Mail, Outbox And Recovery

前置状态：T12D PASS.

允许修改：`plugin/src/repository/domain/domain-meeting-repository.ts`; `plugin/tests/contract/domain-meeting-repository.spec.ts`; `plugin/tests/fixtures/domain-storage.ts`.

禁止修改：all other production, test and document files.

执行：实现七个 private-mail methods、claim/complete/renew outbox、recover；全部 mutation 用 chain；recover 可能写时加入 chain；保留 mail immutable identity、authorization/idempotency、lease token/deadline 和 snapshot exclusion。

验证：

```bash
pnpm --dir plugin test --project contract tests/contract/domain-meeting-repository.spec.ts -t 'stale outbox|renews an owned|completion after expiry|private mail'
pnpm --dir plugin typecheck
```

PASS：selected bodies pass；spy 符合 zero/one；stale lease 为 `LEASE_LOST`；mail 可恢复且不在 MeetingState。

STOP：需要多 commit、commit 内 external effect 或 recover 链外写。

### T12F — Close Repository Contract And Maintenance

前置状态：T12E PASS.

允许修改：`plugin/src/repository/domain/domain-meeting-repository.ts`; `plugin/tests/contract/domain-meeting-repository.spec.ts`; `plugin/tests/fixtures/domain-storage.ts`.

禁止修改：all other production, test and document files.

执行：实现 maintenance request/run、hard-tail retry/refusal、close drain；新增真实 tests：`queues application checkpoint behind the committed result`, `blocks the next mutation behind application checkpoint`, `retains checkpoint failure for hard-tail retry and close`, `drains maintenance and closes the Domain exactly once`。

验证：

```bash
test -z "$(rg -n 'void writeCheckpoint|expect\(true\)|toBeDefined\(\)|as never|unknown as|\bany\b' plugin/src/repository/domain/domain-meeting-repository.ts plugin/tests/contract/domain-meeting-repository.spec.ts || true)"
pnpm --dir plugin test --project contract tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin test --project host tests/unit/module-boundaries.spec.ts tests/unit/repository/domain
pnpm --dir plugin typecheck
pnpm --dir plugin build
git diff --check
```

PASS：shared Domain behavior 和四 maintenance tests 全过；spy 符合 write map；无 detached checkpoint/bypass。

STOP：shared behavior 不等价、teardown 不静默或必须改 fixed limits。

### T13 — Implement Catalog Registry And Recovery

前置状态：T12F PASS.

允许修改：new `plugin/src/repository/domain/domain-repository-registry.ts`; new `plugin/tests/contract/domain-repository-registry.spec.ts`; new `plugin/tests/recovery/domain-recovery.spec.ts`.

禁止修改：Runtime, entry, SQLite, Domain contract.

执行：catalog open once；每 CatalogKey 共享 in-flight/cache；rejection 后移除；验证 identity/domainName；实现 creating/failed/valid-seq1 recovery；list 按 teamId/meetingId；Meeting domains 按 domainName 后 catalog close once。valid seq1 修复 ready；ready 无 seq1 为 `CORRUPT_DATABASE`。Contract/recovery suites 使用以下 exact titles：`opens the catalog once and returns a deterministic sorted list`; `shares one in-flight open for the same CatalogKey`; `removes a rejected in-flight open before retry`; `rejects cached identity or domainName mismatch`; `recreates an absent creation record for the same creating request`; `resumes a creating record for the same request and hash`; `rejects a different request or hash for a creating catalog record`; `repairs creating catalog and creation status when seq 1 is valid`; `rejects ready catalog without valid seq 1`; `returns creation_failed and recorded ownership without reconstructing state`; `rejects invalid catalog or commit schema, digest and sequence gap`; `isolates two Meeting domains`; `closes Meeting domains in domainName order before catalog exactly once`。

验证：

```bash
pnpm --dir plugin test --project contract tests/contract/domain-repository-registry.spec.ts
pnpm --dir plugin test --project host tests/recovery/domain-recovery.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir plugin typecheck
```

PASS：open/in-flight/retry/isolation/recovery/close-order cases 全过；无 filesystem/backend import。

STOP：需要扫描 backend、第二真相或 callback/factory hierarchy。

### T14 — Cut Production Over

前置状态：T13 PASS.

允许修改：`plugin/src/repository/index.ts`; `plugin/src/runtime/meeting-runtime.ts`; `plugin/src/runtime/services/meeting-recovery-service.ts`; `plugin/src/runtime/application-service/create-meeting.ts`; `plugin/src/runtime/application-service/index.ts`; `plugin/src/index.ts`; `plugin/tests/unit/index-inject.spec.ts`; `plugin/tests/unit/config.spec.ts`; `plugin/tests/unit/runtime/meeting-mail-dispatch.spec.ts`; `plugin/tests/contract/continuation.spec.ts`; `plugin/tests/contract/meeting-runtime.spec.ts`; `plugin/tests/recovery/recovery.spec.ts`.

禁止修改：SQLite implementation/tests, public DTO/domain/client behavior, profile.

执行：mount JSONL child at `<dataRoot>/storage` then Meeting consumer through `storageDomain`；own one registry；replace locator/directory discovery with catalog；shutdown delivery/timeouts -> registry/domains -> backend；barrel 不再导出 SQLite，但源仍保留。

验证：

```bash
pnpm --dir plugin test --project host tests/unit/index-inject.spec.ts tests/unit/runtime tests/unit/module-boundaries.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin build
```

PASS：production constructs Domain registry；SQLite 仅 direct-import tests 可达；无 dual write/fallback。

STOP：需要公开行为变化、两 repository 或无法证明 close order。

### T15 — Wire Real Profile

前置状态：T14 PASS.

允许修改：`plugin/cordis.patch.yml`; `plugin/scripts/smoke-profile.mjs`.

禁止修改：package manifest, production TypeScript, user profiles and non-smoke tests.

执行：existing `storage-domain` row route 到 `convivium-jsonl`；不加第二 package/row；smoke 删除 `DatabaseSync` 介质检查，只断言 public create/read/status、distinct-PID cold-rebind、mail-race、cross-meeting；temporary roots 在 `finally` 恢复。

验证：

```bash
pnpm --dir plugin verify:environment
pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
```

PASS：all 0；cold PID 不同且状态相同；无 direct medium inspection。

STOP：需要第二包/row、用户 profile 写或只能经 SQLite 通过。

### T16 — Prove Production Import Boundary

前置状态：T15 PASS.

允许修改：new `plugin/tests/contract/production-import-graph.spec.ts`; `plugin/tests/unit/module-boundaries.spec.ts`.

禁止修改：production, profile, smoke, repository behavior contracts and every other test.

执行：递归 static-import graph rooted at `src/index.ts` 拒绝 SQLite/schema/migration/locator；第二 graph rooted at Domain repository + runtime 拒绝 fs/path/storage/backend package，只允许 Storage Domain；证明仅 root composition imports `storage/index.ts`。

验证：

```bash
pnpm --dir plugin test --project contract tests/contract/production-import-graph.spec.ts
pnpm --dir plugin test --project host tests/unit/module-boundaries.spec.ts
pnpm --dir plugin verify
```

PASS：production reaches internal backend but no SQLite；Meeting reaches Storage Domain only。

STOP：任何 production SQLite 或 Meeting backend/file path remains。

### T17 — Delete SQLite

前置状态：T16 PASS；Domain shared contract unchanged since T12F.

允许删除：`plugin/src/repository/sqlite-meeting-repository.ts`; `plugin/src/repository/schema.ts`; `plugin/src/repository/migrations.ts`; `plugin/src/runtime/services/meeting-repository-locator.ts`; `plugin/tests/unit/repository/migrations.spec.ts`; `plugin/tests/unit/repository/schema.spec.ts`; `plugin/tests/unit/repository.spec.ts`; `plugin/tests/contract/sqlite-meeting-repository.spec.ts`.

允许修改：`docs/00-governance/ARCHITECTURE.md`; `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`; `plugin/package.json` only for unused sqlite metadata.

禁止修改：Domain repository/shared contract, Runtime behavior, user/legacy data and every other file.

执行：先重跑 Domain contract；删除 exact legacy source 和九个 SQLite-only tests；移除 Architecture/Implementation Design 的 SQLite current-state wording；声明 Storage Domain 唯一 truth、legacy data untouched/out of scope；保留 shared behavior + Domain wrapper。

验证：

```bash
test -z "$(rg -l 'node:sqlite|DatabaseSync|\.sqlite|CREATE TABLE|PRAGMA|locateMeetingRepository' plugin/src plugin/scripts plugin/package.json || true)"
pnpm --dir plugin test --project contract tests/contract/domain-meeting-repository.spec.ts tests/contract/production-import-graph.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify
```

PASS：all 0；legacy source/tests absent；shared Domain behavior remains。

STOP：Domain contract changed/fails、import remains 或需要 legacy data access。

### T18 — Record Readiness

前置状态：T17 PASS.

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` only.

禁止修改：production, tests, TODO and every other document.

执行：运行下列命令一次并追加 dated evidence、commit/version/composition/scenarios，以及 exact Not Covered：legacy migration/deletion、multi-Host writer、remote filesystem。

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

PASS：all 0；readiness 只记录 observed evidence。

STOP：命令失败或证据会夸大覆盖。

### T19 — Close And Delete RUNBOOK

前置状态：T18 PASS；normal review/PR identity present；用户另行授权 close/commit。

允许修改：`docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`; `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`; delete this RUNBOOK.

禁止修改：production, tests, TODO, readiness evidence and every other document.

执行：remaining RUNBOOK links 改为 Meeting Storage Interface；确认无其他依赖；删除而不 archive。

验证：

```bash
test -z "$(rg -l 'RUNBOOK-MEETING-PERSISTENCE-PLUGIN-INTEGRATION|Meeting Persistence Plugin Integration' docs)"
git diff --check
```

PASS：无 dangling reference；readiness retained。

STOP：review/PR identity 缺失、其他依赖或 link check fail；停止前恢复删除。

## Validation Matrix And Recovery

| Risk | Focused proof | Full proof |
| --- | --- | --- |
| physical byte trigger | T11B checkpoint suites | verify/cold |
| checkpoint anchor/gap | projection/checkpoint suites | Domain recovery |
| atomicity/rollback | put spy + shared behavior | verify |
| auth/idempotency/version | shared contract | Runtime suites |
| creation/ownership | T12C exact puts | cold recovery |
| mail/outbox lease | shared cases | mail-race |
| maintenance/close | T12F ordering/failure | cold rebind |
| catalog isolation | T13 | cross-meeting |
| one truth | import graph | T17 + verify |

GUI and external credentialed testing are Not Applicable: no client contract changes and smoke uses local controlled providers. T11B–T13 are production-unreachable；T14 failure changes source only；T15–T18 use temporary roots；T17 never targets legacy data；STOP never authorizes cleanup of unrelated changes。

## Completion And Author Audit

Complete means T11B–T18 PASS, production imports only Storage Domain, distinct-Host cold recovery succeeds, SQLite source is absent, legacy data untouched, and readiness records evidence. T19 migrates references and deletes this temporary file.

2026-09-02 correction audit：completed T0–T11 prose removed；Storage Interface made backend-neutral；checkpoint anchor、caller/receipt order、ownership precedence、seq 1、`updateCreateResult` and maintenance ownership fixed；T12 split into six semantic units；title-count migration replaced with one shared behavior body. Relative-link check and `git diff --check` are mandatory author gates. Conclusion: `Executable` only when the Author correction commit with fixed subject directly follows `53618af` and the three named T12 untracked files match their recorded hashes; any other baseline is STOP.
