# 人类交互

本文用于区分 v0.1.2-rc.1 的 Human command、普通用户提问、动作审批与长期授权。它们都可能显示 UI，但拥有不同的结果与持久语义。

**阅读导航：** 先读[机制选择](#机制选择)，再选 Command、普通提问或动作审批对应章节；权限/Sandbox 只在改变执行策略时补读。[内置命令与反馈](#内置命令与反馈)用于现有反馈入口；最后按[证据清单](#按命中机制选择证据)验证选中机制。

## 条件补读

- 只有修改权限预设/Sandbox 才进入该分支；账号登录不是单次审批，走[授权](credentials-authorization.md)

## 机制选择

| 需求                                            | 机制                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| 用户主动直接运行一个不交给模型解释的 `/command` | `ctx.commands`                                           |
| tool/plugin 在继续前需要业务选择或自由文本      | `ctx.userQuestions`                                      |
| 敏感动作需要一次 allow/reject 决策              | `ctx.approval`，通常由 `tools/pre-execute` 的 `ask` 触发 |
| 建立可复用的账号授权或 secret reference         | Authorization + Credential seam                          |

不要用 approval 表示普通产品问题，不要用 user question 绕过 permission policy，也不要把 command 当作模型消息。一个功能可以组合多个机制，但每个结果仍由自己的 owner 记录和解释。

## Human command

Command definition 拥有 lowercase name、discovery description、可选 unstructured input metadata、input-recording policy 与 handler。Adapter 传入 exact live Agent、raw suffix、已 durable admitted attachments 和 cancellation signal。Handler 返回直接给 UI 的 success/error；它不是 tool result，也不会自动生成模型消息。

解析到有效 definition 后，Registry 在调用 handler 前直接追加 `command/run`，settle 后追加 `command/done`；它们是 log-only append，不要求或创建 open turn。Syntax 或 name 未命中时不记录。如果 richer domain event 已经拥有展示事实，success 可引用其 `sourceEventSeq`，不要把相同 payload 再复制进 command text/event。Agent-scoped definition shadow global definition；注册与 fiber disposal 同生命周期。

## 普通用户提问

`ctx.userQuestions.ask()` 接收一到多个带稳定 id 的 question、可选 options/detail/intent、exact live Agent 与 signal。Presentation intent 只改变 UI 展示，不能改变答案 encoding。Answerer 必须返回可按 id 对应的结构化答案；工具只消费字段，不解析 UI prose。

只有当前 runtime root 的 live Agent 可以获得人类 answerer；continuable child 或仅有持久 lineage 的非 live instance 不能假定可提问。缺少 Provider、取消、caller 非 live 与 malformed answer 都必须产生明确 failure，不能无限等待。

Answerer 通过 `user-questions/request` 的 Agent-scoped Cordis waterfall 组合，返回结构化答案表示认领，未认领则调用 `next()`。没有 `registerProvider()` 单例注册入口。监听器通过 `ctx.on()` 绑定 fiber；Client answerer 使用应用选择转发的 Remote event，不自行暴露任意 Host event。

## 动作审批

Approval request 标识 exact Agent、tool name、可选 call id、reason 与 signal，不复制已展示的 tool arguments。`ctx.approval.request()` 只在 open turn 内工作，先写 `approval/asked`，取得一个 closed outcome，再写 matching `approval/decided`；未能可靠提交 audit pair 时不能返回未记录的许可。

Session policy `never` 在 answerer waterfall 之前 fail closed；answerer 不拥有请求时调用 `next()`。只有一次性允许结果授予动作，missing/throwing answerer、abort 与无效返回都不能变成 allow。Audit event 本身不进入模型 transcript；caller 的 tool result 与 runtime-context policy snapshot 承担模型可见语义。

## Plan、权限预设与 Sandbox

[Plan mode](planning-scheduling.md#plan-的已记录状态与-pending) 是持久的模型行为指导，不能当成文件写保护。Permission preset 只是把 sandbox mode 与 approval policy 组合成用户选择；执行仍由两个 knob 各自的 owner 负责。默认表的 `workspace-write` 对应 `workspace-write` + `ask`，`danger-full-access` 对应同名 sandbox mode + `never`。`custom` 是派生状态，不能注册成 preset 或作为切换目标。

`ctx.permissionPresets` 要求具备 sandboxMode 能力的 confining shell 和 approval。`current(session)` 读取 `permissions` projection，缺 registry/key 明确失败。`set()` 先记 selection，再通过 canonical setter 写实际变化的 knob；重复选择 effective preset 不追加。两个 preset 即使 knob 相同，也保留仍匹配的已选名称。

Sandbox mode 只描述文件效果，不涵盖网络或进程可见性。`read-only` 与 `workspace-write` 经 Provider confinement；`danger-full-access` 由 Consumer 直接使用原 argv，不调用 `ctx.sandbox`。Provider 返回的 `full`/`partial` 是执行强度事实，需要完整保证的 Consumer 必须拒绝或明确处理 partial。要求 confinement 时无可用 backend 必须 `SANDBOX_UNAVAILABLE`，不能静默裸跑。

每次调用通过 sandbox policy 解析 Session cwd 对应的 workspace root 和 mode；已批准重试可携带一次显式 mode，不修改共享 Provider 状态。Runner 启动失败与命令被 sandbox 拒绝是不同分类，不能把 runner 的普通提示行当成失败证据。

## 内置命令与反馈

Host command registry 与 Client 本地 slash action 是不同入口；不能从 Web 的 `/model`、`/export` 等交互推断 headless/ACP 有相同 command adapter。压缩命令见 [Compaction](context-recovery.md)，Goal 命令见 [规划与调度](planning-scheduling.md)，导出见 [Session 查询与导出](session-query-index.md)。

`command-feedback` 注册 `/feedback <text>`；`recordFeedback(session,text)` 也可供其他 trusted producer 调用。Trim 后空文本拒绝，非空文本原样追加独立 `feedback/record`，没有 category、severity、关联消息、修改或撤回接口。Command 的 `recordInput: false` 避免重复记录文本；它不开始/打断模型工作，反馈及 acknowledgement 都不进入模型 context。

Acknowledgement 包含 Session id、anonymous user id 与 telemetry 的 full/feedback-only/disabled/not-configured 策略说明，不证明数据已上传，也不证明已 flush 到磁盘。需要 durability 的调用方等待 canonical Session flush。默认 Web 支持命令；headless、ACP、JSON-RPC 没有 shipped slash adapter。Blank Session 尚未激活时可能记录成功而没有 transcript acknowledgement 行。单条消息的可编辑评级是另一个 [message feedback sidecar](storage-projections.md#message-feedback-的-sidecar-边界)。

## 按命中机制选择证据

只执行实际采用机制的子清单；同一功能组合多种机制时再叠加对应证据。

- Command：parsing、scope shadow、attachments admission、无 turn 的 event pairing、cancellation 与 dispose。
- User question：live-root admission、no-provider、abort、structured answer validation 与 Provider removal。
- Approval：open-turn gate、policy-never、answerer delegation/failure、abort、exact audit pair 和 tool-policy 组合；headless 组合必须确定性 fail closed。
