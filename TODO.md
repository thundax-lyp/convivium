# TODO List

## 说明

- `TODO.md` 只记录尚未关闭的任务和待决问题，不保存完成历史。
- 本批任务按 2026-09-14 本对话要求登记；最小实现范围与执行方案已确认，本次登记不授权产品实现、提交或外部运行。
- 以下任务按所列顺序执行；各步骤的允许文件、固定命令和 PASS/STOP 以依据文档为准，不由 TODO 扩大范围。
- “待讨论项”不是执行许可；形成明确结论后，才能拆成待审阅或当前任务。
- 已完成任务应在完成该任务的 commit 中删除；未提交时可同步工作区，但不能关闭未完成任务。

## 当前任务项

## 待审阅任务项

### 基础

### 协作闭环

- [ ] `DSH 投递`：Session adapter 与投递队列（T5b）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T5b。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现新 adapter、dispatcher 分支及按真实 Session 串行投递。
    - 验收点：同 Session 无重叠发送；不同 Session 独立；接收失败不 ack；前后授权检查通过。

- [ ] `会议工具`：工具装配与并行闭环（T5c）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T5c。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：注册贡献工具并接通事务、worker 和投递链路。
    - 验收点：A 研究未返回时 B 已收到任务并提交；迟到提交拒绝；重复发布幂等。

- [ ] `完成与终止`：完成判定与终止撤权（T6a）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T6a。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：将 required/支持依据门槛接入完成入口，并实现完成、预算和终止撤权顺序。
    - 验收点：目标满足优先 completed；不足且预算耗尽为 partial；终止原子失效在途任务。

- [ ] `议题推进`：按既定顺序推进议题（T6b）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T6b。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现议题切换、旧私稿处置和一次 Manager 通知。
    - 验收点：required 未闭合不切换；合法双议题按数组顺序推进；保留已公开待核验材料；终止优先。

- [ ] `暂停与超时`：暂停恢复与阶段超时（T6c）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T6c。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：接通阶段期限冻结、恢复授权、扫描和永久投递失败处置。
    - 验收点：阶段剩余时间与总预算口径一致；过期提交拒绝；失败进入 Captain 状态；无多余重投。

- [ ] `冷恢复`：一次性恢复授权（T6d）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T6d。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：接通真实 Session reconcile 后的贡献恢复及实例内防重。
    - 验收点：重复读取不重复增加 generation；paused 不重投；缺 parent 只读；lifecycle 临时分支移除。

- [ ] `归档`：归档引用与清理恢复（T6e）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T6e。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现公开贡献引用白名单，并接通终止至归档及 cleanup 重试。
    - 验收点：最大允许状态可在 commit 限额内归档；材料不复制；清理失败保持 archiving，恢复不重发。

- [ ] `会议创建与兼容`：切换新建并保留历史路径（T7）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T7。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：启用 reviewer 前置校验和新启动流程，接好恢复标记并迁移历史测试构造。
    - 验收点：非法新建零副作用；新路径无 Turn 事件；旧 ready receipt 原样重放；历史收尾与恢复通过。

### 交付验证

- [ ] `Remote 与 Client`：受控 Remote 与 typed client（T8a）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T8a。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现读取和控制 Remote 方法，生成契约并接 typed client。
    - 验收点：生成契约包含两个方法；本地不能代批准/核验；取消、权限和结果解析通过。

- [ ] `会议面板`：贡献详情与控制交互（T8b）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T8b。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现贡献列表、版本详情和本地控制表单。
    - 验收点：跨会议迟到响应不覆盖当前详情；按钮权限正确；新会议隐藏 Turn 操作，旧视图保持。

- [ ] `角色资源`：角色权限与 Scribe 闭环（T8c）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T8c。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：更新 Manager/Scribe 权限和版本，以及对应角色指导。
    - 验收点：定义校验通过；Scribe 经真实工具过滤提交纪要并由 Manager 批准；无额外 claims 或历史定义回写。

- [ ] `工程验证`：完整工程门禁（T9）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T9。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：运行已固定的 lint、plugin verify 和文档检查，并按原范围修复失败。
    - 验收点：全部规定门禁退出 0；无新增 skip、Schema 放宽或禁用 lint。

- [ ] `真实 DSH 与 Browser`：确定性 probe 与面板验收（T10）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T10。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：实现并运行指定真实 DSH 场景及 Browser 操作，记录证据和清理结果。
    - 验收点：并行、独立审核、精确版本、幂等与归档回读断言通过；Browser 控制正确；临时资源清理成功。

- [ ] `真实模型讨论`：固定业务讨论验收（T11）
    - 依据文档：[最小并行协作 RUNBOOK](docs/30-designs/RUNBOOK-MINIMAL-PARALLEL-COLLABORATION.md)，T11。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：运行固定议题的真实模型讨论，分别保存结构、调用回执和归档证据。
    - 验收点：规定 JSON 结构及系统回执通过；无人工代填；真实归档成立；语义质量仍标 Not Covered。

- [ ] `交付收口`：迁移证据并删除临时执行文档（T12）
    - 依据文档：[RUNBOOK Rules](docs/00-governance/RUNBOOK-RULES.md#completion-and-deletion)、[TODO Rules](docs/00-governance/TODO-RULES.md#closure-rules)、[Document Rules](docs/00-governance/DOCUMENT-RULES.md#document-lifecycle)。
    - 确认依据：2026-09-14 本对话确认方案并要求登记；待产品执行许可。
    - 处理动作：前序任务与固定门禁全部通过后，迁移长期结论和真实证据，按既定 T12 命令完成备份、引用核对、删除及失败恢复。
    - 验收点：前序已完成 TODO 已按规则清理，未覆盖项留在正式 readiness；完整门禁通过；临时文档删除后链接与 diff 检查通过；任何失败均恢复文档且不关闭本项。

## 待讨论项
