# Typert Remote API

本 reference 提供 `dsh-v0.1.1-rc.2` 的生成式 Typert Remote API 集成模式。

## Typert Remote API

### Runtime 与生成物

Typert 无需手写 RPC schema，即可把选定 Host Service method 暴露给 Client。Host Service 继承 `TypertRemoteService`，调用 `super(ctx, serviceKey)`，并用 `@Remote` 或 `@Remote('wire-name')` 标注 concrete public instance method。Request/result type 必须 JSON-safe。可选最后参数可命名为 `signal` 并使用 global `AbortSignal`。Generator 会拒绝 generic、private、static、abstract、destructured、rest、defaulted 或其他非 concrete Remote method。

Host build 生成两个 package artifact：`./typert` 是 Host descriptor，`./remote` 是 Client contribution 与 declaration merge。应声明其 export 与发布路径，但绝不手工编辑生成内容。

### Service API 与配置

下面的完整 Host Service 带有已验证部署配置和一个可取消 direct Remote method。

```ts
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greetings: GreetingService
  }
}

export interface Config {
  prefix: string
}

export const Config: z<Config> = z.object({
  prefix: z.string().required(),
})

export interface GreetingRequest {
  readonly name: string
}

export interface GreetingResult {
  readonly text: string
}

export class GreetingService extends TypertRemoteService {
  static Config = Config

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'greetings')
  }

  @Remote
  async greet(request: GreetingRequest, signal: AbortSignal): Promise<GreetingResult> {
    signal.throwIfAborted()
    return { text: `${this.config.prefix}, ${request.name}` }
  }
}

export default GreetingService
```

Browser code 需要命名可复用 wire payload 时，把它们放进 client-safe `src/types.ts`。Host object parameter 需要 `TypertLookupMap` entry，把 live object 映射为 wire identity。Context-scoped method 还需要匹配的 `TypertContextMap` entry 与 `@RemoteScope(key)`；仅当 wire caller 应提供由 Host 解析为所属 live object 的 identity 时使用。

### Manifest 与 Client assembly

把生成的 export 与 artifact 加入普通 package manifest：

```json
{
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./types": {
      "types": "./lib/types/types.d.ts",
      "default": "./lib/types/types.js"
    },
    "./typert": {
      "types": "./lib/typert.host.d.ts",
      "default": "./lib/typert.host.js"
    },
    "./remote": {
      "types": "./lib/typert.remote-client.d.ts",
      "default": "./lib/typert.remote-client.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "lib/invariant.js",
    "lib/types/**/*.js",
    "lib/types/**/*.d.ts",
    "lib/typert.host.js",
    "lib/typert.host.d.ts",
    "lib/typert.remote-client.js",
    "lib/typert.remote-client.d.ts"
  ]
}
```

普通 manifest 还必须把 Cordis、`dsh-typert-protocol` 与每个 Service dependency 同时列入匹配的 peer/development dependencies；Service 有 `Config` 时 Schemastery 是 runtime dependency。TypeScript project reference 包含 protocol、Cordis、Schemastery、每个 source dependency 与 invariants。

仅生成 artifact 不会让 Remote method 可见；Client assembly 必须 import 并 mount 生成 contribution。在 shipped web 应用中，把它加入 API remotes browser entry 的 contribution list，并把所属包加入该 assembly 的 peer/development dependencies。Standalone Client assembly 使用下面的完整 mount plugin：

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import type {} from '@deepseek-ai/dsh-api-gateway/client'

export const inject = ['remote']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return ctx.remote.$mount(goalsRemote)
}
```

`@deepseek-ai/dsh-goal/remote` 是 rc.2 中可编译的实际 contribution；新包将它替换为自己生成的 `./remote`。Import 并 mount contribution 后才会提供 typed Remote namespace。Gateway 必须已存在，Host 组合必须安装对应 Service。缺少 mount 会使生成 namespace 不可用；缺少 Host Service 或 lookup 属于 composition failure，不得静默跳过。

### 聚焦 API 测试

测试 carrier 前先测试 business method 与 decorator metadata。下面的自包含形式可独立编译；真实包中从 package source import Service、`Config` 与 payload type，不要重复定义。

```ts
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it } from 'vitest'

interface TestConfig {
  prefix: string
}

const TestConfig: z<TestConfig> = z.object({
  prefix: z.string().required(),
})

class TestGreetingService extends TypertRemoteService {
  static Config = TestConfig

  constructor(ctx: Context, private readonly config: TestConfig) {
    super(ctx, 'testGreetings')
  }

  @Remote
  async greet(request: { readonly name: string }, signal: AbortSignal): Promise<{ readonly text: string }> {
    signal.throwIfAborted()
    return { text: `${this.config.prefix}, ${request.name}` }
  }
}

describe('Remote greeting service', () => {
  it('marks and runs the cancellable endpoint', async () => {
    const ctx = new Context()
    const service = new TestGreetingService(ctx, { prefix: 'Hello' })
    expect(remoteMethods(service)).toEqual([{
      method: 'greet',
      invocation: { kind: 'direct' },
    }])
    await expect(service.greet({ name: 'DSH' }, new AbortController().signal))
      .resolves.toEqual({ text: 'Hello, DSH' })
  })
})
```

随后运行拥有 Typert generation 的 Host build，typecheck Client face，并添加调用生成 Client namespace 的 Gateway/carrier 测试。Consumer test 必须 import 生成的 `./remote` declaration；没有 import 时，该 namespace 必须无法 typecheck。
