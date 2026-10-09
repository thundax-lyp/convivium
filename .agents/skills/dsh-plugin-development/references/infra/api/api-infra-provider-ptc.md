# PTC 程序执行后端

## 对象关系与使用场景

`@deepseek-ai/dsh-ptc-runtime` 提供 `ctx.ptcRuntime` 抽象 Service：运行一段程序并通过具名异步 binding 与 Host 交互。目标版本公开 `@deepseek-ai/dsh-ptc-runtime-node` TypeScript/Node 后端；Python 后端在实验包中，不能把它当默认组件。PTC runtime 本身不拥有 Tool registry 或 Session，调用者负责把 binding 权限、取消和结果写入相应日志。任务见 [PTC HOW-TO](../how-to/how-to-infra-provider-ptc.md#在-host-插件中运行带-binding-的程序)。

## PtcRuntime

**公开导出**：`PtcRuntime` 来自 `@deepseek-ai/dsh-ptc-runtime`。
`language` 是源语言标识，`isolation` 是执行介质描述，均不是安全证明。`executionInstructions`、`sandboxMode`、`timeout` 是 provider 报告的使用提示与部署配置。`resolve(request: PtcRunRequest): PtcRunSpec` 验证本后端支持的目录、期限与 sandbox policy 并补全值；`run(spec): Promise<PtcRunResult>` 只接受完整 spec。程序异常、超时、取消、substrate 故障等都以结果中的 `error` 字段结算；只有违反 Service 定义的调用才拒绝。后端须隔离相互独立的运行、终止并等待卸载时尚在执行的程序。

## PtcRunRequest

**公开导出**：`PtcRunRequest` 来自 `@deepseek-ai/dsh-ptc-runtime`。
`program` 是后端语言的 async 函数体，可用顶层 `await`/`return`。`bindings` 是具名 namespace 列表，`cwd`、`timeoutMs`、`sandboxPolicy`、`signal` 可选；数值期限由 provider 验证/限幅，`null` 表示请求无限期限。无 confinement 的 provider 会拒绝显式 sandbox policy。取消会停止程序，但已发出的 Host binding 调用仍由调用者负责结算。

## PtcBindingNamespace

**公开导出**：`PtcBindingNamespace` 来自 `@deepseek-ai/dsh-ptc-runtime`。
`global` 必须是跨目标语言可移植且非保留的标识符；`functions` 的每个函数收取未知参数并返回 lossless JSON Promise。运行时须拒绝非 JSON 或不可克隆值，不能静默丢字段。可选 `errorClass` 给程序中的 binding 拒绝提供具名错误类型。公开的 `RESERVED_BINDING_GLOBALS`、`RESERVED_ERROR_MEMBERS`、`PORTABLE_RESERVED_WORDS` 与 `DUNDER_MEMBER` 是同一版本所有后端共享的命名限制。

## PtcRunResult

**公开导出**：`PtcRunResult` 来自 `@deepseek-ai/dsh-ptc-runtime`。
成功时 `value` 是 lossless JSON，`logs` 是捕获文本；失败时 `error.kind` 区分 `exception`、`timeout`、`abort`、`worker-exit`、`invalid-output`、`output-limit`、`protocol`、`sandbox-unavailable`。`sandbox` 的 `mode`、`denied`、可选 `enforcement` 是执行事实；`denied` 不等于隔离完整性证明。消费者必须分别处理 `error` 与成功 `value`，不能只看 Promise 是否 resolve。

## 装载与验证

Profile 选一个具体 runtime；Node 后端依赖同执行世界的 fs、subprocess、sandbox 与 sandboxPolicy。验证 binding JSON 边界、异常、超时、取消、卸载回收与真实隔离；独立子进程/worker 的敌意程序测试仍需运行，静态示例只验证调用形状。
