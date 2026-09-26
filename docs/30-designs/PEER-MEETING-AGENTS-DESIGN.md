# Peer Meeting Agents Design

## Purpose

本文固定 [MO-FR-14](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-14平级-meeting-agent-与独立能力组合) 的平级 Agent 装配、Session owner、投递、Captain 来源和恢复方案。目标接口以 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 和 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 为准。

## Scope And Non-goals

覆盖七个初始身份、动态普通 Contributor、五项能力 Skill、各角色 Preset、Meeting-owned AgentSession、outbox 投递、暂停/结束/归档/冷恢复和用户 Captain 鉴权。Reviewer 每份 EvidenceVersion 的 one-shot worker 保持 DSH Subagent。只支持 DSH `0.1.2-rc.1`、单 Host/profile 和已确认的 loopback local 权限。无 Agent Teams、直接同伴消息、跨 Host、旧 schema 迁移或自动清理人工冒烟数据。

## Responsibilities And Dependencies

角色资源按“AGENTS 说明身份与权限，Skill 说明可复用方法”分工。七份 `AGENTS.md` 分别写明自身 `roleDefinitionId`、职责、可调用的 Convivium 工具、收到 notice 后先读取当前 caller-visible Meeting View、不能代行 Captain/其他 MeetingIdentity，以及在会话恢复后继续使用原 Definition。Manager 只负责议题内计划、开轮、举手处置、发布与推荐；三个工程角色分别从领域、Runtime 和协议/UI 视角工作；GitHub 与 arXiv 研究角色负责对应来源的证据；Reviewer 从独立验证视角处理待审 version，并以专用 one-shot worker 取得结构化结果。AGENTS 不包含研究/核验步骤的重复正文，也不声称拥有 Host 尚未授予的工具。

五项 Skill 的工作方法固定为：`meeting-facilitation` 从当前目标、阻塞、职责与证据缺口形成有界计划，标明依据和停止条件；`repository-analysis` 先读正式需求/接口，再核对代码、提交、测试和反例，分开目标行为与已实现证据；`evidence-review` 针对单个版本逐主张核验来源、方法、反例、适用范围和不确定性，输出证据界限；`github` 定位 repository/ref/文件/commit/issue/PR/release，区分已合并事实、未合并提案和 fork；`arxiv` 核对 arXiv ID 与版本、方法、数据集、指标、实验结论及外推限制。各 Skill 的 frontmatter `name` 精确等于能力名且有非空 `description`；Skill 可以包含同目录 `scripts/`，加载本身不运行脚本。工具调用示例不得把 Skill 变成 Meeting authority；Reviewer 的 worker 调用顺序留在其 AGENTS，而不写成所有使用 `evidence-review` 的角色的普遍方法。

| 责任                | 唯一 owner                        | 输入与输出                                                               |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| Definition/资源目录 | `role-composition` 与包内静态资源 | 精确 Definition ID/version/hash → AGENTS/Preset/Skill 指纹               |
| 平级 Agent handle   | Runtime 的 `MeetingAgentOwner`    | `PreparedDescriptor` → `AgentHandle` 或 RoleError                        |
| Session ownership   | Meeting Repository                | Meeting/identity/session/资源/模型私有绑定；`provisioning→active→closed` |
| 用户输入来源        | Meeting Repository 私有 bootstrap | 可信用户 adapter 的 creator；仅用于审计                                  |
| Meeting 权限和事实  | application + Domain              | 可信 caller → 授权转换、receipt、fact、outbox                            |
| 公开与定向投递      | effect dispatcher                 | active ownership + outbox → DSH `followup`、flush、effect 完成           |
| Reviewer worker     | 专职 Reviewer Agent               | 单 EvidenceVersion/claim → 固定 schema one-shot 结果                     |

Domain 不依赖 DSH、文件系统或 Repository；Repository 不调用 DSH；tool/Remote 不自行产生领域权限。`MeetingAgentOwner` 位于 `plugin/src/dsh/`，只接收 Runtime 已验证的 descriptor 和 ownership。`ctx.agents.get` 不能替代 owner handle。DSH `systemPrompt.section` 的 `convivium:role-identity` 只注册当前角色 AGENTS；DSH 原生 cwd AGENTS 保留 Host 规则，不作为此角色资源的来源。Preset filesystem provider 对每个能力目录分别设置 `customSkillDirs`，严格 `includeDefaultRoots:false`。目标 DSH Web bundle 已禁用 base 的 host `skill-filesystem` 行；部署另加的 global provider 若暴露额外 Skill，setup 校验拒绝。`toolFilter` 只收窄继承工具，Runtime 仍逐调用授权。

静态发行资源根只在 `plugin/src/index.ts` 的插件入口计算：`packageRoot=fileURLToPath(new URL("../",import.meta.url))`；src/index.ts 与打包后的 lib/index.js 均定位同一 package root。入口向 `activateTargetMeetingApplication` 传入必填 `rolePackageRoot:string`，再以 `createMeetingAgentOwner({ctx,packageRoot:rolePackageRoot})` 构造 owner；preflight/资源读取共享此根。其他模块不按自身 import.meta.url 猜路径，避免打包内联改变相对层级；用户/Manager 不提供文件路径。

`MeetingAgentOwner` 在 `plugin/src/dsh/meeting-agent-owner.ts` 实现，由 `plugin/src/dsh/index.ts` 公开给 Runtime；它不读取 Meeting Repository，也不负责把 outbox 标为 delivered。其固定接口为 `create(input:{ownership:SessionOwnership;descriptor:PreparedDescriptor;definition:MeetingAgentDefinition;signal:AbortSignal}):Promise<void>`、`resume(input:{ownership:SessionOwnership;definition:MeetingAgentDefinition;purpose:"provisioning"|"delivery"|"cleanup";signal:AbortSignal}):Promise<void>`、`deliver(input:{ownership:SessionOwnership;deliveryId:string;text:string;authorize:()=>Promise<void>;signal:AbortSignal}):Promise<boolean>`、`suspend(input:{ownership:SessionOwnership;reason:string}):Promise<void>`、`stop(input:{ownership:SessionOwnership;definition:MeetingAgentDefinition;reason:string;signal:AbortSignal}):Promise<void>`、`disposeAll():Promise<void>`。内部 `Map<sessionOwnershipId,{handle:AgentHandle;purpose:"provisioning"|"delivery"|"cleanup"}>` 只保存本 owner 创建/恢复的 handle 与装配模式：同一 id+sessionId+compositionHash 的同值重入可复用，任一字段不同为 `OWNERSHIP_CONFLICT`；已有裸 live Agent 但无本 owner handle 时拒绝收养并给 `RECOVERY_UNAVAILABLE`。`create` 使用 descriptor 和 ownership 的全部同值绑定、先持久化的 provisioning 状态；`resume` 重新装载原 Definition/资源/options，`purpose="provisioning"` 仅在 Runtime 已核对相同不可调度 intent 时恢复尚未激活的 Session，`purpose="delivery"` 只允许 active 且未 revoked 的 ownership，`purpose="cleanup"` 只允许已 revoked 但未 closed 的 ownership。create 与 provisioning/cleanup resume 的 scoped setup 额外用 `tools.restrict({allow:[]})` 禁止任何 Tool，且 Runtime 的 ownership gate 拒绝其 Meeting read/command；恢复可能启动 DSH loop，不能把“无授权业务调用”误写成“绝不启动 turn”。`deliver` 先执行 `authorize`，再按 DSH Role Interface 的精确 `UserMessage` 调用 `followup`、`sessions.flush`、再次 `authorize`，返回 flush 的布尔结果；调用方仅在 `true` 时提交 delivered，`false` 时保留 retry。`stop` 只对目标 handle 执行 `agent.cancel({kind:"hook",reason})`、`agent.whenIdle()`、`handle.dispose()` 并删 Map；无 handle 时按原 ownership 以 `purpose="cleanup"` 恢复后执行，恢复失败则保持 archiving/cleanup retry，不用 `ctx.agents.get` 代替。`disposeAll` 用于 Host 停机，只释放 Map 中的 handle，不改变 Meeting ownership 或事实。

owner 公共方法之间用私有 helper 复用，不在同一串行键内递归获取锁。owner 按 ownershipId 串行执行 create/resume/deliver/suspend/stop，disposeAll 先拒绝新操作再等在途操作退出；不同 Meeting 不共用串行键。Runtime 只有在初始 `completeCreate` 已提交 ready、或动态 `record_identity_admission_result` 已提交 active 后，才可调用 `resume(purpose:"delivery")`。若 Map 中仍为 provisioning purpose，先 cancel/whenIdle/dispose 旧 scope，再以同一 sessionId 恢复 delivery scope；不得只因 ownership 已 active 而复用带 `allow:[]` 的 handle。delivery scope 保留该角色 toolFilter，移除的只是 provisioning 禁工具层。ready 后恢复失败保留原 active 绑定与重试，不倒改为 creation_failed。

`suspend` 只释放 Map 中目标 handle（cancel/whenIdle/dispose 后删除），不撤销 ownership；Map 无该 handle 时同值成功，不恢复 Session 来取消。Runtime 在 pause 状态已提交、停止调度后调用它；paused 冷启动不恢复 delivery，resume 命令提交后才按原绑定恢复。stop 的缺 handle 路径仍是已撤权 cleanup，不能使用 suspend 冒充终态撤权。scope teardown 失败保留诊断与重试，不能提前记录 closed。

PreparedDescriptor 的 TTL 只限制首次 create/激活；active ownership 的恢复按持久绑定检查，不因旧 descriptor 过期失效。provisioning 冷恢复必须取得原 descriptor（含 expiresAt）且未过期；在创建记录中与 ownership 同时持久化 `preparedDescriptors:PreparedDescriptor[]`，动态准入则在同一 ownership 提交中保存相应 descriptor，恢复结果同时返回该私有集合。过期走 PREFLIGHT_EXPIRED 的失败撤权路径，不替换 descriptorHash 或延长 TTL。清理恢复不使用过期 descriptor 授权工具。

## State And Creation Flow

1. `conviviumMeetings.control` 从 loopback Host 用户边界注入 local-controller；DSH Agent 创建调用或 payload 伪造来源立即拒绝。为 Meeting ID 与七个 identity/session/ownership 分配确定性 ID；在第一个 Session 创建前解析全部 Definition、AGENTS、Preset、Skill、Host 模型选择并核对指纹。对每个 Preset 调用 `ctx.agentPresets.standingKeyFor(id)` 后按返回 scope 校验实际 Skill `list/get`，不创建 AgentSession；创建时的 scoped setup 再次校验。
2. Repository 以一个创建入口持久化私有不可变 `creator`、初始领域状态与 `creating` bootstrap；receipt/outbox 仅在 completeCreate 发布。初始七身份尚不能执行 Meeting command；每个身份先有 `provisioning` ownership。创建来源不进入 `MeetingState.identities`，也不是 DSH parent。
3. 对每个身份调用 `MeetingAgentOwner.create`。它传精确 `sessionId`、`agentPreset`、已固化 `agentOptions` 给 `ctx.agents.create`，在 unpublished scoped setup 中 mount Preset、注册角色指令、restrict Tools、核对 Skill `list/get`；返回后再次核对 Session ID/header/资源绑定。Published Agent 在 ownership 激活前不能获得 Meeting authority 或 notice。
4. 在 Meeting 仍可创建且 descriptor/ownership 未变时，将该 ownership 原子激活。七个均 active 后，bootstrap 才从 `creating` 转 `ready` 并允许 outbox 投递。任一步失败，bootstrap 置 `creation_failed`，先 revoke 所有已登记 ownership，再取消、drain 和 dispose 已创建 handle；不能留下可调度半身份或把它们重挂 Captain。
5. Manager 的 `recommend_identity(admit)` 只提交含稳定 admissionId、identityId、sessionId 和 Definition provenance 的不可调度 intent。dispatcher 以同一 ID 预检、创建独立 Agent/ownership 后，用 `record_identity_admission_result` 原子激活身份和 recommendation；失败提交安全 RoleError。已有 active identity 跨 Agenda 复用既有 ownership，不另建 Session。

任何 DSH 创建/恢复操作均是 Repository 提交后的外部副作用；Agent 发布与 Meeting CAS 之间无法做跨系统原子事务，故 `provisioning` 无权限、激活前二次核验和失败 revoke 是必要边界。相同 create/admission requestId 先按 receipt/intent 重放；payload 冲突拒绝。已有 `provisioning` Session 的恢复只使用原 sessionId；无法证明其持久状态时停在 `RECOVERY_UNAVAILABLE`，不创建替代 Session。

## Captain, Caller And Audit

Captain 是本地用户，当前部署只有单 Host 单用户，不设置 Captain Agent 或原 Session 授权锁。结构化入口为 `plugin/src/remote/index.ts::ConviviumRemoteService.control` → `plugin/src/runtime/meeting-lifecycle.ts` 的 LocalMeetingWebRuntime.control → application。Remote 仍只在 webServer.host=127.0.0.1 时注册；来源固定 `{channel:"loopback_remote",principalId:"local-controller"}`。另有 `/convivium <目标>` 用户 Skill 入口：`plugin/src/tools/meeting-start-skill.ts` 从当前 turn 的直接用户消息取得目标和一次性授权，`convivium_start_meeting` 只构造 CreateMeeting，经 LocalMeetingWebRuntime.startFromSkill 以 `{channel:"skill_invocation",principalId:"local-controller"}` 提交；其它 Captain action 仍只经 Remote。两条创建路径使用相同版本/幂等/领域校验；start_archive 及归档结果由 runtime_recovery 执行。普通会议身份工具不获得 Captain 权限，旧 create tool 保持移除。

`MeetingCommandExecutionContext` 删除 captainParent；创建从可信 adapter 得到 `creator:{kind:"local_user",principalId:"local-controller",sourceSessionId?:string}`。当前 Remote 和 Skill 均不填写 sourceSessionId；Skill 的输入 Session 与消息 ID 只用于当前 turn 的授权及 requestId 生成，不成为 Meeting 授权锁。`agent/pre-step` 仅识别直接用户来源且核对 `convivium` Skill 可由用户调用；授权在使用、turn 停止或用户换题后失效。创建工具无参数，固定补齐字段由 Meeting Interface 拥有，模型不能提交任意 Captain command。原 Session 关闭、重开面板、Host 重启均不影响当前本地用户控制。

`ResolvedCallerScope` 的旧 local 分支改为 `role:"captain"`，附带由 meetingId 派生的 captainActorId，无 identityId/ownership；resolveCallerScope 和 validScope 验证 channel=loopback_remote、principal=local-controller、无 sessionBindingId。create 单独检查同一可信来源后分配 meetingId；已有会议检查 ready/lifecycle。DSH caller 一律通过 active MeetingIdentity，绝不退化为用户。Domain 用户 actor 为 `{kind:"captain_user",id:captainActorId}`；用户所有领域控制事实使用该脱敏 actor，receipt principal 沿用 local-controller，creator 不作为可更改授权表。Archive controlActorProvenance 恰一项 kind=captain，身份 provenance 不含用户。系统恢复和 deadline actor 保持系统来源。

生产面板在 `plugin/src/client/meeting-panel.tsx` 接入新增 `meeting-user-controls.tsx::MeetingUserControls`，通过现有 MeetingClient.control 发送结构化命令；新建 `meeting-create-form.tsx::MeetingCreateForm`。七角色配置来自固定目标表，用户必须显式完成 objective/议题/限制/责任/引用字段，不能用 Agent 默认猜测补齐必需业务值。十项控制按当前状态显示有意义的操作及目标选择、理由、证据与条件字段；普通用户不编辑 actor、版本或 ownership。版本取完整读取的 snapshot，requestId 在一次提交时分配并在网络不确定重试中复用，用户改变内容才产生新 requestId；遇 VERSION_CONFLICT 补读并提示重试，不自动覆写。断线或详情不完整禁写。

用户 read/list 沿现有 loopback 入口，继续完整用户可见事实；Agent read 只经 active ownership。用户与 Agent 都不能用投影修改领域权限。UI 的 controls 依据统一用户 action 表与领域前置，Domain 最终判定；用户结束仍使用现有显式 outcome/reason 及引用字段，归档由 Runtime 推进。

## Delivery, Pause, Recovery And Archive

outbox dispatcher 每次按 Meeting、目标 identity、Session ownership、capability、当前可见事实及 lifecycle 重验，取得该 Meeting 的 owner handle，向 `Agent.followup` 提交带稳定 deliveryId 的 `UserMessage`，再经 `ctx.sessions.flush(session)` 等待持久化 listener，最后把 effect 标为 delivered。flush 未成功或 effect 完成提交未成功时保留可重试；重复投递可能出现，Agent 文本和 inbox acceptance 均不能形成 Meeting 事实。Reviewer claim、Meeting requestId/version 和 outbox ID 继续各自去重。Agent 间只经 Meeting Runtime 的正式操作交流。

用户输入 Session 关闭不影响 owner Map 中的七个 handle、outbox 或动态准入。Host 冷启动先恢复 Meeting Repository，再从 active/provisioning ownership 逐个读取精确 Definition ID/version/hash、资源指纹和固化 `EffectiveAgentOptions`；验证 DSH persisted Session 的 ID/header 后调用 `ctx.agents.resume`，使用同一 scoped setup。资源缺失/变更、Session 或 ownership 不可证明时只标记 `RECOVERY_UNAVAILABLE`，不读取当前默认配置代替。发现已由其他 owner 持有的 live Agent 时拒绝收养裸 handle。

pause 停止新调度、撤销当前活动的继续条件并取消受影响的 Agent turn；resume 从已提交状态和 outbox 生成新的可见通知。end/归档先物化完整 ArchivePackage，随后仅对目标 Meeting 的 ownership 先 revoke capability，再 cancel/drain/dispose handle；任一关闭失败保持 archiving，直到可证明全部关闭。即使 DSH 持久 Session 日志仍在，已撤权身份不能调用 Meeting。插件停机保留 Meeting 事实和未完成 effect，释放所持 handle，不关闭别的 Meeting 或用户输入 Session。

## Security And Observability

私有 bootstrap/ownership 可以保存 Session ID、资源 SHA 与模型 route，但公开 status、Catalog、Archive、Remote 和 Markdown 不显示这些值。诊断区分 `create/setup`、`ownership activation`、`followup/flush`、`outbox commit`、`resume`、`revoke/drain`；不可把某一阶段的成功描述为整条链路成功。Skill 脚本的文件与执行权限由 Host policy 判定，Skill 存在不等于工具、网络或 Meeting 权限。

## Acceptance

聚焦测试必须证明七身份精确装配、额外/缺失 Skill 原子拒绝、可信用户入口鉴别、输入 Session 关闭仍可控制与投递、动态 admit 幂等、重复 effect/flush 后崩溃、pause/end/归档撤权及冷恢复 fail closed。真实 DSH profile 再验证各角色模型可见 Skill、GitHub/arXiv 查询、Reviewer worker、模型 route 与资源绑定在冷重启后的表现；未运行的 lane 只标 `Not Covered`。

自动外部验收使用 `plugin/scripts/smoke-profile/index.mjs` 的独立临时 profile，新增 `peer-meeting-agents` scenario，纳入 `SMOKE_SCENARIOS` 和 `CORE_SCENARIOS`；probe 位于 `plugin/scripts/smoke-profile/probe/scenarios/peer-meeting-agents.js`，结果校验在 `plugin/scripts/smoke-profile/result.mjs::validateScenarioResult`。固定命令为仓库根的 `pnpm --dir plugin smoke:profile --all --json`；不使用 `dsh-workspace/` 人工 Web Host、其持久 SQLite 或已关闭的人工冒烟进程。该 scenario 必须在真实 DSH Loader 中取得七个不同 Session ID 与各自 Preset ID，按角色调用 `skills.list/get` 比较五能力的精确分配集合并证明未分配名称不可加载；使用一个真实 GitHub 来源和一个真实 arXiv 来源完成查询/读取并在结果记录 URL/版本，不以 Skill 存在代替实际调用；用专职 Reviewer 的固定 schema worker 取得一次合法 Review；关闭发起时的输入 Session 后验证 notice 投递与用户控制，再用另一 DSH Agent 的工具调用证明无法取得用户权限；重新连接本地用户 Client 后控制仍成功；重启 Host 后按已持久绑定恢复七个 Session，核对资源/模型指纹与 Meeting 事实未漂移。`result.mjs` 只在这些断言逐项为 true、所有来源 URL/版本非空且无敏感 token 时接受 `ok:true`，任一外部凭据、网络、模型或 DSH 装载不可用则该 lane 为 STOP/Not Covered，不能用 mock 响应或旧 child scenario 代替。

该 scenario 结果的 JSON 根字段精确为 `ok:true`、`scenario:"peer-meeting-agents"`、`meetingId:string`、`assertions:string[]`、`observed`。`assertions` 精确按序为 `seven-peer-sessions,role-skill-isolation,input-session-independent-delivery,user-control-authorization,github-source,arxiv-source,reviewer-worker,cold-recovery`。`observed` 精确包含 `sessionIds:Record<AgentRoleDefinitionId,string>`、`presetIds:Record<AgentRoleDefinitionId,string>`、`skills:Record<AgentRoleDefinitionId,AbilityName[]>`、`userControl:{inputSessionIndependent:boolean,agentRejected:boolean,reconnectedUserAccepted:boolean}`、`github:{url:string,ref:string}`、`arxiv:{url:string,id:string,version:string}`、`review:{versionId:string,reviewId:string}`、`coldRecovery:boolean`；七个 Record 的键集合精确为七角色，Session ID 值互异，Preset 值精确为 `convivium-<role 去掉 meeting_ 前缀后下划线替换为连字符>`，Skill 数组按名称排序且与角色分配表相等。`assertions` 是验证清单，不由 probe 自报通过代替 `result.mjs` 对 `observed` 的逐字段校验；URL/ID/ref/version 非空，结果不保存 API key、prompt 全文或隐藏推理。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
