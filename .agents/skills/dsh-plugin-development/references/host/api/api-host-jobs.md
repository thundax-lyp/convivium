# Host 后台 Job 对象

适用 `@deepseek-ai/dsh-jobs@0.2.0-rc.2`。包根公开抽象 `ctx.jobs` 契约；装载它本身会明确失败，必须挂载一个实现，例如 `dsh-jobs-local`。模型侧收取与停止另需 `dsh-tool-jobs` 控制器。见 [创建后台 Job](../how-to/how-to-host-jobs.md)。

## JobRegistry

**公开导出**：`JobRegistry` 来自 `@deepseek-ai/dsh-jobs`。
`start(spec)` 先校验所有权、控制器和 admission，再调用 producer 的同步 `run(job)`，返回 `<kind>-N` 的 `JobId`；预检失败不产生 Job。`list`、`get`、`read`、`readAt`、`wait`、`kill`、`remove` 都按调用方 `SessionId` 限制可见性；缺省 caller 只能看无 owner 的 Job。`read` 推进模型消费游标，`readAt` 按绝对字节 offset 只观察；两者不可混用作同一游标。`events.subscribe` 可按 owner、scope 或全局订阅。所属 Agent 或 Service 卸载时应取消并等待其 Job；内置 local 实现不保证跨进程恢复。

以下成员是该对象的公开契约：

- `attachController: (name: string) => () => void`：按名称声明 controller 的存续；返回的 disposer 在卸载时调用。

## JobSpec

**公开导出**：`JobSpec` 来自 `@deepseek-ai/dsh-jobs`。
声明 `kind`、单行 `label`、可选 `owner`、模型读上限、pull `output` 源与同步 `run(job)`。有 owner 时必须是当前 live Agent 的 Session；无 owner Job 可被任何调用方访问，直到服务卸载。只有面向 owner 的控制器已装载，`start` 才允许创建。运行资源由 producer 所有，Job 身份、状态和有界输出环由 registry 所有。

以下成员是该对象的公开契约：

- `outputLimitBytes: number | undefined`：可选输出保留上限；输出超限时不能假定内存视图含完整内容。

## JobHandle

**公开导出**：`JobHandle` 来自 `@deepseek-ai/dsh-jobs`。
同步 `append(text, options?)` 将完整 UTF-8 chunk 写入有界环，`updateProgress(line)` 更新进行中的状态行。`stdout`/`stderr` 面向模型，`log` 只给观察者；读者落在保留窗口之前会得到 `lossy`，而非异常。

以下成员是该对象的公开契约：

- `id: JobId`：运行中 job 的唯一 ID，供查询与取消。

## JobHooks

**公开导出**：`JobHooks` 来自 `@deepseek-ai/dsh-jobs`。
producer 的 `run` 同步返回 `{ cancel(reason?), done }`。`cancel` 必须同步、幂等并最终使 `done` 结算；`done` 在外部资源真正释放后返回 `JobOutcome`，不应拒绝。Job 首次 terminal 结果获胜，观察事件在等待者释放后送达。

## JobView

**公开导出**：`JobView` 来自 `@deepseek-ai/dsh-jobs`。
新鲜投影给出状态、进度、输出范围和终态摘要。ID 可预测，不是权限令牌；访问检查始终使用 owner Session。

以下成员是该对象的公开契约：

- `detail: string | undefined`：可选状态细节。
- `finishedAt: number | undefined`：终止时间戳；未结束时为空。
- `id: JobId`：job 标识。
- `kind: string`：job 类别。
- `label: string`：用户可读名称。
- `output: { readonly total: number; readonly earliest: number; readonly spillPaths?: readonly string[] | undefined; }`：输出窗口的 total/earliest 偏移和可选溢出文件路径；读取片段须尊重窗口边界。
- `outputLimitBytes: number | undefined`：该 job 的可选输出上限。
- `progress: string | undefined`：可选进度文字。
- `startedAt: number`：开始时间戳。
- `status: JobStatus`：当前状态。
