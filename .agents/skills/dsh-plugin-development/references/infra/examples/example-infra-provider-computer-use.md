# Example：装载 Cua Driver MCP computer provider

此例选择目标版本的具体实验后端；registry 对象契约见 [Computer use API](../api/api-infra-provider-computer-use.md#computeruseregistry)。

## Profile patch

目标 Profile 须有 `@deepseek-ai/dsh-tools`，已安装 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp` 与可执行的 `cua-driver`。加入：

```yaml
- insert:
    - id: example-computer-use-registry
      name: '@deepseek-ai/dsh-computer-use'
    - id: example-cua-driver
      name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
      inject: [computerUse, tools]
      config:
        command: cua-driver
        args: [mcp]
```

按目标 Profile Loader 流程装载 patch。激活成功后 `ctx.computerUse.providerName` 应是 `cua-driver-mcp`，并完成 MCP 工具发现；从 Agent 调用一个权限允许的只读观察操作，核对实际屏幕结果。驱动未安装时激活应失败且槽回滚；卸载后工具、MCP 子进程与槽都应消失。真实屏幕权限与驱动行为必须在目标 OS 验证。
