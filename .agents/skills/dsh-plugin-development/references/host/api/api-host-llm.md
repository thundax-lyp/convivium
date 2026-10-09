# Host LLM Adapter 对象

适用 `@deepseek-ai/dsh-llm@0.2.0-rc.2`。自定义模型后端通过 `ctx.llm.registerAdapter` 提供 provider route，Agent 按模型路由使用该注册。完整实现仍需核对目标版本的 `GenerateOptions`、`StreamChunk` 与具体 provider 协议；见 [接入模型适配器](../how-to/how-to-host-llm-adapter.md)。

## LlmAdapter

**公开导出**：`LlmAdapter` 来自 `@deepseek-ai/dsh-llm`。
公开抽象类要求实现 `stream(options: GenerateOptions): AsyncIterable<StreamChunk>`，并遵守 `options.signal`。`providerInfo(provider)` 给出目录标识和名称，返回的 id 必须等于注册 route；`listModels(provider)` 返回 UI 可发现模型，默认空列表，核心路由仍可接受未列出的模型 ID。`resolveModel(provider, model, signal?)` 给出精确模型元数据；`prepareCall(provider, model, signal?)` 将元数据与后续 stream 绑定到同一 adapter generation，动态设置的实现应覆盖该方法，避免准备与发送跨版本。可选 `providerRetryPolicy` 与 `imageRequestPricing` 分别给重试和请求图像估价信息。

每个 provider HTTP 请求必须带 `attributionHeaders()` 产出的归因头。若使用第三方库，需核查它实际发送的请求头；在 `providerInfo` 中声明并不能替代 wire 实现。

## LlmRuntime

**公开导出**：`LlmRuntime` 来自 `@deepseek-ai/dsh-llm`。
`ctx.llm` 是 Host Service。`registerAdapter(providers, adapter)` 为一组 provider route 原子注册；空初始列表、无效名称、重复 route 或不一致 provider 元数据会失败。返回的 `AdapterRegistrationHandle` 随 fiber 清理。`listProviders`、模型目录与 stream 调用属于运行时使用面；插件作者提供 adapter 时不应绕过注册表直接改写内部 route map。

以下成员是该对象的公开契约：

- `listModels: (provider: string) => Promise<LlmModelInfo[]>`：查询指定 provider 可列出的模型；结果由 provider 决定。
- `resolveModelInfo: (provider: string, model: string, signal?: AbortSignal | undefined) => Promise<LlmResolvedModelInfo>`：解析指定 provider/model 的实际能力与上下文元信息；支持取消。

## AdapterRegistrationHandle

**公开导出**：`AdapterRegistrationHandle` 来自 `@deepseek-ai/dsh-llm`。
返回值既是释放函数，也有 `replace(providers)`。`replace` 先校验完整候选集合，再在同一同步区间替换 route；传空数组可暂时不提供 route，仍保留注册所有权。释放后再 `replace` 会以 `REGISTRATION_DISPOSED` 失败；应新建注册而不是复用已销毁的 handle。适配器自身的连接池或凭证监听仍由插件负责清理，不能只依赖 route disposer。
