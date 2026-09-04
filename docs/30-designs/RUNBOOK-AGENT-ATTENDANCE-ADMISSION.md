# RUNBOOK：FR-13 Phase 1 Agent Catalog 与参会推荐

状态：`Executable`

执行分支：`codex/agent-attendance-admission-runbook`

建立日期：2026-09-03

审计基线：`cf0ab2d2cf12d670bab66c0324c1c2395f319d98`

## 1. 模式选择与执行者契约

本文采用 Phase 1 implementation RUNBOOK 模式。P0-A 至 P0-E 已进入正式 requirements/interfaces/designs；执行者不得重新作产品或接口决定。

固定规则：

- 只在 `/Volumes/storage/workspace/convivium-one` 工作，不读取或修改 sibling workspace。
- 严格按 T0 至 T9 顺序执行；前一步未 PASS 不得进入后一步。
- 每步只修改该步列出的文件/symbol；不得修改 sibling workspace、Git refs/history、依赖、持久数据或外部系统。
- 不得用 examples、文件扫描、Manager 自行发现、optional/default、Schema 放宽、compat mapper、stub、registry、factory、provider framework、cache、queue、feature flag 或通用 adapter 绕过 STOP。
- 每步验证全部 PASS 后才删除该完整步骤；不得因失败删除步骤或放宽断言。
- STOP 报告必须包含最后完成步骤、P0 子项、正式依据、代码 symbol、最小复现命令和首个不匹配输出。

## 2. 目标、起点与终点

### 2.1 目标

实现 FR-13 Phase 1：optional Host Catalog port、attempt-bound snapshot、Manager safe projection、attendance claim 与 pending status projection。

已批准的 Phase 1 高层边界只有：

1. 一个 Host/profile-owned producer；Convivium 不读取 examples/文件，不实现第二个 source。
2. 一个最小注入 port；不建立 registry、factory、provider framework、cache 或 queue。
3. planning-attempt Catalog capture 失败只把该 attempt 绑定为 none，普通 planning 按既有语义提交；该 attempt 后续的 Catalog/candidate/claim validation failure 必须先于现有 Manager business-invalid fallback 返回 Role Catalog Interface 的具体错误，且该 recommendation command 的 state、event、receipt、outbox 和 version 全部不变。
4. Phase 1 只覆盖 Catalog safe projection、Manager recommendation claim 和 pending projection。
5. Catalog 只在创建将投递给 Manager 的 current planning attempt 时读取一次；current attempt required binding 持有完整已验证 snapshot 或明确 no-Catalog，不在 Meeting 顶层或历史 attempt 重复持久。
6. snapshot 子值使用 `encodeCanonicalJson` UTF-8 bytes 计数且不超过 `16 * 1024`；完整 commit 仍受 `65_536` bytes 上限约束。

### 2.2 当前起点

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) 已声明 FR-13、BR-10 和 AC 30-34。
- [Meeting Agent Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md) 已描述 Catalog、claim、recommendation 和 public recommendation DTO。
- 当前生产代码未实现 Catalog input、snapshot、Manager Catalog projection、recommendation state/event 或 pending status projection。
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 声明 V1 不提供 record migration；[Domain Model Design](./DOMAIN-MODEL-DESIGN.md) 要求新增 required 字段具有显式 migration。

### 2.3 终点

T0 至 T9 全部 PASS：Phase 1 产品代码、focused/recovery/contract tests 与 coverage 证据完成，本文按规则删除。

## 3. Scope 与 Not Covered

### 3.1 Scope

- 实现 optional Catalog port、V2 attempt binding与局部 compatibility guard。
- 实现 Manager safe projection、attendance claim原子提交与 pending status projection。
- 补齐 focused、contract、recovery和完整验证，并更新 coverage。

### 3.2 Not Covered

- P0-A 至 P0-E 正式契约以外的产品、协议或 Schema 变化。
- Captain approve/reject、Participant admission、Session provisioning、provision retry/recovery 和 active Participant gate。
- G4 `researchNeeds` 生成、evidence freshness、research recommendation dedup 和 evidence registry。现有 DTO 要求 `researchNeeds` 字段存在但未要求非空；Phase 1 的正式契约 closure 只能规定空数组，不实现生成算法。
- GitHub、arXiv、Web research candidate recommendation。Phase 1 对这三类 candidate 只允许 fail-closed 拒绝，不建立替代角色或 gap 逻辑。
- G7/G9/G10/G11 对应的 Captain disposition、admission、provisioning outbox、failure lifecycle 和 DSH per-child preset composition。
- FR-14、UI/HTTP 产品行为、真实 DSH smoke、stress、metrics、发布和最终 readiness runner；T9 只更新当前 coverage 文档中的真实 Phase 1 验证事实。
- 第二个 Catalog source、registry、factory、provider framework、cache、queue、migration、feature flag、通用 adapter 或 DSH Session Event。

## 4. 正式依据

| 主题                                      | 正式依据                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Host/Convivium/DSH ownership              | [Architecture：Confirmed Baseline、Dependency Rules](../00-governance/ARCHITECTURE.md)           |
| FR-13 行为与验收                          | [Requirements：FR-13、BR-10、AC 30-34](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) |
| Catalog、claim、recommendation、error DTO | [Meeting Agent Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md) |
| Manager submission、fallback 与 status    | [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)         |
| Domain required-state/migration 约束      | [Domain Model Design](./DOMAIN-MODEL-DESIGN.md)                                                  |
| orchestration 顺序                        | [Meeting Orchestration Design：12.5、16](./MEETING-ORCHESTRATION-DESIGN.md)                      |
| single-commit、receipt、outbox、recovery  | [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)                       |
| 模块与注入边界                            | [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)                          |
| 当前覆盖                                  | [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)            |

本 RUNBOOK 不是上述契约的替代真相源。

## 5. 当前代码断点

| 当前文件/symbol                                                               | 已存在行为                                                | 缺口                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `plugin/src/index.ts::meetingConsumerPlugin`                                  | 组合现有 DSH/Storage services                             | 尚未实现 Catalog service lookup/injection                               |
| `plugin/src/runtime/application-service/index.ts::CreateStatusRuntimeOptions` | 现有 Runtime dependency boundary                          | 没有正式 Catalog port                                                   |
| `plugin/src/domain/model.ts::MeetingState`                                    | Storage Domain 持久聚合                                   | 没有 Catalog snapshot 或 recommendations                                |
| `plugin/src/domain/model.ts::ManagerPlanningAttempt`                          | 持久化 attempt ID、Meeting/version、delivery 与 lifecycle | 没有 Catalog ID/version/snapshot binding                                |
| `plugin/src/domain/model.ts::DomainEventTypes`                                | 集中注册现有 event vocabulary                             | 不新增 event；`manager_plan.submitted` payload 尚无 `recommendationIds` |
| `plugin/src/domain/create.ts::createMeetingState`                             | 创建 required state                                       | 没有 Catalog/recommendation 初始化                                      |
| `plugin/src/protocol/types.ts::ManagerMeetingContextV1`                       | Manager planning context                                  | 没有 Catalog projection 字段                                            |
| `plugin/src/protocol/types.ts::ManagerPlanSubmissionV1`                       | Manager plan input                                        | 没有 recommendation claims                                              |
| `plugin/src/protocol/commands.ts::ManagerPlanSubmissionSchema`                | exact command Schema                                      | 不接受 recommendation claims                                            |
| `plugin/src/protocol/schema.ts::knownErrorCodes`                              | 当前公开已知错误                                          | 没有 Catalog/recommendation errors                                      |
| `plugin/src/domain/transitions/manager-planning.ts::submitManagerPlan`        | plan/fallback/wait transition                             | 不验证或持久化 recommendation                                           |
| `plugin/src/runtime/application-service/meeting-turn.ts::submitManagerPlan`   | 当前 Manager authorization、version、receipt 边界         | 没有 Catalog snapshot 或 recommendation 接线                            |
| `plugin/src/projection/status.ts::projectManagerMeetingContext`               | 生成 Manager context                                      | 没有 safe Catalog projection                                            |
| `plugin/src/projection/status.ts::projectMeetingStatus`                       | caller-specific status                                    | 没有 pending recommendation 字段                                        |

## 6. P0：真正阻止 Phase 1 的最小集合

### P0-A（G1）：producer、port、injection、authorization 与 failure

状态：`Closed`。以下契约已批准并迁入 Role Catalog Interface 与 Implementation Design；它们不是 implementation 完成证据。

正式依据已有内容：

- Architecture 规定 DSH Host/profile 拥有 capability configuration，Convivium 拥有会议 role catalog。
- Role Catalog Interface 规定 Convivium 消费 Captain 当前授权范围过滤后的 snapshot。
- 用户只批准“一个 Host/profile-owned producer + 一个最小注入 port + producer failure fail closed”。
- 当前 `ManagerPlanningAttempt` 只持久化 `id | meetingId | observedMeetingVersion | reason | deliveryId | status | createdAt | deadlineAt?`；已有 attempt identity 和 Meeting version binding 稳定，但没有 `catalogId`、`catalogVersion` 或 snapshot identity。
- 当前 production `projectManagerMeetingContext` 从已提交 `MeetingState` 生成 context；production `ManagerMeetingContextV1` 与 `ManagerPlanSubmissionV1` 尚未实现正式 Catalog contract。
- 协调者已批准 binding 层级：仅在现有 `MeetingState.manager.currentPlanningAttempt` 增加一个 required、显式区分 Catalog binding 状态的单一 binding。这不批准字段名、exact shape、format/version 或兼容错误。
- `plugin/src/index.ts::meetingConsumerPlugin.inject` 当前只声明已有 required DSH/Storage services；Cordis 已证明 optional `Context.get(name)`、required `inject` 和 `Context.provide(name, value)` 的机制。
- B 的只读 DSH/Cordis 证据已证实：`ctx.get(name)` 可以 optional 读取并在未 provide 时返回 `undefined`；把 service 放入 required `inject` 会在 service 缺失时阻止 consumer；provider 可以用 `ctx.provide(name, value)` 注册。Catalog key、port owner/signature 和 failure mapping 随后由协调者批准并发布；代码仍不存在。

已批准的唯一最小契约：

- 唯一新文件为 `plugin/src/runtime/services/agent-catalog.ts`。
- Host service key 为 `convivium.agentCatalog`；`plugin/src/index.ts::meetingConsumerPlugin` 通过 `ctx.get("convivium.agentCatalog")` optional lookup 读取，不把它加入 required `inject`。
- 唯一 port 为 `AgentCatalogPort`，唯一方法为 `readSnapshot(request: { teamId: string; meetingId: string; captainSessionId: string }): Promise<AgentCatalogReadResult>`。request 的三个字段只由 Runtime 从已授权 `StoredMeeting` 与 Captain ownership 生成，Manager 不提供 ownership。
- `AgentCatalogReadResult` 只允许 `{ ok: true; snapshot: MeetingAgentCatalogSnapshotV1 }` 或 `{ ok: false; failure: "unavailable" | "invalid" | "unsupported" | "oversize" }`。service 缺失、throw、malformed 和任一 failure 都固化 no-Catalog；普通 planning 继续，后续 claim 统一返回 `AGENT_CATALOG_UNAVAILABLE`。当前 background path 不公开 `AGENT_CATALOG_VERSION_UNSUPPORTED`。同一 claim 不重试，所有拒绝均不写 state/event/receipt/outbox/version。
- 该契约只复用现有 `meetingConsumerPlugin` 与 `runtime/services` 边界；不新增 registry、factory、cache、retry queue 或 service framework。

实现边界依据：optional lookup 保持既有 Meeting 与普通 planning 可用；在 planning attempt 创建时读取且持久绑定，才能让 Manager 先看到 candidate，并证明 submission 校验的是同一 snapshot。P0-A 已闭合，对应 implementation actions 位于 T3 与 T5。

解除结果：Role Catalog Interface 的 `Transport Or Invocation` 与 Implementation Design 的 Runtime composition section 已发布该唯一 port。后续 implementation RUNBOOK 只能实现该文件、Context augmentation 和 optional lookup，不得扩展 Host producer 或 service framework。

### P0-B（G2/G5）：snapshot durable owner 与 strict persistence compatibility

状态：`Closed`。以下契约已批准并迁入 Role Catalog Interface、Storage Interface、Domain Model Design、Orchestration Design 与 Implementation Design；它们不是 implementation 完成证据。

正式依据已有内容：

- Role Catalog Interface 要求 snapshot 在 recommendation 前固化，Catalog 更新不能改变既有 recommendation。
- Architecture 与 Storage Interface 规定 Storage Domain 是唯一 Meeting 事实源。
- Domain Model Design 要求新增 required 字段具有显式 migration；Storage Interface 声明 V1 不提供 record migration。
- Role Catalog Interface 只规定 snapshot 不随 Catalog 更新漂移；它没有定义以 `catalogId + catalogVersion` 读取不可变历史 snapshot 的 producer contract。当前 `plugin/src/**` 也没有该 lookup。
- Checkpointed Commit Log 的单条 commit 上限是 `65_536` bytes，完整 projection 上限是 `16_777_216` bytes；现有 `MeetingAgentCatalogSnapshotV1` 对字符串、roles 和 candidates 没有 cardinality/encoded-size 上限。
- 当前 repository 只用 `JsonObjectSchema` 校验 `MeetingSnapshot.state`，Runtime 把它 cast 为 `MeetingState`；这尚未实现 Domain Model Design 要求的 canonical `MeetingState` 结构校验。
- 协调者已批准 full validated `MeetingAgentCatalogSnapshotV1` 作为 verified binding 的唯一持久值，另一状态为 no-Catalog；只保存 current attempt binding。
- 协调者已批准 snapshot 子值使用 `encodeCanonicalJson` 的 canonical UTF-8 JSON 计数，上限为 `16 * 1024` bytes；完整 commit 上限仍为 `65_536` bytes。

已批准的 exact contract 与 owner：

- `plugin/src/domain/model.ts::MeetingState.formatVersion` 是 required literal `2`；`PersistenceProjectionV1.formatVersion` 保持 `1`。
- `plugin/src/domain/model.ts::ManagerPlanningAttempt.catalogBinding` 是 required `ManagerCatalogBindingV1`，且只允许 `{ kind: "verified"; snapshot: MeetingAgentCatalogSnapshot } | { kind: "none" }`；内部 snapshot 由 validated `MeetingAgentCatalogSnapshotV1` 在唯一 Runtime capture boundary 逐字段复制，不形成 Protocol 依赖。
- 同文件新增唯一共享 guard `isMeetingStateV2(value: unknown): value is MeetingState`；Manager context producer 与 `submit_manager_plan` attendance claim consumer 必须调用它。guard 失败的 legacy state 只可走普通路径。
- `plugin/src/repository/domain/schemas.ts::PersistenceProjectionV1Schema` 与 `plugin/src/repository/domain/projection.ts::decodeProjection` 只增加 MeetingState discriminator 和 current-attempt binding 的窄识别；不修改 `plugin/src/repository/types.ts::MeetingSnapshot.state`。
- `plugin/src/repository/domain/domain-meeting-repository.ts::DomainMeetingRepository.open` 必须保留未知 format 的 `SCHEMA_VERSION_UNSUPPORTED`；已识别 format 但 FR-13 discriminator/binding 损坏为 `CORRUPT_DATABASE`。
- full snapshot、两态 binding、canonical UTF-8 JSON `<= 16 * 1024` bytes 和完整 commit `<= 65_536` bytes 均为 required。不得改为 ID/version reference、压缩、分页、cache 或第二存储。

范围边界：当前生产代码中的既有 `MeetingState` casts 不是 FR-13 compatibility 改造目标。implementation RUNBOOK 只允许在真实 schema/decoder owner 增加 MeetingState format 的窄识别，并在 attendance context/claim 入口使用 V2 type guard；不得借机把 repository 到 Runtime 改为全仓 legacy/current union。若局部 guard 无法满足 strict schema，必须指出一个当前 FR-13 可达的具体路径和失败证据后 STOP，不能以 cast 数量扩大范围。

解除结果：上述 exact contract 已进入正式文档。后续 implementation RUNBOOK 只能做局部 schema/decoder/guard 改动；若局部 guard 无法满足 strict schema，必须指出一个当前 FR-13 可达的具体失败路径后 STOP，不能以既有 cast 数量扩大范围。

### P0-C（G3/G12）：Manager projection 与 pending status 落点

状态：`Closed`。以下 exact contract 已批准并迁入 requirements/interfaces/designs。

正式依据已有内容：

- Role Catalog Interface 已列出安全 Catalog projection 和 `PublicAttendanceRecommendationV1` 字段，并禁止敏感 DSH/private mapping。
- 当前 production `ManagerMeetingContextV1` 和 `MeetingStatusResultV1` 尚未实现正式 interface 中的这些字段。
- Role Catalog Interface 的 `MeetingAgentCatalogProjectionV1.researchNeeds` 是 required array，但没有最小长度约束。

已发布到正式 Catalog/Protocol 契约的最小规则：

- Phase 1 不生成 `researchNeeds`；Manager Catalog projection 必须包含 `researchNeeds: []`。
- Phase 1 recommendation claim 必须满足 `evidenceGapIds: []`；非空数组 fail closed。
- `github_research_analyst | arxiv_research_analyst | web_research_analyst` candidate recommendation 为 `Not Covered`，必须在进入现有 Manager fallback 前拒绝；不得替换 candidate 或建立 evidence registry/cache/gap algorithm。

已批准的唯一决定：

- `plugin/src/protocol/types.ts::ManagerMeetingContextV1` 增加 required `agentCatalog: MeetingAgentCatalogProjectionV1 | null`；非 null 只来自 V2 verified binding，`null` 同时覆盖 legacy state 和 V2 none binding，两者都不得提交 claim。
- `plugin/src/domain/model.ts::MeetingState` 增加 required `attendanceRecommendations: AttendanceRecommendation[]`，V2 creation 初始化为 `[]`。internal `AttendanceRecommendation` 使用 `id`，包含当前正式 claim 字段、`roleDefinitionId`、`roleDefinitionVersion`、`displayName`、私有 `agentDefinitionId`、`recommendedByManagerSessionId`、`catalogId`、`catalogVersion`、`planningAttemptId`、literal `status: "pending"` 和 `createdAt`；不保存完整 snapshot。
- `plugin/src/projection/status.ts::projectManagerMeetingContext` 先调用 `isMeetingStateV2`，把 verified binding 裁剪为现有 `MeetingAgentCatalogProjectionV1`；`sourceMemberName`、`agentDefinitionId`、Session、Prompt、model、credential、Preset/Skill/Tool/MCP 配置全部禁止输出。`researchNeeds` 固定 `[]`。
- `plugin/src/protocol/types.ts::DiscussionMeetingStatusBaseV1` 增加 required `attendanceRecommendations: readonly PublicAttendanceRecommendationV1[]`；active 与 execution-terminal 都输出，archiving/archived 不输出。`plugin/src/projection/status.ts::projectMeetingStatus` 对 Captain、Manager 和有效 Participant 输出同一脱敏数组，按 `createdAt` 升序后 `recommendationId` 升序；legacy state 输出 `[]`，不写回字段；internal `id` 映射为 public `recommendationId`，不输出 `agentDefinitionId` 或 Manager Session ID。
- 当前 attempt 在合法 plan commit 后清除，因此 pending recommendation 必须复制上述最小 provenance/public fields；不得依赖已清除 binding、重新加载 Catalog 或新建 projection cache。

解除结果：Role Catalog Interface、Agent Protocol、Domain Model Design 与 Orchestration Design 已固定 context null、pending state/status、caller visibility、排序和脱敏规则。

### P0-D（G6/G8）：event、ID 与 idempotency exactness

状态：`Closed`。以下 exact contract 已批准并迁入 requirements/interfaces/designs。

正式依据已有内容：

- Role Catalog Interface 要求 Runtime 生成 recommendation identity，并把 recommendation、event、receipt 原子持久化。
- Storage Interface 规定一次 command 的 state、events、receipt、outbox 原子提交，以及通用 idempotency key。
- 当前 `submit_manager_plan` 已有 request identity、Manager authorization 和 planning attempt 边界，但 attendance 契约没有声明是否原样复用。

已批准的唯一决定：

- 不增加 attendance event type；复用 `manager_plan.submitted`，在其 payload 增加 required `recommendationIds: string[]`，无 claim 时固定 `[]`。事件仍先于既有 `turn.planned`、`turn.started` 和 Speaker events，且 recommendation state、event、receipt 与既有 Speaker outbox 同属一个 `submit_manager_plan` commit。
- 现有不变量是一个 planning attempt 只有一次有效业务提交：成功后 current attempt 被清除，相同 request 仅 receipt replay，其他再次提交为 stale。基于该不变量，recommendation ID 固定为 `${planningAttemptId}-attendance-${claimIndex}`，`claimIndex` 是已验证 input array 的零基 index；`createdAt` 使用 `submitManagerPlan` 已取得的唯一 `commandNow`。同一 submission 中重复 `candidateId` 拒绝；Phase 1 不做跨 attempt dedup。
- command 继续使用 input `requestId`、`commandKind="submit_manager_plan"`、`callerBinding="session:<managerSessionId>"`、`capabilityId="manager:<managerSessionId>"`、`attemptId=planningAttemptId`、`expectedMeetingVersion=observedMeetingVersion`，request hash 改为现有 `serializeValidatedRequestV1(input)`；不增加独立 command、receipt 或 outbox。
- 相同 request ID/hash 直接 replay 原 receipt；相同 ID 不同 hash 返回 `IDEMPOTENCY_CONFLICT`；repository authorization/version/stale/terminal 校验先于 attendance transition，任一拒绝均零副作用。`ManagerPlanResultV1` 不增加 recommendation 字段；调用者通过随后 status 读取 pending IDs。

解除结果：Role Catalog Interface、Agent Protocol、Requirements 与 Orchestration Design 已固定 ID/time、单次 attempt 不变量、event payload、request identity 和 commit 原子性。

### P0-E：Catalog error mapping 与 Manager fallback precedence

状态：`Closed`。以下 exact contract 已批准并迁入 requirements/interfaces/designs。

正式依据已有内容：

- Role Catalog Interface 已列 `AGENT_CATALOG_UNAVAILABLE`、`AGENT_CATALOG_VERSION_UNSUPPORTED`、`AGENT_CANDIDATE_NOT_FOUND`、`AGENT_CANDIDATE_UNAVAILABLE`、`ATTENDANCE_RECOMMENDATION_INVALID`。
- Requirements 和 Agent Protocol 规定 Schema-valid 但业务非法的现有 Manager plan 进入 deterministic fallback commit。
- 用户已批准 Catalog load/validation、candidate validation 和 claim validation 全部 fail closed。

协调者已批准并发布到正式契约的唯一 precedence：

1. Runtime 在进入 `submitManagerPlan` 的现有 business-invalid fallback 边界前完成 Catalog load、snapshot Schema/version、candidate 和 claim validation。
2. 任意 no-Catalog binding 返回 `AGENT_CATALOG_UNAVAILABLE`；未知 candidate 返回 `AGENT_CANDIDATE_NOT_FOUND`；不可用 candidate 返回 `AGENT_CANDIDATE_UNAVAILABLE`；其他非法 claim 返回 `ATTENDANCE_RECOMMENDATION_INVALID`。当前 background path 不产生可观察的 `AGENT_CATALOG_VERSION_UNSUPPORTED`。
3. 上述错误不得映射成 `MANAGER_PLAN_INVALID`，不得调用 deterministic fallback；state、event、receipt、outbox 和 Meeting version 全部不变。

已批准的 exact error contract：

- 所有 Phase 1 Catalog/attendance errors 的 `retryable` 固定为 `false`，不增加 error metadata 字段。message 固定为：`AGENT_CATALOG_UNAVAILABLE` → `"Agent catalog is unavailable for this planning attempt."`；`AGENT_CATALOG_VERSION_UNSUPPORTED` → `"Agent catalog version is unsupported."`；`AGENT_CANDIDATE_NOT_FOUND` → `"Agent candidate is not present in this planning attempt catalog."`；`AGENT_CANDIDATE_UNAVAILABLE` → `"Agent candidate is unavailable in this planning attempt catalog."`；`ATTENDANCE_RECOMMENDATION_INVALID` → `"Attendance recommendation claim is invalid."`。响应只带现有 envelope 的 `meetingId`、当前 `meetingVersion` 和 `attemptId`。
- input Schema/caller/Meeting/repository idempotency/version/stale/terminal 校验保持现有 precedence；随后执行 attendance binding/candidate/claim validation；只有通过后才进入 `submitManagerPlanTransition` 的 `MANAGER_PLAN_INVALID` fallback boundary。attendance rejection 不调用 fallback、不提交 receipt。
- planning-attempt capture 的 `unsupported`、throw、malformed、oversize 与缺失 producer 全部固化 `{ kind: "none" }`；普通 planning 继续，后续 claim 统一返回 `AGENT_CATALOG_UNAVAILABLE`。当前 background path 不使用 `AGENT_CATALOG_VERSION_UNSUPPORTED`，且不扩展 binding 保存 reason。

解除结果：Role Catalog Interface、Requirements、Agent Protocol 与 Orchestration Design 已固定 error、message、metadata、capture normalization 和 fallback precedence。

## 7. 数据、接口、调用链与文件映射

### 7.1 Canonical types 与逐字段映射

`plugin/src/protocol/types.ts`是Host输入与公开DTO的canonical TypeScript owner。必须新增并从`plugin/src/protocol/index.ts`的既有`export * from "./types.js"`自动导出以下exact structures；不得再建第二份Catalog DTO：

```ts
export type AgentRoleDefinitionIdV1 =
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst"
  | "web_research_analyst"
  | "meeting_scribe";
export type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";
export interface AgentRoleDefinitionV1 {
  roleDefinitionId: AgentRoleDefinitionIdV1;
  version: string;
  displayName: string;
  summary: string;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
  responsibilities: readonly string[];
  nonResponsibilities: readonly string[];
}
export interface MeetingAgentCatalogSnapshotV1 {
  protocolVersion: 1;
  catalogId: string;
  catalogVersion: string;
  teamId: string;
  capturedAt: number;
  roles: readonly AgentRoleDefinitionV1[];
  candidates: readonly {
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionIdV1;
    roleDefinitionVersion: string;
    sourceMemberName: string;
    agentDefinitionId: string;
    availability: "available" | "unavailable";
  }[];
}
export interface MeetingAgentCandidateV1 {
  candidateId: string;
  roleDefinitionId: AgentRoleDefinitionIdV1;
  roleDefinitionVersion: string;
  displayName: string;
  summary: string;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
  responsibilities: readonly string[];
  nonResponsibilities: readonly string[];
  availability: "available" | "unavailable";
}
export interface ManagerResearchNeedV1 {
  evidenceGapId: string;
  agendaItemId: string;
  question: string;
  requiredScopes: readonly AgentEvidenceScopeV1[];
  existingEvidenceIds: readonly string[];
  status: "open" | "stale" | "satisfied";
}
export interface MeetingAgentCatalogProjectionV1 {
  protocolVersion: 1;
  catalogId: string;
  catalogVersion: string;
  candidates: readonly MeetingAgentCandidateV1[];
  researchNeeds: readonly ManagerResearchNeedV1[];
}
export interface AttendanceRecommendationClaimV1 {
  candidateId: string;
  agendaItemId: string;
  rationale: string;
  expectedContribution: string;
  evidenceGapIds: readonly string[];
  urgency: "current_agenda" | "later_agenda" | "follow_up";
}
export interface PublicAttendanceRecommendationV1 extends AttendanceRecommendationClaimV1 {
  recommendationId: string;
  roleDefinitionId: AgentRoleDefinitionIdV1;
  displayName: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  admissionStatus?:
    "approved" | "provisioning" | "active" | "failed" | "cancelled";
  failureCode?: string;
}
```

`ManagerPlanSubmissionV1.attendanceRecommendations?: readonly AttendanceRecommendationClaimV1[]`是唯一command扩展。`KnownMeetingProtocolErrorCodeV1`必须增加`AGENT_CATALOG_UNAVAILABLE | AGENT_CATALOG_VERSION_UNSUPPORTED | AGENT_CANDIDATE_NOT_FOUND | AGENT_CANDIDATE_UNAVAILABLE | ATTENDANCE_RECOMMENDATION_INVALID | ATTENDANCE_RECOMMENDATION_STALE | ATTENDANCE_RECOMMENDATION_NOT_PENDING | PARTICIPANT_PROVISIONING_FAILED`；Phase 1 Runtime只产生P0-E指定的四个错误。

`plugin/src/protocol/schema.ts` 是上述可复用 value Schema owner，唯一新增 exports 为 `MeetingAgentCatalogSnapshotSchema`、`MeetingAgentCatalogProjectionSchema`、`AttendanceRecommendationClaimSchema` 和 `PublicAttendanceRecommendationSchema`。在同文件新增一个不导出的 `assertExactKeys(value, expected, label)`，实现必须与 `plugin/src/protocol/commands.ts` 的现有同名 helper 相同；四个 exported Schema 的每个 object 和嵌套 object 都以 `Schema.transform` 调用该 helper拒绝unknown key。array、string、literal和required/optional必须与TypeScript DTO相同。`plugin/src/protocol/commands.ts::ManagerPlanSubmissionSchema`只增加optional`attendanceRecommendations: Schema.array(AttendanceRecommendationClaimSchema)`；`plugin/src/protocol/status.ts::MeetingStatusResultSchema`只在active与execution-terminal branches增加required public array。

`plugin/src/domain/model.ts`是持久事实owner。根据 Architecture 的依赖规则，它不得导入`protocol/`；因此只定义下列当前持久事实所需的内部同构类型。唯一 transport-to-domain 转换位于 7.2 的`captureManagerCatalogBinding`，不得再增加 mapper：

```ts
export type AgentRoleDefinitionId =
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst"
  | "web_research_analyst"
  | "meeting_scribe";
export type AgentEvidenceScope = "repository" | "github" | "arxiv" | "web";
export interface MeetingAgentCatalogSnapshot {
  protocolVersion: 1;
  catalogId: string;
  catalogVersion: string;
  teamId: string;
  capturedAt: number;
  roles: readonly {
    roleDefinitionId: AgentRoleDefinitionId;
    version: string;
    displayName: string;
    summary: string;
    expertiseTags: readonly string[];
    evidenceScopes: readonly AgentEvidenceScope[];
    responsibilities: readonly string[];
    nonResponsibilities: readonly string[];
  }[];
  candidates: readonly {
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionId;
    roleDefinitionVersion: string;
    sourceMemberName: string;
    agentDefinitionId: string;
    availability: "available" | "unavailable";
  }[];
}
export type ManagerCatalogBindingV1 =
  | { kind: "verified"; snapshot: MeetingAgentCatalogSnapshot }
  | { kind: "none" };

export interface AttendanceRecommendation {
  id: string;
  candidateId: string;
  roleDefinitionId: AgentRoleDefinitionId;
  roleDefinitionVersion: string;
  displayName: string;
  agentDefinitionId: string;
  agendaItemId: string;
  rationale: string;
  expectedContribution: string;
  evidenceGapIds: readonly string[];
  urgency: "current_agenda" | "later_agenda" | "follow_up";
  recommendedByManagerSessionId: string;
  catalogId: string;
  catalogVersion: string;
  planningAttemptId: string;
  status: "pending";
  createdAt: number;
}

export interface ManagerPlanningAttempt {
  // existing fields remain unchanged
  catalogBinding: ManagerCatalogBindingV1;
}

export interface MeetingState {
  formatVersion: 2;
  // existing fields remain unchanged
  attendanceRecommendations: AttendanceRecommendation[];
}
```

`plugin/src/projection/status.ts::projectManagerMeetingContext` maps one verified snapshot as follows: snapshot `protocolVersion | catalogId | catalogVersion` pass through; each candidate joins exactly one role where both `roleDefinitionId` and `roleDefinitionVersion` match, then exposes candidate `candidateId | roleDefinitionId | roleDefinitionVersion | availability` plus role `displayName | summary | expertiseTags | evidenceScopes | responsibilities | nonResponsibilities`; `researchNeeds` is `[]`. A missing/mismatched role makes capture invalid and therefore produces `kind: "none"`; projection never repairs it. legacy state and `kind: "none"` map to `agentCatalog: null`.

`plugin/src/projection/status.ts::projectMeetingStatus` maps internal `id` to public `recommendationId`; copies `candidateId | roleDefinitionId | displayName | agendaItemId | rationale | expectedContribution | evidenceGapIds | urgency | status`; drops `roleDefinitionVersion | agentDefinitionId | recommendedByManagerSessionId | catalogId | catalogVersion | planningAttemptId | createdAt`. It sorts by internal `createdAt` ascending, then `id` ascending.

### 7.2 Port、调用链与 producer matrix

唯一新增 production 文件是 `plugin/src/runtime/services/agent-catalog.ts`。其 exact exports 是：

```ts
export const AGENT_CATALOG_SERVICE_KEY = "convivium.agentCatalog";
export type AgentCatalogReadFailure =
  "unavailable" | "invalid" | "unsupported" | "oversize";
export type AgentCatalogReadResult =
  | { readonly ok: true; readonly snapshot: MeetingAgentCatalogSnapshotV1 }
  | { readonly ok: false; readonly failure: AgentCatalogReadFailure };
export interface AgentCatalogPort {
  readSnapshot(request: {
    readonly teamId: string;
    readonly meetingId: string;
    readonly captainSessionId: string;
  }): Promise<AgentCatalogReadResult>;
}
export async function captureManagerCatalogBinding(
  port: AgentCatalogPort | undefined,
  request: {
    readonly teamId: string;
    readonly meetingId: string;
    readonly captainSessionId: string;
  },
): Promise<ManagerCatalogBindingV1>;
```

同文件使用以下exact module augmentation；service仍由`ctx.get` optional读取，不把property写成required inject：

declare module "@deepseek-ai/cordis" {
interface Context {
"convivium.agentCatalog": AgentCatalogPort;
}
}

````

`captureManagerCatalogBinding`是port result到持久binding的唯一转换点，并直接导入`plugin/src/repository/domain/canonical-json.ts::encodeCanonicalJson`作为唯一byte counter：missing port、throw、非exact result、任一failure、Schema invalid、snapshot`teamId !== request.teamId`、重复`candidateId`、重复`roleDefinitionId + version`、candidate无法恰好join一个role，或`encodeCanonicalJson(snapshot).byteLength > 16 * 1024`一律返回`{ kind: "none" }`；只有全部通过，才按7.1内部`MeetingAgentCatalogSnapshot`逐字段复制roles/candidates及其arrays并返回verified binding。不得把Protocol object引用直接持久化，不得导出第二mapper、retry、cache或provider wrapper。

唯一调用链是：`meetingConsumerPlugin.apply` optional `ctx.get` → `CreateStatusRuntimeOptions.agentCatalog` → Runtime 在确认 command 将创建 Manager attempt 后调用一次 `captureManagerCatalogBinding` → pure transition 通过 required context field 接收 binding → 同一 `MeetingRepositoryPort.execute` commit 写 current attempt → `projectManagerMeetingContext` 从已提交 binding 投影 → `submit_manager_plan` 在同一 existing command 验证 claim并写 pending facts → `projectMeetingStatus` 脱敏输出。

全部 Manager attempt producer 必须逐一覆盖：

| producer                     | production symbol                                                                                                                                                   | binding 输入                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| initial planning             | `plugin/src/runtime/application-service/create-meeting.ts::createMeetingApplication` 调用 `startManagerPlanning` 的 `start_manager_planning` command                | 该 command execute 前 capture                        |
| task start restart           | `plugin/src/runtime/application-service/meeting-task.ts::createMeetingTaskApplication.startMeetingTask`                                                             | pure transition preview 确认新 attempt 后 capture    |
| task finish next plan        | `plugin/src/runtime/application-service/meeting-task.ts::createMeetingTaskApplication.finishMeetingTask`                                                            | pure transition preview 确认新 attempt 后 capture    |
| Captain/local resume         | `plugin/src/runtime/application-service/meeting-control.ts::createMeetingControlApplication`内的`transitionMeetingStatus`，由`resume`和`resumeLocalMeeting`共同调用 | pure transition preview确认新attempt后capture        |
| committed speaker submission | `plugin/src/runtime/application-service/meeting-turn.ts::createMeetingTurnApplication.submitTurn` → `submitSpeakerAndAdvanceMeeting`                                | pure transition preview 确认新 attempt 后 capture    |
| expired speaker attempt      | `plugin/src/runtime/application-service/index.ts::scanExpiredSpeakerAttempts` → `failSpeakerAttempt`                                                                | pure transition preview 确认新 attempt 后 capture    |
| domain constructors          | `plugin/src/domain/transitions/manager-planning.ts::startManagerPlanning`、`plugin/src/domain/transitions/turn-advancement.ts::advanceAfterSpeakerSubmission`       | required context `catalogBinding`，不得自行读取 port |

preview 固定算法：取得一次 command `now`、IDs 和当前 repository snapshot；用 `{ kind: "none" }` 调用同一个 pure transition；仅当 source state 通过 `isMeetingStateV2` 且 preview 的 current planning attempt ID 是该 command 的新 ID 时读取 Catalog 一次。legacy source 不读取 Catalog，继续使用 none。随后用该 binding 和同一 `now`/IDs 进入 `execute` transition。`expectedMeetingVersion` 在 transition 前拒绝并发变化；Runtime 不循环、不重新读取 Catalog。preview 不写 repository、event、receipt 或 outbox。

### 7.3 不可违反的不变量

1. Catalog service optional；没有 Catalog 的 Meeting creation、普通 planning、resume、task 与 speaker path 保持既有结果。
2. Catalog 只在 source state 为 V2 且一个 command 已由 pure preview 证明会创建 Manager attempt 时读取一次；legacy source、Meeting creation state 初始化和不创建 attempt 的 command 不读取。
3. binding 只有 `verified | none`，只存在 current attempt；无顶层副本、历史副本、event/outbox 副本或第二 storage。
4. legacy state 不写回、不迁移；普通恢复可用，attendance context 为 null、status 为 `[]`、claim fail closed。
5. attendance validation 在 stale/terminal/version/idempotency 之后，在 required-unavailable、Manager business-invalid fallback 与任何 commit effect 之前。
6. valid claim 只有正常 Manager plan submission 才持久；required-unavailable waiting 或 Manager fallback 不写 recommendation，也不产生 `manager_plan.submitted`。
7. attendance rejection 抛出 Domain error，使现有 `execute` 不生成 state、event、receipt、outbox 或 version；Runtime 不把它转换成 fallback。
8. recommendation ID、time、actor、Catalog provenance 分别只来自 planning attempt index、单一 command `now`、authorized Manager caller 和 verified binding。
9. 不修改 repository public API、outbox worker、archive package、HTTP production、Client production、DSH adapter、smoke profile或 readiness runner。

### 7.4 双向追踪

| behavior                            | requirement / acceptance                   | interface / design                                                                | production owner                                     | focused verification                                   | full / readiness                 |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| optional authorized Catalog capture | FR-13.1、Phase 1 closure                   | Role Catalog `Transport Or Invocation`；Implementation Design Runtime composition | T3/T5 port、Runtime producer matrix                  | `agent-catalog.spec.ts`、`meeting-runtime.spec.ts`     | T9 `pnpm verify`；coverage FR-13 |
| safe Manager projection             | FR-13.2、AC 30                             | Role Catalog `Catalog delivery to Manager`                                        | T1 protocol types；T6 `projectManagerMeetingContext` | `status-projection.spec.ts`、Manager dispatch contract | T9 / coverage                    |
| claim validation and pending fact   | FR-13.3-4、BR-10、AC 30-31 Phase 1 portion | Agent Protocol `Manager plan submission`；Orchestration Design 12.5               | T7 domain transition/Runtime                         | manager-planning + meeting-runtime contracts           | T9 / coverage                    |
| idempotent atomic commit            | FR-13.8 Phase 1 portion                    | Storage Interface atomic command；Role Catalog lifecycle                          | T7 existing `execute`/serializer/event               | replay/conflict/zero-side-effect cases                 | T9 / coverage                    |
| strict legacy/V2 recovery           | Phase 1 compatibility closure              | Storage Interface compatibility；Domain Model `ManagerPlanningAttempt`            | T2 model；T4 decoder/open                            | repository contract + recovery                         | T9 / coverage                    |
| pending status privacy              | FR-13.2-3、AC 31 Phase 1 portion           | Role Catalog `Status projection`；Agent Protocol status                           | T8 status type/Schema/projection                     | status, HTTP/client fixture, recovery cases            | T9 / coverage                    |

Captain approval/admission/provisioning portions of FR-13.5-9 and AC 31-34 remain `Not Covered`; no T step may claim them.

## 8. 机械实施步骤

### T5：全部 Manager attempt 的一次性 Catalog capture

前置状态：T4 PASS commit 已存在；T4 完整章节已删除；工作树 clean；所有 producer已显式接受 required binding但仍传 none。

允许修改：`plugin/src/runtime/application-service/create-meeting.ts::createMeetingApplication`；`plugin/src/runtime/application-service/meeting-task.ts::createMeetingTaskApplication`的`startMeetingTask`、`finishMeetingTask`；`plugin/src/runtime/application-service/meeting-control.ts::createMeetingControlApplication`内的`transitionMeetingStatus`；`plugin/src/runtime/application-service/meeting-turn.ts::createMeetingTurnApplication.submitTurn`；`plugin/src/runtime/application-service/index.ts::scanExpiredSpeakerAttempts`；`plugin/tests/unit/domain/transitions/manager-planning.spec.ts`；`plugin/tests/unit/domain/transitions/turn-advancement.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`；本RUNBOOK的T5章节。

禁止修改：Domain selection/fallback算法、repository API、event/outbox vocabulary、Meeting creation initial state、claim/status projection。

执行：

1. 对 7.2 producer matrix 六条路径逐条应用固定 preview算法。resident路径的request只取`StoredMeeting.teamId`、`StoredMeeting.repository.meetingId`、`StoredMeeting.captainSessionId`；initial planning仅在creation ownership已持久化后取validated`input.teamId`、Runtime派生的`meetingId`和已授权`caller.sessionId`，不得使用Manager输入。
2. initial planning在已确定 `managerRequested && managerAvailable` 后、`start_manager_planning` execute前capture；不得在 `createMeetingState`、ownership持久化前或 no-Manager path读取。
3. 其余五条路径用同一 fixed `now`/IDs先运行pure transition with none；source state不是V2或preview没有创建新Manager attempt时不调用port；V2且创建时capture一次并把binding传给commit transition。
4. Repository `VERSION_CONFLICT` 后直接返回/保留既有错误；该 command内部不得重新capture或循环。
5. 在`meeting-runtime.spec.ts`增加`describe("FR-13 planning attempt Catalog capture")`，逐一覆盖initial、task start、task finish、Captain resume、local resume、speaker submission和speaker timeout的verified、missing service、legacy-no-read、no-attempt-no-read、capture count=1及commit/reopen binding；domain tests断言context binding按原值写入。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/manager-planning.spec.ts tests/unit/domain/transitions/turn-advancement.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
git diff --check
```

PASS：全部退出0；六类producer（resume类含Captain/local两个入口）均有测试；每个实际新attempt恰好一次read；没有attempt时零read；verified/none随同一attempt commit恢复。

STOP：需要async repository transition、第二commit、cache、retry、Manager input ownership或遗漏producer。报告producer symbol、调用计数和首错。

失败恢复：fake port和fake domain无外部副作用；repository command失败时保留原state。保留 T5 与现场。

### T6：Manager safe Catalog context

前置状态：T5 PASS；T5 完整章节已删除；verified binding可从repository恢复。

允许修改：`plugin/src/protocol/types.ts::ManagerMeetingContextV1`；`plugin/src/projection/status.ts::projectManagerMeetingContext`；`plugin/tests/contract/status-projection.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts` 的 Manager dispatch context assertions；本 RUNBOOK 的 T6 章节。

禁止修改：Catalog capture、claim、public Meeting status、manager delivery payload shape、DSH adapter、Prompt内容中除serialized context value外的文本。

执行：

1. 增加 required `agentCatalog: MeetingAgentCatalogProjectionV1 | null`。
2. `projectManagerMeetingContext` 首先调用 `isMeetingStateV2`；legacy、无current attempt和none均输出 null；verified按7.1 join/map并输出 `researchNeeds: []`。
3. 测试对完整私有 snapshot做exact object断言，并递归断言输出不含 `sourceMemberName | agentDefinitionId | session | prompt | model | credential | preset | skill | tool | mcp`（大小写不敏感）。
4. Manager dispatch contract解析实际prompt JSON，断言它等于从已提交attempt生成的projection，而不是port的新读取；dispatch阶段port read count保持不变。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
git diff --check
```

PASS：全部退出 0；legacy/none为null；verified字段逐项正确且无private key；dispatch不重读Catalog。

STOP：需要临时context store、outbox snapshot、fallback projection或暴露private字段。报告actual projection和首个额外/缺失key。

失败恢复：只修改纯projection/type/tests；无repository或外部副作用。保留 T6 与现场。

### T7：attendance claim 的原子提交

前置状态：T6 PASS；T6 完整章节已删除；Manager context已能展示attempt-bound verified snapshot。

允许修改：`plugin/src/domain/planning.ts::ManagerPlanInput`；`plugin/src/domain/errors.ts::DomainErrorCode`；`plugin/src/domain/transitions/types.ts::SubmitManagerPlanContext`；`plugin/src/domain/transitions/manager-planning.ts::submitManagerPlan`；`plugin/src/runtime/application-service/meeting-turn.ts::submitManagerPlan`、`mapAttendanceRecommendationError`；`plugin/tests/unit/domain/transitions/manager-planning.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`；本RUNBOOK的T7章节。`plugin/src/protocol/request-idempotency.ts::serializeValidatedRequestV1`只允许调用，禁止修改。

禁止修改：新command/event/outbox/receipt、repository、fallback helper、Captain/admission、status projection、request serializer。

执行：

1. `ManagerPlanInput` 增加 optional readonly claims；`SubmitManagerPlanContext` 增加 required `managerSessionId`，Runtime只传authorized caller session。
2. `DomainErrorCode` 只增加 `AGENT_CATALOG_UNAVAILABLE | AGENT_CANDIDATE_NOT_FOUND | AGENT_CANDIDATE_UNAVAILABLE | ATTENDANCE_RECOMMENDATION_INVALID`。
3. 在现有 stale checks之后、`requiredUnavailable`和Manager plan fallback `try`之前验证claims：缺失/空直接通过；非空要求V2 verified binding；candidate必须唯一、存在、`availability === "available"`且不是三种research role；agendaItemId必须存在；rationale/expectedContribution trim后非空；evidenceGapIds必须`[]`；urgency只用Schema union。verified binding的candidate/role referential integrity已经由T3 capture验证，不在claim阶段改写Catalog failure。按P0-E固定错误抛出。
4. validation通过后生成`${planningAttemptId}-attendance-${claimIndex}`，复制7.1 internal fields，`createdAt=context.now`、actor=context manager；只在正常plan path append。required-unavailable waiting和manager fallback均不append。
5. 正常submission把IDs加入唯一`manager_plan.submitted` event payload；无claims固定`[]`，事件顺序不变。
6. Runtime在try外初始化`currentMeetingVersion = input.observedMeetingVersion`，read成功后更新为`current.version`，并取得一次`commandNow`；requestHash改为`serializeValidatedRequestV1(input)`；catch先调用`mapAttendanceRecommendationError`返回P0-E fixed code/message、`retryable:false`和`meetingId | currentMeetingVersion | attemptId`，其他error保持现有mapping。不得在catch调用fallback。
7. tests覆盖正常0/1/多claim、ID/order/provenance/event/receipt/outbox同commit、duplicate、research、nonempty gap、unknown/unavailable candidate、legacy/none、required-unavailable、manager fallback、unauthorized/cross-meeting、stale/version/terminal、same-request replay、same-ID different-hash conflict及每个拒绝前后完整repository snapshot深相等。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/manager-planning.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
git diff --check
```

PASS：全部退出 0；正常claim一次commit；replay不重复；所有attendance rejection零state/event/receipt/outbox/version且`fallbackApplied`不是true；no-claim既有结果不变。

STOP：任一attendance错误进入fallback、产生receipt/version，或需要新repository/outbox/event。报告exact test title、before/after diff和首个stack。

失败恢复：测试使用isolated repository；失败command无commit。保留 T7 与现场，不放宽零副作用断言。

### T8：pending status、consumer fixtures 与 recovery

前置状态：T7 PASS；T7 完整章节已删除；pending facts可由repository commit/replay。

允许修改：`plugin/src/protocol/types.ts::DiscussionMeetingStatusBaseV1`；`plugin/src/protocol/status.ts::active`、`terminal`、`MeetingStatusResultSchema`；`plugin/src/projection/status.ts::projectMeetingStatus`；`plugin/tests/contract/protocol-schema.spec.ts`；`plugin/tests/contract/status-projection.spec.ts`；`plugin/tests/contract/http-boundary.spec.ts`；`plugin/tests/client/client-entry.client.spec.ts::statusResult`；`plugin/tests/recovery/recovery.spec.ts`；本RUNBOOK的T8章节。

禁止修改：archiving/archived Schema、Archive package、Client/HTTP production、smoke-profile、admission fields、status compatibility default。

执行：

1. 给`DiscussionMeetingStatusBaseV1`增加required public array，并在`active`/`terminal`引用T1的`PublicAttendanceRecommendationSchema`；archiving/archived不得出现该key。
2. `projectMeetingStatus`只对Captain、matching Manager和有效Participant的active/execution-terminal结果输出7.1排序脱敏数组；`local_host`、legacy state均输出`[]`且不写state；现有Runtime caller authorization保持先执行。
3. 对protocol、client和HTTP的active/terminal fixtures机械补`attendanceRecommendations: []`；不得修改production consumer behavior。
4. status tests覆盖visibility、排序、逐字段映射、private字段缺失、legacy`[]`、terminal保留和archive exact-key拒绝。
5. recovery test先commit两个recommendations，再分别从checkpoint与tail reopen，断言internal provenance和public排序不变；same request replay不新增。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts tests/contract/http-boundary.spec.ts tests/client/client-entry.client.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin typecheck:client
git diff --check
```

PASS：全部退出 0；active/terminal required、archive absent、legacy empty、recovery和consumer fixtures均通过；无Client/HTTP production diff。

STOP：必须放宽MeetingStatus Schema、修改archive/Client/HTTP production或增加compat default。报告首个exact-key/type/recovery错误。

失败恢复：isolated recovery fixture无真实外部数据；保留 T8 与现场。

### T9：完整验证、readiness 与删除

前置状态：T8 PASS；T8 完整章节已删除；T0至T8规定的focused tests全部仍PASS。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的FR-13/Phase 1行；本 RUNBOOK的T9章节和最终删除。

禁止修改：production、tests、其他正式文档、TODO、Git refs/history、真实Host/profile和外部系统。

执行：

1. 运行第一组验证；任一失败立即STOP，不修改readiness。
2. 把实际命令与结果写入coverage：只声明Phase 1 safe projection/claim/pending/recovery已验证；Captain/admission/FR-14/真实Host producer smoke继续Not Covered。
3. 运行第二组文档、scope和引用验证。
4. 确认无其他文档引用RUNBOOK文件名或标题后，用`apply_patch`删除整个RUNBOOK文件。
5. 运行第三组删除后验证。若失败，只执行`git restore --source=HEAD -- docs/30-designs/RUNBOOK-AGENT-ATTENDANCE-ADMISSION.md`恢复RUNBOOK，然后STOP；不得恢复其他文件。

验证：

```bash
pnpm --dir plugin verify
git diff --check
```

```bash
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
test -z "$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | rg -v '^(plugin/src/(index\.ts|domain/(create|errors|model|planning)\.ts|domain/transitions/(manager-planning|speaker-attempt|turn-advancement|types)\.ts|projection/status\.ts|protocol/(commands|index|schema|status|types)\.ts|repository/domain/(domain-meeting-repository|projection|schemas)\.ts|runtime/application-service/(create-meeting|index|meeting-control|meeting-task|meeting-turn)\.ts|runtime/services/agent-catalog\.ts)|plugin/tests/(client/client-entry\.client\.spec\.ts|contract/meeting-repository-behavior\.ts|contract/(continuation|domain-meeting-repository|http-boundary|meeting-runtime|protocol-schema|status-projection)\.spec\.ts|recovery/(domain-recovery|recovery)\.spec\.ts|unit/domain/(completion|create|hand-raise|meeting-task)\.spec\.ts|unit/domain/transitions/fixtures\.ts|unit/domain/transitions/(manager-planning|meeting|speaker-attempt|turn-advancement)\.spec\.ts|unit/repository/domain/(projection|schemas)\.spec\.ts|unit/runtime/(agent-catalog|archive|manager-fallback|recovery|task-evidence)\.spec\.ts)|docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE\.md|docs/30-designs/RUNBOOK-AGENT-ATTENDANCE-ADMISSION\.md)$')"
! rg -n 'RUNBOOK-AGENT-ATTENDANCE-ADMISSION|RUNBOOK：FR-13 Phase 1 Agent Catalog 与参会推荐' docs --glob '*.md' --glob '!30-designs/RUNBOOK-AGENT-ATTENDANCE-ADMISSION.md'
pnpm --dir plugin exec prettier --check ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md ../docs/30-designs/RUNBOOK-AGENT-ATTENDANCE-ADMISSION.md
git diff --check
```

```bash
test ! -e docs/30-designs/RUNBOOK-AGENT-ATTENDANCE-ADMISSION.md
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

PASS：三组命令全部退出0；coverage只记录真实Phase 1证据；RUNBOOK已删除；Not Covered未被宣称完成。提交、push和PR仍需新的用户授权。

STOP：任一命令失败、diff出现allowlist外文件、RUNBOOK仍被引用或真实Host smoke被写成PASS。报告失败命令与首个输出；删除后失败必须先按步骤5恢复RUNBOOK。

失败恢复：第一/二组失败保留RUNBOOK；第三组失败只恢复HEAD中的RUNBOOK。没有真实Host、DSH Session或外部写入。

## 9. 验证矩阵

| 风险                                                    | focused owner 与客观断言                                              | full / readiness                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| success/no-claim compatibility                          | T5六producer；T7 0/1/多claim；既有result与event顺序不变               | T9 `pnpm verify`；coverage记录实际命令                    |
| malformed/boundary input                                | T1 exact Schema；T3 malformed/16 KiB；T7 empty/duplicate/research/gap | 同上                                                      |
| caller/authority/team/meeting                           | T3 request source/team mismatch；T7 unauthorized/cross-meeting        | 同上                                                      |
| stale/version/terminal                                  | T7 在attendance前返回既有error且零副作用                              | 同上                                                      |
| replay/idempotency conflict                             | T7 same request相同result/version、不同hash conflict                  | 同上                                                      |
| partial-invalid array atomicity                         | T7 多claim中任一非法时完整snapshot深相等                              | 同上                                                      |
| fallback/wait precedence                                | T7 attendance invalid不fallback；valid claim遇waiting/fallback不持久  | 同上                                                      |
| event/receipt/outbox/version                            | T7 success同commit；rejection全部不变                                 | 同上                                                      |
| legacy/V2/checkpoint/tail recovery                      | T4 decode/open errors；T8 internal/public恢复一致                     | 同上                                                      |
| projection privacy/archive                              | T6 safe context；T8 pending public、archive absent                    | 同上                                                      |
| typecheck/build/package contract                        | 每步host；T8 client；T9完整`verify`                                   | coverage只记录真实PASS                                    |
| real Host Catalog/DSH smoke                             | 不调用未提供的Host producer                                           | `Not Covered`：Phase 1只验证consumer port与in-memory fake |
| Captain/admission/FR-14/UI/HTTP behavior/stress/metrics | 无implementation step                                                 | `Not Covered`：第3.2节                                    |

## 10. 完成、readiness 与删除

本 RUNBOOK 的完成条件是 T0 至 T9 全部 PASS、真实证据进入 coverage、相对链接检查通过并删除本文。

- T9 之前，`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 只记录“契约已闭合、产品未实现”，不得预写通过证据。
- T9 只把实际 PASS 的 Phase 1 命令和覆盖写入 readiness；未运行的真实 Host smoke 与全部 Not Covered 保持未验证。
- T9 前不得删除本文；失败时保留当前未完成步骤与现场。
- 长期契约已经位于正式文档；T9 迁移实际验证后，按 [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md) 删除临时 RUNBOOK并执行删除后检查。

真实外部写入：`Not Applicable`。所有 focused tests 使用 fake port、isolated Storage Domain和mocked DSH；RUNBOOK不注册或调用真实Host Catalog producer。repository测试副作用由test fixture teardown负责，失败时不得手工删除用户数据。

## 11. Author/Audit 结论

Author 已把获批的 P0-A 至 P0-E service/port、persistence/compatibility、context/status、event/ID/idempotency 和 error/fallback 契约迁入正式 requirements/interfaces/designs，并据此形成 T0 至 T9 implementation steps。

Audit 结论：`Executable`。

P0-A 至 P0-E 均已闭合；T0 至 T9 对 protocol owner、required fixture同步、port result到binding转换、全部attempt producer、局部compatibility、context/status、claim/event/idempotency、recovery、consumer fixtures和完整验证提供唯一文件、symbol、动作、PASS/STOP与恢复。执行者无需选择Schema owner、producer、验证顺序或失败策略。Captain/admission/FR-14 等保持 Not Covered。
