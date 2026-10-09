# 在插件中使用 FileSystem

## 在 Host 插件中通过 ctx.fs 读取文件

目标是由装载的文件后端读取一个普通 UTF-8 文本文件，并把规范结果交给模型工具。Profile 需有一个 `ctx.fs` 后端和 `@deepseek-ai/dsh-tools`。对象契约见 [FileSystem API](../api/api-infra-provider-fs.md#filesystem)；工具契约见 [Host Tool](../../host/api/api-host-tools.md)。

### 实现步骤

1. 创建 Host 插件，声明 `inject = ['fs', 'tools']`；完整包见 [example-infra-provider-fs](../examples/example-infra-provider-fs.md)。
2. 工具调用时把 `exec.signal` 传给 `resolve`、`stat`、`readText`。检查 `stat` 确认目标是普通文件；返回单份规范文本结果，渲染函数只投影结果。
3. 不解析 `FsTarget.targetKey`，也不按 Host 路径推断后端执行世界。根据 `FsError.code` 处理缺失、非文本、权限及取消；注册归插件 fiber，卸载释放工具。
4. 通过目标 Profile 安装和装载，调用一次存在文件、一次不存在文件，再卸载检查工具消失。

### 验证与完成边界

声明编译与真实装载均需核查。此示例是只读消费路径；若自建 `FileSystem` 后端，仍要实现全部抽象成员并通过目标身份、符号链接、版本原子修改、取消和执行世界一致性测试。只读示例通过不证明这些写入契约。
