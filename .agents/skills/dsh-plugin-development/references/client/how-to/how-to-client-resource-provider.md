# 在 Web slot 使用实时资源

## 注册一个按地址读取的 Resource Provider

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载 `@deepseek-ai/dsh-client-resources/client`、renderer 和你的 Client 包。先读[资源服务契约](../api/api-client-services.md)与[slot 契约](../api/api-client-slots.md)。

### 实现步骤

1. 选唯一 protocol 名和 `dsh-resource://<protocol>/…` 地址规范；在 `ResourceProtocolMap` 合并 value 类型。地址要包含读同一值所需的 Session/Workspace 身份。若值来自 Host，先建立可重连的 Remote 或 Session 事实，不能把浏览器内存当持久真相。
2. 实现 `ResourceProvider<P>.open(address,{ signal })`：先产出当前值，再产出变化帧；将业务失败转成 `RemoteResult` 的失败帧。订阅、流和定时器由 async iterator 所在范围拥有，在 signal abort 或迭代结束时释放。不要在普通失败时 throw，throw 表示程序缺陷。
3. 在 Client `apply` 中通过 `ctx.resources.register(provider)` 注册，绑定 disposer 到插件 fiber。slot 组件通过 `props.useResource<P>(address)` 获得 `status`、`value`、`failure`，分别绘制加载、可用和失败态；不自行手写订阅钩子。需要组件尚未挂载仍维持资源时使用 `pin(address,signal)`，拥有 pin 的范围负责 abort。
4. 在真实 Web Profile 打开同一地址的两个组件，确认 provider 只持有该地址的一份流；撤销一方仍可读，最后一个订阅或 pin 退出后 abort。重新打开或重连时确认用新的第一帧恢复。

### 验证与完成边界

Client 类型检查应覆盖 `ResourceProtocolMap`、provider value 和组件 hook。行为测试至少断言首帧、失败保留旧值、最后持有者释放、再次打开及取消。只测 UI 静态文本不能证明 provider 生命周期。
