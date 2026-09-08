# Meeting Agent Definition Interface

## Purpose

本文定义初次发布的会议角色描述、DSH 原生能力引用及 Host 模型绑定契约。2026-09-08 已确认此目标；当前代码仍是旧输入结构，本文不表示实现或部署已完成，见 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#shared-preset-role-composition)。

## Boundary And Ownership

Convivium Definition → Captain 按 ID 选择 → 全角色预检 → 角色说明转换为 DSH persona；Host 模型覆盖 → DSH agentOptions；DSH 创建独立 continuable Session → Convivium 保存 provenance、DSH 保存有效运行配置。

| 内容 | Owner | 固定边界 |
| --- | --- | --- |
| 角色职责、安全摘要、专长、研究来源范围 | Convivium | 推荐与参会描述，不授予权限 |
| Preset/Skill 名称 | Definition 引用、DSH 管理 | 校验已挂载/可读取，不安装，不展开正文 |
| 通用工作方法、工具组合、模型默认值 | DSH Host/profile | 通过原生 Preset/Skills/模型配置提供 |
| 必要角色模型差异 | Host agentModelOverrides | 仅 provider/model/reasoningEffort；不成为完整 Agent 配置 |
| ToolRestriction | Convivium 提供上限、DSH 执行 | 收窄 global/祖先 scope 的继承工具；child 自己注册的工具不被屏蔽 |
| 实际发言资格、批准与当次 capability | Convivium Runtime | 根据真实 Session、身份和当前状态判定；不存进 Definition |
| 已应用 persona/filter/模型 | DSH descriptor | 持久恢复依据；不通过当前配置重新生成 |

包内 DSH 部署资源可随插件发布，但由 DSH Loader/Skill provider 应用；它们不构成 Convivium capability registry、installer 或持久配置副本。Skill 可读取与已被模型加载是两个不同事实。

## Transport Or Invocation

本地 Host `Config.agentDefinitions?: readonly MeetingAgentDefinitionV1[]` 与 `Config.agentModelOverrides?: MeetingAgentModelOverrides` 是唯一配置输入。Definition 数组省略为无定义，map 省略或空对象为无覆盖；不扫描用户目录、不接受 Definition URL/路径。部署 patch 可在受信任 Loader 边界读取包内固定 JSON，交给 Config 的仍是内联数组。

Captain 仅通过 `CreateMeetingInputV1.managerAgentDefinitionId` 和 `ParticipantSpecV1.agentDefinitionId` 选择定义。Manager 只能选择 meeting_manager，Participant 不得选择 meeting_manager；没有显式选择时保持无定义路径。Manager recommendation 不等于选择批准或授权；本接口不新增动态 admission。

创建前检查所有定义和 Host map，再解析选定角色。对准确 Captain parent scope 调用 `agentPresets.composedPreset(parent.ctx)`，它必须等于每项 dshPresetId；异步 Skill 校验前后结果必须一致。`skills.get(name, {scope: parent, cwd: parent.session.header.cwd, signal})` 必须得到 modelInvocable 且正文非空的 Skill。第一个 child 分配前全部通过，不允许部分创建。

## Data And State Contract

```ts
import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";

type MeetingAgentRoleDefinitionIdV1 =
    | "meeting_manager" | "domain_architect" | "runtime_engineer"
    | "protocol_ui_engineer" | "verification_reviewer"
    | "github_research_analyst" | "arxiv_research_analyst"
    | "web_research_analyst" | "meeting_scribe";
type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";

interface MeetingAgentDefinitionV1 {
    agentDefinitionId: string;
    definitionVersion: string;
    roleDefinitionId: MeetingAgentRoleDefinitionIdV1;
    displayName: string;
    summary: string;
    roleDescription: string;
    expertiseTags: readonly string[];
    evidenceScopes: readonly AgentEvidenceScopeV1[];
    dshPresetId: string;
    requiredSkillNames: readonly string[];
    toolFilter?: ToolRestriction;
}

type MeetingAgentModelOverrides = Readonly<Record<string,
    Readonly<Pick<AgentOptions, "provider" | "model" | "reasoningEffort">>>>;

interface MeetingAgentDefinitionsDocumentV1 {
    schemaVersion: 1;
    definitions: readonly MeetingAgentDefinitionV1[];
}
```

### Definition fields

所有字段除 toolFilter 外 required，不接受 null 或未知字段。ID、version、displayName、summary、roleDescription、dshPresetId 是非空字符串；roleDescription 拒绝 `{{` 模板语法。requiredSkillNames 与 expertiseTags 至少一项、元素非空且无重复；evidenceScopes 可空但不得重复。数组最多 64 项，ID 唯一，每项完整 JSON UTF-8 不超过 16 KiB；返回深拷贝和冻结结果。

summary 是 Manager 可见的一句话参会价值，不包含私有正文、凭据或配置。roleDescription 只描述会议职责、预期贡献、会议输出和行为边界，不承载通用检索/编码/验证方法。expertiseTags 是推荐元数据；evidenceScopes 是研究来源范围，不是访问权限、真实引用或参会 provenance。

dshPresetId 是共享父 Preset 的相等断言，不是选择另一个 Preset 的指令。requiredSkillNames 是 DSH 原生 Skill 名称，不是版本 wrapper、正文注入或独占 Skill 白名单。

toolFilter 只接受 optional allow/deny 字符串数组，至少一个键；元素非空且不重复，数组可空。省略表示不增加 Definition 级限制；allow: [] 表示隐藏全部继承工具。global 与祖先 scope（含 Preset）的工具均参与过滤，当前 child 自己注册的工具保留。它不授予工具，也不替代文件、网络或操作系统隔离；最终资源权限由 DSH policy 决定。

### Host model overrides

map 的 key 必须存在于同一配置的 agentDefinitions 中，最多 64 项；即使角色没有被本次会议选择，未知 key 也拒绝。value 只接受 provider、model、reasoningEffort 三个 optional 非空字符串，至少一项；拒绝 null、空 value、未知字段和 maxTokens。map 省略或 {} 为无覆盖。校验后使用无原型对象承载深拷贝、冻结结果，不因 ID 与对象原型名称相同而改变语义。

未覆盖值由 DSH 继承父 Agent/原生创建默认值，不在 Convivium 复制父 options。reasoningEffort 是 adapter-owned ID，不固定枚举；模型支持性、路由、凭据由 DSH 校验。只绑定 DSH descriptor 可持久保持的三字段，不接受初次生效但恢复丢失的 maxTokens。

### Creation conversion

resolver 输出仍为 DSH 接口使用的 persona/toolFilter/agentOptions，不把 DSH 的 persona 字段改名。persona 的固定构造为：

```ts
roleDescription + "\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载："
    + requiredSkillNames.join("、")
    + "。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
```

模型通过原生 `skill` 工具加载正文；Convivium 不在 resolver 注入 Skill body、不自动调用工具、不监听加载顺序形成会议状态。发布验收必须观察原生 Session 的成功 tool/result，不能用 get 成功代替模型加载证据。

agentOptions 只取 map[agentDefinitionId]，无 entry 就省略。startContinuable.request 使用上述 persona、原生 toolFilter 和 agentOptions。改变 Host 模型覆盖不改变 Definition 指纹；DSH descriptor 记录新 Session 实际有效模型。

### First-release assets

唯一发布数据为 `plugin/meeting-roles/definitions.json`；schemaVersion=1，九项 definitionVersion 均为 1.0.0，dshPresetId 均为 convivium。ID 为 `convivium.` 加下表 roleDefinitionId。显示摘要、专长、研究来源保持各角色含义。没有逐角色 AGENT.md path/hash manifest 或第二份 JSON 配置。

| roleDefinitionId | requiredSkillNames | evidenceScopes |
| --- | --- | --- |
| meeting_manager | meeting-management | [] |
| domain_architect | domain-architecture | [repository] |
| runtime_engineer | dsh-runtime-engineering | [repository] |
| protocol_ui_engineer | protocol-ui-engineering | [repository] |
| verification_reviewer | verification-review | [repository] |
| github_research_analyst | github-source-research | [github] |
| arxiv_research_analyst | arxiv-paper-analysis | [arxiv] |
| web_research_analyst | web-source-research | [web] |
| meeting_scribe | referenced-minutes | [] |

Manager toolFilter.allow 为 [skill, convivium_meeting_status, convivium_submit_manager_plan]；Scribe 为 [skill, convivium_meeting_status, convivium_submit_turn]；其他角色省略。skill 必须显式保留，否则共享 Preset 继承的正文加载工具会被过滤。Manager/Scribe 不保留继承的 shell/fs/web 工具；其他角色仍受 Host policy 限制。

## Error And Permission Semantics

配置格式错误在 Host 加载时报固定错误，不输出正文、模型参数或凭据。Definition 格式错误为 `Invalid meeting agent definitions.`；Host map 格式错误为 `Invalid meeting agent model overrides.`。

创建时未知定义、角色不匹配、Preset/Skill 不可用或 direct-call 的配置非法统一为 `RoleCompositionError`，code=UNSUPPORTED_CAPABILITY、retryable=false、message=`Meeting role composition is unavailable.`。取消沿原取消路径，不改写为成功。DSH 路由、凭据、创建失败保留原错误与清理边界，不建立另一套模型错误映射。

校验失败不分配 child；允许已有 bootstrap 按 creation_failed 记录。中途创建失败沿原 revoke/interrupt/drain 清理，不能发布 ready Meeting。Skill 加载或外部检索失败不能用空实现或 persona-only 结果宣称能力可用；运行中的失败不新增会议授权事件。

## Runtime Provenance And Recovery

```ts
interface AgentDefinitionBindingV1 {
    agentDefinitionId: string;
    definitionVersion: string;
    definitionHash: string;
}
```

provisioning/active 的 SessionOwnership.agentDefinition 必须一致，不可删除、修改或为无值旧记录回填。它按既有 teamId + meetingId + sessionId ownership 保存，更新时间沿原 repository；不新增 actor、事件、receipt 或 outbox。

指纹对完整校验的 Definition 按固定顺序 JSON.stringify：agentDefinitionId、definitionVersion、roleDefinitionId、displayName、summary、roleDescription、dshPresetId、requiredSkillNames、toolFilter、expertiseTags、evidenceScopes；toolFilter 省略不存在的值，子键 allow 后 deny；数组保留顺序。对 UTF-8 取 SHA-256 小写十六进制。模型覆盖、Skill 正文、部署目录不加入指纹；指纹是 provenance，不是授权或 DSH capability 历史快照。

ready 请求重放使用已有结果，不读取当前 Definition/map/Skill registry；requestId/hash 规则不变。creation_failed 重放也不重新 provisioning，补齐部署后重试必须新 requestId。公开 status、archive 和错误不新增私有角色或模型字段。

冷恢复由 DSH descriptor 恢复 persona/toolFilter/provider/model/reasoningEffort，不重新运行 resolver。descriptor 丢失仍拒绝角色补建，沿 RECOVERY_ROLE_DESCRIPTOR_MISSING 保持 pause；不得套用新配置。独立 Session 不共享身份状态。Host Preset/Skill 部署内容改变后的历史内容快照不在此保证中。

## Compatibility

本契约是未发布产品的首个 V1 格式，definitionVersion=1.0.0、文档 schemaVersion=1、会议 protocolVersion=1。旧未发布 Definition.persona、Definition.agentOptions 和逐角色 manifest 不是兼容输入；不提供 alias、双读或迁移器。已有会议恢复不重解释配置的安全规则仍保留。

后续已发布字段删除、改名或语义变化必须升级对应文档 schemaVersion；定义内容变化提升 definitionVersion。Host 模型覆盖的变化不改变角色版本，生效与恢复由 DSH descriptor 管理。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Role Catalog Interface](./MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)
- [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)
- [Meeting Roles Operations](../50-operations/HOW-TO-MEETING-ROLES.md)
- [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
