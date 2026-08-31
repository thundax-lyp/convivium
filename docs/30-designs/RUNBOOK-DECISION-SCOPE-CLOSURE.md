# RUNBOOK A：最小 Decision acceptance 竖切

状态：`Executable · T1-T2 PASS · T3 in progress`
工作边界：只允许在执行者自己的 Convivium checkout 和独立任务分支中按 T1-T8 顺序执行
建立日期：2026-08-31
调查基线：`main@42a7bfb`
模式：Execute（滚动收口）；T1-T2 已完成并已提交，当前执行 T3

## 1. 执行者契约

执行者只能按 T1-T8 顺序修改每步“允许修改”的文件和 symbol。每步验证全部 PASS 后才能继续。不得改变本文给出的字段、签名、ID、事件、错误、调用顺序、测试文件或命令；不得新增 route、Client、DSH Session effect、dependency、migration、adapter、worker 或通用 abstraction。

PASS：命令退出码为 `0` 且全部断言成立。STOP：任一前置文件/symbol/命令不存在，正式真相源与本文冲突，baseline 失败，或实现需要进入 Non-goals。STOP 报告必须包含最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、原始输出和所需人工决定。

Restore：只恢复当前失败步骤由执行者新增或修改的行，使工作树回到上一 PASS 步骤；不得使用 destructive Git、stash 或覆盖用户改动。测试临时 SQLite 必须由 `afterEach` 调用 Runtime `dispose()` 后删除 temp root。

## 2. 目标、起点与链路

起点：`DecisionProposalClaimV1` 已是 optional V1 input，但 `meeting-turn.ts#submitTurn` 对非空数组返回 `UNSUPPORTED_CAPABILITY`；`MeetingState` 无 candidate；无 Captain acceptance command。Proposal、Position、transaction/receipt、caller binding、accepted-only status/archive 和恢复已存在。

终点：

```text
current Speaker submit_turn(decisionProposals)
 -> Runtime derives decision-candidate-${deliveryId}-${index + 1}
 -> addSubmittedDecisionCandidates
 -> candidate and source message in one SQLite transaction

Captain convivium_accept_decision
 -> CaptainDecisionAcceptanceInputSchema
 -> createMeetingDecisionApplication.acceptDecision
 -> repository.execute(commandKind="accept_decision")
 -> acceptDecisionCandidate
 -> accepted Decision + accepted Proposal + CompletionFact
 -> one decision.accepted event + receipt + outbox=[] + version+1
 -> accepted-only status/archive/reopen
```

## 3. Scope、Non-goals 与依据

Scope 只有 FR-7 最小人工接受竖切：提交内部 `MeetingDecisionCandidate`；Captain 明确接受；同事务生成 accepted Decision、Proposal 状态、CompletionFact、event、receipt；恢复一致；status/archive 仍只公开 accepted Decision。

Non-goals：deterministic auto-accept；candidate reject；pending/public candidate projection；Decision revoke/supersede command；risk acceptance；扩展 `end_meeting`；Web/Client/UI；AgendaCandidate disposition；Question required-review/risk evidence；remote/multi-user；storage migration；metrics/stress；Session followup/interrupt/drain。不得创建附加 RUNBOOK。

依据：[Architecture](../00-governance/ARCHITECTURE.md)、[Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-7、[Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)、[Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) 13.3、[SQLite Interface](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)、[Readiness](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

## 4. 冻结契约

### 4.1 Internal candidate

```ts
export interface MeetingDecisionCandidate {
    id: string;
    proposalId: string;
    proposalRevision: number;
    statement: string;
    rationale: string;
    proposedBy: string;
    sourceMessageId: string;
    agendaItemId: string;
    createdAt: number;
}
```

`MeetingState` 在 `proposals` 后、`decisions` 前新增 required `decisionCandidates: MeetingDecisionCandidate[]`。新 Meeting 初始化 `[]`；历史 `state_json` 缺字段时 `normalizeMeetingState` 补 `[]`。candidate 永不删除、改写或公开。

Runtime 按 claim 顺序生成：`id=decision-candidate-${deliveryId}-${index + 1}`；`proposalId/proposalRevision/statement/rationale` 来自 claim；`proposedBy` 来自真实 Participant caller；`sourceMessageId=message-${deliveryId}`；`agendaItemId` 来自 submission；`createdAt=commandNow`。不得增加其他字段。

### 4.2 Captain command

```ts
export interface CaptainDecisionAcceptanceInputV1 {
    protocolVersion: 1;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    decisionCandidateId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface CaptainDecisionAcceptanceResultV1 {
    requestId: string;
    decisionCandidateId: string;
    decisionId: string;
    proposalId: string;
    proposalRevision: number;
    completionFactId: string;
}
```

Tool 固定为 `convivium_accept_decision`；`commandKind="accept_decision"`；hash 为 `JSON.stringify(input)`；authorization 为 `callerBinding=session:${caller.sessionId}`、`capabilityId=captain:${caller.sessionId}`。Schema 只含上述七字段；version 为 const `1`；ID/reason 为 non-empty string；version 为 required number；evidence 为 required string array。transition 再拒绝 trim 后空值和重复 evidence。

### 4.3 Pure transition

```ts
export interface AcceptDecisionCandidateContext {
    meetingId: string;
    decisionCandidateId: string;
    actorBinding: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    now: number;
}
export function acceptDecisionCandidate(
    state: MeetingState,
    context: AcceptDecisionCandidateContext
): TransitionResult<MeetingState>;
```

验证顺序固定：meeting ID；terminal/archiving/archived 为 `IMMUTABLE_MEETING`；reason/evidence non-empty 且 evidence 无重复；candidate 存在且 source message 属于 transcript、`message.speaker === candidate.proposedBy`；Proposal 的 id/revision/agenda 匹配且不是 `superseded`；agenda 存在；当前 revision 至少一个 `support|accept`；不存在 blocking `object|needs_revision`；所有 evidence 属于 transcript；目标 Decision/CompletionFact ID 尚不存在。除 terminal 外失败均抛 `INVALID_ENTITY_STATE`。

成功固定为：

- append `MeetingDecision`：`id=decision-${candidate.id}`、candidate proposal/revision/agenda/statement/rationale、`status="accepted"`；
- `acceptedBy` 为当前 revision `support|accept` Position participant ID，按 positions 顺序去重；
- `dissentingPositionIds` 为同 revision 非阻塞 `object|needs_revision|abstain` Position ID，保持顺序；
- 只把匹配 revision Proposal 改为 `accepted`；
- append `CompletionFact`：`id=completion-${candidate.id}-acceptance`、`kind="decision_acceptance"`、`subjectId=decisionId`、`assertedBy=context.actorBinding`、`authority="captain"`、`result="accepted"`、`status="active"`、复制 evidence、`taskIds=[]`、trimmed reason、`createdAt=context.now`；
- 唯一 event 为 `decision.accepted`，payload 精确 `{ candidateId, decisionId, proposalId, proposalRevision, actorBinding }`。

### 4.4 Errors、atomicity、projection

| 场景 | public code | retryable | 副作用 |
| --- | --- | --- | --- |
| wrong caller/session/meeting 或不可见 Meeting | `UNAUTHORIZED_CALLER` | false | zero |
| stale version | `VERSION_CONFLICT` | true | zero |
| same key/different hash | `IDEMPOTENCY_CONFLICT` | false | zero |
| missing/stale candidate、无支持、blocking、invalid evidence/reason/reference | `INVALID_ARGUMENT` | false | zero |
| terminal/archiving/archived | `IMMUTABLE_MEETING` | false | zero |
| unknown failure | `INTERNAL_ERROR` | true | zero |

相同 key/hash/authorization replay 返回原 receipt，不进入 transition。成功 transaction 原子提交 state、唯一 event、receipt、`outbox=[]`，version 只 `+1`；失败全部零副作用。status/archive 只映射 accepted Decisions；candidate 不进入 protocol/status/archive/continuation/Client。SQLite `state_json` 是 canonical owner；不新增 table/migration。

### 4.5 Runtime application signature

```ts
export interface MeetingDecisionApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingDecisionApplication(
    dependencies: MeetingDecisionApplicationOptions
): Pick<MeetingToolRuntime, "acceptDecision">;
```

`acceptDecision` 传给 transition 的 `actorBinding` 固定为 `captain:${caller.sessionId}`；repository authorization 的 `callerBinding` 仍为 `session:${caller.sessionId}`。两者职责不同，不得互换。

## 5. 不变量与文件映射

1. candidate 只能随合法 Speaker `submit_turn` 和 source message 同事务产生。
2. Captain acceptance 不接受风险、不结束 Meeting、不产生 Session/DSH event。
3. Position 不跨 revision；source/evidence message 必须属于 Meeting。
4. Decision/Fact/Proposal/event/receipt/version 原子；candidate internal-only。
5. V1 optional `decisionProposals` 保持 additive compatibility。

| 责任 | 文件与 symbol |
| --- | --- |
| contract/design | `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`；`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md#13.3` |
| model/recovery | `plugin/src/domain/model.ts`；`domain/create.ts#createMeetingState`；`repository/index.ts#normalizeMeetingState` |
| submit | `domain/transitions/types.ts`；新增 `decision-candidate.ts#addSubmittedDecisionCandidates`；`speaker-submission.ts`；`meeting-turn.ts#submitTurn` |
| accept | 新增 `domain/transitions/decision-acceptance.ts#acceptDecisionCandidate` |
| protocol | `protocol/types.ts`、`commands.ts`、`results.ts`、`index.ts` |
| Runtime/Tool | 新增 `runtime/application-service/meeting-decision.ts#createMeetingDecisionApplication`；`application-service/index.ts`；`tools/register-tools.ts` |
| projection/archive | `projection/status.ts#projectMeetingStatus`；`runtime/services/meeting-archive-service.ts#materializeArchivePackage` |

## 6. 机械步骤

### T3：submit candidate transition

前置状态：T2 PASS。
允许修改：`plugin/src/domain/transitions/types.ts`、新增 `plugin/src/domain/transitions/decision-candidate.ts`、`plugin/src/domain/transitions/speaker-submission.ts`、`plugin/src/domain/transitions/index.ts`、`plugin/src/runtime/application-service/meeting-turn.ts`、新增 `plugin/tests/unit/domain/transitions/decision-candidate.spec.ts`、`plugin/tests/unit/domain/transitions/speaker-submission.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。
禁止修改：Captain/Tool/projection/archive。
执行：新增 `SubmittedDecisionCandidateInput`，字段精确为 `id/proposalId/proposalRevision/statement/rationale/sourceMessageId/agendaItemId/createdAt`，以及 optional readonly context array；实现 `addSubmittedDecisionCandidates(state: MeetingState, participantId: string, agendaItemId: string, sourceMessageId: string, candidates: readonly SubmittedDecisionCandidateInput[]): TransitionResult<MeetingState>`，验证 participant、active agenda、source message、non-empty text、unique ID、current Proposal revision/agenda，成功 append 且 events `[]`；在 proposal/position/agenda-candidate 后、completion 前调用；删除 Runtime fail-closed guard，按 4.1 derive input。测试字段来源、顺序、原子非法数组、replay/hash conflict。
验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/decision-candidate.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck
```
PASS：命令全 `0`，candidate/message/receipt 同 commit。STOP：需要 event/outbox/table或改变 submit result。Restore：删除新增文件/export/call并恢复 guard。

### T4：Captain accept pure transition

前置状态：T3 PASS。
允许修改：新增 `plugin/src/domain/transitions/decision-acceptance.ts`、`plugin/src/domain/transitions/index.ts`、新增 `plugin/tests/unit/domain/transitions/decision-acceptance.spec.ts`、`plugin/tests/unit/domain/transitions/fixtures.ts`。
禁止修改：Runtime/Tool/repository/projection/archive。
执行：逐字实现 4.3；不得调用 completion judge、termination、risk 或 Session code。测试完整 success state/event，以及 terminal、missing/stale candidate、source、agenda、support、blocking、evidence、duplicate ID；每个 failure 后输入 state 深相等。
验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/decision-acceptance.spec.ts
pnpm --dir plugin typecheck
```
PASS：命令全 `0`。STOP：需选择未规定语义。Restore：删除 transition/test/export/fixture additions。

### T5：Runtime 与 Tool

前置状态：T4 PASS。
允许修改：新增 `plugin/src/runtime/application-service/meeting-decision.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/src/tools/register-tools.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/unit/index-inject.spec.ts`。
禁止修改：HTTP/Client/DSH adapter/repository/projection/archive。
执行：按 4.5 新增 application；先 rehydrate，再做与 `endMeeting` 相同 Captain session/meeting binding；按 4.2 repository.execute，单次取 now，只调用 pure transition，传入 4.5 actor binding，result 为 4.2，events 透传，outbox `[]`；Runtime 增加 `acceptDecision(input: CaptainDecisionAcceptanceInputV1, caller: MeetingToolCaller, signal: AbortSignal): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>` 并组合 application；在 dispose-risk Tool 后注册新 Tool，复用现有 tool envelope/execute/caller resolver。error mapping 严格按 4.4；unknown 若共享 helper不能 retryable true，只在新 application 显式 `failure("INTERNAL_ERROR",...,true)`。测试 success rows/version、replay、hash conflict、stale version、wrong caller/session/meeting、candidate/support/blocking/evidence、每个 terminal、transaction throw 零副作用，以及 Tool 唯一注册/Schema/caller/result。
验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/index-inject.spec.ts
pnpm --dir plugin typecheck
```
PASS：命令全 `0`，无 HTTP/Client/Session effect。STOP：需要新 DSH API/route/outbox/dependency。Restore：删除 application/method/Tool/tests。

### T6：status、archive、recovery

前置状态：T5 PASS。
允许修改：`plugin/src/projection/status.ts`、`plugin/src/runtime/services/meeting-archive-service.ts`、`plugin/tests/contract/status-projection.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`、`plugin/tests/recovery/recovery.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。
禁止修改：public DTO/Client/continuation/repository schema。
执行：production mapper 已 accepted-only 时只加 `decisionCandidates internal-only` 邻接注释；tests 断言 candidate/key/ID 不在 status/archive 而 accepted Decision 在；持久化 candidate 后 close/reopen 字段一致，accept 后再 close/reopen 的 Decision/Proposal/Fact/candidate/event/receipt/version 不漂移；历史缺字段为 `[]`。
验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/recovery.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck
```
PASS：命令全 `0`。STOP：需要 public candidate/migration/continuation 语义。Restore：删除 comments/tests；若需改 mapper 则恢复并 STOP。

### T7：focused 与 full verify

前置状态：T1-T6 PASS。
允许修改：只可在 T1-T6 已列文件修正其直接 format/type/test error。
禁止修改：新行为和 Non-goals。
执行与验证：
```bash
pnpm --dir plugin verify:environment
pnpm --dir plugin verify:contract
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts tests/unit/domain/transitions/decision-candidate.spec.ts tests/unit/domain/transitions/decision-acceptance.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/recovery.spec.ts
pnpm --dir plugin verify
git diff --check
```
PASS：五命令全 `0`，覆盖 submit/accept/authority/terminal/idempotency/atomicity/projection/archive/recovery。STOP：缺依赖、contract drift、baseline failure、需放宽 assertion/Schema/error。Restore：保留上一 PASS 并报告。

真实 DSH profile：`Not Applicable`。本竖切只复用既有 `ctx.tools.register(defineTool(...))`、caller binding 和 repository transaction，不改变 provider、Session lifecycle、Client、route、bundle/profile 或 DSH event；Tool contract + full verify 是最窄验证。

### T8：readiness 与删除

前置状态：T7 全 PASS，已记录 HEAD、Node/pnpm/DSH、命令和 counts。
允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、删除本文、以及 `rg` 证明只指向本文的引用行。
禁止修改：其他正式文档、TODO、operations、代码。
执行：readiness 只把 FR-7 标为“最小 Captain Decision acceptance 已实现”，记录 internal candidate、accepted-only、矩阵和证据；Not Covered 保留全部 Non-goals。分类引用后删除纯指针，再删除本文。
验证：
```bash
rg -n "RUNBOOK-DECISION-SCOPE-CLOSURE|RUNBOOK A：最小 Decision acceptance 竖切" .
find docs -name '*.md' -print0 | xargs -0 perl -ne 'while (/\[[^]]+\]\((\.\.?\/[^)#]+)(?:#[^)]+)?\)/g) { print "$ARGV\t$1\n" }' | while IFS=$'\t' read -r source target; do test -e "$(dirname "$source")/$target" || { echo "BROKEN $source -> $target"; exit 1; }; done
git diff --check
```
PASS：删除后第一条退出 `1` 无输出，后两条 `0`，Not Covered 完整。STOP：验证失败或引用用途不唯一；恢复本文/对应引用。Restore：用执行前保存内容恢复本文，不触碰其他改动。

## 7. 验证矩阵与追踪

| Scope/风险 | 步骤 | focused/full |
| --- | --- | --- |
| command/DTO/error | T1-T2 | protocol-schema / contract / verify |
| candidate/message atomicity | T3 | candidate/speaker/runtime / verify |
| acceptance/Position/dissent | T4-T5 | transition/runtime/tool / verify |
| authority/version/idempotency/terminal | T5 | runtime row assertions / verify |
| state/event/receipt/outbox atomicity | T4-T5 | failure matrix / verify |
| accepted-only status/archive | T6 | status/archive / verify |
| reopen/history default | T2/T6 | repository/recovery / verify |
| readiness/deletion | T8 | links/diff check |

每步只服务 Scope；没有步骤进入 Non-goals。

## 8. Author 全量 Audit

结论：`Executable`。

- Required Structure、scope、链路、数据、文件/symbol、步骤、验证、迁移和删除齐全。
- 用户已冻结 candidate、command、authority、Position/dissent、event/receipt/outbox、errors、projection/archive 和 Non-goals，无剩余产品/接口选择。
- Implementation Economy：只新增两个 pure transition 和一个 Captain application，分别对应 submit、domain acceptance、authorization/transaction 边界；无 adapter/worker/dependency/migration/route/UI。
- Weak-LLM dry-run：T1-T8 均有精确文件、动作、命令、PASS、STOP、Restore，且每一步只有一个允许实现。
- V1 optional input additive；历史 state 补 `[]`；candidate internal-only；accepted-only 不变。
- 只有 focused/full verify 全 PASS 后才能迁移 readiness 并删除；Not Covered 必须保留。
- 本轮只 Author + Audit，未执行产品测试；交付前只运行链接检查、禁词检查和 `git diff --check`。
