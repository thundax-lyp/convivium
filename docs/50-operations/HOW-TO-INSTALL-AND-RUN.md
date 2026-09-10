# 安装并运行 Convivium

## Purpose

本文说明用户如何从源码或已发布 npm 包取得 Convivium tarball，将其安装到持久 DSH web profile，并使用 SQLite、完整会议角色和 Browser UI 运行。`smoke:profile` 使用临时数据，只用于验证，不是用户运行入口。

## Preconditions

- Node.js 满足 `plugin/package.json` 的 engines 要求，pnpm 为 `10.7.0`。
- DSH、Cordis 和 Host provider 使用项目固定的 `0.1.2-rc.1` / `4.0.2` 组合。
- 以下命令从源码仓库根执行；使用 npm 包时，也应在一个由用户选择的空工作目录执行。
- `dsh-workspace/convivium-user/` 是本流程唯一持久根，保存 profile、workspace、SQLite 和已解包发布物；不得指向现有 DSH profile 或其他项目目录。
- DeepSeek 模型、search、fetch、Sandbox 和 Approval 仍由 DSH profile 管理。本文不写入凭据或绕过 Host 权限。

## Obtain The Package

以下两种方式二选一。后续安装和启动必须使用这里取得的同一个 `.tgz`，不能混用源码资产和另一版本的 npm 包。

### From source

```sh
pnpm --dir plugin install --frozen-lockfile
pnpm build
mkdir -p dsh-workspace/convivium-user/artifacts
pnpm --dir plugin pack --pack-destination "$PWD/dsh-workspace/convivium-user/artifacts"
```

### From the npm package

将 `<version>` 替换为要运行的已发布精确版本：

```sh
mkdir -p dsh-workspace/convivium-user/artifacts
npm pack "@convivium/dsh-plugin@<version>" \
    --pack-destination "$PWD/dsh-workspace/convivium-user/artifacts"
```

两种命令都会输出 tarball 文件名。下文用 `<artifact.tgz>` 表示该文件，用 `<release-id>` 表示用户为本次解包选择的唯一目录名。

## Prepare The Persistent Profile

设置发布物路径并解包。`<release-id>` 对应目录必须不存在，防止覆盖另一版本的角色资源：

```sh
usage_root="$PWD/dsh-workspace/convivium-user"
artifact_path="$usage_root/artifacts/<artifact.tgz>"
release_root="$usage_root/releases/<release-id>"

test -f "$artifact_path"
test ! -e "$release_root"
mkdir -p "$release_root" "$usage_root/dsh-home" "$usage_root/workspace"
tar -xzf "$artifact_path" -C "$release_root"
test -f "$release_root/package/meeting-roles/cordis.patch.yml"
```

安装同一 tarball 和官方 SQLite provider 到持久 `web` profile：

```sh
export DSH_HOME="$usage_root/dsh-home"
pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add "$artifact_path"
pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add \
    "@deepseek-ai/dsh-storage-sqlite@0.1.2-rc.1"
```

在 `$usage_root/storage.patch.yml` 创建以下 Host-owned SQLite 配置，并把 `<absolute-usage-root>` 替换为 `usage_root` 的绝对路径：

```yaml
- insert:
    - id: convivium-user-storage-sqlite
      name: "@deepseek-ai/dsh-storage-sqlite"
      config:
        path: "<absolute-usage-root>/convivium-storage.sqlite"
        journalMode: wal
- id: storage-domain
  config:
    backend: sqlite
    routes:
      workspace: json
      session_projcache: json
      message_feedback: json
```

在 `$usage_root/dev.env` 保存且只保存下列变量，填写真实 key 后执行 `chmod 600 "$usage_root/dev.env"`：

```env
DEEPSEEK_API_KEY=
```

## Start

从最初执行目录启动。`CONVIVIUM_MEETING_ROLES_ROOT` 必须指向同一 tarball 解包后的角色目录：

```sh
usage_root="$PWD/dsh-workspace/convivium-user"
release_root="$usage_root/releases/<release-id>"

export DSH_HOME="$usage_root/dsh-home"
export CONVIVIUM_MEETING_ROLES_ROOT="$release_root/package/meeting-roles"
set -a
. "$usage_root/dev.env"
set +a

cd "$usage_root/workspace"
exec pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 web \
    --patch "$usage_root/storage.patch.yml" \
    --patch "$CONVIVIUM_MEETING_ROLES_ROOT/cordis.patch.yml" \
    --host 127.0.0.1 \
    --port 31828 \
    --trusted-host 127.0.0.1:31828
```

DSH 打开 Browser UI 后，新建 Captain Session，并显式选择 `convivium` Preset。进入 `Meetings` view 后即可创建和控制会议。模型默认路由在 DSH Settings 管理；需要角色级差异时，按 [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md) 的 `agentModelOverrides` 规则增加后层控制 patch。

## Assert

- Host 只监听 `127.0.0.1:31828`，Browser 可以打开 DSH UI。
- 新 Captain 明确使用 `convivium` Preset，`Meetings` view 可见。
- 创建会议时 Manager 和 Participant Definition 可用；缺 provider、Skill、模型或 Storage Domain 时必须停止并修正 profile，不能改用空定义或临时内存 fallback。
- 重启同一命令后仍使用相同 `DSH_HOME`、workspace 和 SQLite 文件，已提交会议可以恢复。

## Stop, Upgrade, And Failure Handling

停止发起新操作并等待当前写入完成后，在 Host 终端按 `Ctrl-C`。当前 DSH 没有已验证的固定安全等待时长；页面显示完成不等于所有排队持久化都已完成。不要删除 `dsh-workspace/convivium-user/`，它是用户持久数据根。

升级时取得新的源码或 npm tarball，使用新的 `<release-id>` 解包并再次执行 profile `add`，然后将 `CONVIVIUM_MEETING_ROLES_ROOT` 切换到同版本目录。项目当前不提供数据或 schema migration；升级前不得假定旧数据兼容，也不得自动删除或覆盖 SQLite。

安装失败时保留精确命令和 DSH 错误。缺少 SQLite provider、`spawn` provider、角色资源、模型或凭据都应 fail closed；不得改用 smoke profile、测试 patch、旧 tarball 或其他用户 profile 继续宣称安装成功。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md)
- [DSH 插件冒烟测试](./HOW-TO-DSH-SMOKE.md)
