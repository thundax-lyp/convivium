# Host 插件核心：Context、Service 与模型工具

## 对象关系

DSH 的 Host 插件由 Cordis Loader 放进一个 `Context` 和所属 `Fiber`。插件的函数、对象或类只是模块入口写法；它可以提供 Service、注册模型工具，或同时做两件事。`inject` 声明所需 Service，Cordis 等待依赖可用后执行入口。`ctx` 上的注册、监听和 `effect` 都归当前 fiber 所有，卸载时释放。

模型工具由已装载的 `@deepseek-ai/dsh-tools` Service 提供 `ctx.tools`。工具插件经 `defineTool` 声明输入、规范 JSON 输出和模型可见投影，再用 `ctx.tools.register` 注册。注册本身不等于把插件装入 Profile；需通过目标版本的 Loader 配置或 patch 挂载插件。

## 选型与使用

| 目标 | 公开对象与边界 | 操作路径 |
| --- | --- | --- |
| 让其他插件调用一项 Host 能力 | [Context、Plugin、Service 与 Fiber](api-host-cordis.md)；服务名通过声明合并进入 `Context`，消费者声明 `inject` | [提供并消费 Host Service](../how-to/how-to-host-service.md) |
| 让模型调用一项能力 | [defineTool、ToolRuntime 与 ToolRunContext](api-host-tools.md)；需要 `tools` 注入，规范值与模型内容分开 | [注册模型工具](../how-to/how-to-host-tool.md) |
| 扩展一个实时 Agent | [Agent、AgentRegistry 与 AgentHandle](api-host-agent.md)；作用域注册、创建与清理各有 owner | [在 Agent 作用域注册能力](../how-to/how-to-host-agent-scope.md) |
| 向交互界面提供斜杠命令 | [CommandDefinition 与 CommandRuntime](api-host-commands.md)；命令由 UI 调用，不发给模型 | [注册 Host 命令](../how-to/how-to-host-command.md) |
| 写入可回放的 Session 事实 | [Session 与 SessionStore](api-host-session.md)；先声明事件契约，再写日志 | [记录插件事实](../how-to/how-to-host-session-event.md) |
| 从精确日志边界分叉 Session | [SessionStore.fork](api-host-session.md#sessionstore) 与 [surface 投影](api-host-session-surface.md)；继承切点和打开轮次关闭信息都要保留 | [创建子 Session](../how-to/how-to-host-session-fork.md) |
| 让插件事件改变模型历史 | [SessionMessageProjection 与 foldSurface](api-host-session-surface.md)；日志事实与当前 surface 各有职责 | [注册消息投影](../how-to/how-to-host-session-surface.md) |
| 提供自定义模型后端 | [LlmAdapter 与 LlmRuntime](api-host-llm.md)；注册 provider route 与流式请求契约 | [接入模型适配器](../how-to/how-to-host-llm-adapter.md) |
| 保存并回放模型消息流 | [AssistantStreamAccumulator 与 Message](api-host-llm-message.md)；子路径对象由包根重导出 | [记录一次模型尝试](../how-to/how-to-host-llm-message.md) |
| 扩展提示词或执行策略 | [SystemPrompt、ApprovalService 与工具事件](api-host-prompt-policy.md)；仅在相应服务与轮次内调用 | [注册提示词段与工具门禁](../how-to/how-to-host-prompt-policy.md) |
| 保存插件凭据或提供人机授权 | [CredentialProvider 与 AuthorizationService](api-host-credentials.md)；密钥与 grant 的地址、读写所有权不同 | [保存凭据并注册授权 flow](../how-to/how-to-host-credentials.md) |
| 提供会话持久化后端 | [SessionPersistence 与 SessionHandle](api-host-persistence.md)；单写者、连续追加和 flush 屏障 | [实现持久化后端](../how-to/how-to-host-persistence.md) |
| 为工作区页面提供目录选择 | [DirectoryPicker 与能力联合](api-host-directory-picker.md)；Host backend 决定原生选择或浏览树，Client 流程另行组合 | [接入目录选择后端](../how-to/how-to-host-directory-picker.md) |
| 压缩过长的会话历史 | [CompactionEngine](api-host-compaction.md)；backend 拥有选择、摘要、日志 bracket 与恢复语义 | [挂载或实现压缩 backend](../how-to/how-to-host-compaction.md) |
| 自定义会话标题来源 | [SessionTitleService 与 SessionTitleProvider](api-host-session-title.md)；标题是日志投影，不进入模型历史 | [注册标题 provider](../how-to/how-to-host-session-title.md) |
| 为模型 Shell 调用提供环境事实 | [ShellEnvRegistry 与 BashEnvContributor](api-host-shell-env.md)；每次调用现算并按 fiber 清理 | [贡献环境事实](../how-to/how-to-host-shell-env.md) |
| 创建可被 Agent 管理的后台任务 | [JobRegistry 与 JobSpec](api-host-jobs.md)；owner 隔离、输出环和取消由具体 backend 实现 | [注册后台 Job](../how-to/how-to-host-jobs.md) |
| 调用或提供子 Agent 委派 | [SubagentRuntime 与 SubagentProvider](api-host-subagent.md)；具名 provider 与续接 manager 的所有权不同 | [组合或调用委派 provider](../how-to/how-to-host-subagent.md) |
| 编排多个子任务 | [WorkflowEngine 与 WorkflowRun](api-host-workflow.md)；run 由 caller 持有并释放 | [运行 Workflow](../how-to/how-to-host-workflow.md) |
| 向用户请求结构化回答 | [UserQuestionService](api-host-user-questions.md)；仅精确 live root Agent 可发起人机问答 | [请求用户回答](../how-to/how-to-host-user-questions.md) |
| 管理跨轮次完成目标 | [GoalService 与 GoalRef](api-host-goal.md)；日志状态与续行授权分离 | [管理持久目标](../how-to/how-to-host-goal.md) |
| 按 Agent 隔离注册与事件 | [createScope 与 ScopedLayers](api-host-scope.md)；仅作用域感知的 API 会隔离 | [创建作用域贡献](../how-to/how-to-host-scope.md) |
| 检索 Session 历史 | [SessionQueryEngine](api-host-session-query.md)；live 优先读取与可替换全文搜索 backend | [查询 Session 历史](../how-to/how-to-host-session-query.md) |

Service 可以没有用户界面；其使用者是另一个插件。Tool 的模型内容经 `output.render` 产生，内置 Web 卡片仍需另行核查 Client 渲染路径。`presentCall` / `presentResult` 只面向消费这些展示意图的 Host UI 适配器，不能据此推定已有专用 Web 卡片。
