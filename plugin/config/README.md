# Convivium Role Configuration

发行包的 `config/` 包含八个 Definition、八份角色身份资源、八个独立 `convivium-*` Preset、六项角色能力 Skill、一个用户入口 Skill 和 `cordis.patch.yml`。Definition 和身份资源由内容指纹绑定，不另设版本字段或目录。AGENTS 描述身份、职责与权限，Skill 描述如何完成一类工作。

| 角色                    | Preset                            | 可见 Skills                                         |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| meeting_manager         | convivium-manager                 | meeting-facilitation                                |
| domain_architect        | convivium-domain-architect        | repository-analysis                                 |
| runtime_engineer        | convivium-runtime-engineer        | repository-analysis                                 |
| protocol_ui_engineer    | convivium-protocol-ui-engineer    | repository-analysis                                 |
| verification_reviewer   | convivium-verification-reviewer   | arxiv、evidence-review、github、repository-analysis |
| github_research_analyst | convivium-github-research-analyst | github                                              |
| arxiv_research_analyst  | convivium-arxiv-research-analyst  | arxiv                                               |
| web_research_analyst    | convivium-web-research-analyst    | web                                                 |

每项能力使用 `skills/<能力名>/SKILL.md`，可以附带同目录 `scripts/`；加载 Skill 本身不执行脚本。角色 Preset 的 filesystem provider 关闭默认 Skill 根，只加载分配的目录。模型上下文、列表和按名称加载都受角色隔离；这不承诺本机静态文件保密。全局注册的工具也不等于角色获得业务权限：Definition 收窄模型工具面，Runtime 另行校验 MeetingIdentity 与持久 ownership。

部署变量 `CONVIVIUM_MEETING_ROLES_ROOT` 必须指向 **DSH profile 已安装插件的 `config/` 真实绝对路径**，与插件入口解析的 package root 一致。不得指向另一份解包副本或源码目录。正式 `start.sh` 会从 profile 的 package 路径解析此位置。安装与启动见仓库 [安装并运行 Convivium](../../docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)，专项核对见 [Meeting Roles Deployment](../../docs/50-operations/HOW-TO-MEETING-ROLES.md)；包外阅读时在源码仓库打开链接。

用户可在普通聊天中输入 `/convivium <会议目标>` 直接创建，Manager、Reviewer、Host 默认选择的 GitHub/arXiv/Web 三位 Contributor 与初始字段由受控启动方法补齐；`Meetings` 面板用于查看会议和执行暂停、恢复、异常取消；正常结束由 Manager 判断并提交，不提供创建或结构化操作表单，无须新建 Captain Session 或选择共享 Preset。安装器将用户入口 Skill 关联到当前 `DSH_HOME/skills/convivium/`，角色 Preset 的独立 Skill 根不含它。每个会议身份使用独立、无 parent 的 AgentSession；用户输入 Session 关闭不影响会议投递。正式交流只经 Meeting Runtime。DSH 原生专职 Reviewer 只调用一次 `convivium_run_review_worker` 对每个 immutable version 创建 one-shot subagent；worker 没有 Meeting command authority，Runtime 校验合法 completed 结构化结果后，使用捕获的 claim 和原 reviewer 权限直接提交并返回 accepted/rejected。Coordinator 不转抄结果，没有独立审核提交工具；失败或取消不提交。

Definition 可选 `agentOptions` 是新建身份的完整执行选择：必须同时提供 `provider`、`model`，可选 `reasoningEffort`；字符串 trim 后不得为空，不接受其它字段。省略整个对象时才使用 DSH Settings 的完整默认选择；显式对象不继承 Host 的模型或 reasoning。`agentModelOverrides` 已退役。预检保存 provider 解析后的实际选择与 reasoning 默认值，无法确定默认则拒绝，恢复始终使用原持久绑定。模型选择不改变身份 hash，但参与能力组合 hash；不热换已有会议。

Host 可配置可选 `acpCodex: {command, args}`：command 必须是绝对可执行文件路径，args 为必填字符串数组（允许空），不接受 env、凭据或额外配置。ACP provider、会议身份/worker 接线与执行阻断诊断已实现；ACP root/worker 只使用外部原生工具和 Skills，由宿主校验 JSON 并提交正式 Review。已完成一轮真实核心链路冒烟，完整两轮、原绑定冷恢复、Web 正文读取和最终归档仍未覆盖；实际证据见 [Current Implementation Coverage](../../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#acp-native-execution-migration)，配置存在本身不证明真实验收通过。发行 Definition 不携带账户专有模型或启动路径。

额外 Host patch 必须完整保留 provider、maxParticipants、initialContributorRoleIds 和同源 agentDefinitions 表达式；Cordis 不自动合并 config。发行默认 contributors 按 GitHub/arXiv/Web 排序，maxParticipants 为 8。动态准入的首份 descriptor/ownership 固定不可变选择；provisioning 到期撤权清理，不刷新同 admissionId；active 恢复不受旧准入 TTL 影响。

自动验收入口为 `smoke:profile --all --json`，包含 `identity-admission`、`meeting-business-loop`、`peer-meeting-agents`。实际通过记录与未覆盖边界见仓库 readiness；资源存在不等于真实模型、来源读取或冷恢复通过。
