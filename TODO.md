# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `UI primitives/正式设计`：写入唯一正式设计
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T1。
    - 关联文件：修改 [docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)。
    - 确认依据：2026-09-09 用户明确要求阅读 TODO Rules 后依次执行 TODO List，一任务一提交。
    - 处理动作：按 T1 修正 primitives 依赖定位并加入 Client control primitives 设计。
    - 验收点：正式设计包含固定控件、交互及共享依赖约束，文档链接与 diff 检查通过。

## 待审阅任务项

按 T1–T12 顺序执行，前一步 PASS 后进入下一步；具体文件、动作、命令和 STOP 条件以各项链接的 RUNBOOK 步骤为准。

- [ ] `UI primitives/普通按钮`：迁移九处按钮并接通真实包 CSS
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T2。
    - 关联文件：修改 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)、[plugin/vitest.config.ts](plugin/vitest.config.ts)；验证 [plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T2 替换九处 Button 调用并配置 Client Vitest 的精确 inline 规则。
    - 验收点：原 DOM 属性保留，客户端类型检查与原有 Client 测试通过，测试加载真实 primitives。

- [ ] `UI primitives/理由输入`：迁移三个单行输入与操作行布局
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T3。
    - 关联文件：修改 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)；验证 [plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T3 替换 Pause、Skip、End reason 为 Input，并修改指定操作行布局。
    - 验收点：三个输入保留名称、值与禁用行为，类型检查及 Client 测试通过。

- [ ] `UI primitives/结束结果`：实现结束结果单选交互并固定提交与键盘测试
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T4。
    - 关联文件：修改 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)、[plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T4 加入三选一 radio Button 组并更新提交、键盘用例。
    - 验收点：默认 Partial、互斥选择、方向键与 Home/End 行为通过测试，选择不提交且 End payload 不变。

- [ ] `UI primitives/会议切换`：验证跨会议选择重置
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T5。
    - 关联文件：修改 [plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)；被测对象 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)（只读）。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T5 加入第二会议 fixture 和选择重置测试。
    - 验收点：切换会议后显示第二会议且恢复 Partial，全程零 POST。

- [ ] `UI primitives/缓存禁写`：分别验证列表缓存与详情缓存禁写和恢复
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T6。
    - 关联文件：修改 [plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)；被测对象 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)（只读）。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T6 加入列表、详情两种缓存场景的参数化测试。
    - 验收点：缓存状态全部 radio 禁用且不能改选，恢复后重新可选，全程零 POST。

- [ ] `UI primitives/提交互斥`：验证提交中互斥与拒绝后解锁
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T7。
    - 关联文件：修改 [plugin/tests/client/meeting-panel.client.spec.ts](plugin/tests/client/meeting-panel.client.spec.ts)；被测对象 [plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx)（只读）。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T7 加入延迟响应、重复点击及 409 拒绝后的刷新测试。
    - 验收点：提交期间不能改选且仅一次 POST，拒绝后刷新并解锁，完整 Client 测试、类型检查和 lint 通过。

- [ ] `UI primitives/工程验证`：验证完整工程和构建共享依赖
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T8。
    - 关联文件：验证入口 [plugin/package.json](plugin/package.json) 的 verify（只读）；检查生成产物 `plugin/lib/client.js`（ignored，不手工编辑）。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T8 执行 plugin verify 与 Client artifact 固定检查。
    - 验收点：verify 通过，artifact 外部请求仅 react/primitives，ModuleLoader 与指定特征检查通过；宿主加载和交互继续由 T9–T10 验证。

- [ ] `UI primitives/Skip 浏览器验证`：验证真实 Skip 控件
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T9。
    - 关联文件：只读执行入口 [plugin/scripts/smoke-profile/index.mjs](plugin/scripts/smoke-profile/index.mjs)、场景 [plugin/scripts/smoke-profile/probe/scenarios/reassign.js](plugin/scripts/smoke-profile/probe/scenarios/reassign.js)；新增截图 `docs/40-readiness/assets/ui-primitives/skip-after.png`。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T9 执行 reassign Browser 场景并完成 R 清理。
    - 验收点：填写理由后 Skip 成功且刷新不回退，保存 skip-after.png，场景和资源清理均 PASS。

- [ ] `UI primitives/End 浏览器验证`：验证真实单选键盘、布局、主题与结束流程
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T10。
    - 关联文件：只读执行入口 [plugin/scripts/smoke-profile/index.mjs](plugin/scripts/smoke-profile/index.mjs)、场景 [plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js](plugin/scripts/smoke-profile/probe/scenarios/scribe-minutes.js)；新增 `docs/40-readiness/assets/ui-primitives/` 下的 `light-wide.png`、`light-narrow.png`、`dark-wide.png`、`dark-narrow.png`、`archived.png`。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T10 执行 scribe-minutes Browser 场景及固定主题、视口组合。
    - 验收点：真实键盘、几何与主题断言通过，结束后刷新仍 archived 且纪要保留，五张截图齐全，环境恢复和清理 PASS。

- [ ] `UI primitives/证据迁移`：同步正式设计与实际验证证据
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T11。
    - 关联文件：修改 [docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)、[docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md](docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md)、[docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md](docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)；核对 T9–T10 指定的六张截图。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T11 更新正式设计、readiness 和 coverage。
    - 验收点：实际测试、Browser 证据、六张截图及 Not Covered 可追溯，正式设计与验证证据链接有效，链接与 diff 检查通过。

- [ ] `UI primitives/迁移收口`：关闭迁移任务并删除临时 RUNBOOK
    - 依据文档：[UI Primitives Migration RUNBOOK](docs/30-designs/RUNBOOK-UI-PRIMITIVES-MIGRATION.md)，T12。
    - 关联文件：修改 [TODO.md](TODO.md)，删除本项依据链接中的 RUNBOOK；只读核对 T11 的三份文档和 T9–T10 的六张截图。
    - 确认依据：2026-09-09 用户要求根据 RUNBOOK 制定 TODO；执行迁移待确认。
    - 处理动作：按 T12 核对全部门禁、清理本次已完成 TODO 并删除 RUNBOOK。
    - 验收点：T1–T11 全部 PASS，长期证据完整，删除前后链接与 diff 检查通过，无残留 RUNBOOK 引用；不包含提交、推送或 PR。

## 待讨论项
