# Meeting Design

## Purpose

本文定义 Meeting 聚合的应用编排框架。它消费 [Domain Design](./DOMAIN-DESIGN.md) 的唯一对象定义，将每个外部命令落实为一次授权、校验、纯领域转换、原子提交和提交后效果；不复制或扩展 Domain 的字段、枚举与不变量。

## Scope And Non-goals

覆盖 Meeting 的命令路由、状态转换顺序、并发控制、效果投递、恢复和可观察性。它不定义 DSH Session 实现、存储引擎、Remote 传输、页面布局、Agent Prompt、模型选择或业务对象字段；分别由 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 与 Domain Design 规定。

## Framework Modules And Dependency Direction

实现必须沿下列依赖方向组织；名称是模块职责，不要求预先引入额外框架。

| 模块 | 唯一职责 | 可依赖 | 不得依赖 |
| --- | --- | --- | --- |
| `meeting/domain` | `MeetingState`、纯校验、派生函数和转换函数 | 标准值类型 | Runtime、Repository、DSH、Remote、时钟 |
| `meeting/application` | 命令管线、actor 解析结果、授权、期限判断、效果计划 | domain、端口 | DSH/HTTP 具体实现 |
| `meeting/ports` | Repository、Clock、Identity ownership、Session、effect dispatcher 的最小接口 | domain 类型 | adapter |
| `meeting/adapters` | DSH tool、loopback Remote、存储和 Markdown/通知实现 | application、ports | domain 内部可变状态 |
| `meeting/projection` | 从已提交快照生成 caller-visible view、摘要和 Markdown 输入 | domain | 写端口、Session 内部数据 |

Domain 转换返回 `accepted(state, facts, effects)` 或 `rejected(domainError)`；application 不得通过直接改数组、补默认字段或重写历史绕过转换。Repository 只接受完整的预期版本和转换结果，adapter 不得自行解释业务状态。

## Common Command Pipeline

所有 Agent、local panel、Remote control、恢复任务和自动期限检查都严格执行同一序列：

1. 解码 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 的版本化 envelope，执行结构和值域校验。
2. 从可信调用通道取得 caller binding、当前时间和 requestId；忽略输入中的 actor、Session ownership、baseline、权限或派生完成状态。
3. 加载 Meeting 与该 caller 的持久 identity ownership；未知、损坏、撤权或无法证明归属时 fail closed。
4. 先检查 caller 是否可读取/控制目标 Meeting，再处理该 caller 的历史 receipt；随后检查 requestId 绑定、expected version、生命周期与 action 前提。
5. 由 application 构造无环境依赖的 Domain command，调用纯转换。转换成功时生成新 snapshot、已提交事实和提交后 effect plan；拒绝时不产生任何事实。
6. 以 `meetingId + expectedVersion` 比较并交换，原子写入 snapshot、事件/审计事实、idempotency receipt 和 effect outbox。冲突返回当前版本，不执行效果。
7. commit 后按 outbox 投递 Session mail、review delivery、refresh、Markdown projection 或归档动作。投递至少一次，但 receipt 和领域事实绝不因重复投递而重复创建。
8. 返回该 caller 可见的 committed result；任何 refresh 只提示重新读取，不把未提交状态作为结果发送。

读路径只加载已提交 snapshot，再调用 projection。它不修复数据、不触发隐式转换，也不因读取推进 deadline。

## Authorization And Transition Families

以下每项均是一组可实现的 action discriminant；精确字段、成功结果和错误码在 Meeting Interface 中定义。无论入口为何，调用相同 application handler 与 Domain command。

### Meeting lifecycle and agenda

| 转换 | 允许 actor | 前提 | 成功事实/效果 | 拒绝或无操作 |
| --- | --- | --- | --- | --- |
| `create_meeting` | Convener | objective、初始身份、限制完整；DSH 预检已完成 | version 1、initial pending agenda、ownership/session creation effect | 任一必填目标、身份或能力缺失即拒绝；不产生半个 Meeting |
| `activate_agenda` | Captain | Meeting 可运行；目标 Agenda pending；无其他 active | 原 Agenda 按明示 disposition 收口，新 Agenda active | 非 Captain、终态、缺失/非 pending Agenda 拒绝 |
| `raise_agenda_candidate` | 任意已授权 identity | Meeting 非终态；title/reason 完整 | pending candidate | 相同 request replay receipt；不能隐式加入 Agenda |
| `dispose_agenda_candidate` | Captain | candidate pending | 仅一次 promoted/parked/rejected 事实；promoted 新建 pending Agenda，不切换 active | 再处置、非 Captain 或候选不存在拒绝 |
| `record_question` / `resolve_question` / `record_issue` / `dispose_issue` | 记录者；处置者依 Interface 角色 | 关联 Agenda 和目标引用存在；blocking 关联未满足目标 | 不可变记录或合法 status 更新；blocking 影响 completion/结束判断 | 用自由文本伪造引用、默认风险等级或跳过理由拒绝 |

### Evidence round

`open_round` 只由 Manager 在 active Agenda 上执行。它在同一瞬间固定现有全部 Publication ID 为 baseline，创建 `open` Round；同轮不按投稿顺序公开，任何新公开内容只能进入下一轮 baseline。

| 转换 | 允许 actor | 前提 | 成功事实/效果 | 拒绝或无操作 |
| --- | --- | --- | --- | --- |
| `raise_hand` | Contributor | open Round；该身份可参与且本轮未已有 Contribution | 只记录可接受的 request/hand raise | 不接受、暂缓或重复举手均不创建 Contribution |
| `accept_hand_raise` / `reject_hand_raise` | Manager | 对应 hand raise 未处置 | accept 创建一个 `preparing` Contribution；reject/defer 仅返回申请者理由，不记录 Meeting hand raise | accept 不替换 contributor；同 contributor/round 不能第二个 Contribution |
| `submit_evidence` | Contribution 作者 | own Contribution preparing/format_correction/awaiting_response；结构完整 | 初版或新 `EvidenceVersion`，进入 registration effect | 不完整进入格式补正而非观点否决；版本不能覆盖旧版 |
| `register_evidence` | Manager | 目标是当前版本；只检格式/可访问性 | `complete` 进入 review；`needs_correction` 回作者；`deferred` 保持未审核 | Manager 写观点评分、结论或真实性判断拒绝 |
| `submit_review` | 指定 reviewer | 当前已 complete version；reviewer 非作者；baseline 精确相等 | 一个四维独立 Review 和 delivery effect | 自审、旧版本、错误 baseline、重复 reviewer/version 拒绝 |
| `record_review_delivery` | effect dispatcher（可信系统 actor） | 对应 Review 已提交且未 delivered | sent 时写 sentAt 并开始 60 秒 response deadline；failed 只记录失败 | delivery failure 不使作者放弃，不创建 publication |
| `respond_to_review` | 作者 | delivery 已 sent 且未过期 | response 事实；Contribution 进入可收口状态 | 未送达、过期或他人回应拒绝 |
| `raise_supplement_hand` / `dispose_supplement_hand` | 作者 / Manager | sent Review 后作者已明确继续；当前版本已审；计数少于二 | Manager 接纳后记录唯一 pending supplement authorization | 拒绝/defer 不改变 Version 或退出状态 |
| `submit_supplement` | 作者 | 对应 supplement hand 已获接纳；计数少于二 | 新 EvidenceVersion，原子消耗 authorization、递增 substantive count，重新 registration/review | 初始/格式补正不消耗次数；第三次实质补充拒绝 |
| `withdraw_contribution` / `mark_submission_missing` / `mark_timed_out` | 作者；或可信 deadline handler | 目标仍非终态，且角色/期限符合 | 设置确定 exit reason/status | handler 只能按传入 Clock 的到期事实执行，不猜测 Agent 失败 |
| `publish_round` | Manager 或可信 close handler | `isRoundClosable` 为真；每个接纳 Contribution 已有合法终态；每个登记 current version 有最终 Review | 单一 Publication、FormalMessage 批次、Round published、refresh/Markdown effect | 任一未满足即 `ROUND_NOT_CLOSABLE`；没有局部发布 |

Round 的 `aborted` 只由 Captain 在不能继续时设置，必须给出原因并将所有未终态 Contribution 以确定 exit reason 关闭；它不产生 Publication。

### Proposal, decision, risk and completion

| 转换 | 允许 actor | 前提 | 成功事实/效果 | 拒绝 |
| --- | --- | --- | --- | --- |
| `record_proposal_revision` | Contributor 或 Captain | 可运行 Meeting；引用可见、已发布 evidence | 新不可变 revision；不继承任何 position/decision | 引用未公开材料或修改旧 revision 拒绝 |
| `record_position` | Contributor 或 Captain | 对 proposal revision 的明确立场和理由 | 新不可变 Position | Manager、无引用或重复 ID 拒绝 |
| `record_decision_candidate` | Contributor 或 Captain | 当前 ProposalRevision、可见 evidence/positions 与理由完整 | 新不可变 Candidate，无 status | Candidate 不形成 Decision，普通 Participant 不可读 pending projection |
| `decide` / `supersede_decision` / `revoke_decision` | Captain 或 local controller | 当前 Candidate、required evidence/positions、理由与目标引用完整 | 接受 Candidate 形成新 Decision；supersede 原子替代，revoke 仅撤销旧 Decision | 仅自然语言总结、缺 rationale/evidence 或非授权 actor 拒绝 |
| `dispose_risk` | Captain 或 local controller | riskLevel、acceptableRiskLevel、hard constraints、Issue status、evidence、理由齐全 | 不可变 accept/reject disposition；只改变目标 Issue；完成条件满足时进入 converging 并停止新增贡献安排 | 无 authority 或接受未说明风险拒绝 |
| `submit_completion_declaration` | Participant | 自身 identity、output/criterion、可见 evidence 与 task 引用一致 | 不可变 declaration，不改变完成状态 | 不能以 declaration 覆盖 objective、Agenda 或 lifecycle |
| `record_completion_fact` / `supersede_completion_fact` / `revoke_completion_fact` | Captain | 对 output/criterion 的可验证 evidence 与 Decision 基础完整 | active 或显式替代/撤销事实 | Manager 或以 Task/评分代替依据拒绝 |
| `end_meeting` | local controller | 所有 active Agenda 已收口，或强制结束明确列出未收口项；结束 outcome 与 unresolved items/decisions/facts 一致 | immutable Termination、terminal lifecycle、archive materialization effect | objective 未满足只能以 partial/no_consensus 等明确 outcome 结束，不能伪造 completed |

Decision candidate 和 Captain/local 私有投影由 projection 根据 actor 过滤；它不是另一个可写状态。

### Planning, tasks and mail

Manager 可提出 `recommend_identity`、`recommend_work` 或 `recommend_review`，但 recommendation 只是一项规划事实：它不得创建 MeetingIdentity、Session、Contribution、Decision 或自动重试。Captain 的接纳进入 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 的 definition admission 管线；全部预检和 Session ownership 成功后才原子创建 identity 关联事实。必需 identity unavailable 时，application 创建或更新 blocking Issue，停止其依赖工作并报告；不能替换身份或用另一 agent 自动补位。

`create_task`、`claim_task`、`complete_task`、`cancel_task` 只改变 `MeetingTask`。任务必须绑定 Meeting、发起/执行身份、上下文范围和 deadline；任务完成绝不直接完成 Agenda、Round 或 Meeting。`send_private_mail` 在 commit 中固定双方可见的公开上下文上界，投递前由 effect dispatcher 加上该上界之后新增的公开内容；私信、Agent tool 过程和隐藏推理不回写 FormalMessage。

plan_next_step 只由 Manager 在没有 open Round 时提交，替代同 Agenda 的 active plan；其五种 planKind 仅描述下一步，不直接改变领域控制状态。reassign_task 只由 local controller 执行，原子 revoke 旧 authorization 并创建 replacement task；旧授权的迟到结果在进入 projection 前拒绝。start_private_mail、complete_private_mail、cancel_private_mail 和 mail deadline 只改变 PrivateMail，且 serial gate 保证一个 identity 不同时处理 mail 与正式 Contribution。start_archive 只由 local controller 从 terminal 触发，先提交完整 ArchivePackage 并切换 archiving；受控 Session owner 针对每个 ownership 写入 close success/failure，全部 success 后才切换 archived。

## Time, Concurrency And Recovery

application 只从 `Clock.now()` 取得时间，向 Domain command 传入具体 timestamp；Domain 不读取时钟。deadline handler 使用独立 requestId、当前版本和可验证到期条件，故早到、重复或竞态执行均不会产生双重 exit fact。

所有同一 Meeting 写入通过 expected version 串行化。读与不同 Meeting 可并行；同一 round 的 evidence/review 可以并行提交，但所有成功写入仍各自产生一个连续 Meeting version。版本冲突、receipt 重放和 effect 重试均不能改写历史或创建重复 publication/message。

恢复只做以下操作：读取最近完整 committed snapshot；验证记录连续性和 identity/session ownership；恢复未完成 effect outbox；根据当前时间补跑可证明已到期的 deadline command。任何 snapshot、receipt、outbox 或 ownership 损坏均标记 `RECOVERY_UNAVAILABLE` 并停止写入，绝不从 Session log、Markdown、UI 缓存或当前角色定义重建事实。Agent 内部失败本身不是 Meeting 失败；必须经显式 action、deadline 或授权处置成为领域事实。归档先物化完整 ArchivePackage，再进入 archiving 并停止、关闭、revoke 全部已证明归属的 Meeting Session；任一关闭失败保持 archiving、禁讨论并保留输出，成功后才 archived。

## Failure, Security And Observability

失败优先级固定为：协议/结构错误、caller/Meeting 可见性、caller ownership/authorization、idempotency binding、Meeting terminal/archived、expected version、action precondition、Domain invariant、Repository conflict/availability。所有失败均返回稳定 error code 和最少安全上下文；不得泄露私有 mail、未公开 evidence、Session ID、capability、凭据或隐藏推理。

每次成功 commit 至少产生可关联的 Meeting version、request receipt、actor、action kind、事实 ID、时间和 effect ID；日志诊断与投递结果不是领域事实。对外可观察的 refresh 只由成功 commit 或已投递效果触发；失败、重试和读取不得伪造新的状态变更。

## Acceptance

1. 每个 Interface action 只路由到一个明确 application handler 和一个 Domain transition；没有入口专属业务规则。
2. 成功写入原子保存 snapshot、receipt、事实和 outbox；任何失败都不公开局部状态。
3. 同轮并行材料只通过一个 round-end Publication 公开，未审版本永不进入公开投影。
4. 缺失必需参与者、损坏 ownership、版本竞态和 delivery 失败均有确定、可恢复且不越权的分支。
5. 重放、恢复、deadline 和 refresh 不会制造第二个 identity、Contribution、Review、Publication、FormalMessage 或 Decision。
