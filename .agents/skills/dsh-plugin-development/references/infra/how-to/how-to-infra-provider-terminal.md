# 持久 PTY 操作

## 在 Agent 作用域中使用持久 PTY

Host 插件为当前 Agent 创建一次交互式 shell 会话、发送一条命令并关闭。Profile 需有 `@deepseek-ai/dsh-terminal`、可用 backend（如 `dsh-terminal-bash`）及其 subprocess 依赖。对象契约见 [Terminal API](../api/api-infra-provider-terminal.md#terminalsessionservice)，完整文件见 [example-infra-provider-terminal](../examples/example-infra-provider-terminal.md)。

### 实现步骤

1. 以调用的 `exec.agent` 为 owner；没有 Agent 时拒绝。先从 `listBackends()` 确认所需 `type`，再 `spawn(owner, request, signal)`。
2. 用 registry 返回的 `sessionId` 调 `startSend(owner, id, { text, submit, signal })`；等待 `done` 并读其 `viewport`、`waitReason`、`sessionStatus` 与 `truncated`。等待结束不等于持久 session 退出。
3. 后续 `read`、`signal` 和 `kill` 均携带相同 owner。一次性任务在 `finally` 中 `await kill`；长期会话由 Agent 生命周期和显式关闭共同管理。
4. 对不同 owner 验证拒绝，对取消、启动失败、backend 卸载验证局部资源清理。

### 验证与完成边界

示例是一次性消费现成 PTY backend；新 backend 还要证明独占 send、前台进程组信号、scrollback 边界、失败清理与整棵进程树静默。运行时测试必须在目标 OS 上执行，不能以注册成功替代。
