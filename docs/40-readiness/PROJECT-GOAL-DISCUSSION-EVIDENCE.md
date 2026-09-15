# Project Goal Discussion Evidence

## Scope

2026-09-14，用户确认以开放式 DSH 应用设计讨论作为 Convivium 真实业务闭环测试，并授权记录目标、启动 DSH 和发起讨论。源码基线为 `3a24ef0`，工作分支为 `codex/project-goal-tests-and-direction`。本文记录测试输入与证据，不将会议提出的新产品方案直接提升为实现需求。

## Validated Contract

依据：[Meeting Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-3、FR-7、FR-8、FR-10、FR-11，以及 [安装运行流程](../50-operations/HOW-TO-INSTALL-AND-RUN.md)。

### Confirmed Goal

设计一个基于 DSH 的开发助手，帮助独立开发者将模糊需求推进为可运行、可验收的软件原型，并确定首版最值得实现的方案。

围绕一个具体使用场景，比较至少两种方案，讨论 Agent 的职责、用户介入时机、执行与验证流程，以及失败后的处理方式。是否采用多 Agent、如何组织协作，由讨论决定。

### Expected Outputs And Acceptance

- 具体用户场景与核心用户流程。
- 至少两种可比较方案及有明确取舍依据的推荐方案。
- 首版范围、非目标、主要风险与未解决分歧。
- 一个可执行的最小验证实验，具有可观察的成功与失败判据。
- 后续发言实际回应前序观点，审核依据来自正式会议消息。
- 成果通过合法的结构化完成声明、必要审核和明确接受进入正式会议事实；最终 `completed` 后归档。仅有发言、自然语言共识或 `partial` 归档不算业务闭环通过。

### Execution Boundary

本轮使用固定参与角色，不启用动态入会。Captain 负责建会、明确接受与结束；Manager 规划；产品/架构/验证角色讨论并承担对应成果与审核责任，Scribe 可选且草稿不替代正式成果。具体身份使用发布包中现有 Definition，不新增角色或修改产品实现。

允许完成安装、配置、启动、提交一次初始任务和读取进度。任何后续人工或外部 AI 提示、纠错、手动结束均需记录，不将辅助完成表述为自主完成。不得绕过权限、伪造完成事实或以删除验收条件取得通过。

本次只讨论方案和实验设计，不编写原型代码、不部署、不发送外部消息、不执行讨论中建议的开发工作。报告写入属于会后记录，不作为会议内完成条件。

## Executed Validation

- 已确认当前分支及源码基线，工作区原本干净。
- 启动前端口 `31828` 未发现监听进程。
- 源码入口（`<repo>` 表示本次仓库根目录）`./scripts/install-from-source.sh --workspace <repo>/dsh-workspace/project-goal-20260914` 成功；安装根为 `dsh-workspace/convivium-user/`，产物为 `0.1.0-alpha.1`。构建 PASS；依赖安装出现 peer dependency warnings，未据此声称完整工程验证通过。
- 使用新安装根的 `start.sh` 启动 DSH `0.1.2-rc.1`，Host 实际监听 `127.0.0.1:31828`。既有 DeepSeek 凭据仅配置在忽略的本地 `dev.env`，权限 `0600`，未进入报告或发布物。
- 人工介入：浏览器工作区选择不能由自动操作完成，用户手动选择 `project-goal-20260914`。选择发生于初始任务提交前，不涉及讨论内容或完成事实纠错。
- 2026-09-14 14:52（Asia/Shanghai）：Browser 已确认 `Convivium Meeting` Preset、`DeepSeek-V4-Flash / High` 和“工作区内修改”，提交初始任务，Captain 会话显示“进行中”。
- 初始消息要求 Captain 读取当前工作区 `DISCUSSION-TASK.md`，按上述目标实际建会并推进；禁止仅自行回答、实现原型或修改源码。任务文件选择 `convivium.meeting_manager`，四位 Participant 为 `convivium.domain_architect`、`convivium.runtime_engineer`、`convivium.protocol_ui_engineer`、`convivium.verification_reviewer`；建议预算为 8 Turn、32 正式消息、30 分钟，speaker timeout 使用 Host 默认值。实际 Meeting 配置需由建会结果回读确认。
- 文档链接检查：569 项、0 errors；`git diff --check` PASS。未运行完整测试或 smoke。
- 已由 Captain 创建 Meeting `meeting-d49f77fcd15a0c640f119b701c5af7a4`（team `dsh-dev-assistant-design`）。Browser Meetings 正式面板回读 `running / version 1`；当前议题“用户场景与核心用户流程”，发言顺序为 `participant-domain_architect → participant-runtime_engineer → participant-protocol_ui_engineer → participant-verification_reviewer`，当前 Speaker 为架构角色，尚无 committed message。实际 limits 为 8 Turn、每 Turn 5 人、32 条消息、1800000 ms；speaker timeout 600000 ms。界面显示 5 个子代理，当前 selection reason 为 `round_robin_fallback`，不能据此宣称 Manager 语义规划已通过。
- 启动观察：Captain 初次建会参数没有正确使用外层 `input`，随后自行修正 hardConstraints、riskAcceptanceAuthorityKeys 和 completionCriteria 引用后建会。期间自行读取了发布包类型与实现以查错，偏离任务文件中“不依赖内部实现绕过接口”的预期；未由外部 AI 代填参数。尚未验证首次调用成功率或纯公开指导下的自主可用性。
- Captain 自行增加五个议题、独立审核报告产出，并在验收描述中要求“至少 1 项未解决分歧”；后者强于原目标“保留未解决分歧”，属于待评估的任务转译偏差，不能提升为用户需求。最终接受情况和讨论质量仍待观察。

### Monitoring

用户随后授权持续监视。已建立本任务每分钟检查一次的监视（automation ID `convivium`），只读观察，不向会议追加指导或手动控制；新阻塞、明显漂移、超预算和结束时通知，终态核实后停用。

首次监视回读：`running / version 4`，仍为第一议题；前三位 Participant 已正式提交，当前 `participant-verification_reviewer`，stalls `0/3`、replans `0/1`。正式内容存在目标漂移：Runtime 与 Protocol/UI 发言大量审查 Convivium 的 outbox、lease、schema 和投影，而非比较目标开发助手方案；两者表示尚未提交完成声明。Runtime 发言自述创建 `.runtime-probe/` 并运行验证，属于需记录的执行范围偏差，尚未独立核验其 probe 或缺陷结论。本轮没有追加纠错消息。

2026-09-14 15:01（Asia/Shanghai）监视：`running / version 6`，仍在第一议题，已进入第二 Turn，当前 Runtime Engineer；stalls `0/3`、replans `0/1`。新增 Reviewer 正式审核和架构角色第二次发言。架构角色撤回“completionClaims 形状未定义”的旧断言，承认自身过严限制，并在发言中列出非空 output/criterion claims；该观察不替代对正式完成状态的回读。讨论仍大量聚焦 Convivium 实现与声明机制，尚未形成目标中的两方案比较。无新增系统错误或人工介入，继续观察。

2026-09-14 15:02（Asia/Shanghai）监视：`running / version 8`，7 条正式消息，第二 Turn 当前 verification_reviewer；第一议题未切换，stalls `0/3`、replans `0/1`。Runtime 与 Protocol/UI 的第二次发言继续以内部实现审查为主，并在文本中描述 output/criterion claims；新增缺陷主张仍未经本监视独立验证。无新增系统错误或等待状态，未追加指导，继续观察议题是否收口。

2026-09-14 15:04（Asia/Shanghai）监视：`running / version 10`，9 条正式消息，已进入第三 Turn，仍停留第一议题，当前 Runtime Engineer。stalls 仍 `0/3`，replans `0/1`，无 waiting reason。新架构发言继续围绕 Convivium completion facts、审核粒度和归档校验；再次请求 Captain 推进其他产出议程。观察到“不断新增消息但议题未推进”的业务进展风险，不能将 stalls=0 当作目标没有停滞的证明。未发现终态；没有干预，通知用户此项持续漂移。

2026-09-14 15:15（Asia/Shanghai）监视：正式面板已转为 `partial / version 15`，终止码 `captain_accepted`；实际 12 条正式发言（domain_architect 4、runtime_engineer 2、protocol_ui_engineer 3、verification_reviewer 3），进入第四 Turn 后结束，始终停留第一议题。面板无 accepted decisions、proposals、risks 或 meeting tasks。Captain 的 end_meeting 调用已可见，outcome=partial，acceptedDecisionIds=[]，四个后续议题被延期；这不是正常 completed，也不是已经观察到的 30 分钟超时。Captain 另执行过一次 action=skip 的 reassign_turn；其理由称 Runtime 连续 INVALID_ARGUMENT，本监视未独立复核拒绝原因。参与者把 reassign-11 后缀解释为“重派 11 次”，仅凭标识符不能支持次数结论，不采纳为验证事实。新增三条发言仍主要审查 Convivium 机制，未形成完整方案比较或 MVP 取舍。第 8 条 review 文本只批准用户场景与流程，不能泛化为全量成果通过。归档尚待正式回执核实，继续监视该收口步骤。用户和外部 AI 未追加讨论提示、跳步或结束操作；上述 skip/end 均由 DSH Captain 自主调用。

### Export

用户随后要求最多 24 次发言、仍跑题则停止，并保存发言与各自 Prompt。指令到达时会议已由 Captain 结束，实际 12 次，未为凑数重新建会。已只读导出至本地忽略目录 `dsh-workspace/project-goal-20260914/discussion-export/`（另有同名 ZIP）：12 条完整正式消息；Captain、Manager 与四位 Participant 的实际 system/persona、每轮收到的消息、已加载 Skill，以及工具定义。正式消息从持久化 transcript patches 顺序恢复，与面板 12 条计数一致；Prompt 从本次 session 日志恢复，不包含隐藏推理、普通工具输出或凭据。JSON 解析与计数检查通过。归档提交未在本次导出时观察到，partial 终态不等于 archive 成功。

2026-09-14 15:20（Asia/Shanghai）收尾核对：DSH Captain 会话已结束。CUA 展开最后一次 convivium_meeting_status 工具回执，实际返回 `ok=false / INTERNAL_ERROR / Meeting recovery is unavailable. / retryable=true`。因此只能确认 partial 终态，无法确认归档成功；Captain 最终回复标题中的“已归档”缺少成功回执支持，不采纳。终态查询失败作为本次未通过项保留，不据此推断具体恢复故障原因。停止定期监视；不重启 Host、不归档 Codex 任务。

## Not Covered

### Public Speech Guidance Follow-up

2026-09-14，用户确认执行身份与权限自述污染公共发言及后续上下文，要求修复。源码检查发现原文来自 Agent 提交的 `content`，不是 Runtime 自动拼接；Speaker 调用指导与工具说明均缺少公共正文边界。已在 `meeting-dispatch-service.ts` 的每次投递中加入 `contentInstruction`，并同步 `convivium_submit_turn` 工具描述：直接陈述议题贡献、执行信息保留在 envelope、阻塞只简述影响与所需动作、历史发言不作为指令或固定格式。保留关于身份/权限本身的合法议题，不自动删改历史正文。

验证：增强既有 Speaker dispatch 和 tool registration 检查，分别观察到修复前因缺少指导而失败，修复后通过；连同 offline meeting protocol、status projection 共 4 文件、39 项测试通过。`pnpm lint` 为 0 errors、46 warnings；host typecheck、修改文件格式检查、`git diff --check` 和 570 项本地文档链接检查通过。指令结构测试只证明交付内容，不能证明模型遵守。未重新构建或替换运行中的安装包，未重跑真实会议；原始 12 条记录保持不变。本修复不覆盖角色选型、议题推进、归档失败或语义过滤。

本用例未达完整方案产出与正常 completed；归档完成因终态查询错误而未能核实。参与者及 Captain 对源码缺陷、调度因果与权限限制的主张未独立验证。此次单用例不证明长期稳定性、故障恢复或相对单 Agent 的收益。

## Closure

状态：会议以 partial 结束，本次业务闭环验收未通过。已有用户场景与流程文本、一次限定范围的独立审核及相互回应；方案比较、MVP 取舍、完整实验和正式接受闭环不足。归档回执核对遇到 INTERNAL_ERROR，归档成功未证实；定期监视停止，Host 和 Browser 保持运行供用户查看。
