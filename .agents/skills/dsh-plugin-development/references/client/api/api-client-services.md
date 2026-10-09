# Client 共享服务：资源、语言与快捷键

适用 `@deepseek-ai/dsh-agent@0.2.0-rc.2`。这些服务只在 Web Client 侧存在；Host 的业务事实仍须经 Session event 或 Remote 可恢复地提供。使用步骤见[注册资源 Provider](../how-to/how-to-client-resource-provider.md)与[词典及快捷键](../how-to/how-to-client-locale-shortcuts.md)。

## `Resources`

**公开导出**：`Resources` 来自 `@deepseek-ai/dsh-client-resources/client`。
`@deepseek-ai/dsh-client-resources/client` 的 `ctx.resources` 按 `dsh-resource://<protocol>/…` 地址管理实时资源。`register(provider)` 每个 protocol 只允许一个 owner，返回随 caller fiber 释放的 disposer；`pin(address,signal)` 在没有组件订阅时暂时保持资源，`source(address)` 返回引用稳定的 observable。最后一个订阅或 pin 退出后，provider 的 signal 被中止，资源状态丢弃。其他 scheme 的导航地址不是 resource。

## `ResourceProvider<P>`

**公开导出**：`ResourceProvider` 来自 `@deepseek-ai/dsh-client-resources/client`。
`protocol` 对应在 `ResourceProtocolMap` 合并声明的键；`open(address,{ signal })` 返回 `AsyncIterable<RemoteResult<Value>>`。第一帧给当前值，后续帧给变化；失败作为 `ok:false` 的 frame，保留最后一个成功值；不要抛出流内异常来表达业务失败。`signal` 中止时生成器必须停止并释放订阅、网络流或其他资源。地址若依赖 Session/Workspace，把其身份编码在 path，不从未声明的全局状态猜测。

## `ResourceSnapshot<Value>`

**公开导出**：`ResourceSnapshot` 来自 `@deepseek-ai/dsh-client-resources/client`。
`status` 为 `none`、`loading`、`live`、`failed`。`value` 在第一帧成功前可为 `undefined`，后续失败仍保留最近成功值；`failure` 只在 failed 状态存在。UI 须分别渲染加载、成功和失败，不能把失败时留下的 value 当作最新有效确认。

## `UseResource`

**公开导出**：`UseResource` 来自 `@deepseek-ai/dsh-client-resources/client`。
`useResource<P>(address)` 是所有 slot Component 可用的全局标准 hook，类型由 `P extends ResourceProtocol` 和 `ResourceProtocolMap[P]` 决定。组件从框架提供的 props 调用它，不直接订阅 `ctx.resources.source` 或把 observable 手工包装进 React hook。详见[资源任务](../how-to/how-to-client-resource-provider.md)。

## `LocaleRuntime`

**公开导出**：`LocaleRuntime` 来自 `@deepseek-ai/dsh-client-locale/client`。
`@deepseek-ai/dsh-client-locale/client` 在 Client `ctx.locale` 提供字典与语言偏好。`register(namespace,{ zh,en })` 依 `LocaleNamespaceMap` 做类型检查并返回 disposer；`bind(namespace)` 返回 typed `TranslateNS`；`getLocale`/`subscribe` 读取与监听 immutable snapshot。`addLanguage({id,label,fallback})` 注册新语言，fallback 必须已存在并最终到英文；`setLocale(id)` 是用户偏好写入，普通功能插件不应在加载时强制切换。词典缺 key 依语言 fallback 再尝试 common namespace，最后显示 key。

## `LocaleNamespaceMap`

**公开导出**：`LocaleNamespaceMap` 来自 `@deepseek-ai/dsh-client-ui-slots`。
由词典 owner 在 `@deepseek-ai/dsh-client-ui-slots` 模块声明合并。键为 namespace，值为字典 key 联合；注册 entry 的 `locale:` 将类型化 `t` seat 放到组件 props。产品可见文案、ARIA 名称、tooltip 与 placeholder 都在 owner 词典中，不能写死在 JSX。

## `Shortcuts`

**公开导出**：`Shortcuts` 来自 `@deepseek-ai/dsh-client-shortcuts/client`。
`@deepseek-ai/dsh-client-shortcuts/client` 的 `ctx.shortcuts.register(command)` 增加应用命令，`registerFixed(command)` 保留不能被编辑绑定占用的固定输入，两者都返回 disposer；caller 负责在 fiber 内释放。`catalog`、`config`、`fixedCatalog` 是 observable，`describeBinding` 按当前平台规则给冲突与错误，`edit(edit,revision)` 保存经用户审阅的改动。`observeFixedInput` 只用于 owner 的固定序列处理；它必须尊重 composing、consumed 等状态。普通页面不要直接绑 `window.keydown` 绕过注册表。

## `ShortcutCommand`

**公开导出**：`ShortcutCommand` 来自 `@deepseek-ai/dsh-client-shortcuts/client`。
`id` 是稳定命令身份；`label()` 返回当前语言文案，`aliases`、`defaults`、`regions` 和 `modals` 定义发现与可触发区域。`resolve(context)` 返回 handled、blocked 或 pass；handled 的 `run()` 捕获当前目标并在执行时才触发动作。业务包自己负责动作失败与资源清理；注册表只路由输入和目录展示。

## `FileUploadService`

**公开导出**：`FileUploadService` 来自 `@deepseek-ai/dsh-client-file-upload/client`。
`@deepseek-ai/dsh-client-file-upload/client` 将 `ctx.fileUpload` 提供给浏览器插件。`upload(sessionId,data,name?,signal?,onProgress?)` 接受 `Blob`、`Uint8Array` 或一次性 `ReadableStream<Uint8Array>`，返回 `RemoteResult<FileUploadValue>`。`Blob`/stream 走后台载体，精确字节走 Remote；上传回执归指定 Session。调用者处理失败、取消与回执后续引用。证据：`packages/client/file-upload/src/client/{index.ts,contract.ts}`。

## `FileUploadProgress`

**公开导出**：`FileUploadProgress` 来自 `@deepseek-ai/dsh-client-file-upload/client`。
`loaded` 是单调已消费字节数，`total` 可缺省。UI 不应将缺失 `total` 误写成已完成。证据：`packages/client/file-upload/src/client/contract.ts`。

## `createSnapshotStore`

**公开导出**：`createSnapshotStore` 来自 `@deepseek-ai/dsh-client-store`。
`@deepseek-ai/dsh-client-store` 创建不依赖 React 的 observable：`getSnapshot`、`subscribe`、`update`、`set`。默认同步通知；`flush: 'raf'` 合并同帧变更。`persist.name` 是可选本地持久化键，应避免跨用户/Session 混用。slot 的 React hook 由 renderer 桥接。证据：`packages/client/store/src/index.ts`。

## `defineStore`

**公开导出**：`defineStore` 来自 `@deepseek-ai/dsh-client-store`。
把初值、动作和可选持久化声明固化为 slot 可绑定的 `StoreHandle`。组件通过框架注入的动作与 selector hook 消费。证据：`packages/client/store/src/{index.ts,contract.ts}`。
