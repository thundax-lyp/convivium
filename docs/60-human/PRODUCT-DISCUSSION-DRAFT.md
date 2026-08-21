# Convivium 产品讨论稿

更新时间：2026-08-21

## 文档目的

本文记录 Convivium 立项前的产品讨论、已确认边界、外部项目调研和待决问题，供后续需求分析与设计工作接续。

本文不是最终需求文档，也不是技术设计，任何内容均不直接约束实现。标记为“已确认”的内容表示讨论中已经形成共识，但仍须以迁移后的 governance、requirements 或 interface 文档作为当前实现依据。

## 讨论稿形成时的工程快照

以下状态记录于 2026-08-21，可能随工程推进而失效，不作为当前仓库状态的真相源。

- GitHub：<https://github.com/thundax-lyp/convivium>
- 默认分支：`main`
- 技术方向：TypeScript + Electron + ACP
- 尚未初始化工程脚手架，尚无提交与推送。

## 已确认的产品边界

### 独立应用

Convivium 是一个有独立后台和前台的应用，不是 `idea-workshop` Skill 的后续版本。Skill 最多可以在未来成为可导入的角色或会议模板，但不承担会议运行时职责。

### 产品名称

- 名称：`Convivium`
- 一句话定位：`A gathering of human and agent minds.`

### 桌面载体

应用以 Electron 为桌面载体，使用 TypeScript 开发。后台与前台应保持清晰边界，会议、ACP 进程和文件权限不能直接耦合到 Renderer。

### ACP Agent

ACP 的核心价值不是简单统一模型调用，而是让每个 Agent 成为独立运行主体：

- 独立 Prompt；
- 独立 Skills；
- 独立工作目录；
- 独立 ACP Session；
- 独立模型、MCP、权限和运行模式；
- 可以暂停、恢复、取消和关闭。

Skills 与 System Prompt 的具体加载方式由 Agent 实现决定；ACP 负责标准化 Agent Session 的创建、Prompt、事件、权限和生命周期。

## 产品问题

现有“多 Agent 讨论”通常采用以下流水线：

1. 所有 Agent 独立回答；
2. 等待全部回答完成；
3. 主持模型汇总；
4. 结束。

这不是持续会议。它缺少针对前序发言的回应、动态发言权、人类中途参与、临时邀请专家和跨轮次会话连续性。

Convivium 要解决的是：人类与独立 Agent 如何进入同一个可持续、可暂停、可恢复、可审计的讨论空间。

## 目标能力

### 角色管理

- 用户可以创建、编辑和复用角色。
- 角色定义包括视角、职责、Prompt、Skills、ACP Agent、工作目录策略、模型、MCP 和权限。
- 角色定义与某场会议中的角色实例分离。
- 修改角色定义不应静默改变已经开始的会议；会议应保存角色版本快照。

### 角色推荐

- 系统可以根据议题推荐适合参与的已有角色。
- 当角色库没有适合角色时，可以提出临时角色建议。
- 推荐必须说明邀请理由和预期贡献。
- 是否允许系统自动创建或自动邀请角色尚未确定。

### 动态参会

- 会议开始后仍可邀请新角色。
- 新角色加入时创建独立 ACP Session。
- 新角色需要接收入会上下文，包括议题、目标、已有共识、分歧、开放问题和必要的近期原始发言。
- 不应默认把全部原始历史无差别塞入新 Agent 上下文。

### 持续讨论

- 会议必须逐次选择一位发言者，而不是每轮让所有 Agent 并行交卷。
- Agent 应当能够回应、质疑、补证、修正或支持前序发言。
- 主持机制负责候选人过滤、下一发言者选择、人类发言门控和收敛判断。
- 用户可以中途发言、点名角色、提出新问题、暂停或结束会议。
- 下一发言人如何决定是核心产品问题，需要独立形成规则与验证方案。

### 人类席位

人类是正式 Participant，而不是只在会议外提供 Prompt 的操作者。

人类席位至少考虑三种控制模式：

- `MANUAL`：轮到本人时暂停会议，等待本人发言。
- `COPILOT`：代理 Agent 起草，由本人确认或修改后发布。
- `DELEGATED`：代理 Agent 在授权范围内直接代表该席位发言。

席位身份与实际控制者必须分离。代理发言应同时记录：

- 会议中的 Speaker；
- 实际 Controller；
- 是否代表他人；
- 委托范围与有效期；
- 是否经过本人确认。

代理不得伪装成本人，也不得编造本人的经历、授权、承诺或价值判断。

### 静默 Agent

Agent 不一定拥有自己的发言席位。建议区分以下参与模式：

- `ACTIVE`：拥有自己的席位，可以代表自己发言。
- `OBSERVER`：持续接收会议上下文，但不进入发言候选集。
- `DELEGATE_ONLY`：只在受托控制其他席位时发言。

调度器选择的是 Participant，不是底层 Agent。`DELEGATE_ONLY` Agent 不以自己的身份进入下一发言者候选集。

即使同一个 Agent 同时承担自己的角色和人类托管，也应使用不同 ACP Session，避免身份、立场和私人上下文相互污染。

## 初步领域概念

以下概念来自当前讨论，名称和边界仍需在正式需求中确认：

- `RoleDefinition`：可复用角色定义。
- `AgentProfile`：ACP Agent 的命令、能力、模型、Skills、MCP、工作目录和权限配置。
- `Meeting`：围绕议题持续演进的会议。
- `Participant`：会议中的身份和席位。
- `ControllerBinding`：Participant 当前由本人或哪个 Agent 控制。
- `DelegationMandate`：委托目标、允许范围、禁止事项、升级条件和有效期。
- `MeetingEvent`：加入、离开、发言、托管、接管、暂停、恢复和结束等可审计事件。
- `FloorPolicy`：发言候选、下一发言者、用户门控和收敛规则。
- `ACPAgentSession`：某个 Agent 在某场会议、某个身份下的独立 Session。

## 初步进程边界

以下是当前建议，不是最终设计：

```text
Electron Main
├── 应用与窗口生命周期
├── 系统托盘、通知和更新
└── Meeting Server 进程监管

Meeting Server
├── Meeting Domain
├── Role Registry
├── Floor Policy
├── Human Delegation
├── ACP Runtime
├── Persistence
└── Realtime Event Gateway

Electron Preload
└── 类型化、白名单化的前后端桥接

Electron Renderer
├── 角色管理
├── 会议现场
├── 托管控制
└── Agent 与 Session 状态

ACP Agent Processes
├── Codex
├── Claude Code
└── 其他 ACP Agent
```

倾向让 Meeting Server 可以脱离 Electron 运行，以便测试、恢复和未来 Headless 使用；这一点尚未由用户最终确认。

## 外部项目调研

### Crewly

仓库：<https://github.com/stevehuang0115/crewly>

Crewly 的业务概念和技术栈最接近期望：

- TypeScript/Node.js 后台；
- React Web Dashboard；
- Express、Socket.IO、SQLite；
- Team、Member、Role、Skill；
- 角色 Prompt、Skills 和工作目录；
- Agent 生命周期、懒启动、暂停与恢复；
- 团队推荐和确认后的团队物化；
- 实时状态和任务委派。

重要差异：

- Crewly 主要是编码 Agent 团队和任务协作，不是持续会议。
- 当前 Runtime 深度依赖 PTY/tmux、终端字符串检测和各 CLI 的专用启动逻辑。
- `canDelegate` 表示 Agent 间任务委派，不表示人类席位托管。
- 团队推荐当前包含硬编码启发式映射，不能直接视为通用议题角色推荐。

调研重点应是 Crewly 的需求、领域模型、交互和工程边界，而不是现在就决定 Fork。

### Jockey

仓库：<https://github.com/recailai/jockey>

Jockey 在 ACP Runtime 和角色会话方面更接近：

- ACP 多 Agent；
- 角色独立 System Prompt、Skills、MCP 和配置；
- 会话内按角色保存 `acp_session_id`；
- `@Role` 路由和角色按需启动；
- 跨角色上下文传递；
- Tauri UI 与 SQLite。

重要差异：它更像在单一聊天窗口中手动切换 ACP 角色，没有会议席位、自动发言权、人类托管和议题角色推荐。

### Microsoft Agent Framework

仓库：<https://github.com/microsoft/agent-framework>

它提供 Group Chat、下一发言者选择、完整讨论历史、Human-in-the-loop 和 Checkpoint，但参与者主要在 Workflow 构建阶段注册，运行时动态增加 Participant 不是其自然模型；同时没有 ACP Client 集成。

### LangGraph

仓库：<https://github.com/langchain-ai/langgraph>

LangGraph 提供持久状态、动态路由、Interrupt、Resume 和故障恢复。角色可以作为状态数据，通过通用执行节点调用，不必为每个角色建立固定图节点。TypeScript 可使用 LangGraph.js。

但 LangGraph 不是会议产品，也不提供 ACP Client、角色管理、发言策略或人类托管；采用它仍意味着自行实现 Meeting Domain。

### 其他参考

- Co-STORM：<https://github.com/stanford-oval/storm>，可参考人类插话、主持人和 Turn Policy。
- Agent Roundtable：<https://github.com/erickong/agent-roundtable>，可参考 UI，但其固定轮次并行发言再总结的模式不符合目标。
- AgentScope：<https://github.com/agentscope-ai/agentscope>，可参考 Agent Service、Skills、Workspace 和 Web UI，但其核心是 Leader-Worker 协作。
- AG2：<https://github.com/ag2ai/ag2>，可参考 Human Proxy 和 Discussion Channel，但不作为新项目技术基座的首选。

## 当前尚未作出的技术决策

以下事项不得从本交接文档推断为已确认：

- Fork Crewly、复用部分代码，还是仅借鉴其需求与设计；
- 是否采用 LangGraph.js；
- 是否自行实现轻量会议调度器；
- SQLite、PostgreSQL 或其他持久化方案；
- Electron Main 与 Meeting Server 使用 IPC、HTTP、WebSocket 或组合通信；
- Meeting Server 是否第一版就支持 Headless；
- ACP Runtime 使用官方 TypeScript SDK、`acpx`、`acp-kit` 或自建薄封装；
- 单用户本地应用还是支持远程、多用户部署；
- 是否保留 Crewly 的任务、团队层级、记忆和外部消息渠道能力。

## 明确不应走的方向

- 不把 Convivium 实现成现有 Skill 的复杂化版本。
- 不把多个 Agent 的一次性并行回答称为持续会议。
- 不把 Agent、Role、Participant 和 Controller 混为同一个对象。
- 不让代理 Agent 在审计记录中伪装成人类本人。
- 不让 Electron Renderer 直接启动 Agent 进程或自由访问文件系统。
- 不在需求完成前因为技术相似就决定 Fork Crewly。
- 不把 Crewly、Jockey 或框架 README 中的宣传表述直接当作已验证能力。

## 待确认的产品问题

1. 第一版是本地单用户应用，还是从一开始支持远程与多用户？
2. Meeting Server 是否必须支持脱离 Electron 的 Headless 启动？
3. MVP 面向通用议题讨论，还是先聚焦产品与技术研讨？
4. 角色推荐只从已有 Role Registry 选择，还是允许生成临时角色？
5. 新角色加入会议是否必须由用户确认？
6. 用户发言是随时插话、排队，还是只能在 Turn Gate 中进入？
7. `COPILOT` 和 `DELEGATED` 的默认授权范围、过期方式和升级条件是什么？
8. 静默 Agent 默认采用 Warm Observer 还是 Lazy Start？
9. 下一发言人由确定性规则、主持 Agent，还是二者组合决定？
10. 会议何时暂停、何时收敛、谁有权结束？
11. 新 Agent 应获得多少历史，会议摘要由谁生成和维护？
12. Agent 工作目录如何隔离，共享项目目录是否只读？
13. 是否允许 Agent 修改文件，还是第一版只做讨论？
14. 会议记录、思考过程、工具调用和权限事件分别保留到什么粒度？
15. 是否需要从第一版支持会后追问、回放、分叉和续会？

## 建议的下一步

1. 深入阅读 Crewly 的需求、设计、Team/Role/Skill/Session 数据模型和主要 UI 流程。
2. 把 Crewly 的能力拆为“适用需求、产品假设、可借鉴设计、与 Convivium 的冲突”。
3. 形成 Convivium 用户旅程和 MVP 范围，不先选框架。
4. 编写需求草案，区分已确认需求、非目标、验收标准和开放问题。
5. 使用没有本次对话上下文的读者测试需求文档，检查概念混淆与隐含假设。
6. 需求确认后，再比较 Fork Crewly、新建 TypeScript/Electron 项目、LangGraph.js 和自研调度器的成本。
7. 技术路线确认后再初始化 Monorepo、工程脚手架和提交历史。
