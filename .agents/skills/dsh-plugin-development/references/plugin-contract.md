# 插件与包契约

## 真相来源

- DSH 架构与 patch 层：[DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- 可安装 bundle 与 profile：[Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- 最小插件入口：[Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)

以下“Host / Client”拆分和 package 字段是官方 bundle/client 规则与 Convivium 当前插件结构的合并约束；如两者冲突，以当前 DSH 官方源码和 `plugin/package.json` 的实际构建契约为准。

## Host / Client

Host 入口是 Node ESM 插件，通常导出 `name`、`inject`、可选 `Config` 和 `apply(ctx, config)`。Client 入口是独立浏览器 bundle；只有确实提供 Web 能力时才声明 `dsh.client` 和 `exports["./client"]`。Client package 的具体 export 规则必须再核对当前官方 client loader 源码。

Host 与 client 必须使用两个 TypeScript program，避免 Node 侧 session 类型和浏览器 runtime 类型相互污染。

## package.json

确认以下字段相互一致：

- `type: "module"`
- `main`、`types` 指向实际产物
- `exports["."]`、必要时 `exports["./client"]`
- `files` 包含所有发布入口和 `cordis.patch.yml`
- `dsh.bundle.patch` 指向包内 patch
- DSH、Cordis、React 和 client runtime 优先作为 peer dependency

## cordis.patch.yml

Bundle patch 必须是顶层 YAML 数组，插入行的 `id` 稳定且 `name` 与可解析的包名/入口一致。patch 覆盖配置行时是整段替换，不应假设深合并。

## pnpm

若当前 DSH 依赖声明了 npm 上不存在但 pnpm 要求解析的 peer，按官方发布文档的当前版本说明确认是否需要 profile 级 `pnpm-workspace.yaml` 的 `overrides` 或 `allowBuilds`。不要为了“看起来一致”在没有证据时增加根 workspace。
