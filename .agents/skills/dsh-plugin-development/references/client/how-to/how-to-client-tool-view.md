# 自定义工具调用在 Web 中的展示

## 为自己的工具名注册 Tool View

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Host 工具已注册并把规范结果留在 Session 事件，Web Profile 已装载 `ui-tool`、`ui-chat`、renderer 和本包。先读[Tool View 契约](../api/api-client-interaction.md)及[slot 契约](../api/api-client-slots.md)。

### 实现步骤

1. 确认工具真实 wire 名、参数和结果 schema；Client 表示只从持久 call/result 与 owner props 派生。模型可见结果仍由 Host 工具的规范 JSON 和 renderer 决定，不让 Client 组件制造第二份模型事实。
2. 在 `./client` 的 `apply` 中使用 `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<真实工具名>' }, Component))`。key 逐字符匹配工具名；为未知或畸形数据保留通用视图 fallback，不让自定义视图吞掉错误。注册 disposer 随插件 fiber 退出。
3. Component 使用 `ToolCallViewProps` 按 `phase` 收窄：preparing 仅显示准备信息；start 才读取已派发参数；result 才读取结果。较大结果、文件和图片使用 owner 的 `openFile`/`loadImage`/`inspect`，不要手工引入未授权的 Host 路径；错误状态须可见。文案与样式遵守 locale、共享控件和语义 token。
4. 在真实 Web Profile 发起一次成功工具调用、一次失败或取消，查看工具树、重连后的 Session 回放和卸载后的通用视图回退。

### 验证与完成边界

Host 工具 schema 和 Client props 分侧编译；Web smoke 要覆盖 preparing、start、result 及未知结果。只有 slot key 声明成功但没有真实工具调用不算完成。
