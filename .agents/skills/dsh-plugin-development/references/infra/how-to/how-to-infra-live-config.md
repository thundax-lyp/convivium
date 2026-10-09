# 插件实时配置

## 让插件配置在运行中安全更新

让 Host 插件的一部分 Config 在 profile 运行时更新并跨重启保留。目标 profile 需挂载 Settings 与 ConfigEditor；base bundle 已提供。先读 [Settings 契约](../api/api-infra-live-config.md#settingsforms)，Client 页面需要另读 UI 主题。

### 实现步骤

1. 在插件 Config 中将可即时生效字段声明为 `Volatile<T>`，schema 对应字段使用 `.volatile()`；给每个 profile 实例稳定且唯一的行 id。
2. 在业务操作开始时读取 `.get()`。收到 `loader/volatile-update` 后更新属于本插件的外部资源；保留卸载清理。短代码形状可对照目标版本 `docs/cookbook/adding-a-settings-card.zh.md`。
3. 需要自定义设置页面时，Client 根据 revision 执行路径级编辑，冲突则重读；秘密字段只传已知字段的局部修改，不整对象覆盖。Browser 模块装载与 UI slot 注册遵守 Client 主题的独立契约。
4. 普通字段变化仍按 Loader 的更新/重挂载规则处理，不能假设收到 volatile 通知。

### 验证与完成边界

修改字段后核查 profile patch、下一次业务操作读到新值、插件 fiber 身份是否保持、重启恢复；再提交非法值与陈旧 revision，确认磁盘和运行中引用都不变。若 home 或命令覆盖层遮蔽修改，先调整配置层优先级。
