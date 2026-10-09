# Example：规则型会话标题 provider

本例针对 DSH `0.2.0-rc.2`，按首条可用用户文本生成标题，无辅助模型请求。标题日志事实由 `SessionTitleService` 写入。对象见 [标题契约](../api/api-host-session-title.md)，任务见 [标题 HOW-TO](../how-to/how-to-host-session-title.md)。

## 文件清单

```text
scratch-title/
├── src/title.ts
└── cordis.yml
```

`scratch-title/src/title.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'

export const name = 'simple-title-provider'
export const inject = ['sessionTitle']

export function apply(ctx: Context): void {
  ctx.sessionTitle.register({
    id: SessionTitleProviderId('simple-title-provider'),
    automatic: 'first-prompt',
    async generate({ messages, signal }) {
      signal.throwIfAborted()
      const first = messages[0]
      if (first === undefined) throw new Error('没有可用的用户文本')
      const title = first.text.trim().split(/\s+/u).slice(0, 6).join(' ')
      signal.throwIfAborted()
      return { title, messageSeqs: [first.seq] }
    },
  })
}
```

`sessionTitle` Service 清理并限制最终标题的 UTF-8 字节数。若标题生成改为异步 I/O，操作过程中也要持续处理 `signal`，不能只在返回前检查。

`scratch-title/cordis.yml`：把路径改成当前 checkout 源码文件的绝对路径。目标 Profile 还需装载 `session-title` Service 及其依赖，并提供 `fallbackMaxWords`、`fallbackMaxBytes`、`maxTitleBytes`。

```yaml
- insert:
    - id: simple-title-provider
      name: '/absolute/path/to/deepseek-harness/scratch-title/src/title.ts'
```

## 装载与验证

在目标 checkout 运行 `pnpm dsh web --patch ./scratch-title/cordis.yml`。由用户输入一条文本，等待一次符合条件的主模型请求后观察标题；检查其 `session/title` 事件 `messageSeqs` 仅含首条文本 seq。尝试第二个 provider 应报重复注册；用户改名后自动标题应停止覆盖，显式 `refresh` 可重新生成。卸载插件后此 provider 不再被调用。
