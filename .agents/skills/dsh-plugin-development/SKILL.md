---
name: dsh-plugin-development
description: 开发、扩展、验证或排查 DeepSeek Harness (DSH) 插件时使用。覆盖当前依赖 API 取证、host/client 结构、bundle/profile 契约、生命周期、测试和真实 DSH 运行验证；不用于独立应用或纯评审任务。
metadata:
  source_policy: official-source-first
  compatibility: developer-preview
---

# DSH 插件开发

把 Convivium 当作独立的 TypeScript DSH 插件开发，不把相邻参考项目当作源码基线。每次实现前先确认当前 `plugin/` 的 DSH 依赖版本，再以当前依赖的类型声明、源码和官方文档取证；社区 skill 只能补充实践，不能覆盖当前 API。

## 工作流

1. 读取仓库 `docs/AGENTS.md`、`docs/00-governance/ARCHITECTURE.md`，再读取与任务相关的需求、接口或设计文档。
2. 检查 `plugin/package.json`、`pnpm-lock.yaml`、两个 `tsconfig`、构建配置和相关源码；确认任务属于 host、client 或双面插件。
3. 先阅读 [references/official-development-map.md](references/official-development-map.md)，按 [references/source-of-truth.md](references/source-of-truth.md) 取证，不凭旧版 API 或社区示例猜测。
4. 实现时遵守对应参考文档：
   - 插件和包契约：阅读 [references/plugin-contract.md](references/plugin-contract.md)。
   - host、工具、Service、路由和生命周期：阅读 [references/host-api.md](references/host-api.md)。
   - client、slot、Conversation Node 和双 program：阅读 [references/client-api.md](references/client-api.md)。
   - 测试和运行验证：阅读 [references/testing-verification.md](references/testing-verification.md)。
   - 版本差异或不确定 API：阅读 [references/compatibility.md](references/compatibility.md)。
5. 先运行 `pnpm verify:environment`，再运行 `pnpm verify:contract`；命令发现契约问题时先修复或明确记录边界。
6. 使用最窄验证收口：格式、双 program typecheck、单元/契约测试、构建、包验证；涉及运行时的改动再进行独立 DSH profile 的 `--dump-config` 和 smoke 验证。

## 不可违反的边界

- DSH AgentSession、Session、工具、Skills、MCP 和权限由 DSH 管理；插件只通过公开、类型化接口使用它们。
- 插件前端不直接管理 AgentSession、不访问 SQLite 或任意文件系统，不替代后端授权和领域状态。
- 每个会议身份必须使用独立的 DSH continuable AgentSession；不得跨身份共享会话状态。
- 不向 DSH-owned Session Event 写入 Convivium 自定义持久化事件；领域事件按架构文档进入插件自己的持久化边界。
- 不因为一个社区示例存在就新增兼容层；先确认当前依赖是否需要，无法确认时选择可安全失败的最小实现并记录假设。
- 不把 `build` 通过描述为 DSH 运行时可用；至少还要验证 bundle 组合，涉及 client 或运行时行为时要验证独立 profile。

## 输出要求

实现 DSH 能力时，说明采用了哪个当前依赖/官方来源、验证了哪些入口、哪些运行面仍未覆盖。若发现 API 与参考文档不一致，保留依赖版本和文件路径证据，并更新最小必要 reference，不要静默改写为普遍规则。
