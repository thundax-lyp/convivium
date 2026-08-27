# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `B-01 / MeetingTask 领域与协议`：实现 canonical state、投影、事件和五个工具 schema
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 4、5、9/T1 节
    - 确认依据：`B-00` 完成并单独提交后执行
    - 处理动作：定义 MeetingTask、ExecutionEnvelope、MeetingTaskProjection、HandRaise，以及 create/status/start/finish/raise-hand 输入输出；MeetingTask 只保存 participantId 和 originatingSpeakerAttemptId，不保存 meetingId、Session ID 或外部 task association；start receipt 不可变，status read 不使用 receipt。
    - 验收点：协议文档、TypeScript 类型和 schema 一致；同 request start 完整返回首次 result，status 可返回不同 observedMeetingVersion；事件只追加 B 专属值；contract tests、format 和 typecheck 通过。

- [ ] `B-02 / MeetingTask transition 与 submit 集成`：实现状态机、终态取消和 submit 优先级
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 4.2、5.1、5.2、8、9/T2 节
    - 确认依据：`B-01` 完成并单独提交后执行
    - 处理动作：实现纯 MeetingTask create/queue/start/finish transitions 和 `cancelNonTerminalMeetingTasks`；只在 submit transition 中按 hard-limit terminal、blocking waiting、non-blocking judge/planning 的固定顺序合并 requested→queued，submit 内 hard-limit 调用 cancellation helper；继续生成既有 `kind='dispatch'`、`payload.role='meeting_task'` outbox，不注册工具或编排 Runtime command。
    - 验收点：hard-limit 同事务取消 task 且无 task outbox；blocking 跳过 judge/next plan；non-blocking 可继续 converging/planning；纯 transition、submit rollback、同版本竞争和 submit 内 hard-limit tests 通过。

- [ ] `B-03 / MeetingTask Session 执行`：实现授权 status、start/finish 与 FIFO task dispatch
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 5.3、5.4、6、9/T3 节
    - 确认依据：`B-02` 完成并单独提交后执行
    - 处理动作：注册 create/status/start/finish 工具，通过既有 `MeetingRepository.execute()` 编排 create/start/finish command；扩展 MeetingSessionAdapter 与 outbox worker 的 `role='meeting_task'` 分支；每次从 `session_ownership` 验证 caller；按 status pre-read→queued start→status post-read 执行，只有 post-read `mayExecute=true` 才允许工作。
    - 验收点：相同 request 完整返回首次 receipt/result；hash、version 和 terminal conflict 语义正确；重复 envelope 不重复 Meeting start/finish 事实；terminal/cancelled status 明确 stop；queued/running owner 不获得并发 SpeakerAttempt；没有自动 running resume；Runtime、Session adapter、worker、ownership 和 recovery tests 通过。

- [ ] `B-04 / HandRaise 与 planning`：实现 waiting 恢复、统一 eligibility 和 task snapshot
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 5.4、5.5、6、7.3、8、9/T4 节
    - 确认依据：`B-03` 完成并单独提交后执行
    - 处理动作：实现 finish-linked 与独立 HandRaise；抽取 canonical speaker eligibility 和 `startRoundRobinTurn`，Manager/round-robin 均排除非终态 task owner；blocking delivery failure 同事务标记 failed并按 selection mode 恢复，paused 时不调度；选中 Participant 时消费 HandRaise并固化 terminal task snapshot。
    - 验收点：失败 plan/version conflict 不消费 HandRaise；未选中的 HandRaise 保持 pending；failure 不伪造 HandRaise；manager/round-robin waiting 恢复、pause 和 snapshot 重投 tests 通过。

- [ ] `B-05 / 闭环 A 集成`：合并 terminal cancellation 与 authorized MeetingTask evidence
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 3、8、9/T2、T4 节
    - 确认依据：`B-04` 完成且闭环 A 的公开 commits 可供语义合并后执行
    - 处理动作：只让 Captain `endMeeting` 调用 B-owned cancellation helper；把 AuthorizedTaskEvidenceResolver 改为只读锁内 MeetingSnapshot 的 completed MeetingTask projection，删除旧 TeamTask association 字段和文案；不重复实现 B-02 已完成的 submit 内 automatic hard-limit cancellation。
    - 验收点：Captain end 遇到 requested/queued/running task 时同事务 cancelled；同版本 task/HandRaise/planning/end 竞争只有一个成功；resolver 不访问 DSH/文件系统/外部服务；A/B 相关测试通过。

- [ ] `B-06 / MeetingTask 验证与收口`：完成真实 DSH 运行证据和临时文档迁移
    - 依据文档：`docs/30-designs/RUNBOOK-MEETINGTASK-HAND-RAISE.md` 第 10 至 13 节；`docs/00-governance/TODO-RULES.md`
    - 确认依据：`B-05` 完成并单独提交后执行
    - 处理动作：运行完整插件验证与独立 DSH profile smoke，证明 Participant continuable Session FIFO、submit-release、task execute、finish+raise、两种 planning、pause/waiting/end race 和恢复；记录 readiness，迁移长期结论并删除临时 RUNBOOK 和已完成 TODO。
    - 验收点：RUNBOOK 验证矩阵均有自动化或真实运行证据；若无法证明同一 Participant Session FIFO，则按停止条件记录 blocker且不引入 execution lease；失败项、Not Covered、环境、commit 和清理结果完整。

## 待讨论项
