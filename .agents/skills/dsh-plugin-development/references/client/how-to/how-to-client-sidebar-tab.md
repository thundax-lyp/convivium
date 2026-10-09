# 贡献右侧栏 Tab：任务指南

## 贡献右侧栏 Tab

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已加载右侧栏 owner、renderer、slot 框架与本包。先读[右侧栏契约](../api/api-client-sidebar.md)及[Slot 契约](../api/api-client-slots.md)。

### 步骤

1. 给类型选稳定 `id` 与 `kind`。页面类型省略 `patterns`，资源查看器列出明确的 `dsh-resource://` 匹配 pattern。必要时用便宜的同步 `canOpen` 收窄；只在确需接管内置同 kind 类型时使用其 kind 和 `priority: 'extension'`。
2. 在 Client `apply` 内用 `ctx.effect(() => ctx.sidebarRightTabs.register(definition))` 登记类型，再用 `ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body))` 提供正文。类型 ID 与 slot key 必须一致，两种注册同生同灭。实时标题另行注册 `sidebar.right.pane.tab.title`。
   最小浏览器半侧见[右侧栏页面示例](../examples/example-client-sidebar-tab.md)。
3. 页面入口调用 `ctx.sidebarRight.openTab(kind)`；资源入口调用 `ctx.sidebarRight.openResource(address)`。若有页面参数，声明合并 `SidebarRightTabParamsMap` 并在正文处理缺省值。正文持有的数据订阅、下载、Blob URL 必须随 Tab 卸载或请求取消释放。
4. 在真实 Web Profile 验证导览入口、重复打开、切换 Session、关闭与重新打开、无匹配地址、与内置 viewer 重叠时的选择及插件卸载恢复。

### 完成判据

元数据与正文均装载，导航可显示预期内容，卸载后类型与正文同时消失且内置候选恢复。静态声明检查不代表浏览器生命周期验证。
