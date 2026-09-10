# Current Implementation Coverage

## Meeting Remote Migration Boundary

2026-09-09：九个操作已迁移到正式 DSH Remote，插件自有 refresh stream 和完整 refetch 已替换五秒轮询，旧自有 HTTP 路由已删除。合入 main 后 `539d632` 的 verify（81 文件、1128 用例）与 baseline、scribe-minutes 真实 profile 均通过，restore=PASS；命令、marker 和边界见 [Remote Migration Evidence](./SMOKE-VALIDATION-EVIDENCE.md#meeting-remote-migration)。真实 WebSocket 断开/重开及补读已覆盖；真实浏览器内自动重连端到端仍为 Not Covered。下方历史 HTTP 证据仅代表其当时基线。

## Scope

- 更新日期：2026-09-09。本次执行迁移后完整 verify 和两个真实 Remote profile，具体边界见上节。
- 本文维护当前需求覆盖、自动化证据索引和剩余缺口。真实 Host、Browser、失败轮及 Restore 结果统一由 [Smoke Validation Evidence](./SMOKE-VALIDATION-EVIDENCE.md) 保存。
- 产品验证有多个源码基线，见 [Executed Validation](#executed-validation)；不得将某次历史结果套用到当前所有能力。最近角色部署证据为 `b3f02c2`，SQLite 替换工程证据为 `61f7de2`；两者保留各自范围。
- `已实现` 表示正式运行路径及相称证据存在，不表示所有运行组合已验证；`部分实现` 表示仍有必需路径缺失。设计不是实现完成证明。

## Validated Contract

验证依据为 [Meeting Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)、相关 `20-interfaces/` 契约与 `30-designs/` 设计。下表是需求状态的唯一汇总；专项章节只维护测试落点，剩余范围集中见 [Not Covered](#not-covered)。

## Requirement Coverage

| Requirement | 当前状态 | 证据入口 |
| --- | --- | --- |
| FR-1 DSH 插件形态 | 已实现（锁定 DSH 0.1.2-rc.1） | [工程验证基线](#executed-validation)、[SQLite Host 组合](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation) |
| FR-2 会议与身份隔离 | 已实现 | [角色组合](#shared-preset-role-composition)、[身份隔离运行证据](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation) |
| FR-3 有序连续发言 | 已实现 | [顺序、timeout 与 reassign 运行证据](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation) |
| FR-4 发言计划与选择 | 已实现（当前选择规则） | [业务能力验证](#业务能力验证) |
| FR-5 异步任务与举手 | 已实现 | [task-handraise 运行证据](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)、工程基线中的 contract tests |
| FR-6 议题范围与发散控制 | 已实现（当前领域契约） | [业务能力验证](#业务能力验证)、[收敛运行证据](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation) |
| FR-7 提案、立场与决策 | 已实现（当前结构化契约） | [Captain/local 决策与风险](#captain-local-decision-risk-control) |
| FR-8 完成事实与会议结束 | 已实现（当前完成契约） | [业务能力验证](#业务能力验证)、[Turn budget 运行证据](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation) |
| FR-9 暂停、恢复与故障隔离 | 实现已补齐，故障验收未完 | [恢复回归](#业务能力验证)、[归档读取](#archived-read-recovery-follow-up) |
| FR-10 记录、隐私与归档 | 已实现（message-reference 纪要首版） | [引用式纪要](#referenced-minutes) |
| FR-11 可观察性与用户控制 | 展示/基础诊断已实现，验收未完 | [Client 事实](#client-fact-visibility)、[诊断回归](#业务能力验证) |
| FR-12 Agent 内部能力边界 | 已实现 | [离线协议](#offline-meeting-protocol-preparation)、[角色组合](#shared-preset-role-composition) |
| FR-13 Agent 角色目录与参会推荐 | 部分实现 | [Captain rejection](#captain-attendance-rejection) |
| FR-14 共享 Preset 下的 Agent Definition | 角色模型/部署已实现，验收含抓取豁免 | [角色组合](#shared-preset-role-composition) |
| FR-15 Developer Markdown Projection | 已实现（本地辅助输出） | developer-markdown 专项 unit/contract tests，随工程基线 verify 通过 |

## Automated Evidence

以下源码路径相对 `plugin/`。这些是既有自动化证据，不是 2026-09-09 重跑结果；各次完整验证的 commit、环境及结果见 Executed Validation。测试中的 fake DSH、DOM 或 SQLite reopen 只证明对应测试边界。

### SQLite Provider Integration

Convivium 仅消费 Storage Domain，物理介质由 Host/profile 的官方 SQLite provider 管理。替换删除了 10 个物理存储生产文件、12 个专属测试/夹具和 `dataRoot`，保留领域 command/receipt/outbox/checkpoint 算法。测试契约与完整验证基线为 `859ac1e` 加同步改动，收口提交 `61f7de2`。

| 验收边界 | 实际落点与结果 |
| --- | --- |
| 单 command 完整持久化与有界增量写入 | `sqlite-meeting-recovery.spec.ts`：一个真实 commit put，DSH JSON 编码不超过 65536 bytes；状态、事件、receipt、pending outbox 重开一致，重放不增版本或事件 |
| commit 失败无半提交 | 同 suite：put 委托前 reject，内存 snapshot 与完整持久 projection 不变；新 Context 同库重开保持旧真相，相同请求随后成功 |
| 领域 checkpoint 发布/清理故障 | 同 suite：pointer 发布前 reject，由旧 pointer+tail 恢复；发布后 obsolete commit delete reject，仍恢复完整新 projection；原 checkpoint/domain recovery 共 20 tests 保留容量、GC 和损坏边界 |
| 损坏与版本检查 | 同 suite：schema 合法但 digest 损坏，重开拒绝 `CORRUPT_DATABASE`；同名 Domain 版本变化拒绝 `version-mismatch` |
| provider 生命周期 | `provider-composition.spec.ts`：缺 provider 门控、到达后读写、await 成功与显式 Domain close 后卸载、撤销后拒绝写入、新 Context 同库重开 |
| caller/version/terminal/idempotency 与业务一致性 | 既有 repository/domain、runtime、continuation、recovery suites 保留原断言；三个原 SQLite 装配 suite 在替换时共 72 tests 通过 |
| 生产依赖与算法边界 | 不携带物理 provider、不覆盖 bundle 默认介质；package/import graph/module-boundary tests 通过；相对替换前 `146d56e` 的 repository/runtime/domain/protocol/http/tools/client 全部零 diff |

相对 `146d56e` 执行 `git diff --exit-code 146d56e -- plugin/src/repository plugin/src/runtime plugin/src/domain plugin/src/protocol plugin/src/http plugin/src/tools plugin/src/client` 退出 0；旧 backend/dataRoot 生产搜索无匹配。启动 provider 竞态修复、五核心 Host 组合和恢复结果见 [SQLite Provider Validation](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-provider-validation)，关闭探针见 [Shutdown Boundary](./SMOKE-VALIDATION-EVIDENCE.md#sqlite-shutdown-acceptance-boundary)。

### 业务能力验证

下表保留完成/调度、恢复、面板与诊断补齐时的定向断言及测试数量；不把历史定向数量当作当前 suite 数量。

| 能力 | 实现与自动化证据 | 验证边界 |
| --- | --- | --- |
| 完成判断 | `src/domain/completion.ts` 与 `proposal-state.ts` 检查每个 Proposal 当前 revision 的 blocking object/needs_revision；`tests/unit/domain/completion.spec.ts` 覆盖 judge/completed end、非阻塞意见和旧 revision | 未新增真实 DSH blocking Position 反例 |
| 发言规划 | `src/domain/planning.ts` 汇集同议题所有独立 Proposal 的 blocking owners，并为上一 Turn 缺席者加 20 分；`tests/unit/domain/planning.spec.ts` 覆盖独立 revision、其他议题和历史发言者 | 真实模型规划质量未验证 |
| 收敛指纹 | `src/domain/transitions/turn-advancement.ts` 按 Proposal ID、Position ID 排序；`tests/unit/domain/transitions/turn-advancement.spec.ts` 验证重排不改变 fingerprint | 不声称生产写入曾实际发生重排 |
| Session 恢复 | `src/runtime/services/meeting-session-recovery.ts` 接入 rehydration/Captain 生产路径；`tests/recovery/session-recovery.spec.ts` 10 项覆盖未完成 planning 原标识重投、暂停排除、中断创建、缺失角色、并发恢复、跨身份拒绝、失败重试、checkpoint 替换链、Definition 丢失、终态清理和失败脱敏 | 缺失真实 Session/创建中断的 Host 故障注入仍未执行 |
| 面板事实 | `tests/client/meeting-panel.client.spec.ts` 65 项覆盖 Proposal/Position、HandRaise、stall/replan、selection reason 与完整事实刷新等面板行为 | 新区域只有 jsdom 证据，未执行实际 Browser 观察 |
| 结构化诊断 | `src/repository/diagnostics.ts` 接 DSH logger；`tests/unit/repository/diagnostics.spec.ts` 5 项及 runtime/恢复/归档回归覆盖冷打开 gauges、日志失败隔离、拒绝提交、派发关联和清理失败 | 外部采集、完整失败路径和长期容量未验收 |

### Archived Read Recovery Follow-up

`meeting-runtime.spec.ts` 的历史 JSONL 归档回归在 Runtime 重建后读取列表和详情，并断言没有查询 live Captain 或调用 Session runtime。修改前复现 `RECOVERY_CAPTAIN_UNAVAILABLE`；修改后 runtime/session-recovery/diagnostics 三文件 79 tests、Host/Client typecheck、相关 eslint 和格式检查通过。完整验证见 `5491b5d` 工作区记录；此修复未新增真实 Host 故障注入。

### Captain Attendance Rejection

测试路径相对 `plugin/tests/`；正式契约见 [Captain rejection slice](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md#captain-rejection-slice)。optional Host consumer、attempt snapshot、安全 Manager pending 和 Captain reject 已有覆盖。

| 验证范围 | 测试落点与实际覆盖 |
| --- | --- |
| 输入与工具边界 | `contract/protocol-schema.spec.ts`、`contract/tool-registration.spec.ts`：reject-only 输入、非法字段拒绝、reason 原始空白参与 hash、参数转发与 canonical JSON；offline protocol 与 index-inject suites 覆盖注册和 disposer |
| 权限、事务与幂等 | `unit/domain/transitions/attendance-rejection.spec.ts`、repository 与 `contract/meeting-runtime.spec.ts`：Captain 身份隔离、单 event/receipt、version/eventSeq +1、outbox 为空；stale/终态拒绝、重放/hash conflict、并发仅一次成功、commit 失败无半提交 |
| 投影与归档 | projection、status-projection、domain/runtime archive suites：旧 pending/package 读取、损坏数据拒绝、三类 Agent 一致可见性、七字段归档、排序/深复制及伪造拒绝 |
| SQLite reopen | `contract/meeting-runtime.spec.ts` 的 `archives and reopens a Captain attendance rejection`：测试 Catalog 经正式 create/Manager plan 生成 pending 后成功拒绝，cancelled 后归档；Manager/Participant drain，dispose/reopen 后归档不变、新请求拒绝、原 receipt 重放成功 |

真实 Loader 的验证范围见 [Attendance Rejection Loader](./SMOKE-VALIDATION-EVIDENCE.md#captain-attendance-rejection-loader)。

### Captain Local Decision Risk Control

测试路径相对 `plugin/tests/`，覆盖 Decision accept/supersede/revoke 与单 Issue risk accept/reject 五动作。

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| 权限、领域与审计 | decision-acceptance、decision-disposition、completion suites：Captain capability 与后端绑定 local authority、非法对象/证据/终态拒绝、替换双事实、撤销历史、risk 重开；满足完成判断时同事务 converging，版本只增一次，不自动 end/archive |
| 原子性与重放 | `contract/meeting-runtime.spec.ts`、`contract/domain-meeting-repository.spec.ts`、`recovery/domain-recovery.spec.ts`：逐动作 commit 失败无半提交、重试一次、混入外部证据整体拒绝、来源 receipt 隔离及终态重放 |
| Remote、持久恢复与归档 | remote-boundary、protocol-schema、runtime 与 archive suites：Remote 执行五动作，读取经正式 Schema 校验；fake Domain 上重建 Runtime 保持 projection/receipt，Repository 冷重开保留两 Decision history、六条 local facts，拒绝伪造来源和证据；不证明真实 Host 冷重启 |
| Client 与 Browser 夹具 | Client suites 覆盖五动作表单、写锁、证据预选、版本冲突、完整刷新、迟到响应及终态禁写；两候选与 blocking risk 的暂停/ready 边界由真实 Browser smoke 场景检查，不保留夹具自测。DOM 测试不替代实际页面验收 |

历史页面验证见 [Local Decision Risk Browser](./SMOKE-VALIDATION-EVIDENCE.md#captain-local-decision-risk-browser)；该页面证据不由本次文档整理更新。

### Client Fact Visibility

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| 正式事实展示 | `src/client/meeting-panel-view.tsx`、`meeting-panel-sections.tsx` 及 Client suites：12 种 status 的非空 DTO 经 Remote/Schema/DOM 消费；Decision accepted/history、四类 Parking Lot 处置、risk/archive issues、公开 intent/reason/objective 与无 Turn 时旧值清除 |
| 完整刷新与错误恢复 | Client suites 的 `refreshFactStatus`：stream/focus 完整刷新 对不同版本集合逐条替换、删除及卸载重开；分别缺少 decisionHistory、parkingLot、archive.package.issues 时保留缓存、禁写，合法刷新后恢复并清除 alert，输入 JSON 不变 |
| 展示边界 | 文本 HTML 不创建 img、终态禁写；原事实展示增量不新增后端权限或命令。后来增加的 Decision/risk 五动作见上方独立验证索引，不沿用旧“区域无写控件”作为当前总体结论 |
| UI controls | Button/Input 与 End outcome 单选组的真实包、键盘、缓存禁写、重复提交、Browser/Restore；见 [UI primitives migration](./SMOKE-VALIDATION-EVIDENCE.md#ui-primitives-migration) |
| Browser 清理 | 脚本信号处理自测已按 Test Rules 移除；停止、端口释放和临时目录清理由实际 Browser smoke 的 Restore 验证，不据历史自测宣称当前无泄漏 |

历史页面验证见 [Client Fact Visibility Browser](./SMOKE-VALIDATION-EVIDENCE.md#client-fact-visibility-browser)。本次控件迁移另有上表 UI controls 的真实页面证据；其他新增区域保持原验证边界。

### Shared Preset Role Composition

当前角色模型见 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 与 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)。最新授权部署验证为 `b3f02c2`：结果与失败修复过程唯一记录在 [Meeting Roles Deployment](./SMOKE-VALIDATION-EVIDENCE.md#meeting-roles-deployment)。**web_fetch 按用户授权跳过，抓取可用性未验证**；旧模型预检不能代替新模型部署验收。

以下为既有自动化测试索引，路径相对 `plugin/tests/`：

| 验证范围 | 自动化证据 |
| --- | --- |
| 发布资源 | `contract/meeting-roles-deployment.spec.ts`：九角色发布 JSON 经生产 parser 接受；使用内联固定 control patch，真实 DSH patch 合并/插值在独立 profile 与资源根下保留 Definition、Preset 和运行控制，缺资源根拒绝；不依赖或验证 smoke helper。`verify:agent-definitions` 继续直接校验资源集合与 Skill 正文 |
| 配置与共享能力 | `unit/role-composition/resolve.spec.ts`、`unit/config.spec.ts`、role-selection/request-idempotency、dsh-capabilities suites：数量/大小/未知字段/重复值和角色匹配、共享 Preset/Skill 只读预检、异步前后父 Preset 一致 |
| 创建与持久化 | session-adapter、meeting-runtime、domain schemas/repository suites：全部预检后才分配身份、末项非法零 child、中途失败 revoke/interrupt/drain；provisioning/active binding 不可变，failed put 不改读值，旧记录不回填 |
| 重放与公开边界 | runtime、status-projection、protocol-schema suites：ready/归档 receipt 重放不读取新配置，同 request 换 ID 冲突；status/archive 不泄露角色配置，错误信息脱敏 |

### Offline Meeting Protocol Preparation

`tests/fixtures/offline-meeting-protocol.ts` 与 `tests/contract/offline-meeting-protocol.spec.ts` 使用固定时间和深拷贝，经生产 create/planning/context/submit 及 Schema 形成 Manager plan、A 提交和含 A 消息的 B context/input。B 输入仅构造校验，未执行 B 提交。

覆盖版本推进、上下文传递、独立 attempt/delivery、非法字段与纯文本拒绝、stale planning/未分配 Speaker 拒绝、可重复与深拷贝；另检查 replyTo 的 Schema 合法性与引用匹配、工具名称/参数及 provisioning envelope。历史独立类型检查见 Executed Validation。

此 fixture 不执行 Session/caller/capability、持久化、副作用、恢复、UI 或真实模型；不能据它宣称真实模型协议闭环通过。尚存的 provisioning 提示观察见 Not Covered。

### Referenced Minutes

message-reference draft 正式语义见 [Referenced minutes draft](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft)；测试路径相对 `plugin/tests/`。

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| Schema、上下文与引用 | protocol-schema、speaker-attempt/speaker-submission suites：连续 coverage、有序引用子集；非法结构、scope 洞、未来/self/跨会议/私聊引用、混合合法非法引用整体拒绝；仅允许 delivered context 内正式消息 |
| 权限与原子提交 | tool-registration、meeting-runtime、domain-meeting-repository suites：caller/attempt/version/终态拒绝，message/event/receipt/outbox/version 无部分提交；冻结 tool arguments 在校验前复制，回归锁定嵌套 transform 不写回冻结输入 |
| 幂等与持久恢复 | runtime/repository suites：原 receipt 重放、hash conflict、撤权拒绝、commit 失败后重试、tail/checkpoint reopen、旧消息 metadata absent 兼容；非法结构拒绝读取 |
| 跨层可见性与归档 | status-projection、Client、domain/runtime archive suites：同一 committed message 经 status/context/Remote/Client/archive 保留 metadata，刷新一致、无私有字段；按公开 own-property presence/值/数组顺序校验，归档篡改拒绝 |
| 非权威草稿与会议结束 | submission、archive、Client、continuation suites：草稿文字不创建 Decision/CompletionFact 或改变 objective/finalSummary，独立展示；Scribe 缺席/失败/替换不阻塞原 end/archive；续会不自动继承草稿或旧身份 |
| FR-10 既有隐私与生命周期 | repository shared behavior、status、runtime/archive、continuation suites：私聊独立状态与持久处理上界、公开投影白名单、正式事实/终止快照、revoke→drain→close 后归档、失败重试、显式选材续会与身份隔离 |

运行与页面证据分别见 [scribe-minutes 历史运行](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation) 和 [Referenced Minutes Browser](./SMOKE-VALIDATION-EVIDENCE.md#referenced-minutes-browser)。

## Executed Validation

表内只记录各基线实际执行的工程检查。除单独标注外，环境为 Darwin arm64、Node v22.23.2、pnpm 10.7.0；DSH 0.1.2-rc.1 对应 Cordis 4.0.2。完整 verify 包含 format、lint、Host/Client typecheck、tests、build、environment、contract、Definition samples 和 package 检查；真实运行的命令、数量、耗时与 Restore 只在 Smoke Validation Evidence 维护。

| 日期 / 源码边界 | 工程检查与实际结果 | 适用边界 |
| --- | --- | --- |
| 2026-09-10 / `eba973f` 加 runtime 测试修复 | `pnpm --dir plugin exec vitest run --project host tests/unit/runtime`：8 files / 53 tests PASS；修改的 `archive.spec.ts`、`developer-markdown-service.spec.ts` 定向 ESLint、Prettier PASS。隔离副本分别移除归档撤权、关闭、warning 异常隔离，以及允许 pending 低版本覆盖、禁止 pending 升级，运行这两个文件均由对应场景失败；副本已清理 | 独立验证归档双门禁、日志失败不影响 dispose、pending 最高版本；合并一次归档字段与副本验证，保留原断言。生产代码未变；Not Covered：完整 verify、真实 DSH profile、原子替换失败时旧文件完整性 |
| 2026-09-10 / `7e99229` 后脚本自测清理工作区 | `pnpm --dir plugin exec vitest run --project host --project contract`：62 files / 723 tests PASS，另两套件因缺生成的 typert 未加载；`pnpm --dir plugin typecheck:remote-test` PASS 后，定向重跑 `contract/meeting-runtime.spec.ts`、`contract/remote-boundary.spec.ts`：2 files / 92 tests PASS。合计 64 files / 815 tests；lint、改动测试 Prettier、verify:agent-definitions（9 roles）、文档文件链接（556 项）及 diff 检查 PASS | 删除验证设施自测与孤立 fixture，保留发布资源组合和直接 Schema 保护，净减少 194 cases；纪要保护由既有 contract 承接。Not Covered：完整 verify、真实 Host/Browser、重复停止信号的独立设施回归；实际 smoke 与 Restore 要求保留 |
| 2026-09-08 / `b3f02c2a75621f3f05f724c61dacdf45fe4264d6` | 最新角色模型的完整 verify 结果见 [Final Authorized Validation](./SMOKE-VALIDATION-EVIDENCE.md#final-authorized-validation) 的四命令顺序记录 | 首发角色部署授权范围；保留 web_fetch 豁免，不外推模型质量 |
| 2026-09-08 / `859ac1e` 加测试同步，收口 `61f7de2` | `pnpm --dir plugin verify` exit 0，75 files / 1042 tests，Vitest 10.90s；`pnpm --dir plugin format` 无额外改动 | SQLite 替换；首次失败为旧 peer/模块可达性/VM dirname、join 三处测试契约，修正后 focused 3 files / 10 tests 及完整 verify 通过，未放宽业务断言 |
| 2026-09-08 / `8c3b7ab0359828f4b2e33554300c134f95bacecd` | 完整 verify PASS，84 files / 1082 tests；探针修改后 `pnpm --dir plugin exec vitest run tests/unit/scripts` 为 7 files / 143 tests，相关 ESLint、Prettier、diff 检查 PASS | SQLite 替换前的 DSH 升级；对照 tag `dsh-v0.1.2-rc.1`（`a66e4702047846cdaa10c66c9d3df3951f5ea70d`）与安装包公开类型；当时 JSONL import 非阻断提示已随后续替换消失 |
| 2026-09-08 / `5491b5d` 加归档读取修复 | 完整 verify exit 0，84 files / 1063 tests | 归档读取历史补丁；未新增真实 Host 冷重启或 Browser |
| 2026-09-08 / `6679403fc8cb6de01db1c7d2fb190d3a9484dd73` 工作区 | frozen install 后完整 verify exit 0，84 files / 1063 tests，Vitest 69.29s；首次缺依赖的 typecheck 失败已恢复，manifest/lockfile 无变更 | DSH 0.1.1-rc.2、Node v24.19.0；测试命名 AST 检查 840 个标题，focused 恢复/diagnostics 13 项、runtime/归档 84 项、diagnostics 5 项通过；历史源码边界，不等于当前验收 |
| 2026-09-08 / `299d3996c5938e5e8398cf592faad195835b964b` | 18 个 DSH 包 manifest 均为 0.1.2-rc.1；`verify:agent-definitions` 9 samples PASS；role-composition/config/agent-definition-samples 定向 Vitest 4 files / 35 tests PASS | 旧角色模型作者核验；未执行完整 verify 或真实 Host 部署，不作为首发模型完成结论 |
| 2026-09-07 / `743edbee564d34402fedc2bb44ebbb006790fe1a` | 完整 verify exit 0，82 files / 1039 tests；Node 反例复现完成阻塞、多 Proposal 裁决、Position 排序、上一 Turn 缺席评分四项偏差 | 修复前审计基线；修复由业务能力验证中的回归锁定 |
| 2026-09-07 / 测试 `908c78178ea4cf95eb2525795a0c49ea83fff89f`，完整验证 `a8d2f12cc62d6e7ba5b0126912a5a5dfb5bfc5a5` | offline protocol 8 tests、两文件 strict tsc 与完整 verify 通过；Vitest 3.2.7 | 纯离线 fixture，非模型运行证据 |

历史 offline strict tsc 命令：

```sh
pnpm --dir plugin exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --verbatimModuleSyntax tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts
```

SQLite 构建仅有 Node SQLite experimental 与既有 Client bundle dependency 非阻断提示；没有把失败轮计为 PASS。历史分支、逐步修复和当时 push/PR 状态由 Git 追溯，不作为当前发布状态。

### DSH Upgrade Baseline Validation

`8c3b7ab` 的工程结果见上表，真实运行见 [DSH 升级历史基线](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)。该轮 role-composition、host-plugin-lifecycle、session-adapter、repository/session-recovery 测试分别验证原生角色配置、Tools/Web disposer、公开 sendMessage 与原 delivery 重投；当前职责由 Architecture 和 Storage Interface 定义，不重复保留历史能力所有权清单。

### Documentation Ownership Validation

2026-09-09，`95bafe63fbd7021376b269b0deade1f29ff8ca2c` 的入口/设计整理及其后 readiness 工作区；Darwin arm64、Python 3.12.4、Git 2.50.1。依据 [Document Rules](../00-governance/DOCUMENT-RULES.md#repository-entry-and-design-ownership)，本轮只变更文档、Skill 路由和 CI 所需入口。

- `95bafe6` 提交前：508 个相对链接/锚点、实际 Governance structure shell 步骤、旧入口引用清零、5 份设计文档检查通过；`git diff --check` 和 `git diff --cached --check` PASS。
- readiness 初次归并：511 个相对链接/锚点、删除文件引用清零、2 份 readiness 检查通过。最终去重后 519 个相对链接/锚点、FR 表 15 项、必要章节与重复运行结果检查通过，`git diff --check` PASS；链接数量不是产品覆盖率。
- `0999640` 后的 Architecture 精简工作区：工程取舍/检查/测试命名逐段原文迁移到 `ENGINEERING-RULES.md`，固定依赖与 provider 接线归 Implementation，根入口、Skill 与 CI 路由同步。532 个相对链接/锚点、实际 Governance structure 步骤、迁移段落完整性及 `git diff --check` PASS。
- 同一工作区后续规则修订：通用验证归 Engineering，TODO 仅管理登记任务，PR 配置引用 workflow/远端状态，文档结构按语义覆盖，RUNBOOK 作者与机械执行边界分离；入口、授权措辞及模板同步。551 个相对链接/锚点、Governance structure、模板/路由/清理与机械执行约束检查及 `git diff --check` PASS；未查询或修改远端 Ruleset，未执行 GitHub Actions。
- 未重新执行 plugin verify、Host、Browser 或模型验证；本轮整理不是全量需求/契约/源码一致性审计。

`f76ffd6` 后的治理补漏工作区（2026-09-09）：旧审查 Skill 按 Storage Domain 与 MeetingTask 更新，文档冲突不再以更新时间作为确认依据；PR 禁止 squash merge，Governance 补齐 RUNBOOK Rules 并共用 `.github/scripts/check-doc-links.py`。553 个本地链接目标/锚点检查、检查器 2 项回归测试（含断链、失效锚点、重复标题与代码示例）、实际 Governance structure shell 步骤及 diff 检查 PASS。未执行远端 CI 或修改远端保护配置。

Document Review Skill 验证：在实际仓库枚举确认规则模式匹配 6 份文件、设计目录匹配 5 份文件、`Engineering Rules` 标题唯一命中；零匹配及 `**` 零层/多层语义检查 PASS。同名标题双候选、只读权限和 P0–P3 分级进行了静态场景走查：旧存储口径/冲突依据为 P2，漏检规则文件为 P3，不因关键词升级 P0/P1。以上为当前会话走查与临时匹配验证，不是独立模型的端到端调用测试，也不证明所有 Agent 都能正确执行。

`f3f1e04` 后的文档审查修订：用户确认最低 DSH 为 `0.1.2-rc.1`、禁止 migration，其余冲突按当前代码核对。核对 `meeting-task.ts` 的 task/Participant 等待清除与重新规划分支、`meeting-control.ts` 的 resume blocker 拒绝、repository ownership 的 optional agentDefinition 和九角色探针入口；统一接口与设计，删除旧协议注释并归并操作说明。562 个链接/锚点及 `git diff --check` PASS；仅静态核对代码，未修改产品或重跑产品、Host、Browser、模型验证。

2026-09-09，`37aaad9` 后按用户确认收敛链接门禁：删除 Python 自制解析器和语法回归测试，改为 `.mjs` 调用 `Marked` 的文件链接检查。自动覆盖边界以 Document Rules 为准，旧锚点/语法测试结果仅属于上述历史基线，不代表当前门禁能力。当前仓库文件链接检查及临时隔离仓库的有效/缺失目标验证、`git diff --check` 通过；未重跑产品或远端 CI。

## Not Covered

以下集中列出当前缺口；专项章节中的 fake/DOM/历史限定只解释证据的证明范围。

| 范围 | 尚未实现或未验证 |
| --- | --- |
| FR-1 / 发布 | 最终分发与发布策略、其他 DSH 版本及独立 ACP/SDK/TUI/headless profile 未验证；无 WebServer 回归不等于这些部署已验收 |
| FR-4 / FR-8 | 真实模型规划质量、时间预算的真实完成边界、blocking Position 的真实 DSH 反例未验证 |
| FR-7 | 历史五动作 Browser 证据未在最新源码组合重跑，专项真实 Host 冷重启未验证 |
| FR-9 | 强杀 Host、真实缺失 Session、中断创建清理及默认角色补建的真实故障注入未执行；Definition descriptor 丢失按契约拒绝补建 |
| FR-10 | 邮件 snapshot 后新增 transcript 的完整跨层派发/重试组合未执行；历史持久上界契约不证明该组合通过；模型纪要质量未验证 |
| FR-11 | 新增面板区域只有 jsdom；Parking Lot、全部 archived issues、Proposal/Position 与收敛区域的完整 Browser 验收未完成；全部 repository 失败诊断、外部采集/聚合和完整 metrics 验证未完成 |
| FR-12 | 模型自主遵守会议协议及内部工具失败后的行为未验证。离线观察中 `src/dsh/provisioning.ts` 要求 attemptId/deliveryId，而 Manager context 使用 planningAttemptId；提示措辞差异未修复，不是模型失败复现 |
| FR-13 | approve/admission/provisioning、自动 expired/cancelled、research freshness/dedup 未实现；生产 Host Catalog 成功推荐→拒绝、专项 Host 冷重启、动态 FR-14 接入和推荐/拒绝 UI 未验证 |
| FR-14 | web_fetch 为用户授权跳过；完整无豁免部署验收、远程模型差异的配额/凭证与长期质量未证明；maxTokens 冷恢复、热切换、Browser 配置 UI 未验证，Host capability 变更不保证历史内容快照 |
| FR-15 | 真实 current/archive Markdown 文件输出未纳入当前 smoke |
| 通用运行边界 | stress/长期 soak、memory/FD、容量预算、一般资源泄漏、真实断电/硬件故障、多进程写入及任意时序在途写入自动排空未验证；`test:stress` 仍为 Not Covered 占位入口 |

V1 非目标：远程、多用户、跨 Host、独立 per-child Preset、独占 Skill、开发期迁移与已有版本升级；candidate reject/revoke、Question required-review/risk evidence、直接引用 Fact/Decision/task/file/research 的纪要不属于当前首版。外部副作用 exactly-once 不承诺。这些不是本轮待补齐任务。

## Closure

已有实现及证据支持上表中的当前状态；FR-13 仍部分实现，恢复故障、完整页面/观测验收及抓取等边界未关闭，不能称为全部需求或生产发布就绪。2026-09-09 仅完成文档职责整理与证据归并，不新增产品验收结论；提交和发布状态以 Git/PR 为准。
