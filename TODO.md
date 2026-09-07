# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

- [ ] `runtime/role-creation`：RC-05 接入会议身份创建前的配置切面
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md) T5。
    - 确认依据：2026-09-07，用户要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：RC-04 完成。
    - 文件（6 个）：

        - `plugin/src/index.ts`
        - `plugin/src/runtime/application-service/types.ts`
        - `plugin/src/runtime/application-service/create-meeting.ts`
        - `plugin/src/runtime/meeting-runtime.ts`
        - `plugin/tests/unit/runtime/meeting-runtime.spec.ts`
        - `plugin/tests/unit/index-inject.spec.ts`

    - 处理动作：在首个 child 分配前预检全部角色，将配置与绑定接入原创建及清理链路。
    - 验收点：T5 验证通过；预检失败不创建 child，中途失败不发布 ready Meeting，旧创建路径保持通过。

- [ ] `tests/role-closure`：RC-06 验证创建、重放与失败闭环
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md) T6。
    - 确认依据：2026-09-07，用户要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：RC-05 完成。
    - 文件（3 个）：

        - `plugin/tests/contract/meeting-runtime.spec.ts`
        - `plugin/tests/integration/dsh/session-adapter.spec.ts`
        - `plugin/tests/fixtures/role-composition.ts`

    - 处理动作：建立固定 fixture，验证创建与重放、配置变化、归档及失败清理。
    - 验收点：T6 验证通过；ready replay 不重新解析配置，换 ID 同请求冲突，旧绑定不变且公开状态不泄露配置。

- [ ] `smoke/role-recovery`：RC-07 验证真实 DSH 隔离与冷恢复
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md) T7。
    - 确认依据：2026-09-07，用户要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：RC-06 完成。
    - 文件（9 个）：

        - `plugin/scripts/smoke-profile/index.mjs`
        - `plugin/scripts/smoke-profile/result.mjs`
        - `plugin/scripts/smoke-profile/probe/index.js`
        - `plugin/scripts/smoke-profile/probe/support.js`
        - `plugin/scripts/smoke-profile/probe/scenarios/recovery.js`
        - `plugin/scripts/smoke-profile/probe/scenarios/role-composition.js`
        - `plugin/scripts/smoke-profile/probe/role-definitions.js`
        - `plugin/tests/unit/scripts/role-composition-smoke.spec.ts`
        - `docs/50-operations/HOW-TO-DSH-SMOKE.md`

    - 处理动作：增加 role-composition 双阶段场景，验证工具执行限制、persona 隔离及冷恢复。
    - 验收点：T7 unit 与真实 smoke 通过；无自动提交竞争，两个 Host 中保留 V1 配置，九项断言及资源清理通过。

- [ ] `readiness/fr14`：RC-08 完成 FR-14 首版验证与文档收口
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md) T8。
    - 确认依据：2026-09-07，用户要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：RC-07 完成。
    - 文件（8 个）：

        - `docs/40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
        - `plugin/README.md`
        - `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
        - `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
        - `docs/30-designs/ROLE-COMPOSITION-DESIGN.md`
        - `docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md`
        - `TODO.md`

    - 处理动作：完成全量验证，迁移证据并更新首版覆盖；删除已完成任务与临时 RUNBOOK。
    - 验收点：T8 通过；FR-14 仅以共享父 Preset 首版标记已实现，未覆盖边界如实保留，删除前后链接与 diff 检查通过。

## 待审阅任务项

## 待讨论项
