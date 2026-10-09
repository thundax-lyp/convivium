# MCP 资源 provider

## 对象关系与使用场景

`@deepseek-ai/dsh-mcp-resources` 的 `McpResourceRuntime` 以具名 provider 将资源发现与读取接入三个共享模型工具。`@deepseek-ai/dsh-mcp-client` 可从真实外部服务器提供连接代际；插件也可注册自己的 `McpResourceProvider`。该服务依赖 `ctx.tools`，只登记资源访问，不代替 MCP server 的认证与传输。任务见 [HOW-TO](../how-to/how-to-infra-provider-mcp-resources.md#注册具名-mcp-资源-provider)。

## McpResourceRuntime

**公开导出**：`McpResourceRuntime` 来自 `@deepseek-ai/dsh-mcp-resources`。
`register(server: string, provider: McpResourceProvider): () => void` 在调用 context 的 scope 注册一个 server 名，重复名在同 scope 抛错。首个 provider 使 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource` 三个共享工具可用；最后一个卸载时移除工具。返回 disposer 释放精确注册，调用 fiber 也拥有该 effect。系统提示可展示当前可见 server 名，但只有 `systemPrompt` 服务已装载时才附加该段。

资源工具按执行调用的 `exec.agent` 合并 scope 并选 server；未找到时抛可见错误。请求参数中的 `server` 是注册名，资源 URI 与 cursor 归 provider/外部服务器所有。模型工具把 JSON 结果规范呈现；`blob` 字段的 base64 内容不会原样写入模型文本。

## McpResourceProvider

**公开导出**：`McpResourceProvider` 来自 `@deepseek-ai/dsh-mcp-resources`。
唯一成员 `request(request: McpResourceRequest, exec: ToolExecution): Promise<JsonValue>`。provider 必须对该次 `exec.signal` 取消生效，并让响应属于当前连接代际与调用者权限；registry 不替它验证 URI、认证或重连。资源结果须是可序列化 JSON。一个 server 的 provider 生命周期应与其实际资源来源一致。

## McpResourceRequest

**公开导出**：`McpResourceRequest` 来自 `@deepseek-ai/dsh-mcp-resources`。
封闭请求联合有 `resources/list`、`resources/templates/list`（均可带 `cursor`）与 `resources/read`（带 `uri`）。不要把工具名当作该联合的 `method` 值。`resources/read` 的 URI 需由该 server 可读；provider 应拒绝跨 server 或越权 URI。

## 装载与验证

Profile 先装载 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-mcp-resources`，再装载注册 provider 的插件。直接查工具注册及一次 list/read 调用；测未知 server、未知 URI、取消、同 scope 重名与卸载后工具消失。若真实外部 MCP server 参与，还须单独测试断线重连和请求代际，不由静态示例证明。
