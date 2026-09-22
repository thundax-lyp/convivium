# DSH 跨专题术语与边界

本文固定于 `dsh-v0.1.2-rc.1`，用于跨专题讨论时消除同名概念、确认 owner，并路由到完整契约。它不是 API 索引，也不定义新的默认值、生命周期或完成语义；表中“详见”所指专题仍是实现和验收的直接依据。

## 应用与 Agent 组合

| 术语 | 本 Skill 中的含义 | 不等于 | Owner 与详见 |
| --- | --- | --- | --- |
| Profile | 选择应用入口及其插件、bundle、patch 和配置组合 | Agent Preset；单个插件的运行时配置 | 应用装配；[组合、配置与凭证](composition-config-credentials.md) |
| bundle | 可复用的插件与配置组合，可被 Profile 选用 | 完整应用入口；Agent Preset | 应用装配；[组合、配置与凭证](composition-config-credentials.md) |
| Agent Preset | 选择或约束 Agent 运行所需的模型、工具和相关能力组合 | Profile；Persona | Agent 组合；[Preset、Persona 与 Context](presets-context.md) |
| Persona | 贡献角色、语气或行为提示的 prompt 资产 | Profile；能力 Provider；权限策略 | Agent 组合；[Preset、Persona 与 Context](presets-context.md) |

## 插件、能力与生命周期

| 术语 | 本 Skill 中的含义 | 不等于 | Owner 与详见 |
| --- | --- | --- | --- |
| Cordis Context | Service、事件与生命周期 effect 的容器和可见性边界 | Agent 的 prompt context；业务状态仓库 | Cordis runtime；[Cordis 生命周期](cordis-lifecycle.md) |
| Service Definition | Provider-neutral 的能力契约和 Service key | 具体 Provider；Agent Definition | 能力接缝；[能力接缝与 Provider](capability-seams-providers.md) |
| Provider | 实现并注册某个 Service Definition 的插件或模块 | Consumer；Definition 本身 | Provider 插件；[能力接缝与 Provider](capability-seams-providers.md) |
| Consumer | 依赖 Definition 使用能力、但不依赖具体 Provider 的插件或模块 | Provider；装配入口 | Consumer 插件；[能力接缝与 Provider](capability-seams-providers.md) |
| scope | Cordis 中的服务可见性、继承和生命周期边界 | 授权边界；业务层级；Session 归属 | Cordis runtime；[作用域注册](scoped-registration.md) |
| fiber | 拥有一组激活态资源和 teardown 的生命周期单元 | OS thread；任务队列；业务 Workflow | Cordis runtime；[Cordis 生命周期](cordis-lifecycle.md) |
| Cordis effect | 随生命周期建立并由 owner 清理的副作用注册 | 业务 effect；领域事件；任意异步操作 | 注册它的 Context/fiber；[Cordis 生命周期](cordis-lifecycle.md) |

未加限定的 `Definition` 在能力接缝语境中指 Service Definition；若讨论 Agent 角色或产品数据，必须写出完整名称，不能沿用同一 owner 或生命周期。

## 状态、回放与完成

| 术语 | 本 Skill 中的含义 | 不等于 | Owner 与详见 |
| --- | --- | --- | --- |
| Session event | 可进入 Session log、参与回放并可能成为模型历史的事实 | 插件私有数据库记录；派生视图 | Session log；[状态归属与投影](storage-projections.md) |
| Storage Domain | 插件自有、可跨 Session 或不属于模型历史的持久状态空间 | Session log；临时缓存 | 对应插件；[状态归属与投影](storage-projections.md) |
| Session projection | 从 Session 事实派生、供读取使用的视图 | 新的事实源；可独立修改的业务状态 | projection contributor/reader；[状态归属与投影](storage-projections.md) |
| cache | 可丢失并能从权威事实重建的加速数据 | 权威持久状态；恢复依据 | 使用该缓存的插件；[状态归属与投影](storage-projections.md) |
| input acceptance | 输入已被接受或入队，并可返回相应 id | Agent turn 已结束；业务目标已完成 | 接受输入的接口；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| Agent completion | 一次 Agent 请求或 turn 已停止并产生结果 | 领域写入已提交；端到端业务验收通过 | Agent runtime；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| business completion | 产品或插件定义的权威状态已满足其完成条件 | input acceptance；仅有模型文本输出 | 业务插件及其事实源；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |

## 交互、委派与远程边界

| 术语 | 本 Skill 中的含义 | 不等于 | Owner 与详见 |
| --- | --- | --- | --- |
| Tool | 暴露给模型调用、返回规范结果的能力入口 | 面向人的 command；任意 UI action | Tool Provider；[模型工具](tools.md) |
| Human command | 用户直接触发的命令入口 | 模型 Tool call；自然语言审批 | command 插件；[人机交互](human-interaction.md) |
| UserQuestions | 向用户收集业务选择或自由文本的结构化交互 | Approval；持久授权 | 发起问题的交互流程；[人机交互](human-interaction.md) |
| Approval | 对当前敏感动作给出允许或拒绝的决策 | 长期凭证；通用业务问答；角色授权 | approval/permission 边界；[人机交互](human-interaction.md) |
| authorization / credential | 访问外部资源所需的权限与凭证接缝 | 单次 Approval；普通配置值 | 凭证 Provider 与宿主安全边界；[人机交互](human-interaction.md) |
| one-shot Subagent | 一次性委派任务并等待单次结果 | 可继续对话的 child；Workflow | Agent runtime；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| continuable child | 保留标识，可被后续消息继续驱动的子 Agent | 一次性 Subagent；自动化 Workflow | Agent runtime；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| Workflow | 显式编排步骤、状态和转移的流程 | 任意多 Agent 对话；实验性 Agent Teams | Workflow runtime；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| Agent Teams | 目标基线中的实验性多 Agent 协作能力 | 默认稳定能力；Workflow 的同义词 | experimental package；[Agent、Subagent 与 Workflow](agent-subagent-workflow.md) |
| Remote method | Client 发起并等待结果的 Host 调用边界 | 持久事件；可取消异步流 | Typert Remote API；[Typert 远程 API](typert-remote-api.md) |
| Remote stream | 可异步传输并具有取消或可用性语义的远程载体 | Session 回放；断线后的持久补发 | Typert Remote API；[Typert 远程 API](typert-remote-api.md) |
| forwarded Remote event | Host 选择并转发给 Client 的事件 | method result；可靠持久消息队列 | Typert Remote API；[Typert 远程 API](typert-remote-api.md) |
