# 发布并装载 Web 半侧

## 让一个 Client UI 包随 Profile 在浏览器出现

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。已有 Host Profile、Web Shell 和 `@deepseek-ai/dsh-client-modules`。先读[Client 包与模块契约](../api/api-client-modules.md)。

### 实现步骤

1. 建立包的 Host `.` 导出和浏览器 `./client` 导出。纯 UI 包的 Host `apply` 可以为空，但仍须是 Loader 可导入插件。`package.json` 声明 `dsh.client.platform: "web"`；`./client` 指向构建出的声明和 `lib/client.js`。
2. 以目标仓库的 `clientBundle` 预设构建浏览器 half，检查输出是向页面模块加载器登记包名与 factory 的 lazy-CJS 脚本。在独立仓库中，先实现兼容该格式的构建链；目标仓库相对 `packages/client/tsdown.client.ts` 不可从 npm 安装。CSS Modules 和共享模块请求也要在构建时闭合。
3. 将包作为依赖安装进 Web 组合，并在 Profile 中启用**裸包名** Loader 行。不要仅启用 `pkg/subpath` 行；浏览器 half 不会附着于那一行。`dsh.client.inject` 可标明包名关系，但 Service 激活仍由浏览器 `inject` 决定。
4. 重新构建后启动 Web Profile，打开目标页面并观察由插件 `apply` 注册的 UI 贡献。停用根行，确认贡献、订阅和样式被清理；重新启用后确认重新注册。改 manifest 后重启以排除模块系统缓存。

### 验证与完成边界

检查 `package.json` 的两个 exports 均可解析，`lib/client.js` 存在且内容使用模块 loader factory 格式；检查 Host Loader 根行处于已启用状态、页面贡献可见，停用时消失。仅类型编译或存在 TSX 源码不足以证明运行时装载。具体 slot 注册见[贡献 Web slot](how-to-client-slot-contribution.md)。
