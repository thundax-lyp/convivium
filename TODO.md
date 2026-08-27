# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

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
