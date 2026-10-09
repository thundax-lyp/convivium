# Browser use 独占 provider 槽

## 对象关系与使用场景

`@deepseek-ai/dsh-browser-use` 的 Host Service 只负责声明当前唯一 browser-use provider 的身份。实际浏览器操作、工具注册、每 Session 资源与浏览器进程由所选 provider 插件拥有。目标版本有 Playwright MCP、Chrome DevTools MCP 与 Stagehand native 实验 provider；它们不是默认装载组件。选择与装载见 [HOW-TO](../how-to/how-to-infra-provider-browser-use.md#选择并装载一个-browser-use-provider)。

## BrowserUseRegistry

**公开导出**：`BrowserUseRegistry` 来自 `@deepseek-ai/dsh-browser-use`。
服务注册为 `ctx.browserUse`，无配置。`providerName` 在一个 provider 已注册且资源仍在关闭时返回名称，未注册时为 `undefined`；这只是占用状态，不证明浏览器可用。`register(name: BrowserUseProviderName): () => Promise<void>` 保留唯一槽；第二次注册即使同名也拒绝。返回的是该次注册的 effect disposer。

provider 必须先停止接纳工具调用、关闭 Session 浏览器和子进程、等待自有任务完成，然后释放槽。应把 disposer 与自有资源放在同一个有序 effect 中，让旧 provider 清理完成前新 provider 无法接管。Registry 不实现导航、截图、页面读写或权限审查，这些契约属于具体 provider。

## BrowserUseProviderName

`@deepseek-ai/dsh-browser-use/brand` 导出同名品牌类型与 `BrowserUseProviderName(name: string)` 工厂。工厂只做品牌转换，不验证内容；调用插件选择稳定、可诊断的非空名称，注册时使用该值。其来源是具体 provider 的身份，不是浏览器 tab 或 Session id。

## OwnedSessionResource

`@deepseek-ai/dsh-experimental-browser-use-runtime` 根入口的 `OwnedSessionResource<T>` 是 `{ value: T, close: () => Promise<void> }`。`value` 是 provider 私有的浏览器或连接句柄。`close()` 须停止接纳新操作、打断待决工作并等待关闭；资源管理器只调用此函数，不替 provider 关闭浏览器。`open` 失败时不会得到此对象，因此获取函数必须自行回滚已创建的部分资源。

## SessionResourceOptions

同一根入口的 `SessionResourceOptions<T>` 传给 `SessionResources<T>` 构造函数。`label` 用于生命周期诊断；`exclusive: true` 使一个已预留的外部浏览器只能归一个活跃 Session，`false` 允许每个 Agent 分别获取资源。`open(agent, signal)` 应为精确的活跃 Agent 获取资源，成功时返回 `OwnedSessionResource<T>`，失败前完成部分获取的回滚。传入的 signal 在 owner 或 provider 关闭时取消；获取函数须响应取消并清理其自有连接。

## SessionResources

同一根入口的 `SessionResources<T>` 管理每次活跃 Agent 激活的资源，而非持久化 Session id。`new SessionResources(ctx, options)` 需要提供 `agents` Service 的 `Context` 与上述选项；恢复后的新 Agent 不继承旧连接。`available(agent)` 只检查准入，不预留资源。`get(agent, signal?)` 惰性获取该 Agent 的资源；调用者取消等待不会取消已归 Session 所有的初始化。`run(agent, signal, operation)` 串行化同一 Session 的操作，不同 Session 可并行；传给 operation 的 signal 同时响应调用者取消和资源关闭。operation 必须等待实际工作结束，不能遗留无所有者的后台任务。

`get` 和 `run` 均检查 `ctx.get('agents')?.get(agent.id) === agent`，拒绝旧激活或伪造的同 id 对象。`dispose()` 停止新获取并等待资源及操作静默；清理失败时抛出聚合错误并保留相应独占占用。provider 的 effect 清理应先等待 `dispose()` 成功，再释放 `BrowserUseRegistry` 的槽。此公开实验包可被具体 provider 复用，但不是所有 browser provider 的强制实现方式。

## BrowserMcpLaunchConfig

**公开导出**：`BrowserMcpLaunchConfig` 来自 `@deepseek-ai/dsh-experimental-browser-use-runtime/mcp`。
`@deepseek-ai/dsh-experimental-browser-use-runtime/mcp` 的启动分支要求 `mode: 'launch'`，`headless` 是解析后的布尔值；其 `BrowserMcpConfig` Schema 在省略时填入 `true`。可选 `executablePath` 指定 Chromium 可执行文件，可选 `toolCallTimeoutMs` 必须为正数。此配置选择每个活跃 Session 新建隔离浏览器；实际可执行文件发现和启动失败由具体 MCP server 报告。

## BrowserMcpAttachConfig

**公开导出**：`BrowserMcpAttachConfig` 来自 `@deepseek-ai/dsh-experimental-browser-use-runtime/mcp`。
同一子路径的附着分支要求 `mode: 'attach'` 和 `endpoint`，可选正数 `toolCallTimeoutMs`。`endpoint` 应是现有浏览器的 HTTP(S) 或 WS(S) 调试端点；调用 `validateBrowserMcpConfig` 在资源获取前检查格式。附着的外部浏览器应以独占策略预留，且浏览器本身的所有权与关闭方式由具体 provider 决定。

## BrowserMcpConfig

同一子路径同时导出 `BrowserMcpConfig` 联合类型和同名 Schema。调用 Schema 解析 `BrowserMcpLaunchConfig` 或 `BrowserMcpAttachConfig`；`mode` 决定分支，两者都可含 `toolCallTimeoutMs`。Schema 负责形状、默认值和基础约束，附着地址仍需 `validateBrowserMcpConfig` 做完整 URL 检查。无效配置应在注册 provider 或预留浏览器前失败。

## validateBrowserMcpConfig

`validateBrowserMcpConfig(config: BrowserMcpConfig): void` 在 `mode: 'attach'` 时解析并检查端点协议，只接受无空白的 HTTP(S)/WS(S) URL；`launch` 分支直接返回。非法地址抛错，调用方应在获取资源和保留 browser-use 名称槽前运行它。函数不检查端点是否可达，也不验证浏览器权限。

## SessionMcpOptions

`SessionMcpOptions` 用于 `mountSessionMcp`：`name` 是 provider 身份和 MCP 工具命名空间；`exclusive` 决定是否只有一个活跃 Session 可附着；`command` 和 `args` 直接启动 MCP server，不经过 shell；可选 `env` 覆盖客户端清理后的子进程环境，可选 `toolCallTimeoutMs` 覆盖工具超时。命令不存在、MCP 启动失败或连接中断会在实际装载与调用时暴露，配置对象本身不证明浏览器可用。

## mountSessionMcp

`mountSessionMcp(ctx, options)` 在 `@deepseek-ai/dsh-experimental-browser-use-runtime/mcp` 中公开。它保留 `BrowserUseRegistry` 名称槽，并为每个未来创建的 Agent 建立 Session 所有的 MCP client；同一 Session 的调用串行化，工具与提示词限制于拥有该连接的 Session。忙碌的独占附着使该 Agent 不获得浏览器工具；provider 卸载先关闭所有 server 和操作，再释放注册槽。Playwright MCP 与 Chrome DevTools MCP 的目标版本实现均调用此函数，见 [HOW-TO](../how-to/how-to-infra-provider-browser-use.md#复用-session-资源或-mcp-组合助手)。仍须用真实 MCP server 和浏览器验证工具可见性、取消、权限和关闭行为。

## 装载与验证

Profile 先装载 registry，再装载恰好一个具体 provider；Playwright MCP provider 还依赖 `agents`、`tools`、`systemPrompt`，并在每个 Session 中管理 MCP 工具与浏览器资源。验证 `providerName`、重复注册拒绝、卸载前资源静默、卸载后名称清空；另用真实浏览器和工具调用验证页面可见结果。静态注册测试不能证明浏览器已启动或隔离正确。
