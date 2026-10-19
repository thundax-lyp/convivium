# DSH Plugin Design

## Purpose

本文定义 Convivium 作为单个本地 DSH 插件的装配边界：插件生命周期、受控后端入口、只读展示和本地刷新通知。角色资源、会议身份与 DSH Session 的绑定及投递由 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md) 维护。

本文只描述平级 Agent 目标设计；实现覆盖与未覆盖项由 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 记录。

## Scope And Non-goals

目标运行在一个本地 DSH Host，服务该 Host 的单一 loopback 用户边界。本文覆盖插件生命周期、必需 DSH 能力、受控读写入口和本地面板；不定义会议领域规则、Agent Session 生命周期细节、持久化算法、远程多用户、跨 Host 协作或独立服务。

## Related Requirements And Interfaces

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)
- [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md)
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)

## Implementation Modules And Ports

| 模块                    | 输入                                 | 输出                                       | 不变量                                 |
| ----------------------- | ------------------------------------ | ------------------------------------------ | -------------------------------------- |
| plugin/bootstrap        | Host lifecycle/capability registry   | Runtime、Tools、Remote factory             | 必需服务或版本缺失时不注册可写入口     |
| role-skills             | 包内固定 Skill 名称                   | Definition 与持久化格式共享的名称集合      | 不引入 DSH 能力或文件系统依赖         |
| role-composition        | 精确 Definition ID/version           | AGENTS/Preset/Skill 资源绑定、只读 Catalog | 不以当前默认版本或 displayName 回退    |
| dsh/meeting-agent-owner | PreparedDescriptor、SessionOwnership | 平级 AgentHandle 创建、恢复、停止结果      | 一 Session 只属于一个 Meeting identity |
| runtime/meeting-service | 可信 caller binding、MeetingCommand  | committed result、receipt、outbox          | 统一鉴权与领域转换                     |
| remote/loopback         | local binding、typed request         | typed result/refresh notice                | 只接受可信本地用户控制                 |
| client/projection       | caller-filtered committed view       | UI state                                   | 不推导 authority 或领域状态            |

DSH 具体 API 收敛在角色预检和 Agent owner；Meeting Domain、Remote DTO 和 Client 不依赖 DSH 实现类型。完整资源、ownership、创建和恢复结构以 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 为准，生命周期与投递顺序以 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md) 为准。

## Responsibilities And Dependencies

DSH Host/profile 拥有插件加载、模型、Preset、Skills、MCP、Sandbox、Approval、AgentSession 生命周期和存储 provider。Convivium 拥有 Meeting 事实、角色资源溯源、私有 Session ownership、Captain 创建来源、受控入口与投影。当前版本门禁只支持 DSH `0.2.0-rc.2`；版本或必需公开服务缺失时加载拒绝，不提供旧 child 降级模式。

专用 Web 安装根在首次创建 DSH `web` profile 时，将 `dsh.profile.patchReload` 从该版本默认的 `live`（插件安装后该字段也可能缺省）固定为 `startup`：当前解析到的 Cordis HMR 不提供 DSH live watcher 调用的 `registerConfig`，而 Meetings View 不依赖运行中修改 patch。所有 bundle、profile、home 和启动 overlay 仍在每次 Host 启动时完整应用；修改 patch 后须重启 Host。安装器不改写已经存在的 profile manifest，也不复制凭据。

平级会议身份、角色资源、Reviewer worker 与 Captain 来源的精确装配由 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md#responsibilities-and-dependencies) 维护；插件只在已验证 Host 能力和资源后开放受控入口。

Host 冷启动时，先完成 Meeting Runtime 的受控读写入口和全部会议工具注册，再恢复既有 Meeting AgentSession 及其投递 worker。Agent scoped setup 的 `tools.restrict` 要求 Definition 中的全局工具名已注册；若先恢复 Session，任何含会议工具的身份都会在 setup 阶段失败，使后续 Meeting 的投递和期限扫描无法启动。

生产 Meeting identity tool 暴露精确 MeetingCommand/action schema，Definition toolFilter 收窄可见面；Runtime 按 exec.agent 与 active ownership 独立授权。可信 loopback `conviviumMeetings.control` 提供结构化用户控制；已部署在 `DSH_HOME/skills/convivium/` 的用户 Skill 仅凭当前直接用户输入的一次性授权创建 Meeting 或显式取消指定 Meeting。普通会议工具不授予 Captain 权限。入口来源审计和 Session 装配见 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md#captain-caller-and-audit)；命令与审核状态转换见 [Meeting Design](./MEETING-DESIGN.md#authorization-and-transition-families)。

## Plugin Lifecycle And Entry Points

插件入口只构造依赖、注册受控服务和 teardown；所有领域写入通过同一 Meeting Runtime 入口。插件状态机为 new → validating → ready → stopping → stopped，或 validating → rejected。validating 校验精确 DSH 版本、平级 Agent/Session、Preset、Skill、Storage 和 loopback 必需能力；ready 才注册可写 Tools/Remote。stopping 立即拒绝新 command，等待已开始的原子提交，保留未完成 outbox，然后仅释放插件已证明归属的 AgentHandle；不关闭用户输入 Session 或其他 Meeting 的 Agent。

会议身份的创建、provisioning、pause、end/archive 和 Host 冷恢复执行顺序见 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md#state-and-creation-flow)。

## Local Client And Remote Boundary

面板先读取本地 Host 的全部可恢复 Meeting 摘要，选定后才读取完整状态。摘要不含 transcript、Session ID、capability、物理存储路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表返回暂不可用原因而不得伪装为完整可用列表。完整状态由类型化后端接口输出；Client 只展示，不计算领域状态、不写缓存事实。

面板只提供 MO-FR-11 的暂停/恢复/异常取消，会议创建与指定会议取消可通过 MO-FR-18 的显式 `/convivium` Skill 执行；完整结构化 Captain 命令仍保留在可信本地 Remote 契约中。字段与失败行为遵循 Meeting Interface，来源接线见 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md#captain-caller-and-audit)。面板取完整读取的 snapshot 作为命令版本，在一次提交时分配 requestId 并于网络结果不确定的重试中复用；VERSION_CONFLICT 时补读并提示重试，不自动覆写。Contribution 授权与任务重新分配保持只读。断线、陈旧、提交中和领域不允许的状态禁写；Agent 不能通过用户视图获得权限。

Convivium Client plugin 拥有 typed locale namespace `convivium.meeting`，依赖 DSH 公开 locale service 一次注册 key 集合平衡的 `zh`、`en` dictionaries，并使用 DSH locale preference 与 English fallback，不建立 Convivium 独立设置或持久状态。`conversation.view` 标签通过 translation thunk 读取当前 locale；Panel 顶层接收 slot locale seat 注入的 typed translator，经 `MeetingTranslationProvider` 提供给组件树，由组件调用 `useMeetingTranslate` 消费。slot locale revision 触发顶层重新渲染时，已挂载页面更新文案而不重新注册 slot；纯格式化函数仍显式接收 translator。翻译只属于 presentation：Meeting projection 中的用户或 Agent 内容、Domain/Protocol enum 值、错误码、command reason、Remote、Storage 和权限语义保持不变；已知 enum 只映射为本地化展示 label，`ProtocolFailure` 在 UI 只映射为本地化自然语言，不展示诊断 code 或 server message。

### Meetings View 组成

删除清理失败后，Navigator 继续展示 catalog 意图的最小摘要与“删除未完成，可重试”状态；刷新、取消确认和重新打开菜单不会丢失显式重试入口。该状态只能再次删除，不能恢复详情或业务写权限。删除成功后以不含业务内容的持久标记阻止原创建请求重新登记，不删除或复用历史 Session。

会议删除遵循 MO-FR-19 和 [Meeting Deletion Boundary](../20-interfaces/MEETING-INTERFACE.md#meeting-deletion-boundary)：Navigator 的打开动作后增加分隔线与危险删除动作，并在确认框明确“永久删除会议业务数据，保留已关闭的 Session 和聊天历史”。删除执行前由 Runtime 重验非进行中状态（排除 running、converging、paused）；持久删除意图禁止继续读写和授权，随后停止目标会议工作并释放关联 Session handle，保留聊天历史；业务 Repository 只清理精确会议的数据，不调用 Host 的 Session 删除服务。成功后清除被删除会议的选择和展示状态，不自动选择其它会议；失败或清理未完成不报告成功。

Client 只注册一个 `conversation.view: convivium-meetings`，不注册独立 Timeline View：

```text
DSH Conversation
│
├─ Chat
└─ Meetings
    ├─ Meeting Navigator            MeetingSummary[]
    └─ Selected Meeting Workspace   selectedMeetingId
        ├─ Meeting Header
        │   ├─ 标题、状态与 version
        │   └─ controls 允许的暂停 / 继续 / 结束
        ├─ View Switcher
        │   ├─ 概览
        │   └─ 时间线
        └─ Content                  同一 caller-filtered MeetingView
            ├─ OverviewContent
            └─ TimelineContent
```

UI 角色名称统一为 Captain → 用户（User）、Manager → 主持人（Moderator）、Contributor → 嘉宾（Guest）；审核者与系统名称保持不变。内部角色标识、身份资源和权限不变，工程文档中的 Captain、Manager、Contributor 仍指对应内部角色。角色筛选、身份标签及缺少显示名称时的角色回退均使用该映射；Manager plan 的内容类型显示为“主持安排”，事件显示为“安排讨论”。

筛选区域按“角色 → 类型 → 事件”排列。“角色”统一筛选实际事件行为者，按用户、主持人、各嘉宾与审核者的可见姓名、系统展示；嘉宾和审核者选项直接显示姓名，不加角色前缀，缺少姓名时使用角色与序号；多选取并集，未选择时显示全部。用户和系统分别匹配 captain 与无身份的 system 事件，具体 Agent 绑定原身份 ID；不以关联身份推断行为者。不再提供独立角色隐藏按钮。

筛选区有顶部留白；各行采用左侧加粗、列对齐且等宽的分类标签（标签内部文字居中）与右侧选项网格，标签和选项首行水平对齐，选项允许换行并保留间隔，仅选中项显示小圆角方形边框与背景；分类标签有选中与未选状态，没有选项被选时分类标签选中，表示不限制该分类；有选项被选时分类标签未选中。 分类标签列为 40px，左内边距 5px，与选项间隔 4px；选中的标签与选项统一使用 DSH 的 0.5px `--dsw-alias-border-l3` 边框及 `--dsw-alias-interactive-bg-hover` 背景。点击分类标签只清除该分类的已选项；选中选项仅展示匹配分类的内容，同分类多选取并集、跨分类取交集。“展开 / 收起”采用链接式文字控制，保留按钮的键盘与可访问语义。

筛选区域默认仅展示第一行“角色”；展开/收起控制始终位于筛选区右上，与首排选项对齐；不提供“清除筛选”按钮。展开后按顺序显示“类型”和“事件”，控制变为“收起”。收起仅隐藏后两行，不清除已选条件、不改变过滤结果；再次展开保留选中状态。展开控制支持键盘操作，并向辅助技术暴露展开状态及受控区域。

“类型”按 Event.subject.kind 筛选，显示业务内容名称，例如讨论轮次、证据、证据审核、审核反馈、轮次成果、主持安排、会议结果和会议归档；“事件”按 Event.kind 筛选，描述具体发生的行为。 中文事件标签尽量不超过四个字，在保留事件含义与可区分性的前提下使用简短文案，例如“状态变更”“审核送达”“发布消息”；事件名称优先使用动词在前的表达：创建会议、安排讨论、开启轮次、提交举手、处理举手、提交证据、领取审核、提交审核、发布成果、发布消息、结束会议、开始归档、完成归档；审核失败等结果描述保留自然语序。不修改 Event.kind。两者不改变事件字段和内部标识。

DSH 的 `Meetings` 标签是功能级导航；Workspace 内使用视觉较轻的次级选项卡切换“概览 / 时间线”。Navigator、Header、切换器和内容由同一个 Client workspace owner 组合，不通过 `openView()`、URL、第二个 slot entry 或 module-global store 同步选择。

没有非空 last-good 摘要时，初始 list loading、list failure 和确认的 empty list 都由占满主区域的 Navigator 使用同一个 `Empty` 品牌图形与对应本地化文本呈现，不显示搜索、Workspace、分隔条或手动 retry。取得非空列表后才建立双栏；未选择 Meeting 时，Workspace 渲染居中的 `Empty` 品牌图形和本地化选择提示，图形尺寸固定为 112px，不展示刷新按钮、详情 Header 或模式选项卡。详情加载与缺失状态沿用较小的状态图标。

选中 Meeting 后，Content 右上角提供带无障碍名称的圆形刷新图标，用于手动补读列表和已选会议详情。正常状态在 Content 悬停或键盘焦点进入时显示；列表或详情读取失败、缓存陈旧时持续显示；无悬停能力的设备上持续显示。图标不遮挡会议标题。

Overview 和 Timeline 详情可用时，右下通过 sticky slot 放置竖向 ButtonGroup，组内两个 30px 图标按钮分别回到顶端和去底端，与刷新按钮右侧对齐、距右侧 8px。悬停 Workspace 或键盘焦点进入时显示整个按钮组，无悬停能力设备上保持可见。滚动、内容或视口尺寸变化时测量当前 Workspace：顶端禁用向上，底端禁用向下，无需滚动时均禁用。点击仅滚动 Workspace 到对应边界；未选择会议或详情尚不可用时不展示。

时间线事件卡片纵向间距固定为 20px，不提供缩放控件。

身份筛选使用 caller-visible 的 displayName 与角色；缺少名称时使用角色与序号，不回退到内部 ID。概览中的发布入口使用轮次目标，审核送达与完成事实展示状态及理由；时间线内容仅有原始对象 ID 时使用对象类型替代，不展示作为归档详情的原始 ID。key、筛选值及定位关联保留内部 ID，正文和证据引用编号保持原文。

取得非空列表后，Navigator 使用“讨论区”区头和本地摘要搜索，列表以 `role="tree"` 呈现，每行以生命周期图标、单行省略的 objective 与相对 `updatedAt` 组成，按 `updatedAt` 倒序排列；相对时间由 Navigator 的单个时钟每分钟刷新。图标使用 DSH UI primitives，颜色使用 Host theme 语义变量；搜索无匹配使用搜索图标与 Client `Empty` 组件。搜索和排序只处理已获得的 `MeetingSummary[]`，不发起详情请求，也不改变选中 ID。

会议标题悬停时使用 DSH `Tooltip` 显示完整目标。会议行在悬停或键盘聚焦时以省略号替代尾部时间，点击后使用 DSH `Menu` 显示生命周期、“查看会议”、分隔线和危险“删除会议”；删除不可用时菜单显示原因。信息浮层与操作菜单独立，打开菜单或取消删除确认均不选择会议。删除使用 DSH `RiskConfirmation`，要求用户勾选不可撤销后果；删除与用户 command 共用一个提交锁，失败不清除选择、不报告成功。

非空列表首次可用时，Workspace 以 180ms ease-out 的 opacity 与小幅水平位移动画进入；`prefers-reduced-motion: reduce` 时禁用动画。动画依赖 Workspace 从页面级列表状态进入布局时的挂载，不在普通刷新、详情更新或保留 last-good 数据时重新播放。宽屏时，Navigator 与 Workspace 之间的分隔条可通过指针拖动或方向键、Home、End 调整 Navigator 宽度；当前实现以 280px 为初始值，在 220–480px 与容器可用宽度内约束，尽量给 Workspace 保留 320px。该宽度只是可丢弃的本地展示状态，不进入 URL 或持久事实。浏览器进入窄屏断点，或 Host 实际内容列不足以容纳 220px Navigator、320px Workspace 和 16px 分隔区域时，沿用导航抽屉，不显示分隔条；内容列恢复后继续使用先前设定的宽度。

Meeting panel 的高度以 Host 可视内容区为界，并给底部固定输入区留出空间；宽屏 Navigator 和 Workspace 分别滚动，窄屏 Workspace 独立滚动，不让长 Meeting 内容撑高整个 Host 页面。

Meeting Client 的静态样式随组件放在 CSS Module 中，颜色使用 DSH theme 提供的语义变量；Host 负责应用当前主题，Client 不另建主题状态。运行时计算的面板高度、Navigator 宽度和 Timeline 卡片间距通过组件局部 CSS 变量传给样式。

Workspace 只拥有可丢弃的展示状态：

```ts
interface MeetingsWorkspaceState {
  selectedMeetingId?: string;
  activeMode: "overview" | "timeline";
  focusTarget?: { meetingId: string; objectKind: string; objectId: string };
  timeline: {
    participantFilter: string[];
    typeFilter: string[];
  };
}
```

这些字段不进入 Meeting、Remote、URL 或持久事实。初次挂载只调用 `list()`；用户选择后才 `read()`。选择不同 Meeting 时设置新 ID、切回概览并清除旧 Meeting 的 focus 与 timeline 状态；重复选择当前 ID 是 UI no-op。每次详情读取携带请求时的 Meeting ID，只有该 ID 仍等于当前 `selectedMeetingId` 时才可提交结果，旧选择的迟到成功或失败都被丢弃。完整摘要补读后 ID 仍存在则保持选择和模式，不存在则清除选择；详情失败保留 ID，retry 只读取该 ID。不得把失败返回的残缺列表与 last-good 列表合并成新的选择来源。

`MeetingClient.list/read/control/deleteMeeting/subscribeRefresh` 仍是唯一 Client 数据入口。概览与时间线共享一份已选 `MeetingView` 和刷新订阅；refresh notice 只触发补读，不携带事实。Client 可以保留 last-good 摘要与详情用于断线展示，但必须标记陈旧并禁写，完整补读成功后才解除。删除成功使刷新 generation 失效并清除目标条目；只有删除当前选中会议才清空选择、详情、focus 和时间线状态，不自动选中其它会议。

### 概览

共享 Header 显示讨论目标（`objective.statement`）、lifecycle 和 version；概览不重复这些字段，按以下顺序从当前 `MeetingView` 渲染，不生成新的业务摘要或状态：

1. “目标”：Objective 产出要求、验收标准与约束；
2. “议题”：当前 Agenda；
3. “结论”：存在时的 Termination outcome、当前和历史 CompletionFact；
4. “开放项”：Question、Issue 与 RiskDisposition；
5. 记录：每轮的 Publication、成对的 EvidenceVersion/EvidenceReview、关联的 ReviewDelivery、按 `seq` 排列的 FormalMessage、未形成证据的失败 Contribution，以及明确不举手或到期未回应的参与者；

记录仅使用 caller-visible MeetingView 的真实数据，不通过 URL 参数注入调试轮次；按 Round 的 `openedAt` 排列，标题只显示轮次问题，前置 `open|published|aborted` 的文字图标，状态名称保留在可访问名称中；Publication 只显示标识，不展示 `exitReasons`。每轮按贡献者显示名称排列记录，同名时按身份 ID 和记录 ID 保持稳定顺序。与 EvidenceVersion 显式关联的 FormalMessage、审核状态或 Review 放在同一贡献者记录下；已有可见 Review 时只显示 Review，尚无 Review 时显示 EvidenceVersion 审核状态，之后提供“查看证据”按钮；按钮打开 DSH Modal，展示该可见版本的完整字段，关闭后回焦。无可见证据关联的 FormalMessage 仍作为独立记录展示。尚无可见证据的 Contribution 显示其真实状态；失败 Contribution 与 `declined`、`no_response` 各自占一条贡献者记录，不在概览中另设进展日志。失败条目只是从 Contribution 派生的展示内容，不创建 FormalMessage 或证据链接；`execution_failed` 使用结构化 `failureSummary`，其他未形成证据的终态使用其 `exitReason`。已发布的最终 EvidenceVersion 与其 `versionId` 对应的 Review 成对展示；活动 Meeting 中仍未发布、但对当前 caller 可见的版本与审核留在所属轮次内，不因为布局合并扩大可见范围。`round_evidence` 发言在发布时由最终 EvidenceVersion 生成，引用该版本和 Review，它不是独立提交的第二份证据。可见但无法关联到可见审核的 ReviewDelivery 在同一区域单列，避免丢失投递失败状态。归档展示从完整 ArchiveView 取 Publication、EvidenceBundle 与 FormalMessage，不展示未公开版本。原独立“证据”区域不再重复渲染。概览不显示独立技术信息区，也不提供指向已移除技术信息条目的概览定位入口。

观点正文使用贡献者随 EvidenceVersion 提交的独立 `summary`，审核覆盖摘要与完整证据的一致性；完整证据内容在证据 Modal 展示。对话框以当前轮次议题为标题、顶部元信息按水平等宽三列分别显示贡献者名称、状态值和时间值，不显示“审核状态”“提交时间”标签，存在时的失败原因附在状态列，使用较小字号和次级文字颜色，并通过淡分隔线及留白与正文区分；标题、副标题与关闭按钮保持可见，仅正文区域滚动，不展示证据版本号与审核失败次数。叙述字段使用 DSH `MarkdownText`（过滤原始 HTML 与不安全协议）渲染，应用对话框内的 Markdown 样式，统一标题、段落、列表和表格间距，代码块与宽表可横向滚动；资料定位和版本等结构化引用字段仍保留原文。历史缺少摘要时直接显示 FormalMessage 原文，沿用 Ellipsis 的三行折叠与展开/收起交互；原文在 Modal 保留，不从 interpretation 或正文截断合成摘要。未发布版本在 caller-visible 范围内显示已有摘要。

概览区域共用 `overview/components/` 的 Section 容器；带定位目标的区域由它保留聚焦属性。同目录的 OverviewItem 将传入的 `sign` 与文本 Ellipsis 或交互内容并列放在 ListItem 中、顶端对齐；记录中的“查看证据”按钮也使用该 Item 的布局。`overview/objective/`、`overview/agenda/`、`overview/outcomes/` 和 `overview/open-items/` 分别持有目标、议题、结论和开放项的投影选择、状态图标及条目渲染；各自按状态（RiskDisposition 按 action）选择文字图标，不使用跨区域的状态映射。`overview/records/` 持有记录的归组、排序及渲染。Objective、Agenda 和 Termination outcome 的生成状态文案不在正文显示，状态名称保留在可访问名称中。Termination 正文直接显示 reason，不添加“会议结果：”前缀。其余条目继续展示原有业务文本；记录中的轮次状态使用标题图标，观点和审核分别显示 💡 与 💬，新观点正文直接显示 FormalMessage.body 且不添加 kind 前缀，审核正文直接显示内容且不添加 Review ID 前缀，正文不重复类型文案，类型名称保留在可访问名称中；其余普通条目显示中性圆点，未形成证据的退出显示警示图标。长文本由 Ellipsis 按 `maxLines` 显示预览，其中轮次发布与观点最多预览 3 行。只有末尾的「...展开」按钮会展开全文；「收起」按钮位于全文下一行的右侧。

Header 的暂停、继续和结束 lifecycle control 由 `MeetingView.controls`、last-good/陈旧状态和单个 pending command 联合决定是否呈现或启用。开放轮次不能执行 `EndMeeting`，投影不提供对应 control，避免面板呈现必然被领域拒绝的异常取消入口。概览内的 Contribution 授权 和 Risk 对象不渲染写控制。归档 Meeting 不渲染运行期进展和写控制；成功或协议拒绝后完整补读，不自动重试 command。

### 时间线 Client projection

时间线只读，并从已选详情即时建立可丢弃节点：

```ts
interface TimelineNode {
  key: string; // event:<eventSeq>
  eventSeq: number;
  meetingVersion: number; // 仅用于核对同一次提交，不进入 milestone group
  eventKind: MeetingEventKind;
  objectKind: string;
  objectId: string;
  time: number;
  lane: "captain" | "manager" | "contributor" | "reviewer" | "system";
  identityId?: string;
  relatedObjects: Array<{ objectKind: string; objectId: string }>;
  eventData: MeetingEventDataByKind[MeetingEventKind];
}
```

`TimelineNode` 是基础 `MeetingEventView` 的 Client 展示投影，不离开 Client，也不反向写入事件日志。节点先用 event `data` 呈现发生时不可变的 status、reason、summary 或 failure，再用同一 caller-filtered `MeetingView` 中与 `subject` 匹配的 DTO 补充当前可见详情；不得用当前 DTO 覆盖已经记录的历史值。对象当前已不可见或已被替换时仍可显示 event 自带的安全 occurrence 数据和稳定对象 ID，不反向猜测完整对象。排序固定为 `time → eventSeq`；`eventSeq` 只消除同一时刻的 UI 抖动，不表示业务因果关系。首版不绘制事件间推断性因果箭头。

#### 阶段性里程碑与事件分组

时间线的展示模型分为两层：阶段性里程碑是章节，事件是章节内已经发生的事实。里程碑标题、阶段状态、时间范围和摘要只组织当前 caller 可见的 `TimelineNode`，不创建新的领域 event、提交记录或完成结论，也不离开 Client：

```ts
interface TimelineMilestoneGroup {
  key: string;
  kind: "meeting_start" | "round" | "completion" | "closure";
  occurrence: number;
  title: string;
  status: "active" | "completed" | "aborted" | "blocked";
  startedAt: number;
  completedAt?: number;
  eventKeys: string[];
}
```

`occurrence` 区分同类阶段的多次进入，只存在于 Client group。固定 key 为 `milestone:meeting-start:1`、`milestone:round:<roundId>`、`milestone:completion:<occurrence>`、`milestone:closure:1`。meeting-start、closure 的 occurrence 为 1；round occurrence 是 `round.opened` 按 `eventSeq` 出现的序号；completion 的每个独立实例从 1 开始递增 occurrence。没有事件节点的内部实例不输出 group。

分组器先对完整、未经过详情开关或显式筛选的 event nodes 按 `eventSeq` 执行以下确定性 reducer，再对每组节点应用可见性筛选；筛选不得改变 group key、occurrence、status、startedAt 或 completedAt，筛选后没有可见节点的 group 不渲染。摘要只能读取筛选后仍可见的节点。

1. `meeting.created` 建立并完成 meeting-start，且该事件归入该组。
2. `round.opened` 建立对应 round group；后续只有 subject 或 relation 明确指向该 round ID 的 round 类事件才能进入。`round.published` 将其完成，`round.aborted` 将其中止；找不到已建立 round group 时作为未归属普通卡片，不补建或回填历史 round。
3. 不建立 convergence 分组。主持计划、Question/Issue/Risk 处置事件仅在存在唯一明确 round 关联且该 round 已建立时归入该轮次，包括已经结束的轮次；无关联或关联歧义时作为未归属普通卡片，不按时间或文本猜测。
4. completion 类事件建立或复用当前 completion，新的独立实例递增 occurrence；不创建内部 convergence。
5. `meeting.lifecycle_changed` 离开 converging 时，有当前 completion 则归入它；目标非 terminal 时按 paused → blocked、其它 → completed 关闭并清除当前 completion。无 completion 时事件作为未归属普通卡片。目标 terminal 的 completion 留待 meeting.ended 关闭。
6. `meeting.ended` 先关闭仍活动的 completion：event data outcome=`completed` 时标记 `completed`，`partial|no_consensus|cancelled|failed` 时标记 `aborted`，`completedAt` 取该事件时间；该事件本身只建立 closure 并归入 closure。`archive.started`、`archive.completed` 进入已经建立的 closure，缺少 closure 时作为未归属普通卡片。`archive.completed` 完成 closure。
7. 已关闭 round 的正式消息归组例外：`formal_message.published` 的 typed relations 必须唯一指向一个已扫描的 `round.published` subject publication 和它所属的 round，且两条事件的 `meetingVersion` 相同；该正式消息仍归入原 round，但不得修改其 occurrence、status 或 completedAt。仅凭 round ID、时间相同或相邻 seq 不满足此例外；不同提交、publication 关联缺失或冲突时作为未归属普通卡片。
8. 未命中上述唯一规则的事件作为未归属普通卡片。除第 3 条的明确轮次关联协调事件及第 7 条的同次 publication 正式消息外，已经关闭的里程碑保持不变，不把后续事件回填为其历史。

状态只从上述明确事件派生：meeting-start 当场完成；round 为 active/completed/aborted；completion 为 active/completed/aborted/blocked；closure 为 active/completed。`startedAt` 取该组首个实际成员的 `occurredAt`，`completedAt` 只取明确关闭事件。不得根据沉默、时间间隔、当前 DTO 状态或下一组已经出现推断本组完成。

默认分组承担以下用户叙事：

| 里程碑         | 默认关键事件                                                            | 可展开的过程细节                                                     |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 会议启动       | 创建或启动、目标或范围确认、准备失败                                    | 身份推荐、准入和其它准备过程                                         |
| 议题与证据轮次 | 轮次开启、证据提交、审核完成或失败、审核送达失败、Publication、轮次中止 | 举手、拒绝、未回应、Contribution 处置、送达成功 |
| 完成判定       | CompletionFact 形成、替代或撤销，影响完成判定的未解决事项               | 支撑完成判断的普通正式消息和任务过程                                 |
| 结束与归档     | Termination、异常取消、Archive 完成                                     | 正常关闭过程和可复用材料关联                                         |

所有 caller-visible 事件默认展示，不提供“显示过程细节”开关；正文详情可展开，显式筛选可缩小范围。Contribution 执行失败、轮次中止、审核失败或送达失败等具有明确已发生时间且会影响推进的异常不得因属于过程类型而被隐藏。里程碑以居中压在时间线主轴上的全宽、低高度且带浅背景的横向宽条展示阶段标题；仅完整事件序列中存在多个同名里程碑时显示序号，筛选不改变该判断。所有里程碑横框均不展示状态；不以外围边框或背景包住整组事件。阶段内事件卡片仍沿主轴左右排列，会议启动固定为首个里程碑，主轴不向其上方延伸；其余阶段保持既有排序，阶段分组与筛选语义不变。阶段标题不重复充当事件卡片；活动里程碑默认展开，完成的历史里程碑可以折叠为只使用组内可见事实生成的摘要。

事件归组先使用事件的 `subject.kind`、`kind` 和带类型 `relatedObjects`；关联不足时作为未归属普通卡片，不得按时间接近、文本相似、身份相同或业务常识猜测。一个 `TimelineNode` 只有一个主里程碑；它与其它阶段的显式关系只用于筛选、高亮和定位，不复制节点。`startedAt` 取组内最早节点的时间，只作为展示排序依据，不宣称领域阶段在该时刻开始；会议启动固定首位，其余里程碑组按 `startedAt` 排列，组内继续使用 `time → eventSeq`。分组后的 DOM 阅读和键盘遍历顺序与该展示顺序一致。

| 事件 kind                                                                                                                                                                            | 主分组                                                 | 默认可见性   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------ |
| `meeting.created`                                                                                                                                                                    | `meeting_start`                                        | 默认展示     |
| `round.opened`、`evidence.submitted`、`evidence_review.submitted`、`review_delivery.recorded`、`round.published`、`formal_message.published`、`round.aborted`、`contribution.failed` | subject 或 relation 指向的 `round`                     | 默认展示     |
| `hand_raise.recorded`、`hand_raise.disposed`、`round.participation_recorded`、`contribution.closed`、`evidence_review.claimed`、`evidence_validation.failed`                         | subject 或 relation 指向的 `round`                     | 默认展示     |
| `manager_plan.recorded`、`question.disposed`、`issue.disposed`、`risk.disposed`                                                             | 唯一明确关联的 round；无关联或歧义时作为未归属普通卡片 | 默认展示     |
| `completion_fact.recorded`、`completion_fact.changed`                                                                                                                                | 当前 `completion`；没有活动实例时建立                  | 关键         |
| `meeting.ended`、`archive.started`、`archive.completed`                                                                                                                              | `closure`                                              | 默认展示     |
| `identity.recommended`、`identity.admission_recorded`                                                                                                                                | 未归属普通卡片                                         | 默认展示     |
| `agenda.activated`、`agenda_candidate.disposed`、未被上述 reducer 用作进入或离开 `converging` 边界的 `meeting.lifecycle_changed`                                                     | 未归属普通卡片                                         | 关键状态变化 |

活动和归档 Meeting 都只从该数组建节点，DTO 时间字段只用于正文展示，不再产生节点。deadline、outbox、Session notice 和 delivery retry 不进入事件日志或时间线。

Meeting 时间线只调用事件 projection，不保留 `buildTimelineNodesFromLegacyView` 或 DTO 时间字段 fallback。缺少完整事件日志的既有测试数据按确认范围删除；不增加旧数据识别或拒绝机制，不回填历史。共享 `MeetingView` 中事件字段为 optional 仅服务 identity 的事件可见性隔离，不代表 Captain 读取可以缺少日志。

lane 只从事件 `actor` 派生：`captain` 固定为 Captain，`system` 固定为系统，`identity` 使用同一 view 的 `IdentityView.roles`；identity 同时具有多个角色且事件 kind 不能唯一确定行为角色时使用系统 lane，但仍显示该 `displayName`。关联身份、assignee 与业务常识不能替代 actor。角色和状态不只用颜色表示。

时间线提供 参与者、object type 和事件 kind 筛选，以及滚动。全部事件默认展示遵循 MO-FR-17.19；显式筛选显示匹配的事件。卡片左右交错，每个真实里程碑首张可见卡片从左侧开始，`round.opened` 参与交替计数；里程碑背景由事件 kind 与 occurrence data 派生，正文使用原生 details 展开。筛选只处理 caller-filtered 节点；空结果使用不披露隐藏对象的中性文案。当前不实现全文搜索、额外 event ID 或因果推断。

### 模式定位、响应式与失败

概览不显示时间线导航或对象跳转按钮；用户通过 Workspace 的时间线 Tab 进入时间线。时间线到概览的定位设置 `activeMode="overview"` 和同一 Meeting 的 `focusTarget`。目标挂载后展开、滚动和聚焦，成功或失败均清除一次性 focus。多 phase 对象默认定位时间最晚节点并允许查看其他 phase。目标不存在、被 caller filtering 删除或目标模式不展示时只报告中性失败，不修改筛选、Meeting 或权限。

存在非空可用列表时，宽屏 Navigator 是常驻左栏；窄屏将同一 Navigator 呈现为当前 Meeting 按钮与摘要列表抽屉，抽屉关闭后 Workspace 占满宽度，这两个呈现共享唯一 `selectedMeetingId`。没有非空列表时不进入抽屉结构，Navigator 页面状态直接占满宽屏或窄屏主区域。时间线采用纵向左右交错卡片，窄屏必要时横向滚动，保留五类角色文字与隐藏控制；卡片首排左侧使用 40px 彩色卡通角色头像，右侧上方显示身份名称（无名称时显示角色），下方以 11px 浅色文字显示时间。用户为暖金背景人像、主持人为酒红背景耳麦人像、嘉宾为紫色背景对话气泡人像、审核者为橄榄绿背景眼镜与勾选徽章人像、系统为暖金背景机器人；统一使用无腮红、沉稳表情的卡通母稿，经 SVG 内嵌 PNG 与各角色视口裁切加载；头像作为装饰设置 aria-hidden，不重复播报角色；DOM 按时间排序，方向键遍历相邻可见时间节点；定位后焦点落到目标卡片并由可访问文本报告时间、身份、类型和状态。

状态呈现如下：

| 状态                         | Navigator                          | Workspace                        |
| ---------------------------- | ---------------------------------- | -------------------------------- |
| loading list, no last-good   | 品牌 Empty 与 loading text         | 不渲染                           |
| empty list                   | 品牌 Empty 与 empty text           | 不渲染                           |
| list ready, no selection     | 完整摘要列表                       | 提示选择，不读取详情             |
| list failure, no last-good   | 品牌 Empty 与 error text，无 retry | 不渲染                           |
| list refresh failure         | last-good 标为陈旧并显示错误       | 保留当前 Workspace 并禁写        |
| loading detail               | 保留选中项                         | Header/当前模式骨架              |
| detail failure               | 保留选中项和其他摘要入口           | 当前 ID 错误与 retry，不自动改选 |
| disconnected/refresh failure | last-good 标为陈旧                 | 保留内容、禁写并提供适用 retry   |
| focus target missing         | 不变                               | 中性定位失败                     |

所有新增标签、筛选、状态、按钮和 ARIA 文案进入 `convivium.meeting` 的 `zh`、`en` 等键词典。用户/Agent 内容保持原文；时间只通过 DSH/Host locale 与时区格式化，不能从显示字符串推导数据。

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
6. Client 只注册一个 `convivium-meetings` View；未选择 Meeting 时不读取详情，概览和时间线共享同一选择、详情与刷新订阅。
7. 切换 Meeting、补读后选中项消失、详情失败和断线分别按 Meetings Workspace 状态规则处理，不发生隐式改选或跨 Meeting 本地状态泄漏。
8. 活动与归档 Timeline 分别只从其允许的 caller-filtered 数据源确定性生成节点；身份角色、系统角色、多 phase、筛选与定位不生成新事实或泄露隐藏对象。
9. 宽屏侧栏与窄屏抽屉共享选择状态；左右交错卡片、角色标识、键盘顺序、焦点、本地化和颜色之外的状态表达通过 Client 与真实 DSH Web 验证。

时间线卡片第二排左侧为事件名称，右侧为“查看”链接样式按钮，沿用概览定位行为。正文展示对应事件的已记录内容，不单独展示对象类型、不使用对象 ID 或状态作为正文占位。用户事件展示对应输入原文的前提是事件确实记录该原文；当前 meeting.created 的事件数据为空，不从当前会议标题或后续内容回填创建输入。

未归属事件保留为无标题、无状态的普通时间线卡片，不展示“其他已发生事件”里程碑横框。每张未归属卡片按自身事件时间与真实里程碑块排列，会议启动仍置顶；未归属事件不创建里程碑 group，也不按时间邻近归入轮次。

轮次开始处横框仅显示“第 {n} 轮”（英文 Round {n}），其中 n 为该轮次序号，即使只有一轮也显示序号；不在轮次开始处显示最终状态。轮次发布、轮次中止由对应时间位置的事件卡片表达，内部完成状态与筛选归属不变。

所有里程碑横框均不展示状态，避免将最终状态提前展示为当前时间点的事实。非轮次里程碑仅同名重复时展示序号；内部状态仍保留用于既有归属逻辑，完成、中止等事实由对应事件卡片表达。

事件卡片默认使用 -64px margin-top，向上错开形成左右交错感；真实里程碑横框下的首张事件卡片 margin-top 为 0，无里程碑标题的普通卡片仍保留负顶部间距。

Client 先生成展示块和左右位置，再渲染：未归属事件直接输出普通卡片，不创建 other 里程碑；每个真实里程碑首张卡片为左侧，其后按可见卡片顺序左、右交替，轮次开启也计入交替计数，普通卡片延续当前计数。

时间线配色使用 DSH 语义 token：事件卡片以 bg-layer-1 为底，关键事件叠加 interactive-bg-hover 并使用 border-l3，异常事件使用 state-warn-primary 边框；查看链接与键盘焦点使用 link，姓名/正文使用 label-primary，时间使用 label-tertiary。头像保留已确认的品牌插画配色。

角色头像的 SVG 视口收紧到彩色圆底内（394×394），圆形容器裁切后不露出母版的米白外背景，浅色和深色主题共用同一头像。

## Codex Provider Composition

本节的 provider 与 D1–D5 会议装配已实现并通过确定性验证；已完成一轮真实核心链路冒烟，剩余真实验收按人工交接收口；完整两轮验收未通过，事实与未覆盖边界见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#acp-native-execution-migration)。公开配置、精确模块路径/签名和持久协议以 [DSH ACP Execution Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md) 为唯一依据；身份/准入由 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 拥有，owner/worker 接线由 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md#codex-session-integration) 拥有。

`plugin/src/plugin-entry.ts::apply/meetingConsumerPlugin` 在 acpCodex 缺省时保持现有组合，不注册新 route、探测或进程。启用时通过显式 ctx.inject 声明原 meetingServices、subprocess 与 storageDomain 为全部必需依赖；服务尚未激活则等待，不在 inject 前通过即时 ctx.get 抛缺服务错误。依赖齐备才先 createCodexAcpProvider 打开技术 domain 并注册 LlmAdapter，再调用 `activateTargetMeetingApplication`。必需服务始终缺失则 consumer 不激活，路由冲突或创建失败拒绝本次激活；依赖撤销时随 consumer fiber 释放会议运行时、工具和 provider。保持会议工具先注册、owner/Session 再恢复的现有顺序。

`plugin/src/dsh/acp-codex/` 负责 connection/process、原生 prompt、store、provider 和 compaction；不执行 Meeting command。provider factory 统一持有 route/domain/连接生命周期。`plugin/src/runtime/meeting-lifecycle.ts::activateTargetMeetingApplication` 显式把可选 CodexAcpProviderPort 传给 owner、review dispatcher、notice dispatcher、review tool 和 read projection，不读取 ctx.acpRecovery 等虚构服务。不新增顶层工程、通用 adapter registry、installer 或跨表事务。Host 安装并登录 bridge，发行包不内置它。

压缩边界是单独的 Cordis 入口 `@convivium/dsh-plugin/acp-compaction`：`plugin/src/dsh/acp-codex/compaction.ts::CodexCompactionBoundary` 继承 Host 的 BasicCompactionEngine，在八个 Preset 既有隔离组替换默认 backend，非 ACP 调用仍委派原实现。构建增加独立 Node entry 与 package subpath，不通过 provider 注册第二个同名 Service。prepareSession 使用 agentPresets.serviceFor 核查已装配边界；spawn 保持继承父 Preset，未装边界的自定义 Preset 拒绝 ACP。精确行为见 ACP 接口的 Prompt, MCP And Stream。

关闭先拒绝新的会议投递并停止 owner，再 provider.close：禁止新请求，取消活动 prompt 并等待结算，再 drain 连接/进程，关闭技术 domain 并注销 route。owner 在 pending drain 前仅提前 cancel/stop ACP handle；非 ACP 投递按原顺序先 drain，再统一 cancel/dispose。单个 ACP stop 失败不能跳过其余 handle 的等待与释放；target 清理失败后仍尝试关闭 provider，失败汇总保留。route 关闭不删除 binding/request/delivery 历史；cleanup 失败保留现有 archiving 语义，不关闭其它会议或用户输入 Session。启动配置 reload 走插件重新装载，核对旧 launchFingerprint，不能热改已绑定会话。

Runtime read 用当前 ownership 关联 provider.blockFor 生成 [MeetingView executionBlocks](../20-interfaces/MEETING-INTERFACE.md#acp-execution-diagnostics)。subscribeBlocks 在持久阻断后触发 refreshListeners，以当前 committedVersion 通知；Client 同版本也重读。`plugin/src/client/meeting/panel.tsx::ConviviumMeetingPanel` 详情显示本地化 role=alert，说明身份、停止自动执行及现有暂停/异常结束操作。DTO 只含安全字段，不把模型、路径、凭据或原 ACP ID 发到远端/归档；不写领域 version/event、不自动暂停、不增清锁 UI。

## ACP 实施与验证边界

ACP SDK/bridge 依赖与 provider 模块已随 PR #133 落地，确定性组合复核见 Current Implementation Coverage；D1–D5 会议装配已完成并通过确定性验证，真实核心链路已完成一轮冒烟，完整两轮、Web 正文读取及原绑定冷恢复真实验收仍未覆盖，剩余工作转人工冒烟。DSH 0.2.0-rc.2 的公开 LlmAdapter、SessionPersistence、ToolRuntime、subprocess 和 Storage Domain 可以支撑限定的正常冷 load 与保守阻断；这不证明自动续执行接口存在，也不证明跨进程实际成功。确定性与真实专项的固定范围见 Peer Meeting Agents Design；当前证据与未覆盖项见 readiness，人工冒烟与失败处置见 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md#acp-人工冒烟与日志调试)。本期不改固定人工 dsh-workspace、物理数据库或已有会议的模型绑定。

### Acceptance-only Outbox Reader

包入口具名导出 `readMeetingOutboxForAcceptance`，实现位于 `plugin/src/repository/storage-domain/acceptance-read.ts`，通过 Repository 目录入口逐级导出。唯一消费者是隔离 smoke probe；通过 Host 公开 `storageDomain.get` 借用已经打开的 domain，只读 catalog 与 `loadProjection` 校验后的提交链/checkpoint，并按 deliveryId 返回冻结字段白名单。`loadProjection` 接受只含 table/get/entries 的读取面，对未知记录执行已有 Schema 校验。入口不 open/close domain、不执行 recover，不持有额外租约，不开放 Web/Remote 或模型工具；字段及拒绝语义见 [ACP Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md#acceptance-outbox-read)。
