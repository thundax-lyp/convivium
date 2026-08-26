# DSH Provider T1 调研记录

状态：候选与 profile capability 已取证，尚未获得用户 tuple 确认。

## Scope

本记录只覆盖 RUNBOOK T1 的 provider 候选定位，不宣称 Convivium 已能创建会议 Session，也不替代后续临时 profile 生命周期探针。

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

已在一次性 `mktemp -d /tmp/convivium-dsh-t1.XXXXXX` 根下创建独立 `DSH_HOME`，未读取或修改用户 profile。profile 使用 DSH CLI 自动初始化的 `web` manifest：

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

## Not Yet Proven

- 候选尚未获得用户对 package/name/version/安装来源的确认。
- 生命周期 probe 和临时资源 cleanup 的完整结果待下一条 T1 evidence 记录。
- 未据此修改 `plugin/package.json` 或 `plugin/pnpm-lock.yaml`；provider 仍由宿主 profile 管理。

## Related Documents

- [RUNBOOK](../30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md)
- [Architecture](../00-governance/ARCHITECTURE.md)
