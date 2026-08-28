# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

## 待审阅任务项

- [ ] `Question Fact Closure / T0`：通过基线门
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §6 T0；`docs/00-governance/RUNBOOK-RULES.md`
    - 确认依据：2026-08-28 用户要求根据 RUNBOOK 制定 TODO；尚未授权执行；计划分支为 `codex/feat/question-fact-closure`
    - 相关文件：只读 `plugin/package.json`、`plugin/scripts/verify-dsh-environment.mjs`、`plugin/scripts/verify-plugin-contract.mjs`；不修改文件
    - 处理动作：运行环境、插件契约、分支和工作树检查，保存基线输出。
    - 验收点：`pnpm --dir plugin verify:environment`、`pnpm --dir plugin verify:contract` 退出码为 0，当前分支精确为 `codex/feat/question-fact-closure`；失败则 STOP。

- [ ] `Question Fact Closure / T1`：同步正式接口与设计语义
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §6 T1；`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`；`docs/30-designs/DOMAIN-MODEL-DESIGN.md`；`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
    - 确认依据：2026-08-28 用户确认 `PublicQuestionV1` V1 optional 兼容语义及 `INVALID_ENTITY_STATE -> INVALID_ARGUMENT` 公开映射；整体实施尚待用户确认
    - 相关文件：`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`、`docs/30-designs/DOMAIN-MODEL-DESIGN.md`、`docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
    - 处理动作：保持 `PublicQuestionV1` 的 V1 optional 兼容语义，写入 `QuestionClaimV1` 的 blocking 能力边界、status questions、`question.added`/`question.answered`、resolution 约束和公开错误映射。
    - 验收点：T1 指定的十三个 `rg` 检查及文档 `git diff --check` 全部通过；不得声称 blocking question 已支持或公开 `INVALID_ENTITY_STATE`。

- [ ] `Question Fact Closure / T2`：完成协议类型与 Schema
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §6 T2；`docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
    - 确认依据：T1 PASS 后执行
    - 相关文件：`plugin/src/protocol/commands.ts`、`plugin/src/protocol/types.ts`、`plugin/src/protocol/status.ts`、`plugin/tests/contract/protocol-schema.spec.ts`
    - 处理动作：在 `commands.ts` 拒绝空白 question text，在 status 类型和 Schema 增加 additive optional `questions`，补充协议契约测试。
    - 验收点：`pnpm --dir plugin vitest run tests/contract/protocol-schema.spec.ts` 与 `pnpm --dir plugin typecheck` 通过；V1 `questions` 不被改为 required。

- [ ] `Question Fact Closure / T3`：补齐 canonical MeetingQuestion 与事件类型
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §4.2、§6 T3；`plugin/src/domain/model.ts`
    - 确认依据：T2 PASS 后执行
    - 相关文件：`plugin/src/domain/model.ts`、`plugin/tests/unit/domain/completion.spec.ts`、`plugin/tests/unit/domain/transitions.spec.ts`
    - 处理动作：固定 `MeetingQuestion` 字段和 required 语义，加入 `question.added` 与 `question.answered`，仅更新 RUNBOOK 指定的三个 fixture。
    - 验收点：`pnpm --dir plugin typecheck` 通过；不存在未授权的 production 兼容默认值或额外 fixture 修改。

- [ ] `Question Fact Closure / T4`：实现 Question 创建 transition
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §4.3、§5、§6 T4；`plugin/src/domain/transitions.ts`
    - 确认依据：T3 PASS 后执行
    - 相关文件：`plugin/src/domain/transitions.ts`、`plugin/tests/unit/domain/transitions.spec.ts`
    - 处理动作：实现 `SubmittedQuestionInput`、`addSubmittedQuestions`、submit 调用顺序、全量校验、canonical state 和 `question.added` 事件。
    - 验收点：合法单/多问题、重复 ID、空文本、非法 directedTo、blocking true、部分非法零写入和事件顺序测试通过；`pnpm --dir plugin vitest run tests/unit/domain/transitions.spec.ts` 与 `pnpm --dir plugin typecheck` 通过。

- [ ] `Question Fact Closure / T5`：实现 Question resolution 与完成判断
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §4.3、§5、§6 T5；`plugin/src/domain/completion.ts`
    - 确认依据：T4 PASS 后执行
    - 相关文件：`plugin/src/domain/completion.ts`、`plugin/tests/unit/domain/completion.spec.ts`
    - 处理动作：校验 caller authored answer，固化 `answerMessageId`，追加 `question.answered`，保留 completion fact，并让 open non-blocking question 不阻塞完成。
    - 验收点：授权/越权/未知/重复回答、事件顺序、blocking 与 non-blocking completion 测试通过；`pnpm --dir plugin vitest run tests/unit/domain/completion.spec.ts` 与 `pnpm --dir plugin typecheck` 通过。

- [ ] `Question Fact Closure / T6`：接通 Runtime 并验证原子幂等
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §6 T6；`plugin/src/tools/meeting-runtime.ts`
    - 确认依据：T5 PASS 后执行
    - 相关文件：`plugin/src/tools/meeting-runtime.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`
    - 处理动作：生成稳定 question ID 和单次 `commandNow`，接入既有 repository transaction，并在 `submitTurn` catch 将 `INVALID_ENTITY_STATE` 固定映射为非重试的 `INVALID_ARGUMENT`；不改变 caller binding、request hash、outbox 或 DSH API。
    - 验收点：`pnpm --dir plugin vitest run tests/contract/meeting-runtime.spec.ts` 与 `pnpm --dir plugin typecheck` 通过；创建、delivery 重放、hash conflict、stale attempt、blocking true 和多问题部分失败场景无额外 version/message/question/event 副作用。

- [ ] `Question Fact Closure / T8`：完整验证、readiness 迁移与 RUNBOOK 收口
    - 依据文档：`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md` §6 T8、§7-§10；`docs/00-governance/TODO-RULES.md`
    - 确认依据：T7 PASS 后执行
    - 相关文件：`docs/40-readiness/QUESTION-FACT-CLOSURE-EVIDENCE.md`（新增）、`docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`、`TODO.md`（删除本组 T0-T8）、`docs/30-designs/RUNBOOK-QUESTION-FACT-CLOSURE.md`（最终删除）
    - 处理动作：运行完整 `plugin verify`，创建 Question closure readiness evidence，更新 implementation coverage，记录 blocking question `Not Covered`，完成文档链接检查后删除 RUNBOOK 及仅指向它的引用。
    - 验收点：完整验证、链接检查、删除前后 `git diff --check` 和删除后无 RUNBOOK 引用均通过；仅在 readiness 迁移完成且所有 scope/验证满足后，才删除本组 T0-T8 九项。

## 待讨论项
