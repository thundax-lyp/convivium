# Current Implementation Coverage

当前 smoke 默认覆盖 5 条关键跨层链路，完整套件保留 14 个场景；一次构建、独立场景、清理后输出 PASS。设计调整后的执行结果与边界见 [Smoke Validation Evidence](./SMOKE-VALIDATION-EVIDENCE.md)；下文已注明提交的旧记录仍仅代表历史验证。

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

## Requirement Coverage

| Requirement                               | 状态     | 当前覆盖                                                                                                                                         | 主要缺口                                                                                     |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| FR-1 DSH 插件形态                         | 已实现   | package、双 bundle、provider gate、profile evidence                                                                                              | 高于最低版本的兼容与分发策略未决定                                                           |
| FR-2 会议与身份隔离                       | 已实现   | Meeting、Participant、Session、repository ownership 隔离                                                                                         | 远程、多用户、跨 Host 不支持，属于 V1 非目标                                                 |
| FR-3 有序连续发言                         | 已实现   | 单一 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝、reassign/skip                                                               | 无                                                                                           |
| FR-4 发言计划与选择                       | 已实现   | Manager/round-robin/rule-based/hybrid planning、资格校验、required Participant waiting、确定性 fallback、自动 stall/refocus/replan；新增五收敛场景真实 DSH 验证通过                                                            | 时间预算、blocking Position 分支等真实运行边界见收敛专项证据                                              |
| FR-5 异步任务与举手                       | 已实现   | MeetingTask、HandRaise、恢复、幂等、task evidence；start replay 在最新 task snapshot 已为 `running` 时跳过 Catalog preview 并进入 receipt replay | 外部副作用 exactly-once、长期压力未覆盖                                                      |
| FR-6 议题范围与发散控制                   | 已实现   | Question/Issue/Proposal/Position、候选 promote/park/reject、原子 commit、幂等、status/archive；全量验证及收敛真实 DSH 验证通过                                      | UI/HTTP/Client、时间预算、blocking Position 分支等真实运行边界见收敛专项证据                             |
| FR-7 提案、立场与决策                     | 已实现   | Proposal revision、Position、Decision candidate、Captain acceptance、Decision/risk projection、单 Issue risk disposition                         | 完整 FR-7 外的产品 UI 控制未覆盖                                                             |
| FR-8 完成事实与会议结束                   | 已实现   | completion/end、task evidence、终态 projection、恢复和幂等、收敛预算耗尽后的 stalled/no_consensus 终止；两类硬预算业务优先真实 DSH 验证通过                                                                                       | Decision/Agenda 细节属其他范围；时间预算未覆盖                                        |
| FR-9 暂停、恢复与故障隔离                 | 已实现   | pause/resume、timeout、reassign/skip、interrupt/drain、cold rebind、per-Meeting isolation                                                        | 无                                                                                           |
| FR-10 记录、隐私与归档                    | 部分实现 | transcript、meeting mail、archive、Session cleanup、continuation                                                                                 | Scribe minutes 契约、projection、状态/归档路径未实现                                         |
| FR-11 可观察性与用户控制                  | 已实现   | Meeting list/status、pause/resume/reassign/end、Client polling/refetch 和主要状态区块；G4 已验证 pause/resume/end 及 Reassign Browser control    | risk/Decision disposition 未覆盖；metrics、远程/多用户未覆盖                                 |
| FR-12 Agent 内部能力边界                  | 已实现   | 只消费正式提交和授权 task projection，不写自定义 DSH Session Event                                                                               | 后续 Mail/Web/UI 路径须保持该边界                                                            |
| FR-13 Agent 角色目录与参会推荐            | 部分实现 | Phase 1 的 Catalog consumer、attempt binding、safe projection、recommendation claim 与 pending projection 已实现并通过本地验证                   | Captain disposition、admission、provisioning、FR-14、UI、真实 Host producer smoke 不在本阶段 |
| FR-14 共享 Preset 下的 Agent Definition | 未实现 | 9 个样本、hash 和负向 fixture；2026-09-07 已确认首版范围收窄 | 内联配置解析、共享父 Preset/Skill 校验、persona/toolFilter 注入、provenance 与真实冷恢复验证 |
| FR-15 Developer Markdown Projection       | 已实现   | committed snapshot/package → current/archive Markdown；白名单、受控路径、latest/stale、原子替换、failure isolation、dispose                      | multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理未覆盖                                  |

### Convergence 实现与证据边界

正式路径 `plugin/src/domain/transitions/speaker-submission.ts` 和 `speaker-attempt.ts` 调用 `turn-advancement.ts::advanceAfterSpeakerSubmission`，已实现 progress fingerprint、stall 计数、refocus、replan 及预算耗尽后的 `partial/stalled` 或 `no_consensus` 终止。`plugin/tests/unit/domain/transitions/turn-advancement.spec.ts` 覆盖首次 fingerprint、refocus → replan → stalled 和 blocking disagreement 下的 no_consensus；planning 与 Manager fallback 的单测分别位于 `plugin/tests/unit/domain/planning.spec.ts` 和 `plugin/tests/unit/runtime/manager-fallback.spec.ts`。

2026-09-07 在干净基线 `5f0cc145df8dd194242220730dc1ab359e943573` 完成原 `convergence` 和五个新增收敛 selector 的真实 DSH 运行：四次空提交至 stalled、合法 blocking question 至 no_consensus、Proposal 同时重置两计数、Turn/message 两类预算边界先 converging 后 Captain completed。五新增均归档、迟到提交拒绝且状态不变、两个 Session drained；六次 wrapper 和精确临时根/端口 Restore 均通过。完整 verify 为 75 files、3670 tests。详见 [Convergence Runtime Validation Evidence](./CONVERGENCE-RUNTIME-VALIDATION-EVIDENCE.md)。

该证据只更新 FR-4/FR-6/FR-8 的收敛验证范围；fingerprint 为间接观测，时间预算、blocking Position、事务故障注入、冷重启、模型及 Browser 未覆盖。下述历史记录保持原始基线，不外推为本次其他 selector 的新运行证据。

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
- risk/Decision disposition 没有正式 browser/HTTP/Client write control。
- Question 的 required-review/risk evidence、Decision candidate 完整生命周期未实现。自动 stall/refocus/replan 已有正式路径和单测，完整链路的真实 DSH smoke 未覆盖。
- FR-13 Phase 1 的 Agent Catalog safe projection、Manager recommendation claim 和 pending projection 已完成本地 fake-port/isolated-storage 验证；真实 Host producer smoke、Captain admission 和 Meeting Agent Definition runtime 不在该阶段。
- 结构化 metrics、stress/长期资源泄漏和生产发布验证未实现或未覆盖。
- Developer Markdown 的 multi-Host、远程 workspace、跨进程锁、旧文件迁移/清理未覆盖；current/archive 文件仍为非权威本地诊断输出。

## Closure

当前 target HEAD 可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不可描述为完整会议产品、真实模型链路或发布就绪。当前 HEAD 的本地验证已记录；真实 DSH selector、pause/resume/end browser control 和 cleanup 仍仅适用于文中明确标注的历史 target evidence，不外推为本次 HEAD 的新运行证据。
