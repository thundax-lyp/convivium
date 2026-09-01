# Meeting Agent Role Catalog Interface

## Purpose

本文定义 Convivium 可向 Meeting Manager 提供的版本化 Agent 角色目录、参会推荐以及 Captain 处置推荐的跨边界契约。该接口让 Manager 能根据会议目标、当前议题和证据缺口推荐尚未参会的 DSH Agent，但不能自行创建角色、接纳 Participant、授予权限或改变正式会议事实。

本文同时定义当前确认的初始角色语义。角色 Prompt、模型、Skills、Tools、MCP、凭据和完整 DSH 配置仍由 DSH Host 管理，不以本文为运行时模板或敏感配置真相源。

## Boundary And Ownership

- DSH Host 或其受控 profile 拥有可用 Agent Preset、Skill 和 Tool；Convivium 不复制模型凭据、完整 Prompt、Tools Schema、MCP 配置或权限秘密。
- 每个 Catalog candidate 必须绑定一个可解析的 Meeting Agent Definition；`sourceMemberName`、显示名称或 role ID 本身均不能证明 DSH capability 已加载。
- Convivium 消费一个经过 Captain 当前授权范围过滤的 `MeetingAgentCatalogSnapshotV1`，并把其最小安全 projection 交给当前 Meeting Manager。
- Catalog 中的 Agent 是候选来源，不是当前 Meeting Participant。只有 Captain 批准 recommendation 且 Runtime 完成独立 meeting-owned Session provisioning 后，该 Agent 才成为可调度 Participant。
- Manager 只能推荐 Catalog 中可见且当前可用的 candidate，并说明与议题、职责或证据缺口的关系；Manager 不能批准自己的推荐。
- Captain 的批准只允许创建普通可选 Participant。批准不得自动修改 `requiredReviewers`、`riskAcceptanceAuthority`、议题 required Participant 或 DSH 已授予的权限上限。
- Meeting Runtime 是 recommendation、Captain disposition、admission 状态和 Participant identity 的事实所有者；Meeting Agent Definition 和 DSH 内部执行能力不是 MeetingState 的事实源。
- Catalog snapshot、recommendation、disposition 和 admission 必须绑定 `teamId + meetingId`，不得跨 Meeting 重放或隐式共享 capability。

## Transport Or Invocation

### Catalog delivery to Manager

Runtime 在创建 Manager planning request 时，可以附带当前 Catalog 的安全 projection：

```ts
interface MeetingAgentCatalogProjectionV1 {
  protocolVersion: 1;
  catalogId: string;
  catalogVersion: string;
  candidates: readonly MeetingAgentCandidateV1[];
  researchNeeds: readonly ManagerResearchNeedV1[];
}

interface MeetingAgentCandidateV1 {
  candidateId: string;
  roleDefinitionId: AgentRoleDefinitionIdV1;
  roleDefinitionVersion: string;
  displayName: string;
  summary: string;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
  responsibilities: readonly string[];
  nonResponsibilities: readonly string[];
  availability: "available" | "unavailable";
}

interface ManagerResearchNeedV1 {
  evidenceGapId: string;
  agendaItemId: string;
  question: string;
  requiredScopes: readonly AgentEvidenceScopeV1[];
  existingEvidenceIds: readonly string[];
  status: "open" | "stale" | "satisfied";
}
```

该 projection 不包含 `sourceMemberName`、DSH Session ID、模型、完整 Prompt、凭据、私有工具配置或其他 Agent 的私有历史。Runtime 保留 `candidateId -> agentDefinitionId -> MeetingAgentDefinitionV1` 私有映射。

### Manager recommendation

Manager 可以在合法的 planning submission 中附带零个或多个 `AttendanceRecommendationClaimV1`。它们是结构化建议，不是 Participant 创建命令：

```ts
interface AttendanceRecommendationClaimV1 {
  candidateId: string;
  agendaItemId: string;
  rationale: string;
  expectedContribution: string;
  evidenceGapIds: readonly string[];
  urgency: "current_agenda" | "later_agenda" | "follow_up";
}

interface AttendanceRecommendationV1 extends AttendanceRecommendationClaimV1 {
  recommendationId: string;
  recommendedByManagerSessionId: string;
  catalogId: string;
  catalogVersion: string;
  planningAttemptId: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  createdAt: number;
}
```

Manager 不得在 claim 中提供或覆盖 `recommendationId`、身份、状态、Participant ID、review responsibility、risk authority、tool filter 或 Agent Definition identity。Runtime 从当前合法 Manager caller、planning attempt 和 Catalog snapshot 绑定这些字段。

### Captain disposition

Captain 使用独立工具 `convivium_dispose_attendance_recommendation` 批准或拒绝 recommendation：

```ts
interface CaptainAttendanceDispositionInputV1 {
  protocolVersion: 1;
  meetingId: string;
  expectedMeetingVersion: number;
  requestId: string;
  recommendationId: string;
  decision: "approve" | "reject";
  reason: string;
}

interface CaptainAttendanceDispositionResultV1 {
  requestId: string;
  recommendationId: string;
  disposition: "approved" | "rejected";
  admissionId?: string;
  participantId?: string;
}
```

`approve` 先创建持久 `MeetingParticipantAdmissionV1` 和稳定 Participant identity，再由 outbox 驱动 Session provisioning。命令成功不等于 Agent 已可发言；只有 admission 到达 `active` 后，Participant 才进入 `selectionCandidates`。

```ts
interface MeetingParticipantAdmissionV1 {
  admissionId: string;
  recommendationId: string;
  candidateId: string;
  participantId: string;
  status: "approved" | "provisioning" | "active" | "failed" | "cancelled";
  failureCode?: string;
}
```

### Status projection

Captain、Manager 和仍有效的 Participant status projection 可以读取 recommendation 和 admission 的非敏感状态：

```ts
interface PublicAttendanceRecommendationV1 {
  recommendationId: string;
  candidateId: string;
  roleDefinitionId: AgentRoleDefinitionIdV1;
  displayName: string;
  agendaItemId: string;
  rationale: string;
  expectedContribution: string;
  evidenceGapIds: readonly string[];
  urgency: "current_agenda" | "later_agenda" | "follow_up";
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  admissionStatus?:
    "approved" | "provisioning" | "active" | "failed" | "cancelled";
  failureCode?: string;
}
```

projection 不公开 Manager Session ID、agentDefinitionId、Participant Session ID 或 Catalog 私有 mapping。Plugin Frontend 只有在 recommendation 为 `pending` 时显示 Captain Approve/Reject 控制；写操作完成或返回结构化错误后必须重新读取完整 status。

## Data And State Contract

### Catalog snapshot

```ts
type AgentRoleDefinitionIdV1 =
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst"
  | "web_research_analyst"
  | "meeting_scribe";

type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";

interface AgentRoleDefinitionV1 {
  roleDefinitionId: AgentRoleDefinitionIdV1;
  version: string;
  displayName: string;
  summary: string;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
  responsibilities: readonly string[];
  nonResponsibilities: readonly string[];
}

interface MeetingAgentCatalogSnapshotV1 {
  protocolVersion: 1;
  catalogId: string;
  catalogVersion: string;
  teamId: string;
  capturedAt: number;
  roles: readonly AgentRoleDefinitionV1[];
  candidates: readonly {
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionIdV1;
    roleDefinitionVersion: string;
    sourceMemberName: string;
    agentDefinitionId: string;
    availability: "available" | "unavailable";
  }[];
}
```

Catalog snapshot 必须在 recommendation 产生前固化。Manager 只看到安全 projection；Runtime 使用完整 snapshot 验证 candidate、角色版本和受控 Agent Definition mapping。Catalog 更新不得改变已经存在的 recommendation 或 admission。

### Initial role definitions

Meeting Manager 是 Runtime 为每场 Meeting 创建的内建编排角色，role ID 为 `meeting_manager`。它负责规划 Turn、校验讨论焦点、参考 evidence gap 和推荐 Catalog candidate；它不是 Catalog candidate，不能作为 Participant、领取 MeetingTask、形成 Position、接受风险或批准自己的 recommendation。Captain 是创建会议的 DSH caller authority，也不属于 Catalog candidate。

初始 Participant role catalog 包含：

| `roleDefinitionId`        | 核心责任                                                               | 非责任                                    |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `domain_architect`        | 审核领域状态、不变量、需求与设计一致性、completion/termination 语义    | 不替 Captain 接受风险或 Decision          |
| `runtime_engineer`        | 分析 Runtime、DSH adapter、事务、outbox、恢复和 Session 生命周期       | 不自行改变产品范围                        |
| `protocol_ui_engineer`    | 分析 Protocol Schema、tools、HTTP、projection 和 Client UI             | 不绕过 Runtime 直接管理 Session 或 SQLite |
| `verification_reviewer`   | 建立测试矩阵、反例、回归、真实 DSH smoke 和 readiness 证据             | 不把未执行验证描述为通过                  |
| `github_research_analyst` | 搜索并分析官方 repository、源码、commit、issue、PR 和 release          | 不把第三方 fork 或讨论当作正式实现依据    |
| `arxiv_research_analyst`  | 搜索并分析论文版本、方法、实验结论和局限                               | 不用论文主张覆盖正式需求、接口或仓库事实  |
| `web_research_analyst`    | 搜索并分析官方文档、标准、发布说明、安全公告和时效信息                 | 不重复承担源码级 GitHub 取证              |
| `meeting_scribe`          | 从正式 transcript、事实、决议和任务结果形成带 canonical 引用的纪要草稿 | 不记录或修改权威 transcript、事实或决议   |

上述定义描述会议责任，不规定具体 Prompt 文本或内部工具序列。Manager 本身不是 Catalog candidate，不得推荐自己成为 Participant。Scribe 是普通可选 Participant；它只能读取授权的正式会议 projection 并提交派生纪要草稿，不能访问私聊或取得 Captain、Manager、Decision、风险处置和正式记录写权。

### Research deduplication

研究类 recommendation 必须关联 Manager context 中 `status="open" | "stale"` 的 `evidenceGapIds`；非研究角色可以提交空数组。`researchNeeds` 是 Runtime 从当前 Agenda、Question、Issue、MeetingTask evidence 和已持久化 evidence reference 形成的最小规划 projection，Manager 不能自行创造 gap ID。该 projection 使 Manager 能区分“已有证据可复用”“需要刷新”和“需要独立交叉验证”。仅因存在搜索工具不得重复推荐多个 Agent 处理相同来源范围。

GitHub、arXiv 和 Web research Agent 的职责按证据方法划分；其内部仍使用 DSH 授权的搜索 Tools。Agent 身份用于维持职责、上下文、query budget 和证据审计，不取代 Tool 权限控制或缓存。

### Recommendation lifecycle

1. Runtime 固化当前 authorized Catalog snapshot，并向 Manager 投影安全 candidate metadata。
2. Manager 在合法 planning attempt 中提交 recommendation claim；Runtime 原子写入 recommendation、event 和 receipt。
3. recommendation 保持 `pending`，不进入 speaker candidates，也不创建 DSH Session。
4. Captain 明确 `approve` 或 `reject`；重复请求遵守通用幂等规则。
5. `approve` 原子创建 admission、Participant identity 和 provisioning outbox；外部 DSH 调用不进入 SQLite transaction。
6. provisioning 成功后 admission 进入 `active`，Participant 才可被后续 planning 选择。
7. provisioning 失败时 admission 进入 `failed`，不得产生部分可用 Participant；Manager 可以在新 Meeting version 上推荐替代 candidate。
8. Meeting 进入 execution-terminal 或 `archiving` 时，所有 pending recommendation 和非 active admission 被取消。

recommendation 不打断当前合法 SpeakerAttempt，也不能把推荐 Agent 插入已经提交的 Turn。若 `urgency="current_agenda"`，新 Participant 最早从后续 planning attempt 开始参与。

## Error And Permission Semantics

接口至少区分以下错误：

| Error                                   | 含义                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| `AGENT_CATALOG_UNAVAILABLE`             | 当前 Meeting 无可验证 Catalog snapshot                       |
| `AGENT_CATALOG_VERSION_UNSUPPORTED`     | Catalog 或 role definition 版本不受支持                      |
| `AGENT_CANDIDATE_NOT_FOUND`             | recommendation 引用了当前 snapshot 之外的 candidate          |
| `AGENT_CANDIDATE_UNAVAILABLE`           | candidate 在 snapshot 中不可用或其 Agent Definition 或其 DSH capability 引用已不可解析   |
| `ATTENDANCE_RECOMMENDATION_INVALID`     | recommendation 缺少有效议题、理由、贡献或证据缺口引用        |
| `ATTENDANCE_RECOMMENDATION_STALE`       | planning attempt、Catalog snapshot 或 Meeting version 已失效 |
| `ATTENDANCE_RECOMMENDATION_NOT_PENDING` | Captain 处置的 recommendation 已终止                         |
| `PARTICIPANT_PROVISIONING_FAILED`       | 已批准 admission 无法形成有效 meeting-owned Session          |

- 只有当前合法 Manager Session 能提交 recommendation。
- 只有当前 Meeting Captain 能批准或拒绝 recommendation。
- Manager recommendation、自然语言建议或 research result 都不能替代 Captain disposition。
- Captain approval 不能扩大 candidate 对应 DSH Preset 和 policy 的权限，也不能自动赋予 required-review、risk acceptance、Captain 或 Manager authority。
- Catalog projection 必须过滤秘密和敏感配置；错误不得返回 Preset/Skill 私有配置、凭据、完整 Prompt 或内部工具配置。
- recommendation、disposition、admission 和 Session provisioning 必须保留幂等、version conflict、终态拒写和跨 Meeting 隔离。

## Compatibility

- 当前 `CreateMeetingInputV1.participants` 和既有会议创建行为保持不变；初始 Participant 仍由 Captain 在创建时明确提供。
- 初始 Participant 和 recommendation admission 都必须在 Session provisioning 前解析对应 Meeting Agent Definition 及其 DSH capability 引用；`sourceMemberName` 不能作为隐式 Definition fallback。
- 本接口增加的是会议运行期间的可选参会推荐与 Captain admission，不得静默改变既有 Manager plan 或 `ParticipantSpecV1` 的含义。
- 在代码和 Schema 正式实现前，Catalog projection、recommendation claim 和 Captain disposition 均属于未实现契约，不得由调用方假设可用。
- 新增或修改 role definition 必须提升其 `version`；历史 Meeting 保留当时 snapshot，不随 Catalog 更新漂移。
- 未来若允许 recommendation 修改 required reviewer、risk authority 或 objective contract，必须另行形成权限与状态迁移契约，不能扩展本接口中的 `approve` 语义。

## Related Documents

- `docs/00-governance/ARCHITECTURE.md`
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
