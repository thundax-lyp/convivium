# Storage 与 Session projection

本 reference 用于选择 v0.1.2-rc.1 的持久事实载体。不要因为都能“保存状态”而混用 Session log、Storage domain 与 projection。

**阅读导航：** 先读[三类状态的选择](#三类状态的选择)。插件持久数据接着读[Storage domain](#storage-domain)和[提交顺序](#生命周期与提交顺序)；日志读模型读[Session projection](#session-projection)与[领域 fold](#领域-fold-与能力缺失)。缓存、统计、message feedback 分别按实际修改补读，最后核对[必需证据](#必需证据)。

## 条件补读

- 新增权威 Session event 先读[Session](session-durable-context.md)；不为查询需求复制一份事实源

## 三类状态的选择

| 数据                                                  | 选择                     | 权威来源                                 |
| ----------------------------------------------------- | ------------------------ | ---------------------------------------- |
| 某个 Session 发生过、且回放或模型历史必须知道的事实   | Session event            | append-only Session log                  |
| 插件拥有、跨 Session 或不属于会话历史的 durable state | `ctx.storageDomain`      | Storage backend 中的 domain unit         |
| 从 Session log 导出的当前 Host/Client 读模型          | `ctx.sessionProjections` | Session log；projection 只是可重建派生值 |

不要把插件 KV 数据伪装成 Session event，也不要把 projection/cache 当作事实源。需要同时存在时，先提交所属权威事实，再由对应 notification 或 fold 推进派生读模型。

## Storage domain

产品 Consumer 依赖 typed domain facility，不直接调用 JSON/SQLite backend。Domain owner 用 `defineDomain()` 声明唯一名称、非负 format version、可选 global 和 typed tables；table key 优先使用 producer-owned branded id。Schema 在打开现有介质时验证数据。默认 `layout: single`，也可选 `per-record`。`compatibleVersions` 只声明当前 schema 可读取的更旧版本，写入仍标记当前 version；不代表任意格式迁移。默认 invalid record 拒绝打开；仅对可丢弃派生数据使用 `invalidRecords: backup-and-skip`，且 backend 必须提供 `backupRecord()`，否则仍拒绝。Global slot 始终拒绝无效值，权威业务数据不应使用跳过恢复。

Backend route 属于 domain facility 的部署配置。多个 backend 可以同时存在；不要假设 hub 有一个全局默认介质，也不要在 Consumer 内选择具体 backend 实现。

## 生命周期与提交顺序

调用方拥有 `open(spec)` 返回的 Domain，并通过自己的 `ctx.effect()` 在 teardown 时 `close()`。Close 拒绝新写入、drain 已排队写入并释放 unit；重复和竞争 close 必须等待同一个静默结果。

同一 domain 的 `put`、`delete`、`update` 与 global write 按一条队列提交。顺序是 backend durability、更新内存、再发送 `domain/changed`；backend failure 不得先改变内存。Change event 是提交后的通知，不是 transaction participant，listener failure 不能推翻已 durable 的写入。读取返回的对象不得原地修改，使用 `put` 或 `update` 替换。

## Session projection

一个 projection definition 拥有 merge-extensible state key、plain-JSON state schema、`init(header, inheritedEventCount)`、同步纯 `apply(state, event)`、可选 wire view 和 `stateVersion`。不关心 event 时返回相同 state reference；State reference 改变才计算新的 raw wire view；下游 change feed 还通过 `Object.is(previousView, nextView)` 判断是否发布。Object-valued view 应复用未变引用，不能每次新建等值对象。State-carrying event 可携带完整变更后值以便自描述；这不取消 domain 的合法转换、revision 与历史一致性校验，不能统一按 last-wins 回放。

Wire view 是 schema-validated 的完整当前值，不是 delta，也不负责渲染。Carrier 从 registry 读取共享 `asOfSeq` cut；消费此 Host wire projection 的 Client 使用完整值；[Conversation Node](client-conversation-nodes.md) 仍按自己拥有的事件族在 Client 增量组装展示，两者不是同一个 fold。改变序列化 state 或 fold semantics 时递增 `stateVersion`，使旧 persisted cache 被丢弃而不是错误续算。只贡献 projection 的插件可用 `ctx.inject(['sessionProjections'], ...)` 延后注册；消费 Host state 的插件必须声明所需服务，并按每个 key 的 owner 契约处理缺失；required key 不能无声回退到空值。目标版本 agent-loop 本身依赖 `sessionProjections`。`snapshot(session, keys?)` 可选择 wire keys，Host `stateOf()` 不计算无关 wire view；缓存恢复不得跨缺失序号续算。

## 领域 fold 与能力缺失

不能把所有 projection 都实现为“取最后一个 change”。Goal 的 Host state 包含 current、seenGoalIds 和 replay failure；匹配的 admitted user/message 推进 roundsStarted。错误的事件序列应由 owner 报告，而不是被后来的 whole-value 静默覆盖。Schedule、Todo、Plan、sandbox mode 与 Agent turn boundary 也有自己的 projection key 和 reducer。

缺 key 的语义由 owner 定义。`turnBoundary` 在没有 agent-loop 时表示没有该能力；可安全处理的 reader 可按“无边界”解释，依赖 step-open 的 reader 则应失败。这与随意给 required state 默认空值不同。实现插件前核查所读 key 的声明和实际注册，而不只检查 SessionProjections Service 是否存在。

`session-turn-outline` 提供全日志 turnOutline，包含 turn/start seq 和有界提示/回答摘要；Client 不应靠已经加载的历史页推断全部 turn。Draft 变化保留 turns 的引用，直到可见 outline 变化才发布；它展示了 raw view 身份稳定的实际用途。

## Projection cache

session-projection-cache 是可重建派生缓存，writeEveryEvents/writeIntervalMs 都必填。创建、turn/end、Session disposal 为 mandatory write；dirty interval 从第一条事件起算，非滑动窗口。写之前先 flush 权威 Session，缓存最多落后，不得领先日志；写失败保留 stale 并等待下次自愈。

cachedSnapshot(meta,inheritedEventCount) 零 I/O 读内存 domain，校验 createdAt/cwd/isSeeded/inheritedEventCount、stateVersion 与 schema，cut 取已返回 keys 的最低 watermark。Seeded header-only listing 不知道准确继承长度，必须跳过 fast path。coldSnapshot 需要 caller 给完整有序日志，它自己不读取 persistence。

无 eviction/retention API；旧 schema 的 compatibleVersions 或 backup-and-skip 必须证明 fixture 升级处置。不要从“缓存存在”推断查询最新，也不把 cache 恢复异常当整个 Session 数据损坏。

## Session stats

`sessionStats` 从完整日志计算：`turns` 是至少有一个 closed step 的不同 turn，`steps` 计全部 `step/end`，包括失败、取消和 max-tokens。`llmMs` 只累计组装了 assistant message 的模型耗时；`toolMs` 匹配 callId 的 call/result；`ttftMs/ttftSteps` 累计有首个非空 delta 的步骤；`decodeMs/decodeTokens` 还要求合法 usage。未贡献的总数为 0。

取消且未组装消息的步骤计数但不计部分模型耗时；crash-interrupted step 在恢复补写 step/end 后才计数。分页/compaction 不改变全日志统计，不能与当前可见消息数等同。插件只在 projection registry 存在时注册，卸载撤回 key；没有此 unit 的 Client 才使用窗口统计降级，并应说明其范围。

## Message feedback 的 sidecar 边界

`messageFeedback` 是可编辑的 Storage domain sidecar，与不可变的 Session `feedback/record`、projection 和 telemetry handoff 分开。它只接受非空、append-origin 的 `assistant/message`；不能给 replacement-origin、空 usage 或其他事件评级。每条 message feedback 拥有 opaque version；更新现有 item 即使是 no-op 也必须匹配 `ifVersion`，冲突返回权威当前 item。

一条 Session row 包含 `{createdAt, cwd}` header identity；不匹配按旧数据不存在处理，fork 不复制 sidecar。写入前 live target 经 canonical flush，再和 cold 路径一样通过 persistence physical read 重验目标，确保日志 durability 先于引用它的 sidecar commit。Per-Session queue 覆盖检查到写入，dispose 关闭新 admission、drain 队列再 close domain。

此队列只保证单 Host 进程并发，不提供多进程 CAS；`session/disposed` 不是 durable deletion，不能据此级联删除。Sidecar 没有 live frames，其他 tab 的编辑通过重连或 conflict reply 收敛。不要把单条 note 的字节限制当整行或 item 数量上限。

## 必需证据

Storage 覆盖无效 spec、route/facet 缺失、existing-data validation、写入失败不改变读取、提交后通知顺序、并发写序和 quiescent close。Projection 覆盖 complete replay、late registration/restore、无关 event 保持相同引用、wire schema、state-version cache invalidation，以及 history baseline 与 live append 产生相同 whole value。
