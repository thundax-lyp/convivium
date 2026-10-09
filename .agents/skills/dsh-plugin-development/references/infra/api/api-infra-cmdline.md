# 应用自有命令行参数

## CmdlineArgs

**公开导出**：`CmdlineArgs` 来自 `@deepseek-ai/dsh-cmdline`。
`@deepseek-ai/dsh-cmdline` 公开 `ctx.cmdlineArgs`，其 `get(): readonly string[]` 返回 `dsh` 启动器消费自身 flag 后留下的只读参数快照。读取它不会消耗参数，因此多个应用插件可观察同一列表；没有参数时为空列表。`dsh --profile demo --port 8080` 的 `--port 8080` 是应用参数，只有目标组合自己的解析插件定义其含义。嵌入式 Host 可能没有提供该可选 Context 值，调用方先确认它存在。

## parseCmdline

应用插件可用自己的 commander `Command` 定义 flag 和 action，再调用 `parseCmdline(ctx, program)`。成功解析时 action 发布应用服务；`--help`、`--version` 或非法输入交给 `ctx.appExit`，依赖该服务的行不应激活。低层 `provideCmdline` 属启动器装配入口，普通 profile 插件只消费 `cmdlineArgs` 与 `parseCmdline`。

## AppExit

**公开导出**：`AppExit` 来自 `@deepseek-ai/dsh-cmdline`。
`ctx.appExit(code)` 请求整个应用沿启动器关停路径退出，适合一次性或 stdio 应用。`exitOnStdinEnd(ctx, label)` 在成功启动后把 stdin EOF 绑定到正常退出，保留协议传输已缓冲输入；属于所属 fiber 的监听在卸载时释放。普通插件不应因自身可恢复错误直接退出整个 profile。

对象证据：`packages/boot/cmdline/src/index.ts`、`packages/boot/cmdline/README.zh.md`、`apps/cli/src/args.ts`、`packages/bundle/web-app/src/startup.ts`。操作见[应用参数 HOW-TO](../how-to/how-to-infra-app-args.md#为自定义-profile-解析应用参数)。
