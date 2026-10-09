# 虚拟 Skill provider

## 注册虚拟 Agent Skill

让插件在 Skill catalog 中提供一个按需加载的 Skill，并经模型工具读取正文。Profile 先有 `@deepseek-ai/dsh-skill` 和 `@deepseek-ai/dsh-tool-skill`。对象契约见 [Skill provider API](../api/api-infra-provider-skill.md#skillregistry)。

### 实现步骤

1. 创建 Host 包，声明 `inject = ['skills']`；文件与代码见 [example-infra-provider-skill](../examples/example-infra-provider-skill.md)。
2. 在同步 `apply` 中调用 `ctx.skills.registerProvider`。提供稳定 provider 名、合法 kebab-case Skill 名与摘要；`list` 只做发现，`get` 才返回正文。按真实可用性选择 `invocation`，虚拟资源可用 `resourceBase: { kind: 'opaque', description }` 说明。
3. 把网络初始化、取消和 catalog 刷新放进 provider 方法；数据变化时调用 `control.invalidate()`。插件 fiber 卸载会取消控制信号并移除候选。
4. 把插件装载到 Profile。用 `ctx.skills.list()` 观察摘要，用 `ctx.skills.get(name)` 观察正文，再通过模型 Skill 工具确认实际可读。

### 验证与完成边界

声明编译后测试同层 provider 重名拒绝、非法 Skill 名、取消、卸载和同名 rank。example 是进程内固定正文，不验证外部存储或热更新；真实 provider 应补这些行为测试。
