# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。
- 下列 AR-00 至 AR-07 按顺序执行；步骤内的唯一动作、命令、白名单、PASS/STOP 以各项所引 RUNBOOK 为准，不得跳过前置依赖。

## 当前任务项

- [ ] `推荐状态与领域 transition`：AR-02 实现单条推荐拒绝
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T2。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-01 PASS。
    - 文件（7 个）：

        - `plugin/src/domain/model.ts`
        - `plugin/src/domain/errors.ts`
        - `plugin/src/domain/meeting-state-validation.ts`
        - `plugin/src/domain/transitions/index.ts`
        - `plugin/src/domain/transitions/attendance-rejection.ts`（新增）
        - `plugin/tests/unit/domain/transitions/attendance-rejection.spec.ts`（新增）
        - `plugin/tests/unit/repository/domain/projection.spec.ts`

    - 处理动作：按 T2 实现 rejection 状态、纯 transition、审计事件及归档 mapper，并补齐读取兼容测试。
    - 验收点：T2 focused tests 与 typecheck 通过；仅目标推荐与 eventSeq 改变；旧 pending 可读，非法结构抛底层异常，未知版本抛 UnsupportedMeetingStateFormatError。

- [ ] `Captain Runtime 与持久事务`：AR-03 接通拒绝命令及恢复
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T3。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-02 PASS。
    - 文件（7 个）：

        - `plugin/src/runtime/application-service/meeting-attendance.ts`（新增）
        - `plugin/src/runtime/application-service/types.ts`
        - `plugin/src/runtime/application-service/index.ts`
        - `plugin/tests/contract/meeting-runtime.spec.ts`
        - `plugin/tests/contract/domain-meeting-repository.spec.ts`
        - `plugin/tests/contract/tool-registration.spec.ts`
        - `plugin/tests/contract/offline-meeting-protocol.spec.ts`

    - 处理动作：按 T3 接通 Captain-only Runtime method、Repository execute 和结果映射，验证授权、幂等、并发、回滚与 reopen。
    - 验收点：T3 focused tests 与 typecheck 通过；仅本会议 Captain 可写，单次提交无 outbox；重放不增版本，故障无半提交；Repository 层错误码与底层异常分开断言。

- [ ] `DSH 拒绝推荐工具`：AR-04 注册工具并验证模型结果
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T4。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-03 PASS。
    - 文件（3 个）：

        - `plugin/src/tools/register-tools.ts`
        - `plugin/tests/contract/tool-registration.spec.ts`
        - `plugin/tests/contract/offline-meeting-protocol.spec.ts`

    - 处理动作：按 T4 注册 convivium_dispose_attendance_recommendation，接入既有 Schema、caller、Runtime 和 JSON renderer。
    - 验收点：T4 tool-registration、offline-meeting-protocol 与 typecheck 通过；非法输入不进入 Runtime，canonical result/render 一致，dispose 移除注册。

- [ ] `推荐状态与归档 projection`：AR-05 闭合可见性、归档和恢复
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T5。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-04 PASS。
    - 文件（9 个）：

        - `plugin/src/projection/status.ts`
        - `plugin/src/protocol/status.ts`
        - `plugin/src/runtime/services/meeting-archive-service.ts`
        - `plugin/src/domain/transitions/archive.ts`
        - `plugin/tests/contract/status-projection.spec.ts`
        - `plugin/tests/unit/runtime/archive.spec.ts`
        - `plugin/tests/unit/domain/transitions/archive.spec.ts`
        - `plugin/tests/contract/meeting-runtime.spec.ts`
        - `plugin/tests/contract/protocol-schema.spec.ts`

    - 处理动作：按 T5 增加脱敏拒绝信息和 archive matching，使用完整 continuable fixture 验证 cancelled 结束后的归档与 reopen。
    - 验收点：T5 focused tests 与 typecheck 通过；三类 Agent 状态一致、local_host active 仍为 []；getStatus 确认为 archived，归档仅七字段且恢复不变，终态新写被拒绝、原请求可重放。

- [ ] `真实 Loader 与完整验证`：AR-06 验证新工具拒绝路径
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T6。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-05 PASS。
    - 文件（4 个）：

        - `plugin/scripts/smoke-profile/probe/scenarios/baseline.js`
        - `plugin/scripts/smoke-profile/result.mjs`
        - `plugin/tests/unit/scripts/smoke-profile-contract.spec.ts`
        - `plugin/tests/unit/scripts/smoke-profile.spec.ts`

    - 处理动作：按 T6 为 baseline 增加缺失推荐的真实工具调用断言，并运行完整 verify 与独立 profile smoke。
    - 验收点：T6 脚本测试、verify、baseline smoke 全部通过；新调用 INVALID_ARGUMENT 且零副作用；既有 baseline 正常，wrapper restore=PASS；不外推生产 Catalog 成功链路。

- [ ] `正式文档与任务收口`：AR-07 迁移证据并清理临时任务
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md) T7。
    - 确认依据：2026-09-07，用户明确要求依次执行 TODO LIST，一任务一删除一提交。
    - 前置依赖：AR-06 PASS。
    - 文件（9 个）：

        - `docs/30-designs/DOMAIN-MODEL-DESIGN.md`
        - `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
        - `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`
        - `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
        - `docs/40-readiness/CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md`（新增）
        - `plugin/README.md`
        - `TODO.md`
        - `docs/30-designs/RUNBOOK-CAPTAIN-ATTENDANCE-REJECTION.md`

    - 处理动作：按 T7 迁移稳定契约与实际验证证据，核对完成条件后清理本 RUNBOOK 及本次 TODO 条目。
    - 验收点：S1–S4、V1–V12 均有实际证据；FR-13 仍为部分实现；未覆盖范围记录准确；删除后无残留引用、链接与 diff 检查通过，失败则恢复被删除文档和条目。

## 待审阅任务项

## 待讨论项
