# Example：声明部署区域环境事实

本例针对 DSH `0.2.0-rc.2`，仅在 Agent 发起模型 Shell 调用时提供一个非秘密区域标识。对象见 [托管 Shell 环境](../api/api-host-shell-env.md)，步骤见 [Shell 环境 HOW-TO](../how-to/how-to-host-shell-env.md)。

## 文件清单

```text
scratch-shell-env/
├── src/region.ts
└── cordis.yml
```

`scratch-shell-env/src/region.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-shell-env'

export const name = 'deployment-region'
export const inject = ['shellEnv']

export function apply(ctx: Context): void {
  ctx.shellEnv.register({
    name: 'deployment-region',
    variables: {
      DSH_DEPLOYMENT_REGION: { description: '当前部署区域。' },
    },
    resolve: execution => execution.agent === undefined
      ? {}
      : { DSH_DEPLOYMENT_REGION: 'cn-north' },
  })
}
```

注册表随所属 fiber 卸载清理本贡献；`collect` 每次调用重新计算，Shell executor 才将其放进实际环境。示例值是部署标签，不应替换成密钥。

`scratch-shell-env/cordis.yml`：把路径改成当前 checkout 源码文件的绝对路径。Profile 还需装载 `shell-env` 与 bash 或 pwsh 工具。

```yaml
- insert:
    - id: deployment-region
      name: '/absolute/path/to/deepseek-harness/scratch-shell-env/src/region.ts'
```

## 装载与验证

在目标 checkout 根目录运行 `pnpm dsh web --patch ./scratch-shell-env/cordis.yml`。让 Agent 调用已装载的 Shell 工具并读取 `DSH_DEPLOYMENT_REGION`，应得到 `cn-north`；没有 Agent 的执行不应包含它。注册第二个声明同一 key 的插件应在装载时失败；卸载本插件后新调用不应再得到该变量。
