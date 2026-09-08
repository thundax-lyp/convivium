# Credential records 与交互授权

本 reference 固定 `dsh-v0.1.2-rc.1`。`ctx.credentials` 有两个互不相交的 key space；`ctx.authorization` 是取得 record 的交互流程，不是 tool approval。组合与 secret reference 使用见 [凭证配置](composition-config-credentials.md#凭证所有权)。

## 条件补读

- UI 设置入口补[用户设置](user-settings.md)；普通 env reference 使用[凭证所有权](composition-config-credentials.md#凭证所有权)

## 两类地址和数据

| 地址                            | 数据与读取                                                                      | 写入与删除                                     |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| CredentialRef，POSIX 环境变量名 | resolve 返回非空 value/source 或 undefined；describe 只返回配置状态/来源/可写性 | set 非空值、unset；只读来源 shadow 时拒绝      |
| CredentialKey，`<scope>/<id>`   | readRecord；describeRecord；listRecords 只列 key/kind                           | modifyRecord 串行读改写；deleteRecord 单独删除 |

`credentialRef()` 验证环境变量名；`credentialKey(scope,id)` 的两段必须匹配 `[a-z][a-z0-9-]*`，scope 是拥有 payload 格式的插件，不是任意 vendor 名。`parseCredentialKey()` 恢复地址，scope/id helpers 读取已验证的 key。不要把 record key 交给 reference resolve。

Record 为 `api-key` 或 `grant`。ApiKeyRecord 的 key/env 都可缺省：仅 `{kind: 'api-key'}` 可表示 owner 已确认 ambient authentication，与没有 record 不同。GrantRecord.payload 是可 JSON round-trip 的 owner 私有数据，seam 不解释 token/expiry，也不替 owner 验证格式。只有 reference 半边把空 secret 解释为 absent。

modifyRecord 的 mutate 在锁内读取当前值并返回替代 record；返回 undefined 表示不写，不是删除。刷新令牌必须在此 read-decide-replace 边界内完成，不能先 readRecord 再无条件写。跨进程互斥取决于 backend；不要把普通 Storage domain 的单进程 queue 等同于它。

`credentials/reference-updated` 与 `credentials/record-updated` 分别在所属写入提交后通知。普通同步/异步 listener failure 被隔离；同步 INVARIANT 错误在所有 listener 执行后重抛，不表示已提交写入被回滚。Describe/list 安全视图不能携带 record payload。

## Flow 注册与调用

`ctx.authorization.registerFlow()` 注册一个 CredentialKey 的 flow，直接绑定调用 fiber；同 key 重复返回 DUPLICATE_FLOW。Flow 提供 label、非空有序 methods 和 async run。list/describe 返回方法与 inFlight；begin 接收 key、可选 method、request-owned interaction 和 signal。省略 method 选第一项，不支持的方法 UNKNOWN_METHOD，未注册 NO_FLOW，并发相同 key 为 ALREADY_IN_FLIGHT。

Interaction 随每次 begin 传入，不走 ambient answerer registry。notify 是不携带 secret 的单向进度；prompt 支持 text/secret/select，select 返回 option id，secret 只是展示遮蔽要求。Prompt 自有 signal 只撤回该问题；request signal 或 cancel(key) 撤回整个 attempt。不得让登录问题路由到另一页面或模型。

Flow 自己通过 credentials 提交 record 后才 resolve。服务必须在本次 attempt 观察到对应 record-updated，且结束后 record 仍存在，才报告 authorized；已有旧 record 或只 resolve 不写入均不能冒充成功，后者 NOT_COMMITTED。取消/拒绝返回 cancelled；其他 failure 抛错，事件观察者可见 failed settlement。释放 in-flight key 先于 authorization/settled，支持 listener 开始下一次尝试。

## 取消不等于远端撤销

取消可立即结束 attempt，即使 flow 不响应 signal；该失联 run 可能稍后仍提交 record。插件必须自行让协议请求与交互及时停止，不能宣称 cancel 已回滚 issuer 授权。注销 flow 也撤回正在运行的 attempt。

Attempt 不持久恢复。deleteRecord 只忘记本地数据，不向 issuer revoke；卸载 owner 后 record 可以成为 orphan，listRecords 的使用者应显示该状态，而不是把旧 record 当可重新授权的 flow。此 seam 不自带任何登录 flow，也不把登录进度写进模型上下文。

## 验证

覆盖 key grammar、两个 key space、空 api-key record、并发 refresh、只读 shadow、no-flow/unknown-method/in-flight、必须本次提交、拒绝与异常区别、取消后晚到写入、flow disposal、settlement 再入和安全视图不泄露 payload。
