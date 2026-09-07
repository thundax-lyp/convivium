# Meeting Agent Definition Interface

## Purpose

本文定义 Convivium 拥有的 Meeting Agent Definition 配置契约。Definition 描述会议角色并引用 DSH 原生能力；它不是 DSH Agent Preset、Skill registry、Tool registry、MCP 配置、permission profile 或 AgentSession runtime。

## Boundary And Ownership

Convivium MeetingAgentDefinition
-> Manager 可见安全摘要 / Captain 选择与批准
-> Convivium 读取 dshPresetId、requiredSkillNames、persona、toolFilter
-> 创建前核对共享父 Preset / required Skills，DSH 原生 Tool / policy 执行收窄
-> DSH 创建独立 continuable AgentSession
-> Convivium 保存 Meeting identity <-> DSH Session ownership

| 字段                 | Required | Owner / producer        | Consumer                                           | 固定语义                                                                                |
| -------------------- | -------- | ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `agentDefinitionId`  | 是       | Convivium configuration | Catalog/runtime                                    | 稳定定义 ID；不能充当 Session、Participant、Preset 或 Skill ID                          |
| `definitionVersion`  | 是       | Convivium configuration | Catalog/snapshot                                   | 定义内容变化时提升；本次样本固定 `1.0.0`                                                |
| `roleDefinitionId`   | 是       | Convivium               | Manager projection/runtime                         | 会议职责分类；`meeting_manager` 不进入 Participant catalog                              |
| `displayName`        | 是       | Convivium               | Manager/Captain projection                         | 非授权显示值                                                                            |
| `summary`            | 是       | Convivium               | Manager projection                                 | 一句话参会价值，不包含 secret、Prompt 或工具配置                                        |
| `persona`            | 是       | Convivium               | `startContinuable().request.persona` 的创建 caller | 会议角色说明；不授予 Tool、Skill、MCP 或 authority                                      |
| `dshPresetId`        | 是       | Convivium 引用          | 创建前 resolver                           | 只引用 DSH 原生 Agent Preset；Convivium 不复制或安装 Preset                             |
| `requiredSkillNames` | 是       | Convivium 声明          | DSH Skill registry 的创建前校验器                    | DSH 原生 Skill 名称；不是 set ref，也没有 Convivium version wrapper                     |
| `toolFilter`         | 否       | Convivium               | DSH `startContinuable()`                           | `@deepseek-ai/dsh-tools` 原生类型；只能收窄 Preset 已提供的 global tools，不能授予 Tool |
| `expertiseTags`      | 是       | Convivium               | Manager projection                                 | 推荐相关性元数据，不授予能力                                                            |
| `evidenceScopes`     | 是       | Convivium               | Manager planning                                   | 研究来源范围；不是 Tool/MCP 权限                                                        |

## Transport Or Invocation

首版 transport 为 Convivium `Config.agentDefinitions?: readonly MeetingAgentDefinitionV1[]`，由本地 Host/profile 配置提供，persona 使用内联字符串。省略等于空数组；不扫描文件、不自动加载 examples、不接受 URL 或任意文件路径。实现验证见 [FR-14 验证索引](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#shared-preset-role-composition)。

创建工具的 `CreateMeetingInputV1.managerAgentDefinitionId?: string` 和 `ParticipantSpecV1.agentDefinitionId?: string` 是 Captain 可提交的唯一选择字段；值必须非空。未选择者不注入配置，显式选择但缺失不可回退。Manager 只能选择 `meeting_manager`，Participant 不得选择该角色；其他八种现有 roleDefinitionId 均可用于初始 Participant，不产生特殊 Meeting 权限。protocolVersion 保持 1，创建结果不变。

创建前逐项解析所有已选择定义，调用准确 parent scope 的 `agentPresets.composedPreset(parent.ctx)` 和 `skills.get(name, {scope: parent, cwd: parent.session.header.cwd, signal})`；required Skill 必须存在、可被模型调用且 content 非空。所有定义通过后才允许第一个 child 的创建。`dshPresetId` 是对共享父 Preset 的相等断言，不是选择另一个 Preset 的指令。父 Preset 在异步 Skill 校验前后必须一致。执行中的配置变更不重新配置已有 child。

独立模块只返回创建参数与 provenance；通过 `startContinuable().request.persona/toolFilter` 应用配置，不监听 Session event、改写 header、调用 recompose 或另建生命周期管理器。

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

| directory                 | roleDefinitionId          | requiredSkillNames            | evidenceScopes   | toolFilter                                                                   |
| ------------------------- | ------------------------- | ----------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `meeting-manager`         | `meeting_manager`         | `["meeting-management"]`      | `[]`             | `{ "allow": ["convivium_meeting_status", "convivium_submit_manager_plan"] }` |
| `domain-architect`        | `domain_architect`        | `["domain-architecture"]`     | `["repository"]` | 省略                                                                         |
| `runtime-engineer`        | `runtime_engineer`        | `["dsh-runtime-engineering"]` | `["repository"]` | 省略                                                                         |
| `protocol-ui-engineer`    | `protocol_ui_engineer`    | `["protocol-ui-engineering"]` | `["repository"]` | 省略                                                                         |
| `verification-reviewer`   | `verification_reviewer`   | `["verification-review"]`     | `["repository"]` | 省略                                                                         |
| `github-research-analyst` | `github_research_analyst` | `["github-source-research"]`  | `["github"]`     | 省略                                                                         |
| `arxiv-research-analyst`  | `arxiv_research_analyst`  | `["arxiv-paper-analysis"]`    | `["arxiv"]`      | 省略                                                                         |
| `web-research-analyst`    | `web_research_analyst`    | `["web-source-research"]`     | `["web"]`        | 省略                                                                         |
| `meeting-scribe`          | `meeting_scribe`          | `["referenced-minutes"]`      | `[]`             | `{ "allow": ["convivium_meeting_status", "convivium_submit_turn"] }`         |

## Error And Permission Semantics

- Definition/Preset/Skill 缺失：fail closed，不创建或激活 Participant。
- `toolFilter` 只能收窄 DSH Preset 已有 Tools。
- `persona`、Skill 名称和 evidence scope 不授予 capability 或 Meeting authority。
- MCP、Sandbox、Approval、模型和凭据错误由 DSH preset/policy 边界处理，Convivium 不重新映射其内部错误。

## Runtime Provenance And Failure

```ts
interface AgentDefinitionBindingV1 {
  agentDefinitionId: string;
  definitionVersion: string;
  definitionHash: string; // lowercase SHA-256, 64 hex characters
}
```

`SessionOwnership.agentDefinition?: AgentDefinitionBindingV1` 是内部会议 provenance，按既有 `teamId + meetingId + sessionId` 所有权保存；provisioning 和 active 写入必须相同。既有记录没有该字段时更新不能新增；有值时更新不得删除或修改。创建时间与更新时间仍由 repository 的 now 产生，不增加独立时间戳、actor、领域 event、receipt 或 outbox 类型。归档后的 repository ownership 保留该值；公开 status、ArchivePackage 不新增此字段，也不包含 persona/toolFilter/Skill 正文。

内容指纹由 resolver 生成：对完整已校验定义按字段固定顺序 `agentDefinitionId, definitionVersion, roleDefinitionId, displayName, summary, persona, dshPresetId, requiredSkillNames, toolFilter, expertiseTags, evidenceScopes` 执行 JSON.stringify；省略不存在的 toolFilter，filter 子字段顺序 allow、deny；数组保留输入顺序；UTF-8 SHA-256 小写十六进制。返回对象及数组深拷贝并冻结。指纹只用于 provenance，不是授权或全局 registry 键。

Runtime 配置限制：最多 64 项；每项完整 JSON UTF-8 不超过 16 KiB，字符串必须非空，不接受未知字段、重复 ID、重复数组元素或 null。toolFilter 只接受可选 allow/deny 字符串数组，提供对象时至少有一个字段；不得含空名称；persona 不接受 `{{` 模板变量语法，首版作为固定角色文本。requiredSkillNames 与 expertiseTags 至少一项，evidenceScopes 可为空，其他枚举沿用上文。配置格式错误在 Host 启动时报固定配置错误；不输出 persona 正文。

选定定义缺失、角色不匹配、Preset/Skill 校验失败或服务缺失，抛出 `RoleCompositionError`，`code="UNSUPPORTED_CAPABILITY"`，公开返回同名已有协议错误、retryable=false、固定 message `Meeting role composition is unavailable.`。取消沿既有取消路径，不改写为成功。原有未选择 Definition 的请求不要求 agentPresets/skills service。

解析发生在 createMeetingRuntime 的受保护创建阶段、第一个 ownership/child 分配之前。允许留下既有创建 bootstrap；失败按既有 creation_failed 规则记录，不能发布 ready Meeting。ready 请求重放必须先使用已有结果，不访问当前 Definition 配置或 Skill registry；原 input/requestId/hash 继续决定重放及冲突，定义内容不加入创建请求 hash。失败创建的再次尝试不得用同一已写 ownership 偷换定义。

DSH continuable descriptor 是已注入 persona/toolFilter 的持久所有者。恢复不重新解析当前定义、不重放 hook；本次保证在 Host Preset/Skill 部署不变时恢复配置一致，不承诺把 Host Preset/Skill 内容做历史快照。变更 DSH 部署后的可恢复性属于宿主运维边界。

## Compatibility

schemaVersion 固定为 1；definitionVersion 固定使用非空版本字符串，本次样本为 1.0.0。字段删除、改名或语义变化需要新的文档 schemaVersion；Definition 内容变化提升 definitionVersion。既有无 Definition 的请求与 ownership 继续可读、可执行，不回填默认定义；本次不迁移历史数据，也不提供旧 Template manifest 读取。运行时配置与文档样本格式分离：内联 persona 不要求 AGENT.md 文件或 hash。样本格式与验证器保持原规则。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Agent Role Catalog Interface](./MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)
- [Meeting Orchestration Design](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
