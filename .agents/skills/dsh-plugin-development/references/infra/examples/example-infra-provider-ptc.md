# Example：固定 PTC 程序与 Host binding

此例验证公开 `resolve`/`run` 的消费路径，程序由插件固定，不接收用户代码。契约见 [PTC API](../api/api-infra-provider-ptc.md#ptcruntime)。

## 文件清单

```text
example-ptc-run/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-ptc-run",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": {
    "@deepseek-ai/dsh-ptc-runtime": "0.2.0-rc.2",
    "@deepseek-ai/dsh-tools": "0.2.0-rc.2"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'example-ptc-run'
export const inject = ['ptcRuntime', 'tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'example_ptc_sum',
    description: '在 PTC runtime 中调用固定加法 binding。',
    parameters: {},
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      if (ctx.ptcRuntime.language !== 'typescript') throw new Error('需要 TypeScript PTC runtime')
      const spec = ctx.ptcRuntime.resolve({
        program: 'return await math.add({ a: 1, b: 2 })',
        bindings: [{ global: 'math', functions: {
          async add(args) {
            if (!args || typeof args !== 'object' || args.a !== 1 || args.b !== 2) {
              throw new Error('无效参数')
            }
            return 3
          },
        } }],
        timeoutMs: 5000,
        signal: exec.signal,
      })
      const result = await ctx.ptcRuntime.run(spec)
      return { value: result.value ?? null, logs: result.logs, error: result.error ?? null }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-ptc-run
      name: example-ptc-run
      inject: [ptcRuntime, tools]
```

Profile 先装载 `@deepseek-ai/dsh-ptc-runtime-node` 与其依赖；在包目录执行 `npm pack`，以 `dsh plugin --profile <profile> add <tarball>` 安装。调用 `example_ptc_sum` 应得到 `value: 3` 且 `error: null`；取消或期限失败应出现在 `error.kind`。卸载后工具消失，runtime 自身应回收在途程序。
