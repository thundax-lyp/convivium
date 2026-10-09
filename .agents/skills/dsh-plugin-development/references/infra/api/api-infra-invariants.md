# Profile 运行时不变式

`@deepseek-ai/dsh-invariants` 是可选的 Cordis Service。它本身不提供检查；被装载的 package companion 才注册其拥有的数据关系。Profile 要求实时自检时先装载 registry，再装载对应 companion。不要把“服务存在”或“方法可调用”当作运行时不变式。

## InvariantRegistry

`ctx.invariants` 由 `InvariantRegistry` 提供。`register(packageName, installer)` 以完整 npm 包名占有一个登记位；同名重复登记失败。返回的 disposer 与当前 fiber 关联，卸载 registry 或 companion 都会移除监听器和占有。选中的 installer 在独立子 fiber 中运行，异步安装失败会撤销已建资源并释放占有。未通过过滤的包名仍被保留，避免重复登记被静默忽略。

插件自己的 companion 只检查该包拥有的事件流与可变快照关系。监听器应由子上下文 `ctx.on`、`ctx.effect` 等 API 管理；不要在顶层留下不受 fiber 所有的定时器或事件订阅。装载和失败路径见 [不变式 HOW-TO](../how-to/how-to-infra-invariants.md)。

## InvariantInstaller

`InvariantInstaller` 接收子 `Context` 与已经绑定 `packageName` 的 `fail(message)`；可返回 `void` 或安装完成的 Promise。`inject` 声明检查所需服务，安装在依赖就绪后进行。调用 `fail` 会抛出带包归属的 `InvariantError`，不要捕获并改写为成功。

## InvariantError

`InvariantError.code` 固定为 `INVARIANT`，`packageName` 是报告失败的完整 npm 包名。消费者可用两字段分类诊断；message 是面向人类的关系违约说明，不应作为稳定机器解析格式。

## Config

**公开导出**：`Config` 来自 `@deepseek-ai/dsh-invariants`。
`enabled` 默认开启；`package_allowlist` 和 `package_blocklist` 是大小写敏感的 JavaScript 正则源码数组，空 allowlist 接受全部，blocklist 在 allowlist 后否决。空白、无效或重复表达式会阻断 service 启动；配置在该 service 生命周期内固定，变更需重载。Profile 中的最小装载组合见 [示例](../examples/example-infra-invariants.md)。
