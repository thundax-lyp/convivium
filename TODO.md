# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `B-02 / TeamTask 与 HandRaise 契约`：补齐最小协议、领域模型和 schema
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 4.2、4.4、5/T1 节
    - 确认依据：`B-01` 于 2026-08-27 记录 `UNSUPPORTED_CAPABILITY`；待 TeamTask 依赖与 correlation 契约确认后重新审阅
    - 处理动作：定义两个工具、单一授权 task projection、MeetingState association/snapshot、`pending → consumed` HandRaise 和 B 专属事件，不增加不可达状态或闭环 A 字段。
    - 验收点：协议文档、TypeScript 类型和 schema 一致；Manager context 与 active status 复用同一 task projection；相关 contract tests 和 `pnpm typecheck` 通过。

- [ ] `B-03 / task operation 持久化`：实现最小 prepare/recover metadata
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 4.4、5/T3 节；`docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`
    - 确认依据：`B-02` 通过后执行；当前被 TeamTask 能力缺口阻塞
    - 处理动作：新增 additive `task_operations` migration 和 prepare/recover/finalized metadata API；Meeting fact 仍唯一由原 request 通过 `MeetingRepository.execute()` 提交。
    - 验收点：prepare 不写 MeetingState、event、version、success receipt 或 outbox；DSH 前后及 `execute()` 前后崩溃、不确定结果和终态拒绝均有 repository tests；不修改全局 receipt key。

- [ ] `B-04 / TeamTask adapter 与请求工具`：实现受控 create/associate 链路
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 5/T2、T3、T4 节
    - 确认依据：`B-03` 通过后执行；当前被 TeamTask 能力缺口阻塞
    - 处理动作：按 `B-01` 证据实现最小 `task-adapter`，注册 `convivium_request_background_task`，绑定 caller、Team、Participant 和 SpeakerAttempt，并接入 operation recovery 与唯一 `execute()` 提交路径。
    - 验收点：合法 create/associate、字段互斥、权限拒绝、同 request 幂等和不同 hash 冲突均有测试；请求不完成 attempt、不推进 Turn、不进入 `waiting`。

- [ ] `B-05 / terminal snapshot 与 Participant 通知`：固化授权结果并通知原 Session
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 4.3、5/T2、T3、T6 节
    - 确认依据：`B-04` 通过后执行；当前被 TeamTask 能力缺口阻塞
    - 处理动作：通过已取证 DSH 能力观察 terminal result，经 `MeetingRepository.execute()` 固化 authorized snapshot；仅在必要且可证明时复用或抽取最小 per-Participant Session 串行入口。
    - 验收点：snapshot 不自动生成 HandRaise、transcript、CompletionFact 或终态；同一 Session 不并发 followup；恢复和 disposer tests 通过；无法证明通知或串行性时停止。

- [ ] `B-06 / HandRaise、waiting 与 planning`：完成 Participant 主动回报闭环
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 5/T4、T5、T6 节
    - 确认依据：`B-05` 通过后执行；当前被 TeamTask 能力缺口阻塞
    - 处理动作：实现 `convivium_raise_hand`、pending 去重、合法 `submit_turn` 后的 blocking waiting/replan、Manager task projection 消费、HandRaise consumed 和新 SpeakerAttempt snapshot 固化。
    - 验收点：active attempt 不被打断；失败 plan 不消费 HandRaise；snapshot 不漂移；暂停恢复及 Captain end/version 竞争有测试；不修改 completion/end 判定。

- [ ] `B-07 / 验证与收口`：验证闭环 B 并迁移临时结论
    - 依据文档：`docs/30-designs/RUNBOOK-TEAMTASK-HAND-RAISE.md` 第 6、7、9 节；`docs/00-governance/TODO-RULES.md`
    - 确认依据：`B-06` 通过且闭环 A 已有公开 commit/PR diff 后执行；当前被 TeamTask 能力缺口阻塞
    - 处理动作：语义合并 A/B 共享热点，运行完整插件验证和独立 profile smoke，记录 readiness 证据，迁移长期文档结论并删除临时 RUNBOOK 和已完成 TODO。
    - 验收点：RUNBOOK 验证矩阵均有自动化或真实运行证据；失败项、`Not Covered` 和清理结果已记录；未混入闭环 A、Mail、Archive、HTTP、UI 或无关改动。

## 待讨论项

- [ ] 确认闭环 B 可交付的 DSH TeamTask 能力来源与 create correlation 契约
    - 决策要求：确认使用哪个可安装、可进入正式 profile 的 DSH TeamTask service，以及 DSH 副作用后如何按 caller-provided correlation 查询原创建结果；不得用 process-local `ctx.jobs` 静默替代 TeamTask。
    - 影响范围：闭环 B 的依赖与 profile、TeamTask adapter、跨系统幂等恢复、terminal observation、Participant 通知及 `B-02` 至 `B-07`。
