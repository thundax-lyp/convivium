# Host 提示词与执行策略对象

适用 `@deepseek-ai/dsh-system-prompt`、`@deepseek-ai/dsh-user-approval` 与 `@deepseek-ai/dsh-tools` 的 Host 公开入口。提示词贡献、审批和工具执行策略是不同层：模型文本不能授予权限，审批结果必须由正在执行的策略检查。实施顺序见 [提示词与工具门禁](../how-to/how-to-host-prompt-policy.md)。

## SystemPrompt

**公开导出**：`SystemPrompt` 来自 `@deepseek-ai/dsh-system-prompt`。
`ctx.systemPrompt.section(section)` 注册有序系统提示词段；`context(context)` 注册动态模型上下文；`variable(name, provider)` 注册插值变量；这些方法返回随 fiber 清理的 disposer。相同层重名会失败，Agent 作用域可遮蔽全局段或变量。`tools(provider)` 是工具 schema 提供者入口，常规工具插件应使用 `ctx.tools.register` 而不手工复刻工具目录。`getSectionOrder` / `getContextOrder` 返回仓库定义的顺序位置。`assemble()` 组装输出；普通插件不应把一次组装结果当成跨步骤固定文本。

## PromptSection

`PromptSection` 必需 `name`、有限的 `order`、`text`。`text` 可是静态字符串或每次组装执行的 provider。`interpolate` 默认 true；`complete` 将该贡献作为唯一系统提示词段，多个有效 complete 会失败。

## PromptContext

`PromptContext` 同样需要 `name`、`order`、`text`，用于随模型上下文变化且最终作为 user-role snapshot 保存的内容。需要恢复的事实不能只存在于 provider 闭包，应能从 Session 或稳定配置重建。

## ApprovalService

**公开导出**：`ApprovalService` 来自 `@deepseek-ai/dsh-user-approval`。
`ctx.approval.request(req)` 在**已打开的 Agent turn 内**请求一次只读决策，写入 `approval/asked` 与 `approval/decided` 审计对；空闲时调用会在写前失败。`ApprovalRequest` 携带 Agent、工具身份、理由和信号。结果词汇为 `allowed-once`、`rejected`、`cancelled`、`unavailable`，只有 `allowed-once` 授权本次动作。`setPolicy(agent, 'ask' | 'never')` 切换单个 live Agent 的会话策略；`never` 无提示直接拒绝，`ask` 没有可用 answerer 时仍 fail closed。工具插件不要因为提示词写了“需要批准”就直接执行敏感操作。

以下成员是该对象的公开契约：

- `overrideOf: (session: Session) => ApprovalPolicy | undefined`：读取 Session 日志中显式设置的审批覆盖；未设置返回 undefined。

## ApprovalRequest

`ApprovalRequest` 标识 Agent、工具名、理由、用户界面展示内容与取消信号；它只能由已打开的 turn 调用 `ApprovalService.request` 产生审计事实。

以下成员是该对象的公开契约：

- `agent: Agent`：提出授权请求的 Agent，用于确定会话与策略。
- `callId: ToolCallId | undefined`：可选工具调用 ID，把决策关联到具体调用。
- `reason: string | undefined`：可选给审批方的原因说明。
- `signal: AbortSignal | undefined`：可选取消信号，取消时停止等待审批。
- `toolName: string`：待审批工具名。

## ApprovalOutcome

`ApprovalOutcome` 的四种结果中仅 `allowed-once` 授权当前执行。`rejected`、`cancelled` 和 `unavailable` 都应终止受控动作。

## ToolRuntime

`tools/pre-execute` 是允许、拒绝、取消或询问的异步 waterfall；`ctx.tools.guard()` 在它之后作不可被撤销的同步拒绝。`tools/execute` 包装实际分发，可做超时或指标；其可替换 signal 必须恢复，注册表仍融合原调用方取消。`tools/post-execute` 处理规范结果的接受、替换或阻止；`tools/result` 只能观察冻结的最终结果。Agent 作用域内的监听器只收到该 Agent 的工具调用。策略必须考虑失败与取消路径，不能只观察成功分支。具体决策联合与事件参数来自 `@deepseek-ai/dsh-tools` 包根公开声明及 Cordis `Events` 合并。

## ToolGuard

`ToolGuard` 是同步 `(execution: Readonly<ToolExecution>) => string | undefined`。返回字符串是不可被后续监听器撤销的拒绝原因；返回 `undefined` 只表示本 guard 不拒绝，不能覆盖其他 guard 的拒绝。它在 `tools/pre-execute` 之后、工具主体之前运行。需要异步人工询问时改用 pre-execute 的 `ask` 决策，不在 guard 中偷偷启动 Promise。

## PreToolDecision

**公开导出**：`PreToolDecision` 来自 `@deepseek-ai/dsh-tools`。
`tools/pre-execute` 的结果联合为 `{ kind: 'allow' }`、`{ kind: 'deny', reason, info? }`、`{ kind: 'cancel' }` 或 `{ kind: 'ask', reason?, displayReason? }`。`ask` 只有审批服务返回 `allowed-once` 才能继续；参数在此时已记录并呈现，策略不能重写输入。异步监听器要观察 `exec.signal` 并完全停稳。

## PostToolDecision

**公开导出**：`PostToolDecision` 来自 `@deepseek-ai/dsh-tools`。
`tools/post-execute` 返回 `accept` 或 `block`。`accept` 可保留原结果，或**只替换**规范 `value` 与 `content` 中的一种，并可追加 `additionalContexts`；两者同时替换会失败。`block` 用 `feedback: ContentBlock[]` 形成错误结果。失败结果不能被当作成功值重新替换；观察者应按 `ToolExecutionResult.isError` 分支处理。
