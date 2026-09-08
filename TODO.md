# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

2026-09-08 用户明确授权依次执行 TODO LIST，一任务一提交。MAD 编号用于任务依赖，RUNBOOK 的 T1–T6 仍是阶段门禁；阶段内拆分不新增范围，也不允许以部分任务完成代替整个阶段 PASS。T0 已确认，不列待办。每项相关文件均为仓库相对路径；计划新增路径不表示文件已存在。

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
