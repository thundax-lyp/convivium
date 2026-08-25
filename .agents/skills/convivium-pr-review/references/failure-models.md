# Convivium PR Review Failure Models

每次从以下模型中选择 1–3 个与当前 diff 最相关的主模型。模型用于决定追踪路径，不是按关键词机械触发全部检查。

## A. 会议协议与契约链路失效

适用于 command、request、response、protocol type、状态、身份、发言提交、proposal、decision、mail 或 TeamTask result 的变化。

检查 source of truth、producer、adapter、首个 validator、最终 consumer/sink、失败映射、历史值和真实消费测试。特别确认 Agent 内部 Skills、Tools、MCP、隐藏推理和调用顺序没有变成 Convivium 协议依赖。

## B. 单一有效发言权与时序失效

适用于 Turn plan、speaker dispatch、submit、timeout、interrupt、retry、reassign、followup、outbox 或异步回写变化。

推演：旧请求尚未结束时产生新请求；新请求生效后旧结果迟到；同一请求重复提交；前序发言尚未提交时后续身份读取上下文。确认最多一个有效请求以及旧 attempt 不得写入正式事实。

## C. 身份、权限与 capability 真相源错位

适用于 caller resolver、Participant、Speaker、Controller、Captain、Session owner、meeting/team path、capability 或 client 操作变化。

确认身份来自真实 DSH caller context，而不是客户端显示字段；跨会议、跨团队、跨授权范围不能访问或操作资源；代理发言保留实际 Controller、委托范围和确认状态。

## D. SQLite 状态、幂等与恢复失效

适用于 schema、migration、repository、transaction、expected version、receipt、event、outbox、lease、recovery 或 locator 变化。

确认领域事实、事件、receipt 和 outbox 的原子性；DSH 副作用只在提交后发生；重复 request、hash 冲突、回滚、重投、未知 schema、部分创建和插件重启不会产生重复或越界事实。

## E. Session 生命周期与归档失效

适用于 Session create/followup/interrupt/drain、启动扫描、关闭、archive、revoke 或 Activation 变化。

检查创建中断后的 orphan 归属、恢复边界、跨 meeting/team 误操作、`archiving` 禁止继续讨论、capability revoke 与 `drainContinuableChildren` 顺序，以及 `archived` 的完成条件。

## F. 完成判断与事实边界失效

适用于 completion、required review、risk disposition、acceptance、partial completion、cancel、failure、transcript 或 projection 变化。

确认 TeamTask completed 不等于 accepted 或 meeting completed；自然语言声明不直接覆盖正式状态；新 proposal revision 不继承旧立场；少数意见、非阻塞后续事项和已接受风险保持可审计。

## G. 测试伪覆盖与治理门禁失效

适用于测试、CI、package contract、skill、PR workflow、readiness 或验证脚本变化。

检查是否只验证 happy path、构造结果或文件形状；是否遗漏失败、权限、重复、恢复、历史数据和交错时序；脚本实际检查的对象是否就是其声称约束的对象；失败、中断或状态过期后是否停止并保留可审查状态。
