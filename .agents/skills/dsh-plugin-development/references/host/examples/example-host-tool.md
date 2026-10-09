# Example：本地 Host 模型工具

本例针对 DSH `0.2.0-rc.2` 的源码 checkout，使用其公开的 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools` 类型和 `pnpm dsh web --patch` 装载方式。它是本地开发切片；独立发布的 npm bundle 需要另行提供 `package.json`、构建产物和 `dsh.bundle` patch。对象契约见 [Host 模型工具对象](../api/api-host-tools.md)，操作顺序见 [注册模型工具](../how-to/how-to-host-tool.md)。

## 文件清单

在目标 checkout 根目录新建：

```text
scratch-plugin/
├── src/greet.ts
└── cordis.yml
```

依赖由本次精确 checkout 的 workspace 提供；不在示例中使用另一版本的包。`scratch-plugin/src/greet.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: '按姓名返回一句问候。',
    parameters: {
      name: { type: 'string', required: true, description: '要问候的姓名' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('调用已取消')
      const who = args.name.trim()
      if (!who) throw new Error('姓名不能为空')
      return `你好，${who}！`
    },
  }))
}
```

这个工具没有外部资源；注册函数由 Cordis fiber 持有，卸载时自动清理。`execute` 同步完成主体计算，但仍检查调用方的取消信号；实际 I/O 必须在进行中继续响应取消。`render` 是规范字符串到模型文本的纯投影。成功值就是字符串；不需要从模型文本中反解析字段。

`scratch-plugin/cordis.yml` 中的 `name` 使用 checkout 内 `scratch-plugin/src/greet.ts` 的**绝对路径**；用当前 checkout 的 `pwd` 替换占位符：

```yaml
- insert:
    - id: greet
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/greet.ts'
```

## 装载与验证

在目标 checkout 根目录运行：

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

打开该 Profile 的 Web 页面，输入“使用 greet 工具问候 Ada”。完成判据：模型请求出现 `greet` 工具 schema，调用参数为 `{"name":"Ada"}`，工具结果内容为 `你好，Ada！`。输入空白姓名时，应看到工具失败结果；中止调用时，不应产生成功问候。移除 patch 并重新启动后，`greet` 不应再出现在可见工具集合中。这个最小例子没有持久状态，重启后也不应恢复任何旧问候。若要验证独立消费包，须改用发布 bundle 的安装与 Profile 装载流程，不能把本地 TS 路径当作 npm 包路径。
