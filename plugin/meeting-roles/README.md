# Convivium Meeting Roles

现有发行包仍附带包含 Scribe 的九个 Definition、共享 `convivium` Preset、九个原生 DSH Skills 和显式部署 patch。当前正式目标已经删除 `meeting_scribe`，应收敛为八个 Definition/Skills；在资源完成迁移前，本目录只描述旧实现，不能作为当前角色契约已经实现的证据。

从同一 tarball 安装插件并解包角色资源，将 `CONVIVIUM_MEETING_ROLES_ROOT` 设为解包后 meeting-roles 的绝对目录，在独立 DSH web profile 使用解包后的 `meeting-roles/cordis.patch.yml`，新建 Captain 时显式选择 `convivium` Preset；用户安装和启动见仓库 [安装并运行 Convivium](../../docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)，角色专项验收见 [Meeting Roles Deployment](../../docs/50-operations/HOW-TO-MEETING-ROLES.md)。包外阅读时请在源码仓库打开这些文档。

选择 `convivium.meeting_manager` 及其余八个 Definition ID，即可组合一位 Manager 和八位 Participant。模型默认值使用 DSH 配置；角色差异通过额外 Host 控制 patch 的 `agentModelOverrides` 提供，仅支持 provider/model/reasoningEffort，控制 patch 在部署 patch 后加载，并完整保留 provider、maxParticipants 和同源 agentDefinitions 表达式；Cordis 不会自动合并 config。

Skill 只提供方法；实际贡献资格由 Meeting Runtime 判断，资源权限由 DSH Sandbox/Approval 管理。Manager/Scribe 仅保留 skill、会议状态及当前贡献读写工具，继承的 shell/fs/web 被收窄；其余角色仍服从 Host 权限。不会安装独立 child Preset 或创建能力安装器。

当前自动入口和可选场景以仓库 [DSH Smoke](../../docs/50-operations/HOW-TO-DSH-SMOKE.md) 为准。`meeting-roles` 和 `role-composition` 是历史验收场景，已不在当前 `smoke:profile` selector 中；2026-09-08 的九角色 Skill、搜索、权限、双 Host 冷恢复等结果仅作为历史证据，见上述操作文档，不能当作本次自动验收通过。
