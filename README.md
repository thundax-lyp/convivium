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

Convivium 是 DSH 插件，必须安装到持久 DSH web profile 后由 Host 启动。从源码仓库安装：

```sh
./scripts/install-from-source.sh
```

或者在用户选择的空工作目录安装 npm registry 的当前发布版本：

```sh
npm exec --yes --package @convivium/dsh-plugin@next -- convivium-install
```

两种方式都将实际发布版本写入安装状态，不要求用户填写版本或 release-id。设置 `dsh-workspace/convivium-user/dev.env` 中的 `DEEPSEEK_API_KEY` 后启动：

```sh
./dsh-workspace/convivium-user/start.sh
```

DSH workspace 默认为当前目录下的 `dsh-workspace/`；两种安装入口都可通过 `--workspace <path>` 指定其他路径。

完整目录、失败和升级说明见 [安装并运行 Convivium](docs/50-operations/HOW-TO-INSTALL-AND-RUN.md)。测试环境另见 [DSH 插件冒烟测试](docs/50-operations/HOW-TO-DSH-SMOKE.md)，不能把 smoke profile 当作用户数据环境。
