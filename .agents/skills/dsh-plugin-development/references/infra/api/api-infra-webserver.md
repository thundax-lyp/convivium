# Host HTTP 路由

## WebServer

**公开导出**：`WebServer` 来自 `@deepseek-ai/dsh-host-webserver`。
`@deepseek-ai/dsh-host-webserver` 的默认插件提供 `ctx.webServer`；它监听 `host: '127.0.0.1' | '0.0.0.0'` 与 `port: number`，端口 `0` 由系统分配。默认只应使用回环地址；监听全网时，服务本身不提供 TLS、认证或来源策略，具体路由 owner 必须承担这些边界。Electron 的 Web 内容使用 `file://` 与 IPC，此服务器不是它的通用文件服务器。

`register(route: WebRoute)` 注册 HTTP 路由，`registerUpgrade(route: WebUpgradeRoute)` 注册 WebSocket 等升级路由，`registerFallback(handler)` 认领唯一未命中回退席位；三者返回 disposer，插件须交给自己的 effect。精确路径优先，其次最长前缀，再回退。重复具名路径或重复 fallback 会报错。HTTP handler 拥有响应完整生命周期；抛错时还未写 header 的响应变成 400，已写 header 时销毁 socket。升级 handler 自行完成握手与 socket 清理。

首页 HTML 扩展有四个公开成员。`tapIndex(transform: (html: string) => string): () => void` 注册纯 HTML 变换并返回移除函数；变换按注册顺序运行，错误会传播给调用者。`collectIndexInjections(): IndexInjection[]` 每次发出一次 `webserver/index-inject` 事件，按订阅者激活顺序收集当前结构化注入行；它本身不渲染 HTML。`applyIndexTaps(html: string): string` 只应用原始变换。`renderIndex(html: string): string` 先渲染本次收集的结构化注入，再应用原始变换。fallback owner 应对每次 index 响应调用 `renderIndex`；插件注册 tap 后仍须确保自己的 disposer 在卸载时执行，且输出 HTML 的安全性由 transform owner 负责。

## WebRoute

`WebRoute` 包含 `kind: 'exact' | 'prefix'`、无尾斜杠的绝对 `path` 和 `(req, res) => void | Promise<void>` handler。`prefix` 匹配本身及其下级路径，不能靠注册先后赢过同路径的 exact。路由用途、鉴权和返回 body 均由注册它的插件负责。

## WebUpgradeRoute

`WebUpgradeRoute` 只有绝对 `path` 和 `(req, socket, head) => void | Promise<void>` handler，始终精确匹配。未命中的 upgrade socket 被关闭；插件必须处理协议协商、错误与释放。

对象证据：`packages/host/webserver/src/index.ts`、`packages/host/webserver/tests/`、`packages/host/webserver/README.zh.md`。最小 HTTP route 见[HOW-TO](../how-to/how-to-infra-http-route.md#给-web-profile-添加具名-http-路由)。`/api` 已由 Gateway/Connection 的 Remote 运输占用，新增业务 Remote 不通过这里直接注册同名路径。
