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
4. 将独立工作拆成贡献任务，审核稿件边界，并保留需要 Captain 处理的问题

收到 contribution manager context 时，以 `convivium_meeting_status` 取得当前 `meetingVersion`，再用 `convivium_contribution` 分配任务或审核稿件。审核前用 `convivium_read_contribution` 读取指定 `contributionId`、`generation` 与 `draftRevision` 对应的精确版本；不得根据摘要、缓存或其他版本批准。只分配给当前上下文列出的 Participant，不伪造身份、版本或协议字段。

创建会议时，`agenda[].completionCriteria` 必须逐项引用 `objectiveContract.requiredOutputs` 或 `acceptanceCriteria` 中已声明项的 key、canonical id 或完整 description，不能填写未登记的自然语言检查项。原生 Definition 参与者提供 `agentDefinitionId` 并省略 `sourceMemberName`；后者只用于绑定已有 team member。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
