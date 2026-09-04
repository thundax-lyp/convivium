# RUNBOOK：Developer Markdown Projection

状态：`Executable`

建立日期：2026-09-04

执行分支：`codex/developer-markdown-projection`

目标基线：`5c2574800f7a627a7a0ac824e53584b70ae8c8b6`

## 1. 执行者契约

- 严格按 T0 → T6 执行；前一步未 PASS 时不得进入后一步。
- 每步只修改“允许修改”列出的文件和 symbol。发现路径、签名或正式契约不一致时立即 STOP，不得寻找替代入口。
- 禁止修改 MeetingState、protocol/schema、transition、event、receipt、outbox、HTTP、Tool、Client、Agent loop、smoke runner 或 FR-11 Reassign。
- 禁止新增 event bus、durable queue、timer、registry、adapter、fallback、跨进程锁、配置开关或第三方依赖。
- 失败不得放宽白名单、路径 containment、stale、原子替换、failure isolation 或 dispose 断言。
- 未获得新的明确授权时不得 commit、push、创建 PR、merge、rebase 或改写历史。

PASS 表示当前步骤命令退出 0、客观断言成立且 diff 只包含允许文件。STOP 报告必须包含最后 PASS 步骤、触发条件、文件/symbol、失败命令、完整输出和继续所需决定；保持现场，不清理用户改动。

## 2. 目标与完整链路

在配置 `developerMarkdownWorkspaceId` 时生成本地非权威 Developer Markdown；未配置时保持现有行为：

```text
new durable Meeting commit
-> publish in-memory MeetingSnapshot
-> synchronous non-throwing schedule(snapshot)
-> keep highest pending version per teamId + meetingId
-> repository.read() stale check
-> explicit whitelist map/render
-> canonical workspace containment
-> exclusive same-directory temp write/close/rename current.md
-> committed archive.package present
-> direct read-only archive render/atomic archive.md
-> warning-only failure
-> Runtime dispose quiescence
```

交付物是 mapper/renderer、单一 Runtime-owned worker、两个 repository commit callback、配置接线、focused tests、完整验证和 readiness 更新。

## 3. 正式依据与当前断点

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-15、AC 42-48。
- [Developer Markdown Projection Interface](../20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md)：唯一配置、数据、路径、编码、stale、atomic、error、dispose 契约。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：8.3，唯一实现设计。
- `plugin/src/repository/domain/domain-meeting-repository.ts#commit` 在 durable put 后发布普通 commit projection。
- 同文件 `completeCreate` 在 seq 1 put、creation ready 和 catalog ready 后返回创建结果；callback 必须放在 catalog ready 后、return 前。
- `plugin/src/runtime/application-service/index.ts#createCreateStatusRuntime` 创建 registry，并在 `dispose` 中关闭 workers/repository。
- `plugin/src/index.ts#meetingConsumerPlugin.apply` 已注入 `workspaceRegistry`；rc.2 `WorkspaceRegistry.get(id)` 返回 canonical `Workspace.path`。
- 当前不存在 Developer Markdown production/test symbol；readiness 仍为未实现或未覆盖。

## 4. Scope 与 Non-goals

Scope：FR-15 当前/归档 Markdown、显式 workspace 配置、post-commit enqueue、latest/stale、原子替换、warning isolation、dispose、focused/full verification 和 Developer Markdown readiness。

Non-goals：公开 reader、HTTP/Tool/UI/Agent surface、Meeting durable schema/state/event/receipt/outbox、恢复补偿、retry、timer、多 Host、远程 workspace、旧文件迁移/删除、通用 projection framework、发布与部署。

## 5. 固定文件与 symbol

| 文件                                                                | symbol/职责                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin/src/projection/developer-markdown.ts`（新增）               | 接口文档全部 `Developer*` 类型；`mapDeveloperMeetingDocument(snapshot)`；`renderCurrentMarkdown(document)`；`renderArchiveMarkdown(package, generatedAt)` |
| `plugin/src/projection/index.ts`                                    | 只导出上述类型和三个函数                                                                                                                                  |
| `plugin/src/runtime/services/developer-markdown-service.ts`（新增） | `createDeveloperMarkdownService(options)`；pending map、stale read、路径 containment、atomic write、warning、dispose                                      |
| `plugin/src/repository/domain/domain-meeting-repository.ts`         | `DomainMeetingRepositoryOpenOptions.onProjectionCommitted?`；两个新 commit 发布点调用 callback                                                            |
| `plugin/src/repository/domain/domain-repository-registry.ts`        | `DomainRepositoryRegistryOptions.onProjectionCommitted?` 并原样传递                                                                                       |
| `plugin/src/runtime/application-service/index.ts`                   | `CreateStatusRuntimeOptions.developerMarkdown?`、service/registry 接线、dispose 顺序                                                                      |
| `plugin/src/config.ts`                                              | `Config.developerMarkdownWorkspaceId?: string` 与非空 schema                                                                                              |
| `plugin/src/index.ts`                                               | workspace resolve、`convivium:developer-markdown` logger、runtime options                                                                                 |
| `plugin/README.md`                                                  | optional config、路径、非权威与 Not Covered 边界                                                                                                          |

新增测试仅为：

- `plugin/tests/unit/projection/developer-markdown.spec.ts`
- `plugin/tests/unit/runtime/developer-markdown-service.spec.ts`

修改既有测试仅为：

- `plugin/tests/contract/domain-meeting-repository.spec.ts`
- `plugin/tests/contract/domain-repository-registry.spec.ts`
- `plugin/tests/contract/meeting-runtime.spec.ts`
- `plugin/tests/unit/config.spec.ts`
- `plugin/tests/unit/index-inject.spec.ts`

## 6. 固定接口与语义

`developer-markdown.ts` 必须逐字段实现正式 Interface 中的结构，禁止 source object spread。签名固定为：

```ts
export function mapDeveloperMeetingDocument(
  snapshot: MeetingSnapshot,
): DeveloperMeetingDocument;
export function renderCurrentMarkdown(
  document: DeveloperMeetingDocument,
): string;
export function renderArchiveMarkdown(
  archivePackage: ImmutableArchivePackage,
  generatedAt: number,
): string;
```

`snapshot.state` 必须调用现有 `isMeetingStateV2` 验证；false 时 throw `TypeError("Meeting snapshot state is invalid")`。current mapper 的 ID/time/version 来源只按 Interface；其 `DeveloperArtifactReference` 不含 `checksum`。archive renderer 不复制 package、不调用 `materializeArchivePackage`；它必须从 committed `ImmutableArchivePackage.artifactRefs[]` 原样保留 optional `checksum`。

两个 renderer 使用同一局部 helper `renderSection(title, value)`，不得导出 formatter abstraction。输出算法固定为：front matter 按 Interface key 顺序；空数组 section body 为 `_None._`；其他 section body 为 ` ```json`、`JSON.stringify(value, null, 2)`、` ``` ` 三行结构；section 之间一个空行；最终恰好一个 LF。current 首行为 `# Current Meeting Projection`，随后是 Interface 固定 heading；archive 首行为 `# Archived Meeting Projection`，随后按 `ArchivePackage` top-level 声明顺序生成 heading。JSON stringify 只接收已映射白名单值或 immutable package，不实现自定义 serializer。

Service 签名固定为：

```ts
export type DeveloperMarkdownOperation =
  | "read_snapshot"
  | "resolve_directory"
  | "map_document"
  | "write_temp"
  | "replace_target"
  | "cleanup_temp";

export interface DeveloperMarkdownWarning {
  operation: DeveloperMarkdownOperation;
  teamId: string;
  meetingId: string;
  sourceMeetingVersion: number;
  projectionKind: "current" | "archive";
}

export interface DeveloperMarkdownService {
  schedule(snapshot: MeetingSnapshot): void;
  dispose(): Promise<void>;
}

export function createDeveloperMarkdownService(options: {
  workspaceRoot: string;
  openRepository(
    teamId: string,
    meetingId: string,
  ): Promise<MeetingRepositoryPort>;
  now?: () => number;
  warn(warning: DeveloperMarkdownWarning): void;
}): DeveloperMarkdownService;
```

`schedule` 捕获所有同步异常并调用 `warn`；`warn` 自身异常必须吞掉，因此 schedule 永不抛出。pending key 是两个 base64url segment 以 `/` 连接。只用一个 Promise drain，不建 class、timer 或通用 queue。temp counter 是 service-local integer，初值 0，每次 temp create 前加 1。

目录处理固定为：从 canonical `workspaceRoot` 开始，按 `.convivium`、`meetings`、team segment、meeting segment 顺序检查已存在 ancestor；`lstat().isSymbolicLink()` 为 true 时在创建任何后代前拒绝；不存在时从该点 `mkdir({ recursive: true, mode: 0o700 })`；最后 `realpath(parent)` 并用 `path.relative(workspaceRoot, resolvedParent)` 断言结果不是 absolute 且不以 `..` path segment 开头。不得递归扫描 workspace，也不得建立通用 safe-path module。

Repository callback 签名固定为 `(snapshot: MeetingSnapshot) => void`。普通 commit 在 `projection/headSeq/headDigest` 发布后调用；creation 在 commits、creation 和 catalog 三项 ready 后调用。callback 收到 `structuredClone(this.projection.snapshot)`；read/recover/replay/no-op 不调用。

Runtime option 固定为：

```ts
readonly developerMarkdown?: {
  readonly workspaceRoot: string;
  readonly warn(warning: DeveloperMarkdownWarning): void;
};
```

Runtime 先创建 service，再把 `service.schedule` 传入 registry；service 的 `openRepository` 复用该 registry。dispose 顺序固定为 abort monitors → await timeout monitor → dispose delivery workers → dispose Developer Markdown service → close registry → clear meetings。

`plugin/src/config.ts#Config` 对该字段使用 `Schema.string().pattern(/\S/)`。`meetingConsumerPlugin.apply` 使用 `config.developerMarkdownWorkspaceId === undefined` 判关闭；否则从 `@deepseek-ai/dsh-workspace` 导入 `WorkspaceId`，调用 `ctx.workspaceRegistry.get(configValue as WorkspaceId)`。undefined 时 throw `Error("Developer Markdown workspace is not registered: <id>")`。warning sink 只执行：

```ts
ctx
  .logger("convivium:developer-markdown")
  .warn("Developer Markdown projection failed %o", warning);
```

不得记录原始 error、文档内容或绝对路径。

## 7. 不变量

1. Markdown 无 actor、request、receipt、event、outbox 或 Meeting version 写入。
2. callback 只对应新 commit；失败 put、replay、read、recover 和 no-op 均零 enqueue。
3. current/archived 输入分别是 committed snapshot/committed immutable package。
4. 未配置零 service；未知 workspace 启动 fail closed，无 fallback。
5. 路径、编码、排序、escaping、final newline 完全遵循 Interface。
6. stale、write、close、rename、cleanup、warn 失败不改变会议提交结果。
7. 旧完整目标在 rename 前保留；不执行 `fsync`。
8. dispose 后无 pending、active write、temp 或 unhandled rejection。

## 8. 机械执行步骤

### T0：固定基线

前置状态：分支为 `codex/developer-markdown-projection`，工作树除本 RUNBOOK 外 clean。

允许修改：仅本 RUNBOOK。禁止修改：其他全部文件。

执行：验证 HEAD、正式依据、当前缺口和 DSH 版本。

验证：

```bash
test "$(git rev-parse HEAD)" = '5c2574800f7a627a7a0ac824e53584b70ae8c8b6'
test -z "$(git status --porcelain --untracked-files=all | awk 'substr($0, 4) != "docs/30-designs/RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION.md" { print }')"
rg -n '### FR-15：Developer Markdown Projection|48\. Developer Markdown' docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md
rg -n '^状态：已确认|interface DeveloperMeetingDocument|### Atomic replacement' docs/20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md
rg -n '0\.1\.1-rc\.2' plugin/package.json plugin/pnpm-lock.yaml
! rg -n 'DeveloperMeetingDocument|createDeveloperMarkdownService|developerMarkdownWorkspaceId' plugin/src plugin/tests plugin/README.md
```

PASS：全部退出 0。STOP：任一失败；报告实际 HEAD/status/命中，不更新基线或正式契约。失败恢复：只读，无恢复。

### T1：白名单 mapper 与 renderer

前置状态：T0 PASS。

允许修改：`plugin/src/projection/developer-markdown.ts`、`plugin/src/projection/index.ts`、`plugin/tests/unit/projection/developer-markdown.spec.ts`。

禁止修改：domain/repository/runtime/config 和其他 tests。

执行：创建第 5、6 节固定类型/函数；逐字段映射，按固定 JSON section 算法实现 heading、排序、escaping、empty marker 和 final newline。测试必须用完整字符串等值断言覆盖 current/archive；另覆盖每个 optional 缺失、空数组、非法 state、敏感字段缺失和相同输入/时间的确定字节输出。current fixture 必须包含源 artifact `checksum`，并断言 `mapDeveloperMeetingDocument` 的返回值与 `renderCurrentMarkdown` 输出均不含 `checksum`；archive fixture 必须在 committed `ImmutableArchivePackage.artifactRefs[]` 中包含 optional `checksum`，并断言 `renderArchiveMarkdown` 在 `Artifacts` section 原样保留该值。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/projection/developer-markdown.spec.ts
pnpm --dir plugin typecheck
git diff --check
```

PASS：三命令退出 0；`mapDeveloperMeetingDocument` 返回值和 current Markdown 均无 `attemptId|executionId|deliveryId|checksum|sourceMessageId`；archive Markdown 无 `attemptId|executionId|deliveryId|sourceMessageId`，且其 `Artifacts` section 精确包含 fixture 的 optional `checksum`。STOP：签名/字段不一致、archive `checksum` 被删除或转换、current 泄露 `checksum`，或命令失败；不得新增 archive mapper、脱敏层、配置、通用抽象、扩大类型或使用 spread。失败恢复：无外部副作用，保留 diff。

### T2：单一 worker 与文件原子性

前置状态：T1 PASS。

允许修改：`plugin/src/runtime/services/developer-markdown-service.ts`、`plugin/tests/unit/runtime/developer-markdown-service.spec.ts`。

禁止修改：repository/config/index 和其他 tests。

执行：实现第 6 节 service。测试使用真实 `mkdtemp` workspace 和 mock repository；每个 case 在 `finally` 删除其唯一 temp root。覆盖未配置不在本 service、不同 Meeting、latest replacement、stale skip、identity/version error、current/archive、containment、旧文件保留、write/rename/cleanup/warn failure、并发 dispose、late completion 和 temp 清理。Node fs failure 使用 Vitest 对 `node:fs/promises` 的 module mock，不增加 production I/O adapter。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/developer-markdown-service.spec.ts
pnpm --dir plugin typecheck
git diff --check
```

PASS：三命令退出 0，所有 temp roots 删除。STOP：出现 timer、retry、adapter、残留目录或失败。失败恢复：终止残留 test process，删除测试输出明确打印的 temp root；不得删除其他目录。

### T3：Repository post-commit callback

前置状态：T2 PASS。

允许修改：`plugin/src/repository/domain/domain-meeting-repository.ts`、`plugin/src/repository/domain/domain-repository-registry.ts`、`plugin/tests/contract/domain-meeting-repository.spec.ts`、`plugin/tests/contract/domain-repository-registry.spec.ts`。

禁止修改：repository schema/projection/port、domain、runtime 和其他 tests。

执行：增加第 6 节 callback option/pass-through，在普通 commit 和 creation ready 两处调用。测试新 create/new command 各一次 callback；failed put、receipt replay、read、recover、no-op 为零；snapshot 是 clone；registry 原样传递。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/domain-meeting-repository.spec.ts tests/contract/domain-repository-registry.spec.ts
pnpm --dir plugin typecheck
git diff --check
```

PASS：三命令退出 0且 callback 计数精确。STOP：需要改 schema/port/transaction 或失败；不得新增 event。失败恢复：测试 storage fixture 自清理，无外部恢复。

### T4：Config、Runtime 与 Host 装配

前置状态：T3 PASS。

允许修改：`plugin/src/config.ts`、`plugin/src/index.ts`、`plugin/src/runtime/application-service/index.ts`、`plugin/README.md`、`plugin/tests/unit/config.spec.ts`、`plugin/tests/unit/index-inject.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。

禁止修改：HTTP/Tool/Client/smoke/profile/package manifest 和其他 tests。

执行：增加第 6 节 optional config、workspace resolve、logger、runtime option、service/registry 接线和 dispose 顺序。README 只记录配置、路径、非权威、失败隔离及 Compatibility 的 Not Covered。测试 config absent/empty/value；absent 零 workspace get/service；known workspace canonical path；unknown fail；warning不含 error/path；Runtime commit schedule；dispose quiescence。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/config.spec.ts tests/unit/index-inject.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck
pnpm --dir plugin lint
git diff --check
```

PASS：四命令退出 0，既有 inject 数组不变。STOP：需要 profile/manifest/HTTP/schema 变更或失败；不得增加 fallback。失败恢复：dispose 测试 root，保留 diff。

### T5：完整验证

前置状态：T4 PASS，工作树只含 T1-T4 允许文件和本 RUNBOOK。

允许修改：无。

禁止修改：其他全部文件。

执行：运行完整验证并记录完整输出。真实 DSH smoke 为 Not Applicable：没有 HTTP、Tool、UI、Agent 或默认 profile surface。

验证：

```bash
pnpm --dir plugin verify
git diff --check
```

PASS：两命令退出 0。STOP：任一失败；不得更新 readiness、删除 RUNBOOK 或提交。失败恢复：验证无持久外部状态；若测试输出 temp root，确认其已删除，否则只删除该精确 root 后 STOP。

### T6：Literal implementation commit、readiness 与 Close

前置状态：T5 PASS；用户已明确授权提交并且 T1-T5 实现已形成一个或多个 commit；工作树 clean；HEAD 是目标基线后代。

允许修改：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 中只归属 Developer Markdown 的内容、本 RUNBOOK（最后删除）。

禁止修改：其他全部文件；禁止修改 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的 FR-11 requirement row、G4 Browser 证据、历史 smoke 证据及非 Developer Markdown 的 Not Covered 内容。

执行：按 C-first 顺序，在 B 修改 FR-11/G4 readiness 前由 C 独占执行本步骤。修改前先运行 `test -z "$(git status --porcelain --untracked-files=all)"`；非 0 立即 STOP。再断言 FR-11 row 的 SHA-256 为 `3a07aa48491e2eca233ee1af45135c4f6e585a000356f15f05c6581f06c2042a`，全部 `- Pass：G4` 行的 SHA-256 为 `fc0b8fffcb0473bc51e79e2259db8d5068d8fe62d2df7890375f56abd11cdd2c`；任一不匹配立即 STOP。取得 `git rev-parse HEAD` 的 literal 40-character implementation SHA。在 Requirement Coverage 表新增唯一 row：Requirement=`FR-15 Developer Markdown Projection`、状态=`已实现`、当前覆盖=`committed snapshot/package → current/archive Markdown；白名单、受控路径、latest/stale、原子替换、failure isolation、dispose`、主要缺口=`multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理未覆盖`。在 Executed Validation 追加仅属于 Developer Markdown 的记录，包含该 SHA、执行日期、Darwin/Node/pnpm/DSH 环境、T1-T5 focused commands 与 `pnpm --dir plugin verify` 的实际结果。把 Not Covered 中合并列出 Developer Markdown 的现有 bullet 拆分，只移除已实现的 Developer Markdown，原样保留结构化 metrics、stress/长期资源泄漏和生产发布验证，并另列 multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理为 Developer Markdown Not Covered。不得修改文档顶端全局 baseline/date/environment、FR-11 row 或 G4 Browser 证据。确认无长期 RUNBOOK 引用后删除本文件。

验证：

```bash
git merge-base --is-ancestor '5c2574800f7a627a7a0ac824e53584b70ae8c8b6' HEAD
git rev-parse HEAD
test "$(sed -n '/^| FR-11 /p' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md | shasum -a 256 | awk '{print $1}')" = '3a07aa48491e2eca233ee1af45135c4f6e585a000356f15f05c6581f06c2042a'
test "$(sed -n '/^- Pass：G4 /p' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md | shasum -a 256 | awk '{print $1}')" = 'fc0b8fffcb0473bc51e79e2259db8d5068d8fe62d2df7890375f56abd11cdd2c'
rg -n 'DeveloperMeetingDocument|createDeveloperMarkdownService|developerMarkdownWorkspaceId' plugin/src plugin/tests plugin/README.md
rg -n 'Developer Markdown' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
rg -n 'RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION|RUNBOOK：Developer Markdown Projection' . --glob '!docs/30-designs/RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION.md'
pnpm --dir plugin exec prettier ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md --check
test "$(git diff --name-only | sort)" = "$(printf '%s\n' docs/30-designs/RUNBOOK-DEVELOPER-MARKDOWN-PROJECTION.md docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md | sort)"
git diff --check
```

PASS：ancestor/status/symbol/readiness/Prettier/diff 检查通过；Requirement Coverage 存在唯一且字段精确的 FR-15 row；Executed Validation 记录 literal SHA/date/environment/实际命令结果；Developer Markdown Not Covered 完整；两个 SHA-256 断言证明 FR-11 row 与全部 G4 Browser 证据逐字节不变；文档顶端全局 baseline/date/environment 不变；RUNBOOK 引用命令无输出并以 1 退出；diff 中 `CURRENT-IMPLEMENTATION-COVERAGE.md` 只有上述 Developer Markdown 内容发生变化。删除 RUNBOOK 后重复相对链接、Prettier 和 `git diff --check`，均通过才 Close。STOP：缺少 commit 授权、工作树非 clean、SHA 非后代、任一实现 symbol 缺失、出现长期引用、FR-11/G4 hash 不匹配、全局 metadata 或其他 owner 内容发生变化，或 Developer Markdown readiness 区域不可独立修改；不得预填 SHA、删除 RUNBOOK 或把未运行项写 Pass。失败恢复：若删除后检查失败，使用删除前保存的本 RUNBOOK 内容恢复该文件并 STOP；不得回滚其他文件。

## 9. 验证矩阵

| 风险                       | focused/full 证据 | 预期                                           |
| -------------------------- | ----------------- | ---------------------------------------------- |
| current 白名单/敏感字段    | T1                | current 排除 `checksum`，禁止 spread           |
| deterministic Markdown     | T1                | 固定排序/escaping/LF/final newline             |
| archive source             | T1/T2             | 只读 committed package，保留 optional checksum |
| latest/stale/isolation     | T2                | 最高 version，跨 Meeting 隔离                  |
| path/atomic failure        | T2                | containment；旧文件保留；temp 清理             |
| warning isolation          | T2/T4             | command/dispose 不失败，无敏感日志             |
| commit/replay/recovery     | T3                | 仅两个新 commit 发布点各一次                   |
| config/DSH workspace       | T4                | absent off、known canonical、unknown fail      |
| lifecycle                  | T2/T4             | dispose quiescent，无 timer/rejection/temp     |
| state/event/receipt/outbox | T3/T4             | 字节/计数保持既有语义                          |
| full package               | T5                | `pnpm --dir plugin verify` 退出 0              |
| literal evidence           | T6                | readiness 使用已提交 implementation SHA        |
| real DSH smoke             | Not Applicable    | 无新增真实 profile 可见 surface                |

## 10. Scope 双向追踪

| Scope                         | Requirement/Interface             | Production                    | Test        | Readiness |
| ----------------------------- | --------------------------------- | ----------------------------- | ----------- | --------- |
| map/render                    | FR-15.3-4；Data/Encoding          | projection developer-markdown | T1 spec     | T6        |
| latest/stale/path/atomic      | FR-15.5-6；Path/Coalescing/Atomic | service                       | T2 spec     | T6        |
| commit trigger                | FR-15.1-2；Invocation             | repository/registry           | T3 contract | T6        |
| config/wiring/failure/dispose | FR-15.1,7-8；Error/Compatibility  | config/index/runtime          | T4 specs    | T6        |

反向检查：T0 是 baseline gate；T1-T4 分别只服务上表一行；T5 只做完整验证；T6 只固定已提交证据并删除临时 RUNBOOK。没有步骤进入 Non-goals。

## 11. Readiness、失败恢复与删除条件

所有产品事实已在 requirement/interface/design；RUNBOOK 不保存长期唯一语义。任一步失败保留当前步骤和现场并 STOP，不回滚用户修改。C 按 C-first 顺序独占 `CURRENT-IMPLEMENTATION-COVERAGE.md` 的 Developer Markdown readiness 内容；B 独占 FR-11/G4，C 不得修改。只有验证矩阵全部 Pass/Not Applicable、readiness 记录真实 committed SHA/date/environment/result/Not Covered、FR-11/G4 逐字节不变、相对链接/Prettier/diff 通过且无长期引用时，才能删除 RUNBOOK。未 commit 前禁止更新 readiness 或删除 RUNBOOK。

## 12. Author/Audit 结论

结论：`Executable`。

最小化审计：新增两个 production 文件；一个纯 mapper/renderer 和一个由 Runtime 拥有的串行 worker。唯一 callback 覆盖两个现有 commit 发布点；不增加 durable 状态、通用抽象、并行机制、公开 surface 或依赖。所有字段、路径、version/time 来源、失败与 lifecycle 均由正式 Interface 唯一固定。
