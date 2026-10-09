# 组合包与 Profile manifest

## DshBundleManifest

**公开导出**：`DshBundleManifest` 来自 `@deepseek-ai/dsh-package-manifest`。
公开类型来自 `@deepseek-ai/dsh-package-manifest`，仅作类型导出；运行时由 profile launcher 读取包的 `package.json.dsh.bundle`。`patch: string | string[]` 必填，路径相对于声明包根目录；数组按声明顺序应用。发布包必须把这些文件纳入 npm `files`，否则安装后无法读取。`dsh.bundle` 不代表已在某个 profile 中启用，须由其 `dsh.profile.bundles` 选中。

最小声明形状：

```json
{
  "name": "example-dsh-bundle",
  "version": "1.0.0",
  "type": "module",
  "files": ["cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

补齐实际插件依赖、公开入口、构建产物及与运行时匹配的 DSH peer 范围后再发布。仅有此 manifest 不会自动生成 Cordis 行；见[完整交付步骤](../how-to/how-to-infra-profile-bundle.md#制作可安装的-profile-组合包)。

## DshProfileManifest

公开类型 `DshProfileManifest` 定义 `bundles?: string[]`，位于本地 profile 的 `package.json.dsh.profile`。顺序决定 patch 覆盖优先级；后层同 id 覆盖前层。profile 还拥有自己的 `cordis.patch.yml`，优先级在所有 bundle 层之后。无 bundle 列表不等于启动器会发现目录里的每个已安装包。

`DshPackageManifest` 可同时包含 `bundle`、`profile` 和 `client` 角色，但是否装载仍由各消费方决定。`engines.dsh` 是声明字段；目标启动路径的版本检查读取 DSH 相关 `peerDependencies`，不可把 `engines.dsh` 当作装载门禁。

## 失败与验证

`bundlePatchFiles` 校验 patch 声明；组合包解析、manifest 读取或 patch 失败时，该 bundle 在 `skippedBundles` 中报告，其已保存选择不自动撤销。profile 或用户 patch 的解析错误会阻止启动。`dsh --profile <name> --dump-config` 可在装载前观察组合出的行；它不证明插件已激活。启动后还需检查具体插件 fiber、依赖和一次可观察行为。

对象证据：`packages/util/package-manifest/src/types.ts`、`packages/boot/app-boot/src/profile.ts`、`packages/bundle/base/package.json`、`apps/cli/src/profile-boot.ts`；完整交付见[组合包 HOW-TO](../how-to/how-to-infra-profile-bundle.md#制作可安装的-profile-组合包)。
