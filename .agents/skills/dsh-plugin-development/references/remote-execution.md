# E2B 远程执行环境

本 reference 固定 `dsh-v0.1.2-rc.1` 的 opt-in E2B Provider family。它替换 FileSystem/Subprocess 的执行环境，不把整个 Harness 搬到远端，也不是 ctx.sandbox 的 OS file-policy Provider。

## 三包组合与 owner

组合 e2b、fs-e2b、subprocess-e2b，三者共享 ctx.e2b 的一个 remote Linux sandbox。E2BRuntime 在构造时开始连接，getSandbox 等 readiness 并检查 disposal；创建 cwd 后才向 adapters 返回。apiKey 缺省读 E2B_API_KEY，cwd 默认 /home/user/workspace 且必须 POSIX absolute，timeoutMs 默认 300000，是 sandbox lifetime 而非单命令 timeout。

App disposal 或 lifetime 到期删除 sandbox，SandboxNotFound 表示已结束；没有 pause/retain、reconnect、volumes/snapshots 或自动 host workspace 同步。Host 保留 Cordis/Agent/Session log/LLM/SDK-side buffers。保存 remote path 到 log 不使远端内容永久存在。

## Files 与 processes 同一坐标

fs-e2b 没有独立 Config；解析、metadata、文本/bytes/stream、目录与 guarded write/edit 使用同一 remote cwd。读取上限和原子写入规则遵循 [FileSystem](filesystem-policy.md)，但 remote metadata 版本只能检测 E2B 表示出来的变化。createIfAbsent 保留 publication 竞争中的外部创建；replacement 的 mutation queue 是 host-process-local，不能保证其他连接或 shell 同时写入时无竞争。

Canonical target 仍按 path reopen，不是 identity-fenced fd；literal edit/diff 可能把整文件读到 Host。默认 Linux image 的 GNU 工具、同文件系统 rename 和元数据能力是实现前提；不能推导任意 template/Windows 支持。cwd 只是解析约定，不是路径 containment。

subprocess-e2b 的 pollMs 默认 20。普通 argv/stdio/terminal 由相同 Subprocess seam 提供，remote setup 期间 pid 为 -1；要求同步正 PID 的 ACP child Consumer 不可直接使用。环境以 sandbox-native defaults 为基础，只把 explicit overrides 带入，不复制 Host env；初始探测不能预先抹掉未知 sandbox default secret，因此不支持预置含 secret 的 sandbox defaults。

## 输出、终止与限制

Adapter 可提供 bounded byte tails 和 remote spill，但 E2B SDK 仍把完整 base64 transport stdout/stderr 留在 Host 内存，不能宣称达到 LocalSubprocess 的总内存界限。Private state/spill 留在 .dsh-e2b 到 sandbox 删除，没有独立 sweep。

TERM/grace/KILL 与 terminal signalling 使用 remote PID/PGID；没有 reuse-fenced identity。相同 UID 的其他进程可访问控制资源，0700/0600 不构成同 UID 隔离。E2B 没有独立 signal exit fact，不通过 128+N 反推信号；只在没有 wrapper direct exit 时归因 adapter 自己请求的 signal。

Terminal 不具备准确 fd0 syscall wait evidence，通用 backend 退回 controlled markers/bounded silence。网络策略由 sandbox image/部署决定，这一 family 不额外配置网络隔离。连接丢失与 remote process escaped session 的恢复没有完整 fidelity 承诺。

## 验证

使用 fake SDK 证明创建/失败回滚、readiness-dispose 竞态、同一远端 cwd、env 边界、pid 未就绪、output cap 与真实 SDK retention 区别、sandbox 消失、cancel/tree cleanup。真实 E2B 调用另需授权和凭证，本 reference 更新不等于执行过云端验证。
