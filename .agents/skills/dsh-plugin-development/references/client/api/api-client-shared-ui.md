# 共享控件、样式与主题

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。普通功能 UI 先复用 `@deepseek-ai/dsh-client-ui-primitives` 的公开控件，再用 CSS Modules 和 `--dsw-*` 语义 token；跨功能插件通过 slot 或 Service 协作。目标版本支持注册主题及临时 token 覆盖，操作见[扩展主题和样式](../how-to/how-to-client-theme-ui.md)。

## `Button`

**公开导出**：`Button` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
从 `@deepseek-ai/dsh-client-ui-primitives` 导入的共享按钮。它属于 Cordis 无关的静态控件层，状态和行为由调用组件通过 props 提供；不要为了一个普通按钮运行时导入另一个功能插件的实现。

## `Tag`

**公开导出**：`Tag` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
共享状态标签。可作为 slot 贡献的 Component 子元素；其文案需经调用方的 locale seat 取得，不能把产品可见中文或英文硬编码到组件中。

## `Menu`

**公开导出**：`Menu` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
共享菜单控件；自定义 listbox 与菜单型交互也按该层的键盘和焦点契约实现，避免在业务包重复搭一套弹层行为。

## `MenuSurface`

**公开导出**：`MenuSurface` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
共享菜单容器，用于需要调用方组合菜单内容的场景。调用方负责菜单项目的语义与动作；弹层、焦点和层叠遵守共享控件规则。

## `ThemeRuntime`

**公开导出**：`ThemeRuntime` 来自 `@deepseek-ai/dsh-client-ui-theme/client`。
`@deepseek-ai/dsh-client-ui-theme/client` 在 Client `ctx.theme` 安装主题服务。`getTheme()` 返回引用稳定的 `ThemeSnapshot`；`register(definition)` 注册具名主题并返回 disposer，重名与保留的 `system` 会报错；`overrideTokens(source,tokens)` 叠加一个具名覆盖层并返回移除该层的 disposer。`setTheme(id)` 切换当前选择，`setFontSize(px)` 只接受目标上下界内整数；业务插件不应擅自覆盖用户偏好。主题改变经 `theme/change` 事件通知。一个动态插件在自身 fiber 中用 `ctx.effect` 持有注册或覆盖 disposer。

## `ThemeDefinition`

**公开导出**：`ThemeDefinition` 来自 `@deepseek-ai/dsh-client-ui-theme/client`。
`id` 是注册 ID，`colorScheme` 为 `light` 或 `dark`，`tokens` 是 alias token 名到 CSS 值的映射。`system` 是偏好而非主题 ID。注册时指定的 `colorScheme` 决定基础调色板，不从 ID 文本猜测。

## `ThemeTokenOverrides`

**公开导出**：`ThemeTokenOverrides` 来自 `@deepseek-ai/dsh-client-ui-theme/client`。
键为 token 名，值须是 `{ light, dark }` 成对颜色值；即使两种模式相同也要双填。后注册的 layer 按 token 胜出，移除 layer 恢复其下层。只覆盖语义 alias，不在功能组件里写死全局颜色。

## `ThemeSnapshot`

**公开导出**：`ThemeSnapshot` 来自 `@deepseek-ai/dsh-client-ui-theme/client`。
包含 `preference`、`fontSize`、`active`、`themes` 与单调 `revision`。组件渲染时应通过框架订阅渠道取得变化，不反复读取 DOM computed style 或把 `getTheme()` 的当前值复制进 React 本地状态。主题样式文件与 `--dsw-*` token 由 Client Theme 和 Web 构建链提供。
