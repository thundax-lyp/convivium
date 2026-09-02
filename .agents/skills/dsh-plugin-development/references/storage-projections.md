# Storage 与 Session projection

本 reference 用于选择 rc.2 的持久事实载体。不要因为都能“保存状态”而混用 Session log、Storage domain 与 projection。

## 三类状态的选择

| 数据                                                  | 选择                     | 权威来源                                 |
| ----------------------------------------------------- | ------------------------ | ---------------------------------------- |
| 某个 Session 发生过、且回放或模型历史必须知道的事实   | Session event            | append-only Session log                  |
| 插件拥有、跨 Session 或不属于会话历史的 durable state | `ctx.storageDomain`      | Storage backend 中的 domain unit         |
| 从 Session log 导出的当前 Host/Client 读模型          | `ctx.sessionProjections` | Session log；projection 只是可重建派生值 |

不要把插件 KV 数据伪装成 Session event，也不要把 projection/cache 当作事实源。需要同时存在时，先提交所属权威事实，再由对应 notification 或 fold 推进派生读模型。

## Storage domain

产品 Consumer 依赖 typed domain facility，不直接调用 JSON/SQLite backend。Domain owner 用 `defineDomain()` 声明唯一名称、非负 format version、可选 global 和 typed tables；table key 优先使用 producer-owned branded id。Schema 在打开现有介质时验证全部数据；版本不符或 malformed/invalid record 必须显式失败，rc.2 不承诺迁移旧格式。

Backend route 属于 domain facility 的部署配置。多个 backend 可以同时存在；不要假设 hub 有一个全局默认介质，也不要在 Consumer 内选择具体 backend 实现。

## 生命周期与提交顺序

调用方拥有 `open(spec)` 返回的 Domain，并通过自己的 `ctx.effect()` 在 teardown 时 `close()`。Close 拒绝新写入、drain 已排队写入并释放 unit；重复和竞争 close 必须等待同一个静默结果。

同一 domain 的 `put`、`delete`、`update` 与 global write 按一条队列提交。顺序是 backend durability、更新内存、再发送 `domain/changed`；backend failure 不得先改变内存。Change event 是提交后的通知，不是 transaction participant，listener failure 不能推翻已 durable 的写入。读取返回的对象不得原地修改，使用 `put` 或 `update` 替换。

## Session projection

一个 projection definition 拥有 merge-extensible state key、plain-JSON state schema、`init()`、同步纯 `apply(state, event)`、可选 wire view 和 `stateVersion`。不关心 event 时返回相同 state reference；只有 reference 改变才产生下游工作。State-carrying event 优先携带完整变更后值，使 replay 保持 last-wins 且读值自描述。

Wire view 是 schema-validated 的完整当前值，不是 delta，也不负责渲染。Carrier 从 registry 读取共享 `asOfSeq` cut；Client 不自行 fold domain event。改变序列化 state 或 fold semantics 时递增 `stateVersion`，使旧 persisted cache 被丢弃而不是错误续算。注册通过 `ctx.inject(['sessionProjections'], ...)` 保持该可选能力在 headless 组合缺失时不影响 domain plugin。

## 必需证据

Storage 覆盖无效 spec、route/facet 缺失、existing-data validation、写入失败不改变读取、提交后通知顺序、并发写序和 quiescent close。Projection 覆盖 complete replay、late registration/restore、无关 event 保持相同引用、wire schema、state-version cache invalidation，以及 history baseline 与 live append 产生相同 whole value。
