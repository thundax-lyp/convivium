# 消费逐轮 Workspace 变更摘要：任务指南

## 消费逐轮 Workspace 变更摘要

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Host Profile 已装载 `workspace-changes`。先读[Workspace 数据契约](../api/api-client-workspace-data.md)。本任务针对 Host 插件或已有 Host presentation；普通 Client 插件须先有已核实的 Remote/路由才能读摘要。

### 步骤

1. 在 Host 监听 `workspace/changes` Session event，保留事件的 `sessionId` 与 `seq`；以 `ctx.workspaceChanges.summary(sessionId,seq)` 取摘要。返回 `undefined` 表示 Session 已释放、该 Host 未记录或序号无记录，不能伪造空变更。
2. 按 `summary.files` 显示可列出的文件，并用 `summary.total` 呈现截断事实。需内容比较时以原 `files` 索引调用 `diff(sessionId,seq,index,signal)`；取消关闭的视图。处理 text/binary/oversized 和 `coarse` 四种展示情况。
3. 如果要给浏览器显示，定义明确的 Host 授权/序列化入口，校验 Session 与文件索引，再转发不含未授权 Host 绝对路径的信息。目标内置 `ui-deliverables` 已有自己的 Host presentation 路径，可作为实现证据，但不自动成为第三方公共 Remote。
4. 验证 git 仓库、非 git 工作目录、超出文件数/字节限制、取消比较及 Session 释放后的 `undefined`。

### 完成判据

变更摘要与原事件序号匹配；截断、二进制、过大与过期状态可辨；Client 使用路径经过真实授权验证。仅看到 `workspace/changes` 事件不代表可以直接从浏览器读取 diff。
