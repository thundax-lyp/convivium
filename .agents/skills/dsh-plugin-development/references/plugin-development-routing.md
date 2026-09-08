# 插件开发路由

本索引用于 `dsh-v0.1.2-rc.1` 的离线参考库。按任务结果选择入口，不按文件名顺序通读；后面的表是检索索引，不是必读清单。事实优先级：公开类型与实现 → 可执行门禁 → 行为测试 → 所属包 README → 其他文档。

## 阅读流程

1. **确认基线与目标。** 检查目标版本、目标仓库贡献规则及现有实现。确定要改变的可观察行为及其所属包；不把后续版本 API 套进当前基线。
2. **选主路径。** 在下表选与当前结果最直接相关的一行，按“先读”进入。复合任务可选多行，合并重复前置；不要预先加载整组文档。
3. **先契约，后骨架。** 阅读文档开头的适用范围与导航，再读相关完整章节，包括同一契约的失败、取消、权限、持久化、恢复与清理。跨章节的这些约束不能因为按需阅读而跳过。
4. **条件补读。** 只在实现确实触及第三列或横切条件时继续。链接是定位线索，不自动构成新的必读依赖；已读且未变的内容不用重复加载。
5. **转入实现与验证。** 能确定 owner、公开接口、失败/资源边界和验证方式后停止扩展阅读，检查目标实现并动手；发现具体缺口再回查对应章节。验证清单应在设计时选好，完成后执行。

首次编写或改变 Cordis 插件注册时，先读[架构与插件形式](cordis-lifecycle.md#架构与插件形式)和[生命周期与 effect](cordis-lifecycle.md#生命周期与-effect)。仅改现有文案、配置值或纯转换逻辑时，不要求重读整套生命周期资料。

## 选择主路径

### 工具、模型与执行能力

| 用户要改变的结果                               | 先读                                                                         | 条件补读                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新增模型工具或改变执行/结果                    | [Tools](tools.md)：职责与策略，再读结果/replay、展示意图和骨架               | 修改已有工具先用[内置工具](builtin-tool-contracts.md)定位工具族；Native/PTC、restriction、timeout 变更读 Tools 对应章节                          |
| 替换已有工具实现或调整工具选型                 | [内置工具契约](builtin-tool-contracts.md)：能力与 owner，再选对应行为段      | 改 schema/执行/渲染再读[Tools](tools.md)；文件、Jobs、PTY 等按工具表链接补读                                                                     |
| 定义 Service/Provider 或替换实现               | [能力接缝](capability-seams-providers.md)：三角色、选择与失败、Provider 边界 | 同时阅读该能力对应的下列专题；新包才补[包规范](package-authoring.md)                                                                             |
| 实现 LLM Adapter、stream/replay 或 retry       | [LLM Adapter](llm-provider-adapters.md)：职责与流式契约，再看骨架和验证      | 内置 route、模型/effort、图像 Files 配置读[模型路由](llm-model-routing.md)                                                                       |
| 调整已有模型、认证或图像请求                   | [模型路由](llm-model-routing.md)：Service 边界，再选 DeepSeek 或 pi-ai       | 改 Adapter 协议或官方请求字段读[LLM Adapter](llm-provider-adapters.md)；账号 flow 读[授权](credentials-authorization.md)                         |
| 读写文件、观察版本或限制文件操作               | [文件系统策略](filesystem-policy.md)                                         | 图片和进程路径映射读[运行时资源](runtime-resources.md)；修改 shell confinement 再读[权限与 Sandbox](human-interaction.md#plan权限预设与-sandbox) |
| 图片附件、Spill、Subprocess、Shell 或 Terminal | [运行时资源](runtime-resources.md)：按开头导航选完整能力段                   | 发布后台 handle 读[Jobs](jobs-background-work.md)；实现异步资源 owner 读[防御性生命周期](defensive-lifecycle.md)                                 |
| LSP 或 MCP 集成                                | [运行时资源](runtime-resources.md)：LSP 段，或连续读取 MCP 两段              | 修改工具 schema/输出读[Tools](tools.md)；MCP 不桥接的协议能力不能自行假定存在                                                                    |
| E2B 或远程文件/进程执行                        | [远程执行](remote-execution.md)：三包组合，再读路径和终止边界                | 改公共文件/进程契约时分别补[文件策略](filesystem-policy.md)与[运行时资源](runtime-resources.md)                                                  |
| 后台任务、输出收集和完成通知                   | [Jobs](jobs-background-work.md)：准入 → Producer 状态 → 输出与通知           | Producer 是子进程/PTY 时补[运行时资源](runtime-resources.md)；工具暴露读[Tools](tools.md)                                                        |
| 出站 Web 搜索、抓取或网络策略                  | [Web 能力](web-capabilities.md)：选择 → 请求 → 网络边界                      | 新 Provider 读[能力接缝](capability-seams-providers.md)；这不属于入站 Webhook 路径                                                               |

### Agent、上下文与持久状态

| 用户要改变的结果                                                 | 先读                                                                                      | 条件补读                                                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 创建、恢复、输入或调度                                     | [Agent 生命周期](agent-subagent-workflow.md#agent-生命周期)及后续创建/publication 章节    | 改 queue/steer/inject 或输入事实时读[Agent 输入](session-durable-context.md#agent-输入选择)                                             |
| Subagent、亲子消息、Workflow 或实验 Teams                        | [Agent/Subagent](agent-subagent-workflow.md)：按导航选择对应契约                          | one-shot 先核对 Provider flags；修改 workflow/ralph 工具读[内置工具](builtin-tool-contracts.md#workflow-与-ralph)；普通委派不必读 Teams |
| Prompt、runtime context 或新的 Session 事实                      | [Session 与持久上下文](session-durable-context.md)：事实源，再选 Prompt、event 或输入章节 | 按 scope 注册读[作用域](scoped-registration.md)；实际改压缩/恢复才读[上下文恢复](context-recovery.md)                                   |
| Preset、Persona、workspace instructions、时间上下文              | [Preset 与 Context](presets-context.md)：选择相应能力段                                   | 改模型可见持久事实读[Session](session-durable-context.md)；改组合共享/可见性读[作用域](scoped-registration.md)                          |
| Skill discovery、正文加载或调用策略                              | [Skill Provider](skill-providers.md)：发现 → 调用资格 → 模型目录                          | 改 Prompt/event 的记录方式读[Session](session-durable-context.md)                                                                       |
| Compaction、TokenMeter、checkpoint 或 crash recovery             | [上下文恢复](context-recovery.md)                                                         | 不熟悉 log 与 surface 区别时先读[Session 事实源](session-durable-context.md#持久事实源)；不把 flush 当外部效果 exactly-once             |
| 插件持久数据、Session projection、cache、统计或 feedback sidecar | [Storage 与 Projection](storage-projections.md)：先做三类状态选择，再按导航读分支         | 新增权威 Session event 先读[Session](session-durable-context.md)；不为查询需求复制一份事实源                                            |
| 冷查询、全文索引、trace 或日志导出                               | [Session 查询](session-query-index.md)                                                    | 改 live/history carrier 读[Session/Workspace API](session-workspace-api.md)；改 cache/fold 读[Projection](storage-projections.md)       |
| Plan、Goal、Todo 或提醒                                          | [规划与调度](planning-scheduling.md)：按意图表选分支                                      | Schedule 必须连读时间和 live/fork/durability；改实际权限才补[人类交互](human-interaction.md)                                            |

### 人类交互、Client 与集成

| 用户要改变的结果                                     | 先读                                                                              | 条件补读                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Human command、业务提问或单次动作审批                | [人类交互](human-interaction.md)：机制选择，再读命中机制与证据                    | 只有修改权限预设/Sandbox 才进入该分支；账号登录不是单次审批，走[授权](credentials-authorization.md)                          |
| Credential record、账号 flow、登录与取消             | [凭证与授权](credentials-authorization.md)                                        | UI 设置入口补[用户设置](user-settings.md)；普通 env reference 使用[凭证所有权](composition-config-credentials.md#凭证所有权) |
| Claude Code/Codex hooks                              | [Hooks](hooks-compatibility.md)：支持点、决策和未实现协议                         | 改事件持久化补[Session](session-durable-context.md)；外部协议要求不能代替当前已实现契约                                      |
| Client slot、component、store、action、locale 或主题 | [Client UI](client-ui.md)                                                         | 设置卡片补[用户设置](user-settings.md)；会话行使用下一行，不自行扫描日志造第二份状态                                         |
| Conversation Node 与历史展示                         | [Conversation Node](client-conversation-nodes.md)：事件族 → 增量 → packed history | 新 Client 插件先读[Client UI](client-ui.md)；改变权威 event 时补[Session](session-durable-context.md)                        |
| Session/Workspace 命令、历史、分页与重连             | [应用 API](session-workspace-api.md)                                              | 改底层 Remote descriptor/carrier 再读[Typert](typert-remote-api.md)；冷索引读[Session 查询](session-query-index.md)          |
| 新 Remote method、stream 或选定事件转发              | [Typert Remote API](typert-remote-api.md)                                         | 新增 Client 消费端读[Client UI](client-ui.md)；先复用现成 Session/Workspace API，避免重复暴露控制面                          |
| SDK launcher、Python 分发或 ACP 协议                 | [SDK/ACP](sdk-acp-integration.md)：按导航先启动/结果，再看协议                    | 改应用装配读[组合配置](composition-config-credentials.md)；只消费 SDK 不要求先读 Typert 实现                                 |
| WebServer、入站 Webhook 或签名验证                   | [Web ingress](web-ingress.md)                                                     | 新协议 adapter 补[能力接缝](capability-seams-providers.md)及[组合测试](composition-config-credentials.md#组合测试步骤)       |
| 动态 Cordis define/run、inspection 或 Client half    | [动态 Cordis](dynamic-cordis.md)：发现 → Package/Run → Client                     | 仅在确实使用 Client half 时补[Client UI](client-ui.md)；遵守精确 run 与清理边界                                              |
| Host 环境、目录选择、inventory 或实验平台            | [Host 支持](host-platform-support.md)：按目标能力选段                             | 平台进程行为补[运行时资源](runtime-resources.md)；实验入口不能按稳定 Node/默认 profile 推断                                  |

## 叠加横切路径

以下能力也可以直接成为主任务。先阅读会影响接口和数据设计的前置，再写代码；不在实现完后才发现 owner 或持久化选错。

| 触发条件                                | 阅读顺序                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 新建/拆分包或改变 exports/build faces   | [包规范](package-authoring.md)：包文件与 Host/Client 编译面 → 骨架 → invariant/README 规则                                                       |
| 注册/隔离/shadow/re-parent 的作用域改变 | [Cordis 生命周期](cordis-lifecycle.md) → [Scoped 注册](scoped-registration.md) → 所属能力契约                                                    |
| 新增长期异步资源或修改 teardown         | [生命周期与 effect](cordis-lifecycle.md#生命周期与-effect) → [防御性生命周期](defensive-lifecycle.md) → 具体资源 Provider                        |
| 新增持久事实或改变恢复关系              | [Session 事实源](session-durable-context.md#持久事实源) → [三类状态选择](storage-projections.md#三类状态的选择) → 选中 owner 的完整提交/恢复契约 |
| 修改 Profile、bundle、boot 或配置       | [组合配置](composition-config-credentials.md)：组合所有权 → 相关 profile/配置 → 组合测试                                                         |
| 用户可编辑 Settings 或设置卡片          | [用户设置](user-settings.md)：Config/Settings/Credential 区别 → Host namespace → 有 UI 时再读 Browser 卡片                                       |

## 验证与停止条件

在实现前从[按变更面选择证据](testing-docs-maintenance.md#按变更面选择证据)和[验证命令矩阵](testing-docs-maintenance.md#验证命令矩阵)确定检查；实现后运行选中的验证，并补齐发生变化的公开文档。当前任务能回答以下问题时，不再为了“读全”加载其他专题：

- 行为由哪个包、Service/Provider/Consumer 和生命周期 owner 负责？
- 使用哪些公开接口，输入/结果/权限及失败、取消、清理如何处理？
- 模型可见或跨重启事实由谁记录，回放/恢复有什么边界？不涉及持久事实时明确不适用。
- 哪些实际检查能覆盖组合后的行为，哪些仍未验证？

生成 catalog 只用于发现，修改其源并运行所属生成器；只在相关源码或 README 指向时读取 Agent Note，Archived note 不作为当前要求。示例、实验包和外部协议不自动扩大任务范围或授权。

## 维护路径

只有维护本 Skill、升级基线或审计参考依据时使用此路径。先读[Skill 发布维护](testing-docs-maintenance.md#skill-发布维护)与[完整性审计](testing-docs-maintenance.md#完整性审计)，再按待核对专题进入[source-map](source-map.md)，读取精确 tag 的类型、实现、测试与文档。

普通插件开发无需通读 source-map。单专题维护只查该专题及实际依赖；完整基线升级才按维护流程遍历全部证据和 DOCS，不能把普通开发的按需阅读规则用来跳过升级审计。
