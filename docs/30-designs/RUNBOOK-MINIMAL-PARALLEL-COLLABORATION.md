# Minimal Parallel Collaboration RUNBOOK

## Status And Executor Contract

建立：2026-09-14；源码基线 `391a1d4`；分支 `codex/project-goal-tests-and-direction`。模式 Execute；用户已明确授权补齐最小实现、修正 RUNBOOK、依序完成、删除并独立提交。本 RUNBOOK 为临时执行编排，产品契约不以它为唯一依据。

执行者只做规定文件／符号的修改、规定验证及 PASS/STOP，不选择产品行为、字段、存储方案、恢复策略或测试取舍。按下方剩余执行单元顺序执行；验证频率遵循“用户确认的验证节奏”。预期 RED 仅限新行为的测试断言，缺模块／编译／环境错误不算 RED。

发现指定基线／入口不存在、正式依据冲突、需要未列文件的业务修改、需要进入 Non-goals、基线验证失败，或必须放宽 Schema／权限／断言时 STOP。报告最后 PASS 步骤、命令、实际输出、文件／符号、保留的改动和缺失决定。禁止 reset/clean、迁移或删除用户数据，禁止自行扩大修改范围。

从首个剩余步骤继续；用户已授权 commit，但没有授权 push/PR/merge/生产安装。若当前分支为 main 则 STOP，不在 main 修改；已有 codex/ 独立分支沿用，不另行选择分支。源码执行期间遵循 TDD Skill，测试运行频率以本对话最新用户要求为准；文档验证与产品执行验证分开记录。

## Goal And Scope

唯一目标：固定 roster、Manager 指派、不同身份并行准备→保存可访问的版本化文本／补丁／来源→提交待审稿→Manager 批准确切版本并原子公开→独立核验逐材料／主张→有依据的完成声明及 Captain 接受→终止、恢复、归档和面板可读。

每位作者至多一项未结束贡献；同一 Session 串行调用，不同 Session 不等待彼此的模型研究结果。没有全员轮次屏障。公开、核验完成、证据 supports、正式成果接受是四个不同事实。

| Scope | 正式依据 | 步骤 | 验证 |
| --- | --- | --- | --- |
| S1 固定身份及任务授权、并行 | Speech Review 的 Minimal Delivery Scope；Meeting Requirements FR-3/FR-4 | T1a/T1b、T3a/T3d、T5a～T5c、T7 | V1、V2、V3 |
| S2 小型材料、版本与受控读取 | Speech Review 的 Evidence Submission And Shared Access／Code Evidence | T1a/T1b、T3a、T4、T8a/T8b | V4、V5、V10 |
| S3 待审、退回、精确发布及原子 claims | Speech Review Functional Requirements 4～10 | T2、T3a/T3b、T5a/T5c | V6、V7、V8 |
| S4 独立核验、负面结果保留、完成依据 | Speech Review Independent Evidence Review | T3c/T3d、T4、T6a | V4、V9、V11 |
| S5 暂停、完成、预算、恢复、归档 | Meeting Requirements BR-1～BR-3；Minimal Delivery Scope | T6a～T6e、T7 | V10～V14 |
| S6 受控面板与真实业务验收 | Minimal Delivery Scope 的 Slice Acceptance | T8a～T8c、T9～T12 | V15、V16 |

Non-goals：主动／紧急申请、合并申请、自动语义影响判断、动态入会、自动抓取／代码执行／来源去重／关联重审、复杂评分／停滞重规划、PDF／截图上传和分块、多用户或跨 Host。新会议不适配后台 MeetingTask／Mailbox；旧会议保留既有行为。不增加 provider、服务器、事件总线、数据库迁移、依赖版本或通用工作流平台。

## Formal Sources And Decision Closure

| 所有权 | 唯一入口及本次 section |
| --- | --- |
| 架构／工程／文档／测试规则 | [Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[Test Rules](../00-governance/TEST-RULES.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md) |
| 范围与验收 | [Speech Review](../10-requirements/MEETING-SPEECH-REVIEW-REQUIREMENTS.md#minimal-delivery-scope)、[Meeting Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) |
| 输入、输出、权限、事件、版本与兼容 | [Contribution Interface](../20-interfaces/MEETING-CONTRIBUTION-INTERFACE.md) 全文；[Agent Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#minimal-contribution-contract) 的适用边界 |
| canonical 字段 | [Domain Model — Minimal Contribution State](./DOMAIN-MODEL-DESIGN.md#minimal-contribution-state) |
| 状态转换、函数签名、调用链 | [Contribution Design](./MEETING-CONTRIBUTION-DESIGN.md) 全文；[Orchestration](./MEETING-ORCHESTRATION-DESIGN.md#minimal-contribution-execution) |
| 存储／Remote | [Storage](../20-interfaces/MEETING-STORAGE-INTERFACE.md#minimal-contribution-persistence)、[Persistence](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md#minimal-contribution-layout)、[Remote](../20-interfaces/MEETING-REMOTE-INTERFACE.md#minimal-contribution-methods) |
| 当前事实／外部验证 | [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)、[DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md) |

原 Q1、A1～A4 已由作者固定，不再是执行前设计任务：

- Q1：小型文本、代码补丁、固定版本来源；无二进制／分块。
- A1：材料≤8192 bytes；完整输入≤16384 bytes；128 个材料／稿件版本、64 个任务；唯一 Meeting domain；keyed records、immutable versions、归档引用，不改变 commit/checkpoint 限制。
- A2：exact action/result、actor 来源、generation、稿件版本、公开／核验分离、错误及事件顺序，全部按 Interface。无需执行者选状态机。
- A3：新创建显式 reviewer key；旧 ready receipt／旧状态机保留，新增 optional contributions 不是开关；公共来源逐层兼容；legacy 启动提取及测试处置见 T7。
- A4：复用 DSH 接受回执、同 Session 队列、Manager notice、600000 ms 阶段时限；暂停冻结任务 deadline、会议总时长仍包括暂停；cold epoch 防重；T10/T11 固定真实验证。

实现前完整读取上述新契约和设计，字段定义不在 RUNBOOK 重抄。以下每一步明确指向其中的结构和签名；不得用只读本文件的方式跳过 required/optional 或权限表。

## Current Breakpoints And Invariants

| 当前断点 | 已核对实际代码 | 固定修正 |
| --- | --- | --- |
| submit 直接公开并推进 Speaker | `plugin/src/domain/transitions/speaker-submission.ts` / submitSpeakerAndAdvanceMeeting | 提取纯 claims helper；新流程先保存稿件、批准时原子公开 |
| 单一 currentTurn | `plugin/src/domain/model.ts` / MeetingState；`plugin/src/runtime/application-service/initialize-meeting-turn.ts` / initializeFirstMeetingTurn | 新 contributions keyed tasks；新创建无 currentTurn；旧函数仅 legacy |
| 原消息 required Turn 来源 | `plugin/src/domain/model.ts` / MeetingMessage、ArchiveMessage；`plugin/src/protocol/types.ts` / PublicMeetingMessageV1 | 每层恰一套完整来源，不填假 ID |
| 材料未保存；大数组 splice | `plugin/src/repository/domain/projection.ts` / MAX_COMMIT_VALUE_BYTES；`plugin/src/repository/domain/json-patch.ts` / diff | 小材料和 immutable maps；先验证容量，不复制到 event/outbox/archive |
| adapter 要求旧 attempt | `plugin/src/dsh/session-adapter.ts` / followupParticipantSession、followupManagerSession | 新 followupContributionSession 复用 sendAuthorizedMeetingMessage，调用前后查 ownership/generation |
| worker 顺序 await 接收 | `plugin/src/runtime/outbox-worker.ts` / createOutboxWorker | 保持实现；DSH 接受不是研究完成；用两任务在途断言证明并行 |
| 完成／暂停绑定 Turn | `plugin/src/domain/completion.ts` / isObjectiveSatisfied、judgeTurnCompletion；`plugin/src/domain/transitions/meeting.ts` / transitionMeeting | 新门槛／预算检查和全部活跃任务 lifecycle |
| 旧投影视图 | `plugin/src/projection/status.ts` / projectMeetingStatus；`plugin/src/client/meeting-panel.tsx` / ConviviumMeetingPanel | 摘要和受控详情，不序列化私有 canonical state |

I1 caller 必须真实绑定；I2 一人一项、同 Session 串行；I3 未审无公共事实；I4 新版本不能复用旧批准；I5 公开不等于证实；I6 receipt 不跨 caller、不重复提交；I7 state/event/receipt/outbox 原子；I8 不自审、不隐藏负面结论；I9 required 任务未闭合不 completed；I10 终态不可新增事实；I11 cleanup 失败不 archived；I12 不截断材料或放大存储上限。

## Phases And Fixed File Rules

### 用户确认的验证节奏

2026-09-15 本对话确认：每个任务对改动文件执行 Prettier format，并执行 `pnpm --dir plugin lint`、`pnpm --dir plugin build`；自动测试改为每完成四个机械步骤统一执行一次，最后不足四步也执行。T4 已运行的测试保留为证据，下一批固定为 T5a、T5b、T5c、T6a。本节覆盖各步原先逐步执行 test 的频率，不删除测试用例，不改变行为断言或最终交付验证集合。

批内步骤实现完成且 format/lint/build 通过后，删除对应 TODO/RUNBOOK 步骤并独立提交；提交说明明确测试尚待批次验证，不宣称未经执行的测试通过。删除步骤前保留该批待执行的测试命令于本节；第四步提交前执行该批全部测试。任何批次失败先修复，不进入下一批；不得用删除断言、skip、放宽 Schema 或减少最终验证集合处理失败。后续批次按剩余步骤顺序每四步分组。

当前批次为 T6b、T6c、T6d、T6e；测试命令：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/contribution.spec.ts tests/contract/contribution-runtime.spec.ts tests/recovery/contribution-recovery.spec.ts tests/recovery/meeting-recovery.spec.ts tests/unit/domain/transitions/archive.spec.ts
```


三阶段：基础（T1～T4）、协作闭环（T5～T7）、交付验证（T8～T12）。阶段 2 通过不等于已交付，阶段 3 必须执行；括号内组号包含该组全部子步骤。

执行顺序唯一为：T1a→T1b→T2→T3a→T3b→T3c→T3d→T4→T5a→T5b→T5c→T6a→T6b→T6c→T6d→T6e→T7→T8a→T8b→T8c→T9→T10→T11→T12。T1/T3/T5/T6/T8 只作分组标识，没有独立 PASS；后文组号引用表示该组全部子步骤。每个子步骤独立记录命令、结果与最后 PASS，不以组完成代替记录。

阶段性编译规则：T3a～T3c 逐 action 完成同一个 applyContributionCommand，不为拆步创建生产抽象。尚未实施的 action 分支统一抛出 Error("Contribution action implementation pending")；已实现的 submit/approve 若携带尚未实现校验的正向 completionClaims，也抛该错误。此错误仅为未接线开发中间态，不能作为最终协议错误、测试成功或兼容 fallback。T3d 前全部移除，之后才允许 T5 接线。transitionContributionLifecycle 同样按 T6a 的 end、T6c 的 pause/resume/tick、T6d 的 recover 顺序实现，其未完成分支抛 Error("Contribution lifecycle implementation pending")；T6d 必须删除全部该临时错误。其它函数在所属步骤才声明/export/调用；后续才实现的 lifecycle 分支不得提前被当前测试或 Runtime 接通。测试按本文明确的行为 describe 逐步新增，不提前创建未来失败 case、skip 或 todo；每步运行文件内截至本步的全部 case。

所有新子步骤除指定 focused command 外都做 typecheck；Client 子步骤使用完整 typecheck（含 Client）。这些是执行门禁，不要求作者现在实现产品后运行。沿用已记录环境检查，不恢复 T0。

已有 production 文件／符号的责任在 [Design File Manifest](./MEETING-CONTRIBUTION-DESIGN.md#file-manifest)；新文件／签名在其 Domain Symbols、Runtime Symbols、DSH、Legacy Startup、Public DTO sections。下述允许文件均为精确路径；同目录缩写不授权修改整个目录。没有列出则 STOP。

允许新增测试只有：

- `plugin/tests/fixtures/contribution.ts`：固定三人数据与临时 repository 构造；不实现被测状态机。
- `plugin/tests/fixtures/legacy-runtime.ts`：T7 的历史 Meeting 构造；不实现生产授权或重放。
- `plugin/tests/contract/contribution-protocol.spec.ts`、`plugin/tests/contract/contribution-evidence.spec.ts`、`plugin/tests/contract/contribution-runtime.spec.ts`。
- `plugin/tests/unit/domain/contribution.spec.ts`、`plugin/tests/unit/runtime/contribution-dispatch.spec.ts`、`plugin/tests/recovery/contribution-recovery.spec.ts`。

新 fixture 固定 meetingId=contribution-meeting、teamId=contribution-team；Participant keys=a/b/reviewer；Captain session=captain-contribution；Manager=session-manager；now=1700000000000。一个议题 topic，一个 required output=result，一个 criterion=verified；requiredReviewerKeys=[]，reviewer key=reviewer。actor 使用各自独立测试 Session，测试以 gate 控制模型返回，禁用固定 sleep；temp 数据 finally 关闭并删除自身资源。Public normalizer 的 ID 值从独立固定 seed 对照，不用 actual 反算 expected。

## Mechanical Steps

### T1a：canonical 结构与消息来源兼容

前置状态：Author 环境检查已通过，收到产品执行请求。
允许修改：`plugin/src/domain/contribution.ts`；`plugin/src/domain/model.ts`；`plugin/src/domain/meeting-state-validation.ts`；`plugin/src/domain/planning.ts`；`plugin/src/domain/index.ts`；`plugin/src/protocol/types.ts`；`plugin/src/protocol/status.ts`；`plugin/src/projection/status.ts`；`plugin/tests/fixtures/contribution.ts`；`plugin/tests/unit/domain/contribution.spec.ts`；`plugin/tests/contract/status-projection.spec.ts`。
禁止修改：业务完成判断、action 工具、调度与创建默认行为。

执行：
1. 按 Domain Model 定义 canonical 类型、createContributionState/isContributionState/assertContributionCapacity；实现结构、引用和容量校验。此步不声明或实现 contributionWorkComplete/assertContributionEvidenceMessages。
2. 同步 MeetingState、事件名、各层消息来源和现有 Schema/mapper，旧 fixture 不补默认字段。planning.ts 的 latestSpeakerTurnSeq 只收集经旧来源检查得到的 number turnSeq，新消息不参与 Math.max。
3. 新增 describe="contribution state structure"：有效新旧状态、损坏引用、版本断档、非法来源组合、128/129 版本与容量边界。所有样例来自固定 fixture。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/contribution.spec.ts tests/contract/status-projection.spec.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：命令退出 0；新旧状态与消息可解析；非法状态 fail closed；旧状态输出不变。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。

### T1b：贡献 Wire 输入与结果 Schema

前置状态：T1a PASS。
允许修改：`plugin/src/protocol/contribution.ts`；`plugin/src/protocol/commands.ts`；`plugin/src/protocol/index.ts`；`plugin/src/protocol/types.ts`；`plugin/tests/contract/contribution-protocol.spec.ts`；`plugin/tests/fixtures/contribution.ts`。
禁止修改：Domain 业务状态转换、工具注册、持久化接线。

执行：
1. 按 Interface Wire Contract 实现全部新 input/result/DTO/Schema 及 export；复用 T1a canonical 类型，创建输入只增加 optional reviewer 字段，不切换 Runtime。
2. 固定 action/result 字段组合、exact-key、规范化顺序和字节上限；不得允许任意 optional 组合。
3. 覆盖缺字段、额外字段、union、负数/非整数、8192/8193 多字节边界及每种成功结果。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/contribution-protocol.spec.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：命令退出 0；合法 action/result 解析成功；非法组合拒绝；输入属性顺序不改变规范化结果。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。


### T2：提取同一份公开 claims 与纪要校验

前置状态：T1b PASS。
允许修改：新增 `plugin/src/domain/transitions/public-submission.ts`、`plugin/src/runtime/services/public-submission-service.ts`；`plugin/src/domain/transitions/speaker-submission.ts`、`plugin/src/domain/transitions/speaker-attempt.ts`、`plugin/src/domain/transitions/types.ts`、`plugin/src/domain/transitions/index.ts`、`plugin/src/domain/index.ts`；`plugin/src/runtime/application-service/meeting-turn.ts`；`plugin/tests/unit/domain/contribution.spec.ts`。
禁止修改：旧调用的业务结果、队列顺序、授权与调度算法。

执行：按 Design 的 applyPublicSubmission、assertPublicMinutes、preparePublicSubmission 签名提取现有代码。旧 caller 继续原 Speaker 检查、MeetingTask queue 和 Turn advance；新 helper 不访问 currentTurn。保留旧 entity ID 前缀、索引、claims 顺序和 completion factId seed。新独立输入传 agendaItemId，不能从当前 Turn 读取。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/contribution.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts tests/unit/domain/transitions/speaker-attempt.spec.ts tests/unit/domain/completion.spec.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：新 helper 在无 currentTurn 下应用合法 claims；同一非法 claims 集合整体拒绝；旧 suite 预期不变。
STOP：需要伪造 attempt、重复复制 claims、改变旧事件语义或用断言强转未定义 ID。

### T3a：指派、材料版本与私稿

前置状态：T2 PASS。
允许修改：`plugin/src/domain/contribution.ts`；`plugin/src/domain/transitions/contribution.ts`；`plugin/src/domain/index.ts`；`plugin/src/domain/transitions/index.ts`；`plugin/tests/unit/domain/contribution.spec.ts`；`plugin/tests/fixtures/contribution.ts`。
禁止修改：公开消息、审核结论、Captain 控制和 Runtime 接线。

执行：
1. 实现 applyContributionCommand 的 assign/save_evidence/submit：actor、单人占用、revision/generation、deadline、材料引用和不可变版本按接口；submit 只保存私稿。
2. 新增 describe="contribution preparation"，检查双作者可同时 preparing、同作者第二项拒绝、旧材料保留、stale 拒绝、待审附 claims 不产生公共事实。
3. 正向完成声明检查的最终实现归 T3c；本步只测试无完成声明的私稿。尚未完成 action 的处理遵循下方阶段性编译规则，不能临时返回成功。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/domain/contribution.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：命令退出 0；普通私稿路径完整；被拒绝命令不改变输入 state；transcript/正式 claims 不增加。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。

### T6d：冷恢复与一次性重授权

前置状态：T6c PASS。
允许修改：`plugin/src/runtime/services/contribution-runtime-service.ts`；`plugin/src/runtime/services/meeting-session-recovery.ts`；`plugin/src/runtime/application-service/index.ts`；`plugin/src/domain/transitions/contribution.ts`；`plugin/tests/recovery/contribution-recovery.spec.ts`；`plugin/tests/contract/contribution-runtime.spec.ts`。
禁止修改：archive 格式、旧 Session 恢复语义、自动创建替代 Captain。

执行：
1. 完成 recover 分支与 recoverContributionWork，既有 Session reconcile 后执行；实例内 epoch+Set 防止重复 read 增加 generation。
2. fresh create 入 Set 的唯一位置固定为 createMeetingApplication 新状态启动 commit 与 updateCreateResult 成功之后、返回 success 之前，由 T7 实际接线；本步恢复测试使用真实保存状态/reopen，不走尚未切换的创建入口。
3. 新增 describe="contribution cold recovery"：running/waiting 过期与未过期、paused/终态、缺 parent、重复 status、重开后的原文材料与 receipt 一致；recovery command 重放不生成新 outbox。删除所有 lifecycle 阶段性未实现分支后才能 PASS。

验证：
```bash
pnpm --dir plugin exec vitest run tests/recovery/contribution-recovery.spec.ts tests/recovery/meeting-recovery.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：命令退出 0；每实例一次重授权；缺 parent 只读；paused 不重投；旧 Session 保护不退化。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。

### T6e：归档引用与清理恢复

前置状态：T6d PASS。
允许修改：`plugin/src/domain/transitions/archive.ts`；`plugin/src/runtime/services/meeting-archive-service.ts`；`plugin/src/runtime/application-service/meeting-end.ts`；`plugin/src/runtime/application-service/index.ts`；`plugin/tests/recovery/contribution-recovery.spec.ts`；`plugin/tests/contract/contribution-runtime.spec.ts`；`plugin/tests/unit/domain/transitions/archive.spec.ts`。
禁止修改：新数据库、复制材料、修改 DSH 持久 Session 数据。

执行：
1. 实现 Archive contributionRefs、assertArchivePackageMatchesMeeting 和 materializeArchivePackage；只保存公开任务与材料引用闭包。
2. 接已有 beginArchiveFromTermination/cleanup/finalize，清理失败保持 archiving，恢复不重复正文/事实；将 T6a 保留的公共 Runtime end 与自动完成路径接到 beginArchiveFromTermination，不改 legacy 分支。
3. 新增 describe="contribution archive recovery"：最大允许任务/材料/稿件状态结束归档，每次 commit≤65536 bytes；reopen 后材料逐字一致；私稿不在公开白名单；cleanup 失败再恢复成功。

验证：
```bash
pnpm --dir plugin exec vitest run tests/recovery/contribution-recovery.spec.ts tests/contract/contribution-runtime.spec.ts tests/unit/domain/transitions/archive.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：命令退出 0；终止到 archived 全链路通过；容量、白名单与清理证据均满足；无重复物化材料。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。


### T7：新建切换与历史兼容

前置状态：T6e PASS。
允许修改：新增 `plugin/src/runtime/application-service/initialize-legacy-meeting.ts`、`plugin/tests/fixtures/legacy-runtime.ts`；`plugin/src/runtime/application-service/create-meeting.ts`、`plugin/src/runtime/meeting-runtime.ts`、`plugin/src/runtime/application-service/meeting-turn.ts`、`plugin/src/runtime/application-service/meeting-task.ts`、`plugin/src/runtime/application-service/meeting-mail.ts`、`plugin/src/runtime/application-service/meeting-attendance.ts`、`plugin/src/runtime/application-service/meeting-control.ts`、`plugin/src/runtime/application-service/index.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/contract/continuation.spec.ts`、`plugin/tests/contract/contribution-runtime.spec.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`、`plugin/tests/fixtures/contribution.ts`。
禁止修改：公开 legacy 模式开关、旧数据版本、低层历史 Domain 的业务语义。

执行：按 Compatibility Matrix 和 Legacy Fixture Procedure（下文）完成切换。新创建前置 required reviewer 校验必须在首次 storage create/Session provisioning 前；旧 ready receipt 的原 caller/hash 重放先处理且不重跑 role provisioning。新初始 commit 产生 Manager notice，不产生 Turn；成功创建后接 T6d 指定的 recoveredContributionMeetings.add(meetingId)；旧未完成启动记录调用提取的 initializeLegacyMeeting。新状态旧写入口拒绝，旧状态继续原逻辑。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/contribution-runtime.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/continuation.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：新创建不带 reviewer／非法限制零副作用；旧成功 receipt 可原样重放；旧会议读取、收尾、恢复保护仍成立；新路径不产生 Turn 事件。
STOP：通过输入开关新建旧会议、自动补 reviewer、隐藏旧会议、删除旧 suite 或对 invalid create 执行 provisioning。

### T8a：Remote 与 typed client

前置状态：T7 PASS。
允许修改：`plugin/src/remote/index.ts`；`plugin/src/remote/types.ts`；`plugin/src/client/meeting-client.ts`；`plugin/tests/fixtures/remote-gateway.ts`；`plugin/tests/client/meeting-client.client.spec.ts`；`plugin/tests/client/meeting-remote-types.ts`；`plugin/tests/contract/remote-boundary.spec.ts`；`plugin/tests/contract/remote-generation.spec.ts`。Typert 输出只由 generate:typert 生成：plugin/lib/typert.host.js、plugin/lib/typert.host.d.ts、plugin/lib/typert.remote-client.js、plugin/lib/typert.remote-client.d.ts。
禁止修改：面板 UI、角色资源、手改生成文件。

执行：
1. 实现 readContribution/controlContribution Remote methods 与 typed client；输入、caller、AbortSignal、envelope/result Schema 按 Design。
2. 验证 local 控制只允许 retry/cancel/notify，不能冒充 Manager/reviewer；异常、取消和版本冲突不更新缓存为成功。
3. 运行下面的生成、验证命令；生成失败不得手改产物。

验证：
```bash
pnpm --dir plugin generate:typert
pnpm --dir plugin exec vitest run tests/client/meeting-client.client.spec.ts tests/contract/remote-boundary.spec.ts tests/contract/remote-generation.spec.ts
pnpm --dir plugin typecheck
```

PASS：命令退出 0；生成 contract 含两个方法；真实 Remote 权限与 typed client 结果解析通过。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。

### T8b：贡献面板交互

前置状态：T8a PASS。
允许修改：`plugin/src/client/meeting-panel.tsx`；`plugin/src/client/meeting-panel-view.tsx`；`plugin/src/client/meeting-panel-sections.tsx`；`plugin/tests/client/meeting-panel.client.spec.ts`；`plugin/tests/fixtures/remote-gateway.ts`。
禁止修改：Remote 方法语义、UI 主题、角色权限。

执行：
1. 按 Design 固定文案实现 Contributions、详情、版本选择与三个 local action；先读最新版本再写，缺连接/缓存状态禁止写。
2. 切换 Meeting 时取消旧请求、清除旧 detail，旧请求迟到不得覆盖当前会议。
3. 校验私有/公开字段、按钮状态、Reason、核验结果；新会议隐藏 Turn reassign，旧会议保持原样。

验证：
```bash
pnpm --dir plugin exec vitest run tests/client/meeting-panel.client.spec.ts tests/client/meeting-client.client.spec.ts
pnpm --dir plugin typecheck
```

PASS：命令退出 0；界面结果与 Remote 投影一致；无跨会议旧详情污染；新旧操作入口正确。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。

### T8c：角色权限与 Scribe 闭环

前置状态：T8b PASS。
允许修改：`plugin/meeting-roles/definitions.json`；`plugin/meeting-roles/README.md`；`plugin/meeting-roles/presets/convivium/skills/meeting-management/SKILL.md`；`plugin/meeting-roles/presets/convivium/skills/verification-review/SKILL.md`；`plugin/meeting-roles/presets/convivium/skills/referenced-minutes/SKILL.md`；`plugin/tests/contract/meeting-roles-deployment.spec.ts`；`plugin/tests/contract/contribution-runtime.spec.ts`。
禁止修改：其它 Definition 版本、已固化 Session descriptor、模型/provider。

执行：
1. 按 Design 更新 Manager/Scribe allowlist 与 1.1.0 版本，其余 Definition 不变；三个 Skill 的新旧入口、精确审核、纪要 claims 限制按固定契约。
2. 新增 describe="contribution scribe authorization"：真实角色过滤允许新 submit/read，合法 summary/minutesDraft 经 Manager approve 后公开，零额外 claims；旧纪要路径保留。
3. 按下面固定命令分别验证部署资源、运行行为和完整类型检查。

验证：
```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-roles-deployment.spec.ts tests/contract/contribution-runtime.spec.ts
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin typecheck
```

PASS：命令退出 0；角色资源部署与 Scribe 新旧链路通过；没有回写历史定义或扩大其他角色权限。
STOP：上述命令或断言失败，或必须修改未列文件才能继续；记录实际失败和最后 PASS 子步骤，保留工作树，不放宽断言／类型／Schema；测试自有资源在 finally 清理。


### T9：完整工程验证

前置状态：T8c PASS。
允许修改：T1～T8 已明确允许的文件，只修复其规定行为；本 RUNBOOK 执行记录。
禁止修改：依赖、lint/test 配置、跳过失败断言、未列能力。

执行：跑完整门禁；如因实现错误失败，回到所属步骤在原范围修正，重跑该步及本步；原未覆盖能力失败不能自行豁免。

验证：
```bash
pnpm lint
pnpm --dir plugin verify
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：全部退出 0，无新增 skip，无用类型断言/禁用 lint 掩盖字段问题。
STOP：必须改变范围才能通过；保留测试失败输出，不称工程完成。

### T10：真实 DSH probe 与 Browser

前置状态：T9 PASS；已有 smoke 入口可按 operations 读取凭据。
允许修改：新增 `plugin/scripts/smoke-profile/probe/scenarios/parallel-contribution.js`；`plugin/scripts/smoke-profile/probe/index.js`、`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/result.mjs`；新增 `docs/40-readiness/MINIMAL-PARALLEL-COLLABORATION-EVIDENCE.md`；`docs/50-operations/HOW-TO-DSH-SMOKE.md`。
禁止修改：用户 profile、dev.env 内容、DSH provider；不代填真实模型讨论结论。

执行：严格实现下文 Probe Contract；注册 parallel-contribution 到 SMOKE_SCENARIOS、probe guard/switch、result validator；新 scenario 禁用旧 driveParticipant 自动 Turn 提交。新创建已切换，旧 smoke 的 Turn 脚本不再是有效入口：SMOKE_SCENARIOS 改为 [parallel-contribution]，CORE_SCENARIOS 同值；旧 selector 由 selectScenarios 在启动 Host 前明确拒绝。T11 再把 parallel-contribution-model 加入 SMOKE_SCENARIOS，CORE_SCENARIOS 仍只含 deterministic 场景，--all 运行两项。保留旧 probe 源文件作为旧记录路径的既有代码，本切片不重新启用或宣称它们通过；在 operations 新节列出失效 selector 与替代入口。Browser 仅停在可检查的 live fixture，按 Browser Script 做 read/control/end。

验证：
```bash
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile --json
```

PASS：exact result 及 V15 全部满足，Browser 操作回读一致；Ctrl-C 后出现 CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok，精确临时根不存在。
STOP：工具权限、Session 生命周期、归档或 cleanup 未证实；finally 恢复本次自有资源并记录脱敏失败，不删除用户资源。

### T11：固定真实模型讨论

前置状态：T10 PASS。
允许修改：新增 `plugin/scripts/smoke-profile/probe/scenarios/parallel-contribution-model.js`；T10 的三个 registry/validator 文件；`docs/40-readiness/MINIMAL-PARALLEL-COLLABORATION-EVIDENCE.md`。
禁止修改：讨论题、评价标准、自动补写模型结果；不实际开发电商产品。

执行：严格按下文 Model Discussion Contract 注册并运行 parallel-contribution-model。脚本只建立固定会议／模型／角色和只读采样；assign、submit、approve、review、完成声明及 Captain 接受由真实模型产生。保留失败、人工介入与正式产出，不用 deterministic probe 的结果替代。

验证：
```bash
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution-model pnpm --dir plugin smoke:profile --json
```

PASS：V16 的结构检查和系统归档检查分别有可追溯证据；任一未满足不能写整体通过。
STOP：超时、流程错误、内容转向 Convivium 工程、必要材料不可得或模型未完成。脚本 finally 做资源恢复；不自动纠正后仍称自主完成。

### T12：迁移证据并删除 RUNBOOK

前置状态：T1～T11 的全部执行单元 PASS，V1～V16 均有证据。
允许修改：本文件、T10 readiness、新增 Contribution Interface/Design、Domain Model、Orchestration、Storage/Remote/Persistence、本轮 Speech Review Minimal Scope、Current Coverage、`docs/50-operations/HOW-TO-DSH-SMOKE.md`；仅指向本 RUNBOOK 的已核对引用。
禁止修改：缩小已确认目标来把失败写成成功、删除未覆盖需求。

执行：更新覆盖矩阵并保留 Non-goals 为 Not Covered；长期输入、运行方式及恢复说明迁入 operations，接口与设计注明实际覆盖。记录执行日期、源码边界、所有命令／结果、Browser 与讨论原文引用、人工介入。先运行下面完整检查；确认长期文档不依赖它后，执行下面固定备份／删除／恢复命令。无论文件是否 tracked 都保存完整字节，不使用 git diff 充当备份。不删除任何外部引用文件；rg 若发现本文件之外仍有引用，STOP 并报告，交由作者先迁移，禁止执行者猜测哪些引用可删。

验证：
```bash
pnpm --dir plugin verify
node .github/scripts/check-doc-links.mjs
git diff --check
rg -n 'RUNBOOK-MINIMAL-PARALLEL-COLLABORATION|Minimal Parallel Collaboration RUNBOOK' docs TODO.md AGENTS.md
```

备份与删除（仓库根执行；临时备份路径由 mkdtemp 唯一生成并打印；失败保留备份）：
```bash
python3 - <<'PYBACKUP'
from pathlib import Path
import shutil, subprocess, tempfile
source = Path('docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md')
scan = subprocess.run(['rg', '-n', 'RUNBOOK-MINIMAL-PARALLEL-COLLABORATION|Minimal Parallel Collaboration RUNBOOK', 'docs', 'TODO.md', 'AGENTS.md'], capture_output=True, text=True)
if scan.returncode not in (0, 1):
    raise SystemExit(scan.stderr)
external = [line for line in scan.stdout.splitlines() if not line.startswith(str(source) + ':')]
if external:
    raise SystemExit('STOP: external references remain\n' + '\n'.join(external))
backup_dir = Path(tempfile.mkdtemp(prefix='convivium-runbook-backup-'))
backup = backup_dir / source.name
shutil.copy2(source, backup)
assert backup.read_bytes() == source.read_bytes()
print('RUNBOOK backup:', backup, flush=True)
try:
    source.unlink()
    subprocess.run(['node', '.github/scripts/check-doc-links.mjs'], check=True)
    subprocess.run(['git', 'diff', '--check'], check=True)
except BaseException:
    shutil.copy2(backup, source)
    print('STOP: RUNBOOK restored; backup retained:', backup, flush=True)
    raise
shutil.rmtree(backup_dir)
PYBACKUP
```

PASS：预先固定门禁全部通过，证据可追溯，删除后没有残余链接；没有把 RUNBOOK 长期保留为 completed/archive。
STOP：任何未执行／失败／未迁移项；保留 RUNBOOK。rg 无匹配时退出 1 是正常无残余，不是测试失败。

## Compatibility Matrix And Legacy Fixture Procedure

| 路径 | 新会议 | 旧持久记录 | 验证处置 |
| --- | --- | --- | --- |
| 创建／重复 create | reviewer 必填、初次 Manager notice | 已存在 ready receipt 原 caller/hash 重放；未完 startup 调 initializeLegacyMeeting | 新 creation/replay 在 contribution-runtime；原 Agent Definition 创建 suite 使用新合法输入 |
| submitTurn/submitManagerPlan/raiseHand/reassignTurn | UNSUPPORTED_CAPABILITY | 原逻辑 | 原纯 Domain、旧投递测试不改；Runtime 历史用例预置 legacy 数据 |
| MeetingTask/Mailbox/attendance 写 | UNSUPPORTED_CAPABILITY | 原逻辑；仍可读 | 不在新上下文暗示这些工具可用；历史测试保留 |
| Question/Issue/Proposal/Position/DecisionCandidate | 仅批准后应用 | 原语义 | T2 原 suite + T3/T5 atomic publication |
| Captain decision/risk/agenda 处置 | 原权限、事实与 receipt；改新完成/notice | 原逻辑 | 保留原 authority/rollback/concurrency 反例；另验新门槛 |
| Scribe/continuation | 原文引用新或旧消息均可；证据以归档白名单读，不能跨 Meeting 当本会议材料 | 原规则 | 原纪要、continuation tests 保留；新增贡献纪要路径 |
| status、archive、cold recovery | 新字段完整校验与权限 | 无新字段原样读取／收尾 | 双形态断言，不填默认值、不迁移 |

T7 的历史 helper 只构造测试数据：`createLegacyRuntimeFixture(options:CreateStatusRuntimeOptions):MeetingRuntimeWithCallerLookup`。内部持有真实 DomainRepositoryRegistry 和原 Captain map，调用真正 createCreateStatusRuntime（getCaptainParent 查 map）。其 createMeeting 测试方法依次：

1. caller 不是带 agent 的 Captain 时直接调用真正 runtime.createMeeting，不进行预置；其余输入先通过与基线相同的 prepareMeetingCreation 校验，校验失败沿基线错误映射返回，不建立记录。新创建测试禁止调用此 helper。通过校验的历史 fixture 依据基线 stableMeetingId 算法生成 meetingId；注册 caller.agent 到测试 map；用 prepareMeetingCreation（输入没有 reviewer）和相同授权打开临时真实 repository。
2. 调用原 createMeetingRuntime 生成 owned Sessions／bootstrap；依赖字段逐项按 MeetingCreationRuntimeDependencies 传入，allocateSessionId=`<meetingId>-<role>-<key>`。不 mock 掉授权、Repository.execute 或领域转换。
3. 调 initializeLegacyMeeting，updateCreateResult 为 `{meetingId,meetingVersion,status,participants:input.participants.map(participantKey→participant-<key>)}`。
4. 调原 runtime.createMeeting 重放 ready receipt，再 getStatus 触发真实 rehydrate；返回该 receipt。已有 ready record 跳过 2/3，直接执行 4。creation_failed 不重置、不重新 provisioning，返回原失败。

helper 使用真实 storageDomain，不 mock Repository 或 recovery。DSH port 仍由每个原测试提供。测试 helper 用同一个可变 port 对象接入 runtime；仅在上述步骤 2～4 的初始化期间，为缺失的 listDescendants/listChildren、interrupt、drainContinuableChildren 补齐测试实现：列表来自该 case 实际创建的 childId、原 parent、label、lifecycle；interrupt 记录调用，drain 返回这些 child 的实际关闭状态。不得覆盖原测试显式提供的接口，包括会失败的接口。已有所有 Session 必须都出现在列表中；步骤 4 断言恢复没有调用补齐的 interrupt/drain、没有替换 Session、没有改变初始 Turn/attempt 或会议版本，且 getStatus 成功；否则 STOP。步骤 4 的 finally 恢复所有临时补齐接口原有的缺失状态，之后才把 runtime 交给测试执行动作。这样真实 rehydrate 获得 parent，而后续动作仍面对该 case 原本的能力条件；特别是 `fails local End before committing when archive cleanup capability is unavailable` 必须继续因 cleanup 能力缺失失败，不能通过永久补齐能力使反例失效。所有 mock resource 都属于该 case，dispose 与原 afterEach 统一关闭。不增加生产依赖注入开关。

该 helper 只供 `plugin/tests/contract/meeting-runtime.spec.ts` 内 `agenda candidate disposition runtime`、`create/status meeting runtime`、`referenced minutes runtime`、`Captain attendance rejection runtime` 四个既有 describe 使用；仅将这些 suite 的 createCreateStatusRuntime/localRuntime 构造替换为 helper，保留原断言。`meeting creation input failures`、`Agent Definition creation and replay contract` 保持真实新 create；输入加 reviewerKey=现有第二个 participantKey，去除旧 Turn 限制，不改身份／创建失败断言。`local decision and risk runtime` 原来直接加载 canonical fixture，保持原样。若某个测试使用 new input 验证非法 role／空 agenda，不修正其故意非法部分。

低层 `plugin/tests/unit/runtime/meeting-runtime.spec.ts`、纯 offline fixture 和 Domain suites 保持无 contributions 的历史输入，验证原 primitive 与 compatibility，不把它们描述为新建入口验收。新创建的 caller、ready replay、失败 provisioning、输入限制另由 contribution-runtime 明确覆盖。helper 不能提供生产开关、跳过 domain 校验或再次复制完整旧 application。

## Probe Contract

唯一新导出：`runParallelContributionScenario(runtime):Promise<void>`，位于 T10 新 scenario 文件；runtime 使用既有 probe 对象。固定创建输入取 createInput 后：participants=[a,b,reviewer]，evidenceReviewerKey=reviewer，selectionMode=manager；删除旧 limits 字段，仅 maxTotalMessages=8/maxDurationMs=1800000；议题 key=topic、criterion key=verified，三人均 requiredParticipantKeys，requiredReviewerKeys=[]；objectiveContract.requiredOutputs=[]、acceptanceCriteria=[{key:"verified",description:"deterministic evidence workflow"}]、hardConstraints=[]、riskAcceptanceAuthorityKeys=[]、acceptableRiskLevel=low；agenda[0].completionCriteria=["verified"]、title="Parallel evidence"、objective="Verify independent submissions"、inScope=["text evidence"]、outOfScope=[]。

不使用 sleep 判断完成。新增 probe/index.js 的 `waitForContributionContext(ctx,agentId,contributionId,purpose)` 复用 waitForInbox，解析文本前缀 `contribution context: `；Manager 前缀 `contribution manager context: `。超时沿原 30000 ms；错误明确失败。将该函数加入 probe runtime 对象提供给 scenario。

固定动作顺序：

1. Captain create；取得真实 Manager/三位 Participant Session。Manager 连续 assign A、B 两项非 required 任务（targetIds=[]），A requiresEvidenceReview=false，B=true；先等两份 prepare inbox，再允许任何提交。记录 distinct session IDs 与两个 task generation。
2. B save_evidence：kind=experiment，title=token observation；text=`amber-47`；source=`probe fixture`；其余 required 字段明确写 `fixture`／`not applicable: deterministic text`。B submit content 为“主张：材料包含 amber-47；证据：固定材料；推断：逐字读取；反证条件：内容不同；不确定性：不代表外部事实。”，changes={}，citations 一条 claim=`material contains amber-47`，locator=`full text`，inference=`literal comparison`。A 此时仍 preparing。
3. 用 A 调 readContribution(B) 必须拒绝；Manager 可读材料；用 B 调 evidence_review 必须拒绝。Manager approve B 后 Transcript 增 1，A 能读该固定材料；状态 pending。Reviewer 实际读 text 并提交 supports/method=`literal comparison`/result=`amber-47 matched`/limitations=`fixture only`。
4. 重放 B submit 和 Manager approve 的相同输入，message count 不增；同 requestId 改内容得到 IDEMPOTENCY_CONFLICT。A submit 一个版本，Manager return reason=`补充反证条件`；原 approve 输入的旧 revision/generation 拒绝。
5. Captain pause，A 旧 generation submit 拒绝；resume 后新 prepare generation 大于旧值。A 重提合规五项 content、无 citations；Manager approve。检查两条正式消息来源无 Turn，私有旧稿未混入公共正文。
6. 非 Browser 模式 Captain end partial，reason=`parallel contribution probe`，acceptedDecisionIds/deferredAgendaItemIds/waivers 全空；轮询只读 status 到 archived，并读取 B 归档白名单材料字节仍为 amber-47。Browser 模式不 end，按下段停在 running fixture。

负向调用使用 `ctx.tools.execute({callId,name,arguments:{input},agent,signal})` 原始结果，断言 value.ok=false/code；不能使用会抛出失败的 runtime.callTool。每项正向写先读当前 meetingVersion，固定 requestId=`parallel-<action>-<step>`，重放保留原输入和原版本；故意 stale/CAS 用例除外。首次需要的 assigned task ID 和后续 generation 均取实际 success result，不拼造。Manager/Participant 若已释放 resident Activation，沿既有 resumeParticipantForProbe 以原 parent 继续，不能创建替代身份。

顶层结果 exact 字段 `{ok:true,scenario:"parallel-contribution",browserReady:boolean,meetingId:string,captainSessionId:string,assertions:string[],observed:{participantSessionIds:string[],contributionIds:string[],messageIds:string[],evidenceKey:string,reviewVerdict:"supports",status:MeetingStatus,meetingVersion:number}}`。assertions 恰为：parallel-inflight、private-before-approval、public-exact-version、independent-review、idempotent-publication、stale-rejected、pause-resume-generations，非 Browser 再加 archived-material-readable。validator 逐字段校验、数组唯一性、status=archived（非 Browser）/running（Browser）、真实三人独立 Session，不能只检查 ok。

Browser Script：打开本次 wrapper 输出的完整认证 URL；选 convivium-smoke-captain→Meetings→本次 meetingId；Contributions 区读取 B 材料，文本 amber-47、verdict supports、具体版本与 probe 相同；A 的退回稿只在本地审计详情，公共 Transcript 只有两条正式消息。刷新后不变。用原 End 表单选择 partial，reason=`browser contribution check`；等待 archived 后再次读同材料。Ctrl-C 原 wrapper，等待 cleanup=ok；核对精确临时根不存在。URL token/cookie 不写入 evidence。

## Model Discussion Contract

唯一新导出 `runParallelContributionModelScenario(runtime):Promise<void>`。scenario 禁止 Browser 模式（返回明确非法 selector）；probe/index.js 对该 scenario 禁用所有 deterministic driveParticipant/Manager 代填。沿 meeting-roles 的真实 Captain 创建和 preset mounting，provider=`deepseek-official`、model=`deepseek-v4-flash`，不使用 RoleSmokeAdapter。

临时 profile 使用四个固定 Definition（同一文件内导出 `parallelDiscussionDefinitions` 给 writeSmokePatch 使用），definitionVersion=1.0.0、dshPresetId=convivium：

| ID / roleDefinitionId | 展示（name/title 单独在 evidence 保存） | persona 固定职责 | requiredSkillNames |
| --- | --- | --- | --- |
| discussion.manager / meeting_manager | 林序／会议主持人 | 拆问题、安排并行研究、按议题边界审稿，保留分歧并整合路径，不替作者写结论 | meeting-management |
| discussion.product / domain_architect | 陈衡／商家运营分析师 | 比较商家场景的频率、替代办法与 AI 价值；缺证据明确为假设，不讨论 Convivium 工程 | [] |
| discussion.feasibility / runtime_engineer | 周宁／产品可行性分析师 | 比较数据可得性、实现成本和最小用户价值验证；可质疑平台形态，不实施代码 | [] |
| discussion.reviewer / verification_reviewer | 沈知／证据审核员 | 实际读取材料，逐主张记录支持程度与限制，不自审、不把作者输出当独立运行 | verification-review |

所有角色的 toolFilter.allow 仅 skill、convivium_meeting_status、convivium_contribution、convivium_read_contribution；Manager/Participant 不授予 Captain 工具。Captain 保留现有 preset 的创建、status、decision/risk/end 权限。expertiseTags 分别 [product-facilitation]、[merchant-operations]、[product-feasibility]、[evidence-review]，evidenceScopes 全 []；displayName 用“姓名｜职务”，不增加产品 name/title Schema。summary=persona 的第一句，roleDescription=persona＋以下共同指令，agentModelOverrides 四项均固定上述 provider/model。

共同指令：按明确任务工作；使用“主张、证据、推断、反证条件、不确定性”五项；提交材料具体版本并保留未知；同来源不算独立证据；工具报 CAS 冲突先读取最新状态、用新 requestId 重试；不使用旧 Turn 工具；没有独立外部事实时提交假设，不编造研究结果；不运行提交代码。

会议输入：标题／objective 使用[固定电商议题](../60-human/ECOMMERCE-AI-DISCUSSION-DRAFT.md#confirmed-topic)引用块的原文，不改问法；participants keys=product/feasibility/reviewer，分别引用前三个 Participant Definition，evidenceReviewerKey=reviewer；一个议题 key=merchant-mvp，inScope=[商家运营问题,三个候选场景比较,最小用户价值验证]，outOfScope=[Convivium 工程评审,直接开发产品]；requiredOutputs=[{key:"proposal",description:"推荐一个切入点并提出可证伪的最小验证方案"}]，acceptanceCriteria=[{key:"comparison",description:"至少三个场景按五个维度比较并注明假设"}]，hardConstraints=[]，agenda.completionCriteria=["comparison"]，agenda.requiredParticipantKeys=["product","feasibility","reviewer"]，requiredReviewerKeys=[reviewer]，riskAcceptanceAuthorityKeys=[]，acceptableRiskLevel=low；maxTotalMessages=24、maxDurationMs=1800000。teamId=parallel-model-team、requestId=parallel-model-create、protocolVersion=1、selectionMode=manager；agenda.title="商家运营首版方向"、agenda.objective=输入 objective，省略 ownerKey/relatedTaskIds/continuation。材料只能证明自己实际包含的内容，审核员可核验比较文档的完整性，不能把这种核验泛化为已验证商家需求。新会议不要求商家假设被虚构为已支持：无法满足正式完成依据时应保留 partial，而不是编造 supports。

脚本在真实 Captain Session 发送一次任务：创建上述会议，组织比较、核对材料、接受有依据的成果并结束；达不到完成要求时明确 partial。脚本不直接代调 assign/submit/approve/review/accept/end。随后只读观察，最长 1800000 ms，500 ms 间隔读取公开 status；观察工具由独立读入口执行，不在 Captain Session 并发 sendMessage。wrapper 对该 scenario 的结果等待上限固定 2100000 ms，继承 finally 清理。

结果 exact `{ok:boolean,scenario:"parallel-contribution-model",meetingId:string,captainSessionId:string,assertions:string[],observed:{status:MeetingStatus,messageIds:string[],archiveVerified:boolean,interventions:number}}`。interventions=0 才能声称自主完成。系统 PASS：真实模型提交、边界批准、材料读取／核验均有回执，status=archived，archiveVerified=true，无人工代填。assertions 恰为 model-origin-submissions、boundary-before-publication、material-version-readable、review-not-self、structured-comparison、archive-verified，validator 必须逐项检查来源回执与下段结构。partial 可证明诚实收口，不得改写为 objective_satisfied。

为使执行者无需评价文案好坏，Captain 初始指令同时要求最终 summary 的 content 是一个 JSON 对象，精确字段：主张:string、证据:string[]（已公开 evidenceKey）、推断:string、反证条件:string、不确定性:string、候选场景:{名称:string,频率:string,替代方案:string,AI价值:string,数据可得性:string,实现成本:string,假设:string}[]、推荐:{场景:string,理由:string,最小产品:string,价值指标:string,测量方法:string,成功条件:string,否定条件:string}。所有字符串 trim 后非空；候选场景至少三个、名称唯一，推荐.场景必须等于其中一个；证据 key 逐项可按 archive 白名单读；空证据须在不确定性中含“缺少外部证据”。验证器取最后一个正式 kind=summary 的 content 做 JSON.parse 并校验，保存其 messageId；不补字段、不推断自然语言同义项。该结构只属于固定验收 scenario，不成为产品通用 Schema。

内容结构 PASS 只说明真实模型给出了可比较、可追溯的输出，不证明商家需求真实、推荐方案有效或论据足够。上述语义质量与真实用户价值明确记为 Not Covered，保留原文供人类评价；不能让低级执行者自行判断“讨论质量合格”作为门禁。结构、必要核验或归档缺失时 T11 STOP，不能改成功标准。失败结果统一使用既有 wrapper 的失败/清理输出，不把缺少 meetingId 的失败伪装成成功 result。

## Validation Matrix And Recovery

| ID | 路径／反例 | 固定可观察结果 | 承接 |
| --- | --- | --- | --- |
| V1 | A 未返回研究结果，B 已接受并提交 | 两个独立 Session 任务在途；B 不等 A | T5b/T5c/T10 |
| V2 | 一人第二项任务／审核研究互斥 | 拒绝，旧任务与 outbox 不变 | T3a/T3d/T5a |
| V3 | 换 caller、跨会、自审、revoke、读私稿 | 正确拒绝码，零副作用、无私有信息泄漏 | T4/T5a/T5b/T5c |
| V4 | 代码 baseline+patch、同材料两个 claim | 同版本可读；核验结果按 claim 区分，作者运行不算审核人复现 | T3c/T4 |
| V5 | 字节超限、非法引用、更新旧材料 | 整体拒绝；旧版本不变；未知来源不显示已验证 | T1a/T1b/T3a/T4 |
| V6 | 待审附 claims | 公共消息、Proposal/Position/CompletionFact 均无变化 | T3a/T3b/T5a |
| V7 | 重提、旧批准、重复请求、同 ID 改内容 | 仅批准精确版本；幂等不重发；冲突拒绝 | T3b/T3d/T5a/T5c |
| V8 | CAS/持久化失败/一个非法 claim | state/event/receipt/outbox 同回滚，projection 不领先 commit | T3b/T4/T5a |
| V9 | 四类核验结论、证据作者自审 | 不支持／无法核验保留，不能伪装 supports；自审拒绝 | T3c/T5a |
| V10 | checkpoint、冷恢复、重复 status | 版本字节一致；一次恢复撤权；读不反复重投 | T4/T6d/T6e |
| V11 | required 未完或引用 pending 却 completed | 拒绝，无新完成事实；cancel 不豁免 | T3c/T3d/T6a |
| V12 | 目标满足但无关任务仍在途；恢复同时满足目标与耗尽预算；两个议题依序推进 | 先判断完成，停止无关任务；不足则 partial；required 门槛未闭合不切换，闭合后取消旧非必需私稿并通知下一议题，已公开核验保留 | T6a/T6b/T6c |
| V13 | pause/resume/end 与迟到提交竞争 | 一种 commit 顺序产生唯一合法结果；旧 generation 拒绝 | T6a/T6c/T10 |
| V14 | 最大允许状态／归档 cleanup 失败与重试 | commit 不超限；材料不复制；archiving 直到清理成立，重试不重发 | T6e |
| V15 | 真实 Loader/DSH/Browser | 权限、版本、显示与实际回读一致，finally 完整清理 | T10 |
| V16 | 固定电商议题真实模型 | 固定 JSON 结构与真实调用/归档分别证明；语义质量标 Not Covered，明确 partial／缺证据 | T11 |

T1～T9（含全部子步骤）失败只保留工作区文件与测试自有数据清理，不回滚用户文件。T10/T11 的外部副作用仅发生在 wrapper 创建的临时 profile；失败同样执行 Restore。T12 删除后失败恢复 RUNBOOK 和其引用。没有“测试失败先忽略”的分支。

完整集合固定为 T9/T12 plugin verify＋doc links/diff＋T10 probe/Browser＋T11 真实模型讨论。公共协议、共享状态、权限、恢复与 Client 均有变化，因此不以 focused tests 交付。Not Applicable：生产部署、多用户、跨 Host、物理数据库迁移、自动抓取/自动代码执行、全部外部研究能力重新认证；不属于该切片。

## Author Audit And Execution Evidence

Author 审计必须检查：字段／输入／结果／actor／ID／时间／版本；事件与 outbox；真实 Session 接受；legacy 适用范围；T1～T12 文件与签名；双向 scope 追踪；固定断言、失败恢复及删除后恢复。不得仅因链接通过就标 Executable。

执行记录初始为空：上述 24 个执行单元均未执行。当前仅形成目标契约／设计／RUNBOOK；目标功能测试、真实 DSH 组合、Browser 与模型讨论均为 Not Covered。不借用历史测试作为本次通过。


### Author Audit Result

2026-09-14，修正冲突并将五个过粗步骤拆成 17 个独立子步骤后，结论 **Executable**：Q1/A1～A4 无开放决定；结构、调用链、权限、状态、兼容及验收均有唯一处置。执行者若遇到与该固定基线不同的事实，按 STOP 报告，不能自行改变方案。此结论仅评价执行计划的决策完整性，不证明未来实现一定通过测试。

| 审计项 | 定稿位置／结果 |
| --- | --- |
| scope/non-goals 与双向追踪 | S1～S6 → T1～T12 → V1～V16；全部有正式依据，无主动申请／文件服务扩张 |
| 精确字段、来源及结构 | Interface Wire/Material/Canonical Mapping；Domain Model Minimal Contribution State；required/optional、版本、ID、时间、actor、hash 固定 |
| 消息／事实／事件／outbox | State Transitions、Events 与 Design Runtime Chain；pending 不应用 claims、负面结论保留、无半提交 |
| 调度与失败恢复 | Design DSH/Recovery；固定 Session queue、接收回执、epoch、deadline、失败回调；没有假 Turn 或隐藏后台任务 |
| 文件与签名 | Design File Manifest 与每步允许文件；新增 planning.ts 与 referenced-minutes/SKILL.md 已核对存在；指定新增文件保持唯一位置 |
| 兼容与测试迁移 | Compatibility Matrix/Legacy Fixture Procedure；旧 receipt 与业务保护保留，新入口单独验证；无生产测试开关 |
| 验证、PASS/STOP、恢复 | 24 个执行单元各有固定文件、依赖、独立验证与 PASS/STOP；全部命令／预期明确；T10/T11 用固定输入／结果；语义质量不交给执行者裁决 |
| readiness 和删除 | T12 固定迁移目的地、完整门禁、删除后检查和失败恢复 |

本次颗粒度复审核对：24 个执行单元均包含前置状态、允许/禁止文件、动作、固定命令、PASS/STOP；五个拆分组的后续依赖已落到具体子步骤；S1～S6 与 V1～V16 已指向实际负责的子步骤。阶段性开发分支不得通过 T3d/T6d 的最终检查，也不能进入新创建入口。

Author 实际验证：`node .github/scripts/check-doc-links.mjs` 检查 620 个本地 Markdown 链接、0 errors；另核对三份新文档的全部显式 section anchors；`git diff --check` 通过。检查了每个 vitest 命令中的现有测试路径和所有新测试的指定路径。本次已执行下述环境和既有产品基线检查；未执行 T1～T12 的目标功能门禁，基线通过不占用任何产品步骤的 PASS。


### Author Environment Evidence

2026-09-14 已在仓库根实际确认，无 T0 执行步骤：

- HEAD=`391a1d44b9215186e3ee5341300f04eef0c84b11`；branch=`codex/project-goal-tests-and-direction`；`git merge-base --is-ancestor 391a1d4 HEAD` 退出 0。
- Node.js=`v22.23.2`；pnpm=`10.7.0`。
- `pnpm --dir plugin dlx @deepseek-ai/dsh@0.1.2-rc.1 --version`：退出 0，输出 `0.1.2-rc.1`。
- 调用现有 `loadSmokeApiKey("dev.env")`：文件格式和非空密钥校验通过；未显示或保存密钥值，未进行远端 API 调用。
- `pnpm --dir plugin typecheck:host` 退出 0。
- `pnpm --dir plugin exec vitest run tests/contract/offline-meeting-protocol.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/status-projection.spec.ts`：3 个文件、83 项测试通过。
- 工作树已有本轮 8 份 tracked 文档修改和 3 份 untracked 新文档；没有产品源码改动，必须保留。

证据只适用于上述源码与当前本地环境；凭据格式或 CLI 可启动不证明服务端鉴权、模型可用、Browser 或真实组合通过。T10/T11 仍负责真实运行验收。执行从 T1a 开始；若执行中发现源码／环境漂移导致规定命令失败，按既有 STOP 报告，不自行改变方案。
