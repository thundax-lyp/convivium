# Client 配置表单与设置页面

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Host 插件声明的 Config/schema 与 Client 设置页面分开；浏览器表单通过 `@deepseek-ai/dsh-client-ui-settings/client` 的 `ctx.configForms` 读取 Host 描述和提交操作。Web 页面具体步骤见[贡献设置卡片](../how-to/how-to-client-settings-card.md)。

## `ConfigForms`

**公开导出**：`ConfigForms` 来自 `@deepseek-ai/dsh-client-ui-settings/client`。
`ctx.configForms.get<T>(entryId)` 返回 Host 插件条目的共享表单；`describe()` 返回共享镜像；`whileServed(namespaces, register)` 仅在 Host 服务相应 namespace 时保持页面注册。`whileServed` 返回注销函数，调用方用 `ctx.effect` 持有它。远端浏览器若处于 `memory` 模式，表单只显示进程局部状态且不可写 Host 文档；页面需尊重 `writable`。`get` 的 `entryId` 必须对应 Host 注册的 namespace，不凭 UI 文案推断。

## `ConfigForm<T>`

**公开导出**：`ConfigForm` 来自 `@deepseek-ai/dsh-client-ui-settings/client`。
`getSnapshot()` 返回引用稳定的当前快照，`subscribe(listener)` 返回解除订阅函数。`set(field,value)`、`unset(field)` 与 `mutate(ops,expectedRevision?)` 序列化写操作并以 namespace revision 防并发覆盖。布尔 `true` 表示 Host 接受，`false` 表示拒绝或跳过并在最新写失败时恢复读取；传输失败会 reject。需要同一提交内改多个字段时用 `mutate`，不要串行 `set` 冒充原子操作。读取表单值和写操作都不绕开 Host schema 校验。

## `ConfigFormSnapshot<T>`

**公开导出**：`ConfigFormSnapshot` 来自 `@deepseek-ai/dsh-client-ui-settings/client`。
`status` 为 `loading`、`ready` 或 `unavailable`；`value` 是已解析节值，首次接受前可为 `undefined`；`base` 为继承层，`user` 为原始用户覆盖层。判断字段是否覆盖要看 `user` 中字段是否存在，不能比较它与 `base` 是否相等。`revision` 是下一次写的 fencing 值，`writable` 标示 Host 文档是否允许写入，`mode` 是 `host` 或 `memory`。无 `ready` 状态时不要把缺值当作默认值写回。

## `SettingsSchemaService`

**公开导出**：`SettingsSchemaService` 来自 `@deepseek-ai/dsh-client-ui-settings/client`。
这是设置 schema 的 Client 服务契约。`rehydrate(serialized)` 将 Host 的 `schema.toJSON()` 恢复为可检查节点；`nodeAtPath(root,path)` 定位字段，`validate(schema,draft)` 返回失败文字或 `undefined`。`getPath`、`hasPath`、`setPath`、`deletePath` 用于按路径读取和不可变更新表单 draft。普通页面仍经 `ConfigForms` 与共享表单处理 Host 读写；不要在组件里重建一份与 Host 分叉的 schema。

## `settings.plugins.tab`

`@deepseek-ai/dsh-client-ui-settings-plugins/client` 在 `settings.section` 注册 Plugins 导航项，声明 `settings.plugins.tab` 为 root 范围 list slot。功能包只需向该 slot 注册自己的 tab 内容，提供稳定 `id`、排序 `order` 与可随语言变化的 `label`；section 负责标签页切换并在首次访问后保留已访问内容。不要为同一个 Plugins 子页再注册竞争的 Settings 导航项。证据：`packages/client/ui-settings-plugins/src/client/{index.ts,PluginsSettingsSection.tsx}`。

## `PluginConfigViewProps`

**公开导出**：`PluginConfigViewProps` 来自 `@deepseek-ai/dsh-client-ui-plugin-manager/client`。
`@deepseek-ai/dsh-client-ui-plugin-manager/client` 的 `plugins.item` 会以 `view: summary` 渲染卡片说明，以 `view: page` 渲染配置页；`form` 是 Host 配置表单的页面输入。注册包使用 `ctx.slots.inject` 等待 owner，再按自己的 namespace/条目检查写入权限。证据：`packages/client/ui-plugin-manager/src/client/slot-contract.ts`。

## `PluginDetailProps`

**公开导出**：`PluginDetailProps` 来自 `@deepseek-ai/dsh-client-ui-plugin-manager/client`。
`plugins.detail.badge`、`plugins.detail.actions`、`plugins.detail.section` 向打开的详情页提供 `subject`。贡献组件需判 `subject.kind`（bundle、row、item）再决定是否显示；不能假定每个详情都属于本包。证据：`packages/client/ui-plugin-manager/src/client/slot-contract.ts`。

## `PluginsSubject`

**公开导出**：`PluginsSubject` 来自 `@deepseek-ai/dsh-client-ui-plugin-manager/client`。
此判别联合区分 bundle、其一行 row、或 Official 列表 item。bundle 的 `pkg.name` 是包名，row 的 `rowId` 是 Profile 行身份，item 的 `id` 是 `plugins.item` 条目身份。证据：`packages/client/ui-plugin-manager/src/client/slot-contract.ts`。

## `pluginNavigation`

`ui-plugin-manager/client` 在 Context 安装 `ctx.pluginNavigation.openBundle(packageName)`，可在不切换当前 Session 的前提下打开指定 bundle 详情；包不存在时回退 Plugins 列表。调用前须保证 owner 已装载，不能把导航当作安装或启用操作。证据：`packages/client/ui-plugin-manager/src/client/index.ts`。
