# Current Implementation Coverage

## Read This First

本文件记录当前 checkout 已由源码与验证证明的实现范围。设计文档描述目标，不自动构成实现证据；下列 `Not Covered` 项不得从相邻能力推断为已完成。

## Meeting Runtime Cutover

截至 2026-09-18，Meeting target activity graph 已切换到同一条 V1 数据与命令路径：

- `MeetingState`、target codec、`DomainMeetingRepository`、command application、DSH tools、loopback Remote、caller-filtered view、outbox dispatch 与 archive lifecycle 使用同一 `meetingId` namespace。
- 创建链 provision 七个固定 Meeting identities；Web Research Analyst 已从 Definition、Skill、协议角色枚举和初始阵容完全禁用；其余 Contributor 接收 `meeting_started`；唯一 evidence reviewer coordinator 使用受限 one-shot workers 评审，并通过 `submit_review_batch` 原子提交合法结果。
- review request、review delivery、round publication、partial termination、archive materialization、Session closure 与同 SQLite storage 冷重启读取均已接入 target lifecycle。
- DSH Storage Domain adapter、`DomainRepositoryRegistry`、`DomainMeetingRepository` 与唯一 `MeetingRepositoryPort` 保留；它们是 target 持久化核心，不属于已删除的 legacy facade。
- `projection/status.ts` 与直接依赖的 `projection/contribution.ts` 成对保留，但不从 target projection public entrypoint 导出。

## Removed Legacy Surface

从固定基线 `f170deb` 到当前收口分支，累计删除 37 个 plugin 文件：

| 分类 | 数量 | 说明 |
| --- | ---: | --- |
| Scribe-only skill resource | 1 | 删除 `referenced-minutes/SKILL.md` |
| redundant command repository facade | 1 | 删除旧 command repository facade，保留 Storage Domain repository core |
| legacy application-service | 13 | 删除旧 create/control/turn/contribution/decision/query 等 orchestration |
| legacy runtime service | 6 | 删除旧 contribution/dispatch/session/Markdown application services |
| legacy projection | 1 | 删除 Developer Markdown projection |
| direct legacy tests | 15 | 删除 4 个 archive test、旧 assembly/continuation/contribution/dispatch/Markdown/recovery 直接测试 |

删除数比原 RUNBOOK 预估多 2 个测试：执行中确认 `tests/contract/meeting-runtime.spec.ts` 与 `tests/recovery/contribution-recovery.spec.ts` 仍直接调用已删除的 legacy runtime；保留它们会造成不可执行的悬空测试。对应 target 创建、archive、lifecycle 与 SQLite recovery 证据由 target suites 承担。fixture 零删除。

## Verified Coverage

| 边界 | 当前证据 |
| --- | --- |
| domain and command core | target validator、transition、command contract 与非法输入/权限/CAS/idempotency/atomicity tests |
| repository and recovery | repository contract、failure injection、SQLite reopen 与 target command recovery tests |
| runtime and DSH integration | identity provisioning/notice、review request/delivery、archive dispatcher、lifecycle 与 Host plugin tests |
| tools and transport | 八个 Meeting target tools、loopback Remote、caller resolution、read projection 与 Client tests |
| real business loop | `meeting-business-loop` scenario 覆盖七个启用 roles、初始 notice、两份 Evidence、不同 one-shot workers、worker 无 command authority、review batch/delivery、publish、partial、archive、close 与 cold reopen |

## Explicitly Not Covered

- `close_contribution` 已有 Domain/command core，但没有 Agent tool，也没有 target deadline scanner；两项均为 `Not Covered`。
- Browser 人工交互验收、性能与并发压力、跨 Host、发布流程、旧 snapshot migration/compatibility 不在本轮覆盖范围。
- 自动 research freshness/source-scope 去重、远端文件系统与未列入删除清单的 legacy Domain/protocol/runtime services/tests 尚未清理；它们不得重新进入 target activity graph。
- 默认 smoke 使用真实 DSH Loader、Storage、Session 与 Tool，但不证明生产环境外部网络、长期运行稳定性或跨版本迁移。

## Executed Validation

| 日期 | 范围 | 结果 |
| --- | --- | --- |
| 2026-09-18 | T22 focused unit/integration/contract checks | PASS：7 files、34 tests；`typecheck:host` 与 focused lint 通过。 |
| 2026-09-18 | T25 legacy application removal gate | PASS：lint 0 errors、完整 typecheck、111 files/1240 tests。 |
| 2026-09-18 | T29 legacy dispatch removal gate | PASS：lint 0 errors、完整 typecheck、104 files/1221 tests。 |
| 2026-09-18 | T30 runtime fixes focused checks | PASS：6 files、31 tests，覆盖 runtime caller scope、review delivery、round publication 与 archive dispatcher。 |
| 2026-09-18 | T30 documentation close checks | PASS：434 个 Markdown local links、`git diff --check` 与 RUNBOOK 文件删除检查。 |
| 2026-09-18 | T30 final smoke | 未完成：用户要求停止；停止前的运行已通过结构化 review、delivery、publish 与 archive materialization，但停在 Session teardown，未取得 `archived`/cold-reopen PASS。 |
| 2026-09-20 | Web Research Analyst disablement | PASS：完整 `pnpm verify`，105 files、1224 tests；format、lint（0 errors、19 existing warnings）、typecheck、build、environment、contract、7-role Definition 与 package gates 全部通过。真实 `meeting-business-loop` smoke 未在本次重跑。 |

`pnpm --dir=plugin verify` 曾在后续 runtime 修复前通过；修复后的完整 verify 未重跑。不得把 focused checks 或已停止的 smoke 描述为完整门禁通过。

## Closure Rule

当前可声明 target Meeting runtime 已形成单一活动链并完成 legacy application-side cutover；不得把该结论扩张到上述 `Not Covered` 外设、Browser、性能、迁移或发布。

相关依据：[Domain Design](../30-designs/DOMAIN-DESIGN.md)、[Meeting Design](../30-designs/MEETING-DESIGN.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。
