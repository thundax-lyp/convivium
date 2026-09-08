# 测试与文档交付

本文覆盖插件开发的证据选择、v0.1.2-rc.1 命令、公共文档交付、生成物与 runtime invariant。

## 按变更面选择证据

选择能到达实际变更面的证据：

| 变更面                                     | 最低证据                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| 纯转换或状态迁移                           | 聚焦单元测试，含失败分支                                                           |
| Registry contribution                      | 注册测试及 fiber dispose/removal                                                   |
| Lifecycle、并发、subprocess 或 socket      | cancellation、rollback、callback containment 与 quiescent teardown                 |
| 产品可见包                                 | 使用 test-only config 的真实 Loader/应用组合                                       |
| 模型可见 prompt、schema、result 或 context | Keyless assembled snapshot 或 end-to-end transcript                                |
| Session event                              | live validation、persistence/load、replay fold、projection 与公开的 SDK output     |
| LLM/Provider Adapter                       | 准确 request/stream translation 加可选 credentialed smoke                          |
| Client UI                                  | 聚焦 jsdom/component test；组合输出变化时再跑 GUI lane 与 web replay               |
| Typert Remote                              | Generator/Host build、Client type face、contribution mount 与 Gateway carrier call |
| Built bin、worker 或 non-index entry       | 使用生产 launcher 的 built-artifact smoke                                          |
| Public API                                 | JSDoc 加包含 behavior/config/event/limitation 的包 README                          |

手工 `ctx.plugin(...)` 只证明局部行为，不能证明 Loader resolution。产品可见 wiring 需要真实组合：等待 Loader 完成、执行可见表面、dispose root。外部服务与非确定输入使用 mock；断言 durable state、model request/log、protocol output 或用户渲染。

## 验证命令矩阵

下表命令只适用于精确目标版本的 DSH monorepo，从其根目录运行。独立插件先检查自身 package.json、贡献规则与验证入口，把上节的证据要求映射到已有测试、构建和真实 Profile smoke；不要照搬上游目录、脚本、README gate 或新建 monorepo 结构。缺少能覆盖变更面的检查时，说明缺少的证据，不把命令不存在当成产品失败，也不把其他检查替代为通过。只报告实际观察到输出的命令。

| 变更面                               | v0.1.2-rc.1 命令                                                       | 前置条件与证据                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 聚焦 unit/composition spec           | `pnpm exec vitest run packages/<group>/<package>/tests/<file>.spec.ts` | 替换为真实路径；证明局部行为与 cleanup。                                                                                         |
| 新 workspace package                 | `pnpm install` 然后 `pnpm run constraints`                             | 注册 workspace 并检查 manifest/package 规则。                                                                                    |
| Type API、declaration merge、exports | `pnpm run typecheck`                                                   | 解析 Host 与 Client compiler face。                                                                                              |
| Static source                        | `pnpm run lint`                                                        | 修正所属源码，不压制规则。                                                                                                       |
| Package/docs Markdown 或 JSDoc       | `pnpm run doc-sync`                                                    | 运行 v0.1.2-rc.1 文档 generator 与 gate。                                                                                        |
| Website navigation/link              | `pnpm run website:build`                                               | 构建 VitePress 并检测死链。                                                                                                      |
| 模型/用户组合行为                    | `pnpm run test:snapshot -- -t '<case name>'`                           | 使用窄化的已有或新增 fixture。                                                                                                   |
| 产品可见插件 wiring                  | `pnpm exec vitest run packages/<group>/<package>/tests`                | 包含真实 Loader/应用组合测试。                                                                                                   |
| Client code                          | `pnpm run test:gui`                                                    | 运行 Client 与 Host-side GUI suites。                                                                                            |
| 组合 browser/output                  | `DSH_SNAPSHOT=replay pnpm run test:web`                                | 重建并运行 keyless replay/browser lane。                                                                                         |
| Built runtime entry                  | `pnpm run build` 后运行所属 built smoke                                | Source test 不能证明发布 artifact。                                                                                              |
| Provider transport                   | `pnpm run test:e2e`                                                    | 需要 Provider key；准确报告 self-skip。                                                                                          |
| Outgoing branch/push                 | 按 outgoing diff 选择上面的最小适用集合                                | 遵循仓库 `dsh-pre-push-checks`；只有 manifest、public export、build config 或发布路径等相关变更才运行适用的 hygiene/build gate。 |

`pnpm run test:coverage` 是 CI coverage gate，不是默认本地命令。仅在明确要求、诊断 CI 或聚焦证据无法覆盖时运行。`pnpm run check:windows-wine` 只用于已知 Windows failure。`pnpm run test:docs` 运行不要求 build 的 doc-quick aggregate；`pnpm run test:expected` 运行 owner-local CLI/process expected-output suites。它们不替代 recorded-session snapshot 或声明编译。

录制 Session 驱动的 fixtures 位于顶层 `snapshots/session`、`snapshots/sdk`、`snapshots/acp`、`snapshots/web`；普通 expected output 留在 owner-local tests/expected。TypeScript 与 Python SDK projection 分别验证，普通 test 不证明两者。Browser record/refresh 和真实 Provider 调用需要独立授权与明确变更目的；keyless replay 不修改预期输出。

## 文档交付

Public behavior 变化时同步更新 JSDoc 与所属包 README。记录 parameter、non-void return、event dispatch mode、failure、timing、cancellation、ownership 与 safe-use fact。使用当前状态表述，一项事实只有一个位置；不要叙述实现历史或复述代码。

DSH monorepo 的包 README 使用 package-authoring reference 中的 Model Experience/KV Cache/Known Limitations 模板；独立插件按目标仓库的文档归属记录相同的相关行为事实，不引入上游 gate 专属格式。Generated catalog 是 projection：修改源并运行所属 generator，不手工编辑生成区域。

非平凡设计决策按仓库活跃 decision-record 惯例记录；不得修改 archived record。例行局部或机械修改可按目标仓库规则豁免。

## Runtime invariant 的注册边界

Invariant 检查包拥有的可观察关系，不检查 service/method 是否存在。Registry 的 allowlist/blocklist 使用 RegExp source，blocklist 优先，过滤在 service 生命周期固定。即使 installer 被过滤，package name 仍被保留；失败必须撤销 child fiber 与 reservation，HMR 后才能同名重装。

不要根据叙述文档中“每包必须有空 companion”的旧规则新增空 invariant；目标 gate 只允许拥有实际关系的 companion。包文件要求见 [Invariant 与 README](package-authoring.md#invariant-companion)。


聚焦 specs 会与其他 worker/gate 并发；独占端口、临时路径、环境和子进程并可靠 teardown，不能以仅单跑成功掩盖污染。修改 Client 文案运行 verify-client-ui-i18n，修改包分层/exports 运行对应 package-dependency 与 module-boundary gate；catalog、subsystem page、README omission 等文档规则由各可执行 gate 决定。
