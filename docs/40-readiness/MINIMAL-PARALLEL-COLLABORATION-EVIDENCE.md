# 最小并行协作验证证据

## Scope

2026-09-15 在分支 `codex/project-goal-tests-and-direction` 验证首次发布的最小并行贡献流程。T10 源码边界为基线 `6a9501c` 加本文件所在 T10 提交；T11 模型场景边界为提交 `0be1d0d`；环境为 macOS、Node.js `>=22.19.0`、pnpm、真实 `@deepseek-ai/dsh@0.1.2-rc.1` Web Host、临时 SQLite profile 与 `spawn` provider。

## Validated Contract

- Manager 在真实 DSH Session 中为 A、B 分派两个独立 Contribution，三位 Participant 使用不同 Session。
- 私有 draft 在精确版本批准前不进入 Transcript；正式消息只保留 Contribution 来源字段。
- B 的材料版本可由获授权身份读取，作者不能自审；Reviewer 实际读取 `amber-47` 后记录 `supports`。
- submit/approve 重放不重复发布，同 requestId 改内容冲突，旧 revision/generation 拒绝。
- pause/resume 推进 generation；非 Browser 流程可归档并按白名单回读材料。
- Browser 展示与工具状态一致，刷新不改变状态，UI 可用既有表单结束并归档会议。

## Executed Validation

从仓库根目录执行：

```sh
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=parallel-contribution CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile --json
```

确定性运行退出码为 0，结果 `scenario=parallel-contribution`、`status=archived`、`meetingVersion=16`，八项固定 assertions 全部存在，`restore=PASS`。结果包含三个不同 Participant Session、两个不同 Contribution、两条不同正式消息，以及可回读的 `evidenceKey`；归档材料字节仍为 `amber-47`。

Browser 运行在同类隔离 Host 上停于 `status=running`、`meetingVersion=13`。实际 UI 显示：

- Transcript 恰有 B、A 两条正式消息，未出现 A 的退回稿。
- B 的 `Draft revision` 为 1，材料为 `amber-47`，claim 为 `material contains amber-47`，Verification 为 `supports: amber-47 matched`，Method 为 `literal comparison`。
- Reload 后上述内容不变。
- 选择 `partial`、填写 `browser contribution check` 并结束后，状态为 `archived`、版本为 16；归档后相同材料及核验仍可见。

向原 PTY 发送 Ctrl-C 后输出 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`；精确临时根检查返回不存在。认证 URL、token、cookie 和本地凭据未写入本证据。

本任务还执行 `pnpm --dir plugin format`、`pnpm --dir plugin lint` 和 `pnpm --dir plugin build`，结果记录在同一 T10 提交的执行日志中。

## Not Covered

- 本确定性场景不调用远程 LLM，不证明模型讨论质量或 Provider 推理链路；固定真实模型讨论由后续独立场景验证。
- 不证明生产部署、多用户、跨 Host writer、物理数据库迁移、自动抓取或用户价值。
- Browser 只覆盖本节列出的 Contributions、Transcript、刷新、end 和归档回读，不外推到未操作控件。

## Closure

T10 的 V15 真实 Loader、DSH Session、权限、版本、Client 显示、归档与 Restore 已取得对应证据。V16 的真实模型请求及正式稿件由下节收口；语义质量与真实用户价值仍为 Not Covered。

## T11 Real Model Discussion (V16)

2026-09-15 在同一分支执行 `CONVIVIUM_SMOKE_SCENARIO=parallel-contribution-model pnpm --dir plugin smoke:profile --json`，真实 `@deepseek-ai/dsh@0.1.2-rc.1` Web Host，`deepseek-official/deepseek-v4-flash` 四个角色。最后一次原文关联运行退出码 0、`durationMs=86900`、`restore=PASS`；隔离 profile 已清理。会议 `meeting-7ed854468fb502519eaff357a546a380`、Captain Session `convivium-smoke-captain`；两条正式消息分别为 `message-contribution-a5f5f61663ef2419c4b6a8aa09c45e6b-1`（Feasibility proposal）和 `message-contribution-ea68e02851cadc5aa9a4b410b2c8a054-1`（Product summary）。状态 `archived`、`archiveVerified=true`、`interventions=0`。六项 assertions 为 `model-origin-submissions`、`boundary-before-publication`、`material-version-readable`、`review-not-self`、`structured-comparison`、`archive-verified`。前一次同一探针也在 81826 ms 内 PASS，原文旁路加入后独立重跑再次 PASS。

模型来源回执分别证明：两位作者在不同 DSH Session 中保存各自内部材料并提交；Manager 读取精确 draft 后批准；Reviewer 读取已发布的精确 draft 和 evidenceKey 并逐条 literal review；Captain partial 结束、归档后回读 summary 精确版本及其证据。两份内部材料仅支持“这是模型撰写、外部主张仍为假设”的文本事实，不支持商家需求、接口政策或价格。Product 的正式 JSON 满足固定七键、三个候选场景和七键推荐结构；其 evidenceKey 为 `product-internal-material:1`。这是结构 PASS，不是产品方向结论。

原文关联证据：上述两个 messageId 的正式 `content` 在最后一次 wrapper 输出的 `modelDiscussion` 数组中按 messageId 匹配；该运行的输出为本任务执行回执，隔离原始 Session 不保留。Feasibility 原文主张“首版最可行=评价与退换货处理”，列出六个场景的模型假设评分、3–6 周上线与 30–50 家商家对照等未验证估算；Product 原文推荐“商品上架与详情页素材制作”，比较上架、订单库存同步、售前售后客服，给出单类目草稿、单件耗时与改写率指标。两者推荐不同，原文都承认没有独立外部商家事实，不能用 internal evidence 的 literal `supports` 代表需求已验证。由于两条完整 content 未写入长期文件，本节只保留可追溯 messageId、原文关键主张和执行输出引用；若需要离线逐字复核，须重新运行固定场景取得新的关联原文，不能从本次已清理的临时 profile 回读。

失败历史：初期 requiredSkillNames 空数组与正式角色接口冲突，已通过红绿测试允许空 Skill 并同步接口/设计；首次 Loader 缺少 `convivium` preset，已装配角色资产。早期探针按根 scope 监听子 Agent 工具，误判两位作者未提交；改从持久 Session `tool/call` 与 `tool/result` 配对。一次会议在无有效草稿时反复探索协议、使用 shell sleep/旧 Turn 路径，人工在运行外终止（该失败轮不计入 PASS，临时目录移入废纸篓可恢复）；后续将精确扁平字段、证据引用、正确审批/审核顺序与等待态写入固定角色指令。其他失败轮因缺少必填字段、过早 partial 或 JSON 非精确而 STOP，wrapper 均恢复隔离资源；最终 PASS 运行未进行会中代填或干预。

语义质量、模型估算可信度、真实商家用户价值仍为 Not Covered；两份推荐的分歧需人类评价，不作为产品实现依据。

## T12 交付收口与门禁

2026-09-15，源码边界为 T11 `0be1d0d` 加独立门禁阻塞修复 `db8714f`，在同一分支执行。第一次 `pnpm --dir plugin verify` 在容量级归档恢复测试的默认 5000 ms 超时失败（81/82 files、957/958 tests PASS）；单独 `pnpm --dir plugin exec vitest run tests/recovery/contribution-recovery.spec.ts` 再次在约 5.2 s 超时，诊断命令添加 `--testTimeout 20000` 后 7/7 PASS。`db8714f` 只给此容量用例 15000 ms 执行窗口，不改变输入、归档／恢复断言或字节上界；修复后的原定向命令 7/7 PASS，再运行固定 `pnpm --dir plugin verify` 退出码 0：format PASS、lint 0 errors／43 warnings、typecheck PASS、82 files／958 tests PASS、build PASS、environment／contract／9 roles／package PASS。诊断超时参数的结果不替代固定门禁。

固定文档门禁为 `node .github/scripts/check-doc-links.mjs`（删除前 636 个、删除后 617 个本地文件链接，均 0 errors，锚点未检查）、`git diff --check`（退出码 0）、临时文档指定的 `rg -n` 外部引用扫描（删除前仅临时文档自身匹配；删除后无匹配，退出码 1）。固定脚本完整字节备份后删除临时文档，并再次运行链接／diff 门禁；成功后清理临时备份，失败则保留备份并恢复原文。不得把文档改动误称为新的 Host/Browser 验收。V1～V14 的 Domain／Repository／Runtime／Client 反例由前序各步代码、测试和验证提交承接，V15 与 V16 的真实运行及消息原文关联在本文上方；完整原文只存在本次执行回执，临时 profile 已清理，离线逐字复核需要重跑。Browser 有人工 UI 操作及 Ctrl-C；真实模型最终通过轮 `interventions=0`，先前失焦轮由人在运行外停止且不计入通过。全部正式目标仍受 [Not Covered](./CURRENT-IMPLEMENTATION-COVERAGE.md#not-covered) 边界约束。

## 当前 smoke 脚本精简复验（2026-09-15）

源码边界：提交 `671b48d` 加未提交的 smoke 脚本删减工作区；下述结果不回写 T11 当时的 PASS。改动前、删减后及恢复原有 timeout 配置后分别执行 `CONVIVIUM_SMOKE_SCENARIO=parallel-contribution pnpm --dir plugin smoke:profile --json`，三轮均退出码 0、八项固定断言、`status=archived`、`meetingVersion=16`、`restore=PASS`，约 11.2 s、9.2 s 与 10.3 s；每轮使用新的隔离 profile 并清理。删去的旧 selector 在 Host 启动前被 selector 白名单拒绝，旧历史证据只保留在 Git 和历史 readiness。

改动后独立执行三次 `CONVIVIUM_SMOKE_SCENARIO=parallel-contribution-model pnpm --dir plugin smoke:profile --json`，均未达到固定六项 PASS：第一次 Product 提交并受审，但 Feasibility 未提交，Captain 过早 partial；第二次 final summary 引用了不可读取的 evidenceKey；第三次两位作者有提交，但 Product 把指定的 summary 提交为 proposal，最终无正式 summary。三轮都由原断言判 FAIL、退出码非零并清理隔离 profile；没有会中代填。第三轮的持久 Session 工具事件证实两位作者均实际工作，不属于只有协议探路的失焦运行。

复核差异时恢复了精简中不必删除的原有 `speakerTimeoutMs` 配置（speaker 60000 ms、Browser 5 min），随后只追加一次有界模型复验，退出码 0、`durationMs=95679`、`restore=PASS`。会议 `meeting-7ed854468fb502519eaff357a546a380` 由 `convivium-smoke-captain` 主持，两位模型作者分别提交正式 Product summary `message-contribution-abb4ac3b72ae4294143eca93558a0aa4-1` 与 Feasibility proposal `message-contribution-88888d8d4cf3d3aeaa83edf27b670803-1`；六项固定断言 `model-origin-submissions`、`boundary-before-publication`、`material-version-readable`、`review-not-self`、`structured-comparison`、`archive-verified` 均通过，`status=archived`、`archiveVerified=true`、`interventions=0`。该轮 profile 已清理，完整消息原文只在执行回执中。前三轮失败与最后一轮通过不能证明 timeout 配置与结果存在因果关系，也不能证明模型输出可重复稳定；模型讨论的结构路径已有本次 PASS，语义质量、真实商家用户价值与重复稳定性仍为 Not Covered。固定断言未放宽，没有继续无限模型重试。

## Prior Goal Discussion Trial

2026-09-14，用户授权以“设计基于 DSH 的开发助手，将模糊需求推进为可运行、可验收原型”为开放目标，在 `3a24ef0`、分支 `codex/project-goal-tests-and-direction` 的源码安装包上启动真实 DSH `0.1.2-rc.1` Web Host/Browser。预期比较至少两种方案，形成首版范围、取舍、风险和可执行验证实验，并经正式接受后 `completed`/归档。固定 Captain、Manager 和四位 Participant；用户仅在初始任务提交前手动选择 Browser 工作区，会中未追加纠错或结束操作。原证据提交为 `a4aee29`，逐分钟监视、Prompt 导出过程和修复工作区记录可从 Git 历史追溯。

实际 Meeting `meeting-d49f77fcd15a0c640f119b701c5af7a4` 共有 12 条正式消息，始终停留首议题；讨论多次转向 Convivium 内部实现，未形成完整方案比较或 MVP 取舍。Captain 自主以 `partial`/`captain_accepted` 结束，终态 version 15，没有 accepted decision；最后一次 status 工具返回 `INTERNAL_ERROR`、`Meeting recovery is unavailable`，归档成功未获回执确认。本次业务闭环验收 FAIL，不能由发言数量或 Captain 文本中的“已归档”推定完成。监视已停止，12 条正式消息及实际 Prompt 曾只读导出到忽略的本地工作区；相关源码主张未独立验证，原试验不证明当前最小并行切片或恢复能力。此试验触发的公共发言指导修复只有 4 文件/39 项定向测试、Host typecheck、lint、格式和文档链接证据，未在原会议重跑模型；详情见原提交历史。
