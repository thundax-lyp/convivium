# Host Session 持久化任务

## 实现并挂载一个 Session 存储后端

目标是为已有 `dsh-session` / Agent 组合提供崩溃后可恢复的事件日志。只有存储机制确需替换时才编写新的 provider；一般插件直接消费已挂载后端。对象契约见 [SessionPersistence 与 SessionHandle](../api/api-host-persistence.md)。

### 实现步骤

1. 继承 `SessionPersistence`，在构造器调用 `super(ctx)`，实现 `create`、`open`、`stat`、`list`、`flush`。Profile 必须只挂载一个当前作用域的具体 provider。
2. 给每个已创建或打开的 Session 返回 `SessionHandle`；写模式取得该 ID 的唯一所有权，读模式可并发。`append` 验证连续 seq、当前格式与事件快照，先使接受的前缀在本实例内可读，再明确区分尚未 flush 的数据。
3. 实现持久屏障：句柄 `flush` 落盘其已接受前缀；服务 `flush` 逐个排空所有活跃写句柄并聚合错误。`close` 排空并释放锁，即使调用方已取消也要完成清理。
4. 冷读时拒绝撕裂尾部、未知且不可忽略的事件、当前版本无法解释的格式；历史格式转换需在返回句柄前完成。运行时 Agent 的恢复由 agent-loop 管理，后端只提供正确的存储与所有权语义。

此任务暂不配一个简化存储 example：`SessionPersistence` 的正确实现需要同时满足单写者、连续日志、崩溃屏障、冷读与格式迁移。只展示一个内存类会误导为可恢复后端。具体实现可对照目标版本 `packages/session/session-persistence-jsonl/src/`；按上述契约及完整验证矩阵改写为新后端。

### 验证与完成边界

对同一 ID 测试单写者冲突、并发读、连续追加、flush 前后进程重启、close 排空、损坏尾部、版本拒绝和取消。再在目标 Profile 中创建 Agent、写入事件、停止并恢复，核查模型历史一致。只运行内存 mock 不能证明崩溃持久性。
