# DSH Client UI

本 reference 提供 `dsh-v0.1.1-rc.2` 的 Browser UI 插件集成模式。

## Client UI 插件

### Runtime 模型

Dynamic UI 包有两个入口。`src/index.ts` 是 Node Loader seat，通常导出空 `apply()`；`src/client/index.ts` 是通过 `./client` 导出的 browser plugin。Manifest 的 `dsh.client` 选择 web platform，并列出必须在该 browser plugin 之前 materialize 的 dynamic package。

UI 组合只能通过 `ctx.slots.register()`。必须注册到所属包已声明的 slot，不得重复声明。若所属包可能在本插件激活后才声明 slot，使用 `ctx.slots.inject(slotName, callback)`。Injection callback 与 slot registry 已拥有 contribution teardown，不要再包 `ctx.effect()`。Component 只接收 slot system 推导的 owner、child-slot、store 与 injection props；不得接收或发现 `ctx`。

### 包配置

下面是向 conversation attachment slot 提供 browser-only contribution 的最小 manifest。落入仓库时复制最近同类包的 release metadata，并把每个直接 DSH peer 镜像到 `devDependencies`。

```json
{
  "name": "@deepseek-ai/dsh-client-ui-attachment-badge",
  "description": "Browser presentation contribution for the conversation attachment slot",
  "version": "0.1.1-rc.2",
  "publishConfig": { "access": "public" },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./invariant": {
      "types": "./lib/types/invariant.d.ts",
      "default": "./lib/invariant.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "inject": ["@deepseek-ai/dsh-client-ui-conversation"],
      "platform": "web"
    }
  },
  "files": [
    "lib/index.js",
    "lib/invariant.js",
    "lib/client.js",
    "lib/types/**/*.d.ts"
  ],
  "license": "MIT",
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-ui-conversation": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-runtime": "workspace:^",
    "@deepseek-ai/dsh-client-ui-conversation": "workspace:^",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^",
    "@types/react": "~18.3.1",
    "react": "^18.2.0"
  }
}
```

使用 Client compiler face：

```json
{
  "extends": "../../../tsconfig.base.client.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/types"
  },
  "include": ["src"],
  "references": [
    { "path": "../../../vendor/cordis" },
    { "path": "../ui-slots" },
    { "path": "../runtime" },
    { "path": "../ui-conversation" },
    { "path": "../../runtime-diagnostics/invariants" }
  ]
}
```

包内 `tsdown.config.ts` 使用下面的准确模式，只替换包名：

```text
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-ui-attachment-badge', [
  'lib/types/index.js',
  'lib/types/invariant.js',
])
```

把 package reference 加入仓库 Client aggregate，不加入 Host aggregate。

### Host 与 browser 入口

Node half 有意保持 inert：

```text
/** Host Loader seat for the browser-only plugin. */
export function apply(): void {}
```

Browser half 导入 slot 所有者的 client face 以获得 declaration merge。真实 component 可替换 null component，而无需改变注册模式。

```ts ignore-check
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

const AttachmentBadge = (): null => null

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, AttachmentBadge))
}
```

若 contribution 拥有本地化文案，注册 typed locale namespace 与 dictionaries。若需要共享交互状态，创建一个 exported store factory，并通过 registration 的 `store` 字段传入 handle；render code 从 `props.useStore` 读取，通过 `props.actions` 写入。不得创建 module-global store handle。

### 聚焦生命周期测试

这个自包含 fixture 声明通常由 owner 提供的 slot，安装 browser plugin，并证明 fiber teardown 会移除 contribution。真实包测试中用 `../src/client/index.ts` 的 import 替换内联 `applyBadge`。

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describe, expect, it } from 'vitest'

const AttachmentBadge = (): null => null
const inject = ['slots']

function applyBadge(ctx: ClientContext): void {
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    locale: 'conversation',
  }, AttachmentBadge))
}

describe('attachment badge browser plugin', () => {
  it('registers after declaration and disappears with its fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.input.attachments': { kind: 'single', scope: 'session-maybe' },
      },
    } as never, () => null)

    const fiber = ctx.plugin({ inject: [...inject], apply: applyBadge })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.attachments')).toMatchObject([{
      locale: 'conversation',
      component: AttachmentBadge,
    }])

    await fiber.dispose()
    expect(ctx.slots.entries('conversation.input.attachments')).toHaveLength(0)
  })
})
```

先运行聚焦 client spec。任何改变 assembled browser 或可见输出的变更，还要运行 rc.2 GUI lane 与 web replay lane：先 `pnpm run test:gui`，再 `DSH_SNAPSHOT=replay pnpm run test:web`。
