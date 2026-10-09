# Host Session 模型历史投影任务

## 让插件事件改变模型可见消息

插件要把一个持久领域决定投影到既有模型消息，而非只追加普通日志事件。目标版本的 `SessionEventMap` 必须声明事件，并用 `@messageProjection` 标注；对象见 [Session surface 契约](../api/api-host-session-surface.md)。

### 操作步骤

1. 为领域决定设计可 JSON 化、足以独立回放的事件 payload。给它固定 `type`，在插件装载时调用 `ctx.sessions.registerMessageProjection({ type, project })`；注册需早于含该事件的 Session 恢复。
2. `project(event, context)` 只读取已提交的 `context.events`、当前 `nodes` 与 `messages`，完整验证目标 seq 和版本，再返回不可变的消息副本 Map。不要依赖某次调用的内存闭包或重排稳定 message id。
3. 回放验证用 `foldSurface`，核查当前模型历史与原始追加 transcript 的区别。用户曾见的消息依赖 append-origin 事件，压缩等 replacement 会遮蔽当前模型 surface 中的旧节点。

### 验证与完成边界

在 live 追加、冷恢复、fork、投影卸载、无效目标 seq、替换和多次重放下比较结果。单次实时显示正确不证明恢复可重建；真正的事实仍是 Session 事件日志。
