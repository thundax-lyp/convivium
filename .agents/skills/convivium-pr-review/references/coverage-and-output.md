# Convivium PR Review Coverage and Output

## Changed-file ledger

以 `collect-review-context.mjs context` 返回的 committed changed-file 集为唯一计数基线。rename 计一条。每个文件必须有一个终态：

- `reviewed`：已结合 diff、上下文、调用点和测试完成审查。
- `mechanical`：读完 diff 后确认是无独立行为的机械变化，并记录依据。
- `not-applicable`：读完 diff 后确认不影响已识别系统承诺，并记录原因。
- `deferred`：缺少上下文或尚未完成审查，并记录具体缺口。

`mechanical` 和 `not-applicable` 不是免审标签。测试、配置、迁移、脚本和文档同样必须计入。模块分类来自脚本，主要包括：

- `repo-governance`
- `docs`
- `plugin:domain`
- `plugin:runtime`
- `plugin:repository`
- `plugin:dsh`
- `plugin:transport`
- `plugin:projection`
- `plugin:client`
- `plugin:tests`
- `plugin:scripts`
- `other`

每个模块的终态数量之和必须等于该模块 total；所有模块 total 必须等于 changed-file 总数。

## Contract-surface ledger

每条 surface 记录：

- 对应系统承诺；
- 主风险模型或专项检查；
- changed-file anchor；
- producer/adapter 范围；
- 首个真实 validator；
- 最终 consumer/sink 或明确终点；
- fallback、历史数据、持久化、迁移、等价路径、测试和文档中的负空间；
- `reviewed`、`not-applicable` 或 `deferred` 及理由。

必须满足：每条系统承诺、每个主风险模型和每个实际触发的强制专项检查至少映射一个 surface。找不到 validator、consumer/sink 或明确终点时必须标记 `deferred`。

任何缺失条目、数量不守恒、缺失映射或 deferred 都表示 coverage incomplete。只有两个 ledger 闭合且无 deferred 时，才能输出 `No actionable findings.`。

## Findings format

Findings 放在前面，按优先级排序：

```md
### [P0/P1/P2/P3] 简短、可执行的标题

* 文件：`plugin/...`
* 行号：最小 changed range
* 问题：具体错误及根因。
* 触发：能够从代码证明的场景或调用路径。
* 影响：用户、数据、权限、性能或维护后果。
* 建议：具体修复方向。
* 证据：需求、接口、设计、测试或命令。
```

## Final output

```md
## Coverage ledger

### Changed files

* `<module>` — total: N; reviewed: N; mechanical: N; not-applicable: N; deferred: N
* Total — diff files: N; ledger files: N

### Contract surfaces

* `reviewed` — <commitment / risk / check> — anchor `<file>`; validator `<location>`; consumer/sink `<location>`
* `deferred` — <mapping> — <missing evidence or endpoint>

### Validation gaps

* <None, or every deferred/missing item and material unrun validation.>

## Review summary

* 本次审查范围：
* 我理解的 PR 目标：
* 系统承诺：
* 主风险模型：
* Coverage 状态：complete / incomplete
* Validation 状态：verified / partial / not-run / blocked
* 是否建议合并：是 / 修复后合并 / 补齐审查后再决定 / 不建议合并
* P0 / P1 / P2 / P3 数量：
* 最高风险领域：
* 最主要风险：
```

Coverage complete 且无 finding 时先输出：`No actionable findings.`。没有 confirmed finding 但 coverage incomplete 时先输出：`No confirmed findings, but review coverage is incomplete.`。
