# Host 用户问答任务

## 在工具中取得结构化回答

工具或权限 flow 需要人回答一个可选择、可输入的问题。Profile 必须装载 `userQuestions` Service 和能够认领该 Agent 的 answerer；对象见 [问答契约](../api/api-host-user-questions.md)，模型侧组合见 [问答示例](../examples/example-host-user-questions.md)。

### 操作步骤

1. 构造非空题目数组，每题给唯一 id 和明确选项。只有在真正展示计划正文且 approve 与选项一致时才标记 `plan-review`。
2. 阻塞当前操作时调用 `ctx.userQuestions.ask({ questions, agent, signal })`。当可继续独立工作时，用有明确正整数期限的 `askTimed(request, callId, timeoutMs)`；pending 结果让 Agent 继续，不得伪装已回答。
3. 子 Agent 无直接人机 answerer，应把未决问题放入其最终结果交给 parent。取消与 UI 断连不同；面板暂时关闭不会删除已记录的续答问题。

### 验证与完成边界

覆盖正常单选/多选/custom、无 provider、重复题 id、取消、超时、续答、重复续答及非 root Agent 拒绝。真实 UI 须验证重连后仍能看到问题；Service 成功返回不证明某个 Client 页面已装载 answerer。
