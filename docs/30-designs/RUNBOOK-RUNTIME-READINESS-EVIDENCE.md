# RUNBOOK：最终产品 HEAD Runtime Readiness Evidence

状态：`Executable`；A/B 产品实现均已合入；G0 可以直接执行

建立日期：2026-09-03

targetCommit: `cf0ab2d2cf12d670bab66c0324c1c2395f319d98`

## 1. 执行者契约

本文只消费按 B→A 顺序合入 `origin/main` 的单一产品 HEAD。执行者从 G0 开始，严格按 G0-G7 顺序执行；每步只能执行列出的动作。PASS 后进入下一步，STOP 后立即报告并停止。

C 只允许修改本文以及：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`

C 禁止修改 `plugin/**`、产品 Schema、domain transition、event、receipt、outbox、projection、HTTP/tool/Client、test fixture、smoke runner、requirements、interfaces、稳定 designs、operations、TODO、依赖和配置。禁止新增 stub、`NOT_IMPLEMENTED`、registry、adapter、feature flag、fallback、metrics/browser/stress framework、第二 repository 或 migration。禁止 commit、push、PR、merge、cherry-pick 和发布。

任一 STOP 报告固定包含：最后 PASS 步骤；触发条件；文件和 symbol；最小复现命令；退出码和 stdout/stderr；Restore 结果；继续所需的外部状态变化。不得 reset、checkout、stash、clean 或删除未知文件。

## 2. 三个问题的固定答案

1. **现在能否执行 evidence/readiness：能从 G0 开始，不能跳过 G0。** A/B 已合入，本文已把最终产品基线固定为 literal target SHA；G0 必须先证明当前 `origin/main`、执行分支 ancestry、产品文件和既有验证入口仍与该 target 一致。
2. **执行是否需要用户补充判断：不需要。** G0-G7 的输入、命令、PASS/STOP、Restore、readiness writer 和 Not Covered 已固定。
3. **target 与 C HEAD 如何区分：** target 是同时包含 A/B 产品合入和后续 smoke runner 组件化的 `origin/main` SHA；C HEAD 可以只包含位于 target 之上的本 RUNBOOK commit。G0 必须证明 `targetCommit` 是 `HEAD` ancestor，且 `targetCommit..HEAD` 只包含本 RUNBOOK，产品树不得有差异。

最终判定：`Executable；可从 G0 直接机械执行，无前置产品或时序阻塞`。

## 3. 目标、Scope 与 Non-goals

完整链路：

```text
B D1-D5 merged
  -> A rebased on B and D6-D10 merged
  -> G0 verifies the pinned literal origin/main SHA and audits the target
  -> focused tests -> pnpm --dir plugin verify
  -> all 12 real DSH selectors -> supported browser evidence
  -> bounded existing stress/cleanup check -> C-only readiness
  -> Close and delete this RUNBOOK
```

Scope：

- 在同一 literal target SHA 上运行 A/B focused tests、`pnpm --dir plugin verify` 和全部最终 real-profile selectors。
- `risk-reopen` 只证明既有单 Issue risk disposition/replay/hash-conflict，不提升为 FR-7 完成；B 的 FR-7 closure 只由 `decision-risk-closure` 及 B focused/full tests 证明。
- `convergence` 只按 A 的三个固定 assertion 取证。
- 对正式已有 Client/HTTP control 取最小 browser 证据；没有稳定 fixture 的 control 记 `Not Covered`。
- 只运行已有 `test:stress` 并如实记录其 `Not Covered` 输出；用 selector 自带 Restore 证明有界资源清理，不建立压力框架。
- 仅当 target 同时存在正式 contract、唯一 producer、consumer 和验证入口时记录 structured metrics；否则 `Not Covered`。
- C 独占写两份 readiness，所有事实绑定同一 target SHA/date/environment。

Non-goals：实现或修复 stall/refocus/replan、Decision/risk、Agent catalog/admission、Definition runtime、Scribe 或其他产品能力；修改 A/B runner/assertion；真实 LLM/credential；长期 soak、吞吐、容量、生产 memory/FD budget；发布、部署、远程、多用户。

## 4. 正式依据、输入与所有权

- [Architecture](../00-governance/ARCHITECTURE.md)
- [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)
- [Meeting Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)
- [Domain Design](./DOMAIN-MODEL-DESIGN.md)
- [Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)
- [Persistence Design](./MEETING-PERSISTENCE-SPECIAL-DESIGN.md)
- [Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [DSH Smoke Operation](../50-operations/HOW-TO-DSH-SMOKE.md)

| 能力                | canonical producer/owner                                                                                                                             | C consumer     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| D1-D5 Decision/risk | B；§4.1 symbols/tests；`decision-risk-closure`                                                                                                       | G0/G1/G3，只读 |
| D6-D10 convergence  | A；§4.2 symbols/tests；`convergence`                                                                                                                 | G0/G1/G3，只读 |
| real profile runner | `plugin/scripts/smoke-profile/index.mjs::SMOKE_SCENARIOS`、`probe/index.js` dispatcher、`probe/scenarios/*.js`、`result.mjs::validateScenarioResult` | G0/G3，只运行  |
| package gate        | `plugin/package.json#scripts.verify`                                                                                                                 | G2             |
| readiness           | C                                                                                                                                                    | G6 唯一 writer |

### 4.1 B 最终输入

G0 必须同时找到：

- `plugin/src/protocol/request-idempotency.ts::serializeValidatedRequestV1(value: object): string`
- `plugin/src/protocol/types.ts::{PublicDecisionCandidateV1,CaptainDecisionDispositionInputV1,CaptainDecisionDispositionResultV1,PublicRiskV1}`
- `plugin/src/protocol/results.ts::CaptainDecisionDispositionResultSchema`
- `plugin/src/tools/register-tools.ts` 的 `convivium_dispose_decision`
- `plugin/src/domain/transitions/decision-disposition.ts::disposeDecision`
- `plugin/src/projection/status.ts::projectMeetingStatus` 的 `pendingDecisionCandidates`、`risks`、`decisionHistory`
- `plugin/scripts/smoke-profile/index.mjs::SMOKE_SCENARIOS` 的 selector `decision-risk-closure`；`plugin/scripts/smoke-profile/probe/index.js` 的 dispatcher；`plugin/scripts/smoke-profile/probe/scenarios/decision-risk-closure.js::runDecisionRiskClosureScenario`
- `decision-risk-closure` 的 assertion set 精确为 `candidate-visible-to-captain`、`candidate-accepted`、`accepted-candidate-not-pending`、`decision-history-current-state`、`decision-pending-by-current-revision`、`risk-disposition-status`、`risk-blocking-facts`、`risk-replay-version-stable`、`event-order-not-observable-by-command-status`
- B focused files：`plugin/tests/unit/protocol/request-idempotency.spec.ts`、`plugin/tests/unit/domain/transitions/proposal-position.spec.ts`、`issue.spec.ts`、`decision-candidate.spec.ts`、`decision-acceptance.spec.ts`、`decision-disposition.spec.ts`、`plugin/tests/unit/domain/completion.spec.ts`、`plugin/tests/contract/protocol-schema.spec.ts`、`status-projection.spec.ts`、`http-boundary.spec.ts`、`meeting-runtime.spec.ts`、`tool-registration.spec.ts`、`plugin/tests/unit/runtime/archive.spec.ts`、`plugin/tests/recovery/domain-recovery.spec.ts`、`plugin/tests/client/client-entry.client.spec.ts`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`。

### 4.2 A 最终输入

G0 必须同时找到：

- `plugin/src/domain/planning.ts::{rankRulePlanningCandidates,planRuleBasedTurn,needsSemanticArbitration}`
- `plugin/src/domain/transitions/manager-planning.ts::failManagerPlanningAndCreateFallback`
- `plugin/src/domain/transitions/turn-advancement.ts::{advanceAfterSpeakerSubmission,createProgressFingerprint,hasBlockingDisagreement}`
- `plugin/src/projection/status.ts::projectMeetingStatus` 的 `waitState`、`stallCount`、`maxStalls`、`replanCount`、`maxReplans`
- `plugin/scripts/smoke-profile/index.mjs::SMOKE_SCENARIOS` 的 selector `convergence`；`plugin/scripts/smoke-profile/probe/index.js` 的 dispatcher；`plugin/scripts/smoke-profile/probe/scenarios/convergence.js::runConvergenceScenario`，其 assertion set 精确为 `deterministic-fallback`、`fallback-replay-idempotent`、`fallback-status-projected`
- A focused files：`plugin/tests/unit/domain/planning.spec.ts`、`plugin/tests/unit/domain/transitions/manager-planning.spec.ts`、`turn-advancement.spec.ts`、`speaker-attempt.spec.ts`、`speaker-submission.spec.ts`、`plugin/tests/unit/runtime/manager-fallback.spec.ts`、`meeting-runtime.spec.ts`、`turn-runner.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`protocol-schema.spec.ts`、`status-projection.spec.ts`、`domain-meeting-repository.spec.ts`、`plugin/tests/recovery/recovery.spec.ts`、`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`。

不存在独立 C type seam；空接口和 stub 为 `Not Applicable`。C 不复制 DTO/Schema，不定义 request canonicalization，不新增 DSH Session event。

## 5. 证据契约与不变量

两份 readiness 中每个 lane 记录以下 required 字段；没有 optional 字段：

| field          | type                                                       | 唯一来源                                               |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `dateUtc`      | ISO-8601 UTC string                                        | G6 的 `date -u +%Y-%m-%dT%H:%M:%SZ`                    |
| `targetCommit` | 40-char lowercase SHA                                      | 本文 literal；等于 `origin/main`，且为 `HEAD` ancestor |
| `environment`  | OS/arch、Node、pnpm、DSH/profile/provider                  | G0 固定命令与 runner constants                         |
| `lane`         | enum `focused, verify, selector, browser, stress, cleanup` | G1-G5                                                  |
| `command`      | exact string                                               | 本文对应步骤                                           |
| `result`       | enum `Pass, Fail, Not Covered, Blocked`                    | 对应客观断言                                           |
| `assertions`   | string list，可空                                          | test summary 或 smoke `probe.assertions` 原值          |
| `restore`      | enum `Pass, Fail, Not Applicable`                          | runner cleanup marker/进程和临时根检查                 |
| `notes`        | string                                                     | Pass 为 `none`；否则首个失败或缺口                     |

不变量：`origin/main == targetCommit`，`targetCommit` 是 C `HEAD` ancestor，`targetCommit..HEAD` 只含本 RUNBOOK；G1-G5 不得产生任何 tracked diff；B/A postconditions 必须同时存在；每个 selector 独立启动且首次 Fail/Restore Fail 立即 STOP；历史 evidence 不外推；`risk-reopen` 不证明 FR-7 closure；C 是两份 readiness 的唯一 writer；证据不得包含 secret、完整环境变量、用户目录或完整绝对临时路径。

## 6. 机械执行步骤

### G3：全部 real DSH selectors

前置状态：当前分支 HEAD 为 G2 收口 commit，且 `git show --name-only --format= HEAD^..HEAD` 只列本文；工作树 clean；不加载 `dev.env`；`DSH_SMOKE_DSH_BIN` 未设置；可取得 `@deepseek-ai/dsh@0.1.1-rc.2`。允许修改：无。禁止修改：全部文件和 runner defaults。

依次执行，不能并行或跳过：

```bash
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=task-handraise pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=completion-end pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=risk-reopen pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=archive-continuation pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure pnpm --dir plugin smoke:profile
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_SCENARIO=convergence pnpm --dir plugin smoke:profile
```

每条 PASS：退出 0；顶层 JSON `ok:true,profile:"web",provider:"spawn"`；`probe.ok:true`；`probe.scenario` 等于 selector；`probe.assertions` 原样记录。`decision-risk-closure` 数组与 §4.1 的 9-label set 相等，`convergence` 数组与 §4.2 的 3-label set 相等；数组顺序按 runner 输出记录，不改变 set。Restore 必须没有 `smoke probe failed`/`Smoke restore failed`，runner finally 停 Host、释放 port、删除自身 temp root。`risk-reopen` 只记录其三项现有断言，不写 FR-7 Pass。

STOP：首次非零、JSON/selector/assertion/rc.2/profile/provider 不匹配、Restore失败或 plugin diff。网络/包不可达记 `Blocked` 后 STOP，不降级 DSH。恢复仅由 runner `restore()` 负责。

### G4：已有 browser control evidence

前置状态：G3 PASS；使用仓库 browser skill；只用 runner 临时 profile/workspace。允许修改：无。禁止修改：产品、fixture、runner、readiness。

Prepare：在唯一 PTY 执行：

```bash
env -u DSH_SMOKE_DSH_BIN CONVIVIUM_SMOKE_BROWSER_MODE=1 CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile
```

Execute/Assert：等待 `CONVIVIUM_SMOKE_BROWSER_URL=http://127.0.0.1:<port>`；浏览器打开该 URL；选择 `Runtime smoke`；确认 `Meeting summary` 包含 `running`；在 `Pause reason` 输入 `Readiness evidence` 并点击 `Pause meeting`；确认 summary 包含 `paused` 且出现 `Resume meeting`；点击它并确认 summary 返回 `running`；`End outcome` 选 `partial`，`End reason` 输入 `Readiness evidence`，点击 `End meeting`，确认 summary 包含 `partial` 且 `Pause meeting`、`Resume meeting`、`End meeting` 三个 label 全部不存在。

Restore：关闭页面；向唯一 PTY 发送一次 Ctrl-C；等待退出 0 和 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。

PASS：全部可见断言与 Restore 成立。STOP：启动、label、HTTP action、terminal projection 或 cleanup 任一失败；记录 screenshot、console/response 与 PTY tail，不改产品。

失败恢复：浏览器断言无论 PASS/FAIL 都执行上述 Restore；若 Ctrl-C 后未出现 cleanup marker，则保留 PTY 输出并 STOP，不手工删除 runner 临时根。

固定 `Not Covered`：risk/Decision disposition 没有正式 HTTP/Client write control；reassign 有 route/control，但 baseline fixture 在页面可操作时没有 active attempt，runner 没有 browser-ready reassign fixture。不得伪造 Pass 或增加 fixture。

### G5：bounded stress 与资源边界

前置状态：G4 PASS。允许修改：无。禁止修改：全部文件。

```bash
pnpm --dir plugin test:stress
test -z "$(git diff --name-only -- plugin)"
```

PASS：退出 0且 stdout 包含 `Not Covered: stress tests`；结果记录 `Not Covered`，不是 stress Pass。G3/G4 Restore Pass 是唯一 bounded startup/cleanup 证据。长期 soak、吞吐、容量、memory/FD budget 均 `Not Covered`。STOP：命令失败、缺固定输出、残留 Host/port/temp root 或产生 diff；不得新增 framework。

失败恢复：该命令不得启动外部 Host；如实际出现进程或临时根，记录路径 basename 和进程状态后 STOP，不终止或删除不属于本命令的资源。

structured metrics 固定 `Not Covered`：当前没有同时指定唯一 contract、producer、consumer 和验证入口；C 不设计 framework。

### G6：C-only readiness

前置状态：G0-G5 结果确定且资源已恢复；工作树 clean。

允许修改：两份 readiness。禁止修改：其他文件。

执行：先运行 `date -u +%Y-%m-%dT%H:%M:%SZ`、`uname -srm`、`node --version`、`pnpm --version`；两份文件写相同 `dateUtc`、literal target SHA、OS/arch、Node、pnpm、DSH `0.1.1-rc.2`、profile `web`、provider `spawn`。Current Coverage 的 Executed Validation 只写 G1-G5 实际结果。G1-G3 全 PASS 后，FR-4 改为 `已实现` 并删除旧 fallback/stall 缺口，FR-7 改为 `已实现` 并删除旧 candidate lifecycle、supersede/revoke、risk acceptance/UI 实现缺口；FR-6 保持 `部分实现`，只保留不属于 D1-D10 的 Agenda candidate 管理缺口；禁止用 `risk-reopen` 单独提升。G1-G3 未全 PASS 时不得执行 G6。Runtime Evidence 新建唯一 current-target section，按 §5 逐 lane/selector 写 record并保留历史边界；两处同步写 browser/metrics/stress/credential/deploy Not Covered；不复制 A/B 历史输出。

验证：

```bash
target_sha="cf0ab2d2cf12d670bab66c0324c1c2395f319d98"
test "$(git rev-parse origin/main)" = "$target_sha"
git merge-base --is-ancestor "$target_sha" HEAD
rg -n "$target_sha|0\.1\.1-rc\.2|spawn|Not Covered" docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md
test "$(git diff --name-only | sort)" = "$(printf '%s\n' docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md | sort)"
pnpm --dir plugin exec prettier ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md ../docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md --check
```

PASS：target/date/environment一致；12 selector 均有 record；结果与真实输出一致；只有两份 readiness 有 diff。STOP：需猜测产品状态、丢失首败、外推历史或越界 diff。恢复：保留文档 diff，不 reset。

### G7：Audit、迁移与删除

前置状态：G6 PASS；全部 Scope 有 evidence 或 Not Covered。允许修改：本文和两份 readiness。禁止修改：其他文件。

```bash
python3 - <<'PY'
from pathlib import Path
import re, sys
files=[Path('docs/30-designs/RUNBOOK-RUNTIME-READINESS-EVIDENCE.md'),Path('docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md'),Path('docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md')]
bad=[]
for p in files:
    for target in re.findall(r'\[[^]]+\]\(([^)]+)\)',p.read_text()):
        clean=target.split('#',1)[0]
        if clean and '://' not in clean and not (p.parent/clean).resolve().exists(): bad.append(f'{p}:{target}')
print('\n'.join(bad)); sys.exit(bool(bad))
PY
pnpm --dir plugin exec prettier ../docs/30-designs/RUNBOOK-RUNTIME-READINESS-EVIDENCE.md ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md ../docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md --check
! rg -n '按[需]|相关文[件]|必要测[试]|或等[价]|自行选[择]|合适方[案]|合理兼[容]|必要时新[增]' docs/30-designs/RUNBOOK-RUNTIME-READINESS-EVIDENCE.md
git diff --check
rg -n 'RUNBOOK-RUNTIME-READINESS-EVIDENCE|最终产品 HEAD Runtime Readiness Evidence' docs .agents plugin
```

PASS：Audit=`Executable`；实际 evidence 已迁移，未覆盖项留在 readiness；除本文外无长期引用。随后删除本文，再重复相对链接、两份 readiness Prettier 和 `git diff --check`；全部 PASS 才完成。

STOP：任一 Scope 无结果、readiness 不一致、仍有长期引用或删除后检查失败。删除后失败时恢复本文并 STOP；不得保存 completed/archive RUNBOOK。

## 7. 双向追踪与验证矩阵

| Scope               | requirement/interface/design                                    | production symbol/entry                                                      | focused/full/runtime                                         | readiness              |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| D1-D5               | FR-7/AC-7/8/26/27；Protocol Decision/risk；Domain/Orchestration | §4.1 exact symbols                                                           | G1、G2、`decision-risk-closure`；`risk-reopen` 仅 regression | G6                     |
| D6-D10              | FR-4/FR-6/AC-5/6/20；Protocol Manager/wait；Orchestration       | §4.2 exact symbols                                                           | G1、G2、`convergence` 三 assertions                          | G6                     |
| repository/recovery | Storage Interface；Persistence Design                           | Meeting repository/outbox/recovery                                           | G1 repository/recovery；G2；cold-rebind                      | G6                     |
| package/DSH         | Architecture；Smoke Operation                                   | package verify；smoke runner                                                 | G2；G3 12 selectors                                          | G6                     |
| Client/HTTP         | Protocol routes；Implementation Design                          | `plugin/src/client/meeting-panel.tsx::ConviviumMeetingPanel`；Meeting routes | Client/HTTP specs；G4 pause/resume/end                       | G6；其余 Not Covered   |
| stress/resources    | package/runner cleanup                                          | `test:stress`；`plugin/scripts/smoke-profile/index.mjs::restore`             | G3-G5                                                        | G6 Not Covered/cleanup |
| metrics             | 无唯一正式 contract/producer/consumer                           | Not Applicable                                                               | Not Covered                                                  | G6                     |

反向检查：G0 仅固定 target/A-B inputs；G1-G3 覆盖产品/runtime；G4 只覆盖可达 controls；G5 只记录空 stress entry和 runner cleanup；G6-G7 只写/收口证据。无步骤授权 Non-goals。

## 8. 阻塞分类、失败恢复与 Audit

当前时序依赖：无。B→A 合并顺序已满足，literal target SHA 已固定，C 分支已基于该 target。

执行期机械 STOP：dirty tree；fetch/SHA/ancestry失败；target 以上出现本文外文件；A/B path/symbol/test/selector postcondition 不匹配；focused/verify/smoke/browser/cleanup失败；环境无法取得 rc.2；readiness 越界或文档检查失败。这些是可复现状态或测试失败，不是产品判断。

真正未决产品判断：**无**。未来 target 与已批准契约冲突时只报告 mechanical STOP；是否改变契约属于新任务。

Not Applicable：C 不生产 data/schema/ID/time/actor/version/request hash/event/receipt/outbox/projection；它们由 A/B product symbols 和 tests 验证。C 只写 runtime canonical JSON、test result 和 Git/environment metadata。数据库迁移、compatibility adapter、发布、部署均不适用。

Audit：`Executable`。Required Structure、权限、Scope/Non-goals、正式依据、exact files/symbols/tests、证据字段、G0 的 literal SHA 校验与入口 Audit、每步 Prepare/Execute/Assert/Restore、PASS/STOP、失败恢复、双向追踪、readiness 单写和删除条件均已固定。当前未运行 G0-G7、真实 smoke/stress/browser，未写正式 readiness；这是执行阶段事实，不降低决策完备性。
