# 测试、文档与 Skill 维护

本 reference 覆盖证据选择、rc.2 命令、公共文档交付、生成物与本离线 skill 的维护。

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

从仓库根目录运行最小适用集合，只报告实际观察到输出的命令。

| 变更面                               | rc.2 命令                                                              | 前置条件与证据                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 聚焦 unit/composition spec           | `pnpm exec vitest run packages/<group>/<package>/tests/<file>.spec.ts` | 替换为真实路径；证明局部行为与 cleanup。                                                                                         |
| 新 workspace package                 | `pnpm install` 然后 `pnpm run constraints`                             | 注册 workspace 并检查 manifest/package 规则。                                                                                    |
| Type API、declaration merge、exports | `pnpm run typecheck`                                                   | 解析 Host 与 Client compiler face。                                                                                              |
| Static source                        | `pnpm run lint`                                                        | 修正所属源码，不压制规则。                                                                                                       |
| Package/docs Markdown 或 JSDoc       | `pnpm run doc-sync`                                                    | 运行 rc.2 文档 generator 与 gate。                                                                                               |
| Website navigation/link              | `pnpm run website:build`                                               | 构建 VitePress 并检测死链。                                                                                                      |
| 模型/用户组合行为                    | `pnpm run test:snapshot -- -t '<case name>'`                           | 使用窄化的已有或新增 fixture。                                                                                                   |
| 产品可见插件 wiring                  | `pnpm exec vitest run packages/<group>/<package>/tests`                | 包含真实 Loader/应用组合测试。                                                                                                   |
| Client code                          | `pnpm run test:gui`                                                    | 运行 Client 与 Host-side GUI suites。                                                                                            |
| 组合 browser/output                  | `DSH_SNAPSHOT=replay pnpm run test:web`                                | 重建并运行 keyless replay/browser lane。                                                                                         |
| Built runtime entry                  | `pnpm run build` 后运行所属 built smoke                                | Source test 不能证明发布 artifact。                                                                                              |
| Provider transport                   | `pnpm run test:e2e`                                                    | 需要 Provider key；准确报告 self-skip。                                                                                          |
| Outgoing branch/push                 | 按 outgoing diff 选择上面的最小适用集合                                | 遵循仓库 `dsh-pre-push-checks`；只有 manifest、public export、build config 或发布路径等相关变更才运行适用的 hygiene/build gate。 |

`pnpm run test:coverage` 是 CI coverage gate，不是默认本地命令。仅在明确要求、诊断 CI 或聚焦证据无法覆盖时运行。`pnpm run check:windows-wine` 只用于已知 Windows failure。rc.2 没有 `pnpm run test:docs` 或 `pnpm run test:expected`；文档用 `doc-sync`，行为用所属聚焦命令。

## 文档交付

Public behavior 变化时同步更新 JSDoc 与所属包 README。记录 parameter、non-void return、event dispatch mode、failure、timing、cancellation、ownership 与 safe-use fact。使用当前状态表述，一项事实只有一个位置；不要叙述实现历史或复述代码。

包 README 的准确 Model Experience/KV Cache/Known Limitations 模板在 package-authoring reference 中。Generated catalog 是 projection：修改源并运行所属 generator，不手工编辑生成区域。

非平凡设计决策按仓库活跃 decision-record 惯例记录；不得修改 archived record。例行局部或机械修改可按目标仓库规则豁免。

## Skill 发布维护

本 skill 只针对 `dsh-v0.1.1-rc.2`。改变基线前，更新 [真相源映射](source-map.md)，在新 tag 检查每个映射文件，并用已发布 manifest、可执行 gate 与源码重新对齐所有示例。不得静默读取 moving branch。较新分支才有的 API 在 pinned tag 缺失时，应明确写“不可用”，不要复制。

发布 skill 必须离线：skill 目录内不得出现 HTTP(S) URL。每个 reference 对其路由主题自包含，每项事实只有一个归属；router 可以使用本地相对链接。仓库依据只记录在本地 `source-map.md`，正常插件开发不读取该映射。

每次修改执行：

1. 临时把 `references/*.md` 加入仓库 Markdown TypeScript-fence checker。
2. 运行 pinned declaration build，再运行 `DSH_DOC_TYPECHECK_USE_BUILD_OUTPUT=1 pnpm run doc-typecheck:contracts-ready`。
3. 恢复 checker 临时修改，确认其源码无 diff。
4. 用 JSON parser 解析所有 `json` fence。
5. 解析全部本地 Markdown target 与 heading anchor。
6. 拒绝发布 skill 内的 HTTP(S) URL。
7. 在 pinned tag 解析 `source-map.md` 的每个 repository path。
8. 运行 skill quick validator、trailing-whitespace 与 diff check。

Code-fence compilation 是必需证据。报告准确命令、总 compiled blocks、本 skill blocks 数，以及与 contracts-ready 结果分开的无关 build failure。
