# Example：按 Agent 生命周期建立作用域

本例使用 DSH `0.2.0-rc.2` 的 `createScope` 与 Cordis 事件。对象见 [作用域契约](../api/api-host-scope.md)，步骤见 [HOW-TO](../how-to/how-to-host-scope.md)。

## 文件清单

```text
scratch-scope/
└── src/scope.ts
```

`scratch-scope/src/scope.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'

export function observeOneAgent(ctx: Context, agent: Agent): () => Promise<void> {
  const scope = createScope(ctx, agent)
  scope.ctx.on('agent/status', ({ agent: changed, status }) => {
    if (changed === agent) ctx.logger.info(`目标 Agent 状态：${status}`)
  })
  return () => scope.dispose()
}
```

此代码展示 context 与 disposer 的所有权，不是一个完整的插件入口。由 Agent handle 持有返回的 disposer，在 Agent 释放时等待它完成；实际事件由 Agent 运行时发出。在实际插件中将 `scope.ctx` 交给 scope-aware registry 注册贡献。测试应确认兄弟 Agent 的事件不进入本监听器。
