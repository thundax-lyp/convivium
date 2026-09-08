# Plan、Goal、Todo 与 Schedule

本 reference 针对 `dsh-v0.1.2-rc.1` 的任务协作状态。四者都是可选领域能力，不能互相替代。

| 意图                        | Owner                 | 不能推断的能力                       |
| --------------------------- | --------------------- | ------------------------------------ |
| 改变协作指导                | planMode              | Plan 不执行文件权限限制              |
| 维护同一 Session 的长期目标 | goals                 | Goal 状态不等于已有活跃 continuation |
| 显示任务列表                | Todo event/projection | 列表不自动调度执行                   |
| 在原 Session 以后排入提醒   | Schedule              | 不是通用 Cron 或可靠业务消息队列     |

**阅读导航：** 根据开头的意图表选择 Plan、Goal/Todo 或 Schedule。提醒任务必须连续读[时间与重放](#schedule-的时间与重放)和[交付与持久化](#live-deliveryfork-与-durability)，不能只读创建参数。最后核对[验证](#验证)。

## Plan 的已记录状态与 pending

Plan 是 soft prompt guidance，Sandbox/Approval 独立执行限制。set 选择 pending state，不立即向无 turn 的位置追加 plan/mode，也不强迫产生新 turn。下一次 downstream 接受的 in-turn pre-step 才提交；发生在最后 accepted step 之后的选择可能留到下一轮，未提交前进程退出会丢失。

get 的 active 是已记录并用于当前 request 的状态，pending 是待提交选择。exit_plan_mode 工具保持注册，inactive 时调用失败；审核通过只安排 pending exit，因此当前 tool batch 仍处于原指导下。需要询问用户时使用 UserQuestions；不能把审核响应等同于已完成下一次 pre-step。

## Goal 与 Todo

GoalRef 指向 exact revision；mutation 需准确 live Agent 和 compare-and-set。Durable phase 表示目标结果，process-local activation 表示是否可继续开下一 round。clear 和 blocked 都有领域含义，不通过 inbox 操作伪造目标完成。

admitted user/message 才增加带 revision 的连续 roundsStarted；创建消息计划或调度 intent 不算已开始。Strict fold、reused id 和无效 round 的处理见 [领域 projection](storage-projections.md#领域-fold-与能力缺失)。Todo 保存列表业务事实，不授予与 Goal、Workflow 或 Agent Teams 相同的执行和依赖能力。

## Schedule 的时间与重放

create 三选一：正整数 after_seconds、显式 at，或至少 300 秒的 every_seconds。At 是带 offset 的 RFC3339，或准确 date/time/time_zone；不从进程、Session 或浏览器隐式选择时区。DST gap 拒绝，overlap 选择较早时刻；持久记录归一为 UTC scheduledAt。

Every 是按创建锚点的 fixed-rate interval，没有 calendar/Cron 语法。忙碌或冷 Session 错过多个 tick，只贡献最近一次 due occurrence，直接推进到决策时间之后的下个锚点，不逐个追补。多个 record 可在同一 follow-up batch 中交付；每条记录仍独立。

schedule/change 是 durable authority，id 在 Session 内不可复用。Dispatch 只表示 follow-up 同步排队，不是模型回答成功或用户已读。只读 UI 和默认启用状态见 [默认组合](composition-config-credentials.md#已发布组合的默认行为)。插件需要跨重启可靠业务重试时，应建立另外的明确 owner 和协议，不能用 Schedule 推导承诺。

## Live delivery、fork 与 durability

Schedule 只为插件加载后经 `agent/created` 发布的 runtime root Agent 安装工具和 timer；不会补装到已经存在的 Agent，也不安装到 owned child。动态启用或重载插件不能让已有 live Agent 自动获得该能力。冷 Session 不执行提醒；在插件已加载的组合中恢复并发布为 root Agent 后，才重建 timer 并处理 overdue。

到期任务等所属 Agent 完全 idle 并取得 maintenance phase，再重新 fold、采样时间、调用 followup 和追加 dispatch；不用 steer 打断当前 turn。One-shot 优先，每次一个 later turn；没有到期 one-shot 时才合并 overdue Every。

Fork 仅 fold inheritedEventCount 之后的 Schedule 事件，不继承父 Session 的活跃提醒。正常 restore 保留 active records 与已用 id，不能只缓存当前 active 数组而丢掉复用检测。管理与到期操作在 Agent-scoped queue 串行，经共享 persistence barrier；失败返回 persistence_uncertain，不猜测 eager write 是否落盘。

队列 admission 失败不记 dispatch；admission 后、dispatch durable 前崩溃可能重复交付。提醒是 best-effort at-least-once 边界，没有 exactly-once、独立 durable receipt 或冷 Session 后台调度器。

## 验证

覆盖 pending selection 的拒绝/延后、Plan 与权限独立、Goal revision/round、Schedule 仅安装到加载后发布的 root Agent、已有 Agent 与 owned child 不安装、插件卸载清理、时间边界/DST、missed tick 合并、replay 和 dispatch admission。不要用定时器触发一次证明持久提醒恢复正确。
