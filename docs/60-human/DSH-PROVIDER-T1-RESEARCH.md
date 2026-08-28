# DSH Provider T1 调研记录

状态：已取证并于 2026-08-26 获得用户 tuple 确认；长期工程结论以 `ARCHITECTURE.md` 与 runtime readiness 证据为准。

## Scope

本记录覆盖当时 runtime 竖切 T1 的 provider 候选定位及后续临时 profile 生命周期探针，不作为当前产品就绪声明。

## Candidate

```text
Provider package: @deepseek-ai/dsh-subagent-spawn-in-process
Provider name: spawn
Exact version: 0.1.1-rc.2
Installation source: npm registry tarball
  https://registry.npmjs.org/@deepseek-ai/dsh-subagent-spawn-in-process/-/dsh-subagent-spawn-in-process-0.1.1-rc.2.tgz
```

## Evidence

- 当前锁定依赖：`plugin/node_modules/@deepseek-ai/dsh-subagent/package.json` 为 `0.1.1-rc.2`。
- 当前实现：`plugin/node_modules/@deepseek-ai/dsh-subagent/lib/index.js` 的 `prepareContinuable(name, request)` 先按 provider name 查询 registry；`provider.prepareContinuable === undefined` 时抛出 `UNSUPPORTED_CAPABILITY`。因此方法存在是 continuable capability，而非仅有 `ctx.subagents` service。
- 官方 [Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md) 将 `dsh-subagent-spawn-in-process` 列为 provider，并说明 `prepareContinuable` 的存在即为 continuable capability。
- 官方 [headless example composition](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/headless-agent/cordis.yml) 以 `providerName: spawn` 注册该 package，并以 `provider: spawn`、`backgroundMode: continuable` 组合 model-facing consumer。
- `pnpm view @deepseek-ai/dsh-subagent-spawn-in-process@0.1.1-rc.2 version dist.tarball peerDependencies dependencies --json` 返回上述 exact version 和官方 registry tarball；peer 依赖包含同一 rc.2 的 `dsh-subagent` 与 `dsh-subagent-in-process-driver`。

## Temporary Profile Composition

已在一次性 `mktemp -d` 创建的临时根下建立独立 `DSH_HOME`，未读取或修改用户 profile。profile 使用 DSH CLI 自动初始化的 `web` manifest：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
    }
  }
}
```

临时 profile 以实际 `pnpm pack` 产物安装 `@convivium/dsh-plugin`，不是引用 `src/`。执行：

```sh
DSH_HOME=<temporary-home> dsh --profile web --dump-config
```

输出同时包含：

- `@deepseek-ai/dsh-subagent-spawn-in-process`，`providerName: spawn`；
- `@deepseek-ai/dsh-workspace` 与 `@deepseek-ai/dsh-host-webserver`；
- `@convivium/dsh-plugin`。

临时 workspace 是该 `mktemp` 根，临时 profile 的 session/log root 位于该 `DSH_HOME` 下，Web bundle 默认端口为 `3080`。后续 smoke 必须改用显式可用临时端口，且无论成功或失败均删除精确的 `mktemp` 根。

## Verified Provider Capability

Host inject service-key 问题由 integrated commit `8eca538` 修正后，使用当前 worktree 的 `pnpm pack` 产物重建上述临时 profile。临时观察 bundle 只消费官方 `ctx.subagents`、`ctx.agents`，不注册或替代 provider；它等待 DSH `subagent/provider-added` 事件后才读取 registry，避免 sibling effect 的注册竞态。

执行：

```sh
DSH_HOME=<temporary-home> dsh --profile web --dump-config
DSH_HOME=<temporary-home> CONVIVIUM_T1_OUTPUT=<temporary-result> \
  dsh --profile web --no-open
```

`dump-config` 同时显示 `@convivium/dsh-plugin`、`@convivium/t1-continuable-probe` 和 `@deepseek-ai/dsh-subagent-spawn-in-process`，其配置为 `providerName: spawn`。真实 boot 的结构化结果为：

```json
{
  "providerResolved": "spawn",
  "prepareContinuableType": "function"
}
```

该结果证明实际 registry 在 provider registration 完成后能解析 `spawn`，且公开 provider 对象具备 `prepareContinuable`。没有使用 mock、自制 provider、隐式 provider 或 fallback。

## Verified Continuable Lifecycle

在同一临时 `web` profile 中，观察 bundle 仅调用实际 DSH `ctx.agents` 和 `ctx.subagents`。它创建两个独立 live parent；第一个 parent 只拥有 target child，第二个 parent 只拥有 control child。没有 mock、自制 provider、fallback 或直接 Session 操作。

执行：

```sh
DSH_HOME=<temporary-home> \
CONVIVIUM_T1_OUTPUT=<temporary-result> \
DSH_TELEMETRY_MODE=DISABLED \
DSH_PERMISSION_MODE=workspace-write \
dsh --profile web --no-open
```

命令退出码为 `0`，stderr 为空。结构化结果如下（ID 为该次临时运行产生的 DSH identity）：

```json
{
  "providerResolved": "spawn",
  "prepareContinuableType": "function",
  "targetStart": {
    "childId": "9118640f-6b6d-4342-a11c-3ef52af86d07",
    "messageId": "90110999-d25e-4ce1-a4b3-d2f24600200b"
  },
  "residentFollowupMessageId": "65463d1a-de76-4ef8-ab59-a56be77bb706",
  "targetDrainedBeforeColdResume": true,
  "coldResumeFollowupMessageId": "704c7b63-2d6d-428c-bd25-3ade70e7386a",
  "targetLiveAfterColdResume": true,
  "interruptIssued": true,
  "targetDrainedAfterInterrupt": true,
  "controlPersistedBeforeTargetDrain": true,
  "controlPersistedAfterTargetDrain": true,
  "controlPersistedAfterSecondTargetDrain": true,
  "controlDrained": true,
  "parentDisposed": true,
  "controlParentDisposed": true
}
```

`subagent/start` 为 target child 记录两次 `provider: "spawn", local: true` event：首次创建与 drain 后的 cold resume 各一次。`controlPersisted*` 通过第二个 parent 的 `listChildren()` 在 target 的两次 `drainContinuableChildren()` 前后均找到 control child，证明 target cleanup 未删除不属于该 parent 的 child identity。

### Cleanup

probe 已先 drain target/control child，再 dispose 两个 parent。随后只将本次 `mktemp` 创建的根移入系统废纸篓，并断言该精确路径不存在；未读取、修改或删除用户 DSH profile、workspace、Session 或进程。

## Confirmation Result

- 用户于 2026-08-26 确认 package/name/version/安装来源 tuple。
- provider 继续由宿主 profile 管理；未据此修改 `plugin/package.json` 或 `plugin/pnpm-lock.yaml`。

## Related Documents

- [Architecture](../00-governance/ARCHITECTURE.md)
- [Runtime readiness evidence](../40-readiness/DSH-RUNTIME-VERTICAL-SLICE-EVIDENCE.md)
