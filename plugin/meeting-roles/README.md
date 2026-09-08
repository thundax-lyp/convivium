# Convivium Meeting Roles

同一发行包附带九个 Definition、共享 `convivium` Preset、九个原生 DSH Skills 和显式部署 patch。资源存在不等于已经通过真实部署验收。

从同一 tarball 安装插件并解包角色资源，将 `CONVIVIUM_MEETING_ROLES_ROOT` 设为解包后 meeting-roles 的绝对目录，在独立 DSH web profile 使用解包后的 `meeting-roles/cordis.patch.yml`，新建 Captain 时显式选择 `convivium` Preset；完整步骤见仓库 [Meeting Roles Deployment](../../docs/50-operations/HOW-TO-MEETING-ROLES.md)。包外阅读时请在源码仓库打开该文档。

选择 `convivium.meeting_manager` 及其余八个 Definition ID，即可组合一位 Manager 和八位 Participant。模型默认值使用 DSH 配置；角色差异通过额外 Host 控制 patch 的 `agentModelOverrides` 提供，仅支持 provider/model/reasoningEffort，控制 patch 在部署 patch 后加载，并完整保留 provider、maxParticipants 和同源 agentDefinitions 表达式；Cordis 不会自动合并 config。

Skill 只提供方法；实际发言资格由 Meeting Runtime 判断，资源权限由 DSH Sandbox/Approval 管理。Manager/Scribe 保留 skill 与各自会议工具，继承的 shell/fs/web 被收窄；其余角色仍服从 Host 权限。不会安装独立 child Preset 或创建能力安装器。

自动入口为 `CONVIVIUM_SMOKE_SCENARIO=meeting-roles pnpm --dir plugin smoke:profile`（仓库根目录）；该场景不支持 Browser 模式。模型差异与冷恢复另由 role-composition 场景验证。两个入口已通过定向测试，role-composition 本轮冷恢复 PASS；meeting-roles 部署接线已修复，九次真实 Skill 加载已有证据，当前公网抓取被运行环境 Fake-IP DNS 的 WEB_BLOCKED_URL 阻断，三研究工具及完整权限验收仍待通过。当前资源不能宣称部署完善。
