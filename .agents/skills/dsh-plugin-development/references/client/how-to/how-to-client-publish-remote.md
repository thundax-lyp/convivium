# 发布 Host Remote 供 Client 调用：任务指南

## 发布 Host Remote 供 Client 调用

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。此任务涉及目标 workspace 的 Host owner、Typert 生成、Client assembly 和真实 Profile；先读[Remote 契约](../api/api-client-remote.md)。独立第三方包是否能接入现有 assembly 需在目标部署中另行验证。

### 步骤

1. 在 Host Cordis 服务继承 `TypertRemoteService`，构造时绑定 service key 与 wire namespace。在公开 instance method 上用 `@Remote` 标记端点；仅需要改变 wire 名称、参数顺序或补末尾 `AbortSignal` 时添加 adapter。`Agent`、`Session` lookup 对象只能位于顶层参数位置。
2. 为预期业务失败在错误生产者附近声明合并 `RemoteErrorDetailsMap`，抛 `RemoteError(code, message, details)`；保留与端点无关的本地异常，让 Gateway 处理意外错误。码名采用 `<域>/<原因>`，不要复制已存在的 Gateway 码。
3. 在包 `exports` 提供 `./typert` 指向 `lib/typert.host.*`，`./remote` 指向 `lib/typert.remote-client.*`，并加入 `@deepseek-ai/dsh-typert-protocol` 的 peer 与开发依赖。构建配置可接入 [Typert 构建插件](../api/api-client-typert-build.md)；签名、namespace、码表或出口变化后按目标 workspace 的 `pnpm run build:lib` 生成 Host descriptor、Client 声明及 codec。
4. 将新增 `./remote` 贡献纳入 `@deepseek-ai/dsh-api-remotes/client` assembly；Client 包 type-only 导入聚合面，在 `inject` 同时声明 `remote`、`remote.<namespace>`，调用后按 `RemoteResult.ok` 分支处理。Host owner 必须在真实 Profile 装载；Client 包也须在 Web Profile 装载。
5. 对照生成声明检查参数与结果；分别运行 Host 端点失败码测试、Client 成败和取消分支测试，并在同一 Profile 中做实际网络调用。若 assembly 或 Profile 无法修改，明确把端点列为未接入，不宣称第三方包已可用。

### 完成判据

Host owner 与生成 artifact 对应同一目标版本；聚合 Client Remote 声明确有 namespace 和方法；真实 Profile 中 Client 成功调用、业务失败与取消均按预期返回，并可在卸载时清理。单独看到 `./remote` 文件不能证明浏览器已接入。
