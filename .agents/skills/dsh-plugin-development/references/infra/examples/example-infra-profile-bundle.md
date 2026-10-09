# Example：最小 Profile 组合包

目标是把一个可观察的 Host 插件作为独立 npm bundle 装载。完整契约见 [Profile manifest](../api/api-infra-profile-manifest.md#dshbundlemanifest)；包名仅为示例，发布前改为自己拥有的名称。

## 文件清单

```text
example-dsh-bundle/
├── package.json
├── index.mjs
└── cordis.patch.yml
```

`package.json`：

```json
{
  "name": "example-dsh-bundle",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.mjs" },
  "files": ["index.mjs", "cordis.patch.yml"],
  "peerDependencies": { "@deepseek-ai/dsh": "0.2.0-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

`index.mjs`：

```js
export const name = 'example-dsh-bundle'

export function apply(ctx) {
  // 该示例没有异步资源；真实插件注册资源时要在所属 scope 释放。
  ctx.logger.info('example-dsh-bundle active')
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: example-dsh-bundle
      name: example-dsh-bundle
```

## 构建、安装与观察

在包目录运行 `npm pack` 得到本地 tarball。用一个隔离 `DSH_HOME` 和自定义 profile 测试：

```text
dsh --profile demo --from-default-profile web --dump-config
dsh plugin --profile demo add ./example-dsh-bundle-1.0.0.tgz
dsh --profile demo --dump-config
dsh --profile demo
```

在目标 profile 目录执行 `dsh plugin` 时，tarball 参数需使用对该进程调用目录有效的路径；也可传绝对路径。第二次 dump 应出现 `example-dsh-bundle` 行，启动诊断应出现插件日志；dump 单独不能证明激活。停用 bundle 后重新运行 profile，日志不应再出现，且不留下该插件的资源。这里以同步日志作为最小可观察行为；真正的 Service、Tool 或 UI 插件还需按各自 API 页补充业务验证。
