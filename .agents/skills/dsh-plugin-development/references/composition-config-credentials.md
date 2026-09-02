# 组合、配置与凭证

本 reference 覆盖 rc.2 的 profile、bundle、Cordis 配置、插件选项验证、credential reference 与生成的配置表面。

## 组合所有权

Profile 与 bundle 负责组装插件，不复制包行为。可运行示例只证明一种组合，不等于发布默认值。除非明确改变产品边界，实验性和 opt-in 组件不得进入默认 profile。

组合是 Loader entry graph。插件通过 `inject` 声明所有必需 Service，Cordis 只在依赖就绪后激活它。raw/web 组合导入的包必须出现在负责解析它的 manifest 中。用真实 Loader 测试最终 profile 或等价的 test-only 组合；手工连续调用 `ctx.plugin(...)` 不能证明 Loader resolution。

## 配置规则

部署时无需改代码就会变化的值使用已验证 Config：endpoint、host、port、timeout、Provider route、feature policy、credential reference 或 overlay 选择。不要硬编码 tunable，也不要用 test hook 伪装可配置性。外部协议常量与安全不变量保持固定。

函数插件导出 `Config: z<Config>`，并在 `apply` 中接收验证后的值。Service class 通过 `static Config` 暴露同一 schema，并在 constructor 中接收配置。可独立判断的无效值应在加载时失败；依赖其他 live Service 的 reference 在首次能够解析时失败。

条件值只在 rc.2 Loader 允许的 `config` 与 entry `disabled` 字段使用 `!!js` expression tag；其他 metadata 保持 literal。环境选择整组插件时使用 profile patch 或 overlay，不让包代码读取部署全局变量。

## 凭证所有权

配置可以保存 credential reference；secret value 属于 `ctx.credentials`。如果轮换应影响下一次请求，就在每次操作时解析 reference。Provider 代码只在边界请求所需期间持有已解析 secret。

绝不提交 secret，不把它写入 profile、log、error、Session event 或 Client projection。Settings/catalog API 只返回 reference identity 与安全描述，不返回值。凭证缺失或未授权必须显式失败；除非 Provider contract 明确规定，否则不得回退到另一个环境变量或匿名模式。

Authorization 与 credential storage 是不同职责。Authorization 可以和用户交互以建立权限或 reference；Credential Provider 负责解析和更新。Consumer 依赖 credential seam，不依赖某个 file/env 实现。

## 生成的 catalog 与 API

Config catalog、Cordis catalog、tool catalog、Remote declaration 和 Client binding 都有所属源与 generator。可用生成物发现公共表面，但要修改其源。不得手工编辑生成区域。修改后运行所属 generator 或文档 gate；只有流程要求纳入版本控制时才提交生成物。

## 组合测试步骤

1. 编写 test-only `cordis.yml`，包含目标包及所有必需 Provider。
2. 通过真实 Loader 和产品使用的同一 resolver face 启动。
3. 等待 Loader 完成，断言没有启用但未加载的 entry。
4. 执行用户、模型或协议可见行为。
5. Dispose root fiber，并证明 route、registration、Agent、process 和 callback 已静默。
6. 适用时增加无效 Config、缺失 reference 或重复 Provider 失败用例。

网络组合使用 port zero 与本地 fake。Keyless 测试不得包含凭证。Real-provider e2e 可以在无 key 时 self-skip，但确定性的组合测试仍然必需。
