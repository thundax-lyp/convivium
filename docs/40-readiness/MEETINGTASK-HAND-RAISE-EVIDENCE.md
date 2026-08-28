# MeetingTask 与举手闭环取证

状态：已完成自动化验证；独立 DSH profile smoke 按用户要求暂不纳入本次闭环（2026-08-28）

## 自动化验证

- `plugin/` 执行两次 `pnpm test` 均通过：33 个测试文件、243 个测试通过；各任务提交前的 format、lint、host/client compile/build 均通过。
- `pnpm verify:environment` 与 `pnpm verify:contract` 均通过。
- 覆盖 MeetingTask 状态机、HandRaise、snapshot、恢复、权限、幂等、终态门和 completion/end 集成。
- `meeting-runtime` contract 覆盖 completed/failed finish：completed 返回唯一 `handRaiseId` 并产生一个 `hand_raise.created`，failed 省略 `handRaiseId` 且不产生 HandRaise/event；同一 finish request 重放返回相同 receipt/result。
- terminal task 在 runtime 重启后仍恢复为原 terminal projection，恢复过程不创建 Participant Session 或重新派发任务。
- Captain end 与 hard-limit partial 在同一 Meeting transition 中取消非终态 MeetingTask；终态路径不写 task dispatch。
- resolver 只读取锁内 MeetingSnapshot 的 completed MeetingTask projection；worker 不执行 queued→running mutation。

## 独立 DSH profile smoke

本次按用户要求暂不执行 `pnpm smoke:profile`，不将真实 `finish → HandRaise → 后续正式 submit_turn` 描述为已验证。

## 保证边界与 Not Covered

- Meeting fact 的 start/finish/HandRaise 由 repository receipt/version/terminal gate 保证幂等。
- 不新增 execution lease/permit，不承诺外部副作用 exactly-once。
- profile smoke 未执行；真实 Participant continuable Session 链路仍是 Not Covered。
- smoke 未执行完整长时间模型任务、真实外部工具副作用或生产凭据流程；这些仍是 Not Covered。
- Session close、capability revoke 和底层 interrupt 继续归后续 Archive/lifecycle。
- `plugin/tests/contract/meeting-runtime.spec.ts` 中的 continuable/lifecycle fake 仅用于隔离 runtime 的确定性授权、恢复和 archive 边界；当前 main 没有可直接替换它的公开稳定 archive coordinator 接口，因此保留该 fake。`plugin/scripts/smoke-profile.mjs` 使用真实 DSH `web`/`spawn` profile，不属于该 fake。

## 清理

本证据取代临时 MeetingTask RUNBOOK 的执行记录；历史 TeamTask 调研仅保留为历史背景，不作为当前实现依据。
