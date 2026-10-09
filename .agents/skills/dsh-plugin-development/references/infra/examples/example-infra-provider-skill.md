# Example：进程内虚拟 Skill provider

完整契约见 [Skill provider API](../api/api-infra-provider-skill.md#skillprovider)。示例固定正文，供注册与加载烟测。

## 文件清单

```text
example-skill-provider/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-skill-provider",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh-skill": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-skill-provider'
export const inject = ['skills']

const summary = {
  name: 'example-checklist',
  description: '用于演示按需加载的检查清单。',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'example-skill-provider',
  source: 'custom',
  resourceBase: { kind: 'opaque', description: '正文由当前插件内存提供。' },
}

export function apply(ctx) {
  ctx.skills.registerProvider(() => ({
    name: 'example-skill-provider',
    async list(options) {
      options.signal?.throwIfAborted()
      return [{ ...summary, rank: 300, locator: 'fixed-v1' }]
    },
    async get(candidate, options) {
      options.signal?.throwIfAborted()
      if (candidate.locator !== 'fixed-v1') return undefined
      return { ...summary, content: '# 检查清单\n\n先确认目标，再记录验证结果。' }
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-skill-provider
      name: example-skill-provider
      inject: [skills]
```

Profile 先装载 `@deepseek-ai/dsh-skill`；在包目录执行 `npm pack`，再以 `dsh plugin --profile <profile> add <tarball>` 安装。`ctx.skills.list()` 应有 `example-checklist`，`ctx.skills.get('example-checklist')` 应返回正文；模型读取还需 `@deepseek-ai/dsh-tool-skill`。卸载后两个入口都不再返回此 Skill。该示例不写磁盘，重启只在插件重新装载时重新注册。
