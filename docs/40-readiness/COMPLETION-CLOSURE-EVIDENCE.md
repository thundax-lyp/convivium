# Meeting Completion Closure Evidence

## Scope

本证据记录闭环 A 的 completion claim、Captain end、execution-terminal projection、SQLite 原子性和恢复验证。记录日期为 2026-08-27，分支为 `codex/feat/completion-closure`，验证起点为 `7a08ff9`；本证据及新增恢复/竞争测试随 A6 验证提交交付。

闭环 A 未读取、取消或转移外部 TeamTask，也未修改闭环 B 专属的 task operation、HandRaise 或 association 实现。

## Validated Contract

- 合法 Participant completion claim 与 transcript、CompletionFact、event、version 和 receipt 通过唯一 `MeetingRepository.execute()` 原子提交。
- 默认 `AuthorizedTaskEvidenceResolver` 接受空 `taskIds`，对非空值返回 `UNSUPPORTED_CAPABILITY` 且不产生副作用；resolver 在已加锁的当前 Meeting snapshot 内调用。
- objective 满足后 Meeting 进入 `converging`；只有真实 Captain 可以通过 `convivium_end_meeting` 提交 `completed`、`partial`、`no_consensus` 或 `cancelled`。
- Captain end 校验 expected version、Meeting 内引用、完成条件和结构化 reason；相同请求重放原 receipt，不同 hash 返回 `IDEMPOTENCY_CONFLICT`。
- 终态转换撤销活动 SpeakerAttempt/Manager planning attempt、截断或取消 Turn，并清除公开活动执行状态。
- 五种 execution-terminal 状态均通过 `MeetingStatusResultSchema`，只公开正式 termination、有效 CompletionFact ID 和 discussion facts，不公开 current Turn、speaker、attempt、Session ID 或 pending HandRaise。
- Repository 事务写失败时回滚 state、event、receipt 和 outbox；SQLite 重开后恢复相同终态，重放 end command 返回原 receipt 且不增加 version。
- Captain end 与通用同版本 Meeting fact command 只允许一个事务成功；end 成功后，后续 fact command 返回 `IMMUTABLE_MEETING` 且不新增 Meeting fact。

## Executed Validation

环境：macOS，Node `v22.23.2`，pnpm `10.7.0`，DSH packages `0.1.1-rc.2`。

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/unit/domain/transitions.spec.ts tests/unit/runtime/meeting-runtime.spec.ts tests/contract/tool-registration.spec.ts tests/unit/repository.spec.ts tests/contract/meeting-runtime.spec.ts` | Pass；5 files、77 tests。 |
| `pnpm exec vitest run tests/contract/status-projection.spec.ts` | Pass；1 file、7 tests，覆盖五种 execution-terminal 状态。 |
| `pnpm exec vitest run tests/unit/repository.spec.ts tests/recovery/recovery.spec.ts` | Pass；2 files、29 tests，覆盖事务回滚、同版本竞争、终态后拒绝、SQLite 重开和 receipt replay。 |
| `pnpm test:integration` | Pass；2 files、5 tests。 |
| `pnpm test:recovery` | Pass；1 file、4 tests。 |
| `pnpm verify` | 首次发现 HTTP boundary 的工具清单未包含新增 `convivium_end_meeting`；同步契约测试后重跑 Pass。最终 29 files、191 tests，format、lint、Host/Client typecheck、build、environment、contract 和 package verifier 全部通过。 |

未运行 `pnpm smoke:profile`：本闭环没有修改 DSH composition、continuable provider 或 Session lifecycle；现有独立 profile 证据不被本次静态/SQLite 验证替代。

## Not Covered

- 闭环 B 尚未提供可集成的 task association/snapshot、HandRaise 和 planning 写入实现，因此未运行真实 A/B 集成竞争；当前只验证了使用既有 repository/version/terminal guard 的通用 Meeting fact command。
- B 接入后的授权 task evidence resolver、真实 task snapshot TOCTOU、terminal task snapshot 和 HandRaise 竞争尚未验证。
- 真实 DSH profile 中 Captain end 与正在投递的 Participant/Manager followup 竞争未运行；领域收口和投递前授权复查由离线测试及现有 runtime guard 覆盖。
- Archive、外部 TeamTask 后续生命周期、Mail、HTTP Meeting route、完整 UI、stress 和远端 CI 不属于本闭环。

## Closure

闭环 A 的独立实现与验证已完成，当前分支可进入与闭环 B 的集成准备状态。由于真实 A/B 集成竞争仍未执行，`RUNBOOK-COMPLETION-CLOSURE.md` 和收窄后的 A6 TODO 继续保留；不得将本证据描述为两个闭环已经联合收口。
