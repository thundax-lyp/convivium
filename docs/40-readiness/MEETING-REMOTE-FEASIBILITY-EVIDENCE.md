# Meeting Remote Feasibility Evidence

## Boundary

日期：2026-09-09。Convivium 基线 `e640f43`；当前工作分支 `codex/dsh-frontend-backend-communication`。目标见 [Remote Interface](../20-interfaces/MEETING-REMOTE-INTERFACE.md)、[Remote Design](../30-designs/MEETING-REMOTE-DESIGN.md)。以下是迁移前隔离实验，不能作为 Convivium 已迁移的证据。

依赖仅使用正式 npm：DSH `0.1.2-rc.1`、Cordis `4.0.2`；开发测试 Node `22.23.2`、pnpm `10.7.0`、Vitest `4.1.8`、jsdom `29.1.1`。没有修改 DSH checkout 或 Convivium 产品源码。

## Verified

| 实验 | 执行方式 | 观察结果 |
| --- | --- | --- |
| 正式包最小 smoke | `npm ci --ignore-scripts`、`node smoke.mjs`，独立 fixture | 生成 Host/Client，npm pack 后解包到独立 deployment，删除 build tree 后装载；真实 Client Gateway → 进程内 JSON 测试 carrier → 真实 Host Gateway 返回 `smoke-lit`；mount/dispose 成功 |
| 源码开发测试 | 独立 fixture `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm test` | Host 声明编译、generated Client 类型检查通过；2 文件、8 用例通过。覆盖源码正常/非法调用、gateway/cancelled、服务卸载、jsdom 展示、Client 非法参数拒绝、错误传播、namespace 卸载 |
| 真实业务 DTO 生成 | 正式 generator 对 Convivium protocol/types.ts 的只读副本执行 `check.mjs` | 九个 unary 与一个 refresh stream 全部生成；Host 71,290 字符、Client 71,230 字符。pause codec 对额外 authority 字段 parse 后仍保留，供现有严格边界拒绝 |

实验脚本和 lockfile 保留在作者本机的隔离实验目录（非仓库依赖）： `npm-remote-smoke/`、`remote-dev-tests/`、`remote-dto-check/`。前两者 README 给出独立复现命令；最后一个 README 说明固定基线输入。这些目录不是 CI 入口，执行迁移必须把所需回归检查放入仓库测试，不能依赖这些本机目录。

## Corrections Established By Experiments

- generator 确实要求临时 packages 布局和 protocol 的项目登记；只设 runtime 部署目录不足以运行该 generator。但这是生成阶段输入组织，不要求产品源码迁入 DSH 或将 DSH checkout 作为依赖。
- protocol 声明必须来自正式安装包，并成为 aggregate reference；单纯 node_modules resolution 不足以被该版本 decorator 分析识别。
- 普通生成对象 codec 会丢未知字段；递归 JSON index signature 可保留字段。`Record<string, unknown>` 不能生成，不能用它代替已验证的 JSON 类型。
- 默认 Vitest 不能直接执行该 decorator 源码；正式 generator/tsdown 的 transform 以 pre 接入后，源码测试通过，不需要把开发测试改为只测构建产物。
- DSH `$stream` 提供取消、物理代次及 carrier 重连监督；现有 Repository 有提交后 observer。插件自有 invalidation stream 方案据此可实现，尚未运行迁移后的 feed 或浏览器重连用例。

## Not Covered

- Convivium 九接口迁移代码与旧路由删除尚未执行。当前 HTTP 基线的全部产品测试及两个真实 profile 已在本轮作者环境核验执行，结果见下节；它们不是迁移后验证。
- 最小 smoke 的 carrier 是进程内 JSON 测试替身；VM module-factory loader 不是真实 Browser 或完整 DSH Loader。没有以此证明 HTTP/WebSocket、认证或完整 profile 可用。
- DTO 实验的方法体为 fixture，占位返回不证明业务运行；额外字段实验验证保留能力，不等于九方法严格输入校验已经实现。
- stream 生命周期、网络断线重连、focus/reopen 和写入通知竞争目前属于目标设计，不能写成 PASS。

## Implementation Evidence To Record

执行迁移后逐项追加实际 commit/worktree、Node/pnpm、固定命令、退出码、测试统计、两个 profile scenario 的产物断言与清理结果。来源入口见 [Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md)。真实 Browser/WS 若未执行，继续保留 Not Covered，不随 RUNBOOK 删除而丢失。

## Author Environment And Baseline

2026-09-09 在 `codex/dsh-frontend-backend-communication`、产品代码仍为 `e640f43` 的当前工作树执行。Node v22.23.2、pnpm 10.7.0。本节取代把环境确认留给 RUNBOOK 执行者的旧 T0；用户凭据只由现有 smoke 脚本读取，未修改或输出。所有产品源码与 package/lock 均未修改。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| pnpm --dir plugin install --frozen-lockfile | 0 | lockfile 无变化，现有依赖可用 |
| pnpm --dir plugin verify | 0 | format/lint/typecheck/tests/build/environment/contract/definition/package 全通过；77 files、1101 tests，Vitest 8.90s |
| CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile | 0 | PASS baseline 27086ms restore=PASS；1 scenario，31240ms（含构建） |
| CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile | 0 | PASS scribe-minutes 8845ms restore=PASS；1 scenario，12967ms（含构建） |

此时真实 profile 验证的是迁移前 HTTP baseline：证明当前正式 DSH CLI、临时 profile、Storage/Agent 组合、凭据装配、端口与清理可运行；**不证明目标 Remote/WS 已实现**。迁移后的门禁仍须在代码修改后执行。环境没有留作实施步骤。

现有日志保存在本机 `remote-author-baseline/`（与上文隔离实验同一父目录），包含 verify.log、baseline.log、scribe-minutes.log；非CI输入。本轮依赖核对确认：旧自有HTTP层只有Node内建transport，没有其专属npm客户端依赖；保留webServer的loopback职责、Schema与UI装配，撤销草案中未被直接使用的typert-loader新增项。清理范围在RUNBOOK D5明确列出，不以全局dependency prune替代。

本轮 RUNBOOK 细化后检查：16 个步骤的顺序/固定结构/既有与新增路径分类通过；532 个本地文档链接、0错误（不检查 anchors）；git diff --check 通过。git diff --exit-code -- plugin 返回0，确认本轮没有产品源码、manifest或lockfile改动。

## Author Review Fixes

2026-09-09 修复 RUNBOOK 的四个实施断点：M07 显式加载生成类型；M03/M05 规定并验证 Service 私有取消生命周期；D3/M11 对每个物理 generation 首帧前的读取建立失效边界及 R10 反例；M08/M11 使用正式 RemoteStream 实例并把 fixture 纳入类型检查。直接同步 Remote Interface/Design，没有执行产品迁移。

新增 M13a 为实施期真实 WebSocket 门禁：复用 baseline 的 pause/resume，覆盖真实订阅、提交通知、断线期间写入、重开首帧及完整补读、socket 清理。测试 ws 固定 8.18.3，作者已用 npm view 核实该版本存在；它只是未来测试直接依赖，本轮未修改 manifest/lock。这个 gate 尚未运行；真实浏览器内自动重连端到端仍单列 Not Covered，不能把分层测试拼成端到端 PASS。

修订后文档检查：532 个本地文档链接、0 错误（不检查 anchors）；git diff --check 通过；git diff --exit-code -- plugin 返回 0。四个缺陷及新增门禁都已对应固定步骤、测试 oracle 和 STOP；审计结论为 Executable，仅表示 RUNBOOK 可进入实施。
