# Client Fact Visibility Evidence

## Scope

执行日期：2026-09-07。范围为 Meetings 面板的正式事实展示、完整读取/替换、错误缓存恢复，以及本次真实 Browser 验证暴露的 smoke 清理问题。工作分支 `codex/client-fact-visibility-runbook`；作者基线 `1dd23b318f41531d02f7d03d3d543edef8259071`，首次执行前提交 `11a5270`。最终代码边界为 `0cb0193`，之后只迁移文档。续执行开始时工作区干净，没有纳入其他任务改动。

依据：[Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-10/FR-11、[Agent Meeting Protocol Interface](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)、[Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md) 的 Client fact visibility。

## Validated Contract

| 验证项 | 实际结果 |
| --- | --- |
| V1：决策集合 | 12 种 status 的合法非空 DTO 经 HTTP JSON/Schema/实际 panel DOM 展示；accepted 集合与完整 history 分开，身份、状态、替代关系和 optional 缺失被验证。 |
| V2：Parking Lot | pending/promoted/parked/rejected 四种处置顺序保留；空数组显示固定提示。 |
| V3：风险与归档 | 活动/执行终态 risks 与 archiving/archived issues 保留 title、description、status、disposition、rationale、owner、任务；归档 waiting issue 不丢失。 |
| V4：公开原因 | 当前 intent/reason/objective 可见；无 currentTurn 的执行终态和归档不保留旧 Turn；既有 waiting/pause/termination 展示保持。 |
| V5：完整替换 | `refreshFactStatus` 固定不同 v2/v5/v6 集合；focus 和 5000ms poll 均验证逐区完整 ID、逐条字段、撤销/更新/删除，并在卸载重开后保持归档集合；输入 JSON 未被修改。 |
| V6：非法输入/恢复 | 分别只删除 decisionHistory、parkingLot、archive.package.issues；原 DTO Schema 成功、异常 DTO Schema 失败且 envelope version 一致。三个用例均保留三事实区缓存，先填 Pause reason 确认原按钮可用，再确认错误时 disabled，最后 focus 恢复合法 v6 并清除 alert。 |
| V7：只读边界 | 新区域无写控件；终态无原有写控制；文本包含 HTML 时不创建 img；没有新增后端入口、身份或权限。 |
| V8：完整验证/真实组合 | 下述 verify、真实 Browser 空态与自动 Restore 全部通过。 |
| V9：文档收口 | 稳定映射与错误恢复结论迁入 Implementation Design；操作注意事项迁入 DSH Smoke；删除前后相对链接、残留引用和 diff 检查通过。 |

## Executed Validation

### 自动验证

| 命令 | 结果与边界 |
| --- | --- |
| `pnpm --dir plugin exec prettier src/client/meeting-panel-view.tsx src/client/meeting-panel-sections.tsx tests/client/client-entry.client.spec.ts --write` | exit 0；Client 文件已符合格式。 |
| `pnpm --dir plugin exec vitest run --project client tests/client/client-entry.client.spec.ts` | exit 0；40 tests，通过后形成 `5b7a760`。 |
| `pnpm --dir plugin exec vitest run --project host tests/unit/scripts/smoke-profile.spec.ts` | exit 0；26 tests，包含真实子进程 SIGINT 后在清理期间再收到 SIGTERM，仍打印 cleanup 标记并正常退出。 |
| `pnpm --dir plugin verify` | 最终代码验证开始于 13:07:44；exit 0；74 test files、608 tests 全通过。format、lint、Host/Client typecheck、build、environment、contract、9 个 Agent Definition 样本、package 均通过。执行时为 `5b7a760` 加最终 smoke 修复工作区，该代码随后原样提交为 `0cb0193`。 |
| `git diff --check` 与文档相对链接检查 | exit 0；删除前后执行。 |

构建保留既有 `INEFFECTIVE_DYNAMIC_IMPORT` 提示：jsonl 同时静态与动态导入，不会形成独立 chunk；未导致 build/verify 失败。

### 真实 Browser Prepare / Execute / Assert / Restore

使用 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md) 的现有确定性入口：

```sh
env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

最终运行分配 PTY，wrapper 工具 session 为 `2581`。13:09 的 ready 输出：`ok=true`、`profile=web`、`provider=spawn`、`scenario=reassign`、`browserReady=true`、assertions 为 `[browser-reassign-ready]`；meeting ID 为 `meeting-d99cf43fc6f1029c56eff81fcf5958cb`，Captain 为 `convivium-smoke-captain`，speaker 为 `participant-a`，old/current attempt 同为 `turn-1-attempt-0`，version 为 2。唯一 URL 为 `http://127.0.0.1:64067`；唯一临时根由该轮 marker 记录，basename 为 `convivium-dsh-smoke-Z0mTKv`（完整机器路径保存在本次工具记录，不写入仓库）。

实际通过 CUA 选择 workspace 下的 Session 行、Meetings tab、Runtime smoke (running)。Session 行显示“新会话”，已加载会话内容和标题为 `Browser reassign evidence session`；该文本由现有 reassign probe 写入 Captain 后附加到 workspace，未猜测或修改导航。UI 显示 intent=`explore`、reason=`explore`、objective=`Reassign A to B`；首次和刷新重选后的同一 loopback GET 均返回相同 version 和三字段，reason 逐字一致。

两轮 DOM 快照显示 `No accepted decisions.`、`No decision history.`、`No parking lot items.`、`No risks.`；新增区域没有按钮/输入框，原有 Pause/Skip/End 在原因为空时 disabled。真实截图记录了 Current activity 和四个空态区；页面无框架错误覆盖层，读取 Browser console warn/error 均返回 `[]`。刷新后重新选择 Session/view/Meeting，再次完成同样断言。未点击会议写按钮，未调用模型。

最后关闭本次 tab，向同一 PTY 发送一次 Ctrl-C，返回 **exit 0** 且输出 **`CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`**。随后对 marker 的精确路径执行存在性检查，结果 `TEMP_REMOVED`、exit 0；TCP 64067 连接被拒绝，输出 `PORT_RELEASED`。最终成功运行没有手动删除临时根。

### 清理失败及修正记录

先前运行的 basename `convivium-dsh-smoke-9T3aNR`、`convivium-dsh-smoke-1jWe2I`、`convivium-dsh-smoke-BuP8g3` 未取得 cleanup marker，不能作为 Restore PASS；首个目录曾被手动删除，原错误 T5 收口由 `aa95416` 恢复。首轮 PTY 复现 `convivium-dsh-smoke-6WFvTW` 同样遗留目录，因此只分配 PTY 不足以修复。

`waitForBrowserStop` 原先在首个终止信号后立即移除两个 handler，使重复转发信号能在 finally 期间结束进程。改为保留 handler 至 CLI 退出，真实子进程回归与最后一轮完整 smoke 均通过。修改不涉及会议状态、profile 组合、selector 或凭据。失败轮保留其失败结论，不用最终通过覆盖历史。

## Not Covered

- 非空 Decision history、Parking Lot、archived issues 只有 Schema/component/HTTP mock 消费链证据；真实 Browser 使用现有空 fixture，未覆盖非空端到端链路。
- 未触发真实模型、真实降级/收敛；仅展示后端公开字段，不验证内部推理过程。
- 页面 reopen 不等于 Host 冷恢复；本轮未新增 Host restart、压力、远程、多用户或发布验证。
- 本次只读展示不新增 command/事务，因此 stale 写、幂等重放、事务回滚、receipt/outbox 的新增专项验证为 Not Applicable；原有 suite 保留并由 verify 通过。

## Closure

T0–T4 实现与后续纠正保留在分支历史。续执行补齐不同事实刷新测试的提交为 `5b7a760`；T5 清理修复、完整验证与删除步骤的提交为 `0cb0193`。本证据与设计迁移的提交完成 T6，并删除临时 RUNBOOK。共享 coverage 的全项目整合不在此任务内，本证据不宣称整个 FR-10/FR-11 或项目已完成。
