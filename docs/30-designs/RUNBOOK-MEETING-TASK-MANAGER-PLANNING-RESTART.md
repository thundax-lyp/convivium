---
title: MeetingTask Manager planning restart repair
status: temporary
---

# Scope

修复已复现的 `STALE_MANAGER_ATTEMPT`：仅允许修改 `plugin/src/runtime/application-service/meeting-task.ts` 与 `plugin/tests/contract/meeting-runtime.spec.ts`，不得新增 schema、domain 状态、事件、migration 或 DSH adapter。

## F0 Author/Audit

核对 `meeting-task.ts` 的 `startMeetingTask`/`finishMeetingTask`、现有 `startManagerPlanning()`、repository transaction 与 outbox。若实现需要其他文件或新语义，STOP。运行 `git diff --check` 与 `node --check`，提交本 RUNBOOK。

## F1 Regression

在 `meeting-runtime.spec.ts` 增加 start/finish 后 planning attempt replacement 与 stale reproduction 断言；运行针对性 contract test，首轮失败必须记录；删除本节并提交测试。

## F2 Minimal repair

仅在 start/finish 成功 transaction 的最终 state 上：若已有 planning attempt 且 observed version 不等于新 version，撤销并调用现有 `startManagerPlanning()` 创建唯一 replacement（`replanCount+1`、reason `next_turn`、单一 manager dispatch outbox）；保留 HandRaise 与 task terminal 同一 transaction及幂等 replay。运行 contract tests；失败 STOP。通过后删除本节并提交。

## F3 Verify and close

运行 `pnpm --dir plugin verify` 与 focused contract tests，确认 replay 不增加 version/event/outbox。通过后删除整个文件并提交；未通过保留诊断。
