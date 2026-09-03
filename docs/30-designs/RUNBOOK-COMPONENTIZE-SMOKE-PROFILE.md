# RUNBOOK：组件化 DSH Smoke Profile

## 1. 状态与工作边界

- 状态：`Executable`
- 模式：Author 完成；Audit 完成；尚未进入 Execute
- 建立日期：2026-09-03
- 执行分支：`codex/componentize-smoke-profile`
- 起始产品提交：`d285efec7dc268320c8040b1a8fb5f5031918fd6`
- 唯一临时交付物：`docs/30-designs/RUNBOOK-COMPONENTIZE-SMOKE-PROFILE.md`
- 执行授权：本 RUNBOOK 的存在不授权修改产品代码、commit、push、创建 PR 或合并。进入 Execute 前，用户必须明确授权执行和 commit；push、PR 与 merge 分别需要独立授权。

本任务是测试基础设施结构重构。当前 `plugin/scripts/smoke-profile.mjs` 同时拥有 CLI runner、临时 DSH probe package 生成、probe 生命周期、共享 helper 和 12 个场景，共 2,371 行；其中 `writeProbePackage()` 内嵌 1,839 行 probe 源码。终点是一个自包含的 `plugin/scripts/smoke-profile/` 目录，仓库外部只执行 `plugin/scripts/smoke-profile/index.mjs`，场景按固定模块拆分，所有现有 selector、调用顺序、结果字段、assertion label、失败和 Restore 语义保持不变。

## 2. 执行者契约

1. 只在 `codex/componentize-smoke-profile` 上按 T0→T15 顺序执行；每次只执行最前面的未完成步骤。
2. T0 以前不得修改现有源码。T0 在取得明确 commit 授权后仅提交本 RUNBOOK。
3. 每个 T1→T14 是一个独立稳定重构单元。该步全部验证 PASS 后，恰好创建一个 commit；不得合并两个步骤，不得 amend、rebase、squash、push、创建 PR 或修改 `main`。
4. 每步只 stage“允许修改”列出的文件。`git diff --cached --name-only` 出现其他路径时必须 STOP，不得提交。
5. 每次真实 smoke 前必须先运行 `pnpm --dir plugin build`，确保脚本测试当前 `src/` 对应的 `lib/`。真实 smoke 只能使用 `@deepseek-ai/dsh@0.1.1-rc.2`、`web` profile 和 `spawn` provider。
6. 每项验证必须退出码为 0，真实 smoke 必须输出顶层 `ok: true`、`profile: "web"`、`provider: "spawn"`、与 selector 相同的 `probe.scenario` 和原有 assertion label。Host 启动或 TCP 可连不构成 PASS。
7. 任一验证失败时保留当前工作树、不得 stage 或 commit，并报告：步骤、命令、首个失败、完整错误分类、允许文件 diff 和最小候选修复。不得删除或放宽断言，不得改产品源码来迁就 smoke。
8. 真实 smoke 创建的临时 Host、端口和 `convivium-dsh-smoke-*` 根由入口 `finally` Restore。失败后若 Restore 未完成，必须 STOP 并报告临时根和 Host 状态；不得把未恢复环境描述为 PASS。
9. 纯移动必须保持文本语义；场景拆分只允许参数改为下文固定的 `runtime` 接口、import/export 和缩进变化。不得更改 request ID、call ID、状态读取时点、工具输入、race、timeout、assertion、result shape 或场景顺序。
10. 每步 PASS 后允许继续下一步；T15 完成前不得删除本 RUNBOOK。

### PASS

该步全部固定命令退出码为 0；输出满足该步客观断言；staged 路径与允许列表完全一致；`git diff --check` 退出码为 0；创建恰好一个符合 [Commit Rules](../00-governance/COMMIT-RULES.md) 的 commit。

### STOP

以下任一条件立即停止：起始分支或基线不符；出现用户已有改动；指定路径、symbol、selector 或脚本不存在；需要改变 DSH API、产品行为、协议、事件、持久化、权限、结果 shape、assertion label、timeout 或 Restore；需要新增依赖、registry、动态加载、scenario DSL、adapter、feature flag 或兼容层；验证失败且不能仅在该步允许文件内修复。

## 3. 目标、起点与终点

### 3.1 当前起点

- `plugin/package.json::scripts["smoke:profile"]` 执行 `node scripts/smoke-profile.mjs`。
- `plugin/scripts/smoke-profile.mjs::main` 拥有 CLI、临时目录、artifact、profile、Host 和 Restore。
- `plugin/scripts/smoke-profile.mjs::writeProbePackage` 使用 `String.raw` 生成临时 probe 的 `index.js`。
- 同一模板内包含 `apply`、`run`、共享 Agent/tool/status helper 和 12 个 selector。
- `plugin/scripts/smoke-environment.mjs::createSmokeEnvironment` 只被 smoke runner 和对应 unit spec 使用。
- `plugin/tests/unit/scripts/smoke-environment.spec.ts` 直接读取旧脚本路径并对 `decision-risk-closure` 做静态 contract 断言。
- [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md) 和 [DSH Smoke 操作说明](../50-operations/HOW-TO-DSH-SMOKE.md) 仍声明旧入口路径。

### 3.2 预期终点

```text
plugin/scripts/smoke-profile/
├── index.mjs
├── environment.mjs
├── result.mjs
└── probe/
    ├── index.js
    ├── support.js
    └── scenarios/
        ├── baseline.js
        ├── archive.js
        ├── completion.js
        ├── convergence.js
        ├── decision-risk-closure.js
        ├── isolation.js
        ├── mail.js
        ├── reassign.js
        ├── recovery.js
        └── risk-reopen.js
```

- 唯一外部命令入口为 `plugin/scripts/smoke-profile/index.mjs`。
- `plugin/package.json::scripts["smoke:profile"]` 固定为 `node scripts/smoke-profile/index.mjs`。
- `probe/index.js` 是临时安装到 DSH profile 的唯一函数插件入口，继续导出 `name`、`inject` 和 `apply`。
- `probe/index.js::runSelectedScenario(runtime)` 使用显式 `switch`；不建立 registry、动态 import 或配置化映射。
- `index.mjs::writeProbePackage` 使用 Node 22 `fs/promises.cp()` 把 `probe/` 复制到不存在的临时 `probeDir`，随后只写 `package.json` 和 `cordis.patch.yml`；不再拼接或写入 probe `index.js`。
- 每个 selector 的工具调用、状态读取、断言和 result 完整保留在唯一场景函数中。

## 4. Scope 与 Non-goals

### 4.1 Scope

1. 将 smoke runner、environment、probe 和场景收进独占目录。
2. 建立唯一 `index.mjs` 外部入口和唯一 `probe/index.js` DSH 插件入口。
3. 把共享且已有多个调用方的 helper 放入 `probe/support.js`。
4. 按 selector 分多次迁移场景，每个步骤独立真实 smoke、独立 commit。
5. 更新 package script、unit contract、实现设计和操作文档中的入口路径与最终目录结构。
6. 完成全部 12 个 selector、完整插件验证、文档链接和 diff 验证后删除本 RUNBOOK。

### 4.2 Non-goals

- 不修改 `plugin/src/**`、Client、协议、Schema、domain、repository、projection、runtime、HTTP 或 tool。
- 不改变任何产品状态、event、receipt、outbox、checkpoint、archive、恢复或权限语义。
- 不新增或删除 smoke selector，不更名 selector，不更改 assertion label。
- 不引入 scenario registry、DSL、动态加载、adapter、class hierarchy、feature flag、fallback、缓存、并发框架或新 npm dependency。
- 不重构 `plugin/scripts/verify-*.mjs`、`plugin/cordis.patch.yml`、package exports、发布 allowlist或测试配置。
- 不增加 metrics、stress、browser automation、远端访问、真实 LLM 或 provider 兼容范围。
- 不修复本任务执行中发现的产品缺陷；产品缺陷触发 STOP。

## 5. 真相源、接口与 Not Applicable

### 5.1 正式依据

- [Architecture](../00-governance/ARCHITECTURE.md)：插件保持单 package；真实 profile 验证 Loader、provider、Session 和 Restore；异步资源必须由唯一 lifecycle owner 释放。
- [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)：`plugin/scripts/` 是插件验证脚本位置，`smoke:profile` 使用 `web` profile 和 `spawn` provider。
- [DSH Smoke 操作说明](../50-operations/HOW-TO-DSH-SMOKE.md)：命令、成功条件、selector、失败报告和 Restore 是稳定运行契约。
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：历史 selector 证据只作为回归边界，不替代本次实际验证。
- 用户于 2026-09-03 确认：该独立脚本独占目录，外部只使用 `index.mjs`；按场景分次完成，每个 commit 控制改动量。

### 5.2 固定模块接口

`plugin/scripts/smoke-profile/index.mjs`：

```js
export { createSmokeEnvironment } from "./environment.mjs";
export { validateScenarioResult } from "./result.mjs";
export const SMOKE_SCENARIOS = [
  "baseline",
  "timeout",
  "reassign",
  "task-handraise",
  "completion-end",
  "risk-reopen",
  "decision-risk-closure",
  "cold-rebind",
  "archive-continuation",
  "mail-race",
  "cross-meeting",
  "convergence",
];
```

`plugin/scripts/smoke-profile/result.mjs` 唯一拥有并导出 `validateScenarioResult(value, expectedScenario)`；`index.mjs` import 它用于真实 smoke 结果检查，并从唯一外部入口 re-export 供 unit contract 使用。原 `decision-risk-closure` required assertion 集合与错误文本不变。

`plugin/scripts/smoke-profile/probe/index.js`：

```js
export const name = "convivium-smoke-profile-probe";
export const inject = [
  "agents",
  "sessions",
  "sessionPersistence",
  "subagents",
  "tools",
  "webServer",
  "workspaceRegistry",
];
export function apply(ctx) {}
async function runSelectedScenario(runtime) {}
```

`runSelectedScenario(runtime)` 的 `switch (runtime.scenario)` 固定映射：

| selector                | 唯一 producer function                    | 唯一文件                                   |
| ----------------------- | ----------------------------------------- | ------------------------------------------ |
| `baseline`, `timeout`   | `runBaselineScenario(runtime)`            | `probe/scenarios/baseline.js`              |
| `completion-end`        | `runCompletionEndScenario(runtime)`       | `probe/scenarios/completion.js`            |
| `task-handraise`        | `runTaskHandraiseScenario(runtime)`       | `probe/scenarios/completion.js`            |
| `convergence`           | `runConvergenceScenario(runtime)`         | `probe/scenarios/convergence.js`           |
| `decision-risk-closure` | `runDecisionRiskClosureScenario(runtime)` | `probe/scenarios/decision-risk-closure.js` |
| `cross-meeting`         | `runCrossMeetingScenario(runtime)`        | `probe/scenarios/isolation.js`             |
| `mail-race`             | `runMailRaceScenario(runtime)`            | `probe/scenarios/mail.js`                  |
| `reassign`              | `runReassignScenario(runtime)`            | `probe/scenarios/reassign.js`              |
| `cold-rebind`           | `runColdRebindScenario(runtime)`          | `probe/scenarios/recovery.js`              |
| `archive-continuation`  | `runArchiveContinuationScenario(runtime)` | `probe/scenarios/recovery.js`              |
| `risk-reopen`           | `runRiskReopenScenario(runtime)`          | `probe/scenarios/risk-reopen.js`           |

所有场景函数的签名固定为 `export async function <name>(runtime)`，成功时调用一次 `runtime.writeResult(...)` 并返回 `undefined`；失败时抛出原错误，由 `probe/index.js` 的唯一 `try/catch/finally` 写 `{ ok: false, error }` 和释放 Captain。

`plugin/scripts/smoke-profile/probe/support.js` 固定导出：

```js
export function validateColdCheckpoint(value) {}
export function createProbeSupport(outputPath) {}
```

`createProbeSupport(outputPath)` 返回以下现有 helper，名称和语义不变：`assert`、`callTool`、`callHttp`、`createInput`、`writeResult`、`observedMessages`、`messageText`、`messageTexts`。`writeResult` 继续使用 `outputPath + ".tmp"` 后 rename 的原子写入方式。

`plugin/scripts/smoke-profile/probe/cold-checkpoint.js` 不单独建立；`validateColdCheckpoint` 由 `support.js` 唯一拥有，runner 与 probe 都从该文件 import。runner 复制整个 `probe/` 后，临时 probe 内 import 路径不变。

`probe/index.js` 创建一个普通对象 `runtime`，不是 class、registry 或公共接口。字段固定为：

```text
ctx, scenario, browserMode, outputPath, workspace, participants,
coldPhase, coldCheckpointPath,
captain, setCaptain(value), meetingId, setMeetingId(value), nextCall(),
assert, callTool, callHttp, createInput, writeResult,
waitForAgent, waitForObservedParticipant, observedMessages,
messageText, messageTexts, recordInbox, waitForInbox,
resumeParticipantForProbe, waitForSpeakerContext, waitForTaskDelivery,
waitForStoredManagerContext, waitForCommittedMessages,
createSmokeAgent, registerSmokeAgent,
setColdMaintenance(release, promise), clearColdMaintenance(),
setMailMaintenance(release, promise), releaseMailMaintenance()
```

`captain` 和 `meetingId` 使用 getter，保证场景读取当前值；`setCaptain`/`setMeetingId` 是唯一写入口。`nextCall()` 返回当前 `nextCall` 后自增。两个 maintenance slot 保留现有 cold/mail 精确所有权，不改成通用任务框架；`apply()` disposer 继续按 cold 后 mail 顺序 release 并 await。

场景迁移的自由变量替换表固定如下：

| 原自由变量/操作            | 场景模块中的唯一替换                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `ctx`                      | `runtime.ctx`                                                                             |
| `scenario`                 | `runtime.scenario`                                                                        |
| `browserMode`              | `runtime.browserMode`                                                                     |
| `workspace`                | `runtime.workspace`                                                                       |
| `participants`             | `runtime.participants`                                                                    |
| 读取 `captain`             | `runtime.captain`                                                                         |
| 向全局 `meetingId` 赋值    | `runtime.setMeetingId(value)`，随后用同一 `value` 建立函数内 `const meetingId`            |
| `nextCall++`               | `runtime.nextCall()`                                                                      |
| 任一 §5.2 helper           | 同名 `runtime.<helper>`                                                                   |
| 设置 cold maintenance      | `runtime.setColdMaintenance(release, promise)`                                            |
| 设置/释放 mail maintenance | `runtime.setMailMaintenance(release, promise)` / `await runtime.releaseMailMaintenance()` |

场景文件不得 import 另一场景文件，不得直接读取 `process.env`；`cold-rebind` 现有 phase/checkpoint 环境值分别由 `runtime.coldPhase` 和 `runtime.coldCheckpointPath` 提供。

### 5.3 保持不变的外部结果

- selector 集合和顺序与 `SMOKE_SCENARIOS` 完全一致。
- 未知 selector 在 runner 抛 `Unsupported CONVIVIUM_SMOKE_SCENARIO`；probe guard 仍写 `SCENARIO_NOT_IMPLEMENTED:<selector>` 后返回。
- `validateScenarioResult` 的 `decision-risk-closure` required assertion 集合不变。
- `cold-rebind` 继续在同一临时环境和端口运行两个 Host phase，只在 phase 2 后执行最终 Restore。
- `BROWSER_MODE`、timeout 数值验证、credential 移除、pack/install/dump-config、日志尾部、signal stop 和临时根删除语义不变。

### 5.4 Not Applicable

- requirement/interface/schema/event/data migration：Not Applicable；本任务不改变产品或跨边界数据契约。
- repository/receipt/outbox/checkpoint/archive projection：Not Applicable；只移动其现有 smoke 消费者，不修改 producer。
- 新 readiness 文档：Not Applicable；本任务不改变产品 readiness 范围，验证由自动化测试、commit 和 PR CI 保存。现有 readiness 文件不写入新的产品结论。
- 安全权限：不新增权限；credential stripping、loopback Host 和临时目录删除 guard 必须原样保留。

## 6. 不变量

1. `plugin/scripts/smoke-profile/index.mjs` 是 `smoke:profile` 唯一命令入口；内部模块不加入 package scripts、exports 或发布 allowlist。
2. 临时 probe 仍是 `type: "module"`、`main: "index.js"`，patch row ID 和 package name 不变。
3. `apply()` 的 `ctx.on()` 与 `ctx.effect()` 继续由 probe fiber 拥有；不得移动到 runner。
4. 所有 tool call 使用现有 caller Agent、input、call ID 和 `AbortController().signal`。
5. 所有场景在相同节点重新读取 status；不得用前一 command result 替代现有 status read。
6. `driveParticipant` 的 selector 排除集合保持一致；timeout 对 `participant-a` 的特殊处理保持一致。
7. cold/mail maintenance 在 dispose 前达到静默；不得删除 release/await。
8. runner 的 Restore 只删除解析后位于 `tmpdir()` 且 basename 以 `convivium-dsh-smoke-` 开头的目录。
9. 每个场景只存在一个实现函数；迁移后必须从原模板删除完整旧 branch，不得保留 fallback 或兼容 branch。
10. 每个 commit 的生产行为是可运行的：旧模板与已迁移模块可以阶段共存，但同一 selector 不得存在两个可达实现。

## 7. 机械执行步骤

### T11：迁移 decision-risk-closure 场景

前置状态：前一提交已完成 T10 closure，工作树 clean。

允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/scenarios/decision-risk-closure.js`（新增）、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。

禁止修改：其他场景和产品源码。

执行：把完整 `runDecisionRiskClosureScenario(ctx)` 移为 `runDecisionRiskClosureScenario(runtime)`；仅把自由变量替换为 runtime 固定字段；内嵌 dispatcher 调用新 export；删除旧函数；unit 从新文件检查 supersede/revoke/replay/history/risk label。

验证：

```bash
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/decision-risk-closure.js tests/unit/scripts/smoke-profile.spec.ts --write
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts --reporter=dot
pnpm --dir plugin build
env CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure pnpm --dir plugin smoke:profile
pnpm --dir plugin exec eslint scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/decision-risk-closure.js tests/unit/scripts/smoke-profile.spec.ts
git diff --check
git add -- plugin/scripts/smoke-profile/index.mjs plugin/scripts/smoke-profile/probe/scenarios/decision-risk-closure.js plugin/tests/unit/scripts/smoke-profile.spec.ts
git diff --cached --name-only
git commit -m "Refactor(plugin/smoke): 拆分决策风险闭环场景"
```

PASS：真实 smoke 输出现有 9 个 decision/risk assertion label；history/current/pending/risk/blocking/replay 观察值不变；事件顺序仍明确为 command/status 不可观察。

STOP：任何 Decision/risk tool input、status 读取、replay version、history 顺序或 result shape 变化。

### T12：迁移 convergence 场景

前置状态：前一提交已完成 T11 closure，工作树 clean；`runConvergenceScenario(ctx)` 仍是 probe 模板内唯一实现，`convergence` selector 已在 allowlist 中。

允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/scenarios/convergence.js`（新增）、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。

禁止修改：其他场景文件、A 已迁移的 domain/runtime 产品代码、`result.mjs` 的 convergence contract。

执行：把完整 `runConvergenceScenario(ctx)` 移为 `runConvergenceScenario(runtime)`；仅把自由变量替换为 runtime 固定字段；dispatcher 调用新 export；删除旧函数；保留 deterministic fallback、replay equality/version 和三个原 assertion label；unit 锁定唯一 call 与三个 label。

验证：

```bash
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/convergence.js tests/unit/scripts/smoke-profile.spec.ts --write
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts --reporter=dot
pnpm --dir plugin build
env CONVIVIUM_SMOKE_SCENARIO=convergence pnpm --dir plugin smoke:profile
pnpm --dir plugin exec eslint scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/convergence.js tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
git diff --check
git add -- plugin/scripts/smoke-profile/index.mjs plugin/scripts/smoke-profile/probe/scenarios/convergence.js plugin/tests/unit/scripts/smoke-profile.spec.ts plugin/tests/unit/scripts/smoke-profile-contract.spec.ts
git diff --cached --name-only
git commit -m "Refactor(plugin/smoke): 拆分收敛场景"
```

PASS：真实 smoke 输出 `deterministic-fallback`、`fallback-replay-idempotent`、`fallback-status-projected`；fallback result 与 replay result 的 JSON 和 meetingVersion 相等。

STOP：fallback、replay、status projection、assertion label 或 result shape 变化。

### T13：迁移 baseline 与 timeout 场景

前置状态：前一提交已完成 T12 closure，工作树 clean；generic baseline/timeout flow 仍在模板尾部。

允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/scenarios/baseline.js`（新增）、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。

禁止修改：其他场景和产品源码。

执行：把 browser setup 后的共享 baseline/timeout flow 移为 `runBaselineScenario(runtime)`；保留 `runtime.scenario === "timeout"` 分支、participant driver 和 HTTP pause/resume；删除旧 flow；unit 锁定 `baseline`/`timeout` 两 case 指向同一函数且各只有一个 case。

验证：

```bash
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/baseline.js tests/unit/scripts/smoke-profile.spec.ts --write
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts --reporter=dot
pnpm --dir plugin build
pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile
pnpm --dir plugin exec eslint scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/scenarios/baseline.js tests/unit/scripts/smoke-profile.spec.ts
git diff --check
git add -- plugin/scripts/smoke-profile/index.mjs plugin/scripts/smoke-profile/probe/scenarios/baseline.js plugin/tests/unit/scripts/smoke-profile.spec.ts
git diff --cached --name-only
git commit -m "Refactor(plugin/smoke): 拆分基础与超时场景"
```

PASS：baseline 输出 `baseline-transcript-acb`、`baseline-http-pause-resume`；timeout 输出 `probe.scenario: "timeout"`、transcript `CB`、旧 Agent 非 resident、durable child inactive、drain 早于下一 speaker submit；两个命令 Restore PASS。

STOP：baseline transcript/HTTP 或 timeout drain/order 语义变化。

### T14：外置最终 probe 入口

前置状态：前一提交已完成 T13 closure，工作树 clean；模板内只剩 probe plugin 入口、runtime/stateful helper、dispatcher 和 lifecycle cleanup；所有场景已在模块中。

允许修改：`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/index.js`（新增）、`plugin/tests/unit/scripts/smoke-profile.spec.ts`、`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`。

禁止修改：`probe/support.js`、全部场景文件、产品源码、package/docs。

执行：

1. 把剩余模板源码原样移动为 `probe/index.js`，使用最终显式 `switch` 和 static imports。
2. `writeProbePackage` 删除 `String.raw` 与 `writeFile(join(probeDir, "index.js"), ...)`，只 recursive copy source probe 后写 manifest 和 patch。
3. 删除 runner 对 probe 内部函数的注入；runner 仍从 `support.js` import `validateColdCheckpoint`。
4. unit 断言 runner 不含 `String.raw`，probe index 对 12 个 selector 各有唯一 case，全部场景 export 路径存在，未知 selector fail closed。
5. Implementation Design 的 script tree 替换为 §3.2 最终目录树，不改其他设计 section。
6. format、验证、stage 后 commit `Refactor(plugin/smoke): 固化独立 probe 插件入口`。

验证：

```bash
pnpm --dir plugin exec prettier scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/index.js tests/unit/scripts/smoke-profile.spec.ts ../docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md --write
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts --reporter=dot
pnpm --dir plugin build
pnpm --dir plugin smoke:profile
pnpm --dir plugin exec eslint scripts/smoke-profile/index.mjs scripts/smoke-profile/probe/index.js tests/unit/scripts/smoke-profile.spec.ts
test "$(rg -n 'String\.raw|writeFile\([^\n]*index\.js' plugin/scripts/smoke-profile/index.mjs | wc -l | tr -d ' ')" = "0"
git diff --check
git add -- plugin/scripts/smoke-profile/index.mjs plugin/scripts/smoke-profile/probe/index.js plugin/tests/unit/scripts/smoke-profile.spec.ts docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md
git diff --cached --name-only
git commit -m "Refactor(plugin/smoke): 固化独立 probe 插件入口"
```

PASS：unit/build/baseline smoke PASS；无嵌入 probe 源码；临时 package 从复制的 `probe/index.js` 加载；Implementation Design 与最终目录一致；cached 仅 4 个允许文件。

STOP：Loader 无法解析多文件 probe、copy 布局错误、出现重复 dispatcher/fallback 或需改 DSH profile。

### T15：完整验证与 RUNBOOK 收口

前置状态：前一提交已完成 T14 closure；工作树 clean；最终文件树与 §3.2 完全一致；无旧入口引用。

允许修改：`docs/30-designs/RUNBOOK-COMPONENTIZE-SMOKE-PROFILE.md`（删除）。

禁止修改：其他全部文件。验证失败时禁止修改任何文件。

执行：

1. 运行完整插件验证。
2. build 后按固定顺序运行 12 个真实 selector；首次失败立即停止后续 selector。
3. 检查旧路径、嵌入 probe、重复 selector、相对文档链接和 diff。
4. 全部 PASS 后删除本 RUNBOOK，确认没有 RUNBOOK 引用，再次运行文档路径与 diff 检查。
5. stage 仅 RUNBOOK 删除，commit `Docs(repo): 收口 smoke profile 组件化手册`。

验证：

```bash
pnpm --dir plugin verify
pnpm --dir plugin build
pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=task-handraise pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=completion-end pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=risk-reopen pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=archive-continuation pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=convergence pnpm --dir plugin smoke:profile
test ! -e plugin/scripts/smoke-profile.mjs
test ! -e plugin/scripts/smoke-environment.mjs
test "$(rg -n 'plugin/scripts/smoke-profile\.mjs|scripts/smoke-profile\.mjs' docs plugin/package.json plugin/tests plugin/scripts --glob '!RUNBOOK-COMPONENTIZE-SMOKE-PROFILE.md' | wc -l | tr -d ' ')" = "0"
test -f docs/30-designs/../00-governance/ARCHITECTURE.md
test -f docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md
test -f docs/30-designs/../50-operations/HOW-TO-DSH-SMOKE.md
test -f docs/30-designs/../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
git diff --check
# 使用 apply_patch 删除 docs/30-designs/RUNBOOK-COMPONENTIZE-SMOKE-PROFILE.md
test "$(rg -n 'RUNBOOK-COMPONENTIZE-SMOKE-PROFILE|组件化 DSH Smoke Profile' . --glob '!plugin/node_modules/**' --glob '!plugin/lib/**' | wc -l | tr -d ' ')" = "0"
git diff --check
git add -- docs/30-designs/RUNBOOK-COMPONENTIZE-SMOKE-PROFILE.md
git diff --cached --name-only
git commit -m "Docs(repo): 收口 smoke profile 组件化手册"
```

PASS：`pnpm verify` PASS；12 个 smoke 全部满足各自固定结果且 Restore PASS；旧路径和嵌入源码扫描为 0；相对链接存在；RUNBOOK 删除后无引用；最终 commit 仅删除 RUNBOOK。

STOP：完整验证或任一 smoke 失败；真实 provider/package 不可访问；Restore 失败；扫描发现旧路径/重复入口；需要修改允许范围外文件；未获得 commit 授权。

## 8. 验证矩阵

| 风险/能力                        | focused evidence           | full evidence         | PASS                                                 |
| -------------------------------- | -------------------------- | --------------------- | ---------------------------------------------------- |
| credential stripping             | `smoke-profile.spec.ts`    | `pnpm verify`         | inherited/override `DEEPSEEK_API_KEY` 均删除         |
| selector allowlist/unknown guard | `smoke-profile.spec.ts`    | 12 个 smoke           | 12 个固定 selector；未知值 fail closed               |
| runner→probe copy/Loader         | baseline smoke             | 每个 smoke            | temp probe 多文件 import 成功，profile/provider 固定 |
| baseline/timeout                 | T13 两命令                 | T15 重跑              | ACB/HTTP 与 timeout drain 顺序不变                   |
| reassign                         | T6                         | T15                   | 4 个原 label                                         |
| task/completion                  | T9、T10                    | T15                   | task 5 个、completion 4 个原 label                   |
| risk/decision                    | T3、T11                    | T15                   | risk 3 个、decision/risk 9 个原 label                |
| cold/archive                     | T7、T8                     | T15                   | cold 5 个、archive 4 个原 label                      |
| mail/isolation                   | T4、T5                     | T15                   | mail 4 个、isolation 4 个原 label                    |
| lifecycle cleanup                | 每个真实 smoke             | T15                   | Host stop、maintenance 静默、temp root 删除          |
| static/type/build/package        | 每步 ESLint/Prettier/build | `pnpm verify`         | 全部退出 0                                           |
| docs/path                        | T1 path checks             | T15 scans/link checks | 无旧入口；所有相对链接存在                           |

非法产品输入、caller authority、stale version、terminal immutability、receipt conflict、transaction rollback、recovery 和 archive 本身不由本重构新增测试；它们由现有场景原断言和 `pnpm verify` 回归覆盖。本任务不得改变或弱化这些测试。

## 9. 双向追踪

| Scope                        | 实现步骤 | focused 验证    | full 验证 |
| ---------------------------- | -------- | --------------- | --------- |
| 独占目录与唯一入口           | T1       | unit + baseline | T15       |
| probe copy/support 边界      | T2、T14  | unit + baseline | T15       |
| risk/mail/isolation/reassign | T3–T6    | 对应 selector   | T15       |
| recovery/archive             | T7–T8    | 对应 selector   | T15       |
| completion/task              | T9–T10   | 对应 selector   | T15       |
| decision/risk closure        | T11      | 对应 selector   | T15       |
| convergence                  | T12      | 对应 selector   | T15       |
| baseline/timeout             | T13      | 两 selector     | T15       |
| 文档与临时手册收口           | T1、T15  | path/link/diff  | T15       |

T0 仅固化本 RUNBOOK；T1–T14 每一步都由上述 Scope 授权，没有步骤修改 Non-goals。T15 只验证和删除临时文档。

## 10. 完成定义与删除条件

只有以下条件全部成立，T15 才能删除本 RUNBOOK：

1. 最终目录与 §3.2 完全一致，旧两个顶层 smoke 文件不存在。
2. package、设计和操作文档只引用新入口。
3. probe 不再由字符串生成；`probe/index.js` 是唯一 DSH plugin entry。
4. 12 个 selector 各有唯一静态 dispatcher case 和唯一场景 producer。
5. 每个 T1–T14 都是独立 commit，且其 focused smoke 已 PASS。
6. `pnpm --dir plugin verify` 和 T15 的 12 个真实 smoke 全部 PASS。
7. Restore、旧路径扫描、相对链接和 `git diff --check` PASS。
8. 没有产品行为、接口或 readiness 结论需要迁移；Implementation Design 与操作说明已保存本任务唯一长期结构结论。

任一条件不满足时保留 RUNBOOK，结论为未完成；不得创建“completed”副本或归档文件。

## 11. Audit

- Required Structure：PASS；状态、执行者契约、目标、断点、Scope、真相源、接口、文件/symbol、不变量、步骤、验证、收口齐全。
- Decision Completeness：PASS；最终目录、唯一入口、module/function 名、static dispatcher、runtime 字段、复制方式和 commit 边界固定。
- Task Granularity：PASS；每个 selector 或共享基础边界独立步骤、独立真实 smoke、独立 commit；最大行为迁移为现有单一场景函数。
- Traceability：PASS；工程结构依据→设计/操作文档→脚本入口/module→unit/selector→full verify→收口可双向追踪。
- Failure/Recovery：PASS；首次失败 STOP、禁止放宽、build-current-source、Host/temp Restore 和 maintenance 静默明确。
- Scope Economy：PASS；没有 registry、DSL、动态加载、adapter、新依赖或产品改动；共享 seam 只有多个现有场景共同消费的 helper/runtime。
- Documentation/Readiness：PASS；长期结构进入 Implementation Design 和操作说明；产品 readiness 不变并明确 Not Applicable；删除条件完整。
- Author 实际验证：2026-09-03 在起始 HEAD 执行 `smoke-environment.spec.ts`，1 file/4 tests PASS；`pnpm --dir plugin format:check` PASS；`pnpm --dir plugin lint` PASS；`git diff --check` PASS。
- Not Covered：Author 阶段未运行 build、真实 DSH smoke、`pnpm verify`；这些是 Execute 的 T1–T14 强制门禁，不被描述为已通过。

Audit 结论：`Executable`。
