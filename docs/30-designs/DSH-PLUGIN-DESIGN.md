# DSH Plugin Design

## Purpose

本文定义 Convivium 作为单个本地 DSH 插件的装配边界：角色资源、会议身份与 DSH Session 的绑定、受控后端入口、只读展示和本地刷新通知。

## Scope And Non-goals

V1 运行在一个本地 DSH Host，服务该 Host 的单一 loopback 用户边界。本文覆盖插件生命周期、必需 DSH 能力、角色资源、Session 归属、受控读写入口和本地面板；不定义会议领域规则、持久化算法、远程多用户、跨 Host 协作或独立服务。

## Related Requirements And Interfaces

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [Meeting Agent Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)
- [Meeting Remote Interface](../20-interfaces/MEETING-REMOTE-INTERFACE.md)

## Responsibilities And Dependencies

DSH Host/profile 拥有插件加载、模型、Preset、Skills、MCP、Sandbox、Approval、Session 生命周期和存储 provider。Convivium 只拥有会议身份与 Session ownership 的对应关系、领域操作的受控入口、Meeting 事实投影和角色资源溯源。插件的最低 DSH 版本固定为 `0.1.2-rc.1`；低于该版本或缺少必需 lifecycle capability 时，加载必须拒绝并说明原因，不提供降级会议模式。

每个 MeetingIdentity 使用独立、可持续的会议专用 Session；不同 Meeting、身份或授权范围不得共享。任何创建、继续、interrupt、恢复、停止或撤权都必须先验证持久 ownership，不能凭显示名、前缀或 UI 输入猜测。

Convivium 只限制自身会议操作的调用权限和模型可见的会议上下文；Agent 在 DSH 已授权范围内自行选择 Prompt、Skills、Tools、MCP 与内部工作方式。插件不得依赖具体 Skill、内部 Tool Schema、调用顺序或隐藏推理才能正确运行；Manager 身份不得以 Contributor 身份提交正式发言或 Position。

角色 Definition 只声明 DSH 已公开且经过预检的能力。预检在创建第一个会议专用 Session 前完成；缺少必需能力时拒绝创建，不通过临时修改 Prompt、权限或资源来降级。已创建身份的运行配置由 DSH 拥有，角色资源变更只影响新的 MeetingIdentity。

### Catalog and Definition conversion

Meeting Agent Catalog 是 Host 提供的只读安全投影；Convivium 只在需要 Manager 语义推荐时读取它，不把完整 Agent 配置、capability 或运行资源复制进 Meeting。Manager 可以基于已验证的 catalog snapshot 推荐 candidate，但推荐不改变参与者、权限、Round 或 Session。

Captain 对推荐作出接纳或拒绝的结构化处置；只有接纳后，Runtime 才能将 Meeting Agent Definition 的角色、权限边界和 provenance 转换为新的 MeetingIdentity，并在全部预检通过后创建独立 Session。任何一步失败不得暴露部分可用身份；历史 MeetingIdentity 的 descriptor 缺失时必须明确拒绝恢复，不能套用当前 Definition 重建。

## Plugin Lifecycle And Entry Points

插件入口只负责构造依赖、注册受控服务和登记 teardown；领域转换不位于插件入口、工具处理器、HTTP/Remote 处理器或 Client。

所有领域写入通过一个 Runtime 入口，验证 caller、Meeting、身份、当前版本和领域前提后才提交；读模型和归档只读取已提交 Meeting。工具、面板和恢复调用相同业务规则，不分别实现暂停、恢复、结束、决策或风险语义。

插件停止时不接纳新会议动作，等待已提交操作完成并释放插件拥有的资源；不能因关闭而删除已提交 Meeting 事实或操作无法确认归属的 Session。

## Local Client And Remote Boundary

面板先读取本地 Host 的全部可恢复 Meeting 摘要，选定后才读取完整状态。摘要不含 transcript、Session ID、capability、物理存储路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表返回暂不可用原因而不得伪装为完整可用列表。完整状态由类型化后端接口输出；Client 只展示，不计算领域状态、不写缓存事实。

V1 的 Web/Remote 入口仅在 loopback Host 可用时挂载，不建立 Web 用户、Team authority、远程监听或跨 Host 推送。提交成功或协议拒绝后，Client 重新读取完整状态；刷新通知只提示重新读取，断线时禁写，补读成功后才恢复写入。

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
