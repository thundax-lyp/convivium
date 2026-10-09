# Example：固定 MCP 资源 provider

这个 Host 插件公开一份只读资源，供共享工具验证注册路径。对象契约见 [MCP resource API](../api/api-infra-provider-mcp-resources.md#mcpresourceprovider)。

## 文件清单

```text
example-mcp-resources/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-mcp-resources",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh-mcp-resources": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-mcp-resources'
export const inject = ['mcpResources']

const uri = 'example://guide'

export function apply(ctx) {
  ctx.mcpResources.register('example', {
    async request(request, exec) {
      exec.signal.throwIfAborted()
      if (request.method === 'resources/list') {
        return { resources: [{ uri, name: 'Example guide', mimeType: 'text/plain' }] }
      }
      if (request.method === 'resources/templates/list') return { resourceTemplates: [] }
      if (request.uri !== uri) throw new Error('unknown example resource URI')
      return { contents: [{ uri, mimeType: 'text/plain', text: 'Example guide body.' }] }
    },
  })
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-mcp-resources
      name: example-mcp-resources
      inject: [mcpResources]
```

Profile 先装载 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-mcp-resources`；在包目录执行 `npm pack`，再以 `dsh plugin --profile <profile> add <tarball>` 安装。调用 `list_mcp_resources`，参数 `{"server":"example"}`，应看到 `example://guide`；`read_mcp_resource` 加 `uri` 应见正文。未知 URI 应报错，卸载后 server 与共享工具（若无其他 provider）消失。例子只用固定内存数据，不接外部 MCP server。
