# Tool 结果与输入触发扩展

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。模型工具结果先成为 Session 中可回放的调用/结果事件，再由 Web Client 按 wire 工具名选择视图。输入候选由独立 `@`、`/` 源提供；两者是不同生命周期。分别见[Tool View](../how-to/how-to-client-tool-view.md)与[输入候选源](../how-to/how-to-client-input-trigger.md)。

## `ToolCallViewProps`

`@deepseek-ai/dsh-client-ui-tool/client` 公开的 `ToolCallViewProps` 是 `PropsRuntime<'tool.call.toolview'>`。其 owner 字段包含 `callId`、`toolName`、workspace `cwd`、Host `home`、`openFile`、`loadImage`、可选 `inspect` 和 `useDisclosure`。`phase` 是 `preparing`、`start`、`result` 判别联合；每种 `block` 的结构随 phase 改变：准备态没有完整 args，start 有已派发参数，result 有持久化结果。只有准备态需要看原始前缀时使用注入的 `useToolCallArgumentsPartial`，不能假设它等同最终 args。注册位置是 `tool.call.toolview` keyed slot，`key` 必须与工具 wire 名完全相同；无人注册时回退通用行，拼错 key 则不会显示自定义视图。

## `ToolCallOwnerProps`

**公开导出**：`ToolCallOwnerProps` 来自 `@deepseek-ai/dsh-client-ui-tool/client`。
这是工具树给每个原子视图的 owner 数据；`ToolCallCommonProps` 与 `ToolCallPhaseProps` 构成其完整联合。`callId` 和 `toolName` 标识调用，`useDisclosure` 管理展开状态；`openFile`、`loadImage`、可选 `inspect` 是 owner 已提供的授权入口，插件不自行猜测 Session 文件路径或跨侧访问。组件按 `phase` 分支读取 block，避免在 preparing 阶段解析不存在的结果。

## `InputTriggerServiceContract`

**公开导出**：`InputTriggerServiceContract` 来自 `@deepseek-ai/dsh-client-ui-input-trigger/client`。
`@deepseek-ai/dsh-client-ui-input-trigger/client` 的 `ctx.inputTriggers.registerSource(source)` 注册一个 `@` 或 `/` 来源，重复 `(trigger,name)` 报错；返回 disposer，caller 将它绑定自己的 plugin fiber。`sessionOf(actx)` 只接受仍持有的 Session scope，返回其懒创建 controller；普通来源只需要 `registerSource`。注销来源时，打开菜单中的该组也被移除。

## `InputTriggerSource`

**公开导出**：`InputTriggerSource` 来自 `@deepseek-ai/dsh-client-ui-input-trigger/client`。
`trigger` 为 `/` 或 `@`，`name` 是同一 trigger 下唯一组名；`order` 与 `showGroupTitle` 控制展示。`candidates(session,req)` 异步返回纯显示数据，必须尊重查询变化和菜单关闭时的 `req.signal`；`onPick(pick)` 返回输入管线处理的 `PickOutcome`。可选 `matchSpace` 只读热状态、同步返回；`matchEnter` 可等自身 warmup 并接收 `AbortSignal` 与附件 envelope；实现这些 hook 就声明参与判定，不能随意占用普通输入。`warm` 在 Session scope 创建时预热；来源只收到稳定 Session identity 投影，RPC/服务访问从注册时闭包的自己的 ctx 取得。

## `InputTriggerCandidate`

**公开导出**：`InputTriggerCandidate` 来自 `@deepseek-ai/dsh-client-ui-input-trigger/client`。
`name` 是精确匹配及 pick 身份；`label`、`description`、`hint`、`icon`、`section` 是纯显示信息，`value` 是来源私有载荷，`drill` 标记可继续深入的候选。文案应由来源的 locale owner 处理；候选对象不携带回调或 Cordis Context。
