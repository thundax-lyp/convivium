# 上下文压缩、计量与持久恢复

本 reference 固定到 `dsh-v0.1.2-rc.1`，补充 [Session 事件](session-durable-context.md) 的历史压缩、token pressure 与恢复边界。Compaction 是可选能力，不应塞进普通工具或 Provider。

## 条件补读

- 不熟悉 log 与 surface 区别时先读[Session 事实源](session-durable-context.md#持久事实源)；不把 flush 当外部效果 exactly-once

## Surface 不是按 seq 排序的全部日志

Durable log 保持 append-only；模型 surface 可以通过 replacement 改变。shadowedRange 的 start/end 是两个 surface 位置的事件 seq，不是数值区间：新 summary 的高 seq 可能位于更老内容之前，因此 start 可大于 end。shadowedSeqs 按 surface 顺序给出实际被替换集合；不要用 seq between 判断 membership。

Compaction start/summary/end 是 log-only 记录，summary 内容通过单独 user/message 的 surface replacement 进入模型。插件查询原始日志、current surface 和 visible messages 时必须选择准确含义。

## 压缩提交与失败

start 先记录锁；总结、summary 事实和 replacement 成功后才写 end。活跃 unmatched start 阻止重入；较新 end-seed 之前的未闭合记录属于旧生命周期，不能永久锁死新实例。手工维护期间出现不相关 idle injection，不等于选定 surface span 已失效；提交前重新验证被选范围。

自动 pressure 路径位于 pre-step；可先调用 toolResultPruner，再经 TokenMeter 重量测。范围边界必须保持 tool-call/result 配对，可使用 toolPairingBalancedBefore/After，不能为了保留完整 turn 而永远无法压缩一个超大 turn。

手工失败区分 busy、cancelled、changed、summary、commit、persistence。前置失败与已经部分修改 surface 的失败不能同样宣称“没有副作用”；flush 失败也不等于内存中没有完成 bracket。Request-error recovery 只有 surface replacement generation 确实推进才有重试依据；取消仍优先。

## TokenMeter

TokenMeasurement 是 detached immutable snapshot，logRevision 表示它消费到的 Session event 数，不是磁盘 flush 水位。totalTokens 表示请求加响应压力，surfaceTokens 只表示当前 surface，不能互换。Route 的 image pricing 参与计量；不具备能力时是 heuristic，不能称为精确计费。

usage baseline 需要匹配 canonical request envelope 且有保守可复用的成功调用锚点，否则重新 estimated。surfaceDeltaTokens 可为负，代表压缩或缩短；不能当无符号累计计数。SurfaceNode 的顺序以 surface 为准，不以 durable seq 重新排序。

## Flush、inspection 与修复

session/event 的同步通知不等待磁盘。Persistence batching 从第一条 pending event 开始固定窗口，后续 append 不重置 deadline；后台失败保留待写事件，不无限自动重试。session/flush 是 ordering/error checkpoint，dispose 也执行最终 drain；batching 配置只限制故意等待，不承诺磁盘延迟上限。

冷日志崩溃在 open turn 中时保留已写历史并补 interrupted turn/end，不截断整轮。Live load 不得用 synthetic interruption 结束仍运行的 turn；inspect 可返回未闭合 live snapshot，冷 inspect 只做内存逻辑修复。prepare 的 publication handle 与 [冷读 observation](session-workspace-api.md#host-的冷读租约) 都有明确释放边界。

locate 返回可能尚不存在或尚未 flush 的 artifact hint，不证明内容最新。readRaw 是介质原文，不等于 inspect 的规范逻辑结果。不同 format version 与 unknown required event 用 unsupported-format 拒绝，不能一概称为 corruption 或静默丢弃。

## Canonical checkpoint policy

session-checkpoint-policy 无 Config，与 persistence backend 独立组合：在 adapter stream 构造前 flush request，在 top-level tool body 前 flush call，在 agent/pre-step flush 前一 step 结果。Nested PTC dispatch 复用外层 checkpoint，不凭空生成独立 durability barrier。

Flush 失败时 adapter/body 不得执行；tool flush 期间取消返回 ABORTED_BEFORE_DISPATCH。此策略保证 durable intent，不保证外部副作用 exactly-once；有 call 无 result 是未知 outcome，不自动重试。可支持 idempotency 的 Provider 使用 exec.callId；流式 chunk 仍依赖 batching，不能声称逐 chunk durable。

## 验证

覆盖 positional replacement、tool pairing、prune 后 summary 失败、注入与手工提交竞态、cancel/partial commit/flush failure、冷修复与 live 禁止修复，以及 usage anchor 失配。声明编译不能证明这些历史与失败分支。
