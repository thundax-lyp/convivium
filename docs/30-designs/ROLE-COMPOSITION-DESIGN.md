# Role Composition Design

## Purpose

把 FR-14 实现为会议角色解析与 DSH 原生部署的边界。2026-09-08 确认首发最终模型：Definition 只描述会议角色，Host 单独绑定模型差异，九个角色共享一个可部署 Preset。本文是目标设计，尚未落代码；旧实现与实际证据见 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#shared-preset-role-composition)。

## Scope And Non-goals

Scope：初始 Manager/Participant 的 roleDescription、原生 Preset/Skill 引用、继承工具 toolFilter、Host agentModelOverrides、创建预检、不可变 provenance；同 package 内附带共享 Preset、九个原生 Skills 与部署 patch，并完成真实九角色运行验收。

不实现旧格式兼容、迁移、Agent 配置平台、模型 registry、独立 per-child Preset、独占 Skill、热更新、动态 admission、UI 或 Runtime installer。不增加 Session event/hook、能力内容快照或第二份持久配置。初次发布直接采用 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 的 V1。

## Related Requirements And Interfaces

- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-14、BR-11、验收 35–40。
- [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)：字段、Host map、派生 persona、指纹和错误真相源。
- [Architecture](../00-governance/ARCHITECTURE.md)：同 package 资源、DSH 与会议事实分离、Import Paths。
- [Meeting Roles Operations](../50-operations/HOW-TO-MEETING-ROLES.md)：目标部署流程与验收边界。

## Responsibilities And Dependencies

### Role and model inputs

`plugin/src/role-composition/model.ts` 的 MeetingAgentDefinitionV1/parseAgentDefinitions 拥有角色结构与输入校验。roleDescription 只描述会议职责、预期输出和边界；通用取证/设计/执行方法属于原生 Skill。

新增 `plugin/src/role-composition/model-options.ts` 提供 MeetingAgentModelOverrides 和 parseAgentModelOverrides(value, definitions)。它只校验 Host 的有限原生模型覆盖，不访问 DSH 服务、不安装模型、不拥有默认值。key 必须引用同一配置的 Definition ID；完整校验、深拷贝与冻结规则以 Interface 为准。

`plugin/src/config.ts` 先解析 definitions 再校验 map。`plugin/src/index.ts` 的 meetingConsumerPlugin.apply 把两项传给 createCreateStatusRuntime，经 CreateStatusRuntimeOptions、createMeetingApplication 和 MeetingCreationRuntimeDependencies 进入 resolver。独立 map 的存在依据是当前多个会议角色需要不同模型，而 Definition 不应承担模型配置所有权；它不是通用扩展点。

### Creation conversion

`resolve.ts` 的 resolveMeetingRoles 接收角色数组与 optional agentModelOverrides，再次校验 direct-call 输入；从 Definition 生成 provenance，并按 Interface 固定模板生成 DSH persona。模型配置只取对应 map entry，未设置即省略，不复制父 options。

`dsh-capabilities.ts` 的 validateSharedRoleCapabilities 只读准确 Captain scope 的 Preset 和 Skills。所有角色预检必须在第一个 child 分配前完成；异步检查前后父 Preset 相同。它不预加载 Skill 正文到 Agent 历史，不因此授予工具权限。

ResolvedRoleComposition 保持 persona/toolFilter/agentOptions/agentDefinition 结构；`plugin/src/dsh/session-adapter.ts` 的 startManagerSession/startParticipantSession 只消费该原生创建结构，不导入角色 resolver。Convivium 的 roleDescription 不能导致 DSH request/descriptor.persona 改名。

repository 仍只消费 Binding 的三个 provenance 字段，不能保存 Host model map、Skill body 或安装信息。模块不导入 runtime/domain/client，不注册 service/event/hook。

### Native deployment resources

新增 `plugin/meeting-roles/` 是同一 package 中的静态发行资源：definitions.json、README、显式 cordis.patch.yml、presets/convivium/preset.yml、agent.cordis.yml 和九个 skills/<name>/SKILL.md。旧 examples/meeting-agent-definitions 在实施时移除，不再维护另一份角色 manifest。

DSH 原生 skill-filesystem 指向 Preset 相对 skills/，providerName=convivium-roles、includeDefaultRoots=false、watch=false；原生 tool-skill 提供目录和正文加载。其余 Host provider 仍可贡献 Skills，不宣称全局独占。共享 Preset 提供通用 persona、平台 shell、filesystem/search、web search/fetch 和 compaction；不附带任意子代理/workflow 管理工具。

Model 默认值、search/fetch provider、Sandbox/Approval 与 Session persistence 由 DSH web profile 提供。模型默认配置不出现在 Definition 或 Skill。Host 如需角色差异，只设置 agentModelOverrides。

核心插件 patch 保持无 Web/有 Web 的原边界；meeting-roles 的显式部署 patch 修改 web profile 的 agent-presets 与 convivium row，将所有定义绑定 convivium、maxParticipants=8、provider=spawn。此 patch 只用于独立会议 profile，不隐式替换日常 profile 的 roots/default。

发行 tarball 同时安装插件与提供解包后的静态 patch。Host 将非敏感环境变量 `CONVIVIUM_MEETING_ROLES_ROOT` 设为同包解包后 meeting-roles 的绝对目录；部署 patch 只拼接固定 presets/ 和 definitions.json，缺变量时 Loader 失败。外部 patch 的表达式 baseUrl 属于 profile，不能用于定位资产。DSH --patch 首先加载该资源 patch，然后加载本次控制参数 patch；Cordis 会整体替换同 row 的 config，后层必须重述原定义加载表达式及 provider/容量，再叠加所需运行参数或 agentModelOverrides。两层引用同一文件，不复制角色定义或模拟 Preset；Convivium Runtime 仍只接收内联数组，不读取任意路径、不安装能力。

## State And Failure Handling

沿既有 create receipt/hash、bootstrap、cleanup、revoke、interrupt/drain 所有权。Definition 或整个 Host map 非法时拒绝；选定 Preset/Skill 缺失时不创建任何 child；DSH 部分创建失败不发布 ready Meeting。

ready/failed 请求重放不重新读取角色或模型配置。冷恢复由 DSH descriptor 保持派生 persona、filter 和实际模型；缺失 descriptor 仍按 RECOVERY_ROLE_DESCRIPTOR_MISSING 拒绝补建。没有旧输入迁移不意味着取消冷恢复安全规则。

Definition 指纹不包含模型覆盖；Role 内容修改改变指纹，Host model 修改不改变角色 provenance。DSH descriptor 是有效模型的唯一持久所有者。配置变化只作用于新 Session，Host capability 内容变更不保证历史正文快照。

## Security And Observability

ToolRestriction 作用于 global 和祖先 scope（含共享 Preset）的继承工具；只有 child 自己注册的工具保留。Manager/Scribe 必须显式 allow skill，继承的 shell/fs/web 不在其 allowlist 内。资源执行遵循 DSH Sandbox/Approval，会议发言与决策始终由 Runtime 的真实 Session/capability 检查。

Model map 只接受本地 Host 配置，不暴露给 Captain 输入、HTTP 或 Manager projection。不得输出 roleDescription、派生 persona、Skill 正文、模型覆盖或凭据到 status/archive/错误。部署证据只记录角色、Skill 名、独立 Session 数与成功/失败等元数据。

## Acceptance

- 配置/模型 map 的正常与非法输入、角色匹配、全项预检、空 map/未知 ID/原型名 ID、冻结与错误脱敏。
- 同一发布包的九 Definition、共享 Preset、九 Skill 可被真实 Loader 解析并挂载；同一会议形成 Manager 加八个 Participant 的独立 Session。
- 每个 child 的 native skill 工具成功返回自身正文；只列目录或 ctx.skills.get 不能满足此验收。
- GitHub/arXiv/Web 研究角色的真实搜索和抓取可用；Manager/Scribe 越权会议工具执行被拒绝且事实不变。
- 不同角色的模型/persona/工具 filter 彼此隔离，两个真实 Host 的冷恢复保留既有有效配置；父 Session 不被重配。
- 完整 verify、九角色部署、原角色冷恢复与默认核心 smoke 全通过，所有 Restore PASS；模型长期任务质量单独标为 Not Covered。
