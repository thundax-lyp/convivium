# Client Web：包、模块与界面扩展关系

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Web 扩展是同一 Loader 包的两侧：Host 的 `.` 导出可参与 Profile，浏览器的 `./client` 导出由 Client 模块系统送到页面。包的 `dsh.client.platform` 必须为 `web`；声明 `./client` 本身不安装插件，真实 Profile 仍需启用裸包名行。可用的既有 Web Profile 组合见[安装 Web 半侧](../how-to/how-to-client-web-package.md)。

## 对象关系

1. Host Loader 持有已启用条目。`@deepseek-ai/dsh-client-modules` 的 Host 半侧扫描包 manifest 与 `./client`，向 Web 页面提供模块图和构建产物；浏览器 `ClientModuleSystem` 先物化模块，再由 Cordis 激活 Client 插件。
2. `@deepseek-ai/dsh-client-ui-renderer/client` 安装 `ctx.slots` 并实现 React 渲染；`@deepseek-ai/dsh-client-ui-slots` 提供声明合并的 `SlotMap`、注册类型和不依赖 React 的注册核心。父组件通过 `children` 声明并渲染扩展位置，贡献包通过 `ctx.slots.inject(name, ...)` 等待该声明。
3. 组件使用 `ui-primitives` 的共享控件、`ui-theme` 的语义 token 与 CSS Modules。跨功能 UI 通过 slot，而非运行时导入另一个功能插件的 Component。

## 选型与使用

| 目标 | 先读契约 | 操作路径 |
| --- | --- | --- |
| 发布可加载的 Web 半侧 | [Client 包与模块](api-client-modules.md) | [安装 Web 半侧](../how-to/how-to-client-web-package.md) |
| 在现有页面添加卡片、标签或操作 | [Slot 与组件](api-client-slots.md) | [贡献 Web slot](../how-to/how-to-client-slot-contribution.md) |
| 页面调用 Host 数据 | [Remote 调用面](api-client-remote.md) | [调用 Remote](../how-to/how-to-client-remote-call.md) |
| 发布新的 Host Remote 供 Client 调用 | [Remote 调用面](api-client-remote.md)、[Typert 构建](api-client-typert-build.md) | [发布 Host Remote](../how-to/how-to-client-publish-remote.md) |
| 将业务事件显示为会话 Node | [Conversation 扩展](api-client-conversation.md) | [注册 Conversation Node](../how-to/how-to-client-conversation-node.md) |
| 为 Host 配置提供页面 | [ConfigForm 与 Settings UI](api-client-settings.md) | [贡献设置卡片](../how-to/how-to-client-settings-card.md) |
| 查找并复用现成控件 | [共享控件与主题](api-client-shared-ui.md) | [选择共享控件](../how-to/how-to-client-shared-ui.md) |
| 提供主题 | [共享控件与主题](api-client-shared-ui.md) | [扩展主题和样式](../how-to/how-to-client-theme-ui.md) |
| 为 Web 组件提供实时资源、语言或快捷键 | [Client 共享服务](api-client-services.md) | [资源 Provider](../how-to/how-to-client-resource-provider.md)、[词典与快捷键](../how-to/how-to-client-locale-shortcuts.md) |
| 向指定 Session 上传浏览器文件 | [Client 共享服务](api-client-services.md) | [上传文件](../how-to/how-to-client-upload-file.md) |
| 自定义工具结果或输入候选 | [Tool 与输入扩展](api-client-interaction.md) | [Tool View](../how-to/how-to-client-tool-view.md)、[输入候选源](../how-to/how-to-client-input-trigger.md) |
| 添加文件预览格式 | [文档预览扩展](api-client-preview.md) | [注册文档预览](../how-to/how-to-client-document-preview.md) |
| 给命令菜单添加 Client 操作或 Host 命令弹窗 | [命令 UI](api-client-commands.md) | [贡献命令 UI](../how-to/how-to-client-command-ui.md) |
| 添加右侧栏页面或资源查看器 | [右侧栏导航](api-client-sidebar.md) | [贡献右侧栏 Tab](../how-to/how-to-client-sidebar-tab.md) |
| 添加左栏全局面板 | [右侧栏导航](api-client-sidebar.md) | [贡献全局面板](../how-to/how-to-client-sidebar-panel.md) |
| 在 Web 中打开 Workspace 或 Session | [右侧栏导航](api-client-sidebar.md) | [导航 Workspace 与 Session](../how-to/how-to-client-workspace-navigation.md) |
| 替换 `@file` 后端或读取 `@session` 候选 | [文件与会话引用](api-client-references.md) | [文件引用 Provider](../how-to/how-to-client-file-reference-provider.md)、[Client 引用候选](../how-to/how-to-client-reference-candidates.md) |
| 在 Host 使用 Workspace 与变更摘要 | [Workspace 数据契约](api-client-workspace-data.md) | [操作 Registry](../how-to/how-to-client-workspace-registry.md)、[消费变更摘要](../how-to/how-to-client-workspace-changes.md) |
| 显示并导航子 Agent 会话 | [子 Agent Client 词汇](api-client-subagent.md) | [导航与控制子 Agent](../how-to/how-to-client-subagent-navigation.md) |

`dsh.client.inject` 是包名依赖的展示/差异元数据，不负责 Cordis Service 激活排序。Client `inject` 中的服务名才决定 fiber 等待；`dsh.client.external` 决定同步模块表请求，不能用来取得另一个功能插件的运行时值。
