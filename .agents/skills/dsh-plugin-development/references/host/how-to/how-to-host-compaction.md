# Host 会话压缩任务

## 挂载或实现压缩 backend

为过长会话提供自动或手动摘要压缩。Profile 需要 Session、Agent loop、模型调用与唯一 `ctx.compaction` backend；单独装载抽象包不会发生压缩。对象见 [压缩契约](../api/api-host-compaction.md)，现成组合见 [默认 backend 示例](../examples/example-host-compaction.md)。

### 操作步骤

1. 只需现成模型摘要时，组合 `@deepseek-ai/dsh-compaction-basic`；要让用户输入 `/compact`，再组合 `@deepseek-ai/dsh-command-compact`。核对完整依赖链与 Profile，避免重复 provider。
2. 自定义 backend 继承 `CompactionEngine`，实现自动、手动和显式范围三种调用。选择范围时按当前 surface 位置判断工具配对；跨边界的未答复工具调用不能被截断。
3. 开始时写 `compaction/start` 作为日志锁。摘要结果的提供方、模型及完整输入/输出事实按当前契约记录；`compaction/summary` 紧邻 surface replacement 写入，然后写 `compaction/end`。取消、摘要失败、提交失败各有关闭路径；不能只改进程内消息数组。
4. 模型或外部摘要服务持续观察 signal。对 `compactNow` 的空闲 Agent 任务和独立命令身份按目标类型调用；恢复时仍由 Session 日志重建被遮蔽与保留的内容。

### 验证与完成边界

验证自动压力、手动命令、显式区域、无可压缩范围、工具配对边界、取消、摘要失败和崩溃后重放。自定义 backend 的完整实现须沿用目标源码 `packages/compaction/compaction-basic/src/` 的日志事务契约；只实现三种抽象方法的空壳不能作为可靠压缩示例。
