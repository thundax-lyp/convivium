# Meeting Agent Definition 首发角色模型与部署 RUNBOOK

## Status And Executor Contract

- 日期：2026-09-08；分支：`codex/meeting-agent-role-description`；工作目录：仓库根目录。
- 模式：Author；用户最新要求为“先改文档，不落代码”。本轮同步正式文档与 RUNBOOK，不执行产品实现、安装或部署；作者已完成基线核验；T1–T6 是后续获得实现授权后使用的步骤。
- 目标：初次发布直接交付最终角色模型、原生 DSH Skills、一个共享 Preset，以及九个角色在同一会议中的完整部署验收。不能以旧 schema、旧样本或原验证器的方便程度限制设计。
- 用户确认：2026-09-08 本任务中明确要求“直达目标”“初次发布，不考虑迁移”“九个样本应该部署完善”。此前仅精简样本文字的范围已被替代。
- 部署边界：交付可分发资源，并在独立临时 DSH `web` profile 安装、运行、恢复和清理；不改日常 profile。用户若另行指定日常 profile，单独记录目标后执行，不将其作为本 RUNBOOK 的隐含写权限。
- 基线已经确认，后续按 T1 → T2 → T3 → T4 → T5 → T6 执行。PASS 必须同时满足命令退出状态和业务断言。STOP 后保留当前差异，报告最后 PASS 步骤、文件/symbol、复现命令、实际输出和继续所需决定。
- 不允许兼容旧 persona 输入、旧文件 manifest、旧 Definition 中的 agentOptions；不建立迁移器、双读、fallback、Preset 模拟器、Skill installer、通用 Agent 配置 UI 或热更新机制。未经另行授权，不 commit、push、创建 PR 或 merge。
- 不回滚用户已有文件。只能修改步骤列出的文件；清理只针对本次创建的临时目录和 PID。缺失指定路径/symbol、正式依据冲突、测试失败需要扩大范围或放宽断言时 STOP。

## Goal, Scope And Current Breakpoints

完整交付链路：发布 tarball → DSH 原生安装 Convivium → 使用包内部署 patch → DSH 加载共享 `convivium` Preset 和九个 Skills → Captain 选择九个 Definition 创建一位 Manager 和八位 Participant → 每个身份独立 Session，加载自己的 Skill 并按会议授权工作 → DSH descriptor 恢复有效配置 → Convivium 只保存会议事实与 Definition provenance。

| 当前断点 | 证据 | 本次收口 |
| --- | --- | --- |
| Definition 的 persona 名称和模型覆盖混合了角色与 Host 执行配置 | `plugin/src/role-composition/model.ts`，`MeetingAgentDefinitionV1` | roleDescription 取代 persona；模型覆盖移到独立 Host 配置输入 |
| 九样本使用九个不同 Preset ID，正文不是真正的 DSH Skill | `plugin/examples/meeting-agent-definitions/`；固定 matrix/hash 验证器 | 九角色统一引用 convivium；随包交付可被 DSH 发现、加载的原生 Skill |
| 样本不发布，core patch 不部署角色资源 | `plugin/package.json` 的 files/exports，`plugin/cordis.patch.yml` | 新增同 package 的 meeting-roles 静态资源与显式部署 patch |
| Skill get 只预检，不等于模型加载；旧参考文档仍写 ToolRestriction 仅覆盖 global | `validateSharedRoleCapabilities`；[Skill 契约](../../.agents/skills/dsh-plugin-development/references/skill-providers.md)；[Tools 契约](../../.agents/skills/dsh-plugin-development/references/tools.md) | 保留预检，persona 中给出原生 skill 加载指令；真实 Session tool/result 证明加载；以已安装 0.1.2-rc.1 ToolRuntime.view 实现为准，验证祖先工具受限与 child-own 注册保留 |
| 原角色 smoke 是两个夹具角色，不能证明九个交付角色可用 | `plugin/scripts/smoke-profile/probe/scenarios/role-composition.js` | 保留其隔离/冷恢复职责，新增使用发布资源的 meeting-roles 场景 |
| 之前本机安装版本过旧 | 本轮已读取 `plugin/node_modules/@deepseek-ai/dsh-subagent/package.json`，实际为 0.1.2-rc.1 | 已核验 18 个 DSH 包全部一致，现有 focused baseline 通过，不需要重装或升级 |

Scope 与追踪编号：S1 最终数据模型与正式契约（T1/T2）；S2 原生资源与可组合部署（T3）；S3 自动化、真实 Host/模型/能力与冷恢复验收（T4/T5）；S4 正式证据和临时文件收口（T5/T6）。每个步骤仅实现这些范围。

Non-goals：动态 admission/approve、FR-13 Host catalog producer、Skill 独占隔离、per-child Preset、模型 registry、credentials 编辑、跨 Host/远程部署、多用户权限、模型质量基准、历史数据库迁移。本次不新增会议授权字段；发言资格仍是 Runtime 的动态事实，不能静态写入角色文件。

## Formal Sources And Responsibilities

- [Architecture](../00-governance/ARCHITECTURE.md)：Confirmed Baseline、DSH Agent Sessions、Import Paths、Public Module Entrypoints；T1 将首发资源归属写入此处，仍只有 plugin 一个交付包。
- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-14、BR-11、验收 35–40；T1 先落实用户已确认的新范围。
- [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)：字段、配置、指纹、错误与恢复；T1 整体替换旧样本文件格式与 persona 输入口径。
- [Role Composition Design](ROLE-COMPOSITION-DESIGN.md)：解析与 adapter 的依赖方向；[Orchestration Design](MEETING-ORCHESTRATION-DESIGN.md)：4.4 和 Manager persona MUST；[Implementation Design](CONVIVIUM-IMPLEMENTATION-DESIGN.md)：样本/交付资源定位。
- [Preset 契约](../../.agents/skills/dsh-plugin-development/references/presets-context.md)、[Subagent 契约](../../.agents/skills/dsh-plugin-development/references/agent-subagent-workflow.md)、[组合契约](../../.agents/skills/dsh-plugin-development/references/composition-config-credentials.md)：DSH 0.1.2-rc.1 固定基线；不推断独立 child Preset。
- [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)、[Smoke Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md)、[Smoke Operations](../50-operations/HOW-TO-DSH-SMOKE.md)：当前验证入口、证据与安全清理。

已核对的 DSH ToolRuntime.view/restrict 实现（安装包 0.1.2-rc.1，与同版本源码一致）将 global 与 ancestor contributions 纳入 restrictableNames，own layer 保留。Tools reference 和部分 JSDoc 的“仅 global”文字滞后；本任务采用该公开实现语义，T4 必须实测共享 Preset 工具受限，不能照旧文字删除 skill allow。

Convivium 源码消费角色和原生引用；Host 配置提供模型覆盖；包内 Preset/Skills 属于发行附带的 DSH 部署资源，由 DSH Loader/原生 provider 安装和执行，Convivium Runtime 不注册 Skill、不展开 Skill 正文、不安装 capability。发布这些资源不等于角色通过 Prompt 获得权限。

## Final Data Model

以下是唯一目标结构，继续使用 V1 名称，作为初次发布契约；不同时支持旧结构。T1 显式将原 Compatibility 的“所有字段改名均升级样本文档版本”限定为已发布格式的后续变更；本次未发布旧草案不形成兼容目标。

```ts
interface MeetingAgentDefinitionV1 {
    agentDefinitionId: string;
    definitionVersion: string;
    roleDefinitionId: "meeting_manager" | "domain_architect" | "runtime_engineer"
        | "protocol_ui_engineer" | "verification_reviewer" | "github_research_analyst"
        | "arxiv_research_analyst" | "web_research_analyst" | "meeting_scribe";
    displayName: string;
    summary: string;
    roleDescription: string;
    expertiseTags: readonly string[];
    evidenceScopes: readonly ("repository" | "github" | "arxiv" | "web")[];
    dshPresetId: string;
    requiredSkillNames: readonly string[];
    toolFilter?: ToolRestriction;
}

type MeetingAgentModelOverrides = Readonly<Record<string,
    Readonly<Pick<AgentOptions, "provider" | "model" | "reasoningEffort">>>>;

// Config 新增字段：仅本地 Host/profile 能提供；Captain/Manager/HTTP 不可提交。
// agentDefinitions 与其他既有 Config 字段继续存在。
// agentModelOverrides?: MeetingAgentModelOverrides;
```

字段规则：

- Definition 除 toolFilter 外全部 required；全部禁止 null/未知字段。ID/version/display/summary/roleDescription/dshPresetId 非空；roleDescription 拒绝 `{{`。requiredSkillNames、expertiseTags 非空且去重校验；evidenceScopes 可空且不得重复。最多 64 个定义，每项 UTF-8 JSON 不超过 16 KiB；数组输入中任一非法则整体拒绝。
- toolFilter 是 DSH 原生 `{allow?: string[], deny?: string[]}`，至少一个键；名称非空、不重复，数组可空；限制从 global/祖先 scope（包括共享 Preset）继承的工具；当前 child 自己注册的工具保留。它不是文件、网络或操作系统的权限边界。
- agentModelOverrides 的 key 必须是同一次 Config.agentDefinitions 中的 agentDefinitionId，最多 64 项。value 只接受 provider/model/reasoningEffort，可各自省略，但至少一项、非空字符串；拒绝 null、maxTokens、空 value、未知 ID 和未知字段。整个 map 省略或 `{}` 为无覆盖。校验后深拷贝、冻结，用无原型 map 保存，避免 ID 与对象原型冲突。
- map 的 canonical owner 是 Host 配置；这里只提供把现有 DSH 原生选项绑定到角色的窄输入，不提供模型目录、默认值副本、凭据或运行中编辑。DSH 负责未覆盖值继承、支持性校验和 descriptor 持久化。
- 角色定义内容和模型选择独立：改变 Host model override 不改变 Definition 指纹；DSH descriptor 记录有效模型事实。模型覆盖不进入 status、archive、Definition 安全 projection 或错误正文。
- agentDefinitionId/roleDefinitionId 保留九个现有值；发行定义全部 `definitionVersion: "1.0.0"`，全部 `dshPresetId: "convivium"`。这是首发资源，不做 1.0.0→1.0.1 迁移。
- 新发行文件 `plugin/meeting-roles/definitions.json`：严格 `{schemaVersion: 1, definitions: MeetingAgentDefinitionV1[]}`，恰好九项，按角色表顺序保存。roleDescription 内联；不再有 AGENT.md path/hash、逐角色 manifest 或第二份 runtime JSON 副本。

`AgentDefinitionBindingV1` 仍为 required `{agentDefinitionId: string, definitionVersion: string, definitionHash: string}`。definitionHash 为 UTF-8 JSON SHA-256，固定顺序：agentDefinitionId、definitionVersion、roleDefinitionId、displayName、summary、roleDescription、dshPresetId、requiredSkillNames、toolFilter（省略不存在；子键 allow 后 deny）、expertiseTags、evidenceScopes；数组保留输入顺序。它不包含 Host override、Skill 正文或 deployment 文件 hash。

### Exact Transformation And Call Chain

1. `plugin/src/config.ts` 的 Config transform：`parseAgentDefinitions` → 新函数 `parseAgentModelOverrides` → 冻结 Host 配置；schema 错误仍为固定配置错误，不输出私有内容。
2. `plugin/src/index.ts` 的 meetingConsumerPlugin.apply 将 agentDefinitions 与 agentModelOverrides 传给 createCreateStatusRuntime；经 `CreateStatusRuntimeOptions`、`createMeetingApplication`、`MeetingCreationRuntimeDependencies` 到 resolveMeetingRoles。四处使用同名 optional 属性，不增加 registry/service。
3. `ResolveMeetingRolesInput` 新增 `agentModelOverrides?: MeetingAgentModelOverrides`。resolver 再次校验 direct-call 输入，选择角色，预检所有 Preset/Skills，然后返回原 `ResolvedRoleComposition`：persona、toolFilter?、agentOptions?、agentDefinition。
4. persona 是如下确定性派生字符串：`roleDescription + "\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：" + requiredSkillNames.join("、") + "。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"`。这不是 Skill 正文注入；不新增自动执行 hook 或持久 event。
5. agentOptions 只取 `agentModelOverrides[agentDefinitionId]`，无 entry 就省略。`startManagerSession` / `startParticipantSession` 接口仍用 DSH 原生 persona/toolFilter/agentOptions；不将其改名为 roleDescription。DSH descriptor persona 也不改名。
6. runtime 保存原 SessionOwnership.agentDefinition；DSH 保存派生 persona/filter/实际模型。配置更新只影响新身份；ready/failed receipt 重放不重新解析，冷恢复由 descriptor 恢复；缺失 descriptor 仍为 RECOVERY_ROLE_DESCRIPTOR_MISSING，不从新定义补建。
7. all-selected preflight 在第一个 child 分配前；RoleCompositionError → UNSUPPORTED_CAPABILITY、retryable=false、原固定 message。模型 override 非法 direct-call 同样包装为 RoleCompositionError。DSH 创建失败沿 creation_failed/revoke/interrupt/drain，不能发布 ready Meeting。

Not Applicable：不新增 Meeting ID、时间、actor、request hash、version、event/payload、repository transaction、receipt/outbox 或公开 DTO 字段；它们保留原 owner、生成时机和顺序。不提供旧 schema/历史数据迁移。本次新的持久结果只有既有 descriptor/provenance 通道中的新角色内容。

## File And Symbol Map

### Production

| 文件 | 唯一修改点 |
| --- | --- |
| `plugin/src/role-composition/model.ts` | MeetingAgentDefinitionV1、definition schema、parseAgentDefinitions：roleDescription；移除 definition.agentOptions 及其冻结逻辑 |
| `plugin/src/role-composition/model-options.ts`（新） | 导出 MeetingAgentModelOverrides；`parseAgentModelOverrides(value: unknown, definitions: readonly MeetingAgentDefinitionV1[]): MeetingAgentModelOverrides`；仅纯校验/冻结，不读 DSH 服务 |
| `plugin/src/role-composition/resolve.ts` | ResolveMeetingRolesInput、resolveMeetingRoles、definitionHash：上述派生与 Host map 选择；ResolvedRoleComposition 原生输出签名不变 |
| `plugin/src/config.ts` | Config interface/schema/transform 接收并校验 agentModelOverrides |
| `plugin/src/index.ts` | meetingConsumerPlugin.apply 传递 map；不新增 package root export |
| `plugin/src/runtime/application-service/types.ts` | CreateStatusRuntimeOptions 的同名 optional map 类型 |
| `plugin/src/runtime/application-service/create-meeting.ts` | createMeetingApplication 中 dependencies 的同名传递 |
| `plugin/src/runtime/meeting-runtime.ts` | MeetingCreationRuntimeDependencies 与 createMeetingRuntime 的 resolver 输入 |

只读保持：`plugin/src/role-composition/dsh-capabilities.ts`、`plugin/src/dsh/session-adapter.ts`、repository、domain、protocol、client。所有生产父级相对 import 使用 `@/`；role-composition 仍是 Architecture 已列的无 index 例外，不新增转发入口。

### Deployment Assets

唯一新增资产树：`plugin/meeting-roles/definitions.json`、`plugin/meeting-roles/README.md`、`plugin/meeting-roles/cordis.patch.yml`、`plugin/meeting-roles/presets/convivium/preset.yml`、`plugin/meeting-roles/presets/convivium/agent.cordis.yml`，以及下方九个 Skill 目录的 SKILL.md。不新增 package、lockfile 或顶层工程。

删除旧 `plugin/examples/meeting-agent-definitions/README.md` 和角色表九目录各自的 `AGENT.md` / `agent-definition.json`，共 19 个文件。没有其他文件时移除空目录；如出现表外文件 STOP，不递归删除未知文件。

保留现有命令名 `verify:agent-definitions` 作为角色资源验证入口；`plugin/scripts/verify-agent-definition-samples.mjs` 重写为新格式校验，导出改成 `verifyMeetingAgentDefinitions(root)`；root 是 meeting-roles 目录。返回 `Promise<readonly {code: string, location: string}[]>`；成功为空数组；失败 code 固定为 ROOT_NOT_READABLE、FILE_SET_MISMATCH、SYMLINK_FORBIDDEN、JSON_INVALID、DEFINITION_INVALID、SKILL_INVALID，location 为 root 内相对路径，按 location 后 code 字典序排序。旧函数名不做兼容转发。`plugin/tests/unit/scripts/agent-definition-samples.spec.ts` 同步导入和 fixture root，suite 名改为 Meeting Agent Definition deployment。

## Fixed Role And Skill Content

以下表格是九个 roleDescription 的唯一正文来源。definition 的 roleDescription 由 `mission + "\n\n" + output + "\n\n" + boundary` 构成；不包含通用方法。displayName、summary、expertiseTags、evidenceScopes 从当前同名 JSON 逐字段保留；roleDefinitionId 从现有 JSON 保留，agentDefinitionId 仍为 `convivium.` 加该 ID。

| directory | title | mission | output | boundary |
| --- | --- | --- | --- | --- |
| meeting-manager | Meeting Manager | 围绕当前议题、必需参与关系、阻塞异议、HandRaise、MeetingTask 结果和 evidence gap，提出发言、refocus、replan、wait 或结束建议；仅从 Runtime 提供的 authorized catalog projection 推荐补足职责或证据缺口的候选。 | 只通过 convivium_submit_manager_plan 提交结构化 planning result；推荐须说明议题、预期贡献和已有证据为何不足。 | 不是 Captain 或 Participant，不代表任何 Participant；不直接写 transcript、agenda、Decision、risk 或 MeetingTask，不使用 convivium_submit_turn；不接受决策、处置风险或批准自己的推荐，不绕过必需 speaker、会议限制、议题边界和终止限制。 |
| domain-architect | Domain Architect | 从领域状态、身份、权限和完成条件评估当前议题，指出正式需求、接口与设计之间的缺口。 | 提交会议结论、依据引用、触发条件、影响和最小修正建议。 | 不替 Captain 接受 Decision 或风险，不自行扩大产品范围；未获得明确任务和权限时不修改代码。 |
| runtime-engineer | Runtime Engineer | 评估当前议题中的 Meeting Runtime、持久化、outbox、恢复和 AgentSession 生命周期边界。 | 提交实现建议、失败语义、验证证据和未覆盖范围。 | 不绕过 DSH 生命周期和权限接口，不把 AgentSession 当作 MeetingState 真相源；不自行改变需求、风险权限或 Captain 决策。 |
| protocol-ui-engineer | Protocol And UI Engineer | 评估当前议题中的 Protocol Schema、Tools、HTTP、状态 projection 与 Client UI 是否表达一致的会议事实和权限。 | 提交字段或流程结论，注明 producer、consumer、可观察失败表现和验证证据。 | Client 只使用 Runtime 公开的类型化边界，不直接管理 AgentSession、持久化介质、任意文件或敏感配置；不以缓存或 DSH tool history 替代正式 Meeting projection，不扩大远程或多用户范围。 |
| verification-reviewer | Verification Reviewer | 独立评估当前议题的验收证据、权限边界和恢复风险，识别阻止交付的反例。 | 每项 finding 提交触发条件、可观察影响、证据和最小修正方向；验证声明注明实际执行范围。 | 未获得明确实现任务和权限时不修改核心实现；不替 Captain 接受剩余风险，不把未执行的验证描述为通过。 |
| github-research-analyst | GitHub Research Analyst | 针对当前 evidence gap 提供 GitHub repository、源码及版本演进证据。 | 提交带 repository/ref 定位的证据摘要、版本边界、与议题的关系和未解问题。 | 不重复已有且 freshness 足够的 GitHub 证据，交叉验证须说明原因；未经明确授权不创建 issue、PR、评论或执行 repository 写操作。 |
| arxiv-research-analyst | arXiv Research Analyst | 针对当前 evidence gap 提供 arXiv 论文的方法、实验结论、局限和版本证据。 | 提交论文标识与版本、证据摘要、适用限制和与议题的关系。 | 不以论文主张覆盖正式需求、接口、仓库事实或 Captain 决策；不重复已有且 freshness 足够的 arXiv 证据，独立复核须说明原因。 |
| web-research-analyst | Web Research Analyst | 针对当前 evidence gap 提供官方文档、标准、公告和时效信息的 Web 证据。 | 提交直接链接、访问日期、适用范围、证据摘要和冲突或不确定性。 | 不重复 GitHub Analyst 已负责的源码取证，跨来源验证须有当前议题依据；未经明确授权不登录、提交表单、发消息或执行外部写操作。 |
| meeting-scribe | Meeting Scribe | 从 Runtime 已持久化的正式 transcript、Fact、Proposal、Position、Decision、Issue 和任务结果整理会议纪要草稿。 | 提交带 message sequence 覆盖上界和 canonical ID 引用的 minutes draft，包含摘要、决议、事实、行动项、未解决事项和来源索引。 | Runtime 是正式事实的权威记录者，草稿不创建、修改或替代事实、Decision、完成判定或风险处置；不收录私聊、隐藏推理、Session ID、capability、凭据或未公开工具过程。 |

每个角色的 requiredSkillNames 对应下表唯一名称；Skill 目录为 `plugin/meeting-roles/presets/convivium/skills/<name>/SKILL.md`。Skill 不包含具体会议 ID、Runtime capability 或模型配置。description 固定使用下表职责句；body 固定为 `# <description>\n\n` 后接四条编号步骤。name 和 description 使用 YAML 单引号字符串；`disable-model-invocation: false`、`user-invocable: true`。最后固定追加“只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。”

| role directory | name | description | 四条编号步骤（用 `；` 分割成四行） |
| --- | --- | --- | --- |
| meeting-manager | meeting-management | 根据会议事实规划讨论与补足证据缺口 | 读取当前目标、正式状态、必需参与关系和阻塞问题；区分职责缺口、证据缺口与已有材料可以回答的问题；为每项计划说明预期输出、依据及停止条件，避免重复讨论；把候选推荐、发言计划和结束建议作为待授权的结构化建议提交 |
| domain-architect | domain-architecture | 核对领域模型与需求设计一致性 | 从正式需求和接口提取对象、身份、状态与完成条件；检查所有权、授权、幂等、恢复和终态不变量；区分确认的产品决定、实现选择与尚未证实的假设；用触发条件和反例说明缺口，提出满足当前目标的最小修正 |
| runtime-engineer | dsh-runtime-engineering | 分析运行时持久化与会话生命周期 | 以锁定版本的公开类型和实现核对 DSH 能力；划分领域、持久化、投递与 Session adapter 的责任；沿成功、失败、取消、并发、恢复和隔离路径检查行为；给出可执行验证入口、可观察结果和未覆盖边界 |
| protocol-ui-engineer | protocol-ui-engineering | 检查协议与用户界面的事实边界 | 列出字段的 producer、consumer、事实源和兼容约束；核对 Schema、错误码与调用者可见 projection；检查加载、过期版本、终态和权限不足的用户可观察结果；用 contract、component 和浏览器证据核对完整用户流程 |
| verification-reviewer | verification-review | 用反例与证据评估交付条件 | 从验收条件和权限边界形成验证矩阵；优先寻找身份隔离、原子性、幂等、终态和恢复的反例；区分单元、契约、集成、真实 Host 与人工验证的证明范围；每项问题给出触发条件、可观察影响、复现证据和最小修正方向 |
| github-research-analyst | github-source-research | 从 GitHub 官方源码与版本记录取证 | 围绕明确问题检索 repository、源码、commit、issue、PR 和 release；先核对目标依赖版本对应的实现与类型，再比较后续变化；记录 repository、ref、文件定位、日期和适用范围；区分已合并事实、未合并提案、讨论、第三方 fork 与推断 |
| arxiv-research-analyst | arxiv-paper-analysis | 分析论文方法实验与适用局限 | 围绕明确问题检索并筛选直接相关论文；核对标题、作者、arXiv ID、版本和发布日期；区分作者主张、实验观察、局限与自己的推断；比较冲突结果时说明数据集、指标、条件及不可外推之处 |
| web-research-analyst | web-source-research | 核对官方网页与时效性证据 | 围绕明确问题优先检索第一方和标准组织来源；核对发布日期、更新时间、版本、地域和生效范围；对不稳定事实交叉核对并区分来源事实与推断；记录直接链接、访问日期、冲突、二手转述及失效风险 |
| meeting-scribe | referenced-minutes | 从正式材料整理可追溯纪要 | 明确材料范围与覆盖上界；为事实、决议、异议、行动项与未解问题保留原始引用；区分直接记录、已接受决定、参与者观点与压缩表述；报告缺失引用和相互冲突，不补造材料或把草稿当作正式决定 |

Meeting Manager 的 toolFilter 固定 allow `["skill", "convivium_meeting_status", "convivium_submit_manager_plan"]`；Scribe 固定 allow `["skill", "convivium_meeting_status", "convivium_submit_turn"]`；其余七角色省略。skill 必须保留，否则继承自共享 Preset 的 Skill loader 会被自身限制屏蔽。Manager/Scribe 的继承 shell/fs/web 不在 allowlist 中；Host DSH 的 Sandbox/Approval 继续约束资源操作。

## Native Deployment Contract

首发 profile 为 DSH `web@0.1.2-rc.1`，使用 Host 已有 spawn continuable provider、DeepSeek 模型路由、DeepSeek search provider 和 http fetch provider。不新增搜索/模型 provider，不提交凭据；模型默认值沿用 DSH 配置。八位 Participant 要求本部署 patch `maxParticipants: 8`，不改变裸插件 Config 默认值。

`preset.yml` 固定 name 为 `Convivium Meeting`、description 为 `会议角色共享的工具与原生 Skills`、order 为 1。

`agent.cordis.yml` 固定以下行；这是本项目按公开契约编写的原生组合，不复制上游 Preset 源码：

| id / name | 固定 config |
| --- | --- |
| persona / @deepseek-ai/dsh-persona | text 为“根据任务中的会议身份、角色职责和已加载 Skill 工作。结论须有证据，工具使用服从 Host 权限。”；complete=false、includeRuntimeContext=true |
| tool-bash / @deepseek-ai/dsh-tool-bash | POSIX 启用，disabled 使用 `!!js process.platform === 'win32'` |
| tool-pwsh / @deepseek-ai/dsh-tool-pwsh | win32 启用，disabled 使用 `!!js process.platform !== 'win32'` |
| tool-fs / @deepseek-ai/dsh-tool-fs | 无自定义 config |
| tool-fs-search / @deepseek-ai/dsh-tool-fs-search | sampleOverCapGlobResults=false |
| skill-filesystem / @deepseek-ai/dsh-skill-filesystem | providerName=convivium-roles，includeDefaultRoots=false，watch=false；customSkillDirs 只含 `!!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"` |
| tool-skill / @deepseek-ai/dsh-tool-skill | 无自定义 config |
| tool-web / @deepseek-ai/dsh-tool-web | search=true、fetch=true、searchTimeoutMs=60000 |
| compaction / cordis:group | group=true，isolate.compaction=true、isolate.toolResultPruner=true；下挂 compaction-basic / @deepseek-ai/dsh-compaction-basic 和 tool-result-pruner / @deepseek-ai/dsh-compaction-tool-result-pruner；后者 thresholdChars=8192、headChars=4096、tailChars=1024 |

不加入 subagent/workflow/installer/MCP 管理工具；会议身份的继续投递由 Convivium 后端负责。Skills 按 scope 发现，不承诺屏蔽其他 Host 已挂载的 provider；这不是独占 Skill 安全边界。

新 `plugin/meeting-roles/cordis.patch.yml` 是显式选用的部署 patch，按以下顺序修改已安装的两个 row，不重复 insert core 插件或 provider：

```yaml
- id: agent-presets
  config:
    default: convivium
    includeShippedRoot: true
    includeUserRoot: true
    roots:
      - path: !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('presets/', baseUrl))"
        trust: system
- id: convivium
  config:
    provider: spawn
    maxParticipants: 8
    agentDefinitions: !!js "JSON.parse(process.getBuiltinModule('node:fs').readFileSync(new URL('definitions.json', baseUrl), 'utf8')).definitions"
```

只在独立 meeting profile 使用该 roots/default 覆盖；不改变用户现有 profile 的设置。DSH Settings 的 default 仍可能覆盖配置，因此验收和操作说明必须显式选择 `convivium` Captain Preset。文件读取发生在受信任 DSH Loader 配置求值边界；Convivium Config 仍只接收内联数组，不新增路径读取能力。

`plugin/package.json` 的 files 固定为 `["lib", "cordis.patch.yml", "meeting-roles"]`；exports 在现有项后增加 `"./meeting-roles/cordis.patch.yml": "./meeting-roles/cordis.patch.yml"`。原 core patch 保持不变，避免让无 Web 宿主隐式依赖 agent-presets row。

分发/安装方式固定：`pnpm pack` 产生 tarball；`dsh plugin --profile web add <artifact>` 安装插件；将同一 tarball 解包到本次专用资源目录，以其 `package/meeting-roles/cordis.patch.yml` 作为 DSH `--patch` 的第一个显式参数；smoke 控制 patch 作为第二个参数。两个位置来自同一包字节，不从源码 examples 取文件、不生成另一份 Preset。解包是部署资源定位，不是自建 capability 安装器。

## Invariants And Failure Oracles

1. 九项 Definition 在同一父 Preset 全部预检通过；第九项缺 Skill 时必须零 child，不能先创建八项。
2. 每个身份有独立 continuable Session；Model override 只影响对应 child，父 Agent 和其他 child 不变。
3. 实际 Skill tool 调用的结果正文包含相应四步方法；目录可见或可信 ctx.skills.get 成功都不能替代此证据。
4. Manager 不能提交 Participant 发言、Scribe 不能提交 Manager plan；真实工具执行被拒绝，正文声明不计权限证明。共享 Preset 的继承工具也必须验证：Manager/Scribe 的 skill 可用，web_search 被过滤；当前 child 自己注册的工具不受该 filter 屏蔽。
5. 新 Definition/override 只影响新会议。Host 重启后旧 descriptor 的 persona/filter/模型保持；不因取消迁移工作而删除恢复不变量。
6. 打包漏掉 definitions、Preset 或任一 Skill 必须 gate 失败；patch 不得依赖 checkout 路径、dev.env 正文或用户私有路径。
7. 缺凭据、search provider 或 Skill 时不得用空实现、fixture Skill、假搜索或 persona-only 结果宣告部署完成。
8. Native Skill 负责方法指导，Convivium Runtime 只解释显式提交的会议结果，不解析 Skill 的内部执行顺序来形成会议事实。

## Confirmed Baseline

作者已于 2026-09-08 实际完成此前 T0，不再把它留给执行者确认。

- 源码边界：`299d3996c5938e5e8398cf592faad195835b964b`；分支 `codex/meeting-agent-role-description`。
- 工作树：仅本轮九份已确认的 docs/ 修改或新增；无生产代码、测试、依赖或部署资源改动。
- 环境：Node v22.23.2、pnpm 10.7.0。

| 实际执行 | 结果 |
| --- | --- |
| `git status --short --branch` | 分支正确，差异仅 docs/ |
| Node 读取 package.json 中所有 `@deepseek-ai/dsh-*` devDependencies，逐项断言声明和安装 package.json 的 version | 18 个包全部为 0.1.2-rc.1，exit 0 |
| `pnpm --dir plugin verify:agent-definitions` | 9 个现有样本 PASS，exit 0 |
| `pnpm --dir plugin exec vitest run tests/unit/role-composition tests/unit/config.spec.ts tests/unit/scripts/agent-definition-samples.spec.ts` | 4 files / 35 tests 全部 PASS，exit 0；Vitest duration 263ms |

结论：**基线 PASS**。这里只证明当前旧实现具备可继续开发的环境与 focused baseline，不证明新角色模型或九角色部署已实现。没有安装、升级、代码修改或外部部署。长期证据同步到 Coverage 的 Shared Preset Role Composition。

后续直接从 T1 核对正式契约开始；不重复上述检查。若代码或依赖在此证据后发生变更，应先报告证据失效的具体边界，不能继续引用本轮结果为新基线通过。

## Mechanical Steps

TODO 对应关系：MAD-01 → T1；MAD-02/03 → T2；MAD-04/05 → T3；MAD-06/07/08 → T4；MAD-09/10 → T5；MAD-11 → T6。TODO 拆分用于追踪剩余语义单元，不改变本手册的阶段顺序、允许文件集合与 PASS/STOP。T2、T4 的全局 lint/typecheck 在该阶段接线完整后运行，阶段中间态不作为独立交付。

### T1：先建立首发正式契约

前置状态：Confirmed Baseline 已 PASS；已获得后续实现授权。
允许修改：Sources 中 Architecture、Requirements、Definition Interface、Role Composition Design、Orchestration Design 的 4.4、Implementation Design 的旧样本定位段。
禁止修改：代码、readiness 历史结果、其他产品范围。

执行：
1. 本轮 Author 已同步正式文档；执行时逐项核对，相同内容不重复改写。Requirements FR-14 固定为 Final Data Model 与完整部署链路：roleDescription、Host model overrides、九角色共享 Preset、真实 Skill 加载；保留 BR-11 和动态会议授权归属。增加验收点对应八条 Invariants。
2. Definition Interface 替换旧 persona/agentOptions 输入、逐角色 AGENT.md manifest 与 hash 契约，写入本 RUNBOOK 的精确字段、map 校验、派生 persona、指纹顺序和 V1 初发兼容规则。保留 DSH descriptor persona/agentOptions 名称。
3. Architecture 明确 plugin/meeting-roles 是同一 package 的 DSH 原生部署资源，Host Loader 拥有应用权；移除旧 examples“不发布”的定位。模型默认值仍归 DSH，窄 map 只是 Host 创建覆盖。不要将 runtime 变成资源安装器。
4. Role Composition Design 写入新文件 model-options.ts、无事件/无持久配置副本的调用链，以及 shared scoped tools 的限制。两个总体设计仅同步角色字段、资源位置和链接，不复制完整契约。

验证：
```bash
git diff --check
rg -n 'roleDescription|agentModelOverrides|meeting-roles' docs/00-governance/ARCHITECTURE.md docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md docs/30-designs/ROLE-COMPOSITION-DESIGN.md
```
并执行 V-DOC。
PASS：精确字段、首次发布语义、scope、权限和部署责任与本文一致，旧 Definition.persona/agentOptions 不再作为有效输入；DSH 原生输出仍保留。
STOP：正式文档中出现未消解冲突；不自行删掉恢复、安全或全角色预检要求。

### T2：实现角色模型与 Host 覆盖的单向创建链路

前置状态：T1 PASS。
允许修改：Production 表八个文件；下列现有测试/fixture；新 `plugin/tests/unit/role-composition/model-options.spec.ts`。

现有允许测试集合：`plugin/tests/fixtures/role-composition.ts`；`plugin/tests/unit/role-composition/resolve.spec.ts`、`dsh-capabilities.spec.ts`；`plugin/tests/unit/config.spec.ts`；`plugin/tests/unit/runtime/meeting-runtime.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`；`plugin/tests/unit/host-plugin-lifecycle.spec.ts`；`plugin/tests/integration/dsh/session-adapter.spec.ts` 的 resolved role adapter composition suite。仅其 Definition 输入与对新契约的断言可改，DSH-native persona 输入不改名。

禁止修改：Session adapter 签名、repository/domain/protocol/client、错误码、Model registry、DSH package。

执行：
1. 按 Final Data Model 实现 schema、model-options 纯校验与 resolver；整个 map 预检，未知角色 key 即失败，不只校验已选角色。
2. 按 Call Chain 传递 agentModelOverrides；保持定义与覆盖分别冻结、无 mutable alias。直接 resolver 调用也经过同样校验，不依赖 Config 已运行。
3. integration session-adapter 的 resolver 输入改为独立 map，native request.persona 预期改为确定性派生文本，原模型差异和深拷贝断言保留。fixture `roleCompositionDefinitions` 只保存新 Definition；同文件新增 `roleCompositionModelOverrides` 保存旧 fixture 的模型覆盖。其他 fixture 仅按相同结构拆分；不把 native session-adapter 的 composition.persona 改名。
4. resolve suite 增加可观察用例：角色描述正确进入派生 persona、两个不同覆盖准确透传、覆盖缺省不复制父配置、改变覆盖不改变 Definition 指纹、改变角色描述会改变指纹、未知 map key/非法 value/旧字段拒绝、错误不泄露正文。model-options suite 覆盖空 map、原型名 ID、冻结与调用方对象后续修改；未知 map key 即使角色未选也拒绝。
5. 原角色预检、身份原子性与创建失败测试保持业务断言。readiness 尚不更新。

验证：
```bash
pnpm --dir plugin exec prettier src/role-composition src/config.ts src/index.ts src/runtime/application-service/types.ts src/runtime/application-service/create-meeting.ts src/runtime/meeting-runtime.ts tests/fixtures/role-composition.ts tests/unit/role-composition tests/unit/config.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/meeting-runtime.spec.ts tests/unit/host-plugin-lifecycle.spec.ts tests/integration/dsh/session-adapter.spec.ts --write
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin exec vitest run tests/unit/role-composition tests/unit/config.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/meeting-runtime.spec.ts tests/unit/host-plugin-lifecycle.spec.ts tests/integration/dsh/session-adapter.spec.ts
```
PASS：指定行为和门禁 exit 0；Definition 已不携带模型，adapter 仍得到必要差异；无未经允许文件变化。
STOP：必须改 DSH API、引入自动 Skill hook/新配置 registry 或修改会议状态才能完成；保留差异报告，不类型断言绕过。

### T3：交付唯一原生角色资源与打包入口

前置状态：T2 PASS。
允许修改：Deployment Assets 指定新增/删除文件；`plugin/scripts/verify-agent-definition-samples.mjs`、`plugin/tests/unit/scripts/agent-definition-samples.spec.ts`、`plugin/package.json`、`plugin/scripts/verify-package.mjs`、`plugin/scripts/verify-plugin-contract.mjs`。
禁止修改：core cordis.patch.yml、DSH 源码、凭据、依赖版本、任何 runtime installer。

执行：
1. 按 Fixed Role And Skill Content 创建 definitions 与九个原生 Skills；按 Native Deployment Contract 创建 Preset、metadata、patch、README。README 明确安装/选择 Preset/模型默认值及覆盖/权限边界，链接正式操作文档。
2. 删除旧 19 文件；不保留两份样本真相源。validator 默认 root 改成 meeting-roles，固定检查九个定义 ID/角色/Skill/Preset 引用、精确字段集合与 1.0.0；检查必需文件集合、九 Skill name/description/invocation 标志及四步正文、拒绝 symlink/缺失/未知文件。去除旧 AGENT.md hash 常量与错误码，不添加新的内容指纹体系；runtime schema 验证由测试调用 parseAgentDefinitions 覆盖。
3. samples suite 保留临时目录 finally 清理与 symlink 拒绝；新增：漏一个 Skill、name 不匹配、不可模型调用、空正文、不同 Preset、旧 persona/agentOptions 字段、未知文件均失败；完整 resources 经 parseAgentDefinitions 通过。断言面向缺失/错误部署结果，不只镜像实现分支。
4. 按 Native Deployment Contract 修改 files/exports。verify-package 的闭合 allowlist/requiredArtifacts 增加五个固定资源和九个 SKILL.md；expectedExports 精确增加一个 patch export。verify-plugin-contract 校验此导出与 asset 存在，package root JS exports 保持原集合。
5. 将 gate 的默认路径与说明更新为新的九角色部署资源，但继续保留 package script `verify:agent-definitions` 与原有 verify 调用顺序。

验证：
```bash
pnpm --dir plugin exec prettier meeting-roles scripts/verify-agent-definition-samples.mjs scripts/verify-package.mjs scripts/verify-plugin-contract.mjs tests/unit/scripts/agent-definition-samples.spec.ts package.json --write
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin exec vitest run tests/unit/scripts/agent-definition-samples.spec.ts
pnpm --dir plugin build
pnpm --dir plugin verify:contract
pnpm --dir plugin verify:package
```
并执行 V-DOC。
PASS：九项共同引用 convivium，所有 Skill 可读取且真实原生格式，旧目录无文件，allowlist 闭合、无 checkout 绝对路径。Runtime 不新增文件读取。
STOP：本地 schema/资源门禁失败、所列 DSH row 不能解析、需要复制上游代码或扩张 Host 权限；不可删 gate/改假 Skill 绕过。

### T4：扩展真实部署与恢复验证入口

前置状态：T3 PASS。
允许修改：`plugin/scripts/smoke-profile/index.mjs`、`result.mjs`、`probe/index.js`、`probe/role-definitions.js`、`probe/scenarios/role-composition.js`、`probe/scenarios/recovery.js`；新 `plugin/scripts/smoke-profile/probe/scenarios/meeting-roles.js`；`plugin/tests/unit/scripts/role-composition-smoke.spec.ts`、`smoke-profile.spec.ts`；新 `plugin/tests/unit/scripts/meeting-roles-smoke.spec.ts`。
禁止修改：生产权限、恢复逻辑、既有场景的断言/超时来掩盖新失败；日常 profile。

执行：
1. roleSmokeDefinitions 继续返回两个 fixture Definition，但使用 roleDescription；同文件新 `roleSmokeModelOverrides(phase)` 返回独立 map，phase 只接受 "1"/"2"。wrapper 的 writeSmokePatch 同时配置该 map。phase 2 仍改变角色文本与模型；assertRoleSmoke 的 native descriptor/assembly 预期改为 resolver 的确定性派生文本，继续证明 phase 1 被恢复。result contract 用新的完整 persona 预期，不削弱隔离、禁用工具 body 零调用、父路由不变或两 Host 恢复断言。
2. 新 selector `meeting-roles` 加到 SMOKE_SCENARIOS、run 的允许集合和 runSelectedScenario，排除 CORE_SCENARIOS 并拒绝 Browser mode；现有 smoke-profile.spec.ts 的总数断言由 16 改为 17；`driveParticipant` 对该 selector 立即返回，不用旧三位 Participant driver 自动代提交。
3. wrapper 在本场景将同一 tarball 用 `tar -xzf` 解包到 `tempRoot/role-package`；只使用 `role-package/package/meeting-roles`。installArtifact/installProbe 仍用同一 native CLI；dumpConfig/bootHost 的参数顺序固定为部署 patch 后控制 patch。控制 patch 只设置临时 dataRoot、8 人容量、speakerTimeoutMs=300000、outboxPollMs=1000，不替换交付 definitions/Preset/Skills。本场景 waitForJson 的 result timeout 固定为 2400000ms（九个 180s 模型探针及六个外部工具调用的串行上界加清理余量），启动/安装 timeout 及其他 scenario 不变；不能失败后再放大。
4. probe 为新 selector 创建真实 Captain，sessionId 使用原 `convivium-smoke-captain`，meta.agentPreset 为 convivium，setup 调用原生 agentPresets.mount；不使用 registerSmokeAgent 代替真实 Captain。部署资产路径由 wrapper 通过 `CONVIVIUM_SMOKE_ROLE_ASSET_ROOT` 传递给 probe，仅此 test process 消费，不加生产配置。
5. 新模块唯一导出 `async function runMeetingRolesScenario(runtime)`。读取包内 definitions，验证 runtime Captain scope composedPreset=convivium。用原 createInput() 的议题/目标，替换 participants 为八个非 Manager 角色，participantKey 取 roleDefinitionId（不解析 Session ID 后缀）；每项固定 `{participantKey: d.roleDefinitionId, displayName: d.displayName, agentDefinitionId: d.agentDefinitionId}`；agenda[0].requiredParticipantKeys 同步为八个 key，移除旧 a/b/c 引用；Manager ID 选择 convivium.meeting_manager。通过真实 convivium_create_meeting 创建；assert 返回八 Participant 且 runtime 持久 children 为九个独立 Session。立即由 Captain 调用 convivium_pause_meeting，input 固定 `{protocolVersion:1, meetingId, expectedMeetingVersion: 当前 status 的 meetingVersion, requestId:"meeting-roles-pause", reason:"Verify deployed roles without formal writes"}`，确认 paused 并等待本次中断 settle，再开始技能/外部能力探针；不恢复会议或让 probe 代写正式发言。
6. 逐个读取真实 child：预期 childId 沿现有 allocator `${meetingId}-manager-manager` 或 `${meetingId}-participant-${participantKey}`；不要改 allocator。pause 可能释放 resident Activation，先通过准确 Captain 的 sendMessage（允许 DSH 原生 cold resume）给每个 child 固定指令：“本次只验证角色部署。先调用 skill 加载你的 required Skill，成功后回复 ROLE_READY，不执行正式会议操作或修改文件。”sendMessage 后通过 waitForAgent 取得真实 live child，先核对派生 persona 与自己的 roleDescription/Skill 名，再观察它自己的 Session。每个 child 从 sendMessage 前开始最多等待 180000ms，必须在它自己的原生 Session 事件中看到该 Skill 的 tool/call 和成功 tool/result，正文包含对应四条方法，再出现 ROLE_READY；不能用 ctx.skills.get 或直接伪造 session.append 代替。
7. 在 GitHub/arXiv/Web 三个真实 child 上，使用 ctx.tools.execute 调用原生 web_search 与 web_fetch，原生 arguments 固定为 web_search 的 `{queries:[query]}` 和 web_fetch 的 `{url}`，不包裹会议工具的 input。固定 search 查询分别为 `site:github.com/deepseek-ai/deepseek-harness`、`site:arxiv.org Attention Is All You Need`、`site:typescriptlang.org documentation`；fetch URL 分别为 `https://github.com/deepseek-ai/deepseek-harness`、`https://arxiv.org/abs/1706.03762`、`https://www.typescriptlang.org/docs/`。要求 search result.isError=false 且 result.value.sources 至少一个 URL 的 hostname 是对应域或其子域；fetch result.isError=false、result.value.statusCode 为 2xx、result.value.body.content 非空。这里证明部署 Provider 可工作，不声称模型自主完成研究质量验收。
8. 在 Manager 上执行 convivium_submit_turn，在 Scribe 上执行 convivium_submit_manager_plan，arguments 均为 `{input:{}}`（符合外层工具参数，不要求能通过被禁止的会议业务 schema），要求在 DSH 工具查找阶段 isError=true 且 error.code=UNKNOWN_TOOL；不是业务 INVALID_ARGUMENT。调用前后比较 paused Meeting version/正式 messages，必须不变。再在 Manager/Scribe 各自尝试 web_search `{queries:["deployment restriction probe"]}`，必须 UNKNOWN_TOOL，不触达外部 Provider；skill 在它们的 schemas 中仍可见。调用 Manager 的 convivium_meeting_status 和八个 Participant 的同工具必须成功。技能/网页读取不会因此成为会议授权。
9. 成功结果固定 assertions：`shared-preset-mounted`、`nine-independent-sessions`、`nine-native-skills-loaded`、`research-tools-operational`、`meeting-authority-preserved`。observed 固定 `{presetId:"convivium", definitionCount:9, participantCount:8, skillLoads:[{roleDefinitionId, skillName, sessionId, loaded:true}], research:[{roleDefinitionId, search:true, fetch:true}], deniedMeetingWrites:2, deniedPresetTools:2}`；skillLoads 按角色表顺序恰好九项且 Session ID 唯一，research 按 GitHub/arXiv/Web 顺序三项。只记录元数据，不输出工具正文或凭据。result validator 严格核对缺项、重复项、false 结果和两个拒绝计数；复用外层 restore=PASS。
10. test suite 校验 selector/Browser 拒绝、结果缺项与重复 Session 拒绝、tarball asset 路径与两个 patch 顺序，以及加载失败/超时必须失败并进入原 finally 清理；不把这些单元测试算成真实部署成功。资源字节/Persona snapshot 由新 samples suite 与原 role smoke 共同覆盖。

验证：
```bash
pnpm --dir plugin exec prettier scripts/smoke-profile tests/unit/scripts/role-composition-smoke.spec.ts tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/meeting-roles-smoke.spec.ts --write
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin exec vitest run tests/unit/scripts/role-composition-smoke.spec.ts tests/unit/scripts/meeting-roles-smoke.spec.ts tests/unit/scripts/smoke-profile.spec.ts
```
PASS：脚本/unit gate 全部 exit 0，原恢复断言未弱化，新场景只用交付包内容和真实 native Skill/tool 路径。此步不宣称真实部署已通过。
STOP：需要虚构 native event、修改生产生命周期或改用 fixture 结果才能通过；缺少真实 schema 时回报准确工具与版本，不猜字段。

### T5：完成全量验证、实际部署和正式证据

前置状态：T4 PASS；现有 dev.env 凭据流程可用。仅检查配置存在，不打印 secret；不在本任务购买或填写凭据。
允许修改：`docs/50-operations/HOW-TO-DSH-SMOKE.md`；新 `docs/50-operations/HOW-TO-MEETING-ROLES.md`；`plugin/meeting-roles/README.md`；Coverage 和 Smoke Evidence；本文件执行记录。
禁止修改：生产代码、日常 Host、凭据、历史验证结果；失败后不得仅改预期继续。

执行：
1. 本轮 Author 已创建目标 operations；实现后核对并补齐实际命令证据，再移除“尚未实现/验证”标记。operations 固定说明 native plugin add、同 tarball 解包、web --patch、显式 convivium Captain、八角色初始选择、Host model override patch、恢复与清理。它必须给出唯一可执行命令序列，从仓库构建 artifact，写入仅本次专用 dsh-workspace/meeting-roles-deployment 目录，不覆盖现有目录；沿既有 HOW-TO 的 dev.env 子进程注入。由包内 README 链接，用户无需编辑九个定义才能组合运行。
2. HOW-TO-DSH-SMOKE 更新新场景与总数为 17，CORE 仍 5；同步 role-composition 的 Host model map 说明。新场景没有 Browser 入口。
3. 按以下顺序运行，首次失败 STOP。native 新部署不得跳过，不以 keyless tests 替代；网络/凭据失败记录为阻塞，不能交付为“部署完善”。完整 verify 通过后才运行 Host smoke。

验证：
```bash
pnpm --dir plugin verify
env CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=meeting-roles pnpm --dir plugin smoke:profile
pnpm --dir plugin smoke:profile
```
随后执行 V-DOC 与 `git diff --check`。

4. 在 Smoke Evidence 新增 Meeting Roles Deployment 小节，按 Prepare/Execute/Assert/Restore 记录日期、代码分支/实际 revision 与未提交差异范围、Node/pnpm/DSH 版本、tarball 验证、九 Session/九 Skill、三类研究工具、两次权限拒绝、原生模型差异/冷恢复和清理结果；无敏感正文。Coverage 的 FR-14 与 Shared Preset 小节链接新证据。
5. Not Covered 明确：真实模型长期任务质量、独占 Skill/per-child Preset、动态 admission、日常 profile、Host capability 内容变更后的历史快照。不能把本次必过的九角色部署、Skill 加载或三类研究工具列入 Not Covered 后关闭。

PASS：完整 verify、角色冷恢复、新九角色部署、默认五核心 smoke 均 exit 0，全部 Restore PASS；正式操作文档可独立执行；证据没有伪称历史结果是本次运行。
STOP：任一失败、资源未清理、Skill 仅 get 未经模型工具加载、仅两夹具角色通过、真实 Provider 不可用；保留 RUNBOOK，报告最小失败命令与已完成阶段。

### T6：收口与删除 RUNBOOK

前置状态：S1–S4 和验证矩阵全部满足；T5 PASS；TODO 中 MAD-01–MAD-10 均已完成或已按 TODO Rules 删除。
允许修改：删除本文件；删除根目录 `TODO.md` 中任务编号为 MAD-01–MAD-11 的已完成任务，以及仅服务于这十一项的引导段落。
禁止修改：未完成或其他 TODO 任务、正式证据、其他文件/引用、任何 git 历史。

执行：先运行下列查询、V-DOC 和 diff 检查。引用必须仅存在于本文件及上述十一项 TODO；存在其他引用即 STOP，报告位置，不自动删除。将本文件和 TODO.md 原字节保存为本次临时备份，核对完成依据后删除上述已完成任务及专用引导段落，删除本文件，再重跑 V-DOC、git diff --check 和引用查询；失败立即恢复这两个文件并 STOP，成功移除自己的备份。收口项仅在全部删除后检查通过时视为完成；不得保存 completed/archive 副本或新增 TODO 完成历史，不自动 commit。

验证：
```bash
rg -n 'RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION|Meeting Agent Definition 首发角色模型与部署 RUNBOOK' docs TODO.md AGENTS.md
git diff --check
```
PASS：删除前仅本文件及上述 TODO 引用，删除后 rg exit 1 且无输出，V-DOC/diff check exit 0；长期规则与实际证据已迁入正式文档，无未完成或其他 TODO 被删除。
STOP：缺证据、有残留引用、删除后检查失败；恢复文件，不能标记 completed。不因只删除临时文档重跑已通过的 Host smoke。

## Validation Matrix And Failure Recovery

| 风险面 | 必须成立的结果 | Scope / 验证 |
| --- | --- | --- |
| 正常/边界/非法结构 | 新 Definition/Host map 接受合法值，旧字段/未知 ID/null/空 override 拒绝，错误脱敏 | S1，T2 focused + verify |
| 全角色原子性 | 九项中末项缺失 Skill 时零 child；DSH 部分创建失败仍 revoke/drain | S1/S2，原 dsh-capabilities/runtime suite + verify |
| caller/capability | Model override 不可从 Captain/HTTP 注入；Manager/Scribe 越权真实工具拒绝且 Meeting 未改 | S1/S3，T2 + meeting-roles |
| stale version/terminal | 保持现有业务门禁，不因角色更换改变已终态会议；旧 suite 不削弱 | S1/S3，完整 verify |
| 重放/幂等冲突 | ready/failed 不重解析，换 Definition ID 的冲突仍按原请求 hash | S1，现有 runtime suites + verify |
| transaction/无半提交 | 不新增事务/receipt/outbox；失败原子性沿原路径，禁止角色资源写入成为第二事实源 | S1，完整 verify；新增数据事务 Not Applicable |
| restart/recovery | 双 Host 旧 persona/filter/provider/model/reasoningEffort 保持，父 Session 不变 | S1/S3，role-composition smoke |
| native Skill 实际加载 | 九个独立 Session 都有自己的 native tool/call 与成功正文 tool/result | S2/S3，meeting-roles smoke |
| 外部能力可用 | 三研究角色 search 有对应域来源、fetch 成功，不能 fake fallback | S2/S3，meeting-roles smoke |
| 分发与 Loader | 实际 tarball 含闭合资产集；解包 patch 无 checkout 引用，所有启用 row 可解析/挂载 | S2，package gates +真实 profile |
| typecheck/build/contracts | lint/typecheck/test/build/environment/contract/resources/package 全 PASS | S1–S3，完整 verify |
| state/event/projection/archive | 不新增公开模型/Skill 正文，既有安全投影/ownership 不变 | S1，完整 verify；新增 DTO 映射 Not Applicable |
| 正常核心用户流程 | 默认五核心 smoke PASS；角色新增不破坏其他 profile 控制 patch | S3，默认 smoke |
| 恢复/清理 | 每轮仅清理自己 PID、端口、临时目录；Restore 失败算整轮失败 | S3，所有真实 smoke |
| 文档/删除 | T1 正式依据、T5 实际证据完整，引用/空白检查 PASS，再删除临时文件 | S4，V-DOC + T6 |

配置/资源/源码失败时保留差异，不回滚用户修改。测试临时目录必须 finally 清理；smoke 沿已有 wrapper 的精确 PID/目录 cleanup。无数据库迁移或既有数据删除。缺少凭据/公网返回失败时停止验证，不降低 Provider 要求；本 RUNBOOK 不授权绕过限制。

## V-DOC: Local Link Gate

本仓库无专用文档链接脚本。下列命令检查 TODO.md、docs 和存在的角色 README 的本地 Markdown 文件目标；锚点不在此 gate 范围，引用使用文件链接加 section 名称。不得把本地源码链接当 Web URL。

```bash
rg -n '\]\([^)]*\.md[^)]*\)' docs TODO.md
python3 - <<'CHECK'
from pathlib import Path
import re
files = [Path('TODO.md'), *Path('docs').rglob('*.md')]
files += [p for p in [Path('plugin/meeting-roles/README.md'), Path('plugin/examples/meeting-agent-definitions/README.md')] if p.exists()]
errors = []
for file in files:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if '://' in target or target.startswith(('#', 'mailto:')):
            continue
        target = target.split('#', 1)[0].strip('<>')
        if target and not (file.parent / target).exists():
            errors.append(f'{file}: {target}')
assert not errors, '\n'.join(errors)
print('PASS local Markdown link targets')
CHECK
```

## Author Audit And Execution Evidence

审计结论：`Executable`（后续实现计划）；当前授权仅为文档，基线验证已由用户明确要求并完成；不能据此开始 T1–T6 的代码、安装或部署操作。

逐项审计覆盖执行边界、最终字段/owner、输入输出映射、原生权限实现、全角色预检、模型差异/恢复、唯一文件与符号、阶段依赖、固定 PASS/STOP、失败清理、S1–S4 双向追踪、完整验证、readiness 与删除条件。正式需求/接口/设计和目标 operations 已在本轮 Author 同步；readiness 已明确新目标待实现，不沿用旧模型成功状态。

2026-09-08 Author 实际检查：26 个 Markdown 文件的本地链接目标 PASS；RUNBOOK/operations 中 shell 命令通过 sh -n、内嵌 Python 通过语法编译（只检查语法，未执行这些操作）；git diff --check 无空白错误；新增文件单独以 no-index whitespace check 核对。读取安装包确认 dsh-subagent 为 0.1.2-rc.1；ToolRuntime.view 的继承过滤语义与同版本源码一致。

Not Covered：本轮未改生产代码、测试或部署资源；仅运行 Confirmed Baseline 所列现有样本校验与 35 项 focused tests，未运行完整 tests/typecheck/build/smoke，未安装或调用模型/搜索 Provider，未修改日常 profile。新角色模型和部署验收仍是后续工作，不能填成本次 PASS。
