# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- 本批任务按 2026-09-14 本对话要求登记；最小实现范围与执行方案已确认，本次登记不授权产品实现、提交或外部运行。
- 以下任务按所列顺序执行；各步骤的允许文件、固定命令和 PASS/STOP 以依据文档为准，不由 TODO 扩大范围。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除；未提交时可同步工作区，但不能关闭未完成任务。

## 当前任务项

## 待审阅任务项

### 基础

### 协作闭环

### 交付验证

- [ ] `真实 DSH 与 Browser`：确定性 probe 与面板验收（T10）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T10。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现并运行指定真实 DSH 场景及 Browser 操作，记录证据和清理结果。
    - 验收点：并行、独立审核、精确版本、幂等与归档回读断言通过；Browser 控制正确；临时资源清理成功。

- [ ] `真实模型讨论`：固定业务讨论验收（T11）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T11。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：运行固定议题的真实模型讨论，分别保存结构、调用回执和归档证据。
    - 验收点：规定 JSON 结构及系统回执通过；无人工代填；真实归档成立；语义质量仍标 Not Covered。

- [ ] `交付收口`：迁移证据并删除临时执行文档（T12）
    - 依据文档：[RUNBOOK Rules](docs/00-governance/RUNBOOK-RULES.md#completion-and-deletion)、[TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)、[Document Rules](docs/00-governance/DOCUMENT-RULES.md#document-lifecycle)。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：前序任务与固定门禁全部通过后，迁移长期结论和真实证据，按既定 T12 命令完成备份、引用核对、删除及失败恢复。
    - 验收点：前序已完成 TODO 已按规则清理，未覆盖项留在正式 readiness；完整门禁通过；临时文档删除后链接与 diff 检查通过；任何失败均恢复文档且不关闭本项。

## 待讨论项
