# DSH Runtime Vertical Slice Evidence

## Scope

本证据记录 Manager planning 与 Turn 生命周期闭环的实现覆盖和验证事实，不声明 Convivium 已成为完整会议产品。

记录日期：2026-08-27

代码基线：`7b39065`

环境：Node `v22.23.2`、pnpm `10.7.0`、DSH `0.1.1-rc.2`、`@deepseek-ai/dsh-subagent-spawn-in-process@0.1.1-rc.2`、provider `spawn`。

真实 profile 使用临时 DSH home、workspace、端口和打包后的 `@convivium/dsh-plugin`；验证完成后由 smoke 脚本停止 host 并清理本次创建的精确临时目录。

## Validated Contract

- `selectionMode = "manager"` 创建后先进入 Manager planning；省略值和 `round_robin` 路径保持原有行为，`rule_based` / `hybrid` fail closed。
- Manager 使用 meeting-owned continuable Session，通过 `convivium_submit_manager_plan` 提交受约束的有序 `steps`；计划顺序不由 Runtime 重排。
- Manager plan commit、首个 SpeakerAttempt、领域事件和 dispatch outbox 在同一 SQLite command transaction 内提交。
- Speaker delivery 逐步进行；只有前一个 Speaker 正式提交后才创建并 dispatch 下一个 SpeakerAttempt。
- Turn 最后一个 Speaker 提交后由确定性 `judgeTurnCompletion()` 选择 `completed`、`partial` 或下一次 Manager planning；不读取自然语言总结或未提交 DSH 输出。
- DSH followup 通过 exact parent、ownership、capability 和接受前后授权检查；Convivium 领域事件不写入 DSH-owned Session Event。
- Meeting tools 只在所需 DSH continuable provider 能力存在时注册；Client 不直接访问 Session、SQLite 或任意文件系统。

## Executed Validation

### `pnpm verify:runtime`

在 commit `7b39065` 执行并通过。该入口按顺序执行：

- `format:check`：Pass。
- `lint`：Pass。
- Host/Client `typecheck`：Pass。
- `pnpm test`：29 个测试文件、158 个测试 Pass。
- `build`：Pass；生成 Host、Client bundle 和声明文件。tsdown 的 `define` warning 不影响产物或退出码。
- `verify:environment`：Pass；声明的 DSH packages 全部可解析。
- `verify:contract`：Pass。
- `verify:package`：Pass；发布 allowlist、入口和 bundle contract 通过。
- `smoke:profile`：Pass，见下节。

### `pnpm smoke:profile`

真实 `web` profile 和 `spawn` provider smoke Pass，验证路径为：

1. Captain 创建 `selectionMode = "manager"` Meeting。
2. Manager plan 提交非 `round_robin` 顺序 `participant-a → participant-c → participant-b`。
3. Runtime 依次提交 A、C、B，正式 transcript 的 `seq` 为 `1`、`2`、`3`。
4. Turn 收口后 Meeting 保持 `running`，不暴露 `currentTurn`，表示已创建下一次 Manager planning。
5. host 正常停止，临时资源清理完成。

smoke probe 通过 DSH 公开 `agent/created`、Agent status 和 inbox 事件捕获真实 Participant Agent，并在其 live residency 内调用 `convivium_submit_turn`；没有构造伪 Agent、绕过 caller 校验或写入 DSH 私有事件。

## Not Covered

- `completed/objective_satisfied`、`partial` 和 hard-limit 优先级由领域 fixture 覆盖；真实 smoke 不伪造业务完成声明。
- 真实模型输出质量、主持策略、总结策略和自然语言完成判断。
- Speaker timeout 自动推进、failure counter、Participant unavailable 策略和 interrupt 策略。
- live parent 自动续投、Captain parent rebind、完整持久数据 restart/cold recovery 的端到端 profile 证据。
- 真实 DSH late submit、duplicate request、interrupt、drain 和 capability revoke 的端到端证据；对应边界由单元、契约、integration 或 recovery 测试覆盖到已声明范围。
- `round_robin` 重构、并行 Turn、并行 Speaker delivery、多 Manager、TeamTask、HandRaise、mail、proposal/position/decision/risk claims、archive、HTTP route、Client UI 和生产部署。
- 跨 Meeting 的真实 profile Session label 隔离 smoke、stress/长期资源泄漏、远端 PR checks 和发布环境验证。

## Closure

Manager planning 与逐 Speaker Turn 闭环已通过离线验证、集成/recovery 测试和真实 DSH profile smoke。`TODO.md` 中本任务已关闭；本 readiness 文档保留已验证范围和 Not Covered。临时执行手册中的长期结论已迁移至代码、测试和本证据文档，临时执行手册已删除。
