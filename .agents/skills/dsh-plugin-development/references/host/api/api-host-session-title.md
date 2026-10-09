# Host 会话标题对象

适用 `@deepseek-ai/dsh-session-title@0.2.0-rc.2`。标题是 `session/title` 日志事实及 Client 投影视图，不进入模型消息。Service 本身有确定性首条用户文本回退；插件可注册一个异步 provider。见 [注册标题 provider](../how-to/how-to-host-session-title.md)。

## SessionTitleService

**公开导出**：`SessionTitleService` 来自 `@deepseek-ai/dsh-session-title`。
`ctx.sessionTitle.get(session)` 读取最新日志折叠标题；`rename(session, title)` 接受用户显式标题并钉住自动更新；`refresh(session, signal?)` 显式再生成或回退，允许有意解除钉住。`register(provider)` 只允许一个 provider，返回异步 disposer：注销时取消且等待当前工作停稳，之后才可注册另一 provider。服务需要 `sessions` 与 `sessionProjections`；三个配置上限 `fallbackMaxWords`、`fallbackMaxBytes`、`maxTitleBytes` 都必须提供。

## SessionTitleProvider

**公开导出**：`SessionTitleProvider` 来自 `@deepseek-ai/dsh-session-title`。
provider 声明稳定 `id`、自动模式 `first-prompt` 或 `all-prompts`，并实现异步 `generate(request)`。新用户文本、用户改名、显式 refresh、Session/插件卸载会让较旧生成失效；实现应观察 `request.signal`。只从 `request.messages` 选择输入，不读取无关模型上下文或隐含全局状态。

以下成员是该对象的公开契约：

- `automatic: SessionTitleAutomaticMode`：声明 provider 支持的自动标题模式，供调度端选择。

## SessionTitleProviderRequest

**公开导出**：`SessionTitleProviderRequest` 来自 `@deepseek-ai/dsh-session-title`。
`messages` 是此次可用的用户文本及各自 seq；`route` 是已记录的主模型请求路线（可能不存在）；`session` 是当前实例，`signal` 管理取消。自动生成只在目标版本验证过的 loop-built 请求路线与 `request/header` 匹配后调度，普通用户消息不保证立即调用 provider。

## SessionTitleProviderResult

**公开导出**：`SessionTitleProviderResult` 来自 `@deepseek-ai/dsh-session-title`。
返回 `title` 和确实使用的 `messageSeqs`；若辅助 LLM 生成，再填 `model` 的 provider/model 路线。Service 清理文本、按 UTF-8 字节截断并将被接受的结果记录为 `session/title`。不能伪称未用的消息参与了标题生成。

## SessionTitleProviderId

`SessionTitleProviderId(id)` 将稳定字符串标记为 provider 身份，日志会保存该身份。不要用运行时随机值，否则恢复时难以解释来源。
