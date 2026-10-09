# Host Workflow 任务

## 从插件运行一次编排脚本

在一个父 Agent 下协调多个子任务，并将最终 JSON 结果归还调用方。Profile 需要 `workflowEngine` 具体实现及其子 Agent provider；若从模型发起，还需 `dsh-tool-workflow`。对象见 [Workflow 契约](../api/api-host-workflow.md)，模型侧例子见 [Workflow 示例](../examples/example-host-workflow.md)。

### 操作步骤

1. 准备具名 `meta` 与 JS 脚本正文，输入 `args` 只作数据。脚本调用 `agent`、`parallel`、`pipeline` 等引擎提供的 hook，并最终 `return` 可 JSON 化的值。
2. 插件直接调用 `ctx.workflowEngine.start({ script, meta, parent, args?, signal? })`。非法请求会在发布前抛错；拿到 run 后用 `try/finally` 等待 `run.result` 并 `await run.dispose()`。
3. 按 `stopReason` 处理完成、取消或错误；不要在错误时消费 `value`。取消调用 `run.cancel`，最后仍需 `dispose`。

### 验证与完成边界

验证非法 meta/脚本、子 Agent 失败、脚本异常、信号取消、并行上限和 dispose 等待。模型工具结果的确切 schema 归 `dsh-tool-workflow`，不能从 Service 的 `WorkflowResult` 推断 UI 已展示中间进度。
