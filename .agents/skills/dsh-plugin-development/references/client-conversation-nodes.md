# Client Conversation Node

本 reference 用于把一族 durable Session event 投影为 Web Client Chat 中的业务 Node。普通 slot contribution 继续使用 `client-ui.md`；只有需要增量事件组装时读取本文件。

## Conversation Node

Host producer 拥有事件类型、payload 和 branded business id。Client plugin 拥有 `ConversationNodeDefinition`、typed Location data、target Node payload 与 keyed renderer。Renderer 只消费已组装数据，不读取 Host service，不扫描 Session window，也不把 live object 放进 Node。

## 事件族与 identity

每个 start/update/end event 都携带同一个稳定 business id，或能只从自身 payload 独立导出该 id。每个 `(kind, id)` 最多一个 start。不要把 update 关联到“最新未完成项”；分页、重连和并发会让这种隐式关联失效。

Event 必须含确定性 replay 所需的业务状态与 Turn/Step location。高频 delta 可以存在，但有条件时优先 whole-value checkpoint。若只加载到 update tail，Context 保持 pending，直到 prepend 找到 start；若产品必须在缺 start 时渲染，terminal/checkpoint event 自己携带可构造 fallback state，不能扫描无关事件猜测。

## 增量组装

`match(event)` 只提取当前 event 的 identity 与 start/update role，不执行 fold。`start` 创建 State，`update` 按 ascending log sequence 返回下一 State。`buildLocationData` 只发布 Definition-owned typed Turn/Step data；`buildViewNode` 返回 renderer-ready JSON，并保留 `context.key` 作为稳定 UI identity。

Append path 对每个 Definition 只匹配当前 event，命中后按 key 常量时间定位 Context。不要遍历完整 event window、全部 Context、`context.matches` 或 rendered Node collection。跨 Node 读取 earlier business state 只在 `start` 使用 indexed `reader.previous(kind)`；同 Location 协作使用 typed Location data。

Publication 使用 `immediate` 处理结构/terminal 变化，`animation-frame` 合并高频可见 delta，`none` 延迟只供后续 publication 使用的 state。Cadence 不改变 log-order fold。暂时隐藏已发布 Node 使用相同 key 加 `visibility: hidden`，不要撤回后重新创建 identity。

## 必需证据

证明 complete replace、update-only tail 加 prepend start、history 加 live append 与 combined replay 得到相同 State/Location/Node；旧页 prepend 不替换未变化 keyed Node；高频 delta 保持 key 并按 cadence 发布；renderer 只消费 node data 与 constrained Location hooks。产品可见变化再覆盖 Client bundle composition、Session replay 和 GUI rendering。
