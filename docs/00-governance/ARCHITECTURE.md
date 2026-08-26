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
- Convivium 使用 TypeScript 独立实现，不导入或派生外部参考项目源码。
- 唯一可构建产品工程位于仓库顶层 `plugin/`。该目录不使用 Git submodule，也不在构建或运行时引用相邻参考项目工作区。
- Convivium 支持的最低 DSH 版本为 `0.1.1-rc.2`；实现可以依赖该版本 `dsh-subagent` 提供的持久子 Session 枚举和 continuable Activation drain 能力。
- Convivium 正式运行会议前，宿主组合必须提供一个具备 `prepareContinuable` 能力的 continuable subagent provider；仅声明或注入 `dsh-subagent` service 不构成该能力。当前确认的宿主 profile provider 是 `@deepseek-ai/dsh-subagent-spawn-in-process@0.1.1-rc.2`，provider name 为 `spawn`，由 profile 作为组合依赖管理，不由 Convivium 自行实现、隐式携带或写入插件 package manifest。插件必须在独立 DSH profile 中验证该 provider 与 `startContinuable()` 的实际创建链路。
- 插件依赖 DSH 提供 AgentSession、continuable Agent、工具注册、Web 路由、DSH 原生 Session Event 和插件 UI 宿主能力。
- 插件包含清晰分离的插件前端和插件后端会议运行时。
- 每个 Meeting 在任何会议副作用前获得稳定 `meetingId` 和独立目录；状态、事件、幂等收据和 outbox 写入该目录内独立 `meeting.sqlite`。
- Meeting Runtime 可以从 SQLite best-effort 生成供开发者在 workspace 中阅读的 Markdown 辅助文件；Markdown 不是产品接口或事实源，不参与恢复、授权、状态计算、Session 关闭与 capability 撤销或归档完成判断。
- DSH AgentSession 是独立运行主体，拥有独立 Prompt、Skills、工作目录、模型、MCP、权限和运行模式。
- AgentSession 必须支持 followup、interrupt、恢复，以及通过 `drainContinuableChildren` 释放指定会议 Session 的 resident Activation。会议 Session 的持久不可继续语义由 Convivium capability revoke 保证，不要求 DSH 删除持久 Session 数据。

## Runtime Boundaries

### DSH Plugin Host

- 提供插件加载、AgentSession、continuable Agent、工具注册、Web 路由、DSH 原生 Session Event 和前端挂载能力。
- 负责底层 Agent 生命周期和模型调用；会议领域状态不以 DSH Session 内部状态为真相源。
- Convivium 不绕过 DSH 权限和生命周期接口直接控制宿主内部资源。

### Plugin Frontend

- 承载团队、会议现场、人类控制以及 Agent 和 Session 状态展示。
- 只能调用插件后端公开、类型化且经过授权的 Web 路由或工具。
- 不直接管理 AgentSession，不直接访问 SQLite、敏感配置或任意文件系统路径。
- 不承担会议领域状态、发言权和权限判定的最终责任。

### Meeting Runtime

- 作为 DSH 插件后端的一部分，承担会议生命周期、Participant、发言权、AgentSession、持久化和事件投影。
- 必须与 Plugin Frontend 保持可测试的路由和事件边界。
- 不作为独立 Meeting Server，也不要求脱离 DSH 运行。

### DSH Agent Sessions

- 每个会议身份使用独立的 DSH continuable AgentSession。
- DSH 负责 Session 创建、followup、interrupt、事件和生命周期能力。
- Convivium 负责会议身份、上下文投影、发言 capability 和 Session ownership，不把 AgentSession 当作会议领域真相源。
- Convivium 只定义 Agent 之间及 Agent 与 Meeting Runtime 之间的会议协议，不拥有或解释 Agent 内部的 Prompt、Skills、Tools、MCP、推理、命令、工作流和重试过程。
- Agent 内部能力、Sandbox 和 Approval 由 DSH 管理；Convivium 只向 DSH 提供会议身份对应的授权上限，不得扩大用户或 DSH 已授予的权限。

## Identity And Session Isolation

- 调度器选择的是会议中的 Participant，不是底层 Agent 实例。
- TeamMember、Participant、Manager、Captain 和 AgentSession 必须保持概念分离。
- 同一个底层 Agent 表示不同会议身份时，必须使用不同 AgentSession。
- 不同会议、不同身份或不同授权范围的上下文不得通过共享 Session 静默混合。
- 代理发言必须保留 Speaker、实际 Controller、委托范围和确认状态，不能伪装成人类本人。

## Dependency Rules

- Plugin Frontend 只能依赖公开的类型化路由和事件契约，不能依赖插件后端实现细节。
- 会议领域规则不能依赖 DSH UI 组件。
- DSH AgentSession 不能成为 Meeting、Participant、Turn 或权限模型的真相源。
- Convivium 实现必须保持会议领域、DSH Session adapter、持久化和 UI projection 的模块边界。
- Meeting 的 SQLite、开发者 Markdown、Session ownership 和归档数据必须以 `<teamId>/meetings/<meetingId>/` 为共同生命周期边界。
- 会议领域只能消费 Agent 明确提交的边界结果和经授权的 DSH TeamTask 结果，不得依赖具体 Skill、内部 Tool Schema、隐藏推理或工具调用顺序。
- Convivium 不得向 DSH Session 写入插件自定义的持久化事件类型。会议领域事件写入 SQLite `meeting_events`；插件前端只通过定时读取、写操作成功后重新读取和页面重新聚焦后读取完整类型化状态投影，不建立进程内 projection invalidation 通道。
- 开发者 Markdown 只能单向派生自 SQLite。人工修改、文件缺失或旧版本内容不得反向写入会议状态；该文件不形成 Plugin Frontend 或 Agent 可依赖的契约。
- DSH 原生 `tool/call`、`tool/result` 及其他 DSH-owned Session Events 继续由 DSH 定义和持久化；Convivium 不复制、重命名或扩展其语义。
- 新增 Web 路由、工具、事件、外部访问或文件权限前，必须先形成对应接口契约和失败语义。

## Source Layout And Verification

- `plugin/` 包含 DSH 插件 package manifest、后端和前端源码、资产及验证脚本；仓库级 `docs/` 不参与插件打包。
- 根目录不因单一插件工程建立无消费者的 workspace 或 monorepo 层；只有出现第二个独立构建工程并形成架构依据时才可引入。
- `plugin/` 必须能够在不读取任何相邻参考项目的情况下独立安装、类型检查、构建和验证。
- 外部参考项目只用于只读调研 DSH 接口和可选实现思路；其源码、文档、发布记录、品牌、协议命名和持久化格式不得进入产品工程。
- 工程验证入口是 `plugin/package.json` 中的 `typecheck`、`build` 和 `verify`；会议实现必须在这些入口之上增加领域和生命周期测试。

## Undecided Architecture

以下内容尚未确认，不得从本文推断为既定方案：

- 插件分发方式和高于最低版本的兼容策略。
- 是否采用 LangGraph.js 或其他工作流框架。
- 第一版是本地单用户应用还是支持远程多用户部署。

## Document Routing

- 产品行为和验收标准：`docs/10-requirements/`。
- Web 路由、工具、事件、配置和数据契约：`docs/20-interfaces/`。
- 模块结构、状态机和专项方案：`docs/30-designs/`。
- 实现覆盖和运行验证：`docs/40-readiness/`。
- 启动、诊断、恢复、升级和发布操作：`docs/50-operations/`。
- 产品讨论、外部调研和决策背景：`docs/60-human/`。
