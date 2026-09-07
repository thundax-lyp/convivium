# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

以下 FR-10 任务按 T0 → T8 顺序执行，前一步 PASS 才能开始下一步。2026-09-07 用户明确要求“依次执行TODO LIST，一任务一删除一提交”；执行、逐项删除与逐项 commit 已获授权。允许文件、命令、PASS/STOP 和恢复方式以 RUNBOOK 对应步骤为准，不在此复制方案。

- [ ] `FR-10 / T1 / 正式接口与设计`：落定引用式草稿契约
    - 依据文档：[RUNBOOK T1](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t1落定正式接口与-domain-结构)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T0 PASS 后，同步 Protocol、Domain Model 和 Orchestration Design 的草稿结构与边界。
    - 验收点：字段、校验、错误、兼容与 RUNBOOK 第 4 节一致；明确仅 message 引用、非权威且无角色权限提升；文档检查通过。

- [ ] `FR-10 / T2 / Protocol`：补齐可选草稿输入输出
    - 依据文档：[RUNBOOK T2](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t2输入与输出协议增量)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T1 PASS 后，为现有提交和公开消息增加 optional minutesDraft 类型及严格 Schema。
    - 验收点：指定协议正负用例和 typecheck 通过；未知字段、非法范围和混合提交被拒绝；旧输入保持兼容且不补默认草稿。

- [ ] `FR-10 / T3 / Domain`：实现草稿校验与原子追加
    - 依据文档：[RUNBOOK T3](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t3领域消息附加与原子拒绝)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T2 PASS 后，在既有 Speaker transition 中验证可见范围和引用、复制元数据并拒绝混合 claims。
    - 验收点：指定领域测试和 typecheck 通过；非法提交不修改输入或产生部分事实；合法草稿只追加一次，不新增事件类型或权威副作用。

- [ ] `FR-10 / T4 / Runtime 与持久恢复`：接线并验证提交一致性
    - 依据文档：[RUNBOOK T4](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t4runtime-接线与持久恢复)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T3 PASS 后，连接现有 submit_turn，覆盖身份校验、receipt 重放、冲突、失败回滚和持久重开。
    - 验收点：指定 contract 测试和 typecheck 通过；commit tail/checkpoint 重开精确保留草稿；126 次 allowNoop 只增加 receipt 并触发 checkpoint，不改变会议快照、事件或 outbox；不修改 repository production。

- [ ] `FR-10 / T5 / Projection 与 Archive`：保留公开草稿和不可变归档
    - 依据文档：[RUNBOOK T5](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t5公开投影与不可变归档)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T4 PASS 后，补齐公开元数据映射与归档等值校验，验证缺席、失败、替换及清理重试。
    - 验收点：指定 projection/archive 测试和 typecheck 通过；丢失、注入或篡改 metadata 被拒绝；旧数据可读，草稿不增加归档等待条件或暴露私有信息。

- [ ] `FR-10 / T6 / Client`：只读展示草稿并区分会议事实
    - 依据文档：[RUNBOOK T6](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t6client-只读草稿标识)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T5 PASS 后，在原 Transcript 行展示草稿标记、覆盖范围和有序引用，补齐固定 DOM 验收用例。
    - 验收点：Client 测试和 typecheck 通过；active/archive、刷新与切换不丢失或残留元数据；草稿与当前发言者、候选建议、任务、等待原因和正式决定可区分；不新增写入口。

- [ ] `FR-10 / T7 / DSH Smoke`：验证真实引用草稿链路
    - 依据文档：[RUNBOOK T7](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t7真实-dsh-引用草稿场景)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交。
    - 处理动作：T6 PASS 后，增加唯一 scribe-minutes selector，接入现有驱动和结果校验并运行真实 DSH 场景。
    - 验收点：指定脚本测试、六项 oracle 和 Restore 全部 PASS；HTTP/archive 按第 4.5 节固定公开字段比较；内部附加字段不误报，公开字段及 metadata 篡改被拒绝；默认核心场景不变。

- [ ] `FR-10 / T8 / 验证与收口`：完成整项验收并迁移证据
    - 依据文档：[RUNBOOK T8](docs/30-designs/RUNBOOK-FR10-REFERENCED-MINUTES.md#t8完整验证证据与删除)、[TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)
    - 确认依据：2026-09-07 用户明确要求依次执行、一任务一删除一提交；push/PR/merge 未授权。
    - 处理动作：T7 PASS 后，完成完整 verify、固定回归集、Browser 观察与 Restore，迁移长期文档和证据，再按规则更新覆盖并清理临时任务。
    - 验收点：V1–V15 与 R1–R11 按规定证据口径收口；保留邮件增量跨层动态场景等 Not Covered；全部门禁通过才提升 FR-10、删除 RUNBOOK 及其任务引用；删除后链接与 diff 检查通过。仅关闭真正完成的 TODO，部分完成时收窄剩余范围。

## 待审阅任务项

## 待讨论项
