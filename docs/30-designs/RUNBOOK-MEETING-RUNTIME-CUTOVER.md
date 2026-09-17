# RUNBOOK：Meeting Runtime 最小业务闭环切换

## 状态

- 审计结论：`Executable`
- 建立日期：2026-09-17
- 执行分支：`codex/runbook-meeting-runtime-cutover`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 起始提交：`f170deb`
- 目标：用目标 `MeetingState` 完成一条可创建、公开证据、批量审核、发布、结束、归档和读取的真实业务链，并只删除被该链替代的 legacy application orchestration/read-side 实现。

## 执行者契约

执行者必须从 T0 开始按顺序执行；每个步骤只有在该步骤 PASS 后才能进入下一步。允许修改的文件只限各步骤明确列出的路径。不得保留双写、兼容读、旧 snapshot migration、legacy facade、转发文件、第二套 repository、第二套 command dispatcher 或未被当前范围要求的通用抽象。

每一步先写或修改该步列出的测试，使新增行为出现可解释的失败，再修改 production code 使 focused validation 通过。删除步骤不改写旧 fixture；本轮删除文件总数固定为 30 个，只包含 21 个 legacy application orchestration/read-side production 文件及其 9 个直接测试。用户已有且不属于本 RUNBOOK 的改动不得覆盖或回滚。

`PASS` 表示命令退出码为 0 且该步列出的可观察断言全部成立。`STOP` 表示立即停止，不执行后续步骤；报告最后一个 PASS 步骤、触发条件、文件与 symbol、最小复现命令和实际输出。STOP 后不得放宽 Schema、lint、类型或测试，不得新增兼容层，不得自行扩大 Scope。

以下任一事实与执行时 checkout 不一致时必须 STOP：本文指定的既有路径或 symbol 不存在；正式文档改变了本文固定的字段、错误码、actor、lifecycle 或归档语义；baseline 失败；实现必须引入新依赖、数据库 migration、外部权限或 Non-goal；DSH 精确版本不再是 `0.1.2-rc.1`。

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
| 创建使用 `identityKey`，每场会议唯一 Manager 和 reviewer | 目标模型缺 `evidenceReviewerId`，旧创建按 participantKey/旧 role 建模 | T1、T14 |
| Manager 不接触草稿或正文审批 | `FormatApprovalV1`、`formatApprovals`、`reviewEvidenceDraftV1` 和 hash 门禁仍存在 | T1、T4 删除 |
| reviewer 单一、按 EvidenceVersion 独立审核、批量提交 | `submitReviewV1` 仍是单项提交，Agenda/identity 保存 reviewer 数组 | T1、T5、T16 |
| message 上限不能压缩正文 | hand accept 尚未完整实现确定性预留和耗尽状态 | T3 |
| 归档是按值白名单，Session 全部关闭后才 archived | `ArchivePackageV1` 和 archive transition 只覆盖旧子集；旧 archive service 依赖 legacy state | T1、T2、T17 |
| 同一 candidate 跨 Agenda 复用一个 active identity/Session | `recommendIdentityV1` 对 active candidate 整体拒绝 | T6、T15 |
| Scribe 已删除，发布包为 8 个角色 | `plugin/meeting-roles/` 和验证脚本仍含 `meeting_scribe` | T12 |
| target protocol 只覆盖 identity/read/end/archive | 完整 round/evidence/review action 尚未进入 `MeetingCommandV1Schema` | T8-T9 |
| target repository/application/projection 必须可真实运行 | `adaptMeetingRepositoryV1`、`createMeetingCommandApplicationV1` 和 `projectMeetingViewV1` 仍是薄 shim | T10-T21 |

代码事实以 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为当前覆盖依据；不得把存在的旧源码或历史测试算作目标实现证据。

## Scope

1. 将目标聚合修正到已确认的数据结构：删除 FormatApproval 与 reviewer 双向数组；增加唯一 `evidenceReviewerId`、Round abort、Contribution aborted、完整按值 archive。
2. 完成目标纯 Domain 的创建、开轮、举手/接纳、Evidence 登记、Review batch、发布、结束、归档转换及 candidate 跨 Agenda active 复用。
3. 将同一 `MeetingCommandV1`、repository atomic commit、receipt、outbox 和 recovery 用于整条链。
4. 通过真实 caller/session ownership 验证 local、Manager、Contributor、reviewer 和受控 runtime action。
5. reviewer coordinator 可对一个 batch 中的多个 EvidenceVersion 启动彼此不共享 Session 的 DSH worker；worker 结果只由 coordinator 批量提交。
6. 提供 caller-filtered Meeting view、待审集合、Meeting list/detail、Archive read，以及完成该链所需的 DSH tools 和 loopback Remote action。
7. Archive 固化后关闭全部 meeting-owned Session；任一关闭失败保持 `archiving` 并可恢复重试。
8. 删除 Scribe；删除清单固定为 13 个 legacy application-service、6 个 legacy runtime application services、2 个 legacy read projections 和 9 个直接测试，总数 30。
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

每项行为必须形成以下链：requirement/AC → interface action/DTO → design responsibility → production symbol → focused test → `pnpm --dir plugin verify` → readiness 事实。

## 固定数据与接口决定

### 聚合改动

`MeetingState` 保留 [Domain Design 的 canonical root](./DOMAIN-DESIGN.md#canonical-root)，并执行以下唯一改动：

- 增加 required `evidenceReviewerId: OpaqueId`；它必须指向 roles 精确为 `["evidence_reviewer"]` 的唯一 identity。
- `MeetingIdentityV1` 删除 `reviewResponsibilityIds`；`AgendaItemV1` 删除 `requiredReviewerIds`；`IssueV1` 使用 required `requiresEvidenceReview: boolean`。
- 删除 `FormatApprovalV1` 和 `MeetingState.formatApprovals`。
- `ContributionV1.status` 删除 `format_correction`，增加 `aborted`；`RoundV1` 的 aborted 状态必须同时具有 non-empty `abortReason` 和 `abortedAt: EpochMs`。
- `TerminationV1.id` 由 Runtime 生成；caller 不能提交。结束为一次原子转换：终止未完成 provisioning、固定 termination、进入 terminal、产生一个 `materialize_archive` effect request。
- `ArchivePackageV1` 是 immutable 按值对象，required：`archiveId`、`meetingId`、`createdAt`、`terminationId`、`objective`、`agenda`、`agendaCandidates`、`publications`、`messages`、实际发布的最终 `evidenceVersions`（内嵌 materials 与最终 review）、`proposals`、`positions`、`decisionCandidates`、`decisions`、`completionFacts`、`questions`、`issues`、`riskDispositions`、Question/Issue disposition facts、`termination`、`unresolvedQuestionIds`、`unresolvedIssueIds`、`sourceReferences`、`identityProvenance`。这些数组没有内容时仍为 `[]`，不得 optional/nullable。
- archive 禁止包含：PrivateMail、未公开 Evidence/Review、ReviewDelivery、举手/opportunity、Session/ownership/descriptor、完整运行配置/capability/凭据、隐藏推理、工具过程、物理路径和 Developer Markdown。

### Action、actor 与生成字段

T8 必须让 `MeetingCommandV1Schema` 精确识别：`create_meeting`、`open_round`、`raise_hand`、`dispose_hand_raise`、`submit_evidence`、`submit_review_batch`、`publish_round`、`end_meeting`、`start_archive`、`record_archive_session_result`，并保留 `recommend_identity`、`record_identity_admission_result`。`read_meeting` 与 `read_archive` 是不产生 receipt/version 的独立 read request Schema，不进入 write action union。create command 固定 `meetingId="new"`、`expectedMeetingVersion=0`；其他 write command 使用真实 meetingId 和正整数 expected version。按 Meeting Interface 的 wire convention，object Schema 忽略并 strip 未知字段；caller 即使提交 actorId、生成 ID、now、baselinePublicationIds、terminationId、archiveId、reviewerId、Session/ownership 或 effect 字段，它们也不得进入 normalized action、request hash、Domain 或持久化结果。

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

actor 固定为：create/end/start archive/read/read archive 是可信 loopback local；open/dispose/publish 是当前 Manager Session；raise/submit evidence 是目标 Contribution 的 Contributor Session；submit review batch 是唯一 reviewer coordinator Session；record admission/archive session result 是 runtime recovery/effect dispatcher。

### 原子 commit 与错误优先级

repository command 必须在一个 storage-domain transaction 中写 next snapshot、domain facts、receipt 和 outbox。成功 command 必须满足 `next.version === expectedMeetingVersion + 1`；同 requestId/同 hash 返回原 receipt，不再次产生 effect；同 requestId/不同 hash 返回 `IDEMPOTENCY_CONFLICT`；stale expected version 返回 `VERSION_CONFLICT`。Domain 或 authorization 拒绝不得通过 noop commit 保存 receipt，也不得改变 state/version/fact/outbox。

错误检查顺序固定为：protocol shape → caller/authority → idempotency history → terminal/archive → expected version → target existence → action lifecycle/precondition → Domain invariant/limit。公开 code 只使用现有契约的 `INVALID_ARGUMENT|UNAUTHORIZED|IDEMPOTENCY_CONFLICT|MEETING_TERMINAL|VERSION_CONFLICT|NOT_FOUND|INVALID_STATE|PRECONDITION_FAILED|LIMIT_EXCEEDED|RECOVERY_UNAVAILABLE|INTERNAL`。

### Evidence、review、消息预算与归档

- `SubmitEvidence` 直接登记准备公开的完整 `EvidenceInput`；不接受 draft、hash 或 format approval。首版 ordinal=1；补充版仅消费 accepted supplement hand。本闭环 smoke 只走首版。
- `SubmitReviewBatch.reviews` 必须非空且 versionId 唯一。每个 item 只含 `versionId`、四维 `dimensions`、`scope`；所有 item 先完整验证，再原子追加 Review 与逐项 delivery effect。任一 item 非法时整批零写入。
- worker 不是 MeetingIdentity，不得调用 command；每 worker 只获得一个 immutable EvidenceVersion 和它的 Round baseline，不共享 worker Session。coordinator 可选已完成 worker 的非空子集提交，不持久化 batch/claim/lease/worker 状态。
- `DisposeHandRaise(accepted)` 在 `messages.length + 所有 open Round 已接纳 Contribution 数 + 1 <= maxFormalMessages` 时才成功。预留持续到 Round published/aborted，Contribution 提前终态不释放。超限返回 `LIMIT_EXCEEDED`；禁止摘要、合并或压缩正文。
- `PublishRound` 原子发布该 Round 所有合格 Contribution；每个 Contribution 产生一条 FormalMessage，Publication 引用实际最终 EvidenceVersion。恰好耗尽预算时，完成条件已满足则进入 converging，否则进入 paused/message-budget-exhausted，不能 resume。
- `EndMeeting(partial)` 只能在没有 open Round 时执行；它列出实际 unresolved IDs。`StartArchive` 只接受 terminal，先按值物化完整 package 后进入 archiving。所有已证明归属的 meeting-owned Session 均有 closed 结果后才进入 archived；失败结果保留 archiving 和 package，recovery 用同一 ownership 重试。

Session closure proof 由 repository 的 `SessionOwnership` 拥有，不复制进 `MeetingState`。该记录的 `role` 固定为 `captain|manager|evidence_reviewer|participant`，并增加 optional `lastClosureFailureCode`；`record_archive_session_result` 只由 dispatcher/recovery 调用。`status="failed"` 在一次 repository transaction 中保留 ownership 的未关闭 lifecycle、写 non-empty failure code、command fact/receipt，并将 MeetingState.version/updatedAt 加一但保持 `archiving`。`status="closed"` 在同一 transaction 中把 ownership 置 `lifecycleStatus="closed"`、`capabilityStatus="revoked"`、清除 failure code、写 fact/receipt 并增加 Meeting version；若提交后不存在未关闭的本 Meeting ownership，同一 commit 把 lifecycle 置 `archived`。replay 不重复关闭或加 version；不能证明 ownership 属于本 Meeting 时返回 `RECOVERY_UNAVAILABLE` 且零写。

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

### T1：收敛 canonical MeetingState

前置状态：T0 PASS。

允许修改：`plugin/src/domain/meeting-state-v1.ts`、`plugin/src/domain/meeting-state-v1-validation.ts`、`plugin/tests/fixtures/meeting-state-v1.ts`、`plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts`。

禁止修改：transition、protocol、repository、runtime、旧 fixture。

执行：按“聚合改动”修正字段；validator 检查唯一 reviewer、typed refs、abort 组合和 archive 白名单；目标 fixture 不含旧字段。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：合法 fixture 通过；缺/错 reviewer、旧字段、非法 abort、archive 悬空引用拒绝。

STOP：需要 optional 化 required 字段或接受旧结构。

### T2：完成创建、结束与归档纯转换

前置状态：T1 PASS。

允许修改：`plugin/src/domain/transitions/meeting-create-v1.ts`、`plugin/src/domain/transitions/meeting-end-v1.ts`、`plugin/src/domain/transitions/meeting-archive-v1.ts`、`plugin/src/domain/transitions/result-v1.ts`、`plugin/tests/unit/domain/meeting-lifecycle-v1.spec.ts`（新增）。

禁止修改：Round、Evidence、identity、repository、runtime。

执行：完成 create、partial/completed end、archive materialization 与 archive session result；拒绝返回原 state 且无 effect。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/meeting-lifecycle-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：create→terminal→archiving→archived 合法；未关闭 ownership 不得 archived；非法 completed 拒绝。

STOP：需要把 Session proof 放入 MeetingState 或新增 lifecycle 边。

### T3：完成 Round、举手与消息预留

前置状态：T2 PASS。

允许修改：`plugin/src/domain/transitions/round-v1.ts`、`plugin/src/domain/transitions/hand-raise-v1.ts`、`plugin/src/domain/transitions/round-publication-v1.ts`、`plugin/tests/unit/domain/round-v1.spec.ts`、`plugin/tests/unit/domain/hand-raise-v1.spec.ts`、`plugin/tests/unit/domain/round-publication-v1.spec.ts`。

禁止修改：Evidence/Review、identity、runtime。

执行：完成 open、raise/dispose、预算预留、publish 后重算、budget exhausted pause 和 abort。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/round-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts tests/unit/domain/round-publication-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：正常发布、abort、超限拒绝和恰好耗尽两个分支通过；无压缩或合并。

STOP：需要摘要正文或提前释放 reservation。

### T4：停用 FormatApproval 并直接登记 Evidence

前置状态：T3 PASS。

允许修改：`plugin/src/domain/transitions/format-evidence-v1.ts`、`plugin/tests/unit/domain/format-evidence-v1.spec.ts`。

禁止修改：review、publish、runtime、旧 fixture。

执行：保留现有文件路径，删除其中的 draft/hash/approval symbol 和相应断言；`EvidenceInputV1`/`submitEvidenceV1` 直接实现首版登记。不得通过 rename 删除该文件。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/format-evidence-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：完整 Evidence 原子登记；非法结构零写；production 无 `FormatApprovalV1|reviewEvidenceDraftV1`。

STOP：需要 Manager 接收草稿或 hash。

### T5：实现原子 Review batch

前置状态：T4 PASS。

允许修改：`plugin/src/domain/transitions/evidence-review-v1.ts`、`plugin/src/domain/transitions/round-publication-v1.ts`、`plugin/tests/unit/domain/evidence-review-v1.spec.ts`、`plugin/tests/unit/domain/round-publication-v1.spec.ts`。

禁止修改：worker runtime、protocol、repository。

执行：用 `submitReviewBatchV1` 替代单项提交；先完整验证后一次追加 reviews/effects；publish 只接受全部最终 review 已完成且 delivery 成功的 current versions。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/evidence-review-v1.spec.ts tests/unit/domain/round-publication-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：合法多项 batch 一次成功；duplicate/部分非法全部零写；单项 production export 消失。

STOP：需要持久 ReviewBatch 或第二 reviewer。

### T6：实现 candidate 跨 Agenda 复用

前置状态：T5 PASS。

允许修改：`plugin/src/domain/transitions/meeting-identity-v1.ts`、`plugin/tests/unit/domain/meeting-identity-v1.spec.ts`。

禁止修改：Catalog/application/Session adapter。

执行：严格实现“Candidate 复用”规则和时间/ID来源。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/meeting-identity-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：pair duplicate、global provisioning conflict、active reuse、provenance mismatch 全部通过；reuse 无 effect/新 identity。

STOP：必须新建 Session 或扩大权限。

### T7：统一纯 Domain 公开入口

前置状态：T6 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-transitions.ts`、`plugin/src/domain/transitions/index.ts`、`plugin/src/domain/index.ts`、`plugin/tests/unit/domain/meeting-state-v1-transitions.spec.ts`。

禁止修改：legacy Domain 文件、protocol、runtime。

执行：只导出 T1-T6 的目标 types/transitions；generic dispatcher 使用同一 error/lifecycle 语义，不复制 transition。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/domain/meeting-state-v1-transitions.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：闭环 action 从公开入口可用；无 FormatApproval export；legacy 文件仍保留。

STOP：需要删除 legacy Domain 或创建 facade。

### T8：扩展 write/read protocol

前置状态：T7 PASS。

允许修改：`plugin/src/protocol/meeting-command-v1.ts`、`plugin/src/protocol/meeting-identity-v1.ts`、`plugin/src/protocol/request-idempotency.ts`、`plugin/tests/contract/meeting-command-v1-core.spec.ts`、`plugin/tests/contract/meeting-identity-protocol-v1.spec.ts`、`plugin/tests/contract/meeting-business-loop-v1.spec.ts`（新增）。

禁止修改：`plugin/src/protocol/index.ts` 和其他 legacy protocol、repository、runtime。

执行：实现固定 write union、独立 read schemas、unknown-key strip、target codec 和 canonical request hash。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-command-v1-core.spec.ts tests/contract/meeting-identity-protocol-v1.spec.ts tests/contract/meeting-business-loop-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：全部 action 正反例、strip/hash、旧 state 拒绝通过。

STOP：必须修改 legacy Schema 或 unknown key 进入 Domain。

### T9：登记 target protocol 公开入口

前置状态：T8 PASS。

允许修改：`plugin/src/protocol/index.ts`、`plugin/tests/contract/meeting-business-loop-v1.spec.ts`。

禁止修改：protocol implementation、legacy protocol 文件。

执行：增加 target exports；保留 legacy exports，不用 target 名称重导出 legacy type。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-business-loop-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：target imports 只解析到 V1 文件；legacy exports 仍可编译但目标链不引用。

STOP：出现循环依赖或需要删除 legacy protocol。

### T10：将 repository snapshot/port 类型化

前置状态：T9 PASS。

允许修改：`plugin/src/repository/types.ts`、`plugin/src/repository/meeting-repository-port.ts`、`plugin/src/repository/meeting-command-repository-v1.ts`、`plugin/src/repository/domain/schemas.ts`、`plugin/tests/contract/meeting-repository-behavior.ts`。

禁止修改：repository core/projection/recovery、runtime。

执行：`MeetingSnapshot.state` 使用 `MeetingState`；合并唯一 port 并删除 adapter shim；ownership 增加固定 role/closure failure 字段。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-repository-behavior.ts
pnpm --dir plugin typecheck:host
```

PASS：port/type/schema 只接受 target snapshot；无第二 repository adapter。

STOP：必须退回 JsonObject、dual type 或 migration union。

### T11：实现 repository atomic command commit

前置状态：T10 PASS。

允许修改：`plugin/src/repository/domain/projection.ts`、`plugin/src/repository/domain/domain-meeting-repository-core.ts`、`plugin/src/repository/domain/domain-meeting-repository.ts`、`plugin/tests/fixtures/domain-meeting-repository.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`、`plugin/tests/contract/domain-meeting-repository-facts.spec.ts`。

禁止修改：registry/recovery、runtime。

执行：transaction 内验证 next version 并写 state/fact/receipt/outbox；拒绝不入 repository；实现 replay/conflict/rollback。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/domain-meeting-repository.spec.ts tests/contract/domain-meeting-repository-facts.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：success/replay/conflict/rollback 无半提交。

STOP：需要 noop receipt、双写或新 storage abstraction。

### T12：实现 repository recovery 与 ownership closure

前置状态：T11 PASS。

允许修改：`plugin/src/repository/domain/domain-repository-registry.ts`、`plugin/src/repository/diagnostics.ts`、`plugin/src/repository/domain/projection.ts`、`plugin/tests/fixtures/domain-storage.ts`、`plugin/tests/recovery/domain-recovery.spec.ts`、`plugin/tests/recovery/sqlite-meeting-recovery.spec.ts`。

禁止修改：Runtime、legacy storage migration。

执行：reopen 只解 target snapshot；旧 snapshot fail closed；原子保存 Session closure proof；最后一个 closed result 可进入 archived。

验证：
```bash
pnpm --dir plugin vitest run tests/recovery/domain-recovery.spec.ts tests/recovery/sqlite-meeting-recovery.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：reopen、closure retry、旧 snapshot 拒绝和最后 ownership 收口通过。

STOP：需要迁移旧 snapshot 或操作不明归属 Session。

### T13：建立唯一 application command dispatcher

前置状态：T12 PASS。

允许修改：`plugin/src/runtime/application-service/meeting-command-v1.ts`、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/meeting-runtime.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`。

禁止修改：identity provisioning、roles、Remote/tools、旧 application 文件。

执行：建立唯一 `executeMeetingCommandV1`；resolve caller、固定错误顺序、调用纯 transition，accepted 才 repository commit。`application-service/types.ts` 只保留目标 dispatcher/runtime 所需类型，移除 Developer Markdown 与旧 application option 引用。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-runtime.spec.ts tests/unit/runtime/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
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
pnpm --dir plugin vitest run tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir plugin verify:agent-definitions
```

PASS：资源精确为八个 roles、专职 Manager/reviewer、无 Scribe；验证命令退出 0。

STOP：需要替代角色、增加第九角色或修改 DSH 能力语义。

### T14b：接入创建与 plugin lifecycle

前置状态：T14a PASS。

允许修改：`plugin/src/runtime/meeting-runtime.ts`、`plugin/src/index.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`。

禁止修改：identity recommendation、review workers、Remote/UI、role resources。

执行：完整验证 identityKey 和 T14a 的八个 Definition；preflight/session failure 按 creation_failed/revoke/drain 清理；精确版本和必需 capability 通过前不注册 write。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：八个 child、创建原子性、清理和精确版本 lifecycle 门禁通过。

STOP：需要 persona-only、放宽 DSH 版本或发布半可用 Meeting。

### T15a：接入 identity application

前置状态：T14b PASS。

允许修改：`plugin/src/runtime/application-service/meeting-identity-v1.ts`、`plugin/src/runtime/services/meeting-identity-provision-v1.ts`、`plugin/src/dsh/meeting-identity-admission-v1.ts`、`plugin/tests/contract/meeting-identity-command-v1.spec.ts`。

禁止修改：command recovery、ownership、Catalog producer、review/archive services、Remote。

执行：把 identity action 接入唯一 dispatcher；保留 admissionId 幂等 provisioning；active reuse 直接 commit 且零 effect。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-identity-command-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：首次 provisioning、request replay 和跨 Agenda reuse 通过。

STOP：reuse 创建第二 Session 或 application 绕过唯一 dispatcher。

### T15b：接入 identity recovery

前置状态：T15a PASS。

允许修改：`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/src/dsh/session-ownership.ts`、`plugin/tests/recovery/meeting-identity-v1.spec.ts`。

禁止修改：identity application/provisioner、review/archive services、Remote。

执行：重启只继续固化 admissionId/Definition/descriptor；uncertain ownership fail closed；不创建替代 child。

验证：
```bash
pnpm --dir plugin vitest run tests/recovery/meeting-identity-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：provisioning replay、成功/失败 recovery 和 active identity 恢复通过。

STOP：recovery 使用当前 Definition 替代固化 provenance。

### T16：接入 reviewer workers

前置状态：T15b PASS。

允许修改：`plugin/src/runtime/services/evidence-review-dispatch-v1.ts`（新增）、`plugin/src/dsh/session-adapter.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/unit/runtime/evidence-review-dispatch-v1.spec.ts`（新增）、`plugin/tests/integration/dsh/evidence-review-dispatch-v1.spec.ts`（新增）、`plugin/tests/unit/runtime/outbox-worker.spec.ts`。

禁止修改：archive、projection、Remote/UI。

执行：每 EvidenceVersion 一个独立只读 worker Session；coordinator 收集完成项并提交一次 batch；失败项保持 pending。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/runtime/evidence-review-dispatch-v1.spec.ts tests/integration/dsh/evidence-review-dispatch-v1.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：至少两个不同 worker Session 并发、一次 batch、worker 无 Meeting authority。

STOP：需要共享 worker Session、持久 batch/lease 或 worker 直接写 Meeting。

### T17：接入 archive cleanup 与恢复

前置状态：T16 PASS。

允许修改：`plugin/src/runtime/services/meeting-archive-v1.ts`（新增）、`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/src/runtime/outbox-worker.ts`、`plugin/tests/unit/runtime/meeting-archive-v1.spec.ts`（新增）、`plugin/tests/recovery/meeting-business-loop-v1.spec.ts`（新增）、`plugin/tests/unit/runtime/outbox-worker.spec.ts`。

禁止修改：review dispatcher、Remote/UI、旧 archive service。

执行：materialize archive；逐一 close/revoke proven ownership；原子记录结果；失败保持 archiving，最后 closed 进入 archived。

验证：
```bash
pnpm --dir plugin vitest run tests/unit/runtime/meeting-archive-v1.spec.ts tests/recovery/meeting-business-loop-v1.spec.ts tests/unit/runtime/outbox-worker.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：close failure/restart/retry 后 archived；无重复或不明归属 Session。

STOP：需要回滚 archive package 或创建替代 Session。

### T18：实现 caller-filtered projection

前置状态：T17 PASS。

允许修改：`plugin/src/projection/meeting-view-v1.ts`、`plugin/src/projection/index.ts`、`plugin/tests/contract/meeting-identity-view-v1.spec.ts`。

禁止修改：legacy projection、tools/Remote/Client。

执行：实现 Contributor/reviewer/Manager/local 的固定 visibility 和 archive whitelist；`projection/index.ts` 只登记目标 Meeting view，不再导出旧 contribution/developer-markdown projection，保留本轮不删除的 `status.ts` 文件但不把它接入目标入口。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/meeting-identity-view-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：轮内隔离、Manager 无正文、reviewer pending set、local archive 和敏感字段排除通过。

STOP：需要向 caller 暴露 Session/capability/private data。

### T19：接入 DSH tools

前置状态：T18 PASS。

允许修改：`plugin/src/tools/register-tools.ts`、`plugin/src/tools/index.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/src/runtime/index.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/unit/module-boundaries.spec.ts`。

禁止修改：Remote、Client、旧 application 文件。

执行：只登记 agent actions并调用唯一 dispatcher；`application-service/index.ts` 和 `runtime/index.ts` 只暴露 target runtime，不再导入或导出旧 application constructors、contribution/dispatch/session/developer-markdown services；module boundary test 固定该活动 import graph，并允许旧文件在 T23-T29 前暂时不可达地存在。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/tool-registration.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：tool authority/Schema/dispatcher 通过；活动 runtime barrel 无旧 constructor export。

STOP：tool 需要直接调用旧 application 或提交 actor。

### T20：接入 loopback Remote

前置状态：T19 PASS。

允许修改：`plugin/src/remote/types.ts`、`plugin/src/remote/index.ts`、`plugin/tests/contract/remote-boundary.spec.ts`、`plugin/tests/contract/remote-generation.spec.ts`。

禁止修改：Client、Domain、repository。

执行：只接 local create/read/end/archive 和受控 agent action 转发；所有 write 调唯一 dispatcher。

验证：
```bash
pnpm --dir plugin vitest run tests/contract/remote-boundary.spec.ts tests/contract/remote-generation.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：loopback authority、伪造 actor、read/write DTO 和 error mapping 通过。

STOP：需要 Web user/Team authority 或 Remote 复制 Domain 规则。

### T21a：接入 Client transport

前置状态：T20 PASS。

允许修改：`plugin/src/client/meeting-client.ts`、`plugin/tests/client/meeting-client.client.spec.ts`。

禁止修改：panel、CSS/视觉系统、business semantics、Remote。

执行：实现 list/detail/archive read 与 end/archive write client；提交成功或协议拒绝后按契约重读；不计算 Domain state。

验证：
```bash
pnpm --dir plugin vitest run tests/client/meeting-client.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：transport DTO、error mapping 和 refresh contract 通过。

STOP：需要 Client 重算领域事实或修改 Remote。

### T21b：接入 Client 只读视图

前置状态：T21a PASS。

允许修改：`plugin/src/client/meeting-panel-layout.tsx`、`plugin/src/client/meeting-panel-sections.tsx`、`plugin/src/client/meeting-panel-view.tsx`、`plugin/tests/client/meeting-panel-v1-fixtures.ts`（新增）、`plugin/tests/client/meeting-panel.client.spec.ts`、`plugin/tests/client/meeting-panel-visibility.client.spec.ts`。

禁止修改：interactive panel、legacy fixture、CSS/视觉系统、Remote。

执行：展示 list/detail/archive 与 caller-filtered 内容；新测试只使用新增 target fixture；既有 `meeting-panel-fixtures.ts` 不修改、不删除。

验证：
```bash
pnpm --dir plugin vitest run tests/client/meeting-panel.client.spec.ts tests/client/meeting-panel-visibility.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：只读布局、archive 和 visibility 通过；没有 Client 派生业务事实。

STOP：需要读取 legacy DTO、修改旧 fixture 或视觉重设计。

### T21c：接入 Client local controls

前置状态：T21b PASS。

允许修改：`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/meeting-panel-lifecycle.client.spec.ts`、`plugin/tests/client/meeting-panel-local-controls.client.spec.ts`。

禁止修改：layout/sections/view、fixture、Remote、business semantics。

执行：只接 end/archive controls；调用 T21a client 后重读；按钮状态只消费 projection 字段。

验证：
```bash
pnpm --dir plugin vitest run tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-local-controls.client.spec.ts
pnpm --dir plugin typecheck:client
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
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir plugin smoke:profile
pnpm --dir plugin vitest run tests/contract/installation-entrypoints.spec.ts
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
pnpm --dir plugin typecheck:host
```

PASS：application-service 累计删除数为 5；typecheck 退出 0。

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
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 9
pnpm --dir plugin typecheck:host
```

PASS：application-service 累计删除数为 9；typecheck 退出 0。

STOP：仍有 production 引用、需要修改其他文件或累计删除不等于 9。

### T25：删除剩余旧 application-service 及直接测试

前置状态：T24 PASS。

允许删除：
- `plugin/src/runtime/application-service/meeting-end.ts`
- `plugin/src/runtime/application-service/meeting-mail.ts`
- `plugin/src/runtime/application-service/meeting-query.ts`
- `plugin/src/runtime/application-service/meeting-task.ts`
- `plugin/tests/contract/contribution-runtime.spec.ts`

禁止修改：fixture、legacy Domain/protocol/projection/runtime services/其他 tests，以及 T1-T24 文件。

执行：只删除上述 5 个文件；不得增加转发文件或兼容 facade。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 14
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 13
test -z "$(rg -n 'application-service/(continuation-selection|create-meeting|initialize-meeting-turn|meeting-agenda-candidate|meeting-attendance|meeting-contribution|meeting-control|meeting-decision|meeting-end|meeting-mail|meeting-query|meeting-task|meeting-turn)\.js' plugin/src plugin/tests || true)"
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin test
```

PASS：当前阶段累计删除数精确为 14，其中 application-service 13；目标列表零引用；lint/typecheck/test 退出 0；旧 fixture 未修改。

STOP：当前阶段累计删除数不等于 14、仍有引用且必须修改 T19 之外文件；不得把 T26-T29 的文件提前到本步删除。

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
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 19
pnpm --dir plugin typecheck:host
```

PASS：累计删除数精确为 19；host typecheck 退出 0。

STOP：仍有 production 引用、需要修改其他文件或累计删除不等于 19。

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
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 22
pnpm --dir plugin typecheck
```

PASS：累计删除数精确为 22；typecheck 退出 0。

STOP：需要修改测试或 fixture 才能通过。

### T28：删除旧 contribution/dispatch application services

前置状态：T27 PASS。

允许删除：
- `plugin/src/runtime/services/contribution-runtime-service.ts`
- `plugin/src/runtime/services/meeting-dispatch-service.ts`
- `plugin/src/projection/contribution.ts`

禁止修改：其他全部文件。

执行：只删除上述 3 个 production 文件；旧 Domain transition 和 `plugin/src/projection/status.ts` 保留。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 25
pnpm --dir plugin typecheck:host
```

PASS：累计删除数精确为 25；host typecheck 退出 0。

STOP：需要删除旧 Domain/protocol、`projection/status.ts` 或其他文件。

### T29：删除旧 contribution/dispatch 直接测试

前置状态：T28 PASS。

允许删除：
- `plugin/tests/recovery/contribution-recovery.spec.ts`
- `plugin/tests/unit/runtime/contribution-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-mail-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-manager-dispatch.spec.ts`
- `plugin/tests/unit/runtime/meeting-speaker-dispatch.spec.ts`

禁止修改：其他全部文件，尤其是 fixture 和 legacy Domain tests。

执行：只删除上述 5 个直接测试；不得增加 replacement legacy tests。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 30
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/application-service/' | wc -l | tr -d ' ')" -eq 13
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/runtime/services/' | wc -l | tr -d ' ')" -eq 6
test "$(git diff --diff-filter=D --name-only | rg '^plugin/src/projection/' | wc -l | tr -d ' ')" -eq 2
test "$(git diff --diff-filter=D --name-only | rg '^plugin/tests/' | wc -l | tr -d ' ')" -eq 9
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin test
```

PASS：总删除数精确为 30，分类精确为 13+6+2+9；lint/typecheck/test 退出 0；fixture 零删除、零修改。

STOP：总删除超过 30、分类不符、需要删除第 31 个文件或扩大到 Domain/protocol/repository/fixture。

### T30：收口验证与 readiness

前置状态：T29 PASS。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK（只记录执行证据）。

禁止修改：production、test、requirements/interfaces/designs。

执行：记录真实闭环、21 个 application-side production 文件与 9 个直接测试的删除和验证；明确保留的 legacy Domain/protocol、未列出的 projection/runtime services/tests 和全部 fixtures 仍未删除。

验证：
```bash
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile
node .github/scripts/check-doc-links.mjs
git diff --check
git status --short
```

PASS：全部退出 0；默认 smoke 包含 identity-admission 和 meeting-business-loop；readiness 不把保留 legacy 声称为已删除。

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
| full product gate | `pnpm --dir plugin verify` + default `pnpm --dir plugin smoke:profile` |

Not Applicable：数据库 schema migration 和旧 snapshot compatibility 明确不做；外部网络 research 不是本闭环输入；Continuation、stress、metrics 和跨 Host 不作为完成门禁。

## 失败恢复

- T1-T9 仅修改纯代码/测试，无外部副作用；失败时保留 diff 并 STOP。
- T10-T12 repository 测试必须使用临时 Storage domain；失败不得手工改持久数据。
- T14b、T15a、T15b、T16、T17 与 T22 创建的 Session 必须由测试/smoke 的 `finally` 和原生 teardown 关闭；若 teardown 无法证明完成，保留临时 profile 路径和 Session ID 作为 STOP 证据，不删除不明归属 Session。
- archive cleanup 失败是业务可恢复状态：保留 `archiving`、ArchivePackage、outbox 和 ownership，不回滚 terminal/archive materialization，不创建替代 Session。
- 任一步失败都禁止 `git reset --hard`、覆盖用户改动、跳过测试或继续执行 deletion。

## 完成定义与 RUNBOOK 删除

仅在 T0-T30 全部 PASS 后，实施任务才完成。完成时必须同时成立：

1. real DSH 从 CreateMeeting 到 ReadArchive 闭环通过并可冷重启读取。
2. 13 个 legacy application-service、6 个 legacy runtime application services、2 个 legacy read projections 和 9 个直接测试已删除，总删除数精确为 30；其余 legacy 文件仍保留但不在目标入口的活动 import graph 中，并已登记后续清理范围。
3. target state、repository、runtime、tools/Remote/view/archive 使用同一数据和 command path。
4. readiness 已记录真实覆盖及 Non-goals。
5. 完整门禁与文档检查通过。

关闭本 RUNBOOK 时进入 `convivium-runbook` Close 模式：再次核对长期结论已在 requirements/interfaces/designs、验证事实已在 readiness；运行 `rg -n 'RUNBOOK-MEETING-RUNTIME-CUTOVER|Meeting Runtime 最小业务闭环切换' .`；删除本文件及仅用于指向它的引用；重新运行 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。任一关闭检查失败则恢复本文件并 STOP。RUNBOOK 不以 completed/archive 文件长期保留。

## Author Audit

- 结论：`Executable`。
- 已固定产品选择：最小 partial 闭环、无兼容/迁移/双写、reviewer coordinator + 独立 workers + batch、候选人跨 Agenda active 复用、不可压缩 message budget、按值 archive、删除 Scribe；代码删除只限 21 个 application-side production 文件和 9 个直接测试，总数 30。
- 已固定未决风险处理：baseline 或真实 DSH capability 不满足即 STOP，不允许 executor 选择替代架构。
- Author 交付前验证：`node .github/scripts/check-doc-links.mjs`、`git diff --check`；未执行产品 test，因为本次 Author 只修改文档，T0 固定执行前完整 baseline。
