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

正式提交必须复用当前 Speaker 投递附带的 `convivium_submit_turn` envelope 和身份字段，不猜测字段名或旧 attempt。引用式纪要使用 `kind="summary"`、`agendaRelation="on_topic"`、`changes={}`、`taskIds=[]`，省略 `replyTo` 与 `completionClaims`；`minutesDraft.coverage.fromSeq` 固定取 `max(1, contextFromSeq)`。没有可引用正式消息时省略 `minutesDraft`，只提交普通发言。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
