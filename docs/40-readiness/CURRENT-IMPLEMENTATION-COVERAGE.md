# Current Implementation Coverage

当前 smoke 默认覆盖 5 条关键跨层链路，完整套件保留 15 个场景；一次构建、独立场景、清理后输出 PASS。设计调整后的执行结果与边界见 [Smoke Validation Evidence](./SMOKE-VALIDATION-EVIDENCE.md)；下文已注明提交的旧记录仍仅代表历史验证。

## Scope

本文记录当前代码相对已确认需求的实现覆盖，不替代需求、接口或设计文档。

- 记录日期：2026-09-07
- 代码基线：`46bfebc9804c9486fa4f77cccfcf2fa20486a01d`
- 环境：Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、profile `web`、provider `spawn`
- `已实现` 表示存在正式路径和相称验证；`部分实现` 表示存在局部路径但未闭合；`未实现` 表示没有产品运行路径。
- 历史真实 profile 证据只适用于其原始 commit，不外推为当前 HEAD 证据。

## Validated Contract

- DSH plugin package、Host/Client 构建、`spawn` provider gate 和 loopback HTTP。
- Meeting/Participant/Session 隔离、caller/capability 校验、顺序发言、timeout/reassign/drain 和恢复。
- Storage Domain 原子 commit、幂等、checkpoint/tail recovery、outbox 和 catalog recovery。
- MeetingTask、HandRaise、meeting mail、completion/end、risk disposition、archive 和 continuation。
- Proposal/Position、Decision acceptance、Question/Issue/Agenda candidate 的已实现子集及对应 projection。

- 引用式纪要：原任务提交 `e9f08c2` 完成收口；发布前合入 main `03e3a0e` 后重新通过完整 verify（78 files / 1000 tests）及真实 `scribe-minutes` 普通/Browser 两模式；原固定回归为 7 files / 195 tests；详细证据及未覆盖边界见 [Referenced Minutes Evidence](./REFERENCED-MINUTES-VALIDATION-EVIDENCE.md)。

## Requirement Coverage

| Requirement                               | 状态     | 当前覆盖                                                                                                                                         | 主要缺口                                                                                     |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| FR-1 DSH 插件形态                         | 已实现   | package、双 bundle、provider gate、profile evidence                                                                                              | 高于最低版本的兼容与分发策略未决定                                                           |
| FR-2 会议与身份隔离                       | 已实现   | Meeting、Participant、Session、repository ownership 隔离                                                                                         | 远程、多用户、跨 Host 不支持，属于 V1 非目标                                                 |
| FR-3 有序连续发言                         | 已实现   | 单一 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝、reassign/skip                                                               | 无                                                                                           |
| FR-4 发言计划与选择                       | 已实现   | Manager/round-robin/rule-based/hybrid planning、资格校验、required Participant waiting、确定性 fallback、自动 stall/refocus/replan；新增五收敛场景真实 DSH 验证通过                                                            | 时间预算、blocking Position 分支等真实运行边界见收敛专项证据                                              |
| FR-5 异步任务与举手                       | 已实现   | MeetingTask、HandRaise、恢复、幂等、task evidence；start replay 在最新 task snapshot 已为 `running` 时跳过 Catalog preview 并进入 receipt replay | 外部副作用 exactly-once、长期压力未覆盖                                                      |
| FR-6 议题范围与发散控制                   | 已实现   | Question/Issue/Proposal/Position、候选 promote/park/reject、原子 commit、幂等、status/archive；全量验证及收敛真实 DSH 验证通过                                      | UI/HTTP/Client、时间预算、blocking Position 分支等真实运行边界见收敛专项证据                             |
| FR-7 提案、立场与决策                     | 已实现   | Proposal revision、Position、Decision candidate、Captain/local Decision accept/supersede/revoke、单 Issue risk accept/reject、HTTP/Client 行内控制；[本地控制证据](./CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md)                         | 本次五动作真实 DSH/Browser 已通过；其他 UI 不在范围                                                             |
| FR-8 完成事实与会议结束                   | 已实现   | completion/end、task evidence、终态 projection、恢复和幂等、收敛预算耗尽后的 stalled/no_consensus 终止；两类硬预算业务优先真实 DSH 验证通过                                                                                       | local fact 原子性、冷恢复与归档已自动验证；时间预算未覆盖                                        |
| FR-9 暂停、恢复与故障隔离                 | 已实现   | pause/resume、timeout、reassign/skip、interrupt/drain、cold rebind、per-Meeting isolation                                                        | 无                                                                                           |
| FR-10 记录、隐私与归档 | 已实现 | transcript、meeting mail、archive、Session cleanup、continuation；message-reference draft 的原子提交、持久恢复、status/Client/archive 与真实 DSH/Browser 均通过，见 [Referenced Minutes Evidence](./REFERENCED-MINUTES-VALIDATION-EVIDENCE.md) | 其他类型直接引用、模型质量和长期压力未覆盖；邮件增量跨层动态场景仍 Not Covered，采用未变动源码与持久上界契约证据 |
| FR-11 可观察性与用户控制                  | 已实现   | Meeting list/status、pause/resume/reassign/end、Client polling/refetch 和主要状态区块；新增五种 Decision/risk 行内操作、单表单写锁和错误恢复，见[本地控制证据](./CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md)    | 新增五动作真实 Browser 已验证；metrics、远程/多用户未覆盖                                 |
| FR-12 Agent 内部能力边界                  | 已实现   | 只消费正式提交和授权 task projection，不写自定义 DSH Session Event                                                                               | 后续 Mail/Web/UI 路径须保持该边界                                                            |
| FR-13 Agent 角色目录与参会推荐 | 部分实现 | Catalog consumer、attempt binding、safe projection、Manager pending；Captain reject/status/archive/JSONL reopen 已验证，真实 Loader 缺失推荐拒绝路径通过 | approve/admission/provisioning、FR-14、UI、真实 Host producer 成功链路和本子闭环 Host 冷重启未覆盖 |
| FR-14 Agent Definition 与 DSH composition | 未实现   | 9 个样本、hash 和负向 fixture                                                                                                                    | Definition resolution、Preset/Skill validation、差异化 Session composition                   |
| FR-15 Developer Markdown Projection       | 已实现   | committed snapshot/package → current/archive Markdown；白名单、受控路径、latest/stale、原子替换、failure isolation、dispose                      | multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理未覆盖                                  |

### Captain 参会拒绝实现与证据边界

2026-09-07，分支 `codex/attendance-rejection-runbook` 的代码与验证提交至 `f5cb663`：Captain 工具拒绝一个 pending recommendation，单 commit 持久化审计、receipt 和状态，status/归档脱敏，重放、并发、故障回滚与真实 JSONL reopen 保持一致。完整 verify 为 77 files / 734 tests，真实 DSH baseline 输出 `PASS baseline 6210ms restore=PASS`。详见 [Captain Attendance Rejection Evidence](./CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md)。该证据只覆盖拒绝子闭环，不改变 FR-13 的部分实现状态。

### Convergence 实现与证据边界

正式路径 `plugin/src/domain/transitions/speaker-submission.ts` 和 `speaker-attempt.ts` 调用 `turn-advancement.ts::advanceAfterSpeakerSubmission`，已实现 progress fingerprint、stall 计数、refocus、replan 及预算耗尽后的 `partial/stalled` 或 `no_consensus` 终止。`plugin/tests/unit/domain/transitions/turn-advancement.spec.ts` 覆盖首次 fingerprint、refocus → replan → stalled 和 blocking disagreement 下的 no_consensus；planning 与 Manager fallback 的单测分别位于 `plugin/tests/unit/domain/planning.spec.ts` 和 `plugin/tests/unit/runtime/manager-fallback.spec.ts`。

2026-09-07 在干净基线 `5f0cc145df8dd194242220730dc1ab359e943573` 完成原 `convergence` 和五个新增收敛 selector 的真实 DSH 运行：四次空提交至 stalled、合法 blocking question 至 no_consensus、Proposal 同时重置两计数、Turn/message 两类预算边界先 converging 后 Captain completed。五新增均归档、迟到提交拒绝且状态不变、两个 Session drained；六次 wrapper 和精确临时根/端口 Restore 均通过。完整 verify 为 75 files、3670 tests。详见 [Convergence Runtime Validation Evidence](./CONVERGENCE-RUNTIME-VALIDATION-EVIDENCE.md)。

该证据只更新 FR-4/FR-6/FR-8 的收敛验证范围；fingerprint 为间接观测，时间预算、blocking Position、事务故障注入、冷重启、模型及 Browser 未覆盖。下述历史记录保持原始基线，不外推为本次其他 selector 的新运行证据。

### Captain/local 决策与风险控制证据边界

2026-09-07 在 `b4bed41` 基线至 `adb28ec` 实现并验证五动作及其 HTTP/Client 入口；全量 verify 为 76 files / 791 tests。领域来源、事务失败回滚、P2 事件顺序、幂等、冷 Runtime/Repository 重开、六条 local facts 与归档一致性均通过自动化验证，详见 [Captain Local Decision Risk Control Evidence](./CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md)。本段只更新 FR-7/FR-8/FR-11 对应范围，LC-08 已在被测分支提交 `b63697d` 完成真实 DSH/Browser 七步、六条 local 审计事实和 Restore 验收；下述历史代码基线及 smoke 记录保持原含义。

## Executed Validation

2026-09-07，在当前代码基线 `46bfebc9804c9486fa4f77cccfcf2fa20486a01d` 执行 `pnpm --dir plugin verify`：

- Pass：format、lint、Host/Client typecheck、build、environment、contract、Agent Definition samples、package verifier。
- Pass：完整 Vitest suite，77 test files、588 tests。
- Pass：在 `8c7c39e6705fed5a79ed228b8f494a7f96cfe83b` 执行 `pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts`，1 file、35 tests；覆盖相同 `requestId` 的 MeetingTask start receipt replay。代码同时以 repository 最新 snapshot 的 task status 约束 Catalog preview，避免已变为 `running` 的交错重试在进入 `MeetingRepository.execute()` 前触发 `INVALID_STATE_TRANSITION`。
- Pass：在 target HEAD 执行 `pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile.spec.ts`，1 file、24 tests；固定 browser-ready 模式的 30 分钟 `speakerTimeoutMs`、普通模式的 60 秒和 `timeout` selector 的 250ms。
- Pass：在 target HEAD `aa70a14bb93e7cab134bb567f5320549e058a2b5`（2026-09-04，Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`）完成 Developer Markdown focused validation：`pnpm --dir plugin exec vitest run tests/unit/projection/developer-markdown.spec.ts`、`pnpm --dir plugin exec vitest run tests/unit/runtime/developer-markdown-service.spec.ts`、`pnpm --dir plugin exec vitest run tests/contract/domain-meeting-repository.spec.ts tests/contract/domain-repository-registry.spec.ts`、`pnpm --dir plugin exec vitest run tests/unit/config.spec.ts tests/unit/index-inject.spec.ts tests/contract/meeting-runtime.spec.ts`、`pnpm --dir plugin typecheck`、`pnpm --dir plugin lint`、`pnpm --dir plugin verify` 均 Pass；包含 T1-T5 的白名单映射/archive checksum 保留、串行 latest/stale/原子写入、repository callback/registry 传递、workspace fail-closed/runtime dispose 和完整验证。
- Pass：在 target HEAD `22ded07c3d126464684867d358fe338a9b4fe583` 运行 `CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`；preflight、Browser 五项 Reassign 观察、wrapper SIGINT/退出、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok` 和 exact temp-root cleanup 均通过。Browser 观察为 `Runtime smoke (running)`、`participant-a` 当前 Speaker、空 reason 时 `Skip current speaker` disabled、输入 `Browser reassign evidence` 后 enabled、点击后旧 attempt control 消失且 `role=alert` 为 0、刷新后旧 control 仍不存在；该 run URL 为 `http://127.0.0.1:56929`。

以下 G3/G4 真实 profile 与 Browser 记录来自较早的已注明 target evidence；本次 `8c2c40a` 验证没有重新执行这些运行时步骤，不得把它们外推为当前 HEAD 的新运行证据：

- Pass：G3 的 12 个真实 DSH profile selector，均为 `profile=web`、`provider=spawn`，且 probe `ok=true`：
  - `baseline`：`baseline-transcript-acb`、`baseline-http-pause-resume`
  - `timeout`：无 probe assertion
  - `reassign`：`old-attempt-revoked`、`old-activation-drained`、`replacement-attempt-submitted`、`transcript-preserved`
  - `task-handraise`：`task-delivered`、`task-started`、`finish-created-handraise`、`handraise-visible-then-consumed`、`later-turn-submitted`
  - `completion-end`：`single-winner`、`single-termination`、`terminal-submit-rejected`、`terminal-end-rejected`
  - `risk-reopen`：`risk-disposed`、`risk-replay-stable`、`risk-idempotency-conflict`；仅为回归证据，不提升 FR-7 完成结论
  - `cold-rebind`：`phase1-checkpoint-durable`、`host-pid-changed`、`exact-parent-rebound`、`transcript-prefix-preserved`、`cold-followup-submitted`
  - `archive-continuation`：`source-archived`、`source-sessions-drained`、`continuation-final-summary-only`、`target-identities-new`
  - `mail-race`：`single-mail-terminal`、`stable-delivery-ids`、`private-body-not-projected`、`recipient-queue-reusable`
  - `cross-meeting`：`ownership-sets-disjoint`、`meeting-a-cleanup-isolated`、`meeting-b-submitted`、`team-b-submitted`
  - `decision-risk-closure`：`candidate-visible-to-captain`、`candidate-accepted`、`accepted-candidate-not-pending`、`decision-history-current-state`、`decision-pending-by-current-revision`、`risk-disposition-status`、`risk-blocking-facts`、`risk-replay-version-stable`、`event-order-not-observable-by-command-status`
  - `convergence`：`deterministic-fallback`、`fallback-replay-idempotent`、`fallback-status-projected`
- Pass：G4 已完成 pnpm browser UI run；wrapper 退出 0、其 `CONVIVIUM_SMOKE_TEMP_ROOT` 不存在；UI 验证 pause/resume/end，最终 status 为 `archived`，Termination Code=`captain_accepted`、Reason=`Readiness evidence`。
- Pass：G4 direct-node cleanup probe；退出 0，观察到 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，且该 run 的 temp root 不存在。pnpm wrapper 未观察到该 marker，不得写成 wrapper 输出 marker。
- Not Covered：G5 `test:stress` 仅输出 `Not Covered: stress tests`；长期 soak、吞吐、容量、memory/FD budget 和一般资源泄漏验证未覆盖。

历史真实 profile 验证仅作为历史记录保留；其提交、命令和结果索引如下，详见 [DSH Runtime Vertical Slice Evidence](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md)。不得外推为 target HEAD 证据。

| 历史基线  | 命令                                                                            | 结果与边界                                                                              |
| --------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `23fbbb5` | `CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile`              | Pass；timeout 后旧 Speaker Activation drain，后续 Speaker 提交，旧发言不入 transcript。 |
| `75e7a7d` | `CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile`             | Pass；旧 attempt revoke、旧 Activation drain、replacement attempt 提交。                |
| `7d2ee89` | `CONVIVIUM_SMOKE_SCENARIO=task-handraise pnpm --dir plugin smoke:profile`       | Pass；task delivery、finish、HandRaise 和后续 planning/evidence submit。                |
| `4fb7b13` | `CONVIVIUM_SMOKE_SCENARIO=completion-end pnpm --dir plugin smoke:profile`       | Pass；completion/end 竞争只产生一个终态，terminal 写入被拒绝。                          |
| `b5c415b` | `CONVIVIUM_SMOKE_SCENARIO=risk-reopen pnpm --dir plugin smoke:profile`          | Pass；risk disposition、同 request replay 和 hash conflict。                            |
| `83c2cd3` | `CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile`          | Pass；新 Host PID 中 exact Captain Session rebind 和后续提交。                          |
| `479d994` | `CONVIVIUM_SMOKE_SCENARIO=archive-continuation pnpm --dir plugin smoke:profile` | Pass；source archive、target 新身份和 final summary-only continuation。                 |
| `6a01518` | `CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile`            | Pass；mail 单一 terminal、稳定 delivery ID 和隐私边界。                                 |
| `0a7110d` | `CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile`        | Pass；跨 Meeting ownership 隔离和清理隔离。                                             |

上述记录是各自历史提交的证据，不外推为当前 HEAD 的 smoke 结果；当前代码的 persistence 边界为 Storage Domain/JSONL，历史基线的实际介质以对应提交为准。

## Not Covered

- 遗留 SQLite 数据不读取、不迁移、不删除。
- 不支持 multi-Host writer、远程 filesystem、远程访问、多用户和网络部署。
- risk/Decision 五动作已通过正式 HTTP/Client 自动化与 LC-08 真实 DSH/Browser 验收；本轮没有验证真实 LLM 请求或 Host 冷重启。
- Question 的 required-review/risk evidence、Decision candidate 完整生命周期未实现。自动 stall/refocus/replan 已有正式路径和单测，完整链路的真实 DSH smoke 未覆盖。
- FR-13 的 Catalog/Manager pending 和 Captain reject 本地闭环已验证；真实 Loader 仅验证缺失推荐拒绝路径。真实 Host producer 成功推荐→拒绝、该子闭环 Host 冷重启、真实模型自主调用、Browser/HTTP/Client 拒绝控制、approve/admission/provisioning、自动 expired/cancelled 和 FR-14 仍未覆盖。
- 结构化 metrics、stress/长期资源泄漏和生产发布验证未实现或未覆盖。
- Developer Markdown 的 multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理未覆盖；current/archive 文件仍为非权威本地诊断输出。

## Closure

当前 target HEAD 可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不可描述为完整会议产品、真实模型链路或发布就绪。当前 HEAD 的本地验证已记录；真实 DSH selector、pause/resume/end browser control 和 cleanup 仍仅适用于文中明确标注的历史 target evidence，不外推为本次 HEAD 的新运行证据。
