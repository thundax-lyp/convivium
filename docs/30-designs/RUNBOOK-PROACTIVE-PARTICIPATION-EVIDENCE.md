# RUNBOOK：主动参与、私有草稿格式审核与轮末公开

## 状态、起点与执行边界

- 建立日期：2026-09-16；Author 工作分支：codex/b-participation-runbook，起点 main@6175a3d。
- 审计结论：Executable，限于本文件定义的目标 MeetingState 纯领域切片。RUNBOOK 编写本身不执行代码步骤，也不授权暂存、提交、推送、PR 或合并。
- 执行工作目录：/Volumes/storage/workspace/convivium-two；只能按 T0—T8 顺序执行。正式依据发生变化、指定符号/路径不符或任一步验证失败时立即 STOP，不自行寻找替代实现。
- STOP 报告必须包含最后 PASS 步骤、触发条件、文件/符号、复现命令、实际输出和需要 Author 或用户决定的事项。拒绝时不修改源 state；执行中不得回滚用户已有修改。

## 目标、当前断点与 Scope

目标链路：running Meeting 无 open Round 时 Participant 排队申请 → Manager 开轮固定累计公开 baseline → 待处置举手逐条接纳/拒绝/暂缓 → 接纳者在原 Contribution 内私下保存草稿 → Manager 独立格式审核；驳回仅反馈缺失要素，旧稿由贡献者保存，Meeting 不建立旧 EvidencePackage/Version/Registration/Review → 获批 hash 与作者提交正文一致才登记唯一证据包 → reviewer 对当前版按固定 baseline 四维审核并向作者送达 → 作者在同一任务内文字说明补证、Manager 接纳、同样格式审核/同样提交动作产生新版本 → 退出与最终审核收口 → 单次 Round Publication。A、B 同轮材料直到 Publication 前互不可见。

起点证据：[Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#functional-coverage) 说明目标 MeetingState 类型存在、目标 Round/Contribution/Evidence 转换不存在；plugin/src/domain/meeting-state-v1.ts 含现有目标实体，但没有 opportunityRequests、formatApprovals、pendingHandRaises 的完整目标结构，Registration 仍允许旧的 needs_correction/deferred，Contribution 仍强制 reviewId 的 pendingSupplementHand。plugin/src/domain/transitions/turn-advancement.ts、speaker-attempt.ts 和 plugin/src/runtime/application-service/meeting-turn.ts 只服务 LegacyMeetingState，不是本切片入口。plugin/src/domain/index.ts 已公开 meeting-state-v1.ts 与 transitions/index.ts。

本切片允许修改目标类型、纯领域转换、相应 focused domain tests、一个完整目标聚合 fixture、转换公开入口及执行后 readiness。每个行为必须追溯到 [ER-FR-1—8](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#functional-requirements)、[Acceptance Criteria](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#acceptance-criteria)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#round-evidence-and-review)、[Domain Design](./DOMAIN-DESIGN.md#round-contribution-and-evidence)、[Meeting Design](./MEETING-DESIGN.md#evidence-round)。

Non-goals：LegacyMeetingState 替换或迁移、Runtime command pipeline、Repository codec/transaction/recovery、DSH 私有草稿实际传递与 agent_notice 实际投递、Remote/Client projection、Archive、Decision/Completion、Prompt/自动发言、额外配置/兼容层/无消费者抽象。上述链路已在正式 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md#persistence-and-effects) 与 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md#responsibilities-and-dependencies) 定义，但本切片只产生纯领域效果请求，不能报告真实会议功能可用。Meeting started 首次通知由目标 create_meeting 后续切片接线，不在本 RUNBOOK 顺手实现。

## 正式数据、输入与纯转换结果

目标聚合的唯一规范 owner 是 MeetingState。T0 要在 plugin/src/domain/meeting-state-v1.ts 按 [Domain Design](./DOMAIN-DESIGN.md#meetingstate) 补齐：

```ts
interface EvidenceOpportunityRequestV1 {
  id: OpaqueId;
  agendaId: OpaqueId;
  contributorId: OpaqueId;
  purpose: string;
  requestedAt: EpochMs;
}
interface PendingHandRaiseV1 {
  roundId: OpaqueId;
  contributorId: OpaqueId;
  purpose: string;
  raisedAt: EpochMs;
}
interface FormatApprovalV1 {
  id: OpaqueId;
  contributionId: OpaqueId;
  managerId: OpaqueId;
  evidenceHash: string;
  approvedAt: EpochMs;
}
interface SupplementHandV1 {
  purpose: string;
  raisedAt: EpochMs;
  status: "pending" | "accepted";
  acceptedAt?: EpochMs;
}
// MeetingState adds three required readonly arrays, initialized to []:
// opportunityRequests, pendingHandRaises, formatApprovals.
// ContributionV1 replaces pendingSupplementHand? with supplementHand?: SupplementHandV1.
// RegistrationV1.status becomes "complete"; missingFields becomes readonly [].
```

其余 RoundV1、EvidencePackageV1、EvidenceVersionV1、EvidenceReviewV1、ReviewDeliveryV1、PublicationV1、FormalMessageV1 的 required/optional 字段和值域必须保持当前 plugin/src/domain/meeting-state-v1.ts 与 [Domain Design](./DOMAIN-DESIGN.md#round-contribution-and-evidence) 完全一致。EvidenceVersion 的 id/ordinal/observation/interpretation/method/falsifiers/uncertainties/limitations/claims/materials/submittedAt 全必填；TextWithReason.reason 和 Material.reason 仅为 optional。EvidencePackage 的稳定 id/roundId/contributionId/authorId/agendaId/currentVersionId/versions[] 全必填。review 四维 source/credibility/completeness/support 每项 score 只能 0/1/2/3/unable_to_assess 且有非空 reason；review baseline 等于 Round.publicBaselinePublicationIds。Registration 只在批准正文进入 Meeting 时为 complete/空 missingFields。ReviewDelivery 可有多次 failed、最多一次 sent；只 sentAt 开启 60000 ms 期限。Publication 每 Round 至多一个，finalVersionIds/finalReviewIds 只引用该 Round 最终当前版。

Wire caller 只提交 MeetingActionV1 的 action 字段；actorId、Session ownership、now、ID、baseline、expectedMeetingVersion、requestId binding 均由 Runtime/adapter 验证或注入。领域函数输入中的 actorId、now、ID 和 evidenceHash 是已验证值，不从 Agent 自述读取。evidenceHash 的生产者是 Protocol/Runtime：按 [Meeting Interface 的规范算法](../20-interfaces/MEETING-INTERFACE.md#round-evidence-and-review) 重建 EvidenceInput、JSON.stringify、UTF-8 SHA-256；Domain 只比较已批准 hash 与 Runtime 提供的已核对 hash，绝不保存私有草稿。Domain 拒绝坏 ID/字段/引用时返回同一个源 state 引用。

T0 在唯一新文件 plugin/src/domain/transitions/result-v1.ts 定义并公开以下目标签名，后续函数只返回该类型，不引用 legacy TransitionResult/DomainEvent，也不引用 Protocol/DSH 类型：

```ts
type MeetingDomainErrorCodeV1 =
  | "INVALID_ARGUMENT"
  | "UNAUTHORIZED"
  | "MEETING_TERMINAL"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "PRECONDITION_FAILED"
  | "REVIEWER_CONFLICT"
  | "ROUND_NOT_CLOSABLE"
  | "LIMIT_EXCEEDED";
type MeetingDomainEffectRequestV1 =
  | {
      kind: "agent_notice";
      noticeKind:
        | "opportunity_request"
        | "opportunity_disposition"
        | "hand_request"
        | "hand_disposition"
        | "format_disposition"
        | "review_request"
        | "transcript_update";
      recipientId: OpaqueId;
      agendaId: OpaqueId;
      relatedId?: OpaqueId;
      publicMessageId?: OpaqueId;
      disposition?: "accepted" | "rejected" | "deferred";
      reason?: string;
      missingFields?: readonly string[];
    }
  | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId };
type MeetingTransitionResultV1 =
  | {
      kind: "accepted";
      state: MeetingState;
      relatedIds: readonly OpaqueId[];
      effectRequests: readonly MeetingDomainEffectRequestV1[];
    }
  | {
      kind: "rejected";
      state: MeetingState;
      relatedIds: readonly [];
      effectRequests: readonly [];
      error: {
        code: MeetingDomainErrorCodeV1;
        message: string;
        targetKind?: string;
        targetId?: OpaqueId;
      };
    };
```

每个 accepted transition 建立新 MeetingState，version 加 1、updatedAt=注入 now；相关 ID 只含此次受影响的目标事实。application 将 action kind、actor、now、relatedIds 与 resultingState 映射为 [CommittedFactRecordV1](../20-interfaces/MEETING-INTERFACE.md#persistence-and-effects)，把 effectRequests 加稳定 effect ID/committedVersion 映射为 OutboxEffectRecordV1；每次成功 commit 另外排 refresh，Publication 另排 markdown_projection。Repository 在未来 Runtime 切片中一次原子保存 nextState/facts/receipt/outbox；receipt 键为 (meetingId,principalId,requestId)，同键不同规范 payload 为 IDEMPOTENCY_CONFLICT，expected version 冲突为 VERSION_CONFLICT。上述 mapper/transaction/重启恢复均 Not Covered 于本纯领域切片，不得用旧 Runtime 结果充当证明。没有旧 V1 运行客户端，按 [Compatibility](../20-interfaces/MEETING-INTERFACE.md#compatibility-and-acceptance) 不建 legacy 兼容读写。

rejected 必须返回原 state 引用及空 relatedIds/effectRequests，application 不提交。各步骤 effectRequests 的字段固定为：T1 申请发 opportunity_request(recipientId=managerId,agendaId,relatedId=requestId)，处置发 opportunity_disposition(recipientId=contributorId,agendaId,relatedId=requestId,disposition,reason)；T3 申请发 hand_request(recipientId=managerId,agendaId,relatedId=roundId)，处置发 hand_disposition(recipientId=contributorId,agendaId,relatedId=roundId,disposition,reason)；T4 申请/处置分别发 hand_request 给 Manager、hand_disposition 给作者，relatedId=contributionId，处置含 disposition/reason；T5 格式 accepted/rejected/deferred 均发 format_disposition(recipientId=authorId,agendaId,relatedId=contributionId,disposition,reason=rationale,missingFields；accepted 的 missingFields=[]、reason 可为空)，正文登记发 review_request(recipientId=唯一指定 reviewer,agendaId,relatedId=versionId)；T6 审核完成发 review_delivery(reviewId,authorId)；T7 每条 FormalMessage 发 transcript_update(recipientId=合格闲置 contributor,agendaId,publicMessageId=messageId)。这些请求只有 ID/理由/缺失字段，不携带私有材料。空效果数组仅用于无通知消费者的转换。

Domain 错误映射固定为：非空/形状/hash/内部材料引用校验失败 → INVALID_ARGUMENT；actor 身份/角色不符 → UNAUTHORIZED；terminal/archived Meeting → MEETING_TERMINAL；目标 ID 在本 Meeting 不存在 → NOT_FOUND；Meeting/Round/Contribution 当前阶段与命令不匹配 → INVALID_STATE；重复 pending/任务占用/期限已到/无合格通知对象或 reviewer → PRECONDITION_FAILED；自审或非唯一指定 reviewer → REVIEWER_CONFLICT；isRoundClosableV1=false 的正常 publish → ROUND_NOT_CLOSABLE；计数已为 2 却请求 accepted、或 FormalMessage 数量超限 → LIMIT_EXCEEDED。相同输入同时违反多项时，先按 [Interface Error Precedence](../20-interfaces/MEETING-INTERFACE.md#results-errors-and-precedence) 的协议/ownership/终态/存在性/状态顺序判断，再按上述具体码返回；message 只说明本 caller 可见的失败目标，不含他人私有材料。Runtime 特有的 version/idempotency/storage 错误不由本纯领域结果伪造。

T1/T3/T4 的 Manager rejected/deferred disposition.reason、T6 的每个 exit.reason 均须经 trim 后非空；accepted hand 的 reason 可为空。终态 Contribution.exitReason 一律保存该非空原因，T7 的 Publication.exitReasons 按 Round.contributionIds 原顺序逐个取对应 Contribution.exitReason，不丢弃没有证据包的退出。

## 不变量与机械判断

1. open_round 固定创建瞬间全部既有 Publication ID；本轮先后提交不改变任一 review baseline。未公开 Evidence/Review 不进入另一个 contributor 的公共内容。
2. 同身份/Agenda 无 Round 时至多一条 pending opportunity；同身份/Round 至多一条 pending hand 和一个 accepted Contribution；已有未结束 Contribution/MeetingTask 的身份不得申请新的任务，补正只在原 Contribution 内申请。
3. 私有草稿格式 rejected/deferred 只改变可观察的补正阶段、回执和通知，MeetingState 不含草稿正文、旧 EvidencePackage/Version/Registration/Review；作者自己保存。补正后重新申请须非空 purpose，仍由 Manager 接纳。
4. FormatApproval 只含 64 字符小写 SHA-256 hash；作者提交匹配正文才原子消费批准、创建 EvidenceVersion + complete Registration。没有批准、错误 hash、非法 claim/material 引用均不部分写入。首次获批创建唯一包 ordinal 1/count 0；已有登记版的获接纳实质更新才 ordinal + 1/count + 1，最多两次；未登记的格式反复送审不计。
5. Manager 独立格式审核不能写 source/credibility/completeness/support；Reviewer 不得自审，必须被 active Agenda 指定，只审 current complete version + 固定 Round baseline。负面或 unable_to_assess 仍是可发布审核，不是目标完成事实。
6. failed delivery 不起时；首次 sent 的 sentAt + 60000 才是响应期限。作者明确继续只用期限内 RaiseSupplementHand 并写明 purpose，明确放弃用 CloseContribution(withdrawn)；silence 只能在持久 deadline 到期时变 timed_out。
7. Round pending hands 全已处置、每个 accepted Contribution 已终态、每个已登记 current version 有最终 Review 才 isRoundClosable。格式驳回无证据包者须明确退出/到期退出，不造空包。负面审核仍入 Publication，重复 publish 不增加 Publication/Message/seq。
8. rejected result 的 state 与源 state 引用相同、无 effectRequests/commit；MeetingTask 完成、评分、Round published 不自动创建 CompletionFact 或令 Objective satisfied。

## 机械步骤

固定选择规则：针对 active Agenda 的通知 Manager 从 identities 原顺序选择首个有 manager 角色且 agendaResponsibilityIds 包含该 Agenda 或为空的 identity；若没有则申请返回 PRECONDITION_FAILED，绝不生成不可投递 pending。每个 evidence current version 的唯一指定 reviewer 从 Agenda.requiredReviewerIds 原顺序选择首个非作者、具 evidence_reviewer 角色且 reviewResponsibilityIds 包含该 Agenda 的 identity；若没有，SubmitEvidence 原子拒绝并保留未消费批准，SubmitReview 只允许此指定身份、每版至多一个最终 Review。ID 参数均由可信 caller/adapter 注入，须为非空且在聚合内全局未使用；已存在的 referenced ID 必须确切指向本次对象。

T0 还必须在 EvidenceMaterialV1 添加三个 required 字段 `originator: string`、`sourcePublishedAt: string`、`acquiredAt: string`，顺序为 kind → originator → originalSource → sourcePublishedAt → acquiredAt → version；与 Meeting Interface 的 MaterialInput 同名字段一对一映射。不可把这些时刻拼进原始出处或定位文本。未知/不适用时保留原始作者的文字及非空 reason。`ReviewDimensionV1` 的新增字段也属于本步目标类型差异。

### T0：目标模型、结果类型与固定 fixture

前置状态：当前分支仍为 codex/b-participation-runbook，正式 requirements/interface/design 与本文件一致；plugin/src/domain/meeting-state-v1.ts、plugin/src/domain/transitions/index.ts 和 plugin/src/domain/index.ts 存在。
允许修改：plugin/src/domain/meeting-state-v1.ts；新增 plugin/src/domain/transitions/result-v1.ts、plugin/tests/fixtures/meeting-state-v1.ts；plugin/src/domain/transitions/index.ts 仅增加 result-v1.ts 的公开 export。禁止修改：LegacyMeetingState、Runtime、Protocol、Storage。

执行：按本节精确结构新增三个聚合数组/三个实体、替换 supplementHand、收窄 Registration；`ReviewDimensionV1` 另增加 required `scope: string` 与 `baselineEvidenceIds: readonly OpaqueId[]`，四维字段结构与正式 Interface 一致；其余目标字段不动。result-v1.ts 只声明本节结果/效果/错误类型。fixture 唯一函数 makeRunningMeetingStateV1(): MeetingState，采用下列固定值；没有测试 fixture 自身的用例。`createdAt/updatedAt/lifecycle.changedAt` 都为 0；`id` 为 meeting-v1，`version` 为 1，`lifecycle` 为 running/changedBy=manager-v1。`objective` 的 statement 为“核对议题 A”，requiredOutputs=[{id:output-v1,text:“形成公开证据”,status:pending}]、acceptanceCriteria=[{id:criterion-v1,text:“审核最终证据”,status:pending}]、hardConstraints=[]、acceptableRiskLevel=low。`identities` 恰为 manager-v1（roles=[manager]、agendaResponsibilityIds=[agenda-v1]、reviewResponsibilityIds=[]）、contributor-v1（roles=[contributor]、agendaResponsibilityIds=[agenda-v1]、reviewResponsibilityIds=[]）、reviewer-v1（roles=[evidence_reviewer]、agendaResponsibilityIds=[agenda-v1]、reviewResponsibilityIds=[agenda-v1]）；每条 displayName 等于 id、riskAuthority=false、required=true，optional definitionId/definitionVersion 缺省。`agenda` 恰为 {id:agenda-v1,title:“议题 A”,question:“证据是什么”,status:active,requiredOutputIds:[output-v1],requiredReviewerIds:[reviewer-v1]}，ownerId 缺省。`limits` 为 {maxFormalMessages:100,maxDurationMs:3600000,taskDeadlineMs:600000,reviewDeadlineMs:600000,responseDeadlineMs:60000}。`continuation/termination/archive` 缺省；MeetingState 其余所有 required 数组均为 []，包含新增的 opportunityRequests/pendingHandRaises/formatApprovals，optional 字段不填。

验证：

```bash
pnpm --dir plugin typecheck:host
```

PASS：退出码 0；目标类型可构造完整聚合，legacy 文件无改动。STOP：编译失败、指定原符号缺失或需修改相邻模块；报告首个 TypeScript error。恢复：无外部副作用，保留本步差异审阅。

### T1：无 open Round 的机会申请

前置状态：T0 PASS。允许修改：新增 plugin/src/domain/transitions/opportunity-v1.ts、plugin/tests/unit/domain/opportunity-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开两个新函数。禁止修改：Round、Evidence、DSH。

执行：唯一签名 requestEvidenceOpportunityV1(state, {requestId, agendaId, contributorId, purpose, now}) 和 disposeEvidenceOpportunityV1(state, {requestId, managerId, disposition, reason, now})，均返回 MeetingTransitionResultV1。前者仅 running、active Agenda、无 open Round、合格 contributor、无其他 pending request/非终态 Contribution/未结束 MeetingTask 时追加 EvidenceOpportunityRequestV1，并发 Manager 的 opportunity_request 效果请求；Session active 是 application caller 前置，不在 Domain 伪造 Session 字段。后者只允许 Manager 对 pending ID 用 rejected/deferred 移除，向原 contributor 发仅含 ID/reason 的 opportunity_disposition 请求。测试重复、其他身份任务、错误 Agenda/Manager、拒绝不建立 Round/Contribution、拒绝原子性。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/opportunity-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个退出码 0，pending 唯一且 disposal 不留下待处理项的断言成立。STOP：任一失败或必须引入第二机会事实源；报告首个失败 case。恢复：保留本步差异，不继续 T2。

### T2：开轮固定基线与申请转移

前置状态：T1 PASS。允许修改：新增 plugin/src/domain/transitions/round-v1.ts、plugin/tests/unit/domain/round-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 openRoundV1/isRoundClosableV1。禁止修改：legacy turn-advancement.ts、Runtime/Repository。

执行：唯一签名 openRoundV1(state, {roundId, agendaId, managerId, now, deadlineAt?}): MeetingTransitionResultV1 和 isRoundClosableV1(state, roundId): boolean。openRoundV1 只对 running、active Agenda、没有 open Round 接受；baseline 恰为当时 publications 按写入顺序的全部 ID。原子移除同 Agenda 的 opportunityRequests，把每条转成新 Round 的 PendingHandRaiseV1，raisedAt 保留原 requestedAt；不自动创建 Contribution。Round.deadlineAt 仅复制 caller 已验证、晚于 now 的 optional 值。isRoundClosableV1 纯读：Round 必须 open、该 Round 未处置 pendingHandRaises 为 0、全部 accepted Contribution 已终态、每个 package.currentVersionId 有 complete Registration 与该指定 reviewer 的唯一最终当前 Review 和至少一次 sent ReviewDelivery；空轮可真。测试累计而非只上一轮、两条 queued 同时转移、错 Agenda、未处置 pending/failed-only delivery 阻止收口、空轮、已 published/aborted 为 false、拒绝原引用。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/round-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0，baseline 和原子转移断言成立。STOP：失败或要从 Session/Markdown 猜 baseline；保留差异，报告 case。

### T3：待处置举手与唯一 Contribution

前置状态：T2 PASS。允许修改：新增 plugin/src/domain/transitions/hand-raise-v1.ts、plugin/tests/unit/domain/hand-raise-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 raiseHandV1/disposeHandRaiseV1。禁止修改：legacy speaker-attempt.ts、Runtime。

执行：唯一签名 raiseHandV1(state, {roundId, contributorId, purpose, now}) 和 disposeHandRaiseV1(state, {roundId, contributorId, managerId, disposition, reason, contributionId, now})，均返回 MeetingTransitionResultV1。直接举手与 T2 转来的举手使用同一 (roundId,contributorId) pending 记录；重复 pending、同轮/其他非终态 Contribution、未结束 MeetingTask 拒绝。Manager accepted 原子移除 pending、建立一个 preparing Contribution(handRaise 原目的/时间、acceptedAt=now、count=0)、ID 入 Round；rejected/deferred 只移除 pending，向申请者发 hand_disposition(reason)，不在 MeetingState 留举手/Contribution。测试 A 拒绝而 B 仍可接受、转来申请同样处置、重复/非 Manager/第二任务拒绝。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/hand-raise-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0，拒绝后无 pending/Contribution 且 B 独立推进。STOP：失败或需读取 legacy handRaises；报告 case，不继续。

### T4：原任务内文字补正申请

raiseSupplementHandV1 的 `now` 必须严格早于默认准备期限：未登记时 Contribution.acceptedAt + limits.taskDeadlineMs，已有 package 时该 package.currentVersion.submittedAt + limits.taskDeadlineMs；再与存在的 Round/适用 MeetingTask deadline 取最早值。迟到返回 PRECONDITION_FAILED，原 state 不变。送达后还须早于首次 sentAt + 60000。

前置状态：T3 PASS。允许修改：新增 plugin/src/domain/transitions/supplement-hand-v1.ts、plugin/tests/unit/domain/supplement-hand-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 raiseSupplementHandV1/disposeSupplementHandV1。禁止修改：新 Contribution、格式审核、reviewer。

执行：唯一签名 raiseSupplementHandV1(state, {contributionId, authorId, purpose, now}) 和 disposeSupplementHandV1(state, {contributionId, managerId, disposition, reason, now})，均返回 MeetingTransitionResultV1。前者只在作者原非终态 Contribution、非空具体 purpose、没有 pending/accepted hand 时建立 supplementHand.status=pending；当前已登记版 under_review 也可提出申请。若当前 Review 已 sent，`now` 必须严格小于其首次 sentAt + 60000；若 Round.deadlineAt 或该作者同 Agenda 未结束 MeetingTask.deadlineAt 存在，`now` 必须严格小于各期限，避免 deadline_handler 尚未运行时接纳迟到申请。Manager 先检查已登记 package 的 count=2：该申请不可接纳，rejected/deferred 均移除 hand 并置 supplement_rejected，即使 current version under_review。计数小于二而 current version under_review 时只能 deferred，且仅移除 hand、不退出；其他阶段可 accepted/rejected/deferred，accepted 留 status=accepted/acceptedAt，rejected 把 Contribution 置 supplement_rejected（不是 withdrawn），普通 deferred 移除 hand 但不退出。计数已为二时任何 accepted 都 LIMIT_EXCEEDED，rejected/deferred 必须反馈次数已尽。没有 package 的 format_correction 重新申请只为首份格式补正，不计次数；每次成功举手都表示作者明确继续，写入 Contribution.response=purpose；在 pending hand 未处置时不得按 silence 标 timed_out，新版本登记清除此旧 response。测试审核中暂缓、格式驳回阶段仍可举手、期限到达但 handler 尚未运行、第三次、明确拒绝/暂缓差别。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/supplement-hand-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0；同任务只一 hand、计数不在申请时增加。STOP：失败或要依赖 reviewId 才允许格式补正；报告 case。

### T5：私有草稿格式处置与同一正文提交动作

前置状态：T4 PASS。允许修改：新增 plugin/src/domain/transitions/format-evidence-v1.ts、plugin/tests/unit/domain/format-evidence-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 reviewEvidenceDraftV1/submitEvidenceV1。禁止修改：legacy save_evidence、DSH 私有草稿 transport、Protocol hash mapper。

执行：唯一签名 reviewEvidenceDraftV1(state, {contributionId, managerId, evidenceHash, disposition, missingFields, rationale, approvalId, now}) 和 submitEvidenceV1(state, {contributionId, authorId, evidence, verifiedEvidenceHash, packageId?, versionId, registrationId, now})，均返回 MeetingTransitionResultV1。前者核对 64 字符小写 hash、首份 preparing 或原 Contribution 已获接纳 supplementHand、current version 未 under_review；accepted 要求 missingFields=[]，只存/替换一个 FormatApprovalV1 hash；rejected 要求非空 missingFields、deferred 要求非空 rationale，两者删除未消费 approval/accepted hand，置 format_correction，只向作者发 format_disposition 缺失要素/理由，绝不存草稿正文或 EvidenceVersion/Registration。作者因驳回再申请时须重走 T4。

submitEvidenceV1 仅在 verifiedEvidenceHash 与未消费批准完全相同、作者身份正确、结构/claim/material 引用合法时原子消费批准；falsifiers/uncertainties/limitations/claims/materials 每项数组非空，TextWithReason.value 非空且“无”或“未知”须有非空 reason，unknown/not_applicable material 须有非空 reason，每个 claim 至少引用一个本次材料 ID。无 package 时创建唯一包/ordinal1/complete Registration、count=0；有 package 时还消费获接纳 hand，旧 version 不改、ordinal+1/currentVersionId 更新、complete Registration、count+1（不得超过 2）。两种提交都只对新 current version 向指定非作者 reviewer 发 review_request 请求；Manager 的格式处置无四维评分。测试拒绝私有旧稿不进入任何 Meeting evidence 数组、作者自行留稿不被 Domain 保存、格式重试仍 ordinal1/count0、批准 hash 不匹配原子拒绝、实质更新一次一版、第三次拒绝、缺数组/缺明示理由/未知材料 reason/claim 引用非法原子拒绝。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/format-evidence-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0；驳回无 EvidencePackage/Version/Registration/Review，获批才有一包完整登记。STOP：失败、需把草稿正文写进 Meeting/outbox、或需加第二包；报告 case。

T5 的提交前 validation 还须逐字段检查 MaterialInput.originator/originalSource/sourcePublishedAt/acquiredAt/version/locator/location/verificationConditions/limitations 非空；originator/sourcePublishedAt/acquiredAt 若为“未知”或“不适用”必须有非空 reason。失败均为 INVALID_ARGUMENT，原 state 和未消费 FormatApproval 保持不变。

T5 格式 rejected/deferred 的 rationale 还须非空；rejected 的 missingFields 须含至少一个顶层 EvidenceFieldName，rationale 写明其内部具体缺项。格式处置只发作者反馈，不创建旧材料审核/登记事实。

获批准草稿后的 submitEvidenceV1 也要重新检查 T4 的最早准备/持久期限；`now` 必须严格早于界限，过期返回 PRECONDITION_FAILED 且不消费 FormatApproval/accepted hand。新版本登记成功时 Contribution.response 清空，后续 current Review sent 才开启新响应窗口。

T5 创建的 Registration.managerId 严格取被消费 FormatApproval.managerId，createdAt/submittedAt 取同一次注入 now；EvidencePackage.authorId/contributionId/roundId/agendaId 严格从该 Contribution 及所属 Round 复制。新 ID 使用入参已验证的 packageId/versionId/registrationId；有 package 的实质更新要求 packageId 入参缺省且只能引用已有稳定 package.id，不分配第二包。

### T6：当前版审核、投递尝试与明确退出

期限判断固定为：无包准备/格式补正退出取 Contribution.acceptedAt + limits.taskDeadlineMs、存在的 Round.deadlineAt、该作者同 Agenda 未结束 MeetingTask.deadlineAt 的最早值；`now` 到达该值才允许可信 deadline_handler 使用 submission_missing。有包的 timed_out 须当前最终 Review 有首次 sent ReviewDelivery；若 Contribution.response 缺省且没有 pending/accepted supplementHand，`now >= sentAt + 60000` 才能以“送达后无明确响应”退出。若 response 已填写或已有获接纳 supplementHand、但新版本未登记，只有没有 pending Manager 处置、且 `now` 到达 currentVersion.submittedAt + limits.taskDeadlineMs 与存在的 Round/适用 Task deadline 的最早值，才能以“继续申请未完成”退出；Manager pending 不能归因于作者。failed-only delivery 不开启静默期限。reviewDeadlineMs 到期但未形成最终 Review 或 sent delivery 的包，保留待处理并由未来异常轮次切片报告/处置，本步骤不绕过 normal Publication。

前置状态：T5 PASS。允许修改：新增 plugin/src/domain/transitions/evidence-review-v1.ts、plugin/src/domain/transitions/contribution-exit-v1.ts、plugin/tests/unit/domain/evidence-review-v1.spec.ts、plugin/tests/unit/domain/contribution-exit-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 submitReviewV1/recordReviewDeliveryV1/closeContributionV1。禁止修改：格式审批、决策/完成事实、effect dispatcher。

执行：唯一签名 submitReviewV1(state, {versionId, reviewerId, reviewId, dimensions, scope, now})、recordReviewDeliveryV1(state, {reviewId, dispatcherId, deliveryId, status, failureReason?, now})、closeContributionV1(state, {contributionId, actorId, actorKind, exit, reason, now})，均返回 MeetingTransitionResultV1；actorKind 仅为 author 或 deadline_handler，前者 actorId 必为该 Contribution.contributorId 且只可 exit=withdrawn，后者须由 application 核对可信 channel 且只可 exit=timed_out|submission_missing。submitReviewV1 只允许 active Agenda requiredReviewerIds/identity reviewResponsibility 匹配、非作者、current complete version；固定 baseline 自动复制 Round，不接 caller baseline；同 reviewer/version 只一 Review，四维各自 score/scope/reason/baselineEvidenceIds 必填且 scope/reason 非空，baselineEvidenceIds 逐一属于 baseline Publication.finalVersionIds（无引用为 []）；成功发 review_delivery 请求。failed delivery 仅追加 failedAt，重试可再 failed 或 sent；首次 sent 唯一 sentAt，第二次 sent 拒绝。送达后作者明确继续已由 T4 的 raiseSupplementHandV1 记录，不增加第二动作；withdrawn 用 closeContributionV1 作者动作。timed_out 严格按本步期限段的无响应/继续未完成两种条件由 deadline_handler 提交；无证据而准备/持久期限到期为 submission_missing，未审版本不得以 close 绕过最终审核。退出时移除未消费批准/hand，保留已经登记的当前版和审核。测试自审/旧版/错误 reviewer、逐维 scope/reason/上一轮 ID、四维 negative/unable、failed 后 sent 起时、过期/他人补证申请、作者放弃与静默超时不同、无证据退出无空包。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/evidence-review-v1.spec.ts tests/unit/domain/contribution-exit-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0；旧审核不适用于新 current version，failed 不起时、sent 只一次，退出原因可区分。STOP：失败或需从 Agent 执行流量推断投递/意图；报告 case。

### T7：最终状态与单次 Round Publication

T7 的 `FormalMessageV1.body` 固定用 LF 换行、无末尾换行；以下花括号值直接取最终当前 EvidenceVersion 原文，数组按原顺序各渲染一行，资料 ID 按 claim.materialIds 原顺序用“，”连接，reasonSuffix 严格等于 reason 不存在时的空字符串、存在时的“｜原因：”+reason，不转义或代填作者内容：

```text
观察：{observation}
解释：{interpretation}
方法：{method}
主张：
- {claim.statement}｜限定：{claim.qualification}｜资料：{claim.materialIds}
反证：
- {falsifier.value}{reasonSuffix}
不确定性：
- {uncertainty.value}{reasonSuffix}
限制：
- {limitation.value}{reasonSuffix}
```

正常 publish 还须 Meeting.lifecycle.status=running、actor 有本 Agenda 的 manager 权限、`now < state.createdAt + limits.maxDurationMs`、`state.messages.length + messageIds.length <= limits.maxFormalMessages`；时长已到返回 PRECONDITION_FAILED，消息数量超限返回 LIMIT_EXCEEDED；均保留原 state，不以空 Publication 绕过限制。

前置状态：T6 PASS。允许修改：新增 plugin/src/domain/transitions/round-publication-v1.ts、plugin/tests/unit/domain/round-publication-v1.spec.ts；plugin/src/domain/transitions/index.ts 只公开 publishRoundV1。禁止修改：Repository、Markdown renderer、Decision/CompletionFact。

执行：唯一签名 publishRoundV1(state, {roundId, managerId, publicationId, messageIds: readonly OpaqueId[], now}): MeetingTransitionResultV1。先用 T2 的 isRoundClosableV1；false 返回 ROUND_NOT_CLOSABLE、原 state。true 时只建一个 PublicationV1，finalVersionIds 按 Round.contributionIds 顺序读取各有包 Contribution 的 package.currentVersionId，finalReviewIds 为对应当前版最终 Review ID，exitReasons 保留每个终态 exitReason；没有包的退出不造版本/消息。Publication.seq=max(既有 Publication.seq 与 FormalMessage.seq，空集视作 0)+1；每个最终包恰一条 FormalMessageV1，messageIds 长度必须恰等于 finalVersionIds 长度，消息 seq 从 Publication.seq+1 连续递增、kind="round_evidence"、actorId=authorId、agendaId=Round.agendaId、publicationId、relatedIds=[versionId,reviewId]。正文唯一模板依次为“观察：”+observation、“解释：”+interpretation、“方法：”+method、“主张：”+每项 statement/qualification/materialIds、“反证：”+falsifiers 的 value/reason、“不确定性：”+uncertainties 的 value/reason、“限制：”+limitations 的 value/reason，使用换行分隔；T5 已拒绝这些必备数组的空值，模板只呈现作者实际值和理由，绝不代填“无”或“未知”。资料全文通过 public EvidencePackageView 读取，不复制进第二包。Round.status=published/publicationId 设置；每条新 FormalMessage 对与 active Agenda 相关的闲置 contributor 身份生成 transcript_update effectRequest，实际 Session active 由未来 dispatcher 二次核验。空 Round 允许零消息和一个空 Publication。测试双人提交顺序交换、固定 baseline、未处置 hand/未审/未退出拒绝、负面审核公开、空轮、重复 publish 不增加 ID/seq/消息、错误 messageIds 长度原子拒绝。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/round-publication-v1.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两个命令 0；一 Round 一 Publication，同轮无提前互见，所有消息引用最终版。STOP：失败、必须把未审/私有草稿公开或需由评分推断目标完成；报告 case。

### T8：完整验证、readiness 与删除

前置状态：T0—T7 全 PASS。允许修改：docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md 只记录本纯领域实际覆盖和 Not Covered；全部门禁 PASS 且长期结论已在正式文档后，删除 docs/30-designs/RUNBOOK-PROACTIVE-PARTICIPATION-EVIDENCE.md。禁止修改：无关源码、operations/README、正式产品语义。

执行：运行固定完整门禁；readiness 写明日期、分支/worktree/commit 边界、focused 与 verify 的实际结果，只把已验证目标 Domain 行为移入已对齐，不提升 Runtime/Repository/DSH/Remote/Client。使用 rg 核对删除引用后，删除 RUNBOOK，再重复链接/diff 检查。任何失败保留或恢复 RUNBOOK，不标完成。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/opportunity-v1.spec.ts tests/unit/domain/round-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts tests/unit/domain/supplement-hand-v1.spec.ts tests/unit/domain/format-evidence-v1.spec.ts tests/unit/domain/evidence-review-v1.spec.ts tests/unit/domain/contribution-exit-v1.spec.ts tests/unit/domain/round-publication-v1.spec.ts
pnpm --dir plugin verify
plugin/node_modules/.bin/prettier docs/30-designs/RUNBOOK-PROACTIVE-PARTICIPATION-EVIDENCE.md --check
node .github/scripts/check-doc-links.mjs
git diff --check
rg -n 'RUNBOOK-PROACTIVE-PARTICIPATION-EVIDENCE|主动参与、私有草稿格式审核与轮末公开' docs AGENTS.md
```

PASS：前五命令退出码 0、focused 行为断言成立；最后 rg 只命中待删除 RUNBOOK 自身，删除后 node 链接检查与 git diff --check 再次退出 0，readiness 的 Not Covered 准确。STOP：任一门禁失败、rg 发现其他引用、readiness 将旧行为冒充目标覆盖、删除后检查失败；若已删除则恢复 RUNBOOK/引用，报告实际输出。

## 验证矩阵、失败恢复与完成定义

效果请求的 focused tests 还须断言 T1/T3/T4 申请与处置、T5 格式批准/驳回/暂缓及登记后的 review_request、T6 review_delivery、T7 每条公开消息的 transcript_update 的 kind、recipientId、agendaId、relatedId/disposition 和顺序，且 payload 不含草稿正文。真实投递仍为 Not Covered。

- 正常及 A/B 并行：T1—T3 验证独立申请/接纳，T5—T7 验证同轮固定累计 baseline、仅最终版审核/公开、顺序交换不改变审核输入。
- 非法/权限：T1—T6 验证错 Agenda/actor/Reviewer、自审、已有未结束任务、重复/第三次申请、缺字段/hash/资料引用；每次 rejected 源 state 引用不变。
- 期限与失败：T4/T6 验证审核中只暂缓、failed delivery 不起时、sent 后 60000 ms、无回复不是自愿放弃、未审版阻止正常 Publication。
- 原子与重放：T5/T7 验证格式驳回零会议证据、hash 错误零部分提交、重复 publish 零第二 Publication/Message。Runtime expected version、idempotency receipt、Repository rollback、重启恢复属于后续切片的 Not Covered，不能称测试通过。
- 外部运行：DSH 私有草稿送达、真实 owned Session active 判断、agent_notice 投递/重试、Agent 自主举手、Remote/Client 读取和 Browser/真实 profile 全为 Not Covered。本切片不修改数据库/外部 Session，失败恢复只保留已审阅文件差异，不回滚用户已有状态。

完成定义只针对目标纯领域：T0—T8 全 PASS、readiness 如实记录当前覆盖与未覆盖、正式需求/接口/设计仍一致、RUNBOOK 删除前后文档检查通过。完整产品仍须在后续 Runtime/Repository/DSH/Remote 切片按相同正式契约实施和真实验收，不能从本 RUNBOOK 的 Executable 或领域测试通过推断会议已经可用。
