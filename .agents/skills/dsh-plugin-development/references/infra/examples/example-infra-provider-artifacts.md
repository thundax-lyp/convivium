# Example：保存文本 spill 与不可变文件

前置：Profile 有 `ctx.spillStore`、`ctx.attachments` 与 `ctx.tools` 的具体实现。契约见 [存储 API](../api/api-infra-provider-artifacts.md#spillstore)。

## 文件清单

```text
example-artifact-save/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-artifact-save",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": {
    "@deepseek-ai/dsh-spill": "0.2.0-rc.2",
    "@deepseek-ai/dsh-attachment": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'example-artifact-save'
export const inject = ['spillStore', 'attachments', 'tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_save_artifact',
    description: '保存一份小文本并返回两种持久引用。',
    parameters: { text: { type: 'string', required: true, description: '待保存文本' } },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('需要 Agent 所属 Session')
      exec.signal.throwIfAborted()
      const spill = await ctx.spillStore.saveText({
        owner: { sessionId: exec.agent.id },
        source: { kind: 'tool', toolName: 'example_save_artifact', callId: exec.callId, label: 'result' },
        suggestedName: 'example.txt',
        content: args.text,
      })
      exec.signal.throwIfAborted()
      const file = await ctx.attachments.saveFile({
        data: new TextEncoder().encode(args.text), name: 'example.txt',
      })
      return {
        spill: { locator: spill.locator, bytes: spill.bytes, retrievalHint: spill.retrievalHint },
        file: { attachmentId: file.attachmentId, bytes: file.bytes, name: file.name },
      }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-artifact-save
      name: example-artifact-save
      inject: [spillStore, attachments, tools]
```

在包目录执行 `npm pack`，以 `dsh plugin --profile <profile> add <tarball>` 安装。调用 `example_save_artifact` 应得到 spill 与文件引用；重启后用后端公开读取路径核对完整字节，存储失败不得出现成功结果。若 spill 已成功而附件失败，这两个独立 Service 没有跨服务事务；生产插件须记录或清理孤立 spill。此结果在工具日志中可见，不等同于把附件加入用户消息。
