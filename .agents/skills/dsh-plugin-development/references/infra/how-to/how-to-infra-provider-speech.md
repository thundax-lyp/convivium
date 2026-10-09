# 实验性语音 provider 插件

## 注册语音转写 provider

目标是在已配置的 `ctx.speechToText` 注册一个具名语音识别后端，由调用方显式选择并转写。需要 Profile 中的语音注册表及目标版本公开包。对象契约见 [Speech API](../api/api-infra-provider-speech.md#speechtotext-default)，最小注册形状见 [example-infra-provider-speech](../examples/example-infra-provider-speech.md)。

### 实现步骤

1. Host 插件声明 `inject = ['speechToText']`；provider `info` 给稳定 id、运行位置和真实支持语言。
2. 在插件 effect 中 `register`，把 async disposer 返回给 effect，让注销等待 in-flight `transcribe`。准备模型时实现 `preparation` 的 snapshot、subscribe、prepare、cancel；无需准备时省略。
3. 调用方先 `resolve({ audio, providerId?, language? })` 再 `transcribe(spec, signal)`；选择不会在转写失败时自动切换到另一 provider。可通过 `configure` 更新默认选择，但它依赖 Settings 和 Profile entry。
4. 装载、选择并用可重复的音频样本验证文本、时长、取消与卸载。云端 provider 还需验证认证和数据外发，地方后端要验证模型文件与准备状态。

### 验证与完成边界

固定返回的 example 只能证明注册和路由，不能称为语音识别。要用于真实产品，应运行目标设备上的录音解码与识别测试，报告模型/语言/延迟结果，并确认实验性 API 的部署配置。
