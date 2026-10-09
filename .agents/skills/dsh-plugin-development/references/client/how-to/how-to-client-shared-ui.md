# 查找并复用公开 Web UI 控件

## 为 Web 扩展选择现成控件

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。在写新的 React 控件前，先按[共享控件契约](../api/api-client-shared-ui.md)选型，再核对目标版本 `@deepseek-ai/dsh-client-ui-primitives` 包根入口的导出与类型。该包提供与 Cordis 无关的 React 控件；它不会注册 slot，也不会替插件装载 Client 模块。可见扩展的挂载步骤见[slot 任务](how-to-client-slot-contribution.md)，独立包的构建与 Profile 装载见[Web 包任务](how-to-client-web-package.md)。

### 选择与接入

1. 按交互语义选控件：操作用 `Button`，只读短标签用 `Tag`，可选 chip 用 `Pill`；布尔值用 `Switch` 或 `Checkbox`；互斥面板用 `SegmentedControl`；单行输入用 `Input`；菜单用 `Menu` 或 `MenuSurface`，提示用 `Tooltip`。具体 props、状态归属和焦点行为见[控件契约](../api/api-client-shared-ui.md#控件选型)。
2. 在消费包显式声明 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 及 React 构建依赖，从包根入口导入所选符号。只在 Client React 渲染侧使用控件；状态、文案、动作和异步写入仍由本插件持有。普通列表直接用语义化的 `<ul>`／`<li>` 或本包的局部视图；目标版本的公开入口没有 `List`／`ListItem`，不得从包内部路径或其他功能插件猜测它们可用。
3. 通过本包 CSS Modules 与 `--dsw-*` 语义 token 编排布局和颜色。把用户可见文案、`label`、`title` 与可访问名称接到插件的 locale；写入期间禁用相应动作。`Menu`、`Tooltip` 等浮层由所属组件和插件状态共同控制；关闭、取消或卸载时恢复焦点并清理插件注册。
4. 在目标 Web Profile 中装载 Client 包，实际操作键盘、焦点、禁用态、light／dark 模式与语言切换。停止插件后确认其 slot 和临时状态消失。只有包导出和类型检查通过，不能证明页面已经出现或交互正确。

### 导出边界与失败处理

若名称在内部页面或源码中出现，但不在 `packages/client/ui-primitives/src/index.ts` 的包根公开导出中，不能当成依赖契约。该版本的 `List`、`ListItem` 属于此类缺口；需要列表外观时用本插件自己的语义结构和样式，若多个包需要同一新原语，再向共享包提出公开导出。若组件导入或 CSS 构建失败，先核对安装版本、包根导出、React 依赖与构建器 CSS 处理，再进行浏览器验证。
