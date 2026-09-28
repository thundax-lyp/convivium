# 安装并运行 Convivium

## Purpose

本文说明用户如何从源码或已发布 npm 包取得 Convivium tarball，将其安装到持久 DSH web profile，并使用 SQLite、完整会议角色和 Browser UI 运行。`smoke:profile` 使用临时数据，只用于验证，不是用户运行入口。

## Preconditions

- Node.js 满足 `plugin/package.json` 的 engines 要求，pnpm 为 `10.7.0`。
- DSH、Cordis 和 Host provider 使用项目固定的 `0.1.2-rc.1` / `4.0.2` 组合。
- 源码命令从仓库根执行；使用 npm 包时，在一个由用户选择的空工作目录执行。
- 从源码安装时，DSH 启动工作目录是仓库的 `dsh-workspace/`，`DSH_HOME` 固定为 `dsh-workspace/dsh-home/`；`dsh-workspace/convivium-user/` 是持久安装根，保存会议 SQLite 和已解包发布物。通过 npm 安装时，对应目录位于执行安装命令的目录下。人工 Web 调试使用同一 DSH 工作目录和 `DSH_HOME`，安装根另见下述入口；同一时间只运行一个使用该 `DSH_HOME` 的 Host。
- 人工 Web 调试和验收使用 [DSH Smoke — 人工 Web 调试与验收](./HOW-TO-DSH-SMOKE.md#人工-web-调试与验收) 的固定安装根，不覆盖本流程的日常持久根。
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

安装入口在 DSH workspace 下创建持久 `dsh-home`，在安装根创建 SQLite patch、release 资源和 `dev.env`，并将实际 release ID 写入 `release`。普通安装遇到同版本 release 或 artifact 已存在时停止，不覆盖；人工 Web 调试的源码刷新入口和保留数据规则见 [DSH Smoke — 人工 Web 调试与验收](./HOW-TO-DSH-SMOKE.md#人工-web-调试与验收)。

首次新建的专用 `web` profile 使用 `dsh.profile.patchReload: startup`。当前固定的 DSH/Cordis 组合在 `live` 模式下可能因 HMR 接口不匹配而启动失败；`startup` 仍在每次启动时应用全部 patch，但修改 profile、home 或角色 patch 后必须重启 Host。安装器会在新建 profile 尚未完成配置时保留标记，重跑同一安装命令会继续完成 `startup` 设置；原有用户 profile 不由安装器改写。若原有 profile 仍配置 `live` 并出现 `Cordis HMR service` 或 `hmr.registerConfig` 错误，停止启动并先核对该 profile 的 reload 策略，不覆盖或复制其他 profile。

在安装根的 `dev.env` 中填写真实 key；该文件只在不存在时生成，首次生成权限为 `600`。后续安装直接复用已有文件，不覆盖内容或修改权限：

```env
DEEPSEEK_API_KEY=
```

## Start

从执行安装命令的目录启动：

```sh
./dsh-workspace/convivium-user/start.sh
```

该脚本读取安装时记录的 release 和 DSH workspace 绝对路径，将 `DSH_HOME` 设为该 workspace 下的 `dsh-home/`，将角色资源根设置为 profile 已安装插件的 `config/` 真实路径，再启动固定版本的 DSH Web。

DSH 打开 Browser UI 后，在普通聊天输入 `/convivium <会议目标>` 创建会议，再进入 `Meetings` view 查看并执行用户控制。Captain 就是本地用户，无须新建 Session 或选择角色 Preset；七个会议 Agent 自动选择各自 Preset。输入 Session 关闭不影响投递或用户权限。模型默认路由在 DSH Settings 管理；需要角色级差异时，按 [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md) 的 `agentModelOverrides` 规则增加后层控制 patch。

## Assert

- Host 只监听 `127.0.0.1:31828`，Browser 可以打开 DSH UI。
- `Meetings` view 可见且没有创建按钮或表单；普通用户 Session 能加载 `/convivium`。
- 通过 `/convivium` 创建会议时，Manager、Evidence Reviewer 和五个 Contributor Definition 可用，各自独立 Session/Preset/Skills；缺 provider、Skill、模型或 Storage Domain 时必须停止并修正 profile，不能改用空定义或临时内存 fallback。
- 重启同一命令后仍使用相同 `DSH_HOME`、workspace 和 SQLite 文件，已提交会议可以恢复。

## Stop, Upgrade, And Failure Handling

停止发起新操作并等待当前写入完成后，在 Host 终端按 `Ctrl-C`。当前 DSH 没有已验证的固定安全等待时长；页面显示完成不等于所有排队持久化都已完成。不要删除 `dsh-workspace/convivium-user/`，它是用户持久数据根。

升级时重新执行原安装入口；入口自动取得并记录新的实际版本。版本对应 release 已存在时安装停止，不覆盖原资源。私有持久化为 v2，旧 v1 返回 `SCHEMA_VERSION_UNSUPPORTED`，损坏 v2 返回 `CORRUPT_DATABASE`。项目当前不提供数据或 schema migration；升级前不得假定旧数据兼容，也不得自动删除或覆盖 SQLite。

安装失败时保留精确命令和 DSH 错误，并直接重跑同一安装命令。安装器会删除本次新建的 release 目录和 artifact，避免半成品阻断重试；已有的 `dev.env`、storage patch 与 workspace 数据保持不变。缺少 SQLite provider、`spawn` provider、角色资源、模型或凭据都应 fail closed；不得改用 smoke profile、测试 patch、旧 tarball 或其他用户 profile 继续宣称安装成功。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
- [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md)
- [DSH 插件冒烟测试](./HOW-TO-DSH-SMOKE.md)
