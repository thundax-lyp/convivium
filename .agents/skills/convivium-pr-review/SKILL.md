---
name: convivium-pr-review
description: Review a Convivium branch or pull request against its base diff for introduced or exposed correctness, architecture, meeting-protocol, lifecycle, persistence, security, and verification risks. Use for PR or branch review; report findings only and do not modify code.
---

# Convivium PR Review

对 Convivium 当前分支相对于目标基线的已提交变更执行严格、只读的 PR Review。`SKILL.md` 负责流程编排；具体风险模型、检查项和输出契约分别由 references 承载；Git 基线、changed files、模块分类和 diff 读取由 script 固化。

## 边界

- 默认审查 `main...HEAD`；用户明确提供其他 base 时使用该 base。
- 默认只审已提交 diff。工作区和未跟踪文件只作为状态信息，不纳入 findings；只有用户明确要求时才追加审查。
- 不修改、格式化、提交、推送、回复评论、合并或委派审查。
- 既有问题只有在当前 diff 引入、暴露、连通或实质放大时才报告。
- 不能把相邻项目作为源码、协议、目录分类或兼容基线。

## 1. 建立基线

在仓库根目录运行并完整读取：

```sh
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs context --base main
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs diff --base main
```

如果 patch 较大，按 context 返回的模块或路径分段运行 `diff --module <module>` / `diff --path <path>`，但必须覆盖全部 changed files。保存 snapshot：

```sh
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs snapshot --base main
```

记录 `base_sha`、`merge_base`、`head`、`diff_hash` 和完整 changed-file 集。若 committed diff 为空，输出 0 个 changed files、coverage complete 和 `No actionable findings.`。

## 2. 路由上下文

先读取：

- `docs/AGENTS.md`
- `docs/00-governance/ARCHITECTURE.md`
- `docs/00-governance/PR-RULES.md`
- `.github/pull_request_template.md`
- `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md`
- `docs/20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md`

再按 changed files 读取相关 `docs/30-designs/`、`docs/40-readiness/`、`TODO.md` 和 `plugin/package.json`。只加载能解释当前 diff 的最小上下文。

## 3. 建立审查模型

1. 从 diff、文档、测试和调用链归纳 1–5 条系统承诺。
2. 从 [`references/failure-models.md`](./references/failure-models.md) 选择 1–3 个主风险模型。
3. 读取 [`references/review-checks.md`](./references/review-checks.md)，对全部 changed hunks 先做必经基础检查，再执行实际触发的专项检查。
4. 读取 [`references/coverage-and-output.md`](./references/coverage-and-output.md)，建立 changed-file ledger 和 contract-surface ledger。

Convivium 重点承诺包括：单一有效发言权、顺序发言和迟到结果隔离；会议身份与 AgentSession 隔离；caller binding 和 capability 权限；SQLite 事务、receipt、event、outbox 幂等；TeamTask/mail/内部过程与正式会议事实隔离；暂停恢复、orphan 清理、归档和 capability revoke；完成判断与 required review；Host/Client、HTTP/tools 和 package contract。

## 4. 审查完整 diff

- 逐个覆盖脚本返回的 changed files；测试、配置、迁移、脚本和文档不能因不是业务代码而跳过。
- 对改动建立 producer → adapter → validator → consumer/sink 链路，必要时追踪 fallback、历史数据、迁移、等价路径和测试。
- 对当前 PR 至少推演一个异常、并发、权限、恢复、历史数据或治理失败反例。
- 对新增、删除、替换、绕过或收窄的旧路径进行语义对账。
- 只报告满足 finding 门槛的问题，不为了凑数量提出建议。

## 5. 关闭审查

重新运行 snapshot。若 `head`、`base_sha`、`merge_base`、`diff_hash` 或 changed-file 集发生变化，原 ledger 失效，必须重新审查。按照 [`references/coverage-and-output.md`](./references/coverage-and-output.md) 输出 findings、ledger、validation gaps、summary 和合并建议。

只有两个 ledger 闭合且无 deferred 时，才能报告 `No actionable findings.`；没有 confirmed finding 但 coverage 不完整时，必须报告 `No confirmed findings, but review coverage is incomplete.`，并建议补齐审查后再决定。
