# Host 子 Agent 委派对象

适用 `@deepseek-ai/dsh-subagent@0.2.0-rc.2`。`ctx.subagents` 是具名 provider registry；Service 单独装载不会给模型提供委派工具。见 [挂载与调用子 Agent](../how-to/how-to-host-subagent.md)。

## SubagentRuntime

**公开导出**：`SubagentRuntime` 来自 `@deepseek-ai/dsh-subagent`。
`registerProvider(provider)` 按唯一名称 effect 注册，卸载阻止新启动，但已交付给 holder 的 run 不被自动撤销。`start(name, request)` 在调用 provider 前校验能力和语义，成功返回需由 caller `dispose()` 的 `SubagentRun`。`getProvider`/`list` 查询 provider。续接型子 Agent 另用 `startContinuable`、`sendMessage`、`interrupt` 与目录发现；其 Session 身份、冷恢复和邻接授权由 runtime 管理，不能把 one-shot provider 的 `start` 当成续接实现。

以下成员是该对象的公开契约：

- `drainContinuableChildren: (parent: Agent, childIds: readonly SessionId[]) => Promise<void>`：等待指定父 Agent 下的续接子会话停稳。
- `drainContinuableDescendants: (parents: readonly Agent[]) => Promise<void>`：递归等待给定父 Agent 的续接后代停稳。
- `interruptByParent: (childSessionId: SessionId, parentSessionId: SessionId, mode: "continuable") => SubagentInterruptReceipt`：父会话对续接子会话发出中断，并返回接收回执。
- `listChildren: (parentSessionId: SessionId, signal?: AbortSignal | undefined) => Promise<SubagentCatalogEntry[]>`：按父 Session 查询直接子 Agent 目录。
- `listDescendants: (rootSessionId: SessionId, signal?: AbortSignal | undefined) => Promise<SubagentDescendantListEntry[]>`：按根 Session 查询全部后代目录。
- `prompt: (request: SubagentPromptRequest, signal: AbortSignal) => Promise<SubagentPromptReceipt>`：向续接子 Agent 发送下一条提示，返回接收回执；受 signal 取消。
- `resolveMaxDepth: (configured?: number | "provider-managed" | undefined) => number | undefined`：解析配置的深度上限；provider-managed 可以不产生数值上限。

## SubagentProvider

**公开导出**：`SubagentProvider` 来自 `@deepseek-ai/dsh-subagent`。
provider 声明 `name`、五个 `capabilities`、是否继承 parent 历史，以及 `start(resolvedRequest)`。它可选实现 `prepareContinuable`，只贡献不可变 seed 数据；续接子 Agent 的创建、消息和生命周期仍由 runtime 所有。请求未发布前失败由 provider 清理；发布后 caller 拥有 run。不同子任务的取消与清理不得互相串扰。

以下成员是该对象的公开契约：

- `agentRouteDefaults: Readonly<{ provider: string; model: string; }> | undefined`：可选默认 provider/model 路由，供续接型 Agent 解析。
- `inheritsParentContext: boolean`：声明是否继承父 Agent 的上下文历史，不能由调用方臆断。

## SubagentStartRequest

**公开导出**：`SubagentStartRequest` 来自 `@deepseek-ai/dsh-subagent`。
包含父 Agent、消息内容、取消 signal，及可选模型/工具/深度/persona/输出 schema。每项可选能力必须被目标 provider 显式支持；不支持应在启动前失败，不能静默忽略。`maxDepth` 与继续型容量是不同限制。

以下成员是该对象的公开契约：

- `agentOptions: AgentOptions | undefined`：可选子 Agent 运行参数，须受 provider 能力约束。
- `label: string | undefined`：可选用户可读任务名。
- `outputSchema: ObjectJsonSchema | undefined`：可选结构化输出 schema，provider 必须声明支持。
- `parent: Agent`：发起任务的父 Agent，决定所有权与路由上下文。
- `prompt: ContentBlock[]`：传给子 Agent 的内容块序列。
- `toolFilter: ToolRestriction | undefined`：可选工具限制，provider 必须声明支持。

## SubagentRun

**公开导出**：`SubagentRun` 来自 `@deepseek-ai/dsh-subagent`。
`id` 是父级命名空间中的子身份，`localAgent` 对远程 provider 可缺省；`result` 对普通子任务失败返回 stopReason 而非拒绝，但基础设施故障可拒绝。`dispose()` 幂等地取消剩余工作并等待资源停稳。
