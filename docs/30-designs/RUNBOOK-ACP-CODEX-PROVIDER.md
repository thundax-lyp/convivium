# RUNBOOK: ACP Codex — Codex provider 与恢复门禁

## Status, Dependency And Boundary

2026-10-15；Author / Audit；**Executable（实施计划，尚未执行）**。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册不授权提交、安装到人工环境或额外模型用量。

前置：C7 PASS。Scope：协议连接、MCP、技术持久化、provider 与冷恢复。Non-goals 沿总入口，不新增业务决定。

当前断点：本仓库尚无ACP模块；必须自行编写，官方SDK/bridge仅按锁定版本使用。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Traceability

读取 A2 新建的 `docs/20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md` 全部 Fixed Contracts；读取 [DSH Plugin Design](./DSH-PLUGIN-DESIGN.md) 的 Codex provider 装配。数据精确结构、函数签名与新文件唯一位置以这两份正式文档为准，不重新从第三方源码选择方案。模块目录入口仅导出本步已经存在的符号。

### P4：实现 provider 正常调用与持久 checkpoint

前置状态：P3b PASS。
允许修改（9 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/dsh/acp-codex/provider.ts`
- `plugin/src/dsh/acp-codex/compaction.ts`
- `plugin/src/dsh/acp-codex/types.ts`
- `plugin/src/dsh/acp-codex/connection.ts`
- `plugin/src/dsh/acp-codex/prompt.ts`
- `plugin/src/dsh/acp-codex/tool-bridge.ts`
- `plugin/src/dsh/acp-codex/index.ts`
- `plugin/tests/integration/dsh/acp-codex-provider.spec.ts`
- `plugin/tests/fixtures/scripted-acp-agent.mjs`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. createCodexAcpProvider/CodexAcpProvider 实现正式公开port、精确目录/prepareCall/stream、每Session串行、生命周期MCP lease；先写sending再prompt，responded/原生receipt/flush/committed顺序不能反转。
2. 以 SessionPersistence read handle核对receipt；进程内checkpoint只在持久写之后发脱敏事件。默认model/reasoning来自官方configOptions；不虚构usage，不泄露thought/native工具权限。
3. 正常无未决记录时load原acpSessionId并重建lease，hydration不执行工具、不newSession兜底；通过 agentPresets.serviceFor 核对已装配的 CodexCompactionBoundary（不再注册 Service）、实现辅助请求拒绝和关闭子树。
4. 对外只有符合全部门禁的正常路径可用；初始错误路径先统一保守block，无自动重发。P5用故障注入证明各crash分支。

验证：

```bash
pnpm --dir plugin exec vitest run tests/integration/dsh/acp-codex-provider.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：持久屏障前prompt=0；正常同绑定load、真实caller、receipt/finish/关闭成立，非ACP压缩不变；本步实际变更路径 2–10 个且均在清单内。
STOP：用临时stream当持久证据、自动retry或依赖第三方sidecar；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### P5：验证未知阻断和跨进程故障边界

前置状态：P4 PASS。
允许修改（3 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/dsh/acp-codex/provider.ts`
- `plugin/tests/recovery/acp-codex.spec.ts`
- `plugin/tests/fixtures/scripted-acp-agent.mjs`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 在真实store/DSH持久化上注入sending前写失败、发送后kill、responded无receipt、flush后未checkpoint、load失败/配置指纹变化及worker未知。
2. 缺持久证据一律blocked并传播root，原input/delivery不重发；有持久receipt只补commit，不重跑；cleanup不load，停止worker不反向停Reviewer。
3. 逐个反例驱动补齐provider分支；不要为了让测试通过弱化schema、增加跨表事务假设或清空技术记录。

验证：

```bash
pnpm --dir plugin exec vitest run tests/recovery/acp-codex.spec.ts tests/integration/dsh/acp-codex-provider.spec.ts tests/integration/dsh/acp-codex-store.spec.ts tests/integration/dsh/acp-codex-tool-bridge.spec.ts tests/unit/dsh/acp-codex-connection.spec.ts tests/unit/dsh/acp-codex-prompt.spec.ts tests/integration/dsh/acp-codex-compaction.spec.ts
pnpm --dir plugin lint
pnpm --dir plugin typecheck:host
```

PASS：协议/存储/故障集合通过，未知无重发，known receipt不重复执行，进程收敛可证明；本步实际变更路径 2–10 个且均在清单内。
STOP：需推断远端成功、模拟掉持久边界或改新表字段；需改合同先由作者修订；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

## Validation, Handoff And Deletion

本册门禁为各步全部验证与实际文件计数，断言见各 PASS；仅证明确定性组合，真实Codex/会议尚待接线验收。只有前述证据齐全才交接D1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
