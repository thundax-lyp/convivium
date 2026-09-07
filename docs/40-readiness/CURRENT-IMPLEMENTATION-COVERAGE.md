# Current Implementation Coverage

当前基线完整 verify（82 files / 1039 tests）及真实 DSH smoke（16/16 场景）通过，但代码核对另复现四个完成/调度偏差。相关需求仍为部分实现，不能由回归通过推导为完整产品就绪。

## Scope

- 记录日期：2026-09-07。
- 统一代码基线：`743edbee564d34402fedc2bb44ebbb006790fe1a`，分支 `codex/align-code`；本次更新只含 readiness 文档。
- 环境：Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`；真实运行使用独立 `web` profile、`spawn` provider。
- 依据：当前 Requirements、Interfaces、Designs；源码落点、反例、文档漂移和执行方法见 [Code Alignment Evidence](./CODE-ALIGNMENT-EVIDENCE.md)。
- `已实现` 表示当前确认范围有正式运行路径及相称验证，不表示全部运行组合均已验证；`部分实现` 表示存在已知行为偏差或必需路径缺失。非目标与验证缺口分别说明。
- 历史专项记录保留原始基线。本次 verify 和普通 smoke 是新的当前基线证据；未重新执行的 Browser、故障注入和真实模型验证不外推。

## Validated Contract

- 单 package 的 Host/Client 构建、DSH bundle 安装、continuable provider gate 和 loopback HTTP。
- 正式 Meeting/Participant/Session ownership、顺序 speaker、前序 transcript、caller/capability、timeout/reassign、Task/HandRaise、mail 及归档/续会的既有核心路径。
- Storage Domain 单 commit、receipt、版本冲突、checkpoint/tail、JSONL 恢复、outbox 与 catalog；持久化恢复通过不等于所有 Session 故障恢复均实现。
- Proposal revision、Position、candidate acceptance、Decision supersede/revoke、单 Issue risk disposition、Captain/local 独立审计及主要 Client 控制。
- message-reference minutes draft、初始共享 Preset Definition 预检/注入/冷恢复、Developer Markdown 单向派生。
- 收敛 fallback/stalled/Turn budget completion 的当前真实 DSH 场景通过；多 Proposal、Position 排序及完成阻塞反例见下文。

## Requirement Coverage

| Requirement | 状态 | 当前覆盖与证据 | 剩余边界 |
| --- | --- | --- | --- |
| FR-1 DSH 插件形态 | 已实现（锁定 rc.2 验证） | package、双 bundle、provider gate、真实安装与 Host；verify、baseline | 高于最低版本兼容与最终分发/发布策略未验证或未决定 |
| FR-2 会议与身份隔离 | 已实现 | 独立 Meeting/Participant/Session、repository ownership；create/caller contract、cross-meeting、role-composition | 远程、多用户、跨 Host 为 V1 非目标；异常恢复边界见 FR-9 |
| FR-3 有序连续发言 | 已实现 | 单活动 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝；baseline、timeout、reassign | 没有长期高负载证据 |
| FR-4 发言计划与选择 | 部分实现 | 四种 selection mode、required waiting、fallback、refocus/replan；planning/manager-fallback 测试和 convergence smoke | CA-02：多 Proposal blocking owners 漏判；CA-04：上一 Turn 未发言加分缺失 |
| FR-5 异步任务与举手 | 已实现 | Task create/queue/start/finish、receipt replay、授权 evidence、HandRaise 去重与消费；task-handraise 和 contract tests | 外部副作用 exactly-once 不承诺；长期压力未覆盖 |
| FR-6 议题范围与发散控制 | 部分实现 | Question evidence、Issue、Proposal/Position、Agenda candidate promote/park/reject、parkingLot、自动收敛 | CA-02/03：裁决与 fingerprint 偏差；CA-01：blocking Position 未进入完成判断；Agenda candidate 仅 Captain tool 处置，未新增 local UI 写入口 |
| FR-7 提案、立场与决策 | 已实现（当前结构化契约） | revision 隔离、不可变 candidate、Captain/local accept/supersede/revoke、risk 控制；decision-risk-closure、risk-reopen、contract/Client tests | 本次未重跑五动作 Browser；candidate reject/revoke 明确不属于 V1；会议整体完成的 Position 缺口见 FR-8 |
| FR-8 完成事实与会议结束 | 部分实现 | CompletionFact、task evidence、risk 重算、end/archive、预算完成优先；completion-end、Turn budget smoke | CA-01：blocking Position 存在时仍可 completed；时间预算只有本地代码/测试核对，没有当前真实边界场景 |
| FR-9 暂停、恢复与故障隔离 | 部分实现 | pause/resume、timeout、reassign/skip、interrupt/drain、完整 ownership 的 cold-rebind 与 role 冷恢复通过 | CA-05：中断创建自动对账/清理、缺失 Manager/Participant 补建尚无完整生产接线；不能把 cold-rebind PASS 描述为全部冷恢复已实现 |
| FR-10 记录、隐私与归档 | 已实现（message-reference 纪要首版） | transcript、mail 隐私、归档物化、revoke/drain、显式续会、引用式纪要；archive-continuation、mail-race、scribe-minutes 及归档 tests | Fact/Decision/Issue/task result 直接纪要引用不属于首版；邮件延迟增量/重试完整动态组合、模型质量和长期压力未覆盖 |
| FR-11 可观察性与用户控制 | 部分实现 | 本地 list/status、pause/resume/reassign/end、五种 Decision/risk 行内控制、轮询/focus/error 恢复；HTTP/Client tests | CA-06：面板未消费 proposals/positions、pendingHandRaises、收敛计数；完整日志/metrics 未实现。本次没有 Browser 交互证据 |
| FR-12 Agent 内部能力边界 | 已实现 | 只消费正式提交和授权 task projection；无自定义持久 DSH Session Event；caller/tool/module-boundary tests | 真实模型自主遵守协议与内部工具失败后的模型行为未验证 |
| FR-13 Agent 角色目录与参会推荐 | 部分实现 | optional Host consumer、attempt snapshot、安全 projection、Manager pending、Captain reject、status/archive、JSONL reopen | approve/admission/provisioning、自动 expired/cancelled、research freshness/dedup 未实现；真实 Host producer 成功链路、动态 FR-14 接入、UI 和专项 Host 冷重启未验证 |
| FR-14 共享 Preset 下的 Agent Definition | 已实现（共享父 Preset 首版） | 内联定义、显式初始选择、全角色预检、persona/toolFilter、不可变 provenance、ready replay；当前 role-composition 双 Host 验证通过 | 独立 per-child Preset、独占 Skill、模型配置、热切换、动态 admission、Browser 配置 UI 不属于首版；宿主 capability 部署变化不保证历史快照 |
| FR-15 Developer Markdown Projection | 已实现（本地辅助输出） | committed snapshot/package → current/archive Markdown；白名单、路径、stale、原子替换、失败隔离、dispose；专项 unit/contract tests 随当前 verify 通过 | Interface 枚举遗漏 local_host_acceptance 属文档漂移；真实文件输出未纳入当前 smoke，multi-Host/remote workspace/旧文件迁移不支持 |

### 当前代码缺口

[Code Alignment Evidence](./CODE-ALIGNMENT-EVIDENCE.md#confirmed-code-gaps) 保存触发条件、源码、正式依据与补齐验收：

- CA-01：完成判断遗漏当前 blocking Position；直接执行 judge 与 completed end 均复现。
- CA-02：hybrid 只检查单个 Proposal，漏掉分散在多个 Proposal 的两位 blocking owners；直接调用复现 false。
- CA-03：相同 Proposal 内 Position 仅交换顺序，fingerprint 就改变；纯函数反例已复现，未证明正常写路径会发生重排。
- CA-04：+20 分项使用 never-spoke，曾发言但上一 Turn 缺席者仅得 recency；反例实际 2，按规则应 22。
- CA-05：完整 Session 冷恢复/中断创建对账未接齐；源码核对，未做对应真实破坏性故障注入。
- CA-06：部分已公开事实没有 Client 展示消费，完整结构化观测未实现；源码核对。

这些是未修复缺口，不因 1039 项既有测试或 16 场景 smoke 通过而关闭。Question 的 required-review/risk evidence 和 Decision candidate reject/revoke 不再列作缺口，因为当前 Protocol 明确排除。

## Executed Validation

2026-09-07，在上述统一基线执行：

| 命令 | 结果与证明边界 |
| --- | --- |
| `pnpm --dir plugin verify` | exit 0；82 files / 1039 tests；format、lint、Host/Client typecheck、build、environment、plugin contract、9 Definition samples、package 全 PASS |
| `pnpm --dir plugin smoke:profile --all` | exit 0；16/16 PASS，140404ms，一次构建；逐场景 Restore 均 PASS；[逐项结果](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation) |
| Node 源码反例 | CA-01–04 均复现与规范不符的结果；[可重复输入](./CODE-ALIGNMENT-EVIDENCE.md#reproduction-inputs) |
| 文档检查 | `git diff --check`、readiness 相对文件链接检查通过；无产品源码或测试改动 |

### 专项证据索引

这些文档保留原始实施和验证边界。本次全量 verify 重新执行其现存自动化回归；本次 smoke 只重新证明现有 selector 的断言。

| 证据 | 原始范围与本次关系 |
| --- | --- |
| [DSH Runtime Vertical Slice](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md) | 早期创建、连续发言、恢复、归档及 Browser 历史；当前普通运行以新的 smoke 表为准 |
| [Convergence Runtime](./CONVERGENCE-RUNTIME-VALIDATION-EVIDENCE.md) | 历史六场景；部分 selector 后来删除。当前保留的 fallback/stalled/Turn budget 已重跑，规则偏差另见 CA-01–04 |
| [Captain Local Decision/Risk](./CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md) | 五动作、六条 local facts、HTTP/Client 与 LC-08 Browser；本次仅自动化与普通 decision/risk smoke 重跑 |
| [Captain Attendance Rejection](./CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md) | Captain reject 子闭环；不证明 approve/admission。baseline 中缺失推荐拒绝路径仍不等于 producer 成功推荐→拒绝 |
| [FR-14 Shared Preset](./FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md) | 初始角色隔离与配置 provenance；当前 role-composition 已重新通过双 Host 冷恢复 |
| [Referenced Minutes](./REFERENCED-MINUTES-VALIDATION-EVIDENCE.md) | message-reference metadata、原子性、HTTP/Client/archive 与 Browser；当前普通 scribe-minutes 已重跑，Browser 未重跑 |
| [Client Fact Visibility](./CLIENT-FACT-VISIBILITY-EVIDENCE.md) | 主要事实区与刷新/禁写；原专项没有声称全部 FR-11 完成，不覆盖 CA-06 缺少的展示区 |
| [Offline Protocol](./OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md) | 无模型的协议准备与自动化断言；不替代真实 Agent/Browser/模型证据 |

## Not Covered

- 当前 Browser 操作、真实 LLM 请求、模型自动主持/参会/纪要质量均未执行。已注入 provider 凭据和真实 Session 创建不构成模型请求成功。
- CA-01–06 尚未修复；FR-13 动态接纳和 research dedup 尚未实现。完整 verify 不具有这些遗漏组合的回归断言。
- 时间预算的真实完成边界、blocking Position 的真实 DSH 反例、mail snapshot 后新增 transcript 的完整跨层重试组合未独立执行。
- stress/长期 soak、memory/FD 与容量预算、一般资源泄漏、完整 metrics、生产发布和高版本兼容未验证；`test:stress` 仍是明确输出 Not Covered 的占位入口。
- V1 仍限单本地 Host/单用户；远程、多用户和跨 Host 不是待本次补齐的实现缺口。

## Closure

当前可以描述为“主要会议运行路径已建立，当前基线完整本地验证和 16 场景真实 DSH 回归通过”。完成判断、调度、完整恢复和 UI/观测仍有明确缺口，因此不可描述为需求全部对齐、完整会议产品或发布就绪。本次完成 readiness 更新；产品代码缺口仍待后续修复。
