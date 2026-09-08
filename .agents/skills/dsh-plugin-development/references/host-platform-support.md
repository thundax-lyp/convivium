# Host 平台、启动环境与支持库

本文固定 `dsh-v0.1.2-rc.1`，覆盖应用周边能力和实现支持。它们不自动成为模型工具；实际应用入口见 [组合配置](composition-config-credentials.md)。

## 条件补读

- 平台进程行为补[运行时资源](runtime-resources.md)；实验入口不能按稳定 Node/默认 profile 推断

## 启动与环境

App boot 拥有 dshHomePath、profile resolution、ordered patches、launch environment 和 Loader 生命周期；cmdlineArgs/appReady/appExit 是 CLI 注入的可选能力，插件不能假定裸 Cordis/SDK tree 总有这些字段。后台启动和 ready completion 分开，退出经 owner 清理，不把 process.exit 放进普通 feature。

`launchEnvironmentOf(ctx)` 返回启动 snapshot，未由 CLI 启动则只有 inherited env。优先级 inherited process > invocation cwd/.env > DSH_HOME/.env；getFrom(name,sources) 过滤允许来源，不重排 trust 顺序。Windows 变量名不区分大小写，POSIX 区分。Web 后选 workspace 不重采样 project env；snapshot 不是子进程安全边界，层值仍会物化到 process.env，spawn 由 subprocess scrub。

`ctx.shellEnv` 每次执行重新 collect：DSH_HOME、DSH_SHELL=1，以及 Agent 的 DSH_SESSION_ID。Contributor 注册稳定名称、完整 DSH_* key 集合、每 key 描述与 resolver；冲突/reserved key、undeclared/non-string 返回应失败。List 只枚举插件贡献，不包括内置变量。DSH_SESSION_JSONL 若可用只是 locate hint，不是存在/新鲜度/授权证明。

## Directory picker

只挂一个 directoryPicker Provider。capability 是 native（pick(signal)→absolute path/null）或 browse（list(path?)、createDirectory(path,name)）；UI 按 kind 选择交互，无能力时隐藏入口。Entry 的 absolute path/hidden 与 root→directory crumbs 由 Host 提供，Client 不手工 join。Browse 错误使用 directory-unreadable/directory-exists/directory-create-failed 与 subject path。

Auto chooser 在 boot 只判一次：loopback bind、无 SSH launch、有可服务显示环境才选 native，Linux 另需 DISPLAY/WAYLAND_DISPLAY 和 PATH 上 zenity/kdialog；不确定选择 browse。它通过 Loader row 一起加载 Host/Client half，卸载一并撤除。固定选择直接挂 native/browse，不同时挂 auto。它不按每个连接重选，SSH tunnel 或远程访问可使 native 判断不合用；browse 无多根/跨盘顶部枚举契约。

## Plugin inventory 与安装身份

pluginInventory/list 是 Remote-only Service，不声明 ctx.pluginInventory。它只读 Loader 非 group rows 的 id/module/effective enablement/root fiber phase；没有 live fiber 是 null，不一定等于失败。Preset 组优先读最新 standing mount，否则读文件，不通过读取隐式 mount；无法计算 disabled 表达式保留 conditional，broken 保留 reason。

Inventory 没有 enable/disable/add/remove、变更订阅、来源追踪或 durable failure history；缺 agentPresets 字段表示未挂 roster，不等于空 roster。插件管理写入走各自受支持的管理表面。

Anonymous user id 属于 Harness home 与进程，在 .anonymous-user-id 持久 UUID；不可写时本次进程仍有临时值。它不是用户认证或跨 home identity。删除只影响之后 launch；并发首次创建可能短暂不同。Telemetry、feedback 和官方 DeepSeek 请求可使用同一 id；自定义 DeepSeek endpoint 同样收到 header，不能由 telemetry mode 推断 header 消失。

## 支持库选择

| 库/组                                  | 插件应采用的边界                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| brand、values                          | owner 定义 opaque id；lossless JSON、snapshot/freeze 不保存 live handle                                                             |
| atomic-write                           | 原子文件发布 helper；不代替 domain transaction 或跨进程 CAS                                                                         |
| output-retention、deque                | 有界输出/队列结构；完整输出保留由资源 owner 另行提供                                                                                |
| timeout、time                          | deadline/signal 与时间转换共用原语；等待取消不保证 syscall 已撤销                                                                   |
| home-paths、workspace-path             | Harness home 与 workspace 坐标规范化；路径本身不授予权限                                                                            |
| crypto                                 | 专用密码学 helper；不要复制 token/signature 实现或自行设计认证                                                                      |
| native-command、win32-process          | 原生命令/平台进程 owner；平台检查独立于通用单元测试                                                                                 |
| test-support                           | loader-smoke、agent-loop-testkit、client-runtime、llm-mock-server/llm-replay、session-snapshot 用于对应真实边界；不装入用户产品组合 |
| vendor Cordis/Loader/HMR/timer/include | 使用其公开 lifecycle/config/patch 边界；vendored source 不是可以随意 patch 的第三方 API                                             |

这些库是实现支撑，不应各自伪造一个模型可见功能。发布入口/peer dependency/Host-Client 编译按 [包规范](package-authoring.md)，实际 gate 按 [验证](testing-docs.md)。

## 私有实验与未发布入口

Agent Teams 私有实验能力见 [Agent Teams](agent-subagent-workflow.md#实验性-agent-teams)；Python CodeRuntime 私有，不能作为默认可安装 Provider。Inspector 提供实验诊断，webworker-packer/runtime 是实验 Browser worker 打包/执行通道，不等于稳定 Node CLI profile 或安全 sandbox。其 private manifest 与显式 experimental composition 是使用前提，不把 src/worker/client export 的存在宣传成公开发行承诺。

## Native 与实验平台的明确边界

Native landlock-run entry 提供 launcherPath/probe/grantArgs，probe 为 full/partial/unusable；平台 binary 包只有 linux-x64/linux-arm64，无 install-time build fallback。Exit 125 本身也可由 child 返回，需要 fatal diagnostic 联合归因。它约束被 exec 的进程及后代，不约束调用 Host；macOS/Windows 使用各自 Sandbox backend。

实验 Browser worker runtime 用 packer 生成的 lowered base image 与有序 overlays 启动；overlay 只改 home/workspace，不改模块/config/base manifest。Page chooser 与 connectWorkerHost 是两个阶段，独立 connector 可使用空 overlays。Node shim 的 dns/vm/net/sqlite/worker_threads 不支持时明确 throw；VFS 无 symlink/外部 writer，session log 是 plaintext。Shell 在独立 Web Worker 执行，支持受限 parser/coreutils，不是 Bash（无 loop/function/git/network tools），VFS grant 的 full 不等于 kernel Landlock。Base image 无法通过运行时编译补救未 lowered 输入。

实验 Inspector 提供 Host/Client Console、只读 Client Sources、Host debugger、fetch capture 和 Cordis snapshot query；CDP 状态在 Worker，live Cordis 先投影再跨边界。Client breakpoint/step 不支持，pause/resume 只管 Host。Endpoint loopback，Browser ingest 使用认证/允许 origins；capture 只覆盖启用后的 global fetch，不覆盖已保留函数/直接 Undici。Body tee 可超出 retained-prefix 对总内存的直觉估计；Worker 崩溃无自动 restart。

实验 Python CodeRuntime 需要 CPython >=3.10，fresh subprocess/fd3 JSONL 控制协议，program stdout/stderr 分离；done 同时有 error/value 时 error 优先。Host parse frame 与 outstanding calls/reply backlog 有上限，但 binding 值没有 seam byte cap，逃逸 process group 的后代不保证被 reap。Run 无持久 kernel、无 streaming result，也没有 shipped profile 默认启用。

## 验证

覆盖环境来源/Windows case、shellEnv 冲突与卸载、auto chooser 分支、native cancel/browse error、inventory conditional/null/broken、home id 生命周期；平台/云端行为报告实际运行环境，不拿 macOS typecheck 代替。
