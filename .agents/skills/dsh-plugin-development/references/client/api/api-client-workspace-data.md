# Workspace 实体与变更摘要的分侧契约

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Host 的 `ctx.workspaceRegistry` 管理持久 Workspace 实体；Client 普通导航经[UiWorkspace](api-client-sidebar.md)与 Workspace Controller Remote。`workspace-changes` 在 Host 为活动 Session 保留逐轮变更摘要；Client 的内置 deliverables UI 经自己的 Host presentation 路由访问摘要，并无直接 `ctx.remote.workspaceChanges`。

## `WorkspaceRegistry`

**公开导出**：`WorkspaceRegistry` 来自 `@deepseek-ai/dsh-workspace`。
`@deepseek-ai/dsh-workspace` 的 Host Cordis service 提供 `create(path,title?)`、`get(id)`、`list()`、`delete(id)`、`resolveByPath(path)` 与排序 `insertBefore(id,beforeId?)`。`archiveSession`、`unarchiveSession`、`pinSession`、`unpinSession` 修改 Session 归属状态；归档前 `workspace/session-activity` waterfall 可由插件报告活跃任务，`stopActivity` 选项会在持久归档后向 `workspace/session-stop` 监听者发停用请求。Host 插件参与这两个事件须保留会话日志的正常结束路径。证据：`packages/workspace/workspace/src/index.ts`。

操作顺序与失败处理见[Host Registry 操作](../how-to/how-to-client-workspace-registry.md)。

## `WorkspaceId`

`WorkspaceId` 是记录身份而非目录路径；`WorkspaceId(id)` 在拥有该值的边界品牌化字符串。不要用展示标题或路径替代稳定 ID。证据：`packages/workspace/workspace/src/{index.ts,types.ts}`。

## `Workspace`

**公开导出**：`Workspace` 来自 `@deepseek-ai/dsh-workspace`。
`path` 是创建时规范化的目录，`title` 可重复，`sessionIds` 已按持久候选和会话 header cwd 双重核验。`setTitle`、会话附着和排序操作写入持久域。证据：`packages/workspace/workspace/src/types.ts`。

## `WorkspaceChanges`

`@deepseek-ai/dsh-workspace-changes/types` 的 `WorkspaceChanges` 服务在 Host 注册为 `ctx.workspaceChanges`。`summary(sessionId,seq)` 读取 `workspace/changes` Session event 对应的 `WorkspaceChangesSummary`；`diff(sessionId,seq,index,signal)` 按摘要文件索引取 `WorkspaceFileDiff`，可取消。Session 释放后均可能返回 `undefined`。摘要的 `total` 可大于 `files.length`；`binary`、`oversized` 文件没有行级 diff。无 git 或仓库外只记录文件工具编辑。证据：`packages/deliverables/workspace-changes/src/{index.ts,types.ts}`。

## `WorkspaceChangesSummary`

**公开导出**：`WorkspaceChangesSummary` 来自 `@deepseek-ai/dsh-workspace-changes/types`。
记录 `turn`、`cwd`、文件列表及增删行数；`snapshot` 只在成功取得 git 起止树时存在。文件 `path` 可为相对工作目录或 Host 绝对路径，Client 展示前应走已授权的转发路径，不把 Host path 当作浏览器 URL。证据：`packages/deliverables/workspace-changes/src/types.ts`。

`files` 是按显示顺序、受 `maxFiles` 上限约束的 `WorkspaceChangedFile[]`；`total` 是未截断的完整文件数，可能大于 `files.length`。`added` 与 `deleted` 是整个摘要的增删行总数，包含因文件列表上限而未列出的文件；二进制或过大文件的逐文件行数为零。

## `WorkspaceFileDiff`

**公开导出**：`WorkspaceFileDiff` 来自 `@deepseek-ai/dsh-workspace-changes/types`。
判别 `kind: 'text'|'binary'|'oversized'`；文本可能因计算超时退化为 `coarse` 整文件替换。`diff` 的 `index` 是摘要 `files` 中的索引，不是路径或排序后的任意行号。证据：`packages/deliverables/workspace-changes/src/types.ts`。

## Client 边界

目标内置 `ui-deliverables` 的 Host 半侧注入 `workspaceChanges` 并提供 presentation 路由，Client 半侧根据 `workspace/changes` 事件取得摘要；第三方 Client 插件不能仅靠安装 `workspace-changes` 就调用该 Host 服务。要新建 Client 读取路径，需发布经授权的 Host Remote 或使用既有明确公开的 presentation 契约并在真实 Profile 核查。步骤见[消费变更摘要](../how-to/how-to-client-workspace-changes.md)。
