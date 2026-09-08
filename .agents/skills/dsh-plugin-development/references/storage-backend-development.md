# Storage Backend 开发

适用于 `dsh-v0.1.2-rc.1` 中新增或替换持久存储介质。仅消费业务数据时使用[Storage Domain](storage-projections.md)，不需要自建 Backend。Hub 拥有注册，Backend 拥有介质与单次写入原子性，Domain 拥有 schema、队列与提交后通知。

## 接口与实现顺序

从 `@deepseek-ai/dsh-storage` 导入 `StorageBackend`、`KvFacet`、`KvUnit`、`KvUnitDescriptor`、`StorageError`、`UNIT_NAME_RE` 和 `storageBackendServiceKey`；它们是公开 exports。按目标工程实现介质，不复制上游私有 unit 类或直接让业务 Consumer 调用介质。

| 接口 | 必须实现的行为 |
| --- | --- |
| `StorageBackend` | 可选 `readonly kv?: KvFacet`，以及 `close(): Promise<void>`；未提供 facet 时显式缺失，不伪造空数据。close 排空所有 unit 的写入并释放介质，并发重复调用等待同一静默结果。 |
| `KvFacet.open(descriptor): Promise<KvUnit>` | 创建或打开指定 unit；新 unit 立即可读为空。打开同名未关闭 unit 拒绝；版本/介质异常按下方布局契约处理。 |
| `KvUnit.loadAll()` | Promise 返回 `{ tables: Record<string, Record<string, unknown>>, global: unknown }`；global 未写入或未声明时为 `null`。Backend 不解释领域 schema。 |
| `putRecord(table, key, value)` | 整条替换，返回 `Promise<void>`；每次调用原子且 resolve 后 durable，重启再打开能读到已确认写入。 |
| `deleteRecord(table, key)` | 返回 `Promise<void>`；删除缺失记录为幂等 no-op。 |
| `setGlobal(value)` | 返回 `Promise<void>`；只有 descriptor 声明 `hasGlobal` 才允许。 |
| `backupRecord?(table, key)` | 返回 `Promise<string>` 诊断位置；保留原字节并移出可读集合，随后读取为缺失、再次写入可重建。没有对应介质能力就省略，不假装备份成功。 |
| `KvUnit.close()` | 返回 `Promise<void>`；drain 后释放 unit，幂等，关闭后的调用拒绝 `closed`。 |

Descriptor 包含 `name`、非负整数 `version`、`tables`、`hasGlobal`，以及可选 `layout`、`compatibleVersions`。Unit/table 名匹配 `^[a-z][a-z0-9_]*$`。记录 key 与版本兼容受布局约束，完整规则统一见[布局与版本说明](storage-projections.md#storage-domain)。不要把 single 的 `version-mismatch`、per-record 的记录缺失处置或 layout 转换混为一种通用恢复行为。

Backend 不为调用方提供跨调用的写入排序；Domain 的每-unit 队列负责该顺序。Backend 仍须保证每个单次操作原子、失败不发布半条数据、close 能等待正在执行的工作。不得把普通 write 完成、内存缓存更新或 fire-and-forget flush 当成 durable resolve，也不从这些接口推导多进程 CAS、跨记录事务或外部效果 exactly-once。

## 注册与激活

函数插件声明 `inject = ['storage']`，介质路径等部署选项通过 Config 验证。创建 backend 后，在 `ctx.effect()` 内调用 `ctx.storage.backend.register(name, backend)`，返回异步清理函数：先调用 unregister，再等待 `backend.close()`。Registry 返回的 disposer 只负责撤销名称，不会替插件关闭介质；不要仅调用 register 而遗留资源。

注册成功后调用 `ctx.provide(storageBackendServiceKey(name), backend)`，提供 lifecycle-only service。`storage-domain` 根据实际配置路由 inject 对应 key，从而等待 Backend 就绪；Hub 中能 lookup 不代表依赖激活已完成。Provider name 必须与 Domain route 精确一致。

组合 owner 提供 Hub、Backend plugin、Domain facility 和 Consumer。已有 profile 含这些 row 时按已知 id 修改配置或增加缺少的 provider，不重复挂载 Hub/Domain。Domain facility 的 `backend` 指定默认路由，`routes` 按 domain 名覆盖；Consumer 始终只调用 `storageDomain`。更换 Backend 后还必须核对旧数据处置，不因路由修改自动迁移数据。

资源获取或注册失败必须回收已经取得的介质，卸载后不能再接受操作；依赖撤销时 Domain/Consumer 应先释放使用关系，再由 Backend 排空和关闭。不要通过调整 row 顺序替代 lifecycle key。

## 验证

在 DSH monorepo 内可使用 `packages/storage/storage/tests/contract.ts` 导出的 `runKvBackendContract(label, create)` 和 `KvBackendContractHarness`，按目标 tag 的实际 harness 接口编写测试。该测试文件不是 npm 公共 export；独立插件在自身测试中验证同样的行为，不从安装包导入上游测试路径。

验证至少覆盖：空 unit、合法/非法名称、未声明 table/global、记录覆盖与幂等删除、失败写入不泄漏半提交、已 resolve 写入经关闭/重开仍可见、重复 open、close 与在途写竞争、关闭后拒绝；再按支持布局验证 key、版本、malformed 数据、备份及 bootstrap。上游共享测试不证明自定义介质的掉电恢复，需针对其持久化协议验证故障边界。

最后用真实 Loader 组合 Consumer→Domain→Backend：缺 lifecycle key 时不应伪装为激活成功，提供 key 后可打开并读写，取消/卸载达到静默。仅有类型检查或直接调用 Backend 的单测不构成组合验证。测试与实际运行过的介质、平台和恢复范围一起报告。
