# Meeting Remote Interface

## Purpose And Status

2026-09-09 确认的迁移目标：九个 Meeting Web 操作一次迁移到 DSH `0.1.2-rc.1` Typert Remote；以插件自有 stream 通知和完整 refetch 替换 5 秒轮询。本文规定迁移后的传输契约，不表示代码已实现。业务 DTO、权限、状态及 receipt 继续由 [Meeting Protocol](./AGENT-MEETING-PROTOCOL-INTERFACE.md) 定义；实现覆盖以 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为准。

本契约满足 [Requirements FR-11](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#fr-11可观察性与用户控制)。不增加创建会议、Agent 管理、增量状态同步或远程部署功能。

## Boundary And Ownership

- Host Service namespace 为 `conviviumMeetings`。仅在真实 Host `webServer.host === "127.0.0.1"` 且 `typertGateway`、`typert` 可用时实例化 Service；缺 Web 不实例化，但会议 Runtime/tools 继续运行。Client 的 loopback 判断不是权限依据。
- Service 持有现有 `LocalMeetingWebRuntime` 的引用，调用现有九个方法；不创建第二个 Runtime、Session 或 Repository。其生命周期从属于可选 Web 子作用域。
- Host/profile 提供正式 DSH Connection、Gateway、Registry、Loader。插件不复制其实现，不改变其全局配置，也不依赖 DSH 源码 checkout。
- 原 `/api/convivium/meetings` prefix registration 完全移除，不提供兼容路由或失败时 HTTP fallback。DSH 自有 `/api` carrier 及其认证/可信请求检查继续由 DSH 拥有。
- 本地 actor 仍由 Runtime 产生；`local_host/loopback-web` 及现有 local decision/risk provenance 不重命名。Remote 的 namespace 不是领域 identity。

## Unary Methods

Host 的最后一个 `signal: AbortSignal` 是所有方法的必需实现参数，DSH 不把它作为 wire JSON 字段；生成 Client 允许省略 signal。除 `list` 外，wire envelope 精确为 `{args:{input:...}}`；`list` 为 `{args:{}}`。

| Remote method | Input DTO | Host Runtime method | 正常业务返回；所有单 Meeting 方法另可返回 `ProtocolErrorV1` |
| --- | --- | --- | --- |
| `list(signal)` | 无 | `listLocalMeetings()` | `LocalMeetingListResponseV1` |
| `getStatus(input, signal)` | `MeetingStatusInputV1` | `getLocalMeetingStatus(input)` | `ProtocolSuccessV1<MeetingStatusResultV1>` |
| `pause(input, signal)` | `PauseMeetingInputV1` | `pauseLocalMeeting(input)` | `ProtocolSuccessV1<MeetingControlResultV1>` |
| `resume(input, signal)` | `ResumeMeetingInputV1` | `resumeLocalMeeting(input)` | `ProtocolSuccessV1<MeetingControlResultV1>` |
| `reassign(input, signal)` | `ReassignTurnInputV1` | `reassignLocalTurn(input)` | `ProtocolSuccessV1<ReassignTurnResultV1>` |
| `end(input, signal)` | `EndMeetingInputV1` | `endLocalMeeting(input)` | `ProtocolSuccessV1<EndMeetingResultV1>` |
| `acceptDecision(input, signal)` | `CaptainDecisionAcceptanceInputV1` | `acceptLocalDecision(input)` | `ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1>` |
| `disposeDecision(input, signal)` | `CaptainDecisionDispositionInputV1` | `disposeLocalDecision(input)` | `ProtocolSuccessV1<CaptainDecisionDispositionResultV1>` |
| `disposeRisk(input, signal)` | `CaptainRiskDispositionInputV1` | `disposeLocalRisk(input)` | `ProtocolSuccessV1<CaptainRiskDispositionResultV1>` |

### Input Fields

所有下列字段 required，无 null、默认值、自动 trim 或客户端 authority 补值；仅明确标记 optional 的字段例外。类型及业务校验沿用 `plugin/src/protocol/types.ts`、`commands.ts`。

- `getStatus`：`protocolVersion: 1`、`meetingId: string`。
- 七个写方法共用：`protocolVersion: 1`、`meetingId: string`、`expectedMeetingVersion: number`、`requestId: string`；版本来自最近一次验证成功的完整 projection，requestId 沿用 UI 的 `crypto.randomUUID()`。
- `pause` 追加 `reason: string`；`resume` 不追加字段。
- `reassign` 追加 `currentAttemptId: string`、`action: "skip" | "reassign"`、`reason: string`；`replacementParticipantId: string` 仅在 reassign 时 required，在 skip 时禁止。
- `end` 追加 `outcome: "completed" | "partial" | "no_consensus" | "cancelled"`、`reason: string`、`acceptedDecisionIds: readonly string[]`、`deferredAgendaItemIds: readonly string[]`、`waivers: readonly {subjectId: string; kind: "required_review" | "agenda_item"; reason: string}[]`。UI 仍只提供原有三个非 completed outcome。
- `acceptDecision` 追加 `decisionCandidateId: string`、`reason: string`、`evidenceMessageIds: readonly string[]`。
- `disposeDecision` 追加 `decisionId: string`、`action: "supersede" | "revoke"`、`reason: string`、`evidenceMessageIds: readonly string[]`；`replacementCandidateId: string` 仅在 supersede 时 required，在 revoke 时禁止。
- `disposeRisk` 追加 `issueId: string`、`decision: "accept" | "reject"`、`reason: string`、`evidenceMessageIds: readonly string[]`。
- 身份、Session、teamId 及其他未列出的顶层字段全部拒绝。Schema 仍验证非空、整数、条件字段；Runtime 验证 evidence 归属、权限、终态、attempt 和 version。

### Preserve Unknown Fields Until Validation

DSH 该版本生成的普通对象 codec 会剥离未知字段。不得让它在现有严格入口校验之前吞掉调用方提交的 authority。八个有 input 方法的 wire 类型固定为 `DTO & Record<string, RemoteJsonValue>`，使 generated codec 保留额外 JSON 字段，再由 Service 的精确键校验拒绝。该 index signature 不授权任何额外业务字段。

```ts
export type RemoteJsonValue =
    | null | boolean | number | string
    | readonly RemoteJsonValue[]
    | { readonly [key: string]: RemoteJsonValue };
```

`RemoteJsonValue` 位于新 `plugin/src/remote/types.ts`。wire input aliases 使用 `RemoteStatusInput`、`RemotePauseInput`、`RemoteResumeInput`、`RemoteReassignInput`、`RemoteEndInput`、`RemoteAcceptDecisionInput`、`RemoteDisposeDecisionInput`、`RemoteDisposeRiskInput`。每个 alias 只与上表 DTO 相交，不复制业务 DTO。Client adapter 通过 `{...input}` 传递现有 DTO，不用强制断言绕过 index signature。

### Size And Cancellation

- 移除旧 HTTP raw body 的 16,384-byte 读取阶段限制。carrier 的 JSON envelope、原始请求大小及缓冲上限改由 DSH Connection 负责；不修改宿主全局 body 配置。
- 保留应用输入大小约束：八个 input 对象进入 Service 后、调用业务 Schema/Runtime 前，`Buffer.byteLength(JSON.stringify(input), "utf8") > 16_384` 即拒绝。计算包含保留下来的额外字段，不包含 carrier envelope。它是解码后的业务输入限制，不宣称限制宿主接收阶段内存或与旧 raw bytes 完全等价。
- 方法入口先 `signal.throwIfAborted()`，验证后、进入 Runtime 前再次检查。现有 Runtime 方法不增加 signal 参数。开始业务提交后的取消不回滚领域事实、不自动重试；返回失败不能证明命令未提交，恢复连接后读取完整事实。

## Result And Error Contract

Client unary 的外层结果为 DSH `RemoteResult<T>`。外层 `ok:true` 只表示 RPC 方法返回，`value` 中的 `ProtocolSuccessV1.ok` / `ProtocolErrorV1.ok` 才表示业务结果。不得将两层 ok 合并或把传输失败伪造为 Meeting 状态。

- `ProtocolSuccessV1<T>` 保留 `protocolVersion:1`、`meetingId:string`、`meetingVersion:number`、`ok:true`、`result:T`；按既有 ProtocolMeta 保留可选 metadata。result 与 Runtime 返回逐字段一致，无传输层重算。
- list 保留 `{protocolVersion:1,ok:true,result:{meetings:readonly LocalMeetingListItemV1[]}}`；不补虚构的全局 meetingId/version。
- `LocalMeetingListItemV1` 精确为 `meetingId`、`teamId`、`topic`、`status`、`meetingVersion`、`updatedAt`；排序、隐私、ready 筛选及任一恢复失败时整表失败不变。
- status 继续使用 active / execution-terminal / archiving / archived 四阶段公开投影；所有字段、可选性、归档 package 和 caller 裁剪由现有 status Schema 及 Protocol 独占，不建立 Remote 专用 status 副本。
- `ProtocolErrorV1` 保留 `protocolVersion:1`、`ok:false`、`code:string`、`message:string`、`retryable:boolean`，以及既有 optional `meetingId/meetingVersion/turnId/stepId/attemptId/deliveryId/participantId`。未知领域 code 的保留规则不变。
- Service 在返回前调用原 HTTP 层使用的各 Result Schema、`validateProtocolError`、`validateProtocolSuccessEnvelope`；Client 收到外层成功后继续调用现有 consumer Schema。generated unary 不替代这些边界。

| 条件 | 新结果 |
| --- | --- |
| Runtime 返回领域成功/失败（含 VERSION_CONFLICT、IDEMPOTENCY_CONFLICT、MEETING_NOT_FOUND） | 原 envelope 作为外层 `value`；不再依赖 HTTP 200/400/404/409 |
| Service 精确键、输入大小、业务输入 Schema 拒绝 | 抛 `RemoteError("convivium/invalid-request", "Invalid meeting request.", {retryable:false})`；Client 转为既有固定 INVALID_ARGUMENT `ProtocolFailure`，不附带未可信解析的 metadata |
| `LocalMeetingRecoveryUnavailableError` | 抛 `RemoteError("convivium/recovery-unavailable", "Meeting data is unavailable.", {retryable:true})`；替代旧 503/Retry-After，不产生自动写重试 |
| 其他 Service 异常/非法输出 | 抛 `RemoteError("convivium/internal", "Meeting data is unavailable.", {retryable:false})`；不得向 wire 透出原始异常或敏感 cause |
| Gateway codec/arity/endpoint 拒绝，carrier failure 或取消 | 按 DSH 稳定错误语义处理为不可用或取消；不要求伪装成旧 HTTP 状态 |

上述三个 Remote code 的 details 在 `RemoteErrorDetailsMap` 声明合并中分别精确声明 `{readonly retryable:false}`、`{readonly retryable:true}`、`{readonly retryable:false}`。普通业务拒绝继续走内层 `ProtocolErrorV1`，不把所有领域错误重新编码为 RemoteError。

## Refresh Stream

新增 `watchUpdates(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1>`，标记 `@Remote({mode:"stream"})`。`MeetingRefreshNoticeV1` 位于 `plugin/src/protocol/types.ts`：

```ts
export interface MeetingRefreshNoticeV1 {
    readonly kind: "refresh";
}
```

这是一种瞬时刷新提示，没有 ID、timestamp、version、snapshot、Session、capability 或私有数据；不写数据库、receipt、outbox、SessionEventMap 或归档。不提供历史通知回放。

1. 服务端先注册当前订阅，再产出第一条 refresh。首次连接和每次重连均执行该顺序；客户端看到第一条后先使首帧之前的在途读取失效，再读取完整列表及当前选中详情；旧读不能解除缓存或禁写。
2. Runtime 在已成功持久化、已发布 snapshot 的现有 `onProjectionCommitted` 回调中通知订阅者；新 Meeting 的通知必须晚于 ready/catalog 发布。失败提交没有通知。
3. 按 meetingId 保存最后通知的 snapshot.version；同版本的 outbox/维护写入不重复通知。该 Map 只在 Runtime 内存存在，dispose 清空。重启无需恢复 Map，因为每次订阅先发 refresh。
4. 每个订阅最多保存一个待消费 refresh，多次变化合并。无消费者时不积压；不引入 debounce timer、 durable queue 或重试 worker。通知代码不得抛出并改变已提交命令的响应。
5. Client 通过 DSH `$stream()` 监督连接代次、取消和 carrier 重连。每条 notice 严格只有 `kind:"refresh"`；第一条校验后 `item.accept()` 只确认通知通道已建立，不等于会议事实已更新。
6. notice 触发完整 refetch。刷新进行中或写入进行中只置一个 dirty 标志；当前操作结束后补读一次；补读期间再次变化再次置 dirty。不得吞掉写入期间收到的通知。
7. 删除 5 秒 `setInterval`；保留写成功/领域拒绝后的 refetch。focus/reopen 建立新的通知订阅并执行完整刷新；旧订阅先取消，不同时保留两条通知流。
8. 断线/stream 异常立即把数据标为缓存并禁写。新的 notice 到达后仍须 list 和当前选中 detail 都验证成功才恢复写入；旧代次/旧选中会议响应不得覆盖新状态。首次订阅失败无 HTTP/polling fallback。
9. 调用者取消、iterator return、Service 卸载都必须结束该订阅并释放 pending next；Service 卸载不销毁父 Runtime 或其它 Service 的订阅。
10. 临时 carrier 失败由 DSH 处理；非 carrier 的 terminal 错误停止本订阅，保留缓存，focus/reopen 重建订阅。不添加自动写重试或自制重连 timer。
11. 卸载、切换作用域、取消及 Runtime dispose 必须解除监听并唤醒等待中的 iterator；不得遗留 pending promise、timer 或晚到的 UI 更新。

## Compatibility And Not Applicable

本次是同包 Host/Client 一次切换，无双协议过渡或旧 URL 兼容承诺。业务 protocolVersion、MeetingState format、存储 schema、request hash、receipt、事件和 Archive 均不改变。增量状态合并、跨 Host 推送、可靠通知回放及远程多用户权限不适用。

## Related Documents

- [Remote Design](../30-designs/MEETING-REMOTE-DESIGN.md)
- [Feasibility Evidence](../40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md)
