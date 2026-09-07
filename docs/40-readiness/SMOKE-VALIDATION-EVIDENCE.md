# Smoke Validation Evidence

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
