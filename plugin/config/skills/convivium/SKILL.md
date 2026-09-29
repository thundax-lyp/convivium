---
name: convivium
description: 用 /convivium 创建会议，或用 /convivium cancel 明确取消指定会议。
disable-model-invocation: true
user-invocable: true
---

# 启动 Convivium 会议

用户通过 `/convivium <会议目标>` 明确要求启动会议。斜杠后的文字是会议目标，不要把它当作要在当前对话中直接回答的问题。

若目标非空，立即调用一次 `convivium_start_meeting`，参数为 `{}`。该方法只使用本次用户输入中的原始目标，并按 Host 配置创建 Manager、Reviewer 和所选 Contributor，补齐初始议题、产出、验收条件、风险等级和时限；不要自己编造或传入 Captain 身份、MeetingCommand、Session ID 或授权字段。成功时向用户返回 `meetingId`，并说明会议已启动。失败时报告工具返回的错误，不要声称会议已创建，也不要用普通文本或其他工具重试创建。

若用户只输入 `/convivium` 而没有目标，询问会议目标，并提示用户按 `/convivium <会议目标>` 再发送一次。

## 异常中止

用户以 `/convivium cancel <meetingId> <非空原因>` 明确要求取消指定会议时，立即调用一次 `convivium_cancel_meeting`，参数为 `{}`。会议 ID 和原因只取本次直接用户输入，不从普通对话、上下文猜测或自行补写。成功时告知用户取消结果；失败时报告工具错误，不宣称会议已结束。若缺少 ID 或原因，提示完整格式。普通对话中的“停止会议”不得触发这个工具；`cancel` 是 Captain 的异常终止，正常完成、部分完成或无共识由 Manager 判断和提交。
