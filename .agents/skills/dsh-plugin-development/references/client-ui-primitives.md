# DSH UI Primitives

本文提供 `dsh-v0.1.2-rc.1` 的共享 React 呈现能力与选型边界。标准控件或输出呈现任务先读定位、能力选择和所用组件契约，最后按变更面验证；只有涉及 slot、store 或插件生命周期时才补读 [Client UI](client-ui.md)。

发行包的 `lib/types/index.d.ts` 及其引用的声明保留公开类型和部分 JSDoc，具体参数从那里按需读取。本参考补充选型、宿主组合、调用方职责和由实现与测试确认的限制，不复制完整 Props 清单，也不要求普通下游任务拥有 DSH 源码 checkout。发行包未包含 `src/`，不能因 manifest 声明了 `./src/*` 就假定源文件可用。维护时才按 [source-map](../maintenance/source-map.md) 回查固定 tag；发现版本不匹配时先核对差异，不沿用本页结论。

## 定位与装配

`@deepseek-ai/dsh-client-ui-primitives` 是 DSH Web 的静态共享库，公开根入口允许命名导入，如 `import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'`。它不依赖 Cordis API 或 slot system，不注册 Service、事件或模型能力。Feature 插件之间不得 value-import 内部组件的规则不排除这类共享库；也不能据此放宽其他 feature 的边界。

DSH Web 的平台模块表和 seed 提供 primitives、React、React JSX runtime 与 React DOM 的共享值。使用该版本标准 Client build preset 时，baseline external 自动生效，不重复添加 `dsh.client.external`，不为 primitives 新增 Cordis `inject`。Browser 依赖声明和编译面遵循[包规范](package-authoring.md)。独立插件自定义构建时核对对应 external 与最终产物，避免打入另一份 React；本地依赖能解析不等于宿主组合已验证。

组件通过 `--dsw-*` token 和随包发布的 CSS 呈现。消费包根入口，不依赖 checkout 源路径或内部文件；本资料不承诺其他版本兼容，也不保证脱离 DSH Web 主题后的外观。

## 按能力选择

这是公开入口的选型导航，不是产品采用清单。参数以该版本实际公开类型为准；根入口没有导出的 Props 名称不能按组件名自行推断。

| 需要的呈现 | 公开能力 | 选择边界 |
| --- | --- | --- |
| 按钮、单行输入、标签和状态 | `Button`、`Input`、`Pill`、`StateDot` | 不提供通用表单状态或互斥选择模型，见下方精确契约 |
| 折叠、菜单、说明和预览 | `DisclosureRow`、`Menu`、`Tooltip`、`HoverCard` | 调用方提供内容、选择或开关状态及回调；选用时核对锚点、portal 和关闭行为 |
| 弹窗、短暂提示和引导 | `Modal`、`Toast`、`RiskConfirmation`、`OnboardingSurface` | 确认不等于 Host 授权；首次引导覆盖层会使应用根 inert，不当作普通面板容器 |
| 连接反馈 | `ConnectionIndicator` | owner 提供连接状态、可见性、恢复展示期限、文案与立即重连回调，组件不拥有重连策略 |
| 模型 Markdown 与用户文字 | `MarkdownText`、`MessageText`、`projectUserText` | `MessageText` 逐字呈现；`projectUserText` 将引用投影为 inline chips，不能代替日志原文 |
| 代码与 JSON | `CodeBlock`、`JsonBlock`、`JsonTree` | 只读呈现，不是编辑器或持久数据模型 |
| 工具输出 | `TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock`、`WebBlock` | 匹配工具结果 intent；`TerminalBlock` 不是交互终端或完整终端模拟器 |
| 图标与标识 | 根入口导出的 icons、`ReferenceIcon`、`FishLogo`、`BrandWordmark` | 品牌标识是否采用由产品决定，不由依赖关系决定 |
| 定位、关闭与转换 | `useAnchoredPosition`、`useAnchoredMaxHeight`、`useDismissOnOutsidePointer`、`writeClipboard`、`relativeTime`、`extractMarkdownPlainText`、`diffTotals` | 仅在相应交互或转换需要时使用，不承载业务订阅或事实源 |

`MarkdownText` 面向不可信 GFM/TeX 输出。原始 HTML 节点按文字呈现，不作为 HTML 执行；链接只允许绝对 HTTP(S) 与 mailto，图片仅允许绝对 HTTP(S)，不支持的图片显示 alt 文字。Web 检索卡片的链接只允许 HTTP(S)，不能把两者的 allowlist 混为一谈。

流式阶段 TeX 保持文字，跨块引用可能等到最终完整解析才解析；`fileMentions` 仅在 settled 阶段生效。`labels` 对象应按 locale revision 保持引用稳定，否则会重建流式缓存。长代码围栏仍保留完整 token DOM，不具有自动虚拟化承诺。采用输出 renderer 时保留其 typed labels、数据形状与安全处理。

工具数据截断和 UI 折叠是两层状态。`ReadBlock` 保留调用方提供的文件行号与 `totalLines`；`SearchBlock` 区分 `matches`/`paths`，并接收 `total` 与 `truncated`。展开只展示已经传入的内容，不获取缺失数据。`WebBlock` 的 `fetch` 形态展示 URL、状态码与截断信息，不展示完整抓取正文；本版本没有 `DEFAULT_WEB_MAX_LINES`。`DiffBlock` 接收 old/new 文本片段，`diffTotals` 统计片段两侧全部行，不计算最小差异，不能传整文件后当作 Git diff 统计。

`projectUserText(text, sessionLabels)` 装饰已发送文字中的 Session wire form、关联 Session labels 和形如 `/name`、`@name` 的 token；它不验证引用有效性或发起导航。显示投影不回写模型日志。

## 控件与浮层的精确契约

### Button 与 Input

- `Button` 默认 `type="button"`，原生属性透传允许覆盖；提交按钮显式传 `type="submit"`。调用方保留事件、ARIA 和 disabled 条件，组件不计算业务是否允许写入。
- 本版本 `Button` 没有 active 或 ButtonGroup API，也没有 React 18 `forwardRef` 接口。需要单选、焦点移动时，由调用方实现符合需求的选择与键盘语义，不把样式 variant 当作互斥状态。
- `Input` 用于单行文本，结构为外层 span、可选 icon 和原生 input。`className` 作用于外层，其余原生属性传给 input；布局与 DOM 查询要考虑这一层包装。它不替代 textarea、select 或 checkbox 的交互模型。

### Pill 与 StateDot

`Pill` 有 `onClick` 才渲染 button 并透传其余原生属性；静态 span 分支只呈现 className 与 children。`active` 只是视觉状态，不自动提供 `aria-checked`、单选组或键盘导航。需要 disabled 呈现时检查实际样式，不把原生属性可传入等同于完整视觉反馈。

`StateDot` 仅支持 `done | warning | ongoing | error`，没有 active 状态；自身 `aria-hidden`，须搭配可访问文字。业务状态与视觉状态的映射由调用方明确，不能凭名称推断业务完成或失败。

### Toast、Modal 与风险确认

`Toast` 通过 body portal 呈现，默认保持 3000ms，再淡出 1000ms，然后调用 `onDone`；owner 负责卸载。重复显示相同文案时用每次展示的身份重新挂载，保持 `onDone` 稳定以免无意重置计时。`holdMs` 由 owner 按内容决定；必须持续可见的错误不能仅依赖定时消失的 Toast。

`Modal` 的 `open` 由调用方控制，Escape 或遮罩点击调用 `onClose`；它提供 dialog 语义与可选 headless 外观，但本版本没有焦点锁定或关闭后焦点恢复。不能将组件名或 `aria-modal` 视为完整无障碍保证。

`RiskConfirmation` 使用受控 `acknowledged` checkbox 门控确认按钮。它是界面确认，不产生权限事实，也不替代后端准入；提交中禁止操作等业务条件仍由 owner 提供。

### Menu、Tooltip 与 HoverCard

`Menu` 的 `open`、选中 id 与关闭决策由 owner 控制。叶子点击只调用 `onSelect(id)`，不会自动调用 `onClose`；`selectedId`/`selectedIds` 只显示勾选，不产生单选或多选行为。当前实现有 Escape 和外部 pointerdown 关闭、子菜单 hover/focus 打开，但没有方向键漫游焦点或 typeahead；不能直接替代原生 select 的完整交互。

`Menu` 默认在原位布局；受 overflow 裁剪时可使用 `portal`，此时跟踪 scroll/resize，必要时通过 `getAnchorRect` 提供真实锚点。源码虽将 `MenuItem.submenu` 定义为递归类型，渲染仅展开一级子项；不据类型推导任意层级菜单支持。主 items 存在子菜单时会取消列表高度上限，需要检查长菜单布局。

`Tooltip` clone 单一 child 并合并其 ref 与事件处理器，锚点必须支持 HTMLElement ref。本版本不能直接用不支持 `forwardRef` 的 `Button` 作为锚点；选择能接收 ref 的 DOM 锚点并检查实际 hover/focus 行为。它使用原位 fixed bubble，未通过 portal 挂到 body，也未自动建立 `aria-describedby`。`delayMs` 只延迟 hover，focus 立即显示；mouseleave 即使仍有焦点也立即隐藏。

`HoverCard` 默认 pointer 停留 500ms 后打开，通过 body portal 呈现；anchor 与卡片间有离开宽限。`copyText` 使已打开的卡片支持点击、Enter/Space 复制，但组件没有 focus 打开路径，不能据此宣称键盘可独立打开预览。`copyLabel`、`copiedLabel` 必须由调用方提供，复制成功才显示反馈。

### 辅助函数

`writeClipboard` 返回是否接受写入，只有 true 才展示成功反馈。存在 async Clipboard API 但写入被拒绝时返回 false；仅在 API 缺失时尝试 `execCommand('copy')`。`relativeTime(at, now)` 使用 epoch ms，返回 `{ unit, n }` 而非本地化字符串或自动更新定时器，调用方负责时间刷新与文案。

`useDismissOnOutsidePointer` 可另传 portal ref 将浮层计入内部，且只处理 pointerdown，不处理 Escape。`useAnchoredPosition` 返回坐标而不创建 portal 或设置 fixed 样式，并跟踪打开期间的滚动、窗口变化与可用的 panel ResizeObserver；`useAnchoredMaxHeight` 面向底边锚定、向上生长的浮层，不是通用四向定位器。

## 调用方职责与验证

Feature 持有 locale、业务数据与交互状态。需要 labels 的组件由调用方从 typed `t` seat 提供完整本地化文案；primitives 无 locale Service，也不提供语言 fallback。不要把模型或用户原文翻译成 UI 字典。数据订阅与事实归属沿用 [Client UI](client-ui.md#数据与呈现所有权)。

采用组件时按实际路径验证：

1. 类型检查和 Client 构建覆盖公开导入、labels 与产物共享模块；保留业务可观察断言，例如点击选择是否意外提交、disabled 是否阻止写入、提交按钮是否仍提交表单。
2. 若测试导入报 `Unknown file extension .css`，先检查 runner 是否把 primitives 外部化后交给 Node 直接加载。让相关包经过 runner 的 CSS/模块转换；Vitest 环境可核对当前版本的 Client project `server.deps.inline`。这是诊断方向，不是所有插件必须复制的配置；不以空组件 mock 或屏蔽错误替代真实集成验证。
3. 在真实 DSH Web 组合检查 CSS、主题、窄布局、键盘与焦点；使用浮层时增加 portal、关闭及焦点恢复检查。Node 导入成功或 jsdom 通过不能证明这些浏览器行为。

本参考的源码核对不代表消费项目已经集成或通过无障碍验收。具体证据范围见[测试与文档交付](testing-docs.md)。
