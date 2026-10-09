# Client 包与模块装载

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。本页拥有 Web 半侧装载契约；具体包文件与 Profile 步骤见[安装 Web 半侧](../how-to/how-to-client-web-package.md)。

## `dsh.client` 与 `./client`

包的 `package.json` 以 `dsh.client: { platform: "web" }` 标记浏览器半侧，并公开 `./client` 的 `types` 与 `default` 条件。Host 入口 `.` 仍须可供 Loader 导入；纯 UI 包可有空 `apply`。模块系统只向启用的**裸包名** Loader 行附着浏览器半侧；`pkg/subpath` 行不会携带它。两个活跃 Loader 源指向同一个包名会导致组合错误。若页面应独立于同包其他行存活，发布独立包并启用它的根行。

`dsh.client.inject` 列包名，只用于预检与 HMR 信息；它不排序 `apply`。`immediately: true` 留给必须在首阶段预取的基础设施。`dsh.client.external` 是非基线同步模块请求：缺供应者即物化失败；React、Cordis 和静态 Client 基础库属于隐式基线，无需重复声明。功能插件不能靠 `external` 在运行时读取另一功能插件的值；业务协作使用 Cordis service 或 slot。

## `ClientModuleRegistry`

**公开导出**：`ClientModuleRegistry` 来自 `@deepseek-ai/dsh-client-modules`。
`@deepseek-ai/dsh-client-modules` 的 Host `.` 导出提供 `clientModules` service。它从当前 Loader 条目解析 manifest，读取已构建的 `lib/client.js`，按模块图服务给 Web 页面。包元数据在相同 Loader specifier 与 base URL 下缓存；变更 manifest 后须重启，更新构建产物后需触发重建通知或重新装载。缺失 client bundle 会在组合时报告包名和产物路径；源码文件存在并不等于半侧可用。

`graph` 是当前组合图；`onGraphChanged` 订阅图变动；`rebuilt` 接收已重建 bundle 的通知，`onRebuilt` 供 HMR 观察。普通业务包通过 Loader/Profile 参与图，不直接调用这些维护接口。

## `ClientModuleSystem`

`@deepseek-ai/dsh-client-modules/client` 导出浏览器基础设施 `ClientModuleSystem` 和 `createClientModuleSystem`。正常插件不构造它；Web Shell 在 Cordis 之前创建模块系统，再把它作为 Loader 的 `internal`，Client 插件 `apply` 从该 Loader 登记 `ctx.modules`。模块表必须先满足同步请求，Cordis 才能按 service 注入激活；两种依赖顺序互不替代。

其 `prefetch` 先准备异步模块工厂，`import` 再物化一个包；`invalidate`、`entries` 属于图更新和诊断面。功能插件不应把这些方法作为自己的安装路径。

## `createClientModuleSystem`

**公开导出**：`createClientModuleSystem` 来自 `@deepseek-ai/dsh-client-modules/client`。
此公开函数接收页面注册目标、预装载模块和 boot 配置，返回 `ClientModuleSystem`。它是 Shell 初始化入口，不是业务插件的普通安装入口；重复创建会绕开已持有该系统的 Loader。业务插件应声明模块依赖并让正常 Web Profile 物化。

## 构建与验证边界

目标仓库的 `packages/client/tsdown.client.ts` 会产出向浏览器模块加载器登记包名和 lazy-CJS factory 的 `lib/client.js`，并处理 CSS、基线外部模块与源码映射。该文件是仓库内部预设，没有独立 npm 导出。独立消费项目必须提供等价构建链并核对输出格式；不能将工作区相对 import 当成可安装方案。至少验证包的 `./client` 导出解析、构建产物存在、目标 Profile 根行启用、页面内贡献可见，以及停用根行后消失。
