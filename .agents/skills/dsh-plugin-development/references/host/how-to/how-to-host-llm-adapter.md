# Host 模型后端任务

## 接入一个新的 LLM Provider

目标是让 Agent 通过新 provider route 发出模型请求，并可在目标 UI 发现支持的模型。Profile 需装载 `@deepseek-ai/dsh-llm`，插件声明 `inject = ['llm']`。对象契约见 [LlmAdapter、LlmRuntime 与注册句柄](../api/api-host-llm.md)。目标版本的完整 `StreamChunk` 协议以 `@deepseek-ai/dsh-llm` 声明为准，不能只凭本 HOW-TO 拼出后端。

### 实现步骤

1. 实现 `LlmAdapter.stream(options)` 的 async iterable；序列化目标 provider 请求，传递 `options.signal`，把 wire 响应转换成目标版本的 `StreamChunk`。任何不可支持的请求字段应显式拒绝，不能忽略。
2. 发送每个 provider HTTP 请求时加入 `attributionHeaders()`。按目标声明顺序输出块、usage 和 finish；传输失败抛带稳定 code 的 `LlmError`，provider 带内失败以相应 finish 分支结束，避免双重结算。
3. 实现 `resolveModel()` 给准确的模型能力、上下文与 reasoning 信息；如 UI 需要选择模型，实现 `listModels()`。动态连接设置会在准备与发送间变化时，覆盖 `prepareCall()` 绑定同一 adapter generation。
4. 在 `apply(ctx, config)` 中调用 `ctx.llm.registerAdapter(['provider-name'], adapter)`；重复 route 会失败，随 fiber 卸载清理。凭证来源经 Schema 校验与 Profile 配置注入，不要在示例中硬编码密钥。

### 验证与完成边界

用脚本化传输验证正常流、usage/finish 顺序、工具调用 JSON 字符串、取消、HTTP 故障及不支持选项；再在隔离 Profile 中选择该 route 发一次真实请求，核查归因头、模型可见输出和重启后装载。
