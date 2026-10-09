# Host Session 查询任务

## 查询历史或实现全文搜索 backend

让插件在不激活旧 Session 的情况下读取或检索历史。Profile 要挂载具体 `SessionQueryEngine` backend；目标版本交付 SQLite 实现。对象见 [SessionQuery 契约](../api/api-host-session-query.md)，现成装载见 [SessionQuery 示例](../examples/example-host-session-query.md)。

### 操作步骤

1. 只读取时注入 `sessionQuery`，使用 `listSessions`/`filterSessions` 缩小范围，再用 `readSession`、`readSurface`、`readEvent` 或 `observeSession` 获取精确日志、surface 或投影。对 lease 保证释放。
2. 字面包含用 `filterEvents`；全文排序与分页用 `searchSessions`/`searchEvents`。新 backend 继承 `SessionQueryEngine`，只实现这两项抽象搜索方法，并遵守 live 优先 corpus、错误分类和取消契约。
3. 处理查询异常时区分不存在、持久化错误、冲突与损坏。未知格式或不合法 surface 不应被静默省略；读取结果不得回写到 live Session。

### 验证与完成边界

覆盖 live 优先、冷读、头冲突、过滤语义、搜索分页与取消、fork inherited cut、lease 释放和进程重启。SQLite backend 的成功查询不证明其他检索 backend 的索引新鲜度与分页稳定性。
