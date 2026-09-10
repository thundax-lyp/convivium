# Convivium

A gathering of human and agent minds.

## Development

`plugin/` 是唯一可构建、测试和交付的工程。仓库根 private `package.json` 仅作为命令门面，因此可以从仓库根运行开发检查：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

## Install and run

Convivium 是 DSH 插件，必须安装到持久 DSH web profile 后由 Host 启动。可以从源码构建发布物：

```sh
pnpm --dir plugin install --frozen-lockfile
pnpm build
mkdir -p dsh-workspace/convivium-user/artifacts
pnpm --dir plugin pack --pack-destination "$PWD/dsh-workspace/convivium-user/artifacts"
```

也可以从 npm registry 下载已发布版本：

```sh
mkdir -p dsh-workspace/convivium-user/artifacts
npm pack "@convivium/dsh-plugin@<version>" \
    --pack-destination "$PWD/dsh-workspace/convivium-user/artifacts"
```

两种方式得到的 `.tgz` 使用同一套持久 profile 安装、SQLite 配置、会议角色部署和 DSH Web 启动流程。完整可执行步骤见 [安装并运行 Convivium](docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)。测试环境另见 [DSH 插件冒烟测试](docs/50-operations/HOW-TO-DSH-SMOKE.md)，不能把 smoke profile 当作用户数据环境。
