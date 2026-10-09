# Host 子 Agent 委派任务

## 组合或调用具名委派 provider

给 Agent 一个可选的子任务执行 provider。Profile 需 `dsh-subagent` Service、具名 provider 和模型委派工具；单独挂载 Service 不会出现模型工具。对象见 [委派契约](../api/api-host-subagent.md)，现成组合见 [委派示例](../examples/example-host-subagent.md)。

### 操作步骤

1. 确定 one-shot 或续接型子 Agent。自定义 one-shot provider 按 `SubagentProvider` 实现 `start`、能力声明、发布前失败回滚、发布后 `SubagentRun` 的结果与清理。需要续接时提供 `prepareContinuable` 的 seed 数据，别自行接管续接 manager。
2. provider 由 `ctx.subagents.registerProvider` 注册；模型工具配置同名 `provider`。直接调用者用 `ctx.subagents.start(name, { parent, prompt, signal, ... })`，并在所有结果/异常路径 `await run.dispose()`。
3. 用户消息只在直接 parent/child 邻接关系内发送；子 Agent 不应直接打开人机问答。深度与容量限制在不同层检查，不能借 provider 名称绕过。

### 验证与完成边界

测试未知 provider、每项能力缺失、发布前取消、发布后失败、父级 owner、并行子任务隔离及 disposer。续接型还要验证消息排序、冷恢复和 parent 卸载。现成 spawn provider 的成功不证明自定义远程 provider 正确。
