# Host 命令对象

适用 `@deepseek-ai/dsh-commands@0.2.0-rc.2`。命令是用户在交互界面输入的斜杠操作，由 UI 经 `ctx.commands` 执行，handler 不作为模型工具发送给模型。注册与装载见 [Host 命令任务](../how-to/how-to-host-command.md)。

## CommandDefinition

**公开导出**：`CommandDefinition` 来自 `@deepseek-ai/dsh-commands`。
注册项必需 `name`、`description`、`handler`；`name` 是没有 `/` 的小写命令名，符合 `[a-z][a-z0-9_-]*`。`definitionId?` 是插件拥有的稳定身份；`input?` 提供自由文本提示和是否接收 attachments；`recordInput?` 默认为 true，若领域事件已经拥有完整输入，可设 false 避免 Session 重复记录。`handler` 返回 `CommandResult`：`{ kind: 'success', text?, sourceEventSeq? }` 或 `{ kind: 'error', text }`。

## CommandInvocation

**公开导出**：`CommandInvocation` 来自 `@deepseek-ai/dsh-commands`。
handler 收到 `commandId`、确切 `agent`、未修剪的 `rawInput`、已获准的图片/文件 `attachments` 和 UI 请求拥有的 `signal`。处理异步工作时观察 signal；附件声明不等于所有子命令都能使用附件，不能使用时应返回错误以便提交方保留原附件。

## CommandRuntime

**公开导出**：`CommandRuntime` 来自 `@deepseek-ai/dsh-commands`。
`ctx.commands.register(definition)` 返回随 fiber 自动清理的精确 disposer；同一作用域重名失败，Agent 作用域定义可遮蔽全局定义。`list(agent)` 返回对该 Agent 有效、按名称排序的只读 descriptor；`find(agent, name)` 取实际定义；`execute(agent, line, attachments, signal)` 由交互提交方使用。已解析的命令执行先写 `command/run`，结算后写 `command/done`；未知名称或无效语法不进入 handler，也不记生命周期事件。文件 receipt resolver 是上传服务的单一权威，普通命令插件不应另行注册。

## CommandResult

`CommandResult` 表达成功或失败。`sourceEventSeq` 让成功结果指向更丰富的既有领域事件；否则 `text` 是 UI 直接展示的摘要。

## CommandDescriptor

`CommandDescriptor` 是不含 handler 的发现数据，含可选 `definitionId`、`input`，不能把它当成执行权限或服务端处理结果。

以下成员是该对象的公开契约：

- `description: string`：提供给命令发现界面的说明文字。
- `name: string`：命令的注册名和路由键。
