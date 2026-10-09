# Example：独立 HTTP 路由插件

前置：目标 Web Profile 已挂载 `@deepseek-ai/dsh-host-webserver`。此例注册只读健康端点，不把任何私密状态返回给调用者。完整契约见 [WebServer](../api/api-infra-webserver.md#webserver)。

## 文件清单

```text
example-health-route/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-health-route",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-health-route'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/example-health',
    handler(req, res) {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' })
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    },
  }))
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-health-route
      name: example-health-route
      inject: [webServer]
```

在包目录运行 `npm pack`，以 `dsh plugin --profile <web-profile> add <tarball>` 安装；确认 profile 已有 WebServer。启动后请求 `/example-health` 应得 200 JSON，POST 应得 405。卸载插件后该具名路由消失。生产路由若暴露数据，应自行加鉴权与输入边界；此示例仅公开固定健康值。
