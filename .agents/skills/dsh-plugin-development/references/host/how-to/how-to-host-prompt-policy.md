# Host 提示词与工具策略任务

## 注册一个提示词段并限制工具执行

目标是为 Agent 提供有序模型指令，同时由 Host 的真实执行策略决定工具是否可运行。Profile 需装载 `systemPrompt` 与 `tools`；若询问人工批准，还需 `approval` 和处于已打开的 Agent turn。对象契约见 [SystemPrompt、ApprovalService 与工具事件](../api/api-host-prompt-policy.md)。

### 实现步骤

1. 插件声明所需 `inject`，用 `ctx.systemPrompt.section({ name, order, text })` 注册段落；若只限单个 Agent，从该 Agent 的 `ctx` 注册。段落和变量的名称在同一作用域保持唯一，disposer 随 fiber 释放。
2. 需要运行时变化且可重建的事实时，用 `ctx.systemPrompt.context()` 并让提供者从稳定配置或 Session 事实计算文本。提示词只影响模型认识，不能充当权限检查。
3. 对禁止条件用 `ctx.tools.guard(exec => reason | undefined)`；它在扩展的 `tools/pre-execute` 后执行，返回原因即拒绝。需要可询问或可取消的策略时，在 `tools/pre-execute` waterfall 中处理，并传递 `exec.signal`。只有 open turn 内才能调用 `ctx.approval.request`，且仅 `allowed-once` 可放行此次动作。
4. 在 `tools/result` 中只观察冻结结果。若要变换执行或结果，用相应 `tools/execute`、`tools/post-execute` 公开事件，并覆盖失败、取消和卸载。不要把日志观察器当作 veto 点。

### 验证与完成边界

检查一次 prompt assembly 中段落位置、作用域遮蔽与变量插值，再分别执行允许、拒绝、取消和无 answerer 的工具调用，核查没有未批准的主体执行。卸载插件后重新组装并调用，确认段落、guard 与监听器均消失。静态文本存在不证明实际策略生效；必须观察真实分发结果。
