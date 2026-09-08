# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除，历史由 commit、PR 和必要的 readiness 文档保存。

## 当前任务项

2026-09-08 用户明确授权依次执行 TODO LIST，一任务一提交。MAD 编号用于任务依赖，RUNBOOK 的 T1–T6 仍是阶段门禁；阶段内拆分不新增范围，也不允许以部分任务完成代替整个阶段 PASS。T0 已确认，不列待办。每项相关文件均为仓库相对路径；计划新增路径不表示文件已存在。

- [ ] `MAD-11 / 临时计划收口`：核对完成依据并删除临时任务及 RUNBOOK
    - 依据文档：[TODO 规则](docs/00-governance/TODO-RULES.md) Closure Rules；[RUNBOOK 规则](docs/00-governance/RUNBOOK-RULES.md) Completion And Deletion；[文档规则](docs/00-governance/DOCUMENT-RULES.md) Document Lifecycle；[RUNBOOK](docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md) T6。
    - 确认依据：2026-09-08 本任务对话确认初发最终模型、无迁移和九角色完整部署；2026-09-08 用户授权依次实施并逐项提交。
    - 前置：MAD-01–MAD-10 全部完成或已按规则删除，T5 PASS，S1–S4 与验证矩阵全部满足。
    - 相关文件：删除 `docs/30-designs/RUNBOOK-MEETING-AGENT-ROLE-DESCRIPTION.md`；仅清理 `TODO.md` 本任务 MAD-01–MAD-11 已完成项及专用说明/链接；只读核对 MAD-01 正式依据与 MAD-10 readiness，不改其他任务。
    - 处理动作：备份原字节，核对长期结论与证据后删除临时文件及专用引用；删除后检查失败恢复并 STOP，不自动 commit。
    - 验收点：T6 引用查询删除后 exit 1 且无输出，V-DOC/diff check PASS，无未完成或其他任务被删除；收口项仅在删除后检查通过时完成。

## 待审阅任务项

## 待讨论项
