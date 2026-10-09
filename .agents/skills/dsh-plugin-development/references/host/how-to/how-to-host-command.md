# Host 斜杠命令任务

## 注册一个由交互界面执行的命令

目标是让用户在支持命令的 UI 中输入 `/name`，由 Host 插件直接处理并返回结果，且 Session 留有 `command/run` 与 `command/done` 配对记录。Profile 需装载 `@deepseek-ai/dsh-commands`。对象契约见 [CommandDefinition、CommandInvocation 与 CommandRuntime](../api/api-host-commands.md)。

### 实现步骤

1. 建立 Host 插件入口并声明 `inject = ['commands']`。在 `apply(ctx)` 中调用 `ctx.commands.register({ name, description, handler })`；小写名称不带 `/`，若需要自由文本，再声明 `input.hint`。返回的 disposer 随当前 fiber 清理。本地完整文件与 patch 见 [example-host-command](../examples/example-host-command.md)。
2. handler 读取未经修剪的 `rawInput`，自行校验语法；异步工作观察 UI 传入的 `signal`。返回 `{ kind: 'success', text }` 或 `{ kind: 'error', text }`。若已经追加独立领域事件，可用 `sourceEventSeq` 指向它并考虑 `recordInput: false`，避免重复保存同一输入。
3. 对附件默认拒绝；确实要使用时显式设置 `input.attachments: true`，处理 `invocation.attachments`，并对当前子命令不支持的附件返回错误。不要把 staged receipt 当成已经持久化的文件。
4. 经 Profile patch 或 bundle 装载插件，在支持命令的交互界面执行。命令不是模型工具，不会因为 `ctx.commands.register` 出现在模型 ToolSchema 中。

### 验证与完成边界

对一个 live Agent 调用 `ctx.commands.list(agent)`，确认描述符可见；从 UI 提交命令，检查 handler 结果、`command/run` 和 `command/done` 的同一 `commandId`。测试未知名称不触发 handler、取消能停稳、卸载后描述符消失。纯注册测试不能证明目标 UI 已接入命令列表与提交路径。
