# DSH Runtime Vertical Slice Evidence

> 历史证据：本文只记录旧代码基线 `7b39065`，不代表当前 HEAD。当前状态以 [Current Implementation Coverage](./CURRENT-IMPLEMENTATION-COVERAGE.md) 为准。

## Scope

记录 Manager planning、顺序发言和 DSH Session 生命周期的历史 profile 验证。

- 日期：2026-08-27
- 代码基线：`7b39065`
- 环境：Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、provider `spawn`

## Validated Contract

- `selectionMode="manager"` 进入 Manager planning；`round_robin` 保持可用，其他未支持模式 fail closed。
- Manager 提交有序 plan；Speaker delivery 串行进行，后续 Speaker 获取前序正式 transcript。
- Manager plan、首个 attempt、领域事件和 outbox 通过一个 Storage Domain command commit 提交。
- DSH followup 校验 exact parent、ownership、capability 和当前 attempt。

## Executed Validation

`pnpm verify:runtime` 与 `pnpm smoke:profile` 在上述基线通过。profile 验证 Captain 创建 Manager meeting、A→C→B 顺序提交、正式 transcript 顺序和 Host 清理。

## Not Covered

- 本文基线不覆盖后续的 MeetingTask、mail、archive、Decision、HTTP、Client、cold recovery 和跨 Meeting isolation 实现。
- 不覆盖真实模型输出质量、并行发言、远程部署、stress 和生产发布验证。

## Closure

本文作为历史证据保留；不得用于证明当前 HEAD 已完成真实 DSH profile 验证。
