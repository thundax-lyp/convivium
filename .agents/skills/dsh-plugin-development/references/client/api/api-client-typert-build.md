# Typert 构建接入

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。此页说明发布 [Host Remote](../how-to/how-to-client-publish-remote.md) 时的构建插件；端点与 wire 契约见 [Remote](api-client-remote.md)。

## typertPlugin

`@deepseek-ai/dsh-typert-generator/tsdown` 的 `typertPlugin(options?)` 返回 tsdown/rolldown 兼容插件。它在 `transform` 阶段降级 TypeScript 标准装饰器，在 `writeBundle` 阶段从输出目录定位 workspace 和包；没有 `./typert` 导出的包会跳过生成。调用前须先完成目标 workspace 的 TypeScript 编译，因为此插件生成时关闭重复诊断。生成失败应让构建失败，不能保留旧 artifact 冒充当前签名。

## TypertPluginOptions

**公开导出**：`TypertPluginOptions` 来自 `@deepseek-ai/dsh-typert-generator/tsdown`。
`mode?: 'package' | 'workspace'` 控制只为当前包生成，或对 workspace 中显式贡献者生成；`faces?: readonly TypertFace[]` 选择独立的 Host/Client 编译面。默认使用 package 模式和生成器发现的 faces。`workspace` 模式适合根构建；独立包须核查其 tsdown 配置、输出目录和 `./typert`/`./remote` 声明能被此插件识别。不要把目标仓库相对配置路径复制为 npm 消费项目配置。

验证时清空旧生成输出，构建后确认 Host descriptor、Client 声明和 codec 与新签名对应，再分别编译 Host/Client，并在实际 Profile 中调用端点。对象的运行时发布仍由 [Remote HOW-TO](../how-to/how-to-client-publish-remote.md) 完成。
