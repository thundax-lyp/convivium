# 模型工具

本 reference 覆盖 v0.1.2-rc.1 的 tool definition、execution、policy、result 与 presentation 表面。

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

## 内置执行策略

Tool-call-timeout-policy 没有全局预算配置，只包装声明 timeoutMs 的 definition。Deadline abort 派生 signal，但仍 await next settle 后才返回 timeout result；忽略取消的工具可继续占住调用，不是硬 kill。Bash/read/write/edit 未声明该 registry deadline，其内部过程或 Provider 限制另有 owner。

Repeat-tool-reminder 是建议：同工具、参数 deep key-sort 后准确相同才计数，默认 thresholds 3/5/8，include 空为全部、exclude 既不计数也不 reset，argumentsPreviewChars 默认 500。新 user message 清计数、compaction 不清，Agent 之间不共享；只在准确 threshold 提醒，最高阈值之后不继续升级，更不阻止执行。

## Result 与 replay

成功 result 包含 `isError: false`、canonical `value`、模型可见 `content`、可选 durable presentation `meta`、可选 additional context 和 terminal-turn marker。失败 result 包含 `isError: true`、error detail、模型可见 content 与可选 metadata/context；没有成功 value。

Canonical execution value 本身不是 replay record。Session event 保存 rendered content、error identity 与可选 JSON metadata。Presentation metadata 只放小型可回放 diff、match list、fetch summary、line window 或 truncation fact；不得放 UI component props、clock、function 或 live resource。

## PTC 模式与后台任务

每个当前可见的 registered tool 会自动成为 PTC 模式 的 `await tools.<name>(args)` binding，不需要第二套注册。参数类型与成功返回类型来自同一组 input/output schema；调用仍经过正常 policy pipeline，并返回最终 canonical JSON value，而不是 Native rendered content。因此 output schema 也是程序 API，identity、handle 和结构化字段必须直接存在于 value 中。

长任务只在产品确实允许脱离当前 tool call 继续运行时交给 `ctx.jobs.start()`。发布 job id 之前，工作仍由 `exec.signal` 所有；发布成功之后改由 job 自己的 cancellation、owner disposal 与 service teardown 控制，外层调用取消不能谎称已停止已发布任务。Producer 提供同步幂等的 `cancel`、永不 reject 且只在资源释放后 settle 的 `done`，以及需要时的有界 `readOutput`。后台成功结果返回结构化 job handle，不让模型或 PTC 模式 从 prose 解析 id。

工具配置 `mode` 为 `native`、`ptc` 或 `both`。`ptc` 下模型直接调用只能进入保留的 `run_code`；嵌套工具仍经过正常 policy。不要通过隐藏 schema 代替执行层拒绝。Runtime 依据 `ctx.codeRuntime.language` 生成对应 SDK；TypeScript backend 已发布，Python backend 是私有实验包，不是默认前提。

工具调用 id 类型是 `ToolCallId`；旧 `CodeDispatchLog`、`CodeDispatchEventData`、`CodeDispatchStartEventData` 对应 `PtcDispatchLog`、`PtcDispatchEventData`、`PtcDispatchStartEventData`。持久日志处理 hook 为 `tools/ptc-dispatch-log`；持久日志仍使用 `tool/code-dispatch` 等已存在 event 名，不能随配置术语一并改名。

## CodeRuntime 结果与取消

`ctx.codeRuntime.run()` 接收 program、host bindings 与可选 signal。程序失败通过 resolved result 的 `error` 字段报告，不能只捕获 Promise rejection。分别处理 `exception`、`timeout`、`abort`、`worker-exit`、`invalid-output` 和 `output-limit`；不可把不合法或超限的 completion value 偷换成成功文本。Bindings 参数和返回值必须是 lossless JSON。

Abort 会停止程序，但已经发出的 binding 调用仍由调用方负责取消、settle 和释放资源。Provider 必须隔离不同 run 的状态，dispose 等待运行终止；`isolation` 是执行介质的诊断标签，不是安全保证。输出上限涵盖序列化的 logs 加 completion value 或 failure message，独立通道之间不保证统一交错顺序。

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

## Agent 工具限制

`agent.ctx.tools.restrict({allow,deny})` 只屏蔽可限制的 global tools，各 restriction 取交集；Agent-scoped 注册仍可见。必须在 scoped context 调用，空对象、未知/global 之外的名字以及保留的 `run_code` transport 名都拒绝。`allow: []` 明确隐藏全部 global tools，不等于未设置 allow；解除限制用返回的 disposer，并与 fiber 生命周期绑定。

限制终端能力名称而非 PTC transport，Native discovery 和 PTC 能力访问都应使用同一 registry view。`tools.guard()` 是 pre-execute waterfall 后的单调拒绝层：一个 guard 不能 force-allow 另一个 guard 的拒绝。限制/guard 是工具 admission，不是 OS 文件或网络隔离；后者由对应 Provider 执行。

## 必需证据

测试 input validation、canonical output validation、model rendering 与 pure presentation。异步、I/O、等待资源或声明 timeout 的工具还必须测试 cancellation 到达 owned operation，并证明停止后达到静默；纯同步工具不重复测试 registry 已拥有的 pre-dispatch cancellation。Dispose plugin fiber 并证明 tool 消失。模型可见变更需要 assembled keyless snapshot 或 end-to-end transcript。产品可见 tool 还需要真实 Loader/应用组合。只报告实际运行的聚焦命令。

大结果的 locator、保留期与 Native/PTC 区别见 [Spill](runtime-resources.md#spill-的可恢复性与保留期)。文件和图片工具跨执行环境时遵守同一 reference 的路径与 admission 契约。
