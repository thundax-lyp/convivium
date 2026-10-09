# FileSystem 执行世界

## 对象关系与使用场景

`@deepseek-ai/dsh-fs` 提供 `ctx.fs` 抽象 Service。Profile 需装载一个具体后端，例如 `@deepseek-ai/dsh-fs-local`；`@deepseek-ai/dsh-fs-sandbox` 是写入受 sandbox policy 约束的后端。插件调用此服务可在所装载执行世界访问文件，文件工具也消费它。只读消费任务见 [HOW-TO](../how-to/how-to-infra-provider-fs.md#在-host-插件中通过-ctxfs-读取文件)。

## FileSystem

**公开导出**：`FileSystem` 来自 `@deepseek-ai/dsh-fs`。
`resolve(path, { cwd?, signal? })` 返回具有稳定身份的 `FsTarget`；`processPath(target)` 给同一执行世界中的 subprocess 使用，`fileUrl(target)` 给 URI 消费者，`contains(parent, child)` 判规范包含关系。`processPathFromHostPath(hostPath)` 默认返回 `undefined`，仅共享主机文件身份的后端可覆盖。`lstat` 不跟随最终符号链接；`stat` 对缺失目标返回 `undefined`。`readText`、`streamText`、`readBytes`、`readByteRange` 和 `listDir` 分别有文本、字节窗口及直接子项语义。

`writeText(target, content, expected?, signal?, sandboxPolicy?)` 与 `editText(target, edit, expected?, signal?, sandboxPolicy?)` 原子修改内容。无 guard 是无条件修改；写入意图可要求不存在或版本匹配，编辑可要求版本匹配。后端必须在临界区同时核对版本与发布变更。`watch` 默认拒绝不支持的后端；若后端实现，须在取消或关闭时释放观察资源。`sandboxMode` 默认 `undefined`，仅反映后端默认约束，不是本次调用最终权限。

## FsTarget

**公开导出**：`FsTarget` 来自 `@deepseek-ai/dsh-fs`。
`targetKey` 是后端所有的不透明身份，调用者不能解析或自行构造；`displayPath` 用于模型或 UI 展示。路径别名若指向同一文件，后端应保持相同目标身份。进程路径和展示路径不必相同。

## FsInfo

**公开导出**：`FsInfo` 来自 `@deepseek-ai/dsh-fs`。
`stat` 返回的元数据有 `version`、`type: 'file' | 'directory' | 'other'` 与可选 `size`；缺失返回 `undefined`。`version` 是不透明的新鲜度令牌，供写入 guard 使用，不能按时间戳自行比较。

## FsError

`FsError` 携带机器可路由 `code`，包含不存在、非文本、过大、拒绝、沙箱拒绝、陈旧版本、未观察及编辑匹配失败等情况。调用者应按 `code` 分类恢复，不能解析错误消息。`readBytes` 必须拒绝超过 `maxBytes` 的完整文件；`readByteRange` 最多传输请求窗口的字节。

## fs/* observation policy

`@deepseek-ai/dsh-fs-observation-policy` 是具体事件政策插件，不实现 `FileSystem` Service。它监听 `fs/observed` 保存按 owner/target 的在场或缺失观察，并占用单槽的 `fs/write-intent` 与 `fs/edit-intent` 决策：写入前者从观察推出 `createIfAbsent` 或 `replaceIfVersion`，编辑要求先前已读且版本匹配。卸载时清空弱引用状态；未挂载它时，裸 provider 的写/编辑仍可无 guard 执行。它是文件工具政策组合，不是另一个文件系统后端；直接调用 `ctx.fs` 的插件仍要显式传 guard 才能获得相应保护。

## 装载与验证

一个 context 只能有一个 `fs` Service；文件与 subprocess provider 必须指向同一执行世界。先装载具体后端，再装载 `inject = ['fs']` 的消费插件。只读例验证解析、文件类型、取消与卸载；写入后端还须用符号链接、并发版本和失败原子性测试，不能只凭类型编译断言正确。
