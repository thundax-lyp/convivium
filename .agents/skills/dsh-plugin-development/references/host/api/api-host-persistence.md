# Host Session 持久化对象

适用 `@deepseek-ai/dsh-session-persistence@0.2.0-rc.2`。它定义后端无关的 Service 和句柄接口；随产品交付的 JSONL 后端是一个实现。一般插件消费已挂载后端；只有确需新的存储机制时才继承抽象类。见 [实现持久化后端](../how-to/how-to-host-persistence.md)。

## SessionPersistence

**公开导出**：`SessionPersistence` 来自 `@deepseek-ai/dsh-session-persistence`。
具体子类经 `super(ctx)` 注册为 `ctx.sessionPersistence`。`create(header, options?)` 新建存储会话并取得写所有权；`open(id, 'read' | 'write', options?)` 打开已有会话，写模式必须原子抢占单写者，读模式不取得所有权。`stat(id)` 仅取头与 opaque revision，`list()` 枚举可见快照；不能把 revision 当作全局序号。`flush()` 等待服务实例所有活跃写句柄完成持久屏障，失败按会话聚合，不能在第一处失败时跳过其他句柄。存储实现必须在写句柄关闭时排空并释放所有权。

## SessionHandle

**公开导出**：`SessionHandle` 来自 `@deepseek-ai/dsh-session-persistence`。
句柄公开 `id`、`header`、`access`、`inheritedEventCount`；`read(offset?, length?, options?)` 返回事件切片与其 `eventState` 所有权标记。写句柄的 `append(events, options?)` 只接受从已存储 next-seq 开始的连续批次；完成仅保证本后端实例内可见，`flush()` 才是崩溃后的持久承诺。`close()` 幂等且不可取消；读句柄释放资源，写句柄还必须排空。已关闭句柄后续操作失败；读句柄不能写；失去写所有权不能继续追加。

## SessionPersistenceSnapshot

**公开导出**：`SessionPersistenceSnapshot` 来自 `@deepseek-ai/dsh-session-persistence`。
`stat` / `list` 的快照含会话头与后端生成的 `revision`。同一服务实例、同一 Session ID 下相等的 revision 可解释为日志未变；不相等只表示需要重新读取，不承诺变化内容或跨实例可比较。要获取事件必须打开句柄读取，快照不能代替历史校验。

以下成员是该对象的公开契约：

- `header: SessionHeader`：与快照事件和投影对应的 SessionHeader；恢复时不可与其他快照头混用。
