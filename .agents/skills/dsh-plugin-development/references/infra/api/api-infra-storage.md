# Storage 枢纽与后端

## Storage

`@deepseek-ai/dsh-storage` 的默认插件导出挂载 `ctx.storage` 服务；`Storage` 类还由根导出公开。`ctx.storage.backend` 是 `BackendRegistry`，其 `get(name)` 查找已注册后端，缺失报 `backend-not-found`，`register(name, backend)` 返回该次注册的 disposer。`ctx.storage.mount(form, facility)` 同样返回形式挂载的 disposer；所属插件须以 effect 管理它们。该枢纽不做 I/O，也不选择所有领域的统一介质。目标版本有 JSON 和 SQLite 后端包；各后端在自己的插件 scope 注册并负责关闭资源。

`StorageBackend` 要提供唯一 `name` 与 `kv` 分面；`KvFacet.open(descriptor)` 获取单元。`UNIT_NAME_RE` 约束单元/表名为小写字母开头、后接小写字母数字或下划线。实现自定义后端属于单独任务，必须满足 `packages/storage/storage/tests/contract.ts` 的共享契约，不能只实现读写两个函数。

`domain: DomainFacility` 是已挂载的领域设施访问器，内部调用 `form('domain')`；未装载 `dsh-storage-domain` 时抛 `StorageError`，`code` 为 `form-not-mounted`。只安装 storage 枢纽或介质后端不能使 `ctx.storage.domain` 可用。

## StorageError

`StorageError` 与 `StorageErrorCode` 是公开错误词汇。组合错误包括重复后端、重复形式、找不到后端及形式未挂载。介质错误例如版本不匹配或损坏会向领域打开者传播。运行时不能通过修改已经写入的 schema 版本来静默迁移数据。

错误对象的 `name` 固定为 `'StorageError'`；`code: StorageErrorCode` 是可用于分支处理的稳定判别值，`message` 是诊断文本。目标版本代码包括 `backend-not-found`、`form-not-mounted`、`duplicate-backend`、`duplicate-mount`、`version-mismatch`、`malformed-medium` 和 `closed`。处理失败时按 `code` 分类，不依赖 `message` 或 `name` 猜测具体原因。

## 组合边界

在 profile 中挂载 `dsh-storage`、一个后端和 `dsh-storage-domain`，并为领域层配置 `backend` 或 `routes`。后端以生命周期服务键通知领域层就绪；配置顺序不是“写在 YAML 较前就一定先激活”的保证。消费插件在 `storageDomain` 可用后打开领域，并在卸载时关闭句柄。

JSON 后端 `@deepseek-ai/dsh-storage-json` 的 Config 要求绝对数据目录 `root`；SQLite 后端 `@deepseek-ai/dsh-storage-sqlite` 的 Config 要求数据库文件 `path`。两者是可替换介质，不是同一个可同时写入的领域副本。选择某一后端后，领域层 `backend` 应写其注册名；不能仅安装包而省略对应 Loader 行。路径、备份和文件权限属于部署配置。

对象证据：`packages/storage/storage/src/index.ts`、`packages/storage/storage/src/backend.ts`、`packages/storage/storage/src/error.ts`、`packages/storage/storage/tests/contract.ts`。操作见[持久化 HOW-TO](../how-to/how-to-infra-persistence.md#保存插件自有记录并在重启后读取)。
