# Client 右侧栏 Tab 与导航

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@deepseek-ai/dsh-client-ui-sidebar-right/client` 提供两阶段扩展：`ctx.sidebarRightTabs` 声明页面/资源类型，`sidebar.right.pane.tab` slot 以同一实现 `id` 提供正文。`ctx.sidebarRight` 执行导航。

## `SidebarRightTabRegistry`

`ctx.sidebarRightTabs.register(definition)` 返回 disposer；`entries()`、`get(kind)`、`candidates(address)` 与 `claim(address,kind?)` 查询当前类型。该类经 Context 声明合并暴露为服务，未从包的 `./client` 命名导出。

## `SidebarRightTabDefinition`

**公开导出**：`SidebarRightTabDefinition` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
`register(definition)` 返回 disposer。`id` 是实现身份，也是正文 slot 的 `key`；`kind` 是导航时的类型。`title(address)` 给初次打开的标签标题；`guide` 可让页面出现在导览页。页面类型可省略 `patterns`，由 `openTab(kind)` 打开；资源类型用 `patterns` 匹配 `dsh-resource://` URI，再由可选 `canOpen(address)` 否决。默认 `priority: 'extension'`；同 kind 的 extension 可临时接管 builtin，卸载时恢复。`multiple` 决定同 kind 是否可有多个页面，`keepMounted` 控制访问后隐藏期间的挂载。

## `SidebarRightTabPriority`

**公开导出**：`SidebarRightTabPriority` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
优先级为 `extension`、`builtin`、`fallback`。资源候选先按优先级，再按匹配 pattern 长度、登记次序排序。不要用模糊 pattern 抢占无关资源。

## `SidebarRightTabClaim`

**公开导出**：`SidebarRightTabClaim` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
`claim(address,kind?)` 的结果包含最终 `kind`、稳定 `contentId` 与标题。重复打开相同地址时，使用该内容身份避免误建多个页面。

`title` 是此次 claim 决定的初始标签文字，正文若需实时标题应另向 `sidebar.right.pane.tab.title` 注册同一实现 ID。

## `ISidebarRight`

**公开导出**：`ISidebarRight` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
`ctx.sidebarRight.openTab(kind, options?)` 打开页面；`openResource(address, options?)` 打开资源并展开栏。没有对应类型、资源地址不合规或被 `canOpen` 拒绝时会抛错。`close(tabId)`、`active()`、`isExpanded()`、`toggleExpanded()`、`focus(tabId)`、`split(paneId?)` 是公开导航/布局接口；调用前确认目标 Session 与面板状态。

`mounted` 是 `ObservableSnapshot<SessionId | undefined>`，表示当前屏幕上的 Session；没有 Session 或显示全局面板时为 `undefined`。它不等同于所有已打开 Tab 的所属 Session。

## `SidebarRightTabInjected`

**公开导出**：`SidebarRightTabInjected` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
`sidebar.right.pane.tab` 是 session 范围 keyed slot，正文通过 `hooks.tabInfo` 取得当前 Tab 信息。`sidebar.right.pane.tab.title` 可选，注册同一 `id` 可呈现实时标题。还可向 `sidebar.right.tab.menu.item` 与导览相关 slots 加内容。

## `SidebarRightTabParamsMap`

**公开导出**：`SidebarRightTabParamsMap` 来自 `@deepseek-ai/dsh-client-ui-sidebar-right/client`。
页面参数可通过该声明合并表按 kind 约束 `openTab(kind, { params })` 与正文读取；运行时不校验参数，跨包数据须自行验证。

## 边界与证据

源码：`packages/client/ui-sidebar-right/src/client/{index.ts,tab-registry.ts,service.ts,contract/slots.ts,contract/params.ts}`；内置两阶段用例：`packages/client/ui-sidebar-documentpreview/src/client/index.ts`。参见[贡献右侧栏 Tab](../how-to/how-to-client-sidebar-tab.md)。

## `ILayout`

**公开导出**：`ILayout` 来自 `@deepseek-ai/dsh-client-ui-layout/client`。
`@deepseek-ai/dsh-client-ui-layout/client` 的 `ctx.layout` 管理主区域面板与左右栏。`selectPanel(panelId|null)` 选择已登记主面板或回到 Conversation；不存在的 ID 抛错且保留原选择。`beginNavigation()` 中止先前待完成导航并给出本次 `AbortSignal`。`toggleSidebar()` 切换左栏，`openRightbar(track,fullscreen)`/`closeRightbar()` 是右栏 owner 的呈现动作，普通 Tab 扩展应使用 `ctx.sidebarRight`。证据：`packages/client/ui-layout/src/client/{index.ts,service.ts}`。

`panelInfo` 是 `HostObservable<PanelInfo>`，其 `activePanelId` 表示当前全局主面板；`null` 表示 Conversation。组件订阅此源更新选中态，不把一次 `selectPanel` 调用当作状态快照。

## `LayoutController`

**公开导出**：`LayoutController` 来自 `@deepseek-ai/dsh-client-ui-layout/client`。
`ctx.layout` 的运行时实现，维护本次导航的取消控制器；`selectPanel`、`beginNavigation`、`toggleSidebar`、`openRightbar` 与 `closeRightbar` 实现 `ILayout`。第三方通常消费该服务，不自行实例化控制器。证据：`packages/client/ui-layout/src/client/service.ts`。

## `UiWorkspace`

`@deepseek-ai/dsh-client-ui-workspace/client` 命名导出 `UiWorkspace`，并在 Client Context 提供 `ctx.uiWorkspace`。`openSession(target)` 选定 Session 并显示 Conversation；`openWorkspace(workspaceId,beforeOpen?)` 连接 Workspace 后打开 Session，可被后来导航抢占；`connectWorkspace` 取得可复用或新建 Session，`startSession(workspaceId?)` 触发新会话流程。`forkSession`、`archiveSession`、`unarchiveSession`、`pinSession`、`unpinSession` 处理对应持久动作。`pickDirectory`、`listDirectory`、`createDirectory` 是针对已组装 picker 后端的 UI 能力；其 native/browse 形态由 Host `DirectoryPicker` 服务决定。每个异步动作须处理失败、抢占与目标 Session 生命周期。证据：`packages/client/ui-workspace/src/client/{index.ts,navigation.ts}`；步骤见[导航 Workspace 与 Session](../how-to/how-to-client-workspace-navigation.md)。

## `sidebar.panellist` 与 Sidebar slots

`@deepseek-ai/dsh-client-ui-sidebar/client` 声明左栏的 `sidebar.panellist`（全局面板图标列表）、`sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.toggle.badge`、`sidebar.footer.action` 等 seat。面板列表 `id` 应与 `ctx.layout.selectPanel` 的 main panel key 对应；左栏 owner 负责按钮与导航，贡献包提供图标/可见内容。`sidebar.workspaces` 与 `sidebar.settings` 是单占位，不应当作任意动作列表覆盖。证据：`packages/client/ui-sidebar/src/client/{index.ts,contract/slots.ts}`。

## `SidebarPanelMetadata`

**公开导出**：`SidebarPanelMetadata` 来自 `@deepseek-ai/dsh-client-ui-sidebar/client`。
`@deepseek-ai/dsh-client-ui-sidebar/client` 的 `sidebar.panellist` owner 将每个条目的 `id` 与主区域 `main` panel key 配对，并按 `order` 排序；label 在语言变化时重新解析。贡献包登记面板图标时，仍须提供对应 main panel 内容并用 `ctx.layout.selectPanel(id)` 导航。证据：`packages/client/ui-sidebar/src/client/{index.ts,contract/slots.ts}`。

## `SidebarBrandMarkOwnerProps`

**公开导出**：`SidebarBrandMarkOwnerProps` 来自 `@deepseek-ai/dsh-client-ui-sidebar/client`。
`sidebar.brand.mark` 的 owner 提供请求的正方形尺寸 `size`；部署可替换默认标识，保留周围的左栏控制。`sidebar.brand.name`、`sidebar.footer.action` 也由此包的 SlotMap 声明。证据：`packages/client/ui-sidebar/src/client/contract/slots.ts`。
