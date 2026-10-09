# Host Session 模型历史投影对象

适用 `@deepseek-ai/dsh-session/surface` 与 `/fork`（DSH `0.2.0-rc.2`）。这两个子路径的常规插件对象也由包根重导出；前者公开从不可变 Session 日志折叠模型可见 surface 的纯函数和插件事件投影契约，后者提供 fork seed 辅助。见 [注册与读取模型历史投影](../how-to/how-to-host-session-surface.md)。

## buildForkSeed

`@deepseek-ai/dsh-session/fork` 唯一导出的 `buildForkSeed(events, boundary)` 也由包根重导出。它复制 caller 已验证的 inclusive 前缀，追加 `session/end-seed` 与打开 turn/step 的 `forked` closers；不验证边界、不创建 Session，也不设置 `inheritedEventCount`。普通插件调用 `ctx.sessions.fork` 取得完整创建语义；自定义 seed 才直接使用 helper。见 [Session Fork HOW-TO](../how-to/how-to-host-session-fork.md)。

## SessionMessageProjection

**公开导出**：`SessionMessageProjection` 来自 `@deepseek-ai/dsh-session`。
插件为自己拥有的、已在 `SessionEventMap` 用 `@messageProjection` 声明的事件实现 `{ type, project(event, context) }`，经 `ctx.sessions.registerMessageProjection` 注册。`project` 先验证日志中完整的持久决定，再返回以原 surface 节点 seq 为 key 的不可变消息更新；不能改输入事件、context 或既有消息 identity。该解释器须在含这些事件的 Session 创建或恢复前装载；卸载后其历史不应被错误地解释成旧状态。

## SessionMessageProjectionContext

**公开导出**：`SessionMessageProjectionContext` 来自 `@deepseek-ai/dsh-session`。
`nodes` 是当前模型可见顺序，`events` 是候选事件之前的连续日志窗口，`baseSeq` 是窗口起点，`messages` 是此前投影的消息。投影只能从这些已提交事实推导；不能从进程闭包借未来状态。

## foldSurface

`foldSurface(events, projections?)` 从完整日志重新验证并折叠 surface。`isAppendSurfaceEvent` 区分用户曾见的追加原始节点，`isReplacementSurfaceEvent` 标识模型历史替换节点。人类 transcript 不应只用当前 surface，因为替换会遮蔽用户曾看见的内容。

## SurfaceFoldResult

**公开导出**：`SurfaceFoldResult` 来自 `@deepseek-ai/dsh-session`。
包含当前节点 seq `nodes`、按日志顺序的 `replacements` 和按原始 seq 索引的 `projectedMessages`。读取者用同一日志前缀的结果构造模型历史；不要混用不同前缀的投影和事件。

## SurfaceManager

该类虽由 `/surface` 公开导出，但主要服务 Session 内部的增量折叠与 generation 管理。插件优先使用 `ctx.sessions.registerMessageProjection`、`Session` 的读取方法或 `foldSurface`；直接实例化 `SurfaceManager` 需要承担与 Session 日志同步、替换验证和缓存失效的完整责任。`validateSessionEventData` 与 `validateSurfaceMetadata` 同样是底层验证辅助，不代替追加事件的 Session 契约。
