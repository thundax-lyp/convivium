# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `Storage / 收口`：迁移证据并删除临时 RUNBOOK
    - 依据文档：[TODO Rules：收口](docs/00-governance/TODO-RULES.md#closure-rules)；[RUNBOOK Rules：完成与删除](docs/00-governance/RUNBOOK-RULES.md#completion-and-deletion)；[Document Rules：文档生命周期](docs/00-governance/DOCUMENT-RULES.md#document-lifecycle)。
    - 执行步骤：[RUNBOOK T9](docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md#t9迁移证据并删除临时-runbook)
    - 修改文件：`TODO.md`、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md`、`docs/40-readiness/DSH-CAPABILITY-INTEGRATION-EVIDENCE.md`。
    - 删除文件：`docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md`；九项全部完成后删除条目及专属引用，不删除未完成任务。
    - 前置依赖：T1–T8 与全部 mandatory 验证 PASS，长期文档与证据已落位。
    - 确认依据：2026-09-08 用户明确要求依次执行 TODO LIST，一任务一提交。
    - 处理动作：检查覆盖完整性，删除临时 RUNBOOK 与已完成任务引用，保留正式未覆盖说明。
    - 验收点：删除前后链接与 diff 检查通过、无 RUNBOOK 残留引用；失败恢复本次删除文件/引用；迁移不登记为待办。

## 待审阅任务项

## 待讨论项
