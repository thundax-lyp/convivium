# 复用共享控件并扩展主题

## 让 Web 扩展遵守主题与多语言样式

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Web Profile 已安装 theme、locale 和 renderer。先读[共享控件与主题](../api/api-client-shared-ui.md)与[slot 契约](../api/api-client-slots.md)。

### 实现步骤

1. 先从 `@deepseek-ai/dsh-client-ui-primitives` 选公开控件：按钮用 `Button`，状态短标签用 `Tag`，菜单或自定义 listbox 用 `Menu`/`MenuSurface`。组件通过 props 接收数据和动作；功能包之间不运行时导入对方组件。
2. CSS 放在本包的 CSS Modules，颜色、边框与层级选 `--dsw-*` 语义 alias；不写固定亮色/暗色值。可见文案、可访问名称和提示由类型化 locale 字典提供。构建产物必须包含 CSS，不能只验证 TSX 声明。
3. 若需注册可选主题，在 Client `apply` 取得 `ctx.theme`，用 `register({ id, colorScheme, tokens })` 并把 disposer 放进 `ctx.effect`。临时品牌覆盖用 `overrideTokens(packageId, { '--dsw-alias-…': { light, dark } })`，同样随 fiber 清理；重复 ID 和缺少两种模式值都应报错。不要擅自调用 `setTheme` 覆盖用户偏好。
4. 在真实 Web Profile 切换 light、dark、system，验证控件颜色对比、焦点、hover 和弹层；停用插件确认主题或覆盖层撤销。语言切换后确认文案更新而不靠重注册 slot。

### 验证与完成边界

目标 checkout 的样式和 UI 门禁包括 Client 类型、CSS 构建、UI i18n 与 Web smoke；独立消费包需另证等价 CSS 注入产物。源码引用 token 与组件存在不代表页面已渲染，成功判据仍以浏览器观察和卸载恢复为准。
