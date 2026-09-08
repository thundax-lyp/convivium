# Agent、Subagent、Agent Teams 与 Workflow

本 reference 覆盖 v0.1.2-rc.1 的 live Agent 生命周期，以及可选的 Subagent、实验性 Agent Teams 和 Workflow 扩展接缝。这里说明所有权与集成规则，不枚举每个生成的方法签名。

**阅读导航：** 创建/恢复 Agent：从[生命周期](#agent-生命周期)读到[创建与请求](#创建publication-与请求扩展)。委派：先读[Subagent 接缝](#subagent-接缝)及其消息/模型子节，再读[Provider 能力](#已有-provider-的-start-能力)；实现 Provider 时补[实现清单](#provider-实现清单)。Workflow 与[实验 Teams](#实验性-agent-teams)各自按任务选择，不是普通委派的必读前置。最后核对[验证](#验证)。

## Agent 生命周期

`ctx.agents` 拥有 live Agent 的创建与恢复。用户或插件输入通过 Agent API 进入；不要通过修改 Session 来调度工作。Driver 观察 live `agent/*` event 以处理 queue、status、steering、continuation 和 request policy；需要可回放 transcript 的 Consumer 观察 `session/event`。

Turn 开始后领取 pending input，运行 `agent/pre-step` waterfall，只在接受后打开 step。Driver 组装 system prompt 与 tools，运行 LLM request，记录 assistant chunk 与合成 message，经有序 policy stage 执行 tool call，最后关闭 step 与 turn。被拒绝的 pre-step 不消耗 step。Waterfall 返回值具有最终权威；wrapper 除非有意替换结果，否则必须调用 `next()`。

`agent.followup()` 用于排队输入，`agent.steer()` 用于活动交互，`agent.inject()` 用于不会唤醒 idle Agent 的持久 future-request context。Protocol/UI driver 拥有自己的 Agent handle，并通过 disposal 达到静默状态。不要把一条 prompt 与后来无关的 `turn/end` 相关联来推断整个 Agent 已完成。

## 创建、publication 与请求扩展

`ctx.agents.create()` 接收 caller-supplied sessionId、可选 meta/seed/inheritedEventCount、agentOptions、creation-only signal 和 setup；resume 使用 resumeSessionId。Setup 在未发布 scope 完成，可返回同步 commit 在 publication 前重验。Setup/commit/owner disposal 失败必须回滚，session/created、agent/created、session-start 的观察者不能看到半配置实例。Setup 只组合、不驱动，取得 handle 后才发送输入。

Seed 必须从 seq 0 连续、lossless JSON、turn/step/tool 配对闭合；fork 的继承 cut 明确保存。返回 AgentHandle 包含独立 disposer，registry get 只给 bare Agent；能查询不等于拥有 teardown。Handle disposal 停止 loop、等待退出、注销 Agent/Session，再卸载 scope；factory Provider 卸载也会 drain 它拥有的 handles。

`ctx.agent` 是关联 Agent 的 DX 属性，不等于当前 scope 标签；嵌套 scoped context 可以保留关联但拥有更近 scope。读取能力层使用 scopeOf，不以 ctx.agent 猜 scope。

`agent/request` waterfall 在每次调用组装最终 LlmCallConfig；`agent/request-error` 返回 retry 或 next 委托，default undefined 结束失败。`agent/turn-stopping` 是 awaited serial，可 steer 让下一步继续；tool result 的 concludesTurn 不吞掉已进入 inbox 的 additional context/steering，要等其 drain。agent/status/inbox/error 是 live 通知，不能代替 durable event 作为 replay 事实。

agentDefaultModel 的 currentSelection/saveSelection 管理可选 Settings 覆盖；已选模型的 Session 不因默认值改动被重解释。Composition provider/model 必填，reasoningEffort 以 route 支持的公共选择类型验证。

## Subagent 接缝

Subagent 是可选能力，不属于 agent loop。`ctx.subagents` 是命名 Provider registry，可同时存在多个 Provider。Provider descriptor 声明支持的 one-shot 功能，例如 output schema、depth limit、tool filter 和 persona。Runtime 在 start 前检查请求能力；不支持时显式拒绝，Provider 不得接受后忽略。

One-shot request 包含 Provider 名、prompt、准确的 parent Agent、一个 cancellation signal 与受支持的可选控制。Provider 发布 `SubagentRun`；`result` 解析 child outcome，`dispose()` 取消剩余工作并达到静默。Child-level failure 是 non-completed result，不是未处理 rejection。任何路径都必须 dispose 已发布 run。

Continuable child 是持久 child Session，最多有一个 live Activation。Continuation manager 而非 Provider 拥有 identity reservation、Agent creation、FIFO inbox delivery、cold resume、ancestry authorization、child-first disposal 与 manager drain。Provider 只可提供可选的 detached creation input。Caller cancellation 只负责 start/sendMessage 到 inbox acceptance 为止；已接受工作随后属于 Activation。

`sendMessage(sender, targetId, content, { signal })` 只接受准确 live sender 编写的模型消息，目标必须是直接 parent 或直接 continuable child。Running target 在最近 step boundary 接受 steer，idle target 开启 turn；不存在的直接 child 会 cold-resume。消息来源由 runtime 推导为 `agent-message`，不能由调用方伪造。Sibling、自身、跨多级 ancestor、过期 Agent 和 one-shot child 不属于此消息接口的合法邻接关系。`interrupt()` 取消当前 turn，同时保留 pending inbox 与 descendants。Durable enumeration 从 Session header 与 descriptor projection 读取，不加载 Agent。Listing 不授予权限；send/interrupt 才执行权威 live ownership 检查。

One-shot 与 continuable 必须保持区分：one-shot 有一个带 result 的 `SubagentRun`；continuable child 没有 run wrapper，可跨多个 Activation 执行多轮。

### 消息与完成边界

成功返回的 `MessageId` 只表示 inbox 已接受，不表示执行完成、独立 turn 完成或业务事务提交。Human/Host 协议的独立 FIFO turn 使用内部 Queue adapter；该 symbol-keyed 入口不是供普通插件调用的公共 Service API。需要业务串行、去重、重试或 durable outbox 的插件仍自行拥有这些事实，不得把消息 acceptance 当作业务完成。

Continuable Activation settle 时，runtime 会向直接 parent 发送带独立 provenance 的结束通知；它不同于 child 主动发送的内容。公开的 `reportFrom()`、旧 report tool 和 `registerContinuableSetup()` 不可用。需要 child 组合时使用公开创建与 preset 机制，不能调用内部 setup registry。

### 模型选择

`SubagentStartRequest.agentOptions` 支持 provider、model、reasoningEffort、maxTokens，但需要 Provider 的 `capabilities.agentOptions`。In-process Provider 合并 parent options；DSH SDK Provider 合并自身实例默认值。ACP、Codex、Claude Code Provider 不接受这组统一 Host Agent options；其产品侧模型配置是各自配置表面，不能混用。

`ContinuableStartSpec.request` 保留 agentOptions，descriptor 保存恢复所需模型事实；独立模型配置不代表可指定任意 child preset。模型自主选择由 `subagentModelSelection` 与 `list_subagent_models` 等 Consumer 配合，属于显式启用并配置允许模型集合的能力；不要自动打开。

## 已有 Provider 的 start 能力

| Provider                | Parent context                  | 支持的 start features                                       |
| ----------------------- | ------------------------------- | ----------------------------------------------------------- |
| spawn-in-process        | fresh context                   | agentOptions、outputSchema、depthLimit、toolFilter、persona |
| fork-in-process         | 继承已闭合的 parent context cut | agentOptions、outputSchema、depthLimit、toolFilter、persona |
| dsh-sdk                 | 独立进程的新会话                | 只有 agentOptions；合并 Provider 实例默认 route             |
| acp、codex、claude-code | 外部产品的新会话                | 上述五项均不支持，不能接受后忽略                            |

外部 Provider 的产品配置、登录状态、可执行文件和 workspace 要分别准备；父 DSH Session 不自动成为外部进程的完整上下文。Capability flags 描述 one-shot start，不能据此推断任意外部 Provider 支持本地 continuable Activation、工具过滤或统一权限隔离。Process transport、结果收束和 Provider disposal 仍按各自 adapter 的 owner 契约处理。

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

v0.1.2-rc.1 的 Agent Teams 属于 experimental，不得当作 Subagent seam 的稳定替代。Team 以 root Session 作为 `TeamId`，使用持久 roster snapshot、queued-minus-delivered mailbox 和共享 task DAG。`TeamTaskId` 只在 Team 内有效；每次 task mutation 递增 compare-and-set revision。Blocker edge 必须指向未删除 task 且保持无环；write scope 是规范化的建议路径前缀，不是锁。

Lead Session 是 roster、task board 与 queued mailbox 的持久事实源。Target Session 保留 message identity 与 sender attribution 用于去重。Task status 分为 pending、带 owner 的 in-progress、completed 与 deleted tombstone。View 可以增加 readiness 和 write-scope warning，但不改变持久 snapshot。

只有目标 v0.1.2-rc.1 组合明确包含 experimental 包时才使用 Agent Teams。不要把 TeamTask 描述为通用 Cordis task primitive，也不要把它和 Codex 产品中的 task 当作同一概念。

## 验证

测试 Agent input admission 与持久 Session event，而不只测试方法调用。Subagent 覆盖 unsupported capability、发布前清理、发布后 result、cancellation、disposal、lineage/depth、enumeration 与 Provider removal。Continuable child 覆盖 cold resume、running steer/idle wake、准确 sender 与邻接鉴权、acceptance 后取消不撤销工作、interrupt 与 child-first drain。Workflow 覆盖无效 metadata、child cap、fatal script misuse、cancellation grace、non-rejecting result、event containment 与 durable record pairing。产品可见行为需要真实 Loader 组合及 keyless transcript/UI replay。
