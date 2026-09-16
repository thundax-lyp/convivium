# RUNBOOK：PrivateMail 纯 Domain 生命周期与 Serial Gate

状态：Author/Audit，审计结论 `Executable`。作者分支为
`codex/private-mail-domain-runbook`，共同代码基线为
`c2fd076afcd1303cba1a01e832516b1dde12b428`，建立日期：2026-09-16。作者已在同一
工作边界内把 PrivateMail 的 actor、deadline、公开引用、上下文前缀、状态字段和双向
serial gate 固定到正式 Requirements、Interface、Domain Design 与 Meeting Design；
执行者只消费这些冻结定义，不再修改它们。本文件不授权 commit、push、创建 PR、合并
或外部写操作。

## 执行者契约

执行者必须按 T0→T7 顺序执行。T1、T2、T4 先加入本步规定的最小 API stub，再写测试并
观察断言因 stub 的错误行为而 RED；T3、T5 没有新增 API，先写目标行为测试并观察现有实现
产生规定 RED，再修改既有 symbol。新 symbol 不存在导致的编译失败不能单独算 RED。只有
RED 与本步规定的错误实现相符时才实现 GREEN。每步只修改“允许修改”列出的文件，不得
创建替代入口、通用 mail framework、第二份 `MeetingState`、测试专用生产 API、新配置、
新依赖或 legacy 兼容层。

所有拒绝必须保持原 `state` 引用，`relatedIds=[]`、`effectRequests=[]`。所有成功必须只使
`version + 1`、`updatedAt=now`，只修改本动作规定的 `privateMails` 或 T3 明确允许的
Contribution 创建路径，并保持其它集合值等价。PASS 同时要求命令退出码为 0 和本步列出
的可观察断言成立。

STOP 时立即停止，不执行后续步骤；报告最后 PASS 步骤、触发条件、相关文件与 symbol、
最小复现命令、实际输出和继续所需的人工决定。不得通过放宽 Schema、删除断言、类型
强转、复制 `plugin/src/repository/domain/domain-meeting-repository-mail.ts` 的 legacy
模型、修改正式文档或进入 Non-goals 继续。已有用户改动不得回滚。

T0 允许本 Author 阶段形成的四份正式文档和本 RUNBOOK 处于未提交状态；若存在任何
源码、测试、配置或范围外文档改动，必须 STOP。执行开始后，若正式依据、下列路径或
symbol 与本文件不一致，必须 STOP，不得自行寻找替代入口。

## 目标、起点与终点

验收目标：按当前正式 Requirements、Meeting Interface、Domain Design 与 Meeting
Design，实现 `PrivateMail` 的 `queued → processing → completed|timed_out|cancelled`
纯领域闭环；以反例证明公开上下文前缀固定、deadline 确定、actor 权限、终态不可变以及
mail processing 与非终态 Contribution 的双向 serial gate，并为 send 产生唯一最小
`session_mail` effect request；不接入 Runtime、Repository、outbox、Session delivery、
Remote 或 Client。

当前起点：

- `plugin/src/domain/meeting-state-v1.ts::PrivateMailV1` 已声明完整字段和值域，
  `MeetingState.privateMails` 已存在。
- `plugin/src/domain/meeting-state-v1-validation.ts::validateMeetingStateV1` 已校验 mail
  shape、sender/recipient/agenda 和 Publication context 的基本引用，但未校验公开
  `relatedIds`、deadline 等式、上下文前缀、状态字段组合、单 recipient processing 唯一性
  或 Contribution serial gate。
- `plugin/src/domain/transitions/` 尚无目标 `private-mail-v1.ts`；五个 action 没有目标
  `MeetingState` transition 或 focused suite。
- `plugin/src/domain/transitions/result-v1.ts::MeetingDomainEffectRequestV1` 尚未包含
  Interface 已定义的 `session_mail` effect request。
- `plugin/src/domain/transitions/hand-raise-v1.ts::disposeHandRaiseV1` 的 accepted 分支会
  直接创建 `preparing` Contribution，尚未拒绝正在处理 mail 的 contributor。
- `plugin/src/repository/domain/private-mail-validation.ts`、
  `domain-meeting-repository-mail.ts` 和 `plugin/src/repository/types.ts::PrivateMeetingMail`
  属于 legacy Repository 模型，字段、status 与提交边界均不是目标实现入口。
- `plugin/src/runtime/application-service/meeting-mail.ts` 明确返回
  `UNSUPPORTED_CAPABILITY`；本 RUNBOOK 不改变该事实。
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 将 PrivateMail 标为目标实现未具备。

预期终点：新文件 `plugin/src/domain/transitions/private-mail-v1.ts` 是五个 mail transition
的唯一纯 Domain 实现；`result-v1.ts` 只增加最小 `session_mail` effect request union
成员；`disposeHandRaiseV1` 只增加反向 gate；目标 validator 能拒绝不可能由合法 transition
产生的 mail snapshot；`transitions/index.ts` 具名公开五个函数和五个 input type；focused
tests、完整 `verify`、文档门禁通过；readiness 只声明纯 Domain 覆盖；长期结论迁移后删除本
RUNBOOK。

## Scope 与 Non-goals

| Scope                                                      | 实现步骤 | 直接验证                                 |
| ---------------------------------------------------------- | -------- | ---------------------------------------- |
| `send_private_mail`、发送上下文/deadline 与 effect request | T1       | `private-mail-v1.spec.ts` send cases     |
| `start_private_mail` 与正向 serial gate                    | T2       | 同文件 start cases                       |
| Contribution accepted 的反向 serial gate                   | T3       | `hand-raise-v1.spec.ts`                  |
| complete/cancel/expire 与释放 gate                         | T4       | `private-mail-v1.spec.ts` terminal cases |
| snapshot mail 不变量                                       | T5       | `meeting-state-v1-validation.spec.ts`    |
| 公开导出和完整代码验证                                     | T6       | focused/lint/typecheck/verify            |
| readiness 迁移与 RUNBOOK 删除                              | T7       | links/diff/focused                       |

Non-goals：Runtime command envelope、caller binding 解析、request receipt、idempotency、
Repository 原子 commit、outbox/effect dispatcher 实现、真实 Agent mail delivery、Session
ownership、MeetingTask、PrivateMail view/filter、Remote/Client/Markdown、归档/恢复、旧
`PrivateMeetingMail` 兼容或迁移、mail reply/body 生成、FormalMessage/Decision/
CompletionFact 创建、配置项或第二个 mail timeout。不得修改 Protocol、Repository、Runtime、
tools、projection、remote、client、DSH adapter 或 smoke。

## 正式依据与追踪

- [Meeting Orchestration Requirements § MO-FR-10](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#mo-fr-10会议记录隐私与归档)：受控私聊、公开上下文、actor、deadline 和双向 gate。
- [Meeting Orchestration Requirements § BR-9](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#br-9会议私聊边界) 与 Acceptance Criteria 21—24：私有边界、上下文稳定、串行占用和超时。
- [Meeting Interface § Deliberation, outcome, task and mail](../20-interfaces/MEETING-INTERFACE.md#deliberation-outcome-task-and-mail)：五个 action、派生字段、角色/lifecycle、错误与状态变化。
- [Meeting Interface § Results, Errors And Precedence](../20-interfaces/MEETING-INTERFACE.md#results-errors-and-precedence)：拒绝码与检查优先级。
- [Domain Design § Publication, Outcome And Termination](./DOMAIN-DESIGN.md#publication-outcome-and-termination)：`PrivateMail` 字段、前缀、deadline、状态字段组合与 serial invariant。
- [Meeting Design § Planning, tasks and mail](./MEETING-DESIGN.md#planning-tasks-and-mail)：五个 transition 的唯一 actor、前提与成功结果。
- [Architecture § Dependency Rules](../00-governance/ARCHITECTURE.md#dependency-rules) 与 [Public Module Entrypoints](../00-governance/ARCHITECTURE.md#public-module-entrypoints)：Domain 纯度与导出边界。

追踪终点固定为：上述 requirement/acceptance → Interface action → Domain Design entity/invariant
→ `plugin/src/domain/transitions/private-mail-v1.ts` 与
`hand-raise-v1.ts::disposeHandRaiseV1` → 两个 focused transition suite 与 validator suite →
`pnpm --dir plugin verify` → `CURRENT-IMPLEMENTATION-COVERAGE.md`。

## 精确数据、API 与所有权

### 目标对象与字段规则

不得修改 `PrivateMailV1` 或 `MeetingLimitsV1` 的字段、optional 性和枚举。目标 mail 精确为：

```ts
interface PrivateMailV1 {
  id: OpaqueId;
  senderId: OpaqueId;
  recipientId: OpaqueId;
  agendaId?: OpaqueId;
  body: string;
  relatedIds: readonly OpaqueId[];
  sendContextPublicationUpperBound: readonly OpaqueId[];
  processingContextPublicationUpperBound?: readonly OpaqueId[];
  status: "queued" | "processing" | "completed" | "timed_out" | "cancelled";
  deadlineAt: EpochMs;
  createdAt: EpochMs;
  processingStartedAt?: EpochMs;
  completedAt?: EpochMs;
  failureReason?: string;
}
```

`id` 和所有文本 trim 后非空；`now` 是非负 safe integer；数组保留写入顺序。
`relatedIds` 必须非空、无重复，且每项属于当前 `Publication.id` 或 `FormalMessage.id` 的
并集。sender/recipient 是不同的现存 identity；optional `agendaId` 缺席时省略 key，不写
`undefined`。

发送时 `sendContextPublicationUpperBound=state.publications.map(item => item.id)`，
`createdAt=now`，`deadlineAt=now+state.limits.taskDeadlineMs`。该加法结果必须是 safe
integer；`taskDeadlineMs=0` 合法，但形成只能 expire、不能 start/complete 的即时 deadline。
开始处理时 `processingContextPublicationUpperBound` 等于开始前的全部当前 Publication ID，
必须以发送数组为逐项相同前缀；`createdAt <= processingStartedAt < deadlineAt`。之后所有
动作保留两个数组与 deadline。`completedAt >= createdAt`，存在 processing start 时还须
`completedAt >= processingStartedAt`；`completed` 要求 `completedAt < deadlineAt`，
`timed_out` 要求 `completedAt >= deadlineAt`，`cancelled` 不增加 deadline 顺序要求。

字段组合固定为：

| status                                  | 必须存在                                               | 必须不存在                                        |
| --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `queued`                                | 基础字段                                               | processing 两字段、`completedAt`、`failureReason` |
| `processing`                            | processing 两字段                                      | `completedAt`、`failureReason`                    |
| `completed`                             | processing 两字段、`completedAt`                       | `failureReason`                                   |
| `timed_out\|cancelled`（从 queued）     | `completedAt`、非空 `failureReason`                    | processing 两字段                                 |
| `timed_out\|cancelled`（从 processing） | processing 两字段、`completedAt`、非空 `failureReason` | 无额外 optional 字段                              |

同一 `recipientId` 至多一条 `processing` mail；该 recipient 不得同时拥有非终态
Contribution。Contribution 终态集合固定为 `withdrawn|submission_missing|timed_out|
supplement_rejected|closed`，其它 status 均为非终态。

validator 的首个失败 path 固定如下；`i` 是按数组顺序遇到的第一条非法 mail，`j` 是第一
个非法引用或前缀元素：

| 不变量                                                       | path                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| sender 与 recipient 相同                                     | `$.privateMails[i].recipientId`                                                            |
| `relatedIds` 为空                                            | `$.privateMails[i].relatedIds`                                                             |
| `relatedIds[j]` 不是公开 Publication/Message                 | `$.privateMails[i].relatedIds[j]`                                                          |
| send context 不是当前 Publication 前缀                       | `$.privateMails[i].sendContextPublicationUpperBound[j]`；缺少可定位元素时用数组 path       |
| processing context 不含 send 前缀或不是当前 Publication 前缀 | `$.privateMails[i].processingContextPublicationUpperBound[j]`；缺少可定位元素时用数组 path |
| deadline 等式/安全整数失败                                   | `$.privateMails[i].deadlineAt`                                                             |
| processing time 顺序失败                                     | `$.privateMails[i].processingStartedAt`                                                    |
| completion time 顺序失败                                     | `$.privateMails[i].completedAt`                                                            |
| status 缺少或多出 optional 字段                              | 按下述固定字段顺序返回对应 optional 字段 path                                              |
| 同 recipient 第二条 processing mail                          | `$.privateMails[i].recipientId`                                                            |
| processing recipient 有非终态 Contribution                   | `$.privateMails[i].recipientId`                                                            |

status 字段检查顺序固定为：`queued` 依次禁止 processing context、processing start、
completion、failure；`processing` 依次要求 processing context、processing start，再禁止
completion、failure；`completed` 依次要求 processing context、processing start、completion，
再禁止 failure；`timed_out|cancelled` 依次要求 completion、failure，再要求两个 processing
字段同时存在或同时缺席，只有一项存在时返回另一项的 path。每个 test case 只破坏一个
不变量，不用多重损坏测试锁定跨类别检查顺序。

### 唯一新增文件与签名

只新增 `plugin/src/domain/transitions/private-mail-v1.ts`，并精确导出：

```ts
export interface SendPrivateMailInputV1 {
  mailId: OpaqueId;
  senderId: OpaqueId;
  recipientId: OpaqueId;
  agendaId?: OpaqueId;
  body: string;
  relatedIds: readonly OpaqueId[];
  now: EpochMs;
}
export interface StartPrivateMailInputV1 {
  mailId: OpaqueId;
  actorKind: "effect_dispatcher";
  now: EpochMs;
}
export interface CompletePrivateMailInputV1 {
  mailId: OpaqueId;
  recipientId: OpaqueId;
  now: EpochMs;
}
export interface CancelPrivateMailInputV1 {
  mailId: OpaqueId;
  senderId: OpaqueId;
  reason: string;
  now: EpochMs;
}
export interface ExpirePrivateMailInputV1 {
  mailId: OpaqueId;
  actorKind: "deadline_handler";
  reason: string;
  now: EpochMs;
}

export function sendPrivateMailV1(
  state: MeetingState,
  input: SendPrivateMailInputV1,
): MeetingTransitionResultV1;
export function startPrivateMailV1(
  state: MeetingState,
  input: StartPrivateMailInputV1,
): MeetingTransitionResultV1;
export function completePrivateMailV1(
  state: MeetingState,
  input: CompletePrivateMailInputV1,
): MeetingTransitionResultV1;
export function cancelPrivateMailV1(
  state: MeetingState,
  input: CancelPrivateMailInputV1,
): MeetingTransitionResultV1;
export function expirePrivateMailV1(
  state: MeetingState,
  input: ExpirePrivateMailInputV1,
): MeetingTransitionResultV1;
```

不得导出 helper、schema、terminal set 或 actor abstraction。canonical owner 是
`MeetingState.privateMails`；application 将来负责从可信通道注入 actor/system kind、ID 与
时间，本切片不实现 application。

`plugin/src/domain/transitions/result-v1.ts::MeetingDomainEffectRequestV1` 只新增下列
union member，不新建第二个 effect 类型或 outbox 类型：

```ts
| {
    kind: "session_mail";
    mailId: OpaqueId;
    recipientId: OpaqueId;
    contextPublicationUpperBound: readonly OpaqueId[];
  }
```

其 producer 仅为 `sendPrivateMailV1`；consumer 是未来 application/outbox dispatcher，本
RUNBOOK 不实现 consumer。字段逐项来自刚创建的 mail，不由调用者另传或重算。

### 完整调用链与文件/Symbol 映射

本切片的调用链固定为：

1. 未来 application 从已认证 caller 取得 sender/recipient binding，由 ID allocator 生成
   `mailId`、由 `Clock.now()` 取得 `now`，调用 `sendPrivateMailV1`；本函数 append queued mail
   并返回一个最小 `session_mail` effect request。
2. 未来 Repository 把 state/result/effect plan 原子提交并映射为 outbox；dispatcher 消费该
   effect，在实际投递开始前以 trusted actor 和新 `now` 调用 `startPrivateMailV1`。这两项
   application/Repository/outbox 工作均不在本 RUNBOOK 内，执行者只生成其所需的纯结果。
3. `startPrivateMailV1` 固定 processing context 并占用 recipient serial gate；未来 dispatcher
   只可使用 committed mail 的固定 context 投递，不得重算。
4. recipient 完成时由未来 application 调用 `completePrivateMailV1`；sender 取消时调用
   `cancelPrivateMailV1`；deadline handler 到期时调用 `expirePrivateMailV1`。三者终结 mail
   并释放 gate，不产生第二个 delivery effect。
5. 正式 Contribution 的唯一当前创建入口
   `disposeHandRaiseV1(... disposition:"accepted")` 在 append Contribution 前执行反向 gate；
   不调用 mail transition，也不终结 mail。

| 文件                                                           | Symbol                                                          | 本 RUNBOOK 的唯一动作                        |
| -------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `plugin/src/domain/meeting-state-v1.ts`                        | `PrivateMailV1`, `MeetingState.privateMails`, `MeetingLimitsV1` | 只读，不修改                                 |
| `plugin/src/domain/transitions/result-v1.ts`                   | `MeetingDomainEffectRequestV1`                                  | 增加一个 `session_mail` union member         |
| `plugin/src/domain/transitions/private-mail-v1.ts`             | 五个 input interface 与五个 transition                          | 新建并实现唯一 mail 纯转换入口               |
| `plugin/src/domain/transitions/hand-raise-v1.ts`               | `disposeHandRaiseV1`                                            | accepted 分支增加反向 gate                   |
| `plugin/src/domain/meeting-state-v1-validation.ts`             | `privateMailSchema`, `validateMeetingStateV1` 的 mail loop      | 增加静态 mail 不变量                         |
| `plugin/src/domain/transitions/index.ts`                       | 具名 export                                                     | 公开五个函数与五个 input type                |
| `plugin/tests/unit/domain/private-mail-v1.spec.ts`             | `describe("private mail transitions", ...)`                     | 新建 T1/T2/T4 行为 suite                     |
| `plugin/tests/unit/domain/hand-raise-v1.spec.ts`               | `describe("hand raise transitions", ...)`                       | 增加 T3 gate cases                           |
| `plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts` | PrivateMail validator cases                                     | 增加 T5 snapshot cases并机械更新一个 fixture |
| `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`         | PrivateMail coverage/gap/evidence                               | T7 迁移真实验证结果                          |

不得新增或改名表外 production/test 文件；T7 删除本 RUNBOOK 是唯一例外。

### 检查顺序、错误和结果

五个 transition 使用同一固定顺序：

1. `validateMeetingStateV1(state)`；invalid snapshot → `INVALID_ARGUMENT`。
2. input shape、required/optional key、ID/text/time、数组非空/去重；失败
   → `INVALID_ARGUMENT`。
3. identity actor 基础权限：send sender、complete caller recipient、cancel caller sender
   必须存在；start 的 actorKind 必须为 `effect_dispatcher`，expire 的 actorKind 必须为
   `deadline_handler`；失败 → `UNAUTHORIZED`。
4. lifecycle：`terminal|archiving|archived` → `MEETING_TERMINAL`；send/start 的其它非
   `running` → `INVALID_STATE`；complete/cancel/expire 的 `preparing` → `INVALID_STATE`。
5. mail/recipient/agenda/related typed target 存在；失败 → `NOT_FOUND`。目标 mail 存在后，
   complete caller 必须等于 `mail.recipientId`，cancel caller 必须等于
   `mail.senderId`，不匹配 → `UNAUTHORIZED`。send 中 sender 与 recipient 相同属于
   `PRECONDITION_FAILED`，不是缺失引用。
6. status、deadline、上下文前缀、serial gate 和同 `privateMails` 数组内 duplicate mail
   ID；失败 →
   `PRECONDITION_FAILED`，已终结或错误当前 status → `INVALID_STATE`，duplicate 新 mail ID
   → `INVALID_ARGUMENT`。
7. 构造 next state 后调用 `validateMeetingStateV1(nextState)`；invalid →
   `PRECONDITION_FAILED` 且返回原 state。

单一目标错误设置 `targetId`；tests 不锁定 message 文案。成功结果的 `relatedIds` 固定为：

| function                | `relatedIds`                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `sendPrivateMailV1`     | `[mailId, recipientId, ...(agendaId ? [agendaId] : []), ...relatedIds]` |
| `startPrivateMailV1`    | `[mailId, ...processingContextPublicationUpperBound]`                   |
| `completePrivateMailV1` | `[mailId]`                                                              |
| `cancelPrivateMailV1`   | `[mailId]`                                                              |
| `expirePrivateMailV1`   | `[mailId]`                                                              |

`sendPrivateMailV1` 成功的 `effectRequests` 必须精确为
`[{kind:"session_mail",mailId,recipientId,contextPublicationUpperBound:sendContextPublicationUpperBound}]`；
start/complete/cancel/expire 成功和所有拒绝均为 `effectRequests=[]`。实际投递是后续 Runtime
范围。complete/cancel/expire 不清除 context/deadline，不删除 mail，不产生其它实体。

## 机械执行步骤

### T0：基线、分支与冻结依据

前置状态：当前分支包含共同基线；Author 阶段仅改动四份正式文档与本 RUNBOOK。

允许修改：无。

禁止修改：全部文件。

执行：

1. 确认分支名、共同基线 ancestry 和工作树范围。
2. 核对五个目标函数不存在、`PrivateMailV1` 字段与本文件一致、legacy mail 路径仍未接入。
3. 运行现有 validator 与 hand-raise 基线。

验证：

```bash
test "$(git branch --show-current)" = "codex/private-mail-domain-runbook"
git merge-base --is-ancestor c2fd076afcd1303cba1a01e832516b1dde12b428 HEAD
test -z "$(git status --short | awk '$2 !~ /^docs\/(10-requirements\/MEETING-ORCHESTRATION-REQUIREMENTS.md|20-interfaces\/MEETING-INTERFACE.md|30-designs\/DOMAIN-DESIGN.md|30-designs\/MEETING-DESIGN.md|30-designs\/RUNBOOK-PRIVATE-MAIL-DOMAIN.md)$/ { print }')"
! rg -n 'function (send|start|complete|cancel|expire)PrivateMailV1' plugin/src/domain plugin/tests/unit/domain
! rg -n 'kind: "session_mail"' plugin/src/domain/transitions/result-v1.ts
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/hand-raise-v1.spec.ts
```

PASS：branch/ancestry/worktree 检查退出 0；目标函数和 Domain `session_mail` effect union 均
不存在；基线 2 files、59 tests 通过。

STOP：分支/基线不符、存在范围外改动、目标函数已出现、model 字段漂移或基线测试失败。
报告命令输出，不 stash、reset、覆盖或删除现有改动。

失败恢复：本步只读，无恢复动作。

### T1：发送、公开引用与确定 deadline

前置状态：T0 PASS。

允许修改：`plugin/src/domain/transitions/private-mail-v1.ts`、
`plugin/src/domain/transitions/result-v1.ts`、
`plugin/tests/unit/domain/private-mail-v1.spec.ts`。

禁止修改：除上述三个允许文件外的全部文件。

执行：

1. 在 `result-v1.ts` 为 `MeetingDomainEffectRequestV1` 增加唯一 `session_mail` union
   member；新建 production/test 两文件，先实现 input type 和私有基础校验，让
   `sendPrivateMailV1` 对合法输入固定返回 `PRECONDITION_FAILED`。
2. 测试构造含按顺序排列的 Publication 与 FormalMessage 的真实 `MeetingState`，覆盖合法
   send、空/重复/私有 related ref、未知 sender/recipient/agenda、self mail、duplicate mail ID、
   optional `agendaId: undefined`、deadline safe-integer overflow、paused/terminal、成功
   effect request 的精确字段和拒绝原子性。
3. 运行 focused test，必须因合法 send 仍被 stub 拒绝而 RED。
4. 实现 send GREEN；不得实现 start/terminal action。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/private-mail-v1.spec.ts
```

PASS：合法 mail 精确写 `queued` 字段、Publication 全前缀、deadline 等式、version/time、
固定 `relatedIds` 与唯一 `session_mail` effect request；所有反例以规定 code 拒绝且原
state 引用不变。

STOP：正确 send 需要 caller 提交 deadline/context/actor 外部证明、引用未公开对象、修改
`PrivateMailV1`，或需要 `session_mail` 以外的 effect 字段/种类。保留 RED 输出并停止。

失败恢复：只保留能共同编译的 effect union、T1 stub 和 test，不把半实现标为 PASS。

### T2：开始处理与正向 Serial Gate

前置状态：T1 PASS。

允许修改：`plugin/src/domain/transitions/private-mail-v1.ts`、
`plugin/tests/unit/domain/private-mail-v1.spec.ts`。

禁止修改：除上述两个允许文件外的全部文件。

执行：

1. 为 `startPrivateMailV1` 加固定错误 stub。
2. 写 tests：queued mail 在新 Publication 追加后开始，processing context 等于全部当前
   Publication 且发送数组保持原前缀；错误 actorKind → `UNAUTHORIZED`、paused、now 早于 createdAt、deadline 等于/早于 now、
   processing/terminal mail、recipient 非终态 Contribution、recipient 已处理另一 mail 均拒绝。
3. 观察合法 start RED，再实现 GREEN；重复 start 必须拒绝且不能重算范围。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/private-mail-v1.spec.ts
```

PASS：合法 start 只写 status/processing 两字段/version/time；两个 context 和 deadline 稳定；
serial gate 反例原子拒绝；无 effect。

STOP：实现需要 Session、outbox、delivery ID、receipt replay 或从 transcript 推导 Publication。
不得把 Runtime 能力加入纯 Domain。

失败恢复：保留 T1 GREEN，报告首个 T2 失败 case。

### T3：Contribution 接纳的反向 Serial Gate

前置状态：T2 PASS。

允许修改：`plugin/src/domain/transitions/hand-raise-v1.ts`、
`plugin/tests/unit/domain/hand-raise-v1.spec.ts`。

禁止修改：除上述两个允许文件外的全部文件，尤其不得修改
`plugin/src/domain/transitions/private-mail-v1.ts`、
`plugin/tests/unit/domain/private-mail-v1.spec.ts` 或其它 contribution/opportunity/round
production 与 test 文件。

执行：

1. 在既有 accepted hand test fixture 加一条 contributor 为 recipient 的 processing mail；先写
   RED，断言 `disposeHandRaiseV1(... disposition:"accepted")` 返回
   `PRECONDITION_FAILED`，保持 pending hand、Round、Contribution、version 和 effects。
2. 只在 accepted 分支创建 Contribution 前增加 processing-recipient 查找并返回公共 rejected
   result；rejected/deferred hand disposition 仍可释放 pending hand，不受 mail gate 影响。
3. 加反例证明 queued/completed/timed_out/cancelled mail 不阻止 accepted Contribution，其他
   recipient 的 processing mail 也不阻止。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/hand-raise-v1.spec.ts tests/unit/domain/private-mail-v1.spec.ts
```

PASS：只有目标 contributor 正在 processing mail 时 accepted 被原子拒绝；既有 hand 行为和
T1/T2 mail 行为全绿。

STOP：满足 gate 需要修改 RaiseHand、Opportunity、Round、Task、effect shape 或清除 processing
mail。不得扩大 gate 触发点。

失败恢复：保留 T1/T2 GREEN；T3 失败时报告完整 state/input/result。

### T4：完成、取消与超时

前置状态：T3 PASS。

允许修改：`plugin/src/domain/transitions/private-mail-v1.ts`、
`plugin/tests/unit/domain/private-mail-v1.spec.ts`。

禁止修改：除上述两个允许文件外的全部文件。

执行：

1. 为 complete/cancel/expire 三函数加固定错误 stub。
2. 写 tests 覆盖 recipient 在 processing start 之后且 deadline 前 complete；不存在的 caller
   identity 和存在但非 recipient 的 caller 均 → `UNAUTHORIZED`；now 早于 processing start、
   deadline 到达后 complete、queued complete；sender 从 queued/processing cancel；不存在的
   caller identity 和存在但非 sender 的 caller 均 → `UNAUTHORIZED`；空 reason、终态 cancel；
   deadline handler 从 queued/processing expire；错误 actor、早到 expire、cancel 时间早于 createdAt/processing start、终态 expire；
   paused/converging/ending cleanup 成功与 terminal/archiving/archived 拒绝。
3. 观察三条合法路径 RED，再实现 GREEN。processing 后 cancel/expire 必须保留 processing 字段；
   queued 后 cancel/expire 必须不制造 processing 字段。
4. 证明三条终结路径只改变目标 mail 并释放 T2/T3 gate，不生成其它实体/effect。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/private-mail-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts
```

PASS：所有 terminal 字段组合、权限、deadline 边界和 lifecycle 断言成立；既有上下文/deadline
逐项不变；结束后该 recipient 可开始下一 mail 或取得 Contribution。

STOP：需要返回 mail reply、创建 FormalMessage/Task、延长 deadline、删除 mail 或引入新的
status。不得猜测相邻能力。

失败恢复：保留 T1—T3 GREEN，未通过函数不得从 index 导出。

### T5：Snapshot Validator 不变量

前置状态：T4 PASS。

允许修改：`plugin/src/domain/meeting-state-v1-validation.ts`、
`plugin/tests/unit/domain/meeting-state-v1-validation.spec.ts`。

禁止修改：除上述两个允许文件外的全部文件，尤其不得修改
`plugin/src/domain/transitions/private-mail-v1.ts`、
`plugin/src/domain/transitions/hand-raise-v1.ts`、
`plugin/tests/unit/domain/private-mail-v1.spec.ts`、
`plugin/tests/unit/domain/hand-raise-v1.spec.ts` 或 model 字段。

执行：

1. 先写 validator RED cases：self mail；空/未知/private related ref；send context 非当前
   Publication 前缀；processing context 不含 send 前缀或不是当前 Publication 前缀；deadline
   不等于 createdAt+taskDeadlineMs 或加法 overflow；processing/completed 时间倒退或越过对应 deadline；五种 status 的 required/forbidden optional
   字段；同 recipient 两条 processing mail；processing recipient 有非终态 Contribution。
2. 对既有 `remainingEntityState()` fixture 作唯一机械更新：mail 的 `relatedIds` 从 `[]`
   改为 `["publication-1"]`；其 `createdAt=deadlineAt=0` 与 `taskDeadlineMs=0` 已满足等式，
   不改其它 FK 覆盖。
3. 写合法历史 cases：Publication 在 send/start 后继续 append 时旧 context 仍是前缀；queued
   与 processing 分别 cancel/expire；completed 保留 processing 字段；recipient 的终态
   Contribution 与 processing mail 可并存。
4. 将 `privateMailSchema.relatedIds` 改为 `uniqueIdArraySchema.min(1)`；在线性 mail loop 中增加
   typed public ref、prefix、deadline、status-field 和跨实体 serial 检查。只使用数组/Set/Map
   的局部线性扫描，不新增 graph/helper framework，不导入 transition。
5. 运行 validator、mail、hand suites。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/private-mail-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts
```

PASS：新增 invalid snapshot 返回“目标对象与字段规则”表中固定的第一失败 path；合法历史
可重复验证；三个 focused suites 全绿，原 validator cases 不删除。

STOP：校验需要查询 caller visibility、Runtime、Repository、Session 或历史 receipt，或必须
修改 model/其它 transition 才使既有合法 fixture 通过。不得把外部证明塞入 validator。

失败恢复：保留最小 RED case，不放宽原 validator。

### T6：公开入口与完整代码验证

前置状态：T5 PASS。

允许修改：`plugin/src/domain/transitions/index.ts`；格式化命令可机械更新 T1—T5 允许文件的
排版，包括 `plugin/src/domain/transitions/result-v1.ts`。

禁止修改：除 `plugin/src/domain/transitions/index.ts` 和 T1—T5 已允许、且只可由本步
Prettier 机械排版的文件外全部文件；尤其不得修改 `plugin/src/domain/index.ts`。既有
`export * from "./transitions/index.js"` 已提供 Domain 公开入口。

执行：

1. 在 transitions index 具名导出五个函数与五个 input type；不得 `export *` 新文件或导出
   私有 helper。
2. tests 保持直接导入被测内部文件；不得为测试创建转发入口。
3. 依次运行 focused、Prettier、lint、typecheck、完整 verify 和 diff 检查；format 若产生范围
   外 diff，STOP。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/private-mail-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts
pnpm --dir plugin exec prettier src/domain/transitions/private-mail-v1.ts src/domain/transitions/result-v1.ts src/domain/transitions/hand-raise-v1.ts src/domain/transitions/index.ts src/domain/meeting-state-v1-validation.ts tests/unit/domain/private-mail-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts tests/unit/domain/meeting-state-v1-validation.spec.ts --write
git status --short
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin verify
git diff --check
test -z "$(git diff --no-index --check /dev/null plugin/src/domain/transitions/private-mail-v1.ts 2>&1)"
test -z "$(git diff --no-index --check /dev/null plugin/tests/unit/domain/private-mail-v1.spec.ts 2>&1)"
```

PASS：focused 全绿；format 后只有 RUNBOOK 允许文件变化；lint 无 error；typecheck、verify、
diff/new-file whitespace 均退出 0。

STOP：任一失败需修改 Non-goal 文件、放宽 lint/type/schema/test 或完整 verify 暴露共享回归。
报告第一条失败命令和输出，不用后续成功掩盖失败。

失败恢复：格式变更保留；修复只能进入已允许文件，否则 STOP。

### T7：Readiness 迁移与 RUNBOOK 删除

前置状态：T6 全部 PASS，工作树无范围外改动；取得 `git rev-parse HEAD` 作为实现边界，若
实现未提交则同时记录工作树 diff 边界，不伪称 HEAD 已含实现。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK。

禁止修改：除上述两个允许文件外的全部文件。

执行：

1. 将 Functional Coverage 的 PrivateMail 行更新为“目标纯 Domain 已对齐；外围未覆盖”，
   只列五个 transition、最小 `session_mail` effect request、上下文/deadline、双向 gate 与
   validator。
2. 收窄 Implementation Gap，但保留 Runtime/Repository/outbox/真实 delivery/projection/recovery。
3. 在 Executed Validation 记录日期、HEAD/工作树边界、focused 命令与实际 case 数、完整
   verify 结果；数字只来自 T6 输出。
4. Explicitly Not Covered 明确 idempotency、atomic commit、Session delivery、Remote/Client
   visibility、restart/recovery、真实 DSH/Browser 均未验证。
5. 格式化 coverage；`rg` 核对 RUNBOOK 引用。只有本文件自身或临时执行引用时删除本
   RUNBOOK；删除后运行链接、diff 和 focused checks。

验证：

```bash
git rev-parse HEAD
pnpm --dir plugin exec prettier ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md --write
test ! -e docs/30-designs/RUNBOOK-PRIVATE-MAIL-DOMAIN.md
! rg -n 'RUNBOOK-PRIVATE-MAIL-DOMAIN|PrivateMail 纯 Domain 生命周期与 Serial Gate' . --glob '!node_modules/**' --glob '!plugin/lib/**'
node .github/scripts/check-doc-links.mjs
git diff --check
pnpm --dir plugin exec vitest run tests/unit/domain/meeting-state-v1-validation.spec.ts tests/unit/domain/private-mail-v1.spec.ts tests/unit/domain/hand-raise-v1.spec.ts
```

PASS：readiness 每项完成声明有实际命令证据；链接 0 error；RUNBOOK 已删除且无残留引用；
focused suites 仍绿。

STOP：T6 证据缺失、链接失败、存在仍需 RUNBOOK 承载的长期规则、或实现与 Scope 不符。
恢复本 RUNBOOK 后报告差异，不把状态写成 completed。

失败恢复：删除后任一检查失败时恢复 RUNBOOK 与仅服务于它的引用，readiness 不宣称关闭。

## 验证矩阵

| 边界                                | 固定预期                                                                   | 证据                      |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------- |
| 合法 send                           | queued、全 Publication 发送前缀、确定 deadline、唯一 `session_mail` effect | T1 focused                |
| sender/recipient/agenda/public refs | 精确权限与 typed local refs                                                | T1 focused + T5 validator |
| processing context                  | 开始时全部 Publication，之后不漂移                                         | T2 focused + T5 validator |
| 正向 gate                           | Contribution 或另一 processing mail 阻止 start                             | T2 focused                |
| 反向 gate                           | processing mail 阻止 accepted Contribution                                 | T3 focused                |
| complete                            | 仅 recipient、processing、deadline 前                                      | T4 focused                |
| cancel                              | 仅 sender、queued/processing、非空原因                                     | T4 focused                |
| expire                              | 仅 handler、queued/processing、deadline 到达                               | T4 focused                |
| lifecycle cleanup                   | paused/converging/ending 可收口，终态拒绝                                  | T4 focused                |
| status-field invariant              | required/forbidden optional 组合唯一                                       | T5 validator              |
| atomic rejection                    | 原 state 引用、空 related/effects                                          | T1—T5 focused             |
| full regression                     | format/lint/typecheck/test/build/package 全通过                            | T6 `verify`               |

## Not Applicable 与未覆盖边界

- expected version、receipt、request hash、idempotency conflict、transaction rollback、outbox：
  Not Applicable，本切片没有 command envelope 或 Repository；纯 Domain 不能替代后续验证。
- 相同 request 重放：Not Applicable；Domain 对已 processing/terminal mail 的重复 transition 明确
  拒绝，真实重放必须由未来 receipt 返回原 committed result。
- restart/reopen/recovery：Not Applicable；本切片无持久化，validator 只验证单 snapshot。
- caller Session ownership 与 trusted dispatcher/deadline binding：Not Applicable；输入已经是
  application 解析后的 actor kind，本切片只验证角色矩阵。
- Runtime delivery、mail reply、AgentSession 占用与超时调度：Not Covered；不得用 state
  transition tests 声称真实投递。
- Remote/Client/PrivateMailView filtering：Not Covered；本切片不公开私信给任何 caller。
- MeetingTask、FormalMessage、Decision、CompletionFact、archive：明确 Non-goal；终结 mail 不
  产生这些实体。
- 真实 DSH profile、Browser、网络、文件、数据库、并发、性能：Not Applicable，纯确定性
  Domain 无这些依赖。
- legacy `PrivateMeetingMail` 兼容/迁移：明确 Non-goal，目标 Interface 不承诺旧格式读写或双写。

## 完成定义、审计与删除条件

完成必须同时满足：T0—T7 每步 PASS；Scope 表每项有唯一 production symbol 和能识别指定
错误的测试；所有新增结构均由正式 action/entity/invariant 直接授权；没有修改 Non-goal
文件；focused、lint、typecheck、完整 verify、文档链接与 diff 检查实际通过；readiness
明确 Not Covered；长期结论不只留在 RUNBOOK；RUNBOOK 已按 T7 删除。

`right-size-changes` 的范围判断已落实为一个 transition 文件、一个 focused suite、一个既有
effect union 成员、一个既有 Contribution gate 和一个既有 validator，不增加配置、port、
service、通用 actor framework 或兼容层。`test-driven-development` 的 RED/GREEN 顺序已逐步固定，测试只断言
正式可观察状态、拒绝码和原子性，不锁定私有 helper 或诊断文案。DSH 插件验证因本切片是
纯 Domain，只要求 focused unit 与仓库完整 `verify`；真实 Loader/profile 对该改动面没有
独有证据价值，列为 Not Applicable 而非已通过。

作者逐项 dry-run 后的审计结论为 `Executable`：actor、数据、状态、deadline、上下文、错误、
gate、文件、symbol、RED/GREEN、验证和收口均有唯一选择，机械执行者无需承担产品、架构、
兼容或外部生命周期判断。

若执行时正式文档变化、`PrivateMailV1`/`MeetingLimitsV1` 字段漂移、Publication 不再代表
全部公开上下文、mail deadline 不再复用 `taskDeadlineMs`、Contribution status 集变化，或
Runtime 必须参与当前 transition 才能维持 invariant，则本审计结论立即失效；命中步骤必须
STOP，由作者更新正式依据和 RUNBOOK 后重新 Audit。
