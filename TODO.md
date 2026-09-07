# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `readiness/runtime-smoke`：LC-08 合并后验证真实 DSH/Browser
    - 依据文档：[协议](docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) Local decision and risk control；[Smoke 操作规程](docs/50-operations/HOW-TO-DSH-SMOKE.md) Decision/Risk 本地按钮验证。
    - 确认依据：2026-09-07，本任务约定由协调者在合并后执行真实 smoke。
    - 前置依赖：LC-07 完成且实现已合并。
    - 文件（2 个）：

        - `docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`

    - 处理动作：由协调者按固定规程启动夹具，执行七步按钮/刷新/归档验证、审计 GET 和清理，记录 evidence/coverage。
    - 验收点：七步、六条 local 审计事实和 Restore 全部通过；记录合并版本与实际结果，未通过时保留任务。

## 待审阅任务项

## 待讨论项
