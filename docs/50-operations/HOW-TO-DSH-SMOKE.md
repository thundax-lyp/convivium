# DSH 插件冒烟测试

## 前置条件

- 在 `plugin/` 目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可访问或已缓存 `@deepseek-ai/dsh@0.1.1-rc.2`。
- 不使用开发者常用的 DSH profile；脚本会创建并清理独立临时 profile、workspace、端口和 `DSH_HOME`。
- 自动 `smoke:profile` 使用的本地 DeepSeek 凭据保存在仓库根目录 `dev.env`；从 `dev.env.example` 复制后填写。该文件不进入 Git。

`dev.env` 只保存 DeepSeek 官方 provider 所需的本地凭据：

```env
DEEPSEEK_API_KEY=
```

`smoke:profile` 启动前必须读取 `dev.env`。文件缺失、`DEEPSEEK_API_KEY` 缺失或空值、存在其他变量时立即失败。密钥只注入真实 DSH Host 进程；构建、打包、插件安装和 `dump-config` 子进程不会取得该值。脚本不得把密钥写入 stdout、stderr、临时 profile、结果 JSON 或构建产物。

当前确定性 selector 不调用 LLM；注入密钥只保证 smoke Host 与人工 Browser 验证使用同一完整 DeepSeek provider 环境，不得据此声称 LLM 请求已经验证。只有实际模型请求成功才可作为 LLM 链路证据。

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

命令必须从 `plugin/` 运行，使入口能够从其父目录读取唯一的仓库根 `dev.env`。调用者 shell 中已有的 `DEEPSEEK_API_KEY` 会被忽略，不能替代该文件。

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

## 生命周期 selector

从仓库根目录逐个执行；`CONVIVIUM_SMOKE_SCENARIO` 只接受下列固定值，脚本入口是 `plugin/scripts/smoke-profile/index.mjs`，不得改写为不存在的 lifecycle runner：

```sh
env CONVIVIUM_SMOKE_SCENARIO=timeout pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=reassign pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=task-handraise pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=completion-end pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=risk-reopen pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cold-rebind pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=archive-continuation pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
env CONVIVIUM_SMOKE_SCENARIO=cross-meeting pnpm --dir plugin smoke:profile
```

每条命令必须退出码为 `0`，并输出 `ok: true`、与 selector 同名的 `probe.scenario` 及该场景固定 assertions。首次失败立即停止后续 selector，保留该次命令、首个 `smoke probe failed` 及有界日志路径；不得把 Host 已启动、TCP 可连或 mock 结果当作场景通过。

### Reassign browser-ready 模式

该模式复用 `reassign` selector，但在调用 reassign tool 前保留一个仍有 current SpeakerAttempt 的 Meeting，并持续运行 Host 供真实 Browser 操作。browser-ready profile 把 `speakerTimeoutMs` 固定为 30 分钟；操作者必须在 ready 输出后的 30 分钟内完成五项 Browser 操作。必须从仓库根目录执行：

```sh
env CONVIVIUM_SMOKE_SCENARIO=reassign \
    CONVIVIUM_SMOKE_BROWSER_MODE=1 \
    pnpm --dir plugin smoke:profile
```

等待 stdout 同时满足以下 ready 判据后才能打开 Browser；Host 会继续运行并等待终止信号：

- 顶层结果为 `ok: true`、`profile: "web"`、`provider: "spawn"`。
- `probe.scenario` 为 `reassign`，`probe.browserReady` 为 `true`，`probe.assertions` 精确等于 `["browser-reassign-ready"]`。
- `probe.meetingId`、`probe.captainSessionId`、`probe.observed.oldAttemptId` 和 `probe.observed.meetingVersion` 均存在；`probe.captainSessionId` 精确为 `convivium-smoke-captain`；`probe.observed.currentSpeakerId` 为 `participant-a`，`probe.observed.currentAttemptId` 等于 `probe.observed.oldAttemptId`。
- stdout 打印唯一的 `CONVIVIUM_SMOKE_BROWSER_URL=http://127.0.0.1:<port>` 和 `CONVIVIUM_SMOKE_TEMP_ROOT=<absolute-path>`；分别记录 URL 与临时根路径。

在真实 Browser 打开该次 stdout 给出的 `CONVIVIUM_SMOKE_BROWSER_URL`，先在 smoke workspace 的 session tree 选择 session ID `convivium-smoke-captain`，等待 `conversation.view` 加载，再选择 label 精确为 `Meetings` 的 view，最后只通过现有 Convivium Meeting panel 完成以下操作。Harness 首页只显示“新会话”且尚未打开该 Session，不构成 Client 加载失败：

1. Meeting list 出现 `Runtime smoke (running)`。
2. 选择该 Meeting；summary 显示 `running`、current Speaker 为 `participant-a`，页面显示 `Skip current speaker` 和 `Skip reason`。
3. 保持 `Skip reason` 为空时，确认按钮 disabled；输入 `Browser reassign evidence` 后确认按钮 enabled。
4. 点击一次 `Skip current speaker`；成功重新读取后该控制消失，页面不存在 `role=alert`。
5. 刷新页面；旧 attempt 的 `Skip current speaker` 控制仍不出现。

五项任一不成立即停止 Browser 判定并记录为 `Not Covered`；不得用 HTTP、jsdom、普通 `reassign` selector 或 fixture test 替代。特别是 Harness 页面未显示 Convivium Meeting panel 时，不得继续猜测入口或宣称 Browser Pass。

若 session tree 中不存在 `convivium-smoke-captain`、`conversation.view` 中不存在 label 精确为 `Meetings` 的 view，或 Browser console 出现 Convivium bundle evaluate/activate error，立即 STOP 并记录对应 DOM、slot owner 和 console 错误；不得修改 Client slot 或增加导航 fallback。

完成观察或命中上述失败条件后，在运行 wrapper 的终端发送一次 `Ctrl-C`。必须等待进程退出，并确认 stdout 出现：

```text
CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok
```

再使用先前记录的精确临时根路径检查清理结果：

```sh
test ! -e '<CONVIVIUM_SMOKE_TEMP_ROOT 的完整值>'
```

只有 wrapper 已退出、cleanup marker 已出现且该命令退出码为 `0`，Restore 才为 Pass。不得使用 glob 猜测或删除其他 smoke 临时目录；cleanup 失败时保留 stdout、stderr 和精确路径用于诊断。

脚本的 finally 必须停止其记录的 Host PID、确认临时端口释放并删除唯一 `convivium-dsh-smoke-*` 临时根。`cold-rebind` 会在同一临时 DSH_HOME、workspace、profile、data root 和端口上依次启动两个不同 Host PID；只在 phase 2 完成后执行一次最终 Restore。Restore 失败时即使场景断言通过也不得记为 Pass。

上述 selector 不调用 LLM，只证明当前锁定 DSH runtime/provider、真实 Session persistence、inbox、interrupt/drain、tool caller、Storage Domain composition/cold recovery、status/archive 和 Meeting 隔离路径。Decision/Agenda、developer Markdown、metrics/stress、浏览器未列出的其他控制、遗留 SQLite migration/deletion、multi-Host writer、remote filesystem 和生产发布不在这些 selector 的证明范围内。

## 失败处理

- 首次运行无法取得 DSH 包时，检查网络或 pnpm store；不得改用未记录版本的 DSH CLI 继续判定结果。
- 仅完成 `verify:environment`、`verify:contract`、构建或单元测试，不能描述为运行层 smoke 通过。

## 关联入口

- 自动化脚本：`plugin/scripts/smoke-profile/index.mjs`
- 插件完整运行验证：`pnpm verify:runtime`
- 运行验证证据：`docs/40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md`
