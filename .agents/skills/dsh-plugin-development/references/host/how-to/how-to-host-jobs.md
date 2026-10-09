# Host 后台 Job 任务

## 注册可被 Agent 收取的长任务

让插件启动长时间工作，并让同一 Agent 读取进度、等待或停止。Profile 需具体 `JobRegistry` 实现和服务 owner 的控制器；常见组合是 `dsh-jobs-local` 与 `dsh-tool-jobs`。对象见 [Job 契约](../api/api-host-jobs.md)，配置见 [现成组合示例](../examples/example-host-jobs.md)。

### 操作步骤

1. 插件注入 `jobs`，在同步 `start` 的 spec 中提供稳定 kind、短 label、调用 Agent 的 `session.id` 作为 owner。无 owner 表示开放访问，不应用它绕过 Agent 归属。
2. `run(job)` 同步创建受控资源并返回幂等 `cancel` 与最终 `done`。产出可以由 pull 源或 `job.append` 推入；进度用 `updateProgress`。启动前及启动后失败的资源清理均由 producer 负责。
3. 消费者传 caller SessionId 调用 `read`/`wait`/`kill`。UI 观察使用 `readAt` 独立绝对游标；不要推进模型的 `read` 游标。卸载时取消并等待未完工作。

### 验证与完成边界

核查无控制器预检、跨 Agent 禁止读取/停止、取消幂等、等待超时、输出 ring 丢失标志、owner 卸载和失败清理。local backend 的进程重启会失去 Job；需要持久化必须实现不同 backend 的完整契约。
