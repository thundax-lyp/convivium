# Smoke Validation Evidence

最新统一基线的运行结果见 [Current Baseline Validation](#current-baseline-validation)。下述 `bd0159b` 的 14 场景结果保留为历史证据，不是当前完整场景数。

## Scope

2026-09-07，基于 `bd0159b` 加本次工作区调整，重新划分整个 smoke 的覆盖层次。保留已合入的离线协议测试、Client 事实展示及 Browser 重复停止信号修复。环境为 Darwin arm64、Node 22.23.2、pnpm 10.7.0、DSH 0.1.1-rc.2，profile=web、provider=spawn。

## Validated Contract

- 默认运行 5 个核心场景，`--all` 运行 14 个场景，环境变量仍支持单场景诊断；覆盖目的见 [操作入口](../50-operations/HOW-TO-DSH-SMOKE.md)。
- 每次命令只构建、打包一次；场景之间独立 Host、profile、workspace、DSH_HOME、端口。失败停止后续场景，清理通过后才输出 PASS。
- no_consensus 保留现有领域测试；新增 Proposal 重置后再次停滞及 Turn/message 两类预算完成优先级测试，删除对应三个重复 smoke selector。领域测试不宣称真实 DSH 故障注入。
- 实际归档 DTO 复用正式 Schema；中间状态断言在 driver 执行，输出校验保留关键持久化关联与生命周期证据。移除按字段穷举的 smoke 测试矩阵，保留已知错误 envelope、非法归档与关键关联回归。

## Executed Validation

| 命令或检查 | 结果 |
| --- | --- |
| `pnpm --dir plugin smoke:profile --all` | 14/14 PASS，97.262 秒，一次构建；逐场景目录删除、端口释放通过 |
| `pnpm --dir plugin smoke:profile` | 5/5 PASS，36.050 秒，一次构建；最终 Restore 实现通过 |
| 安装失败、Host 启动失败注入 | 两次均退出 1，无 PASS 输出，无新增 smoke 临时根残留；失败路径端口检查通过 |
| `reassign` Browser mode 启动与停止 | preflight、ready JSON/URL、PTY Ctrl-C、退出 0、cleanup marker、精确目录与端口检查通过 |
| `pnpm --dir plugin verify` | format、lint、Host/Client typecheck、76 files / 664 tests、build、environment、contract、Agent Definitions、package 全通过 |
| `--json` 单场景诊断 | stdout 可直接 JSON.parse，完整 archived DTO 与 Restore 结果保留 |

完整套件先验证全部场景，随后将端口检查纳入共用 Restore，再运行默认套件和失败注入。时间来自本机本次运行，包含构建，不是性能保证；相比逐条执行 14 个独立命令，消除了 13 次重复构建/打包。Browser 重复信号的现有子进程回归测试继续通过。

最终移除被删除场景遗留的无用参数和分支后，相关 lint、两个脚本测试文件（55 tests）及真实 Turn 预算完成场景重跑通过。相对 `bd0159b`，插件代码与测试净减少 804 行。

## Not Covered

- 本次 Browser mode 仅验证宿主 ready/preflight 和退出清理，未重新执行人工页面交互；Client 展示由已合入测试覆盖，历史 Browser 证据不外推。
- 没有真实模型调用、跨 Host、生产发布或长期资源压力证明；三种已移除 selector 的历史真实运行仅保留作历史证据。

## Closure

当前执行入口和分层矩阵已同步到操作文档。产品代码、公开协议、权限与存储语义未改变；TODO 无本任务登记项。新实现保留协议错误码修复以及实际归档 Schema 校验。

## Current Baseline Validation

2026-09-07，代码基线 `743edbee564d34402fedc2bb44ebbb006790fe1a`，`codex/align-code`；本次仅 readiness 文档变化。环境：Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、profile `web`、provider `spawn`。

执行 `pnpm --dir plugin smoke:profile --all`，exit 0；当前 `SMOKE_SCENARIOS` 的 16 个场景全部通过，总耗时 140404ms，一次构建。默认 CORE_SCENARIOS 仍为 5 个，已包含在此次全量执行中；本次没有另跑默认命令。

| 场景 | 耗时 ms | 场景及 Restore |
| --- | ---: | --- |
| baseline | 8034 | PASS |
| timeout | 7024 | PASS |
| reassign | 11798 | PASS |
| task-handraise | 9797 | PASS |
| completion-end | 8695 | PASS |
| risk-reopen | 7714 | PASS |
| decision-risk-closure | 9865 | PASS |
| cold-rebind | 9942 | PASS |
| role-composition | 10317 | PASS |
| archive-continuation | 7563 | PASS |
| mail-race | 7932 | PASS |
| cross-meeting | 10185 | PASS |
| convergence | 6395 | PASS |
| convergence-stalled | 6458 | PASS |
| convergence-turn-budget-completion | 6463 | PASS |
| scribe-minutes | 7646 | PASS |

role-composition 输出两个不同 Host PID（98770、98779），九项断言齐全；两阶段角色检查 true，Participant 禁用工具 body 调用数 0，第二阶段配置 `2.0.0`，恢复仍保留 V1 persona。cold-rebind 与该场景均使用真实 Host 重启；不把它们外推为缺失 Session 补建验证。

Prepare/Restore 由现有 wrapper 完成：每场景使用独立临时 profile、workspace、DSH_HOME 和端口；停止 Host、删除该场景精确临时根并验证端口可独占绑定后才打印 `restore=PASS`，命令结束清理共享构建目录。未使用 fake adapter 替代真实 provider，也未重跑本节历史失败注入。

同基线 `pnpm --dir plugin verify` exit 0，82 files / 1039 tests，全部 gates PASS。源码分析另复现完成/调度偏差，详见 [Code Alignment Evidence](./CODE-ALIGNMENT-EVIDENCE.md)；本次 smoke 未覆盖这些反例，不构成缺陷关闭依据。

本次 Not Covered：Browser 页面交互、真实模型请求、Host producer 成功 attendance recommendation→reject、完整中断创建/缺失 Session 恢复、长期压力和生产发布。当前普通模式 HTTP/Session/归档验证不替代这些范围，既有 Browser 记录保持原基线。
