# Session event 与持久模型上下文

本 reference 覆盖 rc.2 的 Session 扩展、回放所有权、prompt section、skill 和会进入模型上下文的 Agent 输入。

## 持久事实源

Session 是只追加的 typed event log，payload 必须是 lossless JSON。模型 conversation 从该日志派生，不存在另一份可变 history。核心 event 为 turn/step 划定边界，并保存 user message、assistant stream chunk、合成 assistant message、tool call/result 与 request header。

凡是进入模型 request 的内容都必须能从 Session log 重建。改变 rendered system prompt、tool schema、所选模型配置、injected context 或 Provider replay state 的功能，必须保存重建所需信息。Request header 记录该次请求的模型配置、rendered system prompt 和合成 tool schema。

不要写入 agent driver 所有的 lifecycle event。插件只拥有自己的 typed event 与由它派生的 projection。未知 event type 必须有明确的 ignorable 语义；不能假设 reader 会静默跳过。

## 扩展 Session event

在拥有该事实的包中声明 event。Declaration merging 目标是 `@deepseek-ai/dsh-session/types`；导入 package root 可建立其 runtime event declaration。跨包 opaque id 使用 branded type。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-session'

type MyFeatureId = Branded<'MyFeatureId'>

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'my-feature/changed': {
      readonly id: MyFeatureId
      readonly enabled: boolean
    }
  }
}

export const name = 'my-feature-observer'

export function apply(ctx: Context): void {
  ctx.on('session/event', (_session, event) => {
    if (event.type !== 'my-feature/changed') return
    const { id, enabled } = event.data
    ctx.logger.debug('my feature changed', id, enabled)
  })
}
```

Append event 只是第一步。若存在对应 Consumer，还要同步更新 validation、persistence/load、replay fold、projection、UI/Remote exposure 以及 TypeScript/Python SDK output。保持 event 顺序与准确 JSON 字段；schema 或结构格式变化遵循 Session 所有者的版本规则。

## Prompt section、runtime context 与 skill

`ctx.systemPrompt.section()` 用于稳定的、scoped system instruction 或 catalog。`ctx.systemPrompt.context()` 用于每次 eligible assembly 都重新求值的有序动态上下文；在 shipped loop 中，它会成为模型历史里的 sourced runtime-context snapshot。两种 registry contribution 都绑定到调用 fiber，因此直接调用。不要用 section 冻结动态运行时事实，也不要用 context 承载本应保持前缀稳定的部署 instruction。相同日志、配置与已记录 runtime-context snapshot 必须重建相同的模型输入；rendered text 属于产品输出。

Skill Provider 提供 discovery summary 与完整 skill definition；skill tool 展示 catalog 并加载所选 body。Provider 的 filesystem/catalog 职责与模型选择/渲染职责保持分离。新的 skill 表面仍遵守持久规则：模型可见 summary、body 或 invocation effect 必须能通过 request/session 证据恢复。

## Agent 输入选择

按调度意图选择：

| API                                 | 含义                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `agent.followup(message)`           | 为后续 turn 排入普通输入。                             |
| `agent.steer(message)`              | 通过 Agent 的 interruption path 改变活动交互。         |
| `agent.inject({ content, source })` | 添加持久 future-request context，但不唤醒 idle Agent。 |

稳定 instruction text 使用 system-prompt section；每次 assembly 采样且由 shipped loop 持久化的运行时事实使用 system-prompt context；应作为 conversation message 出现的 event 使用 Session event 加 injection；tool call 中生成且只在结果提交后需要的信息使用 tool result 加 deferred context。异步 injector 必须处理 Agent disposal，且不得直接修改派生 message history。

## 回放与 projection 清单

实现每项新持久事实前回答：

1. 哪个包在什么生命周期点权威 append？
2. Payload 是否为 lossless JSON，opaque id 是否 branded，是否排除了 live handle？
3. 哪个 replay fold 或 projection 重建当前状态？
4. Reader 不认识该 event type 时如何处理？
5. 它是否改变模型输入？哪个组合 snapshot 证明？
6. 哪些 UI、Remote API、TypeScript SDK 与 Python SDK projection 变化？
7. 哪个 invariant 会在 live commit 和 load 时拒绝不可能的 event sequence？

测试合法 stream、边界处的无效 payload/顺序、persistence/load 与 replay equivalence。模型可见行为应断言从 log 生成的 request 或 transcript，而不只断言 append 调用。
