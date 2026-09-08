# DSH 插件冒烟测试

## 前置条件

- 在 `plugin/` 目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可访问或已缓存 `@deepseek-ai/dsh@0.1.2-rc.1`。
- 不使用开发者常用的 DSH profile；脚本会创建并清理独立临时 profile、workspace、端口和 `DSH_HOME`。
- 自动 `smoke:profile` 使用的本地 DeepSeek 凭据保存在仓库根目录 `dev.env`；从 `dev.env.example` 复制后填写。该文件不进入 Git。

`dev.env` 只保存 DeepSeek 官方 provider 所需的本地凭据：

```env
DEEPSEEK_API_KEY=
```

`smoke:profile` 启动前必须读取 `dev.env`。文件缺失、`DEEPSEEK_API_KEY` 缺失或空值、存在其他变量时立即失败。密钥只注入真实 DSH Host 进程；构建、打包、插件安装和 `dump-config` 子进程不会取得该值。脚本不得把密钥写入 stdout、stderr、临时 profile、结果 JSON 或构建产物。

除 meeting-roles 外，当前确定性 selector 不调用远程 LLM；注入密钥只保证 smoke Host 与人工 Browser 验证使用同一完整 DeepSeek provider 环境，不得据此声称 LLM 请求已经验证。只有实际模型请求成功才可作为 LLM 链路证据。

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
DSH_HOME="$(cd ../dsh-workspace/dsh-home && pwd)" pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add "$artifact_path"
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
    exec pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 web \
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
pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1 --version
pnpm smoke:profile
```

命令必须从 `plugin/` 运行，使入口能够从其父目录读取唯一的仓库根 `dev.env`。调用者 shell 中已有的 `DEEPSEEK_API_KEY` 会被忽略，不能替代该文件。

其中 `pnpm smoke:profile` 内部固定调用：

```text
pnpm dlx @deepseek-ai/dsh@0.1.2-rc.1
```

## 自动 smoke 的分层与入口

smoke 只证明真实 DSH 的组合、工具/HTTP 调用、持久化、恢复和 Session 生命周期。领域规则组合、字段合法性和 Client 展示分别由 domain、protocol、Client tests 负责；smoke 不复制这些测试矩阵。离线协议 fixture 不替代真实 Agent Session，Client 展示测试也不替代 Host 生命周期验证。

从仓库根目录执行：

```sh
pnpm --dir plugin smoke:profile                         # 默认 5 个核心场景
pnpm --dir plugin smoke:profile --all                   # 全部 17 个场景
env CONVIVIUM_SMOKE_SCENARIO=mail-race pnpm --dir plugin smoke:profile
pnpm --dir plugin --silent smoke:profile --json         # 完整逐场景 JSON，供诊断
```

一次命令只构建、打包一次，复用同一个 artifact；每个场景仍独立创建 Host、DSH_HOME、workspace、profile 和端口。cold-rebind 在自己的目录内重启 Host。场景串行，首个失败立即停止；不跨场景共享 Meeting 或 Session。默认不打印构建日志、dump-config 或大段 DTO，失败输出有界诊断。`--all` 不能与单场景或 Browser mode 组合。

| 范围 | selector | 真实边界 |
| --- | --- | --- |
| 核心 | `baseline` | 装包、provider 创建 Session、A/C/B transcript、HTTP pause/resume |
| 核心 | `cold-rebind` | 冷重启、持久 Session ownership 重绑、继续提交 |
| 核心 | `cross-meeting` | 跨 Meeting/Team 隔离，清理一场不影响另一场 |
| 核心 | `convergence-stalled` | 自动停滞终止、归档、迟到提交拒绝、Session drain |
| 核心 | `convergence-turn-budget-completion` | 预算边界先完成业务，再由 Captain end、归档 |
| 完整 | `timeout`、`reassign` | 定时器与人工换人后的旧 capability/Activation 清理 |
| 完整 | `task-handraise` | Task inbox delivery、finish、HandRaise 消费与后续提交 |
| 完整 | `completion-end` | completion/end 竞争与终态写入拒绝 |
| 完整 | `mail-race` | inbox/mail 竞争、隐私投影、队列可复用 |
| 完整 | `archive-continuation` | 归档材料复制与新会议身份隔离 |
| 完整 | `scribe-minutes` | 引用草稿上下文、原子拒绝、重放、HTTP、归档、三个 Session 清理；支持 Browser 模式 |
| 完整 | `decision-risk-closure`、`risk-reopen` | 决策/风险工具投影、重放与冲突 |
| 完整 | `convergence` | Manager 无效计划的 fallback 与幂等重放 |
| 完整 | `role-composition` | 独立 Host 模型覆盖、persona/filter 隔离与双 Host 冷恢复；无 Browser 模式 |
| 完整 | `meeting-roles` | 同 tarball 部署九角色、九次原生 Skill 加载、三研究 Provider 和权限拒绝；调用真实模型，无 Browser 模式 |

no_consensus、进展重置和另一种预算的规则差异由 `turn-advancement.spec.ts` 覆盖，不再提供 `convergence-no-consensus`、`convergence-reset`、`convergence-message-budget-completion` selector。已移除场景的[历史运行摘要](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#retired-convergence-scenario-evidence)仅用于追溯，不代表当前入口。

### 九角色部署场景

```sh
env CONVIVIUM_SMOKE_SCENARIO=meeting-roles pnpm --dir plugin smoke:profile
```

资源取自本次安装的同一 tarball，wrapper 解包至临时根的 role-package/package/meeting-roles；部署 patch 在临时控制 patch 前加载，两者通过非敏感 Host 变量 CONVIVIUM_MEETING_ROLES_ROOT 指向该目录；控制 patch 重述同源 agentDefinitions 读取表达式，避免 config 整体替换丢失定义。真实 Captain 显式挂载 convivium，并以原生 agentOptions 选择 deepseek-official/deepseek-v4-flash，子会话继承模型；创建一位 Manager 和八位 Participant。探针暂停会议，使用原生 ancestor interrupt 等待当前执行结束，然后逐个观察各自 Session 的 skill tool/call、成功 tool/result 四步正文与 ROLE_READY；每身份上限 180000ms，结果等待上限 2400000ms。
部署探针在目标 child 成功 Skill 调用的原生 tools/post-execute 回调内完成研究工具、权限拒绝与 status 检查，返回原 decision，并在 finally 注销回调。continuable child 空闲后可被 DSH 释放，不能缓存旧 Agent 在 idle 后调用工具。检查仍要求真实 Provider 结果，Fake-IP DNS 的非公网地址拒绝不能计为抓取通过；应由运行环境为目标公网域名提供真实公网解析，不放宽 DSH 检查。

三研究角色的原生 web_search 必须返回对应域来源，web_fetch 必须返回 2xx 与非空正文。Manager/Scribe 的越权会议工具及 web_search 共四次调用必须 UNKNOWN_TOOL，九身份 status 可读且暂停后的 Meeting version/messages 不变。失败或超时沿原 finally 停止 Host、释放端口并删除本次资源；不能通过更换 fixture 或放大超时继续判为成功。

完整人工部署与模型覆盖步骤见 [Meeting Roles Deployment](./HOW-TO-MEETING-ROLES.md)。本场景已接线并通过定向测试；2026-09-08 部署接线和九 Skill 加载已通过，真实抓取被本机 Fake-IP DNS 的 WEB_BLOCKED_URL 阻断，见 [本轮失败证据](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#meeting-roles-deployment)。

### 引用式纪要场景

`scribe-minutes` 是独立诊断 selector；默认核心仍为 5 个，完整套件为 17 个。沿用 `web` profile、`spawn` provider 和统一 Restore。

从仓库根目录执行：

```sh
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes pnpm --dir plugin smoke:profile
CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

普通模式检查六项 oracle：Speaker 上下文含来源消息、非法引用不改变状态、同一 Session 恢复后原请求重放 receipt 不变、HTTP 公开消息相等、归档公开消息相等、Manager/a/b 三个 Session 已清理。归档比较固定公开字段，保留其余内部归档字段。字段及非权威边界见 [Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md#referenced-minutes-draft)。

Browser 模式完成前四项后输出 `browserReady: true` 和实际 URL/临时根。打开该 URL，在 smoke workspace 中选择 `convivium-smoke-captain` Session，再进入 `Meetings` view。核对 `Minutes draft (non-authoritative)`、Coverage、Referenced message IDs 和正文，刷新后保持一致；使用既有 End 控制选择 partial、输入 `scribe minutes smoke`，等待 archived 后刷新并再次核对。随后在原 PTY 发送 Ctrl-C，等待 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok` 并确认该精确临时根消失。此场景不证明模型生成纪要的质量。

## 成功与 Restore

整个命令退出 0，所有选定场景均输出 `PASS <scenario> <duration>ms restore=PASS`，最后报告总耗时；出现失败不得继续后续场景。PASS 在 Host 停止、该次临时根删除且端口 exclusive bind 成功后输出，不能把 ready 当成通过。共享构建临时根也在命令退出前删除。

`--json` 每行保留原 profile/provider、完整 probe、dumpConfig、bootLogs，并附 `restore: "PASS"` 与耗时。路径指向已清理目录，仅供定位该次运行；失败信息中的日志尾才是自动清理后可用的诊断。Browser mode 的 ready JSON 和 URL 仍在清理前输出，须等待停止后的 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。

两个收敛归档场景由正式 `MeetingStatusResultSchema` 校验实际 archived DTO，再核对 Meeting/transcript/termination、业务完成事实、迟到提交不变性和 Session 清理。Schema 在共享构建临时目录加载一次，随最终清理删除；中间计数由 driver 在真实状态上断言，不再在输出校验器重复实现。协议拒绝读取 `ProtocolErrorV1.code`，与 DSH 工具层拒绝分别识别。

### Reassign browser-ready 模式

该模式复用 `reassign` selector，但在调用 reassign tool 前保留一个仍有 current SpeakerAttempt 的 Meeting，并持续运行 Host 供真实 Browser 操作。browser-ready profile 把 `speakerTimeoutMs` 固定为 5 分钟；该窗口从 SpeakerAttempt 创建时开始，Session flush、workspace attach、result polling 和 Browser Client preflight 都会消耗窗口，ready 输出不会重置计时。操作者必须在 ready 输出后立即完成五项 Browser 操作；若打开页面时旧 attempt 已超时或 `Skip current speaker` 已因超时消失，本次 Browser 证据无效，必须停止 wrapper 并重新执行完整命令，不得记为 Client 失败。必须从仓库根目录执行：

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

自动化终端必须分配 PTY（`exec_command` 使用 `tty: true`），使控制字符转换为真实终止信号；向 pipe stdin 写入 Ctrl-C 或直接终止工具进程不构成正常 Restore。wrapper 在收到首个停止信号后保留 SIGINT/SIGTERM handler 至退出，避免 pnpm 的重复转发在 finally 中途终止清理。

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

除 meeting-roles 外，上述 selector 不调用远程 LLM，只证明当前锁定 DSH runtime/provider、真实 Session persistence、inbox、interrupt/drain、tool caller、Storage Domain composition/cold recovery、status/archive 和 Meeting 隔离路径。Decision/Agenda、developer Markdown、metrics/stress、浏览器未列出的其他控制、遗留 SQLite migration/deletion、multi-Host writer、remote filesystem 和生产发布不在这些 selector 的证明范围内。

## 失败处理

- 首次运行无法取得 DSH 包时，检查网络或 pnpm store；不得改用未记录版本的 DSH CLI 继续判定结果。
- 仅完成 `verify:environment`、`verify:contract`、构建或单元测试，不能描述为运行层 smoke 通过。

## 关联入口

- 自动化脚本：`plugin/scripts/smoke-profile/index.mjs`
- 插件完整运行验证：`pnpm verify:runtime`
- 运行验证证据：[Smoke Validation Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#historical-runtime-browser)
- 当前 smoke 分层验证：[Smoke Validation Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md)

## FR-14 共享 Preset 角色隔离与冷恢复

Prepare：沿用上文 dev.env、独立临时 profile 和 0.1.2-rc.1 版本要求；web profile 必须提供 `agentPresets`、`skills`、`minimal` Preset 与 continuable spawn provider。本场景不加入默认 CORE_SCENARIOS，也不支持 Browser 模式。

Execute：从仓库根目录执行：

```sh
CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile
```

Assert：真实 Captain factory 挂载 minimal；第一 Host 使用 V1 内联 roleDescription 定义及独立 agentModelOverrides 创建两种角色，第二 Host 将定义与模型覆盖改成 V2，恢复原 Captain 和 child。输出必须包含两个不同 Host PID、以下九项断言及 `PASS role-composition`、`restore=PASS`：

- `phase1-checkpoint-durable`
- `host-pid-changed`
- `exact-parent-rebound`
- `transcript-prefix-preserved`
- `cold-followup-submitted`
- `role-persona-isolated`
- `role-tool-execution-denied`
- `role-parent-unmodified`
- `role-cold-config-v1-preserved`

Participant 的 probe 工具同时不可见、不可执行，拒绝调用不进入 body；Manager 和 Captain 可执行。恢复后的两个 child 保留 V1 派生 persona/filter/provider/model/reasoningEffort，父模型路由不变。两个阶段只手动推进提交，不运行自动 Participant 提交。确定性场景不调用模型，不证明真实模型任务质量。

Restore：wrapper 的 finally 必须停止本次 Host、确认端口释放并删除本次精确临时目录，成功打印 `restore=PASS`。任何能力缺失、断言失败或恢复失败都按失败处理，不换用 fake adapter；cleanup 失败沿上文仅处理本次精确 PID/目录，不清理其他 profile 或数据。

## Decision/Risk 本地按钮验证

### 适用范围与状态

本节验证 Decision/risk 五种本地按钮及归档审计。使用 `decision-risk-closure` Browser 夹具；`runDecisionRiskClosureScenario` 与 `smoke-profile.spec.ts` 验证暂停和 ready 边界，ready 不代表页面验收通过。沿用独立临时 profile、Browser URL、PTY 停止及 cleanup。既有实际验收见 [Browser 历史证据](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#captain-local-decision-risk-browser)，每次复验均应记录自己的源码基线与结果。

### Browser 夹具契约

在既有 `runDecisionRiskClosureScenario(runtime)` 中，仅 `runtime.browserMode === true` 改变准备数据：首次 Participant submission 同时提交两个 candidate，statement 精确为 `Accept the closure proposal` 与 `Accept the replacement closure proposal`，均引用同一当前 proposal revision=1，并提交一个 `Closure risk`。该 risk 的输入与既有场景后半段相同：affectedOutputIds=[]、affectedCriterionIds=[criterion-smoke-order]、violatedConstraintIds=[]、impact=high、urgency=now、safeDefaultAvailable=false、riskLevel=high；description 沿用既有 Closure risk。普通模式仍只提交一个 candidate，保留原工具验证流程。

Browser 分支在读取首次 candidateStatus 后、任何 decision/risk tool 写操作前执行：

1. 验证两 candidate 的 statement、proposalId/revision、sourceMessageId；从 candidateStatus.result.risks 按 title 取得唯一 risk，验证为 open/blocking/true、riskLevel=high。所有来源 ID 取正式 status 与 submitted.result.messageId，不硬编码生成 ID。
2. 调用既有 `convivium_pause_meeting`，requestId=smoke-local-browser-pause、reason=`Prepare local browser controls`、expectedMeetingVersion=candidateStatus.meetingVersion，tool call ID=1190。再次调用 status，tool call ID=1191，要求 paused、无 currentAttemptId、两候选仍 pending、acceptedDecisions=[]。暂停避免等待 Browser 时发生 speaker timeout；不得用增加超时窗口替代。
3. 按既有 reassign Browser 模式追加 Captain `user/message`（id=convivium-local-control-browser-message，text=`Local decision risk browser evidence`），await ctx.sessions.flush，然后 runtime.workspace.attachSession；workspace 缺失则失败。调用 runtime.setMeetingId(meetingId)。
4. 写下述唯一 ready result 并 return，不执行后续 Captain accept/dispose，也不自动 end/archive。非 Browser 分支仍执行原有一个 candidate 的断言和后续工具流程。

```ts
{
    ok: true,
    scenario: "decision-risk-closure",
    browserReady: true,
    assertions: ["browser-local-decision-risk-ready"],
    meetingId: string,
    captainSessionId: "convivium-smoke-captain",
    observed: {
        meetingVersion: number,
        status: "paused",
        candidateId: string,
        replacementCandidateId: string,
        riskId: string,
        evidenceMessageId: string
    }
}
```

以上为字段类型契约：全部 required，禁止额外字段；meetingVersion 为非负整数，其余 ID 非空，两个 candidate ID 不同。ID 分别取 statement 对应的两个 candidate、Closure risk 和首条提交 message；版本取暂停后的 status。`validateScenarioResult` 在普通 decision-risk assertion 检查前接受并严格验证此 Browser 分支；失败固定抛 `Local decision risk browser-ready result is invalid.`。现有 wrapper 已支持 ready preflight、URL 输出和等待 Ctrl-C，不修改 wrapper。

### Prepare

从仓库根执行。Node/pnpm 与 rc.2 条件沿用本文前置条件；`dev.env` 由已有脚本校验，不打印或改写凭据。工作树产品代码须为已提交的待验收版本；不存在夹具、构建失败或凭据缺失则 STOP，记录实际错误，不临场改实现。

以 PTY 启动唯一命令：

```sh
env CONVIVIUM_SMOKE_SCENARIO=decision-risk-closure CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

等待顶层 ok=true、profile=web、provider=spawn，且 probe 严格符合上述 ready 契约。记录该次 stdout 的 `CONVIVIUM_SMOKE_BROWSER_URL`、`CONVIVIUM_SMOKE_TEMP_ROOT`、probe.meetingId 和 observed 全部字段。ready 只证明夹具就绪。

### Execute And Assert

打开该次 Browser URL，在 session tree 选择 `convivium-smoke-captain`，进入 `Meetings` view，选择 meetingId 与 ready result 相同的 `Decision risk closure` Meeting。缺少 Session、view 或面板，或出现 bundle evaluate/activate error，立即 STOP 并进入 Restore，不寻找替代入口。

以下操作全部通过真实面板按钮完成。每步等待写请求结束及全量刷新；出现 alert、对象不符或预期状态未出现即停止，不自动重复提交。各理由均逐字输入。开始时必须为 paused、两个指定 pending candidate、无 accepted Decision、Closure risk 为 open/blocking。

| 顺序 | 固定操作 | 必须观察的结果 |
| --- | --- | --- |
| 1 | 在 `Accept the closure proposal` 行点 Accept decision；核对已选证据对应 ready.evidenceMessageId，Reason 输入 `Browser accepts scope`，点 Submit | 该 candidate 消失；新增 accepted Decision，记其 ID 为 A；另一个 candidate 仍 pending |
| 2 | 在 A 行点 Replace decision，Replacement decision 选 `Accept the replacement closure proposal`，核对同一来源证据；Reason=`Browser replaces scope`，Submit | A 在 history 为 superseded；新增 accepted Decision B，A.supersededByDecisionId=B；pending 为空 |
| 3 | 在 B 行点 Revoke decision；确认初始证据为空，手选首条 `Use the accepted proposal` 消息；Reason=`Browser revokes scope`，Submit | accepted 为空；history 保留 A=superseded、B=revoked |
| 4 | 在 Closure risk 行点 Accept risk；核对预选证据；Reason=`Browser accepts risk`，Submit | risk 为 accepted_risk，disposition=accepted_risk，blocking=false；按钮变为 Set as blocking |
| 5 | 同一风险点 Set as blocking；Reason=`Browser rejects risk`，Submit | risk 为 open，disposition=blocking，blocking=true；会议仍 paused，没有自动结束 |
| 6 | 刷新页面，按同一 Session/view/meetingId 重新打开 | A/B history 和 risk 状态与第 5 步一致；无 pending/accepted Decision |
| 7 | 使用已有 End outcome 选择 partial、End reason 输入 `Browser local control archive`，点击一次 End meeting，等待 archived | Meeting 不再提供五种写控件，history 保留两 Decision，风险仍保留 |

第 7 步只为观察已提交审计事实，不计为新增产品动作。随后在另一个 Browser tab 打开该 origin 的 `GET /api/convivium/meetings/:meetingId`（meetingId 取 ready result 并作为单个 URL path segment 编码），读取 JSON：ok=true、result.status=archived；archive.package.decisionHistory 保留 A/B 及替代关系；completionFacts 中本次五动作共六个事实（替换包含 acceptance+supersession），authority 均为 local_host、assertedBy 均为 local-host:loopback-web，理由及 evidenceMessageIds 与上述输入一致；两条 risk_acceptance fact 中旧 accept 为 superseded、新 reject 为 active。允许归档流程已有的其他事实，但不把它们计入这六条。该 GET 仅核对审计，不能替代任何按钮写操作。若浏览器禁止直接展示 JSON，可用只读 HTTP 客户端 GET 同一 loopback URL 核对，并在证据中记录实际读取方式；不得因此改用 API 执行按钮动作。

### Restore And Closure

无论断言成功或失败，向本次 wrapper PTY 发送一次 Ctrl-C，等待其正常退出且退出码为 0、stdout 出现 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`；wrapper 的 finally 必须完成 Host 停止、临时根删除和端口释放。用文件存在性工具核对 stdout 记录的唯一精确临时根不存在；不使用 glob、不删除其他目录、不直接 kill 工具进程来代替 Restore。

将被测 commit、环境、启动命令、ready IDs、七步结果、审计 GET 与 Restore 结果写入 [Smoke Validation Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#captain-local-decision-risk-browser)，同步 [Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md#captain-local-decision-risk-control)。只有所有断言和 Restore 通过才记录本次验收通过；其余保留具体失败或 Not Covered。本验证不包含真实 LLM 请求或 Host 冷重启，自动化持久恢复的边界见验证索引。
