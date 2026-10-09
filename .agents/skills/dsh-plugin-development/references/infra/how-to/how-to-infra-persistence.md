# 插件持久状态

## 保存插件自有记录并在重启后读取

为 Host 插件保存不属于 Session 日志的类型化记录。目标 profile 必须有 `dsh-storage`、一个介质后端和 `dsh-storage-domain`。阅读 [Storage 组合](../api/api-infra-storage.md#组合边界)及 [DomainFacility](../api/api-infra-storage-domain.md#domainfacility)。

### 实现步骤

1. 在拥有数据的包中声明唯一的 `defineDomain` spec，指定 `version` 和每张表的 Zod schema；业务包依赖 `@deepseek-ai/dsh-storage-domain`。
2. 在 profile patch 增加 `dsh-storage`、例如 `dsh-storage-json`（配置 `root`）、`dsh-storage-domain`（配置 `backend: json`）。完整文件见 [示例](../examples/example-infra-persistence.md)。
3. 在消费插件的依赖服务就绪后调用 `ctx.storageDomain.open(spec)`；用 `ctx.effect` 拥有 `domain.close()`。持久写入必须 `await`；不要就地改动 `get()` 返回的记录。
4. 对存储异常保留错误码和原因。`invalid-record` 或 `version-mismatch` 表示存量数据与新声明不符，应停用写入并做显式迁移；不要删除旧数据伪装成功。

### 验证与完成边界

编译插件，在隔离 `DSH_HOME` 启动目标 profile，写入一条记录并等 `put` resolve；卸载、重启，再读取同键验证。另测同名双开报错、无后端报错和卸载时已发起写入完成。该领域事件仅在当前进程可见；跨进程界面更新需另行建立投影或重连读取。
