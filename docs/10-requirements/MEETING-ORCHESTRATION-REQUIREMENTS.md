# Meeting Orchestration Requirements

状态：已确认
适用产品：Convivium DSH Plugin

## Purpose

本文定义 Convivium 连续会议编排的产品需求和验收标准。Convivium 基于 DSH，以纯插件形式提供多 Agent 连续会议能力。

本文只规定用户和会议参与者可以观察到的行为、业务边界及验收结果，不规定数据库、模块、类、状态机、事务、消息格式、工具名称或具体调度算法。

## Scope

- 在 DSH 中创建、运行、暂停、恢复和结束一场多 Agent 会议。
- 让多个独立会议身份围绕明确目标和议题进行连续、有序的讨论。
- 让后续发言者能够回应已经提交的前序发言。
- 支持会议内短时发言与会议外异步任务协作。
- 支持议题控制、分歧保留、决策形成、完成判断和会议归档。
- 支持崩溃恢复、迟到结果隔离和可审计的会议记录。

## Non-goals

- 不提供脱离 DSH 运行的独立桌面应用或独立 Agent Host。
- 不要求多个 Agent 同时生成发言。
- 不要求一次会议解决所有发现的问题。
- 不把 MeetingTask 完成直接等同于会议目标完成。
- 不共享 Agent 的隐藏推理、私有工具过程或与会议无关的 Session 历史。
- 不规定、枚举或解释 Agent 内部的 Prompt、Skills、Tools、MCP、命令、推理、工作流或重试策略。
- 不定义开放角色市场、人类席位托管、由 Manager 任意创建角色或跨 DSH 宿主协作。
- 不在本文规定存储引擎、进程边界、源码目录、工具 Schema 或 UI 实现。

## Functional Requirements

### FR-1：DSH 插件形态

1. Convivium 必须作为 DSH 插件安装、加载和运行。
2. 用户不得被要求同时启动一个独立的 Convivium 应用才能使用会议功能。
3. Convivium 支持的最低 DSH 版本必须为 `0.1.1-rc.2`；低于该版本时插件必须拒绝加载并说明版本要求，不得以缺失生命周期能力的降级模式运行会议。

### FR-2：会议与身份隔离

1. 每场会议必须拥有独立的会议目标、议程、参与者、发言记录、问题、提案、立场、决策和结束结果。
2. 每个 Agent 在一场会议中的具体身份必须拥有独立、可持续的 DSH Session。
3. 不同会议、不同身份或不同授权范围不得共享同一个 Session 状态。
4. 主持身份不得伪装成普通参与者，也不得以参与者名义形成正式发言或立场。
5. 同一个底层 Agent 承担多个会议身份时，各身份必须保持可区分、可审计。
6. 创建会议时，调用方必须能够定义参与者及其审核责任、风险权限、议题责任和必需参与关系；无效或相互矛盾的配置不得产生部分可用的会议。
7. 新建会议的目标、议题、提案和验收条件必须从明确的未完成初始状态开始，不得在创建时被预先标记为已接受、已满足或已解决。
8. 每场会议必须具有稳定且唯一的身份，其数据和会议专用 Session 不得与其他会议混淆。

### FR-3：有序连续发言

1. 任意时刻，一场会议最多只能有一位 Agent 获得有效发言权。
2. 主持机制可以为一次讨论周期选择若干参与者，并确定发言顺序。
3. 被选参与者必须按顺序逐个收到发言请求；不得先并发请求全部参与者再排队提交。
4. 后一位发言者必须能获得本次讨论周期中前序参与者已经正式提交的内容。
5. 参与者必须能够回应、质疑、补证、修正、支持或总结前序内容。
6. 发言权被撤销、超时或重新分配后，旧请求的迟到结果不得进入正式会议记录。

### FR-4：发言计划与选择

1. 发言计划必须围绕当前议题和本次讨论目标形成。
2. 显式点名、直接问题、必需复核、议题负责人、相关任务结果和阻塞异议必须优先获得处理。
3. 主持机制可以在规则足以决定时使用确定性规则，在需要语义判断时请求独立主持 Agent 建议。
4. 主持 Agent 的建议必须受到参与者资格、权限、议题、每个 Turn 的最大发言人数、发言请求超时和发言顺序约束。
5. 主持 Agent 不得自行代表参与者接受决策、接受风险或宣布会议业务目标已经完成。
6. 主持 Agent 不可用或建议无效时，会议必须存在确定性的降级选择方式。
7. 必须参与当前计划的 Participant 不可调度时，会议必须停止本次规划并向用户报告具体身份和原因，不得自动替换、豁免或产生部分发言计划。
8. 相同会议状态没有发生变化时，不得自动重复调度同一个不可用的必需 Participant。

### FR-5：异步任务与举手

1. 长时间构建、测试、调研或外部等待不得持续占用会议发言权。
2. 参与者必须能够创建 Convivium-owned MeetingTask，并以简短状态结束当前发言；任务实际执行复用该 Participant 的 DSH continuable Session。
3. 异步任务完成或出现新证据时，相关参与者必须能够申请在后续讨论中发言。
4. 发言申请本身不是正式会议发言，不得直接形成决策或修改正式 transcript。
5. 非阻塞任务运行期间，会议应能继续讨论其他相关内容。
6. 当前目标确实依赖某项未完成任务时，会议可以进入等待，并在条件满足后恢复。
7. 会议运行时必须验证请求者的会议身份、当前 SpeakerAttempt 和授权，再创建 MeetingTask；Participant 不因此获得 Captain 或其他 Participant 权限。
8. MeetingTask 必须能够追溯到所属 Meeting、参与者和当时的正式发言上下文；其结果只有经 Meeting Runtime 授权的 projection 才能进入会议。

### FR-6：议题范围与发散控制

1. 会议必须有明确的总体目标、预期产出、验收条件和约束。
2. 同一时刻必须有一个明确的当前议题；发言默认服务于当前议题。
3. 新发现的问题必须区分为阻塞问题、后续事项、待讨论事项、已接受风险或范围外问题。
4. 只有影响必要产出、验收条件、硬约束、必需审核或未接受高风险的问题，才可以阻塞当前会议目标。
5. 次要问题和潜在风险可以被记录、分配负责人或留待后续会议，不要求本次会议全部解决。
6. 新议题不得因为被提及而自动取代当前议题。
7. 讨论发生漂移、重复或长期没有实质进展时，主持机制必须能够重新聚焦、重新规划或结束会议。

### FR-7：提案、立场与决策

1. 参与者只能以自己的会议身份提交立场，不得代表其他参与者表态。
2. 参与者可以提出候选决策，但不能自行写入正式决策的接受者、异议者或接受状态；候选记录不可变且不具有持久状态。
3. 正式决策必须依据当前提案版本上的有效立场和 Captain 的明确结构化接受形成；V1 不使用自动接受，Captain 的自然语言意见不能替代该操作。
4. 新提案版本必须独立保存，`positions` 从空集合开始，不得自动继承旧版本的立场、候选决策、正式决策或接受结果。
5. 少数非阻塞意见必须保留在会议结果中，不得为了显示一致而删除。
6. 只有 Captain 和 loopback local user 可以查看当前 Meeting 的 `pendingDecisionCandidates`；该 projection 只包含指向当前 Proposal revision、尚未形成 Decision 且 Meeting 仍可执行的候选，普通 Participant 不可见。候选被接受、Proposal revision 更新或 Meeting execution 进入终态后，必须从该 projection 消失；V1 不提供 candidate reject/revoke 操作。
7. 决策被替代或撤销时，必须通过 Captain-only 的结构化 `supersede` 或 `revoke` 操作；历史决策及其依据必须仍可审计。`supersede` 必须在同一原子提交中接受 replacement candidate、生成 replacement Decision、将旧 accepted Decision 标记为 superseded 并记录替代关系；`revoke` 只能将旧 accepted Decision 标记为 revoked。
8. Captain-only Decision disposal 必须包含 protocol version、Meeting/version expectation、request identity、目标 Decision、action、非空理由和至少一条本 Meeting 证据；`supersede` 必须提供 replacement candidate，`revoke` 不得提供。execution-terminal、archiving 和 archived 状态不得写入 Decision。
9. Captain 在自然语言中表示接受或拒绝风险只构成意见；只有通过明确的结构化风险处置操作并经系统验证后，才能改变正式风险状态。

### FR-8：完成事实与会议结束

1. 会议完成事实可以来自 Agent 的正式提交、经授权的 MeetingTask result projection、required review，以及 Captain 的明确接受、豁免、风险处置或结束操作。
2. `MeetingTask completed` 不得默认等同于 required output accepted、议题解决或会议完成。
3. 参与者可以提交完成声明及其证据，但不能直接覆盖会议目标、验收条件或完成状态。
4. 系统必须验证声明者身份、授权范围、证据归属、审核要求和风险接受权限。
5. 会议完成状态必须由经过验证的完成事实和确定性业务规则得出，不得仅根据自然语言总结宣布完成。
6. 达到业务完成条件时，即使仍有非阻塞后续事项、待讨论事项、已接受风险或少数意见，会议也可以正常完成。
7. 会议不能完成时，必须区分部分完成、无共识、取消和内部失败，并说明原因及未解决事项。
8. 最大 Turn 数、最大消息数、最大会议时长、每个 Turn 的最大发言人数和发言请求超时只限制继续讨论；如果最后一次有效讨论已经满足完成条件，会议必须按正常完成结束。
9. Captain 的结构化风险处置必须明确一个 Issue、动作、理由和证据，并受当前目标的 `acceptableRiskLevel`、hard constraints、Issue status 和 Meeting lifecycle 限制；`riskLevel` 缺失不得推断默认值，处置一个风险不得顺带接受其他风险或正式决策。合法 accept 使 Issue 成为 `accepted_risk` 且 `blocking=false`；合法 reject 使 Issue 保持 `open` 且 `disposition=blocking`、`blocking=true`。每次不同 request 的合法重新处置都必须保留旧 risk acceptance fact 并创建新的 active fact；相同 request 必须幂等重放或报告冲突。

### FR-9：暂停、恢复与故障隔离

1. 会议必须支持暂停和恢复，并保留已经正式提交的会议事实。
2. 用户必须能够通过自然语言指令暂停或恢复会议；插件会议面板必须同时提供与当前状态对应的“暂停”或“继续”按钮。
3. 自然语言指令和按钮必须执行相同的会议控制规则，不得产生两套不同的暂停或恢复语义。
4. 插件重启后，未结束会议必须能够恢复到一致状态，或者明确说明不能恢复的原因。
5. 重复提交不得产生重复发言、重复决策或重复状态变化。
6. 已撤销、已替换或过期的发言请求不得修改当前会议。
7. 会议创建失败或插件异常终止后，不得遗留无法确定所属会议的会议专用 Session。
8. 恢复或关闭会议专用 Session 时，不得操作属于其他会议、其他团队或无法确认归属的 Session。
9. 单个 Agent 的内部工具失败不得自动判定整场会议失败。

### FR-10：会议记录、隐私与归档

1. 正式会议记录必须包含发言顺序、发言身份、议题关系、提案、立场、问题、决策、未解决事项和结束结果。
2. 私聊、举手申请、隐藏推理和未公开的内部工具过程不得自动进入正式 transcript。
3. 会议 Participant 之间必须能够使用 Convivium 的受控 mailbox 进行异步私聊；meeting-scoped mail 必须携带发送时可见的会议上下文快照。
4. Agent 实际处理 meeting-scoped mail 前，必须在权限范围内补充快照之后新增的正式 transcript，并固化本次处理使用的上下文上界。
5. 私聊处理结果不得直接修改正式 transcript、决策或完成状态；需要公开讨论时必须申请发言，长时间工作必须转为异步任务。
6. 用户必须能够区分当前发言者、主持建议、异步任务、等待原因和正式决策。
7. 会议结束后必须形成内容完备、不可运行的归档包，至少包含最终成果、完成依据、正式记录、未解决事项和来源信息。
8. 归档包只保留 Participant 的会议身份、角色和必要模板版本等溯源信息，不得包含完整运行配置、私有 Session 历史或权限 capability。已关闭 Session 数据可以按 workspace/DSH retention policy 保留，但不得通过归档包、UI 或续会暴露。
9. 会议进入 `archiving` 后不得恢复讨论；只有全部会议专用 Session 已停止、关闭并失去继续参与该会议的权限后才能进入 `archived`。物理删除 Session 数据不是归档完成条件。
10. 基于旧会议继续讨论时必须创建新会议和新的会议身份 Session，并从归档中显式选择可复用素材；不得自动继承完整 transcript、旧运行状态、旧配置或旧权限。
11. 会议可以使用可选 Scribe Agent 从正式会议事实形成引用式纪要草稿；Scribe 不得创建、修改或替代 Runtime-owned transcript、事实或决议，其缺席、失败或被替换不得影响正式记录的完整性。

### FR-11：可观察性与用户控制

1. 用户必须能够查看当前议题、当前讨论目标、计划发言者、当前发言者、正式 transcript、阻塞项、后续事项、异步任务、适用的 Turn/消息/时长/发言人数/超时限制、结束结果，以及 Captain/local 可见的 pending decision candidates、accepted decision history 和 risks projection；普通 Participant 不得通过该状态读取获得这些 Captain/local 专属数组。
2. V1 面板必须列出本地 Host 中全部可恢复 Meeting 的轻量摘要；用户选择其中一项后，面板才读取该 Meeting 的完整状态。列表不得包含 transcript、Session ID、capability、backend 物理路径或私有运行数据；任一已发现 Meeting 无法恢复时，列表必须报告暂不可用，不得返回部分列表。
3. 用户必须能够暂停、恢复、结束会议，以及在适用的会议控制入口中撤销或重新分配当前发言权。V1 的插件面板运行于单个 loopback DSH Host，不绑定 Web 用户身份、不校验 Team 权限；到达该 Host 的请求共享该本地用户边界。
4. 会议运行时，面板必须显示“暂停”；会议已暂停时，面板必须显示“继续”，并清楚显示暂停原因和发起者。
5. 任何降级选择、强制结束、审核豁免、风险接受和部分完成都必须向用户显示原因。
6. 产品必须通过完整的会议状态读取展示正式会议事实，不得把本地缓存或自然语言摘要当作状态真相源。
7. 用户重新打开或刷新会议后，必须看到完整且一致的当前事实；状态 projection、HTTP response、Client 只读展示和 archive-facing history 必须对同一已提交事实保持一致。
8. 会议操作可以出现在 DSH 原生工具调用记录中，但这些记录不得替代正式会议状态、transcript 或审计记录。

### FR-12：Agent 内部能力边界

1. Convivium 只规定 Agent 之间以及 Agent 与会议之间交换的身份、上下文、公开结果和授权边界。
2. Agent 可以在 DSH 授权范围内自行选择 Prompt、Skills、Tools、MCP 和内部工作方式。
3. Convivium 不得依赖某个具体 Skill、内部 Tool Schema、工具调用顺序或隐藏推理才能正确运行会议。
4. Agent 内部工具失败、重试或策略选择不得自动成为正式会议事实。
5. 只有 Agent 明确提交的会议发言、结构化声明、发言申请，以及经授权暴露的 DSH 异步任务结果，才能进入会议协议。
6. Convivium 可以限制自身会议操作的调用权限，并向 DSH 提供会议身份的授权上限；它不得扩大用户或 DSH 已授予的 Agent 权限。
7. Agent 内部数据进入会议前必须经过公开提交、权限检查和必要的信息过滤。
8. Participant 对后台任务的请求属于 Agent 与会议系统之间的公开操作；任务内部使用的 Skills、Tools、MCP 和执行过程仍由 DSH 管理。
9. 会议私聊的身份、可见上下文、串行处理和处理状态由会议系统保证；Agent 如何理解或回复 mail 仍属于 Agent 内部过程。

### FR-13：Agent 角色目录与参会推荐

1. DSH Host 可以向 Meeting Runtime 提供经过当前 Captain 授权范围过滤的版本化 Agent 角色目录；目录必须区分角色定义、可用 Agent candidate 和当前 Meeting Participant。
2. Manager 必须能够获得与当前会议目标、议题和证据缺口有关的最小安全目录 projection，但不得获得模型凭据、完整 Prompt、私有工具配置、Session 历史或其他敏感运行配置。
3. Manager 可以推荐目录中的某个 Agent 参加当前会议，并必须说明相关议题、预期贡献及需要补充的职责或证据；推荐本身不得创建 Participant、DSH Session 或正式立场。
4. Manager 不得推荐自己成为 Participant，不得推荐目录之外或不可用的 Agent，也不得通过推荐授予 required-review、risk acceptance、Captain、Manager 或额外 DSH 权限。
5. 只有 Captain 的独立结构化批准才能接纳被推荐 Agent；自然语言同意、Manager plan 或 research result 均不得替代批准操作。
6. Captain 批准后，Meeting Runtime 必须为该身份创建独立 meeting-owned continuable Session；Session provisioning 完成前，该身份不得进入发言候选集或调用 Participant 操作。
7. 新接纳的 Agent 默认是普通可选 Participant；批准不得自动修改 objective contract、required reviewer、risk authority、议题 required Participant 或已有 Participant 的权限。
8. recommendation、Captain disposition、Participant admission 和 provisioning 结果必须可审计、幂等、可恢复，并受 Meeting version、终态拒写和跨 Meeting 隔离约束。
9. candidate 的 Meeting Agent Definition 不存在、其引用的 DSH Preset/Skill 无法验证，或 Session provisioning 失败时，不得产生部分可用 Participant；会议必须显示失败原因，并允许 Manager 在新状态上推荐替代 candidate。
10. GitHub、arXiv 和 Web research 角色必须按证据来源和分析责任区分；Manager 应先参考已有 evidence 索引，不能仅因搜索工具可用而重复推荐多个 Agent 处理相同来源范围。

### FR-14：Meeting Agent Definition 与 DSH composition boundary

1. Convivium 必须能定义版本化 Meeting Agent Definition；Definition 只包含稳定定义 ID、版本、会议角色、显示摘要、persona、DSH Agent Preset 引用、required DSH Skill 名称、optional DSH ToolRestriction、expertise tags 和 evidence scopes。
2. Agent Definition 和 Meeting identity 由 Convivium 管理；Agent Preset、Skills、Tools、MCP、Sandbox、Approval、模型配置、capability composition 和 AgentSession runtime 由 DSH 管理。
3. `dshPresetId` 只引用 DSH 原生 Agent Preset；`requiredSkillNames` 只声明未来 Host-side validation 的必需 DSH Skill；Convivium 不建立 Preset、Skill、Tool、MCP 或 permission registry/installer。
4. `toolFilter` 必须使用 DSH 原生 `ToolRestriction`，并且只能收窄目标 Preset 已提供的 Tools，不能授予新 Tool 或扩大 DSH/用户权限。
5. `persona` 只提供 meeting-specific role instruction，不授予 Skill、Tool、MCP、Sandbox、Approval、模型或 Meeting authority；仓库 `AGENTS.md` 也不作为隐式 Agent capability。
6. Manager recommendation 和 Captain approval 只能选择 Definition 对应的会议身份；只有 DSH 完成独立 continuable AgentSession provisioning 后，该身份才能成为可调度 Participant。
7. Definition resolution、Preset/Skill validation 或 DSH capability composition 任一失败时必须 fail closed，不得通过 Prompt-only、persona-only、Tool Schema 隐藏或 Convivium 自建 capability installer 降级运行。
8. 当前 DSH `0.1.1-rc.2` 不能为 continuable child 选择不同于 parent 的 Agent Preset；在 DSH 提供公开 per-child preset composition API 前，Definition 到差异化 AgentSession 的 runtime 接线保持未实现。

## Business Rules

### BR-1：Turn 含义

一个 Turn 是主持机制围绕一个议题安排的有序发言周期，可以包含一位或多位参与者。Turn 中的参与者完成、跳过、撤销或失败后，该 Turn 才结束。产品不另设含义重叠的 Round 计数。

### BR-2：单一有效发言权

一场会议同时最多存在一个有效发言请求。重新分配、恢复或重试必须使旧请求失效。

### BR-3：完成判断边界

会议级完成判断和硬限制判断在 Turn 结束时进行，顺序为先判断业务完成，再判断是否允许创建下一 Turn。单个 Turn 内仍可在每次发言结束后检查是否允许继续请求下一位发言者。

### BR-4：主要问题与次要问题

问题是否需要在本次会议继续深入，取决于它是否影响必要产出、验收条件、硬约束、必需审核或未接受风险，而不取决于讨论热度、文本长度或提出者身份。

### BR-5：工具失败边界

Agent 内部工具、命令或 MCP 失败属于 Agent 的执行过程。只有它造成发言请求无法合法完成、Session 不可用或必要任务无法取得结果时，才影响会议运行状态。

### BR-6：身份与授权

所有正式发言、立场、审核、风险接受和决策操作都必须绑定 DSH 提供的真实调用 Session。客户端提供的显示名称或身份标识不能单独作为授权依据。

### BR-7：归档边界

归档对象是 Meeting 的正式成果和溯源事实，不是 MeetingState 或 AgentSession 的运行时副本。归档包必须先完整物化；会议专用 Session 随后停止、关闭并撤销 capability，全部完成后才能进入 `archived`。Session 数据是否物理保留由 workspace/DSH retention policy 决定；TeamMember Session 不因会议归档而关闭。

新会议只能通过显式选择的续会素材引用旧归档；旧归档仍保持不可变，旧会议不得恢复运行。

### BR-8：会议协议边界

Convivium 的权限规则只约束会议身份、会议上下文和 Convivium 提供的会议操作。Agent 的通用 Skills、Tools 和 MCP 由 DSH 负责加载、授权和执行，Convivium 不复制其 Schema，也不干预其内部编排。

### BR-9：会议私聊边界

Meeting-scoped mail 是私有异步消息，不是正式会议事实。发送时快照和处理时 transcript 增量都只能包含接收者有权查看的公开会议内容；同一次 mail 处理的上下文范围一旦固化，重试不得随会议推进而漂移。

### BR-10：参会推荐与接纳边界

Manager recommendation 是待 Captain 处置的结构化建议，不是 Participant、发言权、审核身份或权限事实。只有 Captain 批准且独立 Session provisioning 成功后，被推荐 Agent 才成为可调度 Participant；批准不能改变 objective contract 中已经固化的 required-review、risk authority 或必需参与关系。

### BR-11：Meeting Agent Definition 与能力所有权

Meeting Agent Definition 描述 Convivium 会议角色并引用 DSH capability，但不安装 capability，也不产生 Meeting authority。Convivium 只管理 Definition、会议身份、选择、批准和 Session ownership；DSH 管理 Preset、Skills、Tools、MCP、Sandbox、Approval、模型、组合与执行。任何 Definition 字段、Prompt 或 persona 都不能覆盖 Runtime 根据真实 Session、Meeting identity 和当前 attempt 形成的授权结果。

## Acceptance Criteria

1. 创建包含至少三位 Agent 的会议后，任意时刻最多只有一位 Agent 被请求发言。
2. 同一 Turn 中第二位 Agent 收到的会议上下文包含第一位 Agent 已正式提交的发言。
3. 当前发言权被重新分配后，原 Agent 的迟到提交被拒绝且不进入 transcript。
4. 长时间任务创建为 MeetingTask 后，合法的简短 `submit_turn` 可以释放发言权；任务完成后相关 Participant 可以申请后续发言。
5. 新出现但不影响目标验收的问题被记录为后续事项或待讨论事项，不阻止会议完成。
6. 没有有效阻塞依据的问题不能阻止会议完成。
7. Participant 不能为其他身份提交立场，也不能直接指定正式决策的接受者或状态；候选不是正式 Decision，且普通 Participant 不获得 pending candidate projection。
8. 新 proposal revision 的 `positions` 为空，不继承旧 revision 的立场、candidate、Decision 或 acceptance；接受事件统一为 `decision.accepted`，不存在 `decision.added` 兼容事件。
9. MeetingTask 完成但 required review 未通过时，会议不能把对应产出标记为 accepted。
10. 经过授权和证据验证的完成声明可以更新相应产出、验收条件、议题、问题或风险状态。
11. 所有必要产出和验收条件满足后，即使存在非阻塞后续事项或少数意见，会议仍能正常完成。
12. 最后一个 Turn 同时满足完成条件和硬限制时，结果为正常完成，而不是部分完成。
13. 插件重启后，正式提交内容不丢失，重复投递不产生重复会议事实；request identity 相同且 validated request serialization 相同的重试必须重放原 receipt/result，identity 相同但 serialization 不同必须拒绝。
14. 会议创建中断后，已经产生的会议专用 Session 仍能被确定性归属和安全关闭，不会影响其他会议或团队的 Session。
15. `archived` 对外可见时，所有会议专用 Session 已停止、关闭并失去会议 capability；归档包不包含可恢复 Session、完整 Agent 运行配置或私有 Session 历史，但底层已关闭数据可以按 DSH retention policy 保留。
16. 用户可以观察当前议题、发言计划、当前发言者、等待原因、阻塞项、异步任务、决策 history、当前 accepted decisions、按权限过滤的 pending candidates/risks 和结束原因；状态读取不得暴露 Session、capability 或 backend 物理细节。
17. 更换 Agent 的内部 Skills、Tools 或执行顺序，在其仍遵守相同会议协议时，不改变会议编排的正确性。
18. Agent 内部工具失败但随后仍能合法提交发言时，会议不会因此增加会议级失败计数。
19. Participant、Manager 和 Captain 只能调用其获授权的 Convivium 会议操作，但 Convivium 不枚举或接管其普通 DSH Tools。
20. 必需 Participant 不可调度时，本次规划失败并显示身份和原因；会议不产生部分计划，也不会在状态未变化时自动重复规划。
21. Meeting-scoped mail 保存发送时上下文范围；延迟处理时补充截至处理开始的可见 transcript，随后重试使用同一固定范围。
22. 同一个会议身份不会同时处理私聊和正式发言请求；mail 回复不会自动进入 transcript 或取得发言权。
23. 普通 TeamMember mailbox 不携带会议上下文时保持原有行为；会议参与者不需要复用或伪装成 TeamMember Session 即可收发会议私聊。
24. Mail handling 具有明确超时；私聊处理不得无限占用 Participant Session 或阻塞正式发言，长时间工作必须转为 MeetingTask。
25. 创建会议时，重复、缺失、相互矛盾或引用无权访问对象的参与者配置会使创建整体失败，且不产生部分可用的会议。
26. Captain 的自然语言风险意见不会改变会议状态；合法的结构化风险处置只影响指定 Issue，验证 `riskLevel <= acceptableRiskLevel`、hard constraints、状态、理由和本 Meeting 证据，生成可审计事实并触发确定性完成重算；旧 risk facts 不删除。
27. 归档前会校验最终成果、完成依据、正式 transcript、未解决事项、来源信息、全部 Decision history、全部 Issue 和全部 risk facts 已经物化；Session 关闭失败时会议保持不可讨论的 `archiving`，且输出物不会丢失。
28. 从旧会议创建新会议时，只导入 Captain 显式选择且有权访问的归档素材，并保留来源引用；不会继承旧 Session、capability、完整 transcript 或运行状态。
29. V1 面板先读取本地 Meeting 列表；选择一个摘要后只读取被选择 Meeting 的完整状态，列表本身不暴露 transcript、Session ID、capability、backend 物理路径或私有运行数据。任一已发现 Meeting 无法恢复时，列表报告暂不可用且不返回部分结果。
30. Manager 收到的 Agent Catalog projection 不包含敏感 DSH 配置，并且只能引用当前 snapshot 中可用的 candidate 形成参会 recommendation。
31. Manager 推荐 Agent 后，该 Agent 在 Captain 批准和 Session provisioning 成功前不会进入 speaker candidates，也不能提交会议事实。
32. Captain 批准 recommendation 只创建普通可选 Participant，不会自动授予 required-review、risk acceptance、Captain、Manager 或超出 DSH Agent Preset 和 policy 的权限。
33. 被批准 Agent 的 provisioning 失败时，会议中不存在部分可用 Participant；失败可恢复、可审计，且不影响其他 Meeting 或 Participant Session。
34. 已有证据满足当前 freshness 和来源范围时，Manager 不会仅因 GitHub、arXiv 或 Web 搜索能力可用而重复推荐相同研究工作；明确的独立交叉验证除外。
35. 每个 Agent Definition 都有稳定 `agentDefinitionId` 和 `definitionVersion`，并明确引用一个 `dshPresetId` 与 required DSH Skill 名称；Definition 不复制 DSH capability 内容。
36. `toolFilter` 只能收窄目标 Preset 已有 Tools；Definition、persona 或 Skill 名称不能授予 Tool、MCP、Sandbox、Approval 或模型权限。
37. Manager 只看到 Agent Definition 的安全摘要；recommendation 不创建 Session，Captain approval 也必须等待独立 Session provisioning 成功后才能形成可调度 Participant。
38. Definition、Preset 或 required Skill 无法解析和验证时，provisioning 整体失败，不产生部分可用 Participant，也不使用 Prompt-only 或 Convivium installer workaround。
39. 在 DSH 提供并验证 per-child preset composition API 前，系统必须把差异化 Agent capability runtime 标记为未实现；Definition 样本存在不得被描述为 capability 已安装。
40. delegated meeting-owned Agent 不会等待无人处理的交互式 Approval，也不能从自身 Session 内扩大启动时固化的权限。
41. Scribe 生成的纪要草稿标明覆盖范围并引用正式 message、Fact、Decision、Issue 或 task result ID；缺少引用或覆盖不连续时不会被当作权威 transcript、正式事实或决议。

## Related Documents

- 架构边界：[`../00-governance/ARCHITECTURE.md`](../00-governance/ARCHITECTURE.md)
- Agent 间会议协议：[`../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)
- Agent 角色目录与参会推荐：[`../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)
- Meeting Agent Definition：[`../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)
- 当前实现设计：[`../30-designs/MEETING-ORCHESTRATION-DESIGN.md`](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)

Plugin Frontend 的最小状态读取和会议控制边界由 Interface 定义；本需求文档不规定路由实现、组件结构或视觉样式。
