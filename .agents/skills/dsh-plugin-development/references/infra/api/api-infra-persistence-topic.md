# 插件自有持久数据

## 对象关系

`@deepseek-ai/dsh-storage` 提供 Host 侧的后端与数据形式注册枢纽；`@deepseek-ai/dsh-storage-json` 或 `@deepseek-ai/dsh-storage-sqlite` 提供介质；`@deepseek-ai/dsh-storage-domain` 在配置的后端上打开经 schema 校验的领域。插件应通过 `ctx.storageDomain` 访问自己的领域，不直接依赖内置后端的文件布局。

领域数据是非 Session 事实，不会自动写入 Agent 会话日志或供模型读取。需要模型看见的事实须由拥有它的工具或 Session 操作另行持久呈现。会话历史本身由 Session 持久化路径负责。

## 选型与使用

先读 [Storage 与后端](api-infra-storage.md#storage)，再读 [领域声明与句柄](api-infra-storage-domain.md#domainspec)。完整组合、资源释放和重启判据见[保存插件记录](../how-to/how-to-infra-persistence.md#保存插件自有记录并在重启后读取)。
