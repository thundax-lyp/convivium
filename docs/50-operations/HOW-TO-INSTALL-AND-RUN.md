# 安装并运行 Convivium

## Purpose

本文说明用户如何从源码或已发布 npm 包取得 Convivium tarball，将其安装到持久 DSH web profile，并使用 SQLite、完整会议角色和 Browser UI 运行。`smoke:profile` 使用临时数据，只用于验证，不是用户运行入口。

## Preconditions

- Node.js 满足 `plugin/package.json` 的 engines 要求，pnpm 为 `10.7.0`。
- DSH、Cordis 和 Host provider 使用项目固定的 `0.1.2-rc.1` / `4.0.2` 组合。
- 源码命令从仓库根执行；使用 npm 包时，在一个由用户选择的空工作目录执行。
- `dsh-workspace/convivium-user/` 是本流程唯一持久根，保存 profile、workspace、SQLite 和已解包发布物；不得指向现有 DSH profile 或其他项目目录。
- DeepSeek 模型、search、fetch、Sandbox 和 Approval 仍由 DSH profile 管理。本文不写入凭据或绕过 Host 权限。

## Install

以下两种方式二选一。脚本自动取得 tarball、从其中的 `package.json` 判断版本，并以同一个 tarball 安装插件和会议角色资源；用户不填写版本或 release-id。

### From source

```sh
./scripts/install-from-source.sh
```

该入口执行 frozen install、构建和打包，再复用发布包中的 `install.sh`。默认安装根为源码仓库的 `dsh-workspace/convivium-user/`。

### From the npm package

```sh
npm exec --yes --package @convivium/dsh-plugin@next -- convivium-install
```

`npm exec` 只负责取得当前发布包；安装脚本以实际下载 tarball 内的 manifest 作为版本依据。默认 DSH workspace 为执行目录下的 `dsh-workspace/`，安装状态位于其中的 `convivium-user/`。

需要使用另一个 DSH workspace 时，通过安装参数指定；源码和 npm 入口均支持：

```sh
./scripts/install-from-source.sh --workspace /absolute/path/to/dsh-workspace
npm exec --yes --package @convivium/dsh-plugin@next -- \
    convivium-install --workspace /absolute/path/to/dsh-workspace
```

安装入口创建并保护持久 `dsh-home`、workspace、SQLite patch、release 资源和 `dev.env`，并将实际版本写入 `release`。已有 release、artifact 和用户配置不会被覆盖。

在安装根的 `dev.env` 中填写真实 key；该文件只在不存在时生成，首次生成权限为 `600`。后续安装直接复用已有文件，不覆盖内容或修改权限：

```env
DEEPSEEK_API_KEY=
```

## Start

从执行安装命令的目录启动：

```sh
./dsh-workspace/convivium-user/start.sh
```

该脚本读取安装时记录的 release 和 DSH workspace 绝对路径，设置同一持久 `DSH_HOME` 和角色资源根，再启动固定版本的 DSH Web。

DSH 打开 Browser UI 后，新建 Captain Session，并显式选择 `convivium` Preset。进入 `Meetings` view 后即可创建和控制会议。模型默认路由在 DSH Settings 管理；需要角色级差异时，按 [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md) 的 `agentModelOverrides` 规则增加后层控制 patch。

## Assert

- Host 只监听 `127.0.0.1:31828`，Browser 可以打开 DSH UI。
- 新 Captain 明确使用 `convivium` Preset，`Meetings` view 可见。
- 创建会议时 Manager 和 Participant Definition 可用；缺 provider、Skill、模型或 Storage Domain 时必须停止并修正 profile，不能改用空定义或临时内存 fallback。
- 重启同一命令后仍使用相同 `DSH_HOME`、workspace 和 SQLite 文件，已提交会议可以恢复。

## Stop, Upgrade, And Failure Handling

停止发起新操作并等待当前写入完成后，在 Host 终端按 `Ctrl-C`。当前 DSH 没有已验证的固定安全等待时长；页面显示完成不等于所有排队持久化都已完成。不要删除 `dsh-workspace/convivium-user/`，它是用户持久数据根。

升级时重新执行原安装入口；入口自动取得并记录新的实际版本。版本对应 release 已存在时安装停止，不覆盖原资源。项目当前不提供数据或 schema migration；升级前不得假定旧数据兼容，也不得自动删除或覆盖 SQLite。

安装失败时保留精确命令和 DSH 错误。缺少 SQLite provider、`spawn` provider、角色资源、模型或凭据都应 fail closed；不得改用 smoke profile、测试 patch、旧 tarball 或其他用户 profile 继续宣称安装成功。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md)
- [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md)
- [DSH 插件冒烟测试](./HOW-TO-DSH-SMOKE.md)
