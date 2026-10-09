# Example：自定义 Profile 参数

本例给自定义 profile 增加 `--port`，由启动行解析并发布服务，HTTP 服务行消费它。目标版本包导出见 [CmdlineArgs](../api/api-infra-cmdline.md#cmdlineargs)。

`package.json`：

```json
{
  "name": "example-app-args",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { "./startup": "./startup.mjs" },
  "files": ["startup.mjs", "cordis.patch.yml"],
  "dependencies": {
    "@deepseek-ai/dsh-cmdline": "0.2.0-rc.2",
    "@deepseek-ai/dsh-host-webserver": "0.2.0-rc.2",
    "commander": "^15.0.0"
  },
  "peerDependencies": { "@deepseek-ai/dsh": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`startup.mjs`：

```js
import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

export const name = 'example-app-args'
export const inject = ['cmdlineArgs']

export function apply(ctx) {
  const program = new Command().name('dsh --profile demo')
    .option('--port <port>', 'HTTP 监听端口')
  program.action(() => {
    const raw = program.opts().port
    if (raw !== undefined && !/^(0|[1-9][0-9]*)$/.test(raw)) {
      program.error('error: --port must be a non-negative integer')
    }
    const port = raw === undefined ? 3080 : Number(raw)
    if (port > 65535) program.error('error: --port must be <= 65535')
    ctx.provide('exampleArgs', { port })
  })
  parseCmdline(ctx, program)
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-app-args
      name: example-app-args/startup
    - id: example-http-server
      name: '@deepseek-ai/dsh-host-webserver'
      inject: [exampleArgs]
      config:
        host: 127.0.0.1
        port: !!js ctx.exampleArgs.port
```

运行 `npm pack` 并用 `dsh plugin --profile demo add <tarball>` 安装到不含 WebServer 的自定义 base profile。`dsh --profile demo --port 0` 应由系统分配端口；`--help` 应打印应用帮助并正常退出；`--port no` 应非零退出且不激活 HTTP 行。这个示例只验证参数流转，未注册业务 HTTP route；如需路由见[HTTP route 示例](example-infra-http-route.md)。
