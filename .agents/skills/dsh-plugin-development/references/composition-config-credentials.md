# 组合、配置与凭证

本文覆盖 v0.1.2-rc.1 的 profile、bundle、Cordis 配置、插件选项验证、credential reference 与生成的配置表面。

## 组合所有权

Profile 与 bundle 负责组装插件，不复制包行为。可运行示例只证明一种组合，不等于发布默认值。除非明确改变产品边界，实验性和 opt-in 组件不得进入默认 profile。

组合是 Loader entry graph。插件通过 `inject` 声明所有必需 Service，Cordis 只在依赖就绪后激活它。raw/web 组合导入的包必须出现在负责解析它的 manifest 中。用真实 Loader 测试最终 profile 或等价的 test-only 组合；手工连续调用 `ctx.plugin(...)` 不能证明 Loader resolution。

## 应用 Profile

支持的 Node 应用经同一 `dsh` CLI 启动：`dsh web` 或 `dsh --profile web/headless/sdk/sdk-minimal/acp`（选择其中一个实际 profile 名）。TypeScript 与 Python SDK 通过 sdk profile 和有序 patch 组合；不新增平行 application bin 或 caller-supplied inline Cordis tree。

`web`、`headless`、`sdk`、`acp` 基于 base bundle；`sdk-minimal` 是完整独立树，不叠加 base。Web 与默认 custom profile 热重载 patch；headless、sdk、sdk-minimal、acp 只在启动时应用。选择 Provider 和能力前检查实际 profile，不能假设所有应用有 WebServer、UI 或完整工具集。

插件的纯业务 Service、模型 Consumer 与 Web presentation 按实际职责组合。面向多 profile 的核心功能不要无理由依赖 webServer。ACP 扩展核对 session/model/MCP/permission/cancellation 协议转换及 automation-only 约束；SDK 扩展核对同版本 launcher、请求/事件投影和取消，不把 Host 内部句柄暴露为 wire API。

Agent presets 由 `dsh-agent-presets` 包随发行携带。Profile 决定应用树，Agent preset 决定 Agent 组合，两者不是同一配置。包内 Loader fixture 在所属 manifest 声明依赖，不能依靠根目录偶然存在的 node_modules 链接。

## 已发布组合的默认行为

Base-backed profiles 自带 Storage hub、JSON backend、Storage domain 和 per-record Session projection cache；这些不再只是 Web bundle 的依赖。`sdk-minimal` 不使用 base，不能据此推断同样存在。

Base 同时挂载官方 DeepSeek body extension registry、Session log 与 package inventory contributor。它们走官方 LLM 请求，不等同于 OTLP telemetry；关闭 telemetry 不能据此推出官方请求附加字段也关闭。字段内容与 acceptance 见 [官方请求扩展](llm-provider-adapters.md#discovery图片计费与官方请求扩展)。

Base 的 Session telemetry mode 默认为 `FEEDBACK_ONLY`，环境可覆盖为 FULL 或 DISABLED。Feedback-only 在用户记录 feedback 时交付本生命周期自上次 handoff 至该事件的记录；上传是捕获记录，不自动脱敏。包能力、默认 bundle 与具体部署覆盖分别核查，不把“没有主动调用 telemetry”当作无数据流。

Web fetch 的默认组合见 [Web 能力](web-capabilities.md#接缝与选择)。Module HMR 在 base 默认禁用；Web/custom profile 的 live patch watching 有独立 fallback，不等于所有模块都自动热重载。Schedule 的 Web row 默认 disabled，须明确 overlay 与 Host 服务共同启用。

Agent preset 的 root 优先级、standing generation、copy-only authoring 和 blank-session 切换规则由 [Preset 与上下文](presets-context.md) 统一维护。

## 配置规则

部署时无需改代码就会变化的值使用已验证 Config：endpoint、host、port、timeout、Provider route、feature policy、credential reference 或 overlay 选择。不要硬编码 tunable，也不要用 test hook 伪装可配置性。外部协议常量与安全不变量保持固定。

函数插件导出 `Config: z<Config>`，并在 `apply` 中接收验证后的值。Service class 通过 `static Config` 暴露同一 schema，并在 constructor 中接收配置。可独立判断的无效值应在加载时失败；依赖其他 live Service 的 reference 在首次能够解析时失败。

条件值只在 v0.1.2-rc.1 Loader 允许的 `config` 与 entry `disabled` 字段使用 `!!js` expression tag；其他 metadata 保持 literal。环境选择整组插件时使用 profile patch 或 overlay，不让包代码读取部署全局变量。

## 凭证所有权

配置可以保存 credential reference；secret value 属于 `ctx.credentials`。如果轮换应影响下一次请求，就在每次操作时解析 reference。Provider 代码只在边界请求所需期间持有已解析 secret。

绝不提交 secret，不把它写入 profile、log、error、Session event 或 Client projection。Settings/catalog API 只返回 reference identity 与安全描述，不返回值。凭证缺失或未授权必须显式失败；除非 Provider contract 明确规定，否则不得回退到另一个环境变量或匿名模式。

Authorization 与 credential storage 是不同职责。Authorization 和用户交互以获得并提交 CredentialKey record，不负责 tool approval 或创建环境变量 reference；完整契约见 [交互授权](credentials-authorization.md)。Consumer 依赖 credential seam，不依赖某个 file/env 实现。

## 生成的 catalog 与 API

Config catalog、Cordis catalog、tool catalog、Remote declaration 和 Client binding 都有所属源与 generator。可用生成物发现公共表面，但要修改其源。不得手工编辑生成区域。修改后运行所属 generator 或文档 gate；只有流程要求纳入版本控制时才提交生成物。

## Credential 状态与 Telemetry handoff

CredentialRef 的空 secret 在各 Provider 中按 absent 处理；CredentialKey 的 record 使用不同存在语义，见 [Credential records](credentials-authorization.md)。`describe()` 只返回配置状态、来源和可写性，不返回 secret；Local Provider 的 live environment shadow 使该 reference 只读，避免写入看似成功但 resolve 仍读旧值。`credentials/reference-updated` 只通知 Provider 管理来源的已提交变化，ambient environment 变化不产生该事件；Consumer 仍逐操作 resolve。

Session telemetry 在每个 turn/step 只捕获第一条 assistant/chunk，其他 chunk 被主动过滤，wire seq 缺口不能当丢包。Cursor 表示 handed-off，不是 delivered；接收端对 ledger 按 Session id/event seq 去重，ops signal 没有同一身份。Batching、retry 与丢失策略归 reporting SDK，Harness 不承诺交付或保留。

`session-telemetry/record` 只处理导出副本，不改写 Session 权威日志。没有 listener 就不自动清洗；抛异常会 fail closed 扣留该条记录。Backend 的 sharing 描述部署策略，只有没有服务时才展示“未配置”；不能由 disclosure 推断数据已送达。

## 组合测试步骤

1. 编写 test-only `cordis.yml`，包含目标包及所有必需 Provider。
2. 通过真实 Loader 和产品使用的同一 resolver face 启动。
3. 等待 Loader 完成，断言没有启用但未加载的 entry。
4. 执行用户、模型或协议可见行为。
5. Dispose root fiber，并证明 route、registration、Agent、process 和 callback 已静默。
6. 适用时增加无效 Config、缺失 reference 或重复 Provider 失败用例。

网络组合使用 port zero 与本地 fake。Keyless 测试不得包含凭证。Real-provider e2e 可以在无 key 时 self-skip，但确定性的组合测试仍然必需。
