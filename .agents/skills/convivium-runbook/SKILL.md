---
name: convivium-runbook
description: 为 Convivium 创建、细化、审计或机械执行临时 RUNBOOK 时使用。确保 RUNBOOK 对低级 LLM 决策完备，关联正式依据、数据结构、接口、文件、符号、验证和 PASS/STOP；不用于普通短任务或稳定操作手册。
---

# Convivium RUNBOOK

本 Skill 应用仓库 [RUNBOOK Rules](../../../docs/00-governance/RUNBOOK-RULES.md)。治理文档是唯一真相源；必须完整读取后再创建、修改、审计或执行任何 `RUNBOOK-*.md`，不得用本 Skill 的摘要替代它。

## 路由

先确认用户需要的模式：

- **Author**：创建或细化 RUNBOOK。
- **Audit**：判断现有 RUNBOOK 是否能由低级 LLM 无判断执行。
- **Execute**：严格执行现有 RUNBOOK。
- **Close**：迁移长期结论和证据并删除 RUNBOOK。

用户没有显式命名模式时，根据请求选择唯一匹配模式；请求同时包含编写和执行时，先完成 Author/Audit，只有结论为 `Executable` 才进入 Execute。

## 共同前置

1. 读取 `docs/AGENTS.md`、`docs/00-governance/ARCHITECTURE.md`、`docs/00-governance/DOCUMENT-RULES.md` 和 `docs/00-governance/RUNBOOK-RULES.md`。
2. Close 或涉及 TODO/验证收口时读取 `docs/00-governance/TODO-RULES.md`。
3. 按任务读取最小必要 requirements、interfaces、designs、readiness 和代码；讨论稿只作背景。
4. 读取工作树状态并保留用户已有修改。
5. 涉及 DSH 插件实现时同时使用 `dsh-plugin-development`，但 RUNBOOK 结构仍由本 Skill 和 RUNBOOK Rules 控制。

## Author

1. 调查需求、设计、接口、代码、测试和验证入口，先形成当前断点表。
2. 判断任务是否真的需要 RUNBOOK；简单局部任务直接报告不适用，不创建形式化文件。
3. 在写步骤前完成所有产品、接口和技术决定。无法从正式依据完成的决定写成前置 STOP，不得交给执行者选择。
4. 按 RUNBOOK Rules 写出：执行者契约、scope/non-goals、精确数据结构、完整调用链、文件/symbol 映射、不变量、机械步骤、验证矩阵和删除条件。
5. 每一步固定允许文件、精确动作、命令、可观察 PASS 和强制 STOP；删除“或等价”“按需”“相关文件”“必要测试”等模糊措辞。
6. 核对所有既有路径、symbol 和命令；新增路径和 symbol 必须只有一个指定位置与签名。
7. 对照 scope 做双向追踪：每个 scope 项都有步骤和验证，每个步骤都由 scope 与正式依据授权。
8. 运行仓库文档链接检查（若仓库没有专用脚本，则用 `rg` 核对所有相对链接目标存在）、`git diff --check`，并记录未验证边界。
9. 完成 Audit；只有 `Executable` 才向用户交付为可执行 RUNBOOK。

## Audit

逐项检查 RUNBOOK Rules，不得只抽查。除以下高风险项外，还必须逐项核对 Required Structure、Not Applicable 理由、每步固定格式、失败恢复、scope 双向追踪、验证矩阵、readiness 迁移和删除条件：

- 数据字段、required/optional、owner、ID、时间、actor 或 version 来源不明确；
- 只写模块或目录，没有文件和 symbol；
- 有多个可选实现、替代方案或隐含扩张；
- 步骤过粗、依赖倒置、缺少 focused validation；
- PASS 依赖主观判断，STOP 没有触发条件或证据要求；
- 失败时允许放宽 Schema、断言、类型或错误语义；
- readiness、长期文档迁移或删除步骤缺失。
- 作者是否运行并记录文档链接检查、`git diff --check` 和所有规定验证；未验证边界是否明确标为 `Not Covered`。

输出固定结论：

- `Executable`：无需低级 LLM 承担产品、架构或接口判断；
- `Not Executable`：列出每个缺失决定所在 section 和所需补充；
- `Blocked`：列出冲突真相源和需要用户确认的问题。

Audit 用户只要求评审时不得修改文件；用户要求创建、细化或修复 RUNBOOK 时直接修正后再审计。

## Execute

1. 完整读取 RUNBOOK，不补写未规定行为。
2. 从第一项未完成步骤开始，严格按顺序执行。
3. 只修改该步骤允许的文件和 symbol，运行该步骤指定命令。
4. PASS 后记录结果并进入下一步；STOP 时立即停止，报告规则要求的证据。
5. 不使用替代文件、替代接口、通用抽象、兼容层、跳过测试或类型断言绕过。
6. RUNBOOK 与正式真相源或当前代码冲突时执行 STOP，不自行更新 RUNBOOK 后继续。
7. 未获得用户明确授权时，不 commit、push、创建 PR、合并或执行外部写操作。

## Close

1. 逐项核对 scope、验证矩阵、完整验证和 readiness evidence。
2. 把长期结论迁移到正式 requirements/interfaces/designs/operations，把实际验证迁移到 readiness。
3. 把真实未覆盖项保留在 coverage/readiness 或按 TODO Rules 登记。
4. 使用 `rg` 查找 RUNBOOK 文件名和标题引用。
5. 先完成所有完整验证和 `git diff --check`；仅在全部通过后，删除 RUNBOOK 及已核对为“仅服务于它”的引用。删除后再次运行文档链接检查和 `git diff --check`；任一删除后检查失败都必须恢复被删除的 RUNBOOK/引用并停止。
6. 任一条件不满足时保留 RUNBOOK，不得把状态写成 completed。

## 输出

Author/Close 模式说明文件路径、结论和已运行验证；Audit 模式优先输出缺失决定；Execute 模式报告最后 PASS 步骤或 STOP 证据。不要把 Skill 自身描述为产品需求、接口依据或实现证据。
