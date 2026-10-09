# PTC runtime 调用

## 在 Host 插件中运行带 binding 的程序

目标是让插件运行一段固定 TypeScript 程序，并暴露一个只返回 JSON 的 Host binding。Profile 必须装载 `@deepseek-ai/dsh-ptc-runtime-node` 及其 fs/subprocess/sandbox 依赖。对象契约见 [PTC API](../api/api-infra-provider-ptc.md#ptcruntime)，完整文件见 [example-infra-provider-ptc](../examples/example-infra-provider-ptc.md)。

### 实现步骤

1. 创建 `inject = ['ptcRuntime', 'tools']` 的 Host 插件；运行前检查 `ctx.ptcRuntime.language` 是否为示例程序语言。
2. 在 binding 中验证未知参数，返回 lossless JSON；调用 `resolve` 补全工作目录/期限，传入调用取消信号，再 `run(spec)`。
3. 对 `result.error` 做结构化处理；`logs` 与 `value` 进入单份规范工具结果。失败不能靠 Promise rejection 识别。若允许模型写入程序，必须另行界定 binding 权限、沙箱策略和程序输出上限。
4. 在目标 Profile 测正常运行、非法 binding 参数、程序异常、超时、取消和卸载。

### 验证与完成边界

Node 后端真正执行时才能验证 worker/process 隔离、JSON 桥接与回收；运行时导出和示例语法检查不证明敌意程序安全。Python 后端是实验/私有实现，不由本指南承诺发布可用性。
