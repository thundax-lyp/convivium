# DSH Capability Integration Evidence

## Scope

- 日期：2026-09-08。
- 源码边界：`8c3b7ab0359828f4b2e33554300c134f95bacecd`，分支 `codex/upgrade-dsh-0.1.2-rc.1`；验证在提交前的同一源码工作区执行。
- 环境：Darwin arm64、Node `v22.23.2`，项目 DSH 固定 `0.1.2-rc.1`、Cordis `4.0.2`。
- DSH 对照边界：只读源码 tag `dsh-v0.1.2-rc.1`（`a66e4702047846cdaa10c66c9d3df3951f5ea70d`）及安装包公开类型；不以相邻源码仓库 HEAD 代替目标版本。
- 当前能力覆盖汇总见 [Current Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)；历史 `0.1.1-rc.2` 的 Browser 等专项证据保留各自边界，不外推至新版本。

## Validated Contract

| 能力 | 当前采用方式与责任边界 | 验证落点（相对 `plugin/`） |
| --- | --- | --- |
| 独立角色配置 | `startContinuable.request.agentOptions` 承载 provider/model/reasoningEffort；DSH descriptor 保存配置，Convivium 仅保存 Definition identity/hash | `tests/unit/role-composition/resolve.spec.ts`、`tests/integration/dsh/session-adapter.spec.ts`、role-composition smoke |
| 工具与服务生命周期 | Tools 自带注册清理；Cordis inject 管理 WebServer 可选加载、卸载和重挂载；运行时及 HTTP disposer 保留明确所有者 | `tests/unit/host-plugin-lifecycle.spec.ts` 中真实 Cordis/SystemPrompt/Tools 组合和无 WebServer 回归 |
| 消息投递 | 使用公开 `sendMessage`，四类业务入口共用发送实现；发送前后保留业务授权检查 | session-adapter integration tests；真实 smoke 按全部 text blocks 解析 DSH sender 前缀与会议 envelope |
| 冷恢复投递 | Native durable children 枚举确认原身份；仅将未完成 planning、running speaker attempt、queued MeetingTask 的已接受 delivery 原标识重投 | `tests/contract/domain-meeting-repository.spec.ts`、`tests/recovery/session-recovery.spec.ts`、role-composition 双 Host smoke |
| 终止与释放 | 继续使用 DSH interrupt/drain；业务状态提交与 Agent 异步释放分别验证 | timeout、reassign smoke |

冷恢复重投契约见 [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)。DSH 接收输入不等于业务完成，也不保证尚未处理的 inbox 在 Host 正常退出后保留。重投不改变 Meeting version、receipt、payload 或 deliveryId；暂停/终态、已完成工作及已开始的 MeetingTask 不纳入该重投。外部副作用 exactly-once 不在承诺内。

### Capability Audit

- 已交由 DSH：独立 continuable Session、子 Session 枚举和恢复、persona、ToolRestriction、模型路由、共享父 Preset/Skills、SystemPrompt、Tools、interrupt/drain、Storage Domain、Host Web/UI 组合。
- 保留 Convivium：Meeting/Turn/Participant/Task 状态、跨会议身份和 capability 校验、receipt、业务 outbox、JSONL StorageBackend、领域状态投影。这些承担会议契约，不是 DSH Session 状态副本。
- SessionProjection 面向 Session 派生事实；现有会议前端投影来自 Meeting Storage Domain，不能用 Session log 推导来替代。
- Goal/Schedule/Jobs 不提供当前 MeetingTask、事务 outbox 和发言授权的同一契约；没有为这些名称引入额外系统。
- 目标版 continuable descriptor 不保存 `maxTokens`，冷恢复不会保留该覆盖，因此 Definition 明确拒绝它。独立 per-child Preset 不属于当前公开创建契约；没有借助 `/internal`、实验 agent-teams 或复制上游源码绕过。

## Executed Validation

- `pnpm --dir plugin verify`：PASS。84 个测试文件、1082 个测试；format、lint、Host/Client typecheck、build、环境、插件契约、9 个 Definition 样例及发布包检查全部通过。
- 真实 DSH `web` profile / `spawn` provider：baseline、timeout、reassign、role-composition 分别 PASS；role-composition 使用测试专用 LlmAdapter，验证真实 Agent 创建、descriptor、assembly、工具限制和双 Host 恢复，未发起外部模型路由测试。
- `pnpm --dir plugin smoke:profile --all`：PASS，16 个场景，单次 build，总耗时 156717ms；每个场景均 `restore=PASS`。场景为 baseline、timeout、reassign、task-handraise、completion-end、risk-reopen、decision-risk-closure、cold-rebind、role-composition、archive-continuation、mail-race、cross-meeting、convergence、convergence-stalled、convergence-turn-budget-completion、scribe-minutes。
- 最后两处探针调整后，`pnpm --dir plugin exec vitest run tests/unit/scripts`：7 个文件、143 个测试 PASS；对应 ESLint、Prettier 与 `git diff --check` PASS。生产代码自完整 verify 后未修改。
- 失败轮不计 PASS：旧探针读取首个 text block、依赖旧 `Session.events`、将异步释放视作同步、等待上下文期间保留已失效 Agent，以及按 JSON 字段顺序比较重放结果。分别改为公开消息/Session 接口、明确等待释放、获取当前 live Agent 和结构化结果比较。冷恢复 inbox 丢失则通过正式 repository 重投修复；最终全场景在这些修改后通过。
- build 存在已有 `jsonl.ts` 动态导入与静态导入重叠的非阻断打包提示。

## Not Covered

- 未验证独立 ACP、SDK、TUI/headless 部署；无 WebServer 的核心服务组合回归不等于这些 profile 已验收。
- 未验证真实模型服务对自选 provider/model/reasoningEffort 的凭证、配额和模型质量。
- 未补齐历史 Browser、长期压力、强杀 Host、真实缺失 Session 故障注入或动态角色 admission 验收。
- 本轮不会把工程验证通过描述为全部会议产品能力、所有 DSH 能力或发布就绪。

## Closure

本轮范围内的实现、完整工程检查及 16 场景真实 DSH 回归已完成。代码、协议、设计与验证证据一同维护；实现提交为 `7a6a29f`、`5c7be6e`、`8c3b7ab`；尚未推送或发布。未使用 DSH 内部入口，未修改相邻 DSH 源码仓库。
