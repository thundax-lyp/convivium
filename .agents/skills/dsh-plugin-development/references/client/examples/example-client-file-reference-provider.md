# Example：单层文件引用 Provider

此例在目标 `0.2.0-rc.2` workspace 内演示 Host `FileReferenceService` 替换点，只搜索当前 Agent cwd 的第一层文件和目录。它不是完整文件搜索产品，也未在独立消费包编译。操作与组合边界见[文件引用 Provider](../how-to/how-to-client-file-reference-provider.md)。

## 文件清单

新增一个 Host 插件包，包含 `package.json` 与 `src/index.ts`；目标 Profile 装载其裸包名，并停用 `@deepseek-ai/dsh-file-reference-local` 的对应行。保留 Session Controller 的 fileReferences Remote adapter 与 Web `ui-reference`。

### `package.json`

```json
{
  "name": "@example/dsh-file-reference-flat",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:~",
    "@deepseek-ai/dsh-agent": "workspace:*",
    "@deepseek-ai/dsh-file-reference": "workspace:*"
  }
}
```

### `src/index.ts`

```ts
import { readdir } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import FileReferenceService, { type FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'

/** 示例仅枚举当前工作目录一层，不遍历下级目录。 */
export default class FlatFileReferences extends FileReferenceService {
  constructor(ctx: Context) { super(ctx) }

  async list(agent: Agent, query: string, signal: AbortSignal): Promise<FileReferenceCandidate[]> {
    signal.throwIfAborted()
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return []
    const entries = await readdir(cwd, { withFileTypes: true })
    signal.throwIfAborted()
    const needle = query.toLocaleLowerCase()
    return entries
      .filter(entry => (entry.isFile() || entry.isDirectory()) && entry.name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
      .map(entry => ({ path: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }))
  }
}
```

## 装载与验证

在目标 workspace 使用其 Host 构建流程产生 `lib/index.js` 与声明；将裸包名加入目标 Host Profile，确认 `ctx.fileReferences` 只有一个 provider。运行 Host 搜索测试检查不同 cwd、排序、目录、取消和错误；随后在真实 Web Profile 输入 `@`，确认 `remote.fileReferences.list` 经 Session Controller 返回候选。示例对超大目录没有有界扫描，不能作为生产实现；生产环境应沿用目标 `file-reference-local` 的条目上限/索引策略或加入等效限制。
