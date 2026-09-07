# FR14 Shared Preset Role Composition Evidence

## Scope

2026-09-07，FR-14 共享父 Preset 首版：初始 Manager/Participant 显式选择内联 Definition，创建前统一预检，经 DSH continuable request 应用 persona/toolFilter，内部 ownership 保存不可变 provenance。代码范围为 `581763b..6de1a1c`，本次收口未提交 diff 仅包含 README、接口、设计、readiness、TODO 与临时执行文档删除，不含产品源码。

环境：Darwin arm64，Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`，真实 smoke 使用隔离的 web profile、spawn provider 和 minimal Preset。DSH API 基线未升级。

## Validated Contract

| 验证面 | 已验证结果 |
| --- | --- |
| 配置和选择 | 64 项/16 KiB 边界；空值、未知字段、重复值拒绝；Manager/Participant 角色匹配；未选择保持原行为 |
| 共享能力 | parent scope 的 Preset/Skill 只读预检；Skill 必须可模型调用且非空；异步校验前后父 Preset 一致 |
| 原子性 | 所有选择通过后才分配首个身份；末项非法零 child；中途创建失败 revoke/interrupt/drain，无 ready Meeting |
| 持久化 | provisioning/active 三字段绑定一致且不可增删改；failed put 不改变读值；旧记录无回填，重开后仍可读 |
| 重放和终态 | ready/归档后重放不访问新配置或缺失 Skill，不重写 binding；同 request 换 ID 冲突，新请求使用新版本 |
| 公开边界 | status/archive 不投影角色配置；Schema 拒绝顶层私有配置字段；错误消息不泄露定义内容 |
| 真实隔离 | 父 assembly 无 child persona；两 child 的 assembly/descriptor 相互隔离；Participant 禁用工具不可见且执行被拒绝，body 调用增量为 0；Manager/Captain 可执行 |
| 冷恢复 | 两个 Host 中 Captain/child 身份、transcript 前缀及 followup 保持；第二阶段配置 V2，恢复的 descriptor/assembly 仍为 V1 |
| 既有机制 | 无新增领域 event/receipt/outbox，既有创建、归档、恢复、权限路径随全量回归验证；没有新 package root export |

## Executed Validation

以下 focused 命令均从仓库根目录执行；每一项实现完成后删除对应 TODO 并独立提交。

| 步骤 | 提交 | focused 验证（`pnpm --dir plugin exec vitest run` 后的路径） | 结果 |
| --- | --- | --- | --- |
| RC-01 | `78f1ebd` | `tests/unit/role-composition/resolve.spec.ts tests/unit/config.spec.ts` | 11 tests PASS |
| RC-02 | `9416669` | `tests/unit/protocol/role-selection.spec.ts tests/unit/protocol/request-idempotency.spec.ts` | 10 tests PASS |
| RC-03 | `4b71576` | `tests/unit/role-composition/dsh-capabilities.spec.ts tests/unit/dsh/session-adapter.spec.ts` | 35 tests PASS |
| RC-04 | `19565bd` | `tests/unit/repository/domain/schemas.spec.ts tests/contract/domain-meeting-repository.spec.ts` | 51 tests PASS |
| RC-05 | `60b338e` | `tests/unit/runtime/meeting-runtime.spec.ts tests/unit/index-inject.spec.ts` | 18 tests PASS |
| RC-06 | `eb2af0f` | `tests/contract/meeting-runtime.spec.ts tests/integration/dsh/session-adapter.spec.ts` | 47 tests PASS |
| RC-07 | `6de1a1c` | `tests/unit/scripts/role-composition-smoke.spec.ts tests/unit/scripts/smoke-profile.spec.ts` | 37 tests PASS |

RC-01–06 的 `pnpm --dir plugin typecheck` 及变更文件 lint 均 PASS；RC-03 frozen install PASS。RC-06 额外既有 status-projection/protocol-schema 回归 55 tests PASS。RC-07 变更文件 lint PASS。

基线 T0：16:06 CST 开始的 `pnpm --dir plugin verify` 退出 0，76 files / 664 tests；format、lint、双端 typecheck、build、environment、contract、agent-definition samples、package 均通过。

最终 `pnpm --dir plugin verify` 退出 0，测试于 16:35:22 CST 开始，80 files / 703 tests PASS（73.82s）；format、lint、双端 typecheck、build、19 个 DSH 包环境检查、plugin contract、9 个 Definition samples、package 全部 PASS。README 在收口中经 Prettier 格式化，并再次检查格式与 package。

真实 DSH 验证命令：

```sh
CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile
CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
```

角色场景退出 0：phase1 Host PID `88296`、phase2 Host PID `88310`；`PASS role-composition 10017ms restore=PASS`，one build 总耗时 13879ms。真实输出确认两个阶段均完成角色检查，第二阶段配置版本为 `2.0.0`，恢复保留 V1，拒绝工具 body 调用为 0。完整九项断言：

- `phase1-checkpoint-durable`
- `host-pid-changed`
- `exact-parent-rebound`
- `transcript-prefix-preserved`
- `cold-followup-submitted`
- `role-persona-isolated`
- `role-tool-execution-denied`
- `role-parent-unmodified`
- `role-cold-config-v1-preserved`

wrapper finally 停止本次 Host、检查端口释放、删除本次精确 tempRoot 和构建临时目录；`restore=PASS`，随后 `ps` 检查两个 PID 均不存在。原 cold-rebind 回归退出 0：`PASS cold-rebind 10497ms restore=PASS`，one build 总耗时 14270ms。

首次角色 smoke 因本地目录链接安装未解析 probe 的显式依赖而失败；wrapper 清理成功。修复为 pack probe tarball 后经原 DSH plugin add 安装，依赖仍固定 rc.2；新增打包安装回归测试后得到上述成功结果。没有用 fake adapter 替代真实门禁。

## Not Covered

独立 per-child Preset、独占 Skill 集合、模型配置、热切换、FR-13 admission、Browser 配置 UI 和真实模型任务质量均未覆盖。独立 per-child Preset 不纳入 Convivium 后续实施计划，等待 DSH 升级。确定性 smoke 不请求模型生成内容。

Host Preset/Skill 部署变化后的恢复不承诺历史快照。无历史数据迁移、无新领域 event/receipt/outbox；optional provenance 的旧记录兼容已验证。默认 CORE_SCENARIOS 保持不变；本次仅真实运行上述两个场景，不把其他场景的历史 smoke 结果外推至当前提交。

## Closure

RC-01–RC-08 全部完成，逐项从 TODO 删除并独立提交；FR-14 仅以“已实现（共享父 Preset 首版）”更新覆盖。长期结论和证据迁移后，删除临时执行文档。删除前文件链接检查 113 项、删除后 103 项，缺失均为 0（检查包括 TODO、docs 和 plugin README）；临时文档名称引用检查无匹配，预期退出 1；git diff --check PASS。未 push、创建 PR 或合并。

长期契约与实现结构分别保存在 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 和 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)，复跑方式见 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md)。
