# DSH 包开发

本 reference 覆盖 `dsh-v0.1.1-rc.2` 的包文件、编译配置、入口骨架、invariant 与 README 交付规则。

## 包文件集合

在 `packages/<group>/<package>/` 创建包；group 只是目录。普通包包含 `package.json`、`tsconfig.json`、`src/index.ts`、`src/invariant.ts`、聚焦测试和 `README.md`。先复制最接近的同角色包，再替换 identity、release metadata、build 文件与依赖。

普通非 experimental 包属于 release：不写 `private`，设置 `publishConfig.access: public`，只发布构建后的 `lib` 入口。Experimental 包遵循自身 privacy 规则。所有包为 ESM；source 内相对 import 使用显式 `.ts` 后缀。

Cordis 同时出现在 `peerDependencies` 与 `devDependencies` 且版本一致。每个直接 DSH peer 都在 devDependencies 镜像。源码运行时导入 Schemastery 时，它属于 `dependencies`。仅测试使用的 Loader、replay 与 harness 包只放 devDependencies。

### 最小函数插件 manifest

```json
{
  "name": "@deepseek-ai/dsh-tool-example",
  "description": "One-sentence package responsibility",
  "version": "0.1.1-rc.2",
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "<copy repository.url from the nearest release package>",
    "directory": "packages/<group>/<package>"
  },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "lib/invariant.js", "lib/types/**/*.d.ts"],
  "license": "MIT",
  "dependencies": { "@deepseek-ai/schemastery": "workspace:^" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^",
    "@deepseek-ai/dsh-tools": "workspace:^"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-invariants": "workspace:^",
    "@deepseek-ai/dsh-tools": "workspace:^"
  }
}
```

替换每个 placeholder。只有对应 emitted file 存在且角色需要时才增加 `./client`、worker、bin、generated Remote 或其他 runtime export。Export 指向 `lib/types` 时发布 `lib/types/**/*.js`；否则不要发布无 export 消费的 emitted JavaScript。

### 最小 Host 编译项目

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "lib/types" },
  "include": ["src"],
  "references": [
    { "path": "../../../vendor/cosmokit" },
    { "path": "../../../vendor/cordis" },
    { "path": "../../../vendor/schemastery" },
    { "path": "../../core/tools" },
    { "path": "../../runtime-diagnostics/invariants" }
  ]
}
```

把 DSH references 替换为所有直接 source dependency。保留 invariant reference；只有源码导入 Schemastery 时保留其 reference。普通包只加入一个 aggregate：Host 使用 `tsconfig.host.json`，Client 使用 `tsconfig.client.json`。新增 manifest 后运行 `pnpm install`。

## 完整入口骨架

函数插件导出 schema，并在 `apply` 接收验证后的配置：

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'example-heartbeat'

export interface Config { intervalMs: number }

export const Config: z<Config> = z.object({
  intervalMs: z.number().min(1).required(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => {
    const timer = setInterval(() => { ctx.logger.debug('example heartbeat') }, config.intervalMs)
    return () => clearInterval(timer)
  }, 'example-heartbeat timer')
}
```

Service 在一个稳定 Context key 上公开 provider-neutral API，并 default-export class：

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context { greeting: GreetingService }
}

export interface Config { prefix: string }

export const Config: z<Config> = z.object({ prefix: z.string().required() })

export class GreetingService extends Service {
  static Config = Config

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'greeting')
  }

  greet(name: string): string {
    return `${this.config.prefix}, ${name}`
  }
}

export default GreetingService
```

Loader 读取函数插件导出的 `Config` 或 Service class 的 `static Config`，验证后传给 `apply` 或 constructor。部署时变化的 route、address、timeout、policy 与 credential reference 属于配置；协议和安全不变量保持固定。可独立判断的错误配置在 load 时失败，late-bound reference 在首次可解析操作处失败。

## Invariant companion

每个包拥有 `./invariant`。存在权威 runtime relationship 时注册真实断言；确实没有时，用包专属理由与空 installer，不要断言 method presence 或 plugin metadata。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-example'
export const name = 'tool-example-invariant'
export const inject = ['invariants']

// No runtime invariant: this example owns only one effect-scoped timer.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
```

## 包 README 交付结构

先写包专属 API、config、event、extension point 与 design note。README 最后依次为 Model Experience 与 Known Limitations：

````markdown
## Model Experience

### Request context and condition

#### What the model sees

State exact fields, a generated-catalog location, or introduce the verbatim literal.

##### Verbatim text for this field, when needed

```markdown
Stable package-owned model text copied exactly from source.
```

#### Token effect

State whether tokens are fixed, conditional, retained, replaced, capped, or zero-direct.

#### KV Cache effect

State whether behavior is append-only, prefix-stable, replacing, or independent, and name package-owned invalidators.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — State the missing case, consequence, and maintainer constraint.
````

每个独立 scoped 模型上下文项使用一个 H3，三个 H4 必须按模板顺序排列且各有一段。稳定长文本放在带标题 H5 的 `markdown` fence；data-dependent/provider-owned 文本只做摘要。当 prompt 与 schema 可被独立 scope 隐藏时分开记录。KV Cache 字段区分 append-only growth、可复用 prefix、replacement 与独立 request；Provider cache availability/eviction 不属于包承诺。

只有已进入 rc.2 gate 审计表的包可用短格式：一句以 `None, as ` 或 `Indirectly, through ` 开头并以句点结束的话，随后是 `#### KV Cache effect` 与一段。只有审计为 model-agnostic 的包可省略 Model Experience。Known Limitations 独立审计：使用准确 H2、包含顶层 bullet、置于 README 最后；确实无内容时必须加入带理由的 gate omission。
