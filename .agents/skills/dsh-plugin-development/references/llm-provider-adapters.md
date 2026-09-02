# LLM Provider Adapter

本 reference 覆盖 rc.2 的 LLM adapter registry、request/stream 转换、凭证、replay state 与 Provider 验证。

## Adapter 职责

LLM Adapter 把组装好的 provider-neutral request 转为 vendor traffic，再把 vendor delta 转为 DSH `StreamChunk`。它不拥有 prompt assembly、tool policy、Session persistence 或 UI rendering。Vendor request type、transport/SSE parser、delta translator 和 Adapter class 应拆到职责清晰的模块。

共享 message API 使用 immutable role、source 与 content value。Content block 包括 text、reasoning、image、tool call 和 tool result。只有 Adapter、durable history、compaction 与 UI 都能保存新 modality 时，才可扩展 block。

## 完整 Adapter 入口

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
