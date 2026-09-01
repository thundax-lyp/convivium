# Convivium Domain Model Design

状态：当前 Domain 数据结构设计基线

## Purpose

本文是 Convivium Meeting Domain 数据结构的唯一真相源。

本文定义核心对象的字段、ID 引用、集合关系、持久化边界和数据不变量。需求、接口和编排设计可以引用本文，但不得重复定义 Domain 数据结构。

本文不定义调度算法、状态转换流程、SQLite 表结构、DSH 调用、HTTP、工具、UI 或 Agent 内部能力。

## Domain Event Ownership

Domain event 是 Convivium 会议事实的唯一事件语义来源。`DomainEventType` 和 `DomainEvent` 由 Domain 定义，描述已经发生的会议事实；Repository 只原样持久化 Domain event，并附加 `eventSeq`、`meetingVersion`、时间和索引字段等存储元数据。

Repository 不维护独立的事件词汇，不把 Domain event 通过字符串转换为另一种事件。Domain transition 中仅有内部状态变化、没有独立会议事实的变化，不产生持久化 Domain event。

DSH `tool/call`、`tool/result`、Session lifecycle 和其他 DSH-owned Session Event 不属于 Domain event。它们由 DSH 定义和持久化，不能写入 Convivium 的 `meeting_events`。

当前 Domain event 词汇包括会议生命周期（`meeting.*`）、Turn 生命周期（`turn.*`）、speaker 分配与执行（`speaker.*`、`speaker_attempt.*`）、Manager plan（`manager_plan.*`）、MeetingTask 与 HandRaise（`meeting_task.*`、`hand_raise.*`）以及正式会议事实（`message.added`、`decision.added`、`archive.sessions_closed`）。具体允许值由 `plugin/src/domain/model.ts` 的 `DomainEventTypes` 集中定义。

## Authority And Boundaries

- MeetingState 是 Meeting Domain 的完整当前事实模型。
- SQLite state_json 必须无损保存和恢复 MeetingState；SQLite event、receipt、outbox 和 DSH Session 不得形成第二份业务状态。
- Domain 不依赖 protocol、DSH、SQLite、HTTP、React 或文件系统。
- Protocol projection 可以裁剪或重命名字段，但不得改变 Domain 事实。
- Session capability、outbox lease、私聊正文和 Agent 内部运行历史不属于 MeetingState。
- 所有 Domain ID 都是不透明字符串；调用方不得从 ID 格式推断权限、时间或顺序。
- 领域对象中的引用必须指向同一 Meeting 内已存在的对象，除非字段明确表示外部来源。

## Canonical Identifier Semantics

| ID                                   | 语义                               |
| ------------------------------------ | ---------------------------------- |
| meetingId                            | 一场会议的稳定身份                 |
| participantId                        | 会议内身份，不等于 TeamMember ID   |
| agendaItemId                         | 正式议题                           |
| agendaCandidateId                    | 尚未成为正式议题的议题候选         |
| turnId / stepId                      | 有序发言周期及其位置               |
| attemptId                            | 一次有效 speaker capability        |
| planningAttemptId                    | 一次有效 Manager plan capability   |
| deliveryId                           | 一次投递及其重投的稳定身份         |
| messageId                            | 正式 transcript message            |
| proposalId / positionId / decisionId | 提案、立场和正式决策               |
| issueId / questionId                 | 问题和问题回答对象                 |
| completionFactId                     | 不可变完成事实                     |
| meetingTaskId / executionId          | Convivium MeetingTask 及其执行尝试 |

字段未明确允许缺失时不得使用 null。集合字段始终存在，使用空数组表示没有元素。

## MeetingState

MeetingState 必须包含以下字段：

| Group        | Fields                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Identity     | id, teamId, sourceMeetingId?                                                                             |
| Objective    | topic, objective, objectiveContract                                                                      |
| Lifecycle    | status, termination?, archive?                                                                           |
| Participants | manager, participants, attendanceRecommendations, participantAdmissions                                  |
| Agenda       | agenda, activeAgendaItemId?, issues, agendaCandidates, continuationMaterials                             |
| Formal facts | transcript, proposals, decisions, openQuestions, handRaises, meetingTasks, completionFacts, artifactRefs |
| Progress     | turnSeq, messageSeq, eventSeq, currentTurn?, waitState?, progressFingerprint?, stallCount, replanCount   |
| Limits       | selectionMode, limits                                                                                    |
| Versioning   | version, createdAt, updatedAt                                                                            |

核心约束：

- 同一时刻最多一个 activeAgendaItemId。
- agendaCandidates 必须是结构化 AgendaCandidate，而不是 string[]。
- waiting 状态必须有 waitState；离开 waiting 时清除 waitState。
- 当前事实由 state_json 恢复，不从 Markdown、自然语言摘要或 event replay 猜测。

## Participant And Manager

### MeetingParticipant

必须包含 sourceMemberName?、displayName、role?、status、lastDeliveredSeq、lastAcknowledgedSeq、consecutiveSpeeches、consecutiveAttemptFailures 和 totalSpeeches。

status 为 available、busy、speaking、unavailable、failed 或 removed。Participant 与 meeting-owned AgentSession 的绑定属于 Runtime，不进入 MeetingState。

### MeetingManagerRuntime

必须包含 `promptVersion: string`、status、currentPlanningAttempt? 和 `lastDecisionMeetingVersion?: number`。Manager 与 meeting-owned AgentSession 的绑定属于 Runtime。

status 为 creating、idle、planning、failed 或 closed。Manager 是会议控制身份，不代表任何 Participant，不直接拥有 transcript、Decision、risk 或 MeetingTask 的写入权。

### AttendanceRecommendation And ParticipantAdmission

AttendanceRecommendation 必须包含 id、candidateId、roleDefinitionId、agentDefinitionId、agendaItemId、rationale、expectedContribution、evidenceGapIds、urgency、status、createdAt 和 Manager planning provenance。status 为 pending、approved、rejected、expired 或 cancelled。

ParticipantAdmission 必须包含 id、recommendationId、candidateId、participantId、agentDefinitionId、status 和 failureCode?。status 为 approved、provisioning、active、failed 或 cancelled。只有 active admission 对应的 Participant 才可进入发言候选集；pending recommendation 与非 active admission 不授予 Meeting capability。

### ManagerPlanningAttempt

必须包含 id、observedMeetingVersion、reason、status、deliveryId、createdAt 和 deadlineAt?。

reason 为 initial_plan、next_turn、semantic_arbitration、refocus、stall、replan 或 termination_review。status 为 pending、running、submitted、revoked 或 failed。

## Objective, Agenda And Issues

### ObjectiveContract

必须包含 requiredOutputs、acceptanceCriteria、hardConstraints、requiredReviewers、riskAcceptanceAuthority 和 acceptableRiskLevel。

required output 初始为 pending；acceptance criterion 初始为 satisfied=false。

### AgendaItem

必须包含 id、title、objective、inScope、outOfScope、completionCriteria、owner?、requiredParticipants、relatedTaskIds、status 和 resolution?。

### AgendaRelation

MeetingMessage 的 agendaRelation 必须为 on_topic、supporting_context、new_topic_candidate 或 blocking_interrupt；plan 是按执行顺序排列的只读计划项字符串集合。

### MeetingIssue

必须包含 id、title、description、sourceMessageId、agendaItemId?、affectedOutputIds、affectedCriterionIds、violatedConstraintIds、blockingObjectionIds、impact、urgency、reversibility、safeDefaultAvailable、disposition、rationale、owner?、relatedTaskIds 和 status。

Issue 只有引用 required output、acceptance criterion、hard constraint 或 blocking objection 时才能标记为 blocking。

### AgendaCandidate

必须包含 id、proposedBy、sourceMessageId、title、reason、relationToActiveAgenda、urgency、suggestedParticipants、status 和 createdAt。

## Turn, Step And Attempt

### MeetingTurn

必须包含 id、seq、agendaItemId、intent、objective、expectedOutputs、prohibitedTopics、plan、currentStepIndex、status、createdAt 和 completedAt?。

intent 为 explore、clarify、challenge、review、resolve_objection、synthesize、decide、report_task_result 或 refocus。

### SpeakerStep

必须包含 id、speaker、instruction、reason、status 和 attempt?。speaker 必须是 Participant ID。reason 使用统一的 SpeakerSelectionReason 枚举。

### SpeakerAttempt

必须包含 attemptId、participantId、contextFromSeq、contextThroughSeq、deliveryId、deliveryStatus、taskSnapshots、assignedAt，以及 startedAt?、completedAt?、deadlineAt?、deliveredAt? 和 acknowledgedAt?。

一个 Meeting 同时最多一个活动 SpeakerAttempt。重试必须创建新 Attempt，不能复活旧 capability。context 范围和 taskSnapshots 在 Attempt 创建时固化，重投不得漂移。

### MeetingTask

MeetingTask 是 Convivium 所有的 MeetingState 正式事实，必须包含 meetingTaskId、participantId、originatingSpeakerAttemptId、executionId、deliveryId、title、description、blocking、status、createdAt，以及 resultSummary?、failureReason?、queuedAt?、startedAt? 和 finishedAt?。status 为 requested、queued、running、completed、failed 或 cancelled。MeetingTask 不重复保存 meetingId 或 participantSessionId；调用方身份和 Session ownership 每次由 Runtime 解析。

### MeetingTaskSnapshot

必须包含 meetingTaskId、status、resultSummary? 和 observedAt。

TaskStatus 为 requested、queued、running、completed、failed 或 cancelled。Task snapshot 是已固化的 MeetingTask 公开投影，不是第二份事实源。

## Messages, Proposals And Decisions

### MeetingMessage

必须包含 id、seq、turnSeq、turnId、stepId、attemptId、speaker、agendaItemId、agendaRelation、kind、content、mentions、taskIds 和 createdAt，并允许 replyTo?。

### MeetingProposal And ParticipantPosition

Proposal 必须包含 id、title、description、proposedBy、agendaItemId、revision、status、positions、createdAt 和 updatedAt。

Position 必须包含 id、proposalId、participant、position、blocking、proposalRevision 和 updatedAt，并允许 reason?。

新 proposal revision 不得继承旧 revision 的 Position 或 acceptance；旧 revision 必须保留到不再需要审计为止。

### MeetingDecision

Decision 必须包含 id、agendaItemId、proposalId、proposalRevision、statement、rationale、status、acceptanceMode、acceptedBy、dissentingPositionIds、acceptanceFactIds 和 createdAt。

Decision 只能由 Runtime 生成，Participant 不能直接创建或覆盖。

### MeetingQuestion And MeetingHandRaise

Question 必须包含 id、text、askedBy、agendaItemId、blocking、affectedOutputIds、affectedCriterionIds、violatedConstraintIds、status、createdAt，并允许 directedTo?、answerMessageId?。三个 evidence 数组是 canonical Meeting fact，新建 Question 总保存数组；公开 archive/projection 对历史记录允许缺失字段。`question.added` 记录 canonical Question 创建事实；`question.answered` 只记录 Question 与 caller authored answer message 的不可变关联，不得改写 evidence。blocking Question 必须引用 active objective contract 中仍未满足的 output、criterion 或 hard constraint；错误不创建 Question。

HandRaise 必须包含 id、participant、reason、summary、taskIds、priority、status、createdAt，并允许 replyToMessageId?、agendaItemId?、resolvedAt?。

HandRaise 是调度输入，不是 transcript、Decision 或 CompletionFact。

## Completion, Limits And Termination

### CompletionFact

必须包含 id、kind、subjectId、assertedBy、authority?、result、evidenceMessageIds、taskIds、status 和 createdAt，并允许 reason?。

事实失效时创建替代事实，不原地修改 actor、authority 或 evidence。

### MeetingLimits

必须包含 maxTurns、maxSpeakersPerTurn、maxTotalMessages、maxDurationMs?、maxConsecutiveSpeechesPerSpeaker、maxConsecutiveAttemptFailuresPerParticipant、maxDeliveryRetries、maxStalls、maxReplans、speakerAttemptTimeoutMs? 和 mailHandlingTimeoutMs?。

### MeetingTermination

必须包含 code、reason、decisionIds、unresolvedQuestionIds、dissentingPositionIds、blockingAgendaItemIds、finalMessage 和 endedAt。termination 中的所有 ID 必须属于当前 Meeting。finalMessage 是展示快照，不得用于重建事实。

## Archive And Continuation

ArchivePackage 必须包含 objectiveContract、finalSummary、artifactRefs、acceptedDecisions、proposals、completionFacts、agenda、issues、unresolvedQuestions、parkingLot、formalTranscript、participantProvenance、managerPromptVersion、termination、endedAt 和 materializedAt。

ArchivePackage 不得包含可恢复的 Agent Session ID、capability、完整 Agent 配置、工作目录、MCP、隐藏推理、私有工具过程、私有 mailbox、SpeakerAttempt、delivery/outbox payload 或完整 speaker context。

ArchivePackage 物化后不可变。续会只通过显式选择的 continuation materials 创建新的 Meeting、Participant ID、Session 和 capability。

## Initial State And Defaults

创建输入只包含 Spec，不接受运行期 ID、状态、resolution、Decision、Position、CompletionFact、Session capability 或 archive package。

初始 MeetingState 必须满足：

- status 为 created。
- required output 为 pending。
- acceptance criterion 为 satisfied=false。
- AgendaItem 为 pending。
- 正式事实集合为空，除显式授权选择的 continuation materials 外。
- 不存在 active Turn、Attempt、Decision acceptance 或 CompletionFact。
- turnSeq、messageSeq、eventSeq、stallCount、replanCount 和 version 从 0 开始。
- selectionMode 省略时为 hybrid。
- maxDurationMs 可缺省；其他 limits 必须有确定值。

## Persistence And Mapping

- Domain model 是 state_json 的 canonical shape；读取时必须进行结构校验。
- Domain model 不等同于 Protocol projection、SQLite table schema 或 DSH Session ownership。
- Protocol、Repository、Archive 和 Runtime 必须提供显式字段映射。
- 新增必填字段、枚举删除、结构变更和字段重命名必须有显式 migration。
- Session ID、capability、outbox payload、私聊和内部运行数据不得进入 ArchivePackage。
- ArchivePackage 可以保留 agentDefinitionId 作为非敏感 provenance，但不保存 persona 或 DSH capability 配置。

## Acceptance

实现者无需从需求、接口和其他设计章节拼接 Domain model，即可依据本文确定核心字段、ID 引用、集合结构、初始化边界和数据不变量。
