# Meeting Roles Deployment

## Purpose And Status

本文规定初次发布的一位 Manager、八位 Participant、共享 convivium Preset 和九个原生 Skills 的部署流程。**2026-09-08 状态：角色模型、发行资源和自动探针已实现并通过定向门禁；完整 verify 和 role-composition 已通过；部署接线已修复，九 Skill 加载已有真实证据；meeting-roles 当前被本机 Fake-IP DNS 的 WEB_BLOCKED_URL 阻断，尚不能宣称部署通过。** 完成 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#shared-preset-role-composition) 的首发验证后才能移除此状态说明。

本流程只使用独立本地 DSH web profile，不修改日常 profile。角色和模型契约见 [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)，资源结构见 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)。

## Preconditions

- 本地 Node/pnpm 满足 plugin/package.json，DSH 固定 0.1.2-rc.1。
- 发行包已经包含 meeting-roles/definitions.json、共享 Preset、九个 Skills、显式部署 patch，并通过完整 verify 和真实 Loader 验收。
- DSH web profile 提供 spawn continuable provider、模型默认路由、DeepSeek search 与 http fetch；本流程不新增 Provider 或绕过 Sandbox/Approval。
- 凭据沿 [Smoke Operations](./HOW-TO-DSH-SMOKE.md) 的 dev.env 规则，仅包含 DEEPSEEK_API_KEY，不能写进包、patch、终端输出或结果文件。缺少凭据时停止，不假称研究能力可用。
- 以下目录 dsh-workspace/meeting-roles-deployment 必须不存在；已存在时停止，不覆盖或自动清空。

## Prepare

由仓库根目录执行以下命令；资源缺失或 verify 失败时停止，不能跳过。

```sh
(
    set -eu
    test -f plugin/meeting-roles/definitions.json
    test -f plugin/meeting-roles/cordis.patch.yml
    test ! -e dsh-workspace/meeting-roles-deployment
    pnpm --dir plugin verify
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
    test -f "$role_deploy_root/resources/package/meeting-roles/cordis.patch.yml"
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
    role_patch="$role_deploy_root/resources/package/meeting-roles/cordis.patch.yml"
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

在本地页面新建 Captain Session，**显式选择 convivium Preset**。Host Settings 的默认选择可能优先于 patch 的 default，不能仅凭默认值推断已经选择成功。选择定义时 Manager 为 convivium.meeting_manager；八位 Participant 分别使用其余八个 Definition ID，名单见 Interface。不需要为每位角色另装 Preset、改写 JSON 或部署第二个 package。

`CONVIVIUM_MEETING_ROLES_ROOT` 是非敏感 Host 部署变量，仅定位同 tarball 的固定资产；不能使用 patch 表达式的 baseUrl 推导该位置。变量缺失时 Loader 必须失败。

模型默认值在 DSH 配置/Settings 中管理。必要角色差异通过额外 Host 控制 patch 的 convivium.config.agentModelOverrides 提供，key 为 Definition ID，value 只含 provider/model/reasoningEffort；该控制 patch 在角色部署 patch 后加载。Cordis 整体替换 config，必须同时保留 provider: spawn、maxParticipants: 8 和部署 patch 中的完整 agentDefinitions 读取表达式，再加入 agentModelOverrides，不能只写模型 map。这里的值必须来自宿主已配置、支持的真实模型路由，不提供猜测的模型 ID，不编辑 Definition/Skill 或 credentials 来实现覆盖。

## Assert

首发运行验收须同时观察：

- Loader 挂载 convivium，启用的原生工具、Skill provider 和 compaction row 没有缺失依赖；九个 required Skill 都可被准确父 scope 读取。
- 同一会议创建一位 Manager、八位 Participant，九个独立 continuable Session；不是九条静态目录记录。
- 每个 child 原生 Session 中出现 skill tool/call 和成功 tool/result，正文包含其方法步骤。只有目录发现或服务 get 成功不算加载。
- GitHub/arXiv/Web 三类研究角色的真实 search 返回对应域的非空来源，fetch 返回成功 HTTP 与非空正文；缺 Provider 或凭据是失败。
- Manager/Scribe 的越权会议写入被真实工具执行层拒绝，Meeting 事实不变；自动探针各执行一次越权会议工具和 web_search，均须返回 DSH UNKNOWN_TOOL，skill 仍可见；shell/fs 的上限由发布定义的原生 allowlist 表达，本探针不直接执行它们；不将该过滤等同于 OS Sandbox。
- 不同角色的模型覆盖保持差异，父 Session 未被更改，冷恢复保留原 descriptor；配置变化不重配旧角色。

自动验收入口为：

```sh
env CONVIVIUM_SMOKE_SCENARIO=meeting-roles pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile
```

前者证明发布资源、九角色与原生能力；后者证明模型/persona/filter 差异和两个 Host 的冷恢复。两者不能互相替代，均要求 Restore PASS。meeting-roles 不支持 Browser 模式，也不加入默认五个核心场景。它从同一 tarball 解包资源，按部署 patch → 临时控制 patch 加载，显式挂载 convivium Captain，并通过原生 agentOptions 选择 deepseek-official/deepseek-v4-flash，供子会话继承；控制 patch 设八人容量和 300000ms speaker timeout，并重述同一资源 JSON 的读取表达式以保留角色定义。创建后暂停会议并中断当前 child 执行，再逐个发送固定 Skill 验证请求；每个 child 最多 180000ms，场景结果最多等待 2400000ms。
部署探针在目标 child 成功 Skill 调用的原生 tools/post-execute 回调内完成研究工具、权限拒绝与 status 检查，返回原 decision，并在 finally 注销回调。continuable child 空闲后可被 DSH 释放，不能缓存旧 Agent 在 idle 后调用工具。检查仍要求真实 Provider 结果，Fake-IP DNS 的非公网地址拒绝不能计为抓取通过；应由运行环境为目标公网域名提供真实公网解析，不放宽 DSH 检查。

## Restore And Failure Handling

前台 Host 用 Ctrl+C 停止，确认本次 Host 退出且 31828 端口释放。不能通过杀掉所有 DSH 进程或清空日常 profile 处理失败。

人工流程产生的独立 dsh-workspace/meeting-roles-deployment 包含 Session/会议数据，默认保留用于诊断；仅在明确决定丢弃此次运行后删除该精确目录，不影响其他 dsh-workspace 内容。自动 smoke 使用自己的临时根和已记录 PID，由原 wrapper 的 finally 负责清理，任何 Restore 失败都算整轮失败。

缺资产、版本不匹配、Loader row 不可用、Skill 加载失败、外部 Provider 错误或模型超时都应停止并记录失败阶段。不能更换成 fake Skill/search、删权限限制或使用旧格式继续。数据恢复仍使用 DSH descriptor 与 Convivium ownership，不部署迁移器。

## Evidence And Not Covered

执行后将日期、版本、artifact 边界、命令、九角色结果、权限拒绝、恢复和 Restore 写入 [Smoke Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md)，并更新 Coverage。本轮失败与清理证据见 [Meeting Roles Deployment](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#meeting-roles-deployment)；修复前不要据上述命令宣称九角色部署成功。

长期模型任务质量、独占 Skill/per-child Preset、动态 admission、日常 profile 和 Host capability 内容变更后的历史快照不在本流程内；必需的九角色部署与研究工具可用性不能作为 Not Covered 跳过。
