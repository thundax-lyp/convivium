# Example：固定结果 LSP provider

此示例只验证扩展名路由与结果契约，不作真实代码分析。完整契约见 [LSP provider API](../api/api-infra-provider-lsp.md#lspprovider)。

## 文件清单

```text
example-lsp-provider/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-lsp-provider",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh-lsp": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
import { pathToFileURL } from 'node:url'
import { LspProviderId } from '@deepseek-ai/dsh-lsp'

export const name = 'example-lsp-provider'
export const inject = ['lsp']

export function apply(ctx) {
  ctx.lsp.registerProvider({
    id: LspProviderId('example-demo'),
    extensionToLanguage: { '.demo': 'demo' },
    async query(request, signal) {
      signal?.throwIfAborted()
      if (request.operation === 'hover') return { kind: 'hover', hover: null }
      return { kind: 'locations', locations: [], resolvedWorkspaceUri: pathToFileURL(request.workspaceRoot).href }
    },
  })
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-lsp-provider
      name: example-lsp-provider
      inject: [lsp]
```

Profile 先装载 `@deepseek-ai/dsh-lsp`；在包目录执行 `npm pack`，再以 `dsh plugin --profile <profile> add <tarball>` 安装。以 `.demo` 文件、零基位置调用 `ctx.lsp.query`：`hover` 应返回 `null`，其他操作返回空 `locations`；未知扩展名应报 `LSP_UNAVAILABLE`。卸载后 `.demo` 路由也消失。此示例的工作区 URI 仅供注册烟测，真实 provider 必须规范化工作区目标并维护查询资源。
