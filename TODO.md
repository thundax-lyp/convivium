# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `domain/decision-risk`：LC-01 领域操作记录 local 来源
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T1。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：RUNBOOK T0 通过。
    - 文件（9 个）：

        - `plugin/src/domain/model.ts`
        - `plugin/src/domain/transitions/decision-acceptance.ts`
        - `plugin/src/domain/transitions/decision-disposition.ts`
        - `plugin/src/domain/completion.ts`
        - `plugin/src/runtime/application-service/meeting-control.ts`
        - `plugin/tests/unit/domain/transitions/decision-acceptance.spec.ts`
        - `plugin/tests/unit/domain/transitions/decision-disposition.spec.ts`
        - `plugin/tests/unit/domain/completion.spec.ts`
        - `plugin/tests/fixtures/local-decision-risk.ts`

    - 处理动作：增加 local authority 和 acceptanceMode，透传替换决策的来源；调整风险权限参数并补测试。meeting-control.ts 仅同步参数，新建共享 fixture。
    - 验收点：V1 通过；五动作保留独立来源，旧 Captain 行为不变，非法输入及终态无修改。

- [ ] `domain/archive`：LC-02 归档校验 local 事实来源
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T2。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-01 完成。
    - 文件（2 个）：

        - `plugin/src/domain/transitions/archive.ts`
        - `plugin/tests/unit/domain/transitions/archive.spec.ts`

    - 处理动作：允许与已提交源记录一致的 local 决策/风险事实归档，拒绝伪造来源。
    - 验收点：V2 通过；合法事实完整保留，authority、actor、kind 或证据不匹配时拒绝。

- [ ] `runtime/application-service`：LC-03 接线三个 local Runtime 方法
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T3。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-02 完成。
    - 文件（6 个）：

        - `plugin/src/runtime/application-service/types.ts`
        - `plugin/src/runtime/application-service/meeting-decision.ts`
        - `plugin/src/runtime/application-service/meeting-control.ts`
        - `plugin/src/runtime/application-service/index.ts`
        - `plugin/tests/contract/meeting-runtime.spec.ts`
        - `plugin/tests/contract/http-boundary.spec.ts`

    - 处理动作：增加 acceptLocalDecision、disposeLocalDecision、disposeLocalRisk，复用原提交路径；HTTP 测试文件仅补 required runtime mocks。
    - 验收点：V3 通过；caller 隔离、重放、版本冲突及风险完成重算正确，不依赖 live Captain。

- [ ] `http/local-control`：LC-04 开放三个 loopback HTTP 写入口
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T4。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-03 完成。
    - 文件（2 个）：

        - `plugin/src/http/index.ts`
        - `plugin/tests/contract/http-boundary.spec.ts`

    - 处理动作：接线 accept-decision、dispose-decision、dispose-risk，校验请求字段并映射类型化响应。
    - 验收点：V4 通过；五动作分派正确，非法输入及错误响应按契约处理，非 loopback 不注册。

- [ ] `client/meeting-panel`：LC-05 实现单行内操作表单
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T5。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-04 完成。
    - 文件（3 个）：

        - `plugin/src/client/meeting-panel.tsx`
        - `plugin/src/client/meeting-panel-sections.tsx`
        - `plugin/tests/client/client-entry.client.spec.ts`

    - 处理动作：在对象行提供五动作，共用表单、证据预选、写锁、错误展示和刷新逻辑。
    - 验收点：V5 通过；DOM 提交准确，无重复目标选择或自动 POST 重试，缓存和终态禁写，迟到响应隔离。

- [ ] `tests/contract`：LC-06 验证事务、冷恢复和完整调用链
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T6。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-05 完成。
    - 文件（2 个）：

        - `plugin/tests/contract/meeting-runtime.spec.ts`
        - `plugin/tests/contract/domain-meeting-repository.spec.ts`

    - 处理动作：补 HTTP→Runtime→Repository 组合、故障回滚、冷重开、幂等和归档保真测试。
    - 验收点：V6 通过；五动作失败无半提交，重放不新增事实，恢复与归档内容一致。

- [ ] `tests/browser-fixture`：LC-06B 准备本地按钮验证夹具
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T6B；[Smoke 操作规程](docs/50-operations/HOW-TO-DSH-SMOKE.md) Decision/Risk 本地按钮验证。
    - 确认依据：2026-09-07，用户要求按最小化设计补齐可执行方案；尚未委派实现。
    - 前置依赖：LC-06 完成。
    - 文件（4 个）：

        - `plugin/scripts/smoke-profile/probe/scenarios/decision-risk-closure.js`
        - `plugin/scripts/smoke-profile/result.mjs`
        - `plugin/tests/unit/scripts/smoke-profile.spec.ts`
        - `docs/50-operations/HOW-TO-DSH-SMOKE.md`

    - 处理动作：复用现有 selector 增加暂停状态的 Browser 夹具、严格 ready 校验及单测，核对操作规程与实现一致。
    - 验收点：V6B 通过；两个候选和一个风险保持未处置，ready 后停止工具写操作；普通模式不变，未运行真实 smoke。

- [ ] `readiness/local-control`：LC-07 完成全量验证与文档收口
    - 依据文档：[RUNBOOK](docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md) T7–T8。
    - 确认依据：2026-09-07，本任务确认产品方案并要求文件级 TODO；尚未委派实现。
    - 前置依赖：LC-06B 完成。
    - 文件（5 个）：

        - `docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
        - `plugin/README.md`
        - `docs/30-designs/RUNBOOK-CAPTAIN-LOCAL-DECISION-RISK-CONTROL.md`
        - `TODO.md`

    - 处理动作：运行完整 verify；新建 evidence、更新 coverage/README，删除 RUNBOOK 和已完成的 LC-01–LC-07（含 LC-06B），保留 LC-08。
    - 验收点：V7–V8 通过；实际结果和未覆盖项已记录，删除前后链接与 diff 检查通过。

- [ ] `readiness/runtime-smoke`：LC-08 合并后验证真实 DSH/Browser
    - 依据文档：[协议](docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) Local decision and risk control；[Smoke 操作规程](docs/50-operations/HOW-TO-DSH-SMOKE.md) Decision/Risk 本地按钮验证。
    - 确认依据：2026-09-07，本任务约定由协调者在合并后执行真实 smoke。
    - 前置依赖：LC-07 完成且实现已合并。
    - 文件（2 个）：

        - `docs/40-readiness/CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md`
        - `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`

    - 处理动作：由协调者按固定规程启动夹具，执行七步按钮/刷新/归档验证、审计 GET 和清理，记录 evidence/coverage。
    - 验收点：七步、六条 local 审计事实和 Restore 全部通过；记录合并版本与实际结果，未通过时保留任务。

## 待讨论项
