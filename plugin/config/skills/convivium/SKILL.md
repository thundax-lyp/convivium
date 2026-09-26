---
name: convivium
description: 在聊天框用 /convivium 加会议目标，直接创建 Convivium 会议。
disable-model-invocation: true
user-invocable: true
---

# 启动 Convivium 会议

用户通过 `/convivium <会议目标>` 明确要求启动会议。斜杠后的文字是会议目标，不要把它当作要在当前对话中直接回答的问题。

若目标非空，立即调用一次 `convivium_start_meeting`，参数为 `{}`。该方法只使用本次用户输入中的原始目标，并自动补齐七个参会身份、初始议题、产出、验收条件、风险等级和时限；不要自己编造或传入 Captain 身份、MeetingCommand、Session ID 或授权字段。成功时向用户返回 `meetingId`，并说明会议已启动。失败时报告工具返回的错误，不要声称会议已创建，也不要用普通文本或其他工具重试创建。

若用户只输入 `/convivium` 而没有目标，询问会议目标，并提示用户按 `/convivium <会议目标>` 再发送一次。
