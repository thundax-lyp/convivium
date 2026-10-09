# Host 作用域任务

## 为 Agent 隔离插件注册与事件

让一个 Agent 或分组有自己的工具、提示词或事件贡献，并在其生命周期结束时释放。仅 scope-aware 注册表和事件支持隔离。对象见 [作用域契约](../api/api-host-scope.md)，最小生命周期代码见 [Scope 示例](../examples/example-host-scope.md)。

### 操作步骤

1. 在拥有所需依赖的插件 context 下选一个稳定的对象 key，调用 `createScope(ctx, key, { parent? })`。需要父子关系时提前绑定；不要重绑 key 或构成环。
2. 只通过 `scope.ctx` 注册应由它拥有的贡献。自建注册表用 `ScopedLayers` 从 `scopeOf(ctx)` 存取，作用域事件用 `scopeTarget(base, key)` 发送。
3. owner 结束时等待 `scope.dispose()`；若在复合 effect 中有严格逆序需求，使用 `rawDispose`。不要把 scoped context 当安全沙箱传给低信任代码。

### 验证与完成边界

测试同 scope、父子、兄弟和全局贡献的可见性，重复 dispose，以及 scope 关闭后事件不再投递。普通 Service 若未接入 ScopedLayers，仍可能全局共享，不能据 context tag 推断隔离。
