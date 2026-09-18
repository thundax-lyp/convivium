# RUNBOOK：Meeting Runtime 最小业务闭环切换

## 状态

- 审计结论：`Executable`
- 建立日期：2026-09-17；基于合并后代码复审日期：2026-09-18；T15c 恢复审计日期：2026-09-18
- 执行分支：`codex/runbook-meeting-runtime-cutover-2`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 固定累计变更基线：`f170deb`
- 本轮恢复执行基线：`10ef672`
- 目标：用目标 `MeetingState` 完成一条可创建、公开证据、批量审核、发布、结束、归档和读取的真实业务链，并只删除被该链替代的 legacy application orchestration/read-side 实现。

## 执行者契约

执行者必须从本文仍存在的第一个步骤开始按顺序执行；已从本文删除的步骤视为已有提交证据，不得重复执行。每个步骤只有在该步骤 PASS 后才能进入下一步。允许修改的业务文件只限各步骤明确列出的路径；每一步都额外隐含允许修改本 RUNBOOK，但唯一允许的改动是该步 PASS 后删除当前完整 step section，且该文件不计入“每步不超过 8 个文件”。步骤中的“禁止修改其他全部文件”不禁止这项强制 step 删除。除 T10d-T10g 为保持分步依赖闭包而明示且必须按序删除的 compile bridge 外，不得保留双写、target compatibility read、旧 snapshot migration、legacy facade、转发文件、第二套 repository、第二套 command dispatcher 或未被当前范围要求的通用抽象；为使明确保留的 legacy 文件在删除前编译而保留的旧字段/exports，必须被逐项标为 legacy-only、不得进入 target activity graph，并迁移到 readiness 未覆盖项。

T10d-T21c 中除 T14a 资源步骤外的实现步骤必须对该步列出的 production symbol 形成真实代码 diff；T14a 必须形成发布资源与验证脚本 diff；T22 是 smoke/entrypoint 验证步骤，T23-T29 是删除步骤，T30 是 readiness/关闭步骤，三者不要求 production diff。所有行为实现步骤都先写或修改该步列出的测试，使新增行为出现可解释的失败，再修改 production code 使 focused validation 通过；T10f 是只删除 repository identity 字段的机械 type cleanup，以 `rg` 和 `typecheck:host` 作为红绿边界，不另改 fixture test。已有测试为绿、只增加测试、只删除 RUNBOOK 步骤或只改文档都不能证明实现步骤完成。若 Author/Audit 时发现某步行为已经完整存在，应由 Author 删除该步并记录既有证据，不得留给 executor 产生 RUNBOOK-only commit。删除步骤不改写旧 fixture；从固定累计变更基线 `f170deb` 统计的删除总数固定为 31 个 plugin 文件：T14a 已删除的 1 个 Scribe-only skill 资源、已删除的 1 个冗余 command repository facade、20 个 legacy application orchestration/read-side production 文件和 9 个直接测试。恢复执行基线 `10ef672` 已包含 Scribe skill、repository facade 与 `session-recovery.spec.ts` 三项删除；后续步骤不得重建或重复删除。DSH Storage Domain adapter、`DomainRepositoryRegistry`、`DomainMeetingRepository` 与唯一 `MeetingRepositoryPort` 均保留。用户已有且不属于本 RUNBOOK 的改动不得覆盖或回滚。

每步的提交节奏固定为：完成 production/test 改动并通过该步验证 → 删除本文中该完整步骤 → 将代码、测试和该步骤删除放进同一个提交。禁止单独提交 RUNBOOK 步骤删除，禁止用空改动或既有绿色测试代替实现。除非用户另行明确要求，不得 push、force-push、rebase、amend 或改写已 push 的提交。删除步骤的计数在提交前只检查当前 working-tree 删除；全程累计删除只在 T30 对固定起始提交 `f170deb` 检查。

`PASS` 表示命令退出码为 0 且该步列出的可观察断言全部成立。`STOP` 表示立即停止，不执行后续步骤；报告最后一个 PASS 步骤、触发条件、文件与 symbol、最小复现命令和实际输出。STOP 后不得放宽 Schema、lint、类型或测试，不得新增兼容层，不得自行扩大 Scope。

以下任一事实与执行时 checkout 不一致时必须 STOP：本文指定的既有路径或 symbol 不存在；正式文档改变了本文固定的字段、错误码、actor、lifecycle 或归档语义；实现必须引入新依赖、数据库 migration、外部权限或 Non-goal；DSH 精确版本不再是 `0.1.2-rc.1`。

执行前只在仓库根目录运行一次：

```bash
test "$(git branch --show-current)" = "codex/runbook-meeting-runtime-cutover-2"
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
| 创建使用 `identityKey`，每场会议唯一 Manager 和 reviewer | target 创建已按 identityKey 建模并创建八个独立 child Session | 已完成 |
| reviewer 单一、按 EvidenceVersion 独立审核、批量提交 | 纯 Domain batch 已完成，DSH reviewer coordinator 与独立 worker 尚未接入 | T16 |
| 归档是按值白名单，Session 全部关闭后才 archived | canonical ArchivePackage 与 Domain lifecycle 已完成，runtime cleanup/outbox/recovery 尚未接入 | T17 |
| 同一 candidate 跨 Agenda 复用一个 active identity/Session | 纯 Domain active reuse、identity effect handler 与 recovery 已完成；meeting-owned notice 尚未实现 | T15c 只实现 target handler，T20 在 target lifecycle 注入活动路由 |
| Scribe 已删除，发布包为 8 个角色 | definitions、README、验证脚本与发布检查均为八角色，Scribe-only skill 已删除 | 已完成；T19b 只更新 Manager target toolFilter 与 Definition version |
| `meetingId` 是 V1 唯一 Meeting namespace | target repository、runtime、label 与 ownership 已只使用 `meetingId`；不可达 legacy 文件待删除 | T23-T29 删除旧实现；不得用固定或忽略的 compatibility `teamId` |
| target repository/application/projection 必须可真实运行 | repository core、target command application 与创建生命周期已完成；identity/review/archive effect、projection、tools、Remote 和 Client 尚未形成同一活动链 | T15a-T21 |
| `close_contribution` 已进入正式 Interface 与 target command core | author/deadline authority、期限校验和 repository 原子提交已有 focused test；本最小业务链不经过提前退出，尚未接 Agent tool 或 target deadline scanner | 保留已实现 command core；外设接线明确列为本轮 Non-goal，并迁移到 readiness 未覆盖项 |

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
- 不把 `close_contribution` 接成 Agent tool 或 target deadline scanner；本轮只保留已由正式 Interface 授权并已有 focused test 的 command core。作者主动退出与 deadline recovery 的外设入口必须在 readiness 保持未覆盖，不能由 legacy `contribution-runtime-service` 继续提供。
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

目标 `MeetingCommandV1Schema` 精确识别：`create_meeting`、`open_round`、`raise_hand`、`dispose_hand_raise`、`submit_evidence`、`close_contribution`、`submit_review_batch`、`record_review_delivery`、`publish_round`、`end_meeting`、`start_archive`、`record_archive_session_result`，并保留 `recommend_identity`、`record_identity_admission_result`。这些 command core 均已实现；本 RUNBOOK 只接通 Scope 所列最小业务链，`close_contribution` 的外设入口按 Non-goals 留待后续。`ListMeetingsRequestV1Schema` 与 `ReadMeetingRequestV1Schema` 是不产生 receipt/version 的独立 read request Schema，不进入 write action union；Archive 只经 `ReadMeeting` 的 `archive` 字段读取，不建立 `read_archive` action。create command 固定 `meetingId="new"`、`expectedMeetingVersion=0`；其他 write command 使用真实 meetingId 和正整数 expected version。按 Meeting Interface 的 wire convention，object Schema 忽略并 strip 未知字段；caller 即使提交 actorId、生成 ID、now、baselinePublicationIds、terminationId、archiveId、deliveryId、reviewerId、Session/ownership、`teamId` 或 effect 字段，它们也不得进入 normalized action、request hash、Domain 或持久化结果。

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

actor 固定为：create/end/list/read 是可信 loopback local；start archive 与 record admission/review delivery/archive session result 是 runtime recovery/effect dispatcher；open/dispose/publish 是当前 Manager Session；raise/submit evidence 是目标 Contribution 的 Contributor Session；close contribution 的 `withdrawn` 是目标 Contribution 作者 Session，`submission_missing|timed_out` 是 `deadline_handler` channel 的固定 principal；submit review batch 是唯一 reviewer coordinator Session。本轮不接 close contribution 的两个外设入口。

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

### T17：接入 archive cleanup 与恢复

前置状态：T16 PASS。

允许修改：`plugin/src/runtime/services/meeting-archive-v1.ts`（新增）、`plugin/src/runtime/services/meeting-command-recovery-v1.ts`、`plugin/tests/unit/runtime/meeting-archive-v1.spec.ts`（新增）、`plugin/tests/recovery/contribution-recovery.spec.ts`。

禁止修改：review dispatcher、Remote/UI、旧 archive service。

执行：本步消费 T13 `end_meeting` 产生的 archive outbox；只通过 T13 `start_archive` command 物化 package，不在 service 内复制 materialization。新增并只导出以下入口：

```ts
interface DispatchArchiveCleanupInputV1 { outboxItem: OutboxItem; parent: Agent; signal: AbortSignal }
function createMeetingArchiveDispatcherV1(dependencies: MeetingArchiveDispatcherDependenciesV1): {
    dispatch(input: DispatchArchiveCleanupInputV1): Promise<void>;
};
```

dependencies required 为 `{repository; sessions:Pick<SubagentRuntime,"listChildren"|"interrupt"|"drainContinuableChildren">; application:MeetingCommandApplicationV1}`。`dispatch` 先 recover committed snapshot：若 lifecycle=terminal，提交一次 `start_archive`，requestId 固定为 `archive-start:${outboxItem.id}`，context 使用 `caller={channel:"runtime_recovery",principalId:RUNTIME_RECOVERY_PRINCIPAL_ID}` 和 `{effectId:outboxItem.id,archiveId:outboxItem.payload.archiveId}`；accepted/replay 后重读。若已 archiving，要求 `archive.id===outboxItem.payload.archiveId` 且 archive.status=complete；若已 archived 且 ID 相同，直接 delivered；其它状态或 ID mismatch 返回 `RECOVERY_UNAVAILABLE`。随后以 repository 中 `meetingId` 匹配且未 supersede 的 ownership 为唯一 cleanup 目标；目标必须恰好一个 manager、一个 evidence_reviewer，并包含创建时六个 participant 及 T15 后续已激活的 participant。每个 identityId 都存在于 archived identity provenance，每个 active identity 恰有一个 ownership，parentSessionId 全部等于 `String(parent.id)`；调用 `sessions.listChildren(parent.id,signal)` 得到的 durable direct-child id/label 必须分别与 ownership 的 `sessionId/sessionLabel` 一致。缺失、额外、重复或不明归属立即返回 `RECOVERY_UNAVAILABLE`，不得操作任何 Session。

对每个未 closed ownership，先同步调用 `sessions.interrupt(ownership.sessionId,{kind:"ancestor",agent:parent})`，再 `await sessions.drainContinuableChildren(parent,[ownership.sessionId])` 并等待静默；不得把 fire-and-return interrupt 当作关闭完成。每次提交 result 前重读 snapshot，用当时 version 作为 expectedMeetingVersion，成功后再处理下一 ownership，不并发 closure command。成功后调用一次 `application.execute` 提交 `record_archive_session_result(status="closed")`，失败则提交一次 `status="failed",failureReason="SESSION_CLOSE_FAILED"`，不得保存原始异常文本。requestId 固定为 `archive:${archive.id}:${ownership.id}:${outboxItem.attempts}:${status}`；command commit 不确定时先 recover，已 closed 则跳过，已记录同一 failure 则进入下一 outbox attempt，不产生重复 fact。任一 failed 令 outbox retry且 Meeting 保持 archiving；全部 ownership closed 后最后一个 command 在同一 repository transaction 进入 archived。本步不修改通用 worker 或注入活动 route；recovery service 只调用 repository recovery 并通过已有 `MeetingOutboxWakeupV1` wake 同一 target worker，不复制关闭算法。T20 将 archive effect 接入统一 target router。

验证：
```bash
test -f plugin/src/runtime/services/meeting-archive-v1.ts
test -f plugin/tests/unit/runtime/meeting-archive-v1.spec.ts
pnpm --dir=plugin vitest run tests/unit/runtime/meeting-archive-v1.spec.ts tests/recovery/contribution-recovery.spec.ts
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

允许修改：`plugin/src/runtime/index.ts`、`plugin/tests/unit/module-boundaries.spec.ts`。

禁止修改：tools、Remote、Client、旧 application 文件。

执行：只在 `runtime/index.ts` 新增 T13 application、T15-T17 target services、`MeetingOutboxWakeupV1` 与 target `openMeetingRepository` 的公开导出，module boundary test 固定 T19b/T20 只能从该公开入口导入 target symbol。本步不改写 `application-service/index.ts`、不删除 legacy export：当前根 `src/index.ts`、Remote、tools 与 fixtures 仍在编译期依赖它们，提前移除会使 `typecheck:host` 失败。这些 legacy export 标记为 T20 原子切换前的暂时活动路径，不得被新 target registrar/router 引用；T20 将根入口、tools、Remote 和 runtime barrel 同步切换后再清除。

验证：
```bash
pnpm --dir=plugin vitest run tests/unit/module-boundaries.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：T19b/T20 可只从 target public entrypoint 导入 application/handler/wakeup；新 target consumer 不导入 legacy implementation，现有根入口仍可编译。

STOP：target consumer 仍需深路径或旧 implementation，或必须用转发 facade 维持 target 行为。

### T19b：接入 DSH tools

前置状态：T19a PASS。

允许修改：`plugin/src/protocol/meeting-command-v1.ts`、`plugin/src/protocol/index.ts`、`plugin/src/tools/register-tools.ts`、`plugin/src/tools/index.ts`、`plugin/meeting-roles/definitions.json`、`plugin/meeting-roles/README.md`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/contract/meeting-roles-deployment.spec.ts`。

禁止修改：Remote、Client、旧 application 文件。

切换边界：本步新增并导出 `registerMeetingToolsV1`，只让它登记下述八个 target tools。现有 `registerCreateAndStatusTools/registerSubmitAndControlTools` 及根入口对它们的调用保留到 T20 原子切换；它们不得进入新 registrar 的 import graph。因此下文“只登记八个”和“删除其它 legacy tool registration”的作用域只是 `registerMeetingToolsV1`；不得在本步删除根入口尚在调用的 legacy registrar。

执行：从 `meeting-command-v1.ts` 逐个导出这八个 action 的既有 Zod Schema，不复制 shape；只登记八个 agent tools：`convivium_create_meeting`（Captain），`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`（Manager），`convivium_raise_hand`、`convivium_submit_evidence`（Contributor），`convivium_submit_review_batch`（唯一 reviewer coordinator），`convivium_recommend_identity`（Manager）。create tool 从 `exec.agent` 注入可信 Captain parent 和 `caller={channel:"dsh_tool",principalId:String(exec.agent.id)}`，不设置 `sessionBindingId`；其余 tool 从 `exec.agent` 经 T14b2 resolver 得到 caller。每个 `defineTool` 的 DSH parameter 固定为唯一 `{input:{type:"json",required:true}}`；`execute` 先用 `MeetingCommandV1Schema` strip/parse `input`，再要求 action kind 精确等于该 tool，因而 envelope 只有 `protocolVersion/meetingId/expectedMeetingVersion/requestId`，action shape 只来自对应既有 Zod Schema。tool 不接受 actor/session/generated ID，把 `exec.signal` 原样传给 T13 `MeetingCommandApplicationV1.execute`。output 固定 `{schema:{type:"json"},render:(_args,value)=>[{type:"text",text:JSON.stringify(value)}]}`，domain rejection 作为 schema-valid `MeetingCommandResultV1` 返回，只有 infrastructure failure throw。使用 `ctx.tools.register` 的 fiber-owned registration，不再手工保存 disposer 或重复包 `ctx.effect`。删除其它 legacy tool registration，不把 local-only end、`close_contribution` 或 runtime-only start/result action 注册成 tool。

同步把 `meeting_manager` Definition 从 `1.1.0` 升为 `1.2.0`，并把它的 `toolFilter.allow` 精确改为 `skill`、`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`、`convivium_recommend_identity`；不得保留 legacy contribution/status tool，也不得给 Manager 暴露 Contributor、reviewer、local 或 runtime-only action。README 与 deployment contract test 同步该精确版本和 allow-list。T16 已将 reviewer Definition 升为 `1.1.0`；其余六个 Definition 的 version、职责与 toolFilter 不变。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/tool-registration.spec.ts tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：八个 tool 的 input/action mismatch、authority、Captain parent 注入、canonical output/render、cancellation、fiber disposal、公开导入和唯一 dispatcher 通过；Manager Definition `1.2.0` 只能看到四个 Manager tool 与 `skill`。

STOP：tool 需要深路径、直接调用旧 application、复制 action Schema 或提交 actor。

### T20：接入 loopback Remote 并完成 plugin target assembly

前置状态：T19b PASS。

允许修改：`plugin/src/remote/types.ts`、`plugin/src/remote/index.ts`、`plugin/src/runtime/meeting-lifecycle-v1.ts`、`plugin/src/runtime/index.ts`、`plugin/src/index.ts`、`plugin/tests/contract/remote-boundary.spec.ts`、`plugin/tests/contract/remote-generation.spec.ts`、`plugin/tests/unit/module-boundaries.spec.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`。本步为原子活动图切换，`meeting-lifecycle-v1.ts` 是 dry-run 发现的直接编译闭包，故明示超出 8 文件规划目标 1 个；不得借此扩展业务范围。

禁止修改：Client、Domain、repository。

执行：`ConviviumRemoteService` 继续继承 `TypertRemoteService`，精确只保留下列 concrete public methods：`@Remote("list") list(signal:AbortSignal):Promise<MeetingListResultV1>`、`@Remote("read") read(request:ReadMeetingRequestV1,signal:AbortSignal):Promise<MeetingReadResultV1>`、`@Remote("control") control(command:MeetingCommandV1,signal:AbortSignal):Promise<MeetingCommandResultV1>`、`@Remote({mode:"stream"}) subscribeRefresh(signal:AbortSignal):AsyncIterable<RefreshNoticeV1>`；不得手写 Typert artifact，不暴露 action-specific Remote method，不转发 agent tool action。四者只在 lifecycle 注入的 `webServer.host === "127.0.0.1"` 时注册；其它 host 使整组 target activation rejected，不注册 Remote、tools 或 worker。注册成功后调用 T13 时构造 `caller={channel:"loopback_remote",principalId:LOCAL_CONTROLLER_PRINCIPAL_ID}`，不接受 wire actor/authority/session 字段。`list` 调 T18b summary mapper；`read` 调 T18b caller=`local` mapper并由同一结果读取 archive；`control` 只允许 `end_meeting`，`create_meeting` 只由 T19b Captain tool 发起，`start_archive` 由 durable archive effect 自动执行，其它 action 返回 `UNAUTHORIZED`，允许的 write 只调用 T13 `MeetingCommandApplicationV1.execute`；所有方法向 owned operation 传递 signal。`subscribeRefresh` 只发 `{kind:"refresh",meetingId,committedVersion}`，允许丢失/重复、不携带事实，stream cancel/dispose 后必须静默。`types.ts` 只定义 JSON-safe Remote payload 与 `RemoteErrorDetailsMap` declaration merge；`ClientRemote` augmentation 只由现有 Typert generator 产生，不手写。Remote `index.ts` 只注册该 service；`runtime/index.ts` 删除 T19a 暂留的 legacy type并只导出这四方法所需的正式 `LocalMeetingWebRuntime` type。`remote-generation.spec.ts` 必须生成并断言精确四方法及 stream metadata；module boundary test 证明 compile bridge 已清除。

在 `meeting-lifecycle-v1.ts` 的 lifecycle-owned runtime factory 中同时装配唯一 T13 application 和唯一 registry；对每个 ready Meeting 恰好建立一个既有 `createOutboxWorker` 实例，不建立全局第二 worker 或每个 handler 独立 worker。该 target lifecycle 直接向 worker 的 `dispatch` 选项注入唯一纯 router：`identity_provision` 到 T15a、普通 `agent_notice` 到 T15c、`agent_notice/review_request` 与 `review_delivery` 到 T16、`archive` 到 T17，未知 payload 以 non-retryable `OUTBOX_ROUTE_UNAVAILABLE` fail closed。通用 `outbox-worker.ts` 仍只负责 claim/dispatch/complete，不引入业务 route；legacy `meeting-dispatch-service.ts` 不修改、不注入 target route。

每个 Meeting 启动 worker 前先从 repository ownership 取唯一 `parentSessionId`，并要求 `ctx.agents.get(parentSessionId)` 返回 exact live top-level Captain parent；无 live parent 时不 claim outbox，将该 Meeting 标为暂不可用，不消耗 retry attempts。lifecycle 监听公开 `agent/created`，当匹配 parent 出现时重新 `recoverMeetingCommandsV1` 并 ensure/wake 该 Meeting 的同一 worker；不自行 resume Captain 或 child。新建 Meeting 在 creation commit 后以当次可信 `captainParent` ensure worker；冷启动按 `DomainRepositoryRegistry.listMeetings()` 的稳定顺序 open/recover，不从 legacy map 发现 Meeting。

只有精确 DSH version、Storage/continuable provider、`spawn` one-shot provider 的 `outputSchema` 能力、八个 Definition 与 `webServer.host === "127.0.0.1"` 全部预检成功后，根 `src/index.ts` 才切换为注册 T19 `registerMeetingToolsV1`、四方法 Remote 和 target lifecycle，并停止调用 legacy runtime/tool/Remote factory。local 与 runtime caller adapter 必须产生 T13 固定 scope。`ctx.tools.register` 直接绑定当前 plugin fiber，Remote 由其 child plugin fiber 拥有；所有 per-Meeting worker、agent listener、registry 与 runtime disposer 由一个 activation 拥有。stopping 先拒绝新 command，等待已开始 commit，停止所有 worker 领取并 await 已开始 dispatch，再释放已证明归属的 activation。预检或装配任一步 throw 时反序释放并进入 rejected，不得留下部分 tool、Remote 或 worker registration。

验证：
```bash
pnpm --dir=plugin vitest run tests/contract/remote-boundary.spec.ts tests/contract/remote-generation.spec.ts tests/unit/module-boundaries.spec.ts tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir=plugin typecheck:host
```

PASS：loopback authority、伪造 actor、read/write DTO 和 error mapping 通过；legacy `LocalMeetingWebRuntime` 不再从 target public entrypoint 导出；一个 application、一个 registry、每个 ready Meeting 恰好一个 target outbox worker、八个 tools、一个四方法 Remote 同成同败，legacy 活动 registration 为零且 teardown 顺序通过。

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

执行：只接 `end_meeting` local control；create 由 T19b Captain tool 和 T22 smoke 覆盖，本轮不新增复杂创建表单，start_archive 由 durable archive effect 自动执行且不显示按钮。按钮是否显示只检查 projection `controls`，点击时用当前 `view.version` 构造 command、生成新的 requestId、调用 T21a `control`，无论 accepted/rejected 都重读同一 meeting；pending 时禁用重复提交。删除 pause/resume、archive、decision/risk/contribution legacy controls，不在 Client 复算结束或归档前提。

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

执行：新增 core scenario，真实完成目标链并验证八 roles、每个合格 Contributor 恰收一次初始 `meeting_started`、reviewer coordinator 一次取得至少两份 pending EvidenceVersion、为它们启动至少两个不同 one-shot worker Session并发分析、worker 无 Meeting command authority、coordinator 通过 `convivium_submit_review_batch` 一次原子提交成功子集，然后验证 review delivery、publish、partial、archive、close、cold reopen。任一 worker 失败项不得进入 batch，仍保持 pending。

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

禁止修改：其他全部文件，尤其是 fixture。

执行：只删除上述 2 个直接测试。`plugin/tests/recovery/session-recovery.spec.ts` 已在恢复执行基线 `10ef672` 前删除，不能重建或重复计数。

验证：
```bash
test "$(git diff --diff-filter=D --name-only | wc -l | tr -d ' ')" -eq 2
test "$(git diff --name-only | wc -l | tr -d ' ')" -eq 2
pnpm --dir=plugin typecheck
```

PASS：当前步骤恰好删除列出的 2 个直接测试且无其他改动；typecheck 退出 0。

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

PASS：当前步骤恰好删除列出的 4 个直接测试且无其他改动；lint/typecheck/test 退出 0；T17 target recovery test 保留；fixture 零删除、零修改。累计 31 个 plugin 文件及其分类由已提交后的 T30 验证。

STOP：总删除超过 31、分类不符、需要扩大到 retained projection pair、Domain/protocol/repository/fixture。

### T30：收口验证与 readiness

前置状态：T29 PASS。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK（最终删除）。

禁止修改：production、test、requirements/interfaces/designs。

执行：先在 readiness 记录真实闭环、已删除的 1 个 Scribe-only skill 资源、1 个冗余 command repository facade、20 个 application-side production 文件与 9 个直接测试的删除和验证；明确 DSH Storage Domain adapter 与 repository core 保留，legacy Domain/protocol、`projection/status.ts` + `projection/contribution.ts` pair、未列出的 runtime services/tests 和全部 fixtures 仍未删除。readiness 还必须把 `close_contribution` 的 Agent tool 与 target deadline scanner 标为 `Not Covered`，不得把已有 command core 测试写成外设已接通。然后运行下列累计删除、完整产品和 smoke 门禁；全部成功后按“完成定义与 RUNBOOK 删除”执行 Close 检查，删除本 RUNBOOK，并再次运行文档链接与 diff 检查。readiness 更新与 RUNBOOK 删除必须进入同一个 T30 收口提交，不产生“只删除已完成 T30”或“只删除 RUNBOOK”的独立提交。

验证：
```bash
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/' | wc -l | tr -d ' ')" -eq 31
test "$(git diff --diff-filter=D --name-only f170deb..HEAD | rg '^plugin/meeting-roles/presets/convivium/skills/referenced-minutes/SKILL\.md$' | wc -l | tr -d ' ')" -eq 1
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

PASS：累计 plugin 删除总数精确为 31，分类精确为 1 个 Scribe-only skill 资源 + 1 个 repository facade + 13+6+1 个 application-side production + 9 个 tests，且 fixture 零删除；RUNBOOK 的最终文档删除不计入该业务代码清单；其余命令全部退出 0；引用检查无输出；默认 smoke 包含 identity-admission 和 meeting-business-loop；readiness 明确 DSH Storage Domain/repository core、retained projection pair、`close_contribution` 外设入口与其它 legacy 未删除/未覆盖边界；working tree 只包含 readiness 修改和本 RUNBOOK 删除，二者进入同一提交。

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
| contribution exit core | `close_contribution` contract/unit tests 覆盖 author/deadline authority、早到拒绝、未送达 review 不得 timed_out 与原子退出；Agent tool 和 target deadline scanner 为 `Not Covered` |
| candidate reuse | pair duplicate、global provisioning conflict、cross-Agenda active reuse、provenance mismatch |
| external runtime | exact DSH Loader/Storage/Session/tools/workers/close/reopen smoke |
| full product gate | `pnpm --dir=plugin verify` + default `pnpm --dir=plugin smoke:profile` |

Not Applicable：数据库 schema migration 和旧 snapshot compatibility 明确不做；外部网络 research 不是本闭环输入；Continuation、stress、metrics 和跨 Host 不作为完成门禁。`close_contribution` 外设接线不是不适用，而是本 RUNBOOK 明确排除且必须迁移到 readiness 的 `Not Covered`。

## 失败恢复

- T11-T12 repository 测试必须使用临时 Storage domain；失败不得手工改持久数据。
- lifecycle 创建链、T15a、T15b、T15c、T16、T17 与 T22 创建、恢复、发送或关闭的 Session 必须由测试/smoke 的 `finally` 和原生 teardown 关闭；若 teardown 无法证明完成，保留临时 profile 路径和 Session ID 作为 STOP 证据，不删除不明归属 Session。
- archive cleanup 失败是业务可恢复状态：保留 `archiving`、ArchivePackage、outbox 和 ownership，不回滚 terminal/archive materialization，不创建替代 Session。
- 任一步失败都禁止 `git reset --hard`、覆盖用户改动、跳过测试或继续执行 deletion。

## 完成定义与 RUNBOOK 删除

仅在本文全部步骤都已 PASS、随对应代码提交从本文删除，且 T30 收口完成后，实施任务才完成。完成时必须同时成立：

1. real DSH 从 CreateMeeting 到 ReadArchive 闭环通过并可冷重启读取。
2. 1 个 Scribe-only skill 资源、1 个冗余 command repository facade、13 个 legacy application-service、6 个 legacy runtime application services、1 个 legacy read projection 和 9 个直接测试已删除，总删除数精确为 31；DSH Storage Domain adapter/repository core 保留，retained projection pair 与其余 legacy 文件不在目标入口的活动 import graph 中，并已登记后续清理范围。
3. target state、repository、runtime、tools/Remote/view/archive 使用同一数据和 command path。
4. readiness 已记录真实覆盖及 Non-goals。
5. 完整门禁与文档检查通过。

关闭本 RUNBOOK 时进入 `convivium-runbook` Close 模式：再次核对长期结论已在 requirements/interfaces/designs、验证事实已在 readiness；按 T30 排除本文件自身后确认没有引用；删除本文件；重新运行 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。任一关闭检查失败时立即运行 `git diff -- docs/30-designs/RUNBOOK-MEETING-RUNTIME-CUTOVER.md | git apply -R`，只恢复本步骤尚未提交的 RUNBOOK 删除，然后 STOP；不得覆盖其它改动。RUNBOOK 不以 completed/archive 文件长期保留。

## Author Audit

- 结论：`Executable`；已确认 V1 只有一个 local Host/profile namespace，`meetingId` 是唯一 Meeting identity，目标协议、repository、Session ownership 与 recovery 均无 `teamId`。Luna + medium 不需要决定 team scope、兼容 namespace 或第二 repository。
- 已固定 create identity：wire 仍为 `meetingId="new"`，真实 ID 只由 `meetingIdFor(requestId)` 生成；唯一 local Convener 的 requestId 全局唯一，同 requestId 重放定位同一 receipt，不新增 creation-binding 表。
- 已固定 DSH 持久化边界：保留 Storage Domain、`DomainRepositoryRegistry`、`DomainMeetingRepository` 和唯一 `MeetingRepositoryPort`；已删除的是冗余 command repository facade，不是 Storage Domain adapter。
- 已固定 ArchivePackage、Session closure、review worker 与 recovery：Archive 字段/顺序、reviewer coordinator 自主使用 DSH 原生 one-shot workers、每 Meeting 同一 target outbox worker recovery 和未知 ownership fail closed 均有唯一动作；runtime dispatcher 不伪装 coordinator 调用 `subagents.start`。
- 已固定 effect route 闭包：T13b 产生初始 `meeting_started`，`identity_provision` 由 T15a-T15b 处理，普通 `agent_notice` 由 T15c 处理，`review_request` 与 `review_delivery` 由 T16 处理，`archive` 由 T17 处理；T20 只装配这四类 payload route，不留给执行者选择 dispatcher。
- 已核对合并后新增的 `close_contribution`：正式 Interface、Domain、protocol、application 与 focused test 已存在；本 RUNBOOK 的最小成功链不经过提前退出，故不把它扩张为第九个 Agent tool 或 target deadline scanner，T30 必须将这两个外设入口记录为 `Not Covered`。
- 已修正 T19b 的 DSH capability 闭包：Manager 新 tool 与 `meeting_manager` Definition `1.2.0`、README 和 deployment contract test 在同一步原子更新，避免旧 `toolFilter` 令已注册 tool 对 Manager 不可见。
- 已按 8 文件规划目标收敛步骤：T11 在同一 repository transaction 边界完成 generic codec 与 facts/ownership closure；read DTO Schema 与 projection 保持分为 T18a/T18b，label/provisioning 与 caller/session adapter 保持分为 T14b/T14b2。T20 因必须在同一活动图边界切换 root/Remote/lifecycle 而有 9 个文件；第 9 个 `meeting-lifecycle-v1.ts` 是 dry-run 证实的直接编译闭包，已在步骤中显式列出，不作为扩张 Scope 的先例。
- 已对 T15c、T16、T17、T18a、T18b、T19a、T19b、T20、T21a、T21b 完成十步机械 dry-run：所有指定路径与基础 symbol 存在，且已修正 `SessionOwnership.sessionLabel`、T15-T17 handler/活动 route 分离、T16 coordinator-owned workers、T19 additive public entrypoint/registrar 以及 T20 target lifecycle 直接编译闭包。dry-run 未执行步骤验证命令，不构成任何步骤 PASS 证据。
- 已固定执行提交规则：每个步骤必须产生其要求的 production/test 行为 diff，代码、测试与该步骤删除同一提交；禁止 RUNBOOK-only commit，禁止把既有绿色测试当作完成证据，禁止未经另行授权 push 或改写历史。
- 已按合并后代码重算删除边界：累计 31 个 plugin 文件，精确为 1 个 Scribe-only skill 资源、1 个冗余 repository facade、20 个 application-side production 文件和 9 个直接测试；`session-recovery.spec.ts` 已在恢复执行基线前删除，T27 只再删除 2 个测试；不拆 retained projection pair，不删除 DSH Storage Domain adapter、repository core 或 fixture。
- 本轮恢复审计只修改 RUNBOOK，没有执行任何未完成代码步骤、`pnpm verify` 或 smoke；这些验证只能由对应步骤和 T30 形成完成证据。Author 文档门禁为 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。
