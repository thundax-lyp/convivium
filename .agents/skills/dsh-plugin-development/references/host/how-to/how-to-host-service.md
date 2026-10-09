# Host Service 任务

## 提供并消费一个 Host Service

目标是让一个插件提供具名能力，另一个插件在依赖就绪后调用它；服务不必有单独 UI。对象契约见 [Context、Plugin、Service 与 Fiber](../api/api-host-cordis.md)。两方必须在同一可见的 Cordis 服务作用域，且 provider 要先进入目标 Profile。

### 实现步骤

1. Provider 包公开继承 `Service` 的类，在构造器中执行 `super(ctx, 'metrics')`，并公开领域方法；通过 `declare module '@deepseek-ai/cordis'` 给 `Context.metrics` 声明同一个类型。Provider 的默认导出或 Loader 行应实际装载该类。源码 checkout 的完整双插件文件与 patch 见 [example-host-service](../examples/example-host-service.md)。
2. Consumer 导出 `inject = ['metrics']`，在 `apply(ctx)` 中调用 `ctx.metrics`。依赖缺失时 Cordis 等待，不要强行从根 context 查找；如果依赖在运行期间消失，消费 fiber 会释放，服务恢复后重新装载。
3. 用 Profile 的 bundle/patch 挂载 provider 与 consumer。配置若需要输入校验，插件的 `Config` 必须是 Standard Schema；服务类型声明本身不产生运行时 provider。
4. Provider 的外部资源经 `ctx.effect` 归属其 fiber，释放函数负责停用资源。业务状态若要跨重启恢复，明确持久化 owner 和重建顺序；Cordis 的自动注销只处理运行中注册，不负责保存领域状态。

### 验证与完成边界

先编译两方在同一 TS 程序中的声明，再在目标 checkout 的隔离 Profile 实际装载两方，观察 Consumer 调用结果。移除 Provider 后检查 Consumer 不再运行、资源已释放；重新装载后检查 Consumer 恢复。仅通过 `Context` 声明编译，不证明 Provider 已进入 Profile。
