# Example：受限 `pwd` 工具

前置：Profile 已装载同一执行世界的 `ctx.subprocess`、`ctx.sandbox` 与 sandbox 版 `ctx.shell`，并启用 `ctx.tools`。契约见 [执行 API](../api/api-infra-provider-execution.md#shellexecutor)。

## 文件清单

```text
example-confined-pwd/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-confined-pwd",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": {
    "@deepseek-ai/dsh-shell": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'example-confined-pwd'
export const inject = ['shell', 'tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_confined_pwd',
    description: '在只读 sandbox 中显示当前工作目录。',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      const cwd = process.cwd()
      const spec = ctx.shell.resolve({
        command: 'pwd',
        workdir: cwd,
        timeoutMs: 5000,
        onExpiry: 'kill',
        stdoutMaxBytes: 4096,
        signal: exec.signal,
        sandboxPolicy: { mode: 'read-only', workspaceRoot: cwd },
      })
      const processHandle = await ctx.shell.execute(spec)
      const result = await processHandle.result()
      return {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        aborted: result.aborted,
        stdout: result.stdout.text,
        stderr: result.stderr.text,
        truncated: result.stdout.truncated || result.stderr.truncated,
        sandbox: result.sandbox ?? null,
      }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-confined-pwd
      name: example-confined-pwd
      inject: [shell, tools]
```

在包目录执行 `npm pack`，以 `dsh plugin --profile <profile> add <tarball>` 安装。调用 `example_confined_pwd` 应得到工作目录、`exitCode: 0` 和 sandbox 信息；服务不可用、取消或超时应按各自契约呈现。卸载插件后工具消失。该固定命令不验证隔离强度；另用目标 OS 的写入与进程树测试核查。
