# 领域数据契约

## DomainSpec

**公开导出**：`DomainSpec` 来自 `@deepseek-ai/dsh-storage-domain`。
从 `@deepseek-ai/dsh-storage-domain` 导入 `defineDomain` 和 `domainTable`。`defineDomain({ name, version, tables, global?, layout?, compatibleVersions?, invalidRecords? })` 固定领域名、格式版本与 Zod 记录 schema，非法名称/版本在模块加载时抛错。`name` 与表名须符合 `UNIT_NAME_RE`。`layout` 默认 `single`；`per-record` 适合大而稀疏的可独立删除记录。`invalidRecords: 'backup-and-skip'` 只适合可丢弃衍生数据，且需要后端支持备份；权威记录使用默认拒绝策略。改变版本或 schema 前应规划迁移，不能以兼容标记掩盖不兼容数据。

## DomainFacility

**公开导出**：`DomainFacility` 来自 `@deepseek-ai/dsh-storage-domain`。
`ctx.storageDomain.open(spec): Promise<Domain<S>>` 根据 `Config.backend` 或 `routes[spec.name]` 选择后端，加载并校验已存数据。同名领域同时只允许打开一次；`already-open`、`backend-not-found`、`facet-unsupported`、`invalid-record` 和后端 `version-mismatch` 均使 `open` 拒绝。调用方拥有返回句柄，并在自己的资源释放路径调用 `await domain.close()`；设施卸载会兜底关闭遗漏句柄。

`get(name: string): DomainImpl | undefined` 仅按名称查询当前仍打开的领域，返回未类型化诊断句柄；业务代码应保留 `open` 返回的类型化句柄。`closeAll(): Promise<void>` 并行关闭设施内仍打开的所有领域，并在所有底层单元释放后结算；任一关闭失败会使 Promise 拒绝。它是设施卸载时的兜底，不替代各插件显式关闭自己持有的 `Domain`。

## Domain

`Domain<S>` 拥有 `name`、`global`、`table(name)` 和 `close()`。`table` 只接受已声明表名并返回稳定的类型化句柄；`global` 只在 spec 声明全局值时可用。`domain.close()` 会拒绝新写入、等待已有写入、释放后端单元；重复关闭共用同一结算。

## KvTable

**公开导出**：`KvTable` 来自 `@deepseek-ai/dsh-storage-domain`。
`get`、`entries`、`keys` 和 `size` 从内存同步读取；`put`、`delete`、`update` 返回 Promise，只有后端持久化后才提交内存并发出 `domain/changed`。`update` 的纯同步变换在领域写队列中执行；缺失键报 `missing-key`。返回记录不复制，不得原地改动。

没有 UI 或模型可见结果由该 API 自动生成。若插件需要把状态显示到 Web 或 Agent，另用对应 Client/Host 入口，并保持这里为状态真源。

对象证据：`packages/storage/storage-domain/src/spec.ts`、`packages/storage/storage-domain/src/index.ts`、`packages/storage/storage-domain/src/domain.ts`、`packages/storage/storage-domain/src/error.ts`。完整步骤见[保存插件记录](../how-to/how-to-infra-persistence.md#保存插件自有记录并在重启后读取)。
