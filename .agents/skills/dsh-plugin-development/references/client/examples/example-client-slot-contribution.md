# Example：在 Plugins 详情页显示标签

本例适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2` 的目标源码 workspace，演示 Client 包的 Host 空入口、浏览器 half、locale 与 `plugins.detail.badge` slot。它不是可直接在独立 npm 消费项目构建的模板：`clientBundle` 只存在于目标仓库的 `packages/client/tsdown.client.ts`。独立发布需先实现等价 lazy-CJS 构建并验证组合。操作边界见[贡献 Web slot](../how-to/how-to-client-slot-contribution.md)，slot 契约见[Slot 与组件](../api/api-client-slots.md)。

## 文件清单

把包放在目标 workspace 的 `packages/client/ui-example-badge/`。需要 `package.json`、`tsconfig.json`、`tsdown.config.ts`、`src/index.ts` 与 `src/client/index.tsx`。实际接入还需在 `tsconfig.client.json`、Web bundle 的 `cordis.patch.yml` 与 `package.json` 各增一处组合登记；后者提供 Loader 裸包名解析。

### `package.json`

```json
{
  "name": "@deepseek-ai/dsh-client-ui-example-badge",
  "version": "0.2.0-rc.2",
  "type": "module",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-plugin-manager", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-renderer"] } },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"],
  "scripts": { "bundle": "tsdown" },
  "peerDependencies": { "@deepseek-ai/cordis": "workspace:~" },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:~",
    "@deepseek-ai/dsh-client-locale": "workspace:*",
    "@deepseek-ai/dsh-client-ui-plugin-manager": "workspace:*",
    "@deepseek-ai/dsh-client-ui-renderer": "workspace:*",
    "@deepseek-ai/dsh-client-ui-slots": "workspace:*",
    "@types/react": "~18.3.1",
    "react": "^18.2.0"
  }
}
```

### `tsconfig.json`

```json
{
  "extends": "../../../tsconfig.base.client.json",
  "compilerOptions": { "rootDir": "src", "outDir": "lib/types" },
  "include": ["src"],
  "references": [
    { "path": "../../../vendor/cordis" },
    { "path": "../locale/tsconfig.client.json" },
    { "path": "../ui-plugin-manager/tsconfig.client.json" },
    { "path": "../ui-renderer" },
    { "path": "../ui-slots" }
  ]
}
```

### `tsdown.config.ts`

```text
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-ui-example-badge', ['lib/types/index.js'])
```

### `src/index.ts`

```ts
/** 纯 UI 包的 Host 入口仍供 Loader 导入。 */
export function apply(): void {}
```

### `src/client/index.tsx`

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

const zh = { badge: '示例扩展' } satisfies Record<string, string>
type BadgeKey = keyof typeof zh
const en = { badge: 'Example extension' } satisfies Record<BadgeKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { exampleBadge: BadgeKey }
}

type BadgeProps = PropsRuntime<'plugins.detail.badge'> & PropsLocale<'exampleBadge'>

function Badge({ subject, t }: BadgeProps) {
  // 只在目标包的详情页贡献内容；其他 subject 保持原页面。
  return subject.kind === 'bundle' && subject.pkg.name === '@deepseek-ai/dsh-web-app'
    ? <span>{t('badge')}</span>
    : null
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('exampleBadge', { zh, en }), 'example-badge: locale')
  ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({
    name: 'plugins.detail.badge',
    id: 'example-badge',
    locale: 'exampleBadge',
  }, Badge))
}
```

## 构建、装载与观察

1. 在目标 checkout 的 `tsconfig.client.json` 的 `references` 增加 `{ "path": "./packages/client/ui-example-badge" }`，在 `packages/bundle/web-app/package.json` 的 `dependencies` 增加 `"@deepseek-ai/dsh-client-ui-example-badge": "workspace:*"`。
2. 在 `packages/bundle/web-app/cordis.patch.yml` 与其他 `ui-*` 行同层增加以下行；`name` 必须是裸包名，不写成 `.../client` 或其他子路径。

   ```yaml
   - id: ui-example-badge
     name: '@deepseek-ai/dsh-client-ui-example-badge'
   ```
3. 执行 `pnpm run build:lib` 与 `pnpm run typecheck`；检查 `lib/client.js` 和两个导出声明。再启动 Web Profile，进入 Plugins 中 `@deepseek-ai/dsh-web-app` 的详情页，应在标题旁看到“示例扩展”。打开其他对象详情页时不显示。
4. 停用本包根行，标签应消失；再次启用应重新出现。停用 Plugins 页面 owner 后贡献应自动撤销；重新启用 owner 时 `slots.inject` 应再次安装贡献。

完成判据是构建产物、类型检查和真实页面组合同时成立。
