# 能力接缝与 Provider

本 reference 说明 rc.2 中与具体 Provider 无关的能力设计。它不枚举全部已发布接缝；准确方法和 event 以目标包 README 为准。

## 三角色接缝

一个可替换能力包含 Service Definition、一个或多个 Service Provider，以及一个或多个 Consumer。Definition 拥有与 Provider 无关的 request、result、错误、取消、选择规则和 service key。Provider 拥有具体 process、vendor、protocol、storage backend、凭证、资源生命周期和转换逻辑。Consumer 拥有拿到中立结果后的模型/用户行为。

只有当三个角色会独立演进时才拆包。没有可互换实现的单用途功能应保持为一个插件。不要只为给 helper 命名或预想尚未需要的 Provider 而创建公共接缝。

Consumer 依赖 Definition 包与 `ctx.<service>`，绝不依赖具体 Provider。Definition 不应暴露 vendor wire 字段、UI card props 或单个 Consumer 的便利选项。Service 方法泄漏 vendor-specific type，说明接缝尚未完成。

## 设计工作表

实现前在类型和包 README 中回答：

| 主题       | 必须回答                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| Definition | 所有当前 Consumer 共同需要什么中立 request、result、typed failure 和取消语义？ |
| Provider   | 本实现拥有什么资源、协议、凭证解析、重试规则与 teardown？                      |
| Consumer   | 它拥有什么模型/用户行为、渲染与持久 event？                                    |
| Selection  | 谁在何时选择 Provider？缺失或重复时怎样失败？                                  |
| Defaults   | 哪个显式 `resolve(request): Spec` 步骤会在执行前补全默认值？                   |
| State      | 哪些记录持久化，哪些 handle 只存在于进程内？                                   |
| Lifecycle  | 哪个 disposer 达到静默状态并阻止 unload 后的回调？                             |
| Test       | 哪个真实组合会解析 Provider 并证明可见结果？                                   |

## 选择与失败

只有一个活动实现的能力使用一个 service key。只有当多个命名实现确实共存时才使用 registry。Registry 统一拥有重复规则、lookup、顺序/优先级、disposal 和缺失 Provider 错误；不要把这些决策分散到 Consumer。

在包边界显式补全默认值：先把 request 解析为完整 spec，再执行 spec。不要把 `?? default` 隐藏在 Provider 的 `run()` 内。部署选择属于已验证 Config；协议与安全不变量保持固定。

信息已齐全时，错误配置在加载期失败。稍后才能解析的 reference 在首次可确定的调用处失败。不得静默跳过配置的 Provider、任意选择重复项或把缺失 reference 当作空结果。

## Provider 边界

在 network、process、worker、file、durable storage 和 model/tool JSON 边界解析并验证输入。信任有类型约束的同进程值；在每个方法调用重复验证并不会增加保护。Provider-specific 的认证、序列化、重试和错误转换留在 Provider 包内。

Provider 持有 transport 或资源，直到 disposal 达到静默状态。取消终止单次操作；插件 disposal 终止 Provider 并阻止后续回调。Consumer 不得让 live Provider handle 超过 Service 生命周期。

## 证据

分别单元测试 Definition 的解析与 Provider 的转换。再添加同时安装 Definition、一个 Provider 和真实 Consumer 的组合测试；证明缺失和重复选择按设计失败。覆盖取消与 fiber disposal。如果模型可见行为变化，应 snapshot Consumer 组合出的 request 或 transcript，而不是 Provider 内部值。
