# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `plugin/tests/contract/status-projection.spec.ts`：验证公开 projection 保留正式字段且隐藏内部字段
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK projection boundary
  - 处理动作：断言 `finishedAt`、`resultSummary` 按正式 Interface 保留，execution/source/context/evidence/授权判定不泄露。
  - 验收点：projection contract 通过且不新增 DTO/version。

- [ ] `plugin/tests/recovery/recovery.spec.ts`：验证任务绑定、finish/raise 和迟到结果恢复
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T8/Test Matrix
  - 处理动作：覆盖 create 后 submit 前、short submit 前后、finish transaction 前后、重启后 evidence 和 terminal guard。
  - 验收点：恢复不产生半提交状态、重复 fact 或迟到 task result。

- [ ] `plugin/scripts/smoke-profile.mjs`：加入真实 task finish→raise→later submit_turn 场景
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T9
  - 处理动作：在现有 current Speaker submit 后、profile 收尾前插入真实 Participant continuable Session task flow，不改 profile 基础设施。
  - 验收点：独立 profile 观察 start、finish、pending HandRaise、后续正式 submit_turn 和 evidence 引用；失败执行 Prepare→Execute→Assert→Restore。

- [ ] `docs/40-readiness/MEETINGTASK-HAND-RAISE-EVIDENCE.md`：记录 B 闭环 readiness evidence
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK T10
  - 处理动作：记录实际命令、环境、commit 边界、测试/profile 结果、Not Covered 和恢复证据。
  - 验收点：证据可复查，未验证范围未被描述为通过；完成对应实现 commit 时删除本 TODO 项。

- [ ] `plugin/` 全量受影响验证与临时 RUNBOOK 收口：迁移长期结论并删除残留引用
  - 依据文档：`docs/30-designs/RUNBOOK-TASK-EVIDENCE-RETURN.md`、`docs/00-governance/TODO-RULES.md`
  - 确认依据：2026-08-28 用户要求依据 RUNBOOK 建立 TODO；RUNBOOK Independent completion/closure
  - 处理动作：运行最窄测试、`pnpm verify`、package verification 和 profile smoke，确认 readiness 完整后迁移稳定结论并删除 RUNBOOK。
  - 验收点：所有适用 T1–T10 有实际结果，Not Covered 已记录；删除动作进入对应完成 commit，不提前删除未收口 RUNBOOK。

## 待讨论项
