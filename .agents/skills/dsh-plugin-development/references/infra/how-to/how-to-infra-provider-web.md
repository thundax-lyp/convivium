# Web provider 插件

## 注册可用的 Web 搜索 provider

目标是在 Host 的 `ctx.web` 注册一个可被现有 Web 工具选择的搜索后端。目标版本为 `dsh-v0.2.0-rc.2`。Profile 须先装载 `@deepseek-ai/dsh-web`；模型使用还需 `@deepseek-ai/dsh-tool-web`。对象签名、选择规则和结果形状以 [Web provider API](../api/api-infra-provider-web.md#webruntime) 为准。

### 实现步骤

1. 创建有包 manifest、入口和 `cordis.patch.yml` 的 Host 插件；完整文件见 [example-infra-provider-web](../examples/example-infra-provider-web.md)。声明 `inject = ['web']`。
2. 在 `apply(ctx)` 中注册稳定 `id` 的 `WebSearchProvider`。`available()` 只做本地检查；`search` 处理调用者的 `AbortSignal`，返回含 `sources`、`truncated` 的规范结果。真实网络实现需自行处理凭据、超时、供应方错误与引用 URL 的合法性。
3. 让注册属于插件 fiber；卸载时调用者的 effect 释放 provider。若同时装载多个可用搜索 provider，通过 `WebRuntime` 的 `searchProvider` 配置或 `DSH_WEB_SEARCH_PROVIDER` 选定 id。
4. 将包安装到目标 Profile 并重启或热装载。直接调用 `ctx.web.search`，再让模型通过 Web 工具查询，分别观察服务结果与模型可见结果。

### 验证与完成边界

核对目标版本包导出和 Host 声明编译；装载后确认同 id 重复注册报 `WEB_DUPLICATE_PROVIDER`，没有配置而同时存在两个可用 provider 报 `WEB_PROVIDER_AMBIGUOUS`。取消在 provider 中生效；卸载后不得继续选到该 id。示例返回固定数据，只验证注册与路由，不代表真实搜索网络连通或结果可信。
