# Code Alignment Handoff

## 阶段边界

2026-09-07，用户要求下班前做阶段性提交，回家后继续。本文件是临时交接上下文，不是 RUNBOOK，也不代表任务验收完成。

- 当前分支：`codex/align-code`。
- 已有 PR：[PR #58](https://github.com/thundax-lyp/convivium/pull/58)，base `main`；尚未合并。
- 初始代码审计基线：`743edbee564d34402fedc2bb44ebbb006790fe1a`。此前 readiness 提交 `6cc8c413e4bf0f267a6b3b7c1b1f1a953750996c` 已推送；本次阶段提交仅本地保存，尚未 push，PR 尚未反映当前修改。
- 当前目标仍是处理 [Code Alignment Evidence](docs/40-readiness/CODE-ALIGNMENT-EVIDENCE.md) 的 CA-01–06，运行验证并更新 readiness；不是实现全部 FR-13 后续功能。
- 用户要求全项目 testcase 按业务对象或业务能力命名，明确否定 `code-alignment.spec.ts` 这种按审计任务组织测试的方式。
- 根目录 README 是用户留白，禁止改动。用户已另行同意删除 `plugin/README.md`，本轮已经删除并清理 package allowlist 和验证断言。Definition 样本检查中的 README 属于 `plugin/examples/meeting-agent-definitions/`，与被删除文件无关，保留。

## 本轮代码提交

- `b3ed4e7`：完成判断、规划评分和收敛指纹。
- `be2385f`：Session 对账恢复、持久身份替换与诊断。
- `04d95b8`：面板展示提案、立场、举手和收敛事实。
- `aa78fdb`：按业务能力和稳定工程对象命名测试。
- `f97bdd6`：删除插件 README 并同步打包白名单。
- 本交接文件与 readiness 阶段提示由随后的文档提交保存。

## 已实现，尚待最终收口

| 对象 | 当前工作 |
| --- | --- |
| 完成判断 | `completion.ts` 纳入每个 Proposal 当前 revision 的 blocking object/needs_revision；自动 judge 和 completed end 共用 guard。回归归入 `tests/unit/domain/completion.spec.ts`。 |
| 发言规划 | `planning.ts` 收集同议题所有独立 Proposal 当前 blocking owners；上一 Turn 未发言的 Participant 获得 +20。回归归入 `planning.spec.ts`。 |
| 收敛指纹 | 同 Proposal 的 Position 增加 ID 排序，数组重排不改变 fingerprint。回归归入 `transitions/turn-advancement.spec.ts`。 |
| Session 恢复 | 新增 `runtime/services/meeting-session-recovery.ts`，接入生产 Captain registry 与 rehydration；中断创建清理、缺失默认角色 Session 补建、pause/revoke、mail cancellation、并发恢复去重。 |
| 身份持久化 | `replaceMissingSession` 原子保留旧 closed/revoked ownership 与 `supersededBySessionId`，新 identity 先 provisioning；替换链经过 schema 验证并保留在 checkpoint，旧 Session caller 被拒绝。派发跳过 superseded identity。 |
| 恢复限制 | 带 Agent Definition 的持久 descriptor 丢失时返回 `RECOVERY_ROLE_DESCRIPTOR_MISSING` 并保留 pause；不能仅凭 fingerprint 重建历史 persona/toolFilter，也不能套用当前 Definition。终态只清理，不补建 Session。 |
| 面板 | 从现有 projection 展示 Proposal/Position、待处理 HandRaise、stall/replan 和 selection reason；刷新整体替换旧事实。Client 回归使用 jsdom。 |
| 诊断 | `repository/diagnostics.ts` 从提交结果发出脱敏日志/数值 metrics，production 接 DSH logger；覆盖 waiting/delivery/attempt/termination、失败、恢复与归档。日志 callback 失败不回滚提交。 |
| 测试命名 | 删除临时 `code-alignment.spec.ts`；四处文件重命名及多处 suite 去任务编号、函数名或过泛描述。治理规则写入 Architecture 的 Test Naming。 |
| 正式文档 | 修正 Markdown acceptanceMode、早期 orchestration 字段和 lock/Catalog/Definition 表述、实际模块路径；同步恢复与 ownership 替换契约。 |

新增恢复用例在 `plugin/tests/recovery/session-recovery.spec.ts`：中断创建、Manager/Participant 丢失、跨身份拒绝、副作用失败重试、checkpoint 后旧身份拒绝、Definition descriptor 丢失、终态不补建、先 revoke 后清理及错误脱敏。

文件重命名：

- `tests/client/client-entry.client.spec.ts` → `tests/client/meeting-panel.client.spec.ts`
- `tests/unit/index-inject.spec.ts` → `tests/unit/host-plugin-lifecycle.spec.ts`
- `tests/recovery/recovery.spec.ts` → `tests/recovery/meeting-recovery.spec.ts`
- `tests/unit/domain/transitions/kernel.spec.ts` → `tests/unit/domain/transitions/turn-step-attempt.spec.ts`

上述路径相对 `plugin/`。历史 readiness 中已经执行的旧命令不静默重写；新的验证记录使用新路径。

## 实际验证

- 本轮 `pnpm --dir plugin verify`：exit 0；format、lint、Host/Client typecheck、84 files / 1055 tests、build、environment、plugin contract、9 Definition samples、package 全部 PASS。
- 其中全量 Vitest：84 files / 1055 tests PASS，71.15 秒；新恢复 8 项、领域三文件 58 项、Client 65 项均通过。
- 早先一次全量 verify 因新增生产调用暴露 runtime contract fake 缺少 `listDescendants` 而失败；已补齐 fake，本轮该文件 63 项通过。
- checkpoint 回归最初把 checkpoint baseSeq 断言写成大于 128，实际阈值为 128；已改为大于等于 128，本轮通过。
- 修复前基线 `verify` 的 82 files / 1039 tests 和真实 smoke 16/16 仅是历史证据，不能作为本次源码 smoke 成功证据。
- 本轮尚未运行修复后的真实 DSH smoke、Browser 页面交互、真实 LLM 或长期压力验证。

本机日志在临时目录，换机器不保证存在：系统临时目录中的 `convivium-align-fix-verify.log`、`convivium-session-tests.log`。不要依赖这些日志继续工作，必要时重新运行仓库命令。

## 回来后继续

1. 先读根 AGENTS、`docs/AGENTS.md` 和 Architecture；涉及验证、文档、提交/PR 时按路由读相应治理。已有任务范围已授权，不需要重新询问是否可运行验证。
2. 审查恢复与诊断的最终边界，特别是生产 `getCaptainParent` 接线、同进程创建排除、pause 是否取消旧 outbox、补建后显式 resume、superseded chain 的 archive/dispatch 选择。当前有 repository + fake DSH 回归，缺失 Session/中断创建还没有真实 Host 故障注入证据。
3. 核对 metrics 的每项需求与实际事件落点：冷恢复后 active gauge、parent 不可用错误、不同 Session 清理失败路径，以及 step/attempt/delivery 关联字段是否齐全。不要直接宣称 CA-06 全部验收通过。
4. 完成全项目 `it`/`test` 标题终审，保持业务对象/能力组织，不另建任务专属 testcase。检查新增测试是否验证可观察行为；当前恢复 fake 仍有类型断言，可进一步用 DSH 公开类型约束。
5. 源码审查或修复后运行最窄相关 tests；最终运行 `pnpm --dir plugin verify`，再按 `docs/50-operations/HOW-TO-DSH-SMOKE.md` 执行 `pnpm --dir plugin smoke:profile --all`。遵守 Prepare/Execute/Assert/Restore；不要启动未清理的长期 Host。
6. 为新面板区域补充实际 Browser 观察，或在证据中明确仅有 Client jsdom 验证；不能把 HTTP/产物检查冒充 Browser。旧 Browser 专项保留原始基线。
7. 更新 `CODE-ALIGNMENT-EVIDENCE.md`、`CURRENT-IMPLEMENTATION-COVERAGE.md`、`SMOKE-VALIDATION-EVIDENCE.md` 的当前结果。目前仅添加阶段状态提示，正文审计表仍是修复前历史，不可继续称为当前未实现，也不可全部提前关闭。保留 FR-13、压力、模型和发布等未覆盖范围。
8. 最终复核 diff、链接、TODO 和 README 边界。用户本次只授权阶段 commit，没有授权本轮 push/合并；后续按用户指令更新 PR。完成交接后删除本临时文件，把长期证据留在 readiness。
