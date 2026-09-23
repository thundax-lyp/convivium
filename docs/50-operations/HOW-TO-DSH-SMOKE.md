# DSH 插件冒烟测试

## Purpose

本文说明如何运行当前 target runtime 的真实 DSH 组合冒烟、判断成功与失败、保留复盘记录并确认 Restore。脚本入口是 `plugin/scripts/smoke-profile/index.mjs`；支持的场景和结果断言以该脚本及其 `probe/` 为准，本文不维护历史 selector。

当前只支持：

- `identity-admission`：验证 Role catalog、原生 Skill Loader 和独立 continuable child Session。
- `meeting-business-loop`：验证 target Agent tools、四轮 Manager `roundGoal`、Evidence、Reviewer worker/batch、Publication、Archive 和 SQLite cold reopen。

Browser smoke 尚未接入 target runtime；`CONVIVIUM_SMOKE_BROWSER_MODE=1` 会在 Host 启动前失败，不能作为 Browser 验收证据。

## 人工 Web 调试与验收

人工 Browser 调试不运行 `smoke:profile`，也不使用 `/tmp` 安装根。从仓库根为当前完整 `git HEAD` 使用固定路径 `dsh-workspace/web-ui/<git HEAD>/`；其中 `convivium-user/` 保存安装、`DSH_HOME`、SQLite 和对话，`workspace/` 是 DSH 工作区。同一 HEAD 重启时复用原安装，不重新安装或覆盖 release；源码修复形成新 HEAD 后使用新的对应子工程，旧子工程保留以便复盘。不同子工程的 Host 均使用 `127.0.0.1:31828`，启动前必须先停止占用该端口的旧 Host。

首次安装从仓库根执行；目标已存在时停止并核对，不删除或覆盖：

```sh
web_ui_revision="$(git rev-parse HEAD)"
web_ui_root="$PWD/dsh-workspace/web-ui/$web_ui_revision"
test -z "$(git status --short)"
command -v lsof >/dev/null
test -z "$(lsof -nP -iTCP:31828 -sTCP:LISTEN)"
test ! -e "$web_ui_root"
mkdir -p "$web_ui_root"
chmod 700 "$web_ui_root"
CONVIVIUM_INSTALL_ROOT="$web_ui_root/convivium-user" \
  ./scripts/install-from-source.sh --workspace "$web_ui_root/workspace"
```

按照 [安装并运行 Convivium](./HOW-TO-INSTALL-AND-RUN.md) 核对发布物和启动条件。若复用仓库根的固定 `dev.env`，只在确认安装器新建的 `convivium-user/dev.env` 仍是空占位文件后，将其替换为指向仓库根 `dev.env` 的符号链接；不得复制或回显 key。运行 `"$web_ui_root/convivium-user/start.sh"`，在真实 Captain Session 中建立人工 fixture；不能把仅保留 Meeting SQLite 的自动 smoke 结果当作同时保留了 DSH 对话。需要重启时从相同安装根再运行同一 `start.sh`。成功判据是重启后同一子工程能读回已提交的对话和会议；仅端口监听不算通过。启动或补读失败时保留整个子工程及 Host 错误，停止并诊断，不改用日常 profile、`/tmp` 或旧构建物。验收结束后停止 Host，保留子工程；删除须另行按精确路径确认，不由 smoke Restore 清理。

## Prerequisites

- 从仓库根目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可以取得或已缓存 `@deepseek-ai/dsh@0.1.2-rc.1`。
- 仓库根目录存在不入 Git 的 `dev.env`，其中 `DEEPSEEK_API_KEY` 存在且去除空白后非空。文件可以包含其他本地条目；冒烟脚本只读取该 key。
- 不使用开发者常用的 DSH profile。脚本为每个场景创建独立临时 `DSH_HOME`、workspace、profile 和端口；默认也创建临时 SQLite，只有下述显式持久存储入口例外。

`DEEPSEEK_API_KEY` 只注入真实 DSH Host。脚本从传给构建、打包、插件安装和 `dump-config` 的环境中删除该变量，不得把值写入输出、临时 profile、记录或构建产物。`identity-admission` 不调用远程 LLM；只有 `meeting-business-loop` 的 Reviewer worker 成功才能证明本次 LLM 链路可用。

## Execute

运行单个场景：

```sh
CONVIVIUM_SMOKE_SCENARIO=identity-admission \
  pnpm --dir plugin smoke:profile --json

CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop \
  pnpm --dir plugin smoke:profile --json
```

按固定顺序运行两个场景：

```sh
pnpm --dir plugin smoke:profile --json
```

`--all` 与默认场景集合等价；它不能和 `CONVIVIUM_SMOKE_SCENARIO` 同时使用。命令行只接受 `--all` 和 `--json`。未知 selector、Browser mode、非正整数 timeout 或缺失凭据必须在运行前失败。

可按需调整以下正整数 timeout：

- `CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS`：等待 Host 或 probe 结果，默认 600000 ms。
- `CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS`：构建、安装和配置命令，默认 120000 ms。

### 显式保留 business-loop Meeting

只有用户明确授权把 smoke Meeting 写入持久存储时，才设置 `CONVIVIUM_SMOKE_STORAGE_PATH`。该值必须是已存在普通文件的绝对路径，并且只能与精确的 `meeting-business-loop` selector 同时使用；默认双场景、`--all`、`identity-admission`、相对路径、目录和不存在的路径都会在构建或 Host 启动前失败。

运行前必须停止所有使用同一 SQLite 的 Host。以下示例把完整会议及 archive 保留在正式 SQLite 中：

```sh
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop \
CONVIVIUM_SMOKE_STORAGE_PATH="$PWD/dsh-workspace/convivium-user/convivium-storage.sqlite" \
  pnpm --dir plugin smoke:profile --json
```

该模式仍隔离并清理 smoke 专用的 `DSH_HOME`、workspace、profile、probe、日志和端口，但不会删除、截断、复制或恢复显式 SQLite。成功 JSON 包含 `storagePersistence: "PRESERVED"`；`restore: "PASS"` 仅表示临时 smoke 资源已清理，不表示外部 SQLite 恢复到运行前状态。运行后的 Meeting 应保留，失败后也不得自动删除或直接编辑其数据。

## Assertions

### identity-admission

场景必须满足：

- Host Loader 能加载非空且 model-invocable 的 `verification-review` Skill。
- Catalog 含一个 admit candidate 和一个 reject candidate。
- admit candidate 创建独立 child `smoke-identity-admit`。
- child 可以被 interrupt 并 drain。
- 结果通过 `validateIdentityAdmissionResult` 的精确字段校验。

该场景不证明模型质量、远程 LLM、完整 Meeting command surface 或动态准入的所有失败分支。

### meeting-business-loop

场景议题为 Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，即实现“可控的发散”。外部材料使用确定性 fixture，不执行真实论文、代码仓库或 Web 检索，因此运行结果不是 Agent 长任务控制机制的研究结论。

同一已授权 Agenda 依次完成四个 Manager `roundGoal`：

1. 目标漂移与探索发散的机制和可观察信号；
2. Agent runtime 中目标、计划、checkpoint 与上下文压缩的控制边界；
3. 目标锚定、漂移检测与纠偏闭环的最小机制；
4. 同时衡量发散价值与目标一致性的继续／停止条件。

每轮必须登记两份 Evidence，Reviewer coordinator 为每份当前 version 启动一个 one-shot worker，收齐两个 Review 后携带 `claimId` 原子提交 batch，再发布 Round。最终结果必须满足：

- 4 个 Round、8 个 EvidenceVersion、4 个 Review batch 和 4 个 Publication；
- 8 个不同 worker Session，且 worker 没有 Meeting command authority；
- 子议题来源明确为 `manager-round-goal`；
- Meeting 进入 `archived`，Archive 为 `complete`；
- 初始 Host 停止后，第二个 Host 使用同一 SQLite 介质 cold reopen，并读回相同 archived Meeting。

结果必须通过 `validateMeetingBusinessLoopHotResult`、`completeMeetingBusinessLoopResult` 和最终 `validateScenarioResult`，不能仅以 Agent idle、Host ready 或进程退出判定成功。

## Review Records

默认运行会删除隔离环境。需要保留可复盘记录时，先创建专用目录，再传入其现有路径：

```sh
mkdir -p dsh-workspace/smoke-records
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop \
  CONVIVIUM_SMOKE_RECORD_DIR="$PWD/dsh-workspace/smoke-records" \
  pnpm --dir plugin smoke:profile --json
```

脚本在该目录内创建唯一 `convivium-smoke-record-*` 子目录，并按场景保存：

- `summary.json`；
- `dump-config.yml`；
- Host stdout/stderr；
- Agent prompt/inbox 摘要；
- business-loop 的 initial 与 cold-reopen 分阶段日志。

记录不会复制 SQLite、workspace、profile 或 `dev.env`。写入前会替换 `DEEPSEEK_API_KEY` 的精确值；记录仍可能包含会议主题、fixture 文本和 Agent 收件消息，应只保存在受控本地目录。

## Success, Failure And Restore

成功必须同时满足：

- 选定场景的精确 result schema 和业务断言全部通过；
- Host 已停止；
- 本次临时根已删除；
- 临时端口可以重新 exclusive bind；
- 输出包含 `restore=PASS`。

非 JSON 模式输出 `PASS <scenario> <duration>ms restore=PASS`；全部场景结束后输出总数和总耗时。JSON 模式每场输出一行包含 `restore: "PASS"` 和 `durationMs` 的对象。

任一构建、安装、Host 启动、probe、结果校验、cold reopen 或 Restore 失败都必须判 FAIL，并停止后续场景。失败时只处理 stdout 中对应的精确临时根和进程；不得清理开发者常用 profile、`dsh-workspace/`、凭据或其他 smoke 目录。复验必须创建新的隔离环境，不能补写失败运行的数据。

脚本只允许删除 OS 临时目录下、basename 以 `convivium-dsh-smoke-` 开头的路径；不满足该边界必须拒绝删除。仅完成 typecheck、单元测试、构建、端口监听或 `dump-config` 不能描述为 smoke 通过。

## Not Covered

- Browser 人工交互与断线恢复；
- 真实 arXiv、GitHub、Web 检索及研究结论质量；
- 任意第三方 Tool/MCP 的生产可用性；
- 多 Host writer、远程文件系统和生产发布；
- 开发期旧存储格式迁移、fallback、双写或回写。

当前实现覆盖和最近运行证据见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

## Related Documents

- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
