# Smoke Validation Evidence

当前 SQLite 组合的五核心 smoke 见 [SQLite Provider Validation](#sqlite-provider-validation)，全量工程检查见 [SQLite Provider Integration](./CURRENT-IMPLEMENTATION-COVERAGE.md#sqlite-provider-integration)。下述升级基线及其他章节保留各自历史边界，不外推为当前 Browser 或模型验证。

## Current Baseline Validation

本节为 SQLite 替换前的 DSH 升级历史基线；标题锚点保留供既有证据引用。

2026-09-08，源码为 `8c3b7ab0359828f4b2e33554300c134f95bacecd`，分支 `codex/upgrade-dsh-0.1.2-rc.1`；验证在提交前的同一源码工作区执行。Darwin arm64、Node `v22.23.2`、DSH `0.1.2-rc.1`，独立 `web` profile、`spawn` provider。

`pnpm --dir plugin smoke:profile --all` 实际退出 0，16/16 场景 PASS，总耗时 156717ms，一次构建，每场景均 `restore=PASS`。角色配置使用测试专用 LlmAdapter，验证真实 Agent 和双 Host 冷恢复，不证明真实外部模型配置可用。

场景为 baseline、timeout、reassign、task-handraise、completion-end、risk-reopen、decision-risk-closure、cold-rebind、role-composition、archive-continuation、mail-race、cross-meeting、convergence、convergence-stalled、convergence-turn-budget-completion、scribe-minutes。此前分别执行的 baseline、timeout、reassign、role-composition 也通过；role-composition 使用测试专用 LlmAdapter 验证 descriptor、assembly、工具限制与双 Host 恢复，未发起外部模型路由测试。

失败轮不计 PASS：旧探针读取首个 text block、依赖旧 `Session.events`、将异步释放视作同步、等待上下文期间保留已失效 Agent，以及按 JSON 字段顺序比较重放结果。分别改为公开消息/Session 接口、明确等待释放、获取当前 live Agent 和结构化结果比较。冷恢复 inbox 丢失则通过正式 repository 重投修复；最终全场景在这些修改后通过。

Not Covered：独立 ACP、SDK、TUI/headless profile、真实外部模型 provider/model/reasoningEffort 的凭证与质量、历史 Browser 重验、长期压力、强杀 Host、真实缺失 Session 故障注入和动态 admission。无 WebServer 的组合测试不等于这些 profile 已验收；本轮未修改相邻 DSH 源码或使用内部入口。

完整工程检查、能力采用和历史收口见 [DSH Upgrade Baseline Validation](./CURRENT-IMPLEMENTATION-COVERAGE.md#dsh-upgrade-baseline-validation)。历史 `6679403` 的结果见 [Historical Alignment Baseline Validation](#historical-alignment-baseline-validation)。

## SQLite Shutdown Acceptance Boundary

2026-09-08 用户接受 [设计中的关闭限制](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#accepted-storage-shutdown-limitation)。本次 SQLite 五核心场景已通过，验收范围为：重开必须保留关闭前已确认成功的事实，关闭与未完成写入竞争时的自动排空不作为 mandatory。操作与失败判据见 [SQLite 关闭与冷重启验收](../50-operations/HOW-TO-DSH-SMOKE.md#sqlite-替换的关闭与冷重启验收)。

Not Covered：本次仅运行五核心 selector；不证明人工固定等待时长安全、单独关闭 AgentSession 的行为或任意时序卸载时所有排队写入都成功。上述历史基线结果不重新标记为 SQLite 替换验证通过。

前期官方 rc.1 的真实 SQLite 排队写入探针：显式 `domain.close()` 后 100 次写入全部完成；provider/root dispose 分别有 99/98 次 `closed` 拒绝，已确认写入重开后存在。该结果不证明已确认数据丢失，也不证明单独关闭 AgentSession 会触发相同问题。用户接受这一关闭边界，替换不等待上游发布；本次验收不声称修复了上游自动排空。

## SQLite Provider Validation

- 日期：2026-09-08；分支 `codex/jsonl-storage-backend-dsh-first`；运行基线 `9389402` 加本次 consumer 启动门控修复，官方 DSH/SQLite `0.1.2-rc.1`、Cordis `4.0.2`、Node `v22.23.2`、pnpm `10.7.0`。
- 命令：`pnpm --dir plugin smoke:profile`，退出 0；单次 build，合计 51509ms。baseline 9484ms、cold-rebind 11143ms、cross-meeting 10765ms、convergence-stalled 7452ms、convergence-turn-budget-completion 8422ms，全部 `PASS ... restore=PASS`。
- 组合：test-only probe manifest 安装官方 SQLite；dump-config 验证 package、唯一 provider row、DB 路径和旧配置无残留。profile 将会议路由到 SQLite，workspace/session_projcache/message_feedback 保持 JSON；独立临时 DSH_HOME、workspace、DB 与端口，未修改已有 profile 或用户数据库。
- 冷恢复：目标提交成功、Captain/Manager flush 与 checkpoint 已确认后才停止首个 Host；第二 Host 使用同一 SQLite 文件核对版本、消息前缀、durable ownership，并成功继续提交。仅证明已确认事实的恢复，不证明任意在途写入自动排空。
- 首次运行失败及修复：去掉 JSONL 初始化后暴露 provider 注册竞态，Host 输出 `spawn ... not registered`，baseline 等待结果超时；finally 完成清理且对应临时根已核对不存在。consumer 改用公开 `subagent/provider-added` 等待指定 provider，保留 prepareContinuable 检查，不添加延时或放宽断言；真实 Cordis 先到/后到、无关 provider、卸载测试及原 lifecycle 共 12 tests、typecheck、lint 通过，再重跑上述五场景全部通过。
- Restore：wrapper 在成功与失败路径均停止自己创建的 Host、检查端口释放、删除各场景临时根和打包根；最终五场景成功行出现在对应 Restore 之后。
- Not Covered：其余 11 个 selector、本次新增真实模型调用、真实断电/硬件故障、性能/压力、多进程写入、关闭时任意在途写入自动排空。开发期迁移和已有版本升级为 Not Applicable（首次发布）。历史 16 场景结果仍只代表原基线。

## Historical Smoke Layering

以下 Scope 至 Closure 均属于 `bd0159b` 后的历史 smoke 分层调整。

### Scope

2026-09-07，基于 `bd0159b` 加本次工作区调整，重新划分整个 smoke 的覆盖层次。保留已合入的离线协议测试、Client 事实展示及 Browser 重复停止信号修复。环境为 Darwin arm64、Node 22.23.2、pnpm 10.7.0、DSH 0.1.1-rc.2，profile=web、provider=spawn。

### Validated Contract

- 默认运行 5 个核心场景，`--all` 运行 14 个场景，环境变量仍支持单场景诊断；覆盖目的见 [操作入口](../50-operations/HOW-TO-DSH-SMOKE.md)。
- 每次命令只构建、打包一次；场景之间独立 Host、profile、workspace、DSH_HOME、端口。失败停止后续场景，清理通过后才输出 PASS。
- no_consensus 保留现有领域测试；新增 Proposal 重置后再次停滞及 Turn/message 两类预算完成优先级测试，删除对应三个重复 smoke selector。领域测试不宣称真实 DSH 故障注入。
- 实际归档 DTO 复用正式 Schema；中间状态断言在 driver 执行，输出校验保留关键持久化关联与生命周期证据。移除按字段穷举的 smoke 测试矩阵，保留已知错误 envelope、非法归档与关键关联回归。

### Executed Validation

| 命令或检查 | 结果 |
| --- | --- |
| `pnpm --dir plugin smoke:profile --all` | 14/14 PASS，97.262 秒，一次构建；逐场景目录删除、端口释放通过 |
| `pnpm --dir plugin smoke:profile` | 5/5 PASS，36.050 秒，一次构建；最终 Restore 实现通过 |
| 安装失败、Host 启动失败注入 | 两次均退出 1，无 PASS 输出，无新增 smoke 临时根残留；失败路径端口检查通过 |
| `reassign` Browser mode 启动与停止 | preflight、ready JSON/URL、PTY Ctrl-C、退出 0、cleanup marker、精确目录与端口检查通过 |
| `pnpm --dir plugin verify` | format、lint、Host/Client typecheck、76 files / 664 tests、build、environment、contract、Agent Definitions、package 全通过 |
| `--json` 单场景诊断 | stdout 可直接 JSON.parse，完整 archived DTO 与 Restore 结果保留 |

完整套件先验证全部场景，随后将端口检查纳入共用 Restore，再运行默认套件和失败注入。时间来自本机本次运行，包含构建，不是性能保证；相比逐条执行 14 个独立命令，消除了 13 次重复构建/打包。Browser 重复信号的现有子进程回归测试继续通过。

最终移除被删除场景遗留的无用参数和分支后，相关 lint、两个脚本测试文件（55 tests）及真实 Turn 预算完成场景重跑通过。相对 `bd0159b`，插件代码与测试净减少 804 行。

### Not Covered

- 本次 Browser mode 仅验证宿主 ready/preflight 和退出清理，未重新执行人工页面交互；Client 展示由已合入测试覆盖，历史 Browser 证据不外推。
- 没有真实模型调用、跨 Host、生产发布或长期资源压力证明；三种已移除 selector 的历史真实运行仅保留作历史证据。

### Closure

当前执行入口和分层矩阵已同步到操作文档。产品代码、公开协议、权限与存储语义未改变；TODO 无本任务登记项。新实现保留协议错误码修复以及实际归档 Schema 校验。

## Retired Convergence Scenario Evidence

以下仅保留已移除 selector 的历史真实运行摘要，不是当前执行入口。2026-09-07，在干净基线 `5f0cc145df8dd194242220730dc1ab359e943573`，使用 Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、web profile、spawn provider，分别执行 `CONVIVIUM_SMOKE_SCENARIO=<selector> pnpm --dir plugin smoke:profile`，均退出 0。

| 已移除 selector | 当时实际观察 |
| --- | --- |
| `convergence-no-consensus` | 首条提交产生 blocking question，第四条后 no_consensus；最终归档保留问题，版本 7 |
| `convergence-reset` | 第四条提交新 Proposal，stall/replan 同时归零，后续重新 refocus/replan，第七条后 partial/stalled；归档版本 10 |
| `convergence-message-budget-completion` | maxTotalMessages=2，第二条合法 claims 先得到 converging，随后 Captain 显式 completed/objective_satisfied；归档版本 6 |

三场景均观察到旧 Agent 提交被拒绝、完整归档和版本不变、meeting child inactive 且无 resident Session；wrapper 完整退出后逐次核对精确临时根不存在、端口可 exclusive bind，Restore 通过。没有调用真实模型或 Browser，也没有 Host 冷重启或长期资源压力证据。

后续 Review 在 `6e7441b` 加修复工作区的边界，以正式归档 Schema 和 `ProtocolErrorV1.code` 校验结果，原五个新增收敛 selector 再次逐一通过，五次 Restore 均通过；该历史重跑不恢复已删除入口。当前规则差异由 `plugin/tests/unit/domain/transitions/turn-advancement.spec.ts` 保留回归，当前真实覆盖为 fallback、stalled 和 Turn budget 场景，当前结果见上方 Current Baseline Validation。详细旧运行表与逐步日志说明保留在 Git 历史。

## Captain Attendance Rejection Loader

2026-09-07，在 `f5cb663`，使用 Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、独立 web profile、spawn provider，执行 `CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile`，退出 0；场景 6210ms，总耗时 9888ms，一次构建，Restore PASS。

真实 Captain 经 Loader 调用新工具，缺失 recommendation 返回 `INVALID_ARGUMENT`、`retryable=false`，version 不变且推荐仍为空，随后 Manager plan 正常；既有 ACB transcript 和 HTTP pause/resume 断言通过。wrapper 完成 Host、进程、端口及临时资源清理。该断言保留在现行 baseline 中，后续全量运行见上方 Current Baseline Validation。

Not Covered：没有生产 Catalog 成功推荐→拒绝、真实模型自主推荐/拒绝、拒绝 Browser/HTTP/Client 控制展示、专项 Host 冷重启或长期压力证据。成功拒绝与 JSONL reopen 的自动化证据见 [验证索引](./CURRENT-IMPLEMENTATION-COVERAGE.md#captain-attendance-rejection)，不外推为真实 Host 成功链路。历史分步命令及测试数量保留在 Git 历史。

## Captain Local Decision Risk Browser

2026-09-07 16:29–16:32，在干净被测提交 `b63697dc90b3831693f4f18e37d3184028fe14d0`、实现分支 `codex/local-decision-risk-control` 执行。环境为 Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`。此节为历史实际页面验收，后续普通 smoke 不替代该 Browser 基线。

启动命令：

```sh
env CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

PTY session `31602`。ready 为 ok=true、profile=web、provider=spawn、browserReady=true，assertions=[browser-local-decision-risk-ready]。URL 为 `http://127.0.0.1:61420`，临时根 basename 为 `convivium-dsh-smoke-bK3hnW`（精确路径保存在本轮工具记录）。Meeting 为 `meeting-2e90a06ac1d4197b13f8d78760c8c94c`，Captain Session 为 `convivium-smoke-captain`，初始 status=paused、version=4。候选 ID 分别为 `decision-candidate-turn-1-delivery-0-1`、`decision-candidate-turn-1-delivery-0-2`，risk ID=`issue-turn-1-delivery-0-1`，evidence ID=`message-turn-1-delivery-0`。

通过真实 Browser 加载 Captain 的 `Local decision risk browser evidence` Session、Meetings view 和 `Decision risk closure` 面板。以下七步均通过面板执行，无 API 写入或自动重复提交：

| 步骤 | 实际结果 |
| --- | --- |
| 1 Accept decision | 证据预选，reason=`Browser accepts scope`；version=5，Decision A accepted，第二候选仍 pending。 |
| 2 Replace decision | 选择第二候选后证据预选，reason=`Browser replaces scope`；version=6，A superseded 且指向 B，B accepted，pending 为空。 |
| 3 Revoke decision | 初始证据为空，手选 `Use the accepted proposal`，reason=`Browser revokes scope`；version=7，accepted 为空，A/B history 保留为 superseded/revoked。 |
| 4 Accept risk | 证据预选，reason=`Browser accepts risk`；version=8，status/disposition=accepted_risk，blocking items 为空，按钮变为 Set as blocking。 |
| 5 Set as blocking | reason=`Browser rejects risk`；version=9，risk open/blocking 并重新进入 blocking items，会议仍 paused。 |
| 6 Reload | 刷新并重选同一会议后仍为 version=9、paused；A/B history、risk、空 pending/accepted 集合不变。 |
| 7 End meeting | Partial、reason=`Browser local control archive`，只点击一次；最终 archived、version=12，五种写控件全部消失，history/风险保留。 |

A/B 的 ID 分别为 `decision-decision-candidate-turn-1-delivery-0-1`、`decision-decision-candidate-turn-1-delivery-0-2`。同 origin 的归档 GET 返回 ok=true、archived/version=12；Python assertions 验证两条 history 及 A→B 替代关系、六条 completionFacts 全部 authority=local_host/assertedBy=local-host:loopback-web、证据均为 ready.evidenceMessageId、reason 顺序与五次输入一致（替换产生两条）。两个 risk_acceptance fact 分别为 accepted/superseded、rejected/active；归档 Issue 为 open/blocking/true。

执行差异：Replacement decision 的 label locator 没有匹配，改用已观察到的原生下拉控件和键盘完成同一选择，没有提交失败；JSON 新 tab 导航返回 `net::ERR_BLOCKED_BY_CLIENT`，改用 `curl --fail` 对同一 loopback URL 只读 GET 审计，没有绕过 UI 写入。Browser console warn/error 为 `[]`，未出现产品 alert 或 bundle 错误。

Restore：关闭本轮 UI tab，向同一 PTY 发送一次 Ctrl-C；exit 0，输出 `PASS decision-risk-closure 177042ms restore=PASS`、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`、`PASS 1 scenarios 182273ms (one build)`。随后核对该次精确临时根不存在（TEMP_REMOVED），TCP 61420 连接被拒绝（PORT_RELEASED）。未手动删除临时根或终止用户 Host。

Not Covered：未调用真实 LLM、未重启 Host，不证明真实 Host 冷恢复；远程、多用户、跨 Host、长期压力、吞吐与发布验证均未覆盖。自动化持久恢复及五动作验证索引见 [Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md#captain-local-decision-risk-control)。

## Client Fact Visibility Browser

2026-09-07，在最终代码 `0cb0193` 上执行以下真实 Browser 空态验证。该历史记录未单独列出 Node/pnpm/OS 版本，不从其他轮次补推环境；profile/provider 与实际 ready 结果如下。自动化完整 verify 在提交前的同一源码工作区通过（74 files / 608 tests），不替代页面证据。

使用 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md) 的现有确定性入口：

```sh
env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

最终运行分配 PTY，wrapper 工具 session 为 `2581`。13:09 的 ready 输出：`ok=true`、`profile=web`、`provider=spawn`、`scenario=reassign`、`browserReady=true`、assertions 为 `[browser-reassign-ready]`；meeting ID 为 `meeting-d99cf43fc6f1029c56eff81fcf5958cb`，Captain 为 `convivium-smoke-captain`，speaker 为 `participant-a`，old/current attempt 同为 `turn-1-attempt-0`，version 为 2。唯一 URL 为 `http://127.0.0.1:64067`；唯一临时根由该轮 marker 记录，basename 为 `convivium-dsh-smoke-Z0mTKv`（完整机器路径保存在本次工具记录，不写入仓库）。

实际通过 CUA 选择 workspace 下的 Session 行、Meetings tab、Runtime smoke (running)。Session 行显示“新会话”，已加载会话内容和标题为 `Browser reassign evidence session`；该文本由现有 reassign probe 写入 Captain 后附加到 workspace，未猜测或修改导航。UI 显示 intent=`explore`、reason=`explore`、objective=`Reassign A to B`；首次和刷新重选后的同一 loopback GET 均返回相同 version 和三字段，reason 逐字一致。

两轮 DOM 快照显示 `No accepted decisions.`、`No decision history.`、`No parking lot items.`、`No risks.`；新增区域没有按钮/输入框，原有 Pause/Skip/End 在原因为空时 disabled。真实截图记录了 Current activity 和四个空态区；页面无框架错误覆盖层，读取 Browser console warn/error 均返回 `[]`。刷新后重新选择 Session/view/Meeting，再次完成同样断言。未点击会议写按钮，未调用模型。

最后关闭本次 tab，向同一 PTY 发送一次 Ctrl-C，返回 **exit 0** 且输出 **`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`**。随后对 marker 的精确路径执行存在性检查，结果 `TEMP_REMOVED`、exit 0；TCP 64067 连接被拒绝，输出 `PORT_RELEASED`。最终成功运行没有手动删除临时根。

### 清理失败及修正记录

先前运行的 basename `convivium-dsh-smoke-9T3aNR`、`convivium-dsh-smoke-1jWe2I`、`convivium-dsh-smoke-BuP8g3` 未取得 cleanup marker，不能作为 Restore PASS；首个目录曾被手动删除，原错误收口由 `aa95416` 恢复。首轮 PTY 复现 `convivium-dsh-smoke-6WFvTW` 同样遗留目录，因此只分配 PTY 不足以修复。

`waitForBrowserStop` 原先在首个终止信号后立即移除两个 handler，使重复转发信号能在 finally 期间结束进程。改为保留 handler 至 CLI 退出，真实子进程回归与最后一轮完整 smoke 均通过。修改不涉及会议状态、profile 组合、selector 或凭据。失败轮保留其失败结论，不用最终通过覆盖历史。

Not Covered：本轮未验证非空 Decision history、Parking Lot、archived issues 的 Browser 端到端链路，非空集合及错误恢复当时仅由 Schema/component/HTTP mock 消费链覆盖。后续 Decision/risk 非空页面验收见上方独立记录，不能外推到 Parking Lot 或全部 archived issues。没有模型请求、真实降级/收敛、Host restart、压力或发布证据；页面刷新/reopen 不等于 Host 冷恢复。自动化索引见 [Client Fact Visibility](./CURRENT-IMPLEMENTATION-COVERAGE.md#client-fact-visibility)。

## Historical Runtime Browser

以下迁自早期 Runtime 验证记录，保留各轮独立边界。2026-09-03 的 Runtime 记录以 `2f49e1af2d09206cb763a39676151a9d4466c80b` 为基线，环境 Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、web profile、spawn provider；Reassign 的补充记录明确使用下述独立提交，原文未另列该补充运行的日期和环境。其他轮次沿用原记录所属基线，不推导为相同运行。

- Reassign 被测提交 `22ded07c3d126464684867d358fe338a9b4fe583`：`CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile` 完成真实 Browser 五项 Reassign 观察；wrapper 退出 0，观察到 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，且 exact temp root 不存在。页面验证 `Runtime smoke (running)`、`participant-a` 当前 Speaker、空 reason 时 `Skip current speaker` disabled、输入 `Browser reassign evidence` 后 enabled、点击后 status 为 `waiting` 且旧 control 消失、`role=alert` 为 0；刷新后旧 control 仍不存在。
- pnpm browser UI run：Pass，退出 0，`CONVIVIUM_SMOKE_TEMP_ROOT` 不存在；`Runtime smoke` 完成 `running → paused → running`，End outcome 选 `Partial`，最终 Meeting summary 为 `archived`，Termination Code=`captain_accepted`、Reason=`Readiness evidence`，Pause/Resume/End controls 均不存在。
- pnpm wrapper cleanup marker：Not observed；wrapper 退出 0 且 temp root 已删除。该 wrapper 边界不得改写为已观察 marker。
- direct-node cleanup probe：Pass，退出 0，观察到 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，且 probe temp root 不存在；probe 不执行浏览器交互。

Not Covered：以上历史 Browser 结果不证明后续 HEAD、真实模型、Host 冷恢复或长期资源无泄漏。未观察到的 wrapper marker 不得由 direct-node probe 补证。旧 SQLite 基线、普通 selector 表和各轮测试数量保留在 Git 历史；当前普通运行以最新 smoke 基线为准。

## Referenced Minutes Browser

### 初次页面验收

2026-09-07，验证对象为 `2854524` 加收口 diff（删除 smoke 临时诊断包装及文档）；Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、web profile、spawn provider。以 PTY 执行：

```sh
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

- 本次实际 URL：`http://127.0.0.1:62919`；独立临时根 basename `convivium-dsh-smoke-ZpnYNl`；meetingId `meeting-d99cf43fc6f1029c56eff81fcf5958cb`。这些是已清理的验收环境标识，不是长期访问入口。
- Captain Session 页面标题 `Browser smoke session`，进入已注册 `Meetings` view 并选择 `Runtime smoke (running)`；版本 4。
- Transcript 顺序为 participant-a 的 `source-a`、participant-b 的 `Minutes draft based on source-a`。b 行显示 `Minutes draft (non-authoritative)`、`messages 1–1`、`message-turn-1-delivery-0`。来源行没有草稿标识；Accepted/Pending decisions 均为空。
- 刷新页面后重新选择会议，内容与 metadata 不变。End outcome 显示 `Partial`，输入 `scribe minutes smoke` 后点击 `End meeting`；显示 `archived`、版本 7。
- 归档后再次刷新并重新选择会议，来源与草稿正文及三项 metadata 保留；Termination reason 为 `scribe minutes smoke`，无运行控制。Browser 捕获的 warn/error console 列表为空。
- 在原 PTY 发送 SIGINT；wrapper exit 0，`PASS scribe-minutes ... restore=PASS`、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。精确临时根存在性检查为 absent，loopback 端口连接被拒绝，使用 SO_REUSEADDR 可重新绑定；关闭本次创建的 Browser tab。未处理其他运行的 smoke 资源。

### 合并后页面复验

2026-09-07，在父分支 `e9f08c212d65e487a43a2f8990834d5c9639ceff` 合入 `origin/main` 的 `03e3a0ef430362888439bf01c1beaf831342165f` 后的工作树，再次执行同一 Browser 命令；原记录未另列该轮环境版本，不补推。

- `CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`：再次通过真实 Meetings view 验证 source-a、draft 三字段、刷新保持、Partial End、archived 后刷新；版本 4 → 7，结束原因 `scribe minutes smoke`。warn/error console 为空。原 PTY SIGINT 后 exit 0、`restore=PASS`、`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`，本次精确临时根 `convivium-dsh-smoke-PjNXsX` 已删除。

后续从 `d97da4d` 合入 main `a2a6fb460713fcb8968a6578cf4528de0ebfe1ee` 仅重跑普通 scribe-minutes，未重复 Browser；以上页面结果保持各自验证边界。当前普通场景结果见上方 Current Baseline Validation。

Not Covered：两轮确定性 DSH/HTTP/Browser 接线不证明 LLM 纪要质量、长期压力或生产发布。邮件“发送后新增 transcript 再派发”的跨层动态场景未由本验收覆盖；完整范围及自动化索引见 [Referenced Minutes](./CURRENT-IMPLEMENTATION-COVERAGE.md#referenced-minutes)。

## Audit Baseline Validation

2026-09-07，代码基线 `743edbee564d34402fedc2bb44ebbb006790fe1a`，`codex/align-code`；本次仅 readiness 文档变化。环境：Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、profile `web`、provider `spawn`。

执行 `pnpm --dir plugin smoke:profile --all`，exit 0；当前 `SMOKE_SCENARIOS` 的 16 个场景全部通过，总耗时 140404ms，一次构建。默认 CORE_SCENARIOS 仍为 5 个，已包含在此次全量执行中；本次没有另跑默认命令。

| 场景 | 耗时 ms | 场景及 Restore |
| --- | ---: | --- |
| baseline | 8034 | PASS |
| timeout | 7024 | PASS |
| reassign | 11798 | PASS |
| task-handraise | 9797 | PASS |
| completion-end | 8695 | PASS |
| risk-reopen | 7714 | PASS |
| decision-risk-closure | 9865 | PASS |
| cold-rebind | 9942 | PASS |
| role-composition | 10317 | PASS |
| archive-continuation | 7563 | PASS |
| mail-race | 7932 | PASS |
| cross-meeting | 10185 | PASS |
| convergence | 6395 | PASS |
| convergence-stalled | 6458 | PASS |
| convergence-turn-budget-completion | 6463 | PASS |
| scribe-minutes | 7646 | PASS |

role-composition 输出两个不同 Host PID（98770、98779），九项断言齐全；两阶段角色检查 true，Participant 禁用工具 body 调用数 0，第二阶段配置 `2.0.0`，恢复仍保留 V1 persona。cold-rebind 与该场景均使用真实 Host 重启；不把它们外推为缺失 Session 补建验证。

Prepare/Restore 由现有 wrapper 完成：每场景使用独立临时 profile、workspace、DSH_HOME 和端口；停止 Host、删除该场景精确临时根并验证端口可独占绑定后才打印 `restore=PASS`，命令结束清理共享构建目录。未使用 fake adapter 替代真实 provider，也未重跑本节历史失败注入。

同基线 `pnpm --dir plugin verify` exit 0，82 files / 1039 tests，全部 gates PASS。该历史基线的源码分析另复现完成/调度偏差；当时 smoke 未覆盖这些反例，不构成缺陷关闭依据。历史反例保留在 Git 历史，当前实现与回归见 [Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)。

本次 Not Covered：Browser 页面交互、真实模型请求、Host producer 成功 attendance recommendation→reject、完整中断创建/缺失 Session 恢复、长期压力和生产发布。当前普通模式 HTTP/Session/归档验证不替代这些范围，既有 Browser 记录保持原基线。

## Historical Alignment Baseline Validation

2026-09-08，源码为 `6679403fc8cb6de01db1c7d2fb190d3a9484dd73`（验证在提交前的同一源码工作区执行），分支 `codex/align-code`。环境：Darwin 25.5.0 arm64、Node `v24.19.0`、项目 pnpm `10.7.0`、DSH `0.1.1-rc.2`，profile `web`、provider `spawn`。

`pnpm --dir plugin smoke:profile --all` 实际退出 0；16/16 场景 PASS，总耗时 156709ms，一次构建。每个场景均在 Host 停止、独立临时根删除与端口 exclusive bind 检查通过后输出 `restore=PASS`；命令结束清理共享构建目录。没有另启 Browser 或长期 Host，没有模型请求。

| 场景 | 耗时 ms | 场景及 Restore |
| --- | ---: | --- |
| baseline | 30251 | PASS |
| timeout | 6637 | PASS |
| reassign | 11362 | PASS |
| task-handraise | 8965 | PASS |
| completion-end | 8098 | PASS |
| risk-reopen | 9512 | PASS |
| decision-risk-closure | 9369 | PASS |
| cold-rebind | 9324 | PASS |
| role-composition | 9959 | PASS |
| archive-continuation | 7234 | PASS |
| mail-race | 7714 | PASS |
| cross-meeting | 9531 | PASS |
| convergence | 6809 | PASS |
| convergence-stalled | 6193 | PASS |
| convergence-turn-budget-completion | 5869 | PASS |
| scribe-minutes | 7662 | PASS |

role-composition 的两个 Host PID 为 63818、63832，九项断言齐全：持久 checkpoint、Host 更换、原 parent 重绑、transcript 前缀保留、冷 followup 提交、persona 隔离、工具拒绝、parent 不变和 V1 配置保留。两阶段角色检查均 true，受限工具 body 调用数 0，第二阶段配置 `2.0.0`，恢复仍保留 V1 persona。

同一最终源码工作区 `pnpm --dir plugin verify` 实际退出 0：84 files / 1063 tests，Vitest 69.29 秒，format/lint/Host 与 Client typecheck/build/environment/plugin contract/9 Definition samples/package 全 PASS。首次因本机缺少两个已锁定 DSH 包而在 typecheck 失败，执行 frozen-lockfile install 后最终重跑通过，未改 manifest 或 lockfile。

Not Covered：新面板 Browser 交互、真实模型、缺失真实 Session/创建中断故障注入、完整 metrics 采集与长期压力、FR-13 producer 成功推荐→reject 专项、生产发布和高版本兼容。cold-rebind/role-composition 不证明缺失 Session 补建；HTTP/Client 产物断言不替代 Browser。当前恢复与诊断的具体自动化边界见 [Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)。

## Meeting Roles Deployment

### Initial Attempt Scope And Prepare

以下保留首次失败及修复过程；当前验收结论见本节末尾 Final Authorized Validation。

2026-09-08，分支 `codex/meeting-agent-role-description`，运行基线 `accb2b8`（完整 SHA 可由该 commit 查询）；验证启动时工作树干净。Node v22.23.2、pnpm 10.7.0、DSH 0.1.2-rc.1，web profile、spawn provider。本轮交付 roleDescription、Host agentModelOverrides、九角色原生资产与部署探针；不沿用旧 schema 的历史 smoke 作为首发部署成功证据。

沿现有 wrapper 的 dev.env 校验与 Host-only 注入；构建、打包、安装和 dump-config 不取得密钥。每个命令构建一个 tarball，角色部署场景从同一 tarball 安装插件并解包资源；仅使用独立临时 DSH_HOME、workspace、端口，未修改日常 profile。

### Executed Validation And Assert

| 命令 | 本轮结果 |
| --- | --- |
| `pnpm --dir plugin verify` | 最终 exit 0；86 files / 1134 tests；format/lint/双端 typecheck/build/environment/contract/九角色资源/package 全 PASS，打包 missingArtifacts 和 forbiddenPublishedPaths 均为空 |
| `env CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile` | exit 0；场景 12494ms、命令 17173ms；九项断言全部通过，restore=PASS |
| `env CONVIVIUM_SMOKE_SCENARIO=meeting-roles pnpm --dir plugin smoke:profile` | exit 1；Captain setup/mount 阶段失败，错误 `agent-presets: preset "convivium" not found (available: standard, ptc, minimal, cordis)` |
| `pnpm --dir plugin smoke:profile` | 按失败即停止规则未执行，不能用历史五核心结果替代本轮 |

第一次完整 verify 在 `ce669d7` 的旧 package contract exports 预期失败（85 files / 1133 tests PASS、1 test FAIL）；按本次校准授权补齐闭合 files/exports 预期并单独提交 `accb2b8`，没有放宽断言。表中完整 verify 为修正后从首条命令重新执行的结果。

role-composition 的 Host PID 为 69905、69914。两阶段角色检查均 true，phase 2 配置为 2.0.0，恢复仍保留 V1 派生 persona/filter/provider/model/reasoningEffort；父配置未变、拒绝工具 body 调用数为 0。该确定性适配器验证不证明远程模型质量。

### Deployment Failure Diagnosis

只读核对安装的 cordis-plugin-loader 1.0.3 与 cordis-plugin-include 1.0.7，并直接调用其 `evaluate` / `applyEntryPatches` 复现：

- `evaluate({baseUrl:"file:///isolated/dsh-home/profiles/web/"}, "new URL('presets/', baseUrl).href")` 返回 profile 下的 presets 路径；外部 patch 文件不成为该表达式的 baseUrl。当前随包 patch 因而没有指向解包的角色资源目录。
- `applyEntryPatches` 对同 id 的后一个 config 做整体替换。当前 smoke 控制 patch 仅重述 provider/dataRoot/容量/超时，因此覆盖部署 patch 的 agentDefinitions；复现结果 `laterControlPreservesDefinitions:false`。该问题在修复 Preset 定位后仍会阻止定义选择。

需要先校准原生部署资源定位和完整 config 组合契约，再修改随包 patch、wrapper、对应测试及操作说明。该轮 T5 不允许修改这些实现，故在此 STOP；没有扩大权限、复制 Preset、注入假 Skill 或更换 provider 继续测试。

### Restore

失败场景临时根 `convivium-dsh-smoke-bVrI9u` 已由 wrapper finally 删除，实际存在性检查为 absent；该轮 loopback 端口 49494 可重新 exclusive bind 并关闭。wrapper 仍返回原始 probe 错误，没有 Restore 错误；外层 finally 同时清理共享构建根。role-composition 明确输出 restore=PASS。失败诊断不保存临时访问 token、密钥或模型/工具正文。

### Initial Failure Boundary

后续修复和定向执行见下节；三研究角色完整 search/fetch、Manager/Scribe 全部权限断言仍未通过，属于阻止交付的必过项，不作为可豁免范围。默认五核心复验尚未运行。MAD-10、MAD-11 未完成，临时 RUNBOOK 与 TODO 保留。

长期模型任务质量、独占 Skill/per-child Preset、动态 admission、日常 profile 和 Host capability 内容变更后的历史快照继续不在本次范围。该轮结论是角色模型与静态资源已实现、真实部署阻塞，不能称为部署完善。

### Native Probe Repairs And Network Diagnosis

在 cd9b105 上完整 verify 为 86 files / 1135 tests PASS；role-composition 为 12529ms、Host PID 72275/72288、restore=PASS。其后定向部署逐项定位并修复：非 inject 的 agentPresets 改为 ctx.get；Captain 使用 CreateAgentOptions.agentOptions 选择 deepseek-official/deepseek-v4-flash；continuable child idle 后自动释放，研究/权限/status 检查移到原生 Skill 的 tools/post-execute 内，返回原 decision 并 finally 注销；ToolFailure 读取 error.info.code。回归覆盖模型创建边界、turn/end error 及时失败、异步检查完成前不返回 Skill decision、原生 UNKNOWN_TOOL 与 Provider error 的区别。本轮 77 focused tests、lint、双端 typecheck、九角色门禁和文档检查 PASS。

定向场景 qGdmUI/1VxCbs/O5CCZO 已完成九次真实 Skill 加载，再因复用已释放 Agent 调用 search 而失败；未把这些失败当完整部署通过。生命周期修复后 FEnbiA 场景完成前五角色 Skill/status 和 Manager 两次真实 UNKNOWN_TOOL 拒绝，GitHub 原生 search 返回 github.com 来源；web_fetch 报 WEB_BLOCKED_URL：github.com resolves to a non-public IP address。由于按序停止，其后三研究完整结果及 Scribe 权限尚无本轮成功证据。

只读 Node dns.lookup 证明 github.com、arxiv.org、www.typescriptlang.org 均返回 198.18.*；系统 DNS 指向 Shadowrocket MacPacketTunnel 的 Fake-IP 解析。curl 经系统代理成功不能替代原生抓取的公网 DNS 与固定连接检查。未放宽 DSH 地址校验或替换 Provider；仓库外网络调整已请求用户确认，电脑控制工具未获权限，尚未修改配置。

上述临时根均由 wrapper finally 清理；最近 FEnbiA 轮无 Restore 错误，原始失败正常返回。诊断只记录失败码、域名、配置边界与阶段，不保存 token、密钥或模型/工具正文。该轮四命令顺序门禁未完成，MAD-10/MAD-11 当时保留。

修复工作区随后完整 `pnpm --dir plugin verify` exit 0：86 files / 1141 tests，Vitest 78.52 秒；format/lint/双端 typecheck/build/environment/contract/九资源/package 全 PASS，missingArtifacts 与 forbiddenPublishedPaths 为空。最近 FEnbiA 临时根再次核对 absent，51528 端口 exclusive bind/close PASS。此门禁覆盖本小步修复，不替代网络恢复后的完整 T5 顺序复验。

### User-authorized Fetch Waiver

2026-09-08 用户明确要求“web_fetch 先跳过吧”。本轮仅豁免三个研究角色的真实抓取，保留部署资源中的 web_fetch 能力和默认严格 smoke；不改 DNS 或代理。显式 CONVIVIUM_SMOKE_SKIP_WEB_FETCH=1 将结果记录为 skipped:user-waiver，搜索、九角色 Skill、权限、状态不变及其他 smoke 仍必过。该未覆盖项不阻止本轮已授权任务收口，但不能据此宣称原生抓取通过。最终结果如下。


### Final Authorized Validation

2026-09-08，分支 codex/meeting-agent-role-description，完整源码基线 `b3f02c2a75621f3f05f724c61dacdf45fe4264d6`，四条命令执行期间工作树干净。Node v22.23.2、pnpm 10.7.0、DSH 0.1.2-rc.1，独立 web profile、spawn provider；后续仅更新状态/证据文档与角色 README。8b7fae0 首轮 format gate 失败，b3f02c2 修正测试链式调用格式后从第一条命令重跑，无测试断言变化。

| 顺序命令 | 实际结果 |
| --- | --- |
| `pnpm --dir plugin verify` | exit 0；86 files / 1143 tests，Vitest 72.32 秒；format/lint/双端 typecheck/build/environment/contract/九角色资源/package 全 PASS，missingArtifacts/forbiddenPublishedPaths 为空 |
| `env CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile` | exit 0；场景 22369ms，命令 39441ms；9 项断言、两阶段角色核验、restore=PASS |
| `env CONVIVIUM_SMOKE_SCENARIO=meeting-roles CONVIVIUM_SMOKE_SKIP_WEB_FETCH=1 pnpm --dir plugin smoke:profile` | exit 0；场景 60856ms，命令 74058ms；5 项授权范围断言，stdout 明示 web_fetch Not Covered，restore=PASS |
| `pnpm --dir plugin smoke:profile` | exit 0；5 个核心场景共 91213ms（one build），每场景 restore=PASS |

Prepare：每条 smoke 构建并打包当前代码，只在自己的临时 DSH_HOME/workspace/端口安装运行。九角色使用同 tarball 的 definitions、共享 convivium Preset 和九 Skills，部署 patch → 完整控制 patch 顺序，CONVIVIUM_MEETING_ROLES_ROOT 精确定位解包资产。仅 Host 注入 dev.env 密钥；未更改用户日常 profile、DNS、代理或凭据。

Assert：九角色命令的严格 validator 接受九个不同 Session 的有序 Skill 成功记录，分别为 meeting-management、domain-architecture、dsh-runtime-engineering、protocol-ui-engineering、verification-review、github-source-research、arxiv-paper-analysis、web-source-research、referenced-minutes。每项均来自原生 skill 调用/结果四步正文及随后 ROLE_READY。GitHub/arXiv/Web 三个真实 child 的原生 search 均有对应域来源；三项 fetch 精确为 skipped:user-waiver，未执行抓取、未计成功。Manager/Scribe 各一次越权会议写工具、一次 web_search 均在 lookup 返回 UNKNOWN_TOOL；九身份 status 成功，暂停状态/version/messages 不变。assertions 为 shared-preset-mounted、nine-independent-sessions、nine-native-skills-loaded、research-search-operational、meeting-authority-preserved。

Cold recovery：Host PID 79528 → 79544，phase1Checked/phase2Checked 均 true；第二 Host 配置版本为 2.0.0，恢复仍持有既有 V1 派生 persona/filter/provider/model/reasoningEffort，父配置不变，禁用工具 body 调用数为 0。两个模型差异由原生 descriptor 和确定性适配器断言验证，不等于两个远程模型的质量评测。

Core：baseline 19205ms、cold-rebind 21420ms、cross-meeting 16909ms、convergence-stalled 8609ms、convergence-turn-budget-completion 10155ms，全部 PASS。

Restore：三条 smoke 的每场景均由 wrapper finally 停止本次 Host、删除临时资源并验证端口释放；外层共享构建根也清理完成，全部正常 exit 0，无 Restore 错误。未保存密钥、访问 token 或模型/工具正文。

Closure：本轮用户授权范围已验证完成，可关闭部署验收与临时计划。**Not Covered：web_fetch 按 2026-09-08 用户明确要求跳过，原生抓取可用性仍未验证**；默认命令继续严格验证抓取，解除 Fake-IP 环境问题后可重新运行，不需要修改产品或降低原生地址检查。完整无豁免的 FR-14 部署验收、模型长期任务质量、独占 Skill/per-child Preset、动态 admission、日常 profile 与 Host capability 内容历史快照不由本次证据证明。

## UI primitives migration

### Scope

2026-09-09，在 `codex/ui-primitives-research` 验证会议面板 Button/Input 迁移和 End outcome 单选组。完整 verify 与 Browser 证据的代码基线为 `57a47b7`；`dc57b25` 替换错误 Skip 截图，`d8c5662` 提交 End Browser 证据和操作约束。最终源码边界为 `d2f8aa4`，该提交修改 smoke-profile 的 Browser 认证预检分支并新增定向测试，未重跑完整 verify，不能将旧基线的结果描述为最终脚本的完整验证。环境：macOS、DSH Web `0.1.2-rc.1`、spawn provider、React/React DOM `18.3.1`、`@deepseek-ai/dsh-client-ui-primitives@0.1.2-rc.1`。

### Validated Contract

普通按钮使用 DSH Button，Pause/Skip/End reason 使用 Input，End outcome 为三个 radio 语义 Button。选择只修改草稿，End meeting 独立提交；缓存禁写与提交中的互斥由真实包 Client 测试覆盖。协议、后端领域语义和状态 owner 未改变。

### Executed Validation

- 在 `57a47b7` 基线重跑 `pnpm --dir plugin verify`，退出 0；format:check、lint、Host/Client typecheck、test、build、verify:environment、verify:contract、verify:agent-definitions、verify:package 全部通过。77 个测试文件、1109 项测试通过；9 个角色定义验证通过，package 检查全部通过。
- 前期认证修复时执行 `pnpm --dir plugin exec vitest run tests/unit/scripts/browser-client-preflight.spec.ts tests/unit/scripts/smoke-profile.spec.ts`：55 项通过；`57a47b7` 的完整 verify 覆盖当时的认证、控件迁移、缓存禁写和重复提交测试，不包含 `d2f8aa4` 新增的最终分支回归。
- 本轮读取 `plugin/lib/client.js`：ModuleLoader 注册存在，全部 require 的唯一依赖为 `react` 与 `@deepseek-ai/dsh-client-ui-primitives`；无 `react/jsx-runtime`、`react/jsx-dev-runtime`、React 私有 internals 标记，独立断言退出 0。
- 仍出现上游 primitives 发布包缺少 `index.js.map` 的 Vite sourcemap 警告及 Node SQLite experimental warning；测试、构建和 Browser 均通过。

实际 Browser 为 **Codex In-app Browser**，通过 DOM locator、只读属性/几何查询、真实键盘和页面截图验证；未使用 Chrome 扩展会话。每次先关闭内测声明，在当前 DOM 中选择 Meetings tab 和与 ready meetingId 一致的按钮，并等待详情。此前“列表点击后没有详情”在本轮未复现；上一轮结束后失效的 tab handle 不能作为产品故障证据。没有据此改写产品事件处理代码。

| 场景 | 启动与 ready | 真实页面结果 | Restore |
| --- | --- | --- | --- |
| Skip | `env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`；ok/web/spawn、browserReady、browser-reassign-ready 通过，participant-a 与 turn-1-attempt-0 一致 | running/version 2；空理由 Skip 禁用，输入 `Browser reassign evidence` 后启用；点击后 Skip 消失、alert=0；刷新后 waiting/version 3，仍无 Skip、无 console error | 标签关闭；退出0，`PASS reassign 402752ms restore=PASS`、cleanup=ok；场景根 basename 为 convivium-dsh-smoke-LPWO8P，独立核对不存在、端口55837可独占绑定，退出0 |
| End | `env CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile`；ok/web/spawn、browserReady 和 minutes-context-visible、minutes-invalid-atomic、minutes-replay-stable、minutes-http-equal 四项通过 | 默认 Partial=true/0，其余 false/-1；空理由 End 禁用；键盘和四种布局通过；理由 `UI primitives browser evidence` 启用 End，点击后 archived/version 9；刷新仍 archived，End 与单选组不存在 | 主题恢复跟随系统、viewport reset、标签关闭；退出0，`PASS scribe-minutes 754096ms restore=PASS`、cleanup=ok；场景根 basename 为 convivium-dsh-smoke-kEkjNB，独立核对不存在、端口55318可独占绑定，退出0 |

两个场景的 meetingId 均为夹具确定值 `meeting-d99cf43fc6f1029c56eff81fcf5958cb`，分别运行于独立临时 Host。End 归档后原消息 `message-turn-1-delivery-0` 的 `source-a` 和纪要 `message-turn-1-delivery-1` 的 `Minutes draft based on source-a` 仍显示；`Minutes draft (non-authoritative)`、coverage messages 1–1、referenced ID 保持，控制台无 error。

键盘序列：Shift+Tab 离开 Partial 到 Pause reason，Tab 返回 Partial；ArrowRight→No consensus→Cancelled→Partial，ArrowLeft→Cancelled，Home→Partial，End→Cancelled，Home→Partial，Space 保持 Partial。每步焦点与唯一 checked 项一致，Tab 出组到 End reason。

四种布局为 light/dark × 1280×900/768×900。radio 外框均28px、间距4px、无重叠；Input 外框与 End 不重叠，全部处于面板水平边界内。Input computed height=32px、content-box、上下 padding=0、上下 border 各1px，外框34px，按盒模型核验通过；原先把32px直接用于外框的断言已纠正。选中背景浅色为 rgb(15,17,21)、深色为 rgb(249,250,251)，与未选中透明背景不同；文字非透明，键盘聚焦 Partial 的 outline 为 auto/1px。主题与 viewport 通过宿主 UI/Browser capability 设置，不注入样式。窄屏侧栏动画结束后读取最终几何与截图。

截图直接保存当前标签返回字节并逐张打开核验。`270430f` 原 Skip 截图内容错误，不作为证据；有效截图由 `dc57b25` 替换。

- [Skip 刷新后](./assets/ui-primitives/skip-after.png)
- [浅色宽屏](./assets/ui-primitives/light-wide.png)、[浅色窄屏](./assets/ui-primitives/light-narrow.png)
- [深色宽屏](./assets/ui-primitives/dark-wide.png)、[深色窄屏](./assets/ui-primitives/dark-narrow.png)
- [刷新后归档](./assets/ui-primitives/archived.png)

### Not Covered

`d2f8aa4` 的最终 Browser 认证预检分支未在本轮重跑完整 verify 或真实 Browser 场景；此前的完整验证和截图不能补足这一证据缺口。

未采用的 primitives、其他 DSH/React 版本、独立 Chrome 浏览器、非 Web 平台、完整可访问性审计、真实模型质量、压力和长期资源泄漏不在本次证明范围。截图未覆盖长页面全部内容，业务断言以读取的完整 DOM 为准。

### Closure

本次迁移验证完成，不扩大为 FR-11 全量验收。操作会话与截图要求见 [Smoke 操作手册](../50-operations/HOW-TO-DSH-SMOKE.md)。
