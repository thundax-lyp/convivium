# Captain Local Decision Risk Control Evidence

## Scope

执行日期：2026-09-07。分支 `codex/local-decision-risk-control`，产品基线 `b4bed41634d4600e460040b1b93895b42c9671ac`；本次最终代码与测试边界 `adb28ec`。环境为 Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`。

范围为 Captain/local 的 Decision accept、supersede、revoke 与单 Issue risk accept、reject 五动作，包含正式权限、领域审计、Runtime、HTTP、Client、持久恢复和 Browser 夹具。依据：[Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-7/FR-8.9/FR-11.9、[Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) Local decision and risk control、[Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)、[Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)。

## Validated Contract

| 边界 | 已验证结果 |
| --- | --- |
| 来源与权限 | Captain 的 Session/capability 校验保持；local 由后端绑定 `local-host:loopback-web`，fact authority 为 `local_host`、acceptanceMode 为 `local_host_acceptance`。HTTP 不接受调用方提交 authority；Manager/Participant 不获控制权限。 |
| 五动作与审计 | supersede 同时写旧 Decision disposition 和 replacement acceptance；revoke 保留 history；risk reject 恢复 open/blocking/true，旧 risk fact 留存为 superseded。缺失对象、非法证据、风险阈值、七种终态和输入不变性均有负向断言。 |
| 原子性与重放 | 复用 Repository commit、receipt 和 version gate；逐动作注入 commits put failure 后 read、持久 projection、冷 reopen 均不变，同输入重试只提交一次。证据列表含有效前缀和外部 message 时整体拒绝。来源间 receipt 隔离，原 receipt 在终态仍可重放。 |
| P2 收敛 | risk disposition 达到既有 completion judgment 时，同事务按 fact event → meeting.replanned 顺序写入，版本只增一次，状态 converging，清空 currentTurn/waitState，outbox 为空；不自动 end/archive。 |
| HTTP 与恢复 | 三条类型化 POST 入口经真实 Runtime/Domain/Repository 执行五动作，再 GET 并经正式 Schema 校验。关闭 Runtime/registry 后以同一 fake Domain 新建 Runtime，重放校验后的原输入与全部 receipt 一致，完整 projection 不变，不调用 live Session。 |
| 归档 | materializeArchivePackage 与 transitionMeeting 经过真实 Repository 写入、冷重开后，两个 Decision 的 superseded/revoked history、六条 local facts、reason/evidence 和 transcript 与源状态一致。归档拒绝伪造来源、kind、ID 或外部证据；原 Captain fact 路径保留。 |
| Client | 对象行提供五动作，共用单表单和写锁；必填理由/证据，来源可用时预选，revoke 初始为空，supersede 必选候选；cancel、过期候选、409、缓存/恢复、完整 GET 替换、迟到响应、卸载、终态禁写均通过 DOM 测试，无自动重试。 |
| Browser 夹具 | 真实场景函数经 fake runtime 测试，在两个 pending candidates 和一个 open/blocking risk 后 pause；严格 ready 字段和调用顺序验证通过，ready 后无 accept/dispose/end。普通模式仍为单候选 Captain 流程。 |

## Executed Validation

下列命令均从仓库根执行；测试命令公共前缀为 `pnpm --dir plugin exec vitest run`。

| 步骤 | 命令/范围 | 实际结果 |
| --- | --- | --- |
| T0 | `pnpm --dir plugin verify`，未改产品基线 | exit 0，76 files / 664 tests。 |
| LC-01 | `--project host tests/unit/domain/transitions/decision-acceptance.spec.ts tests/unit/domain/transitions/decision-disposition.spec.ts tests/unit/domain/completion.spec.ts`；Host typecheck | exit 0，76 tests；类型检查通过。 |
| LC-02 | `--project host tests/unit/domain/transitions/archive.spec.ts` | exit 0，19 tests。 |
| LC-03 | `--project contract tests/contract/meeting-runtime.spec.ts`；Host typecheck | exit 0，53 tests；类型检查通过。 |
| LC-04 | `--project contract tests/contract/http-boundary.spec.ts tests/contract/protocol-schema.spec.ts`；`--project host tests/unit/index-inject.spec.ts` | exit 0，71 + 8 tests。 |
| LC-05 | `--project client tests/client/client-entry.client.spec.ts`；Client typecheck 和相关 eslint | exit 0，62 tests；类型/lint 通过。 |
| LC-06 | `--project contract tests/contract/meeting-runtime.spec.ts tests/contract/domain-meeting-repository.spec.ts`；`--project recovery tests/recovery/domain-recovery.spec.ts` | exit 0，99 + 9 tests；相关 eslint 通过。 |
| LC-06B | `--project host tests/unit/scripts/smoke-profile.spec.ts`；相关 eslint | exit 0，38 tests；lint 通过。 |
| T7 | 固定 24 个代码/测试/脚本文件 Prettier check；`pnpm --dir plugin verify` | exit 0，76 files / 791 tests，测试开始 16:19:00、耗时 70.71s；format、lint、双端 typecheck、build、environment、contract、Agent Definition、package 全通过。 |

T8 在 README 更新后再次执行 `pnpm --dir plugin verify`，exit 0；76 files / 791 tests，测试开始 16:22:03、耗时 72.34s，全部工程检查再次通过。删除前 V8 相对链接检查为 129 links、missing=0；移除已完成 TODO 后为 128 links、missing=0。删除 RUNBOOK 后为 102 links、missing=0，引用检索 exit 1（无残留），`git diff --check` 通过。

工程检查确认 17 个 DSH package 已安装、9 个 Agent Definition 样本通过、package 全部 assertions 为 true。构建保留基线已存在的 deps.onlyBundle 提示（cosmokit/schemastery）与 `INEFFECTIVE_DYNAMIC_IMPORT`（jsonl 同时静态/动态导入），没有新增依赖或放宽检查。

执行中修正了夹具与机械步骤：storage 初态去除 undefined 并补 meetingTasks，经 create/ownership/completeCreate 初始化；Client 测试沿用工程 createElement 入口；非法版本测试使用错误类型；归档测试使用匹配 partial 的 termination code；HTTP 冷重放复用入口 Schema 校验后的原输入序列化顺序。修正后重新运行失败范围，未跳过断言、未改存储机制或测试配置。fake 资源在 finally dispose/close，mock 在 afterEach 恢复；LC-01–LC-07 阶段没有启动真实 Host、修改个人 profile 或创建 smoke 临时根。

### LC-08 真实 DSH/Browser 验收

2026-09-07 16:29–16:32，在干净被测提交 `b63697dc90b3831693f4f18e37d3184028fe14d0`、实现分支 `codex/local-decision-risk-control` 执行。用户要求“先执行，再提交”，取代原先不必要的“合并后”前置条件；本轮没有合并、push 或创建 PR。

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

## Not Covered

- 本轮真实 smoke 未调用 LLM、未重启 Host，不证明 Host 冷恢复；冷恢复自动化证据仍以 LC-06 为准。历史 smoke 不计入本次结果。
- 未调用真实模型，未覆盖远程、多用户、跨 Host、长期压力、吞吐或发布验证；未扩展其他 UI 控制或完整 FR-7 生命周期。

## Closure

LC-01–LC-06B 按顺序各自完成、删除 TODO 并单独提交：`383e7a0`、`f571010`、`939629f`、`4340f88`、`8aed153`、`406681b`、`adb28ec`。LC-07 负责最终文档与删除临时 RUNBOOK，长期结论保存在本证据、coverage、正式设计和操作规程中。LC-07 已由 `b63697d` 完成。用户随后明确要求先执行冒烟再提交，LC-08 按下述真实证据完成后在本次 commit 删除；本 TODO List 已全部执行收口，不据此宣称整个 FR-7 或项目完成。
