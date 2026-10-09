# Host Workspace Registry 操作

## Host Registry 操作

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Host Profile 已加载 `@deepseek-ai/dsh-workspace`、持久存储域和 Session persistence。先读[Workspace 数据契约](../api/api-client-workspace-data.md)中的 `WorkspaceRegistry`、`WorkspaceId` 与 `Workspace`。此任务运行在 Host；普通 Web 导航使用 `ctx.uiWorkspace`。

### 操作顺序

1. Host 插件在 `inject` 声明 `workspaceRegistry`。创建前确认目录确实存在；`create(path,title?)` 会规范化路径并生成稳定 Workspace ID。已有路径先用 `resolveByPath(path)` 查询，避免把不同写法的同一目录当成两个 Workspace。读取使用 `get(id)`、`list()`，排序用 `insertBefore(id,beforeId?)`。
2. 修改 Workspace 标题或会话成员时使用 `Workspace` 的公开方法，等待持久写完成；不要直接改其 `sessionIds` 或域存储。`sessionIds` 的成员还需匹配 Session header 的规范 cwd，不能只按目录字符串或 UI 标题补入。
3. 归档 Session 前处理 `workspace/session-activity` 返回的活动项。若业务域贡献活动项，监听该 waterfall 并接续 `next()`；归档采用 `archiveSession(sessionId,{ stopActivity })` 的明确选择。启用 `stopActivity` 后，自己的 `workspace/session-stop` 监听者应调用该域正常的停止路径，使会话日志结束开放中的工作。取消归档、固定与取消固定分别用 `unarchiveSession`、`pinSession`、`unpinSession`。
4. 对未知 ID、活动 Session、已归档 Session 固定以及排序目标无效分别处理目标版本的公开错误；持久操作失败时不提前提交 Client 乐观状态。Web 产品操作优先经 Workspace Controller/`ctx.uiWorkspace`，不要把 Host registry 对象跨进浏览器。

### 验证与完成判据

在精确目标 checkout 运行 Host 类型检查与对应 registry 行为测试；真实 Profile 核验创建、规范路径重用、标题/排序、归档阻止、`stopActivity` 后正常停止、重启后持久状态。只验证 `list()` 返回对象不足以证明写入、归档和恢复路径正确。
