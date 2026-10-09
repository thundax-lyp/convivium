# 子 Agent 的 Client 投影、地址与控制词汇

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。`@deepseek-ai/dsh-subagent/client` 是 type-only 子路径，供浏览器安全读取目录、投影与控制请求类型；Host 的 provider/委派实现仍由该包根入口负责。目标内置 Client 通过 Session Controller 和 `ui-subagent` 组合这些类型，不把类型导出当作已经加载的 UI 服务。

## `SubagentAddress`

**公开导出**：`SubagentAddress` 来自 `@deepseek-ai/dsh-subagent/client`。
`parentSessionId`、`childSessionId` 与 `mode` 共同构成持久直接父子地址。`mode` 是 `one-shot`、`continuable` 或 `unknown`；`unknown` 要待读取子历史确定。`ctx.uiWorkspace.openSession(address)` 可导航到该子会话；目标 `ui-subagent` 也把地址编码进 `dsh-resource://subagentchat/...` 右栏资源。不要只用 child ID 推断父级授权。证据：`packages/subagent/subagent/src/control-types.ts`、`packages/client/ui-subagent/src/client/{index.ts,sidebar-chat/index.tsx}`。

## `SubagentCatalogEntry`

**公开导出**：`SubagentCatalogEntry` 来自 `@deepseek-ai/dsh-subagent/client`。
父 Session 投影中的一个直接子项：`id`、`createdAt`、`mode` 和可选或必需的 `label`。`continuable` 必有标签；`one-shot` 与 `unknown` 可缺省。此项是持久目录事实，不表示子会话当前运行或可继续。证据：`packages/subagent/subagent/src/projection-types.ts`。

## `SubagentCatalogRow`

**公开导出**：`SubagentCatalogRow` 来自 `@deepseek-ai/dsh-subagent/client`。
递归目录的子项，含 `id`、`activity`、`mode` 与对应标签。`activity: 'running'|'inactive'` 只表示本次列表观察到的 resident 状态，不保证后续控制请求可送达。证据：`packages/subagent/subagent/src/control-types.ts`。

`label` 在 `one-shot` 行可为 `undefined`，在 `continuable` 行必填；展示组件须按 `mode` 收窄，不能把标签缺省当作目录损坏。

## `SubagentListEntry`

**公开导出**：`SubagentListEntry` 来自 `@deepseek-ai/dsh-subagent/client`。
目录结果可为 `kind: 'child'` 或 `kind: 'diagnostic'`。diagnostic 的 `reason` 有 `corrupt`、`unsupported`、`unavailable`；不能把诊断项当作可导航的有效子会话。证据：`packages/subagent/subagent/src/control-types.ts`。

## `SubagentIdentityProjection`

**公开导出**：`SubagentIdentityProjection` 来自 `@deepseek-ai/dsh-subagent/client`。
子 Session 描述符折叠得出的 `mode`、`label` 与来源 `seq`；`continuable` 必有标签。`seq` 用于证明描述符来自子 Session 自有日志后缀，不能把 fork 继承的旧描述符当作当前身份。证据：`packages/subagent/subagent/src/projection-types.ts`。

## `SubagentTimingProjection`

**公开导出**：`SubagentTimingProjection` 来自 `@deepseek-ai/dsh-subagent/client`。
`settledMs` 是已闭合轮次累计时间；`active` 是尚未到 `turn/end` 的当前区间；`lastTurnCompleted` 在开放轮次或首轮结束前可缺省。UI 应区分运行、已完成与尚无结论，不按 elapsed 时间臆断成功。证据：`packages/subagent/subagent/src/projection-types.ts`。

## `SubagentPromptRequest`

**公开导出**：`SubagentPromptRequest` 来自 `@deepseek-ai/dsh-subagent/client`。
控制请求含 `requestId`、直接父子地址、`mode: 'continuable'`、`delivery: 'queue'|'steer'`、`content` 与可选 `clientTimeZone`。Host `subagents.prompt` 接受后返回 `SubagentPromptReceipt.messageId`，这只确认消息入箱，不保证之后执行完成。目标普通 Client 通过 Session Controller 的 prompt 方法间接调用它；该路径会拒绝 file parts，并处理请求 ID、图片入库与错误状态。直接 Remote 调用须自行保持同等身份和失败处理。证据：`packages/subagent/subagent/src/{control-types.ts,index.ts}`、`packages/api/session-controller/src/client/sessions/session.ts`。

`parentSessionId` 与 `childSessionId` 是一起提交的直接父子地址，Host 会核查该父会话是否拥有子会话；只持有子 ID 不构成继续或中断的权限。

## `SubagentPromptReceipt`

**公开导出**：`SubagentPromptReceipt` 来自 `@deepseek-ai/dsh-subagent/client`。
`messageId` 是已接受消息的 inbox 身份，不是已完成轮次的证明。证据：`packages/subagent/subagent/src/control-types.ts`。

## `SubagentInterruptReceipt`

**公开导出**：`SubagentInterruptReceipt` 来自 `@deepseek-ai/dsh-subagent/client`。
`accepted: true` 仅表示停止请求被接纳，不表示目标已静止。目标 Session Controller 对子地址调用 `subagents.interruptByParent`；父地址授权仍由 Host 核查。证据：`packages/subagent/subagent/src/{control-types.ts,index.ts}`。

## 分侧边界

`./client` 不导出可加载的 Client 插件或值方法；它是安全类型词汇。`ui-subagent` 提供产品目录/只读 composer/右栏视图，`ui-workspace` 处理导航；持续会话提交与取消由 Session Controller 包装 `remote.subagents`。步骤见[导航与控制子 Agent](../how-to/how-to-client-subagent-navigation.md)。
