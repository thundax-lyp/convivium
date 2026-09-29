# Architecture Rules

## Purpose And Scope

本文定义 `plugin/src/` 的目录入口、导入路径和源码归属规则。系统组成、所有权和依赖方向由 [Architecture](./ARCHITECTURE.md) 定义；本文件只规定如何在源码中落实这些边界。

规则分为两个独立层级：`Hard Rules` 必须有稳定、实际执行的门禁；`Review Rules` 由人工或 Agent 结合职责语义审阅。相同要求不得在两层重复。Review Rule 有可靠门禁后，迁入 Hard Rules，并删除原审阅条目。

## Hard Rules

- `NO_PARENT_RELATIVE_IMPORT`：`plugin/src/` 禁止 `../` 等父级相对模块导入；跨父目录使用 `@/`。ESLint 检查普通导入、重新导出、动态导入和类型导入。
- `DIRECTORY_INDEX`：`plugin/src/` 下每个目录，包括源码根目录，都必须有 `index.ts` 或 `index.tsx`。ESLint 扫描完整源码目录树，无须维护目录名单。
- `INDEX_REEXPORTS_ONLY`：`index.ts` 与 `index.tsx` 只包含具名的 `export { ... } from "..."` 再导出声明，类型使用 `type` 修饰；实现、类型定义和装配代码放在同目录的其他文件。ESLint 检查所有源码目录入口。
- `DIRECTORY_ENTRY`：引用目标一旦越过目录边界，只能通过所进入目录的 `index.ts` 或 `index.tsx`。直接父层使用 `./<dir>/index.ts` 或 `./<dir>/index.tsx`，其他目录使用 `@/<path>/index.ts` 或 `@/<path>/index.tsx`；目录内文件可直接互相引用。ESLint 根据实际目录层级检查。
- `TYPESCRIPT_IMPORT_EXTENSION`：源码与测试引用仓库内 TypeScript 文件时，显式使用目标文件的 `.ts` 或 `.tsx` 扩展名。ESLint 拒绝对这些文件使用 `.js` 扩展名。
- `PLUGIN_TEST_SOURCE_ALIAS`：`plugin/tests/` 引用 `src/` 使用 `@/`，测试 fixture 和辅助文件之间可使用相对路径。ESLint 检查测试源码导入。

TypeScript 源码导入显式使用目标文件的 `.ts` 或 `.tsx` 扩展名；编译后的 JavaScript 产物继续使用 `.js`。当前 NodeNext/ESM 不支持将 `./<dir>` 目录直接作为运行时导入目标，源码必须写出入口文件名。

## Review Rules

- `PLUGIN_REVIEW_EXPORT_SCOPE`：目录入口只公开父层当前需要的能力；不得把内部文件全部转发，或仅为缩短路径建立无职责的入口。
- `PLUGIN_REVIEW_BOUNDARY_SEMANTICS`：新增入口或移动文件时，审阅它是否改变模块职责、依赖方向或授权边界；只有这些架构边界变化才同步 [Architecture](./ARCHITECTURE.md)。
