# RUNBOOK: ACP Codex — 原生执行与宿主审核适配

## Status, Authority And Executor Contract

2026-10-16；Author/Audit；**H1–H4 PASS；H5 Executable，PASS 后原 checkpoint E2→E3**。契约/RUNBOOK 修订已提交 `d303da41`。普通分支 `codex/acp-acceptance`，源码起点 `0d1518ba`、边界确认 `514c607d`。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)。按 H1→H2→H3→E2→E3 串行，不创建 worktree。每步 PASS 保存仓库外脱敏记录、删除本册该步完整段落并单独提交；任何 STOP 保留任务与现场。只提交当前步文件，不混入现有七个 E2 脚本改动。

**ACP Agent 只使用自身原生工具和 Skills，沿用真实模型用量授权，不重放已消费输入。** H1–H3 仅确定性测试不付费；E2/E3 才使用既有真实用量授权。不 push/PR/merge、不改固定人工环境、不自动登录、不清锁、不覆盖历史 evidence。

## H1 前次 STOP 与本轮修订

`pnpm --dir plugin exec vitest run tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts`：provider 9 项通过；recovery 6 项通过、3 项失败。load-fail/fingerprint 两项仍以 `mcpCount===1` 识别正式 newSession，而新边界为 0；worker 子树取消用例未观察到 `session/cancel`（期望 1、实际 0），原因未确证，不能按旧断言漂移一并豁免。`plugin/tests/recovery/acp-codex.spec.ts` 不在 H1 白名单，按 STOP 停止，未修改该文件。

Host typecheck、H1 ESLint/Prettier、文档链接与 diff 检查通过；未付费、未重放。执行记录 `/tmp/convivium-native-host-20261016/h1-stop.json`，原失败输出 `h1-tests.log`，原工作树快照 `original-worktree/`。保留未提交 H1 和原七个 E2 脚本；不得删除 H1 任务段落或宣称通过。继续需作者把该 recovery 文件纳入 H1（总预算仍不超过 10），保留 no-replacement 与子树 cancel/drain 不变量，查明取消 RPC 未观察到的原因后重新验证。产品边界及真实用量授权无须重复确认。本轮用户已授权纳入 recovery 测试、修正旧 MCP 判据并修复取消 RPC；H1 白名单增加该文件，共 9 文件，取消后先等待原 prompt 结算再停进程，最长 5000ms，保持持久 unknown 与零重放。

## Scope, Breakpoints And Formal Contract

Scope：删除旧 Convivium MCP bridge；外部 prompt 不透传宿主 system/developer；宿主以原 caller/claim 驱动 DSH spawn、解析完整 JSON 并提交；改验收采证。Non-goals：通用 ACP、原生 Codex subagent 投影、新技术 domain/业务事件、自动恢复未知、会话 GC、修改非 ACP Reviewer 工作流。

当前断点：`provider.ts::connectSession` 注入 bridge；`prompt.ts::buildCodexPrompt` 透传 system/developer；`evidence-review-dispatch.ts::createEvidenceReviewDispatcher` 要求 ACP 调会议工具。原 MCP bridge 测试退休；已有发送/receipt/flush/原 ID/recovery 测试继续保护。唯一依据为 [ACP Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md#reviewer-and-worker)、[Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#acp-codex-acceptance-boundary)、[Evidence Round](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)、[Peer Agents](./PEER-MEETING-AGENTS-DESIGN.md#codex-session-integration)。

精确数据/签名/所有权：消费 ACP Interface 的 CodexAcpProviderPort、三表、checkpoint、Reviewer And Worker 与 Prompt And Stream；`requireRecovery(sessionId:string):Promise<void>` 仅持久 RECOVERY_REQUIRED；新 `runAcpReviewWorker` 文件/签名和 accepted 事件 payload 由该接口唯一固定。JSON 根与四维键沿 `plugin/src/protocol/review-worker.ts` 中现有 ReviewWorkerOutputSchema；不新增公共 command。原 application 是唯一 Review 事实写入口；root delivery completed 仅证明通知已消费。

不可违反：同 deliveryId 同进程原 Promise；消费后无原 Promise/无合法 Review 持久 block，绝不重复 spawn；worker 无 ownership；外部不提供 caller/claim/requestId；输出完整解析、不修补模型 JSON；root/worker checkpoint 与领域提交分别证明；未知不消费业务失败预算，真实 deadline 不冻结。

## Mechanical Steps

### H5：恢复提交为当前 Manager 生成持久续行通知

前置状态：H1–H4 PASS，普通分支 codex/acp-acceptance；用户授权恢复续行修复；正式 MO-FR-9/Meeting Interface/Peer Agents Resume Continuation 已同步。原会议 bcdce35f3f2bfa6ce39e380d10353a52 version26/running，第一轮已 published、三 Review，原 checkpoint/十 committed request 保留，不重放输入。
允许修改（10 文件，实际2–10）：
- `plugin/src/domain/transitions/result.ts`：AgentNoticeEffectRequest 新增仅 kind/noticeKind/recipientId 的 meeting_resumed 变体，无 agendaId。
- `plugin/src/runtime/application-service/meeting-action-transition.ts`：runMeetingActionTransition 的 accepted resume 同事务追加一次当前 Manager notice，不改变已有 resumedRoundEffects/resumedEvidenceReviewEffects。
- `plugin/src/runtime/services/meeting-notice-dispatch.ts`：supported、assertNoticeReferences、createMeetingNoticeDispatcher 仅为 meeting_resumed 允许无 agendaId；要求当前 running、当前 manager 单一角色，沿 findOwnership/authorize 原精确身份/Session/capability/flush/ACP unknown 门禁。
- `plugin/tests/unit/runtime/meeting-resume-notices.spec.ts`：无开放轮次的合法会议成功恢复恰一 Manager effect，已有开放轮次邀请仍保留，running 状态重复新 resume 拒绝无 effect。
- `plugin/tests/unit/runtime/meeting-notice-dispatch.spec.ts`：真实 dispatcher 验证仅 Manager/不携带 agendaId 可投递；错误 recipient、paused/terminal、revoked capability/ownership 拒绝且无 owner.deliver。
- `plugin/tests/integration/dsh/meeting-notice-dispatch.spec.ts`：新 notice 沿原 deliveryId 的 flush 失败/撤权/崩溃以及 ACP unknown 零重放保护，复用现有 suite。
- `plugin/tests/unit/runtime/meeting-command-application.spec.ts`：真实 repository pause/resume 同事务 durable notice，相同 request 重放不新增，stale/conflict 不新增，cold reopen 保留同 deliveryId。
- `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-ACCEPTANCE.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md`

禁止修改：七个待提交 E2 脚本、Definition/角色 AGENTS/Skills、第三方、固定人工环境、其它产品行为；不回写原 outbox/receipt、不扩权限、不恢复 unknown。新 notice 仅定位 Meeting，不含正文、私有历史或 Session；producer 为原 application，consumer 为原 dispatcher/owner，现有 command transaction/版本/receipt/outbox 唯一负责落盘。无新公开 command/状态/数据库迁移；Not Applicable 为跨 Host、浏览器视觉、网络实现。

执行：
1. 保存本步十文件前字节快照。先补正反例测试并记录行为 RED；原 typed effect union 的编译失败不算 RED。
2. 在唯一三个生产文件补齐上述变体、事务 effect 与定向投递；无需新 helper/队列/配置，不改变 resume 的原 command/result/领域事件和其它 notice 校验。
3. 执行全部聚焦验证，核对实际变更清单；PASS 后保存脱敏记录，删除本节完整任务段落，更新两册入口 H5 PASS/下一原 checkpoint E2，审阅全 diff 单独提交，不混入 E2。

验证（仓库根）：
```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-resume-notices.spec.ts tests/unit/runtime/meeting-notice-dispatch.spec.ts tests/integration/dsh/meeting-notice-dispatch.spec.ts tests/unit/runtime/meeting-command-application.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec eslint src/domain/transitions/result.ts src/runtime/application-service/meeting-action-transition.ts src/runtime/services/meeting-notice-dispatch.ts tests/unit/runtime/meeting-resume-notices.spec.ts tests/unit/runtime/meeting-notice-dispatch.spec.ts tests/integration/dsh/meeting-notice-dispatch.spec.ts tests/unit/runtime/meeting-command-application.spec.ts
pnpm --dir plugin exec prettier --check src/domain/transitions/result.ts src/runtime/application-service/meeting-action-transition.ts src/runtime/services/meeting-notice-dispatch.ts tests/unit/runtime/meeting-resume-notices.spec.ts tests/unit/runtime/meeting-notice-dispatch.spec.ts tests/integration/dsh/meeting-notice-dispatch.spec.ts tests/unit/runtime/meeting-command-application.spec.ts
pnpm --dir plugin build
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：四文件全部测试与类型/lint/format/build/link/diff通过；同一accepted resume恰一 Manager durable notice、无需 agendaId 可投递、原 authority/unknown/幂等/rollback 门禁不变；实际2–10文件仅白名单。真实模型 Not Covered，留原 checkpoint E2。
STOP：正式依据冲突、未知外部结果、额外路径、任一门禁失败；保留任务和原数据库/Session，不改原技术记录、不以直接 prompt 催促代替通知。失败不提交 H5；固定记录错误/最后PASS/未覆盖边界。


## Audit, Validation Matrix And Closure

Author 已核查路径、DSH rc.2 的 spawn(outputSchema optional)/SubagentResult.output、checkpoint flush 与原 caller/claim/Schema。H1 正常+持久恢复；H2 原生策略/非法请求/历史完整性；H3 authority、输出完整性、取消/重复/消费后无结果、原 ID 冷恢复；E2 真实两轮/来源/归档；E3 全门禁。业务版本冲突/claim 失效/事务原子性复用原 application 与 evidence-review integration，H3 不引入新的领域写路径。新数据库迁移、兼容读取、跨 Host 和生产部署 Not Applicable。历史 ACP 现场不可 replay；H1–H3 真实模型与互联网 Not Covered，留 E2。

H5 审计：Executable；作者已核对三个生产入口、四测试路径和真实 Host typecheck 命令，正式无 agenda 的通知结构、producer/consumer、同事务 receipt/outbox、权限和恢复边界均固定。Author 边界修正：现有 MeetingState 要求所有非终态恰一 active Agenda；H5 不支持非法无 active Agenda 恢复，不修改该 Schema。通知省略 agendaId 仅表示 Meeting 级 rescan，并非放宽状态合法性。H5 正常投递/错身份/撤权/暂停终态/重放/同 deliveryId reopen 由四聚焦文件验证，原通用事务 rollback 复用 repository 契约及后续 E3 全量门禁；此阶段不付费、不改现场。

审计：Executable。作者文档链接和 diff 检查通过后单独提交契约/RUNBOOK；机械执行时每步前快照、每步 PASS 删除任务并提交。全部 H 步完成才交接 E2；长期实际证据在 E3 迁 coverage/operations 并与其余五册一起删除。失败不删任务、不清原门禁、不声称完成。
