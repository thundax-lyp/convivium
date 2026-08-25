---
name: convivium-readiness-review
description: Assess whether a Convivium implementation or PR is genuinely ready for its stated stage by reconciling requirements, interfaces, design, code, tests, CI, package verification, and readiness evidence. Use for delivery/readiness reviews; report gaps without modifying code.
---

# Convivium Readiness Review

评估 Convivium 某个实现阶段、PR 或指定时间范围的 readiness。目标是区分“代码存在”“自动化测试通过”“关键运行时行为已验证”和“可以作为阶段性交付”，不得把工程骨架描述为会议产品已完成。

## Required inputs and evidence

根据用户范围读取最小必要材料：

- `docs/AGENTS.md`、`docs/00-governance/ARCHITECTURE.md`
- 相关 `10-requirements/`、`20-interfaces/`、`30-designs/`
- `docs/40-readiness/` 中相关证据
- `docs/00-governance/PR-RULES.md`、`TODO.md`、`.github/workflows/pr-verify.yml`
- `plugin/package.json`、测试目录、验证脚本、目标 diff 和实际命令输出

按证据强度区分：

- 明确证据：测试/构建命令输出、CI 状态、代码、契约、需求验收记录、readiness 文档。
- 中等证据：PR 描述、commit、文件范围和变更时间。
- 弱证据：命名、文件存在、TODO 数量或“看起来已完成”。

没有实际命令输出时，不得写成“验证通过”；可以写“配置了验证入口”或“未覆盖”。

## Coverage ledger

建立一份闭环表，至少追踪：

| 领域 | 需求/验收点 | 接口/设计依据 | 实现位置 | 自动化验证 | 运行时/人工证据 | 状态 | 风险 |
|---|---|---|---|---|---|---|---|

重点覆盖：

- 插件加载和版本门禁。
- Meeting/Participant/Turn 身份隔离与单一发言权。
- 顺序发言、上下文投影、迟到结果拒绝和权限验证。
- TeamTask/mail 与正式 transcript、decision、completion 的边界。
- SQLite migration、事务、幂等 receipt、event/outbox 顺序和重试。
- 暂停、恢复、冷启动、orphan Session、capability revoke、Activation drain 和归档。
- Host/Client、HTTP/tools、错误语义、package exports 和浏览器 bundle 边界。
- 成功、失败、并发、恢复、压力和权限测试。

## Stage judgment

分别给出：

1. **代码健康**：模块边界、接口稳定性、失败处理、测试质量和安全风险。
2. **交付健康**：范围是否闭合、文档是否同步、CI 是否覆盖、验证证据是否可复现、TODO 是否真实收口。
3. **阶段结论**：`可进入下一阶段`、`有条件进入` 或 `不能进入`。

`plugin` 只有骨架、typecheck、build 或 package contract 通过时，只能说明工程入口可用；不能据此声称会议生命周期、恢复、归档、权限或协议行为已完成。

## Output

```md
## Readiness summary
- 评估范围：
- 阶段结论：
- 结论置信度：高 / 中 / 低

## Evidence overview
- 已确认：
- 未执行或不可复现：
- 证据缺口：

## Coverage gaps and risks
### [P0/P1/P2/P3] 标题
- 依据：
- 当前证据：
- 缺口或触发条件：
- 实际影响：
- 建议的最小收口动作：

## Code health
## Delivery health
## Next route
- 立即收口：
- 短期：
- 后续阶段：
```

事实、推断和缺失信息必须分开。不要修改代码、TODO、readiness 文档或 PR；用户另行授权时才执行这些动作。
