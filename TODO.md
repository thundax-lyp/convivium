# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `plugin/`：建立 DSH Runtime 执行基线
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T0
  - 处理动作：创建独立 `codex/` 分支，记录工作区、Node、pnpm 和 DSH 版本。
  - 验收点：基线状态可回溯，工作区无无关改动。

- [ ] `plugin/`：通过现有静态基线验证
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T0
  - 处理动作：运行 `verify:environment`、`verify:contract`、`typecheck` 和 `test`。
  - 验收点：四个命令均通过并记录输出。

- [ ] `plugin/profile`：定位 continuable provider 候选
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 确认 provider 是正式接入前置条件；T1
  - 处理动作：从当前 DSH 安装、官方文档和类型/源码确定 provider package、provider name 和版本。
  - 验收点：候选均有官方 package/source/version 依据；不使用 mock、自制 provider 或仅凭包名猜测。

- [ ] `plugin/profile`：建立临时 DSH profile
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T1
  - 处理动作：在临时 profile 中组合 provider 与 Convivium bundle，并配置临时 workspace、端口和日志目录。
  - 验收点：profile 文件和所有临时路径可定位，未修改用户 profile。

- [ ] `plugin/profile`：验证 provider 的 `prepareContinuable` 能力
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 确认 provider 是正式接入前置条件；T1
  - 处理动作：运行 `dsh --profile <temporary-profile> --dump-config`，证明 provider 注册先于 Convivium capability gate，并用公开 registry 检查能力。
  - 验收点：dump-config 显示 provider；运行时 `getProvider(name)` 可解析且 `prepareContinuable` 是函数；没有 sibling registration race。

- [ ] `plugin/profile`：验证 continuable child 的完整生命周期
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T1
  - 处理动作：使用专用 live parent Agent 执行 `startContinuable`、followup、cold resume、interrupt 和 `drainContinuableChildren` 探针。
  - 验收点：返回 `{ childId, messageId }`；followup 与 cold resume 可接受；interrupt/drain 只清理目标 child tree。

- [ ] `plugin/profile`：完成 provider 人工确认门
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 明确采用待讨论项建议；T1
  - 处理动作：提交 provider package/name、exact version、安装来源、profile manifest、`prepareContinuable`、启动和清理证据，暂停等待用户确认。
  - 验收点：用户确认 exact provider tuple，结论写入正式文档，待讨论项删除；确认前不执行 T2。

- [ ] `plugin/src/config.ts`：定义 Runtime 配置 Schema
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T2
  - 处理动作：实现 provider、data root、participant 上限、speaker timeout 和 outbox poll 配置及校验。
  - 验收点：缺失 provider、非法路径和非正时间值被拒绝；合法 profile 配置可解析。

- [ ] `plugin/src/index.ts`：实现启动期 DSH 版本与 provider 检查
  - 依据文档：`docs/00-governance/ARCHITECTURE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T2
  - 处理动作：在 T1 已证明的注册顺序下使用 `getProvider()` 检查 provider 与 `prepareContinuable`；激活期不调用 `startContinuable()`。
  - 验收点：能力缺失时不注册会议 tools；错误包含版本或 provider 原因；不会创建探针 Session。

- [ ] `plugin/src/index.ts`：绑定插件注册与卸载 disposer
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T2
  - 处理动作：为 Runtime、worker、tools 和 timers 建立结构化生命周期清理。
  - 验收点：正常卸载后无 tool、timer、worker 或未处理 rejection 残留。

- [ ] `plugin/src/dsh/labels.ts`：实现 meeting Session label 编解码
  - 依据文档：`docs/00-governance/ARCHITECTURE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：生成并严格解析 Manager/Participant label，拒绝模糊前缀和非法 identity。
  - 验收点：合法 label 可往返解析；跨 team/meeting/participant label 被拒绝。

- [ ] `plugin/src/dsh/provisioning.ts`：生成 Session provisioning envelope
  - 依据文档：`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T3
  - 处理动作：生成包含 meeting/team/role/participant 和 `capability='none'` 的确定性首次 prompt。
  - 验收点：Manager/Participant envelope 可验证；内容不授予 planning/speaker capability，不进入 MeetingState。

- [ ] `plugin/src/repository/schema.ts`：扩展 Session ownership DDL
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T3
  - 处理动作：为 ownership 增加 `parentSessionId`、provider 和可选 `initialMessageId` 列及约束。
  - 验收点：新库 DDL 完整；字段不可空性和 lifecycle 约束与正式接口一致。

- [ ] `plugin/src/repository/migrations.ts`：迁移 Session ownership 字段
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T3
  - 处理动作：增加连续 schema migration，迁移或隔离缺少不可推断 ownership 字段的旧库。
  - 验收点：空库和已知旧版本可按契约处理；未知/不可推断数据 fail loud，不猜测 parent/provider。

- [ ] `plugin/src/repository/index.ts`：实现 Session ownership 写入规则
  - 依据文档：`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T3
  - 处理动作：持久化 immutable parent/provider/identity，并允许首次补写 initialMessageId、lifecycle 前进和 capability revoke。
  - 验收点：非法字段变更、生命周期回退、第二个 initialMessageId 和跨 Meeting 写入均被拒绝。

- [ ] `plugin/src/dsh/caller-resolver.ts`：绑定 Captain direct parent
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：将 create caller 的 `exec.agent` 绑定为四个 meeting-owned Session 的精确 Captain parent。
  - 验收点：ownership 中 parentSessionId 与真实 Captain Session 一致；显示名或 payload Session ID 不能替代绑定。

- [ ] `plugin/src/dsh/caller-resolver.ts`：解析 Manager/Participant caller
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T3
  - 处理动作：将 `exec.agent` 与完整 ownership、meetingId、role、participantId 和 capability 绑定。
  - 验收点：错误 caller、provisioning caller 和 revoked caller 返回稳定授权错误。

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

- [ ] `plugin/src/domain/`：映射 canonical create input
  - 依据文档：`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T4
  - 处理动作：把 objectiveContract、agenda、participants、limits 和 selection mode 映射为完整 canonical MeetingState。
  - 验收点：正式 ID、引用和 defaults 完整；没有裁剪版 MeetingState 或第二套字段。

- [ ] `plugin/src/domain/`：拒绝本竖切未支持的 create capability
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T4
  - 处理动作：对非 `round_robin` selection mode 和 continuation 返回无副作用 `UNSUPPORTED_CAPABILITY`。
  - 验收点：错误 `retryable=false`；不创建目录、bootstrap、Session 或 Meeting。

- [ ] `plugin/src/domain/planning.ts`：实现 round-robin Turn plan
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4
  - 处理动作：为 active agenda 和 Participant 顺序生成 canonical Turn、SpeakerStep 和 instruction。
  - 验收点：Turn 含 agendaItemId/intent/objective/expectedOutputs/prohibitedTopics；计划固定且无重复。

- [ ] `plugin/src/domain/transitions.ts`：补齐 speaker assign/submit 转换
  - 依据文档：`docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T4
  - 处理动作：实现 attempt identity、expected version、agendaItemId、delivery acknowledgement、stale submission、Turn waiting 和 transcript commit。
  - 验收点：重复、迟到、错误身份提交均不改变正式状态；每次转换产生正确 event effect。

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

- [ ] `plugin/src/protocol/`：增加 `UNSUPPORTED_CAPABILITY` 错误契约
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 同意 review 建议；T5
  - 处理动作：同步更新 canonical type、schema、error mapping 和 contract fixture。
  - 验收点：合法但本竖切未实现的 capability 不再伪装成 `INTERNAL_ERROR`。

- [ ] `plugin/src/tools/register-tools.ts`：注册 create/status tools
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T5
  - 处理动作：使用 `defineTool`、canonical output 和 `exec.agent` 注册 `convivium_create_meeting` 与 `convivium_meeting_status`。
  - 验收点：Captain 可创建和读取会议；未授权 caller 不进入 Runtime 写入口。

- [ ] `plugin/src/tools/register-tools.ts`：注册 submit/pause/resume tools
  - 依据文档：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T5
  - 处理动作：注册当前 Participant 的 `convivium_submit_turn` 与 Captain 的 pause/resume tools。
  - 验收点：权限矩阵、mandatory output、错误 envelope 和幂等语义均通过 contract tests。

- [ ] `plugin/src/projection/status.ts`：实现 caller-specific status projection
  - 依据文档：`docs/00-governance/ARCHITECTURE.md`、`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T5
  - 处理动作：从完整 canonical MeetingState 生成 Captain/Manager/Participant 可见状态，不读取隐藏 Session 内容。
  - 验收点：所有 required projection 字段存在；不包含 capability、隐藏 prompt、私有工具输出或原始 DSH payload。

- [ ] `plugin/tests/contract`：锁定本竖切不注册 Meeting HTTP route
  - 依据文档：`docs/30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md`
  - 确认依据：用户于 2026-08-26 明确采用待讨论项建议；T5
  - 处理动作：验证 Host 只注册五个会议 Tools，未注册 status/pause/resume Meeting Web routes。
  - 验收点：没有 DSH Web user authorization adapter 时，构建产物不存在无授权 HTTP 控制面。

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
  - 确认依据：用户于 2026-08-26 要求实现全部 RUNBOOK 内容；T5
  - 处理动作：覆盖五个 Tool 的 caller matrix、canonical output/error 和 projection required fields。
  - 验收点：Captain/Participant 权限正确；未授权 caller 无写入；敏感字段不可见。

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
