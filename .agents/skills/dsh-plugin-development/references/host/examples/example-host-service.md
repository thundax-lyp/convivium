# Example：提供并消费 Host Service

本例针对 DSH `0.2.0-rc.2` 的源码 checkout。使用 `@deepseek-ai/cordis` 的公开 `Service`、`Context` 与 Loader patch。对象契约见 [Host Cordis 对象](../api/api-host-cordis.md)，执行顺序见 [Host Service HOW-TO](../how-to/how-to-host-service.md)。示例计数只在当前进程内存中存活；若业务需要跨重启的事实，须另加持久化。

## 文件清单

```text
scratch-service/
├── src/metrics.ts
├── src/consumer.ts
└── cordis.yml
```

`scratch-service/src/metrics.ts`：

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  private count = 0

  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(): number {
    return ++this.count
  }
}
```

`scratch-service/src/consumer.ts`：

```ts
import type { Context } from '@deepseek-ai/cordis'

interface MetricsApi { record(): number }

declare module '@deepseek-ai/cordis' {
  interface Context { metrics: MetricsApi }
}

export const name = 'metrics-consumer'
export const inject = ['metrics']

export function apply(ctx: Context): void {
  const metrics = ctx.metrics
  console.log(`[metrics-consumer] count=${metrics.record()}`)
}
```

Consumer 的 `MetricsApi` 声明合并给 `ctx.metrics` 提供消费侧契约；Provider 的 `MetricsService` 结构上实现 `record()`。运行时消费方通过 `inject` 等待服务。Provider 和 Consumer 没有计时器或外部连接，Cordis 自动清理服务注册与 Consumer fiber。该例没有可异步取消的工作。

`scratch-service/cordis.yml`：把两个 `name` 值改为当前 checkout 中对应源码文件的绝对路径。patch 的相对路径不决定 Loader 的模块解析基准。

```yaml
- insert:
    - id: metrics-provider
      name: '/absolute/path/to/deepseek-harness/scratch-service/src/metrics.ts'
    - id: metrics-consumer
      name: '/absolute/path/to/deepseek-harness/scratch-service/src/consumer.ts'
```

## 装载与验证

在目标 checkout 根目录运行：

```sh
pnpm dsh web --patch ./scratch-service/cordis.yml
```

启动日志应出现 `[metrics-consumer] count=1`。移除 provider 行并重启时，Consumer 不应再执行；重新加入 provider 后可再次观察一次调用。若只修改代码而不重启，可通过 Loader 的重载机制复验清理，但应以实际卸载后的服务不可访问和 Consumer 停止为判据。`count` 不持久化，重新激活时从零开始。独立 npm 包必须再验证其导出、peer 依赖、编译产物和 Profile bundle 安装，不能把这个本地 patch 当作可发布包。
