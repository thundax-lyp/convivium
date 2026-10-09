# Computer use provider 组合

## 选择并装载一个 Computer use provider

让 Profile 使用一个电脑操作后端，并避免两个后端同时控制同一资源。公开槽契约见 [Computer use API](../api/api-infra-provider-computer-use.md#computeruseregistry)；目标版本 Cua Driver MCP 配置见 [example-infra-provider-computer-use](../examples/example-infra-provider-computer-use.md)。

### 实现步骤

1. 装载 `@deepseek-ai/dsh-computer-use` 和 `@deepseek-ai/dsh-tools`，再装载一个具体 provider。MCP 版需要安装可执行 `cua-driver`，默认以 `cua-driver mcp` 启动，激活时等待初始 MCP tool discovery。
2. 如果自行实现 provider，在插件中声明 `inject = ['computerUse', 'tools']`，用 `ComputerUseProviderName` 占槽，并在同一有序 effect 中拥有工具、驱动和 disposer。关闭时先阻止新调用、等待在途操作和驱动退出，再释放槽。
3. 检查 `ctx.computerUse.providerName` 只用于确认占用；执行一次具体工具并由用户可见屏幕结果确认功能，另测权限拒绝与取消。

### 验证与完成边界

两个 provider 同时装载应冲突。断开 MCP 或驱动启动失败应回滚，卸载后无活动工具或驱动并清空名称。不同 OS 的屏幕权限、输入隔离和敏感操作必须在真实环境验证；本例不提供自动批准或绕过权限的方法。
