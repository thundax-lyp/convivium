# Meeting Completion Closure Evidence

## Scope

本证据记录 completion claim、Captain end、execution-terminal projection、SQLite 原子性、恢复以及与 Convivium-owned MeetingTask/HandRaise 的集成验证。

初始闭环 A 证据记录于 2026-08-27，验证起点为 `7a08ff9`。2026-08-28 在 `main` 的 `0fd66b6` 上复核 A/B 联合收口；外部 DSH TeamTask 不属于当前实现路径。

## Validated Contract

- 合法 Participant completion claim 与 transcript、CompletionFact、event、version 和 receipt 通过唯一 `MeetingRepository.execute()` 原子提交。
- 正式 `meetingTaskEvidenceResolver` 只在已加锁的当前 Meeting snapshot 内解析当前 Participant 已完成且具有正式来源的 MeetingTask；非法、非终态、跨身份或来源不完整的 task evidence 整体拒绝且不产生副作用。
- objective 满足后 Meeting 进入 `converging`；只有真实 Captain 可以通过 `convivium_end_meeting` 提交 `completed`、`partial`、`no_consensus` 或 `cancelled`。
- Captain end 校验 expected version、Meeting 内引用、完成条件和结构化 reason；相同请求重放原 receipt，不同 hash 返回 `IDEMPOTENCY_CONFLICT`。
- 终态转换撤销活动 SpeakerAttempt/Manager planning attempt、截断或取消 Turn，并清除公开活动执行状态。
- 五种 execution-terminal 状态均通过 `MeetingStatusResultSchema`，只公开正式 termination、有效 CompletionFact ID 和 discussion facts，不公开 current Turn、speaker、attempt、Session ID 或 pending HandRaise。
- Repository 事务写失败时回滚 state、event、receipt 和 outbox；SQLite 重开后恢复相同终态，重放 end command 返回原 receipt 且不增加 version。
- Captain end 与同版本 MeetingTask、HandRaise 或 planning 写命令只允许一个事务成功；end 或 hard-limit partial 成功时，同事务取消非终态 MeetingTask 且不写新的 task dispatch，后续写入返回终态或 version 错误且不新增 Meeting fact。

## Executed Validation

环境：macOS，Node `v22.23.2`，pnpm `10.7.0`，DSH packages `0.1.1-rc.2`。

| 命令                                                                                                                                                                                                                                                                                     | 结果                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/domain/transitions.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/repository.spec.ts tests/contract/meeting-runtime.spec.ts`                                                                    | Pass；5 files、77 tests。                                                                                                                                                                                                |
| `pnpm exec vitest run tests/contract/status-projection.spec.ts`                                                                                                                                                                                                                          | Pass；1 file、7 tests，覆盖五种 execution-terminal 状态。                                                                                                                                                                |
| `pnpm exec vitest run tests/unit/repository.spec.ts tests/recovery/recovery.spec.ts`                                                                                                                                                                                                     | Pass；2 files、29 tests，覆盖事务回滚、同版本竞争、终态后拒绝、SQLite 重开和 receipt replay。                                                                                                                            |
| `pnpm test:integration`                                                                                                                                                                                                                                                                  | Pass；2 files、5 tests。                                                                                                                                                                                                 |
| `pnpm test:recovery`                                                                                                                                                                                                                                                                     | Pass；1 file、4 tests。                                                                                                                                                                                                  |
| `pnpm verify`                                                                                                                                                                                                                                                                            | 首次发现 HTTP boundary 的工具清单未包含新增 `convivium_end_meeting`；同步契约测试后重跑 Pass。最终 29 files、191 tests，format、lint、Host/Client typecheck、build、environment、contract 和 package verifier 全部通过。 |
| `pnpm exec vitest run tests/unit/domain/completion.spec.ts tests/unit/domain/transitions.spec.ts tests/unit/runtime/task-evidence.spec.ts tests/unit/repository.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/status-projection.spec.ts tests/recovery/recovery.spec.ts` | 2026-08-28 在 `0fd66b6` 复核 Pass；7 files、106 tests，覆盖 completion、task evidence、终态取消、projection、SQLite 与恢复边界。                                                                                         |
| `pnpm verify`                                                                                                                                                                                                                                                                            | 2026-08-28 在 `0fd66b6` 复核 Pass；33 files、243 tests，format、lint、Host/Client typecheck、build、environment、contract 和 package verifier 全部通过。                                                                 |

未运行 `pnpm smoke:profile`：本闭环没有修改 DSH composition、continuable provider 或 Session lifecycle；现有独立 profile 证据不被本次静态/SQLite 验证替代。

## Not Covered

- 未运行真实 DSH profile 中 `MeetingTask finish → HandRaise → 后续正式 submit_turn → Captain end` 的完整链路；该运行面按用户要求暂缓，当前 `pnpm smoke:profile` 只覆盖基础 runtime 串行 Turn，不包含这条扩展场景。领域原子性、授权、恢复和终态门已由自动化测试覆盖，但不能替代真实 Session residency 证据。
- 真实 DSH profile 中 Captain end 与正在投递的 Participant/Manager/MeetingTask followup 竞争未运行；领域收口和投递前授权复查由离线测试及现有 runtime guard 覆盖。
- Archive、外部 TeamTask 后续生命周期、Mail、HTTP Meeting route、完整 UI、stress 和远端 CI 不属于本闭环。

## Closure

completion/end 与 MeetingTask/HandRaise 的自动化集成收口已完成；长期契约保留在需求、接口、设计、代码和测试中。真实 DSH profile 的完整 MeetingTask 链路继续作为明确的 `Not Covered`，不把自动化通过描述为真实 Session residency 已验证。临时 completion RUNBOOK 已删除；当前全局覆盖以 `CURRENT-IMPLEMENTATION-COVERAGE.md` 为准。
