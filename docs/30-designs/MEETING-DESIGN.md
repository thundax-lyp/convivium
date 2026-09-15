# Meeting Design

## Purpose

本文是 Convivium 会议领域与业务编排的唯一设计真相源。它把已确认需求落实为最小的领域事实、业务顺序、可见性、完成、失败、持久事实与归档边界。

## Scope And Non-goals

本文覆盖 Meeting、身份、目标、议题、Round、Contribution、Evidence、Review、Publication、正式记录、提案、决策、风险、任务、完成、终止和归档。

本文不定义 DSH 插件装配、Session 调用、角色资源、HTTP/Remote、UI、数据库物理布局、checkpoint 或 compaction 算法。它不保留旧的串行 Turn、SpeakerAttempt、直接提交即公开或旧贡献切片。

## Related Requirements And Interfaces

- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- [Meeting Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)

## Domain Facts

`Meeting` 是唯一聚合根，保存稳定 ID、版本、召集人、ObjectiveContract、生命周期、身份、议题、Round、Contribution、EvidencePackage、Review、Publication、正式记录、提案、立场、决策、问题、风险、任务、完成事实、终止和归档。

所有对象只属于一个 Meeting，所有 ID 都是不透明稳定标识。已提交 Meeting 是唯一领域事实源；状态读取、归档和展示是只读派生，不能回写或猜测事实。

### Identity and objective

`MeetingIdentity` 是可审计会议身份，不等同于 Agent、用户账号或 Session。它保存 identityId、显示名、职责、议题/审核/风险权限、必需关系和角色/模板溯源。角色区分 convener、captain、manager、contributor 和 evidence_reviewer；每个正式产物必须记录 actor identity。

`ObjectiveContract` 保存目标、预期输出、验收条件、硬约束、可接受风险等级和仍需的证据、审核、决策或接受事实。新 Meeting 的目标、议程、提案、Issue 和 CompletionFact 均必须从未完成、未接受状态开始。

### Agenda, questions and issues

`AgendaItem` 保存标题、待解决问题、与目标的关系、负责人、状态和所需产物/审核。任一时刻恰有一个 active AgendaItem。

`AgendaCandidate` 保存标题、来源、理由和 pending/promoted/parked/rejected。只有 Captain 的 promote 能创建 pending AgendaItem；Manager 建议或自然语言提及不会处置 candidate。`parkingLot` 是按 candidate 稳定 ID 排序的只读派生，逐项公开并归档 id、title、reason、status；pending candidate 不阻止结束。

`Question` 保存提问者、关联议题、文本、所影响的 output/criterion/constraint、是否阻塞、状态和可选的正式回答引用。`Issue` 保存问题、来源、关联议题、受影响目标事实、风险等级、负责人、处置与理由；它区分 blocking、follow-up、pending discussion、accepted risk 和 out of scope。

### Round, contribution and evidence

`Round` 保存所属 AgendaItem、固定 publicBaseline、状态、参与记录、期限和 Publication。打开 Round 时固定此前已公开的正式内容及最终证据版本；本轮后来提交的任何内容都不能改变这个基线。

Contributor 初次举手被拒绝或暂缓时不创建事实；获接纳后产生一个唯一 `Contribution`，并进入收口集合。Contribution 保存举手说明、接纳时间、状态、退出原因、期限、当前 evidencePackageId、实质补充计数以及必要的明确响应事实。每位 Contributor 同时最多一项有效贡献工作。

`EvidencePackage` 在同一 Contribution 内保持稳定 ID。其不可变 `EvidenceVersion` 包含直接观察、解释/推断、获取或核验方法、反证条件、不确定性、限制、主张—证据—推断关系及带精确位置的 EvidenceMaterial。EvidenceMaterial 保存原始来源、版本、定位、复核条件、限制和共享数据依赖；未知或不适用必须明确标记。初次提交和格式补正不计次数，之后最多两次获接纳的实质补充；新版本使旧审核失效。

`Registration` 明确关联 EvidenceVersion、Manager、结果、缺失要素/定位和时间；它只能检查格式、必备要素和可访问性。`EvidenceReview` 明确关联 EvidenceVersion、reviewer、固定 baseline、审核范围、来源/可信度/完整性/观点支撑度及理由；每项为 0–3 或 unable_to_assess。作者不得审核自己的版本。

`ReviewDelivery` 保存审核意见的目标版本、作者、发送完成或失败时间。只有发送完成才能启动固定 1 分钟响应期限；发送失败不能冒充作者放弃。

### Publication and formal record

已登记版本和 Review 只对作者、Manager、reviewer 及会议处理链可见。Round 仅在每项接纳 Contribution 有确定状态、每个最终已登记版本完成审核后收口；空 Round 合法，但不得伪造证据、审核或完成。

`Publication` 是不可变的轮末公开批次，保存发布顺序、本轮每位 Contributor 的最终版本、最终审核、公开论证及退出/受阻原因。它是下一 Round publicBaseline 的唯一新增来源；私聊、内部工具过程、举手申请、未审核版本和旧版本不得公开。

`FormalMessage` 保存发布顺序、作者、关联议题、正文类别、正文、关联领域对象和 publicationId。正文只承载议题观点、依据、问题和建议；执行身份自述、授权标识、初始化回执和内部工具过程不作为常规正文。正式记录只追加，不静默改写。

### Proposals, completion and termination

`ProposalRevision` 是不可变版本；新版本不继承旧 Position、DecisionCandidate 或接受结果。`Position` 保存 actor、目标版本、立场、理由、证据和是否为阻塞异议。`DecisionCandidate` 是当前 revision 的派生只读候选，只对 Captain/local 用户可见。

`Decision` 与 `RiskDisposition` 都是带 actor、理由、会议内证据、时间和替代/撤销关系的结构化事实。自然语言不能形成它们；一次风险处置不能顺带接受其他问题、决策或目标。

`CompletionFact` 记录经授权的提交、任务结果投影、required review、Captain 接受/豁免/风险处置或结束操作，及其支持的 output/criterion/constraint、证据、审核、actor、时间和 active/superseded/revoked 状态。任务完成、轮次收口、正面评分或自然语言总结本身不是 CompletionFact。

`MeetingLimits` 保存最大正式消息数、最大时长、任务期限与审核/响应期限。`Termination` 保存结果、原因、有效 Decision/CompletionFact、未解决 Question/Issue、待处置 candidate、未收口 Contribution 和部分完成说明；预算耗尽不能伪装为正常完成。

`ArchivePackage` 是终态 Meeting 的不可运行快照，包含 ObjectiveContract、正式记录及其顺序/议题关系、Publication、Proposal/Position/Decision、Question/Issue/RiskDisposition、CompletionFact、未解决事项、Termination、身份/角色/模板溯源和公开来源信息；不含可继续的 Session、完整运行配置、capability、私聊、隐藏推理或内部工具过程。可选 Scribe 只能从这些正式事实生成引用式纪要草稿；它不能创建或改写正式记录、事实或决策，缺席、失败或替换不影响归档完整性。

## Business Orchestration

1. 创建 Meeting，验证 ObjectiveContract、初始 Agenda、身份职责和必需关系；成功后才进入 running。
2. Manager 打开 Round，固定 publicBaseline，并围绕当前 AgendaItem 处理举手。
3. Contributor 并行准备、提交和补充自己的 EvidencePackage；Manager Registration 后交由独立 reviewer 审核。
4. 每个 Contributor/Review 收口后，统一形成 Publication；Manager 再规划继续、停止或下一问题。Captain 独占议题 candidate 处置。
5. 长时工作转为 MeetingTask；任务结果只经后续正式提交进入公开事实。私聊不直接改正式事实。
6. Runtime 依据 CompletionFact、ObjectiveContract、required review、有效 Decision、hard constraints 和 blocking Issue 重算完成。满足条件后进入 converging，Convener 再接收成果或结束。
7. 暂停保留已提交事实并禁止新工作；恢复只使用当前事实。归档先物化不可运行 ArchivePackage，再安全关闭会议专用运行资源。

### Planning and participant availability

每次 Round 规划首先处理显式点名、直接问题、必需复核、议题负责人、相关任务结果和阻塞异议；其余候选才按当前议题、证据缺口和路径修订安排。规则足以决定时使用确定性选择；只有需要语义判断时才请求 Manager Agent 建议。任何计划都受身份资格、权限、议题责任、有效 Contribution、审核期限和 MeetingLimits 约束，不能退化为预设发言顺序。

必需参与者不可调度时，停止所有依赖该身份的工作，保存身份和原因并向 Convener 报告；不自动替换、豁免或重复调度同一未变化的不可用身份。与之无依赖的已授权工作可以继续。Manager 不可用或其建议无效时，同样记录受阻原因；既有确定性选择不得越过审核、公开或授权边界。

## State And Failure Handling

Meeting 生命周期为 created、running、waiting、paused、converging、archiving、archived，以及 completed、partial、no_consensus、cancelled、failed 终止结果。每次写入必须绑定 Meeting、版本、真实 actor 和目标对象；无效身份、权限、版本、Round、证据版本或审核引用不得产生部分事实。

被撤销、替代、过期或不属于当前 Round 的授权及迟到结果不得形成正式事实。失败必须保留既有事实和原因；单个 Agent 内部失败只影响相关工作，不自动使 Meeting failed。

持久化只需保证已提交 Meeting 事实、顺序、幂等和恢复边界；具体存储介质与算法不属于本文，除非后续正式需求要求独立专项设计。

### Developer Markdown projection

Developer Markdown 是从一次已提交 Meeting snapshot 异步生成的只读派生文件，不是 Meeting 事实、恢复输入、授权依据或归档完成条件。它仅使用已公开的正式记录、决策、未解决事项、结束结果和归档材料；不写入私聊、Session、capability、内部工具过程或未公开 EvidenceVersion。

生成、workspace 映射、文件写入、替换、清理或日志失败必须记录诊断，但不得回滚、延迟或改变 Meeting commit、版本、暂停、恢复、结束、归档、Session 撤权或其他领域事实。它可以滞后或缺失，重新生成只能读取当前已提交事实。

## Security And Observability

领域事实保存审计所需 actor、时间、授权依据、对象关系、版本和理由，不保存 Session、完整 Agent 配置、capability、私聊正文、隐藏推理或内部工具过程。同轮隔离、Captain/local 专属候选和归档排除项必须由所有接口和投影保持；通知只提示刷新，不能承载或替代事实。

## Acceptance

1. 同轮材料分别使用同一固定 baseline，Publication 前互不可见。
2. 每位 Contributor 每轮只有一个 EvidencePackage；两个实质补充形成新版本并使旧 Review 失效。
3. Registration、Review、Publication、Decision、RiskDisposition、CompletionFact 和终止是不同事实，任何一项不替代另一项。
4. 超时、审核发送失败、空轮、未提交退出和异常结束可被表示，且不虚构完成或公开。
5. ArchivePackage 可解释成果与未解决事项，但不暴露运行资源或允许续跑旧 Meeting。
