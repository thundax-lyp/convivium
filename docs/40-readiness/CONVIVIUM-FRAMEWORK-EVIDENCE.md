# Convivium Framework Evidence

## Scope

本证据覆盖 Convivium DSH 插件工程框架从依赖 manifest 到 PR 治理的可安装 package、lockfile、Host/Client 类型面、bundle、模块边界、framework tests、package verifier、统一验证入口和 CI workflow。

本证据不代表会议运行时、真实 DSH AgentSession 或会议业务已完成。当前领域状态机和 SQLite repository 基础已经存在；会议运行时、DSH lifecycle 和集成验证仍未覆盖。

## Validated Contract

- 插件 package name 为 `@convivium/dsh-plugin`，具备 Host `.` 与 Client `./client` 两个发布入口。
- Cordis 使用公开可解析的最高稳定版本 `4.0.1`；当前列出的其他 DSH packages 使用 registry 可见最高版本 `0.1.1-rc.2`。
- frozen install 可在独立 `plugin/` checkout 解析 lockfile；lockfile 未包含 workspace、Git dependency、本机绝对路径或相邻 checkout。
- Host 与 Client 分别进行 TypeScript typecheck，并输出 `lib/types/index.d.ts` 与 `lib/types/client/index.d.ts`。
- bundle 产物为 `lib/index.js` 与 `lib/client.js`；Client bundle 未包含 Node builtin 或第二份 React/DSH runtime。
- framework tests 覆盖模块边界、package manifest 和 Client entry 加载，不覆盖会议业务。
- package verifier 从磁盘读取 manifest、patch 和 build artifact；缺失 Client artifact、错误 patch name、开放 files allowlist 均可失败。
- workflow 独立展示 `Governance`、`Plugin Format`、`Plugin Lint`、`Plugin Typecheck`、`Plugin Test`、`Plugin Build` 和 `Package Contract`；Package Contract 依赖 Plugin Build artifact。
- 当前代码—需求—设计漂移和未实现模块以本文件的 `Not Covered` 与相关正式需求、接口和设计文档为准。

## Executed Validation

### DSH Runtime 执行基线（2026-08-26）

- 基线分支：`codex/dsh-runtime-integration`。
- 基线提交：`9fe99ac`；该提交前的工作区无未提交或未跟踪工程改动。
- 环境：Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`。
- 分支职责：该分支汇合已验证的 provider T1 取证、Host service-key 注入、canonical domain/SQLite 基础，以及 Tool/projection 契约；`main` 未承载这些未 PR 的开发提交。
- 可回溯边界：本节只记录执行起点，不宣称 Runtime 会议创建或 Turn 已完成；剩余可执行工作以根 `TODO.md` 为准。

历史框架验证日期：2026-08-25
环境：Node `v22.23.2`，pnpm `10.7.0`，macOS 本地工作区
实现边界：`fef0d1c..fca7386`（依赖 manifest 至 PR 治理的实现提交）；证据在后续 readiness commit 中收口。

| 命令或检查 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Pass | lockfile up to date；pnpm 提示 ignored `esbuild` build script，但安装成功 |
| `pnpm typecheck` | Pass | Host 与 Client 两个 TypeScript face 均通过 |
| `pnpm test` | Pass | 3 个 framework test files、4 个 tests 通过；Host/Client/contract projects 可见 |
| `pnpm build` | Pass | 生成 `lib/index.js`、`lib/client.js` 和两组声明；tsdown 输出一个 `define` invalid input warning，不影响退出码或产物 |
| `pnpm verify:package` | Pass | 4 个 boolean contract 字段为 true，missing/forbidden 数组为空 |
| `pnpm lint` | Pass | JavaScript、TypeScript 与 TSX 静态规则检查通过 |
| `pnpm verify` | Pass | 按 lint → typecheck → test → build → environment → plugin contract → package verifier 顺序通过 |
| `pnpm test:integration` / `test:recovery` / `test:stress` | Pass with `Not Covered` | 三个入口均明确输出未覆盖，没有伪造业务用例 |
| package fault injection | Pass | 临时副本中删除 `lib/client.js`、篡改 patch name、开放 files allowlist 均使 verifier 非零退出，并已恢复 |
| verify fault injection | Pass | 临时类型错误使 `verify` 失败；缺失 artifact 使 `verify:package` 失败，并已恢复 |
| workflow YAML/job comparison | Pass | 七个 job display name、Node、pnpm、frozen install、Build→Package dependency 符合 CI 契约 |
| `git diff --check`、最终 `git status --short` | Pass | 无 whitespace error；无未提交工作区修改 |

`pnpm 10.7.0` 不支持原执行手册写出的 `pnpm pack --dry-run` 参数；已使用该版本支持的临时目录实际打包 JSON 清单替代检查，并确认发布清单未包含 `src/`、`tests/` 或 `docs/`。

当前基线复核：2026-08-26，基线为本分支最新提交，`pnpm verify` 通过，6 个测试文件、62 个测试通过；领域和 Repository 单元测试已纳入当前代码。`test:integration`、`test:recovery` 和 `test:stress` 仍无测试文件，均明确输出 `Not Covered`。尚未实现能力记录在本文件的 `Not Covered`。

## Not Covered

- 会议生命周期、Turn、发言权、Manager、完成判断和会议运行时业务。
- 完整 MeetingState 与 SQLite repository 的类型化集成、业务 schema 语义和冷恢复。
- 真实 DSH AgentSession 创建、followup、interrupt、continuable drain、capability revoke 和归档。
- 宿主组合中 continuable subagent provider 的声明与选择、`prepareContinuable` 能力及 `startContinuable()` 独立 profile 验证。
- 真实 DSH Host/Web roster 启动、工具调用、HTTP 路由和权限边界的运行时验证。
- integration、recovery、stress 业务测试和压力结果。
- 会议 UI 行为、真实浏览器交互和可访问性。
- GitHub PR 远端 job 实际启动结果及 Ruleset 是否已将六个 Plugin checks 设为必过；当前治理文档只确认 workflow 定义存在，已观察的 Ruleset 仍只要求 `Governance`。

## Closure

框架级 package、build、test、verify 和 CI 配置已达到本阶段可检查状态；以上未覆盖项不应被描述为会议产品已完成。长期工程判断已分别落在 `ARCHITECTURE.md`、Implementation Design、PR-RULES、源码配置和 package verifier 中。
