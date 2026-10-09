# Profile 交付与装载

## 制作可安装的 Profile 组合包

把一组 Host 插件和默认配置打包为可在目标 `0.2.0-rc.2` profile 选用的 npm bundle。先读 [manifest 契约](../api/api-infra-profile-manifest.md#dshbundlemanifest)与 [Profile 解析](../api/api-infra-profile-runtime.md#profile)。

### 实现步骤

1. 创建包 `package.json`，提供公开入口和构建产物，声明 `dsh.bundle.patch`，把 patch 与运行时代码纳入 `files`；声明实际依赖及兼容目标运行时的 DSH peer 范围。
2. 在 `cordis.patch.yml` 中按稳定 id 插入目标插件行；需要配置时写完整 config。patch 的同 id 后层覆盖前层，不是字段级 merge。文件清单和最小包见[组合包示例](../examples/example-infra-profile-bundle.md)。
3. 构建、打包并在隔离 profile 安装。若插件带 Client 半侧，另准备 `./client` 导出、`dsh.client` 元数据与 Client 构建，不因 Host bundle 装载就假设浏览器可用。
4. 预览有效配置，再启动 profile；检查跳过的 bundle、插件 fiber 和一次行为。停用或卸载时验证所属 effect 已释放。

### 验证与完成边界

`dsh --profile <name> --dump-config` 验证行是否组合；启动并执行行为才验证运行时。再测错误配置、缺失依赖、停用与重启。安装时需要构建脚本批准或版本豁免的情况，按实际诊断处理，不把审批写入包的静态默认配置。

## 在 Profile 中安装并检查组合包

将已发布或本地打包的 bundle 加入一个应用 profile。`desktop` 由 Electron 管理；以下 CLI 步骤针对其他 profile。

### 实现步骤

1. 需要独立 profile 时运行 `dsh --profile <新名称> --from-default-profile web`；现有 profile 可直接使用。随后运行 `dsh plugin --profile <名称> add <包说明符>` 安装依赖。
2. 检查 profile `package.json` 的 `dsh.profile.bundles`、安装诊断及 `dsh --profile <名称> --dump-config`；包已安装、被选中和成功挂载是三个不同状态。
3. 启动目标 profile 并确认插件入口的可观察行为。若 HMR 未挂载，重启后才应用变更；若 bundle 出现在 skipped 诊断，先修复该层而非继续解释为业务问题。

### 验证与完成边界

记录启动前后的 bundle 选择、dump 行、fiber 状态和行为结果；停用后确认贡献消失，重新启用后恢复。`enabled` 只表示保存的选择，不能代替装载验证。
