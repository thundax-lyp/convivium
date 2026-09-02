# 插件开发路由

本索引指向离线的 rc.2 reference 库。目标仓库说明可以收紧本地实现要求，但不要把 rc.2 之后才出现的 API 引入本 skill 的基线。

事实冲突时按以下顺序裁决：公开类型与运行时代码、执行中的 repository gate、行为测试、所属包 README、其他叙述文档。

## 基线

- 先读[架构与插件形式](cordis-lifecycle.md#架构与插件形式)和[生命周期与 effect](cordis-lifecycle.md#生命周期与-effect)。
- 再定位目标包的局部规则、README、配置和最接近的现有实现。

## 选择主路径

先按用户要求产生的可观察结果选择一条或多条功能入口。只加载命中行涉及的 reference，并完整读取这些文件；表中链接用于定位当前任务最相关的章节。

| 变更                                          | 何时选择                                                                                | 阅读的离线章节                                                                                                                                                                                                                                               | 在目标仓库中检查                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 模型工具                                      | 模型需要主动调用一个具有 JSON 输入和规范 JSON 结果的操作                                | [工具职责](tools.md#工具职责)；[完整定义骨架](tools.md#完整定义骨架)；[策略与观察](tools.md#策略与观察)；[展示意图](tools.md#展示意图)                                                                                                                       | 同类 tool、render intent、策略监听器和组合 fixture                                         |
| Service、Provider 或能力接缝                  | 多个插件需要通过稳定 API 消费可替换实现，而不是调用具体包                               | [三角色接缝](capability-seams-providers.md#三角色接缝)；[设计工作表](capability-seams-providers.md#设计工作表)；[Provider 边界](capability-seams-providers.md#provider-边界)                                                                                 | Definition、所有 Provider 与现有 Consumer                                                  |
| LLM Adapter                                   | 需要把 provider-neutral 模型请求转换为 vendor 请求和流式增量                            | [Adapter 职责](llm-provider-adapters.md#adapter-职责)；[完整 Adapter 入口](llm-provider-adapters.md#完整-adapter-入口)；[凭证与配置](llm-provider-adapters.md#凭证与配置)                                                                                    | Provider replay、凭证解析、catalog 和 transport 测试                                       |
| Agent 生命周期或输入                          | 需要创建或恢复 live Agent，或 queue、steer、inject、interrupt 其输入                    | [Agent 生命周期](agent-subagent-workflow.md#agent-生命周期)；[Agent 输入选择](session-durable-context.md#agent-输入选择)                                                                                                                                     | Agent 所有者、driver、Session event 与取消路径                                             |
| Subagent Provider、控制、TeamTask 或 workflow | 需要委派 child Agent、跨 activation 继续工作、协调 task DAG，或隔离执行 workflow script | [Subagent 接缝](agent-subagent-workflow.md#subagent-接缝)；[Provider 实现清单](agent-subagent-workflow.md#provider-实现清单)；[Workflow 接缝](agent-subagent-workflow.md#workflow-接缝)；[实验性 Agent Teams](agent-subagent-workflow.md#实验性-agent-teams) | Definition/Provider/Consumer 包及真实组合控制路径                                          |
| Prompt、context 或 skill 贡献                 | 新 instruction、动态运行时事实或 skill catalog/body 需要进入模型请求                    | [Prompt section、runtime context 与 skill](session-durable-context.md#prompt-sectionruntime-context-与-skill)；[Agent 输入选择](session-durable-context.md#agent-输入选择)                                                                                   | scoped 注册与模型可见内容的持久日志路径                                                    |
| Human command                                 | 用户需要直接运行不交给模型解释的 `/command`                                             | [机制选择](human-interaction.md#机制选择)；[Human command](human-interaction.md#human-command)                                                                                                                                                               | command definition、scope shadow、attachments、无 turn 的 event pairing、取消与 UI adapter |
| 普通用户提问                                  | tool 或 plugin 必须等待业务选择、表单答案或自由文本后才能继续                           | [机制选择](human-interaction.md#机制选择)；[普通用户提问](human-interaction.md#普通用户提问)                                                                                                                                                                 | live runtime root、UI Provider、结构化答案、取消与 no-provider failure                     |
| 一次动作审批                                  | 敏感动作需要在当前 open turn 中取得一次 allow/reject 决策                               | [机制选择](human-interaction.md#机制选择)；[动作审批](human-interaction.md#动作审批)                                                                                                                                                                         | policy、answerer waterfall、audit pair、取消与 headless fail-closed                        |
| Client UI                                     | Browser 需要向已声明 slot 注入 component、store、action 或 locale                       | [Client UI 插件](client-ui.md#client-ui-插件)                                                                                                                                                                                                                | slot 所有者、同类 browser contribution、Client aggregate 与 GUI 测试通道                   |
| Conversation Node                             | Browser 需要把一族持久 Session event 增量组装成 Chat 业务行或 Turn/Step 数据            | [Conversation Node](client-conversation-nodes.md#conversation-node)；[事件族与 identity](client-conversation-nodes.md#事件族与-identity)；[增量组装](client-conversation-nodes.md#增量组装)                                                                  | event producer、Definition、keyed renderer、分页/replay/live 等价与 GUI 测试               |
| Typert Remote API                             | Browser 或 SDK 需要通过 Gateway 调用 Host Service 的 typed method                       | [Typert Remote API](typert-remote-api.md#typert-remote-api)                                                                                                                                                                                                  | Host Service、生成导出、API remotes assembly 与 Gateway carrier 测试                       |
| rc.2 Webhook 接收器                           | 外部系统需要主动通过 HTTP 向 Harness 投递不可信请求                                     | [rc.2 Webhook 接收器](web-ingress.md#rc2-webhook-接收器)                                                                                                                                                                                                     | WebServer 组合、认证规则、exact route 与请求测试；rc.2 没有命名 webhook API                |
| 其他外部协议                                  | 需要翻译 Webhook、LLM 和现有 Service 未覆盖的第三方 wire protocol                       | [Provider 边界](capability-seams-providers.md#provider-边界)；[组合测试步骤](composition-config-credentials.md#组合测试步骤)                                                                                                                                 | 认证、解析、内部接缝与真实 carrier 组合                                                    |

## 叠加横切路径

检查主路径是否同时命中下表；一次变更可以叠加多行。用户直接要求其中一种结果时，该行本身就是主路径，例如“为插件增加持久状态”。

| 影响                                       | 何时叠加                                                                          | 阅读的离线章节                                                                                                                                                                                        | 在目标仓库中检查                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 新包或拆包                                 | 没有现有包能单独拥有该职责，或现有角色需要独立发布和演进                          | [包文件集合](package-authoring.md#包文件集合)；[完整入口骨架](package-authoring.md#完整入口骨架)                                                                                                      | 所属 README、同类包、manifest、编译配置和 invariant；涉及可替换能力时再叠加 Service/Provider 行 |
| 持久 Session event                         | 新事实属于一段 Session 的权威历史，必须参与日志回放或重建模型可见输入             | [持久事实源](session-durable-context.md#持久事实源)；[扩展 Session event](session-durable-context.md#扩展-session-event)；[回放与 projection 清单](session-durable-context.md#回放与-projection-清单) | Session event、持久化/load、replay fold、invariant 和 SDK 输出                                  |
| 插件自有持久状态                           | 数据需要跨重启保留，但不是某个 Session 的事件历史                                 | [三类状态的选择](storage-projections.md#三类状态的选择)；[Storage domain](storage-projections.md#storage-domain)；[生命周期与提交顺序](storage-projections.md#生命周期与提交顺序)                     | domain spec、backend route、schema、format version、close 与失败测试                            |
| Session projection                         | UI、SDK 或 Host 需要从 Session log 获得完整当前值，而不是自行扫描或保存第二份事实 | [Session projection](storage-projections.md#session-projection)；[回放与 projection 清单](session-durable-context.md#回放与-projection-清单)                                                          | event producer、纯 fold、wire schema、state version、carrier 与 cache                           |
| 并发任务、subprocess、socket 或 teardown   | 插件拥有超过一次同步调用的异步资源，需要取消、回滚和静默清理                      | [生命周期与 effect](cordis-lifecycle.md#生命周期与-effect)；[防御性生命周期](defensive-lifecycle.md#防御性生命周期)；[Provider 边界](capability-seams-providers.md#provider-边界)                     | 操作所有者、取消、回滚、回调隔离、环境/临时路径与静默完成                                       |
| Profile、bundle、boot 或配置               | 部署需要在不改包代码的情况下选择插件、Provider 或 tunable                         | [组合所有权](composition-config-credentials.md#组合所有权)；[配置规则](composition-config-credentials.md#配置规则)；[组合测试步骤](composition-config-credentials.md#组合测试步骤)                    | 实际 profile patch、boot/bundle 包与 resolver manifest                                          |
| 用户可编辑设置或设置卡片                   | 运行中的用户需要持久修改插件拥有的配置子集，或 Browser 需要编辑该 namespace       | [Config、Settings 与 Credential](user-settings.md#configsettings-与-credential)；[Host namespace](user-settings.md#host-namespace)；[Browser 设置卡片](user-settings.md#browser-设置卡片)             | Settings Provider、同名 namespace、secret redaction、revision fencing 与 Client bundle          |
| 凭证或账号授权                             | 功能需要引用或轮换 secret，或通过用户交互建立可复用的账号授权                     | [凭证所有权](composition-config-credentials.md#凭证所有权)；[凭证与配置](llm-provider-adapters.md#凭证与配置)                                                                                         | Credential Definition/Provider 与消费操作边界                                                   |
| 代码变更附带的测试、文档、生成物或发布检查 | 为插件代码变更补齐证据、公共说明、生成 projection 或发布表面                      | [按变更面选择证据](testing-docs-maintenance.md#按变更面选择证据)；[文档交付](testing-docs-maintenance.md#文档交付)                                                                                    | 所属测试、generator、公共 README 与 decision record；纯文档任务不由本 skill 路由                |

## 完成前

实现完成后读取[按变更面选择证据](testing-docs-maintenance.md#按变更面选择证据)和[验证命令矩阵](testing-docs-maintenance.md#验证命令矩阵)，选择覆盖实际变更面的最小检查。

## 证据与生成物

- 用生成的 catalog 发现事实，但修改其源并运行所属 generator/check；不要手工编辑生成区域。
- 示例只证明一种组合，不等于已发布默认值。除非用户明确改变产品边界，实验包保持 opt-in。
- 仅在包 README、cookbook 或源码注释指向与当前决策相关的 Agent Note 时读取。Archived note 是历史记录，不是当前要求。

## 最终检查

1. 实现拥有自己的状态、清理和失败行为。
2. 所有模型可见行为都能从 Session log 重建。
3. 插件生命周期结束时，其注册全部消失。
4. 聚焦测试覆盖实际 Loader/应用路径。
5. 只在所属事实变化时更新文档、生成物、snapshot 与 Agent Note。
