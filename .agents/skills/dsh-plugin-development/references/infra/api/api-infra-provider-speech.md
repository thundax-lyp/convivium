# 实验性语音转写 provider

## 对象关系与使用场景

`@deepseek-ai/dsh-experimental-speech-to-text` 在目标版本是公开包，提供 `ctx.speechToText` 具名 provider 注册表；`dsh-experimental-speech-to-text-sensevoice` 是本地具体实现，`dsh-experimental-api-speech-to-text` 面向浏览器客户端提供 API。实验标记表示产品稳定性边界，不否定本 tag 的公开导出。任务见 [Speech HOW-TO](../how-to/how-to-infra-provider-speech.md#注册语音转写-provider)。

## SpeechToText default

默认导出的 Service 注册为 `ctx.speechToText`，配置包括可持久变更的 `defaultProvider` 与 `language`。`register(provider): () => Promise<void>` 按 `provider.info.id` 注册，重复 id 拒绝；disposer 先拒绝新任务、取消并等待已接受任务。`listProviders()` 返回当前事实；`snapshot()` 与 `follow(signal)` 报 provider 准备状态和选择，后者按观察者取消结束。

`configure(patch)` 通过 Settings 与 Profile entry 持久更新选择；缺少任一前置会拒绝。`prepare(id, options?)` 与 `cancelPreparation(id)` 控制可选的模型准备。`resolve(request)` 选择确定 provider 与语言，缺失/不支持即拒绝；`transcribe(spec, signal)` 只调用已解析的那个 provider，不回退到其他位置，并在注销时中止在途工作。完整录音字节属于请求，不由 registry 持久化。

## SpeechProvider

provider 有 `info: SpeechProviderInfo`、可选 `preparation: SpeechPreparation`、`transcribe(input, signal): Promise<Transcript>`。`info.id` 是稳定的 `SpeechProviderId`，还包括名称、`location: 'host-local' | 'cloud'`、支持语言列表及可选资源估算/下载来源。真正转写实现必须核对录音格式、语言、取消、凭据和数据外发边界；静态注册不会做到这些。

## Transcript

**公开导出**：`Transcript` 来自 `@deepseek-ai/dsh-experimental-speech-to-text`。
成功结果有 `text`、`audioSeconds` 与 `inferenceSeconds`。`SpeechRequest` 含原始 `audio`，可选 provider id、语言；`SpeechSpec` 是已选 provider 的请求。时间与文本应来自实际识别，不应在产品实现中返回固定演示数据。

## 装载与验证

Profile 先装载并配置注册表，再装载一个或多个 provider；SenseVoice 还依赖 `ctx.subprocess` 并可能需要大模型下载/准备。分别测 provider 列表、选择持久化、准备状态、真实音频转写、取消和卸载等待。示例仅验证注册/路由，不证明识别准确率、模型下载、安全或 API 客户端可达。
