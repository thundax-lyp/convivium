# Example：Client `/notes` 操作

本例展示目标 workspace 中插件的 Client 半侧；包 manifest、Host 空入口、`tsconfig`、`tsdown` 和 Web Profile 的完整组合沿用[Web 包示例](example-client-slot-contribution.md)，并把依赖/注入改为 `@deepseek-ai/dsh-client-ui-commands`。源码契约见[命令 UI](../api/api-client-commands.md)。装载后须在浏览器中核查命令出现、执行、取消和卸载。

## `src/client/index.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'

export const inject = ['commandUi']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.commandUi.register({
    name: 'notes',
    label: () => '打开笔记',
    description: () => '跳转到当前 Web 应用的笔记区域',
    available: () => true,
    ui: {
      kind: 'action',
      run: () => { window.location.hash = 'notes' },
    },
  }), 'example-notes: command')
}
```

`action` 不提交 Host 命令，也不替代持久操作。构建时将 `ui-commands` 加入 `devDependencies` 和 Client project references，真实 Profile 中须先加载 owner，再加载本包。输入 `/notes`、停用本包及切换 Session 检查出现、消失和可用性。
