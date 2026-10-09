# Host Agent 对象

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。本包公开实时 Agent 接口与注册表；`@deepseek-ai/dsh-agent-loop` 提供具体创建、驱动和模型请求。仅有 `ctx.agents` 不表示工厂已经注册。按 Agent 限定工具或提示词见 [作用域任务](../how-to/how-to-host-agent-scope.md)。

## Agent

`Agent` 是实时句柄，`id` 对应 Session 身份，`session` 提供持久日志，`ctx` 是该 Agent 的作用域 Context。通过 `agent.ctx` 注册的工具、提示词段和监听器只在该作用域生效，并随 Agent dispose 撤销。`followup()` 进入下一轮并唤醒驱动器，`steer()` 提交中途引导并唤醒它，`inject()` 加入模型可见上下文但不唤醒；调用方必须区分这三种交付时机。`cancel()` 请求取消当前工作，`whenIdle()` 等待完全停稳。`status` 和 `inbox` 是当前实时状态；跨重启事实以 Session 事件为准，不能只读 live handle。

## AgentRegistry

`ctx.agents` 由 `AgentRegistry` Service 提供。`create(options)` 创建 Session 与 Agent，`resume(options)` 从持久 Session 恢复；二者需要已注册的 Agent factory，通常由 `dsh-agent-loop` 提供。`get(id)`、`list()`、`roots()` 查找实时 Agent，返回的只是裸句柄，不赋予拆除权。`currentInitiator()` 返回当前进程本地异步链中的发起 Agent 或 `undefined`；它不是身份认证或跨进程所有权证明。`withInitiator` / `withoutInitiator` 只管理该归因边界。`setFactory`、`register`、`enter`、`announce` 是驱动器组合层所用，普通插件不应重建工厂或人工宣布同一 Agent。

## AgentHandle

**公开导出**：`AgentHandle` 来自 `@deepseek-ai/dsh-agent`。
`create` / `resume` 返回 `{ agent, dispose() }`。调用方持有的 `dispose()` 会停止并排空 loop、注销 Agent、移除 live Session，然后撤销作用域注册；提供工厂的 fiber 卸载也会拆除它创建的句柄。`get(id)` 返回的 `Agent` 没有此 disposer，不能用它假装自己拥有该 Agent。持有 handle 的插件卸载时应等待释放完成。

## CreateAgentOptions

**公开导出**：`CreateAgentOptions` 来自 `@deepseek-ai/dsh-agent`。
`sessionId` 必填，是 Agent 与 Session 共享的 live 身份。可选 `parentAgent` 决定运行时父子所有权；`meta` 保存经过验证的 cwd、fork lineage、origin、depth 与 preset 等会话元数据；`seed` 和 `inheritedEventCount` 供精确 fork 历史使用；`agentOptions` 选模型；`signal` 只在创建期间控制取消。`setup(agentCtx, agent)` 在两者发布前组合该 Agent 的作用域工具、提示词和监听器，可返回同步 `commit()` 在发布边界作最后校验。setup 失败或 owner 卸载会回滚，不暴露部分配置的 Agent。setup 只负责组合，驱动器请求应在创建完成后开始。

## ResumeAgentOptions

**公开导出**：`ResumeAgentOptions` 来自 `@deepseek-ai/dsh-agent`。
`resumeSessionId` 必填，指向已有持久 Session。`parentAgent`、`agentOptions`、`signal` 和 `setup` 与创建路径有对应作用；恢复还需要已组合的持久化服务。恢复的作用域是新建的，插件注册要在 setup 内重新建立；旧 Session 日志提供持久事实，不自动恢复旧进程的闭包、计时器或网络连接。

## AgentLoop

`@deepseek-ai/dsh-agent-loop` 的包根公开 `AgentLoop`，它是默认的 `AgentFactory` 和驱动器。静态 `inject` 要求 `agents`、`sessions`、`llm`、`tools`、`systemPrompt`、`sessionProjections`；装载后以 effect 将自己注册给 `ctx.agents`。插件编程式创建 Agent 时，Profile 必须含这个或兼容工厂。不要把 `AgentRegistry` 存在当作可创建 Agent 的证明。`AgentLoop` 自己的 `create` / `resume` 方法服务于注册工厂实现；普通消费者使用 `ctx.agents.create` / `resume`。

以下成员是该对象的公开契约：

- `config: Config`：当前 loop 配置；读取运行参数时使用。
- `createAgent: (ownerCtx: Context, options: CreateAgentOptions) => Promise<AgentHandle>`：以 ownerCtx 创建 AgentHandle；调用方负责其生命周期。

## AgentLoop Config

**公开导出**：`Config` 来自 `@deepseek-ai/dsh-agent-loop`。
`agents` 是启动时自动创建或恢复的声明项，默认空列表；每项需 `id`，可指定 `provider`、`model`、`reasoningEffort`、`maxTokens`、`cwd`，并可在 `sessionId` 与 `resumeSessionId` 中选其一。两种确切身份不可并用，多个配置项也不能重用同一个确切 Session ID。`maxParallelToolCalls` 是每个 Agent step 的并行安全工具调用上限，默认 10，`1` 为串行；它是 volatile 配置。配置项的 `id` 是标签，不能代替运行时 `sessionId`。
