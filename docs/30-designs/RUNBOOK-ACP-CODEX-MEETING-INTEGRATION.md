# RUNBOOK: ACP Codex — 会议接线与用户诊断

## Status, Dependency And Boundary

2026-10-16；Execute；D1–D2 已 PASS 并删除任务段落，下一入口 D3。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。用户已授权每步 PASS 后删除任务段落并单独提交；不授权安装到人工环境或额外模型用量。

前置：P5 PASS。Scope：启用装配、owner交付、防误结算、Reviewer worker与诊断。Non-goals 沿总入口，不新增业务决定。

当前断点：插件入口已完成可选 provider 生命周期装配；owner 已接入准备/交付/停止门禁，dispatcher 异常仍可能直接计失败。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Traceability

读取 [Peer Meeting Agents](./PEER-MEETING-AGENTS-DESIGN.md) 的 owner/delivery/recovery、[DSH Plugin Design](./DSH-PLUGIN-DESIGN.md) 的启用和卸载、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 的 executionBlocks，以及 A2 的 ACP interface。不得在工具侧扩大Meeting权限；worker仍spawn、原claim/version/schema不变。

## 2026-10-16 Author Audit 与执行细则

按正式 ACP interface 的 Prompt, MCP And Stream / Delivery, Recovery, Deadlines And User Handling / Reviewer And Worker 复核 D2–D5；compaction 由 Preset 唯一装配，owner 和 provider hook 只核查，不注册第二个 Service。需求依据为 Orchestration 的 ACP Codex Acceptance Boundary、Evidence Round 的 ACP Review Outcome And Deadline；安全 DTO 以 Meeting Interface 的 ACP Execution Diagnostics 为准。D1 保留既有 PASS，不重做。

每步允许修改本册以删除已 PASS 的任务及更新剩余入口，计入实际 2–10 个文件。生产签名只增加可选 `acpCodex?: CodexAcpProviderPort`，缺省保留非 ACP 路径。D2 的新文件唯一为 `plugin/tests/integration/dsh/acp-reviewer.spec.ts`；D5 的新文件唯一为 `plugin/tests/client/meeting/meeting-panel-execution-block.client.spec.tsx`。D2/D4 允许扩展既有脚本 ACP fixture，不能替代真实 DSH caller、MCP、SessionPersistence、SQLite 或 worker driver。每步前以仓库外完整字节快照固定工作树，PASS 后记录实际路径/命令/断言；不以 Vitest 忽略不存在的新文件作为通过。

固定映射：D2 `createMeetingAgentOwner` 的 setup/release/deliver 与 lifecycle 的 owner 参数；D3 `createMeetingNoticeDispatcher` / `NoticeDispatchError` 与 lifecycle 的 dispatcher 参数；D4 `registerMeetingTools` / `registerReviewWorkerTool`、`createEvidenceReviewDispatcher`，由 `plugin-entry.ts` 显式传 port；D5 `MeetingViewSchema`、runtime read/refreshListeners、`ConviviumMeetingPanel` 与本地化。provider.port 方法和全部数据结构直接消费正式 ACP interface，不新增技术状态、领域事件或数据库迁移。

测试断言：D2 覆盖 setup 早于 publication、admitting 早于 followup、同键异文本拒绝、重复 completed/pending 不重发、无 ACP wake、原绑定冷 load 与 cleanup 无远端 load、只停所属子树；D3 覆盖持久事实优先、unknown 不计失败、30 秒重核对且原 deadline 不冻结；D4 覆盖同 claim 原 Promise、spawn 模型继承/structured_output/真实 caller、blocked 不提交或 replacement、合法 Review 优先及真实 claim timeout 恰一次；D5 覆盖安全 DTO、同领域 version 刷新、双语 alert 与原 Captain 控制。D2 的真实 MCP 使用原注册工具和 scope；D4 在相同集成文件补 worker structured_output，不用纯文本 JSON 替代。

阶段不做真实模型、互联网或固定人工部署，留 E 册；纯技术诊断不写领域事件/receipt/Archive，因此新增领域格式迁移与事务写入 Not Applicable。固定完整门禁为每步下列命令、文档链接和 diff 检查；不缩减既有测试。最终 D5 同步 coverage 的实际证据/Not Covered，不宣称 E 阶段已完成。失败保留工作树与持久门禁，Restore 只清本次临时 profile/进程；不能删 unknown 或自动重放。

审计结论：Executable；本次为契约一致性与执行范围复核，不代表 D2–D5 行为已实现。文档门禁为 `node .github/scripts/check-doc-links.mjs` 与 `git diff --check`。

### D3：通知投递识别未知与既有贡献事实

前置状态：D2 PASS。
允许修改（4 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/runtime/services/meeting-notice-dispatch.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/unit/runtime/meeting-notice-dispatch.spec.ts`
- `plugin/tests/integration/dsh/meeting-notice-dispatch.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 显式传port，先查正式Evidence/既有结算与撤权/真实期限，再查block，最后才投递。
2. 未知不合成贡献失败；抛现有dispatch错误code=block.code、retryable=true、terminalOnAttemptLimit=false、retryAt=now+30000。只核对不重发，沿原deadline handler真正超时。
3. 证明outbox lease重获/尝试耗尽不授予重发权，迟到错误不回滚已提交事实；不修改通用outbox worker。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-notice-dispatch.spec.ts tests/integration/dsh/meeting-notice-dispatch.spec.ts
```

PASS：unknown/重试/真实deadline/已有事实的反例成立，无重复输入或伪造终态；本步实际变更路径 2–10 个且均在清单内。
STOP：冻结期限、普通投递失败误结算未知或新建投递队列；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### D4：接通 Reviewer spawn worker 与审核失败边界

前置状态：D3 PASS。
允许修改（10 个代码/测试白名单路径及本册；实际不要求修改所有白名单文件，新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/plugin-entry.ts`
- `plugin/src/tools/register-tools.ts`
- `plugin/src/runtime/services/evidence-review-dispatch.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/unit/runtime/evidence-review-dispatch.spec.ts`
- `plugin/tests/integration/dsh/evidence-review-dispatch.spec.ts`
- `plugin/tests/integration/dsh/review-worker-submission.spec.ts`
- `plugin/tests/contract/meeting-review-worker-tool.spec.ts`
- `plugin/tests/integration/dsh/acp-reviewer.spec.ts`
- `plugin/tests/fixtures/scripted-acp-agent.mjs`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. `MeetingCommandToolDependencies` 增加可选 acpCodex，由 plugin-entry.ts 传入；lifecycle 的 dispatcher 同样接收。按正式合同接审核工具/dispatcher的root block，同active claim重复调用复用原Promise。start仍spawn、parent仍exec.agent、schema/allow=[]/原claim/version不改。
2. 合法Review优先补结算；未知不dispatch_failed/review_interrupted、不补派worker；真正claim到期只按原review_timeout结算一次，blocked不建replacement。
3. 验真实MCP structured_output经DSH tools/result捕获；纯文本/错version/取消/无structured/worker无ownership均不得提交。完成正式结果不被迟到错误改判。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/evidence-review-dispatch.spec.ts tests/integration/dsh/evidence-review-dispatch.spec.ts tests/integration/dsh/review-worker-submission.spec.ts tests/contract/meeting-review-worker-tool.spec.ts tests/integration/dsh/acp-reviewer.spec.ts tests/recovery/acp-codex.spec.ts
```

PASS：Codex Reviewer→spawn模型继承→structured审核成立，未知不误扣、真实timeout恰一次；本步实际变更路径 2–10 个且均在清单内。
STOP：换委派provider、解析JSON兜底、放宽授权或豁免审核；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### D5：公开阻断诊断并复用原人工控制

前置状态：D4 PASS。
允许修改（9 个代码/测试/证据文件及本册；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/protocol/meeting-view.ts`
- `plugin/src/protocol/index.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/src/client/meeting/panel.tsx`
- `plugin/src/client/meeting/shared/locales.ts`
- `plugin/tests/client/meeting/meeting-panel-execution-block.client.spec.tsx`
- `plugin/tests/client/meeting/meeting-panel-recovery.client.spec.ts`
- `plugin/tests/unit/runtime/meeting-lifecycle.spec.ts`
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 添加executionBlocks精确可选schema/runtime安全投影；providerblock变更走现有refresh；同version刷新也重新读取诊断，既有stale领域数据保护不变。
2. 面板role=alert显示身份、code对应中英文提示与现有处置方向；不暴露内部路径/ACP ID；不自动执行Captain控制，resume不解除门禁。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-lifecycle.spec.ts
pnpm --dir plugin exec vitest run --project client tests/client/meeting/meeting-panel-execution-block.client.spec.tsx tests/client/meeting/meeting-panel-recovery.client.spec.ts
pnpm --dir plugin typecheck:client
pnpm --dir plugin lint
```

PASS：不增领域version也能刷新诊断，原因/身份可见且不泄密，暂停/异常结束沿原Captain权限，无清锁按钮；本步实际变更路径 2–10 个且均在清单内。
STOP：伪造用户身份/领域事实，resume自动解除block或重设计UI；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

## Validation, Handoff And Deletion

本册门禁为各步全部验证与实际文件计数，断言见各 PASS；只有 D2–D5 全部 PASS 才证明会议确定性接线闭合，真实网络和模型仍未验收。只有前述证据齐全才交接E1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
