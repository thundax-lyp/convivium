# 运行时配置与设置表单

## SettingsForms

**公开导出**：`SettingsForms` 来自 `@deepseek-ai/dsh-settings`。
`@deepseek-ai/dsh-settings` 在 Host 挂载 `ctx.settings`。它只为已激活、profile 行 id 唯一、Config schema 声明为 `.volatile()` 的字段生成表单描述。普通 Config 字段仍走 Loader 更新/重载。`SettingsDescriptor` 包含 namespace、schema、当前值、`revision`、继承/用户值及 `applies: 'live'`；秘密字段在面向 Client 的描述中被遮蔽。

编辑必须携带读取时的 `expectedRevision`。若同一 namespace 已变化，`SettingsConflictError.code === 'SETTINGS_CONFLICT'`，写入被拒绝，客户端应重新读取。路径操作 `SettingsPathOp` 为 `{ op: 'set', path, value }` 或 `{ op: 'unset', path }`；局部表单不能用遮蔽后的完整对象覆盖配置，否则会抹掉未返回的 secret 字段。`Config` 完整校验在持久化前执行。

Host 服务成员中，`describe(options?)` 返回 `SettingsDescriptor[]`；`mutate(ns, ops, expectedRevision?)` 接收路径操作数组；`update(ns, patch, expectedRevision?)` 和 `replace(ns, section, expectedRevision?)` 处理对象级变更。跨 Client 边界必须使用带 revision 的路径级 `mutate`，因为 Client 看到的 secret 字段不完整。`configure({ auto?: boolean }, owner?)` 返回 disposer，可在插件自身 effect 中关闭自动页面策略，但不关闭配置读写。

`documentPath: string` 指向当前 profile patch 文件；`prepareDocument(): Promise<string>` 返回该路径供编辑器准备文档；`writable: boolean` 在目标实现中恒为 `true`，只表示此 Host 表单服务宣称可写，不保证磁盘权限或一次修改成功。调用方仍须处理写入、校验与 revision 冲突。

业务插件应在实际操作开始时 `config.field.get()`；一次操作需一致值时取一次快照。`loader/volatile-update` 通知字段路径，但普通 `emit` 不等待插件自己的资源重配。默认启用自动表单描述，并不代表随附 Client 已自动渲染任意插件页面；要给用户可见界面，另遵守 Client UI 页面/slot 契约。

## SettingsDescriptor

`SettingsDescriptor` 是 `describe()` 的单个 namespace 视图，包含 `ns`、`schema`、`value`、`revision`、`base?`、`user?`、`secrets?`、`autoGenerate` 与 `applies: 'live'`。远端读者只能依赖脱敏后的值与 revision；不能从 `secrets` 存在性推断秘密明文。

## SettingsPathOp

**公开导出**：`SettingsPathOp` 来自 `@deepseek-ai/dsh-settings`。
两个分支由 `op` 判别：`set` 要求 `path` 与 `value`，`unset` 只要求 `path`。路径是字段名数组；数组索引必须在可编辑范围内。使用它保持未读到的 secret 字段不变。

## SettingsConflictError

**公开导出**：`SettingsConflictError` 来自 `@deepseek-ai/dsh-settings`。
当写入携带的 revision 过期，错误的 `code` 为 `SETTINGS_CONFLICT`，`expected` 与 `actual` 可用于提示并重新拉取。不要自动用旧表单值重试写入。

## ConfigEditor

**公开导出**：`ConfigEditor` 来自 `@deepseek-ai/dsh-config-editor`。
`@deepseek-ai/dsh-config-editor` 的 `ctx.configEditor` 拥有 profile patch 的持久写入与 Loader reconcile。`documentPath` 指向当前 profile patch；`entries()` 只返回 id 唯一的可编辑 profile 行，嵌套 Include 有独立所有权。Settings 借它保存字段；写入后检查磁盘 patch、运行中引用及重启恢复。home/命令覆盖层优先于 profile，若会掩盖表单写入则应拒绝。

`configuration(): { entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }[]` 为当前可寻址行返回 Loader 入口、继承值及 profile 显式覆盖值。返回的层值已脱离原对象；读取会重新解析 profile，坏 patch 可使它失败。它服务于确定写入差异，不能把 `override` 当作已合成的有效配置，也不能绕过 revision 与完整 Config 校验。

对象证据：`packages/settings/settings/src/index.ts`、`packages/boot/config-editor/src/index.ts`、`docs/cookbook/adding-a-settings-card.zh.md`、`packages/settings/settings/tests/`。完整任务见[实时配置 HOW-TO](../how-to/how-to-infra-live-config.md#让插件配置在运行中安全更新)。Client 页面注册及 `ConfigForm.mutate` 的权威契约归 Client UI 主题。
