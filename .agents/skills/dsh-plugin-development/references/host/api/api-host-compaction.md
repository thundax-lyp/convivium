# Host 会话压缩对象

适用 `@deepseek-ai/dsh-compaction@0.2.0-rc.2`。该包公开 `ctx.compaction` 的抽象契约，不包含默认压缩器；必须装载一个具体 backend 才会压缩。见 [实现与调用压缩](../how-to/how-to-host-compaction.md)。

## CompactionEngine

`CompactionEngine` 是向 Cordis 注册 `ctx.compaction` 的抽象 `Service`。backend 必须实现 `compactIfNeeded(agent, trigger, signal)`、`compactNow(agent, signal, sourceCommandId?)` 和 `compactRegion(start, end, agent, signal?)`。自动调用可返回 `null` 表示没有安全且有用的范围；显式区域使用当前 surface 的位置顺序而非数值 seq 顺序，并须保持工具调用与结果配对。模型摘要调用要传递取消信号。

成功压缩要先追加日志中的 `compaction/start`，再记录 `compaction/summary`，紧邻追加携带 `surfaceOp: replace` 的 `user/message` 摘要节点，最后以 `compaction/end` 释放锁。`compaction/*` 本身不进入模型 surface；被遮蔽的原事件仍保留在 Session 日志。失败也必须按源码契约尝试关闭 bracket，不能给模型历史留下未记录的替换。

## CompactionTrigger

**公开导出**：`CompactionTrigger` 来自 `@deepseek-ai/dsh-compaction`。
自动触发仅有 `pressure` 与 `context-overflow`。前者依据持久的最近一次路由请求和 token 压力，后者可在通常阈值下尝试有用的平衡缩减；单个不可分单元或请求 envelope 超大时，surface 压缩不能解决。

## CompactionResult

**公开导出**：`CompactionResult` 来自 `@deepseek-ai/dsh-compaction`。
结果包含 `compactionId`、起止/摘要 seq、被遮蔽的范围与 seq 集合、`summary` 内容及 token 估值。消费方应使用这些记录解释压缩了什么，不能仅比较压缩前后的消息长度。

以下成员是该对象的公开契约：

- `endSeq: SessionSeq`：被压缩区间结束 seq。
- `shadowedRange: { start: SessionSeq; end: SessionSeq; }`：被摘要遮蔽的连续日志范围，含起止 seq。
- `shadowedSeqs: SessionSeq[]`：实际被遮蔽的事件 seq 清单；不能用连续范围代替精确清单。
- `shadowedTokenCount: number`：本次被遮蔽内容估算的 token 数。
- `sourceCommandId: CommandId | undefined`：触发手动压缩的命令 ID；自动压缩时可缺省。
- `startSeq: SessionSeq`：被压缩区间起始 seq。
- `summarySeq: SessionSeq`：写入摘要事件的 seq，可用于追溯摘要。

## ManualCompactionError

`compactNow` 的预期失败以稳定 `code` 区分忙、取消、选择变化、摘要/缩减、提交与持久化失败。开始前拒绝不应写 bracket；开始后失败会在日志留下结果。调用方按 code 报告用户，不依赖错误文案。

以下成员是该对象的公开契约：

- `name: "ManualCompactionError"`：错误类型判别名；细分失败原因仍以 code 为准。

## compactCheckpointSource

**公开导出**：`compactCheckpointSource` 来自 `@deepseek-ai/dsh-compaction`。
压缩摘要的 `user/message` 必须使用携带本次 `CompactionId` 的 checkpoint source；`isCompactCheckpointSource` 供读取方在恢复、克隆后辨识，而不依赖某个 backend 名称。
