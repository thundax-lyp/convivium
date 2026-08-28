# DSH 插件冒烟测试

## 前置条件

- 在 `plugin/` 目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可访问或已缓存 `@deepseek-ai/dsh@0.1.1-rc.2`。
- 不使用开发者常用的 DSH profile；脚本会创建并清理独立临时 profile、workspace、端口和 `DSH_HOME`。
- 可选的本地 LLM 配置保存在仓库根目录 `dev.env`；从 `dev.env.example` 复制后填写。该文件只供人工真实模型验证使用，不进入 Git，也不会由自动 `smoke:profile` 加载。

`dev.env` 只保存 DeepSeek 官方 provider 所需的本地凭据：

```env
DEEPSEEK_API_KEY=
```

当前确定性 `smoke:profile` 不调用 LLM，因此不得加载或向构建、打包、依赖安装和 probe 子进程传递该凭据。人工真实模型验证只在启动需要模型的 DSH host 时显式注入 `DEEPSEEK_API_KEY`，实际请求成功才可作为 LLM 链路证据。

人工开发和调试使用仓库根目录 `dsh-workspace/`，该目录不进入 Git；自动 `smoke:profile` 不使用该目录，仍为每次运行创建并清理独立的 OS 临时 workspace，避免旧 Session、Meeting 或文件状态影响验证结果。

## 人工真实模型验证

### Prepare

先在不加载 `dev.env` 的 shell 中构建、打包并安装插件：

```sh
mkdir -p dsh-workspace/artifacts dsh-workspace/dsh-home
chmod 700 dsh-workspace dsh-workspace/dsh-home

cd plugin
pnpm build
artifact_name="$(pnpm pack --json --pack-destination ../dsh-workspace/artifacts | node -e 'let input = ""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const value = JSON.parse(input); process.stdout.write((Array.isArray(value) ? value[0] : value).filename); });')"
artifact_path="$(cd ../dsh-workspace/artifacts && pwd)/$(basename "$artifact_name")"
DSH_HOME="$(cd ../dsh-workspace/dsh-home && pwd)" pnpm dlx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add "$artifact_path"
cd ..
```

确认 `dev.env` 只包含 `DEEPSEEK_API_KEY`，且权限不允许其他本机用户读取：

```sh
chmod 600 dev.env
```

### Execute

使用独立子 shell 启动 DSH。密钥只进入这次 DSH 启动命令树；子 shell 退出后不会残留在当前 shell：

```sh
(
    cd dsh-workspace
    set -a
    . ../dev.env
    set +a
    export DSH_HOME="$PWD/dsh-home"
    exec pnpm dlx @deepseek-ai/dsh@0.1.1-rc.2 web \
        --no-open \
        --host 127.0.0.1 \
        --port 31828 \
        --trusted-host 127.0.0.1:31828
)
```

在浏览器打开 `http://127.0.0.1:31828/`，新建使用 `DeepSeek-V4-Flash` 的 Session，发送 `Reply with exactly: OK`。

### Assert

- DSH Settings 显示 DeepSeek 官方 provider 已取得 API key。
- 新 Session 使用 `DeepSeek-V4-Flash`，请求返回 `OK`。
- Convivium 插件可以在该 DSH host 中加载；这不等于自动 `smoke:profile` 的 Meeting probe 已通过。

### Restore

在运行 DSH 的终端按 `Ctrl-C`。`dsh-workspace/` 是被 Git 忽略的持久人工调试目录，默认保留；需要全新状态时，先停止 DSH，再由开发者明确移走该目录后重新执行 Prepare。

## 标准入口

Convivium 后续的标准 DSH 插件冒烟测试统一使用发布版 DSH CLI/runtime：

```sh
cd plugin
pnpm dlx @deepseek-ai/dsh@0.1.1-rc.2 --version
pnpm smoke:profile
```

其中 `pnpm smoke:profile` 内部固定调用：

```text
pnpm dlx @deepseek-ai/dsh@0.1.1-rc.2
```

## 成功判据

命令必须以退出码 `0` 结束，并输出包含以下结果的 JSON：

- `profile: "web"`
- `provider: "spawn"`
- 插件成功打包并安装到临时 profile
- `dump-config` 同时包含 Convivium 插件、`dsh-subagent-spawn-in-process` 和 `spawn`
- Meeting 创建成功，A/B/C transcript 顺序保持一致
- pause 返回 `status: "paused"`
- resume 返回 `status: "running"`
- DSH host 启动并通过 readiness 检查

## 失败处理

- 首次运行无法取得 DSH 包时，检查网络或 pnpm store；不得改用未记录版本的 DSH CLI 继续判定结果。
- 仅完成 `verify:environment`、`verify:contract`、构建或单元测试，不能描述为运行层 smoke 通过。

## 关联入口

- 自动化脚本：`plugin/scripts/smoke-profile.mjs`
- 插件完整运行验证：`pnpm verify:runtime`
- 运行验证证据：`docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`
