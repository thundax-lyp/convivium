# RUNBOOK: ACP Codex — 会议接线与用户诊断

## Status, Dependency And Boundary

2026-10-16；Execute；D1 已 PASS 并删除任务段落，下一入口 D2。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。用户已授权每步 PASS 后删除任务段落并单独提交；不授权安装到人工环境或额外模型用量。

前置：P5 PASS。Scope：启用装配、owner交付、防误结算、Reviewer worker与诊断。Non-goals 沿总入口，不新增业务决定。

当前断点：插件入口已完成可选 provider 生命周期装配；owner 尚未调用自研 port，dispatcher 异常仍可能直接计失败。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Traceability

读取 [Peer Meeting Agents](./PEER-MEETING-AGENTS-DESIGN.md) 的 owner/delivery/recovery、[DSH Plugin Design](./DSH-PLUGIN-DESIGN.md) 的启用和卸载、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 的 executionBlocks，以及 A2 的 ACP interface。不得在工具侧扩大Meeting权限；worker仍spawn、原claim/version/schema不变。

### D2：接入 owner 的身份与交付门禁

前置状态：D1 PASS。
允许修改（5 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/dsh/meeting-agent-owner.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/unit/dsh/meeting-agent-owner.spec.ts`
- `plugin/tests/integration/dsh/meeting-agent-owner.spec.ts`
- `plugin/tests/integration/dsh/acp-reviewer.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. owner参数增加可选port；在setup资源/Skill校验末尾prepareSession，先于发布/inbox。保留header/cwd/no-parent及身份指令，不在Codex用户目录复制资源。
2. ACP交付强制observed、admitting→queued→checkpoint→completed；旧delivery校验同文本，pending只等原Promise，重启未知block，移除ACP wake。非ACP路径不变。
3. release先cancel、停所属ACP子树/等待工具进程，再dispose；cleanup不加载远端会话。新集成用真实Context/Loader/AgentLoop/subprocess-local/SQLite，脚本ACP不能mock掉caller/MCP。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/dsh/meeting-agent-owner.spec.ts tests/integration/dsh/meeting-agent-owner.spec.ts tests/integration/dsh/acp-reviewer.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：独立身份/作用域首次续聊冷load一致，旧delivery无重发，归档只收敛本root；本步实际变更路径 2–10 个且均在清单内。
STOP：绕过setup授权、首次记录晚于入队或cleanup触发模型；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

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
允许修改（9 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/tools/register-tools.ts`
- `plugin/src/runtime/services/evidence-review-dispatch.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/unit/runtime/evidence-review-dispatch.spec.ts`
- `plugin/tests/integration/dsh/evidence-review-dispatch.spec.ts`
- `plugin/tests/integration/dsh/review-worker-submission.spec.ts`
- `plugin/tests/contract/meeting-review-worker-tool.spec.ts`
- `plugin/tests/integration/dsh/acp-reviewer.spec.ts`
- `plugin/tests/recovery/acp-codex.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 按正式合同接审核工具/dispatcher的root block，同active claim重复调用复用原Promise。start仍spawn、parent仍exec.agent、schema/allow=[]/原claim/version不改。
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
允许修改（8 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/protocol/meeting-view.ts`
- `plugin/src/protocol/index.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/src/client/meeting/panel.tsx`
- `plugin/src/client/meeting/shared/locales.ts`
- `plugin/tests/client/meeting/meeting-panel-execution-block.client.spec.tsx`
- `plugin/tests/client/meeting/meeting-panel-recovery.client.spec.ts`
- `plugin/tests/unit/runtime/meeting-lifecycle.spec.ts`

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

本册门禁为各步全部验证与实际文件计数，断言见各 PASS；会议确定性接线已闭合，但真实网络和模型仍未验收。只有前述证据齐全才交接E1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
