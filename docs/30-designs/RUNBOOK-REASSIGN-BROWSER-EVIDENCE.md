# RUNBOOK：FR-11 Reassign 浏览器证据闭环

状态：`Executable`

产品/正式文档基线：`b82f38f94697d5f77e81ab7e7757f8f091ae737c`

RUNBOOK 固化提交不改变产品/正式文档基线。T0 允许当前 HEAD 等于该 baseline，或当前 HEAD 相对该 baseline 只新增本文且工作树 clean。

## 1. 执行者契约

本文只补齐现有 loopback Client `Skip current speaker` 控制的真实浏览器证据，不修改 reassign/skip 产品语义。执行者必须从 T0 开始顺序执行；每一步只能修改允许文件和指定 symbol，全部验证 PASS 后才能进入下一步。

任何正式契约、现有生产 symbol、测试命令或浏览器可观察入口与本文不一致时必须 STOP。不得通过修改 production Client、HTTP、Runtime、protocol、repository、DSH adapter，放宽 Schema/断言，新增 Playwright/Cypress 依赖，或把非浏览器 smoke 描述成浏览器证据来继续。

执行本文不授权 commit、push、PR、merge 或修改其他仓库。后续如获得独立提交授权，按 [`COMMIT-RULES.md`](../00-governance/COMMIT-RULES.md) 一步一提交；本文自身不提供该授权。

## 2. 目标与完成状态

完成以下闭环：

1. `CONVIVIUM_SMOKE_SCENARIO=reassign` 在普通模式保持既有完整 replacement 生命周期、result validation 行为和四个 assertion labels。
2. 同一 selector 在 `CONVIVIUM_SMOKE_BROWSER_MODE=1` 时建立一个稳定的、尚有 current SpeakerAttempt 的 Meeting，随后把真实 DSH Browser Host 交给操作者。
3. 操作者从 Convivium Meeting panel 选择该 Meeting，填写理由并点击现有 `Skip current speaker`；Client 调用正式 `/reassign` route 的 `action: "skip"` 分支并重新读取状态。
4. 浏览器可观察到写操作成功、当前 attempt 不再可操作、状态来自重新读取的已提交 projection。
5. wrapper 收到终止信号后停止 Host 并删除自己的临时 root；readiness 只记录实际观察到的结果。
6. 完整验证通过，长期证据进入 readiness，本文删除。

本文不会让 Client 执行 `action: "reassign"`。现有 Meeting status 不公开可供选择的 replacement Participant 集合，现有 Client 也只定义 `Skip current speaker`。replacement action 的 Runtime、drain、replacement submission 与 transcript 保留继续由普通 `reassign` profile smoke 验证；新增 replacement picker 属于未获接口授权的产品设计。

## 3. 正式依据与当前断点

### 3.1 追踪依据

- [`MEETING-ORCHESTRATION-REQUIREMENTS.md`](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-9.6、FR-11.3、AC 3：旧 attempt 在撤销或重分配后不得修改会议；本地用户必须能在适用入口控制当前发言权。
- [`AGENT-MEETING-PROTOCOL-INTERFACE.md`](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) `ReassignTurnInputV1`、Meeting Web routes：`POST /api/convivium/meetings/:meetingId/reassign` 是唯一 loopback Web 边界；`action="skip"` 禁止 `replacementParticipantId`。
- [`MEETING-ORCHESTRATION-DESIGN.md`](./MEETING-ORCHESTRATION-DESIGN.md) Projection And Frontend、V1 HTTP boundary：Client 写成功后重新读取完整 projection；Client 不成为事实源。
- [`CURRENT-IMPLEMENTATION-COVERAGE.md`](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) FR-11 与 Not Covered：已有 Client/HTTP control 和普通 `reassign` smoke，但没有 browser-ready fixture 与 browser evidence。
- [`DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`](../40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md) G4 与 Scope gaps：已有 pause/resume/end 浏览器证据；reassign 浏览器证据仍为 `Not Covered`。

### 3.2 已核对的当前实现

| 能力                        | 当前 owner / symbol                                                                              | 当前事实                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| browser wrapper             | `plugin/scripts/smoke-profile/index.mjs::main`                                                   | build、pack、安装真实 rc.2 profile；读到 probe result 后打印 URL；browser mode 等待 SIGINT/SIGTERM；finally restore temp root |
| scenario dispatch           | `plugin/scripts/smoke-profile/probe/index.js::runSelectedScenario`                               | `reassign` 只有一个 `runReassignScenario(runtime)` branch                                                                     |
| ordinary reassign lifecycle | `plugin/scripts/smoke-profile/probe/scenarios/reassign.js::runReassignScenario`                  | replacement action、旧 Activation drain、replacement submit、transcript 断言已存在                                            |
| browser workspace           | `plugin/scripts/smoke-profile/probe/index.js::run`                                               | browser mode 创建 workspace；scenario 负责把 Captain Session attach 到 workspace                                              |
| result validation           | `plugin/scripts/smoke-profile/result.mjs::validateScenarioResult`                                | 当前未对 `reassign` assertion set 做 exact validation                                                                         |
| Client control              | `plugin/src/client/meeting-panel.tsx::ConviviumMeetingPanel`、`controlMeeting`                   | current attempt 可见时显示 `Skip current speaker`；发送 `action:"skip"`；成功后调用 `refreshSelectedMeeting`                  |
| route                       | `plugin/src/http/index.ts::meetingHttpPlugin`                                                    | `/reassign` 校验正式 Schema 并调用 `reassignLocalTurn`                                                                        |
| focused contracts           | `plugin/tests/client/client-entry.client.spec.ts`、`plugin/tests/contract/http-boundary.spec.ts` | 已固定 exact skip body、URL、refetch 和 HTTP boundary                                                                         |
| smoke source contract       | `plugin/tests/unit/scripts/smoke-profile.spec.ts`                                                | 已固定唯一 reassign dispatcher 和普通四 labels，尚无 browser-ready branch contract                                            |

T0 Author baseline 实际运行：

```text
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/client/client-entry.client.spec.ts tests/contract/http-boundary.spec.ts
3 files passed; 53 tests passed
```

## 4. Scope

### 4.1 In scope

- 为既有 `reassign` selector 增加 test-only browser-ready 分支。
- 只对新增 browser-ready result shape 做完整 validation；普通 result validation 行为不变。
- 固定 browser-ready source contract 与现有 Client/HTTP contract。
- 使用真实 built package、DSH rc.2 web profile、spawn provider和 Browser UI 执行一次 skip。
- 记录实际 browser、cleanup 和普通 replacement smoke 证据。

### 4.2 Non-goals

- 不新增 replacement Participant picker，不让 Client 发送 `action:"reassign"`。
- 不修改 reassign/skip transition、Runtime、HTTP route、protocol DTO/Schema/result、repository、receipt、event、outbox、projection 或 recovery。
- 不新增 scenario selector、runner、registry、adapter、browser automation framework、package dependency、profile 或 feature flag。
- 不修改 Decision/risk control、FR-13 Catalog/attendance、FR-14 Definition、Scribe、Developer Markdown、metrics、stress 或发布流程。
- 不依赖 C 的 Developer Markdown 实现、测试、RUNBOOK、commit 或 readiness 结论；不修改 Developer Markdown generator、scheduler、workspace path、`current.md`、`archive.md` 或其测试。
- 不把普通 smoke 的 replacement action、Activation drain 或 transcript 断言复制进 browser-ready branch。
- 不修改 A/C 仓库。

## 5. Test-only contract

### 5.1 普通 reassign result

`runReassignScenario(runtime)` 在 `runtime.browserMode === false` 时保持当前行为，返回：

```ts
interface OrdinaryReassignSmokeResult {
  ok: true;
  scenario: "reassign";
  browserReady?: never;
  assertions: readonly [
    "old-attempt-revoked",
    "old-activation-drained",
    "replacement-attempt-submitted",
    "transcript-preserved",
  ];
  meetingId: string;
  observed: Record<string, unknown>;
}
```

字段内容、lifecycle 和现有 `validateScenarioResult` 行为全部不修改。普通路径的四个 labels 继续由 scenario 内部断言、现有 source contract 和真实 profile smoke覆盖；本任务不顺带收紧普通 result validator。

### 5.2 browser-ready reassign result

`runReassignScenario(runtime)` 完成 Meeting create、Manager plan 和 current attempt status read 后，在调用 `convivium_reassign_turn` 之前检查 `runtime.browserMode`。为 true 时：

1. 使用 `runtime.captain.agent.session` 调用现有 `ctx.sessions.flush`。
2. 调用已由 `probe/index.js::run` 创建的 `runtime.workspace.attachSession(runtime.captain.agent.session.id)`；`runtime.workspace` 缺失必须抛错，禁止另建 workspace。
3. 断言 status 为 `running`，`currentSpeakerId === "participant-a"`，`currentAttemptId === oldAttemptId`。
4. 写入并立即 return 以下 exact result，不调用 reassign tool、不提交 Participant message、不结束 Meeting：

```ts
interface BrowserReadyReassignSmokeResult {
  ok: true;
  scenario: "reassign";
  browserReady: true;
  assertions: readonly ["browser-reassign-ready"];
  meetingId: string;
  observed: {
    oldAttemptId: string;
    currentSpeakerId: "participant-a";
    currentAttemptId: string;
    meetingVersion: number;
  };
}
```

`meetingVersion` 来自最后一次成功 `convivium_meeting_status` envelope；两个 attempt ID 必须相等。此对象仅供 smoke wrapper 判定 fixture ready，不进入产品协议、Meeting state 或 package exports。

### 5.3 result validator

`plugin/scripts/smoke-profile/result.mjs::validateScenarioResult` 只增加以下窄分支：

- 当 `expectedScenario === "reassign" && value.browserReady === true` 时，`assertions` 必须精确等于 `["browser-reassign-ready"]`，且 5.2 的 `meetingId`、`observed` 字段类型和值关系全部成立。
- 其他输入继续走当前 common validation；不得增加普通 reassign 专用 branch，不得改变其他 selector 行为。

browser-ready result 的任一额外、缺失或乱序 label，以及 malformed observation，抛出 `Reassign browser-ready result is invalid.`。不得建立普通 reassign validator、通用 result Schema、validator registry 或 compatibility branch。

### 5.4 浏览器可观察断言

浏览器只验证已有产品表面：

1. Meeting list 出现 `Runtime smoke (running)`。
2. 选择该项后，Meeting summary 显示 `running`、当前 Speaker 为 `participant-a`，并显示 `Skip current speaker` 与 `Skip reason`。
3. `Skip reason` 为空时按钮 disabled；输入 `Browser reassign evidence` 后 enabled。
4. 点击一次；成功 refetch 后旧 `Skip current speaker` 控制消失，且页面无 `role=alert`。写入期间的瞬时 disabled 状态由既有 Client component test 固定，不要求人工浏览器依赖网络时序观察。
5. 页面刷新后仍不重新出现旧 attempt 控制，证明展示来自已提交状态而非仅本地 state。

普通 smoke 已负责证明 `action:"reassign"` 的 replacement、drain、submission 和 transcript；浏览器步骤不得把 5.4 外的内部状态描述为浏览器观察结果。

## 6. 不变量和所有权

1. production files 在整个任务中零 diff。
2. ordinary reassign scenario 的调用顺序、request、四 labels、observable result和validator行为保持不变。
3. browser-ready branch 只暂停在 command 前；它不伪造 command success。
4. browser write 使用 Client 现有 `crypto.randomUUID()` request ID、status version/current attempt和固定 HTTP Schema；fixture不注入 body。
5. Browser Host 与 temp root 只有 wrapper 拥有；失败和成功都必须发送 SIGINT，并观察 cleanup marker 与路径消失。
6. readiness 只记录本次实际命令、日期、基线/分支 commit和观察结果；未观察内部 drain/replacement不得写成 browser PASS。
7. A 的 FR-13 会修改 Meeting status shape时，B 不预建 attendance fixture字段；B browser读取真实运行状态，没有复制 A DTO。
8. C 线与 B 线没有共享 production 或 test symbol。两线可以各自运行 `pnpm --dir plugin verify`，但验证命令不产生文件所有权或实施依赖。
9. `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 是同文件分符号所有：B 只修改 FR-11 行、G4 中 reassign browser evidence 和 Not Covered 中 reassign browser 句子；C 只可拥有 FR-10/Developer Markdown 对应文字。B 不重排表格或改写 C 的条目。
10. `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` 中 B 只修改 G4 与 Scope gaps 的 reassign browser 句子。若执行时 C 或其他分支已修改这些 exact 句子，T2 必须 STOP 并报告 diff；执行者不得选择覆盖顺序或手工合并语义。

## 7. 双向追踪

| 行为                            | requirement / acceptance | interface / design                        | owner                                   | focused test              | full / readiness         |
| ------------------------------- | ------------------------ | ----------------------------------------- | --------------------------------------- | ------------------------- | ------------------------ |
| browser-ready current attempt   | FR-11.3                  | existing Client control and smoke wrapper | T1 `runReassignScenario`                | `smoke-profile.spec.ts`   | T2 real browser          |
| exact skip request/refetch      | FR-9.6、FR-11.3、AC 3    | `ReassignTurnInputV1`、Web route          | existing production; T0 regression only | client + HTTP specs       | T2 browser observation   |
| replacement lifecycle preserved | FR-9.6、AC 3             | tool/runtime design                       | existing ordinary reassign scenario     | T1 result validator       | T1 real profile smoke    |
| cleanup                         | architecture lifecycle   | smoke wrapper restore                     | existing `main` finally                 | existing source contract  | T2 marker/path assertion |
| readiness truthfulness          | readiness governance     | G4 / Scope gaps                           | T2 docs                                 | relative links / Prettier | T3 full verify           |

没有步骤实现新的产品行为。T1 的单一工程判断是“同一 reassign smoke 以受校验的 test-only result 暴露 browser-ready 模式”；T2 的单一工程判断是“真实 Browser 结果足以消除 readiness 缺口”；T3 的单一工程判断是“全部证据满足关闭条件并删除临时 RUNBOOK”。

## 8. 机械实施步骤

### T1：建立 reassign browser-ready fixture

前置状态：完成提交 `46322a796ab35e67dbff2a403f7aa3fc5001440c` 已包含修正后的 T0 基线与边界复核，且 T0 focused 验证 PASS；基线 contracts 未变化。

允许修改：`plugin/scripts/smoke-profile/probe/scenarios/reassign.js::runReassignScenario`；`plugin/scripts/smoke-profile/result.mjs::validateScenarioResult` 的 browser-ready窄分支；`plugin/tests/unit/scripts/smoke-profile.spec.ts` 的 reassign source/result contract cases；本文 T1 章节。

禁止修改：`plugin/scripts/smoke-profile/index.mjs`、`probe/index.js`、其他 scenario/support；全部 `plugin/src/**`；其他 tests；package/lock/profile。

执行：

1. 按 5.2 在现有 `oldAttemptId` 和 `replacementParticipantId` 校验之后、第一次 `convivium_reassign_turn` 之前增加唯一 browser-ready branch。普通路径代码保持原顺序。
2. 在 `smoke-profile.spec.ts` 的现有 reassign source case 中静态断言：browser-ready label和`runtime.browserMode` branch存在；branch source位置早于第一次`convivium_reassign_turn`；ordinary tool调用仍恰好一次；现有普通四labels source assertions保持不变。
3. 按5.3增加唯一browser-ready validator窄分支；普通reassign和其他selector继续走现有common validation。
4. 在`smoke-profile.spec.ts`直接调用`validateScenarioResult`，覆盖一个完整5.2 object，以及缺失、额外、乱序labels、top-level/`observed`额外key和以下逐项malformed observation：空`meetingId`、空attempt ID、非`participant-a` speaker、两个attempt ID不等、非整数或负数`meetingVersion`。
5. 运行普通真实reassign smoke，证明该工程判断未改变普通replacement lifecycle和result。

验证：

```bash
pnpm --dir plugin exec prettier --write scripts/smoke-profile/probe/scenarios/reassign.js scripts/smoke-profile/result.mjs tests/unit/scripts/smoke-profile.spec.ts
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts tests/client/client-entry.client.spec.ts tests/contract/http-boundary.spec.ts
pnpm --dir plugin build
CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
pnpm --dir plugin exec eslint scripts/smoke-profile/probe/scenarios/reassign.js scripts/smoke-profile/result.mjs tests/unit/scripts/smoke-profile.spec.ts
git diff --check
```

PASS：全部退出0；source contract证明browser branch位置、唯一ordinary tool调用和既有四labels；新增validator接受唯一完整browser-ready object并拒绝每个malformed case；ordinary smoke输出`ok=true`、`scenario=reassign`和既有四labels，result无`browserReady`；Client/HTTP regressions与build通过；diff只含三个允许的script/test文件和本文。

STOP：browser-ready contract必须修改runner/dispatcher/product，validator必须改变普通result行为，ordinary source labels/tool调用发生改变，ordinary smoke、Client/HTTP regression或build失败，或只能通过放宽malformed断言继续。报告失败命令、首个test title、probe error、stdout/stderr tail和diff；不得修改产品代码或拆出通用validator框架。

失败恢复：真实smoke只使用wrapper创建的临时DSH_HOME/workspace并由finally删除；若命令失败，先确认无残留child process和输出中的temp root已删除，再保留T1现场。

### T2：执行真实浏览器 skip 并迁移证据

前置状态：T1 PASS；ordinary reassign真实 smoke通过；browser-ready fixture尚未写入长期证据；C 线没有修改第6节第9至10项分配给B的exact readiness条目；当前执行环境提供能够打开真实URL、读取可访问名称、输入、点击和刷新页面的Browser控制能力。

允许修改：`docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md` G4与Scope gaps；`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` FR-11、G4和Not Covered；本文T2章节。

禁止修改：全部 production/test/script/package/lock；其他 docs；A/C仓库。

执行：

1. 在独立 terminal 运行：

```bash
CONVIVIUM_SMOKE_BROWSER_MODE=1 CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
```

2. 解析 stdout 中 wrapper 输出的 JSON，断言 `.ok === true`、`.probe.browserReady === true`、`.probe.assertions` 精确等于 `["browser-reassign-ready"]`；随后等待 `CONVIVIUM_SMOKE_BROWSER_URL=` 和 `CONVIVIUM_SMOKE_TEMP_ROOT=`。缺一立即 STOP；不要打开猜测 URL。
3. 使用 stdout 的 exact URL 打开 Browser。按 5.4 顺序完成选择、空理由disabled、输入、单击、refetch、无alert和刷新断言；每项只操作一次。
4. 返回 terminal 发送一次 SIGINT；等待 wrapper退出0并输出`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。用 stdout的exact temp root运行`test ! -e '<exact path>'`。
5. 只把实际观察结果写入两份readiness：记录日期、starting HEAD/T1完成边界、完整命令、ordinary smoke与browser smoke的不同断言、cleanup。删除“reassign无browser-ready fixture/browser evidence”的Not Covered句子；Decision/risk controls、metrics和其他Not Covered保持原文。

验证：

```bash
pnpm --dir plugin exec prettier --check ../docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

PASS：真实浏览器五项断言成立；wrapper退出0、cleanup marker出现、exact temp root不存在；文档命令退出0；readiness未声称浏览器观察了replacement/drain/transcript；diff仅含T1三个script/test文件、两份readiness和本文。

STOP：Browser控制能力缺失、URL前fixture已推进、控件缺失、POST失败、refetch后旧attempt仍可操作、刷新回退、wrapper不退出0、temp root残留、证据只能靠推断，或B-owned readiness exact条目已有并行修改。报告缺失能力、UI可见文本、terminal tail、temp path或readiness diff；不得以jsdom/HTTP调用替代Browser，不得修改product或覆盖C的内容来修复证据步骤。

失败恢复：无持久Host数据；无论PASS/STOP都先SIGINT并验证temp root删除。未完成五项断言时不得修改readiness。

### T3：完整验证与删除 RUNBOOK

前置状态：T2 PASS；两份readiness只记录真实证据；T0至T2所有focused验证仍通过。

允许修改：本文整体删除。

禁止修改：production、tests、scripts、readiness和其他文档。

执行：

1. 运行第一组完整验证；失败时保留本文。
2. 核对 scope双向追踪、Not Covered和git范围。
3. 确认没有其他文档引用本文文件名或标题后删除本文。
4. 运行删除后检查。失败时只恢复本文并STOP。

验证：

```bash
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
git diff --check
```

```bash
test -z "$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | rg -v '^(plugin/scripts/smoke-profile/(result\.mjs|probe/scenarios/reassign\.js)|plugin/tests/unit/scripts/smoke-profile\.spec\.ts|docs/40-readiness/(CURRENT-IMPLEMENTATION-COVERAGE|DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE)\.md|docs/30-designs/RUNBOOK-REASSIGN-BROWSER-EVIDENCE\.md)$')"
! rg -n 'RUNBOOK-REASSIGN-BROWSER-EVIDENCE|RUNBOOK：FR-11 Reassign 浏览器证据闭环' docs --glob '*.md' --glob '!30-designs/RUNBOOK-REASSIGN-BROWSER-EVIDENCE.md'
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

```bash
test ! -e docs/30-designs/RUNBOOK-REASSIGN-BROWSER-EVIDENCE.md
ruby -e 'files=Dir["docs/**/*.md"]; bad=[]; files.each{|p| File.read(p).scan(/\[[^\]]+\]\(([^)]+)\)/).flatten.each{|x| next if x =~ /^(https?:|#)/; f=x.split("#",2)[0]; bad << "#{p}: #{x}" unless File.exist?(File.expand_path(f,File.dirname(p)))}}; abort("missing links:\n#{bad.join("\n")}") unless bad.empty?'
git diff --check
```

PASS：全部命令退出0；普通reassign真实smoke仍为四labels；readiness保留browser事实和全部其他Not Covered；本文已删除；工作树只含allowlist文件。

STOP：任一验证失败、范围外diff、本文仍被引用或删除后链接失败。删除后失败只运行`git restore --source=HEAD -- docs/30-designs/RUNBOOK-REASSIGN-BROWSER-EVIDENCE.md`；不得恢复其他文件。

失败恢复：完整验证使用test临时目录；真实smoke由wrapper restore。本文删除失败时按上项恢复。

## 9. 验证矩阵

| 风险                          | focused assertion                                                                               | full / readiness        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| browser fixture提前推进       | browser-ready observation仍指向同一current attempt                                              | T2页面有可用skip控制    |
| ordinary replacement回归      | 保留既有四labels source assertions、唯一tool call                                               | T1/T3真实reassign smoke |
| Client body或route漂移        | existing client exact body与HTTP contract                                                       | T2真实Browser写入成功   |
| stale本地UI                   | write后refetch、刷新后旧控制不返回                                                              | T2浏览器观察            |
| 错把skip写成replacement       | browser result只标ready；readiness明确action=skip                                               | scope/readiness audit   |
| cleanup泄漏                   | SIGINT、cleanup marker、exact path不存在                                                        | T2 evidence             |
| production scope creep        | `plugin/src/**`零diff                                                                           | T3 allowlist            |
| package/type/build regression | focused tests、build                                                                            | T3 `pnpm verify`        |
| recovery/event/receipt/outbox | `Not Applicable`：任务不改这些产品边界；既有ordinary smoke和full suite回归                      | T3 full verify          |
| external provider credential  | `Not Applicable`：固定spawn provider不需要LLM credential；smoke environment移除DeepSeek secrets | T1/T2真实profile        |

## 10. Readiness、Not Covered 与删除

完成后可以声明：在真实 built Convivium package、DSH `0.1.1-rc.2` web profile和spawn provider中，loopback用户通过现有Client成功执行一次`Skip current speaker`，页面重新读取已提交状态，wrapper完成清理。

不得声明：Browser选择了replacement Participant、Browser观察了Activation drain、replacement Agent提交或transcript保留。这些只由普通`reassign` profile smoke证明。Decision/risk HTTP/Client write、metrics、stress和发布验证仍保持各自Not Covered。

T3以前不得删除本文。T2把实际结果迁入readiness；T3确认完整验证和无引用后，按[`RUNBOOK-RULES.md`](../00-governance/RUNBOOK-RULES.md)删除本文；Git历史承担临时过程追溯。

## 11. Author/Audit 结论

Author 已核对正式需求、HTTP/Client接口、生产实现、browser wrapper、probe dispatcher、普通reassign scenario、result validator、focused tests和readiness断点。任务不需要新增产品字段、协议、route、状态、事件、repository行为或抽象。

Audit 结论：`Executable`。

T0至T3为唯一顺序；每一步都是一个可独立审阅、提交和回滚的工程判断，并具有固定前置、允许/禁止文件、唯一动作、直接命令、客观PASS、强制STOP和失败恢复。普通replacement smoke与browser skip evidence被明确分开，执行者无需决定是否新增replacement picker或如何修改生产行为。
