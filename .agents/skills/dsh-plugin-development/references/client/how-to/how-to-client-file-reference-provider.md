# 为 `@file` 提供 Host 发现后端：任务指南

## 为 `@file` 提供 Host 发现后端

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。Host Profile 已有 Agent、Session Controller 的 `fileReferences` Remote adapter；先读[引用契约](../api/api-client-references.md)。完整后端骨架见[文件引用示例](../examples/example-client-file-reference-provider.md)。

### 步骤

1. 新 Host 服务继承 `FileReferenceService`，实现 `list(agent,query,signal)`。从目标 Agent 的 Session cwd 建立授权搜索范围；结果仅含 `{ path, kind }`，排序稳定，目录/文件类型准确。取消后停止 I/O 与后台索引。
2. 在 Host Profile 只启用一个 `fileReferences` provider。若替换内置 `file-reference-local`，停用其 Loader 行；两个实现同名服务会冲突。需要自定义搜索配置时检查内置 provider 的 `maxResults`、`maxEntries`、`excludedDirectories` 是否已经满足需求。
3. 保留 `SessionFileReferences` adapter 和 Client assembly；Web `ui-reference` 用 `remote.fileReferences.list` 读候选。Client 选中时走 `formatFileMention`，不能将搜索候选当成已读取的文件内容。
4. 用两个 Agent 的不同 cwd、含空格路径、目录续写、非法控制字符、取消与卸载验证。Session 切换后旧候选不得回写新输入框。

### 完成判据

同一 Profile 中 `@file` 可发现目标路径，取消/切换后无过期结果，卸载 provider 后没有残留服务。若只运行 Host 搜索单测，不能声称 Web 组合已验证。
