# Example：通过 FileSystem 读取文本

这是消费已有 `ctx.fs` 后端的只读插件；自建后端的全部抽象成员见 [FileSystem API](../api/api-infra-provider-fs.md#filesystem)。工具输出结构遵守 [Host Tool](../../host/api/api-host-tools.md)。

## 文件清单

```text
example-fs-reader/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-fs-reader",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": {
    "@deepseek-ai/dsh-fs": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'example-fs-reader'
export const inject = ['fs', 'tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_read_text',
    description: '读取一个普通 UTF-8 文本文件。',
    parameters: { path: { type: 'string', required: true, description: '要读取的文件路径' } },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted()
      const target = await ctx.fs.resolve(args.path, { signal: exec.signal })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info?.type !== 'file') throw new Error('路径不是普通文件')
      return ctx.fs.readText(target, exec.signal)
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-fs-reader
      name: example-fs-reader
      inject: [fs, tools]
```

Profile 先装载 `@deepseek-ai/dsh-fs-local` 或其他 `FileSystem` 后端及 `@deepseek-ai/dsh-tools`；在包目录执行 `npm pack`，再以 `dsh plugin --profile <profile> add <tarball>` 安装。调用 `example_read_text` 读取受信任的测试文本文件应返回其完整内容；不存在或非普通文件应失败，取消不产生成功结果。卸载后该工具消失。生产用途还需按自己的信任边界限制可读路径；`cwd` 只是相对路径基准，不是沙箱。
