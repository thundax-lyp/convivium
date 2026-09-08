# Session 与 Workspace 的应用 API

本文针对 `dsh-v0.1.2-rc.1` 的 Browser/Host 应用接缝。它区分持久数据查询、应用命令、活动控制与传输；新增领域 Remote 的通用声明规则见 [Typert Remote](typert-remote-api.md)。

## 条件补读

- 改底层 Remote descriptor/carrier 再读[Typert](typert-remote-api.md)；冷索引读[Session 查询](session-query-index.md)

## 职责与迁移

旧 `dsh-host-apiproxy` 包不可用。应用能力分别由 `dsh-api-session-controller`、`dsh-api-workspace-controller`、`dsh-api-settings-controller` 拥有；Gateway 负责通用分发，API remotes 选择和挂载生成的 contribution。不要把 Session 命令、Workspace 数据或业务 event switch 重新放进 Gateway。

Session controller 拥有 create、prompt、cancel、queue mutation、模型选择、历史 page/follow 与全局 control。Workspace controller 拥有注册、标题、顺序、Session 分组和归档。Settings controller 拥有配置 Remote；底层 Settings Service 的注册规则仍由 [用户设置](user-settings.md) 定义。

FileReferenceService 现在是普通 Service，旧包的 `./typert`、`./remote` 不可用；`SessionFileReferences` 在 Session controller 包中提供 `fileReferences` Remote namespace。不要因为 namespace 名保留而继续 import 旧生成物。Agent presets、LLM、Subagents 的 Remote contribution 则由各自 owner 发布，再由 API remotes 组装。

## Browser carrier 与认证

`dsh-client-connection` 提供 HTTP /api bridge，注入 webServer 和 credentials；旧 HOST_EVENTS_PATH/MUX_EVENTS_PATH 不能继续当公共入口。请求先经过 Host/Origin trust fence 和持久 browser authentication，再进入 dispatcher。trustedHosts 必须是合法 authority；监听所有地址不等于所有 Host 请求自动可信。

BrowserAuth 用启动 token 交换 authority-bound signed cookie，签名 secret 由 Credential Provider 持久化，cookieMaxAgeDays 默认 30。不要在 feature plugin 自己开一条绕过此流程的 controller 路由。Generic Webhook 不共用这套浏览器登录假设，使用 [Webhook adapter](web-ingress.md) 的协议认证。

maxRequestBodyBytes 默认 300 MiB，并在激活时检查能容纳配置的 aggregate image bytes 的 base64 和 envelope；它是 carrier body limit，不是所有业务字段都已合法的证明。Profile 负责暴露范围和认证组合，Remote owner 仍检查自身业务条件。

## 一致的历史读取

`SessionAddress` 是领域定义的地址，不能把它缩减为活动 Agent 句柄。`follow()` 首先返回 snapshot：header、cursor、records、hasMore 与同一 cut 的 projection baseline；随后是有序事件。`page()` 使用这个 opening frame 的 inclusive `throughSeq`，加可选 `beforeSeq` 和消息数量限制向前分页。不要在分页中重新取“此刻的最新 seq”，否则各页不再属于同一历史切面。

`SessionHistoryRecord` 可以是标量 event，也可以是无损的 Assistant chunk run。Packed row 覆盖多个逻辑 seq；records 数量不等于日志长度。保留完整区间和顺序，不展开 chunk members 以适配旧 UI fold。Conversation 层按 [Conversation Node](client-conversation-nodes.md) 消费。

列表的 `SessionProjectionHints` 可能陈旧或缺 key，只用于摘要；打开后的 `SessionProjectionBaseline` 对应准确 cut。不能将列表 hint 当作命令的权威前置状态，也不能用列表缺 key 断言能力不存在。

## 控制流与重连

Session `control()` 与 Workspace `follow()` 每个新连接代次都从 baseline 开始。Queue、jobs、projection update 和 Workspace upsert/remove/order 等增量只更新所属领域；它们不是原始 Session event 的替代品。Client 连接拥有 transport generation，Session controller 的 Client model 拥有历史/状态，ui-session 和 ui-workspace 拥有用户选中目标。

Gateway 的 `RemoteJournalStream` 提供 opening、page、ordered tail 和 gap repair 的共享协调。领域给出 first/last cursor、比较和相邻关系、readPage/follow 及 publish。重连期间保留旧窗口，新的 opening page 达到该代 cursor 后才替换；不把半份新窗口暴露为完整状态。资源 owner 在退出时 dispose logical stream，过期代次不得写入当前 UI。

## Host 的冷读租约

`ctx.sessionQuery.observeSession(id, options)` 返回 `SessionObservation`，包含 immutable events、cursor、继承长度及按需 projection。它优先读 live Session，也可借用 prepared persistence source；不为了查询激活 Agent，也不先列举整个 corpus。

Observation 实现 `Disposable`：使用 `using` 或 finally 调用 `[Symbol.dispose]()`。需要跨 owner 持有时用 `retain()` 获得独立租约，并分别释放。不要把 cold prepared object 缓存为永久 live Session；projectionMode 为 none 时不能把未计算值当空领域状态。

## 验证

覆盖 opening 与并发 append、固定 cut 分页、packed row 区间、cold/live 切换、租约释放、gap repair、重连 baseline 替换、旧 generation 隔离，以及命令失败后状态不伪更新。类型验证只证明生成 namespace 可调用，不证明这些时序。
