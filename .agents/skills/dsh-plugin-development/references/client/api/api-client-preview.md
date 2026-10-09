# 右侧栏文档预览扩展

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client` 公开预览定义和 slot 类型；右侧栏负责 tab，文档 owner 负责内容交付，扩展包负责具体 renderer。操作见[注册文档预览](../how-to/how-to-client-document-preview.md)。

## `DocumentPreviewDefinition`

**公开导出**：`DocumentPreviewDefinition` 来自 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client`。
`id` 是唯一实现名，亦是 keyed `sidebar.right.tab.document` slot 的 `key`。`extensions` 填不带点的文件后缀，可含 `tar.gz` 这类复合后缀；`binaryExtensions` 必须是其中的子集，否则注册报错并阻断普通文本 fallback。`priority` 为 `builtin` 或 `extension`，扩展层优先于内置层，省略为 extension；同层按后缀长度和注册顺序选择。`title()` 在 toolbar 渲染时求值，可读取 locale。`loading` 选 `text-pages`、`bytes-complete` 或 `renderer`，`wrap` 表示是否消费共享折行设置。

## `DocumentLoadMode`

**公开导出**：`DocumentLoadMode` 来自 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client`。
`text-pages` 使用 owner 已读文本页，`bytes-complete` 使用完整 transient 字节，`renderer` 让 renderer 自行加载并通过 revision 回报成功/失败。选择模式须与组件读取的 `DocumentContent` 分支一致；不能把 `Uint8Array` 留进 Session 或 layout 持久状态。

## `DocumentPreviewProps`

**公开导出**：`DocumentPreviewProps` 来自 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client`。
文档正文的组件 props 是 `PropsRuntime<'sidebar.right.tab.document'>`，由 owner 提供 `resourceAddress`、`content`、`wrap`、`addResource`、`setResources` 与 `scrollportRef`。组件按 content 判别分支渲染；如果自己打开附加资源，须向 owner 申报地址并在卸载时释放。文档标题和动作可另注册相应 slot，不能直接修改右侧栏内部 store。

## `DocumentContent`

**公开导出**：`DocumentContent` 来自 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client`。
文本分支含 `text`、增量 `pages`、`eof`；字节分支给 `Uint8Array`；renderer 分支给 `revision` 与 `loaded(version)`、`failed()`、`reload()`。只有当前 revision 的结果可上报，取消后结果不得写回新 renderer。字节只借用读取，在 Worker 转移前须复制；不要持久化字节或 Blob URL。
