# Convivium 角色与职能盘点（讨论稿）

> 状态：讨论稿，不作为实现依据。本文盘点当前需求、接口、角色 Definition 与实现所表达的职责，供后续调整角色边界时讨论；已确认结论须迁移至 `docs/10-requirements/`、`docs/20-interfaces/` 和 `docs/30-designs/`。

## 角色层次

Convivium 需要区分四类概念，避免把模型、工具权限和会议职责混为一谈：

| 层次 | 当前对象 | 含义 |
| --- | --- | --- |
| 可信调用方 | local controller | 本机受控入口；不是 Captain、Manager 或任何 Meeting identity。 |
| 会议身份 | Captain、Manager、Contributor、Evidence Reviewer | 写入 MeetingState、拥有授权边界的四种 role。 |
| 专业 Definition | Manager、Domain Architect、Runtime Engineer、Protocol and UI Engineer、Verification Reviewer、GitHub Research Analyst、arXiv Research Analyst | DSH Agent 的预设、Skill、工具限制和专业范围；其中后五项是 Contributor 的专业化实现。 |
| 临时执行者 | Reviewer one-shot worker | Reviewer 创建的短生命周期核验工作者；不是 Meeting identity，不能拥有 Meeting command authority。 |

## 权限与职责矩阵

| 角色/对象 | 主要职责 | 可形成的正式事实或命令 | 明确不负责 |
| --- | --- | --- | --- |
| Captain | 建立会议；提供并维护宏观 Objective/Agenda；对新 Agenda candidate 作最终正式处置；处理 Captain 专属问题、风险、决策和结束权力。 | `create_meeting`；Agenda candidate 的 promote/park/reject；Question/Issue 的 Captain 处置；Decision、Risk、结束等 Captain 专属操作。 | 不逐轮决定检索问题、证据缺口或贡献分配；不替 Manager 做微观调度；不替 Reviewer 审核 Evidence。 |
| Manager | 已授权 Agenda 内的求解编排者：识别待解问题、证据缺口、依赖和路径；决定每轮的 `roundGoal`；开轮、处置举手、发布轮次；在轮后规划继续、停止、等待或提出候选 Agenda；识别并推荐所需身份。 | `open_round`（含 `roundGoal`）；`dispose_hand_raise`；`publish_round`；`recommend_identity`；Manager plan。 | 不创建、提升、替换或处置 Agenda candidate；不写正式论证、Decision、Risk 或完成事实；不阅读/批准 Evidence 正文来代替 Reviewer；不自行扩大权限或创建任意角色。 |
| Contributor（通用） | 围绕当前 Agenda 和 Round goal 提出可整合的观点、证据、推导、质疑、补证、修订和总结；可处理自己的异步工作。 | 申请发言/举手；在被接纳的 Contribution 中提交 Evidence；在授权下提交其余贡献或 MeetingTask 结果。 | 不代表他人；不自行获得贡献授权；不直接发布未审内容；不处置 Agenda candidate、Decision 或风险。 |
| Evidence Reviewer | 独立评估确切 Evidence version 的来源、可信度、完整性和支持度；定义核验范围、反例和限制；向作者送达审核结果。 | 对每个独立 claim 的 immutable version 创建一个 one-shot worker；completed 结果通过 `submit_evidence_review` 逐版本提交。 | 不写 Contributor Evidence；不决定 Agenda 或 Round goal；不接受风险/决策；不得把未完成 worker 结果写成 Review；worker 不得调用任何 Meeting command。 |
| local controller | 作为单 Host 的受控本地用户入口，执行其被接口明示允许的控制与恢复操作；提供可信时间、ID、Storage/Runtime 边界。 | local-controller 允许的 pause/resume/end/archive 等受控操作。 | 不是 Captain 的别名；不能以本地控制替代 Agent 的 Agenda candidate、Round、Evidence 或审核职责。 |
| DSH Host / Meeting Runtime | 执行确定性身份、版本、授权、状态、期限、原子提交、outbox、恢复和 capability 撤销；将 Agent 结构化输入转为领域状态。 | 原子 Meeting commit、receipt、effect/outbox、Session ownership/provisioning、归档和恢复。 | 不进行语义性研究判断；不从隐藏推理或 Session tool history 推导 Meeting 事实；不替任一角色宣布业务结论。 |

## Captain 的完整职能

1. 创建会议，提供初始 Objective、初始宏观 Agenda、参与者和身份责任。
2. 维持宏观范围：新 Agenda 只能经其结构化 `promote`、`park` 或 `reject` 处置。
3. 对 Agenda candidate 的正式状态承担唯一责任；`promote` 只产生 pending Agenda，不自动替换 active Agenda。
4. 处理 Captain 专属的 Question/Issue 处置、Decision 接受/变更和风险处置。
5. 在接口允许的范围内结束会议或作出需要本地用户确认的重大范围变更。
6. 不承担每轮研究题、证据缺口、Contributor 分配和轮后路径的日常调度。

## Manager 的完整职能

1. **问题建模**：围绕当前、已授权的 Agenda 识别待解问题、关键未知、阻塞异议和 evidence gap。
2. **路径规划**：将复杂目标组织为有依赖关系的调查、比较、验证与整合路径；独立问题可并行，有依赖的问题顺序推进。
3. **轮次目标**：在每次 `open_round` 中形成并持久化 `roundGoal`：本轮问题、证据缺口、预期可观察产出。
4. **轮次启动**：确认当前 Agenda 可开轮，固定公开基线，并开启 Round。
5. **贡献编排**：根据问题、角色责任、已有工作、阻塞项和证据缺口处置举手；接纳后才建立 Contribution。
6. **身份缺口识别**：读取安全 Catalog，提出身份推荐，写明预期贡献与待补证据；不得自行授予能力或绕过 provisioning。
7. **轮次收口**：在贡献完成、必需 Review 已提交且 Round 可收口时发布；不以自身对正文的偏好替代审核。
8. **轮后决策**：基于已发布事实决定继续当前 Agenda、停止当前 Agenda、等待必需身份、开启下一轮或提出 Agenda candidate，并说明理由。
9. **范围控制**：发现漂移、重复或无进展时重新聚焦、修订路径或建议结束；不把未解决的关键分歧宣布为已解决。
10. **授权边界维护**：不处置 Agenda candidate、不接受 Decision 或风险、不宣称 Meeting 已完成、不冒充 Contributor 或 Reviewer。

## Contributor 专业 Definition

| Definition | 会议身份 | 专业职责 | 证据范围 |
| --- | --- | --- | --- |
| `convivium.domain_architect` | Contributor | 领域状态、不变量、需求/设计一致性、completion/termination 语义。 | repository |
| `convivium.runtime_engineer` | Contributor | DSH Runtime、事务、outbox、恢复、AgentSession 生命周期。 | repository |
| `convivium.protocol_ui_engineer` | Contributor | Protocol Schema、Tool、HTTP、projection 与 Client UI 的事实/权限边界。 | repository |
| `convivium.github_research_analyst` | Contributor | 官方 repository、源码、commit、issue、PR、release 与版本演进。 | github |
| `convivium.arxiv_research_analyst` | Contributor | 论文版本、方法、实验结论、局限及其适用边界。 | arxiv |

五者共用 Contributor 的授权边界：只对自己的 Contribution 负责，不得自动把外部材料、未验证命令或自然语言判断升级为正式决定。

## Evidence Reviewer 与 worker 的职责分离

1. Reviewer 是唯一的会议审核身份，读取待审 immutable Evidence version 与固定的公开 baseline。
2. 对每个 pending version，Reviewer 只能创建一个独立的 DSH native one-shot worker，不创建 replacement worker。
3. worker 记录核验方法、结果和限制；它不拥有 Meeting identity、Contribution 或 Meeting command authority。
4. Reviewer 只收集 completed 且可规范化的结果；每份结果必须精确匹配该 version 的持久 claim，随后以 `submit_evidence_review` 独立提交。一个 version 失败或取消不阻塞同轮其它 version。
5. Review 是独立判断：作者结论、链接存在、或“尚未运行的命令”不能被写成核验通过。

## 已确认边界与后续问题

| 议题 | 当前观察 | 需确认的问题 |
| --- | --- | --- |
| `roundGoal` | 已确认由 Manager 在 `ManagerPlan(kind=open_round)` 中提交 `question`、`evidenceGap`、`expectedOutput`，`open_round(planId)` 将其固化到 Round。 | 是否需要在未来把 `roundGoal` 直接纳入 publication 展示。 |
| Manager plan 与 Round | 已确认两者都保留：plan 是可审计意图，Round 是消费该 active plan 后形成的执行事实。 | 非 `open_round` plan 的后续消费语义仍可继续收窄。 |
| Manager 的身份推荐 | Manager 能推荐身份，但 Catalog、provisioning 与实际调度存在多个阶段。 | 推荐何时应被强制转换为阻塞条件，何时只作为建议。 |
| Contributor 专业化 | 五个专业 Definition 都是 Contributor，但工具和数据源能力不同。 | 是否需要按证据来源、方法或交付物重新组合，而不是按传统工程职能划分。 |
| Reviewer 的独立性 | Reviewer 对 Evidence 质量负责，但不管理研究路径。 | 是否需要增加“方法审核”或“综合审核”，以及是否仍由同一 Reviewer 承担。 |
| Captain 与 local controller | Captain 是会议身份；local controller 是可信入口。 | 哪些重大范围调整必须由本地用户确认，哪些应保留 Captain-only。 |

## 相关依据

- [会议编排需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [证据轮次需求](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)
- [Domain Design](../30-designs/DOMAIN-DESIGN.md)
- [当前角色 Definition](../../plugin/config/definitions.json)
