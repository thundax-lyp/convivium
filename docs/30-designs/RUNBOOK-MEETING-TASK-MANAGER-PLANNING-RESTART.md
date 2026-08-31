---
title: MeetingTask Manager planning restart repair
status: temporary
---

# Scope

修复已复现的 `STALE_MANAGER_ATTEMPT`：仅允许修改 `plugin/src/runtime/application-service/meeting-task.ts` 与 `plugin/tests/contract/meeting-runtime.spec.ts`，不得新增 schema、domain 状态、事件、migration 或 DSH adapter。

## F0 Author/Audit

核对 `meeting-task.ts` 的 `startMeetingTask`/`finishMeetingTask`、现有 `startManagerPlanning()`、repository transaction 与 outbox。若实现需要其他文件或新语义，STOP。运行 `git diff --check` 与 `node --check`，提交本 RUNBOOK。

## F3 Verify and close

运行 `pnpm --dir plugin verify` 与 focused contract tests，确认 replay 不增加 version/event/outbox。通过后删除整个文件并提交；未通过保留诊断。
