# DSH API 取证顺序

DSH 处于 developer preview，版本间可能存在破坏性变化。所有 API 结论都必须带版本和来源，不把记忆、旧教程或单个插件实现当作契约。

## 真相来源

以下是 DSH 官方来源，按权威程度使用。GitHub 仓库中的 `docs/` 和源码是原始来源；文档站是同一套内容的发布/渲染入口，适合导航和阅读，但不替代原始文件。

| 主题 | 官方真相来源 | 用途 |
| --- | --- | --- |
| 总体架构、profile、bundle、patch 层 | [原始 docs/architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/reference/) | 组合模型和配置层行为 |
| 最小插件、生命周期和 HMR | [Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)、[Plugins and lifecycle](https://deepseek-harness.github.io/deepseek-harness/en/develop/framework/) | 插件形态、加载、卸载和 effect |
| Service 和 `inject` | [原始 service.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/service.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/develop/framework/service) | service 依赖、提供、可选依赖 |
| Events | [原始 events.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/events.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/develop/framework/events) | typed event、dispatch mode、监听清理 |
| Config / Schemastery | [原始 config.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config) | schema、默认值和 fail-loud |
| Tool API | [原始 tools.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/reference/tool-execution-pipeline) | `defineTool`、canonical output、执行管线 |
| Bundle / profile / 发布 | [原始 publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) / [文档站](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish) | package manifest、profile 层和安装 |
| Client 组合和 slot | [Client AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md)、[slot implementation](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-slots) | slot 注册、props share、跨包边界 |
| Conversation Node | [Adding a conversation node](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-conversation-node.md) | 事件折叠和 keyed renderer |
| DSH 测试策略 | [Testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)、[GUI testing system](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/process/2026-07-20-gui-testing-system.md) | 单元、覆盖率、真实组合和 GUI 测试 |

官方原始文档根目录是 [deepseek-harness/docs](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)。开发目录地图见 [official-development-map.md](official-development-map.md)。本项目从文档站的 `/guide/quickstart` 进入以发现页面，再回到 GitHub `docs/` 原始文件确认内容；`/develop/` 和 `/reference/` 是阅读入口，源码链接用于补充当前官方实现和生成参考。

官方产品页只用于确认产品定位和 developer-preview 状态，不用于替代 API 文档：[DeepSeek Harness](https://deepseek.com/harness/en/)。

## 优先级

1. 当前项目 `plugin/node_modules/@deepseek-ai/*` 的 `package.json`、exports、`lib/types` 和实现源码。
2. 当前锁定版本对应的 DSH 源码 checkout；只读分析，不把相邻 checkout 加入构建或运行依赖。
3. DeepSeek 官方仓库文档和模板，优先使用上方“真相来源”表列出的页面。
4. 社区 skill、插件和教程，只用于补充验证经验。

## 本地取证

从插件目录执行：

```sh
node scripts/verify-dsh-environment.mjs
pnpm list --depth 0
rg -n "export (interface|type|class|const|function)|declare module" node_modules/@deepseek-ai node_modules/@deepseek-ai/cordis
```

需要判断一个 API 时，至少记录：包名、版本、文件路径、导出名称、调用约束和验证命令。若本地依赖没有源码或声明，不能只凭社区示例补全类型。

## 参考边界

- 官方文档和官方源码用于定义 DSH 规范。
- 当前依赖类型声明用于确认本项目锁定版本的可编译 API。
- 当前依赖实现用于确认官方文档没有展开的生命周期、错误和资源清理行为。
- Convivium 的 `docs/00-governance/` 用于定义本项目额外边界，不得冒充 DSH 官方规范。
- 社区材料用于发现坑，不用于提高兼容性承诺。
