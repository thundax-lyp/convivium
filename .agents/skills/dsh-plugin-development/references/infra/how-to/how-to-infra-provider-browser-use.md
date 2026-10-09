# Browser use provider 组合

## 选择并装载一个 Browser use provider

让目标 Profile 只选择一个浏览器工具实现，并在其卸载完成前保留独占名称。公开槽契约见 [Browser use API](../api/api-infra-provider-browser-use.md#browseruseregistry)。目标版本的 Playwright MCP 是实验性具体后端；配置例见 [example-infra-provider-browser-use](../examples/example-infra-provider-browser-use.md)。

### 实现步骤

1. 在 Profile 中装载 `@deepseek-ai/dsh-browser-use`，确认 `agents`、`tools`、`systemPrompt` 依赖可用，再装载一个具体 provider。Playwright MCP 配置 `mode: launch` 时可选 `headless`、`executablePath`；`mode: attach` 需要现有 CDP endpoint。
2. 如果自行编写 provider，在 Host 插件中声明 `inject = ['browserUse']`，用 `BrowserUseProviderName` 注册稳定名称；浏览器与模型工具仍由你的插件独立实现。资源和槽的清理须按顺序：停止新调用，等待 Session 工作，关闭浏览器，再释放注册。
3. 通过 `ctx.browserUse.providerName` 检查占用，不以此替代工具和页面验证。对具体后端还要确认只在当前 Session 暴露工具、正确处理取消与卸载。

### 复用 Session 资源或 MCP 组合助手

1. 自定义浏览器 provider 可使用 [SessionResources 契约](../api/api-infra-provider-browser-use.md#sessionresources)。给 `open(agent, signal)` 配置一次激活的获取和完整回滚，返回真正等待关闭的 `close()`；若附着一个共享浏览器，设 `exclusive: true`。
2. 由 `run(agent, signal, operation)` 承接当前 Session 的每次浏览器操作，使同一 Session 的调用排队；在 provider 的 effect 清理中等待 `dispose()` 成功后才释放 registry 槽。实现骨架见 [资源所有权示例](../examples/example-infra-provider-browser-use.md#自定义-provider-资源所有权骨架)。
3. 若开发的是 stdio MCP 浏览器 provider，可调用 [mountSessionMcp](../api/api-infra-provider-browser-use.md#mountsessionmcp)：先用 `BrowserMcpConfig` 与 `validateBrowserMcpConfig` 处理启动或附着模式，再传入稳定名称、独占策略、可执行文件和参数。它负责 MCP client 的 Session 隔离与清理，但浏览器依赖、工具行为和权限仍由具体后端验证。

### 验证与完成边界

加载两个 provider 应立即看到独占冲突；卸载第一个完成后第二个才能接管。真实 Playwright/Chrome/Stagehand 后端还须运行浏览器导航、截图、授权和 Session 清理检查。本例只给可复核配置，不宣称本机已启动浏览器。
