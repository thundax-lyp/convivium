# RUNBOOK Rules

## Purpose

本文档定义 Convivium 临时 RUNBOOK 的适用条件、写作标准、执行颗粒度、验证门禁和删除规则。RUNBOOK 的目标执行者是不能承担产品、架构或接口判断的低级 LLM；作者必须在交付 RUNBOOK 前完成必要判断，使执行者只需按步骤修改、验证或停止。

本文档是 RUNBOOK 治理的唯一真相源。`.agents/skills/convivium-runbook/` 负责应用和检查这些规则，可以保存执行工作流，但不得成为相互竞争的规则副本、放宽或替代本文档。

## Applicability And Authority

- 只有跨越多个文件、接口、状态或验证边界，且不能由一个直接改动安全完成的临时任务，才建立 `docs/30-designs/RUNBOOK-*.md`。
- 简单、局部、可直接实现和验证的任务不建立 RUNBOOK。
- RUNBOOK 不是需求、接口、架构或稳定设计的真相源，不得自行确认未决产品范围。
- RUNBOOK 必须服从 `ARCHITECTURE.md`、正式 requirements、interfaces 和 designs；冲突时停止编写或执行并请求人工决定。
- RUNBOOK 可以固定已确认范围内的实现步骤，但不能借执行细节改变正式业务语义。

## Target Executor Model

RUNBOOK 必须假设执行者具备读取文件、修改代码和运行命令的能力，但不具备以下判断能力：

- 选择产品行为、兼容策略或失败语义；
- 在多个数据结构、接口、文件或技术方案之间择优；
- 根据自然语言目标补全遗漏范围；
- 判断是否应顺手重构、抽象或实现相邻能力；
- 判断测试失败可以忽略、绕过还是扩大范围修复；
- 判断何时可以宣告完成。

因此，RUNBOOK 中所有会改变行为、边界、数据所有权、兼容性或验证结论的决定都必须由作者预先完成。无法完成的决定必须成为明确的前置 STOP，不能留给执行者。

## Decision Completeness

RUNBOOK 必须做到决策完备：对每个实施步骤，执行者只能得到一个允许的动作和一个可机械判断的结果。

必须预先固定：

- 本次目标、起点、终点、交付物和明确 non-goals；
- 相关 requirements、interfaces、designs 和当前代码事实；
- 数据结构的精确字段、类型、required/optional、所有权和生命周期；
- 输入、内部转换、持久化、事件、输出和归档的完整调用链；
- 修改文件、相关符号、允许的新增文件和禁止触碰的邻接范围；
- 函数或接口名称、签名、调用顺序和依赖方向；
- ID、时间、actor、version、幂等键和 request hash 的来源；
- 状态转换、领域事件、payload、错误码和公开错误映射；
- 成功、失败、回滚、重放、恢复和终态语义；
- 每步验证命令、断言、PASS 条件和 STOP 条件；
- readiness 更新、长期结论迁移和 RUNBOOK 删除条件。

以下措辞默认不合格，除非同一句给出唯一选择规则：

- “或等价方案”“选择合适方案”“按需处理”；
- “修改相关文件”“补充必要测试”“完善错误处理”；
- “实际情况不同时自行调整”“保持合理兼容”；
- “必要时新增抽象/接口/迁移”；
- “测试基本通过”“确认没有问题”。

## Required Structure

每份 RUNBOOK 至少包含以下内容，标题可以增加编号，但不得省略语义：

1. 状态、执行分支或工作边界、建立日期。
2. 执行者契约：允许动作、禁止动作、顺序要求、PASS/STOP 定义和授权边界。
3. 目标：当前起点、预期终点和一条完整业务或工程链路。
4. 当前断点：文档声明、代码现状、缺口及其证据位置。
5. Scope 和 Non-goals。
6. 关联真相源、数据结构、接口、调用链、文件和符号。
7. 不可违反的不变量。
8. 按依赖顺序排列的机械执行步骤。
9. 验证矩阵、固定命令、失败处理和恢复方式。
10. 完成定义、readiness 迁移和删除步骤。

只有不涉及某类边界时才可省略对应细节，并必须明确写出 `Not Applicable` 及原因。例如纯文档分类任务可以将数据库迁移标记为 `Not Applicable`，不能静默缺失。

## Traceability Requirements

RUNBOOK 的每个行为必须能追溯到正式依据和代码入口：

```text
requirement / acceptance criterion
  -> interface or data contract
  -> design responsibility
  -> production file and symbol
  -> focused test
  -> full verification
  -> readiness evidence
```

- 引用文档时使用仓库内相对链接，并指出相关 section、requirement ID 或 interface symbol。
- 引用代码时写出完整仓库相对路径和准确 symbol；只写目录或“协议层”“Runtime”不合格。
- 文件或 symbol 尚不存在时，明确写出唯一的新文件路径或新 symbol 签名。
- 路径、symbol 或正式契约与调查结果不一致时，执行者必须 STOP，不得自行寻找替代入口。
- 讨论稿和 `docs/60-human/` 只能解释背景，不能单独授权实现。

## Data And Interface Detail

涉及数据、协议、事件、持久化或 projection 时，RUNBOOK 必须包含与当前任务相关的精确结构，而不是只列类型名。

至少说明：

- 字段名和类型；
- required、optional、nullable 和默认值；
- producer、consumer 和 canonical owner；
- caller 可提交字段与 Runtime 生成字段；
- 创建、更新、替代、撤销和终态规则；
- 内部模型与公开 DTO/Schema 的逐字段映射；
- event 名称、payload 和顺序；
- repository transaction、version、receipt、outbox 和恢复关系；
- 兼容读写策略，或明确 `Not Applicable`。

结构片段必须与目标代码精确一致。示意伪代码必须标为 `pseudocode`，不能与必须照抄的目标签名混在一起。

## File And Symbol Detail

每个执行步骤必须列出：

- 允许修改的 production 和 test 文件；
- 要新增或修改的类型、函数、Schema、mapper、事件或测试 suite；
- 该 symbol 的唯一职责；
- 与上一步和下一步的数据关系；
- 本步骤禁止修改的相邻行为。

“只修改这些文件”只有在作者已经核对依赖后才能使用。若编译必然要求同步 fixture 或 generated artifact，应预先列出允许的机械更新规则，不能让执行者临场决定范围。

## Task Granularity

一个机械执行步骤必须是“一个稳定语义单元及其直接验证”，并满足：

- 可以在一次有限上下文中理解和完成；
- 有单一主要行为变化；
- 输入、输出和依赖已知；
- 有独立的 focused validation；
- 失败时可以停止而不需要猜测后续补救；
- 不把未验证的半成品描述为完成。

不合格的过粗步骤包括“完成 Question 功能”“修改后端”“补齐测试”。不合格的过细步骤包括没有语义意义的逐行编辑、变量命名或纯格式动作。通常按以下边界拆分：正式契约、内部模型、纯 transition、Runtime 接线、持久化/恢复、projection、外部生命周期、完整验证和收口。

## Mechanical Steps

每一步必须使用相同格式：

````md
### Tn：唯一任务名称

前置状态：必须已经满足的事实。
允许修改：精确文件列表。
禁止修改：当前热点中的相邻范围。

执行：
1. 精确动作。
2. 精确动作。

验证：
```bash
exact command
```

PASS：命令退出码和必须成立的可观察断言。
STOP：确定触发条件、必须报告的证据和禁止采取的替代动作。
````

- 步骤必须按依赖顺序排列，不能要求后续尚未创建的接口。
- 命令必须可以从指定工作目录直接执行，不得使用占位符。
- 多个文件只有共同完成同一原子语义时才能放在一步。
- 失败恢复必须说明 state、文件、数据库或外部副作用是否需要回滚。

## Validation Requirements

验证矩阵必须按当前风险选择并明确列出：

- 正常成功路径；
- 边界输入和非法输入；
- caller、authority 和 capability；
- stale version 和 terminal immutability；
- 相同请求重放和 idempotency conflict；
- 数组部分非法时的原子性；
- transaction rollback 和无半提交；
- restart/reopen/recovery；
- internal state、event、receipt、outbox、projection 和 Archive 一致性；
- focused tests、typecheck/build/contract checks 和仓库完整验证入口；
- 真实外部运行验证，或明确 `Not Applicable` 及依据。

每个验证项必须写明预期结果。只有命令名称而没有断言不构成可执行验证。

## STOP Semantics

STOP 是正常且强制的执行结果，不是失败后继续发挥的提示。至少在以下情况停止：

- 正式文档冲突或缺少授权当前行为的需求；
- 指定文件、symbol、Schema、错误码或命令不存在；
- 必须选择本文未规定的产品或架构方案；
- 必须增加未授权依赖、抽象、数据库迁移、外部权限或生命周期行为；
- baseline 或前置步骤验证失败；
- 修改范围将进入 Non-goals；
- 无法通过规定验证且需要放宽断言、类型或 Schema。

STOP 报告必须包含：已完成的最后一步、触发条件、相关文件和 symbol、最小复现命令、实际输出，以及继续所需的人工决定。执行者不得自行回滚用户已有修改，也不得把 STOP 状态标为完成。

## Authoring And Audit

RUNBOOK 作者在交付前必须：

1. 读取本规则、架构、文档规则和任务所需的正式需求/接口/设计。
2. 调查当前代码、测试、构建入口和工作树状态。
3. 先完成产品与技术判断，再写机械步骤；未决判断形成前置 STOP。
4. 核对所有路径、symbol 和命令真实存在，计划新增项有唯一名称和位置。
5. 从低级 LLM 视角逐步 dry-run，删除所有隐含选择。
6. 检查每个 scope 项都有实施步骤和验证，每个步骤都能追溯到 scope。
7. 检查 Non-goals 没有被任何步骤或验证偷偷引入。
8. 运行文档链接检查和 `git diff --check`，记录未验证边界。

审计结论只能是：

- `Executable`：执行者无需做本文禁止的判断；
- `Not Executable`：列出缺失决定和准确位置；
- `Blocked`：正式依据冲突或缺失，需要人工决定。

## Completion And Deletion

- RUNBOOK 只能在所有 scope、验证矩阵和完整验证满足后关闭。
- 长期产品行为迁移到 requirements，跨边界语义迁移到 interfaces，稳定实现方案迁移到 designs，验证事实迁移到 readiness，运行流程迁移到 operations。
- 未覆盖项必须进入正式 coverage/readiness 或 TODO，不能仅留在即将删除的 RUNBOOK。
- 迁移完成后删除 RUNBOOK，并使用 `rg` 删除所有仅用于指向该 RUNBOOK 的残留引用。
- RUNBOOK 不得以 `completed`、`archive` 或历史文件形式长期保留在 `docs/30-designs/`。
- 删除 RUNBOOK 不等于删除 Git 历史；历史追溯使用 commit 和 readiness evidence。

## Related Documents And Skill

- [Document Rules](./DOCUMENT-RULES.md)
- [Architecture](./ARCHITECTURE.md)
- [TODO Rules](./TODO-RULES.md)
- [项目 RUNBOOK Skill](../../.agents/skills/convivium-runbook/SKILL.md)
