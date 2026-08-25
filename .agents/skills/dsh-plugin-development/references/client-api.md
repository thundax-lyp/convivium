# Client API 与双 program

## 真相来源

- Client package 总规则：[Client AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md)
- Slot 的官方实现和类型：[ui-slots](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-slots)
- Client runtime：[dsh-client-runtime README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/runtime/README.md)
- Conversation Node：[Adding a conversation node](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-conversation-node.md)
- GUI 测试分层：[GUI testing system](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/process/2026-07-20-gui-testing-system.md)

Slot 名称、kind、scope、props share 和 client service 以当前官方 `ui-slots` / client contract 类型为真相；本文件只保留决策规则，不维护静态 slot 清单。

## 双 program

双 program 是当前 DSH client/host 类型边界和 Convivium 工程布局的实现要求，不是所有 DSH 插件都必须复制的模板。host `tsconfig.json` 使用 Node 类型并排除 `src/client`；client `tsconfig.client.json` 使用 DOM/JSX，清除 Node 类型，显式包含 client 入口、事件类型和 CSS module 声明。先分别运行两个 `tsc`，不要用 `skipLibCheck` 掩盖 Context 合并冲突。

## Client 入口

client bundle 只依赖 DSH 暴露的 client runtime 和 UI contract。注册 controller、slot、listener、style、DOM 和 React root 时，都要绑定到 client fiber 的清理生命周期。按 `SessionId` 隔离状态，不能把 host 文件或会议数据库带入浏览器。

## Slots 与 Conversation Node

官方 client 只有一个 slot composition API：`ctx.slots.register({ name, children?, store?, inject? }, Component)`；slot 名称、kind、scope、children 认领和 renderer 形状必须从当前 client 包的类型声明取证。不要根据旧文档猜 slot 名，也不要直接导入宿主 UI 实现组件。

Conversation Node 的事件折叠必须确定性：同一事件序列在重放时得到同一节点，不读随机数、当前时间或当前磁盘状态；事件 owner、key 和跨 session 隔离需符合当前 DSH contract。

## 验证

Client 代码至少通过 client typecheck 和 bundle build。涉及 UI 行为时，应在独立 DSH Web profile 中验证名册、client 路由、DOM 探针和资源清理；单独启动 Vite 不能替代 DSH Web 运行验证。
