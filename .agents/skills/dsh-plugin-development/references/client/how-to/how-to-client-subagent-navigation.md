# 导航与控制子 Agent 会话

## Client 子 Agent 导航与控制

目标版本 `@deepseek-ai/dsh-agent@0.2.0-rc.2`；Web Profile 已装载 Session Controller、`uiWorkspace` 与目标插件。先读[子 Agent Client 词汇](../api/api-client-subagent.md)。

### 步骤

1. 从目标 Session 的投影/目录取得 `SubagentCatalogEntry` 或 `SubagentListEntry`。只把 `kind: 'child'` 转成导航目标；diagnostic 保留诊断展示。用经目标 Session Controller/Host 验证的直接父 ID、子 ID 和 mode 组成 `SubagentAddress`，不要凭 label 猜测身份。
2. 主视图调用 `ctx.uiWorkspace.openSession(address)`；若添加右栏入口，依右栏契约登记自己的资源类型或使用已加载 `ui-subagent` 的现有视图。`unknown` mode 需要读取子历史确认；`one-shot` 子会话为只读。
3. 给 `continuable` 子会话提交消息或停止时，优先用 Session Controller 绑定的 Session 对象：它路由到 `remote.subagents.prompt` / `interruptByParent`，并维护请求 ID、错误状态与附件限制。成功 receipt 只表示入箱或取消请求接纳；随后从 Session 状态/日志观察实际结果。
4. 验证父 Session 离线、非直接父地址、子会话已结束、`unknown` mode、图片和文件附件、`queue` 与 `steer`。文件附件不能直接送入子 Agent continuation；Remote 失败按 code 分支处理。

### 完成判据

导航始终指向正确父子地址；诊断项与只读会话不可误提交；成功确认与最终执行状态分开显示。静态类型存在不能证明 Host 继续/中断授权路径已通过真实 Profile 验证。
