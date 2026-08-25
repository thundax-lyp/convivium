# Host API 与生命周期

## 真相来源

- 插件加载、卸载、`inject`、`ctx.effect()`：[Plugins and lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/)
- Service 和依赖：[Services and dependencies](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/service)
- Tool 定义和执行管线：[Tools subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)
- Event 监听和自动清理：[Event system](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/events.md)
- Config schema：[Plugin configuration](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/config)

## 插件与注入

`inject` 只声明必须先就绪的 service。`ctx.<service>` 只有在注入和当前依赖类型确实提供时才能使用；可选 service 用 `ctx.get()` 或惰性注入处理。不要在 `apply()` 中抢跑依赖兄弟插件 effect 的 provider 注册。

## Tools

工具注册必须以当前 `@deepseek-ai/dsh-tools` 类型和官方 Tools subsystem 为准，通常形态是：

```ts
ctx.tools.register(defineTool({
    name: "tool_name",
    description: "明确何时调用、前置条件和失败语义",
    parameters: {
        value: { type: "string", required: true }
    },
    output: {
        schema: {
            type: "object",
            properties: { ok: { type: "boolean", required: true } },
            additionalProperties: false
        },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
    },
    async execute(args, exec) {
        return { ok: true }
    }
}))
```

确认当前版本后再使用第二个 `exec` 参数；不要把 `run`、顶层 `required` 数组或缺少 `output` 的旧示例带入实现。

## Resource ownership

官方 Cordis 规则是插件拥有的注册和 listener 随 fiber 卸载；route、timer、watcher、registry registration 和外部连接的具体 disposer 仍需查当前 service API。初始化失败应可观察；不要吞掉 rejection 或在卸载后继续写状态。

## AgentSession

从调用者的 `exec.agent` 获取 workspace、session 和 owner。不要使用全局 Agent、cwd 或隐式共享 session 推断会议身份。需要创建 continuable 子 Session 时，按当前 `dsh-subagent` 类型和生命周期接口取证，并验证 followup、interrupt、恢复和 drain 行为。

## HTTP 与持久化

HTTP route 的 service API 不在本手册中静态复制；实现前必须查当前官方 webserver package 的 README/types。路由只暴露最小、类型化且经过授权的接口，明确 exact/prefix、状态码、缓存和错误语义。持久化 root 必须显式、按会议和身份隔离，并采用当前架构要求的并发、原子发布和恢复策略；后半部分是 Convivium 约束，不是 DSH 通用 API。
