# Computer use 独占 provider 槽

## 对象关系与使用场景

`@deepseek-ai/dsh-computer-use` 的 Host Service 只保留当前唯一 computer-use provider 名。鼠标、键盘、屏幕和权限边界由具体 provider 独立实现并向 `ctx.tools` 注册。目标版本的 Cua Driver MCP/native 插件是实验性具体后端，不随注册表自动启用。组合任务见 [HOW-TO](../how-to/how-to-infra-provider-computer-use.md#选择并装载一个-computer-use-provider)。

## ComputerUseRegistry

**公开导出**：`ComputerUseRegistry` 来自 `@deepseek-ai/dsh-computer-use`。
服务注册为 `ctx.computerUse`，无配置。`providerName` 在注册持有时返回名称；未注册返回 `undefined`。`register(name: ComputerUseProviderName): () => Promise<void>` 保留唯一槽，同名重复也拒绝。槽只表示所有权，不证明驱动、桌面权限或工具连接已就绪。

具体 provider 必须先停止新工具调用，关闭 native/MCP 驱动并等待所有自有工作，再释放注册。目标版本 Cua Driver MCP 实现用单个 effect 先登记，再装载 MCP client，卸载时先 `child.dispose` 才释放槽；初始连接/发现失败会回滚。这是可复核的生命周期组合，非 registry 自动完成的行为。

## ComputerUseProviderName

`@deepseek-ai/dsh-computer-use/brand` 导出同名品牌类型与 `ComputerUseProviderName(name: string)` 工厂。工厂不验证字符串；具体 provider 选择稳定非空名称，用于独占冲突诊断。它不是桌面 session、窗口或设备身份。

## 装载与验证

Profile 先装载 registry 与 `ctx.tools`，再装载恰好一个 Cua Driver 实现。MCP 版还需已安装 `cua-driver` 可执行文件与可用桌面权限。验证重复 provider 拒绝、连接失败回滚、工具实际可达、取消与卸载后进程/槽清理。静态 registry 检查不能证明桌面操作安全或授权成功。
