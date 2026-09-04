# RUNBOOK：Developer Markdown Projection

状态：`Blocked`

建立日期：2026-09-04

执行分支：`codex/developer-markdown-projection`

调查基线：`b82f38f94697d5f77e81ab7e7757f8f091ae737c`（当时的 `origin/main`）

## 1. 执行者契约

本 RUNBOOK 当前只能执行 T0 授权门禁。T0 在调查基线上必然 `STOP`；它不是产品实现许可。

- 严格从 T0 开始，不得跳过、改写或解释正式文档。
- T0 只读，不得修改任何文件。
- `PASS` 只表示当前 RUNBOOK 已经由 Author 在新的正式 requirement、interface 和 design 上重新调查、改写并完成 Audit；当前版本不能达到该条件。
- `STOP` 是本 RUNBOOK 的预期且强制结果。STOP 后不得创建产品文件、测试、stub、scheduler、queue、outbox kind、HTTP route、Tool、UI、配置、feature flag、adapter 或 fallback。
- 不得修改 `plugin/**`、`TODO.md`、readiness 或正式 requirement/interface/design。
- 未获得新的明确授权时，不得 commit、push、创建 PR、合并、rebase 或改写历史。
- 不得把设计中的“可以”“若提供”解释为“当前必须实现”，也不得把用户要求编写 RUNBOOK 解释为产品需求确认。
- 不得从本文件选择尚未确定的字段、路径、触发接缝、错误语义或测试签名。

## 2. 目标

### 2.1 当前起点

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) 没有要求 Developer Markdown、`current.md`、`archive.md` 或 `DeveloperMeetingDocument` 的 Functional Requirement 或 Acceptance Criterion。
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md) 的 `Developer Markdown` 小节使用“若提供开发者 Markdown”，因此只规定采用该可选能力时的边界，不授权现在实现。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) 的 `8.3 Developer Markdown generation` 使用“可以 best-effort 调度”和“归档可以 best-effort 生成”，并给出安全约束，但没有改变 requirement 缺失。
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 在 `Not Covered` 中明确记录 Developer Markdown 未实现或未覆盖。
- `plugin/src/projection/index.ts` 只导出 status projection；生产代码中不存在 `DeveloperMeetingDocument`、`render_current_markdown`、`current.md` 或 `archive.md` 实现。

### 2.2 预期终点

只有人工产品 owner 先把“当前必须实现 Developer Markdown”迁移为已确认 requirement，并由 interface/design owner 固化缺失契约后，Author 才能在新的提交基线上重新执行 `Investigate -> Author -> Audit`，把本 RUNBOOK 改写为 `Executable`。重新 Author 后的最终业务链必须且只能是：

```text
已提交 Meeting projection
-> 非持久、best-effort 的 post-commit 触发
-> 固定 DeveloperMeetingDocument 白名单投影
-> teamId + meetingId 约束下的受控 workspace 目标
-> 同 Meeting 只保留最新待执行 current 投影
-> stale sourceMeetingVersion 跳过
-> 临时文件完整写入与原子替换 current.md
-> 普通诊断日志记录失败且不改变任何会议事实

不可变 ArchivePackage
-> 非持久、best-effort 的归档渲染
-> 临时文件完整写入与原子替换 archive.md
-> 生成结果不参与 Session close、capability revoke、drain 或 archived 判定
```

当前 RUNBOOK 不声称该链路已获实现授权。

## 3. 当前断点

| 断点              | 正式或代码证据                                                                                                                                                                        | 当前结论                                                                                            | 解除方式                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 产品授权          | Requirements 无 Developer Markdown 条目；Implementation Design 写“若提供”                                                                                                             | 缺少“当前必须实现”的产品需求                                                                        | 人工产品 owner 在 requirements 中新增明确 Scope、FR 和 Acceptance Criteria       |
| 文件边界契约      | [Architecture](../00-governance/ARCHITECTURE.md) 要求新增文件权限前先形成接口契约；现有 interfaces 只把诊断 Markdown排除在 Agent Meeting Protocol 外                                  | 没有 Developer Markdown interface                                                                   | interface owner 新增唯一 interface 文档并固定 producer、consumer、权限和失败语义 |
| workspace owner   | `plugin/src/index.ts#meetingConsumerPlugin.apply` 注入 `ctx.workspaceRegistry`；rc.2 `WorkspaceRegistry` 能返回规范化 workspace path，但 MeetingState/Repository 不保存 `WorkspaceId` | 无法唯一确定哪一个 workspace 拥有 Meeting，以及归属何时固化                                         | 正式契约固定 workspace identity 的来源、创建时固化点、恢复方式和缺失处理         |
| 目标路径          | 设计只写“受控 workspace 路径”和“Meeting 自有目录”                                                                                                                                     | 无法机械计算 `current.md`/`archive.md` 路径，且不能从 backend 物理目录推导                          | 正式契约固定 workspace-relative 路径、segment 编码、碰撞规则和越界拒绝规则       |
| 文档结构          | 设计只列 broad whitelist 类别和 current front matter 示例                                                                                                                             | `DeveloperMeetingDocument` 的字段、嵌套类型、顺序、optional/nullable 和 archive front matter 未定义 | 正式 interface/design 固化完整类型与 deterministic Markdown 格式                 |
| commit 后触发     | `MeetingRepositoryPort` 没有 post-commit observer；命令散布于多个 application service                                                                                                 | 不存在唯一、不漏提交且不侵入 repository authority 的触发接缝                                        | design owner 固化唯一 production file、symbol、签名和调用顺序                    |
| latest-task merge | 设计要求同 Meeting 只保留最新待执行活动任务，但没有 owner、生命周期或 shutdown 语义                                                                                                   | 不能自行建立 scheduler 或 queue                                                                     | design owner 固化最小进程内 coalescing owner、键、替换和 dispose 行为            |
| 时钟与日志        | front matter 有 `generatedAt`，runtime 没有 Markdown logger/clock port                                                                                                                | 时间来源和可观察失败格式不唯一                                                                      | interface/design 固化 clock 来源与单一诊断 logger 调用语义                       |
| 原子替换          | 设计要求原子替换，但没有 temp name、open mode、rename 失败与 cleanup 契约                                                                                                             | 执行者无权补全“原子替换”的实现细节                                                                  | interface/design 固化同目录临时文件规则、权限、rename 和失败 cleanup             |
| 测试入口          | 当前没有 Markdown focused test 或 fixture                                                                                                                                             | 不能把现有 status/archive 测试描述为该能力证据                                                      | 重新 Author 时根据最终 symbol 固化唯一 test 文件和精确断言                       |

## 4. Scope 与 Non-goals

### 4.1 当前可执行 Scope

1. 只读核对正式 requirement、interface、design、readiness 和 production/test 搜索结果。
2. 机械执行 T0 并以 `STOP` 报告缺失授权与契约；不得进入产品实现。
3. 保留第 3、6、7、9、11 节的调查结果，供人工 owner 决策和后续重新 Author 使用；这些调查结果不是产品契约。
4. 核对 C 不拥有 B 的 FR-11 Reassign 文件、symbol 或 readiness 区域；C 不等待、消费或修改 B 的结果。

### 4.2 被阻断的目标清单（不是当前 Scope）

以下事项描述用户最初要求调查的产品目标。正式授权和缺失契约补齐前，它们都不是本 RUNBOOK 的可执行步骤：

1. 从 `MeetingRepositoryPort.read()` 返回的已提交 `MeetingSnapshot` 建立活动 Developer Markdown 输入。
2. 固化 `DeveloperMeetingDocument` 的白名单字段和 deterministic 渲染。
3. 通过正式确认的 workspace ownership 把 `teamId + meetingId` 绑定到唯一受控目录。
4. 以同目录临时文件加原子替换写 `current.md`，覆盖人工修改，不反向读取。
5. 同一进程内按 Meeting 合并 pending current projection，只保留最高 `sourceMeetingVersion`；worker 读取到更高 repository version 时跳过 stale task。
6. 失败仅记录普通诊断日志；不写 durable outbox、领域 event、receipt、Meeting state 或 Meeting version。
7. `archive.md` 只读取已经持久化于 `MeetingState.archive.package` 的不可变 `ArchivePackage`。
8. 证明 Markdown 失败不影响 pause、resume、end/archive、capability revoke、Session interrupt/drain 或 Runtime dispose。
9. 把实际实现覆盖和验证事实迁移到 readiness 后删除本 RUNBOOK。

### 4.3 Non-goals

- 不实现或修改 FR-13 Agent Catalog、recommendation、attendance、admission 或 Meeting Agent Definition runtime。
- 不增加 Developer Markdown 的 HTTP route、Tool、Client UI、Agent context、Session event 或公开 SDK contract。
- 不把 Markdown 作为 MeetingState、恢复、权限、幂等、状态计算、完成判断或归档真相源。
- 不增加 durable outbox kind、event、receipt、repository table、Storage Domain schema、migration 或 Meeting version 写入。
- 不建立通用 scheduler、持久 queue、worker framework、registry、adapter layer、feature flag、fallback、watcher 或自动修复事务。
- 不扫描、读取或推导 `plugin/src/storage/` 的 backend 物理布局。
- 不实现 remote filesystem、multi-Host writer、网络同步、发布或部署。
- 不把 artifact 内容、Session、私聊、隐藏 prompt、内部工具输出、delivery/outbox、capability、凭据或敏感绝对路径写入 Markdown。
- 不修改 B 线 FR-11 Reassign 浏览器 fixture、validator、source contract 或 readiness 证据；具体禁止文件和文档区域见 4.4。

### 4.4 与 B 线 FR-11 Reassign 浏览器闭环的边界

只读交叉核对使用了 B 线 `RUNBOOK-REASSIGN-BROWSER-EVIDENCE.md`。该临时文档不是 C 的产品真相源；下表只固定两线文件所有权，防止并行执行者重复实现或覆盖证据。

| 交叉面                   | B 唯一 owner                                                                                                   | C 动作                                                                                   | 顺序/STOP                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Reassign browser fixture | `plugin/scripts/smoke-profile/probe/scenarios/reassign.js#runReassignScenario`                                 | 禁止修改；Developer Markdown 不增加 reassign branch                                      | 无产品依赖                                                                       |
| Smoke result validation  | `plugin/scripts/smoke-profile/result.mjs#validateScenarioResult` 的 `reassign` branch                          | 禁止修改；Developer Markdown 不借用 reassign result                                      | 无产品依赖                                                                       |
| Smoke source tests       | `plugin/tests/unit/scripts/smoke-profile.spec.ts` 的 reassign cases                                            | 禁止修改；Developer Markdown focused test 必须由重新 Author 后的正式 design 给出独立路径 | 无产品依赖                                                                       |
| DSH runtime evidence     | `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` 的 G4 与 reassign scope gap                         | 禁止修改；当前没有 Developer Markdown smoke oracle                                       | 无共同 writer                                                                    |
| Current coverage         | `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的 FR-11 行、G4 reassign 证据和 reassign Not Covered 句 | C 未来只修改 Developer Markdown 对应文字，不重排表格、不改 FR-11/G4/reassign 句          | 若这些区域无法区分或已有 unresolved merge conflict，STOP；不得手工选择覆盖哪一方 |
| Full verification        | 两线都可运行 `pnpm --dir plugin verify`                                                                        | 命令只读，不形成文件或 symbol ownership                                                  | 无实施依赖；只记录各自实际运行结果                                               |

两线没有共享 production symbol、test symbol、fixture、runner、schema、transition、repository、HTTP、Tool、Client 或 projection mapper。B 明确把 Developer Markdown 列为 Non-goal；C 明确把 Reassign 浏览器闭环列为 Non-goal。C 没有 B→C 或 C→B 的执行顺序、commit、merge、fixture、验证或 readiness 前置依赖。若未来 Git 操作发现同一 readiness 文件存在未解决冲突，按仓库通用安全规则 STOP；该情形不是 Developer Markdown 产品依赖，也不授权 C 解释或覆盖 B 的区域。

## 5. 关联真相源

优先级固定为 governance -> requirements -> interfaces -> designs -> readiness -> code/tests。

- [Architecture](../00-governance/ARCHITECTURE.md)：`Confirmed Baseline`、`Dependency Rules`；只允许已提交 projection 单向派生，要求 `teamId + meetingId` ownership，禁止反向写入和新增无契约文件权限。
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：当前没有 Developer Markdown requirement；FR-9、FR-10 只约束会议恢复/归档不变量，不能单独授权开发者文件。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：`Non-goals` 排除 workspace 诊断 Markdown；协议不为该文件提供 Agent/HTTP/Client 入口。
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)：Repository commit、version、receipt、outbox 和 recovery 是权威事实边界；Markdown 不得改变该契约。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：`8.3 Developer Markdown generation` 是可选能力的现有设计约束。
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)：`Developer Markdown` 明确使用“若提供”；`Security And Observability` 仍没有唯一 workspace/path contract。
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：Developer Markdown 当前为未实现或未覆盖。

## 6. 已确定的数据、接口与调用链

本节只记录当前生产代码已经存在的事实，不补全缺失契约。

### 6.1 权威已提交输入

`plugin/src/repository/types.ts#MeetingSnapshot` 由 `plugin/src/repository/meeting-repository-port.ts#MeetingRepositoryPort.read` 返回：

```ts
interface MeetingSnapshot {
  teamId: string;
  meetingId: string;
  version: number;
  state: JsonObject;
  createdAt: number;
  updatedAt: number;
}
```

- canonical owner：`MeetingRepositoryPort` 背后的 per-Meeting Storage Domain repository。
- producer：`plugin/src/repository/domain/domain-meeting-repository.ts#DomainMeetingRepository`。
- consumer：当前 Runtime/application services；Developer Markdown consumer 尚不存在。
- `sourceMeetingVersion` 唯一可用来源是一次 `read()` 返回的 `MeetingSnapshot.version`；执行者不得用任务排队时间、event seq 或文件内容代替。
- `state` 必须按当前已验证 repository schema 解释为 `plugin/src/domain/model.ts#MeetingState`；不得从 Markdown、Client DTO 或 transcript prose 重建。

### 6.2 MeetingTask source facts

`plugin/src/domain/model.ts#MeetingTask` 当前精确字段为：

```ts
interface MeetingTask {
  meetingTaskId: string;
  participantId: string;
  originatingSpeakerAttemptId: string;
  executionId: string;
  deliveryId: string;
  sourceTurnId: string;
  sourceStepId: string;
  sourceContextFromSeq: number;
  sourceContextThroughSeq: number;
  sourceMessageId?: string;
  sourceMessageSeq?: number;
  title: string;
  description: string;
  blocking: boolean;
  status:
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  resultSummary?: string;
  failureReason?: string;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}
```

“同 Meeting 最新任务合并”只指待生成 current projection task 的内存 coalescing，不允许合并、去重或改写 `MeetingState.meetingTasks`。哪些 `MeetingTask` 字段进入 `DeveloperMeetingDocument` 尚未获得正式逐字段决定。

### 6.3 归档输入

`plugin/src/domain/model.ts#ArchivePackage` 当前 top-level 字段为：

```ts
interface ArchivePackage {
  schemaVersion: 1;
  meetingId: string;
  teamId: string;
  sourceMeetingId?: string;
  objectiveContract: MeetingObjectiveContract;
  finalSummary: string;
  artifactRefs: readonly ArchiveArtifactRef[];
  acceptedDecisions: readonly ArchiveDecision[];
  decisionHistory: readonly ArchiveDecision[];
  proposals: readonly ArchiveProposal[];
  completionFacts: readonly ArchiveCompletionFact[];
  agenda: readonly ArchiveAgendaItem[];
  issues: readonly ArchiveIssue[];
  unresolvedQuestions: readonly ArchiveQuestion[];
  parkingLot: readonly ArchiveParkingLotItem[];
  formalTranscript: readonly ArchiveMessage[];
  participantProvenance: ArchiveParticipantProvenance[];
  termination: MeetingTermination;
  endedAt: number;
  materializedAt: number;
}
```

`plugin/src/domain/model.ts#ArchiveRecord.package` 的类型是 `ImmutableArchivePackage`。`plugin/src/runtime/services/meeting-archive-service.ts#materializeArchivePackage` 产生 package；`beginArchiveFromTermination` 把它作为 `archiving` transition 的一部分提交。`archive.md` 只能消费提交后的 `MeetingState.archive.package`，不得直接调用 `materializeArchivePackage`、不得读取尚未提交的局部对象。

### 6.4 已确定的 current front matter

[Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) 当前只固定活动文档的以下 front matter：

```yaml
---
meetingId: meeting-id
projectionKind: current
authoritative: false
sourceMeetingVersion: 42
generatedAt: 2026-08-25T12:00:00Z
---
```

字段 required/optional、`generatedAt` clock、YAML escaping、archive front matter、正文 heading/排序和换行规则尚未形成完整契约；执行者不得自行补齐。

### 6.5 当前 commit 与 archive 调用链

```text
tool / loopback HTTP
-> plugin/src/runtime/application-service/* 中的 command method
-> MeetingRepositoryPort.execute / completeCreate / updateCreateResult
-> DomainMeetingRepository 写一条 CommitRecordV1
-> repository 发布内存 projection
-> application method 收到 CommittedResult
```

当前 mutation 调用分布在：

- `plugin/src/runtime/application-service/create-meeting.ts`
- `plugin/src/runtime/application-service/meeting-control.ts`
- `plugin/src/runtime/application-service/meeting-decision.ts`
- `plugin/src/runtime/application-service/meeting-end.ts`
- `plugin/src/runtime/application-service/meeting-mail.ts`
- `plugin/src/runtime/application-service/meeting-task.ts`
- `plugin/src/runtime/application-service/meeting-turn.ts`
- `plugin/src/runtime/application-service/index.ts#scanExpiredSpeakerAttempts`
- `plugin/src/runtime/meeting-runtime.ts#createMeetingRuntime`
- `plugin/src/runtime/services/meeting-archive-service.ts#beginArchiveFromTermination`
- `plugin/src/runtime/services/meeting-archive-service.ts#finalizeArchive`

归档链为：

```text
plugin/src/runtime/application-service/meeting-end.ts#createMeetingEndApplication
-> terminal repository.execute
-> plugin/src/runtime/services/meeting-archive-service.ts#recoverArchive
-> beginArchiveFromTermination
-> repository.execute commits immutable ArchivePackage and status=archiving
-> cleanupOwnedSessions / capability revoke / interrupt+drain
-> finalizeArchive
-> repository.execute commits status=archived
```

现有代码没有统一 post-commit projection hook。在哪一层增加触发接缝会改变依赖与遗漏风险，必须由正式 design 在重新 Author 前唯一确定。

### 6.6 DSH workspace 能力边界

- `plugin/src/index.ts#meetingServices` 已包含 `workspaceRegistry`，`meetingConsumerPlugin.apply` 可读取 `ctx.workspaceRegistry`。
- rc.2 `@deepseek-ai/dsh-workspace#WorkspaceRegistry.list/get/resolveByPath` 返回注册 workspace；`Workspace.path` 是通过 `fs.realpath` 固化的规范目录。
- `workspaceRegistry` 不授予任意文件写接口，也不把某个 Meeting 自动绑定到某个 Workspace。
- 当前 MeetingState、Meeting bootstrap、catalog record 和 Session ownership 没有 `WorkspaceId` 字段。
- 因此不能依据“服务已注入”猜测 workspace owner，也不能使用 `process.cwd()`、`config.dataRoot`、Storage backend root 或列表第一项作为默认 workspace。

## 7. 不可违反的不变量

1. Markdown 始终是非权威、可能滞后、可缺失且可被覆盖的开发者辅助文件。
2. 只有已提交 `MeetingSnapshot` 可生成 `current.md`；只有已提交 `ImmutableArchivePackage` 可生成 `archive.md`。
3. Markdown 不得反向写 MeetingState，不得参与恢复、授权、幂等、状态转换、completion 或 archive 正确性。
4. Markdown 失败不得回滚或阻塞 Meeting commit、pause、resume、end/archive、Session close、capability revoke、interrupt/drain 或 Runtime dispose。
5. 不新增 durable outbox、event、receipt、repository record、Meeting version 或 DSH Session event。
6. 同一 Meeting 的 pending current render 只保留最高 source version；被领取任务观察到 repository version 更高时必须跳过，不能覆盖更新文件。
7. 原子替换必须在最终目标同目录完成；完整临时文件成功关闭后才允许 rename。任一失败都不得破坏最后一个完整目标文件。
8. 人工修改不合并；成功新版本完整覆盖旧文件。Markdown 文件缺失或损坏不触发 repository 修复事务。
9. workspace 必须由正式 ownership 契约选择；`teamId + meetingId` 只用于已定义的安全 relative path segment，不得直接拼接未验证字符串。
10. 白名单输出之外全部拒绝。尤其排除 Session ID/历史、私聊、隐藏 prompt、内部 tool 输出、delivery/outbox、capability、credential、backend path 和敏感 artifact path。
11. Plugin Frontend、Agent、HTTP 和 Tool 不读取或依赖 Markdown。
12. 一个异步渲染 owner 必须在 Runtime/Cordis dispose 时达到静默；不得留下 timer、promise rejection 或未清理 temp file。

## 8. 机械执行步骤

### T0：正式授权与契约门禁

前置状态：当前分支为 `codex/developer-markdown-projection`；工作树除本 RUNBOOK 外没有修改；尚未修改 `plugin/**`；C 不拥有 4.4 列出的 B 文件与 readiness 区域。

允许修改：无。

禁止修改：仓库全部文件。

执行：

1. 从仓库根目录执行下列命令，记录完整输出。
2. 不创建或编辑任何文件。
3. 输出后立即按 PASS/STOP 判断；不得进入产品实现。

验证：

```bash
git status --short --branch
git rev-parse HEAD
! rg -n -i 'DeveloperMeetingDocument|developer markdown|current\.md|archive\.md' docs/10-requirements
rg -n -i 'DeveloperMeetingDocument|developer markdown|current\.md|archive\.md|workspace' docs/20-interfaces
rg -n '若提供开发者 Markdown|可以 best-effort 调度本地 `render_current_markdown`|归档可以 best-effort 生成 `archive.md`' docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
rg -n 'Developer Markdown.*未实现|Developer Markdown.*未覆盖' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
! rg -n 'DeveloperMeetingDocument|render_current_markdown|current\.md|archive\.md' plugin/src plugin/tests
```

PASS：当前版本无 PASS 路径。只有以下事实全部已经由人工 owner 写入正式文档，并且本 RUNBOOK 已在该新基线上重新完成 Author/Audit、状态已改为 `Executable`，才可以由改写后的 T0 定义 PASS：

1. requirements 明确该能力当前必须实现，并有可机械验收的成功、stale、失败隔离和归档标准；
2. interface 唯一固定 `DeveloperMeetingDocument`、workspace ownership、relative path、权限、版本、时间、原子替换、错误和兼容语义；
3. design 唯一固定 production files/symbols/signatures、post-commit trigger、coalescing lifecycle、logger/clock、测试文件和调用顺序；
4. readiness 仍如实表示尚未实现，不提前改为 Pass；
5. 改写后的 RUNBOOK 逐项通过 RUNBOOK Rules Audit。

STOP：在调查基线执行时必须 STOP。必须报告：

- 最后完成步骤：`T0`；
- 当前 HEAD 与 `git status --short --branch`；
- requirements 搜索没有命中 Developer Markdown；
- design 中“若提供”“可以”的准确命中；
- readiness 的未实现命中；
- production/test 搜索没有实现命中；
- 4.4 的 B/C 文件与 readiness 所有权没有冲突；若发现冲突，附上文件名和冲突区域；
- 继续所需人工决定：是否把 Developer Markdown 提升为当前必须实现的产品 requirement；若确认，由正式文档 owner 先完成上列 requirement/interface/design 迁移，再委派 Author 重写本 RUNBOOK。

失败恢复：T0 只读，无文件、进程、数据库或外部副作用，不执行恢复。若进入 T0 前发现除本 RUNBOOK 外的工作树改动，保持现场并 STOP，不得清理或覆盖。

## 9. 验证矩阵

以下矩阵记录重新 Author 必须覆盖的风险；当前全部为 `Blocked` 或 `Not Covered`，不是已通过证据。

当前 T0 的 production test、数据库迁移、外部运行、进程 cleanup 和 readiness 写入均为 `Not Applicable`：T0 只读且强制 STOP，不产生产品、文件、数据库、进程或外部副作用。本轮只运行文档格式、相对链接、模糊措辞和 diff 检查；它们只证明 RUNBOOK 文档质量，不证明 Developer Markdown 产品行为。

| 验证项                    | 最低机械断言                                                                                                 | 当前状态                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| requirement authorization | 已确认 requirement 明确“当前必须实现”和 Acceptance Criteria                                                  | Blocked：不存在                            |
| workspace ownership       | 一个 Meeting 在创建/恢复时解析到同一正式 workspace；未知、缺失、跨 workspace 均 fail closed                  | Blocked：契约不存在                        |
| path safety               | 固定 relative path；`..`、separator、symlink escape 和 identity collision 不能越界                           | Blocked：路径契约不存在                    |
| source authority          | current 输入来自单次 committed `MeetingSnapshot`；archive 输入来自 committed `ImmutableArchivePackage`       | 可追踪，未实现                             |
| document contract         | 每个字段、顺序、escaping、front matter、newline 和 redaction 有 exact assertion                              | Blocked：`DeveloperMeetingDocument` 未定义 |
| sensitive exclusion       | Session、private mail、prompt、tool internals、outbox、capability、credential、backend/sensitive path 不出现 | Not Covered                                |
| latest pending merge      | 同 Meeting 连续提交只渲染最高 pending version；不同 Meeting 相互独立                                         | Not Covered                                |
| stale claimed task        | repository version 高于 task version 时不写文件                                                              | Not Covered                                |
| atomic replacement        | temp write/close/rename 失败保留旧完整文件并清除已创建 temp file                                             | Not Covered                                |
| best-effort failure       | write/rename/logger failure 不改变 snapshot/version/event/receipt/outbox                                     | Not Covered                                |
| lifecycle                 | dispose 后无 render、timer、unhandled rejection 或 temp file                                                 | Not Covered                                |
| pause/resume              | 强制 Markdown 失败时 pause/resume 仍按原语义提交和返回                                                       | Not Covered                                |
| archive/drain             | current/archive 失败时 archive package、revoke、interrupt/drain 和 archived 仍完成                           | Not Covered                                |
| restart                   | 丢失内存 render task 不触发持久恢复；Meeting 恢复不读 Markdown                                               | Not Covered                                |
| HTTP/Tool/UI absence      | package contract 和 import graph 证明没有新增入口                                                            | Not Covered                                |
| focused tests             | 由最终 design 固定 exact test path 后执行                                                                    | Blocked：路径/symbol 未确定                |
| full verify               | `pnpm --dir plugin verify` 退出 0                                                                            | Not Run：本轮只写 RUNBOOK                  |
| real DSH profile          | 最终 design 指定 selector 与断言，或正式标为 Not Applicable                                                  | Blocked：当前 smoke 无 Markdown oracle     |

禁止用现有 status projection、archive、repository 或 smoke 测试的通过结果外推为 Developer Markdown 已覆盖。

## 10. 失败处理与恢复

- T0 失败：保持现场，报告 STOP；不得编辑正式文档代替人工 owner 决定。
- 后续重新 Author 时，任何 baseline、focused test、typecheck、build 或 full verify 失败都必须保留失败输出并 STOP；不得放宽 Schema、断言、类型、redaction 或路径规则。
- 测试创建的 workspace、Meeting、temp file 和运行中进程必须按 `Prepare -> Execute -> Assert -> Restore` 管理；失败路径也必须 Restore。
- 产品实现不得依赖“稍后补偿”保证文件存在。进程崩溃丢失任务是正式设计允许的 best-effort 边界。
- 不得删除或回滚用户已有改动；不得以清理工作树为理由执行 destructive Git 命令。

## 11. Scope 双向追踪

### 11.1 当前可执行 Scope

| Scope                      | 授权依据                                | 执行步骤/产物  | 验证与终点                                |
| -------------------------- | --------------------------------------- | -------------- | ----------------------------------------- |
| 正式授权门禁               | RUNBOOK Rules `STOP Semantics`          | T0             | 固定搜索命令；输出缺口后 STOP             |
| 当前代码与契约断点调查     | 本次用户委派；RUNBOOK Rules `Authoring` | 第 3、6、9 节  | 路径/symbol 存在性与正式文档搜索          |
| B/C 解耦与最小化范围核对   | 本次协调要求；Implementation Economy    | 第 4.3、4.4 节 | C 不修改或依赖 B 的文件、symbol 和证据    |
| Blocked/Not Covered 如实性 | Document Rules；RUNBOOK Rules           | 第 9、13 节    | 不把未授权、未实现或未运行内容描述为 Pass |

反向检查：当前唯一机械步骤 T0 只服务“确认是否获得实现授权”，并且只读；没有步骤实现 Non-goals 或第 4.2 节的被阻断目标。

### 11.2 被阻断目标的调查追踪（不是实施授权）

| 被阻断目标                       | 当前约束依据                                                    | 当前 production anchor                                                                            | 缺失决定                                                       |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| committed current source         | Architecture；Orchestration Design 8.3                          | `MeetingRepositoryPort.read`、`MeetingSnapshot`                                                   | requirement 与 post-commit consumer                            |
| fixed document/redaction         | Orchestration Design 8.3                                        | `MeetingState`、`MeetingTask`                                                                     | 完整 interface、mapper/render symbol 与 test                   |
| workspace + team/meeting owner   | Architecture `Dependency Rules`                                 | `meetingConsumerPlugin.apply`、`ctx.workspaceRegistry`、repository `teamId/meetingId`             | ownership/path interface                                       |
| atomic `current.md`              | Orchestration Design 8.3                                        | 无                                                                                                | file operation contract                                        |
| latest pending + stale skip      | Orchestration Design 8.3                                        | 无                                                                                                | lifecycle owner/signature                                      |
| best-effort isolation            | Architecture；Implementation Design `Pause, resume and archive` | application services、repository port                                                             | 触发接缝、logger/error contract 与 failure test                |
| immutable `archive.md` source    | Orchestration Design 8.3                                        | `ArchiveRecord.package`、`beginArchiveFromTermination`                                            | archive document contract 与 trigger                           |
| no public surface/durable writes | Agent Meeting Protocol Interface；Architecture                  | tools/http/client/protocol/repository schemas                                                     | 获得授权后仍保持 negative contract                             |
| readiness and deletion           | Document Rules；RUNBOOK Rules                                   | `CURRENT-IMPLEMENTATION-COVERAGE.md` 的 Developer Markdown 文字；不含 B 的 FR-11/G4/reassign 区域 | 实现后实际 commit/date/environment/result 与 full verification |

正式 owner 补齐缺失决定后，Author 必须重新建立机械步骤；不得直接把本表转换为代码任务。

## 12. 完成定义、readiness 迁移与删除条件

当前状态不能完成，也不能删除本 RUNBOOK。正式授权后必须先重新 Author/Audit；实现完成时同时满足以下条件才可 Close：

1. 新 requirement、interface 和 design 已成为正式真相源；RUNBOOK 不保存唯一长期契约。
2. 所有最终 production/test files 与 symbols 已按重新 Author 的固定清单实现，无 Non-goal 扩张。
3. 验证矩阵每项为 Pass 或有正式依据的 Not Applicable；Blocked 和未经解释的 Not Covered 均为零。
4. focused tests、typecheck、build、package contract、`pnpm --dir plugin verify` 和正式指定的真实运行验证全部记录真实输出。
5. [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 只在 Developer Markdown 对应文字中更新 commit、日期、环境、执行命令、结果和仍然 Not Covered 的边界；不得修改 B 拥有的 FR-11/G4/reassign 区域，不得外推历史证据。
6. `rg -n 'RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION|RUNBOOK：Developer Markdown Projection' . --glob '!docs/30-designs/RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION.md'` 无长期引用，或引用已迁移到正式文档。
7. 删除本 RUNBOOK 前后都执行相对链接检查、Prettier 和 `git diff --check`；删除后任一检查失败必须恢复文件并 STOP。

## 13. Author/Audit 结论

结论：`Blocked`。

阻塞链固定为：

1. 正式产品 requirement 缺失；当前 design 明确是 optional，readiness 明确为未实现。
2. 即使人工确认“现在实现”，workspace ownership/path、`DeveloperMeetingDocument`、触发接缝、coalescing lifecycle、clock/logger、原子替换和测试入口仍须先由正式 interface/design 唯一固定。
3. 正式文档迁移后必须重新 `Investigate -> Author -> Audit`；当前 T0 不会自动转为产品实施许可。

最小化 Audit：当前可执行 Scope 只有一个只读 T0，没有新增产品文件、抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点。第 4.2 节列出的潜在结构全部处于阻断状态；没有当前需求/契约依据时不得创建。B 的只读互审确认 `Blocked` 来源是上述 C 正式依据缺失，不是跨线冲突；C 与 B 没有实施或顺序依赖。

本轮 Not Covered：产品实现、focused/full plugin validation、真实 DSH profile、文件系统失败注入、敏感字段验证、并发/stale/lifecycle、pause/resume/archive failure isolation、readiness 更新和 RUNBOOK Close。
