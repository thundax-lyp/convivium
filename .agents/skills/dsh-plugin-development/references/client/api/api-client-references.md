# Client 引用与 Host 发现服务

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@file` 与 `@session` 的 Client 候选经两个独立 Remote namespace 获取。前者允许 Host 替换 `ctx.fileReferences` provider；后者由 `SessionReferenceResolver` 按 Session 快照提供候选和持久上下文。通用 Client 输入扩展仍以[输入触发源](api-client-interaction.md)为契约。

## `FileReferenceService`

`@deepseek-ai/dsh-file-reference` 的 Host 抽象服务注册为 `ctx.fileReferences`。实现 `list(agent,query,signal)` 返回确定性、仅路径的 `FileReferenceCandidate[]`；`agent` 的 Session cwd 限定发现范围。调用方取消后应停止遍历/索引，服务随 Cordis fiber 清理。`@deepseek-ai/dsh-file-reference-local` 的 `LocalFileReferenceService` 是一个实际后端，使用有界模糊索引，不是唯一可实现者。证据：`packages/context/file-reference/src/index.ts`、`packages/context/file-reference-local/src/index.ts`。

## `FileReferenceCandidate`

**公开导出**：`FileReferenceCandidate` 来自 `@deepseek-ai/dsh-file-reference`。
`path` 是可插入提示词并供普通文件工具读取的路径；`kind` 为 `file` 或 `directory`。候选只表明路径可被建议，不代表文件内容已读取。证据：`packages/context/file-reference/src/types.ts`。

## `activeAtToken`

`@deepseek-ai/dsh-file-reference/grammar` 的 `activeAtToken(line,cursorCol)` 解析当前 `@` 或 `@"...` token，返回其前缀、查询片段和是否由引号打开；其他位置返回 `undefined`。证据：`packages/context/file-reference/src/grammar.ts`。

## `formatFileMention`

`formatFileMention(candidate,preserveQuote)` 生成安全的 `@` 插入文本；含空格路径加引号，目录保留续写用的末尾 `/`，无法安全表示的路径返回 `undefined`。候选确认后才插入，不把路径建议误当文件内容。证据：`packages/context/file-reference/src/grammar.ts`。

## `LocalFileReferenceService`

**公开导出**：`LocalFileReferenceService` 来自 `@deepseek-ai/dsh-file-reference-local`。
内置 `file-reference-local` provider 的 `Config` 控制 `maxResults`、`maxEntries` 和 `excludedDirectories`；配置错误会在装载时失败。它缓存每个 Agent 的工作目录索引，在 Agent 销毁和文件工具结果后释放或失效。自定义 provider 应实现同一抽象服务，而非继承本地文件系统实现。证据：`packages/context/file-reference-local/src/index.ts`。

其 `list(agent,query,signal)` 是对抽象 `FileReferenceService.list` 的实现，按 Agent cwd 选择或创建搜索索引，再返回 `Promise<FileReferenceCandidate[]>`；调用方取消信号仍需传入，不能在 provider 外直接共享不同 Agent 的索引。

## `WorkspaceFileSearch`

**公开导出**：`WorkspaceFileSearch` 来自 `@deepseek-ai/dsh-file-reference-local/search`。
`@deepseek-ai/dsh-file-reference-local/search` 公开可复用的有界搜索器。用 root 和配置构造后，`list(query,signal)` 返回排序候选；`invalidate()` 标记索引过期但允许已有索引在重建期间继续回答；`dispose()` 中止遍历。它只处理搜索，不注册 `ctx.fileReferences`，调用方仍须实现 `FileReferenceService`、按 Agent 生命周期管理实例，并核查路径授权。证据：`packages/context/file-reference-local/src/search.ts`。

## `FileSearchConfig`

**公开导出**：`FileSearchConfig` 来自 `@deepseek-ai/dsh-file-reference-local/search`。
`maxResults` 限制一次候选数，`maxEntries` 限制索引条目，`excludedDirectories` 指定不遍历的目录 basename。配置必须使用正安全整数与有效目录名；这些限额是搜索器资源边界，不能用结果截断代替索引上限。证据：`packages/context/file-reference-local/src/search.ts`。

## `SessionFileReferences`

`@deepseek-ai/dsh-api-session-controller` 的 Host adapter 把 `ctx.fileReferences.list` 以 `fileReferences.list` Remote 提供。Client 的 `ctx.remote.fileReferences.list(sessionId,query,signal)` 返回 `RemoteResult<FileReferenceCandidate[]>`；真实装配须同时有 provider、Session Controller Remote 和 Client assembly。它不是从 `dsh-file-reference` 包自动导出的独立 Remote。证据：`packages/api/session-controller/src/file-references.ts`、`packages/api/remotes/src/client/index.ts`。

## `SessionReferenceResolver`

**公开导出**：`SessionReferenceResolver` 来自 `@deepseek-ai/dsh-session-reference`。
`@deepseek-ai/dsh-session-reference` 的 Host 服务 `ctx.sessionReferenceResolver` 有 `listCandidates(agent,query?,limit?,signal?)` 与 `prepare(agent,content,references,signal?)`。前者从 Session 元数据/投影列出候选并排除当前 Agent；后者精确读取引用 Session，按预算生成可持久记录的**不可信**上下文。`@Remote('candidates')` 的 `remoteExportCandidates(agent,query,signal)` 是 Client 可见候选入口，`prepare` 并非直接 Remote。证据：`packages/context/session-reference/src/index.ts`。

## `SessionReferenceMentionCandidate`

在 `SessionReferenceCandidate` 上增加规范 `mention`，由 Host 格式化 由 `dsh-session:` URI 表示的 mention。Client 使用返回的 `mention`，不要自己按标题拼 URI；标题、工作目录和 `sameWorkspace` 用于展示/排序，不作授权证明。`ctx.remote.sessionReferenceResolver.candidates(sessionId,query,signal)` 返回 `RemoteResult<SessionReferenceMentionCandidate[]>`。证据：`packages/context/session-reference/src/{index.ts,types.ts,uri.ts}`、`packages/client/ui-reference/src/client/index.ts`。

## 组合边界

`file-reference-local` 是 Host 本地文件系统实现，可被符合 `FileReferenceService` 的 provider 替换；多个 provider 同时注册同一 Cordis service 会冲突。`session-reference` 的 `./remote` 已被目标版本 `api-remotes` assembly 收入；独立发行包新增命名空间仍需证明接入 assembly/Profile。步骤见[文件引用 Provider](../how-to/how-to-client-file-reference-provider.md)与[Client 引用候选](../how-to/how-to-client-reference-candidates.md)。
