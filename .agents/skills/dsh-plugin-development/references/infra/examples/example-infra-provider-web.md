# Example：固定结果 Web 搜索 provider

此示例只验证 Host provider 注册与选择。完整契约见 [Web provider API](../api/api-infra-provider-web.md#websearchprovider)；安装路径见 [Profile HOW-TO](../how-to/how-to-infra-profile-bundle.md)。

## 文件清单

```text
example-web-search/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-web-search",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh-web": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-web-search'
export const inject = ['web']

export function apply(ctx) {
  ctx.web.registerSearchProvider({
    id: 'example-static',
    available: () => true,
    async search(request, signal) {
      signal?.throwIfAborted()
      return {
        sources: [{ url: 'https://example.com/', title: `Example: ${request.query}` }],
        truncated: false,
      }
    },
  })
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-web-search
      name: example-web-search
      inject: [web]
```

Profile 先装载 `@deepseek-ai/dsh-web`；在包目录执行 `npm pack`，再以 `dsh plugin --profile <profile> add <tarball>` 安装。用 `ctx.web.search({ query: 'probe', maxResults: 1 })` 应得到一条 `example.com` source；设置 `searchProvider: example-static` 可显式选中。传入已取消的信号应拒绝；卸载插件后显式选择该 id 应报 `WEB_PROVIDER_CONFIGURED_MISSING`。模型使用还需 `@deepseek-ai/dsh-tool-web`；此处固定数据不是网络搜索实现。
