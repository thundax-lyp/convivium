# Client 命令 UI

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@deepseek-ai/dsh-client-ui-commands/client` 的 `ctx.commandUi` 负责 `/` 候选、Client 操作和 Host 命令的裸调用交互。Host 命令的执行与日志仍属于 Host；Client contribution 只在本浏览器执行。

## `CommandUiRuntime`

**公开导出**：`CommandUiRuntime` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`ctx.commandUi.register(contribution)` 登记 Client 命令，`decorate(decoration)` 给已有 Host 命令的裸调用添加 UI。两者返回 disposer，重复名称在登记时抛错。`dismiss(name)` 关闭该命令的 popup；`popupFor(actx)` 是 overlay 布线接口，普通贡献不需调用。Client 命令与 Host 目录同名会在候选合成时显式失败，不能依赖覆盖顺序。

## `CommandUiContract`

**公开导出**：`CommandUiContract` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
业务插件通过 `register` 或 `decorate` 登记交互，通过 `dismiss` 关闭弹窗；`popupFor` 属于 overlay 布线接口。四个方法的 disposer 和服务生命周期由 `CommandUiRuntime` 实现。

## `CommandContribution`

**公开导出**：`CommandContribution` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`name` 是不带 `/` 的 Client 命令名；`label()`、`description()` 在候选计算时重读，`available(session)` 决定是否出现，`ui` 指定执行方式。可选 `icon` 来自共享图标组件。

## `CommandDecoration`

**公开导出**：`CommandDecoration` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`name` 指向已有 Host 命令；`available(session)` 控制本次裸调用是否提供 `ui`。它不制造目录项，也不改带参数命令的 Host 路径。

## `CommandUiSpec`

**公开导出**：`CommandUiSpec` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`ActionSpec | PopupSelectSpec` 的判别联合；按 `kind` 选择执行模式，不在业务代码里假定两者都有候选列表。

## `ActionSpec`

**公开导出**：`ActionSpec` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`kind: 'action'` 的 `run(session)` 是同步 Client 操作，不提交输入。

## `PopupSelectSpec`

**公开导出**：`PopupSelectSpec` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`kind: 'popupSelect'` 的 `options(session, signal)` 异步取候选，`onSelect(option, session)` 接收所选项；应响应 `AbortSignal`，不在取消后覆盖新 popup。`searchMode` 可取 `substring` 或 `fuzzy-label`，`searchLabels()` 提供当前语言文案。

## `SelectOption`

`SelectOption` 需稳定 `id` 和 `label`，可选 `detail`、`badge`、`group`、`active`、`confirmation`。`active` 会改变弹窗初始高亮，不只是装饰；风险操作用 `confirmation` 明确二次确认文案。

## `SelectOptionGroup`

**公开导出**：`SelectOptionGroup` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`name` 是分组身份，`label` 是当前语言显示名。相同 name 的候选共享弹窗分组标题。

## `SelectConfirmation`

**公开导出**：`SelectConfirmation` 来自 `@deepseek-ai/dsh-client-ui-commands/client`。
`title`、`description`、`acknowledgeLabel`、`cancelLabel`、`confirmLabel` 指定弹窗中的完整确认文案；只用于需要二次确认的候选。

## 边界与证据

源码：`packages/client/ui-commands/src/client/{index.ts,contract.ts,service.ts}`，声明：`packages/client/ui-commands/lib/types/client/{index.d.ts,contract.d.ts,service.d.ts}`。命令 UI 依赖输入触发源、Session 与 Remote 命令目录；具体贡献流程见[贡献命令 UI](../how-to/how-to-client-command-ui.md)。
