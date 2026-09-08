# Session 查询、索引与导出

本 reference 固定 `dsh-v0.1.2-rc.1`。session-query 拥有 live-preferred logical corpus、exact read/filter/trace；session-query-sqlite 提供派生全文索引。应用分页与 observation 租约见 [Session API](session-workspace-api.md)。

## 查询平面

| 操作                                   | 语义与边界                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| listSessions/filterSessions            | 完整 logical corpus；header 优先 live，availability 单独说明 live/persisted                     |
| observeSession/readSession/readSurface | 一次准确 observation、完整 replay-validated log 或 current surface；不激活 Agent                |
| readTitleSnapshot/readTitleSnapshots   | header 与 title 同一 observation；batch 每个 unique id 有序结果，单 id 失败局部化，取消拒绝整批 |
| filterEvents                           | AND 组合 clauses，同 clause 列表 OR；inclusive ranges，结果按 seq 升序                          |
| readEvent                              | 原始 seq 加有界 before/after window，返回准确 target header                                     |
| traceSession/traceEvent                | parent/descendant lineage 与直接 event 关系；source citation 不等于 surface replacement         |
| searchSessions/searchEvents            | 跨 Session strongest-event grouping 或单 Session ranked search，需要全文 Provider               |

以公开 types 的实际方法/字段名调用；上表不同读模型不能由任意 raw array 缓存互相替代。SessionObservation retain 与 dispose 按独立租约管理；raw log、surface、title 属于不同视图，不把 shadowed 等同删除。

Event text 提取 message、tool call/result、todo、failure/status；排除 reasoning、blocked prompt、结构事件及 stream chunks。filterEvents.text 为 literal Unicode case-insensitive、whitespace-flexible scan，不使用 FTS grammar。Trace 的 replacementChain 沿 immediate replacer 到最终替换，其他 seq 列表为直接关系；lineage 必须区分已知 root 和缺失 parent。

## SQLite 配置与 cursor

path 必填，独立派生数据库或 :memory:，不能指向权威 Session 持久介质。openAt 默认 startup，可 first-search 延后 import/open，never 禁用全文但保留 exact read/filter/trace。journalMode 默认 wal；defaultLimit 20、maxLimit 100、snippetChars 240 code points、readWindowMax 50、persistedInspectConcurrency 4。

Query 是规范化 literal phrase，quotes/OR/NEAR/star 作为数据；unicode61 token recall 不保证词内 substring。Ranking 以真实 match spans、文档长短和稳定 tie-breakers 排序，不承诺可跨 Provider 比较的数值 score。默认检索 current/shadowed/log-only，限制需显式 surface filter。

Opaque cursor 绑定 normalized query、metadata filters 与 limit；相关 corpus 改动为 STALE_CURSOR，必须重启搜索，不能只接着旧页。单 Session cursor 不因别的 Session 更新失效；跨 corpus cursor 会。单 Session 零命中结果仍带其 observed header。

Disabled search 在 request normalization 前返回 SEARCH_DISABLED。Malformed request/filter/cursor、missing target、source metadata 冲突、surface log 损坏与 index failure 分开，使用 SessionQueryError 完整 SESSION_QUERY_* code。SQLite predicate/binding 预算在 prepare 前限制；同步 statement 阻塞 JS，signal 只能在调用之间取消。

## 权限、恢复与导出

Service 是 trusted context-wide API，无 caller authorization；tool/UI 必须先拥有查询目标的权限，不能因为搜索能返回某 Session 就授予读取正文。SQLite index 单进程独占 path，无多进程 writer 支持；它可以重建，不能成为 Session 权威历史。

Web `/export` 不接收 path 参数，通过受认证的 `/api/session.export` GET/HEAD 下载 ZIP（compressionLevel 默认 6，范围 0–9），依赖 sessionQuery、sessionPersistence、attachments 与 supportsRawArtifacts，支持显式 includeDescendants。下载前 flush live log；HEAD 取消 body 并保留响应头。检查依赖、raw-artifact 能力和取消；不要借列表标题推断 dump 已落盘，不为了下载重写历史。物理文件可能压缩，逻辑规范化导出与原始 artifact 必须准确区分。

## 验证

覆盖 live/persisted 优先级与矛盾 metadata、literal/FTS 不同语义、filter AND/OR/ranges、零命中 header、cursor 参数/相关 revision、lineage 缺 parent、replacement/source 区别、search disabled、index rebuild/失败、observation release 和导出 abort。
