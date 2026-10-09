# Host Session 查询对象

适用 `@deepseek-ai/dsh-session-query@0.2.0-rc.2` 及目标版本 `docs/subsystems/session-query.md`。包提供抽象 `ctx.sessionQuery`；实际全文检索 backend 需另装，例如 `dsh-session-query-sqlite`。见 [查询与实现 Session 检索](../how-to/how-to-host-session-query.md)。

## SessionQueryEngine

**公开导出**：`SessionQueryEngine` 来自 `@deepseek-ai/dsh-session-query`。
Service 自己实现 live 优先的 `listSessions`、`readSession`、`filterSessions`、`filterEvents`、`listEvents`、`readSurface`、`readEvent`、标题读取、lineage 与事件 trace；backend 只实现抽象 `searchSessions` 和 `searchEvents`。读取具体 live Session 时不经持久化；否则可从 `sessionPersistence` 冷读并验证。返回值是 detached copy，不能作为可变 Session 句柄。抽象包不可独立挂载为功能 backend。

以下成员是该对象的公开契约：

- `observeSession: (sessionId: SessionId, options?: SessionObservationOptions | undefined) => Promise<SessionObservation>`：取得固定日志 cut 的观察 lease，调用完成后释放。
- `readTitle: (sessionId: SessionId, signal?: AbortSignal | undefined) => Promise<SessionTitleSnapshot | undefined>`：读取可用的标题快照；找不到可返回 undefined。
- `readTitleSnapshot: (sessionId: SessionId, signal?: AbortSignal | undefined) => Promise<SessionTitleObservation>`：读取单个 Session 的标题观察结果及来源状态。
- `readTitleSnapshots: (sessionIds: readonly SessionId[], signal?: AbortSignal | undefined) => Promise<SessionTitleObservationResult[]>`：批量读取标题观察结果，按请求 Session IDs 对应。
- `traceEvent: (request: SessionEventTraceRequest, signal?: AbortSignal | undefined) => Promise<SessionEventTraceObservation>`：追踪指定事件的来源与继承关系；支持取消。
- `traceSession: (sessionId: SessionId, signal?: AbortSignal | undefined) => Promise<SessionLineageTrace>`：追踪 Session 的父子 lineage；支持取消。

## SessionObservation

`observeSession(id, options?)` 返回调用方拥有的观察 lease。live 观察固定日志 cut；冷观察由 stat revision 和短期 prepared cache 管理。用完必须释放 lease；不要长期持有以免锁住 cache 条目。事件正文读取可带精确 `inheritedEventCount`，不能从日志猜 fork cut。

以下成员是该对象的公开契约：

- `cursor: SessionSeqCursor`：本次固定日志 cut 的游标，继续读取须以此为边界。
- `events: readonly SessionEvent[]`：观察 cut 中的只读事件序列，不是可变 Session 日志。
- `header: SessionHeader`：与本次事件 cut 一致的 SessionHeader。
- `projections: ProjectionSnapshot | undefined`：可选投影快照；缺省时不能假定投影已加载。
- `retain: () => SessionObservation`：为同一观察结果取得另一个由调用方释放的 lease。
- `source: "live" | "prepared"`：标识结果取自 live Session 还是 prepared 冷读。

## SessionResultFilter

**公开导出**：`SessionResultFilter` 来自 `@deepseek-ai/dsh-session-query`。
Session 过滤器按 id、cwd、创建时间、父 Session 与 live/persisted 可用性筛选。多个过滤条件 AND，单个列表值 OR；空列表匹配空集，范围含端点。输入不合法抛 `SESSION_QUERY_INVALID_FILTER`。

以下成员是该对象的公开契约：

- `kind: "id" | "cwd" | "parent" | "created-at" | "availability"`：会话过滤器判别字段；限定 id/cwd/parent/created-at/availability。

## SessionEventResultFilter

**公开导出**：`SessionEventResultFilter` 来自 `@deepseek-ai/dsh-session-query`。
事件过滤器按 seq、时间、类型、surface 和字面文本筛选。字面文本是大小写不敏感、空白弹性的语义文本匹配，不是全文搜索语法；排序分页的全文需求交给 backend 的 search API。

以下成员是该对象的公开契约：

- `kind: "text" | "type" | "time" | "seq" | "surface"`：事件过滤器判别字段；限定 text/type/time/seq/surface 五类。

## SessionQueryError

**公开导出**：`SessionQueryError` 来自 `@deepseek-ai/dsh-session-query`。
错误 `code` 区分不存在、live/persisted 头冲突、持久化失败、损坏 Session、无效 surface 与无效过滤器。调用方按 code 报告或重试；不可合并冲突来源以“尽力”返回混合日志。
