# Meeting Roles Deployment

## Purpose And Status

本文记录当前一位 Manager、一个专职 Evidence Reviewer、五个 Contributor、共享 `convivium` Preset 和七个原生 Skills 的人工部署与核对流程。资源中不包含 `meeting_scribe` 或 `web_research_analyst`。当前自动冒烟只覆盖 identity admission 和 business loop；本文的完整角色能力人工核对不得冒充自动 smoke 证据。覆盖缺口见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

本流程只使用独立本地 DSH web profile，不修改日常 profile。角色和模型契约见 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)，资源结构见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

本文聚焦角色资源部署和验收；用户从源码或 npm 包安装插件、配置持久 SQLite 并启动 DSH Web 的完整流程见 [安装并运行 Convivium](./HOW-TO-INSTALL-AND-RUN.md)。

## Preconditions

- 本地 Node/pnpm 满足 plugin/package.json，DSH 固定 0.1.2-rc.1。
- 发行包已经包含 `meeting-roles/definitions.json`、共享 Preset、七个 Skills 和显式部署 patch。
- DSH web profile 提供 spawn continuable provider、模型默认路由、DeepSeek search 与 http fetch；本流程不新增 Provider 或绕过 Sandbox/Approval。
- 凭据沿 [Smoke Operations](./HOW-TO-DSH-SMOKE.md) 的 `dev.env` 规则：`DEEPSEEK_API_KEY` 必须存在且非空，其他本地条目允许存在；凭据不能写进包、patch、终端输出或结果文件。缺少凭据时停止，不假称研究能力可用。
- 以下目录 dsh-workspace/meeting-roles-deployment 必须不存在；已存在时停止，不覆盖或自动清空。

## Prepare

由仓库根目录执行以下命令；资源缺失或 verify 失败时停止，不能跳过。

```sh
(
    set -eu
    test -f plugin/config/definitions.json
    test -f plugin/config/cordis.patch.yml
    test ! -e dsh-workspace/meeting-roles-deployment
    pnpm verify
    mkdir -p dsh-workspace/meeting-roles-deployment/artifacts
    mkdir -p dsh-workspace/meeting-roles-deployment/resources
    mkdir -p dsh-workspace/meeting-roles-deployment/dsh-home
    mkdir -p dsh-workspace/meeting-roles-deployment/workspace
    chmod 700 dsh-workspace/meeting-roles-deployment
    role_deploy_root="$PWD/dsh-workspace/meeting-roles-deployment"
    cd plugin
    role_pack_name="$(pnpm pack --json --pack-destination "$role_deploy_root/artifacts" | node -e 'let text = ""; process.stdin.on("data", value => text += value); process.stdin.on("end", () => { const result = JSON.parse(text); process.stdout.write((Array.isArray(result) ? result[0] : result).filename); });')"
    role_artifact="$role_deploy_root/artifacts/$(basename "$role_pack_name")"
    tar -xzf "$role_artifact" -C "$role_deploy_root/resources"
    test -f "$role_deploy_root/resources/package/config/cordis.patch.yml"
    DSH_HOME="$role_deploy_root/dsh-home" pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add "$role_artifact"
)
```

插件安装与资源解包必须来自同一个 tarball。不能把源码目录、旧 examples 或临时 fixture Skill 当作安装结果。上述子进程不得预先加载 dev.env；凭据只进入启动阶段。

## Execute

先按 Smoke Operations 核验 dev.env 格式和权限，再从仓库根目录运行。端口 31828 已被占用时停止本次流程，不终止其他进程。

```sh
(
    set -eu
    role_repo_root="$PWD"
    role_deploy_root="$PWD/dsh-workspace/meeting-roles-deployment"
    role_patch="$role_deploy_root/resources/package/config/cordis.patch.yml"
    test -f "$role_patch"
    set -a
    . "$role_repo_root/dev.env"
    set +a
    export DSH_HOME="$role_deploy_root/dsh-home"
    export CONVIVIUM_MEETING_ROLES_ROOT="$role_deploy_root/resources/package/meeting-roles"
    cd "$role_deploy_root/workspace"
    exec pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 web \
        --patch "$role_patch" \
        --no-open --host 127.0.0.1 --port 31828 \
        --trusted-host 127.0.0.1:31828
)
```

在本地页面新建 Captain Session，**显式选择 `convivium` Preset**。Host Settings 的默认选择可能优先于 patch 的 default，不能仅凭默认值推断已经选择成功。Meeting 由该 Captain Session 的 `convivium_create_meeting` tool 创建；创建请求精确选择 `convivium.meeting_manager`、`convivium.verification_reviewer` 和五个 Contributor Definition，名单与版本以同一 tarball 的 `meeting-roles/definitions.json` 为准。Remote/Meetings view 不提供替代创建入口。不需要为每位角色另装 Preset、改写 JSON 或部署第二个 package。

`CONVIVIUM_MEETING_ROLES_ROOT` 是非敏感 Host 部署变量，仅定位同 tarball 的固定资产；不能使用 patch 表达式的 baseUrl 推导该位置。变量缺失时 Loader 必须失败。

模型默认值在 DSH 配置/Settings 中管理。必要角色差异通过额外 Host 控制 patch 的 convivium.config.agentModelOverrides 提供，key 为 Definition ID，value 只含 provider/model/reasoningEffort；该控制 patch 在角色部署 patch 后加载。Cordis 整体替换 config，必须同时保留 provider: spawn、maxParticipants: 8 和部署 patch 中的完整 agentDefinitions 读取表达式，再加入 agentModelOverrides，不能只写模型 map。这里的值必须来自宿主已配置、支持的真实模型路由，不提供猜测的模型 ID，不编辑 Definition/Skill 或 credentials 来实现覆盖。

## Assert Current Resources

必须同时观察：

- Loader 挂载 `convivium`，启用的原生工具、Skill provider 和 compaction row 没有缺失依赖；七个 required Skill 都可被准确父 scope 读取。
- 同一会议创建一位 Manager、一个专职 Evidence Reviewer 和五个 Contributor，共七个独立 continuable Session；不是七条静态目录记录。
- 每个 child 原生 Session 中出现 skill tool/call 和成功 tool/result，正文包含其方法步骤。只有目录发现或服务 get 成功不算加载。
- GitHub/arXiv 两类研究角色的真实 search 返回对应域的非空来源，fetch 返回成功 HTTP 与非空正文；缺 Provider 或凭据是失败。
- Manager 和 Evidence Reviewer 的越权会议写入被真实工具执行层拒绝，Meeting 事实不变；tool filter 不等同于 OS Sandbox。
- Evidence Reviewer 为每个独立 claim 中的 immutable version 只创建一个 one-shot worker，worker 没有 Meeting command authority；只有该 worker 返回 completed 且结构化结果有效时，才能通过对应 claim 单独提交该 version 的 Review。
- 不同角色的模型覆盖保持差异，父 Session 未被更改，冷恢复保留原 descriptor；配置变化不重配旧角色。

当前 `smoke:profile` 不提供 `meeting-roles` 或 `role-composition` selector；不得执行历史命令或把旧结果当作当前七身份验收。自动入口和已验证边界以 [Smoke Operations](./HOW-TO-DSH-SMOKE.md) 与 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为准。

## Restore And Failure Handling

前台 Host 用 Ctrl+C 停止，确认本次 Host 退出且 31828 端口释放。不能通过杀掉所有 DSH 进程或清空日常 profile 处理失败。

人工流程产生的独立 dsh-workspace/meeting-roles-deployment 包含 Session/会议数据，默认保留用于诊断；仅在明确决定丢弃此次运行后删除该精确目录，不影响其他 dsh-workspace 内容。自动 smoke 使用自己的临时根和已记录 PID，由原 wrapper 的 finally 负责清理，任何 Restore 失败都算整轮失败。

缺资产、版本不匹配、Loader row 不可用、Skill 加载失败、外部 Provider 错误或模型超时都应停止并记录失败阶段。不能更换成 fake Skill/search、删权限限制或使用旧格式继续。数据恢复仍使用 DSH descriptor 与 Convivium ownership，不部署迁移器。

## Evidence And Not Covered

执行后将日期、版本、artifact 边界、命令、七身份结果、权限拒绝、恢复和 Restore 写入 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)，并更新对应功能点。本轮尚无当前角色契约的完整人工运行验收记录。

长期模型任务质量、独占 Skill/per-child Preset、动态 admission、日常 profile 和 Host capability 内容变更后的历史快照不在本流程内；完整人工验收仍须覆盖七身份部署、GitHub/arXiv 搜索与抓取。
