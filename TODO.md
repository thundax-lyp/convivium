# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `readiness/fr14`：RC-08 完成 FR-14 首版验证与文档收口
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md) T8。
    - 确认依据：2026-09-07，用户要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：RC-07 完成。
    - 文件（8 个）：

        - `docs/40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
        - `plugin/README.md`
        - `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
        - `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
        - `docs/30-designs/ROLE-COMPOSITION-DESIGN.md`
        - `docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md`
        - `TODO.md`

    - 处理动作：完成全量验证，迁移证据并更新首版覆盖；删除已完成任务与临时 RUNBOOK。
    - 验收点：T8 通过；FR-14 仅以共享父 Preset 首版标记已实现，未覆盖边界如实保留，删除前后链接与 diff 检查通过。

## 待审阅任务项

## 待讨论项
