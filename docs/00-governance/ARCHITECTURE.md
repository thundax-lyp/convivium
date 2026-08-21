# Architecture

## Purpose

本文档定义 Convivium 当前已经确认的仓库级技术边界和依赖约束。本文不替代产品需求、接口契约或模块设计，也不把讨论中的候选方案视为既定技术决策。

## Scope

- 桌面应用、会议运行时和 ACP Agent 之间的职责边界。
- Electron Main、Preload 和 Renderer 的安全边界。
- Agent 身份与 ACP Session 的隔离原则。
- 新增顶层工程或跨进程依赖时必须遵守的约束。

## Confirmed Baseline

- Convivium 是独立应用，不是现有 Skill 的运行时扩展。
- 桌面载体使用 Electron，核心开发语言使用 TypeScript。
- 应用包含清晰分离的前台界面和后台运行能力。
- ACP Agent 是独立运行主体，拥有独立 Prompt、Skills、工作目录、模型、MCP、权限、运行模式和 ACP Session。
- Agent Session 必须支持暂停、恢复、取消和关闭等生命周期操作。

## Runtime Boundaries

### Electron Main

- 管理桌面应用、窗口和操作系统集成生命周期。
- 监管后台运行能力的启动和关闭，但不在 Renderer 中暴露任意进程控制能力。
- 只通过明确、可校验的协议向 Preload 提供必要能力。

### Electron Preload

- 提供类型化、白名单化的 Renderer 桥接接口。
- 不提供任意命令执行、任意文件读取或未约束的进程访问能力。
- 对来自 Renderer 的输入执行边界校验，并保持调用方身份和权限上下文。

### Electron Renderer

- 承载角色管理、会议现场、人类托管控制以及 Agent 和 Session 状态展示。
- 不直接启动或控制 ACP Agent 进程。
- 不直接访问持久化实现、敏感配置或任意文件系统路径。
- 不承担会议领域状态和权限判定的最终责任。

### Meeting Runtime

- 承担会议生命周期、Participant、发言权、人类委托、ACP Session、持久化和实时事件等后台职责。
- 必须与 Renderer 保持可测试的协议边界。
- 是否作为独立 Meeting Server 进程以及是否支持 Headless 启动，仍是待决事项。

### ACP Agent Processes

- 每个 Agent 通过 ACP 作为独立运行主体接入。
- Skills 和 System Prompt 的具体加载由 Agent 实现决定；Convivium 不假定所有 Agent 采用相同内部机制。
- ACP 适配层负责标准化 Session 创建、Prompt、事件、权限和生命周期，而不是统一 Agent 的内部实现。

## Identity And Session Isolation

- 调度器选择的是会议中的 Participant，不是底层 Agent 实例。
- RoleDefinition、AgentProfile、Participant、Controller 和 ACP Session 必须保持概念分离。
- 同一个 Agent 同时代表自身角色和受托人类席位时，必须使用不同 ACP Session。
- 不同会议、不同身份或不同授权范围的上下文不得通过共享 Session 静默混合。
- 代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。

## Dependency Rules

- Renderer 只能依赖公开的类型化桥接契约，不能依赖后台实现细节。
- 会议领域规则不能依赖 Electron UI 组件。
- ACP Agent 适配不能成为会议领域对象或身份模型的真相源。
- 持久化、传输和具体 ACP SDK 应作为可替换实现，不反向定义核心领域语义。
- 新增跨进程通信、外部访问或文件权限前，必须先形成对应接口契约和失败语义。

## Undecided Architecture

以下内容尚未确认，不得从本文推断为既定方案：

- Monorepo 的具体工具和顶层源码目录。
- Meeting Runtime 是否独立为 Meeting Server，以及是否支持 Headless。
- Electron 与 Meeting Runtime 使用 IPC、HTTP、WebSocket 或组合通信。
- SQLite、PostgreSQL 或其他持久化方案。
- ACP Runtime 使用的具体 SDK 或封装。
- 是否采用 LangGraph.js 或其他工作流框架。
- 是否 Fork、复用或仅参考 Crewly 等外部项目。
- 第一版是本地单用户应用还是支持远程多用户部署。

## Document Routing

- 产品行为和验收标准：`docs/10-requirements/`。
- 跨进程、ACP、事件、配置和数据契约：`docs/20-interfaces/`。
- 模块结构、状态机和专项方案：`docs/30-designs/`。
- 实现覆盖和运行验证：`docs/40-readiness/`。
- 启动、诊断、恢复、升级和发布操作：`docs/50-operations/`。
- 产品讨论、外部调研和决策背景：`docs/60-human/`。
