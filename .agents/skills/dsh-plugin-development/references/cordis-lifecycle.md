# Cordis 生命周期

本 reference 覆盖 `dsh-v0.1.1-rc.2` 的 Cordis 插件形式与 effect 所有权。

## 架构与插件形式

DSH 是 Cordis plugin harness。Context 是 Service 容器；Provider 占用稳定的 `ctx.<key>`，Consumer 在 `inject` 中声明这些 key。是否就绪由拓扑而非启动顺序决定。把行为放在能拥有它的最小现有 Service、event、tool、profile 或 durable Session extension 上。Agent loop 是组合叶节点；插件扩展点足以表达行为时不要修改 loop。

Loader 有两种入口。Service 包默认导出 Service class；函数插件具名导出 `name`、`inject`、可选 `Config` 和 `apply`，且没有 default export。不要混用。只有已声明 injection 的 Service 才通过 context property 访问；可选 Service 使用 `ctx.get(name)` 并处理 `undefined`。

## 生命周期与 effect

注册必须可撤销，但调用方应遵守具体 API 的所有权规则：

| 操作                                        | rc.2 正确所有权                                      |
| ------------------------------------------- | ---------------------------------------------------- |
| `ctx.on(event, listener)`                   | 直接调用；Cordis 绑定到调用 fiber。                  |
| `ctx.tools.register(definition)`            | 直接调用；Tools registry 创建调用 fiber 的 effect。  |
| `ctx.systemPrompt.section(...)`             | 直接调用；prompt registry 创建调用 fiber 的 effect。 |
| `ctx.llm.registerAdapter(routes, adapter)`  | 直接调用；LLM registry 创建调用 fiber 的 effect。    |
| 只返回未托管 disposer 的普通 registry       | 从 `ctx.effect()` 返回该 disposer。                  |
| timer、socket、process、subscription 等资源 | 在 `ctx.effect()` 内分配和释放。                     |
| 需要按序清理的多个普通资源                  | 在一个 generator effect 中 yield disposer。          |

只有需要提前替换/释放准确 contribution 时才保留 self-binding registry 返回的 handle。不要机械地把 `ctx.on()` 或 self-binding DSH registry 再包一层 effect。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'

export const name = 'assistant-chunk-observer'

export function apply(ctx: Context): void {
  ctx.on('session/event', (_session, event) => {
    if (event.type !== 'assistant/chunk') return
    ctx.logger.debug('assistant stream chunk observed')
  })
}
```

一个异步操作只有一个所有者。它负责分配状态、公开取消、隔离 callback failure、释放资源，并在 cleanup resolve 前达到静默。可能超过 turn 生命周期的工作必须响应 cancellation signal。空 `catch` 要说明仅吞掉哪种预期错误，以及为什么其他错误不会到达。

直接能力调用使用 Service method；policy/observation 使用 typed event。Waterfall listener 必须调用 `next()` 才会委托；不调用表示有意 short-circuit。只有必须早于普通注册时才使用 `prepend: true`。

## Scoped 注册

Scope 同时决定 contribution 对哪个 live Agent 可见，以及这些注册由哪个 Cordis fiber 清理。使用目标 registry 提供的 scoped registration context；不要只把 Agent id 存进值里再由 Consumer 手工过滤。`ScopeKey` 是按对象 identity 比较的 opaque key，shipped runtime 使用 live Agent object。Scope-filtered event 通过 `scopeTarget(base, key)` 形成 routing receiver，真实 subject 仍在 event payload 中。

实现 scoped registry 时，全局 layer 与 exact-scope layer 分离；读取合并后的 global contribution 加 scoped shadow。注册必须通过同一个 tagged context 同时取得 visibility 和 effect ownership，scope dispose 必须等待其注册达到静默。普通插件消费已有 scoped registry 时不应自行重建 `ScopedLayers`。
