# Current Implementation Coverage

## Scope And Status

本文件只记录当前 checkout 可由生产入口与验证证据证明的功能覆盖，不以设计、协议类型或 command core 的存在代替已交付能力。

当前 checkout 基线为插件版本 `0.1.0-alpha.1`、DSH `0.2.0-rc.2`；当前工作分支 `codex/domain-dead-code-boundary` 已包含 `6daa47ec`、`0bfe6346` 的轮次补证与历史展示退役，尚未作为主线或人工环境验收。2026-10-12 核对的主线基线为 `1d9e09c3`，当时本地 `main` 与刷新后的 `origin/main` 一致。PR #106～#116 均已通过 merge commit 进入主线，包含 `6880f067` 的 rc.2 业务修复、会议界面、事件日志与时间线、会议删除及其修复，以及旧时间线兼容退役。合并状态不代表人工环境已部署该基线，也不替代对应运行验证。矩阵中的版本证据优先记录形成、接入 target runtime 或后续收口该能力的 PR 编号；实际验证日期、环境和命令由 Executed Validation 记录。该主线基线没有对应 release tag。状态含义：

- `已实现`：已有目标生产入口，并有自动化验证覆盖主要契约。
- `部分实现`：已有部分运行链或内部实现，但仍缺正式入口、必要子能力或完整运行证据。
- `未覆盖`：当前 target activity graph 没有实现，或没有足以声明覆盖的证据。

## ACP Native Execution Migration

2026-10-16，普通分支 `codex/acp-acceptance`，以 `69ff4424` 为原始基线。ACP Agent 只使用自身原生工具和 Skills；Host 负责会议上下文、逐版本 worker、完整 JSON 校验与正式 Review 提交，见 [ACP Interface](../20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md#reviewer-and-worker)。旧 MCP bridge 已退役，下文旧 MCP 结果仅作为历史证据。

已实现 H1–H5：取消 RPC 等待原 prompt 结算；原生执行边界；宿主审核适配；必需服务装载修复；恢复后向当前 Manager 发出不携带 agendaId 的持久 `meeting_resumed` 通知。H5 原始提交 `c920a4ab`（历史整理前），四个聚焦测试文件43项通过，Host typecheck、lint、format、build 与文档检查通过；覆盖同事务幂等、stale/conflict、权限拒绝、同 deliveryId reopen 与 unknown 零重放。确定性测试不证明实际模型恢复续行。

真实冒烟：DSH `0.2.0-rc.2`、codex-acp `1.11.0`、Codex `0.161.0`，Reviewer 使用 `gpt-6.1-sol` / `low`。会议 `meeting-bcdce35f3f2bfa6ce39e380d10353a52` 实际完成一轮、3条 Evidence、3条合法 Review 和一次发布；五个独立身份，宿主接受的 worker 审核与持久事实对应。只读末次记录为 version26 / running，四个 ready binding、十个 committed request；Host 已停止。原临时现场、Session、checkpoint 及失败日志保留，不重放已消费输入。多次隔离尝试不累计为同一会议多轮。

Web 实际 search 已执行；正文 fetch 因非公网 DNS 解析被 SSRF 门禁拒绝，记录 `WEB_BLOCKED_URL`，没有正文成功或内容哈希证据。按用户决定，底层 DNS 属于环境边界，不修复网络或放宽 SSRF。

本次收口验证：公开只读验收入口已纳入精确导出契约检查，`pnpm --dir plugin verify` 完整通过：format/lint/typecheck、103个测试文件895项测试、build、environment、contract、八角色资源及 package 检查。记录 `/tmp/convivium-native-host-20261016/closure-verify-fixed.log`；真实模型未追加调用。此前导出清单漂移 STOP 已修复，未放宽集合相等检查。

Closure：用户确认一轮核心链路冒烟成功，取消剩余自动真实验收，后续转为[人工冒烟与日志调试](../50-operations/HOW-TO-DSH-SMOKE.md#acp-人工冒烟与日志调试)。长期结论及操作步骤已迁移，六份临时执行手册按人工交接范围删除，不将原 E2 完整验收或 E3 原三场景真实复验记为 PASS。

Not Covered：第二轮真实执行、H5 通知的实际模型续行、最终归档、Web 正文读取、真实贡献超时后的整会收敛、本次原三场景付费复验、固定人工环境部署与浏览器验收、其它平台和长期模型质量。原现场不能直接当作新版人工环境；恢复须匹配原资源、Session、模型和 cwd，先确认期限及技术记录，不修改历史记录绕过门禁。

## ACP Configuration And Web Role Validation

2026-10-15 配置与角色代码：Definition.agentOptions 为完整可选执行选择，agentModelOverrides 生产入口已删除；预检绑定解析后的模型/reasoning，原七角色身份 hash 保持不变。不可变准入选择、descriptor 激活到期检查、八角色/六能力发行闭集及默认 GitHub/arXiv/Web 贡献者创建入口已实现。

固定聚焦集合 12 个测试文件、118 项测试通过；八角色真实 DSH Preset/Session 组合覆盖角色指令、Skill 列表/按名称加载隔离与原绑定恢复，不发送真实模型请求。全量 `pnpm --dir plugin verify` 通过：95 个测试文件、809 项测试，以及格式、lint、Host/Client/Remote 类型、构建、环境、定义和包契约检查。文档链接检查通过；未改固定人工环境。

Not Covered（配置阶段）：上述配置与角色验证不覆盖 ACP provider、真实 Codex/MCP、跨进程 ACP 恢复、Web 实际互联网取证或生产动态 Catalog 验收。下面矩阵中原七角色真实 smoke 属于既有历史证据，不覆盖新增 Web 或 Codex 专项。

## ACP Provider Validation

2026-10-16 在 PR #133 合并基线 `226fd696` 复核 P 阶段：connection、prompt、MCP bridge、三表技术存储、provider、compaction boundary 和保守冷恢复已实现。脚本 ACP 子进程结合真实 DSH 服务覆盖确定性组合，不向真实模型发送请求。

本次执行 `pnpm --dir plugin exec vitest run tests/unit/dsh/acp-codex-connection.spec.ts tests/unit/dsh/acp-codex-prompt.spec.ts tests/integration/dsh/acp-codex-tool-bridge.spec.ts tests/integration/dsh/acp-codex-store.spec.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/integration/dsh/acp-codex-compaction.spec.ts tests/recovery/acp-codex.spec.ts`：7 文件、48 项测试通过；`pnpm --dir plugin typecheck:host` 通过；`pnpm --dir plugin lint` 通过，保留 provider.ts 的 max-lines 和 provider 测试的 max-lines-per-function 两条警告。测试覆盖发送前持久门禁、原生 receipt/checkpoint、同键冲突、正常冷 load、未知阻断与子树收敛；详细断言以对应测试为准。

Not Covered（P 阶段复核）：该阶段证据不覆盖会议生命周期/owner/dispatcher/Reviewer worker 接线、用户诊断、真实 Codex 和 Web 互联网两轮专项、固定人工环境部署；未重跑全量 verify。后续会议接线的证据见下节，不能将 P 阶段确定性证据当作真实会议验收。

## ACP Meeting Integration Validation

2026-10-16，普通分支 `codex/acp-meeting-integration` 完成 D1–D5 的确定性接线。D1 `8f502352` 接入可选 provider 生命周期；D2 `8d4164c0` 接入身份 setup、持久交付门禁、原绑定冷 load 与 cancel/stop/drain；D3 `5f15cc30` 保留贡献事实与真实期限，unknown 不重投或误计失败；D4a `6adf6e78` 固定原生 spawn 测试依赖 rc.2；D4 `da35bf57` 验证 Reviewer→ACP/MCP→原生 spawn worker→structured_output、同 active claim 原 Promise 复用及根阻断门禁。D4 固定六文件、46 项测试通过；这些为既有阶段结果，本次未重复运行。

D5 本次执行：

- `pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-lifecycle.spec.ts tests/unit/host-plugin-lifecycle.spec.ts`：两文件、15 项测试通过。
- `pnpm --dir plugin exec vitest run --project client tests/client/meeting/meeting-panel-execution-block.client.spec.tsx tests/client/meeting/meeting-panel-recovery.client.spec.ts`：两文件、13 项测试通过。
- `pnpm --dir plugin typecheck:client`、`pnpm --dir plugin typecheck:host` 和 `pnpm --dir plugin lint` 通过。lint 保留七条长度警告；Client 测试存在宿主 UI 包缺失 source map 的警告，不影响退出码。
- 文档本地文件链接与 `git diff --check` 通过。

已验证：executionBlocks 仅由匹配当前身份的 ownership 与 provider 技术记录生成，字段为 identityId/code/since/固定 allowedActions，空时省略；内部路径不进入 DTO。持久 block 通知沿原 refresh stream 发送当前 committedVersion，领域 version 不变也能重读诊断；中英文 alert 显示身份和处置方向。没有自动 Captain 操作、清锁按钮或 resume 解除技术门禁；原暂停控制仍可用，原控制/恢复测试继续通过。诊断订阅在 Meeting runtime 停止时注销，先于 provider.close。无新增领域事件、receipt 或 Archive 事实。

Not Covered：真实 Codex/互联网两轮专项、固定人工 Web 部署及浏览器视觉验收、其它平台、生产动态 Catalog、长会话压缩认证；本次未运行全量 verify。该段为历史 D 阶段证据；当前原生边界实现及人工交接结论见上方 ACP Native Execution Migration，不宣称发布就绪。

## Feature Coverage

| 需求编号                              | 功能                                          | 状态     | 版本证据           | 当前覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 缺口                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------- | -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MO-FR-1                               | DSH 插件加载与版本门禁                        | 已实现   | PR #60、#88        | 插件注册、环境检查、Host integration 与 package contract 已进入 `verify`；Meeting Web/Remote 仅在 `webServer.host === "127.0.0.1"` 时挂载。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 未覆盖跨 DSH 版本兼容。                                                                                                                                                                                                                                                   |
| MO-FR-2                               | 会议创建与初始身份隔离                        | 已实现   | PR #99；`ddd57953`；`e7dd364e`；`remote-boundary.spec.ts`；`meeting-creation.spec.ts` | 结构化 Captain `create_meeting` 按唯一角色显示名称选择可选 Contributor，省略时为空；adapter 补齐 Manager、Reviewer 与内部身份引用，旧 ID wire 形态被拒绝。聊天 Skill 仍按 Host `initialContributorRoleIds` 补齐默认 Contributor。实际所选身份均创建 meeting-owned、无 parent 独立 AgentSession；Definition/AGENTS/Preset/Skill/模型在创建前预检，ownership/descriptor 原子持久化，ready 后逐身份投递 meeting_started notice。七份角色资源仍打包并供名称选择及既有会议恢复。Agent read 仍按 active ownership 过滤。 | 不覆盖跨 Host 或长期创建可靠性。 |
| MO-FR-3、MO-FR-4；ER-FR-1、ER-FR-3～5 | 证据登记、审核与轮末公开                      | 已实现   | PR #99；`ddd57953` | open_round 对负责议题的 Contributor 生成定向 round_opened notice，举手处置、Evidence 提交、逐版本独立 claim/worker/review 与 publish_round 使用同一 command/outbox 链；真实 business-loop 保留四轮、八份 Evidence/Review、四次发布和归档门禁。                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Browser 人工验收未执行；fixture 不构成研究结论。                                                                                                                                                                                                                          |
| ER-FR-6、ER-FR-7                      | Contribution 响应、关闭与异常收口             | 部分实现 | PR #99；`ddd57953` | close_contribution、受邀选择与独立 deadline scanner 已接入当前 command/Domain；受邀者可举手或明确拒绝，期限到达后记 no_response；尚未登记证据的 Contribution 到期记 submission_missing；最终 Review 成功送达即关闭 Contribution 并定向通知 round_ready。Contributor turn 执行失败可写带 source effect 的 execution_failed；零证据 Round 可公开；Reviewer turn 异常释放 claim；abort_round 已进入真实事务并有测试。现行状态与格式不接受旧轮次补证、送达后响应或旧持久数据。 | Contributor/Reviewer turn 异常恢复目前只有自动化证据，尚未在固定人工 Web 重放真实 MALFORMED_RESPONSE；明确拒绝与未回应分支有测试，但实际 UI 路径尚未核对。2026-09-27 的 timed_out 人工验收属于已退役契约，不能作为当前流程验收。 |
| MO-FR-5；ER-FR-2、ER-FR-8             | 举手、公开通知与后续贡献              | 部分实现 | PR #99；`ddd57953` | meeting_started/transcript_update 对所有 Meeting identity 生成公开 notice；round_opened 定向通知负责议题的 Contributor，round_ready 在收口条件成立时定向通知 Manager，dispatcher 验证当前 active ownership；raise_hand/dispose_hand_raise 有 Agent tool，真实平级场景在输入 Session 关闭后仍投递并由 Manager 开轮、接纳研究角色。                                                                                                                                                                                                                                                                                                                                                               | 长期通知处理质量未验收。                                                                                                                                                            |
| MO-FR-6                               | 议题范围、Question、Issue 与 Agenda candidate | 部分实现 | PR #99；`ddd57953` | 激活议题、处置候选、解决 Question 和处置 Issue 已经用户 Remote、权限、事务与投影接通；`b934db45` 增加 Manager 激活已有 pending Agenda 的工具与授权；责任衔接与投影校准见本次记录；处置理由、证据和状态变化保留不可变事实。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 身份侧 record_question/record_issue 等完整 Agent tool 面仍未覆盖；用户不能代替 Contributor 记录贡献。人工 Browser 未验证。                                                                                                                                                |
| MO-FR-7 | 公共观点与成果确认 | 部分实现 | 本次工作区 | 观点与异议通过轮内证据及公开消息表达；Captain 通过 record_completion_fact/change_completion_fact 直接依据已公开且审核送达的证据确认、替代或撤销成果，不再建立独立 Proposal/Position/Candidate/Decision 链。 | 未执行新契约的人工 Web 或真实模型成果接受。 |
| MO-FR-8                               | Risk 与 Completion                            | 部分实现 | PR #99；`ddd57953` | 用户 dispose_risk、record_completion_fact/change_completion_fact 已接通 Remote、Domain、事务和完成重算；新旧完成事实引用、审计与回滚有自动化覆盖。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 身份侧完整结构化入口、真实 Browser 的全程完成路径未覆盖。                                                                                                                                                                                                                 |
| MO-FR-9、MO-FR-11                     | 暂停、恢复与结束                              | 已实现   | PR #99；`ddd57953` | 可信用户 pause/resume/end 经同一 command path；暂停停止 worker 并释放 live handles，继续按原 ownership 恢复，结束先撤权再逐 Session 关闭。真实平级场景证明用户重连与暂停冷恢复，业务场景证明结束/归档。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 固定 DSH Web 已验收暂停、继续、结束；自然语言自动控制和长期恢复可靠性未覆盖。                                                                                                                                                                                             |
| MO-FR-11                              | 状态读取与面板                                | 部分实现 | PR #99；`ddd57953` | Meeting list/detail、caller-filtered view、刷新通知和生命周期按钮共用已提交状态；用户投影可见完整控制目标，Agent 读取仍绑定 MeetingIdentity。Client 覆盖断线禁写、双击锁、冲突补读、未知结果显式同 ID 重试与跨会议迟到响应隔离。                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 十项结构化控制只保留可信本地 Remote 契约，未作为当前 WebUI 功能验收。                                                                                                                                                                                                     |
| MO-FR-16                              | Meeting Panel 国际化                          | 已实现   | PR #95             | Client plugin 通过 DSH locale service 注册 key 集合一致的 `zh`/`en` 词典；`conversation.view` 标签、Panel 自有文案、错误外壳和 lifecycle/round/archive 状态展示跟随 DSH locale，业务内容与 command/Protocol/Domain/Storage 语义保持不变。自动化契约与正式 Web profile 的同页中文 → English → 中文人工切换均已通过。                                                                                                                                                                                                                                                                                                                                                                             | Browser 自动化 smoke 未覆盖；第三种语言、日期格式化与 Timeline Panel 不在本项范围内。                                                                                                                                                                                     |
| MO-FR-17                              | Meetings View 概览与时间线                    | 已实现   | PR #96；PR #99     | Navigator、共享 Header、Overview、Timeline、筛选与焦点控制已接入 Client plugin；创建与十项控制表单已从 WebUI 移除，并有聚焦自动化测试；固定 DSH Web 的实际会议已验证暂停/继续/结束、归档、断线重连、Session 消息重开、窄屏抽屉与中英切换；后续事件时间线的自动化与人工证据见 Executed Validation。                                                                                                                                                                                                                                                                                                                                                                                                                | 按时间遍历可见节点的方向键、Browser focus 触发补读和 pending 禁用分别以 Client 自动测试证明，真实 Web 对应动作未完整观测；Browser 自动化与性能未覆盖。                                                                                                            |
| MO-FR-18                              | 聊天框启动会议                                | 已实现   | PR #99；`f015a10e` | 用户输入 `/convivium <目标>` 后由已部署的用户 Skill 调用一次性授权工具；工具按 Host 配置创建 Manager、Reviewer 和所选 Contributor，并补齐议题、输出、验收和限制，走同一创建事务。真实 Web 以“调查TypeSafe JEV的最新进展”创建 `meeting-7fcb1a4866a82d88217570667bf3ec6d` 并在 Meetings View 读回。                                                                                                                                                                                                                                                                                                                                                                                               | 尚未验收会后研究质量、所选身份的实际完整工作、长期运行或跨 Host。                                                                                                                                                                                                         |
| MO-FR-12                              | Agent 内部能力边界                            | 已实现   | PR #99；`ddd57953` | EvidenceVersion 逐版本 claim、原生固定 Schema one-shot worker、独立提交、失败预算与 pause/resume 有自动化覆盖；真实四轮逐版本 worker 验证 completed 输出、逐版本提交和 worker 无会议权限。终态过时 review_request 不再无限重试阻塞归档。                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 不证明任意第三方 Tool/MCP 的生产可用性或长期模型质量。                                                                                                                                                                                                                    |
| MO-FR-13                              | 动态身份推荐与准入                            | 部分实现 | PR #99；`ddd57953` | Catalog/Definition provenance、预检、持久 admission intent、独立 peer Session、提交后权限激活、原 ID 重放、失败撤权、跨 Agenda 复用与终态竞态已实现；真实 identity-admission 验证 admit/reject、结构等值重放和原生角色 Skill。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 自动 research freshness/source-scope 去重未实现；任意第三方角色资源组合未覆盖。                                                                                                                                                                                           |
| MO-FR-10                              | Archive 与冷恢复                              | 已实现   | PR #99；`ddd57953` | 归档来源记录用户控制 actor 与会议身份；终态先撤销全部 ownership，再关闭 Session，关闭失败保持重试。真实 business-loop 证明 archived/complete 和 SQLite cold reopen；peer 场景证明同 DSH_HOME/SQLite 的七角色原 Session、Preset、资源及模型绑定恢复。                                                                                                                                                                                                                                                                                                                                                                                                                                            | Browser 自动化与归档失败路径人工验收未执行。                                                                                                                                                                                                                              |
| MO-FR-10                              | Continuation                                  | 部分实现 | PR #26、#89        | create schema、按值复制的 continuation material 与引用剥离规则已实现并测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 未取得从真实 source Archive 选择材料到新会议的完整运行证据。                                                                                                                                                                                                              |
| MO-FR-14                              | Meeting Agent Definition                      | 部分实现 | PR #99；`ddd57953` | 七个 Definition 2.0.0、七份角色 AGENTS、七个 convivium-* Preset 和五项能力 Skills 已装配，真实 Loader 的列表/按名称加载逐角色隔离；组合测试核对角色身份指令与工具集合。Captain 为可信本地用户，创建、十控制及 pause/resume/end 共十四 action；输入 Session 关闭不影响投递和用户权限。旧共享 Preset、七角色型 Skill、Captain child 创建和旧 adapter 已删除。Manager 角色资源禁止把贡献产出分配给专职 Reviewer；真实来源读取、Reviewer worker、Agent 创建拒绝和冷恢复均有专项 PASS。                                                                                                                                                                                                              | 专项 smoke 未直接核对冷恢复后 Agent 的有效模型、角色身份指令与 toolFilter，也未验证 Reviewer 并发审核；MO-FR-14.11 的完整 Host 验收尚未闭合。模型可见能力隔离不承诺静态文件系统保密；人工 Browser、跨 Host 和长期模型质量未覆盖。                                         |
| MO-FR-15                              | Developer Markdown Projection                 | 未覆盖   | PR #46、#88        | PR #46 的旧实现已随 target cutover 移除，无当前 target 实现。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `current.md`、`archive.md` 的 best-effort projection 尚未实现；旧 legacy projection 不构成该需求的当前覆盖。                                                                                                                                                              |

生产 Agent tool surface 当前包括只读 `convivium_read_meeting`，reviewer 专用内部能力 `convivium_run_review_worker`，以及 command tools：`convivium_submit_manager_plan`、`convivium_activate_agenda`、`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round`、`convivium_raise_hand`、`convivium_decline_hand`、`convivium_submit_evidence`、`convivium_recommend_identity`、`convivium_end_meeting`。review worker 工具由 Runtime 校验结构化结果并使用捕获的 claim 与原 reviewer 权限直接提交，返回 accepted/rejected；不再注册独立的 `convivium_submit_evidence_review` 模型工具，不由 coordinator 转抄审核字段。loopback local controller 是独立入口，不得据此推断 Agent 已获得同等 tool surface。

## Validated Contract

Manager 自动推进的结构边界由命令权限、pending Agenda 与 open Round 前置、版本和事务检查保障；以核心判断的实质增量决定是否开轮、选择首个有价值路径、先记录阻塞、旧议题 previousDisposition 是否应为 completed、以及何时穷尽路径，仍依赖角色指令与模型判断；会议 outcome=completed 仍受 Domain 的确定性目标满足与未解决项校验。工具与状态转换可用，不等于模型已稳定完成跨议题流程；真实运行缺口见 Executed Validation。

- `MeetingState`、target codec、`StorageDomainMeetingRepository`、command application、DSH tools、loopback Remote、caller-filtered view、outbox 与 archive lifecycle 使用同一 `meetingId` namespace。
- 创建、状态变更、read projection、identity provisioning/recovery、review delivery、round publication 与 archive 均从同一已提交状态派生。
- `meeting_started` 与 `transcript_update` 的公开 notice producer 不按角色、Agenda responsibility 或任务状态筛选 Meeting identity；dispatcher 在投递前仍验证公开事实引用、active ownership、固定 Session 绑定与 capability。其它定向 notice 不受该广播规则影响。
- `convivium_read_meeting` 只接受与 active meeting-owned Session ownership 相同的 `meetingId`，并以 committed identity role 生成 caller-filtered projection；读取不产生 command commit、fact、receipt、outbox 或 version 变化。
- command 边界覆盖协议校验、caller ownership、权限、expected version、request idempotency、原子 commit、终态拒写与 storage recovery。
- `RECOVERY_UNAVAILABLE` identity effect 保持 pending retry；进入终态的并发路径不会激活新身份，并清理已创建但未激活的 Session。
- target runtime 不依赖 legacy Domain、protocol 或 runtime surface；退役的 protocol 模块导出、无调用的 runtime 服务与测试入口已在 `417576ba` 移除。Storage Domain adapter、repository core 与必要 projection helper 仍是当前实现的一部分。
- TypeScript 领域、Repository、Runtime 和 Tool 符号使用无版本后缀的当前名称；持久化记录仍保留 `formatVersion`，但 codec 只接受当前 schema，不提供 legacy 识别、转换、双写或回写。

## Historical Peer Agent And User Control Validation — 2026-09-25

范围为 `feat/peer-meeting-agents`：七角色从旧 child/shared Preset 切换为平级 Agent，用户 Captain 十控制、创建和生命周期入口接通，旧代码/资产清除。实现基线包含 `b0b723ae`（十控制事务）、`f25e9110`（Remote/工具边界）、`59ecb565`（用户投影）、`59ecb565..a7f08f1e`（表单与重试隔离）、`2389096a`（旧资源清理）、`0a5e1c9a`（正式启动资源根）、`a34e67d3`/`ddd57953`（终态通知退出重试）。后续提交仅同步操作与覆盖文档。DSH 为 `0.1.2-rc.1`，Node `v24.19.0`，临时本地 web profile + SQLite + 原生 Session persistence；模型和来源读取使用真实 Host 能力。

| 能力范围         | 自动化证据与边界                                                                                                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 角色与能力       | 七份 AGENTS、七 Preset、五 Skills 的精确闭集、哈希、配置插值、分配/未分配 list/get、modelInvocable 与缺模型预检；错误、额外资源、过期 descriptor 拒绝且不创建 Session。真实 peer profile 逐角色复验 Loader。                                                                                                                            |
| 原子创建与持久化 | v2 ownership/bootstrap/descriptor；七个 distinct 绑定、同值重放、payload 冲突、第 1/4/7 个创建失败后的全撤权清理。SQLite 重开证明 v1 拒读、损坏 v2 拒读且不回写原日志。                                                                                                                                                                 |
| 原生 Agent owner | 原生 Loader/AgentLoop/JSONL 组合测试与真实 profile；无 parent、身份指令、模型/资源绑定、同 ID provisioning→delivery scope 切换、flush，以及 unknown live handle 拒绝收养。                                                                                                                                                              |
| 动态身份         | intent/ownership 在创建前持久化，正式身份提交后才激活投递，失败清理、原 ID 重放、跨 Agenda 复用；真实 identity-admission 验证 Catalog admit/reject 与原生 Skill。                                                                                                                                                                       |
| 投递、暂停与恢复 | notice/review 的 pre/post 授权、flush false 与崩溃重试；pause 释放 handle 不撤权，resume/冷 Host 沿用原绑定，错资源拒绝。真实 peer profile 暂停冷启动后恢复七个 Session 与资源/模型指纹。                                                                                                                                               |
| 结束与归档       | 撤销全部 ownership 先于 stop；关闭失败可重试且不重新授权，终态过时通知不阻塞 archive；真实四轮业务归档和 SQLite cold reopen。                                                                                                                                                                                                           |
| 十用户控制       | activate_agenda、dispose_agenda_candidate、resolve_question、dispose_issue、abort_round、decide、change_decision、dispose_risk、record_completion_fact、change_completion_fact；协议、来源、权限、success/stale/terminal、同值重放、payload 冲突、提交前失败/回滚均经测试。事实保存处置理由、证据及旧新状态，归档记录脱敏用户控制来源。 |
| Remote/Client    | 创建 + 十控制 + pause/resume/end 共十四 action；非 loopback/伪造 Agent 来源拒绝，用户无需 Session。该基线的用户表单随后已从 WebUI 移除；十项控制只保留可信本地 Remote 契约。真实 Remote reconnect/Agent 创建拒绝通过，人工 Browser 未执行。                                                                              |
| 删除与发行       | 旧 Session adapter、Captain child 接线、共享 convivium Preset 与七角色型 Skill 已删除；指定旧生命周期关键词在 src/config/probe 零命中。Reviewer one-shot subagent 保留；build、public exports、Definition/package 闭集检查通过。                                                                                                        |

真实 peer observed：七角色 Session ID 互异，Preset 精确为 `convivium-*`；Manager 仅 meeting-facilitation，三个工程角色仅 repository-analysis，Reviewer 为 arxiv/evidence-review/github/repository-analysis，GitHub 与 arXiv 分别只见对应 Skill。GitHub 来源为 `https://github.com/deepseek-ai/deepseek-harness` 的 `dsh-v0.1.2-rc.1`，arXiv 为 `https://arxiv.org/abs/1706.03762v7`；探针同时要求实际内容读取工具结果、版本化材料、合法 Review 和 completed worker。用户输入 Session 在创建前关闭，用户重新连接仍可暂停；冷 Host 保留原七份绑定与暂停事实，再恢复原 Session。

证据边界：peer probe 的冷恢复比较七个 Session/Preset/Skill 集合及 Repository ownership 的资源/模型绑定哈希，未直接检查恢复后 Agent 的有效模型、角色 AGENTS 指令与 toolFilter；专项场景只要求一次已提交 Review 和一次 completed worker，不证明并发审核。来源检查依赖工具调用记录、目标参数与非空输出，结果中的 GitHub/arXiv URL 和版本为 probe 固定值，不能单靠 result schema 证明来源内容真实性。用户重连指每次重新建立的 loopback HTTP 请求，非人工 Browser Client 验收。以上缺口不改变 2026-09-25 已执行场景的 PASS，但不得据此声明 MO-FR-14 全部验收完成。

本次 business-loop 还观察到一份版本的首次审核提交返回 REVIEWER_CONFLICT，Reviewer 在新 claim 下再次运行 worker 并成功提交；实际出现九次 completed worker 调用，最终仅八份版本 Review 入库。结果 schema 保留原有八个独立 worker Session 的断言，不把额外重试写成新的 Evidence 或 Review。

失败记录：首次真实运行修复了 Host startup reload、用户 cookie、安装包 realpath 和 scope service 调用；后续四轮业务虽已产生八份审核与四次发布，却分别被终态审核通知和普通 notice 无限重试阻塞归档，均记为 FAIL。修复先以终态反例 RED，再验证暂停仍重试、终态退出；没有删除或改写失败数据库来伪造通过，原 SQLite/Session 另保留本地诊断。最终成功运行是独立临时环境的完整复验。

本次未覆盖：人工 Web/Browser、跨 Host、MeetingTask/session_mail 的完整生产链、任意来源/第三方工具的普遍可用性和长期研究质量。隔离仅承诺模型可见能力，不是静态文件系统保密；旧 v1 明确拒读，无迁移。人工 `dsh-workspace/` 未部署、未启动、未清理。

## Executed Validation

### 2026-10-14：停止计划后的 Manager 收口误判修正

Scope / Validated Contract：`codex/fix-manager-stop-followup` 工作区。人工会议停在 version 32；Manager 已收到 `agenda_stopped` 并完成扫描，却将 Agenda 和 stop plan 的 `active` 误读为尚未处理，等待不存在的 `stopped/processed` 状态。按 ER-FR-7 的既有语义补清 Manager AGENTS 与 meeting-facilitation Skill：停止计划不改变控制状态，收到独立通知后在该 turn 决定继续、等待合法用户处置或正常结束，不等待第二次通知。同步 Manager 身份资源指纹；不新增状态或自动终止逻辑。

Executed Validation：增强既有停止后续流程 case，确认计划和议题仍 active、lifecycle 保持 running 时可正常以 partial 结束；该既有领域行为直接通过，不宣称观察到确定性代码的 RED。停止后续流程及通知投递 2 文件/22 测试 PASS；七角色资源及指纹校验、受影响测试 ESLint 和格式检查 PASS。人工恢复通过原 Manager Session 的用户消息补充语义，Manager 重新读取原会议并调用 `convivium_end_meeting`，原会议从 version 32 推进到 version 38，outcome=partial、lifecycle=archived；未直接改写数据库或冻结资源。源码构建、打包和固定人工环境 dev-refresh 安装通过，Host 已重启；新 release 的 Manager 指纹与源码一致。重启后的 Browser 重新打开原会议，显示「已归档」、version 38 与「部分完成」。

Not Covered / Closure：人工恢复证明该次澄清后能够收口，不等于新打包指令在全新会议中无需干预即可稳定收敛；未做多次模型对照或完整套件复跑。旧会议保持其原有角色绑定，不以源码刷新覆盖冻结资源。

### 2026-10-13：退役历史轮次补证与送达后响应

Scope / Validated Contract：工作分支 `codex/domain-dead-code-boundary` 的 `6daa47ec`、`0bfe6346`。每个 EvidencePackage 只登记一份 EvidenceVersion；观点摘要在首次提交时形成，审核送达后关闭 Contribution，不再进入等待回应、同轮补证或响应超时分支。移除对应 Domain transition、命令/事件/持久格式字段、deadline 与 notice 分支、测试及 Client 历史观点原文回退。Round 的受邀名单与参与响应改为当前必填字段；不兼容旧持久数据，不另设历史输入识别或迁移路径。新证据通过后续 Round 的独立 Contribution 与 EvidencePackage 表达。

Executed Validation：两笔提交前的最终源码工作树执行 `pnpm --dir plugin verify`，format、lint、Host/Client/remote-test typecheck、103 个测试文件 / 985 项测试、build、environment、contract、agent definitions 与 package 检查均通过；Vite 的 DSH UI primitives 缺失 source map warning 非阻断。提交后仅调整本 readiness 文案，未重跑插件验证。

Not Covered / Closure：没有刷新或重启固定人工 Host，未运行新契约的真实 provider/LLM、Browser 全流程或旧 SQLite 冷恢复。此前针对送达后 `timed_out` 和缺少摘要时回退原文的人工验收属于退役行为，不作为当前流程证据；旧快照不迁移、不兼容，也未在本次修改中清理。

### 2026-10-13：退役无生产入口的 CompletionDeclaration

Scope / Validated Contract：移除未接入生产命令、投影、归档或完成判定的 `CompletionDeclaration`，同步收窄 MO-FR-8、Meeting action 契约与 Domain/Meeting 设计。新建 MeetingState 不再携带 `completionDeclarations`；Domain 类型、transition、schema/reference 校验、Repository 必填字段与专属测试已清理。`CompletionFact` 的 Captain 授权、证据与 Decision basis 校验，以及确定性完成判定保持不变。

Executed Validation：`pnpm --dir plugin exec vitest run`：104 文件 / 993 测试 PASS；定向 Domain、命令契约与 SQLite 恢复 3 文件 / 54 测试 PASS；`pnpm --dir plugin typecheck:host`、`pnpm --dir plugin lint`、`pnpm --dir plugin format:check` PASS；本地文档链接 1150 项、0 错误（不检查 anchors）；`git diff --check` PASS。Vite 对 DSH UI primitives 缺失 source map 的既有 warning 不阻断测试。

Not Covered / Closure：本次未运行构建、打包、真实 Host 或 Browser 冒烟；不读取、迁移或清理固定人工环境及既有持久化快照。旧快照中的额外字段不会由本次源码清理主动删除。

### 2026-10-13：退役未使用的 Repository 结构

Scope / Validated Contract：`codex/remove-retired-repository-structures` 的 `52341031`、`d0a51f4f`。删除无生产调用的 `DomainMeetingRepositoryMail`、旧私信校验、七个私信 port 方法、关联类型与独立 `privateMail` projection map；当前私信继续由 `MeetingState.privateMails` 和 Domain transition 管理。删除无调用且无当前契约依据的 `updateCreateResult`、`requeueAcceptedOutbox`。仓储直接继承提交内核，保持 command、receipt、facts/events、outbox lease、ownership、checkpoint 和删除恢复路径；可选 diagnostics hook 保留。

Executed Validation：Node v24.19.0、DSH 0.2.0-rc.2。直接运行 Repository unit、facts/events/registry/ownership/deletion contract、Domain/SQLite recovery 及当前私信 Domain suites：15 文件 / 144 测试 PASS。`pnpm --dir plugin verify` 全部 PASS：104 文件 / 1012 测试，以及格式、lint、Host/Client/remote-test 类型、构建、环境、插件契约、七角色资源和包检查。DSH UI primitives 缺失 source map 的既有 warning 不阻断测试。`node .github/scripts/check-doc-links.mjs`：1150 个本地链接、0 错误（不检查 anchors）；`git diff --check` PASS。

Not Covered / Closure：未部署或运行真实 Host/Browser、长期与压力场景。移除字段后的持久化 projection 只读当前 strict schema，不迁移或兼容包含旧独立 `privateMail` 字段的记录；固定人工 Web 数据未读取、修改或清理，其重开不在本次验证范围内。源码及关联测试结构退役完成，Git 历史保留恢复依据。

### 2026-10-12：会议身份独立工作目录与 Session cwd

范围：`codex/manager-local-blockers` 的 `d40dd15e` 后工作区。人工会议 arXiv 身份的 DSH 日志与投影存在且已执行多轮，但 header 无 cwd、存储在 `_no-cwd`；本地 DSH 0.2.0-rc.2 的 history sourceFor 对无 cwd 的 header 返回 session/not-found。Convivium 创建 Agent 时原先只传 agentPreset，形成该集成缺口。

正式需求及接口明确每个 Meeting/Identity 独立目录。DSH adapter 现在从固定 Host 启动目录派生 `meetings/<meetingId>/agents/<identityId>/`，创建受管目录并传入 meta.cwd；setup/remember 核对原 header，恢复不创建缺失目录、不改写 Session，不改变角色、模型、工具权限或 ownership schema。拒绝路径穿越和受管符号链接，工作文件在暂停、结束、归档及会议删除后保留。目录分离不承诺文件访问隔离。

先增强既有七角色真实 DSH integration，观察首个身份 header.cwd 为 undefined 的目标失败；实现后 2 文件/11 测试 PASS，覆盖各角色不同 cwd、真实 SessionPersistence header、同 Session 恢复与文件保持、cwd 不符及符号链接拒绝。随后 `pnpm --dir plugin verify` 全部 PASS：104 文件/1003 测试，format/lint、Host/Client/remote-test typecheck、build、environment、contract、七角色和 package。环境 Node v22.23.2、DSH 0.2.0-rc.2；两项既有 Repository 长度 lint warning、DSH UI primitives source map warning 非阻断。临时目录由测试 finally/afterEach 清理。文档链接 1149 项零错误（不检查 anchors），diff check PASS。

Not Covered：尚未部署本次改动或新建真实模型人工会议，未验证 Browser 历史读取和进程级冷启动；integration 验证原生 Session 持久化及 scope 释放后的恢复，不冒充完整 Host 冷恢复。无 cwd 的旧 Session 不回填、不迁移，其历史错误不会因源码修改自动消失，旧人工数据未改动。DSH SubagentStartRequest 无逐次 cwd 覆盖字段，一次性 Reviewer worker 仍按原生规则继承父 Reviewer cwd，本次不实现独立 worker 子目录。工作目录不是证据隔离或 sandbox 边界。


### 2026-10-12：Manager 按核心判断的实质增量收敛

Scope / Validated Contract：`cef9efa1` 先确认 ER-FR-7 与验收第 12 项，并同步会议级入口及 ELK 决策流程图。`a9cfb3b6` 的 Manager AGENTS 与 meeting-facilitation Skill 改为先形成对原目标的有界答案，再判断下一轮能否改变核心结论、置信程度或关键适用边界；plan rationale 说明当前判断、预期改变和具体证据机会。连续轮次判断不变时必须有新的关键证据机会；次要缺陷、负面审核或未解决问题不自动要求继续。沿用现有计划字段、正常 outcome 和自动推进已授权议题，不新增固定轮数、协议字段或 Runtime 信息价值判定。

Executed Validation：七角色资源检查与 Manager 指纹校验 PASS；format、lint PASS（0 error，两项既有 Repository 长度 warning）；既有 Manager 停止后续流程 1 文件 / 3 测试 PASS。本地文档链接与 diff 检查通过。角色部署与目标契约 2 文件 / 5 测试 PASS；本地文件链接 1150 项零错误（不检查 anchors）。最终 ELK 流程图经临时 Mermaid CLI 12.0.0 与 Chrome headless shell 渲染 PASS，并人工检查中文标签、继续/收口分支及切换议题后的重新判断回路；渲染依赖不进入仓库。

Not Covered / Closure：上述验证只证明资产一致性与既有确定性流程未回归，不证明真实模型能稳定识别实质增量、停止或跨议题推进。未对本次新 Prompt 做真实模型对照或完整会议运行，未部署、重启人工 Host 或改变当前会议及其冻结资源；当前冒烟会议不能作为新指令的验证证据。历史模型结果仍只适用于各自指令版本。本次完成指令层实现，模型收敛稳定性仍未验证。

### 2026-10-12：代码、文档与议题推进流程图校准

在 `codex/manager-local-blockers` 的 `0fcae49a` 后工作区核对当前命令、Domain、caller-visible controls、角色资源及正式文档。`36217e4a` 补齐正常轮次时序与使用 ELK 的轮后决策流程：读取→计划回执→开轮、Runtime 提交独立 Review、送达与发布；局部阻塞记录→当前独立工作或自动切换已授权议题；用户专属处置等待与真正耗尽路径后的正常结束。图中明确 stop_agenda 仅记录停止判断、独立通知后重读，不是每次激活或正常结束的必选前置。running 才能继续开轮/切换；paused/converging 无 open Round 且符合结束条件时仍可正常结束。流程图描述应遵循的决策，不宣称 Runtime 自动穷尽取证路径。

`270b463f` 修复校准发现的实际缺口：Manager view 原先没有 activate_agenda control；只绑定初始议题的 Manager 虽能激活下一议题，却会在 open_round 的责任校验中被拒绝。Domain 现在在激活事务中把已授权目标加入专职 Manager 的显式责任列表，保留原角色、Session/Definition 与其他身份的责任；空责任列表仍表示全部议题。沿用现有后续开轮、举手处置、发布与定向通知校验，不扩大 Contributor 权限，不新增状态、事件类型或旧格式兼容。角色指令同步边界并重算资源摘要；READINESS 工具清单补齐 activate_agenda 和已有 decline_hand。

验证先用同一 runtime transition + projection 的连续场景复现三处目标失败（control 缺席、责任未衔接、切换后开轮被拒绝），修复后阻塞计划保持、旧议题 deferred、新议题 active、同 Manager 新轮 open 且目标仍 pending。首次完整 verify 又发现 Host 生命周期测试的六处旧工具计数预期仍为 13，已校准为当前 14 并保持卸载/gating 断言。最终 `pnpm --dir plugin verify` PASS：104 文件、1001 测试，format/lint、Host/Client/remote-test typecheck、build、environment、contract、七角色及 package 检查全部通过；Node v22.23.2、DSH 0.2.0-rc.2。lint 为 0 error、两项既有 Repository 长度 warning，DSH UI primitives 缺失 source map warning 非阻断。其后仅调整 Manager 指令中的责任说明与 Captain 专属控制措辞、同步摘要，角色契约 2 文件/5 测试、七角色及 package 再验 PASS。

两个 Mermaid 图均通过临时目录中的 Mermaid CLI 12.0.0、Chrome headless shell 渲染为 PNG，并人工查看中文标签、箭头、回路与分支；ELK 明示于流程图配置。渲染依赖不进入仓库或产品包。本地文件链接 1149 项零错误（不检查 anchors），diff check PASS。

Not Covered：本次连续场景验证生产转换与投影，不是持久 Repository、DSH Agent 或模型端到端运行；未复测真实模型、未部署/重启人工 Host、未修改人工 SQLite 或冻结 Session。既有模型样本不足以证明完整跨议题流程的稳定性；本次不新增该结论，也不把过去的单条激活输出解释为整场会议成功。


### 2026-10-12：Manager 自动推进已授权议题

用户确认由 Manager 自动推进已有授权议题后，`fa12ff33` 更新需求、接口、角色工具契约与设计，`b934db45` 实现权限及工具入口。本节替代下节“其他 Agenda 仍须 Captain 激活”的旧行为边界；旧模型对照保留为当时证据。Manager 可通过 `convivium_activate_agenda` 激活本会议已有 pending Agenda，Contributor/Reviewer 不获该权限，candidate 仍只能由 Captain 处置；Captain 保留手工激活。复用现有命令与事件格式，不新增旧接口适配、双格式解析或回退。Manager 按已有顺序选择首个可推进项，在指令中要求先保留局部阻塞、逐条等待提交回执、使用新版本激活、重读后规划开轮；局部受阻旧议题用 deferred，不能因切换标记目标完成。

测试先行复现三个目标失败：Manager application 授权拒绝、工具缺席、Definition 未授予工具。实现后，工具绑定、真实 application/Domain transition、角色资源与生命周期/事件回归共 7 文件、106 测试 PASS。验证激活切换为 deferred→active，目标不变，fact/event actor 为真实 Manager identity；Contributor/Reviewer 与 Manager candidate 处置请求拒绝，暂停、旧议题 open Round、未知或非 pending 目标拒绝。Repository port 在该 application 契约测试中为替身，事务幂等与持久恢复沿用既有机制，本次没有增加 SQLite 端到端用例。Host/Client typecheck、lint、build、verify:package、verify:agent-definitions、修改文件格式与 diff check PASS；lint 为 0 error、两项既有 Repository 文件长度 warning。未执行全量 verify。

模型探针为合成后续议题场景、DeepSeek 原生 Messages 接口、deepseek-flash/high，工具参数按本次命令字段重建；只采集返回，不执行命令。第一次同时返回保留阻塞的 plan 与 activation，但两条共用版本 20，后者实际会版本冲突。补清逐次等待回执与新版本要求后，一次返回单条合法 activate_agenda，目标 cost-boundary、旧议题 deferred，MeetingCommandSchema PASS；该样本未先提交计划，不能证明模型完整遵守“先记录计划→激活→重读→新轮”顺序。小样本只证明观察到自动激活决策，不证明稳定性、实际提交成功或第二议题完整运行。

Not Covered：本次未部署或重启固定人工 Host，未改写会议 SQLite 或已冻结 Session；未执行真实 DSH 跨议题会议、Browser 验收、模型命令出错后的工具反馈恢复及完整第二议题取证。新角色能力须安装后在新建会议中验证，旧已冻结角色不会随源码自动改变。


### 2026-10-12：Manager 局部阻塞与后续工作

在 `codex/manager-local-blockers` 上先提交需求、接口与设计边界（`ec6f15b0`），再修改 Manager 指令、meeting-facilitation Skill、角色资源摘要及计划工具描述（`38e4d2c9`）。复用既有 ManagerPlan 的 `blockingReason`、`rationale` 与 `manager_plan.recorded`，不新增异常实体、命令、事件类型或状态机；当前 Agenda 的独立路径由 Manager 规划开轮，其他授权 Agenda 仍须 Captain 激活。新增回归确认局部阻塞保留在计划与事件中、独立工作能开轮、目标不被标为完成且会议不终止；既有运行机制已支持该行为，改动重点是模型决策指引。

自动验证：runtime 后续通知、通知投递、Domain planning 与工具/角色契约共 6 文件、36 测试 PASS；plugin lint、Host/Client typecheck、build、verify:package、verify:agent-definitions、修改文件格式及 diff check PASS。lint 为 0 error，保留两项既有 Repository 文件长度 warning。未执行全量 verify。

真实模型对照采用保留会议 `meeting-e4da0498d6b05197ec381fddca0ae52c` 在版本 20 发布后、提交停止命令前的历史上下文，重建 39 条消息、已加载 Skill 与原工具 schema，仅替换本次角色/Skill/工具描述。调用同一 DeepSeek 原生 Messages 接口、`deepseek-flash`、high reasoning；输出上限为 16384，原会话上限为 256000。只采集模型下一步返回，不执行会议命令，也未修改原会议或 Session。

原指令两次均选择 `stop_agenda`。第一版修改仍有一次开轮、一次结束为 `partial`，暴露 Manager 把自己的工具限制当作 Contributor 能力限制；补清能力归属、材料修正路径和受阻重试限制后，最后两次均返回带 `blockingReason` 的 `open_round` 计划。**这两次历史回放的命令参数均未通过 MeetingCommandSchema：一次将 requestId 放在 action 内，另一次缺少 action.kind；因此合法命令为 0/2，不能声明第二轮启动成功。** 计划中个别新来源/全文取回路径仍需实际核实能力与条件，不能将模型规划直接当作已证明可执行。

两个合成边界场景各执行一次：所有相关路径耗尽且无后续工作时返回 `end_meeting(partial)`；另一授权 Agenda 可推进但待 Captain 激活时返回带阻塞的 `continue_agenda`，不越权激活或结束。两者参数均通过 MeetingCommandSchema。最终提交仅在上述回放指令基础上修正一句标点与语病，未再次调用模型。小样本只支持决策方向改善，不证明稳定性或命令生成可靠性。

Not Covered：未部署本次改动、未重启固定人工 Host、未新建真实 DSH 多轮会议或执行 Browser 全流程；历史已冻结角色资源不会随源码更新。尚需真实运行验证第二轮 Contributor/Reviewer 路径，以及模型参数错误后的工具反馈恢复；本次不把这些未验证项报为通过。


### 2026-10-12：文档、代码与 Skill 一致性收口

范围为主线 `1d9e09c3` 上的 `codex/organize-docs`（提交基线 `61f9471c` 加本次工作区改动）。刷新远端确认 `main` 与 `origin/main` 同为 `1d9e09c3`。同步 Reviewer tool allow/Contributor deny、Runtime 捕获 claim 并提交 Review 的职责、事件日志唯一时间线来源、初始四角色与七份部署资源的区别，以及按指纹固化的身份资源口径；修正 readiness Skill 的失效设计引用，并将退役规则接入 PR Review 检查。

按已确认的退役规则删除 MeetingState 中旧字段名的递归识别器与两个仅针对退役字段/归档形状的测试；混合契约用例保留当前状态 codec 往返与确定性序列化断言。保留当前 Schema、引用、结果、轮次与身份不变量校验，不为退役新增特殊错误或替代用例。

本次实际执行 `pnpm --dir plugin exec vitest run`：104 个文件、992 个测试通过；根 `pnpm typecheck`（Host/Client）、`pnpm lint` 和 `pnpm build` 通过。lint 为 0 errors、2 处既有 Repository `max-lines` warnings；测试输出含依赖包缺失 source map 和 Node SQLite experimental warning。两个修改的 Skill 通过 `quick_validate.py`，本地 Markdown 文件链接检查无失效目标，修改源码/测试格式及 `git diff --check` 通过。Not Covered：remote-test typecheck、远端 CI、真实 provider/LLM、固定人工安装刷新、DSH Web/Browser 与新的会议业务验收均未执行；当前主线没有对应 release tag。

### 2026-10-12：移除无完整事件日志的会议兼容

用户确认未发布阶段不保留旧测试数据兼容。Client 移除 DTO 时间字段时间线投影，只消费 `timelineEvents`；不增加旧数据专用识别、拒绝或恢复校验机制。共享 DTO 的事件字段仍为 optional，仅因 Agent identity 不接收事件日志。

固定人工 Web SQLite 在清理前仅有 `meeting-24c9ef9dac5cbe31685eb378e3ef2e41`，checkpoint 中 eventSeq 1 的 `meeting.created` 仅包含 `meetingId`，缺少 `logVersion:1`。确认 31828 无运行 Host 后，事务删除该会议 domain 的五张表、unit 元数据与 catalog 记录；读回 catalog 为 0，`PRAGMA integrity_check` 为 `ok`。DSH 对话、凭据、工作目录与安装保留。此前旧 DTO 展示的历史验收记录不代表当前支持范围。

2026-10-12 按用户确认收窄为删除旧数据和兼容代码：撤掉旧日志专用拒绝分支、恢复检查和两个旧数据场景测试，身份恢复 fixture 恢复原输入；保留当前事件完整性、事件展示和筛选验证。此前基于旧数据写入拒绝要求提出的 Review finding 随该要求撤回。本次验证：Vitest 全量 104 个文件、994 个测试通过；Host typecheck、修改文件 Prettier 和 ESLint、`git diff --check` 通过。ESLint 保留 Repository 文件既有 `max-lines` 警告；未重新执行人工 DSH Web 验收。

### 2026-10-12：主线交付状态与证据边界

在主线 `62cac736` 上执行 `git fetch origin --prune`、`git log --first-parent`、`git status -sb` 与相关 `git show`，确认 PR #106～#115 已合并，核对时工作区干净且 `main` 与 `origin/main` 一致。本次仅核对 Git 与文档，没有重跑产品验证。

2026-10-11 的固定 SQLite、事件逐序核对、legacy 和冷重启证据早于 `86ee340b`、`61414ea1`、`a2609e82` 的审核提交和时间线修复；最终自动化回归见下节，不能视为最终主线运行验收。Not Covered：远端 CI、review 对话与 Ruleset 未实时核验；最终主线的真实 provider/LLM、人工 Browser、完整删除流程与冷恢复未重跑。

### 2026-10-12：时间线结束、替代事实与最新定位回归

基线为 `codex/meeting-event-timeline`、`f1df9527` 后本次工作树，Node `v24.19.0`、DSH `0.2.0-rc.2`。先增强既有回归并观察 7 项目标失败：生命周期先进入 terminal 时，四种非 completed outcome 把收敛/完成判定错误标成 completed；两类 supersede 漏记 replacement 的 recorded 事件；交错分组使“回到最新”选择较早的组尾节点。修复只在 Client 延后终止边界的阶段收口、按可见节点的时间与 eventSeq 选最新目标，并在既有原子提交中追加 replacement 的现有 recorded 类型；未新增 event kind、修改 Domain 结束规则或回填历史。

聚焦 `meeting-timeline-projection.client.spec.ts`、`meeting-panel-timeline-focus.client.spec.tsx` 与 runtime `meeting-event.spec.ts`：3 文件、71 测试 PASS。覆盖五种结束 outcome 的 lifecycle/ended 同次顺序、supersede 的 changed→recorded 与不可变 statement、revoke 不产生 replacement、交错分组的同时间 seq 决胜及隐藏角色排除。最终 `pnpm --dir plugin verify` PASS：105 文件、1004 测试，format/lint/typecheck/build/environment/contract/agent definitions/package 全部通过；lint 保留两项既有 Repository 文件长度 warning，0 error，DSH UI primitives 的 source-map warning 非阻断。本地文档链接 1126 项零错误，diff check PASS。

Not Covered：未执行真实 provider/LLM smoke 或 Browser 全流程，未部署或重启人工 Host；固定 SQLite、已关闭 Session 和聊天历史均未改写。设计规则已同步，修复不改变分组 DOM 与键盘顺序，也不引入额外 React state/effect。

### 2026-10-11：Runtime 收口 worker 审核提交

基线为 `codex/meeting-event-timeline` 本次提交前工作树，Node `v24.19.0`、DSH `0.2.0-rc.2`。TDD 先复现 worker 返回合法结果却不调用 application，以及额外输出字段被忽略后提交；修复后 Runtime 校验完整 output schema 与 action，使用启动前捕获的 claimId/roundId、原 reviewer caller 和稳定 requestId 直接提交，移除 coordinator 提交模板、独立模型提交工具及角色授权。同时修复已观察 reviewer turn 完成而未形成 Review 时不立即释放原 claim 的问题。

聚焦执行 `pnpm --dir plugin exec vitest run tests/unit/runtime tests/unit/domain/evidence-review.spec.ts tests/contract/meeting-command.spec.ts tests/contract/meeting-review-worker-tool.spec.ts tests/contract/meeting-command-tool-registration.spec.ts tests/contract/meeting-roles-deployment.spec.ts tests/integration/dsh/evidence-review-dispatch.spec.ts tests/integration/dsh/review-worker-submission.spec.ts`：18 个文件、162 个测试 PASS。真实 application + DomainRepository（内存 storage facility，worker provider 替身）组合验证审核落库、幂等回执重放、非法 baseline、启动后 claim 过期、claim 失败后重领以及 ownership 撤销；旧 worker 不借用新 claim，拒绝不写 Review。Host typecheck、plugin lint、相关文件 Prettier、build（含 Host/Client 编译）、verify:contract、verify:package 和本地文档链接检查 PASS。

Not Covered：未执行此次变更的真实 DSH provider/LLM `smoke:profile` 或人工 Browser 全流程；未部署、重启固定人工 Host，也未改写人工会议 SQLite。此前真实会议的 worker `MALFORMED_RESPONSE` 是诊断证据，不代表本次修复已在该环境生效。

### 2026-10-11：基础事件日志与里程碑时间线

实现基线为 `codex/meeting-event-timeline` 的 T1-T5（`bce23862`、`e2a530e9`、`bbf955d9`、`e54838b3`、`b0ec0ee4`）。31 种基础事件在成功 command commit 中与 snapshot/fact/receipt/outbox 原子追加；只有可信 local controller 得到完整 `timelineEvents`，identity projection 缺席。Client 一条 event 对应一条稳定节点，里程碑只在 Client 派生；同次 publication 且显式关联它和 round 的正式消息归入已完成 round，不改变关闭状态或时间。当时保留旧 Meeting 的独立 DTO fallback；该兼容于 2026-10-12 退役，见本文对应记录。

自动证据：T3 Runtime focused 33 tests、T4 projection contract 16 tests、T5 Client focused 32 tests及对应 Host/Client typecheck 通过。T6 `pnpm verify` 通过（102 files/960 tests，format/lint/typecheck/build/environment/contract/agent definitions/package），本地文档链接 1130 项零错误，diff check 通过。lint 有 5 项函数长度/复杂度 warning，0 error；Vite 的 DSH UI primitives 缺失 source map warning 非阻断。

人工固定环境使用既有 `dsh-workspace/`、`dsh-workspace/dsh-home/`、`dsh-workspace/projects/meetings-view/` 与 `dsh-workspace/web-ui/convivium-user/convivium-storage.sqlite`，Node `v24.19.0`、DSH `0.2.0-rc.2`、spawn provider、Web `http://127.0.0.1:31828/`。`--dev-refresh` 成功，release 为 `0.1.0-alpha.1-f7c61eb6c77032e47025080ed54775dfec1c9249f695908c4fe913ee327fbad5`；原 Session、SQLite、dev.env 和已有会议保留，不读取或复制 key。

smoke 独立修复：`4cce979b` 只在 business-loop probe 拒绝 Manager/两位 Contributor 的自主模型步骤，保留真实工具及 Reviewer/worker；原 unsolicited round 失败后，隔离复验四轮、八份审核、八个 worker、四次发布、归档和 cold reopen 全通过（321166 ms）。`25c55281` 使用每次独立创建 requestId，并通过 Cordis inject 等待冷恢复 Runtime 发布，修复持久库命中旧创建 receipt 和装载时序失败。旧失败会议没有删除。

本次唯一验收 seed 命令（Host 停止时执行，`web_ui_root` 指向上述固定安装根）：

```sh
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop \
  CONVIVIUM_SMOKE_STORAGE_PATH="$web_ui_root/convivium-storage.sqlite" \
  pnpm --dir plugin smoke:profile --json
```

结果为 PASS（385667 ms），`storagePersistence="PRESERVED"`、`restore="PASS"`，新会议 `meeting-522f826ffd8d1fc01e4d92f2948a1162` 为 archived/version 69，4 rounds、8 EvidenceVersion、8 Reviews、8 个不同 worker Session、4 Publications，cold reopen 通过。Restore 只清理隔离 smoke 环境；固定 SQLite 中的验收会议及此前失败运行保留。外部材料为 fixture，不是 Jev 研究结论。

真实 Chrome 页面交互与 DOM 检查（浏览器工具辅助，非独立自动 smoke）：展开过程详情后为 8 组、77 个唯一 `event:` 节点，与 local controller 完整事件序列逐 seq 一一对应。逐组计数如下，所有 round 均 completed：

| 分组    | 开轮 | 证据 | claim | 成功审核 | sent delivery | publication | 正式消息 | 审核失败 | 其他事件      | 总节点 |
| ------- | ---- | ---- | ----- | -------- | ------------- | ----------- | -------- | -------- | ------------- | ------ |
| round 1 | 1    | 2    | 2     | 2        | 2             | 1           | 2        | 0        | 举手/处置各 2 | 16     |
| round 2 | 1    | 2    | 3     | 2        | 2             | 1           | 2        | 1        | 举手/处置各 2 | 18     |
| round 3 | 1    | 2    | 2     | 2        | 2             | 1           | 2        | 0        | 举手/处置各 2 | 16     |
| round 4 | 1    | 2    | 2     | 2        | 2             | 1           | 2        | 0        | 举手/处置各 2 | 16     |

其余组为 meeting-start 1 条 created、convergence 4 条 manager plan（由 partial ended 关闭为 aborted）、other 3 条 lifecycle、closure 3 条 ended/archive.started/archive.completed（completed）。第二轮 event 31 的 `review_timeout` 与此前 claimId/同一 evidence version/round 显式关联，随后新 claim 在同一 version/round 成功提交；9 个 claim 各有且只有一个在后的成功或失败结果，计数为 8 成功 + 1 失败。没有为固定计数隐藏合法重试历史。

默认视图为 32 个关键节点，审核失败可见；过程详情显示 claims、正常 delivery、formal messages 和 manager plans，关闭后空 convergence 组不渲染。详情开关与审核领取显式筛选不改变保留组的 key/occurrence/status/startedAt/completedAt；筛选恰显示 4 组/9 claims，空组隐藏，清除后恢复 32 个默认节点。轮次开启固定左侧，组内 `occurredAt → eventSeq` 顺序通过检查；一事件只进一组。刷新并重开后，全部 77 个节点的 key、时间、类型、side 与分组元数据完全一致。

将 4 个 Meetings 摘要按 meetingId 字典序逐一读取，首个 `timelineEvents===undefined` 的既有 legacy fixture 为 `meeting-d05a0646a5a6a427ce6d4b0282a0ec3d`，仍为 archived/version 23；DOM 有 7 个原 DTO 节点、0 个 `event:` 节点。Ctrl-C 停止 Host并确认端口释放后，同一 start.sh 冷重启，再次打开新会议与 legacy：新会议 77 节点/8 组及 legacy 7 节点完全一致。重启前后全部四个会议公开投影的 SHA-256 相同，未出现旧会议改写；原 Captain Session 和 meetings-view 工作区仍可读。控制台只有主动停机期间的 connection lost/retry warning，未观察到组件 error。验收结束后 Host 已停止，31828 释放，固定 workspace、DSH_HOME、SQLite 和所有会议保留。

T7 最终 `pnpm verify` 再次通过（102 files/960 tests，以及 format/lint/typecheck/build/environment/contract/agent definitions/package），文档本地链接在临时执行文档删除前 1130 项、删除后 1125 项均零错误，diff check 通过；无新增产品改动。Not Covered：独立 Browser automation smoke、跨 Host、长期/性能、移动视口/深色主题及真实外部研究质量；本次 Web 证据不提升这些边界。

### 2026-10-11：未完成删除的展示与显式重试

删除意图同步保存目标、原版本和 lifecycle 的最小摘要；部分清理失败后列表只读该摘要，不恢复业务 projection，也不开放业务写权限。Navigator 展示未完成原因，刷新或重新打开菜单后仍可再次确认同一删除。新增 Client 失败→刷新→重试成功组合回归及 deleting 状态重新确认用例，增强 Repository 部分失败摘要可见性断言。回归在旧实现的重试按钮禁用处失败，修复后通过。

两项删除修复的最终工作树 `pnpm --dir plugin verify` PASS：99 files/880 tests，format、lint（无警告）、Host/Client/Remote typecheck、build、environment、contract、Definition、package 全通过。未运行新功能的人工 Browser/完整 Host 链路或跨进程崩溃注入；测试仅使用隔离数据，已关闭 Session 与聊天历史保留，固定人工环境未改动。

### 2026-10-11：删除后的创建重放保护

删除意图提交后，以 catalogKey 的布尔标记阻止原 Meeting ID 再创建；不保留业务内容或 Session 标识。新增 Repository 创建→删除→原创建重放回归，冷重开 SQLite 的完成/中断两条路径也拒绝旧创建，仍可读取原 Session 聊天事件且其它会议不变。回归先观察到旧实现重新登记，再验证拒绝；相关 3 files/23 tests 与 Host typecheck PASS。未改写人工环境，未验证新的完整 Host/Browser 链路。

### 2026-10-11：删除会议并保留 Session 历史

`codex/delete-meeting` 从 `main` 独立实现 MO-FR-19：Navigator 打开动作后增加分隔线与危险删除动作；Runtime 重新检查版本、终止状态、待处理工作，以及全部 ownership 的关闭/撤权状态。删除与普通控制共用提交锁；确认框明确永久删除业务数据、保留已关闭 Session 历史。持久 `deleting` 意图阻断新读写，停止目标投递/期限扫描后清除会议领域各表与 catalog 登记；失败重试和冷恢复不从残缺 projection 重建会议。

`pnpm --dir plugin verify` PASS：99 个测试文件、877 项测试，format、lint（无警告）、Host/Client/Remote typecheck、build、environment、contract、Definition 和 package 检查通过。新增保护包含删除前版本/条件拒绝、意图写失败保留可读数据、部分清理重试、排队 writer 拒绝、取消确认/双击锁、禁用原因、删除失败保留选择、删除非选中会议不改变选择，以及迟到列表刷新隔离。真实 DSH SQLite + JSONL Session persistence 冷重开验证删除完成和意图提交后中断两种路径：目标领域各表为空，目标不再列出且无法读取，其它会议完整保留，已关闭 Session 的原始用户消息仍可读取。真实 Typert Gateway 验证删除 endpoint 调用及非法参数拒绝；其 Runtime 使用受控替身，不代替完整 Host 删除链路证据。

冷恢复错误识别复验：临时移除 Registry 的 intent 清理调用后，中断路径在“目标业务表必须为空”断言失败，恢复生产代码后通过；此复验不属于测试先行。未部署人工 Host、未运行新删除功能的人工 Browser/真实模型会议或跨进程崩溃注入；本次验证不删除或改写固定人工环境数据。

### 2026-10-10：历史观点缺少摘要时显示原文

历史证据（已退役；不代表当前能力）：当时缺少独立摘要的历史观点直接显示已持久化的 FormalMessage 正文，沿用三行折叠与展开/收起交互，证据对话框仍保留原文。相关 records/locales 测试 2 files/15 tests、Client typecheck 与 diff check 通过；人工安装刷新后，真实归档会议的两条历史观点显示原文及“...展开”，不再显示缺少摘要的占位文案。未修改历史持久数据。当前契约要求首次提交即包含摘要，原文回退已由 `0bfe6346` 删除。

### 2026-10-10：撤销记录调试数据

移除记录预览轮次、预览名称映射和 URL 参数入口，并删除仅验证预览注入的测试及操作说明。会议 Client 13 个测试文件共 75 项通过，Client typecheck、构建、固定人工刷新与 git diff --check 通过。浏览器切回不带预览参数的本机地址，读回真实会议仅有原已发布轮次，不再显示调试记录；会议 SQLite 未修改。未重跑 Host 或真实模型会议。

### 2026-10-10：时间线左右交错与进展分层

时间线从五泳道横向网格改为纵向左右交错卡片，保留角色标识和按角色隐藏。轮次开启固定在左侧且不占交替序号；轮次开启、结束（含异常取消）和归档完成使用突出背景。默认关键事实与过程细节分层，显式筛选可显示过程事件，长正文复用三行 Ellipsis，附加正文以 details 展开；方向键按时间遍历可见节点。当前 TaskView 没有失败或阻塞状态及发生时间，不推测此类事件。

本次新增行为测试先观察到两项目标失败，再实现并通过；最终 Meeting Client 13 个文件共 78 项通过，Client typecheck、根 lint、构建与固定 dev-refresh 安装通过，文档本地文件链接检查 1124 项零错误，git diff --check 通过。固定 DSH Web 中同一归档会议 `meeting-24c9ef9dac5cbe31685eb378e3ef2e41`、版本 27 可读回；Chrome 实际检查左右交错、结束与归档背景、详情展开、回到最新和 740px 窄屏，截图已观察。控制台存在本次 Host 停止/刷新期间的连接重试警告，未观察到本次组件运行错误。Not Covered：真实会议轮次开启与异常取消节点、深色主题、完整 Host/contract 套件及新模型会议；轮次固定左侧、异常取消背景和键盘行为由 Client 自动测试覆盖。归档投影缺少轮次时间时保持缺席，不回填或推测历史。

### 2026-10-10：概览移除时间线导航

概览移除时间线对象导航按钮及其单向定位回调，独立时间线 Tab 与时间线到概览定位保留。会议 Client 13 个测试文件共 76 项通过，Client typecheck、构建、固定人工刷新与 git diff --check 通过。内置浏览器读回概览，时间线只作为 Workspace Tab 出现，不再有概览内的时间线导航。未重跑完整 Host/contract 测试或真实模型会议。

### 2026-10-10：概览移除技术信息

概览不再渲染独立技术信息区，移除其 archive/task 概览定位入口；领域数据和时间线保留。会议 Client 13 个测试文件共 76 项通过，Client typecheck、构建、固定人工刷新与 git diff --check 通过。内置浏览器读回概览，仅有目标、议题、结论、开放项和记录五个区域，没有技术信息区域。未重跑 Host 或真实模型会议。

### 2026-10-10：证据对话框固定标题

局部 CSS 将滚动限定在证据正文，标题、贡献者副标题和关闭按钮不参与滚动。构建与固定人工安装刷新通过，git diff --check 通过；内置浏览器将现有长证据滚动到最后一项参考资料，确认标题、副标题和关闭按钮仍在顶部可见。本次为布局调整，未新增测试或重跑行为套件。

后续将审核状态和提交时间移至贡献者所在的固定副标题，正文不再重复显示元信息；相关 16 项 Client 测试和 Client typecheck 通过，构建与人工刷新成功，浏览器确认贡献者、审核状态和日期时间在同一区域显示。元信息进一步使用 12px 次级文字、淡分隔线和下方留白，与正文形成视觉区分；后续改为提交人、状态值和时间值的水平等宽三列，去掉状态与时间标签。相关 16 项 UI 测试、Client typecheck、构建和人工刷新通过，浏览器确认三列布局且滚动到底部后仍保持可见。

### 2026-10-10：证据对话框标题与 Markdown 排版

证据 Modal 使用轮次议题标题与贡献者名称副标题，隐藏证据版本序号和审核失败次数；叙述字段复用 DSH MarkdownText，结构化引用字段保留原文，配套局部样式处理正文颜色、标题/段落/列表间距及宽表/代码块滚动。相关 2 个 Client 测试文件共 16 项通过，Client typecheck、构建与固定人工安装刷新通过，根 lint 为 0 errors、4 warnings，git diff --check 通过。内置浏览器检查已有归档证据：议题标题可换行、作者名称显示、正文颜色与段落间距正常；Markdown 标题、粗体、表格及完整证据内容由组件测试验证。未重跑完整 Host/contract 测试或真实模型会议。

### 2026-10-10：独立观点摘要

当时的 SubmitEvidence 要求作者提供独立非空 `summary`，同版本审核覆盖摘要与完整证据的一致性及重要限制，发布后的 FormalMessage 原样使用摘要。完整证据保留；当时还提供缺摘要历史版本的读取与原文回退，现已随不兼容历史数据的收敛移除。未发布但 caller-visible 的版本显示已有摘要。相关 5 个测试文件共 41 项通过；Host/Client/remote-test typecheck 通过，根 lint 为 0 errors、4 warnings，构建和固定人工安装刷新成功。该阶段 SVG import 检查问题已由 `6d3e4e79` 修复，完整自动化结果以 2026-10-12 最终回归记录为准。内置浏览器当时读回已有归档会议，确认 Modal 原文和完整字段可读、关闭回到概览；这些旧数据观察不构成当前契约或当前人工验收。Not Covered：未新建真实模型会议验证作者实际生成 summary 和审核人遵循摘要审核提示。

### 2026-10-10：轮次记录过程状态与证据对话框

在 2026-10-10 的 Client 验证工作树中，`meeting-round-records.client.spec.tsx` 与 `meeting-panel-locales.client.spec.ts` 共 14 项测试通过，`pnpm typecheck:client` 通过，根目录 `pnpm lint` 为 0 errors、2 个无关既有 warnings，`git diff --check` 通过。固定人工 DSH Web 经 `--dev-refresh` 后复用原会议 SQLite；内置浏览器读回归档会议，证据按钮能打开包含主张和参考资料的完整对话框，关闭后焦点返回按钮，提交时间显示为可读日期。未在真实运行会议中观察到“准备中／审核中”状态切换；该过程路径目前由 caller-visible 投影的组件测试验证。

### 2026-10-10：长 Agent turn 的 outbox lease 续约与丢租约隔离

本次 Convivium 改动不修改 DSH 源代码。outbox worker 在等待 Agent turn 等长投递期间按半个 TTL 周期续约当前 lease；续约或 completion 发生 `LEASE_LOST` 时，不再用旧 token 二次写 retry/failed，也不终止 worker loop，而是继续处理后续持久 effect。回归测试先分别观察到长投递不续租超时、completion 丢租约导致 worker 退出，再在实现后通过。`pnpm --dir plugin verify` 退出 0：96 个测试文件、841 个测试，以及 format、lint、Host/Client/remote-test typecheck、build、环境、契约、七角色 Definition 与 package 检查通过；lint 有 2 个非阻断既有 warning。`node .github/scripts/check-doc-links.mjs` 检查 1124 个本地链接、0 errors。

随后停止占用 `127.0.0.1:31828` 的原 Host，以 `--dev-refresh` 把同一构建安装到固定人工 Web 环境，并复用原 `DSH_HOME`、项目目录和会议 SQLite 启动；没有重建 Meeting 或 Session。保留的 `meeting-d05a0646a5a6a427ce6d4b0282a0ec3d` 从卡住时的版本 7 继续到版本 23：原 pending `hand_disposition` 与后续 GitHub/Reviewer outbox 恢复投递，两位 Contributor 均 closed，2 份 Review 入库，Round 发布 1 份 Publication，Manager 以 `partial` 正常结束，Archive 为 `complete`。Host 继续监听，固定目录与会议数据保留。

**Not Covered**：本次没有通过 Browser 人工点击逐项复核页面，也没有在归档后再次 cold restart；单场保留会议的恢复不证明任意模型、任意时长或所有 outbox effect 的普遍稳定性。

### 2026-10-09：Contributor 与 Reviewer turn 异常恢复

本次 Convivium 改动不修改 DSH 源代码。Convivium 对已接纳 Contributor 的目标 turn 使用 deliveryId/claimed turn 精确关联；若原通知因此前 turn 异常而留在队列，owner 使用 DSH 公开 `steer` API 唤醒原通知，且不把 wake message 作为会议事实。目标 turn 异常后由 `runtime_recovery` 提交带 sourceEffectId 的 `execution_failed` 事实；同一 effect 崩溃重投不再次唤醒 Agent。全部贡献失败时允许零 Evidence/Review Publication，并保留结构化失败；Reviewer 目标 turn 异常立即以 `review_interrupted` 消费 claim，沿现有版本失败预算重试。`pnpm --dir plugin verify` 退出 0：96 个测试文件、839 个测试，以及 format、lint、Host/Client/remote-test typecheck、build、环境、契约、七角色 Definition 与 package 检查通过；lint 有 2 个非阻断复杂度/函数长度 warning。`node .github/scripts/check-doc-links.mjs` 检查 1124 个本地链接、0 errors。未运行真实模型、固定 Web 或持久 SQLite 冒烟，因此只能声明代码与自动化契约覆盖，不能声明原人工会议故障已实机复验。

### 2026-10-09：DSH `0.2.0-rc.2` 会议业务冒烟与固定 Web 读回

在 `codex/dsh-rc2-version-audit` 工作树，`CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir plugin smoke:profile --json` 退出 0（410.6 秒，Restore PASS）。隔离临时 Profile 使用 `spawn` provider 和 Jev 议题的确定性材料，完成目标创建、会议启动、四轮议题、八份 EvidenceVersion 的独立审核、四轮发布、归档及 SQLite 冷启动重开。此次真实运行暴露并修复 rc.2 的 Preset include 路径、Persona 字段、Session flush、消息来源格式及安装路径符号链接校验差异；修复后完整场景通过。修复以四个小步提交交付至 PR #108（业务修复基线 `6880f067`，已合并）；PR Verify 的 Governance、Plugin Typecheck、Plugin Format、Plugin Lint、Plugin Test、Plugin Build 与 Package Contract 共 7 项检查全部通过。本地 `pnpm --dir plugin test` 通过 95 files / 826 tests，`build`、`lint`（0 errors、1 处既有 warning）、`format:check`、`verify:contract`、`verify:package` 及文档链接检查通过。

固定人工 Web 环境仍使用保留的 `dsh-workspace/` 数据。浏览器读回原 Jev Session 与 `meeting-24c9ef9dac5cbe31685eb378e3ef2e41`：会议为已归档、版本 27，证据、Review、Publication、Archive 在界面可见。**Not Covered**：此次回读基线早于 PR #108 的修复；后续固定环境运行证据见 2026-10-11 记录。确定性材料不构成 Jev 效果结论，也不证明长期运行或上游 rc.2 依赖元数据已经修复。

### 2026-10-09：DSH `0.2.0-rc.2` 隔离安装与 Web 装载

在 `codex/dsh-rc2-upgrade` 工作树中，安装器与自动 smoke 入口改用 rc.2，Client UI primitives 改为发行依赖。`pnpm exec vitest run tests/contract/installation-entrypoints.spec.ts` 通过 1 file / 6 tests。独立临时 `DSH_HOME` 的 `./scripts/install-from-source.sh --workspace <临时 workspace> --dev-refresh` 完成；Profile 的 `patchReload` 为 `startup`，发行插件及 UI primitives 在 Profile 安装目录可解析。`dsh web --dump-config` 含 Convivium 行与七个角色 Preset。启动隔离 Web Host 后，`127.0.0.1:31828` 监听且 10 秒后进程仍运行；Playwright 打开带授权 token 的页面返回 HTTP 200，显示 DeepSeek Harness 初始界面，浏览器 console/page error 均为 0。插件设置页显示 Convivium 已安装且启用，启动图包含 Convivium Client；验收后已停止 Host。

此证据只证明隔离安装、Host 启动和首屏装载。**Not Covered**：会议创建与角色实际运行、历史 Session 恢复、固定人工 Web 环境和长期模型任务。rc.2 上游 Client UI primitives 的发布 manifest 缺少部分运行时依赖声明，本插件以显式发行依赖补齐；不能把这一局部装配验证解释为上游包已修复。

### 2026-09-28：固定 Jev 议题的全新人工 Web 冒烟

在 `codex/manager-meeting-closure`、`a7cfff87` 加本次手册修改的工作树上，使用 Node `v22.23.2`、DSH `0.1.2-rc.1`。`pnpm --dir plugin verify` 退出 0：94 个测试文件、824 个测试，格式、lint、类型检查、构建、环境、契约、角色资源与包检查通过。按用户确认的精确路径删除固定人工环境中的 `dsh-home/`、`web-ui/convivium-user/`、`projects/meetings-view/`，从源码以 `--dev-refresh` 重新安装；release artifact SHA-256 为 `b26d589146ab01b1efc83c18adb7147c6a04450a88d299306e5aca6985a92308`。安装根的空 key 占位文件经核对后改为指向仓库根 `dev.env` 的符号链接，未复制或输出 key。

首次误用 SQLite 议题创建的 fixture 不计入本次验收；开放轮次中尝试异常取消返回 `INVALID_STATE`。停止 Host 后再次删除上述三个固定目录并重装，最终从普通 DSH Web 聊天输入手册规定的精确议题 `/convivium TypeSafe 的 Jev（System-One 决策模型）对长效 Agent 系统是否有实质性系统提升？`。新会议 `meeting-64f3edbd30c7585aeda93ebdb6cb327d` 完成首轮两位 Contributor 举手、两份 EvidenceVersion、两份逐版本 Review 与送达、一次 Publication；Manager 正常结束并给出 `partial` 结果，说明已交付有界产出，但没有证实 Jev 对长效 Agent 的实质性系统提升。Web 时间线显示归档已完成，会议为 `archived`、版本 23。停止 Host 后用同一 `DSH_HOME`、项目目录和 SQLite 冷重启，原 Captain 对话中的命令、meetingId 与会议面板中的版本 23、证据、Review、Publication、归档均可读回；验收后 Host 已停止，固定目录保留。

本次人工冒烟不证明 Jev 的研究结论、四轮确定性 business-loop、任意来源的可靠性，也未重测暂停/继续、断线禁写或窄屏交互；这些边界不能由本次单轮浏览器观察推断。

### 2026-09-28：开放轮次控制与暂停后通知补投复验

上述误议题 fixture 的开放轮次在 Web Header 呈现“异常取消会议”，实际 `EndMeeting` 按接口契约拒绝并返回 `INVALID_STATE`。投影回归测试先复现失败，修复为开放轮次不提供 `end_meeting` control 后通过。随后再次清空已确认的固定人工环境并部署修复版，使用同一 Jev 议题创建 `meeting-24c9ef9dac5cbe31685eb378e3ef2e41`；开轮时 Web 只呈现“暂停会议”。人工暂停和继续分别提交至版本 4、5，但两位 Contributor 的 turn 被 pause 中断，已消费的 `round_opened` 通知没有在 resume 后补投，会议停在待选择举手。Session 记录显示两位 Contributor 的 turn 以 `Meeting paused` 中断，且 resume 前没有后续通知。针对 pending 参与选择的补投测试先失败、后通过。

保留该会议与 Session，停止 Host 后以 `--dev-refresh` 安装补投修复版，release artifact SHA-256 为 `9399161964f11315a612fe8fd74996927c19b2d5b4725344427483048d45911b`。同一会议冷启动读回版本 5；再次人工暂停/继续至版本 7 后，两位 Contributor 均重新读会并举手、提交两份 EvidenceVersion，Reviewer 分别提交并送达两份 Review，Manager 发布一次 Round 并正常以 `partial` 结束，归档完成于版本 27。再停止 Host、使用同一 `DSH_HOME` 和 SQLite 冷启动，原 Captain 对话、meetingId、版本 27、两份证据/Review、Publication 和归档在 Web 可读；最终停止 Host、释放 31828 端口并保留固定目录。`pnpm --dir plugin verify` 最终退出 0：95 个测试文件、826 个测试及格式、lint、类型检查、构建、环境、契约、角色资源和包检查通过。

本次仅实证开放轮次的 pending 选择在暂停后恢复；已接纳但准备中的 Contributor 补投分支有源码实现，尚未由独立人工中断复验。单轮自然会议仍不等价于四轮确定性 business-loop 或 Jev 效果结论。

### 2026-09-28：`stop_agenda` 后续扫描链路

在 `codex/manager-meeting-closure` 工作树、Node `v22.23.2` 下，先用聚焦测试复现停止计划没有 Manager 后续通知，再实现同事务写入 `agenda_stopped` outbox effect、投递前校验当前有效计划与 Manager 身份，并更新角色指令使 Manager 在独立通知阶段重读会议、扫描后续工作。`pnpm --dir plugin verify` 退出 0：94 个测试文件、824 个测试，以及格式、lint、类型检查、构建、环境、契约、角色资源和包检查通过；`node .github/scripts/check-doc-links.mjs` 检查 491 个本地链接，0 错误。上述自动验证未证明真实 Manager Agent 在收到通知后一定完成正确扫描和正常结束。该次没有重部署固定人工 Web 或改写 SQLite；后续人工会议运行与恢复证据见暂停后通知补投及 rc.2 时间线验收记录。

### 2026-09-28：两位研究贡献者的 DSH 与人工 Web 冒烟

基线为 `codex/fix-manager-review-visibility` 的本地未提交工作树，Node `v22.23.2`、DSH `0.1.2-rc.1`。修复经理 AGENTS 资源指纹与 Definition 不一致，并使业务冒烟按正式配置使用 GitHub 和 arXiv 两位初始 Contributor；按新轮次选择规则移除旧 late hand raise 的 deferred 断言。`pnpm --dir plugin verify:agent-definitions`、`pnpm --dir plugin format:check`、`pnpm --dir plugin lint` 与 `git diff --check` 均 PASS。

先前这次 `smoke:profile` 的三场景 PASS 记录 `dsh-workspace/smoke-records/convivium-smoke-record-ejCRlN/` 经审计发现 `workerSessionIds` 混入输入 probe Session，不能作为八个真实 worker 的完整验收证据。后续补强 live worker authority 检查和 Jev 四轮 trace 校验；旧记录保留用于定位，不引用为完整 PASS。新贡献者选择与送达即结算流程的完整 DSH 回归结果以本次重新执行的记录为准。

同日更新后的独立完整 DSH profile 验证执行 `CONVIVIUM_SMOKE_RECORD_DIR="$PWD/dsh-workspace/smoke-records" CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS=900000 pnpm --dir plugin smoke:profile --json`，三个场景均返回 `ok=true`、CLI `restore=PASS`；脱敏记录在 `dsh-workspace/smoke-records/convivium-smoke-record-05DzcH/`。其中 business-loop 使用确切 Jev 议题与 GitHub/arXiv 两位 Contributor，完成四轮、八个 EvidenceVersion、八个独立 Review、四次发布、八个互异且在存活时核对无 Meeting command authority 的 worker Session，进入 `archived`/Archive `complete`，并通过同一 SQLite 冷重开。peer-meeting-agents 验证四个 meeting-owned Session、角色 Skill 隔离、真实 GitHub/arXiv 来源读取、Reviewer worker、用户重连控制与冷恢复。该自动 fixture 采用确定性证据，不证明 Jev 研究结论、所有自然 Agent 决策或人工 Browser 全流程。

固定人工 Web 环境以 `--dev-refresh` 重新安装并重启，Host 监听 `127.0.0.1:31828`，原会议 `meeting-8b18f924168a01b5a3575c67bab1fee3` 在 Codex 内置浏览器可读，仍为 `running`/version 20，时间线显示两份审核及其送达。内置浏览器另创建测试会议 `meeting-6aa748adb6d8aeac13cb1449b892dbfe`，面板可读且两位研究 Contributor 配置生效；用户暂停、继续、再次暂停分别生效，刷新后保持 `paused`/version 8。开放轮次上的结束请求被领域拒绝为 `INVALID_STATE`，故该浏览器测试会议未归档。新版又以确切 Jev 议题创建 `meeting-bda33e7c9dd76b69758e4f1b98acdc29`；首轮在 Overview 显示两位 Contributor 的“待选择是否举手”，随后其中一位变为“已举手”并建立 Contribution。此项人工观察证明新状态的可见性，未覆盖人工浏览器端完整归档或所有选择分支。自动化场景使用确定性业务 fixture；外部研究质量、任意来源可用性与浏览器端完整归档仍为 Not Covered。

### 历史专项运行证据

以下旧版本记录只支撑其独有的人工语言切换与超大原子提交恢复观察，不代表当前 rc.2 或当前审核提交机制已复验。其余已被后续验证取代的测试快照、退役工具与修复过程记录由 Git 历史保留。

| 日期       | 版本/环境                                                                                                           | 方法                                                                                                                                                                                                                                      | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-22 | PR #95，DSH `0.1.2-rc.1`，正式 DSH Web profile                                                                                          | 在同一已挂载 Session 中人工观察中文 → English → 中文，无页面刷新、Host 重启或 plugin 重装；打开正式 SQLite 中的已归档 Meeting                                                                                                         | PASS（人工）：标签/Panel 标题/刷新按钮及 Meeting summary、lifecycle、archive 状态随 locale 即时切换并恢复；中文 objective 与 Agenda 标题保持原文，已归档 Meeting 持续可见。该结果不是 Browser 自动化 smoke。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-21 | `c178bb8`，DSH `0.1.2-rc.1`                                                                                         | `CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop CONVIVIUM_SMOKE_RECORD_DIR="$PWD/dsh-workspace/smoke-records" pnpm --dir plugin smoke:profile --json`                                                                                     | PASS（247.5s，Restore PASS）：四个 Manager `roundGoal` 轮次、8 份 Evidence、4 个完整 Reviewer batch、4 次 publication、archive 与 SQLite cold reopen 全部通过；第三、第四轮覆盖超过单 commit record 上限后以分页 checkpoint 原子发布并成功恢复。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 未覆盖范围

除矩阵中逐项列出的缺口外，当前证据不覆盖：

- 历史运行证据仅适用于各自记录的代码、DSH 版本与路径；最终主线的审核提交修复、时间线修复和删除功能尚未完成新的完整人工 Host/Browser 验收；
- Browser 自动化 smoke、Meetings View 按时间遍历可见节点的键盘交互真实 Web 验证、切换其他应用后的 Browser focus 补读、提交中禁用态的人工瞬态观察、性能与并发压力、长期运行及跨 Host；
- 发布流程、任意生产外部网络的普遍可用性、远端文件系统；
- 开发期旧 snapshot migration、未来版本 compatibility；

## Closure

当前可以声明 Meeting target runtime 已完成单一活动链切换，并对会议创建、证据轮次、状态读取、动态身份准入、持久化恢复和归档核心路径形成自动化覆盖。只有标为 `已实现` 的行可作为当前功能覆盖结论；`部分实现` 与 `未覆盖` 必须保留为交付缺口，不能由相邻 Domain 类型、测试 helper 或旧 legacy 实现推断为可用。

相关依据：[Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)、[Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)、[Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Meeting Interface](../20-interfaces/MEETING-INTERFACE.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。

### 2026-10-13：里程碑横条与收敛分组退役

范围为 `codex/timeline-ui-optimization` 本次工作区。里程碑改为主轴上的全宽低高度浅背景横条，会议启动固定首位且上方无线；仅同名多实例显示序号，会议启动省略状态。删除 convergence 分组与其本地化标签，主持计划、决策与风险处置按唯一明确轮次关联归组，无关联或歧义进入 other，保留原始事件和 completion/closure 语义。

Executed Validation：两份 timeline Client spec 共 35 项通过，受影响 ESLint、格式、文档链接及源码构建通过；固定人工安装根刷新重启后，Browser 读取同一归档 fixture，完整时间线仍含 62 个节点，分组由 7 个变为 6 个，没有方案收敛。截图保存在仓库外。Not Covered：完整测试套件、远端 CI、暗色主题及完整业务冒烟；仅验证本次展示与分组。

### 2026-10-13：时间线筛选展开与收起

范围为 `codex/timeline-ui-optimization` 的本次工作区改动。默认只展示参与者筛选；展开后显示内容类型与事件，收起保留条件和过滤结果，各分类标签用于清除本组筛选。展开状态为 Client 局部状态，不写入领域或持久存储。筛选行使用对齐的加粗可点击标签与可换行选项，标签只清除本分类；选项使用间隔与小圆角边框，展开控制为链接式文字。

Executed Validation：`pnpm --dir plugin exec vitest run --project client tests/client/meeting/meeting-panel-timeline-focus.client.spec.tsx` 通过 11 项测试；新增分类标签清除断言先观察到标签不可点击的失败，再验证按分类清除、保留其他分类及匹配事件过滤通过。展开/收起新增断言先观察到缺少展开按钮及默认未隐藏后两行的失败，再验证实现通过，覆盖中英文文案、ARIA 状态、收起后条件保持及清除。`pnpm --dir plugin typecheck:client`、受影响文件 ESLint 和 `node .github/scripts/check-doc-links.mjs` 通过。依赖包缺少 source map 的 Vite 提示未阻止测试。

2026-10-13 补充 Browser 验证：固定人工安装根按当前源码 `--dev-refresh` 构建安装并重启；通过 Codex In-app Browser 在现有归档 fixture 验证 1280×720 与 520×900 筛选区域截图。标签与清除按钮均为 12px/18px 宿主字体，标签列缩至 76px，选项统一 28px 高度、8px 间隔、4px 圆角，未选文字和边框使用宿主次级 token。展开、收起、证据分类筛选及点击分类标签清除通过；证据筛选显示 16 个节点，清除后恢复 62 个。两种视口无空白页或错误覆盖层，筛选选项换行无重叠；控制台仅记录本次 Host 停机刷新造成的断线重试警告，未发现应用错误。Playwright 的默认 Chrome 路径不可用，实际验证使用桌面浏览器工具，不安装依赖。截图保存在仓库外。

后续同日调整与验证：筛选标签改为“角色 / 类型”，标签列进一步缩为 44px；删除全局清除按钮，只通过分类标签清除；分类标签按是否有选择展示不同状态，未选选项不显示边框和背景。展开/收起在所有视口均与首排选项对齐，固定于筛选区右上。11 项 Client 回归、Client typecheck、受影响 ESLint 与文档链接检查通过；刷新固定人工安装并在桌面及 520px 窄屏截图确认布局、选项与分类标签选中状态，无重叠。前段关于全局清除按钮及 76px 列宽的描述是本次调整前验证。

Not Covered：完整测试套件、远端 CI、其它浏览器与暗色主题；本次只验收筛选交互与视觉，不代表完整业务人工冒烟通过。

### 2026-10-13：时间线角色头像

时间线五类角色使用 40px 彩色卡通头像，卡片首排按头像、姓名与浅色小字时间排列；装饰头像不参与辅助技术播报，卡片可访问文本继续保留角色信息。相关时间线交互测试 11 项通过，插件构建通过。头像视觉效果通过人工 DSH 页面检查，不将此验证扩展为所有主题与屏幕尺寸的验收。

### 2026-10-13：时间线事件行简化

卡片第二排显示事件名称与“查看”链接样式按钮，保留概览定位；移除对象类型和对象 ID/状态正文占位。时间线交互测试 12 项通过，覆盖空创建事件、保留事实正文和查看定位参数。当前 meeting.created 未记录用户输入原文，创建卡片因此没有正文；未增加历史输入回填或事件契约变更。

### 2026-10-13：移除未归属事件里程碑

未归属事件不再展示“其他已发生事件”标题与状态，事件各自作为普通卡片按事件时间排列，保留明确轮次关联的既有归属。时间线交互测试 13 项通过，新增场景验证未归属事实仍可见、无兜底里程碑标题及卡片顺序。

### 2026-10-13：里程碑标题不提前展示状态

轮次横框显示“第 {n} 轮”/“Round {n}”，所有里程碑横框移除状态，其他同名里程碑重复时保留序号。完成与中止仍由事件卡片表达，内部归属与状态元数据保持。时间线交互测试 13 项通过，插件构建通过。

### 2026-10-13：数据阶段生成交错布局

移除 other 里程碑数据，未归属事件直接生成普通展示块。展示数据统一确定卡片顺序和 side；每个真实里程碑从左侧开始，轮次开启计入左右交替，普通卡片延续计数。键盘遍历采用同一展示顺序。投影和时间线交互测试合计 38 项通过，新增场景覆盖两个轮次的举手记录均位于右侧。

### 2026-10-13：时间线 DSH 配色与暗色主题

卡片背景、关键事件强调、异常边框、链接和焦点使用 DSH 语义 token；里程碑横条保持中性。源码构建、CSS 格式及文档链接检查通过。固定人工环境在 869×954 下验证浅色与深色：62 条事件完整，筛选用户后为 1 条，清除恢复 62 条；审核失败筛选为 2 条，暗色卡片使用宿主层级背景、浅色文字和警告边框。展开、收起正常，Browser 未记录应用 error。未覆盖其它视口和浏览器；未执行完整业务冒烟。

### 2026-10-13：时间线 UI 分支交付验证

Scope：分支 `codex/timeline-ui-optimization`，代码边界 `b0049917`，[PR #120](https://github.com/thundax-lyp/convivium/pull/120)。前述同日条目记录迭代时的验证；本条为该代码边界的最终结果，不将旧版 other 分组、状态标题或旧筛选布局视为当前实现。

Validated Contract：筛选默认仅展示角色，展开/收起保留条件，分类标签只清除本分类；取消 convergence 和 other 里程碑但保留实际事件，按唯一明确关联归组；每个真实里程碑首张卡片在左，轮次开启参与交替计数；轮次开始不提前展示最终状态。卡片采用角色头像、姓名时间、动词在前的事件文案与查看入口；DSH 语义配色随浅色/深色主题切换，头像视口收紧到 394×394，暗色背景不再露出外沿米白底。

Executed Validation：2026-10-13 发布前重新执行两份 timeline Client spec，38 项通过；受影响 Prettier/ESLint、`git diff --check main...HEAD` 与文档链接检查通过；源码构建安装通过。固定人工 DSH 环境的现有归档会议验证 62 条事件完整、第一和第二轮首条举手在右侧、筛选/清除与展开/收起正常；869×954 下浅色与深色配色、暗色头像裁切经截图检查，Browser 无应用 error。[PR Verify](https://github.com/thundax-lyp/convivium/actions/runs/38351344980) 在 `b0049917` 上的 Governance、Plugin Format、Plugin Lint、Plugin Typecheck、Plugin Test、Plugin Build、Package Contract 七项检查全部通过。

Not Covered：本地未运行完整测试套件，完整自动化测试由远端 Plugin Test 覆盖；未执行新的完整业务 smoke、其它深色视口或其它浏览器验证。Codex 自动 review 因额度限制未执行，当前没有 reviewer finding；CI 通过不能代替人工代码评审或完整业务验收。

Closure：分支已推送，PR 已创建并以 main 为目标，等待 review，尚未合并；本次不声明整体会议能力或发布就绪。

## 2026-10-14：退役独立 MeetingTask

Scope / Validated Contract：按已确认的退役决定，MO-FR-5 收敛为轮内并行取证与后续贡献；移除独立 MeetingTask 生命周期、task commands、状态/投影/时间线模型及其申请限制和附加 deadline。长时间工作继续受 Contribution 准备期限、Round deadline、证据审核和轮次统一公开约束；跨轮补证由新轮重新规划和申请。Manager 指令与指纹、架构、接口、设计及审查依据同步。本文较早记录中的 MeetingTask 未覆盖项属于当时范围，不再是当前交付缺口。

Executed Validation：根 `pnpm lint` 通过；Host/Client/remote-test typecheck 通过；根 `pnpm test` 103 个文件、986 项通过；根 `pnpm build` 通过；修改的插件文件 Prettier 检查通过，文档本地链接 1150 项零错误。仅移除退役 fixture 字段及 task 时间线断言，保留其余行为测试；没有新增旧格式识别或兼容拒绝机制。发布前 `verify:contract` 与 `verify:package` 通过。[PR Verify](https://github.com/thundax-lyp/convivium/actions/runs/38508073011) 在 `b6a84feb` 上的 Governance、Plugin Format、Plugin Lint、Plugin Typecheck、Plugin Test、Plugin Build、Package Contract 七项检查全部通过。

Not Covered：未刷新固定人工 DSH 环境，未运行 Browser 人工验收或新的真实模型会议；角色资源指纹更新后的既有会议冷恢复未作人工验证。

Closure：独立 MeetingTask 需求、契约与代码已退役；取证由 Contribution 与后续轮次承载。历史任务覆盖记录不再代表当前交付缺口。本次证据不声明整体会议能力或发布就绪。


## 2026-10-14：退役开轮前取证机会申请

Scope / Validated Contract：按已确认的流程收敛决定，贡献者在 Manager 开轮后举手，经接纳取得 Contribution；删除 EvidenceOpportunityRequest、申请与处置转换、持久状态及校验、通知、投影、时间线和开轮转举手逻辑，同步 ER-FR-2、ER-FR-8、接口及设计。保留受邀资格、公开基线、选择期限、Manager 接纳、消息预算和轮次收口约束。

Executed Validation：基于 `ccc01681` 的本次工作区，Host/Client/remote-test typecheck、根 `pnpm lint`、根 `pnpm test`（102 个文件、979 项）和根 `pnpm build` 通过；修改的插件文件 Prettier 检查通过，文档本地链接 1150 项零错误，git diff --check 通过。删除仅服务退役申请的测试与 fixture，混合测试保留当前轮次、通知与完成重算保护；不开设旧输入识别或兼容拒绝路径。

Not Covered：未刷新固定人工 DSH 环境，未执行 Browser、真实模型会议或远端 CI。

Closure：开轮前取证申请需求、契约与代码已退役；轮内举手是贡献申请入口。旧记录中的申请入口缺口不再属于当前范围。本次未发布。


## 2026-10-14：退役会议私聊

Scope / Validated Contract：按已确认的当前范围，会议协作只走正式轮次，不提供独立 PrivateMail/mailbox。删除五个私信 Domain transition、类型和状态、Schema 与引用/期限校验、caller projection、session_mail effect 类型及仅服务私信的测试资产；移除私信与正式 Contribution 的 serial gate。正式贡献的受邀资格、caller binding、消息预算、准备期限、证据隔离、审核和公开约束保留。同步需求、接口、设计、审查依据和操作说明。历史记录中的私信实现与未覆盖项不再代表当前范围。

Executed Validation：基于 `2aa5cc4d` 的本次工作区，Host/Client/remote-test typecheck、根 `pnpm lint`、根 `pnpm build` 及根 `pnpm test`（100 个文件、912 项）通过；修改插件文件 Prettier 检查通过，文档本地链接 1150 项零错误，git diff --check 通过。首轮测试与构建并行，构建清理 lib 使 Remote 契约套件无法导入 typert；构建完成后串行重跑完整测试通过。事件 strict schema 的非契约字段拒绝保护保留，使用 hiddenTrace 而非退役 PrivateMail 字段；未新增旧输入识别或兼容拒绝层。

Not Covered：未刷新固定人工 DSH 环境，未执行 Browser、真实模型会议或远端 CI。

Closure：会议私聊需求、契约与关联代码已退役；公开轮次和正式决策链保留。本次未发布。


## 2026-10-14：退役独立提案与决策链

Scope / Validated Contract：按已确认的实际会议流程调整 MO-FR-7。观点、方案及异议经轮内 EvidenceVersion、Review 和 FormalMessage 表达，不建立独立 ProposalRevision、Position、DecisionCandidate 或 Decision 生命周期。退役对应类型、生产控制与事件、归档字段、accepted_decision 续会素材、decisionIds 依据字段、校验/投影/界面及专用测试。Captain 通过 CompletionFact 直接确认公开成果，必须有非空、已公开且最终审核与送达完成的证据；成果替代、撤销、历史溯源、权限、生命周期、硬约束、风险和确定性完成重算保留。Manager 结束指令及两份改动身份资源指纹已同步，现有模拟业务循环不再提交 decisionIds。历史记录中的提案/立场/决策覆盖与缺口不代表当前范围。

Executed Validation：基于 `6d85ed43` 的 `codex/retire-deliberation` 工作区，新成果确认场景先观察到旧 Decision 依据门槛拒绝，再通过移除该门槛得到 accepted、产出 satisfied 与 converging；有效审核、非公开材料、未送达 Review、替代/撤销和状态前置的既有保护保留。最终根 `pnpm test` 95 个文件、795 项通过，包含 Client、Remote、事务重放、存储与恢复验证；Host/Client/remote-test typecheck、根 lint、插件 format:check、根 build、verify:contract、verify:package 通过。文档本地链接 1150 项零错误，Meeting Interface 的 TypeScript 示例无语法诊断，git diff --check 通过。删除仅服务退役行为的测试资产，混合测试保留当前不变量；未新增迁移、兼容读取、旧格式识别或专用拒绝路径。

Not Covered：未刷新固定人工 DSH 环境，未执行 Browser、真实模型会议或远端 CI。当前没有 Browser 插件，仓库 Playwright 命令不可用；前端结论仅由现有 Client 测试支持。旧持久数据兼容不在当前范围。

Closure：独立提案、立场、候选与正式决策链已退役；正式轮次、Captain 成果确认、风险处置与完成判定保持独立。需求、接口、设计、身份指令和 READINESS 已同步。本次未发布。
