# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

执行 T12；每项 PASS 后删除对应 TODO 并单独提交。

- [ ] `UI primitives/迁移收口`：关闭迁移任务并删除临时 RUNBOOK
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T12。
    - 关联文件：修改 [TODO.md](TODO.md)，删除本项依据链接中的 RUNBOOK；只读核对 T11 的三份文档和 assets/ui-primitives 中的六张截图。
    - 确认依据：2026-09-09 用户明确要求依次执行 TODO List，一任务一提交。
    - 处理动作：按 T12 核对全部门禁、清理本次已完成 TODO 并删除 RUNBOOK。
    - 验收点：工程与 Browser 验证、T11 全部 PASS，长期证据完整，删除前后链接与 diff 检查通过，无残留 RUNBOOK 引用；按一任务一提交完成收口，不推送或创建 PR。

## 待审阅任务项

## 待讨论项
