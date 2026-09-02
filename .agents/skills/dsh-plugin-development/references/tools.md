# 模型工具

本 reference 覆盖 rc.2 的 tool definition、execution、policy、result 与 presentation 表面。

## 工具职责

First-party TypeScript tool 使用 `ctx.tools.register(defineTool(...))` 注册；registry 把贡献绑定到调用 fiber。一个 tool 拥有 model input schema、唯一规范 JSON output schema、execution、model rendering 与可选 UI presentation projection。外部提供的 tool 仍可使用 raw JSON Schema，但 `defineTool` 使用 DSH 自己的 parameter 与 ValueSchemaSpec DSL。

`execute(args, exec)` 只返回 output schema 定义的值。Runtime 在 rendering 前 snapshot、validate 并 freeze。Infrastructure failure 使用 throw；成功的 domain outcome 即使不理想也返回 schema-valid value，由 renderer 解释。不要从 `execute` 返回 content block，也不要让 caller 解析 prose 才能获得 id 或字段。

`exec` 携带 immutable call identity、Agent、token 和 cancellation signal。把它和 `args` 当作 readonly；把 `exec.signal` 传入每个可取消操作，并在 abort 后及时停止。

## 完整定义骨架

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-normalize-title'
export const inject = ['tools']

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'normalize_title',
    description: 'Trim a title and collapse consecutive whitespace.',
    parameters: {
      title: { type: 'string', required: true, description: 'Title to normalize.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.title }],
    },
    async execute(args) {
      return { title: args.title.trim().replace(/\s+/gu, ' ') }
    },
  }))
}
```

`parameters` 验证 model JSON 并推导 `args` 类型。Cross-field 与 semantic 条件在 `execute` 内检查。`output.schema` 的 object member 自己携带 `required: true`；`properties` 与 `additionalProperties` 是 ValueSchemaSpec 字段，不能原样复制 generic JSON Schema object。

工具需要 filesystem、network、process 或其他能力时，注入并调用对应 DSH Service Definition；不要用 Node API 绕过 Provider、策略、观察和生命周期。文件读取以 `dsh-tool-fs` 为基线：它通过 `ctx.fs` 解析目标，响应 cancellation，限制行数、单行长度和输出字节，并记录文件观察。

## 策略与观察

选择拥有该决策的 stage：

| 扩展点                         | 可改变内容                                                   | 常见用途                              |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------- |
| `tools/pre-execute` waterfall  | allow、deny 或一次 approval request                          | permission、plan policy、sandbox gate |
| `ctx.tools.guard()`            | 只能 deny                                                    | 最终单调 invariant                    |
| `tools/execute` waterfall      | 包装 execution、替换 signal                                  | timeout、retry、metrics               |
| `tools/post-execute` waterfall | accept、替换 value/content、block、追加 next-request context | result shaping 或 correction          |
| `tools/result` observer        | 不能改变                                                     | audit、metrics、capture               |

Pre-execution decision 是 `allow`、带 reason 的 `deny`，或可带 reason 的 `ask`。Waterfall listener 通过 `next()` 保留 downstream policy；不调用表示有意 short-circuit。一次 post decision 只能替换 canonical value 或 rendered content，不能同时替换。Result observer 接收 immutable final identity 与 result。

## Result 与 replay

成功 result 包含 `isError: false`、canonical `value`、模型可见 `content`、可选 durable presentation `meta`、可选 additional context 和 terminal-turn marker。失败 result 包含 `isError: true`、error detail、模型可见 content 与可选 metadata/context；没有成功 value。

Canonical execution value 本身不是 replay record。Session event 保存 rendered content、error identity 与可选 JSON metadata。Presentation metadata 只放小型可回放 diff、match list、fetch summary、line window 或 truncation fact；不得放 UI component props、clock、function 或 live resource。

## Code Mode 与后台任务

每个当前可见的 registered tool 会自动成为 Code Mode 的 `await tools.<name>(args)` binding，不需要第二套注册。参数类型与成功返回类型来自同一组 input/output schema；调用仍经过正常 policy pipeline，并返回最终 canonical JSON value，而不是 Native rendered content。因此 output schema 也是程序 API，identity、handle 和结构化字段必须直接存在于 value 中。

长任务只在产品确实允许脱离当前 tool call 继续运行时交给 `ctx.jobs.start()`。发布 job id 之前，工作仍由 `exec.signal` 所有；发布成功之后改由 job 自己的 cancellation、owner disposal 与 service teardown 控制，外层调用取消不能谎称已停止已发布任务。Producer 提供同步幂等的 `cancel`、永不 reject 且只在资源释放后 settle 的 `done`，以及需要时的有界 `readOutput`。后台成功结果返回结构化 job handle，不让模型或 Code Mode 从 prose 解析 id。

## 展示意图

实现前选择 UI presentation。`presentCall(args)` 与 `presentResult(args, result)` 是纯 projection，不执行 I/O、不修改状态；面对较旧或 malformed logged argument 时必须安全 fallback。

| Intent     | 用途                                                 |
| ---------- | ---------------------------------------------------- |
| `generic`  | 普通操作，可带 title、raw input、content 与 location |
| `terminal` | Shell command 及 raw output/exit metadata            |
| `diff`     | 已知内容变化的 file write/edit                       |
| `read`     | 带 line position 的有界 file window                  |
| `search`   | 带 truncation fact 的 file match/path discovery      |
| `web`      | Web 搜索/抓取摘要                                    |

## 必需证据

测试 input validation、canonical output validation、model rendering 与 pure presentation。异步、I/O、等待资源或声明 timeout 的工具还必须测试 cancellation 到达 owned operation，并证明停止后达到静默；纯同步工具不重复测试 registry 已拥有的 pre-dispatch cancellation。Dispose plugin fiber 并证明 tool 消失。模型可见变更需要 assembled keyless snapshot 或 end-to-end transcript。产品可见 tool 还需要真实 Loader/应用组合。只报告实际运行的聚焦命令。
