# RUNBOOK：Meeting Runtime 最小业务闭环切换

## 状态

- 审计结论：`Executable`
- 建立日期：2026-09-17
- 执行分支：`codex/runbook-meeting-runtime-cutover`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 起始提交：`f170deb`
- 目标：用目标 `MeetingState` 完成一条可创建、公开证据、批量审核、发布、结束、归档和读取的真实业务链，并只删除被该链替代的 legacy application orchestration/read-side 实现。

## 执行者契约

执行者必须从本文仍存在的第一个步骤开始按顺序执行；已从本文删除的步骤视为已有提交证据，不得重复执行。每个步骤只有在该步骤 PASS 后才能进入下一步。允许修改的业务文件只限各步骤明确列出的路径；每一步都额外隐含允许修改本 RUNBOOK，但唯一允许的改动是该步 PASS 后删除当前完整 step section，且该文件不计入“每步不超过 6 个文件”。步骤中的“禁止修改其他全部文件”不禁止这项强制 step 删除。不得保留双写、target compatibility read、旧 snapshot migration、legacy facade、转发文件、第二套 repository、第二套 command dispatcher 或未被当前范围要求的通用抽象；为使明确保留的 legacy 文件在删除前编译而保留的旧字段/exports，必须被逐项标为 legacy-only、不得进入 target activity graph，并迁移到 readiness 未覆盖项。

T8-T21c 中除 T14a 资源步骤外的实现步骤必须对该步列出的 production symbol 形成真实代码 diff；T14a 必须形成发布资源与验证脚本 diff；T22 是 smoke/entrypoint 验证步骤，T23-T29 是删除步骤，T30 是 readiness/关闭步骤，三者不要求 production diff。所有行为实现步骤都先写或修改该步列出的测试，使新增行为出现可解释的失败，再修改 production code 使 focused validation 通过；已有测试为绿、只增加测试、只删除 RUNBOOK 步骤或只改文档都不能证明实现步骤完成。若 Author/Audit 时发现某步行为已经完整存在，应由 Author 删除该步并记录既有证据，不得留给 executor 产生 RUNBOOK-only commit。删除步骤不改写旧 fixture；本轮删除文件总数固定为 29 个，只包含 20 个 legacy application orchestration/read-side production 文件及其 9 个直接测试，低于用户允许的 30 文件上限。用户已有且不属于本 RUNBOOK 的改动不得覆盖或回滚。

每步的提交节奏固定为：完成 production/test 改动并通过该步验证 → 删除本文中该完整步骤 → 将代码、测试和该步骤删除放进同一个提交。禁止单独提交 RUNBOOK 步骤删除，禁止用空改动或既有绿色测试代替实现。除非用户另行明确要求，不得 push、force-push、rebase、amend 或改写已 push 的提交。删除步骤的计数在提交前只检查当前 working-tree 删除；全程累计删除只在 T30 对固定起始提交 `f170deb` 检查。

`PASS` 表示命令退出码为 0 且该步列出的可观察断言全部成立。`STOP` 表示立即停止，不执行后续步骤；报告最后一个 PASS 步骤、触发条件、文件与 symbol、最小复现命令和实际输出。STOP 后不得放宽 Schema、lint、类型或测试，不得新增兼容层，不得自行扩大 Scope。

以下任一事实与执行时 checkout 不一致时必须 STOP：本文指定的既有路径或 symbol 不存在；正式文档改变了本文固定的字段、错误码、actor、lifecycle 或归档语义；下述可执行 baseline 失败；实现必须引入新依赖、数据库 migration、外部权限或 Non-goal；DSH 精确版本不再是 `0.1.2-rc.1`。

首次执行且尚未删除 T8 时，只运行一次以下 baseline；不得在后续步骤重复运行来替代 focused validation：

```bash
test "$(git branch --show-current)" = "codex/runbook-meeting-runtime-cutover"
test -z "$(git status --porcelain)"
test "$(node -p "require('./plugin/node_modules/@deepseek-ai/dsh-subagent/package.json').version")" = "0.1.2-rc.1"
pnpm --dir=plugin verify
pnpm --dir=plugin smoke:profile
```

Baseline PASS：五条命令全部退出 0；完整插件门禁通过，默认 smoke 的既有 `parallel-contribution` 与 `identity-admission` scenario 成功。Baseline STOP：任一命令失败时报告命令和输出，不修改文件、不删除 T8、不自行修复或放宽门禁。

## 目标业务链

```text
local CreateMeeting
  -> running MeetingState + 8 个独立 meeting-owned Session
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
| `MeetingState` 是新业务链唯一聚合 | `plugin/src/runtime/meeting-runtime.ts`、repository projection 和外围入口仍使用 `LegacyMeetingState` | T8-T21 将活动调用链直接切换；T23-T29 删除旧 application orchestration/read-side |
| 创建使用 `identityKey`，每场会议唯一 Manager 和 reviewer | canonical identity 已完成，外围创建仍按 participantKey/旧 role 建模，尚未创建八个 target child Session | T14b-T14c |
| reviewer 单一、按 EvidenceVersion 独立审核、批量提交 | 纯 Domain batch 已完成，DSH reviewer coordinator 与独立 worker 尚未接入 | T16 |
| 归档是按值白名单，Session 全部关闭后才 archived | canonical ArchivePackage 与 Domain lifecycle 已完成，runtime cleanup/outbox/recovery 尚未接入 | T17 |
| 同一 candidate 跨 Agenda 复用一个 active identity/Session | 纯 Domain active reuse 已完成，identity effect handler 与 recovery 尚未统一到 target command path | T15a-T15b |
| Scribe 已删除，发布包为 8 个角色 | `plugin/meeting-roles/` 和验证脚本仍含 `meeting_scribe` | T14a |
| target protocol 只覆盖 identity/read/end/archive | 完整 round/evidence/review action 尚未进入 `MeetingCommandV1Schema` | T8-T9 |
| target repository/application/projection 必须可真实运行 | repository core、command application 和 projection 尚未接通 target atomic commit | T11-T21 |

代码事实以 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为当前覆盖依据；不得把存在的旧源码或历史测试算作目标实现证据。

## Scope

1. 将目标聚合修正到已确认的数据结构：删除 FormatApproval 与 reviewer 双向数组；增加唯一 `evidenceReviewerId`、Round abort、Contribution aborted、完整按值 archive。
2. 完成目标纯 Domain 的创建、开轮、举手/接纳、Evidence 登记、Review batch、发布、结束、归档转换及 candidate 跨 Agenda active 复用。
3. 将同一 `MeetingCommandV1`、repository atomic commit、receipt、outbox 和 recovery 用于整条链。
4. 通过真实 caller/session ownership 验证 local、Manager、Contributor、reviewer 和受控 runtime action。
5. reviewer coordinator 可对一个 batch 中的多个 EvidenceVersion 启动彼此不共享 Session 的 DSH worker；worker 结果只由 coordinator 批量提交。
6. 提供 caller-filtered Meeting view、待审集合、Meeting list/detail、Archive read，以及完成该链所需的 DSH tools 和 loopback Remote action。
7. Archive 固化后关闭全部 meeting-owned Session；任一关闭失败保持 `archiving` 并可恢复重试。
8. 删除 Scribe；删除清单固定为 13 个 legacy application-service、6 个 legacy runtime application services、1 个 legacy read projection 和 9 个直接测试，总数 29。`projection/status.ts` 仍依赖的 `projection/contribution.ts` 成对保留但不从目标入口导出，避免为追求第 30 个删除而制造断链。
9. 增加 unit、contract、integration、recovery 和真实 DSH smoke 证据，并更新 readiness。

## Non-goals

- 不实现 ContinuationMaterial 导入或续会；删除旧 `continuation-selection` application service 后，将旧 Domain/protocol 和目标续会保持为 readiness 未覆盖项。
- 不把 Pause/Resume、Agenda candidate、Proposal、Position、Decision、RiskDisposition、CompletionFact、Question/Issue、PrivateMail、MeetingTask、补充证据或机会申请接到外围入口；现有 target pure Domain 文件保留，并在 readiness 中继续标为外围未覆盖。
- 不重设计 Browser UI。现有面板只缩减为 Meeting list/detail/archive 和本链 local controls；不增加视觉系统。
- 不实现自动 evidence freshness、source-scope 去重、跨 Host、Web 用户/Team authority、remote listen、metrics、stress、数据库迁移或旧数据读取。
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

T8 必须让 `MeetingCommandV1Schema` 精确识别：`create_meeting`、`open_round`、`raise_hand`、`dispose_hand_raise`、`submit_evidence`、`submit_review_batch`、`publish_round`、`end_meeting`、`start_archive`、`record_archive_session_result`，并保留 `recommend_identity`、`record_identity_admission_result`。`ListMeetingsRequestV1Schema` 与 `ReadMeetingRequestV1Schema` 是不产生 receipt/version 的独立 read request Schema，不进入 write action union；Archive 只经 `ReadMeeting` 的 `archive` 字段读取，不建立 `read_archive` action。create command 固定 `meetingId="new"`、`expectedMeetingVersion=0`；其他 write command 使用真实 meetingId 和正整数 expected version。按 Meeting Interface 的 wire convention，object Schema 忽略并 strip 未知字段；caller 即使提交 actorId、生成 ID、now、baselinePublicationIds、terminationId、archiveId、reviewerId、Session/ownership 或 effect 字段，它们也不得进入 normalized action、request hash、Domain 或持久化结果。

Runtime 生成来源固定如下：

| 值 | 唯一来源 |
| --- | --- |
| actor/caller | verified DSH Session ownership；local action 使用 loopback local binding；system action 使用 runtime channel |
| object/fact/receipt/outbox ID | 注入的 `ids.nextId(kind)` |
| `now` | 注入的 `clock.now()`，每个 command 只读取一次 |
| state version | 成功 commit 的 `snapshot.version + 1`；拒绝和 replay 不增加 |
| request hash | `serializeValidatedRequestV1` 对 Schema strip 后的已知 command action 的 canonical serialization |
| Round baseline | command commit 时当前全部 Publication ID，caller 不能提供 |
| Evidence baseline | 复制所属 Round 固定 baseline |
| reviewer | `state.evidenceReviewerId`，不能由 Agenda、Issue 或请求选择 |

actor 固定为：create/end/list/read 是可信 loopback local；start archive 与 record admission/archive session result 是 runtime recovery/effect dispatcher；open/dispose/publish 是当前 Manager Session；raise/submit evidence 是目标 Contribution 的 Contributor Session；submit review batch 是唯一 reviewer coordinator Session。

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

以下步骤按单一语义边界拆分；每步允许修改或删除的 production、test、fixture 和 script 文件合计不超过 6 个。不得借测试调整扩展 production 范围。

### T10c：删除 target repository adapter

前置状态：T10b PASS，production 已无 `MeetingCommandRepositoryPortV1` 或 `adaptMeetingRepositoryV1` 调用方。

允许修改：删除 `plugin/src/repository/meeting-command-repository-v1.ts`；修改 `plugin/tests/contract/meeting-identity-command-v1.spec.ts`。

禁止修改：其它 repository、runtime、Domain 或测试文件。

执行：把 identity command contract test 的 repository double 精确类型化为 `MeetingRepositoryPort<MeetingState>`，不增加 cast helper或兼容 alias；删除无 production caller 的 `meeting-command-repository-v1.ts`，不得保留转发文件。使用 `rg` 确认源码、测试和 RUNBOOK 不再引用 `MeetingCommandRepositoryPortV1`、`adaptMeetingRepositoryV1` 或删除路径。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-identity-command-v1.spec.ts
pnpm --dir=plugin typecheck:host
test -z "$(rg -l 'MeetingCommandRepositoryPortV1|adaptMeetingRepositoryV1|meeting-command-repository-v1' plugin/src plugin/tests docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md)"
```

PASS：identity command contract 通过，Host typecheck 通过，旧 interface、adapter 和路径零引用且文件已删除。

STOP：仍有 production caller，或删除要求兼容 alias、转发文件或修改其它文件。

### T11：实现 repository atomic command commit

前置状态：T10c PASS。

允许修改：`plugin/src/repository/types.ts`、`plugin/src/repository/meeting-repository-port.ts`、`plugin/src/repository/domain/schemas.ts`、`plugin/src/repository/domain/projection.ts`、`plugin/src/repository/domain/domain-meeting-repository.ts`、`plugin/tests/contract/domain-meeting-repository-facts.spec.ts`。

禁止修改：repository core/registry/recovery、runtime、legacy application tests。

执行：让同一 `DomainMeetingRepository<TState>` 实现 T10b 的唯一 generic port；target 构造只注入 T8 `encodeMeetingStateV1/decodeMeetingStateV1` 并得到 `DomainMeetingRepository<MeetingState>`，legacy tests 的默认构造继续使用既有 JsonObject codec，不得在一次 repository instance 中切换 codec。codec 只在 repository 的 `read/recover/execute` 边界编解码 state；持久 projection 仍保存 canonical JsonObject，不把 `MeetingState|LegacyMeetingState` union 放入 port 或 persistence Schema。

在 `types.ts` 定义与 Meeting Interface 同构的 `CommittedFactRecordV1`，在唯一 `MeetingRepositoryPort` 增加 `readCommittedFacts(): Promise<readonly CommittedFactRecordV1[]>`；在 `RepositoryCommand<TResult,TState>` 增加 optional `facts:readonly CommittedFactRecordV1[]` 和唯一 optional 内部字段 `archiveSessionResult?: {sessionOwnershipId:string; status:"closed"|"failed"; failureCode?:string}`。legacy command 不提供这两个字段；target dispatcher 必须提供 facts。`archiveSessionResult` 仅 `commandKind="record_archive_session_result"` 可携带，`closed` 禁止 failureCode，`failed` 必须带 trim 后非空 failureCode；该字段不进入公开 action hash。

`PersistenceProjectionV1` 增加独立 `facts` map，由 `createProjection` 初始化为空；不得把 target fact 写进 legacy `events` map。transaction 内验证 next version 并原子写 state/facts/receipt/outbox；`readCommittedFacts` 只按 meetingVersion、再按 factId 返回本 Meeting 已提交 target facts，不能返回 receipt/outbox/legacy event；拒绝不入 repository；实现 replay/conflict/rollback。若 `RepositoryCommand.archiveSessionResult` 存在，先在同一 transaction 内验证 ownership 的 `id`、`meetingId`、`identityId` 和未关闭状态，再与 command state/facts/receipt/outbox 一起写入：任一 target identity 字段缺失返回 `RECOVERY_UNAVAILABLE` 且零写；`failed` 保持原 lifecycle/capability 并写 failure code，`closed` 写 `lifecycleStatus="closed"`、`capabilityStatus="revoked"` 并清除 failure code；任何 ownership 或 command 写失败都整笔回滚。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/domain-meeting-repository.spec.ts tests/contract/domain-meeting-repository-facts.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：success/replay/conflict/rollback 无半提交；archive closure 的 ownership/state/fact/receipt 同成同败。

STOP：需要 noop receipt、双写或新 storage abstraction。

### T12：实现 repository recovery 与 ownership closure

前置状态：T11 PASS。

允许修改：`plugin/src/repository/domain/domain-repository-registry.ts`、`plugin/src/repository/diagnostics.ts`、`plugin/src/repository/domain/projection.ts`、`plugin/tests/fixtures/domain-storage.ts`、`plugin/tests/recovery/domain-recovery.spec.ts`、`plugin/tests/recovery/sqlite-meeting-recovery.spec.ts`。

禁止修改：Runtime、legacy storage migration。

执行：reopen 只解 target snapshot；旧 snapshot fail closed；target snapshot 的任一 meeting-owned ownership 缺 `id/meetingId/identityId` 或 meetingId 不匹配时返回 `RECOVERY_UNAVAILABLE`。恢复 T11 已原子保存的 Session closure proof，返回每个 ownership 的 failure code 和是否仍未关闭；不得在 registry/projection 中再次写 ownership 或直接改变 Meeting lifecycle。最后一个 closed result 进入 archived 只由 T13 dispatcher 在 T11 的同一 command transaction 内调用 Domain transition 完成。

验证：
```bash
pnpm --dir=plugin vitest run tests/recovery/domain-recovery.spec.ts tests/recovery/sqlite-meeting-recovery.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：reopen、closure retry、旧 snapshot 拒绝通过；恢复结果能机械判断是否仍有未关闭 ownership，且不产生第二次写入。

STOP：需要迁移旧 snapshot 或操作不明归属 Session。

### T13：建立唯一 application command dispatcher

前置状态：T12 PASS。

允许修改：`plugin/src/runtime/application-service/meeting-command-v1.ts`、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/meeting-runtime.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`。

禁止修改：identity provisioning、roles、Remote/tools、旧 application 文件。

执行：用下列唯一入口替换当前只透传 repository 的 shim，不保留 action-specific application facade：

```ts
interface MeetingCommandApplicationV1 {
    execute(command: MeetingCommandV1, context: MeetingCommandExecutionContextV1, signal: AbortSignal): Promise<MeetingCommandResultV1>;
}
interface MeetingCommandExecutionContextV1 {
    caller: CallerBindingV1;
    archiveEffect?: { effectId:OpaqueId; archiveId:OpaqueId };
}
function createMeetingCommandApplicationV1(dependencies: MeetingCommandApplicationDependenciesV1): MeetingCommandApplicationV1;
```

`MeetingCommandApplicationDependenciesV1` required 为 `repository:MeetingRepositoryPort<MeetingState>`、`ids`、`clock`、`resolveCallerScope`；`catalog/definitions` 仅供 identity action，不能形成第二 dispatcher。`resolveCallerScope` 必须消费 T10a target caller fields，不读 participantId。`execute` 先以 T8 Schema 得到 stripped command，再 resolve caller，按固定错误顺序处理 idempotency 和 lifecycle，只在纯 transition accepted 后构造一个 `RepositoryCommand<MeetingCommandResultV1,MeetingState>`。`start_archive` 必须同时具有 `caller.channel="runtime_recovery"` 和 `archiveEffect`，其它组合返回 `UNAUTHORIZED`；tool/Remote 不得构造它。每个 command 只调用一次 `clock.now()`；所有 object/fact/receipt/outbox ID 只调用注入的 `ids.nextId(kind)`。

处理 `end_meeting` 时由 application 额外生成唯一 archiveId 和 archive outbox record `{kind:"archive",payload:{kind:"archive",archiveId,meetingId}}`；Domain 仍只产生 `materialize_archive` intent。处理 `start_archive` 时使用 `context.archiveEffect.archiveId`，先调用 `readCommittedFacts()`，只映射 `resolve_question/question_disposition` 与 `dispose_issue/issue_disposition` 为 `startMeetingArchiveV1` 输入并按 `occurredAt/factId` 排序；其它 action 不读取 facts，requestId 由 T17 固定。处理 `record_archive_session_result` 时先读取指定 ownership，验证其 `meetingId`、runtime_recovery channel 和未关闭状态，把规范化 closure 写入 `RepositoryCommand.archiveSessionResult`；计算本次 closed 后没有其它未关闭 ownership时，才在同一 command transition 调用 `completeMeetingArchiveV1(...allSessionOwnershipClosed:true)`。`application-service/types.ts` 只保留上述 dependency/context/result 类型，移除 Developer Markdown 与旧 application option 引用。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-runtime.spec.ts tests/unit/runtime/meeting-runtime.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：业务链 actions、authority、version/idempotency 和零写拒绝通过。

STOP：需要第二 dispatcher 或调用旧 application service。

### T14a：收敛八角色发布资源

前置状态：T13 PASS。

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

### T14b：建立 target child Session adapter

前置状态：T14a PASS。

允许修改：`plugin/src/dsh/labels.ts`、`plugin/src/dsh/provisioning.ts`、`plugin/src/dsh/session-adapter.ts`、`plugin/src/dsh/index.ts`、`plugin/tests/unit/dsh/labels.spec.ts`、`plugin/tests/unit/dsh/session-adapter.spec.ts`。

禁止修改：runtime/plugin lifecycle、identity recommendation、review workers、Remote/UI、role resources。

执行：新增 target `MeetingIdentitySessionLabelV1`，required `{role:"manager"|"evidence_reviewer"|"participant";teamId;meetingId;identityId}`，编码固定为 `convivium:meeting-identity:<role>:<teamId>:<meetingId>:<identityId>`，decoder 对段数、枚举和 identity segment fail closed，不从 target label 使用 participantId。`provisioning.ts` 新增同结构的 `createMeetingIdentityProvisioningEnvelopeV1/serializeMeetingIdentityProvisioningEnvelopeV1`，Target envelope 不含 participantId，旧 envelope 函数只为未删除 legacy consumer 保留且 target 不调用。新增唯一 target `startMeetingIdentitySessionV1(input)`，input 在现有 runtime/provider/parent/child/team/meeting/signal/composition 外 required `role` 与 `identityId`；其 target provisioning envelope 和 returned childId 必须与 input 精确匹配。为使本轮明确保留且尚未删除的 legacy recovery/tests 编译，`startManagerSession/startParticipantSession` 与旧 label decoder 暂时保留，但 T14c 后的活动入口禁止引用，并在 readiness 登记后续随 legacy runtime 删除；不得让 target 函数调用旧函数。one-shot reviewer workers 不使用此 adapter。测试只新增 target 三种 role、跨 Meeting/identity label mismatch、childId mismatch、envelope 和 composition clone，不改旧 adapter 断言。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/dsh/labels.spec.ts tests/unit/dsh/session-adapter.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：三种 target meeting identity child 使用同一精确 label/adapter；Reviewer 不是普通 participant label；T14c 可只引用 target export，旧 export 仅为未删除 legacy consumer 保留。

STOP：需要第二套 label/adapter、共享 child Session 或修改 DSH provider 语义。

### T14c：接入创建与 plugin lifecycle

前置状态：T14b PASS。

允许修改：`plugin/src/runtime/meeting-runtime.ts`、`plugin/src/index.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`。

禁止修改：identity recommendation、review workers、Remote/UI、role resources、Session adapter。

执行：`plugin/src/index.ts` 的 lifecycle 只在 DSH version 精确为 `0.1.2-rc.1`、Storage/continuable provider 和八个 Definition 全部预检成功后构造 T13 application、outbox worker、tools 与 Remote；任一失败进入 rejected 且不注册 write。`meeting-runtime.ts` 的 create 路径先按 identityKey 校验并分配 canonical identity ID，再通过 T14b 创建恰好八个 child：一个 Manager、一个 Evidence Reviewer、六个 Contributor；每个成功 child 立即记录带 `id/meetingId/identityId` 的 ownership，role 分别为 `manager/evidence_reviewer/participant`，且不写 legacy participantId。Captain parent 不进入 ownership。任一 preflight/session/ownership/commit 失败，按 creation_failed → revoke 已登记 capability → interrupt/drain 已证明 child 的顺序清理，不能发布半可用 Meeting。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：八个 child、创建原子性、target ownership、清理和精确版本 lifecycle 门禁通过。

STOP：需要 persona-only、放宽 DSH 版本、写 legacy participantId 或发布半可用 Meeting。

### T15a：接入 identity provisioning effect

前置状态：T14c PASS。

允许修改：`plugin/src/runtime/application-service/meeting-identity-v1.ts`、`plugin/src/runtime/services/meeting-identity-provision-v1.ts`、`plugin/src/dsh/meeting-identity-admission-v1.ts`、`plugin/tests/contract/meeting-identity-command-v1.spec.ts`。

禁止修改：command recovery、ownership、Catalog producer、review/archive services、Remote。

执行：T13 已处理 `recommend_identity` command 和 active reuse；本步不得再建立 action dispatcher。把 `meeting-identity-v1.ts` 收敛为只导出 `createMeetingIdentityEffectHandlerV1(dependencies).dispatch(outboxItem,signal)`：只接受 `identity_provision` effect，从已提交 recommendation 读取固定 `recommendationId=admissionId`、definition id/version/hash、预留 identityId/childSessionId；依次调用 T14b 已验证的 Definition resolver、preflight 和 `meeting-identity-provision-v1.ts`。provisioner 只调用 T14b `startMeetingIdentitySessionV1(role="participant",identityId=预留 identityId)`，成功 ownership 必须写 `id/meetingId/identityId` 且不写 participantId。成功或安全失败都只通过 T13 `execute` 提交一个 `record_identity_admission_result`，caller channel=`runtime_recovery`，requestId 固定 `identity-admission:${outboxItem.id}`；不得直接 repository commit。`meeting-identity-admission-v1.ts` 只负责 DSH admit/ownership，等 payload replay 返回同 ownership；失败前新建 child 必须 revoke/drain。active reuse 没有 `identity_provision` effect，本 handler 不会收到它。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/meeting-identity-command-v1.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：首次 provisioning、effect/request replay 和成功/失败 admission 通过；跨 Agenda reuse 零 effect，所有 Meeting 写入都经过 T13。

STOP：reuse 创建第二 Session 或 application 绕过唯一 dispatcher。

### T15b：接入 identity recovery

前置状态：T15a PASS。

允许修改：`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/src/dsh/session-ownership.ts`、`plugin/tests/recovery/meeting-identity-v1.spec.ts`。

禁止修改：identity application/provisioner、review/archive services、Remote。

执行：recovery 只扫描仍为 provisioning 且有 pending `identity_provision` effect 的 intent，并调用 T15a 同一 handler；只继续固化 admissionId/Definition/descriptor，uncertain ownership fail closed，不创建替代 child，也不直接 repository commit。

验证：
```bash
pnpm --dir=plugin vitest run tests/recovery/meeting-identity-v1.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：provisioning replay、成功/失败 recovery 和 active identity 恢复通过。

STOP：recovery 使用当前 Definition 替代固化 provenance。

### T16：接入 reviewer workers

前置状态：T15b PASS。

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

`ReviewerPendingEvidenceV1` required 为 `{version:EvidenceVersionV1; baseline:readonly {publicationId:OpaqueId; evidence:readonly {version:EvidenceVersionV1; review:EvidenceReviewV1}[]}[]}`；baseline 按所属 Round 的 `baselinePublicationIds` 顺序，每个 publication 内按 `finalVersionIds/finalReviewIds` 同序按值组装，不能只给 ID 或当前 state 引用。dependencies required 为 `subagents:Pick<SubagentRuntime,"start">`、`provider:string`、`application:MeetingCommandApplicationV1`、`repository:Pick<MeetingRepositoryPort<MeetingState>,"read">`。处理 `review_request` 时重读 target snapshot，验证 coordinatorOwnership 的 meetingId/identityId/session/active capability 与 `state.evidenceReviewerId` 精确匹配，再从 state 中选择 current + complete Registration + 无最终 Review 的 version，按 EvidencePackage/state 顺序构造 pending set；不得依赖尚未实施的 T18 projection。空集合直接把 outbox item 视为 delivered。非空集合对每个 version 恰好调用一次 `subagents.start(provider,{parent:coordinator,...})`，prompt 只含该 immutable version、上述 immutable baseline 和固定 Review 输出 Schema `{scope:string;dimensions:{source:ReviewDimensionInput;credibility:ReviewDimensionInput;completeness:ReviewDimensionInput;support:ReviewDimensionInput}}`；每个 dimension 精确为 `{score:0|1|2|3|"unable_to_assess";scope:string;reason:string;baselineEvidenceIds:OpaqueId[]}`，baselineEvidenceIds 只能来自该 worker baseline 的 version ID。使用 `Promise.allSettled` 并发等待，且每个已发布 run 都在 `finally` 调用 `dispose()`。worker 不是 continuable Meeting child，不写 `SessionOwnership`，不获得 Meeting tool。

只收集 `stopReason="completed"` 且 structured output 通过 Review item Schema 的结果；失败/取消/非法输出项省略并继续 pending。成功集合非空时只调用一次 `application.execute`，action 为一个 `submit_review_batch`，requestId 固定为 `review-batch:${outboxItem.id}`，caller 固定为 coordinator 的 reviewer binding；成功集合为空时令该 outbox item retry。`outbox-worker.ts` 只把 `review_request` 路由到该 dispatcher，不自行启动 worker 或提交 command。

验证：
```bash
test -f plugin/src/runtime/services/evidence-review-dispatch-v1.ts
test -f plugin/tests/unit/runtime/evidence-review-dispatch-v1.spec.ts
test -f plugin/tests/integration/dsh/evidence-review-dispatch-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/evidence-review-dispatch-v1.spec.ts tests/integration/dsh/evidence-review-dispatch-v1.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：至少两个不同 worker Session 并发、一次 batch、worker 无 Meeting authority。

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

dependencies required 为 `{repository; sessions:Pick<SubagentRuntime,"listChildren"|"interrupt"|"drainContinuableChildren">; application:MeetingCommandApplicationV1}`。`dispatch` 先 recover committed snapshot：若 lifecycle=terminal，提交一次 `start_archive`，requestId 固定为 `archive-start:${outboxItem.id}`，context 使用 runtime_recovery caller 和 `{effectId:outboxItem.id,archiveId:outboxItem.payload.archiveId}`；accepted/replay 后重读。若已 archiving，要求 `archive.id===outboxItem.payload.archiveId` 且 archive.status=complete；若已 archived 且 ID 相同，直接 delivered；其它状态或 ID mismatch 返回 `RECOVERY_UNAVAILABLE`。随后以 repository 中 `meetingId` 匹配且未 supersede 的 ownership 为唯一 cleanup 目标；目标必须恰好一个 manager、一个 evidence_reviewer，并包含创建时六个 participant 及 T15 后续已激活的 participant。每个 identityId 都存在于 archived identity provenance，每个 active identity 恰有一个 ownership，parentSessionId 全部等于 `parent.id`，DSH durable direct-child listing 的 id/label 与 ownership 一致。缺失、额外、重复或不明归属立即返回 `RECOVERY_UNAVAILABLE`，不得操作任何 Session。

对每个未 closed ownership，先 interrupt，再只 drain 该 child；每次提交 result 前重读 snapshot，用当时 version 作为 expectedMeetingVersion，成功后再处理下一 ownership，不并发 closure command。成功后调用一次 `application.execute` 提交 `record_archive_session_result(status="closed")`，失败则提交一次 `status="failed",failureReason="SESSION_CLOSE_FAILED"`，不得保存原始异常文本。requestId 固定为 `archive:${archive.id}:${ownership.id}:${outboxItem.attempts}:${status}`；command commit 不确定时先 recover，已 closed 则跳过，已记录同一 failure 则进入下一 outbox attempt，不产生重复 fact。任一 failed 令 outbox retry且 Meeting 保持 archiving；全部 ownership closed 后最后一个 command 在同一 repository transaction 进入 archived。`outbox-worker.ts` 只路由 archive effect；recovery service 只调用 repository recovery 重新领取 pending archive outbox 并 wake 同一个 outbox worker，不复制关闭算法。

验证：
```bash
test -f plugin/src/runtime/services/meeting-archive-v1.ts
test -f plugin/tests/unit/runtime/meeting-archive-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/meeting-archive-v1.spec.ts tests/recovery/contribution-recovery.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：close failure/restart/retry 后 archived；无重复或不明归属 Session。

STOP：需要回滚 archive package 或创建替代 Session。

### T18：实现 caller-filtered projection

前置状态：T17 PASS。

允许修改：`plugin/src/projection/meeting-view-v1.ts`、`plugin/src/projection/index.ts`、`plugin/tests/contract/meeting-identity-view-v1.spec.ts`。

禁止修改：legacy projection、tools/Remote/Client。

执行：删除当前把完整 state 放进 view 的 `{meetingId,meetingVersion,state}` shape，新增唯一 caller context 和三个 mapper：

```ts
type MeetingProjectionCallerV1 =
    | { kind:"local" }
    | { kind:"identity"; identityId:OpaqueId; roles:readonly MeetingRole[] };
function projectMeetingSummaryV1(snapshot:MeetingSnapshot): MeetingSummaryV1;
function projectMeetingViewV1(snapshot:MeetingSnapshot, caller:MeetingProjectionCallerV1, managerCatalog?:MeetingAgentCatalogV1): MeetingViewV1;
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

### T19：接入 DSH tools

前置状态：T18 PASS。

允许修改：`plugin/src/tools/register-tools.ts`、`plugin/src/tools/index.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/src/runtime/index.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/unit/module-boundaries.spec.ts`。

禁止修改：Remote、Client、旧 application 文件。

执行：只登记七个 agent tools：`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`（Manager），`convivium_raise_hand`、`convivium_submit_evidence`（Contributor），`convivium_submit_review_batch`（唯一 reviewer coordinator），`convivium_recommend_identity`（Manager）。每个 tool 的 parameter Schema 直接复用 T8 对应 action Schema，只补 `protocolVersion/meetingId/expectedMeetingVersion/requestId` envelope；tool 不接受 actor/session/generated ID，resolve caller 后只调用 T13 `MeetingCommandApplicationV1.execute`。删除其它 legacy tool registration，不把 local-only create/end 或 runtime-only start/result action 注册成 tool。

`application-service/index.ts` 只暴露 `createMeetingCommandApplicationV1`、`MeetingCommandApplicationV1` 和 T15 target effect handler；`runtime/index.ts` 只暴露前述 application、T15-T17 target services、target `openMeetingRepository`，以及供既有 `tests/fixtures/remote-gateway.ts` 不改动使用的 target `LocalMeetingWebRuntime` type（精确为 T20 的 `list/read/control/subscribeRefresh` dependency，不保留旧 methods）。两 barrel 不再导入或导出旧 application constructors、contribution/dispatch/session/developer-markdown services；module boundary test 固定该活动 import graph，并允许旧文件在 T23-T29 前暂时不可达地存在。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/tool-registration.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：tool authority/Schema/dispatcher 通过；活动 runtime barrel 无旧 constructor export。

STOP：tool 需要直接调用旧 application 或提交 actor。

### T20：接入 loopback Remote

前置状态：T19 PASS。

允许修改：`plugin/src/remote/types.ts`、`plugin/src/remote/index.ts`、`plugin/tests/contract/remote-boundary.spec.ts`、`plugin/tests/contract/remote-generation.spec.ts`。

禁止修改：Client、Domain、repository。

执行：Remote service 精确只暴露 Meeting Interface 的 `list()`、`read(request)`、`control(command)`、`subscribeRefresh()`，四者均验证 loopback binding；不暴露 action-specific Remote method，不转发 agent tool action。`list` 调 T18 summary mapper；`read` 调 T18 caller=`local` mapper并由同一结果读取 archive；`control` 只允许 `create_meeting|end_meeting`，`start_archive` 由 durable archive effect 自动执行，其它 action 返回 `UNAUTHORIZED`，允许的 write 只调用 T13 `MeetingCommandApplicationV1.execute`；`subscribeRefresh` 只发 `{kind:"refresh",meetingId,committedVersion}`，不携带事实。`types.ts` 定义这四个 method 的精确 request/result 与 `ClientRemote` augmentation，`index.ts` 只注册该 service。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/remote-boundary.spec.ts tests/contract/remote-generation.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：loopback authority、伪造 actor、read/write DTO 和 error mapping 通过。

STOP：需要 Web user/Team authority 或 Remote 复制 Domain 规则。

### T21a：接入 Client transport

前置状态：T20 PASS。

允许修改：`plugin/src/client/meeting-client.ts`、`plugin/tests/client/meeting-client.client.spec.ts`。

禁止修改：panel、CSS/视觉系统、business semantics、Remote。

执行：用 T20 四方法替换现有 action-specific client。`MeetingClient` 精确暴露 `list(signal?)`、`read(request,signal?)`、`control(command,signal?)`、`subscribeRefresh(onUnavailable)`；`list/read/control` 分别验证 T8/T18 的 result Schema，Remote error 映射为 Meeting Interface error，不把协议拒绝改成异常领域结果。`control` 不自动 retry；accepted 或 rejected 后调用方均可显式 `read`，Client 自身不缓存、不计算 Domain state。archive 不设第二 endpoint，只从 `read(...).archive` 取得。

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

执行：layout/sections/view 只消费 T18 `MeetingSummaryV1/MeetingViewV1/ArchiveView`，展示 Meeting list、选中 detail、Round/Contribution 状态、已获准可见的 Evidence/Review、FormalMessage、Termination 与 Archive；删除 legacy proposal/risk/contribution-control DTO 分支和 Client 侧事实拼装。所有显示字段直接来自 projection，缺席字段显示为空态而不推断。新测试只使用新增 `meeting-panel-v1-fixtures.ts`，既有 `meeting-panel-fixtures.ts` 不修改、不删除。

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

执行：新增 core scenario，真实完成目标链并验证八 roles、隔离 workers、batch、publish、partial、archive、close、cold reopen。

验证：
```bash
test -f plugin/scripts/smoke-profile/probe/scenarios/meeting-business-loop.js
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir=plugin smoke:profile
pnpm --dir=plugin vitest run tests/contract/installation-entrypoints.spec.ts
```

PASS：真实 scenario 和 entrypoint test 退出 0。

STOP：只能用 mock 替代真实 Loader/Storage/Session/Tool。

### T23：删除旧调度 application-service

前置状态：T22 PASS；T19 已移除活动入口引用。

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

执行：只删除上述 6 个文件；不得增加转发文件或兼容 facade。`continuation.spec.ts` 直接依赖 T19 已移除的 legacy runtime/application barrel，且 Continuation import 是本轮 Non-goal，因此与旧 application 一起删除，不修改为 target test。

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

前置状态：T25 PASS；T19 已移除活动入口和 module-boundary 引用。

允许删除：
- `plugin/src/runtime/services/developer-markdown-service.ts`
- `plugin/src/projection/developer-markdown.ts`
- `plugin/src/runtime/services/meeting-session-recovery.ts`
- `plugin/src/runtime/services/public-submission-service.ts`
- `plugin/src/runtime/services/meeting-session-service.ts`

禁止修改：其他全部文件。

执行：只删除上述 5 个文件；不得删除 legacy Domain/protocol/repository/fixture。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 5
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 5
pnpm --dir=plugin typecheck:host
```

PASS：当前步骤恰好删除列出的 5 个文件且无其他改动；host typecheck 退出 0。

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

执行：只删除上述 2 个 production 文件；旧 Domain transition、`plugin/src/projection/status.ts` 及其直接依赖 `plugin/src/projection/contribution.ts` 成对保留但保持不从 T18 target entrypoint 导出。

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

PASS：当前步骤恰好删除列出的 4 个直接测试且无其他改动；lint/typecheck/test 退出 0；T17 target recovery test 保留；fixture 零删除、零修改。累计 29 个文件的分类由已提交后的 T30 验证。

STOP：总删除超过 29、分类不符、需要扩大到 retained projection pair、Domain/protocol/repository/fixture。

### T30：收口验证与 readiness

前置状态：T29 PASS。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK（最终删除）。

禁止修改：production、test、requirements/interfaces/designs。

执行：先在 readiness 记录真实闭环、20 个 application-side production 文件与 9 个直接测试的删除和验证；明确保留的 legacy Domain/protocol、`projection/status.ts` + `projection/contribution.ts` pair、未列出的 runtime services/tests 和全部 fixtures 仍未删除。然后运行下列累计删除、完整产品和 smoke 门禁；全部成功后按“完成定义与 RUNBOOK 删除”执行 Close 检查，删除本 RUNBOOK，并再次运行文档链接与 diff 检查。readiness 更新与 RUNBOOK 删除必须进入同一个 T30 收口提交，不产生“只删除已完成 T30”或“只删除 RUNBOOK”的独立提交。

验证：
```bash
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/' | wc -l | tr -d ' ')" -eq 29
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

PASS：累计 plugin 删除总数精确为 29，分类精确为 13+6+1+9 且 fixture 零删除；RUNBOOK 的最终文档删除不计入该业务代码清单；其余命令全部退出 0；引用检查无输出；默认 smoke 包含 identity-admission 和 meeting-business-loop；readiness 明确 retained projection pair 与其它 legacy 未删除；working tree 只包含 readiness 修改和本 RUNBOOK 删除，二者进入同一提交。

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

- T8-T9 仅修改纯代码/测试，无外部副作用；失败时保留 diff 并 STOP。
- T10-T12 repository 测试必须使用临时 Storage domain；失败不得手工改持久数据。
- T14b、T15a、T15b、T16、T17 与 T22 创建的 Session 必须由测试/smoke 的 `finally` 和原生 teardown 关闭；若 teardown 无法证明完成，保留临时 profile 路径和 Session ID 作为 STOP 证据，不删除不明归属 Session。
- archive cleanup 失败是业务可恢复状态：保留 `archiving`、ArchivePackage、outbox 和 ownership，不回滚 terminal/archive materialization，不创建替代 Session。
- 任一步失败都禁止 `git reset --hard`、覆盖用户改动、跳过测试或继续执行 deletion。

## 完成定义与 RUNBOOK 删除

仅在本文全部步骤都已 PASS、随对应代码提交从本文删除，且 T30 收口完成后，实施任务才完成。完成时必须同时成立：

1. real DSH 从 CreateMeeting 到 ReadArchive 闭环通过并可冷重启读取。
2. 13 个 legacy application-service、6 个 legacy runtime application services、1 个 legacy read projection 和 9 个直接测试已删除，总删除数精确为 29；retained projection pair 与其余 legacy 文件不在目标入口的活动 import graph 中，并已登记后续清理范围。
3. target state、repository、runtime、tools/Remote/view/archive 使用同一数据和 command path。
4. readiness 已记录真实覆盖及 Non-goals。
5. 完整门禁与文档检查通过。

关闭本 RUNBOOK 时进入 `convivium-runbook` Close 模式：再次核对长期结论已在 requirements/interfaces/designs、验证事实已在 readiness；按 T30 排除本文件自身后确认没有引用；删除本文件；重新运行 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。任一关闭检查失败时立即运行 `git diff -- docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md | git apply -R`，只恢复本步骤尚未提交的 RUNBOOK 删除，然后 STOP；不得覆盖其它改动。RUNBOOK 不以 completed/archive 文件长期保留。

## Author Audit

- 结论：`Executable`；Luna + medium 无需选择产品行为、数据结构、repository transaction、DSH worker/session 方案、公开入口或关闭提交形状。
- 已固定 ArchivePackage：字段与 nested type 逐项对应 Meeting Interface ArchiveView；`publicSnapshotVersion`、createdAt、status、facts 顺序、unresolved 顺序、exportMaterials、Session close failure 与重试语义均在“聚合改动”和 T17 给出唯一值。
- 已固定剩余步骤的机械边界：全部 pnpm 命令使用当前环境支持的 `--dir=plugin`；新增文件先以 `test -f` 证明存在；T23-T29 只计当前步骤删除，T30 再从固定起始提交核对累计 29 个文件。
- 已固定 runtime 接线：T10a/T10b/T11 分离 ownership seam、generic 单 port 与原子 closure；T13 是唯一 command dispatcher；T14b/T14c 分离 target Session adapter 与 plugin lifecycle；T15 只处理 identity effect；T16 使用 DSH one-shot workers 并发且逐 run dispose；T17 只关闭可证明 ownership；T18-T21 的 projection/tool/Remote/Client symbol、允许 action 和逐字段来源均唯一。
- 已消除边界冲突：Captain parent 不作为 meeting-owned child；Remote 只保留 `list/read/control/subscribeRefresh` 且不转发 agent action；Archive 经 read view 返回；公开错误码与 Meeting Interface 一致；T22/T30 不再被错误要求 production diff。
- 已固定执行提交规则：每个步骤必须产生其要求的 production/test 行为 diff，代码、测试与该步骤删除同一提交；禁止 RUNBOOK-only commit，禁止把既有绿色测试当作完成证据，禁止未经另行授权 push 或改写历史。
- 已固定产品选择：最小 partial 闭环、无兼容/迁移/双写、reviewer coordinator + 独立 workers + batch、候选人跨 Agenda active 复用、不可压缩 message budget、按值 archive、删除 Scribe；代码删除只限 20 个 application-side production 文件和 9 个直接测试，总数 29，不拆散 retained projection pair。
- 已固定未决风险处理：可执行 baseline 或真实 DSH capability 不满足即 STOP，不允许 executor 选择替代架构；T8 从完整绿色门禁开始，后续步骤不得用 focused validation 掩盖全量回归。
- Author 交付前验证：当前工作区 `pnpm verify` 实测 112 个 test files、1349 个 tests 全部 PASS；默认 `smoke:profile` 的 `parallel-contribution` 与 `identity-admission` 均 PASS 且 restore=PASS；`node .github/scripts/check-doc-links.mjs` 与 `git diff --check` 作为本文修改门禁。未执行的 T8-T30 不得据此视为通过。
