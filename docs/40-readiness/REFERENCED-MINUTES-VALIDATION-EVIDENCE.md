# Referenced Minutes Validation Evidence

## Scope

- 日期：2026-09-07；平台 Darwin arm64，Node `v22.23.2`，pnpm `10.7.0`，DSH `0.1.1-rc.2`，profile `web`，provider `spawn`。
- 调查基线：`b4bed41634d4600e460040b1b93895b42c9671ac`；实现提交：T1 `9cf0e82`、T2 `0730567`、T3 `73373b0`、T4 `888a666`、T5 `77354b9`、T6 `007921b`、T7 `2854524`。最终验证对象为 `2854524` 加本次收口 diff（删除 smoke 临时诊断包装及文档）。
- 范围：FR-10.11、AC41 的 message-reference minutes draft，以及 FR-10.1–10 的固定回归。正式依据：[Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft)、[Domain Model](../30-designs/DOMAIN-MODEL-DESIGN.md)。

## Validated Contract

- 草稿附着在现有正式 message 上；正文为 content，metadata 为 status=draft、coverage 与有序 referencedMessageIds。只允许 summary/on_topic、空 changes/taskIds，禁止 replyTo/completionClaims；角色不增加权限。
- 只能引用本次 delivered context 中连续覆盖范围内的既有同会议正式消息。结构、权限、范围或任意引用非法时无部分状态、message、event、receipt、outbox/version 提交。
- 原 receipt 重放、hash 冲突、撤权、提交失败回滚、tail/checkpoint reopen 和旧数据 absent 兼容通过。草稿不产生决定、完成事实或 finalSummary，不阻塞 end/archive。
- 同一 committed message 经 status/context/HTTP/Client/archive 保留元数据；归档按公开字段 own-property presence 和值比较，数组同序；内部 turnSeq/attemptId/agendaRelation 保留但不作为公开字段 oracle。
- DSH 冻结 tool arguments。submit_turn 在 Schemastery 校验前取得独立副本，避免嵌套 transform 写回冻结输入；新增冻结输入回归先复现拒绝，修复后通过。Session 运行实例释放后，smoke 通过既有 followup 恢复同一 continuable Session 重放，不修改生产生命周期或授权。

## Executed Validation

所有命令从仓库根执行。T0 baseline verify 为 76 files / 664 tests；下表记录各步骤实际验证，最终完整运行结果如下。

| 步骤 | 实际命令 | 结果 |
| --- | --- | --- |
| T2 | `pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts`；`pnpm --dir plugin typecheck` | 80 tests、Host/Client PASS |
| T3 | `pnpm --dir plugin exec vitest run tests/unit/domain/transitions/speaker-attempt.spec.ts tests/unit/domain/transitions/speaker-submission.spec.ts`；`pnpm --dir plugin typecheck` | 41 tests、Host/Client PASS |
| T4 | `pnpm --dir plugin exec vitest run tests/contract/tool-registration.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/domain-meeting-repository.spec.ts`；`pnpm --dir plugin typecheck` | 三文件合计 94 tests、Host/Client PASS；冻结输入修复后 tool-registration 为 7 tests |
| T5 | `pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts`；`pnpm --dir plugin typecheck` | 61 tests、Host/Client PASS |
| T6 | `pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts`；`pnpm --dir plugin typecheck` | 42 tests、Host/Client PASS |
| T7 | `pnpm --dir plugin exec vitest run tests/contract/tool-registration.spec.ts tests/unit/scripts/scribe-minutes-probe.spec.ts tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts` | 4 files / 91 tests PASS |
| T7 真实 DSH | `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile` | 六项 oracle PASS；`restore=PASS`；exit 0 |
| T8 完整验证 | `pnpm --dir plugin verify` | exit 0；77 files / 803 tests；format、lint、Host/Client typecheck、build、environment、contract、9 definition samples、package 全 PASS |
| T8 Browser | `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`（PTY） | 实际 UI、刷新、partial end、archive、console 和 Restore PASS |
| T8 固定回归 | 下方固定命令 | 7 files / 195 tests PASS；23 个精确用例标题全部 PASS，无 skipped/todo |

T7 普通模式精确 oracle：`minutes-context-visible`、`minutes-invalid-atomic`、`minutes-replay-stable`、`minutes-http-equal`、`minutes-archive-equal`、`minutes-sessions-drained`。

失败及修复记录：初次真实运行在 summary Schema 返回 `INVALID_ARGUMENT`；冻结输入测试复现后修复。下一次原 Agent 重放返回 Session not live，驱动恢复同一 Session 后通过。`2854524` commit body 的 lint PASS 误记：临时诊断包装触发 preserve-caught-error；收口移除该包装，随后 lint 及 37 项 scenario tests PASS，最终仍以完整 verify 为门禁。未放宽任何成功断言。

固定回归命令：

```sh
git diff --exit-code b4bed41634d4600e460040b1b93895b42c9671ac -- plugin/src/runtime/services/meeting-dispatch-service.ts plugin/src/runtime/application-service/meeting-mail.ts plugin/src/runtime/services/meeting-archive-service.ts
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/contract/domain-meeting-repository.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/continuation.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/unit/runtime/archive.spec.ts tests/client/client-entry.client.spec.ts --reporter=verbose
```

三个受保护 production 文件的基线 diff 退出 0。静态依据：dispatchMail 固定 processingThroughSeq 并派发 transcriptDelta，派发前核验 ownership/capability/parent；meeting-mail 只处理既定邮件生命周期；materializeArchivePackage 使用明确 provenance 白名单。静态证据与下表动态测试分别记录。

### Browser 与恢复

- 本次实际 URL：`http://127.0.0.1:62919`；独立临时根 basename `convivium-dsh-smoke-ZpnYNl`；meetingId `meeting-d99cf43fc6f1029c56eff81fcf5958cb`。这些是已清理的验收环境标识，不是长期访问入口。
- Captain Session 页面标题 `Browser smoke session`，进入已注册 `Meetings` view 并选择 `Runtime smoke (running)`；版本 4。
- Transcript 顺序为 participant-a 的 `source-a`、participant-b 的 `Minutes draft based on source-a`。b 行显示 `Minutes draft (non-authoritative)`、`messages 1–1`、`message-turn-1-delivery-0`。来源行没有草稿标识；Accepted/Pending decisions 均为空。
- 刷新页面后重新选择会议，内容与 metadata 不变。End outcome 显示 `Partial`，输入 `scribe minutes smoke` 后点击 `End meeting`；显示 `archived`、版本 7。
- 归档后再次刷新并重新选择会议，来源与草稿正文及三项 metadata 保留；Termination reason 为 `scribe minutes smoke`，无运行控制。Browser 捕获的 warn/error console 列表为空。
- 在原 PTY 发送 SIGINT；wrapper exit 0，`PASS scribe-minutes ... restore=PASS`、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。精确临时根存在性检查为 absent，loopback 端口连接被拒绝，使用 SO_REUSEADDR 可重新绑定；关闭本次创建的 Browser tab。未处理其他运行的 smoke 资源。

### FR-10 固定映射

R1–R10 下列每个精确测试标题已在本次 verbose 输出中核对 PASS；R11 的 V1–V15 和 Browser 全部 PASS。路径相对 plugin/。

| ID / 条款 | 固定文件与精确测试名 | 已核对断言 / 证据 |
| --- | --- | --- |
| R1 / FR-10.1 | `tests/client/client-entry.client.spec.ts`：`maps active and terminal projections without mutating transcript order`；`tests/contract/status-projection.spec.ts`：`projects canonical proposal revisions and positions for later participants`；`projects question facts without inventing optional fields`；`tests/unit/domain/transitions/archive.spec.ts`：`snapshots termination facts before returning the terminal state` | 消息顺序及身份/议题映射不丢失；提案版本、立场、问题和终止事实保留；决定与未决问题另由 R6/R7 覆盖。 |
| R2 / FR-10.2 | `tests/contract/status-projection.spec.ts`：`maps only public canonical meeting facts`；`tests/contract/meeting-runtime.spec.ts`：`returns an existing equivalent pending hand raise without advancing the meeting`；R3 私聊用例 | 公开投影排除 Session/capability/prompt/planning/leaseToken；重复待处理举手不推进会议；mail 生命周期不进入 MeetingState。 |
| R3 / FR-10.3 | `tests/contract/domain-meeting-repository.spec.ts` 调用共享 `tests/contract/meeting-repository-behavior.ts`：`keeps private mail lifecycle atomic, idempotent, and out of MeetingState` | 保存发送 context/snapshotThroughSeq；拒绝越界和错误身份；幂等 receipt；mail 状态独立于正式会议状态。共享文件不能单独作为 Vitest 入口。 |
| R4 / FR-10.4 | R3 同一用例；静态依据 `src/runtime/services/meeting-dispatch-service.ts` 的 `createMeetingDeliveryDispatcher` / 内部 `dispatchMail` | 测试拒绝未来处理上界与重试改变既定上界；静态实现从当前 state.messageSeq 固定 processingThroughSeq，补充 `snapshotThroughSeq < seq <= processingThroughSeq` 的 transcriptDelta，派发前核对参与者 ownership/capability/parent。具体边界见 Not Covered。 |
| R5 / FR-10.5 | R3 同一用例；`tests/contract/meeting-runtime.spec.ts`：`delivers the MeetingTask execution and request bindings`；R4 静态依据与 `src/runtime/application-service/meeting-mail.ts` | mail finish 只改邮件状态，错误 attempt 不可完成；长任务 delivery 绑定既定任务；dispatch prompt 明确公开讨论走 raise_hand、长任务走 create_meeting_task；不借此次草稿新增后台行为。 |
| R6 / FR-10.6 | `tests/client/client-entry.client.spec.ts`：`fact visibility: complete facts replace across active, terminal and archive projections`；`maps waiting state without a current turn and archive package facts`；`fact visibility: decisions across lifecycle`；`maps active and terminal projections without mutating transcript order`；T6 验证 `keeps minutes separate from speaker, pending decisions, tasks, waiting and accepted decisions` | 现有测试覆盖当前发言者、waiting reason/participants 和决定生命周期；T6 新用例验证主持候选建议、任务、正式决定与草稿在独立 section 展示。新增用例 T6/T8 均 PASS。 |
| R7 / FR-10.7 | `tests/unit/runtime/archive.spec.ts`：`copies existing optional facts without fabricating missing fields`；`deep-copies committed facts`；`tests/unit/domain/transitions/archive.spec.ts`：`requires archive packages to include committed facts`；`tests/client/client-entry.client.spec.ts`：`does not expose controls for a terminal projection` | 归档保留决定/证据/问题/任务关联等已提交事实且不共享可变引用；缺 transcript 拒绝；终态无运行控制。 |
| R8 / FR-10.8 | `tests/unit/runtime/archive.spec.ts`：`preserves continuation source provenance without copying source runtime facts`；静态依据 `src/runtime/services/meeting-archive-service.ts` 的 `materializeArchivePackage` | 保留来源事实；participantProvenance 显式只取 participantId/displayName/role，归档字段不含 Session config/capability/private Session；R10 验证续会不继承。 |
| R9 / FR-10.9 | `tests/unit/runtime/archive.spec.ts`：`revokes before interrupt and drain, then closes without requiring durable child deletion`；`writes archived only after every owned Session is revoked and closed`；`does not finalize while an owned Session remains open`；`tests/contract/meeting-runtime.spec.ts`：`archives a local End and recovers from post-commit cleanup failure` | revoke → interrupt/drain → close；全部关闭才写 archived；清理失败可重试；不要求物理删除。 |
| R10 / FR-10.10 | `tests/contract/continuation.spec.ts`：`copies only explicitly selected archived material into a new meeting with new Sessions`；`rejects an existing but unarchived source before target creation` | 新 Meeting/Session；仅复制六类明确选择的材料；源状态不变，重放不重复创建；未归档源被拒绝。 |
| R11 / FR-10.11、AC41 | T2–T6 的指定测试文件中新增 V1–V13；T7 的 `tests/unit/scripts/scribe-minutes-probe.spec.ts` 及真实 selector；T8 Browser；R10 回归对应 V14 | V1–V15 均 PASS。coverage、引用、原子失败、无权威副作用、缺席/timeout/reassign、持久恢复与 Client/archive 均已通过；断言包含实际状态比较，不以 marker 替代结果。 |

### 草稿验证矩阵

T2–T8 对应上述命令及 Browser；V1–V15 全部 PASS；R4 的动态边界仍按 Not Covered 保留。

| ID | 场景 | 预期结果 | 验证来源 |
| --- | --- | --- | --- |
| V1 | 单点/多消息连续范围；引用子集 | 一条 draft message；范围与引用不被改写 | T2/T3/T7 |
| V2 | 空白/null/未知字段/超限/安全整数/逆序 | Schema 拒绝，Runtime 无调用或无 commit | T2/T4 |
| V3 | scope 洞/未来/范围外/self/跨 Meeting/私聊 ID | `INVALID_ARGUMENT`，无部分 message、event、receipt、outbox/version | T3/T4/T7 |
| V4 | Manager、Captain Session、其他 Participant/Meeting | 既有 `UNAUTHORIZED_CALLER`/`STALE_ATTEMPT` 边界，不写入 | T4 |
| V5 | stale version/attempt、terminal/archived | 既有 version/stale/immutable/archived 错误，无新草稿 | T3/T4/T5 |
| V6 | 一条合法引用与一条非法引用；混合六类 claims | 整体拒绝，所有状态与之前一致 | T2/T3/T4 |
| V7 | 相同请求、后续 Speaker 后重放、修改 hash | 原 receipt 稳定；changed hash 冲突；撤权不能重放成功 | T4/T7 |
| V8 | commit put 抛错后恢复重试 | 无半提交；只成功一次 | T4 |
| V9 | commit tail reopen、checkpoint reopen、旧数据 | 精确保留 metadata；旧消息保持 absent；非法新增结构拒绝读取 | T4 |
| V10 | status/tool/HTTP/context/Client | 同一 committed message；只读、无私有信息、刷新一致 | T5/T6/T7/T8 |
| V11 | archive 丢失/篡改 metadata、Session cleanup retry | 篡改拒绝；合法 metadata 保留；重试不改变 package | T5/T7 |
| V12 | Scribe 缺席、失败、替换 | 正式记录完整，原 end/archive 可完成；不等草稿 | T5；完整回归 |
| V13 | 草稿包含“已通过”“决定”等文字 | 不自动增加 CompletionFact/Decision 或改变 objective/finalSummary | T3/T5 |
| V14 | 续会选择 final summary | 不自动导入草稿或旧身份；原 continuation 回归保持 | T8 完整 verify |
| V15 | 构建、包与真实组合 | typecheck/build/contract 全 PASS；真实 web/spawn 调用六项 oracle | T7/T8 |

## Not Covered

- R4 的“发送后新增 transcript 再派发”的跨层动态场景目前 **Not Covered**；本次接受未变动派发源码与持久上界契约测试的组合证据，长期 evidence 必须逐字保留这一边界，不称为 mail integration 已通过。
- 只支持 message 引用；Fact、Decision、task、文件或外部 research 等其他类型的直接引用未实现。
- 确定性真实 DSH Session/工具/HTTP/Browser 接线不是模型生成质量证明；未执行 LLM 纪要质量 benchmark。
- 长期压力、多 Host/远程与多用户、遗留数据迁移、生产发布未覆盖；本次未运行全部 15 个 smoke selector，不把历史运行外推为当前证据。

## Closure

- 2026-09-07：T0–T8 完成，S1–S5、R1–R11 与 V1–V15 按本文边界全部 PASS。FR-10 提升为已实现，范围限 message-reference draft 及既定记录/隐私/归档路径。
- 长期协议/领域依据保留在正式文档；运行方式进入 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md)，当前状态进入 [Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)。
- 已迁移并删除临时执行文档和对应 TODO；删除前本地 Markdown 链接检查 53 项 PASS，删除后 38 项 PASS，临时文件名/标题搜索无残留（rg 退出 1、无输出）；`git diff --check` PASS。未执行 push、PR 或 merge。

## PR Integration Validation

2026-09-07 在发布前合入 `origin/main` 的 `03e3a0ef430362888439bf01c1beaf831342165f`，父分支为 `e9f08c212d65e487a43a2f8990834d5c9639ceff`。解决共享 Schema、归档 guard、Client 测试和证据文档的冲突，保留参会推荐拒绝、本地决策/风险操作与引用式纪要全部能力。前述 T0–T8 结果仍对应原提交边界；本节记录合并工作树的新验证，不把历史计数作为当前结果。

- `pnpm --dir plugin typecheck`：Host/Client PASS。
- `pnpm --dir plugin verify`：exit 0，78 files / 1000 tests；format、lint、typecheck、build、environment、contract、9 definition samples、package 全 PASS。
- `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile`：六项 oracle 和 `restore=PASS`，exit 0。
- `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`：再次通过真实 Meetings view 验证 source-a、draft 三字段、刷新保持、Partial End、archived 后刷新；版本 4 → 7，结束原因 `scribe minutes smoke`。warn/error console 为空。原 PTY SIGINT 后 exit 0、`restore=PASS`、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，本次精确临时根 `convivium-dsh-smoke-PjNXsX` 已删除。
- `git diff --exit-code origin/main -- plugin/src/runtime/services/meeting-dispatch-service.ts plugin/src/runtime/application-service/meeting-mail.ts plugin/src/runtime/services/meeting-archive-service.ts`：PASS，本分支没有修改最新 main 的三项服务；归档新增事实来自 main，其测试与 minutes guard 共同通过完整 verify。
- Not Covered 继续适用；本轮没有重新执行其他 selector 的 Browser 操作或模型质量测试。

### Latest Main Integration

2026-09-07 从 `d97da4d` 再合入 main `a2a6fb460713fcb8968a6578cf4528de0ebfe1ee`，保留 FR14 共享 preset/角色组合能力与引用式纪要测试。解决 coverage、README 和两组领域/runtime 测试冲突；smoke selector 合集同步为 16 个，core 仍为 5 个。

- 首次 verify 因本地尚未安装 main 新增依赖而在 typecheck 失败；执行 `pnpm --dir plugin install --frozen-lockfile` 后重新验证，lockfile 无额外变化。
- `pnpm --dir plugin verify`：exit 0，82 files / 1039 tests；format、lint、typecheck、build、environment、contract、definition samples、package 全 PASS。
- `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile`：PASS，`restore=PASS`，exit 0；覆盖 main 更新后的真实 DSH probe 打包与工具接线。
- 本轮 `plugin/src/client` 相对 `d97da4d` 无变化；未重复 Browser 操作，上一节 Browser 证据仅对应其记录的合并边界。
- 本轮未执行完整 16 个 smoke selector；其他 Not Covered 继续适用。
