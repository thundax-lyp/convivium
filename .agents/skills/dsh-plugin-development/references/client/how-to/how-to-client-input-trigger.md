# 向 Web 输入框添加候选源

## 注册一个 `/` 或 `@` 来源

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载输入触发管线、Conversation 与本包。先读[输入扩展契约](../api/api-client-interaction.md)和[词典契约](../api/api-client-services.md)。

### 实现步骤

1. 为来源选择 `trigger` (`/` 或 `@`) 与同 trigger 下唯一 `name`。定义候选的稳定 `name`、可本地化 `label` 和纯数据 `value`；来源通过注册时闭包持有自己的服务 ctx，回调只接收 `ClientSessionContext.sessionId`，不把 Cordis Context 或可变 Session 传入候选。
2. 实现 `candidates(session,req)`，查询变化或菜单关闭时停止异步工作；菜单 pick 由 `onPick(pick)` 返回输入管线支持的 `PickOutcome`。只有确实拥有空格/回车解析时实现 `matchSpace` 或 `matchEnter`，前者同步且只查热状态，后者必须尊重 signal 和附件 envelope。
3. 在 `./client` 的 `apply` 中调用 `ctx.inputTriggers.registerSource(source)`，把 disposer 放进 `ctx.effect`。必要的 `warm(session)` 只预取每个 Session 的候选，卸载/切换 Session 时释放相关请求。避免直接监听输入框 DOM 或抢占另一来源同名组。
4. 在真实 Web Profile 输入 trigger，检查候选、查询更新、drill/pick、取消、空格和回车路径。切换 Session 及卸载来源后菜单组应消失；重装载后不重复注册。

### 验证与完成边界

Client 类型检查覆盖 `InputTriggerSource`、`PickOutcome` 与 Session identity；行为测试覆盖异步候选取消、重复组、pick 和可选的空格/回车判定。只展示候选但不能插入/执行预期结果，不算任务完成。
