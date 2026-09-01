# DSH Agent Template Interface

## Purpose

本文定义 Convivium 使用的版本化 DSH Agent Template 契约。每个可进入 Agent role catalog 的 DSH Agent candidate 必须解析到一个完整 Template；Template 由机器可校验 manifest、角色专用说明、Skills、Tools、MCP 和权限上限组成，并能为 meeting-owned continuable AgentSession 在首次创建和 cold resume 时重建相同的有效组合。

仓库 `AGENTS.md` 是当前仓库协作工具使用的 workspace/repository 共享工程规则，不是单个 DSH Agent 的 persona 或 Template manifest。当前 DSH `0.1.1-rc.2` 公开 continuable API 不保证自动发现或加载 `AGENTS.md`；Template 不得依赖这种隐式行为。必须传给 DSH Agent 的共享说明使用显式、版本化 `baseInstructionSetRefs`，角色专用说明使用 `ROLE.md`。

本文不规定 Host registry 中 Template 的最终物理存储目录。仓库在 `plugin/examples/agent-templates/` 保存不进入发布包的契约样本；这些样本不构成 Runtime 已安装的 Template，也不能替代 Host resolution 和 scoped composition。

## Boundary And Ownership

- DSH Host 或其受控 profile 拥有 Template registry、Skills、Tools、MCP connection、模型路由、Sandbox 和 Approval 能力。
- Convivium 拥有 Meeting 对某个 `templateId + templateVersion + manifestHash` 的选择、快照引用、授权上限、Session ownership 和恢复一致性。
- Template manifest 是机器配置真相源；`ROLE.md` 是角色专用说明正文；Agent role catalog 只向 Manager 暴露安全摘要，不暴露 manifest、文件路径、Prompt 正文、MCP 配置或权限细节。
- `AGENTS.md` 可以约束开发 Template 的仓库协作者，但只有 manifest 显式引用并由 Host resolver 安装的 base instruction set 才属于 DSH Agent 的运行时组合。
- Skills、Tool sets 和 MCP sets 使用版本化引用；Template 不复制共享 Skill 内容、Tool 实现或 MCP 凭据。
- Template 只能收窄或选择 DSH Host 已提供的能力，不能注册未授权 Tool、扩大 Sandbox、降低 Approval 要求或创建新凭据。
- Meeting Runtime 不解释 Agent 的内部 Skill 步骤、Tool 调用顺序或 MCP 结果；只有正式会议提交和授权 evidence projection 能进入 MeetingState。
- Template resolution 和 scoped composition 属于 Host/DSH 边界，不能由 Plugin Frontend 或 Manager Session 直接读取或执行。

## Transport Or Invocation

### Template package

一个 Template package 至少包含：

```text
<template-package>/
├── agent-template.json
└── ROLE.md
```

`agent-template.json` 只允许使用 package root 内的规范化相对路径引用 `ROLE.md`；绝对路径、`..`、符号链接逃逸和 workspace 任意文件引用必须拒绝。Skills、Tool sets、MCP sets 和 permission profile 通过 Host registry ID 引用，不要求复制进 Template package。

### Registry port

Convivium 只依赖类型化 Template registry port，不扫描任意目录：

```ts
interface DshAgentTemplateRegistry {
  resolve(
    reference: DshAgentTemplateRefV1,
    authority: DshAgentTemplateAuthorityV1,
    signal: AbortSignal,
  ): Promise<ResolvedDshAgentTemplateV1>;
}

interface DshAgentTemplateAuthorityV1 {
  teamId: string;
  captainSessionId: string;
}

interface DshAgentTemplateRefV1 {
  templateId: string;
  templateVersion: string;
}
```

`resolve()` 必须验证 Captain/Team 可见性、manifest schema、role binding、全部资源引用、hash、Tool 存在性、MCP/Skill/permission set 可用性以及当前 DSH composition 能力。失败不得返回部分 Template。

### Continuable Session composition

Runtime 在任何 DSH Session 副作用前持久化 `MeetingAgentTemplateSnapshotV1`，然后使用 Host-owned installer 将 snapshot 映射为 DSH continuable child composition：

```ts
interface MeetingAgentTemplateInstaller {
  prepare(input: {
    meetingId: string;
    participantId?: string;
    role: "manager" | "participant";
    childSessionId: string;
    template: MeetingAgentTemplateSnapshotV1;
    signal: AbortSignal;
  }): Promise<PreparedMeetingAgentCompositionV1>;
}

interface PreparedMeetingAgentCompositionV1 {
  agentOptions?: {
    provider?: string;
    model?: string;
    maxTokens?: number;
  };
  persona: string;
  toolFilter: {
    allow?: readonly string[];
    deny?: readonly string[];
  };
  compositionReceipt: string;
}
```

`prepare()` 返回可传入 `startContinuable()` 的公开字段和一份 Host-owned composition receipt。Skills、MCP 和 permission installation 必须在 child publication 前通过 DSH scoped composition 完成；`compositionReceipt` 只证明已安装 snapshot 指定的组合，不携带凭据或配置正文。

当前锁定 DSH `0.1.1-rc.2` 的 `ContinuableStartSpec.request` 原生接受 `persona`、`toolFilter` 和 `agentOptions`；`AgentOptions` 当前公开字段为 `provider`、`model` 和 `maxTokens`。Skills、MCP 和 permission profile 没有对应的 `startContinuable()` 字段，必须由 Host 通过公开 scoped setup/composition 能力安装。缺少 installer 时，包含这些引用的 Template 必须返回 `TEMPLATE_COMPOSITION_UNSUPPORTED`，不得仅应用 persona/toolFilter 后降级运行。

## Data And State Contract

### Manifest

```ts
interface DshAgentTemplateManifestV1 {
  schemaVersion: 1;
  templateId: string;
  templateVersion: string;
  roleDefinitionId: string;
  roleInstructions: {
    path: "ROLE.md";
    sha256: string;
  };
  baseInstructionSetRefs: readonly VersionedTemplateResourceRefV1[];
  skillSetRefs: readonly VersionedTemplateResourceRefV1[];
  toolSetRefs: readonly VersionedTemplateResourceRefV1[];
  mcpSetRefs: readonly VersionedTemplateResourceRefV1[];
  permissionProfileRef: VersionedTemplateResourceRefV1;
  modelPolicy?: {
    provider?: string;
    model?: string;
    maxTokens?: number;
  };
  outputContractRef: VersionedTemplateResourceRefV1;
}

interface VersionedTemplateResourceRefV1 {
  id: string;
  version: string;
}
```

`templateId`、版本、角色、文件 hash 和资源引用必须非空且规范化。`ROLE.md` 不得包含凭据、绝对路径、私有 Session 内容或可覆盖 Captain/Runtime 权限的声明。`outputContractRef` 定义该角色提交研究证据、实现建议、审查意见或验证结果时应满足的结构化质量要求，但不替代 Convivium meeting protocol。

### Resolved snapshot

```ts
interface ResolvedDshAgentTemplateV1 {
  manifest: DshAgentTemplateManifestV1;
  manifestHash: string;
  roleInstructionsText: string;
  resolvedBaseInstructions: readonly ResolvedTemplateResourceSetV1[];
  resolvedSkillSet: ResolvedTemplateResourceSetV1;
  resolvedToolSet: ResolvedToolSetV1;
  resolvedMcpSet: ResolvedTemplateResourceSetV1;
  resolvedPermissionProfile: ResolvedPermissionProfileV1;
  resolvedOutputContract: ResolvedTemplateResourceSetV1;
}

interface ResolvedTemplateResourceSetV1 {
  id: string;
  version: string;
  contentHash: string;
}

interface ResolvedToolSetV1 extends ResolvedTemplateResourceSetV1 {
  allowedToolNames: readonly string[];
  deniedToolNames: readonly string[];
}

interface ResolvedPermissionProfileV1 extends ResolvedTemplateResourceSetV1 {
  approvalPolicy: "never";
  sandboxProfileId: string;
}

interface MeetingAgentTemplateSnapshotV1 {
  templateId: string;
  templateVersion: string;
  roleDefinitionId: string;
  manifestHash: string;
  roleInstructionsHash: string;
  baseInstructions: readonly ResolvedTemplateResourceSetV1[];
  skillSet: ResolvedTemplateResourceSetV1;
  toolSet: ResolvedToolSetV1;
  mcpSet: ResolvedTemplateResourceSetV1;
  permissionProfile: ResolvedPermissionProfileV1;
  outputContract: ResolvedTemplateResourceSetV1;
  modelPolicy?: DshAgentTemplateManifestV1["modelPolicy"];
}
```

Meeting SQLite 保存 snapshot 的身份、版本、hash 和已解析的非敏感权限边界，不保存 `ROLE.md` 正文、Skill 内容、MCP endpoint/credential 或完整 Host 配置。Runtime 在创建和 cold resume 时重新解析相同版本并比对 hash；资源缺失或 hash 漂移时 fail closed，不得自动升级到最新版。

### Instruction layering

有效 Agent instruction 层次为：

```text
DSH Harness identity and runtime policy
→ explicitly installed base instruction sets
→ resolved ROLE.md persona
→ installed Skills guidance
→ current Meeting provisioning/context envelope
→ current Manager/Speaker/Task/Mail request
```

仓库 `AGENTS.md` 只有在被转化为 manifest 明确引用的版本化 base instruction resource 时才进入上述运行时层次；仅在 workspace 中存在文件不构成 DSH composition。后层不能扩大前层权限。`ROLE.md` 不能宣称自己是 Captain、Manager 或其他 Participant；Meeting identity 和 capability 始终来自 Runtime 的当前 authorization。

### Skills

- `skillSetRefs` 是 versioned allowlist，不是自由文本 Prompt 集合。
- Skill 可以被多个 Template 复用；修改 Skill 必须产生新版本或新 content hash。
- Skill 只定义内部工作流，不授予 Tool、MCP、文件或网络权限。
- Template resolution 必须拒绝缺失、版本不匹配或与 role policy 冲突的 Skill set。

### Tools

- resolved Tool set 必须生成精确 DSH tool-name allow/deny restriction；allow/deny 冲突必须在 Session 创建前拒绝。
- Tool restriction 必须同时约束模型可见 Schema 和实际 execution；只从 Prompt 隐藏 Tool 不构成权限控制。
- Meeting tools 仍由 caller identity 和 capability 逐次授权；Tool set 中出现某个 Convivium Tool 不表示 Agent 可以绕过 Runtime authorization。
- Template 不携带 Tool 实现，也不能注册任意新 Tool。

### MCP

- `mcpSetRefs` 只引用 Host 已连接并授权的 MCP capability set；Template 不保存 endpoint secret、token 或 account identity。
- MCP set 必须在 child scope 中安装并受 permission profile 约束。
- MCP 不可用时，声明其为必需的 Template 不得静默启动；Host 可以在 resource set 中显式声明无 MCP 的空集合。

### Permission policy

- delegated meeting-owned child 的 `approvalPolicy` 固定为 `never`；无人值守 Session 不等待交互式授权。
- Sandbox、文件、网络和外部副作用权限不得超过 Captain parent 与 DSH Host 的共同上限。
- Template 只能进一步收窄权限；相同 Template 在权限更窄的 Host 中可以 fail closed，不能要求自动提权。
- permission profile 必须在 fresh create 和 cold resume 中重装，并保留相同版本/hash。

### Initial template composition expectations

| Role                      | Skills focus                                     | Tool/MCP expectation                                       |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `meeting_manager`         | planning、refocus、evidence-gap review           | Meeting status 与 Manager submission；无仓库写入和研究 MCP |
| `domain_architect`        | requirements、architecture、domain invariants    | 仓库与正式文档只读；无 Captain control                     |
| `runtime_engineer`        | DSH plugin、runtime、recovery                    | 受控仓库读写、构建和测试                                   |
| `protocol_ui_engineer`    | protocol/schema、projection、frontend            | 受控仓库读写与前端验证                                     |
| `verification_reviewer`   | testing、recovery、security/readiness review     | 仓库读取、测试和 smoke；核心代码写入默认关闭               |
| `github_research_analyst` | repository provenance、API/version analysis      | GitHub/source read capability；仓库写入关闭                |
| `arxiv_research_analyst`  | literature search、paper validation              | arXiv/PDF read capability；仓库写入关闭                    |
| `web_research_analyst`    | official docs、standards、freshness verification | Web read capability；仓库写入关闭                          |
| `meeting_scribe`          | referenced minutes、coverage 与 source indexing  | 正式会议 projection 只读；无 transcript/fact/decision 写权 |

表中是组合要求，不是具体 Tool name 或 MCP server 名。实际 manifest 必须引用 Host 中存在的 versioned sets，并在 resolution 后固化精确 tool names。

### Contract samples

`plugin/examples/agent-templates/` 中每个样本目录包含一个符合本接口的 `agent-template.json` 和独立 `ROLE.md`。`plugin/scripts/verify-agent-template-samples.mjs` 检查字段、ID 唯一性、resource ref、路径和角色说明 hash。样本 resource ID 说明预期的 Host registry 组合，不保证当前 profile 已提供对应资源；在 registry、installer 和真实 DSH profile 验证完成前不得把样本描述为可运行 Agent。

## Error And Permission Semantics

接口至少区分：

| Error                               | 含义                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `AGENT_TEMPLATE_NOT_FOUND`          | Template ID/version 不存在或当前 Captain/Team 无权使用 |
| `AGENT_TEMPLATE_INVALID`            | manifest、ROLE.md path/hash 或 role binding 非法       |
| `AGENT_TEMPLATE_RESOURCE_NOT_FOUND` | Skill/Tool/MCP/permission/output resource 无法解析     |
| `AGENT_TEMPLATE_RESOURCE_CONFLICT`  | Tool restriction、权限或资源版本相互冲突               |
| `AGENT_TEMPLATE_HASH_MISMATCH`      | 同版本资源内容与持久 snapshot 不一致                   |
| `AGENT_TEMPLATE_TOOL_UNAVAILABLE`   | 必需 Tool name 在当前 Host 不存在                      |
| `AGENT_TEMPLATE_MCP_UNAVAILABLE`    | 必需 MCP capability set 当前不可用                     |
| `TEMPLATE_COMPOSITION_UNSUPPORTED`  | 当前 DSH Host 无法为 child 安装完整 Template 组合      |
| `TEMPLATE_COMPOSITION_FAILED`       | scoped composition 在 child publication 前失败         |
| `TEMPLATE_RESUME_FAILED`            | cold resume 无法重建已持久 Template snapshot           |

所有错误必须发生在 Agent publication 或恢复后的 followup admission 之前；失败不得暴露 Prompt 正文、文件路径、Tool 输入、MCP 配置、凭据或 Sandbox 细节。Template resolution、installation 和 resume 必须受 cancellation 控制，并在失败时释放精确的未发布 child scope。

## Compatibility

- 当前最低 DSH 版本仍为 `0.1.1-rc.2`。该版本的 `ContinuableStartSpec` 和 `AgentOptions` 是本接口映射的已取证基线。
- `reasoningEffort` 不是当前 `AgentOptions` 的公开字段，Template V1 不得声明或假设该配置可注入。
- `persona`、`toolFilter`、provider/model/maxTokens 可以映射到当前 continuable request；Skills、MCP 和 permission profile 必须通过 Host scoped composition installer，不能伪装成 prompt 文本。
- manifest、resource set 或 snapshot 删除字段、改变语义或放宽权限属于破坏性变化，必须提升 schema version。
- Template 内容更新必须提升 `templateVersion` 或改变被拒绝的 hash；禁止同版本静默漂移。
- 已运行 Meeting 不自动升级 Template。新 admission 可以使用 Catalog 当前显式版本，但同一 Participant 的 fresh create 与 cold resume 必须保持原 snapshot。
- 在实现 registry、installer、持久 snapshot 和 cold-resume verification 前，本接口属于未实现契约，不能仅因 `sourceMemberName` 或 `ROLE.md` 文件存在就声明 Agent Template 已加载。

## Related Documents

- `docs/00-governance/ARCHITECTURE.md`
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
- `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`
- `docs/30-designs/DOMAIN-MODEL-DESIGN.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
