# DSH 插件冒烟测试

## Purpose

本文说明如何运行当前 target runtime 的真实 DSH 组合冒烟、判断成功与失败、保留复盘记录并确认 Restore。脚本入口是 `plugin/scripts/smoke-profile/index.mjs`；支持的场景和结果断言以该脚本及其 `probe/` 为准，本文不维护历史 selector。

当前只支持：

- `identity-admission`：验证 Role catalog、原生 Skill Loader 和独立平级 AgentSession。
- `meeting-business-loop`：验证 target Agent tools、四轮 Manager `roundGoal`、Evidence、Reviewer 逐版本 worker/Review、Publication、Archive 和 SQLite cold reopen。
- `peer-meeting-agents`：验证七个独立 Preset/Session、精确 Skill 隔离、用户控制、真实 GitHub/arXiv 读取、Reviewer worker 和同绑定冷恢复。

Browser smoke 尚未接入 target runtime；`CONVIVIUM_SMOKE_BROWSER_MODE=1` 会在 Host 启动前失败，不能作为 Browser 验收证据。

## 人工 Web 调试与验收

人工 Browser 调试不运行 `smoke:profile`，也不使用 `/tmp` 安装根。DSH 启动工作目录固定为仓库 `dsh-workspace/`，`DSH_HOME` 固定为 `dsh-workspace/dsh-home/`，项目目录固定为 `dsh-workspace/projects/meetings-view/`，安装、会议 SQLite 和角色资源固定在 `dsh-workspace/web-ui/convivium-user/`。Session 与 Meeting 数据跨源码刷新和 Git HEAD 变化保留，不为连续调试重建会议。Host 使用 `127.0.0.1:31828`；刷新或重启前必须先停止占用该端口的 Host，且不得并行运行共享 `DSH_HOME` 的常规安装。

上述固定目录的职责和持久数据位置如下；它们均位于已被 Git 忽略的 `dsh-workspace/`，不是 Convivium 源码目录：

- `dsh-workspace/web-ui/convivium-user/` 是人工 Web 调试安装根，保存 release、artifact、角色资源、运行配置以及 Convivium 会议存储；会议 SQLite 的固定路径是 `dsh-workspace/web-ui/convivium-user/convivium-storage.sqlite`，运行期间可能同时出现同路径前缀的 `-wal` 和 `-shm` 文件。
- `dsh-workspace/dsh-home/` 是该人工调试环境共享的 `DSH_HOME`，保存 DSH profile、Session 和设置；DSH Session 不存入上述会议 SQLite。
- `dsh-workspace/projects/meetings-view/` 是 DSH Web 的 Choose workspace 所选择的项目工作目录，用于限定普通用户 Session 的项目上下文；它不是插件安装根，也不保存 Convivium 会议 SQLite。
- `dsh-workspace/convivium-user/convivium-storage.sqlite` 属于普通持久安装流程，不是人工 Web 调试数据库；两套安装根不得混用。

从仓库根执行；首次安装创建固定目录，后续源码刷新复用它们，只新增以构建物 SHA-256 标识的 release 和 artifact，不覆盖旧 release、Session 或会议 SQLite：

```sh
web_ui_workspace="$PWD/dsh-workspace"
web_ui_home="$web_ui_workspace/dsh-home"
web_ui_root="$web_ui_workspace/web-ui/convivium-user"
web_ui_project="$web_ui_workspace/projects/meetings-view"
command -v lsof >/dev/null
test -z "$(lsof -nP -iTCP:31828 -sTCP:LISTEN)"
test -d "$web_ui_workspace"
test ! -L "$web_ui_workspace"
mkdir -p "$web_ui_project"
chmod 700 "$web_ui_project"
CONVIVIUM_INSTALL_ROOT="$web_ui_root" \
  ./scripts/install-from-source.sh --workspace "$web_ui_workspace" --dev-refresh
```

按照 [安装并运行 Convivium](./HOW-TO-INSTALL-AND-RUN.md) 核对发布物和启动条件；`$web_ui_root/workspace-path` 必须记录 `web_ui_workspace`，`start.sh` 应从仓库 `dsh-workspace/` 启动 DSH，并将 `DSH_HOME` 指向 `web_ui_home`。若首次安装复用仓库根固定的 `dev.env`，只在确认安装器新建的 `$web_ui_root/dev.env` 仍是空占位文件后，将其替换为指向仓库根 `dev.env` 的符号链接；后续刷新必须保留该链接，不得复制或回显 key。运行 `"$web_ui_root/start.sh"`，在 DSH Web 的 Choose workspace 中添加并选择 `web_ui_project` 的绝对路径，再从普通聊天输入 `/convivium <会议目标>` 创建人工 fixture，并在 `Meetings` 面板查看；若无法选择该项目目录，停止并记录实际入口。已存在的用户 Session 和会议在刷新后直接重开，不重新创建。只有新 profile 首次启动且缺少可用 fixture 时才建立新的会议。成功判据是重启后同一 `DSH_HOME` 能读回已提交的对话，同一 SQLite 能读回会议；仅端口监听不算通过。启动或补读失败时保留固定 `DSH_HOME`、项目目录、安装根和 Host 错误，不改用日常 profile、`/tmp` 或旧构建物。验收结束后停止 Host，保留全部固定目录；删除须另行按精确路径确认，不由 smoke Restore 清理。

## Prerequisites

- 从仓库根目录执行命令。
- Node.js 满足 `plugin/package.json` 的 engines 要求。
- pnpm 可以取得或已缓存 `@deepseek-ai/dsh@0.1.2-rc.1`。
- 仓库根目录存在不入 Git 的 `dev.env`，其中 `DEEPSEEK_API_KEY` 存在且去除空白后非空。文件可以包含其他本地条目；冒烟脚本只读取该 key。
- 不使用开发者常用的 DSH profile。脚本为每个场景创建独立临时 `DSH_HOME`、workspace、profile 和端口；默认也创建临时 SQLite，只有下述显式持久存储入口例外。

`DEEPSEEK_API_KEY` 只注入真实 DSH Host。脚本从传给构建、打包、插件安装和 `dump-config` 的环境中删除该变量，不得把值写入输出、临时 profile、记录或构建产物。动态准入可能触发模型通知处理；业务场景的真实 Reviewer worker 和平级场景的来源工具调用分别提供对应链路证据。

## Execute

运行单个场景：

```sh
CONVIVIUM_SMOKE_SCENARIO=identity-admission \
  pnpm --dir plugin smoke:profile --json

CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop \
  pnpm --dir plugin smoke:profile --json
```

按固定顺序运行三个场景：

```sh
pnpm --dir plugin smoke:profile --json
```

`--all` 与默认场景集合等价；它不能和 `CONVIVIUM_SMOKE_SCENARIO` 同时使用。命令行只接受 `--all` 和 `--json`。未知 selector、Browser mode、非正整数 timeout 或缺失凭据必须在运行前失败。

可按需调整以下正整数 timeout：

- `CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS`：等待 Host 或 probe 结果，默认 600000 ms。
- `CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS`：构建、安装和配置命令，默认 120000 ms。

### 显式保留 business-loop Meeting

只有用户明确授权把 smoke Meeting 写入持久存储时，才设置 `CONVIVIUM_SMOKE_STORAGE_PATH`。该值必须是已存在普通文件的绝对路径，并且只能与精确的 `meeting-business-loop` selector 同时使用；默认三场景、`--all`、其他 selector、相对路径、目录和不存在的路径都会在构建或 Host 启动前失败。

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

- Host Loader 能在准入角色 scope 加载非空且 model-invocable 的 `repository-analysis` Skill。
- Catalog 含一个 admit candidate 和一个 reject candidate。
- admit candidate 创建独立且无 parent 的 Session，同 requestId 重放返回原身份。
- reject candidate 不产生新身份，准入 Session 与 Manager 独立。
- 结果通过 `validateIdentityAdmissionResult` 的精确字段校验。

该场景不证明模型质量、完整 Meeting command surface 或动态准入的所有失败分支。

### meeting-business-loop

场景议题为 Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，即实现“可控的发散”。外部材料使用确定性 fixture，不执行真实论文、代码仓库或 Web 检索，因此运行结果不是 Agent 长任务控制机制的研究结论。

同一已授权 Agenda 依次完成四个 Manager `roundGoal`：

1. 目标漂移与探索发散的机制和可观察信号；
2. Agent runtime 中目标、计划、checkpoint 与上下文压缩的控制边界；
3. 目标锚定、漂移检测与纠偏闭环的最小机制；
4. 同时衡量发散价值与目标一致性的继续／停止条件。

每轮必须登记两份 Evidence。Reviewer coordinator 为每份当前 version 独立领取 claim、启动一个 one-shot worker，并在得到 completed 结果后携带对应 `claimId` 单独提交该 version 的 Review；同轮另一份 Evidence 的成功或失败不进入本次提交边界。两份 Evidence 都完成 Review 和 delivery 后才能发布 Round。最终结果必须满足：

- 4 个 Round、8 个 EvidenceVersion、8 份逐版本 Review 和 4 个 Publication；
- 8 个不同 worker Session，且 worker 没有 Meeting command authority；
- 子议题来源明确为 `manager-round-goal`；
- Meeting 进入 `archived`，Archive 为 `complete`；
- 初始 Host 停止后，第二个 Host 使用同一 SQLite 介质 cold reopen，并读回相同 archived Meeting。

结果必须通过 `validateMeetingBusinessLoopHotResult`、`completeMeetingBusinessLoopResult` 和最终 `validateScenarioResult`，不能仅以 Agent idle、Host ready 或进程退出判定成功。

### peer-meeting-agents

真实 Loader 创建七个无 parent 的 Session，逐角色比较 Skill 列表并逐名称验证可加载边界；输入 Session 在创建前关闭，notice 仍投递。研究角色实际读取 GitHub 固定 ref 和 arXiv 固定版本并提交证据，Reviewer 运行真实 one-shot worker。Agent 调用用户创建入口被拒绝，独立用户连接可以暂停；冷 Host 使用同一 DSH_HOME/SQLite 继续，并逐项核对原 Session、Preset、Skills、资源与模型绑定。八项 observed 必须通过精确结果校验。

此处的独立用户连接是重新建立的 loopback HTTP 请求；资源与模型绑定核对的是 Repository ownership 哈希，并未直接检查恢复后 Agent 的有效模型、角色身份指令或 `toolFilter`。一次 worker 不构成并发审核证据，结果中的固定来源标识也不能脱离工具调用记录单独证明实际内容读取。完整 MO-FR-14 验收边界见 [Peer Meeting Agents Design](../30-designs/PEER-MEETING-AGENTS-DESIGN.md#acceptance) 与 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

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
- business-loop 与 peer-meeting-agents 的 initial 与 cold-reopen 分阶段日志；失败时保留脱敏 Host 日志和失败摘要。

记录不会复制 SQLite、workspace、profile 或 `dev.env`。写入前会替换 `DEEPSEEK_API_KEY` 的精确值和 Host URL token；记录仍可能包含会议主题、fixture 文本和 Agent 收件消息，应只保存在受控本地目录。

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
- 任意来源的普遍可用性及研究结论质量（平级场景只证明当次固定 GitHub/arXiv 来源读取）；
- 任意第三方 Tool/MCP 的生产可用性；
- 多 Host writer、远程文件系统和生产发布；
- 开发期旧存储格式迁移、fallback、双写或回写。

当前实现覆盖和最近运行证据见 [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。

## Related Documents

- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Evidence Round Requirements](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)
- [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)
