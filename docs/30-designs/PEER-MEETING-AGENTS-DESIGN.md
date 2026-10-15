# Peer Meeting Agents Design

## Purpose

本文固定 [MO-FR-14](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-14平级-meeting-agent-与独立能力组合) 的平级 Agent 装配、Session owner、投递、Captain 来源和恢复方案。目标接口以 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 和 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 为准。

## Scope And Non-goals

覆盖结构化 Captain 按显示名称选择可选初始 Contributor、Skill 按 Host 配置补齐默认 Contributor、既有七身份会议的恢复、动态普通 Contributor、六项能力 Skill、各角色 Preset、Meeting-owned AgentSession、outbox 投递、暂停/结束/归档/冷恢复和用户 Captain 鉴权。Reviewer 每份 EvidenceVersion 的 one-shot worker 保持 DSH Subagent。当前版本门禁只支持 DSH `0.2.0-rc.2`、单 Host/profile 和已确认的 loopback local 权限。无 Agent Teams、直接同伴消息、跨 Host、旧 schema 迁移或自动清理人工冒烟数据。

## Responsibilities And Dependencies

角色资源按“AGENTS 说明身份与权限，Skill 说明可复用方法”分工。八份 `AGENTS.md` 分别写明自身 `roleDefinitionId`、职责、可调用的 Convivium 工具、收到 notice 后先读取当前 caller-visible Meeting View、不能代行 Captain/其他 MeetingIdentity，以及在会话恢复后继续使用原 Definition。Manager 负责议题内计划、开轮、举手处置、发布、推荐和正常结束判断；三个工程角色分别从领域、Runtime 和协议/UI 视角工作；GitHub、arXiv 与 Web 研究角色负责对应来源的证据；Reviewer 从独立验证视角处理待审 version，并以专用 one-shot worker 取得结构化结果。AGENTS 不包含研究/核验步骤的重复正文，也不声称拥有 Host 尚未授予的工具。

六项 Skill 的工作方法固定为：`meeting-facilitation` 从当前目标、阻塞、职责与证据缺口形成有界计划，标明依据和停止条件；`repository-analysis` 先读正式需求/接口，再核对代码、提交、测试和反例，分开目标行为与已实现证据；`evidence-review` 针对单个版本逐主张核验来源、方法、反例、适用范围和不确定性，输出证据界限；`github` 定位 repository/ref/文件/commit/issue/PR/release，区分已合并事实、未合并提案和 fork；`arxiv` 核对 arXiv ID 与版本、方法、数据集、指标、实验结论及外推限制。`web` 实际搜索、读取原始资料、跨来源核验，记录时间窗口、来源定位、事实/推断与限制。各 Skill 的 frontmatter `name` 精确等于能力名且有非空 `description`；Skill 可以包含同目录 `scripts/`，加载本身不运行脚本。工具调用示例不得把 Skill 变成 Meeting authority；Reviewer 的 worker 调用顺序留在其 AGENTS，而不写成所有使用 `evidence-review` 的角色的普遍方法。

| 责任                | 唯一 owner                        | 输入与输出                                                               |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| Definition/资源目录 | `role-composition` 与包内静态资源 | 精确 Definition ID/hash → AGENTS/Preset/Skill 指纹                       |
| 平级 Agent handle   | Runtime 的 `MeetingAgentOwner`    | `PreparedDescriptor` → `AgentHandle` 或 RoleError                        |
| Session ownership   | Meeting Repository                | Meeting/identity/session/资源/模型私有绑定；`provisioning→active→closed` |
| 用户输入来源        | Meeting Repository 私有 bootstrap | 可信用户 adapter 的 creator；仅用于审计                                  |
| Meeting 权限和事实  | application + Domain              | 可信 caller → 授权转换、receipt、fact、outbox                            |
| 公开与定向投递      | effect dispatcher                 | active ownership + outbox → DSH `followup`、flush、effect 完成           |
| Reviewer worker     | 专职 Reviewer Agent               | 单 EvidenceVersion/claim → 固定 schema one-shot 结果                     |

Domain 不依赖 DSH、文件系统或 Repository；Repository 不调用 DSH；tool/Remote 不自行产生领域权限。`MeetingAgentOwner` 位于 `plugin/src/dsh/`，只接收 Runtime 已验证的 descriptor 和 ownership。`ctx.agents.get` 不能替代 owner handle。DSH `systemPrompt.section` 的 `convivium:role-identity` 只注册当前角色 AGENTS；DSH 原生 cwd AGENTS 保留 Host 规则，不作为此角色资源的来源。Preset filesystem provider 对每个能力目录分别设置 `customSkillDirs`，严格 `includeDefaultRoots:false`。目标 DSH Web bundle 已禁用 base 的 host `skill-filesystem` 行；部署另加的 global provider 若暴露额外 Skill，setup 校验拒绝。`toolFilter` 只收窄继承工具，Runtime 仍逐调用授权。

静态发行资源根只在 `plugin/src/index.ts` 的插件入口计算：`packageRoot=fileURLToPath(new URL("../",import.meta.url))`；src/index.ts 与打包后的 lib/index.js 均定位同一 package root。入口向 `activateTargetMeetingApplication` 传入必填 `rolePackageRoot:string`，再以 `createMeetingAgentOwner({ctx,packageRoot:rolePackageRoot})` 构造 owner；preflight/资源读取共享此根。其他模块不按自身 import.meta.url 猜路径，避免打包内联改变相对层级；用户/Manager 不提供文件路径。

`MeetingAgentOwner` 在 `plugin/src/dsh/meeting-agent-owner.ts` 实现，由 `plugin/src/dsh/index.ts` 公开给 Runtime；它不读取 Meeting Repository，也不负责把 outbox 标为 delivered。其固定接口除 `create/resume/deliver/suspend/stop/disposeAll` 外，增加 `deliverObserved`：输入与 `deliver` 相同，返回 `{durable,outcome:"completed"|"failed",failureCode?,failureSummary?}`。内部 `Map<sessionOwnershipId,{handle:AgentHandle;purpose:"provisioning"|"delivery"|"cleanup"}>` 只保存本 owner 创建/恢复的 handle 与装配模式：同一 id+sessionId+compositionHash 的同值重入可复用，任一字段不同为 `OWNERSHIP_CONFLICT`；已有裸 live Agent 但无本 owner handle 时拒绝收养并给 `RECOVERY_UNAVAILABLE`。`create` 使用 descriptor 和 ownership 的全部同值绑定、先持久化的 provisioning 状态；`resume` 重新装载原 Definition/资源/options，`purpose="provisioning"` 仅在 Runtime 已核对相同不可调度 intent 时恢复尚未激活的 Session，`purpose="delivery"` 只允许 active 且未 revoked 的 ownership，`purpose="cleanup"` 只允许已 revoked 但未 closed 的 ownership。create 与 provisioning/cleanup resume 的 scoped setup 额外用 `tools.restrict({allow:[]})` 禁止任何 Tool，且 Runtime 的 ownership gate 拒绝其 Meeting read/command；恢复可能启动 DSH loop，不能把“无授权业务调用”误写成“绝不启动 turn”。`deliver` 先执行 `authorize`，再按 DSH Role Interface 的精确 `UserMessage` 调用 `followup`、`sessions.flush`、再次 `authorize`，返回 flush 的布尔结果；调用方仅在 `true` 时提交 delivered，`false` 时保留 retry。`deliverObserved` 在 `followup` 前订阅 `agent/inbox/claimed` 与 `agent/error`，只把同 Agent、同 deliveryId 被 claim 的 turn 关联为目标，flush 后等待 `agent.whenIdle()`；若当前消息尚未 claim，则用 DSH 公开 `steer` 注入无业务事实的 wake message，使原 next-turn 通知被下一 turn 领取，再等待 idle，仍未领取则投递失败。监听始终在 finally 释放，且之前活动 turn 的失败不会错记到当前通知。`stop` 只对目标 handle 执行 `agent.cancel({kind:"hook",reason})`、`agent.whenIdle()`、`handle.dispose()` 并删 Map；无 handle 时按原 ownership 以 `purpose="cleanup"` 恢复后执行，恢复失败则保持 archiving/cleanup retry，不用 `ctx.agents.get` 代替。`disposeAll` 用于 Host 停机，只释放 Map 中的 handle，不改变 Meeting ownership 或事实。

owner 公共方法之间用私有 helper 复用，不在同一串行键内递归获取锁。owner 按 ownershipId 串行执行 create/resume/deliver/suspend/stop，disposeAll 先拒绝新操作再等在途操作退出；不同 Meeting 不共用串行键。Runtime 只有在初始 `completeCreate` 已提交 ready、或动态 `record_identity_admission_result` 已提交 active 后，才可调用 `resume(purpose:"delivery")`。若 Map 中仍为 provisioning purpose，先 cancel/whenIdle/dispose 旧 scope，再以同一 sessionId 恢复 delivery scope；不得只因 ownership 已 active 而复用带 `allow:[]` 的 handle。delivery scope 保留该角色 toolFilter，移除的只是 provisioning 禁工具层。ready 后恢复失败保留原 active 绑定与重试，不倒改为 creation_failed。

`suspend` 只释放 Map 中目标 handle（cancel/whenIdle/dispose 后删除），不撤销 ownership；Map 无该 handle 时同值成功，不恢复 Session 来取消。Runtime 在 pause 状态已提交、停止调度后调用它；paused 冷启动不恢复 delivery，resume 命令提交后才按原绑定恢复。stop 的缺 handle 路径仍是已撤权 cleanup，不能使用 suspend 冒充终态撤权。scope teardown 失败保留诊断与重试，不能提前记录 closed。

PreparedDescriptor 的 TTL 只限制首次 create/激活；active ownership 的恢复按持久绑定检查，不因旧 descriptor 过期失效。provisioning 冷恢复必须取得原 descriptor（含 expiresAt）且未过期；在创建记录中与 ownership 同时持久化 `preparedDescriptors:PreparedDescriptor[]`，动态准入则在同一 ownership 提交中保存相应 descriptor，恢复结果同时返回该私有集合。过期走 PREFLIGHT_EXPIRED 的失败撤权路径，不替换 descriptorHash 或延长 TTL。清理恢复不使用过期 descriptor 授权工具。

## State And Creation Flow

1. `conviviumMeetings.control` 从 loopback Host 用户边界注入 local-controller；`convivium_start_meeting` 仅消费 `/convivium <目标>` 直接用户输入的一次性创建授权，并注入相同 principal。普通 DSH Agent 创建调用或 payload 伪造来源立即拒绝。为 Meeting ID 与全部配置选中的初始 identity/session/ownership 分配确定性 ID；在第一个 Session 创建前解析全部 Definition、AGENTS、Preset、Skill、Host 模型选择并核对指纹。对每个 Preset 调用 `ctx.agentPresets.acquireScope(id)` 取得 scope lease，按该 scope 校验实际 Skill `snapshot/get` 后释放 lease，不创建 AgentSession；创建时的 scoped setup 再次校验。
2. Repository 以一个创建入口持久化私有不可变 `creator`、初始领域状态与 `creating` bootstrap；receipt/outbox 仅在 completeCreate 发布。初始身份尚不能执行 Meeting command；每个身份先有 `provisioning` ownership。创建来源不进入 `MeetingState.identities`，也不是 DSH parent。
3. 对每个身份调用 `MeetingAgentOwner.create`。它传精确 `sessionId`、`agentPreset`、已固化 `agentOptions` 给 `ctx.agents.create`，在 unpublished scoped setup 中 mount Preset、注册角色指令、restrict Tools、核对 Skill `snapshot/get`；返回后再次核对 Session ID/header/资源绑定。Published Agent 在 ownership 激活前不能获得 Meeting authority 或 notice。
4. 在 Meeting 仍可创建且 descriptor/ownership 未变时，将该 ownership 原子激活。全部初始 ownership 均 active 后，bootstrap 才从 `creating` 转 `ready` 并允许 outbox 投递。任一步失败，bootstrap 置 `creation_failed`，先 revoke 所有已登记 ownership，再取消、drain 和 dispose 已创建 handle；不能留下可调度半身份或把它们重挂 Captain。
5. Manager 的 `recommend_identity(admit)` 只提交含稳定 admissionId、identityId、sessionId 和 Definition provenance 的不可调度 intent。dispatcher 以同一 ID 预检、创建独立 Agent/ownership 后，用 `record_identity_admission_result` 原子激活身份和 recommendation；失败提交安全 RoleError。已有 active identity 跨 Agenda 复用既有 ownership，不另建 Session。

任何 DSH 创建/恢复操作均是 Repository 提交后的外部副作用；Agent 发布与 Meeting CAS 之间无法做跨系统原子事务，故 `provisioning` 无权限、激活前二次核验和失败 revoke 是必要边界。相同 create/admission requestId 先按 receipt/intent 重放；payload 冲突拒绝。已有 `provisioning` Session 的恢复只使用原 sessionId；无法证明其持久状态时停在 `RECOVERY_UNAVAILABLE`，不创建替代 Session。

## Captain, Caller And Audit

Captain 是本地用户，当前部署只有单 Host 单用户，不设置 Captain Agent 或原 Session 授权锁。结构化入口为 `plugin/src/remote/index.ts::ConviviumRemoteService.control` → `plugin/src/runtime/meeting-lifecycle.ts` 的 LocalMeetingWebRuntime.control → application。Remote 仍只在 webServer.host=127.0.0.1 时注册；来源固定 `{channel:"loopback_remote",principalId:"local-controller"}`。结构化 `create_meeting` 只接收可选的 Contributor 角色显示名称列表（默认空），LocalMeetingWebRuntime 在 application 前解析 Definition，并补齐内部 Manager、Reviewer 与身份引用。另有显式用户 Skill 入口：`/convivium <目标>` 的 `convivium_start_meeting` 按 Host 默认角色直接构造内部 CreateMeeting，经 LocalMeetingWebRuntime.startFromSkill 以 `{channel:"skill_invocation",principalId:"local-controller"}` 提交；`/convivium cancel <meetingId> <原因>` 的 `convivium_cancel_meeting` 只构造指定 Meeting 的 `cancelled` 终止命令，经 LocalMeetingWebRuntime.cancelFromSkill 使用同一 channel/principal。两项工具均只消费当前 turn 的直接用户输入的一次性授权，其余 Captain action 只经 Remote。两条创建路径进入相同版本/幂等/领域校验；start_archive 及归档结果由 runtime_recovery 执行。普通会议身份工具不获得 Captain 权限，旧 create tool 保持移除。入口参数与授权细节以 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#captain-control-surface) 为准。

`MeetingCommandExecutionContext` 删除 captainParent；创建从可信 adapter 得到 `creator:{kind:"local_user",principalId:"local-controller",sourceSessionId?:string}`。当前 Remote 和 Skill 均不填写 sourceSessionId；Skill 的输入 Session 与消息 ID 只用于当前 turn 的授权及 requestId 生成，不成为 Meeting 授权锁。`agent/pre-step` 仅识别直接用户来源且核对 `convivium` Skill 可由用户调用；授权在使用、turn 停止或用户换题后失效。Skill 创建与取消工具均无参数；创建的固定补齐字段与取消的目标、原因解析由 Meeting Interface 拥有，模型不能提交任意 Captain command。原 Session 关闭、重开面板、Host 重启均不影响当前本地用户控制。

`ResolvedCallerScope` 的旧 local 分支改为 `role:"captain"`，附带由 meetingId 派生的 captainActorId，无 identityId/ownership；resolveCallerScope 和 validScope 只接受可信 adapter 注入的 loopback_remote 或 skill_invocation、principal=local-controller、无 sessionBindingId。Skill adapter 先核对并消费一次性授权，Runtime 的 startFromSkill/cancelFromSkill 再限制 action；不能仅凭 caller channel 取得通用 Captain 权限。create 在可信来源校验后分配 meetingId；已有会议检查 ready/lifecycle。普通 DSH caller 一律通过 active MeetingIdentity，绝不退化为用户。Domain 用户 actor 为 `{kind:"captain_user",id:captainActorId}`；用户所有领域控制事实使用该脱敏 actor，receipt principal 沿用 local-controller，creator 不作为可更改授权表。Archive controlActorProvenance 恰一项 kind=captain，身份 provenance 不含用户。系统恢复和 deadline actor 保持系统来源。

生产面板的展示与控制行为由 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md#local-client-and-remote-boundary) 维护。本节只规定来源绑定：用户 read/list 沿 loopback 入口，Agent read 只经 active ownership；Skill 只取得本次直接用户调用授予的创建或指定会议取消权限。用户与 Agent 都不能用投影修改领域权限；归档由 Runtime 推进。

## Delivery, Pause, Recovery And Archive

outbox dispatcher 每次按 Meeting、目标 identity、Session ownership、capability、当前可见事实及 lifecycle 重验，取得该 Meeting 的 owner handle，向 `Agent.followup` 提交带稳定 deliveryId 的 `UserMessage`，再经 `ctx.sessions.flush(session)` 等待持久化 listener，最后把 effect 标为 delivered。worker 在等待目标 Agent turn 和其它长投递期间持续续约当前 outbox lease；若续约或完成写入返回 `LEASE_LOST`，旧 worker 不再使用失效 token 写 retry/failed，而是放弃该项并继续轮询，由当前持有者或恢复流程处理持久 effect。以下重投和执行异常计失败仅适用于非 ACP 路径；ACP 的持久接收门禁见下述 Codex Session Integration。非 ACP 路径 flush 未成功或 effect 完成提交未成功时保留可重试；重复投递可能出现，Agent 文本和 inbox acceptance 均不能形成 Meeting 事实。已接纳 Contributor 的 hand disposition 用 `deliverObserved`：若其目标 turn 异常且尚未登记 package，dispatcher 通过 `runtime_recovery` 提交 `record_contribution_failure`，由 Domain 生成 `execution_failed` 与必要的 `round_ready`。Reviewer request 同样观察目标 turn；异常立即以 `review_interrupted` 消费 claim，再使用原有 EvidenceVersion 失败预算重派，不等待 claim 到期。Reviewer claim、Meeting requestId/version 和 outbox ID 继续各自去重。Agent 间只经 Meeting Runtime 的正式操作交流。

用户输入 Session 关闭不影响 owner Map 中已创建身份的 handle、outbox 或动态准入。Host 冷启动先恢复 Meeting Repository，再从 active/provisioning ownership 逐个读取精确 Definition ID/hash、资源指纹和固化 `EffectiveAgentOptions`；验证 DSH persisted Session 的 ID/header 后调用 `ctx.agents.resume`，使用同一 scoped setup。资源缺失/变更、Session 或 ownership 不可证明时只标记 `RECOVERY_UNAVAILABLE`，不读取当前默认配置代替。发现已由其他 owner 持有的 live Agent 时拒绝收养裸 handle。

pause 停止新调度、撤销当前活动的继续条件并取消受影响的 Agent turn；resume 从已提交状态和 outbox 生成新的可见通知。end/归档先物化完整 ArchivePackage，随后仅对目标 Meeting 的 ownership 先 revoke capability，再 cancel/drain/dispose handle；任一关闭失败保持 archiving，直到可证明全部关闭。即使 DSH 持久 Session 日志仍在，已撤权身份不能调用 Meeting。插件停机保留 Meeting 事实和未完成 effect，释放所持 handle，不关闭别的 Meeting 或用户输入 Session。

## Identity Working Directories

owner 装配时捕获 Host 启动目录，在首次 create 前创建 `meetings/<meetingId>/agents/<identityId>/`；每级受管目录验证真实路径，权限 mode 为 0700。`meta.cwd` 与 agentPreset 一并交给 DSH，setup 和 remember 核对持久 header；resume 复用既有目录和 Session，不自动创建缺失目录或改写历史 header。目录生命周期独立于 handle 和归档：失败、暂停、结束和会议删除均不自动删除工作文件。这里不新增 ownership 字段或存储迁移；cwd 由 DSH header 持久化，当前固定 Host 启动根与稳定身份 ID 用于复核，移动根会拒绝恢复。验收应证明不同身份目录不同、文件不覆盖、相同身份恢复 cwd 不变、原生持久历史可观察；不将 cwd 分离声明为访问隔离。

## Security And Observability

私有 bootstrap/ownership 可以保存 Session ID、资源 SHA 与模型 route，但公开 status、Catalog、Archive、Remote 和 Markdown 不显示这些值。诊断区分 `create/setup`、`ownership activation`、`followup/flush`、`outbox commit`、`resume`、`revoke/drain`；不可把某一阶段的成功描述为整条链路成功。Skill 脚本的文件与执行权限由 Host policy 判定，Skill 存在不等于工具、网络或 Meeting 权限。

## Acceptance

聚焦测试必须证明新会议按配置精确装配及旧会议七身份恢复、额外/缺失 Skill 原子拒绝、可信用户入口鉴别、输入 Session 关闭仍可控制与投递、动态 admit 幂等、重复 effect/flush 后崩溃、pause/end/归档撤权及冷恢复 fail closed。真实 DSH profile 再验证各角色模型可见 Skill、GitHub/arXiv 查询、Reviewer worker、模型 route 与资源绑定在冷重启后的表现；未运行的 lane 只标 `Not Covered`。

自动外部验收使用 `plugin/scripts/smoke-profile/index.mjs` 的独立临时 profile，新增 `peer-meeting-agents` scenario，纳入 `SMOKE_SCENARIOS` 和 `CORE_SCENARIOS`；probe 位于 `plugin/scripts/smoke-profile/probe/scenarios/peer-meeting-agents.mjs`，结果校验在 `plugin/scripts/smoke-profile/result.mjs::validateScenarioResult`。固定命令为仓库根的 `pnpm --dir plugin smoke:profile --all --json`；不使用 `dsh-workspace/` 人工 Web Host、其持久 SQLite 或已关闭的人工冒烟进程。该 scenario 按其固定的两位研究贡献者配置，必须在真实 DSH Loader 中取得四个不同 Session ID 与各自 Preset ID，按角色调用 `skills.list/get` 比较五能力的精确分配集合并证明未分配名称不可加载；使用一个真实 GitHub 来源和一个真实 arXiv 来源完成查询/读取并在结果记录 URL/版本，不以 Skill 存在代替实际调用；用专职 Reviewer 的固定 schema worker 取得一次合法 Review；关闭发起时的输入 Session 后验证 notice 投递与用户控制，再用另一 DSH Agent 的工具调用证明无法取得用户权限；重新连接本地用户 Client 后控制仍成功；重启 Host 后按已持久绑定恢复四个 Session，核对资源/模型指纹与 Meeting 事实未漂移。`result.mjs` 只在这些断言逐项为 true、所有来源 URL/版本非空且无敏感 token 时接受 `ok:true`，任一外部凭据、网络、模型或 DSH 装载不可用则该 lane 为 STOP/Not Covered，不能用 mock 响应或旧 child scenario 代替。

该 scenario 结果的 JSON 根字段精确为 `ok:true`、`scenario:"peer-meeting-agents"`、`meetingId:string`、`assertions:string[]`、`observed`。`assertions` 精确按序为 `four-peer-sessions,role-skill-isolation,input-session-independent-delivery,user-control-authorization,github-source,arxiv-source,reviewer-worker,cold-recovery`。`observed` 精确包含 `sessionIds:Record<AgentRoleDefinitionId,string>`、`presetIds:Record<AgentRoleDefinitionId,string>`、`skills:Record<AgentRoleDefinitionId,AbilityName[]>`、`userControl:{inputSessionIndependent:boolean,agentRejected:boolean,reconnectedUserAccepted:boolean}`、`github:{url:string,ref:string}`、`arxiv:{url:string,id:string,version:string}`、`review:{versionId:string,reviewId:string}`、`coldRecovery:boolean`；三个 Record 的键集合精确为 Manager、Reviewer、GitHub Research Analyst、arXiv Research Analyst 四角色，Session ID 值互异，Preset 值精确为 `convivium-<role 去掉 meeting_ 前缀后下划线替换为连字符>`，Skill 数组按名称排序且与角色分配表相等。`assertions` 是验证清单，不由 probe 自报通过代替 `result.mjs` 对 `observed` 的逐字段校验；URL/ID/ref/version 非空，结果不保存 API key、prompt 全文或隐藏推理。

该场景的当前 `observed` 只保存 Session/Preset/Skill 集合、用户控制结果、来源标识、一次 Review 和冷恢复布尔值。资源与模型的恢复检查通过 Repository ownership 的绑定哈希比较；它不直接读取恢复后 Agent 的有效模型、角色身份指令或 `toolFilter`，也不验证 Reviewer 并发审核。`result.mjs` 只能校验结果结构和值，真实工具读取、notice、授权拒绝和恢复行为仍须由 probe 执行并由运行记录证明。完整 MO-FR-14 验收还须覆盖这些未被该场景直接观察的条件，不能由八个结果字段或一次专项 PASS 推断完成。

## Codex Session Integration

本节是待实现的稳定装配方案，精确方法、三表、发送写序与失败语义唯一由 [ACP Execution Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md) 定义；Definition/快照/TTL 唯一由 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 定义，不另复制契约。

`plugin/src/dsh/meeting-agent-owner.ts::createMeetingAgentOwner` 接收可选 `CodexAcpProviderPort`。root 的 scoped setup 先 mount 原 Preset、验证原 AGENTS/Skill/toolFilter/options/header/cwd，末尾 await prepareSession(agent,purpose,signal)，再发布 Agent。provisioning 只创建首外部绑定，不授任务权限；delivery 核验并加载原绑定；cleanup 不创建或加载外部会话。purpose 切换仍用原绑定。其它未由 owner 准备的 root 不允许选择该路由，包括普通用户输入 Session。

provider 的公开 agent/created hook 仅接受 parentSession 可证明属于已准备 root 的 fresh spawn worker，准备独立 ACP Session，再安装 compaction boundary。worker source 只允许 startup；不复活旧 worker、不接收 worker resume/clear/compact。one-shot driver 在 worker 自己 scope 注册 structured_output；allow=[] 不屏蔽该工具。Reviewer 的 claim/version/outputSchema/真实 caller 与 Runtime 提交流程不变，worker 不获得 Meeting ownership。

`deliverToHandle` 对 ACP 的 deliver/deliverObserved 统一走 observed 流程，以原 outbox deliveryId 做持久接收门禁；首次 admitting 后才 followup，flush 后 queued，原 turn 正常结束且所有 request 有持久 receipt/checkpoint 后 completed。重复 completed 返回原 durable 结果；pending 只等待原进程 Promise。无 Promise 的重启未完成项只阻断，不再次入队、不 steer/wake。非 ACP 继续原路径。

owner.resume 先复核原 ownership、身份资源、模型和 Session header/cwd，再 reconcileSession，只有可证明空闲完成才 load 原外部 ID。hydration 不执行工具或提交新事实。旧 sending、缺 receipt、丢失技术记录或 load/指纹失败均保留原绑定并 fail closed。正常冷恢复不依赖不存在的 DSH 自动续执行服务；不能凭日志或 outbox lease 推定可以重发。

`plugin/src/runtime/services/evidence-review-dispatch.ts::createEvidenceReviewDispatcher` 与 `meeting-notice-dispatch.ts::createMeetingNoticeDispatcher` 先核对正式 Review/Evidence，再运行真实 deadline/撤权检查，再查 root block，最后才领取/投递。未知不派 replacement 或合成失败；真正 review_timeout 仍幂等计预算。`plugin/src/tools/register-tools.ts::registerReviewWorkerTool` 每个真实 exec.agent 只复用同一 active claim 的原 Promise，每次重新授权；start 前、result 后检查根阻断，finally dispose。合法已提交事实保留，不能被迟到错误改判。

暂停、异常结束和归档仍用既有 Captain 控制与 revoke/drain/dispose。stopSession(Reviewer) 停其子树，stopSession(worker) 只停该 worker；不反向停父或别根。provider 阻断不等于保持进程运行；停止必须 drain 原进程/MCP/DSH 工具后才记 cleanup 成功，保留技术历史，不做 GC。

## Web Analyzer Resource Composition

| 字段               | 唯一目标                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- |
| roleDefinitionId   | web_research_analyst                                                                          |
| agentDefinitionId  | convivium.web_research_analyst                                                                |
| displayName        | WEB ANALYZER                                                                                  |
| Meeting role       | contributor；ownership role 为 participant                                                    |
| dshPresetId        | convivium-web-research-analyst                                                                |
| summary            | 搜索、读取并交叉核验公开互联网资料，区分事实、推断、时效与来源限制。                          |
| requiredSkillNames | 精确 `["web"]`；新能力名 web                                                                  |
| expertiseTags      | `["web-research","source-verification","information-analysis"]`                               |
| evidenceScopes     | 精确 `["web"]`                                                                                |
| toolFilter         | 复制当前 github_research_analyst 的 contributor deny 集合，不增 Captain/Manager/Reviewer 工具 |
| agentOptions       | 发行默认省略，沿用 Host 完整默认选择；测试也不改为 Codex                                      |

唯一新增资源：`plugin/config/agents/web_research_analyst/AGENTS.md`、`plugin/config/skills/web/SKILL.md`、`plugin/config/presets/convivium-web-research-analyst/preset.yml`、`plugin/config/presets/convivium-web-research-analyst/agent.cordis.yml`。

AGENTS 只声明身份、职责、允许会议入口和公共会议边界；沿用 Github 角色的先 read、raise/decline、获准后一次最终证据、审核后不补证、不得冒充/直接互发消息规则。Skill 固定方法：明确查询与时间窗口；实际搜索；打开原始来源；跨来源核对；记录 URL、标题、发布/更新时间（缺失记未知）、访问时间和事实/推断/不确定性；提交含来源定位的 materials/claims/summary，不把搜索摘要当成已读正文，不绕过登录/付费限制。搜索无结果、抓取失败时报告限制，不伪造资料。

Preset 以 GitHub Research Analyst 的既有 agent.cordis.yml 为基线，只替换 skill providerName、分配目录为 web；保留 persona、平台 shell、fs/search、tool-skill、tool-web 和既有 compaction 组。preset.yml 为 name WEB ANALYZER、上述 summary、order 1。Definitions 末尾追加该项，AGENTS sha256 由最终原始字节生成，不手填假值。八个 Preset 通过发行 patch 注册；不把角色加入静态 agent-loop.config.agents。

## 实施与验证边界

以上是目标设计，本次仅迁移文档。当前产品仍为七角色/五能力，外部 overrides 合并、definitionHash 对象展开、预检未固化解析后 reasoning，且没有 ACP provider；这些是后续实现缺口，不提升 readiness。现有七角色身份 hash 应与受控旧 fixture 比较，不得用新函数计算两遍伪证不变。

先以确定性 ACP 子进程结合真实 DSH AgentLoop/ToolRuntime/Storage Domain 验证身份字节、真实 caller、structured_output、撤权、同键异 payload、不可变快照/TTL、发送前存储失败、发送中 kill、responded-before-flush、flush-before-checkpoint、冷 load 失败、worker 未知向根传播、真实 deadline 与正式事实竞争及归档收敛，再运行独立真实专项。现有 peer-meeting-agents 四 Session lane 的数字/证据边界保持原样，不由本方案改称五 Session 通过。

新专项为一场会议两轮、五个平级身份，Reviewer 主 Session 为 acp-codex，spawn worker 默认继承；Web 用 Host 默认。每轮三份 Evidence/三份合法 Review，失败重试另计；Web 每轮实际 search 并读取 agentclientprotocol.com 与 deepseek-harness.github.io 两域原始页面。定位起点为 [ACP Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup) 和 [DSH Reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/)，后者域根 404，不能作读取目标。20 分钟软时限不是费用上限，超限停止。

第一轮发布且所有 request/delivery 正常结算后暂停，关闭隔离 Host，以原数据重启；必须观察新的 loaded 与第二轮真实审核，最后撤权归档。probe 订阅公开进程内 checkpoint 事件，并与 DSH 工具/Session 事件及 Repository 正式事实交叉核对，不读取 provider 私有 store/owner。事件订阅须先就绪，不能补造历史。

生产 Catalog producer 未提供；只验证 provisioning 快照与期限，不宣称动态目录上线。未知结果自动恢复、远端结果自动核对、长会话压缩、其它 bridge/OS/模型组合均 Not Covered 或 Non-goals。身份 text 到达不等于模型遵循；cwd 分离不等于 OS 隔离；目录探测不等于推理认证。本次复用产品基线 verify，不安装 bridge、不执行真实模型或互联网专项。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Design](./MEETING-DESIGN.md)
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
