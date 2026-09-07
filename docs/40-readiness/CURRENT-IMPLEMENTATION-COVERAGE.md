# Current Implementation Coverage

完成/调度偏差已修复；Session 生产恢复与面板/诊断已有实现及回归。完整恢复故障注入、新面板 Browser 和观测系统验证仍保留边界，不能由自动化通过推导为完整产品就绪。

## Scope

- 记录日期：2026-09-08。
- 源码边界：`6679403fc8cb6de01db1c7d2fb190d3a9484dd73`（验证在提交前的同一源码工作区执行），分支 `codex/align-code`。
- 环境：Darwin 25.5.0 arm64、Node `v24.19.0`、pnpm `10.7.0`、DSH `0.1.1-rc.2`；真实运行使用独立 `web` profile、`spawn` provider。
- 依据：当前 Requirements、Interfaces、Designs；源码及回归落点见下方业务能力验证，实际运行结果见 [Smoke Validation Evidence](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)。
- `已实现` 表示当前确认范围有正式运行路径及相称验证，不表示全部运行组合均已验证；`部分实现` 表示存在已知行为偏差或必需路径缺失。非目标与验证缺口分别说明。
- 历史专项记录保留原始基线。本次 verify 和普通 smoke 是新的当前基线证据；未重新执行的 Browser、故障注入和真实模型验证不外推。

## Validated Contract

- 单 package 的 Host/Client 构建、DSH bundle 安装、continuable provider gate 和 loopback HTTP。
- 正式 Meeting/Participant/Session ownership、顺序 speaker、前序 transcript、caller/capability、timeout/reassign、Task/HandRaise、mail 及归档/续会的既有核心路径。
- Storage Domain 单 commit、receipt、版本冲突、checkpoint/tail、JSONL 恢复、outbox 与 catalog；持久化恢复通过不等于所有 Session 故障恢复均实现。
- Proposal revision、Position、candidate acceptance、Decision supersede/revoke、单 Issue risk disposition、Captain/local 独立审计及主要 Client 控制。
- message-reference minutes draft、初始共享 Preset Definition 预检/注入/冷恢复、Developer Markdown 单向派生。
- 收敛 fallback/stalled/Turn budget completion 的当前真实 DSH 场景通过；多 Proposal、Position 排序及完成阻塞偏差已由回归锁定修复。

## Requirement Coverage

| Requirement | 状态 | 当前覆盖与证据 | 剩余边界 |
| --- | --- | --- | --- |
| FR-1 DSH 插件形态 | 已实现（锁定 rc.2 验证） | package、双 bundle、provider gate、真实安装与 Host；verify、baseline | 高于最低版本兼容与最终分发/发布策略未验证或未决定 |
| FR-2 会议与身份隔离 | 已实现 | 独立 Meeting/Participant/Session、repository ownership；create/caller contract、cross-meeting、role-composition | 远程、多用户、跨 Host 为 V1 非目标；异常恢复边界见 FR-9 |
| FR-3 有序连续发言 | 已实现 | 单活动 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝；baseline、timeout、reassign | 没有长期高负载证据 |
| FR-4 发言计划与选择 | 已实现（当前选择规则） | 四种 selection mode、required waiting、fallback、refocus/replan；planning/manager-fallback 测试和 convergence smoke | 多 Proposal blocking owners 与上一 Turn 缺席加分已通过规划回归；真实模型规划质量未验证 |
| FR-5 异步任务与举手 | 已实现 | Task create/queue/start/finish、receipt replay、授权 evidence、HandRaise 去重与消费；task-handraise 和 contract tests | 外部副作用 exactly-once 不承诺；长期压力未覆盖 |
| FR-6 议题范围与发散控制 | 已实现（当前领域契约） | Question evidence、Issue、Proposal/Position、Agenda candidate promote/park/reject、parkingLot、自动收敛 | 裁决、fingerprint 与完成阻塞偏差已修复；Agenda candidate 仅 Captain tool 处置，未新增 local UI 写入口 |
| FR-7 提案、立场与决策 | 已实现（当前结构化契约） | revision 隔离、不可变 candidate、Captain/local accept/supersede/revoke、risk 控制；decision-risk-closure、risk-reopen、contract/Client tests | 本次未重跑五动作 Browser；candidate reject/revoke 明确不属于 V1；会议整体完成的 Position guard 已补齐，见 FR-8 |
| FR-8 完成事实与会议结束 | 已实现（当前完成契约） | CompletionFact、task evidence、risk 重算、end/archive、预算完成优先；completion-end、Turn budget smoke | judge/completed end 的 blocking Position guard 已修复；时间预算只有本地代码/测试核对，没有当前真实边界场景 |
| FR-9 暂停、恢复与故障隔离 | 实现已补齐，故障验收未完 | pause/resume、timeout、reassign/skip、interrupt/drain、完整 ownership 的 cold-rebind 与 role 冷恢复通过 | 中断创建清理、默认角色补建和持久身份替换已接生产并通过 fake DSH 回归；缺失真实 Session/强杀 Host 尚未故障注入；Definition descriptor 丢失明确拒绝补建 |
| FR-10 记录、隐私与归档 | 已实现（message-reference 纪要首版） | transcript、mail 隐私、归档物化、revoke/drain、显式续会、引用式纪要；archive-continuation、mail-race、scribe-minutes 及归档 tests | Fact/Decision/Issue/task result 直接纪要引用不属于首版；邮件延迟增量/重试完整动态组合、模型质量和长期压力未覆盖 |
| FR-11 可观察性与用户控制 | 展示/基础诊断已实现，验收未完 | 本地 list/status、pause/resume/reassign/end、五种 Decision/risk 行内控制、轮询/focus/error 恢复；HTTP/Client tests | Proposal/Position、HandRaise、收敛展示和白名单日志/metrics 已实现；本轮补齐冷打开 gauges、失败与关联字段。新区域只有 jsdom，完整观测系统和 Browser 尚未验收 |
| FR-12 Agent 内部能力边界 | 已实现 | 只消费正式提交和授权 task projection；无自定义持久 DSH Session Event；caller/tool/module-boundary tests | 真实模型自主遵守协议与内部工具失败后的模型行为未验证 |
| FR-13 Agent 角色目录与参会推荐 | 部分实现 | optional Host consumer、attempt snapshot、安全 projection、Manager pending、Captain reject、status/archive、JSONL reopen | approve/admission/provisioning、自动 expired/cancelled、research freshness/dedup 未实现；真实 Host producer 成功链路、动态 FR-14 接入、UI 和专项 Host 冷重启未验证 |
| FR-14 共享 Preset 下的 Agent Definition | 已实现（共享父 Preset 首版） | 内联定义、显式初始选择、全角色预检、persona/toolFilter、不可变 provenance、ready replay；当前 role-composition 双 Host 验证通过 | 独立 per-child Preset、独占 Skill、模型配置、热切换、动态 admission、Browser 配置 UI 不属于首版；宿主 capability 部署变化不保证历史快照 |
| FR-15 Developer Markdown Projection | 已实现（本地辅助输出） | committed snapshot/package → current/archive Markdown；白名单、路径、stale、原子替换、失败隔离、dispose；专项 unit/contract tests 随当前 verify 通过 | Interface 已同步 local_host_acceptance 枚举；真实文件输出未纳入当前 smoke，multi-Host/remote workspace/旧文件迁移不支持 |

### 业务能力验证

以下源码与测试路径相对 `plugin/`，均纳入 2026-09-08 的最终 verify。

| 能力 | 实现与自动化证据 | 验证边界 |
| --- | --- | --- |
| 完成判断 | `src/domain/completion.ts` 与 `proposal-state.ts` 检查每个 Proposal 当前 revision 的 blocking object/needs_revision；`tests/unit/domain/completion.spec.ts` 覆盖 judge/completed end、非阻塞意见和旧 revision | 未新增真实 DSH blocking Position 反例 |
| 发言规划 | `src/domain/planning.ts` 汇集同议题所有独立 Proposal 的 blocking owners，并为上一 Turn 缺席者加 20 分；`tests/unit/domain/planning.spec.ts` 覆盖独立 revision、其他议题和历史发言者 | 真实模型规划质量未验证 |
| 收敛指纹 | `src/domain/transitions/turn-advancement.ts` 按 Proposal ID、Position ID 排序；`tests/unit/domain/transitions/turn-advancement.spec.ts` 验证重排不改变 fingerprint | 不声称生产写入曾实际发生重排 |
| Session 恢复 | `src/runtime/services/meeting-session-recovery.ts` 接入 rehydration/Captain 生产路径；`tests/recovery/session-recovery.spec.ts` 9 项覆盖中断创建、缺失角色、并发恢复、跨身份拒绝、失败重试、checkpoint 替换链、Definition 丢失、终态清理和失败脱敏 | 缺失真实 Session/创建中断的 Host 故障注入仍未执行 |
| 面板事实 | `tests/client/meeting-panel.client.spec.ts` 65 项覆盖 Proposal/Position、HandRaise、stall/replan、selection reason 与完整事实刷新等面板行为 | 新区域只有 jsdom 证据，未执行实际 Browser 观察 |
| 结构化诊断 | `src/repository/diagnostics.ts` 接 DSH logger；`tests/unit/repository/diagnostics.spec.ts` 5 项及 runtime/恢复/归档回归覆盖冷打开 gauges、日志失败隔离、拒绝提交、派发关联和清理失败 | 外部采集、完整失败路径和长期容量未验收 |

恢复使用锁定 rc.2 的 `SubagentRuntime.listDescendants/listChildren/startContinuable/interrupt/drainContinuableChildren`；生产 `getCaptainParent` 接 `ctx.agents.get`。同进程创建不参与冷对账；旧 Session 的 closed/revoked ownership 与 `supersededBySessionId` 保留在 checkpoint，caller 拒绝旧身份，dispatch/archive 选择未被替换的身份。缺失角色补建前正常 pause，旧 outbox 由 Meeting/attempt guard 拒绝，不立即删除队列；未完成 mail 取消，补建后显式 resume。历史 Definition descriptor 丢失时返回 `RECOVERY_ROLE_DESCRIPTOR_MISSING`，保持 pause，不套用当前 Definition；终态只清理，不补建。

### 诊断覆盖

| 指标或字段 | 当前含义 |
| --- | --- |
| active/waiting/backlog | commit 与冷打开 projection 发出 per-meeting gauges；Host 汇总已打开会议 active/waiting，冷打开不重放历史事件计数 |
| dispatch latency/retry | outbox 进入 delivered 或从 leased 变 pending 时发出；耗时从 createdAt 到观察时间，包含排队与重试 |
| turn/attempt/waiting duration | 从已提交前后状态计算；Speaker 按事件中的 attempt ID 关联 step，不使用推进后的当前 step |
| recovery/failure/stale submit | reconciliation、Captain/lifecycle 不可用、repository mutation failure、STALE_ATTEMPT 拒绝；不产生新的领域事实 |
| revoke/close/archive failure | recovery retirement 与 archive cleanup 的失败类别，包含 drain 和 closed ownership 写失败 |
| identity/privacy | meeting/version/event、可用的 command/outbox kind、turn/step/attempt/delivery ID；不复制完整 payload、私聊、Session ID、凭据或 provider 原始错误 |

诊断为 DSH logger 数值字段，没有独立 metrics framework 或持久状态源。损坏 domain 无法打开时不计入已观测 gauge；日志不能替代完整会议列表。所有 repository read/open/maintenance 失败的观测覆盖、外部聚合和长期容量尚未验证。

Question 的 required-review/risk evidence 与 Decision candidate reject/revoke 由 Protocol 明确排除，不作为当前实现缺口。

## Executed Validation

2026-09-08，在上述源码工作区执行：

- `pnpm --dir plugin install --frozen-lockfile`：补齐已锁定的两项 DSH 依赖，manifest/lockfile 无变更。首次 verify 因本机缺依赖未过 Host typecheck，恢复后最终 verify 通过。
- `pnpm --dir plugin verify`：exit 0，84 files / 1063 tests，Vitest 69.29 秒；format、lint、Host/Client typecheck、build、environment、plugin contract、9 Definition samples 和 package 全 PASS。
- `pnpm --dir plugin smoke:profile --all`：exit 0；16/16 PASS，156709ms，一次构建；每场景 Restore 均 PASS，详见 [当前 smoke 结果](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)。
- `git diff --check`、readiness 相对文件链接、TODO、README 和临时交接引用收口检查：通过；TODO 无登记项，根 README 无 diff，临时交接文件已删除且无残留引用。

2026-09-08 的测试命名终审使用 TypeScript AST 提取 840 个静态 suite/case 标题定义，未发现按审计任务、需求或阶段编号组织的长期测试。恢复 fake 使用 DSH 公开方法签名约束，保留 branded ID 与 live Agent fixture 类型断言。聚焦验证先后覆盖恢复/diagnostics 13 项、runtime/归档 84 项；补充 attempt 关联后 diagnostics 5 项通过，最终全量 verify 覆盖全部源码修改。

### Historical Audit Validation

以下命令和结果保留自 `743edbee564d34402fedc2bb44ebbb006790fe1a`，仅指修复前基线。

2026-09-07，在上述统一基线执行：

| 命令 | 结果与证明边界 |
| --- | --- |
| `pnpm --dir plugin verify` | exit 0；82 files / 1039 tests；format、lint、Host/Client typecheck、build、environment、plugin contract、9 Definition samples、package 全 PASS |
| `pnpm --dir plugin smoke:profile --all` | exit 0；16/16 PASS，140404ms，一次构建；逐场景 Restore 均 PASS；[逐项结果](./SMOKE-VALIDATION-EVIDENCE.md#audit-baseline-validation) |
| Node 源码反例 | 完成阻塞、多 Proposal 裁决、Position 排序和上一 Turn 缺席评分四项偏差均复现；历史输入保留在 Git 历史，当前修复由上方领域回归锁定 |
| 文档检查 | `git diff --check`、readiness 相对文件链接检查通过；无产品源码或测试改动 |

### 专项证据索引

这些文档保留原始实施和验证边界。本次全量 verify 重新执行其现存自动化回归；本次 smoke 只重新证明现有 selector 的断言。

| 证据 | 原始范围与本次关系 |
| --- | --- |
| [DSH Runtime Vertical Slice](./DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md) | 早期创建、连续发言、恢复、归档及 Browser 历史；当前普通运行以新的 smoke 表为准 |
| [Convergence Runtime](./CONVERGENCE-RUNTIME-VALIDATION-EVIDENCE.md) | 历史六场景；部分 selector 后来删除。当前保留的 fallback/stalled/Turn budget 已重跑，完成/规划/指纹修复回归见上方业务能力验证 |
| [Captain Local Decision/Risk](./CAPTAIN-LOCAL-DECISION-RISK-CONTROL-EVIDENCE.md) | 五动作、六条 local facts、HTTP/Client 与 LC-08 Browser；本次仅自动化与普通 decision/risk smoke 重跑 |
| [Captain Attendance Rejection](./CAPTAIN-ATTENDANCE-REJECTION-EVIDENCE.md) | Captain reject 子闭环；不证明 approve/admission。baseline 中缺失推荐拒绝路径仍不等于 producer 成功推荐→拒绝 |
| [FR-14 Shared Preset](./FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md) | 初始角色隔离与配置 provenance；当前 role-composition 已重新通过双 Host 冷恢复 |
| [Referenced Minutes](./REFERENCED-MINUTES-VALIDATION-EVIDENCE.md) | message-reference metadata、原子性、HTTP/Client/archive 与 Browser；当前普通 scribe-minutes 已重跑，Browser 未重跑 |
| [Client Fact Visibility](./CLIENT-FACT-VISIBILITY-EVIDENCE.md) | 主要事实区与刷新/禁写；原专项没有声称全部 FR-11 完成，本轮新增区域由 Client 回归覆盖，尚无新 Browser 证据 |
| [Offline Protocol](./OFFLINE-MEETING-PROTOCOL-PREPARATION-EVIDENCE.md) | 无模型的协议准备与自动化断言；不替代真实 Agent/Browser/模型证据 |

## Not Covered

- 当前 Browser 操作、真实 LLM 请求、模型自动主持/参会/纪要质量均未执行。已注入 provider 凭据和真实 Session 创建不构成模型请求成功。
- 完成/调度偏差已修复，Session 恢复的真实故障注入、新面板 Browser 和观测系统边界仍开放；FR-13 动态接纳和 research dedup 尚未实现。
- 时间预算的真实完成边界、blocking Position 的真实 DSH 反例、mail snapshot 后新增 transcript 的完整跨层重试组合未独立执行。
- stress/长期 soak、memory/FD 与容量预算、一般资源泄漏、完整 metrics、生产发布和高版本兼容未验证；`test:stress` 仍是明确输出 Not Covered 的占位入口。
- V1 仍限单本地 Host/单用户；远程、多用户和跨 Host 不是待本次补齐的实现缺口。

## Closure

当前完成/调度偏差已修复，Session 恢复、身份替换、面板事实与诊断已有对应实现和回归。未执行的故障注入、Browser、模型与完整 metrics 仍以 Not Covered 保留；FR-13 等后续功能不在本轮完成范围。不得描述为全部需求或生产发布就绪。
