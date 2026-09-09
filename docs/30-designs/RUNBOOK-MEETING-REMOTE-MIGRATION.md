# RUNBOOK: Meeting Remote Migration

## Status And Work Boundary

- 建立日期：2026-09-09。
- 模式：Execute；M01—M06 已完成，执行者从 M07 继续。
- 审计状态：Executable；环境与迁移前 baseline 已完成，不重复确认。
- 分支：`codex/dsh-frontend-backend-communication`，代码调查基线 `e640f43`。工作目录固定为仓库根目录。
- 授权范围：九个接口一次切换 Remote，同时用插件自有 stream 通知 + 完整 refetch 替换 5 秒轮询。依赖正式 npm 包，保持一个独立 plugin 工程。

## Executor Contract

完整读取本文、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md) 和 [Document Rules](../00-governance/DOCUMENT-RULES.md)。依次执行 M07—M13、M13a、M14—M16，仅修改各步骤清单中的文件；新增文件明确标记“新”。每一步 PASS 才进入下一步。保留用户已有修改；不得用 checkout/reset/clean 清除用户工作。

任一步失败立即 STOP，报告最后 PASS 步骤、文件/symbol、命令、退出码与去敏输出；不得放宽 Schema、类型、断言，跳过测试，添加 HTTP fallback，改 DSH，换库或临时发明方案。执行期间命令出现环境错误也应报告 STOP；不得把环境调查、分支创建、版本选择或 baseline 重跑加入实施步骤。本文不授权 commit、push、创建 PR 或合并。

每步清单另允许按 [TODO Rules](../00-governance/TODO-RULES.md#closure-rules) 同步根 `TODO.md` 的对应任务：已完成项删除，部分完成仅收窄剩余范围；不得提前关闭后续项。提交仍需用户明确授权，不因任务同步获得提交许可。

普通步骤失败保留当前 diff 以便诊断；临时 Context/profile/订阅必须 finally 清理，不回滚已成功的业务事实。测试只使用测试数据和 smoke 自建临时 profile；没有生产数据迁移或删除动作。

## Goal And Current Breakpoints

完整目标链路：Slots panel → generated Remote Client → DSH Connection/Gateway → 同一 Meeting Runtime → 原 Repository commit → 瞬时 refresh → Client 完整 list/selected detail → Schema 通过后更新页面。写入权限、版本、幂等和归档继续沿用原链路。

| 当前断点 | 现状与证据 | 目标 |
| --- | --- | --- |
| Web 入口 | `plugin/src/index.ts::meetingConsumerPlugin` 注册 `src/http/index.ts::registerLocalMeetingHttpRoutes` | 可选 loopback Service，旧 prefix 删除 |
| 九个业务方法 | `src/runtime/application-service/types.ts::LocalMeetingWebRuntime` | 原方法不变；仅追加 watch 方法 |
| 实时变化 | `src/repository/domain/domain-meeting-repository.ts` 已在 commit/ready 后调用 `onProjectionCommitted` | Runtime feed 消费该 hook，Repository 算法不改 |
| 前端刷新 | `src/client/meeting-panel.tsx::ConviviumMeetingPanel` 自己 fetch 与 5 秒 interval | 注入 API，stream/focus/write 驱动完整 refetch |
| 生成与开发 | package 无 Remote exports；Vitest 尚无 decorator transform | 临时 staging 生成，正式转换器执行源码测试 |
| 冒烟 | baseline/scribe-minutes 通过自有 HTTP URL 读写 | 真实 DSH RPC carrier，保留业务断言 |

本表 `src/` 均相对 `plugin/`；下文路径完整。现有文档的旧 HTTP 描述按 [Remote Transport Authority](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#local-web-transport-authority) 解释，不能因此保留双协议。

## Scope, Non-goals And Invariants

Scope：九个 unary、一个 refresh stream、生成/类型/打包/源码测试接线、Host 可选生命周期、Client 订阅刷新、旧路由和测试/两个 smoke caller 迁移、readiness 收口。

Non-goals：修改 DSH checkout、根 monorepo、单独后端、数据库/schema/存储 provider/领域 transition 重写、身份权限扩展、新增创建入口、UI 样式调整、乐观状态更新、增量合并、可靠事件日志、自制 reconnect/retry timer、自动写重试、远程多用户、全场景真实模型验证。

不可违反：

1. 一个 Runtime、同一受控领域写入口；Web 缺失时 tools 仍可用。
2. exact loopback 在 Host 执行；禁止客户端身份字段被 codec 吞掉后当作合法请求。
3. 原输入 Schema、领域错误、expectedMeetingVersion、requestId/receipt/hash、local actor、终态不可写均保留；通知不递增领域版本。
4. commit 失败无通知；成功通知不带事实且不改变命令返回。Map 去重 snapshot.version，订阅最多一个 pending notice。
5. 缓存不是真相；通知/重连后全量校验成功才禁写解除。旧 selection/generation 响应不能覆盖新状态。
6. 源码禁止父级相对导入，测试用 `@/`，跨模块只经公开 index；generated 文件不手改。

## Canonical Contracts And Mapping

- 需求：[FR-11 第 1—10 项](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#fr-11可观察性与用户控制)。
- 输入字段、required/conditional、RemoteJsonValue、八个 wire aliases、大小/取消、三类新 transport error、返回 envelope：[Remote Interface](../20-interfaces/MEETING-REMOTE-INTERFACE.md)。逐项实现该文 Unary Methods/Input Fields/Result And Error Contract，禁止重新设计 DTO。
- 业务结果完整字段和四阶段 status：[Meeting Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)，机器边界 `plugin/src/protocol/types.ts`、`commands.ts`、`results.ts`、`status.ts`、`schema.ts`，统一从 protocol/index 引用。Remote 原样传递 Runtime 返回，不复制字段或用 generated codec 代替 consumer 校验。
- 文件、精确签名、生成配置/exports/依赖、feed 算法、Client freshness、smoke envelope：[Remote Design](./MEETING-REMOTE-DESIGN.md) 各同名 section，是本文执行细节的唯一专项设计来源。
- 领域 commit/receipt/outbox 与恢复：[Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)、[Implementation](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)。本次无变更。

新字段唯一为 `MeetingRefreshNoticeV1 { readonly kind: "refresh" }`，required、无默认值/null；producer 是 Runtime 内存 feed，consumer 是 panel，无持久 owner。watch(signal) 先登记订阅后首帧，abort/return/dispose 结束；重开重新首帧，无历史回放。ID、timestamp、actor 不进入通知；业务 ID/时间/version 来源保持现有 Runtime，客户端 requestId 保持 crypto.randomUUID，expectedMeetingVersion 来自完整已验证 detail。

## Author-Verified Starting Point

2026-09-09，作者已在当前分支完成 `pnpm --dir plugin install --frozen-lockfile`、`pnpm --dir plugin verify`；Node v22.23.2、pnpm 10.7.0，77 个测试文件、1101 个用例通过。真实 baseline 和 scribe-minutes profile 已通过并恢复临时环境。完整记录见 [当前环境与 baseline 证据](../40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md#author-environment-and-baseline)。环境核验不是执行者的任务，本文没有 T0、安装现有依赖、查找凭据或选择运行环境步骤。M03 新增依赖及 M05/M08 修改构建/测试脚本属于迁移实现，不是重复环境确认。

本次修订只修改本文及 Remote Interface/Design 的直接相关契约，并追加 author 修订证据；不执行产品迁移。原版以下隐含判断已经由作者固定：

| 原隐含判断 | 固定决定 |
| --- | --- |
| 从十几个文件一次实现整个 Host | M01 feed → M02 Runtime → M03 Service → M04 生成 → M05 源码测试 → M06 Host 装配 |
| 前端 adapter、组件、轮询一并改 | M07 adapter → M08 generated Client 检验 → M09 九调用替换 → M10 刷新串行化 → M11 stream |
| 哪些旧 HTTP 断言删除 | D4 逐项去留，不按执行者判断删除 |
| 请求失败应该抛哪层错误 | D2 明确 Gateway/Service/业务三层及取消优先级 |
| 读中/写中通知如何处理 | D3 固定状态、写前 fence、dirty 消费、连接代次和提交 UI 的条件 |
| 文档哪些段落应重写 | M16 仅固定状态标识与目录行替换，旧传输历史由现有 Authority 声明覆盖，不再扫荡设计文档 |

## D1: Method, Schema And Client Call Map

下表所有类型/Schema 均从 `@/protocol/index.js` 导入；Runtime 只从 `@/runtime/index.js` 引入。记号 B 精确展开为 `protocolVersion,meetingId,expectedMeetingVersion,requestId`，不是允许额外键的基类。下表 Keys 是 exact Object.keys，不补默认值。wire input alias、字段类型与条件 required 已在 Remote Interface 列全，原 DTO 不变。

| method | input alias / DTO | exact Keys | 输入验证 | Runtime | result Schema |
| --- | --- | --- | --- | --- | --- |
| list | 无 | 无 wire input，args={} | 无 | listLocalMeetings | LocalMeetingListResponseSchema |
| getStatus | RemoteStatusInput / MeetingStatusInputV1 | protocolVersion,meetingId | MeetingStatusInputSchema | getLocalMeetingStatus | MeetingStatusResultSchema |
| pause | RemotePauseInput / PauseMeetingInputV1 | B,reason | PauseMeetingInputSchema | pauseLocalMeeting | MeetingControlResultSchema |
| resume | RemoteResumeInput / ResumeMeetingInputV1 | B | ResumeMeetingInputSchema | resumeLocalMeeting | MeetingControlResultSchema |
| reassign | RemoteReassignInput / ReassignTurnInputV1 | B,currentAttemptId,action,reason；仅 action=reassign 追加 replacementParticipantId | validateReassignTurnInput | reassignLocalTurn | ReassignTurnResultSchema |
| end | RemoteEndInput / EndMeetingInputV1 | B,outcome,reason,acceptedDecisionIds,deferredAgendaItemIds,waivers | EndMeetingInputSchema | endLocalMeeting | EndMeetingResultSchema |
| acceptDecision | RemoteAcceptDecisionInput / CaptainDecisionAcceptanceInputV1 | B,decisionCandidateId,reason,evidenceMessageIds | CaptainDecisionAcceptanceInputSchema | acceptLocalDecision | CaptainDecisionAcceptanceResultSchema |
| disposeDecision | RemoteDisposeDecisionInput / CaptainDecisionDispositionInputV1 | B,decisionId,action,reason,evidenceMessageIds；仅 action=supersede 追加 replacementCandidateId | CaptainDecisionDispositionInputSchema | disposeLocalDecision | CaptainDecisionDispositionResultSchema |
| disposeRisk | RemoteDisposeRiskInput / CaptainRiskDispositionInputV1 | B,issueId,decision,reason,evidenceMessageIds | CaptainRiskDispositionInputSchema | disposeLocalRisk | CaptainRiskDispositionResultSchema |

Service 九个方法都明确声明，不使用字符串 dispatcher。Host 输入是相应 wire alias，signal 必需；返回 Promise 的 list 类型为 LocalMeetingListResponseV1，其余是 `ProtocolSuccessV1<对应 ResultV1> | ProtocolErrorV1`。watchUpdates 签名固定为 `(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1>`，`@Remote({mode:"stream"})`；返回 Runtime watch，signal 合并调用者与 Service 生命周期，不是 async Promise<AsyncIterable>。

MeetingClient 九方法输入改用 D1 的原 DTO，signal 可选；list 返回 list envelope，其余只 resolve 成功 envelope，业务失败抛 ProtocolFailure。第十个方法 `openUpdates(onUnavailable: () => void): RemoteStream<MeetingRefreshNoticeV1>`。adapter 不返回 Response，不接受 URL/suffix，不给 React 传 Context。

现有 panel 替换位置固定：loadList→api.list；loadDetail→api.getStatus({protocolVersion:1,meetingId})；controlMeeting 四个 action 各在自己的分支构造原 body 并调用同名 api 方法，不能把 body union 用断言塞给动态 api[action]；submitFactControl 的 accept-decision→acceptDecision、supersede/revoke→disposeDecision、accept/reject-risk→disposeRisk。原 requestId、reason/evidence、版本、draft 与错误展示逻辑保留。

## D2: Fixed Validation And Failure Sequence

在 `plugin/src/remote/index.ts` 增加私有 `assertExactInputKeys(input: unknown, expected: readonly string[]): void`：拒绝 null/array/非对象，排序 actual 与 expected，长度或任一键不同即 invalid-request；不 trim、不删除多余键。八个输入先计算 `Buffer.byteLength(JSON.stringify(input), "utf8")`，大于 16384 即 invalid-request；边界 16384 可通过。用 ASCII reason 填充到精确 bytes 测试，不用无效 JSON/padding 测上限。

每个 unary 固定按以下顺序执行，三个阶段分别 try/catch，不用一个 catch 猜异常来自哪里：

1. signal.throwIfAborted()。
2. 输入阶段：size → exact Keys → D1 validator。此阶段异常固定抛 convivium/invalid-request。
3. signal.throwIfAborted()，随后 await D1 Runtime 方法。
4. Runtime reject：signal 已 aborted 时先重新 throwIfAborted；否则 LocalMeetingRecoveryUnavailableError → convivium/recovery-unavailable；其它异常 → convivium/internal。不把错误的 message/cause 写入 RemoteError。
5. 输出阶段：list 使用 LocalMeetingListResponseSchema；其余 value.ok=false 使用 validateProtocolError，true 使用 validateProtocolSuccessEnvelope(D1 result Schema,value)。异常一律 internal；返回验证后的 envelope。只复用现有 Schema 边界的类型转换，不新增 any/double assertion 绕过输入、返回或 fixture 类型错误。

| 输入/结果 | Host Gateway 调用的确定结果 | Client 的确定结果 |
| --- | --- | --- |
| null/array/非对象 input、DTO 必填键缺失、protocolVersion=2、expectedMeetingVersion 为 string、枚举非法 | gateway/input-invalid，Runtime 0 次 | 本地 generated codec 也可直接 reject；UI 缓存禁写 |
| 额外 actor/authority/userId/captainSessionId、skip 携带 replacementParticipantId、revoke 携带 replacementCandidateId | convivium/invalid-request，Runtime 0 次 | 固定 INVALID_ARGUMENT ProtocolFailure，无伪造 metadata |
| reassign 缺 replacementParticipantId、supersede 缺 replacementCandidateId（DTO 中 optional、业务条件 required），或输入超过 16384 | convivium/invalid-request，Runtime 0 次 | 同上 |
| Runtime 返回 VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/MEETING_NOT_FOUND/其它合法 code | resolve 原 ProtocolError；RPC 外层仍 ok=true | 抛携带完整原 ProtocolError 的 ProtocolFailure |
| 恢复失败 | code=convivium/recovery-unavailable，message=Meeting data is unavailable.，details={retryable:true} | 抛 Remote failure，保留缓存，不自动重试写 |
| 未知 Runtime 异常或非法输出 | code=convivium/internal，同一固定 message，details={retryable:false} | 同上 |
| 调用前取消 | gateway/cancelled | 不当作领域错误；卸载取消不写 UI |

invalid-request 的 message 固定 `Invalid meeting request.`，details={retryable:false}。Gateway codec 校验先于 Service，因此不得把 D2 第一行测试强行期望成业务 INVALID_ARGUMENT。Runtime 错误分支的 Domain authority/version/receipt 断言仍由既有 meeting-runtime/recovery 测试负责。

## D3: Refresh Scheduling And Observable Oracles

只在 panel 增加以下引用状态，不建通用调度框架：`refreshReadingRef:boolean=false`、`refreshDirtyRef:boolean=false`、`refreshEpochRef:number=0`、`streamEpochRef:number=0`、`streamReadyRef:boolean=false`、`streamRef:RemoteStream<MeetingRefreshNoticeV1>|undefined`、`streamReplacementRef:Promise<void>=Promise.resolve()`。保留 mounted、selectedIdRef、writePendingRef 和原三个 controller/generation refs。streamReadyRef 是能否写入的即时 guard；可见缓存提示继续用 listCached/detailCached。

固定内部函数：`markUnavailable(): void`、`requestRefresh(): void`、`drainRefresh(): Promise<void>`、`replaceUpdates(): Promise<void>`、`consumeUpdates(stream, epoch): Promise<void>`。它们不成为公开模块 API。调度伪代码如下；这里只允许实现等同的控制流，不允许重新选择队列、timer 或状态所有权：

```text
pseudocode
requestRefresh:
  dirty = true
  if mounted && !reading && !writePending: void drainRefresh()

drainRefresh:
  if reading || writePending || !mounted: return
  reading = true
  try:
    while dirty && mounted && !writePending:
      dirty = false
      capture refreshEpoch, streamEpoch, selectedId
      await Promise.all(loadList(), selectedId ? loadDetail(selectedId) : true)
      only same epochs + selection + mounted + streamReady + both success:
        clear listCached/detailCached
  finally:
    reading = false
    if dirty && mounted && !writePending: void drainRefresh()

write start (both existing write handlers):
  require existing guards AND !listCached AND !detailCached AND streamReady
  writePending = true
  ++refreshEpoch; abort list/detail; ++listGeneration; ++detailGeneration
  invalidate any in-flight read result, but do not retry a write

write finally (only the current write generation may release its lock):
  writePending = false
  if success or ProtocolFailure: requestRefresh()
  else: set listCached/detailCached = true; if dirty: requestRefresh()
```

loadList 改为 Promise<boolean>，loadDetail 维持 Promise<boolean>；成功/失败回包先检查 mounted、各自 generation、refreshEpoch、streamEpoch；detail 另检查 selectedId。loadList/detail 的成功分支更新已验证数据和清除各自读取错误，但不自行清除 cached；是否解除禁写由 drainRefresh 一处决定。任一失败只设置对应 cached/error，返回 false。list 新值不含所选 ID 时沿用 clearSelection，增加 refreshEpoch 并 requestRefresh，新循环以无选择读取列表；旧 detail 不能落入 UI。

markUnavailable 固定置 streamReady=false、递增 refreshEpoch、abort list/detail、增加两个读 generation、设置 listCached=true，有选择时 detailCached=true；不清除已验证事实、draft 或 factError。业务写的远端失败只标缓存，不伪造连接失败：此时保留 streamReady，待下一次完整 refetch 成功恢复；**只有 carrier/stream/generation 失效调用 markUnavailable**。写 finally 按伪代码只设置缓存标志，不能把仍健康的订阅永久关闭。

replaceUpdates 的顺序固定：立即 ++streamEpoch、markUnavailable；在 streamReplacementRef 串行回调中先检查 mounted/epoch；过时请求直接返回。当前请求取 previous=streamRef 并立即清空 streamRef，await previous?.dispose()；再次检查 mounted/epoch 后才创建 api.openUpdates(markUnavailable)，保存 streamRef，void consumeUpdates。连续 focus 只让最新请求开新流。effect 挂载与 focus 均调用 replaceUpdates 并 requestRefresh；unmount 先 mounted=false、++streamEpoch/refreshEpoch、abort 三类请求，再 dispose stream，所有 catch 均检查 mounted/epoch 后才写 UI。DSH `$mount` 自身已托管 effect，不重复包装。

consumeUpdates：局部保存当前 physical generation，初值 undefined。对每个 item 先检查 mounted、当前 streamEpoch、item.signal 未 aborted，再检查 value 唯一键 kind 且等于 refresh。每个 physical generation 的首帧必须先调用 markUnavailable，使首帧前已经发出的读取失效（递增 refreshEpoch、abort 两类读、递增读 generation、标缓存）；随后移除旧 listener、记录 item.generation、绑定带 logical/physical generation fence 的 abort listener，最后才 accept、设置 streamReady=true、requestRefresh。相同 physical generation 的后续 notice 仅 accept 并 requestRefresh，不重复失效正在读取的结果。同一物理 generation 只注册一次 listener；旧 listener 只能影响它仍所属的物理 generation。首帧前的成功读取不能解除缓存或禁写；必须完成首帧之后启动的一整轮读取。消费结束或异常且 epoch 仍有效时 markUnavailable；finally 移除 generation listener。正常 dispose 不展示错误；不调用 terminal stream.restart，focus 建立新对象。

通知/读写竞态测试固定使用 deferred promise 和显式 resolve/reject，不用 sleep。至少用下列输入序列与计数 oracle：

| case | 操作序列 | 断言 |
| --- | --- | --- |
| R1 合并 | 开始读 A，发 3 次 notice，完成 A，再完成 B | list 2 次、所选 detail 2 次，无第 3 次 |
| R2 写中通知 | hold 写结果，发 3 notice，resolve 写，resolve 刷新 | hold 期间不新读；写完成只补一轮，write 调用恰 1 次 |
| R3 写前旧读 | hold 旧 detail，开始写后让旧 detail resolve | 旧响应不能覆盖写后读取的 version；使用新 requestId 只写 1 次 |
| R4 断线 | 已显示可写事实，abort 当前 item.signal | 缓存事实保留，所有控制立即 disabled |
| R5 重连 | R4 后新 generation 首帧，list 成功、detail 暂 hold | hold 时仍禁写；detail 成功才解除 |
| R6 换选择 | hold A 详情，选择 B，B 成功，再完成 A | 当前 ID/detail 都是 B |
| R7 focus 合并 | hold 旧 dispose，连续 focus 3 次，resolve dispose | dispose 1 次，新 open 1 次，只有最新 epoch 活跃 |
| R8 卸载 | hold next/read，unmount 后完成二者 | next done，无晚到 UI 更新，无未处理 rejection |
| R9 无周期读取 | 初始及选择读取完成，fake timers 推进 15000ms | list/detail 调用计数不变 |
| R10 首帧前旧读 | hold 订阅首帧及先发出的 vN 读取；交付首帧，再完成旧读取；hold 首帧后 list/detail，依次完成 | 旧结果不落入 UI、不解除禁写；首帧后仅 list 完成仍禁写，detail 完成才恢复 |

## D4: Old HTTP Test Disposition

旧文件唯一为 `plugin/tests/contract/http-boundary.spec.ts`。迁移时逐项应用本表，不允许概括为“保留业务测试”。

| 原用例标题/参数组 | 新测试与精确去留 |
| --- | --- |
| registers one prefix and serves all nine successful routes | 改为 dispatches all nine Remote methods；保留九 Runtime/result 断言；删除 prefix/status/header 断言 |
| accepts only the formal reassign replacement shape | 保留 replacement 成功与 skip+replacement 失败，失败改 D2 invalid-request |
| returns an empty 404 for unsupported… 的 4 组 | 全部删除，属已删除的 URL adapter；另测未知 namespace/method 在 Gateway 拒绝 |
| maps malformed request… 的 11 组 | 删 query 2 组、percent 1 组、无 media type 1 组、坏 JSON 1 组、path/body meetingId 1 组；保留 3 个额外身份字段；protocolVersion=2 改 Gateway 错误；最后超长无效 JSON 替换为合法 input 的 16384/16385 bytes 两例 |
| maps %s to HTTP %i 的 4 组 | 删除 HTTP code 参数，保留 code/retryable/message，并断言 Gateway resolve 原错误 envelope |
| maps recovery failure… | 3 分支分别断言 D2 recovery/internal/internal，消息不含 private 文本 |
| dispatches $suffix… 的 5 cases | 只把 suffix 映射 D1 method，保留 ExactlyOnceWith 和其它两个 Runtime method 未调用 |
| rejects invalid $suffix… | 保留 null/array/number/DTO 必填键缺失/非法 literal/非法 enum/type，期望 gateway/input-invalid；删除条件 required 但 DTO optional 的 replacementCandidateId 时改为 invalid-request；额外 actor 与 revoke+replacement 期望 invalid-request；删除 meetingId=wrong（已无路径对照，任意非空 ID 由 Runtime 判断存在性）；删坏 JSON/media type/query/percent/URL/method 检查；超长输入替换成合法 JSON input bytes |
| validates $suffix envelopes and error mappings 的 5 cases | 保留全部领域 code 和 Runtime 错误/非法输出分支，分别改 D2 envelope 和 RemoteError 断言 |

## D5: Dependency Removal And Retention

作者已检查当前 package.json、源码/测试/脚本 import、正式 DSH 声明和打包入口。以下是唯一清理清单，执行者不用重新判断“是否仍被用到”。

| 对象 | 决定 | 原因与动作位置 |
| --- | --- | --- |
| src/http/index.ts、registerLocalMeetingHttpRoutes、旧 URL/helper | 删除 | M12/M13 已由 Service/RPC 接替；不可保留 fallback |
| meeting-runtime.spec.ts 的 Readable、IncomingMessage、ServerResponse、WebRoute import 和 req/res 构造 | 删除 | 仅旧 invokeLocalControl 使用，M12 完整改用 Gateway；这些是 Node 内建导入，不是可 pnpm remove 的包 |
| panel 的 fetch URL helper、Response parser、旧结果 Schema import、5秒 timer | 删除 | M09 adapter 已拥有结果验证；M11 stream 已接管刷新；删掉迁移后未使用的 import，Schema 所有权移到 adapter |
| @deepseek-ai/dsh-host-webserver | 保留 peer/dev/optional 三处 | 根入口仍用 ctx.webServer.host 做 exact loopback 判定，M06 显式 type augmentation；不能把它当作旧路由专属依赖 |
| @deepseek-ai/dsh-client-ui-renderer、dsh-client-ui-conversation（完整前缀相同） | 保留 manifest inject、peer/dev/type import | conversation.view/slots 装配仍使用，不是旧 HTTP transport |
| dsh-client-ui-slots/locale/layout/primitives（完整前缀相同） | 保留现有 dev | 未被 Remote 替代，属于当前 UI 声明依赖组合；本次不执行与 transport 无关的通用 dependency prune |
| @deepseek-ai/schemastery、zod | 保留 | 原协议/领域验证仍使用；generated codec 也使用 zod，不因移走 HTTP handler 而废弃 |
| @types/node、TypeScript、tsc-alias、tsdown、Vitest/jsdom/Testing Library | 保留 | Host/build/源码测试仍需要；Node HTTP import 删除不等于整个 Node 类型环境可删 |
| ws=8.18.3 | 新增测试 dev 与临时 probe dependency | M13a 真实 WebSocket 冒烟直接使用；不进入产品 peer/inject，不能依赖 DSH 传递包 |
| @deepseek-ai/dsh-typert-loader | 不新增直接依赖 | 真实 Loader 由正式 DSH profile 提供，生成器只用 generator，源码测试只用 Registry/Gateway；原 RUNBOOK 的新增项无直接使用点，已撤销。若 lock 保留传递依赖，不手工删 snapshot |
| @deepseek-ai/dsh-typert-protocol、dsh-api-gateway | 新增固定 peer/dev + optional | Service/Remote 契约、Client adapter 与真实 Gateway 测试 |
| @deepseek-ai/dsh-typert-generator、dsh-typert-registry、dsh-client-connection | 新增固定 dev | 生成/转换、Host/Client fixture、Connection 公共类型。M08 TestConnection 使用官方 ConnectionHandle 类型，不复制 Connection 契约 |

当前 package 没有 axios/node-fetch/express 或其它仅服务自有 HTTP 路由的 npm 包，因此本次**现有 npm 直接依赖删除清单为空**。不伪造包删除；实际应清的是旧实现、导入、fixture、配置映射和未使用的新增依赖。M14 以锁文件与 importer 对照验证此结论，不能对整个 node_modules 执行手工 prune。

## Mechanical Steps

### M07：建立九方法 Client adapter

前置状态：M06 PASS。
允许修改：新 `plugin/src/client/meeting-client.ts`；`plugin/tsconfig.client.json`；新 `plugin/tests/client/meeting-client.client.spec.ts`。
禁止修改：panel 和 slots 装配、UI 行为、生成文件。

执行：
1. tsconfig.client include 追加 src/client/**/*.ts。在新 meeting-client.ts 顶部显式加入 import type {} from "@convivium/dsh-plugin/remote"，加载生成的 namespace augmentation；不能依靠尚未修改的 entry 或测试文件。创建 D1 MeetingClient、ProtocolFailure、createMeetingClient(remote:ClientRemote)；openUpdates 使用 Design 固定 $stream options。
2. 从原 panel 复制 readList/readStatus/readControl/readReassign/readEnd 和三事实结果校验；本步不删 panel 原函数。新 helper 入参为 unknown；先区分 RemoteResult 外层 false，再检查内层 ok。list 使用 LocalMeetingListResponseConsumerSchema，其他使用 D1 result Schema。
3. 每个 adapter 明确调用 remote.conviviumMeetings.<method>({...input},signal)；不使用类型断言适配 index signature。D2 的 invalid-request 造固定 ProtocolFailure，其余 Remote failure 原样 reject；ProtocolError 使用 validateProtocolError 后包装。
4. 用结构匹配的 generated namespace stub 验证每个方法参数和 signal 原样、外层失败、内层失败、非法成功结果。不得把缺方法 stub 强转成 ClientRemote；fixture 通过完整实现公开所需服务创建。

验证：
```bash
pnpm --dir plugin typecheck:client
pnpm --dir plugin test tests/client/meeting-client.client.spec.ts
```

PASS：九个 adapter 返回/错误行为与 D1/D2 相符；原 panel 仍编译；本步独立 typecheck:client 即能解析 remote.conviviumMeetings，不依赖 M08/M09。
STOP：需要把 Host 实现导入产品 Client 或跳过 schema；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M08：验证 generated Client 装配与开发类型

前置状态：M07 PASS。
允许修改：新 `plugin/tests/fixtures/remote-client.ts`；新 `plugin/tests/fixtures/remote-stream.ts`；`plugin/tests/client/meeting-client.client.spec.ts`；新 `plugin/tests/client/meeting-remote-types.ts`；新 `plugin/tsconfig.remote-test.json`；`plugin/package.json`。
禁止修改：产品 Client、真实 carrier 实现、测试规则放宽。

执行：
1. fixture 组合 M05 Host，另建 Client Context+正式 Registry，以 VM 的 window.__ModuleLoader__.load(row) 捕获正式 api-gateway/client 工厂，仅提供其正式 external Cordis。安装完整 TestConnection Service：isLoopback=true，generation 提供 getSnapshot/subscribe，start/registerGenerationSource 返回可清理句柄。
2. 该 fixture 仅测 unary：rpc.call 把 payload.args JSON roundtrip 后调用 M05 invoke，再 JSON roundtrip RemoteResult；rpc.open 明确抛 No streams in unary tests，不宣称覆盖 WS。mount self remote default contribution 后返回 client Context/unmount/dispose；finally 关闭两个 Context。
3. 把 M07 stub adapter 测试另加正式 generated unary/mount/unmount 组，检查 namespace 移除、服务卸载、非法输入本地拒绝、不可信结果不更新 consumer。
4. tsconfig.remote-test extends tsconfig.client，compilerOptions noEmit=true/rootDir="."，exclude=[]、include=["tests/client/meeting-remote-types.ts"]。类型文件从 self remote 导入 augmentation，以 Context.remote 的 namespace 检查九个合法方法与错误 input literal/@ts-expect-error。
5. remote-client.ts 将 VM 加载封装为同步 loadRemoteClientModule(): typeof import("@deepseek-ai/dsh-api-gateway/client") 并导出，供两个 fixture 使用；该函数只加载模块，不创建 Host/Client Context；新增 remote-stream.ts 的 createControlledMeetingStream，构造该模块真实 RemoteStream<MeetingRefreshNoticeV1>。constructor 的 connection 参数严格实现 Pick<ConnectionHandle,"generation">；options.open 返回单 consumer 的 deferred iterator，signal abort/return 结束 pending next。仅控制 generation source 与原始 notice，不模拟 RemoteStreamItem/accept/restart/dispose。返回 {stream, push, disconnect, reconnect}；disconnect 令当前 open iterator 抛正式 RemoteStreamCarrierError 并发布离线 generation，reconnect 发布新的在线 generation。
6. meeting-remote-types.ts 增加返回值赋值检查：createControlledMeetingStream 的 stream 必须可直接赋给 ReturnType<MeetingClient["openUpdates"]>；tsconfig.remote-test 的 types 加入 ["node"] 供导入的 VM fixture 使用，不放宽 strict。被导入的 fixture 也必须通过 tsc，不得以 any、as unknown as 或删去检查适配私有成员。
7. 新增 typecheck:remote-test = pnpm generate:typert && tsc -p tsconfig.remote-test.json；test 改为 pnpm typecheck:remote-test && vitest run。

验证：
```bash
pnpm --dir plugin typecheck:remote-test
pnpm --dir plugin test tests/client/meeting-client.client.spec.ts
```

PASS：generated Client 调用/mount/unmount 通过；错误类型使 @ts-expect-error 有效。
STOP：只靠 stub 通过而 generated 装配失败；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M09：将面板九调用切换到注入 API

前置状态：M08 PASS。
允许修改：`plugin/src/client/index.tsx`、`plugin/src/client/meeting-panel.tsx`；`plugin/tests/client/meeting-panel.client.spec.ts`。
禁止修改：轮询/focus 调度、表单和展示文件。

执行：
1. Client apply 改为 async Promise<void>，外层 inject=["remote"]；default import self remote contribution，await ctx.remote.$mount；子作用域 inject=["slots","remote","remote.conviviumMeetings"]，通过 slots injected props 给原组件 api=createMeetingClient(ctx.remote)。id/label/order 不变。
2. panel 参数改为 {api:MeetingClient}，按照 D1 最后一段替换九调用，删旧 meetingsPath/meetingPath/responseJson/read helpers，导入 M07 ProtocolFailure；删除原 panel 的结果 Schema 与 validateProtocolError/validateProtocolSuccessEnvelope 值导入，protocol 类型导入只保留 LocalMeetingListItemV1、MeetingStatusResultV1、ProtocolErrorV1。保留当前轮询和 focus，下一步才改刷新控制。
3. 原 client 测试逐个用注入 api stub 替换 fetch mock：原 Response 成功对应 resolve 原 parsed envelope，业务失败对应 reject ProtocolFailure，transport/坏输出对应 reject Error。保留所有表单选择、disabled、文本和请求体断言，URL/header 断言改成 D1 方法/参数。

验证：
```bash
pnpm --dir plugin typecheck
pnpm --dir plugin test tests/client/meeting-panel.client.spec.ts
pnpm --dir plugin build
```

PASS：所有原 UI 业务用例通过、bundle 仍是同一 module factory。
STOP：需要改表单、隐藏原控制或修改领域输入；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M10：串行化刷新与写后补读

前置状态：M09 PASS。
允许修改：`plugin/src/client/meeting-panel.tsx`；`plugin/tests/client/meeting-panel.client.spec.ts`。
禁止修改：stream 实例、定时轮询删除、展示样式。

执行：
1. 按 D3 增加 refreshReading/Dirty/Epoch；本步 streamReady 固定 true、streamEpoch 固定 0，使调度器可独立测试。实现 requestRefresh/drainRefresh，把首次、选择、focus、旧 interval、写后入口统一改成 requestRefresh。
2. loadList 改 Promise<boolean>；loadList/loadDetail 捕获 epochs、成功不独立清 cached；drain 统一成功解除。读完成或 finally 只有一个入口消费 dirty。两个写 handler 开始时 invalidate/abort 原读；原写后的 await refresh 移到 finally 释放写互斥之后，防止等待被自身锁住。
3. 加入 D3 R1/R2/R3/R6 的 deferred 顺序测试。保留原控制错误与 factError，完整读成功不清 factError。

验证：
```bash
pnpm --dir plugin typecheck:client
pnpm --dir plugin test tests/client/meeting-panel.client.spec.ts
```

PASS：R1/R2/R3/R6 与全部原 UI 断言通过，无写后死锁。
STOP：读写相互 await 卡住、dirty 丢失或旧响应覆盖新状态；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M11：以 Remote stream 替换五秒轮询

前置状态：M10 PASS。
允许修改：`plugin/src/client/meeting-panel.tsx`；`plugin/tests/client/meeting-panel.client.spec.ts`。
禁止修改：Remote 契约、timer/retry 机制、增量状态合并。

执行：
1. 按 D3 将 streamReady 初值改 false，补齐 streamEpoch/Ref/ReplacementRef，实现 markUnavailable/replaceUpdates/consumeUpdates。挂载/focus 调用 replaceUpdates 和 requestRefresh，删除整段 window.setInterval effect，不保留 fallback。
2. 严格按 D3 的首帧次序先使旧读失效，再 accept/ready/refetch；physical signal listener 用 generation fence。carrierFailed 与 current stream terminal 立即标缓存，完整 list/detail 成功才解除禁写。
3. 补 D3 R4/R5/R7/R8/R9/R10，以及 terminal 后 focus 重建；Test API 的 openUpdates 返回 M08 createControlledMeetingStream 的真实 stream。dispose 用原类实现并结束 pending next，不用结构 mock 或类型断言，不用真实网络定时。

验证：
```bash
pnpm --dir plugin typecheck:client
pnpm --dir plugin test tests/client/meeting-panel.client.spec.ts
rg -n "setInterval|clearInterval|meetingsPath|meetingPath" plugin/src/client/meeting-panel.tsx
```

PASS：前两命令退出 0，rg 无匹配退出 1；R1—R10 全通过，pnpm test 前置的 typecheck:remote-test 同时验证真实 fixture 类型。
STOP：需要新 timer、取消未闭合或断线仍可写；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M12：移除旧 HTTP 实现及迁移 Runtime 边界用例

前置状态：M11 PASS。
允许修改：删除 `plugin/src/http/index.ts`、删除 `plugin/tests/contract/http-boundary.spec.ts`；`plugin/tests/contract/remote-boundary.spec.ts`；`plugin/tests/contract/meeting-runtime.spec.ts`；`plugin/eslint.config.js`、`plugin/tests/unit/module-boundaries.spec.ts`、`plugin/tests/contract/production-import-graph.spec.ts`。
禁止修改：领域测试断言、Runtime 实现、其它测试删除。

执行：
1. 依 D4 核对 M05 remote-boundary 覆盖后删除旧两个文件；不再保留 URL兼容函数。
2. meeting-runtime 内 invokeLocalControl 改为 M05 fixture.invoke(method,{input})；原 list 无 input；原 route 构造改为 createRemoteGateway(runtime)。同时删除 Readable、IncomingMessage、ServerResponse、WebRoute 四个 import 和 req/res 构造；旧测试数组 URL 以 D1 method 替换；删除 status/header 断言，业务 json 断言直接针对返回 envelope；错误用例依据 D2。cold recovery 时先 dispose Gateway 再 runtime，重开后新建 Gateway，receipt/projection 对比保持。
3. ESLint 与 module-boundaries 用 remote 替换 http（保留 Node 内建 "http" 禁用条目）；client 仍不得 import 后端。production-import-graph 增加 client entry 图中无 remote/index.ts、Node API、typert-generator 的断言，不移除原 storage tests。

验证：
```bash
pnpm --dir plugin test tests/contract/remote-boundary.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/production-import-graph.spec.ts tests/unit/module-boundaries.spec.ts
pnpm --dir plugin lint
```

PASS：全部退出 0；原领域/幂等/恢复断言保留。
STOP：D4 未迁移完整或需要放宽 lint 才能跨模块导入；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M13：迁移真实 profile 的 unary probe

前置状态：M12 PASS。
允许修改：`plugin/scripts/smoke-profile/probe/support.js`、`plugin/scripts/smoke-profile/probe/index.js`、`plugin/scripts/smoke-profile/probe/scenarios/baseline.js`、`plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js`、`plugin/scripts/smoke-profile/result.mjs`；`plugin/tests/unit/scripts/smoke-profile.spec.ts`、`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`、`plugin/tests/unit/scripts/scribe-minutes-probe.spec.ts`；新 `plugin/tests/unit/scripts/remote-probe.spec.ts`。
禁止修改：profile 认证配置、凭据、其它业务场景。

执行：
1. 在 support.js 导出 async createRemoteProbe(connection,origin)，返回 async callRemote(method,input)。严格使用 Design Smoke Transport 的 authenticatedUrl→303→Set-Cookie 会话交换和 client-request/server-response envelope，不调用 Gateway.invoke 代替网络。
2. probe/index inject 追加 connection；在当前 ctx 可用的 apply 内创建 probe 并放到 scenario runtime.callRemote，删除原 callHttp 的解构和 runtime 属性；support 删除旧 callHttp。
3. baseline 中 list/getStatus/pause/resume 改方法名+原 body，scribe 改 getStatus；marker 逐字替换 baseline-http-pause-resume→baseline-remote-pause-resume、minutes-http-equal→minutes-remote-equal，同时替换 result 和三个现有脚本测试字面量。
4. 新 remote-probe 测试 mock fetch：交换不是303、没有cookie、响应rpcId不符、外层ok=false均reject；正常请求 exact args/list空args、带匹配Origin/Cookie，返回原value。assert 错误文本和stdout不含token/cookie；不得把认证关闭。

验证：
```bash
pnpm --dir plugin test tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/scribe-minutes-probe.spec.ts tests/unit/scripts/remote-probe.spec.ts
rg -n "registerLocalMeetingHttpRoutes|/api/convivium/meetings|baseline-http-pause-resume|minutes-http-equal|callHttp" plugin/src plugin/scripts plugin/tests
```

PASS：测试退出 0，rg 无匹配退出 1；原 transcript/minutes 业务断言不变。
STOP：存在旧caller或需要绕过DSH认证；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M13a：补齐真实 WebSocket 断开与重开门禁

前置状态：M13 PASS。
允许修改：`plugin/scripts/smoke-profile/index.mjs::writeProbePackage`、`plugin/scripts/smoke-profile/probe/support.js::createRemoteProbe`、`plugin/scripts/smoke-profile/probe/index.js`、`plugin/scripts/smoke-profile/probe/scenarios/baseline.js`、`plugin/scripts/smoke-profile/result.mjs`；`plugin/tests/unit/scripts/remote-probe.spec.ts`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`、`plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`；新 `plugin/scripts/smoke-profile/probe/remote-stream.js`；`plugin/package.json`、`plugin/pnpm-lock.yaml`。
禁止修改：生产 Client/Host、认证规则、DSH 源码、模型请求数量、scribe 场景业务流程。

执行：
1. plugin devDependencies 与 writeProbePackage 生成的临时 probe dependencies 均固定加入 ws=8.18.3；这是测试直接依赖，不加入生产 peer/inject。执行 pnpm --dir plugin install。脚本使用 JS，无新增 @types/ws。不得借用 DSH 的传递 node_modules 路径。
2. 新 remote-stream.js 导出 async openMeetingUpdates(origin,cookie)，使用 ws 连接同一 origin 的 ws URL /api/remote.mux，带 Cookie/Origin。open 后发送 {type:"open",streamId:"convivium-smoke-updates",endpoint:"conviviumMeetings/watchUpdates",payload:{args:{}}}。仅接受同 streamId 的 item 且 value exact {kind:"refresh"}；error/非预期 end/非法 JSON 均 reject。返回 {nextRefresh,disconnect,dispose}：nextRefresh 消费有界 dirty 通知或等待下一条；disconnect 先监听 close 再 terminate 并等待 close；dispose 幂等，若 socket 已打开先发送 cancel 再 close，等待 close，移除监听并结束 waiter。所有网络等待固定 10 秒 deadline，超时 reject/finally 清理，不能把超时当 PASS。
3. createRemoteProbe 保留 M13 unary 调用返回契约；给返回的 callRemote 函数附加 openUpdates()，闭包复用同一次认证 cookie 并调用 openMeetingUpdates；probe/index 传递 runtime.openUpdates=callRemote.openUpdates。token/cookie 只在闭包/握手中使用，不进入结果和日志。
4. baseline 仅在既有 pause/resume 段增加：pause 前打开订阅并消费首帧、完整 list/getStatus；然后 pause，等待 refresh，再完整 list/getStatus，断言 paused 且版本等于 pause 结果。关闭实际 socket 并 await close，随后沿用原 resume 操作；此时没有订阅。重新打开一个实际 socket、等待首帧，再完整 list/getStatus，断言 running 且版本等于 resume 结果，最后 dispose。所有路径 finally dispose 当前及旧 socket，不新增业务写。新增 marker baseline-remote-stream-reconnect；保留 baseline-remote-pause-resume 和原 ACB 断言。
5. result.mjs 将 baseline 新 marker 纳入必需断言；脚本测试增加缺 marker 必须失败，以及真实 helper 的帧校验、断线结束 waiter、重开首帧、finally close。单测使用 ws 本地测试 server 和临时端口，不模拟 message 事件来宣称网络覆盖；对应连接带 cookie/origin 断言，测试 finally 关闭 server/socket。真实 profile 才证明 DSH 认证、Service 与业务 commit 链。

验证：
```bash
pnpm --dir plugin install
pnpm --dir plugin test tests/unit/scripts/remote-probe.spec.ts tests/unit/scripts/smoke-profile.spec.ts tests/unit/scripts/smoke-profile-contract.spec.ts
CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile
```

PASS：全部退出 0；baseline-remote-pause-resume、baseline-remote-stream-reconnect 与 restore=PASS 都存在，两个不同实际 socket 的订阅/提交刷新/断线期间写入/重开补读/关闭通过。
STOP：任一 marker 缺失、以直接 Gateway 调用替代网络、socket/进程未清理或认证被绕过；按执行者契约报告并停止。

覆盖边界：此门禁验证真实 DSH WebSocket carrier 的断开、重新订阅与补读；M08/M11 验证正式 RemoteStream 和组件禁写/恢复。两项组合不等于真实浏览器内 DSH 自动重连端到端已经通过，该边界保留 Not Covered。

### M14：拔除废弃依赖与旧入口残留

前置状态：M13a PASS。
允许修改：`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/src/client/meeting-panel.tsx` 的废弃导入/适配代码；`plugin/package.json`、`plugin/pnpm-lock.yaml`；`plugin/eslint.config.js`、`plugin/tests/unit/module-boundaries.spec.ts` 的旧 http 模块映射。
禁止修改：D5 保留项、整个 dependency tree、DSH profile、业务 Schema、第三方包内容。

执行：
1. 照 D5 删除旧 req/res fixture、其四个 import 和 panel 已移入 adapter 的结果 Schema import。删除 http 模块映射但保留禁止 Node 内建 http 的规则字符串；不是全局替换所有 http 文本。
2. package 的新增项严格为 M03 五个 DSH 包与 M13a 测试专用 ws；dsh-typert-loader 不得出现在 dependencies/devDependencies/peerDependencies。若执行者曾按旧草案加入，删除这三个直接声明以及它的 peerDependenciesMeta；D5 其余现有依赖逐项保持。
3. 运行 pnpm install，让 lockfile importer/snapshots 自动与 manifest 一致，不手工删除仍被其它正式包依赖的 loader。下面的 Node 断言只检查直接声明；传递 loader 仍存在是允许结果。
4. 执行三组精确 rg：第一组只限产品调用方；第二组只限 Runtime 测试旧适配器；第三组查 http 源模块导入。三组都必须无匹配，不能删除合法 Host webServer 或 smoke 的 Node HTTP server。

验证：
```bash
pnpm --dir plugin install
node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";const p=JSON.parse(fs.readFileSync("plugin/package.json","utf8"));for(const k of ["dependencies","devDependencies","peerDependencies"])assert.equal(p[k]?.["@deepseek-ai/dsh-typert-loader"],undefined);for(const k of ["peerDependencies","devDependencies"])assert.equal(p[k]["@deepseek-ai/dsh-host-webserver"],"0.1.2-rc.1");assert.equal(p.devDependencies.ws,"8.18.3");assert.equal(p.peerDependencies.ws,undefined);console.log("PASS direct dependency disposition")'
rg -n 'registerLocalMeetingHttpRoutes|/api/convivium/meetings|callHttp|meetingsPath|meetingPath' plugin/src plugin/scripts plugin/tests
rg -n 'Readable|IncomingMessage|ServerResponse|WebRoute|node:http|node:stream' plugin/tests/contract/meeting-runtime.spec.ts
rg -n '@/http/|src/http/index' plugin/src plugin/tests plugin/scripts
pnpm --dir plugin lint
pnpm --dir plugin typecheck
pnpm --dir plugin build
pnpm --dir plugin verify:package
```

PASS：install/Node/lint/typecheck/build/package 全退出0，三组rg无匹配退出1；原npm直接依赖保持，新增只限五个 DSH 包与测试 ws，锁文件由pnpm生成。
STOP：D5保留依赖被删除、存在旧调用方/fixture、使用手工删lock snapshot或需要放宽校验；报告具体声明/import和命令输出，不自行扩大清理范围。

### M15：验证迁移结果

前置状态：M14 PASS。
允许修改：M01—M14（含 M13a）清单中已经修改的文件仅格式化；`docs/40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`。
禁止修改：环境调查、修改凭据、缩减门禁、语义修复。

执行：
1. 对 M01—M14（含 M13a）明列并实际改动的文件执行 Prettier 写入；运行下列门禁。这里是迁移后回归验证，不是要求重新确认环境。语义失败保留 diff 并 STOP。
2. evidence 追加 Implementation Results 表，每行固定 command/exitCode/testFiles/tests/marker/cleanup；未适用统计写 N/A，未运行写 Not Run，不能填写推测值。baseline 要求 ACB、remote pause/resume 与 baseline-remote-stream-reconnect，scribe 要求 minutes-remote-equal；两个 smoke restore=PASS。
3. Coverage 的 Meeting Remote Migration Boundary 改为九操作Remote与refresh stream已经迁移，并链接实际结果。真实 WS carrier 断开/重开与补读仅在 M13a 通过后记为 Covered；真实浏览器内自动重连仍 Not Covered，不能以分层测试推断端到端通过。

验证：
```bash
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：全部退出 0，真实新carrier marker及清理通过，证据可回溯。
STOP：任一失败/未运行，旧HTTP冒充Remote或残留profile进程；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

### M16：更新完成状态并删除临时RUNBOOK

前置状态：M15 PASS。
允许修改：本文；根 `TODO.md` 中本批迁移任务及其专用链接定义；`docs/30-designs/MEETING-REMOTE-DESIGN.md`、`docs/20-interfaces/MEETING-REMOTE-INTERFACE.md`、`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/00-governance/ARCHITECTURE.md`。
禁止修改：产品代码、重新组织设计文档、删除历史证据。

执行：
1. 仅把 Remote Design/Interface 开头“尚未实现/不表示代码已实现”改为“已实现，验证边界见 readiness”；Architecture 的 Web transport 迁移前/替换句改为 remote 公开入口已实现。Implementation 目录树 http/改 remote/，原 src/http/index.ts 映射行替换为 src/remote/index.ts Service；Migration 段改为当前接线见 Remote Design。其它 HTTP 历史文字受 Protocol 的 Local Web Transport Authority 限定，不在本步重新整理。
2. 核对本批 M01—M15（含 M13a）均已完成；备份本文和 TODO 内容到内存。根 TODO 中仅移除已经完成的本批前序项、M16 收口项及 remote-migration-runbook 专用链接定义，保留其它任务。此为待检查的收口修改，检查通过前不得宣告 M16 完成。执行下列 rg，仅本文命中时继续；若其它引用仍存在，恢复 TODO 并 STOP，不扩张修改范围。先完成链接/diff检查，再删除本文。从移除 TODO 开始，任一收口检查失败（包括删除前的链接/diff检查）都必须恢复备份的 TODO；若本文已删除，同时恢复本文，然后 STOP。不得留下已消失但尚未完成的 M16 任务。
3. 删除后重复链接/diff检查，任一失败立即恢复本文及 TODO 并 STOP；成功不保留 completed/archive 副本，M16 才可关闭。M15 evidence 不删除；获得提交授权后，在完成收口的同一 commit 中提交文档与 TODO 删除。

验证：
```bash
rg -n "RUNBOOK-MEETING-REMOTE-MIGRATION|RUNBOOK: Meeting Remote Migration" docs AGENTS.md TODO.md
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：删除前后检查通过、本文不存在、所有长期事实与实际证据仍存在。
STOP：外部引用、缺完成证据或删除后检查失败；报告最后 PASS、路径/symbol、命令与去敏输出，不改变本文既定方案。

## Fixed Coverage And Audit

| 目标 | 实施 | 固定验证 |
| --- | --- | --- |
| 有界通知/提交顺序/reopen | M01—M02 | feed 与 meeting-runtime：首帧、数量、abort/return、失败无通知、已确认事实重开 |
| 九方法/输入/输出/错误 | M03—M05 | D1/D2/D4 与 generated/source 边界；原字段不丢、非法不进 Runtime |
| 可选 Host 生命周期 | M06 | 缺依赖不影响 tools、子域/父域 disposer 计数 |
| Client 类型与九调用 | M07—M09 | adapter/generated/types/panel 原业务断言 |
| 轮询替换与并发 | M10—M11 | D3 R1—R10，15秒无周期读取、断线禁写、补读后恢复 |
| 删除旧 transport | M12—M13 | 旧测试逐项去留、原领域/receipt/recovery测试、新RPC envelope、旧路径rg零匹配 |
| 实际 WebSocket 断开与重开 | M13a | 真实 profile marker、提交刷新、断线期间写入、重开补读、socket 清理 |
| 废弃依赖拔除 | M14 | D5确定清单、三组rg零匹配、直接依赖断言、lock/typecheck/build/package |
| 实际迁移可运行 | M15 | verify、两个指定真实profile marker、restore=PASS |
| 收口 | M16 | 长期状态/证据与删除后文档检查 |

Not Applicable：存储 schema migration、业务协议版本升级、持久通知回放、新权限、LLM质量、stress/metrics。原事务原子性、terminal、幂等、event/receipt/outbox/Archive 一致性由未删减的现有 verify 保持。真实浏览器内自动重连端到端是 Not Covered，不是 Not Applicable，不随RUNBOOK删除消失；真实 WS carrier 的独立门禁必须按 M13a 执行。

作者审计：环境/当前代码 baseline 现在完成，实施从 M01 开始；M01—M16（含 M13a）每一步均只有一个主行为，明确文件、输入/输出、前一步依赖、测试oracle和STOP。原T0已删除，原T2拆为M03—M06，原T4拆为M07—M11；D1—D5负责原先需要执行者选择的细节。作者文档检查与实际环境结果记录在 evidence。只有 M01—M15（含 M13a）全PASS且M16删除后检查通过才完成；命令失败时不自行重写方案继续。
