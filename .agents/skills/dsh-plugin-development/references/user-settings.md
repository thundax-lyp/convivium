# 用户设置

本 reference 用于实现 rc.2 的用户可编辑插件设置及其 Browser 卡片。

## Config、Settings 与 Credential

`cordis.yml` Config 是部署组合层，保存启动时选择的 Provider、route 与 tunable。`ctx.settings` 保存用户文档中一个 plugin-owned namespace 的可编辑子集。Credential seam 保存或解析 secret value；Settings 最多保存 credential reference 或由 schema 标记且在 wire 上完全 redacted 的 secret field。不要让三者互相代替。

Resolved Settings 的层级固定为 schema defaults、composition `base`、user section。`applies: 'live'` 的 owner watch committed value；`restart` 只声明下一次启动生效，不能一边标记 restart 一边暗中热应用。

## Host namespace

用 `settingsNamespace()` 定义稳定的 lowercase kebab-case identity，并让 Host 与 Browser 使用完全相同的 namespace 值。Browser 可以重复该字符串拼写；不要为了共享常量而跨插件 value-import Host 模块。已有 cordis entry 的 Consumer 使用 `installSettingsSection()`，把 entry config 作为 base，同时在没有 Settings Provider 的组合中仍使用 composition value。Schema 表达字段规则；跨字段或外部可达性等 schema 不能表达的约束放进 registration `validate`，使无效写入在 commit 前失败。

Owner 通过 scope 的 `get()` 读取 deep-frozen resolved snapshot，通过 `watch()` 观察按 commit 顺序串行且异常隔离的变化。`update()` 只合并 user layer；`replace()` 是 wholesale user section，缺失字段重新继承 base/default。不要原地修改 snapshot。

所有 wire descriptor 必须 `redactSecrets: true`。Redacted caller 不能用其不完整文档执行 wholesale replace；使用带 expected revision 的 path set/unset 或 mutate，避免删除未曾读到的 secret，并拒绝覆盖已前进的 revision。

## Browser 设置卡片

设置卡片是同一 package 的 browser half：Host 注册 namespace，`src/client/` 向 `settings.plugin.item` 注册同名 key。卡片通过 `ctx.settingsScope.bind({ namespace })` 读写 resolved/base/user snapshot，并用 revision fencing 提交；它拥有自己的 controls、copy 与 staging。

Package 导出 built `./client`，声明 `dsh.client.platform: web`，并把设置 slot owner 放进 `dsh.client.inject`。Browser plugin 之间只使用 type-only declaration import；跨插件运行时协作走 Cordis service，不能 value-import 另一插件的 card/controller。该包被 composition mount 后由 Client module system 发现，无需修改静态 Web app。

## 必需证据

Host 测试 defaults/base/user precedence、无效写拒绝、live watch 顺序、restart 不热应用、secret redaction、stale revision 与 dispose。Browser 测试 namespace 配对、slot lifecycle、set/unset 继承语义和缺失 Host namespace 时不渲染；真实产品路径再覆盖 Client bundle discovery 与 GUI interaction。
