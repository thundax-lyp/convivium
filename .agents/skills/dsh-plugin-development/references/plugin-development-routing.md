# 插件开发路由

需要先看完整实例时，阅读 [HOW-TO：用 DSH 组合事件驱动的应用](how-to-build-event-driven-app.md)，沿上游 GitHub 自动评审案例理解选型与装配。

本索引用于 `dsh-v0.1.2-rc.1` 的离线参考库。按任务结果选择入口，不按文件名顺序通读；后面的表是检索索引，不是必读清单。事实优先级：公开类型与实现 → 可执行门禁 → 行为测试 → 所属包 README → 其他文档。

## 选择任务与阅读范围

范围或验收未明确时转入[需求澄清](requirements-discovery.md)；需要能力选型和应用方案时转入[应用设计](application-design.md)。只有实现任务继续执行下面的开发流程。

1. 确认目标版本、仓库规则和要改变的可观察行为。
2. 从主路径表选择直接相关的专题。复合任务可选多项，合并重复前置。
3. 按专题开头的阅读导航和条件补读确定范围；连同失败、取消、权限、持久化、恢复与清理一起读取完整契约。
4. 仅在触及下方横切条件时补读相应资料。已能确定职责、公开接口、资源边界和验证方式时，停止扩展阅读并实施；发现具体缺口再回查。

首次编写或改变 Cordis 插件注册时，先读[架构与插件形式](cordis-lifecycle.md#架构与插件形式)和[生命周期与 effect](cordis-lifecycle.md#生命周期与-effect)。仅改现有文案、配置值或纯转换逻辑时，不要求重读整套生命周期资料。

## 选择主路径

### 工具、模型与执行能力

| 用户要改变的结果 | 先读 |
| --- | --- |
| 新增模型工具或改变执行/结果 | [Tools](tools.md)：职责与策略，再读结果/replay、展示意图和骨架 |
| 替换已有工具实现或调整工具选型 | [内置工具契约](builtin-tool-contracts.md)：能力与 owner，再选对应行为段 |
| 定义 Service/Provider 或替换实现 | [能力接缝](capability-seams-providers.md)：三角色、选择与失败、Provider 边界 |
| 实现 LLM Adapter、stream/replay 或 retry | [LLM Adapter](llm-provider-adapters.md)：职责与流式契约，再看骨架和验证 |
| 调整已有模型、认证或图像请求 | [模型路由](llm-model-routing.md)：Service 边界，再选 DeepSeek 或 pi-ai |
| 读写文件、观察版本或限制文件操作 | [文件系统策略](filesystem-policy.md) |
| 图片附件、Spill、Subprocess、Shell 或 Terminal | [运行时资源](runtime-resources.md)：按开头导航选完整能力段 |
| LSP 或 MCP 集成 | [运行时资源](runtime-resources.md)：LSP 段，或连续读取 MCP 两段 |
| E2B 或远程文件/进程执行 | [远程执行](remote-execution.md)：三包组合，再读路径和终止边界 |
| 后台任务、输出收集和完成通知 | [Jobs](jobs-background-work.md)：准入 → Producer 状态 → 输出与通知 |
| 出站 Web 搜索、抓取或网络策略 | [Web 能力](web-capabilities.md)：选择 → 请求 → 网络边界 |

### Agent、上下文与持久状态

| 用户要改变的结果 | 先读 |
| --- | --- |
| Agent 创建、恢复、输入或调度 | [Agent 生命周期](agent-subagent-workflow.md#agent-生命周期)及后续创建/publication 章节 |
| Subagent、亲子消息、Workflow 或实验 Teams | [Agent/Subagent](agent-subagent-workflow.md)：按导航选择对应契约 |
| Prompt、runtime context 或新的 Session 事实 | [Session 与持久上下文](session-durable-context.md)：事实源，再选 Prompt、event 或输入章节 |
| Preset、Persona、workspace instructions、时间上下文 | [Preset 与 Context](presets-context.md)：选择相应能力段 |
| Skill discovery、正文加载或调用策略 | [Skill Provider](skill-providers.md)：发现 → 调用资格 → 模型目录 |
| Compaction、TokenMeter、checkpoint 或 crash recovery | [上下文恢复](context-recovery.md) |
| 新增或替换持久存储介质 | [Storage Backend](storage-backend-development.md)：接口、注册、激活与一致性验证 |
| 插件持久数据、Session projection、cache、统计或 feedback sidecar | [Storage 与 Projection](storage-projections.md)：先做三类状态选择，再按导航读分支 |
| 冷查询、全文索引、trace 或日志导出 | [Session 查询](session-query-index.md) |
| Plan、Goal、Todo 或提醒 | [规划与调度](planning-scheduling.md)：按意图表选分支 |

### 人类交互、Client 与集成

| 用户要改变的结果 | 先读 |
| --- | --- |
| Human command、业务提问或单次动作审批 | [人类交互](human-interaction.md)：机制选择，再读命中机制与证据 |
| Credential record、账号 flow、登录与取消 | [凭证与授权](credentials-authorization.md) |
| Claude Code/Codex hooks | [Hooks](hooks-compatibility.md)：支持点、决策和未实现协议 |
| Client slot、component、store、action、locale、主题或 UI Primitives 复用 | [Client UI](client-ui.md)：按阅读导航选择集成或组件复用路径 |
| Conversation Node 与历史展示 | [Conversation Node](client-conversation-nodes.md)：事件族 → 增量 → packed history |
| Session/Workspace 命令、历史、分页与重连 | [应用 API](session-workspace-api.md) |
| 新 Remote method、stream 或选定事件转发 | [Typert Remote API](typert-remote-api.md) |
| SDK launcher、Python 分发或 ACP 协议 | [SDK/ACP](sdk-acp-integration.md)：按导航先启动/结果，再看协议 |
| WebServer、入站 Webhook 或签名验证 | [Web ingress](web-ingress.md) |
| 动态 Cordis define/run、inspection 或 Client half | [动态 Cordis](dynamic-cordis.md)：发现 → Package/Run → Client |
| Host 环境、目录选择、inventory 或实验平台 | [Host 支持](host-platform-support.md)：按目标能力选段 |

## 叠加横切路径

以下能力也可以直接成为主任务。先阅读会影响接口和数据设计的前置，再写代码；不在实现完后才发现 owner 或持久化选错。

| 触发条件 | 阅读顺序 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新建/拆分包或改变 exports/build faces | [包规范](package-authoring.md)：包文件与 Host/Client 编译面 → 骨架 → invariant/README 规则 |
| 注册/隔离/shadow/re-parent 的作用域改变 | [Cordis 生命周期](cordis-lifecycle.md) → [Scoped 注册](scoped-registration.md) → 所属能力契约 |
| 新增长期异步资源或修改 teardown | [生命周期与 effect](cordis-lifecycle.md#生命周期与-effect) → [防御性生命周期](defensive-lifecycle.md) → 具体资源 Provider |
| 新增持久事实或改变恢复关系 | [Session 事实源](session-durable-context.md#持久事实源) → [三类状态选择](storage-projections.md#三类状态的选择) → 选中 owner 的完整提交/恢复契约 |
| 修改 Profile、bundle、boot 或配置 | [组合配置](composition-config-credentials.md)：组合所有权 → 相关 profile/配置 → 组合测试 |
| 用户可编辑 Settings 或设置卡片 | [用户设置](user-settings.md)：Config/Settings/Credential 区别 → Host namespace → 有 UI 时再读 Browser 卡片 |

## 验证与停止条件

在实现前从[按变更面选择证据](testing-docs.md#按变更面选择证据)和[验证命令矩阵](testing-docs.md#验证命令矩阵)确定检查；实现后运行选中的验证，并补齐发生变化的公开文档。当前任务能回答以下问题时，不再为了“读全”加载其他专题：

- 行为由哪个包、Service/Provider/Consumer 和生命周期 owner 负责？
- 使用哪些公开接口，输入/结果/权限及失败、取消、清理如何处理？
- 模型可见或跨重启事实由谁记录，回放/恢复有什么边界？不涉及持久事实时明确不适用。
- 哪些实际检查能覆盖组合后的行为，哪些仍未验证？

生成 catalog 只用于发现，修改其源并运行所属生成器；只在相关源码或 README 指向时读取 Agent Note，Archived note 不作为当前要求。示例、实验包和外部协议不自动扩大任务范围或授权。
