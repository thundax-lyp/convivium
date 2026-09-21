# DSH Plugin Design

## Purpose

本文定义 Convivium 作为单个本地 DSH 插件的装配边界：角色资源、会议身份与 DSH Session 的绑定、受控后端入口、只读展示和本地刷新通知。

## Scope And Non-goals

当前实现运行在一个本地 DSH Host，服务该 Host 的单一 loopback 用户边界。本文覆盖插件生命周期、必需 DSH 能力、角色资源、Session 归属、受控读写入口和本地面板；不定义会议领域规则、持久化算法、远程多用户、跨 Host 协作或独立服务。

## Related Requirements And Interfaces

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)

## Implementation Modules And Ports

| 模块                    | 输入                                           | 输出                                     | 不变量                                                         |
| ----------------------- | ---------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| plugin/bootstrap        | Host lifecycle/capability registry             | 一个已注册 Runtime、tool、Remote factory | capability preflight 失败时不注册可写入口                      |
| dsh/role-catalog        | Host Config                                    | versioned safe Catalog snapshot          | 不返回完整配置或可执行资源                                     |
| dsh/definition-resolver | exact Definition id/version                    | immutable Definition                     | 不以显示名、当前默认版本或文件路径回退                         |
| dsh/preflight           | Definition、MeetingId、受限资源引用            | PreparedDescriptor 或 typed RoleError    | 不创建 Session、不写 Meeting                                   |
| dsh/session-owner       | PreparedDescriptor、admissionId、identity fact | durable ownership/Session control result | ownership 一对一绑定 Meeting、identity、descriptor、Definition |
| runtime/meeting-service | caller binding、MeetingCommand                 | committed command result                 | 只调用 Meeting Design 的 command pipeline                      |
| remote/loopback         | typed request、local binding                   | typed result/refresh notice              | 不持有业务状态或绕过 Runtime                                   |
| client/projection       | committed caller-filtered view                 | UI state                                 | 不推导 authority 或领域状态                                    |

Host adapter 必须把 DSH 的具体 API 收敛在 role-catalog、preflight 和 session-owner 后面；Meeting Domain、application、Remote DTO 和 Client 都不能引用 DSH 实现类型。每个 port 的返回值只可为 Interface 所定义的成功值或稳定 error，不能以异常文本作为控制分支。

## Responsibilities And Dependencies

DSH Host/profile 拥有插件加载、模型、Preset、Skills、MCP、Sandbox、Approval、Session 生命周期和存储 provider。Convivium 只拥有会议身份与 Session ownership 的对应关系、领域操作的受控入口、Meeting 事实投影和角色资源溯源。首发只支持精确 DSH 版本 `0.1.2-rc.1`；版本不同或缺少必需 lifecycle capability 时，加载必须拒绝并说明支持版本，不提供降级会议模式。

每个 MeetingIdentity 使用独立、可持续的会议专用 Session；不同 Meeting、身份或授权范围不得共享。Meeting Session label、provisioning envelope 与 durable ownership 只使用全局唯一 `meetingId` 和 Meeting 内唯一 `identityId` 定位，不包含 `teamId`；任何创建、继续、interrupt、恢复、停止或撤权都必须先验证持久 ownership，不能凭显示名、前缀或 UI 输入猜测。

Meeting 进入 running 时，以及每条新 FormalMessage 随 Round Publication 提交后，Runtime 只向与当前 active Agenda 相关、具有 contributor 角色、无未结束 Contribution/MeetingTask 且已证明自己的会议 Session active 的身份排入一次 `agent_notice` 申请机会。相关身份是 `agendaResponsibilityIds` 包含 active Agenda ID 或该数组为空的 contributor；身份可以不申请或不发言。通知只携带 Meeting/Agenda/已公开 message ID，Agent 再由受控读入口取得 caller-visible Transcript。投递前 dispatcher 重新验证 Session ownership、active 和闲置资格；重复投递复用 effect ID，不能从 DSH 消息接收推断业务举手或材料已登记。初次举手或无轮次机会申请经已提交 command 通知 Manager，Manager 处置理由只通知作者本人。

贡献者的私有取证材料只存在于其 DSH Session/工作范围，不交给 Manager，也不进入 MeetingState、FormalMessage、projection 或 outbox。贡献者通过 `submit_evidence` 直接提交准备公开的 EvidenceInput；Runtime 只做结构、引用、身份、授权和期限校验，失败不保存 payload，成功才原子建立 EvidencePackage/Version/Registration。Manager 只看贡献与审核状态，不读取本轮证据正文。

Convivium 只限制自身会议操作的调用权限和模型可见的会议上下文；Agent 在 DSH 已授权范围内自行选择 Prompt、Skills、Tools、MCP 与内部工作方式。插件不得依赖具体 Skill、内部 Tool Schema、调用顺序或隐藏推理才能正确运行；Manager 身份不得以 Contributor 身份提交正式发言或 Position。

角色 Definition 只声明 DSH 已公开且经过预检的能力。预检在创建第一个会议专用 Session 前完成；缺少必需能力时拒绝创建，不通过临时修改 Prompt、权限或资源来降级。已创建身份的运行配置由 DSH 拥有，角色资源变更只影响新的 MeetingIdentity。

每场 Meeting 的唯一专职 evidence reviewer 使用一个 meeting-owned coordinator Session。Runtime 在投递 review effect 前通过 application 原子创建持久 `ReviewBatchClaim`，固定 Round、reviewer、确切 versionIds、sourceEffectId 与 expiry；只有认领成功才向 coordinator 提供该待审集合。coordinator 使用 DSH 原生 subagents/worker sessions 并发分析，每个 worker 只取得一份确切 EvidenceVersion 与固定 baseline。worker 不是 MeetingIdentity、没有 Meeting command authority，全部结果回到 coordinator 后携带 claimId 由 `submit_review_batch` 原子提交并移除 claim；不持久化 worker 内部状态。有效 claim 阻止不同 dispatcher 实例重复唤醒：其它 effect 去重完成，原始 source effect 的崩溃重投保持 retryable。若 coordinator turn 超时、中断或投递失败，dispatcher 通过 Runtime-only command 精确撤销该 claim，使迟到提交失效并允许立即重新认领；进程崩溃等未观察到的结束仍由 expiry 兜底。冷恢复从 MeetingState 的 claim 与最终 Review 恢复调度。Reviewer Definition 使用专用 Preset/Skills，并可引用 Host-approved 材料读取、代码核验、Web/GitHub/arXiv 查询和运行验证能力；具体工具由版本化 Definition 与 Host 配置拥有，Convivium 不以“工具最多”授予权限。Review delivery 的 sent/failed 尝试进入 caller-filtered read model，使 Manager 看状态、作者看自身 delivery、reviewer 看全部 delivery；其他身份不能借投递状态获知未公开 Review。

### Catalog and Definition conversion

Meeting Agent Catalog 是 Host 提供的只读安全投影；Convivium 只在 Manager 读取安全 projection 或执行 `recommend_identity` 时从同一 Host producer 获取它，不把完整 Agent 配置、capability 或运行资源复制进 Meeting。Manager 的自然语言推荐不改变参与者、权限、Round 或 Session；结构化 `reject` 只提交拒绝事实，结构化 `admit` 只先提交不可调度的 provisioning 意图。

Runtime 从既有 outbox 投递 `identity_provision`，仅解析意图中记录的精确 Definition identity、执行 preflight 并以 recommendationId 作为 admissionId 幂等地创建 Session/ownership；在 ownership 可证实后，使用受控系统 action 原子激活普通可选 MeetingIdentity。缺 Definition/required capability、descriptor 过期或 provisioning 失败时，同一系统 action 将意图置为 `failed` 并显示安全错误码，不暴露部分可用身份。进程重启只重放未完成的同一 outbox/admissionId；历史 MeetingIdentity 的 descriptor 缺失时明确拒绝恢复，不能套用当前 Definition 重建。

当前实现只阻止同一 `candidateId + agendaId` 已有 provisioning/active 意图时重复准入，不实现 evidence freshness 或跨研究角色来源范围去重。同一 candidate 的 provisioning 意图在 Meeting 内全局互斥，避免并发创建多个 Session；已有 active identity 后，另一 Agenda 的合法准入直接复用既有 identity/Session/Definition provenance，只新增独立 active recommendation，不投递 `identity_provision`，也不扩大角色、权限或 capability。自动研究去重仍是必要后续能力；在形成 freshness、source-scope 比较和独立交叉验证例外的正式需求与接口前，不新增 evidence index、策略配置、cache 或通用去重框架，也不把 candidate 去重称为该能力。

## Plugin Lifecycle And Entry Points

插件入口只负责构造依赖、注册受控服务和登记 teardown；领域转换不位于插件入口、工具处理器、HTTP/Remote 处理器或 Client。

所有领域写入通过一个 Runtime 入口，验证 caller、Meeting、身份、当前版本和领域前提后才提交；读模型和归档只读取已提交 Meeting。工具、面板和恢复调用相同业务规则，不分别实现暂停、恢复、结束、决策或风险语义。

插件状态机为 new → validating → ready → stopping → stopped，或 validating → rejected。new 仅构造依赖；validating 验证 DSH 精确版本 `0.1.2-rc.1`、必需 lifecycle capability、Storage/continuable provider 与 loopback 配置；ready 才注册可写工具与 Remote control；rejected 只暴露加载诊断，不能出现半可用 Meeting 入口。stopping 立即拒绝新 command，等待已开始的 atomic commit 结束，保留未完成 outbox，然后释放插件已证明归属的 resident activation；stopped 不删除已提交 Meeting 事实，不操作无法确认归属的 Session。

Identity admission 的 durable ownership 先处于 provisioning 且不授予 Meeting authority；child ready 后才由 session-owner 置 active。Session control 的后续状态为 active、interrupted、stopped、unrecoverable，其转换只能由 session-owner 执行：interrupt/resume/stop 前重新读取 durable ownership；unrecoverable 只允许报告与归档，不允许以新的 descriptor/session 替代。Agent 输入投递成功、Agent 执行结束、Session lifecycle 完成与 Meeting command commit 分别记录为 adapter 诊断或已提交 Meeting effect，不能相互推断成功。

## Local Client And Remote Boundary

面板先读取本地 Host 的全部可恢复 Meeting 摘要，选定后才读取完整状态。摘要不含 transcript、Session ID、capability、物理存储路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表返回暂不可用原因而不得伪装为完整可用列表。完整状态由类型化后端接口输出；Client 只展示，不计算领域状态、不写缓存事实。

当前 Web/Remote 入口仅在 loopback Host 可用时挂载，不建立 Web 用户、Team authority、远程监听或跨 Host 推送。Meeting 创建只由 Captain-only DSH tool 发起，七个初始 child 的可信 parent 直接取自该次 tool 的 `exec.agent`；Remote 不提供 create，只保留经 local binding 授权的控制操作。提交成功或协议拒绝后，Client 重新读取完整状态；刷新通知只提示重新读取，断线时禁写，补读成功后才恢复写入。

面板和自然语言入口调用同一暂停、恢复、结束、贡献撤销/重新分配、决策和风险控制规则。活动会议显示暂停，暂停会议显示继续，并展示原因和 actor；强制结束、审核豁免、风险接受和部分完成也必须显示原因。Captain/local 专属决策和风险处置投影只能给相应调用者；普通 Participant 不能由 UI 字段或 Remote 输入绕过该边界。

## State And Failure Handling

DSH 接受输入、Session 投递成功、Agent 执行完成和 Meeting 事实提交是不同结果。恢复只重建可证实归属、仍允许继续的 Session/工作；缺失或损坏 ownership 时明确报告，不能以当前角色定义替换历史身份。Agent 内部工具失败不自动使 Meeting 失败。

## Security And Observability

插件不得扩大 DSH 已授予权限。日志、通知和 UI 不输出 capability、凭据、私有 Session 历史、隐藏推理或内部工具过程。可观察性以已提交 Meeting 事实为准，运行诊断不得成为领域事实源。

## Acceptance

1. 缺少必需 DSH 能力时无法创建部分可用 Meeting。
2. 会议身份的 Session 归属可验证且跨 Meeting/身份隔离。
3. 工具、面板和恢复使用同一领域控制规则。
4. Client 刷新或重开后获得一致事实，且不能扩展读取或控制权限。
5. 停止、恢复和归档均不会操作无法证明归属的 Session。
