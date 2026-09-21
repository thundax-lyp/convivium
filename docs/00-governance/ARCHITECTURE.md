# Architecture

## Purpose

本文定义 Convivium 的系统组成、所有权、依赖方向和不可跨越的边界。具体接线由设计文档维护；工程取舍和验证方法见 [Engineering Rules](./ENGINEERING-RULES.md)，文档路由见根 `AGENTS.md`。

## Product Boundary

- Convivium 是使用 TypeScript 独立实现的纯 DSH 插件，只有 `plugin/` 一个可构建、测试和交付的工程；不建立独立 Meeting Server、应用壳、backend 发布单元或根 workspace/monorepo。新增顶层工程前必须在本文明确职责、依赖方向和验证入口。
- 仓库根 `package.json` 只提供代理到 `plugin/package.json` 的同名开发和验证命令；不声明 workspace、依赖、构建产物或交付单元，不能据此把仓库根视为第二个工程。
- 外部项目仅作只读调研，不作为源码基线、运行依赖或兼容目标；不得复制其源码、文档、品牌、协议命名和持久化格式进入产品。
- V1 仅服务单个本地 DSH Host 的一位用户。Meeting Web 接口只在 `webServer.host === "127.0.0.1"` 时注册；到达该 Host 的请求共享本地用户边界，不虚构 Web 用户或 Team authority。远程、多用户、跨 Host 或网络部署必须先形成独立的身份、授权、隔离和部署契约。
- 插件依赖 DSH 公开能力，不绕过宿主权限或生命周期接口。装配和能力边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Runtime Boundaries

| 边界 | 所有权与限制 |
| --- | --- |
| DSH Host/profile | 提供插件加载、AgentSession、continuable provider、Tools、Web/UI 宿主和原生 Session Event；拥有 Preset、Skills、MCP、Sandbox、Approval、模型配置及其安装执行 |
| Meeting Runtime | 插件后端内的会议领域执行者；拥有 Meeting/Participant/Turn/MeetingTask、发言 capability、Session ownership、持久化和投影，不脱离 DSH 运行 |
| Plugin Frontend | 通过后端公开、类型化且受 Host/identity 边界约束的入口展示会议和执行用户控制；不直接管理 Session、介质、敏感配置或任意文件访问，不判定最终领域状态或权限 |
| DSH AgentSession | 独立运行主体，拥有独立上下文和能力；其内部推理、Prompt、Skills、Tools、工作流与重试过程由 DSH/Agent 管理，不是会议领域事实源 |

会议工具和 runtime 不依赖 WebServer；Web 服务可用性只影响路由挂载，不重建会议 runtime 或工具。无 Web 的组合仍须提供核心 Session、continuable provider 和 Storage Domain 能力；边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Identity And Session Isolation

- 调度选择的是会议内 Participant。TeamMember、Participant、Manager、Captain 和 AgentSession 保持概念分离；每个具体会议身份使用独立 continuable AgentSession，不跨会议、身份或授权范围共享上下文。
- Manager 只读取 Catalog 安全投影，并通过结构化会议操作对当前 candidate 明确作出 `admit` 或 `reject` 决定；自然语言或目录可用性不构成决定。`admit` 形成不可调度的 provisioning 意图；只有 Runtime 完成独立 Session provisioning 与 durable ownership 后，candidate 才可调度。Manager 不能接纳自己、取得 capability secret、任意创建角色或扩大权限。
- Convivium 拥有 Definition、Catalog snapshot、Manager 决定与 provenance；后续 Catalog 更新不得改变已固化会议事实。Definition 只引用 DSH 公开角色能力，不能用 persona 或 Runtime installer 假装安装能力；创建前必须验证宿主组合，缺能力时 fail closed。
- DSH 拥有实际运行配置与 Session 执行 descriptor；Convivium 的 `PreparedDescriptorV1` 只记录经公开 DSH 能力预检后的会议、父 Session、Definition 与到期约束，并保存 identity/provenance 与 Session ownership，不复制执行配置；角色资源和预检见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。
- Convivium 只提供会议身份的授权上限，不扩大用户或 DSH 已授予的权限。代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。
- Session 创建、继续投递、interrupt、恢复与 resident Activation 释放只通过受控 DSH adapter。归档后的持久不可继续语义由 capability revoke 保证，不要求删除 DSH 持久 Session 数据；调用边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## State And Storage Ownership

- Meeting 在任何会议副作用前获得在当前 Convivium Host/profile Storage Domain 中全局唯一且稳定的 `meetingId`；以该 `meetingId` 统一持有 Meeting domain、catalog、Session ownership、归档与开发者 Markdown 的生命周期。V1 不建立 Team 或 Team authority，目标协议、repository、Session label 与 recovery 不接受或派生 `teamId`；未来引入多 Team 必须先形成独立的身份、授权、隔离和迁移契约。
- Storage Domain 是唯一会议事实源，禁止双写与 fallback。Convivium 只消费 Storage Domain：轻量 catalog 负责发现，每个 Meeting 使用独立 domain；不定位、扫描或依赖 backend 物理布局。
- Host/profile 拥有官方 SQLite provider、数据库位置与 Domain 路由。Convivium 不携带物理存储实现、不覆盖 Host 默认介质，也不提供调用方可指定的存储路径。
- 一次 command 的领域状态、事件、receipt 和 outbox 必须原子提交；外部副作用在提交后执行。事实源、存储与恢复边界由 [Meeting Design](../30-designs/MEETING-DESIGN.md) 和 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 定义。
- 首次发布使用 SQLite，禁止数据和 schema migration，不实现开发期介质迁移或已有版本升级，不自动清理开发者数据。持久化记录保留 `formatVersion` 用于校验当前格式；不读取、转换、双写或回写 legacy 格式；具体读取与拒绝边界由 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 定义。
- MeetingTask 属于 MeetingState；领域只消费 Agent 明确提交的边界结果和授权投影，不能从内部 Tool Schema、调用顺序、隐藏推理或 DSH Session log 推导当前事实。
- DSH 原生 tool/session events 由 DSH 定义和持久化；Convivium 不复制或扩展其语义，也不向 DSH Session 写入插件自定义持久化事件。会议领域事件保存在会议 commit 内。
- Frontend 与开发者 Markdown 只能单向读取已提交投影。Markdown 不是产品接口，不参与恢复、授权、状态计算、Session 清理或归档完成；人工编辑、缺失或滞后不回写会议事实。边界见 [Meeting Design](../30-designs/MEETING-DESIGN.md) 和 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Dependency Rules

- 必须保持 Domain、DSH adapter、Repository 和 UI projection 的模块边界；Domain 不依赖 Protocol、DSH、Repository、UI 或文件系统，Frontend 只依赖公开 Protocol 和生成的 Remote contract，不引用后端实现。
- Runtime、tools、Web transport 和 recovery 共用受控领域写入口；Repository 不执行调度或 DSH 调用，projection 不能反向驱动状态转换。边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。
- 新增 Web 路由、工具、事件、外部访问或文件权限前，必须先形成接口契约和失败语义。
- Host/Client、业务与验证同属 `plugin/`，独立安装、构建和验证；仓库 `docs/` 不参与插件打包。同包角色资源是静态部署资源，不是第二工程或 Runtime installer；发行结构和验证入口见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Import Paths

- `plugin/src/` 内禁止使用 `../`、`../../` 等父级相对模块路径，必须使用 `@/`；适用于普通导入、类型导入、重新导出和动态 `import()`。例如 `src/runtime/` 导入 `../domain/index.js` 必须写为 `@/domain/index.js`。跨模块引用同时遵守下节公开入口约束，模块内引用保持原目标文件。
- 同目录和子目录的 `./` 引用在符合公开入口规则时保留；保留 `.js` 扩展名，不改变导入符号的实现归属。
- `plugin/tests/` 引用 `src/` 必须使用 `@/`；测试 fixture 和辅助文件之间允许使用相对路径，`@/` 不指向测试目录。
- `plugin/scripts/` 中直接由 Node 执行的脚本不使用 TypeScript 路径别名；文件系统路径和 `new URL(..., import.meta.url)` 不属于模块导入规则。
- `plugin/eslint.config.js` 强制检查上述源码引用和测试静态导入。不得通过禁用 lint、扩大例外或创建转发文件绕过规则。

### Public Module Entrypoints

- `client`、`domain`、`dsh`、`projection`、`protocol`、`remote`、`runtime`、`tools` 通过自身 `index.ts` / `index.tsx` 对其他生产源码公开符号。Web transport 的边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。源码模块公开不等于 package 对外导出；生成器使用的纯类型 package 子路径不授权跨模块导入源码内部文件。
- 跨模块导入必须使用 `@/<module>/index.js`；`src/` 根目录装配可保留等价的 `./<module>/index.js`。普通导入、类型导入、重新导出和动态导入遵循同一边界。不得用别名或相对路径直接访问另一个模块的内部文件。
- 模块内部可以直接引用自身文件，无须经由自身入口；`domain/transitions/` 和 `runtime/application-service/` 属于各自顶层模块内部，不因有 `index.ts` 就成为独立封装单元。`repository`、`role-composition` 尚无入口，不为本规则新增转发文件。
- 测试可以直接引用被测模块内部文件；直接执行的 Node 脚本继续遵守既有运行和路径约束。
- 入口缺少外部所需符号时，先核对当前调用依据和模块职责，只显式补充必要导出，不批量公开 internal。当前 Protocol 公开请求序列化函数；函数实现和 port ownership 保留在原文件。
- ESLint 使用固定模块列表按导入方作用域应用内置规则；新增或改变模块入口时同步更新本节与配置。

## Undecided Architecture

用户可以从源码构建 tarball，或从 npm registry 获取已发布的同版本 tarball；两者进入相同的 DSH profile 安装、Host 依赖和角色部署流程。npm registry、发布版本和高于固定依赖版本的兼容策略仍须由发布流程明确，不得从当前安装验证推断。
