# 贡献 Client 命令 UI：任务指南

## 贡献 Client 命令 UI

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已加载 `ui-commands`、`ui-input-trigger` 与本包。先读[命令 UI 契约](../api/api-client-commands.md)。

### 步骤

1. 若操作仅发生在当前浏览器，用 `ctx.commandUi.register({ name, available, ui })`；`name` 不带 `/`，并与 Host 命令及其他 Client contribution 错开。若既有 Host 命令需要选择弹窗，用 `decorate` 指向它，保留 Host 命令执行与日志路径。
2. 在 Client `apply` 内用 `ctx.effect(() => ctx.commandUi.register(...))` 管理生命周期。动态文案用 `label()`、`description()` 或 `searchLabels()`，不把翻译结果固定在模块装载时。
   最小浏览器半侧见[Client 命令示例](../examples/example-client-command-ui.md)。
3. 选 `action` 时在 `run(session)` 内完成同步 Client 操作；选 `popupSelect` 时在 `options(session, signal)` 中支持取消，在 `onSelect` 中以捕获的 Session 执行所选操作。Host 数据改动通过目标版本确有的 Remote/Host 命令完成，不能把 Client 回调写成持久操作。
4. 检查可用/不可用 Session、无 Host 目录项的 decoration、重复名称、弹窗取消与卸载。若选择会造成风险，给该 `SelectOption` 提供 `confirmation`。

### 完成判据

真实 Web Profile 中输入 `/` 能看到预期候选；Client contribution 不触发 Host 命令提交，Host decoration 的带参执行仍走 Host；取消旧弹窗后不会出现过期候选。
