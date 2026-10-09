# Host 持久目标对象

适用 `@deepseek-ai/dsh-goal@0.2.0-rc.2`。`ctx.goals` 为每个 Session 维护一个可跨轮次、重启恢复的完成目标；Service 自身不启动继续执行，模型工具、命令与轮次驱动是独立包。见 [管理持久目标](../how-to/how-to-host-goal.md)。

## GoalService

**公开导出**：`GoalService` 来自 `@deepseek-ai/dsh-goal`。
`get(agent)` 返回精确 live Agent 的最新视图；`create` 建立活动目标。`edit`、`pause`、`resume`、`complete`、`block`、`clear` 都用视图中的精确 `{ id, revision }` 防止旧状态覆盖新状态。暂停、完成、阻塞和清除会解除自动续行；`resume` 可重启暂停/阻塞目标或恢复后已 disarmed 的活动目标，但受剩余轮次上限约束。`disarm` 只收回进程内续行权，不改日志事实。Service 需要 `agents` 与 `sessionProjections`。

以下成员是该对象的公开契约：

- `remoteExportCreate: (agent: Agent, request: CreateGoalRequest) => CreateGoalResult`：供 Remote create 调用的适配入口；Host 插件直接调用 create。

## GoalView

**公开导出**：`GoalView` 来自 `@deepseek-ai/dsh-goal`。
视图包含目标、phase、revision、已开始轮次数、上限、阻塞说明和进程内 `activation`。每次读取得到 detached 值；持久 phase 与 volatile activation 必须分开理解。恢复或 fork 后即使 phase 仍是 active，也默认 disarmed，需明确 resume。

以下成员是该对象的公开契约：

- `blockedReason: GoalBlockReason | undefined`：阻塞状态的原因；未阻塞时可缺省。
- `createdAt: number`：创建时间戳。
- `id: GoalId`：目标标识。
- `maxGoalRounds: number`：当前轮数上限。
- `objective: string`：已保存的目标文本。
- `roundsStarted: number`：已启动轮数，不能当作已完成轮数。
- `updatedAt: number`：最近更新时间戳。

## GoalRef

**公开导出**：`GoalRef` 来自 `@deepseek-ai/dsh-goal`。
`id` 与 `revision` 组成精确预期引用。插件持有旧 ref 时操作会得到 stale-revision 错误，应重新读取并决定是否重试，而非盲目覆盖。

## CreateGoalRequest

**公开导出**：`CreateGoalRequest` 来自 `@deepseek-ai/dsh-goal`。
包含非空完成目标和可选正整数轮次上限。每个 Session 最多一个未完成目标；完成后可新建，其他 phase 要先更新、恢复或清除。

以下成员是该对象的公开契约：

- `maxGoalRounds: number | undefined`：可选轮数上限，由服务校验并写入目标状态。
- `objective: string`：目标文本，创建时必须提供。
