# PR Rules

## Purpose

本文定义分支、PR、review 与合并的交付边界。提交授权、粒度和消息格式由 [Commit Rules](./COMMIT-RULES.md) 定义，通用验证方法由 [Engineering Rules](./ENGINEERING-RULES.md#validation-and-evidence) 定义。

## Scope

适用于当前仓库的分支到 PR 交付、评审、CI 与合并。workflow 的 job、命令、依赖及 Node/pnpm 版本由 [PR Verify](../../.github/workflows/pr-verify.yml) 唯一维护；远端实际强制检查由 GitHub Ruleset 决定，不在本文保存配置快照或核验历史。

## Delivery Boundary

- 开发改动通过 `branch -> PR -> review -> merge` 进入 `main`，不直接把开发中的改动 push 到 `main`。
- 一个 PR 围绕可说明、可验收的阶段目标组织；跨工程或多个领域时说明不可拆分原因、影响和额外验证范围。
- PR 可以包含符合 Commit Rules 的多个工程判断，也可以暂时为 Draft；Draft 仍须说明范围、风险和未完成项。

## Main Branch Protection

项目期望：`main` 的变更必须经过 PR，禁止删除与 force-push，合并前解决全部 Review 对话并基于最新目标分支通过所有必需检查。默认使用普通 merge commit 保留小步历史；只有用户明确要求时才 squash，且远端策略必须允许。

执行合并前核对远端 Ruleset、required checks、审批要求、允许的合并方式及 PR 最新状态。不能以本文或历史记录代替实时状态；不能因 workflow 未触发就把缺失检查当作成功。远端策略与项目期望不一致时报告差异，不绕过保护；修改规则须有对应授权并回读确认。

## Branch Rules

- 分支名使用简短、稳定的英文语义，遵循当前工作环境要求的前缀。
- 分支围绕同一阶段目标，不混入无关工作；其中 commit 遵循 Commit Rules。

## PR Title And Description

- 标题使用 `Type(<project>[/<module>]): <阶段性交付结论>`；project 使用 Commit Rules 的 Project Registry。
- 描述使用 [PR Template](../../.github/pull_request_template.md)，表达工程完成点及审阅所需信息，不复述文件清单。
- 模板中的验证必须填写实际命令、结果与边界；不适用时写 `N/A` 和原因。未完成检查不可勾选为通过。
- 不写凭据、本地绝对路径、个人机器信息、临时草稿或 Agent 内部执行过程。简单变更可在各适用栏位用一句话说明，不重复展开同一结论。

## Verification Rules

- 本地验证范围和证据复用按 Engineering Rules；合并仍须满足远端所有必需检查，不能用本地 focused checks 代替 CI 门禁。
- CI 执行内容以 PR Verify workflow 为准。PR 中引用实际检查结果，不在规则或模板复制 job 清单与命令。
- 涉及用户流程、DSH Session 生命周期、权限或恢复时，提供相称的运行证据；未覆盖项如实记录，自动化绿色不代表产品或发布就绪。

## GitHub Tooling And Authorization

- GitHub Connector 与本机 GitHub CLI（`gh`）使用的凭据和授权范围可能不同；Connector 返回 `integration forbidden` 或不支持目标操作时，可以切换到本机已认证的 `gh`，不应仅据此判定 GitHub 操作失败。
- 切换调用通道不得扩大原始用户授权范围。尤其是 resolve、reply、reaction、删除评论、push、关闭或合并等写操作，必须仍然逐项对应用户请求和本规则。
- 使用 `gh` 前必须核对仓库、PR、线程或评论 ID，并确认 `gh auth status` 具备目标仓库访问权限。
- 每次 GitHub 写操作后必须回读对应资源确认最终状态；CLI 命令成功返回不能替代状态确认。
- 可重复的 Skill 应在其自身说明中引用本节，并记录实际使用的调用通道、权限失败原因（如有）、回读结果和未完成项。

## Documentation And Task Closure

合并前按 [Document Sync](./DOCUMENT-RULES.md#document-sync) 核对本次变更的同步范围。涉及已登记 TODO 或临时 RUNBOOK 时，分别核对 [TODO Closure](./TODO-RULES.md#closure-rules) 和 [RUNBOOK Completion](./RUNBOOK-RULES.md#completion-and-deletion)；未涉及时在模板标明 `N/A`，不新建任务或证据文档。

## Review And Merge

- Review 基于 merge base 检查完整 PR diff，并结合正式依据、失败路径及验证证据判断状态。
- finding 必须说明触发条件、可观察影响和修正方向，不报告纯风格偏好或无依据猜测；finding 成立与建议方案是否合适分别判断。
- 合并前处理明确可执行的反馈并补充受影响验证；新改动导致原检查失效时须重新验证。
- 只有用户明确授权才能合并；组合授权按 Commit Rules 解释。实际合并方式与门禁遵循 Main Branch Protection。

## CI Evolution

- workflow 直接展示必过检查，各 job 按实际改动覆盖格式、lint、类型、测试、构建与 package 契约；本地聚合脚本不替代清晰可见的 CI 结果。
- 修改 workflow 或仓库保护配置时核对 job 名称与 required checks 一致，避免缺失检查阻塞或无检查放行；远端变更仍需独立授权。
- 治理或 workflow 变化须执行能验证其有效性的检查。检查结果记录在对应交付证据中，不把当前配置或运行版本复制回规则。
