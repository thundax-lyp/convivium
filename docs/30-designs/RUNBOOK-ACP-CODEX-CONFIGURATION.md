# RUNBOOK: ACP Codex — 配置与角色资源

## Status, Dependency And Boundary

2026-10-15；Author / Audit；**Executable（实施计划，尚未执行）**。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册不授权提交、安装到人工环境或额外模型用量。

前置：A3 PASS；草稿已删除。Scope：Definition 选择/指纹/准入，以及 Web 资源闭包。Non-goals 沿总入口，不新增业务决定。

当前断点：model-options 合并 overrides；dsh-capabilities 丢弃解析配置；角色/能力闭集为七/五。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Traceability

必读 [DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md) 的 Definition/PreparedDescriptor/ownership、[Peer Meeting Agents](./PEER-MEETING-AGENTS-DESIGN.md) 的 provisioning、[Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) MO-FR-14。ACP 配置精确结构由 A2 新建的 `docs/20-interfaces/DSH-ACP-EXECUTION-INTERFACE.md` 提供；本册执行时必须存在。

C1 是 schema/hash 行为，C2 一次切换当前公开配置与所有消费方；不得在阶段中间部署。C5 先准备资源，C6 才原子发布八角色集合，C7 接入创建入口；未发布的新资源不宣称可用。

### C3：固化 provider 公开解析后的有效选择

前置状态：C2 PASS。
允许修改（2 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/role-composition/dsh-capabilities.ts`
- `plugin/tests/unit/role-composition/dsh-capabilities.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. preflightMeetingIdentity 从 resolveCallConfig 返回值抽取 provider/model/reasoning，再生成资源/descriptor；缺省 reasoning 按所选 provider 的公开默认固化，无值且无法证明不支持 reasoning 则拒绝。
2. acp-codex 的精确目录验证由其 adapter 承担，不能向所有原生 provider 强加目录可枚举要求；保存的有效选择继续参与 compositionHash。
3. RED/GREEN 覆盖解析返回值与输入不同、默认漂移、非法推理和资源绑定反例。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/role-composition/dsh-capabilities.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：descriptor 使用解析后选择，之后改变默认不污染原绑定；本步实际变更路径 2–10 个且均在清单内。
STOP：编造 none 或只等待成功而丢弃解析结果；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### C4：不可变准入快照与 descriptor 到期

前置状态：C3 PASS。
允许修改（4 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/src/runtime/services/meeting-identity-provision.ts`
- `plugin/tests/contract/meeting-identity-provision.spec.ts`
- `plugin/tests/recovery/meeting-identity.spec.ts`
- `plugin/tests/integration/dsh/meeting-creation.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 一次 provisioning 异步预检前只捕获一份完整选择；首份 descriptor/ownership 原子提交后只读原绑定，不实现 Host 配置 CAS。
2. 覆盖捕获前/后与提交中变更、无持久绑定失败可重新捕获、同值幂等/异值冲突。
3. 超过或恰等 expiresAt 的 provisioning 撤权/清理/记 PREFLIGHT_EXPIRED，不刷新；同样时间 active 仍按原绑定恢复。无生产 Catalog producer 继续 CATALOG_UNAVAILABLE。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-identity-provision.spec.ts tests/recovery/meeting-identity.spec.ts tests/integration/dsh/meeting-creation.spec.ts
```

PASS：快照/原子冲突/边界/冷恢复断言通过，不宣称生产动态目录已上线；本步实际变更路径 2–10 个且均在清单内。
STOP：延长期限、重选原绑定或新增跨 Host CAS；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### C5：准备 Web 静态资源与类型闭集

前置状态：C4 PASS；不发布新 Definition。
允许修改（7 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/config/agents/web_research_analyst/AGENTS.md`
- `plugin/config/skills/web/SKILL.md`
- `plugin/config/presets/convivium-web-research-analyst/preset.yml`
- `plugin/config/presets/convivium-web-research-analyst/agent.cordis.yml`
- `plugin/src/role-skills/role-skill-names.ts`
- `plugin/src/role-composition/model.ts`
- `plugin/src/repository/storage-domain/format/schemas.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 按正式 Web 合同创建四份资源：身份 web_research_analyst / convivium.web_research_analyst / WEB ANALYZER / convivium-web-research-analyst；web Skill 真搜索/读原文/核验与来源时间，不编造。
2. 增第六能力 web、第八 role 枚举及持久校验。Preset 沿 GitHub 只换 Skill 路径；不改原七 AGENTS，不增加会议权限或物理存储版本。
3. 当前发行 definitions/patch 仍保持七角色，资源尚不可被默认创建；C6 是唯一集合发布点。当前发行校验器严格拒绝额外资源，因此此步不运行尚未更新的精确文件集合校验，不把它记成已通过；C6 在同一次变更中更新发布与门禁。

验证：

```bash
pnpm --dir plugin exec vitest run tests/unit/role-composition/dsh-capabilities.spec.ts
pnpm --dir plugin typecheck:host
```

PASS：新资源/schema 可构建，原角色的 Skill 预检仍通过；精确发行文件集合检查留在 C6 发布后执行；本步实际变更路径 2–10 个且均在清单内。
STOP：提前发布部分八角色、向其它角色泄露 web 或改变旧持久格式；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

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
