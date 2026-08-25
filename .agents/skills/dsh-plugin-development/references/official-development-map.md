# DSH 官方开发文档地图

## 真相来源

本文索引 DeepSeek Harness 官方原始文档及其文档站发布入口。权威关系是：GitHub 仓库 `docs/` 为原始文档，文档站为发布/渲染后的导航和阅读入口。

- 原始文档根目录：<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs>
- 文档站根目录：<https://deepseek-harness.github.io/deepseek-harness/>
- 文档站开发入口：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
- 文档站参考入口：<https://deepseek-harness.github.io/deepseek-harness/reference/>
- 本文最后核对：2026-08-25

官方仓库处于 developer preview，原始文档和 API 可能随仓库演进。本文保存的是路由、用途和关键决策，不替代原始文档中的生成 API 目录；具体签名仍需打开当前原始文件并核对当前依赖类型。

## 使用 UI 和启动

- [使用 Web UI](https://deepseek-harness.github.io/deepseek-harness/guide/quickstart)：启动状态、模型配置、workspace 选择和第一个任务。该页的原始内容需从官方仓库对应 docs 路径核对。
- [开发入口](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)：官方插件开发目录。
- [参考入口](https://deepseek-harness.github.io/deepseek-harness/reference/)：架构、Cordis、生成参考、API、cookbook 和子系统目录；原始目录为 [官方 docs](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)。

## 基础插件开发

- [第一个 Harness 插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)：函数、对象、Service class 三种插件形态；`apply(ctx)`；本地 overlay；`inject`；自动清理。
- [开发一个 Tool](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool)：`defineTool`、参数 schema、`output.schema`、`output.render` 和 `execute`。
- [插件配置](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config)：Schemastery `Config`、默认值、校验、fail-loud 和配置 HMR。
- [打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)：bundle/profile 两种 manifest、`dsh.bundle`、`dsh.profile`、patch 层、`--dump-config`、Git 安装和 pnpm `allowBuilds`。

## 框架能力

- [插件与生命周期](https://deepseek-harness.github.io/deepseek-harness/develop/framework/)：Fiber 状态、依赖驱动加载、卸载、HMR 和清理。
- [服务与依赖](https://deepseek-harness.github.io/deepseek-harness/develop/framework/service)：Service 提供/消费、`inject`、可选依赖、声明合并和服务隔离。
- [事件系统](https://deepseek-harness.github.io/deepseek-harness/develop/framework/events)：`emit`、`bail`、`serial`、`waterfall`、事件类型和监听器生命周期。

## 能力设计和适配器

- [能力的三种角色设计](https://deepseek-harness.github.io/deepseek-harness/develop/practice/)：Service Definition、Service Provider、Consumer；只有需要独立演进或替换时才拆包。
- [LLM 适配器](https://deepseek-harness.github.io/deepseek-harness/develop/practice/llm-adapter)：`LlmAdapter`、`stream()`、`StreamChunk`、配置和适配器注册。

## Cordis 教程

- [教程总览](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/)：运行方式、临时目录、TypeScript 声明合并和七章路径。
- [1. 第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/01-first-plugin)：Loader、插件入口、并发挂载、配置错误和三种插件形态。
- [2. 生命周期与 effect](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/02-lifecycle-and-effects)：`ctx.effect()`、disposer、子 Fiber、异步清理顺序。
- [3. 服务](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/03-services)：`Service`、Context 声明合并、`inject`、PENDING 和可选服务。
- [4. 事件](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/04-events)：事件声明、分发模式和 `next()` 委托。
- [5. 配置](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/05-config)：Cordis 配置项、schema 和校验。
- [6. 组合与 HMR](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/06-composition-and-hmr)：配置树、层覆盖、HMR 和诊断。
- [7. 进入 Harness](https://deepseek-harness.github.io/deepseek-harness/develop/cordis-tutorial/07-into-the-harness)：在真实 Harness service 上注册模型可调用 Tool。

## 官方概念和生成参考

- [DeepSeek Harness 架构](https://deepseek-harness.github.io/deepseek-harness/reference/)：Cordis、profile、bundle、patch 层、事件域、Session 日志、能力 seam 和行为归属。
- [Cordis 入门](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer)：上下文、服务、依赖、typed event、可逆 effect、waterfall 和 Loader 配置。
- [能力 Seams 与核心服务](https://deepseek-harness.github.io/deepseek-harness/reference/capability-seams)：核心服务、可替换 seam、definition/provider/consumer 和 `ctx` key。
- [Agent 轮次与步骤生命周期](https://deepseek-harness.github.io/deepseek-harness/reference/agent-lifecycle)：turn、step、agent event 和持续运行边界。
- [工具执行流水线](https://deepseek-harness.github.io/deepseek-harness/reference/tool-execution-pipeline)：Tool execution 的阶段、策略和观测。
- [插件配置目录](https://deepseek-harness.github.io/deepseek-harness/reference/config-catalog)：当前组合可用的插件配置字段。
- [工具 Schema 目录](https://deepseek-harness.github.io/deepseek-harness/reference/tool-catalog)：当前工具 schema、参数和输出目录。
- [会话持久化事件目录](https://deepseek-harness.github.io/deepseek-harness/reference/persistence-catalog)：持久化 SessionEvent 词汇。

生成参考不是静态手册。需要使用某个 `ctx` service、工具、配置字段或 SessionEvent 时，应从对应页面定位当前条目，再回到当前依赖的类型声明验证调用形状。

## Cordis API

- [Context](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/context)
- [Events](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/events)
- [Fiber](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/fiber)
- [Plugin Registry](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/registry)
- [Service](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/service)
- [Inherited Cordis API](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-api/inherited)

## Cookbook：按实现目标查找

- [新增 workspace package](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package)：官方包目录、manifest、TypeScript references、client package 和验证清单。
- [新增 Tool](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-tool)：Tool 的完整 schema、canonical value、`exec.signal`、后台任务、策略钩子和 presentation。
- [新增 LLM Adapter](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-an-llm-adapter)：流式协议、usage/finish、tool-call delta、错误、取消和 replay state。
- [新增设置卡片](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-settings-card)：Host settings namespace、client keyed slot、`settingsScope` 和 `./client` bundle。
- [扩展插件形态](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook)：工具插件、hook plugin、UI plugin 和外部协议驱动。
- [新增 Web Client Conversation Node](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-conversation-node)：SessionEvent、Definition、确定性 fold、keyed renderer 和 client slot。

## 原始来源使用规则

1. 先从文档站导航定位主题。
2. 在官方 GitHub `docs/` 中找到对应的原始 Markdown 文件。
3. 对 API、事件、配置字段和包契约，再核对当前 DSH 依赖的 `lib/types` 和实现源码。
4. 只把稳定的开发原则摘要写入本 skill；大段正文和生成目录保留在官方原始文档中。

## 与 Convivium 的使用边界

- DSH 官方页面定义 DSH 的插件、服务、事件、Tool、Session、Client 和组合契约。
- Convivium 的 `docs/00-governance/ARCHITECTURE.md` 定义会议领域、AgentSession 隔离、SQLite、前后端边界等项目额外约束。
- 当 DSH 官方文档与社区插件或旧 checkout 不一致时，优先官方站点当前页面，再用 `plugin/node_modules/@deepseek-ai/*` 的当前类型和源码核对。
