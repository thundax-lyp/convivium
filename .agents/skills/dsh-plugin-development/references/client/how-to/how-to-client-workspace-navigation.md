# 导航 Workspace 与 Session：任务指南

## 导航 Workspace 与 Session

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已加载 workspace UI、Session/Workspace controller、layout 与目标插件。先读[Client 导航契约](../api/api-client-sidebar.md)中的 `UiWorkspace`。

### 步骤

1. Client 包 type-only 导入 `@deepseek-ai/dsh-client-ui-workspace/client`，在 `inject` 声明 `uiWorkspace`。从当前 UI 动作获得明确的 `SessionTarget` 或 `WorkspaceId`，不要根据展示名称推断身份。
2. 打开已有 Session 用 `ctx.uiWorkspace.openSession(target)`；连接 Workspace 并导航用 `await ctx.uiWorkspace.openWorkspace(workspaceId)`。只需取得可复用 Session 时用 `connectWorkspace`；新 Session 的用户动作使用 `startSession(workspaceId?)`。
3. `openWorkspace` 可能被后来的导航抢占；异步任务应在完成时确认自身仍拥有当前 UI 动作，再提交局部状态。`forkSession`、归档/取消归档、pin/unpin 是 Host 持久操作，等待结果并按失败回退 UI。
4. 若业务需要目录选择，先确认已组装的 Host directoryPicker 后端形态及其 Client UI 组合；`pickDirectory()` 的 `null` 是用户取消，`listDirectory(path,signal)` 支持被后续浏览取消。不要假设远端浏览器可弹出 Host 本地原生选择器。

### 完成判据

真实 Web Profile 中导航到正确 Session，后续导航能抢占旧请求；失败、取消与卸载不留下错误选中态。静态类型核对不代表 Profile 中 picker 后端已装载。
