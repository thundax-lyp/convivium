# DSH SQLite Storage 最小替换 RUNBOOK

## 状态与执行者契约

- 建立日期：2026-09-08。
- 工作边界：仓库根目录；分支 `codex/jsonl-storage-backend-dsh-first`。
- 模式：Execute；审计结论 `Executable`，T1 已完成，从 T2 顺序执行。
- 确认依据：用户于 2026-09-08 同意“回归 DSH provider、保留领域事务算法”的评估并要求制定最小 RUNBOOK，随后明确这是首次发布、无需考虑迁移；正式授权见 [Architecture / Confirmed Storage Provider Transition](../00-governance/ARCHITECTURE.md)。
- 基线已由作者确认，依次执行 T1–T9。只改每步白名单；PASS 才进入下一步。用户于 2026-09-08 明确授权依次执行、一任务一提交；每项提交同步删除已完成 TODO。不得 push、创建 PR、合并或修改已有 Host/profile。
- 禁止新增生产 adapter、存储 factory、迁移器、配置兼容层、通用 fault framework；禁止修改 `plugin/src/repository/`、`plugin/src/runtime/`、业务 Domain、Protocol、HTTP、Tools 和 Client。
- STOP 时保留工作区，报告最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、退出码、脱敏输出和继续所需决定。不得删除用户文件、回滚用户改动、放宽 Schema、类型、断言或 lint。
- 本文内所有命令从仓库根运行。测试临时文件只能由对应 fixture 的 `finally`/`afterEach` 清理；任何失败都必须先停止所创建 Host、关闭 Domain/Context，再删除该次临时目录。

## 目标、当前断点与范围

起点：插件自带 1120 行物理存储实现，顶层装配先挂 backend child，再挂 Meeting consumer；bundle 修改 Host 默认 backend。

终点：Host/profile 挂载 SQLite provider；Convivium 仅挂载原 Meeting consumer，通过 Storage Domain 完成创建、命令提交、重放、恢复和归档。Meeting Repository 的生产代码逐字保持不变。

完整链路：profile resolver → storage hub + SQLite provider lifecycle key → storage-domain → Convivium Meeting consumer → `DomainRepositoryRegistry.open` → catalog/Meeting Domain → `DomainMeetingRepository.execute` → 单 `CommitRecordV1` put → 内存 projection → receipt 返回及 post-commit outbox → 领域 checkpoint → 同一路径冷恢复。

| 当前断点 | 证据位置 | 固定动作 |
| --- | --- | --- |
| 物理介质属于插件 | `plugin/src/storage/backend.ts::jsonlStoragePlugin`、`JsonlStorageBackend` | T4 删除整个物理模块 |
| consumer 已仅依赖 Domain | `plugin/src/index.ts::meetingConsumerPlugin`、`plugin/src/repository/domain/domain-repository-registry.ts::DomainRepositoryRegistry` | 保留 consumer 及 repository |
| 插件覆盖默认介质 | `plugin/cordis.patch.yml` 的 `storage-domain` row | T4 删除该 row；T5 在隔离 profile 配置 |
| `dataRoot` 仅用于物理模块 | `plugin/src/config.ts::Config`、`plugin/src/index.ts::apply` | T4 删除字段、Schema 和 resolve 调用 |
| 真实介质测试绑定 JSONL | `plugin/tests/contract/meeting-runtime.spec.ts::storagePort`、`continuation.spec.ts::storagePort`、`plugin/tests/recovery/meeting-recovery.spec.ts` | T1 原位换为官方 SQLite |
| 领域算法已独立 | `plugin/src/repository/domain/checkpoint.ts::writeCheckpoint`、`projection.ts::loadProjection` | 不改；T3/T8 验证行为保持 |
| smoke 依赖插件隐式供给介质 | `plugin/scripts/smoke-profile/index.mjs::writeSmokePatch`、`writeProbePackage`、`dumpConfig` | T5 显式 profile 组合 |

Scope：S1 介质所有权；S2 原有业务持久语义保持；S3 首次发布的隔离 profile 组合；S4 文档及验证收口。

Non-goals：单 record 聚合、SQL 事务、领域算法重写、容量调优、性能 benchmark、DB vacuum/备份机制、多进程写入、已有 profile 升级、旧数据迁移或删除、DSH 升级、业务 UI 变更。生产性能改善不作为本次 PASS 声明。

## 正式依据与不变量

| 依据 | 本次约束 | 实现/测试入口 |
| --- | --- | --- |
| [Requirements / Acceptance Criteria](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#acceptance-criteria) | 已提交事实、身份隔离、归档不可变不变 | `meeting-runtime.spec.ts`、`continuation.spec.ts` |
| [Storage Interface / Boundary And Ownership、Repository Port](../20-interfaces/MEETING-STORAGE-INTERFACE.md#boundary-and-ownership) | Domain 唯一事实源；bootstrap、commit、receipt、outbox 一致 | `DomainMeetingRepository`、`meeting-repository-behavior.ts::defineMeetingRepositoryBehaviorContract` |
| [Persistence Design / Algorithm invariants](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md#algorithm-invariants) | 单 commit、连续 tail、pointer 发布、容量与 GC 保持 | `plugin/src/repository/domain/projection.ts`、`plugin/src/repository/domain/checkpoint.ts`、`plugin/tests/recovery/domain-recovery.spec.ts` |
| [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md) | 单 package；本次仅删除 provider 职责 | `index.ts::apply`、Host lifecycle tests |
| [Architecture / Confirmed Storage Provider Transition](../00-governance/ARCHITECTURE.md) | Host/profile 配置首次发布的官方 SQLite 介质 | T4/T5、provider composition tests |
| [Smoke 操作入口](../50-operations/HOW-TO-DSH-SMOKE.md#标准入口) | 发布版固定 DSH、独立 profile、Prepare/Execute/Assert/Restore | `scripts/smoke-profile/index.mjs` |

DSH 能力固定为 `0.1.2-rc.1`，使用公开 package exports；[SQLite unit](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/storage/storage-sqlite/src/unit.ts) 的 put 是单 statement；[Domain Facility](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/storage/storage-domain/src/index.ts) routes 只按精确 name 匹配。不得复制上游实现或导入其内部 unit/schema 文件。

1. 单条 commit durable 成功前，不发布 projection、不返回成功、不投递副作用。SQLite 不提供消费者跨 record transaction。
2. `mutationChain`、expected version、caller/capability、receipt identity/hash、outbox lease、bootstrap/catalog repair 全部保持。
3. 只删除 `src/storage/checkpoint.ts` 的物理 checkpoint；保留 `src/repository/domain/checkpoint.ts` 的分页、pointer、compaction 和 orphan 回收。
4. `MAX_COMMIT_VALUE_BYTES=65_536`、`CHECKPOINT_PAGE_RAW_BYTES=20_000`、tail 和 projection 上限保持。DSH 的 `JSON.stringify(value)` 编码长度也须在测试中核对；不得通过放宽上限通过测试。
5. 当前默认 `single` layout 保留；它不要求 SQLite 每次重写整个 unit。拒绝无效 schema/版本，不设 `backup-and-skip`。
6. 首次发布不承担开发期数据兼容：数据迁移、遗留数据保留验收、兼容读取和回退均为 Not Applicable；不建立对应实现或测试。SQLite 内同版本会议的重启恢复仍须验证。此范围不授权清理开发者本地文件或 DSH Session 数据。

## 数据、配置与接口

本次无新增领域字段、事件、DTO 或错误码；既有 DTO 映射为逐字段不变。输入验证、actor、时间、版本和 ID 继续由原 Runtime/repository 生成，profile 不参与业务 identity。

| 对象 / canonical owner | 精确结构或来源 | 生命周期 |
| --- | --- | --- |
| Convivium `Config` / `plugin/src/config.ts` | 删除 optional `dataRoot?: string` 及 `relativeDataRoot`；保留 `provider: string` required；`agentDefinitions?`、`developerMarkdownWorkspaceId?`；`maxParticipants` 默认 3、`speakerTimeoutMs` 默认 60000、`outboxPollMs` 默认 1000 | 不新增旧字段迁移/兼容逻辑；部署配置删除旧字段；其余验证原样 |
| SQLite provider Config / Host | `path: string` required，`journalMode: 'wal'` 显式；backend name=`sqlite` | provider 持有数据库，注销后 close；产品不调用 close |
| Domain Facility Config / profile | `backend: 'sqlite'`；`routes: { workspace: 'json', session_projcache: 'json', message_feedback: 'json' }` | 仅用于固定版本全新 web profile；既有 `storage-json` row/root 不变；不新增 wildcard |
| catalog spec / repository | name=`convivium_catalog`、version=1、meetings table；`catalogKey(teamId,meetingId)` 不变 | registry open/close |
| Meeting spec / repository | name 由 `meetingDomainName(teamId,meetingId)` 生成，version=1；creation、commits、checkpoint_pages、checkpoint_roots、checkpoint_pointer | repository open/close；无直接物理路径 |
| `CommitRecordV1` / repository | 全 required：`formatVersion:1, seq:number, previousSeq:number, previousDigest:string|null, operation:string, patch:JsonPatchOperationV1[], committedAt:number, digest:string` | seq=head+1；时间来自原 command/now；digest/canonical encoding 不变 |
| `CheckpointPageV1` / repository | 全 required：`formatVersion:1, generation:string, baseSeq:number, pageIndex:number, pageCount:number, payloadBase64:string, payloadDigest:string` | 不可变 page，单次写一页 |
| `CheckpointRootV1` / repository | 全 required：`formatVersion:1, generation:string, baseSeq:number, pageCount:number, totalBytes:number, projectionDigest:string, createdAt:number` | 验证完整 generation |
| `CheckpointPointerV1` / repository | 全 required：`formatVersion:1, generation:string, baseSeq:number, rootDigest:string, publishedAt:number` | 固定 key `current`；原子发布后才能回收 |

上述领域精确 Schema 位于 `plugin/src/repository/domain/schemas.ts`；patch 三种 discriminator、receipt/outbox/privateMail/Session ownership 的内容全部复用，不在本次重新定义。`receiptKey`、`seqKey`、`generation` 位于 `keys.ts`，保持原样。归档格式、事件名/payload/顺序、公开错误映射变化：Not Applicable，本次不改变任何业务模型或输出契约。

## 已确认的执行基线

作者于 2026-09-08 实际完成原 T0 检查，结论 PASS；此处是证据，不是交给执行者的待办。

| 检查 | 实际结果 |
| --- | --- |
| `git branch --show-current` | `codex/jsonl-storage-backend-dsh-first` |
| `git status --short` | 仅本次 `ARCHITECTURE.md` 修改与新增本文；没有产品代码或其他用户修改 |
| 环境 | Node `v22.23.2`、pnpm `10.7.0`；storage/storage-domain 声明版本均为 `0.1.2-rc.1` |
| 路径及 symbol | 本文既有路径与主要装配/repository/smoke symbol 均存在；两个新增测试路径明确登记 |
| `pnpm --dir plugin verify` | 退出 0；format、lint、Host/Client typecheck、test、build、environment、contract、agent-definitions、package 全部通过 |
| 自动测试 | 84 个测试文件、1084 个测试通过；Vitest 耗时 71.38 秒 |
| 样本与产物 | 9 个 Meeting Agent Definition 样本通过；全部 package contract 布尔项为 true，无缺失或禁止发布路径 |
| 非阻断构建提示 | 现有 JSONL 静态/动态 import 重叠提示及 Client bundle dependency 提示；构建退出 0，不扩大本次范围处理 |

基线仅证明替换前实现。SQLite provider、T1–T8 变更后的验证和真实 profile smoke 尚未执行，不能复用本结果作为替换完成证据。若开始实现前出现新的代码、依赖或环境变化，本证据失效，应先报告变化并重新确认受影响基线；没有变化时不重复执行完整基线验证。

## 任务追踪

| Scope | 实施步骤 | 验证与证据 |
| --- | --- | --- |
| S1 介质所有权 | T2、T4、T5 | V5、V8；T6/T8 readiness |
| S2 业务持久语义保持 | T1、T3、T4 | V1–V7；T8 完整回归 |
| S3 首次发布 profile 组合 | T5、T6 | V8；T6 Restore |
| S4 文档与收口 | T7、T8、T9 | V9；正式文档/readiness/删除后检查 |

## 机械步骤

### T1：替换现有持久化测试的 SQLite 装配

前置状态：作者基线 PASS，代码、依赖及环境未变化；用户已要求执行本 RUNBOOK。
允许修改：`plugin/package.json`、`plugin/pnpm-lock.yaml`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/continuation.spec.ts`、`plugin/tests/recovery/meeting-recovery.spec.ts`。
禁止修改：所有生产文件；不得新增测试工厂、修改业务断言或安装其他版本依赖。

执行：
1. 先执行下面 add 命令，仅增加 SQLite 精确版本 devDependency；保留 storage devDependency，不增加 SQLite runtime/peer dependency。
2. 两个 `storagePort` 与 meeting-recovery 首次/重开装配使用 `import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'`，挂载 `ctx.plugin(storageSqlite, { path: join(root, 'storage.sqlite'), journalMode: 'wal' })`；Domain backend 改为 `sqlite`。
3. 保留所有业务断言、root、重开及清理顺序；不得改用 `:memory:`。本步只验证原有行为能在实际 SQLite 上运行。

验证：
```bash
pnpm --dir plugin add -D -E @deepseek-ai/dsh-storage-sqlite@0.1.2-rc.1
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts tests/contract/continuation.spec.ts tests/recovery/meeting-recovery.spec.ts
pnpm --dir plugin typecheck
```

PASS：三个原有 suite 与 typecheck 退出 0，V7 原断言全部保留，新增 dependency 仅在 devDependencies；生产代码无 diff。
STOP：安装、公开 API 或原业务测试失败；先关闭 fixture 资源，保留诊断，不改 repository、版本或断言。

### T2：验证 SQLite provider 生命周期

前置状态：T1 PASS；遵循 [已接受的关闭限制](CONVIVIUM-IMPLEMENTATION-DESIGN.md#accepted-storage-shutdown-limitation)，继续使用固定官方依赖，不等待上游修复发布。
允许修改：新增 `plugin/tests/integration/storage/provider-composition.spec.ts`。
禁止修改：所有生产代码、依赖、既有测试和共享 fixture。

执行：
1. 新 suite 固定为 `Storage provider composition`；局部 Context 依次组合 Storage、Domain 与官方 SQLite，使用临时落盘 DB。
2. 覆盖 V5：缺 provider 时 consumer 不激活；provider 到达后激活。逐一 await 真实 put/delete，并读回断言保留记录存在、已删除记录不存在；显式 await `domain.close()` 后再 dispose provider。断言 consumer 已撤销，持有的旧 Domain 拒绝新写入；使用新 Context/Domain 打开同一路径，核对已确认的写入和删除结果。
3. 不再断言自然卸载时内部 close 的先后顺序或在途写入自动排空；移除草稿中对应的顺序 spy 断言，保留服务门控、撤销和重开断言。finally 关闭所有 Domain、dispose 每个 Context，再删除临时目录。不修改上游原型实现，不新增生产 lifecycle wrapper。

验证：
```bash
pnpm --dir plugin exec vitest run tests/integration/storage/provider-composition.spec.ts
pnpm --dir plugin typecheck
```

PASS：V5 全部断言通过；重复打开使用新 Context/Domain；无未关闭句柄或临时文件。
STOP：服务门控、显式关闭、撤销或 reopen 断言失败，已确认的写入/删除结果未保持，或资源清理失败；清理测试资源后停止，不修改 DSH 或补生产防御。

### T3：验证 SQLite 领域提交与故障恢复

前置状态：T2 PASS。
允许修改：新增 `plugin/tests/recovery/sqlite-meeting-recovery.spec.ts`。
禁止修改：生产 repository/runtime、已有算法测试、依赖和共享 fixture。

执行：
1. 新 suite 固定为 `Meeting persistence on SQLite`；使用真实 Context/Domain 与 `DomainRepositoryRegistry`，复用 `../unit/domain/transitions/fixtures.js::meeting` 和原 `RepositoryCommand` 结构。
2. 完整覆盖 V1–V4：单 commit 成功和重放、commit put 失败无半提交、checkpoint pointer 发布前/后故障、digest 损坏拒绝与 domain version mismatch。
3. 用局部 `vi.spyOn(domain.table(...), 'put'/'delete')` 注入一次 reject，生产接口不加 fault 参数。解除故障并关闭 registry/Context，再由新 Context 打开同一路径验证恢复；不得用残留内存作证据。
4. 保留原有 `unit/repository/domain/checkpoint.spec.ts` 及 `recovery/domain-recovery.spec.ts` 的容量、GC 与恢复断言，并随本步回归。

验证：
```bash
pnpm --dir plugin exec vitest run tests/recovery/sqlite-meeting-recovery.spec.ts tests/unit/repository/domain/checkpoint.spec.ts tests/recovery/domain-recovery.spec.ts
pnpm --dir plugin typecheck
```

PASS：V1–V4 磁盘恢复 oracle 全部通过，既有算法回归通过，typecheck 退出 0，生产代码无 diff。
STOP：任一一致性、容量、版本或损坏断言失败；清理测试资源后停止，不修改算法、Schema 或错误语义。

### T4：删除插件自有物理存储

前置状态：T3 PASS。
允许修改：`plugin/src/index.ts`、`plugin/src/config.ts`、`plugin/cordis.patch.yml`、`plugin/package.json`、`plugin/pnpm-lock.yaml`、`plugin/eslint.config.js`、`plugin/scripts/verify-plugin-contract.mjs`、`plugin/tests/unit/config.spec.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`、`plugin/tests/unit/module-boundaries.spec.ts`。允许删除文件限下表。
禁止修改：Meeting consumer 的业务接线和顶层 public exports；全部 repository/runtime 生产文件；`verify-package.mjs` 的既有发布保护。

| 删除集合 | 精确文件（均相对仓库根） |
| --- | --- |
| 生产 | `plugin/src/storage/backend.ts`、`plugin/src/storage/canonical-json.ts`、`plugin/src/storage/checkpoint.ts`、`plugin/src/storage/config.ts`、`plugin/src/storage/errors.ts`、`plugin/src/storage/filesystem.ts`、`plugin/src/storage/format.ts`、`plugin/src/storage/index.ts`、`plugin/src/storage/jsonl.ts`、`plugin/src/storage/unit.ts` |
| 物理 unit tests | `plugin/tests/unit/storage/backend-lifecycle.spec.ts`、`plugin/tests/unit/storage/canonical-json.spec.ts`、`plugin/tests/unit/storage/checkpoint.spec.ts`、`plugin/tests/unit/storage/filesystem.spec.ts`、`plugin/tests/unit/storage/format.spec.ts`、`plugin/tests/unit/storage/jsonl.spec.ts`、`plugin/tests/unit/storage/unit.spec.ts` |
| 物理恢复/契约/夹具 | `plugin/tests/recovery/storage/tail-recovery.spec.ts`、`plugin/tests/recovery/storage/checkpoint-recovery.spec.ts`、`plugin/tests/contract/storage/backend.spec.ts`、`plugin/tests/integration/storage/child-plugin.spec.ts`、`plugin/tests/fixtures/storage/scripted-filesystem.ts` |

执行：
1. `apply(ctx: Context, config: ConfigType): Promise<void>` 只保留 `await ctx.plugin(meetingConsumerPlugin, config)`；移除 `resolve` 与 `jsonlStoragePlugin` import。保留顶层 `inject=[]`、consumer child 和原 services，避免生命周期重构。
2. 按配置表删除 `dataRoot` 和 regex；删除其专用配置测试。Host lifecycle 的 `childOrder` 只剩 `convivium-meeting-consumer`；真实 Cordis 测试删除仅用于 dataRoot 的 mkdtemp/rm/path/os 引用及临时目录，不改变 WebServer/工具断言。
3. bundle patch 只保留插入 `convivium` 的 row；删除 `storage-domain` override。
4. 删除表中全部文件。ESLint `publicModules` 仅移除已删除的 `storage`；其他规则不变。package 移除 `@deepseek-ai/dsh-storage` peerDependencies 和对应 peerDependenciesMeta，保留 devDependency。`pnpm install --lockfile-only` 机械更新 lockfile，不升级其他包。
5. `module-boundaries.spec.ts` 删除已移除物理模块的存在性、专用 helper 与导入允许断言；保留 repository-domain 扫描，禁止直接依赖 Storage/SQLite/JSON provider，并以这些 provider 的负例替代旧本地 storage 路径负例。此遗漏依赖依据用户本轮“发生问题你来解决”的授权补入，不改变产品或领域算法。
6. contract script 保留精确 publicExports 检查，删除只服务旧 backend 的 symbol 循环；增加检查：bundle 不出现 `storage-domain`/`storage-sqlite` row，package dependencies/peerDependencies 不含 `@deepseek-ai/dsh-storage-sqlite`。不放宽原检查。

验证：
```bash
pnpm --dir plugin install --lockfile-only
pnpm --dir plugin exec vitest run tests/unit/config.spec.ts tests/unit/host-plugin-lifecycle.spec.ts tests/unit/module-boundaries.spec.ts tests/integration/storage/provider-composition.spec.ts
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin build
pnpm --dir plugin verify:contract
rg -n 'convivium-jsonl|jsonlStoragePlugin|JsonlStorageBackend|dataRoot|@/storage/' plugin/src plugin/tests plugin/cordis.patch.yml
```

PASS：验证命令退出 0；最后 rg 无匹配（退出 1）；`plugin/src/storage` 无生产文件；repository/runtime 无 diff。
STOP：发现删除集合外消费者、需要新增 export/转发文件、编译或断言失败。不要扩大删除范围；保留未通过步骤的工作区。

### T5：配置隔离 profile 的 SQLite 组合

前置状态：T4 PASS。
允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。
禁止修改：scenario driver、result DTO/验证器、smoke selector/数量、环境与凭据模块、已有 profile、用户数据库。

执行：
1. `writeProbePackage` 生成的 test-only package dependencies 增加精确版本 `@deepseek-ai/dsh-storage-sqlite`；这是隔离 profile 的安装来源，不进入 Convivium 产品 package。沿用 `installProbe` 的打包安装和公开 Loader resolver。
2. `writeSmokePatch` 删除 dataRoot，保留其余配置。在同一 patch 插入唯一 row `convivium-smoke-storage-sqlite`，name=`@deepseek-ai/dsh-storage-sqlite`，config.path 使用 `join(dirname(path), 'convivium-storage.sqlite')` 的 JSON 字符串标量、journalMode=`wal`。新增 `dirname` import。该路径位于本次 tempRoot，phase 2 复用同一文件，不删库、不另建数据库。
3. 同 patch 修改既有 `storage-domain` row，配置严格采用上表 backend/routes；保留原 `storage-json` row。这是固定版本新 web profile 的唯一组合，不应用于常用 profile。
4. `dumpConfig` 现有检查增加 SQLite package 与唯一 row 名、`convivium-storage.sqlite`；拒绝 `convivium-jsonl` 或 `dataRoot` 残留。`writeSmokePatch` 改为具名 export，签名不变；在现有 smoke-profile.spec.ts 中实际写临时 patch，断言 backend/routes/path、phase 1/2 相同 DB 路径及不含旧 dataRoot，finally 清理。保留所有已有 selector 和安全断言。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts
pnpm --dir plugin lint
```

PASS：配置测试与 lint 退出 0；phase 1/2 指向同一落盘 DB，精确路由与 dependency 安装来源符合配置表；保留所有原 selector、安全断言。此步不声称真实 Loader 已通过。
STOP：配置测试失败、公开配置接口不匹配或需要修改 scenario/环境模块；保留工作区并停止，不改用其他 provider 或 wildcard。

### T6：验证真实 profile 冷重启与清理

前置状态：T5 PASS。
允许修改：本文的执行结果记录；`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md` 中本次 SQLite 运行证据；`plugin/src/index.ts::meetingConsumerPlugin.apply` 与 `plugin/tests/unit/host-plugin-lifecycle.spec.ts` 仅修复下述已复现的 provider 到达竞态。
禁止修改：除上述启动门控外的产品与测试代码、profile 接线、scenario/result、用户凭据和已有 Host/profile。

执行：
1. 真实 Loader 已复现 `spawn` 尚未注册时 consumer 激活失败（baseline result timeout，Host 输出 not registered）。依据用户本轮授权解决执行问题：consumer 在 provider 已存在时立即执行原初始化；缺失时通过公开 `subagent/provider-added` 仅等待配置名称，注销一次性监听后执行原初始化与 prepareContinuable 检查。缺失期间不暴露 Meeting 能力；监听归 consumer 作用域，不用 sleep，不改变 runtime/repository。真实 Cordis 测试覆盖先到/后到、无关 provider、卸载后不重新注册；运行该测试、lint、typecheck、build，再重新执行五场景。
2. 先按 [关闭与冷重启验收](../50-operations/HOW-TO-DSH-SMOKE.md#sqlite-替换的关闭与冷重启验收)只读核对 cold-rebind 的成功提交、状态/Session flush、checkpoint 与 `phase1Complete` 顺序，以及 wrapper 读取阶段结果后才停止 Host 的屏障。然后执行现有默认五核心 smoke；由 wrapper 创建独立 profile 并完成 Prepare/Execute/Assert/Restore，不调用常用 profile。
3. 核对 dumpConfig 的 SQLite package、唯一 row、新 DB 路径和无旧 backend 配置；观察 baseline、cold-rebind、cross-meeting 及两个核心归档场景的原断言。
4. 记录实际日期、分支/工作区边界、Node/pnpm/DSH 版本、命令、五场景结果和 Restore；记录本次关闭验收仅覆盖已确认操作的恢复，不证明 Host 全部后台写入排空。持久化 pending 工作允许按既有契约恢复。失败只记录实际失败与脱敏诊断，不能改 driver、增加固定 sleep 或忽略错误来获得 PASS。

验证：
```bash
pnpm --dir plugin smoke:profile
```

PASS：五个 core scenarios 全部输出 `PASS ... restore=PASS`；cold-rebind 两个 Host 进程使用同库恢复关闭前已确认的记录、版本与 ownership，并成功继续提交，非会议 json consumers 正常；无临时 Host、端口或文件残留，V8 运行部分通过。
STOP：缺 dev.env、安装/Loader 失败、未规定消费者、缺少上述阶段屏障、已确认事实恢复失败或任一场景/Restore 失败。缺少屏障时先报告并修订对应步骤的范围，不在本步越界改代码。先执行 wrapper Restore，记录失败并停止；不修改凭据、生产代码、driver 或改为 :memory:。

### T7：同步正式存储与操作文档

前置状态：T6 PASS。
允许修改：`docs/00-governance/ARCHITECTURE.md`、`docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`、`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`；`TODO.md` 仅同步已迁入 baseline 的 Architecture 锚点。
禁止修改：生产代码、需求、领域契约字段/算法、readiness 历史、AGENTS/Skill/CI 治理。

执行：
1. Architecture 将 confirmed transition 并入 baseline、依赖和 source layout，移除过渡 section；删除 storage 公共模块登记和 JSONL child 当前描述。保留单 package、Domain 唯一事实源和新 DB 策略。
2. Storage Interface 只更新 Purpose 与 Boundary And Ownership 的介质链路；Implementation Design 更新 Scope、文件树、组合、文件/symbol 表、持久化说明、outbox 载体描述和启动顺序，删除 dataRoot/旧 storage 文件职责。Persistence Design 只改“当前实现”介质句，算法不动。Orchestration Design 只将物理 backend 权限边界改为 Host/profile owner；reopen 业务语义不改。
3. HOW-TO 增加“新 SQLite profile”段，说明 provider 来自 test-only profile dependency、三个非会议 domain 留在 json、首次发布无迁移与无已有 profile 改动；旧人工流程标为替换前历史入口，不当作 SQLite 验收入口；cold-rebind 改为同一 SQLite 文件。
4. 同步 `TODO.md` 中 Architecture 链接：T7 移除过渡 section 后，只将 `#confirmed-baseline` 锚点改为 `#confirmed-baseline`，不修改任务状态或范围。运行 T9 定义的完整本地链接检查命令。

验证：
```bash
git diff --check
rg -n "convivium-jsonl|JSONL|dataRoot|src/storage" docs/00-governance/ARCHITECTURE.md docs/20-interfaces/MEETING-STORAGE-INTERFACE.md docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md docs/50-operations/HOW-TO-DSH-SMOKE.md
```

PASS：diff 和 T9 链接检查退出 0；rg 每处保留匹配只属于明确标记的历史证据或说明已删除字段，不再将自带 JSONL/backend child/dataRoot 描述为当前职责；领域字段和算法不变。
STOP：正式依据冲突、链接失效或需要修改业务语义；保留文档改动并停止，不将未验证行为写成已通过。

### T8：完成全量验证并归集 readiness 证据

前置状态：T7 PASS。
允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md`、`docs/40-readiness/DSH-CAPABILITY-INTEGRATION-EVIDENCE.md`；T1–T5 白名单内尚存代码文件仅允许 Prettier 格式化；`plugin/tests/contract/package-contract.spec.ts`、`plugin/tests/contract/production-import-graph.spec.ts`、`plugin/tests/unit/scripts/role-composition-smoke.spec.ts` 仅同步本次替换遗漏的断言/VM 输入。
禁止修改：需求、领域契约字段与算法；历史验证不得改写为新 SQLite 证据；不得改根 AGENTS/Skill/CI 治理规则。

执行：
1. 全量 verify 已复现三处遗漏夹具：package peer 与 import graph 仍断言旧 backend 存在，role smoke VM 缺少 dirname/join。依据用户授权解决问题：package contract 反向断言不携带 Storage/SQLite，import graph 保留 Domain 且禁止物理 backend，role VM 注入实际 Node 路径函数；保留所有业务、安全、phase 和 cleanup 断言。先运行这三个文件再重跑完整 verify，不更改生产代码，不重跑已通过的真实 smoke。
2. 三个 readiness 文件新增本次 SQLite 小节/索引，记录日期、分支/工作区边界、版本、执行命令、结果、数据库与 profile 隔离、Restore。旧 JSONL 成功证据保留并标明替换前历史；更新 current coverage 的当前载体为 SQLite，不把旧测试结果重标。
3. 运行下列完整验证；T6 已通过的相同五 core smoke 证据直接复用，不重复运行。若此后修改了可执行代码或 smoke 配置，必须重新执行 T6；若无变化，直接复用 T6，不重复 smoke。

验证：
```bash
pnpm --dir plugin format
pnpm --dir plugin verify
git diff --check
git diff --exit-code -- plugin/src/repository plugin/src/runtime plugin/src/domain plugin/src/protocol plugin/src/http plugin/src/tools plugin/src/client
rg -n 'convivium-jsonl|jsonlStoragePlugin|JsonlStorageBackend|dataRoot|@/storage/' plugin/src plugin/cordis.patch.yml
```

PASS：verify、diff 两项均退出 0；最后 rg 无匹配（退出 1）；format 未产生白名单外修改；V1–V9 各有结果或明确的 Not Applicable/Not Covered，所有 mandatory 项通过。
STOP：发现领域代码 diff、格式化改变其他文件、验证失败或未覆盖 mandatory 项。不得把历史证据抵充本次；恢复仅由本步格式化产生的白名单外改动并停止，不还原用户修改。

### T9：迁移证据并删除临时 RUNBOOK

前置状态：T8 PASS，所有 mandatory 验证通过。
允许修改：本文；T8 三个 readiness 文件；`TODO.md` 仅删除精确引用本文且已完成的 T1–T9 对应条目；未完成条目不得作为引用清理删除。
禁止修改：代码、历史证据、其他 TODO。

执行：
1. 将本文执行记录中的长期结果迁入 readiness；Not Covered 至少包含真实掉电/硬件故障、性能/压力、多进程写入和新增真实模型调用；开发期数据迁移与已有版本升级标记为 Not Applicable（首次发布），不登记为待办。记录领域代码零 diff；不能将 Author 检查当成实现 PASS。
2. 用下列 rg 查找本文文件名和标题引用。仅删除为本文导航的引用；如果出现业务真相源依赖本文，STOP，不能直接删链接。
3. 先完成链接检查和 diff check，再删除本文；删除后再次运行同样检查。失败则恢复刚删除的本文及其专属引用并 STOP。不要保留 completed/archive 副本。

验证：
```bash
rg -n 'RUNBOOK-DSH-SQLITE-STORAGE|DSH SQLite Storage 最小替换 RUNBOOK' docs TODO.md
git diff --check
```

删除前后各运行下面同一链接检查。它只检查本次工作树变更的 Markdown 本地目标，删除文件自动排除；检查命令本身不生成仓库文件。

```bash
python3 - <<'PY'
from pathlib import Path
import re
import subprocess
tracked = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], text=True).splitlines()
added = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
errors = []
for name in sorted(set(tracked + added)):
    source = Path(name)
    if source.suffix != '.md' or not source.is_file():
        continue
    for target in re.findall(r'\]\(([^)]+)\)', source.read_text()):
        if '://' in target:
            continue
        path, _, anchor = target.partition('#')
        destination = source.parent / path if path else source
        if not destination.exists():
            errors.append(f'{source}: {target}')
print('\n'.join(errors) if errors else 'PASS local Markdown link targets')
raise SystemExit(bool(errors))
PY
```

PASS：迁移完成；删除前本地链接目标全部存在；删除后 rg 无匹配（退出 1）、链接检查通过、diff check 退出 0。
STOP：任一迁移、验证或删除后检查失败。实现未完成时保留本文。

## 验证矩阵与失败 oracle

T3 的 V1–V4 使用落盘 SQLite。测试内读取生产公开 Domain，允许测试引用 repository 内部文件；禁止 SQL 查询、解析 DB 私有表或新增生产测试钩子。

| ID / 范围 | 固定触发与预期结果 | 证据入口 |
| --- | --- | --- |
| V1 / S2 | 成功 `completeCreate` 后执行一个 command，同时改变 state、event、receipt、pending outbox；commits table 的 put 一次且 `Buffer.byteLength(JSON.stringify(value),'utf8') <= 65536`；关停重开后状态/事件/receipt/outbox 相同，重放不增加版本或事件 | 新 `sqlite-meeting-recovery.spec.ts` |
| V2 / S2 | commits put 在委托真实 put 前一次 reject；command 拒绝；内存与重开后 snapshot/version/events/receipts/outbox 与提交前相同；解除 fault 后相同请求可成功 | 同上 |
| V3 / S2 | 用 `writeCheckpoint` 写当前 projection，在 checkpoint_pointer put 前 reject；重开由旧 pointer+tail 恢复相同 projection，未发布页不参与真相。另例 pointer 成功后 commits delete 一次 reject，重开仍为同一 projection；通过 `loadProjection` 比较 receipt/outbox/events | 同上；保留 `unit/repository/domain/checkpoint.spec.ts` 的完整容量和 GC 测试 |
| V4 / S2 | 通过 Domain 向 ready meeting 的 commit 写入 schema 合法但 digest 被更改的值；关闭重开后 registry/repository 拒绝 `CORRUPT_DATABASE`，不返回部分状态；独立低级测试同名 unit version 1 写入后 version 2 打开拒绝 `version-mismatch` | 同上；版本用公开 `defineDomain` 声明，独立临时 DB |
| V5 / S1,S3 | provider 缺失不激活；到达后 await 读写及显式 Domain close，再卸载；撤销后拒绝写入，新 Context 同库重开保持已确认结果 | 新 `provider-composition.spec.ts` |
| V6 / S2 | caller/capability 拒绝、stale version、terminal immutability、相同请求重放、不同 hash 冲突、数组含非法项原子拒绝 | 既有 `contract/domain-meeting-repository.spec.ts`、`meeting-repository-behavior.ts` 和 `meeting-runtime.spec.ts`；全量 verify 原断言保持 |
| V7 / S2 | state/event/receipt/outbox/public projection/archive 一致；旧 archived 请求重放、新请求拒绝；续会身份隔离 | 已换 SQLite 的 `meeting-runtime.spec.ts`、`continuation.spec.ts`、`meeting-recovery.spec.ts` |
| V8 / S1,S3 | 真实 Loader 安装 provider，五核心场景全部通过，cold-rebind 两个进程同库恢复关闭前已确认事实并继续提交、非会议 domain 留在 json、Restore 成功 | T5 配置测试 + T6 smoke/dumpConfig |
| V9 / S4 | typecheck/lint/build/package contract/全部自动测试通过；无领域生产 diff；文档链接有效 | T8 verify、diff、T7/T9 链接检查 |

跨 record transaction：Not Applicable，未引入该能力；V2 的“回滚”指 command 未发布，不声称能回滚已成功的多个 KV put。真实进程重启由 V8 覆盖；V2/V3 是操作边界故障注入，不声称模拟断电。UI 新行为/新 actor/新事件数组：Not Applicable，保留原 suite 即可。高负载吞吐、磁盘满和真实掉电：Not Covered，本次无新增保证。关闭时任意在途写入自动排空：Not Covered，按已接受的关闭限制执行；这不豁免已确认结果的持久性与恢复断言。

## 作者检查与完成定义

作者检查范围：逐项核对路径、主要 symbol、package scripts、删除集合、固定版本公开接口、Scope→步骤→oracle→readiness 双向追踪；新测试路径明确标为新增。已执行替换前完整基线验证；未安装 SQLite provider、修改生产代码或 Host 数据。

2026-09-08 Author、首次发布范围及九步拆分修订实际检查：本地相对链接及 heading anchor 核对 PASS；`git diff --check` PASS；按 RUNBOOK Rules 的 Required Structure、数据/符号、步骤依赖、Scope 双向追踪、失败恢复、验证矩阵及删除条件逐项 Audit，结论 `Executable`。替换前基线验证已通过；替换后实现与真实 profile 验证为 Not Covered，等待 Execute；`Executable` 只表示步骤决策完备。

完成定义：S1–S4 全部完成、V1–V9 mandatory 通过、T6 Restore 成功、长期文档和证据落位、本文按 T9 删除。任何 STOP 或缺失真实 smoke 证据均不构成完成。

## Execute 记录

- 2026-09-08 T1 PASS：三个既有 SQLite 装配 suite 共 72 tests 通过；`pnpm --dir plugin typecheck` 通过。仅增加固定版本 devDependency 与替换测试 provider，业务断言及生产代码不变。下一步 T2。

- 2026-09-08 T2 STOP（历史判据，后续确认已替代继续条件）：`pnpm --dir plugin exec vitest run tests/integration/storage/provider-composition.spec.ts` 退出 1。真实 provider dispose 时，`backend.close()` 进入顺序为 0，首次 Domain close 完成顺序为 3，未满足“Domain close 后 provider close”。仅比较两个 Promise 完成的顺序会通过，但不足以证明 backend 关闭前 Domain 已释放，故保留严格断言。`pnpm --dir plugin typecheck` 退出 0；finally 已 dispose Context、restore 局部 spy 并删除临时目录。测试保留未提交，T2 TODO 不关闭，T3–T9 未执行。继续前需确认是否先调查上游卸载时在途 Domain 写入的生命周期保证并修订本步骤；不据此直接判定数据丢失，也不添加生产 wrapper。

- 2026-09-08 调查与继续条件（历史决定，已被下项替代）：用户授权独立修复上游，随后明确选择等待官方发布版本，不将本地修复包接入 Convivium。直接 `domain.close()` 可排空 100 次写入；官方 rc.1 的 provider/root dispose 分别出现 99/98 次 `closed` 拒绝，已确认写入重开后存在。修复涉及 storage-domain、storage-sqlite、storage-json 的分组清理，以及 Cordis 保留卸载中依赖供关闭方等待；仅存储包的分组不足以保证所有插件注册顺序。T2–T9 保持未完成；正式修复版本发布并同步依赖基线后，T2 必须同时覆盖卸载在途写入、消费者排空和重开验证，不能仅比较 close 调用顺序。

- 2026-09-08 关闭限制确认：用户接受关闭时尚未完成写入可能失败，要求写入设计并同步冒烟判据。此前等待正式修复包及卸载自动排空的继续条件撤销；保持固定官方依赖，不接入本地修复包。T2 改验显式 await 写入和 Domain close 后的卸载、撤销与同库重开；T6 以关闭前已确认事实为恢复断言，不声称自然卸载能排空全部后台写入。设计、Architecture、操作和证据边界同步；T2–T9 仍未完成，本次文档修订不构成新的测试或 smoke PASS。

- 2026-09-08 T2 PASS：真实 SQLite provider 门控、显式关闭、撤销后拒绝写入与新 Context 同库重开验证通过（1 test）；Host/Client typecheck 通过。资源经 finally 关闭并删除；不声称自然卸载排空在途写入。

- 2026-09-08 T3 PASS：新增真实 SQLite 恢复 6 tests，与 checkpoint/domain recovery 合计 26 tests 通过；Host/Client typecheck 通过。V1–V4 均通过新 Context 同库重开验证，生产算法未修改。夹具使用公开诊断 get 获取已打开 Domain；人工写 checkpoint 后先重开 repository 再追加，避免绕过其内存游标。

- 2026-09-08 T4 PASS：删除 10 个物理存储生产文件及 12 个专属测试/夹具文件；保留 consumer 和领域算法。补入模块边界测试依赖修订后 4 suites/23 tests、lint、Host/Client typecheck、build、plugin contract 通过；旧 backend/dataRoot 源码与测试搜索无匹配，repository/runtime 相对替换前零 diff。lockfile-only 未产生依赖升级。

- 2026-09-08 T5 PASS：隔离 probe manifest 安装固定 SQLite provider，patch 显式配置 sqlite/default 与三个精确 json routes，同根 DB 路径供两 phase 复用；40 smoke-profile tests 与 lint 通过。尚未以此声明 Loader PASS。

- 2026-09-08 T6 PASS：首次 baseline 暴露 spawn 注册时序并已修复；12 lifecycle tests、typecheck、lint 通过。重新执行默认五核心真实 smoke 全部 PASS/restore=PASS，合计 51509ms；运行组合、恢复屏障与失败清理证据已迁入 SMOKE-VALIDATION-EVIDENCE 的 SQLite Provider Validation。未更改领域算法或 scenario 断言。

- 2026-09-08 T7 PASS：正式 Architecture、Storage Interface、三份设计和 smoke 操作入口同步 Host/profile SQLite 责任、provider 到达门控及已接受关闭边界。旧物理模块/配置不再作为当前职责；本地链接及锚点 83 项检查、diff check 通过，领域字段和算法不变。

- 2026-09-08 T8 PASS：首次全量失败的三个遗漏测试契约已同步，focused 10 tests 通过后完整 verify 退出 0；75 files/1042 tests 全部通过，format 无额外改动、lint/typecheck/build/contract/environment/9 samples/package 全部通过。相对 146d56e 的七个业务生产目录零 diff；SQLite 五核心 smoke 复用同生产基线。V1–V9 与未覆盖边界已归集 SQLite Provider Integration。
