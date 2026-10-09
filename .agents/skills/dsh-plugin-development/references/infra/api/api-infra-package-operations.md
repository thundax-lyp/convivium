# 嵌入式应用的 Profile 包操作

## runPluginCommand

`@deepseek-ai/dsh-plugin-manager/operations` 的 `runPluginCommand(context, args, options): Promise<PackageResult>` 供持有 profile 目录和包管理器的应用壳调用。它在 profile `package.json` 的写锁内初始化缺失 profile，并将包操作交给 `runProfilePnpm`。普通插件无需直接调用；使用者从 `dsh plugin --profile` 或已挂载的 `ctx.pluginManager` 进入。

`PackageOperationContext` 必须给出 `profile`、`installAnchor` 和调用目录 `cwd`；可指定应用自有 `dir` 与 `home`。`PackageOperationOptions.execution` 是 `'cli' | 'service'`，并要求 `outputBytes`；其余选项包括 `command`、`args`、`env`、`signal`、`onOutput`、`activateNewBundles`、`lockWaitMs`、`idleTimeoutMs`、`lookupTimeoutMs`。CLI 继承终端与认证环境，service 清理父进程环境并截取有界诊断；选错模式会改变运行行为与凭据暴露边界。

## PackageResult

结果包含 `exitCode`、有界 `output`、`truncated`、诊断 `logPath`，并可能包含 `timedOut` 与不兼容包详情。非零退出时不能假定所有文件已回滚；读取返回诊断和 profile manifest 再决定重试。安装包可以运行被允许的构建脚本；调用方不能把包管理操作当作沙箱内的纯配置更新。

`runProfilePnpm` 是较低层的已初始化 profile 操作，不持有 `runPluginCommand` 的外层锁；一般应用壳使用后者。`./registry` 导出注册表常量和选择辅助，`./types` 导出管理结果类型；`./remote`、`./typert` 是生成的 Remote 贡献项，业务方法的类型 owner 归 Remote 主题。

对象证据：`packages/boot/plugin-manager/src/operations.ts`、`apps/cli/src/plugin.ts`、`packages/boot/plugin-manager/tests/`。常规安装步骤见[Profile 安装](../how-to/how-to-infra-profile-bundle.md#在-profile-中安装并检查组合包)。
