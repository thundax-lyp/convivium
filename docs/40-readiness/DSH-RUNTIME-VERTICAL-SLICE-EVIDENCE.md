# DSH Runtime Vertical Slice Evidence

> 当前证据：本文新增 target HEAD current section；其余历史证据仍只适用于原始 commit，不外推为当前 HEAD。当前覆盖总览以 [Current Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md) 为准。

## Current Target Evidence

- `targetCommit`: `cf0ab2d2cf12d670bab66c0324c1c2395f319d98`
- `dateUtc`: `2026-09-03T08:34:00Z`
- `environment`: Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`
- `profile`: `web`
- `provider`: `spawn`
- `source branch`: `codex/runtime-readiness-evidence-runbook`

### G1/G2 package and test evidence

- G1 focused validation：Pass，27 test files、265 tests。
- G2 full verification：Pass，format、lint、Host/Client typecheck、build、environment、contract、Agent Definition samples、package verifier；73 test files、517 tests。

### G3 selector evidence

每个 selector 均独立执行 `CONVIVIUM_SMOKE_SCENARIO=<selector> pnpm --dir plugin smoke:profile`，结果均为退出 0、`ok=true`、`profile=web`、`provider=spawn`，并通过对应 exact assertion set：

| Selector                | Exact assertions                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `baseline`              | `baseline-transcript-acb`, `baseline-http-pause-resume`                                                                                                                                                                                                                                          |
| `timeout`               | empty                                                                                                                                                                                                                                                                                            |
| `reassign`              | `old-attempt-revoked`, `old-activation-drained`, `replacement-attempt-submitted`, `transcript-preserved`                                                                                                                                                                                         |
| `task-handraise`        | `task-delivered`, `task-started`, `finish-created-handraise`, `handraise-visible-then-consumed`, `later-turn-submitted`                                                                                                                                                                          |
| `completion-end`        | `single-winner`, `single-termination`, `terminal-submit-rejected`, `terminal-end-rejected`                                                                                                                                                                                                       |
| `risk-reopen`           | `risk-disposed`, `risk-replay-stable`, `risk-idempotency-conflict`; regression only, not FR-7 closure                                                                                                                                                                                            |
| `cold-rebind`           | `phase1-checkpoint-durable`, `host-pid-changed`, `exact-parent-rebound`, `transcript-prefix-preserved`, `cold-followup-submitted`                                                                                                                                                                |
| `archive-continuation`  | `source-archived`, `source-sessions-drained`, `continuation-final-summary-only`, `target-identities-new`                                                                                                                                                                                         |
| `mail-race`             | `single-mail-terminal`, `stable-delivery-ids`, `private-body-not-projected`, `recipient-queue-reusable`                                                                                                                                                                                          |
| `cross-meeting`         | `ownership-sets-disjoint`, `meeting-a-cleanup-isolated`, `meeting-b-submitted`, `team-b-submitted`                                                                                                                                                                                               |
| `decision-risk-closure` | `candidate-visible-to-captain`, `candidate-accepted`, `accepted-candidate-not-pending`, `decision-history-current-state`, `decision-pending-by-current-revision`, `risk-disposition-status`, `risk-blocking-facts`, `risk-replay-version-stable`, `event-order-not-observable-by-command-status` |
| `convergence`           | `deterministic-fallback`, `fallback-replay-idempotent`, `fallback-status-projected`                                                                                                                                                                                                              |

### G4 browser and cleanup evidence

- pnpm browser UI run：Pass，退出 0，`CONVIVIUM_SMOKE_TEMP_ROOT` 不存在；`Runtime smoke` 完成 `running → paused → running`，End outcome 选 `Partial`，最终 Meeting summary 为 `archived`，Termination Code=`captain_accepted`、Reason=`Readiness evidence`，Pause/Resume/End controls 均不存在。
- pnpm wrapper cleanup marker：Not observed；wrapper 退出 0 且 temp root 已删除。该 wrapper 边界不得改写为已观察 marker。
- direct-node cleanup probe：Pass，退出 0，观察到 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，且 probe temp root 不存在；probe 不执行浏览器交互。

### G5 bounded stress/resource evidence

- `pnpm --dir plugin test:stress`：Pass as command; stdout 明确为 `Not Covered: stress tests`，故 stress 结果为 `Not Covered`，不是 stress Pass。
- 长期 soak、吞吐、容量、memory/FD budget、一般资源泄漏和发布/部署验证：`Not Covered`。

### Scope gaps

- risk/Decision disposition 无正式 browser/HTTP/Client write control；reassign 无 browser-ready fixture，均为 `Not Covered`。
- structured metrics 无唯一正式 contract、producer、consumer 和验证入口，为 `Not Covered`。

## Scope

记录 Manager planning、顺序发言和 DSH Session 生命周期的历史 profile 验证。

- 日期：2026-08-27
- 代码基线：`7b39065`
- 环境：Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、provider `spawn`

该历史基线的 repository 仍使用 SQLite；本文的 profile 证据不证明后续 Storage Domain/JSONL 实现，也不应改写为当前 persistence 边界。

## Validated Contract

- `selectionMode="manager"` 进入 Manager planning；`round_robin` 保持可用，其他未支持模式 fail closed。
- Manager 提交有序 plan；Speaker delivery 串行进行，后续 Speaker 获取前序正式 transcript。
- Manager plan、首个 attempt、领域事件和 outbox 通过一个 SQLite repository command commit 提交。
- DSH followup 校验 exact parent、ownership、capability 和当前 attempt。

## Executed Validation

`pnpm verify:runtime` 与 `pnpm smoke:profile` 在上述基线通过。profile 验证 Captain 创建 Manager meeting、A→C→B 顺序提交、正式 transcript 顺序和 Host 清理。

## Not Covered

- 本文基线不覆盖后续的 MeetingTask、mail、archive、Decision、HTTP、Client、cold recovery 和跨 Meeting isolation 实现。
- 不覆盖真实模型输出质量、并行发言、远程部署、stress 和生产发布验证。

## Closure

本文作为历史证据保留；不得用于证明当前 HEAD 已完成真实 DSH profile 验证。
