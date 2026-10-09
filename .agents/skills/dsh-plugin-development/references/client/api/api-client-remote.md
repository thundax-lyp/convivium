# Client Remote 调用与新端点边界

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。已有 namespace 的 Client 调用见[调用 Remote](../how-to/how-to-client-remote-call.md)，发布新端点见[发布 Host Remote](../how-to/how-to-client-publish-remote.md)。新增 Host API 要同时完成 owner、Typert 生成、Client assembly 与 Profile；只写一个 `@Remote` 方法不会自动进入浏览器。

## `TypertRemoteService`

`@deepseek-ai/dsh-typert-protocol` 的 `TypertRemoteService` 是 Host Cordis service 基类，构造函数把 service key 和可选 wire `namespace` 绑定。`@Remote` 可直接标记 public instance method，或以 `@Remote('wireName')` 改出口名；`@Remote({ mode: 'stream' })` 标记流式结果。私有、静态、symbol 方法不能标记。需要查找 `Agent`、`Session` 等对象时，lookup 参数位于顶层；支持协作取消的方法把 `AbortSignal` 放最后。Typert 从目标 workspace 类型与装饰器生成 Host descriptor、Client 声明与 codec；签名、namespace 或错误码变化后须重新生成并重新编译两侧。

## `Remote`

`@Remote` 标记 public instance method；字符串重命名 wire 入口，`{ mode: 'stream' }` 指定流传输。业务方法保持原签名；只有 wire 参数或名称必须适配时才另写 adapter。

## `RemoteScope`

`@RemoteScope(key, exportName?)` 针对注册的上下文 scope 导出方法，`key` 需在 Typert 的 Context map 中声明。与普通 `@Remote` 的直接调用不同，先核查 scope 的解析和生存期，再在 Client 使用。

包 manifest 须导出生成的 `./typert` 与 `./remote`，且真实存在可发现的 `@Remote` 方法。生成器对“发布 Remote 产物却没有 Remote 方法”的包报错。新增 namespace 还须进入 `@deepseek-ai/dsh-api-remotes/client` 的 assembly，Browser 插件须通过 `inject` 声明 `remote` 及 `remote.<namespace>`；同时保证 Host service 在 Profile 中挂载。

## `RemoteError`

Host 业务失败通过 `RemoteError(code, message, details)`，域码和 detail 形状经 `RemoteErrorDetailsMap` 声明合并。未知 Host 异常由 Gateway 归入基础设施失败。Client 一元调用返回 `RemoteResult<T>`：检查 `ok`，成功取 `value`，失败读 `error.code` 和 `error.details`，不能按 `instanceof` 判断跨 wire 异常。调用方取消会落在 `gateway/cancelled` 错误分支。若上层选择抛出 `result.error`，可用 `@deepseek-ai/dsh-api-gateway/client` 的 `isRemoteFailure` 与本地错误区分。

## `RemoteErrorDetailsMap`

**公开导出**：`RemoteErrorDetailsMap` 来自 `@deepseek-ai/dsh-typert-protocol`。
这是域失败码到 `details` 结构的声明合并表。声明应放在错误生产者或多个生产者共用的底层域包；wire 之外的本地失败不应加入此表。

## `RemoteResult<T>`

**公开导出**：`RemoteResult` 来自 `@deepseek-ai/dsh-typert-protocol`。
一元调用的判别字段为 `ok`；成功分支取 `value`，失败分支取 `error`。先判 `ok` 再访问相应字段，避免自己重建 wire 联合类型。

## `ClientRemote`

**公开导出**：`ClientRemote` 来自 `@deepseek-ai/dsh-api-remotes/client`。
`@deepseek-ai/dsh-api-remotes/client` 导出聚合的 Client Remote 类型、已有 namespace 的生成贡献及事件词汇。Browser 业务代码以 type-only import 拉入 Context merge，不从 facade 值导入 Host 装配。`ctx.remote.$host.home` 与 `isLoopback` 是普通值；第一帧 ready 前 `home` 可为 `undefined`，重连后要通过 `connection/reset` 或域事件刷新。`ctx.remote.$on` 只对允许转发的事件生效；回调 disposer 要与插件 fiber 生命周期一起释放。

## `isRemoteFailure`

**公开导出**：`isRemoteFailure` 来自 `@deepseek-ai/dsh-api-gateway/client`。
从 `@deepseek-ai/dsh-api-gateway/client` 导入。它用于已经抛到上层的错误：为 Remote failure 时读取稳定 `code`，否则保留本地缺陷的异常流。它不是一元调用后替代 `result.ok` 的检查。

## 独立包限制

目标版本的公开 protocol/decorator 可声明 Remote owner，但生成器、聚合 assembly 和 Web Profile 的完整新增流程依赖目标 workspace 的构建配置。独立消费包可使用已发布 namespace；为独立新增 namespace 声称即装即用前，必须实际证明生成产物被聚合并在目标 Profile 装载。不能把仓库内的 `workspace:*`、相对生成脚本或既有内置 assembly 当成外部发行契约。
