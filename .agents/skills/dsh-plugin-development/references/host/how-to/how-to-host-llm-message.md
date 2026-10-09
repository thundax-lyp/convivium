# Host LLM 消息流任务

## 记录一次模型流并可重复回放

Host 插件要观察或实现适配器流，并把一次模型尝试的 chunk 边界及最终消息保存为可回放事实。对象见 [LLM 流与消息契约](../api/api-host-llm-message.md)，适配器注册见 [LlmRuntime](../api/api-host-llm.md)。

### 操作步骤

1. 每次请求尝试新建 `AssistantStreamAccumulator`，对每个实际收到的 chunk 以原始 Session 时间戳调用 `push({ time, chunk })`。不要跨重试合并；取消时只保留已收到且合法的片段。
2. 尝试结算时用 `snapshot()` 取得持久记录，随同模型 provider、model、请求配置与结果写入 Session 所属事件。`expandAssistantStream` 应可准确恢复 chunk 次序与时距。
3. 构建最终 role 消息使用包根导出的 `create*Message` helper；工具消息必须对应真实 callId 和失败标记。若插件事件修改既有消息，则走 [Session 模型历史投影](how-to-host-session-surface.md)，保持 id 不变。

### 验证与完成边界

对文本、推理、工具调用 delta、usage、finish、取消与重试做保存/展开往返；比较最终消息、source 与 id。只保存最终纯文本会丢失工具/usage 和原始时间，不满足完整流回放。
