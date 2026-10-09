# Host HTTP 扩展

## 给 Web Profile 添加具名 HTTP 路由

让外部调用方经可观察的 URL 访问一个插件自有 HTTP route。目标组合须已有 `@deepseek-ai/dsh-host-webserver`；路由会在 Host 侧运行。先读 [WebServer 与路由契约](../api/api-infra-webserver.md#webserver)。

### 实现步骤

1. 在 Host 插件声明 `inject = ['webServer']`，使用 `ctx.webServer.register({ kind: 'exact', path, handler })`；在 `ctx.effect` 中持有 disposer。完整包和请求断言见[示例](../examples/example-infra-http-route.md)。
2. 在 handler 中验证方法、鉴权与输入，明确设置状态、Content-Type 并结束响应。路由服务不会替业务做认证或 TLS。
3. 通过 profile patch 装载包。避开已经由 Gateway、Client 模块或其他插件认领的路径；重复 route 会在注册时失败。

### 验证与完成边界

启动 Web Profile 后请求该 URL，检查正常和不允许的方法；卸载插件后应由回退处理或返回 404。监听 `0.0.0.0` 的部署另核验代理 TLS、鉴权与可到达范围。若目标是 Client 调 Host 类型化业务方法，应转用 Remote 主题。
