# RUNBOOK: Local Single-User Meeting Control

## Status And Scope

- 状态：`Executable`
- 建立日期：2026-08-28
- 执行分支：`codex/feat/local-single-user-meeting-control`
- 起点提交：`f655001`
- 目标：完成「本地 Meeting list → 用户选择 → 完整 status → pause/resume → 全量 refetch」闭环。

本文是一次性实施材料。长期协议以 [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) 为准；完成、证据迁移和引用清理后必须删除本文。

## Executor Contract

执行者必须按 T2 至 T6 顺序执行；每步仅修改该步“允许修改”列出的文件，并在该步 PASS 后才进入下一步。任何 STOP 必须报告最后 PASS 步骤、触发条件、相关文件与 symbol、执行命令和完整输出；不得改动 Schema、错误语义、存储布局、身份边界或未列文件来绕过 STOP。本文只授权文档与本分支实现，不授权提交、推送、创建 PR 或合并。

`PASS` 仅表示对应步骤的规定命令退出码为 `0` 且断言成立；`STOP` 是终止本次执行的正常结果。执行者不得以“相近实现”替代本文指定的 symbol、route、Client slot 或测试入口。

## Current Breakpoints

| 断点 | 当前证据 | 本 RUNBOOK 的处理 |
| --- | --- | --- |
| Web 与 Client 均未实现 | `plugin/src/http/index.ts` 为 `export {}`；`plugin/src/client/index.tsx` 为 no-op。 | T4 注册 loopback HTTP transport，T5 注册唯一 Client view。 |
| Runtime 只提供 Agent caller 入口 | `plugin/src/tools/meeting-runtime.ts#createCreateStatusRuntime` 的 `getStatus`、`pause`、`resume` 都接收 `MeetingToolCaller`。 | T2/T3 新增不伪造 Agent caller 的 local Web Runtime 入口。 |
| 当前持久化布局尚未迁移到目标目录 | 当前 `repositoryPath()`/`rehydrate()` 使用 Architecture 允许的 `<dataRoot>/<encodedTeamId>/<encodedMeetingId>.sqlite` 过渡布局。 | 本分支不得修改 discovery 或 storage layout。所有 Web 操作复用当前 Runtime locator；目标目录迁移继续作为独立 readiness 缺口。 |

## Scope And Non-goals

Scope：共享 list DTO/schema 与 `local_host` projection；Runtime 的本地 list/status/pause/resume 入口和恢复隔离；单一 loopback HTTP prefix；conversation view 中的 list-first panel；真实 DSH profile 的 HTTP 与浏览器闭环证据。交付物只包括 T1–T6 允许的代码、测试、smoke script 和 readiness 更新。

Fixed boundaries：

- 只在 `webServer.host === "127.0.0.1"` 注册一个 `prefix` route：`/api/convivium/meetings`。`0.0.0.0` 不注册，不能由 `Origin`、来源 IP、转发头、Cookie 或 token 替代。
- Web 不绑定用户、Team authority 或 Agent Session。`local_host` / `loopback-web` 只是固定 Host 标记，不是用户身份；不得伪造 Captain caller。
- list 是唯一初始选择来源。Client 的 conversation Session scope 只提供 UI 挂载位置，不得参与 list、选择、请求或授权。

Non-goals：

- 不改 SQLite schema/migration、Session ownership、outbox、Mail、创建 UI、筛选/pagination、URL/query 导航或远程/多用户能力。
- 不改变 `repositoryPath()`、data-root 目录名、现有 `.sqlite` 发现逻辑或 Archive/Markdown 路径；HTTP 层不得自行扫描文件系统。

## Formal Sources And Fixed Shapes

- [Architecture §Confirmed Baseline](../00-governance/ARCHITECTURE.md)
- [Requirements FR-9、FR-11](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Protocol §Pause and resume invocation、§Authorized status projection、§Error And Permission Semantics](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [SQLite Repository Interface §Session ownership、§Error And Permission Semantics](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)
- [Implementation Design §Module map](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [Meeting Orchestration Design §17.1、§17.4、§19.5](./MEETING-ORCHESTRATION-DESIGN.md)
- 锁定 DSH Web API：`plugin/node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts`；`WebServer.register()` 返回 disposer，route handler 是 raw `node:http` handler。

必须实现并只实现以下 route：

| Method and path | 成功 body |
| --- | --- |
| `GET /api/convivium/meetings` | `LocalMeetingListResponseV1` |
| `GET /api/convivium/meetings/:meetingId` | `ProtocolSuccessV1<MeetingStatusResultV1>` |
| `POST /api/convivium/meetings/:meetingId/pause` | `ProtocolSuccessV1<MeetingControlResultV1>` |
| `POST /api/convivium/meetings/:meetingId/resume` | `ProtocolSuccessV1<MeetingControlResultV1>` |

list DTO 的 canonical owner 是 `plugin/src/protocol/types.ts`，所有字段 required、不可为 null：

```ts
interface LocalMeetingListItemV1 {
    meetingId: string;
    teamId: string;
    topic: string;
    status: MeetingStatusResultV1["status"];
    meetingVersion: number;
    updatedAt: number;
}
interface LocalMeetingListResultV1 {
    meetings: readonly LocalMeetingListItemV1[];
}
interface LocalMeetingListResponseV1 {
    protocolVersion: 1;
    ok: true;
    result: LocalMeetingListResultV1;
}
```

Runtime 是 producer，HTTP 与 Client 是 consumer；Client 不提交 list DTO。逐字段来源固定为 `MeetingSnapshot.meetingId/teamId/version/updatedAt` 与 `MeetingState.topic/status`，其中 `version -> meetingVersion`。response 刻意不使用 `ProtocolSuccessV1`：后者必须携带单一 Meeting metadata。items 按 `updatedAt DESC, meetingId ASC` 排序。

三个单 Meeting request 均由 Client 产生且所有字段 required：status 为 `{ protocolVersion: 1; meetingId: string }`；pause 为 `{ protocolVersion: 1; meetingId: string; expectedMeetingVersion: number; requestId: string; reason: string }`；resume 为 `{ protocolVersion: 1; meetingId: string; expectedMeetingVersion: number; requestId: string }`。`meetingId` 只来自所选 list item，`expectedMeetingVersion` 只来自最近一次完整 status response，`requestId` 由每个新写动作调用一次 `crypto.randomUUID()` 产生，pause `reason` 来自本地用户输入。HTTP 只校验并转交；Runtime/SQLite transaction 是 version、receipt、event 和 outbox 的 owner。

固定调用链为：`ConviviumMeetingPanel -> prefix HTTP handler -> input Schema -> LocalMeetingWebRuntime -> rehydrate/current repository -> projectMeetingStatus 或 transitionMeeting -> Protocol response -> Client 全量替换缓存`。list 在 Runtime 从 snapshot 映射轻量 DTO，不经过完整 status projection。

所有未列 path/method（包括 trailing slash）返回 `404` 无 body。支持 route 带 query、非法 percent encoding，以及 POST 缺失/错误 JSON media type、超过 `16_384` bytes、JSON 解析失败、含未定义字段、path/body Meeting ID 不同或 Schema 失败，返回固定 `400 INVALID_ARGUMENT` envelope：message 为 `Invalid meeting request.`、`retryable: false`，且不含 optional metadata。`VERSION_CONFLICT`/`IDEMPOTENCY_CONFLICT` 返回 `409` Runtime envelope；`MEETING_NOT_FOUND` 返回 `404` Runtime envelope；其他领域 envelope 返回 `400`。data root `ENOENT` 对 list 表示空数组、对单 Meeting 表示 not found；可读取的 `creating|creation_failed` repository 关闭并跳过/视为 not found；其他 `ready` Meeting repository 恢复失败或所选 Meeting 冷恢复失败返回 `503`、`Retry-After: 1`、无 body；未知异常为 `500`、无 body。所有成功 JSON 与错误 envelope 设置 `content-type: application/json; charset=utf-8`；成功状态为 `200`。

## Invariants

- UI 不直接访问 SQLite、Session、Agent capability 或 Session storage。
- Web status、pause、resume 必须走 Runtime；Agent tool 路径继续按真实 caller 做权限检查。
- 两个写入口共享既有 `transitionMeeting`、`expectedMeetingVersion`、`requestId`、幂等、receipt 和 outbox 语义；不得建立第二套状态机。
- Web pause 在 MeetingState 写入 `{ kind: "local_host", actorId: "loopback-web" }`；Captain tool 仍写 `{ kind: "captain", actorId: caller.sessionId }`。
- Client 仅可用完整成功 list/status 整体替换各自缓存。list 失败只把 list 标记为缓存，不降低已选 Meeting 的独立 detail freshness；detail/write 失败保留 projection 作只读参考、标记详情缓存并禁用写操作，直到该 Meeting 的完整 detail 再次成功。

## Mechanical Execution Steps

### T2：限定 `local_host` 为 pause actor，而非 caller

前置状态：共享 list DTO/Schema 与 `local_host` pause projection Schema 已实现并通过 focused suite；`LocalMeetingListResponseSchema` 已由 `plugin/src/protocol/index.ts` export。

允许修改：`plugin/src/domain/model.ts`、`plugin/src/projection/status.ts`、`plugin/src/tools/meeting-runtime.ts`、`plugin/tests/unit/domain/transitions/meeting.spec.ts`、`plugin/tests/contract/status-projection.spec.ts`。

禁止修改：`plugin/src/dsh/caller-resolver.ts`、`plugin/src/tools/register-tools.ts`、`MeetingToolCaller`、`resolveMeetingCaller()`、repository validator、SQLite schema/migration 与 HTTP/Client 文件。

执行：

1. 将 `PauseActor.kind` 扩为 `"user" | "captain" | "local_host"`；不要改变 `actorId`、存储结构或 migration。
2. 使 `MeetingProjectionCaller` 可接受只读 `{ kind: "local_host"; sessionId: "loopback-web" }`，仅用于投影；不得把它加入 `MeetingToolCaller` 或 `resolveMeetingCaller()`。
3. 在 `meeting-runtime.ts` 增加不 export 的 `MeetingControlSource = { kind: "captain"; sessionId: string } | { kind: "local_host" }`，并把私有签名固定为 `transitionMeetingStatus(input, target, source)`；不得把该 union 与 `MeetingToolCaller` 合并。Captain `pause/resume` 传 `{ kind: "captain", sessionId: caller.sessionId }`，函数内部派生既有 `session:${sessionId}` / `captain:${sessionId}` authorization、captain pause actor 和默认 reason `captain ${target} meeting`。T3 的 local Web 调用传 `{ kind: "local_host" }`，函数内部派生固定 authorization `{ callerBinding: "local-host:loopback-web", capabilityId: "local-host:loopback-web" }`、固定 pause actor `{ kind: "local_host", actorId: "loopback-web" }` 和默认 reason `local host ${target} meeting`。这些只是 command/actor 审计标记，不是用户或 Team authority；resume 不写新的 pause actor。
4. 增加断言：Captain pause 仍保留 captain actor；以 local_host actor 进入既有 transition 的状态投影保留该 actor；resume 不产生新的 pause actor。实际 local Web 写入口在 T3 验证。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/domain/transitions/meeting.spec.ts tests/contract/status-projection.spec.ts
pnpm --dir plugin typecheck:host
if rg -n 'local_host' plugin/src/dsh plugin/src/tools/register-tools.ts; then
  exit 1
else
  status=$?
  test "$status" -eq 1
fi
```

PASS：三段命令退出码均为 `0` 且 `rg` 无输出；`rg` 错误或任何 match 均为 STOP。

STOP：修改要求 SQLite migration、将 local host 伪装成 Captain，或扩大 Agent tool caller union。停止并报告 T2。

恢复：撤销 T2 允许文件的改动；不得删除已有事件。

### T3：实现按用途隔离恢复的 Runtime Web 入口与 list

前置状态：T2 PASS；当前 `repositoryPath()` 与 `rehydrate()` 未被改动为不同布局。

允许修改：`plugin/src/tools/meeting-runtime.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`。

禁止修改：`repositoryPath()` 的路径规则、`openMeetingRepository()`、repository/migration 文件、Archive/Markdown 路径、Agent tool caller 路径与 HTTP/Client 文件。

执行：

1. 在 `meeting-runtime.ts` export `LocalMeetingWebRuntime`，并让 `MeetingRuntimeWithCallerLookup` 交叉该接口。接口只含：

```ts
listLocalMeetings(): Promise<LocalMeetingListResponseV1>;
getLocalMeetingStatus(input: MeetingStatusInputV1): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
pauseLocalMeeting(input: PauseMeetingInputV1): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
resumeLocalMeeting(input: ResumeMeetingInputV1): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
```

2. export `LocalMeetingRecoveryUnavailableError extends Error`，只作为 Runtime-to-HTTP 的恢复失败分类；不要扩展协议 code。私有恢复签名固定为 `rehydrate(mode: RehydrateMode = { kind: "agent_best_effort" })`，其中 `RehydrateMode` 是 `{ kind: "agent_best_effort" } | { kind: "local_list" } | { kind: "local_meeting"; meetingId: string }`；所有既有 Agent 调用保持无参数。
3. 三种模式继续使用当前物理 discovery，且只能在既有 `rehydrate()` 内实现：
   - `agent_best_effort` 保持当前行为：data root、team directory、无关或不完整数据库失败均被忽略。
   - `local_list` 必须枚举全部当前可发现 `.sqlite`：尚不在 `meetings` map 的逐个 open/recover，已在 map 的复用其 repository 并重新 read/recover；根 data root 的 `ENOENT` 返回空发现结果。可成功 recover 且 bootstrap 为 `creating|creation_failed` 的 repository 关闭并跳过；其他 data root/team directory 读取、URI decode、bootstrap 读取失败，或 bootstrap `ready` 但 snapshot/parent ownership 缺失及 archive recovery 失败，都抛 `LocalMeetingRecoveryUnavailableError`，不得返回部分 list。
   - `local_meeting` 若目标已在 `meetings` map 中则只处理该目标；否则扫描当前目录结构定位目标 `.sqlite`，只 open/recover 该目标。根 data root 的 `ENOENT` 表示未发现目标；目标可 recover 但 bootstrap 为 `creating|creation_failed` 时关闭并视为未发现。其他目录读取、bootstrap 读取失败，或目标已 `ready` 但 snapshot/parent ownership 缺失及 archive recovery 失败，抛 `LocalMeetingRecoveryUnavailableError`。其他 `.sqlite` 不得被打开，其损坏不得阻塞目标。未发现目标不是恢复错误，返回既有 `MEETING_NOT_FOUND` envelope。local mode 新 open 的 repository 只有完成 recover、ready checks 和 `recoverArchive()` 后才加入 `meetings`；此前抛出或跳过必须 close。已在 map 中的 repository 仍重新执行所需 read/archive recovery，失败时保留现有 map ownership 但向 HTTP 抛 typed error；`agent_best_effort` 的既有 set/catch 顺序不得改变。
4. `listLocalMeetings()` 使用 `local_list`，只从 snapshot state 与 metadata 组装六个允许字段；按正式顺序构造 response，再用 `LocalMeetingListResponseSchema` 校验并返回 validator 的 typed result。mapping 或校验失败包装为 typed recovery error。不得调用 `projectMeetingStatus()`，不得泄漏完整状态。
5. 其他三个 local 方法使用 `local_meeting`；status 使用固定 projection caller，并用 `MeetingStatusResultSchema` 校验 projection 后构造 success，snapshot read、projection 或校验失败均抛 typed recovery error。pause/resume 使用 T2 的固定 Host command marker，并复用同一 `transitionMeetingStatus()`。在当前文件的既有 imports 中从 `../domain/index.js` 增加 `DomainError`，并从 `../repository/index.js` 直接 import `RepositoryError`，不得为转发 export 修改 `runtime/index.ts`。local transition 的 catch 必须按唯一表处理：`VERSION_CONFLICT|IDEMPOTENCY_CONFLICT` 保持既有 envelope；`MEETING_NOT_FOUND|SQLITE_BUSY|SCHEMA_VERSION_UNSUPPORTED|CORRUPT_DATABASE|CLOSED` 包装为 typed recovery error；`DomainError` 保持既有领域 envelope；其他 `RepositoryError`（包括 `CONSTRAINT_VIOLATION|INVALID_INPUT|INVALID_STATE|LEASE_LOST|OUTBOX_NOT_FOUND|MEETING_EXISTS`）和其他异常原样抛给 HTTP 映射 `500`。冷恢复后缺少 live Captain parent 的 local resume 也抛 typed recovery error。Agent 路径的既有 catch/mapping 不变。
6. 在两个指定 suite 中测试：排序与字段白名单、active/terminal/archiving/archived、`creating|creation_failed` 被关闭并跳过、坏的 `ready` repository 使 list 整体 reject、同一坏 repository 不阻塞另一已知健康 Meeting 的 status/pause/resume、目标损坏 reject、未知 Meeting、local pause actor、过期 version、幂等 replay、resume 时 Captain parent 不可用，以及 unexpected repository error 不被包装为 recovery unavailable。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-runtime.spec.ts tests/contract/meeting-runtime.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两条命令退出码均为 `0`；测试逐项断言 list item 的键集合恰为六个正式字段，list 不部分成功，且无关坏库不阻塞已选健康 Meeting。

STOP：为实现 list 而扫描 SQLite 以外路径、缓存旧 snapshot 当实时结果、或需要新增持久化字段。报告 T3。

恢复：撤销三个允许文件中的 T3 改动，关闭本步骤新打开而未加入 `meetings` 的 repository。

### T4：实现唯一 loopback HTTP transport

前置状态：T3 PASS；`LocalMeetingWebRuntime` 和三个 list Schema 均已可由 protocol/runtime 入口导入。

允许修改：`plugin/src/http/index.ts`、`plugin/src/index.ts`、`plugin/tests/contract/http-boundary.spec.ts`、`plugin/tests/unit/index-inject.spec.ts`。

禁止修改：`plugin/src/tools/register-tools.ts`、Agent caller 解析、data-root discovery、Client 文件、SQLite schema/migration 与 WebServer host 配置。

执行：

1. `http/index.ts` 必须从 `@deepseek-ai/dsh-host-webserver` import `WebServer` type，并直接从 `../tools/meeting-runtime.js` import `LocalMeetingRecoveryUnavailableError` 与 `LocalMeetingWebRuntime` type；不得为转发 export 修改 `plugin/src/tools/index.ts`。然后 export：

```ts
registerLocalMeetingHttpRoutes(
    webServer: Pick<WebServer, "register">,
    runtime: LocalMeetingWebRuntime
): () => void;
```

只注册 `{ kind: "prefix", path: "/api/convivium/meetings", handler }`。所有 JSON 编码、固定 invalid-argument envelope 和错误映射保持为该文件内的局部 helper；不要新增 router、middleware 或 transport abstraction。
2. handler 直接解析 raw `req.url ?? ""`，不得用会规范化 dot segment 的 `new URL()`：以第一个 `?` 分成 `rawPath` 和 `hasQuery`，先调用 `decodeURI(rawPath)` 仅验证 percent encoding，但继续用未规范化的 `rawPath` 做 route match；验证失败返回固定 `400 INVALID_ARGUMENT`。随后按 raw pathname shape 和 method 分类，trailing slash、额外 segment 与未列 method 返回 `404` 无 body；仅对已支持组合检查 `hasQuery`，包括结尾裸 `?` 在内都返回固定 `400 INVALID_ARGUMENT`。受支持动态 segment 最后用 `decodeURIComponent()` 解码，失败返回同一固定错误。
3. GET 不解析或缓存 body；详情 GET 以 decoded path ID 组装并用 `MeetingStatusInputSchema` 校验。POST 要求 `content-type` 的 media type（分号前 trim 并转小写）恰为 `application/json`；使用 `for await (const chunk of req)` 累计实际 byte length，超过 `16_384` 后停止缓存并调用 `req.resume()` 排空余下内容，再返回固定 `400 INVALID_ARGUMENT`。JSON parse 后先用该文件内局部 `assertExactBodyKeys()` 比较排序后的 key：pause 恰为 `protocolVersion | meetingId | expectedMeetingVersion | requestId | reason`，resume 恰为前四项；再调用对应 `PauseMeetingInputSchema`/`ResumeMeetingInputSchema` 并检查 path/body `meetingId`。任一步失败走同一固定错误。不要读取任何身份 header/cookie；额外用户、Team、Agent/Captain Session 或 authority 字段必须在调用 Runtime 前被拒绝。固定 invalid envelope 恰为 `{ protocolVersion: 1, ok: false, code: "INVALID_ARGUMENT", message: "Invalid meeting request.", retryable: false }`，不含任何 optional metadata。
4. list output 通过 `LocalMeetingListResponseSchema`；status success 调用 `validateProtocolSuccessEnvelope(MeetingStatusResultSchema, value)`；pause/resume success 调用 `validateProtocolSuccessEnvelope(MeetingControlResultSchema, value)`；Runtime error 通过 `validateProtocolError()` 后才编码。Runtime success 写 `200` JSON；Runtime `VERSION_CONFLICT`/`IDEMPOTENCY_CONFLICT` 写 `409` JSON，`MEETING_NOT_FOUND` 写 `404` JSON，其他 Runtime `ProtocolErrorV1` 写 `400` JSON。所有 JSON response 设置 `content-type: application/json; charset=utf-8`。捕获 `LocalMeetingRecoveryUnavailableError` 时写 `503`、`Retry-After: 1`、无 body；response validation 或其他未知异常写 `500` 无 body。无 body response 不设置 JSON content type。
5. `index.ts` 在 Runtime 创建和 lifecycle 注册后，且仅 `ctx.webServer.host === "127.0.0.1"` 时调用该 register 函数，并将返回 disposer 加入 lifecycle。不要注册 exact 子 route，不要在 `0.0.0.0` 抛出或注册。
6. 测试 mock `webServer.register`：loopback 恰注册一个 prefix 并在 dispose 时移除；all-interface 不注册。直接调用 handler 覆盖四条成功路由、trailing slash/含额外 dot segment/未知 method 的空 `404`、普通及裸 `?` query/非法 percent encoding/media type/body limit/parse/extra-key/schema/path mismatch 的固定 `400`、两个 `409`、领域 `404`/`400`、目标恢复 `503`（含 header 且无 body）、未知 `500`，并断言 JSON content type、无 body response 不含 JSON header，且任何 identity/authority extra field 都不会调用 Runtime。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/http-boundary.spec.ts tests/unit/index-inject.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：两条命令退出码均为 `0`；测试断言完整 transport decision table、loopback 只有一个 prefix registration，且 all-interface 没有 registration。

STOP：DSH Web 类型与已锁版本不支持 prefix disposer，或实现需要第二个 route/任何身份输入。报告 T4 并停止。

恢复：从 lifecycle 移除本步骤注册并撤销四个允许文件的改动。

### T5：注册最小 Client panel

前置状态：T4 PASS；loopback route 已由 host entry 注册，且 `0.0.0.0` 情况未注册。

允许修改：`plugin/src/client/index.tsx`、`plugin/src/client/meeting-panel.tsx`、`plugin/tests/client/client-entry.client.spec.ts`。

禁止修改：`plugin/src/http/**`、`plugin/src/tools/**`、repository/DSH Session 文件、Client inject 列表、Web path/协议类型、URL/query 选择和手工 Meeting ID 输入。

执行：

1. 新建 `meeting-panel.tsx`，export `ConviviumMeetingPanel`。它只通过相对 path `fetch("/api/convivium/meetings")` 和三条正式 Meeting path 访问 HTTP；动态 `meetingId` segment 必须由 `encodeURIComponent()` 产生。Client 对 list 使用 `LocalMeetingListResponseSchema`，对单 Meeting success 使用 `validateProtocolSuccessEnvelope()` 加对应 result Schema，对 error 使用 `validateProtocolError()`；只有 Schema 成功后才允许把既有宽泛 Schema return cast 为对应公开 DTO，response JSON 校验失败按传输失败处理。不得导入 host/runtime/repository/dsh Session 模块，不新增样式系统或组件依赖。
2. `index.tsx` 的 `apply(ctx)` 必须唯一调用 `ctx.slots.inject("conversation.view", () => ctx.slots.register({ name: "conversation.view", id: "convivium-meetings", label: "Meetings", order: 100 }, ConviviumMeetingPanel))`。不得直接调用 `ctx.slots.register`，也不得另行 `ctx.effect` 管理该 disposer；锁定 DSH slot registry 已在 `inject()` 中管理 contribution 生命周期。组件不读取 `ConvViewProps.sessionId`。
3. UI 首次加载和用户点击 `aria-label="Reload meetings"` 时只读取 list，不自动选择第一项；选择仅来自已渲染 item，选择后读取完整 status。成功 list reload 若仍含 selected ID 则保留当前选择/详情，若不含则中止进行中的 detail/write 并清空选择和详情；reload 本身不隐式读取 status。成功 write 后立即读取 status；固定 `5_000` ms polling 读取当前已选 status。`window` focus 在已有选择时读取该 status、尚无选择时 reload list。list 与 detail/write 分别维护自己的 `AbortController` 和递增 request generation；write pending 时 polling/focus 不发起 detail 请求，避免中止 POST，write 结束后的规定 refetch 负责刷新。切换选择、unmount 或同类较新请求开始后的过期响应必须取消/忽略，不能覆盖新选择。
4. list 为空时显示空态；选择成功后显示 topic、当前 status，并以 `<pre aria-label="Meeting status details">` 渲染验证后的完整 `MeetingStatusResultV1`（`JSON.stringify(result, null, 2)`），不得只摘取摘要代替完整 projection。paused 时另行可见展示 `pauseControl` 的 reason、actor kind/actorId 和 pausedAt。list 失败保留上一份 list 并标记列表缓存，但不改变已选 detail 的 freshness；list success 只清除列表缓存标记。detail 的传输失败或 ProtocolError 保留上一份 projection、标记详情缓存并禁用写操作；ProtocolError 只显示其安全 message，下一次完整 detail success 才清除详情缓存标记并恢复按状态允许的控制。pause 只在 `created|running|waiting` 时显示 reason 输入和按钮；resume 只在 `paused` 时显示并启用；terminal/archiving/archived 不显示可用控制。write pending 时所有写按钮 disabled。请求 ID 每次新写请求用 `crypto.randomUUID()`；write 返回成功或任一已校验 ProtocolError 后都立即 refetch，只有新的完整 status 成功替换缓存后才允许用户再次点击并生成新 request ID。不得自动重发同一 POST；write 传输失败则按缓存失败规则等待后续 poll/focus 成功。
5. 保持最小、稳定的可访问探针：panel root 为 `data-testid="convivium-meeting-panel"` 且 `aria-label="Convivium meetings"`，reload button 为 `aria-label="Reload meetings"`，list 为 `aria-label="Meetings"`，item button 的可访问名称包含 topic 并带 `data-meeting-id`，当前状态带 `data-meeting-status`，pause reason input 为 `aria-label="Pause reason"`，pause/resume button 分别为 `aria-label="Pause meeting"` / `aria-label="Resume meeting"`；list/detail 各自在使用缓存时于对应 wrapper 设置 `data-cached="true"`。这些属性同时用于 T5 test 与 T6 真实浏览器验证，不增加测试专用分支。
6. Client test mock fetch/slots，验证唯一注册、list-first、不使用 Session ID、选择后完整 projection 文本与 pause metadata、状态限定控制、write pending 时禁写且 poll/focus 不打断、write success/ProtocolError 后 refetch 且不自动重发 POST、传输失败禁用、上述探针和 unmount cleanup。

验证：

```bash
pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts
pnpm --dir plugin typecheck:client
```

PASS：两条命令退出码均为 `0`；test mock 观察到 `slots.inject("conversation.view", ...)`，且未读取或传递 session ID。

STOP：现有 client slot API 不支持上述 list entry/disposer，或必须用当前 Session 推断 Meeting。报告 T5；不要改为手工输入或 URL 选择。

恢复：撤销三个允许文件；取消所有 timer、focus listener 与进行中的 fetch。

### T6：端到端证据与文档收口

前置状态：T2–T5 全部 PASS；`pnpm --dir plugin build` 成功。

允许修改：`plugin/scripts/smoke-profile.mjs`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、本 RUNBOOK；验证可机械重建 ignored `plugin/lib/**` 并创建/清理脚本自己的 OS temp root。

禁止修改：`plugin/src/**`、package manifest、DSH profile 配置、正式 requirements/interfaces/designs 与任何已生成 Meeting 数据。

执行：

1. 仅在 `smoke-profile.mjs#writeProbePackage()` 生成的 probe 中扩展 HTTP 验证：把 probe `inject` 增加 `webServer`，以字符串拼接 `const baseUrl = "http://127.0.0.1:" + ctx.webServer.port`，不得在外层 `String.raw` template 中嵌套模板插值表达式。创建 Meeting 后依次调用 list、status、pause、pause 后 status、resume、resume 后 status；pause body 固定为 `{ protocolVersion: 1, meetingId, expectedMeetingVersion: status.meetingVersion, requestId: "smoke-http-pause-1", reason: "Verify local host control" }`，resume body 使用 paused status 的 version 与 request ID `smoke-http-resume-1`。POST 除 `content-type: application/json` 外不设置其他 header，也不设置 cookie 或 Captain identity。每次 response 都断言 HTTP `200` 与 JSON content type；另外断言 list 含目标、pause projection actor 为 `local_host/loopback-web`、最终恢复 `running`，并把 `httpRouteUsed: true`、`captainSessionId: "convivium-smoke-captain"` 与 `webUrl: baseUrl` 写入结果。`0.0.0.0` 不注册的验证保留在 T4 mock suite，不修改 smoke profile host。
2. 给外层 smoke script 增加唯一可选的 `CONVIVIUM_SMOKE_BROWSER_MODE=1`：自动 probe 成功并打印 `CONVIVIUM_SMOKE_BROWSER_URL=http://127.0.0.1:<port>` 与 `CONVIVIUM_SMOKE_TEMP_ROOT=<absolute tempRoot>` 后保持 Host 运行，监听一次 `SIGINT`/`SIGTERM`；收到信号后仍进入现有 `finally -> restore()`，确认 temp root 不存在后打印 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok` 并正常退出。默认模式行为与输出不变。不要新增浏览器依赖、server 或 profile 文件。
3. 运行 browser lane：在可保持运行的终端执行下列 browser-mode 命令；用 in-app Browser 打开打印 URL，进入任一 conversation（优先选择仍可见的 `convivium-smoke-captain`；Meeting 选择不得依赖该 Session），确认 `Convivium meetings` panel 和 topic `Runtime smoke` 的 list item 出现；选择该 Meeting，观察 `data-meeting-status="running"`；输入 reason 后点击 `Pause meeting` 并观察 `paused`，再点击 `Resume meeting` 并观察 `running`。最后向终端发送 Ctrl-C，确认进程退出码为 `0` 且打印 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。若真实 DSH Web 无法显示 slot、交互失败或 Browser 不可用，T6 STOP，不得以组件测试代替。
4. 精确更新 `CURRENT-IMPLEMENTATION-COVERAGE.md`：Scope 的代码基线改为本分支、起点 `f655001` 与“当前未提交 working tree”（本文不授权虚构 commit）；Validated Contract 增加 loopback list/status/pause/resume 与 Client slot；Requirement Coverage 的 FR-9/FR-11 写入实际实现并保留 cold resume、end/reassign、metrics 等真实剩余边界；Executed Validation 追加本次各命令的实际计数/结果与 browser-mode 可见交互；Not Covered 删除“route/client/browser 未实现”项但保留存储目标布局、远程/多用户、cold restart/rebind 和其他既有缺口；Closure 只声明本地单用户会议控制闭环已覆盖，不声明完整会议产品或发布就绪。只有上述浏览器步骤全部完成才可写真实 Client 闭环 Covered；任何命令未运行必须明确保留为 Not Covered。
5. 运行完整验证。

验证：

```bash
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile
CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
git diff --check
node - <<'NODE'
const { readdir, readFile } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');
const root = process.cwd();
async function walk(dir) { const xs=[]; for (const e of await readdir(dir,{withFileTypes:true})) { const p=resolve(dir,e.name); if(e.isDirectory()) xs.push(...await walk(p)); else if(e.name.endsWith('.md')) xs.push(p); } return xs; }
(async()=>{const bad=[]; for(const f of await walk(resolve(root,'docs'))){const s=await readFile(f,'utf8'); for(const m of s.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)){if(/^(?:https?:|mailto:)/.test(m[1])) continue; const t=resolve(dirname(f),m[1]); try{await readFile(t)}catch{bad.push(`${f}: ${m[1]}`)}}} if(bad.length){console.error(bad.join('\n'));process.exit(1)} console.log('PASS markdown relative links')})()
NODE
```

PASS：默认 smoke 自动 HTTP probe 成功且报告 `httpRouteUsed: true`；browser-mode smoke 的可见 panel、list 选择、pause/resume 状态变化和清理均成功；其余验证命令退出码为 `0`；readiness 只记录实际完成的证据。

STOP：任一命令失败、smoke 无法建立实际 loopback 或发现 runtime/web route 在 `0.0.0.0` 暴露。报告 T6、完整输出和最后成功步骤；不要标记完成。

恢复：仅回退本步骤脚本/readiness/RUNBOOK 修改；不删除已生成的 Meeting 数据，除非脚本使用明确的临时目录且其清理已验证。

## Validation Matrix

| 风险 | focused evidence | PASS 判据 |
| --- | --- | --- |
| actor / caller 隔离 | T2 transition、status projection suite | `local_host` 不是 `MeetingToolCaller`；Captain actor 不变。 |
| 恢复隔离、terminal、重放与冲突 | T3 runtime/contract suites | 空 data root 返回空 list；未 ready bootstrap 被跳过；坏的 ready repository 不返回部分 list且不阻塞已选健康 Meeting；stale、replay、conflict、terminal guard 保持既有结果。 |
| loopback transport 与错误 body | T4 HTTP/inject suites | 只注册一个 prefix；`0.0.0.0` 无 route；404/400/409/503/500 与正式协议一致。 |
| Client 生命周期 | T5 client suite | list-first、选择后的全量读取、write 后 refetch、pending 互斥、poll/focus、失败禁写和 cleanup 均有断言。 |
| 真实 DSH Web 闭环 | T6 默认及 browser-mode `smoke:profile` | 实际 loopback HTTP 通过 list/status/pause/resume；真实 Client slot 可选择并控制 Meeting；不使用 Captain identity。 |

`Not Applicable`：数组部分非法原子性、transaction rollback、receipt/outbox 与 Archive 的底层实现不在本分支改变；T3/T4 必须通过既有 Runtime 行为的 replay/conflict/terminal focused tests 证明未回归，不能另建持久化路径。

## Completion And Deletion

所有 T2–T6 PASS 后，将实际覆盖迁移到 `CURRENT-IMPLEMENTATION-COVERAGE.md`，按 TODO Rules 确认本闭环无未完成 TODO，再删除本 RUNBOOK。删除后使用 `rg -n 'RUNBOOK-LOCAL-SINGLE-USER-MEETING-CONTROL|Local Single-User Meeting Control' .` 清除仅指向本文的残留引用，并重跑相对链接检查与 `git diff --check`；任一检查失败时恢复本文并 STOP。在用户单独要求前，不提交、推送、创建 PR 或合并。

## Author Audit

结论：`Executable`。

审计日期：2026-08-28。

审计修复：已消除「Web 写操作必须有 Agent caller」与本地无身份边界的冲突，固定了 `local_host` actor；list 改用不伪造单 Meeting metadata 的独立 response；当前物理布局已在正式设计中标为过渡基线，本分支只复用 locator；`creating|creation_failed` 与损坏的 ready Meeting 已区分；所选 Meeting 的恢复不再受无关坏库阻塞；Client 固定为 DSH `slots.inject()`，以已校验完整 projection 形成最小 UI；已完成的基线步骤已删除，所有 focused Vitest 命令固定通过 pnpm `exec` 调用本地二进制；每步已有前置条件、允许/禁止文件、精确命令、PASS/STOP 和恢复要求。实现时若触发任一 STOP，必须停止，不得自行扩大范围。

Authoring validation：

- `git diff --check`：PASS。
- `docs/**/*.md` 相对链接目标检查：PASS。
- `pnpm --dir plugin exec vitest --version`：PASS，确认调用本地 Vitest `3.2.7`。
- T2–T6 引用的当前 production/test/script 路径：PASS；唯一计划新增路径为 `plugin/src/client/meeting-panel.tsx`。
- T2–T6 的九项固定结构（前置、允许、禁止、执行、验证、PASS、STOP、恢复）：PASS。
- T2–T6 的 focused tests、build、smoke 与 browser lane：Not Run；这些是 RUNBOOK 执行门禁，不是本次文档修复证据。
