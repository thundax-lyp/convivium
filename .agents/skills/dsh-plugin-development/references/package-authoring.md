# DSH 包开发

本 reference 覆盖 `dsh-v0.1.2-rc.1` 的包文件、编译配置、入口骨架、invariant 与 README 交付规则。

## 先区分开发环境

以下目录、`workspace:^`、vendor project references 和仓库 gate 适用于 DSH monorepo 内开发。维护现有 DSH 包时沿用其布局；在独立插件项目中不要复制这些本地依赖和编译路径。

目标版本 app-boot 的 Profile 实现允许在 profile 的 package.json 安装仓库外插件依赖，并从安装目录和 profile 解析包；具体装配见[应用 Profile](composition-config-credentials.md#应用-profile)。这证明外部插件的加载入口存在，不证明这里的 monorepo manifest 是可直接发布的独立模板。

独立项目仍遵循已验证的 Cordis 导出、公开类型和生命周期契约，但必须依据实际安装的目标版本包确定可解析的依赖版本、共享 Cordis identity、构建输出与 Profile patch。当前参考库没有经独立安装与加载测试的完整模板；不得把 workspace 依赖机械替换成猜测的 npm 版本后声称可运行。发布前需要验证包导出、安装解析和真实 Profile 加载/卸载；缺少这些验证时明确报告未覆盖。

## 包文件集合

以下为 monorepo 内规则。在 `packages/<group>/<package>/` 创建包；group 只是目录。普通包包含 `package.json`、`tsconfig.json`、`src/index.ts`、按需的 `src/invariant.ts`、聚焦测试和 `README.md`。先复制最接近的同角色包，再替换 identity、release metadata、build 文件与依赖。

普通非 experimental 包属于 release：不写 `private`，设置 `publishConfig.access: public`，只发布构建后的 `lib` 入口。Experimental 包遵循自身 privacy 规则。所有包为 ESM；source 内相对 import 使用显式 `.ts` 后缀。

Cordis 同时出现在 `peerDependencies` 与 `devDependencies` 且版本一致。每个直接 DSH peer 都在 devDependencies 镜像。源码运行时导入 Schemastery 时，它属于 `dependencies`。仅测试使用的 Loader、replay 与 harness 包只放 devDependencies。

### 最小函数插件 manifest

```json
{
  "name": "@deepseek-ai/dsh-tool-example",
  "description": "One-sentence package responsibility",
  "version": "0.1.2-rc.1",
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
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "lib/types/**/*.d.ts"],
  "license": "MIT",
  "dependencies": { "@deepseek-ai/schemastery": "workspace:^" },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-tools": "workspace:^"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:^",
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
    { "path": "../../core/tools" }
  ]
}
```

把 DSH references 替换为所有直接 source dependency。只有发布 invariant 时保留其 reference；只有源码导入 Schemastery 时保留其 reference。普通包只加入一个 aggregate：Host 使用 `tsconfig.host.json`，Client 使用 `tsconfig.client.json`。新增 manifest 后运行 `pnpm install`。

## 分离 Host 与 Client 编译面

真正同时拥有不同 Context 声明和运行时依赖的包采用 tsconfig.host.json、tsconfig.client.json 两个 leaf，加 solution-only root；它们分别进入对应 aggregate。目标版本的 Session/Workspace controller 是实例，不能沿用“只有 api/remotes 可拆编译面”的旧限制。普通只有 node seat 和 browser entry 的 UI 插件仍不因此拆成两套。

Pure types 从 owner 的 browser-safe entry 导入。Agent 的共享 identity 在 types，Host runtime face 再增强 live capabilities；JsonValue、freeze/snapshot/assert helpers 在 dsh-util-values，不再从 Session、LLM 或 Tools 的旧 re-export 导入。另有 crypto、time、deque、workspace-path 的窄工具包，选实际 owner，不能为复用 helper 引入 Host Service 总入口。

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

只有存在可独立观察、可能分歧的 runtime relationship 时才发布 `./invariant`。断言使用包 manifest name，检查实际拥有的关系并处理 reporter；不得检查 service/method presence、plugin metadata 或固定示例。

没有该关系时省略 `src/invariant.ts`、export、files/build entry、依赖与 tsconfig reference，并在包 README 写具体理由，例如本 timer 插件没有与定时器独立维护的状态。空 installer 和忽略 reporter 的 companion 会被 gate 拒绝。

普通 Host 包的直接 DSH peers 继续镜像到 devDependencies；Client 与特定 Host 包由 dependency policy 分类，不能把这条镜像规则套到全部包。Browser/type-only 输入通常 dev-only，Host runtime 输入依其共享 identity 要求选择 dependency 或 peer；核对 `verify-package-dependencies`，不靠人工扁平化猜测。

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

只有已进入 v0.1.2-rc.1 gate 审计表的包可用短格式：一句以 `None, as ` 或 `Indirectly, through ` 开头并以句点结束的话，随后是 `#### KV Cache effect` 与一段。只有审计为 model-agnostic 的包可省略 Model Experience。Known Limitations 独立审计：使用准确 H2、包含顶层 bullet、作为 README 最后一个 H2；确实无内容时必须加入带理由的 gate omission。
