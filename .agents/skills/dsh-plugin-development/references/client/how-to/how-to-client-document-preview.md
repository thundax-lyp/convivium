# 为右侧栏添加文档预览格式

## 给文件后缀注册独立的预览 renderer

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载右侧栏、文档预览 owner、renderer、locale 和本包。先读[文档预览契约](../api/api-client-preview.md)、[slot 契约](../api/api-client-slots.md)与[资源服务](../api/api-client-services.md)。

### 实现步骤

1. 给实现选稳定 `id`、可识别后缀、真实 `loading` 模式与本地化 `title()`；二进制格式同时写入 `binaryExtensions`，但只允许 `extensions` 中已有后缀。若希望优先内置实现，显式选 `priority: 'extension'`；撤销本包后内置候选应恢复。
2. 在 Client `apply` 用 `ctx.effect(() => ctx.documentPreviews.register(definition))` 登记元数据，同时通过 `ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({ name: 'sidebar.right.tab.document', key: definition.id }, Component))` 登记相同 ID 的正文。两个注册必须随同一插件 fiber 清理；只有元数据或只有 slot 均不能完整显示预览。
3. Component 以 `DocumentPreviewProps` 按 `content.kind` 收窄。文本/字节模式消费 owner 输入；renderer 模式负责取消旧 revision 的读取，完成后调用 `loaded(version)`，失败调用 `failed()`，重试用 `reload()`。资源地址用 `addResource`/`setResources` 申报；临时 bytes、Worker 和 Blob URL 在内容替换、关闭 tab、卸载时释放。
4. 在真实 Web Profile 打开匹配文件、无关文件和与内置 renderer 同后缀文件，核查优先级和选择菜单。停用扩展包确认回退到内置 renderer；重连与文件修改后确认旧 revision 不回写。

### 验证与完成边界

Client 类型与 registry 行为测试至少覆盖重复 ID、非法二进制后缀、复合后缀排序和 disposer；浏览器 smoke 覆盖加载、失败、重试、切换文件和卸载。仅能列出预览标题而不能完成内容渲染，不算完成。
