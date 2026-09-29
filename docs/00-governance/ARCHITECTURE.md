# Architecture

## Purpose

本文定义 Convivium 的系统组成、所有权、依赖方向和不可跨越的边界。只有这些边界变化时才更新本文；职责与依赖方向不变的文件移动、目录入口调整和检查配置变更不触发架构更新。具体接线由设计文档维护；工程约定和验证方法见 [Engineering Rules](./ENGINEERING-RULES.md)，文档路由见根 `AGENTS.md`。

## Product Boundary

- Convivium 是使用 TypeScript 独立实现的纯 DSH 插件，只有 `plugin/` 一个可构建、测试和交付的工程；不建立独立 Meeting Server、应用壳、backend 发布单元或根 workspace/monorepo。新增顶层工程前必须在本文明确职责、依赖方向和验证入口。
- 外部项目仅作只读调研，不作为源码基线、运行依赖或兼容目标；不得复制其源码、文档、品牌、协议命名和持久化格式进入产品。
- 当前产品仅服务单个本地 DSH Host 的一位用户。Meeting Web 只在本地用户边界内开放，不虚构 Web 用户或 Team authority。远程、多用户、跨 Host 或网络部署必须先形成独立的身份、授权、隔离和部署契约；具体入口条件见 [Peer Meeting Agents Design](../30-designs/PEER-MEETING-AGENTS-DESIGN.md#captain-caller-and-audit)。
- 插件依赖 DSH 公开能力，不绕过宿主权限或生命周期接口。装配和能力边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Runtime Boundaries

| 边界             | 所有权与限制                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSH Host/profile | 提供插件加载、独立 AgentSession 创建与恢复、Reviewer 一次性 Subagent、Tools、Web/UI 宿主和原生 Session Event；拥有 Preset、Skills、MCP、Sandbox、Approval、模型配置及其安装执行 |
| Meeting Runtime  | 插件后端内的会议领域执行者；拥有 Meeting/Participant/Turn/MeetingTask、发言 capability、Session ownership、持久化和投影，不脱离 DSH 运行                                        |
| Plugin Frontend  | 通过后端公开、类型化且受 Host/identity 边界约束的入口展示会议和执行用户控制；不直接管理 Session、介质、敏感配置或任意文件访问，不判定最终领域状态或权限                         |
| DSH AgentSession | 独立运行主体，拥有独立上下文和能力；其内部推理、Prompt、Skills、Tools、工作流与重试过程由 DSH/Agent 管理，不是会议领域事实源                                                    |

会议工具和 runtime 不依赖 WebServer；Web 服务可用性只影响展示入口，不重建会议能力。无 Web 时的宿主能力要求见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Identity And Session Isolation

- 调度选择的是会议内 Participant。TeamMember、Participant、Manager、Captain 和 AgentSession 保持概念分离；每个具体会议身份使用平级、独立且可持续的 AgentSession，不跨会议、身份或授权范围共享上下文。Captain 是本地用户的控制身份，不是 MeetingIdentity、Participant 或这些 Session 的 DSH parent；Reviewer 的一次性审核 worker 仍可作为其 Subagent 运行。
- Captain 是当前本地用户的会议控制身份，可信用户入口提交控制操作；Session 仅可记录输入来源，不承载 Captain 权限。会议 Agent 和投递独立运行，关闭或更换输入 Session、重开面板不影响用户控制。Agent 正式交流仍经 Meeting Runtime，不开放绕过记录的直接互发。
- Manager 只读取 Catalog 安全投影，并通过结构化会议操作对当前 candidate 明确作出 `admit` 或 `reject` 决定；自然语言或目录可用性不构成决定。`admit` 形成不可调度的 provisioning 意图；只有 Runtime 完成独立 Session provisioning 与 durable ownership 后，candidate 才可调度。Manager 不能接纳自己、取得 capability secret、任意创建角色或扩大权限。
- Convivium 拥有 Definition、每角色版本化 AGENTS 身份资源、Catalog snapshot、Manager 决定与 provenance；后续 Catalog 更新不得改变已固化会议事实。AGENTS 声明身份和能力范围，任务方法由可复用 Skill 提供；Definition 绑定精确 AGENTS 资源和 DSH 公开能力。身份指令不能用来假装安装能力，创建前必须验证宿主组合，缺能力时 fail closed。
- DSH 拥有实际 Session 执行与 Host 能力；Convivium 持久绑定会议身份与 Session 所需的资源和模型选择，创建与冷恢复不得擅自改变该绑定。具体字段和失败语义见 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)。
- Convivium 只提供会议身份的授权上限，不扩大用户或 DSH 已授予的权限。代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。
- Session 创建、继续投递、interrupt、恢复与 resident Activation 释放只通过受控 DSH adapter。归档后的持久不可继续语义由 capability revoke 保证，不要求删除 DSH 持久 Session 数据；调用边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## State And Storage Ownership

- Meeting 在任何会议副作用前获得在当前 Convivium Host/profile Storage Domain 中全局唯一且稳定的 `meetingId`；以该 `meetingId` 统一持有 Meeting domain、catalog、Session ownership、归档与开发者 Markdown 的生命周期。当前产品不建立 Team 或 Team authority，目标协议、repository、Session label 与 recovery 不接受或派生 `teamId`；未来引入多 Team 必须先形成独立的身份、授权、隔离和迁移契约。
- Storage Domain 是唯一会议事实源，禁止双写与 fallback。Convivium 只消费 Storage Domain：轻量 catalog 负责发现，每个 Meeting 使用独立 domain；不定位、扫描或依赖 backend 物理布局。
- Host/profile 拥有物理存储介质、数据库位置与 Domain 路由。Convivium 不携带物理存储实现、不覆盖 Host 默认介质，也不提供调用方可指定的存储路径。
- 一次 command 的领域状态、事件、receipt 和 outbox 必须原子提交；外部副作用在提交后执行。事实源、存储与恢复边界由 [Meeting Design](../30-designs/MEETING-DESIGN.md) 和 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 定义。
- 存储格式兼容、迁移和拒读语义由 [Meeting Interface](../20-interfaces/MEETING-INTERFACE.md) 定义；当前部署介质和安装流程由相应设计及操作文档维护。
- MeetingTask 属于 MeetingState；领域只消费 Agent 明确提交的边界结果和授权投影，不能从内部 Tool Schema、调用顺序、隐藏推理或 DSH Session log 推导当前事实。
- DSH 原生 tool/session events 由 DSH 定义和持久化；Convivium 不复制或扩展其语义，也不向 DSH Session 写入插件自定义持久化事件。会议领域事件保存在会议 commit 内。
- Frontend 与开发者 Markdown 只能单向读取已提交投影。Markdown 不是产品接口，不参与恢复、授权、状态计算、Session 清理或归档完成；人工编辑、缺失或滞后不回写会议事实。边界见 [Meeting Design](../30-designs/MEETING-DESIGN.md) 和 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Dependency Rules

- 必须保持 Domain、DSH adapter、Repository 和 UI projection 的模块边界；Domain 不依赖 Protocol、DSH、Repository、UI 或文件系统，Frontend 只依赖公开 Protocol 和生成的 Remote contract，不引用后端实现。
- Runtime、tools、Web transport 和 recovery 共用受控领域写入口；Repository 不执行调度或 DSH 调用，projection 不能反向驱动状态转换。边界见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。
- 新增 Web 路由、工具、事件、外部访问或文件权限前，必须先形成接口契约和失败语义。
- Host/Client、业务与验证同属 `plugin/`，独立安装、构建和验证；仓库 `docs/` 不参与插件打包。同包角色资源是静态部署资源，不是第二工程或 Runtime installer；发行结构和验证入口见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。

## Source Boundaries

源码组织必须保持上述职责、所有权和依赖方向。模块只能通过受控能力协作，内部文件与目录结构不得成为绕过边界的途径。目录入口和导入路径见 [Architecture Rules](./ARCHITECTURE-RULES.md)；具体装配见相应设计文档。只要职责和依赖方向不变，内部重组不要求修改本文。

## Undecided Architecture

用户可以从源码构建 tarball，或从 npm registry 获取已发布的同版本 tarball；两者进入相同的 DSH profile 安装、Host 依赖和角色部署流程。npm registry、发布版本和高于固定依赖版本的兼容策略仍须由发布流程明确，不得从当前安装验证推断。
