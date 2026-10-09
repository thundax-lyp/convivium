# 为 Host 配置贡献设置卡片

## Host 服务命名空间时显示可编辑 Web 卡片

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Host 插件已声明 Config/schema，设置服务能 expose 对应 namespace；Web Profile 已装载 `ui-settings`、Plugins 页面、renderer 与 locale。先读[ConfigForm 契约](../api/api-client-settings.md)、[slot 契约](../api/api-client-slots.md)及[模块装载](../api/api-client-modules.md)。

### 实现步骤

1. 在 Client 包的 `./client` 中以 type-only import 纳入 Settings、Plugin Manager 和 renderer 的 Context/SlotMap 声明。`inject` 列出实际使用的 `configForms`、`slots`、`locale` 等服务。组件只接收推导的 slot owner props 与注入的表单回调，不持有 `ctx`。
2. 通过 `ctx.configForms.get<T>(namespace)` 获取共享表单，在模型/控制器里订阅 `getSnapshot()` 变化并向组件提供框架可绑定的 observable。只在 `status: 'ready'` 时展示已接受的值，按 `writable` 禁用写控件。使用 `mutate(ops, expectedRevision)` 提交同一操作的多字段变动，拒绝后重新读取；凭据等 secret 用独立凭据域处理，不能当普通表单字段回传。
3. 用 `ctx.configForms.whileServed([namespace], () => ctx.slots.inject('plugins.item', () => ctx.slots.register(...)))` 将卡片限于 Host 真正服务该 namespace 的期间，整个 watch 由 `ctx.effect` 释放。自有配置页面可用 `plugins.item`；向他人页面补动作、badge 或 section 时选相应 `plugins.detail.*` slot，依据 `subject` 对无关页面返回 `null`。
4. 构建 Client half 并把根包行加入 Web Profile。打开 Plugins 页面，在 Host namespace 存在时观察卡片和保存；停用 Host owner 后卡片消失；在 remote/memory 模式检查不可写。提交无效值确认 Host 文档与 UI 已接受快照未改变，重启后确认持久值恢复。

### 验证与完成边界

分别验证 Host schema 与 Client 类型；对 `ConfigForm` 的拒绝、并发 revision 和断线恢复做行为测试，再做真实页面 smoke。仅注册 `plugins.item` 但未使用 `whileServed` 会让无 Host owner 的部署显示失效页面，不算完成。
