# DSH Plugin Design

## Purpose

本文定义 Convivium 作为单个本地 DSH 插件的装配边界：角色资源、会议身份与 DSH Session 的绑定、受控后端入口、只读展示和本地刷新通知。

本文只描述平级 Agent 目标设计；实现覆盖与未覆盖项由 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 记录。

## Scope And Non-goals

目标运行在一个本地 DSH Host，服务该 Host 的单一 loopback 用户边界。本文覆盖插件生命周期、必需 DSH 能力、角色资源、Session 归属、受控读写入口和本地面板；不定义会议领域规则、持久化算法、远程多用户、跨 Host 协作或独立服务。

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
| role-composition        | 精确 Definition ID/version           | AGENTS/Preset/Skill 资源绑定、只读 Catalog | 不以当前默认版本或 displayName 回退    |
| dsh/meeting-agent-owner | PreparedDescriptor、SessionOwnership | 平级 AgentHandle 创建、恢复、停止结果      | 一 Session 只属于一个 Meeting identity |
| runtime/meeting-service | 可信 caller binding、MeetingCommand  | committed result、receipt、outbox          | 统一鉴权与领域转换                     |
| remote/loopback         | local binding、typed request         | typed result/refresh notice                | 只接受可信本地用户控制                 |
| client/projection       | caller-filtered committed view       | UI state                                   | 不推导 authority 或领域状态            |

DSH 具体 API 收敛在角色预检和 Agent owner；Meeting Domain、Remote DTO 和 Client 不依赖 DSH 实现类型。完整资源、ownership、创建和恢复结构以 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 为准，生命周期与投递顺序以 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md) 为准。

## Responsibilities And Dependencies

DSH Host/profile 拥有插件加载、模型、Preset、Skills、MCP、Sandbox、Approval、AgentSession 生命周期和存储 provider。Convivium 拥有 Meeting 事实、角色资源溯源、私有 Session ownership、Captain 创建来源、受控入口与投影。首发只支持 DSH `0.1.2-rc.1`；版本或必需公开服务缺失时加载拒绝，不提供旧 child 降级模式。

专用 Web 安装根在首次创建 DSH `web` profile 时，将 `dsh.profile.patchReload` 从该版本默认的 `live` 固定为 `startup`：当前解析到的 Cordis HMR 不提供 DSH live watcher 调用的 `registerConfig`，而 Meetings View 不依赖运行中修改 patch。所有 bundle、profile、home 和启动 overlay 仍在每次 Host 启动时完整应用；修改 patch 后须重启 Host。安装器不改写已经存在的 profile manifest，也不复制凭据。

七个初始 Meeting identity 分别持有平级、独立、可持续的 AgentSession；动态接纳身份也单独创建。不同 Meeting、identity 或授权范围不得共享 Session。七个角色各有 Preset，只装分配的能力 Skills；角色 AGENTS 由插件在 scoped setup 中显式读取并注册。Captain 是每场 Meeting 的外部可信控制来源，不是 MeetingIdentity、Participant、notice 目标或任何会议 Agent 的 DSH parent。唯一专职 Evidence Reviewer 的逐版本 one-shot worker 仍作为该 Reviewer 的 DSH Subagent，worker 不取得 Meeting authority。

每个生产 Meeting identity tool 暴露精确 MeetingCommand/action schema，Definition toolFilter 收窄可见面，Runtime 按 exec.agent 与 active ownership 独立授权。Captain 就是用户；结构化创建与控制走可信 loopback Remote。`convivium_start_meeting` 是仅用于显式用户 Skill 调用的零参数创建工具，以当前 turn 的单次授权和原始目标构造命令，不开放其它 Captain action。

用户可通过可信 loopback `conviviumMeetings.control` 结构化创建并控制会议，也可通过已部署的 `/convivium` Skill 直接创建。Skill 文件随安装包部署到当前 `DSH_HOME/skills/convivium/`，只由用户显式调用；Meeting Agent 的独立 Skill 根不包含它。Captain 是本地用户，不是 Agent 或原 Session 授权绑定。除这条受限创建路径外，DSH tools 仅接受 active MeetingIdentity 的会议操作；输入 Session 关闭不影响七个平级 Agent、投递或用户控制。具体装配、来源审计与恢复见 [Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md)。

Reviewer 的 `EvidenceReviewClaim` 仍按 EvidenceVersion、sourceEffectId 和 expiry 原子认领；coordinator 仅调用专用 `convivium_run_review_worker`，worker 使用固定 `outputSchema` 和空 toolFilter，返回的结构化结果经 versionId 校验后才由 `submit_evidence_review` 单独提交。worker 失败、超时和 pause 依既有 EvidenceStatus/claim 规则处理，不能以 `followup` 接受推断审核成功。详细状态转换见 [Meeting Design](./MEETING-DESIGN.md)。

Manager 的 `recommend_identity` 只提交 `reject` 事实或不可调度的 `admit` 意图；Runtime 从已记录的 Definition provenance 预检、创建平级 Session、持久 ownership 后原子激活普通 Contributor。相同 candidate 在 provisioning 阶段互斥，跨 Agenda 复用既有 active identity 不创建 Session。自动 evidence freshness 与跨来源研究去重不在本次范围。

## Plugin Lifecycle And Entry Points

插件入口只构造依赖、注册受控服务和 teardown；所有领域写入通过同一 Meeting Runtime 入口。插件状态机为 new → validating → ready → stopping → stopped，或 validating → rejected。validating 校验精确 DSH 版本、平级 Agent/Session、Preset、Skill、Storage 和 loopback 必需能力；ready 才注册可写 Tools/Remote。stopping 立即拒绝新 command，等待已开始的原子提交，保留未完成 outbox，然后仅释放插件已证明归属的 AgentHandle；不关闭用户输入 Session 或其他 Meeting 的 Agent。

创建阶段先完成七个 Definition 的资源预检，再持久化不可调度的 creating/provisioning 状态；每个平级 Agent 在 unpublished scoped setup 中装配，全部 ownership active 后 Meeting 才 ready。失败先撤权再停止已创建 handle。动态身份也遵守 provisioning→active 的授权边界。pause 取消受影响的 turn 并停止新调度，resume 从已提交状态重新安排；end/archive 先撤权再停止目标 Meeting Agent。Host 冷恢复只按持久 Definition、资源指纹、模型选择及 Session header 恢复原 Agent，不能使用当前默认资源或替代 Session。

## Local Client And Remote Boundary

面板先读取本地 Host 的全部可恢复 Meeting 摘要，选定后才读取完整状态。摘要不含 transcript、Session ID、capability、物理存储路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表返回暂不可用原因而不得伪装为完整可用列表。完整状态由类型化后端接口输出；Client 只展示，不计算领域状态、不写缓存事实。

面板提供 MO-FR-11 的用户创建、十项结构化控制及暂停/恢复/结束，字段与失败行为遵循 Meeting Interface；具体表单接线见 Peer Meeting Agents Design。Contribution 授权与任务重新分配保持只读。断线、陈旧、提交中和领域不允许的状态禁写；Agent 不能通过用户视图获得权限。

Convivium Client plugin 拥有 typed locale namespace `convivium.meeting`，依赖 DSH 公开 locale service 一次注册 key 集合平衡的 `zh`、`en` dictionaries，并使用 DSH locale preference 与 English fallback，不建立 Convivium 独立设置或持久状态。`conversation.view` 标签通过 translation thunk 读取当前 locale，Panel body 通过 slot locale seat 取得 typed translator，使已挂载页面随 locale revision 更新而不重新注册 slot。翻译只属于 presentation：Meeting projection 中的用户或 Agent 内容、Domain/Protocol enum 值、错误码、command reason、Remote、Storage 和权限语义保持不变；已知 enum 只映射为本地化展示 label。

### Meetings View 组成

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

DSH 的 `Meetings` 标签是功能级导航；Workspace 内使用视觉较轻的次级选项卡切换“概览 / 时间线”。Navigator、Header、切换器和内容由同一个 Client workspace owner 组合，不通过 `openView()`、URL、第二个 slot entry 或 module-global store 同步选择。

Workspace 只拥有可丢弃的展示状态：

```ts
interface MeetingsWorkspaceState {
  selectedMeetingId?: string;
  activeMode: "overview" | "timeline";
  focusTarget?: { meetingId: string; objectKind: string; objectId: string };
  timeline: {
    identityFilter: string[];
    typeFilter: string[];
    statusFilter: string[];
    relatedObjectFilter: Array<{ objectKind: string; objectId: string }>;
    zoom: number;
    collapsedLanes: string[];
  };
}
```

这些字段不进入 Meeting、Remote、URL 或持久事实。初次挂载只调用 `list()`；用户选择后才 `read()`。选择不同 Meeting 时设置新 ID、切回概览并清除旧 Meeting 的 focus 与 timeline 状态；重复选择当前 ID 是 UI no-op。每次详情读取携带请求时的 Meeting ID，只有该 ID 仍等于当前 `selectedMeetingId` 时才可提交结果，旧选择的迟到成功或失败都被丢弃。完整摘要补读后 ID 仍存在则保持选择和模式，不存在则清除选择；详情失败保留 ID，retry 只读取该 ID。不得把失败返回的残缺列表与 last-good 列表合并成新的选择来源。

`MeetingClient.list/read/control/subscribeRefresh` 仍是唯一 Client 数据入口。概览与时间线共享一份已选 `MeetingView` 和刷新订阅；refresh notice 只触发补读，不携带事实。Client 可以保留 last-good 摘要与详情用于断线展示，但必须标记陈旧并禁写，完整补读成功后才解除。

### 概览

概览按以下顺序从当前 `MeetingView` 渲染，不生成新的业务摘要或状态：

1. 当前议题、lifecycle、active Agenda、version 与 Objective；
2. 当前 Round、Contribution、申请、ManagerPlan、IdentityRecommendation、MeetingTask 摘要和等待原因；
3. caller-visible pending DecisionCandidate、当前和历史 Decision、CompletionFact；
4. Question、Issue 与 RiskDisposition；
5. Publication 与 FormalMessage；
6. EvidenceVersion、EvidenceReview 与 ReviewDelivery；
7. MeetingTask 详情与技术标识。

Header 的暂停、继续和结束 lifecycle control 由 `MeetingView.controls`、last-good/陈旧状态和单个 pending command 联合决定是否呈现或启用。概览内的 Contribution 授权、Decision 和 Risk 对象不渲染写控制。归档 Meeting 不渲染运行期进展和写控制；成功或协议拒绝后完整补读，不自动重试 command。

### 时间线 Client projection

时间线只读，并从已选详情即时建立可丢弃节点：

```ts
interface TimelineNode {
  key: string; // objectKind:objectId:phase
  objectKind: string;
  objectId: string;
  phase: string;
  time: number;
  lane: "captain" | "manager" | "contributor" | "reviewer" | "system";
  identityId?: string;
  relatedObjects: Array<{ objectKind: string; objectId: string }>;
}
```

`TimelineNode` 不是领域 event，不离开 Client。节点正文继续从源 DTO 渲染；同一对象的不同已发生时间分别形成 phase，例如 `task:started` 与 `task:completed`。排序固定为 `time → objectKind order → objectId → phase order`，只防止 UI 抖动，不表示提交顺序或因果关系。首版不绘制 phase 间因果箭头。

| 数据                                        | 时间                       | 泳道依据                      | 来源限制                                        |
| ------------------------------------------- | -------------------------- | ----------------------------- | ----------------------------------------------- |
| `LifecycleView`                             | `changedAt`                | 系统                          | 只表示最近变化                                  |
| `RoundView`                                 | `openedAt`、`abortedAt`    | 系统                          | 活动顶层；deadline 不是已发生节点               |
| `EvidenceOpportunityRequestView`            | `requestedAt`              | `contributorId`               | 活动顶层 caller-visible                         |
| `PendingHandRaiseView`                      | `raisedAt`                 | `contributorId`               | 活动顶层 caller-visible                         |
| `EvidenceVersionView`                       | `submittedAt`              | package/Archive bundle author | 当前 projection 实际返回的版本                  |
| `EvidenceReviewView`                        | `createdAt`                | `reviewerId`                  | 不展示 reviewer 内部过程                        |
| `ReviewDeliveryView`                        | `sentAt` 或 `failedAt`     | 系统                          | 活动顶层；只表示投递结果                        |
| `PublicationView`                           | `publishedAt`              | 系统                          | 不推断发布者                                    |
| `FormalMessageView`                         | `createdAt`                | `actorId`                     | 使用明确引用关联对象                            |
| `IdentityRecommendationView`                | `createdAt`                | 系统                          | 活动顶层 caller-visible；没有公开 actor 字段    |
| `ProposalRevisionView`                      | `createdAt`                | `actorId`                     | 仅 Archive                                      |
| `PositionView`                              | `createdAt`                | `actorId`                     | 仅 Archive                                      |
| `DecisionCandidateView`                     | `createdAt`                | `actorId`                     | 活动只取 caller-visible pending；归档取 Archive |
| `DecisionView`                              | `createdAt`                | `actorId`                     | 保留原状态                                      |
| `CompletionFactView`、`RiskDispositionView` | `createdAt`                | `actorId`                     | 不合成新结论                                    |
| `CommittedFactView`                         | `occurredAt`               | `actorId`                     | 仅 Archive Question/Issue disposition facts     |
| `ManagerPlanView`                           | `createdAt`                | `managerId`                   | 活动顶层 caller-visible                         |
| `TaskView`                                  | `startedAt`、`completedAt` | 系统                          | `assigneeId` 不是行为者                         |
| `TerminationView`                           | `endedAt`                  | 系统                          | 展示原 outcome/reason                           |
| `ArchiveView`                               | `createdAt`                | 系统                          | 展示原 status                                   |

活动 Meeting 只从顶层 caller-filtered projection 建节点，并从顶层 `IdentityView` 解析身份。归档 Meeting 只从完整 `ArchiveView` 建历史节点，并从 `identityProvenance` 解析身份；不从顶层 rounds、deliveries、plans、tasks、request 或 hand raise 回填，不复制 Archive 已物化对象。Archive 缺失或不完整时显示归档读取失败，不混合两个来源。

没有公开时间字段的 `IdentityView`、`AgendaView`、`QuestionView`、`IssueView` 和 `ContributionView` 不形成节点；`deadlineAt` 只表示期限，不是已发生节点。`PrivateMailView` 即使对 caller 可见且带时间，也不进入公开时间线。

对象有明确 actor/author/reviewer/manager/contributor 字段时才按身份角色进入 Captain、Manager、Contributor 或 Reviewer 泳道；无明确行为者进入系统泳道。关联身份、assignee 与业务常识不能替代 actor。一个 identity 有多个角色但对象不能确定行为角色时同样进入系统泳道。卡片同时显示具体 `displayName`，角色和状态不只用颜色表示。

时间线提供 identity、object type、原状态和已有关联对象筛选，以及 zoom、横向滚动、泳道折叠和回到最新。筛选只处理 caller-filtered 节点；空结果使用不披露隐藏对象的中性文案。当前不实现全文搜索、统一 Timeline event、额外 event ID 或因果推断。

`relatedObjects` 只从源 DTO 能唯一确定目标类型的 `roundId`、`publicationId`、`evidenceIds`、`positionIds`、`decisionIds` 等引用建立，并记录对象类型与 ID。没有 target kind 的 `relatedIds` 不进入首版 `relatedObjects`；时间相邻、相同文本、可见 ID 索引或业务常识都不得猜测其类型。选中节点时只高亮同一已类型关联对象的可见 phase。

### 模式定位、响应式与失败

概览到时间线的定位设置 `activeMode="timeline"` 和同一 Meeting 的 `focusTarget`；反向定位设置 `activeMode="overview"`。目标挂载后展开、滚动和聚焦，成功或失败均清除一次性 focus。多 phase 对象默认定位时间最晚节点并允许查看其他 phase。目标不存在、被 caller filtering 删除或目标模式不展示时只报告中性失败，不修改筛选、Meeting 或权限。

宽屏 Navigator 是常驻左栏。窄屏将同一 Navigator 呈现为当前 Meeting 按钮与摘要列表抽屉，抽屉关闭后 Workspace 占满宽度；这两个呈现共享唯一 `selectedMeetingId`。时间线保持五类泳道并横向滚动，DOM 按时间排序，键盘可以遍历时间节点和相邻泳道；定位后焦点落到目标卡片并由可访问文本报告时间、身份、类型和状态。

状态呈现如下：

| 状态                         | Navigator                        | Workspace                        |
| ---------------------------- | -------------------------------- | -------------------------------- |
| loading list                 | 摘要骨架                         | 等待选择                         |
| empty list                   | 中性空状态                       | 不渲染 Header、切换器或内容      |
| list ready, no selection     | 完整摘要列表                     | 提示选择，不读取详情             |
| list failure                 | last-good 标为陈旧或错误与 retry | 不使用残缺列表选择 Meeting       |
| loading detail               | 保留选中项                       | Header/当前模式骨架              |
| detail failure               | 保留选中项和其他摘要入口         | 当前 ID 错误与 retry，不自动改选 |
| disconnected/refresh failure | last-good 标为陈旧               | 保留内容、禁写并提供适用 retry   |
| focus target missing         | 不变                             | 中性定位失败                     |

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
8. 活动与归档 Timeline 分别只从其允许的 caller-filtered 数据源确定性生成节点；身份泳道、系统泳道、多 phase、筛选与定位不生成新事实或泄露隐藏对象。
9. 宽屏侧栏与窄屏抽屉共享选择状态；五类泳道、键盘顺序、焦点、本地化和颜色之外的状态表达通过 Client 与真实 DSH Web 验证。
