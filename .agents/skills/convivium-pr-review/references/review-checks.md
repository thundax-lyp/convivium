# Convivium PR Review Checks

## 必经基础检查

对全部 changed hunks 执行以下检查，不因未命中专项模型而跳过：

- **正确性**：边界、空值、非法状态、错误转换、异常吞噬和默认值。
- **运行时完整性**：并发、生命周期、事务、幂等、资源释放、失败恢复和配置。
- **安全性**：输入校验、权限、路径所有权、跨 meeting/team 访问、注入、敏感信息和日志。
- **兼容性**：已有数据库、事件、接口、枚举、配置、package exports 和失败语义。
- **架构维护性**：domain、runtime、repository、dsh、transport、projection、client 的职责和依赖方向。

只有 changed-file ledger 能证明所有 changed hunks 完成基础检查时，coverage 才可能 complete。

## 运行时检查

### Producer-to-sink tracing

当 command、request、response、schema、状态、配置、权限字段或协议结构改变时，使用 `rg` 找到所有读取点，追到首个真实 validator 和最终 consumer/sink，并检查历史数据、错误路径、fallback 和消费测试。

### 会议时序

当 Turn、speaker、attempt、timeout、retry、interrupt、reassign 或异步回写改变时，推演：

1. 旧请求尚未完成时新请求产生；
2. 新请求生效后旧结果迟到；
3. 同一 request 重复提交；
4. 前序正式发言提交与后续上下文读取交错。

### 权限与身份

对照 DSH caller、Participant、Speaker、Controller、Captain、capability、teamId 和 meetingId 的真实来源。客户端传入的显示名称、actor、scope 或 subject 不能替代服务端身份事实源。

### 持久化与恢复

检查 `BEGIN IMMEDIATE`、expected version、receipt、event、outbox、migration、lease、recovery、orphan locator 和 archive 的事务/生命周期语义。确认 DSH 副作用只在提交后发生，重试不会重复会议事实。

### 投影与事实边界

确认 Plugin Frontend 只消费类型化投影，不能直接访问 SQLite、Session 或任意文件；Markdown 只能从 SQLite 单向派生；DSH-owned Session Events 不被 Convivium 复制成另一套事实。

### 完成和归档

检查 required review、risk disposition、proposal revision、partial/cancel/failure、少数意见、非阻塞事项，以及 `archiving`、capability revoke、Activation drain、`archived` 的顺序。

## 模块专项

### `plugin/src/domain`

- 不依赖 DSH、SQLite、HTTP、React 或文件系统。
- 状态转换、发言权、完成判断和权限规则是否纯粹、可测试、无隐藏 I/O。

### `plugin/src/runtime`

- 是否是公开命令的唯一应用服务入口。
- 调度、outbox、mail、recovery、archive 是否保持清晰顺序和失败语义。

### `plugin/src/repository`

- schema/migration 是否连续、事务化、可拒绝未知版本。
- 聚合状态、不可变事件、receipt 和 outbox 是否原子提交。

### `plugin/src/dsh`

- 是否只实现 Runtime ports，不直接写会议领域状态。
- Session、TeamTask、caller 和 capability 是否严格限定在会议生命周期内。

### `plugin/src/tools` 与 `plugin/src/http`

- 是否只负责 transport 解析、caller binding、Runtime 调用和错误编码。
- 是否存在绕过协议或 Runtime 的第二个写入口。

### `plugin/src/projection` 与 `plugin/src/client`

- projection 是否只读取已提交事实。
- client 是否只使用公开类型化路由和投影，不承担状态真相或权限判定。

### `plugin/tests`、CI、scripts 和 docs

- 测试是否覆盖失败、权限、并发、重复、恢复、归档和历史数据，而不只是 happy path。
- CI、package contract、readiness 和 skill 是否检查真实运行对象，而不是仅检查文件存在。

## Findings 门槛

只报告当前 diff 引入、暴露、连通或放大的可操作问题。P0 为严重安全/数据损坏/不可用；P1 为核心错误或高风险回归；P2 为局部真实缺陷；P3 为确实值得修改的结构或验证缺口。纯风格偏好、无依据推测和 diff 外既有问题不报告。
