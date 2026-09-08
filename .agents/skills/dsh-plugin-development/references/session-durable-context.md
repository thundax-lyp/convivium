# Session event 与持久模型上下文

本 reference 覆盖 v0.1.2-rc.1 的 Session 扩展、回放所有权、prompt section、skill 和会进入模型上下文的 Agent 输入。

## 持久事实源

Session 是只追加的 typed event log，payload 必须是 lossless JSON。模型 conversation 从该日志派生，不存在另一份可变 history。核心 event 为 turn/step 划定边界，并保存 user message、assistant stream chunk、合成 assistant message、tool call/result 与 request header。

凡是进入模型 request 的内容都必须能从 Session log 重建。改变 rendered system prompt、tool schema、所选模型配置、injected context 或 Provider replay state 的功能，必须保存重建所需信息。Request header 记录该次请求的模型配置、rendered system prompt 和合成 tool schema。

不要写入 agent driver 所有的 lifecycle event。插件只拥有自己的 typed event 与由它派生的 projection。未知 event type 必须有明确的 ignorable 语义；不能假设 reader 会静默跳过。

## 日志读取与持久格式

`session.seq` 是日志长度和下一次追加位置，类型为 `SessionLogOffset`。`eventAt(SessionSeq(n))` 读取一个已有事件；`snapshotEvents(fromOffset, toExclusiveOffset)` 读取半开区间，完整当前 snapshot 在 append 前可复用。没有 `session.events` getter。不要把序号、偏移量、inclusive watermark（`SessionSeqCursor`，空值为 -1）混用，也不要由按需 snapshot API 推断日志已从内存卸载。

`Session.header.isSeeded` 表示继承关系，准确继承长度由 `session.inheritedEventCount` 和 body-bearing `SessionStorageMetadata` 携带。构造 fork 需要明确 seed 与 cut；只读自己的历史用 `ownEvents()`/`isOwnSeq()`。Persistence 的 `readFrom()` 返回带起始 offset 的 detached suffix，不能把它当完整 Session restore。

内置 Session persistence Provider 是 JSONL（默认 Zstd frame 编码，也支持 raw 配置，不能假定磁盘文件必为纯文本）；没有内置 SQLite Session persistence 包。这不影响独立 Storage domain 的 SQLite backend。未知 required event 或不支持的格式版本应明确拒绝，不要改写旧数据来掩盖 incompatibility。JSON value 与 snapshot/freeze helpers 由 `dsh-util-values` 拥有，不从 Session root 导入。

```ts
import type { Session } from '@deepseek-ai/dsh-session'
import { SessionSeq, SessionLogOffset } from '@deepseek-ai/dsh-session/types'

export function latestEvent(session: Session) {
  return session.seq === 0 ? undefined : session.eventAt(SessionSeq(session.seq - 1))
}

export function eventPrefix(session: Session, count: number) {
  return session.snapshotEvents(SessionLogOffset(0), SessionLogOffset(count))
}
```

Compaction 的逻辑可见性、TokenMeter revision、持久化 batching 与冷恢复见 [上下文压缩与恢复](context-recovery.md)。Append 可见、durable flush 和模型可见是三个不同边界。

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

Skill discovery、作用域优先级、调用策略和 catalog 的持久化由 [Skill Provider](skill-providers.md) 统一说明；不要从“可发现”推断模型或用户可调用。

排序使用 `ctx.systemPrompt.getSectionOrder(name)` 与 `getContextOrder(name)` 的所属分配表；已有分配名称不能随意换成魔法数字。新增类别在所属表中分配，并检查组装输出。

`agent/pre-step` 的 enter decision 可声明 `startsRequestSeries: true`，loop 会持久化新 `request/header`。Wrapper 改写 messages 时保留 `{ ...decision, messages }`，不能丢弃该字段。它开始新的模型消息序列，不等于新建 Session。

Section 按 order 升序、再按 name 的 code-unit 顺序排列；cooperative assembly 后若存在 effective `complete` section，它成为唯一 section；多个 effective complete section 会使 assembly 失败。Runtime-context 保存完整当前 snapshot；shipped loop 在内容变化或 compaction 移除旧 snapshot 后，把它记录在 retained model history 之后。Tool Provider 的 `knownNames` 是限制前的名称全集，用于区分配置拼写错误与当前作用域故意隐藏的已知工具。

## Reference 与辅助模型请求

FileReferenceCandidate 是 path-only discovery，不自动读取正文。SessionReferenceInput 的 id 是权威身份，label 只供展示；准备引用读取 current surface，保留可读消息，并至多返回一个聚合 context。引用内容以不可信材料进入 prompt，不把 UI mention 语法交给 agent core；invalid input、self-reference、source-read、budget 与 cancellation 用稳定错误码映射。

Session title Provider 是另一个模型输入 owner。共享 title LLM helper 在调用模型前记录已验证的 auxiliary request，即使随后生成失败仍可恢复其输入与来源。Provider 只能返回 request 所含的 source seq，服务校验顺序、规范化 title 和字节限制后持久追加。Title 的 whole-value projection 不代表 Goal 等其他 domain 可以忽略转换校验。

## Agent 输入选择

按调度意图选择：

| API                                 | 含义                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `agent.followup(message)`           | 为后续 turn 排入普通输入。                                       |
| `agent.steer(message)`              | 进入 next-step inbox；活动时在 step boundary 接受，idle 时唤醒。 |
| `agent.inject({ content, source })` | 添加持久 future-request context，但不唤醒 idle Agent。           |

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

Host 冷读的 observation 租约、Browser 固定 cut 分页与 Control stream 见 [Session 应用 API](session-workspace-api.md)。这些读取路径不能通过激活 Agent 或扫描整个列表来替代。
