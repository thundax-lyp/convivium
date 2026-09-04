# Current Implementation Coverage

## Scope

本文记录当前代码相对已确认需求的实现覆盖，不替代需求、接口或设计文档。

- 记录日期：2026-09-03
- 代码基线：`2f49e1af2d09206cb763a39676151a9d4466c80b`
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

| Requirement                               | 状态     | 当前覆盖                                                                                                                                           | 主要缺口                                                                        |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| FR-1 DSH 插件形态                         | 已实现   | package、双 bundle、provider gate、profile evidence                                                                                                | 高于最低版本的兼容与分发策略未决定                                              |
| FR-2 会议与身份隔离                       | 已实现   | Meeting、Participant、Session、repository ownership 隔离                                                                                           | 远程、多用户、跨 Host 不支持，属于 V1 非目标                                    |
| FR-3 有序连续发言                         | 已实现   | 单一 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝、reassign/skip                                                                 | 无                                                                              |
| FR-4 发言计划与选择                       | 已实现   | Manager/round-robin planning、资格校验、required Participant waiting、确定性 fallback                                                              | 自动 stall/refocus/replan 未实现，属于 Non-goal                                 |
| FR-5 异步任务与举手                       | 已实现   | MeetingTask、HandRaise、恢复、幂等和 task evidence                                                                                                 | 外部副作用 exactly-once、长期压力未覆盖                                         |
| FR-6 议题范围与发散控制                   | 部分实现 | Question/Issue/Proposal/Position/Agenda candidate 的已实现提交和 blocking Question 校验                                                            | 不属于 D1-D10 的 Agenda candidate 管理；stall/refocus 未实现，属于 Non-goal     |
| FR-7 提案、立场与决策                     | 已实现   | Proposal revision、Position、Decision candidate、Captain acceptance、Decision/risk projection、单 Issue risk disposition                           | 完整 FR-7 外的产品 UI 控制未覆盖                                                |
| FR-8 完成事实与会议结束                   | 已实现   | completion/end、task evidence、终态 projection、恢复和幂等                                                                                         | Decision/Agenda 细节与 stall/refocus 属其他未完成范围                           |
| FR-9 暂停、恢复与故障隔离                 | 已实现   | pause/resume、timeout、reassign/skip、interrupt/drain、cold rebind、per-Meeting isolation                                                          | 无                                                                              |
| FR-10 记录、隐私与归档                    | 部分实现 | transcript、meeting mail、archive、Session cleanup、continuation                                                                                   | Scribe minutes 契约、projection、状态/归档路径未实现                            |
| FR-11 可观察性与用户控制                  | 已实现   | Meeting list/status、pause/resume/reassign/end、Client polling/refetch 和主要状态区块；G4 已验证 pause/resume/end 与 reassign skip browser control | risk/Decision disposition、metrics、远程/多用户未覆盖                           |
| FR-12 Agent 内部能力边界                  | 已实现   | 只消费正式提交和授权 task projection，不写自定义 DSH Session Event                                                                                 | 后续 Mail/Web/UI 路径须保持该边界                                               |
| FR-13 Agent 角色目录与参会推荐            | 未实现   | 已有接口契约和样本                                                                                                                                 | Catalog、recommendation、Captain disposition、admission、provisioning、恢复、UI |
| FR-14 Agent Definition 与 DSH composition | 未实现   | 9 个样本、hash 和负向 fixture                                                                                                                      | Definition resolution、Preset/Skill validation、差异化 Session composition      |

## Executed Validation

2026-09-03，在 target HEAD `2f49e1af2d09206cb763a39676151a9d4466c80b` 执行 `pnpm --dir plugin verify`：

- Pass：format、lint、Host/Client typecheck、build、environment、contract、Agent Definition samples、package verifier。
- Pass：73 test files、525 tests。
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
- Pass：2026-09-04，commit `9b43bab4e284a902bb19360a2f365733e46a3f7a` 的 reassign browser run；probe 为 `browserReady=true`，真实 Browser 观察 Current speaker=`participant-a`、空理由 disabled、填写后 enabled、单击 skip 后 refetch 为 `waiting` 且旧控件消失、无 alert，刷新后旧控件仍未出现；wrapper 输出 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok` 且 exact temp root 不存在。该证据不外推为 Browser 已观察 replacement、drain 或 transcript。
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
- Question 的 required-review/risk evidence、Agenda candidate 管理、Decision candidate 完整生命周期和自动 stall/refocus/replan 未实现。
- Agent role catalog、Manager recommendation、Captain admission 和 Meeting Agent Definition runtime 未实现。
- Developer Markdown、结构化 metrics、stress/长期资源泄漏和生产发布验证未实现或未覆盖。

## Closure

当前 target HEAD 可描述为“已验证的会议后端核心与本地单用户会议控制闭环”，不可描述为完整会议产品、真实模型链路或发布就绪。真实 DSH selector、pause/resume/end browser control 和 cleanup 已在本 target evidence 中记录；历史记录仍不外推。
