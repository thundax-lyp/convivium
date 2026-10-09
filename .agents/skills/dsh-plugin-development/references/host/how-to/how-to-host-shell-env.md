# Host Shell 环境任务

## 为模型 Shell 调用贡献环境事实

为每次 bash/pwsh 工具执行提供稳定命名、按调用计算的非秘密部署事实。Profile 需挂载 `dsh-shell-env` 与实际 Shell 工具；对象见 [ShellEnvRegistry](../api/api-host-shell-env.md)，完整插件见 [环境事实示例](../examples/example-host-shell-env.md)。

### 操作步骤

1. 插件声明 `inject = ['shellEnv']`，以稳定名称调用 `ctx.shellEnv.register`；在 `variables` 一次性声明所有可能返回的 `DSH_*` key 和描述，避开五个内置 key。
2. `resolve(execution)` 只从此次调用的受信任上下文计算值；无 Agent 或缺少事实时返回空对象，不能返回 `undefined` 值或额外 key。不要更改 `process.env`，也不要把秘密加入模型可执行环境。
3. Shell executor 每次调用会重新收集；卸载插件时注册贡献随 fiber 清理。需要独立检查声明时用 `list()`，需要运行时值时用带真实 `ToolExecution` 的 `collect()`。

### 验证与完成边界

验证注册成功、重复 key、保留 key、无描述、未声明返回值、非字符串、无 Agent、卸载后消失。真实 bash/pwsh 调用应见到当前值且不保留前一次调用的旧 `DSH_*`。仅查看 `list()` 不证明调用时 resolver 运行。
