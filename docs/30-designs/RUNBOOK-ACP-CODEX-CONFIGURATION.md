# RUNBOOK: ACP Codex — 配置与角色资源

## Status, Dependency And Boundary

2026-10-15；Author / Audit；**Executable（实施计划，尚未执行）**。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册不授权提交、安装到人工环境或额外模型用量。

前置：A3 PASS；草稿已删除。Scope：Definition 选择/指纹/准入，以及 Web 资源闭包。Non-goals 沿总入口，不新增业务决定。

当前断点：model-options 合并 overrides；dsh-capabilities 丢弃解析配置；角色/能力闭集为七/五。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Traceability

必读 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 的 Definition/PreparedDescriptor/ownership、[Peer Meeting Agents](./PEER-MEETING-AGENTS-DESIGN.md) 的 provisioning、[Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) MO-FR-14。ACP 配置精确结构由 A2 新建的 `docs/20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md` 提供；本册执行时必须存在。

C1 是 schema/hash 行为，C2 一次切换当前公开配置与所有消费方；不得在阶段中间部署。C5 先准备资源，C6 才原子发布八角色集合，C7 接入创建入口；未发布的新资源不宣称可用。

### C6：原子发布八角色集合及 preset

前置状态：C5 PASS。
允许修改（7 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/config/definitions.json`
- `plugin/config/cordis.patch.yml`
- `plugin/scripts/verify-agent-definition-samples.mjs`
- `plugin/src/runtime/meeting-lifecycle.ts`
- `plugin/tests/unit/host-plugin-lifecycle.spec.ts`
- `plugin/tests/contract/meeting-roles-target.spec.ts`
- `plugin/tests/contract/meeting-roles-deployment.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. Definition 末尾添加 Web，requiredSkillNames/evidenceScopes=[web]，tags=[web-research,source-verification,information-analysis]；deny 集合沿 GitHub。AGENTS SHA256 由最终字节计算。
2. patch 增第八 preset，lifecycle 的精确七角色长度/集合门禁改精确八，发行校验器按八角色/六能力及 optional strict agentOptions 检查。
3. 同步部署/资源/Host 生命周期断言；此步不改发行默认初始两个 contributor，下一步一并修改创建入口。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-roles-target.spec.ts tests/contract/meeting-roles-deployment.spec.ts tests/unit/host-plugin-lifecycle.spec.ts
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin typecheck:host
```

PASS：发行、preset、Host 精确集合均为八，原资源 hash 不变；本步实际变更路径 2–10 个且均在清单内。
STOP：放宽精确集合检查为任意角色，或用假 hash 通过；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### C7：接入 Web 创建入口并完成配置阶段验证

前置状态：C6 PASS。
允许修改（7 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/tools/meeting-start-skill.ts`
- `plugin/config/cordis.patch.yml`
- `plugin/config/README.md`
- `plugin/tests/unit/tools/meeting-start-skill.spec.ts`
- `plugin/tests/unit/config.spec.ts`
- `plugin/tests/integration/dsh/meeting-agent-owner.spec.ts`
- `plugin/tests/unit/role-composition/dsh-capabilities.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 创建目录与发行默认 contributors 加 Web，保持 GitHub/arXiv/Web 顺序；maxParticipants 仍 8。README 同步 Definition 配置和八角色/六能力，不写账号模型。
2. 更新 owner/配置/Skill 分配集成断言，验证 Web 仅能加载 web，未分配项拒绝；非 ACP 身份行为保持。
3. 运行本册全部聚焦集合，形成交接证据；不把这一阶段称为 ACP 已接通。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/config.spec.ts tests/unit/role-composition/model-options.spec.ts tests/unit/role-composition/resolve.spec.ts tests/unit/role-composition/dsh-capabilities.spec.ts tests/contract/meeting-identity-provision.spec.ts tests/recovery/meeting-identity.spec.ts tests/integration/dsh/meeting-creation.spec.ts tests/contract/meeting-roles-target.spec.ts tests/contract/meeting-roles-deployment.spec.ts tests/unit/tools/meeting-start-skill.spec.ts tests/unit/host-plugin-lifecycle.spec.ts tests/integration/dsh/meeting-agent-owner.spec.ts
pnpm --dir plugin verify:agent-definitions
pnpm --dir plugin typecheck:host
```

PASS：本册配置/资源/准入聚焦集合全部通过，八角色冷读和六能力隔离成立；本步实际变更路径 2–10 个且均在清单内。
STOP：需绕过 Skill/权限、修改其它身份或扩大 Catalog 范围；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

## Validation, Handoff And Deletion

本册门禁为各步全部验证与实际文件计数，断言见各 PASS；配置与角色资源完整，但尚无真实 ACP 执行证据。只有前述证据齐全才交接P1。将每步实际变更路径、命令/退出码、关键断言和 Not Covered 保存到仓库外脱敏执行记录，不为写进度修改其它 RUNBOOK。

失败按总入口 Restore 保留工作树和原持久状态，不消除 unknown；本册不重复做其它阶段已证明的验收。全局 readiness 和四条真实 lane 由 E 册负责。中途不删除本册；全部交付完成后 E3 连同其余阶段和总入口一起删除，不能以 completed/archive 留存。数据结构/接口缺漏在编码前 STOP，不能把本册当新的产品真相源。
