# Developer Markdown Projection Interface

状态：已确认

## Purpose

本文定义 Convivium 从已提交 Meeting projection 向一个显式配置的 DSH workspace 生成本地诊断 Markdown 的配置、数据、路径、写入、失败与生命周期契约。

## Boundary And Ownership

- `MeetingSnapshot` 和 `ImmutableArchivePackage` 是唯一输入真相源；Markdown 始终非权威。
- Convivium Meeting Runtime 是 producer；本地开发者是唯一 consumer。Plugin Frontend、HTTP、Tool、Agent 和恢复逻辑不得消费文件。
- `teamId + meetingId` 是文件生命周期 owner；`developerMarkdownWorkspaceId` 只选择当前 Host 的目标 workspace，不进入 MeetingState。
- workspace 配置变化只影响后续生成；Runtime 不移动或删除旧 workspace 中的文件。

## Transport Or Invocation

插件配置新增唯一 optional 字段：

```ts
interface Config {
  developerMarkdownWorkspaceId?: string;
}
```

- 缺失时关闭生成。
- 非空值必须通过 `ctx.workspaceRegistry` 解析为一个已注册 workspace；解析失败必须使 meeting consumer plugin apply 失败，不得 fallback。
- 生成由 repository 新 commit 发布后的同步 enqueue callback 触发。receipt replay、读取和恢复不得产生 enqueue。
- 本接口不增加 HTTP、Tool、Client、Agent、DSH Session event 或 durable outbox 入口。

## Data And State Contract

### Current document

```ts
interface DeveloperMeetingDocument {
  schemaVersion: 1;
  projectionKind: "current";
  authoritative: false;
  meetingId: string;
  teamId: string;
  sourceMeetingVersion: number;
  generatedAt: number;
  status: MeetingStatus;
  topic: string;
  objective: string;
  objectiveContract: DeveloperObjectiveContract;
  agenda: readonly DeveloperAgendaItem[];
  transcript: readonly DeveloperTranscriptMessage[];
  proposals: readonly DeveloperProposal[];
  decisions: readonly DeveloperDecision[];
  issues: readonly DeveloperIssue[];
  openQuestions: readonly DeveloperQuestion[];
  meetingTasks: readonly DeveloperMeetingTask[];
  completionFacts: readonly DeveloperCompletionFact[];
  artifactRefs: readonly DeveloperArtifactReference[];
  termination?: DeveloperTermination;
}

interface DeveloperObjectiveContract {
  requiredOutputs: readonly {
    id: string;
    description: string;
    status: "pending" | "ready" | "accepted";
  }[];
  acceptanceCriteria: readonly {
    id: string;
    description: string;
    satisfied: boolean;
  }[];
  hardConstraints: readonly { id: string; description: string }[];
  requiredReviewers: readonly string[];
  riskAcceptanceAuthority: readonly string[];
  acceptableRiskLevel: "low" | "medium" | "high";
}

interface DeveloperAgendaItem {
  id: string;
  title: string;
  objective: string;
  status:
    "pending" | "discussing" | "waiting" | "resolved" | "deferred" | "blocked";
  resolution?: string;
}

interface DeveloperTranscriptMessage {
  id: string;
  seq: number;
  speaker: string;
  agendaItemId: string;
  kind:
    | "statement"
    | "question"
    | "answer"
    | "proposal"
    | "objection"
    | "evidence"
    | "review"
    | "summary"
    | "decision";
  content: string;
  createdAt: number;
}

interface DeveloperProposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  revision: number;
  status: "draft" | "under_review" | "accepted" | "rejected" | "superseded";
  agendaItemId: string;
  positions: readonly {
    participantId: string;
    position: "support" | "accept" | "object" | "needs_revision" | "abstain";
    reason?: string;
    blocking: boolean;
  }[];
}

interface DeveloperDecision {
  id: string;
  proposalId: string;
  proposalRevision: number;
  status: "accepted" | "superseded" | "revoked";
  statement?: string;
  rationale?: string;
  acceptanceMode:
    | "deterministic_consensus"
    | "captain_acceptance"
    | "authorized_risk_acceptance";
}

interface DeveloperIssue {
  id: string;
  title: string;
  description: string;
  blocking: boolean;
  riskLevel?: "low" | "medium" | "high";
  status: "open" | "resolved" | "deferred" | "accepted_risk" | "out_of_scope";
  rationale?: string;
}

interface DeveloperQuestion {
  id: string;
  text: string;
  askedBy: string;
  blocking: boolean;
  status: "open" | "answered" | "withdrawn" | "deferred";
  answerMessageId?: string;
}

interface DeveloperMeetingTask {
  meetingTaskId: string;
  participantId: string;
  title: string;
  description: string;
  blocking: boolean;
  status: MeetingTaskStatus;
  createdAt: number;
  resultSummary?: string;
  failureReason?: string;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
}

interface DeveloperArtifactReference {
  artifactId: string;
  title: string;
  version?: string;
}

interface DeveloperCompletionFact {
  id: string;
  kind:
    | "output_evidence"
    | "criterion_evidence"
    | "review"
    | "question_resolution"
    | "agenda_resolution"
    | "risk_acceptance"
    | "decision_acceptance"
    | "decision_supersession"
    | "decision_revocation"
    | "waiver";
  subjectId: string;
  assertedBy: string;
  result:
    | "supported"
    | "approved"
    | "changes_required"
    | "accepted"
    | "superseded"
    | "revoked"
    | "rejected"
    | "resolved"
    | "deferred"
    | "waived";
  status: "active" | "superseded" | "revoked";
  reason?: string;
  createdAt: number;
}

interface DeveloperTermination {
  code:
    | "objective_satisfied"
    | "captain_accepted"
    | "no_consensus"
    | "stalled"
    | "max_turns"
    | "message_limit"
    | "time_limit"
    | "all_participants_unavailable"
    | "user_cancelled"
    | "internal_error";
  reason: string;
  finalMessage: string;
  endedAt: number;
}
```

mapper 必须逐字段构造以上结构，不得对任何源领域对象使用 object spread。未列出的源字段不得输出；新增 MeetingState 或领域类型字段不会自动进入本文档。

`meetingId`、`teamId`、`sourceMeetingVersion` 来自一次 committed `MeetingSnapshot`；业务字段来自对该 snapshot `state` 的 `MeetingState` 校验结果；`generatedAt` 来自 Runtime 注入的 `now()`。字段不接受 caller 输入，不使用 `null`，optional 字段为 `undefined` 时省略。

### Archive document

archive renderer 直接只读消费 committed `MeetingState.archive.package: ImmutableArchivePackage`，不得创建中间 package、调用 `materializeArchivePackage` 或建立第二套 archive mapper。Markdown 正文按 `ArchivePackage` 声明字段顺序渲染；该 package 已由归档契约排除 Session、capability、凭据和私有 Session 历史。

### Path contract

固定相对路径为：

```text
.convivium/meetings/<base64url(UTF-8 teamId)>/<base64url(UTF-8 meetingId)>/current.md
.convivium/meetings/<base64url(UTF-8 teamId)>/<base64url(UTF-8 meetingId)>/archive.md
```

base64url 不带 padding，结果必须匹配 `[A-Za-z0-9_-]+`。创建父目录后必须以 `realpath` 验证该目录仍位于 canonical workspace root；验证失败时拒绝写入。

### Markdown encoding

- UTF-8、无 BOM、LF、文件末尾恰好一个换行。
- front matter key 顺序固定为 `schemaVersion`、`meetingId`、`projectionKind`、`authoritative`、`sourceMeetingVersion`（仅 current）、`generatedAt`。
- `generatedAt` 渲染为 UTC ISO-8601；YAML string 使用 JSON double-quoted escaping。
- current heading 顺序固定为 `Objective`、`Objective Contract`、`Agenda`、`Transcript`、`Proposals and Positions`、`Decisions`、`Issues and Risks`、`Open Questions`、`Follow-up Tasks`、`Completion Facts`、`Artifacts`、`Termination`。
- 数组为空时输出 `_None._`；agenda 保持源顺序，transcript 按 `seq` 升序，其余数组按 `id` 升序。输入完整性只由现有 Meeting domain/repository 校验，不在 Markdown mapper 中重复校验。
- 正文第一段必须声明：`This file is a potentially stale, non-authoritative developer projection. The committed Meeting projection is authoritative.`
- 重新生成完整覆盖旧文件，不读取或合并旧内容。

### Coalescing and stale semantics

- pending key 是 base64url 编码后的 `teamId + meetingId`；每个 key 只保存最高 `sourceMeetingVersion`。
- worker 开始映射前调用目标 repository `read()`；当前 version 大于 task version 时跳过，等于时生成，小于或 identity 不同则记录错误并跳过。
- 单进程使用一个串行 drain；无并发配置、durable queue、timer、retry 或跨进程锁。

### Atomic replacement

temp 名称固定为 `.<targetName>.<pid>.<monotonicCounter>.tmp`，与目标同目录；以 exclusive create 和 mode `0o600` 打开，完整 write、close 后 rename。任一步失败都 best-effort unlink 本次 temp，保留此前完整目标。不得先删除目标；断电持久性和 `fsync` 为 Not Applicable，因为该文件是可丢失的 best-effort projection。

## Error And Permission Semantics

- 配置 workspace 不存在是启动错误；不得 fallback。
- enqueue 必须同步且不抛出。异步 resolve/map/write/rename/cleanup 失败只调用注入的 warning sink。
- warning 固定携带 `operation`、`teamId`、`meetingId`、`sourceMeetingVersion`、`projectionKind`，不得携带文档内容、绝对路径或凭据。
- 失败不写 MeetingState、event、receipt、outbox 或 version，不改变任何 command result。
- `dispose()` 拒绝新 enqueue、清空 pending、等待当前任务结束并清理其 temp；Markdown 错误不得使 Runtime dispose reject。

## Compatibility

- schema version 固定为 `1`。读取兼容 Not Applicable：产品没有 Markdown reader。
- 未配置字段保持既有插件行为。
- 多 Host 同写、远程 workspace、跨进程锁、旧文件迁移和自动清理为 Not Covered。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Orchestration Design](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)
