# DSH 插件测试与验证

## 真相来源

- DSH 仓库测试总政策：[Testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- Client GUI 测试分层：[GUI testing system](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/process/2026-07-20-gui-testing-system.md)
- 插件组合与真实启动：[Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- bundle/profile 组合检查：[DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)

官方 DSH 测试政策定义 DSH 仓库自身的测试层级；下面的“当前项目入口”和“运行验证纪律”是 Convivium 对该政策的插件化落地，不表示当前 `plugin/` 已达到 DSH 官方仓库的全部覆盖率或 GUI 门禁。

## 分层

1. **静态层**：Prettier、host/client 双 program typecheck、Vitest 单元/契约测试。
2. **产物层**：`pnpm build`、入口 import、包文件白名单和 bundle/client manifest 校验。
3. **组合层**：独立 profile 执行 `dsh --profile <scratch> --dump-config`，确认 patch 能组合进配置树；不触碰用户运行实例。
4. **运行层**：独立 headless/Web profile，验证工具注册、路由、Session 生命周期、持久化和事件/快照。
5. **GUI 层**：通过真实 DSH Web 实例验证稳定 DOM/ARIA/data 探针和截图；不要把独立 Vite 页面当作 DSH 集成测试。

官方测试政策另外要求：产品可见插件不能只依赖手工 `ctx.plugin(...)` 单元套件，应有真实 Loader/组合路径测试；GUI 改动应按官方 lane 选择组件、语义 snapshot 或 browser 测试。当前 Convivium 尚未完成这些会议产品级覆盖时，必须明确标为未覆盖。

## 当前项目入口

从 `plugin/` 运行：

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm verify:package
```

涉及领域状态、生命周期、恢复或并发时，必须在这些入口之上增加对应的 Node 验证脚本或集成测试，不要用 `--passWithNoTests` 把空目录描述为覆盖。

## 运行验证纪律

- 使用独立 profile、独立端口和临时 workspace。
- 先 `--dump-config`，再 boot；先确认精确 URL，再访问路由。
- 不对用户指定的 DSH 实例执行 curl、重启或清理。
- 记录 DSH、Node、pnpm 和插件 commit/version。
- 后台任务必须可追踪、可停止；清理只删除本次创建的精确临时路径。
