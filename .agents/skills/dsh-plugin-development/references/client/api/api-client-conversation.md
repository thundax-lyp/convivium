# Conversation Node 扩展契约

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@deepseek-ai/dsh-client-ui-conversation/client` 是浏览器侧会话组装入口。业务事件的生产者、Session 日志与 UI Node 分属不同 owner；完整操作见[注册 Conversation Node](../how-to/how-to-client-conversation-node.md)。

## `UiConversation`

**公开导出**：`UiConversation` 来自 `@deepseek-ai/dsh-client-ui-conversation/client`。
Client Cordis 的 `ctx.uiConversation` service 持有 `events`、`views`、`groups` 三个注册表。业务包向 `events.register(definition)` 注册一个可回放状态机，目标 UI 包向 `views.register(definition)` 提供每个 Session 的增量视图 builder，可选 `groups.register` 管理组。注册返回 disposer；在插件的 `apply` 生命周期内登记，不能在模块加载时全局登记。目标被激活或订阅后才建立其 Session builder。

## `ConversationNodeDefinition<State>`

**公开导出**：`ConversationNodeDefinition` 来自 `@deepseek-ai/dsh-client-ui-conversation/client`。
`kind` 是业务定义名；`target` 指定唯一视图目标，省略它表示只发布状态/Location 数据。`match(event)` 只看当前事件，从每条 start/update 独立提取同一个稳定业务 ID，并返回匹配角色或 `null`。`start(context, match, reader)` 初始化 State；`update(context, match)` 按逻辑日志顺序确定性折叠后续事件。不能从“最近未结束任务”推断归属，也不能依赖只存在浏览器内存的进度。`publication(match)` 可选 `none`、`animation-frame` 或 `immediate`，省略为 immediate；`buildLocationData` 发布 Step/Turn 可复原事实；`buildViewNode` 物化目标 Node 或 `null`。状态持久性来自 Session 事件，组件本地状态不是恢复依据。

`ConversationNodeContext` 提供该 `(kind,id)` 的 Matches、start、当前 State 与物化结果；`ConversationPreviousContext`/`ConversationContextReader.previous` 只准向前一个已开始 Context 读取。若已加载窗口仅有 update，组装器等待更早的 start；必须立即显示时，生产者需要可独立初始化的 checkpoint 或 terminal 事件。

## `ConversationViewDefinition<Node, Snapshot>`

**公开导出**：`ConversationViewDefinition` 来自 `@deepseek-ai/dsh-client-ui-conversation/client`。
`target` 是视图目标名，`create()` 为每个 Session 新建 `ConversationViewBuilder`。`isActive(snapshot)` 决定是否计入可见活动；`toolCallFocus(callId)` 只在该目标支持调用检查时提供。View target 与业务 Definition 的 `target` 要一致；只注册事件 Definition 而没有目标 builder，不会得到可选择的完整 UI 视图。

## `ConversationViewBuilder<Node, Snapshot>`

**公开导出**：`ConversationViewBuilder` 来自 `@deepseek-ai/dsh-client-ui-conversation/client`。
`empty` 是初始快照；`replace({ nodes, timeline, changedTurns })` 接收完整目标 Node 集，`apply({ upserts, timeline, changedTurns })` 接收增量更新。分组目标必须再提供 `groupInput()`；有独立 source 的 builder 可用 `publish()` 在全部快照安装后通知。不要在每次渲染时扫描全事件窗口；从 Definition State 与 target 快照派生 UI。

## `ConversationEventRegistry`

**公开导出**：`ConversationEventRegistry` 来自 `@deepseek-ai/dsh-client-ui-conversation/client`。
`register(definition)` 绑定一个 `kind` 的 Definition 并返回注销函数；重复或冲突的目标在注册时拒绝。只有确需处理未知事件的目标才使用 fallback 注册；普通业务包应显式定义事件族。

## `ConversationNode`

这是内置已完成会话 Node 的固定联合类型，不是第三方 `declare module` 的扩展表。业务扩展先由生产方拥有类型化 Session event；Client Definition 为自己的 target 物化 `ConversationViewNode`。若加入既有 Chat target，使用 Chat 包提供的 `ChatNodeDataMap` 声明合并与 `conversation.chat.node` renderer slot；若创建独立 target，则同时注册 View Definition 和对应视图 slot。不要把 ReactNode 或纯展示状态写入 Session 日志；日志保存可回放的业务事实。

## `UiSession`

**公开导出**：`UiSession` 来自 `@deepseek-ai/dsh-client-ui-session/client`。
`@deepseek-ai/dsh-client-ui-session/client` 的 `ctx.uiSession` 是 Session scope 到 slot 的适配服务。`provide(descriptor)` 为每个 Session binding 注册一组明确声明的 hook、keyed hook 或 prop，并返回 disposer；descriptor 的声明与 resolve 结果必须一致，不能使用重复标准 prop。`registerPendingInteraction(precedence)` 为一个业务域创建发布函数；每个 interaction 有稳定 `key`、`kind`、`sessionId`，域卸载时会清除可见项并等待该业务提供的 delegate。`sessionStatus` 提供 running、pending interaction 与完成未读的 observable。证据：`packages/client/ui-session/src/client/index.ts`。

`bindingSource(reference)` 将一个仍有效的 `SessionReference`（或显式缺省）解析为 renderer 使用的 `HostObservable<StandardSourceBinding>`；引用不属于当前 Controller generation 时抛错，业务组件通常消费框架注入的 hook，不直接调用它。

## `ChatNodeDataMap`

**公开导出**：`ChatNodeDataMap` 来自 `@deepseek-ai/dsh-client-ui-chat/client`。
`@deepseek-ai/dsh-client-ui-chat/client` 公开声明合并表，按最终 Chat renderer kind 指向 payload。业务包将自有 kind 加入此表，Chat Definition 物化对应 `ChatNode`，再以同 kind 的 key 注册 `conversation.chat.node` keyed slot。`ConversationNode` 是已完成内置事件的固定联合，不能用它代替该扩展表。证据：`packages/client/ui-chat/src/client/{index.ts,contract/chat-nodes.ts,contract/slots.ts}`。

## `ChatNode`

最终 Chat Node 含 renderer kind 与该 kind 在 `ChatNodeDataMap` 中的 payload。组件从 Chat/slot 的注入 hook 读当前 node 与 turn data，事件事实仍由 Session 日志恢复。证据：`packages/client/ui-chat/src/client/contract/chat-nodes.ts`。
