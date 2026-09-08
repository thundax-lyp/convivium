# Web 搜索与抓取

本 reference 覆盖 `dsh-v0.1.2-rc.1` 的出站 Web 能力。外部系统主动投递 HTTP 使用 [Web ingress](web-ingress.md)。

## 条件补读

- 新 Provider 读[能力接缝](capability-seams-providers.md)；这不属于入站 Webhook 路径

## 接缝与选择

`ctx.web` 是搜索/抓取 Provider registry。Provider 通过 `registerSearchProvider()` 或 `registerFetchProvider()` 注册唯一 id，工具调用 Service 的 search/fetch；注册返回已绑定 effect 的 disposer。Provider-specific endpoint、认证、HTML/结果转换属于 Provider，tool 负责模型 schema、规范结果和纯展示。重复 Provider 与缺失选择显式失败，不让 Consumer 直接绕过 registry 发请求。

Base bundle 已选择 http fetch Provider 并设置 tool-web.fetch 为 true；Web 应用禁用对应 Host 工具行，改由 Agent presets 组合。更严格部署显式覆盖；sdk-minimal 等独立树不能由 base 推断。

Provider 收到调用 cancellation，必须把它传给 DNS/HTTP/body 读取并在完成或取消后释放连接资源。结果中的 URL、摘要、truncation、状态和引用均保持结构化；需要模型回放的信息进入 tool result，不在 renderer 重抓网页。

## 请求、选择与 Provider 差异

SearchRequest 只有 query/maxResults，不能发明统一 recency/domain/depth 参数；SearchResult 为可选 answer 与 sources，service 截 maxResults 并标 truncated。Fetch 返回 final URL/status/body/truncated，HTTP 非 2xx 可是正常 result，不是必然 throw；body closed union 没有 PDF arm，也不是网页抽取服务。

searchProvider/fetchProvider 可固定 id，否则恰好一个 usable Provider 才自动选；没有为 WEB_PROVIDER_UNAVAILABLE，多个为 WEB_PROVIDER_AMBIGUOUS，固定 id 缺失/不可用分别 CONFIGURED_MISSING/CONFIGURED_UNAVAILABLE（完整 code 带 WEB_PROVIDER_ 前缀）。Availability 是本地无网络检查，不按注册顺序挑第一个。没有 capability-status query/provider-change event。

内置 search 实现为 DeepSeek、Exa、Perplexity，endpoint/认证/结果投影归各自 Config，不把某 vendor 的 answer 当每个 Provider 都保证。Http fetch 是另一独立注册；有 search 不表示有 fetch。Tool-web 分别配置 search/fetch 启用及 timeout，策略不由 Provider id 猜测。

## HTTP Fetch 的网络边界

内置 `web-fetch-http` 只接受 HTTP(S)，拒绝带 credentials 的 URL。它解析完整地址集合，拒绝任何非公网 IPv4/IPv6 地址和映射到非公网 IPv4 的活动 DNS64/NAT64 地址；连接固定到已验证地址，不能二次解析绕过检查。每次同源重定向重新验证；跨源重定向需要新的工具调用。Provider 同时限制 redirects、bytes、characters 与时间。

公网目的地限制用于防止访问内部网络，不阻止向公网 URL 发送敏感内容。文件 sandbox 模式不负责 Web 网络策略。目标版本 shipped preset/profile 的实际 fetch 可用性由其组合决定；要求逐次确认的部署应增加 `tools/pre-execute` policy 或禁用 fetch，不能假定现有 approval mode 自动完成此事。

## 验证

验证重复/缺失 Provider、请求与结果转换、abort、dispose，以及模型结果重放。HTTP Provider 使用可控 resolver/transport 覆盖混合公网/私网结果、IPv6/NAT64、DNS 重绑定、同源多跳、跨源拒绝和 body/时间上限；普通插件开发不需要实际访问第三方服务。
