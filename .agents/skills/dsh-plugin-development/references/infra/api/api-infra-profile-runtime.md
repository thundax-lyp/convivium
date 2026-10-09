# Profile 解析、装载与管理

## Profile

`@deepseek-ai/dsh-app-boot` 的 `Profile` 描述已解析的本地 profile：目录、manifest、组合层及 `skippedBundles` 等运行时事实。常规插件作者由 `dsh` 启动器使用它，不需要自行 `boot()`。`resolveProfileDir(name)` 定位 `$DSH_HOME/profiles/<name>`；`loadProfileDirectory` 面向应用持有的已初始化目录，不能代替 CLI 的首次模板初始化。

`dir: string` 是 profile 的绝对目录；`layers: ProfileLayer[]` 按 `dsh.profile.bundles` 顺序保存成功解析的 bundle 层，每层附带包目录和 patch 列表。`patchPath: string` 是 profile 自身 patch 文件的绝对路径；`patches: PatchOptions[]` 是该文件的解析结果，文件不存在或跳过用户层时为空。跳过的 bundle 另列于 `skippedBundles`，不能从 `layers` 缺席直接推断未被选择。manifest 或用户 patch 读取错误会抛出，bundle 加载错误则进入跳过列表。

目标版本随附 `web`、`headless`、`acp`、`sdk`、`sdk-minimal` 模板；`desktop` 留给 Electron 管理。`--from-default-profile` 只在新建的非内置名称处复制模板。`dsh plugin --profile <name> add <bundle>` 在 profile 自身目录执行包操作，树外 bundle 安装到该 profile。运行中的 profile 是否立即应用配置取决于是否挂载 HMR；未挂载时重启后应用。

## PluginManager

公开 `@deepseek-ai/dsh-plugin-manager` 的 `PluginManager` 服务管理 profile 行与 bundle。安装完成、在 profile 中选中和运行时激活是不同状态。启用 bundle 会改变有序的 `dsh.profile.bundles`；停用保留依赖；移除先撤下选择和运行时贡献，再执行包删除。失败时保留已完成步骤并报告当前状态。`listBundles` 的 `enabled` 表示保存的选择，不能据此宣称插件 fiber 已激活。

| 成员 | 公开签名 | 用途与边界 |
| --- | --- | --- |
| `listBundles` | `(): Promise<BundleInfo[]>` | 包括禁用和出错的已选 bundle；`enabled` 是保存的选择。 |
| `listPlugins` | `(): Promise<PluginInfo[]>` | 返回运行时插件行及可持久编辑的 `patchId`；受保护或无法唯一定位的行带 `readOnlyReason`。 |
| `listVersionExemptions` | `(): { exemptions: Record<string, string[]>; warnings: string[] }` | 读取精确包版本和运行时版本的豁免；损坏记录以 `warnings` 呈现，不能视为已授权。 |
| `registries` | `(): Promise<PluginRegistries>` | 返回首选、备用及 pnpm 当前解析的 registry，查询可能因配置读取失败而拒绝。 |
| `inspect` | `(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>` | 安装前查询包说明符；网络或取消不改变 profile。 |
| `installBundle` | `(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>` | 安装并可选择启用；`requestId` 用于同一次安装的进度、取消和响应恢复。 |
| `waitForInstall` | `(requestId: PluginInstallRequestId): Promise<ChangeResult | null>` | 只等待仍活跃的安装；`null` 不证明成功或取消。 |
| `cancelInstall` | `(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>` | 等待包进程停止或报告已进入不可取消的应用阶段。 |
| `setBundleEnabled` | `(name: string, enabled: boolean): Promise<ChangeResult>` | 改变 bundle 选择及运行时组合，失败需读结果中的实际状态。 |
| `setPluginEnabled` | `(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>` | 以 `listPlugins` 返回的 Loader 行 id 修改可寻址 profile patch；受保护或未找到的行拒绝，优先层覆盖会在结果中报告。 |
| `setVersionExemption` | `(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>` | 精确版本豁免的授予需 `acceptRisk: true`；保存后重评估 live 插件，未启用 HMR 时需重启观察效果。 |
| `removeBundle` | `(name: string): Promise<ChangeResult>` | 先撤下选择和贡献，再删依赖；部分完成不自动回滚。 |

在 Creator preset 中可启用 `plugin_manager` 工具；工具操作需 `danger-full-access` 或单次批准。依赖构建脚本的批准是另一项持久化授权。外部 Host 包在进程内执行，不受工作区沙箱隔离。插件声明的 DSH peer 范围必须匹配运行时版本；不兼容安装在运行前拒绝，精确版本豁免另经用户确认。

## 失败与验证

对 bundle 的静态选择先运行 `dsh --profile <name> --dump-config`；对真实装载再启动目标 profile，查看诊断、必需服务是否可用，并执行一次插件行为。组合包加载失败会被跳过并保留选择；required 行启动失败会释放应用并导致非零退出，optional 行可留下诊断而让其余组合继续。不要仅依赖 dump，后者表示配置树而非激活状态。

对象证据：`packages/boot/app-boot/src/profile.ts`、`packages/boot/plugin-manager/src/index.ts`、`apps/cli/src/plugin.ts`、`apps/cli/src/args.ts`、`apps/cli/tests/profile-initialization.spec.ts`。操作路径见[组合包 HOW-TO](../how-to/how-to-infra-profile-bundle.md#在-profile-中安装并检查组合包)。
