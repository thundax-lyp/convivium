# 向 Web 页面贡献 slot

## 在已有页面的 slot 显示插件内容

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载目标页面的 slot owner、`ui-renderer`、locale 和你的 Client 包。先读[Slot 与组件契约](../api/api-client-slots.md)和[模块装载契约](../api/api-client-modules.md)。

### 实现步骤

1. 在目标页面 owner 的公开 `SlotMap` 声明中确认 slot 名、`kind`、`scope`、owner props、允许的 `id` 或 `key`。对于 list 指定稳定 `id`；chain 指定 `select`；不能猜测未声明的 slot 名。
2. 在 `./client` 的 `apply(ctx)` 中，通过 `ctx.slots.inject(name, () => ctx.slots.register(options, Component))` 贡献组件。`inject` 等父级真实声明出现并在其撤销后自动移除贡献；不要用 service 是否存在代替 slot 声明。词典、远端订阅与私有状态分别由 `ctx.effect`、store 或组件局部状态管理。完整文件位置和实现检查见[Client slot 示例](../examples/example-client-slot-contribution.md)。
3. Component 只接收声明推导的 props；可变化的外部值经标准 hook 或声明的 store 读取，写操作经 action 或 injected callback。跨包展示通过 slot，不运行时导入另一功能插件的组件。复用共享控件并用 CSS Modules 与主题语义 token；所有可见文案从 locale 取得。
4. 构建两侧后在真实 Web Profile 打开拥有该 slot 的页面，确认条目出现在正确位置。停用贡献包确认条目消失；停用再启用父页面确认 `slots.inject` 重新贡献；对运行时失败检查同 cell 冲突和未声明 slot 错误。

### 验证与完成边界

Host 与 Client 类型检查分开运行；在目标 checkout 运行相关 slot/component spec 与 Web smoke。成功判据是页面可见、交互可用且清理后无残留；只验证 `SlotCore.register` 的单元测试不能代替 Web 组合。外部插件若未建立兼容 lazy-CJS 构建链，先在目标 workspace 内验证，不能直接声称独立发布可用。
