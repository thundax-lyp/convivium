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
