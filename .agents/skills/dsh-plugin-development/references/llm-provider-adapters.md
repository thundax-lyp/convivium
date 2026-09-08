# LLM Provider Adapter

本 reference 覆盖 v0.1.2-rc.1 的 LLM adapter registry、request/stream 转换、凭证、replay state 与 Provider 验证。

## 条件补读

- 内置 route、模型/effort、图像 Files 配置读[模型路由](llm-model-routing.md)

## Adapter 职责

LLM Adapter 把组装好的 provider-neutral request 转为 vendor traffic，再把 vendor delta 转为 DSH `StreamChunk`。它不拥有 prompt assembly、tool policy、Session persistence 或 UI rendering。Vendor request type、transport/SSE parser、delta translator 和 Adapter class 应拆到职责清晰的模块。

共享 message API 使用 immutable role、source 与 content value。Content block 包括 text、reasoning、image、tool call 和 tool result。只有 Adapter、durable history、compaction 与 UI 都能保存新 modality 时，才可扩展 block。

## Adapter 注册骨架

下例仅展示 Config、继承和注册的类型形状。`stream` 中的 stop 是占位，不发出模型请求，不能作为可用 Adapter 交付；真正实现必须完成下文的 transport、流转换、失败与 replay 契约。

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'

export const name = 'llm-my-provider'
export const inject = ['llm']

export interface Config {
  baseURL: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().required(),
})

class MyAdapter extends LlmAdapter {
  constructor(private readonly baseURL: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    // Serialize one provider request, pass the signal to transport, and translate deltas here.
    void this.baseURL
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(config.baseURL))
}
```

`ctx.llm.registerAdapter()` 把 Adapter route 绑定到调用 fiber，并拒绝重复 route，因此直接调用。Constructor 只接收实际使用的已验证 Config；部署 tunable 不得藏成常量。

## Streaming 规则

- Content-block index 按首次出现顺序分配，同一 block 的所有 delta 复用该 index。
- Streaming 期间 tool-call arguments 保持 raw JSON string。发出 argument delta；若 vendor 提供结构化参数，在 block completion 时重新 stringify。
- Usage 必须先于 finish 发出；finish 后不得再 emit。
- Network request 与 parser 都接收 `options.signal`。一次 Adapter stream 只代表一次 Provider attempt；关闭 SDK 自带 retry，由 DSH 统一拥有重试策略。
- 不支持的 request option 必须拒绝。静默丢弃 temperature、tools、reasoning 或其他请求能力属于协议错误。
- Transport/vendor error 转为共享 typed failure；或在 Provider 协议需要时使用 in-band error/aborted finish。

成功 finish 可携带 native follow-up 所需的最小 adapter-private lossless-JSON replay state，例如 response id 或 signature。只有所属 Adapter 解释该值；读取时验证，不把它加入 provider-neutral core type。

## 凭证与配置

Config 包含该 Adapter 实际拥有的、经过验证的部署 tunable，例如 Provider route、endpoint、model mapping、capability policy、limit、timeout、retry policy 与 credential reference。Secret value 属于 Credential Provider，而不属于插件 Config 或 UI projection。若轮换应影响下一次请求，就按 operation 解析 credential。不得记录、写入 Session event、返回 catalog view 或嵌入 error。

Endpoint 与 mapping 若能独立验证，应在 load 时失败。只有运行时才能解析的 credential reference，在 operation 开始时以 typed Provider error 失败；不要静默跳过 Adapter，也不要回退到其他 secret。

## Discovery、图片计费与官方请求扩展

`registerModelDiscovery(namespace, (request, signal?) => ...)` 的 cancellation 是独立参数，不在 request 中。已配置 route 的 discovery 使用 Host 持有的凭证和 headers，不能让 redacted UI 自行重建 secret。图片读取遵守 Attachment 与 FS 路径转换，不把 Host 路径直接交给隔离执行环境。

Adapter 的 `imageRequestPricing(provider, model)` 同步返回该准确 route 的 `LlmImageRequestPricing | undefined`，不是逐图价格数组。调用方再执行定价对象的 `priceImages(images)`，取得与输入图片每次出现按索引一一对应的 `readonly LlmImageRequestPrice[]`；每项包含 `visualTokens` 与替代/附带的 `text`，文字 token 由调用方估算。两步均不得执行 I/O；返回 undefined 时使用中立估算，不虚构精确计费。Usage 的 reasoningTokens 已包含在 outputTokens 中；可选 totalTokens 只保留可核实的总量，不重复累加。

`ctx.deepseekLlmApiExtensions` 是官方 DeepSeek 的独立顶层 body field registry。贡献者独占字段，以 `prepare(request)` 生成 detached JSON 和可选 accept callback；Adapter 在 HTTP 2xx 后执行幂等 acceptance transaction。Preparation、字段冲突和 acceptance failure 都会使请求失败，不能把 2xx 后 bookkeeping 失败描述为未发送。

该机制可承载 `dsh_session_log` 与 `dsh_plugin_packages`，内容在模型 messages 之外，pi-ai 路径不使用它。日志上传是原始 canonical suffix 的 at-least-once 交付，不是脱敏副本；开发新字段应核查数据范围、接收方版本与重试语义，不把 reference 视为外部调用授权。

## 请求失败与 Retry

llm-retry 是 Agent request-error executor，无自有 Config；最终 Adapter registration 的 retryPolicy 拥有行为。Normal 缺省对 EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT 最多重试 5 次，backoff 500ms→10000ms、jitter 10%；有限预算/eligible codes/delay 可配置。Always 先尝试 downstream recovery，再无上限重试，包括 permanent failure，直到成功、取消或卸载。

llm/retry 在等待前记录计划，llm/retry-started 在实际开始前记录；有效且在 policy bounds 内的 Retry-After 可覆盖本地 backoff。重试在同一 open turn 重走失败 step，不把 partial output、delay 或 log-only retry record 混入模型历史。无 final adapter 则无 route policy，委托 downstream；不同 recovery 插件预算各自拥有，顺序必须确定。

直接 ctx.llm.stream 消费者仍是单次尝试：raw stream 没有 durable attempt 隔离，不能直接重放已经输出的 chunks。取消/卸载 abort backoff、drain delegated recovery，旧 callback fail closed；不响应 signal 的 downstream 仍可能阻塞 quiescence。

## 验证矩阵

| 表面                                 | 必需的聚焦证据                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Request serialization                | messages、tools、所选 option 与 model id 的准确 vendor request                                                      |
| Stream translation                   | text/reasoning/tool delta、block completion、usage、finish 与 error                                                 |
| Cancellation                         | Abort 到达 transport，terminal settlement 后无 chunk                                                                |
| Unsupported option                   | Adapter 显式拒绝而非静默忽略                                                                                        |
| Replay state（Adapter 发出或消费时） | Lossless JSON round-trip、owner matching 与无效 state 处理；不使用 native follow-up state 的 Adapter 不得虚构该字段 |
| Registry lifecycle                   | Fiber live 时 route 存在，dispose 后消失                                                                            |
| Real Provider                        | 有 key 时运行 credentialed e2e；无 key 时准确报告 skip                                                              |
| 模型可见输出                         | 通过 shipped/test profile 的 keyless recorded-session replay                                                        |

协议测试使用确定性 mock vendor traffic。Real-API e2e 是补充，不能替代准确的 request/stream fixture。只报告实际观察到的命令。

内置 DeepSeek/pi-ai 的模型目录、credential precedence、Files API 与图像 offload 见 [模型路由](llm-model-routing.md)。这些是具体 Adapter 的契约，不推广成所有 Provider 必须实现的接口。
