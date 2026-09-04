# RUNBOOK：Agenda Candidate 结构化处置

## 1. 状态与边界

- Audit：`Executable`
- 建立日期：2026-09-04
- 分支：`codex/agenda-candidate-disposition-runbook`
- Author 基线：`4e77bf4c4f0a1a8dd553c1282f05e45a24c86308`
- Execute 协议：一章节 → 全部验证 PASS → 删除该章节并写入下一步 SHA → 一个本地 commit。

仅实现 FR-6 Captain-only Agenda candidate disposition。执行者只可按 T0→T6 顺序修改当步 allowlist；验证全部 PASS 才能删除该步骤并创建一个本地 commit。任一指定路径、symbol、命令或断言不成立时立即 STOP，保留当前章节和现场，报告最后 PASS、失败命令/退出码/首错和修改文件；不得 reset、clean、stash、放宽 Schema/断言、寻找替代入口、push/PR、修改 sibling repository或实现 Non-goals。

## 2. 目标、依据与 Non-goals

起点：`addSubmittedAgendaCandidates` 只能创建 `pending`；协议、Runtime、Tool 无 disposition；archive 已有四字段 `parkingLot`。终点：Captain 可原子执行 `promote|park|reject`，status/archive 一致，repository replay/conflict、terminal、recovery 经验证，readiness 更新且本 RUNBOOK 删除。

当前断点：`plugin/src/domain/transitions/agenda-candidate.ts::addSubmittedAgendaCandidates` 是唯一写入入口；`plugin/src/runtime/application-service/meeting-decision.ts::createMeetingDecisionApplication` 是 Captain command 模板；`plugin/src/tools/register-tools.ts::registerCreateAndStatusTools` 是 Captain Tool 注册点；`plugin/src/protocol/status.ts::MeetingStatusResultSchema` 与 `plugin/src/projection/status.ts::projectMeetingStatus` 是公开状态边界。

依据：[Requirements FR-6](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#fr-6议题范围与发散控制)、[Protocol command mapping](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#command-result-mapping)、[Domain AgendaCandidate](./DOMAIN-MODEL-DESIGN.md#agendacandidate)、[Orchestration §6.3](./MEETING-ORCHESTRATION-DESIGN.md#63-parking-lot-and-refocus)。

Non-goals：自动切换 active agenda；Manager/Participant/local HTTP disposition；UI；CompletionFact；新 outbox/worker；migration；registry/factory/adapter/cache/queue/feature flag；Browser Loader；Developer Markdown；convergence、decision/risk、FR-13/14、Scribe、metrics、发布。

## 3. 固定契约

- 仅 Meeting Captain Session；`callerBinding=session:<captainSessionId>`，`capabilityId=captain:<captainSessionId>`。
- Input/result/event、派生 AgendaItem、错误和 projection 逐字段以 Protocol Interface 为准，不增字段；command 无 `reason`/time，event/result 不重复保存可由 action 推导的 status。
- `promote` 原子更新 candidate 并 append `${candidateId}-agenda-item`，不改 `activeAgendaItemId`；`park|reject` 只改 status。
- 只接受 `pending`；domain state 的 `eventSeq` 增加 1，成功恰好一个 `agenda_candidate.disposed`、`outbox=[]`、commit 后 Meeting version 增加 1。
- `parkingLot` 按 `createdAt,id` 排序，仅 `id/title/reason/status`；pending 不阻塞结束或自动改写。
- 复用现有 repository、receipt、request hash、idempotency、error 和 projection；不建抽象。
- 调用链固定为 `registerCreateAndStatusTools` → `MeetingToolRuntime.disposeAgendaCandidate` → `createMeetingAgendaCandidateApplication.disposeAgendaCandidate` → `MeetingRepositoryPort.execute` → domain `disposeAgendaCandidate` → commit state/event/receipt；status 与 archive 只读取已提交 state。
- 兼容性：`AgendaCandidate.status` 与 `MeetingAgendaItem` 已属于现有 MeetingState，因此不修改 state format、repository Schema 或 recovery mapper；新增 public command/status 字段仍使用 protocol version 1，并由 exact-key Schema 验证。

## 4. 机械步骤

### T0：基线与契约门禁

前置：当前分支；工作树 clean；HEAD 已包含本 RUNBOOK 与四份正式文档。允许修改：仅本 RUNBOOK（PASS 后删除 T0，并把 T1 `<T0_SHA>` 替换为提交 SHA）。禁止：`plugin/**`、其他文档。

```bash
test "$(git branch --show-current)" = codex/agenda-candidate-disposition-runbook
test -z "$(git status --porcelain --untracked-files=all)"
rg -n 'convivium_dispose_agenda_candidate|CaptainAgendaCandidateDispositionInputV1|agenda_candidate\.disposed|parkingLot' docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md docs/30-designs/DOMAIN-MODEL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
git diff --check
```

PASS：全部退出 0。STOP：任一失败，保留 T0，不修改/提交。恢复：无外部状态。

### T1：协议类型与 Schema

前置：HEAD=`<T0_SHA>`、clean、T0 已删除。允许：`plugin/src/protocol/types.ts` 新增 `CaptainAgendaCandidateDispositionInputV1`、`CaptainAgendaCandidateDispositionResultV1`；`plugin/src/protocol/commands.ts` 新增 `CaptainAgendaCandidateDispositionInputSchema`；`plugin/src/protocol/results.ts` 新增 `CaptainAgendaCandidateDispositionResultSchema`；`plugin/src/protocol/index.ts` 只导出两个 Schema；`plugin/tests/contract/protocol-schema.spec.ts` 增加固定 suite `agenda candidate disposition protocol`；本 RUNBOOK。禁止其他文件和放宽既有 Schema。

动作：逐字段实现正式接口。command 不含 `reason`。ID、AgendaItem 文本和数组成员 trim 后非空，数组成员唯一；`promote` requires `agendaItem`，另两支 forbids；result `agendaItemId` 条件相同。输入 Schema 使用 exact-key transform；结果 Schema 的导出边界沿用 `CaptainDecisionDispositionResultSchema` 的 `Schema<Record<string, unknown>>` 形式，不新增通用 helper。

```bash
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec prettier --check src/protocol tests/contract/protocol-schema.spec.ts
git diff --check
```

PASS：全部 0；stdout 中 `agenda candidate disposition protocol` 至少 6 tests passed，覆盖 extra-key、三 action、promote required/其他 action forbidden `agendaItem` 和 result 条件字段。随后删除 T1、写 T2 SHA、只提交 allowlist。STOP：首败即保留章节/diff，不提交；终止残留 vitest。

### T2：Domain transition 与事件

前置：HEAD=`<T1_SHA>`、clean、T1 已删除。允许：`plugin/src/domain/model.ts::DomainEventTypes` 只加事件；`plugin/src/domain/transitions/agenda-candidate.ts` 新增 `DisposeAgendaCandidateInput`/`disposeAgendaCandidate`；`transitions/index.ts` 导出；现有 `plugin/tests/unit/domain/transitions/agenda-candidate.spec.ts`；本 RUNBOOK。禁止其他文件。

动作：新增准确内部类型：`DisposeAgendaCandidateInput` 是 `meetingId/candidateId/actorBinding/action` 加仅 promote 分支 required 的正式 `agendaItem` payload；不含 `requestId`、`reason`、`now` 或派生字段。`disposeAgendaCandidate(state: MeetingState, input: DisposeAgendaCandidateInput): TransitionResult<MeetingState>` 验证 Meeting/candidate/pending、AgendaItem 文本、participant references、objective output/criterion ID、AgendaItem ID collision。六个失败 message 依次固定为 `dispose command targets another meeting`、`agenda candidate is missing`、`agenda candidate is not pending`、`agenda item fields are invalid`、`agenda item references are invalid`、`agenda item already exists`，均使用现有 `DomainError("INVALID_ENTITY_STATE", message)`。不得访问 clock/repository/protocol。

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/agenda-candidate.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec prettier --check src/domain tests/unit/domain/transitions/agenda-candidate.spec.ts
git diff --check
```

PASS：覆盖三 action、完整 promotion、不切 active agenda、全部拒绝零状态变化、exact event。随后删除 T2、写 T3 SHA、提交。STOP/恢复同 T1。

### T3：Runtime application 与 repository command

前置：HEAD=`<T2_SHA>`、clean、T2 已删除。允许：新建 `plugin/src/runtime/application-service/meeting-agenda-candidate.ts::MeetingAgendaCandidateApplicationOptions/createMeetingAgendaCandidateApplication`；仅接入 `plugin/src/runtime/application-service/index.ts::MeetingToolRuntime/createMeetingToolRuntime`；`plugin/tests/contract/meeting-runtime.spec.ts` 增加固定 suite `agenda candidate disposition runtime`；本 RUNBOOK。禁止 repository 文件。

动作：新增准确签名：`MeetingToolRuntime.disposeAgendaCandidate(input: CaptainAgendaCandidateDispositionInputV1, caller: MeetingToolCaller, signal: AbortSignal): Promise<ProtocolSuccessV1<CaptainAgendaCandidateDispositionResultV1> | ProtocolErrorV1>`；factory 返回 `Pick<MeetingToolRuntime, "disposeAgendaCandidate">`。依次 rehydrate、核对 stored Meeting 与 Captain Session/optional caller meetingId、调用一次 `MeetingRepositoryPort.execute`。固定 `commandKind="dispose_agenda_candidate"`、bindings、`serializeValidatedRequestV1(input)`、expected version、event、receipt、`outbox=[]`；不得调用 `options.now`。无权错误固定 `UNAUTHORIZED_CALLER/"Only the meeting Captain can dispose an agenda candidate."/false`；catch 使用 `mapCommandError(error, "INTERNAL_ERROR", "The agenda candidate could not be disposed.", { meetingId: input.meetingId }, { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" })`。

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts -t 'agenda candidate disposition runtime'
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec prettier --check src/runtime/application-service tests/contract/meeting-runtime.spec.ts
git diff --check
```

PASS：stdout 中该 suite 至少 10 tests passed：成功三 action、unauthorized/wrong meeting/version/replay/hash conflict/invalid/non-pending/terminal；拒绝前后 state/event/receipt/outbox/version 相同。随后删除 T3、写 T4 SHA、提交。STOP/恢复同 T1。

### T4：DSH Tool

前置：HEAD=`<T3_SHA>`、clean、T3 已删除。允许：`plugin/src/tools/register-tools.ts::registerCreateAndStatusTools` 及其 protocol imports；修改现有 `plugin/tests/contract/tool-registration.spec.ts` 中 `meeting tool registration` suite；本 RUNBOOK。禁止 `registerSubmitAndControlTools`、HTTP、Client、tool framework 和其他 tool。

动作：在 `registerCreateAndStatusTools` 的现有 Captain disposition registrations 后新增且只新增 `convivium_dispose_agenda_candidate`；使用 `CaptainAgendaCandidateDispositionInputSchema`，将 caller context/input/signal 原样交给 `runtime.disposeAgendaCandidate`。

```bash
pnpm --dir plugin exec vitest run tests/contract/tool-registration.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec prettier --check src/tools tests/contract/tool-registration.spec.ts
git diff --check
```

PASS：单次注册、Schema、forwarding、typed envelope 全通过。随后删除 T4、写 T5 SHA、提交。STOP/恢复同 T1。

### T5：Status、archive 与 recovery

前置：HEAD=`<T4_SHA>`、clean、T4 已删除。允许：`plugin/src/protocol/types.ts::DiscussionMeetingStatusBaseV1` 增加 required `parkingLot`；`plugin/src/protocol/status.ts::MeetingStatusResultSchema` 的 `active/terminal` Schema 复用现有私有 `archiveAgendaCandidate` 增加同一 required 数组；`plugin/src/projection/status.ts::projectMeetingStatus`；`plugin/tests/contract/protocol-schema.spec.ts`；`plugin/tests/contract/status-projection.spec.ts`；`plugin/tests/unit/runtime/archive.spec.ts`；`plugin/tests/recovery/recovery.spec.ts`；`plugin/tests/contract/http-boundary.spec.ts::statusResult` 增加 `parkingLot: []`；`plugin/tests/client/client-entry.client.spec.ts::statusResult` 增加 `parkingLot: []`；本 RUNBOOK。禁止 archive service、repository、HTTP/Client production code。

动作：discussion 增加 required `parkingLot` 固定映射/排序。现有 archive mapper 不改；若测试证明不满足即 STOP，不建第二 mapper。

```bash
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/recovery.spec.ts tests/contract/http-boundary.spec.ts tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin typecheck:client
pnpm --dir plugin exec prettier --check src/protocol/types.ts src/protocol/status.ts src/projection/status.ts tests/contract/protocol-schema.spec.ts tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/recovery/recovery.spec.ts tests/contract/http-boundary.spec.ts tests/client/client-entry.client.spec.ts
git diff --check
```

PASS：全部命令 0；discussion/archive 同值；archiving/archived 无新增顶层副本；两个既有 transport fixture 只补空数组；reopen 保留 state/event/receipt，replay 不重复。随后删除 T5、写 T6 SHA、提交。STOP/恢复同 T1。

### T6：Readiness、全验证与删除

前置：HEAD=`<T5_SHA>`、clean、T5 已删除。允许：只更新 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的 FR-6 Agenda candidate disposition 行；删除本 RUNBOOK。禁止其他文件。

先运行全部命令；PASS 后 readiness 只写实际 production/test 路径和验证，不写 DSH smoke；删除 RUNBOOK。

```bash
pnpm --dir plugin test
pnpm --dir plugin typecheck:host
pnpm --dir plugin typecheck:client
pnpm --dir plugin build
pnpm --dir plugin verify:contract
pnpm --dir plugin lint
pnpm --dir plugin exec prettier --check src tests
git diff --check
```

产品验证全部 PASS 后更新 readiness、删除 RUNBOOK，再运行：

```bash
pnpm --dir plugin exec prettier --check ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
! rg -n 'RUNBOOK-AGENDA-CANDIDATE-DISPOSITION|Agenda Candidate 结构化处置' docs --glob '*.md'
git diff --check
test -z "$(git status --porcelain --untracked-files=all | awk '$2 != "docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md" && $2 != "docs/30-designs/RUNBOOK-AGENDA-CANDIDATE-DISPOSITION.md" { print }')"
```

PASS：两组命令全部 0，readiness 只有真实证据，RUNBOOK 无残留引用；提交后工作树 clean。STOP：任一命令失败时保留 T6；若已删除 RUNBOOK则运行 `git restore --worktree -- docs/30-designs/RUNBOOK-AGENDA-CANDIDATE-DISPOSITION.md` 恢复当前 HEAD 中的 T6，不提交、不改产品代码；终止残留进程并保留现场。

## 5. 双向追踪与 Audit

| Requirement            | Contract/design                               | Production owner                    | Verification |
| ---------------------- | --------------------------------------------- | ----------------------------------- | ------------ |
| FR-6.8–10              | command/result/event + Domain AgendaCandidate | protocol、transition、Runtime、Tool | T1–T4        |
| FR-6.11                | required `parkingLot` + Orchestration §6.3    | status + existing archive           | T5           |
| atomic/replay/terminal | existing repository/error contract            | application service                 | T3/T5        |

反向检查：每个新增 symbol 只服务上表当前 requirement；没有第二 source/consumer、未来扩展点或 Non-goal 文件。

Audit：`Executable`。P0-A–P0-E 已进入正式真相源；每步固定前置、allowlist、symbol、动作、命令、PASS/STOP 和恢复。真实 DSH smoke、UI、HTTP、发布为 `Not Covered`。
