# Host Cordis 对象

适用 `@deepseek-ai/cordis@4.0.4`，由 DSH `0.2.0-rc.2` 的 Host 插件入口使用。`Context`、`Plugin`、`Service`、`Fiber` 从包根公开导出。以下示例只解释调用关系；完整装载操作见 [Host Service HOW-TO](../how-to/how-to-host-service.md)。

## Context

`Context` 是插件收到的依赖容器，也是服务解析、插件装载、事件和副作用的入口。`ctx.tools` 等能力来自其他包对 `Context` 的声明合并；类型中出现一个属性不表示当前 Profile 已提供该服务。用 `inject` 声明必需依赖，不能仅凭可选的 `ctx.get()` 代替它。

常用声明合并键的契约归其提供包所有：[`ctx.tools`](api-host-tools.md#toolruntime)、[`ctx.agents`](api-host-agent.md#agentregistry)、[`ctx.commands`](api-host-commands.md#commandruntime)、[`ctx.sessions`](api-host-session.md#sessionstore)、[`ctx.sessionProjections`](api-host-session.md#sessionprojectionregistry)、[`ctx.llm`](api-host-llm.md#llmruntime)、[`ctx.systemPrompt`](api-host-prompt-policy.md#systemprompt)、[`ctx.approval`](api-host-prompt-policy.md#approvalservice)、[`ctx.credentials`](api-host-credentials.md#credentialprovider)、[`ctx.authorization`](api-host-credentials.md#authorizationservice)、[`ctx.sessionPersistence`](api-host-persistence.md#sessionpersistence)、[`ctx.directoryPicker`](api-host-directory-picker.md#directorypicker)、[`ctx.compaction`](api-host-compaction.md#compactionengine)、[`ctx.sessionTitle`](api-host-session-title.md#sessiontitleservice) [`ctx.shellEnv`](api-host-shell-env.md#shellenvregistry)、[`ctx.jobs`](api-host-jobs.md#jobregistry)、[`ctx.subagents`](api-host-subagent.md#subagentruntime)、[`ctx.workflowEngine`](api-host-workflow.md#workflowengine)、[`ctx.userQuestions`](api-host-user-questions.md#userquestionservice)、[`ctx.goals`](api-host-goal.md#goalservice) 与 [`ctx.sessionQuery`](api-host-session-query.md#sessionqueryengine)。`remote`、`slots`、`settings`、`storage`、`clientModules` 等键跨 Host、Client 或持久化主题，其可用侧、装载条件和方法应在所属包的权威子主题核查；Cordis 根页只解释解析与所有权。

| 成员 | 插件作者用途与边界 |
| --- | --- |
| `ctx.plugin(plugin, config?)` | 在当前上下文启动函数、对象或类插件，返回可等待的 `Fiber`；无效入口或已卸载的父 fiber 会抛错。 |
| `ctx.inject(inject, callback)` | 等待声明的依赖后执行回调；这是 `registry.inject` 的混入方法。 |
| `ctx.get(name, strict?)` | 查询服务；默认只返回仍 ACTIVE 的 provider，未提供时返回 `undefined`。需要稳定依赖时使用 `inject`。 |
| `ctx.provide(name, value, check?)` | 在当前 fiber 提供服务；所属 fiber 卸载时自动撤销。基于 `Service` 的实现由 `super(ctx, name)` 完成注册。 |
| `ctx.effect(execute, label?)` | 立即建立副作用，返回释放函数；`execute` 应返回 disposer、其 Promise 或 disposer 的 iterable。释放函数和 fiber 卸载都会触发清理，重复释放无效。 |
| `ctx.on(...)`、`ctx.emit(...)` | 事件监听与发出；具体事件 payload 和派发模式由事件声明决定，监听器归所属 fiber 清理。 |
| `ctx.extend(meta?)` | 生成继承父上下文的子上下文，`meta` 的 own 属性遮蔽继承属性；不修改父上下文。 |
| `ctx.isolate(name, label?)` | 为指定服务创建独立解析作用域；相同 `label` 可共享作用域。 |
| `ctx.intercept(name, config)` | 对子上下文内启动的插件增加服务专属配置，不修改父上下文。 |

`Context.root` 标为 `@experimental`；普通插件应使用收到的 `ctx`，避免绕开隔离和 fiber 所有权。

以下成员是该对象的公开契约：

- `baseUrl: string | undefined`：可选的 Host 基础 URL；只有宿主配置后才有值。
- `events: EventsService`：Cordis 事件服务，供插件注册与发出生命周期事件。
- `logger: LoggerService`：Cordis 日志服务；按插件作用域输出诊断。
- `reflect: ReflectService`：Cordis 反射服务，查询服务和插件元信息。

## Plugin

公开 `Plugin` 联合支持 `(ctx, config) => ...` 函数、`new (ctx, config) => ...` 类和 `{ apply(ctx, config) }` 对象。公共元数据含 `name`、`Config`（Standard Schema 验证）、`inject`（数组或服务名到 intercept 配置的映射）、`provide` 与 `intercept`。`name` 是 fiber 诊断名，不是 npm 包名；`provide` 是供 Loader 等识别的声明，服务实际注册仍应由 `Service` 构造或 `ctx.provide` 执行。

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'sample-tool'
export const inject = ['tools']
export function apply(ctx: Context): void {
  // 此处 ctx.tools 已由依赖注入保证可用。
}
```

## Service

`Service` 子类构造器调用 `super(ctx, name)` 时，经 `ctx.reflect.provide` 立即注册当前实例；当前 fiber 卸载时自动撤销。消费者仍须为服务声明类型：`declare module '@deepseek-ai/cordis' { interface Context { sample: SampleService } }`。`Service.name` 是该实例注册名。可调用服务使用 `[Service.invoke]`，常规领域服务无需它。`[Service.resolveConfig]` 会按祖先到子上下文顺序合并 intercept 配置；只有明确需要该机制的 provider 才应依赖它。

构造期间不要启动无法撤销的异步工作。需要外部资源时用 `ctx.effect` 返回释放函数，并在失败时让构造或初始化失败，以免留下部分注册。Provider 与 Consumer 的可执行组合见 [Host Service HOW-TO](../how-to/how-to-host-service.md)。

## Fiber

`ctx.plugin` 返回的 `Fiber` 表示该插件的一次激活，可 `await` 其装载完成。`dispose()` 卸载；`effect()` 产生的 disposer 逆注册顺序运行，异步清理会被等待。`state` 标识生命周期阶段，`getEffects()` 提供诊断树。持久数据不归 fiber 自动恢复；重启后需要从所属持久介质重建，并由消费者自行定义事实来源。

若父 fiber 已卸载，继续 `plugin` 或注册 effect 会失败；注销及并发清理时应等待其完成，再断言服务不可访问。`Fiber` 的下划线字段属于实现细节，不作为插件 API 使用。

## RegistryService

`ctx.registry` 是插件运行记录与 fiber 的管理者，`ctx.plugin`、`ctx.inject` 是它混入 `Context` 的便捷入口。`plugin(plugin, config?)` 启动一个 fiber；`inject(inject, callback)` 把依赖声明和回调组合成插件；`get(plugin)`、`has(plugin)` 查询已注册运行记录；`delete(plugin)` 卸载该插件的所有 fiber 并移除记录。常规包入口由 Loader 装载，直接操作 `RegistryService` 更适合已经拥有父 context 的组合代码；不要用 `delete` 代替 Profile 的安装或禁用管理。
