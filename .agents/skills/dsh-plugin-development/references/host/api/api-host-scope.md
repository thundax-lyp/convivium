# Host 作用域注册对象

适用 `@deepseek-ai/dsh-scope@0.2.0-rc.2`。它是插件作者构建按 Agent/分组隔离注册表与事件面的公共原语，不是沙箱或权限边界。见 [创建作用域贡献](../how-to/how-to-host-scope.md)。

## createScope

`createScope(ctx, key, { parent? })` 在调用插件的 fiber 下创建一份 scope context。通过 `scope.ctx` 建立的注册同时拥有该 scope 的可见性和清理生命周期；`await scope.dispose()` 等待所有注册停稳，`rawDispose` 是用于组合 effect 的精确 Cordis disposer。这个 context 继承创建者的依赖可达性，因此只应由本来有相应服务访问权的插件创建。

## Scope

**公开导出**：`Scope` 来自 `@deepseek-ai/dsh-scope`。
包含 `ctx`、`rawDispose` 和共享的异步 `dispose()`。重复且并发的 dispose 等待同一清理结果；scope 卸载后其贡献不可继续可见。

## bindScopeParent

**公开导出**：`bindScopeParent` 来自 `@deepseek-ai/dsh-scope`。
给 key 绑定一次 parent；已绑定或形成环都会失败。`scopeChainOf(key)` 以最近 key 开始向上枚举。子层读到祖先注册，祖先 listener 能观察子层事件，反向均不成立。

## scopeTarget

`scopeTarget(base, key)` 为 Cordis 作用域过滤事件生成 opaque receiver，保留 base 原有 filter。未标记 listener 全局接收；标记 listener 仅接收同 key 或后代事件。事件主体仍在参数里，不在 carrier 中。只有使用这一分发方式的事件才会按 scope 路由。

## ScopedLayers

注册表作者用 `ScopedLayers` 加 `NamedEntries` 或 `AnonymousEntries` 构建全局层和精确 scope 层。读取不创建层；`merge()` 按最近优先合并命名项；`effect()` 让贡献的可见范围与资源所有权来自同一个 context。普通 Cordis Service 不会因收到了 scope context 就自动隔离内部状态。

以下成员是该对象的公开契约：

- `chainLayers: (scope: object | undefined) => L[]`：按继承链返回适用层，供合成有效配置。
- `global: L`：默认全局层。
- `peek: (scope: object | undefined) => L | undefined`：读取指定 scope 的当前最高优先级层；没有时为空。
