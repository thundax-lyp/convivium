# MeetingTask 方案取证（历史：DSH TeamTask 不可用）

> 本文保留 2026-08-27 对 DSH Agent Teams/TeamTask 的取证结果，作为 MeetingTask 方案的历史依据，不再作为当前实现 blocker。当前实现依据是正式需求、接口和领域设计文档。

## Scope

- 日期：2026-08-27
- 代码边界：`bb4c36e0c355ef3a2efc98eb63bd8d34425c4f59`
- Node：`v22.23.2`
- pnpm：`10.7.0`
- DSH 锁定版本：`0.1.1-rc.2`
- 验证范围：旧闭环 B 的 DSH TeamTask 取证门槛。
- 目标：记录当前可安装依赖不提供 durable TeamTask、稳定 create correlation、Team/task/result 授权读取和 terminal observation 的事实，并说明为何改用 Convivium-owned MeetingTask。

## Validated Contract

### 当前锁定插件依赖

`plugin/package.json` 直接声明的 DSH 包均为 `0.1.1-rc.2`。当前 `plugin/cordis.patch.yml` 和 `plugin/pnpm-lock.yaml` 没有 `@deepseek-ai/dsh-experimental-agent-team` 或 `@deepseek-ai/dsh-experimental-tool-agent-team`。

已安装的 `@deepseek-ai/dsh-subagent@0.1.1-rc.2` 提供 one-shot/continuable child、`followup()`、`reportFrom()`、child listing 和 lifecycle event，但不提供 TeamTask service 或 TeamTask 类型。其 one-shot background path 可以接入 `@deepseek-ai/dsh-jobs`，这不等于 Agent Teams 的 TeamTask。

### 通用 background Job 不能替代 TeamTask

`@deepseek-ai/dsh-jobs@0.1.1-rc.2` 的公开契约是 `ctx.jobs`：

- `JobRegistry.start()` 由 registry 生成 `<kind>-N`，输入没有 caller-provided correlation 或 idempotency key。
- 授权边界是 exact owner Agent 的 Session ID，不包含 Team membership 或 TeamTask revision。
- `JobSnapshot` 只有 job id、kind、label、owner Session、status、detail 和时间字段，不包含 TeamTask DAG、owner member 或 task result provenance。
- 官方实现是 process-local registry；记录不构成可供 Convivium 冷恢复查询的 durable TeamTask board。
- `onJobDone()` 可以向 owner-relative listener 通知 terminal Job，但不能证明或恢复 Convivium 所需的 TeamTask association。

官方背景 Job 契约：[jobs README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/jobs/jobs/README.md)、[jobs subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/jobs.md)。

因此不能把 `ctx.jobs` 静默适配成正式文档要求的 DSH TeamTask。

### 官方 TeamTask 能力当前不可消费

DSH 官方仓库 `master` 中存在 experimental Agent Teams：

- `ctx.agentTeams` 提供 `createTask()`、`getTask()`、`listTasks()`、CAS `updateTask()` 和 `waitForChange()`。
- `TeamTaskSnapshot` 持久化在 Team Lead Session，包含 Team-local `task-<n>`、revision、状态、owner 和 DAG 字段。
- `CreateTeamTaskRequest` 只有 subject、description、blockedBy 和 writeScopes，没有 caller-provided correlation/idempotency key。

官方来源：[Agent Teams subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md)、[service types](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/types.ts)、[service implementation](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/index.ts)。

但当前不能把该能力作为 Convivium 依赖：

- `@deepseek-ai/dsh-experimental-agent-team@0.1.1-rc.2` 的官方 `package.json` 标记 `private: true`。
- `@deepseek-ai/dsh-experimental-tool-agent-team@0.1.1-rc.2` 的官方 `package.json` 标记 `private: true`。
- 两个包均未发布到 npm；`pnpm view` 返回 `E404`。
- 两个包不在 Convivium 当前 manifest、lockfile、安装依赖或 profile 组合中。
- 即使未来可安装，当前 `createTask()` 请求也未提供 RUNBOOK 要求的稳定 create correlation，需要先形成正式的恢复/幂等契约，不能由 Convivium 猜测。

官方包元数据：[Agent Teams package](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/package.json)、[Agent Teams tool package](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/tool-agent-team/package.json)。

## Executed Validation

从 `plugin/` 执行：

| 命令                                                                                   | 结果                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify:environment`                                                              | PASS；15 个 manifest 声明的 DSH 包均已安装                                           |
| `pnpm verify:contract`                                                                 | PASS；当前插件 package/bundle 契约有效                                               |
| `pnpm list --depth 0`                                                                  | PASS；直接 DSH 依赖为 `0.1.1-rc.2`，无 Agent Teams 包                                |
| 跟随 pnpm symlink 搜索 TeamTask、team_task、taskAttempt 和 createTask                  | 当前直接安装包无 TeamTask export                                                     |
| 检查 `@deepseek-ai/dsh-subagent` package、types 和 implementation                      | 只有 subagent/continuation 能力；background settlement 使用 `ctx.jobs`               |
| 检查 lockfile 中 `@deepseek-ai/dsh-jobs@0.1.1-rc.2` 的 types、README 和 implementation | 确认为 owner-Session 隔离的 process-local Job registry，无 TeamTask/correlation 契约 |
| `pnpm view @deepseek-ai/dsh-experimental-agent-team ... --json`                        | FAIL：npm `E404 Not Found`                                                           |
| `pnpm view @deepseek-ai/dsh-experimental-tool-agent-team ... --json`                   | FAIL：npm `E404 Not Found`                                                           |

上述两个 `E404` 是能力不可安装的预期取证结果，不是验证通过。

## Not Covered

- 未把官方仓库源码复制、vendor 或作为 Git runtime dependency；这会绕过当前 package/profile 契约并违反本仓库外部源码边界。
- 未实现 TeamTask adapter、协议、repository migration、HandRaise 或 Runtime 代码。
- 未运行真实 profile TeamTask smoke；当前不存在可安装且已组合的 TeamTask provider。
- 未验证未来 DSH 发行版是否会发布 Agent Teams 或增加 create correlation。
- 未把 `ctx.jobs` 当作 TeamTask fallback，也未建设第二套任务系统。

## Closure

结论：旧 DSH TeamTask 路径为 `UNSUPPORTED_CAPABILITY`；该结论保留为历史取证，不适用于当前 MeetingTask 方案。

旧 `B-01` 取证曾触发停止条件。当前不再执行旧 TeamTask `B-02` 至 `B-07`；MeetingTask 已按正式需求和接口完成实现与验证。

MeetingTask 不依赖可安装的 DSH TeamTask service、外部 association 或跨系统 create correlation；其 canonical state、幂等、恢复和结果投影由 Convivium MeetingState 与既有 DSH Participant continuable Session 边界负责。
