# Web ingress

本 reference 提供 `dsh-v0.1.1-rc.2` 的入站 HTTP webhook 设计约束。

## rc.2 Webhook 接收器

### 可用性与支持的 primitive

`dsh-v0.1.1-rc.2` 没有 `dsh-webhook` 包、webhook registry 或 Provider API。不要把较新分支的 webhook API 复制进 rc.2 插件。rc.2 支持的扩展点是 Host WebServer Service：通过 `ctx.webServer.register()` 注册 exact/prefix HTTP route，并用 `ctx.effect()` 把返回 disposer 交给 plugin fiber。

`WebRoute.handler` 拥有完整 response 生命周期；WebServer 只匹配路由，并在 handler throw/reject 时记录 warning 后返回 `400` 或销毁已经发送 headers 的 response。它不提供 body limit、认证、signature、replay protection、payload schema 或 delivery acknowledgement。rc.2 的现有 route Consumer 是内部 HMR 与 Client bundle carrier，不能当作不可信 webhook 的安全模板。

### 设计要求

Webhook 插件必须在自己的代码中完成 rc.2 WebServer 没有提供的通用边界，不能只做 `JSON.parse()` 后把 `unknown` 交给同进程 listener：

1. exact route、允许的 HTTP method、content type 与 body byte limit；
2. 通过 Schemastery 或等价 parser 把 JSON 验证成具体 payload type；
3. 把验证后的中立 request 交给有明确 acceptance 语义的 Service；
4. 只在 acceptance 成功后返回 Provider 期望的 status。

外部 Provider 协议要求认证、signature、timestamp 或 replay window 时，实现并测试该协议规定的准确算法与失败行为。认证或签名使用 secret 时，Config 只保存 credential reference；插件注入 `credentials`，在每次请求开始时通过 `credentialRef()` 与 `ctx.credentials.resolve()` 读取当前值，使轮换影响下一次请求。Secret 不进入 log、error、Session event 或 Client projection。公开且无 secret 的协议不得为了套用模板而虚构 credential。

不要用裸 `ctx.emit()` 表示可靠交付。rc.2 的 `emit` 同步调用 listener：同步 throw 会冒泡，返回的 rejected Promise 不会被等待。若 observer failure 不应改变 acknowledgement，由拥有操作结果的 Service 先提交，再使用显式 containment 的通知；若所有处理必须完成后才能确认，Service method 返回 typed acceptance result。

### 必需证据

分别测试 route 生命周期、method/content type、过大 body、malformed JSON、schema failure、accepted delivery、同步与异步 observer failure，以及 response completion。协议要求认证、signature、timestamp、replay protection 或 secret rotation 时，再覆盖对应成功与失败路径。通过真实 Loader 在 port zero 安装 `dsh-host-webserver`；只有使用 credential seam 时才安装 Credential Provider。发送实际 HTTP request，并在 dispose 后证明 route 与 server connection 静默。
