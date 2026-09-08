# Web ingress

本 reference 覆盖 `dsh-v0.1.2-rc.1` 的 Webhook runtime、GitHub adapter 和通用入站 HTTP 所有权。

## 条件补读

- 新协议 adapter 补[能力接缝](capability-seams-providers.md)及[组合测试](composition-config-credentials.md#组合测试步骤)

## Webhook 接收器

### Runtime 与 Provider

`ctx.webhookRuntime` 提供 `register(rule)` 与 `dispatch(delivery)`。Provider adapter 拥有 HTTP、认证、body limit 和解析；可信规则拥有业务条件与外部操作；runtime 拥有 callback 生命周期和可选的 Workspace root Session 创建。不要把签名验证成功等同于 event-specific 业务字段已经验证。

`VerifiedWebhookDelivery` 包含 kind、source、deliveryId、event 和 receivedAt；runtime 验证、分离并冻结 lossless JSON。`WebhookEventMap` 可按 Provider kind 扩展。`WebhookRule.run(delivery, signal)` 返回 `null` 或一份 `WebhookSessionRequest`；注册自动成为调用 fiber 的 effect，卸载先移除规则，再 abort/drain 活动调用。

`dispatch()` 调度匹配规则后立即返回，各规则失败相互隔离。它没有 durable queue、重试、去重、状态查询或完成结果。deliveryId 仅是 provenance；相同 delivery 可重复执行并创建多个 Session。需要可靠业务投递时，由独立 owner 实现持久化与幂等，不能用裸 event 或 dispatch 返回值冒充事务完成。

### 规则骨架

这个规则验证自身消费的字段并创建一个 root Session。部署配置明确指定 workspace 和两类 preset；实际接入时按业务 schema 收紧 Provider event。

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WebhookRuleId } from '@deepseek-ai/dsh-webhook'

export const name = 'webhook-task-rule'
export const inject = ['webhookRuntime']
export interface Config {
  workspacePath: string
  agentPreset: string
  permissionPreset: string
}
export const Config: z<Config> = z.object({
  workspacePath: z.string().required(),
  agentPreset: z.string().required(),
  permissionPreset: z.string().required(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.webhookRuntime.register({
    id: WebhookRuleId('task-rule'),
    kind: 'task-provider',
    run(delivery, signal) {
      signal.throwIfAborted()
      const event = delivery.event
      if (event === null || typeof event !== 'object' || Array.isArray(event)) return null
      if (typeof event.title !== 'string' || typeof event.prompt !== 'string') return null
      if (!event.title.trim() || !event.prompt.trim()) return null
      return { ...config, title: event.title, prompt: event.prompt }
    },
  })
}
```

Runtime 在 publication 前校验 preset、解析 canonical Workspace、创建并配置 Agent；先 attach Session，再应用 permission/title/prompt。初始消息记录 `source.kind: webhook` 及 provider/source/delivery/rule 信息。Inbox acceptance 是此创建操作的提交点，不等待 turn，也不特殊 flush。失败按所在提交阶段撤销 attach/Agent；并发可能使用的 Workspace 不随失败删除。

### GitHub 与其他 HTTP adapter

内置 `dsh-webhook-github` 注入 webServer、webhookRuntime、credentials。配置 source、exact path、secretEnv credential reference 和 maxBodyBytes；每次请求解析 secret，验证原始 JSON body 的签名后解析，内存 dispatch 成功即返回 202。规则完成与否不改变已经返回的 202；没有内置 replay protection。

其他 adapter 可用 `ctx.webServer.register()`，由 `ctx.effect()` 接管 route disposer。Handler 拥有 response 生命周期；自行限制 method、content type、body bytes，验证协议字段，决定 acknowledgement。外部协议要求 signature、timestamp 或 replay window 时按准确协议实施；无需凭证的协议不虚构 secret。挂载面向公网的 ingress 时，组合 owner 应明确路由与 Web UI/API 的暴露范围，不能因为挂载 webhook 就默认暴露整个应用。

## 必需证据

分别测试 route dispose、method/content type、过大 body、无效 JSON、签名/credential 轮换、业务字段校验、dispatch 后即响应、重复 delivery、规则失败隔离和 abort/drain。Session 创建覆盖 preset/Workspace preflight、attach 后失败与 inbox admission。用真实 Loader、port zero 与实际 HTTP 请求验证 adapter；不得用外部生产 webhook 作为默认测试。
