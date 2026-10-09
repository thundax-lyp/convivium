# 贡献左栏全局面板

## 左栏全局面板贡献

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已加载 layout、sidebar、slot renderer 和本包。先读[左栏 slots 与布局契约](../api/api-client-sidebar.md)。

### 步骤

1. 为全局面板选稳定 `MainPanelId`。通过 `ctx.slots.inject('main',...)` 注册相同 `key` 的 root 范围 keyed 内容；通过 `ctx.slots.inject('sidebar.panellist',...)` 注册相同 `id` 的图标、`order` 与可随语言变化的 `label`。两边必须由同一插件生命周期释放。
2. 左栏 owner 负责点击后调用 `ctx.layout.selectPanel(id)`；其他入口也可调用该方法。面板 ID 未注册时它会抛错并保留原选择，因此卸载期间不能继续导航到旧 ID。
3. 面板内容的状态与订阅随组件/插件生命周期释放；它是全局 Profile 面板，不应把当前 Session 数据当作唯一存在的事实。若需导航到会话，调用 `ctx.uiWorkspace.openSession(target)`。
4. 在真实 Web Profile 验证图标/标签、点击选中、返回 Conversation、语言切换、卸载再装载与其他面板并存。

### 完成判据

同一 ID 的左栏入口与主面板同时存在，切换/卸载不会留下无法打开的入口。静态 SlotMap 类型通过不代表渲染和导航已验证。
