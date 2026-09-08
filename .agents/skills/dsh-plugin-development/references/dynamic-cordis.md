# 动态 Cordis 扩展

本 reference 覆盖 `dsh-v0.1.2-rc.1` 的 dynamic runner。它与发布到 workspace 的普通包不同；进程内定义和运行不代表已经产生可发布的 package artifact。

## 发现后再实现

`cordis_inspect_list` 发现 Host/Client inspection Provider，`cordis_inspect_query` 使用准确 Provider、method 与 input schema。Catalog 来自当前实际 Service、slot 和 tool 表面；不能沿用旧 client/runtime 的类型、从文档猜方法名，或把未挂载 Provider 当可用 API。

Inspection 注册由 `CordisInspectRegistryService` 拥有。Client 查询通过对应请求/回答通道；请求取消、Provider 移除和晚到答复需要收束。增加动态可见 API 时修改所属声明和 catalog adapter，而不是在模型提示中手写另一份接口。

## Plugin、Package 与 Run

`dynamicCordisRunner` 管理 Session 所有的 Plugin identity、不可变 Package version 和一次具体 Run。define 不等于 activate；每个 Plugin 最多一个活动 Run。更新创建新的 Package，不原地篡改旧 source。处理异步失败或更新前先 inspect 精确 pluginId/packageId，避免对错误版本应用修复。

Host 与 Client half 分开报告状态。Client activation 经 human approval；approved、completed、rejected、cancelled、failed 不能折叠成一个布尔成功。一个 half 加载或渲染失败不得被另一个 half 的成功掩盖；stop/undefine 按 runner 的所有权规则释放资源。

Source 是 plain JavaScript，define 时进行语法 precheck。Host VM 暴露受控的 harness/Context 能力；require、裸定时器等被重定向到框架用法。vmTimeoutMs 约束同步求值，不代表异步任务自动取消，也不构成可运行任意不可信代码的隔离承诺。通过 Cordis effect、scope 与 runner 生命周期管理后续资源。

## Client 能力

Client half 遵守 [Client UI](client-ui.md) 的 slot、类型、locale 与 Service 边界；不能因代码是动态生成的就 value-import 另一个 feature plugin。Slot catalog 应反映目标版本 ui-renderer/ui-slots 的实际契约；连接存在不保证某个 UI capability 已注入。

动态工具的规范结果、异步结果注入和用户选中的 plugin reference 必须保留足够 Session 证据，使模型知道它操作的具体版本和结果。进程内 registry 不是重启后自动恢复全部 Run 的持久数据库。

## 验证

覆盖不可变版本、一次活动 Run、跨 Session identity 拒绝、define 语法失败、Host/Client 半边失败、批准/取消竞态、晚到答复及撤销后的注册清理。发布普通插件时仍走 package/Loader/build 检查，不能用一次动态 run 代替分发验证。
