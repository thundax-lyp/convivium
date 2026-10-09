# 在 Client 读取 `@file` 与 `@session` 候选：任务指南

## 在 Client 读取 `@file` 与 `@session` 候选

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载两个 Host Remote owner 与 Client assembly。先读[引用契约](../api/api-client-references.md)、[Remote 调用](../api/api-client-remote.md)及[输入触发源](../api/api-client-interaction.md)。

### 步骤

1. 在 Client `inject` 声明 `remote`、`remote.fileReferences`、`remote.sessionReferenceResolver`。从当前输入对应的 Session 获取 `sessionId`，为每次候选请求创建取消信号；新 query、Session 切换或组件卸载时取消旧请求。
2. 文件候选调用 `ctx.remote.fileReferences.list(sessionId,query,signal)`；会话候选调用 `ctx.remote.sessionReferenceResolver.candidates(sessionId,query,signal)`。两者都检查 `RemoteResult.ok`，不要将取消或业务失败当作空候选。
3. 文件候选用 `formatFileMention(candidate,preserveQuote)` 生成插入值；返回 `undefined` 时不提供该项。会话候选直接使用 Host 返回的 `mention`，不要重建 `dsh-session` URI。候选的路径/标题仅供展示，最终读取与授权由 Host 负责。
4. 通过 `InputTriggerSource` 贡献你自己的候选 UI；若只是使用产品现有 `@` 输入，则目标内置 `ui-reference` 已并行请求这两个 namespace，不要重复注册同一个 `@` 触发源。

### 完成判据

真实 Web Profile 中输入 `@` 可显示对应 Session 的文件与其他 Session 候选；新 query 覆盖旧请求，错误与取消有明确状态。静态声明存在不足以证明 Host provider 或权限路径正常。
