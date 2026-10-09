# Host Workflow 编排对象

适用 `@deepseek-ai/dsh-workflow@0.2.0-rc.2`。`ctx.workflowEngine` 是可替换的抽象 Service；具体脚本执行器和模型工具分别装载。见 [运行 Workflow](../how-to/how-to-host-workflow.md)。

## WorkflowEngine

**公开导出**：`WorkflowEngine` 来自 `@deepseek-ai/dsh-workflow`。
`start(request)` 在发布 run 前校验 `meta` 与脚本，返回 holder-owned `WorkflowRun`；第二个 engine 与同作用域 Service 名冲突。自定义 engine 必须实现同样的请求、结果、取消和生命周期事件语义。`workflow/*` 事件只携带观察快照，不交出 live run 的取消权。

## WorkflowStartRequest

**公开导出**：`WorkflowStartRequest` 来自 `@deepseek-ai/dsh-workflow`。
包含 JS 脚本正文、纯 JSON `meta`、可选 `args`、父 Agent、取消 signal，以及可选 provider 和总子任务上限。脚本可用顶层 await，结果须可转为 JSON；`meta` 是身份数据，不作为代码执行。

以下成员是该对象的公开契约：

- `maxTotalAgents: number | undefined`：可选整个工作流的 Agent 总量上限。
- `parent: Agent`：启动工作流的父 Agent。
- `script: string`：工作流脚本文本。
- `subagentProvider: string | undefined`：可选委派 provider 名称，决定工作流调用哪个子 Agent 实现。

## WorkflowRun

**公开导出**：`WorkflowRun` 来自 `@deepseek-ai/dsh-workflow`。
返回 `id`、已验证的 `meta`、不会因普通运行失败而拒绝的 `result`、`cancel(reason?)` 和幂等 `dispose()`。调用方必须在所有路径等待 `dispose`，以确保脚本和子 Agent 停稳。运行失败由 `WorkflowResult.stopReason` 表示；启动前非法请求则同步抛错，不产生 run。

## WorkflowResult

**公开导出**：`WorkflowResult` 来自 `@deepseek-ai/dsh-workflow`。
`stopReason` 为 `completed`、`cancelled` 或 `error`；只有完成时 `value` 才有意义。`agentsStarted` 反映被接受的子任务数，终止路径可退化为 Host 已观察数量。不要把单个 child 的普通失败误写成整个引擎基础设施失败。

## WorkflowError

**公开导出**：`WorkflowError` 来自 `@deepseek-ai/dsh-workflow`。
机器可读 `code` 和 fatal 标志用于脚本/API 契约错误；fatal 应终止脚本，不应被并行组合映射为普通 child 的 `null`。
