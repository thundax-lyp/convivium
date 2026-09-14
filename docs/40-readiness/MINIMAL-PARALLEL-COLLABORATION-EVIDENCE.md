# 最小并行协作验证证据

## Scope

2026-09-15 在分支 `codex/project-goal-tests-and-direction` 验证首次发布的最小并行贡献流程。源码边界为基线 `6a9501c` 加本文件所在 T10 提交；环境为 macOS、Node.js `>=22.19.0`、pnpm、真实 `@deepseek-ai/dsh@0.1.2-rc.1` Web Host、临时 SQLite profile 与 `spawn` provider。

## Validated Contract

- Manager 在真实 DSH Session 中为 A、B 分派两个独立 Contribution，三位 Participant 使用不同 Session。
- 私有 draft 在精确版本批准前不进入 Transcript；正式消息只保留 Contribution 来源字段。
- B 的材料版本可由获授权身份读取，作者不能自审；Reviewer 实际读取 `amber-47` 后记录 `supports`。
- submit/approve 重放不重复发布，同 requestId 改内容冲突，旧 revision/generation 拒绝。
- pause/resume 推进 generation；非 Browser 流程可归档并按白名单回读材料。
- Browser 展示与工具状态一致，刷新不改变状态，UI 可用既有表单结束并归档会议。

## Executed Validation

从仓库根目录执行：

```sh
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile --json
```

确定性运行退出码为 0，结果 `scenario=parallel-contribution`、`status=archived`、`meetingVersion=16`，八项固定 assertions 全部存在，`restore=PASS`。结果包含三个不同 Participant Session、两个不同 Contribution、两条不同正式消息，以及可回读的 `evidenceKey`；归档材料字节仍为 `amber-47`。

Browser 运行在同类隔离 Host 上停于 `status=running`、`meetingVersion=13`。实际 UI 显示：

- Transcript 恰有 B、A 两条正式消息，未出现 A 的退回稿。
- B 的 `Draft revision` 为 1，材料为 `amber-47`，claim 为 `material contains amber-47`，Verification 为 `supports: amber-47 matched`，Method 为 `literal comparison`。
- Reload 后上述内容不变。
- 选择 `partial`、填写 `browser contribution check` 并结束后，状态为 `archived`、版本为 16；归档后相同材料及核验仍可见。

向原 PTY 发送 Ctrl-C 后输出 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`；精确临时根检查返回不存在。认证 URL、token、cookie 和本地凭据未写入本证据。

本任务还执行 `pnpm --dir plugin format`、`pnpm --dir plugin lint` 和 `pnpm --dir plugin build`，结果记录在同一 T10 提交的执行日志中。

## Not Covered

- 本确定性场景不调用远程 LLM，不证明模型讨论质量或 Provider 推理链路；固定真实模型讨论由后续独立场景验证。
- 不证明生产部署、多用户、跨 Host writer、物理数据库迁移、自动抓取或用户价值。
- Browser 只覆盖本节列出的 Contributions、Transcript、刷新、end 和归档回读，不外推到未操作控件。

## Closure

T10 的 V15 真实 Loader、DSH Session、权限、版本、Client 显示、归档与 Restore 已取得对应证据。语义质量及真实模型讨论仍为 Not Covered，由固定模型场景单独收口。
