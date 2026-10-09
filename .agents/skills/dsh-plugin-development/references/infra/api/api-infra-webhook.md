# Webhook 规则契约

## WebhookRuntime

**公开导出**：`WebhookRuntime` 来自 `@deepseek-ai/dsh-webhook`。
`@deepseek-ai/dsh-webhook` 的默认插件挂载 Host 服务 `ctx.webhookRuntime`。`register<K>(rule: WebhookRule<K>): () => Promise<void>` 创建 effect 所属的规则注册；返回 disposer 先隐藏规则，再中止并等待其运行中的回调。重复 id、空 id 或缺少 `run` 会在注册时拒绝。`dispatch` 面向已认证的适配器输入；规则作者不应直接把未认证 HTTP body 交给它。

## WebhookRule

`WebhookRule` 的 `id` 是 `WebhookRuleId`，`kind` 选择 provider family，`run(delivery, signal)` 返回 `WebhookSessionRequest | null`，也可返回 Promise。规则必须观察 `signal`，因为卸载需要等待回调结算；同级规则之间失败隔离。

## VerifiedWebhookDelivery

`VerifiedWebhookDelivery` 包含 `kind`、`source`、`deliveryId`、无损 JSON `event` 和 `receivedAt`；运行时在共享前快照并冻结它。`deliveryId` 是来源信息而非内建去重键；规则需要重试安全时自行存储交付处理状态。

## WebhookSessionRequest

**公开导出**：`WebhookSessionRequest` 来自 `@deepseek-ai/dsh-webhook`。
必填 `workspacePath`、`title`、非空 `prompt`、`agentPreset`、`permissionPreset`；可选 `model` 包含 `provider`、`model`、`maxTokens?`。返回 `null` 表示本交付不启动会话。运行时先验证 preset、准备 Workspace 与 Agent，再调用 `followup`；提交成功后由普通会话生命周期接管，不等待 Agent idle 或返回答案。

模型可见的初始消息来自规则 `prompt`。外部事件字段可能不可信，应在提示词中明确其为数据。通用运行时不保存去重状态、队列或重试：重复交付可能再次启动会话，崩溃前尚未接纳的消息可丢失。

## 入口与失败边界

规则插件需注入 `webhookRuntime`，并用自己的 `ctx.effect` 持有注册 disposer。provider adapter 的签名验证、body 大小、HTTP 路径与密钥配置属适配器；目标版本随附 GitHub 适配器。将入站端口与主 Web UI 分隔时，可在 isolated `webServer` group 装载独立入口。HTTP 接受只说明适配器接纳请求，不等于规则完成或 Agent 输出已产生。

## Config

**公开导出**：`Config` 来自 `@deepseek-ai/dsh-webhook-github`。
`@deepseek-ai/dsh-webhook-github` 的公开插件配置要求 `source`、`path`、`secretEnv` 和 `maxBodyBytes`。`path` 是无尾斜杠的非根精确路径；`secretEnv` 指向密钥所在环境变量，适配器每次请求重新解析，支持轮换。适配器只接受 `POST application/json`，先限制 body、验证 `X-Hub-Signature-256`，再解析 JSON；有效入站返回 202，含义只是内存分发。无效方法、媒体、body、签名或运行时分别产生相应 4xx/503，规则未匹配和 Agent 未完成不改变 202 的含义。

对象证据：`packages/webhook/webhook/src/index.ts`、`packages/webhook/webhook/src/types.ts`、`packages/webhook/webhook/tests/loader-composition.spec.ts`、`apps/cli/config/examples/github-review/`。操作见[Webhook HOW-TO](../how-to/how-to-infra-webhook.md#让可信外部事件创建一次-agent-会话)。
