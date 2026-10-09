# Web 搜索与抓取 provider

## 对象关系与使用场景

Host 的 `@deepseek-ai/dsh-web` 提供 `ctx.web` 服务；搜索和抓取各有 provider 注册表，共享选择规则。插件作者实现 `WebSearchProvider` 或 `WebFetchProvider`，再从依赖 `web` 的插件 `apply` 中注册。`@deepseek-ai/dsh-tool-web` 是模型可见的消费者，provider 自身没有独立 UI。注册任务见[HOW-TO](../how-to/how-to-infra-provider-web.md#注册可用的-web-搜索-provider)。

## WebRuntime

`WebRuntime` 是默认导出的 Service。`registerSearchProvider(provider: WebSearchProvider): () => void` 与 `registerFetchProvider(provider: WebFetchProvider): () => void` 按 `id` 注册并返回注销函数；注册与调用者 fiber 的 effect 生命周期绑定。同类重复 `id` 抛 `WebError`，代码为 `WEB_DUPLICATE_PROVIDER`。

`search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>` 与 `fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>` 在调用时选择 provider。若指定 `id`，必须已注册且 `available()` 为真；未指定时必须恰有一个可用 provider。缺失、不可用或多于一个分别抛 `WEB_PROVIDER_CONFIGURED_MISSING`、`WEB_PROVIDER_CONFIGURED_UNAVAILABLE`、`WEB_PROVIDER_UNAVAILABLE`、`WEB_PROVIDER_AMBIGUOUS`。provider 失败可携带其他 `WebError.code`，消费者不能只按这几个值穷举。

## WebRuntimeConfig

**公开导出**：`WebRuntimeConfig` 来自 `@deepseek-ai/dsh-web`。
配置有可选 `searchProvider?: string`、`fetchProvider?: string`；`DSH_WEB_SEARCH_PROVIDER`、`DSH_WEB_FETCH_PROVIDER` 分别是同字段的环境来源。没有配置时，选择规则见上节。

## WebSearchProvider

`WebSearchProvider` 要求稳定唯一的 `id`、不发网络请求的 `available(): boolean`、遵守取消信号的 `search(request, signal)`。

## WebSearchRequest

**公开导出**：`WebSearchRequest` 来自 `@deepseek-ai/dsh-web`。
请求包含 `query: string` 和可选 `maxResults: number`。provider 若可控制上游条数，应在请求阶段限制成本。

## WebSearchResult

**公开导出**：`WebSearchResult` 来自 `@deepseek-ai/dsh-web`。
结果含 `sources: readonly WebSearchSource[]`、`truncated: boolean` 和可选 `content`；source 必有 `url`，可有 `title`、`snippet`、`publishedAt`。`WebRuntime.search` 会在 provider 超量返回时裁剪 `sources` 并设 `truncated: true`。

## WebFetchProvider

`WebFetchProvider` 有同样的 `id`、`available()` 和取消要求；`fetch(request, signal)` 实现安全检索。抓取 provider 必须自行落实 URL、重定向、资源大小与内容类型边界；参考目标版本 `web-fetch-http` 实现。

## WebFetchRequest

**公开导出**：`WebFetchRequest` 来自 `@deepseek-ai/dsh-web`。
请求只含 `url: string`。超时、取消和内容格式不从这个对象传入；取消走独立 `signal` 参数。

## WebFetchResult

**公开导出**：`WebFetchResult` 来自 `@deepseek-ai/dsh-web`。
结果包含最终 `url`、`statusCode`、`body`、`truncated`。`WebFetchBody` 只允许 `{ kind: 'html' | 'text', content: string }` 两种结果。HTTP 非 2xx 是带状态码的成功检索结果；无法安全检索或表示资源才抛 `WebError`。

## 装载、失败与验证

先在 Profile 中装载 `@deepseek-ai/dsh-web`，随后装载依赖 `web` 的 provider 插件；要供模型使用，还需装载 `@deepseek-ai/dsh-tool-web`。同类多个可用 provider 时设置选中 `id`。使用公开 `ctx.web.search`/`fetch` 直接验证成功、缺失、取消和注销后的行为；模型调用另测工具注册与呈现。单次检索不产生由 seam 恢复的持久状态。
