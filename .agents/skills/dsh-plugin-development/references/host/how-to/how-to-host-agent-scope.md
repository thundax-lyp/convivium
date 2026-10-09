# Agent 作用域任务

## 只为一个 Agent 注册能力

目标是只给一个实时 Agent 增加工具、提示词或监听器，不改变其他 Agent。目标 Profile 需装载 `dsh-agent`、默认驱动器 `dsh-agent-loop` 及要使用的 Service。对象契约见 [Agent 与 AgentRegistry](../api/api-host-agent.md)、[Context](../api/api-host-cordis.md#context) 和对应能力的 API 页。

### 实现步骤

1. 若插件负责创建 Agent，调用 `ctx.agents.create({ sessionId, setup(agentCtx, agent) { ... } })`；在 `setup` 中通过 `agentCtx` 注册所需工具、提示词和监听器，然后在创建 Promise 完成后才驱动它。若插件只是扩展现有 Agent，从确切的 `Agent` 句柄使用 `agent.ctx`；`ctx.agents.get(id)` 只查询 live 句柄，不赋予拆除权。
2. 给作用域注册声明必要的 Service 依赖。工具用 `agentCtx.tools.register`，提示词用 `agentCtx.systemPrompt.section`；定义的 disposer 归 Agent context 的 fiber，随 Agent dispose 撤销。仅用于一个 Agent 的资源不要注册在根 `ctx`。
3. 创建者保存 `AgentHandle` 并在自己的生命周期结束时等待 `handle.dispose()`。恢复持久 Session 时调用 `resume({ resumeSessionId, setup })`，重新建立进程内注册；Session 日志不会自动恢复函数闭包。
4. 需要跨进程或持久队列传递发起方身份时显式携带并验证 Session/Agent ID；`currentInitiator()` 仅是进程本地异步归因。

### 验证与完成边界

在隔离 Profile 中创建两个 Agent，检查新增工具或段落只在目标 Agent 可见；释放 handle 后再次查询并确认作用域注册消失，另一个 Agent 不受影响。另测 setup 抛错时没有发布部分配置的 Agent。`create` 的成功只能说明发布边界完成，实际模型请求和 UI 到达仍须独立观察。
