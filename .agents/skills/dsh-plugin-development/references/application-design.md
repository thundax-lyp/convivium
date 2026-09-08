# 从项目需求到 DSH 应用组合

需要先看完整实例时，阅读 [HOW-TO：用 DSH 组合事件驱动的应用](how-to-build-event-driven-app.md)，沿上游 GitHub 自动评审案例理解选型与装配。

本流程面向尚不熟悉 DSH 的项目设计者，基线为 `dsh-v0.1.2-rc.1`。上游 architecture 的 “Where new behavior goes”、extension cookbook 的 “feature → mechanism map” 和 profile 实现提供能力与组合依据；下面的设计步骤、交付表和示例是据此整理的方法，不是 DSH 自带的项目生成器或强制开发阶段。

按以下顺序做设计；已有结论可复用。只加载选中能力的 reference，涉及失败、取消、权限和恢复时必须读完整契约。具体签名及冲突以[开发路由](plugin-development-routing.md)指定的事实优先级为准，不把上游概览中的宽泛措辞当成能力承诺。

## 1. 先描述场景和成功条件

从用户已经确认的目标提取：谁触发、输入是什么、希望观察到什么结果、是否需要模型判断、是否跨轮次或重启继续、谁可操作哪些资源。至少写出一条正常流程和一条会影响设计的失败反例，例如“请求被接受后进程退出，恢复时不能重复提交业务动作”。

用户只给愿景时，先整理已知部分；仅追问会改变架构的缺失信息，其余标为未决。不得因为 DSH 有某项能力就新增产品需求，或代替目标项目决定数据库、通信方式、部署形态。

确认目标 DSH 版本和现有工程约束。版本不匹配或未确定时，可给出候选能力和待核对项，但不能把本基线契约标成目标项目已支持；版本选择与升级是单独决策。

## 2. 先选应用入口，再选局部能力

已有应用先沿用其入口并核对实际组合；新应用根据调用者和交互方式选择候选。下表是已发布模板的用途，不要求一个项目同时采用多种入口。

| 使用场景 | 候选入口 | 组合与边界 |
| --- | --- | --- |
| 扩展 DSH 内置浏览器应用 | `web` | base + Web application；业务后端与 Client 展示分工，UI 不因此取得任意 Host 权限 |
| 一次性执行并输出结果，无服务器 | `headless` | base + one-shot runner；不适合作为持续交互界面的生命周期 |
| 外部 TypeScript/Python 程序驱动 Agent | `sdk` | base + SDK server，通过 SDK 协议连接；核对同版本 launcher 和公开协议覆盖面 |
| 外部自动化客户端要求 ACP | `acp` | base + ACP server；只按已实现的 automation-only 协议设计，不推断完整编辑器能力 |
| SDK 确实只需精简编码 Agent | `sdk-minimal` | 独立完整树，不继承 base；缺少 jobs、subagents、skills 等共享能力，不能因名字含 minimal 就当通用起点；默认全权限文件/执行策略也须与目标隔离要求匹配 |

支持的 Node 应用通过 `dsh` CLI、命名 profile 和有序 patch 启动。Profile 选择应用树；bundle 分发一组配置与代码；Agent preset 选择某个 Agent 的组合。不要用新增启动器或调用方内联整棵 Cordis 树绕过应用入口。具体规则读[组合配置](composition-config-credentials.md)，外部调用再读 [SDK/ACP](sdk-acp-integration.md)。

## 3. 将行为映射到能力，而非先列包名

对每项可观察行为，先判断已有配置或公开能力能否完成；只有具体契约缺口才新增插件逻辑。下表帮助选择，选中后再查对应 reference 的限制及实际 profile 是否挂载。

| 什么时候需要 | 首选机制与阅读入口 | 不能据此推断 |
| --- | --- | --- |
| 模型需要选择并调用业务动作 | [Tool](tools.md)，调用插件业务逻辑或既有 Service | 每个内部函数都需要变成工具 |
| 人直接执行明确命令，或回答问题/批准动作 | [Human command、UserQuestions、Approval](human-interaction.md)，按交互意图区分 | 普通回答等于授权；所有按钮都应触发模型轮次 |
| 给模型稳定指导或下一步上下文 | [Prompt section、followup/steer/inject](session-durable-context.md)；角色组合读 [Preset](presets-context.md) | `inject()` 会自行唤醒 Agent；提示词能替代权限控制 |
| 调整工具可见范围或执行策略 | [Tool restriction、guard 与执行事件](tools.md) | 只隐藏 schema 就能禁止执行；Plan mode 是安全隔离 |
| 使用另一模型、文件系统、执行环境或外部工具 | 优先现有 [Provider](capability-seams-providers.md)；按需读[模型路由](llm-model-routing.md)、[资源/MCP](runtime-resources.md)、[远程执行](remote-execution.md) | 换一个文件 Provider 就自动迁移全部执行资源；MCP 桥接所有协议能力 |
| 一次委派获得结果，或维护可多轮继续的子身份 | [one-shot / continuable Subagent](agent-subagent-workflow.md)；先确定 parent 与生命周期 | 普通 Agent 必须使用 Subagent；同级子 Agent 可以直接互发消息 |
| 多步骤动态委派确实需要 workflow 的执行模型 | [Workflow](agent-subagent-workflow.md)，核对实际 Provider 与结构化结果约束 | 多步骤业务必然需要 Workflow；实验 Teams 是默认协调能力 |
| 同一 Session 的目标推进、任务展示或以后提醒 | [Goal / Todo / Schedule](planning-scheduling.md)，按意图选一项 | Todo 自动调度；Schedule 是可靠业务队列或通用 Cron |
| 长时工作需要返回 handle、收集输出或停止 | [Jobs](jobs-background-work.md)，明确 Producer 与取消 owner | 后台任务自动成为跨重启可靠工作流 |
| 增加浏览器页面、Chat 业务节点或远程业务接口 | [Client UI](client-ui.md)、[Conversation](client-conversation-nodes.md)、[Typert API](typert-remote-api.md)；已有控制面先查 [Session/Workspace API](session-workspace-api.md) | Chat renderer 拥有业务状态或 Agent 生命周期 |
| 外部事件触发新 Session | [Webhook 与入站适配](web-ingress.md) | 出站 Web 搜索提供入站协议；签名验证等于业务幂等 |
| 数据要保存、回放或派生查询 | [三类状态选择](storage-projections.md#三类状态的选择)，再定事实源与 projection | 所有业务数据都放 Session event；projection 是第二份权威数据 |

## 4. 明确业务职责、状态与生命周期

DSH 提供执行、会话和扩展原语；项目自己的领域规则、业务完成条件和外部效果一致性仍要设计。逐项写出：

- **职责与依赖：** 哪些由 DSH 公开能力负责，哪些由插件负责；插件通过何种接口调用。仅在 Definition、Provider、Consumer 独立演进时拆包；单一职责插件可以在一个包内实现多个角色。
- **状态归属：** 进程临时状态、属于 Session 回放/模型历史的事实、跨 Session 或非历史的插件持久数据分别归谁。已有 message/tool result 能记录的输入不另造事件；派生视图写明来源，不复制权威状态。
- **Agent 与资源归属：** 谁创建、谁可以驱动、谁取消与 dispose；多个身份是否各自需要独立 Session，跨身份是否允许共享什么数据。按目标项目的不变量落实，不从共享 Cordis Context 推断共享会话。
- **权限与结果：** Host 如何验证调用者、目标资源与动作；区分 enqueue acceptance、Agent 状态、工具结果和业务提交。需去重、重试、补偿或可靠投递时写明业务 owner 与依据，不能借 Session persistence 作出外部效果 exactly-once 承诺。

## 5. 组合一条能解释完整结果的路径

先画出或写出最小链路：入口 → 受控 Host 接口/业务逻辑 → Agent 或确定性动作 → 事实提交 → 结果展示。对每条边写出输入、返回语义和失败传播；不需模型的动作可直接执行领域逻辑。

再列实际装配：复用哪个 profile、增加/替换哪些插件 row、必需 Service 由谁提供、哪些注册在 Agent scope、需不需要 preset/isolate、是否有 Client 编译面。检查包依赖能被 Loader 解析，缺少必需 Provider 时如何显式失败。不要只画包关系而遗漏配置与生命周期。

为同一链路检查拒绝授权、取消、插件卸载、进程重启中实际相关的分支。只设计当前需求需要的恢复语义；不能把“记录了意图”“返回 MessageId”画成“业务完成”。Profile 的 live/startup patch 策略必须与工作生命周期一致。

### 组合示例：带人工确认的分析助手

以下是假设场景，用于演示选择方法，不代表目标项目的已确认方案，也不是可直接运行的配置：用户在内置 Web 中提交材料，Agent 调用分析能力，用户审核结果后保存一条业务记录。

1. 入口选 `web`。通过已有会话控制面提交用户输入；只有领域动作缺少合适接口时才增加受控 Host API。
2. 一次分析先用一个 Agent；插件 Tool 调用分析业务逻辑。只有“需要独立可继续的专家身份”成为需求后，才评估 continuable Subagent，不为“分析有多个步骤”预先引入 Workflow/Teams。
3. 模型输入与工具结果沿现有 Session 记录；独立业务记录按三类状态选择由插件持久化。后端核验人工确认和写入权限；若由模型发起敏感动作，再按执行路径使用 Approval，普通问题回答不代替动作授权。
4. UI 展示通过已支持的 API/事件与 Client 能力组合；需要 Chat 业务节点时才增加 Conversation 定义和 keyed renderer。展示层不能自行完成领域提交。
5. 业务完成定义为后端记录提交成功。分析结束、输入 acceptance、用户点击保存均不是这个完成证据。若要求重复提交不重复写入，插件须定义去重依据和原子提交边界。
6. 设计验证覆盖正常保存、未授权保存被拒绝，以及需求要求的重复提交/恢复路径；后续实现再用真实 Loader 验证所选组合。

同一场景若改为外部程序调用，重新评估 `sdk` 入口与协议覆盖；业务职责可复用，但不能假定 Web API 或 UI 组件随 SDK profile 存在。

## 设计交付与停止条件

按任务规模在回复或目标项目规定的设计文档中给出以下内容，不为流程本身新建治理文件：

| 场景与验收结果 | DSH 能力及契约依据 | 插件自有职责 | 入口/组合与 owner | 限制及未决项 | 验证方式 |
| --- | --- | --- | --- | --- | --- |
| 使用具体触发与可观察结果 | 链接选中 reference 的相关契约 | 领域行为、状态或边界 | profile、Service、Session/资源 owner | 版本、缺失能力与待确认决策 | 能暴露错误方案的用例 |

同时给出一条端到端正常路径和相关失败路径。分开标注“基线已有契约”“本项目拟采用、组合待验证”“尚未决定”；基线已支持不代表目标项目已挂载或已通过测试。

能说明入口、能力选择理由、业务职责、事实源、权限/生命周期、完成语义与验证计划后，设计任务即可收口；不能决定的关键项明确影响和下一步核对点。用户只要设计时不自动写代码、不要求先运行应用才能交付设计。进入实现后再按[测试与文档维护](testing-docs.md)执行所选证据，包括产品可见组合的真实 Loader 验证。
