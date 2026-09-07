# FR-10 Referenced Minutes RUNBOOK

## 1. 状态与执行者契约

- 建立日期：2026-09-07。
- 模式：Author；本次只编写，不执行产品实现。
- 调查基线：`b4bed41634d4600e460040b1b93895b42c9671ac`，调查开始时工作树干净。
- 文档分支：`codex/fr10-minutes-runbook`。执行时沿用承载本 RUNBOOK 的独立分支；不得在 `main` 上实现。
- 目标：完成 FR-10.11 和验收点 41 的最小引用式纪要路径；通过 T8 的整项复核后，才允许提升 FR-10 状态。
- 授权边界：用户已要求编写本 RUNBOOK；这不表示已经执行实现、提交、push、创建 PR 或合并。收到执行本 RUNBOOK 的明确指令后才进入 T0。

执行者完整读取本文和关联治理，按 T0 → T8 顺序执行。只修改每步允许文件；既有符号不存在、前置验证失败、正式依据冲突、需要未列出的生产文件或新业务决定时 STOP。不得自行替换入口、扩张引用类型、放宽 Schema/测试、增加依赖、重构相邻路径或修改用户已有工作。

PASS 表示该步命令全部退出 0 且列明断言全部成立；不表示整个 FR-10 已完成。STOP 报告最后 PASS 步骤、触发条件、文件与符号、最小复现命令、实际输出和继续所需决定。保留可审阅改动；禁止用 `git reset --hard`、批量 restore 或删除用户文件恢复。

本文适用 RUNBOOK：变更跨输入协议、领域原子提交、持久化重开、公开投影、归档、Client 和真实 Host 验证，无法由一个局部改动安全完成。

## 2. 目标、范围与当前断点

完整链路：Captain 创建已有普通可选 Participant → Manager 将其安排为当前 Speaker → Speaker 从正式上下文取得已有 message ID → `convivium_submit_turn` 提交带引用的 `summary` → Runtime 原子追加一条带草稿标记的 message → tool/HTTP/Client 读取 → repository 重开保留 → Captain 结束会议 → archive 保留同一草稿和来源消息 → Session 正常 drain。

这里的 Scribe 是普通 Participant 承担的纪要职责，不是新增控制身份。`role` 字符串是显示/溯源信息，不能成为权限凭据；测试可使用 `role: "meeting_scribe"`。任何已经获准成为当前 Speaker 的普通 Participant 都可以提交这个不授予额外权限的草稿格式。无需 Catalog 推荐、动态接纳或 Definition composition。

| 断点 | 当前声明和代码证据 | 本次补齐 |
| --- | --- | --- |
| 需求 | [需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-10.11、Acceptance Criteria 41 | 可选 Agent 形成标明覆盖范围、引用正式对象的草稿 |
| 输入 | `plugin/src/protocol/types.ts::TurnSubmissionV1`、`plugin/src/protocol/commands.ts::TurnSubmissionSchema` 没有 minutes 字段 | 在既有提交根对象加 optional `minutesDraft` |
| 消息事实 | `plugin/src/domain/model.ts::MeetingMessage`、`SpeakerSubmissionContext` 没有引用式草稿数据 | 正文继续用 `content`，只附加草稿元数据 |
| 写入 | `plugin/src/runtime/application-service/meeting-turn.ts::createMeetingTurnApplication` 的 `submitTurn` 已有 preview、execute、receipt 和 outbox | 映射元数据；在相同纯 transition 中校验，不另开 command |
| 公开读取 | `plugin/src/projection/status.ts::message` 是白名单；`plugin/src/protocol/status.ts::message` 是共享 Schema | 显式映射并校验元数据；覆盖 active、execution-terminal 和 archive |
| 归档 | `plugin/src/runtime/services/meeting-archive-service.ts::materializeArchivePackage` 克隆 transcript；`plugin/src/domain/transitions/archive.ts::assertArchivePackageMatchesMeeting` 校验消息 | 保留并比较草稿元数据，拒绝删除或篡改 |
| UI | `plugin/src/client/meeting-panel-view.tsx::mapMeetingPanelView` 统一读取消息；`meeting-panel-sections.tsx::renderObservabilitySections` 渲染 Transcript | 原消息行显示“Minutes draft”、范围和引用，无编辑入口 |
| 覆盖 | [当前覆盖](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) FR-10 为部分实现 | 完成全部门禁后更新，不能据样本或单测直接提升 |

### Scope

- S1：单条 `summary` 的引用式草稿输入、元数据、大小限制和无权限扩张。
- S2：同 Meeting、当前 attempt 可见范围内的正式 message 引用校验；混合非法提交整体拒绝。
- S3：既有原子提交、重放、冲突、恢复、终态、归档一致性。
- S4：Agent tool、loopback HTTP 与 Client 只读显示同一草稿。
- S5：相称自动化验证、真实 DSH 组合与 Browser 观察、readiness 和 FR-10 复核。

### Non-goals

- 不实现 FR-13 admission、FR-14 Definition resolution、per-child preset、Scribe installer、角色权限框架或自动招募。
- 不增加独立纪要集合、表、事件族、ID、revision、command、工具、HTTP route、worker、queue、cache 或配置。
- 首版只引用正式 message ID。验收点 41 使用“message、Fact、Decision、Issue 或 task result ID”；本次选择其中 message 路径，不建立五类引用 union。Fact/Decision/Issue/task result 的直接引用不在本次范围，不能声称已经支持。
- 不自动生成、改写、接受纪要；不保证自然语言概括正确或引用能证明每个句子，不建立语义审核器。
- 不要求全会议覆盖，不合并多份草稿，不覆盖旧草稿；新 attempt 可追加新草稿。
- 不让草稿成为完成事实、正式决议、`finalSummary` 或恢复源。引用校验通过不表示 Captain 接受结论。
- 不读取私聊、Session 历史、隐藏推理或任意文件；不增加草稿专用私聊/任务上下文。
- 不修改 Developer Markdown 白名单、续会选择协议、调度规则、归档 Session 清理、Storage Backend 或历史数据。
- 不宣称真实模型质量、FR-13/FR-14、stress、多用户或发布就绪。

## 3. 真相源与职责

| 依据 | 本次使用 section | 约束 |
| --- | --- | --- |
| [Architecture](../00-governance/ARCHITECTURE.md) | Runtime Boundaries、Dependency Rules | Domain 不依赖 DSH/Protocol/UI；Storage Domain 是事实源；前端仅消费公开投影 |
| [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md) | 全文 | 固定步骤、验证与 STOP；结束后删除临时文档 |
| [Document Rules](../00-governance/DOCUMENT-RULES.md) | Authority、Lifecycle | 本文不取代正式接口和 Domain 设计；T1 先落正式定义 |
| [TODO Rules](../00-governance/TODO-RULES.md) | Verification Check、Closure | 不虚报验证、不提前关闭任务 |
| [需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) | FR-10.1/2/7/8/9/10/11、FR-11.6/7、FR-12、验收点 27/28/41 | 记录完整性、隔离、归档、可选草稿和可见一致性 |
| [Agent Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) | TurnSubmissionV1、Public meeting changes、原子提交、Meeting status、Archive、错误语义 | 当前 Speaker 提交；同一次提交保持原子；`INVALID_ENTITY_STATE` 映射 `INVALID_ARGUMENT` |
| [Agent Role Catalog](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md) | `meeting_scribe` 责任 | 可选普通 Participant；摘要不获得正式记录、Captain 或 Manager 权限 |
| [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) | Boundary、Repository Port、commit/recovery | state/event/receipt/outbox 同一 commit；不增加持久化通道 |
| [Domain Model](./DOMAIN-MODEL-DESIGN.md) | Authority、MeetingMessage、Persistence And Mapping | Domain 是内部结构真相源；引用属于同 Meeting |
| [Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) | Archive And Session Cleanup | 归档自包含、不可变；Session cleanup 不能依赖草稿生成 |

DSH 使用点保持不变：`@deepseek-ai/dsh-tools@0.1.1-rc.2` 的 `defineTool`/registry，当前 `registerSubmitAndControlTools` 注册 `convivium_submit_turn`，`execute(args, exec)` 调既有 validator/runtime，canonical output 与 `renderOutcome` 不变。当前工具输入是 `input` 对象，不新增 native tool parameter 系统。`plugin/src/dsh/session-adapter.ts::followupParticipantSession` 和 `startParticipantSession` 只作为既有组合依赖，不修改其 API。Client 保持既有 slot registration。

## 4. 固定数据与业务语义

### 4.1 输入与内部类型

以下是必须实现的精确新增结构，不是 pseudocode。Protocol 类型放在 `plugin/src/protocol/types.ts`：

```ts
export interface MinutesDraftInputV1 {
    readonly coverage: {
        readonly fromSeq: number;
        readonly throughSeq: number;
    };
    readonly referencedMessageIds: readonly string[];
}

export interface PublicMinutesDraftV1 extends MinutesDraftInputV1 {
    readonly status: "draft";
}
```

`TurnSubmissionV1` 增加 `minutesDraft?: MinutesDraftInputV1`；`PublicMeetingMessageV1` 增加 `minutesDraft?: PublicMinutesDraftV1`。不修改 `PublicMeetingChangesV1`，不新增 `TurnSubmissionResultV1` 字段。

Domain 在 `plugin/src/domain/model.ts` 新增独立同构类型，不导入 Protocol：

```ts
export interface MeetingMinutesDraft {
    readonly status: "draft";
    readonly coverage: {
        readonly fromSeq: number;
        readonly throughSeq: number;
    };
    readonly referencedMessageIds: readonly string[];
}
```

在 `plugin/src/domain/meeting-state-validation.ts` 新增 `export function isMeetingMinutesDraft(value: unknown): value is MeetingMinutesDraft`，只检查第 4.1 节内部草稿的 exact keys、status、范围整数/顺序、引用数组元素/数量/唯一性，不读取 Meeting 或 DSH。两个当前消费者是下文 `assertMinutesDraft` 和持久 V2 state guard。`isMeetingStateV2` 对已经存在的 transcript 数组和 archive.package.formalTranscript 数组中的每个 present minutesDraft 调用它，任一非法返回 false，由既有 `PersistenceProjectionV1Schema` 拒绝读取。不存在 metadata 时不插入默认值；不借此重写其余旧字段验证。其他 Meeting 引用和 attempt 范围仍只由提交 transition 检查。

`MeetingMessage` 和 `ArchiveMessage` 增加 `minutesDraft?: MeetingMinutesDraft`；`SpeakerSubmissionContext.message` 的 `Pick` 增加 `"minutesDraft"`。`SubmitSpeakerAdvanceContext` 通过继承获得该字段，不另存副本。`MeetingState.transcript`、`ArchivePackage.formalTranscript` 和所有使用 `PublicMeetingMessageV1` 的 context 自动承载它，不新增顶层数组。

| 字段/来源 | 必需性、默认和所有权 |
| --- | --- |
| `minutesDraft` | optional；缺失保持缺失，禁止填 `null`、`{}` 或默认草稿 |
| `coverage.fromSeq/throughSeq` | 草稿存在时 required；安全整数，`1 <= fromSeq <= throughSeq`；caller 声明 |
| `referencedMessageIds` | required；1–64 个不重复字符串，每个 1–256 个 UTF-16 code units，不能全为空白；保持提交顺序，不排序、不去重、不 trim |
| `status` | caller 输入不允许；Runtime 生成 literal `draft`；持久和公开输出 required |
| `content` | 唯一草稿正文；保留原字符；携带草稿时必须含非空白字符且长度不超过 8000 UTF-16 code units |
| message identity | 复用 `message-${input.deliveryId}`，不生成 minutes ID；对外视为不透明 ID |
| speaker/agenda/seq | 由当前匹配 Participant、Turn、Step、Attempt 和 `state.messageSeq + 1` 产生，caller 不得覆盖 |
| `createdAt` | 现有 commandNow：`options.now?.() ?? Date.now()`；preview 与 commit 复用一次取值 |
| version、幂等 | 既有 repository expected version；requestId=`input.deliveryId`；requestHash=`JSON.stringify(input)`，包含草稿输入；无额外 requestId |

输入草稿对象仅允许 `coverage`、`referencedMessageIds`；coverage 仅允许 `fromSeq`、`throughSeq`。输出草稿仅允许上述字段加 `status`。未知字段、null、类型错误和超限均拒绝。添加两个 Schema 到 `plugin/src/protocol/schema.ts`：`MinutesDraftInputSchema: Schema<unknown, MinutesDraftInputV1>`、`PublicMinutesDraftSchema: Schema<unknown, PublicMinutesDraftV1>`；保持既有 exact-key 校验方式，Protocol 两个消费文件直接从 `schema.ts` 导入，不增加 package export。

### 4.2 提交校验与草稿边界

1. 普通提交不带 `minutesDraft` 时保持原行为。带草稿必须 `kind === "summary"`；`changes` 的六种数组均缺失或为空，`completionClaims` 必须缺失，`taskIds` 必须为空，`replyTo` 必须缺失，`agendaRelation === "on_topic"`。`mentions` 继续使用已有规则。
2. 仍由当前合法 Participant Session 发言；Manager、Captain Session、其他 Meeting 或非当前 Speaker 不能借草稿绕过既有校验。
3. 在 `submitSpeakerAttempt` 完成现有终态、attempt 和 message 重复检查后、调用 `transitionAttempt` 前，调用新增私有函数：

```ts
function assertMinutesDraft(
    state: MeetingState,
    attempt: SpeakerAttempt,
    context: SpeakerSubmissionContext
): void;
```

4. 该函数只读：先用 `isMeetingMinutesDraft` 校验内部结构，再校验 kind、正文上限和第 1 点中 message 自身字段通过后，要求 `fromSeq >= Math.max(1, attempt.contextFromSeq)`、`throughSeq <= attempt.contextThroughSeq`。从提交前 `state.transcript` 筛出区间并按 seq 排序，数量必须为 `throughSeq - fromSeq + 1`，第 i 项 seq 必须等于 `fromSeq + i`。不创建从 1 到用户输入上限的大数组。
5. 每个引用必须唯一地解析到该区间的一条既有 transcript message；不存在、其他 Meeting、区间外、当前新消息自身、私聊 ID、Fact/Decision/task ID 全部拒绝。消息是否属于同 Meeting 通过当前聚合查找确定，不从 ID 前缀推断。
6. 覆盖范围表示草稿声称概括的连续正式消息区间，引用数组是其中被显式引用的消息子集；不要求逐条引用整个区间。范围可小于全会议，只在 UI 显示这个范围，不写“完整会议纪要”。首个 Speaker 没有可引用消息时不能提交结构化草稿，仍能提交普通发言。
7. `submitSpeakerAndAdvanceMeeting` 在取得 `speakerSubmission` 后、应用 Question/Issue 等 claims 前，拒绝草稿与任一非空 claim 数组或任何 `completion` 同时出现。纯 transition 的临时结果不是 commit；失败时不返回部分 state/event。
8. 上述语义失败抛 `DomainError("INVALID_ENTITY_STATE", "Invalid minutes draft.")`；不向错误消息放入正文或引用对象内容。公开沿用非 retryable `INVALID_ARGUMENT`。身份、stale、version、terminal 错误沿用既有映射；不新增错误码或改变已有优先顺序。

草稿只记录“该 Participant 提交了这份草稿”。Runtime 自动追加 transcript 是正式记录行为；草稿正文不替代旧消息、CompletionFact、Decision、risk、objective 或 termination。无自动 promote/accept、无正文解析。后续显式正式操作仍受其原有权限和证据规则约束。

### 4.3 调用、事务、重放与生命周期

```text
registerSubmitAndControlTools / convivium_submit_turn
  -> TurnSubmissionSchema（可选草稿结构验证）
  -> createMeetingTurnApplication.submitTurn（输入复制，status=draft）
  -> submitSpeakerAndAdvanceMeeting preview（既有条件下）
  -> MeetingRepositoryPort.execute / commandKind=submit_turn
     -> 既有 caller/capability、receipt、version 逻辑
     -> submitSpeakerAndAdvanceMeeting
        -> submitSpeakerAttempt / assertMinutesDraft
        -> 拒绝混合 claims
        -> 原有 task/turn advancement
     -> 一个 commit：state + 既有 events + receipt + 既有 outbox
  -> projectMeetingStatus / message
     -> tool、loopback GET、projectSpeakerMeetingContext / recentMessages
     -> mapMeetingPanelView / renderObservabilitySections
  -> materializeArchivePackage
     -> assertArchivePackageMatchesMeeting
     -> archive.package.formalTranscript / 同一 status schema 和 Client
```

新增草稿不产生专有 event。`speaker_attempt.submitted`、`speaker.submitted`、`message.added` 及原有 turn/meeting events 的顺序和 payload 不变；`message.added` 的 `meetingId/messageId/attemptId/meetingVersion` 足以关联附在消息上的元数据。不附加新的 outbox 项，不把草稿另发一次。

preview 不能写状态或读取新外部来源；repository 内相同纯函数再次执行校验。任一引用非法或 commit put 失败时，message、state.version、event、receipt 和 outbox 都没有部分成功。相同有效身份和相同 delivery/input 重试按既有 receipt 重放，不重新生成草稿；修改正文、范围、引用内容或引用顺序按现有 hash 规则触发冲突。失去权限后的重试不能绕过授权。不要为草稿在 receipt 前新增依赖 current attempt 的独立 Runtime guard。

执行终态不收新草稿；archive 不等待 Scribe。缺席没有草稿，失败沿用 timeout，替换沿用 reassign/revoke；均不影响已经提交的正式记录。新草稿追加，旧草稿不编辑、删除或隐式 supersede。

### 4.4 Projection、归档和兼容

- `status.ts::message` 逐字段复制 status、coverage 两个数值、引用数组；无 spread caller 对象、无私有运行字段。Speaker/Manager 既有公开消息投影自然携带该字段，不新建读取路径或扩大消息范围。
- `protocol/status.ts::message` 加 optional `PublicMinutesDraftSchema`，同时覆盖 `messages`、`recentMessages` 和 `formalTranscript` 的使用路径；公开状态分支不新增顶层副本。
- `materializeArchivePackage` 当前克隆 transcript 能保留该字段；本次仅增加测试，不改其生命周期实现。
- `assertArchivePackageMatchesMeeting` 的消息比较增加 optional 草稿逐字段等值检查：presence、status、两个边界、引用数组长度及同序元素必须一致；两侧都 absent 才相等。任何丢失、注入或篡改拒绝归档。
- Client 在原 Transcript 消息行中保留正文，只对带元数据的消息追加三行：`Record type: Minutes draft (non-authoritative)`、`Coverage: messages <fromSeq>–<throughSeq>`、`Referenced message IDs: <按原顺序以逗号分隔>`。这里尖括号是渲染值的说明，不是执行命令占位符。用 React 文本节点显示，不解析 HTML/Markdown，不生成任意 URL。
- 无草稿消息不显示上述行。`archiving|archived` 继续从 archive 取消息；刷新、重选会议和 polling 使用现有完整状态读取。
- 维持 `protocolVersion: 1`、`MeetingState.formatVersion: 2` 和 `ArchivePackage.schemaVersion: 1`；新增仅为 optional message 字段。新版本读旧数据保持 absent，不写回、不迁移、不重新校验旧消息为草稿。新输入 absent 与 present 是不同请求，不能通过默认值合并。
- 现有 `MAX_COMMIT_VALUE_BYTES = 65_536` 等存储边界保持不变；字段数量/字符上限不保证任意组合都低于 commit 字节上限，超限仍走既有存储失败路径且不得半提交，不提高存储上限。
- 新增字段写入后不声明支持旧程序降级读取；Host/Client 必须使用同一构建版本。数据库迁移、SQLite 迁移、跨 Host writer：`Not Applicable`，本次不改变既有 storage format 或部署边界。

### 4.5 Smoke 的固定消息比较规则

T7 scenario 与 `validateScenarioResult` 在各自现有函数内使用以下相同规则，不新增 production mapper 或公共比较模块：

1. source/draft oracle 从提交后的公开 `status.result.messages` 取值，完整保留该公开对象。
2. 对 HTTP、active status 和 archive 的对应消息，按 ID 查找且要求恰好一项。比较字段固定为 `id`、`seq`、`turnId`、`stepId`、`speaker`、`agendaItemId`、`kind`、`content`、`mentions`、`replyTo`、`taskIds`、`createdAt`、`minutesDraft`。每个字段先比较 own-property presence，再比较值；标量严格相等，数组要求同长度、同顺序。metadata 要求 status、coverage.fromSeq/throughSeq、referencedMessageIds 同序完全一致。普通 source 两侧均无 metadata。
3. archive 当前保留原始领域消息的 `turnSeq`、`attemptId`、`agendaRelation` 等额外字段；这些字段不参与上述公开字段比较。不得将整个 archive message 与公开 oracle 做深相等，也不得因此改变 archive 的生产投影。
4. T7 的 scripted scenario 和 result validator 测试必须包含 archive 额外内部字段仍通过、公开正文变化/optional 字段 presence 变化/metadata 丢失或篡改均失败。Schema 验证仍按 T7 执行，比较规则不能替代 Schema。

## 5. 不变量与追踪

| Scope | 正式依据 → 实现 → focused verification |
| --- | --- |
| S1 | FR-10.11、AC41 → Protocol DTO/Schema、Domain message → T2 schema、T3 transition |
| S2 | FR-10.2、FR-12、Protocol Speaker ownership → `assertMinutesDraft`、混合 claims guard → T3/T4 非法引用、身份、原子性 |
| S3 | FR-10.7/9/10、Storage contract → `submitTurn`、repository、archive guard → T4 重放/回滚/重开，T5 archive |
| S4 | FR-11.6/7 → status mapper/Schema、Client → T5/T6 的 tool/HTTP/Client 一致性 |
| S5 | FR-10 完成标准、TODO verification → 专用 smoke、readiness → T7/T8 |

每个步骤只覆盖对应 Scope；引用式草稿的当前消费者是 Speaker input、正式消息读者和 archive，不构成新增 registry、服务或独立存储的理由。所有既有状态推进、发言计数、预算、capability 和 Session ownership 保持原机制。草稿不阻塞归档，草稿正文不可被隐式当作 final summary。

## 6. 机械执行步骤

### T0：锁定前置工作边界

前置状态：已获得执行本 RUNBOOK 的明确指令。
允许修改：无。
禁止修改：所有业务代码、依赖、运行 profile 和用户工作。

执行：
1. 读取第 3 节依据、根和 docs 的 AGENTS，以及 `.agents/skills/convivium-runbook/SKILL.md`、`.agents/skills/dsh-plugin-development/SKILL.md`、`.agents/skills/right-size-changes/SKILL.md`。
2. 核对文档分支或后续独立实现分支、工作树和调查基线之后的目标文件变化。仅允许 RUNBOOK 文档本身与调查基线不同；任何拟改生产/测试文件已变化时停止并重新审计本文。
3. 从仓库根执行以下命令及第 7.1 节固定回归命令，记录基线结果；逐项确认 R1–R10 的现有精确用例在 verbose 输出中为 PASS（R6 标注的新增用例待 T6）。R4/R8 静态依据按第 7.1 节的固定断言核对；不搜索替代用例。

验证：
```bash
git status --short
git branch --show-current
git diff b4bed41634d4600e460040b1b93895b42c9671ac -- plugin docs/10-requirements docs/20-interfaces docs/30-designs/DOMAIN-MODEL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
pnpm --dir plugin verify
```

PASS：位于独立分支；指定 diff 无变更；verify 全部退出 0；manifest/lockfile 的目标 DSH 仍为 `0.1.1-rc.2`。
STOP：工作边界冲突、DSH 基线变化或任何 baseline 失败。报告输出，禁止把已有失败并入本次修复。此步无回滚。

### T1：落定正式接口与 Domain 结构

前置状态：T0 PASS。
允许修改：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`。
禁止修改：需求范围、治理、FR-13/FR-14 契约和 readiness 完成状态。

执行：
1. Protocol 的 TurnSubmission、公共 message/Archive 和错误/兼容 section 固定第 4 节公开结构与全部校验、兼容规则；明确采用 message ID 引用路径，草稿由已授权当前 Speaker 提交。
2. Domain Model 的 MeetingMessage 与 Archive 说明添加 `MeetingMinutesDraft` 的精确结构、optional 属性、ownership 和不可变规则。
3. Orchestration Design 在 summary/Archive 说明处引用上述正式定义，记录现有 submit chain 和无额外 lifecycle。该文档若有消息类型片段，只加 optional 字段引用，不重复定义新增结构。

验证：
```bash
git diff --check
rg -n 'MinutesDraft|minutesDraft|引用式|草稿' docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md docs/30-designs/DOMAIN-MODEL-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
```

PASS：结构、值来源、错误、兼容和读写归档规则与第 4 节逐项一致；文档明确区分已确认契约与尚未完成实现。
STOP：需要要求五类引用、Scribe 专有权限或其他产品行为才能解释正式需求。停止并报告冲突 section，不削减需求来迁就实现。失败保留文档 diff。

### T2：输入与输出协议增量

前置状态：T1 PASS，正式契约存在。
允许修改：`plugin/src/protocol/types.ts`、`plugin/src/protocol/schema.ts`、`plugin/src/protocol/commands.ts`、`plugin/src/protocol/status.ts`、`plugin/tests/contract/protocol-schema.spec.ts`。
禁止修改：工具数量、Protocol version、错误码、共享 `changes` 语义和其他命令。

执行：
1. 实现第 4.1 节两种 Protocol 类型和两个 Schema。保持 readonly，unknown key 不被静默丢弃后当作成功。
2. `TurnSubmissionSchema` 使用 optional 草稿 Schema；`status.ts::message` 使用 optional 输出 Schema。仅对草稿输入增加正文、kind、taskIds、replyTo、agendaRelation、claims 的 cross-field 校验；Domain 在 T3 独立保留语义校验。
3. 在现有 spec 增加 `referenced minutes schema` suite：合法最小值/边界值；缺失字段、null、未知字段、伪造 status、空/重复/超限引用、安全整数与顺序、空白/超长正文、错误 kind、非空 changes、任何 completionClaims、非空 taskIds、replyTo、错误 agendaRelation。对每个六类非空 changes 分别拒绝。输出 status 必须 draft，active 与 archive message 均保留。
4. 验证旧 TurnSubmission 和旧 status/archive 无新增默认属性；一个数组元素合法而另一个非法时整份输入失败。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts
pnpm --dir plugin typecheck
```

PASS：全部新增正负用例通过；所有旧用例通过；无新增工具或默认字段。
STOP：Schema 无法严格校验、需要改变现有正常输入或必须放宽类型。失败保留代码，禁止修改快照隐藏字段丢失。

### T3：领域消息附加与原子拒绝

前置状态：T2 PASS。
允许修改：`plugin/src/domain/model.ts`、`plugin/src/domain/meeting-state-validation.ts`、`plugin/src/domain/transitions/speaker-attempt.ts`、`plugin/src/domain/transitions/speaker-submission.ts`、`plugin/tests/unit/domain/transitions/speaker-attempt.spec.ts`、`plugin/tests/unit/domain/transitions/speaker-submission.spec.ts`。
禁止修改：completion 算法、planning、mail、task、turn advancement、事件词汇与持久化模块。

执行：
1. 实现 Domain 类型、Pick、`isMeetingMinutesDraft` 与 V2 guard 的新增字段检查；`assertMinutesDraft` 仅置于 `speaker-attempt.ts`，签名和职责固定为第 4.2 节。不得 export 为通用验证框架。
2. 在指定位置校验并逐字段复制元数据到新 message；数组和 coverage 不共享 caller 可变引用。
3. `speaker-submission.ts` 在 `speakerSubmission` 返回后、Question 应用前加入混合 claims 拒绝；不让非法草稿产生返回值中的部分领域变更。
4. 用已有测试的当前 Speaker fixture 加至少两条连续 source message；测试范围 `[1,2]`、单条范围 `[2,2]`、稀疏引用子集、范围洞、越界、未知/私聊/其他 Meeting/self ID、重复引用、纯 transition 绕过 Schema 的非法值。
5. 保留输入 state 的深拷贝并断言失败后完全相等；成功只按原发言规则追加一次 message，元数据不修改旧消息、facts、decisions 和 objective。改变调用后的输入对象不改变提交结果。
6. 对纯 transition 测试 stale meetingVersion、错误 attempt、terminal 拒绝和六类混合 claim；普通 summary 缺少 metadata 仍保持普通发言行为，绝不自动识别成结构化草稿。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/speaker-attempt.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts
pnpm --dir plugin typecheck
```

PASS：正常追加和所有失败断言通过；events 与无草稿等价提交相同，不出现新的 event type。
STOP：需要让草稿独立更改 facts、任务或收敛规则；任何纯函数修改输入。失败无外部副作用，不回滚用户工作。

### T4：Runtime 接线与持久恢复

前置状态：T3 PASS。
允许修改：`plugin/src/runtime/application-service/meeting-turn.ts`、`plugin/src/tools/register-tools.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/tool-registration.spec.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`。
禁止修改：repository production、Storage Backend、authorization 顺序、receipt、outbox、Session 创建和工具注册结构。

执行：
1. `submitTurn` 的 `advanceContext.message` 条件加入复制后的 `{ status: "draft", coverage, referencedMessageIds }`，只在 input.present 时添加；preview 与 execute 复用。保留 deliveryId requestId 和原 requestHash。
2. 只更新 `convivium_submit_turn` 的 description 为 `Submit one formal turn message only from the current meeting Participant Session. For a non-authoritative minutes draft, use kind=summary and minutesDraft={coverage:{fromSeq,throughSeq},referencedMessageIds:[messageId]}; cite existing messages in the delivered context, use on_topic, empty changes/taskIds, and omit replyTo/completionClaims.`；canonical output/render 不变。
3. Tool registration spec 通过真实 registered definition 的 `execute` 验证字段传递、非法 Schema 在调用 runtime 前拒绝、canonical output 和 render 文本仍符合原契约。
4. Runtime spec 使用本文件 `localRuntime`、`openTestRegistry` 和现有创建/发言 setup，覆盖合法提交、Manager/Captain/其他 Meeting/非当前 Participant 拒绝，非法提交没有新 version/message，合法草稿只写一次。
5. 同一 delivery/input 立即重放，断言 receipt 结果和 version 不变；同一 delivery 修改正文、coverage、引用数组分别冲突。先推进下一个 Speaker 再重放仍返回原 receipt；撤销权限后的请求按既有规则失败。
6. Repository contract spec 将既有测试 helper `maintenanceFixture` 增加 optional `initialState: Record<string, unknown> = { count: 0 }` 参数，只替换 create input 的 initialState，原调用行为不变。为 minutes 用例传入 version=0 的完整当前 Speaker state（包含 source transcript 和 running attempt），用真实 submit transition 产生 draft commit，利用返回的 `meeting.failPutsInTable("commits")` 注入失败：`loadProjection({ domain: meeting })` 的 snapshot/events/receipts/outbox 与前值一致；恢复 `allowPutsInTable("commits")` 后相同请求重试一次成功。
7. 使用现有 `openReadyState` 额外覆盖 V2 transcript/archive 中的 null、伪造 status、缺字段和重复引用元数据被持久 Schema 拒绝；旧 message absent 保持可读。
8. 关闭后从 fake domain 的全部 table entries 创建新的 fake domain 并用原 `DomainMeetingRepository.open` 参数重开，精确保留正文与 metadata。分别覆盖只有 commit tail，以及 checkpoint 后重开。checkpoint 用例从创建 seq=1 加一次 draft commit 开始，追加 126 个 test-only `minutes_checkpoint_probe` command：requestId 和 requestHash 均为 `minutes-checkpoint-${i}`（i=1..126），每次 command 显式设置 `allowNoop: true` 和当前 snapshot.version 作为 expectedMeetingVersion，transition 原样返回 snapshot.state（不修改 state.version/updatedAt），返回空 events/outbox 和 `{ index: i }` result。126 次调用前后 snapshot、meetingVersion、events、outbox 必须深相等，receipts 数量增加 126，各 receipt 的 meetingVersion 等于 draft commit 后的版本。这里增长的是 commit seq，不是会议版本；执行 `repository.close()` 等待 maintenance，断言 checkpoint_pointer 存在且 baseSeq>=128，再重开。不得调用现有会把 state 替换成 `{ count }` 的 `appendVersion`。这些 helper/command 仅存在于本测试文件。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/tool-registration.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin typecheck
```

PASS：各身份/原子性/重放/冲突/两种重开断言成立；没有新的草稿 outbox 和存储表。
STOP：需要更改 repository 通用语义、repair、migration 或绕过 capability。fixture 的注入失败在 finally 中解除，registry/repository 和临时目录按现有测试 finally 清理。

### T5：公开投影与不可变归档

前置状态：T4 PASS。
允许修改：`plugin/src/projection/status.ts`、`plugin/src/domain/transitions/archive.ts`、`plugin/tests/contract/status-projection.spec.ts`、`plugin/tests/unit/domain/transitions/archive.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`。
禁止修改：archive worker/drain/revoke、finalSummary、续会协议、private mail、Developer Markdown。

执行：
1. `message` 白名单加逐字段 metadata mapper；直接复用既有 status/context 调用，不增加公开数组或派生存储。
2. `assertArchivePackageMatchesMeeting` 按第 4.4 节比较 draft presence 和全部字段，错误沿用当前 `INVALID_ENTITY_STATE`。
3. Projection spec 对 Participant/Manager/Captain/local_host、active/execution-terminal、Speaker `recentMessages` 固定范围、archiving/archived 运行真实 Schema；断言相同 message 的 metadata 一致，没有 Session、capability、mail 正文或隐藏过程。
4. Archive specs 经 `materializeArchivePackage` 物化后验证草稿与全部 source messages 都在包内；tamper status、边界、数组顺序、移除 metadata 或向普通消息注入 metadata 全部被 guard 拒绝；修改源 state/输入数组不改变已 snapshot 的 archive。
5. 正常 end/archive 包含草稿；不存在草稿、Scribe 缺席、timeout、reassign 后仍可结束并保持原 transcript。沿用现有 Session 关闭失败后重试测试，并加入 metadata equality 断言。旧 archive 无字段照常接受，不补写。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts
pnpm --dir plugin typecheck
```

PASS：全部投影/归档分支保留同一 metadata；失败和缺席不引入新归档等待条件。
STOP：必须让 archive 重建草稿、读取外部内容或改变 Session 清理才能通过。测试 finally 恢复临时目录和 fake ports。

### T6：Client 只读草稿标识

前置状态：T5 PASS。
允许修改：`plugin/src/client/meeting-panel-sections.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。
禁止修改：slot、路由、polling、列表、write control、独立 store 和样式重构。

执行：
1. `renderObservabilitySections` 的 Transcript 原消息行实现第 4.4 节三行文本，保留原字段；无需修改 `mapMeetingPanelView`。
2. Client spec 检查 active 与 archived 输入均显示正文、draft 标记、范围及有序引用；普通消息无草稿标记；包含 `<script>` 的正文按文本显示；重读新状态和切换会议后不残留旧 metadata。
3. 新增固定标题 `keeps minutes separate from speaker, pending decisions, tasks, waiting and accepted decisions`：基于本文件 `statusResult` / `factStatus` 的有效 fixture，加入一条待定 decision candidate、一条 MeetingTask、一条 draft 和一条 accepted decision，各正文使用不同标记；经真实 status Schema 后 render。断言 `Current activity` 的 Current speaker 是当前 participant；`Pending decisions` 只含候选 statement/rationale，`Meeting tasks` 含任务 title/status，`Accepted decisions` 只含正式决定，draft 仅在 `Transcript`。再以无 currentTurn 的 waiting fixture render，断言 Waiting reason/participants，Current speaker 为 None。候选建议/任务/正式决定标记不得混入 draft 行，draft 标记不得出现在上述三个事实 section。不新增展示字段；若现有行为无法满足则 STOP。

验证：
```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck
```

PASS：上述 DOM 断言通过；无新增按钮、链接目标和网络写入。
STOP：必须新增顶层 state、HTTP 或 slot 才能展示。卸载测试组件、恢复 fetch mock 和 timers；不改生产轮询行为。

### T7：真实 DSH 引用草稿场景

前置状态：T6 PASS。
允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/result.mjs`、`plugin/scripts/smoke-profile/probe/index.js`；新增 `plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js`、`plugin/tests/unit/scripts/scribe-minutes-probe.spec.ts`；修改 `plugin/tests/unit/scripts/smoke-profile.spec.ts`、`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`。
禁止修改：既有 selector 行为、CORE_SCENARIOS、Host profile/provider、production Session adapter、凭证和 cleanup 基础设施。

执行：
1. 新增唯一导出 `async function runScribeMinutesScenario(runtime)` 到指定新 scenario 文件。沿用 `runArchiveContinuationScenario` 的 `runtime.callTool`、`waitForAgent`、`waitForSpeakerContext`、`callHttp`、`writeResult` 和 30 秒有界等待模式，不复制第二个 Host launcher。
2. wrapper 的 `SMOKE_SCENARIOS` 追加 `scribe-minutes`，`CORE_SCENARIOS` 不变；`probe/index.js` import、selector allowlist、dispatch switch 接入新函数，`driveParticipant` 对本 selector 立即返回，让 scenario 独占驱动。wrapper 加载 status Schema 的条件包含本 selector。
3. 输入从 `runtime.createInput()` 复制，participants 只保留 a/b，b 的 role 为 `meeting_scribe`；agenda requiredParticipantKeys 只保留 a，objective/criteria 固定为原 fixture，不自动完成。plan 按 a → b 安排；a 普通提交 `source-a`，b 从 `waitForSpeakerContext` 返回值取 turn/step/attempt/delivery/agenda，不推导新 ID。
4. b 引用该上下文中的 a message，coverage 为该 message.seq 的单点区间。先以 `missing-source` 引用尝试，直接调用既有 `ctx.tools.execute({ callId, name: "convivium_submit_turn", arguments: { input }, agent: bAgent, signal })`，callId 使用 `runtime.nextCall()` 拼接 `convivium-smoke-`，signal 来自本次 AbortController；必须 `isError === false` 且 canonical `value.code === "INVALID_ARGUMENT"`、`value.ok === false`，不解析 `callTool` 抛出的 prose；随后 Captain status 证明 messages/version 与失败前相等。再合法提交 `content: "Minutes draft based on source-a"`、`kind: "summary"`、`changes: {}`、空 taskIds/mentions、on_topic、无 replyTo/completionClaims。同一输入重放一次，结果和 version 相等。
5. 按第 4.5 节比较 Captain status 与 loopback GET 的 source/b message。保存实际 source/draft ID、seq、正文和 metadata 作为 oracle；核对 b 的 delivery context 有 a message 且没有私有内容。
6. 普通模式：Captain end，`outcome: "partial"`、reason=`"scribe minutes smoke"`、空 acceptedDecisionIds/deferredAgendaItemIds/waivers、requestId=`"scribe-minutes-end"`；等待 archived。按第 4.5 节对比 archive 的 source 和 draft 与保存 oracle，确认 manager/a/b 无 resident Agent 且 `listChildren` 均 inactive；不得因草稿而改为 completed。
7. Browser 模式：按 baseline 的既有 session append/flush/workspace attach 步骤暴露 Captain 页面；合法提交及 HTTP 比较完成后输出 `browserReady: true`，保留会议供 T8 UI end。不要在 Browser 模式提前归档。
8. 普通 result 必含 `ok: true`、`scenario: "scribe-minutes"`、`browserReady: false`、`meetingId`、`observed: { source, draft, afterSubmit, afterReplay, status, archived, drainedSessionIds }` 和精确 assertions 数组 `["minutes-context-visible", "minutes-invalid-atomic", "minutes-replay-stable", "minutes-http-equal", "minutes-archive-equal", "minutes-sessions-drained"]`。source/draft 是完整公开 message；afterSubmit/afterReplay 是两次 submit_turn 的真实 `ProtocolSuccessV1<TurnSubmissionResultV1>` receipt envelope，status 是提交后 Captain 读取的 `ProtocolSuccessV1<MeetingStatusResultV1>`，archived 是归档后同类型读取结果，drainedSessionIds 是 string[]。Browser result 使用 `browserReady: true`、同一 observed 但不含 archived/drainedSessionIds，断言为前四项；额外 `captainSessionId: "convivium-smoke-captain"`。
9. `validateScenarioResult` 新增本 selector 分支：校验 required keys、精确 assertions，用已加载的 `MeetingStatusResultSchema` 校验 observed.status.result 和普通模式 observed.archived.result；afterSubmit/afterReplay 的 protocolVersion=1、ok=true、meetingId 匹配、meetingVersion 为安全整数，两份 envelope 深相等且 result.messageId/messageSeq 匹配 draft，turnStatus 为 completed、meetingStatus 为 running；observed.status 的 meetingVersion 不小于 receipt 的 meetingVersion，不要求两个不同时间的状态读取 version 相等；source/draft 均与 observed.status.result.messages 中对应项深相等；source.seq 被 coverage 覆盖且引用数组只有 source.id；metadata.status 为 draft；普通模式按第 4.5 节校验 archive 的 source/draft 公开字段等值、status=archived、drainedSessionIds 为三个不重复非空字符串。不得只检查 `ok` 或 marker。
10. 新 spec 用 scripted runtime 顺序模拟 scenario 调用，验证非法前后读取、合法/重放、HTTP、end、archive、drain 与 Browser 分支；result validator 测试删除任一 assertion、丢字段、篡改元数据/version、丢 source、未 drain 数量以及 malformed status 均拒绝。现有 selector 测试只同步新增 selector 的精确期望。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/scribe-minutes-probe.spec.ts tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile
```

PASS：focused suite 通过，真实 `web`/`spawn` run 的六项 oracle 全成立，wrapper 输出 selector PASS、`restore=PASS` 并退出 0。
STOP：真实工具/Session/HTTP 无法完成、超时、缺少 provider 或凭证、cleanup 失败。不得改用假 Host 声称真实 PASS，也不得增加或读取新凭证；按 wrapper 原有 finally Restore，仅处理本次运行创建的资源。失败保留脱敏日志，不提升覆盖。

### T8：完整验证、证据与删除

前置状态：T7 PASS。
允许修改：`plugin/README.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`；新增 `docs/40-readiness/REFERENCED-MINUTES-VALIDATION-EVIDENCE.md`；本 RUNBOOK。T1–T7 列出的 plugin 文件只允许 Prettier 格式化，不允许新增行为。
禁止修改：无关 coverage 结论、TODO 空面板、其他 FR 状态、依赖、提交和 PR。

执行：
1. README 说明既有 submit_turn 的草稿字段、只支持 message 引用、无角色权限提升及非权威限制；链接正式 Protocol，不复制第二份 Schema。HOW-TO-DSH-SMOKE 的 selector 表追加 `scribe-minutes`，说明普通/Browser 两模式、六项 oracle 和现有 Restore；同步该文件与 coverage 中的完整套件数量为 15，默认核心仍为 5，不更改历史证据数量。
2. 执行下列固定 Prettier 命令，只格式化允许清单中的文件；不得全目录 format。
3. 运行下面完整验证。然后用 PTY 启动 Browser 命令，按现有 [运行操作](../50-operations/HOW-TO-DSH-SMOKE.md) 的 Browser session/view 入口进入 Meetings；读取 wrapper 实际 URL，不猜端口。
4. 观察 b 消息三行固定草稿文本、正文和 a source ID；刷新后保持一致；通过已有 End 控制结束为 partial，理由 `scribe minutes smoke`；等待 archived，刷新后 metadata 和来源消息仍存在。记录实际 UI 状态和 console。Browser 无法进入时 STOP，不能用 jsdom/HTTP 替代。
5. 按既有 PTY SIGINT 流程退出，等待 wrapper 完成 Restore，确认本次精确临时根消失；不要用 kill-all、通配路径删除或更换生产 profile。
6. 新 evidence 使用 Scope/Validated Contract/Executed Validation/Not Covered/Closure，记录日期、实现 commit（未提交则注明基线加工作区 diff）、DSH/Node/pnpm、每条实际命令、测试计数、oracle、Browser 和 cleanup 结果。明确真实 DSH Session/工具接线不等于真实模型生成质量。
7. 执行第 7.1 节固定回归命令，将 R1–R10 每行列出的精确用例 PASS 和 R4/R8 静态文件基线一致结果写入 evidence；R11 按该行指定的 T2–T8/V1–V15 结果收口。无需临场寻找测试或决定覆盖口径；缺失、跳过或失败任一指定用例即 STOP。静态证据与动态测试分开记录，保留 R4 的明确 Not Covered，不把历史 smoke 当当前新运行证据。发现超出本次范围的实际缺陷则保留 FR-10 部分实现并 STOP，禁止扩张本文。
8. 全部通过后 coverage 的 FR-10 改“已实现”，当前覆盖说明 message-reference draft、status/Client/archive 与证据链接；主要缺口中移除本次已完成项。保留直接其他类型引用、模型质量和长期压力的真实未覆盖边界，不能把这些描述为已运行。
9. 本文和长期文档链接检查、`git diff --check` 全部通过后，查找本文文件名引用；只删除纯指向临时执行任务的链接，不删除正式来源。保存删除前本文内容到执行者上下文，然后删除本 RUNBOOK；再次查链接与 diff。删除后检查失败必须恢复本文及刚删除的引用并 STOP。

验证：
```bash
pnpm --dir plugin exec prettier --write README.md src/protocol/types.ts src/protocol/schema.ts src/protocol/commands.ts src/protocol/status.ts src/domain/model.ts src/domain/meeting-state-validation.ts src/domain/transitions/speaker-attempt.ts src/domain/transitions/speaker-submission.ts src/runtime/application-service/meeting-turn.ts src/tools/register-tools.ts src/projection/status.ts src/domain/transitions/archive.ts src/client/meeting-panel-sections.tsx tests/contract/protocol-schema.spec.ts tests/unit/domain/transitions/speaker-attempt.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/status-projection.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts tests/client/client-entry.client.spec.ts scripts/smoke-profile/index.mjs scripts/smoke-profile/result.mjs scripts/smoke-profile/probe/index.js scripts/smoke-profile/probe/scenarios/scribe-minutes.js tests/unit/scripts/scribe-minutes-probe.spec.ts tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
git diff --check
rg -n 'RUNBOOK-FR10-REFERENCED-MINUTES|FR-10 Referenced Minutes RUNBOOK' docs TODO.md AGENTS.md .agents
```

PASS：完整 verify、真实 selector、Browser 及 Restore 全通过；11 条 FR-10 复核没有缺口；长期文档和 evidence 完备；删除后无临时引用、无坏链接、diff check 通过。最后一条 rg 在删除后退出 1 且无输出是预期无引用，不是测试失败。
STOP：任何验证未执行/失败、需要扩大 FR-10 范围、证据未迁移或删除后检查失败。未满足时保留 RUNBOOK，不能标 completed。commit/push/PR/merge 不在本步骤授权中。

## 7. 验证矩阵与恢复

| ID | 场景 | 预期结果 | 门禁 |
| --- | --- | --- | --- |
| V1 | 单点/多消息连续范围；引用子集 | 一条 draft message；范围与引用不被改写 | T2/T3/T7 |
| V2 | 空白/null/未知字段/超限/安全整数/逆序 | Schema 拒绝，Runtime 无调用或无 commit | T2/T4 |
| V3 | scope 洞/未来/范围外/self/跨 Meeting/私聊 ID | `INVALID_ARGUMENT`，无部分 message、event、receipt、outbox/version | T3/T4/T7 |
| V4 | Manager、Captain Session、其他 Participant/Meeting | 既有 `UNAUTHORIZED_CALLER`/`STALE_ATTEMPT` 边界，不写入 | T4 |
| V5 | stale version/attempt、terminal/archived | 既有 version/stale/immutable/archived 错误，无新草稿 | T3/T4/T5 |
| V6 | 一条合法引用与一条非法引用；混合六类 claims | 整体拒绝，所有状态与之前一致 | T2/T3/T4 |
| V7 | 相同请求、后续 Speaker 后重放、修改 hash | 原 receipt 稳定；changed hash 冲突；撤权不能重放成功 | T4/T7 |
| V8 | commit put 抛错后恢复重试 | 无半提交；只成功一次 | T4 |
| V9 | commit tail reopen、checkpoint reopen、旧数据 | 精确保留 metadata；旧消息保持 absent；非法新增结构拒绝读取 | T4 |
| V10 | status/tool/HTTP/context/Client | 同一 committed message；只读、无私有信息、刷新一致 | T5/T6/T7/T8 |
| V11 | archive 丢失/篡改 metadata、Session cleanup retry | 篡改拒绝；合法 metadata 保留；重试不改变 package | T5/T7 |
| V12 | Scribe 缺席、失败、替换 | 正式记录完整，原 end/archive 可完成；不等草稿 | T5；完整回归 |
| V13 | 草稿包含“已通过”“决定”等文字 | 不自动增加 CompletionFact/Decision 或改变 objective/finalSummary | T3/T5 |
| V14 | 续会选择 final summary | 不自动导入草稿或旧身份；原 continuation 回归保持 | T8 完整 verify |
| V15 | 构建、包与真实组合 | typecheck/build/contract 全 PASS；真实 web/spawn 调用六项 oracle | T7/T8 |

通用失败恢复：纯函数和 Schema 无外部资源；repository tests 的假故障开关、临时 storage、timers 和注册服务按 `finally` Restore；真实 smoke 使用现有 wrapper Prepare/Execute/Assert/Restore，不新增资源所有者。实际 failure/STOP 也必须清理本次资源并记录结果。自动化验证不能把 raw Session、mail 或凭证放进 evidence。

`Not Applicable`：新增 DB schema/migration、独立后台生成任务、远程授权、外部 research API、模型质量 benchmark；本次不涉及这些边界。真实 DSH/HTTP/Browser 不是 Not Applicable，必须执行；无法执行则保持未完成。

### 7.1 FR-10 固定验收映射

除明确标注 T6 新增的一项外，以下测试名均为现有 `it`/`test` 标题；路径相对 `plugin/`。作者已按断言核对映射，执行者只运行并记录结果，不自行选择替代测试。R11 是本次新增行为的验证计划，不能在实现前记 PASS。

| ID / 条款 | 固定文件与精确测试名 | 必须保留的断言 / 证据 |
| --- | --- | --- |
| R1 / FR-10.1 | `tests/client/client-entry.client.spec.ts`：`maps active and terminal projections without mutating transcript order`；`tests/contract/status-projection.spec.ts`：`projects canonical proposal revisions and positions for later participants`；`projects question facts without inventing optional fields`；`tests/unit/domain/transitions/archive.spec.ts`：`snapshots termination facts before returning the terminal state` | 消息顺序及身份/议题映射不丢失；提案版本、立场、问题和终止事实保留；决定与未决问题另由 R6/R7 覆盖。 |
| R2 / FR-10.2 | `tests/contract/status-projection.spec.ts`：`maps only public canonical meeting facts`；`tests/contract/meeting-runtime.spec.ts`：`returns an existing equivalent pending hand raise without advancing the meeting`；R3 私聊用例 | 公开投影排除 Session/capability/prompt/planning/leaseToken；重复待处理举手不推进会议；mail 生命周期不进入 MeetingState。 |
| R3 / FR-10.3 | `tests/contract/domain-meeting-repository.spec.ts` 调用共享 `tests/contract/meeting-repository-behavior.ts`：`keeps private mail lifecycle atomic, idempotent, and out of MeetingState` | 保存发送 context/snapshotThroughSeq；拒绝越界和错误身份；幂等 receipt；mail 状态独立于正式会议状态。共享文件不能单独作为 Vitest 入口。 |
| R4 / FR-10.4 | R3 同一用例；静态依据 `src/runtime/services/meeting-dispatch-service.ts` 的 `createMeetingDeliveryDispatcher` / 内部 `dispatchMail` | 测试拒绝未来处理上界与重试改变既定上界；静态实现从当前 state.messageSeq 固定 processingThroughSeq，补充 `snapshotThroughSeq < seq <= processingThroughSeq` 的 transcriptDelta，派发前核对参与者 ownership/capability/parent。具体边界见下段。 |
| R5 / FR-10.5 | R3 同一用例；`tests/contract/meeting-runtime.spec.ts`：`delivers the MeetingTask execution and request bindings`；R4 静态依据与 `src/runtime/application-service/meeting-mail.ts` | mail finish 只改邮件状态，错误 attempt 不可完成；长任务 delivery 绑定既定任务；dispatch prompt 明确公开讨论走 raise_hand、长任务走 create_meeting_task；不借此次草稿新增后台行为。 |
| R6 / FR-10.6 | `tests/client/client-entry.client.spec.ts`：`fact visibility: complete facts replace across active, terminal and archive projections`；`maps waiting state without a current turn and archive package facts`；`fact visibility: decisions across lifecycle`；`maps active and terminal projections without mutating transcript order`；T6 新增 `keeps minutes separate from speaker, pending decisions, tasks, waiting and accepted decisions` | 现有测试覆盖当前发言者、waiting reason/participants 和决定生命周期；T6 新用例验证主持候选建议、任务、正式决定与草稿在独立 section 展示。新增用例在 T0 记待执行，T6/T8 必须 PASS。 |
| R7 / FR-10.7 | `tests/unit/runtime/archive.spec.ts`：`copies existing optional facts without fabricating missing fields`；`deep-copies committed facts`；`tests/unit/domain/transitions/archive.spec.ts`：`requires archive packages to include committed facts`；`tests/client/client-entry.client.spec.ts`：`does not expose controls for a terminal projection` | 归档保留决定/证据/问题/任务关联等已提交事实且不共享可变引用；缺 transcript 拒绝；终态无运行控制。 |
| R8 / FR-10.8 | `tests/unit/runtime/archive.spec.ts`：`preserves continuation source provenance without copying source runtime facts`；静态依据 `src/runtime/services/meeting-archive-service.ts` 的 `materializeArchivePackage` | 保留来源事实；participantProvenance 显式只取 participantId/displayName/role，归档字段不含 Session config/capability/private Session；R10 验证续会不继承。 |
| R9 / FR-10.9 | `tests/unit/runtime/archive.spec.ts`：`revokes before interrupt and drain, then closes without requiring durable child deletion`；`writes archived only after every owned Session is revoked and closed`；`does not finalize while an owned Session remains open`；`tests/contract/meeting-runtime.spec.ts`：`archives a local End and recovers from post-commit cleanup failure` | revoke → interrupt/drain → close；全部关闭才写 archived；清理失败可重试；不要求物理删除。 |
| R10 / FR-10.10 | `tests/contract/continuation.spec.ts`：`copies only explicitly selected archived material into a new meeting with new Sessions`；`rejects an existing but unarchived source before target creation` | 新 Meeting/Session；仅复制六类明确选择的材料；源状态不变，重放不重复创建；未归档源被拒绝。 |
| R11 / FR-10.11、AC41 | T2–T6 的指定测试文件中新增 V1–V13；T7 的 `tests/unit/scripts/scribe-minutes-probe.spec.ts` 及真实 selector；T8 Browser；R10 回归对应 V14 | 逐项记录 V1–V15。coverage、引用、原子失败、无权威副作用、缺席/timeout/reassign、持久恢复与 Client/archive 全部通过才 PASS。测试断言由对应 T 步骤固定，不以标题或 marker 替代实际结果。 |

R4/R5/R8 的静态依据：作者已核对上述固定源码行为；这三个 production 文件不在本文允许修改范围。T0 与 T8 均执行以下 `git diff --exit-code`，只有退出 0 才可沿用作者静态结论；发生变化必须重新审计，不让执行者自行判断兼容性。R4 的“发送后新增 transcript 再派发”的跨层动态场景目前 **Not Covered**；本次接受未变动派发源码与持久上界契约测试的组合证据，长期 evidence 必须逐字保留这一边界，不称为 mail integration 已通过。这里不新增 mail 测试框架或扩展本次产品范围。

从仓库根执行固定命令；verbose 输出中表内所有现有标题必须 PASS，不能 skipped/todo。整个固定集合和 T8 完整 verify 都必须退出 0。

```bash
git diff --exit-code b4bed41634d4600e460040b1b93895b42c9671ac -- plugin/src/runtime/services/meeting-dispatch-service.ts plugin/src/runtime/application-service/meeting-mail.ts plugin/src/runtime/services/meeting-archive-service.ts
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/continuation.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts tests/client/client-entry.client.spec.ts --reporter=verbose
```

## 8. 文档检查命令

T1 修改文档后、T8 删除前和删除后各执行一次。该命令检查从调查基线以来新增/修改且仍存在的 Markdown 的相对文件链接；不联网、不修改文件。正文内的文件/symbol 清单另外用 `rg` 和文件存在性逐项核对；新增路径仅限本文标明的三项。

```bash
python3 - <<'DOC_LINK_CHECK'
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote

root = Path.cwd()
base = "b4bed41634d4600e460040b1b93895b42c9671ac"
changed = subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=ACMR", base], text=True
).splitlines()
untracked = subprocess.check_output(
    ["git", "ls-files", "--others", "--exclude-standard"], text=True
).splitlines()
checked = 0
failures = []
for name in sorted(set(changed + untracked)):
    path = root / name
    if path.suffix != ".md" or not path.is_file():
        continue
    body = re.sub(r"```.*?```", "", path.read_text(), flags=re.S)
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", body):
        target = target.strip().strip("<>")
        if "://" in target or target.startswith("#"):
            continue
        relative = unquote(target.split("#", 1)[0])
        if relative and not (path.parent / relative).resolve().exists():
            failures.append(f"{name}: {target}")
        checked += 1
if failures:
    raise SystemExit("\n".join(failures))
print(f"PASS {checked} local document links")
DOC_LINK_CHECK

git diff --check
```

PASS：脚本输出 `PASS` 且退出 0，diff check 退出 0。路径不存在必须修复文档引用；不能创建占位文件伪造通过。涉及与本任务无关的既有坏链接时 STOP 并报告，不扩大文档清理范围。

## 9. 作者审计与当前验证边界

- 作者检查：13 个本地 Markdown 链接、11 条 FR-10 验收映射、22 个去重现有用例标题与 T0–T8 的 9 个步骤结构通过；tracked diff 和新增文件 whitespace 检查无诊断。
- 作者以现有 fake domain/repository 做只读内存探针：创建后一次有效事件提交，再追加 126 次 allowNoop receipt，close 后 checkpoint baseSeq=128；按持久 JSON 值比较 snapshot/events/outbox 不变，receipts 增加 126。该探针只证明仓储机制，不是尚未实现的 minutes 持久化测试。
- 作者已核对现有文件、主要 symbols、package scripts、DSH rc.2、状态/归档链路及原子提交入口；本文明确标出唯一新增类型、函数、scenario 和测试文件。
- S1–S5 分别追踪到 T1–T8 与 V1–V15；没有新增产品依赖、Host 能力或存储格式。
- Author 已执行第 7.1 节固定回归集：7 个文件、176 个现有测试 PASS（新增 T6 用例尚未实现）；并执行第 8 节文档链接检查、既有路径及 R1–R10 精确用例标题核对、`git diff --check` 及新文件的 `git diff --no-index --check /dev/null docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md`（无 whitespace 诊断；no-index 退出 1 仅表示新文件与空文件存在差异）。新增 minutes focused tests、完整 verify、真实 selector 与 Browser 均为 **Not Covered：本次未实现、未执行**，不能作为 FR-10 完成证据。
- 审计结论：`Executable`，以 T0 的用户执行授权和基线门禁为前提；任何与正式依据或实际基线不一致的事实触发 STOP，而不是允许执行者临场改方案。
- 删除条件仅为 T8 PASS；不能因为 RUNBOOK 已写好或审计通过就删除，也不在此保存产品完成历史。
