---
name: dsh-plugin-development
description: 为 @deepseek-ai/dsh-agent@0.2.0-rc.2 开发 Cordis 包和插件时，按任务查找公开入口、完整示例与验证方法。
---

# DSH Plugin Development

## 适用范围

本 Skill 面向 `@deepseek-ai/dsh-agent@0.2.0-rc.2` 的插件作者。先确认消费项目所用的 DSH 包版本；版本不一致时停止套用具体 API 签名和装载步骤，重新核查该版本的公开声明。文中区分目标版本已经实现的行为、仓库门禁、基于公开原语的开发建议与外部协议要求。

## 插件形态

插件可同时交付多种能力。下表按使用者能调用或观察的结果分类；function、object、class 是 Cordis 模块写法，Host、Client、Remote 是运行侧或通信边界。

| 形态 | 能力与呈现 | 装载与使用 |
| --- | --- | --- |
| 模型工具 | Agent 在模型步骤中调用工具；规范结果进入 Session，展示由纯渲染契约决定。 | 在 Host 插件中向 `ctx.tools` 注册，按[工具任务](references/host/how-to/how-to-host-tool.md)编写并验证调用与卸载。 |
| Service 与 Provider | 向其他插件提供可注入的领域能力；没有独立 UI，消费方调用 Service 后才观察到结果。 | 按[服务任务](references/host/how-to/how-to-host-service.md)定义接口、装载 Provider，并让消费方声明依赖。 |
| Web Client 界面扩展 | 在已有 Web 页面或 slot 呈现可见内容；用户通过对应页面交互。 | 装载 Client 模块并按[界面任务](references/client/how-to/how-to-client-slot-contribution.md)注册可见扩展。 |
| 外部触发入口 | 外部请求触发 Host 中的受控行为，结果由调用方或 Session 观察。 | 按[Webhook 任务](references/infra/how-to/how-to-infra-webhook.md)配置入口、验证请求与清理。 |
| 配置组合 | 将上述插件加入 Profile 或 bundle，并控制启用、参数与顺序；效果在对应消费者中呈现。 | 按[组合任务](references/infra/how-to/how-to-infra-profile-bundle.md)安装、装载并核验生效配置。 |

Remote 是 Host 与 Client 之间的调用方式，不单独构成用户可见的插件形态；需要跨侧通信时再读[Remote 任务](references/client/how-to/how-to-client-remote-call.md)。

## 开发任务

先看常用入口，再按 Host、Web Client 或配置与运行时选择任务。每项任务直达 HOW-TO；API 页提供对象契约，example 提供较长的完整代码。

### 常用入口

- [注册一个可取消的 Agent Tool](references/host/how-to/how-to-host-tool.md#让-agent-调用一个可取消的模型工具)

### Host 与 Agent

| 开发任务 |
| --- |
| [在 Host 管理 Workspace 与会话](references/client/how-to/how-to-client-workspace-registry.md#host-registry-操作) |
| [只为一个 Agent 注册能力](references/host/how-to/how-to-host-agent-scope.md#只为一个-agent-注册能力) |
| [注册一个由交互界面执行的命令](references/host/how-to/how-to-host-command.md#注册一个由交互界面执行的命令) |
| [挂载或实现压缩 backend](references/host/how-to/how-to-host-compaction.md#挂载或实现压缩-backend) |
| [保存插件凭据并注册授权流程](references/host/how-to/how-to-host-credentials.md#保存插件凭据并注册授权流程) |
| [接入可替换的目录选择后端](references/host/how-to/how-to-host-directory-picker.md#接入可替换的目录选择后端) |
| [从插件管理一项跨轮次目标](references/host/how-to/how-to-host-goal.md#从插件管理一项跨轮次目标) |
| [注册可被 Agent 收取的长任务](references/host/how-to/how-to-host-jobs.md#注册可被-agent-收取的长任务) |
| [接入一个新的 LLM Provider](references/host/how-to/how-to-host-llm-adapter.md#接入一个新的-llm-provider) |
| [记录一次模型流并可重复回放](references/host/how-to/how-to-host-llm-message.md#记录一次模型流并可重复回放) |
| [实现并挂载一个 Session 存储后端](references/host/how-to/how-to-host-persistence.md#实现并挂载一个-session-存储后端) |
| [注册一个提示词段并限制工具执行](references/host/how-to/how-to-host-prompt-policy.md#注册一个提示词段并限制工具执行) |
| [为 Agent 隔离插件注册与事件](references/host/how-to/how-to-host-scope.md#为-agent-隔离插件注册与事件) |
| [提供并消费一个 Host Service](references/host/how-to/how-to-host-service.md#提供并消费一个-host-service) |
| [为插件记录可恢复的领域事实](references/host/how-to/how-to-host-session-event.md#为插件记录可恢复的领域事实) |
| [从精确日志边界创建子 Session](references/host/how-to/how-to-host-session-fork.md#从精确日志边界创建子-session) |
| [查询历史或实现全文搜索 backend](references/host/how-to/how-to-host-session-query.md#查询历史或实现全文搜索-backend) |
| [让插件事件改变模型可见消息](references/host/how-to/how-to-host-session-surface.md#让插件事件改变模型可见消息) |
| [注册一个自定义标题 provider](references/host/how-to/how-to-host-session-title.md#注册一个自定义标题-provider) |
| [为模型 Shell 调用贡献环境事实](references/host/how-to/how-to-host-shell-env.md#为模型-shell-调用贡献环境事实) |
| [组合或调用具名委派 provider](references/host/how-to/how-to-host-subagent.md#组合或调用具名委派-provider) |
| [在工具中取得结构化回答](references/host/how-to/how-to-host-user-questions.md#在工具中取得结构化回答) |
| [从插件运行一次编排脚本](references/host/how-to/how-to-host-workflow.md#从插件运行一次编排脚本) |

### Web Client 与跨侧交互

| 开发任务 |
| --- |
| [在 Client 添加插件命令界面](references/client/how-to/how-to-client-command-ui.md#贡献-client-命令-ui) |
| [让可回放的 Session 事件在 Chat 中显示](references/client/how-to/how-to-client-conversation-node.md#让可回放的-session-事件在-chat-中显示) |
| [给文件后缀注册独立的预览 renderer](references/client/how-to/how-to-client-document-preview.md#给文件后缀注册独立的预览-renderer) |
| [为 `@file` 提供 Host 发现后端](references/client/how-to/how-to-client-file-reference-provider.md#为-file-提供-host-发现后端) |
| [注册一个 `/` 或 `@` 来源](references/client/how-to/how-to-client-input-trigger.md#注册一个--或--来源) |
| [给 slot 组件提供可切换文案与命令](references/client/how-to/how-to-client-locale-shortcuts.md#给-slot-组件提供可切换文案与命令) |
| [发布 Host Remote 供 Client 调用](references/client/how-to/how-to-client-publish-remote.md#发布-host-remote-供-client-调用) |
| [在 Client 读取 `@file` 与 `@session` 候选](references/client/how-to/how-to-client-reference-candidates.md#在-client-读取-file-与-session-候选) |
| [从 Client 调用已装载的 Remote namespace](references/client/how-to/how-to-client-remote-call.md#从-client-调用已装载的-remote-namespace) |
| [注册一个按地址读取的 Resource Provider](references/client/how-to/how-to-client-resource-provider.md#注册一个按地址读取的-resource-provider) |
| [为 Host 服务添加可编辑设置卡片](references/client/how-to/how-to-client-settings-card.md#host-服务命名空间时显示可编辑-web-卡片) |
| [在左侧栏添加插件面板](references/client/how-to/how-to-client-sidebar-panel.md#左栏全局面板贡献) |
| [贡献右侧栏 Tab](references/client/how-to/how-to-client-sidebar-tab.md#贡献右侧栏-tab) |
| [在已有页面的 slot 显示插件内容](references/client/how-to/how-to-client-slot-contribution.md#在已有页面的-slot-显示插件内容) |
| [在 Client 导航和控制子 Agent](references/client/how-to/how-to-client-subagent-navigation.md#client-子-agent-导航与控制) |
| [查找并复用 Web UI 组件](references/client/how-to/how-to-client-shared-ui.md#为-web-扩展选择现成控件) |
| [让 Web 扩展遵守主题与多语言样式](references/client/how-to/how-to-client-theme-ui.md#让-web-扩展遵守主题与多语言样式) |
| [为自己的工具名注册 Tool View](references/client/how-to/how-to-client-tool-view.md#为自己的工具名注册-tool-view) |
| [向指定 Session 上传浏览器文件](references/client/how-to/how-to-client-upload-file.md#向指定-session-上传浏览器文件) |
| [让一个 Client UI 包随 Profile 在浏览器出现](references/client/how-to/how-to-client-web-package.md#让一个-client-ui-包随-profile-在浏览器出现) |
| [消费逐轮 Workspace 变更摘要](references/client/how-to/how-to-client-workspace-changes.md#消费逐轮-workspace-变更摘要) |
| [导航 Workspace 与 Session](references/client/how-to/how-to-client-workspace-navigation.md#导航-workspace-与-session) |

### 配置、运行时与 Provider

| 开发任务 |
| --- |
| [为自定义 Profile 解析应用参数](references/infra/how-to/how-to-infra-app-args.md#为自定义-profile-解析应用参数) |
| [给 Web Profile 添加具名 HTTP 路由](references/infra/how-to/how-to-infra-http-route.md#给-web-profile-添加具名-http-路由) |
| [为 Profile 加入运行时自检](references/infra/how-to/how-to-infra-invariants.md#给插件组合装载包拥有的不变式检查) |
| [让插件配置在运行中安全更新](references/infra/how-to/how-to-infra-live-config.md#让插件配置在运行中安全更新) |
| [保存插件自有记录并在重启后读取](references/infra/how-to/how-to-infra-persistence.md#保存插件自有记录并在重启后读取) |
| [制作可安装的 Profile 组合包](references/infra/how-to/how-to-infra-profile-bundle.md#制作可安装的-profile-组合包) |
| [在 Profile 中安装并检查组合包](references/infra/how-to/how-to-infra-profile-bundle.md#在-profile-中安装并检查组合包) |
| [从插件调用 Spill 与附件存储](references/infra/how-to/how-to-infra-provider-artifacts.md#从插件调用-spill-与附件存储) |
| [选择并装载一个 Browser use provider](references/infra/how-to/how-to-infra-provider-browser-use.md#选择并装载一个-browser-use-provider) |
| [选择并装载一个 Computer use provider](references/infra/how-to/how-to-infra-provider-computer-use.md#选择并装载一个-computer-use-provider) |
| [通过 ShellExecutor 运行受限命令](references/infra/how-to/how-to-infra-provider-execution.md#通过-shellexecutor-运行受限命令) |
| [在 Host 插件中通过 ctx.fs 读取文件](references/infra/how-to/how-to-infra-provider-fs.md#在-host-插件中通过-ctxfs-读取文件) |
| [为文件扩展名注册 LSP provider](references/infra/how-to/how-to-infra-provider-lsp.md#为文件扩展名注册-lsp-provider) |
| [注册具名 MCP 资源 provider](references/infra/how-to/how-to-infra-provider-mcp-resources.md#注册具名-mcp-资源-provider) |
| [在 Host 插件中运行带 binding 的程序](references/infra/how-to/how-to-infra-provider-ptc.md#在-host-插件中运行带-binding-的程序) |
| [注册虚拟 Agent Skill](references/infra/how-to/how-to-infra-provider-skill.md#注册虚拟-agent-skill) |
| [注册语音转写 provider](references/infra/how-to/how-to-infra-provider-speech.md#注册语音转写-provider) |
| [在 Agent 作用域中使用持久 PTY](references/infra/how-to/how-to-infra-provider-terminal.md#在-agent-作用域中使用持久-pty) |
| [注册可用的 Web 搜索 provider](references/infra/how-to/how-to-infra-provider-web.md#注册可用的-web-搜索-provider) |
| [让可信外部事件创建一次 Agent 会话](references/infra/how-to/how-to-infra-webhook.md#让可信外部事件创建一次-agent-会话) |

## 关键对象索引

这里按运行侧列出已纳入对象的名称；同名对象的包身份及唯一权威 API 小节见[完整对象索引](references/object-index.md)。

### Host

- `AdapterRegistrationHandle`、`Agent`、`AgentHandle`、`AgentLoop`、`AgentRegistry`、`ApprovalOutcome`、`ApprovalRequest`、`ApprovalService`、`AskUserQuestionAnswer`、`AskUserQuestionRequest`、`AssistantStreamAccumulator`、`AssistantStreamRecord`
- `AuthorizationFlow`、`AuthorizationService`、`AuthorizationSession`、`BashEnvContributor`、`BashEnvVariable`、`BashEnvVariableInfo`、`bindScopeParent`、`buildForkSeed`、`CommandDefinition`、`CommandDescriptor`、`CommandInvocation`、`CommandResult`
- `CommandRuntime`、`compactCheckpointSource`、`CompactionEngine`、`CompactionResult`、`CompactionTrigger`、`Config`、`Context`、`CreateAgentOptions`、`CreateGoalRequest`、`createMessage`、`createScope`、`CredentialKey`
- `CredentialProvider`、`CredentialRef`、`defineTool`、`DefineToolOptions`、`DirectoryEntry`、`DirectoryListing`、`DirectoryPicker`、`DirectoryPickerCapabilities`、`DirectoryPickerCapability`、`DirectoryPickerError`、`expandAssistantStream`、`Fiber`
- `foldSurface`、`GoalRef`、`GoalService`、`GoalView`、`JobHandle`、`JobHooks`、`JobRegistry`、`JobSpec`、`JobView`、`LlmAdapter`、`LlmRuntime`、`ManualCompactionError`
- `Message`、`Plugin`、`PostToolDecision`、`PreToolDecision`、`ProjectionDefinition`、`PromptContext`、`PromptSection`、`RegistryService`、`ResumeAgentOptions`、`Scope`、`ScopedLayers`、`scopeTarget`
- `Service`、`Session`、`SessionEvent`、`SessionEventMap`、`SessionEventResultFilter`、`SessionHandle`、`SessionMessageProjection`、`SessionMessageProjectionContext`、`SessionObservation`、`SessionPersistence`、`SessionPersistenceSnapshot`、`SessionProjectionRegistry`
- `SessionQueryEngine`、`SessionQueryError`、`SessionResultFilter`、`SessionStore`、`SessionTitleProvider`、`SessionTitleProviderId`、`SessionTitleProviderRequest`、`SessionTitleProviderResult`、`SessionTitleService`、`ShellEnvRegistry`、`SubagentProvider`、`SubagentRun`
- `SubagentRuntime`、`SubagentStartRequest`、`SurfaceFoldResult`、`SystemPrompt`、`TimedUserQuestionResult`、`ToolDefinition`、`ToolExecution`、`ToolGuard`、`ToolRunContext`、`ToolRuntime`、`UserQuestionService`、`WorkflowEngine`
- `WorkflowError`、`WorkflowResult`、`WorkflowRun`、`WorkflowStartRequest`

### Client

- `ActionSpec`、`activeAtToken`、`Button`、`ChatNode`、`ChatNodeDataMap`、`Checkbox`、`ClientModuleRegistry`、`ClientModuleSystem`、`ClientRemote`、`CommandContribution`、`CommandDecoration`、`CommandUiContract`
- `CommandUiRuntime`、`CommandUiSpec`、`ComposedProps`、`ConfigForm`、`ConfigForms`、`ConfigFormSnapshot`、`ConversationEventRegistry`、`ConversationNodeDefinition`、`ConversationViewBuilder`、`ConversationViewDefinition`、`createClientModuleSystem`、`createSnapshotStore`
- `defineStore`、`DocumentContent`、`DocumentLoadMode`、`DocumentPreviewDefinition`、`DocumentPreviewProps`、`FileReferenceCandidate`、`FileReferenceService`、`FileSearchConfig`、`FileUploadProgress`、`FileUploadService`、`formatFileMention`、`ILayout`
- `Input`、`InputTriggerCandidate`、`InputTriggerServiceContract`、`InputTriggerSource`、`ISidebarRight`、`isRemoteFailure`、`LayoutController`、`LocaleNamespaceMap`、`LocaleRuntime`、`LocalFileReferenceService`、`Menu`、`MenuSurface`
- `Pill`、`PluginConfigViewProps`、`PluginDetailProps`、`PluginsSubject`、`PopupSelectSpec`、`PropsRenderFactories`、`PropsRenderSlots`、`PropsRuntime`、`PropsStore`、`RegisterFactory`、`Remote`、`RemoteError`
- `RemoteErrorDetailsMap`、`RemoteResult`、`RemoteScope`、`ResourceProvider`、`Resources`、`ResourceSnapshot`、`SegmentedControl`、`SelectConfirmation`、`SelectOption`、`SelectOptionGroup`、`SessionReferenceMentionCandidate`、`SessionReferenceResolver`
- `SettingsSchemaService`、`ShortcutCommand`、`Shortcuts`、`SidebarBrandMarkOwnerProps`、`SidebarPanelMetadata`、`SidebarRightTabClaim`、`SidebarRightTabDefinition`、`SidebarRightTabInjected`、`SidebarRightTabParamsMap`、`SidebarRightTabPriority`、`SlotCore`、`SlotEntryDef`
- `SlotFactoryMap`、`SlotKind`、`SlotMap`、`SlotRegistry`、`SlotScope`、`SubagentAddress`、`SubagentCatalogEntry`、`SubagentCatalogRow`、`SubagentIdentityProjection`、`SubagentInterruptReceipt`、`SubagentListEntry`、`SubagentPromptReceipt`
- `SubagentPromptRequest`、`SubagentTimingProjection`、`Switch`、`Tag`、`ThemeDefinition`、`ThemeRuntime`、`ThemeSnapshot`、`ThemeTokenOverrides`、`ToolCallOwnerProps`、`ToolCallViewProps`、`Tooltip`、`typertPlugin`
- `TypertPluginOptions`、`TypertRemoteService`、`UiConversation`、`UiSession`、`UiWorkspace`、`UseResource`、`Workspace`、`WorkspaceChanges`、`WorkspaceChangesSummary`、`WorkspaceFileDiff`、`WorkspaceFileSearch`、`WorkspaceId`
- `WorkspaceRegistry`

### Infra

- `AppExit`、`AttachmentStore`、`BrowserMcpAttachConfig`、`BrowserMcpConfig`、`BrowserMcpLaunchConfig`、`BrowserUseProviderName`、`BrowserUseRegistry`、`CmdlineArgs`、`ComputerUseProviderName`、`ComputerUseRegistry`、`Config`、`ConfigEditor`
- `ConfinedArgv`、`default`、`Domain`、`DomainFacility`、`DomainSpec`、`DshBundleManifest`、`DshProfileManifest`、`FileSystem`、`FsError`、`FsInfo`、`FsTarget`、`InvariantError`
- `InvariantInstaller`、`InvariantRegistry`、`KvTable`、`Lsp`、`LspProvider`、`LspProviderId`、`LspProviderQuery`、`LspQueryRequest`、`LspQueryResult`、`McpResourceProvider`、`McpResourceRequest`、`McpResourceRuntime`
- `mountSessionMcp`、`OwnedSessionResource`、`parseCmdline`、`PluginManager`、`Profile`、`PtcBindingNamespace`、`PtcRunRequest`、`PtcRunResult`、`PtcRuntime`、`runPluginCommand`、`SandboxProvider`、`SaveTextSpill`
- `SessionMcpOptions`、`SessionResourceOptions`、`SessionResources`、`SettingsConflictError`、`SettingsDescriptor`、`SettingsForms`、`SettingsPathOp`、`ShellExecution`、`ShellExecutor`、`SkillCandidate`、`SkillDefinition`、`SkillProvider`
- `SkillRegistry`、`SpeechProvider`、`SpillRef`、`SpillStore`、`Storage`、`StorageError`、`SubprocessHandle`、`SubprocessRuntime`、`TerminalBackend`、`TerminalBackendSession`、`TerminalSessionService`、`Transcript`
- `validateBrowserMcpConfig`、`VerifiedWebhookDelivery`、`WebFetchProvider`、`WebFetchRequest`、`WebFetchResult`、`WebhookRule`、`WebhookRuntime`、`WebhookSessionRequest`、`WebRoute`、`WebRuntime`、`WebRuntimeConfig`、`WebSearchProvider`
- `WebSearchRequest`、`WebSearchResult`、`WebServer`、`WebUpgradeRoute`

## 术语与边界

- **插件形态**说明能力由谁使用、在哪里可观察；**模块写法**说明 Cordis 怎样调用 `apply` 或构造 Service；**运行侧**说明代码在 Host 或 Client 执行。
- **Service Definition**声明契约，**Provider**实现契约，**Consumer**调用契约；只有具备实际消费路径的组合才算可用能力。参见 [Service API](references/host/api/api-host-cordis.md)。
- **Profile**选择和叠加 bundle、插件及 patch；**bundle**提供可继续覆盖的配置行。参见 [Profile 契约](references/infra/api/api-infra-profile-manifest.md)。
- **Remote**跨 Host 与 Client 传输公开契约；它不替代任一侧的包导出、生成声明或真实装载。参见 [Remote 契约](references/client/api/api-client-remote.md)。

## 关键词索引

| 查找词 | 先读 |
| --- | --- |
| Cordis、`Context`、`Service`、`ctx.effect` | [Host 生命周期与服务](references/host/api/api-host-cordis.md) |
| `ctx.tools`、`defineTool`、模型工具结果 | [工具契约](references/host/api/api-host-tools.md) |
| `dsh.client`、Client 模块、bundle | [Client 装载](references/client/api/api-client-modules.md) |
| slot、Web 页面、渲染 | [Client slot](references/client/api/api-client-slots.md) |
| Web UI 组件、控件、`primitive`、`List` | [共享控件选型与导出边界](references/client/api/api-client-shared-ui.md) |
| Remote、Typert、跨侧调用 | [Remote 契约](references/client/api/api-client-remote.md) |
| Profile、bundle、patch、插件安装 | [Profile 契约](references/infra/api/api-infra-profile-manifest.md) |
| 配置表单、状态持久化、webhook | [配置](references/infra/api/api-infra-live-config.md)、[存储](references/infra/api/api-infra-storage.md)、[Webhook](references/infra/api/api-infra-webhook.md) |

## 跨主题不变量

- 每项注册和异步资源都有明确的 owner、失败、取消与卸载清理路径；插件卸载后不得保留其注册。
- 模型能看到的事实须能从 Session 日志重建；临时 Client 展示不能代替持久事实。
- 模型工具返回一份规范 JSON 结果，展示函数只从该结果产生视图；不要让渲染承担副作用。
- 以目标版本的包导出、公开类型、运行时与门禁核查签名和行为；仓库内置示例或默认 Profile 不自动证明外部插件可独立使用。

## 完成边界

按所选 HOW-TO 核查包依赖、Host/Client 编译面、公开装载入口、一次可观察调用以及失败、取消和卸载。类型检查只证明代码与声明相容；要宣称插件可用，还需在目标 Profile 或消费项目中验证实际行为。
