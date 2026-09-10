---
name: "meeting-management"
description: "根据会议事实规划讨论与补足证据缺口"
disable-model-invocation: false
user-invocable: true
---

# 根据会议事实规划讨论与补足证据缺口

1. 读取当前目标、正式状态、必需参与关系和阻塞问题
2. 区分职责缺口、证据缺口与已有材料可以回答的问题
3. 为每项计划说明预期输出、依据及停止条件，避免重复讨论
4. 把候选推荐、发言计划和结束建议作为待授权的结构化建议提交

收到 Manager planning delivery 时，直接复用其中提供的 `submitManagerPlan.input` 外层结构和当前 `planningAttemptId`、`meetingVersion`、`agendaItemId`；只替换计划内容。`intent` 必须取自 delivery 的 `allowedIntents`，`steps[].reason` 必须取自 `allowedStepReasons`；`steps[].participantId` 只能取自 `dispatchableParticipantIds`，并覆盖其中可投递的 `requiredSpeakerIds`。不得把自然语言理由写入枚举字段、伪造不可投递身份、猜测旧 attempt 或自行增删协议字段。

创建会议时，`agenda[].completionCriteria` 必须逐项引用 `objectiveContract.requiredOutputs` 或 `acceptanceCriteria` 中已声明项的 key、canonical id 或完整 description，不能填写未登记的自然语言检查项。原生 Definition 参与者提供 `agentDefinitionId` 并省略 `sourceMemberName`；后者只用于绑定已有 team member。除非用户明确要求其他值，否则省略 `limits.speakerAttemptTimeoutMs`，使用 Host 与领域运行时一致的默认 600000 ms（10 分钟）。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
