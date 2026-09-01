# RUNBOOK：Meeting Agent Definition 与 DSH 去封装

## 0. 状态与工作边界

- 状态：`ready-for-execution`
- 审计结论：`Executable`
- 建立日期：2026-09-01
- 执行分支：`codex/redundant-code-governance`
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 基线：2026-09-01 在提交 `7bf3284` 的插件基线执行 `pnpm --dir plugin verify`，48 个 test files、368 tests 全部通过；后续提交 `f713775` 只修改仓库文档，不改变该插件验证基线。
- Authoring audit：2026-09-01 已核对第 4.5、4.8 节现存 old anchors 与 Role Catalog 固定计数；T2 edit manifest 在内存 dry-run 后旧 snapshot/adapter 禁止词零命中；DSH API probe 和 T4 exact 11-file preflight 已在锁定依赖/工作树实际通过；全部新增 Node heredoc 已通过 syntax check；33 个现存 Markdown 文件相对链接检查、RUNBOOK Prettier check 与 `git diff --check` 通过。Authoring 阶段未执行迁移、T3 新测试或 `smoke:profile`；它们只能由 T1-T6 产生证据。
- 确认依据：2026-09-01 用户明确确认“Agent Definition 和 Meeting identity 由 Convivium 动态管理；Agent capability composition 与 AgentSession runtime 由 DSH 原生机制管理；Convivium 只引用、校验和收窄 DSH 能力，不复制或二次封装”，随后明确要求形成本 RUNBOOK。
- 本 RUNBOOK 是临时执行说明，不是 Agent、DSH 或 Meeting 行为的长期真相源；完成 T7 后必须删除。

本 RUNBOOK 只允许完成两件事：

1. 把已经误建模为 `DshAgentTemplate*` 的 Convivium 配置收敛为 `MeetingAgentDefinition`，并形成 9 个非发布样本；
2. 删除当前代码中已确认重复声明 DSH/Cordis 原生接口或生命周期的薄封装，同时保留 Convivium 自己拥有的 Meeting 身份、授权、ownership、provisioning 和恢复语义。

不得在本 RUNBOOK 中把 Agent Definition 接入 Session provisioning。DSH `0.1.1-rc.2` 尚不能为 continuable child 选择不同于 parent 的 Agent Preset；这是一条明确的实现 STOP 边界，不是由 Convivium 自建 installer 绕过的理由。

### 0.1 已确认的正式口径迁移

当前 `ARCHITECTURE.md`、FR-14 和 BR-11 仍保存旧 `DSH Agent Template` 口径，这是本任务已知且经上述用户决定授权迁移的唯一正式文档冲突。T1 必须先把该确认结论提升到 architecture/requirements；在 T1 PASS 前不得创建新 interface、样本或修改代码。只有下列旧语义属于 T1 的迁移目标，不触发 1.3 的一般冲突 STOP：

- Convivium 自有 `DshAgentTemplate*` manifest/registry/installer/snapshot；
- Convivium 自有 Skill/Tool/MCP/permission/output set reference；
- Convivium 负责完整 Prompt、MCP、Sandbox、Approval、模型或 cold-resume capability composition；
- `plugin/examples/agent-templates/` 被描述成 DSH Template 契约样本。

T0 不重新解释 architecture/requirements；T1 只按第 4.5 节的 exact anchor/count 修改。任一 anchor/count 不符即 STOP，RUNBOOK 本身不授权执行者寻找替代文本或作额外产品决策。

### 0.2 执行前工作树基线

每个尚未执行的 Tn 只能在前一步已经退休并提交后开始。步骤开始前 `git status --short` 必须为空；任何 tracked 修改、staged 修改或 untracked 文件都使该步骤 STOP。执行者不得自行吸收、暂存、提交、移动或删除额外改动来满足前置条件。

```text
<empty>
```

## 1. 执行者契约

### 1.1 允许动作

- 只按当前 RUNBOOK 中尚存的最小 Tn 到 T7 顺序执行；每一步 PASS 后必须先按第 1.5 节退休并提交，才能进入下一步。
- 只修改每一步“允许修改”列出的文件、目录和 symbol。
- 可以用 `apply_patch` 修改文本文件；样本目录重命名使用 `mv`，不得删除后重新手工重建 Persona 内容。
- 不得运行会改写未列入当前步骤 allowlist 的全仓 formatter；每一步直接写出符合现有 Prettier 配置的文本，格式门禁失败即 STOP。
- 删除本 RUNBOOK 明确列出的过时文件、导出和测试。

### 1.2 禁止动作

- 不得实现 Agent Definition registry、resolver、installer、DSH Agent Preset、Skill registry、MCP registry、permission profile、model policy 或 cold-resume snapshot。
- 不得向 `startContinuable()` 伪造 `agentPreset`、`agentPresetId` 或当前 DSH 类型不存在的字段。
- 不得仅用 `persona`、`toolFilter` 或 Prompt 文本假装实现 `dshPresetId` 和 `requiredSkillNames`。
- 不得修改 Protocol Schema、tool schema、HTTP DTO、SQLite schema/migration、Domain state/event、Client UI 或发布文件白名单。
- 不得重命名或删除 Meeting 业务边界，只因其名称中包含 `adapter`、`runtime`、`record`、`lookup` 或 `binding`。
- 不得新增依赖、兼容层、feature flag、通用 registry、通用 manifest framework 或新顶层目录。
- 不得执行第 1.5 节之外的提交；不得 push、创建 PR、合并、amend、rebase 或 squash。

### 1.3 PASS 与 STOP

- PASS：当前步骤的命令退出码为 0，且所有文字断言和 `rg` 断言成立。
- STOP：任一 baseline 失败；除 0.1 明列的待迁移旧口径外，正式文档与本 RUNBOOK 冲突；指定路径或 symbol 不存在；DSH 公开类型与第 5 节证据不符；完成步骤需要进入 Non-goals；或验证只能通过放宽类型、Schema、权限或测试断言。
- STOP 后不得自行换方案。报告必须包含：最后一个 PASS 步骤、触发条件、文件与 symbol、最小复现命令、实际输出，以及继续所需的人工决定。
- 用户当前工作树中的其他改动不得回滚、覆盖或顺带整理。

### 1.4 统一失败恢复

- T0 无 repo 写入或外部副作用；失败后直接报告。
- T1、T2、T4、T5 失败时保留当前 working-tree diff，不自动回滚任何文件，不进入下一步；STOP 报告列出本步已经修改的精确路径。
- T3 的测试 fixture 必须用 `try/finally` 删除其 `mkdtemp` 返回的精确目录；repo 内样本迁移发生失败时保留现状，不删除或恢复用户原改动。
- T6 的 `smoke:profile` 必须依赖现有脚本自己的 restore；失败时报告脚本输出中的临时 profile/workspace 路径，不运行额外广域清理命令。
- T7 使用该步骤规定的可恢复移动；删除后检查失败时必须把同一 RUNBOOK 原样移回，不得留下已删除状态。
- 本任务不写数据库、不调用外部写 API、不改变用户 DSH profile；因此除测试临时目录和 T7 临时备份外没有需要回滚的外部状态。

### 1.5 步骤退休与提交协议

每个 Tn 的验证达到 PASS 后，必须立即执行以下唯一收口；不得先开始下一步：

1. 用 `apply_patch` 删除当前 `### Tn：...` heading 起至下一个 `### T(n+1)：...` heading 前的完整章节；T7 通过其关闭脚本删除整个 RUNBOOK。不得改写仍未执行步骤。
2. 运行 `git diff --check`，并确认 `git status --short` 只包含当前步骤“允许修改”的路径与本 RUNBOOK；出现其他路径立即 STOP。
3. 暂存当前步骤全部修改和本 RUNBOOK 的退休修改；读取完整 staged diff，确认没有额外路径、凭据、临时文件或未验证变化。
4. 使用下表固定 commit subject；T3、T4、T5 还必须使用表中固定 body。不得改写、合并或跳过提交。
5. commit 成功后运行 `test -z "$(git status --short)"`；非空立即 STOP，不得进入下一步。

| 步骤 | 固定 commit subject                                           | 固定 commit body                                                                                                                                             |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0   | `Docs(repo/runbook): 记录 T0 基线验证通过`                    | 无                                                                                                                                                           |
| T1   | `Docs(repo/agents): 收敛 Meeting Agent Definition 契约`       | 无                                                                                                                                                           |
| T2   | `Docs(repo/agents): 移除 DSH Template 二次建模`               | 无                                                                                                                                                           |
| T3   | `Feat(cross-project): 迁移 Meeting Agent Definition 样本验证` | `Projects: repo, plugin`；`Decision: Agent Definition 样本、验证器与执行记录必须作为一个原子判断变化`；`Verification: 按 RUNBOOK T3 focused validation 通过` |
| T4   | `Refactor(cross-project): 改用 DSH 原生运行时类型`            | `Projects: repo, plugin`；`Decision: DSH 原生类型替换与执行记录必须作为一个原子判断变化`；`Verification: 按 RUNBOOK T4 focused validation 通过`              |
| T5   | `Refactor(cross-project): 删除 Cordis 与 caller 冗余封装`     | `Projects: repo, plugin`；`Decision: 生命周期去封装与执行记录必须作为一个原子判断变化`；`Verification: 按 RUNBOOK T5 focused validation 通过`                |
| T6   | `Docs(repo/readiness): 记录 Agent Definition 去封装验证`      | 无                                                                                                                                                           |
| T7   | `Docs(repo/runbook): 完成 Agent Definition 去封装执行`        | 无                                                                                                                                                           |

已退休步骤的唯一执行证据是当前分支 Git 历史中的固定 commit subject 及该 commit 的验证事实；不得在 RUNBOOK 中保留完成标记、步骤摘要或重复日志。

## 2. 目标、起点与终点

### 2.1 当前起点

- `docs/20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md` 在 Convivium 内重新定义了 template registry、manifest、installer、Skill/Tool/MCP/permission set、model policy、resolved snapshot 和 resume receipt。
- `plugin/examples/agent-templates/` 与 `plugin/scripts/verify-agent-template-samples.mjs` 验证上述自建 Template 概念，但这些样本不被 DSH 安装，也不能形成差异化 Agent capability。
- 正式 requirements、interfaces、designs 和 readiness 已引用该错误方向。
- `plugin/src/dsh/session-adapter.ts` 重新声明了 `SubagentRuntime` 方法形状；`plugin/src/tools/register-tools.ts` 重新声明了 `ToolRuntime.register()`；`plugin/src/index.ts` 又在 Cordis `ctx.effect()` 之上实现一套 disposer registry。
- `CaptainParentBinding`/`bindCaptainParent()` 没有 production consumer，只被单元测试覆盖。

### 2.2 预期终点

完整工程链路固定为：

```text
Convivium MeetingAgentDefinition
  -> Manager 可见安全摘要 / Captain 选择与批准
  -> Convivium 读取 dshPresetId、requiredSkillNames、persona、toolFilter
  -> DSH 原生 Agent Preset / Skill / Tool / policy 负责能力组合
  -> DSH 创建独立 continuable AgentSession
  -> Convivium 保存 Meeting identity <-> DSH Session ownership
```

本 RUNBOOK 的实现终点只到该链路的“定义、样本和边界文档”。`Manager 推荐 / Captain 批准` 与“读取定义并创建差异化 Session”仍为未实现项，必须留在 requirements/readiness，不能在本次代码中接线；`TODO.md` 保持三个任务区域均为空。

最终仓库必须满足：

- 只有 `MEETING-AGENT-DEFINITION-INTERFACE.md` 定义 Convivium 拥有的 Agent Definition；不存在 `DshAgentTemplate*` 契约。
- 9 个样本只声明 Convivium 会议角色、Persona、DSH preset 引用、DSH Skill 名称、原生 `ToolRestriction`、expertise 和 evidence scope。
- 样本不复制 DSH preset、Skill、Tool Schema、MCP、Sandbox、Approval 或模型配置。
- production code 用 DSH 原生 `SubagentRuntime`/`ToolRuntime` 的 `Pick` 类型表达最小依赖，不再重写其方法签名。
- plugin 生命周期直接交给 Cordis `ctx.effect()`，不保留 `PluginDisposerRegistry`。
- Meeting ownership、caller resolution、Session label、provisioning envelope、followup 授权、archive proof 和 recovery 行为不变。

## 3. 严格 Scope

### 3.1 In scope

| ID  | 范围                       | 唯一结果                                                                                                                                                                                                                                 |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | 正式 Agent Definition 契约 | 新增 `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`；删除 `DSH-AGENT-TEMPLATE-INTERFACE.md`                                                                                                                                  |
| S2  | 正式文档去 Template 化     | FR-14 保留编号但改为“Meeting Agent Definition 与 DSH composition boundary”；所有正式文档改为引用 DSH 原生 Preset/Skill/Tool/Policy                                                                                                       |
| S3  | 角色目录映射               | candidate 私有映射从 `templateRef` 改为 `agentDefinitionId`；Definition 再引用 `dshPresetId`                                                                                                                                             |
| S4  | Agent Definition 样本      | 把 9 个 `agent-templates` 样本替换成 9 个 `meeting-agent-definitions` 样本；每个只含 `agent-definition.json` 与 `AGENT.md`                                                                                                               |
| S5  | 样本验证                   | 替换验证脚本、package script，并新增恶意/非法 fixture 单元测试                                                                                                                                                                           |
| S6  | DSH 类型去封装             | 删除 `SubagentProviderRegistry`、`ContinuableStarter`、`ContinuableFollowupRuntime`、`ContinuableLifecycleRuntime`、`ArchiveSessionRuntime`、`ContinuableInspectionRuntime`、`MeetingToolRegistry` 的自写方法签名；使用原生类型的 `Pick` |
| S7  | Cordis 生命周期去封装      | 删除 `PluginDisposerRegistry`/`createPluginDisposerRegistry()`；直接用 `ctx.effect()` 承担 runtime、route 和 tool disposer 生命周期                                                                                                      |
| S8  | 无消费者包装删除           | 删除 `CaptainParentBinding`/`bindCaptainParent()` 及其仅有单元测试和导出                                                                                                                                                                 |
| S9  | Readiness 收口             | 准确记录“定义与样本已形成、runtime composition 未实现、DSH per-child preset 被阻塞”，并保持 TODO 三个任务区域为空                                                                                                                        |

### 3.2 保留白名单：不得作为“过度封装”删除

以下类型和函数表达 Convivium 自己拥有的会议语义，必须原样保留其行为和公开签名：

- `MeetingOwnershipRecord`、`MeetingOwnershipLookup`、`ResolvedMeetingCaller`、`resolveMeetingCaller()`；
- `encodeMeetingSessionLabel()`、`decodeMeetingSessionLabel()`；
- `SessionProvisioningEnvelope`、`createSessionProvisioningEnvelope()`、`serializeSessionProvisioningEnvelope()`；
- `startManagerSession()`、`startParticipantSession()` 的 label、childId、ownership envelope 和返回 ID 校验；
- 所有 followup 前后双重 authorization、participant/attempt/ownership 校验；
- `interruptAndDrainOwnedSessions()`、`proveArchiveOwnedChildren()`、`inspectOwnedSessions()` 的 Meeting ownership 证明；
- repository、outbox、recovery、archive 和 protocol 中的 Meeting 事务语义；
- `MeetingToolCallerResolver` 与 `MeetingToolRuntime`：前者是 Convivium caller/auth boundary，后者是 Convivium tool application API，不是 DSH runtime 镜像。

### 3.3 Non-goals

- Agent Definition 的持久化、CRUD、动态生成算法、版本选择或 catalog storage。
- FR-13 recommendation、Captain disposition、Participant admission 的 Schema、状态机、tools、UI 和 runtime 实现。
- `meeting_scribe` minutes/transcript 功能实现。
- 任意 per-child DSH Agent Preset composition、profile installation 或真实能力差异验证。
- 为当前不存在的 MCP package 建立 Convivium MCP 抽象。
- 改变初始 Participant、Manager、Captain、speaker、task、mail、decision、archive 或 transcript 行为。
- 全仓库通用“adapter 清理”；只处理 S6、S7、S8 明列的 confirmed duplicates。
- 修改 DSH 依赖版本、patch `node_modules` 或 vendoring DSH 源码。
- 数据迁移、兼容读写、事件重放、幂等键和公开错误新增：本次没有 runtime data path，全部 `Not Applicable`。

## 4. 唯一数据契约

### 4.1 Runtime 值对象

`docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md` 必须定义以下精确 TypeScript 契约；字段不得增删、改名或改为 nullable：

```ts
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";

type MeetingAgentRoleDefinitionIdV1 =
  | "meeting_manager"
  | "domain_architect"
  | "runtime_engineer"
  | "protocol_ui_engineer"
  | "verification_reviewer"
  | "github_research_analyst"
  | "arxiv_research_analyst"
  | "web_research_analyst"
  | "meeting_scribe";

type AgentEvidenceScopeV1 = "repository" | "github" | "arxiv" | "web";

interface MeetingAgentDefinitionV1 {
  agentDefinitionId: string;
  definitionVersion: string;
  roleDefinitionId: MeetingAgentRoleDefinitionIdV1;
  displayName: string;
  summary: string;
  persona: string;
  dshPresetId: string;
  requiredSkillNames: readonly string[];
  toolFilter?: ToolRestriction;
  expertiseTags: readonly string[];
  evidenceScopes: readonly AgentEvidenceScopeV1[];
}
```

字段所有权和语义：

| 字段                 | Required | Owner / producer        | Consumer                                           | 固定语义                                                                                |
| -------------------- | -------- | ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `agentDefinitionId`  | 是       | Convivium configuration | Catalog/runtime                                    | 稳定定义 ID；不能充当 Session、Participant、Preset 或 Skill ID                          |
| `definitionVersion`  | 是       | Convivium configuration | Catalog/snapshot                                   | 定义内容变化时提升；本次样本固定 `1.0.0`                                                |
| `roleDefinitionId`   | 是       | Convivium               | Manager projection/runtime                         | 会议职责分类；`meeting_manager` 不进入 Participant catalog                              |
| `displayName`        | 是       | Convivium               | Manager/Captain projection                         | 非授权显示值                                                                            |
| `summary`            | 是       | Convivium               | Manager projection                                 | 一句话参会价值，不包含 secret、Prompt 或工具配置                                        |
| `persona`            | 是       | Convivium               | `startContinuable().request.persona` 的未来 caller | 会议角色说明；不授予 Tool、Skill、MCP 或 authority                                      |
| `dshPresetId`        | 是       | Convivium 引用          | DSH Host 的未来 resolver                           | 只引用 DSH 原生 Agent Preset；Convivium 不复制或安装 Preset                             |
| `requiredSkillNames` | 是       | Convivium 声明          | DSH Skill registry 的未来校验器                    | DSH 原生 Skill 名称；不是 set ref，也没有 Convivium version wrapper                     |
| `toolFilter`         | 否       | Convivium               | DSH `startContinuable()`                           | `@deepseek-ai/dsh-tools` 原生类型；只能收窄 Preset 已提供的 global tools，不能授予 Tool |
| `expertiseTags`      | 是       | Convivium               | Manager projection                                 | 推荐相关性元数据，不授予能力                                                            |
| `evidenceScopes`     | 是       | Convivium               | Manager planning                                   | 研究来源范围；不是 Tool/MCP 权限                                                        |

空值规则：`persona`、ID、version、display、summary 均为非空字符串；`requiredSkillNames` 与 `expertiseTags` 至少一项且不得重复；`evidenceScopes` 可为空但不得重复；`toolFilter` 省略表示不增加定义级收窄，不能解释为“允许全部”。

### 4.2 文件样本格式

每个样本目录固定包含：

```text
plugin/examples/meeting-agent-definitions/<directory>/
  agent-definition.json
  AGENT.md
```

样本 root 的 direct entry name 集合必须 exact 等于 `README.md` 加第 4.3 节的 9 个 directory；`README.md` 必须是普通文件，9 个 directory 必须是普通目录，root direct entry 不得是 symlink 或其他文件类型。`SAMPLE_DIRECTORY_SET_MISMATCH` 在本 RUNBOOK 中表示这个 root direct entry name 集合不匹配，不只表示目录名不匹配。每个 sample directory 的 direct entry name 集合必须 exact 等于 `agent-definition.json`、`AGENT.md`。

`agent-definition.json` 是文件序列化格式，不是新的 DSH manifest。它把 runtime `persona: string` 替换为唯一的文件引用：

```ts
interface MeetingAgentDefinitionDocumentV1 extends Omit<
  MeetingAgentDefinitionV1,
  "persona"
> {
  schemaVersion: 1;
  persona: {
    path: "AGENT.md";
    sha256: string;
  };
}
```

验证脚本读取 UTF-8 `AGENT.md`、验证 SHA-256 后，把全文视为 `MeetingAgentDefinitionV1.persona`。不得支持其他 path、URL、绝对路径、父目录、symlink、glob、include 或继承。

### 4.3 九个样本的固定矩阵

目录名沿用当前目录名。`agentDefinitionId` 固定为 `convivium.<roleDefinitionId>`，`dshPresetId` 固定为 `convivium-<directory>`，`definitionVersion` 固定为 `1.0.0`。Persona 正文只做 `ROLE.md -> AGENT.md` 文件名迁移，不在本次改写其职责内容。

| directory                 | roleDefinitionId          | requiredSkillNames            | evidenceScopes   | toolFilter                                                                   |
| ------------------------- | ------------------------- | ----------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `meeting-manager`         | `meeting_manager`         | `["meeting-management"]`      | `[]`             | `{ "allow": ["convivium_meeting_status", "convivium_submit_manager_plan"] }` |
| `domain-architect`        | `domain_architect`        | `["domain-architecture"]`     | `["repository"]` | 省略                                                                         |
| `runtime-engineer`        | `runtime_engineer`        | `["dsh-runtime-engineering"]` | `["repository"]` | 省略                                                                         |
| `protocol-ui-engineer`    | `protocol_ui_engineer`    | `["protocol-ui-engineering"]` | `["repository"]` | 省略                                                                         |
| `verification-reviewer`   | `verification_reviewer`   | `["verification-review"]`     | `["repository"]` | 省略                                                                         |
| `github-research-analyst` | `github_research_analyst` | `["github-source-research"]`  | `["github"]`     | 省略                                                                         |
| `arxiv-research-analyst`  | `arxiv_research_analyst`  | `["arxiv-paper-analysis"]`    | `["arxiv"]`      | 省略                                                                         |
| `web-research-analyst`    | `web_research_analyst`    | `["web-source-research"]`     | `["web"]`        | 省略                                                                         |
| `meeting-scribe`          | `meeting_scribe`          | `["referenced-minutes"]`      | `[]`             | `{ "allow": ["convivium_meeting_status", "convivium_submit_turn"] }`         |

其余样本字段固定如下，不允许执行者自行概括或改写：

| roleDefinitionId          | displayName                | summary                                                                    | expertiseTags                                                        |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `meeting_manager`         | `Meeting Manager`          | `围绕当前议题形成有界发言计划，并在存在职责或证据缺口时提出参会推荐。`     | `["meeting-planning", "scope-control", "attendance-recommendation"]` |
| `domain_architect`        | `Domain Architect`         | `审核领域状态、不变量、需求与设计一致性以及 completion/termination 语义。` | `["domain-model", "requirements", "architecture"]`                   |
| `runtime_engineer`        | `Runtime Engineer`         | `分析 DSH runtime、事务、outbox、恢复和 AgentSession 生命周期。`           | `["dsh-runtime", "transactions", "recovery"]`                        |
| `protocol_ui_engineer`    | `Protocol and UI Engineer` | `分析 Protocol Schema、Tools、HTTP、projection 与 Client UI 边界。`        | `["protocol", "tools", "client-ui"]`                                 |
| `verification_reviewer`   | `Verification Reviewer`    | `建立测试矩阵、反例、回归和 readiness 证据。`                              | `["verification", "regression", "readiness"]`                        |
| `github_research_analyst` | `GitHub Research Analyst`  | `搜索并分析官方 repository、源码、commit、issue、PR 与 release。`          | `["github", "source-analysis", "release-evidence"]`                  |
| `arxiv_research_analyst`  | `arXiv Research Analyst`   | `搜索并分析论文版本、方法、实验结论与局限。`                               | `["arxiv", "paper-analysis", "research-evidence"]`                   |
| `web_research_analyst`    | `Web Research Analyst`     | `搜索并分析官方文档、标准、发布说明、安全公告与时效信息。`                 | `["web", "official-documentation", "current-information"]`           |
| `meeting_scribe`          | `Meeting Scribe`           | `从正式 transcript、事实、决议与任务结果形成带 canonical 引用的纪要草稿。` | `["minutes", "fact-tracing", "decision-recording"]`                  |

Persona 正文必须保持 byte-for-byte 不变；重命名后的 `AGENT.md` hash 固定如下：

| directory                 | persona.sha256                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| `meeting-manager`         | `a0fa07824aec671bd7b292674ea1233108151b1baf9b06ef09b72c7349bbf173` |
| `domain-architect`        | `38d1ade66ef1f0cbf5893df0d440653c25955215de99cf2ba0a4981fc7dab9d0` |
| `runtime-engineer`        | `62b383eceac31c79edd40ea9ba1aa0207c21c74954f1e31b533c55b23b1ec88b` |
| `protocol-ui-engineer`    | `876247158afdd8e918873223581ea3ec2372d95d86d0031a2987132c9866d5d9` |
| `verification-reviewer`   | `ce8987f755e9cb646813e5bfcfdcf48649700fd4ac82080ccaf0ab48962a5e3e` |
| `github-research-analyst` | `f612ea1ed2828b4581def3139d6823932d2a774224698dacf32f29e19cb9d8d2` |
| `arxiv-research-analyst`  | `caddeeb95806dd9a477bb5ac222424ba8fc8add7e1416b111285d447c0ab4302` |
| `web-research-analyst`    | `92fe78e64311ef4b244a65a15dcdf3a5a3138e76155d45ca1c80bb5d6a3c5113` |
| `meeting-scribe`          | `9612249b8a6fd1a7e1cf50030f590beccb0f0b615bcb7f39a1e7ec8d5456a2e8` |

`toolFilter.allow` 中只允许当前已注册的 exact tool name；其他样本省略 `toolFilter`，不得为未知 DSH/GitHub/arXiv/Web Tool 猜名称。

### 4.4 样本验证器的固定错误契约

样本验证器只验证第 4.2、4.3 节这 9 个固定样本，不建立通用 Agent Definition registry，也不复制 DSH 的通用 preset/skill/tool grammar。所有 ID、Skill、tag、scope 和 tool filter 均与固定矩阵做 exact deep comparison；因此不导入 `@deepseek-ai/dsh-skill` 或 `@deepseek-ai/dsh-agent-presets`，也不新增依赖。

验证器是 `.mjs`，必须导出以下 JavaScript 值和函数；下列是 export shape pseudocode，函数空 body 不是可复制实现；不得伪造 TypeScript type export：

```js
export const agentDefinitionSampleErrorCodes = Object.freeze([
  "ROOT_NOT_READABLE",
  "ROOT_ENTRY_INVALID",
  "SAMPLE_DIRECTORY_SET_MISMATCH",
  "SAMPLE_FILE_SET_MISMATCH",
  "SYMLINK_FORBIDDEN",
  "JSON_INVALID",
  "DEFINITION_FIELD_SET_MISMATCH",
  "SAMPLE_MATRIX_MISMATCH",
  "PERSONA_PATH_INVALID",
  "PERSONA_HASH_INVALID",
  "PERSONA_HASH_MISMATCH",
  "DUPLICATE_AGENT_DEFINITION_ID",
  "DUPLICATE_ROLE_DEFINITION_ID",
]);

/**
 * @param {string} root
 * @returns {Promise<readonly {code: string, location: string}[]>}
 */
export async function verifyMeetingAgentDefinitionSamples(root) {}
```

规则固定如下：

- `agent-definition.json` 的 required 字段集合必须 exact 等于 `schemaVersion`、`agentDefinitionId`、`definitionVersion`、`roleDefinitionId`、`displayName`、`summary`、`persona`、`dshPresetId`、`requiredSkillNames`、`expertiseTags`、`evidenceScopes`；只有第 4.3 节为该目录指定 `toolFilter` 时字段集合才额外且必须包含 `toolFilter`。unknown field、missing required field、缺少矩阵要求的 `toolFilter` 或在矩阵要求省略时出现 `toolFilter`，都只返回 `DEFINITION_FIELD_SET_MISMATCH`。
- `persona` 必须是非 `null`、非 Array 的 object，且 own enumerable key 集合 exact 等于 `path`、`sha256`；否则只返回 `DEFINITION_FIELD_SET_MISMATCH` 并跳过该 JSON 的 matrix/persona 字段校验。`path` 和 `sha256` 必须是 string；非 string 分别按 `PERSONA_PATH_INVALID`、`PERSONA_HASH_INVALID` 处理。
- 目录集合、每目录文件集合以及除 `persona` 外的 JSON 字段值必须 exact 等于 4.3；任一差异返回对应的 set error 或 `SAMPLE_MATRIX_MISMATCH`。`persona` 只按下一条验证，不同时产生 matrix error。
- 任一 root entry、sample directory、JSON 或 `AGENT.md` symlink 返回 `SYMLINK_FORBIDDEN`；root direct entry 非普通 file/directory 返回 `ROOT_ENTRY_INVALID`，sample directory direct entry 非普通 file 返回 `SAMPLE_FILE_SET_MISMATCH`。
- Persona path 非 exact string `AGENT.md` 返回 `PERSONA_PATH_INVALID` 并跳过该 Persona 的 hash/content 校验；hash 非 string 或不匹配 `/^[a-f0-9]{64}$/` 返回 `PERSONA_HASH_INVALID` 并跳过 content 校验。合法格式但不等于 4.3 固定 hash 时只返回 `PERSONA_HASH_MISMATCH`，location 是该目录的 `agent-definition.json`，并跳过 content 校验；声明 hash 等于固定 hash、但 `AGENT.md` 实际 SHA-256 不等于声明 hash 时只返回 `PERSONA_HASH_MISMATCH`，location 是该目录的 `AGENT.md`。
- 重复 `agentDefinitionId`、`roleDefinitionId` 分别返回对应 duplicate code；即使同时构成 matrix mismatch，也必须同时返回两个 error。
- `location` 使用 `/` 分隔的 root-relative POSIX 路径：root 自身为 `.`，root child 为 `<entry>`，定义内容错误为 `<directory>/agent-definition.json`，Persona 内容错误为 `<directory>/AGENT.md`。duplicate error 定位到按 directory code-point ascending 排序后的第二个冲突定义文件。
- root 自身的 `lstat` 或 `readdir` 失败时只返回 `ROOT_NOT_READABLE` 并停止。root direct child 的 `lstat` 失败时返回 `ROOT_ENTRY_INVALID` at `<entry>` 并跳过该 entry；已知 sample directory 的 `readdir` 或其 direct child `lstat` 失败时返回 `SAMPLE_FILE_SET_MISMATCH` at `<directory>` 并跳过该目录；`agent-definition.json` 读取失败与 JSON parse 失败相同，只返回 `JSON_INVALID`；`AGENT.md` 读取或 SHA-256 计算失败与正文 hash 不匹配相同，只返回 `PERSONA_HASH_MISMATCH` at `<directory>/AGENT.md`。不得让文件系统异常逃出 verifier。
- root direct entry name 集合不匹配时记录一个 `SAMPLE_DIRECTORY_SET_MISMATCH` at `.`；symlink 或非预期 entry 记录对应错误并跳过该 entry；root 集合不匹配后仍验证存在且为普通目录的 4.3 已知目录；`README.md` 只验证存在且是非 symlink 普通文件，其 exact 内容由 T3 独立断言；sample 文件集合不匹配时跳过该目录后续读取；`JSON_INVALID` 或 `DEFINITION_FIELD_SET_MISMATCH` 后跳过该 JSON 的 matrix、persona 和 duplicate 校验；一个定义无论有几个非-persona matrix 字段不同都只产生一个 `SAMPLE_MATRIX_MISMATCH`。
- error 按 `location`、再按 `code` 使用 `<`/`>` 字符串比较形成 code-point ascending order，不使用 locale-dependent `localeCompare()`，不去重。CLI 默认 root 固定为 `fileURLToPath(new URL("../examples/meeting-agent-definitions/", import.meta.url))`，不读取 cwd、argv root 或环境变量。CLI 入口判定固定为 `import.meta.url === pathToFileURL(process.argv[1]).href`；成功时向 stdout 只写一行 `PASS 9 Meeting Agent Definition samples` 并保持 exit code 0；失败时按已排序数组向 stderr 每项写一行 exact `FAIL <code> <location>`，设置 `process.exitCode = 1`，且 stdout 为空。

### 4.5 文档修改的唯一目标文本

本节是 T1、T2、T6 的逐文件 edit manifest。执行者不得围绕目标文本另写解释、改写相邻段落或自行选择术语。除 Role Catalog token table 外，未显式写出数量的 old anchor 在修改前必须 exact 命中一次；写明“两处”“各”“全部”或其他数量的 replacement 必须 exact 等于该数量；计数不符即 STOP。Role Catalog token table 单独固定每个 token 的预期计数。表中写“整段替换”时，必须从该 heading 开始替换到下一个同级 heading 之前。

#### Architecture

在 `docs/00-governance/ARCHITECTURE.md` 只执行以下五项：

1. 把以 `DSH Host 可以提供版本化 Agent role catalog` 开头的 bullet 替换为：
   `- Convivium 拥有会议角色目录、Meeting Agent Definition、Manager 可见安全摘要、参会选择与批准状态；DSH Host 或 profile 拥有 Agent Preset、Skills、Tools、MCP、Sandbox、Approval、模型配置及其安装和执行。`
2. 把以 `每个 meeting-owned Manager/Participant Session 必须绑定一个已解析的 DSH Agent Template snapshot` 开头的 bullet 替换为：
   `- Meeting Agent Definition 只引用 DSH 原生 Agent Preset 和 Skill 名称，并可用 DSH 原生 ToolRestriction 收窄工具；Convivium 不复制、安装或持久化 DSH capability composition。Definition 存在不证明 capability 已安装；缺少可验证的 DSH composition 时必须 fail closed。`
3. 把以 `Convivium 可以保存 Template ID/version/hash` 开头的 bullet 替换为：
   `- Convivium 可以保存 Meeting Agent Definition identity 与 meeting-owned DSH Session ownership；MCP、Sandbox、Approval、模型和其他 Host 私有能力配置仍由 DSH 管理。Definition persistence、resolution 和 Session composition 尚未实现。`
4. 把以 `Manager 只能消费 Agent catalog` 开头的 bullet 中 `template secret` 替换为 `DSH capability secret`；把同一 bullet 中 `Meeting 已固化的 snapshot` 替换为 `Meeting 已固化的 Catalog snapshot`。把紧随其后、以 `Agent Template 只能通过` 开头的整个 bullet 替换为：
   `- Meeting Agent Definition 只能引用 DSH 公开的 Preset、Skill 和 ToolRestriction；Convivium 不得用 Prompt、persona 或自建 installer 假装安装 DSH capability。`
5. 把以 `` `plugin/examples/agent-templates/` `` 开头的 bullet 替换为：
   `- \`plugin/examples/meeting-agent-definitions/\` 保存不进入发布包的 Convivium Meeting Agent Definition 样本；样本不是 DSH Agent Preset、不是 capability registry，也不证明运行时已安装差异化能力。`

#### Requirements

在 `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md` 只执行以下五项：

1. FR-13 第 9 条整句替换为：`9. candidate 的 Meeting Agent Definition 不存在、其引用的 DSH Preset/Skill 无法验证，或 Session provisioning 失败时，不得产生部分可用 Participant；会议必须显示失败原因，并允许 Manager 在新状态上推荐替代 candidate。`
2. `### FR-14：DSH Agent Template` 到 `## Business Rules` 之前整段替换为下列 exact block：

```markdown
### FR-14：Meeting Agent Definition 与 DSH composition boundary

1. Convivium 必须能定义版本化 Meeting Agent Definition；Definition 只包含稳定定义 ID、版本、会议角色、显示摘要、persona、DSH Agent Preset 引用、required DSH Skill 名称、optional DSH ToolRestriction、expertise tags 和 evidence scopes。
2. Agent Definition 和 Meeting identity 由 Convivium 管理；Agent Preset、Skills、Tools、MCP、Sandbox、Approval、模型配置、capability composition 和 AgentSession runtime 由 DSH 管理。
3. `dshPresetId` 只引用 DSH 原生 Agent Preset；`requiredSkillNames` 只声明未来 Host-side validation 的必需 DSH Skill；Convivium 不建立 Preset、Skill、Tool、MCP 或 permission registry/installer。
4. `toolFilter` 必须使用 DSH 原生 `ToolRestriction`，并且只能收窄目标 Preset 已提供的 Tools，不能授予新 Tool 或扩大 DSH/用户权限。
5. `persona` 只提供 meeting-specific role instruction，不授予 Skill、Tool、MCP、Sandbox、Approval、模型或 Meeting authority；仓库 `AGENTS.md` 也不作为隐式 Agent capability。
6. Manager recommendation 和 Captain approval 只能选择 Definition 对应的会议身份；只有 DSH 完成独立 continuable AgentSession provisioning 后，该身份才能成为可调度 Participant。
7. Definition resolution、Preset/Skill validation 或 DSH capability composition 任一失败时必须 fail closed，不得通过 Prompt-only、persona-only、Tool Schema 隐藏或 Convivium 自建 capability installer 降级运行。
8. 当前 DSH `0.1.1-rc.2` 不能为 continuable child 选择不同于 parent 的 Agent Preset；在 DSH 提供公开 per-child preset composition API 前，Definition 到差异化 AgentSession 的 runtime 接线保持未实现。
```

3. `### BR-11：Agent Template 组合边界` heading 和其唯一正文段落替换为：

```markdown
### BR-11：Meeting Agent Definition 与能力所有权

Meeting Agent Definition 描述 Convivium 会议角色并引用 DSH capability，但不安装 capability，也不产生 Meeting authority。Convivium 只管理 Definition、会议身份、选择、批准和 Session ownership；DSH 管理 Preset、Skills、Tools、MCP、Sandbox、Approval、模型、组合与执行。任何 Definition 字段、Prompt 或 persona 都不能覆盖 Runtime 根据真实 Session、Meeting identity 和当前 attempt 形成的授权结果。
```

4. Acceptance 35 至 39 整段替换为：

```markdown
35. 每个 Agent Definition 都有稳定 `agentDefinitionId` 和 `definitionVersion`，并明确引用一个 `dshPresetId` 与 required DSH Skill 名称；Definition 不复制 DSH capability 内容。
36. `toolFilter` 只能收窄目标 Preset 已有 Tools；Definition、persona 或 Skill 名称不能授予 Tool、MCP、Sandbox、Approval 或模型权限。
37. Manager 只看到 Agent Definition 的安全摘要；recommendation 不创建 Session，Captain approval 也必须等待独立 Session provisioning 成功后才能形成可调度 Participant。
38. Definition、Preset 或 required Skill 无法解析和验证时，provisioning 整体失败，不产生部分可用 Participant，也不使用 Prompt-only 或 Convivium installer workaround。
39. 在 DSH 提供并验证 per-child preset composition API 前，系统必须把差异化 Agent capability runtime 标记为未实现；Definition 样本存在不得被描述为 capability 已安装。
```

5. Related Documents 中可见文本为 `DSH Agent Template`、target 为 `../20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md` 的唯一 bullet，替换为可见文本 `Meeting Agent Definition`、target `../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`；其余 Related Documents bullet byte-for-byte 不变。

#### Role Catalog 与关联链接

在 `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md` 先把 exact field `templateRef: DshAgentTemplateRefV1;` 替换为 `agentDefinitionId: string;`，再对剩余修改前文本执行 simultaneous exact token replacements；不得把一行的 new 再作为后续 old 输入。`expected before` 是执行 exact field replacement 后、token table 前的计数；任一计数不符即 STOP。全部替换后 old token 必须零命中：

| old                               | expected before | new                                                      |
| --------------------------------- | --------------- | -------------------------------------------------------- |
| `可用 Agent template`             | 1               | `可用 Meeting Agent Definition`                          |
| `DshAgentTemplateRefV1`           | 1               | `MeetingAgentDefinitionV1`                               |
| `DSH Agent template`              | 1               | `Meeting Agent Definition`                               |
| `DSH template reference`          | 3               | `Agent Definition identity`                              |
| `受控 template mapping`           | 1               | `受控 Agent Definition mapping`                          |
| `template 已不可解析`             | 1               | `Agent Definition 或其 DSH capability 引用已不可解析`    |
| `DSH template 的权限`             | 1               | `DSH Preset 和 policy 的权限`                            |
| `template 路径`                   | 1               | `Preset/Skill 私有配置`                                  |
| `对应 DSH Agent Template`         | 1               | `对应 Meeting Agent Definition 及其 DSH capability 引用` |
| `DSH-AGENT-TEMPLATE-INTERFACE.md` | 1               | `MEETING-AGENT-DEFINITION-INTERFACE.md`                  |

随后把 `Runtime 保留 candidateId` 所在句的后半句替换为 `Runtime 保留 \`candidateId -> agentDefinitionId -> MeetingAgentDefinitionV1\` 私有映射。`；把 `projection 不公开`段中的`Agent Definition identity`替换为`agentDefinitionId`。不得改变 recommendation、disposition、admission、error code、状态或权限规则。

在 `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md` 只替换 Related Documents 中的 DSH Agent Template 条目。目标 bullet 的可见前缀固定为 `- Meeting Agent Definition：`，Markdown link label 固定为 `MEETING-AGENT-DEFINITION-INTERFACE.md`，link target 固定为同目录相对路径 `MEETING-AGENT-DEFINITION-INTERFACE.md`；该 bullet 不含其他文本。

### 4.6 样本 fixture 的唯一变异表

T3 的 18 个 test case 各自先创建 `caseTemp = mkdtemp(...)`，再由同一个合法 root factory 把 repo 中的 `README.md` 和 9 个合法目标样本目录复制到 `validRoot = <caseTemp>/samples`；`validRoot` direct entry name 集合必须 exact 等于第 4.2 节。每个 case 向 verifier 传 `validRoot`，只有 `root unreadable` 传 `<caseTemp>/missing`。除 valid case 外，每个 case 只施加表中变异；未列出的文件和值保持合法。`expected` 是完整错误数组，不是 contains 断言。`finally` 只递归删除该 case 的 exact `caseTemp`。

| case                 | 唯一变异                                                                                               | expected                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| valid                | 无                                                                                                     | `[]`                                                                                                                                                                                   |
| root unreadable      | 传入不存在的 `<caseTemp>/missing`                                                                      | `[{code:"ROOT_NOT_READABLE",location:"."}]`                                                                                                                                            |
| root entry invalid   | `validRoot` 新增 FIFO `unexpected`                                                                     | `[{code:"SAMPLE_DIRECTORY_SET_MISMATCH",location:"."},{code:"ROOT_ENTRY_INVALID",location:"unexpected"}]`                                                                              |
| directory set        | 删除 `meeting-scribe` 目录                                                                             | `[{code:"SAMPLE_DIRECTORY_SET_MISMATCH",location:"."}]`                                                                                                                                |
| file set             | `meeting-scribe` 新增 `extra.txt`                                                                      | `[{code:"SAMPLE_FILE_SET_MISMATCH",location:"meeting-scribe"}]`                                                                                                                        |
| symlink              | 把原正文复制到 `<caseTemp>/AGENT-target.md`，再把 `meeting-scribe/AGENT.md` 替换为指向该文件的 symlink | `[{code:"SYMLINK_FORBIDDEN",location:"meeting-scribe/AGENT.md"}]`                                                                                                                      |
| JSON                 | `meeting-scribe/agent-definition.json` 写入 `{`                                                        | `[{code:"JSON_INVALID",location:"meeting-scribe/agent-definition.json"}]`                                                                                                              |
| field set            | 在 `meeting-scribe` JSON 增加 `unknown:true`                                                           | `[{code:"DEFINITION_FIELD_SET_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                             |
| persona field set    | 在 `meeting-scribe.persona` 增加 `unknown:true`                                                        | `[{code:"DEFINITION_FIELD_SET_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                             |
| Skill matrix         | `meeting-scribe.requiredSkillNames=[]`                                                                 | `[{code:"SAMPLE_MATRIX_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                                    |
| scope matrix         | `meeting-scribe.evidenceScopes=["web"]`                                                                | `[{code:"SAMPLE_MATRIX_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                                    |
| tool matrix          | `meeting-scribe.toolFilter.allow=["convivium_meeting_status"]`                                         | `[{code:"SAMPLE_MATRIX_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                                    |
| persona path         | `meeting-scribe.persona.path="../AGENT.md"`                                                            | `[{code:"PERSONA_PATH_INVALID",location:"meeting-scribe/agent-definition.json"}]`                                                                                                      |
| hash grammar         | `meeting-scribe.persona.sha256="invalid"`                                                              | `[{code:"PERSONA_HASH_INVALID",location:"meeting-scribe/agent-definition.json"}]`                                                                                                      |
| declared hash        | `meeting-scribe.persona.sha256` 改为 64 个 `0`                                                         | `[{code:"PERSONA_HASH_MISMATCH",location:"meeting-scribe/agent-definition.json"}]`                                                                                                     |
| hash mismatch        | 把 `meeting-scribe/AGENT.md` 末尾追加 `x`，不改声明 hash                                               | `[{code:"PERSONA_HASH_MISMATCH",location:"meeting-scribe/AGENT.md"}]`                                                                                                                  |
| duplicate definition | 把 `web-research-analyst.agentDefinitionId` 改为 `convivium.meeting_scribe`                            | `[{code:"DUPLICATE_AGENT_DEFINITION_ID",location:"web-research-analyst/agent-definition.json"},{code:"SAMPLE_MATRIX_MISMATCH",location:"web-research-analyst/agent-definition.json"}]` |
| duplicate role       | 把 `web-research-analyst.roleDefinitionId` 改为 `meeting_scribe`                                       | `[{code:"DUPLICATE_ROLE_DEFINITION_ID",location:"web-research-analyst/agent-definition.json"},{code:"SAMPLE_MATRIX_MISMATCH",location:"web-research-analyst/agent-definition.json"}]`  |

若平台不能创建 FIFO，`root entry invalid` case 必须 `it.skip`；focused suite 因出现 skipped case 而不再满足“exact 18 passed、0 skipped”，因此 T3 STOP。不得换成 socket/device 或改变预期。

### 4.7 新 Interface 的完整装配规则

`MEETING-AGENT-DEFINITION-INTERFACE.md` 不允许自由撰写。文件 title 固定为 `# Meeting Agent Definition Interface`，随后按 Document Rules 的七个 heading 排列，且每个 heading 只包含下列内容：

1. `Purpose`：逐字写入“本文定义 Convivium 拥有的 Meeting Agent Definition 配置契约。Definition 描述会议角色并引用 DSH 原生能力；它不是 DSH Agent Preset、Skill registry、Tool registry、MCP 配置、permission profile 或 AgentSession runtime。”
2. `Boundary And Ownership`：复制第 2.2 节链路；随后复制第 4.1 节 ownership table；不得增加其他 owner。
3. `Transport Or Invocation`：逐字写入“本次只有版本化文件样本，没有 Runtime transport。未来 Host-side resolver 从 Convivium configuration 读取 Definition，校验 DSH Preset 与 required Skills，并把 persona 和 optional toolFilter 传给 DSH 公开 child composition API。当前 DSH 0.1.1-rc.2 缺少 per-child preset selection，因此该调用链 blocked。”
4. `Data And State Contract`：原样复制第 4.1 节代码块中的全部三个 declarations 与空值规则，再原样复制第 4.2 节 document type、路径规则和第 4.3 节三个固定矩阵。
5. `Error And Permission Semantics`：逐字写入四个 bullet：`Definition/Preset/Skill 缺失：fail closed，不创建或激活 Participant。`、`toolFilter 只能收窄 DSH Preset 已有 Tools。`、`persona、Skill 名称和 evidence scope 不授予 capability 或 Meeting authority。`、`MCP、Sandbox、Approval、模型和凭据错误由 DSH preset/policy 边界处理，Convivium 不重新映射其内部错误。`
6. `Compatibility`：逐字写入“schemaVersion 固定为 1；definitionVersion 固定使用非空版本字符串，本次样本为 1.0.0。字段删除、改名或语义变化需要新的文档 schemaVersion；Definition 内容变化提升 definitionVersion。当前没有 runtime reader、持久化记录或 migration，因此不提供旧 Template manifest 的兼容读取。”
7. `Related Documents`：只列五个 bullet；label/target 固定为 `Architecture`/`../00-governance/ARCHITECTURE.md`、`Meeting Orchestration Requirements`/`../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`、`Meeting Agent Role Catalog Interface`/`./MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`、`Meeting Orchestration Design`/`../30-designs/MEETING-ORCHESTRATION-DESIGN.md`、`Current Implementation Coverage`/`../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`。

### 4.8 T2 文档去封装 edit manifest

T2 不写新方案。以下每个 numbered replacement 修改前 old text 必须 exact 命中一次；修改后 old text 必须零命中。`heading section` 表示从该 heading 起，到下一个相同 heading level 之前，不包含下一个 heading。

#### SQLite Repository Interface

在 `docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md` 按顺序执行：

1. 删除 token ` 与 \`agentTemplateSnapshot\``。
2. 删除完整字段行 `  agentTemplateSnapshot: MeetingAgentTemplateSnapshotV1`。
3. 把句子 `\`provider\` 是首次创建时解析的 continuable subagent provider name，与 Template \`modelPolicy.provider\` 的 LLM provider route 不是同一字段。`替换为`\`provider\` 是首次创建时解析的 continuable subagent provider name。`。
4. 从紧随其后的不可变字段句删除 token `、\`agentTemplateSnapshot\``。
5. 把以 `Runtime 可以在调用 \`startContinuable()\` 前` 开头的完整 paragraph 替换为：`Runtime 可以在调用 \`startContinuable()\` 前使用 caller-reserved \`sessionId\` 写入 \`provisioning\` ownership。DSH 接受首次 prompt 后，Runtime 把返回的 \`initialMessageId\` 写入同一 ownership 并将 lifecycle 前进为 \`active\`；\`initialMessageId\` 只允许从缺失变为一个稳定值，写入后不可修改。恢复只能通过 \`parentSessionId\`、DSH 持久 parent-child 关系、完整 label、当前 locator identity 和 SQLite identity 的共同证明操作 Session；目标目录迁移完成后 locator identity 还必须包含 Meeting 目录名。`
6. 在以 `当前 schema 至少包含` 开头的 paragraph 中，把 `、identity、\`agent_template_snapshot_json\` 和创建时间。JSON 字段必须带稳定对象结构，由上层 adapter 按 \`DSH-AGENT-TEMPLATE-INTERFACE.md\` 校验；不得保存 ROLE.md 正文、Skill 内容、MCP credential 或 Host 私有配置。`替换为`、identity 和创建时间。`。
7. Related Documents 中 target 为 `docs/20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md` 的 bullet，替换为 target `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`，可见文本同 target；其他 bullet 不变。

#### Convivium Implementation Design

在 `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md` 按顺序执行：

1. Related link 的 label/target 从 `DSH Agent Template Interface`/`../20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md` 替换为 `Meeting Agent Definition Interface`/`../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`。
2. 删除以 ``| `src/dsh/template-adapter.ts` `` 开头的完整 table row。
3. 把以 ``| `examples/agent-templates/*` `` 开头的 row 替换为：``| `examples/meeting-agent-definitions/*` | 不进入发布包的 Convivium Meeting Agent Definition 固定样本；不表示 DSH capability 已安装 |``。
4. 把以 ``| `scripts/verify-agent-template-samples.mjs` `` 开头的 row 替换为：``| `scripts/verify-agent-definition-samples.mjs` | 校验九个固定 Definition、文件集合和 AGENT.md hash |``。
5. 从 `createManager` 和 `createParticipant` 两行各删除 exact suffix ` & TemplateSnapshotInput`。
6. 从以 `` `MeetingSessionAdapter` 必须通过独立 `AgentTemplateAdapter` `` 开头的 paragraph 起，删除至以 `当前 DSH \`0.1.1-rc.2\` 中` 开头 paragraph 末尾；在原位置写入唯一 paragraph：`Meeting Agent Definition resolution 与 per-child DSH preset composition 尚未接线；在 DSH 提供公开且可验证的 per-child preset API 前，\`MeetingSessionAdapter\` 保持当前创建、followup、interrupt、drain 和 ownership 行为。`
7. Implementation Order 第 3 项只删除 token `AgentTemplateAdapter、`。
8. 删除 Acceptance 中以 `10. Template manifest` 开头的完整 list item；其后的 `10. 至少一种选定分发方式` 保持编号 10，不改其他 item。

#### Domain Model Design

在 `docs/30-designs/DOMAIN-MODEL-DESIGN.md` 按顺序执行：

1. 从 `MeetingParticipant` 字段句和 `MeetingManagerRuntime` 字段句各删除 token `templateProvenance、`。
2. 删除完整 `### AgentTemplateProvenance` heading section。
3. 在 `AttendanceRecommendation` 字段句和 `ParticipantAdmission` 字段句中，各把唯一 token `templateProvenance` 替换为 `agentDefinitionId`。
4. 把以 `- ArchivePackage 只保留 AgentTemplateProvenance` 开头的完整 bullet 替换为：`- ArchivePackage 可以保留 agentDefinitionId 作为非敏感 provenance，但不保存 persona 或 DSH capability 配置。`

#### Meeting Orchestration Design

在 `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md` 按顺序执行：

1. Related link 的 label/target 从 `DSH Agent Template`/`../20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md` 替换为 `Meeting Agent Definition`/`../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`。
2. 把 requirement mapping row `| DSH Agent Template | manifest、ROLE、Skill/Tool/MCP sets、permission、resume | 4.3、4.4、14、15 |` 替换为 `| Meeting Agent Definition | Convivium role configuration 与 DSH capability ownership boundary | 4.3、4.4、12.5 |`。
3. 从 `createMeetingAgentSession` pseudocode 删除完整字段行 `  templateSnapshot: MeetingAgentTemplateSnapshotV1`。
4. 把完整 `### 4.4 DSH Agent Template composition` heading section 替换为下列 exact block：

```markdown
### 4.4 Meeting Agent Definition boundary

Convivium 拥有 Meeting Agent Definition、会议身份、选择、批准和 Session ownership；DSH 拥有 Agent Preset、Skills、Tools、MCP、Sandbox、Approval、模型配置、capability composition 和 AgentSession runtime。Definition 只引用 `dshPresetId`、声明 `requiredSkillNames`、提供 persona，并可用 DSH 原生 `ToolRestriction` 收窄工具。

当前 DSH `0.1.1-rc.2` 的 continuable child 自动继承 parent preset，公开 request 不能选择不同 preset。因此 Definition resolution、Preset/Skill validation 和差异化 Session provisioning 尚未接线；本设计禁止用 Prompt-only、persona-only 或 Convivium 自建 installer 绕过该缺口。
```

5. 在 `### 12.5 Agent Catalog and attendance recommendation` section 内，把唯一 token `DSH template reference` 替换为 `agentDefinitionId`；该 section 其他文本不变。
6. 把以 `- versioned DSH Agent Template registry` 开头的完整 bullet 替换为：`- Meeting Agent Definition resolution、DSH per-child preset/Skill validation 和 fail-closed provisioning（blocked）；`
7. 把 Acceptance 第 10 项完整替换为：`10. Definition 存在不等于 DSH capability 已安装；在 per-child preset composition 可验证前不得接线或宣称完成。`

完成四个文件后运行 T2 禁止词搜索。若任一 old anchor/count 不符，或需要改变 Schema、Domain enum、event、error code 或 production code，STOP。

### 4.9 样本文件的确定性序列化

每个 `agent-definition.json` 使用 4 spaces indentation、LF、文件末尾一个 newline，key 顺序固定为：`schemaVersion`、`agentDefinitionId`、`definitionVersion`、`roleDefinitionId`、`displayName`、`summary`、`persona`（内部 `path`、`sha256`）、`dshPresetId`、`requiredSkillNames`、optional `toolFilter`、`expertiseTags`、`evidenceScopes`。值只来自第 4.3 节矩阵。

`plugin/examples/meeting-agent-definitions/README.md` 完整内容固定为 title `# Meeting Agent Definition Samples`，空行，然后以下三个 exact 段落，每段之间一个空行，文件末尾一个 newline：

1. `这些文件是 Convivium Meeting Agent Definition configuration 样本。`
2. `它们不是 DSH Agent Preset、Skill registry、Tool registry、MCP registry 或 policy registry，不进入插件发布包，也不证明 capability 已安装。`
3. `从 plugin 目录运行 \`pnpm verify:agent-definitions\`，校验九个固定 Definition、文件集合和 AGENT.md SHA-256。`

### 4.10 T5 生命周期目标代码

`plugin/src/index.ts#apply()` 在 capability guard 之后的注册顺序固定为：create runtime → `ctx.effect(() => () => runtime.dispose(), "convivium:runtime")` → loopback 时 `ctx.effect(() => registerLocalMeetingHttpRoutes(...), "convivium:local-routes")` → 调用 `registerCreateAndStatusTools` → 调用 `registerSubmitAndControlTools` → 按两个返回数组的原顺序逐个 `ctx.effect(() => disposer, "convivium:tool")`。不得保留 lifecycle array、aggregate disposer 或 conditional `typeof ctx.effect`；`Context.effect` 是已注入的必需 API。

`index-inject.spec.ts#host()` 的 fake effect 必须把每次 `setup()` 返回值 push 到 `effects`，fixture `dispose()` 使用 `[...effects].reverse()` 串行 `await`。两个 case 的完整计数固定为：loopback `effects.length===19`、route register/dispose 各 1、tool register 17；non-loopback `effects.length===18`、route register/dispose 各 0、tool register 17。每个 tool disposer 都是独立 `vi.fn()`，teardown 后逐个断言 1 次。

### 4.11 TODO 空面板与 readiness 的唯一结论

`TODO.md` 不是本 RUNBOOK 的修改目标。`## 当前任务项`、`## 待审阅任务项`、`## 待讨论项` 三个 heading 必须保留，且从每个 heading 结束到下一个同级 heading 或 EOF 之间不得出现 checklist item；全文件不得匹配 `^- \[[ xX]\] `。T0、T6、T7 任一检查发现 task item 即 STOP，不得迁移、改写或新增 TODO。

Readiness 只做三类机械更新：

1. FR-14 row exact 固定为：`| FR-14 Meeting Agent Definition 与 DSH composition boundary | 未实现 | MeetingAgentDefinitionV1 契约、9 个固定非发布样本、AGENT.md hash 和非法 fixture 验证已形成 | Definition resolution、DSH Preset/required Skill validation、per-child capability composition、真实差异化 AgentSession 和 cold resume 均未实现；DSH 0.1.1-rc.2 缺少 per-child preset selection |`。
2. 用以下三个 bullet exact 替换当前 Not Covered 中从 `Agent role catalog 当前未接入 Runtime` 开始的连续三个旧 bullet：`- Agent role catalog 当前未接入 Runtime；Manager recommendation、Captain disposition、admission、provisioning、status 和 UI 均未实现。`、`- 当前 startManagerSession()/startParticipantSession() 不读取 MeetingAgentDefinition；DSH 0.1.1-rc.2 缺少 per-child preset selection，因此 Definition resolution、Preset/required Skill validation 和差异化 capability composition 均未实现。`、`- 9 个 Definition 样本不进入 package，也未在真实 DSH profile 中解析或安装；静态字段和 hash 通过不构成 Agent capability 证据。`
3. Executed Validation 新增一段，句式固定为：`YYYY-MM-DD 在 BRANCH 未提交工作区执行 pnpm --dir plugin verify：Pass；N 个 test files、M tests 全部通过。执行 pnpm --dir plugin smoke:profile：Pass。profile 只证明既有插件加载与 baseline Meeting 路径，不证明 MeetingAgentDefinition 被解析、DSH Preset/Skill 已校验或差异化 capability 已运行。` 其中 `YYYY-MM-DD` 使用执行日期，`BRANCH` 使用 `git branch --show-current` 原始输出，`N/M` 使用 verify 原始输出；四个动态值之外不得改句式。不得改写历史 evidence。

## 5. 真相源、DSH 证据与判定规则

### 5.1 正式依据

- [Architecture](../00-governance/ARCHITECTURE.md)：Agent Session、frontend/backend、权限和 DSH 边界。
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-13、FR-14、BR-11。
- [Meeting Agent Role Catalog Interface](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md)：role、recommendation、Captain admission。
- [Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：现有协议边界；本次只改关联文档链接和未实现说明。
- [SQLite Repository Interface](../20-interfaces/SQLITE-REPOSITORY-INTERFACE.md)：本次不得改变 persistence contract。
- [Convivium Implementation Design](./CONVIVIUM-IMPLEMENTATION-DESIGN.md)、[Domain Model Design](./DOMAIN-MODEL-DESIGN.md)、[Meeting Orchestration Design](./MEETING-ORCHESTRATION-DESIGN.md)：模块与编排职责。
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：未实现状态、验证证据和后续边界。

### 5.2 DSH `0.1.1-rc.2` 公开证据

- `@deepseek-ai/dsh-subagent/lib/types/index.d.ts` 导出 `SubagentRuntime`，原生拥有 `getProvider`、`startContinuable`、`followup`、`interrupt`、`drainContinuableChildren`、`listChildren`、`listDescendants`。
- `@deepseek-ai/dsh-tools/lib/types/index.d.ts` 导出 `ToolRuntime`、`ToolRestriction`；`ToolRestriction` 只有 optional `allow`/`deny`，且 restrictions intersect、不能增加工具。
- `@deepseek-ai/dsh-subagent/lib/types/child-agent.d.ts` 的 `ChildComposition` 只有 `persona?` 和 `toolFilter?`；`applyChildComposition()` 先 `composeFrom(childCtx, parent.ctx)`，因此 child 继承 parent preset。
- `@deepseek-ai/dsh-subagent/lib/types/continuation.d.ts` 的 `ContinuableStartSpec.request` 当前没有 per-child `agentPresetId`。
- `@deepseek-ai/dsh-agent-presets` 原生拥有 Agent Preset 的 read/list/resolve/mount/composeFrom/recompose 语义；Convivium 不建立第二套 registry 或 installer。
- Cordis `4.0.1` 的 `Context.effect()`/`Fiber.effect()` 是 plugin 生命周期 owner，按注册逆序执行 disposer 且重复 dispose 为 no-op；DSH `register()` 返回 exact effect disposer。

如果安装依赖中的上述公开签名与本节不同，T0 必须 STOP，不得根据相近名字继续。

### 5.3 “删除还是保留”的机械判定

只使用以下规则，不作自由判断：

1. 若 Convivium interface 逐字重写一个 DSH service method，而不增加 Meeting authority、identity、transaction 或 fail-closed assertion，则删除 interface，改用 `Pick<NativeType, "method">`。
2. 若 Convivium 数据只把 DSH preset/skill/tool/policy 包装成新的 ref/set/registry/installer/version，则删除包装，保留原生名字或原生类型引用。
3. 若 Convivium 逻辑绑定 `meetingId`、`participantId`、Captain parent、ownership、attempt、capability、事务或 archive proof，则它是业务边界，必须保留。
4. 若 symbol 没有 production consumer 且本 RUNBOOK明确列在 S8，则删除；其他无 consumer symbol 不在本次范围。

## 6. 文件与 symbol 映射

### 6.1 必须新增

- `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
- `plugin/examples/meeting-agent-definitions/README.md`
- `plugin/examples/meeting-agent-definitions/*/agent-definition.json`（9 个）
- `plugin/examples/meeting-agent-definitions/*/AGENT.md`（9 个，由现有 `ROLE.md` 重命名）
- `plugin/scripts/verify-agent-definition-samples.mjs`
- `plugin/tests/unit/scripts/agent-definition-samples.spec.ts`

### 6.2 必须删除

- `docs/20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md`
- `plugin/examples/agent-templates/` 全目录（内容迁移后路径消失）
- `plugin/scripts/verify-agent-template-samples.mjs`
- `PluginDisposerRegistry`、`createPluginDisposerRegistry`
- `CaptainParentBinding`、`bindCaptainParent`
- S6 列出的 7 个 DSH shadow interfaces。

### 6.3 允许修改的既有文件闭集

- `docs/00-governance/ARCHITECTURE.md`
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`
- `docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md`
- `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`
- `docs/30-designs/DOMAIN-MODEL-DESIGN.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `plugin/package.json`
- `plugin/src/index.ts`
- `plugin/src/dsh/caller-resolver.ts`
- `plugin/src/dsh/index.ts`
- `plugin/src/dsh/session-adapter.ts`
- `plugin/src/runtime/meeting-runtime.ts`
- `plugin/src/runtime/application-service/index.ts`
- `plugin/src/runtime/application-service/meeting-control.ts`
- `plugin/src/runtime/services/meeting-archive-service.ts`
- `plugin/src/runtime/services/meeting-dispatch-service.ts`
- `plugin/src/runtime/services/meeting-recovery-service.ts`
- `plugin/src/runtime/services/meeting-session-service.ts`
- `plugin/src/tools/register-tools.ts`
- `plugin/src/tools/index.ts`
- `plugin/tests/unit/dsh/caller-resolver.spec.ts`
- `plugin/tests/unit/index-inject.spec.ts`

未列入上述闭集的 production 文件不得修改。

### 6.4 Scope 双向追踪

T7 只按下表判断 S1-S9 是否闭合，不得自行选择“对应”步骤或证据。任一行的执行步骤未 PASS，或验证项未满足，即该 Scope 未闭合：

| Scope | 正式依据或已确认工程依据                                       | 唯一执行步骤 | 唯一验证证据                                                    |
| ----- | -------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| S1    | Architecture Agent/DSH ownership；FR-14；第 4.1、4.7 节        | T1           | T1 新接口/旧接口存在性与禁止词命令                              |
| S2    | Architecture；FR-13、FR-14、BR-11；第 4.5、4.8 节              | T1、T2       | T1/T2 文档 focused `rg` 与禁止词命令                            |
| S3    | FR-13；Role Catalog Interface；第 4.1、4.5 节                  | T1           | T1 Role Catalog `agentDefinitionId` 与禁止词命令                |
| S4    | FR-14；Meeting Agent Definition Interface；第 4.2、4.3、4.9 节 | T3           | T3 CLI、目录/旧路径检查与禁止字段命令                           |
| S5    | 第 4.4、4.6 节固定验证契约                                     | T3           | T3 exact 18-case focused suite                                  |
| S6    | Architecture DSH ownership；第 5.2、5.3 节公开 API 证据        | T4           | T4 host typecheck、focused tests、shadow symbol 禁止词命令      |
| S7    | Architecture plugin backend boundary；Cordis `Context.effect`  | T5           | T5 index focused tests、host typecheck、lifecycle 禁止词命令    |
| S8    | 第 5.3 节无 production consumer 判定及 T5 修改前代码证据       | T5           | T5 caller/recovery focused tests 与 symbol 禁止词命令           |
| S9    | TODO Rules、Readiness；第 4.11 节                              | T0、T6       | TODO 空面板断言、T6 Phase A/Phase B 与 readiness exact evidence |

## 7. 不可违反的不变量

1. 每个 Meeting 身份仍对应独立 continuable AgentSession；不得共享 Session state。
2. Agent Definition、role、persona、expertise 或 evidence scope 都不产生 Meeting authority。
3. `toolFilter` 只能收窄，不能授予；真实工具执行仍由 DSH capability 与 Convivium caller authorization 共同约束。
4. Convivium 不拥有 DSH Preset、Skill、Tool、MCP、Sandbox、Approval 或模型配置 registry。
5. 当前 Session creation 行为保持不变；本次不读取 Agent Definition，也不声称差异化 capability 已实现。
6. Manager recommendation 不能自动 admission；Captain approval 也不能扩大 DSH preset 权限。
7. Plugin frontend 不能管理 Agent Session 或敏感能力。
8. 所有 existing protocol schemas、SQLite schemas/migrations、events 和 public error codes byte-for-byte 不变。
9. Cordis effect teardown 后，runtime、loopback route 和所有 Convivium tool registration 各释放一次；非 loopback 不注册 route。
10. 样本不进入 `package.json#files`，不是发布资产、Host registry 或 runtime readiness 证据。

## 8. 机械执行步骤

### T5：删除 Cordis 生命周期与无消费者包装

前置状态：T4 PASS。

允许修改：

- `plugin/src/index.ts`
- `plugin/src/dsh/caller-resolver.ts`
- `plugin/src/dsh/index.ts`
- `plugin/tests/unit/index-inject.spec.ts`
- `plugin/tests/unit/dsh/caller-resolver.spec.ts`

禁止修改：route 条件、runtime options、tool definitions、caller authorization、recovery 的 `rebindCaptainParent()`。

执行：

1. 删除 `PluginDisposerRegistry` 和 `createPluginDisposerRegistry()` 的完整声明。
2. 不改 provider assertion 和 capability guard；guard 的条件文本必须保持 byte-for-byte 不变。
3. 只按第 4.10 节固定顺序重写 guard 后的 lifecycle registration。
4. 只按第 4.10 节重写 `index-inject.spec.ts#host()` 和两个 lifecycle cases。
5. 删除 `CaptainParentBinding`、`bindCaptainParent()`、re-export 与其唯一单元测试。不得删除 runtime recovery service 中名称相近但语义不同的 `rebindCaptainParent()`。

验证：

```bash
set -e
pnpm --dir plugin exec vitest run tests/unit/index-inject.spec.ts tests/unit/dsh/caller-resolver.spec.ts tests/recovery/recovery.spec.ts tests/contract/tool-registration.spec.ts
pnpm --dir plugin typecheck:host
! rg -n "PluginDisposerRegistry|createPluginDisposerRegistry|CaptainParentBinding|\bbindCaptainParent\b" plugin/src plugin/tests
rg -q "rebindCaptainParent" plugin/src/runtime/services/meeting-recovery-service.ts
rg -q "rebindCaptainParent" plugin/tests/recovery/recovery.spec.ts
```

PASS：focused tests/typecheck 通过；删除项无命中；`rebindCaptainParent` 仍在 production 与 recovery test 中命中。

STOP：Cordis effect 不能保证每个 disposer exactly once，或必须改变 route/tool/runtime 行为才能通过测试。

### T6：更新 readiness 并完成全量验证

前置状态：T5 PASS。

允许修改：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`

禁止修改：新增实现范围、把未运行的 profile/Agent capability 写为通过。

执行：

1. 先执行第 4.11 节 Readiness 的 FR-14 row 与 Not Covered 更新；不得修改 `TODO.md`，不得新增 Executed Validation。
2. 只运行一次下列 Phase A 命令；不得在本步骤验证区重复运行。Profile 只证明既有插件加载与 baseline Meeting 路径，不证明 Agent Definition 被解析或不同 preset 已运行。

```bash
set -e
pnpm --dir plugin verify
pnpm --dir plugin smoke:profile
```

3. 两个 Phase A 命令都退出 0 后，才按第 4.11 节向 Executed Validation 新增一段，并从刚才 `verify` 的 terminal output 抄录实际 test files/tests；任一命令失败时不得写该段，立即 STOP。
4. 新增 evidence 后运行下列验证区 Phase B 命令。

验证：

```bash
set -e
git diff --check
pnpm --dir plugin exec prettier ../TODO.md ../docs/00-governance/ARCHITECTURE.md ../docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md ../docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md ../docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md ../docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md ../docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md ../docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md ../docs/30-designs/DOMAIN-MODEL-DESIGN.md ../docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md ../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md --check
node - <<'NODE'
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const runbook = "docs/30-designs/RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING.md";
const readiness = "docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md";
const forbidden = /agent template|agent-templates|DshAgentTemplate|MeetingAgentTemplate|AgentTemplateAdapter|TemplateSnapshotInput|agentTemplateSnapshot|agent_template_snapshot_json|templateProvenance|TEMPLATE_RESUME_FAILED|verify:agent-templates|Template registry|Template installer|templateRef|skillSetRefs|toolSetRefs|mcpSetRefs|permissionProfileRef|outputContractRef/i;
const tracked = execFileSync("git", ["ls-files", "--", "TODO.md", "docs", "plugin"], {
  encoding: "utf8",
});
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "TODO.md", "docs", "plugin"],
  { encoding: "utf8" },
);
const files = [...new Set(`${tracked}${untracked}`.trim().split("\n").filter(Boolean))]
  .filter((file) => file !== runbook && !file.startsWith("plugin/node_modules/"))
  .filter((file) => fs.existsSync(file) && fs.lstatSync(file).isFile());
const failures = [];
const todo = fs.readFileSync("TODO.md", "utf8");
for (const heading of ["## 当前任务项", "## 待审阅任务项", "## 待讨论项"]) {
  if (todo.split(heading).length !== 2) failures.push(`TODO.md: heading mismatch ${heading}`);
}
if (/^- \[[ xX]\] /m.test(todo)) failures.push("TODO.md: task item must not exist");
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  if (file === readiness) {
    const start = text.indexOf("## Executed Validation");
    const end = text.indexOf("## Not Covered", start);
    if (start < 0 || end < 0) {
      failures.push(`${file}: missing Executed Validation/Not Covered boundary`);
      continue;
    }
    text = text.slice(0, start) + text.slice(end);
  }
  const match = text.match(forbidden);
  if (match) failures.push(`${file}: ${match[0]}`);
}
if (failures.length > 0) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exit(1);
}
NODE
```

PASS：TODO 三个任务区域保持为空；Phase A 的完整 verify 全过且 terminal output 显示 exact 49 test files/385 tests（T0 baseline 48/368，加 T3 的 1 个 test file/18 tests，再减去 T5 删除的 `bindCaptainParent()` 唯一测试，即 `48 + 1 = 49`、`368 + 18 - 1 = 385`）；Phase A profile smoke 通过；Phase B `git diff --check` 和文档 Prettier check 通过；禁止词在 RUNBOOK 与 readiness 历史 `Executed Validation` 之外无命中；readiness 数字逐字等于 Phase A output。

STOP：任何验证失败；不得降低 49/385 门槛、删除第 4.6 节之外的测试、改写 readiness 历史 `Executed Validation` 或把 profile 失败标成 Not Covered。

### T7：审计、迁移证据并删除 RUNBOOK

前置状态：T6 PASS，readiness 已记录 exact command、日期、test count 和 profile 范围。

允许修改：

- 删除本 RUNBOOK

禁止修改：其他文件。

执行：

1. 下列 T0-T6 commit subject 必须各在当前分支历史中 exact 出现一次且顺序与列表一致；同时 T0-T6 章节必须已从当前 RUNBOOK 删除。任一条件不成立即 STOP，不在 T7 重新作语义判断：`Docs(repo/runbook): 记录 T0 基线验证通过`、`Docs(repo/agents): 收敛 Meeting Agent Definition 契约`、`Docs(repo/agents): 移除 DSH Template 二次建模`、`Feat(cross-project): 迁移 Meeting Agent Definition 样本验证`、`Refactor(cross-project): 改用 DSH 原生运行时类型`、`Refactor(cross-project): 删除 Cordis 与 caller 冗余封装`、`Docs(repo/readiness): 记录 Agent Definition 去封装验证`。其中 S1-S9 与不变量 1-10 的证据已由第 6.4 节唯一映射到这些提交，不在 T7 重新作语义判断。
2. 不再修改 readiness 数字或正文；在同一个 shell 中执行下述可恢复关闭脚本。脚本把 RUNBOOK 移到 `mktemp -d` 创建的精确临时目录，安装 EXIT trap；随后机械检查 TODO 空面板、readiness 固定结论与当日 evidence、当前口径禁止词、RUNBOOK 引用、旧/新路径、全部 Markdown 相对链接、`git diff --check` 和最终 status allowlist。任一检查失败时 trap 原样移回 RUNBOOK；全部通过时才删除临时备份。不得归档到 `docs/60-human/`。

关闭脚本：

```bash
set -eu
node - <<'NODE'
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const runbook = "docs/30-designs/RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING.md";
const expected = [
  "Docs(repo/runbook): 记录 T0 基线验证通过",
  "Docs(repo/agents): 收敛 Meeting Agent Definition 契约",
  "Docs(repo/agents): 移除 DSH Template 二次建模",
  "Feat(cross-project): 迁移 Meeting Agent Definition 样本验证",
  "Refactor(cross-project): 改用 DSH 原生运行时类型",
  "Refactor(cross-project): 删除 Cordis 与 caller 冗余封装",
  "Docs(repo/readiness): 记录 Agent Definition 去封装验证",
];
const actual = execFileSync("git", ["log", "--format=%s", "--reverse", "dbe1a80..HEAD"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((subject) => expected.includes(subject));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  process.stderr.write(`step commit subjects: ${JSON.stringify(actual)}\n`);
  process.exit(1);
}
const text = fs.readFileSync(runbook, "utf8");
for (let step = 0; step <= 6; step += 1) {
  if (text.includes(`### T${step}：`)) {
    process.stderr.write(`${runbook}: T${step} section not retired\n`);
    process.exit(1);
  }
}
NODE
runbook_path="docs/30-designs/RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING.md"
runbook_backup_dir="$(mktemp -d)"
runbook_backup_path="$runbook_backup_dir/$(basename "$runbook_path")"
mv "$runbook_path" "$runbook_backup_path"
restore_runbook() {
  if [ -f "$runbook_backup_path" ]; then
    mv "$runbook_backup_path" "$runbook_path"
  fi
  rmdir "$runbook_backup_dir"
}
trap restore_runbook EXIT
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const roots = ["README.md", "TODO.md", "docs", "plugin/examples"];
const files = [];
function walk(entry) {
  const stat = fs.lstatSync(entry);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(entry)) walk(path.join(entry, child));
  } else if (entry.endsWith(".md")) {
    files.push(entry);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1];
    const target = raw.split("#")[0].replace(/^<|>$/g, "");
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
      failures.push(`${file}: ${raw}`);
    }
  }
}
if (failures.length > 0) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exit(1);
}
NODE
node - <<'NODE'
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const runbookName = "RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING";
const readinessFile = "docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md";
const tracked = execFileSync("git", ["ls-files", "--", "TODO.md", "docs", "plugin"], {
  encoding: "utf8",
});
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "TODO.md", "docs", "plugin"],
  { encoding: "utf8" },
);
const files = [...new Set(`${tracked}${untracked}`.trim().split("\n").filter(Boolean))]
  .filter((file) => !file.startsWith("plugin/node_modules/"))
  .filter((file) => fs.existsSync(file) && fs.lstatSync(file).isFile());
const forbidden = /agent template|agent-templates|DshAgentTemplate|MeetingAgentTemplate|AgentTemplateAdapter|TemplateSnapshotInput|agentTemplateSnapshot|agent_template_snapshot_json|templateProvenance|TEMPLATE_RESUME_FAILED|verify:agent-templates|Template registry|Template installer|templateRef|skillSetRefs|toolSetRefs|mcpSetRefs|permissionProfileRef|outputContractRef/i;
const failures = [];
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  if (text.includes(runbookName)) failures.push(`${file}: stale RUNBOOK reference`);
  if (file === readinessFile) {
    const start = text.indexOf("## Executed Validation");
    const end = text.indexOf("## Not Covered", start);
    if (start < 0 || end < 0) {
      failures.push(`${file}: missing Executed Validation/Not Covered boundary`);
      continue;
    }
    text = text.slice(0, start) + text.slice(end);
  }
  const match = text.match(forbidden);
  if (match) failures.push(`${file}: ${match[0]}`);
}

const todo = fs.readFileSync("TODO.md", "utf8");
for (const heading of ["## 当前任务项", "## 待审阅任务项", "## 待讨论项"]) {
  if (todo.split(heading).length !== 2) failures.push(`TODO.md: heading mismatch ${heading}`);
}
if (/^- \[[ xX]\] /m.test(todo)) failures.push("TODO.md: task item must not exist");

const readiness = fs.readFileSync(readinessFile, "utf8");
const requiredReadiness = [
  `| FR-14 Meeting Agent Definition 与 DSH composition boundary | 未实现 | MeetingAgentDefinitionV1 契约、9 个固定非发布样本、AGENT.md hash 和非法 fixture 验证已形成 | Definition resolution、DSH Preset/required Skill validation、per-child capability composition、真实差异化 AgentSession 和 cold resume 均未实现；DSH 0.1.1-rc.2 缺少 per-child preset selection |`,
  `- Agent role catalog 当前未接入 Runtime；Manager recommendation、Captain disposition、admission、provisioning、status 和 UI 均未实现。`,
  `- 当前 startManagerSession()/startParticipantSession() 不读取 MeetingAgentDefinition；DSH 0.1.1-rc.2 缺少 per-child preset selection，因此 Definition resolution、Preset/required Skill validation 和差异化 capability composition 均未实现。`,
  `- 9 个 Definition 样本不进入 package，也未在真实 DSH profile 中解析或安装；静态字段和 hash 通过不构成 Agent capability 证据。`,
];
for (const required of requiredReadiness) {
  if (!readiness.includes(required)) failures.push(`${readinessFile}: missing fixed conclusion`);
}
const date = execFileSync("date", ["+%F"], { encoding: "utf8" }).trim();
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
const evidence = `${date} 在 ${branch} 未提交工作区执行 pnpm --dir plugin verify：Pass；49 个 test files、385 tests 全部通过。执行 pnpm --dir plugin smoke:profile：Pass。profile 只证明既有插件加载与 baseline Meeting 路径，不证明 MeetingAgentDefinition 被解析、DSH Preset/Skill 已校验或差异化 capability 已运行。`;
if (!readiness.includes(evidence)) failures.push(`${readinessFile}: missing exact current evidence`);

for (const oldPath of [
  "docs/20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md",
  "plugin/examples/agent-templates",
  "plugin/scripts/verify-agent-template-samples.mjs",
]) {
  if (fs.existsSync(oldPath)) failures.push(`${oldPath}: old path still exists`);
}
for (const newPath of [
  "docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md",
  "docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md",
  "plugin/examples/meeting-agent-definitions/README.md",
  "plugin/scripts/verify-agent-definition-samples.mjs",
  "plugin/tests/unit/scripts/agent-definition-samples.spec.ts",
]) {
  if (!fs.existsSync(newPath)) failures.push(`${newPath}: required path missing`);
}
if (failures.length > 0) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exit(1);
}
NODE
git diff --check
node - <<'NODE'
const { execFileSync } = require("node:child_process");
const allowed = new Set([
  "docs/00-governance/ARCHITECTURE.md",
  "docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md",
  "docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md",
  "docs/20-interfaces/DSH-AGENT-TEMPLATE-INTERFACE.md",
  "docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md",
  "docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md",
  "docs/20-interfaces/SQLITE-REPOSITORY-INTERFACE.md",
  "docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md",
  "docs/30-designs/DOMAIN-MODEL-DESIGN.md",
  "docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md",
  "docs/30-designs/RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING.md",
  "docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md",
  "plugin/package.json",
  "plugin/scripts/verify-agent-template-samples.mjs",
  "plugin/scripts/verify-agent-definition-samples.mjs",
  "plugin/src/dsh/caller-resolver.ts",
  "plugin/src/dsh/index.ts",
  "plugin/src/dsh/session-adapter.ts",
  "plugin/src/index.ts",
  "plugin/src/runtime/application-service/index.ts",
  "plugin/src/runtime/application-service/meeting-control.ts",
  "plugin/src/runtime/meeting-runtime.ts",
  "plugin/src/runtime/services/meeting-archive-service.ts",
  "plugin/src/runtime/services/meeting-dispatch-service.ts",
  "plugin/src/runtime/services/meeting-recovery-service.ts",
  "plugin/src/runtime/services/meeting-session-service.ts",
  "plugin/src/tools/index.ts",
  "plugin/src/tools/register-tools.ts",
  "plugin/tests/unit/dsh/caller-resolver.spec.ts",
  "plugin/tests/unit/index-inject.spec.ts",
  "plugin/tests/unit/scripts/agent-definition-samples.spec.ts",
]);
const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD", "--"], {
  encoding: "utf8",
});
const untrackedChanges = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard"],
  { encoding: "utf8" },
);
const changedPaths = [...new Set(`${trackedChanges}${untrackedChanges}`.split("\n"))]
  .filter(Boolean)
  .sort();
const invalid = changedPaths.filter((changedPath) => {
  return (
    !allowed.has(changedPath) &&
    !changedPath.startsWith("plugin/examples/agent-templates/") &&
    !changedPath.startsWith("plugin/examples/meeting-agent-definitions/")
  );
});
if (invalid.length > 0) {
  process.stderr.write(invalid.join("\n") + "\n");
  process.exit(1);
}
NODE
rm "$runbook_backup_path"
rmdir "$runbook_backup_dir"
trap - EXIT
```

验证：

```bash
set -e
! rg -n "RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING" . --glob '!.git/**'
test ! -e docs/30-designs/RUNBOOK-MEETING-AGENT-DEFINITIONS-AND-DSH-DEWRAPPING.md
git diff --check
```

PASS：关闭脚本退出码为 0；RUNBOOK 文件和引用均不存在；删除后 Markdown 链接、diff check 和 status allowlist 全部通过；临时备份目录已删除。

收口提交：验证 PASS 后，按第 1.5 节暂存 RUNBOOK 删除，使用固定 subject `Docs(repo/runbook): 完成 Agent Definition 去封装执行` 提交，并确认工作树为空。

STOP：历史 subject/章节退休断言、关闭脚本、删除后验证、commit 或提交后空工作树检查中的任一命令非零退出；报告该命令和原始输出，不修改 allowlist、expected text 或检查脚本后重试。

## 9. 验证矩阵

| 风险                  | 验证                                                   | 预期                                                            |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Definition 正常样本   | CLI + unit valid fixture                               | 9 个角色全部通过且 exact PASS                                   |
| closed schema         | top-level/persona unknown field fixtures               | 返回 `DEFINITION_FIELD_SET_MISMATCH`                            |
| Persona 完整性        | path、grammar、declared/content hash、symlink fixtures | 返回对应固定 code，不读取 symlink 目标                          |
| ID/role 唯一性        | duplicate ID/role fixtures                             | 返回两个固定 duplicate codes，无部分成功                        |
| Skill/metadata 输入   | Skill 或 evidence matrix mismatch fixture              | 返回 `SAMPLE_MATRIX_MISMATCH`                                   |
| Tool restriction      | tool filter matrix mismatch fixture                    | 返回 `SAMPLE_MATRIX_MISMATCH`；固定合法 shape 通过              |
| DSH capability        | 原生 `Pick` typecheck                                  | 不存在手写 service method signature                             |
| Meeting authorization | 既有 session adapter/caller/tool tests                 | 所有 ownership 与 caller 断言不变                               |
| Lifecycle             | index inject focused tests                             | runtime/route/17 tools exactly-once teardown                    |
| Recovery              | recovery focused tests                                 | `rebindCaptainParent()` 与 archive/recovery 不变                |
| Protocol/SQLite       | full verify + 禁止修改范围审计                         | Schema、migration、events、errors 无变化                        |
| Package boundary      | `verify:package`                                       | samples 未发布，files allowlist 仍 closed                       |
| 真实 DSH              | `smoke:profile`                                        | 既有 profile baseline 通过；Definition runtime 明确 Not Covered |
| 完整回归              | `pnpm --dir plugin verify`                             | exact 49 files、385 tests，全通过                               |

以下类别 `Not Applicable`：stale version、terminal immutability、idempotency conflict、transaction rollback、outbox atomicity、restart Definition reconstruction。原因是本 RUNBOOK 不新增任何 runtime command、state、event、repository 或 persistence path；若执行中出现上述路径，已经越过 Non-goals，必须 STOP。

## 10. 完成定义与未实现边界

只有同时满足以下条件才算完成：

- S1-S9 全部实现并通过对应 focused validation；
- 第 7 节全部不变量经测试或 diff 审计保持；
- full verify 与 profile smoke 通过，readiness 记录 exact evidence；
- 当前口径中除本 RUNBOOK 外不存在 `DshAgentTemplate`、`Agent Template`、旧目录/脚本或自建 DSH resource-set wrapper；readiness 的历史 `Executed Validation` 可保留当时实际命令/名称，不作为当前口径命中；
- TODO 三个任务区域保持为空；requirements/readiness 明确保留 per-child preset composition blocker、FR-13 runtime、Scribe runtime 和真实差异化 Agent 验证边界；
- 没有把“定义存在”描述成“Agent capability 已安装”或“自动创建差异化 Agent 已实现”；
- 本 RUNBOOK 已按 T7 删除。

本次结束后仍然未实现的关键链路是：

```text
MeetingAgentDefinition.dshPresetId
  -> DSH public per-child preset selection/composition
  -> requiredSkillNames validation
  -> independent continuable AgentSession with differentiated capability
```

在 DSH 提供公开且可验证的 per-child preset composition API 前，该链路保持 blocked。后续不得恢复 `DshAgentTemplateManifestV1`、Template installer 或 Prompt-only workaround。
