# Host 凭据与授权对象

适用 `@deepseek-ai/dsh-credentials` 与 `@deepseek-ai/dsh-authorization`，目标 DSH `0.2.0-rc.2`。凭据 Service 负责按名读取或持久存储秘密；Authorization Service 负责由人参与的获取流程。两者均需实际 provider 与 Profile 装载；仅有抽象服务包不产生具体密钥存储。任务路径见 [凭据与授权](../how-to/how-to-host-credentials.md)。

## CredentialRef

`credentialRef(name)` 生成环境变量式的 `CredentialRef`，询问某名称当前对应的密钥。helper 会校验名称，避免拼接未经验证的用户输入。

## CredentialKey

`credentialKey(scope, id)` 生成 `<插件>/<记录>` 形式的 `CredentialKey`，寻址一个 grant 或其他插件拥有的持久记录。它与 `CredentialRef` 是不同键空间，不能用一个来读取另一个。

## CredentialProvider

`ctx.credentials` 由具体 `CredentialProvider` 子类提供。`resolve(ref)` 每次操作重新取值，返回 `{ value, source }` 或 `undefined`；`describe(ref)` 只返回配置状态、来源与可写性，不泄漏值。`set(ref, nonEmptyValue)` 与 `unset(ref)` 写入/移除可写来源；存在只读来源遮蔽时拒绝，空值视为未配置。记录侧 `readRecord(key)` 返回完整记录，`describeRecord(key)` 与 `listRecords()` 不返回秘密；`modifyRecord(key, mutate)` 是按 key 串行的唯一记录写路径，适合 token 轮换；`deleteRecord(key)` 移除记录。调用方对秘密日志、异常与 UI 展示负责，不能把 `readRecord` 的 payload 当成公开 descriptor。

## AuthorizationFlow

`AuthorizationFlow` 声明它将写入的 `CredentialKey`、用户可见 `label`、非空且按优先顺序排列的 `methods`，以及 `run(session)`。取消或拒绝必须终止进行中的外部交互。

以下成员是该对象的公开契约：

- `key: CredentialKey`：本次授权流程关联的 CredentialKey，用于定位应更新的凭据。

## AuthorizationSession

`AuthorizationSession` 给出已选 method、取消 signal、`notify`、`prompt` 与 `commit(record)`。`run` 必须在返回前调用 `session.commit(record)`；该方法经 `ctx.credentials.modifyRecord` 写入目标 key，并让授权服务确认本次尝试已提交。直接调用 `ctx.credentials.modifyRecord` 不满足授权服务的提交确认。

## AuthorizationService

**公开导出**：`AuthorizationService` 来自 `@deepseek-ai/dsh-authorization`。
`ctx.authorization.registerFlow(flow)` 返回随 fiber 清理的 disposer；`list()`、`describe(key)` 供界面发现；`begin(request)` 发起一次尝试，request 携带目标 key、可选 method、发起界面的 `interaction` 及取消 signal。每个 key 同时只允许一次尝试；没有 flow、重复尝试或未提交记录均明确失败。`cancel(key)` 撤销在途尝试。交互对象随本次 request 传入，所以提示只到达发起方；插件不应把交互对象缓存在全局服务。
