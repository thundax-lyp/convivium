# Agent、Subagent、Agent Teams 与 Workflow

本 reference 覆盖 rc.2 的 live Agent 生命周期，以及可选的 Subagent、实验性 Agent Teams 和 Workflow 扩展接缝。这里说明所有权与集成规则，不枚举每个生成的方法签名。

## Agent 生命周期

`ctx.agents` 拥有 live Agent 的创建与恢复。用户或插件输入通过 Agent API 进入；不要通过修改 Session 来调度工作。Driver 观察 live `agent/*` event 以处理 queue、status、steering、continuation 和 request policy；需要可回放 transcript 的 Consumer 观察 `session/event`。

Turn 开始后领取 pending input，运行 `agent/pre-step` waterfall，只在接受后打开 step。Driver 组装 system prompt 与 tools，运行 LLM request，记录 assistant chunk 与合成 message，经有序 policy stage 执行 tool call，最后关闭 step 与 turn。被拒绝的 pre-step 不消耗 step。Waterfall 返回值具有最终权威；wrapper 除非有意替换结果，否则必须调用 `next()`。

`agent.followup()` 用于排队输入，`agent.steer()` 用于活动交互，`agent.inject()` 用于不会唤醒 idle Agent 的持久 future-request context。Protocol/UI driver 拥有自己的 Agent handle，并通过 disposal 达到静默状态。不要把一条 prompt 与后来无关的 `turn/end` 相关联来推断整个 Agent 已完成。

## Subagent 接缝

Subagent 是可选能力，不属于 agent loop。`ctx.subagents` 是命名 Provider registry，可同时存在多个 Provider。Provider descriptor 声明支持的 one-shot 功能，例如 output schema、depth limit、tool filter 和 persona。Runtime 在 start 前检查请求能力；不支持时显式拒绝，Provider 不得接受后忽略。

One-shot request 包含 Provider 名、prompt、准确的 parent Agent、一个 cancellation signal 与受支持的可选控制。Provider 发布 `SubagentRun`；`result` 解析 child outcome，`dispose()` 取消剩余工作并达到静默。Child-level failure 是 non-completed result，不是未处理 rejection。任何路径都必须 dispose 已发布 run。

Continuable child 是持久 child Session，最多有一个 live Activation。Continuation manager 而非 Provider 拥有 identity reservation、Agent creation、FIFO inbox delivery、cold resume、ancestry authorization、child-first disposal 与 manager drain。Provider 只可提供可选的 detached creation input。Caller cancellation 只负责 start/follow-up 到 inbox acceptance 为止；已接受工作随后属于 Activation。

`followup()` 发送到现有 running/waiting Activation；不存在时 cold-resume。`interrupt()` 取消当前 turn，同时保留 pending inbox 与 descendants。Durable enumeration 从 Session header 与 descriptor projection 读取，不加载 Agent。Listing 不授予权限；send/interrupt 才执行权威 live ownership 检查。

One-shot 与 continuable 必须保持区分：one-shot 有一个带 result 的 `SubagentRun`；continuable child 没有 run wrapper，可跨多个 Activation 执行多轮。

## Provider 实现清单

1. 使用唯一稳定名称和真实 capability flags。
2. 分配资源前验证 capability。
3. 在 contract 要求时，从准确 parent 推导 workspace、lineage 与 delegation depth。
4. 发布前 start 被拒或 signal abort 时清理全部 partial resource。
5. 发布后通过 run result 表达失败，并让 `dispose()` 幂等且达到静默。
6. 不同 start 相互独立；共享 capacity 可以延迟，但不能耦合 failure 或 cleanup。
7. Provider removal 阻止新 start，但不撤销已接受 run。
8. 只产生安全 diagnostic；排除 credential、tool input、file content、environment value 与 raw protocol payload。

## Workflow 接缝

Workflow 也是可选能力。`ctx.workflowEngine` 是 single-service seam，不是命名 registry。Service Definition 拥有 start request、metadata、result、run handle、error、cancellation 和 observe-only event。Worker-thread Provider 每次 run 执行一个 script；模型工具是 Consumer。

Workflow start request 包含 script、plain-JSON metadata、可选 plain-JSON args、准确 parent Agent、可选 Provider/cap 控制和 cancellation。在执行 script text 前验证 metadata。Script 启动的每个 child 都通过 Subagent seam 归属于 parent。

Script failure 不会让 `WorkflowRun.result` reject；它解析为 closed stop reason 与可选 error。Holder 可以 cancel，且必须 dispose 每个 run。Disposal 表示必要时取消、在有界时间内 settle，并等待 child 静默。Observe-only `workflow/*` event 携带 detached snapshot 而非 live run，隔离 listener failure，也不泄漏 caller 拥有的 result value。

Workflow Consumer 只在发布后写 durable display record，并在 result 与静默 disposal 后关闭记录。Append 失败后保持空日志或合法前缀，不继续写出损坏协议。Invariant 校验配对的 run/member start/end；只有 log tail 的缺失 terminal record 才可表示中断。

## 实验性 Agent Teams

rc.2 的 Agent Teams 属于 experimental，不得当作 Subagent seam 的稳定替代。Team 以 root Session 作为 `TeamId`，使用持久 roster snapshot、queued-minus-delivered mailbox 和共享 task DAG。`TeamTaskId` 只在 Team 内有效；每次 task mutation 递增 compare-and-set revision。Blocker edge 必须指向未删除 task 且保持无环；write scope 是规范化的建议路径前缀，不是锁。

Lead Session 是 roster、task board 与 queued mailbox 的持久事实源。Target Session 保留 message identity 与 sender attribution 用于去重。Task status 分为 pending、带 owner 的 in-progress、completed 与 deleted tombstone。View 可以增加 readiness 和 write-scope warning，但不改变持久 snapshot。

只有目标 rc.2 组合明确包含 experimental 包时才使用 Agent Teams。不要把 TeamTask 描述为通用 Cordis task primitive，也不要把它和 Codex 产品中的 task 当作同一概念。

## 验证

测试 Agent input admission 与持久 Session event，而不只测试方法调用。Subagent 覆盖 unsupported capability、发布前清理、发布后 result、cancellation、disposal、lineage/depth、enumeration 与 Provider removal。Continuable child 覆盖 cold resume、FIFO acceptance、ancestry authorization、interrupt 与 child-first drain。Workflow 覆盖无效 metadata、child cap、fatal script misuse、cancellation grace、non-rejecting result、event containment 与 durable record pairing。产品可见行为需要真实 Loader 组合及 keyless transcript/UI replay。
