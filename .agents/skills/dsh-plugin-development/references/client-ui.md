# DSH Client UI

本文提供 `dsh-v0.1.2-rc.1` 的 Browser UI 插件集成模式。

**阅读导航：** 新建 UI 插件从 Runtime 模型、包配置读到 Host 与 browser 入口；已有 UI 行为修改先读[数据与呈现所有权](#数据与呈现所有权)、[按 key 订阅](#按-key-订阅)和[Slots 与产品服务](#slots模块交付与产品服务)。涉及 slot 注册时同时读 Runtime 模型的 activation/teardown 规则。两条路径最后都核对[生命周期测试](#聚焦生命周期测试)；无需为局部行为修改复制整套包骨架。

仅选择或复用标准控件、浮层、图标或输出 renderer 时，直接读 [UI Primitives](client-ui-primitives.md) 的选型、调用方职责与验证指导；涉及插件集成变化时再按上面的路径补读。

## 条件补读

- 设置卡片补[用户设置](user-settings.md)；会话行读[Conversation Node](client-conversation-nodes.md)，不自行扫描日志造第二份状态

## Client UI 插件

### Runtime 模型

Dynamic UI 包有两个入口。`src/index.ts` 是 Node Loader seat，通常导出空 `apply()`；`src/client/index.ts` 是通过 `./client` 导出的 browser plugin。Manifest 的 `dsh.client` 选择 web platform，记录 informational package dependency edges；`dsh.client.inject` 不决定 activation 顺序。真正的激活依赖由 Cordis service inject 控制，module external 则决定同步模块加载顺序。

UI 组合只能通过 `ctx.slots.register()`。必须注册到所属包已声明的 slot，不得重复声明。若所属包可能在本插件激活后才声明 slot，使用 `ctx.slots.inject(slotName, callback)`。Injection callback 与 slot registry 已拥有 contribution teardown，不要再包 `ctx.effect()`。Component 只接收 slot system 推导的 owner、child-slot、store 与 injection props；不得接收或发现 `ctx`。

### 包配置

下面是向 conversation attachment slot 提供 browser-only contribution 的最小 manifest。落入仓库时复制最近同类包的 release metadata，保留 Cordis 的 peer/dev 配对，Browser/type-only DSH 依赖按 Client policy 放 devDependencies。

```json
{
  "name": "@deepseek-ai/dsh-client-ui-attachment-badge",
  "description": "Browser presentation contribution for the conversation attachment slot",
  "version": "0.1.2-rc.1",
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
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
      "inject": [
        "@deepseek-ai/dsh-client-ui-conversation"
      ],
      "platform": "web"
    }
  },
  "files": [
    "lib/index.js",
    "lib/client.js",
    "lib/types/**/*.d.ts"
  ],
  "license": "MIT",
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-client-ui-conversation": "workspace:^",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:^",
    "@types/react": "~18.3.1",
    "react": "^18.2.0",
    "@deepseek-ai/dsh-client-ui-renderer": "workspace:^"
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
    { "path": "../ui-renderer" },
    { "path": "../ui-conversation" }
  ]
}
```

包内 `tsdown.config.ts` 使用下面的准确模式，只替换包名：

```text
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-ui-attachment-badge', [
  'lib/types/index.js',
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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
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

### 数据与呈现所有权

Session/Workspace 数据由 API controller 的 Client model 拥有，连接由 connection 拥有；React-free snapshot store 引擎在 client/store，registry 的纯核心在 ui-slots，Cordis SlotRegistry 和 hook 绑定在 ui-renderer。不要重新依赖旧 client/runtime 总入口。

Store 保存跨入口的查看/交互状态，不复制 Session 业务事实。外部变化进入 render 时必须通过框架 hook；private observable 放进 inject 的 hooks compartment，由 renderer 绑定，组件不自行创建订阅。Observable source 与未变化 snapshot 的引用都应稳定。

第三方语言通过 locale 的 `addLanguage()` 与对应 typed dictionary 注册；它返回未托管 disposer，应交给调用插件 effect。产品文案经过 typed locale/t seat，不能在 component 内写 fallback 文案。UI feature 插件之间不 value-import component/helper，不用 external 绕过；运行时协作通过 Service，UI 通过 slot。

### 按 key 订阅

除了固定 `hooks`，entry inject 可提供 `keyedHooks`：稳定的 key-to-observable resolver。Renderer 将它变成 `use<Name>(key, selector?, equal?)`；源缺失时 value 是 undefined，selector 必须处理。每个目标由 owner 提供 snapshot/subscribe，组件不要为了方便复制完整 Session map 或在每次 render 新建 resolver。

这与 slot-level contextual hook 不同：后者从本次 render occurrence 的框架 props 取得上下文。声明、inject 和 component props 使用各自派生类型，不能把两种 hook 约定混在一个手写 props 接口里。

### 聚焦生命周期测试

这个自包含 fixture 声明通常由 owner 提供的 slot，安装 browser plugin，并证明 fiber teardown 会移除 contribution。真实包测试中用 `../src/client/index.ts` 的 import 替换内联 `applyBadge`。

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
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
    await ctx.fiber.dispose()
  })
})
```

Host 与 Client code fence 分别用对应 compiler face 验证；这里的 `ignore-check` 仅避开上游 Host-only 文档 checker，发布时仍须单独编译这些 Client 示例。先运行聚焦 client spec。在 DSH monorepo 内，任何改变 assembled browser 或可见输出的变更，还要运行 v0.1.2-rc.1 GUI lane 与 web replay lane：先 `pnpm run test:gui`，再 `DSH_SNAPSHOT=replay pnpm run test:web`。独立插件按[验证命令矩阵](testing-docs.md#验证命令矩阵)映射到自己的 Client 测试与真实 Profile 中的浏览器组合证据，不直接套用上游命令。

## Slots、模块交付与产品服务

Slot kinds 为 single/list/keyed/chain；chain 必须 select，undeclared registration、重复 child declaration 和同一个 store handle 跨 scope 挂载会失败。Disposer 递归拆掉 child slots、contributions 与 store mounts。四份 props（runtime、children、store、business inject）使用 ComposedProps 推导，不手写伪接口。

Host clientModules 提供 immutable /plugins artifact，Browser modules 表由 frozen PLATFORM_MODULES 加 exact external requests 组成；missing/self/cyclic synchronous imports 在组合期拒绝。Combo URL 共享 in-flight script，factory 注册不等于 body 已执行，body 首次 import 才物化。Source launch 仍需 built lib/client.js；HMR 拥有 invalidate/style removal/fiber teardown，module loader 不自行卸载。Host 持有 bundle/map/combo 及一代 prior startup bytes，不能推断按需服务零内存。

uiRenderer.mount 等全部 client entries ready 后 hydrate/mount root，并返回 React root disposer。没有 per-entry Suspense/lazy region readiness。UiSession/UiWorkspace 是选择与呈现服务，API sessions/workspaces 才拥有业务模型；layout 的 stored preferred width 不等于当前 rendered width，收窄窗口可自动隐藏 details。Geometry 是 transient，不宣称 reload 保留。

Theme 使用 token authority 与 ctx.theme snapshot；第三方 id/overrides 是进程内扩展，不写入 built-in settings schema。Font size 12–17、默认 14，通过 Host namespace revision 串行持久化；non-loopback 页面仅本地。Locale register 需 zh/en typed namespace，addLanguage 的 fallback 已注册且最终到 en，unknown/duplicate/cycle 拒绝；查找走 namespace→common→key。卸载回退可用 locale；不提供 plural/bidi engine。Locale 与 theme 的 document/metadata 写入由所属 owner cleanup，不让 feature 各自改根样式。

InputTriggers 当前只有 global source，无 per-Session shadow。Caret 命中 candidate 后 onPick 区分 pick/drill；Tab 无 highlight 放行，Space/Enter 的第一个非 undefined source decision 胜出。Header/crumb 可 drill；focus 留在 composer，鼠标以 mousedown 选择。CommandUi、chatFileMentions 与 slash/input-* 负责命令弹层/结构化引用/文本消费，不能把 UI token 当 Host authority。

ModelDirectories 提供模型选择元数据；settingsSchema/settingsScope 提供已声明 namespace/schema 与可用编辑范围。具体 UI feature（approval、questions、commands、skill、subagent、goal、plan、schedule、feedback、reference、attachment、jobs、workflow、deliverables、trajectory）通过 owner 的 slot 与 typed Remote 组合，不直接 value-import 另一 feature 的 component，也不在 UI 重建第二份业务状态。
