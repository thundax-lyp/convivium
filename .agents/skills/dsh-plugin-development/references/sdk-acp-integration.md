# SDK 与 ACP 集成

本 reference 固定到 `dsh-v0.1.2-rc.1`，适用于修改协议 adapter、SDK launcher 或把插件装配进 SDK/ACP 应用。Profile 所有权见 [应用 Profile](composition-config-credentials.md#应用-profile)。

**阅读导航：** SDK 集成依次读[启动](#sdk-启动契约)、[Prompt 与持久化](#prompt结果与持久化)、[Handle 与结果](#sdk-handle-与协议结果)。ACP adapter 再读[ACP 表面](#acp-表面)；只改 ACP 协议时也须核对其涉及的启动和取消契约。最后读[验证](#验证)。

## 条件补读

- 改应用装配读[组合配置](composition-config-credentials.md)；只消费 SDK 不要求先读 Typert 实现

## SDK 启动契约

TypeScript `HarnessClientOptions` 使用 `dshBin`、`profile`、有序 `patches`、`dshHome`、`processCwd`、`env` 和超时配置。旧 command/args/cwd 的任意进程启动接口不可用。默认解析同版本 DSH CLI；初始化握手有界，默认 initializeTimeoutMs 为 10000。不要把旧 demo bin 或任意 argv 入口包装成新 SDK 的支持路径。

`DeepSeekHarnessOptions` 直接扩展启动选项，旧嵌套 `launch` 不可用。高层 `cwd` 是 Session workspace；`processCwd` 是子进程工作目录，两者不能混用。`env` 在 spawn 时读取：传入对象替换整个环境；不传时读取当时父环境。因此调用者必须明确自己的凭证继承策略，不能假设 SDK 已自动 scrub。

`provider`、`model`、`reasoningEffort`、`maxTokens` 属于初始化及 Agent 选项。命名 profile 和 patches 决定可用插件，不能用模型选项补齐缺失的 Provider 或 Service。`sdk-minimal` 是独立最小树，不继承 base 的所有能力。

Python `HarnessConfig` 相应使用 dsh_bin、profile、patches、dsh_home；旧 runtime_bin、bridge_bin、launch_args_override 已移除。initialize_timeout_seconds 默认 30 秒，与 TypeScript 的默认值不同；私有测试注入 _launch_args 不属于公共启动 API。

## Prompt、结果与持久化

SDK 输入 `SdkPromptContentBlock` 在普通持久 ContentBlock 之外允许 inline raster image，使用 canonical base64 与声明 MIME；服务端经 Attachment admission 转成 durable reference。不能直接把上传 bytes 作为任意 Session event，也不能把 Browser prompt、SDK prompt 和 LLM Provider wire 类型互换。

Prompt 回执中的 messageId 只确认输入已交给 live Agent 的 followup 队列，不确认 Session 已落盘，也不保证崩溃后恢复该输入。服务端在 followup 后立即返回，没有等待 Session flush；附件 admission 的 durable reference 不能扩展成整条 prompt 的持久化保证。若业务需要结果，应消费该 SDK 的 run/result 和事件约定；whole-Agent idle、一次 Remote 返回和某条 prompt 完成都不是通用同义词。请求取消、客户端关闭、进程退出和持久化 flush 分别有所属生命周期，测试需要覆盖初始化失败和 transport 断开后的清理。

TypeScript 与 Python SDK 是独立消费者；Host 编译通过不证明 Python launcher、事件投影或单文件打包有效。协议修改检查两端现有 tests/snapshots，真实 Provider 验证与 keyless replay 分开报告。

## SDK Handle 与协议结果

DeepSeekHarness 提供 start/session/run/close 与 AsyncDisposable。Session(id?) 只创建本地 handle，首 prompt 才在 runtime 建立目标；不要把 handle 分配当 durable Session admission。Start memoize handshake，失败后只有 cleanup 证明进程退出才替换新 client 允许重试；cleanup 也失败时 AggregateError 保留两原因，不并排启动另一个孤儿进程。Close 幂等且 terminal。

HarnessClient 提供 initialize/prompt/request 与 notification subscriptions。Prompt 返回 messageId；高层 HarnessSession.run 在发送前订阅 Session tree，等 matching inbox receipt 后收集，再在该 Session idle 时返回 activity interval 的 events/notifications/finalResponse，finally 关闭订阅。此区间可包含并入的其他输入/child 通知，不是只归这一 prompt 的独立事务。Wire malformed 为 SdkProtocolError，request timeout 和 transport closed 使用各自错误，不靠解析最终回答文本。

ACP initialize 只声明目标实现：MCP HTTP、按模型/Attachment 能力决定 image；audio/embeddedContext false；Session close/list/resume。AuthMethods 空且 authenticate 不执行交互登录。Session new/resume 校验 cwd/MCP/组合，setConfigOption 由 adapter 转换；cancel 为通知并取消相关活跃工作。不要根据其他 ACP 实现支持 load、fork 或额外配置字段，就对这个 server 声称支持。

Python runtime 的单文件分发还依赖 native sidecar、目标平台声明与同版协议；TypeScript 主进程测试不替代 wheel/子进程测试，Python SDK 配置与 private experimental Python CodeRuntime 不是同一包。

## ACP 表面

`dsh --profile acp` 提供 automation-oriented ACP adapter；它需要 agents、llm、sessionPersistence 与 sessions。模型发现、Session 加载、MCP 配置、权限模式和取消要通过 ACP adapter 转换，不能把 DSH Host options 原样当 ACP 参数。

同一包既作为外部 ACP server，又可能由 Subagent ACP Provider 消费；两者方向不同。Subagent Provider 不支持统一 agentOptions，不能据 ACP 本身有模型配置能力就宣称支持该字段。外部协议的错误和停止原因必须映射成内部规定的 outcome。

## 验证

运行 launcher/profile/handshake、请求关闭、Session prompt admission、图像输入和协议投影的聚焦测试。发布 launcher 或 export 改动还要 built-artifact smoke；源码测试不能证明同版本 CLI 解析、分发文件或打包后的 Python runtime。
