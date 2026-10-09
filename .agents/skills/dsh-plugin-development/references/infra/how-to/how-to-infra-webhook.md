# 外部事件驱动的 Agent 会话

## 让可信外部事件创建一次 Agent 会话

为已经由 provider adapter 认证的事件注册规则，并在匹配时创建一个新的 Workspace Session。目标 Web Host 需提供 Agents、preset、权限、Workspace 与 `webhookRuntime`。先读 [规则契约](../api/api-infra-webhook.md#webhookruntime)。

### 实现步骤

1. 在 Host 插件中声明 `inject = ['webhookRuntime']`；通过 `ctx.effect(() => ctx.webhookRuntime.register(rule))` 注册规则，确保卸载时中止并排空活动回调。
2. 在 `run` 中先筛选 `source` 和事件类型，检查取消信号，再从已验证交付构造完整 `WebhookSessionRequest`。需要幂等时用业务持久状态按 `deliveryId` 自行去重。
3. 在 Web Host 组合中装载通用运行时、规则插件和目标 provider adapter。GitHub 适配器的独立端口与密钥配置示例见[完整示例](../examples/example-infra-webhook.md)。不要把原始 HTTP body 直接传给规则运行时。
4. 在 `prompt` 中标明外部字段不可信。回调失败会被记录，但同级规则继续；HTTP 接受不能作为 Agent 完成判据。

### 验证与完成边界

用适配器支持的签名请求验证匹配事件创建一条含 `source.kind: 'webhook'` 的 Session 消息；不匹配事件不创建会话。无效签名应在适配器层被拒绝。测重复交付、取消和卸载，确认规则的业务去重与资源释放符合预期。完整 Agent 答案需另观察普通 Session 生命周期。
