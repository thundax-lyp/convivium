# Example：一次性 PTY 命令

前置：Profile 已装载 `@deepseek-ai/dsh-terminal`、`@deepseek-ai/dsh-terminal-bash`（默认 backend type 为 `shell`）、其 subprocess 依赖和 `@deepseek-ai/dsh-tools`。契约见 [Terminal API](../api/api-infra-provider-terminal.md#terminalsessionservice)。

## 文件清单

```text
example-pty-pwd/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-pty-pwd",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": {
    "@deepseek-ai/dsh-terminal": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { TerminalError } from '@deepseek-ai/dsh-terminal'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'example-pty-pwd'
export const inject = ['terminals', 'tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_pty_pwd',
    description: '在一次性 PTY 会话中运行 pwd。',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      if (!exec.agent) throw new Error('需要 Agent owner')
      const owner = exec.agent
      const opened = await ctx.terminals.spawn(owner, { type: 'shell' }, exec.signal)
      try {
        const sent = ctx.terminals.startSend(owner, opened.sessionId, {
          text: 'pwd', submit: true, signal: exec.signal,
        })
        const result = await sent.done
        return {
          viewport: result.viewport,
          waitReason: result.waitReason,
          status: result.sessionStatus,
          truncated: result.truncated,
        }
      } finally {
        try {
          await ctx.terminals.kill(owner, opened.sessionId, 'example complete')
        } catch (error) {
          if (!(error instanceof TerminalError && error.code === 'NO_SESSION')) throw error
        }
      }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-pty-pwd
      name: example-pty-pwd
      inject: [terminals, tools]
```

在包目录执行 `npm pack`，以 `dsh plugin --profile <profile> add <tarball>` 安装。Agent 调用 `example_pty_pwd` 后应看到 viewport，随后 `ctx.terminals.list(owner)` 不含该 session。取消时也必须进入 `finally` 并等待关闭；无 Agent 调用应拒绝。真实后端的前台组与进程树行为仍需平台测试。
