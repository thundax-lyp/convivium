---
name: convivium-module-review
description: Review the complete current implementation of a Convivium plugin module or bounded path for correctness, architecture boundaries, meeting protocol safety, persistence, lifecycle, security, and tests. Use when the user asks for a module or implementation review; do not modify code.
---

# Convivium Module Review

对指定的 Convivium `plugin/` 模块或路径做当前状态的系统性 Code Review，不以 Git diff 为边界，也不修改代码。

## Scope and target

- 用户给出路径时，将其作为唯一审查范围；只读取直接依赖来解释调用关系。
- 用户只给模块名时，在 `plugin/` 内定位唯一候选；有多个候选时先澄清，不扩大到全仓。
- 先排除 `node_modules/`、`lib/`、构建产物和临时文件，再建立目录、入口、依赖和主要数据流。
- 不把 `../kuzhambu` 或其他相邻项目当作源码、协议或兼容基线。

## Required context

先读取：

1. `docs/AGENTS.md`
2. `docs/00-governance/ARCHITECTURE.md`
3. `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
4. `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
5. `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
6. `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`

涉及验证、TODO 或文档收口时，再读取对应治理文档。只加载与目标路径相关的最小材料。

## Review model

先判断目标属于哪类职责：

- `domain`：Meeting、Participant、Turn、权限和完成事实的纯领域规则。
- `runtime`：命令入口、逐一调度、outbox、mail、恢复和归档编排。
- `repository`：SQLite schema、migration、事务、event、receipt、outbox 和 locator。
- `dsh`：AgentSession、TeamTask、caller binding 和 capability 的受控适配。
- `tools/http`：transport 解析、授权绑定、错误映射和协议编码。
- `projection/client`：只读状态投影、UI 状态展示和类型化路由调用。

检查依赖方向：`domain` 不依赖 DSH、SQLite、HTTP 或 React；`repository` 不调 DSH；`dsh` 不写领域状态；`client` 不访问 host、数据库或任意文件；公开写操作是否最终经过唯一 Runtime/repository 事务入口。

## Convivium-specific checks

只报告有触发条件和实际影响的发现，重点检查：

- 单一有效发言权、顺序 dispatch、前序正式发言可见性，以及重新分配后迟到结果隔离。
- 每个会议身份使用独立 continuable AgentSession；不同会议、身份、授权范围不能静默共享 Session。
- caller identity、Speaker、Controller、委托范围和 capability 是否来自受控 DSH 上下文，而非客户端显示字段。
- `requestId + commandKind + callerBinding` 幂等、expected version、receipt、event 和 outbox 是否在同一事务语义下成立。
- DSH 副作用是否只发生在事务提交之后；重复投递、超时、失败和重试是否不会重复正式会议事实。
- TeamTask 结果、Agent 内部工具过程、私聊和隐藏推理是否被错误写入 transcript 或完成状态。
- 完成判断是否遵守“业务完成优先于硬限制”，required review、风险处置、少数意见和未解决事项是否保持语义。
- 恢复、orphan Session、租约、archive、capability revoke、Activation drain 的顺序和会议边界。
- Markdown 是否只能从 SQLite 单向派生，不能成为状态、授权、恢复或归档完成的事实源。
- 输入校验、路径所有权、越权、敏感信息日志、错误语义和资源关闭。
- 成功路径、失败路径、边界、并发/重复执行和恢复测试是否锁定了需求中的验收标准。

不要因为没有使用某个具体 Skill、Tool、MCP、Prompt、隐藏推理或调用顺序而报告问题；Convivium 的协议必须对这些 Agent 内部实现保持独立。

## Output

先给模块概览：职责、入口、主要数据流、依赖、公开 API 和测试覆盖。然后按优先级输出 findings：

```md
## [P0/P1/P2/P3] 标题

- 类型：正确性 / 架构 / 接口 / 生命周期 / 持久化 / 安全 / 性能 / 测试
- 文件：`plugin/...`
- 行号：最小范围
- 触发条件：
- 影响：
- 原因：
- 建议：
- 关联需求或调用方：
```

没有明确问题时说明“未发现达到报告门槛的 finding”，并列出未能验证的边界。另列 `Open questions`，不要把不确定推断写成缺陷。不要提交修复补丁、格式化代码或自动运行高成本外部操作。
