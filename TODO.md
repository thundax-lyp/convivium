# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

2026-09-08 用户明确授权依次执行 TODO LIST，一任务一提交。MAD 编号用于任务依赖，RUNBOOK 的 T1–T6 仍是阶段门禁；阶段内拆分不新增范围，也不允许以部分任务完成代替整个阶段 PASS。T0 已确认，不列待办。每项相关文件均为仓库相对路径；计划新增路径不表示文件已存在。

- [ ] `MAD-02 / role-composition`：实现输入校验与原生创建转换
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、BR-11、验收 35/36/38；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) Definition fields、Host model overrides、Creation conversion、Error And Permission Semantics、Runtime Provenance And Recovery；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Role and model inputs、Creation conversion；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T2 动作 1/3/4。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-01 PASS；与 MAD-03 共同完成 T2 后才进入资源阶段。
    - 相关文件：修改 `plugin/src/role-composition/model.ts`、`plugin/src/role-composition/resolve.ts`；新增 `plugin/src/role-composition/model-options.ts`。测试修改 `plugin/tests/fixtures/role-composition.ts`、`plugin/tests/unit/role-composition/resolve.spec.ts`、`plugin/tests/unit/role-composition/dsh-capabilities.spec.ts`、`plugin/tests/integration/dsh/session-adapter.spec.ts` 的 resolved role adapter composition suite；新增 `plugin/tests/unit/role-composition/model-options.spec.ts`。只读保持 `plugin/src/role-composition/dsh-capabilities.ts`、`plugin/src/dsh/session-adapter.ts`。
    - 处理动作：修改 MeetingAgentDefinitionV1/parseAgentDefinitions、ResolveMeetingRolesInput/resolveMeetingRoles/definitionHash，新增 MeetingAgentModelOverrides/parseAgentModelOverrides；fixture 拆分 roleCompositionDefinitions 与 roleCompositionModelOverrides。
    - 验收点：对应 role-composition 与 session-adapter focused suites 通过：旧字段/未知 ID/非法 map 拒绝，空 map 与原型名 ID 正常，深拷贝冻结、脱敏、派生 persona、模型透传与指纹分离符合契约；全角色预检保持。T2 全局 lint/typecheck 在 MAD-03 接线完成后统一验收，不把中间态视为可交付。

- [ ] `MAD-03 / Host config / Meeting creation`：接通独立模型覆盖的创建链路
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 38/39；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) Transport Or Invocation、Error And Permission Semantics、Runtime Provenance And Recovery；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Role and model inputs、State And Failure Handling、Security And Observability；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) Exact Transformation And Call Chain、T2 动作 2/5。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-02 的输入与 resolver 已实现。
    - 相关文件：修改 `plugin/src/config.ts`、`plugin/src/index.ts`、`plugin/src/runtime/application-service/types.ts`、`plugin/src/runtime/application-service/create-meeting.ts`、`plugin/src/runtime/meeting-runtime.ts`；测试修改 `plugin/tests/unit/config.spec.ts`、`plugin/tests/unit/runtime/meeting-runtime.spec.ts`、`plugin/tests/contract/meeting-runtime.spec.ts`、`plugin/tests/unit/host-plugin-lifecycle.spec.ts`，使用 MAD-02 的共享 fixture。
    - 处理动作：由 Config transform 顺序解析两项配置，经 meetingConsumerPlugin.apply、CreateStatusRuntimeOptions、createMeetingApplication、MeetingCreationRuntimeDependencies 传给 resolver；不扩展 Captain/HTTP 输入。
    - 验收点：执行 T2 完整格式检查、lint、typecheck 和指定 focused tests，全部 PASS；配置错误不泄露私有值，身份创建原子性与失败清理保持，重放不重新解析，未改 adapter 签名及 repository/domain/protocol/client。

- [ ] `MAD-04 / meeting-roles 资源`：替换九角色资源并校验原生格式
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 35/36/38/39；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) First-release assets、Compatibility；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Native deployment resources；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) Deployment Assets、Fixed Role And Skill Content、Native Deployment Contract、T3 动作 1/2/3/5。DSH 格式参考：[Preset 契约](.agents/skills/dsh-plugin-development/references/presets-context.md)、[Skill 契约](.agents/skills/dsh-plugin-development/references/skill-providers.md)。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-03 PASS（T2 完成）。
    - 相关文件：新增 `plugin/meeting-roles/definitions.json`、`plugin/meeting-roles/README.md`、`plugin/meeting-roles/cordis.patch.yml`、`plugin/meeting-roles/presets/convivium/preset.yml`、`plugin/meeting-roles/presets/convivium/agent.cordis.yml`，以及 `plugin/meeting-roles/presets/convivium/skills/` 下九个目录各自的 `SKILL.md`：`meeting-management`、`domain-architecture`、`dsh-runtime-engineering`、`protocol-ui-engineering`、`verification-review`、`github-source-research`、`arxiv-paper-analysis`、`web-source-research`、`referenced-minutes`。删除 `plugin/examples/meeting-agent-definitions/README.md` 及 RUNBOOK 角色表九目录各自的 `AGENT.md`/`agent-definition.json`（共 19 文件）。修改 `plugin/scripts/verify-agent-definition-samples.mjs`、`plugin/tests/unit/scripts/agent-definition-samples.spec.ts`。
    - 处理动作：按固定正文与部署配置交付共享 convivium Preset 和九个 Skills，将验证器改为 verifyMeetingAgentDefinitions(root)，移除旧 manifest/hash 校验；只删除指定旧文件。
    - 验收点：T3 的 verify:agent-definitions、samples suite 和 V-DOC 通过；完整资源经 parseAgentDefinitions 通过；漏 Skill、name 错误、不可模型调用、空正文、不同 Preset、旧字段、symlink 和未知文件均失败；旧目录无残留，Runtime 不增加资源读取。

- [ ] `MAD-05 / 发布包`：纳入角色资源并封闭打包契约
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14 首发分发与部署要求；[架构](docs/00-governance/ARCHITECTURE.md) Source Layout And Verification；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) First-release assets；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Native deployment resources；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) Native Deployment Contract、T3 动作 4。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-04 的新资源与验证器通过。
    - 相关文件：修改 `plugin/package.json`、`plugin/scripts/verify-package.mjs`、`plugin/scripts/verify-plugin-contract.mjs`；只读保持 `plugin/cordis.patch.yml` 和 package root JS exports。
    - 处理动作：更新 files/exports、闭合 allowlist、requiredArtifacts 与 expectedExports，增加唯一 meeting-roles patch export 并验证资产存在。
    - 验收点：T3 的 build、verify:contract、verify:package 通过；tarball 包含五个固定资源与九个 SKILL.md，无 checkout 路径；verify:agent-definitions 命令及 verify 顺序保持，MAD-04/05 共同满足 T3 PASS。

- [ ] `MAD-06 / role-composition smoke`：适配既有模型差异与冷恢复场景
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 39；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) Creation conversion、Runtime Provenance And Recovery；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) State And Failure Handling；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T4 动作 1；[Smoke 操作](docs/50-operations/HOW-TO-DSH-SMOKE.md) FR-14 共享 Preset 角色隔离与冷恢复。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-05 PASS（T3 完成）。
    - 相关文件：修改 `plugin/scripts/smoke-profile/probe/role-definitions.js`、`plugin/scripts/smoke-profile/probe/scenarios/role-composition.js`、`plugin/scripts/smoke-profile/probe/scenarios/recovery.js`、`plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/result.mjs`、`plugin/tests/unit/scripts/role-composition-smoke.spec.ts`。
    - 处理动作：拆分 roleSmokeDefinitions 与新增 roleSmokeModelOverrides(phase)，同步 writeSmokePatch、assertRoleSmoke 和结果预期，继续验证 phase 1 descriptor 在 phase 2 配置下恢复。
    - 验收点：role-composition-smoke focused suite 通过；保留 persona/filter/provider/model/reasoningEffort、禁用工具 body 零调用、父路由不变和双 Host 隔离断言；真实冷恢复运行由 MAD-10 验收。

- [ ] `MAD-07 / meeting-roles smoke 启动`：接通真实发布资源、场景路由与清理
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 39；[架构](docs/00-governance/ARCHITECTURE.md) DSH Plugin Host、Source Layout And Verification；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Native deployment resources；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T4 动作 2/3/4/10；[Smoke 操作](docs/50-operations/HOW-TO-DSH-SMOKE.md) 成功与 Restore、失败处理。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-06 的旧场景适配完成；与 MAD-08 同属 T4，不交付未接通场景。
    - 相关文件：修改 `plugin/scripts/smoke-profile/index.mjs`、`plugin/scripts/smoke-profile/probe/index.js`、`plugin/tests/unit/scripts/smoke-profile.spec.ts`；新增测试 `plugin/tests/unit/scripts/meeting-roles-smoke.spec.ts` 的启动/路由/清理用例。场景导入目标由 MAD-08 新建。
    - 处理动作：新增 selector，更新 SMOKE_SCENARIOS/runSelectedScenario/driveParticipant；同 tarball 安装并解包，部署 patch 先于控制 patch，真实 Captain 显式挂载 convivium；沿既有 finally 清理。
    - 验收点：smoke-profile 与 meeting-roles-smoke 对应 focused 用例通过：总场景 17、CORE 仍 5、Browser 拒绝、资产路径与 patch 顺序正确；超时/加载失败进入 Restore，其他场景 timeout 不变；完整 T4 lint/typecheck 在 MAD-08 完成后运行。

- [ ] `MAD-08 / meeting-roles smoke 探针`：验证九角色原生能力与权限结果
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、BR-11、验收 36/38/39；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) Transport Or Invocation、Creation conversion、First-release assets、Error And Permission Semantics；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Security And Observability、Acceptance；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) Invariants And Failure Oracles、T4 动作 5–10。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-07 的 wrapper/probe 接线已准备。
    - 相关文件：新增 `plugin/scripts/smoke-profile/probe/scenarios/meeting-roles.js`，唯一导出 runMeetingRolesScenario(runtime)；修改 `plugin/scripts/smoke-profile/result.mjs`，补齐 `plugin/tests/unit/scripts/meeting-roles-smoke.spec.ts` 的结果/失败用例。只读保持生产权限与恢复实现。
    - 处理动作：真实创建并暂停九身份会议，逐个观察 Skill tool/call/result，执行三研究角色 search/fetch 和 Manager/Scribe 权限探针；严格校验固定 assertions/observed。
    - 验收点：T4 指定格式检查、lint、typecheck 和全部 focused tests PASS；九 Session 唯一、九 Skill 成功、三类研究结果、两次会议工具和两次继承工具 UNKNOWN_TOOL 拒绝、会议状态不变均有断言，缺项/重复/false 拒绝；不以单元测试替代 MAD-10 的真实证据。

- [ ] `MAD-09 / 部署操作文档`：同步可独立执行的首发部署步骤
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 39；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Native deployment resources；[文档规则](docs/00-governance/DOCUMENT-RULES.md) 50-operations、Document Sync；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T5 动作 1/2、Native Deployment Contract。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-08 PASS（T4 完成）；当前 HOW-TO 草案已存在，只补齐实现后的差异。
    - 相关文件：修改 `docs/50-operations/HOW-TO-MEETING-ROLES.md`、`docs/50-operations/HOW-TO-DSH-SMOKE.md`、`plugin/meeting-roles/README.md`。
    - 处理动作：对齐同 tarball 安装/解包、web patch 顺序、显式 Captain Preset、八 Participant、模型覆盖、凭据注入与清理命令，更新场景数和恢复说明。
    - 验收点：V-DOC/diff check 通过，操作链路与实际脚本一致；17 场景/5 CORE、Browser 边界明确；实际部署通过前保留未验证标记，MAD-10 通过后据实更新。

- [ ] `MAD-10 / 部署验证与 readiness`：执行完整门禁并保存真实证据
    - 依据文档：[需求](docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-14、验收 35–40；[接口](docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) Runtime Provenance And Recovery；[设计](docs/30-designs/ROLE-COMPOSITION-DESIGN.md) Acceptance；[TODO 规则](docs/00-governance/TODO-RULES.md) Verification Check；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T5、Validation Matrix；[角色操作](docs/50-operations/HOW-TO-MEETING-ROLES.md) 与 [Smoke 操作](docs/50-operations/HOW-TO-DSH-SMOKE.md) 为执行入口。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-09 文档就绪、T4 PASS、现有 dev.env 流程可用；按已有授权边界执行。
    - 相关文件：更新 `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` 的 FR-14/Shared Preset Role Composition、`docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md` 的新 Meeting Roles Deployment 小节、RUNBOOK 执行记录；据实更新 MAD-09 三文件的验证标记。运行入口为 `plugin/package.json` 和 `plugin/scripts/smoke-profile/index.mjs`，此项不改生产或验证脚本。
    - 处理动作：顺序执行完整 verify、role-composition smoke、meeting-roles smoke、默认五核心 smoke，将实际运行边界及 Prepare/Execute/Assert/Restore 迁入正式证据。
    - 验收点：T5 四条固定命令 exit 0、所有 Restore PASS，随后 V-DOC/diff check 通过；九角色加载、三类研究能力、权限拒绝、模型差异和冷恢复均有本次证据；首次失败 STOP，不能把必过项列为 Not Covered 后关闭。

- [ ] `MAD-11 / 临时计划收口`：核对完成依据并删除临时任务及 RUNBOOK
    - 依据文档：[TODO 规则](docs/00-governance/TODO-RULES.md) Closure Rules；[RUNBOOK 规则](docs/00-governance/RUNBOOK-RULES.md) Completion And Deletion；[文档规则](docs/00-governance/DOCUMENT-RULES.md) Document Lifecycle；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T6。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-01–MAD-10 全部完成或已按规则删除，T5 PASS，S1–S4 与验证矩阵全部满足。
    - 相关文件：删除 `docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md`；仅清理 `TODO.md` 本任务 MAD-01–MAD-11 已完成项及专用说明/链接；只读核对 MAD-01 正式依据与 MAD-10 readiness，不改其他任务。
    - 处理动作：备份原字节，核对长期结论与证据后删除临时文件及专用引用；删除后检查失败恢复并 STOP，不自动 commit。
    - 验收点：T6 引用查询删除后 exit 1 且无输出，V-DOC/diff check PASS，无未完成或其他任务被删除；收口项仅在删除后检查通过时完成。

## 待审阅任务项

## 待讨论项
