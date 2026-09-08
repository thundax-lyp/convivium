# Jobs 后台工作与完成通知

本文固定 `dsh-v0.1.2-rc.1`。Jobs 分为 jobs Definition、jobs-local Provider 和 tool-jobs Consumer。它是进程内执行契约，不是持久调度器；未来提醒见 [Schedule](planning-scheduling.md)。

## 条件补读

- Producer 是子进程/PTY 时补[运行时资源](runtime-resources.md)；工具暴露读[Tools](tools.md)

## API 与准入

`ctx.jobs.start(spec)` 同步返回 branded JobId（kind-N）；list/get 返回 fresh snapshot，read 读取增量输出，kill 返回 requested/already-finished，wait(id,timeoutMs,caller,signal) 等待并返回 snapshot。onJobDone/onJobsChanged 注册通知，attachController(name) 声明此作用域能收集/停止工作；注册的 disposer 按实际 API effect 所有权清理。

Start 必须有服务 owner 的 controller；tool-jobs 会挂载它，只有 backend 而无 controller 时不允许发布无法管理的 job。预检在 producer run 前完成；失败无 id、无工作。Foreground/background 在启动前选择，没有把已执行的 foreground 操作原地升级为 job 的 API。

Authorization 比较 exact Agent 对象，不通过可猜测 id 提供安全性。Owned job 只对 owner 可见可操作；unowned job 为所有 caller 可用，生命周期归服务。maxConcurrentJobsPerOwner 默认 10，running+stopping 都计入，unowned 使用独立共享桶；满额拒绝，不排队/抢占，terminal history 不占容量。

## Producer 与状态

Producer run 返回 cancel、done 及可选 readOutput/输出限制。Cancel 同步幂等，done 不应 reject，资源真正静默后才 settle。正常状态为 running→completed/failed；kill 只是 requested，先 stopping，producer settle 后才最终 killed/failed。取消请求成功不证明工作已结束。

发布前外层 exec.signal 拥有启动；发布后归 job/owner/service，不能让原 tool call 的结束杀掉已接受工作。Producer tool 或 controller reload 不停止既有 job；Agent disposal cancel、await 后删除所属 records；Service disposal 处理剩余全部。

Teardown 中 cancel 抛错会 force-fail record 并报告可能 orphaned，而非证明资源已释放；cancel 返回但 done 永不 settle 仍可卡住 teardown 并占容量。Provider 不能把这种静默不响应谎报为正常完成。

## 输出与通知

Job readOutput 是一个 consuming cursor，多个 reader 会影响彼此；不要与 [Subprocess 的非消费读取](runtime-resources.md#子进程与终端) 混为一谈。Snapshot 是状态，不是完整输出存档。Output cap 覆盖 model read/completion notice，完整 artifact 保留由 Spill/Producer 决定。

tool-jobs 提供 job_output/job_list/job_kill 和 owner 的 completion context；这些工具与 durable result/context 承担模型可见证据。onJobDone 是通知，不替代 done promise 或保证下一次模型请求已消费。Job records 不跨进程重启；持久 execution 需要重新设计 callback、identity、restore 和 observation 协议。

## 验证

覆盖无 controller、scope ownership、容量 running+stopping、发布前 abort、发布后独立取消、单 cursor、producer/controller reload、done settlement、cancel throw 与 ineffective cancel，以及通知/模型日志的差别。
