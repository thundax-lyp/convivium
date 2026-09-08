# Architecture

## Purpose

本文档定义 Convivium 当前已经确认的仓库级技术边界和依赖约束。本文不替代产品需求、接口契约或模块设计，也不把讨论中的候选方案视为既定技术决策。

## Scope

- DSH 插件宿主、插件后端、插件前端和 Agent Session 之间的职责边界。
- DSH 工具、Web 路由、DSH 原生 Session Event 和插件 UI 的安全边界。
- Agent 身份与 DSH continuable AgentSession 的隔离原则。
- 新增顶层工程或跨进程依赖时必须遵守的约束。

## Confirmed Baseline

- Convivium 是纯 DSH 插件，不是独立 Electron 应用。
- V1 运行在单个本地 DSH Host 中，仅服务该 Host 的一位本地用户；不提供远程访问、多用户协作、跨 Host 共享或网络部署。Meeting Web route 只允许在 DSH `webServer.host === "127.0.0.1"` 时注册；V1 不绑定 Web 用户身份、不校验 Team 权限，也不建立 per-user authority，所有到达该 loopback Host 的请求共享该本地用户边界。后续引入远程或多用户能力必须先补充独立的授权、身份、隔离和部署契约。
- Convivium 使用 TypeScript 独立实现，不导入或派生外部参考项目源码。
- 仓库只包含一个可构建、测试和交付的 Convivium DSH 插件工程 `plugin/`。Meeting Runtime 和 JSONL `StorageBackend` 保持源码职责分离，但作为同一 package 内的 Cordis child plugins 组合；不为 JSONL backend 建立第二个顶层工程、package、lockfile 或发布单元。
- Convivium 当前 DSH 依赖固定为 `0.1.2-rc.1`；实现可以依赖该版本 `dsh-subagent` 提供的持久子 Session 枚举和 continuable Activation drain 能力。
- Convivium 正式运行会议前，宿主组合必须提供一个具备 `prepareContinuable` 能力的 continuable subagent provider；仅声明或注入 `dsh-subagent` service 不构成该能力。当前确认的宿主 profile provider 是 `@deepseek-ai/dsh-subagent-spawn-in-process@0.1.2-rc.1`，provider name 为 `spawn`，由 profile 作为组合依赖管理，不由 Convivium 自行实现、隐式携带或写入插件 package manifest。插件必须在独立 DSH profile 中验证该 provider 与 `startContinuable()` 的实际创建链路。
- 插件依赖 DSH 提供 AgentSession、continuable Agent、工具注册、Web 路由、DSH 原生 Session Event 和插件 UI 宿主能力。
- Convivium 拥有会议角色目录、Meeting Agent Definition、Manager 可见安全摘要、参会选择与批准状态；DSH Host 或 profile 拥有 Agent Preset、Skills、Tools、MCP、Sandbox、Approval、模型配置及其安装和执行。
- Meeting Agent Definition 只引用 DSH 原生 Agent Preset 和 Skill 名称，并可用 DSH 原生 ToolRestriction 收窄工具；Convivium 不复制、安装或持久化 DSH capability composition。Definition 存在不证明 capability 已安装；缺少可验证的 DSH composition 时必须 fail closed。
- 插件包含清晰分离的插件前端和插件后端会议运行时。
- 每个 Meeting 在任何会议副作用前获得稳定 `meetingId`，并以 `teamId + meetingId` 形成独立 repository ownership。Convivium 只通过 `@deepseek-ai/dsh-storage-domain` 使用一个轻量 catalog domain 和每 Meeting 独立 domain；不得定位、扫描或依赖 backend 的物理布局。
- [Meeting Persistence Design](../30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md) 已确认采用 `Checkpointed Commit Log`：一次 command 编码为一条原子 commit，当前真相由已发布分页 checkpoint 与连续有界 commit tail 合成。`plugin/src/storage/` 通过 `@deepseek-ai/dsh-storage` 实现仅供 Convivium 使用的 JSONL KV backend，只认识 unit、table、key 和 value；`plugin/src/repository/domain/` 只消费 `@deepseek-ai/dsh-storage-domain` 和自身 record schema。顶层 Convivium plugin 先挂载 backend provider child plugin，再由依赖完整 DSH services 与 `storageDomain` 的 Meeting consumer child plugin 注册业务能力；宿主组合中的现有 `storage-domain` row 路由到 backend `convivium-jsonl`。Storage Domain 是唯一会议事实源；禁止双写、fallback 和自动迁移。本项目为首次发布，不提供开发期存储格式的迁移或兼容。
- Meeting Runtime 若 best-effort 生成供开发者阅读的 Markdown 辅助文件，只能从已提交 Meeting projection 单向派生；Markdown 不是产品接口或事实源，不参与恢复、授权、状态计算、Session 关闭与 capability 撤销或归档完成判断。
- DSH AgentSession 是独立运行主体，拥有独立 Prompt、Skills、工作目录、模型、MCP、权限和运行模式。
- AgentSession 必须支持通过 `sendMessage` 继续投递、interrupt、恢复，以及通过 `drainContinuableChildren` 释放指定会议 Session 的 resident Activation。会议 Session 的持久不可继续语义由 Convivium capability revoke 保证，不要求 DSH 删除持久 Session 数据。

## Runtime Boundaries

### Confirmed Storage Provider Transition

2026-09-08 已确认下一步将介质责任交回 Host/profile 安装和配置的 `@deepseek-ai/dsh-storage-sqlite@0.1.2-rc.1`。上文及现有设计中的 JSONL child backend 描述是替换前实现状态；本节明确授权删除该实现，不能据旧实现描述要求继续保留它。替换尚未实现或验证，当前完成度仍以 readiness 为准。

- Convivium 仅消费 `storageDomain`；删除自有物理存储、backend child plugin 和 `dataRoot` 配置，不在产品包携带 SQLite provider。Host/profile 拥有 provider、数据库路径和 Domain 路由；插件 bundle 不覆盖 Host 的默认 backend。
- 保留现有 catalog、每 Meeting 独立 domain、command commit、receipt、outbox、领域 checkpoint、串行化、容量限制和恢复算法。不得改为单 record Meeting 聚合，不新增跨 record transaction 或 SQL 访问。
- 本项目为首次发布，SQLite 是首次发布的存储介质。不设计开发期 JSONL/SQLite 数据迁移、兼容读取、双写、fallback 或数据清理流程，也不为遗留数据建立测试与验收要求。此决定不授权删除开发者本地文件。
- 本阶段实现和运行验证只使用新建的隔离 profile；不自动修改已有 Host/profile。DSH Domain 路由按精确名称匹配，不能使用 Meeting 名称前缀通配。组合必须保留其他 Host domain 的既有介质路由。
- 首次发布接受 [Storage Shutdown Limitation](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#accepted-storage-shutdown-limitation)：关闭时未完成写入的排空不作为 provider 替换前置条件；成功提交后的持久性与恢复不变量不变。继续使用已固定的官方依赖，不为此接入本地上游修复包。
- 完成替换后同步移除本文和正式设计中的旧当前实现描述，再将本节稳定结论并入对应基线和依赖规则，不长期保留过渡状态。

### DSH Plugin Host

- 提供插件加载、AgentSession、continuable Agent、工具注册、Web 路由、DSH 原生 Session Event 和前端挂载能力。
- 负责底层 Agent 生命周期和模型调用；会议领域状态不以 DSH Session 内部状态为真相源。
- Convivium 不绕过 DSH 权限和生命周期接口直接控制宿主内部资源。

会议工具与 runtime 不依赖 WebServer 的存在。Meeting Web route 作为依赖 webServer 的 Cordis 子作用域按服务可用性挂载与卸载；移除 WebServer 不重建会议 runtime 或工具。无 Web 的宿主仍须提供既有 Agent、Session、continuable provider 和 Storage Domain 组合；这不授予远程访问或多用户能力。

### Plugin Frontend

- 承载团队、会议现场、人类控制以及 Agent 和 Session 状态展示。
- 只能调用插件后端公开、类型化且受已确认 Host/identity 边界约束的 Web 路由或工具；V1 loopback Web 使用 Host registration gate，不虚构用户/Team authority。
- 不直接管理 AgentSession，不直接访问持久化介质、敏感配置或任意文件系统路径。
- 不承担会议领域状态、发言权和权限判定的最终责任。

### Meeting Runtime

- 作为 DSH 插件后端的一部分，承担会议生命周期、Participant、发言权、AgentSession、持久化和事件投影。
- 必须与 Plugin Frontend 保持可测试的路由和事件边界。
- 不作为独立 Meeting Server，也不要求脱离 DSH 运行。

### DSH Agent Sessions

- 每个会议身份使用独立的 DSH continuable AgentSession。
- DSH 负责 Session 创建、`sendMessage` 投递、interrupt、事件和生命周期能力。
- Convivium 负责会议身份、上下文投影、发言 capability 和 Session ownership，不把 AgentSession 当作会议领域真相源。
- Convivium 只定义 Agent 之间及 Agent 与 Meeting Runtime 之间的会议协议，不拥有或解释 Agent 内部的 Prompt、Skills、Tools、MCP、推理、命令、工作流和重试过程。
- Convivium 可以保存 Meeting Agent Definition identity 与 meeting-owned DSH Session ownership；MCP、Sandbox、Approval、模型和其他 Host 私有能力配置仍由 DSH 管理。首版允许通过创建前解析函数校验共享父 Preset 与 required Skills，并用 DSH 公开 persona/toolFilter/agentOptions 参数配置独立 continuable Session；Definition ID、版本和指纹属于会议 provenance，运行配置由 DSH descriptor 持有。独立 per-child Preset 不属于首版；实现状态以 readiness 为准。
- Agent 内部能力、Sandbox 和 Approval 由 DSH 管理；Convivium 只向 DSH 提供会议身份对应的授权上限，不得扩大用户或 DSH 已授予的权限。

## Identity And Session Isolation

- 调度器选择的是会议中的 Participant，不是底层 Agent 实例。
- Agent role catalog 中的 candidate 不是 Participant。Manager recommendation 不是接纳或授权；只有 Captain 明确批准且 Runtime 完成独立 meeting-owned Session provisioning 后，candidate 才成为可调度 Participant。
- TeamMember、Participant、Manager、Captain 和 AgentSession 必须保持概念分离。
- 同一个底层 Agent 表示不同会议身份时，必须使用不同 AgentSession。
- 不同会议、不同身份或不同授权范围的上下文不得通过共享 Session 静默混合。
- 代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。

## Dependency Rules

- Plugin Frontend 只能依赖公开的类型化路由和事件契约，不能依赖插件后端实现细节。
- 会议领域规则不能依赖 DSH UI 组件。
- DSH AgentSession 不能成为 Meeting、Participant、Turn 或权限模型的真相源。
- Convivium 实现必须保持会议领域、DSH Session adapter、持久化和 UI projection 的模块边界。
- Meeting domain、开发者 Markdown、Session ownership 和归档数据必须以 `teamId + meetingId` 为共同生命周期 ownership；调用方不得假设或推导 backend 的物理路径。
- 会议领域只能消费 Agent 明确提交的边界结果和经授权的 MeetingTask projection，不得依赖具体 Skill、内部 Tool Schema、隐藏推理或工具调用顺序。MeetingTask 属于 Convivium MeetingState，不属于 DSH runtime facts。
- Convivium 不得向 DSH Session 写入插件自定义的持久化事件类型。会议领域事件与状态在同一 Storage Domain commit 中原子持久化；插件前端只通过定时读取、写操作成功后重新读取和页面重新聚焦后读取完整类型化状态投影，不建立进程内 projection invalidation 通道。
- Manager 只能消费 Agent catalog 的安全 projection 并提交参会 recommendation，不能取得 DSH capability secret、创建任意角色、批准自己的推荐或扩大 DSH/Meeting 权限。Catalog 更新不能改变 Meeting 已固化的 Catalog snapshot、recommendation、admission 或 Participant provenance。
- Meeting Agent Definition 只能引用 DSH 公开的 Preset、Skill 和 ToolRestriction；Convivium 不得用 Prompt、persona 或自建 installer 假装安装 DSH capability。
- 开发者 Markdown 只能单向派生自已提交 Meeting projection。人工修改、文件缺失或旧版本内容不得反向写入会议状态；该文件不形成 Plugin Frontend 或 Agent 可依赖的契约。
- DSH 原生 `tool/call`、`tool/result` 及其他 DSH-owned Session Events 继续由 DSH 定义和持久化；Convivium 不复制、重命名或扩展其语义。
- 新增 Web 路由、工具、事件、外部访问或文件权限前，必须先形成对应接口契约和失败语义。

## Source Layout And Verification

- `plugin/` 包含 Convivium DSH 插件的 Host、Client、Meeting 业务、JSONL Storage Backend 和全部验证；仓库级 `docs/` 不参与插件打包。
- `plugin/examples/meeting-agent-definitions/` 保存不进入发布包的 Convivium Meeting Agent Definition 样本；样本不是 DSH Agent Preset、不是 capability registry，也不证明运行时已安装差异化能力。
- `plugin/` 独立安装、类型检查、构建和验证；根目录不建立 workspace 或 monorepo 层。
- `plugin/` 的 TypeScript 源码支持 `@/*` 映射到 `src/*`，Host 与 Client 共用该映射；导入保留 NodeNext 所需的 `.js` 扩展名，例如 `@/protocol/types.js`。Vitest 同步解析别名，构建时将声明文件中的别名转换为相对路径，发布产物不要求消费者配置 `@`。
- JSONL backend 不从 package root 导出，不拥有独立 manifest 或 profile row；它的 backend contract、恢复和生命周期测试位于 `plugin/tests/`，并由同一 package 的 `verify` 与真实 DSH profile smoke 覆盖。
- 外部参考项目只用于只读调研 DSH 接口和可选实现思路；其源码、文档、发布记录、品牌、协议命名和持久化格式不得进入产品工程。
- `plugin/package.json` 提供 `typecheck`、`test`、`build` 和 `verify`；组合边界还必须用真实 DSH profile 验证 backend 注册、Storage Domain 打开、Host 冷重启和关闭顺序。

## Import Paths

- `plugin/src/` 内禁止使用 `../`、`../../` 等父级相对模块路径，必须使用 `@/`；适用于普通导入、类型导入、重新导出和动态 `import()`。例如 `src/runtime/` 导入 `../domain/index.js` 必须写为 `@/domain/index.js`。跨模块引用同时遵守下节公开入口约束，模块内引用保持原目标文件。
- 同目录和子目录的 `./` 引用在符合公开入口规则时保留；保留 `.js` 扩展名，不改变导入符号的实现归属。
- `plugin/tests/` 引用 `src/` 必须使用 `@/`；测试 fixture 和辅助文件之间允许使用相对路径，`@/` 不指向测试目录。
- `plugin/scripts/` 中直接由 Node 执行的脚本不使用 TypeScript 路径别名；文件系统路径和 `new URL(..., import.meta.url)` 不属于模块导入规则。
- `plugin/eslint.config.js` 强制检查上述源码引用和测试静态导入。不得通过禁用 lint、扩大例外或创建转发文件绕过规则。

### Public Module Entrypoints

- `client`、`domain`、`dsh`、`http`、`projection`、`protocol`、`runtime`、`storage`、`tools` 是当前具有公开入口的顶层源码模块，模块对其他生产源码只公开自身 `index.ts` / `index.tsx` 导出的符号。源码模块公开不等于 package 对外导出；例如 Storage 仍为 package-private。
- 跨模块导入必须使用 `@/<module>/index.js`；`src/` 根目录装配可保留等价的 `./<module>/index.js`。普通导入、类型导入、重新导出和动态导入遵循同一边界。不得用别名或相对路径直接访问另一个模块的内部文件。
- 模块内部可以直接引用自身文件，无须经由自身入口；`domain/transitions/` 和 `runtime/application-service/` 属于各自顶层模块内部，不因有 `index.ts` 就成为独立封装单元。`repository`、`role-composition` 尚无入口，不为本规则新增转发文件。
- 测试可以直接引用被测模块内部文件；直接执行的 Node 脚本继续遵守既有运行和路径约束。
- 入口缺少外部所需符号时，先核对当前调用依据和模块职责，只显式补充必要导出，不批量公开 internal。当前 Domain 公开 Runtime 使用的 Manager planning fallback，Protocol 公开请求序列化函数，Runtime 公开根插件装配所需的 Agent catalog service key；函数实现和 port ownership 保留在原文件。
- ESLint 使用固定模块列表按导入方作用域应用内置规则；新增或改变模块入口时同步更新本节与配置。

## Undecided Architecture

以下内容尚未确认，不得从本文推断为既定方案：

- 插件分发方式和高于最低版本的兼容策略。

## Document Routing

- 产品行为和验收标准：`docs/10-requirements/`。
- Web 路由、工具、事件、配置和数据契约：`docs/20-interfaces/`。
- 模块结构、状态机和专项方案：`docs/30-designs/`。
- 实现覆盖和运行验证：`docs/40-readiness/`。
- 启动、诊断、恢复、升级和发布操作：`docs/50-operations/`。
- 产品讨论、外部调研和决策背景：`docs/60-human/`。

## Test Naming

测试文件和 `describe` 按稳定的业务对象、业务能力或工程边界命名；`it`/`test` 说明触发条件和可观察结果。不得按临时任务、RUNBOOK、审计报告、阶段或 finding 编号组织长期测试；回归应归入对应对象已有测试。需求编号可写在必要的依据注释或 readiness 中，不替代测试名称。纯工程组件沿用其稳定对象名称（例如 Storage Domain、outbox、plugin lifecycle）。
