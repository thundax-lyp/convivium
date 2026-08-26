# DSH Runtime Vertical Slice Evidence

## Scope

本证据覆盖 `codex/dsh-runtime-integration` 分支在 DSH Runtime 竖切任务中的当前实现、验证结果和未覆盖边界。

记录日期：2026-08-26

代码边界：

- 证据基线 commit：`9837a46`
- package：`@convivium/dsh-plugin@0.0.0`
- Node：`v22.23.2`
- pnpm：`10.7.0`
- DSH package 版本：`0.1.1-rc.2`
- continuable provider package：`@deepseek-ai/dsh-subagent-spawn-in-process@0.1.1-rc.2`
- provider name：`spawn`
- profile：临时 `web` profile，组合 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-subagent-spawn-in-process` 和当前打包后的 `@convivium/dsh-plugin`

本证据不声明 Convivium 已成为完整会议产品。TeamTask、mail、archive、完整 UI、生产持久化部署和 PR 远端 CI 结果仍不在本竖切覆盖范围内。

## Validated Contract

- 插件 Host 侧通过 `createServiceKey<Subagents.Service>("subagents")` 获取 DSH Subagents service，不自定义 DSH-owned event 或私有会话协议。
- `MeetingSessionAdapter` 是会议工具层访问 DSH continuable session 的唯一适配边界。
- `apply()` 在存在 `ctx.tools` 与 `subagents.startContinuable` 能力时注册 Convivium meeting tools；能力缺失时 fail loud，不注册会议工具。
- meeting-owned Session ownership 记录包含 meeting、participant、session、provider、parent 和 initial message 边界。
- Captain 通过 DSH Session parent/caller lookup 绑定会议工具权限；Participant 提交通过 ownership 校验进入会议运行时。
- 本竖切没有注册缺少 DSH Web user authorization proof 的 Meeting HTTP route。

## Executed Validation

### 离线验证（2026-08-26，commit `9837a46`）

| 命令 | 结果 | 证据边界 |
| --- | --- | --- |
| `pnpm format:check` | Pass | Prettier 覆盖 plugin 源码、脚本和测试文件。 |
| `pnpm lint` | Pass | ESLint 覆盖 JavaScript、TypeScript 和 TSX。 |
| `pnpm typecheck` | Pass | Host 与 Client 两个 TypeScript program 均通过。 |
| `pnpm test` | Pass | 27 个测试文件、139 个测试通过；包含 unit、contract、integration、recovery 当前可执行用例。 |
| `pnpm test:integration` | Pass | 2 个 integration 测试文件、5 个测试通过。 |
| `pnpm test:recovery` | Pass | 1 个 recovery 测试文件、3 个测试通过。 |
| `pnpm test:stress` | Pass with `Not Covered` | 当前无 stress 测试文件，入口显式输出 `Not Covered: stress tests`。 |
| `pnpm build` | Pass | 生成 Host、Client bundle 与声明文件；tsdown 的 `define` invalid input warning 不影响退出码或产物。 |
| `pnpm verify:environment` | Pass | Node `v22.23.2` 下声明的 DSH packages 可解析。 |
| `pnpm verify:contract` | Pass | 插件 manifest、bundle patch 与 Client contract 可解析。 |
| `pnpm verify:package` | Pass | package artifact allowlist 与发布入口检查通过。 |
| `pnpm verify` | Pass | 按 format、lint、typecheck、test、build、environment、contract、package verifier 顺序通过。 |
| `pnpm verify:runtime` | Pass | 顺序通过 `pnpm verify` 与 `pnpm smoke:profile`。 |

说明：`pnpm verify:package` 曾在与 build 并行执行时因产物竞争失败；按顺序重新执行 `pnpm verify` 后通过。默认 `verify` 不包含 profile smoke，避免把外部 DSH profile 和模型凭据依赖隐式塞入离线验证入口。

### Profile smoke 验证（2026-08-26，最终验证提交）

| 命令 | 当前状态 | 证据边界 |
| --- | --- | --- |
| `pnpm smoke:profile` | Pass | 脚本使用临时 DSH home、临时 workspace、当前 pack artifact 和临时 `web` profile；验证 dump-config、Convivium/provider 组合、Captain create、A/B/C 顺序 submit、pause/resume、无 Meeting HTTP route、host 进程停止和精确临时目录清理。 |
| `pnpm verify:runtime` | Pass | 顺序组合 `pnpm verify` 与 `pnpm smoke:profile`，用于显式选择外部 runtime smoke。 |

最新 smoke 输出摘要：profile `web`，provider `spawn`，artifact `convivium-dsh-plugin-0.0.0.tgz`；创建 3 个 Participant，提交 `A`、`B`、`C` 三条 transcript，seq 为 `1`、`2`、`3`；pause 返回 `{ status: "paused", changed: true }`，resume 返回 `{ status: "running", changed: true }`，`httpRouteUsed:false`。

## RUNBOOK Validation Matrix

| 类别 | RUNBOOK 必须验证 | 当前证据 |
| --- | --- | --- |
| Provider | `prepareContinuable` | `plugin/tests/integration/dsh/session-adapter.spec.ts` 覆盖 provider adapter 与 fail-closed；`plugin/scripts/smoke-profile.mjs` 在真实 profile 中断言 provider `spawn` 存在并可用于 session 创建。 |
| Composition | `dump-config` | `plugin/scripts/smoke-profile.mjs` 在临时 profile 中执行 dump-config，并断言 Convivium plugin、provider plugin 和 `spawn` provider 同时出现。 |
| Provision | initial prompt | session adapter integration 覆盖 adapter 接收 DSH session id；profile smoke 已通过真实 profile 创建 Manager 与 Participant session。 |
| Create | Captain create | contract/integration 测试覆盖 `convivium_create_meeting` 运行时创建路径；profile smoke 入口通过真实 Captain tool call 创建 1 Manager + 3 Participant meeting-owned Session。 |
| Isolation | Session labels | ownership repository 与 runtime 测试覆盖 meeting/session ownership 隔离；跨 Meeting 真实 profile 隔离仍为 `Not Covered`。 |
| Parent | direct parent/rebind | ownership 中记录 parent session；重启后由相同 Captain live parent rebind 仍为 `Not Covered`。 |
| Sequential | A -> B -> C | runtime 工具链路支持 A、B、C 顺序 submit；profile smoke 入口断言 transcript 顺序包含 `ABC`。 |
| Commit | submit | repository transaction、runtime contract 与 tool tests 覆盖 transcript、event、receipt 与 version 写入；真实 SQLite submit 由 profile smoke 覆盖。 |
| Stale | revoke/late submit | runtime/repository 测试覆盖 stale attempt 拒绝和不写正式 transcript；真实 DSH late submit 仍为 `Not Covered`。 |
| Idempotency | duplicate request | repository/runtime 测试覆盖 receipt idempotency；真实 DSH duplicate request 仍为 `Not Covered`。 |
| Pause | Captain pause | tool/runtime 测试与 profile smoke 入口覆盖 Captain pause；运行中的真实 DSH interrupt 仍为 `Not Covered`。 |
| Resume | Captain resume | tool/runtime 测试与 profile smoke 入口覆盖 Captain resume；从冷恢复后的最新 SQLite 事实继续仍为 `Not Covered`。 |
| Restart | stop/start | profile smoke 脚本覆盖 DSH host stop/start 生命周期和临时资源清理；meeting 状态、ownership 与 transcript 的冷恢复仍为 `Not Covered`。 |
| Cleanup | drain/dispose | `apply()` 建立 lifecycle disposer；profile smoke 脚本在退出时停止 host 进程并删除精确临时目录。meeting-owned Activation drain 不影响其他 Session 仍为 `Not Covered`。 |
| Package | build/package verifier | `pnpm build`、`pnpm verify:package`、`pnpm verify` 已通过。 |
| Web scope | route registry | 当前实现未注册 Meeting HTTP route；会议能力只通过 DSH tools 暴露。 |

## Not Covered

- TeamTask、mail、archive 和完整会议 UI。
- 生产级 Meeting HTTP route 与 DSH Web user authorization proof。
- 真实模型输出质量、主持策略、总结策略和完成判断。
- 跨 Meeting 真实 profile session label 隔离的外部 smoke 证据。
- Captain parent 重启后 rebind 的完整冷恢复证据。
- 真实 DSH late submit、duplicate request、interrupt、drain 和 capability revoke 的端到端证据。
- stress 测试和长期运行资源泄漏证据。
- 远端 GitHub PR checks、ruleset 必过项和发布环境验证。

## Closure

截至最终验证提交，DSH Runtime 竖切已经具备离线验证入口、profile smoke 入口、tool 注册边界、continuable session adapter、runtime transaction 路径和 readiness 证据。`pnpm verify:runtime`、分层 integration/recovery/stress 入口、`git diff --check` 和临时进程/目录清理检查均已执行；剩余缺口只保留在 `Not Covered`。
