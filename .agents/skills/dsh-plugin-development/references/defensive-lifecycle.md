# 防御性生命周期

本 reference 适用于 lifecycle、并发、subprocess、socket、后台任务和 teardown 代码。下面规则针对 rc.2 已出现过或险些出现的 bug class。

## 防御性生命周期

- 正交 outcome 分别报告。Timeout、signal 和 exit code 可以同时成立；不要因为 exit code 为零就隐藏 timed-out fact。
- 先规范化 public API 的 outcome，再交给 Consumer。Provider error、aborted finish 与 wrapper/consumer defect 的表示不能让调用方靠 catch 来源猜测。
- 异步状态不等于某个操作的结果。`followup()` 没有逐消息 completion；whole-Agent idle 可能覆盖多个 followup、steering 与 injection。需要等待时明确定义 caller 真正拥有的 interval，并处理根本没有 transition 可等的分支。
- Dispose 必须达到 quiescence。先关闭 listener/notification 入口，再 abort/kill child，最后等待 `done`/exit；仅发出停止请求就返回会留下 orphan 或 late callback。
- Dispatcher 隔离 user callback failure。一个 listener throw/reject 不能阻止后续 listener，也不能推翻已经 authoritative 的提交；在拥有 dispatch loop 的层统一 contain 和记录。
- Spawned command 使用 shared scrubbed parent environment，移除 credential-shaped 与受管字段；只有受信配置可以在 scrub 后显式补入 child environment。临时或 spill 文件使用 private directory、随机名称和 exclusive owner-only create。
- 可能是 symlink 或 Windows junction 的路径先 `lstat`，确认 link-shaped 后只 `unlink`；递归删除只用于已确认的真实目录，不能跟随 link 进入目标。

## 回滚与发布点

构造多个资源时，把尚未发布的资源放进 rollback ledger；任一步失败按反序清理并等待静默。向 registry、Session log 或 caller 发布 identity 之后，不再把对象当作“从未存在”：后续失败通过稳定 result/event 表达，并由已发布对象的 owner dispose。

取消所有权必须随发布点明确转移。外层 signal 只能取消它仍拥有的等待或 foreground operation，不能宣称停止已交给 job、Agent、worker 或 subprocess owner 的工作。

## 必需证据

覆盖 partial construction failure、pre-abort、mid-operation abort、重复/竞争 dispose、late completion、throwing listener、无 transition 分支，以及 teardown 后无 event、timer、process、socket 或未处理 rejection。Subprocess 还覆盖 scrubbed env、安全临时路径、link-shaped cleanup 与 timeout/exit 的正交报告。
