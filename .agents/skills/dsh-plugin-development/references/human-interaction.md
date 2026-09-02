# 人类交互

本 reference 用于区分 rc.2 的 Human command、普通用户提问、动作审批与长期授权。它们都可能显示 UI，但拥有不同的结果与持久语义。

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

`ctx.userQuestions.ask()` 接收一到多个带稳定 id 的 question、可选 options/detail/intent、exact live Agent 与 signal。Presentation intent 只改变 UI 展示，不能改变答案 encoding。供应方必须返回可按 id 对应的结构化答案；工具只消费字段，不解析 UI prose。

只有当前 runtime root 的 live Agent 可以获得人类 answerer；continuable child 或仅有持久 lineage 的非 live instance 不能假定可提问。缺少 Provider、取消、caller 非 live 与 malformed answer 都必须产生明确 failure，不能无限等待。

## 动作审批

Approval request 标识 exact Agent、tool name、可选 call id、reason 与 signal，不复制已展示的 tool arguments。`ctx.approval.request()` 只在 open turn 内工作，先写 `approval/asked`，取得一个 closed outcome，再写 matching `approval/decided`；未能可靠提交 audit pair 时不能返回未记录的许可。

Session policy `never` 在 answerer waterfall 之前 fail closed；answerer 不拥有请求时调用 `next()`。只有一次性允许结果授予动作，missing/throwing answerer、abort 与无效返回都不能变成 allow。Audit event 本身不进入模型 transcript；caller 的 tool result 与 runtime-context policy snapshot 承担模型可见语义。

## 按命中机制选择证据

只执行实际采用机制的子清单；同一功能组合多种机制时再叠加对应证据。

- Command：parsing、scope shadow、attachments admission、无 turn 的 event pairing、cancellation 与 dispose。
- User question：live-root admission、no-provider、abort、structured answer validation 与 Provider removal。
- Approval：open-turn gate、policy-never、answerer delegation/failure、abort、exact audit pair 和 tool-policy 组合；headless 组合必须确定性 fail closed。
