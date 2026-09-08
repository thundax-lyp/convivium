# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `smoke-profile / SQLite 接线`：配置隔离 profile 的 SQLite 组合
    - 依据文档：[Architecture：Host/profile 所有权](docs/00-governance/ARCHITECTURE.md#confirmed-storage-provider-transition)；[Implementation Design：Storage Domain 生命周期](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#storage-domain-ownership-and-lifecycle)；[Smoke 操作规则：分层与入口](docs/50-operations/HOW-TO-DSH-SMOKE.md#自动-smoke-的分层与入口)、[成功与 Restore](docs/50-operations/HOW-TO-DSH-SMOKE.md#成功与-restore)。
    - 执行步骤：[RUNBOOK T5](docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md#t5配置隔离-profile-的-sqlite-组合)
    - 修改文件：`plugin/scripts/smoke-profile/index.mjs::writeProbePackage`、`writeSmokePatch`、`dumpConfig`；`plugin/tests/unit/scripts/smoke-profile.spec.ts`。
    - 只读边界：`plugin/scripts/smoke-profile/environment.mjs` 与现有 scenario/result 模块，不修改凭据、selector 或已有 profile。
    - 前置依赖：T4 PASS。
    - 确认依据：2026-09-08 用户明确要求依次执行 TODO LIST，一任务一提交。
    - 处理动作：配置 test-only profile provider 依赖、SQLite row 和精确 Domain 路由，并验证生成配置。
    - 验收点：配置测试与 lint 通过；phase 1/2 复用同一 DB 路径；本项不声称真实 Loader 已验证。

- [ ] `smoke-profile / 真实运行`：验证真实 profile 冷重启与清理
    - 依据文档：[Architecture：Host/profile 所有权](docs/00-governance/ARCHITECTURE.md#confirmed-storage-provider-transition)；[Implementation Design：Storage Domain 生命周期](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#storage-domain-ownership-and-lifecycle)；[Smoke 操作规则：分层与入口](docs/50-operations/HOW-TO-DSH-SMOKE.md#自动-smoke-的分层与入口)、[成功与 Restore](docs/50-operations/HOW-TO-DSH-SMOKE.md#成功与-restore)。
    - 执行步骤：[RUNBOOK T6](docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md#t6验证真实-profile-冷重启与清理)
    - 执行入口：`plugin/scripts/smoke-profile/index.mjs`；只读 `plugin/scripts/smoke-profile/probe/scenarios/recovery.js`、`plugin/scripts/smoke-profile/probe/scenarios/isolation.js` 及其他原核心场景。
    - 记录文件：`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md`；RUNBOOK 的执行结果记录。
    - 前置依赖：T5 PASS。
    - 确认依据：2026-09-08 用户明确要求依次执行 TODO LIST，一任务一提交。
    - 处理动作：运行默认五核心 smoke，核对实际 Loader、冷重启、隔离、归档与 Restore，记录真实结果。
    - 验收点：按已接受的关闭限制验证关闭前已确认事实的冷恢复；五场景全部 PASS/restore=PASS，V8 运行部分通过；无临时资源残留，失败不得通过改代码或 driver 绕过。

- [ ] `Storage / 正式文档`：同步正式存储与操作文档
    - 依据文档：[Document Rules：同步与证据职责](docs/00-governance/DOCUMENT-RULES.md#document-sync)；[Architecture：替换决定](docs/00-governance/ARCHITECTURE.md#confirmed-storage-provider-transition)；[Persistence Design：验收](docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md#acceptance)；[Implementation Design：验证设计](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#verification-design)。
    - 执行步骤：[RUNBOOK T7](docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md#t7同步正式存储与操作文档)
    - 修改文档：`docs/00-governance/ARCHITECTURE.md`、`docs/20-interfaces/MEETING-STORAGE-INTERFACE.md`、`docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`、`docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`。
    - 操作文档：`docs/50-operations/HOW-TO-DSH-SMOKE.md`。
    - 导航同步：`TODO.md` 仅将已移除过渡 section 的 Architecture 锚点改为 confirmed-baseline，不改变任务状态。
    - 前置依赖：T6 PASS。
    - 确认依据：2026-09-08 用户明确要求依次执行 TODO LIST，一任务一提交。
    - 处理动作：同步介质职责、装配、文件布局和操作说明，保留领域算法及业务契约。
    - 验收点：diff、链接检查通过；无旧 JSONL 当前职责描述，历史材料明确标记，业务字段/算法无变化。

- [ ] `Storage / 完整验证与证据`：完成全量验证并归集 readiness 证据
    - 依据文档：[Document Rules：同步与证据职责](docs/00-governance/DOCUMENT-RULES.md#document-sync)；[Architecture：替换决定](docs/00-governance/ARCHITECTURE.md#confirmed-storage-provider-transition)；[Persistence Design：验收](docs/30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md#acceptance)；[Implementation Design：验证设计](docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#verification-design)。
    - 执行步骤：[RUNBOOK T8](docs/30-designs/RUNBOOK-DSH-SQLITE-STORAGE.md#t8完成全量验证并归集-readiness-证据)
    - 证据文件：`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md`、`docs/40-readiness/DSH-CAPABILITY-INTEGRATION-EVIDENCE.md`。
    - 允许格式化：仅 RUNBOOK T1–T5 白名单内尚存代码文件，不扩大到其他文件。
    - 验证入口：`plugin/package.json::scripts.verify` 与 RUNBOOK T8 的领域代码零 diff 检查。
    - 前置依赖：T7 PASS；可执行代码或 smoke 配置变化时重跑 T6，否则复用其运行证据。
    - 确认依据：2026-09-08 用户明确要求依次执行 TODO LIST，一任务一提交。
    - 处理动作：执行完整验证并归集 V1–V9 的命令、环境、结果和未覆盖边界。
    - 验收点：verify、diff 检查通过，领域生产代码零 diff，mandatory 项齐全，历史 JSONL 证据不重标。

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
