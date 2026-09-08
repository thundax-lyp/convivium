# 文件、图片、Spill 与进程资源

本文覆盖 `dsh-v0.1.2-rc.1` 中插件跨 Host 文件系统、执行环境与进程边界的契约。统一工具结果规则见 [模型工具](tools.md)，通用清理原则见 [防御性生命周期](defensive-lifecycle.md)。

**阅读导航：** 附件：先读[执行环境](#文件与图片的执行环境)，再读[存取契约](#attachmentstore-的存取契约)。输出保留读[Spill](#spill-的可恢复性与保留期)；进程/PTY 读[子进程与终端](#子进程与终端)；语言服务读[LSP](#lsp-坐标与注册)；MCP 连续读[命名作用域](#mcp-命名作用域)与[同步恢复](#mcp-同步恢复与兼容子集)。最后检查[验证](#验证)中命中的分支。

## 条件补读

- 发布后台 handle 读[Jobs](jobs-background-work.md)；实现异步资源 owner 读[防御性生命周期](defensive-lifecycle.md)
- 修改工具 schema/输出读[Tools](tools.md)；MCP 不桥接的协议能力不能自行假定存在

## 文件与图片的执行环境

FileSystem 的 `processPath(target)` 返回该 Provider 执行环境中的路径。`processPathFromHostPath(hostPath)` 只有在两边确实指向同一文件时才给出映射；默认返回 undefined。AttachmentStore 的 `imageHostPath(ref)` 对非 Host-file-backed Provider 同样可以返回 undefined。不能把 Host 路径直接交给远程、隔离或不共享磁盘的工具进程。

`admitEncodedImages`/`admitPromptContent` 校验 canonical base64、MIME、图片数量和批次字节限制，再产生 durable attachment ref。模型请求的图像变体与持久 normalized object 是不同数据；Adapter 的定价和请求尺寸按实际变体计算。Local Attachment 的默认 normalized pixel cap 是 2048×2048，单边上限是 8192，不能继续套用旧版单边 2048 的假设。

`read` 的图片分支先检查选定 route 的 image 能力；不能把不支持图像的 Provider 当成功读取。`requestImageDimensions` 的公共 owner 是 Attachment definition，不能继续从 attachment-local 导入。请求编码字节是压缩目标；质量阶梯都达不到时可以返回最小输出，不把它描述为永远满足的硬上限。

文件观察、版本 guard、原子写入与 symlink 语义见 [文件系统与观察策略](filesystem-policy.md)。路径能映射到进程不代表已有写权限或观察凭据。

## AttachmentStore 的存取契约

`imageLimits` 是部署最终策略；`validateImage` 只验证，`saveImage` 返回已 durable 的 normalized ref，`saveImages` 按输入顺序返回整批 refs。先完成整批格式/数量/字节和逐图解码验证，再开始写入；存储中途失败不返回 partial refs，但已发布的 content-addressed object 可能成为无引用对象，不能宣称有存储事务回滚。

`readImage(ref, signal)` 核对内容与记录的 metadata；`readImageRequest(ref, policy, signal)` 派生 route-sized 变体，其 identity 包含全部转换输入。基础 Provider 未实现投影时返回 `ATTACHMENT_PROJECTION_UNSUPPORTED`。读取尊重取消；`imageHostPath` 只是 trusted Host consumer 的可选定位入口，不授予模型任意文件权限。

当前只接纳 PNG/JPEG/WebP/GIF 栅格图，不支持通用文件、音频、视频附件；当前 production adapter 的输出仍是文本。Session 只持久化 provider-independent refs，不持久化浏览器路径、base64 或 provider URL。未发送草稿留在 Browser；不可变对象可被 fork/resume 共享，没有自动删除或公开 garbage-collection API。缺失/损坏 ref 明确失败，不静默换成别的图。

## Spill 的可恢复性与保留期

SpillRef 是输出 artifact 的定位和取回线索，不是永久存储承诺。`spill-policy` 可限制 Native 模型内容，也可经 `tools/ptc-dispatch-log` 限制 PTC 的持久日志副本；PTC 程序收到的 canonical value 保持不变。展示不能把截断 preview 冒充完整结果；需要完整内容时通过 locator 读取。

LocalSpillStore 的 `cleanupPeriodDays` 默认 30，0 关闭清理。激活后只做一次 best-effort startup sweep，不是定时循环；按 mtime 清理过期文件，保留新文件、symlink 和无关条目，POSIX 下跳过可被其他用户替换的目录。它检查以前的默认临时根和当前根，当前根本身不随 sweep 删除。

Sweep 不阻塞服务可用，但 fiber disposal 等待它静默。恢复或 fork 的 Session 可能仍引用已过期 locator；设计长期保留需求时选择合适 artifact owner，不能只把路径写入 Session 就声称内容永久可恢复。

## 子进程与终端

一般插件使用 subprocess、shell、terminal 等 Service；Windows 进程实现复用 `dsh-win32-process` 的 ABI、process-tree/Job Object 资源 owner，不在 Consumer 里复制原生进程管理。平台专有行为必须在对应平台或明确的模拟测试验证，macOS 聚焦测试不能替代 Windows 运行证据。

Terminal 启动就绪是 backend 协议事实。PowerShell 使用 `stdin_read` 证据和整个启动阶段的绝对 deadline，不靠输出里出现 prompt 字符串判断成功；命令回显也可能包含该字符串。取消、进程退出、startup timeout 和完成状态分别处理，dispose 必须等待已发布进程和 I/O 收束。

Subprocess Provider 的 executable lookup、cwd、process 与所挂载 FileSystem 必须处在同一执行环境。Spawn spec 显式声明 argv、目录、stdio disposition 和限制，argv 不经 shell 解释。先 scrub ambient `DSH_*` 与凭证，再合并 caller 的显式 env；`undefined` 是删除 ambient 值的 tombstone。

Collect reader 使用 whole-stream byte offset，读取不消费，不同 reader 不抢数据；raw pipe 由 caller 拥有。`SubprocessHandle.terminate()` 发起进程树终止，本身不等待退出；POSIX 使用 TERM、宽限期、KILL，Windows 立即强制终止。`waitForExit(signal?)` 返回 true 才表示整棵树已退出，false 只表示等待被取消，不能宣布 cleanup 完成。`done` 在直接进程 close 时 resolve exit facts，但 spawn-level failure 会 reject；它不同于 Jobs Producer 的不拒绝 `done` 契约，也不替代整棵树退出的等待。Deadline/abort 的原因由拥有 signal 的 Consumer 判定；进程退出后 collected output 仍可读。

Shell Consumer 先将可选 request 解析为完整 spec；stdin/env/stdoutMaxBytes 等可信插件输入不应自动暴露为模型 tool 参数。ShellProcess 本身没有 job id，由 tool 的 Jobs adapter 决定是否发布后台 handle。Sandbox runner failure 在 foreground 可作为基础设施异常抛出，后台结果则保留 runnerFailed 事实，不能统称为命令非零退出。

Terminal session 的授权比较 exact owning Agent。每个 live session 同时只接收一个 active send；send 的 wait reason 与 session status 独立，timeout 不等于 shell 已退出。服务拥有发布后的 session 和 owner-scope cleanup，backend/tool reload 不销毁既有 session。PTY 状态与原始字节是进程内资源，持久化的是已有 tool/task result 路径中的模型输入和有界输出，不再建立第二份 PTY event log。

## LSP 坐标与注册

LSP seam 只提供四种语义查询：`goToDefinition`、`findReferences`、`goToImplementation` 和 `hover`，不提供任意 JSON-RPC escape hatch。Seam position/range 使用 zero-based UTF-16；模型 tool 拥有 one-based cursor 的双向转换。Location 相对化使用 Provider 返回的 `resolvedWorkspaceUri`，不对远端或 symlink workspace 套用 Host 路径规则。

Provider id 与全部 lowercase leading-dot extension 必须原子保留，冲突或无效注册不得留下部分发布；dispose 释放全部 reservation。按请求选择 Provider，无匹配返回 `LSP_UNAVAILABLE`；Consumer 用稳定错误码路由，不解析 prose。

## MCP 命名作用域

MCP Client 按注册 scope 保留 serverName；不同 Agent 可使用相同 namespace，同一 Agent 内重复注册和全局 scope 内重复注册仍失败。不要把“跨 Agent 可复用”误写成全局任意重名。Stdio 与 Streamable HTTP 保持各自配置/认证/重连和清理规则；协议返回内容仍经过工具结果与取消路径。

## MCP 同步、恢复与兼容子集

MCP 只桥接 Tools，不发现/执行 Resources 或 Prompts。serverName 为 `[A-Za-z0-9_-]{1,32}`，生成 mcp__server__tool；stdio 配 command/args/env/cwd，streamable-http 配 url/headers。toolCallTimeoutMs 默认 60000；failOnStartupError 默认 false，初始失败警告/无 tools，true 才拒绝激活。

初次同步在 activation 完成前，list change 原子替换；重复 server tool/name conflict 拒绝整批并保留旧集合。Outage 保留最后已知 tools 但调用失败；reconnect 默认 enabled，500ms exponential→30000ms，最多连续 10 次，稳定连接达到上限延迟时间后 reset。耗尽撤回 tools；禁用 reconnect 时保留 stale tools 直到 reload。Close 触发 supervisor，HTTP 单次不可达主要由 transport/request recovery 处理。

Text 按 block 顺序、resource_link 保留 name/URI 文本；PNG/JPEG/WebP/GIF 仅在模型 image 能力与 Attachment admission 成功后 durable。Audio/embedded-resource 明确诊断，不伪装图像。Unsupported structuredContent schema 回退 JsonValue，不声称验证过完整远端 schema；task-required tool 在 call time 拒绝。

Initialize/paginated tools-list 沿用 SDK 请求 deadline，无独立 connection/discovery timeout 配置，慢 cursor 链可拖延 activation/teardown。Caller abort、调用 deadline、sync/reconnect/dispose 各自资源必须收束。

## 验证

覆盖 Host 路径不可映射、图像能力缺失与批量 admission、spill 完整值/日志副本差异、清理过期/安全目录/卸载等待、终端假 prompt、MCP 同 scope 冲突及跨 Agent 独立性。用临时目录、可控 transport 和测试进程，不能拿用户长期 artifact 验证删除。
