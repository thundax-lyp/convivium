# RUNBOOK: Peer Meeting Agents

状态：**执行中，按用户授权边执行边修复**。建立于 2026-09-24，文档检查于 2026-09-25；执行分支 `feat/peer-meeting-agents`。已有结构、路径、链接和部分步骤推演证据，尚未逐步核实全部前置依赖、调用接线与测试可执行性；已开始产品实现与聚焦测试，真实 DSH 验收尚未执行。2026-09-25 用户明确授权实施并在执行中修复步骤缺口；不得跳过验证或把未通过步骤记为 PASS。

## 执行者契约

- 只从仓库根执行，保留工作树中已有的 MO-FR-14 文档改动；逐步按下文编号出现顺序执行，不跳步、不从旧实现推断目标语义。
- PASS 表示该步规定的文件、行为断言和命令均满足；任一前置不成立、命令失败、发现未列出的跨边界字段或需要选择方案时 STOP。STOP 报告最后 PASS 步骤、文件/symbol、复现命令、实际输出及需要确认的决定；不得回滚用户原有修改。
- 本 RUNBOOK 不授权 commit、push、PR、合并、删除人工冒烟数据或启动已关闭的人工 DSH Host。T20 仅授权删除已被新链路取代且通过其门禁的旧产品代码、共享 Preset、旧角色 Skill 和对应失效测试，不授权清理用户数据。本次文档编写不执行这些删除。

## 目标与当前断点

目标：用户通过可信 `conviviumMeetings.control` 发起会议 → Runtime 预检七个 Definition 各自的 AGENTS 身份资源及 Preset/Skill 集合 → 创建七个彼此平级、meeting-owned 的独立 DSH AgentSession → Runtime 按 ownership 投递 notice、审核及后续准入效果，输入 Session 关闭时继续运行 → 暂停、恢复、归档和冷重启仍只影响对应 Meeting 身份。输入 Session 关闭不影响用户控制，Agent 不因用户文字授权而获得控制权限。Agent 间正式交流只经 Meeting Runtime。唯一专职 Reviewer 的逐版本 one-shot worker 继续使用 DSH Subagent；不采用实验性 DSH Agent Teams。

| 边界         | 已确认目标                                                                                                                                                                                                                                               | 当前实现与断点                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份         | [MO-FR-2](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-2会议与身份隔离)、[MO-FR-14](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-14平级-meeting-agent-与独立能力组合)：七个平级 Session，各自 Preset 与分配的 Skills | `plugin/src/runtime/meeting-runtime.ts` 的 `createMeetingCreationCoordinator` 调用 `plugin/src/dsh/session-adapter.ts` 的 `startMeetingIdentitySession`，使用 `ctx.subagents.startContinuable` 和 Captain parent。                              |
| 能力         | Definition 引用角色 Preset 和可复用能力 Skill；未分配 Skill 对该角色不可列出、不可加载                                                                                                                                                                   | `plugin/config/definitions.json` 一角色一 Skill；`plugin/config/presets/convivium/agent.cordis.yml` 向共享 Preset 挂载整个 Skill 根。`validateSharedRoleCapabilities` 只验证父 scope 的必需 Skill。                                             |
| 数据         | Captain 是创建来源，不是 DSH parent；Session ownership 要能跨重启定位并撤权                                                                                                                                                                              | `plugin/src/repository/types.ts` 的 `SessionOwnership.parentSessionId/provider/initialMessageId`、`plugin/src/dsh/meeting-identity-admission.ts` 的 `PreparedDescriptor.parentSessionId`、推荐 intent 的 `childSessionId` 都表达旧 child 语义。 |
| 效果         | 每个 effect 在 active ownership 与精确 Meeting 身份验证后投递                                                                                                                                                                                            | `plugin/src/runtime/meeting-lifecycle.ts` 的 `recoverTargetMeetingDeliveries` 与 `createIdentityProvisionOwner`、`plugin/src/dsh/session-adapter.ts` 的 followup 函数、各 dispatcher 使用 Captain–child `sendMessage`/`listChildren`。          |
| 终态         | revoke 后不能恢复 Meeting authority；清理不依赖 Captain 存活                                                                                                                                                                                             | `plugin/src/dsh/session-ownership.ts`、`plugin/src/runtime/services/meeting-archive.ts` 使用 parent 授权的 child enumerate/interrupt/drain。                                                                                                    |
| Captain 命令 | Captain 是本地用户，输入 Session 仅记来源；用户入口覆盖 create、十控制及 pause/resume/end                                                                                                                                                                | 当前 create 从 exec.agent 取来源，Domain 仍检查 captain identity，local control 仅三项；本次替换这些接线。                                                                                                                                      |

上述当前实现证据只说明迁移起点；[Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 不把它计为新 MO-FR-14 的通过证据。

`plugin/src/tools/register-tools.ts::registerMeetingTools` 当前提供 create 与身份工具；`plugin/src/runtime/meeting-lifecycle.ts` 的 local control 当前只接 pause/resume/end。目标移除 Agent create tool，以同一可信用户 Remote 补齐 create 与十项控制，并保留 pause/resume/end；Contributor、Manager、Reviewer 的身份操作不授予用户控制权限。

目标 DSH `0.1.2-rc.1` 已安装包的公开类型声明给出可用接点，但这只证明 API 存在，不证明 Convivium 已正确接线：

| 接点           | 已核对的公开声明                                                                                                                                                                                   | 目标使用约束                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 平级生命周期   | `@deepseek-ai/dsh-agent` 的 `ctx.agents.create`、`ctx.agents.resume`、`AgentHandle`；`setup` 在 Agent/Session 发布与首次 prompt 前完成，失败回滚未发布对象                                         | Runtime owner、持久 Session ID、setup/commit 与 Meeting ownership 提交顺序、恢复 handle 的责任 |
| 能力组合       | `@deepseek-ai/dsh-agent-presets` 的 `standingKeyFor(id)` 与 `mount(agentCtx, id)`；`@deepseek-ai/dsh-system-prompt` 的 scoped `systemPrompt.section`；`@deepseek-ai/dsh-tools` 的 `tools.restrict` | 预检不创建 Session；精确 Preset/AGENTS/工具限制在创建和恢复 setup 中核对                       |
| Skill 查询     | `@deepseek-ai/dsh-skill` 的 `ctx.skills.list({ scope, cwd })` 与 `ctx.skills.get(name, { scope, cwd })`                                                                                            | 七个角色的期望集合、global/default provider 的额外可见性及按名称加载的拒绝证据                 |
| 投递与驻留结束 | `Agent.followup(UserMessage)` 和 `ctx.sessions.flush(session)`；`AgentHandle.dispose()` 停止 loop、从 live store 移除 Session 并释放 scoped world                                                  | flush 成功后才完成 outbox；停止与持久日志保留分别验证，已撤权日志不能恢复身份                  |

上述接点的版本依据是 `plugin/package.json` 和 `plugin/node_modules/@deepseek-ai/*/lib/types/index.d.ts`；类型声明是技术调查证据，不是正式业务契约或运行验证。

目标 tag `dsh-v0.1.2-rc.1` 的 [Web bundle patch](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/bundle/web-app/cordis.patch.yml) 把 base 的 host `skill-filesystem` 行设为 disabled；[filesystem provider 源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/skill/skill-filesystem/src/index.ts) 对 `customSkillDirs` 求绝对路径，并把扫描根下的 `SKILL.md` 作为 flat Markdown Skill 读取，资源 base 为该扫描根。由此可用每个角色 Preset 的能力目录集合隔离首发五项 Skill；另装的 global provider 仍须在 preflight 和 scoped setup 通过 `list/get` 精确拒绝。该源码核对只证明接线可行，实际模型可见性留给 T21 Loader 验证。

## Scope 与 Non-goals

Scope：初始七身份、动态普通 Participant 准入、角色资源装配、会话 ownership、**当前已接通的** notice/review/review-delivery 效果迁移、暂停/结束/归档/冷恢复、用户创建、十种 Captain 控制、既有生命周期控制及其面板表单的完整生产入口、旧 Captain-child 代码与旧角色资源清除、契约测试和真实 DSH Loader 验证。保留 Meeting command、版本、receipt、outbox 与 reviewer claim 的领域语义。

Non-goals：实现实验性 DSH Agent Teams；把会议身份重新做成 Subagent；改变 Reviewer one-shot worker 的固定 outputSchema；引入跨 Host、多用户或新的外部服务；把 Skill 当成 Meeting authority；迁移未发布的旧 Definition/schema 或删除人工冒烟数据。尚未接通生产 command/effect 的 MeetingTask 与 `session_mail` 业务能力继续按 readiness 标 `Not Covered`，不把本次 Captain 十项控制的“补齐全部能力”扩读为实施 MO-FR-5 全部任务和私信 action；其后续实现必须经本次确立的平级 owner 投递，不可回退 Captain-child。

## 正式依据与不可违反的不变量

- [Architecture](../00-governance/ARCHITECTURE.md#identity-and-session-isolation) 决定 Host/Meeting/Session 所有权；[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 固定目标资源、descriptor 与 ownership 类型，[Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md) 固定目标生命周期。[DSH Plugin Design](./DSH-PLUGIN-DESIGN.md) 与专项 Peer Meeting Agents Design 均只陈述新目标；旧 Captain-child 事实仅在本 RUNBOOK 的代码断点和 readiness 中保留，不再作为设计依据。
- Captain 就是本地用户；创建和控制只从可信 loopback 用户入口注入 local-controller。creator 仅记录来源，Session 不授予或锁定用户权限。用户管理多场 Meeting 时仍逐请求验证目标、版本和领域前置。
- 七个平级 Agent 与投递不依赖用户输入 Session；重开面板或 Host 冷启动后用户仍能控制。Agent 无论是否声称受用户委托，都不能经 DSH tool 获得用户控制权限；不新增自然语言自动执行或账户系统。
- Agent 间正式交流只能通过 Meeting Runtime 的已授权会议操作形成可审计事实；即使 DSH 提供直接 Agent 消息接口，也不能把它接成绕过会议记录的交流路径。
- 每个 Meeting identity 只有一个独立 Session；Definition ID/version/hash、AGENTS 资源版本/指纹、Meeting ID、identity ID、Session ID、Preset ID 与 Skill 集合需要精确绑定。失败时不得产生可调度的半配置身份。
- DSH Session header 的 Preset ID 不是 scoped 指令、toolFilter 或 Skill 集合的完整快照。冷恢复必须在 `ctx.agents.resume` 的 scoped setup 中按已固化版本重新装配并核对，精确资源缺失或指纹不符时拒绝恢复，不能使用当前默认 Definition、AGENTS 或 Host override 重配历史身份。
- 每个角色的 AGENTS 声明身份、职责、能力范围和边界；按能力命名的 `SKILL.md` 写可复用任务方法。插件在平级 Agent 的 scoped setup 中读取并显式注册该角色 AGENTS 身份指令；DSH 原生按工作目录装载 AGENTS 仍由 Host 管理，不能作为角色装载的替代。角色模型上下文只装载自己的 AGENTS 指令，Skill 列表与按名称加载只暴露分配的 Skills；本机打包的静态文件不另作文件系统保密承诺。
- `toolFilter` 只收窄继承工具，不负责 Skill 隔离。Skill 的 model-facing catalog 与按名称加载两条路径都须按角色验证。脚本仍受 Host 文件与执行权限控制。
- 首发只有五项能力 Skill：`meeting-facilitation`→`meeting_manager`；`repository-analysis`→`domain_architect`、`runtime_engineer`、`protocol_ui_engineer`、`verification_reviewer`；`evidence-review`→`verification_reviewer`；`github`→`github_research_analyst`、`verification_reviewer`；`arxiv`→`arxiv_research_analyst`、`verification_reviewer`。各 Definition 的 `requiredSkillNames` 精确取该角色获分配集合。
- `followup`/inbox acceptance 不等于业务完成。Outbox effect ID、Meeting version、requestId 与 reviewer claim 的幂等边界保留；不能从 Agent 文本或 Session log 推断会议事实。
- Capability revoke 先于停止会话；已撤权或 archived 的 Session 即使仍有 DSH 持久日志也不得继续执行 Meeting command。旧结果、stale version、错 Meeting/identity 一律拒绝。

## 固定数据、接口与调用链

### 目标数据流

| 值                                                         | 唯一生产者与首次保存处                                                                                                                       | 消费者与重放约束                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MeetingBootstrap.creator`（必填）                         | 可信 loopback adapter 固定 kind=local_user、principalId=local-controller；sourceSessionId 当前省略                                           | Repository 保存创建审计，不作为 Session 授权；公开 DTO 不输出                                              |
| `captainActorId: string`                                   | Runtime 从 `[meetingId,"captain_actor","captain"]` 的 canonical SHA-256 产生                                                                 | Domain 控制事实的 `actorId`，Archive 的 `controlActorProvenance`；不进入 MeetingIdentity                   |
| `SessionOwnership.id/sessionId: string`                    | Runtime 对 `[meetingId,"session_ownership",identityId]` / `[meetingId,"meeting_agent_session",identityId]` 各取 SHA-256 前 32 位并加对应前缀 | Repository 私有 ownership、DSH create/resume、caller 解析与 effect 投递；同一 identity 重试必须同值        |
| `definition: AgentDefinitionBinding`                       | `resolveMeetingRoles` 对精确 Definition id/version/canonical 内容计算 hash                                                                   | descriptor、ownership、恢复；同 id/version 不接受内容变更                                                  |
| `resources: ResourceBinding`                               | role-composition 从已安装 AGENTS 原始字节、Preset 两文件及 Skill bundle 全部普通文件计算 SHA；拒绝 symlink/逃逸                              | descriptor、ownership、scoped setup 与冷恢复；资源字节不符拒绝，不改用最新版本                             |
| `agentOptions: EffectiveAgentOptions`                      | Runtime 从 Host 当前模型选择和按 Definition ID 的 override 合成                                                                              | descriptor、ownership、DSH create/resume；恢复时不得重新读取当前默认                                       |
| `PreparedDescriptor.descriptorId/descriptorHash/expiresAt` | Runtime 时钟与精确 Meeting/identity/Session/Definition/resources/options；公式及 300000ms TTL 见 DSH Role Interface                          | provisioning ownership 激活时逐字段及 hash 比对；过期、跨 Meeting 或资源改变拒绝                           |
| `SessionOwnership.lifecycleStatus/capabilityStatus`        | Repository CAS 从 provisioning/active/closed 与 active/revoked 变更                                                                          | caller/read/effect 在每次操作前重验；激活前与撤权后均拒绝 Meeting authority                                |
| `IdentityRecommendation.sessionId`                         | Manager admit 提交不可调度意图时由 Runtime 固定                                                                                              | provision/recovery 重试沿用；相同 admissionId+payload 重放返回同结果，不同 payload 为 `ADMISSION_CONFLICT` |

上表每个结构的完整 required/optional 字段及 hash 编码见 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md#primitive-types-and-versions)、[Preflight](../20-interfaces/DSH-ROLE-INTERFACE.md#definition-resolution-and-preflight)、[Ownership](../20-interfaces/DSH-ROLE-INTERFACE.md#atomic-admission-and-ownership) 与 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#wire-conventions)。代码执行者不能改变这些字段、默认值或产生位置。旧 `parentSessionId|childSessionId|provider|initialMessageId` 不进入目标 ownership；旧格式读取为 `INCOMPATIBLE_VERSION`，不迁移、双写或猜测填充。

T4–T6 的目标私有结构逐字段如下；`?` 唯一表示可缺席，不允许以 `null` 代替，未列字段由 strict Schema 拒绝。`EpochMs` 为非负 safe integer，所有 ID 非空，sha256 为小写 64 位十六进制：

```ts
interface MeetingBootstrap {
  status: "creating" | "ready" | "creation_failed";
  createRequestId: string;
  requestHash: string;
  creator: {
    kind: "local_user";
    principalId: "local-controller";
    sourceSessionId?: string;
  };
  createResult?: MeetingCommandAccepted;
  createdAt: number;
  updatedAt: number;
  failureCode?: string;
}
interface PreparedDescriptor {
  descriptorId: string;
  meetingId: string;
  identityId: string;
  sessionId: string;
  definition: AgentDefinitionBinding;
  resources: ResourceBinding;
  agentOptions: EffectiveAgentOptions;
  descriptorHash: string;
  expiresAt: number;
}
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
  descriptorId: string;
  descriptorHash: string;
  sessionLabel: string;
  lifecycleStatus: "provisioning" | "active" | "closed";
  capabilityStatus: "active" | "revoked";
  createdAt: number;
  updatedAt: number;
}
```

`AgentDefinitionBinding` 为三个必填字符串 `agentDefinitionId/definitionVersion/definitionHash`；`ResourceBinding` 的必填字段为 `instructions:{roleDefinitionId,version,sha256}`、`presetId`、`presetSha256`、`skills:Array<{name,sha256}>` 和 `compositionHash`；`EffectiveAgentOptions` 的必填 `provider/model` 与可选 `reasoningEffort` 均为非空字符串。`PreparedDescriptor` 不由 caller 提交或单独当成可恢复持久权力，它由 Runtime 预检产生、随 ownership 固化其 ID/hash；恢复用 ownership 的完整 Definition/资源/options 原值重新验证。`MeetingBootstrap.creator` 只由可信用户 adapter 产生，sourceSessionId 当前省略，归档只保存脱敏 actor。CreationRecord/PersistenceProjection 的 `formatVersion` 必须是 `2`，旧 `1` 拒读，事件/receipt/outbox/catalog 原格式版本不变。

### 端到端提交顺序

1. 用户在 loopback 面板提交结构化命令；Remote adapter 注入 local-controller，Runtime 校验后按 requestId 分配 Meeting ID；先查原创建记录/receipt 再预检，重放不生成新 descriptor。首次创建为七份 Definition 固定资源与模型绑定。
2. Repository 同事务保存 creator、七 provisioning ownership、七 preparedDescriptors 和 creating 状态。owner 按固定 Session ID 创建；setup 验证 Preset/AGENTS/Skill/toolFilter 并以 allow:[] 禁工具；返回后核对 header，逐份 CAS active。
3. completeCreate 原子发布 ready/receipt/outbox；随后 owner.resume delivery 释放受限 scope 并恢复同一 Session。ready 前失败先 creation_failed/revoke 再 stop；ready 后恢复失败保留 ready 和 retry。创建来源 Session 关闭不影响任何步骤。
4. 动态 admit 保持稳定 intent→预检→provisioning ownership/descriptor→create→CAS→admission_result 顺序，身份正式 active 才恢复 delivery。失败或过期撤权清理，不延长原 TTL 或替换 Session。
5. 消息按 preauthorize→owner.resume delivery→owner.deliver(pre/followup/flush/post)→outbox delivered；失败保留 retry。用户控制按可信入口→固定 captainActorId→Domain→统一事实/receipt/outbox 事务，Agent 请求控制一律拒绝。
6. 冷启动读取 Repository 原绑定；paused 不恢复 delivery，creating 使用原有效 descriptor，creation_failed/终态只做撤权清理。用户控制无需恢复输入 Session。归档只关闭目标 Meeting，系统 start_archive 使用 runtime_recovery 的系统 actor，不冒用用户来源。

当前已接通的 effect 路由固定为：`identity_provision`→`plugin/src/runtime/services/meeting-identity-provision.ts::provisionMeetingIdentity`（不发送 UserMessage）；`agent_notice` 且 `noticeKind="review_request"`→`plugin/src/runtime/services/evidence-review-dispatch.ts::createEvidenceReviewDispatcher`；其余六种 `agent_notice`→`plugin/src/runtime/services/meeting-notice-dispatch.ts::createMeetingNoticeDispatcher`；`review_delivery`→`plugin/src/runtime/services/evidence-review-dispatch.ts::createReviewDeliveryDispatcher`；`archive`→`plugin/src/runtime/services/meeting-archive.ts::createMeetingArchiveDispatcher`。唯一分发点仍为 `plugin/src/runtime/meeting-lifecycle.ts::createTargetMeetingEffectDispatcher`，从签名中删 Captain `parent` 并注入 `MeetingAgentOwner`。每个消息 dispatcher 先按已有 payload 校验与 caller-visible 投影得到 `text`，再把目标 active ownership、`outboxItem.deliveryId` 和 pre/post Repository 授权 callback 传入 owner.deliver；返回 `false` 或异常不调用 `completeOutbox(delivered)`，保留原 effect 重试。`identity_provision` 与 `archive` 各自按已提交 intent/ownership 处理，不复用消息投递。目标 `session_mail` 与 MeetingTask effect 尚无生产链，本 RUNBOOK 只固定其将来必须使用相同 owner 边界，不宣称本次验收通过。

T10 的授权 callback 具体复用现有纯校验入口：六种普通 notice 每次重新 `repository.recover()`、由 `meeting-notice-dispatch.ts::findOwnership` 精确定位 active recipient，再执行 `assertNoticeReferences`；`review_request` 每次重新读取待审 version/claim，并由 `evidence-review-dispatch.ts::{findIdentity,findOwnership,publicationEvidence,pendingReviews}` 验证 reviewer 与 source effect；`review_delivery` 每次重新验证 Review/author/可见性、`findOwnership` 与 `alreadySent`，只有当前待送达项可通知。pre 和 post 校验均使用同一个 outbox item 的 ID、deliveryId、payload，不重新生成消息 ID；Repository version 已变化但目标引用仍合法时允许投递，引用失效/ownership 被撤权时不标 delivered。focused test 必须分别在 `followup` 后、`flush` 前与 `flush(true)` 后、`completeOutbox` 前模拟中断，重开后同一 deliveryId 重试且仅原 Meeting command 的 requestId/receipt 决定是否产生事实；对 `flush(false)` 断言 effect 保持 retryable、未写 delivered。不能用 inbox 数量恰为一作为成功前提。

Captain 十项的目标接线不是十套单独的 repository 事务。每项都使用 `MeetingCommandSchema` envelope、统一 `executeExistingMeeting` 的 version/receipt/commit 路径；协议字段和领域前提逐项取 [Meeting Interface 的 Command Action Union](../20-interfaces/MEETING-INTERFACE.md#command-action-union)。下表固定动作到现有纯 transition 的落点，新增调用不能借 `identity` actor 伪造 Captain：

| action kind                | Domain 调用点                                                    | 目标代码改动点                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `activate_agenda`          | `transitionMeetingState` → `transitionMeetingControl`            | `plugin/src/domain/meeting-state-transitions.ts` 接受外部 `captain_user` actor；application 的 `runMeetingActionTransition` 增加此 case |
| `dispose_agenda_candidate` | `transitionMeetingState` → `transitionAgendaCandidate`           | 同上；`promotedAgenda.id` 来自 `AgendaInput` 并由 Domain 校验本 Meeting 唯一，不另生成 Agenda ID                                        |
| `resolve_question`         | `transitionMeetingState` → `transitionQuestion`                  | 同上；保留 open/deferred 与 immutable disposition fact 规则                                                                             |
| `dispose_issue`            | `transitionMeetingState` → `transitionIssue`                     | 同上；只在 running 处置并在同次转换重算 completion                                                                                      |
| `abort_round`              | `plugin/src/domain/transitions/round.ts::abortRound`             | 扩 actor union 为 `captain_user`，application 显式映射 reason/roundId                                                                   |
| `decide`                   | `plugin/src/domain/transitions/outcome.ts::decide`               | 扩 `OutcomeActor`，application 分配 decisionId、注入 now                                                                                |
| `change_decision`          | `plugin/src/domain/transitions/outcome.ts::changeDecision`       | 扩 `OutcomeActor`，application 显式区分 supersede/revoke                                                                                |
| `dispose_risk`             | `plugin/src/domain/transitions/outcome.ts::disposeRisk`          | 扩 `OutcomeActor`，application 保留 local 独立授权                                                                                      |
| `record_completion_fact`   | `plugin/src/domain/transitions/outcome.ts::recordCompletionFact` | 扩 `OutcomeActor`，application 分配 fact ID、注入 now                                                                                   |
| `change_completion_fact`   | `plugin/src/domain/transitions/outcome.ts::changeCompletionFact` | 扩 `OutcomeActor`，application 显式区分 supersede/revoke                                                                                |

十项均在 `plugin/src/protocol/meeting-command.ts::MeetingActionSchema` 增加精确 Schema，从 Remote.control 进入统一 application；不新增 Captain DSH tools。用户 read 使用既有 LocalMeetingWebRuntime.read；Agent read 仍只接受 active ownership。`projectMeetingView` 的用户投影及 `materializeArchive` 的 controlActorProvenance 使用脱敏 captainActorId。

Captain fact 写入的逐字段规则：`CommittedFactRecord` 的 `factId` 来自 `deps.ids.nextId("fact")`，`actorId` 来自该 Meeting 的 `captainActorId`，`occurredAt` 来自一次 command 的 Runtime `now`，`meetingVersion` 来自成功提交版本；`kind` 为 action kind，`relatedIds` 取纯 transition 的结果，`resultingState` 为该提交的完整新状态。`resolve_question` 与 `dispose_issue` **必须透传** `transitionMeetingState(...).facts[0].payload` 的 `question_disposition` / `issue_disposition`，不可被 `buildRepositoryCommand` 当前的通用 `{kind:"references",relatedIds}` 覆盖；其余八项使用该 `references` payload。一个成功 command 只追加一项对应控制 fact、一个 receipt 及该 transition 明示的 effectRequests；拒绝、版本冲突或重放不追加新 fact/outbox。`question_disposition`、`issue_disposition` 的 old/new status/blocking、rationale、evidenceIds 精确字段以 [Meeting Interface 的 Persistence And Effects](../20-interfaces/MEETING-INTERFACE.md#persistence-and-effects) 为准。

十项的业务对象 ID 来源固定为：`activate_agenda`、`resolve_question`、`dispose_issue`、`abort_round` 不新增业务对象；`dispose_agenda_candidate` promoted 时使用 caller 的 `promotedAgenda.id`，由 Domain 校验唯一；`decide` 的 `decisionId=deps.ids.nextId("decision")`；`change_decision` supersede 才生成 `replacementDecisionId=deps.ids.nextId("decision")`，revoke 禁带 replacement；`dispose_risk` 的 `dispositionId=deps.ids.nextId("risk_disposition")`；`record_completion_fact` 的领域 `factId=deps.ids.nextId("completion_fact")`；`change_completion_fact` supersede 才生成 `replacement.factId=deps.ids.nextId("completion_fact")`，revoke 不生成。上述领域 CompletionFact ID 与每条 committed fact 的 `deps.ids.nextId("fact")` 是不同 ID。Runtime `now` 对同一 command 只读一次并传所有纯 transition；重放沿用原 receipt，不再次分配任何 ID。

T12–T18 的 Remote `control` command 根对象仍是 `{protocolVersion:1,meetingId,expectedMeetingVersion,requestId,action}`，`meetingId` 必须为已有 Meeting ID、`expectedMeetingVersion` 为非负整数、`requestId` 为非空 ID。用户选择的 `action` 使用精确 `kind` 判别，不额外接受 `input/json` 包装；Remote.control 仍以 `MeetingCommandSchema` 解析并在 application 独立验证。十项 action 的参数精确清单如下，未写 `?` 的均为 required：

| kind                       | 除 `kind` 外的 action 参数                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activate_agenda`          | `agendaId:string`，`previousDisposition:completed                                                                                \| deferred                                                                                                                               \| closed`，`reason:string`                                                                |
| `dispose_agenda_candidate` | `candidateId:string`，`disposition:promoted                                                                                      \| parked                                                                                                                                 \| rejected`，`reason:string`，`promotedAgenda?:AgendaInput`（仅 promoted 必填，其余禁止） |
| `resolve_question`         | `questionId:string`，`status:answered                                                                                            \| withdrawn                                                                                                                              \| deferred`，`rationale:string`，`evidenceIds:string[]`                                   |
| `dispose_issue`            | `issueId:string`，`status:resolved                                                                                               \| deferred                                                                                                                               \| out_of_scope`，`rationale:string`，`evidenceIds:string[]`                               |
| `abort_round`              | `roundId:string`，`reason:string`                                                                                                                                                                                                                                                                                                                                     |
| `decide`                   | `candidateId:string`                                                                                                                                                                                                                                                                                                                                                  |
| `change_decision`          | `decisionId:string`，`status:superseded                                                                                          \| revoked`，`rationale:string`，`evidenceIds:string[]`，`replacementCandidateId?:string`（仅 superseded 必填）                                                                                                                      |
| `dispose_risk`             | `issueId:string`，`action:accept                                                                                                 \| reject`，`scope:string`，`rationale:string`，`evidenceIds:string[]`                                                                                                                                                               |
| `record_completion_fact`   | `outputId:string`，`criterionId?:string`，`statement:string`，`rationale:string`，`evidenceIds:string[]`，`decisionIds:string[]`                                                                                                                                                                                                                                      |
| `change_completion_fact`   | `factId:string`，`status:superseded                                                                                              \| revoked`，`rationale:string`，`replacement?:{outputId,criterionId?,statement,rationale,evidenceIds,decisionIds}`（仅 superseded 必填）                                                                                            |

`AgendaInput` 精确字段为 `id/title/question:string`、`requiredOutputIds:string[]`、`ownerId?:string`；字符串 trim 后非空，数组长度/重复/引用按正式 protocol/domain Schema。用户面板不提交 principal、actor 或 Session。DSH registerMeetingTools 删除 create 分支，所有剩余身份工具仍经 callers.resolve。实际本地用户来源常量沿用现有 `local-controller`，不引入第二个 principal。

## 执行范围与恢复规则

以下每步继承同一约束：不修改依赖版本、人工 `dsh-workspace/`、远端服务、CI 门禁或 Non-goals；失败停止当前步骤，保留已完成步骤及用户原有改动，不自动 reset。仅在临时测试环境清理该步自己创建的 handle/临时数据库；不删持久 Session 日志。新增路径均在步骤中明确标记；花括号路径表示逐个展开的闭集，不能自行增加角色、Skill 或测试主题。

类型迁移的机械同步允许更新 `plugin/tests/fixtures/role-composition.ts`、`plugin/tests/unit/domain/meeting-state-transitions-fixtures.ts`，以及 `rg -l 'parentSessionId|childSessionId|roleDescription|meeting_scribe|captain' plugin/tests` 找到的直接类型构造：仅删除被废弃字段、按固定公式补齐绑定；旧 captain identity fixture 改为外部用户 actor，不向七身份补虚构第八人；业务断言仍在所属步骤重写，不能跳过测试。生产调用点只允许同步本文件列出的签名与字段，不引入兼容 adapter。新增公开符号同步所属现有 `index.ts`；生成文件仅由 `pnpm --dir plugin generate:typert` 或 `build` 产生，不手改。迁移中间阶段只执行对应聚焦门禁，全包验证在 T20/T21 执行；中间通过不代表完整插件可发布。

所有新测试按 [Test Rules](../00-governance/TEST-RULES.md) 与仓库 TDD Skill 实施；先证明新断言在旧行为下失败，再实施，不把模块导入失败当作行为红灯。当前文档审计不执行未来测试。

T0–T4 已完成，其执行步骤已按用户要求删除；验证证据保留在文末执行记录，原步骤可从 Git 历史 `c37fa413` 查阅。后续编号保持不变，从 T5 继续核对并执行。T4 的 Schema/codec 已提交于 `8655599c`；该步完成不代表 T6 Repository 行为或整包验证完成。

### T5：资源哈希与角色能力预检

前置状态：T4 Schema/codec 聚焦验证已通过（见执行记录），对应实现已提交于 `8655599c`；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/role-composition/dsh-capabilities.ts` 用 `standingKeyFor`、`skills.list/get`、资源 SHA 与 300000ms descriptor 替代 `validateSharedRoleCapabilities` 和 parent preflight；新增 `plugin/src/role-composition/resource-binding.ts`；更新 `plugin/tests/unit/role-composition/dsh-capabilities.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. 新增 resource-binding.ts::resolveResourceBinding(input:{packageRoot:string;definition:MeetingAgentDefinition;agentOptions:EffectiveAgentOptions}):Promise<ResourceBinding>；新增 dsh-capabilities.ts::preflightMeetingIdentity(input:{ctx:Context;cwd:string;packageRoot:string;meetingId:string;identityId:string;sessionId:string;definition:MeetingAgentDefinition;binding:AgentDefinitionBinding;agentOptions:EffectiveAgentOptions;now:number;signal:AbortSignal}):Promise<PreflightIdentityResult>。ready 分支为 {kind:"ready",descriptor:PreparedDescriptor}，rejected 为 {kind:"rejected",error:RoleError,missing:MissingCapability[]}。删除旧 parent 参数；initial 与 dynamic 均调用此函数。哈希、symlink 拒绝、全目录指纹及精确 list/get 按正式接口。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project host tests/unit/role-composition/dsh-capabilities.spec.ts
```

PASS：所有命令退出 0；七角色精确 list/get、额外/缺失/覆盖/错 hash/symlink/过期均在 Session 创建前拒绝。失败不得改为只检查 required subset
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T6：创建与 ownership 原子提交

前置状态：T5 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/repository/meeting-repository-port.ts`、`plugin/src/repository/domain/domain-meeting-repository-core.ts` 的 `create/recordSessionOwnership/completeCreate/updateBootstrap` 按正式原子顺序及 CAS 转换；更新 `plugin/tests/contract/domain-meeting-repository-facts.spec.ts` 和 `plugin/tests/recovery/sqlite-meeting-recovery.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. 将 recordSessionOwnership(input:SessionOwnershipInput,now:number,descriptor?:PreparedDescriptor):Promise<SessionOwnership> 按正式契约增加第三参数，在 Repository 串行事务内先读取当前 ownership、比较全部 immutable 字段、验证单向状态转换再写；这就是 CAS，不增加第二个锁或 store。completeCreate 原子发布；初始失败必须含尚未创建 Session 的七条 ownership 一并撤权。provisioning 被撤权后允许关闭，禁止绕过 revoked 直接 closed。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/domain-meeting-repository-facts.spec.ts
pnpm --dir plugin exec vitest run --project recovery tests/recovery/sqlite-meeting-recovery.spec.ts
```

PASS：所有命令退出 0；七项 provisioning 与来源一同持久、同值重放、冲突拒绝、全 active 才 ready、失败先 revoke，冷重开结果相同。失败保留旧持久库原样，不运行外部 DSH
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T7：平级 Session owner

前置状态：T6 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/index.ts` 的 apply 装配及 `plugin/src/runtime/meeting-lifecycle.ts` 的 application options（只新增必填 rolePackageRoot 并透传）；新建 `plugin/src/dsh/meeting-agent-owner.ts::MeetingAgentOwner`，由 `plugin/src/dsh/index.ts` 导出，按专项设计固定方法及 purpose 切换；新增 `plugin/tests/unit/dsh/meeting-agent-owner.spec.ts` 与 `plugin/tests/integration/dsh/meeting-agent-owner.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. 新增 createMeetingAgentOwner(input:{ctx:Context;packageRoot:string}):MeetingAgentOwner；静态资源根由插件入口的 new URL("../",import.meta.url) 定位并注入；完整签名、purpose 切换、suspend 和并发串行规则以专项设计为准。create 只允许已登记 provisioning；setup 失败释放未发布 scope。delivery 恢复先 dispose 受限 handle 再恢复同一 Session，不能复用残留 allow:[] 的 scope；不可将 active/revoked 的旧传参当作当前权限。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project host tests/unit/dsh/meeting-agent-owner.spec.ts
pnpm --dir plugin exec vitest run --project integration tests/integration/dsh/meeting-agent-owner.spec.ts
```

PASS：所有命令退出 0；create/resume 的 unpublished setup、每角色 AGENTS/Skill/toolFilter、handle 私有所有权、provisioning/cleanup 禁工具、flush false、裸 Agent 拒收养逐项通过。失败 dispose 本步测试 handle，不变更 Repository ownership
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T8：初始七身份创建

前置状态：T7 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/runtime/meeting-runtime.ts::createMeetingCreationCoordinator` 与 `plugin/src/runtime/meeting-lifecycle.ts::activateTargetMeetingApplication` 以七份预检→creating record→owner.create→逐份 CAS→ready 替换 Captain child；从 `plugin/src/runtime/application-service/meeting-command.ts::MeetingCommandExecutionContext` 移除 `captainParent`，创建改收可信用户来源，`onMeetingCreated` 回调仅传 meetingId；更新 `plugin/tests/integration/dsh/session-adapter.spec.ts` 为 `meeting-creation.spec.ts`、`plugin/tests/unit/runtime/meeting-lifecycle.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. create 分支先接受可信 loopback 用户来源并构造 creator（无 sourceSessionId），移除对 captainParent 的前置要求；七份预检全部通过才创建记录；顺序创建并 CAS，completeCreate 后才逐个 resume(purpose:"delivery") 并调度初始 outbox。ready 后 resume 失败留 ready/retry，不把已经提交的创建结果倒改 creation_failed；ready 前失败原子 revoke 后 stop。来源不进入 Domain identity。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project integration tests/integration/dsh/meeting-creation.spec.ts
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-lifecycle.spec.ts
```

PASS：所有命令退出 0；七 distinct Session，无 parent，任一点失败 creation_failed 且全撤权/仅关闭本 Meeting，输入 Session 关闭仍保留七 handle。失败先走 revoke/stop，不重挂旧 child
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T9：动态 Contributor 准入

前置状态：T8 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/runtime/application-service/meeting-identity.ts::createMeetingIdentityEffectHandler`、`plugin/src/domain/{meeting-state.ts,validations/meeting-state-schema.ts,transitions/meeting-identity.ts}`、`plugin/tests/contract/meeting-identity-protocol.spec.ts`，以及 `plugin/src/runtime/services/meeting-identity-provision.ts::provisionMeetingIdentity` 与 `plugin/src/runtime/meeting-lifecycle.ts::createIdentityProvisionOwner` 按 intent 的稳定 identityId/sessionId/Definition/资源创建，`record_identity_admission_result` 在 active ownership 后追加身份；更新 `plugin/tests/contract/meeting-identity-provision.spec.ts`、`plugin/tests/integration/dsh/meeting-identity-admission.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. 将 plugin/src/domain/meeting-state.ts、plugin/src/domain/validations/meeting-state-schema.ts、plugin/src/protocol/meeting-identity.ts 中准入 intent 的 childSessionId 唯一改为 sessionId（其他字段按正式准入契约），同步 plugin/tests/contract/meeting-identity-protocol.spec.ts。预检/创建/CAS 后提交 admission_result，提交成功才 resume delivery；业务失败先 revoke 再清理。重放已有结果，不刷新 descriptorHash 或分配替代 Session。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-provision.spec.ts
pnpm --dir plugin exec vitest run --project integration tests/integration/dsh/meeting-identity-admission.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-protocol.spec.ts
```

PASS：所有命令退出 0；reject 零 Session、admit 前零 authority、同 payload 重放、不同行为冲突、跨 Agenda 复用、终态后不激活。失败记 failed 并撤权，不新分配 sessionId
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T10：持久化消息投递

前置状态：T9 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/runtime/meeting-lifecycle.ts::createTargetMeetingEffectDispatcher` 去除 parent 依赖；`plugin/src/runtime/services/meeting-notice-dispatch.ts::createMeetingNoticeDispatcher`、`evidence-review-dispatch.ts::{createEvidenceReviewDispatcher,createReviewDeliveryDispatcher}` 均以 owner.deliver + pre/post authorize + flush 接线；更新 `plugin/tests/{unit/runtime,integration/dsh}/{meeting-notice-dispatch,evidence-review-dispatch}.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. dispatcher 按上方固定 effect 表路由；owner.resume delivery 只在 preauthorize 通过后，owner.deliver 再做 pre/post 检查。任何版本变化均重新检查引用与 lifecycle，不机械拒绝所有版本变化；暂停/撤权时保留待处理 effect。Reviewer worker 保持原 outputSchema 与 claim 去重。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-notice-dispatch.spec.ts tests/unit/runtime/evidence-review-dispatch.spec.ts
pnpm --dir plugin exec vitest run --project integration tests/integration/dsh/meeting-notice-dispatch.spec.ts tests/integration/dsh/evidence-review-dispatch.spec.ts
```

PASS：所有命令退出 0；六种 notice、review request 与 review delivery 各有授权投递，flush false/崩溃窗口重试，不跨 Meeting，用户输入 Session 关闭不阻塞。已有 effect Schema 与代码不符时 STOP，先核对正式接口
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T11：暂停与冷恢复及归档清理

前置状态：T10 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/runtime/services/meeting-archive.ts::createMeetingArchiveDispatcher`、`meeting-recovery-service.ts::createMeetingRehydrationService`、`plugin/src/runtime/meeting-lifecycle.ts::recoverTargetMeetingDeliveries` 按原资源/options resume、pause cancel、终态先 revoke 后 stop；更新 `plugin/tests/unit/runtime/meeting-archive.spec.ts`、`plugin/tests/recovery/meeting-identity.spec.ts`、`plugin/tests/recovery/sqlite-meeting-recovery.spec.ts`。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. RecoverableMeeting 删除 parent，creator 只从 bootstrap 读取且不参与 Session 鉴权；reconcile 回调改 Promise<void> 并持有 MeetingAgentOwner。pause 提交后停止调度并 owner.suspend；resume 只恢复同一 sessionId。冷启动必须遍历 creating/creation_failed 记录进行恢复或撤权清理，不能沿用当前提前 return 把半身份遗留。过期未激活 descriptor 走失败撤权，active 绑定恢复不受原预检 TTL 限制。归档撤权在 stop 前落盘。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-archive.spec.ts
pnpm --dir plugin exec vitest run --project recovery tests/recovery/meeting-identity.spec.ts tests/recovery/sqlite-meeting-recovery.spec.ts
```

PASS：所有命令退出 0；失资源/错 header/错 owner 拒恢复，archiving 失败可重试，已撤权零 Meeting authority，别的 Meeting/用户输入 Session 未关闭
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T12：十种 Captain 协议动作

前置状态：T11 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/protocol/meeting-command.ts::MeetingActionSchema`、`plugin/src/protocol/index.ts` 增十个 Captain action；`plugin/tests/contract/meeting-command.spec.ts` 覆盖每个唯一 kind、字段、expected version、非法输入。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. 按上方 action 表逐个定义精确 Schema（未知普通字段沿 Wire Conventions 忽略，禁止字段用显式 Schema 拒绝；不改变现有 unknown-field 政策）；条件字段 superseded/promoted 必填，revoked/其它分支禁止。CreateMeetingActionSchema 的 initialIdentity.roles 同步删除 captain；复用现有 envelope 和 protocolVersion，不添加第二条命令协议。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-command.spec.ts
```

PASS：所有命令退出 0；十 action 精确解析、无包装 json、错误结构零进入 Runtime；local/system action 未变
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T13：领域外部控制 actor

前置状态：T12 PASS；使用上述已固定的正式数据与调用链。
允许修改：`plugin/src/domain/meeting-state-transitions.ts`、`plugin/src/domain/transitions/{round,outcome,meeting-archive}.ts`、`plugin/src/domain/meeting-state.ts`、`plugin/src/domain/validations/meeting-state-schema.ts` 接受脱敏 `captain_user` actor 并保留 Contributor-only 贡献；更新 `plugin/tests/unit/domain/{meeting-state-transitions-questions,meeting-state-transitions-issues,meeting-archive}.spec.ts`，新增 `plugin/tests/unit/domain/captain-control.spec.ts`，同步 `plugin/tests/unit/domain/meeting-state-transitions-lifecycle.spec.ts` 的用户 actor 与系统归档断言。
禁止修改：本步以外的业务语义；旧资源删除留到 T20，人工环境始终禁止改动。

执行：

1. Domain actor union 增 captain_user；所有 Captain-only 检查只认该分支，删除 MeetingRole.captain。保留 manager/contributor/reviewer 规则；旧 local 用户 actor 转为 captain_user，系统归档仍由 system actor 执行。按上方十行 transition 映射及正式前置编写成功、非法状态、stale/terminal、贡献拒绝用例；Archive controlActorProvenance 必须恰含一项脱敏 Captain，identityProvenance 无 Captain。
2. 在本步列出的测试文件中加入下述可观察断言，再实现生产接线；固定字段同步仅限前述机械规则。

验证：

```bash
pnpm --dir plugin exec vitest run --project host tests/unit/domain/meeting-state-transitions-questions.spec.ts tests/unit/domain/meeting-state-transitions-issues.spec.ts tests/unit/domain/meeting-archive.spec.ts tests/unit/domain/captain-control.spec.ts tests/unit/domain/meeting-state-transitions-lifecycle.spec.ts
```

PASS：所有命令退出 0；十项状态/反例、deferred、stale/terminal、贡献排除、脱敏 archive 通过
STOP：任一断言失败、指定契约不符或必须引入未列出的行为；按执行者契约报告证据，不放宽断言。
失败恢复：保留本步差异并修正同一范围；测试创建的 handle 由测试 finally 释放，临时 Repository 关闭，不回滚用户文件或已经提交的 Meeting 事实。

### T14：可信用户入口鉴权

前置状态：T13 PASS。
允许修改：`plugin/src/runtime/meeting-lifecycle.ts::resolveCallerScope`、`plugin/src/runtime/application-service/meeting-command.ts::{ResolvedCallerScope,validScope,authorizedRole,executeExistingMeeting}`；新增 `plugin/tests/contract/captain-command.spec.ts`。
禁止修改：Agent 代理用户授权、账户/token 系统、Session 权限锁。

执行：

1. 把 local scope 统一为 captain 用户 scope：仅 loopback_remote + local-controller + 无 sessionBindingId；DSH 请求只接受 active MeetingIdentity。创建特例在分配 meetingId 前检查同一来源，creator 固定用户记录，sourceSessionId 缺席。
2. 用户白名单为 create、十项控制及 pause/resume/end；start_archive/record_archive_session_result 保持 runtime_recovery。Domain 用户控制使用 captain_user，系统控制仍用系统 actor。授权必须先于 receipt 重放。
3. 本步先以 scope/authorization 测试固定允许矩阵与非法来源零副作用；十 action 的真实成功事务在 T15 验证。用户更换/关闭 Session 或重连不影响来源判定；Agent 即使 principal 文本伪装 local-controller 也因 channel 被拒绝。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/captain-command.spec.ts
```

PASS：来源矩阵全部通过，伪造 Session/role/来源无权，用户无需任何 live Agent。
STOP：使用 exec.agent 证明用户授权，或来源字段可由 wire 控制。
失败恢复：保留差异，只修本步授权；临时库关闭。

### T15：十项控制的统一事务与事实

前置状态：T14 PASS，协议与 Domain 已接受十项 action。
允许修改：`plugin/src/runtime/application-service/meeting-command.ts::{runMeetingActionTransition,buildRepositoryCommand,executeExistingMeeting}`、`plugin/tests/contract/captain-command.spec.ts`、`plugin/tests/contract/domain-meeting-repository-facts.spec.ts`。
禁止修改：Repository 事务抽象、Domain 前置条件、effect delivery 的成功定义。

执行：

1. 按前文十行 transition 表显式分派，使用已授权 captainActorId；领域业务 ID 与 committed fact ID 分别生成，now 每命令读取一次。
2. `resolve_question`/`dispose_issue` 透传领域 disposition payload；其余控制保持 references payload。receipt/fact/outbox 在同一 execute 事务中提交，不在工具层补写。
3. 每项测试成功、stale version、terminal、同请求重放和不同 payload 冲突；在事务提交前注入失败并 reopen，验证零半提交；验证 supersede/revoke 的生成 ID 与不可变旧记录。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/captain-command.spec.ts tests/contract/domain-meeting-repository-facts.spec.ts
```

PASS：每次新成功控制恰一对应 fact/receipt、规定的 effect；重放不新增 ID/fact/outbox；reopen 后 payload 与状态一致。
STOP：缺少任何一项生产 case、payload 被通用 references 覆盖或本地角色越权。
失败恢复：保留文件差异，在临时库复现；不修改已提交事实消除失败。

### T16：用户 Remote 控制与 Agent 工具收敛

前置状态：T15 PASS。
允许修改：`plugin/src/remote/index.ts::ConviviumRemoteService.control`、`plugin/src/runtime/meeting-lifecycle.ts` 的 LocalMeetingWebRuntime.control、`plugin/src/tools/register-tools.ts::{registerTool,registerMeetingTools}`；`plugin/tests/contract/{remote-boundary,meeting-command-tool-registration}.spec.ts`。
禁止修改：新增 HTTP 通道、Captain DSH tools、放宽 loopback 装载约束。

执行：

1. LocalMeetingWebRuntime.control 的原三 action 白名单扩为正式十四用户 action（create + 十控制 + pause/resume/end），传固定用户 caller；create 使用新 Meeting ID 链，不能先打开 meetingId=new 的 Repository。
2. 删除 convivium_create_meeting 注册与 captainParent/onMeetingCreated(parent) 接线；保留身份工具的精确 schema。Remote.control 解析唯一 MeetingCommand，不从 payload 取用户来源。
3. 通过真实 Remote service→Runtime application 测试十四 action，非法 envelope/Agent caller/非 loopback 拒绝；工具注册表断言无 create 或十控制工具，身份工具仍存在。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/remote-boundary.spec.ts tests/contract/meeting-command-tool-registration.spec.ts
```

PASS：十四 action 生产入口完整，Agent 工具面不含用户控制，非 loopback 不注册 Remote。
STOP：只测方法存在而未验证 application 输入，或 Agent 仍可创建 Meeting。
失败恢复：释放测试 Remote scope，保留文件差异，不发送外部写请求。

### T17：用户读取、Catalog 与归档投影

前置状态：T16 PASS。
允许修改：`plugin/src/runtime/services/meeting-identity-read.ts::createMeetingIdentityReader`、`plugin/src/dsh/meeting-role-catalog.ts::{ReadCatalogRequest,readMeetingRoleCatalog}`、`plugin/src/runtime/application-service/meeting-command.ts::prepareIdentityCatalog`、`plugin/src/runtime/meeting-lifecycle.ts` 的 local read、`plugin/src/projection/meeting-view.ts::{MeetingProjectionCaller,allowedControls,projectMeetingView,projectArchiveView}`、`plugin/src/protocol/meeting-view.ts::AllowedControlSchema`；`plugin/tests/contract/meeting-identity-view.spec.ts`、`plugin/tests/unit/runtime/meeting-identity-read.spec.ts`、`plugin/tests/unit/domain/meeting-archive.spec.ts`。
禁止修改：公开 creator/Session/options/资源和赋予 Agent 用户完整视图。

执行：

1. loopback read 的 projection caller 固定 kind=captain；合并旧 local/captain 的同一用户视图逻辑，Agent read 无 Captain fallback。保留用户全部既有可见证据与 candidate/risk/归档审计，不因合并丢失 local 可见内容。
2. Catalog 请求删除 captainSessionId 参数，仅 meetingId/managerSessionId；Manager 已有 active ownership 授权保持，目录候选 roles 删除 captain。调用 readMeetingRoleCatalog(port,meetingId,managerSessionId)，由 Runtime 已验证的 Manager Session 提供，不能从用户 Session 推导。
3. controls 输出正式用户十四 action 中针对当前状态可提交的既有 Meeting 操作；create 只在列表入口。每个 action 的状态/目标前提按 Domain 既有判定，controls 不授予权限。测试用户 read 零 receipt、Agent 隐私过滤、私有来源不外泄、controlActorProvenance 完整。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-view.spec.ts
pnpm --dir plugin exec vitest run --project host tests/unit/runtime/meeting-identity-read.spec.ts tests/unit/domain/meeting-archive.spec.ts
```

PASS：用户无需 Session 读取，Agent 仍按 ownership 隔离，Catalog 不依赖输入 Session，归档只含脱敏 actor。
STOP：用户来源泄漏或把所有 caller 退化为用户视图。
失败恢复：只修投影/read/Catalog 与测试，不改领域事实。

### T18：用户创建和结构化控制表单

前置状态：T17 PASS；MO-FR-11 已明确用户面板控制范围。
允许修改：新建 `plugin/src/client/meeting-create-form.tsx::MeetingCreateForm`、`plugin/src/client/meeting-user-controls.tsx::MeetingUserControls`；`plugin/src/client/{meeting-panel.tsx,meeting-panel-layout.tsx,meeting-client.ts,locales.ts}`；新增 `plugin/tests/client/meeting-user-controls.client.spec.tsx`，更新 `plugin/tests/client/{meeting-panel-local-controls,meeting-client}.client.spec.ts`。
禁止修改：自动自然语言提交、任意 json 编辑器、领域默认值猜测、模型权限或业务状态缓存。

执行：

1. MeetingCreateForm props 为 `{client:MeetingClient;disabled:boolean;onCreated:(meetingId:string)=>void}`；创建表单按 CreateMeeting 的 objective、七角色身份/责任、initialAgenda、limits 和可选 continuation 分组。七角色 Definition ID/version 固定目标表；identityKey 用户可见且可编辑，manager/reviewer key 来自用户选定的对应行；所有必需业务字段显式填写，重复/引用错误在提交前展示。
2. MeetingUserControls props 为 `{client:MeetingClient;view:MeetingView;disabled:boolean;onCommitted:()=>void}`。十控制逐 action 实现具名字段表单：目标 ID 从当前 view 的对应集合选择，reason/rationale 为文本、evidence/decision ID 为多选；枚举使用 select；promotedAgenda/replacement 仅对应分支显示并必填。保留现有 pause/resume/end 字段与行为。不得由用户编辑 actor/Session/expected version。
3. requestId 用 crypto.randomUUID，在一次用户提交时创建并保存原 payload；网络不确定时仅用户显式“重试本次提交”复用该 ID，改变内容生成新 ID。版本来自当前完整 view；VERSION_CONFLICT 重新读取并展示冲突，不自动重试。断线、不完整 view 或在途提交禁写，成功重新 list/read 并显示已提交结果。
4. Client 测试覆盖创建成功与必填/引用失败；十项 action 各一次正确 payload、条件字段与错误反馈；双击不重复提交、网络不确定重试 ID 不变、改内容 ID 改变、stale 补读、断线禁写。UI 文本沿 locales 中现有语言集合补齐。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/meeting-user-controls.client.spec.tsx tests/client/meeting-panel-local-controls.client.spec.ts tests/client/meeting-client.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：表单能提交十四项用户 action，协议字段与错误路径断言通过，身份/权限字段不可编辑。
STOP：必需 objective/引用靠猜测填充、使用 Agent tool 执行控制或弱化断线禁写。
失败恢复：仅修表单/Client 测试，释放 jsdom 资源；不操作人工 Host。

### T19：替换旧冒烟探针并增加平级场景

前置状态：T18 PASS；自动冒烟仍只使用临时 profile。
允许修改：`plugin/scripts/smoke-profile/{index.mjs,result.mjs,probe/index.js,probe/support.js,probe/scenarios/identity-admission.js,probe/scenarios/meeting-business-loop.js}`；新增 `plugin/scripts/smoke-profile/probe/scenarios/peer-meeting-agents.js`；新增 `plugin/tests/contract/peer-smoke-result.spec.ts`。
禁止修改：人工环境、旧场景业务门槛、使用伪造外部结果替代真实模型/来源调用。

执行：

1. 三个场景的创建/用户控制统一改用真实 Remote.control，删除 Agent create tool 调用，既有权限断言从 Session 绑定改为用户/Agent 来源隔离。identity-admission 探针改为稳定 identityId→sessionId→ownership 平级准入；business-loop 改为 owner 恢复，保留四轮/八审核等已有断言。然后删除 probe/index.js 的 `resumeParticipantForProbe` 与 Captain parent 接线。
2. 新场景通过正式用户 Remote create/read/control 和真实 Loader 的 services 观察七份装配。以 `https://github.com/deepseek-ai/deepseek-harness` 固定 tag `dsh-v0.1.2-rc.1` 和 `https://arxiv.org/abs/1706.03762v7` 为只读验收输入；研究 Agent 实际查询/读取后提交带来源证据，Reviewer 跑一次真实 worker，拒绝将预置 URL 原样回显视为读取证据。probe 校验工具执行成功记录及提交 EvidenceVersion 的来源引用一致。
3. 记录七 Session/preset/Skill、真实 Review、输入 Session 关闭后投递与控制/用户重连/Agent 冒充拒绝以及 Host 冷恢复。冷恢复前 flush 持久化并释放旧 Host；新 Host 使用同一临时数据库和原资源/options，不能仅清空内存 Map 模拟进程重启。
4. 把场景加入 `SMOKE_SCENARIOS`/`CORE_SCENARIOS`，`validateScenarioResult` 按专项设计 Acceptance 的精确 JSON 校验 observed。新 contract 测试逐个篡改 Session 重复、Preset、Skill、来源、review、userControl booleans、coldRecovery，必须拒绝；真实 Host 执行留到 T21。

验证：

```bash
pnpm --dir plugin exec vitest run --project contract tests/contract/peer-smoke-result.spec.ts
node --check plugin/scripts/smoke-profile/probe/scenarios/peer-meeting-agents.js
```

PASS：结果 validator 的正反例全通过；旧 probe 无 child 依赖且原业务断言保留。
STOP：旧业务场景只能靠降低断言跑通，或来源/模型能力缺失却伪造 ok:true。
失败恢复：保留 probe 差异；仅清理测试自己创建的临时环境，真实外部调用尚未执行。

### T20：删除被替换的旧实现与发行资源

前置状态：前述全部聚焦门禁 PASS，目标调用链已有替代；本步属于用户要求的旧代码清除范围。
允许修改：下列精确删除清单、`plugin/src/dsh/{index.ts,labels.ts,caller-resolver.ts}`、`plugin/src/repository/{meeting-repository-port.ts,domain/domain-meeting-repository-core.ts}`、`plugin/scripts/{verify-agent-definition-samples.mjs,verify-package.mjs}`、`plugin/tests/contract/meeting-roles-deployment.spec.ts`、`plugin/tests/unit/dsh/{labels,caller-resolver}.spec.ts`；前面步骤列出的生产文件中仅删除已不可达旧调用/导入。
禁止修改：Reviewer one-shot worker、`@deepseek-ai/dsh-subagent` 依赖、用户数据库、DSH 持久 Session 日志。

执行：

1. 删除旧发行目录 `plugin/config/presets/convivium/`（仅含 preset.yml、agent.cordis.yml 与其 skills 下七角色 Skill）；七旧能力为 meeting-management、domain-architecture、dsh-runtime-engineering、protocol-ui-engineering、verification-review、github-source-research、arxiv-paper-analysis。
2. 删除 `plugin/src/dsh/session-adapter.ts`、`session-ownership.ts`、`meeting-identity-admission.ts`、`provisioning.ts`；删除已由 owner/creation 测试覆盖的 `plugin/tests/unit/dsh/session-adapter.spec.ts`、`provisioning.spec.ts`。T8 已将 integration/dsh/session-adapter.spec.ts 改名为 meeting-creation.spec.ts，不保留旧副本。
3. labels.ts 删除 ManagerSessionLabel/ParticipantSessionLabel/MeetingSessionLabel 及其 encode/decode，只保留目标 MeetingIdentitySessionLabel；caller-resolver.ts 删除 resolveLabeledMeetingCaller，resolveMeetingCaller 使用新 ownership。Repository 删除 replaceMissingSession 接口/实现；Runtime 删除 rebindCaptainParent，禁止替代 Session 身份继承。
4. 两个 verifier 和 deployment test 使用七 Preset、七 AGENTS、五 Skills 的目标闭集；打包必须含全部引用文件，不能靠容许未知资产保留旧方案。保留 Reviewer worker 的真实 one-shot parent 参数；下列旧会议生命周期专用关键词则要求零命中（不设模糊例外）。

验证：

```bash
rg -n -e startContinuable -e sendMessage -e listChildren -e listDescendants -e drainContinuableChildren -e parentSessionId -e childSessionId -e captainParent -e rebindCaptainParent -e validateSharedRoleCapabilities -e replaceMissingSession plugin/src plugin/config plugin/scripts/smoke-profile/probe
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-roles-target.spec.ts tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir plugin exec vitest run --project host tests/unit/dsh/labels.spec.ts tests/unit/dsh/caller-resolver.spec.ts
pnpm --dir plugin build
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin verify:package
```

PASS：rg 无输出且退出 1（零命中），其余命令退出 0；删除清单路径不存在，Reviewer worker 的 spawn/固定 schema 仍存在且后续全验证覆盖。
STOP：rg 退出 2、任何旧会议入口残留或清除触及 one-shot worker；不添加搜索排除隐藏旧代码。
失败恢复：按本步开始时的差异恢复误删文件；保留前序用户/任务改动，重新验证后才能继续。

### T21：完整回归与真实 DSH 验收

前置状态：T20 PASS，真实 DSH 模型与网络凭据由现有临时 profile 配置提供，不复制到结果或文档。
允许修改：仅前述步骤已列文件中的缺陷修复；修复须重跑对应步骤再回到本步。不得增加新功能。
禁止修改：省略场景、降低输出校验、启动人工 Web Host、写入外部 GitHub/arXiv。

执行：

1. 运行全包验证，确保迁移后的所有旧业务断言与目标聚焦测试同时成立。
2. 执行全部自动 profile 场景，保存无凭据的 JSON 结果与命令退出码；必须包含 identity-admission、meeting-business-loop、peer-meeting-agents 三场景及专项设计全部 observed 条件。
3. 确认临时 Host/handles 释放，人工环境路径未写入。外部服务不可用时本步 STOP/Not Covered，不用 unit mock 替代。

验证：

```bash
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile --all --json
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：全部退出 0，三个场景完整通过；十用户控制的协议/事务/投影测试均在 verify 内执行，真实场景另证明模型/Loader/来源调用。
STOP：任一缺失、失败或真实外部 lane 未执行；局部 PASS 不等于 MO-FR-14 完成。
失败恢复：停止临时 Host，保留失败结果；不清空旧数据库重跑以掩盖恢复失败，不改变原 Meeting 身份绑定。

### T22：迁移覆盖证据与稳定操作文档

前置状态：T21 PASS，逐步骤输出可追溯。
允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/50-operations/HOW-TO-MEETING-ROLES.md`；本次已列 requirements/interfaces/designs 仅同步与执行结果一致的实现入口，不改变目标语义。
禁止修改：将未实现的 MeetingTask/session_mail、人工 Browser 验收或跨 Host 宣称通过。

执行：

1. readiness 的 MO-FR-14 项记录执行日期、分支/commit 与工作树范围、DSH 版本、命令、聚焦/全验证/真实 profile 结果及 observed 摘要；分别记录 用户十控制和七角色隔离证据。
2. 操作文档替换旧共享 Preset/角色 Skill/child 配置，指向七角色独立资源、输入 Session 无关的用户控制和资源不匹配失败处置；旧 v1 拒读，不指导迁移或删除用户持久环境。
3. 维持明确 Not Covered：人工 Web/Browser、跨 Host、未接通的 MeetingTask/session_mail。当前范围有任何未覆盖项不得进入 T23。

验证：

```bash
pnpm --dir plugin exec prettier ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md ../docs/50-operations/HOW-TO-MEETING-ROLES.md --check
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：检查退出 0；下面矩阵每个 scope 行都有实际证据，长期说明不依赖临时 RUNBOOK。
STOP：证据仅证明旧代码、未运行的检查被写为 PASS、长期文档仍要求 Captain 常驻。
失败恢复：仅修文档，不补造运行结果；有证据缺口回到对应步骤。

### T23：删除临时 RUNBOOK

前置状态：T22 PASS，T0–T22 全部证据已迁移；用户已要求执行并收口本 RUNBOOK。当前文档编写任务不执行此步。
允许修改：删除本文件，以及执行下列 rg 找到的仅为导航本文件而存在的链接文字。
禁止修改：正式语义、证据、产品文件和 Git 历史。

执行：

1. 先运行 rg 保存引用清单和本文件可恢复副本；引用承载唯一语义时 STOP，先迁移到长期文档。
2. 删除本文件和纯导航引用；运行删除后检查。任一失败恢复本文件与引用并停止，不留 completed/archive 版 RUNBOOK。

验证：

```bash
rg -n 'RUNBOOK-PEER-MEETING-AGENTS|RUNBOOK: Peer Meeting Agents' docs AGENTS.md
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：删除前引用清单已记录；删除后 rg 零命中（退出 1），链接与 diff 检查退出 0，readiness 保留全部验收证据。
STOP：scope/gate 未全通过、存在未迁移唯一内容或删除后检查失败。
失败恢复：恢复刚保存的 RUNBOOK/引用；不 reset 其他文件、不自动提交。

## 验证矩阵与追踪

| 已确认范围 / 正式依据                                              | 步骤与生产入口                                                        | 必需证据与预期结果                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| MO-FR-14；DSH Role Interface 的资源、Definition                    | T1/T2/T3/T5；role-composition parser/preflight                        | role-composition 与 meeting-roles-target 测试：七角色精确装配，额外/缺失/错资源/过期拒绝且零 Session；T21 真实 list/get |
| MO-FR-2/14；Ownership 原子边界                                     | T4/T6/T7/T8；Repository create/CAS 与 owner                           | facts/recovery/owner/creation 测试：七 distinct、同值重放、payload 冲突、部分失败全撤权，旧 v1 拒读；T21 真实 Loader    |
| 动态普通身份准入；DSH Role Interface                               | T9；provisionMeetingIdentity                                          | provision/admission/protocol：reject 零 Session、admit 前无权限、失败清理、原 ID 重放、跨 Agenda 复用                   |
| 正式 notice/review 投递；Meeting Interface Persistence And Effects | T10；三 dispatcher 与 owner.deliver                                   | notice/review tests：pre/post 授权、flush false 和两个崩溃窗口保留 retry；同 deliveryId 可重复但事实不重复              |
| pause/终态/恢复；Peer Design                                       | T11；rehydration/archive/suspend/stop                                 | recovery/archive：原绑定恢复、错资源拒绝、撤权优先、暂停不关身份、其他 Meeting 不受影响；T21 冷 Host                    |
| 十 Captain 控制；Meeting Interface Captain Control Surface         | T12–T18；protocol→Remote→scope→transition→execute→projection→用户表单 | 每 action 成功/非法输入/来源拒绝/stale/终态/重放/冲突/事务回滚；Question/Issue disposition 与 archive provenance 完整   |
| 废弃旧方案；MO-FR-14                                               | T19/T20；probe、旧代码与资产删除                                      | 零旧生命周期关键词、目标资产闭集、build/package；旧业务场景通过条件保留                                                 |
| 完整交付                                                           | T21–T23                                                               | verify 与三个真实 profile 全 PASS；readiness/operations 迁移，删除后链接通过                                            |

全部 scope 汇总以 T21 的 `verify` 与 `smoke:profile --all --json` 为完整门禁；选择依据是跨身份授权、持久化恢复与真实模型/工具组合同时变化。已执行的聚焦验证见文末记录；完整回归与真实外部 lane 尚未通过，不能从局部 PASS 推断产品可用。

Not Applicable：旧数据迁移（正式契约拒读 v1）、实验 Teams、跨 Host 和外部发布均不在范围；MeetingTask/session_mail 生产能力及人工 Browser 仍由 readiness 记录 Not Covered。七角色不开放直接互发工具；Reviewer 的 one-shot subagent 明确保留。

## 作者审计记录（2026-09-25）

结论：Not Executable。此前标记过早；结构和路径检查不能代替完整逐步 dry run，必须继续核对每一步是否仅依赖此前已完成的接口、所有直接调用点是否包含在允许修改范围，以及聚焦测试是否能在该步状态下运行。用户已确认 Captain 为用户控制身份；原 Session 授权限制已从正式需求、接口、设计和本 RUNBOOK 移除。原 24 个步骤均具备前置状态、允许/禁止范围、执行动作、固定命令、PASS/STOP 与失败恢复；新增文件和接口有唯一落点，旧代码删除在替代链聚焦通过之后，最终删除 RUNBOOK 在完整验证和证据迁移之后。

本轮只修改文档。已执行本地文件链接检查、修改文档的锚点核对、24 步结构/路径检查、Prettier 与 diff whitespace 检查；未执行产品测试、构建、真实 Loader/profile 或人工 Browser，以上未来验收不得记为 PASS。readiness 继续区分当前旧实现与目标未实现范围。

## 执行记录（2026-09-25）

- 用户授权边执行边修复步骤、依赖和接线缺口；产品范围仍以正式需求和接口为准。
- T0 PASS：基线 b2822a3d，工作区干净，分支和 DSH 版本符合；verify 全通过（88 文件、735 测试），文档链接 501/0，diff 检查通过。
- T1 修订：删除不存在的“本步列出的测试文件”要求；本步仅创建七 AGENTS 和五能力 SKILL，行为装配在 T2/T3 验证。

- T1 PASS：七 AGENTS 和五能力 Skill 内容/格式核对通过。
- T2 PASS：Definition/模型绑定聚焦测试 2 文件、29 测试；已观察新身份格式拒绝和模型快照失败后修复。旧 runtime 接线在 T8 迁移，中间全包不可发布。
- T3 修订：DSH scanRoot 按 PRESET_ID 正则跳过点号/下划线目录，Preset ID 与目录统一使用 convivium-<role 去掉 meeting_ 前缀后的连字符形式>；Definition ID 保持原值。

- 用户命名修订：Preset 使用 convivium-xxxx，Manager 为 convivium-manager；资源根改为 plugin/config，同步安装/启动/打包及测试资源路径。
- T3 PASS：发行装配测试通过（实际 YAML 插值与精确 Skill 目录），未宣称真实 Loader 验收。
- T4 修订：v2 projection 编解码位于 repository/domain/projection.ts，而非 meeting-state-codec.ts；本步同步该入口。T4 PASS：9 项私有 Schema/codec 测试通过，完整 Repository 行为待 T6。

- 小步提交：`babc248a` 迁移 config 资源路径；`acd44e46` 分离身份与能力资源；`dcaa3a82` 固定身份引用和模型绑定契约；`388e7823` 装配七个独立 Preset。T2/T3 复验共 3 文件、30 测试通过。
- 后续实现仍在进行：T5 预检聚焦测试 8 项通过；T6 Repository facts 与 SQLite recovery 共 10 项通过，状态转换边界仍待核对；T7 owner 单元测试 4 项通过，真实工厂集成和 Runtime 注入未完成。以上不等于 T6/T7 整步 PASS。
- 当前 Host typecheck 未通过：旧 Runtime、Session adapter 和投递服务仍引用旧 ownership/parent 字段及已替换的接口。整体验证与真实 profile 为 Not Covered；当前分支属于不可发布的迁移中间状态。

- 后续小步提交：`8655599c` 为 T4 私有结构；`373a232a` 为角色资源预检；`4ccfe888` 为 Repository 中间实现。复验 Schema、预检、Repository facts、SQLite recovery、owner 共 5 文件、31 测试通过。
- T6 未完成核对：动态准入激活时重新检查 Meeting/intent 状态、归档关闭前撤权、初始 ownership 与领域角色一致性、旧 creation record 的版本错误映射。T7 仍缺真实工厂集成与 Runtime 注入，不能据上述单测记为整步 PASS。
- T7 直接声明现有同版 `@deepseek-ai/dsh-llm@0.1.2-rc.1`，仅用于公开 `MessageId`/`ReasoningEffortId` 构造器；允许修改 `plugin/package.json` 与 `plugin/pnpm-lock.yaml`，不升级 DSH 版本。

- T5 补证：逐七角色验证精确能力集合及 modelInvocable 拒绝，共 15 项通过；属于已有行为的保护补测，未伪称新增 RED。descriptor 过期拒绝仍由 Repository CAS/owner 创建处验证；预检负责生成固定 TTL，不接收旧 descriptor。
- T6 修复：先观察未撤权归档、初始角色错配、动态意图失效仍激活、旧 creation 格式错误分类的行为 RED，再修复；facts/recovery 共 16 项通过。真实 SQLite 验证 v1 拒读为 SCHEMA_VERSION_UNSUPPORTED，v2 畸形为 CORRUPT_DATABASE，失败后原存储字节不变。
- T6 依赖修订：允许修改 domain-meeting-repository.ts 的归档结果校验、specs.ts 的 creation 版本预检和 domain-repository-registry.ts 的 DomainError 映射；它们是撤权及旧格式拒读的实际边界。T7 增加同版开发依赖 @deepseek-ai/dsh-agent-loop-testkit，用真实工厂组合验证，不替代 T21 Loader/真实模型验收。

- T7 原生组合验证：真实 Loader/Preset、Skill filesystem、AgentLoop、Session JSONL 在临时目录中创建并恢复七角色，身份正文、能力集合、工具过滤及同 ID scope 切换通过。测试 Preset 仅装配 native Skill provider，工具为作用域测试注册项；发行全工具与真实模型仍由 T21 验证。
- T7 修复已观察 RED：发布前拒绝带 parent 的 Session；使用 owner 已注入的 skills 配合 Agent scope；创建后调用公开 sessionPersistence.ensureMaterialized 再 flush，避免空 Session 未落盘即释放。入口新增 skills/agentPresets/sessionPersistence 依赖与 rolePackageRoot 透传。owner 单元 5 项及原生组合 1 项通过。
- T7 测试依赖补全：同版 agent-loop、session-projection、session-persistence、session-persistence-jsonl、skill-filesystem，以及与已安装版本一致的 cordis-plugin-loader@1.0.3；仅 session-persistence 同时作为产品 peer 声明。T8 才把 owner 接入创建 coordinator，T10/T11 接入投递及恢复。

- T5 前置补齐：模型 route 不可用时曾错误返回 ready（已观察 RED）。预检现调用 Host llm.resolveCallConfig，校验 provider/model 与显式 reasoningEffort；入口注入 llm，owner 测试同步注册模型替身。预检与 owner 共 3 文件、22 项通过；该验证不发起真实模型请求。

- T8 第一笔：application 创建门禁改为 loopback_remote/local-controller 且无 sessionBindingId，移除 captainParent；既有 command contract 测试同步可信用户并覆盖伪造 Agent、错误 principal 和附带绑定的拒绝。先观察合法用户被旧门禁拒绝的 RED，修复后 11 项通过。允许该既有 contract 测试随 T8 修改；coordinator 与 Remote 接线尚待迁移，不能记 T8 PASS。

- T8 创建 coordinator 已替换为七份预检、原子 creating 绑定、逐份 owner 创建/CAS 与 ready 后 delivery scope 恢复；相同 Meeting 创建串行化，重放不再读取 Host 默认值。真实 Repository + owner 替身覆盖创建中第 1/4/7 个失败全撤权清理、ready 后恢复失败不回滚、预检无副作用和并发同值重放。原生工厂证据复用 T7。新增同版 agent-default-model 直接 dev/optional peer，入口注入该 Host 服务；冷恢复/实际 outbox 调度仍依赖 T10/T11 接线，T8 不记整步 PASS。

- 依赖修订：T8 的完整生产投递依赖 T10/T11，T9 Catalog 来源依赖 T17；先完成相应步骤的独立语义与聚焦测试，再在接线完成后联合复验，不把部分实现记为整步 PASS。T9 同步 application-service/meeting-command.ts 的稳定 Session ID 与 unit/domain/meeting-identity.spec.ts。
- T9 迁移动态 intent 为 sessionId，peer provision 固定 descriptor/ownership 后 create 或恢复原 Session，业务结果提交成功后才开启 delivery scope；20 项聚焦测试通过。领域字段迁移已观察 RED；provision service 改写未完整遵循测试先行，已如实保留实现并补验：临时移除提交后 activation 会令合同断言失败（1 项），恢复后再验证。Catalog 旧 parent 请求留到 T17 替换。

- T10 消息 dispatcher 改用 MeetingAgentOwner 的 resume/deliver，投递使用持久 deliveryId，pre/post 回调重新读当前 Meeting/identity/ownership；普通通知 flush false 抛出可重试错误，暂停审核请求不再直接返回成功。4 文件 26 项通过，覆盖六种 notice 与审核请求/结果；崩溃窗口 dispatcher 测试使用 owner 替身，真实 followup/flush 证据仍由 owner 与 T21 提供。统一 effect 路由已删 parent，归档 dispatcher 与冷恢复接线待 T11 完成后联合验证。

- T11 归档子链：先加入无 parent、全部撤权先于 stop、失败重试和跨会议/错误 label 拒绝测试；旧实现 3 FAIL / 1 PASS。替换为 MeetingAgentOwner.stop 后 4 PASS。归档包含已持久化的动态准入 ownership，关闭失败仍保留 revoked 状态；冷恢复与暂停子链尚未完成，T11 未整体 PASS。
- T11 冷恢复与暂停子链：7 项新恢复断言先 RED，改为逐会恢复原 ownership、creating 原 descriptor、失败撤权关闭、paused 停 worker 后 suspend、终态撤权后归档。SQLite 重开新增用例发现 creation 未保存原 createResult，已修复；completeCreate 参数收窄为 requestId/hash/authorization，其余均取原 creation record，避免冷启动重建输入。这是执行中为落实原绑定恢复补齐的 T6 接口缺口，允许范围追加 Repository port/core 与接口说明。恢复 14 项、archive/lifecycle 6 项、创建与原生 owner 8 项、Repository facts 12 项通过；端到端用户入口、Catalog 和旧接口清理仍依 T16/T17/T20 联合验收，不以聚焦通过宣称全包通过。
- T12：十种用户控制加入同一 action union，promoted/superseded 分支要求对应数据，其余分支禁止；初始身份不接受 captain。13 项新协议断言先失败，实施后本文件 24 项通过。普通未知字段仍按原 wire 规则忽略。领域与 application 接线待后续步骤。
- T13：领域用户 actor 改为 captain_user，MeetingRole 删除 captain，提案/立场/候选继续要求 Contributor；归档增加恰一项脱敏控制来源。新增控制测试观察到拒绝旧 actor 模型，再修复；本步五文件 82 项通过，改动源码聚焦 lint 通过。执行发现 CompletionFact 持久校验仍强制引用旧 Captain identity，允许范围补入 meeting-state-outcomes.ts 和纯函数 domain/control-actor.ts::captainActorIdFor（公开于 domain/index.ts）；按既定 canonical 数组 SHA 生成/校验脱敏 ID，Runtime 复用它，未加入 Session 来源。共享测试 fixture 同步移除旧角色；全包旧调用的机械迁移在 T20 联合验证。
- T14：scope 统一为 captain，校验 loopback_remote/local-controller/无 sessionBinding；DSH scope 另核对 identity principal 和持久 ownership role，禁止 Contributor 伪造 Manager。新增来源矩阵 11 FAIL / 1 PASS，修复后 12 PASS；尚不把替身 execute 返回 accepted 视为十项真实业务事务证据，T15 单独验证。
- T15：十项 action 显式映射纯 transition，统一 captainActorId；问题/风险处置保留结构化 disposition fact payload。ID 分配移入 Repository transition，使 receipt 重放不再额外消耗事实/业务 ID。真实 Repository + 故障存储替身测试覆盖十项各自 success/stale/terminal/replay/payload conflict、提交前失败重开零半提交，另验决策/完成事实 supersede 的旧记录与 ID 分离。20 项新事务断言先失败，修复后连同鉴权与 Repository facts 共 46 PASS。补出 abortRound 的现有 Domain 公共导出（未绕过模块入口）。

- T16 入口子链：删除 Agent create 工具（先观察注册断言 RED），十四用户 action 经真实 Remote/Runtime 到 application.execute 边界，固定 loopback 用户来源；5 项 Remote/工具合同与 9 项 Host 装载测试通过。为解除 Typert 生成依赖阻塞，提前执行 T17 Catalog 参数移除及 T20 已替代 Session adapter/provisioning/admission/旧 caller 导出的清理；允许范围追加 index.ts、private-mail-validation.ts 的 identityId 字段迁移、host-plugin-lifecycle.spec.ts。旧 child 创建测试由 T8 原生 owner/creation 测试替代，旧 continuable 能力门禁删除，非 loopback/延迟 provider 门禁保留。17 项 owner/caller/labels 测试及 host typecheck、Typert 生成通过；T17/T20 整步尚未完成，十四业务事务证据仍以 T15 为准。

- T17：合并 local/captain 为用户投影视图，保留私有证据、风险和候选可见性；身份视图继续过滤。新增控制按生命周期/目标存在性输出（领域仍为最终授权与业务校验），归档投影保留脱敏 controlActorProvenance；Catalog 合同测试同步移除 Captain Session 参数，允许范围补入该测试。2 项新视图断言先 RED，修复后与 Catalog 共 10 项、身份 read/归档 8 项通过。
