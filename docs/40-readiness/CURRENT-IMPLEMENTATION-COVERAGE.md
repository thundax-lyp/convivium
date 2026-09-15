# Current Implementation Coverage

## Read This First

本文件按已确认的功能点记录当前 checkout 的真实实现状态。状态中的“已有”只表示源码中存在对应的旧能力；除非同时标为“已对齐”，否则不能作为当前 Interface 与 Design 的实现完成证据。

本轮基线是设计契约提交 44e27f4。目标领域模型已落入 source：新聚合使用标准名 `MeetingState`，旧模型显式改名为 `LegacyMeetingState`、`LegacyRiskLevel`。本轮已执行完整 verify（含编译、测试与 build）；没有执行 smoke、真实 DSH profile 或 Browser 验收。现有测试证明旧实现未因改名回归，不证明目标模型已有 transition 行为。

| 状态 | 含义 |
| --- | --- |
| 编译通过 | host 与 client 可以完成 TypeScript noEmit 检查；不证明任何业务行为。 |
| 部分已有（旧模型） | 可找到相关旧源码，但数据模型、接口或不变量没有按当前契约核验，实施时须改造或替换。 |
| 未具备（目标实现） | 当前契约要求的模型或流程没有实现覆盖。 |
| 未验证 | 可能存在源码或历史资产，但本轮没有执行能证明其行为的验证。 |

## Functional Coverage

| 功能点 | 当前已具备的源码事实 | 当前契约还缺什么 | 状态 |
| --- | --- | --- | --- |
| 插件编译与装载基础 | plugin package 提供 host/client TypeScript 工程与 typecheck script。 | 编译不验证 DSH 装载、配置解析或运行时行为。 | 编译通过；运行时未验证 |
| 目标领域模型与命名 | domain/meeting-state-v1.ts 以标准名 MeetingState 声明目标聚合、全部持久实体与值域；旧模型改为 LegacyMeetingState/LegacyRiskLevel，避免与目标契约同名。 | 目标 MeetingState 的结构校验、引用校验、纯 transitions 和拒绝结果尚未实现；旧 runtime 仍只调用 legacy model。 | 部分具备（类型固定） |
| Meeting 生命周期与本地控制 | domain/model.ts 有 legacy MeetingStatus；runtime 的 meeting-control.ts 有暂停、恢复、结束等旧控制路径。 | 以 MeetingState、MeetingActionV1 与当前 transition 表定义的状态、拒绝码、版本前置条件重建；逐项测试。 | 部分已有（旧模型） |
| Meeting 隔离、Session ownership 与冷恢复 | 有 session-ownership、meeting-recovery-service 等旧实现路径。 | 当前 Meeting 归属、重绑、关闭回执与恢复不变量尚未映射到新聚合和 Repository commit。 | 部分已有（旧模型） |
| Round、同轮隔离、Contribution 与 Publication | 旧模型使用 Turn、SpeakerAttempt、TurnSubmission；存在 turn-advancement 与 speaker-attempt transitions。 | Round、Contribution、同轮公开基线、轮末 Publication 以及禁止中途互见均未实现。 | 未具备（目标实现） |
| EvidencePackage 与 Review | 旧 protocol 有 save_evidence。 | EvidencePackage、审核状态、reviewer 动作、引用约束和审核后可见性没有当前实现。 | 未具备（目标实现） |
| 补充举手与 Manager 接受 | 旧流程可推进 turn。 | Review 后 participant 重新举手、Manager 显式接受、生成补充工作项的完整流程不存在。 | 未具备（目标实现） |
| Agenda、ManagerPlan 与轮次安排 | 有 manager-planning 和议程候选相关旧代码。 | ManagerPlan 的输入、输出、校验、fallback 及其与 Round 的确定性衔接尚未按新定义实现。 | 部分已有（旧模型） |
| Proposal、DecisionCandidate、Risk 与本地裁决 | 有 meeting-decision 和风险/候选相关旧路径。 | 当前 candidate、accept/replace/revoke、risk disposition、authority、evidence 与审计事实的结构和语义未对齐。 | 部分已有（旧模型） |
| 完成声明与收敛 | 有 completion 和收敛相关旧逻辑。 | CompletionDeclaration、CompletionFact、收敛与业务完成的区分、终止依据及其不可变审计尚未实现。 | 部分已有（旧模型） |
| MeetingTask、授权与 reassign | 有 meeting-task、reassign-turn 及相关 application service。 | 新 MeetingTask 的授权主体、领取/完成/失效、reassign 的精确前置条件与拒绝结果未实现。 | 部分已有（旧模型） |
| PrivateMail | 有 meeting-mail application service。 | 该服务明确返回 UNSUPPORTED_CAPABILITY；PrivateMail、serial gate、收件人隐私投影和恢复语义均未实现。 | 未具备（目标实现） |
| Repository、幂等提交、outbox 与归档 | 有 storage/domain、请求幂等和归档相关旧路径。 | 新 MeetingState 原子 commit、outbox、commit fact、archive lifecycle、Session close receipt 与失败恢复没有实现覆盖。 | 部分已有（旧模型） |
| Continuation | 有 continuation-selection 等旧归档续会代码。 | ContinuationInput、ContinuationProvenance、材料选择规则和新会议身份隔离尚未按当前接口实现。 | 部分已有（旧模型） |
| Remote DTO、刷新与 Client projection | 有 remote、client、meeting-refresh-feed 和 Markdown projection 等旧路径。 | MeetingViewV1、字段过滤、版本刷新、动作回执及 Developer Markdown 的当前 DTO 契约未实现。 | 部分已有（旧模型） |
| Role Definition、Catalog 与 Preflight | 有角色组成与 catalog 相关旧资产。 | dshPresetId、requiredSkillNames、descriptor、admission/preflight、权限边界和恢复后的角色一致性尚未按 DSH Role Interface 实现。 | 部分已有（旧模型） |
| 新契约自动化测试 | 已执行 legacy test suite：90 files、961 tests 通过。 | 每个 MeetingActionV1、关键 transition、恢复、隔离、拒绝路径和 Remote projection 都缺与当前契约一一对应的确定性测试。 | 旧回归通过；目标测试未具备 |
| 真实 DSH 与 Browser 验收 | 仓库保留历史 smoke 操作说明和脚本。 | 当前 Round/Contribution/Review/PrivateMail/Role 契约从未在真实 DSH profile 或 Browser 中验证。 | 未验证 |

## Implementation Gap

当前最小实现缺口不是补旧测试，而是先建立可替代 legacy Turn/SpeakerAttempt 的新领域核心：MeetingState、Round、Contribution、EvidencePackage、Review、Publication、MeetingTask 与受控 transitions。随后把 Repository 原子提交、幂等、outbox、Session ownership 和归档接到该核心；最后接入 DSH adapter、Remote DTO、Client projection、角色 preflight 与真实运行验证。

旧实现不要求兼容：当前设计没有承诺对 Turn、SpeakerAttempt、旧协议字段或旧归档格式作迁移读取。因此在新切片中保留旧模型会形成双重事实源，应在对应替换完成时删除旧路径，而不是增加适配层。

## Executed Validation

| 日期 | 范围 | 执行方式 | 结果 |
| --- | --- | --- | --- |
| 2026-09-15 | source tree 与 package scripts | 只读文件清点、symbol 搜索、package script 检查 | 确认核心仍是 legacy Turn/SpeakerAttempt 模型；上表的“部分已有”不构成新契约覆盖。 |
| 2026-09-15 | target Domain type model | 将目标聚合与实体图加入 domain，并将 legacy 同名类型改名 | PASS：目标 MeetingState 占用标准公开名；未执行 target transition 或行为测试。 |
| 2026-09-15 | plugin host/client TypeScript | pnpm --dir plugin typecheck | PASS：host 与 client noEmit typecheck 通过；client 检查中完成 generate:typert。 |
| 2026-09-15 | plugin 全量工程验证 | pnpm --dir plugin verify | PASS：format、lint、host/client/remote-test typecheck、90 files/961 tests、build、environment、contract、agent definitions 与 package checks 通过。 |
| 2026-09-15 | 文档工作区 | git diff --check | PASS。 |
| 2026-09-15 | 本地 Markdown 文件目标 | node .github/scripts/check-doc-links.mjs | PASS：427 checked，0 errors。 |

## Explicitly Not Covered

- 新 MeetingState 的结构/引用校验、纯 transitions、单元测试、集成测试、恢复测试、smoke、真实 DSH profile、Browser 与真实模型行为均未执行。
- 旧 smoke 或 operations 文档中的历史通过记录，仅说明旧基线曾运行；不能证明本文件列出的目标实现。
- 性能、并发压力、迁移、旧数据兼容、远端文件系统和发布均不在当前阶段承诺中。

## Closure Rule

在本阶段，可声明的是“现有工程 verify 通过”与“目标领域类型已固定”；两者都不证明目标领域行为。某功能点只有在实现与对应 Interface/Design 对齐、相关确定性测试通过，并在需要时完成真实 DSH 验收后，才能从上表移入“已对齐”。

相关依据：[Domain Design](../30-designs/DOMAIN-DESIGN.md)、[Meeting Design](../30-designs/MEETING-DESIGN.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。
