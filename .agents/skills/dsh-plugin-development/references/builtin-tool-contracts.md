# 内置工具的组合与行为契约

本 reference 固定 `dsh-v0.1.2-rc.1`，帮助替换、配置和测试已有工具。名称出现在源码不等于当前 preset 暴露；最终 schema 由 [Tools](tools.md) 的注册、restriction、mode 与 scope 决定。这里记录选择和边界，不复制生成 schema catalog。Subagent 与 Workflow 的 toolName 可配置；MCP 根据远端 discovery 动态构造名字，不存在固定的远端工具全集。

## 能力与 owner

| 模型入口                                                                                                                | 主要契约与 reference                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| read、read_image、write、edit                                                                                           | 文件/图像能力、opaque target、观察和 guarded mutation：[文件策略](filesystem-policy.md)与[资源](runtime-resources.md)       |
| glob、grep、str_replace_editor                                                                                          | 本页的搜索与兼容编辑规则；不将不同工具的参数互换                                                                            |
| bash、pwsh                                                                                                              | One-shot shell 或同名 persistent 替代；同一作用域不能一起占同名工具                                                         |
| terminal_open、terminal_send、terminal_read、terminal_signal、terminal_close、terminal_list                             | Exact Agent 的持久 PTY，单 active send 与有界 scrollback：[资源](runtime-resources.md)                                      |
| job_output、job_list、job_kill                                                                                          | 发布后的工作收集与取消，wait 不等于完成：[Jobs](jobs-background-work.md)                                                    |
| run_code                                                                                                                | 只有 PTC/both 模式暴露的保留入口，嵌套工具仍过 policy：[Tools](tools.md)                                                    |
| skill                                                                                                                   | Discovery 与正文加载分开、加载前后 invocation policy：[Skill Provider](skill-providers.md)                                  |
| lsp                                                                                                                     | 四种 closed operation、one-based tool cursor 转 UTF-16：[LSP](runtime-resources.md#lsp-坐标与注册)                          |
| web_search、web_fetch                                                                                                   | 请求/结果/网络边界与独立 Provider 选择：[Web](web-capabilities.md)                                                          |
| ask_user_question、exit_plan_mode                                                                                       | 普通人类选择与 pending Plan exit：[交互](human-interaction.md)、[规划](planning-scheduling.md)                              |
| create_goal/get_goal/update_goal、todo_write                                                                            | Revision/round 与任务列表各自 owner：[规划](planning-scheduling.md)                                                         |
| schedule_create、schedule_list、schedule_delete                                                                         | 显式时间、live-only 和 durable dispatch：[Schedule](planning-scheduling.md)                                                 |
| subagent、list_subagent_models                                                                                          | 能力 flags、模型 allowlist 和 One-shot result：[Subagent](agent-subagent-workflow.md)                                       |
| list_agents、send_message、interrupt_agent                                                                              | Continuable 邻接授权、acceptance 与 turn interruption；实验 Teams 有自己的同名实现，不可混装假定同义                        |
| session_search、session_trace、session_event_read、session_event_search、session_event_trace                            | 查询/过滤/trace/FTS 与调用者权限：[Session Query](session-query-index.md)                                                   |
| cordis_define、cordis_run、cordis_stop、cordis_undefine、cordis_inspect_list、cordis_inspect_query、cordis_inspect_self | Dynamic package 与精确 run、批准和半边失败：[动态 Cordis](dynamic-cordis.md)                                                |
| workflow、ralph                                                                                                         | Script orchestration 与固定 fresh-agent loop，见下文与 [Workflow](agent-subagent-workflow.md#workflow-接缝)                 |
| spawn_teammate、followup_task、wait_agent、team_task_create、team_task_get、team_task_list、team_task_update            | 私有实验 Teams roster/mailbox/DAG，不是普通 Subagent 默认能力：[Agent Teams](agent-subagent-workflow.md#实验性-agent-teams) |

## 搜索与兼容编辑

Glob(pattern,path?) 搜索 basename/路径 glob，包括 hidden/ignored、排除 VCS metadata。Grep(pattern,path?,include?) 使用 rg regex，include 只允许一个 positive glob，拒绝 comma-list/negation。sampleOverCapGlobResults 必填：true 按顶层目录采样超限页，false 取 mtime 排序头部；完整格式化 spill 成功时可另取全量。

默认 globMaxResults 100、grepMaxMatches 250、grepMaxLineBytes 2000、rawOutputMaxBytes 20000000、timeoutMs 30000、graceMs 3000、stderrMaxBytes/searchMetaMaxBytes 65536。Exit 1 是成功空结果；raw 超限失败，不解析半份 JSON。返回 SEARCH_INVALID_PATTERN/FAILED/RAW_OUTPUT_OVERFLOW/ABORTED 的完整前缀 code；无 offset pagination/case-mode/任意 output mode。

Node 使用 pinned packaged ripgrep；Python runtime 带 target-native -rg sidecar，不要求 operator 安装 rg。Search 通过 subprocess，不要求 fs Provider；它没有验证返回 workdir 和 FS 根一定是同一个 workspace，remote filesystem 不能直接假定本地二进制可读。

Str_replace_editor 只接受 absolute path，UTF-8 view/create/str_replace/insert；默认 view prefix 16000 chars。View 为 one-based 行号，insert 使用 zero-based insertion boundary；create 不覆盖，str_replace 必须唯一匹配，没有 replace_all。Unused command fields 可 null，但 new_str:null 拒绝，删除用省略 new_str；view_range:null 表示完整 view。不要把另一编辑工具的字段/缺省直接复制。

## One-shot 与 persistent shell

One-shot 每次从明确 cwd/env 启动，background 在启动前选并由 Jobs 拥有。Persistent bash/pwsh 每 exact Agent 保留一个 PTY 的 cwd/env，但 timeout/cancel/shell exit 会 reset；无 owning Agent 拒绝，同名工具替换必须由 composition 决定。

Persistent bash 默认 backendType shell、timeoutMs 300000、maxOutputChars 16000。Markers 不进入结果；wrapped command exit 与 shell 本身退出分开。有 stdin-wait evidence 才可提早返回部分输出，否则交互子进程等到 timeout 并关闭不确定 shell；交互使用 terminal_send，不把 persistent shell 工具当任意 REPL。输出保留 prefix，被底层 scrollback 丢弃时明确说明，不把 tail 冒充完整 prefix。

## Workflow 与 Ralph

Worker-thread Workflow script 提供 agent/parallel/pipeline/phase/log、JSON meta/args，普通 child failure 的 agent() 返回 null；hook misuse/cap 违例是 fatal。Provider 默认 spawn，maxConcurrentAgents 0 取 CPU parallelism，maxTotalAgents 1000、maxItemsPerCall 4096、syncTimeoutMs/disposeGraceMs 5000；per-run total cap 只可降低。Metadata/parse/provider/cap 预检在 worker 分配前；dispose grace 后 force settle/terminate，并清理已观察到的 child。

Worker/vm 不构成 hostile-code 安全隔离；没有主动注入 Node 全局不等于无法 escape。模型工具的生命周期与 durable display 仍由 Consumer 拥有。

Ralph 仅在直接人类明确要求 Ralph/fresh-agent iterative loop 时使用。输入 objective/maxRounds，provider 必须支持 structured output 且 inheritsParentContext:false。默认 maxRounds 256 为 ceiling，handoff/result cap 各 16384 chars；每轮新 child 只读目标、当前轮次、shared workspace 与上轮结构化 report，不 seed parent/prior conversation。

结果 complete/blocked/budget-limited，report invalid/over-budget 或普通 child failure 终止，不截断伪造合法报告。Complete 是 worker 自述，没有独立 evaluator；只有 round-count aggregate budget，无 token/price/time budget、background job 或 process-resume checkpoint。普通长任务优先 Goal，普通委派用 Subagent，不自动升级为 Ralph。

## 验证

每次变更核对实际 mounted schema、默认值所在 Config、canonical output、error 与 renderer。除 public types 外，还验证同名冲突、mode/restriction、能力缺失、取消/teardown、有限输出以及 Session replay；不要把某个 preset 一次列出全部工具作为稳定默认承诺。
