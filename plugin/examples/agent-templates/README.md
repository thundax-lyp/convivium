# DSH Agent Template Samples

这些样本把 `DSH-AGENT-TEMPLATE-INTERFACE.md` 中的角色组合具体化，供设计审阅、manifest 校验和后续 FR-14 registry/installer 实现使用。

## Boundary

- 每个目录都是一个 Template package，包含 `agent-template.json` 和 `ROLE.md`。
- `agent-template.json` 中的 resource ref 是 Host registry ID；样本不包含 Skill 内容、Tool 实现、MCP credential 或 permission profile。
- 当前 Runtime 不读取本目录，且 `package.json#files` 不发布本目录。样本存在不表示 FR-14 已实现或对应 Agent 已获得差异化能力。
- `meeting-manager` 是每场 Meeting 的内建角色；其余 Template 可映射为 Catalog candidate。
- `meeting-scribe` 只整理带正式来源引用的纪要草稿，不记录或修改 Runtime-owned transcript、Fact 或 Decision。

## Samples

| Template                  | Role                      | Differentiated focus                                   |
| ------------------------- | ------------------------- | ------------------------------------------------------ |
| `meeting-manager`         | `meeting_manager`         | Turn planning、refocus、evidence-gap review 和参会推荐 |
| `domain-architect`        | `domain_architect`        | 需求、领域状态、不变量和设计一致性                     |
| `runtime-engineer`        | `runtime_engineer`        | DSH Runtime、事务、恢复和 Session 生命周期             |
| `protocol-ui-engineer`    | `protocol_ui_engineer`    | Protocol Schema、projection、HTTP 和 Client UI         |
| `verification-reviewer`   | `verification_reviewer`   | 反例、测试矩阵、smoke 和 readiness 证据                |
| `github-research-analyst` | `github_research_analyst` | 官方 repository、源码、commit、issue、PR 和 release    |
| `arxiv-research-analyst`  | `arxiv_research_analyst`  | 论文版本、方法、实验结论和局限                         |
| `web-research-analyst`    | `web_research_analyst`    | 官方文档、标准、公告和时效性信息                       |
| `meeting-scribe`          | `meeting_scribe`          | 引用式纪要、事实/决议索引和 coverage 检查              |

## Validation

从 `plugin/` 执行：

```sh
pnpm verify:agent-templates
```

该检查验证 manifest 字段、角色与 Template 唯一性、相对路径安全、resource ref 形状，以及 `ROLE.md` 的 SHA-256。它不解析 Host registry，也不执行 DSH scoped composition。
