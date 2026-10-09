# Host 模型工具对象

适用 `@deepseek-ai/dsh-tools@0.2.0-rc.2` 的 Host 入口。完整包与 Profile 装载见 [注册模型工具](../how-to/how-to-host-tool.md)。

## defineTool

`defineTool(options)` 从 `DefineToolOptions` 创建可注册的 `ToolDefinition`；`defineTool` 返回值供 `ctx.tools.register` 使用。调用前保持定义不变，切换版本时注销旧定义再注册新定义。

## DefineToolOptions

**公开导出**：`DefineToolOptions` 来自 `@deepseek-ai/dsh-tools`。
必填项为 `name`、`description`、`parameters`、`output.schema`、`output.render` 与异步 `execute`。参数 schema 会推导 `execute` 的 `args` 类型，并在工具主体前校验；`execute` 返回 `output.schema` 声明的唯一规范 JSON 值。注册表再校验和冻结成功值，`render(args, value)` 从同一值生成模型可见 `ContentBlock[]`。工具主体不要返回内容块，也不要让程序从渲染文本反解析字段。

| 选项 | 契约 |
| --- | --- |
| `parameters` | 隐式对象根的逐属性 schema；类型、必填、枚举与嵌套形状在执行前校验。跨字段与非空等业务约束仍由主体检查。 |
| `output.schema` | 规范成功值的 schema；与 `execute` 的返回值保持一致。 |
| `output.render` | 从已验证值生成 Native 模型内容；应是可回放的纯投影。 |
| `output.presentationMeta?` | 从参数和规范值生成可持久化的展示事实；不放 React props。 |
| `timeoutMs?` | 有限正数的协作式执行时限；工具必须响应取消信号。 |
| `isConcurrencySafe?` | 纯函数，声明一次调用是否能与兄弟调用重叠。 |
| `presentCall?`、`presentResult?` | 纯展示意图，旧日志或无效参数可退回通用视图；内置 Web Client 不直接消费这两个方法。 |
| `projectContent?`、`finalizeContent?` | 分别在结果策略前及归一化结果最后阶段调整内容，需保留规范结果和策略的边界。 |

## ToolDefinition

`ToolDefinition` 是注册表接受的工具契约：基础 `ToolSchema` 加 `output`、`execute`、可选超时、并发分类器及纯展示回调。插件通常通过 `defineTool` 创建它；手动构造定义时，必须自己履行参数校验与输出约定。`ToolRuntime.register` 仍会验证输出 schema 与渲染器是否存在。

以下成员是该对象的公开契约：

- `finalizeContent: ((exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => ContentBlock[] | undefined) | undefined`：在执行结果确定后生成最终模型内容；包括失败路径，回调必须完整且不得再执行工具。
- `isConcurrencySafe: ((args: unknown) => boolean) | undefined`：逐次判断参数是否允许并发；仅返回 true 时才能并行调度。
- `presentCall: ((args: unknown) => ToolCallView | undefined) | undefined`：把调用参数映射为 UI 调用视图，不得修改执行状态。
- `presentResult: ((args: unknown, result: ToolResult) => ToolResultView | undefined) | undefined`：把规范结果映射为 UI 结果视图，不得改变工具结果。
- `projectContent: ((exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => ContentBlock[] | undefined) | undefined`：把规范执行结果投影为模型可见内容；保持唯一规范 JSON 结果。
- `timeoutMs: number | undefined`：可选执行预算，须为有限正数；由超时策略执行取消。

## ToolRuntime

插件声明 `export const inject = ['tools']` 后使用 `ctx.tools`，由 `ToolRuntime` Service 提供。`register(definition)` 返回精确注销函数；相同层重名以及保留名 `run_code` 会失败。注册随当前 Cordis fiber 清理；也可调用返回的函数提前释放。Agent 作用域内的工具可遮蔽全局定义。`get(name, scope)` 和 `schemas(scope)` 依作用域解析可见工具，`restrict(filter)` 限制继承的全局工具，`guard(guard)` 设置不可被后续监听器撤销的同步拒绝。

运行模式由 `@deepseek-ai/dsh-tools` 配置 `mode: 'native' | 'ptc' | 'both'` 决定，默认 `native`。`ptc` 中模型直接调用普通工具名会得到 `UNKNOWN_TOOL`；模型通过 `run_code` 内生成的 SDK 到达工具。工具插件本身无需添加第二套注册路径。

以下成员是该对象的公开契约：

- `execute: (exec: ToolExecutionInput) => Promise<ToolExecutionResult>`：执行 ToolExecutionInput 并返回规范结果；调用方处理失败与取消。
- `presentAs: (mode: ToolPresentationMode) => () => void`：临时切换工具展示模式，返回恢复函数并在作用域结束调用。

## ToolExecution

**公开导出**：`ToolExecution` 来自 `@deepseek-ai/dsh-tools`。
注册表把已解析参数变为隔离且冻结的 JSON，给一次分发分配只读身份：`callId`、`rootCallId`、`name`、`arguments`、不透明 `token`、可选 `parent`、调用方拥有且必填的 `signal`，以及可选 `agent`。不要修改 `arguments` 或身份字段。

## ToolRunContext

`execute(args, exec)` 的 `exec` 是 `ToolRunContext`，继承上述执行身份，另提供 `deferContext(context)` 和 `concludeTurn()`。不要修改 `args`；异步 I/O 应把 `exec.signal` 传入支持取消的 API，或在自身任务中监听信号并停稳。

`exec.agent` 可以缺省；只有 Agent 任务拥有会话时才能用它追加模型可见事实。需要跨重启保留的状态应写入 Session 或独立持久层，不能只保存在工具闭包。工具抛错、输入无效或成功值不符合 schema，注册表都产生失败结果；调用者应检查失败通道，不能用工具未抛异常来判断任务完成。

## Config

**公开导出**：`Config` 来自 `@deepseek-ai/dsh-tools`。
`@deepseek-ai/dsh-tools` 的插件配置公开 `mode?: 'native' | 'ptc' | 'both'` 和 `maxParallelSubCalls?: number`；schema 分别默认 `native`、`10`，后者要求至少为 1 的自然数。配置属于注册表 Service，不是每个工具的独立选项。
