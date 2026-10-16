# RUNBOOK: ACP Codex Reviewer And Web Analyzer

## Status And Execution Entry

2026-10-16；Execute；契约迁移 A1–A3、配置角色 C1–C7 与 provider P1–P5 已通过，D1–D5 与 D4a 已通过，E1 官方环境预检与 build 已 PASS；E2 只读采证入口已补齐；Captain 创建与 Host 统一消费临时 Definition 快照，角色解析验证已通过；STORAGE_UNAVAILABLE 已定位为首发前原 ACP 空会话 reload 失败；先修复 warm activation，再继续 E2，下一入口 E2。执行分支 `codex/acp-acceptance`，基线 `69ff4424`（PR #134 已合并，工作树干净，核对时 HEAD 与 origin/main 一致），仅使用普通分支，不创建 worktree。P 阶段已随 PR #133 合并；既有 P 阶段复核 ACP 聚焦 7 文件、48 项测试、Host typecheck 和 lint 通过（lint 有两条现存长度警告）。插件生命周期、owner/dispatcher、Reviewer worker 和诊断已完成确定性接线；E1 已通过（bridge 1.11.0、Codex 0.161.0、默认 gpt-6.1-sol/low）；E2 真实验收与 E3 全组收口尚未完成。

本文件是本组短入口与共同契约，没有独立机械步骤。执行时读取本入口、当前册和它引用的正式来源，逐册顺序执行，不能并行跳步；不要求每次加载全部后续册。

| 顺序 | RUNBOOK                                                | 步骤 / 文件预算              | 交接门禁                               |
| ---- | ------------------------------------------------------ | ---------------------------- | -------------------------------------- |
| A    | [契约迁移](./RUNBOOK-ACP-CODEX-CONTRACTS.md)           | 已迁移 / 无剩余任务          | 正式依据齐备，完整迁移后删除草稿       |
| C    | [配置与角色](./RUNBOOK-ACP-CODEX-CONFIGURATION.md)     | 已实现 / 无剩余任务 | Definition/快照/八角色资源聚焦验证通过 |
| P    | [ACP provider](./RUNBOOK-ACP-CODEX-PROVIDER.md)        | P1–P5 / 9、5、4、9、3        | 连接/MCP/技术存储/确定性恢复通过       |
| D    | [会议接线](./RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md) | 已实现 / 无剩余任务        | 身份/投递/审核/可见阻断通过            |
| E    | [验收与收口](./RUNBOOK-ACP-CODEX-ACCEPTANCE.md)        | E1–E3 / 4、10、9              | 官方预检、真实专项、完整门禁、删除六册 |

## Scope And Invariants

自研Codex专用provider注册acp-codex，禁止安装dsh-acp-adapter，仅参考机制；允许官方codex-acp。Definition.agentOptions为唯一新建选择，退役外部overrides；不可变准入快照/descriptor到期不变。Reviewer独立主Session选择Codex，worker仍spawn且模型默认继承；Web独立Session使用Host默认模型。支持正常空闲点原会话冷load；未知结果持久阻断，不重发/空白重绑，真实deadline继续。

业务链：创建→五平级Session→Web搜索/读取→Evidence→Reviewer ACP→MCP原DSH caller→spawn structured_output→原Runtime提交Review→发布→安全暂停/冷load→第二轮→撤权归档。

Non-goals：通用ACP平台、其它Agent/Teams、原生Codex子Agent投影、自动恢复未知/人工清锁、热换已有会议模型、凭据UI、长会话压缩认证、生产动态Catalog producer、远程多用户、物理存储迁移、固定人工环境部署、提交/发布/合并。

身份/claim/version/capability不放宽；worker无Meeting ownership；技术记录不是第二份Meeting事实源。先持久发送门禁再prompt，receipt/flush/正式事实分别证明；outbox lease不授予重发权。独立cwd不是OS隔离，DSH工具权限不代表接管Codex全部原生工具。

## Executor Contract And File Budget

- 2026-10-16 用户追加授权先核查受控只读入口，缺失时新增最小验收入口并修订 E2/白名单，审计通过后单独提交，再继续 E2→E3。入口修复固定 10 文件见 E 册；不改变真实用量授权。2026-10-16 用户授权先治理 RUNBOOK 漂移，再按 E1→E2→E3 串行 Execute，并授权真实模型测试用量。使用普通独立分支 `codex/acp-acceptance`；治理修订单独提交，每步 PASS 后删除 E 册对应任务段落、更新总入口与 E 册状态并单独 commit。未授权 push/PR/merge；不 git clean/reset，不改固定人工 dsh-workspace。E1/E2 的两份 RUNBOOK 状态更新计入各步白名单与预算；E3 删除六册。
- **每步实际仓库交付文件变更2–10个**；源码、测试、文档、lockfile、新增和删除全部计数，rename按旧/新两路径计。清单是固定允许上限，不是可顺便改动的文件池。相同文件在不同步骤再次修改分别计入；不得以拆补丁、先临时文件再搬回绕过计数。
- ignored构建物与仓库外临时profile/脱敏日志不计为交付文件，但必须执行Restore；不能把它们拿来凑2个。生成声明只由指定build/generate脚本更新，若出现新的非ignored交付文件也计入并须在清单内。
- 每步前记录工作树文件内容快照，完成后按**该步前后内容差异**列实际路径（包括当时已存在的未跟踪文件），与白名单/2–10核对；不能用相对HEAD累计diff当本步计数。范围外变化、实际不足2或超过10均STOP，由作者调整步骤，不人为改无关文件凑数。
- 验证/分支/预检/真实运行是所属文件变更步骤的子动作，没有独立零文件步骤。步骤依赖是已运行PASS，不能只看文件存在或上一册声明Executable。
- 核心行为按TDD RED/GREEN，环境/导入失败不算行为RED；步骤中间状态不部署、不宣称完整功能。新目录入口只导出已存在符号，遵守Architecture Rules。

## Authority And Migration Lifecycle

必读 [Architecture](../00-governance/ARCHITECTURE.md)、[Architecture Rules](../00-governance/ARCHITECTURE-RULES.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[Test Rules](../00-governance/TEST-RULES.md) 与当前册的requirements/interfaces/designs；RUNBOOK不是产品真相源。

长期依据已迁入 [Architecture](../00-governance/ARCHITECTURE.md)、[Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)、[Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)、[ACP Execution Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)、[Peer Meeting Agents Design](./PEER-MEETING-AGENTS-DESIGN.md) 与 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md)。草稿及 A 册 Migration Input 已删除，后续只消费这些正式来源。长期实现证据迁 readiness、操作迁 operations；六册文件仍按 E3 全局门禁删除，本次只逐项删除已完成任务段落，不提前改变六册生命周期。

## Current Breakpoints And Verification Map

| 当前 owning path / symbol                                                                                            | 现状与固定目标                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| plugin/src/plugin-entry.ts::apply / meetingConsumerPlugin                                                            | 已接入可选 ACP：启用先注册 provider/技术 domain，再 activateTargetMeetingApplication；缺省保留原路径 |
| plugin/src/config.ts::Config                                                                                         | 已删除外部 agentModelOverrides，已实现可选 acpCodex 严格连接配置                                          |
| plugin/src/role-composition/model-options.ts::resolveEffectiveAgentOptions                                           | 已按完整选择解析，不逐字段合并                                                                                    |
| plugin/src/role-composition/resolve.ts::definitionHash                                                               | 已显式枚举原身份字段，排除 agentOptions                                                         |
| plugin/src/role-composition/dsh-capabilities.ts::preflightMeetingIdentity                                            | 已使用解析后选择并固化 reasoning                                                |
| plugin/src/dsh/meeting-agent-owner.ts::createMeetingAgentOwner / deliverToHandle                                     | 已接入 setup/ACP 持久交付门禁及冷恢复，无 ACP wake；非 ACP 原路径保留                           |
| plugin/src/runtime/services/evidence-review-dispatch.ts::createEvidenceReviewDispatcher                              | 已优先核对正式 Review/真实 deadline，未知阻断不误结算                                    |
| plugin/src/runtime/services/meeting-notice-dispatch.ts::createMeetingNoticeDispatcher                                | 已保留贡献事实及真实期限，未知只重核对、不重投或计失败                                                            |
| plugin/src/tools/register-tools.ts::registerReviewWorkerTool                                                         | 已接入原生 spawn/claim 复用与 root 阻断，保持 schema/权限                                 |
| plugin/src/runtime/meeting-lifecycle.ts::activateTargetMeetingApplication                                            | 装配 owner/dispatchers/read；显式传入可选 CodexAcpProvider，不读取虚构 ctx.acpRecovery                  |
| plugin/src/protocol/meeting-view.ts::MeetingViewSchema                                                               | 已提供 executionBlocks 安全投影与同 version 刷新，不写领域事实                                             |
| plugin/src/role-composition/model.ts / role-skills/role-skill-names.ts / repository/storage-domain/format/schemas.ts | 八角色/六能力资源与持久闭集已实现                                                            |
| plugin/scripts/smoke-profile/index.mjs::writeSmokePatch / runScenario                                                | 仍写旧 overrides；按临时 Definition 迁移，加独立显式 ACP 专项                                           |

| 不变量/范围                       | owning步骤与证据             |
| --------------------------------- | ---------------------------- |
| 配置/hash/原子准入/TTL            | C1–C4 聚焦测试，C7集合复验   |
| Web资源/权限/持久role闭集         | C5–C7 资源与Host组合         |
| 连接/真实caller/structured/反重放 | P1–P4、D2/D4                 |
| crash/冷恢复/未知/真实deadline    | P5、D2–D4；不自动续执行      |
| 诊断投影/现有用户控制             | D5；不改领域version          |
| 实际Codex/Web/第二轮/归档         | E2真实lane                   |
| 全局回归/长期证据/删除            | E3完整verify+原三lane+E2证据 |

## Failure, Completion And Author Audit

每步PASS含命令退出0、可观察断言及文件预算。失败记录最后PASS、文件/symbol、原命令/输出和所需决定；只停止本次进程/lease/临时profile，保留原Meeting/outbox/claim/技术门禁，不删除unknown以“恢复”。不回滚用户工作，不放宽门禁；清理失败单独报告。

阶段完成只交接下一册，不单独删除RUNBOOK。全局完成须所有scope与固定验证集合齐全、正式长期来源无遗漏、Not Covered准确；E3一次删除六册并做删除后检查，失败恢复。真实外部运行适用；跨用户/发布/物理介质迁移/UI重设计Not Applicable，其它OS、生产Catalog和长会话压缩Not Covered。

A1–A3 与 C1–C7 的既有证据保持原边界；P1–P5 已实现，任务段落已删除，确定性复核证据见 Current Implementation Coverage。D1–D5 与 D4a 已执行 PASS，任务段落已删除；E1 已执行 PASS；E2/E3 尚未执行，其 Executable 只代表计划决策完备。真实 Codex/互联网专项未执行。
