# Architecture Rules

## Purpose And Scope

本文定义 `plugin/src/` 的目录入口、导入路径和源码归属规则。系统组成、所有权和依赖方向由 [Architecture](./ARCHITECTURE.md) 定义；本文件只规定如何在源码中落实这些边界。

规则分为两个独立层级：`Hard Rules` 必须有稳定、实际执行的门禁；`Review Rules` 由人工或 Agent 结合职责语义审阅。相同要求不得在两层重复。Review Rule 有可靠门禁后，迁入 Hard Rules，并删除原审阅条目。

## Hard Rules

- `NO_PARENT_RELATIVE_IMPORT`：`plugin/src/` 禁止 `../` 等父级相对模块导入；跨父目录使用 `@/`。ESLint 检查普通导入、重新导出、动态导入和类型导入。
- `DIRECTORY_ENTRY`：`plugin/src/` 每个目录必须有 `index.ts` 或 `index.tsx`；引用目标一旦越过目录边界，只能通过所进入目录的 `index.js`。直接父层使用 `./<dir>/index.js`，其他目录使用 `@/<path>/index.js`；目录内文件可直接互相引用。`plugin/eslint.config.mjs` 根据实际目录层级检查，无须维护入口名单。
- `PLUGIN_TEST_SOURCE_ALIAS`：`plugin/tests/` 引用 `src/` 使用 `@/`，测试 fixture 和辅助文件之间可使用相对路径。ESLint 检查测试源码导入。

以上规则均保留源码使用的 `.js` 扩展名。当前 NodeNext/ESM 不支持将 `./xxx` 目录直接作为运行时导入目标；讨论中的 `./xxx`、`@/xxx` 表示目录入口，实际源码写为 `./xxx/index.js`、`@/xxx/index.js`。

## Review Rules

- `PLUGIN_REVIEW_EXPORT_SCOPE`：目录入口只公开父层当前需要的能力；不得把内部文件全部转发，或仅为缩短路径建立无职责的入口。
- `PLUGIN_REVIEW_BOUNDARY_SEMANTICS`：新增入口或移动文件时，审阅它是否改变模块职责、依赖方向或授权边界；只有这些架构边界变化才同步 [Architecture](./ARCHITECTURE.md)。
