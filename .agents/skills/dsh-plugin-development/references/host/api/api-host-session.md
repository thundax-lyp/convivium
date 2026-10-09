# Host Session 对象

适用 `@deepseek-ai/dsh-session@0.2.0-rc.2`。Session 日志是插件事实可恢复的基础；注册表、闭包与进程内对象不能替代事件。事件若要进入模型历史或 UI，另需对应投影。先设计事件 payload 与回放规则，再写入日志；任务路径见 [记录插件事实](../how-to/how-to-host-session-event.md)。

## Session

`agent.session` 是当前 Agent 的 Session。`append(type, data, ...opts)` 在写前把 payload 快照为无损 JSON、校验事件局部约束，并在接受边界同步追加不可变事件；失败会在日志改变前抛错。表面事件还需传对应的 `SurfaceIntent`，不能用普通事件绕过展示归属。`seq` 是日志长度；新增生产代码不使用已标记废弃的 `eventAt()`、`snapshotEvents()` 和 `ownEvents()`。

事件的 `type` 与 `data` 由 `SessionEventMap` 声明合并给出精确类型。只追加类型并不保证恢复时有消费方：插件须提供可重建的 projection/fold 或明确的读取路径。`session/event` 是观察通知，持久依据仍是已经提交的 Session 事件。监听器失败与追加是否成功是两条不同结果，不应把 UI 没收到通知误判为日志未写入。

以下成员是该对象的公开契约：

- `deriveMessages: () => Message[]`：从已记录事件派生模型消息；不要绕过日志写私有消息状态。
- `requestHeader: () => EpochHeader | undefined`：读取当前请求 epoch 头；不在请求 epoch 时可为空。

## SessionStore

**公开导出**：`SessionStore` 来自 `@deepseek-ai/dsh-session`。
`ctx.sessions` 管理实时 Session 的创建、查询、注册与 fork。面向正在运行的 Agent，优先经 `agent.session` 使用其确切所有权；不要手工创建同一 ID 的第二份 Session。`prepare` 创建尚未发布的 Session，`fork` 依源与边界生成子 Session，通常由 Agent factory 或专门的会话编排器调用。`flush(session)` 等待已组合的持久化监听器完成当前检查点；只调用 `append` 不代表落盘。`get(id)` 缺失说明 live store 没有该对象，不能据此断言磁盘没有持久日志。

以下成员是该对象的公开契约：

- `create: (id?: SessionId | undefined, options?: CreateSessionOptions | undefined) => Session`：创建可用 Session；可指定 id 与创建选项。
- `list: () => Session[]`：列出当前 store 中的 Session 句柄。
- `registerMessageProjection: (projection: SessionMessageProjection<keyof SessionEventMap>) => () => Promise<void>`：按事件类型注册消息投影，返回异步注销函数；恢复前应完成注册。

## SessionEvent

`SessionEvent` 包含 `type`、序号、时间与已经快照的 `data`。不要把敏感临时数据、运行时句柄、AbortSignal 或函数写入 Session。仅凭声明合并不会产生模型消息；要修改模型历史，应按目标版本的 `registerMessageProjection` 契约注册纯投影，且恢复时必须先加载该投影。普通日志事件不需假装是模型可见内容。

以下成员是该对象的公开契约：

- `seq: SessionSeq`：Session 日志中的单调序号。
- `time: number`：事件记录时间戳。

## SessionEventMap

`SessionEventMap` 是包及插件扩展事件词汇的类型映射。新增插件事件需要稳定名称、可 JSON 序列化 payload、明确 owner 和版本演进规则。

## ProjectionDefinition

`@deepseek-ai/dsh-session-projection` 公开按事件计算逐 Session 当前状态的 `ProjectionDefinition`。必需 `key`、`stateVersion`、`stateSchema`、`init` 和同步的 `apply(state, event)`；可选 `wire` 才会给 Client 提供经 `viewSchema` 验证的完整视图。与本单元无关的事件应返回原状态引用；每条携带状态的领域事件应包含变更后的完整状态，避免恢复时依赖进程内增量。投影是读取模型，不是新的日志事实来源。

## SessionProjectionRegistry

**公开导出**：`SessionProjectionRegistry` 来自 `@deepseek-ai/dsh-session-projection`。
`ctx.sessionProjections.register(definition)` 将单元挂在当前 fiber，最后一个注册方卸载时移除 key。`stateOf(session, key)` 读取 Host 状态，`snapshot(session)` 返回 Client 可见值和共同 `asOfSeq`，`onChanged(listener)` 订阅变化。重复 key 只有定义兼容且 `stateVersion` 一致时才共享 cell。`checkpoint`、`restoreFloor`、`restore` 属于持久投影缓存的恢复路径，常规领域插件通常只注册单元并读取状态；需要恢复加速时再按缓存后端契约组合。
