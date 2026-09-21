# Meeting Orchestration Requirements

状态：已确认
适用产品：Convivium DSH Plugin

## Purpose

本文定义 Convivium 连续会议编排的产品需求和验收标准。Convivium 基于 DSH，以纯插件形式提供多 Agent 连续会议能力。

本文只规定用户和会议参与者可以观察到的行为、业务边界及验收结果，不规定数据库、模块、类、状态机、事务、消息格式、工具名称或具体调度算法。

产品以协作求解为主线：明确目标、建立候选路径、搜集并分析证据、修订路径，形成一致性方案。讨论、发言安排与审核服务于方案形成，不以辩论、发言次数或全员口头赞同作为目标。举手、证据审核、轮次收口与公开以 [Meeting Evidence Round Requirements](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md) 为唯一现行业务依据；本文件负责会议目标、议题规划、公共成果与结束条件。

## Scope

- 在 DSH 中创建、运行、暂停、恢复和结束一场多 Agent 会议。
- 让多个独立会议身份围绕明确目标和议题进行连续、有序的讨论。
- 让后续发言者能够回应已经提交的前序发言。
- 支持会议内短时发言与会议外异步任务协作。
- 支持议题控制、分歧保留、决策形成、完成判断和会议归档。
- 支持崩溃恢复、迟到结果隔离和可审计的会议记录。

## Non-goals

- 不提供脱离 DSH 运行的独立桌面应用或独立 Agent Host。
- 不要求所有 Agent 同时启动、同时完成或对每次 Transcript 更新都发言。
- 不要求一次会议解决所有发现的问题。
- 不把 MeetingTask 完成直接等同于会议目标完成。
- 不共享 Agent 的隐藏推理、私有工具过程或与会议无关的 Session 历史。
- 不规定、枚举或解释 Agent 内部的 Prompt、Skills、Tools、MCP、命令、推理、工作流或重试策略。
- 不定义开放角色市场、人类席位托管、由 Manager 任意创建角色或跨 DSH 宿主协作。
- 不在本文规定存储引擎、进程边界、源码目录、工具 Schema 或 UI 实现。

## Functional Requirements

本文件的功能需求使用 `MO-FR-*`，只定义会议级行为；证据轮次的细则与验收由 [ER-FR](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#functional-requirements) 单独定义。跨文档引用必须包含前缀，不以裸 `FR-*` 指代任何一份需求。

### MO-FR-1：DSH 插件形态

1. Convivium 必须作为 DSH 插件安装、加载和运行。
2. 用户不得被要求同时启动一个独立的 Convivium 应用才能使用会议功能。
3. 首发只支持精确 DSH 版本 `0.1.2-rc.1`；版本不同或缺失必需生命周期能力时插件必须拒绝加载并说明支持版本，不得以降级模式运行会议。更高版本须在独立验证并更新正式兼容口径后才能支持。

### MO-FR-2：会议与身份隔离

1. 每场会议必须拥有独立的会议目标、议程、参与者、发言记录、问题、提案、立场、决策和结束结果。
2. 每个 Agent 在一场会议中的具体身份必须拥有独立、可持续的 DSH Session。
3. 不同会议、不同身份或不同授权范围不得共享同一个 Session 状态。
4. 主持身份不得伪装成普通参与者，也不得以参与者名义形成正式发言或立场。
5. 同一个底层 Agent 承担多个会议身份时，各身份必须保持可区分、可审计。
6. 会议只能由当前可信 Captain 的 DSH tool 创建；adapter 必须从 `exec.agent` 注入该 Captain，创建 payload 不得提交或伪造 parent、actor、Session 或 authority。调用方必须为每个初始身份提供会议内唯一 `identityKey`，并能够定义参与者、风险权限、议题责任和必需参与关系；Meeting Runtime 完整验证引用后才原子分配正式 identity ID，不得从 displayName、Definition ID 或数组位置推断。每场会议还必须分别通过一个 `identityKey` 指定唯一专职 `manager` 和唯一专职 `evidence_reviewer`；两者均不能兼任 Captain 或 Contributor，且不能互相兼任。选择 Definition 时，Manager 必须绑定 `meeting_manager`，reviewer 必须绑定 `verification_reviewer`。无效或相互矛盾的配置不得产生部分可用的会议。
7. 新建会议的目标、议题、提案和验收条件必须从明确的未完成初始状态开始，不得在创建时被预先标记为已接受、已满足或已解决。
8. 每场会议必须具有稳定且唯一的身份，其数据和会议专用 Session 不得与其他会议混淆。

### MO-FR-3：并行贡献与有序发布

1. 不同 Participant 可以在同一会议议题下拥有并行的有效贡献授权，独立准备和提交；不得以全会议单一发言权或固定发言次序限制各自工作。轮次公开基线及轮内权限仅由 [ER-FR-1](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-1轮次计划公开基线与角色) 与 [ER-FR-4](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-4要素确认登记与轮内可见性) 定义。
2. Manager 围绕待解决问题、证据缺口和路径修订规划议题；每次 `open_round` 必须将本轮具体问题、证据缺口和预期产出作为持久化的 `roundGoal` 提交。它只细化已授权 Agenda，不创建、提升、替换或处置 Agenda candidate；贡献者如何举手、Manager 如何接纳或拒绝以及轮次何时收口，仅由 [ER-FR-2](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-2举手与-manager-安排) 与 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 定义。
3. 每个 Participant 同时最多处理一项发言任务，待审及退回修改仍属于该任务；其他 Participant 的任务可以独立推进。
4. 会议的公开内容必须具有稳定、可追溯的版本与发布顺序，后续贡献者能取得已公开的相关内容；固定审核基线、同轮隔离和更新重审仅由 [ER-FR-1](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-1轮次计划公开基线与角色) 与 [ER-FR-6](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-6审核意见两次补充与响应) 定义。
5. 参与者必须能够回应、质疑、补证、修正、支持或总结已公开内容。待审内容不作为其他参会者的公共讨论依据，授权核验访问遵循专项需求。
6. 正式公共论证须遵守本文的公开内容结构；Runtime 只作确定性结构、引用、身份、授权和期限校验，Manager 不读取或审批正文。轮内登记、唯一 reviewer 对确切公开版本的独立审核和轮末统一公开仅由 [ER-FR-4](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-4要素确认登记与轮内可见性)、[ER-FR-5](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-5独立审核与四维评分) 与 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 定义；不得用 Manager 批准、自然语言摘要或旧 Review 替代。
7. 任务授权被撤销、超时或重新分配后，旧请求及其迟到审核结果不得发布内容；一人的失效不得使其他人的有效授权失效。

2026-09-15 确认同轮并行准备、轮末统一公开的业务轮次，取代 2026-09-14 的无轮次门槛表述；既有串行 Turn、直接提交和立即公开路径不能作为新要求的覆盖证据。

### MO-FR-4：发言计划与选择

1. 发言计划必须围绕当前议题和本次讨论目标形成。
2. 显式点名、直接问题、必需复核、议题负责人、相关任务结果和阻塞异议必须优先获得处理。
3. 主持机制可以在规则足以决定时使用确定性规则，在需要语义判断时请求独立主持 Agent 建议。
4. 主持 Agent 的安排必须受到参与者资格、权限、议题、贡献任务与审核时限及会议预算约束；不得以预定发言顺序替代按问题安排。业务轮次的固定基线、收口与公开由 [ER-FR-1](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-1轮次计划公开基线与角色) 和 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 定义。
5. 主持 Agent 不得自行代表参与者接受决策、接受风险或宣布会议业务目标已经完成。
6. 主持 Agent 不可用或安排无效时，会议必须明确报告原因并采取有界的失败处理；既有确定性选择不能代替必需的公开版本审核，不得自动发布未审内容。
7. 某项工作所必需的 Participant 不可调度时，停止依赖该身份的安排并向用户报告具体身份和原因，不得自动替换或豁免；无依赖的已授权工作可继续，必需贡献或审核未满足时不得宣布相应目标完成。
8. 相同会议状态没有发生变化时，不得自动重复调度同一个不可用的必需 Participant。

### MO-FR-5：异步任务与举手

1. 长时间构建、测试、调研或外部等待不得阻塞其他 Participant 的独立贡献。
2. 参与者必须能够将长时间工作交由 Convivium-owned MeetingTask 承载并结束当前发言任务；状态通知不自动成为正式正文，任务实际执行复用该 Participant 的 DSH continuable Session。
3. 异步任务完成或出现新证据时，相关参与者必须能够申请在后续讨论中发言。
4. 发言申请本身不是正式会议发言，不得直接形成决策或修改正式 transcript。
5. 非阻塞任务运行期间，会议应能继续讨论其他相关内容。
6. 当前目标确实依赖某项未完成任务时，会议可以进入等待，并在条件满足后恢复。
7. 会议运行时必须验证请求者的会议身份、当前有效任务授权和所属上下文，再创建 MeetingTask；Participant 不因此获得 Captain 或其他 Participant 权限。
8. MeetingTask 必须能够追溯到所属 Meeting、参与者和当时的正式发言上下文；其结果只有经 Meeting Runtime 授权的 projection 才能进入会议。

### MO-FR-6：议题范围与发散控制

1. 会议必须有明确的总体目标、预期产出、验收条件和约束。
2. 同一时刻必须有一个明确的当前议题；发言默认服务于当前议题。
3. 新发现的问题必须区分为阻塞问题、后续事项、待讨论事项、已接受风险或范围外问题。
4. 只有影响必要产出、验收条件、硬约束、必需审核或未接受高风险的问题，才可以阻塞当前会议目标。
5. 次要问题和潜在风险可以被记录、分配负责人或留待后续会议，不要求本次会议全部解决。
6. 新议题不得因为被提及而自动取代当前议题。
7. 讨论发生漂移、重复或长期没有实质进展时，主持机制必须能够重新聚焦、重新规划或结束会议。
8. Agenda candidate 只能由 Captain 通过结构化处置操作设为 `promoted`、`parked` 或 `rejected`；Manager、Participant 和自然语言内容不得处置 candidate。
9. `promote` 必须在一个原子提交中把仍为 `pending` 的 candidate 标为 `promoted` 并创建一个完整的 pending AgendaItem，但不得改变当前 active agenda；`park` 和 `reject` 只改变 candidate 状态。
10. 同一 candidate 只能处置一次。处置失败不得写入 Meeting state、event、receipt、outbox 或增加 Meeting version；成功处置不产生 outbox。
11. 当前状态必须以稳定顺序公开 `parkingLot` 的 `id`、`title`、`reason` 和 `status`；归档保留相同事实。未处置的 candidate 不阻塞会议结束，并以 `pending` 原样进入归档。
12. 任一已授权的 Meeting identity 可以结构化记录 Question 或 Issue；只有 Captain identity 可以结构化 resolve Question 或 dispose Issue。local controller 不得执行这四个动作。身份或角色不符必须拒绝，不能以自然语言、Manager 计划、local control 或风险处置替代该授权边界。

### MO-FR-7：提案、立场与决策

1. 参与者只能以自己的会议身份提交立场，不得代表其他参与者表态。
2. 参与者可以提出候选决策，但不能自行写入正式决策的接受者、异议者或接受状态；候选记录不可变且不具有持久状态。
3. 正式决策必须依据当前提案版本上的有效立场和 Captain 或单 Host loopback 本地用户的明确结构化接受形成；当前范围不使用自动接受，自然语言意见不能替代该操作。
4. 新提案版本必须独立保存，`positions` 从空集合开始，不得自动继承旧版本的立场、候选决策、正式决策或接受结果。
5. 少数非阻塞意见必须保留在会议结果中，不得为了显示一致而删除。
6. 只有 Captain 和 loopback local user 可以查看当前 Meeting 的 `pendingDecisionCandidates`；该 projection 只包含指向当前 Proposal revision、尚未形成 Decision 且 Meeting 处于 `running|paused` 的候选，普通 Participant 不可见。候选被接受、Proposal revision 更新，或 Meeting 进入 `preparing|converging|ending|terminal|archiving|archived` 后，必须从该 projection 消失；当前范围不提供 candidate reject/revoke 操作。`paused` 中的候选只表示恢复后仍可执行，不授权在暂停期间接受。
7. 每个 Candidate 最多形成一个 Decision，同一 Proposal revision 最多有一个 `accepted` Decision。决策被替代或撤销时，必须通过 Captain 或 loopback 本地用户的结构化 `supersede` 或 `revoke` 操作；历史决策及其依据必须仍可审计。`supersede` 的 replacement candidate 必须属于同一 proposal 的 current revision 且尚未形成 Decision，并在同一原子提交中生成 replacement Decision、将旧 accepted Decision 标记为 superseded 并记录替代关系；`revoke` 只能将旧 accepted Decision 标记为 revoked。
8. Captain/local Decision disposal 必须包含 protocol version、Meeting/version expectation、request identity、目标 Decision、action、非空理由和至少一条本 Meeting 证据；`supersede` 必须提供 replacement candidate，`revoke` 不得提供。execution-terminal、archiving 和 archived 状态不得写入 Decision。
9. Captain 在自然语言中表示接受或拒绝风险只构成意见；只有通过明确的结构化风险处置操作并经系统验证后，才能改变正式风险状态。
10. `record_proposal_revision`、`record_position`、`record_decision_candidate`、`decide` 和 Decision 的 `supersede|revoke` 只在 `running` Meeting 接受；`paused|preparing|converging|ending` 返回 `INVALID_STATE`，`terminal|archiving|archived` 返回 `MEETING_TERMINAL`。`converging` 是本组操作的单向收敛边界，当前范围不在其中撤销或替代 Decision，也不隐式重新打开 Meeting。

### MO-FR-8：完成事实与会议结束

1. 会议完成事实可以来自 Agent 的正式提交、经授权的 MeetingTask result projection、required review，以及 Captain 的明确接受、豁免、风险处置或结束操作；loopback 本地用户也可通过受控入口形成决策接受、替代、撤销和风险处置事实。
2. `MeetingTask completed` 不得默认等同于 required output accepted、议题解决或会议完成。
3. 参与者可以提交完成声明及其证据，但声明只形成不可变 `CompletionDeclaration`，不能直接覆盖会议目标、验收条件、议题、问题、风险或完成状态，也不被自动转换、消费或删除。此处 Participant 精确指已存在于 `MeetingState.identities` 且具有 `contributor` role 的 identity；Captain 只有在同时具有 `contributor` role 时才能提交，仅 `manager`、仅 `evidence_reviewer` 和 local controller 均不能提交。
4. 系统必须验证声明者身份、授权范围、证据归属、审核要求和风险接受权限。
5. 会议完成状态必须由经过验证的完成事实和确定性业务规则得出，不得仅根据自然语言总结宣布完成。
6. 达到业务完成条件时，即使仍有非阻塞后续事项、待讨论事项、已接受风险或少数意见，会议也可以正常完成。
7. 会议不能完成时，必须区分部分完成、无共识、取消和内部失败，并说明原因及未解决事项。
8. 最大正式消息数、最大会议时长、任务与审核时限限制继续工作；不得以固定轮次数或每轮发言人数代替证据轮次的状态收口条件。`maxFormalMessages` 只统计 `FormalMessage`，不统计 Publication、私信、举手或系统通知；Manager 接纳 Contribution 时为其预留一个消息名额，名额不足必须拒绝接纳。轮次发布必须整体适配剩余预算，不得通过合并不同作者的领域记录、摘要替代原文或部分发布来绕过上限；UI 和 Markdown 可以折叠或分组但不改变计数。最后一批恰好达到上限且同时满足完成条件时按正常完成处理，否则停止新增工作并报告异常结束或人工处置。
9. Captain 或 loopback 本地用户的结构化风险处置必须明确一个 `status=open` 的 Issue、动作、理由和证据，并受当前目标的 `acceptableRiskLevel`、该 Issue 的 `affectedConstraintIds` 所引用 hard constraints 和 Meeting lifecycle 限制；`resolved|deferred|out_of_scope` Issue 不可执行风险处置，`riskLevel` 缺失不得推断默认值，处置一个风险不得顺带接受其他风险或正式决策。合法 accept 要求这些 hard constraints 当前均为 `satisfied`，并使 Issue 成为 `accepted_risk` 且 `blocking=false`；合法 reject 使 Issue 保持 `open` 且 `classification=blocking`、`blocking=true`，不受风险等级上限限制。每次不同 request 的合法重新处置都必须保留旧 risk acceptance fact 并创建新的 active fact；相同 request 必须幂等重放或报告冲突。处置后执行确定性完成重算；满足完成条件时进入 `converging` 并停止新贡献安排、清除不再适用的等待状态，本操作不自动结束或归档会议。
10. 会改变完成判定的 `dispose_issue` 只能在 `running` 执行；`paused|preparing|converging|ending` 返回 `INVALID_STATE`，`terminal|archiving|archived` 返回 `MEETING_TERMINAL`。因此不存在 paused 期间清除最后阻塞、resume 后却遗留在 running 的状态；满足条件的该处置在同一次 running transition 中进入 `converging`。
11. `dispose_risk`、`submit_completion_declaration`、`record_completion_fact` 和 CompletionFact 的 `supersede|revoke` 只在 `running` Meeting 接受；`paused|preparing|converging|ending` 返回 `INVALID_STATE`，`terminal|archiving|archived` 返回 `MEETING_TERMINAL`。达到完成条件并进入 `converging` 后，当前范围不撤销或替代 CompletionFact，也不隐式回到 `running`。

### MO-FR-9：暂停、恢复与故障隔离

1. 会议必须支持暂停和恢复，并保留已经正式提交的会议事实。
2. 用户必须能够通过自然语言指令暂停或恢复会议；插件会议面板必须同时提供与当前状态对应的“暂停”或“继续”按钮。
3. 自然语言指令和按钮必须执行相同的会议控制规则，不得产生两套不同的暂停或恢复语义。
4. 因正式消息预算耗尽且目标未满足而进入的暂停不可恢复，只能保持暂停或由本地用户按明确 outcome 结束；普通人工暂停仍可恢复。
5. 插件重启后，未结束会议必须能够恢复到一致状态，或者明确说明不能恢复的原因。
6. 重复提交不得产生重复发言、重复决策或重复状态变化。
7. 已撤销、已替换或过期的发言请求不得修改当前会议。
8. 会议创建失败或插件异常终止后，不得遗留无法确定所属会议的会议专用 Session。
9. 恢复或关闭会议专用 Session 时，不得操作属于其他会议、其他团队或无法确认归属的 Session。
10. 单个 Agent 的内部工具失败不得自动判定整场会议失败。

### MO-FR-10：会议记录、隐私与归档

1. 正式会议记录必须包含发言顺序、发言身份、议题关系、提案、立场、问题、决策、未解决事项和结束结果。
2. 私聊、举手申请、隐藏推理和未公开的内部工具过程不得自动进入正式 transcript。
3. 会议 Participant 之间必须能够使用 Convivium 的受控 mailbox 进行异步私聊；meeting-scoped mail 必须携带发送时可见的会议上下文快照。
4. Agent 实际处理 meeting-scoped mail 前，必须在权限范围内补充快照之后新增的正式 transcript，并固化本次处理使用的上下文上界。
5. 私聊处理结果不得直接修改正式 transcript、决策或完成状态；需要公开讨论时必须申请发言，长时间工作必须转为异步任务。
6. 用户必须能够区分当前准备与待审任务、主持建议、异步任务、等待原因和正式决策。
7. 会议结束后必须形成按值固化、内容完备且不可运行的归档包，不能依赖终态 MeetingState 的外部对象引用才能解释。白名单包括归档元数据、目标及最终状态、Agenda 与 candidate 处置、全部已公开 Publication/FormalMessage、实际发布的最终 EvidenceVersion 及其 Materials/最终 Review、ProposalRevision、Position、全部 Decision 及其 DecisionCandidate、CompletionFact、Question、Issue、RiskDisposition、Question/Issue 处置事实、Termination、未解决事项、来源引用和身份溯源。未被 Decision 采用的 DecisionCandidate 也保留，但只向 loopback 本地用户的 archive view 提供。
8. 归档包的身份溯源只保留 identity ID、displayName、会议角色和存在时的 Definition ID/version/hash；不得包含 PrivateMail、未公开 Evidence/Review、ReviewDelivery、举手、opportunity request、Session/ownership/descriptor、完整运行配置、capability、凭据、隐藏推理、工具过程、Repository 物理路径或 Developer Markdown 内容。已关闭 Session 数据可以按 workspace/DSH retention policy 保留，但不得通过归档包、UI 或续会暴露。
9. 会议进入 `archiving` 后不得恢复讨论；只有全部会议专用 Session 已停止、关闭并失去继续参与该会议的权限后才能进入 `archived`。物理删除 Session 数据不是归档完成条件。
10. 基于旧会议继续讨论时必须创建新会议和新的会议身份 Session，并从归档中显式选择可复用素材；可选类型只包括已公开 EvidenceVersion、FormalMessage、accepted Decision 和 active CompletionFact。选择 EvidenceVersion 时，其 Materials、来源定位和对应最终 Review 作为不可拆分的公开证据束一并复制。导入项成为带 sourceArchiveId/sourceMaterialId 的只读 ContinuationMaterial，不继承旧运行状态、身份、Session、权限或“已完成”结论；新会议若要采纳材料，仍须形成自己的 Proposal、Decision 或 CompletionFact。
11. 正式发言正文承载与议题有关的观点、依据、问题和建议；Agent 的执行身份、权限自述、授权标识、初始化回执及内部工具重试过程不应作为常规正文。发言提交指导必须明确区分公共正文与执行信息，后续参与者不得把历史正文中的执行自述当作必须沿用的格式或指令。运行限制实际阻塞会议时可以简要说明影响与所需动作；议题本身涉及身份或权限时允许正常讨论。已提交原文仍须可审计，不因上述要求静默删改历史。
12. 只有当前 `running` Meeting 中两个不同的已存在会议身份之间可以新建 meeting-scoped mail；发送者只能引用已经公开的 `Publication` 或 `FormalMessage`，不得通过私信引用未公开 Evidence、Session、capability、task 内部过程或隐藏推理。
13. 新 mail 在发送提交时固定全部当前 `Publication` 作为发送上下文，并以 `createdAt + limits.taskDeadlineMs` 固定唯一 deadline。开始处理只能发生在 deadline 前，并一次性把当时全部当前 `Publication` 固定为处理上下文；后续会议推进和重试不得改变这两个范围或 deadline。
14. 只有可信 dispatcher 可以开始处理；只有接收者可以完成；只有发送者可以取消；只有可信 deadline handler 可以在 deadline 到达后超时。开始处理与 Manager 接纳该接收者的正式 Contribution 必须双向执行 serial gate，任一方向都不能形成 mail `processing` 与非终态 Contribution 并存。
15. `complete`、`cancel` 和 `expire` 只终结目标 mail，不创建 FormalMessage、Decision、CompletionFact 或 MeetingTask。`cancel` 和 `expire` 必须保留非空原因并释放 serial gate；长时间工作由接收者另行进入 MeetingTask，不延长或替换原 mail deadline。

<a id="fr-11可观察性与用户控制"></a>

### MO-FR-11：可观察性与用户控制

1. 用户必须能够查看当前议题、当前讨论目标、贡献安排、当前准备与待审任务、正式 transcript、阻塞项、后续事项、异步任务、适用的消息、时长、任务及审核限制、结束结果，以及 Captain/local 可见的 pending decision candidates、accepted decision history 和 risks projection；普通 Participant 不得通过该状态读取获得这些 Captain/local 专属数组。
2. 当前面板必须列出本地 Host 中全部可恢复 Meeting 的轻量摘要；用户选择其中一项后，面板才读取该 Meeting 的完整状态。列表不得包含 transcript、Session ID、capability、backend 物理路径或私有运行数据；任一已发现 Meeting 无法恢复时，列表必须报告暂不可用，不得返回部分列表。
3. 用户必须能够暂停、恢复、结束会议，以及在适用的会议控制入口中撤销或重新分配指定贡献任务的授权。插件面板运行于单个 loopback DSH Host，不绑定 Web 用户身份、不校验 Team 权限；到达该 Host 的请求共享该本地用户边界。
4. 会议运行时，面板必须显示“暂停”；会议已暂停时，面板必须显示“继续”，并清楚显示暂停原因和发起者。
5. 任何降级选择、强制结束、审核豁免、风险接受和部分完成都必须向用户显示原因。
6. 产品必须通过完整的会议状态读取展示正式会议事实，不得把本地缓存或自然语言摘要当作状态真相源。
7. 用户重新打开或刷新会议后，必须看到完整且一致的当前事实；状态 projection、Web 接口响应、Client 只读展示和 archive-facing history 必须对同一已提交事实保持一致。
8. 会议操作可以出现在 DSH 原生工具调用记录中，但这些记录不得替代正式会议状态、transcript 或审计记录。
9. loopback 本地用户可以在候选、accepted Decision 或风险旁直接接受、替换、撤销决策及接受、拒绝风险；共用一个表单，目标由所点击对象带入，理由显式填写，已有来源消息可预选为证据并须可查看和修改。只有替换需要额外选择候选；撤销没有可靠来源预选时须手选证据。不增加第二次确认弹窗。缓存、提交中及终态禁止新写入，成功或协议拒绝后读取完整状态，不自动重试写请求。
10. 会议状态提交后，通过刷新通知促使面板重新读取完整事实，替换固定 5 秒轮询；通知不携带或替代会议事实。连接恢复、重新聚焦和重新打开后补读完整状态；断线时保留已验证缓存并禁写，完整补读成功后才解除。

### MO-FR-12：Agent 内部能力边界

1. Convivium 只规定 Agent 之间以及 Agent 与会议之间交换的身份、上下文、公开结果和授权边界。
2. Agent 可以在 DSH 授权范围内自行选择 Prompt、Skills、Tools、MCP 和内部工作方式。
3. Convivium 不得依赖某个具体 Skill、内部 Tool Schema、工具调用顺序或隐藏推理才能正确运行会议。
4. Agent 内部工具失败、重试或策略选择不得自动成为正式会议事实。
5. 只有 Agent 明确提交的会议发言、结构化声明、发言申请，以及经授权暴露的 DSH 异步任务结果，才能进入会议协议。
6. Convivium 可以限制自身会议操作的调用权限，并向 DSH 提供会议身份的授权上限；它不得扩大用户或 DSH 已授予的 Agent 权限。
7. Agent 内部数据进入会议前必须经过公开提交、权限检查和必要的信息过滤。
8. Participant 对后台任务的请求属于 Agent 与会议系统之间的公开操作；任务内部使用的 Skills、Tools、MCP 和执行过程仍由 DSH 管理。
9. 会议私聊的身份、可见上下文、串行处理和处理状态由会议系统保证；Agent 如何理解或回复 mail 仍属于 Agent 内部过程。

### MO-FR-13：Agent 角色目录与参会推荐

1. DSH Host 可以向 Meeting Runtime 提供经过当前 Captain 授权范围过滤的版本化 Agent 角色目录；目录必须区分角色定义、可用 Agent candidate 和当前 Meeting Participant。
2. Manager 必须能够获得与当前会议目标、议题和证据缺口有关的最小安全目录 projection，但不得获得模型凭据、完整 Prompt、私有工具配置、Session 历史或其他敏感运行配置。
3. Manager 只能对当前安全目录 snapshot 中的可用 Agent candidate 通过一次结构化会议操作明确作出 `admit` 或 `reject` 决定，并说明相关议题、预期贡献、证据缺口和理由；自然语言同意、仅有推荐、Manager plan 或 research result 均不得替代该操作。`reject` 不创建 Participant 或 DSH Session；`admit` 先形成不可调度的 provisioning 意图，不立即授予发言权或正式立场。
4. Manager 不得接纳自己、决定目录之外或不可用的 Agent，也不得通过决定授予 evidence reviewer、risk acceptance、Captain、Manager 或额外 DSH 权限。
5. Manager 的合法 `admit` 决定无需 Captain 二次处置；决定只允许在 `running` Meeting。Meeting Runtime 必须验证当前 Meeting 身份、version、snapshot、candidate 和 Definition，再为该身份创建独立 meeting-owned continuable Session；Session provisioning 与 durable ownership 完成前，该身份不得进入发言候选集或调用 Participant 操作。会议在 provisioning 期间暂停时不得调度新身份；若在结束前仍有 provisioning，受控结束必须先将该意图标记失败、取消其后续创建并清理已创建但未激活的 Session，不把部分身份带入终态。
6. 新接纳的 Agent 默认是普通可选 Participant；决定不得自动修改 objective contract、全局 evidence reviewer、risk authority、议题 required Participant 或已有 Participant 的权限。
7. Manager 决定、provisioning 意图、Participant admission、失败原因及 Session ownership 必须可审计、幂等、可恢复，并受 Meeting version、终态拒写和跨 Meeting 隔离约束。相同请求不得重复创建 Session 或身份；重启只能继续固化的精确 Definition/descriptor，不以当前目录或定义替代。
8. candidate 的 Meeting Agent Definition 不存在、其引用的 DSH Preset/Skill 无法验证，或 Session provisioning 失败时，不得产生部分可用 Participant；会议必须显示失败原因，并允许 Manager 在新状态上决定其他 candidate。合法 `reject` 与失败均不改变其他身份和权限。
9. GitHub 和 arXiv research 角色必须按证据来源和分析责任区分；Manager 在推荐前应读取已有公开 evidence，不应仅因搜索工具可用而重复推荐相同研究工作。Web Research Analyst 当前完全禁用，不得出现在发布 Definition、Catalog candidate 或初始 Meeting identity 中。当前 Runtime 不自动判断 evidence freshness 或跨角色来源范围，只阻止同一 `candidateId + agendaId` 的重复 provisioning/active 准入。同一 candidate 在本 Meeting 尚有 provisioning 意图时，其他 Agenda 不得并发准入；已有 active 身份时，另一 Agenda 的合法 `admit` 必须复用该 identity、meeting-owned Session、Definition provenance 和既有普通可选 Participant 权限，只新增该 Agenda 的独立 active Manager 决定，不执行 `identity_provision`，也不扩大角色、授权或 DSH capability。自动研究去重是必要的后续能力，须先形成 freshness、来源范围比较和独立交叉验证例外的正式契约，不能把当前的 candidate 去重称为已经覆盖。

MO-FR-13 Phase 1 只覆盖旧 Manager planning attempt 的单一 Host/profile-owned Catalog consumer boundary 与安全 projection；旧 recommendation claim、pending status 和 Captain reject-only 代码不构成上述新决定与准入能力的实现证据。本次目标使用 `recommend_identity` 结构化 Meeting command 完成 Manager 决定与后续 provisioning，不将 legacy `submit_manager_plan` 作为目标实现入口。Host Catalog producer、research dedup、UI/HTTP、stress 和 metrics 不属于本次准入切片。

旧 Phase 1 的 Catalog 只在创建投递给 Manager 的 planning attempt 时按需读取；无 Catalog 不阻塞普通规划，其 attendance claim 必须 fail closed，且不得写 Meeting state、event、receipt、outbox 或增加 Meeting version。目标 `recommend_identity` 的安全 Catalog projection 由 Manager 通过只读入口按需取得；Runtime 在决定 command 中重新读取同一 Host Catalog producer，并要求 catalogId/version、candidateId、Definition id/version 与 Manager 提交的 snapshot 引用精确相同。Catalog 缺失、变化、损坏或 candidate 不可用时，整条 command 拒绝且无任何 Meeting 写入；普通 Meeting 命令不读取 Catalog，也不将该拒绝转换为 Manager planning fallback。

旧 Phase 1 的 planning attempt consumer 不增加 Catalog cache、registry、factory、第二个 Catalog source 或隐式 migration。目标 `recommend_identity` 复用 Meeting command 的 request idempotency、receipt、version、原子 commit、现有 outbox dispatcher 与 projection 边界；不新增独立审批 command、worker、repository 或 queue。

### MO-FR-14：共享 Preset 下的 Meeting Agent Definition

本节为 2026-09-08 确认的初次发布目标；实现覆盖与验收豁免不由本需求文档声明，下述验收标准仍作为目标要求。

1. Convivium 提供版本化 Meeting Agent Definition，只保存稳定定义 ID、版本、会议角色、显示摘要、`roleDescription`、专长、研究来源范围、DSH Preset/Skill 引用及 optional DSH ToolRestriction。Definition 不包含通用 persona 正文、模型配置或 capability 安装内容。
2. Convivium 拥有会议角色、选择、批准、动态发言资格和 Session ownership；DSH 拥有模型默认值、Agent Preset、Skills、Tools、MCP、Sandbox、Approval、组合与执行。
3. 发行包必须附带一个共享 `convivium` Preset、七个原生 DSH Skills 和七个可组合 Definition；产品不提供 `meeting_scribe` 或 `web_research_analyst` 角色及其专用能力。Host 使用 DSH 原生 Loader、Skill provider 和 profile patch 部署；Convivium Runtime 不建立 capability registry/installer，也不复制或展开 Skill 正文。
4. `toolFilter` 使用 DSH 原生 ToolRestriction，只能收窄从 global 与祖先 scope（包括共享 Preset）继承的工具；当前 child 自己注册的工具不受此 filter 屏蔽，不能据此授予工具或扩大 DSH/用户权限；文件、网络和执行权限仍由 Host policy 管理。
5. `roleDescription` 只表达会议职责、会议输出和会议边界；通用方法放在 DSH Skills。创建时将角色说明及原生 Skill 加载指令转换为 DSH persona。Skill 名称、描述或已加载正文均不授予 Meeting authority；仓库 AGENTS.md 也不是隐式 capability。
6. 初始 Manager 与六类非 Manager 角色身份必须以发起 `create_meeting` tool 的同一个可信 Captain `exec.agent` 为直接 parent，并在该 Captain parent Preset 下各自使用独立 meeting-owned continuable AgentSession；其中唯一 Evidence Reviewer 是专职身份，不属于 contributor Participant。loopback Remote 不得创建 Meeting 或提供替代 parent。只有 provisioning 成功后相应身份才可被调度。动态推荐与接纳仍遵循 MO-FR-13，不是本项新增能力。
7. 所有选定角色在第一个 child 分配前完成 Definition、共享父 Preset 和 required Skill 预检。缺失能力时 fail closed，不允许 persona-only、假 Skill、隐藏 Schema 或自建 installer 降级。
8. 模型默认值直接使用 DSH 配置。Host 可通过独立 `agentModelOverrides` 按 Definition ID 提供必要的 provider/model/reasoningEffort 原生覆盖；Definition 本身不保存这些值。Captain/Manager/HTTP 不可提交任意模型配置。模型覆盖不改变 Definition 内容指纹，实际有效值由 DSH descriptor 持有。
9. Captain 创建请求必须为七个初始身份分别选择精确的 Definition ID 和 version；当前范围不提供无 Definition 的初始身份路径。未知定义、版本不匹配、角色不匹配、不同父 Preset、Skill 不可用或非法 Host 绑定不得静默回退。
10. 会议只持久化 Definition ID、版本和内容指纹；DSH 持久化派生 persona/toolFilter/有效模型。既有会议重放、冷恢复不重新解析当前 Definition 或 Host override，不因配置变化重配已有身份；缺失 descriptor 不以新定义补建。公开 status/archive 不泄露模型覆盖、角色私有正文或 Skill 正文。
11. 首发包必须在独立 DSH profile 通过真实 Loader 验证：同一会议的一位 Manager 和六个非 Manager 角色身份均创建成功；七个 Session 经原生 skill 工具加载各自正文；GitHub/arXiv 研究角色的真实搜索与抓取可用；Evidence Reviewer 的专用 Definition 能使用 Host-approved 读取材料、代码核验、Web/GitHub/arXiv 查询与运行验证能力，并能通过原生 workers 并发审核；会议越权写入被拒绝；模型差异、隔离和冷恢复保持。具体工具清单由版本化 Definition 与 Host 配置拥有，不以工具数量作为验收。
12. 初次发布直接采用新契约，不读取或迁移未发布的旧 Definition/schema 样本。独立 per-child Preset、独占 Skill、差异化插件安装、热切换、完整 Agent 配置平台和日常 profile 改写不属于首发范围。首发模型与上述部署验收全部通过后，MO-FR-14 才可标为已实现。

### MO-FR-15：Developer Markdown Projection

1. 插件配置有效 `developerMarkdownWorkspaceId` 后，Meeting Runtime 必须从每次新提交的 `MeetingSnapshot` best-effort 生成非权威 `current.md`；未配置时该能力关闭且不得改变现有会议行为。
2. 已提交 snapshot 包含不可变 `MeetingState.archive.package` 时，Runtime 必须另外只从该 `ImmutableArchivePackage` best-effort 生成 `archive.md`。
3. Markdown 只供本地开发和诊断。Plugin Frontend、HTTP、Tool、Agent context、会议恢复、授权、状态计算和归档完成不得读取或依赖它。
4. 输出必须使用正式 Developer Markdown interface 的逐字段白名单；必须排除 Session、私聊、隐藏 prompt、内部工具输入输出、delivery/outbox、capability、凭据、artifact 内容和敏感或绝对文件路径。
5. 同一 Meeting 的未执行 current render 只保留最高 `sourceMeetingVersion`；worker 执行前观察到更高 repository version 时必须跳过旧任务。
6. 文件必须位于已配置 DSH workspace 的固定受控相对路径，并使用同目录临时文件原子替换；不得从 Meeting identity 推导 storage backend 路径，不得合并人工修改。
7. 解析 workspace、映射、写入、替换、清理或日志失败不得回滚或阻塞 Meeting commit，不得写领域 event、receipt、outbox、MeetingState 或 Meeting version，也不得影响 pause、resume、end/archive、Session revoke、interrupt、drain 或 Runtime dispose。
8. 该能力不得增加 durable queue、重试 timer、跨进程锁、HTTP route、Tool、Client UI、Agent API、配置 fallback 或通用 projection framework。

## Collaborative Problem Solving

会议沿“明确目标 → 建立候选路径 → 找出关键未知 → 搜集证据 → 分析与比较 → 修订路径 → 形成一致性方案”推进；新证据可使路径返回前序步骤。Manager 组织求解路径、拆解复杂目标、识别证据缺口和整合阶段成果；为子议题说明问题、范围、预期成果、完成条件与依赖。独立问题可并行准备，有依赖的子议题逐步推进。Manager 只在证据轮次收口后决定继续、停止当前议题或下一个议题及理由，也可将“质疑某份证据”列为下一议题；在已授权议题内安排下一步，新增 Agenda candidate 的正式处置仍由 Captain 完成。改变用户目标或重大范围须由作为本地用户的召集人确认，召集人不因此取得 Captain 专属协议权限。Manager 不得把未解决关键分歧宣布为已解决。

贡献者围绕路径提出可整合的观点、证据、推导及修订建议，不因每次公共内容变化自动发言。证据审核员指出证据适用范围、支持的选择与缺口，不以反驳数量衡量成果。公共成果应体现路径、证据、分析和方案的形成，保留按人排列的原文、来源、阶段归纳及分歧，不以逐人复述代替成果组织。一致性方案须与目标一致、各部分相容、关键选择有证据支持、执行路径明确，剩余假设与风险已显式处理；不要求全体成员口头赞同，不能通过隐藏异议制造共识。

## Public Argument Format And Review Boundary

公开论证采用相同的五项结构，便于比较与整合；举手、调度通知、审核状态与权限错误不必伪装成论证正文：

| 项目 | 公开论证内容 |
| --- | --- |
| 主张 | 关联待解决问题或候选路径，说明判断或修订建议。 |
| 证据 | 引用可追溯材料；没有支持证据时如实说明。 |
| 推断 | 区分观察与解释，列明推导假设。 |
| 反证条件 | 说明什么可观察结果会改变判断。 |
| 不确定性 | 标明未验证部分、适用限制与待补验证。 |

五项明确交代，但不得为填齐格式编造事实。证据质疑也可依此格式说明质疑依据、推导缺口和什么核验会消除质疑，不强迫提出替代方案。身份、授权和 Agent 执行自述用于追溯与授权，不替代论证正文。Transcript 是会议公共内容，观点不因发言者身份而变为正确；准备公开但仍在轮内待审的内容不得先进入其他贡献者的公共上下文或成为完成、决策依据。

贡献者从自己的私有工作材料整理出准备公开的确切版本并直接提交 Runtime；Manager 只安排议题、处置举手和观察提交／审核状态，不接收私有草稿，也不读取或审批正文。Runtime 的确定性校验不评价议题观点或证据质量；唯一 evidence reviewer 对已登记公开版本评价来源、可信度、完整性和观点支撑度。内容偏题、依据薄弱或存在反证时，通过 Review 明确记录，不删除登记事实、不由 Manager 改写，也不提前向其他贡献者公开。结构校验、内容审核、观点接受和目标完成是不同事实。

## Business Rules

### BR-1：按贡献推进

会议以公开成果、证据及待解决问题推进，不以固定发言顺序或先提交者身份授予发言优先权。轮次内的独立准备、收口与统一公开由 [ER-FR-1](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-1轮次计划公开基线与角色) 和 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 定义；正式 Transcript 的发布序号只用于引用和审计。

### BR-2：每个身份的有效任务授权

不同 Participant 的贡献任务授权可以同时有效；每个身份最多有一项尚未结束的发言任务，包括准备、待审和退回修改。重新分配、恢复或重试必须防止旧授权继续产生新事实，并保留重复请求的幂等结果；不能以全会议单一 SpeakerAttempt 代替按身份及任务校验。

### BR-3：完成判断边界

每次影响完成条件的合法公共事实更新后重新判断业务完成，包括已按 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 公开的证据及审核意见、正式发布、授权任务结果和 Captain/local 处置。未公开的轮内证据、待审公开内容及尚未生效的附带声明不参与公共完成判断；轮次收口本身不等于目标完成。

预算边界检查不等待任何任务结束；先根据已生效公共事实判断完成，再决定是否允许继续工作。正常轮次公开仍须满足已接纳举手和最终审核的收口条件；预算提前耗尽或召集人强制结束时，记录未完成项及原因，不把异常终止当作正常收口。满足目标后不得因无关且不属于已接纳本轮的准备任务继续等待，也不得因有未审稿就视为完成。结束、暂停及撤销后，相关提交和审核须遵守生命周期与授权检查；终态后不能通过迟到结果追加正式事实。预算的具体字段与计数方式在后续协议中落实，不把旧 Turn 数直接解释为任务数。

### BR-4：主要问题与次要问题

问题是否需要在本次会议继续深入，取决于它是否影响必要产出、验收条件、硬约束、必需审核或未接受风险，而不取决于讨论热度、文本长度或提出者身份。

### BR-5：工具失败边界

Agent 内部工具、命令或 MCP 失败属于 Agent 的执行过程。只有它造成发言请求无法合法完成、Session 不可用或必要任务无法取得结果时，才影响会议运行状态。

### BR-6：身份与授权

Agent 的正式发言、立场、审核、风险接受和决策操作必须绑定 DSH 提供的真实调用 Session。仅对 MO-FR-7、MO-FR-8.9、MO-FR-11.9 的五种本地决策/风险操作，允许使用单 Host loopback 边界证明独立的 local 来源，无需 live Captain Session；不得伪装成 Captain 或 Participant。客户端提供的显示名称或身份标识不能作为授权依据，Agent tool 的 Captain-only 权限不变。

### BR-7：归档边界

归档对象是 Meeting 的正式成果和溯源事实，不是 MeetingState 或 AgentSession 的运行时副本。归档包必须先完整物化；会议专用 Session 随后停止、关闭并撤销 capability，全部完成后才能进入 `archived`。Session 数据是否物理保留由 workspace/DSH retention policy 决定；TeamMember Session 不因会议归档而关闭。

新会议只能通过显式选择的续会素材引用旧归档；旧归档仍保持不可变，旧会议不得恢复运行。

### BR-8：会议协议边界

Convivium 的权限规则只约束会议身份、会议上下文和 Convivium 提供的会议操作。Agent 的通用 Skills、Tools 和 MCP 由 DSH 负责加载、授权和执行，Convivium 不复制其 Schema，也不干预其内部编排。

### BR-9：会议私聊边界

Meeting-scoped mail 是私有异步消息，不是正式会议事实。发送时快照和处理时 transcript 增量都只能包含接收者有权查看的公开会议内容；同一次 mail 处理的上下文范围一旦固化，重试不得随会议推进而漂移。当前契约的公开上下文以 `MeetingState.publications` 的稳定顺序固定，`relatedIds` 只允许本 Meeting 已公开的 `Publication.id` 或 `FormalMessage.id`。mail 使用 `limits.taskDeadlineMs` 形成单一 deadline，不增加第二个 mail timeout 配置。

### BR-10：参会推荐与接纳边界

Manager 的 `recommend_identity` 结构化 `admit|reject` 是当前 candidate 的唯一准入决定。`reject` 只留下拒绝事实；`admit` 的 provisioning 意图不是 Participant、发言权、审核身份或权限事实。只有独立 Session provisioning、durable ownership 与身份事实同时完成后，该 Agent 才成为可调度普通可选 Participant；决定不能改变已经固化的 objective contract、全局 evidence reviewer、risk authority 或必需参与关系。

### BR-11：Meeting Agent Definition 与能力所有权

Meeting Agent Definition 描述 Convivium 会议角色并引用 DSH capability，但不安装 capability，也不产生 Meeting authority。Convivium 只管理 Definition、会议身份、Manager 准入决定和 Session ownership；DSH 管理 Preset、Skills、Tools、MCP、Sandbox、Approval、模型、组合与执行。任何 Definition 字段、Prompt 或 persona 都不能覆盖 Runtime 根据真实 Session、Meeting identity 和当前 attempt 形成的授权结果。

## Acceptance Criteria

1. 创建包含至少三位 Agent 的会议后，至少两位可持有各自有效的贡献授权并独立工作；一人仍在准备不阻止另一人合法提交和接受审核，同一身份在待审时不会再启动第二项发言任务。举手资格及轮次收口另按 [ER-FR-2](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-2举手与-manager-安排) 和 [ER-FR-7](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-7轮次收口公开和后续计划) 验收。
2. 公开会议内容具有稳定版本、来源和顺序，后续贡献者能取得其有权查看的内容；本轮固定基线、同轮隔离及轮末新基线另按 [ER-FR-1](./MEETING-EVIDENCE-ROUND-REQUIREMENTS.md#er-fr-1轮次计划公开基线与角色) 验收。
3. 指定贡献任务重新分配后，旧授权的迟到提交及审核不能发布；其他 Participant 的有效任务不受影响。
4. 长时间工作交由 MeetingTask 后，不阻塞其他身份的独立贡献；任务完成后相关 Participant 可以申请后续贡献，其结果不绕过公开审核。
5. 新出现但不影响目标验收的问题被记录为后续事项或待讨论事项，不阻止会议完成。
6. 没有有效阻塞依据的问题不能阻止会议完成。
7. Participant 不能为其他身份提交立场，也不能直接指定正式决策的接受者或状态；候选不是正式 Decision，且普通 Participant 不获得 pending candidate projection。
8. 新 proposal revision 的 `positions` 为空，不继承旧 revision 的立场、candidate、Decision 或 acceptance；接受事件统一为 `decision.accepted`，不存在 `decision.added` 兼容事件。
9. MeetingTask 完成但 required review 未通过时，会议不能把对应产出标记为 accepted。
10. 经过授权和证据验证的完成声明只追加不可变 `CompletionDeclaration`，不更新产出、验收条件、议题、问题、风险或 lifecycle；只有 Captain 另行创建、替代或撤销的合法 `CompletionFact` 参与目标状态与完成判定。
11. 所有必要产出和验收条件满足后，即使存在非阻塞后续事项或少数意见，会议仍能正常完成。
12. 合法且已公开的事实更新同时满足完成条件和预算边界时，结果为正常完成；轮内已接纳的举手、证据及审核须先按轮次规则收口，不将未公开提交当作已完成事实。预算在轮内耗尽时显示待收口项和异常结束／人工处置原因，终态后的迟到提交、审核不能改变会议事实。
13. 插件重启后，正式提交内容不丢失，重复投递不产生重复会议事实；request identity 相同且 validated request serialization 相同的重试必须重放原 receipt/result，identity 相同但 serialization 不同必须拒绝。
14. 会议创建中断后，已经产生的会议专用 Session 仍能被确定性归属和安全关闭，不会影响其他会议或团队的 Session。
15. `archived` 对外可见时，所有会议专用 Session 已停止、关闭并失去会议 capability；归档包不包含可恢复 Session、完整 Agent 运行配置或私有 Session 历史，但底层已关闭数据可以按 DSH retention policy 保留。
16. 用户可以观察当前议题、贡献安排、当前准备与待审任务、等待原因、阻塞项、异步任务、决策 history、当前 accepted decisions、按权限过滤的 pending candidates/risks 和结束原因；状态读取不得暴露 Session、capability 或 backend 物理细节。
17. 更换 Agent 的内部 Skills、Tools 或执行顺序，在其仍遵守相同会议协议时，不改变会议编排的正确性。
18. Agent 内部工具失败但随后仍能合法提交发言时，会议不会因此增加会议级失败计数。
19. Participant、Manager 和 Captain 只能调用其获授权的 Convivium 会议操作，但 Convivium 不枚举或接管其普通 DSH Tools。
20. 必需 Participant 不可调度时，依赖它的工作停止并显示身份和原因；无依赖的已授权工作继续，不自动替换或豁免必需身份，也不在状态未变化时重复安排同一不可用身份。
21. Meeting-scoped mail 保存发送时上下文范围；延迟处理时补充截至处理开始的可见 transcript，随后重试使用同一固定范围。
22. 同一个会议身份不会同时处理私聊和正式发言请求；mail 回复不会自动进入 transcript 或取得发言权。
23. 普通 TeamMember mailbox 不携带会议上下文时保持原有行为；会议参与者不需要复用或伪装成 TeamMember Session 即可收发会议私聊。
24. Mail handling 具有明确超时；私聊处理不得无限占用 Participant Session 或阻塞正式发言，长时间工作必须转为 MeetingTask。
25. 创建会议时，重复、缺失、相互矛盾或引用无权访问对象的参与者配置会使创建整体失败，且不产生部分可用的会议。
26. Captain 的自然语言风险意见不会改变会议状态；合法的结构化风险处置只影响指定 Issue，验证 `riskLevel <= acceptableRiskLevel`、hard constraints、状态、理由和本 Meeting 证据，生成可审计事实并触发确定性完成重算；旧 risk facts 不删除。
27. 归档前会校验最终成果、完成依据、正式 transcript、未解决事项、来源信息、全部 Decision history、全部 Issue 和全部 risk facts 已经物化；Session 关闭失败时会议保持不可讨论的 `archiving`，且输出物不会丢失。
28. 从旧会议创建新会议时，只导入 Captain 显式选择且有权访问的归档素材，并保留来源引用；不会继承旧 Session、capability、完整 transcript 或运行状态。
29. 当前面板先读取本地 Meeting 列表；选择一个摘要后只读取被选择 Meeting 的完整状态，列表本身不暴露 transcript、Session ID、capability、backend 物理路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表报告暂不可用且不返回部分结果。
30. Manager 收到的 Agent Catalog projection 不包含敏感 DSH 配置，并且只能引用当前 snapshot 中可用的 candidate 作出结构化参会决定。
31. Manager 作出结构化 `admit` 后，该 Agent 在 Session provisioning 和 durable ownership 成功前不会进入 speaker candidates，也不能提交会议事实；`reject` 不创建 Session。
32. Manager 的合法 `admit` 只接纳普通可选 Participant，不会自动授予 evidence reviewer、risk acceptance、Captain、Manager 或超出 DSH Agent Preset 和 policy 的权限。
33. 被决定 `admit` 的 Agent provisioning 失败时，会议中不存在部分可用 Participant；失败可恢复、可审计，且不影响其他 Meeting 或 Participant Session。
34. 当前契约对同一 `candidateId + agendaId` 已有 provisioning 或 active 准入时拒绝重复准入；同一 candidate 的 provisioning 意图阻止其他 Agenda 并发准入，已有 active 身份则允许另一 Agenda 复用同一 identity/Session 并新增独立 active 决定，且不产生 provisioning effect 或扩大权限。不把该检查宣称为 evidence freshness 或跨来源研究去重。Manager 在推荐前能读取已有公开 evidence；自动 freshness、来源范围比较和独立交叉验证例外属于明确记录但尚未实现的后续能力。
35. 每个 Agent Definition 都有稳定 `agentDefinitionId` 和 `definitionVersion`，并明确引用一个 `dshPresetId` 与 required DSH Skill 名称；Definition 不复制 DSH capability 内容。
36. `toolFilter` 只能收窄继承的 global/祖先 scope 工具，不屏蔽 child 自己注册的工具，也不是操作系统资源隔离机制；Definition、roleDescription、persona 或 Skill 名称不能授予 Tool、MCP、Sandbox、Approval 或模型权限。
37. Manager 只看到 Agent Definition 的安全摘要；自然语言推荐不创建 Session，结构化 `admit` 意图也必须等待独立 Session provisioning 和 durable ownership 成功后才能形成可调度 Participant。
38. DSH 版本不是精确 `0.1.2-rc.1`，或已选择的 Definition、共享父 Preset、required Skill、必需 lifecycle capability 无法解析和验证时，在第一个 child 创建前拒绝；DSH 创建失败则沿既有 creation_failed、revoke 和 drain 路径清理，不发布 ready Meeting。不得将版本或能力缺口降级为 persona-only，也不得使用 Convivium installer workaround。
39. 发布包内七个启用角色在同一共享父 Preset 的会议中形成七个独立 child，分别通过原生 skill 工具加载正文；GitHub/arXiv 两类研究角色的真实搜索与抓取可用，唯一专职 Evidence Reviewer 能取得待审集合并通过 DSH 原生 workers 并发审核。继承工具的限制同时影响可见性和真实执行，会议越权写入被拒绝。至少两个角色的模型差异与 persona/toolFilter 经 Host 冷重启保持，父 Session 不受影响；目录或样本存在不能替代这些验收。
40. delegated meeting-owned Agent 不会等待无人处理的交互式 Approval，也不能从自身 Session 内扩大启动时固化的权限。
41. 未配置 `developerMarkdownWorkspaceId` 时不产生 Developer Markdown；配置不存在的 workspace 时插件启动失败，且不选择其他目录作为 fallback。
42. 新 Meeting commit 后，`current.md` 的 `sourceMeetingVersion` 等于该 committed `MeetingSnapshot.version`，并且只包含 Developer Markdown interface 白名单字段。
43. 同一 Meeting 连续提交时，低版本 pending 或已 stale 的 render 不会覆盖高版本文件；不同 Meeting 的路径和 pending task 相互隔离。
44. temp write、close、rename 或 cleanup 失败保留上一个完整目标文件，并且不改变 Meeting snapshot、version、event、receipt 或 outbox。
45. `archive.md` 只从已提交 `ImmutableArchivePackage` 生成；其缺失、损坏或生成失败不影响 capability revoke、Session interrupt/drain 和 `archived`。
46. Developer Markdown 删除或人工修改不触发 repository 修复；后续新 commit 可以完整覆盖 `current.md`，但 Runtime 不保证文件必然存在。
47. Developer Markdown 没有 HTTP、Tool、Client 或 Agent 读取入口；Runtime dispose 后没有 pending render、重试 timer、未处理 rejection 或本次任务遗留的 temp file。
48. 本地用户的五种操作产生独立 local 审计事实，满足与 Captain 相同的领域校验；Session tool 不因本地入口而扩大权限。风险完成重算满足条件时进入 converging，不自动 end/archive。

## Related Documents

- 架构边界：[`../00-governance/ARCHITECTURE.md`](../00-governance/ARCHITECTURE.md)
- Meeting 协议、存储、Remote 与 Developer Markdown：[`../20-interfaces/MEETING-INTERFACE.md`](../20-interfaces/MEETING-INTERFACE.md)
- Meeting Agent Definition、角色目录与参会推荐：[`../20-interfaces/DSH-ROLE-INTERFACE.md`](../20-interfaces/DSH-ROLE-INTERFACE.md)
- 当前设计：[`../30-designs/MEETING-DESIGN.md`](../30-designs/MEETING-DESIGN.md)

Plugin Frontend 的最小状态读取和会议控制边界由 Interface 定义；本需求文档不规定路由实现、组件结构或视觉样式。
