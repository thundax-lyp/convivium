# Captain Attendance Rejection RUNBOOK

## 状态与工作边界

- 建立日期：2026-09-07。
- 模式：Execute；2026-09-07 用户授权以最小实现修复冲突并执行至收口。
- 审计结论：Executable（步骤及本地闭环验收决策完备；不代表实现或运行验证已通过）。
- 工作分支：`codex/attendance-rejection-runbook`；工作目录为本仓库根目录。
- 用户确认范围：本任务选择 FR-13 的 Captain 拒绝参会推荐子闭环，用户随后要求形成 RUNBOOK。
- 起点：Phase 1 已持久化 pending recommendation，并向授权 Agent 投影；没有 Captain disposition 的生产入口。
- 终点：Captain 工具拒绝一个 pending recommendation，状态显示原因，重放和恢复保持同一事实，归档保留脱敏拒绝记录。
- 交付物：下述代码、正式契约补充、测试和 `docs/40-readiness/CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md`（新增）。FR-13 整项仍为部分实现。

## 执行者契约

严格按 T0 至 T7 顺序执行。每一步 PASS 后才能进入下一步。只允许修改该步白名单中的文件和符号；不得扩大到批准、接纳、Session provisioning 或其他业务控制。已有文件或符号与本文不符时 STOP，不寻找替代路径。

本次 Author 不构成实施委派；后续用户要求执行后，才运行 T0 至 T7。未获得独立授权不得 commit、push、创建 PR、合并、发布或修改用户 Host profile。测试只操作测试入口创建的独立数据和 profile。不得放宽断言、Schema、类型或权限来让验证通过；不增加依赖、cast-based legacy migration、worker、缓存或第二事实源。

PASS 表示该步全部命令退出 0，且指定断言成立。STOP 报告最后 PASS 步骤、触发条件、文件/symbol、最小复现命令、实际输出和继续所需决定。保留已完成改动及用户改动，不执行 reset/clean；测试资源必须在 finally/afterEach 清理。存在未覆盖的必要本地验证时不得收口。

## 正式依据与当前断点

| 依据 | 当前证据 | 本次补齐 |
| --- | --- | --- |
| [需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-13.3–8；FR-10 归档、FR-11.5/7 | `plugin/src/domain/model.ts::AttendanceRecommendation.status` 只有 `pending` | 独立 Captain reject，版本、审计、恢复和零权限扩张 |
| [角色目录接口](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md) Captain disposition、Recommendation lifecycle、Compatibility | 文档有 `CaptainAttendanceDispositionInputV1/ResultV1`；`plugin/src/protocol/types.ts` 尚无这两个类型 | 只开放 reject；approve 契约保留为未来能力 |
| [会议协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) CaptainAttendanceDisposition、Status、Archive | 工具表声明 `convivium_dispose_attendance_recommendation`；`plugin/src/tools/register-tools.ts::registerCreateAndStatusTools` 未注册 | Schema、Runtime、Tool 接通 |
| [领域设计](./DOMAIN-MODEL-DESIGN.md) Manager Catalog binding and attendance recommendation | `plugin/src/domain/meeting-state-validation.ts::isAttendanceRecommendation` 只接收 pending 的精确字段集合 | 条件化 rejection 字段；旧 pending 原样可读 |
| [编排设计](./MEETING-ORCHESTRATION-DESIGN.md) 12.5、归档 | `plugin/src/projection/status.ts::attendanceRecommendation` 无处置原因；`plugin/src/runtime/services/meeting-archive-service.ts::materializeArchivePackage` 无推荐历史 | status 原数组增加拒绝信息，archive 增加脱敏拒绝记录 |
| [持久化设计](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md) Checkpointed Commit Log | `plugin/src/runtime/application-service/meeting-decision.ts::createMeetingDecisionApplication` 已示范 Captain command + execute + receipt | 复用机制，不改 Repository 生产实现 |
| [覆盖表](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) FR-13 / Not Covered | 只有 Phase 1 本地验证；FR-14 受 per-child preset API 限制 | 仅更新 reject 子集证据，不提升 FR-13/FR-14 整项 |

架构遵循 [Architecture](../00-governance/ARCHITECTURE.md) 的身份隔离、Storage Domain 事实源和前端权限边界；执行与删除遵循 [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md) 和 [Document Rules](../00-governance/DOCUMENT-RULES.md)。

## Scope 与 Non-goals

Scope 编号用于步骤和验证追踪：

- S1：Captain-only 工具输入、输出、失败语义和注册。
- S2：单条推荐 `pending -> rejected` 的纯 transition、审计事件、原子 commit 和幂等。
- S3：脱敏 status、归档、旧数据读取和持久恢复。
- S4：focused/full 验证、真实 Loader 拒绝路径 smoke 和准确 readiness。

Non-goals：approve、admission、Participant 创建、Definition resolution、Preset/Skill validation、生产 Catalog producer、research dedup、推荐过期/自动取消、HTTP 写入口、Client 展示/按钮、local_host 主动会议状态的推荐可见性、Manager/Speaker context 扩展、Developer Markdown 扩展、续会导入拒绝记录、metrics/stress、DSH 自定义 Session Event。FR-10 Scribe minutes 与 Captain Decision/risk 控制分别由其他任务推进，禁止触碰。

角色目录接口的完整生命周期第 8 步（结束时取消 pending）仍属于未来阶段。本次拒绝已提交后保持 rejected；未处置推荐仍保持现有 Phase 1 语义。不得顺手实现 cancelled 分支。

## 固定数据与接口

以下为目标结构，T1 先写入正式契约，再由后续步骤实现。RUNBOOK 不长期持有唯一契约。

### 输入、输出与来源

新增位置 `plugin/src/protocol/types.ts`：

```ts
export interface CaptainAttendanceDispositionInputV1 {
    protocolVersion: 1;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    recommendationId: string;
    decision: "reject";
    reason: string;
}
export interface CaptainAttendanceDispositionResultV1 {
    requestId: string;
    recommendationId: string;
    disposition: "rejected";
}
```

代码类型仅声明本阶段可执行的 reject/rejected；approve、admissionId、participantId 仅作为正式文档中的未来能力说明，不进入当前 command 类型。本阶段 `CaptainAttendanceDispositionInputSchema` 只接受 `decision="reject"`，Result Schema 只接受 `disposition="rejected"` 且禁止 admissionId/participantId。输入必须精确为上面七个 required 字段，不接受额外字段或 null；三个 ID 和 reason 必须含非空白字符；expectedMeetingVersion 为非负安全整数。Schema 不 trim、不填默认值，沿用现有 Schema.object 的字段输出顺序，不承诺保留 raw input 的键顺序。Schema.object 字段按上面 InputV1 的声明顺序定义；hash 只作用于该 Schema 产出的 validated input，不作用于 raw input。T3/T5 的 direct Runtime 正向及重放测试必须先通过 CaptainAttendanceDispositionInputSchema 获得输入，再把同一个 validated object 交给 Runtime；负向直接调用只按指定 Reflect.set 构造。reason 在 transition 中 trim 后持久化，因此同 request 的原始 reason 空白变化仍发生 hash conflict。

工具输入来自 caller，Runtime 只接收 Schema 校验结果；direct Runtime caller 也必须遵守同一 validated-input 契约。输入不能携带 actor、时间、status、Session、权限或其他 ID。Runtime 从已认证 `MeetingToolCaller` 和恢复的 `StoredMeeting` 绑定 Captain；now 固定读取一次 `options.now?.() ?? Date.now()`。不创建 recommendationId、Participant ID 或 admission ID。request hash 严格使用 `serializeValidatedRequestV1(input)`；commandKind 固定 `dispose_attendance_recommendation`；callerBinding=`session:${caller.sessionId}`；capabilityId=`captain:${caller.sessionId}`。

输出使用现有 `ProtocolSuccessV1<CaptainAttendanceDispositionResultV1>` envelope：requestId 和 recommendationId 原样来自输入，disposition 固定 rejected，admissionId/participantId 必须省略。meetingVersion 使用 Repository 的 committed.meetingVersion；重放返回原 receipt 的结果和版本。

### Canonical state、审计与兼容

`plugin/src/domain/model.ts::AttendanceRecommendation` 保留现有全部字段、所有权及生成方式；只把 status 改为 `"pending" | "rejected"`，新增 optional rejection：

```ts
rejection?: {
    requestId: string;
    actorBinding: string;
    reason: string;
    rejectedAt: number;
};
```

Canonical owner 为 MeetingState。pending 必须完全省略 rejection；rejected 必须有且仅有上面四字段，不能为 null。requestId/actorBinding/reason 非空，actorBinding 必须以 `captain:` 开头且后缀非空；reason 已 trim，rejectedAt 为有限非负数。时间来自 Runtime 注入的 now；不得使用 Manager createdAt 或 caller 自报时间。原推荐全部其余字段保持不变。拒绝后不可再次修改，使用新 request 会返回 NOT_PENDING。

新增一个 Domain-owned event `attendance_recommendation.rejected`，只写以下 payload（全部 required）：

```ts
{
    recommendationId: string;
    requestId: string;
    actorBinding: string;
    reason: string;
    rejectedAt: number;
}
```

payload 值来自同一次 rejection。transition 返回一条 event 且 state.eventSeq + 1，不修改 state.version/updatedAt；Repository 在单条 commit 中处理 version、时间、receipt 和 event envelope。outbox 固定 `[]`。不写 CompletionFact、transcript 或 DSH Session Event。独立 event 的依据是 FR-13.8 的独立 Captain 处置审计，不复用 Manager plan 或 Decision 事件。

持久格式保留 MeetingState.formatVersion=2、PersistenceProjectionV1.formatVersion=1。旧 V2 pending 记录仍精确匹配旧字段集合，不补 rejection；无 discriminator 的 legacy 不写回、不升级，reject 返回 INVALID_ARGUMENT。未知版本和损坏结构仍沿用 SCHEMA_VERSION_UNSUPPORTED/CORRUPT_DATABASE；rejected 缺少 rejection、pending 携带 rejection、额外字段一律损坏。仅承诺新实现读取旧数据，不承诺旧程序能读取新 rejected 记录，不引入迁移或回退。

### Public status 与 Archive

`PublicAttendanceRecommendationV1` 新增 optional `rejection?: { reason: string; rejectedAt: number }`。pending 省略，rejected 输出两个字段；不输出 requestId、actorBinding、Manager Session、agentDefinitionId、Catalog private mapping。其他已定义 future status 不由本阶段产生。当前 active/execution-terminal 的授权和排序不变：Captain、matching Manager、仍有效 Participant；local_host/legacy 为 `[]`；archiving/archived 无顶层 attendanceRecommendations。

新增 `plugin/src/domain/model.ts::ArchiveAttendanceRejection` 和 `plugin/src/protocol/types.ts::PublicArchiveAttendanceRejectionV1`，结构逐字段相同（全部 required，无 nullable/default）：

```ts
{
    recommendationId: string;
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionId;
    displayName: string;
    agendaItemId: string;
    reason: string;
    rejectedAt: number;
}
```

Protocol 对应 roleDefinitionId 类型使用已有 `AgentRoleDefinitionIdV1`，Domain 使用已有 `AgentRoleDefinitionId`，不得 Domain import Protocol。

`ArchivePackage` 和 `PublicArchivePackageV1` 新增 optional `attendanceRejections?: readonly ...[]`。只包含本 Meeting 已提交 rejected；按原推荐 createdAt、id 升序排序。映射 id -> recommendationId，candidateId/roleDefinitionId/displayName/agendaItemId 原样复制，rejection.reason/rejectedAt 原样复制。没有拒绝记录时省略整个字段；有记录时必须非空、ID 唯一。不得把内部 recommendation 展开到 archive。

materialize 从已提交 state 派生；archive matching 检查数组顺序、数量和全部七字段完全一致，有拒绝却缺字段必须拒绝。旧 package 缺字段且源 state 没有 rejected 时可读取，不填造历史。schemaVersion 保持 1；公开 Schema 校验字段非空、时间有限非负、role enum、精确键和 ID 唯一。已物化 archive 的 status 直接读取该 package，不从活动 state 重建拒绝列表。续会不增加导入种类。

### 错误与顺序

| 触发条件 | 结果 |
| --- | --- |
| Schema 错误，含 approve、空白 reason、额外 actor、非法 version | 现有工具 execute 的 INVALID_ARGUMENT；不调用 Runtime |
| missing Meeting、非 captain、Session 不匹配、caller.meetingId 与 input 不符 | UNAUTHORIZED_CALLER，`Only the meeting Captain can reject an attendance recommendation.` |
| 已授权相同 request identity/hash | Repository receipt replay；先于 version/terminal/domain 校验 |
| 已授权同 identity 不同 hash | IDEMPOTENCY_CONFLICT；不进入 transition |
| expected version 过旧 | VERSION_CONFLICT，retryable=true；不进入 transition |
| domain 的 meetingId 不匹配、legacy、missing recommendation、非法 reason/actor/now、decision 不是 reject | INVALID_ARGUMENT |
| completed/partial/no_consensus/cancelled/failed/archiving | IMMUTABLE_MEETING |
| archived | ARCHIVED_MEETING |
| 新 request 指向 rejected | ATTENDANCE_RECOMMENDATION_NOT_PENDING，`Attendance recommendation is not pending.`，retryable=false |
| 其他底层异常 | mapCommandError 保留现有 Repository code，未知异常 INTERNAL_ERROR |

Domain 先检查 Meeting identity、terminal、V2，再检查输入和 recommendation existence/status。Runtime 必须在 execute 的 transition callback 内进行业务校验，不得提前检查 NOT_PENDING/terminal 而破坏 receipt replay。Runtime 直接调用也必须校验 reject 分支和 reason，不能依赖工具 Schema 才避免 approve 副作用。

除授权固定消息、NOT_PENDING 固定消息外，Runtime 错误统一 `The attendance recommendation could not be rejected.`，使用现有 mapCommandError；在新 application 的 catch 内读取 error.code，仅当其为 ATTENDANCE_RECOMMENDATION_NOT_PENDING 时选择该固定消息，其余选择统一消息，再传给 mapCommandError，不修改共享 mapper。错误 context 只传 meetingId，不泄露内部字段。所有失败的 state/event/receipt/outbox/version 均不变；已提交请求 replay 是读取原结果，不是终态新写入。

## 调用链、符号与不变量

```text
registerCreateAndStatusTools
 -> execute / CaptainAttendanceDispositionInputSchema / resolveCaller
 -> MeetingToolRuntime.disposeAttendanceRecommendation
 -> createMeetingAttendanceApplication / recovery.rehydrate / Captain guard
 -> stored.repository.execute (receipt + hash + expected version)
 -> rejectAttendanceRecommendation
 -> state + attendance_recommendation.rejected + receipt + outbox=[]
 -> commandSuccess
 -> projectMeetingStatus / attendanceRecommendation
 -> materializeArchivePackage / projectAttendanceRejections
 -> assertArchivePackageMatchesMeeting
 -> archived status reads immutable package
```

新增文件 `plugin/src/domain/transitions/attendance-rejection.ts` 唯一拥有：

```ts
export interface RejectAttendanceRecommendationInput {
    readonly meetingId: string;
    readonly requestId: string;
    readonly recommendationId: string;
    readonly actorBinding: string;
    readonly reason: string;
    readonly now: number;
}
export function rejectAttendanceRecommendation(
    state: MeetingState,
    input: RejectAttendanceRecommendationInput
): TransitionResult<MeetingState>;
export function projectAttendanceRejections(
    state: MeetingState
): readonly ArchiveAttendanceRejection[];
```

后一个纯 mapper 被 materializer 和 archive matcher 两个当前消费者共享，只负责前述七字段映射；不执行 I/O、不修改输入。通过 `plugin/src/domain/transitions/index.ts` 导出，既有 `plugin/src/domain/index.ts` star export 自动透出。

新增文件 `plugin/src/runtime/application-service/meeting-attendance.ts` 唯一拥有 `MeetingAttendanceApplicationOptions`，字段与现有 MeetingDecisionApplicationOptions 相同：readonly options: CreateStatusRuntimeOptions、readonly meetings: Map<string, StoredMeeting>、readonly recovery: MeetingRehydrationService。新增函数签名：

```ts
export function createMeetingAttendanceApplication(
    dependencies: MeetingAttendanceApplicationOptions
): Pick<MeetingToolRuntime, "disposeAttendanceRecommendation">;
```

`MeetingToolRuntime` 新增 `disposeAttendanceRecommendation(input: CaptainAttendanceDispositionInputV1, caller: MeetingToolCaller, signal: AbortSignal): Promise<ProtocolSuccessV1<CaptainAttendanceDispositionResultV1> | ProtocolErrorV1>`。遵循现有 Captain command 的事务生命周期，不创建 cancellable 外部 operation、timer 或异步作业；工具的 pre-dispatch cancellation 沿用 DSH。

不变量：身份与推荐属于同一 Meeting；一个拒绝只产生一个处置；并发新 request 只有一个成功；重放不增加 version/eventSeq；Captain 拒绝不推进 Turn、不触碰 SpeakerAttempt、planning binding、Participant、Session ownership、任务、完成事实或权限；源对象不得原地修改；归档无 Session/私聊/可恢复 capability。

## 机械执行步骤

所有命令从仓库根目录运行。每步失败遵循统一 STOP 报告和恢复要求。

### T0：核对基线

前置状态：用户已明确要求执行本 RUNBOOK。
允许修改：无 tracked 文件；仅 frozen 安装生成的依赖目录和 verify 生成物。
禁止修改：所有生产文件、依赖清单、lockfile、用户 profile。

执行：
1. 读取上述正式依据，确认 Scope 未被其他任务实现或改写；读取当前工作树，确认无用户未提交改动与本步骤后续白名单冲突。
2. 确认当前分支为 `codex/attendance-rejection-runbook`。运行 frozen 安装校验依赖，不修改 lockfile。

验证：
```bash
git status --short
git branch --show-current
pnpm --dir plugin install --frozen-lockfile
pnpm --dir plugin verify
```

PASS：分支正确，DSH lockfile 为 0.1.1-rc.2，verify 全部退出 0，安装未修改 manifest/lockfile。
STOP：分支不同、白名单冲突、依赖版本不同、任何基线失败；报告输出，不更新依赖或跳过门禁。

### T1：固定正式契约与协议 Schema

前置状态：T0 PASS。
允许修改：`docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`plugin/src/protocol/types.ts`、`plugin/src/protocol/commands.ts`、`plugin/src/protocol/results.ts`、`plugin/src/protocol/index.ts`、`plugin/tests/contract/protocol-schema.spec.ts`。
禁止修改：approve 的未来业务语义、现有 Phase 1 历史边界、其他 command、HTTP/Client。

执行：
1. 两份接口的同名 command 类型同步收窄为本阶段 reject/rejected，删除当前类型里的 admissionId/participantId；批准与接纳的既定未来行为保留为明确尚未实现的 prose，禁止保留两份同名但不一致的当前类型。增加“Captain rejection slice”段落，完整迁移本 RUNBOOK 的输入/输出、state/event、错误、兼容、status/archive 契约；显式标注阶段只开放 reject，其他生命周期不在该阶段。不得把代码状态提前写成已实现。
2. 在 types.ts 新增上文两个 command 类型、PublicArchiveAttendanceRejectionV1，给 PublicAttendanceRecommendationV1 和 PublicArchivePackageV1 增加指定 optional 字段。
3. commands.ts 新增 `CaptainAttendanceDispositionInputSchema`；results.ts 新增 `CaptainAttendanceDispositionResultSchema`。复用现有 Schema.transform 精确键校验模式，遵守前述字段、值不 trim 与 validated-input hash 约束；index.ts 导出两个 Schema。
4. protocol-schema.spec.ts 增加 suite `Captain attendance rejection schema`：合法 reject/result；逐个缺字段、null、额外字段、approve、空白 reason、负数/小数/Infinity/unsafe version 拒绝；reason 原始空白保持不变；用两个值相同但 raw key 顺序不同的对象验证 Schema 输出均按 InputV1 声明顺序排列，且 serializeValidatedRequestV1 的结果相同；reason 值改变仍产生不同 hash；result 的 approved/admissionId/participantId 拒绝。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts
pnpm --dir plugin typecheck
```

PASS：新增 suite 与既有协议测试全部通过；类型检查通过，两个 Schema 可由 protocol/index 导入。
STOP：需要修改其他协议行为或新增错误码；保留改动，不放宽 Schema。

### T2：推荐状态与拒绝 transition

前置状态：T1 PASS。
允许修改：`plugin/src/domain/model.ts`、`plugin/src/domain/errors.ts`、`plugin/src/domain/meeting-state-validation.ts`、`plugin/src/domain/transitions/index.ts`、`plugin/src/domain/transitions/attendance-rejection.ts`（新增）、`plugin/tests/unit/domain/transitions/attendance-rejection.spec.ts`（新增）、`plugin/tests/unit/repository/domain/projection.spec.ts`。
禁止修改：Manager submission、planning、Turn advancement、终态转换、Repository 生产代码。

执行：
1. 按固定结构更新 AttendanceRecommendation，新增 ArchiveAttendanceRejection 与 ArchivePackage.attendanceRejections；DomainEventTypes 追加唯一 event；DomainErrorCode 追加已存在于 Protocol 的 ATTENDANCE_RECOMMENDATION_NOT_PENDING。
2. isAttendanceRecommendation 保留 pending 精确键校验，rejected 分支额外且必须校验 rejection 的精确四键及取值；不要让 pending 接受 undefined/null rejection。
3. 实现新 transition 和 mapper，逐项执行前述校验顺序；只有目标推荐替换为 rejected，eventSeq + 1；mapper 无记录返回 []。导出到 transitions/index.ts。
4. 新 unit suite `Captain attendance rejection transition` 使用已有 `plugin/tests/unit/domain/transitions/fixtures.ts::meeting` 生成会议，在新 spec 内添加一个完整 pending recommendation。测试成功、全部不可变状态、未知 ID、跨 Meeting ID、空白输入、非法时间/actor、already rejected，以及 freeze 输入下成功不变异。精确比较除目标推荐和 eventSeq 外全部 state。
5. projection.spec.ts 增加旧 pending/旧 legacy 读取不写回；rejected 合法可读取。通过 decodeProjection 测试缺失/额外/null rejection、pending 携带 rejection 时，断言 Schema 异常包含 `MeetingState format 2 is malformed`；未知版本断言 `UnsupportedMeetingStateFormatError`。该层不断言 Repository 错误码、不修改异常映射。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/attendance-rejection.spec.ts tests/unit/repository/domain/projection.spec.ts
pnpm --dir plugin typecheck
```

PASS：所有状态/错误断言精确匹配，输入未被修改，无额外领域事实和 event。
STOP：需要 legacy migration、改变 Manager fixture 全局默认值或改变其他 transition。

### T3：Captain Runtime 与事务恢复

前置状态：T2 PASS。
允许修改：`plugin/src/runtime/application-service/meeting-attendance.ts`（新增）、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/contract/offline-meeting-protocol.spec.ts`。
禁止修改：Repository 生产实现、DSH adapter、Catalog consumer、Session provisioning、控制其他业务。

执行：
1. 按指定签名新增 application 和 Runtime method。复用 createMeetingDecisionApplication 的 recovery/Captain guard/execute 结构；在 index.ts::createCreateStatusRuntime 以同一 options/meetings/recovery 创建 application，并把 method 接到返回对象。
2. Runtime 直接调用的 input.decision 非 reject 或空白 reason 返回 INVALID_ARGUMENT，不执行写入；其余业务 guard 必须放在 repository transition 内。只通过既有 request serializer、execute、commandSuccess/mapCommandError，执行固定结果/event/outbox 逻辑。
3. tool-registration.spec.ts 与 offline-meeting-protocol.spec.ts 的完整 runtime mock 机械新增 `disposeAttendanceRecommendation: denied`，不新增工具行为断言至 T4。
4. meeting-runtime.spec.ts 在既有 `accepts a recommendation only from the attempt-bound Catalog snapshot` 用例旁新增独立测试，复用 localRuntime 和该用例的 Catalog/Manager submission 准备。通过正式 createMeeting/submitManagerPlan 生成 pending，不能直接 seed rejected。覆盖 Captain success、Manager/Participant/其他 Captain/跨 Meeting caller/missing Meeting 拒绝、直接 approve 拒绝（用合法 input 的副本经 `Reflect.set(value, "decision", "approve")` 构造负向运行期输入，不放宽生产类型）、stale version、same request replay/hash conflict、第二新 request NOT_PENDING、并发不同 request 仅一成功。
5. runtime.dispose 后用同一 root 和 Captain identity 创建新 localRuntime，通过 status 读取 rejected 并重放原 request。不得重新提交 Manager plan。核对 Participant 数、ownership、当前 Turn/attempt、Catalog readSnapshot 调用次数没有因 reject 增加。
6. domain-meeting-repository.spec.ts 用 createFakeMeetingDomain/DomainMeetingRepository.open 和新 transition 执行同一请求；使用 `failPutsInTable("commits")` 注入持久化失败，断言 state/version/event/receipt/outbox 均未提交；finally `allowPutsInTable("commits")`。重试成功后 reopening 同一个 fake domain，验证恰好一个新增 event 和 receipt，本 command outbox=[]。不得为测试改变生产 Repository。
7. 同一 spec 复用现有 `openReadyState(state)` helper，在 Repository.open 边界验证上述 malformed rejection 记录返回 `CORRUPT_DATABASE`、未知 format 返回 `SCHEMA_VERSION_UNSUPPORTED`；合法 pending/rejected 可 open/read，随后 close。不在 projection unit 中要求这些错误码。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/tool-registration.spec.ts
pnpm --dir plugin typecheck
```

PASS：成功结果符合 Result Schema；授权、版本、重放、并发、commit rollback 与真实 JSONL reopen 均通过。
STOP：需要放松 repository authorization 或绕过恢复。临时 root 必须由既有 afterEach 删除，runtime/registry 先 dispose/close。

### T4：DSH 工具注册与模型结果

前置状态：T3 PASS。
允许修改：`plugin/src/tools/register-tools.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/contract/offline-meeting-protocol.spec.ts`。
禁止修改：caller resolver、Tool 参数载体、现有工具、HTTP routes、Client。

执行：
1. registerCreateAndStatusTools 新增 `convivium_dispose_attendance_recommendation`，description 固定 `Reject one attendance recommendation as the meeting Captain. Approval is not supported.`。复用 toolParameters、protocolOutputSchema、execute、resolveCaller、renderOutcome/asJson；validate 绑定新 Input Schema，runtime 绑定新 method，disposer 进入既有返回数组。
2. tool-registration.spec.ts 新增合法 input 到 Runtime 的逐字段转发，approve/空白/额外 actor 不进入 Runtime，canonical success/error 的 JSON rendering，调用返回 disposer 后注册消失。完整 runtime mock 只增加新 method，不重新组织 fixture。
3. offline-meeting-protocol.spec.ts 仅更新工具集合/数量断言和完整 runtime mock 所需的新 method；不得改现有业务结果或 snapshot。为新工具添加 keyless 的参数、canonical result 和 rendered JSON 一致性断言。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/tool-registration.spec.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin typecheck
```

PASS：新工具恰好注册一次，成功 JSON 可用 Result Schema 校验，非法输入不调用 Runtime，dispose 移除注册。
STOP：需要改变权限解析、外部生命周期或工具 policy；不得添加专用 Session event。

### T5：状态、归档与旧数据一致性

前置状态：T4 PASS。
允许修改：`plugin/src/protocol/schema.ts`、`plugin/src/projection/status.ts`、`plugin/src/protocol/status.ts`、`plugin/src/runtime/services/meeting-archive-service.ts`、`plugin/src/domain/transitions/archive.ts`、`plugin/tests/contract/status-projection.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`、`plugin/tests/unit/domain/transitions/archive.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/protocol-schema.spec.ts`。
禁止修改：归档关闭/重试/cleanup/continuation 逻辑、其他归档字段、Client、Developer Markdown。

执行：
1. attendanceRecommendation 仅对 rejected 增加 rejection.reason/rejectedAt；schema.ts 的 PublicAttendanceRecommendationSchema 增加 optional rejection，status.ts 的 active 和 execution-terminal 直接复用该已有公开 Schema，精确两键、reason/时间校验，pending 禁止出现、rejected 必须出现。其余 future status 不要求该字段。
2. materializeArchivePackage 调用 projectAttendanceRejections；非空时写 attendanceRejections，为空时省略。assertArchivePackageMatchesMeeting 对派生数组和 input.package 的对应七字段、顺序、数量逐项精确比较；不改变其他 matching 逻辑。
3. MeetingArchivePackageSchema 增加 optional attendanceRejections，使用前述完整校验；既有 archived status 通过 package 原样透传该字段，禁止从 state 另算一份。旧 package 缺字段继续可读且不添加 []。
4. status-projection.spec.ts 覆盖三种合法 Agent caller 一致、local_host=[]、pending 无 rejection、rejected 无敏感字段、排序；archiving/archived 的 package 包含拒绝事实且无顶层推荐数组。
5. 两个 archive spec 覆盖 materialize/freeze 后输入变更不污染 package；字段缺失/改写/重排/重复/跨推荐混入导致 matching 拒绝；无拒绝的旧 package 仍匹配。
6. protocol-schema.spec.ts 覆盖 status/archive 新字段的正负 Schema。meeting-runtime.spec.ts 新增独立用例 `archives and reopens a Captain attendance rejection`，不调用缺少 cleanup 能力的 localRuntime helper，不修改该 helper 的共享默认值。用例内直接调用 createCreateStatusRuntime；仅复用既有 `commits completion claims with the turn and rejects unavailable task evidence atomically` 用例的完整 continuable 准备代码：startContinuable 记录 children 的 id/label 并返回 childId/initial messageId；followup 返回固定 messageId；listChildren 映射 children 为 kind=child、activity=inactive、hasChildren=false、mode=continuable、原 id/label；interrupt 记录 childId；drainContinuableChildren 记录 childIds。保留 storagePort(root)、provider=spawn、既有 allow authorizationValidator、now=100，再传入 T3 使用的 Catalog readSnapshot。不得复制原用例的 completion claims、Decision 或证据行为。
7. 上述用例使用 T3 的 createMeeting/submitManagerPlan 输入，仅一个普通 Participant，并保留 captain.agent，其 id 必须等于 captain.sessionId。通过新 Runtime method 提交 reject，保存原 reject input/result。随后 endMeeting 的 input 固定为 protocolVersion=1、真实 meetingId、expectedMeetingVersion=reject 成功版本、requestId=`attendance-rejection-end`、outcome=`cancelled`、reason=`Close attendance rejection test`、acceptedDecisionIds=[]、deferredAgendaItemIds=[]、waivers=[]。不为结束会议制造完成事实。
8. endMeeting 返回的 result.status 是 cancelled；立即用 `getStatus({ protocolVersion: 1, meetingId }, captain)` 的实际读取结果断言 status=archived，不能把 end receipt 当作 archived 结果。核对 result.archive.package.attendanceRejections 的原因与时间等于 reject 记录，drain 的 Session 集合精确等于本 Meeting 的 Manager 和单一 Participant。若仍停在 execution-terminal/archiving，测试失败，不跳过断言或新增重试机制。
9. 在 finally 中 dispose 首个 runtime；创建新的 createCreateStatusRuntime，使用同一 root、同一完整 continuable 测试对象、同一授权设置和 now=100。保留相同 Captain identity，通过 status 读取归档；新 request 使用读取到的最新 meetingVersion，断言 ARCHIVED_MEETING；原 reject input 重放返回保存的原 result/version。前后 status 的 version 与归档包不变。第二个 runtime 同样 finally dispose，临时目录由既有 roots/afterEach 清理。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/protocol-schema.spec.ts
pnpm --dir plugin typecheck
```

PASS：active/terminal/archive/reopen 同一拒绝事实一致；归档只含七字段，旧数据不变异；全部 focused suite 通过。
STOP：需要迁移旧 archive、扩大 local_host active visibility、改其他任务的 minutes/Decision/risk 字段。

### T6：真实 Loader 拒绝路径与完整验证

前置状态：T5 PASS。
允许修改：`plugin/tests/unit/index-inject.spec.ts`、`plugin/scripts/smoke-profile/probe/scenarios/baseline.js`、`plugin/scripts/smoke-profile/result.mjs`、`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。
禁止修改：生产 Catalog producer、Host profile、其他 smoke selector、默认场景列表、构建和清理机制。

执行：
1. runBaselineScenario 中，仅 `scenario === "baseline"` 时（包括 Browser baseline），在 createMeeting 后、submit_manager_plan 前，用 `ctx.tools.execute` 通过真实 Captain 调用新工具。input 使用 created.meetingVersion 和真实 meetingId；requestId=`smoke-attendance-reject-missing`，recommendationId=`missing-recommendation`，decision=reject，reason=`Verify attendance rejection boundary`，callId=`convivium-smoke-attendance-reject-missing`。
2. 不使用只接受 success 的 runtime.callTool 包装本次预期失败；断言 Tool execution 不是 isError，canonical value 为 ok=false/code=INVALID_ARGUMENT/retryable=false。随后正式 status 读取，version 与 created 相同且 attendanceRecommendations=[]。现有 Manager plan 保持原 created.meetingVersion 并成功。
3. baseline 输出增加 assertion `attendance-reject-tool-zero-effects`；result.mjs::validateScenarioResult 对 expectedScenario=baseline 要求该 label，不更改其他 selector。Browser baseline 也执行相同零副作用检查并输出 label，原有 Browser UI 行为保持原样。smoke-profile-contract.spec.ts 增加 label 缺失拒绝、完整 label 接受和 timeout 不受影响的结果校验测试；smoke-profile.spec.ts 中 `exports the smoke result validator from the entrypoint` 的 baseline fixture 同步携带该 label。
4. index-inject.spec.ts 只同步新增工具后的生命周期计数：toolDisposers=20，loopback effects=22，非 loopback effects=21；保持每个 disposer 恰好调用一次和路由断言。执行下列命令；Prettier 只修正 T1–T6 白名单内实际改动的文件，不运行全仓库 format --write。完整 verify 不得跳过失败门禁。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/smoke-profile.spec.ts
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile
```

PASS：verify 全部通过；独立 profile 真实加载新工具并通过新拒绝路径、既有 ACB/transcript/HTTP smoke；wrapper 输出 baseline PASS 和 restore=PASS，所创建的临时 root、进程、端口已清理。
STOP：缺少运行依赖、加载失败、任一断言/cleanup 失败。报告 temp root/进程/输出，遵循既有 wrapper finally 清理，仅处理本次创建的资源；不得接入用户生产 profile 或安装新的生产 Catalog producer。

### T7：正式文档与证据收口

前置状态：T6 PASS。
允许修改：`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/40-readiness/CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md`（新增）、`plugin/README.md`、`TODO.md` 中 AR-00 至 AR-07、本 RUNBOOK。
禁止修改：FR-13/FR-14 整项完成度、其他任务的证据和 TODO 条目。

执行：
1. 两份 design 写入稳定字段、纯 transition/Runtime/Repository 所有权、可见性、归档与恢复边界；接口阶段状态改为 reject 已实现，approve/admission/自动取消保留未实现。plugin/README.md 说明新工具参数/结果、Captain-only、approve 不支持及阶段限制。
2. 新 readiness 按 Scope、Validated Contract、Executed Validation、Not Covered、Closure 写入实际日期、分支/commit 或未提交边界、环境、命令退出码、测试数量及真实观察；禁止把本 RUNBOOK 的计划断言写成已验证。
3. coverage 的 FR-13 保持部分实现，补记 reject 子闭环本地与真实 Loader 拒绝路径证据；保留 Not Covered 中真实 Host producer 的成功推荐→拒绝、Browser/HTTP/Client、approve/admission/provisioning/FR-14、真实 Host 冷重启。真实 JSONL Runtime reopen 与真实 DSH Host 冷重启必须分开描述。
4. 使用下文文档检查命令；完整 verify 和 smoke 在 T6 已通过，T7 若改 plugin/README.md 则再次运行 format:check，不因纯文档修改重复全量测试。
5. 所有 Scope 和验证矩阵通过，长期内容迁移完成后，查找本 RUNBOOK 文件名和标题。只允许命中本文件和 TODO.md 的 AR-00 至 AR-07 条目；其他位置命中则 STOP 并报告，不删除其他任务内容。逐项核对 AR-00 至 AR-06 已实际完成；任一未完成则 STOP。
6. 保存本文件与 TODO.md 中本次条目的删除前内容。删除本 RUNBOOK，并按 TODO-RULES 删除已完成的 AR-00 至 AR-07（包括本步收口项）；未创建 commit 时仅视为工作区同步，不声称已经提交关闭。再次检查 docs 与 TODO.md 的 Markdown 相对链接、残留引用和 diff。删除后检查失败则恢复被删除的 RUNBOOK 及本次 TODO 条目并 STOP，保留其他改动。Author 阶段绝不执行这一步。

验证：
```bash
pnpm --dir plugin format:check
rg -n 'RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION|Captain Attendance Rejection RUNBOOK' docs TODO.md plugin/README.md
python3 - <<'PY'
from pathlib import Path
import re
missing = []
for p in [*Path('docs').rglob('*.md'), Path('TODO.md')]:
    for target in re.findall(r'\]\(([^)]+)\)', p.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        target = target.split('#', 1)[0]
        if target and not (p.parent / target).exists():
            missing.append((str(p), target))
assert not missing, missing
print('Documentation relative links PASS')
PY
git diff --check
git status --short
```

PASS：文档链接存在、diff 无空白问题，readiness 与实际证据一致，删除后无 RUNBOOK 引用。删除后 rg 无匹配退出 1 是预期；存在其他输出为 STOP。
STOP：必要验证未通过、长期结论未迁移、出现 AR-00 至 AR-07 之外的非本任务引用或删除后检查失败。不得用“completed”文件名长期保留 RUNBOOK。

## 验证矩阵与覆盖上限

| ID / Scope | 场景 | 预期结果 | 步骤 / suite |
| --- | --- | --- | --- |
| V1 / S1 | reject、缺字段、null、approve、越界 version、空白 reason、额外 actor | 合法值不 trim、键顺序使用 Schema 输出；非法 INVALID_ARGUMENT 且 Runtime 零调用 | T1/T4 protocol-schema、tool-registration |
| V2 / S1/S2 | Captain、Manager、Participant、外会议 Captain、missing Meeting | 只有本 Meeting Captain 能写；无权 caller 零副作用 | T3 meeting-runtime |
| V3 / S2 | pending -> rejected | 单 event、单 receipt、version +1、eventSeq +1、outbox=[]；所有相邻状态不变 | T2/T3 transition、Repository |
| V4 / S2 | stale version、终态新 request | VERSION_CONFLICT 或 immutable/archived；state/event/receipt 不变 | T2/T3/T5 |
| V5 / S2 | same request replay、hash conflict、不同 request 并发 | 原结果和版本；冲突不写；并发恰好一成功 | T3 |
| V6 / S2 | commits put failure | 无内存先行、无半提交；解除故障后恰好一次成功 | T3 domain-meeting-repository |
| V7 / S3 | 旧 pending、legacy、损坏 rejection、未知 format | 旧数据原样读取；legacy reject fail closed；projection 抛底层异常，Repository 映射公开错误码 | T2 projection / T3 domain-meeting-repository |
| V8 / S3 | JSONL dispose/reopen 与 receipt replay | 无重新推荐、无重复 event、状态和版本一致 | T3/T5 meeting-runtime |
| V9 / S3 | status/archive 字段、排序、隐私、伪造 archive | 三种 Agent 一致；local_host active=[]；archive 七字段；伪造被拒绝 | T5 |
| V10 / S1/S4 | Tool schema/result/render/dispose | canonical JSON 一致，移除后工具不可见 | T4 |
| V11 / S4 | 真实 Loader + Captain + 无推荐 reject | INVALID_ARGUMENT、version 不变，既有 baseline 正常并清理 | T6 |
| V12 / S4 | 完整插件门禁与证据 | verify、baseline smoke、文档链接、diff 全通过，证据不外推 | T6/T7 |

数组部分非法的写入原子性：Not Applicable，本 command 仅接收一个 recommendationId，不提供数组或 batch；archive 数组完整校验属于 V9。数据库迁移：Not Applicable，只做上述可读兼容，不迁移。外部 provisioning rollback：Not Applicable，reject 无外部写副作用。

真实 Host producer 成功链路：Not Covered。本仓库当前没有生产 Catalog producer，不能用新增假 producer 证明生产接入完成。本次用真实 Storage Domain/JSONL 的 Runtime contract 验证成功、归档和 reopen；真实 DSH Loader 验证新工具接线及拒绝路径。真实 Host 冷重启、真实模型自主推荐/拒绝、Browser 操作、stress 均 Not Covered，不作为本次有限子闭环的已验证结论。

## 完成定义与 Author 审计

完成定义：T0–T7 全部 PASS；V1–V12 有实际证据；S1–S4 对应验证无遗漏；没有新增 Participant、Session、审批权限或其他相邻业务；长期契约和实际证据已迁移，RUNBOOK 已按删除门禁移除。完成只能称为“Captain 拒绝参会推荐的本地闭环已实现并验证，真实 Loader 拒绝路径通过”，不能称完整 FR-13 或完整生产 Catalog 闭环。

Author 审计逐项覆盖：Required Structure、scope 双向追踪、数据字段/owner/时间/actor/ID/version/hash、唯一新增路径与签名、错误顺序、事务/replay/recovery、每步白名单/PASS/STOP、失败恢复、验证矩阵、Not Applicable/Not Covered、readiness 与删除恢复。既有入口已只读核对；新增路径均标明。

Author 已执行的验证仅为文档相对链接、白名单路径存在性及 `git diff --check`，结果见本任务交付说明。Author 初稿未执行 pnpm install、typecheck、测试、build、verify 或真实 smoke；本次修订验证单列如下，不作为新功能实现证据。已确认本地 node_modules 目录存在，但未据此推断依赖完整；T0 仍必须 frozen 安装并验证。当前无产品完成证据；初稿未修改 TODO，后续清单编写仅登记待审阅项；未提交、未 push。Author 最终检查结果：全 docs 相对链接 PASS；所有引用的既有文件路径及 4 个计划新增路径核对 PASS；T0–T7 固定格式 PASS；tracked diff 与新增文件单独空白检查 PASS。


### Review 修订验证

2026-09-07，本次仅修正文档：Schema 采用现有字段输出顺序，对 validated input 计算 hash；底层异常和 Repository 错误码分别在所属测试层断言；归档用例固定完整 continuable fixture、cancelled 输入、getStatus 读取及双 Runtime 清理；代码 command 类型仅含 reject/rejected。

验证对象是现有依赖与测试入口，不是尚未实现的新工具。Schema 最小复现实验确认不同 raw 键顺序输出相同声明顺序，原 reason 空白不变；已运行 `pnpm --dir plugin exec vitest run tests/unit/repository/domain/projection.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/meeting-runtime.spec.ts`，退出 0，3 files / 92 tests PASS（分别 9、44、39）。文档链接、路径、T0–T7 固定结构及新文件空白检查通过后，审计结论为 Executable。新 command、rejection state、归档新增字段与真实 smoke 尚未实施/验证。
