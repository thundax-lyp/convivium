# Scoped registration

本文针对 `dsh-v0.1.2-rc.1` 的可见性、继承和注册所有权。`dsh-scope` 是库原语，不是 `ctx.scope` Service。普通 Cordis 插件形式见 [生命周期](cordis-lifecycle.md)。

## Identity 与调用方

ScopeKey 按 object identity 比较；Agent runtime 使用准确的 live Agent 对象作为 key，不能以 SessionId 字符串替代。Scope parent 表达可见性继承，不是 Subagent ancestry 授权：拥有父 scope 的可见工具不等于有权向任意 ancestor 发消息。

`createScope(ctx, key)` 返回带标签的注册 context 与 disposer。通过这个 context 注册时，可见性和 effect 生命周期同时归该 scope；从 root context 注册再手工过滤 Agent 不能获得同样的卸载语义。`bindScopeParent()` 只允许首次绑定，只有原 binder 持有返回的 `ScopeParentBinding` 才能 rebind；重复绑定和成环均拒绝。

## Registry layer

ScopedLayers 拥有 global layer 与按需创建的 scope layer，读操作不创建 overlay。有效视图按 global 和 scope parent chain 合并，同名项由更近层覆盖；重复策略仍由实际 registry 定义。`peek(scope)` 刻意只读 exact layer；限制/guard 的 owner 可要求 exact-scope 语义，不能把所有读取一律改成继承。不能把“跨层 shadow”误写成“同层可重复注册”。

NamedEntries 维护命名与顺序；AnonymousEntries 的每次 append 有独立 identity，相等值仍是两项贡献。每次撤销只删除自己的准确 entry；旧 disposer 不应删除后来注册的同名项。一个 layer 可包含多个表，只有整个 layer 为空时才回收，避免删掉 sibling table 的状态。

缓存 key 必须包含实际 viewing scope chain 或等效失效机制。Preset standing scope/re-parent 会改变有效视图，即使 registry 本身没有新增或删除 entry；不能按 cwd 或 SessionId 单独缓存所有可见能力。

## Scoped event

声明为 `this: Scoped<T>` 的事件用 `scopeTarget(base, key)` 作为 routing receiver；它是 opaque carrier，不暴露真实主体的属性。真实 Agent、Tool runtime 或 request 仍由显式参数携带。事件允许 global、当前 scope 与其祖先 listener 接收，不向子 scope 广播。不要把 carrier 当业务对象读字段，也不要把 scoped event 改为无 receiver 的全局广播。

## Teardown 与验证

`Scope.dispose()` 是并发调用共享的 quiescence 边界；`rawDispose` 保留 Cordis 的原始 disposer identity，供需要顺序清理的 composite effect 使用。普通调用者使用公共 dispose，等待完成后才宣布 scope 清空。

测试 global/parent/child shadow、同层重复、匿名相等值、旧 entry disposer、re-parent 后读视图、注册失败撤销、scope dispose 和晚到 callback。只测试注册成功不能证明隔离与生命周期。
