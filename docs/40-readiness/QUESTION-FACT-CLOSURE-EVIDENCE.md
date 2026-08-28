# Question Fact Closure Readiness Evidence

## Scope

本证据覆盖 non-blocking Question 的协议输入、canonical MeetingState 创建、领域事件、caller-authored resolution、status projection、恢复、事务回滚、Archive unresolved projection 和 Runtime 幂等边界。`blocking: true` 仍明确为 `Not Covered`。

## Validated Contract

- `QuestionClaimV1.text` trim 后不能为空；V1 只接受 `blocking: false`。
- Runtime 按 delivery 和输入顺序生成稳定 Question ID，并在同一事务中提交 message、Question、event、receipt 和 version。
- 合法 resolution 只能引用当前 Meeting 中 caller authored 的 answer message，并固化 `answerMessageId`；`question.answered` 先于 `completion_fact.added`。
- active 和 execution-terminal status 暴露 `questions`；Archive schema 不变，open/deferred question 进入 unresolved questions。

## Executed Validation

记录日期：2026-08-28。环境：macOS、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`。T1–T7 完成时的代码提交为 `82bf2e4`；本收口文档和 TODO 清理在当前提交中完成。

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| T0 environment | `pnpm --dir plugin verify:environment` | Pass；15 个声明的 DSH packages 均已安装 |
| T0 contract | `pnpm --dir plugin verify:contract` | Pass |
| T1 docs | 指定 `rg` 检查与 `git diff --check` | Pass |
| T2 protocol | `pnpm --dir plugin exec vitest run tests/contract/protocol-schema.spec.ts` | Pass；18 tests。原 RUNBOOK 的 `pnpm --dir plugin vitest ...` 在 pnpm `10.7.0` 下参数解析失败，改用项目已安装的 `exec` 入口；未改变测试范围 |
| T2 typecheck | `pnpm --dir plugin typecheck` | Pass |
| T3 model | `pnpm --dir plugin typecheck` | Pass |
| T4 transitions | `pnpm --dir plugin exec vitest run tests/unit/domain/transitions.spec.ts` | Pass；49 tests |
| T4 typecheck | `pnpm --dir plugin typecheck` | Pass |
| T5 completion | `pnpm --dir plugin exec vitest run tests/unit/domain/completion.spec.ts` | Pass；10 tests |
| T5 typecheck | `pnpm --dir plugin typecheck` | Pass |
| T6 Runtime | `pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts` | Pass；12 tests |
| T6 typecheck | `pnpm --dir plugin typecheck` | Pass |
| T7 status/recovery/archive | 指定三组 focused Vitest 命令 | Pass；9 + 31 + 11 tests |
| T7 typecheck | `pnpm --dir plugin typecheck` | Pass |
| Full verification | `pnpm --dir plugin verify` | Pass；33 files、253 tests；format、lint、typecheck、build、environment、contract、package verifier 全部通过 |

## Not Covered

- blocking Question evidence model 和正式创建仍未实现；没有把 `blocking: true` 报告为已覆盖。
- 真实 DSH profile 中的 Question create/resolve/restart smoke 未执行；本闭环未改变 DSH API 或 profile composition。
- HTTP、Plugin Frontend、远程用户授权和外部副作用不在本范围内。

## Closure

non-blocking Question create/read/resolve/archive 已由 focused tests 和完整插件验证覆盖。T0–T8 执行面板已收口，临时执行材料已删除；长期事实保留在正式接口、设计和本 readiness 证据中。
