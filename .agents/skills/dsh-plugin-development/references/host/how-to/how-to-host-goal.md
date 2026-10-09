# Host 持久目标任务

## 从插件管理一项跨轮次目标

为同一 Session 保留一个可恢复的长期完成目标。Profile 需装载 `dsh-goal`、Agent 与 SessionProjection；自动续行还需独立轮次驱动。对象见 [Goal 契约](../api/api-host-goal.md)，现成装载见 [目标示例](../examples/example-host-goal.md)。

### 操作步骤

1. 插件注入 `goals`，只为确实要跨多轮完成的任务调用 `create(agent, { objective, maxGoalRounds? })`。普通单轮请求不需要目标。
2. 每次状态变更先 `get(agent)`，以最新 `id`、`revision` 构造 ref，再调用 `edit`、`pause`、`resume`、`complete`、`block` 或 `clear`；遇 stale revision 重新读取。`block` 要记录稳定代码和解释。
3. 长任务完成时明确标记 `complete`；用户要求暂停时 `pause`。重启或 fork 后 active 目标也已 disarmed，只有明确 `resume` 才重新授权自动续行。

### 验证与完成边界

测试创建、重复创建、修订冲突、轮次上限、暂停与恢复、阻塞原因、完成和清除；恢复 Session 后状态与日志一致且不自发执行。Service 状态正确不证明轮次驱动已装载或 Agent 会继续。
