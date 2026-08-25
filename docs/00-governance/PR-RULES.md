# PR Rules

## Purpose

本文档定义 Convivium 的分支、Pull Request、Review、CI、文档收口和合并规则，使每个 PR 都形成可审阅、可验证的阶段性交付边界。Commit 的授权、粒度和消息格式由 `COMMIT-RULES.md` 定义。

## Scope

当前规则覆盖：

- 分支到 PR 的交付路径。
- PR 标题、描述和范围要求。
- 验证证据、未覆盖项和风险披露。
- 文档、TODO 和 RUNBOOK 收口。
- 默认合并方式。

当前已建立 `.github/workflows/pr-verify.yml`，只校验文档治理结构和 PR diff 格式。`plugin/` 已建立最小工程骨架，但当前 CI 尚未执行插件构建、类型检查、测试或打包；增加首批业务实现前，必须根据真实工具链补充验证矩阵。

## Delivery Boundary

- 开发改动通过 `branch -> PR -> review -> merge` 进入 `main`，不得把开发中的改动直接 push 到 `main`。
- 一个 PR 应围绕一个可以说明和验收的阶段目标组织。
- 如果 PR 跨越多个产品或工程领域，必须说明不可拆分原因、跨域影响和额外验证范围。
- PR 由符合 `COMMIT-RULES.md` 的一个或多个工程判断组成，并表达完整的阶段交付。
- PR 可以在未完成时保持 Draft，但不得把 Draft 状态当作省略范围、风险或验证说明的理由。

## Main Branch Protection

GitHub 仓库使用名为 `Protect main` 的 active Repository Ruleset 保护 `refs/heads/main`：

- 所有已有 `main` 上的变更必须通过 PR。
- 必须通过最新目标分支代码上的 `Governance` 状态检查。
- 必须解决全部 Review 对话。
- 禁止删除 `main`，禁止 force-push。
- 只允许普通 merge，与保留小步 commit 历史的规则一致。
- 当前仓库只有一个 collaborator，因此批准数暂设为 0，避免作者无法批准自己的 PR 而锁死仓库；增加独立 reviewer 后应调整为至少 1 个批准。
- 空仓库首次创建 `main` 时不强制要求尚不存在的状态检查；分支创建后正常执行全部规则。

GitHub Ruleset 是实际强制状态的真相源；本文记录项目期望。修改其中任一方时必须同步检查另一方。

## Branch Rules

- 分支名使用简短、稳定的英文语义，例如 `docs/initialize-governance`、`feat/meeting-shell`。
- 分支应围绕一个可形成 PR 的阶段目标组织，不混入无关工作。
- 分支中的 commit 必须遵循 `docs/00-governance/COMMIT-RULES.md`。

## PR Title And Description

- PR 标题使用 `Type(<project>[/<module>]): <阶段性交付结论>` 格式；`<project>` 必须使用 `COMMIT-RULES.md` 中的 Project Registry。
- PR 描述必须使用 `.github/pull_request_template.md`。
- 描述必须说明业务或工程完成点，而不只是复述 changed files。
- 模板中的验证项必须填写实际命令和结果；不适用时填写 `N/A` 及原因，不得留空或误勾为通过。
- 本地绝对路径、凭据、临时文件、个人机器信息、未提交草稿和 Agent 内部执行过程不得写入 PR 描述。

PR 描述固定覆盖：

- `Closure`：本 PR 形成的可交付完成点。
- `Scope`：纳入范围以及明确不纳入的内容。
- `Verification Evidence`：实际执行的检查、结果和运行时证据。
- `Not Covered`：未自动化、未执行或刻意排除的验证。
- `Cross-boundary Impact`：是否影响进程、接口、事件、权限、数据或配置边界。
- `Documentation And Task Closure`：文档、TODO 和 RUNBOOK 的同步状态。
- `Risks`：剩余风险、运行依赖和后续关注点。

## Verification Rules

- 当前 PR 必过检查为 `Governance`，由 `.github/workflows/pr-verify.yml` 显式定义。
- `Governance` 检查治理入口和文档目录存在，并对 PR diff 执行 `git diff --check`。
- 只记录实际执行过的验证；未运行、被阻塞或无法复现的检查不能标记为通过。
- 优先运行与改动范围匹配的最窄验证；公共契约、共享基础设施或跨进程行为变化时扩大范围。
- 自动化检查通过是证据，不自动证明业务行为、生命周期、权限和恢复流程正确。
- 涉及用户流程、ACP Agent 生命周期、权限或恢复能力时，应记录必要的运行时或人工验证。
- 不能执行的验证应写入 `Not Covered`，说明原因和影响，不把阻塞检查描述为绿色。
- 增加首批业务实现前，必须把真实的格式化、lint、类型检查、单元测试、集成测试和打包命令接入本规则及 CI；当前仅有的骨架级 `typecheck` 和 `build` 不能代表产品测试已建立。

## Documentation And Task Closure

PR 合并前必须检查：

- 产品行为变化是否同步 `10-requirements/`。
- 接口、事件、IPC、配置或数据格式变化是否同步 `20-interfaces/`。
- 架构边界或固定工程规则变化是否同步 `00-governance/`。
- 实现设计和失败处理变化是否同步 `30-designs/`。
- 验证状态和未覆盖项是否需要进入 `40-readiness/`。
- 运行方式变化是否同步 `50-operations/`。
- 相关 TODO 是否已经删除或收窄为真实剩余范围。
- 临时 RUNBOOK 是否已删除，长期结论和证据是否已经迁移。

## Review And Merge

- Review 应基于 merge base 检查完整 PR diff，并结合需求、契约、架构、失败路径和验证证据判断最终状态。
- Review finding 必须说明具体触发条件、可观察影响和修正方向，不报告纯风格偏好或无依据猜测。
- 合并前必须处理明确可执行的 review feedback，并重新运行受影响验证。
- 默认使用普通 merge commit，保留分支中的小步 commit 历史；只有用户明确要求时才 squash。
- 不自动合并 PR，除非用户明确要求执行合并。

## CI Evolution

工程脚手架确定后，应扩展现有 PR workflow：

- workflow 直接展示必过检查，不使用单一不透明脚本隐藏所有步骤。
- 按真实 workspace 和变更范围执行格式、lint、类型、测试和构建检查。
- 治理文件、PR 规则或 workflow 自身变化时，应触发足以验证规则有效性的检查。
- 本地聚合验证脚本可以作为便捷入口，但不能成为 CI 唯一可见的验证定义。
- 新增验证能力时，同步更新本文、PR 模板和 workflow。
