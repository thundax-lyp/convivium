# Host 大文本与附件持久化

## 从插件调用 Spill 与附件存储

插件把完整大文本保存为 session 所属 spill，并把不可变文件字节保存为附件引用。Profile 先装载两种具体后端（例如 `dsh-spill-local` 与 `dsh-attachment-local`）。公开契约见 [存储 API](../api/api-infra-provider-artifacts.md#spillstore)，完整调用见 [example-infra-provider-artifacts](../examples/example-infra-provider-artifacts.md)。

### 实现步骤

1. 从真实 `exec.agent.id` 和 `exec.callId` 建立 spill owner/source；不能伪造或借用其他 Session 身份。`saveText` 输入完整文本，建议名称仅是提示。得到 `SpillRef` 后将不透明 locator 和检索指引作为规范结果呈现。
2. 需要不可变文件引用时，将准确字节交给 `ctx.attachments.saveFile` 或有界 `saveFileStream`。只有返回成功引用后，才把它写入可恢复会话事件。若只是一次工具结果，可在规范结果中交还引用，不声称用户消息已有该附件。
3. 对存储失败保留原始错误；不要在没有持久化成功时发布 locator。附件读取必须验证引用对应的字节，取消传播到流式操作。
4. 安装插件并在目标 Profile 做写入、读取、重启、权限与损坏试验。

### 验证与完成边界

示例只覆盖静态形状和一次服务调用。真实后端要验证 spill 原文/UTF-8 字节数、目录私有性、名称消毒、ENOSPC 拒绝、附件完整性、流背压和重启读取；未做这些检查前不能称耐久性或访问控制已验证。
