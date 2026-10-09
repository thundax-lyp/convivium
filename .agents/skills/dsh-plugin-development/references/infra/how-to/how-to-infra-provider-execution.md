# 受限命令执行

## 通过 ShellExecutor 运行受限命令

Host 插件要运行一次受限命令，并把退出、截断与 sandbox 事实作为规范结果返回。Profile 需有同一执行世界的 subprocess、sandbox 与 shell 具体后端；公开契约见 [执行 API](../api/api-infra-provider-execution.md#shellexecutor)。完整调用见 [example-infra-provider-execution](../examples/example-infra-provider-execution.md)。

### 实现步骤

1. 创建 `inject = ['shell', 'tools']` 的插件；把工作目录限定到调用方已认可的绝对目录。
2. 使用 `ctx.shell.resolve` 生成完整 spec，传入命令、期限、输出上限、调用取消信号及每次执行的 `sandboxPolicy`，然后调用 `ctx.shell.execute(spec)` 与句柄的 `result()`。不能直接把原始 request 交给 `execute`。
3. 将非零退出、超时、取消、stderr 与 `sandbox` 结果作为普通执行结果处理；基础设施拒绝走错误路径。截断时报告 spill 路径，不能把保留尾部称为完整输出。卸载时由底层 subprocess 所有者终止仍活动进程。
4. 对真实后端分别验证受限文件操作被拒绝、runner 失败被识别、取消后进程范围静默。

### 验证与完成边界

声明编译、Profile 装载、正常与非零命令、超时和取消均需检查。`sandbox.enforcement === 'partial'` 不满足完整隔离要求；只有同 OS 上实际运行文件写入试探、进程后代试探和卸载回收，才能验证安全边界。本示例的静态和语法检查不覆盖这些平台行为。
