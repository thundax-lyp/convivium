# Cordis 生命周期

本 reference 覆盖 `dsh-v0.1.1-rc.2` 的 Cordis 插件形式与 effect 所有权。

## 架构与插件形式

DSH 是 Cordis plugin harness。rc.2 发布并使用 vendored `@deepseek-ai/cordis@4.0.1`；插件从这个包导入 `Context`、`Service` 等框架原语，从拥有能力的 `@deepseek-ai/dsh-*` 包导入 Service、Tool、Event、Slot 与协议类型。不要改用独立上游 Cordis 包，也不要绕过 DSH capability package 直接重建其服务。

Context 是 Service 容器；Provider 占用稳定的 `ctx.<key>`，Consumer 在 `inject` 中声明这些 key。是否就绪由拓扑而非启动顺序决定。把行为放在能拥有它的最小现有 Service、event、tool、profile 或 durable Session extension 上。Agent loop 是组合叶节点；插件扩展点足以表达行为时不要修改 loop。

Cordis runtime 接受 function、class 和 `{ apply }` object 三种 plugin shape。Loader 导入 package 后优先解包 `default` export；没有 `default` 时把 module namespace 交给 Cordis。DSH Service 包 default-export Service class；函数插件不设 `default`，具名导出 `apply`，并且只在实际需要时导出 `name`、`inject` 或 `Config`。例如，无必需依赖的函数插件可以没有 `inject`，纯 Client surface 的空 Host 插件可以只导出 `apply`。不要混用两种 DSH package 形式，也不要添加无用途的入口 metadata。只有已声明 injection 的 Service 才通过 context property 访问；可选 Service 使用 `ctx.get(name)` 并处理 `undefined`。

## Service 与依赖

新增 Service 时，通过 `declare module '@deepseek-ai/cordis'` 扩展 `Context` 的准确 key 与类型；消费 DSH Service 或 Event 时导入其 owner package 的 declaration merge。不要维护第二份 service-name 或 event-signature 清单。

必需依赖写入插件的 `inject`。依赖未就绪时 Fiber 保持 `PENDING`，不会执行插件；活动期间依赖消失时 Cordis 卸载该 Fiber，依赖恢复后重新执行插件。不要为这些状态增加手工启动排序、ready polling、service cache 或 fallback registry。

可选依赖不写入 `inject`，在使用点调用 `ctx.get(name)` 并处理 `undefined`。`ctx.get(name)` 默认只返回当前 active Provider；它不会让插件等待 Provider，也不会赋予 context property 访问权限。必需依赖不得降级成可选 lookup 来绕过加载失败。

Service subclass 在 constructor 中调用 `super(ctx, key)` 后，由当前 Fiber 提供并拥有该 Service；Fiber unload 时自动撤销。只有组合确实要求同名 Service 的隔离实例时才使用 Loader 的 service isolation；不要为单实例能力建立命名 Provider registry。

## Fiber 与子插件

Fiber 状态是 `PENDING`、`LOADING`、`ACTIVE`、`FAILED`、`UNLOADING`、`DISPOSED`。`ctx.plugin()` 创建继承 parent context 的 child Fiber，child 有独立依赖和 effect，但由 parent Fiber 拥有；parent disposal 会递归卸载 child。需要等待 child 启动或释放完成时，分别 await `ctx.plugin(...)` 返回值或 `fiber.dispose()`，不要只观察同步副作用。

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
| 需要按序清理的多个普通资源                  | 在一个 effect 的 disposer 中显式串行 await。         |

只有需要提前替换/释放准确 contribution 时才保留 self-binding registry 返回的 handle。不要机械地把 `ctx.on()` 或 self-binding DSH registry 再包一层 effect。

Fiber unload 会并发等待其顶层 effects；同一个 `ctx.effect()` 收集的 disposer 按注册逆序串行执行。因此存在跨资源顺序依赖时，把它们放进同一个 effect 的 disposer，并在该 disposer 内明确串行清理。`fiber.dispose()` 只在全部异步清理完成后 resolve。

```ts
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-session";

export const name = "assistant-chunk-observer";

export function apply(ctx: Context): void {
  ctx.on("session/event", (_session, event) => {
    if (event.type !== "assistant/chunk") return;
    ctx.logger.debug("assistant stream chunk observed");
  });
}
```

一个异步操作只有一个所有者。它负责分配状态、公开取消、隔离 callback failure、释放资源，并在 cleanup resolve 前达到静默。可能超过 turn 生命周期的工作必须响应 cancellation signal。空 `catch` 要说明仅吞掉哪种预期错误，以及为什么其他错误不会到达。

直接能力调用使用 Service method；policy/observation 使用 typed event。Waterfall listener 必须调用 `next()` 才会委托；不调用表示有意 short-circuit。只有必须早于普通注册时才使用 `prepend: true`。

事件 dispatch mode 是公开契约：`emit` 同步广播且不等待返回的 Promise；`parallel` 并发等待全部 listener；`serial` 按注册顺序等待并在首个非 `null`、非 `false`、非 `undefined` 结果停止；`bail` 同步执行并使用相同停止条件；`waterfall` 由 listener 显式调用 `next()` 组成链。新增或消费事件前，从 owner package 的 declaration merge、dispatch site 与生成 catalog 核对准确 mode；不要根据事件名推断。

## Scoped 注册

Scope 同时决定 contribution 对哪个 live Agent 可见，以及这些注册由哪个 Cordis fiber 清理。使用目标 registry 提供的 scoped registration context；不要只把 Agent id 存进值里再由 Consumer 手工过滤。`ScopeKey` 是按对象 identity 比较的 opaque key，shipped runtime 使用 live Agent object。Scope-filtered event 通过 `scopeTarget(base, key)` 形成 routing receiver，真实 subject 仍在 event payload 中。

实现 scoped registry 时，全局 layer 与 exact-scope layer 分离；读取合并后的 global contribution 加 scoped shadow。注册必须通过同一个 tagged context 同时取得 visibility 和 effect ownership，scope dispose 必须等待其注册达到静默。普通插件消费已有 scoped registry 时不应自行重建 `ScopedLayers`。
