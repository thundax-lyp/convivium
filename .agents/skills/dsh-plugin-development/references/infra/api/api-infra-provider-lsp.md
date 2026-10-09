# LSP 语义查询 provider

## 对象关系与使用场景

`@deepseek-ai/dsh-lsp` 在 Host 提供 `ctx.lsp`：插件注册文件扩展名与 `LspProvider`，消费者按请求文件扩展名调用四种语义查询。`@deepseek-ai/dsh-lsp-stdio` 是目标版本的通用 stdio provider 插件，使用同一执行世界中的 `ctx.fs` 与 `ctx.subprocess`。自定义 provider 的注册任务见[HOW-TO](../how-to/how-to-infra-provider-lsp.md#为文件扩展名注册-lsp-provider)。

## Lsp

`Lsp.registerProvider(provider: LspProvider): () => void` 在发布前校验非空 `id`、至少一个有效扩展名及非空 language id；扩展名标准化为小写且带点。重复 id 或扩展名冲突抛 `LspError`，错误码 `LSP_CONFLICT`；输入不合法抛 `LSP_INVALID_PROVIDER`。校验原子化，失败不留下部分路由。返回的 disposer 注销 id 和所有扩展名，注册也归调用 fiber 所有。

`Lsp.query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>` 依据 `filePath` 最后一个扩展名选 provider，补入配置的 `languageId` 后转发。没有路由抛 `LSP_UNAVAILABLE`。

## LspProvider

`LspProvider` 包含 `id: LspProviderId`、`extensionToLanguage: Readonly<Record<string,string>>`、`query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>`。provider 负责取消、工作区规范化、文件读取、服务器连接及错误清理；若实现 `findReferences`，必须包含声明。

## LspProviderId

公开工厂 `LspProviderId(id: string)` 把稳定字符串转成品牌类型，不在工厂处校验；空 id 由 `Lsp.registerProvider` 拒绝。

## LspQueryRequest

**公开导出**：`LspQueryRequest` 来自 `@deepseek-ai/dsh-lsp`。
调用者必须提供 `operation`、`filePath`、`position`、`workspaceRoot`。`workspaceRoot` 不默认；`position.line` 和 `position.character` 都是从零开始的 UTF-16 坐标。`operation` 限 `goToDefinition`、`findReferences`、`goToImplementation`、`hover`。

## LspProviderQuery

**公开导出**：`LspProviderQuery` 来自 `@deepseek-ai/dsh-lsp`。
`Lsp.query` 向 provider 传入上述调用者请求，并按注册映射补入 `languageId`。language id 不参与路由选择。

## LspQueryResult

**公开导出**：`LspQueryResult` 来自 `@deepseek-ai/dsh-lsp`。
导航结果为 `{ kind: 'locations', locations, resolvedWorkspaceUri }`，其中每个 location 带 URI 与零基 UTF-16 半开区间；`resolvedWorkspaceUri` 是 provider 解析后的规范工作区 URI，消费者据此相对化目标，不应从原始主机路径推断。悬停结果为 `{ kind: 'hover', hover: { contents, range? } | null }`。两个分支构成封闭联合，不能增加私有结果 kind 让现有消费者猜测。

## 装载、失败与验证

先装载 `@deepseek-ai/dsh-lsp`，再装载注册 provider 的插件；若用 stdio 实现，还要在同一 Host 配置 `fs`、`subprocess` 服务与 language-server 命令。`@deepseek-ai/dsh-tool-lsp` 才把查询提供给模型。直接用 `ctx.lsp.query` 验证匹配路由、未知扩展名、取消与卸载后路由释放；声明编译不能替代真正启动语言服务器和读取文件的测试。
