# Agent Preset、Persona 与上下文插件

本 reference 固定 `dsh-v0.1.2-rc.1`。Profile 选择应用组合，Preset 选择 Agent 组合，Persona 贡献 prompt；三者不能互换。Profile/Loader 见 [组合配置](composition-config-credentials.md)，Scope 继承见 [Scoped registration](scoped-registration.md)。

## Preset roster 与 authoring

`ctx.agentPresets` 从 roots 扫描含 `agent.cordis.yml` 的目录。default 必填；includeShippedRoot/includeUserRoot 默认 true，shipped system root 在最前，配置 roots 在中间，用户根在最后；同 id 先发现者胜出。roots 的 trust 默认 user，第一 user root 是唯一 authoring root。设置 namespace agent-presets 可覆盖 default，改变只作用于之后创建的 Session。

list/resolve 每次读取目录，broken preset 仍列出 health reason；检查证明 YAML/命名 row/可解析模块位置，不等于真正 import/apply 成功。Mount 才验证实际 composition，失败或 inactive required dependency 必须拒绝并回滚创建，而非发布半个 Agent。

创建是从现有 preset 复制整个目录，不接受任意 composition 文本；id 匹配 `[a-z0-9][a-z0-9-]*`、禁止覆盖。Remove 只允许第一 user root 中的目录；system 或其他可发现 root 不可删除。副本不会随 shipped preset 升级，删除 preset 不停止正在使用旧 generation 的 Agent。

## Standing composition 与切换

同一 preset generation 共享 standing mount，Agent 以自己的 scope 加入，state 仍按 exact Agent 隔离；child 加入父 Agent 同一 generation。不是每个 Session 重复安装整棵插件，也不把所有 session state 存在共享闭包。

只有未产生内容的 Session 能切换 preset；切换 durable 记录后 rebind scope，并发出 tools/change，即使 registry entry 本身没增删。已产生消息/tool call 后拒绝切换，避免历史使用的工具消失。Resume/fork 使用记录的 preset；不能每次读取当前 default 重解释旧 Session。

Generation stamp 只看 composition 文件，旁边 skill/assets 改动不能推断 standing mount 已刷新；旧 generation 不按 join count 回收，直到进程结束。频繁编辑并创建可累积 watcher/服务，不能把 generation 视作零成本缓存。

## Persona

Persona 在 scoped composition 注册 deployment:persona；global slot 已被 systemPrompt 拥有，不能在全局再挂同名行。text 必填、可空；空内容 shadow 全局 persona 后在 render 消失。模板 `{{…}}` 使用已注册变量严格解析。

complete 默认 false，true 使它在 cooperative assembly 后成为 sole system section；不代表其他工具或服务关闭。includeRuntimeContext 默认 true，false 时不求值该 scope 的任何 context provider，并丢弃 listener 追加的 contexts；这是全体抑制，不是按 Provider 过滤，也不撤销 Sandbox/Approval 执行限制。

## Workspace instructions

agent-instructions 经 ctx.fs 读取 `$DSH_HOME/AGENTS.md` 与 project root→cwd 的目录链。默认 marker 为 .git，候选 AGENTS.md/CLAUDE.md，local overlay 为 AGENTS.local.md/CLAUDE.local.md；同目录 trim 后相同内容只显示一次。用户全局文件无 local overlay。

maxBytes 必填，Base 给 65536；maxSourceBytes 默认 1048576。预算优先保留更具体文件，先省略完整 broader 文件，必要时截短最具体文件，并在完整渲染预算内说明省略。不是模型摘要。

首请求通过 durable baseline 收到指令链，成功 read/write/edit 才触发更深目录发现/变化/移除；shell cd 不触发，无文件 watcher。Provider 失败或源超预算不应误记永久删除。Resume/compaction 后协调可见 baseline，PTC 产生的更新延后至外层 result/step 后提交。

候选 symlink 会被跟随，可能读取树外内容；消费不可信仓库时由 FS policy/执行隔离控制可读边界。指令文件是工作区指导，不提升为系统、开发者或直接用户指令；不实现 .claude/rules 或 @path imports 的额外语法。

## Time 与 tmux

Time context 是 opt-in；refreshIntervalMs 默认 0，每个 eligible pre-step 追加，正数节流。Open turn 只有一个可信 browser zone 时使用它；缺失/混合时 fallback zone 只格式化显示，模型仍需澄清无时区时间。timeZone 缺省在加载时读取进程 zone；显式 zone 必须有效。Elapsed 无基线为 unavailable、倒拨 clamp 0；这些记录累计到 compaction，不替 Schedule 填 required timezone。

Tmux context 是 opt-in、每 turn 第一步采样，状态未变或节流时不追加。要求 controlling tty 与 pane_tty 匹配，不能只信继承的 TMUX/TMUX_PANE。无 shell/环境或解析失败为 no-op，执行异常警告不破坏 turn。只记录自身 session/window/pane 与布局，不读其他 pane 正文，不实时跟踪 turn 内移动，也不宣称 Windows 可用。

## 验证

覆盖 duplicate root/id、copy/remove 权限、broken/inactive row rollback、shared mount 的 exact state、blank switch 与 durable restore、generation retention、complete/context suppression、instruction 预算/失败/删除/PTC/resume，以及 browser-zone 混合和 tmux tty 误判。
