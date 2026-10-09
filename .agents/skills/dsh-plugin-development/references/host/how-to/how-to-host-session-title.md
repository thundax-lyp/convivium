# Host 会话标题任务

## 注册一个自定义标题 provider

在持久的 Session 标题服务上增加自定义异步命名策略。Profile 必须装载 `@deepseek-ai/dsh-session-title`、Session 与 SessionProjection，且未被另一个 provider 占用。对象见 [标题契约](../api/api-host-session-title.md)，完整代码见 [标题示例](../examples/example-host-session-title.md)。

### 操作步骤

1. 插件声明 `inject = ['sessionTitle']`，构造稳定 `SessionTitleProviderId`，选 `first-prompt` 或 `all-prompts`；`ctx.sessionTitle.register` 的返回 disposer 由当前 fiber 清理。
2. `generate` 只处理传入的 eligible 用户消息，观察 `signal`。返回非空标题和实际使用消息的 seq；调用辅助模型时填写真实 provider/model 路线。
3. 面向用户的改名调用 `rename`；明确请求重算时用 `refresh`。标题事件不进入模型输入，不通过 SystemPrompt 注入。

### 验证与完成边界

检查首条可用文本、非文本输入、用户显式改名、刷新、重复 provider、生成失败、较新消息覆盖较旧生成和卸载时取消。恢复 Session 后 `get` 的折叠值应与关机前一致；自动任务不应阻塞 Agent 回答。
