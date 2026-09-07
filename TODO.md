# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下 FR-10 任务按 T0 → T8 顺序执行，前一步 PASS 才能开始下一步。2026-09-07 用户明确要求“依次执行TODO LIST，一任务一删除一提交”；执行、逐项删除与逐项 commit 已获授权。允许文件、命令、PASS/STOP 和恢复方式以 RUNBOOK 对应步骤为准，不在此复制方案。

- [ ] `FR-10 / T6 / Client`：只读展示草稿并区分会议事实
    - 依据文档：[RUNBOOK T6](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t6client-只读草稿标识)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T5 PASS 后，在原 Transcript 行展示草稿标记、覆盖范围和有序引用，补齐固定 DOM 验收用例。
    - 验收点：Client 测试和 typecheck 通过；active/archive、刷新与切换不丢失或残留元数据；草稿与当前发言者、候选建议、任务、等待原因和正式决定可区分；不新增写入口。

- [ ] `FR-10 / T7 / DSH Smoke`：验证真实引用草稿链路
    - 依据文档：[RUNBOOK T7](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t7真实-dsh-引用草稿场景)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T6 PASS 后，增加唯一 scribe-minutes selector，接入现有驱动和结果校验并运行真实 DSH 场景。
    - 验收点：指定脚本测试、六项 oracle 和 Restore 全部 PASS；HTTP/archive 按第 4.5 节固定公开字段比较；内部附加字段不误报，公开字段及 metadata 篡改被拒绝；默认核心场景不变。

- [ ] `FR-10 / T8 / 验证与收口`：完成整项验收并迁移证据
    - 依据文档：[RUNBOOK T8](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t8完整验证证据与删除)、[TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交；push/PR/merge 未授权。
    - 处理动作：T7 PASS 后，完成完整 verify、固定回归集、Browser 观察与 Restore，迁移长期文档和证据，再按规则更新覆盖并清理临时任务。
    - 验收点：V1–V15 与 R1–R11 按规定证据口径收口；保留邮件增量跨层动态场景等 Not Covered；全部门禁通过才提升 FR-10、删除 RUNBOOK 及其任务引用；删除后链接与 diff 检查通过。仅关闭真正完成的 TODO，部分完成时收窄剩余范围。

## 待审阅任务项

## 待讨论项
