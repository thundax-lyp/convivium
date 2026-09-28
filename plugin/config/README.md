# Convivium Role Configuration

发行包的 `config/` 包含七个 Definition、七份角色 `AGENTS.md`、七个独立 `convivium-*` Preset、五项角色能力 Skill、一个用户入口 Skill 和 `cordis.patch.yml`。Definition 当前版本均为 `2.0.0`。AGENTS 描述身份、职责与权限，Skill 描述如何完成一类工作。

| 角色                    | Preset                            | 可见 Skills                                         |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| meeting_manager         | convivium-manager                 | meeting-facilitation                                |
| domain_architect        | convivium-domain-architect        | repository-analysis                                 |
| runtime_engineer        | convivium-runtime-engineer        | repository-analysis                                 |
| protocol_ui_engineer    | convivium-protocol-ui-engineer    | repository-analysis                                 |
| verification_reviewer   | convivium-verification-reviewer   | arxiv、evidence-review、github、repository-analysis |
| github_research_analyst | convivium-github-research-analyst | github                                              |
| arxiv_research_analyst  | convivium-arxiv-research-analyst  | arxiv                                               |

每项能力使用 `skills/<能力名>/SKILL.md`，可以附带同目录 `scripts/`；加载 Skill 本身不执行脚本。角色 Preset 的 filesystem provider 关闭默认 Skill 根，只加载分配的目录。模型上下文、列表和按名称加载都受角色隔离；这不承诺本机静态文件保密。全局注册的工具也不等于角色获得业务权限：Definition 收窄模型工具面，Runtime 另行校验 MeetingIdentity 与持久 ownership。

部署变量 `CONVIVIUM_MEETING_ROLES_ROOT` 必须指向 **DSH profile 已安装插件的 `config/` 真实绝对路径**，与插件入口解析的 package root 一致。不得指向另一份解包副本或源码目录。正式 `start.sh` 会从 profile 的 package 路径解析此位置。安装与启动见仓库 [安装并运行 Convivium](../../docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)，专项核对见 [Meeting Roles Deployment](../../docs/50-operations/HOW-TO-MEETING-ROLES.md)；包外阅读时在源码仓库打开链接。

用户可在普通聊天中输入 `/convivium <会议目标>` 直接创建，缺省的七角色与初始字段由受控启动方法补齐；`Meetings` 面板用于查看会议和执行暂停、恢复、结束，不提供创建或结构化操作表单，无须新建 Captain Session 或选择共享 Preset。安装器将用户入口 Skill 关联到当前 `DSH_HOME/skills/convivium/`，角色 Preset 的独立 Skill 根不含它。每个会议身份使用独立、无 parent 的 AgentSession；用户输入 Session 关闭不影响会议投递。正式交流只经 Meeting Runtime。专职 Reviewer 使用 `convivium_run_review_worker` 对每个 immutable version 创建 one-shot subagent，worker 没有 Meeting command authority，只有合法 completed 结果才能提交审核。

模型默认值来自 DSH Settings，角色差异使用额外 Host patch 的 `agentModelOverrides`（provider/model/reasoningEffort）。该 patch 在角色 patch 后加载，并完整保留 provider、maxParticipants 和同源 agentDefinitions 表达式；Cordis 不自动合并 config。已创建 Agent 恢复沿用原资源、模型和 Session 绑定，资源不一致时拒绝恢复。

自动验收入口为 `smoke:profile --all --json`，包含 `identity-admission`、`meeting-business-loop`、`peer-meeting-agents`。实际通过记录与未覆盖边界见仓库 readiness；资源存在不等于真实模型、来源读取或冷恢复通过。
