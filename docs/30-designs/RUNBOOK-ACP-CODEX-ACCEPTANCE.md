# RUNBOOK: ACP Codex — 环境、真实验收与全组收口

## Status, Dependency And Boundary

2026-10-16；Author/Audit；**H1–H5 PASS；原 checkpoint E2 装配待作者审计，之后 E3**。ACP Agent 只使用自身原生工具和 Skills，沿用真实模型用量授权，不重放已消费输入。会议读取、审核提交及 worker 生命周期由宿主适配；具体契约见 [ACP Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md#reviewer-and-worker)。不 push/PR/merge、不改固定人工环境。

前置：D5 PASS。Scope：官方环境预检、专项脚本与真实两轮、完整验证及删除全组。Non-goals 沿总入口，不新增业务决定。

当前断点：E1 官方预检及构建已通过；尚无新 lane 的真实两轮运行证据。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

每步 PASS 后先保存仓库外脱敏执行记录，删除本册该步完整任务段落并更新本册/总入口的下一入口，执行文档链接和 diff 检查，阅读完整待提交 diff 后单独 commit；失败保留任务段落且不提交失败步骤。E3 以删除六册代替删除单个段落。E1/E2 的 RUNBOOK 更新已列入允许文件。

## 2026-10-16 ACP 边界变更与作者修订

最后 PASS：`0d1518ba` 的 warm activation 聚焦门禁；最新真实专项确认会议创建成功，未得到合法 Review，不能记为 E2 PASS。原现场 `/tmp/convivium-acp-codex-evidence-warm-activation/convivium-smoke-record-x8FrbR/acp-codex-reviewer-web` 与 `/tmp/convivium-acp-acceptance-records/e2-warm-activation-stop.json` 保留，输入已消费，不再次投递。

触发条件：正式需求改为 ACP 原生执行/宿主适配；`evidence-review-dispatch.ts` 的 review_request 仍要求模型调用 `convivium_run_review_worker`，`register-tools.ts::registerReviewWorkerTool` 仍依赖 DSH spawn 的 structured 结果，`provider.ts::connectSession` 仍给 new/load 注入 Convivium MCP bridge。当前缺少宿主专用审核调用接口、ACP 输出载体和持久接纳/恢复顺序；不是继续修复 tools/list 可消除的缺口。

最小静态复现（仓库根）：

```bash
rg -n '只调用一次 convivium_run_review_worker' plugin/src/runtime/services/evidence-review-dispatch.ts
rg -n 'reviewWorkers.start|result.structured' plugin/src/tools/register-tools.ts
rg -n 'mcpServers: \[bridge.mcpServer\]' plugin/src/dsh/acp-codex/provider.ts
```

实际输出分别命中现有投递指令、spawn/structured 接纳和 new/load MCP 注入。恢复条件：先固定宿主调用/输出接纳与防重放契约，补齐唯一文件和 symbol 白名单及正反例验证，审计为 Executable 后才进入实现，再以全新隔离环境执行 E2。用户已完成产品边界决定，无须重复询问授权；未完成技术设计不交给机械执行者选择。本轮作者已在 D 册固定 H1–H3，审计 Executable；原 STOP 现场保留，H1–H3 全部 PASS 才执行以下 E2/E3。

## 2026-10-16 E2 Author Audit

本轮先核查现有入口：`LocalMeetingWebRuntime` 无 outbox 读取；Repository `recover()` 会回收过期 lease；diagnostic 日志不能代替持久状态。Host `storageDomain.get(name)` 是公开的已打开 domain 诊断入口，复用其读取面而不再次 open（同名 open 会 already-open）。新增最小包导出 `readMeetingOutboxForAcceptance`，正式契约见 ACP Interface 的 Acceptance Outbox Read。此治理与入口修复单独提交，允许文件固定为：本册、总入口、ACP Interface、DSH Plugin Design、`plugin/src/repository/storage-domain/acceptance-read.ts`、`plugin/src/repository/storage-domain/meeting/projection.ts`、`plugin/src/repository/storage-domain/index.ts`、`plugin/src/repository/index.ts`、`plugin/src/index.ts`、`plugin/tests/contract/storage-domain-repository-registry.spec.ts`，实际 10 个文件。

入口反例：把 leased 当 delivered；读取时调用 recover 导致 lease 改写；泄露 payload/leaseToken；未知 delivery 当成功；读错 meeting；损坏提交链仍返回成功。固定验证：registry/projection/checkpoint 三文件测试、Host typecheck、改动源码 ESLint/Prettier、build、安装包导出检查、文档链接和 diff 检查。当前入口实现不代表 E2 真实验收。实际验证：先观察 pending 状态返回空数组的行为 RED，修复后 registry/projection/checkpoint 三文件 31 项通过，Host typecheck、改动源码 ESLint/Prettier、build、包导出、文档链接及 diff 检查通过。审计结论 Executable；真实模型与冷恢复仍 Not Covered。

## Captain 创建阻断修订

2026-10-16 用户授权修复阻断并继续。上次 E2 在创建前被 `CaptainMeetingCommandSchema` 拒绝，无 Meeting 身份或待判定外部执行；保留原失败记录目录，不覆盖。本轮用户授权继续修复；两个既有失败目录均保留，当前固定命令使用新 evidence-definition-snapshot 目录。修订只涉及临时 smoke 创建请求与角色别名，不改变产品接口；E2 白名单增补 business-loop 场景文件，共 10 个允许文件。文档链接/diff 检查通过后审计 Executable；真实验收仍未通过。

## STORAGE_UNAVAILABLE 诊断与修复边界

2026-10-16 用户授权先捕获创建原始异常、定位并修复，再验证真实创建并继续 E2/E3。本前置修复阶段允许：`plugin/src/runtime/meeting-runtime.ts`、`plugin/tests/integration/dsh/meeting-creation.spec.ts`、`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/index.mjs`、本册和总入口；不修改公开错误 Schema，不放宽 Storage Domain/ownership/发送门禁。创建 coordinator 在异常映射前记录 error.name/message/code/cause，message 限长并脱敏 Bearer、token 参数和 sk- 凭据，不记录 command、上下文、环境或 prompt；原异常仍原样抛出，日志故障不改变结果。固定验证：meeting-creation integration、Host typecheck、改动文件 lint/format、build、文档链接与 diff。probe 通过公开 ctx.logger.exporter 仅将该已脱敏的创建错误日志导出到 stderr，沿 fiber 自动卸载，不输出其它日志。首轮诊断原始持久记录核对为 ready、五 active ownership、ACP requests=0/deliveries=0，异常发生在提交后 delivery scope 装配，不把 STORAGE_UNAVAILABLE 推定为未创建。原根保留且不重放。原始异常复现属于诊断，不作为 E2 成功；只允许复现原 STORAGE_UNAVAILABLE 以取证，任何未知外部结果立即 STOP。若异常发生在预检/持久创建之前，核对无模型输入和无持久发送记录后允许修复并使用新隔离环境验证；不能重放已消费输入。失败时停稳本次 Host 并保留原临时根，记录精确位置，不自动删除数据库/Session/技术门禁。本次使用新 `evidence-storage-diagnostic` 目录，历史三个目录保留。实际根因需要新增生产文件时，先在作者阶段固定允许文件与直接验证再实现。

## 未发送输入的 ACP 首次激活修复

原始诊断已定位为提交后的 provisioning→delivery 切换关闭 bridge 后 load 原会话失败。官方锁定 1.11.0/0.161.0 实测 newSession 后不发 prompt、关闭进程再 load 返回 -32603 Internal error。两个保留诊断根的 ACP requests/deliveries 均为 0，不重放或清锁。诊断代码的 12 项测试、Host typecheck、build、lint/format、文档检查通过，先单独提交。

随后修复阶段固定 8 文件：`plugin/src/dsh/meeting-agent-owner.ts`、`plugin/src/dsh/acp-codex/provider.ts`、`plugin/tests/unit/dsh/meeting-agent-owner.spec.ts`、`plugin/tests/integration/dsh/acp-reviewer.spec.ts`、ACP Interface、Peer Meeting Agents Design、本册、总入口。只对同 owner 已持有的 ACP provisioning Agent，在 durable ownership 已 active 且 capability active、原 header/options/资源/Skill 全部同值时，原地移除 provisioning 的独立 allow=[] restriction。setup 保存该 restriction 的 disposer 到 WeakMap<Agent,()=>void>；角色原 toolFilter 不移除。先 await provider.prepareSession(agent,delivery)，成功后才解除 gate 并标记 owner purpose=delivery。provider 对同一 Agent 的无 active request 的 warm provisioning lease，仅在既有绑定/模型/指纹/reconcile/block 校验后把 purpose 升级为 delivery，不关闭进程/MCP、不 load、不 new、不改任何 durable ID。非 ACP、cleanup、cold resume 保持原机制；冷恢复仍只能 load 原 ID，禁止 fallback、清锁或自动重放。失败保持 restriction，记录原错误并 STOP。

固定验证：owner unit、ACP Reviewer MCP integration、provider integration、ACP recovery、Host typecheck、改动文件 lint/format、build、文档链接和 diff。反例：未 active 提前放权、prepare 失败解除 gate、误移除角色 filter、首发前重启导致原空会话无法 load、冷恢复换新 ID。实际验证：先观察 owner 新建第二个 handle/失败时释放 scope 的行为 RED；修复后 owner/MCP/provider/recovery 四文件 33 项通过，Host typecheck、改动 lint/format、build、链接/diff 通过（lint 仅长度警告）。审计 Executable。全部通过后单独提交该修复，之后 E2 使用新 evidence-warm-activation 目录先确认真实创建 accepted，再进入两轮专项；原失败根全部保留。

## Formal Inputs And Evidence

读取 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md)、A2 的 ACP interface 与 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。官方binary/model选择沿正式ACP interface；本次专项结果JSON/来源断言见E2，不升为产品公开接口；不再从已删除草稿取值。权限/恢复确定性证据复用P/D册；真实专项不能用fixture替代。

## E2 原生宿主专项 STOP

2026-10-16；最后 PASS `0be78c9e`：H1 18 项、H2 34 项、H3 58 项聚焦测试通过，Host 类型检查、相应 lint/format 和 H3 build 通过；H1/H2/H3 已分别删除任务并提交。本次 E2 的四 lane 角色/Schema/同 Definition 快照核对、4 项部署契约测试、脚本 lint 与 build 通过。

执行下方固定真实命令后退出 1：Host `plugin/src/plugin-entry.ts::apply` 在即时 `ctx.get` 检查报 `Missing ACP Host service: agentPresets`，probe `conviviumMeetings/list` 返回 `gateway/service-unavailable`。未进入会议创建；只读 SQLite `units` 为空，无 Meeting/ACP domain，不存在本次可重放的会议输入。不能从此推定 Preset 配置确实缺失，仍须区分服务未注册与尚未就绪。

证据 `/tmp/convivium-acp-codex-evidence-native-host/convivium-smoke-record-krZIyx/acp-codex-reviewer-web`，执行记录 `/tmp/convivium-native-host-20261016/e2-native-host-stop.json`。原临时根 `/var/folders/38/sp0hsff57mq7fnwxtdcxk29h0000gq/T/convivium-dsh-smoke-aWq0rS` 保留；本次 Host PID 28976 已退出，端口 52295 已核对释放。未重启此现场、未重放任何旧输入。

触发 STOP：生产入口及直接测试 `plugin/tests/unit/host-plugin-lifecycle.spec.ts` 不在 E2 白名单；不继续改源码、不提交失败 E2、不执行 E3。继续需作者固定该装配前置修复及白名单，保留必需服务拒绝语义，修复并验证后用新的隔离任务/证据目录验收；不得放宽门禁或覆盖本次现场。真实用量、原生工具/Skills 边界和不重放授权约束持续有效。本轮作者已按用户授权固定 D 册 H4 及 3 文件白名单，审计 Executable；H4 PASS 后使用 evidence-host-assembly 新目录继续 E2。

## E2 装配修复后真实验收 STOP

2026-10-16；H4 已 PASS 并单独提交 `89da4c10`：保留全部必需 `ctx.inject` 服务依赖，移除先于装载的即时 `ctx.get` 判断；真实 Cordis 的延迟注册、撤销卸载及直接集成共 14 项通过，类型检查、lint/format、build 通过。H4 完整任务段落已删除。

新的隔离 E2 创建成功；只读生产 projection 解码确认五个身份、第一轮 published、3 份 Evidence、3 份正式 Review、1 次 publication。原生 worker 的宿主接纳断言已通过，不能据此宣称完整 E2 PASS。真实 Web 工具记录为 2 次成功搜索、6 次正文读取均返回 `WEB_BLOCKED_URL`；目标 `agentclientprotocol.com` 和 `deepseek-harness.github.io` 分别解析到非公网 `198.18.0.46`、`198.18.0.47`。失败属于真实读取门禁，不以 bash/curl 替代证据，不放宽 SSRF 或必需服务门禁。

记录 `/tmp/convivium-native-host-20261016/e2-assembly-stop.json`；脱敏证据 `/tmp/convivium-acp-codex-evidence-host-assembly/convivium-smoke-record-ePfz6R/acp-codex-reviewer-web`；原临时根 `/var/folders/38/sp0hsff57mq7fnwxtdcxk29h0000gq/T/convivium-dsh-smoke-wSbKhP` 保留。只读 ACP 状态为 4 个 ready binding、7 个 committed request、4 个 completed delivery。Host 已退出，所属端口 54258 已释放；持久业务状态仍 running，不冒充已归档。未创建冷恢复 checkpoint、未执行冷恢复/第二轮/归档及 E3，不重放任何已消费输入。E2 任务段落保留，失败步骤不提交；网络环境修复须先固定诊断和恢复方案后再推进。

## 2026-10-16 验收范围修订与审计

用户明确底层 DNS 不属于 Convivium 范畴且不构成阻塞，授权继续执行。仅退役“非公网 DNS 拒绝必须中止本专项”的验收判据；不修改任何生产网络行为、系统 DNS、第三方源码或 SSRF 门禁。真实成功正文仍记录原 sources；每轮每域仅在真实 web_fetch 返回 isError=true、errorCode=WEB_BLOCKED_URL 且原错误含 resolves to a non-public IP address 时，记录环境未覆盖项。其它缺失调用、HTTP 错误、模型错误、未知结果仍 STOP。E3 必须将正文未覆盖事实迁移至 coverage，不能宣称完整互联网正文验收通过。

原现场无冷恢复 checkpoint，不能伪造历史 Host 事件后续接；保留原根、原输入与失败记录。本次为修订范围的新隔离任务，新 create requestId 使用 randomUUID，不重投原 Meeting/Session/request/delivery，不更改原技术门禁；原场景失败不改写 PASS。新证据目录固定 /tmp/convivium-acp-codex-evidence-scoped-acceptance，必须不存在。

本轮 Author/Audit 允许修改仅本册与总入口；下述 E2 白名单保持 10 文件，实际执行修改仅七个既有脚本与两册（9 文件），不增加测试脚本的测试。collectWeb 输出新增 blockedSources:Array<{roundId:string,url:string,errorCode:"WEB_BLOCKED_URL",reason:string}>，全部 required，producer 为真实 tools/result，consumer 为严格 result 验证器，非持久产品接口；sources 格式保持原样，两数组每轮域集合并须覆盖两指定域且同轮同域只计一次。probe 必须保存原 isError/errorCode/content，禁止将错误伪装为 sources。正常正文仍须 2xx、长度/来源校验；搜索仍每轮真实成功。业务/权限/事务/原 ACP binding/冷恢复/唯一 worker/归档全部保持原断言。验证仍为部署契约、build、脚本 lint/format、真实两轮与 E3 完整集合。Not Applicable：无产品接口/数据库迁移/网络实现，无需新增生产行为测试。链接/diff检查通过后结论 Executable，再执行 E2。

## 修订范围后的 E2 实际 STOP

2026-10-16；Author/Audit 已单独提交 `1fc42cf2`，底层 DNS 仅记环境未覆盖项，不再阻塞 Convivium。4 项部署契约测试、七脚本 ESLint/Prettier、build 通过。实际新任务 meeting-f17dbbb2d6dcc4bff75204b9ab8c27ba 创建成功、五身份及三位参与响应持久化；第一位 Contributor 长时间研究后错过原 Evidence 截止，contribution-17-8ec787c6-676a-4c46-bc13-794f92b8a287 转为 submission_missing，原 exitReason 为“证据提交期限已到”。其 Session 末段可观察 VERSION_CONFLICT 后重新 read，随后一次工具调用被拒绝 `invalid arguments: missing required property "action.kind"`；这仅是工具失败证据，不将它未经验证地认定为唯一根因。

生产 loadProjection/decodeMeetingState 只读确认 version=8、round=open、Evidence=0、Review=0、publication=0，outbox delivered=9/leased=1/pending=2。既定每轮每位一份 Evidence 且不额外修订的范围已不能满足，因此提前 STOP，不延长期限、恢复 terminal Contribution 或重投输入。诊断只向自己的 smoke-result.json 写入 ok=false 失败结果，使原 runner 执行停止/保留现场路径；runner 退出 1，Host PID 33095/33096 均不存在，端口 60398 已释放。现场生命周期仍 running，未冒充暂停/归档。冷恢复、第二轮和 E3 未执行。

证据 `/tmp/convivium-native-host-20261016/e2-scoped-stop.json`，脱敏原 runner 记录 `/tmp/convivium-acp-codex-evidence-scoped-acceptance/convivium-smoke-record-eJwxg5/acp-codex-reviewer-web/summary.json`，原根 `/var/folders/38/sp0hsff57mq7fnwxtdcxk29h0000gq/T/convivium-dsh-smoke-jTQkEf` 保留。E2 任务段落及七脚本保留未提交；不重放已消费输入、不放宽截止/Schema/SSRF/取消门禁。下一作者入口为核查 Contributor 提交流程与工具参数错误的直接原因，先固定依据、白名单和验证，不自动扩张生产修复。

## 2026-10-16 等待预算与超时收敛修订

用户授权增加超时预算并将超时作为系统正常兼容路径；只修改临时验收配置，不调整产品截止/终态/取消/防重放实现。依据 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 的 Contribution Deadline 和 [Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) 的贡献失败后轮次收口：超时者记录 submission_missing，不造空证据，不自动满足目标，不恢复终态；其它有效贡献继续审核和发布。

本轮 Author/Audit 仅两册；E2 白名单仍原 10 文件。新 ACP 任务在 support.mjs::peerCreateCommand 固定 limits={maxFormalMessages:100,maxDurationMs:3600000,taskDeadlineMs:900000,reviewDeadlineMs:600000}，index.mjs::writeSmokePatch 仅 ACP speakerTimeoutMs=600000；旧三 lane 数值不变。runner 总软时限 4500000ms，场景每阶段 publication 等待 1800000ms，settled/archive 等待 600000ms。新证据目录固定 /tmp/convivium-acp-codex-evidence-timeout-compatible；原现场全部保留，新的 randomUUID task 不重放旧输入。

E2 不因单人 submission_missing 提前 STOP。每轮至少一份真实 Evidence 且所有已提交版本都有正式 Review，Review/accepted/独立 worker/committed 数量等于实际 Evidence 数，不再固定六个；冷阶段必须至少一个新 worker 且数量等于第二轮 Evidence，禁止旧 worker/request/tool call 重放。最终两轮发布、原绑定 cold load、权限拒绝与归档仍必须成功；没有真实 Evidence/Review、未审包、未知 ACP block、模型/RPC/Schema 错误导致不能收敛或总软时限到达仍 STOP。输出 reviewer.hostValidatedReviews 为实际正整数，observed.timedOutContributions:number 为 round.contributions 中 submission_missing 的真实计数（含 0），严格 JSON 验证；readiness 如实记录实际 Review 数和超时，不把缺失 Evidence 当成功。最终结果是原 Runtime publication/archive，不是纯模型自报。无生产契约变化，不新增测试脚本测试；复用部署契约、脚本 lint/format、build、真实验收和 E3 全集合。审计：路径/symbol/公开 limits 已核对；链接/diff 检查通过后 Executable。

预检恢复审计：timeout-compatible 首次启动在 preflight 返回 Internal error，尚未 mkdtemp 场景根/创建会议/发送 prompt，证据目录文件数=0，原日志和空目录保留。随后仅运行既有无 prompt 的 preflight，成功返回 gpt-6.1-sol/low 且 binary hash 与原证据同值，记录 /tmp/convivium-native-host-20261016/e2-timeout-preflight-diagnostic.json；不是重投会议输入。按用户兼容暂时性网络失败的授权，作者将本次正式命令唯一目录改为 /tmp/convivium-acp-codex-evidence-timeout-compatible-ready，仍要求不存在；不删除或覆盖旧目录。两册修订链接/diff通过，审计 Executable。

采证修正审计：timeout-compatible-ready 已真实完成第一轮三份 Evidence/Review 和发布，原工具拒绝确为非公网 DNS。DSH rc.2 公开 ToolExecutionFailure.error 为 ToolFailure={message:string,info?:ToolErrorInfo}，ToolErrorInfo={name:string,code:string,reason?:string}，code 位于 result.error.info.code，原 probe 误取 result.errorCode 导致已授权环境分类失败。E2 白名单内 probe/index.mjs::recordTool 仅将 errorCode 正确映射为 result.error?.info?.code，isError/content 保持原值，不放宽分类或 SSRF。原根 qPFMnD/日志保留，无 checkpoint，不恢复或重投旧输入；新 randomUUID 任务唯一证据目录为 /tmp/convivium-acp-codex-evidence-timeout-result。复用已通过部署契约/build，重跑脚本 lint/format、真实专项；两册链接/diff通过，Author/Audit Executable。此为采证设施修复，不新增测试的测试。

完整类型复核：前次只核对 Session 扁平化日志中的 error={name,code}，误当成 tools/result 的 ToolFailure，造成 timeout-result 第一轮三份 Review/发布后仍未识别环境拒绝。已同时核对 rc.2 ToolFailure 与 ToolErrorInfo 公开声明，以及 dsh-tools::toolErrorResult/materializeFinalResult，唯一映射是 result.error.info.code；不采用模糊文本 fallback。原 fFMhgE 根保留，无 checkpoint，不复用已消费输入。新的唯一目录固定 /tmp/convivium-acp-codex-evidence-timeout-observed；修正该 E2 白名单内的一行后继续原全部验证，先两册链接/diff 审计通过再执行。

只读服务装配审计：timeout-observed 已通过真实 Web 非公网拒绝分类、三份 Review 和发布；随后 settled 访问 ctx.storageDomain 报 cannot get property "storageDomain" without inject。缺口位于 E2 白名单内 probe/index.mjs::inject，固定新增必需 storageDomain，不使用 ctx.get 绕过注入、不改生产依赖。已逐项核对场景访问 agents/sessions/tools/storageDomain，前三已声明，只有 storageDomain 遗漏；所有 smoke profile 都装载 SQLite Storage Domain。原 osdKN0 根保留且不重放，新 randomUUID 任务唯一目录 /tmp/convivium-acp-codex-evidence-timeout-outbox。只改既有 probe 依赖声明，lint/format 和既有部署契约通过后执行原真实门禁；两册链接/diff检查通过，Author/Audit Executable。

原始工具事件采证审计：timeout-outbox 又在第一轮三份 Review/发布后未匹配 Web 环境拒绝。只读 Session 原始 tool/call、tool/result 逐项证明两域真实 fetch 拒绝，不能据采证失败判为业务超时。无模型输入的实际 rc.2 ToolRuntime + HttpFetchProvider 调用确认 tools/result.error.info.code 正确；原始 Session 的已提交 error 是 {name,code}，事件时间与瞬时回调完成时间不同。为消除瞬时采证歧义，E2 白名单内 collectWeb 固定读取 Web Agent.session.snapshotEvents()（公开 Session API）；先按 callId 建立 tool/call 的 name/arguments 映射，再仅对 tool/result 且 message.isError=true、data.error.code=WEB_BLOCKED_URL 的实际事件补入错误 records。记录 sessionId=原 Web Session.id、at=原 event.time、arguments=原 JSON、content=原 message.content、errorCode=原 data.error.code，仍按 round 时间、实际 search、两域和原始错误正文交叉检查。禁止生成历史 ACP checkpoint 或替换工具结果；成功正文仍走原 tools/result 规范值，未覆盖不写 sha256。Web Agent 从 ctx.agents.get 原 ID 读取，已卸载时仅从原 observedAgents 快照引用找同 ID，不创建 Session。该修正只读取既有日志，不重执行工具。

原 n0HSJH 根保留，不重放；新 randomUUID 任务唯一证据目录 /tmp/convivium-acp-codex-evidence-timeout-session。两册 Author/Audit 链接/diff检查后 Executable，修正 collectWeb 后执行脚本 lint/format 和原真实门禁；既有部署契约/build复用。未扩大 E2 10 文件预算，不新增测试脚本的测试。

冷启动凭据与原 checkpoint 续接审计：timeout-session 已通过第一轮三份 Review、DNS 环境未覆盖分类、权限拒绝、outbox delivered、暂停/checkpoint，并以原目录重启。冷 Manager 的 turn/end 明确 MISSING_CREDENTIAL；index.mjs::runScenario 的 createSmokeEnvironment(hostEnv, overrides) 按既有规范删除 DEEPSEEK_API_KEY，却未第三参重新注入。固定改为 createSmokeEnvironment(hostEnv, overrides, deepSeekApiKey)，不复制凭据文件或写入配置/日志。只读技术表为四个 ready binding、十个 committed request，无未知结果阻断；原会议 version=24、第一轮已 published、第二轮尚未开启。

E2 白名单保持十文件。index.mjs 唯一新增 runAcpColdCheckpoint(root:string,deepSeekApiKey:string,recordRoot:string):Promise<void>，仅用于已存在的临时 ACP checkpoint：验证原根在 tmpdir 内且名称以 convivium-dsh-smoke- 开头，读取原 checkpoint 和原配置，用原发布物/SQLite/Session/Definition，仅备份并替换自身已安装 probe 脚本，不重新安装产品包或调用 create；预检模型必须与原 Reviewer Definition 相同。重用 bootHost/waitForJson/stageScenarioRecord/stopHost/assertPortReleased，启动同 profile 的 cold-reopen，Host env 仅通过既有 API key 注入；成功严格验证、先脱敏采证再 Restore，失败停稳并保留根。main 仅在单一 ACP 场景且 CONVIVIUM_SMOKE_ACP_COLD_ROOT 已设置时调用该入口，不进入新会议路径。probe 冷 resume requestId 改为 acp-cold-resume- 加 randomUUID，表示新一轮受控生命周期动作，不重投已消费通知。checkpoint 可新增 priorCommittedRequestIds:string[]，来自原 SQLite requests.phase=committed 的真实 requestId；冷阶段额外拒绝这些 ID 的重放，不能生成历史 checkpoint 事件。

恢复动作唯一顺序：先以原 loopback 用户连接读取并提交新的 pause_meeting（独立 UUID，expectedMeetingVersion 来自即时 read）；accepted 后读回 paused，保存原 checkpoint 字节，再将 checkpoint.version 写为实际 paused.version，并加入上述已提交 ID 列表；原 events/reviewEvidence/calls/bindingSha256 保持原字节值。向自己的 smoke-result.json 写 ok=false 的 MISSING_CREDENTIAL 恢复停止原因，使原 runner 停稳并保留现场；确认原冷端口 53096 释放后才执行新入口。任何 executionBlock、非 committed 请求、第二轮已开启、暂停拒绝或原 checkpoint 证据不符均 STOP，不重放输入/修改 receipt/清门禁。恢复期间只追加新用户生命周期动作。

固定恢复命令（仓库根）：
```bash
CONVIVIUM_SMOKE_ACP_COLD_ROOT=/var/folders/38/sp0hsff57mq7fnwxtdcxk29h0000gq/T/convivium-dsh-smoke-9L1cR5 CONVIVIUM_SMOKE_RECORD_DIR=/tmp/convivium-acp-codex-evidence-cold-credential-resume CONVIVIUM_SMOKE_SCENARIO=acp-codex-reviewer-web pnpm --dir plugin smoke:profile --json
```
该证据目录必须不存在，原 /tmp/convivium-acp-codex-evidence-timeout-session 保留失败阶段。验证：七脚本 lint/format、部署契约、实际原 binding cold load/新第二轮/无旧 requestId 重放/正常归档，E3 全集合仍不变。数据结构仅临时 checkpoint/env，无产品行为/接口改变。两册链接/diff审计通过后 Executable；恢复 PASS 计入 E2，删除 E2 任务段落后单独提交。

续接装配补充审计：重装 probe 时 pnpm 要求已被原 Restore 清理的产品 tgz，失败发生在 Host 启动前，无新会议输入；原 root 仍 paused，四 ready/十 committed。runAcpColdCheckpoint 不再调用 installProbe，固定验证 installed probe package.name=PROBE_PACKAGE，将自身原 node_modules/@convivium/smoke-profile-probe 目录 rename 到 root/probe-installed-before-recovery，再 cp 当前 root/probe 到原 installed 路径；备份已存在则 STOP，不修改第三方包，不运行包管理器、不恢复或替换产品 tgz。已只读逐文件核对原解包产品与当前安装包全量发布文件同字节。index.mjs 仅新增 node:fs/promises::rename import，仍原白名单。前次空启动/失败证据保留；本次唯一记录目录改为 cold-credential-resume，原 checkpoint/version/priorCommittedRequestIds 不再修改。两册链接/diff通过后 Executable，原验证集合不变。

## 延长预算后的实际结果与续行 STOP

2026-10-16；临时 taskDeadlineMs=900000、reviewDeadlineMs=600000、maxDurationMs=3600000、总软时限4500000；单人超时不再提前终止验收。真实原会议 meeting-bcdce35f3f2bfa6ce39e380d10353a52 已完成第一轮三份 Evidence、三份独立 worker 的合法 Host Review、发布、权限拒绝、outbox delivered、暂停和原 checkpoint；Web 两域非公网拒绝已从原 Session 事件识别为环境未覆盖，非正文成功。当前轮没有贡献超时，不将其宣传为完整真实超时收敛验收。

修复冷 Host 漏注入 API key 并按原 checkpoint 续接后，用户恢复 accepted，Meeting version=26/running，第一轮 published，第二轮未开启。Manager 的最后模型步骤仍是旧冷启动的 MISSING_CREDENTIAL，本次恢复后未收到新模型任务。只读生产 loadProjection/decodeMeetingState 确认 Evidence=3/Review=3/publication=1，outbox delivered=35/failed=1；唯一 failed 是第一轮已过时 hand_request 的 NOTICE_VISIBILITY_INVALID，不将它误认作本次恢复通知失败。源代码 meeting-action-transition.ts 的 resume_meeting effectRequests 仅包含 resumedRoundEffects（只选 open Round）和 resumedEvidenceReviewEffects（只选 validation_cancelled），本现场无适用条目，也没有 Manager 续行通知。等待更长不会自行形成第二轮任务；不手工向 Agent 注入绕过 Runtime 的催促 prompt。

实际 STOP：原两轮冷恢复后的新执行门禁不能满足；修复涉及白名单外生产接线，需下一作者步骤固定正式依据、文件、symbol 和直接正反例测试后审计。保留 E2 完整任务段落和七脚本未提交，不执行 E3。最后提交的作者审计为 c9c92816；实际 E2 未 PASS，不作失败提交。恢复 helper 曾有四处 curly lint 错误，已修复后七脚本 ESLint/Prettier 通过；暂停准备动作先于该 lint 修复完成，但 Host 续接在检查通过后才启动，未放宽门禁。恢复过程中只提交了新的用户 pause/resume 生命周期动作，不重投旧 Session 输入或改写技术 receipt。

证据 `/tmp/convivium-native-host-20261016/e2-timeout-resume-stop.json`；原 root `/var/folders/38/sp0hsff57mq7fnwxtdcxk29h0000gq/T/convivium-dsh-smoke-9L1cR5`、原 checkpoint 备份、更新后 checkpoint、失败冷日志及所有先前失败根均保留。runner 已退出1，所属恢复端口57346释放；持久业务状态仍 running，不冒充已暂停或归档。只读技术表四 ready binding、十 committed request，无未知结果；不重放已消费输入。冷原绑定后的第二轮真实新执行及最终归档仍 Not Covered。

H5 前置修复已 PASS（43 项聚焦测试、Host 类型/lint/format/build/link/diff）；任务段落已删除，单独提交，不混入 E2。用户已授权补齐恢复后的 Manager 持久续行通知；唯一实现/测试白名单和精确判据见 D 册 H5，不能混入 E2 脚本。H5 PASS 后仅由 E2 恢复阶段在停止的原临时 profile 更新产品发布物，先逐文件固定/核对新旧职责范围，保持原 Definition/角色资源/模型/cwd/SQLite/Session 和技术门禁；再通过新的用户 pause/resume 生命周期动作续接原 checkpoint，禁止重做第一轮或重放输入。E2 恢复装配与唯一命令在 H5 PASS 后作者核对原现场再固定，不让机械执行者猜测；在此之前不启动现场。

### C1：按人工验收交接关闭临时任务

前置状态：2026-10-16 用户确认一轮核心冒烟成功，剩余真实验收改为人工冒烟与日志调试；H1–H5 PASS，H5 提交 c920a4ab。E2 完整验收未通过，不标 PASS；原 E3 的自动三场景真实复验取消，本次不新增付费调用。正式权限、SSRF、取消与防重放门禁不变。
允许修改：本组六份 RUNBOOK、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/50-operations/HOW-TO-MEETING-ROLES.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`；现有七个 smoke-profile 脚本作为独立验收采证入口提交，不声称完整场景 PASS。
禁止修改：产品代码、配置、原会议数据库、Session、固定人工环境、第三方与模型授权边界。

执行：
1. readiness 记录真实一轮三 Evidence/三 Review/一次发布、H1–H5 实现和 H5 的43项测试，以及第二轮、实际恢复通知、归档、Web 正文和本次未重跑原三场景的 Not Covered。
2. operations 记录 ACP 原生能力边界、人工验证顺序、脱敏日志和未知结果禁止重放；保留原 checkpoint，不直接修改持久化记录。
3. 完整审阅七个脚本 diff；运行 `pnpm --dir plugin verify`，脚本纳入 lint/format。仅完整本地 verify 通过后提交脚本，不能把本地验证称为真实验收通过。
4. 将长期结论迁移后，备份六册至仓库外并删除；运行下列检查，删除后失败恢复六册并 STOP。文档收口单独提交，不 push/PR/merge。

验证：
```bash
pnpm --dir plugin verify
node .github/scripts/check-doc-links.mjs
git diff --check
```
删除后另用 `rg -n 'RUNBOOK-ACP-CODEX-|ACP-CONTRIBUTOR-CONFIGURATION-DESIGN-DRAFT' docs TODO.md` 核查零残留（退出1表示无匹配）。
PASS：完整本地 verify、链接、diff 通过；事实和未覆盖项迁入长期文档，六册无残留引用；此次任务按缩小后的文档交接范围关闭，E2 完整验收保持未完成。
STOP：任一检查失败、外部残留引用、需要额外产品修复或未知输入结果。保留现场与未提交改动，不放宽门禁。

审计：Executable；本次范围变更来自用户明确确认及继续指令，取消自动真实复验，不豁免产品安全门禁。唯一收口步骤如上；验证选取完整本地 verify 加文档检查，不运行真实模型。

## Validation And Final Restoration

E1只有目录/登录/版本探测，E2才有真实模型与互联网证据，E3负责全局交付门禁；三者不互代。E2实际测试已合并到脚本变更步骤，E3完整验证已合并到长期文档/删除步骤，不另设零文件步骤。

Prepare/Execute/Assert/Restore沿总入口：隔离profile，不复制凭据；成功失败均停止本次进程/租约，只清自己的临时根，先保存脱敏证据。旧Meeting/outbox/claim/技术记录不得删除以绕过unknown。所有失败保留最后 PASS 及原错误；按 C1 人工交接范围关闭，不宣称完整真实验收或发布就绪。
