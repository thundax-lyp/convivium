# 会议编排范围控制专项设计

## 1. Purpose

本文定义会议编排增量实现中的范围控制规则，防止一个有界闭环顺带改写稳定路径、引入无当前消费者的机制，或把内部实现选择提升为跨边界契约。

本文约束设计和实现方式，不删除正式需求，也不把暂缓机制定义为永久产品 Non-goal。需要引入例外时，必须先形成独立需求或设计依据及可验收边界。

## 2. Scope And Non-goals

### 2.1 Scope

- `Meeting Runtime`、Manager planning、Turn lifecycle、delivery、recovery 和相关测试的增量实现。
- RUNBOOK、专项设计和实现 PR 的范围审查。

### 2.2 Non-goals

- 不替代正式需求、接口契约或会议编排主设计。
- 不禁止未来实现 timeout、完整 cold recovery、诊断协议或其他已确认能力。
- 不规定具体类名、目录拆分或错误对象继承结构。

## 3. Related Requirements And Interfaces

- 正式需求：[`../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)。
- Agent 间会议协议：[`../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)。
- Meeting storage 契约：[`../20-interfaces/MEETING-STORAGE-INTERFACE.md`](../20-interfaces/MEETING-STORAGE-INTERFACE.md)。
- 会议编排主设计：[`MEETING-ORCHESTRATION-DESIGN.md`](./MEETING-ORCHESTRATION-DESIGN.md)。

上述文档决定产品和跨边界语义；本文只约束如何按有界增量实现它们。

## 4. Responsibilities And Dependencies

每个增量实现必须满足以下规则：

1. **保持既有路径稳定**：新增 `selectionMode` 或调度分支必须增量接入。未经独立确认，不得重写与当前目标无关的 `round_robin` 或其他已工作路径。
2. **只持久化有语义的状态**：同一 command transaction 内、外部不可观察且对恢复无价值的中间状态不得进入 canonical state；只提交事务结束后的领域状态、必要事件、receipt 和 outbox。
3. **契约止于可观察行为**：接口规定输入、输出、授权、幂等和失败语义。没有跨模块消费者时，不得强制内部 Error 子类、结果包装或同义协议类型。
4. **机制必须有当前证据价值**：新增 adapter、状态机、计数器、timer、rebind 或日志 schema，必须由当前需求或接口契约、架构或安全不变量、可复现失败、必要隔离边界，或当前范围内的消费者及验收点证明；仅有假设性未来用途不足以引入。单一消费者不自动构成过度设计，仍需判断该机制是否提供必要隔离或跨 command 语义。
5. **横向能力独立收口**：Speaker timeout 自动推进、resident parent 重绑与自动续投、用户级恢复入口和专用诊断协议，不得顺带进入其他竖切。实现它们前必须分别确认触发条件、状态转换、失败语义、恢复边界和验收证据。
6. **验证按证据价值分层**：真实 DSH profile 只覆盖必须依赖真实 provider、Session 或 plugin composition 的代表性路径；确定性状态分支由单元或 integration test 覆盖。重复的真实运行路径必须证明其独有证据价值。

第 5 条列出的能力是当前已识别的高扩张风险示例，不是封闭清单。

## 5. State And Failure Handling

- 新状态或字段必须能改变跨 command 行为、恢复结果、授权判断或公开 projection；否则保持为事务内局部值。
- 当前闭环无法安全处理的失败必须 fail closed，并保留既有 receipt/outbox 诊断事实；不得借故创建自动跳过、隐式降级或新恢复状态机。
- 若完成当前目标必须引入本文件限制的机制，应停止扩大范围，先补充独立依据和验收标准。

## 6. Security And Observability

- 范围收窄不得弱化 caller binding、capability、ownership、stale attempt 或 delivery 幂等校验。
- 观测字段以现有领域事件、receipt、outbox 和正式接口为准。仅供单一实现点使用的日志格式不得提升为协议。
- 测试替身不能代替真实 DSH profile 对 provider、Session ownership 或 plugin composition 的验证；真实 profile 也不能代替确定性失败分支测试。

## 7. Acceptance

一个增量设计或实现只有同时满足以下条件，才符合本文：

1. 每个新增机制都能定位到当前需求或契约、已确认不变量、可复现失败、必要隔离边界，或当前消费者和验收点中的至少一类证据；没有机制仅以未来可能使用为依据。
2. 未改写与目标无关的稳定路径。
3. 未持久化无恢复或可观察价值的瞬时状态。
4. 未把内部实现形状误写成跨边界契约。
5. 暂缓能力已明确 fail-closed 边界，且未被描述为已实现。
6. 单元、integration 和真实 DSH profile 各自只承担其能够证明的范围。
