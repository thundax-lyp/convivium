# DSH Role Interface

## Purpose And Boundary

本文定义 Host/profile 与 Convivium 的版本化角色资源契约：Meeting Agent Definition、只读 Catalog、预检、descriptor 绑定和 admission 结果。它不定义 Meeting 权限或领域事实；这些由 [Meeting Interface](./MEETING-INTERFACE.md) 和 [Domain Design](../30-designs/DOMAIN-DESIGN.md) 决定。Host 拥有 Preset、Skill、模型、Sandbox、Approval、MCP、真实 descriptor 和 Session；Convivium 只保存 Definition provenance、推荐和已验证的 identity ownership。

Definition 与 Catalog 不得携带完整 Agent 配置、prompt、凭据、MCP 参数、Session、文件路径、内部工具 schema 或隐藏推理；Catalog 候选不等于获得 Meeting 加入或控制权。

## Primitive Types And Versions

    type DefinitionId = string;
    type CatalogId = string;
    type DescriptorId = string;
    type CapabilityId = string;
    type EpochMs = number;
    interface VersionedRef { id: string; version: string }
    type MeetingRole =
      | "captain" | "manager" | "contributor" | "evidence_reviewer";
    type CapabilityKind = "preset" | "skill" | "tool" | "mcp" | "model" | "sandbox" | "approval";

一个 Definition identity 由 definitionId 与 definitionVersion 组成。相同 identity 的内容必须语义相同；内容、角色、允许资源或默认约束改变必须产生新 definitionVersion。Catalog version 是一次快照版本，不是 Definition 的兼容承诺。

## Meeting Agent Definition

    interface MeetingAgentDefinitionV1 {
      protocolVersion: 1;
      definitionId: DefinitionId;
      definitionVersion: string;
      displayName: string;
      meetingRoles: MeetingRole[]; // non-empty, distinct
      responsibilitySummary: string;
      dshPresetId: string;
      requiredSkillNames: string[]; // distinct, exact Host names
      capabilityRequirements: CapabilityRequirementV1[];
      permittedResources: PermittedResourceRefV1[];
      modelSelection?: ModelSelectionV1;
      limits: DefinitionLimitsV1;
      provenance: DefinitionProvenanceV1;
    }
    interface CapabilityRequirementV1 {
      capabilityId: CapabilityId; kind: CapabilityKind; required: boolean;
      minimumVersion?: string; purpose: string;
    }
    interface PermittedResourceRefV1 {
      kind: "preset" | "skill" | "tool" | "mcp"; id: string; version?: string; required: boolean;
    }
    interface ModelSelectionV1 {
      mode: "host_default" | "allow_list"; allowedModelIds?: string[];
    }
    interface DefinitionLimitsV1 { maxConcurrentTasks: number; maxToolCallsPerTask: number }
    interface DefinitionProvenanceV1 { source: "host_config"; publishedAt: EpochMs; contentHash: string }

meetingRoles 只表示该 Definition 能转换成的 MeetingIdentity 候选角色；它不授予 Captain、riskAuthority、agenda/review responsibility 或任何 Meeting 控制权。dshPresetId 和 requiredSkillNames 是精确 Host 引用，均不得由 displayName、路径或当前默认项推断。permittedResources 是引用白名单，不是资源内容；不可通过路径、URL、glob、任意 JSON 或环境变量注入资源。required capability/resource、Preset 或任一 required Skill 缺失时预检失败；optional 项缺失只在 Definition 明确仍可运行时允许，并在报告中列出。modelSelection 为 allow_list 时 allowedModelIds 必须非空且无重复；否则它必须缺席。

## Catalog Snapshot And Recommendation Input

    interface MeetingAgentCatalogV1 {
      protocolVersion: 1; catalogId: CatalogId; catalogVersion: string;
      generatedAt: EpochMs; candidates: CatalogCandidateV1[];
    }
    interface CatalogCandidateV1 {
      definition: VersionedRef; displayName: string; meetingRoles: MeetingRole[];
      capabilitySummary: CapabilitySummaryV1[]; suitability: SuitabilityV1[];
    }
    interface CapabilitySummaryV1 { kind: CapabilityKind; label: string }
    interface SuitabilityV1 { scope: string; rationale: string }
    interface IdentityRecommendationInputV1 {
      definition: VersionedRef; catalog: VersionedRef; agendaId: string;
      rationale: string; expectedContribution: string; evidenceGap: string;
    }

Catalog 读取是只读、一次性 snapshot：Manager recommendation 必须引用实际读取的 catalogId/version 和该 snapshot 中 candidate。Catalog 缺失、过期、格式损坏或 candidate 不匹配时，不得产生 recommendation；普通 Meeting 工作可以继续。Catalog 不复制完整 Definition，Runtime admission 时必须重新解析精确 Definition identity。

## Definition Resolution And Preflight

    interface ResolveDefinitionRequestV1 { protocolVersion: 1; definition: VersionedRef }
    type ResolveDefinitionResultV1 =
      | { kind: "resolved"; definition: MeetingAgentDefinitionV1 }
      | { kind: "rejected"; error: RoleErrorV1 };
    interface PreflightIdentityRequestV1 {
      protocolVersion: 1; meetingId: string; definition: VersionedRef;
      requestedRoles: MeetingRole[]; permittedResourceRefs: PermittedResourceRefV1[];
      modelOverride?: string;
    }
type PreflightIdentityResultV1 =
      | { kind: "ready"; descriptor: PreparedDescriptorV1; verifiedPresetId: string; verifiedSkillNames: string[]; verifiedCapabilities: VerifiedCapabilityV1[] }
      | { kind: "rejected"; error: RoleErrorV1; missing: MissingCapabilityV1[] };
    interface PreparedDescriptorV1 {
      descriptorId: DescriptorId; definition: VersionedRef; descriptorHash: string; expiresAt: EpochMs;
    }
    interface VerifiedCapabilityV1 { capabilityId: CapabilityId; kind: CapabilityKind; version?: string }
    interface MissingCapabilityV1 { capabilityId: CapabilityId; kind: CapabilityKind; reason: string }

Runtime 在创建第一条 Session 或写入 MeetingIdentity 前调用 preflight。requestedRoles 必须是 Definition roles 的非空子集。permittedResourceRefs 稳定排序后必须精确等于 Definition 的资源引用；调用方不得扩大、遗漏 required 资源或替代同名 version。modelOverride 只在 allow_list mode 中合法。ready descriptor 是 meeting-specific 且会到期，不能给另一个 Meeting、Definition version 或 admission reuse。

## Atomic Admission And Ownership

    interface AdmitIdentityRequestV1 {
      protocolVersion: 1; meetingId: string; admissionId: string; preparedDescriptorId: DescriptorId;
      identity: {
        displayName: string; roles: MeetingRole[]; agendaResponsibilityIds: string[];
        reviewResponsibilityIds: string[]; riskAuthority: boolean; required: boolean;
      };
    }
    type AdmitIdentityResultV1 =
      | { kind: "admitted"; identityId: string; ownership: SessionOwnershipV1 }
      | { kind: "rejected"; error: RoleErrorV1 };
    interface SessionOwnershipV1 {
      id: string; meetingId: string; identityId: string; descriptorId: DescriptorId; definition: VersionedRef;
      sessionId: string; createdAt: EpochMs;
      status: "active" | "interrupted" | "stopped" | "unrecoverable";
    }

Admission 是跨 Definition validation、descriptor validity、Session creation、durable ownership 与 Meeting identity fact 的 all-or-nothing 操作：不能返回 admitted，除非五者都成功；失败前新建 Session 必须释放或标记不可访问。admissionId 在同一 Meeting/Definition identity 内幂等，等 payload replay 返回同 identity/ownership。恢复仅在存储的 meetingId、identityId、descriptorId、Definition provenance 都匹配时继续；descriptor 缺失或不匹配返回 RECOVERY_UNAVAILABLE，绝不使用当前 Definition 替代。

`AdmitIdentityRequestV1.identity.agendaResponsibilityIds` 与 `reviewResponsibilityIds` 均指本 Meeting 已存在的 `AgendaItem.id`，未知 ID 拒绝，不能凭 displayName 或 Definition 推断。reviewResponsibilityIds 非空时 requested roles 必须包含 `evidence_reviewer`；接纳后的 MeetingIdentity.reviewResponsibilityIds 与 AgendaItem.requiredReviewerIds（identityId 数组）必须双向一致，不能在没有原子关联更新的情况下返回 admitted。Agenda/reviewer 的具体创建或更新入口由相邻 Meeting admission 切片固定，不由 DSH Definition 自行补全。

## Role Errors And Authorization

    interface RoleErrorV1 {
      code:
        | "INVALID_ARGUMENT" | "DEFINITION_NOT_FOUND" | "DEFINITION_VERSION_MISMATCH"
        | "CATALOG_NOT_FOUND" | "CATALOG_STALE" | "CATALOG_CANDIDATE_MISMATCH"
        | "ROLE_NOT_ALLOWED" | "RESOURCE_NOT_ALLOWED" | "MODEL_NOT_ALLOWED"
        | "CAPABILITY_MISSING" | "PREFLIGHT_EXPIRED" | "ADMISSION_CONFLICT"
        | "SESSION_CREATION_FAILED" | "OWNERSHIP_CONFLICT" | "RECOVERY_UNAVAILABLE"
        | "INCOMPATIBLE_VERSION";
      message: string; targetId?: string;
    }

错误优先级为：协议结构 → Definition/Catalog 可见性 → caller 为 Runtime service → 精确 version/snapshot → Definition role/resource/model policy → preflight freshness → admission idempotency → Session/ownership availability。只有 Runtime 可以 resolve、preflight、admit、recover 或 stop identity resources；Manager/Captain 只可经 Meeting command 发起 recommendation/disposition，不能直接调用这些 port。

## Compatibility And Acceptance

V1 不适配 legacy role record、display-name lookup、松散 capability label 或路径发现配置。unknown discriminant、缺失 version 字段均 fail closed。可增加 optional Catalog summary；Definition 语义、descriptor provenance、ownership 或 preflight/admission 顺序变化必须形成新的 versioned contract。

1. 每个 Definition/admission 输入可由这些类型表达，没有 catch-all resource/config 字段。
2. 测试可以证明 Definition 变更只影响新 identity，缺失 required capability 不创建 identity/Session。
3. 测试可以证明 catalog recommendation 不授予 Meeting authority，Captain 处置前不改变 Meeting。
4. 恢复测试可以证明 descriptor 缺失/不匹配 fail closed，而不是套用当前 Definition。

## Related Documents

- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [Meeting Interface](./MEETING-INTERFACE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
