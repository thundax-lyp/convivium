# Current Implementation Coverage

完成/调度偏差已修复；Session 生产恢复与面板/诊断已有实现及回归。完整恢复故障注入、新面板 Browser 和观测系统验证仍保留边界，不能由自动化通过推导为完整产品就绪。

## Scope

- 记录日期：2026-09-08。
- 源码边界：`8c3b7ab0359828f4b2e33554300c134f95bacecd`，分支 `codex/upgrade-dsh-0.1.2-rc.1`；验证在提交前的同一源码工作区执行。
- 环境：Darwin arm64、Node `v22.23.2`、DSH `0.1.2-rc.1`、Cordis `4.0.2`；真实运行使用独立 `web` profile、`spawn` provider。
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
| FR-1 DSH 插件形态 | 已实现（锁定 0.1.2-rc.1 验证） | package、双 bundle、provider gate、真实安装与 Host；verify、baseline | 其他 DSH 版本与独立 ACP/SDK/TUI 部署未验证；最终分发/发布策略未决定 |
| FR-2 会议与身份隔离 | 已实现 | 独立 Meeting/Participant/Session、repository ownership；create/caller contract、cross-meeting、role-composition | 远程、多用户、跨 Host 为 V1 非目标；异常恢复边界见 FR-9 |
| FR-3 有序连续发言 | 已实现 | 单活动 attempt、逐 Speaker delivery、前序 transcript、late/stale 拒绝；baseline、timeout、reassign | 没有长期高负载证据 |
| FR-4 发言计划与选择 | 已实现（当前选择规则） | 四种 selection mode、required waiting、fallback、refocus/replan；planning/manager-fallback 测试和 convergence smoke | 多 Proposal blocking owners 与上一 Turn 缺席加分已通过规划回归；真实模型规划质量未验证 |
| FR-5 异步任务与举手 | 已实现 | Task create/queue/start/finish、receipt replay、授权 evidence、HandRaise 去重与消费；task-handraise 和 contract tests | 外部副作用 exactly-once 不承诺；长期压力未覆盖 |
| FR-6 议题范围与发散控制 | 已实现（当前领域契约） | Question evidence、Issue、Proposal/Position、Agenda candidate promote/park/reject、parkingLot、自动收敛 | 裁决、fingerprint 与完成阻塞偏差已修复；Agenda candidate 仅 Captain tool 处置，未新增 local UI 写入口 |
| FR-7 提案、立场与决策 | 已实现（当前结构化契约） | revision 隔离、不可变 candidate、Captain/local accept/supersede/revoke、risk 控制；decision-risk-closure、risk-reopen、contract/Client tests | 本次未重跑五动作 Browser；candidate reject/revoke 明确不属于 V1；会议整体完成的 Position guard 已补齐，见 FR-8 |
| FR-8 完成事实与会议结束 | 已实现（当前完成契约） | CompletionFact、task evidence、risk 重算、end/archive、预算完成优先；completion-end、Turn budget smoke | judge/completed end 的 blocking Position guard 已修复；时间预算只有本地代码/测试核对，没有当前真实边界场景 |
| FR-9 暂停、恢复与故障隔离 | 实现已补齐，故障验收未完 | pause/resume、timeout、reassign/skip、interrupt/drain、完整 ownership 的 cold-rebind、角色配置保持及未完成 delivery 原标识重投通过 | 中断创建清理、默认角色补建和持久身份替换已接生产并通过 fake DSH 回归；缺失真实 Session/强杀 Host 尚未故障注入；Definition descriptor 丢失明确拒绝补建 |
| FR-10 记录、隐私与归档 | 已实现（message-reference 纪要首版） | transcript、mail 隐私、归档物化、revoke/drain、显式续会、引用式纪要；archive-continuation、mail-race、scribe-minutes 及归档 tests | Fact/Decision/Issue/task result 直接纪要引用不属于首版；邮件延迟增量/重试完整动态组合、模型质量和长期压力未覆盖 |
| FR-11 可观察性与用户控制 | 展示/基础诊断已实现，验收未完 | 本地 list/status、pause/resume/reassign/end、五种 Decision/risk 行内控制、轮询/focus/error 恢复；HTTP/Client tests | Proposal/Position、HandRaise、收敛展示和白名单日志/metrics 已实现；本轮补齐冷打开 gauges、失败与关联字段。新区域只有 jsdom，完整观测系统和 Browser 尚未验收 |
| FR-12 Agent 内部能力边界 | 已实现 | 只消费正式提交和授权 task projection；无自定义持久 DSH Session Event；caller/tool/module-boundary tests | 真实模型自主遵守协议与内部工具失败后的模型行为未验证 |
| FR-13 Agent 角色目录与参会推荐 | 部分实现 | optional Host consumer、attempt snapshot、安全 projection、Manager pending、Captain reject、status/archive、JSONL reopen | approve/admission/provisioning、自动 expired/cancelled、research freshness/dedup 未实现；真实 Host producer 成功链路、动态 FR-14 接入、UI 和专项 Host 冷重启未验证 |
| FR-14 共享 Preset 下的 Agent Definition | 角色模型/部署已实现，本轮验收含抓取豁免 | roleDescription、Host 模型绑定、同包九角色/九 Skill、三研究搜索、权限拒绝、双 Host 冷恢复、完整 verify 与五核心 PASS | web_fetch 按用户要求 Not Covered；完整无豁免部署验收与长期模型质量未证明，见 [本轮证据](./SMOKE-VALIDATION-EVIDENCE.md#meeting-roles-deployment) |
| FR-15 Developer Markdown Projection | 已实现（本地辅助输出） | committed snapshot/package → current/archive Markdown；白名单、路径、stale、原子替换、失败隔离、dispose；专项 unit/contract tests 随当前 verify 通过 | Interface 已同步 local_host_acceptance 枚举；真实文件输出未纳入当前 smoke，multi-Host/remote workspace/旧文件迁移不支持 |

### 业务能力验证

以下源码与测试路径相对 `plugin/`，均纳入 2026-09-08 的最终 verify。

| 能力 | 实现与自动化证据 | 验证边界 |
| --- | --- | --- |
| 完成判断 | `src/domain/completion.ts` 与 `proposal-state.ts` 检查每个 Proposal 当前 revision 的 blocking object/needs_revision；`tests/unit/domain/completion.spec.ts` 覆盖 judge/completed end、非阻塞意见和旧 revision | 未新增真实 DSH blocking Position 反例 |
| 发言规划 | `src/domain/planning.ts` 汇集同议题所有独立 Proposal 的 blocking owners，并为上一 Turn 缺席者加 20 分；`tests/unit/domain/planning.spec.ts` 覆盖独立 revision、其他议题和历史发言者 | 真实模型规划质量未验证 |
| 收敛指纹 | `src/domain/transitions/turn-advancement.ts` 按 Proposal ID、Position ID 排序；`tests/unit/domain/transitions/turn-advancement.spec.ts` 验证重排不改变 fingerprint | 不声称生产写入曾实际发生重排 |
| Session 恢复 | `src/runtime/services/meeting-session-recovery.ts` 接入 rehydration/Captain 生产路径；`tests/recovery/session-recovery.spec.ts` 10 项覆盖未完成 planning 原标识重投、暂停排除、中断创建、缺失角色、并发恢复、跨身份拒绝、失败重试、checkpoint 替换链、Definition 丢失、终态清理和失败脱敏 | 缺失真实 Session/创建中断的 Host 故障注入仍未执行 |
| 面板事实 | `tests/client/meeting-panel.client.spec.ts` 65 项覆盖 Proposal/Position、HandRaise、stall/replan、selection reason 与完整事实刷新等面板行为 | 新区域只有 jsdom 证据，未执行实际 Browser 观察 |
| 结构化诊断 | `src/repository/diagnostics.ts` 接 DSH logger；`tests/unit/repository/diagnostics.spec.ts` 5 项及 runtime/恢复/归档回归覆盖冷打开 gauges、日志失败隔离、拒绝提交、派发关联和清理失败 | 外部采集、完整失败路径和长期容量未验收 |

恢复使用锁定 `0.1.2-rc.1` 的 `SubagentRuntime.listDescendants/listChildren/startContinuable/interrupt/drainContinuableChildren`；生产 `getCaptainParent` 接 `ctx.agents.get`。同进程创建不参与冷对账；旧 Session 的 closed/revoked ownership 与 `supersededBySessionId` 保留在 checkpoint，caller 拒绝旧身份，dispatch/archive 选择未被替换的身份。缺失角色补建前正常 pause，旧 outbox 由 Meeting/attempt guard 拒绝，不立即删除队列；未完成 mail 取消，补建后显式 resume。历史 Definition descriptor 丢失时返回 `RECOVERY_ROLE_DESCRIPTOR_MISSING`，保持 pause，不套用当前 Definition；终态只清理，不补建。完整身份冷重绑后的 delivery 重投范围和失败语义见 [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md)，不把 DSH input acceptance 当作业务完成。

### Captain Attendance Rejection

以下为 Captain reject 的自动化验证索引，路径相对 `plugin/tests/`；现存回归纳入上述源码基线的完整 verify。正式语义以 [Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md#captain-rejection-slice) 为准。

| 验证范围 | 测试落点与实际覆盖 |
| --- | --- |
| 输入与工具边界 | `contract/protocol-schema.spec.ts`、`contract/tool-registration.spec.ts`：reject-only 输入、非法字段拒绝、reason 原始空白参与 hash、参数转发与 canonical JSON；offline protocol 与 index-inject suites 覆盖注册和 disposer |
| 权限、事务与幂等 | `unit/domain/transitions/attendance-rejection.spec.ts`、repository 与 `contract/meeting-runtime.spec.ts`：Captain 身份隔离、单 event/receipt、version/eventSeq +1、outbox 为空；stale/终态拒绝、重放/hash conflict、并发仅一次成功、commit 失败无半提交 |
| 投影与归档 | projection、status-projection、domain/runtime archive suites：旧 pending/package 读取、损坏数据拒绝、三类 Agent 一致可见性、七字段归档、排序/深复制及伪造拒绝 |
| JSONL reopen | `contract/meeting-runtime.spec.ts` 的 `archives and reopens a Captain attendance rejection`：测试 Catalog 经正式 create/Manager plan 生成 pending 后成功拒绝，cancelled 后归档；Manager/Participant drain，dispose/reopen 后归档不变、新请求拒绝、原 receipt 重放成功 |

真实 Loader 仅证明缺失推荐的拒绝路径，见 [历史运行结果](./SMOKE-VALIDATION-EVIDENCE.md#captain-attendance-rejection-loader)。测试 Catalog 与 JSONL reopen 不证明生产 Catalog 成功推荐→拒绝或真实 Host 冷重启；拒绝 UI、真实模型和专项长期压力未覆盖。approve/admission/provisioning、自动 expired/cancelled 仍未实现；初始 FR-14 角色组合已实现，动态 admission 接入不属于该首版。

### Captain Local Decision Risk Control

以下测试路径相对 `plugin/tests/`，现存回归纳入上述源码基线的完整 verify；范围为 Decision accept/supersede/revoke 与单 Issue risk accept/reject 五动作。

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| 权限、领域与审计 | decision-acceptance、decision-disposition、completion suites：Captain capability 与后端绑定 local authority、非法对象/证据/终态拒绝、替换双事实、撤销历史、risk 重开；满足完成判断时同事务 converging，版本只增一次，不自动 end/archive |
| 原子性与重放 | `contract/meeting-runtime.spec.ts`、`contract/domain-meeting-repository.spec.ts`、`recovery/domain-recovery.spec.ts`：逐动作 commit 失败无半提交、重试一次、混入外部证据整体拒绝、来源 receipt 隔离及终态重放 |
| HTTP、持久恢复与归档 | http-boundary、protocol-schema、runtime 与 archive suites：类型化 POST 执行五动作，GET 经正式 Schema 校验；fake Domain 上重建 Runtime 保持 projection/receipt，Repository 冷重开保留两 Decision history、六条 local facts，拒绝伪造来源和证据；不证明真实 Host 冷重启 |
| Client 与 Browser 夹具 | Client suites 覆盖五动作表单、写锁、证据预选、409、完整刷新、迟到响应及终态禁写；smoke-profile suite 验证两候选与 blocking risk 的暂停/ready 边界。DOM 与 fake runtime 不替代实际页面验收 |

[历史真实 Browser 验收](./SMOKE-VALIDATION-EVIDENCE.md#captain-local-decision-risk-browser) 在 `b63697d` 完成七步页面操作、六事实归档审计与 Restore；本轮仅重跑自动化及普通 decision/risk smoke，未重跑 Browser。真实模型、专项 Host 冷重启和长期压力未覆盖，不据此宣称完整 FR-7 生命周期已验收。

### Client Fact Visibility

以下现存 Client 与 smoke 脚本回归纳入上述源码基线的完整 verify；源码与测试路径相对 `plugin/`。

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| 正式事实展示 | `src/client/meeting-panel-view.tsx`、`meeting-panel-sections.tsx` 及 Client suites：12 种 status 的非空 DTO 经 HTTP JSON/Schema/DOM 消费；Decision accepted/history、四类 Parking Lot 处置、risk/archive issues、公开 intent/reason/objective 与无 Turn 时旧值清除 |
| 完整刷新与错误恢复 | Client suites 的 `refreshFactStatus`：focus/5000ms poll 对不同版本集合逐条替换、删除及卸载重开；分别缺少 decisionHistory、parkingLot、archive.package.issues 时保留缓存、禁写，合法刷新后恢复并清除 alert，输入 JSON 不变 |
| 展示边界 | 文本 HTML 不创建 img、终态禁写；原事实展示增量不新增后端权限或命令。后来增加的 Decision/risk 五动作见上方独立验证索引，不沿用旧“区域无写控件”作为当前总体结论 |
| Browser 清理 | `tests/unit/scripts/smoke-profile.spec.ts`：真实子进程 SIGINT 后清理期间再次收到 SIGTERM，仍输出 cleanup marker 并正常退出；不证明一般进程树或长期资源无泄漏 |

[历史 Browser 空态及清理证据](./SMOKE-VALIDATION-EVIDENCE.md#client-fact-visibility-browser) 限于 `0cb0193` 的公开字段、四个空态区和刷新一致性。该轮非空事实只有自动化证据；后来 Decision/risk 的独立 Browser 结果不补足 Parking Lot、全部 archived issues 或本轮新增面板区域的端到端验证。早期清理失败轮不计 Restore PASS。

### Shared Preset Role Composition

2026-09-08 当前结果：源码 b3f02c2 的完整 verify（86 files / 1143 tests）、角色双 Host 冷恢复、九角色部署（web_fetch 用户豁免）和默认五核心按顺序全部通过，所有 Restore PASS。Definition 只保留角色职责/原生引用/必要限制，模型差异由 Host agentModelOverrides 提供并由 DSH descriptor 恢复。同 tarball 九个独立 child 均真实加载自己的 Skill；GitHub/arXiv/Web 搜索、四次权限拒绝与会议状态不变通过。web_fetch 三项明确 skipped:user-waiver，保留为 Not Covered，不代表完整无豁免部署验收通过。完整证据及失败修复历史见 [Meeting Roles Deployment](./SMOKE-VALIDATION-EVIDENCE.md#meeting-roles-deployment)。下方作者基线与文档阶段记录属于历史边界。

2026-09-08 作者基线核验：源码 `299d3996c5938e5e8398cf592faad195835b964b`，分支 `codex/meeting-agent-role-description`，仅 docs/ 有本轮差异；Node v22.23.2、pnpm 10.7.0。逐项读取声明与安装 manifest，18 个 `@deepseek-ai/dsh-*` 包均为 0.1.2-rc.1；`pnpm --dir plugin verify:agent-definitions` 为 9 samples PASS；`pnpm --dir plugin exec vitest run tests/unit/role-composition tests/unit/config.spec.ts tests/unit/scripts/agent-definition-samples.spec.ts` 为 4 files / 35 tests PASS，均 exit 0。未安装或修改依赖，未改代码/测试，未执行完整 verify 或真实 Host 部署。这些结果只覆盖旧实现基线，不覆盖下述首发新目标。

2026-09-08 文档状态更新：已确认首发最终角色模型与九角色部署，见 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 和 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)。本轮仅修改文档，生产代码、测试、发行资源和部署入口未改；下列表格是旧模型的既有证据。新字段、Host map、九原生 Skills、同一会议九 Session、研究工具和新部署 patch 均为 Not Covered，不能据旧两角色 smoke 宣称已实现。

共享父 Preset 首版的正式语义见 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 与 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)。下列现存测试纳入上述源码基线完整 verify，路径相对 `plugin/tests/`。

| 验证范围 | 自动化证据 |
| --- | --- |
| 配置与共享能力 | `unit/role-composition/resolve.spec.ts`、`unit/config.spec.ts`、role-selection/request-idempotency、dsh-capabilities suites：数量/大小/未知字段/重复值和角色匹配、共享 Preset/Skill 只读预检、异步前后父 Preset 一致 |
| 创建与持久化 | session-adapter、meeting-runtime、domain schemas/repository suites：全部预检后才分配身份、末项非法零 child、中途失败 revoke/interrupt/drain；provisioning/active binding 不可变，failed put 不改读值，旧记录不回填 |
| 重放与公开边界 | runtime、status-projection、protocol-schema suites：ready/归档 receipt 重放不读取新配置，同 request 换 ID 冲突；status/archive 不泄露角色配置，错误信息脱敏 |
| 真实角色隔离与恢复 | [当前 role-composition smoke](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)：父 assembly/model route 不变、child persona/toolFilter/agentOptions 隔离、禁用工具 body 零调用；两个 Host 冷恢复保留 V1 descriptor/assembly/provider/model/reasoningEffort，即使第二阶段配置为 V2 |

原生 provider/model/reasoningEffort 配置及冷恢复已验证；独立 per-child Preset、独占 Skill、maxTokens 冷恢复、热切换、动态 admission、Browser 配置 UI 和真实模型任务质量未覆盖。Host Preset/Skill 部署变化不保证历史能力快照。早期 smoke 曾因目录链接安装无法解析 probe 依赖失败，改用 pack tarball 经 DSH plugin add 安装后通过；原失败轮清理成功，历史命令及逐步提交保留在 Git。

### Offline Meeting Protocol Preparation

可复用入口为 `plugin/tests/fixtures/offline-meeting-protocol.ts` 和 `plugin/tests/contract/offline-meeting-protocol.spec.ts`。fixture 使用固定时间及独立深拷贝，经生产 create/planning/context/submit 函数和 Schema 形成 Manager plan、A 提交及包含 A 消息的 B context/input；B 输入仅构造校验，没有执行 B 提交。现存 contract suite 纳入上述完整 verify。

| 验证范围 | 证据与边界 |
| --- | --- |
| 离线协议链 | Schema 合法输入、A→B 顺序、版本推进、A 消息进入 B context、独立 attempt/delivery、缺字段和纯文本回复拒绝、stale planning/未分配 Speaker 拒绝、fixture 可重复且深拷贝 |
| 引用与工具表面 | 区分 replyTo 字符串的 Schema 合法性与上下文引用匹配；检查生产注册器的工具名称、参数及 provisioning envelope，runtime/caller 不执行；固定正文不是模型输出 |
| 独立类型检查历史 | 2026-09-07，本地 macOS、Node `v22.23.2`、pnpm `10.7.0`、Vitest `3.2.7`；最终测试实现 `908c78178ea4cf95eb2525795a0c49ea83fff89f`、完整验证 HEAD `a8d2f12cc62d6e7ba5b0126912a5a5dfb5bfc5a5`，8 项 contract tests、两文件独立 strict tsc 及完整 verify 通过。此独立 tsc 结果仅属于该历史基线 |

历史独立类型检查命令（仓库根执行）：

```sh
pnpm --dir plugin exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --verbatimModuleSyntax tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts
```

仍待解决的观察：`src/dsh/provisioning.ts`（相对 `plugin/`）要求等待包含 `attemptId` 和 `deliveryId` 的请求后再写入，但 Manager context 使用 `planningAttemptId`，没有 own attemptId/deliveryId；contract suite 记录此差异。它是提示措辞与字段不一致的离线观察，不是模型失败复现，本次文档归并未修复产品。

Not Covered：真实模型自主协议、Session/caller/capability 执行、真实 B 回复、结束归档、repository commit/receipt/outbox、恢复及资源清理、UI 和 smoke 均不由该纯数据 fixture 证明。没有启动 Host/profile/端口；原真实模型闭环目标未完成，不能以离线测试替代。旧 hash、逐步提交及测试纠正流水保留在 Git 历史。

### Referenced Minutes

message-reference draft 的正式语义见 [Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft)。以下现存回归纳入上述源码基线完整 verify；路径相对 `plugin/tests/`，按能力压缩原 FR-10 固定映射和草稿矩阵。

| 验证范围 | 自动化证据与边界 |
| --- | --- |
| Schema、上下文与引用 | protocol-schema、speaker-attempt/speaker-submission suites：连续 coverage、有序引用子集；非法结构、scope 洞、未来/self/跨会议/私聊引用、混合合法非法引用整体拒绝；仅允许 delivered context 内正式消息 |
| 权限与原子提交 | tool-registration、meeting-runtime、domain-meeting-repository suites：caller/attempt/version/终态拒绝，message/event/receipt/outbox/version 无部分提交；冻结 tool arguments 在校验前复制，回归锁定嵌套 transform 不写回冻结输入 |
| 幂等与持久恢复 | runtime/repository suites：原 receipt 重放、hash conflict、撤权拒绝、commit 失败后重试、tail/checkpoint reopen、旧消息 metadata absent 兼容；非法结构拒绝读取 |
| 跨层可见性与归档 | status-projection、Client、domain/runtime archive suites：同一 committed message 经 status/context/HTTP/Client/archive 保留 metadata，刷新一致、无私有字段；按公开 own-property presence/值/数组顺序校验，归档篡改拒绝 |
| 非权威草稿与会议结束 | submission、archive、Client、continuation suites：草稿文字不创建 Decision/CompletionFact 或改变 objective/finalSummary，独立展示；Scribe 缺席/失败/替换不阻塞原 end/archive；续会不自动继承草稿或旧身份 |
| FR-10 既有隐私与生命周期 | repository shared behavior、status、runtime/archive、continuation suites：私聊独立状态与持久处理上界、公开投影白名单、正式事实/终止快照、revoke→drain→close 后归档、失败重试、显式选材续会与身份隔离 |
| 真实运行 | scribe-minutes-probe 与[当前普通 smoke](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation)：context、非法引用原子拒绝、重放、HTTP/归档一致和 Session drain；[两轮历史 Browser](./SMOKE-VALIDATION-EVIDENCE.md#referenced-minutes-browser)另记草稿标识、引用、刷新、结束和清理，不外推为本轮页面验收 |

邮件“发送后新增 transcript 再派发”的跨层动态场景目前 **Not Covered**；本次接受未变动派发源码与持久上界契约测试的组合证据，不称为 mail integration 已通过。该组合证据来自原专项基线，不表示后续派发实现从未变化。当前只支持 message 引用，Fact、Decision、task、文件及外部 research 的直接引用未实现；模型纪要质量、长期压力、遗留数据迁移和生产发布未验证。

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

## Archived Read Recovery Follow-up

归档且所有 ownership 均为 closed/revoked 时，本地冷读取跳过 live Captain 与 Session 对账要求；未归档或仍需清理的会议保留恢复检查。`meeting-runtime.spec.ts` 的真实 JSONL 归档回归增加 Runtime 重建后的列表和详情读取，并断言没有查询 live Captain 或调用 Session runtime。修改前复现 `RECOVERY_CAPTAIN_UNAVAILABLE`；修改后 runtime/session-recovery/diagnostics 三文件 79 tests、Host/Client typecheck、相关 eslint 与格式检查通过。

2026-09-08，在 `5491b5d` 加本修复的源码工作区执行完整 `pnpm --dir plugin verify`，exit 0，84 files / 1063 tests，format/lint/双端 typecheck/build/environment/contract/samples/package 全部通过。此追加验证不改写下方历史 verify/smoke 的源码基线；该修复未新增真实 Host 冷重启或 Browser 验收。

## Executed Validation

2026-09-08，在 Scope 所列升级工作区执行：

- `pnpm --dir plugin verify`：exit 0，84 files / 1082 tests；format、lint、Host/Client typecheck、build、environment、plugin contract、9 Definition samples 和 package 全 PASS。
- `pnpm --dir plugin smoke:profile --all`：exit 0，16/16 场景 PASS，156717ms，一次构建；每场景 Restore 均 PASS。
- 最后两处 smoke 探针调整后，`pnpm --dir plugin exec vitest run tests/unit/scripts`：7 files / 143 tests PASS；对应 ESLint、Prettier 和 `git diff --check` PASS。完整 verify 后生产代码未再修改。
- 能力采用、失败轮修复及未验证边界见 [DSH Capability Integration Evidence](./DSH-CAPABILITY-INTEGRATION-EVIDENCE.md)。

### Historical Alignment Validation

以下记录属于 `6679403fc8cb6de01db1c7d2fb190d3a9484dd73` / `codex/align-code`、DSH `0.1.1-rc.2`、Node `v24.19.0` 的历史工作区，不是当前升级基线。

2026-09-08，在该历史源码工作区执行：

- `pnpm --dir plugin install --frozen-lockfile`：补齐已锁定的两项 DSH 依赖，manifest/lockfile 无变更。首次 verify 因本机缺依赖未过 Host typecheck，恢复后最终 verify 通过。
- `pnpm --dir plugin verify`：exit 0，84 files / 1063 tests，Vitest 69.29 秒；format、lint、Host/Client typecheck、build、environment、plugin contract、9 Definition samples 和 package 全 PASS。
- `pnpm --dir plugin smoke:profile --all`：exit 0；16/16 PASS，156709ms，一次构建；每场景 Restore 均 PASS，详见 [历史 smoke 结果](./SMOKE-VALIDATION-EVIDENCE.md#historical-alignment-baseline-validation)。
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

已移除收敛 selector 的历史结果见 [Convergence Smoke](./SMOKE-VALIDATION-EVIDENCE.md#retired-convergence-scenario-evidence)；其余专项验证索引已按能力归入上文，实际 Browser 记录集中于 Smoke Validation Evidence 并保留各自基线。

## Not Covered

- 当前 Browser 操作、真实 LLM 请求、模型自动主持/参会/纪要质量均未执行。已注入 provider 凭据和真实 Session 创建不构成模型请求成功。
- 完成/调度偏差已修复，Session 恢复的真实故障注入、新面板 Browser 和观测系统边界仍开放；FR-13 动态接纳和 research dedup 尚未实现。
- 时间预算的真实完成边界、blocking Position 的真实 DSH 反例、mail snapshot 后新增 transcript 的完整跨层重试组合未独立执行。
- stress/长期 soak、memory/FD 与容量预算、一般资源泄漏、完整 metrics、生产发布和高版本兼容未验证；`test:stress` 仍是明确输出 Not Covered 的占位入口。
- V1 仍限单本地 Host/单用户；远程、多用户和跨 Host 不是待本次补齐的实现缺口。

## Closure

DSH `0.1.2-rc.1` 升级、公开 API 适配、原生角色模型配置和生命周期组合已落地，完整 verify 与 16 个真实 smoke 场景通过；本轮实现已提交，尚未推送或发布。Session 恢复、身份替换、面板事实与诊断已有对应实现和回归。未执行的故障注入、Browser、模型与完整 metrics 仍以 Not Covered 保留；FR-13 等后续功能不在本轮完成范围。不得描述为全部需求或生产发布就绪。
