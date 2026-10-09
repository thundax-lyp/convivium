# Example：插件领域记录

本示例展示领域声明、构建、装载与后端组合。适用于未装载同名存储服务的 profile；随附 base/Web profile 已有存储行，不能重复插入。不要将上游 monorepo 的 `workspace:*` 复制进独立项目。

## 文件清单与代码

```text
example-notes/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
└── src/index.ts
```

`package.json`：

```json
{
  "name": "example-notes",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "exports": { ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" } },
  "files": ["lib", "cordis.patch.yml"],
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.4",
    "@deepseek-ai/dsh-storage-domain": "0.2.0-rc.2",
    "zod": "^4.4.3"
  },
  "peerDependencies": { "@deepseek-ai/dsh": "0.2.0-rc.2" },
  "devDependencies": { "typescript": "^6.0.3" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "declaration": true,
    "outDir": "lib",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

`src/index.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

const noteDomain = defineDomain({
  name: 'example_notes',
  version: 1,
  tables: {
    notes: domainTable<string, { text: string }>(z.object({ text: z.string() })),
  },
})

export const name = 'example-notes'
export const inject = ['storageDomain']

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(noteDomain)
  ctx.effect(() => () => domain.close(), 'example-notes.close')

  const notes = domain.table('notes')
  await notes.put('first', { text: '持久记录' })
  ctx.logger.info('saved note: %s', notes.get('first')?.text)
}
```

`cordis.patch.yml` 中的后端目录应按部署选择，以下以隔离数据目录为例：

```yaml
- insert:
    - id: storage
      name: '@deepseek-ai/dsh-storage'
    - id: storage-json
      name: '@deepseek-ai/dsh-storage-json'
      config:
        root: /absolute/path/to/isolated-data
    - id: storage-domain
      name: '@deepseek-ai/dsh-storage-domain'
      config:
        backend: json
    - id: example-notes
      name: example-notes
```

安装依赖后运行 `npm run build`、`npm pack`，再以 `dsh plugin --profile <name> add <tarball>` 安装到明确不含这组服务的自定义 profile。将 `root` 改为该部署的绝对持久目录。若目标 profile 已有存储服务，仅保留 `example-notes` 行，复用已有后端与领域层。打包前检查 `npm pack --dry-run` 确认 `lib/index.js` 与 patch 都在 tarball 内。

## 验证

在目标版本声明上编译，启动隔离 profile，检查日志和介质文件；卸载后再次启动并改为读取同键，期望得到 `持久记录`。故意配置不存在的后端应收到 `backend-not-found`，同名领域双开应收到 `already-open`。写入在 `await notes.put` 完成后才视为持久；该数据不会自动进入 Session 或模型上下文。
