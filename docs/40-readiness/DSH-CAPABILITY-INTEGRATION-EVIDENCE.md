# DSH Capability Integration Evidence

当前存储组合与验证见 [SQLite Provider Integration](#sqlite-provider-integration)。下述 Scope 至 Closure 为 `8c3b7ab` 的替换前 DSH 升级历史记录，保留其原始结果与边界。

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


## SQLite Provider Integration

### Scope

2026-09-08，分支 `codex/jsonl-storage-backend-dsh-first`，源码基线 `859ac1e` 加本次三个测试契约同步。Darwin arm64、Node `v22.23.2`、pnpm `10.7.0`、官方 DSH/Storage Domain/SQLite `0.1.2-rc.1`、Cordis `4.0.2`。产品不依赖本地上游源码或修复包。

### Validated Contract

| 验收边界 | 实际落点与结果 |
| --- | --- |
| 单 command 完整持久化与有界增量写入 | `sqlite-meeting-recovery.spec.ts`：一个真实 commit put，DSH JSON 编码不超过 65536 bytes；状态、事件、receipt、pending outbox 重开一致，重放不增版本或事件 |
| commit 失败无半提交 | 同 suite：put 委托前 reject，内存 snapshot 与完整持久 projection 不变；新 Context 同库重开保持旧真相，相同请求随后成功 |
| 领域 checkpoint 发布/清理故障 | 同 suite：pointer 发布前 reject，由旧 pointer+tail 恢复；发布后 obsolete commit delete reject，仍恢复完整新 projection；原 checkpoint/domain recovery 共 20 tests 保留容量、GC 和损坏边界 |
| 损坏与版本检查 | 同 suite：schema 合法但 digest 损坏，重开拒绝 `CORRUPT_DATABASE`；同名 Domain 版本变化拒绝 `version-mismatch` |
| provider 生命周期 | `provider-composition.spec.ts`：缺 provider 门控、到达后读写、await 成功与显式 Domain close 后卸载、撤销后拒绝写入、新 Context 同库重开 |
| caller/version/terminal/idempotency 与业务一致性 | 既有 repository/domain、runtime、continuation、recovery suites 保留原断言；三个原 SQLite 装配 suite 在替换时共 72 tests 通过 |
| Host 组合与冷重启 | 五核心真实 profile 全部通过，包含双 Host 同 SQLite 文件恢复；三个非会议 domain 保持 JSON，全部 Restore 成功，详见 [运行证据](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation) |
| 生产依赖与算法边界 | 不携带物理 provider、不覆盖 bundle 默认介质；package/import graph/module-boundary tests 通过；相对替换前 `146d56e` 的 repository/runtime/domain/protocol/http/tools/client 全部零 diff |

### Executed Validation

- `pnpm --dir plugin format`：通过，无额外改动。
- `pnpm --dir plugin verify`：最终退出 0；75 个测试文件、1042 tests 全部通过（Vitest 10.90s）；format check、lint、Host/Client typecheck、build、environment、plugin contract、9 个 Agent Definition 样本和发布包检查全部通过；缺失/禁止发布路径均为空。
- 首轮完整 verify 的三个失败均为遗漏测试契约：旧 Storage peer、旧物理模块可达性、role smoke VM 未注入 dirname/join。同步后 focused 3 files/10 tests 通过，再重跑上述完整 verify；没有跳过测试或放宽业务断言。
- `pnpm --dir plugin smoke:profile`：五核心场景全部 PASS/restore=PASS，51509ms；复用同一生产代码与 smoke 配置的运行结果，随后未改生产代码或 driver。详细日期、组合、首次启动失败修复与 Restore 见 [SQLite Provider Validation](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation)。
- `git diff --exit-code 146d56e -- plugin/src/repository plugin/src/runtime plugin/src/domain plugin/src/protocol plugin/src/http plugin/src/tools plugin/src/client`：退出 0；删除的是物理日志/checkpoint，领域事务算法逐字未变。旧 backend/dataRoot 的生产搜索无匹配；`git diff --check` 与本地文档链接检查通过。
- 非阻断提示：Node 的 SQLite experimental 提示和现有 Client bundle dependency 提示；构建成功。旧 JSONL 静态/动态 import 重叠提示随物理实现删除消失。

### Not Covered

仅覆盖本次五核心真实 selector；其余 11 个 selector、Browser、新增真实模型调用、真实断电/硬件故障、性能/压力、多进程写入与任意时序在途写入自动排空未覆盖。开发期数据迁移、已有版本升级为 Not Applicable（首次发布），不登记待办、不清理开发者文件。关闭限制以 [正式设计](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#accepted-storage-shutdown-limitation) 为准。

前期官方 rc.1 的真实 SQLite 排队写入探针：显式 `domain.close()` 后 100 次写入全部完成；provider/root dispose 分别有 99/98 次 `closed` 拒绝，已确认写入重开后存在。该结果不证明已确认数据丢失，也不证明单独关闭 AgentSession 会触发相同问题。用户接受这一关闭边界，替换不等待上游发布；本次验收不声称修复了上游自动排空。

### Closure

物理存储替换、必要启动门控、真实 profile 和完整工程验证已完成。长期职责、配置与关闭边界已进入 Architecture、Storage Interface、实现设计和 smoke 操作说明；本次不代表全部会议产品、全部部署组合或发布流程完成，未 push、创建 PR、合并或发布。
