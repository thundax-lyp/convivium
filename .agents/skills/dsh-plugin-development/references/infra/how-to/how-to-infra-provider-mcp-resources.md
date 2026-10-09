# MCP 资源 provider 插件

## 注册具名 MCP 资源 provider

目标是让模型按 server 名列出并读取一个资源来源。Profile 必须有 `@deepseek-ai/dsh-tools` 和 `@deepseek-ai/dsh-mcp-resources`，具体契约见 [MCP resource API](../api/api-infra-provider-mcp-resources.md#mcpresourceruntime)。

### 实现步骤

1. 创建 Host 插件，声明 `inject = ['mcpResources']`；完整文件见 [example-infra-provider-mcp-resources](../examples/example-infra-provider-mcp-resources.md)。
2. 在 `apply` 调用 `ctx.mcpResources.register(server, { request })`。`request` 区分 list、templates/list、read 三种 method，返回规范 JSON；对于 URI 按本 server 范围验证，不能把调用者传入的地址任意代理出去。
3. 从 `exec.signal` 传播取消，并让连接和缓存生命周期归插件 fiber。若后端会重连，provider 必须避免把旧连接的结果回给新代际调用。
4. 安装并装载包；模型可见的三个共享资源工具通过 `server` 参数访问本 provider，不需额外注册重复工具。

### 验证与完成边界

运行 list、read、未知 URI、未知 server、取消和卸载检查。静态 example 只验证注册与路由；它不是完整 MCP 传输服务，也不证明外部 server 认证、重连或安全边界。
