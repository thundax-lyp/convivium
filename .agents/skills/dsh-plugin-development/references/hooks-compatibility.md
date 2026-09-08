# Claude Code 与 Codex Hook 桥接

本 reference 记录 `dsh-v0.1.2-rc.1` 实现的兼容子集，不声称等价于外部产品的全部协议。原生功能优先使用 [工具 pipeline](tools.md#策略与观察) 和 Agent 事件；有现成 command hook 时才选 bridge。

## 组合与输入

hook-protocol 是共享库，无需单独配置为 Service；选择 hooks-claude-code 或 hooks-codex。configPath 必填，启动时读取一次，relative path 基于进程启动目录；读取/解析失败仅警告并不注册 hooks。不是每 Session 发现配置，也没有分层项目策略或热重载。

只执行 command handler，http/mcp_tool/prompt/agent 等类型跳过并警告。同一事件按 config 顺序串行运行，不推导并行和去重保证。默认 defaultTimeoutMs 为 600000，stderrSummaryMaxChars 为 500；handler 自有 timeout 参与相应方言转换。Claude 支持 pluginRoot/projectDir 替换，执行 cwd 默认当前 Session workspace；Codex 的具体字段按其 config 类型处理。

## 支持点与决策

| Hook               | DSH 路径                      | Claude Code                                          | Codex                             |
| ------------------ | ----------------------------- | ---------------------------------------------------- | --------------------------------- |
| SessionStart       | agent/session-start，detached | JSON additionalContext                               | plain stdout context              |
| UserPromptSubmit   | agent/pre-step                | deny 或 context                                      | deny 或 context                   |
| PreToolUse         | tools/pre-execute             | deny、ask；allow 不预先批准                          | 只接受阻止，不接受 ask/allow 授权 |
| PostToolUse        | tools/post-execute            | block feedback 或 context                            | block feedback 或 context         |
| Stop               | agent/turn-stopping           | deny 触发 steer 继续                                 | 同左                              |
| SubagentStart/Stop | subagent/start/end            | start 仅能 inject live in-process child；stop 只观察 | 未实现                            |

无 matcher、空串或星号匹配该类全部事件；Claude literal alternatives/regex 与 Codex unanchored regex 不混用。无效 regex 不匹配。PromptSubmit/Stop 不使用 matcher；tool hooks 按工具名匹配。Context-only hook 必须先 next 再合并到 downstream decision，不得吞掉后续策略。

Exit 2 阻止，stderr 作为理由；无法启动或其他非零 exit 是被记录的非阻止失败。合并优先级 deny > ask > allow，context 按 hook 顺序累加。Hook execution 异常不应崩溃 turn，但这也意味着 hook 不能替代硬权限 gate。

## 持久事实与生命周期

hook/invoked、hook/result 为 log-only typed event，结果按 turn/point/handlerId 与 invocation 配对；公开 payload 没有 invokedEventSeq 字段，重复执行不能凭空补造该字段。只在具有适当 open-turn 归属的路径记录；detached lifecycle hook 不可凭空创建 turn。

模型可见的是实际接受的 context、工具拒绝/反馈或 Stop steering；原始 hook 日志不自动进入 prompt。transcript_path 只是 persistence locate 的 hint，可能为空、尚不存在或未 flush，不保证是最新纯文本文件。

Detached SessionStart/subagent hooks 跟踪 abort 和 continuation，fiber dispose abort 后 drain。SessionStart 很慢时可能错过第一请求；远端 child 不存在可 inject 的本地 Agent。

## 未实现的协议行为

不执行 updatedInput/updatedToolOutput 对原调用的重写，不把 systemMessage 当已显示内容。continue:false 虽被解析记录，没有 run-level halt。stop_hook_active 固定 false，没有连续阻止次数保护，无条件 Stop deny 可无限迫使继续。

只把上表列入支持集合；不要按外部工具的新事件名推定支持 PermissionRequest、SessionEnd、PreCompact 或其他未注册 hook。Bridge 不是完整配置 discovery、并行 hook engine 或安全策略执行器。

## 验证

覆盖方言 matcher、退出码/JSON 决策、多个 hook precedence、context 委托、无 turn/detached 记录、exact invocation pairing、start 慢于首请求、取消/timeout/dispose 和未支持 handler 的警告。不能用脚本 exit 0 单例证明兼容。
