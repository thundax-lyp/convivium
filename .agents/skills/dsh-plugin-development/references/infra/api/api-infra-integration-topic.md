# 外部事件进入插件组合

## 对象关系

HTTP 入口由 Host WebServer 和 provider adapter 拥有；适配器先验证请求并把它标准化为 `VerifiedWebhookDelivery`。`WebhookRuntime` 接受该交付，按 `kind` 运行插件注册的规则；规则可返回一个 `WebhookSessionRequest` 来创建普通 Workspace Session。Webhook 规则是 Host 插件形态，未自动获得 Web 页面或 Remote 方法。

`@deepseek-ai/dsh-api-gateway` 的 `/api` 路由属于 Typert Remote 传输；它不负责一般 webhook 请求。需要 Client 调 Host 方法时使用 Remote 主题的公开业务端点，不能拿 webhook 适配器替代。通用 HTTP route 由 [WebServer](api-infra-webserver.md#webserver) 注册；Webhook 规则详见 [Webhook 对象](api-infra-webhook.md#webhookruntime)与[规则 HOW-TO](../how-to/how-to-infra-webhook.md#让可信外部事件创建一次-agent-会话)。

## 选型与使用

当认证后的外部事件需要启动一次 Agent 会话时，选择 webhook adapter + `WebhookRuntime` + 独立规则插件。只有请求到达适配器不表示规则成功，也不表示 Agent 已完成；规则需要自己的过滤、幂等和取消处理。

当外部调用方需要自定义 HTTP 协议而非 Remote 方法或 webhook 会话时，注册具名 Host route，并自行处理请求鉴权、响应及卸载。操作见[HTTP route HOW-TO](../how-to/how-to-infra-http-route.md#给-web-profile-添加具名-http-路由)。

插件也可为 Host 提供搜索/抓取和代码语义查询能力：`WebRuntime` 选择注册的 [Web provider](api-infra-provider-web.md#webruntime)，`Lsp` 按文件扩展名选择 [LSP provider](api-infra-provider-lsp.md#lsp)。两者都在 Host 注册、由现有工具或其他消费者调用；配置和调用路径分别见[Web provider HOW-TO](../how-to/how-to-infra-provider-web.md#注册可用的-web-搜索-provider)与[LSP provider HOW-TO](../how-to/how-to-infra-provider-lsp.md#为文件扩展名注册-lsp-provider)。

其余基础能力按资源所有者区分：[SkillRegistry](api-infra-provider-skill.md#skillregistry) 合并 Skill provider，[McpResourceRuntime](api-infra-provider-mcp-resources.md#mcpresourceruntime) 把具名资源 provider 暴露为模型工具，[FileSystem](api-infra-provider-fs.md#filesystem) 定义同一执行世界的文件访问。任务步骤分别见 [Skill provider](../how-to/how-to-infra-provider-skill.md#注册虚拟-agent-skill)、[MCP resource provider](../how-to/how-to-infra-provider-mcp-resources.md#注册具名-mcp-资源-provider)、[FileSystem 消费](../how-to/how-to-infra-provider-fs.md#在-host-插件中通过-ctxfs-读取文件)。

需要运行或保留 Host 资源时，按所有者选择 [进程与隔离](api-infra-provider-execution.md#subprocessruntime)、[持久 PTY](api-infra-provider-terminal.md#terminalsessionservice) 或 [Spill/附件存储](api-infra-provider-artifacts.md#spillstore)。对应任务为 [受限命令](../how-to/how-to-infra-provider-execution.md#通过-shellexecutor-运行受限命令)、[Agent PTY](../how-to/how-to-infra-provider-terminal.md#在-agent-作用域中使用持久-pty)、[保存文本与附件](../how-to/how-to-infra-provider-artifacts.md#从插件调用-spill-与附件存储)。隔离、进程树和耐久性须在目标 OS 与后端上另行验证。

其他可选运行时包括 [PTC 程序执行](api-infra-provider-ptc.md#ptcruntime) 与 [实验性语音转写](api-infra-provider-speech.md#speechtotext-default)；任务分别见 [PTC binding](../how-to/how-to-infra-provider-ptc.md#在-host-插件中运行带-binding-的程序)和 [Speech provider](../how-to/how-to-infra-provider-speech.md#注册语音转写-provider)。

[BrowserUseRegistry](api-infra-provider-browser-use.md#browseruseregistry) 与 [ComputerUseRegistry](api-infra-provider-computer-use.md#computeruseregistry) 分别保留唯一 provider 槽；实际工具、权限及资源归具体后端。目标版本实验实现的装载路径见 [Browser use HOW-TO](../how-to/how-to-infra-provider-browser-use.md#选择并装载一个-browser-use-provider) 与 [Computer use HOW-TO](../how-to/how-to-infra-provider-computer-use.md#选择并装载一个-computer-use-provider)。
