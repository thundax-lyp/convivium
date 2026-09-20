# Current Implementation Coverage

## Scope And Status

本文件只记录当前 checkout 可由生产入口与验证证据证明的功能覆盖，不以设计、协议类型或 command core 的存在代替已交付能力。

当前基线为插件版本 `0.1.0-alpha.1`、2026-09-20 合并的 PR #89。矩阵中的版本证据只记录形成、接入 target runtime 或后续收口该能力的 PR 编号；当前仓库没有对应 release tag。状态含义：

- `已实现`：已有目标生产入口，并有自动化验证覆盖主要契约。
- `部分实现`：已有部分运行链或内部实现，但仍缺正式入口、必要子能力或完整运行证据。
- `未覆盖`：当前 target activity graph 没有实现，或没有足以声明覆盖的证据。

## Feature Coverage

| 需求编号 | 功能 | 状态 | 版本证据 | 当前覆盖 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| MO-FR-1 | DSH 插件加载与版本门禁 | 已实现 | PR #60、#88 | 插件注册、环境检查、Host integration 与 package contract 已进入 `verify`。 | 未覆盖跨 DSH 版本兼容。 |
| MO-FR-2、MO-FR-14 | 会议创建与初始身份隔离 | 已实现 | PR #86、#89、#90 | `convivium_create_meeting` 使用 Captain parent 创建七个独立、meeting-owned continuable Sessions；Definition、Preset、Skill 在首个 child 创建前预检；真实 business-loop 已完成 archive 与 cold reopen。 | Browser 人工验收未执行。 |
| MO-FR-3、MO-FR-4；ER-FR-1～7 | 证据轮次与公开 | 已实现 | PR #81、#87、#88 | `open_round`、举手处置、Evidence 提交、独立 review、批量 review 提交与 `publish_round` 已形成同一 target command/outbox 链；自动化 business-loop 覆盖轮末统一公开。 | Browser 人工验收未执行。 |
| ER-FR-6、ER-FR-7 | Contribution 关闭与期限处理 | 部分实现 | PR #86、#89 | `close_contribution` 已有 protocol、Domain 与 command core。 | 无 Agent tool；无 target deadline scanner。 |
| MO-FR-5；ER-FR-2、ER-FR-8 | 举手与异步 MeetingTask | 部分实现 | PR #11、#81、#88 | `raise_hand` 与 Manager 的 `dispose_hand_raise` 有生产 Agent tool；MeetingTask 状态、授权和命令逻辑存在。 | MeetingTask 没有 target Agent tool/dispatcher 的完整生产入口证据。 |
| MO-FR-6 | 议题范围、Question、Issue 与 Agenda candidate | 部分实现 | PR #80、#89 | 状态模型、授权、原子 transition 与 caller-filtered projection 已有自动化测试。 | 结构化记录和处置未暴露为 target Agent tool；不能用自然语言或 local control 替代。 |
| MO-FR-7 | Proposal、Position 与 Decision | 部分实现 | PR #55、#84、#89 | Domain/command contract、Captain/local 可见的 candidate/decision projection，以及 loopback decision controls 已实现并测试。 | Participant/Captain 的完整 target Agent command surface 尚未接入。 |
| MO-FR-8 | Risk 与 Completion | 部分实现 | PR #55、#84、#89 | 风险处置、完成声明/事实和确定性完成重算已有 Domain/command tests；loopback risk control 已接入。 | Agent 侧结构化入口不完整；未取得端到端完成路径 smoke。 |
| MO-FR-9、MO-FR-11 | 暂停、恢复与结束 | 部分实现 | PR #80、#88、#89 | loopback Remote 与面板使用同一 command path 支持 `pause_meeting`、`resume_meeting`、`end_meeting`。 | Captain parent 的自然语言 pause/resume 入口及正式 caller binding 尚未实现。 |
| MO-FR-10 | 私信 | 部分实现 | PR #83 | Private mail 的状态、权限、deadline 和 serial gate 已进入协议与 command core。 | target dispatcher、deadline handler 与 Agent 生产入口没有完整覆盖证据。 |
| MO-FR-11 | 状态读取与面板 | 已实现 | PR #87、#88、#89 | Meeting list/detail、schema-backed DTO、caller-filtered projection、刷新通知和面板只读展示共用已提交状态；Captain/local 专属数组不会暴露给普通 Participant。 | Browser 人工交互与断线恢复验收未执行。 |
| MO-FR-12 | Agent 内部能力边界 | 已实现 | PR #87、#88、#90 | reviewer 对每个 immutable version 只派发一个 one-shot worker，只提交 completed 且可规范化的非空子集，失败项保持待审；caller authority 与公开提交边界已接入 target runtime，并由正式 Meeting facts 隔离内部执行过程。 | 不证明任意第三方 Tool/MCP 的生产可用性。 |
| MO-FR-13 | 动态身份推荐与准入 | 已实现 | PR #82、#89 | `convivium_recommend_identity` 覆盖 Catalog snapshot 校验、Definition provenance、capability preflight/composition、durable ownership、既有 child recovery、跨 Agenda 复用及终态竞态清理。 | 自动 research freshness/source-scope 去重未实现。 |
| MO-FR-10 | Archive 与冷恢复 | 已实现 | PR #86、#87、#88、#90 | partial termination、archive materialization、Session closure、SQLite reopen 与 caller-filtered archive view 有自动化覆盖；PR #90 修复 ownership closure、端口释放竞态与 Reviewer 提交阻塞后，真实 business-loop 已通过 `archived` 和 cold reopen。 | Browser 人工验收未执行。 |
| MO-FR-10 | Continuation | 部分实现 | PR #26、#89 | create schema、按值复制的 continuation material 与引用剥离规则已实现并测试。 | 未取得从真实 source Archive 选择材料到新会议的完整运行证据。 |
| MO-FR-14 | Meeting Agent Definition | 部分实现 | PR #56、#82、#89、#90 | 七个发布 Definition/Skills、共享 Preset、hash 固化、role/tool/Skill composition 和 recovery invariants 已通过自动化验证；真实 Loader/profile business-loop 已完成 Reviewer batch、archive 与 cold reopen。 | GitHub/arXiv 角色的真实能力验收尚未取得。 |
| MO-FR-15 | Developer Markdown Projection | 未覆盖 | PR #46、#88 | PR #46 的旧实现已随 target cutover 移除，无当前 target 实现。 | `current.md`、`archive.md` 的 best-effort projection 尚未实现；旧 legacy projection 不构成该需求的当前覆盖。 |

生产 Agent command surface 当前仅包括：`convivium_create_meeting`、`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`、`convivium_raise_hand`、`convivium_submit_evidence`、`convivium_submit_review_batch`、`convivium_recommend_identity`。loopback local controller 是独立入口，不得据此推断 Agent 已获得同等 command surface。

## Validated Contract

- `MeetingState`、target codec、`DomainMeetingRepository`、command application、DSH tools、loopback Remote、caller-filtered view、outbox 与 archive lifecycle 使用同一 `meetingId` namespace。
- 创建、状态变更、read projection、identity provisioning/recovery、review delivery、round publication 与 archive 均从同一已提交状态派生。
- command 边界覆盖协议校验、caller ownership、权限、expected version、request idempotency、原子 commit、终态拒写与 storage recovery。
- `RECOVERY_UNAVAILABLE` identity effect 保持 pending retry；进入终态的并发路径不会激活新身份，并清理已创建但未激活的 Session。
- target runtime 不依赖 legacy Domain、protocol 或 runtime surface；Storage Domain adapter、repository core 与必要 projection helper 仍是当前实现的一部分。

## Executed Validation

| 日期 | 版本/环境 | 方法 | 结果 |
| --- | --- | --- | --- |
| 2026-09-20 | `afa860b` 后的本地 plugin workspace，重设计后的 smoke wrapper | `CONVIVIUM_SMOKE_SCENARIO=identity-admission pnpm --dir plugin smoke:profile --json` | PASS（约 9s）：真实 DSH Host 加载 target Role catalog 与 `verification-review` 原生 Skill，创建并清理独立 child Session，wrapper Restore PASS。 |
| 2026-09-20 | 同上 | `CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir plugin smoke:profile --json` | FAIL：Reviewer 的 `convivium_submit_review_batch` 调用把顶层 `input` 传为 string，Host 返回 `INVALID_ARGUMENT`，因此未提交 worker review batch；wrapper 已清理临时 profile。未取得当前 business-loop 的 publish/archive/cold-reopen 证据。 |
| 2026-09-20 | `afa860b` 后的本地 plugin workspace | `CONVIVIUM_SMOKE_SCENARIO=parallel-contribution pnpm --dir plugin smoke:profile --json` | FAIL：放宽 `dev.env` 后真实 DSH Host 已启动，但 probe 仍调用已移除的 `convivium_create_meeting`，返回 `unknown tool`；wrapper 已清理临时 profile。未取得当前目标命令面上的 DSH/SQLite/Restore smoke 证据，需重写该场景的 command 输入与断言。 |
| 2026-09-20 | PR #90 working tree，本地 plugin workspace | `pnpm --dir plugin verify` | PASS：format、lint（0 errors、20 existing warnings）、typecheck、106 files / 1252 tests、build、environment、contract、7-role Definition 与 package。 |
| 2026-09-20 | PR #90 working tree，DSH `0.1.2-rc.1` | Reviewer `1.2.2` focused `meeting-business-loop` | PASS（68.4s）：短三步中文提示词以 `submit.toolArguments` 固定原生参数层级；创建七角色会议、提交两份 Evidence、Reviewer 各派发一个 one-shot worker 并一次 batch 提交、publish、archive、Restore 与 cold reopen 全部通过。 |
| 2026-09-20 | PR #89，本地 plugin workspace | `pnpm --dir=plugin verify` | PASS：format、lint（0 errors、20 existing warnings）、typecheck、build、environment、contract、7-role Definition、package；106 files、1251 tests。 |
| 2026-09-20 | PR #89，GitHub CI | Governance、Plugin Format、Plugin Lint、Plugin Typecheck、Plugin Test、Plugin Build、Package Contract | PASS：7 项检查全部通过。 |
| 2026-09-20 | PR #89 recovery/domain change set | focused outbox/identity recovery、identity lifecycle race、domain/provisioning regressions | PASS：2 files/19 tests、10 contract tests、5 files/193 tests。 |

## 未覆盖范围

除矩阵中逐项列出的缺口外，当前证据不覆盖：

- Browser 人工交互、性能与并发压力、长期运行及跨 Host；
- 发布流程、生产外部网络、远端文件系统；
- 旧 snapshot migration、跨版本 compatibility；

## Closure

当前可以声明 Meeting target runtime 已完成单一活动链切换，并对会议创建、证据轮次、状态读取、动态身份准入、持久化恢复和归档核心路径形成自动化覆盖。只有标为 `已实现` 的行可作为当前功能覆盖结论；`部分实现` 与 `未覆盖` 必须保留为交付缺口，不能由相邻 Domain 类型、测试 helper 或旧 legacy 实现推断为可用。

相关依据：[Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)、[Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)、[Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。
