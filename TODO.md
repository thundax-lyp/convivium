# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下任务按 M15—M16 顺序执行，前一步 PASS 才能进入下一步；关联文件来自对应 RUNBOOK 的允许修改清单，保留“新”和“删除”标记；命令、文件内修改范围与 STOP 仍以 RUNBOOK 为准。各步骤另可同步本文件对应任务，文件列表不扩大修改许可。环境与迁移前 baseline 已完成，不另列环境确认任务。任务关闭遵循 [TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)，不在此保留执行日志。

- [ ] `readiness/remote-migration`：M15 验证迁移并记录证据
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M15。
    - 关联文件：M01—M14（含 M13a）清单中已经修改的文件仅格式化；[docs/40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md](docs/40-readiness/MEETING-REMOTE-FEASIBILITY-EVIDENCE.md)、[docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：运行固定回归门禁，将实际结果与未覆盖边界写入 readiness。
    - 验收点：verify、baseline、scribe-minutes、文档检查全部通过；真实 marker 与 restore=PASS 可追溯。

- [ ] `docs/remote-migration`：M16 收口迁移文档与任务
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M16。
    - 关联文件：删除 [docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md](docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md)；根 [TODO.md](TODO.md) 中本批迁移任务及其专用链接定义；[docs/30-designs/MEETING-REMOTE-DESIGN.md](docs/30-designs/MEETING-REMOTE-DESIGN.md)、[docs/20-interfaces/MEETING-REMOTE-INTERFACE.md](docs/20-interfaces/MEETING-REMOTE-INTERFACE.md)、[docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)、[docs/00-governance/ARCHITECTURE.md](docs/00-governance/ARCHITECTURE.md)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：同步已实现状态，按收口规则清除本批 TODO 引用并删除临时 RUNBOOK。
    - 验收点：前序任务全部完成；删除前后链接/diff 检查通过；正式证据和真实浏览器自动重连未覆盖边界保留。

[remote-migration-runbook]: docs/30-designs/RUNBOOK-MEETING-REMOTE-MIGRATION.md

## 待审阅任务项

## 待讨论项
