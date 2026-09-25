# DSH Role Interface

## Purpose And Boundary

本文定义 Convivium 与 DSH Host/profile 间的目标角色资源契约：Meeting Agent Definition、只读 Catalog、预检、平级 Agent Session、ownership 和 admission。Meeting 权限与领域事实分别由 [Meeting Interface](./MEETING-INTERFACE.md) 和 [Domain Design](../30-designs/DOMAIN-DESIGN.md) 决定。Host 拥有 Preset、Skill、模型执行、Sandbox、Approval、MCP 和 Session；Convivium 保存 Definition provenance、推荐、私有恢复配置和已验证的 identity ownership。

本文是 [MO-FR-14 平级 Agent 目标](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-14平级-meeting-agent-与独立能力组合) 的目标接口；实际覆盖与验证结果见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

Definition 与 Catalog 不得携带完整 Agent 配置、prompt、凭据、MCP 参数、Session、文件路径、内部工具 schema 或隐藏推理；Catalog 候选不等于获得 Meeting 加入或控制权。

## Primitive Types And Versions

```ts
type DefinitionId = string;
type CatalogId = string;
type DescriptorId = string;
type EpochMs = number;
interface VersionedRef {
  id: string;
  version: string;
}
type MeetingRole = "manager" | "contributor" | "evidence_reviewer";
type AgentRoleDefinitionId =
  | "meeting_manager"
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst";
type AbilityName =
  | "meeting-facilitation"
  | "repository-analysis"
  | "evidence-review"
  | "github"
  | "arxiv";
type AgentEvidenceScope = "repository" | "github" | "arxiv" | "web";
type CapabilityKind =
  "preset" | "skill" | "tool" | "mcp" | "model" | "sandbox" | "approval";
interface ToolRestriction {
  allow?: string[];
  deny?: string[];
}
interface AgentInstructionRef {
  roleDefinitionId: AgentRoleDefinitionId;
  version: string;
  sha256: string;
}
interface MeetingAgentDefinition {
  agentDefinitionId: DefinitionId;
  definitionVersion: string;
  roleDefinitionId: AgentRoleDefinitionId;
  displayName: string;
  summary: string;
  agentInstructions: AgentInstructionRef;
  dshPresetId: string;
  requiredSkillNames: AbilityName[];
  toolFilter?: ToolRestriction;
  expertiseTags: string[];
  evidenceScopes: AgentEvidenceScope[];
}
interface AgentDefinitionBinding {
  agentDefinitionId: DefinitionId;
  definitionVersion: string;
  definitionHash: string;
}
interface EffectiveAgentOptions {
  provider: string;
  model: string;
  reasoningEffort?: string;
}
interface ResourceBinding {
  instructions: AgentInstructionRef;
  presetId: string;
  presetSha256: string;
  skills: Array<{ name: AbilityName; sha256: string }>;
  compositionHash: string;
}
```

所有 ID、version 和 sha256 均为非空字符串；sha256 是小写十六进制 SHA-256。`definitionHash=sha256Hex(encodeCanonicalJson(definition))`，其中 Definition 使用本节字段、`requiredSkillNames` 按名称排序、`toolFilter.allow|deny` 各按名称排序；不包含读取时的文件路径。`AgentInstructionRef.sha256` 是 AGENTS.md 原始字节 SHA。`presetSha256` 是按 `preset.yml`、`agent.cordis.yml` 文件名顺序组成的 `[relativePath, rawFileSha256]` 数组的 canonical JSON SHA。每个 Skill `sha256` 是该能力目录中全部普通文件（含 `SKILL.md` 和 `scripts/`）按 POSIX 相对路径排序组成的 `[relativePath, rawFileSha256]` 数组的 canonical JSON SHA；出现 symlink 或目录逃逸拒绝。`compositionHash=sha256Hex(encodeCanonicalJson({definitionHash,instructions,presetId,presetSha256,skills,toolFilter,agentOptions}))`，其中 skills 按 name 排序。相同 Definition ID/version 的内容不得改变；角色身份、能力集合或正文变化均须升 Definition version。资源字节变更但未升版本时拒绝，不静默替换。模型选择变化不改变 `definitionHash`，但改变新 Session 的 `compositionHash`。

## Meeting Agent Definition And Resource Layout

首发平级目标的七个 `agentDefinitionId` 维持 `convivium.<roleDefinitionId>`，`definitionVersion` 和 `agentInstructions.version` 均固定为 `2.0.0`；旧版本不提供兼容读取。发行路径固定为 `plugin/meeting-roles/agents/<roleDefinitionId>/<version>/AGENTS.md`、`plugin/meeting-roles/skills/<ability>/SKILL.md` 和 `plugin/meeting-roles/presets/<roleDefinitionId>/{preset.yml,agent.cordis.yml}`。AGENTS ref 的 roleDefinitionId 必须等于 Definition 的角色；只能从已安装发行根解析相对位置，Catalog 和 Manager 不提交路径。AGENTS 声明身份、职责、能力与边界，不重复 Skill 工作方法。Skill 使用目录 bundle、合法 frontmatter `name`/`description`；可含 `scripts/`，读取 Skill 不执行脚本。首发不提供 `meeting_scribe` 或 `web_research_analyst`。

| roleDefinitionId                                               | requiredSkillNames（精确集合）                              |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `meeting_manager`                                              | `meeting-facilitation`                                      |
| `domain_architect`、`runtime_engineer`、`protocol_ui_engineer` | `repository-analysis`                                       |
| `verification_reviewer`                                        | `repository-analysis`、`evidence-review`、`github`、`arxiv` |
| `github_research_analyst`                                      | `github`                                                    |
| `arxiv_research_analyst`                                       | `arxiv`                                                     |

发行的 `plugin/meeting-roles/cordis.patch.yml` 保留 Host 的 `agent-presets` shipped/user roots，把发行 `presets/` 加为 system-trust root，并把 default 设回 shipped `standard`，不能令普通用户输入 Session 默认进入任一会议角色 Preset。每个角色的 `dshPresetId` 精确为 `convivium.<roleDefinitionId>`。该 Preset 中 `dsh-skill-filesystem` 配置 `includeDefaultRoots:false`、`watch:false`，`customSkillDirs` 仅列上表对应的能力目录，直接以能力目录为扫描根读取其 `SKILL.md`；每个路径在 `presets/<roleDefinitionId>/agent.cordis.yml` 中用 `fileURLToPath(new URL("../../skills/<ability>/", baseUrl))` 求得绝对安装路径，不得依赖 Host 当前工作目录，也不得挂载五能力共享父目录。目标 DSH `0.1.2-rc.1` 的 filesystem provider 会把扫描根下的 `SKILL.md` 作为 flat Markdown Skill 读取，并把扫描根作为相邻 `scripts/` 等资源的 base，故不需复制 Skill bundle。目标 Web bundle 已禁用 base 的 host `skill-filesystem` 行；部署仍可能加装其他 global Skill provider。预检必须对实际模型可见 `list` 做集合相等校验，并在同一 scope 对分配项、未分配项调用 `get`；额外可见、缺失、同名覆盖或正文 SHA 不符均为 `CAPABILITY_MISSING`。`toolFilter` 只收窄继承工具，Host 文件、网络和执行权限继续生效。

首发 Definition 的 Meeting tool 过滤固定如下。Manager 的 allow 精确为 `skill,convivium_read_meeting,convivium_submit_manager_plan,convivium_open_round,convivium_dispose_hand_raise,convivium_publish_round,convivium_recommend_identity`；Reviewer allow 精确为 `skill,convivium_read_meeting,convivium_run_review_worker,convivium_submit_evidence_review`。五个 Contributor 的 deny 精确为 `convivium_submit_manager_plan,convivium_open_round,convivium_dispose_hand_raise,convivium_publish_round,convivium_recommend_identity,convivium_run_review_worker,convivium_submit_evidence_review`。创建与十项用户控制不注册 Agent tool，不能把它们列为可用能力。Contributor 保留 read/raise_hand/submit_evidence 和 Host 原有非 Meeting 工具；Runtime 每次独立授权，toolFilter 不授予权限。

`meeting_manager` 与 `verification_reviewer` 只在创建时绑定唯一 Manager 与专职 reviewer；其它五个角色映射为 `roles:["contributor"]`，动态接纳只能使用这五个。Reviewer 只经专用 `convivium_run_review_worker` 启动固定 schema 的 one-shot DSH worker，不取得通用 subagent tool 或 worker Meeting authority。Definition 不授予 Meeting 控制权。

## Catalog Snapshot And Recommendation Input

    interface MeetingAgentCatalog {
      protocolVersion: 1; meetingId: string; catalogId: CatalogId; catalogVersion: string;
      generatedAt: EpochMs; candidates: CatalogCandidate[];
    }
    interface ReadCatalogRequest {
      protocolVersion: 1; meetingId: string;
      managerSessionId: string;
    }
    type ReadCatalogResult =
      | { kind: "available"; snapshot: MeetingAgentCatalog }
      | { kind: "rejected"; error: RoleError };
    interface CatalogCandidate {
      candidateId: string; definition: VersionedRef; definitionHash: string; displayName: string;
      availability: "available" | "unavailable"; meetingRoles: MeetingRole[];
      responsibilitySummary: string;
      capabilitySummary: CapabilitySummary[]; suitability: Suitability[];
    }
    interface CapabilitySummary { kind: CapabilityKind; label: string }
    interface Suitability { scope: string; rationale: string }
    interface IdentityRecommendationInput {
      candidateId: string; definition: VersionedRef; catalog: VersionedRef; agendaId: string;
      decision: "admit" | "reject"; rationale: string;
      expectedContribution: string; evidenceGap: string;
    }

Catalog producer 从 Host/profile 已验证的 Definition 和 DSH 授权范围生成当前 Meeting 安全 snapshot；`ReadCatalogRequest` 仅由 Runtime 从该 Meeting 当前 active Manager ownership 形成，Manager 不提交 Session ID。Producer 必须从 snapshot 排除该 Manager 自己的 Agent candidate，以及 `meeting_manager`、`verification_reviewer` Definition；Runtime 重读时仍检查 candidate Definition 与该 Meeting Manager 已固化 Definition 不同且不属于这两个创建期专用角色。Snapshot 必须绑定请求 Meeting，candidateId 在 snapshot 内唯一，`catalogVersion` 对一次内容快照稳定。只读 Manager projection 只显示候选 ID、Definition id/version、displayName、availability、角色与安全 summary/suitability，不返回 AGENTS 身份资源、toolFilter、Preset/Skill 正文、模型/权限配置。Manager 决定必须引用其只读入口取得的 catalogId/version 和该 snapshot 中 `available` candidate 的 candidateId/Definition identity。Runtime 在 command 中重读同一 Host producer；meetingId、ID/version 或 candidate 不匹配时拒绝整个决定，不写 Meeting。Catalog 缺失、过期、格式损坏时普通 Meeting 工作继续，准入决定 fail closed。Catalog 不复制完整 Definition；producer 对已验证 Definition 计算并提供稳定 `definitionHash`，Manager 安全 view 不显示该指纹，Runtime 在首个 `admit` 意图中固化它。provisioning 阶段只解析所记录的精确 Definition id/version/hash，不使用当前默认版本或目录替代。

## Definition Resolution And Preflight

```ts
interface ResolveDefinitionRequest {
  protocolVersion: 1;
  definition: VersionedRef;
}
type ResolveDefinitionResult =
  | {
      kind: "resolved";
      definition: MeetingAgentDefinition;
      binding: AgentDefinitionBinding;
    }
  | { kind: "rejected"; error: RoleError };
interface PreflightIdentityRequest {
  protocolVersion: 1;
  meetingId: string;
  identityId: string;
  sessionId: string;
  definition: VersionedRef;
  requestedRoles: MeetingRole[];
}
type PreflightIdentityResult =
  | { kind: "ready"; descriptor: PreparedDescriptor }
  | { kind: "rejected"; error: RoleError; missing: MissingCapability[] };
interface PreparedDescriptor {
  descriptorId: DescriptorId;
  meetingId: string;
  identityId: string;
  sessionId: string;
  definition: AgentDefinitionBinding;
  resources: ResourceBinding;
  agentOptions: EffectiveAgentOptions;
  descriptorHash: string;
  expiresAt: EpochMs;
}
interface MissingCapability {
  id: string;
  kind: "instructions" | "preset" | "skill" | "tool" | "model";
  reason: string;
}
```

创建七个初始身份时，在第一个 Session 发布前为全部七个 Definition 完成解析和预检：逐个调用 `ctx.agentPresets.standingKeyFor(dshPresetId)` 取得未创建 Agent 时的 Preset scope，并以该 scope 执行 `ctx.skills.list/get` 校验精确集合和正文；这只装配 standing Preset，不创建 Session。动态准入在提交 `provisioning` 意图后，以该意图固定的 ID/version/hash、identityId、sessionId 预检。动态 `requestedRoles` 必须精确为 `["contributor"]`，Definition 不得为 Manager 或专职 Reviewer。`descriptorId` 精确为 `"descriptor-" + sha256Hex(encodeCanonicalJson([meetingId, "descriptor", identityId])).slice(0, 32)`；`descriptorHash=sha256Hex(encodeCanonicalJson({descriptorId,meetingId,identityId,sessionId,definition,resources,agentOptions,expiresAt}))`，其中 `resources.skills` 按 name 排序。`expiresAt=preflightNow+300000`，`preflightNow` 取 Runtime 时钟且须为非负安全整数；在 `now>=expiresAt` 时拒绝。过期或跨 Meeting/identity/Session/Definition 的 descriptor 不复用。实际 Agent scoped setup 还须再次校验，阻止预检与发布之间的资源变化。

Runtime 从 Host `agentDefaultModel.currentSelection()` 取得 provider、model、optional reasoningEffort，仅用按 Definition ID 配置的 `agentModelOverrides` 覆盖指定字段，形成完整 `EffectiveAgentOptions`。该私有执行选择固化在 descriptor 和 ownership；恢复时原样传给 DSH `agentOptions`，不重新读取当前默认或 override。缺 provider/model、目标 provider/model 不可用时 fail closed。Caller、Manager、HTTP 不可提交模型值。

Meeting Runtime 持有的 Agent owner 调用 `ctx.agents.create({sessionId,meta:{agentPreset:dshPresetId},agentOptions,setup})`，不设置 `parentSession` 或 `origin:'subagent'`。`setup(agentCtx)` 先 `await ctx.agentPresets.mount(agentCtx,dshPresetId)`，读取并校验精确 AGENTS 资源，然后 `agentCtx.systemPrompt.section({name:"convivium:role-identity",order:1,text})`，按 Definition 调用 `agentCtx.tools.restrict(toolFilter)`，最后以该 agent scope 执行 `skills.list/get` 的集合、正文指纹和未分配项校验。任何一步失败由 DSH 回滚未发布 Agent/Session；返回 handle 且 ownership 激活前不得投递。DSH 按 cwd 装载的原生 AGENTS 仍由 Host 管理，不代替角色指令。Preset 不装配会议角色间直接消息工具。

## Atomic Admission And Ownership

```ts
interface AdmitIdentityRequest {
  protocolVersion: 1;
  meetingId: string;
  admissionId: string;
  preparedDescriptorId: DescriptorId;
  identityId: string;
  sessionId: string;
  identity: {
    displayName: string;
    roles: MeetingRole[];
    agendaResponsibilityIds: string[];
    riskAuthority: boolean;
    required: boolean;
  };
}
type AdmitIdentityResult =
  | { kind: "admitted"; identityId: string; ownership: SessionOwnership }
  | { kind: "rejected"; error: RoleError };
interface SessionOwnership {
  id: string;
  meetingId: string;
  identityId: string;
  sessionId: string;
  admissionId?: string;
  role: "manager" | "evidence_reviewer" | "participant";
  definition: AgentDefinitionBinding;
  resources: ResourceBinding;
  agentOptions: EffectiveAgentOptions;
  descriptorId: DescriptorId;
  descriptorHash: string;
  sessionLabel: string;
  lifecycleStatus: "provisioning" | "active" | "closed";
  capabilityStatus: "active" | "revoked";
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
```

`SessionOwnership` 是 Meeting Repository 私有记录，不是 DSH Session header。输入 Session 来源可选保存在私有 bootstrap.creator，不作为权限、不进入各 Agent ownership，也不是 DSH parent。`sessionId` 精确为 `"meeting_agent_session-" + sha256Hex(encodeCanonicalJson([meetingId, "meeting_agent_session", identityId])).slice(0, 32)`，`id` 精确为 `"session_ownership-" + sha256Hex(encodeCanonicalJson([meetingId, "session_ownership", identityId])).slice(0, 32)`；这两个值在初始创建或动态 intent 中固定，重试时不得重新分配。`sessionLabel` 只供诊断。初始七身份的 `admissionId` 缺席，动态身份必填且等于已提交的 `IdentityRecommendation.id`。`createdAt` 由首次写入 provisioning ownership 的 Runtime 时钟给出，重试保持；`updatedAt` 由每次成功状态变更的 Runtime 时钟给出。目标格式不含旧 `parentSessionId`、`childSessionId`、`provider`、`initialMessageId`、`participantId` 或 `supersededBySessionId`；首发不读写旧格式。

Runtime 先持久化不可调度的 `provisioning` ownership，再创建 Agent、核对 DSH Session ID/`header.agentPreset` 与 descriptor，并在当前 Meeting lifecycle、意图、Definition 和 ownership 仍相符时以 CAS 激活。激活前该 Session 的 Meeting command/read 一律拒绝；发布后激活失败则先 revoke 再 `AgentHandle.dispose()`。七身份任一步失败时 creation bootstrap 留 `creation_failed`，逐一 revoke/stop 已创建的目标 Session，不返回 ready Meeting。动态 Manager `admit` 只先提交不可调度意图，`recommendationId` 是稳定 admissionId；成功激活后才追加 MeetingIdentity 并提交 `active` 结果，失败提交 `failed` RoleError。相同 admissionId 与同 payload 重放返回同结果，不同 payload 为 `ADMISSION_CONFLICT`；另一 Agenda 对已 active identity 的合法复用不新建 Session。

Repository 使用现有 `MeetingRepositoryPort.create`、`recordSessionOwnership`、`completeCreate`、`updateBootstrap` 与 `execute` 的事务队列，不另设第二个 ownership store。目标 `CreateMeetingInput` 增加必填 `creator:MeetingBootstrap["creator"]` 和精确七项 `initialOwnership: SessionOwnershipInput[]`；`create` 在同一 creation record 中保存来源与七项 `capabilityStatus:active`、`lifecycleStatus:provisioning` 的 ownership，先验证七项 Meeting/identity/session/id 唯一且与 initialState 身份一一对应，再写 creation record。相同 requestId/hash 的 create 重放还须要求创建用户来源和七项 ownership 逐字段相同，否则 `IDEMPOTENCY_CONFLICT`。`recordSessionOwnership` 只接受精确现存 `(id,meetingId,identityId,sessionId,definition,resources,agentOptions,descriptorId,descriptorHash,role,admissionId)` 的同值重放、`provisioning→active`、`provisioning→closed`（失败撤权后）、`active→closed` 与 capability `active→revoked`；其它 immutable 字段变化、状态回退或错 Meeting 均拒绝。`completeCreate` 必须原子核对七份均 active 且未 revoked，才发布 ready snapshot、receipt 与初始 outbox；`updateBootstrap(creation_failed)` 先原子把 creation record 中七份 capability revoke，再写失败状态。ready Meeting 的动态 provisioning ownership 由同一 repository commit 保存，只有对应 `IdentityRecommendation.status=provisioning` 且字段相符时才可 record；激活 ownership 与 `record_identity_admission_result` 不合并为一个不可证明的外部 DSH/Repository 原子操作，后者提交前重验 active ownership 并在失败/终态时 revoke 清理。

创建和动态准入均需持久化原预检证明：`CreateMeetingInput` 必填 `preparedDescriptors:PreparedDescriptor[]`（精确七项），creation record 与 v2 projection/recovery result 同名私有字段保存集合；`recordSessionOwnership(input,now,descriptor?)` 第三参数为可选 PreparedDescriptor，仅首次新增 provisioning ownership 必填，更新/同值重放不得替换原 descriptor。Repository 验证 descriptor 与 ownership 逐字段/hash 对应，同事务保存；descriptor 不进入公开 DTO/事件。未激活的恢复和 CAS 仍要求原 expiresAt 未到期；到期按 PREFLIGHT_EXPIRED 失败、撤权和清理，禁止刷新 hash 延长；active ownership 恢复不再用 TTL 作为权限期限。

持久化 `CreationRecordSchema` 与 `PersistenceProjectionSchema` 的 `formatVersion` 目标为 `2`，其中嵌套 bootstrap 与 ownership 使用本文新字段；旧 `formatVersion:1` 一律以内部 RepositoryError `SCHEMA_VERSION_UNSUPPORTED` 拒读，application 映射为公开 `INCOMPATIBLE_VERSION`，不迁移、不回退、不混合写。未改变结构的事件、receipt、outbox 和 catalog record 继续使用原格式版本；新 projection 的 hash/checkpoint/recovery 只接受完整 v2 snapshot，不能从旧记录重建。`SessionOwnershipInput=Omit<SessionOwnership,"createdAt"|"updatedAt">`；时间仅由 Repository 的 Runtime now 写入。`SessionOwnership` 先 revoked 后才允许 closed；同值重放不更改 `createdAt`，成功状态变更仅更新 `updatedAt`。

Runtime owner 私有 Map 持有 live handle 与装配 purpose（精确结构见专项设计）；`ctx.agents.get` 返回裸 Agent，不构成 dispose 能力或未知 live Session 的收养依据。Host 冷重启按 Meeting Repository 的 active/provisioning ownership 核对精确 Definition ID/version/hash、资源 SHA、Session header ID/Preset，调用 `ctx.agents.resume({resumeSessionId,agentOptions,setup})`；setup 使用与创建相同的固化资源绑定。资源、持久 Session、descriptor 或 ownership 不能证明时返回 `RECOVERY_UNAVAILABLE`，不以默认资源、替代 Session 或 Captain parent 补建。已撤权/closed ownership 即使留有 DSH 日志也不恢复 Meeting authority。`AgentHandle.dispose()` 从 live store 移除 Session；持久日志保留依 Host persistence/retention policy 单独验证。

## Runtime Delivery And Session Stop

Meeting Runtime 的 outbox 在每次投递前重新检查目标 Meeting、identity、active ownership、Session ID、lifecycle 与 notice 可见性；只经 Runtime 获取已持有或恢复的 handle，使用 `handle.agent.followup(UserMessage)`。消息 ID 固定为 effect deliveryId，`source` 为 Convivium plugin，内容仅含当前 caller 可见的会议提示和读取指令。调用后通过 `ctx.sessions.flush(handle.agent.session)` 等待至少一个持久化 listener 成功，再标记 outbox delivered；返回 false、抛错或进程在 delivered commit 前退出时保留 effect 重试。重复通知可能出现，Session inbox 接受不代表业务完成；Meeting command 的 requestId、version、review claim 与 effect ID 仍决定事实幂等。目标未驻留则先按 ownership 恢复；不能恢复时 effect 保持 retryable，Meeting 报 `RECOVERY_UNAVAILABLE`。

投递的 `UserMessage` 精确为 `{id:deliveryId,role:"user",content:[{type:"text",text}],source:{kind:"plugin",plugin:"convivium"}}`；`deliveryId` 来自已提交 outbox item，`text` 由该 effect 的 caller-visible projection 生成且须非空，不把原始私有 payload 或 Session ID 拼进消息。`followup` 是同步 inbox 接受；随后 `flush` 的 `true` 只证明至少一个持久化 listener 成功，不证明模型 turn 或业务完成。Runtime 必须在 `followup` 前和 `flush` 后重验同一 Meeting/identity/active ownership/sessionId/effect；后验失败不写 delivered。owner 只能投递到由自己创建或恢复、仍在私有 handle map 的目标 Session；不得向任意 `ctx.agents.get` 裸 Agent 投递或调用跨 Agent 直接消息 API。

Pause 停止新调度并取消目标身份正在进行的会议活动，恢复时依据已提交 Meeting/outbox 重新投递当前可见工作；终态和归档先 revoke capability，再取消并 drain 目标 Meeting 的 Agent，最后 dispose handle。不能枚举 Captain 的 child Session 或关闭其他 Meeting。持久 Session 日志只是诊断资料，不是会议事实；已撤权 Session 即使被 DSH 外部恢复也无法执行 Meeting command。Agent 间正式交流仍由 Meeting Runtime 的授权操作形成，不启用直接互发消息通道。

## Role Errors And Authorization

    interface RoleError {
      code:
        | "INVALID_ARGUMENT" | "DEFINITION_NOT_FOUND" | "DEFINITION_VERSION_MISMATCH"
        | "CATALOG_NOT_FOUND" | "CATALOG_STALE" | "CATALOG_CANDIDATE_MISMATCH"
        | "ROLE_NOT_ALLOWED"
        | "CAPABILITY_MISSING" | "PREFLIGHT_EXPIRED" | "ADMISSION_CONFLICT"
        | "SESSION_CREATION_FAILED" | "OWNERSHIP_CONFLICT" | "RECOVERY_UNAVAILABLE"
        | "INCOMPATIBLE_VERSION";
      message: string; targetId?: string;
    }

错误优先级为：协议结构 → Definition/Catalog 可见性 → caller 为 Runtime service → 精确 version/snapshot → Definition role/Preset/Skill policy → preflight freshness → admission idempotency → Session/ownership availability。只有 Runtime 可以 resolve、preflight、admit、recover 或 stop identity resources；Manager 只可经 Meeting `recommend_identity` command 作出 `admit|reject`，不能直接调用这些 port。Captain 不处置该决定。

## Compatibility And Acceptance

目标契约仅支持 DSH `0.1.2-rc.1` 的公开平级 Agent API；版本或必需 service 缺失时 Host 装载 fail closed，不回退到 Captain child。未发布的旧 Definition、ownership、descriptor 不读取、不转换、不双写；unknown discriminant、缺失必填字段或旧字段组合 fail closed。Catalog 安全摘要可增加 optional read field；Definition 语义、descriptor provenance、ownership 或 preflight/admission 顺序变化须形成新版本。

1. 每个 Definition/admission 输入可由这些类型表达，没有 catch-all resource/config 字段。
2. 七个角色的模型可见 Skill 集合精确等于分配集合，未分配 Skill 既不可列出也不可按名称加载；缺失或额外 global capability 不创建 identity/Session。
3. Manager 的 `reject` 不创建 Session/identity，`admit` 的 provisioning 意图在完成平级 Session/ownership 前不授予 Meeting authority。
4. 用户输入 Session 关闭不阻止七身份投递与用户控制；可信用户入口重新连接后无需恢复原 Session。冷恢复使用原 `EffectiveAgentOptions` 与资源绑定，缺失 descriptor/资源时 fail closed，而不套用当前默认。

## Related Documents

- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [Meeting Interface](./MEETING-INTERFACE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
