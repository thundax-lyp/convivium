# 为业务事件注册 Conversation Node

## 让可回放的 Session 事件在 Chat 中显示

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Host 业务插件能写入类型化 Session 事件；Web Profile 已装载 `ui-conversation` 与 `ui-chat`。先读[Conversation 扩展契约](../api/api-client-conversation.md)和[slot 契约](../api/api-client-slots.md)。本任务选择既有 Chat target；独立 View target 另需 `ConversationViewDefinition` 和视图 slot。

### 实现步骤

1. 在事件生产者的纯类型导出中声明事件 payload 与 `SessionEventMap` 合并。每个 start、progress、end 包含相同稳定业务 ID；需从较晚窗口独立初始化时写入 checkpoint 或完整 terminal 事实。Host 只记录业务事实，不存组件状态或 ReactNode。
2. Client 包以 type-only import 纳入事件定义，编写一个 `ConversationNodeDefinition<State>`：`match` 只检查当前事件并抽取同一个 ID；`start` 初始化 State；`update` 按事件序列作确定性折叠；`buildViewNode` 产生 Chat target 可识别的 Node。需要 Step/Turn 数据时实现 `buildLocationData`，返回稳定引用或 `null`。
3. 在 Client `apply` 中经 `ctx.uiConversation.events.register(definition)` 登记；在 Chat 的 `ChatNodeDataMap` 合并自有 kind，向 `conversation.chat.node` slot 用匹配 key 注册 renderer。通过 `ctx.effect` 或服务的注册生命周期持有 disposer。组件从 Chat/slot 提供的订阅 props 读最终 Node，不自行扫描 Session 事件窗。
4. 构建并启用包的 Host/Client 半侧。制造 start → progress → end，确认同一业务 ID 形成一个最终 Node；卸载再装载、重连和历史分页后确认结果一致。再制造只有 update 的已加载窗口，确认不会错误地归属到最近 Node。

### 验证与完成边界

分别编译 Host 事件生产者和 Client Definition；以目标 checkout 的 Session 测试重放同一事件列，并在 Web Profile 确认 Chat renderer 显示及清理。若只有 `ConversationNode` 固定联合的类型导入，而没有 Chat 的 `ChatNodeDataMap` 或自有 View Definition，不构成可渲染的新 Node。
