# Host Session Fork 任务

## 从精确日志边界创建子 Session

从当前 live Session 的某个已存在事件 seq 分叉，让子会话继承该前缀并记录父身份。公开入口是 `ctx.sessions.fork(source, boundary?, childSessionId?)`；低层 `/fork` 仅导出根入口也重导出的 `buildForkSeed`。对象见 [SessionStore](../api/api-host-session.md#sessionstore)。

### 操作步骤

1. 确认 source 是 store 中的精确 live `Session` 或可解析的 ID；若有指定边界，它必须是该日志中连续的非负事件 seq。省略边界取最后一个事件；空日志形成空 seed。
2. 调用 `ctx.sessions.fork`，让服务构造 inherited prefix、`session/end-seed` 和必要的 `forked` turn/step closers；不要自己切数组后遗漏打开轮次的关闭事件。
3. 若实现自定义 Agent seed，才直接用 `buildForkSeed(events, boundary)`，并把 `inheritedEventCount` 设为原前缀长度。这个 helper 假定 caller 已验证边界和连续 seq，不会替你持久化或创建子 Session。

### 验证与完成边界

测试空源、无效边界、非 live source、重复 child ID、打开轮次截断与恢复后的 inherited cut。`fork` 返回子 Session，不代表子 Agent 已创建或开始运行；Agent 的创建/恢复另走其公开入口。
