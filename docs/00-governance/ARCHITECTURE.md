# Architecture

## Purpose

本文定义 Convivium 的系统组成、所有权、依赖方向和不可跨越的边界。具体接线由设计文档维护；工程取舍和验证方法见 [Engineering Rules](./ENGINEERING-RULES.md)，文档路由见根 `AGENTS.md`。

## Product Boundary

- Convivium 是使用 TypeScript 独立实现的纯 DSH 插件，只有 `plugin/` 一个可构建、测试和交付的工程；不建立独立 Meeting Server、应用壳、backend 发布单元或根 workspace/monorepo。新增顶层工程前必须在本文明确职责、依赖方向和验证入口。
- 外部项目仅作只读调研，不作为源码基线、运行依赖或兼容目标；不得复制其源码、文档、品牌、协议命名和持久化格式进入产品。
- V1 仅服务单个本地 DSH Host 的一位用户。Meeting Web 接口只在 `webServer.host === "127.0.0.1"` 时注册；到达该 Host 的请求共享本地用户边界，不虚构 Web 用户或 Team authority。远程、多用户、跨 Host 或网络部署必须先形成独立的身份、授权、隔离和部署契约。
- 插件依赖 DSH 公开能力，不绕过宿主权限或生命周期接口。固定依赖版本、provider 组合和装配入口见 [Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#host-dependency-composition)。

## Runtime Boundaries

| 边界 | 所有权与限制 |
| --- | --- |
| DSH Host/profile | 提供插件加载、AgentSession、continuable provider、Tools、Web/UI 宿主和原生 Session Event；拥有 Preset、Skills、MCP、Sandbox、Approval、模型配置及其安装执行 |
| Meeting Runtime | 插件后端内的会议领域执行者；拥有 Meeting/Participant/Turn/MeetingTask、发言 capability、Session ownership、持久化和投影，不脱离 DSH 运行 |
| Plugin Frontend | 通过后端公开、类型化且受 Host/identity 边界约束的入口展示会议和执行用户控制；不直接管理 Session、介质、敏感配置或任意文件访问，不判定最终领域状态或权限 |
| DSH AgentSession | 独立运行主体，拥有独立上下文和能力；其内部推理、Prompt、Skills、Tools、工作流与重试过程由 DSH/Agent 管理，不是会议领域事实源 |

会议工具和 runtime 不依赖 WebServer；Web 服务可用性只影响路由挂载，不重建会议 runtime 或工具。无 Web 的组合仍须提供核心 Session、continuable provider 和 Storage Domain 能力；接线见 [Optional Web Composition](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#optional-web-composition)。

## Identity And Session Isolation

- 调度选择的是会议内 Participant。TeamMember、Participant、Manager、Captain 和 AgentSession 保持概念分离；每个具体会议身份使用独立 continuable AgentSession，不跨会议、身份或授权范围共享上下文。
- Manager 只读取 Catalog 安全投影并推荐 candidate；推荐不构成接纳或授权。Captain 批准且 Runtime 完成独立 Session provisioning 后，candidate 才可调度。Manager 不能批准自身推荐、取得 capability secret、任意创建角色或扩大权限。
- Convivium 拥有 Definition、Catalog snapshot、推荐/批准与 provenance；后续 Catalog 更新不得改变已固化会议事实。Definition 只引用 DSH 公开角色能力，不能用 persona 或 Runtime installer 假装安装能力；创建前必须验证宿主组合，缺能力时 fail closed。
- DSH 拥有实际运行配置与 descriptor，Convivium 只保存会议 identity/provenance 与 Session ownership。角色解析、工具限制和原生资源部署见 [Role Composition Design](../30-designs/ROLE-COMPOSITION-DESIGN.md)。
- Convivium 只提供会议身份的授权上限，不扩大用户或 DSH 已授予的权限。代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。
- Session 创建、继续投递、interrupt、恢复与 resident Activation 释放只通过受控 DSH adapter。归档后的持久不可继续语义由 capability revoke 保证，不要求删除 DSH 持久 Session 数据；调用边界见 [Meeting Session Adapter](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#meeting-session-adapter)。

## State And Storage Ownership

- Meeting 在任何会议副作用前获得稳定 `meetingId`；以 `teamId + meetingId` 统一持有 Meeting domain、Session ownership、归档与开发者 Markdown 的生命周期。
- Storage Domain 是唯一会议事实源，禁止双写与 fallback。Convivium 只消费 Storage Domain：轻量 catalog 负责发现，每个 Meeting 使用独立 domain；不定位、扫描或依赖 backend 物理布局。
- Host/profile 拥有官方 SQLite provider、数据库位置与 Domain 路由。Convivium 不携带物理存储实现、不覆盖 Host 默认介质，也不提供调用方可指定的存储路径。具体组合见 [Implementation](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#host-dependency-composition)。
- 一次 command 的领域状态、事件、receipt 和 outbox 必须原子提交；外部副作用在提交后执行。`Checkpointed Commit Log` 的有界写入、恢复与 compaction 由 [Persistence Design](../30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md) 定义，record schema 与失败语义由 [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 定义。
- 首次发布使用 SQLite，禁止数据和 schema migration，不实现开发期介质迁移或已有版本升级，不自动清理开发者数据。已明确的 legacy 窄读取只保留旧值，不补默认值、不转换版本、不回写；具体读取与拒绝边界由 Storage Interface 定义。已接受的 [关闭限制](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#accepted-storage-shutdown-limitation) 不弱化已确认成功事实的持久性或恢复不变量。
- MeetingTask 属于 MeetingState；领域只消费 Agent 明确提交的边界结果和授权投影，不能从内部 Tool Schema、调用顺序、隐藏推理或 DSH Session log 推导当前事实。
- DSH 原生 tool/session events 由 DSH 定义和持久化；Convivium 不复制或扩展其语义，也不向 DSH Session 写入插件自定义持久化事件。会议领域事件保存在会议 commit 内。
- Frontend 与开发者 Markdown 只能单向读取已提交投影。Markdown 不是产品接口，不参与恢复、授权、状态计算、Session 清理或归档完成；人工编辑、缺失或滞后不回写会议事实。UI 刷新与 Markdown 生成方式见 [Projection And Frontend](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#projection-and-frontend) 和 [Developer Markdown generation](../30-designs/MEETING-ORCHESTRATION-DESIGN.md#83-developer-markdown-generation)。

## Dependency Rules

- 必须保持 Domain、DSH adapter、Repository 和 UI projection 的模块边界；Domain 不依赖 Protocol、DSH、Repository、UI 或文件系统，Frontend 只依赖公开 Protocol 和生成的 Remote contract，不引用后端实现。
- Runtime、tools、Web transport 和 recovery 共用受控领域写入口；Repository 不执行调度或 DSH 调用，projection 不能反向驱动状态转换。具体模块接线见 [Implementation Dependency direction](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md#dependency-direction)。
- 新增 Web 路由、工具、事件、外部访问或文件权限前，必须先形成接口契约和失败语义。
- Host/Client、业务与验证同属 `plugin/`，独立安装、构建和验证；仓库 `docs/` 不参与插件打包。同包角色资源是静态部署资源，不是第二工程或 Runtime installer；发行结构和验证入口见 Implementation Design。

## Import Paths

- `plugin/src/` 内禁止使用 `../`、`../../` 等父级相对模块路径，必须使用 `@/`；适用于普通导入、类型导入、重新导出和动态 `import()`。例如 `src/runtime/` 导入 `../domain/index.js` 必须写为 `@/domain/index.js`。跨模块引用同时遵守下节公开入口约束，模块内引用保持原目标文件。
- 同目录和子目录的 `./` 引用在符合公开入口规则时保留；保留 `.js` 扩展名，不改变导入符号的实现归属。
- `plugin/tests/` 引用 `src/` 必须使用 `@/`；测试 fixture 和辅助文件之间允许使用相对路径，`@/` 不指向测试目录。
- `plugin/scripts/` 中直接由 Node 执行的脚本不使用 TypeScript 路径别名；文件系统路径和 `new URL(..., import.meta.url)` 不属于模块导入规则。
- `plugin/eslint.config.js` 强制检查上述源码引用和测试静态导入。不得通过禁用 lint、扩大例外或创建转发文件绕过规则。

### Public Module Entrypoints

- `client`、`domain`、`dsh`、`projection`、`protocol`、`runtime`、`tools` 通过自身 `index.ts` / `index.tsx` 对其他生产源码公开符号。Web transport 迁移前为 `http`，按 [Remote Design](../30-designs/MEETING-REMOTE-DESIGN.md) 一次替换为 `remote`；实施覆盖由 readiness 记录。源码模块公开不等于 package 对外导出；生成器使用的纯类型 package 子路径不授权跨模块导入源码内部文件。
- 跨模块导入必须使用 `@/<module>/index.js`；`src/` 根目录装配可保留等价的 `./<module>/index.js`。普通导入、类型导入、重新导出和动态导入遵循同一边界。不得用别名或相对路径直接访问另一个模块的内部文件。
- 模块内部可以直接引用自身文件，无须经由自身入口；`domain/transitions/` 和 `runtime/application-service/` 属于各自顶层模块内部，不因有 `index.ts` 就成为独立封装单元。`repository`、`role-composition` 尚无入口，不为本规则新增转发文件。
- 测试可以直接引用被测模块内部文件；直接执行的 Node 脚本继续遵守既有运行和路径约束。
- 入口缺少外部所需符号时，先核对当前调用依据和模块职责，只显式补充必要导出，不批量公开 internal。当前 Domain 公开 Runtime 使用的 Manager planning fallback，Protocol 公开请求序列化函数，Runtime 公开根插件装配所需的 Agent catalog service key；函数实现和 port ownership 保留在原文件。
- ESLint 使用固定模块列表按导入方作用域应用内置规则；新增或改变模块入口时同步更新本节与配置。

## Undecided Architecture

插件分发方式和高于固定依赖版本的兼容策略尚未确认，不得从当前安装验证推断为已决定。
