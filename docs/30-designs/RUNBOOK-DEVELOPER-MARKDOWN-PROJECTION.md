# RUNBOOK：Developer Markdown Projection

状态：`Blocked`

建立日期：2026-09-04

执行分支：`codex/developer-markdown-projection`

调查代码基线：`cab9d67b8c43ee80606120a0214d029ee44e635d`

## 1. 执行者契约

本版本只允许执行 T0 committed-contract gate。用户已确认最小产品行为；正式 requirement、interface 和 design 当前仍是未提交改动，因此不存在同时包含这些契约的 literal commit SHA。

- T0 只读，不得修改或暂存文件。
- T0 `PASS` 后仍不得实现产品；Author 必须先在包含正式契约的 literal SHA 上重新调查、编写完整实施步骤并完成 Audit。
- T0 `STOP` 后不得创建 production/test stub，不得 commit、push 或创建 PR。
- 不得修改 FR-11 Reassign、HTTP、Tool、Client、Meeting protocol/schema、MeetingState、event、receipt 或 outbox。

## 2. 目标

当前起点：

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) 已新增 FR-15 与 AC 42-48。
- [Developer Markdown Projection Interface](../20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md) 已固定配置、数据、路径、渲染、coalescing、原子替换、错误和生命周期。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md) 是唯一实现设计，已固定配置后必须提供的最小实现。
- 上述改动尚未提交；production/test 中没有 Developer Markdown 实现。

预期终点：

```text
committed MeetingSnapshot
-> repository post-commit synchronous enqueue
-> Runtime-owned single serial worker
-> whitelist DeveloperMeetingDocument
-> configured canonical workspace
-> stale check and same-directory atomic current.md replacement

committed ImmutableArchivePackage
-> whitelist archive mapping
-> same failure-isolated worker
-> atomic archive.md replacement
```

实现与验证完成后只更新 Developer Markdown readiness 文字并删除本 RUNBOOK。

## 3. 当前断点

| 断点                   | 证据                                              | 结论                           | 解除方式                                          |
| ---------------------- | ------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| committed contract SHA | `git status --short` 显示正式文档未提交           | 无法固定不可漂移实现基线       | 获得 commit 授权后提交正式文档，重新 Author/Audit |
| production symbols     | `plugin/src` 无 Developer Markdown mapper/service | 后续实施范围，不是产品 blocker | 由重新 Author 的机械步骤创建                      |

没有剩余产品判断。workspace、路径、字段、触发、stale、atomic write、logger、dispose 和测试语义均由正式接口固定。

## 4. Scope 与 Non-goals

当前 Scope 只有 committed-contract gate 和重新 Author 前的只读调查。

Non-goals：本版本不实现代码，不新增 durable queue、timer、event bus、registry、adapter、fallback、HTTP、Tool、Client、Agent API、Meeting schema/state/event/receipt/outbox、跨 Host writer、发布或部署；不修改 FR-11 Reassign 文件或证据。

## 5. 关联真相源、数据与调用链

- Requirement owner：FR-15、AC 42-48。
- Interface owner：`DeveloperMeetingDocument` 的逐字段白名单、只读 `ImmutableArchivePackage` archive 输入及 path/write/error contract。
- Production inputs：`plugin/src/repository/types.ts#MeetingSnapshot`、`plugin/src/domain/model.ts#MeetingState`、`plugin/src/domain/model.ts#ImmutableArchivePackage`。
- Commit anchors：`plugin/src/repository/domain/domain-meeting-repository.ts#DomainMeetingRepository.commit` 和 creation ready publication。
- Runtime anchors：`plugin/src/runtime/application-service/index.ts#createCreateStatusRuntime` 与 `dispose`。
- DSH workspace：rc.2 `WorkspaceRegistry.get(id): Workspace | undefined`；`Workspace.path` 是 canonical path。

ID、actor、request hash、transition、event、receipt、outbox 与兼容读取均为 `Not Applicable`：Markdown 不接受 caller command、不提交 Meeting transaction、不形成持久或公开协议。

## 6. 不可违反的不变量

1. 只消费 committed snapshot/package；Markdown 不反向写会议。
2. 未配置时关闭；配置未知 workspace 时启动失败且无 fallback。
3. 白名单之外全部拒绝；新增 MeetingState 字段不会自动输出。
4. enqueue 不执行 I/O；异步失败不改变 command result 或会议事实。
5. 同 Meeting pending 只保留最高 version；stale task 不写目标。
6. 同目录 temp 完整 write/close 后才 rename；失败保留旧目标；不执行 `fsync`。
7. 单进程、单串行 drain；无持久任务、重试 timer 或跨进程锁。
8. dispose 清空 pending、等待 active cleanup，且不因 Markdown 错误 reject。

## 7. 机械执行步骤

### T0：Committed contract gate

前置状态：当前分支为 `codex/developer-markdown-projection`；除本次正式文档和 RUNBOOK 外没有工作树改动。

允许修改：无。

禁止修改：仓库全部文件。

执行：从仓库根目录运行验证命令并立即按 PASS/STOP 判断。

验证：

```bash
git status --short --branch
git rev-parse HEAD
git log -1 --format='%H %cI %s'
rg -n '### FR-15：Developer Markdown Projection|42\. 未配置 `developerMarkdownWorkspaceId`|48\. Developer Markdown' docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md
rg -n '^状态：已确认|interface DeveloperMeetingDocument|directly consume|直接只读消费|### Atomic replacement' docs/20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md
rg -n '本节是 Developer Markdown 的唯一实现设计|repository callback 只同步 enqueue|service 由 Runtime `dispose\(\)` 收口' docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md
! rg -n '^### Developer Markdown$|DEVELOPER-MARKDOWN-PROJECTION-INTERFACE' docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md
git diff --quiet -- docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md docs/20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md
```

PASS：全部命令退出 0，三份 canonical 文档和一份重复设计清理相对 HEAD 无差异；报告 literal 40-character HEAD。不要开始实现，委派 Author 在该 SHA 上替换本 RUNBOOK。

STOP：任一命令非 0，或正式文档仍有 staged、unstaged 或 untracked 状态。报告 HEAD、完整 status、失败命令和输出；不得自行提交或暂存。

失败恢复：T0 只读，无恢复动作。

## 8. 验证矩阵与恢复

| 验证项                                                                | 当前状态                               |
| --------------------------------------------------------------------- | -------------------------------------- |
| 正式产品授权                                                          | Pass：FR-15、AC 42-48 已形成工作树文档 |
| 配置、workspace、路径、文档、stale、atomic、failure、dispose contract | Pass：唯一 interface 已形成工作树文档  |
| committed baseline                                                    | Blocked：尚无包含上述文档的 commit     |
| focused tests、typecheck、build、full verify、真实运行                | Not Run：本版本禁止产品实施            |
| HTTP/Tool/UI                                                          | Not Applicable：正式 Non-goal          |
| durable state/event/receipt/outbox/migration                          | Not Applicable：正式 Non-goal          |

T0 失败不清理工作树。后续实施 RUNBOOK 必须为每步固定 Prepare、Execute、Assert、Restore；失败不得放宽白名单、路径、原子替换或隔离断言。

## 9. Scope 双向追踪

| Scope                | 正式依据                     | 步骤               | 终点                  |
| -------------------- | ---------------------------- | ------------------ | --------------------- |
| 固定最小产品行为     | FR-15、AC 42-48              | 已完成 Author 文档 | requirement 可检索    |
| 固定跨边界契约       | Developer Markdown Interface | 已完成 Author 文档 | interface 可检索      |
| 防止未提交契约被执行 | RUNBOOK Rules baseline/STOP  | T0                 | committed SHA 或 STOP |

反向检查：唯一执行步骤 T0 只服务 committed baseline gate；没有步骤进入 Non-goals。

## 10. Readiness 迁移与删除条件

本 RUNBOOK 当前不得删除。正式文档提交后先重新 Author/Audit；产品实现、focused tests、`pnpm --dir plugin verify` 和正式指定验证全部 Pass 后，在 `CURRENT-IMPLEMENTATION-COVERAGE.md` 只更新 Developer Markdown 条目，记录 commit/date/environment/commands/result/Not Covered。确认无长期引用后删除 RUNBOOK，并在删除前后运行相对链接、Prettier 和 `git diff --check`。

## 11. Author/Audit 结论

结论：`Blocked`。

唯一 blocker 是包含已确认正式契约的 literal committed SHA 尚不存在。不存在未决产品判断或跨线依赖；不得以该时序 blocker 为由实现 stub、选择替代路径或建立额外机制。
