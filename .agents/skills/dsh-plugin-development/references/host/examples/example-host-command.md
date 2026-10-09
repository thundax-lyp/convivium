# Example：本地 Host 斜杠命令

本例针对 DSH `0.2.0-rc.2` 的源码 checkout，演示 Host 命令注册与本地 `--patch`。对象契约见 [Host 命令对象](../api/api-host-commands.md)，任务步骤见 [注册 Host 命令](../how-to/how-to-host-command.md)。该命令无外部资源或跨重启领域状态；框架的 `command/run` 和 `command/done` 事件提供调用审计。

## 文件清单

```text
scratch-command/
├── src/hello.ts
└── cordis.yml
```

`scratch-command/src/hello.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'

export const name = 'hello-command'
export const inject = ['commands']

export function apply(ctx: Context): void {
  ctx.commands.register({
    name: 'hello',
    description: '按姓名返回问候。',
    input: { hint: '姓名' },
    handler({ rawInput, signal }) {
      if (signal.aborted) return { kind: 'error', text: '调用已取消' }
      const who = rawInput.trim()
      if (!who) return { kind: 'error', text: '请提供姓名' }
      return { kind: 'success', text: `你好，${who}！` }
    },
  })
}
```

注册和注销由所属 Cordis fiber 管理。handler 同步完成；若改为异步 I/O，必须在运行中持续观察 `signal`。成功文本直接给命令 UI，命令不会作为模型工具发送。

`scratch-command/cordis.yml`：把 `name` 改成当前 checkout 中源码文件的绝对路径。

```yaml
- insert:
    - id: hello-command
      name: '/absolute/path/to/deepseek-harness/scratch-command/src/hello.ts'
```

## 装载与验证

在目标 checkout 根目录运行：

```sh
pnpm dsh web --patch ./scratch-command/cordis.yml
```

打开支持命令的交互页面，确认 `/hello` 出现在命令列表，输入 `/hello Ada` 后应显示 `你好，Ada！`。输入 `/hello` 无姓名应得到错误。`command/run` 与 `command/done` 必须按同一 `commandId` 配对；移除 patch 并重新启动后命令应从列表消失。独立 npm bundle 仍需发布 manifest、构建与 Profile 安装验证，不能直接使用源码绝对路径。
