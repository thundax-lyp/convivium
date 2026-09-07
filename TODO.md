# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。
- 下列 AR-00 至 AR-07 按顺序执行；步骤内的唯一动作、命令、白名单、PASS/STOP 以各项所引 RUNBOOK 为准，不得跳过前置依赖。

## 当前任务项

- [ ] `正式文档与任务收口`：AR-07 迁移证据并清理临时任务
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T7。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-06 PASS。
    - 文件（9 个）：

        - `docs/30-designs/DOMAIN-MODEL-DESIGN.md`
        - `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
        - `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`
        - `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
        - `docs/40-readiness/CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md`（新增）
        - `plugin/README.md`
        - `TODO.md`
        - `docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md`

    - 处理动作：按 T7 迁移稳定契约与实际验证证据，核对完成条件后清理本 RUNBOOK 及本次 TODO 条目。
    - 验收点：S1–S4、V1–V12 均有实际证据；FR-13 仍为部分实现；未覆盖范围记录准确；删除后无残留引用、链接与 diff 检查通过，失败则恢复被删除文档和条目。

## 待审阅任务项

## 待讨论项
