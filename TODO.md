# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下任务按 M13a、M14—M16 顺序执行，前一步 PASS 才能进入下一步；关联文件来自对应 RUNBOOK 的允许修改清单，保留“新”和“删除”标记；命令、文件内修改范围与 STOP 仍以 RUNBOOK 为准。各步骤另可同步本文件对应任务，文件列表不扩大修改许可。环境与迁移前 baseline 已完成，不另列环境确认任务。任务关闭遵循 [TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)，不在此保留执行日志。

- [ ] `smoke-profile/websocket`：M13a 补齐真实 WebSocket 门禁
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M13a。
    - 关联文件：[plugin/scripts/smoke-profile/index.mjs::writeProbePackage](plugin/scripts/smoke-profile/index.mjs)、[plugin/scripts/smoke-profile/probe/support.js::createRemoteProbe](plugin/scripts/smoke-profile/probe/support.js)、[plugin/scripts/smoke-profile/probe/index.js](plugin/scripts/smoke-profile/probe/index.js)、[plugin/scripts/smoke-profile/probe/scenarios/baseline.js](plugin/scripts/smoke-profile/probe/scenarios/baseline.js)、[plugin/scripts/smoke-profile/result.mjs](plugin/scripts/smoke-profile/result.mjs)；`plugin/tests/unit/scripts/remote-probe.spec.ts`、[plugin/tests/unit/scripts/smoke-profile.spec.ts](plugin/tests/unit/scripts/smoke-profile.spec.ts)、[plugin/tests/unit/scripts/smoke-profile-contract.spec.ts](plugin/tests/unit/scripts/smoke-profile-contract.spec.ts)；新 `plugin/scripts/smoke-profile/probe/remote-stream.js`；[plugin/package.json](plugin/package.json)、[plugin/pnpm-lock.yaml](plugin/pnpm-lock.yaml)。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：复用 baseline pause/resume 验证订阅、断开、重开与完整补读。
    - 验收点：baseline-remote-pause-resume、baseline-remote-stream-reconnect、restore=PASS 均出现，socket 全部关闭。

- [ ] `plugin/dependencies`：M14 拔除废弃依赖与入口残留
    - 依据文档：[Meeting Remote Migration RUNBOOK][remote-migration-runbook]，M14。
    - 关联文件：[plugin/tests/contract/meeting-runtime.spec.ts](plugin/tests/contract/meeting-runtime.spec.ts)、[plugin/src/client/meeting-panel.tsx](plugin/src/client/meeting-panel.tsx) 的废弃导入/适配代码；[plugin/package.json](plugin/package.json)、[plugin/pnpm-lock.yaml](plugin/pnpm-lock.yaml)；[plugin/eslint.config.js](plugin/eslint.config.js)、[plugin/tests/unit/module-boundaries.spec.ts](plugin/tests/unit/module-boundaries.spec.ts) 的旧 http 模块映射。
    - 确认依据：2026-09-09 本任务中用户确认九接口一次迁移、替换五秒轮询及 review 修复；设计提交 `f7b6812`；本轮要求据此制定 TODO。
    - 处理动作：按 D5 清理旧 fixture、导入和映射，并同步直接依赖及锁文件。
    - 验收点：三组残留检索零匹配；新增仅五个 DSH 包与测试 ws；lint/typecheck/build/package 全通过。

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
