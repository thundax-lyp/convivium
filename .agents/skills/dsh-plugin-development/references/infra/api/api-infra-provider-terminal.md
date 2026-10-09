# 持久 PTY 会话后端

## 对象关系与使用场景

`@deepseek-ai/dsh-terminal` 的 `ctx.terminals` 注册不同 `TerminalBackend.type`，由精确的 Agent owner 创建、发送、读取、信号和关闭 PTY 会话。`@deepseek-ai/dsh-terminal-bash` 是已发布 Bash 后端，底层消费 `ctx.subprocess.spawnTerminal`。模型工具 `@deepseek-ai/dsh-tool-terminal` 另行提供。任务见 [PTY HOW-TO](../how-to/how-to-infra-provider-terminal.md#在-agent-作用域中使用持久-pty)。

## TerminalSessionService

**公开导出**：`TerminalSessionService` 来自 `@deepseek-ai/dsh-terminal`。
`registerBackend(backend): () => void` 登记非空且唯一的 `type`，返回 effect disposer；重复类型报 `DUPLICATE_BACKEND`。`listBackends()` 枚举已注册类型。`spawn(owner, { type, name?, cwd? }, signal?)` 在资源初始化成功后发布会话并返回 registry 生成的 id、状态与 `motd`；失败的未发布资源由 backend 清理。其余调用始终携带同一个 `owner`，不能仅凭 id 越权访问。

`startSend(owner, id, request)` 返回独占发送操作；`read(owner, id, request?)` 分页读有界 scrollback；`signal(owner, id, signal)` 只对验证过的前台进程组送信号；`kill(owner, id, reason?)` 关闭并等待静默；`list(owner)` 只返回该 owner 可见会话。`hasOwnerActivity(owner)` 可用于清理/切换判据。会话是进程内活资源，不能把模型历史中旧 id 当作重启后仍可用。

## TerminalBackend

`type` 是稳定路由名，`spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>` 接受 registry 生成的 `sessionId`、精确 `owner`、可选 `signal` 及请求字段。实现必须在返回前完成初始化；拒绝时清理局部进程，清理也失败时用 `TerminalBackendCleanupError` 保留两个原因。

## TerminalBackendSession

**公开导出**：`TerminalBackendSession` 来自 `@deepseek-ai/dsh-terminal`。
后端会话提供 `motd`、可选 `pid`、`startSend`、`read`、`signal`、`status` 与幂等异步 `close(reason)`。一次只能有一个活动 send；`TerminalSendOperation.done` 与增量 `readOutput()` 报等待原因、top-level 状态和截断，而非任意子进程完成。`close` 须等待所拥有进程树静默，注销后端或 owner 卸载不能遗留 PTY。真实后端的前台进程组识别、PTY 字节传输与子孙回收必须独立平台验证。

## 装载与验证

Profile 先装载 `dsh-subprocess` 的具体实现与 `@deepseek-ai/dsh-terminal`，再装载 backend 和工具。用同一 Agent owner 测 spawn、send、read、kill；换另一个 owner 测拒绝；卸载或 owner 结束后确认会话静默。示例使用现成 backend，不宣称自定义 PTY 后端已验证。
