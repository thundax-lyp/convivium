# 自定义 Profile 的应用参数

## 为自定义 Profile 解析应用参数

让 `dsh --profile <name> --my-flag value` 中的应用参数配置自己拥有的启动服务。先读 [CmdlineArgs 与 parseCmdline](../api/api-infra-cmdline.md#cmdlineargs)。

### 实现步骤

1. 在应用启动插件注入 `cmdlineArgs`，创建自己的 commander program 并声明 action；通过 `parseCmdline(ctx, program)` 解析本次快照。完整配置与代码见[应用参数示例](../examples/example-infra-app-args.md)。
2. 在 action 中校验并发布服务。消费行注入该服务后再执行配置表达式；不要让多个解析插件以顺序副作用争夺同一 flag。
3. 把启动插件和消费行放入 profile bundle 或 patch，使用 `dsh --profile <name> --dump-config` 检查静态行，再实际启动验证服务值。

### 验证与完成边界

分别运行有效参数、`--help` 与非法参数；有效参数应覆盖配置默认，帮助应以 0 退出且不启动依赖行，非法输入应非零退出。没有解析者的应用参数不会自动报错，须由应用自己定义处理。
