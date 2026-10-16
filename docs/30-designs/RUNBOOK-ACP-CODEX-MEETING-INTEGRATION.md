# RUNBOOK: ACP Codex — 原生执行与宿主审核适配

## Status, Authority And Executor Contract

2026-10-16；Author/Audit；**H1 白名单修订 Executable；H1 待验证，H2/H3/E2/E3 未执行**。契约/RUNBOOK 修订已提交 `d303da41`。普通分支 `codex/acp-acceptance`，源码起点 `0d1518ba`、边界确认 `514c607d`。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)。按 H1→H2→H3→E2→E3 串行，不创建 worktree。每步 PASS 保存仓库外脱敏记录、删除本册该步完整段落并单独提交；任何 STOP 保留任务与现场。只提交当前步文件，不混入现有七个 E2 脚本改动。

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

### H1：退役 Convivium ACP 工具 bridge

前置状态：边界契约审计 Executable，现有 E2 七脚本原字节快照已保留。
允许修改：
- `plugin/src/dsh/acp-codex/provider.ts`
- `plugin/src/dsh/acp-codex/types.ts`
- `plugin/src/dsh/acp-codex/tool-bridge.ts`（删除）
- `plugin/tests/integration/dsh/acp-codex-tool-bridge.spec.ts`（删除）
- `plugin/tests/integration/dsh/acp-codex-provider.spec.ts`
- `plugin/tests/recovery/acp-codex.spec.ts`
- `plugin/package.json`
- `plugin/pnpm-lock.yaml`
- 本册 `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
禁止修改：prompt、worker、领域提交和原七脚本；不退休仍有效的防重放测试。

执行：
1. 先改 provider 测试，使现有真实 scoped read 工具执行次数为 0，检查正常 new/load 的 mcpCount=0；运行该文件观察旧 bridge 导致 RED。
2. provider 删除 bridge import/Lease 字段、创建、request 上下文和关闭逻辑，new/load 固定 mcpServers=[]；保留进程 cancel/drain、binding/receipt/checkpoint/block 逻辑。删除仅服务旧 bridge 的类型、文件与专用测试。
3. recovery 不再用 mcpCount 区分 probe/正式 newSession；从原 prompt 的 sessionId 识别原绑定并断言从未创建替代绑定，所有 new/load 的 mcpCount=0。cancel notification 发送后等待原 prompt 正常结算或 5000ms 取消宽限到期，随后 close/drain；保持未知 block、子树隔离、取消计数和无重发断言，不以 sleep 或放宽断言修复。
4. 从 package.json 删除旧直接依赖，运行 `pnpm --dir plugin install --lockfile-only --offline --ignore-scripts` 更新 lockfile，不改变其它版本；如果命令造成其它交付路径变化 STOP。原 ACP reviewer 旧 MCP 测试将在 H3 原位替换，不在此声称全工程完成。

验证（仓库根）：
```bash
pnpm --dir plugin exec vitest run tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec eslint src/dsh/acp-codex/provider.ts src/dsh/acp-codex/types.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts
pnpm --dir plugin exec prettier --check src/dsh/acp-codex/provider.ts src/dsh/acp-codex/types.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts package.json pnpm-lock.yaml
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：全部退出 0、DSH 工具未执行、RPC new/load 无 Convivium MCP、原防重放/恢复通过，实际 2–10 文件；删除本段并提交。
STOP：任何断言/类型/门禁失败或额外文件；保留改动、原错误和复现，不回退用户内容、不继续 H2。

### H2：外部 prompt 仅携带原生策略与未消费任务

前置状态：H1 PASS。
允许修改：
- `plugin/src/dsh/acp-codex/prompt.ts`
- `plugin/src/dsh/acp-codex/connection.ts`
- `plugin/tests/unit/dsh/acp-codex-prompt.spec.ts`
- `plugin/tests/unit/dsh/acp-codex-connection.spec.ts`
- `plugin/tests/fixtures/scripted-acp-agent.mjs`
- `plugin/scripts/acp-codex-preflight.mjs`
- 本册 `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
禁止修改：用户任务正文、持久 prefix hash 算法、身份资源绑定、worker 和领域逻辑。

执行：
1. prompt 测试改为证明 system/developer 的宿主方法/Skill 不透传，已消费 user 不重复；connection 测试增加 load=true/http=false 可连接。fixture 仅增加 no-http 能力模式。先运行两文件观察目标 RED。
2. buildCodexPrompt 前置固定原生执行 text（含 sessionId、仅使用自身工具和 Skills、Host 负责权限和结果接纳）；不消费 system/developer，仍严格校验未消费 user 的 text/ID/hash 与原请求控制。非 user 历史不送外部。
3. connection 与 preflight 删除已退役的 MCP HTTP 能力要求，loadSession 必须 true，其余版本/model/login/read-only/timeout/cancel 不变。

验证：
```bash
pnpm --dir plugin exec vitest run tests/unit/dsh/acp-codex-prompt.spec.ts tests/unit/dsh/acp-codex-connection.spec.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec eslint src/dsh/acp-codex/prompt.ts src/dsh/acp-codex/connection.ts tests/unit/dsh/acp-codex-prompt.spec.ts tests/unit/dsh/acp-codex-connection.spec.ts tests/fixtures/scripted-acp-agent.mjs scripts/acp-codex-preflight.mjs
pnpm --dir plugin exec prettier --check src/dsh/acp-codex/prompt.ts src/dsh/acp-codex/connection.ts tests/unit/dsh/acp-codex-prompt.spec.ts tests/unit/dsh/acp-codex-connection.spec.ts tests/fixtures/scripted-acp-agent.mjs scripts/acp-codex-preflight.mjs
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：全部退出 0、宿主 system/developer/Skill 未进入 ACP、无 MCP 能力也成功连接、prefix/cancel/recovery 未弱化，实际 2–10 文件；删除本段并提交。
STOP：同 H1；不运行真实模型、不重放。

### H3：宿主驱动 ACP 审核并接纳合法结果

前置状态：H1/H2 PASS。
允许修改：
- `plugin/src/dsh/acp-review-worker.ts`（唯一新增文件）
- `plugin/src/dsh/index.ts`
- `plugin/src/dsh/acp-codex/provider.ts`
- `plugin/src/dsh/acp-codex/types.ts`
- `plugin/src/runtime/services/evidence-review-dispatch.ts`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/integration/dsh/acp-reviewer.spec.ts`
- `plugin/tests/unit/runtime/evidence-review-dispatch.spec.ts`
- `plugin/tests/fixtures/scripted-acp-agent.mjs`
- 本册 `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
禁止修改：非 ACP 工具 worker、public command/DTO、领域状态机、物理存储和已消费现场。

执行：
1. 原位替换退休 MCP reviewer integration 为真实 DSH 原生组合；fixture 对带 native review output 标识的 worker 返回固定完整 JSON，不模拟被测 Host 生命周期。runtime unit 增加合法结果/非法 JSON或Schema或version/重复与消费后恢复门禁。先观察 Host 仍要求工具或未提交的 RED。
2. 实现接口固定的 runAcpReviewWorker，从 registry 取得原 root、核对可信 ownership/provider，spawn 不传 outputSchema，prompt 要求仅输出 workerOutputSchema JSON、无 fence；等待 completed，checkpoint 后整段 JSON.parse，finally dispose。导出经 dsh/index.ts。
3. dispatcher dependencies 新增可选 `nativeReview?: (input: {ownership:SessionOwnership;versionId:string;prompt:string;signal:AbortSignal}) => Promise<{workerSessionId:string;model:string;output:unknown}>` 与可选 `onNativeReviewAccepted?: (payload:{rootSessionId:string;workerSessionId:string;versionId:string;reviewId:string;provider:"acp-codex";model:string}) => void`；仅 ACP 分支必须具备 runner，缺失拒绝，不回退工具。provider 实现 requireRecovery 调用既有 block，无新技术格式。dispatcher 为 ACP 分支保存原 deliveryId Promise；正式 Review 优先，已消费无 Promise 先 requireRecovery 并沿 checkBlock 停止。claim 后重读原 prompt，原 root 通知不要求工具；resume/deliverObserved 授权继续。Host 校验 Schema/version 后用原 claim/caller/requestId/application 提交，accepted 后才发只读事件。非 ACP 分支保留原工作流。
4. lifecycle 从 ctx 绑定 runner 与 accepted 事件 producer，不由 provider 写 Meeting command。测试证明 root cold load 同 ID、worker 无 MCP/structured_output、模型继承、caller 精确、重复不替换、已消费无结果阻断、非法/取消/blocked 不成功，disposer 总执行。

验证：
```bash
pnpm --dir plugin exec vitest run tests/integration/dsh/acp-reviewer.spec.ts tests/unit/runtime/evidence-review-dispatch.spec.ts tests/integration/dsh/evidence-review-dispatch.spec.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/recovery/acp-codex.spec.ts tests/unit/dsh/meeting-agent-owner.spec.ts
pnpm --dir plugin typecheck:host
pnpm --dir plugin exec eslint src/dsh/acp-review-worker.ts src/dsh/index.ts src/dsh/acp-codex/provider.ts src/dsh/acp-codex/types.ts src/runtime/services/evidence-review-dispatch.ts src/runtime/meeting-lifecycle.ts tests/integration/dsh/acp-reviewer.spec.ts tests/unit/runtime/evidence-review-dispatch.spec.ts tests/fixtures/scripted-acp-agent.mjs
pnpm --dir plugin exec prettier --check src/dsh/acp-review-worker.ts src/dsh/index.ts src/dsh/acp-codex/provider.ts src/dsh/acp-codex/types.ts src/runtime/services/evidence-review-dispatch.ts src/runtime/meeting-lifecycle.ts tests/integration/dsh/acp-reviewer.spec.ts tests/unit/runtime/evidence-review-dispatch.spec.ts tests/fixtures/scripted-acp-agent.mjs
pnpm --dir plugin build
node .github/scripts/check-doc-links.mjs
git diff --check
```
PASS：全部退出 0，上述正反例成立、实际 2–10 文件；删除本段并提交，然后进入 E2。
STOP：任一失败或必须新建技术表/改变事实格式/扩大文件范围；保留最后 PASS/原状态/复现，不进入 E2。

## Audit, Validation Matrix And Closure

Author 已核查路径、DSH rc.2 的 spawn(outputSchema optional)/SubagentResult.output、checkpoint flush 与原 caller/claim/Schema。H1 正常+持久恢复；H2 原生策略/非法请求/历史完整性；H3 authority、输出完整性、取消/重复/消费后无结果、原 ID 冷恢复；E2 真实两轮/来源/归档；E3 全门禁。业务版本冲突/claim 失效/事务原子性复用原 application 与 evidence-review integration，H3 不引入新的领域写路径。新数据库迁移、兼容读取、跨 Host 和生产部署 Not Applicable。历史 ACP 现场不可 replay；H1–H3 真实模型与互联网 Not Covered，留 E2。

审计：Executable。作者文档链接和 diff 检查通过后单独提交契约/RUNBOOK；机械执行时每步前快照、每步 PASS 删除任务并提交。全部 H 步完成才交接 E2；长期实际证据在 E3 迁 coverage/operations 并与其余五册一起删除。失败不删任务、不清原门禁、不声称完成。
