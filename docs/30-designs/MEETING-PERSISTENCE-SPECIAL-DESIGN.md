# Meeting Persistence Design

## Purpose

本文定义 Convivium 的 `Checkpointed Commit Log` 持久化算法，解决两个相互关联的问题：

1. 一次 Meeting 命令产生的状态变化、幂等结果和待执行副作用必须作为一个整体提交，崩溃后只能观察到“未提交”或“完整提交”。
2. 当前真相不能依赖每次重写持续增长的完整 Meeting 聚合，也不能依赖无限增长的历史日志。

算法把一次命令的全部权威结果收敛为一个有界 `Commit`，以一次原子 record 写入完成提交；再通过分页 checkpoint 和 log compaction 控制恢复成本与历史增长。其工程分类是 **log-structured persistence with checkpointing and log compaction**。

checkpoint 不是命令原子性的来源。它只是某个稳定序号上的已合成状态；只有一个固定小型 pointer 的原子替换负责发布新 checkpoint。任何一次底层存储调用都不得携带完整 checkpoint。

本文中的 commit 不限定为纯领域事件，因此本算法不是完整的 `Event Sourcing`；它也不是数据库在原地更新前使用的恢复日志，因此不称为 `Write-Ahead Log`（WAL）。

## Scope And Non-goals

### Scope

- Meeting 当前真相、commit tail 与 checkpoint 的组合关系。
- 单命令原子提交、顺序、幂等和崩溃判定。
- checkpoint 的有界分页、原子发布、恢复和安全 compaction。
- 算法对持久化适配器提出的最小行为边界。
- 单次写入、总量、并发 compaction 和垃圾回收必须保持的不变量。
- 外部副作用与本地权威提交之间的边界。

### Non-goals

- 不选择 SQLite、DSH `storage-domain` 或其他 backend，也不定义物理 table、domain、unit、文件路径或配置项。
- 不定义插件代码结构、record schema、错误码、迁移步骤、日志字段或完整测试矩阵。
- 不设计 Meeting bootstrap、Session ownership、effect lease、catalog discovery、archive retention 或 UI projection。
- 不建立通用数据库、通用 Event Sourcing framework、分布式日志或跨 Host 共识协议。
- 不承诺外部副作用与本地提交形成分布式事务或 exactly-once delivery。

上述插件实现细节由 [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 固定；接口契约不得反向改变本文的算法语义。

## Related Requirements And Interfaces

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)（当前已实现契约，不是算法定义）
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)

当前实现只通过 DSH Storage Domain 使用 package-private JSONL backend，且不启用双写、fallback 或遗留数据迁移。

## Responsibilities And Dependencies

### Abstract state model

对一个 Meeting，当前领域真相定义为：

```text
CurrentState(headSeq)
  = fold(Checkpoint(baseSeq), Commits(baseSeq + 1 ... headSeq))
```

算法只依赖以下抽象对象：

- `Commit(seq, payload, digest)`：一次已接受状态转换的完整、可重放、有界结果。
- `CheckpointGeneration(baseSeq, records, rootDigest)`：截至 `baseSeq` 的不可变合成状态，由多个有界 record 组成。
- `CheckpointPointer(generation, baseSeq, rootDigest)`：固定小型的当前 checkpoint 发布点。
- `headSeq`：从已发布 checkpoint 之后的最长连续 commit tail 推导出的高水位，不依赖另一个必须同步更新的 head record。

`payload` 至少能够重建该命令造成的状态增量、首次幂等结果和 pending effects。具体字段和编码属于接口与实现设计。

### Algorithm invariants

1. **Single-command atomicity**：一次命令的全部权威结果只由一个 `Commit` 表示；该 record 不存在则命令未提交，完整存在则命令已提交。
2. **Immutable history**：已提交的 `seq` 不得被不同内容覆盖；同 key、同 digest 的重试可以幂等成功，同 key、不同 digest 必须 fail loud。
3. **Continuous order**：commit 序号严格连续；gap、重复序号冲突或非法前驱都不能被静默跳过。无 checkpoint 时 seq 1 以 `(0, null)` 为前驱；published checkpoint 后第一条 tail commit 以 `(baseSeq, projectionDigest(checkpoint projection))` 为前驱；其余 commit 引用前一条 commit。
4. **Published checkpoint only**：只有 `CheckpointPointer` 指向的完整 generation 属于当前真相；未发布 generation 只是可回收数据。
5. **Monotonic publication**：新 pointer 的 `baseSeq` 必须大于旧值；迟到或并发的旧 generation 不得覆盖较新的 pointer。
6. **Bounded writes**：每次持久化调用只写一个经过真实编码后仍在硬上限内的 record；完整 checkpoint 必须拆分写入。
7. **Safe reclamation**：只有当前 pointer 已发布且恢复不再需要某条记录时才能删除；垃圾回收不能改变可恢复出的真相。
8. **One truth**：内存 projection 是持久真相的缓存；任何 backend 演进期间都不得出现双写或从两套真相中择优读取。

### Storage adapter boundary

算法不依赖数据库 transaction、SQL、DSH Domain 或文件 API。适配器必须向算法提供以下可观察语义：

- 原子写入或替换单个有界 record；崩溃后只能观察到完整旧值、完整新值或不存在。
- 按稳定 key 不可变追加 commit 和 checkpoint record，并检测同 key 内容冲突。
- 原子发布固定小型 checkpoint pointer，并保证发布顺序不回退。
- 按 Meeting 和序号读取、枚举 record，以及删除已证明无引用的 record。
- 提供经过实际 backend 编码与写入路径验证的单 record 大小上限。

适配器可以用原生 transaction、conditional write、进程内串行化或其他机制实现这些语义；机制选择不属于算法。若候选 backend 无法稳定兑现任一语义，则它不能承载本算法。

## State And Failure Handling

### Command commit

一次命令按以下逻辑顺序提交：

1. 在该 Meeting 的顺序边界内读取当前状态与 `headSeq`，完成授权、幂等和 expected version 校验。
2. 运行纯状态转换，形成一个有界 commit payload，并分配 `seq = headSeq + 1`。
3. 完成 canonical encoding、digest 和 record 大小校验。
4. 不可变追加该 `Commit`。持久化成功前不得更新权威内存 projection、执行外部副作用或返回成功。
5. 追加成功后才把 commit 应用于内存 projection，并允许后续工作观察它。

如果进程在追加返回前终止，恢复时读取同一 `seq`：record 不存在表示未提交；内容与 digest 一致表示完整提交；同 key 内容冲突表示存储不一致，必须隔离而不是猜测。

### Recovery

恢复按以下顺序进行：

1. pointer 不存在时使用 `baseSeq = 0` 的空 checkpoint；存在时读取它唯一引用的 generation。
2. 校验 generation 的完整性、顺序、大小边界和 digest；未被 pointer 引用的 generation 不参与恢复。
3. 从 `baseSeq + 1` 开始读取严格连续的 commit tail；第一条 tail commit 校验 checkpoint projection digest anchor，后续 commit 校验前一条 commit digest，然后逐条 fold。
4. 任一缺页、gap、内容冲突、版本不兼容或校验失败都必须 fail loud；不得返回看似可用的部分状态。
5. 完成恢复前不得接受新命令或投递 pending effect。

### Checkpoint and compaction

compaction 针对一个稳定切点 `compactThroughSeq`：

1. 在 Meeting 顺序边界内固定 `compactThroughSeq`，并捕获与该序号精确对应的不可变 snapshot；之后的新 commit 只进入 tail。
2. 流式把 snapshot 编码为多个不可变、有界 record。必要时使用多级有界索引，但任何单次调用都只写一个 record。
3. 写入一个有界 root manifest，证明该 generation 的 record 集、顺序、总量、`baseSeq` 和整体 digest。
4. 完整回读或等价验证 generation 后，原子发布固定小型 pointer。发布动作必须拒绝 pointer 回退或覆盖捕获之后已经发布的更新。
5. 发布成功后保留 `compactThroughSeq + 1 ... headSeq` 的 commit tail；只有重新按当前 pointer 证明记录不可达后才能 GC。

同一 Meeting 同时只能有一个可发布的 checkpoint generation，或由实现提供等价的并发排除与单调发布证明。迟到 generation 可以成为 orphan，但无权发布 pointer 或删除记录。

pointer 发布前崩溃时，旧 checkpoint 与全部 commits 仍是真相；新写 record 是 orphan。pointer 发布后崩溃时，新 checkpoint 已是真相，恢复从新 `baseSeq` 继续重放 tail。两种情况必须得到与 compaction 前等价的 `CurrentState`。

### Capacity boundary

- 单个 commit、checkpoint page、索引、root manifest 和 pointer 都必须有编码后硬上限。
- checkpoint 生成必须是流式或增量过程；API 不得接受完整 snapshot 并把它作为一次 backend 写入。
- 无法安全切分的原子值必须在接受产生它的原始命令前拒绝，不能等到 compaction 时才发现状态不可 checkpoint。
- 每个 Meeting 的可恢复总量、commit tail 和单个 checkpoint generation 必须有运行上限。
- 正常写入必须为完成一次 checkpoint 和回收崩溃 orphan 保留足够空间；不能等存储写满后才触发 compaction。

具体分页大小、阈值、reserve 计算、总量限制和拒绝错误属于适配器接口及实现设计。

### External effects boundary

外部调用不属于本地原子提交。命令产生的 effect 必须先以 pending 状态进入同一个 `Commit`；投递成功或形成终止失败后，再追加一个新的 commit 改变领域真相。实现必须使用稳定 delivery identity 和可恢复重试，但 lease、worker 和接收端幂等机制不由本文规定。

## Security And Observability

- record identity 只能由经过验证的 Meeting identity、内部序号和 generation 派生；外部调用方不能指定 backend 路径或物理存储名称。
- checkpoint、commit、幂等结果和 pending effect 只能由插件后端持久化边界访问，不能直接暴露给 Plugin Frontend 或 Agent。
- 实现必须能够观察 commit 大小、tail 长度、checkpoint generation 大小、pointer 发布、恢复耗时、orphan 总量和完整性失败；具体日志字段和指标名称不属于算法。
- 日志不得记录隐藏推理、完整私聊或不必要的敏感 payload。

## Acceptance

1. crash-before-commit、crash-during-commit 和 crash-after-commit 都只能恢复为未提交或完整提交；不存在部分状态、部分幂等结果或部分 pending effect。
2. 相同请求和相同 commit 的重放幂等；同序号不同内容、tail gap 和非法前驱 fail loud。
3. 任意大小在允许范围内的 checkpoint 都通过多个有界 record 写入；不存在一次携带完整 checkpoint 的 backend 调用。
4. pointer 发布前后任一点崩溃，都恢复出与未 compaction 前等价的当前状态、幂等结果和 pending effects。
5. 并发或迟到 compaction 不能使 `baseSeq` 回退，不能覆盖较新 pointer，也不能删除当前恢复仍需要的 record。
6. Meeting 接近正常写入上限时仍有足够空间完成 checkpoint；崩溃产生的 orphan 有界且可在不破坏当前真相的前提下回收。
7. checkpoint 缺页、digest 损坏、record 超限、版本不兼容和恢复时非法数据都有 fail-loud 验证。
8. 同一组算法契约测试可以用于任一候选适配器；切换实现前能够证明运行路径只有一个 Meeting 持久化真相。
