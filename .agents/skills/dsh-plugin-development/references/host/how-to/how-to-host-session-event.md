# Host Session 事实任务

## 为插件记录可恢复的领域事实

目标是在已有 Agent 的 Session 中提交业务事件，并能从日志重建领域状态。Profile 需提供 `dsh-session`；代码要持有确切 `agent.session`，不从其他 Session 借用身份。对象契约见 [Session、SessionStore 与事件映射](../api/api-host-session.md)。

### 实现步骤

1. 在插件类型声明中扩展 `@deepseek-ai/dsh-session/types` 的 `SessionEventMap`，为事件命名并定义 JSON 载荷。选择稳定键和版本字段；不要写进函数、AbortSignal、未脱敏凭证或进程内句柄。
2. 在已确定业务动作成功的边界调用 `agent.session.append(type, data)`。普通领域日志事件不传 surface 操作；只有目标版本声明的模型消息表面事件才需要 `surfaceOp` 等元数据。追加失败应使本次业务结果显式失败，不能继续声称事实已提交。
3. 若需当前逐会话状态，声明 `inject = ['sessionProjections']`，用 `ctx.sessionProjections.register({ key, stateVersion, stateSchema, init, apply, wire? })` 注册同步投影；Client 需要状态时才提供 `wire`。若需修改模型历史，使用 Session 的 `registerMessageProjection`，这与状态投影是两种不同接口；单纯 `append` 不会自动被模型看到。
4. 若需要落盘检查点，等待 `ctx.sessions.flush(agent.session)`，并确认当前 Profile 已装载持久化后端。没有后端时，flush 不会把内存日志变成磁盘记录。

### 验证与完成边界

检查事件提交后重建的领域状态；用相同的投影定义恢复 Session，再比较结果。给非法 JSON 载荷、缺失投影和失败的持久化后端各做一次负例。仅观察 `session/event` 通知不足以证明磁盘恢复，也不足以证明模型历史包含该事实。
