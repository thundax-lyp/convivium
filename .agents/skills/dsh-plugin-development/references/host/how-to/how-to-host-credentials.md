# Host 凭据与授权任务

## 保存插件凭据并注册授权流程

目标是让插件按自己的 key 保存可轮换的秘密，并在必须由人参与时向当前交互界面提供授权 flow。Profile 需装载具体 `credentials` provider；授权路径还需装载 `authorization`。对象契约见 [CredentialProvider 与 AuthorizationService](../api/api-host-credentials.md)。

### 实现步骤

1. 固定密钥使用 `credentialRef` 和 `ctx.credentials.resolve`，每次实际请求重新解析；UI 状态用 `describe`，不读取值。登录 grant 使用 `credentialKey(插件名, 记录名)`，经 `readRecord` 读取，经 `modifyRecord` 串行写入或轮换。
2. 需要人机交互时，插件声明 `inject = ['authorization', 'credentials']`，通过 `registerFlow` 注册同一个 key、非空 method 列表与 `run(session)`。flow 内只把通知和问题交给 `session.notify` / `session.prompt`，网络工作观察 `session.signal`。完整骨架见 [手工令牌示例](../examples/example-host-credentials.md)。
3. 在 `run` 返回前调用 `session.commit(record)` 提交对应的凭据记录；直接写 `ctx.credentials` 无法让授权服务确认本次提交。界面调用 `begin({ key, interaction, signal })`，交互对象由发起方提供，不能由插件假设一定存在浏览器。
4. 卸载插件时注销 flow 并取消在途尝试。删除授权记录与注销 flow 不同；用户要求撤销秘密时再调用 `deleteRecord` 或 `unset`。

### 验证与完成边界

用脚本化 interaction 测试成功提交、用户拒绝、signal 取消、重复尝试、未提交和 provider 写失败；检查 describe/list 不泄漏值。再在真实 UI 中验证 prompt 只到达发起页面。静态注册通过不证明真实 OAuth 或外部 provider 协议完成。
