# Meeting Roles Deployment

## Purpose And Preconditions

本文说明七个平级会议 Agent 的角色资源部署和核对。每场会议创建一位 Manager、一位专职 Evidence Reviewer 和五位 Contributor；Reviewer 的逐版本 one-shot worker 仍使用 subagent。正式契约见 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)，恢复与权限边界见 [Peer Meeting Agents Design](../30-designs/PEER-MEETING-AGENTS-DESIGN.md)，实际覆盖见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

- Node/pnpm 满足 `plugin/package.json`，DSH 固定 `0.1.2-rc.1`。
- 发行包包含 `config/definitions.json`、七份 AGENTS、七个 Preset、五项能力 Skill、一个用户入口 Skill 和部署 patch。
- Host 提供模型路由、Agent factory、Preset/Skill Loader、Session persistence、SQLite Storage Domain；Reviewer worker 所需的 spawn provider 和来源读取工具由 Host 提供。
- 凭据按 [Smoke Operations](./HOW-TO-DSH-SMOKE.md) 管理，不写入包、patch、终端输出或结果。缺模型、工具、资源或凭据时停止，不能以测试替身声称研究能力可用。

## Deploy And Start

使用 [安装并运行 Convivium](./HOW-TO-INSTALL-AND-RUN.md) 的安装器与 `start.sh`，不维护第二套人工安装命令。人工 Web 验收必须使用 [固定人工环境](./HOW-TO-DSH-SMOKE.md#人工-web-调试与验收)，自动验收使用独立临时 profile。

`start.sh` 从 `$DSH_HOME/profiles/web/node_modules/@convivium/dsh-plugin/config` 解析真实路径，设置 `CONVIVIUM_MEETING_ROLES_ROOT`，再加载该目录的 `cordis.patch.yml`。此变量是非敏感部署路径，必须与插件入口的 package root 一致；另一份解包副本即使内容相同也不是运行资源根。不要自行改为源码目录或用 patch baseUrl 猜测路径。

Host 的默认 Preset 保持 `standard`。用户在普通聊天输入 `/convivium <会议目标>` 直接创建会议，受控方法自动补齐七角色、初始议题和限制；`Meetings` 面板只负责查看和控制。七角色 Definition 当前版本均为 `2.0.0`。Captain 就是可信本地用户，无须 Captain Session。聊天 Skill 通过一次性授权工具走同一创建事务，十项控制及暂停/继续/结束经 loopback Remote；Meeting Agent 没有用户控制工具。输入 Session 关闭、面板重新连接均不改变会议授权。

## Role Assets And Models

| Definition 后缀         | Preset                            | 分配的 Skills                                       |
| ----------------------- | --------------------------------- | --------------------------------------------------- |
| meeting_manager         | convivium-manager                 | meeting-facilitation                                |
| domain_architect        | convivium-domain-architect        | repository-analysis                                 |
| runtime_engineer        | convivium-runtime-engineer        | repository-analysis                                 |
| protocol_ui_engineer    | convivium-protocol-ui-engineer    | repository-analysis                                 |
| verification_reviewer   | convivium-verification-reviewer   | arxiv、evidence-review、github、repository-analysis |
| github_research_analyst | convivium-github-research-analyst | github                                              |
| arxiv_research_analyst  | convivium-arxiv-research-analyst  | arxiv                                               |

Definition ID 为 `convivium.<后缀>`。`config/agents/<后缀>/2.0.0/AGENTS.md` 由插件在 scoped setup 中显式注册为身份指令；具体目录以发行包 Definition 的资源引用为准。DSH 原生 cwd AGENTS 仍按 Host 规则加载。能力使用 `config/skills/<能力名>/SKILL.md`，可附带 `scripts/`；加载 Skill 不会执行脚本。隔离覆盖模型上下文、Skill 列表和按名称加载，不承诺本机文件系统保密。

模型默认值由 DSH Settings 管理；角色差异通过额外 Host patch 的 `convivium.config.agentModelOverrides` 提供。key 为 Definition ID，value 仅含 provider/model/reasoningEffort，值必须来自 Host 支持的真实路由。该 patch 在角色 patch 后加载；Cordis 整体替换 config，因此须保留 provider、maxParticipants、完整 agentDefinitions 表达式。不要编辑 AGENTS/Skill 或凭据实现模型覆盖。

创建时固化资源哈希、模型 options 和 Session ID。修改配置不会重配已创建身份；冷恢复必须匹配原绑定，缺失或变更资源时拒绝恢复。

## Acceptance

先运行 `pnpm --dir plugin verify`，再运行 `pnpm --dir plugin smoke:profile --all --json`。完整结果必须包含三个场景，具体断言见 [Smoke Operations](./HOW-TO-DSH-SMOKE.md)。必须观察：

- 七个不同且无 parent 的 Meeting-owned Session，各自 Preset 与精确 Skill 分配一致，未分配的 Skill 按名称不可加载。
- 输入 Session 关闭后仍向七身份投递 notice；用户重连可以控制，Agent 无法调用用户创建入口。
- GitHub 与 arXiv 角色实际读取来源并记录固定版本；Skill 存在或 URL 回显不算内容读取。
- Reviewer 对 immutable EvidenceVersion 运行真实 one-shot worker，取得合法 completed 输出；worker 没有 Meeting command authority。
- 同一 DSH_HOME 和 SQLite 冷启动后，保留原 Session、资源、模型绑定和会议事实；暂停不恢复投递，继续后恢复原 Agent。
- 四轮业务仍完成八份独立审核、四次发布、归档和 cold reopen。

正式交流只经 Runtime，不开放绕过会议记录的 Agent 直发工具。toolFilter 不等于 OS Sandbox，Runtime 仍逐次校验权限。

## Failure, Restore And Compatibility

资源不匹配、预检过期、Loader/模型不可用、Session 缺失或 flush 失败均记录具体阶段和错误；不得替换 Session ID、延长旧 descriptor 或关闭权限校验来继续。失败创建先撤权并清理；归档关闭失败保留撤权状态并重试。恢复资源时使用原发布物，保留原数据库和 Session。

私有持久化使用 v2；旧 v1 明确返回 `SCHEMA_VERSION_UNSUPPORTED`，损坏 v2 返回 `CORRUPT_DATABASE`。不提供自动迁移，不删除用户持久环境来掩盖失败。

人工 Host 在原终端 Ctrl+C，确认本次进程退出且端口释放，保留固定环境。自动 smoke 由 wrapper 清理自己的临时 Host/端口/目录，Restore 失败即整轮失败。不得杀掉全部 DSH 进程或清空其他 profile。

## Evidence And Not Covered

把日期、commit/工作树范围、DSH 版本、命令、三个场景 observed 和 Restore 结果记入 readiness。人工 Browser、跨 Host、长期模型任务质量、MeetingTask/session_mail 完整生产链不由这些自动结果证明。
