# Example：由用户输入一次访问令牌

本例面向 DSH `0.2.0-rc.2` 的 Host 插件，注册一个由用户输入令牌的授权流程。它只演示 `AuthorizationSession` 的交互和提交契约；真实第三方授权协议须由对应插件实现。任务步骤见 [Host 凭据与授权](../how-to/how-to-host-credentials.md)，对象契约见 [Host 凭据与授权对象](../api/api-host-credentials.md)。

## 文件清单

```text
scratch-credentials/
├── src/manual-token.ts
└── cordis.yml
```

`scratch-credentials/src/manual-token.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'

export const name = 'manual-token-flow'
export const inject = ['authorization', 'credentials']

export function apply(ctx: Context): void {
  const key = credentialKey('manual-token-flow', 'access-token')

  ctx.authorization.registerFlow({
    key,
    label: '示例服务访问令牌',
    methods: [{ id: 'paste-token', label: '输入访问令牌' }],
    async run(session) {
      const token = (await session.prompt({
        kind: 'secret',
        message: '输入示例服务的访问令牌',
      })).trim()
      if (session.signal.aborted) throw session.signal.reason
      if (!token) throw new Error('访问令牌不能为空')
      await session.commit({ kind: 'api-key', key: token })
      session.notify({ message: '访问令牌已保存' })
    },
  })
}
```

`session.prompt` 的 `secret` 类型要求发起方界面遮蔽输入。插件不能把令牌写进通知、日志或异常。`session.commit` 经凭据 provider 落盘并通知授权服务；直接调用 `ctx.credentials.modifyRecord` 不满足本次 flow 的完成契约。注册句柄归当前 fiber，卸载时自动注销并取消在途尝试。

`scratch-credentials/cordis.yml`：把 `name` 改成当前 checkout 中该源码文件的绝对路径。运行前 Profile 必须有具体 `credentials` provider 和 `authorization` Service。

```yaml
- insert:
    - id: manual-token-flow
      name: '/absolute/path/to/deepseek-harness/scratch-credentials/src/manual-token.ts'
```

## 装载与验证

在目标 checkout 根目录运行 `pnpm dsh web --patch ./scratch-credentials/cordis.yml`。由支持授权流程的界面调用 `begin({ key, interaction, signal })`，确认 `list()` 能发现本 flow，输入非空令牌后结果为 `authorized`，`ctx.credentials.readRecord(key)` 返回 `api-key` 记录。取消输入、空值、provider 写入失败均不能产生成功结果。卸载插件后 `describe(key)` 不再返回该 flow；删除已存记录需要用户另行触发撤销。此例没有验证真实服务能接受该令牌。
