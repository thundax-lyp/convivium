# Example：装载 Playwright MCP browser provider

此例选择目标版本的具体实验后端；registry 对象契约见 [Browser use API](../api/api-infra-provider-browser-use.md#browseruseregistry)。

## Profile patch

目标 Profile 须已有 `agents`、`tools`、`systemPrompt`，并安装了 `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` 及其固定的 `@playwright/mcp` 依赖。在该 Profile 的 patch 加入：

```yaml
- insert:
    - id: example-browser-use-registry
      name: '@deepseek-ai/dsh-browser-use'
    - id: example-playwright-browser
      name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
      inject: [browserUse, agents, tools, systemPrompt]
      config:
        mode: launch
        headless: true
```

按目标 Profile 的既有 Loader 流程装载 patch，确认 `ctx.browserUse.providerName` 为 `playwright-mcp`。以一个测试 Session 调用该 provider 注册的浏览器工具，观察实际页面状态；另一个 Session 不应看到前者资源。停用 provider 后等其 Session 浏览器和 MCP 子进程结束，再确认名称为 `undefined`。这些行为须在有 Chromium 依赖的环境运行；静态 patch 校验只能证明字段和依赖配置与目标源码相符。

## 自定义 provider 资源所有权骨架

下例只实现资源所有权适配函数；`openBrowser` 是调用方实际浏览器后端的获取函数，必须在失败前回滚，并在返回对象的 `close` 中等待浏览器完全退出。工具注册及 Profile 装载属于调用方插件。把返回的 `dispose()` 放入 provider effect 的清理路径，并先等待其成功，再释放 browser-use registry 槽。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  SessionResources,
  type OwnedSessionResource,
} from '@deepseek-ai/dsh-experimental-browser-use-runtime'

export function createBrowserResources<T>(
  ctx: Context,
  openBrowser: (agent: Agent, signal: AbortSignal) => Promise<OwnedSessionResource<T>>,
): SessionResources<T> {
  return new SessionResources<T>(ctx, {
    label: 'my-browser',
    exclusive: true,
    open: openBrowser,
  })
}
```

调用浏览器操作时使用 `resources.run(agent, signal, async (browser, combined) => { ... })`；操作内部将 `combined` 继续传给后端，待实际工作完成后才返回。若后端不支持取消，`close()` 必须先关闭传输以打断工作。验证同一 Agent 的操作顺序、不同 Agent 的独占冲突、Agent 销毁和 provider 卸载后的资源释放，并用实际浏览器检查工具可见性。
