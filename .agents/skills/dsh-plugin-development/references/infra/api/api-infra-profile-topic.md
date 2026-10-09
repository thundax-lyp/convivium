# Profile 与组合包：交付可装载的插件组合

## 对象关系

`package.json` 的 `dsh.bundle.patch` 让一个 npm 包成为可选的 profile 组合包；`dsh.profile.bundles` 是某个 profile 选中的有序组合包列表。`dsh` 启动器按列表叠加这些 patch，再应用 profile、home 及本次命令的覆盖层。每个 patch 中的 Cordis 行才会装载具体插件。组合包本身不是额外的运行侧，也不保证其中每行都成功激活。

目标版本的 `web`、`headless`、`acp` 和 `sdk` 模板使用 base 加模式层；`sdk-minimal` 使用独立层。Agent preset 是 Web 模式中被装载的一类行，不能把它与 profile 或 bundle 当成同一个对象。一个包可以同时声明 bundle 和 Client 模块；浏览器模块仍需满足 Client 的独立导出与构建契约。

## 选型与使用

- 只给现有 profile 增加一行时，用用户 `cordis.patch.yml` 覆盖层；需要将一组插件及默认配置作为可安装依赖复用时，发布 bundle。详见 [manifest 与组合契约](api-infra-profile-manifest.md#dshbundlemanifest)和[制作组合包](../how-to/how-to-infra-profile-bundle.md#制作可安装的-profile-组合包)。
- 管理现有 profile 选中、停用和卸载 bundle 时，使用 `dsh plugin --profile <name>` 或产品提供的插件管理界面。详见 [Profile 装载契约](api-infra-profile-runtime.md#profile)和[安装与检查](../how-to/how-to-infra-profile-bundle.md#在-profile-中安装并检查组合包)。
- 自己实现持有 profile 的应用壳时，包操作走 [runPluginCommand](api-infra-package-operations.md#runplugincommand)；它比插件内部管理服务低一层，调用方负责执行模式和包管理器环境。
- 自定义 profile 要消费 `dsh` 启动器剩余参数时，使用 [CmdlineArgs 与 parseCmdline](api-infra-cmdline.md#cmdlineargs)；完整路径见[应用参数 HOW-TO](../how-to/how-to-infra-app-args.md#为自定义-profile-解析应用参数)。
- 自定义组合要验证包拥有的事件与状态关系时，先装载 [InvariantRegistry](api-infra-invariants.md#invariantregistry)，再装载目标包的 companion；步骤见[运行时不变式 HOW-TO](../how-to/how-to-infra-invariants.md#给插件组合装载包拥有的不变式检查)。
- 需要在运行时改变插件设置时，先确定字段是否声明 `.volatile()`；普通字段经配置重载。详见 [实时设置](api-infra-live-config.md#settingsforms)。

插件业务 API、Client UI 与 Remote 方法的权威定义由各自主题页拥有；这里只拥有其交付和装载关系。
