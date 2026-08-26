# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/src/index.ts`：绑定插件注册与卸载 disposer
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T2
  - 处理动作：为 Runtime、worker、tools 和 timers 建立结构化生命周期清理。
  - 验收点：正常卸载后无 tool、timer、worker 或未处理 rejection 残留。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 provider capability adapter
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：封装 `getProvider()`、provider name 和 `prepareContinuable` 方法检查。
  - 验收点：检查本身不创建 Session；能力缺失明确失败；真实启动只在创建方法和 T1 smoke 中发生。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 Manager Session 创建
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：使用预留 childId、Captain parent、provider 和 provisioning envelope 创建 Manager Session。
  - 验收点：返回 childId/initialMessageId 与 ownership 一致；Manager provisioning 不产生 plan 事实。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 Participant Session 创建
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：使用预留 childId、Captain parent、provider 和 provisioning envelope 创建独立 Participant Session。
  - 验收点：三个 session id 唯一并与 participantId 一一绑定；首次消息不授予 speaker capability。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 continuable followup
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：使用精确 live Captain parent 封装 followup，并在调用前后重新校验 capability、attempt 和 ownership。
  - 验收点：parent 缺席、迟到或 revoked 调用不被投递，也不形成会议事实。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 continuable interrupt/drain
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：封装 interrupt 与 `drainContinuableChildren()`，按精确 parent/child ownership 限定目标。
  - 验收点：释放目标 meeting-owned Activation，不影响同 parent 的其他 child 或其他 parent tree。

- [ ] `plugin/src/dsh/session-adapter.ts`：实现 owned Session inspection
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：使用持久 parentSessionId 调用 `listChildren`/`listDescendants`，与 repository-bound meetingId、ownership 和完整 label 交叉校验。
  - 验收点：缺少任一归属证明的 Session 只记录诊断、不执行 followup、interrupt 或 drain。

- [ ] `plugin/src/domain/transitions.ts`：补齐 pause/resume 转换
  - 依据文档：`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4/T6
  - 处理动作：实现 attempt/Turn revoke、暂停事实、重新规划和幂等恢复规则。
  - 验收点：pause 不回滚正式事实；resume 不复活旧 Turn/attempt/capability。

- [ ] `plugin/src/repository/index.ts`：接入 Runtime command transaction
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4/T6
  - 处理动作：将 expected version、transition、state、event、receipt 和 outbox 绑定到同一 SQLite transaction。
  - 验收点：commit 前不调用 DSH；失败事务不留下部分状态；receipt 可重放。

- [ ] `plugin/src/runtime/meeting-runtime.ts`：实现会议创建应用服务
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4
  - 处理动作：执行 bootstrap → 四条 provisioning ownership → 四个 Session start → `completeCreate()`，并只用 provisioning envelope 作为首次 prompt。
  - 验收点：成功时公开 Meeting 与四条 active ownership 同时可读；失败时不形成部分可用 Meeting。

- [ ] `plugin/src/runtime/turn-runner.ts`：实现单 active attempt 调度
  - 依据文档：`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4
  - 处理动作：固定 agenda/context range，提交 delivery 后逐步 followup A、B、C，等待合法 submit 后再推进。
  - 验收点：A 后才请求 B，B 看到 A，C 看到 A+B；active attempt 始终不超过一个。

- [ ] `plugin/src/runtime/outbox-worker.ts`：实现提交后 DSH dispatch
  - 依据文档：`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4/T6
  - 处理动作：使用 bounded poll、lease、deliveryId 和 retry 状态在 transaction commit 后执行 DSH 副作用。
  - 验收点：DSH 调用不在 SQLite transaction 内；重复 claim、lease expiry 和 retry 不造成重复 transcript。

- [ ] `plugin/src/tools/register-tools.ts`：注册 create/status tools
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；2026-08-26 history audit
  - 处理动作：将已注册的 `convivium_create_meeting` 与 `convivium_meeting_status` 绑定到真实 Meeting Runtime。
  - 验收点：真实 Captain 可创建并读取会议；未授权 caller 不进入 Runtime 写入口。

- [ ] `plugin/src/tools/register-tools.ts`：注册 submit/pause/resume tools
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；2026-08-26 history audit
  - 处理动作：将已注册的 submit/pause/resume tools 绑定到真实 Meeting Runtime。
  - 验收点：真实 caller 权限矩阵、mandatory output、错误 envelope 和幂等语义均通过 contract tests。

- [ ] `plugin/src/runtime/recovery.ts`：实现 pause/resume 与 stale result 隔离
  - 依据文档：`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T6
  - 处理动作：pause 撤销 delivery capability 并 interrupt 运行中 Session；resume 从最新 SQLite 事实重新安排动作。
  - 验收点：旧 attempt 迟到提交返回 `STALE_ATTEMPT`；resume 不复用旧 attempt。

- [ ] `plugin/src/runtime/recovery.ts`：实现 bootstrap、ownership 和 outbox recovery
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T6
  - 处理动作：处理 `creating`、`ready`、active attempt、paused、过期 lease，并用四方归属证明检查 orphan Session。
  - 验收点：重启后状态和 transcript 保留；未知归属 Session 不被操作；可恢复 outbox 可重新领取。

- [ ] `plugin/src/runtime/recovery.ts`：实现 Captain live parent rebind
  - 依据文档：`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T6
  - 处理动作：重启后等待相同 Captain Session 的 Tool caller，校验 parentSessionId 后重新绑定 exact live Agent。
  - 验收点：parent 缺席时不 followup/drain；错误 Captain 不能接管；正确 caller 能恢复后续调度。

- [ ] `plugin/tests/integration/dsh`：验证 provider adapter 与 provisioning
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：覆盖 capability check、reserved childId、首次 prompt、followup、interrupt、drain 和 inspection。
  - 验收点：成功、provider 缺失、错误 parent、错误 label、revoked ownership 和精确清理均有断言。

- [ ] `plugin/tests/unit/repository`：验证 ownership schema 与 migration
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T3
  - 处理动作：覆盖 parent/provider immutable、首次 initialMessageId、lifecycle、revoke、迁移和损坏隔离。
  - 验收点：所有合法单调转换通过，所有身份漂移和未知 schema 被拒绝。

- [ ] `plugin/tests/unit/domain`：验证 canonical create 与 round-robin
  - 依据文档：`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T4
  - 处理动作：覆盖完整 create mapping、agenda selection、A/B/C plan 和 unsupported capability。
  - 验收点：canonical required fields 完整；unsupported 输入无 effect；plan 有序无重复。

- [ ] `plugin/tests/integration/runtime`：验证创建与串行 Turn
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4
  - 处理动作：覆盖 bootstrap/create、provisioning 隔离、single active attempt、A→B→C context 和 outbox retry。
  - 验收点：provisioning 输出不成事实；后续 speaker 只读取已提交前缀；无重复 transcript。

- [ ] `plugin/tests/contract`：验证 Tool 权限与 projection
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；2026-08-26 history audit
  - 处理动作：使用真实 Meeting Runtime 覆盖五个 Tool 的 caller matrix、canonical output/error 和 projection required fields。
  - 验收点：Captain/Participant 权限正确；未授权 caller 无 SQLite 写入；敏感字段不可见。

- [ ] `plugin/tests/recovery`：验证 pause/resume 与 parent rebind
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T6
  - 处理动作：覆盖 stale result、重复控制、重启、错误 Captain、正确 parent rebind 和 orphan isolation。
  - 验收点：旧 capability 不复活；parent 缺席不 dispatch；跨 Meeting/未知 Session 不受影响。

- [ ] `plugin/scripts/smoke-profile.mjs`：实现临时 profile 生命周期脚本
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求下一个范围必须可在 DSH 中执行；T7
  - 处理动作：以实际 package artifact 执行 prepare、dump-config、boot、精确停止和 restore。
  - 验收点：脚本失败也执行清理；不读取或删除用户 profile、workspace 和进程。

- [ ] `plugin/scripts/smoke-profile.mjs`：加入真实 create/turn/pause/resume/restart 断言
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求下一个范围必须可在 DSH 中执行；T7
  - 处理动作：通过 DSH Tools 记录并断言 meeting、ownership parent/provider/initialMessage、attempt、delivery、agenda、prior messages 和 context seq。
  - 验收点：A 的 prior message 为空，B 包含 A，C 按序包含 A+B；重启后同一 Captain 完成 parent rebind；未调用 Meeting HTTP route。

- [ ] `plugin/package.json`：接入分层 Runtime 验证入口
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T7/T8
  - 处理动作：让默认 `verify` 确定性覆盖 format/lint/typecheck/tests/build/package checks；增加独立 `smoke:profile`，并可增加显式 `verify:runtime` 顺序组合两层。
  - 验收点：`pnpm verify` 不要求模型凭据且不使用空测试占位；`pnpm smoke:profile`/`verify:runtime` 不隐藏外部验证失败。

- [ ] `docs/40-readiness/`：记录 DSH Runtime 竖切 readiness 证据
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`、`docs/40-readiness/CONVIVIUM-FRAMEWORK-EVIDENCE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T8
  - 处理动作：记录 DSH、provider、profile、Node、pnpm、package version、commit、命令结果和未覆盖边界。
  - 验收点：RUNBOOK 验证矩阵逐项有证据；TeamTask、mail、archive、完整 UI 等仍标为 `Not Covered`。

- [ ] `plugin/`：执行最终全量验证并检查清理
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T8
  - 处理动作：运行 format、lint、双 program typecheck、unit、contract、integration、recovery、build、package verifier 和 profile smoke，检查 `git diff --check` 与工作区。
  - 验收点：所有必选检查通过；临时进程/目录已清理；只有真正完成的 TODO 才能在对应 commit 中删除。

## 待审阅任务项

## 待讨论项
