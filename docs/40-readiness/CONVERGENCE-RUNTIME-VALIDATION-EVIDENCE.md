# Convergence Runtime Validation Evidence

## Scope

2026-09-07 在独立分支完成自动收敛的真实 DSH 验证。运行基线为干净提交 `5f0cc145df8dd194242220730dc1ab359e943573`；六次运行期间没有 tracked file 变化。后续提交仅迁移文档，不改变运行代码。

环境：Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、固定 DSH `0.1.1-rc.2`、profile `web`、provider `spawn`。通过标准 `pnpm --dir plugin smoke:profile`，分别设置六个 selector；每次独立 Host、临时 workspace、DSH_HOME、profile 和端口。未设置 DSH binary override 或 Browser mode；未调用真实模型。

依据：[需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-4、FR-6、FR-8.8、BR-3、D6–D10；[Agent Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)；[Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)。复跑入口见 [DSH smoke 操作](../50-operations/HOW-TO-DSH-SMOKE.md)。

## Validated Contract

| 范围 | 实际验证 |
| --- | --- |
| S1 原 fallback | 保留原 `convergence`；非法 Manager plan 触发 deterministic fallback，相同请求重放结果和版本不变 |
| S2 停滞链 | 四次正式空提交；前三个 checkpoint 为 stall/replan 0/0、1/0、2/1，下一 Turn reason 依次 explore、refocus、replan；第四次 partial/stalled |
| S3 无共识 | 第一条正式提交创建引用未满足 criterion 的 blocking question；后续三次空提交，最终 no_consensus；活动投影与归档保留问题 |
| S4 进展重置 | 第四条提交唯一新 Proposal；第四 checkpoint 两个计数同时归零，重复 refocus/replan，第七条 partial/stalled |
| S5 预算优先级 | Turn budget=2 和 message budget=2 独立运行；第二条合法 claims 引用第一条消息，先 converging 且无下一 Turn，再由 Captain 显式 completed/objective_satisfied |
| S6 终态与清理 | 五新增场景最终 archived；同一旧 Agent/旧提交被拒绝，归档和版本不变；Manager/Participant continuable child inactive、无 resident Session；六次 wrapper Restore 通过 |
| S7 工程闭合 | 五 selector 接线、完整 Result 校验、probe 正反例、原 selector 回归、完整 verify、操作说明及 coverage 同步 |

fingerprint 只通过正式提交后的计数和下一 Turn 间接观测，没有读写私有状态。自动提交达到业务条件返回 `converging`，本证据不声称系统自动进入 `completed`。三个停滞场景没有调用 Captain end；归档通过 Captain status 驱动既有恢复路径。

## Executed Validation

### 本地验证

- `pnpm --dir plugin verify`：全部通过；75 test files、3670 tests，包含 format、lint、Host/Client typecheck、test、build、environment、contract、9 个 Agent Definition samples 和 package。
- 其中 Result contract 为 3055 tests；共享 fixture 先由正式 `MeetingStatusResultSchema` 独立验收。覆盖缺字段、错误类型/常量、ID/序号/版本重复或错配、两层 termination、archive 层级、transcript、question/proposal/completion facts、late rejection 和 Session drain。
- 实际执行五个 driver 的 probe suite 为 30 tests；每个成功输出再通过 Result validator。失败用例覆盖 context 错配、计数错误（含重置后 replan 未归零）、错误终态、缺少 criterion/归档实体、迟到提交异常或成功、归档改变及 Session 未清理。
- source contract 30 tests，包含新增五入口唯一分派及自动 participant driver 早退；既有 turn-advancement 六项测试随完整 suite 通过。
- 已知旧实现增量在整理前做独占临时备份并验证 SHA-256；旧失败提交历史保留。fixture 测试不作为真实运行证据。

### 六次真实运行

所有命令退出 0，最终 wrapper JSON 的 profile/provider 正确，probe 通过对应 validator。原 `convergence` 的 Meeting 为 `meeting-d99cf43fc6f1029c56eff81fcf5958cb`，fallback/replay 都返回 `turn-1`、`turn-1-attempt-0`、`manager_plan_invalid`，status version=2，三标签为 `deterministic-fallback`、`fallback-replay-idempotent`、`fallback-status-projected`；它不属于归档场景。

| 新 selector | Meeting ID | submit versions | 最后 submit | archive version | archivedAt（Runtime epoch ms） |
| --- | --- | --- | --- | --- | --- |
| `convergence-stalled` | `meeting-986e272e920f04b032c9d38cbba1f1d9` | 2, 3, 4, 5 | `partial` | 7 | 1788758527918 |
| `convergence-no-consensus` | `meeting-84427f978300a24158f72865e94509b0` | 2, 3, 4, 5 | `no_consensus` | 7 | 1788758537042 |
| `convergence-reset` | `meeting-6a09a4acc5defc7e7a3dcaca3242fd7a` | 2, 3, 4, 5, 6, 7, 8 | `partial` | 10 | 1788758546685 |
| `convergence-turn-budget-completion` | `meeting-56a394328b2af3bde8ba9ba078348552` | 2, 3 | `converging` | 6 | 1788758555922 |
| `convergence-message-budget-completion` | `meeting-1f1dfa04e427b9380f433e635d09bab3` | 2, 3 | `converging` | 6 | 1788758564693 |

五个场景的实际 observed 均满足：

- messageSeq 与 turnSeq 连续从 1 到提交总数；第一 delivery 为 `delivery-0`，后续为 `turn-N-delivery-0`；每条 messageId 为 `message-` 加 deliveryId。每次从当前 attempt 的真实 Speaker context 获取 ID，不推导首次 attempt。
- formalTranscript 长度分别为 4、4、7、2、2；id、seq、turnId、speaker 和 `selector:a:N` 内容逐条对应提交结果。
- archived status 不包含活动 Turn、Attempt、Speaker 和计数；meetingTasks/pendingHandRaises 为空；顶层与 archive.package 的 termination 共有字段一致。
- lateSubmit 实际为 `{kind:"tool",code:"AGENT_NOT_LIVE"}`；拒绝前后完整 archived result JSON 和 meetingVersion 相同，`stableAfterLateSubmit=true`。
- children 为该 Meeting 的 `-manager-manager` 和 `-participant-participant-a` 两个 ID，均 `mode=continuable,activity=inactive`；`residentSessionIds=[]`。

stalled/no_consensus 的 checkpoints 分别为版本 2/3/4 的 0/0、1/0、2/1；reset 的版本 2–7 为两组同样计数，下一 Turn 为 turn-2 至 turn-7。默认 maxStalls=3、maxReplans=1 均从状态回读。

no_consensus 的 question 为 `question-delivery-0-1`，askedBy=participant-a、blocking=true、status=open，引用 `criterion-smoke-order`；两个 termination 的 unresolvedQuestionIds 均只包含此 ID。reset 的 Proposal 为 `turn-4-delivery-0-proposal-1`、revision=1，最终归档保留。

两种预算的实际 limits 分别为 maxTurns/maxSpeakersPerTurn/maxTotalMessages=2/1/100 和 10/1/2。第二 checkpoint 均 version=3、status=converging、stall/replan=0/0、nextTurnId/intent/reason=null；Captain end 返回 completed/objective_satisfied。归档 criterion 已 satisfied、agenda 已 resolved，两条 active completionFacts 分别为 criterion_evidence 和 agenda_resolution，证据均只引用 `message-delivery-0`。

断言标签：三个停滞场景共有 first-progress-baseline、refocus-observed、replan-observed；stalled/reset 为 partial-stalled，question 为 blocking-question-no-consensus；reset 额外具有 progress-resets-both-counters、refocus-after-reset、replan-after-reset。两个预算场景为 last-valid-turn-before-budget、business-completion-before-budget、captain-completed-after-converging。五新增均具有 terminal-submit-rejected、archive-consistent、sessions-drained；标签之外的完整 observed 由 validator 实际校验。

### Restore

六次均等待 wrapper 完整退出，再从其最终 JSON 的 dumpConfig 推导唯一临时根，确认属于 OS tmpdir 下的 convivium-dsh-smoke- 前缀且不存在；用该 JSON 的 port 在 127.0.0.1 执行 exclusive bind 并立即 close，均成功。每次独立检查后才启动下一 selector。没有使用全局进程终止或目录通配删除。临时根和端口数值未另行留存，结论来自运行时逐次检查成功，不外推为一般进程树/长期资源泄漏证明。

## Not Covered

- 时间预算边界、独立 replan budget 耗尽、blocking Position 分支、Manager/hybrid 全矩阵、task/mail cancellation 扩展。
- fingerprint 内部字节、receipt/outbox 或事件顺序、数组部分非法与事务 rollback 的真实 DSH 故障注入；现有对应 unit/contract suite 通过不等于新增 runtime 证据。
- stale version、同 key 异 hash 未在新增 selector 中主动注入。
- 冷重启/cold-rebind 未在本次重跑；仅覆盖 status 驱动的归档恢复，不证明 Host restart/reopen。
- 真实模型、Browser/Client/HTTP 全矩阵、长期 stress/soak、memory/FD budget、跨 Host、生产发布。
- 原有其他 11 个 selector 未在本次重跑，不宣称 17 个 selector 全量真实通过。

## Closure

S1–S7 的代码、正反例、六场景运行和 Restore 已完成；长期入口迁移到操作文档，收敛覆盖及剩余边界接入 [Current Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)。没有改变正式产品协议、领域状态机或配置；TODO 无已登记的本任务项。

收口时在 `ab4ef4c` 加本次文档 diff 的边界重新执行完整 `pnpm --dir plugin verify`，全部通过（75 files、3670 tests）；三个迁移文档共 8 个相对链接和 `git diff --check` 通过。执行期间按步骤完成、删除已完成机械段并分别提交；最终删除临时执行文档，并复查无残留引用及断链。历史失败增量备份保留供追溯；不自动清除用户原有备份。
