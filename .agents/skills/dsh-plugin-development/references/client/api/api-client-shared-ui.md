# 共享控件、样式与主题

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。普通功能 UI 先复用 `@deepseek-ai/dsh-client-ui-primitives` 的公开控件，再用 CSS Modules 和 `--dsw-*` 语义 token；跨功能插件通过 slot 或 Service 协作。目标版本支持注册主题及临时 token 覆盖，操作见[扩展主题和样式](../how-to/how-to-client-theme-ui.md)。

## 控件选型

从 `@deepseek-ai/dsh-client-ui-primitives` 包根入口导入，按交互语义选择：

| 需要的界面 | 首选公开控件 | 关键区别 |
| --- | --- | --- |
| 操作与状态 | `Button`、`Tag`、`Pill` | `Tag` 是只读短徽章；`Pill` 可作为选中 chip 或较高的静态状态。 |
| 布尔值与文本 | `Switch`、`Checkbox`、`Input` | 前两者由调用方持有布尔值；`Input` 是单行输入，不是 composer。 |
| 互斥模式 | `SegmentedControl` | 一个受控选中值及对应面板；可同时选中的 chip 用多个 `Pill`。 |
| 下拉动作与提示 | `Menu`、`MenuSurface`、`Tooltip` | 菜单有项目与焦点走位；`Tooltip` 只补充锚点提示。 |

同一包根入口还导出以下专项控件；这里帮助定位用途，实际使用时须核对目标版本的公开声明和组件 props：

| 用途 | 公开导出 |
| --- | --- |
| 菜单行与分组 | `MenuItemButton`、`MenuGroup`、`observeStickyMenuGroups` |
| 分段与状态展示 | `SegmentedTabs`、`PathLabel`、`StateDot`、`ConnectionIndicator`、`DisclosureRow`、`TextShimmer` |
| 浮层与确认 | `Modal`、`RiskConfirmation`、`HoverCard`、`ImageLightbox`、`Toast` |
| 设置表单 | `SettingsForm`、`SettingsValueField`、`SettingsSecretField`、`SettingsFormModel`、`settingsNumberField`、`settingsTextField` |
| 结构化内容 | `JsonTree`、`JsonBlock`、`MarkdownText`、`MarkdownDelegateProvider`、`CodeBlock` |
| 工具结果卡片 | `TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock`、`WebBlock` |
| 图形与文件类别 | `FileTypeIcon`、`classifyFileType`、`fileExtension`、`LinkIconMedium` 及公开图标 |

包内实现或其他功能插件的组件不自动成为公开契约；此版本没有公开 `List`／`ListItem`。接入与验证顺序见[复用共享控件](../how-to/how-to-client-shared-ui.md)。

## `Button`

**公开导出**：`Button` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
从 `@deepseek-ai/dsh-client-ui-primitives` 导入的共享按钮。它属于 Cordis 无关的静态控件层，状态和行为由调用组件通过 props 提供；不要为了一个普通按钮运行时导入另一个功能插件的实现。

## `Tag`

**公开导出**：`Tag` 来自 `@deepseek-ai/dsh-client-ui-primitives`。
共享状态标签。可作为 slot 贡献的 Component 子元素；其文案需经调用方的 locale seat 取得，不能把产品可见中文或英文硬编码到组件中。

## `Pill`

**公开导出**：`Pill` 来自 `@deepseek-ai/dsh-client-ui-primitives`。`active` 控制选中外观；传入 `onClick` 时渲染按钮，不传时渲染静态 `span`。适合筛选 chip 或 24px 文本行的状态；11px 只读徽章应选 `Tag`。调用方持有选中状态与文案。

## `Switch`

**公开导出**：`Switch` 来自 `@deepseek-ai/dsh-client-ui-primitives`。受控 `checked` 与 `(next: boolean) => void` 的 `onChange`，必需的 `label` 是可访问名称；`disabled` 可阻止操作，`title` 提供本地化禁用原因。写入失败时由调用方保留或恢复状态。

## `Checkbox`

**公开导出**：`Checkbox` 来自 `@deepseek-ai/dsh-client-ui-primitives`。用原生复选框语义呈现受控 `checked`，`onChange` 收到请求的新布尔值；必需的 `label` 同时可见且可访问。调用方持有写入状态、错误与取消逻辑。

## `Input`

**公开导出**：`Input` 来自 `@deepseek-ai/dsh-client-ui-primitives`。单行原生输入框，透传输入属性，`icon` 可加前置图形，ref 指向内部 `HTMLInputElement`。搜索和行内表单可复用；多行 composer 不是它的职责。

## `SegmentedControl`

**公开导出**：`SegmentedControl` 来自 `@deepseek-ai/dsh-client-ui-primitives`。`id`、受控 `value`、至少两项的 `options`、`onChange(next)` 和本地化 `label` 构成 tablist。每项有 `value`、`label`，可选 `disabled` 与 `title`；调用方渲染面板，并用 `<id>-<value>-panel` 和 `aria-labelledby` 连到对应 tab。方向键与 Home／End 在可用项间走位；进行中写入可用控件级 `disabled` 锁住切换。多选 chip 应用 `Pill`。

## `Tooltip`

**公开导出**：`Tooltip` 来自 `@deepseek-ai/dsh-client-ui-primitives`。用 `label` 和单个可克隆锚点子元素提供悬停与键盘焦点提示；`delayMs`、`focusDelayMs` 可调延迟，`portal` 可避免容器裁剪。对需要点击后保持提示的说明按钮可用 `openOnClick`；普通操作按钮点击后关闭提示。调用方提供本地化文案，不能用它替代可访问名称。

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
