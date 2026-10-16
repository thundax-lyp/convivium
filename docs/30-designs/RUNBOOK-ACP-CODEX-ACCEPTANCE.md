# RUNBOOK: ACP Codex — 环境、真实验收与全组收口

## Status, Dependency And Boundary

2026-10-16；Author/Audit；**H1–H4 PASS；E2 按修订范围继续；E3 待执行**。ACP Agent 只使用自身原生工具和 Skills，沿用真实模型用量授权，不重放已消费输入。会议读取、审核提交及 worker 生命周期由宿主适配；具体契约见 [ACP Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md#reviewer-and-worker)。不 push/PR/merge、不改固定人工环境。

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

### E2：实现专项脚本并完成真实两轮冷恢复

前置状态：E1、H1–H4 PASS；真实测试用量沿用既有授权；不重放已消费输入。
允许修改（10 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/scripts/smoke-profile/index.mjs`
- `plugin/scripts/smoke-profile/environment.mjs`
- `plugin/scripts/smoke-profile/result.mjs`
- `plugin/scripts/smoke-profile/probe/index.mjs`
- `plugin/scripts/smoke-profile/probe/support.mjs`
- `plugin/scripts/smoke-profile/probe/scenarios/acp-codex-reviewer-web.mjs`
- `plugin/scripts/smoke-profile/probe/scenarios/meeting-business-loop.mjs`
- `plugin/tests/contract/meeting-roles-deployment.spec.ts`
- `docs/30-designs/RUNBOOK-ACP-CODEX-ACCEPTANCE.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 修正创建契约漂移：`support.mjs::peerCreateCommand` 仅构造 CaptainCreateMeeting，`index.mjs::writeSmokePatch` 将同一 targetDefinitions 数组写入 patch.agentDefinitions 和临时根 smoke-definitions.json，返回该 JSON 的绝对路径；runScenario 通过 CONVIVIUM_SMOKE_DEFINITIONS_PATH 传给 probe，hot/cold 共用同一路径。`support.mjs::peerCreateCommand` 必须从该路径读取，使用临时 Definition 的 displayName 形成 participantRoleNames，不回退发行资源，不提交 identities/managerIdentityKey/evidenceReviewerIdentityKey；Manager/Reviewer 由 Runtime 选取。`index.mjs::writeSmokePatch` 对 peer/identity/ACP 场景将临时 Definition.displayName 固定为 roleDefinitionId，business-loop 场景将四角色分别固定为 manager/reviewer/contributor-a/contributor-b；仅影响临时 profile。`meeting-business-loop.mjs::runMeetingBusinessLoopScenario` 改用 participantRoleNames=["contributor-a","contributor-b"] 和 ownerRoleName="manager"，保留原轮次、事实、权限与审核断言。创建拒绝断言必须保存完整 rejected result（不含凭据）。启动真实会议前，用生产 Captain Schema 与 resolveCaptainCommand 对四 lane 的临时快照逐项验证 names、系统角色和最终 identity definitionId 一致；临时验证不写永久脚本测试。ACP probe 检查三个 participant role names，不再读取内部 identities。沿正式 Meeting Interface Captain Control Surface，不放宽生产 Schema。按正式合同修改原三个lane的临时Definition配置，退役脚本中的overrides；CORE_SCENARIOS继续原显式角色，SMOKE_SCENARIOS加入acp-codex-reviewer-web。
2. `plugin/scripts/smoke-profile/index.mjs::runScenario`复用现有hot/cold启动方式，新增runAcpCodexReviewerWebScenario(runtime)和validateAcpCodexReviewerWebResult(value)；preflight从E1脚本import。临时profile仅Reviewer选Codex，真实 Host accepted 事件、DSH caller、Web tools/result 与 checkpoint 采证。
3. 一场会议两轮，Manager/Reviewer/GitHub/arXiv/Web五独立root；每轮每contributor一份Evidence，目标六个合法Review，worker机制spawn且模型继承Codex。新建验收任务 requestId 为 acp-codex-web-create- 加 randomUUID，原现场不复用。失败重试另按原预算；20分钟软时限失败STOP，不能宣传费用/token上限。
4. 议题固定“DSH通过ACP连接外部Agent的公开机制、权限和恢复边界”。Web每轮至少一次真实search和两个不同域名正文读取，限定agentclientprotocol.com及deepseek-harness.github.io。保存URL/标题/发布时间（缺失unknown）/访问时间/正文sha256，实际工具事件和正式证据相互印证，不硬编码措辞。仅真实非公网 DNS 拒绝按上节记录 blockedSources 环境未覆盖，不作为 Convivium 阻塞；其余错误 STOP。起始页面固定为 [ACP Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup) 与 [DSH Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/)，只作为实际搜索后读取的定位起点，不预填正文或claim；DSH域名根路径返回404，禁止把域名直接拼成根URL作为读取成功条件。
5. probe 在创建前订阅 `convivium/acp-review-accepted`，只计入 rootSessionId 等于 Reviewer 且 versionId/reviewId 与当前 Repository Review 相符、workerSessionId 有原 committed 的宿主接纳事件；六次必须来自六个独立 worker，冷阶段必须新增三个，历史 worker/committed requestId 不重复。ACP root/worker 不得出现 Convivium/skill/structured_output 的 tools/result；禁止用纯模型自报或 Web 角色的工具调用冒充审核。probe 从安装包根具名 import `readMeetingOutboxForAcceptance`，通过 ctx.storageDomain.get 借用当前 Runtime 已打开 domain。订阅 `convivium/acp-checkpoint` 必须在创建会议/冷恢复前完成；热阶段保存 checkpoint/Host accepted 事件、绑定 hash、Web 工具调用 ID 和第一轮正式 Review到原 checkpoint，冷阶段读取原 checkpoint 后合并本进程新事件。deliveryId 沿 owner 原 deliveryId，不派生新 ID；以原事件 deliveryId 精确查同 meeting 的 outbox.deliveryId，要求每项恰一条且 status=delivered；仅采用当前 Reviewer root 的 delivery-completed，worker 核对 committed、真实 parent/model 与 Host accepted 事件。不读取 owner/provider 私有字段。第一轮发布后等待每个已观察发送的原deliveryId都有delivery-completed、对应请求有committed事件，且相关outbox已delivered；使用事件和Repository交叉检查，不访问owner私有字段，暂停并停稳隔离Host；同目录重启load原ACP ID，hydrate 不重复 ACP prompt/worker 或会议提交；第二轮真正再经Reviewer和新spawn worker审核，最终正常结束/归档。未知故障恢复由P5/D3/D4确定性测试承担，不强迫付费真实请求中重复kill。
6. result必须为严格JSON：`{ok:true,scenario:"acp-codex-reviewer-web",meetingId:string,observed:{sessionIds:Record<string,string>,reviewer:{provider:"acp-codex",model:string,reasoningEffort?:string,workerProvider:"spawn",workerModel:string,hostValidatedReviews:number},web:{searchCalls:number,sources:Array<{roundId:string,url:string,title:string,publishedAt:string,accessedAt:string,contentSha256:string}>,blockedSources:Array<{roundId:string,url:string,errorCode:"WEB_BLOCKED_URL",reason:string}>},rounds:number,coldRecovery:boolean,authorizationRejected:boolean,archiveComplete:boolean}}`；sessionIds键精确五role，hostValidatedReviews=6、rounds=2，其余boolean=true；每轮 sources 与 blockedSources 合并域名集合都含两个指定域，workerModel=model。验证器拒绝未知/缺失字段，不接受模型自述代替事件。
7. E1 预检在创建隔离 Host 前执行；environment.mjs 从锁定 Codex 包解析当前 macOS 平台 binary，设置 CODEX_PATH 并核对其 hash 等于 preflight.binarySha256.codex，保留 HOME/CODEX_HOME，不复制凭据。新场景临时 Definition 只为 Reviewer 写完整 agentOptions，Web 不设覆盖；旧三 lane 的 Reviewer 沿原 deepseek-official/deepseek-v4-flash 选择写入 Definition.agentOptions。新场景 contributor 闭集为 GitHub/arXiv/Web，maxParticipants=4。
8. evidence 目录必须不存在，index.mjs 在检查后仅为显式新场景 mkdir 创建该固定目录，再调用现有 createRecordRoot；不得覆盖已有证据。
9. Prepare/Execute/Assert/Restore：隔离mkdtemp profile，不复制Codex凭据；停止/等待本次进程，脱敏证据先保存到CONVIVIUM_SMOKE_RECORD_DIR；只清理自己创建的临时根，失败也保存并收敛。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir plugin build
test ! -e /tmp/convivium-acp-codex-evidence-scoped-acceptance
CONVIVIUM_SMOKE_RECORD_DIR=/tmp/convivium-acp-codex-evidence-scoped-acceptance CONVIVIUM_SMOKE_SCENARIO=acp-codex-reviewer-web pnpm --dir plugin smoke:profile --json
```

PASS：strict JSON、五Session/两轮/六Review、真实搜索/两域正文或明确环境未覆盖记录、同绑定cold后真正新执行、跨身份拒绝及归档/Restore全部成立；本步实际变更路径 2–10 个且均在清单内。
STOP：模型/除已授权非公网 DNS 拒绝外的网络错误/未知block/软时限/任一断言失败；证据目录已存在也先STOP，不覆盖或另开会议掩盖；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### E3：完整验证、迁移证据并删除全部 RUNBOOK

前置状态：E2 PASS。
允许修改（9 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `docs/50-operations/HOW-TO-MEETING-ROLES.md`
- `docs/50-operations/HOW-TO-DSH-SMOKE.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-CONTRACTS.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-CONFIGURATION.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-PROVIDER.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-ACCEPTANCE.md`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. readiness分开记录静态/确定性/真实验收、版本/binary/model、恢复注入与Not Covered；操作文档记录安装/Definition迁移/预检/失败处置。草稿已在A3删除，此处不得重建“已迁移”草稿。
2. 运行下列完整verify与原三lane；E2新lane证据仅在源码、配置、构建物、binary/model未变时复用，避免重复用量。任一失败保留全部RUNBOOK，不先删除。
3. rg核对本组RUNBOOK与草稿文件名引用。存活正式文档只能指向长期正式来源；本组之外出现残留引用且不在本步清单时STOP，由作者调整，禁止直接扩大文件数。
4. 所有scope/门禁/迁移证据齐全后一次删除本组六份RUNBOOK，计入本步9个文件预算。删除前保留仓库外可恢复字节；删除后再运行链接/diff检查，失败恢复六册和相应引用并STOP。不留completed/archive副本；PASS 后单独 commit，不 push/PR/merge。

验证：

```bash
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=identity-admission pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=peer-meeting-agents pnpm --dir plugin smoke:profile --json
rg -n 'RUNBOOK-ACP-CODEX-|ACP-CONTRIBUTOR-CONFIGURATION-DESIGN-DRAFT' docs TODO.md
node .github/scripts/check-doc-links.mjs
git diff --check
```

以上命令在删除前运行。实际删除后，固定执行下列检查；rg 的“无匹配”退出码 1 在这里显式转换为成功，不能将它误报为失败或忽略其它错误：

```bash
if rg -n 'RUNBOOK-ACP-CODEX-|ACP-CONTRIBUTOR-CONFIGURATION-DESIGN-DRAFT' docs TODO.md; then
    exit 1
else
    test "$?" -eq 1
fi
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：完整verify+原三lane+E2专项证据齐全，正式文档承接长期内容，六册和草稿均不存在、删除后链接/diff退出0；本步实际变更路径 2–10 个且均在清单内。
STOP：缺证据/门禁失败/有外部残留引用；删除后检查失败恢复册后停止；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

## Validation And Final Restoration

E1只有目录/登录/版本探测，E2才有真实模型与互联网证据，E3负责全局交付门禁；三者不互代。E2实际测试已合并到脚本变更步骤，E3完整验证已合并到长期文档/删除步骤，不另设零文件步骤。

Prepare/Execute/Assert/Restore沿总入口：隔离profile，不复制凭据；成功失败均停止本次进程/租约，只清自己的临时根，先保存脱敏证据。旧Meeting/outbox/claim/技术记录不得删除以绕过unknown。所有失败保留最后PASS及原错误；未全部通过不能删除RUNBOOK或宣称交付完成。
