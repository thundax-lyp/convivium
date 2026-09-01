# Meeting Agent Definition Interface

## Purpose

本文定义 Convivium 拥有的 Meeting Agent Definition 配置契约。Definition 描述会议角色并引用 DSH 原生能力；它不是 DSH Agent Preset、Skill registry、Tool registry、MCP 配置、permission profile 或 AgentSession runtime。

## Boundary And Ownership

Convivium MeetingAgentDefinition
  -> Manager 可见安全摘要 / Captain 选择与批准
  -> Convivium 读取 dshPresetId、requiredSkillNames、persona、toolFilter
  -> DSH 原生 Agent Preset / Skill / Tool / policy 负责能力组合
  -> DSH 创建独立 continuable AgentSession
  -> Convivium 保存 Meeting identity <-> DSH Session ownership

| 字段 | Required | Owner / producer | Consumer | 固定语义 |
| --- | --- | --- | --- | --- |
| `agentDefinitionId` | 是 | Convivium configuration | Catalog/runtime | 稳定定义 ID；不能充当 Session、Participant、Preset 或 Skill ID |
| `definitionVersion` | 是 | Convivium configuration | Catalog/snapshot | 定义内容变化时提升；本次样本固定 `1.0.0` |
| `roleDefinitionId` | 是 | Convivium | Manager projection/runtime | 会议职责分类；`meeting_manager` 不进入 Participant catalog |
| `displayName` | 是 | Convivium | Manager/Captain projection | 非授权显示值 |
| `summary` | 是 | Convivium | Manager projection | 一句话参会价值，不包含 secret、Prompt 或工具配置 |
| `persona` | 是 | Convivium | `startContinuable().request.persona` 的未来 caller | 会议角色说明；不授予 Tool、Skill、MCP 或 authority |
| `dshPresetId` | 是 | Convivium 引用 | DSH Host 的未来 resolver | 只引用 DSH 原生 Agent Preset；Convivium 不复制或安装 Preset |
| `requiredSkillNames` | 是 | Convivium 声明 | DSH Skill registry 的未来校验器 | DSH 原生 Skill 名称；不是 set ref，也没有 Convivium version wrapper |
| `toolFilter` | 否 | Convivium | DSH `startContinuable()` | `@deepseek-ai/dsh-tools` 原生类型；只能收窄 Preset 已提供的 global tools，不能授予 Tool |
| `expertiseTags` | 是 | Convivium | Manager projection | 推荐相关性元数据，不授予能力 |
| `evidenceScopes` | 是 | Convivium | Manager planning | 研究来源范围；不是 Tool/MCP 权限 |

## Transport Or Invocation

本次只有版本化文件样本，没有 Runtime transport。未来 Host-side resolver 从 Convivium configuration 读取 Definition，校验 DSH Preset 与 required Skills，并把 persona 和 optional toolFilter 传给 DSH 公开 child composition API。当前 DSH 0.1.1-rc.2 缺少 per-child preset selection，因此该调用链 blocked。

## Data And State Contract

```ts
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";

type MeetingAgentRoleDefinitionIdV1 =
  | "meeting_manager"
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst"
  | "web_research_analyst"
  | "meeting_scribe";

type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";

interface MeetingAgentDefinitionV1 {
  agentDefinitionId: string;
  definitionVersion: string;
  roleDefinitionId: MeetingAgentRoleDefinitionIdV1;
  displayName: string;
  summary: string;
  persona: string;
  dshPresetId: string;
  requiredSkillNames: readonly string[];
  toolFilter?: ToolRestriction;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
}
```

空值规则：`persona`、ID、version、display、summary 均为非空字符串；`requiredSkillNames` 与 `expertiseTags` 至少一项且不得重复；`evidenceScopes` 可为空但不得重复；`toolFilter` 省略表示不增加定义级收窄，不能解释为“允许全部”。

```ts
interface MeetingAgentDefinitionDocumentV1 extends Omit<
  MeetingAgentDefinitionV1,
  "persona"
> {
  schemaVersion: 1;
  persona: {
    path: "AGENT.md";
    sha256: string;
  };
}
```

每个样本目录固定包含 `agent-definition.json` 与 `AGENT.md`；root direct entry 集合为 `README.md` 加九个固定目录，样本目录 direct entry 集合为 `agent-definition.json` 与 `AGENT.md`。验证器读取 UTF-8 `AGENT.md`，验证 SHA-256 后把全文视为 `MeetingAgentDefinitionV1.persona`；不支持其他 path、URL、绝对路径、父目录、symlink、glob、include 或继承。

| directory | roleDefinitionId | requiredSkillNames | evidenceScopes | toolFilter |
| --- | --- | --- | --- | --- |
| `meeting-manager` | `meeting_manager` | `["meeting-management"]` | `[]` | `{ "allow": ["convivium_meeting_status", "convivium_submit_manager_plan"] }` |
| `domain-architect` | `domain_architect` | `["domain-architecture"]` | `["repository"]` | 省略 |
| `runtime-engineer` | `runtime_engineer` | `["dsh-runtime-engineering"]` | `["repository"]` | 省略 |
| `protocol-ui-engineer` | `protocol_ui_engineer` | `["protocol-ui-engineering"]` | `["repository"]` | 省略 |
| `verification-reviewer` | `verification_reviewer` | `["verification-review"]` | `["repository"]` | 省略 |
| `github-research-analyst` | `github_research_analyst` | `["github-source-research"]` | `["github"]` | 省略 |
| `arxiv-research-analyst` | `arxiv_research_analyst` | `["arxiv-paper-analysis"]` | `["arxiv"]` | 省略 |
| `web-research-analyst` | `web_research_analyst` | `["web-source-research"]` | `["web"]` | 省略 |
| `meeting-scribe` | `meeting_scribe` | `["referenced-minutes"]` | `[]` | `{ "allow": ["convivium_meeting_status", "convivium_submit_turn"] }` |

## Error And Permission Semantics

- Definition/Preset/Skill 缺失：fail closed，不创建或激活 Participant。
- `toolFilter` 只能收窄 DSH Preset 已有 Tools。
- `persona`、Skill 名称和 evidence scope 不授予 capability 或 Meeting authority。
- MCP、Sandbox、Approval、模型和凭据错误由 DSH preset/policy 边界处理，Convivium 不重新映射其内部错误。

## Compatibility

schemaVersion 固定为 1；definitionVersion 固定使用非空版本字符串，本次样本为 1.0.0。字段删除、改名或语义变化需要新的文档 schemaVersion；Definition 内容变化提升 definitionVersion。当前没有 runtime reader、持久化记录或 migration，因此不提供旧 Template manifest 的兼容读取。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Agent Role Catalog Interface](./MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)
- [Meeting Orchestration Design](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
