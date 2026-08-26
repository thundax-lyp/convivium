# DSH Provider T1 调研记录

状态：候选已取证，尚未获得用户 tuple 确认。

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

## Observed Composition Blocker

该 profile 的实际 boot 当前失败，原因不是 provider 缺失：`plugin/src/index.ts` 的 `inject` 导出声明的是 package names（如 `@deepseek-ai/dsh-agent`），而 profile 提供的是 DSH Context service keys。因此 Loader 报 Convivium `pending`，列出全部七个 package-name inject。T1 不跨线修改该启动期实现；在其修正前，不能从该 profile 调用 registry 或创建 live parent。

## Not Yet Proven

- 候选尚未获得用户对 package/name/version/安装来源的确认。
- 未完成真实 parent 上的 `startContinuable`、followup、cold resume、interrupt、`drainContinuableChildren` 与精确 cleanup 验证。
- 真实 boot 被上述 plugin activation blocker 阻止；尚未检查临时 profile 中的模型凭据或发起模型调用。
- 未据此修改 `plugin/package.json` 或 `plugin/pnpm-lock.yaml`；provider 仍由宿主 profile 管理。

## Related Documents

- [RUNBOOK](../30-designs/RUNBOOK-DSH-RUNTIME-VERTICAL-SLICE.md)
- [Architecture](../00-governance/ARCHITECTURE.md)
