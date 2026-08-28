# DSH 插件冒烟测试

## 前置条件

- 在 `plugin/` 目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可访问或已缓存 `@deepseek-ai/dsh@0.1.1-rc.2`。
- 不使用开发者常用的 DSH profile；脚本会创建并清理独立临时 profile、workspace、端口和 `DSH_HOME`。
- 可选的本地 LLM 配置保存在仓库根目录 `dev.env`；从 `dev.env.example` 复制后填写。脚本会在创建 DSH 子进程前加载该文件，文件不进入 Git。

`dev.env` 使用以下项目专属变量，避免与开发者 shell 中其他模型配置静默冲突：

```env
CONVIVIUM_LLM_API_KEY=
CONVIVIUM_LLM_MODEL=
CONVIVIUM_LLM_BASE_URL=
CONVIVIUM_LLM_CHAT_COMPLETIONS_ENDPOINT=/chat/completions
```

当前确定性 `smoke:profile` 不调用 LLM；加载这些变量只准备后续真实模型 adapter/profile 验证，不能作为 LLM 链路已通过的证据。

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
