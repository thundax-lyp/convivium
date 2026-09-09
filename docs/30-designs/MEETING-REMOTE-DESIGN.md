# Meeting Remote Design

## Status And Authority

2026-09-09 已实现；实际验证边界见 [Remote Migration Evidence](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#meeting-remote-migration)。范围由 [FR-11](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#fr-11可观察性与用户控制) 与 [Remote Interface](../20-interfaces/MEETING-REMOTE-INTERFACE.md) 确定。本文拥有 Remote 生成、装配及通知实现；业务状态、恢复和持久化设计不变。

## Package And Build

仍只有 `plugin/` 一个工程。生产源码不迁入 DSH，也不改成 DSH monorepo 布局。正式 npm 包固定 DSH `0.1.2-rc.1`、Cordis `4.0.2`。新增 `@deepseek-ai/dsh-typert-protocol`、`@deepseek-ai/dsh-api-gateway` 为 optional peer 和同版本 dev dependency；`@deepseek-ai/dsh-typert-generator`、`@deepseek-ai/dsh-typert-registry`、`@deepseek-ai/dsh-client-connection` 仅新增为 dev dependency。沿用现有 TypeScript、tsdown、Vitest、jsdom 与 zod 版本，不扩大升级。

新 `plugin/scripts/generate-typert.mjs` 是唯一生成入口，导出 `generateTypert(pluginRoot: string): Promise<GeneratedPackage>`（JS 用 JSDoc 标注参数；返回正式生成器的单包产物供 contract 比较）。CLI 仅对脚本所属 plugin 根调用；contract 测试向此函数传入完整临时 plugin 副本，不修改真实 src/lib。生成规则：

1. 用 `mkdtemp` 在 OS tmp 创建 staging，`finally` 删除。复制本插件 `src` 到 `packages/plugin/src`；临时 `src/index.ts` 仅重新导出 `./remote/index.js` 的 Service，避免把无关能力加入反射根。这个文件仅在 staging 中替换。
2. 通过正式安装包的 package.json 定位 protocol 的根，复制其发布声明到 `packages/protocol/lib/types`，复制 manifest；不得读取 `../deepseek-harness`、复制上游源码或写 node_modules。protocol 的临时 tsconfig include `lib/types/**/*.d.ts`。
3. staging 根的 `tsconfig.host.json` 显式 references `./packages/protocol`、`./packages/plugin`。根与 protocol compilerOptions 设置 ES2022、ESNext、Bundler、strict、skipLibCheck、noEmit、`types:[]`；staging plugin 沿用工程 Host tsconfig（NodeNext、`types:["node"]`、排除 Client），以解析 Service 的真实 Runtime 类型引用；`@/*` 指向 staging plugin/src，protocol 包名指向 staging protocol/lib/types/index.d.ts，Cordis 指向本插件正式安装声明。staging 根 node_modules 链接到插件 node_modules，仅供依赖解析。
4. staging plugin manifest 使用真实目标 exports，保留 `lib/types` 路径，由 generator 解析对应 src 声明来源；自身源码保持 `@/protocol/index.js` 等公开入口导入。临时布局是真实文件，不能只 symlink plugin，因为 generator 用 realpath 检查 packages 归属。
5. 调用 `new WorkspaceTypertGenerator(stage).generate(["@convivium/dsh-plugin"], ["host"])`，断言只有一个包、remote 产物存在、九个 unary 加一个 stream。将 `js/dts/remote.js/remote.dts` 写到下表四个 lib 文件。失败非零退出，不保留旧产物冒充新生成成功。

| package export | types | default |
| --- | --- | --- |
| `./typert` | `./lib/typert.host.d.ts` | `./lib/typert.host.js` |
| `./remote` | `./lib/typert.remote-client.d.ts` | `./lib/typert.remote-client.js` |
| `./remote-types` | `./lib/types/remote/types.d.ts` | `./lib/remote/types.js` |
| `./protocol-types` | `./lib/types/protocol/types.d.ts` | `./lib/protocol/types.js` |

前四个 generated 文件除被 `files:["lib",...]` 覆盖，还必须逐一列入 files，这是该版本 generator 的 manifest 校验要求。后两个 export 为纯类型的公开子路径，使 generator 能引用命名 DTO；不新建转发文件。tsdown Host entries 增加 `remote/types` 和 `protocol/types` 指向对应原始 .ts，输出空运行时模块；原 tsc 负责声明。`src/index.ts` 通过 `./remote/index.js` 重新导出 `ConviviumRemoteService`，根导出契约新增该符号。

`package.json` 固定新增 `generate:typert = node scripts/generate-typert.mjs`。最终 build 次序为 `rm -rf lib && pnpm generate:typert && tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsc-alias -p tsconfig.json && tsdown --config tsdown.config.ts`。typecheck:client、test、test:integration、test:recovery 在原命令前加 `pnpm generate:typert &&`；typecheck:host 不依赖生成文件。禁止在生成后再次 clean lib。

`tsdown.config.ts` 的 Host bundle 与 `vitest.config.ts` 使用正式 `typertPlugin().transform` 转换 Stage-3 decorators；tsdown 注册只有 name/transform 的转换插件，不调用依赖 monorepo 的自动生成 hook。Vitest 的转换插件另外设 `enforce:"pre"`，既有 projects/alias 保持。生成脚本先于测试，测试仍通过 `@/remote/index.js` 导入原始源码，不改成测 lib。

Client self import `@convivium/dsh-plugin/remote` 包入原有 client.js 工厂，不交给宿主模块加载器解析新的 self module ID；现有 DeepSeek 模块 external 策略保持。不将 Host Service、Node API 或 generator 打入 Client。

## Host Service

新增 `plugin/src/remote/index.ts`：公开 `ConviviumRemoteService extends TypertRemoteService`，构造签名 `constructor(ctx: Context, runtime: LocalMeetingWebRuntime)`，`super(ctx, "conviviumMeetings")`。九个 unary 方法名、参数与返回类型逐一按 Interface 的 Unary Methods 表声明，全部 `@Remote`；不要用动态方法生成或通用 dispatch。`watchUpdates(signal)` 用 `@Remote({mode:"stream"})`，返回 `runtime.watchLocalMeetingUpdates(AbortSignal.any([signal, lifetime.signal]))`。lifetime 为 Service 私有 AbortController，在 constructor 的 super 后创建，通过该 ctx.effect 注册 abort；Service 卸载必须结束既有订阅及 pending next，即使调用者 signal 仍有效。不得随子 Service dispose Runtime。

新增 `plugin/src/remote/types.ts`：Interface 的八个 input aliases、递归 JSON 类型与三个 `RemoteErrorDetailsMap` 声明合并。业务 DTO 从 `@/protocol/index.js` 引用。无第二套业务 Schema。

从旧 `src/http/index.ts` 搬迁严格输入键、大小、输入 Schema、结果 Schema 及错误净化责任，删去 URL/method/media type/HTTP status 分支。顺序固定：取消检查 → 输入大小/精确键/Schema → 取消检查 → 原 Runtime 方法 → 原结果验证 → 原 envelope。Schema 异常映射 invalid-request；Runtime 恢复异常映射 recovery-unavailable；输出 Schema 异常映射 internal。取消不被 catch 改写成 internal。用户字段、requestId、expectedMeetingVersion 原样传递；actor/时间/版本递增/receipt hash 仍由既有 Runtime/domain 生成。

`plugin/src/index.ts::meetingConsumerPlugin` 保留同一个 Runtime：把原 Web 子作用域替换为 `ctx.inject(["webServer", "typertGateway", "typert"], ...)`；精确检查 webServer.host，再在此子作用域用 `ctx.plugin(ConviviumRemoteService, runtime)` 装配。Typert Loader 从 package `./typert` 装载元数据，插件不自行注册第二份 generated descriptor。缺 Web、非 loopback 或缺 Gateway 时 tools/Runtime 不受影响；Web 子作用域卸载只停止 Service，父 consumer 才 dispose Runtime。

## Runtime Refresh Feed

唯一新文件 `plugin/src/runtime/services/meeting-refresh-feed.ts`：

```ts
export interface MeetingRefreshFeed {
    notify(meetingId: string, version: number): void;
    watch(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1>;
    dispose(): void;
}
export function createMeetingRefreshFeed(): MeetingRefreshFeed;
```

notice 类型只从 `@/protocol/index.js` 引用。feed 私有状态只有 disposed、`Map<string,number>` 和订阅者 Set。每个订阅者只有 closed、dirty、等待 next 的 resolver 与 abort disposer；最多一个未交付 notice。

- watch 时先将订阅加入 Set、注册 abort、置 dirty；已 aborted/disposed 时直接返回结束的 iterator。iterator 实现 `next`、`return`、`[Symbol.asyncIterator]`；不使用无法被 return 唤醒的 async generator 等待循环。
- next：closed 返回 done；dirty 清除并返回 refresh；否则等待一个 resolver。消费约束为单 consumer，不额外支持并发 next。
- notify：同 meetingId/version 直接返回；新版本更新 Map，给每个订阅置 dirty；已有等待 next 时立即交付并清 dirty。无订阅不积压通知。只操作内存，不调用外部 observer，不允许异常影响已提交命令。
- return、signal abort、dispose 均幂等：closed=true、移出 Set、移除监听、pending next 返回 done。dispose 还清空 Map；取消与提交交错不会产生未处理 rejection。

`LocalMeetingWebRuntime` 增加 `watchLocalMeetingUpdates(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1>`。`createCreateStatusRuntime` 创建一个 feed，在现有 `onProjectionCommitted(snapshot)` 中保留 developer Markdown schedule，并调用 `feed.notify(snapshot.meetingId, snapshot.version)`。返回对象暴露 watch；原 dispose 入口先关闭 feed，再执行原生命周期清理。不修改 Repository commit/ready/catalog 的顺序；它已经在 commit 成功且 creation ready 可见之后调用 observer。

不增加持久记录、事件版本、消息队列或 timer。通知无可靠交付承诺；初始订阅 refresh、重连 refresh、focus/reopen 完整读取共同弥补断开窗口。

## Client Adapter And Composition

新增 `plugin/src/client/meeting-client.ts`，显式 `import type {} from "@convivium/dsh-plugin/remote"` 使该文件独立类型检查拥有 generated namespace；运行时 mount 仍归入口所有。公开 `ProtocolFailure`、`MeetingClient`、`createMeetingClient(remote: ClientRemote): MeetingClient`。MeetingClient 的九个方法使用原 DTO 加可选 AbortSignal；list 返回原 list envelope，其余返回各自 `ProtocolSuccessV1<Result>`，业务失败抛既有 ProtocolFailure。先检查外层 RemoteResult，再使用原 readList/readStatus/readControl/readReassign/readEnd 及三个事实操作的 consumer 校验。read helpers 的输入改为 unknown，删除 Response.json/status 依赖。invalid-request 映射固定 INVALID_ARGUMENT；不可用/其他 Remote failure 进入缓存禁写，不能恢复成空列表。非法响应不得覆盖缓存。

MeetingClient 另有 `openUpdates(onUnavailable: () => void): RemoteStream<MeetingRefreshNoticeV1>`，调用 `remote.$stream`：name 为 `convivium-meetings`，open 调用 `remote.conviviumMeetings.watchUpdates(signal)`，ended 返回固定 `Error("Meeting update stream ended.")`，carrierFailed 调用 onUnavailable。无需 $on、RemoteSnapshotStream 或全局事件源。

`client/index.tsx` 外层 inject 为 `["remote"]`，从 `@convivium/dsh-plugin/remote` default import contribution，先 await `ctx.remote.$mount(contribution)`；再在子作用域 inject `["slots", "remote", "remote.conviviumMeetings"]` 中注册原 conversation.view。不能把待 mount 的 namespace 放入外层 inject。$mount 已由调用 Context 的 effect 托管，不重复包装 disposer。通过 slots 的 injected props 提供 `api: MeetingClient`；`ConviviumMeetingPanel` 参数新增该 prop，React 不访问 Cordis Context。原 id/label/order 保持。

## Client Refresh State

`meeting-panel.tsx` 继续拥有选择、草稿、取消、写互斥及 generation；`meeting-panel-sections.tsx` 不参与通信。将九处 HTTP 请求改为 api 调用，移除 meetingsPath/meetingPath/fetch 和 5 秒 interval。所有 UI 业务控制与报错展示保持。

订阅 effect 挂载时创建 stream 并消费。每条 notice 验证 exact `{kind:"refresh"}` 后 accept，使用 item.signal 监听当前物理 generation 失效；失效立即标 stale 并禁写。每个物理 generation 首帧在 accept 前必须递增 refreshEpoch、abort list/detail 并递增读 generation、标缓存，再 accept 和启动完整读取。首帧前的任何读取不得落入 UI 或解除禁写；同一 generation 后续通知只驱动 dirty。新的 generation 不继承旧的事实 freshness。stream 异常也标 stale，主动卸载取消不展示错误。每次 focus 先使旧订阅失效并 await dispose，再建立新订阅；同一时刻只保留一个逻辑流，连续 focus 合并到最新一次。组件卸载取消请求与 stream，丢弃晚到结果。

刷新调度器仍在 panel 内：一个 reading 标志、一个 dirty 标志与现有 writePendingRef。通知、focus、选择变化、写后均调用同一个 requestRefresh：置 dirty；读或写进行中暂不启动；空闲时清 dirty 并执行 list + 当前选中 detail 完整读取。读结束若 dirty 再读；写 finally 同样驱动 dirty。所选 ID 及请求 generation 仍作为提交 UI 的 fence。只有当前 generation 的 list 和当前选择 detail 同时校验成功、订阅未失效时才解除 stale；没有选择时只需 list。失败保留最后已验证数据。数据本身仍是完整替换，不合并部分通知内容。

## Smoke Transport

既有 profile baseline 与 scribe-minutes 的 HTTP probe 改为真实 DSH Connection RPC，不能改为直接调用 Runtime/Gateway 来宣称 carrier PASS。`probe/support.js` 新 `createRemoteProbe(connection, origin)` 建立一个测试会话：fetch `connection.authenticatedUrl(origin + "/")`、redirect=manual，要求 303，从 Set-Cookie 仅取 cookie name/value，后续请求复用；不得输出 token/cookie。probe 的 inject 新增 connection。

返回 `callRemote(method, input)`：POST `${origin}/api/conviviumMeetings/${method}`，content-type JSON，带会话 cookie 和匹配 origin；body 为 `{type:"client-request",rpcId,method:"conviviumMeetings/"+method,payload:{args: input === undefined ? {} : {input}}}`。rpcId 使用 probe 局部递增序号，不用业务 requestId。校验 HTTP 200、`type:"server-response"`、相同 rpcId、外层 result.ok 后返回 result.value，再保留原业务断言。没有 legacy fallback。它验证真实 unary carrier；真实 stream 另由 baseline 的 WebSocket gate 验证，不得从 unary probe 推断。

baseline marker 改为 `baseline-remote-pause-resume`，scribe marker 改为 `minutes-remote-equal`，同时更新结果校验和对应脚本测试。其它场景的领域逻辑不改。固定真实 smoke 仅跑 baseline 与 scribe-minutes，完整领域回归由已有 verify 提供；本次不增加模型请求。

baseline 另外使用测试专用 `ws=8.18.3`（plugin dev 和临时 probe dependency，非产品 peer）与同一次认证 cookie 建立 `/api/remote.mux` 订阅。pause 后验证 refresh 和完整状态，关闭实际 socket 后 resume，重开订阅并消费首帧，再补读完整 list/detail 验证 running/version，finally 关闭所有 socket；marker 为 `baseline-remote-stream-reconnect`。该 gate 验证实际 carrier 与提交链；正式 RemoteStream 和 UI 禁写/恢复另由类型检查与组件测试验证，不冒充真实浏览器自动重连端到端。

## Verification Ownership

源码 decorator、边界与生成产物分别验证，不能互相替代。新增生成 contract 验证独立 staging 清理、十个 endpoint、命名类型 export 与额外 authority 保留；Remote boundary 验证九个委托、领域失败、非法输入/输出、取消；feed 单测验证等待中的 return、提交合并与 dispose；Runtime contract 验证 commit 后通知、失败无通知、重开初始 refresh；Client jsdom 验证全部旧交互与断线/焦点/通知竞争。

`pnpm --dir plugin verify` 与两个指定真实 profile smoke 是实现完成门禁。本次 Author 文档检查只证明文件与决策一致，不证明迁移实现或真实 WebSocket 可用。baseline 的真实 WebSocket marker 也是完成门禁；真实浏览器内自动重连端到端在 readiness 保留 Not Covered；不据此宣称完整生产通信已经验证。
