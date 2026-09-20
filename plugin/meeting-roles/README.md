# Convivium Meeting Roles

发行包附带七个启用的 Definition、共享 `convivium` Preset、七个原生 DSH Skills 和显式部署 patch：一个专职 Manager、一个专职 Evidence Reviewer，以及五个 Contributor。资源中不包含 Scribe 或 Web Research Analyst。

从同一 tarball 安装插件并解包角色资源，将 `CONVIVIUM_MEETING_ROLES_ROOT` 设为解包后 meeting-roles 的绝对目录，在独立 DSH web profile 使用解包后的 `meeting-roles/cordis.patch.yml`，新建 Captain 时显式选择 `convivium` Preset；用户安装和启动见仓库 [安装并运行 Convivium](../../docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)，角色专项验收见 [Meeting Roles Deployment](../../docs/50-operations/HOW-TO-MEETING-ROLES.md)。包外阅读时请在源码仓库打开这些文档。

选择 `convivium.meeting_manager` 及其余六个 Definition ID，即可组合完整的七角色 Meeting。`meeting_manager` 使用 `1.2.0`，只允许 `skill`、`convivium_open_round`、`convivium_dispose_hand_raise`、`convivium_publish_round` 与 `convivium_recommend_identity`。模型默认值使用 DSH 配置；角色差异通过额外 Host 控制 patch 的 `agentModelOverrides` 提供，仅支持 provider/model/reasoningEffort，控制 patch 在部署 patch 后加载，并完整保留 provider、maxParticipants 和同源 agentDefinitions 表达式；Cordis 不会自动合并 config。

Skill 只提供方法；实际 Meeting 资格由 Meeting Runtime 判断，资源权限由 DSH Sandbox/Approval 管理。Manager 仅保留 skill 与四个 target Meeting command，继承的 shell/fs/web 被收窄；其余角色仍服从 Host 权限。不会安装独立 child Preset 或创建能力安装器。

Evidence Reviewer `1.2.2` 收到 Runtime 提供的 immutable pending set 后，由 coordinator 为每个版本在本轮只创建一个独立的 DSH 原生 one-shot worker，不创建 replacement worker；worker 不具备 Meeting command authority。Coordinator 只继承 `skill`、`subagent` 与 `convivium_submit_review_batch`，只收集 completed 且可规范化的结果，省略失败、取消或不可规范化项；有合法结果时通过一次结构化 batch command 提交，没有合法结果时保持待审。

当前自动入口和可选场景以仓库 [DSH Smoke](../../docs/50-operations/HOW-TO-DSH-SMOKE.md) 为准。`meeting-roles` 和 `role-composition` 是历史验收场景，已不在当前 `smoke:profile` selector 中；历史 Skill、搜索、权限和双 Host 冷恢复结果不能当作本次自动验收通过。
