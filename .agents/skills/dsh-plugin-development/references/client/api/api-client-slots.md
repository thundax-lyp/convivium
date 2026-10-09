# Client slot 与共享界面

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。以下类型从 `@deepseek-ai/dsh-client-ui-slots` 的 `.` 导出；运行时 `ctx.slots` 来自 `@deepseek-ai/dsh-client-ui-renderer/client`。用法见[贡献 Web slot](../how-to/how-to-client-slot-contribution.md)。

## `SlotMap`

`SlotMap` 是由 slot owner 做 declaration merging 的表。父 entry 在注册时通过 `children` 声明子 slot，且其组件必须真正调用 `renderSlot` 或 `renderSlotChain`。声明即认领：同名子 slot 只能有一个声明 owner，未声明的 slot 不可直接注册。

## `SlotEntryDef`

每项 `SlotEntryDef` 指定 `kind` 与 `scope`，可附 `owner`、`keyProps`、`hookContext` 和 slot 级 `inject`。`owner` 是父组件在渲染时传入的数据，不是贡献方自己创建的全局 Context。

## `SlotKind`

**公开导出**：`SlotKind` 来自 `@deepseek-ai/dsh-client-ui-slots`。
`single` 占一个位置；`list` 需要稳定 `id`，可给 `order` 与 `label`；`keyed` 需要 `key`；`chain` 需要 `select(owner)` 返回匹配值或 `null`，并以升序 `priority` 试选。`single`、`keyed` 和 `list` 的同一 cell 同优先级重复注册会抛错；不同优先级可 shadow，最低值显示。

## `SlotScope`

**公开导出**：`SlotScope` 来自 `@deepseek-ai/dsh-client-ui-slots`。
`root` 不依赖当前 Session；`session-maybe` 可在没有选中 Session 时渲染；`session` 要求选中 Session。不要把一个 scope 的共享 store handle 挂到另一个 scope；核心注册表会在加载时拒绝。

## `SlotCore`

`SlotCore.register(options, component)` 返回幂等 disposer；移除 entry 会递归撤销它声明的子 slot 和贡献。插件通常通过 renderer 的 `ctx.slots.register` 调用同一注册语义。向别的包拥有的 slot 贡献时，用 `ctx.slots.inject(name, () => ctx.slots.register(...))`：它等待真实声明，声明移除时撤销贡献，并在再次声明后重新注册。单靠某个业务 service 的 `inject` 不能保证 slot 已声明。

`registerFactory` 在同一个核心表中安装可复用装配，返回其 definition 的 disposer；已有同名 definition 时失败。普通跨包 UI 贡献仍优先 `register` 到父级 slot。

在 `apply` 中注册，不在模块顶层产生副作用。需要存活期间的其他订阅、样式或词典，用 `ctx.effect` 绑定 disposer；关闭 Loader 行后检查贡献、订阅和 DOM 样式均退出。

## `SlotRegistry`

`@deepseek-ai/dsh-client-ui-renderer/client` 导出的 `SlotRegistry` 是实际安装到 `ctx.slots` 的 Service。插件使用它的 `inject` 等待声明、`register` 贡献 Component；Shell 在装载 Web UI 时安装 renderer。正常业务插件不自行构造第二个注册表，否则与页面拥有的 slot 树不相通。

## `ComposedProps`

组件 props 由 owner 运行时数据、子 slot 渲染、factory 渲染、store 与 `inject` 五类 share 派生；`PropsRuntime`、`PropsRenderSlots`、`PropsRenderFactories`、`PropsStore` 和 `ComposedProps` 是公开类型，不要手写一个近似 `ctx` 给组件。组合类型可携带 `renderSlot` 与 `renderFactorySlot`；具体可用键由声明的 children 和 Factory 限定。可变化的外部数据经框架钩子读取；共享交互状态用注册时声明的 store，由 `props.useStore` 读、`props.actions` 写。组件私有状态留在 React 本地。`SlotFactoryMap` 与 `registerFactory` 只用于一套可复用装配在不同父级下有独立 render occurrence 的场景。

## `PropsRuntime`

**公开导出**：`PropsRuntime` 来自 `@deepseek-ai/dsh-client-ui-slots`。
这是 slot owner 数据与 scope 标准席位的类型 share。组件依据具体 slot key 推导它，不能把父级的 `ctx` 当作 props 传入。

## `PropsRenderSlots`

**公开导出**：`PropsRenderSlots` 来自 `@deepseek-ai/dsh-client-ui-slots`。
这是组件获授权渲染的 `children` 类型 share，其 `renderSlot` 只能指向自身注册项中声明的子 slot。

## `PropsRenderFactories`

**公开导出**：`PropsRenderFactories` 来自 `@deepseek-ai/dsh-client-ui-slots`。
这是可复用 Factory occurrence 的 `renderFactorySlot` 渲染 share，只有需要在不同父级选择独立装配时才使用。

## `PropsStore`

**公开导出**：`PropsStore` 来自 `@deepseek-ai/dsh-client-ui-slots`。
注册时声明 store 后，组件用 `useStore` 读取、`actions` 写入；不要自行在组件中订阅同一外部源。

## `SlotFactoryMap`

**公开导出**：`SlotFactoryMap` 来自 `@deepseek-ai/dsh-client-ui-slots`。
由 Factory owner 做 declaration merging，定义 scope、children、store、inject、locale 与局部 slots。它与普通 `SlotMap` 分开，不能把 Factory 局部组件当作全局 slot 名。

## `RegisterFactory`

**公开导出**：`RegisterFactory` 来自 `@deepseek-ai/dsh-client-ui-slots`。
`registerFactory(options, component)` 返回幂等 disposer，重复定义同名 Factory 会失败。Factory 的子 slot 仍受 `SlotMap` 全局声明权约束；局部 slots 按 occurrence 选 Component。

## 共享控件与样式

跨包复用控件先查 `@deepseek-ai/dsh-client-ui-primitives`；功能包之间只共享 type、service 与 slot，不运行时 import 对方组件。样式使用 CSS Modules 与 `ui-theme` 的 `--dsw-*` 语义 token，产品可见文案由类型化 locale 字典提供。运行时的 Client bundle 必须包含或请求这些样式与依赖；仅 TS 类型通过不能证明页面显示。
