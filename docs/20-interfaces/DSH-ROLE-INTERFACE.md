# DSH Role Interface

## Purpose And Boundary

本文定义 Host/profile 与 Convivium 的版本化角色资源契约：Meeting Agent Definition、只读 Catalog、预检、descriptor 绑定和 admission 结果。它不定义 Meeting 权限或领域事实；这些由 [Meeting Interface](./MEETING-INTERFACE.md) 和 [Domain Design](../30-designs/DOMAIN-DESIGN.md) 决定。Host 拥有 Preset、Skill、模型、Sandbox、Approval、MCP、真实 descriptor 和 Session；Convivium 只保存 Definition provenance、推荐和已验证的 identity ownership。

Definition 与 Catalog 不得携带完整 Agent 配置、prompt、凭据、MCP 参数、Session、文件路径、内部工具 schema 或隐藏推理；Catalog 候选不等于获得 Meeting 加入或控制权。

## Primitive Types And Versions

    type DefinitionId = string;
    type CatalogId = string;
    type DescriptorId = string;
    type EpochMs = number;
    interface VersionedRef { id: string; version: string }
    type MeetingRole =
      | "captain" | "manager" | "contributor" | "evidence_reviewer";
    type CapabilityKind = "preset" | "skill" | "tool" | "mcp" | "model" | "sandbox" | "approval";

一个 Definition identity 由 definitionId 与 definitionVersion 组成。相同 identity 的内容必须语义相同；内容、角色、允许资源或默认约束改变必须产生新 definitionVersion。Catalog version 是一次快照版本，不是 Definition 的兼容承诺。

## Meeting Agent Definition

    type AgentRoleDefinitionIdV1 =
      | "meeting_manager" | "domain_architect" | "runtime_engineer"
      | "protocol_ui_engineer" | "verification_reviewer"
      | "github_research_analyst" | "arxiv_research_analyst";
    type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";
    interface ToolRestrictionV1 { allow?: string[]; deny?: string[] }
    interface MeetingAgentDefinitionV1 {
      agentDefinitionId: DefinitionId; definitionVersion: string;
      roleDefinitionId: AgentRoleDefinitionIdV1; displayName: string; summary: string;
      roleDescription: string; dshPresetId: string; requiredSkillNames: string[];
      toolFilter?: ToolRestrictionV1; expertiseTags: string[];
      evidenceScopes: AgentEvidenceScopeV1[];
    }
    interface AgentDefinitionBindingV1 {
      agentDefinitionId: DefinitionId; definitionVersion: string; definitionHash: string;
    }

Definition 采用 [MO-FR-14](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-14共享-preset-下的-meeting-agent-definition) 的当前发布字段：`agentDefinitionId/definitionVersion` 固定同一语义，`roleDescription` 只写会议职责，通用方法由原生 DSH Skill 承担。`meeting_manager` 与 `verification_reviewer` 只能在创建时分别绑定唯一 Manager 与唯一专职 evidence reviewer，不能作为动态普通 Participant 准入；其他 roleDefinitionId 经 Runtime 固定映射为 `roles:["contributor"]`、空 agenda responsibility、`riskAuthority:false`、`required:false`，Definition 不授予 Meeting 控制权。`web_research_analyst` 当前不属于有效 `AgentRoleDefinitionIdV1`，Host producer 和 Runtime 均不得发布或接纳该 Definition。Reviewer Definition 可以引用 Host-approved 的材料读取、代码核验、Web/GitHub/arXiv 查询与运行验证能力，具体工具仍由 Host policy 决定。`dshPresetId` 与 `requiredSkillNames` 是精确 Host 引用；共享 Captain parent Preset 或任一 required Skill 缺失时 fail closed。`toolFilter` 只收窄继承工具，模型覆盖仅由 Host 独立配置提供，不在 Definition 或 Manager 输入中保存。`AgentDefinitionBindingV1` 的内容指纹由 Runtime 对已验证 Definition 规范化计算并与 Session descriptor 固化；不从 displayName 或当前默认定义推断。

## Catalog Snapshot And Recommendation Input

    interface MeetingAgentCatalogV1 {
      protocolVersion: 1; meetingId: string; catalogId: CatalogId; catalogVersion: string;
      generatedAt: EpochMs; candidates: CatalogCandidateV1[];
    }
    interface ReadCatalogRequestV1 {
      protocolVersion: 1; meetingId: string;
      captainSessionId: string; managerSessionId: string;
    }
    type ReadCatalogResultV1 =
      | { kind: "available"; snapshot: MeetingAgentCatalogV1 }
      | { kind: "rejected"; error: RoleErrorV1 };
    interface CatalogCandidateV1 {
      candidateId: string; definition: VersionedRef; definitionHash: string; displayName: string;
      availability: "available" | "unavailable"; meetingRoles: MeetingRole[];
      responsibilitySummary: string;
      capabilitySummary: CapabilitySummaryV1[]; suitability: SuitabilityV1[];
    }
    interface CapabilitySummaryV1 { kind: CapabilityKind; label: string }
    interface SuitabilityV1 { scope: string; rationale: string }
    interface IdentityRecommendationInputV1 {
      candidateId: string; definition: VersionedRef; catalog: VersionedRef; agendaId: string;
      decision: "admit" | "reject"; rationale: string;
      expectedContribution: string; evidenceGap: string;
    }

Catalog producer 从 Host/profile 已验证的 Definition 和 DSH 授权范围生成当前 Meeting 安全 snapshot；`ReadCatalogRequestV1` 仅由 Runtime 用已验证 Captain parent 与当前 Manager Session 形成，Manager 不提交 Session ID。Producer 必须从 snapshot 排除该 Manager 自己的 Agent candidate，以及 `meeting_manager`、`verification_reviewer` Definition；Runtime 重读时仍检查 candidate Definition 与该 Meeting Manager 已固化 Definition 不同且不属于这两个创建期专用角色。Snapshot 必须绑定请求 Meeting，candidateId 在 snapshot 内唯一，`catalogVersion` 对一次内容快照稳定。只读 Manager projection 只显示候选 ID、Definition id/version、displayName、availability、角色与安全 summary/suitability，不返回 roleDescription、toolFilter、Preset/Skill 正文、模型/权限配置。Manager 决定必须引用其只读入口取得的 catalogId/version 和该 snapshot 中 `available` candidate 的 candidateId/Definition identity。Runtime 在 command 中重读同一 Host producer；meetingId、ID/version 或 candidate 不匹配时拒绝整个决定，不写 Meeting。Catalog 缺失、过期、格式损坏时普通 Meeting 工作继续，准入决定 fail closed。Catalog 不复制完整 Definition；producer 对已验证 Definition 计算并提供稳定 `definitionHash`，Manager 安全 view 不显示该指纹，Runtime 在首个 `admit` 意图中固化它。provisioning 阶段只解析所记录的精确 Definition id/version/hash，不使用当前默认版本或目录替代。

## Definition Resolution And Preflight

    interface ResolveDefinitionRequestV1 { protocolVersion: 1; definition: VersionedRef }
    type ResolveDefinitionResultV1 =
      | { kind: "resolved"; definition: MeetingAgentDefinitionV1; binding: AgentDefinitionBindingV1 }
      | { kind: "rejected"; error: RoleErrorV1 };
    interface PreflightIdentityRequestV1 {
      protocolVersion: 1; meetingId: string; parentSessionId: string;
      definition: VersionedRef; requestedRoles: MeetingRole[];
    }
type PreflightIdentityResultV1 =
      | { kind: "ready"; descriptor: PreparedDescriptorV1; verifiedPresetId: string; verifiedSkillNames: string[]; verifiedCapabilities: VerifiedCapabilityV1[] }
      | { kind: "rejected"; error: RoleErrorV1; missing: MissingCapabilityV1[] };
    interface PreparedDescriptorV1 {
      descriptorId: DescriptorId; meetingId: string; parentSessionId: string;
      definition: VersionedRef; definitionHash: string;
      descriptorHash: string; expiresAt: EpochMs;
    }
    interface VerifiedCapabilityV1 { id: string; kind: "preset" | "skill"; version?: string }
    interface MissingCapabilityV1 { id: string; kind: "preset" | "skill"; reason: string }

Runtime 在创建动态身份 Session 或写入 MeetingIdentity 前调用 preflight。`parentSessionId` 取自本 Meeting 已验证 Captain parent ownership，不由 Manager 提交。动态准入 `requestedRoles` 必须精确为 `["contributor"]`，Definition 不能是 `meeting_manager|verification_reviewer`；`dshPresetId` 必须等于 parent 的实际共享 Preset，全部 `requiredSkillNames` 必须由 DSH 原生 Skill provider 在该 scope 验证。不能以 persona、toolFilter 或当前 Host 默认资源代替失败的必需能力。ready descriptor 只属于当前 Meeting、parent、精确 Definition version/hash 且会到期；过期或不匹配不得给另一 Meeting、Definition 或 admission 复用。

## Atomic Admission And Ownership

    interface AdmitIdentityRequestV1 {
      protocolVersion: 1; meetingId: string; admissionId: string; preparedDescriptorId: DescriptorId;
      identityId: string; childSessionId: string;
      identity: {
        displayName: string; roles: MeetingRole[]; agendaResponsibilityIds: string[];
        riskAuthority: boolean; required: boolean;
      };
    }
    type AdmitIdentityResultV1 =
      | { kind: "admitted"; identityId: string; ownership: SessionOwnershipV1 }
      | { kind: "rejected"; error: RoleErrorV1 };
    interface SessionOwnershipV1 {
      id: string; admissionId: string; meetingId: string; identityId: string; parentSessionId: string;
      descriptorId: DescriptorId; descriptorHash: string; descriptorExpiresAt: EpochMs;
      definition: VersionedRef; definitionHash: string;
      sessionId: string; createdAt: EpochMs;
      status: "provisioning" | "active" | "interrupted" | "stopped" | "unrecoverable";
    }

Manager 的 `admit` 只先形成不可调度的 Meeting provisioning 意图，其 `recommendationId` 同时是稳定 `admissionId`；Runtime 在该 intent 中一并固定唯一预留 identityId 和 childSessionId，`reject` 不调用本 port。Admission activation 是跨 Definition validation、descriptor validity、Session creation、durable ownership 与 Meeting identity fact 的 all-or-nothing 操作：不能返回 admitted 或公开 identity，除非五者都成功；返回的 identityId 必须精确等于请求的预留 ID。失败前新建 Session 必须释放或标记不可访问。admissionId 在同一 Meeting/Definition identity 内幂等，等 payload replay 返回同 identity/ownership；进程退出后的 provisioning intent 只能重试该 id 与记录的精确 Definition identity/identityId/childSessionId，同 id 不同 payload 返回 ADMISSION_CONFLICT。恢复已创建身份仅在存储的 admissionId、meetingId、identityId、descriptorId/hash/到期时间、Definition provenance 都匹配时继续；descriptor 缺失或不匹配返回 RECOVERY_UNAVAILABLE，绝不使用当前 Definition 替代。`provisioning` ownership 不授予 child Meeting authority；Session 可证明创建且 ready 后才转为 `active`。

`AdmitIdentityRequestV1.identity.agendaResponsibilityIds` 指本 Meeting 已存在的 `AgendaItem.id`，未知 ID 拒绝，不能凭 displayName 或 Definition 推断。动态准入不能改变 Meeting.evidenceReviewerId、授予 evidence_reviewer role 或替换创建时固化的专职审核身份。

## Role Errors And Authorization

    interface RoleErrorV1 {
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

V1 不适配 legacy role record、display-name lookup、松散 capability label 或路径发现配置。unknown discriminant、缺失 version 字段均 fail closed。Catalog 安全摘要可增加 optional read field；Definition 语义、descriptor provenance、ownership 或 preflight/admission 顺序变化必须形成新的 versioned contract。

1. 每个 Definition/admission 输入可由这些类型表达，没有 catch-all resource/config 字段。
2. 测试可以证明 Definition 变更只影响新 identity，缺失 required capability 不创建 identity/Session。
3. 测试可以证明 Manager 的 `reject` 不创建 Session/identity，`admit` 的 provisioning 意图在完成独立 Session/ownership 前不授予 Meeting authority。
4. 恢复测试可以证明 descriptor 缺失/不匹配 fail closed，而不是套用当前 Definition。

## Related Documents

- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [Meeting Interface](./MEETING-INTERFACE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
