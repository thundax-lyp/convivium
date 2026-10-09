# 在 Web 插件调用 Host Remote

## 从 Client 调用已装载的 Remote namespace

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2` 已生成并纳入 `api-remotes` assembly 的 namespace。先确认 Host owner 已在 Profile 挂载，读取[Remote 契约](../api/api-client-remote.md)。新增 namespace 的 Host 生成和聚合步骤不能省略。

### 实现步骤

1. Client 代码以 type-only import 引入 `@deepseek-ai/dsh-api-remotes/client` 的 Context merge；Browser 插件的 `inject` 同时列出 `remote` 与 `remote.<namespace>`，再在 `apply` 或其闭包中调用 `ctx.remote.<namespace>.<method>(...)`。避免复制生成签名或自己构造 wire payload。
2. 对每次一元调用检查 `result.ok`。成功分支消费 `value`；失败分支按 `error.code` 处理业务失败、`gateway/cancelled` 和其他基础设施失败。需把失败交上层时 `throw result.error`；上层用 `isRemoteFailure` 区分本地异常。响应与错误信息要由拥有该 UI 的组件转换成可观察、可本地化的状态。
3. 需要服务端事件时只订阅允许转发的 `$on` 事件，并在 fiber 清理时释放 disposer。读取 `ctx.remote.$host.home` 前考虑未 ready 的 `undefined`；重连后通过 `connection/reset` 或域事件重新取得状态。
4. 在目标 checkout 运行 owner 和 Client 两侧类型/行为测试；在 Web Profile 做一次成功调用、一次业务错误、取消与断线重连检查。只看到 `./remote` 导出或 TS 声明不等于 Host owner 正在运行。

### 验证与完成边界

成功调用应返回经生成 codec 校验的值；业务失败应保留稳定 `code` 与 `details`；取消走错误分支；断线期间不保留过时的 `$host` 展示。新增 Remote API 另需证明生成器产物、assembly 和 Profile 三者一致；目标 workspace 外的新增 namespace 没有自动聚合保证。
