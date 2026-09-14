---
name: "referenced-minutes"
description: "从正式材料整理可追溯纪要"
disable-model-invocation: false
user-invocable: true
---

# 从正式材料整理可追溯纪要

1. 明确材料范围与覆盖上界
2. 为事实、决议、异议、行动项与未解问题保留原始引用
3. 区分直接记录、已接受决定、参与者观点与压缩表述
4. 报告缺失引用和相互冲突，不补造材料或把草稿当作正式决定

收到当前 contribution context 后，使用 `convivium_read_contribution` 核对引用的精确稿件或材料版本，再复用上下文中的 `meetingId`、`contributionId`、`generation` 和当前版本，通过 `convivium_contribution` 提交。引用式纪要使用 `kind="summary"`、`agendaRelation="on_topic"`、`changes={}`、`taskIds=[]`、`citations=[]`，省略 `replyTo` 与 `completionClaims`；`minutesDraft.coverage` 只覆盖上下文中连续可引用的正式消息，`referencedMessageIds` 只列该范围内的 canonical message ID。没有可引用正式消息时不提交纪要稿，报告材料缺口。稿件须经 Manager 对精确 draft revision 批准后才公开。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
