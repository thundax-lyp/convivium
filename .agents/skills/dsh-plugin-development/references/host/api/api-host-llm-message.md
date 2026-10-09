# Host LLM 消息与流记录对象

适用 `@deepseek-ai/dsh-llm/message` 和 `/assistant-stream`。两处对象在目标版本 `src/index.ts` 通过 `export *` 全部由包根重导出；可用窄子路径导入，但其事实 owner 仍归包根。见 [保存并回放 LLM 消息流](../how-to/how-to-host-llm-message.md)。

## AssistantStreamAccumulator

**公开导出**：`AssistantStreamAccumulator` 来自 `@deepseek-ai/dsh-llm`。
每次模型尝试创建一个 accumulator，对收到的 `{ time, chunk }` 调 `push`；它验证时间、chunk 与 JSON 可序列化性，返回 detached 冻结 timed chunk，并将同类连续 delta 压成持久记录。`snapshot()` 返回可放入 Session 事件的不可变记录列表。实例只属于一次尝试，不能跨重试复用。

## expandAssistantStream

**公开导出**：`expandAssistantStream` 来自 `@deepseek-ai/dsh-llm`。
把 `AssistantStreamRecord[]` 还原为原始时间和 delta 边界完整的 `TimedStreamChunk[]`；输入不合法会抛 `TypeError`。`assembleAssistantStream` 再把一个已结束 attempt 组装为最终内容。`joinAssistantStreamText` 只提取文本，不能替代工具调用、reasoning 或 usage 的完整回放。

## AssistantStreamRecord

**公开导出**：`AssistantStreamRecord` 来自 `@deepseek-ai/dsh-llm`。
联合保留原始非 delta chunk，以及压缩的文本、推理与工具调用 delta，带首时间和间隔。它是日志中辅助流事实，不是新的模型请求源；重放时需要同一个 attempt 的完整记录。

以下成员是该对象的公开契约：

- `type: "chunk" | "text-chunks" | "reasoning-chunks" | "tool-call-chunks"`：流记录的判别字段，区分 chunk、文本、推理与工具调用分块。

## Message

`Message` 是按 `role` 判别的 system/developer/user/assistant/tool 联合，带稳定 `id`、`content` 与 `source`。`MessageSourceMap` 可由插件扩展自有来源；模型可见事实仍须由 Session 日志或稳定配置重建，不能只把临时 Message 存在内存。

## createMessage

`createMessage` 分配稳定 ID、复制并冻结完整消息。`createUserMessage`、`createAssistantMessage`、`createSystemMessage` 与 `createToolResultMessage` 填写各自固定 role/source；工具结果还要保留 `callId` 与 `isError`。`freezeMessage` 用于对现有 identified 消息取不可变快照。插件不能自行伪造已有消息 ID 来回避 Session 投影的身份保持约束。
