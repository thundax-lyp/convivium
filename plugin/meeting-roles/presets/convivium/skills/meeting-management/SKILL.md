---
name: "meeting-management"
description: "根据会议事实规划讨论与补足证据缺口"
disable-model-invocation: false
user-invocable: true
---

# 根据会议事实规划讨论与补足证据缺口

收到 Meeting notice 后，先使用其中的 `meetingId` 调用 `convivium_read_meeting`，以返回的 caller-visible Meeting 事实为当前工作上下文；不要从 notice 本身推断议题正文或当前状态。

1. 读取当前目标、正式状态、必需参与关系和阻塞问题
2. 区分职责缺口、证据缺口与已有材料可以回答的问题
3. 为每项计划说明预期输出、依据及停止条件，避免重复讨论
4. 将独立工作拆成贡献任务，审核稿件边界，并保留需要 Captain 处理的问题

收到 Meeting manager context 时，只根据其中的当前 Meeting 事实和版本规划下一步。需要开轮时，先调用 `convivium_submit_manager_plan`：顶层 `input` 必须包含 `protocolVersion: 1`、当前 `meetingId`、`convivium_read_meeting` 返回的 `expectedMeetingVersion`（即当前 `version`）、唯一 `requestId`，`action` 必须包含 `kind: "submit_manager_plan"`、当前 `agendaId`、`planKind: "open_round"`、非空 `roundGoal: { question, evidenceGap, expectedOutput }` 与 `rationale`。成功后使用返回的新版本及 `planId` 调用 `convivium_open_round`；不得跳过 plan、复用已完成或已取代的 plan，也不得让 Round 目标偏离已授权 Agenda。

轮内只处置当前 pending hand；全部已接纳贡献完成独立审核后才调用 `convivium_publish_round`。轮后根据新证据和剩余缺口重新提交下一步 plan；需要新身份时只通过 `convivium_recommend_identity` 提出结构化决定，不把自然语言推荐当作准入。

只报告实际观察或执行的结果，说明证据不足与适用限制。工具和角色文本不扩大 Host 或任务授予的权限。
