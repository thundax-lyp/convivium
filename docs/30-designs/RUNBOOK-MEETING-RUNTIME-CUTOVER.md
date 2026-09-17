# RUNBOOK：Meeting Runtime 最小业务闭环切换

## 状态

- 审计结论：`Executable`
- 建立日期：2026-09-17
- 执行分支：`codex/runbook-meeting-runtime-cutover`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 起始提交：`f170deb`
- 目标：用目标 `MeetingState` 完成一条可创建、公开证据、批量审核、发布、结束、归档和读取的真实业务链，并只删除被该链替代的 legacy application orchestration/read-side 实现。

## 执行者契约

执行者必须从本文仍存在的第一个步骤开始按顺序执行；已从本文删除的步骤视为已有提交证据，不得重复执行。每个步骤只有在该步骤 PASS 后才能进入下一步。允许修改的业务文件只限各步骤明确列出的路径；每一步都额外隐含允许修改本 RUNBOOK，但唯一允许的改动是该步 PASS 后删除当前完整 step section，且该文件不计入“每步不超过 8 个文件”。步骤中的“禁止修改其他全部文件”不禁止这项强制 step 删除。除 T10d-T10g 为保持分步依赖闭包而明示且必须按序删除的 compile bridge 外，不得保留双写、target compatibility read、旧 snapshot migration、legacy facade、转发文件、第二套 repository、第二套 command dispatcher 或未被当前范围要求的通用抽象；为使明确保留的 legacy 文件在删除前编译而保留的旧字段/exports，必须被逐项标为 legacy-only、不得进入 target activity graph，并迁移到 readiness 未覆盖项。

T10d-T21c 中除 T14a 资源步骤外的实现步骤必须对该步列出的 production symbol 形成真实代码 diff；T14a 必须形成发布资源与验证脚本 diff；T22 是 smoke/entrypoint 验证步骤，T23-T29 是删除步骤，T30 是 readiness/关闭步骤，三者不要求 production diff。所有行为实现步骤都先写或修改该步列出的测试，使新增行为出现可解释的失败，再修改 production code 使 focused validation 通过；T10f 是只删除 repository identity 字段的机械 type cleanup，以 `rg` 和 `typecheck:host` 作为红绿边界，不另改 fixture test。已有测试为绿、只增加测试、只删除 RUNBOOK 步骤或只改文档都不能证明实现步骤完成。若 Author/Audit 时发现某步行为已经完整存在，应由 Author 删除该步并记录既有证据，不得留给 executor 产生 RUNBOOK-only commit。删除步骤不改写旧 fixture；从固定起始提交累计删除文件总数固定为 30 个：已删除的 1 个冗余 command repository facade，加上后续 20 个 legacy application orchestration/read-side production 文件及其 9 个直接测试，不超过用户允许的 30 文件上限。DSH Storage Domain adapter、`DomainRepositoryRegistry`、`DomainMeetingRepository` 与唯一 `MeetingRepositoryPort` 均保留。用户已有且不属于本 RUNBOOK 的改动不得覆盖或回滚。

每步的提交节奏固定为：完成 production/test 改动并通过该步验证 → 删除本文中该完整步骤 → 将代码、测试和该步骤删除放进同一个提交。禁止单独提交 RUNBOOK 步骤删除，禁止用空改动或既有绿色测试代替实现。除非用户另行明确要求，不得 push、force-push、rebase、amend 或改写已 push 的提交。删除步骤的计数在提交前只检查当前 working-tree 删除；全程累计删除只在 T30 对固定起始提交 `f170deb` 检查。

`PASS` 表示命令退出码为 0 且该步列出的可观察断言全部成立。`STOP` 表示立即停止，不执行后续步骤；报告最后一个 PASS 步骤、触发条件、文件与 symbol、最小复现命令和实际输出。STOP 后不得放宽 Schema、lint、类型或测试，不得新增兼容层，不得自行扩大 Scope。

以下任一事实与执行时 checkout 不一致时必须 STOP：本文指定的既有路径或 symbol 不存在；正式文档改变了本文固定的字段、错误码、actor、lifecycle 或归档语义；实现必须引入新依赖、数据库 migration、外部权限或 Non-goal；DSH 精确版本不再是 `0.1.2-rc.1`。

执行前只在仓库根目录运行一次：

```bash
test "$(git branch --show-current)" = "codex/runbook-meeting-runtime-cutover"
test -z "$(git status --porcelain)"
node -e 'const p=require("./plugin/package.json");const bad=Object.entries(p.peerDependencies).filter(([name,version])=>name.startsWith("@deepseek-ai/dsh-")&&version!=="0.1.2-rc.1");if(bad.length){console.error(bad);process.exit(1)}'
test "$(node -p "require('./plugin/node_modules/@deepseek-ai/dsh-subagent/package.json').version")" = "0.1.2-rc.1"
```

任一失败立即 STOP；后续步骤不得以重复 baseline 代替 focused validation。

## 目标业务链

```text
local CreateMeeting
  -> running MeetingState + 8 个独立 meeting-owned Session
  -> 合格 Contributor 各收到一次 meeting_started notice
Manager OpenRound
  -> Contributor RaiseHand
  -> Manager AcceptHand（预留 1 条 FormalMessage）
Contributor SubmitEvidence（公开候选内容直接登记）
  -> 唯一 Evidence Reviewer 读取待审集合
  -> DSH workers 独立并发分析
  -> coordinator SubmitReviewBatch（原子批量）
Manager PublishRound
  -> Publication + 每个 Contribution 一条 FormalMessage
local EndMeeting(outcome=partial)
  -> immutable Termination + materialize_archive effect
runtime StartArchive
  -> 按值 ArchivePackage
  -> 关闭并撤销全部 meeting-owned Session
  -> archived
local ReadArchive
  -> 只返回归档白名单
```

本链不要求形成 Proposal、Decision 或 CompletionFact；验收使用 `outcome="partial"` 并显式列出未完成目标。`completed` 仍必须满足正式完成条件。

## 当前断点

| 正式声明 | 当前代码事实 | 本 RUNBOOK 的处理 |
| --- | --- | --- |
| `MeetingState` 是新业务链唯一聚合 | `plugin/src/runtime/meeting-runtime.ts`、repository projection 和外围入口仍使用 `LegacyMeetingState` | T10d-T21 将活动调用链直接切换；T23-T29 删除旧 application orchestration/read-side |
| 创建使用 `identityKey`，每场会议唯一 Manager 和 reviewer | canonical identity 已完成，外围创建仍按 participantKey/旧 role 建模，尚未创建八个 target child Session | T14b-T14c |
| reviewer 单一、按 EvidenceVersion 独立审核、批量提交 | 纯 Domain batch 已完成，DSH reviewer coordinator 与独立 worker 尚未接入 | T16 |
| 归档是按值白名单，Session 全部关闭后才 archived | canonical ArchivePackage 与 Domain lifecycle 已完成，runtime cleanup/outbox/recovery 尚未接入 | T17 |
| 同一 candidate 跨 Agenda 复用一个 active identity/Session | 纯 Domain active reuse 已完成，identity effect handler、recovery 与 meeting-owned notice 尚未统一到 target command path | T15a-T15c |
| Scribe 已删除，发布包为 8 个角色 | `plugin/meeting-roles/` 和验证脚本仍含 `meeting_scribe` | T14a |
| `meetingId` 是 V1 唯一 Meeting namespace | 正式接口已固定无 `teamId`，当前 repository key/registry、legacy runtime 与 Session label 仍携带 `teamId` | T10d-T14c 从目标 repository、runtime、label、ownership 与 recovery 消除；不得用固定或忽略的 compatibility `teamId` |
| target repository/application/projection 必须可真实运行 | repository core、command application 和 projection 尚未接通 target atomic commit | T10d-T21 |

代码事实以 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为当前覆盖依据；不得把存在的旧源码或历史测试算作目标实现证据。

## Scope

1. 将目标聚合修正到已确认的数据结构：删除 FormatApproval 与 reviewer 双向数组；增加唯一 `evidenceReviewerId`、Round abort、Contribution aborted、完整按值 archive。
2. 完成目标纯 Domain 的创建、开轮、举手/接纳、Evidence 登记、Review batch、发布、结束、归档转换及 candidate 跨 Agenda active 复用。
3. 将同一 `MeetingCommandV1`、repository atomic commit、receipt、outbox 和 recovery 用于整条链。
4. 通过真实 caller/session ownership 验证 local、Manager、Contributor、reviewer 和受控 runtime action。
5. reviewer coordinator 可对一个 batch 中的多个 EvidenceVersion 启动彼此不共享 Session 的 DSH worker；worker 结果只由 coordinator 批量提交。
6. 提供 caller-filtered Meeting view、待审集合、Meeting list/detail、Archive read，以及完成该链所需的 DSH tools 和 loopback Remote action。
7. Archive 固化后关闭全部 meeting-owned Session；任一关闭失败保持 `archiving` 并可恢复重试。
8. 删除 Scribe；累计删除清单固定为已删除的 1 个冗余 command repository facade、13 个 legacy application-service、6 个 legacy runtime application services、1 个 legacy read projection 和 9 个直接测试，总数 30。`projection/status.ts` 仍依赖的 `projection/contribution.ts` 成对保留但不从目标入口导出；DSH Storage Domain adapter 与 repository core 保留。
9. 增加 unit、contract、integration、recovery 和真实 DSH smoke 证据，并更新 readiness。

## Non-goals

- 不实现 ContinuationMaterial 导入或续会；删除旧 `continuation-selection` application service 后，将旧 Domain/protocol 和目标续会保持为 readiness 未覆盖项。
- 不把 Pause/Resume、Agenda candidate、Proposal、Position、Decision、RiskDisposition、CompletionFact、Question/Issue、PrivateMail、MeetingTask、补充证据或机会申请接到外围入口；现有 target pure Domain 文件保留，并在 readiness 中继续标为外围未覆盖。
- 不重设计 Browser UI。现有面板只缩减为 Meeting list/detail/archive 和本链 local controls；不增加视觉系统。
- 不实现自动 evidence freshness、source-scope 去重、跨 Host、Web 用户/Team authority、remote listen、metrics、stress、数据库迁移、旧 team-key catalog/domain discovery 或旧数据读取；旧 recovery 不重建、不推导 namespace、不回写。
- 新业务链不提供 legacy API/Schema/snapshot 兼容；旧 snapshot 进入目标 codec 固定返回 `INCOMPATIBLE_VERSION`。除 T23-T29 的精确清单外，本轮不删除 legacy Domain、transitions、protocol、projection、runtime services、tests 或 fixtures；保留文件不得被目标入口继续引用，并在 readiness 登记为后续删除范围。
- 不自动合并 PR，不在执行过程中修改本 RUNBOOK 的产品语义。

## 真相源与追踪

- 架构与边界：[Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Test Rules](../00-governance/TEST-RULES.md)。
- 产品要求：[MO-FR-1 至 MO-FR-14、MO-NFR-1 至 MO-NFR-6](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)；[ER-FR-1 至 ER-FR-8](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)。
- 公共契约：[Meeting Interface 的 Commands、Round/evidence/review、Archive](../20-interfaces/MEETING-INTERFACE.md)；[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。
- 稳定职责：[Domain Design](./DOMAIN-DESIGN.md)、[Meeting Design](./MEETING-DESIGN.md)、[DSH Plugin Design](./DSH-PLUGIN-DESIGN.md)。
- 当前代码入口：`MeetingState`、`validateMeetingStateV1`、各 `*-v1` transition、`MeetingCommandV1Schema`、`DomainMeetingRepository`、`createMeetingIdentityApplicationV1`、`ConviviumRemoteService`、`registerCreateAndStatusTools`、`registerSubmitAndControlTools`。

每项行为必须形成以下链：requirement/AC → interface action/DTO → design responsibility → production symbol → focused test → `pnpm --dir=plugin verify` → readiness 事实。

## 固定数据与接口决定

### Meeting namespace

目标链的 `meetingId` 在当前 Convivium Host/profile Storage Domain 内全局唯一，是 catalog、Meeting domain、snapshot、receipt、outbox、Session ownership、Archive 与 recovery 的唯一 Meeting namespace。`CreateMeeting` 继续使用 wire `meetingId="new"`；Runtime 在协议结构和 identityKey 引用校验通过后、需要 MeetingId 的八个 Definition/session preflight 前，以唯一 `meetingIdFor(requestId)` 对 local Convener 的全局唯一 requestId 做 canonical hash，生成稳定真实 `meetingId`。同 requestId 重放因此定位同一 repository/receipt；同 requestId 不同 normalized action 返回 `IDEMPOTENCY_CONFLICT`。不得混入 caller、Session label、随机值或旧 `teamId`，也不新增 creation-binding 表。

目标 `MeetingState`、`MeetingSnapshot<MeetingState>`、`MeetingRepositoryPort<MeetingState>`、catalog/creation record、repository key/domain name、Session label/provisioning envelope/ownership 以及所有 target request/result 均不得含 `teamId`。旧 application、legacy protocol 或 fixture 中暂存的 `teamId` 不能进入 target activity graph；T23-T29 删除对应文件，保留的 legacy 文件若仍含该字段必须在 readiness 登记且不得被目标入口引用。禁止以固定字符串、optional 字段、ignored overload、转发 adapter 或第二 repository 维持 team namespace。

### 聚合改动

`MeetingState` 保留 [Domain Design 的 canonical root](./DOMAIN-DESIGN.md#meetingstate)，并执行以下唯一改动：

- 增加 required `evidenceReviewerId: OpaqueId`；它必须指向 roles 精确为 `["evidence_reviewer"]` 的唯一 identity。
- `MeetingIdentityV1` 删除 `reviewResponsibilityIds`；`AgendaItemV1` 删除 `requiredReviewerIds`；`IssueV1` 使用 required `requiresEvidenceReview: boolean`。
- 删除 `FormatApprovalV1` 和 `MeetingState.formatApprovals`。
- `ContributionV1.status` 删除 `format_correction`，增加 `aborted`；`RoundV1` 的 aborted 状态必须同时具有 non-empty `abortReason` 和 `abortedAt: EpochMs`。
- `TerminationV1.id` 由 Runtime 生成；caller 不能提交。结束为一次原子转换：终止未完成 provisioning、固定 termination、进入 terminal、产生一个 `materialize_archive` effect request。
- `ArchivePackageV1` 是 immutable 按值对象，required：`id`、`status`、`createdAt`、`publicSnapshotVersion`、`terminationId`、`objective`、`agenda`、`agendaCandidates`、`publications`、`messages`、`evidenceBundles`（每项内嵌公开的 EvidenceVersion、Materials 与最终 Review）、`proposalRevisions`、`positions`、`decisionCandidates`、`decisions`、`completionFacts`、`questions`、`issues`、`riskDispositions`、`questionIssueDispositionFacts`、`termination`、`unresolvedItemIds`、`unclosedContributions`、`identityProvenance`、`exportMaterials`。这些数组没有内容时仍为 `[]`，不得 optional/nullable；`identityProvenance` 的 Definition provenance 三字段同时 optional，且只能同时存在或同时缺失。
- archive 禁止包含：PrivateMail、未公开 Evidence/Review、ReviewDelivery、举手/opportunity、Session/ownership/descriptor、完整运行配置/capability/凭据、隐藏推理、工具过程、物理路径和 Developer Markdown。
- archive materialization 固定使用 terminal snapshot：`publicSnapshotVersion=state.version`，`createdAt=Runtime now`，初次即写 `status="complete"`；该 status 表示按值 package 已完整物化，不表示 Session cleanup 已完成。Session close 失败不改 package，Meeting 保持 `archiving`；全部 ownership closed 后只把 lifecycle 改为 `archived`。本轮不实现 Continuation 导入，`exportMaterials` 固定为 `[]`。
- `evidenceBundles` 只按 `publications[].finalVersionIds` 的 Publication `seq` 和数组顺序物化，每项精确为 `{packageId,authorIdentityId,agendaId,version,review}`；`review` 是对应 `finalReviewIds` 的完整最终 `EvidenceReviewV1`。`unresolvedItemIds` 精确为 termination 的 `unresolvedQuestionIds` 后接 `unresolvedIssueIds`。`questionIssueDispositionFacts` 只接受 repository 已提交的 `resolve_question/question_disposition` 与 `dispose_issue/issue_disposition` facts，按 `occurredAt`、再按 `factId` 升序固化。`exportMaterials=[]`，不为未来续会预生成目录 ID。

### Action、actor 与生成字段

目标 `MeetingCommandV1Schema` 精确识别：`create_meeting`、`open_round`、`raise_hand`、`dispose_hand_raise`、`submit_evidence`、`submit_review_batch`、`record_review_delivery`、`publish_round`、`end_meeting`、`start_archive`、`record_archive_session_result`，并保留 `recommend_identity`、`record_identity_admission_result`。除当前代码尚缺且由 T13 补齐的 `record_review_delivery` 外，其余均已实现。`ListMeetingsRequestV1Schema` 与 `ReadMeetingRequestV1Schema` 是不产生 receipt/version 的独立 read request Schema，不进入 write action union；Archive 只经 `ReadMeeting` 的 `archive` 字段读取，不建立 `read_archive` action。create command 固定 `meetingId="new"`、`expectedMeetingVersion=0`；其他 write command 使用真实 meetingId 和正整数 expected version。按 Meeting Interface 的 wire convention，object Schema 忽略并 strip 未知字段；caller 即使提交 actorId、生成 ID、now、baselinePublicationIds、terminationId、archiveId、deliveryId、reviewerId、Session/ownership、`teamId` 或 effect 字段，它们也不得进入 normalized action、request hash、Domain 或持久化结果。

Runtime 生成来源固定如下：

| 值 | 唯一来源 |
| --- | --- |
| actor/caller | verified DSH Session ownership；local action 使用 loopback local binding；system action 使用 runtime channel |
| Meeting ID | create wire request 的 `meetingIdFor(requestId)`；V1 只有唯一 local Convener namespace |
| 其它 object/fact/receipt/outbox ID | 注入的 `ids.nextId(kind)` |
| `now` | 注入的 `clock.now()`，每个 command 只读取一次 |
| state version | 成功 commit 的 `snapshot.version + 1`；拒绝和 replay 不增加 |
| request hash | `serializeValidatedRequestV1` 对 Schema strip 后的已知 command action 的 canonical serialization |
| Round baseline | command commit 时当前全部 Publication ID，caller 不能提供 |
| Evidence baseline | 复制所属 Round 固定 baseline |
| reviewer | `state.evidenceReviewerId`，不能由 Agenda、Issue 或请求选择 |

actor 固定为：create/end/list/read 是可信 loopback local；start archive 与 record admission/review delivery/archive session result 是 runtime recovery/effect dispatcher；open/dispose/publish 是当前 Manager Session；raise/submit evidence 是目标 Contribution 的 Contributor Session；submit review batch 是唯一 reviewer coordinator Session。

### 原子 commit 与错误优先级

repository command 必须在一个 storage-domain transaction 中写 next snapshot、domain facts、receipt 和 outbox。成功 command 必须满足 `next.version === expectedMeetingVersion + 1`；同 requestId/同 hash 返回原 receipt，不再次产生 effect；同 requestId/不同 hash 返回 `IDEMPOTENCY_CONFLICT`；stale expected version 返回 `VERSION_CONFLICT`。Domain 或 authorization 拒绝不得通过 noop commit 保存 receipt，也不得改变 state/version/fact/outbox。

错误检查顺序固定为：protocol shape → caller/authority → idempotency history → terminal/archive → expected version → target existence → action lifecycle/precondition → Domain invariant/limit。公开 code 精确使用 Meeting Interface 的 `INVALID_ARGUMENT|MEETING_NOT_FOUND|UNAUTHORIZED|STALE_AUTHORIZATION|IDEMPOTENCY_CONFLICT|MEETING_TERMINAL|VERSION_CONFLICT|NOT_FOUND|INVALID_STATE|PRECONDITION_FAILED|REVIEWER_CONFLICT|ROUND_NOT_CLOSABLE|LIMIT_EXCEEDED|RECOVERY_UNAVAILABLE|STORAGE_UNAVAILABLE|INCOMPATIBLE_VERSION`；内部异常映射为 `STORAGE_UNAVAILABLE` 或 `RECOVERY_UNAVAILABLE`，不得公开 `INTERNAL`。

### Evidence、review、消息预算与归档

- `SubmitEvidence` 直接登记准备公开的完整 `EvidenceInput`；不接受 draft、hash 或 format approval。首版 ordinal=1；补充版仅消费 accepted supplement hand。本闭环 smoke 只走首版。
- `SubmitReviewBatch.reviews` 必须非空且 versionId 唯一。每个 item 只含 `versionId`、四维 `dimensions`、`scope`；所有 item 先完整验证，再原子追加 Review 与逐项 delivery effect。任一 item 非法时整批零写入。
- worker 不是 MeetingIdentity，不得调用 command；每 worker 只获得一个 immutable EvidenceVersion 和它的 Round baseline，不共享 worker Session。coordinator 可选已完成 worker 的非空子集提交，不持久化 batch/claim/lease/worker 状态。
- `DisposeHandRaise(accepted)` 在 `messages.length + 所有 open Round 已接纳 Contribution 数 + 1 <= maxFormalMessages` 时才成功。预留持续到 Round published/aborted，Contribution 提前终态不释放。超限返回 `LIMIT_EXCEEDED`；禁止摘要、合并或压缩正文。
- `PublishRound` 原子发布该 Round 所有合格 Contribution；每个 Contribution 产生一条 FormalMessage，Publication 引用实际最终 EvidenceVersion。恰好耗尽预算时，完成条件已满足则进入 converging，否则进入 paused/message-budget-exhausted，不能 resume。
- `EndMeeting(partial)` 只能在没有 open Round 时执行；它列出实际 unresolved IDs。`StartArchive` 只接受 terminal，先按值物化完整 package 后进入 archiving。所有已证明归属的 meeting-owned Session 均有 closed 结果后才进入 archived；失败结果保留 archiving 和 package，recovery 用同一 ownership 重试。

Session closure proof 由 repository 的 `SessionOwnership` 拥有，不复制进 `MeetingState`。Captain parent 不是 meeting-owned child，不建立或关闭 ownership；八个 child ownership 的 `role` 固定为 `manager|evidence_reviewer|participant`，并增加 optional `lastClosureFailureCode`；`record_archive_session_result` 只由 dispatcher/recovery 调用。`status="failed"` 在一次 repository transaction 中保留 ownership 的未关闭 lifecycle、写 non-empty failure code、command fact/receipt，并将 MeetingState.version/updatedAt 加一但保持 `archiving`。`status="closed"` 在同一 transaction 中把 ownership 置 `lifecycleStatus="closed"`、`capabilityStatus="revoked"`、清除 failure code、写 fact/receipt 并增加 Meeting version；若提交后不存在未关闭的本 Meeting ownership，同一 commit 把 lifecycle 置 `archived`。replay 不重复关闭或加 version；不能证明 ownership 属于本 Meeting 时返回 `RECOVERY_UNAVAILABLE` 且零写。

### Candidate 复用

同一 `(candidateId, agendaId)` 的 provisioning/active recommendation 返回 `INVALID_STATE`。同一 candidate 尚有任一 provisioning 时，其他 Agenda 的 admit 也返回 `INVALID_STATE`。已有 active recommendation 时，另一 Agenda 的匹配 Definition admit 直接创建独立 active recommendation，复用 identityId、childSessionId 和 definition provenance，以本次 command 的 Runtime now 写 createdAt/resolvedAt；不调用 `ids.nextId("meeting_identity")`，不生成 effect，不追加 identity，不改变角色或 capability。不匹配 provenance 返回 `PRECONDITION_FAILED`。

## 不变量

1. 新业务链只有一个 canonical `MeetingState`；`plugin/src/index.ts`、目标 application/runtime、tools、Remote 和 Client 的活动 import graph 不得引用 `LegacyMeetingState`、`LegacyRiskLevel` 或 legacy protocol entrypoint。保留但不可达的旧模块不算本轮删除失败。
2. 每场 Meeting 恰有一个 Manager、一个 Evidence Reviewer；二者专职且互不兼任 Captain/Contributor。
3. 私有草稿不进入 Manager、reviewer、state、fact、receipt、outbox、projection 或 archive。
4. reviewer worker 只读、无 Meeting authority；写入只能由 coordinator 的一次 batch command 完成。
5. 同轮证据在 `PublishRound` 前不进入其他 Contributor 的公共 view；发布后整轮同时可见。
6. message budget 不通过压缩、合并、覆盖或摘要绕过。
7. archive 只含白名单且按值自足；终态 state 的后续改变不能改变 archive 内容。
8. terminal/archiving/archived 拒绝普通 write；archiving 只允许 archive cleanup result/recovery/read。
9. DSH peer 精确为 `0.1.2-rc.1`；Definition 只能收窄能力，不能扩大 Host authority。
10. production 源码不使用父级相对导入；跨模块只走登记的公开入口。

## 机械执行步骤

以下步骤按单一语义边界拆分；Author/Audit 规划时每步列出的 production、test、fixture 和 script 文件以 8 个为拆分目标，执行中为满足已确认步骤的直接编译闭包可增加必要文件，但不得借此扩展业务范围或顺带调整测试。

### T14a：收敛八角色发布资源

前置状态：T13b PASS。

允许修改：`plugin/meeting-roles/definitions.json`、`plugin/meeting-roles/README.md`、`plugin/meeting-roles/cordis.patch.yml`、`plugin/scripts/verify-agent-definition-samples.mjs`、`plugin/tests/contract/meeting-roles-deployment.spec.ts`。

禁止修改：runtime/plugin lifecycle、identity recommendation、Remote/UI。

执行：删除 Scribe 定义和样本；固定 Manager、Evidence Reviewer 与六个 contributor roles；验证 Definition/Preset/Skill 样本。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir=plugin verify:agent-definitions
```

PASS：资源精确为八个 roles、专职 Manager/reviewer、无 Scribe；验证命令退出 0。

STOP：需要替代角色、增加第九角色或修改 DSH 能力语义。

### T14b：建立 target label 与 provisioning codec

前置状态：T14a PASS。

允许修改：`plugin/src/dsh/labels.ts`、`plugin/src/dsh/provisioning.ts`、`plugin/tests/unit/dsh/labels.spec.ts`、`plugin/tests/unit/dsh/provisioning.spec.ts`。

禁止修改：caller/session adapter、runtime/plugin lifecycle、identity recommendation、review workers、Remote/UI、role resources。

执行：新增 target `MeetingIdentitySessionLabelV1`，required `{role:"manager"|"evidence_reviewer"|"participant";meetingId;identityId}`，编码固定为 `convivium:meeting-identity:<role>:<meetingId>:<identityId>`，decoder 对段数、枚举和 identity segment fail closed，不使用 teamId 或 participantId。`provisioning.ts` 新增同结构的 `createMeetingIdentityProvisioningEnvelopeV1/serializeMeetingIdentityProvisioningEnvelopeV1`。为使尚未迁移的 legacy adapter/tests 编译，旧 label/envelope 函数暂时保留但 target codec 不得调用；T14b2 后活动入口只导出/调用 target codec。测试固定三种 role、非法段数/枚举/identity、跨 Meeting/identity mismatch 与 envelope round-trip。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/dsh/labels.spec.ts tests/unit/dsh/provisioning.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：target label/provisioning envelope 只有 role/meetingId/identityId，三种 role round-trip 且伪造 teamId/participantId 不进入 target 值。

STOP：需要 team namespace、participantId 或修改 DSH provisioning wire 语义。

### T14b2：建立 target caller 与 child Session adapter

前置状态：T14b PASS。

允许修改：`plugin/src/dsh/session-adapter.ts`、`plugin/src/dsh/caller-resolver.ts`、`plugin/src/dsh/session-ownership.ts`、`plugin/src/dsh/index.ts`、`plugin/tests/unit/dsh/session-adapter.spec.ts`、`plugin/tests/unit/dsh/caller-resolver.spec.ts`。

禁止修改：label/provisioning codec、runtime/plugin lifecycle、identity recommendation、review workers、Remote/UI、role resources。

执行：新增唯一 target `startMeetingIdentitySessionV1(input)`，input 在现有 runtime/provider/parent/child/meeting/signal/composition 外 required `role` 与 `identityId`；只调用 T14b target label/envelope，returned childId 必须与 input 精确匹配。`resolveMeetingCallerV1` 实现 T13 resolver 的 `dsh_tool` 分支：只接受 target label 与带 required `id/meetingId/identityId` 的 active ownership，返回 `{caller:{channel:"dsh_tool",principalId:identityId,sessionBindingId:ownership.id},meetingId,identityId,role,ownership}`；不返回或读取 teamId/participantId。`session-ownership.ts` 的 target 校验只比较 meetingId/identityId/role/sessionId/label/active capability。为使明确保留的 legacy tests 编译，旧 adapter/resolver export 可暂留但 target public entrypoint 与 T19 tools 只能引用 `*V1`；不得让 target 函数调用旧函数。one-shot reviewer workers 不使用此 adapter。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/dsh/session-adapter.spec.ts tests/unit/dsh/caller-resolver.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：三种 target child 共用无 teamId 的 adapter；caller binding 只来自可证 ownership，跨 Meeting/identity、closed/revoked、label/childId mismatch 全部 fail closed。

STOP：需要共享 child Session、legacy participant caller、team namespace 或修改 DSH provider 语义。

### T14c：接入创建与 plugin lifecycle

前置状态：T14b2 PASS。

允许修改：`plugin/src/runtime/meeting-runtime.ts`、`plugin/src/index.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`。

禁止修改：identity recommendation、review workers、Remote/UI、role resources、Session adapter。

执行：`meeting-runtime.ts` 实现 T13 `MeetingCreationCoordinatorV1`。其 `create` 只消费 T13 已 normalized 的 create command、真实 meetingId、单次 now、caller 与 signal；按 identityKey 校验并分配 canonical identity ID，通过 T12 `registry.openMeeting({meetingId,create})` 建立唯一 repository，再通过 T14b2 创建恰好八个 child：一个 Manager、一个 Evidence Reviewer、六个 Contributor。每个成功 child 立即记录带 `id/meetingId/identityId` 的 ownership，role 分别为 `manager/evidence_reviewer/participant`，且不写 legacy participantId；Captain parent 不进入 ownership。创建事实、receipt、outbox 与 running state 只提交一次，coordinator 不形成第二 command dispatcher。任一 preflight/session/ownership/commit 失败，按 creation_failed → revoke 已登记 capability → interrupt/drain 已证明 child 的顺序清理，不能发布半可用 Meeting。

`plugin/src/index.ts` 的 lifecycle 只在 DSH version 精确为 `0.1.2-rc.1`、Storage/continuable provider、名为 `spawn` 且声明 `outputSchema` 能力的 one-shot Subagent provider 和八个 Definition resource 可解析后，以 `encodeMeetingStateV1/decodeMeetingStateV1` 显式构造唯一 `DomainRepositoryRegistry<MeetingState>`，再用该 registry 与 coordinator 构造唯一 T13 application 并登记其 teardown；不得使用 T11/T12 的 JsonObject default。每次 create 仍由 coordinator 对本次选择的八个 Definition 做精确 preflight。任一 load-time validation 失败进入 rejected。T15-T17 尚未实现 effect route，T19/T20 尚未实现 target tools/Remote，因此本步禁止构造或注册这些后续组件，也不把 target write 暴露到外部；测试只通过 lifecycle-owned application 调用 `execute(create_meeting)`，不得直接调用 coordinator。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：唯一 application 的 create 委托生成八个 child，创建原子性、target ownership、清理和精确版本 lifecycle 门禁通过；plugin 尚未引用 T15-T20 的未实现 symbol，也未提前注册 target write。

STOP：需要 persona-only、放宽 DSH 版本、写 legacy participantId 或发布半可用 Meeting。

### T15a：接入 identity provisioning effect

前置状态：T14c PASS。

允许修改：`plugin/src/runtime/application-service/meeting-identity-v1.ts`、`plugin/src/runtime/services/meeting-identity-provision-v1.ts`、`plugin/src/dsh/meeting-identity-admission-v1.ts`、`plugin/tests/contract/meeting-identity-command-v1.spec.ts`、`plugin/tests/contract/meeting-identity-provision-v1.spec.ts`、`plugin/tests/integration/dsh/meeting-identity-admission-v1.spec.ts`。

禁止修改：command recovery、ownership、Catalog producer、review/archive services、Remote。

执行：T13 已处理 `recommend_identity` command 和 active reuse；本步不得再建立 action dispatcher。把 `meeting-identity-v1.ts` 收敛为只导出 `createMeetingIdentityEffectHandlerV1(dependencies).dispatch(outboxItem,signal)`：只接受 `identity_provision` effect，从已提交 recommendation 读取固定 `recommendationId=admissionId`、definition id/version/hash、预留 identityId/childSessionId；依次调用既有且已验证的 Definition resolver/preflight 和 `meeting-identity-provision-v1.ts`。provisioner 只调用 T14b2 `startMeetingIdentitySessionV1(role="participant",identityId=预留 identityId)`，该函数内部使用 T14b label/envelope；成功 ownership 必须写 `id/meetingId/identityId` 且不写 participantId。成功或安全失败都只通过 T13 `execute` 提交一个 `record_identity_admission_result`，caller channel=`runtime_recovery`，requestId 固定 `identity-admission:${outboxItem.id}`；不得直接 repository commit。`meeting-identity-admission-v1.ts` 只负责 DSH admit/ownership，等 payload replay 返回同 ownership；失败前新建 child 必须 revoke/drain。active reuse 没有 `identity_provision` effect，本 handler 不会收到它。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-identity-command-v1.spec.ts tests/contract/meeting-identity-provision-v1.spec.ts tests/integration/dsh/meeting-identity-admission-v1.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：首次 provisioning、effect/request replay 和成功/失败 admission 通过；跨 Agenda reuse 零 effect，所有 Meeting 写入都经过 T13。

STOP：reuse 创建第二 Session 或 application 绕过唯一 dispatcher。

### T15b：接入 identity recovery

前置状态：T15a PASS。

允许修改：`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/recovery/meeting-identity-v1.spec.ts`。

禁止修改：identity application/provisioner、review/archive services、Remote。

执行：recovery 只扫描仍为 provisioning 且有 pending `identity_provision` effect 的 intent，重新唤醒 T15a 使用的同一个 outbox worker；worker 重新 claim 后调用同一 effect handler。recovery 不直接调用 handler、不开旁路，也不直接 repository commit；只继续固化 admissionId/Definition/descriptor，uncertain ownership fail closed，不创建替代 child。

验证：
```bash
pnpm --dir=plugin vitest run tests/recovery/meeting-identity-v1.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：provisioning replay、成功/失败 recovery 和 active identity 恢复通过。

STOP：recovery 使用当前 Definition 替代固化 provenance。

### T15c：接入 meeting-owned Session notice

前置状态：T15b PASS。

允许修改：`plugin/src/runtime/services/meeting-notice-dispatch-v1.ts`（新增）、`plugin/src/dsh/session-adapter.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/unit/runtime/meeting-notice-dispatch-v1.spec.ts`（新增）、`plugin/tests/integration/dsh/meeting-notice-dispatch-v1.spec.ts`（新增）、`plugin/tests/unit/runtime/outbox-worker.spec.ts`。

禁止修改：review worker/delivery、archive、projection、Remote/UI、legacy dispatch service。

执行：新增并只导出 `createMeetingNoticeDispatcherV1(dependencies).dispatch({outboxItem,parent,signal}):Promise<void>`，dependencies required 为 `sessions:Pick<SubagentRuntime,"sendMessage">` 与 `repository:Pick<MeetingRepositoryPort<MeetingState>,"read"|"recover">`。它只接受 outer `dispatch` 且 `payload.kind="agent_notice"`、`noticeKind` 为 `meeting_started|opportunity_request|opportunity_disposition|hand_request|hand_disposition|transcript_update` 的 target effect；`review_request` 明确留给 T16，未知 kind fail closed。每次发送前通过 target repository 重读 state/ownership，要求 recipient identity 存在、ownership 的 `id/meetingId/identityId/parentSessionId/sessionId/label` 匹配、lifecycle/capability active，并按已实现 transition 产生该 effect 时的可见性条件重验 Agenda、Round、Contribution 或 publicMessageId；`meeting_started` 还必须重验 Meeting 仍为 running、recipient 仍为与 active Agenda 相关或责任范围为空的 Contributor；不从 payload 接受 Session ID。prompt 只包含 `{effectId:outboxItem.id,meetingId,noticeKind,agendaId}` 和该 notice kind 已提交的公开 ID/disposition/reason，不含他人未公开 Evidence/Review、Session、capability 或完整 state。

在 `session-adapter.ts` 新增唯一 `followupMeetingIdentitySessionV1`，验证 T14b2 target ownership 后调用 `subagents.sendMessage(parent,ownership.sessionId,prompt,{signal})`；`parent` 必须是 ownership 记录的 exact live direct parent。inbox acceptance 只表示 notice delivered，不生成 Meeting command、Contribution、hand 或 evidence。`outbox-worker.ts` 把上述 notice 路由到该 dispatcher；发送失败令同一 outbox effect retry，重试沿用同一 `outboxItem.id`，不创建替代 Session。注册/handler 不自行 claim、complete 或建立第二 worker。

验证：
```bash
test -f plugin/src/runtime/services/meeting-notice-dispatch-v1.ts
test -f plugin/tests/unit/runtime/meeting-notice-dispatch-v1.spec.ts
test -f plugin/tests/integration/dsh/meeting-notice-dispatch-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/meeting-notice-dispatch-v1.spec.ts tests/integration/dsh/meeting-notice-dispatch-v1.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：六类 notice（含 `meeting_started`）只到达匹配的 active owned child；跨 Meeting/identity、closed/revoked、不可见引用与未知 kind 拒绝；相同 effect retry 保持同一 effectId，inbox acceptance 不产生业务事实。

STOP：需要 sibling sender、内部 queue API、第二 outbox worker、未验证 ownership 或向 prompt 暴露非公开内容。

### T16：接入 reviewer workers

前置状态：T15c PASS。

允许修改：`plugin/src/runtime/services/evidence-review-dispatch-v1.ts`（新增）、`plugin/src/dsh/session-adapter.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/unit/runtime/evidence-review-dispatch-v1.spec.ts`（新增）、`plugin/tests/integration/dsh/evidence-review-dispatch-v1.spec.ts`（新增）、`plugin/tests/unit/runtime/outbox-worker.spec.ts`。

禁止修改：archive、projection、Remote/UI。

执行：新增并只导出以下入口；不得增加 queue、claim、lease 或持久 batch 类型：

```ts
interface DispatchEvidenceReviewBatchInputV1 {
    outboxItem: OutboxItem;
    coordinator: Agent;
    coordinatorOwnership: SessionOwnership;
    signal: AbortSignal;
}
function createEvidenceReviewDispatcherV1(dependencies: EvidenceReviewDispatcherDependenciesV1): {
    dispatch(input: DispatchEvidenceReviewBatchInputV1): Promise<void>;
};
```

`ReviewerPendingEvidenceV1` required 为 `{version:EvidenceVersionV1; baseline:readonly {publicationId:OpaqueId; evidence:readonly {version:EvidenceVersionV1; review:EvidenceReviewV1}[]}[]}`；baseline 按所属 Round 的 `baselinePublicationIds` 顺序，每个 publication 内按 `finalVersionIds/finalReviewIds` 同序按值组装，不能只给 ID 或当前 state 引用。dependencies required 为 `subagents:Pick<SubagentRuntime,"start">`、`application:MeetingCommandApplicationV1`、`repository:Pick<MeetingRepositoryPort<MeetingState>,"read">`；provider 不配置，精确使用 T14c 已预检的 `"spawn"`。处理 `payload.kind="agent_notice",noticeKind="review_request"` 时重读 target snapshot，验证 coordinatorOwnership 的 meetingId/identityId/session/active capability 与 `state.evidenceReviewerId` 精确匹配，再从 state 中选择 current + complete Registration + 无最终 Review 的 version，按 EvidencePackage/state 顺序构造 pending set；不得依赖尚未实施的 T18b projection。空集合直接把 outbox item 视为 delivered。非空集合为每个 version 建立一个 async task：先 `run = await subagents.start("spawn",{parent:coordinator,prompt,signal,outputSchema})`，再在 `try` 中 `await run.result`，并在 `finally` 中 `await run.dispose()`；对这些 task 使用一次 `Promise.allSettled`。这样 `start` 自身失败只拒绝该 task，已成功创建的每个 run 都必定 dispose。request 不覆盖 `agentOptions/persona/toolFilter`，worker 使用 reviewer coordinator 的 Host-approved route/能力；Meeting tools 仍因 worker 无 target ownership 被 T14b2 resolver 拒绝。prompt 只含该 immutable version、上述 immutable baseline 和固定 Review outputSchema `{scope:string;dimensions:{source:ReviewDimensionInput;credibility:ReviewDimensionInput;completeness:ReviewDimensionInput;support:ReviewDimensionInput}}`；每个 dimension 精确为 `{score:0|1|2|3|"unable_to_assess";scope:string;reason:string;baselineEvidenceIds:OpaqueId[]}`，baselineEvidenceIds 只能来自该 worker baseline 的 version ID。worker 不是 continuable Meeting child，不写 `SessionOwnership`，不获得 Meeting command authority。

只收集 `stopReason="completed"` 且 structured output 通过 Review item Schema 的结果；失败/取消/非法输出项省略并继续 pending。成功集合非空时只调用一次 `application.execute`，action 为一个 `submit_review_batch`，requestId 固定为 `review-batch:${outboxItem.id}`，caller 固定为 coordinator 的 reviewer binding；成功集合为空时令该 outbox item retry。`outbox-worker.ts` 只把 `agent_notice/review_request` 路由到该 dispatcher，不自行启动 worker 或提交 command。

同一 `evidence-review-dispatch-v1.ts` 另导出 `createReviewDeliveryDispatcherV1(dependencies).dispatch({outboxItem,parent,signal}):Promise<void>`，dependencies required 为 `sessions:Pick<SubagentRuntime,"sendMessage">`、`application:MeetingCommandApplicationV1`、`repository:Pick<MeetingRepositoryPort<MeetingState>,"read"|"recover">`；只消费 outer `dispatch` 且 `payload.kind="review_delivery"`。它重读 target snapshot 与 ownership，验证 payload reviewId/authorId 对应同一已提交 Review/EvidencePackage、作者 identity active、唯一 target ownership 的 `id/meetingId/identityId/parentSessionId/sessionId/label` 匹配且 capability active；已存在该 review 的 sent delivery 时直接 delivered。否则通过 T15c `followupMeetingIdentitySessionV1` 向作者 direct child 发送 `{effectId:outboxItem.id,meetingId,review}`，不向 Manager 或其他 Contributor 发送。inbox acceptance 后重读 version，并只调用一次 T13 `execute(record_review_delivery status="sent")`，requestId 固定 `review-delivery:${outboxItem.id}:${outboxItem.attempts}:sent`，context 使用 `RUNTIME_RECOVERY_PRINCIPAL_ID`。发送失败时以同样方式提交 `status="failed",failureReason="REVIEW_DELIVERY_FAILED"` 和 requestId suffix `:failed`，不得持久化原始异常，然后令 outbox retry；command commit 不确定时先按 requestId/sent delivery recover，不能凭 send acceptance 推断 Meeting commit。`outbox-worker.ts` 还把 `review_delivery` 路由到该 dispatcher，不复制发送或 command 算法。

验证：
```bash
test -f plugin/src/runtime/services/evidence-review-dispatch-v1.ts
test -f plugin/tests/unit/runtime/evidence-review-dispatch-v1.spec.ts
test -f plugin/tests/integration/dsh/evidence-review-dispatch-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/evidence-review-dispatch-v1.spec.ts tests/integration/dsh/evidence-review-dispatch-v1.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：至少两个不同 worker Session 并发、一次 batch、worker 无 Meeting authority；review 只送达对应作者，sent/failed attempt 经 T13 提交，失败重试与不确定 commit 不产生重复 sent fact。

STOP：需要共享 worker Session、持久 batch/lease 或 worker 直接写 Meeting。

### T17：接入 archive cleanup 与恢复

前置状态：T16 PASS。

允许修改：`plugin/src/runtime/services/meeting-archive-v1.ts`（新增）、`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/unit/runtime/meeting-archive-v1.spec.ts`（新增）、`plugin/tests/recovery/contribution-recovery.spec.ts`、`plugin/tests/unit/runtime/outbox-worker.spec.ts`。

禁止修改：review dispatcher、Remote/UI、旧 archive service。

执行：本步消费 T13 `end_meeting` 产生的 archive outbox；只通过 T13 `start_archive` command 物化 package，不在 service 内复制 materialization。新增并只导出以下入口：

```ts
interface DispatchArchiveCleanupInputV1 { outboxItem: OutboxItem; parent: Agent; signal: AbortSignal }
function createMeetingArchiveDispatcherV1(dependencies: MeetingArchiveDispatcherDependenciesV1): {
    dispatch(input: DispatchArchiveCleanupInputV1): Promise<void>;
};
```

dependencies required 为 `{repository; sessions:Pick<SubagentRuntime,"listChildren"|"interrupt"|"drainContinuableChildren">; application:MeetingCommandApplicationV1}`。`dispatch` 先 recover committed snapshot：若 lifecycle=terminal，提交一次 `start_archive`，requestId 固定为 `archive-start:${outboxItem.id}`，context 使用 `caller={channel:"runtime_recovery",principalId:RUNTIME_RECOVERY_PRINCIPAL_ID}` 和 `{effectId:outboxItem.id,archiveId:outboxItem.payload.archiveId}`；accepted/replay 后重读。若已 archiving，要求 `archive.id===outboxItem.payload.archiveId` 且 archive.status=complete；若已 archived 且 ID 相同，直接 delivered；其它状态或 ID mismatch 返回 `RECOVERY_UNAVAILABLE`。随后以 repository 中 `meetingId` 匹配且未 supersede 的 ownership 为唯一 cleanup 目标；目标必须恰好一个 manager、一个 evidence_reviewer，并包含创建时六个 participant 及 T15 后续已激活的 participant。每个 identityId 都存在于 archived identity provenance，每个 active identity 恰有一个 ownership，parentSessionId 全部等于 `String(parent.id)`；调用 `sessions.listChildren(parent.id,signal)` 得到的 durable direct-child id/label 必须与 ownership 一致。缺失、额外、重复或不明归属立即返回 `RECOVERY_UNAVAILABLE`，不得操作任何 Session。

对每个未 closed ownership，先同步调用 `sessions.interrupt(ownership.sessionId,{kind:"ancestor",agent:parent})`，再 `await sessions.drainContinuableChildren(parent,[ownership.sessionId])` 并等待静默；不得把 fire-and-return interrupt 当作关闭完成。每次提交 result 前重读 snapshot，用当时 version 作为 expectedMeetingVersion，成功后再处理下一 ownership，不并发 closure command。成功后调用一次 `application.execute` 提交 `record_archive_session_result(status="closed")`，失败则提交一次 `status="failed",failureReason="SESSION_CLOSE_FAILED"`，不得保存原始异常文本。requestId 固定为 `archive:${archive.id}:${ownership.id}:${outboxItem.attempts}:${status}`；command commit 不确定时先 recover，已 closed 则跳过，已记录同一 failure 则进入下一 outbox attempt，不产生重复 fact。任一 failed 令 outbox retry且 Meeting 保持 archiving；全部 ownership closed 后最后一个 command 在同一 repository transaction 进入 archived。`outbox-worker.ts` 只路由 archive effect；recovery service 只调用 repository recovery 重新领取 pending archive outbox 并 wake 同一个 outbox worker，不复制关闭算法。

验证：
```bash
test -f plugin/src/runtime/services/meeting-archive-v1.ts
test -f plugin/tests/unit/runtime/meeting-archive-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/meeting-archive-v1.spec.ts tests/recovery/contribution-recovery.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：close failure/restart/retry 后 archived；无重复或不明归属 Session。

STOP：需要回滚 archive package 或创建替代 Session。

### T18a：固化 read DTO Schema

前置状态：T17 PASS。

允许修改：`plugin/src/protocol/meeting-view-v1.ts`（新增）、`plugin/src/protocol/index.ts`、`plugin/tests/contract/protocol-role-and-archive-schema.spec.ts`。

禁止修改：projection、tools/Remote/Client。

执行：在 protocol 层逐字段实现 Meeting Interface 的 `MeetingSummaryV1`、`MeetingViewV1`、`ArchiveView` 及其全部 nested DTO Schema/type；这是唯一公开 read DTO 定义。同时固定 Remote read envelope：复用既有 `ReadMeetingRequestV1={protocolVersion:1;meetingId:OpaqueId}`，新增 `MeetingListResultV1={meetings:MeetingSummaryV1[]}`、`MeetingReadResultV1=MeetingViewV1`、`RefreshNoticeV1={kind:"refresh";meetingId:OpaqueId;committedVersion:number}` 及对应 Schema。Schema 不得包含 `teamId`、完整 state、Session/ownership/capability、未审私有内容或额外可写字段；从 protocol public entrypoint 导出。

验证：
```bash
test -f plugin/src/protocol/meeting-view-v1.ts
pnpm --dir=plugin vitest run tests/contract/protocol-role-and-archive-schema.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：summary/detail/archive 的合法最小值、完整值与禁入字段均由 Schema 机械验证。

STOP：Meeting Interface 缺少 mapper 所需字段或必须发明公开 DTO。

### T18b：实现 caller-filtered projection

前置状态：T18a PASS。

允许修改：`plugin/src/projection/meeting-view-v1.ts`、`plugin/src/projection/index.ts`、`plugin/tests/contract/meeting-identity-view-v1.spec.ts`。

禁止修改：protocol、legacy projection、tools/Remote/Client。

执行：删除当前把完整 state 放进 view 的 `{meetingId,meetingVersion,state}` shape，新增唯一 caller context 和三个 mapper：

```ts
type MeetingProjectionCallerV1 =
    | { kind:"local" }
    | { kind:"identity"; identityId:OpaqueId; roles:readonly MeetingRole[] };
function projectMeetingSummaryV1(snapshot:MeetingSnapshot<MeetingState>): MeetingSummaryV1;
function projectMeetingViewV1(snapshot:MeetingSnapshot<MeetingState>, caller:MeetingProjectionCallerV1, managerCatalog?:MeetingAgentCatalogV1): MeetingViewV1;
function projectArchiveViewV1(archive:ArchivePackageV1, caller:MeetingProjectionCallerV1): ArchiveView;
```

三个返回结构逐字段等于 Meeting Interface 的 `MeetingSummaryV1`、`MeetingViewV1`、`ArchiveView`；不得返回 `state`。`projectMeetingViewV1` 的固定过滤为：local 可读全部公开聚合字段；Manager 只读 Contribution/ReviewDelivery 状态且 `evidencePackages/evidenceReviews` 不含本轮正文、materials 或评分；唯一 reviewer 读全部当前待审 version、对应 baseline/review/delivery；Contributor 只读已发布内容以及自己的当前 version/已送达 review，完全省略他人未发布记录。`identityRecommendations/managerCatalog` 只给 local 或 Manager，privateMail 只给 local 或 sender/recipient。`projectArchiveViewV1` 只复制 ArchivePackage 白名单；非 local 的 `decisionCandidates` 只保留被 Decision 引用者，local 保留全部。`controls` 只列本 RUNBOOK 已接线且 caller/lifecycle 初步允许的 action，Runtime 仍重新授权。`projection/index.ts` 只登记这三个 target mapper，不再导出旧 contribution/developer-markdown projection；`status.ts` 与它直接依赖的 `contribution.ts` 成对保留但不接入目标入口。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-identity-view-v1.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：轮内隔离、Manager 无正文、reviewer pending set、local archive 和敏感字段排除通过。

STOP：需要向 caller 暴露 Session/capability/private data。

### T19a：收敛 target application/runtime entrypoint

前置状态：T18b PASS。

允许修改：`plugin/src/runtime/application-service/index.ts`、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/index.ts`、`plugin/tests/unit/module-boundaries.spec.ts`。

禁止修改：tools、Remote、Client、旧 application 文件。

执行：`application-service/index.ts` 只构造/暴露 T13 application 与 T15 effect handler，但在 T23-T25 删除旧文件前继续 type-only 导出这些文件编译所需的 legacy-only types；不得再构造或从活动入口导出旧 application implementations。`runtime/index.ts` 只暴露前述 application、T15-T17 target services 和 target `openMeetingRepository`。既有 `tests/fixtures/remote-gateway.ts` 仍编译所需的旧 `LocalMeetingWebRuntime` 只能作为明确 legacy-only type 暂留到 T20，不得被 target tool/application 消费；T20 必须用正式四方法 type 替换。两 barrel 不再导入或导出旧 application constructors、contribution/dispatch/session/developer-markdown services；module boundary test 固定该活动 import graph，并允许旧文件在 T23-T29 前暂时不可达地存在。`application-service/types.ts` 的 legacy-only types 由 T26 在消费者删除后清理。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/module-boundaries.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：T19b 可只从 target public entrypoint 导入 dispatcher；活动 application/runtime barrel 无旧 implementation export，旧 `LocalMeetingWebRuntime` 仅为 T20 前的 type-only compile bridge。

STOP：target tool 仍需深路径或旧 implementation，或必须用转发 facade 维持 runtime 行为。

### T19b：接入 DSH tools

前置状态：T19a PASS。

允许修改：`plugin/src/protocol/meeting-command-v1.ts`、`plugin/src/protocol/index.ts`、`plugin/src/tools/register-tools.ts`、`plugin/src/tools/index.ts`、`plugin/tests/contract/tool-registration.spec.ts`。

禁止修改：Remote、Client、旧 application 文件。

执行：从 `meeting-command-v1.ts` 逐个导出这七个 action 的既有 Zod Schema，不复制 shape；只登记七个 agent tools：`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`（Manager），`convivium_raise_hand`、`convivium_submit_evidence`（Contributor），`convivium_submit_review_batch`（唯一 reviewer coordinator），`convivium_recommend_identity`（Manager）。每个 `defineTool` 的 DSH parameter 固定为唯一 `{input:{type:"json",required:true}}`；`execute` 先用 `MeetingCommandV1Schema` strip/parse `input`，再要求 action kind 精确等于该 tool，因而 envelope 只有 `protocolVersion/meetingId/expectedMeetingVersion/requestId`，action shape 只来自对应既有 Zod Schema。tool 不接受 actor/session/generated ID，从 `exec.agent` 经 T14b2 resolver 得到 caller，把 `exec.signal` 原样传给 T13 `MeetingCommandApplicationV1.execute`。output 固定 `{schema:{type:"json"},render:(_args,value)=>[{type:"text",text:JSON.stringify(value)}]}`，domain rejection 作为 schema-valid `MeetingCommandResultV1` 返回，只有 infrastructure failure throw。使用 `ctx.tools.register` 的 fiber-owned registration，不再手工保存 disposer 或重复包 `ctx.effect`。删除其它 legacy tool registration，不把 local-only create/end 或 runtime-only start/result action 注册成 tool。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/tool-registration.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：七个 tool 的 input/action mismatch、authority、canonical output/render、cancellation、fiber disposal、公开导入和唯一 dispatcher 通过。

STOP：tool 需要深路径、直接调用旧 application、复制 action Schema 或提交 actor。

### T20：接入 loopback Remote 并完成 plugin target assembly

前置状态：T19b PASS。

允许修改：`plugin/src/remote/types.ts`、`plugin/src/remote/index.ts`、`plugin/src/runtime/index.ts`、`plugin/src/index.ts`、`plugin/tests/contract/remote-boundary.spec.ts`、`plugin/tests/contract/remote-generation.spec.ts`、`plugin/tests/unit/module-boundaries.spec.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`。

禁止修改：Client、Domain、repository。

执行：`ConviviumRemoteService` 继续继承 `TypertRemoteService`，精确只保留下列 concrete public methods：`@Remote("list") list(signal:AbortSignal):Promise<MeetingListResultV1>`、`@Remote("read") read(request:ReadMeetingRequestV1,signal:AbortSignal):Promise<MeetingReadResultV1>`、`@Remote("control") control(command:MeetingCommandV1,signal:AbortSignal):Promise<MeetingCommandResultV1>`、`@Remote({mode:"stream"}) subscribeRefresh(signal:AbortSignal):AsyncIterable<RefreshNoticeV1>`；不得手写 Typert artifact，不暴露 action-specific Remote method，不转发 agent tool action。四者只在 lifecycle 注入的 `webServer.host === "127.0.0.1"` 时注册；其它 host 使整组 target activation rejected，不注册 Remote、tools 或 worker。注册成功后调用 T13 时构造 `caller={channel:"loopback_remote",principalId:LOCAL_CONTROLLER_PRINCIPAL_ID}`，不接受 wire actor/authority/session 字段。`list` 调 T18b summary mapper；`read` 调 T18b caller=`local` mapper并由同一结果读取 archive；`control` 只允许 `create_meeting|end_meeting`，`start_archive` 由 durable archive effect 自动执行，其它 action 返回 `UNAUTHORIZED`，允许的 write 只调用 T13 `MeetingCommandApplicationV1.execute`；所有方法向 owned operation 传递 signal。`subscribeRefresh` 只发 `{kind:"refresh",meetingId,committedVersion}`，允许丢失/重复、不携带事实，stream cancel/dispose 后必须静默。`types.ts` 只定义 JSON-safe Remote payload 与 `RemoteErrorDetailsMap` declaration merge；`ClientRemote` augmentation 只由现有 Typert generator 产生，不手写。Remote `index.ts` 只注册该 service；`runtime/index.ts` 删除 T19a 暂留的 legacy type并只导出这四方法所需的正式 `LocalMeetingWebRuntime` type。`remote-generation.spec.ts` 必须生成并断言精确四方法及 stream metadata；module boundary test 证明 compile bridge 已清除。

在 T14c 的 lifecycle-owned runtime factory 中同时装配唯一 T13 application、同一个 outbox worker 及 T15-T17 的 `identity_provision|agent_notice|review_delivery|archive` 四类 payload route、T19 七个 tools 和本步 loopback Remote。只有精确 DSH version、Storage/continuable provider、`spawn` one-shot provider 的 `outputSchema` 能力、八个 Definition 与 loopback binding 全部预检成功后才注册 target write/read；local 与 runtime caller adapter 必须产生 T13 固定的 scope，删除 legacy tool/Remote/runtime factory 的活动注册。`ctx.tools.register` 直接绑定当前 plugin fiber，不重复包 effect；Remote 由其 child plugin fiber 拥有；outbox polling/subscription/runtime disposer 由一个 `ctx.effect` 拥有并在 disposer resolve 前停止领取、取消等待、await 已开始 dispatch 静默。启动恢复只 recover pending outbox 并 wake 同一个 worker，不复制 handler；stopping 先拒绝新 command，等待已开始 commit，停止领取新 effect，再释放已证明归属的 activation。预检或装配任一步 throw 时由同一 activation fiber 反序释放已注册资源并进入 rejected，不得留下部分 tool、Remote 或 worker registration。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/remote-boundary.spec.ts tests/contract/remote-generation.spec.ts tests/unit/module-boundaries.spec.ts tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：loopback authority、伪造 actor、read/write DTO 和 error mapping 通过；T19a 的 legacy `LocalMeetingWebRuntime` compile bridge 已删除；一个 application、一个 outbox worker、七个 tools、一个四方法 Remote 同成同败，legacy registration 为零且 teardown 顺序通过。

STOP：需要 Web user/Team authority、Remote 复制 Domain 规则、第二 worker/application、部分注册、调用未公开深路径或改变任一组件业务语义。

### T21a：接入 Client transport

前置状态：T20 PASS。

允许修改：`plugin/src/client/meeting-client.ts`、`plugin/tests/client/meeting-client.client.spec.ts`。

禁止修改：panel、CSS/视觉系统、business semantics、Remote。

执行：用 T20 四方法替换现有 action-specific client。`MeetingClient` 精确暴露 `list(signal?:AbortSignal):Promise<MeetingListResultV1>`、`read(request:ReadMeetingRequestV1,signal?:AbortSignal):Promise<MeetingReadResultV1>`、`control(command:MeetingCommandV1,signal?:AbortSignal):Promise<MeetingCommandResultV1>`、`subscribeRefresh(onUnavailable:()=>void):RemoteStream<RefreshNoticeV1>`。`list/read/control` 分别用 T18a 的 list/read Schema 与既有 `MeetingCommandResultV1Schema` 验证 Remote value；Typert carrier failure 按 error code 映射为 Meeting Interface error，action 的 `kind="rejected"` 保持普通返回值，不转换成 throw。`subscribeRefresh` 只用现有 `remote.$stream` 打开 T20 stream，carrier failure 调 `onUnavailable`，不增加 replay cursor、自动 command retry 或 polling。`control` 不自动 retry；accepted 或 rejected 后调用方均可显式 `read`，Client 自身不缓存、不计算 Domain state。archive 不设第二 endpoint，只从 `read(...).archive` 取得。

验证：
```bash
pnpm --dir=plugin vitest run tests/client/meeting-client.client.spec.ts
pnpm --dir=plugin typecheck:client
```

PASS：transport DTO、error mapping 和 refresh contract 通过。

STOP：需要 Client 重算领域事实或修改 Remote。

### T21b：接入 Client 只读视图

前置状态：T21a PASS。

允许修改：`plugin/src/client/meeting-panel-layout.tsx`、`plugin/src/client/meeting-panel-sections.tsx`、`plugin/src/client/meeting-panel-view.tsx`、`plugin/tests/client/meeting-panel-v1-fixtures.ts`（新增）、`plugin/tests/client/meeting-panel.client.spec.ts`、`plugin/tests/client/meeting-panel-visibility.client.spec.ts`。

禁止修改：interactive panel、legacy fixture、CSS/视觉系统、Remote。

执行：layout/sections/view 只消费 T18a 定义、T18b 产生的 `MeetingSummaryV1/MeetingViewV1/ArchiveView`，展示 Meeting list、选中 detail、Round/Contribution 状态、已获准可见的 Evidence/Review、FormalMessage、Termination 与 Archive；删除 legacy proposal/risk/contribution-control DTO 分支和 Client 侧事实拼装。所有显示字段直接来自 projection，缺席字段显示为空态而不推断。新测试只使用新增 `meeting-panel-v1-fixtures.ts`，既有 `meeting-panel-fixtures.ts` 不修改、不删除。

验证：
```bash
test -f plugin/tests/client/meeting-panel-v1-fixtures.ts
pnpm --dir=plugin vitest run tests/client/meeting-panel.client.spec.ts tests/client/meeting-panel-visibility.client.spec.ts
pnpm --dir=plugin typecheck:client
```

PASS：只读布局、archive 和 visibility 通过；没有 Client 派生业务事实。

STOP：需要读取 legacy DTO、修改旧 fixture 或视觉重设计。

### T21c：接入 Client local controls

前置状态：T21b PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/meeting-panel-lifecycle.client.spec.ts`、`plugin/tests/client/meeting-panel-local-controls.client.spec.ts`。

禁止修改：layout/sections/view、fixture、Remote、business semantics。

执行：只接 `end_meeting` local control；create 由 T20 loopback Remote 和 T22 smoke 覆盖，本轮不新增复杂创建表单，start_archive 由 durable archive effect 自动执行且不显示按钮。按钮是否显示只检查 projection `controls`，点击时用当前 `view.version` 构造 command、生成新的 requestId、调用 T21a `control`，无论 accepted/rejected 都重读同一 meeting；pending 时禁用重复提交。删除 pause/resume、archive、decision/risk/contribution legacy controls，不在 Client 复算结束或归档前提。

验证：
```bash
pnpm --dir=plugin vitest run tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-local-controls.client.spec.ts
pnpm --dir=plugin typecheck:client
```

PASS：control authority、pending/disabled 状态和 refresh 通过。

STOP：需要 pause/resume、Client 侧领域判断或修改旧 fixture。

### T22：增加真实 DSH 业务闭环 smoke

前置状态：T21c PASS。

允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/result.mjs`、`plugin/scripts/smoke-profile/probe/index.js`、`plugin/scripts/smoke-profile/probe/support.js`、`plugin/scripts/smoke-profile/probe/scenarios/meeting-business-loop.js`（新增）、`plugin/tests/contract/installation-entrypoints.spec.ts`。

禁止修改：production business code、existing identity-admission scenario。

执行：新增 core scenario，真实完成目标链并验证八 roles、每个合格 Contributor 恰收一次初始 `meeting_started`、隔离 workers、batch、review delivery、publish、partial、archive、close、cold reopen。

验证：
```bash
test -f plugin/scripts/smoke-profile/probe/scenarios/meeting-business-loop.js
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir=plugin smoke:profile
pnpm --dir=plugin vitest run tests/contract/installation-entrypoints.spec.ts
```

PASS：真实 scenario 观测到初始 notice、批量审核与 review delivery 后完成归档冷读；entrypoint test 退出 0。

STOP：只能用 mock 替代真实 Loader/Storage/Session/Tool。

### T23：删除旧调度 application-service

前置状态：T22 PASS；T19a 与 T20 已移除活动入口引用并完成 target assembly。

允许删除：
- `plugin/src/runtime/application-service/create-meeting.ts`
- `plugin/src/runtime/application-service/meeting-control.ts`
- `plugin/src/runtime/application-service/meeting-turn.ts`
- `plugin/src/runtime/application-service/meeting-agenda-candidate.ts`
- `plugin/src/runtime/application-service/meeting-attendance.ts`

禁止修改：其他全部文件。

执行：只删除上述 5 个文件；不得增加 facade。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 5
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 5
pnpm --dir=plugin typecheck:host
```

PASS：当前步骤恰好删除列出的 5 个 application-service 文件且无其他改动；typecheck 退出 0。

STOP：仍有引用、需要修改其他文件或删除第 6 个文件。

### T24：删除旧准备与决策 application-service

前置状态：T23 PASS。

允许删除：
- `plugin/src/runtime/application-service/continuation-selection.ts`
- `plugin/src/runtime/application-service/initialize-meeting-turn.ts`
- `plugin/src/runtime/application-service/meeting-contribution.ts`
- `plugin/src/runtime/application-service/meeting-decision.ts`

禁止修改：其他全部文件。

执行：只删除上述 4 个文件；不得修改旧 fixture 或 `contribution-runtime.spec.ts`。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 4
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 4
pnpm --dir=plugin typecheck:host
```

PASS：当前步骤恰好删除列出的 4 个 application-service 文件且无其他改动；typecheck 退出 0。

STOP：仍有 production 引用、需要修改其他文件或当前删除不等于 4。

### T25：删除剩余旧 application-service 及直接测试

前置状态：T24 PASS。

允许删除：
- `plugin/src/runtime/application-service/meeting-end.ts`
- `plugin/src/runtime/application-service/meeting-mail.ts`
- `plugin/src/runtime/application-service/meeting-query.ts`
- `plugin/src/runtime/application-service/meeting-task.ts`
- `plugin/tests/contract/contribution-runtime.spec.ts`
- `plugin/tests/contract/continuation.spec.ts`

禁止修改：fixture、legacy Domain/protocol/projection/runtime services/其他 tests，以及此前步骤已完成的文件。

执行：只删除上述 6 个文件；不得增加转发文件或兼容 facade。`continuation.spec.ts` 直接依赖 T19a 已移除的 legacy runtime/application barrel，且 Continuation import 是本轮 Non-goal，因此与旧 application 一起删除，不修改为 target test。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 6
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 4
test "$(git diff --diff-filter=D --name-only | rg '^plugin/tests/' | wc -l | tr -d ' ')" -eq 2
test -z "$(rg -n 'application-service/(continuation-selection|create-meeting|initialize-meeting-turn|meeting-agenda-candidate|meeting-attendance|meeting-contribution|meeting-control|meeting-decision|meeting-end|meeting-mail|meeting-query|meeting-task|meeting-turn)\.js' plugin/src plugin/tests || true)"
pnpm --dir=plugin lint
pnpm --dir=plugin typecheck
pnpm --dir=plugin test
```

PASS：当前步骤恰好删除 4 个 application-service 和 2 个直接测试；T23-T25 的目标列表零引用；lint/typecheck/test 退出 0；旧 fixture 未修改。

STOP：当前步骤删除分类不符、仍有引用且必须修改 T19 之外文件；不得把 T26-T29 的文件提前到本步删除。

### T26：删除旧辅助 application services

前置状态：T25 PASS；T19a 与 T20 已移除活动入口和 module-boundary 引用。

允许删除：
- `plugin/src/runtime/services/developer-markdown-service.ts`
- `plugin/src/projection/developer-markdown.ts`
- `plugin/src/runtime/services/meeting-session-recovery.ts`
- `plugin/src/runtime/services/public-submission-service.ts`
- `plugin/src/runtime/services/meeting-session-service.ts`

允许修改：`plugin/src/runtime/application-service/types.ts`。

禁止修改：其他全部文件。

执行：删除上述 5 个文件，并从 `application-service/types.ts` 删除只被 T23-T26 已删文件消费的 Developer Markdown 与 legacy application option/type；保留 target dependency/context/result type。不得删除 legacy Domain/protocol/repository/fixture。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 5
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 6
pnpm --dir=plugin typecheck:host
```

PASS：当前步骤恰好删除列出的 5 个文件并只修改 1 个 types 文件；legacy-only application type 零引用，host typecheck 退出 0。

STOP：仍有 production 引用、需要修改其他文件或当前删除不等于 5。

### T27：删除旧辅助 application tests

前置状态：T26 PASS。

允许删除：
- `plugin/tests/unit/runtime/developer-markdown-service.spec.ts`
- `plugin/tests/unit/projection/developer-markdown.spec.ts`
- `plugin/tests/recovery/session-recovery.spec.ts`

禁止修改：其他全部文件，尤其是 fixture。

执行：只删除上述 3 个直接测试。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 3
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 3
pnpm --dir=plugin typecheck
```

PASS：当前步骤恰好删除列出的 3 个直接测试且无其他改动；typecheck 退出 0。

STOP：需要修改测试或 fixture 才能通过。

### T28：删除旧 contribution/dispatch application services

前置状态：T27 PASS。

允许删除：
- `plugin/src/runtime/services/contribution-runtime-service.ts`
- `plugin/src/runtime/services/meeting-dispatch-service.ts`

禁止修改：其他全部文件。

执行：只删除上述 2 个 production 文件；旧 Domain transition、`plugin/src/projection/status.ts` 及其直接依赖 `plugin/src/projection/contribution.ts` 成对保留但保持不从 T18b target entrypoint 导出。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 2
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 2
pnpm --dir=plugin typecheck:host
```

PASS：当前步骤恰好删除列出的 2 个 production 文件且无其他改动；retained projection pair 不在 target barrel；host typecheck 退出 0。

STOP：需要拆散 retained projection pair、删除旧 Domain/protocol 或其他文件。

### T29：删除旧 contribution/dispatch 直接测试

前置状态：T28 PASS。

允许删除：
- `plugin/tests/unit/runtime/contribution-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-mail-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-manager-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-speaker-dispatch.spec.ts`

禁止修改：其他全部文件，尤其是 fixture 和 legacy Domain tests。

执行：只删除上述 4 个直接测试；T17 已把 `contribution-recovery.spec.ts` 改成 target archive/recovery 证据，必须保留；不得增加 replacement legacy tests。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 4
test "$(git diff --diff-filter=D --name-only | rg '^plugin/tests/' | wc -l | tr -d ' ')" -eq 4
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 4
pnpm --dir=plugin lint
pnpm --dir=plugin typecheck
pnpm --dir=plugin test
```

PASS：当前步骤恰好删除列出的 4 个直接测试且无其他改动；lint/typecheck/test 退出 0；T17 target recovery test 保留；fixture 零删除、零修改。累计 30 个文件的分类由已提交后的 T30 验证。

STOP：总删除超过 30、分类不符、需要扩大到 retained projection pair、Domain/protocol/repository/fixture。

### T30：收口验证与 readiness

前置状态：T29 PASS。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK（最终删除）。

禁止修改：production、test、requirements/interfaces/designs。

执行：先在 readiness 记录真实闭环、已删除的 1 个冗余 command repository facade、20 个 application-side production 文件与 9 个直接测试的删除和验证；明确 DSH Storage Domain adapter 与 repository core 保留，legacy Domain/protocol、`projection/status.ts` + `projection/contribution.ts` pair、未列出的 runtime services/tests 和全部 fixtures 仍未删除。然后运行下列累计删除、完整产品和 smoke 门禁；全部成功后按“完成定义与 RUNBOOK 删除”执行 Close 检查，删除本 RUNBOOK，并再次运行文档链接与 diff 检查。readiness 更新与 RUNBOOK 删除必须进入同一个 T30 收口提交，不产生“只删除已完成 T30”或“只删除 RUNBOOK”的独立提交。

验证：
```bash
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/' | wc -l | tr -d ' ')" -eq 30
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/src/repository/meeting-command-repository-v1\.ts$' | wc -l | tr -d ' ')" -eq 1
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 13
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/src/runtime/services/' | wc -l | tr -d ' ')" -eq 6
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/src/projection/' | wc -l | tr -d ' ')" -eq 1
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/tests/' | wc -l | tr -d ' ')" -eq 9
test -z "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/tests/fixtures/' || true)"
pnpm --dir=plugin verify
pnpm --dir=plugin smoke:profile
node .github/scripts/check-doc-links.mjs
git diff --check
test -z "$(rg -n 'RUNBOOK-MEETING-RUNTIME-CUTOVER|Meeting Runtime 最小业务闭环切换' . --glob '!docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md' || true)"
```

关闭动作：上述命令全部退出 0 后，使用 `apply_patch` 删除本 RUNBOOK；不得用 `rm`，不得只删除 T30 section，也不得先提交 readiness。删除后验证：

```bash
test ! -e docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md
node .github/scripts/check-doc-links.mjs
git diff --check
git status --short
```

PASS：累计 plugin 删除总数精确为 30，分类精确为 1 个 repository facade + 13+6+1 个 application-side production + 9 个 tests，且 fixture 零删除；RUNBOOK 的最终文档删除不计入该业务代码清单；其余命令全部退出 0；引用检查无输出；默认 smoke 包含 identity-admission 和 meeting-business-loop；readiness 明确 DSH Storage Domain/repository core、retained projection pair 与其它 legacy 未删除；working tree 只包含 readiness 修改和本 RUNBOOK 删除，二者进入同一提交。

STOP：任一门禁失败或 readiness 夸大覆盖。

## 验证矩阵

| 边界 | 固定证明 |
| --- | --- |
| 正常路径 | contract `meeting-business-loop-v1` + real `meeting-business-loop` smoke |
| 非法输入 | protocol tests；未知字段被 strip，伪造 Runtime 字段不生效，非法已知字段拒绝且零写 |
| caller/authority | runtime、tool、Remote、view tests 覆盖 local/Manager/Contributor/reviewer/worker |
| terminal immutability | lifecycle unit + repository contract；普通 action 返回 `MEETING_TERMINAL` |
| stale version | repository contract 返回 `VERSION_CONFLICT`，state/fact/receipt/outbox 不变 |
| idempotency | same hash replay 同 receipt/无新 effect；different hash `IDEMPOTENCY_CONFLICT` |
| batch atomicity | review batch 任一非法时全部零写；合法子集一次 commit |
| transaction rollback | repository failure injection 无半 state/fact/receipt/outbox |
| restart/recovery | SQLite reopen、identity admission、archive close failure/retry |
| projection/privacy | Manager 无 Evidence 正文；Contributor 无未发布他人内容；archive 无禁入字段 |
| message limit | accept 时预留；超限拒绝；不得压缩；恰好耗尽的 converging/paused 分支 |
| candidate reuse | pair duplicate、global provisioning conflict、cross-Agenda active reuse、provenance mismatch |
| external runtime | exact DSH Loader/Storage/Session/tools/workers/close/reopen smoke |
| full product gate | `pnpm --dir=plugin verify` + default `pnpm --dir=plugin smoke:profile` |

Not Applicable：数据库 schema migration 和旧 snapshot compatibility 明确不做；外部网络 research 不是本闭环输入；Continuation、stress、metrics 和跨 Host 不作为完成门禁。

## 失败恢复

- T11-T12 repository 测试必须使用临时 Storage domain；失败不得手工改持久数据。
- T14b2、T14c、T15a、T15b、T15c、T16、T17 与 T22 创建、恢复、发送或关闭的 Session 必须由测试/smoke 的 `finally` 和原生 teardown 关闭；若 teardown 无法证明完成，保留临时 profile 路径和 Session ID 作为 STOP 证据，不删除不明归属 Session。
- archive cleanup 失败是业务可恢复状态：保留 `archiving`、ArchivePackage、outbox 和 ownership，不回滚 terminal/archive materialization，不创建替代 Session。
- 任一步失败都禁止 `git reset --hard`、覆盖用户改动、跳过测试或继续执行 deletion。

## 完成定义与 RUNBOOK 删除

仅在本文全部步骤都已 PASS、随对应代码提交从本文删除，且 T30 收口完成后，实施任务才完成。完成时必须同时成立：

1. real DSH 从 CreateMeeting 到 ReadArchive 闭环通过并可冷重启读取。
2. 1 个冗余 command repository facade、13 个 legacy application-service、6 个 legacy runtime application services、1 个 legacy read projection 和 9 个直接测试已删除，总删除数精确为 30；DSH Storage Domain adapter/repository core 保留，retained projection pair 与其余 legacy 文件不在目标入口的活动 import graph 中，并已登记后续清理范围。
3. target state、repository、runtime、tools/Remote/view/archive 使用同一数据和 command path。
4. readiness 已记录真实覆盖及 Non-goals。
5. 完整门禁与文档检查通过。

关闭本 RUNBOOK 时进入 `convivium-runbook` Close 模式：再次核对长期结论已在 requirements/interfaces/designs、验证事实已在 readiness；按 T30 排除本文件自身后确认没有引用；删除本文件；重新运行 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。任一关闭检查失败时立即运行 `git diff -- docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md | git apply -R`，只恢复本步骤尚未提交的 RUNBOOK 删除，然后 STOP；不得覆盖其它改动。RUNBOOK 不以 completed/archive 文件长期保留。

## Author Audit

- 结论：`Executable`；已确认 V1 只有一个 local Host/profile namespace，`meetingId` 是唯一 Meeting identity，目标协议、repository、Session ownership 与 recovery 均无 `teamId`。Luna + medium 不需要决定 team scope、兼容 namespace 或第二 repository。
- 已固定 create identity：wire 仍为 `meetingId="new"`，真实 ID 只由 `meetingIdFor(requestId)` 生成；唯一 local Convener 的 requestId 全局唯一，同 requestId 重放定位同一 receipt，不新增 creation-binding 表。
- 已固定 DSH 持久化边界：保留 Storage Domain、`DomainRepositoryRegistry`、`DomainMeetingRepository` 和唯一 `MeetingRepositoryPort`；已删除的是冗余 command repository facade，不是 Storage Domain adapter。
- 已固定 ArchivePackage、Session closure、review worker 与 recovery：Archive 字段/顺序、one-shot `start → result → finally dispose`、同一 outbox worker recovery 和未知 ownership fail closed 均有唯一动作。
- 已固定 effect route 闭包：T13b 产生初始 `meeting_started`，`identity_provision` 由 T15a-T15b 处理，普通 `agent_notice` 由 T15c 处理，`review_request` 与 `review_delivery` 由 T16 处理，`archive` 由 T17 处理；T20 只装配这四类 payload route，不留给执行者选择 dispatcher。
- 已按 8 文件上限收敛步骤：T11 在同一 repository transaction 边界完成 generic codec 与 facts/ownership closure；T20 在同一外部暴露边界完成 Remote 与 plugin target assembly；read DTO Schema 与 projection 保持分为 T18a/T18b，label/provisioning 与 caller/session adapter 保持分为 T14b/T14b2，因为各自合并都会超过 8 个文件。T15a 覆盖三个直接 identity suite，T26 同步清理 legacy-only application types。每步文件数不超过 8。
- 已固定执行提交规则：每个步骤必须产生其要求的 production/test 行为 diff，代码、测试与该步骤删除同一提交；禁止 RUNBOOK-only commit，禁止把既有绿色测试当作完成证据，禁止未经另行授权 push 或改写历史。
- 已固定删除边界：累计 30 个 plugin 文件，精确为 1 个冗余 repository facade、20 个 application-side production 文件和 9 个直接测试；不拆 retained projection pair，不删除 DSH Storage Domain adapter、repository core 或 fixture。
- 本轮只修改正式文档与 RUNBOOK，没有执行任何未完成代码步骤、`pnpm verify` 或 smoke；这些验证只能由对应步骤和 T30 形成完成证据。Author 文档门禁为 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。
