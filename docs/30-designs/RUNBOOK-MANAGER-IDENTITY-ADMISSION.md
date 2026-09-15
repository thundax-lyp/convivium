# RUNBOOK：Manager 角色决定与参会准入

状态：Author/Audit，审计结论 Not Executable；当前 checkout 在 T0 必须 STOP，因共享目标 Meeting command/Repository 管线尚未落地。审计结论在文末。执行分支：codex/role-recommendation-runbook。建立日期：2026-09-16。作者本轮只改工程文档；本 RUNBOOK 不授权提交、推送、建 PR 或合并。

## 执行者契约与目标

当前 Not Executable 状态下执行者仅可运行只读 T0；即使 T0 命令退出 0，也必须报告“等待作者实码复审”并停止。作者将审计结论更新为 Executable 后，执行者才按 T0→T9 顺序工作；每步先写该步指定行为测试并观察目标 RED，再改允许文件、运行指定 GREEN。PASS 必须同时满足命令退出码 0 和该步可观察断言。STOP 立即停止，报告最后 PASS 步骤、触发条件、文件/symbol、最小复现命令及实际输出；不得临场选择文件、替代入口、放宽类型/Schema/断言、跳过 RED 或把旧 Turn 代码当作目标。已有用户改动不回滚；本 RUNBOOK 的 Git 交付边界仍需另行授权。

完整链路：[MO-FR-13](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-13agent-角色目录与参会推荐) → [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md#catalog-snapshot-and-recommendation-input) 的 Host 安全 Catalog → 当前 Manager 只读 projection → [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#lifecycle-agenda-and-planning) 的单条 recommend_identity(decision=admit|reject) → [Domain Design](./DOMAIN-DESIGN.md#identity-and-authority-facts) 的拒绝事实或不可调度 provisioning intent → 同一 Meeting commit 的 receipt/fact/outbox → DSH exact Definition resolution/preflight/Session owner → runtime-only record_identity_admission_result → 普通可选 MeetingIdentity 与 durable ownership 同步可证实 → Manager/local status、Archive provenance 和冷恢复。Manager 决定无需 Captain 准入处置；Session 创建成功前绝不调度新身份。

## 起点、Scope、Non-goals 与依赖断点

当前 plugin/src/domain/meeting-state-v1.ts::MeetingState 只有目标聚合类型，没有 identityRecommendations；plugin/src/role-composition/model.ts::MeetingAgentDefinitionV1 和 plugin/src/role-composition/resolve.ts::resolveMeetingRoles 是初始身份组成；plugin/src/runtime/services/agent-catalog.ts::captureManagerCatalogBinding、plugin/src/domain/transitions/manager-planning.ts::submitManagerPlan、plugin/src/domain/transitions/attendance-rejection.ts::rejectAttendanceRecommendation 是 legacy。plugin/src/runtime/application-service/meeting-turn.ts::createMeetingTurnApplication 拒绝旧 submitManagerPlan，plugin/src/runtime/application-service/meeting-attendance.ts::createMeetingAttendanceApplication 拒绝 Captain reject-only 操作。当前没有目标准入 command、Definition descriptor admission port、目标 Repository commit 或目标 runtime recovery；[Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#functional-coverage) 的“部分已有”不是实现完成证据。

Scope：Manager 安全 Catalog read、结构化 admit/reject、snapshot/caller/version/role 检查、不可调度意图、Definition 与 native Skill/Preset preflight、独立 continuable Session/ownership、原子身份激活或失败、end/restart 清理、filtered status 与 Archive、幂等和最窄/完整验证。每项分别由 T1–T8 和 T9 验证。Non-goals：Host Catalog producer 的内部配置平台、Manager 自荐/创建 Definition、Captain 第二审批、required-review/risk/Captain/Manager 授权变化、Research dedup、UI/HTTP、worker/queue/cache/registry、第二 Storage domain、legacy 兼容、隐式迁移、任意模型覆盖、Persona/Skill/Tool 内容投影。

T0 的共享目标依赖是 [Meeting Design §Common Command Pipeline](./MEETING-DESIGN.md#common-command-pipeline) 中同一 Runtime 入口、MeetingState 无损 codec、MeetingCommitV1 原子 Repository、outbox dispatcher、caller ownership、target projection/Archive/end/recovery。作者为接口接线固定唯一依赖路径：
- plugin/src/protocol/meeting-command-v1.ts::MeetingCommandV1Schema；
- plugin/src/runtime/application-service/meeting-command-v1.ts::createMeetingCommandApplicationV1；
- plugin/src/repository/meeting-command-repository-v1.ts::MeetingCommandRepositoryPortV1；
- plugin/src/projection/meeting-view-v1.ts::projectMeetingViewV1；
- plugin/src/runtime/services/meeting-command-recovery-v1.ts::recoverMeetingCommandsV1；
- plugin/src/domain/transitions/meeting-create-v1.ts::createMeetingV1；
- plugin/src/domain/transitions/meeting-end-v1.ts::endMeetingV1；
- plugin/src/domain/transitions/meeting-archive-v1.ts::startMeetingArchiveV1。
这些文件/symbol 不存在时只执行 T0 STOP，不能让 C 切片创建第二条命令或存储管线。上游采用不同入口时由作者核对正式依赖后修订并重审 RUNBOOK，执行者不得自行改名接线。这是代码前置依赖，非产品语义选项。

## 精确数据、来源与不变量

写 envelope 固定 protocolVersion:1、meetingId、expectedMeetingVersion、requestId、action；CallerBinding 由 DSH adapter 产生。recommend_identity.action 必填 kind、candidateId、definitionId、definitionVersion、catalogId、catalogVersion、agendaId、decision:admit|reject、rationale、expectedContribution、evidenceGap。字段均非空，decision 仅两值；Manager 不可提交 actor、roles、Session ID、ownership、当前时间或 admissionId。managerCatalog? 仅 Manager read 返回安全 catalogId/version 与 candidateId、Definition id/version、displayName、availability、meetingRoles、responsibilitySummary、仅 preset|skill|tool|mcp 的 capabilitySummary 安全标签与 suitability(scope,rationale)；无 producer 时该 read 字段缺席，普通 Meeting read 继续。command 必须重读同一 Host producer并精确比对 meetingId/catalog/candidate/Definition id/version，admit 再固化 candidate.definitionHash；数组中任一无效 candidate 不可部分写入。本切片只处理一条 recommend_identity，不加批量 command。

IdentityRecommendationV1 的 required 字段为 id、candidateId、definitionId、definitionVersion、catalogId、catalogVersion、agendaId、managerId、decision、status、rationale、expectedContribution、evidenceGap、createdAt；admit 另 required 预留 identityId、childSessionId、definitionHash，reject 三字段必须缺席；optional failureCode、resolvedAt。definitionHash 由 Runtime 在首 commit 从已重读 Catalog candidate 固化，不由 Manager 提交。Runtime 从共享 IdPort 分别分配 recommendationId 和 identityId；admissionId 精确等于 recommendationId；childSessionId 由现有 allocateSessionId("participant", identityId) 规则形成并在第一 commit 固化。当前时间由 Runtime Clock，managerId 由可信 caller identity。初始 reject→rejected/resolvedAt；admit→provisioning，无 MeetingIdentity/Session authority。provisioning→active 仅当 resolved Definition binding、meeting-specific 未过期 descriptor、独立 Session 和 durable ownership 匹配全部成功；active 设置 definitionHash/resolvedAt，新增 Identity(id=预留 identityId, displayName=已解析的精确 Definition.displayName, roles=["contributor"], agendaResponsibilityIds=[], reviewResponsibilityIds=[], riskAuthority=false, required=false, definitionId/version/hash, sessionOwnershipId)。provisioning→failed 设置稳定 RoleError code/resolvedAt，绝不新增 Identity。rejected/active/failed 为不可变终态。end_meeting 在终态提交内将所有仍 provisioning 的 intent 置 failed/ADMISSION_CONFLICT，dispatcher 创建前后重验终态并清理未激活 Session。

SessionOwnershipV1 来自 DSH session-owner，id 固定为 session-ownership: 加 admissionId，createdAt 取首次 durable ownership commit 时的 Runtime Clock 且重放保留；required id、admissionId、meetingId、identityId、parentSessionId、descriptorId/hash/descriptorExpiresAt、definition id/version、definitionHash、sessionId、createdAt、status:provisioning|active|interrupted|stopped|unrecoverable；active Identity 的 sessionOwnershipId 仅内部保存，公开 DTO/Archive 不含 Session/descriptor/ownership。admissionId 与精确 payload 重放同一 ownership；同 id 不同 payload ADMISSION_CONFLICT。目标 Repository receipt 键 (meetingId,principalId,requestId)，recommend_identity.normalizedPayloadHash 固定为 SHA-256(JSON.stringify([action.kind,candidateId,definitionId,definitionVersion,catalogId,catalogVersion,agendaId,decision,rationale,expectedContribution,evidenceGap]))；record_identity_admission_result 的 hash 固定为 SHA-256(JSON.stringify(["record_identity_admission_result",recommendationId]))。两者只取解码后的 required 字段；同键同规范 payload 重放原 result，异 payload IDEMPOTENCY_CONFLICT；授权先于 receipt。每次成功转换使用 expected version 原子保存 state/fact/receipt/outbox，不产生半提交。合法 reject 的 accepted result identityDecision.status=rejected；合法 admit 首次 result 为 provisioning；系统完成后 active/failed 可由 committed projection 观察。角色资源错误映射与命令错误优先级按 [Meeting Interface §Results](../20-interfaces/MEETING-INTERFACE.md#results-errors-and-precedence) 和 [DSH Role Interface §Role Errors](../20-interfaces/DSH-ROLE-INTERFACE.md#role-errors-and-authorization)，不得泄露私有配置。

反例：普通 Participant/伪 Manager caller、跨 Meeting、paused/converging/terminal、旧 Meeting version、变更 Catalog、目录外/不可用 candidate、meeting_manager/self Definition、重复未决/已 active candidate 均不写事实/receipt/outbox/version；reject 不创建 Session；任何 required Skill/Preset/descriptor/Session/ownership 失败不创建可调度 identity；Session 创建后 commit 竞态必须重用同一 admissionId或释放已创建资源；冷恢复不能用当前 Definition 或目录补建历史身份。Manager 不获得 Decision、risk、required-review 或额外 DSH capability。

唯一新增目标签名（TypeScript；同名业务 DTO 只引用正式 Interface，不能创建并行副本）：

~~~ts
interface IdentityRecommendationCoreV1 {
  id: string; candidateId: string; definitionId: string; definitionVersion: string;
  catalogId: string; catalogVersion: string; agendaId: string; managerId: string;
  rationale: string; expectedContribution: string; evidenceGap: string; createdAt: number;
}
type IdentityRecommendationV1 = IdentityRecommendationCoreV1 & (
  | { decision: "reject"; status: "rejected"; resolvedAt: number;
      identityId?: never; childSessionId?: never; definitionHash?: never; failureCode?: never }
  | { decision: "admit"; status: "provisioning"; identityId: string; childSessionId: string;
      definitionHash: string; resolvedAt?: never; failureCode?: never }
  | { decision: "admit"; status: "active"; identityId: string; childSessionId: string;
      definitionHash: string; resolvedAt: number; failureCode?: never }
  | { decision: "admit"; status: "failed"; identityId: string; childSessionId: string;
      definitionHash: string; resolvedAt: number; failureCode: string }
);
interface IdentityAllocatedIdsV1 { recommendationId: string; identityId?: string; childSessionId?: string }
interface IdentityRecommendationDraftV1 { candidateId: string; definitionId: string;
  definitionVersion: string; catalogId: string; catalogVersion: string; agendaId: string;
  decision: "admit" | "reject"; rationale: string; expectedContribution: string; evidenceGap: string }
type IdentityTransitionResultV1 =
  | { kind: "accepted"; state: MeetingState;
      fact: { kind: "recommend_identity" | "record_identity_admission_result";
        actorId: string; occurredAt: number; relatedIds: string[] };
      effect?: { kind: "identity_provision"; recommendationId: string; admissionId: string } }
  | { kind: "rejected"; errorCode: "INVALID_ARGUMENT" | "NOT_FOUND" |
      "INVALID_STATE" | "PRECONDITION_FAILED" };
function recommendIdentityV1(state: MeetingState, action: IdentityRecommendationDraftV1,
  managerId: string, ids: IdentityAllocatedIdsV1, now: number): IdentityTransitionResultV1;
type IdentityAdmissionResultContextV1 =
  | { kind: "admitted"; admissionId: string; meetingId: string; identityId: string;
      childSessionId: string; ownershipId: string; descriptorId: string; displayName: string;
      definitionId: string; definitionVersion: string; definitionHash: string }
  | { kind: "rejected"; failureCode: string };
function recordIdentityAdmissionResultV1(state: MeetingState, recommendationId: string,
  result: IdentityAdmissionResultContextV1, now: number): IdentityTransitionResultV1;
interface RoleCatalogPortV1 { readSnapshot(request: ReadCatalogRequestV1): Promise<ReadCatalogResultV1> }
interface VerifiedIdentitySessionScopeV1 {
  teamId: string; managerId: string; managerSessionId: string;
  captainParentSessionId: string; captainParentAgent: Agent;
}
interface IdentityAdmissionPortV1 {
  readOwnership(admissionId: string): Promise<SessionOwnershipV1 | undefined>;
  putProvisioning(owner: SessionOwnershipV1): Promise<
    { kind: "created" | "same"; owner: SessionOwnershipV1 } | { kind: "conflict" }>;
  inspectOwnedChild(owner: SessionOwnershipV1): Promise<"present" | "absent" | "unavailable">;
  startOwnedChild(owner: SessionOwnershipV1, parent: Agent, teamId: string, definition: MeetingAgentDefinitionV1,
    signal: AbortSignal): Promise<{ kind: "ready"; sessionId: string } | { kind: "rejected"; error: RoleErrorV1 }>;
  markActive(owner: SessionOwnershipV1): Promise<SessionOwnershipV1 | RoleErrorV1>;
  revokeAndDrainOwned(owner: SessionOwnershipV1): Promise<void>;
}
interface MeetingIdentityApplicationDepsV1 {
  repository: MeetingCommandRepositoryPortV1; catalog?: RoleCatalogPortV1;
  definitions: readonly MeetingAgentDefinitionV1[];
  ids: { nextId(kind: "identity_recommendation" | "meeting_identity" | "fact" | "receipt" | "outbox"): string };
  clock: { now(): number }; owner: IdentityAdmissionPortV1;
  readVerifiedSessionScope(meetingId: string): Promise<VerifiedIdentitySessionScopeV1 | undefined>;
}
function readMeetingRoleCatalogV1(port: RoleCatalogPortV1, meetingId: string,
  captainSessionId: string, managerSessionId: string): Promise<ReadCatalogResultV1>;
type DynamicDefinitionResolutionV1 =
  | { kind: "resolved"; definition: MeetingAgentDefinitionV1; binding: AgentDefinitionBindingV1 }
  | { kind: "rejected"; code: "DEFINITION_NOT_FOUND" | "DEFINITION_VERSION_MISMATCH" | "ROLE_NOT_ALLOWED" };
function resolveDynamicMeetingDefinitionV1(definitions: readonly MeetingAgentDefinitionV1[],
  definition: VersionedRef, expectedHash: string): DynamicDefinitionResolutionV1;
function preflightDynamicMeetingIdentityV1(parent: Agent, intent: IdentityRecommendationV1,
  definition: MeetingAgentDefinitionV1, binding: AgentDefinitionBindingV1,
  signal: AbortSignal): Promise<PreflightIdentityResultV1>;
function admitMeetingIdentityV1(intent: IdentityRecommendationV1, descriptor: PreparedDescriptorV1,
  parent: Agent, definition: MeetingAgentDefinitionV1, ownerPort: IdentityAdmissionPortV1): Promise<AdmitIdentityResultV1>;
function createMeetingIdentityApplicationV1(deps: MeetingIdentityApplicationDepsV1): {
  recommendIdentity(command: MeetingCommandV1, caller: CallerBinding): Promise<MeetingCommandResultV1>;
  recordIdentityAdmissionResult(command: MeetingCommandV1,
    result: IdentityAdmissionResultContextV1): Promise<MeetingCommandResultV1>;
};
function deliverIdentityProvisionV1(effect: OutboxEffectRecordV1,
  deps: MeetingIdentityApplicationDepsV1): Promise<void>;
~~~

类型归属固定：T1 的 protocol/meeting-identity-v1.ts 唯一声明 MeetingRoleV1 与 RoleErrorCodeV1（逐项等于正式 RoleErrorV1.code）及 Meeting DTO/Schema；T3 的 dsh/meeting-role-catalog-v1.ts 唯一声明 VersionedRef、RoleErrorV1、CapabilityKind、CapabilitySummaryV1、SuitabilityV1、CatalogCandidateV1、MeetingAgentCatalogV1、ReadCatalogRequestV1/ReadCatalogResultV1；T5 的 dsh/meeting-identity-admission-v1.ts 唯一声明 ResolveDefinitionResultV1、PreparedDescriptorV1、PreflightIdentityResultV1、SessionOwnershipV1、AdmitIdentityResultV1、IdentityAdmissionPortV1，引用已有 MeetingAgentDefinitionV1/Binding；T2 的 domain/transitions/meeting-identity-v1.ts 声明全部纯 transition input/result；T4 的 runtime/application-service/meeting-identity-v1.ts 声明 MeetingIdentityApplicationDepsV1。有公开入口的模块跨模块引用只走登记 index.ts；repository/role-composition 保持既有直接调用边界，不新增转发入口。IdentityRecommendationDraftV1 是 Domain 内部纯字段输入，Runtime 从已解码 RecommendIdentity 显式拷贝各字段；不是 wire DTO 或第二契约。Domain transition 仅消费上述 plain data；Runtime 先用 Protocol 的 RoleErrorCodeV1 校验 rejected.failureCode，再将 RoleError、Definition binding、Session ownership 转成字段调用转换，Domain 仅检查 failureCode 非空。Domain 不导入 Protocol、Repository 或 DSH。IdentityAdmissionPortV1 只封装同一 MeetingRepository 的 durable ownership 读写与 DSH startContinuable/已归属 child 读取、撤权/drain，不是新 registry。`readOwnership` 的 Storage 错误不能当作 absent；`putProvisioning` 以 admissionId 与不可变 owner 字段（meetingId/identityId/parentSessionId/descriptorId/hash/expiresAt/Definition id/version/hash/sessionId）做 CAS，`same` 返回原 owner 并保留其 createdAt/status；任一字段不同返回 conflict。`inspectOwnedChild=unavailable` 必须 RECOVERY_UNAVAILABLE，不能重启 child；`present` 只能复用，`absent` 且 descriptor 未过期才可 `startOwnedChild`。`markActive` 只在 owner 仍 matching provisioning 且 child ready 时成功；`revokeAndDrainOwned` 内部再次读取并证明归属。MeetingIdentityApplicationDepsV1 只含共享目标 Repository、T3 Catalog reader、共享 IdPort/Clock、T5 Session owner 与已验证 Captain/Manager ownership。共享 IdPort.nextId("identity_recommendation"|"meeting_identity"|"fact"|"receipt"|"outbox") 分配非空唯一 OpaqueId，Runtime 从同一 command context 取得；childSessionId 用共享 allocateSessionId("participant",identityId) 形成并用 DSH SessionId(childSessionId) 转成 branded type，不接受 caller 提交。系统结果的 principalId 固定 runtime:identity-provision，requestId 固定 identity-admission-result: 加 recommendationId；首次 Manager fact.actorId=managerId，结果 fact.actorId=runtime:identity-provision。outbox.identity_provision 只含 recommendationId/admissionId，不含 descriptor/Session/Definition 正文。

PreparedDescriptorV1 由 T5 project preflight 产生：descriptorId 固定 descriptor: 加 admissionId，definitionHash 来自 intent 已固化指纹并由 resolve.ts 既有 definitionHash() 验证；expiresAt 固定 intent.createdAt + 300000 毫秒；descriptorHash 为 SHA-256(JSON.stringify([meetingId,parentSessionId,definitionId,definitionVersion,definitionHash,expiresAt]))，并原样持久保存 owner.descriptorHash/descriptorExpiresAt。相同 intent 重试只产生相同 descriptor 数据；到期且尚无 matching durable ownership 时返回 PREFLIGHT_EXPIRED，不创建 Session。若 owner 已持久证明同 admissionId/identityId/childSessionId/Definition/descriptorId/hash/expiresAt 的 Session，先幂等返回该 owner，不重启 child；无法证明则 RECOVERY_UNAVAILABLE 并隔离该 child，不用新 descriptor 替换已创建 child。

## 机械执行步骤

### T0：共享目标命令基线

前置状态：本分支工作树与上述正式 docs 无冲突；从仓库根执行。
允许修改：无。
禁止修改：plugin/src 的任何文件；不得接回 legacy command。
执行：逐项验证固定的共享目标文件/symbol 与 host typecheck。
验证：
~~~bash
set -e
test -f plugin/src/protocol/meeting-command-v1.ts
test -f plugin/src/runtime/application-service/meeting-command-v1.ts
test -f plugin/src/repository/meeting-command-repository-v1.ts
test -f plugin/src/projection/meeting-view-v1.ts
test -f plugin/src/runtime/services/meeting-command-recovery-v1.ts
test -f plugin/src/domain/transitions/meeting-create-v1.ts
test -f plugin/src/domain/transitions/meeting-end-v1.ts
test -f plugin/src/domain/transitions/meeting-archive-v1.ts
rg -q 'MeetingCommandV1Schema' plugin/src/protocol/meeting-command-v1.ts
rg -q 'createMeetingCommandApplicationV1' plugin/src/runtime/application-service/meeting-command-v1.ts
rg -q 'MeetingCommandRepositoryPortV1' plugin/src/repository/meeting-command-repository-v1.ts
rg -q 'projectMeetingViewV1' plugin/src/projection/meeting-view-v1.ts
rg -q 'recoverMeetingCommandsV1' plugin/src/runtime/services/meeting-command-recovery-v1.ts
rg -q 'createMeetingV1' plugin/src/domain/transitions/meeting-create-v1.ts
test -f plugin/tests/contract/meeting-command-v1-core.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-command-v1-core.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：本步固定命令退出码 0，只表明文件、名字、focused test 和 host typecheck 的初步门槛通过；作者仍须按文末三项读实码/测试并重审后，才能解除 T1 前置 STOP。执行者不得从测试文件名推断原子 commit、replay、projection/end/recovery 已得到验证。
STOP：任一文件/symbol 缺失、类型是 legacy 或命令失败；报告首个失败路径和输出。当前 checkout 必然 STOP 于首项。该步只读，无数据库/Session 回滚。

### T1：目标协议与 filtered read schema

前置状态：T0 PASS，且作者已按文末缺口完成目标代码复审并把本 RUNBOOK 审计结论更新为 Executable；执行者不得仅凭 T0 退出码进入 T1。
允许修改：新增 plugin/src/protocol/meeting-identity-v1.ts、plugin/tests/contract/meeting-identity-protocol-v1.spec.ts；修改 plugin/src/protocol/meeting-command-v1.ts、plugin/src/protocol/index.ts。
禁止修改：legacy plugin/src/protocol/types.ts、commands.ts、CaptainAttendanceDispositionInputV1。
执行：先写测试并观察 RED；在唯一新增文件声明/实现 MeetingRoleV1、RoleErrorCodeV1 与对应枚举 Schema，再声明 RecommendIdentityActionV1Schema、RecordIdentityAdmissionResultActionV1Schema、ManagerCatalogViewV1Schema、IdentityRecommendationViewV1Schema、IdentityViewV1Schema，输入/输出字段逐项按正式 Meeting/Role Interface，unknown action kind、缺 required 字段及非法 enum 拒绝；多余字段按接口可忽略，但不得覆盖可信 Runtime actor/Session/ownership；在现有 MeetingActionV1 union 中只追加这两个 action，保留已有全部 action；protocol/index.ts 只公开其必需 symbol。测试断言有效 envelope 解码、伪造 actor/Session/ownership 字段不改变可信来源、null/无效 enum拒绝；filtered projection 的 caller 测试由 T8 执行。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-protocol-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：两命令退出 0，所有有效/非法 DTO 断言成立。
STOP：Schema 放宽、需要改 legacy 协议、缺 target union 或验证失败；报告差异。无外部副作用，保留 RED/失败文件。

### T2：纯 Domain 意图与身份转换

前置状态：T1 PASS。
允许修改：plugin/src/domain/meeting-state-v1.ts、plugin/src/domain/index.ts、plugin/src/domain/transitions/meeting-create-v1.ts、plugin/src/repository/meeting-command-repository-v1.ts；新增 plugin/src/domain/transitions/meeting-identity-v1.ts、plugin/tests/unit/domain/meeting-identity-v1.spec.ts。
禁止修改：plugin/src/domain/model.ts 与旧 manager-planning/attendance-rejection；不得把 Session handle 放入 Domain。
执行：测试先行 RED；在 meeting-state-v1.ts 唯一声明 IdentityRecommendationV1 和目标聚合 identityRecommendations:readonly IdentityRecommendationV1[]，补 MeetingIdentityV1.definitionHash?/sessionOwnershipId?；meeting-create-v1.ts 初始化空 identityRecommendations，Repository target codec 无损读写该 required 数组且旧缺字段返回 INCOMPATIBLE_VERSION（目标无 implicit migration）；ArchivePackageV1.identityProvenance 与归档构造一起由 T8 添加。新 transition 文件唯一实现 recommendIdentityV1(state,action,managerId,allocatedIds,now)、recordIdentityAdmissionResultV1(state,recommendationId,result,now)；result 仅为 Runtime 内部 plain data，不导入 DSH/Repository。Domain 只检查 lifecycle、Agenda、candidate 重复、intent status，并比对 result.admissionId=id、meetingId=state.id、identityId/childSessionId/Definition id/version/hash 与 intent 固化值；ownershipId/descriptorId/displayName 必须非空。caller/Catalog/version 与实际 ownership/Session/descriptor 归属由 Runtime/Repository 校验；Domain rejection 只返回 errorCode 与不变输入 state，不产出 fact/effect；Runtime 同码映射为 MeetingErrorV1 且不提交。accepted reject 只写 rejected，accepted admit 只写 intent，完成时 ownership/id/hash 精确匹配，并用 context.displayName 激活普通 Participant。domain/index.ts 只导出这两个 transition 与目标类型。单元测试断言新建目标状态含空数组、Repository encode/decode 后数组不丢失、非法转换返回 rejected/errorCode 且无 state/fact/effect 变更、reject 无身份、admit 未调度、成功唯一 active、失败无身份、终态不可变。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project host tests/unit/domain/meeting-identity-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；测试断言上述状态和反例，旧 Transition 未修改。
STOP：需要推断外部资源、修改 legacy model、违反目标字段或验证失败。纯转换无外部回滚。

### T3：安全 Catalog port 与 Manager read

前置状态：T2 PASS；Host optional Catalog service 只提供 Role Interface 的 ReadCatalogResultV1。
允许修改：新增 plugin/src/dsh/meeting-role-catalog-v1.ts、plugin/tests/contract/meeting-role-catalog-v1.spec.ts；修改 plugin/src/dsh/index.ts、plugin/src/runtime/application-service/meeting-command-v1.ts、plugin/src/projection/meeting-view-v1.ts。
禁止修改：Host producer 内部、旧 agent-catalog snapshot/schema、UI/HTTP、Catalog cache。
执行：测试 RED；在 dsh 新文件唯一声明 VersionedRef、RoleErrorV1、CapabilityKind、CapabilitySummaryV1、SuitabilityV1、CatalogCandidateV1、MeetingAgentCatalogV1、ReadCatalogRequestV1/ReadCatalogResultV1 及 RoleCatalogPortV1.readSnapshot(request:ReadCatalogRequestV1):Promise<ReadCatalogResultV1> 与 readMeetingRoleCatalogV1(port,meetingId,captainSessionId,managerSessionId)，严格验证 protocol/meetingId/generatedAt/unique candidate/version/nonempty definitionHash、向 producer 传入已验证 managerSessionId、拒绝 meeting_manager Definition；T4 再检查 candidate Definition 与 Manager 固化 Definition 不同、只拷安全字段；Manager view 丢弃 model|sandbox|approval 能力摘要，不复制 Definition/Skill/Preset/Tool/MCP 正文。共享 target read application仅 Manager 请求按需调用该 reader并加 managerCatalog；缺 port/非法 snapshot 时字段缺席，普通 Meeting read 继续。测试断言 Manager 有安全摘要、Participant 无 Catalog、缺 producer 无写、损坏/重复/cross Meeting snapshot fail closed、read 不增加 Meeting version。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-role-catalog-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；read 无 secret/Session/工具正文或 model/sandbox/approval 摘要，Host port 只读。
STOP：需要第二 Catalog source、缓存、放宽 snapshot、非 Manager 读到目录或验证失败。无新 Meeting 副作用。

### T4：Manager 决定的原子首提交

前置状态：T3 PASS；target Repository execute/receipt/outbox 已满足 T0。
允许修改：新增 plugin/src/runtime/application-service/meeting-identity-v1.ts、plugin/tests/contract/meeting-identity-command-v1.spec.ts；修改 plugin/src/runtime/application-service/meeting-command-v1.ts、plugin/src/repository/meeting-command-repository-v1.ts。
禁止修改：旧 submitManagerPlan、Captain disposition、DSH Session 创建、独立 command/repository。
执行：测试 RED；唯一新 application 实现 createMeetingIdentityApplicationV1(deps) 的 recommendIdentity(command,caller):Promise<MeetingCommandResultV1>。授权/receipt/terminal/version 顺序照 Meeting Interface；仅 running Manager可调用，可信 caller managerId/sessionId 必须等于 readVerifiedSessionScope 的 managerId/managerSessionId；重读 T3 reader，精确比对 snapshot、available candidate、Definition id/version/hash、Agenda 与非 manager Definition。通过共享 IdPort 分配 recommendationId/预留 identityId，按当前规则 childSessionId=`${meetingId}-participant-${identityId}` 固化，不调用 legacy create-meeting 的局部闭包；reject 调 T2 生成一个 fact+receipt+refresh，admit 固化 candidate.definitionHash 并生成 provisioning fact+receipt+identity_provision/refresh outbox，单次 Repository CAS commit。非法输入、单个无效 candidate 和版本冲突都不得先创建 receipt/fact/outbox/Session。测试证明授权先于 replay、同键重放、异 payload conflict、无半提交及 reject/admit 两结果。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-command-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；accepted result 的 recommendationId/status、Repository state/fact/receipt/outbox/version 精确一致。
STOP：无法使用目标原子 commit、需要改 legacy path、错误变成 fallback 或验证失败。首提交只写 Storage Domain，不需 DSH cleanup。

### T5：精确 Definition、preflight 与独立 Session owner

前置状态：T4 PASS。
允许修改：plugin/src/role-composition/resolve.ts、plugin/src/role-composition/dsh-capabilities.ts、plugin/src/dsh/session-adapter.ts、plugin/src/dsh/index.ts、plugin/src/repository/meeting-command-repository-v1.ts；新增 plugin/src/dsh/meeting-identity-admission-v1.ts、plugin/tests/integration/dsh/meeting-identity-admission-v1.spec.ts。
禁止修改：Agent loop、Preset/Skill installer、模型 config、Persona fallback、任意 child 权限扩大。
执行：测试 RED；resolve.ts 唯一新增 resolveDynamicMeetingDefinitionV1(definitions,definitionRef,intent.definitionHash):DynamicDefinitionResolutionV1，只按精确 id/version，复用已验证 Definition parser/hash；解析 binding.definitionHash 必须等于 intent.definitionHash，不同内容即 DEFINITION_VERSION_MISMATCH；dsh-capabilities.ts 唯一新增 preflightDynamicMeetingIdentityV1(parent,intent,definition,binding,signal)，以现有 validateSharedRoleCapabilities 与 requireContinuableProvider 检查共享 Preset、全部 required native Skill 和 continuable Provider；RoleCompositionError 或 provider 未注册/缺 prepareContinuable 映射 CAPABILITY_MISSING，missing=[]（现有 helper 不暴露精确缺失项），AbortSignal 取消原样抛出；按上文固定 hash/TTL 输出 project-owned meeting-specific descriptor 或 RoleError；session-adapter.ts 复用 startParticipantSession 公开 continuable DSH API，不复制 Tool/Skill 内容。新 dsh 文件按上文归属声明 admission DTO/port 并把内部 resolver rejection code 映射为同码 RoleErrorV1；唯一实现 admitMeetingIdentityV1(intent,descriptor,parent,definition,ownerPort):Promise<AdmitIdentityResultV1>，仅使用固化 admissionId/identityId/childSessionId/parent ownership；先查询 matching durable ownership 和 child 存在性；已持久证明时直接重用，不再次 start；无 owner 且 descriptor 到期即拒绝。新 admission 先 durable provisioning ownership，再用 public SessionId(childSessionId) 与 startContinuable 创建 child，ready 后标 active；同 id 同 payload返回同 Session，异 payload冲突；失败释放/撤权新 child。index.ts 仅导出 Runtime 需要的 port。integration test 用真实 DSH adapter边界而非 mock 掉 Session owner，断言两个会议/身份 child 独立、Preset/Skill 缺失拒绝、创建失败无 active ownership、重复 admission 不创建第二 child。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project integration tests/integration/dsh/meeting-identity-admission-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；descriptor/Definition/parent/session/ownership 一对一且失败无可用 child。
STOP：所需 DSH public API 在固定版本中不存在、需要新权限/installer或验证失败；Host provider 无 continuable 能力按 CAPABILITY_MISSING fail closed，并由 T8 真实场景门禁报告，不改变实现；报告版本/符号。已创建新 Session 只按已证明 ownership 撤权和 drain，不操作用户其他 Session。

### T6：outbox provision 与结果提交

前置状态：T5 PASS。
允许修改：新增 plugin/src/runtime/services/meeting-identity-provision-v1.ts、plugin/tests/contract/meeting-identity-provision-v1.spec.ts；修改 plugin/src/runtime/application-service/meeting-identity-v1.ts、plugin/src/runtime/application-service/meeting-command-v1.ts、plugin/src/repository/meeting-command-repository-v1.ts。
禁止修改：新 worker/queue、Session log 业务事实、直接改 Domain 数组、mark delivered 早于结果 commit。
执行：测试 RED；新 service 唯一实现 deliverIdentityProvisionV1(effect,deps):Promise<void>。加载 committed intent且只在 provisioning/nonterminal 下按 T5 exact Definition→preflight→admit；把验证的 binding、ownership 与 exact Definition.displayName 或 typed RoleError 转成 T2 plain data；Runtime-only record_identity_admission_result 固定 principalId=runtime:identity-provision、requestId=identity-admission-result: 加 recommendationId，并以 committed recommendationId 回查 context 后 走共享 command CAS，生成新 fact/receipt/refresh，成功只激活预留普通 Participant；Definition/能力/未创建 child 的 Session 失败才原子记 failed/code。已创建 child 的 descriptor/ownership 不可证明或持久记录损坏返回 RECOVERY_UNAVAILABLE、停止该 Meeting 写入并保留 provisioning/outbox，不调用结果转换。effect 仅在结果 commit 后标 delivered；Repository/version 失败保持可重试，同 admissionId 重放；terminal 赢竞态则撤权/释放新 child、不激活。测试断言成功 state/ownership/fact/receipt/outbox一致、typed failure可见而无身份、commit失败未 delivered、重复投递无双 Session/identity。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-provision-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；active identity 仅在 durable owner 可证实且结果 commit 成功后可调度。
STOP：effect 提前 delivered、部分 identity 可见、错误被吞或验证失败；未激活 child 按 ownership 清理，已提交 intent 不回滚。

### T7：终态与冷恢复

前置状态：T6 PASS。
允许修改：plugin/src/domain/transitions/meeting-end-v1.ts、plugin/src/runtime/services/meeting-command-recovery-v1.ts、plugin/src/runtime/services/meeting-identity-provision-v1.ts；新增 plugin/tests/recovery/meeting-identity-v1.spec.ts。
禁止修改：当前 Definition/default 重新绑定历史 identity、重试新 admissionId、删除已提交事实或强制重写用户 Session。
执行：测试 RED；endMeetingV1 在终态原子提交中将未完成 intent 标 failed/ADMISSION_CONFLICT；effect 创建前后重验 lifecycle，已创建未激活 child只按 matching ownership清理。recoverMeetingCommandsV1 恢复同一 intent/outbox/admissionId，已 active identity 只验证固化的 descriptor/Definition hash/ownership，不以当前 Catalog 或 Definition 替代；missing/mismatch 返回 RECOVERY_UNAVAILABLE。recovery test覆盖 crash before preflight、after Session before结果 commit、结果 commit后重复 effect、paused/terminal 竞态、跨 Meeting/session归属、descriptor缺失；断言无第二 child、无终态激活、失败原因可见。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project recovery tests/recovery/meeting-identity-v1.spec.ts
pnpm --dir plugin typecheck:host
~~~
PASS：退出 0；所有 replay 使用同一 id/provenance，终态无新的可调度身份。
STOP：缺 matching ownership 而需要猜测 child、修改当前 Definition补建历史身份或验证失败；保留持久 intent/事实，报告无法恢复的 ID，不删用户 Session。

### T8：filtered status、Archive 与真实 Host 场景

前置状态：T7 PASS；真实 smoke profile 装有符合 Role Interface 的 Host Catalog producer，当前 Meeting 至少有两个不同的 available candidate，且 admit candidate 的 required native Skill 在 Captain parent scope 可加载。
允许修改：plugin/src/projection/meeting-view-v1.ts、plugin/src/domain/meeting-state-v1.ts、plugin/src/domain/transitions/meeting-archive-v1.ts、plugin/scripts/smoke-profile/index.mjs；新增 plugin/tests/contract/meeting-identity-view-v1.spec.ts。
禁止修改：Client/HTTP 页面、完整 Definition/Skill正文/Session/descriptor/status secret投影、新 Profile installer。
执行：测试 RED；在 meeting-state-v1.ts 添加 required ArchivePackageV1.identityProvenance 并由 archive transition 在创建时固化；target projection输出已激活 IdentityView与仅 Manager/Captain/local 可见的 IdentityRecommendationView、Manager-only安全 Catalog；ArchivePackage.identityProvenance只固化已激活 identity的 ID/name/role/Definition id/version/hash，不包含未完成 intent或 Session。现有 smoke runner唯一加入真实 Loader 场景：Manager read Catalog后对一 available candidate做 admit，对另一做 reject；断言 admit Session独立、native Skill可加载、旧/非 Manager写入拒绝、冷重启读到相同 Definition/ownership及 Archive安全字段。contract test覆盖普通 Participant无目录/决定数组、失败原因只安全 code、Archive不含 Session/配置。
验证：
~~~bash
pnpm --dir plugin exec vitest run --project contract tests/contract/meeting-identity-view-v1.spec.ts
pnpm --dir plugin smoke:profile
~~~
PASS：退出 0；contract与真实 Loader场景均观察到预期行为，而非只验证目录样本。
STOP：profile缺 Host producer或真实能力、输出私有配置/Session、smoke未覆盖该场景或验证失败；按 smoke 操作文档只清理本次生成的资源，不删用户既有 profile。

### T9：固定完整验证、readiness 与 RUNBOOK 收口

前置状态：T1–T8 全部 PASS；工作树仅含本切片必要文件。
允许修改：docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md 与本 RUNBOOK；上述 requirements/interfaces/designs 已同步，若实际字段、错误或跨边界语义偏离，立即 STOP 并交作者重审，不由执行者临时修订正式契约。
禁止修改：无关模块、TODO、工程治理、Git 交付动作。
执行：运行固定集合；在 coverage记录日期、实际 commit/worktree边界、每条命令/结果、真实 Host环境、Not Covered；核对 Scope 双向追踪与 Git diff无无关改动。长期规则已在正式 requirements/interfaces/designs；全部 PASS 后才删除 RUNBOOK及仅指向它的引用，删除后重跑链接和 diff；删除后失败必须恢复文件并 STOP。
验证：
~~~bash
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile
node .github/scripts/check-doc-links.mjs
git diff --check
~~~
PASS：四命令退出 0；T1–T8断言仍成立，coverage只记真实执行结果，RUNBOOK删除后无残留相对链接。完整集合选择依据：本切片改变公共 command、权限、Repository/DSH生命周期与恢复，故需全工程 verify和真实 Host smoke；CI门禁仍按 PR Rules另行处理。
STOP：任一命令失败、真实 smoke未运行、readiness把未验证写 PASS、删除后链接失败或需改 formal contract；恢复RUNBOOK/引用并保留最后 PASS证据。未提交/推送/建 PR/合并。

## 验证矩阵与审计

T1/T4：合法 reject/admit、非法 wire/caller、stale version、terminal、同键重放/异 payload、目录变更/不可用/自荐/重复 candidate，预期非法写零 state/fact/receipt/outbox/version。T2/T6：纯状态、数组原子性、事务失败、outbox/result一致性，预期无半提交和无部分身份。T5：Definition/Preset/native Skill/descriptor/Session/ownership/capability与跨 Meeting隔离，预期缺能力 fail closed。T7：crash cut、terminal竞态、冷恢复、当前 Definition变更，预期同 admissionId唯一 Session、历史身份不重配。T8：Manager安全目录、普通 Participant隔离、Archive provenance及真实 Loader/Skill，预期不泄 secret且 admitted child可继续。focused test、typecheck、full verify、真实 smoke各有上述固定入口；未运行均标 Not Covered。Research dedup、UI/HTTP、stress/metrics、跨 Host/multi-user、legacy migration 为 Not Applicable，均不在 Scope。

Audit：**Not Executable**。当前 T0 的目标 command、Repository、projection、end/archive/recovery 与 contract test 九个固定路径均不存在；执行者只能运行 T0 并按首个缺失文件 STOP，不能进入 T1。当前无新增产品审批选项，阻断项是尚无法在实码上固定的接线和验证边界：

1. T0 的固定路径和 `meeting-command-v1-core.spec.ts` 是本 RUNBOOK 对上游的假定，无法核对其公开签名、MeetingState 无损 codec、commit/receipt/outbox 原子性及 end/recovery 的真实调用。`rg -q` 命中名字和测试退出码 0 都不等于上述断言已被测试覆盖。上游落地后由作者逐一读代码与测试，再确定唯一入口并重审；执行者不得临场替换路径或自行补上游管线。
2. T2 对目标 MeetingState 增加 required `identityRecommendations`，且要求旧缺字段返回 `INCOMPATIBLE_VERSION`。在 T0 不存在时，无法判断上游是否已有可持久的 V1 state；若已有，正式 [Meeting Interface §Compatibility](../20-interfaces/MEETING-INTERFACE.md#compatibility-and-acceptance) 要求 versioned contract/明确读写策略，而不是在 T2 暗自改变 required field。作者必须先确认上游版本与存量边界，执行者不能选择 migration、默认数组或拒读策略。
3. T5 `startParticipantSession` 的真实输入除 parent/child/Definition 外还需要 `teamId`、Subagent runtime、provider name 和已转换的 persona/toolFilter/agentOptions；`validateSharedRoleCapabilities` 现有实现仅给通用 RoleCompositionError，已固定 CAPABILITY_MISSING/missing=[] 映射；当前 `IdentityAdmissionPortV1` 与依赖说明尚未固定这些值从哪个既有装配 symbol 获得，也未核对目标 Repository 是否提供 ownership CAS 与 child inspection 所需的持久接口。作者须在上游代码落地后固定装配路径、转换函数、port 方法和对应测试；执行者不能新建 registry/第二存储或自行选 provider。

T8 的真实 Host Catalog producer、两个 available candidate 与 required native Skill 是已写明的外部前置门槛；缺失时按 T8 STOP，不把 mock smoke 写成通过。上述三项清除并复查每步 PASS/STOP 后，作者才可将状态改为 Executable。作者本轮文档验证结果在交付回复中记录，不写成 T1–T9 执行证据。
