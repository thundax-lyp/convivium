# 进程与受限命令执行

## 对象关系与使用场景

`SubprocessRuntime` 拥有进程范围、stdio 和 PTY 原语；`SandboxProvider` 把 argv 包装成受限命令；`ShellExecutor` 将命令请求解析成完整 spec 并返回前台/后台共用句柄。插件通常调用 `ctx.shell`，部署 Profile 选择本地或远端 subprocess、sandbox 和 shell 后端。同一个文件系统与 subprocess 必须在同一执行世界。任务见 [受限命令 HOW-TO](../how-to/how-to-infra-provider-execution.md#通过-shellexecutor-运行受限命令)。

## SubprocessRuntime

**公开导出**：`SubprocessRuntime` 来自 `@deepseek-ai/dsh-subprocess`。
`@deepseek-ai/dsh-subprocess` 的抽象 Service 注册为 `ctx.subprocess`；实现必须提供 `resolveExecutable(command, env?, signal?)`、`terminalEnvironment(signal?)`、同步 `spawn(spec): SubprocessHandle` 和异步 `spawnTerminal(spec): Promise<SubprocessTerminalHandle>`。`spawn` 不添加命令、路径、环境、期限或 stdio 默认值；调用者提交完整 spec。处理环境时，`scrubbedParentEnv()` 去除凭据形名称与 `DSH_*` 变量，明确提供的 `env` 在其后合并。`resolveExecutable` 对裸命令查 PATH，对绝对路径验证，拒绝含分隔符的相对命令。

Service 卸载须终止并等待仍在管理的进程。真实后端要单独证明进程树、退出观察、信号、取消与 PTY 清理；`subprocess-local` 和 `subprocess-ssh` 是具体实现，不由这份静态文档验证。

## SubprocessHandle

**公开导出**：`SubprocessHandle` 来自 `@deepseek-ai/dsh-subprocess`。
`done` 报直接命令退出事实，`terminate()` 启动对受管理范围的终止，`waitForExit()` 等该范围真正静默；两者不能混成同一判据。collect 模式以 `collected.stdout`/`stderr.readFrom(offset)` 非消费式读取，丢失头部时报告 `lossy` 与可用 spill 文件。pipe 模式的原始流由调用者消费。

## SandboxProvider

**公开导出**：`SandboxProvider` 来自 `@deepseek-ai/dsh-sandbox`。
`@deepseek-ai/dsh-sandbox` 的抽象 Service 注册为 `ctx.sandbox`。`confine(argv, policy, signal?)` 接收完整 argv 与逐次调用的 `SandboxPolicy`，返回 `ConfinedArgv` 或拒绝；绝不能静默透传未受限命令。`policy.mode` 仅允许 `read-only` 与 `workspace-write`，还携带绝对 `workspaceRoot` 和可选 `sessionId`。`danger-full-access` 不作为 `confine` 的输入。

没有可用隔离后端时用 `SandboxUnavailableError` / `SANDBOX_UNAVAILABLE` 失败关闭。具体 OS 保护强度、降级与逃逸边界仍需平台集成测试。

## ConfinedArgv

**公开导出**：`ConfinedArgv` 来自 `@deepseek-ai/dsh-sandbox`。
结果含替换后的 `argv`、`enforcement: 'full' | 'partial'`、本后端专属的 `denialSignatures` 和 `runnerFailureRules`。`partial` 不能满足要求绝对边界的调用方；runner 启动失败须先于命令拒绝分类，否则会把“命令根本没运行”误报成沙箱有效拒绝。

## ShellExecutor

**公开导出**：`ShellExecutor` 来自 `@deepseek-ai/dsh-shell`。
`@deepseek-ai/dsh-shell` 的抽象 Service 注册为 `ctx.shell`。先调用 `resolve(request: ShellExecRequest): ShellExecSpec` 应用后端默认值和上限，再将完整 spec 交给 `execute(spec): Promise<ShellExecution>`。`sandboxMode` 只报告默认模式或 `undefined`，逐次执行仍看 spec policy。`onExpiry: 'none'` 不设置期限，`'kill'` 在到期后终止；结果中的第一次原因不能靠最终退出码反推。

## ShellExecution

**公开导出**：`ShellExecution` 来自 `@deepseek-ai/dsh-shell`。
`result()` 是前台投影：普通非零退出、超时杀死和取消杀死均以带 `exitCode`、`timedOut`、`aborted`、stdout/stderr 的结果结算；只有基础设施失败拒绝。后台调用可持有同一句柄、读取增量输出并在所有者边界终止。

从 `ShellProcess` 继承的 `done: Promise<void>` 在底层进程结算时 resolve，目标实现中不 reject；provider 启动失败被表示为 `killed` 状态及 stderr 说明。`readOutput(): ShellProcessRead` 消费自上次读取后的输出，连续两次不会重复交付；缓冲丢失时检查 `lossy` 和可用 spill 路径，独立观察者应使用非消费式 `observed`。`kill(): boolean` 终止 provider 管理的进程范围，已结束时返回 `false`，重复调用安全。`done` 只表示进程静默，读取输出和 `result()` 的前台分类仍是各自独立的消费路径。

## 装载与验证

Profile 每种抽象 Service 只能选一个具体后端；受限 Bash 可组合 `dsh-subprocess-local`、`dsh-sandbox-local`、`dsh-bash-sandbox`，具体依赖由目标版本 Profile patch 核实。直接验证 `resolve`/`execute`、非零退出、取消、超时和卸载；隔离强度与进程范围需要平台测试。静态示例只展示消费路径，不能作为后端隔离或进程树安全证明。
