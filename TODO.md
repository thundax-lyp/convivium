# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `dsh-plugin-development/SKILL.md`：增加实现前复杂度门禁
  - 依据文档：`docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md` T3
  - 确认依据：2026-08-28，用户要求依据 RUNBOOK 制定 TODO；长期文件修改仍待确认执行
  - 处理动作：在工作流后插入 RUNBOOK 固定的“范围与复杂度门禁”，并按固定文本扩展输出要求。
  - 验收点：门禁位于主 Skill 而非 reference；不把多个消费者设为强制条件；保留运行时、权限、事务、持久化和生命周期隔离依据；front matter、官方来源优先级、验证顺序和 DSH 边界无变化。

- [ ] `convivium-module-review/SKILL.md`：增加复杂度 finding 检查与门槛
  - 依据文档：`docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md` T4
  - 确认依据：2026-08-28，用户要求依据 RUNBOOK 制定 TODO；长期文件修改仍待确认执行
  - 处理动作：增加无当前证据价值机制和更小安全结构检查，并在 finding 类型中加入“范围与复杂度”。
  - 验收点：复杂度 finding 必须同时指出实际成本、缺失依据和更小安全边界；单消费者、单实现、文件数、代码行数和个人风格不能单独形成 finding；Skill 的只读范围与其他输出字段无变化。

- [ ] `convivium-pr-review/references/review-checks.md`：增加复杂度证据链
  - 依据文档：`docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md` T5
  - 确认依据：2026-08-28，用户要求依据 RUNBOOK 制定 TODO；长期文件修改仍待确认执行
  - 处理动作：按固定文本增加范围与复杂度基础检查、复杂度链和三项 finding 证明门槛。
  - 验收点：复杂度链与现有七条链并列；finding 同时证明当前成本、依据缺失和更小安全方案；不改变 evidence matrix、ledger、优先级和只审当前 diff 的边界。

- [ ] `convivium-codex-comment-fix/SKILL.md`：固定 finding、最小修复和 thread 收口语义
  - 依据文档：`docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md` T6
  - 确认依据：2026-08-28，用户要求依据 RUNBOOK 制定 TODO；长期文件修改仍待确认执行
  - 处理动作：严格执行 T6.1–T6.6，更新 front matter 和目标终点，增加 finding 与方案分离、四类处理结果、最小安全修复回复要求及禁止顺带重构规则。
  - 验收点：`accept-with-smaller-fix` 使用 👍 并在修复后 resolve；`reject` 使用 👎、说明依据后可 resolve；`defer-or-decision` 使用 👎、回复并保持 unresolved；无 commit 不得宣称已修复；既有 GitHub、commit/push 和两轮处理边界不变。

- [ ] `复杂度控制工作流`：完成整体语义验证、场景验收和任务收口
  - 依据文档：`docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md` T7–T9
  - 确认依据：2026-08-28，用户要求依据 RUNBOOK 制定 TODO；长期文件修改、commit、push 和 PR 仍分别待授权
  - 处理动作：在前述七项均完成后执行固定的格式、术语、旧文案、文件基线、本地链接和八场景验证；提交收口时删除 RUNBOOK 及本组全部已完成 TODO。
  - 验收点：T7 全部命令和断言通过；T8 八个场景得到固定结果；没有产品代码或额外长期文件变化；执行前用户改动未丢失；状态目录按精确边界清理；RUNBOOK 和本组 TODO 在真正完成任务的同一 commit 中删除且无残留引用。

## 待讨论项
