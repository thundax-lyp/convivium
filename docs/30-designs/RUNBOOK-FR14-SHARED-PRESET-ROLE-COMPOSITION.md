# RUNBOOK FR14 Shared Preset Role Composition

## Status And Boundary

- 建立日期：2026-09-07。
- 模式：Author / Audit；本轮只形成正式文档和实施说明，不执行产品实现。
- 文档分支：`codex/fr14-role-composition-runbook`；代码调查基线：`b4bed41634d4600e460040b1b93895b42c9671ac`。
- 实施边界：同一分支工作区，必须先通过 T0。不同 worktree 上 one/two/three 的未合并修改不属于本文基线。
- 用户确认：本任务已确认首版共享父 Preset、创建前配置切面、独立模块、低耦合；独立 per-child Preset 不纳入 Convivium 后续版本实施计划，等待 DSH 升级后再评估接入。
- 审计状态：Executable（2026-09-07 Author/Audit；仅表示执行说明决策完备，不表示产品实现或验证完成）。

## Executor Contract

严格 T0→T8 顺序执行，只修改本步骤文件。新增文件必须采用指定路径与签名；不 commit/push/创建 PR/merge，除非收到对应授权。PASS 是指定命令退出 0 且全部断言满足；任何断言、依赖、路径或基线不一致均 STOP。禁止改断言、跳测试、用 any/强制类型转换绕过、私自扩大范围或修改 DSH 源码。格式修正仅限当前步骤允许文件。

STOP 报告：最后 PASS、步骤/触发条件、文件和 symbol、最小命令、实际输出、继续需要补齐的决定。保留现有工作区，不回滚用户修改。代码测试失败无外部状态需要恢复；smoke 不论成功失败都必须完成 Prepare/Execute/Assert/Restore。不得把未完成项写成已实现。

## Goal And Current Breakpoints

起点：样本验证器存在，Config 无 runtime Definition，Session adapter 只传 parent/prompt，ownership 无 Definition provenance。终点：Captain 显式选择定义，创建前校验共享 Preset/Skills，一次创建独立 Manager/Participant，真实工具限制生效，冷恢复仍保留 persona/filter，FR-14 首版有完成证据。

| 当前断点 | 代码证据 | 固定解决点 |
| --- | --- | --- |
| 没有 runtime 配置入口 | `plugin/src/config.ts::Config` | 内联 agentDefinitions，T1 |
| 创建请求没有选择 ID | `plugin/src/protocol/types.ts::CreateMeetingInputV1/ParticipantSpecV1` | optional ID，T2 |
| 创建参数未传角色配置 | `plugin/src/dsh/session-adapter.ts::startManagerSession/startParticipantSession` | 只增加 persona/toolFilter，T3 |
| ownership 未记录 provenance | `plugin/src/repository/types.ts::SessionOwnership` | optional 三字段绑定，T4 |
| 创建没有批量预检 | `plugin/src/runtime/meeting-runtime.ts::createMeetingRuntime` | 第一个 child 前解析所有选择，T5 |
| fake adapter 测试不能证明真实工具和冷恢复 | `plugin/tests/integration/dsh/session-adapter.spec.ts` | T6 本地组合、T7 真实双进程 smoke |

## Scope And Non-goals

Scope：内联定义；Manager/初始 Participant 显式选择；共享父 Preset/模型可调用 Skill 校验；创建参数；不可变 provenance；失败清理、重放、冷恢复；真实 DSH 组合；readiness 收口。

Non-goals：独立 Preset、安装能力、独占 Skill 集合、per-role 模型参数、热切换、通用 hook/event bus、另一个 package、目录扫描、UI、Catalog producer、FR-13 动态接纳、one/two/three 功能、升级 DSH。不得修改会议调度/发言/决策/风险 transitions、Client、JSONL backend 或 DSH 生命周期算法。

## Sources And Traceability

- [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-14.1–11、验收 35–40。
- [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)：Transport、Runtime Provenance And Failure 为完整数据和失败真相源。
- [Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：Initial Role Definition Selection。
- [Role Composition Design](ROLE-COMPOSITION-DESIGN.md)：模块职责、低耦合依赖。
- [Architecture](../00-governance/ARCHITECTURE.md)：不修改 Session 数据、不扩张能力。
- [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：FR-14 当前未实现，不提前提升。
- [Smoke Operations](../50-operations/HOW-TO-DSH-SMOKE.md)：独立 profile 和资源清理。
- [RUNBOOK Rules](../00-governance/RUNBOOK-RULES.md)、[TODO Rules](../00-governance/TODO-RULES.md)。

| Scope / 依据 | 接口/实现 | 聚焦验证 | 全量/证据 |
| --- | --- | --- | --- |
| 配置、版本、权限 FR-14.1–5 | model/resolve/dsh-capabilities | T1/T3 | T8 verify/evidence |
| 初始身份选择 FR-14.9 | CreateMeetingInputSchema、createMeetingRuntime | T2/T5/T6 | T7/T8 |
| provenance/重放 FR-14.10 | SessionOwnership、recordSessionOwnership | T4/T6 | T8 |
| 隔离、恢复验收39 | adapter、DSH descriptor | T3/T6/T7 | T8 |
| 整体失败验收38 | resolver、既有 bootstrap/cleanup | T5/T6 | T8 |

## Exact Target Structures And Symbols

新增 `plugin/src/role-composition/model.ts`：导出 `MeetingAgentDefinitionV1`、`AgentDefinitionBindingV1`，字段与 Definition Interface 完全一致；枚举复用该文档九 role、四 evidenceScope，不添加 role；`parseAgentDefinitions(value: unknown): readonly MeetingAgentDefinitionV1[]` 将 undefined 解析为冻结空数组，其他值严格执行接口的字段/长度/重复/16 KiB限制。允许引用 DSH ToolRestriction 类型，不引用 runtime/repository/domain/client。

新增 `plugin/src/role-composition/resolve.ts`：

```ts
interface ResolvedRoleComposition {
  readonly persona: string;
  readonly toolFilter?: ToolRestriction;
  readonly agentDefinition: AgentDefinitionBindingV1;
}
interface ResolveMeetingRolesInput {
  readonly definitions: readonly MeetingAgentDefinitionV1[];
  readonly managerAgentDefinitionId?: string;
  readonly participants: readonly {
    readonly participantKey: string;
    readonly agentDefinitionId?: string;
  }[];
}
interface ResolvedMeetingRoles {
  readonly manager?: ResolvedRoleComposition;
  readonly participants: Readonly<Record<string, ResolvedRoleComposition>>;
}
function resolveMeetingRoles(
  input: ResolveMeetingRolesInput,
  validate: (selected: readonly MeetingAgentDefinitionV1[]) => Promise<void>
): Promise<ResolvedMeetingRoles>;
class RoleCompositionError extends Error {
  readonly code = "UNSUPPORTED_CAPABILITY";
}
```

上述接口/函数/class 均导出；RoleCompositionError message 固定为接口中的安全消息。没有选择时直接返回冻结空结果且不调用 validate；有选择时先完成全部 ID/角色匹配，再单次 await validate。participants 输出按 `participantKey` 索引，使用无原型对象并冻结；不从 displayName/sourceMemberName/role 推导定义。创建函数按输入 participantKey 取对应组合，不从排序或数组位置推断。

指纹只在 resolve.ts 私有 `definitionHash(definition: MeetingAgentDefinitionV1): string` 实现，使用 node:crypto；按接口固定序列化顺序生成，不引用 repository canonical-json，避免反向依赖。不排序数组、不修剪输入后改变语义。RoleCompositionError 可在匹配与 DSH 校验失败时使用；AbortSignal aborted 则继续抛出原取消原因。

新增 `plugin/src/role-composition/dsh-capabilities.ts`：

```ts
async function validateSharedRoleCapabilities(
  parent: Agent,
  definitions: readonly MeetingAgentDefinitionV1[],
  signal: AbortSignal
): Promise<void>;
```

空列表立即返回。type-only 导入 `@deepseek-ai/dsh-agent-presets` 和 `@deepseek-ai/dsh-skill` 以引入 Context declaration merge；使用 parent.ctx.get("agentPresets")/get("skills")，两者缺失拒绝。composedPreset(parent.ctx) 必须非空且等于每个定义 dshPresetId。对去重后的 requiredSkillNames 逐个 await skills.get(name,{scope:parent,cwd:parent.session.header.cwd,signal})；结果存在、invocation.modelInvocable=true、content.trim() 非空才通过。调用前后检查 signal 和 parent Preset 一致。未知 Tool 名由 DSH restrict/start 校验，不能隐藏错误或扩大工具；任一 child start 失败执行既有整体清理。

Config.agentDefinitions 可选，Schema.transform 调用 parseAgentDefinitions；public create 只加 `managerAgentDefinitionId?: string` 和 ParticipantSpecV1.agentDefinitionId?: string。没有新增 endpoint/tool/result 字段；非空字符串在 Schema 与 runtime resolver 都受约束，绕过工具直接调用 runtime 也必须拒绝非法选择。

SessionOwnership 与 SessionOwnershipInput 新增 `agentDefinition?: AgentDefinitionBindingV1`。在 schemas.ts 新增导出 AgentDefinitionBindingSchema，Zod ownership schema 引用它对绑定三字段 strict，ID/version 非空，hash 匹配 `/^[a-f0-9]{64}$/`。既有旧记录缺失可读；新增写入由 repository 在写入前调用 AgentDefinitionBindingSchema.safeParse 验证；失败抛 RepositoryError("INVALID_INPUT", false, meetingId, "Invalid agent definition binding")，不能只依赖 reload 校验。recordSessionOwnership 对既存值要求三字段逐一相等，包含“省略↔存在”禁止转换；其他 lifecycle 更新必须携带已有绑定。数据仍走当前 creation record / commit patch / checkpoint，无新 table、formatVersion、event/receipt/outbox。旧二进制读取新 optional 字段不承诺兼容；新实现读取旧记录必须通过。

StartManagerSessionInput/StartParticipantSessionInput 只加 `composition?: {readonly persona: string; readonly toolFilter?: ToolRestriction}`，request 按字段透传；不传 agentDefinition 或 config，不在 adapter 内解析角色。MeetingCreationRuntimeDependencies 与 CreateStatusRuntimeOptions 增加 `agentDefinitions?: readonly MeetingAgentDefinitionV1[]`，从 Config→index→runtime options→create application→creation runtime 传递；输入配置建立冻结副本，不存全局可变 registry。resolveMeetingRoles 在任何 await 前以 parseAgentDefinitions 对传入 definitions 建立校验副本，即使直接 runtime 调用也不借用调用方可变数据；格式异常转换为 RoleCompositionError。

## Call Chain And Invariants

Captain create 工具 → 原 caller/schema/continuation/replay 检查 → createMeetingRuntime → repository.create → try 内 resolveMeetingRoles + validateSharedRoleCapabilities → 原 manager provisioning ownership → startManagerSession → active ownership → 原逐 Participant 相同流程 → completeCreate → 原首次 planning/turn。

createMeetingRuntime 的 protected try 必须覆盖 resolver；预检在 allocateSessionId/recordSessionOwnership/start 第一次调用之前。错误到既有 creation_failed/cleanup，再映射 UNSUPPORTED_CAPABILITY；不能出现 ready Meeting。create application ready replay 分支不得移动到 resolver 后。原 requestHash=JSON.stringify(input)，不加入当前 config；同 requestId 不同选择构成原有 IDEMPOTENCY_CONFLICT。再次创建失败的已有 ownership 时，绑定变更必须拒绝，不能偷偷升级定义。

新的 binding 从 resolved 结果写入 provisioning 和 active 两次 ownership；使用原 Session ID、parent ID、provider、now 和 lifecycle authority。后续 cleanup spread 保留 binding；归档 ownership 保留，公开 projection 不新增字段。没有新业务状态版本或客户端状态。后续 followup、interrupt、drain、cold rebind 原封不动；DSH descriptor 拥有 persona/filter，不监听 Session event 或修改持久 header。

- 创建时最多解析一次选定集合；先预检全部，不能边创建边读取定义。
- persona 不能授予 Skill，Skill 名称不能扩大工具权限。
- 已有会议与其他身份不被新配置改变；父 scope 不得 restrict。
- 校验缺失不降级；未选定义不是缺失错误。
- 不保证跨 Host Preset/Skill 部署变更的历史能力快照。

## Mechanical Steps

TODO 映射：RC-01–RC-08 分别对应 T1–T8；T0 为 RC-01 的前置门禁，不单独登记实施项。TODO 只记录文件范围、动作与验收，完整命令和 PASS/STOP 以本文为准；制定清单不构成开始产品实现的委派。

所有命令从仓库根目录运行。每个代码步骤结束，对其列出的新增/修改 TS 文件执行 `pnpm --dir plugin exec prettier <该步骤文件在plugin内的相对路径> --write`；为避免占位符，该格式动作由执行者逐一对本步骤固定文件列表去除 `plugin/` 前缀执行，不得使用目录通配符。下列验证命令无占位符。

### T0：冻结执行基线

前置状态：文档已由用户确认；开始实施前读取本文及正式依据。
允许修改：

- `docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md`（新建）

禁止修改：所有产品文件。

执行：
1. 运行基线命令；工作区只允许本次文档集（文末 Author Audit 列表）的修改，任何产品代码或其他文档改动 STOP。
2. 核对 node_modules dsh-subagent 的版本为 0.1.1-rc.2，类型具有 request.persona/toolFilter；本次不升级。基线 verify 通过后记录 commit、环境与时间。

验证：

```bash
git status --short
git branch --show-current
node -p "require('./plugin/node_modules/@deepseek-ai/dsh-subagent/package.json').version"
pnpm --dir plugin verify
```

PASS：分支为 codex/fr14-role-composition-runbook；版本准确；verify 全绿。
STOP：基线有额外代码修改、分支不符、版本变化或 verify 失败；报告实际输出，不修复相邻功能。

### T1：建立独立定义配置与解析模块

前置状态：T0 PASS。
允许修改：

- `plugin/src/role-composition/model.ts`（新建）
- `plugin/src/role-composition/resolve.ts`（新建）
- `plugin/src/config.ts`
- `plugin/tests/unit/role-composition/resolve.spec.ts`（新建）
- `plugin/tests/unit/config.spec.ts`

禁止修改：DSH 调用、Session 创建、UI 与 repository。

执行：
1. 按 Exact Target Structures 创建两个新模块；parseAgentDefinitions 与 resolveMeetingRoles 实现严格校验、选择、深拷贝冻结和确定性指纹。
2. Config 增加唯一配置项 agentDefinitions；既有配置不必新增字段。角色数据由本地内联配置提供，不读取 examples。
3. 新增测试：两角色解析、未选择零 validate、未知/空 ID、Manager/Participant 错配、重复 ID、非法数组/多余字段/null、16 KiB边界、hash稳定及配置输入修改不影响结果。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/role-composition/resolve.spec.ts tests/unit/config.spec.ts
pnpm --dir plugin typecheck
```

PASS：全部断言通过，模块没有 runtime/repository/domain/client import。
STOP：为通过校验需放松契约、增加文件加载或全局 registry。

### T2：开放显式 Definition ID 选择

前置状态：T1 PASS。
允许修改：

- `plugin/src/protocol/types.ts`
- `plugin/src/protocol/commands.ts`
- `plugin/tests/unit/protocol/role-selection.spec.ts`（新建）

禁止修改：新增工具、HTTP/Client、Catalog claim 和 create result。

执行：
1. 给 CreateMeetingInputV1、ParticipantSpecV1 和 createMeetingInputSchema/participantSpec 加约定 optional 字段。
2. 新测试验证旧请求原样解析、显式 ID 保留、空白/null/非字符串拒绝、序列化包含选定 ID，不同 ID 不产生相同 request serialization。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/protocol/role-selection.spec.ts tests/unit/protocol/request-idempotency.spec.ts
pnpm --dir plugin typecheck
```

PASS：旧请求不被补默认 ID；新字段严格校验；结果 DTO 不变。
STOP：需要修改现有无关请求规范或生成工具副本。

### T3：校验 DSH 能力并透传创建配置

前置状态：T2 PASS。
允许修改：

- `plugin/src/role-composition/dsh-capabilities.ts`（新建）
- `plugin/src/dsh/session-adapter.ts`
- `plugin/package.json`
- `plugin/pnpm-lock.yaml`
- `plugin/tests/unit/role-composition/dsh-capabilities.spec.ts`（新建）
- `plugin/tests/unit/dsh/session-adapter.spec.ts`

禁止修改：DSH 源码、followup/interrupt/drain、preset mount/recompose。

执行：
1. 实现 validateSharedRoleCapabilities，使用准确 parent scope；失败固定安全错误。
2. 两个 start input 只增加 composition 参数，将 persona/filter 传到 request；未配置时保持原 request 对象语义。
3. package peerDependencies 增加 @deepseek-ai/dsh-agent-presets、@deepseek-ai/dsh-skill，范围 ^0.1.1-rc.2；peerDependenciesMeta 均 optional:true；devDependencies 固定 0.1.1-rc.2。执行 pnpm --dir plugin install --lockfile-only；锁文件只允许这两项及所需传递关系，不升级既有 resolved version。
4. 测试缺服务、Preset 不同、Skill 缺失/不可模型调用/空正文/抛错/abort、校验中 Preset 变更；adapter 两个独立请求不共享可变 filter，不向父 scope 安装限制。

验证：

```bash
pnpm --dir plugin install --frozen-lockfile
pnpm --dir plugin exec vitest run tests/unit/role-composition/dsh-capabilities.spec.ts tests/unit/dsh/session-adapter.spec.ts
pnpm --dir plugin typecheck
```

PASS：调用scope=parent且cwd准确；参数与冻结配置一致；依赖仍是 rc.2。
STOP：API 与签名不符、需要引入 provider、升级 DSH 或锁文件出现无关升级。

### T4：持久化不可变 Definition provenance

前置状态：T3 PASS。
允许修改：

- `plugin/src/repository/types.ts`
- `plugin/src/repository/domain/schemas.ts`
- `plugin/src/repository/domain/domain-meeting-repository.ts`
- `plugin/src/dsh/caller-resolver.ts`
- `plugin/tests/unit/repository/domain/schemas.spec.ts`
- `plugin/tests/contract/domain-meeting-repository.spec.ts`

禁止修改：新 table、格式迁移、领域状态/事件、公开 status/archive。

执行：
1. 给两个 ownership 类型以及 MeetingOwnershipRecord 增加同一 optional Binding 类型；schema 与写入校验按 Exact Target Structures。
2. recordSessionOwnership 创建接受合法绑定，既存身份禁止变更/删除/后补绑定；读取、checkpoint、cleanup保留；不改变原 lifecycle 规则。
3. 测试旧无字段记录、合法保存重开、非法 hash/多字段/部分字段拒绝、active→closed保留、创建后更改绑定失败无半提交；复用存储故障注入验证 failed put 后原值不变。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/repository/domain/schemas.spec.ts tests/contract/domain-meeting-repository.spec.ts
pnpm --dir plugin typecheck
```

PASS：绑定稳定跨 checkpoint/reopen；非法写入不改变读值与 commit 序列。
STOP：需要迁移旧数据、修改 backend 或放宽 schema。

### T5：将角色切面接入创建阶段

前置状态：T4 PASS。
允许修改：

- `plugin/src/index.ts`
- `plugin/src/runtime/application-service/types.ts`
- `plugin/src/runtime/application-service/create-meeting.ts`
- `plugin/src/runtime/meeting-runtime.ts`
- `plugin/tests/unit/runtime/meeting-runtime.spec.ts`
- `plugin/tests/unit/index-inject.spec.ts`

禁止修改：会议调度、动态接纳、decision/risk/Scribe、恢复服务算法和 UI。

执行：
1. 按 Call Chain 传递冻结 definitions；createMeetingRuntime 在 try 内、第一个 child 分配前调用 resolver，validate callback 只调用 validateSharedRoleCapabilities。
2. manager和每个Participant从解析结果取 composition；两次ownership持久化同一binding。
3. create application 对 RoleCompositionError 固定映射 UNSUPPORTED_CAPABILITY/retryable=false/安全message；不要将error正文String(error)暴露配置。ready重放分支保持前置。
4. 测试未选择旧路径、两个不同角色注入、最后一个定义校验失败时start调用数为0、第二个child失败时全部已分配身份被原cleanup撤销，未发布ready。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/runtime/meeting-runtime.spec.ts tests/unit/index-inject.spec.ts
pnpm --dir plugin typecheck
```

PASS：预检先于所有 Session 副作用，旧路径通过；无新生命周期所有者。
STOP：发现必须改变调度/恢复语义或额外捕获未规定错误。

### T6：验证完整创建与重放边界

前置状态：T5 PASS。
允许修改：

- `plugin/tests/contract/meeting-runtime.spec.ts`
- `plugin/tests/integration/dsh/session-adapter.spec.ts`
- `plugin/tests/fixtures/role-composition.ts`（新建）

禁止修改：产品代码与测试绕过，失败只能返回对应前序步骤允许范围修复后重跑。

执行：
1. 新增 `plugin/tests/fixtures/role-composition.ts`，唯一导出 `roleCompositionDefinitions: readonly MeetingAgentDefinitionV1[]`，按 Manager、Participant 顺序包含以下两个完整对象；类型通过 type import 从 src/role-composition/model.ts 引入。测试需要修改配置时复制对象，不修改共享 fixture。

```ts
export const roleCompositionDefinitions: readonly MeetingAgentDefinitionV1[] = [
  {
    agentDefinitionId: "fr14-manager",
    definitionVersion: "1.0.0",
    roleDefinitionId: "meeting_manager",
    displayName: "fr14-manager",
    summary: "fr14-manager",
    persona: "FR14_MANAGER_V1",
    dshPresetId: "minimal",
    requiredSkillNames: ["fr14-fixture"],
    expertiseTags: ["fixture"],
    evidenceScopes: []
  },
  {
    agentDefinitionId: "fr14-participant",
    definitionVersion: "1.0.0",
    roleDefinitionId: "domain_architect",
    displayName: "fr14-participant",
    summary: "fr14-participant",
    persona: "FR14_PARTICIPANT_V1",
    dshPresetId: "minimal",
    requiredSkillNames: ["fr14-fixture"],
    toolFilter: { deny: ["convivium_role_probe"] },
    expertiseTags: ["fixture"],
    evidenceScopes: []
  }
];
```

   创建输入固定 `managerAgentDefinitionId="fr14-manager"`，participantKey="a" 的 `agentDefinitionId="fr14-participant"`，其他 Participant 不选择 Definition。测试 parent 的 composedPreset 返回 "minimal"；Skill fixture 返回 name="fr14-fixture"、content="FR14 fixture"、invocation.modelInvocable=true。
2. 测试合法 create→ownership→status、同request replay不再调用能力校验，修改当前config或移除Skill后ready replay仍返回原结果；不同ID同requestId冲突。
3. 检查新配置只影响新的requestId，旧ownership/provenance不变；非法Participant选择导致零child；DSH中途失败cleanup和取消没有可用Participant。补归档后同create请求重放，断言原binding、meetingVersion及领域event数量均不变。
4. 明确无公开字段：status和归档schema不接受persona/filter/Skill正文；继续执行原adapter followup/inspect/drain测试。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-runtime.spec.ts tests/integration/dsh/session-adapter.spec.ts
pnpm --dir plugin typecheck
```

PASS：成功、冲突、失败、取消、旧数据兼容均有断言；不是仅断言mock函数存在。
STOP：需要修改未授权产品代码；禁止扩张fixture断言绕过实际权限。

### T7：真实 DSH 角色配置与冷恢复

前置状态：T6 PASS；按 Smoke Operations 准备既有 `dev.env`，只允许其规定的 API key，不读取或输出其内容。
允许修改：

- `plugin/scripts/smoke-profile/index.mjs`
- `plugin/scripts/smoke-profile/result.mjs`
- `plugin/scripts/smoke-profile/probe/index.js`
- `plugin/scripts/smoke-profile/probe/support.js`
- `plugin/scripts/smoke-profile/probe/scenarios/recovery.js`
- `plugin/scripts/smoke-profile/probe/scenarios/role-composition.js`（新建）
- `plugin/scripts/smoke-profile/probe/role-definitions.js`（新建）
- `plugin/tests/unit/scripts/role-composition-smoke.spec.ts`（新建）
- `docs/50-operations/HOW-TO-DSH-SMOKE.md`

禁止修改：产品源码、默认 CORE_SCENARIOS、原 cold-rebind 断言、Browser 模式、宿主的用户 profile 或真实数据目录。

执行：
1. 新 selector 固定 `role-composition`，只加入 SMOKE_SCENARIOS，不加入 CORE_SCENARIOS。复用 wrapper 的两个 Host 阶段、checkpoint、临时 DSH_HOME 与 finally cleanup；index.mjs 中三处 cold-rebind phase 条件扩展为两个明确 selector 集合，不能把所有场景变成双阶段。probe/index.js 的 run 场景白名单及 runSelectedScenario 分派显式增加 role-composition，分派调用现有 runColdRebindScenario；第一阶段 Captain 走本节规定的真实创建分支，第二阶段跳过 run 中默认 Captain 创建。最关键的是在 `driveParticipant(ctx, agent)` 的现有提前返回场景条件中增加 `scenario === "role-composition"`，必须在查询状态或自动调用 convivium_submit_turn 之前返回；两个阶段均只由 recovery.js 手动推进 attempt。新增 selector 禁止 Browser 模式。
2. `probe/role-definitions.js` 唯一导出 `roleSmokeDefinitions(phase)`；phase 只接受字符串 "1" 或 "2"，其他值抛 TypeError。phase="1" 返回与 T6 `roleCompositionDefinitions` 逐字段相等的新对象数组；phase="2" 只把两个 definitionVersion 改为 "2.0.0"，persona 改为 FR14_MANAGER_V2 / FR14_PARTICIPANT_V2。其余字段和数组顺序保持一致。此 JS fixture 供 wrapper 和 copied probe 共用，不从产品 examples 加载；T7 unit 测试将第一阶段输出与 T6 的 TS fixture 深比较，防止两种测试运行环境的数据漂移，不为共享 fixture 增加 TS 编译步骤。
3. writeSmokePatch 为 role-composition 增加内联 agentDefinitions，值用上述函数的 JSON 输出作为 YAML 值；第一阶段 phase=1，第二阶段启动前仅把 patch 中 definitions 改成 phase=2。wrapper 源码与 copied probe 共享该 JS 文件；不用产品 examples 文件加载器。
4. writeProbePackage 为 probe 自身声明 dependencies 中 @deepseek-ai/dsh-subagent 固定 0.1.1-rc.2，供新文件具名导入 foldSubagentDescriptor，不依赖偶然的 hoist。新 `scenarios/role-composition.js` 导出 `prepareRoleSmoke(ctx, phase)` 与 `assertRoleSmoke(runtime, manager, participant)`。prepare 在两个阶段均调用 `ctx.get("agentPresets").resolve("minimal")`，确认已有 Preset 存在；只挂载已有 minimal，不调用 copy、不创建新 Preset、不修改其文件。缺少 agentPresets/skills service 或 minimal 时立即失败，不选择其他 Preset。prepare 必须在本阶段 Captain create/resume 之前完成。两个阶段均在 probe fiber 注册模型可调用 Skill `fr14-fixture`（description/content="FR14 fixture"、source="runtime"）和无输入工具 `convivium_role_probe`，执行递增 probe 内 counter 并返回 `{ok:true}`。注册全部由 probe ctx.effect 管理；工具定义按现有 ctx.tools.register 契约，counter 只用于验证调用是否到达 body。
5. 此 selector 的 Captain 必须使用真实 `ctx.agents.create({sessionId:"convivium-smoke-captain",meta:{cwd:process.cwd(),agentPreset:"minimal"},setup:async agentCtx=>{await ctx.get("agentPresets").mount(agentCtx,"minimal");}})` 创建，runtime.setCaptain 保存 handle；第二阶段通过 `ctx.agents.resume({resumeSessionId: checkpoint.captainSessionId, setup:同一mount})` 恢复。dispose 使用 handle.dispose；不修改原 cold-rebind 的 registerSmokeAgent 路径。
6. 复用 `runColdRebindScenario` 的现有创建→Manager plan→Participant submit→checkpoint→第二 Host→followup 流程。仅在 role-composition 分支：创建 input 设 managerAgentDefinitionId="fr14-manager"，participants[0].agentDefinitionId="fr14-participant"；第一次获得 manager/delivery.agent 后运行 assertRoleSmoke；phase2 恢复 manager、得到 phase2Delivery.agent 后再次运行。support.validateColdCheckpoint 仅增加 role-composition 为合法 scenario，并由调用者检查 checkpoint.scenario 与当前 selector 相等；保留其其他字段及所有原断言。
7. assertRoleSmoke 用 DSH `foldSubagentDescriptor(agent.session.events)` 检查两 child 的 persona/filter 为 V1，不出现 V2；用 `agent.ctx.systemPrompt.assemble({scope:agent})` 的 sections 检查各自 persona，并检查父 assembly 不含两 child marker。对 `ctx.tools.schemas(agent)` 检查 Participant 无 probe 工具、Manager 与 Captain 有 probe 工具。使用 `ctx.tools.execute({callId:唯一phase和身份后缀,name:"convivium_role_probe",arguments:{},agent,signal})` 验证 Participant isError=true 且 counter 不变，Manager/Captain 成功且各加1。不能只检查 Schema 隐藏。scope child/preset 变化或未知名失败均 STOP，不修改 filter 使断言通过。
8. result.mjs 为新 selector 检查完整断言集合：原五条 cold-rebind 断言，加 `role-persona-isolated`、`role-tool-execution-denied`、`role-parent-unmodified`、`role-cold-config-v1-preserved`。observed 增加 `roleComposition` 对象：`phase1Checked:true, phase2Checked:true, managerPersona:"FR14_MANAGER_V1", participantPersona:"FR14_PARTICIPANT_V1", phase2ConfiguredVersion:"2.0.0", deniedTool:"convivium_role_probe", deniedBodyCalls:0`。phase1 checkpoint 增加 roleCompositionChecked=true，仅新 selector 要求；support 返回时保留该字段，phase2 在任何复用前校验必须为 true；其余旧 checkpoint shape 不变。第二阶段报告必须断言该 checkpoint 标志与实际第二阶段执行结果，不能直接写常量假装验证。
9. 新 unit spec 验证 selector 选择/Browser拒绝、两phase配置、第一阶段与T6 fixture深相等、checkpoint误场景拒绝、result缺失/错误角色断言拒绝、双阶段调度分支与cleanup保留。自动提交回归测试固定使用 node:vm 的 runInNewContext：从 probe/index.js 源码按 `async function driveParticipant(ctx, agent) {` 到下一 `function scheduleParticipant(ctx, agent)` 截取完整现有函数，在沙箱赋予 scenario="role-composition"、有效 captain/meetingId、participants=["participant-a"]、callTool spy 和 nextCall=1；调用函数时传 agent.id="meeting-participant-a"，断言 Promise 正常完成、callTool 从未调用。此测试直接执行生产 probe 函数，不复制函数实现，不导出新产品符号；缺少上述函数边界时测试明确失败。HOW-TO 增加下面固定命令、九断言、两PID和cleanup条件；不得改默认 smoke 口径。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/scripts/role-composition-smoke.spec.ts tests/unit/scripts/smoke-profile.spec.ts
CONVIVIUM_SMOKE_SCENARIO=role-composition pnpm --dir plugin smoke:profile
```

PASS：unit 全绿；真实 wrapper 退出0，两个不同 Host PID，checkpoint身份相同、V2配置未改写已创建child，九断言通过，输出 `PASS role-composition` 和 `restore=PASS`，本次精确 tempRoot 删除、进程/端口退出。本场景使用真实 DSH Loader、Agent factory、continuable descriptor、工具执行和两进程恢复；不要求模型联网生成内容。
STOP：找不到 minimal、公开API不符、真实工具不受限制、无法恢复、缺环境或cleanup失败；保留脱敏输出并报告，不能改用fake adapter证明通过。失败先由wrapper finally清理，清理失败按 HOW-TO 使用本次精确PID/目录清理，不得使用通配符杀进程或删除其他目录。

### T8：完整验证与迁移收口

前置状态：T7 PASS，T0–T7全部记录实际结果。
允许修改：

- `docs/40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md`（新建）
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `plugin/README.md`
- `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/30-designs/ROLE-COMPOSITION-DESIGN.md`
- `docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md`
- `TODO.md`

禁止修改：产品代码补救、其他需求覆盖状态、独立 Preset 不纳入实施计划的已确认边界。

执行：
1. 运行完整 verify。失败回到所属步骤修复并重跑该步骤及受影响后续验证；未经重新验证不得进入删除。
2. 新建 evidence，包含 Scope、Validated Contract、Executed Validation、Not Covered、Closure；记录代码commit及未提交diff边界、日期、Node/pnpm/DSH版本、focused命令、verify结果、真实smoke两个PID与断言、清理结果。不保存persona正文、凭据或临时目录作为长期接口。
3. FR-14仅在全部门禁PASS后改为“已实现”，范围必须写“共享父Preset首版”。Not Covered保留独立Preset、独占Skill集合、模型配置、热切换、FR-13 admission、Browser配置UI和真实模型任务质量。更新README的内联配置/创建ID示例、固定失败语义和运维链接；移除接口和设计中的“目标契约尚未实现”标记，但保留后续非目标。
4. 按文末检查方法运行所有变更文档链接、git diff --check。`rg -n 'RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION|RUNBOOK FR14 Shared Preset Role Composition' docs TODO.md` 检查引用；本次已登记 TODO RC-01–RC-08；确认八项实际完成后，从 TODO 删除这些条目及其 RUNBOOK 引用，保留其他任务；独立 Preset 的决定已写入正式需求，不重新登记待讨论项。若发现这八项之外的其他任务引用，STOP并先明确迁移引用的准确文件范围。
5. 所有长期结论和证据迁移后删除本RUNBOOK；再次运行链接和diff检查。失败恢复删除前原文并STOP。没有通过真实验证时保留本文，不能写completed或将FR-14提升。

验证：

```bash
pnpm --dir plugin verify
rg -n 'RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION|RUNBOOK FR14 Shared Preset Role Composition' docs TODO.md
git diff --check
```

PASS：verify全绿；删除前已清除完成的 TODO RC-01–RC-08 引用，仅本RUNBOOK自引用；删除后rg退出1且无匹配（此处唯一预期非零）；链接全部存在；diff检查退出0；evidence覆盖全部验证矩阵。
STOP：真实smoke或任一矩阵缺证据、scope未完成、链接不通；不得用本地unit替代真实组合门禁。

## Validation Matrix

| 风险 | 固定验证 / 预期 | 步骤 |
| --- | --- | --- |
| 成功与边界 | 两角色、64项/16KiB边界、空/未知字段拒绝 | T1/T6 |
| Caller/authority/capability | 保留Captain创建限制；Manager定义不可作Participant；工具执行真实拒绝 | T2/T5/T7 |
| 选择数组部分非法 | 最后一个非法也使child start=0 | T5/T6 |
| stale/终态不可变 | 无新运行中写入口；归档后ready replay不重写binding；repository拒绝binding更新 | T4/T6 |
| 重放/冲突 | 原request/hash；ready replay不读当前配置；换ID同request冲突 | T2/T6 |
| 原子性/失败清理 | ownership failed put读值不变；中途child失败revoke/drain、不ready | T4/T5/T6 |
| 重启/恢复 | repository重开binding一致；真实第二Host同child ID、V1persona/filter | T4/T7 |
| state/event/receipt/outbox/archive | 无新增领域payload；旧链路测试通过；内部ownership留存，不泄露配置 | T4/T6/T8 |
| 父/兄弟隔离 | 父无child persona且可执行probe；Manager与Participant不同限制 | T7 |
| 类型/构建/包 | typecheck与完整verify通过；新增模块不增加package root exports | T1–T8 |
| Browser | Not Applicable：不新增前端或HTTP控制，首版通过Captain创建工具选择 | T8记录 |
| 数据迁移 | Not Applicable：新增optional provenance，新reader兼容旧无字段记录，无历史回填 | T4 |
| 新领域事件/新receipt/outbox | Not Applicable：只有创建配置与已有ownership扩展，既有机制保持 | T4/T6 |

## Document Link Check

Author 和 T8 均使用下列命令检查所有工程 Markdown 的文件链接（跳过网络链接、纯anchor与 fenced code；文件anchor不验证标题），结果记录实际checked数。检查失败按输出定位，不删除有效链接来绕过。

```bash
python3 - <<'PY'
from pathlib import Path
import re
root = Path.cwd()
paths = [root / 'TODO.md', *sorted((root / 'docs').rglob('*.md'))]
missing = []
count = 0
for path in paths:
    source = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
    for target in re.findall(r'\]\(([^)]+)\)', source):
        target = target.strip('<>').split('#', 1)[0]
        if not target or '://' in target or target.startswith('mailto:'):
            continue
        count += 1
        if not (path.parent / target).resolve().exists():
            missing.append((str(path.relative_to(root)), target))
print({'checked': count, 'missing': missing})
assert not missing
PY
git diff --check
```

## Author Audit

本轮允许文档集（T0 工作树白名单）：

- `TODO.md`
- `docs/00-governance/ARCHITECTURE.md`
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
- `docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md`
- `docs/20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`
- `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md`
- `docs/30-designs/MEETING-ORCHESTRATION-DESIGN.md`
- `docs/30-designs/ROLE-COMPOSITION-DESIGN.md`
- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `docs/30-designs/RUNBOOK-FR14-SHARED-PRESET-ROLE-COMPOSITION.md`


Author 仅运行文档链接与diff检查、路径/symbol核对和依赖顺序dry-run。T0–T8所列产品测试与真实DSH smoke尚未执行，均为 Not Covered，不构成产品已完成证据。交付审计结论在完成检查后写入，不将实现时的正常失败STOP误写为产品决策待定。

### Audit Result

结论：Executable。已逐项核对治理要求中的 scope/non-goals、正式依据、数据及 owner、字段/ID/hash来源、完整调用链、单向依赖、T0–T8文件和symbol、步骤顺序、PASS/STOP、失败清理、兼容/重放/恢复、验证矩阵和迁移删除条件。9个步骤均具备固定字段，12个新文件路径唯一分配，既有允许路径全部存在。

Author 实际验证：工程 Markdown 文件链接检查 101 个、缺失 0；git diff --check 通过；两个新 Markdown 的独立 whitespace 检查无诊断（git diff --no-index 因新文件差异退出 1，已与 whitespace 错误区分）。未运行产品 verify、unit/contract 或真实 profile；这些仍为实施门禁，不计为已通过。公开 API核对基线为本地 rc.2 类型及对应上游源码；不依赖最新主干新增 API。

### Review Fix Audit — 2026-09-07

已修复 review 两项缺口：T6 完整 fixture 与唯一导出固定；T7 在 driveParticipant 中显式排除新场景，并以执行原函数的回归测试约束零自动提交。同步删除不必要的 Preset copy，两个阶段直接 resolve/mount 已有 minimal；不新增产品模块、依赖或生命周期责任。T7 第一阶段 JS fixture 必须与 T6 TS fixture 深相等，第二阶段只有版本与 persona 的明确变化。

复审结论：Executable。本次仅修订 RUNBOOK；产品实现、聚焦测试与真实 smoke 仍为 Not Covered，必须由执行阶段完成。文档链接、文件范围、步骤字段和 diff 检查结果见本次交付说明。

### T0 Execution — 2026-09-07

用户已授权 Execute 及逐项删除 TODO、逐项 commit。基线 `581763b6049a1d2a0522be886c232f7276ca6bfa`，分支 `codex/fr14-role-composition-runbook`，工作区干净；Node v22.23.2、pnpm 10.7.0、DSH subagent 0.1.1-rc.2，公开 request 包含 persona/toolFilter。16:06 CST 开始的完整 verify 退出 0：76 个测试文件、664 项测试通过，format/lint/typecheck/build/environment/contract/samples/package 全部通过。T0 PASS。
