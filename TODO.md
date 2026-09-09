# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

按 T9 → T10 → T11 → T12 顺序执行；每项 PASS 后删除对应 TODO 并单独提交。

- [ ] `UI primitives/Skip 浏览器验证`：验证真实 Skip 控件
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T9。
    - 关联文件：只读执行入口 [plugin/scripts/smoke-profile/index.mjs](plugin/scripts/smoke-profile/index.mjs)、场景 [plugin/scripts/smoke-profile/probe/scenarios/reassign.js](plugin/scripts/smoke-profile/probe/scenarios/reassign.js)；新增截图 `docs/40-readiness/assets/ui-primitives/skip-after.png`。
    - 确认依据：2026-09-09 用户明确要求阅读 TODO Rules 后依次执行 TODO List，一任务一提交。
    - 处理动作：按 T9 执行 reassign Browser 场景并完成 R 清理。
    - 验收点：填写理由后 Skip 成功且刷新不回退，保存 skip-after.png，场景和资源清理均 PASS。

- [ ] `UI primitives/End 浏览器验证`：验证真实单选键盘、布局、主题与结束流程
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T10。
    - 关联文件：只读执行入口 [plugin/scripts/smoke-profile/index.mjs](plugin/scripts/smoke-profile/index.mjs)、场景 [plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js](plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js)；新增 `docs/40-readiness/assets/ui-primitives/` 下的 `light-wide.png`、`light-narrow.png`、`dark-wide.png`、`dark-narrow.png`、`archived.png`。
    - 确认依据：2026-09-09 用户明确要求依次执行 TODO List，一任务一提交。
    - 处理动作：按 T10 执行 scribe-minutes Browser 场景及固定主题、视口组合。
    - 验收点：真实键盘、几何与主题断言通过，结束后刷新仍 archived 且纪要保留，五张截图齐全，环境恢复和清理 PASS。

- [ ] `UI primitives/证据迁移`：同步正式设计与实际验证证据
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T11。
    - 关联文件：修改 [docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)、[docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md](docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md)、[docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)；核对 T9–T10 指定的六张截图。
    - 确认依据：2026-09-09 用户明确要求依次执行 TODO List，一任务一提交。
    - 处理动作：按 T11 更新正式设计、readiness 和 coverage。
    - 验收点：实际测试、Browser 证据、六张截图及 Not Covered 可追溯，正式设计与验证证据链接有效，链接与 diff 检查通过。

- [ ] `UI primitives/迁移收口`：关闭迁移任务并删除临时 RUNBOOK
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T12。
    - 关联文件：修改 [TODO.md](TODO.md)，删除本项依据链接中的 RUNBOOK；只读核对 T11 的三份文档和 T9–T10 的六张截图。
    - 确认依据：2026-09-09 用户明确要求依次执行 TODO List，一任务一提交。
    - 处理动作：按 T12 核对全部门禁、清理本次已完成 TODO 并删除 RUNBOOK。
    - 验收点：认证修复、T9、T10、T11 全部 PASS，长期证据完整，删除前后链接与 diff 检查通过，无残留 RUNBOOK 引用；按一任务一提交完成收口，不推送或创建 PR。

## 待审阅任务项

## 待讨论项
