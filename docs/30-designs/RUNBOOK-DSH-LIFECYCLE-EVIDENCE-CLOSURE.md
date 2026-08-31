# RUNBOOK：DSH 生命周期与恢复证据闭环

状态：待执行；Author 与全量 Audit 已完成，结论为 `Executable`

建立日期：2026-08-31

执行边界：只允许在执行者自己的独立 checkout 中工作；不提交、不 push、不创建或合并 PR。执行前记录 `git rev-parse HEAD`，全部证据只对该 commit 和实际打印的依赖版本成立。

## 1. 执行者契约

本 RUNBOOK 面向不能承担产品、架构或接口判断的低级 LLM。T0 已完成并在前一 commit 收口；从 T1 开始顺序执行，不得跳步、合并步骤、改用开发者常用 DSH profile，或把 focused test、mock、Host 监听端口、`build` 成功当作真实生命周期证据。

允许动作：

- 只修改并复用现有 `plugin/scripts/smoke-profile.mjs`；现有 `runCommand`、`allocatePort`、pack/install、`writeProbePackage`、probe `callTool`/`callHttp`/`waitForAgent`、Agent 注册、`dumpConfig`、`bootHost`、`stopHost`、`restore` 是唯一 smoke 实现入口。
- 只增加环境选择器 `CONVIVIUM_SMOKE_SCENARIO`，合法值固定为 `baseline|timeout|reassign|task-handraise|completion-end|risk-reopen|cold-rebind|archive-continuation|mail-race|cross-meeting`，未设置时固定为 `baseline`。
- 运行现有 focused/local tests、完整 `verify` 和独立临时 DSH profile。
- 只有全部验证 PASS 后，更新指定 readiness/operations 文档并删除本 RUNBOOK。
- profile 暴露实现缺陷时，只记录复现并 STOP；本 RUNBOOK 不授权执行者临场设计修复。后续只有新的、明确列出 production 文件和 symbol 的修复 RUNBOOK 才能实施正式契约已授权的最小修复。

禁止动作：

- 修改 requirements、protocol、Domain 产品语义、公开 Schema、错误码、状态枚举或数据库 schema/migration。
- 实现或调整 Decision acceptance、AgendaCandidate promote/park/reject、stall/refocus/replan、developer Markdown、metrics、stress、UI、远程/多用户、跨 Host、存储布局迁移或发布机制。
- 新增 probe package、runner 文件、scenario DSL、scenario registry、兼容层、`smoke-lifecycle-lib`、通用多阶段框架或新的 package script。
- 把场景选择实现为动态注册、对象映射或插件式分派；选择器必须是一个固定 `switch`，未知值在创建临时目录前失败。
- 加入 mock provider、伪造 `ctx.subagents`、直接调用 Runtime 内部 command 代替真实 DSH Tool，或写入 DSH 私有 Session Event。
- 读取或加载根 `dev.env`，传递 `DEEPSEEK_API_KEY`，访问或清理开发者已有 `DSH_HOME`、profile、workspace、端口、Session 或数据库。
- 使用 `rm -rf`、未解析变量、glob 或不受前缀校验的递归删除。
- 放宽断言、Schema、类型、超时、版本或清理条件以取得 PASS。

PASS 定义：当前步骤命令退出码为 `0`，且该步骤列出的全部机器断言成立。STOP 定义：任一前置、路径、symbol、DSH API、命令、断言或 Restore 不成立时立即停止；不得继续后续步骤。

STOP 报告必须包含：最后一个 PASS 步骤、触发条件、触发失败的精确文件/symbol、最小复现命令、实际 stdout/stderr、临时根是否已删除，以及继续所需的人工决定。即使主断言失败也必须先执行该次 smoke 的 `Restore`；Restore 自身失败时保留精确临时路径并 STOP，禁止扩大删除目标。

## 2. 目标

当前起点是 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 中已经通过 local/unit/contract/recovery 自动化、但仍缺真实 DSH profile、cold restart/rebind 或组合生命周期证据的边界。预期终点是在同一发布包、同一临时 `DSH_HOME` 和真实 `web + spawn` 组合中，机械验证以下完整链路：

```text
pack current plugin
-> install into isolated DSH web profile
-> dump composed config
-> boot host phase 1
-> drive real continuable Sessions through DSH tool registry
-> stop host without deleting DSH_HOME/workspace/SQLite
-> boot the same profile phase 2
-> rebind exact Captain parent
-> prove recovery, archive, continuation, mail race and isolation
-> stop host
-> assert no owned process remains
-> remove the exact temporary root
```

本 RUNBOOK 关闭的仅是 FR-2、FR-3、FR-4、FR-5、FR-8、FR-9、FR-10 中“既有实现缺真实 DSH 生命周期证据”的部分，不把这些 FR 整体改写为全部实现。

## 3. 当前断点

| 场景                        | 正式依据                                      | 当前 production 入口                                                                                                        | 当前 local 证据                         | 尚缺证据                                                                          |
| --------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| S1 timeout 后推进           | FR-3.6、FR-9.6、BR-2；Interface Compatibility | `createCreateStatusRuntime()` 内 `scanExpiredSpeakerAttempts()`；`failSpeakerAttempt()`；`interruptAndDrainOwnedSessions()` | `meeting-runtime.spec.ts` timeout cases | 真实 `interrupt -> drain` 后下一既有 speaker 收到 followup                        |
| S2 Captain reassign         | FR-3.6、FR-11.3；`ReassignTurnInputV1`        | `createMeetingControlApplication().reassignTurn()`                                                                          | contract/HTTP/Client                    | 真实旧 child 被 revoke/drain、replacement child 收到新 attempt                    |
| S3 MeetingTask/HandRaise    | FR-5、AC-4                                    | `createMeetingTaskApplication()`；`followupMeetingTaskSession()`                                                            | domain/contract                         | 真实 task delivery、finish、HandRaise 被后续 plan 消费并合法 `submit_turn`        |
| S4 completion/end 竞争      | FR-8、BR-3                                    | `submitSpeakerAndAdvanceMeeting()`；`createMeetingEndApplication()`                                                         | contract/recovery                       | 真实两个 caller 竞争时只有一个合法 commit，终态不可变                             |
| S5 risk reopen              | FR-8.9                                        | `createMeetingControlApplication().disposeRisk()`；repository reopen/status                                                 | domain/contract                         | risk disposition 在同 Host 关闭只读句柄并重新打开 repository 后保持同一事实且可读 |
| S6 cold restart/rebind      | FR-9.4、AC-13/14                              | `createMeetingRehydrationService()`；`bindCaptainParent()`；`inspectOwnedSessions()`                                        | unit/recovery                           | 同一持久 profile 的第二次 Host 启动、exact Captain parent rebind、cold followup   |
| S7 archive/continuation     | FR-10.7-10、BR-7                              | `recoverArchive()`；`cleanupOwnedSessions()`；continuation create path                                                      | unit/contract                           | 真实 Session revoke/drain 后 archived，续会创建全新 Sessions                      |
| S8 mail finish/timeout race | FR-10.3-5、AC-21/22/24                        | `dispatchMail()`；`scanMeetingMailTimeouts()`；`finishMeetingMail()`                                                        | repository/unit                         | 真实 Participant FIFO 中 finish 与 timeout 只能形成一个 terminal result           |
| S9 Meeting/Team isolation   | FR-2.2-8、FR-9.8                              | Session labels、repository ownership、archive proof                                                                         | unit/integration                        | 同一 Captain 下不同 Meeting 及不同 Team 的 child 不被错误 interrupt/drain/rebind  |

当前真实运行入口 [smoke-profile.mjs](../../plugin/scripts/smoke-profile.mjs) 只证明 Manager A→C→B 和 loopback pause/resume，不执行上述组合场景。它生成真实 DSH probe、使用 `ctx.tools.execute()`，但只启动 Host 一次，因此不得直接把历史结果提升为本 RUNBOOK 证据。

## 4. Scope 与 Non-goals

### Scope

1. S1：`timeout -> SQLite revoke -> DSH interrupt -> drain -> next existing speaker`。
2. S2：Captain `reassign` 的真实 profile caller、旧 attempt 失效和 replacement delivery。
3. S3：MeetingTask `finish -> HandRaise -> later submit_turn`。
4. S4：Participant completion submit 与 Captain end 的竞争和终态不可变。
5. S5：risk disposition 的 repository reopen 保持；Host cold restart 只由 S6 覆盖。
6. S6：Host cold restart、exact Captain parent rebind、持久 child enumeration 和 cold followup。
7. S7：archive cleanup 与显式 continuation target。
8. S8：mail finish/timeout race 的单终态与隐私边界。
9. S9：跨 Meeting、跨 Team 的 Session ownership/isolation。
10. 每个场景固定 Prepare/Execute/Assert/Restore；分层执行 API 取证、focused/local tests、完整 verify 和最终真实 profile。
11. 验证事实迁移到 readiness，可重复入口迁移到 operations，最后删除 RUNBOOK。

### Non-goals

- S1 不实现自动 stall/refocus/replan；只验证已有 Turn 内的“下一既有 step”，若 timeout 后必须创建新 Turn 才能继续则 STOP。
- S4 不新增 Decision 或接受语义；只使用已存在的 completion claim 和 `end_meeting`。
- S7 只选择 `includeFinalSummary: true` 且所有 ID 数组为空，避免依赖未实现 Decision/Agenda 功能。
- S8 不验证长期压力、消息正文质量或普通 TeamMember mailbox。
- 不做浏览器/UI、metrics/stress、远程、多用户、跨 Host、生产发布和目标存储布局验证。
- 不调用 LLM；probe 对真实 DSH Agent 的工具调用由确定性驱动器完成。真实 provider、Session persistence、FIFO、interrupt、drain、cold resume 和 tool caller 均不得替换。

## 5. 真相源与 DSH API 取证

按优先级使用：锁定依赖源码/类型、DSH 官方源码/文档、Convivium 正式文档。执行者不得用记忆或社区示例覆盖这些来源。

- [Architecture](../00-governance/ARCHITECTURE.md)：V1 单 Host、identity Session 隔离、SQLite authority、capability revoke。
- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-2/3/4/5/8/9/10 与 Acceptance Criteria 1-4、9-15、20-24。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：caller binding、MeetingTask、mail、status、archive、错误和 Compatibility。
- [SQLite Repository Interface](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)：ownership、recovery、receipt/outbox 和 schema。
- [Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：§9、§11、§14、§15、§19.2/19.4/19.7。
- [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)：Session adapter、Runtime、recovery 和 test layers。
- [Scope Control Design](./MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md)：真实 profile 只证明外部组合独有价值。
- [DSH Smoke Operations](../50-operations/HOW-TO-DSH-SMOKE.md)：独立 profile、凭据隔离和 Restore。
- [DSH API source policy](../../.agents/skills/dsh-plugin-development/references/source-of-truth.md) 与 [testing verification](../../.agents/skills/dsh-plugin-development/references/testing-verification.md)。
- DSH 官方依据：[Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[Plugins and lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/)、[Testing](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)。官方文档只解释平台语义；当前可调用签名仍以锁定包类型为准。
- 锁定包 `@deepseek-ai/dsh-subagent@0.1.1-rc.2`：`plugin/node_modules/@deepseek-ai/dsh-subagent/lib/types/index.d.ts`、`continuation.d.ts`、`README.md`。
- 锁定包 `@deepseek-ai/dsh-session-persistence@0.1.1-rc.2` 的 `lib/types/index.d.ts` 与实现：`SessionPersistence.prepare(id,signal?)` 返回 resume 使用的 exact unpublished `SessionPreparation.session`。
- 锁定包 `@deepseek-ai/dsh-session@0.1.1-rc.2` 的 `lib/types/index.d.ts`：`SessionStore.enter(session)` 把 prepared Session 放入 live store，`announce(session)` 发布 `session/created`；`create` 只用于新 Session，不是 cold resume。

执行时必须确认的 API，不得自行替换：

| API                                                                    | 当前签名/行为                                                                                                        | 本 RUNBOOK 用途                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `startContinuable(spec): Promise<{childId,messageId}>`                 | 首条 inbox 接受后返回；发布前失败完全回滚；provider 必须有 `prepareContinuable`                                      | 创建真实 meeting child                  |
| `followup(parent, childId, content, options)`                          | 要求 exact live direct parent；resident 入 FIFO，absent child 从 persistence cold resume                             | phase 2 rebind 后真实 cold delivery     |
| `interrupt(targetSessionId, authority): void`                          | 同步准入、异步 cancel；absent 是 no-op；不等待目标停稳                                                               | timeout/reassign/mail 取消              |
| `drainContinuableChildren(parent, childIds): Promise<void>`            | 只释放 exact parent 的指定 resident direct children；不删除持久 Session                                              | 等待真实 Activation 释放                |
| `listChildren(parentSessionId, signal?)`                               | 不加载 child，返回 durable direct-child mode/activity/label/diagnostic                                               | restart 前后、archive 和 isolation 证据 |
| `SessionPersistence.prepare(id,signal?)`                               | 返回 `SessionPreparation`；`.session` 是 resume 使用的 exact unpublished persisted Session；preparation 必须 dispose | phase 2 恢复 Captain Session            |
| `SessionStore.enter(session)` / `announce(session)`                    | `enter` 发布到 live store并返回 detach disposer；`announce` 发出正式 created 通知；`create` 仅新建 Session           | phase 2 Session live/publish            |
| `AgentRegistry.get(id)` / `register(agent)`                            | `get` 只返回 live Agent；`register` 仅登记已由正式 persistence 路径恢复的 Session 对应 Agent                         | exact Agent 检查 / restored Agent登记   |
| `SessionStore.get(id)` / `flush(session)`                              | `get` 只返回当前进程 live Session；`flush` 等待 persistence listener，返回是否有 listener 参与                       | phase checkpoint durability             |
| `ToolRuntime.execute(input)`                                           | 输入固定含 `callId/name/arguments/agent/signal`，返回 `isError` 判别的 `ToolExecutionResult`                         | 真实 caller Tool 调用                   |
| `WorkspaceRegistry.create(path,title)` / `Workspace.attachSession(id)` | workspace 路径必须存在；attach 校验 Session header `cwd` 与 canonical workspace 一致并持久记录                       | Captain workspace/session persistence   |

DSH 已知限制必须保留在断言中：`interrupt()` 不保证停稳；`drain` 不删除 durable Session；`followup` 接受后但尚未记入日志的消息在进程崩溃时不自动 replay。因此本 smoke 必须在 phase 1 checkpoint 前等待 SQLite/Session 可观察提交，不以“调用已返回”猜测 durability。

## 6. 固定交付文件、符号和数据

### 6.1 唯一允许修改的文件

| 文件                                                   | 动作                           | 唯一职责                                                                |
| ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------- |
| `plugin/scripts/smoke-profile.mjs`                     | T1-T11 修改                    | 在现有 profile、probe 和 Restore 中加入固定 selector 及九个相互独立场景 |
| `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` | T13 且真实场景全部 PASS 后修改 | 记录实际证据与仍未覆盖项                                                |
| `docs/50-operations/HOW-TO-DSH-SMOKE.md`               | T13 且真实场景全部 PASS 后修改 | 记录 selector 的稳定操作入口                                            |
| 本 RUNBOOK                                             | T14 删除                       | 临时执行计划                                                            |

不得新增或修改 `plugin/package.json`、任何 production/test 文件、其他脚本或其他文档。任何场景暴露 production bug 时立即 STOP，只报告最小复现；不得在本 RUNBOOK 下修复。

### 6.2 固定复用的 profile 组合

不得复制、重命名或替代以下现有 symbol：`runCommand(command,args,options={})`、`allocatePort()`、`packArtifact(artifactDir)`、`writeSmokePatch(path)`、`writeProbePackage(probeDir)`、`installArtifact(env,artifact)`、`installProbe(env,probeDir)`、`dumpConfig(env,patchPath,logsDir)`、`bootHost(env,patchPath,workspaceDir,logsDir,port)`、`waitForJson(path,timeoutMs)`、`stopHost()`、`restore()`。

组合顺序保持：创建唯一 `convivium-dsh-smoke-*` temp root及既有子目录 → `packArtifact` → `installArtifact` → `installProbe` → `dumpConfig` → `bootHost`。DSH CLI argv、cwd、env、probe manifest、probe `cordis.patch.yml`、Convivium patch、tarball/profile 路径全部保持当前实现。`dumpConfig` 继续断言 `@convivium/dsh-plugin`、`@deepseek-ai/dsh-subagent-spawn-in-process`、`spawn`；新增且仅新增 probe package、probe id、`webServer.host === "127.0.0.1"` 的 config-tree 断言。Host readiness 必须在 TCP 后再以既有 `callHttp` GET `/api/convivium/meetings` 得到 HTTP 200、`protocolVersion===1` 和数组 `result.meetings`；TCP 单独不是 PASS。

`writeProbePackage` 继续生成当前 `@convivium/smoke-profile-probe`，manifest、patch 与 baseline inject 不变。只有 T7 `cold-rebind` 可以在同一 probe 的静态 inject 中增加 `"sessionPersistence"` 和 `"subagents"`；`sessionPersistence` 只用于 phase2 恢复 checkpoint 指定的 Captain Session，`subagents` 只用于读取其 durable children。其他 selector 不得消费这两个 service。不得新增 probe package或第二份 probe source。

### 6.3 固定 selector、结果和直接 helper

外层新增 `const SMOKE_SCENARIO = process.env.CONVIVIUM_SMOKE_SCENARIO ?? "baseline"`，在创建 temp root 前用固定 `switch` 校验十个合法值。env 原样向 probe传递该值；probe 用同一固定 `switch` 调用且只调用一个 `run<ScenarioName>Scenario(ctx, fixture)`。`baseline` 调用现有 `run(ctx)` 的行为不得改变。未知值抛 `Unsupported CONVIVIUM_SMOKE_SCENARIO: <value>.`。

每个场景 result 固定为：

```json
{
  "ok": true,
  "scenario": "timeout",
  "assertions": ["..."],
  "meetingIds": ["..."],
  "sessionIds": ["..."]
}
```

失败 result 固定为 `{"ok":false,"scenario":"<selector>","error":"<message>"}`；不得把 mail body、prompt、capability、SQLite绝对路径、完整 Session event写入 result。外层要求 `scenario===SMOKE_SCENARIO`、`ok===true`、assertion 名称与本 RUNBOOK对应场景逐字相等，否则 STOP。

现有 `callTool(ctx,agent,name,input,index)` 保持签名和 `ToolExecutionInput`：`{callId:"convivium-smoke-"+index,name,arguments:{input},agent,signal:new AbortController().signal}`。场景调用的 `index` 必须使用下表列出的常量，禁止自增或运行时生成。现有 `waitForAgent(ctx,id)` 只用于 baseline；生命周期场景新增直接 helper：

```js
async function callToolResult(
  ctx,
  agent,
  name,
  input,
  callIdIndex,
  expectedCode,
) {
  // 30000ms AbortController；finally clearTimeout。
  // expectedCode===undefined 时只接受 ToolExecutionResult.isError===false、value.ok===true。
  // expectedCode 非空时只接受 isError===false、value.ok===false、value.code===expectedCode。
  // 返回 value；不得解析 rendered content。
}
async function waitForOwnedAgent(
  ctx,
  captain,
  meetingId,
  role,
  participantId,
  timeoutMs = 30000,
) {
  // 每100ms以 node:sqlite readOnly 打开 fixture 精确计算的单个 Meeting DB；
  // 从 session_ownership 唯一匹配 role/participant_id，parent_session_id 必须等于 String(captain.id)；
  // 再返回 ctx.agents.get(session_id) 的 exact Agent；finally 必须 close DB。
}
async function waitForStatus(
  ctx,
  captain,
  meetingId,
  predicate,
  label,
  timeoutMs = 30000,
) {
  // 每100ms调用 status；predicate 只由场景内联定义；超时抛包含 label 与最后 status 的 Error。
}
```

`callToolResult` 被 T2-T11 全部场景消费，`waitForStatus` 被 T2-T11 全部场景消费，满足共享 helper 门禁；`waitForOwnedAgent` 被 T2、T3、T4、T5、T6、T7、T8、T9、T10、T11 消费。除此以外 helper 必须内联在唯一 `run<ScenarioName>Scenario` 中；只有文中明确列出两个消费者时才可共享。

Captain 继续复用当前 `createSmokeAgent(ctx,"convivium-smoke-captain")`、`registerSmokeAgent(ctx,session)` 和 disposer。除 T7 phase2 按 §6.3.1 恢复 persisted Captain 外不得改变 Agent 注册方式。Manager/Participant caller 唯一来自 `waitForOwnedAgent` 或 T7 checkpoint 指定 Session 经正式 cold followup 后返回的 live Agent；attempt/delivery/turn/step/agenda ID 唯一来自紧邻 call 前的公开 status 或真实 inbox context。MeetingTask/mail/message/HandRaise ID 唯一来自前序 success DTO，再与 status 对照。禁止从 ID 字符串或 fixture 自行推导。

### 6.3.1 cold-rebind 唯一 phase 例外

仅 selector `cold-rebind` 在现有 `main()` 中内联两阶段，不新增 framework：phase1 使用现有 temp root、`DSH_HOME`、workspace、port、patch、tarball和profile；外层只在该 selector 创建 `control/`，并把绝对 checkpoint path 通过 `CONVIVIUM_SMOKE_COLD_CHECKPOINT` 传给 probe。probe 写 `control/cold-rebind-checkpoint.json` 后外层 `stopHost()`；phase2 设置 `CONVIVIUM_SMOKE_COLD_PHASE=2`，继续传同一 checkpoint path并使用完全相同参数再次 `bootHost()`。phase2 不 pack、不 install、不 dump另一份 config。

checkpoint 必须写入 `control/cold-rebind-checkpoint.json` 并原子发布：先 `writeFile(checkpointPath+".tmp", JSON.stringify(value))`，再 `rename`。固定结构为 `{schemaVersion:1,scenario:"cold-rebind",phase:1,hostPid:number,captainSessionId:"convivium-smoke-captain",meetingId:string,meetingVersion:number,workspacePath:string,managerSessionId:string,participantSessionId:string,sessionIds:string[],transcriptMessageIds:string[],managerPlanningAttemptId:string,managerPlanningMeetingVersion:number}`；所有字段 required，`sessionIds` 精确等于 Manager/A 两个 ID，`transcriptMessageIds` 至少含 703 success messageId。

在现有脚本内新增且仅新增 T7 直接 helper `validateColdCheckpoint(value)`：逐字段拒绝缺失、错误类型、错误常量、空数组、`sessionIds` 与两个显式 child ID 不一致、空 transcript、planning version 与 meeting version 不一致；成功返回冻结的字段副本。外层第一次读取完整文件必须成功；随后对 `{...value,managerPlanningAttemptId:undefined}` 调用必须抛错，之后才能 stop phase1 Host。该 helper不得接受默认值、推导 ID或扫描目录。

phase1 在 703 后必须等待真实 later Manager inbox context；它的 `planningAttemptId` 必须不同于 702 使用的 attempt，`meetingId` 必须匹配且 `meetingVersion` 必须等于紧邻 checkpoint 的 Captain status version。等待函数必须保留 `{value,agent}`，checkpoint 的 planning 字段取 `value`，并且依次断言 `await ctx.sessions.flush(agent.session)===true` 与 `await ctx.sessions.flush(captain.agent.session)===true`；不得 flush 旧 Manager Agent。紧邻 status 必须证明 Meeting 非终态、无 running speaker attempt、消息前缀包含 703 messageId。外层校验所有字段和数组非空，确认 phase1 Host 已退出后才启动 phase2。

phase2 不得调用 `createSmokeAgent` 或 `ctx.sessions.create` 复用 persisted ID。唯一恢复链固定为：`preparation=await ctx.sessionPersistence.prepare(checkpoint.captainSessionId,signal)` → `restoredSession=preparation.session` → `detach=ctx.sessions.enter(restoredSession)` → `ctx.sessions.announce(restoredSession)` → `registered=registerSmokeAgent(ctx,restoredSession)`。`announce` 失败时顺序为 `detach()`、`preparation[Symbol.dispose]()`、抛原错误；成功后立即 `preparation[Symbol.dispose]()`。Captain disposer 唯一顺序为 `await registered.dispose()` 后 `detach()`，外层 finally 仍只调用现有 `restore()`。

704 使用恢复后的 Captain 调 `convivium_meeting_status` 触发 Meeting rehydrate/rebind；必须显示 checkpoint Meeting/version/transcript prefix。`ctx.subagents.listChildren(restoredSession.id,signal)` 必须包含 checkpoint 的 Manager/A ID，`mode==="continuable"`、无 diagnostic，且 SQLite ownership 的 `parent_session_id` 都等于 restored Captain ID。随后用 `resumeParticipantForProbe` 对 checkpoint Manager ID 发 cold followup，并从该 live Manager 的 `session.deriveMessages()` 与本 Host `agent/inbox/inserted` 合并读取 JSON context；只接受 `planningAttemptId===checkpoint.managerPlanningAttemptId`、`meetingVersion===checkpoint.managerPlanningMeetingVersion`、`meetingId===checkpoint.meetingId`。705 使用该 context；706 的全部 turn/step/attempt/delivery/agenda 字段只取 705 后 A 的真实 speaker context。禁止调用 `AgentRegistry.create/resume`、构造 planning/delivery ID、删除 persisted log或建立兼容层。

### 6.4 只读证据结构

Smoke 可以用 Node `node:sqlite` `DatabaseSync` 以 `readOnly: true` 打开 probe 自己创建且由 checkpoint 精确命名的 SQLite；这只是测试 oracle，不是产品调用方。数据库路径只能由固定临时 `workspaceDir + dataRoot + encodeURIComponent(teamId) + encodeURIComponent(meetingId) + ".sqlite"` 构造。若当前 locator 不再是该过渡布局，视为本 RUNBOOK 的存储迁移 STOP，不得扫描或适配第二布局。

只读 SQL 仅允许：

```sql
SELECT state_json, version FROM meetings WHERE id = ?
SELECT session_id, parent_session_id, session_label, role, participant_id,
       lifecycle_status, capability_status
  FROM session_ownership WHERE meeting_id = ? ORDER BY session_id
SELECT status, handling_attempt_id, delivery_id, processing_through_seq, deadline_at
  FROM meeting_mail WHERE meeting_id = ? AND mail_id = ?
SELECT COUNT(*) AS count FROM meeting_events WHERE meeting_id = ? AND type = ?
```

Probe 不得执行 PRAGMA 或写 SQL。每次读取后必须关闭连接。`state_json` 是断言当前事实的 canonical source；DSH residency/parent/label 则必须同时由真实 `ctx.subagents.listChildren(captainSessionId)` 证明，SQLite 单独不能证明 DSH 行为。

### 6.5 固定 fixture 与 ID 来源

新增 helper `createFixtureInput(scenarioId, overrides)`，不得由场景自行拼另一套 create payload。基础 payload 固定为：`protocolVersion=1`、`requestId="create:"+scenarioId`、`teamId="lifecycle:"+scenarioId`、`topic="Lifecycle "+scenarioId`、`objective="Prove "+scenarioId`、`selectionMode="manager"`；objective contract 只有 acceptance criterion `{key:"criterion",description:"criterion"}`，其余数组为空、risk level `low`；agenda 只有 key `agenda`，title/objective 为 scenarioId，inScope `[scenarioId]`、outOfScope `[]`、completionCriteria `["criterion"]`、requiredParticipantKeys `["a","b"]`；participants 逐字为 `{participantKey:"a",displayName:"A"}`、`{participantKey:"b",displayName:"B"}`。只有下表列出的 override 可变：

| 场景 | 唯一 override / plan                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1   | limits `speakerAttemptTimeoutMs=250`；Manager plan steps A→B                                                                                                                                                                         |
| S2   | timeout `30000`；Manager plan first step A，reassign replacement 使用 create result 中 key `b` 对应 participantId                                                                                                                    |
| S3   | timeout `30000`；第一 plan 只有 A，第二 plan 也只有 A                                                                                                                                                                                |
| S4   | `requiredOutputs=[{key:"output",description:"output"}]`；criterion 同基础；第一 plan 只有 A                                                                                                                                          |
| S5   | risk authority keys `["a"]`；第一 plan 只有 A                                                                                                                                                                                        |
| S6   | 基础 fixture；完成第一 plan 的 A message 后停在下一 manager-planning 边界                                                                                                                                                            |
| S7   | 基础 fixture；phase 1 提交不带 completion claims 的 A message 后停在下一 manager-planning 边界；phase 2 由 Captain `end_meeting(outcome="partial", acceptedDecisionIds=[], deferredAgendaItemIds=[], waivers=[])` 触发终态和 archive |
| S8   | limits `mailHandlingTimeoutMs=100`、speaker timeout `30000`；phase 2 第一 plan A→B                                                                                                                                                   |
| S9   | 分别用 scenarioId `isolation-a/isolation-b/isolation-c`；前两者 teamId 固定 `lifecycle:isolation-team-a`，第三为 `lifecycle:isolation-team-b`；每场 plan A→B                                                                         |

所有 Manager plan 的 `planningAttemptId`、`observedMeetingVersion` 只从同次 state read 获取；`agendaItemId` 只从 status `activeAgendaItem.id` 获取；requestId 固定为 `plan:<scenarioId>:<ordinal>`。所有 Participant submit 的 `turnId/stepId/attemptId/deliveryId` 从同次 `state_json` current step 获取，`agendaItemId` 与 current turn 一致，request-less submit不发明 requestId；message content 固定为 `<scenarioId>:<participantKey>:<ordinal>`，mentions/taskIds 为空（S3 taskIds 为唯一 task ID），relation `on_topic`、changes `{}`，只有 S4/S5 使用表述的 claims。Tool success 返回的 ID 必须保存并与后续 state/status逐项相等，禁止使用 create result 之外的字符串推导领域 ID。

## 7. 场景不变量和机器判据

### S1 timeout-next-speaker

Prepare：创建 `selectionMode="manager"`、speakers A→B 的 Meeting，patch 固定 `speakerTimeoutMs: 250`、`outboxPollMs: 25`；A child 必须出现在 `ctx.agents` 且 `listChildren` 为 continuable。B 已是同一 Captain 的 existing direct child，但尚未收到当前 SpeakerAttempt。

Execute：不替 A 调用 `submit_turn`；等待状态中 A attempt 变为 `revoked`、reason/event 为 `timeout`，再等待 A 从 `ctx.agents` resident registry 消失，最后等待 B 成为 `currentSpeakerId` 并用 B 的真实 caller 调用 `convivium_submit_turn`。

Assert：drain 后使用已保存但不再 live 的 A Agent object 发起迟到提交，必须返回协议 `UNAUTHORIZED_CALLER`，且 version/event/transcript 不变；B 提交成功且 transcript 只有 B；SQLite A failure counter 增 1；`listChildren` 仍含 A durable row但 activity 非 running，证明 drain 未删除 Session；B 的 delivery 只在 A drain 完成后被观察到。若迟到调用成为 transport error、返回 `STALE_ATTEMPT` 或写入任何事实均 STOP，不得把 stale Agent object重新注册。

Restore：场景不得单独删除 Session 或 SQLite；将 A/B IDs 登记进 result 的 owned-resource 清单，由外层 `finally -> restore()` 停止当前 Host 并删除唯一临时根。场景失败时仍写失败 checkpoint 后抛错，外层执行同一 Restore。

### S2 captain-reassign

Prepare：创建 A→B Turn，等待 A running，记录 old `attemptId`、A/B Session IDs 和 Meeting version。

Execute：Captain 通过真实 `convivium_reassign_turn`，`action="reassign"`、replacement 为 B。等待 A resident Activation 被 drain，再由 B 对 replacement attempt 提交。

Assert：result.revokedAttemptId 等于 old attempt；replacementAttemptId 非空且不同；drain 后 A old submit 精确返回 `UNAUTHORIZED_CALLER` 且无写入；B message 成为唯一新增 transcript；A/B ownership 未交换，其他 Session activity 未被改变。

Restore：把 Meeting、A/B Session 和 replacement attempt 登记进 owned-resource 清单；不恢复已提交业务状态，仅由外层 Restore 停 Host并删除该次唯一临时根。

### S3 meeting-task-hand-raise

Prepare：A 为当前 speaker。A 调用 `convivium_create_meeting_task(blocking=false)`，再以包含该 `meetingTaskId` 的短 `submit_turn` 释放发言权。

Execute：等待同一 A Participant Session 收到真实 meeting-task followup；用 A caller依次调用 status pre-read、`start_meeting_task`、status post-read，断言 post `mayExecute=true`；调用 `finish_meeting_task(status="completed")`。Captain 调用 `convivium_meeting_status`，要求 `pendingHandRaises` 中出现 finish result 的唯一 `handRaiseId`；随后用真实 Manager caller提交唯一包含 A 的后续 plan，再由 A 从只读 state 获得新 attempt/delivery 后 `submit_turn(kind="evidence")`。

Assert：task 的 participant/session/execution binding 不变；finish result 有唯一 `handRaiseId`；plan 成功后的 Captain status 中该 ID 不再出现在 `pendingHandRaises`，新 current speaker 为 A，且 state_json 中同一 HandRaise status 为 `consumed`；后续 message 使用新 attempt并引用 task ID；MeetingTask completed 本身未把 objective/output 标为 completed/accepted。这里只证明正式 status/state 转换，不声称观察 Manager 内部 context 消费。

Restore：把 MeetingTask、HandRaise、Meeting 和 A Session IDs 登记进 owned-resource 清单；不向 finished task 追加补偿事件，由外层 Restore 清理整个临时 profile。

### S4 completion-end-race

Prepare：创建只含一个 output/criterion、无 Decision 的 Meeting；A 的合法 completion submission 与 Captain `end_meeting(outcome="partial")` 使用同一个 observed Meeting version，并分别通过真实 caller 准备。

Execute：同一 event-loop tick 用 `Promise.allSettled` 发起两个 `ctx.tools.execute()`；不规定哪一个先取得 SQLite 写锁。

Assert：允许结果集合只有以下两类之一，执行者不作选择：`submit_turn ok + end VERSION_CONFLICT|IMMUTABLE_MEETING`，或 `end ok + submit_turn VERSION_CONFLICT|IMMUTABLE_MEETING|STALE_ATTEMPT|UNAUTHORIZED_CALLER`；后者的 `UNAUTHORIZED_CALLER` 仅表示 end 已同步撤销 meeting-owned Session capability。两个操作不得都形成不同终态；最终 status 只能是 `completed` 或 `partial`，只含一个 termination，执行终态后 Captain end 必须是 `IMMUTABLE_MEETING` 或 `ARCHIVED_MEETING`，Participant submit 还可因 capability 已撤销或 Session 已从 live store 移除而为 `UNAUTHORIZED_CALLER` 或同义的 tool-level rejection；事件/version 单调且无两份终止事实。任何 `INTERNAL_ERROR`、两个成功但相互矛盾、或非上述错误均 STOP。

Restore：等待两个 Promise 均 settled，登记 Meeting/Session IDs 和 winner，再由外层 Restore 停 Host并删除临时根；禁止通过反向写入改变已产生的 canonical winner。

### S5 risk-recovery

Prepare：Participant 正式提交一个 blocking `IssueClaimV1`；Captain 对其调用 `convivium_dispose_risk(decision="accept")`。记录 issue ID、completion fact ID、version 和全部 ownership。

Execute：完成 disposition 后关闭本次只读 SQLite 连接；下一次 status 调用使 Runtime 从 canonical repository 重新读取，再用一个新的 read-only SQLite handle读取同一 state_json。不得停止 Host；跨 Host 恢复只由 S6 验证。

Assert：issue 仍为 `accepted_risk/accepted`，同一 completion fact 仍 active、actor/authority/evidence 不变；version 不因读取/rebind 增加；相同 requestId/hash replay 返回原 receipt且不新增 event，different hash 返回 `IDEMPOTENCY_CONFLICT`。

Restore：关闭所有只读 SQLite handle，登记 Meeting/Session/issue IDs，由外层既有 Restore 删除同一临时 profile。

### S6 cold-restart-rebind

Prepare：phase 1 保留一个非终态 Meeting，所有 owned Sessions、SQLite 和 Captain Session 已 flush；checkpoint 保存精确 IDs。

Execute：phase 2 按 §6.3.1 使用 `SessionPersistence.prepare`、`SessionStore.enter/announce` 与现有 `registerSmokeAgent` 恢复同一 Captain Session，调用 `convivium_meeting_status` 触发 rehydrate/rebind；用 `listChildren` 读取 durable children；让 cold Manager 从持久 Session 历史取得 checkpoint 锁定的未消费 planning context并提交唯一 A plan。不得调用 `createSmokeAgent`、`SessionStore.create`、`AgentRegistry.create/resume`，不得创建 wrong-parent或扩展本场景为通用 parent 测试。

Assert：Meeting ID/version/transcript 前缀不丢失；children IDs、parent IDs、labels 与 SQLite ownership 逐项一致；followup 发生前 cold Manager child 不在 `ctx.agents`，接受后相同 Session ID 的真实 Agent 出现在 registry；旧 attempt/delivery 不复活；不创建替代 Session ID；phase-2 Captain object不等于 phase-1（只用不同 PID 证明进程边界），但 `id` 等于 checkpoint。

Restore：停止 phase-2 Host 前等待本场景 followup 完成并记录 child activity；不得删除 durable child 作为场景断言。资源统一由外层 Restore 按精确 PID 和临时根清理。

### S7 archive-continuation

Prepare：使用 phase 1 `prepareArchiveContinuationBeforeRestart` 预建 active、无 running attempt、尚无 ArchivePackage 的 source Meeting；保存 state hash 和 ownership集合。

Execute：phase 2 先用 Captain 对 checkpoint version 调用 `convivium_end_meeting`，固定 `requestId="end:archive-continuation"`、`outcome="partial"`、`reason="lifecycle archive evidence"`、三个选择数组为空；等待 `archiving -> archived`。对每个 source child 检查 capability revoked、lifecycle closed、DSH durable row仍可存在但非 resident。Captain 再以 `createFixtureInput("archive-continuation-target")` 创建 continuation target，并加入 `continuation={sourceMeetingId,includeFinalSummary:true,decisionIds:[],unresolvedIssueIds:[],riskIds:[],evidenceIds:[],artifactIds:[]}`。

Assert：source package hash 在 cleanup 重试前后不变；source archived 时无 resident owned child、无 active capability；target `sourceMeetingId` 正确且仅含 final-summary material；target Meeting/Participant/Session/capability ID 全部与 source 不相交；source 保持 archived，旧 Participant tool 调用返回 `ARCHIVED_MEETING` 或 `UNAUTHORIZED_CALLER`。

Restore：等待 source/target 所有当前 Activation drain，登记两组不相交 ID；不删除或回写 ArchivePackage，由外层 Restore 删除整个临时数据根。

### S8 mail-finish-timeout-race

Prepare：仅在 phase 2 创建独立 Meeting，A→B 发送 meeting-scoped mail，固定 `mailHandlingTimeoutMs=100`；等待 SQLite mail 状态为 `processing` 并记录稳定 `handlingAttemptId`、`deliveryId`、`processingThroughSeq`、deadline。该 fixture 不读取或依赖 checkpoint。

Execute：在 deadline 前最后一个 25ms 窗口发起 B 的合法 `finish_meeting_mail(status="processed")`，同时让 Runtime timeout scanner 正常运行；随后等待超过 deadline 250ms。不得直接调用 timeout transition。

Assert：最终 SQLite status 只能为 `processed` 或 `timed_out`；只允许一个 terminal receipt/event 效果，另一竞争方幂等失败且不能覆盖 winner；handling/delivery/processingThroughSeq 不变；mail content 不出现在 transcript、CompletionFact 或 archive；B Session 队列随后可以接受一个新合法 speaker followup。两种合法 winner 都算同一个机械 PASS，不需要执行者选择；`failed/cancelled/processing` 或双重终态为 STOP。

Restore：等待 finish caller 和 timeout scanner 均静止，结果仅记录 mail ID/terminal status 而不记录正文；登记 A/B Sessions 后交由外层 Restore 清理临时 profile。

### S9 session-isolation

Prepare：同一 Captain 下创建 team-a/meeting-A、team-a/meeting-B、team-b/meeting-C；每场至少两个 Participant；保存三份 SQLite ownership 和 `listChildren` 全集。

Execute：phase 2 对 isolation meeting-A 用 checkpoint version 调用 Captain `convivium_end_meeting`，固定 partial、reason `isolation cleanup`、空 accepted/deferred/waivers，并等待 archived/全部 A owned Session drain；随后分别读取 B/C status 触发 rehydrate，各提交 plan A→B，再让各自 participant A 用只读 state 中的合法 attempt/delivery 提交一条 message。

Assert：每个 Session ID 只出现在一个 repository；label 解码的 teamId/meetingId/participantId 与 row 一致；A 的 interrupt/drain/revoke 集合与 B/C Session ID 交集为空；B/C version、capability、lifecycle 和 transcript 不因 A cleanup 改变；错误地用 A ownership 访问 B/C 返回 `UNAUTHORIZED_CALLER` 或 DSH `UNAUTHORIZED`，且无 SQLite 写入。

Restore：分别保存 A/B/C 的最终 ownership 快照和交集为空断言；不逐场递归删除，外层只用已保存 PID 停 Host并删除唯一受前缀保护的临时根。

## 8. 机械执行步骤

以下对象中的 `<status.*>` 不是执行者选择或占位输入，而是强制的数据流引用：必须先执行紧邻的 `convivium_meeting_status`，再逐字段复制该返回值；字段缺失即 STOP。所有 `convivium_create_meeting` 使用 §6.5 固定 fixture；所有 success 必须是 `ProtocolSuccessV1`，所有预期失败必须是 `ProtocolErrorV1` 且 `retryable===false`。

T1-T10 已 PASS 并按滚动策略删除对应执行步骤；当前从 T11 开始执行。稳定场景定义仍保留在 §7。

### T11：逐个重跑九个 selector

允许修改：无。执行固定命令：

```bash
for scenario in timeout reassign task-handraise completion-end risk-reopen cold-rebind archive-continuation mail-race cross-meeting; do env CONVIVIUM_SMOKE_SCENARIO="$scenario" pnpm --dir plugin smoke:profile || exit 1; done
```

每次首轮失败即STOP，不自动重试。PASS：九个result契约、SQLite/status/listChildren断言和各自Restore全部通过。

### T12：完整本地验证

允许修改：仅Prettier对 `plugin/scripts/smoke-profile.mjs` 的格式化。执行：

```bash
pnpm --dir plugin exec prettier scripts/smoke-profile.mjs --write
node --check plugin/scripts/smoke-profile.mjs
pnpm --dir plugin format:check
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin test
pnpm --dir plugin build
pnpm --dir plugin verify:environment
pnpm --dir plugin verify:contract
pnpm --dir plugin verify:package
pnpm --dir plugin verify
```

任一失败若需production修复则STOP。

### T13：迁移 readiness 与 operations

只有T11/T12实际PASS后，才允许修改§6.1两个长期文档。readiness记录commit、Node/pnpm/DSH版本、九条精确selector命令和result摘要；只移除被实际证据关闭的缺口，保留Decision/Agenda/stall、Markdown、metrics/stress、browser、远程/多用户、存储迁移、生产发布。operations继续以 `node scripts/smoke-profile.mjs` 为入口，列出selector、首轮失败STOP及Restore；不得写不存在的`smoke:lifecycle`命令。

### T14：链接、diff 与删除

执行：

```bash
pnpm --dir plugin verify
node -e 'const fs=require("node:fs"),p=require("node:path"),f="docs/30-designs/RUNBOOK-DSH-LIFECYCLE-EVIDENCE-CLOSURE.md",s=fs.readFileSync(f,"utf8");for(const m of s.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const t=m[1].split("#",1)[0];if(t&&!/^https?:/.test(t)&&!fs.existsSync(p.resolve(p.dirname(f),t)))throw Error(t)}'
git diff --check
git status --short
rg -n "RUNBOOK-DSH-LIFECYCLE-EVIDENCE-CLOSURE|DSH 生命周期与恢复证据闭环" . --glob '!docs/30-designs/RUNBOOK-DSH-LIFECYCLE-EVIDENCE-CLOSURE.md'
```

`git status --short` 只能含§6.1四项；外部引用必须为空。全部PASS才用 `apply_patch` 删除本文件，删除后重新检查长期文档链接、引用、`git diff --check`；失败用删除前patch buffer原样恢复。

## 9. 验证矩阵

| 风险                    | focused/local                                    | 真实 selector         | PASS                                         |
| ----------------------- | ------------------------------------------------ | --------------------- | -------------------------------------------- |
| baseline/API            | environment、contract、node check、result mapper | baseline              | 既有 ACB/HTTP 不回归                         |
| timeout/interrupt/drain | speaker-attempt、runtime、adapter                | timeout               | revoke→drain→existing next speaker           |
| Captain reassign        | control/runtime/adapter                          | reassign              | old revoked、replacement真实提交             |
| task/HandRaise          | task、hand-raise、dispatch                       | task-handraise        | finish产生raise、later turn提交              |
| completion/end          | completion、end、runtime                         | completion-end        | 单winner、单termination、terminal拒写        |
| risk reopen             | disposition、repository/recovery                 | risk-reopen           | reopen、replay、conflict                     |
| cold restart            | recovery、ownership、adapter                     | cold-rebind           | 同home/workspace/port、不同PID、exact parent |
| archive/continuation    | archive、continuation、recovery                  | archive-continuation  | source关闭、target全新                       |
| mail race/privacy       | mail dispatch、repository/runtime                | mail-race             | 单终态、正文不公开                           |
| Meeting/Team隔离        | ownership、runtime/recovery                      | cross-meeting         | 三组ownership不相交                          |
| package/config          | build、verify:package、dump-config               | 每个 selector         | web+spawn+Convivium+probe                    |
| Restore                 | node check及每次真实运行                         | 每个 selector finally | child exit、端口释放、temp root不存在        |

数据库 migration、协议/schema变化、Client/browser、LLM质量、metrics/stress、远程/多用户和存储布局迁移均为 `Not Applicable`。真实selector若证明产品不满足正式契约，立即STOP，只报告最小复现。

## 10. 完成、迁移与删除

只有T0-T14全部PASS才完成。readiness只记录实际commit、依赖、九个selector结果和仍未覆盖项；operations只记录已通过的现有脚本入口。任一selector未运行或首次失败，长期文档不得更新。删除前须通过完整verify、链接、scope、diff、Restore及外部引用检查；删除后失败必须原样恢复，不得归档RUNBOOK。

## 11. Author 全量 Audit

结论：`Executable`。

弱LLM逐步dry-run确认：T0只读；T1只建selector/result；T2-T10一步一个场景；每次tool调用固定caller、call index、完整input、version/ID来源和success/error；只有T7改两阶段Host；每步含node check、focused test、真实selector及result/status/SQLite/DSH child/Restore判据；共享helper均有多个消费者；禁止新package、runner、DSL、compatibility及production修复；readiness/operations仅在真实PASS后迁移。

Author已核对相对链接、现有`smoke-profile.mjs` symbol、测试路径和锁定DSH类型；Author/Audit未执行RUNBOOK或产生生命周期证据。
