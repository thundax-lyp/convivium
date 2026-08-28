# MeetingTask 与举手闭环取证

状态：已完成自动化与独立 DSH profile 验证（2026-08-28）

## 自动化验证

- `plugin/` 执行 `pnpm verify` 通过：32 个测试文件、218 个测试通过；format、lint、host/client typecheck、build、DSH environment、plugin contract 和 package verification 全部通过。
- 覆盖 MeetingTask 状态机、HandRaise、snapshot、恢复、权限、幂等、终态门和 completion/end 集成。
- `meeting-runtime` contract 覆盖 completed/failed finish：completed 返回唯一 `handRaiseId` 并产生一个 `hand_raise.created`，failed 省略 `handRaiseId` 且不产生 HandRaise/event；同一 finish request 重放返回相同 receipt/result。
- terminal task 在 runtime 重启后仍恢复为原 terminal projection，恢复过程不创建 Participant Session 或重新派发任务。
- Captain end 与 hard-limit partial 在同一 Meeting transition 中取消非终态 MeetingTask；终态路径不写 task dispatch。
- resolver 只读取锁内 MeetingSnapshot 的 completed MeetingTask projection；worker 不执行 queued→running mutation。

## 独立 DSH profile smoke

命令：`pnpm smoke:profile`

结果：通过。`web` profile 使用 `spawn` provider，真实探针观察到 3 个 Participant continuable Session 的 FIFO transcript：`participant-a → participant-c → participant-b`，并观察到下一轮 Manager plan 与首个 SpeakerAttempt；dump-config、打包安装和 host 启动均通过。

这证明当前 profile 的 followup 接受顺序和基础 Meeting runtime 闭环；不把模型、工具、workspace 或外部副作用宣称为 exactly-once。

## 保证边界与 Not Covered

- Meeting fact 的 start/finish/HandRaise 由 repository receipt/version/terminal gate 保证幂等。
- 不新增 execution lease/permit，不承诺外部副作用 exactly-once。
- profile smoke 尚未执行 MeetingTask 的真实 `finish → HandRaise → 后续正式 submit_turn` 链路；该边界由 contract/recovery tests 覆盖，仍是 Not Covered。
- smoke 未执行完整长时间模型任务、真实外部工具副作用或生产凭据流程；这些仍是 Not Covered。
- Session close、capability revoke 和底层 interrupt 继续归后续 Archive/lifecycle。

## 清理

本证据取代临时 MeetingTask RUNBOOK 的执行记录；历史 TeamTask 调研仅保留为历史背景，不作为当前实现依据。
