# RUNBOOK: Local Single-User Meeting Control

## Status And Scope

- 状态：`Executable`
- 建立日期：2026-08-28
- 执行分支：`codex/feat/local-single-user-meeting-control`
- 起点提交：`f655001`
- 目标：完成「本地 Meeting list → 用户选择 → 完整 status → pause/resume → 全量 refetch」闭环。

本文是一次性实施材料。长期协议以 [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) 为准；完成、证据迁移和引用清理后必须删除本文。

## Executor Contract

执行者只执行剩余的 T6；仅修改该步“允许修改”列出的文件。任何 STOP 必须报告最后 PASS 步骤、触发条件、相关文件与 symbol、执行命令和完整输出；不得改动 Schema、错误语义、存储布局、身份边界或未列文件来绕过 STOP。按用户授权在步骤完成后小步提交；不推送、创建 PR 或合并。

`PASS` 仅表示对应步骤的规定命令退出码为 `0` 且断言成立；`STOP` 是终止本次执行的正常结果。执行者不得以“相近实现”替代本文指定的 symbol、route、Client slot 或测试入口。

## Current Breakpoints

| 断点 | 当前证据 | 本 RUNBOOK 的处理 |
| --- | --- | --- |
| 当前持久化布局尚未迁移到目标目录 | 当前 `repositoryPath()`/`rehydrate()` 使用 Architecture 允许的 `<dataRoot>/<encodedTeamId>/<encodedMeetingId>.sqlite` 过渡布局。 | 本分支不得修改 discovery 或 storage layout。所有 Web 操作复用当前 Runtime locator；目标目录迁移继续作为独立 readiness 缺口。 |

## Scope And Non-goals

Scope：剩余工作只为真实 DSH profile 的 HTTP 与浏览器闭环证据、smoke script 和 readiness 更新。

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

### T6：端到端证据与文档收口

前置状态：T5 PASS；`pnpm --dir plugin build` 成功。

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
| 真实 DSH Web 闭环 | T6 默认及 browser-mode `smoke:profile` | 实际 loopback HTTP 通过 list/status/pause/resume；真实 Client slot 可选择并控制 Meeting；不使用 Captain identity。 |

`Not Applicable`：数组部分非法原子性、transaction rollback、receipt/outbox 与 Archive 的底层实现不在本分支改变；T3/T4 必须通过既有 Runtime 行为的 replay/conflict/terminal focused tests 证明未回归，不能另建持久化路径。

## Completion And Deletion

T6 PASS 后，将实际覆盖迁移到 `CURRENT-IMPLEMENTATION-COVERAGE.md`，按 TODO Rules 确认本闭环无未完成 TODO，再删除本 RUNBOOK。删除后使用 `rg -n 'RUNBOOK-LOCAL-SINGLE-USER-MEETING-CONTROL|Local Single-User Meeting Control' .` 清除仅指向本文的残留引用，并重跑相对链接检查与 `git diff --check`；任一检查失败时恢复本文并 STOP。按用户授权提交最终收口；不推送、创建 PR 或合并。

## Author Audit

结论：`Executable`。

审计日期：2026-08-28。

审计修复：已消除「Web 写操作必须有 Agent caller」与本地无身份边界的冲突，固定了 `local_host` actor；list 改用不伪造单 Meeting metadata 的独立 response；当前物理布局已在正式设计中标为过渡基线，本分支只复用 locator；`creating|creation_failed` 与损坏的 ready Meeting 已区分；所选 Meeting 的恢复不再受无关坏库阻塞；Client 固定为 DSH `slots.inject()`，以已校验完整 projection 形成最小 UI；已完成的基线步骤已删除，所有 focused Vitest 命令固定通过 pnpm `exec` 调用本地二进制；每步已有前置条件、允许/禁止文件、精确命令、PASS/STOP 和恢复要求。实现时若触发任一 STOP，必须停止，不得自行扩大范围。

Authoring validation：

- `git diff --check`：PASS。
- `docs/**/*.md` 相对链接目标检查：PASS。
- `pnpm --dir plugin exec vitest --version`：PASS，确认调用本地 Vitest `3.2.7`。
- T6 引用的当前 production/test/script 路径：PASS。
- T6 的九项固定结构（前置、允许、禁止、执行、验证、PASS、STOP、恢复）：PASS。
- T6 的 build、smoke 与 browser lane：Not Run；这些是 RUNBOOK 执行门禁，不是文档审计证据。
