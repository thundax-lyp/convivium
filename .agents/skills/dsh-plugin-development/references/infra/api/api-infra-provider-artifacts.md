# Spill 与附件存储后端

## 对象关系与使用场景

`SpillStore` 保存过长的工具文本并返回检索指引；`AttachmentStore` 保存会话引用的不可变图片和文件。两者都是 Host Service，具体持久化后端分别由 `dsh-spill-local` 与 `dsh-attachment-local` 提供。前者不决定截断策略，后者的引用必须先持久化再写入 Session 事件。任务见 [存储 HOW-TO](../how-to/how-to-infra-provider-artifacts.md#从插件调用-spill-与附件存储)。

## SpillStore

**公开导出**：`SpillStore` 来自 `@deepseek-ai/dsh-spill`。
`@deepseek-ai/dsh-spill` 的抽象 Service 注册为 `ctx.spillStore`，仅要求 `saveText(input: SaveTextSpill): Promise<SpillRef>`。实现必须完整、逐字节保存 `content`，按 `owner.sessionId` 隔离到私有位置，使用由 `suggestedName` 派生但绝不直接等于它的无冲突名称；真正存储失败必须拒绝。`dsh-output-retention` 管保留，`dsh-spill-policy` 管工具结果替换；此 Service 没有通用读取或搜索方法。

## SaveTextSpill

**公开导出**：`SaveTextSpill` 来自 `@deepseek-ai/dsh-spill`。
输入有 `owner: { sessionId }`、`source`、`suggestedName` 与完整 UTF-8 `content`。`source` 分 `tool`（`toolName`、`callId`、`label`）和 `session-reference`（源 `sessionId`、`label`）；来源说明不是访问控制。调用者不得把建议名称当作后端路径。

## SpillRef

**公开导出**：`SpillRef` 来自 `@deepseek-ai/dsh-spill`。
结果包含不透明 `locator`、精确字节数 `bytes` 与模型可见 `retrievalHint`。后端负责给出与自身介质匹配的检索方法；消费方只呈现 locator，不解析其格式。fork 后已有 locator 留在原持有来源，新的 spill 使用子 Session id。

## AttachmentStore

**公开导出**：`AttachmentStore` 来自 `@deepseek-ai/dsh-attachment`。
`@deepseek-ai/dsh-attachment` 的抽象 Service 注册为 `ctx.attachments`，`imageLimits` 是部署解析的图片策略。图片路径：`validateImage` 完整解码验证，`saveImage` 持久化单张，`saveImages` 先验证全批再按顺序提交，`admitPromptContent` 把图片改为持久引用后交给 Session。`readImage` 验证读取字节与引用一致，`readImageRequest` 可生成模型请求尺寸；`imageHostPath` 默认不可映射。

文件路径：`admitEncodedFile` 解码并提交规范 base64；`saveFile`、`saveFileStream`、`readFileStream` 负责逐字节不可变存储和有界流读取。抽象类默认拒绝不支持的文件或投影能力，后端须显式覆盖。`fileHostPath` 默认 `undefined`。附件结果要先持久化，再把引用写入会话日志；不能在日志中仅保存临时上传路径。失败按 `AttachmentError.code` 分类。

## 装载与验证

每种 Service 在 context 中只挂一个后端。验证 spill 精确内容、长度、私有性与失败拒绝；附件验证同一输入引用、损坏检测、批处理顺序、取消、流背压与重启后读取。静态 API 和示例只证明调用形状；耐久性、文件权限和完整性需要真实存储后端测试。
