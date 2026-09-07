# Captain Attendance Rejection Evidence

## Scope

- 日期：2026-09-07。
- 分支：`codex/attendance-rejection-runbook`；实现与运行验证覆盖提交 `788cab3` 至 `f5cb663`，本文及正式文档收口在后续独立文档提交中记录。
- 环境：Darwin 25.5.0 arm64、Node v22.23.2、pnpm 10.7.0、DSH 0.1.1-rc.2，独立 web profile、spawn provider。
- 范围：S1 reject-only 协议及工具；S2 Captain 事务、权限、幂等；S3 状态、归档、旧数据及恢复；S4 真实 Loader 拒绝路径和验证收口。FR-13 整项仍为部分实现。

## Validated Contract

Captain 经真实 caller binding 拒绝一个 pending recommendation。单次提交只更新该推荐，写一条 `attendance_recommendation.rejected`、一个 receipt，version/eventSeq 各增加一次，outbox 为 `[]`。没有新增 Participant、Session、CompletionFact、transcript、权限或调度副作用。

active/execution-terminal 只公开 reason/rejectedAt；公开 Schema 共用同一校验。归档只含 recommendationId、candidateId、roleDefinitionId、displayName、agendaItemId、reason、rejectedAt，按原 createdAt、id 排序，省略空集合。旧 pending/package 不写回或补默认值。字段篡改、遗漏、重复、重排均不能作为匹配的归档提交。

原请求在重放和 JSONL reopen 后返回原 receipt 结果与版本；新终态请求拒绝。完整契约见 [Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md#captain-rejection-slice)，稳定设计见 [Domain Model](../30-designs/DOMAIN-MODEL-DESIGN.md) 和 [Meeting Orchestration](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)。

| 验证项 | 实际证据 |
| --- | --- |
| V1 输入/结果边界 | protocol-schema、tool-registration：reject/rejected；缺字段、null、空白、approve、额外 actor、非法 version 拒绝；validated hash 保留原 reason 空白 |
| V2 Captain 权限 | meeting-runtime：本会议 Captain 成功；Manager、Participant、其他 Captain、跨会议或 missing Meeting 拒绝且零副作用 |
| V3 单次原子事实 | attendance-rejection、domain-meeting-repository：只改变目标推荐和 eventSeq；单 event/receipt、version +1、outbox=[] |
| V4 版本/终态 | transition 与 runtime：stale version 拒绝；执行终态及 archived 新请求拒绝 |
| V5 幂等/并发 | runtime：相同请求重放、hash conflict、两个新请求并发仅一个成功 |
| V6 commit 故障 | domain-meeting-repository：commits put 注入失败无半提交，解除故障后成功 |
| V7 兼容/损坏 | projection 与 repository：旧 pending/legacy 读取，非法 rejection、未知版本及对应异常层映射 |
| V8 JSONL reopen | runtime：无重新推荐或 provisioning；成功拒绝后恢复及已归档 receipt 重放保持一致 |
| V9 可见性/归档 | status-projection、两个 archive suites、protocol-schema：三类 Agent 一致、local_host=[]、七字段、排序、深复制及伪造拒绝 |
| V10 工具边界 | tool-registration、offline-meeting-protocol、index-inject：参数转发、canonical JSON rendering、非法输入零调用、注册移除及 disposer 恰好一次 |
| V11 真实 Loader | baseline：真实 Captain 调新工具，缺失 recommendation 返回 INVALID_ARGUMENT/retryable=false，version 不变且推荐为空；随后 Manager plan 正常 |
| V12 完整验证 | 77 files / 734 tests、全部 verify gates、baseline smoke、文档链接及 diff 检查通过 |

## Executed Validation

下列命令从仓库根目录执行，最终均退出 0。分步测试数量反映各提交时的 suite，不与完整验证数量累加。

| 步骤 / 提交 | 命令或检查 | 结果 |
| --- | --- | --- |
| AR-00 / `788cab3` | `pnpm --dir plugin install --frozen-lockfile`；`pnpm --dir plugin verify` | 基线 76 files / 664 tests，全部 gates PASS |
| AR-01 / `8eda5ae` | protocol-schema suite；`pnpm --dir plugin typecheck` | 60 tests、Host/Client PASS |
| AR-02 / `52d6bfc` | attendance-rejection 与 repository projection suites；typecheck | 39 tests、Host/Client PASS |
| AR-03 / `0808247` | meeting-runtime、domain-meeting-repository、tool-registration suites；typecheck | 93 tests、Host/Client PASS |
| AR-04 / `e9495e4` | tool-registration、offline-meeting-protocol suites；typecheck | 15 tests、Host/Client PASS |
| AR-05 / `9d145d2` | 下列五个 focused suites；typecheck、相关 lint | 157 tests、Host/Client、lint PASS |
| AR-06 / `f5cb663` | 两个 smoke script suites；index-inject suite | 48 tests + 8 tests PASS |
| AR-06 / `f5cb663` | `pnpm --dir plugin verify` | 77 files / 734 tests；format、lint、Host/Client types、build、environment、contract、9 Definition samples、package 全部 PASS |
| AR-06 / `f5cb663` | `CONVIVIUM_SMOKE_SCENARIO=baseline pnpm --dir plugin smoke:profile` | `PASS baseline 6210ms restore=PASS`；`PASS 1 scenarios 9888ms (one build)` |
| AR-07 / 本文所属提交 | `pnpm --dir plugin format:check`；docs/TODO/README 相对链接检查；残留引用检查；`git diff --check` | PASS；临时执行文档及本次 TODO 已删除 |

AR-05 的聚焦命令：

```bash
pnpm --dir plugin exec vitest run tests/contract/status-projection.spec.ts tests/unit/runtime/archive.spec.ts tests/unit/domain/transitions/archive.spec.ts tests/contract/meeting-runtime.spec.ts tests/contract/protocol-schema.spec.ts
```

AR-06 的脚本命令：

```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/smoke-profile-contract.spec.ts tests/unit/scripts/smoke-profile.spec.ts
pnpm --dir plugin exec vitest run tests/unit/index-inject.spec.ts
```

`archives and reopens a Captain attendance rejection` 使用真实 Storage Domain/JSONL 和完整 continuable 测试对象。正式 create/Manager plan 形成 pending 后拒绝，再以 cancelled 结束；end receipt 为 cancelled，随后 getStatus 已为 archived。drain 集合恰为该会议 Manager 和一个 Participant。dispose/reopen 后归档不变，新请求返回 ARCHIVED_MEETING，原请求仍重放成功。

初次完整 verify 因宿主 lifecycle 仍按 19 个工具计数而失败。仅将工具数量更新为 20、相应 effects 更新为 22/21，并保持全部 disposer 精确一次断言，重跑完整 verify 后通过。公开 Schema 漏列冲突按用户授权补齐，以已有 Schema 共享校验解决；null 负向用例发现并消除了缺省放行。没有跳过失败门禁或削弱断言。

真实 smoke 使用独立临时 profile，既有 wrapper 完成 Host、进程、端口和临时资源清理并报告 restore=PASS；同时通过既有 ACB transcript、HTTP pause/resume 断言。

## Not Covered

- 没有生产 Catalog producer；真实 Host 的成功推荐→拒绝链路未覆盖，不以 test Catalog 代替生产接入。
- 真实 DSH Host 冷重启及真实模型自主推荐/拒绝未覆盖。JSONL Runtime reopen 与 Host 冷重启是不同证据。
- 未实现 approve、admission、Participant provisioning、自动 expired/cancelled、FR-14 runtime composition。
- 本子闭环的 Browser/HTTP/Client 拒绝控制及展示、research recommendation、stress/长期资源验证未覆盖。既有 baseline HTTP smoke 不等于新增拒绝 UI 已验证。
- 数据迁移不适用；仅承诺新代码读取旧 pending/package，不承诺旧程序读取新 rejected 数据。

## Closure

AR-00 至 AR-06 已各自验证、删除对应 TODO 并独立提交；AR-07 已将稳定结论与实际证据迁入正式文档，通过删除前后检查并移除临时执行文档及最后任务项，收口由本文所属独立文档提交记录。完成结论限于 Captain 拒绝参会推荐的本地闭环及真实 Loader 拒绝路径。未 push、未创建 PR、未合并。
