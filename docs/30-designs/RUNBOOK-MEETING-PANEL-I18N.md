# RUNBOOK：Meeting Panel 接入 DSH i18n

## 1. 状态与工作边界

- 状态：`Executable`
- 审计结论：`Executable`
- 产品确认：用户于 2026-09-22 明确确认本文第 3 节的完整口径，并确认真实 Web UI 中英文切换检查属于完成门槛。
- 执行分支：`codex/i18n-meeting-panel`
- 建立日期：2026-09-22
- 工作目录：仓库根目录 `/Volumes/storage/workspace/convivium`
- 起点：`plugin/src/client/` 的用户可见文案和 `conversation.view` 标签为硬编码英文。
- 终点：Convivium 使用 DSH `0.1.2-rc.1` 的公开 locale 服务提供中英文 Meeting Panel，并跟随 DSH 当前语言切换；不改变会议领域、Remote、持久化或 command 语义。

## 2. 执行者契约

执行者必须从第一项未完成任务开始，严格按 T1 → T9 顺序执行。每一步只允许修改该步骤列出的文件和 symbol，并立即运行该步验证。

执行者可以：

- 使用 `apply_patch` 修改明确列出的文件；
- 运行本文固定的只读检查、测试、构建和真实 profile smoke；
- 在测试 RED 后实现本文已经固定的唯一方案；
- 将实际执行结果写入 T9 指定的 readiness 文档。

执行者不得：

- 自行选择其他 locale namespace、翻译范围、fallback、错误展示策略或语言设置入口；
- 新增独立语言设置、第三种语言、语言包框架、日期格式化框架或翻译库；
- 修改 Meeting Domain、Protocol、Remote schema、Storage、command payload、权限或生命周期；
- 本地化用户输入、Agent 输出、会议 objective、发言正文、displayName、协议字段、错误码或写入 MeetingState 的 reason；
- 通过 `any`、禁用 lint、放宽类型、删除断言或硬编码组件 fallback 文案使验证通过；
- commit、push、创建 PR、合并或修改外部系统。

`PASS` 表示指定命令退出码为 0，并且本步骤列出的可观察断言全部成立。`STOP` 是强制结果；触发后必须报告最后一个 PASS 步骤、触发条件、相关文件和 symbol、最小复现命令、实际输出以及继续所需的人工决定。执行者不得自行回滚用户已有修改。

## 3. 已确认产品口径

以下产品决定已由用户于 2026-09-22 确认；T1 负责将其提升到正式需求：

1. Convivium 不提供独立语言设置；Meeting Panel 始终跟随 DSH 当前 locale。
2. 当前只提供 DSH 内置的 `zh`、`en` 两套完整词典，使用 DSH 自身的 English fallback。
3. `conversation.view` 标签、Meeting Panel 自有标题、按钮、ARIA 文案、空状态、加载状态、客户端错误提示、字段名、section 名和枚举展示标签全部本地化。
4. DSH 运行时切换 locale 后，已挂载的标签和 Meeting Panel 无需重启或重新注册即可刷新。
5. objective、Agenda 标题、FormalMessage 正文、identity displayName 等用户或 Agent 产生的内容保持原文。
6. Domain/Protocol enum 值、错误码、command action、command reason 和其他持久事实保持原值；UI 只把已知 enum 映射为本地化展示标签。
7. `ProtocolFailure` 的 UI 提示使用本地化固定句式并保留稳定 `code`，不直接展示可能为英文的 `protocolError.message`；非协议异常显示本地化的“会议数据不可用”。错误对象和 Remote 契约本身不改变。
8. 当前 Meeting Panel 没有日期或时间字段，本任务不新增字段，也不引入日期格式化行为。
9. Timeline Panel、Meeting Panel 视觉重构和新的数据结构不在本任务范围内。
10. 完成前必须在隔离的真实 DSH Web profile 中实际切换中文和英文，验证已打开的 view 标签和 Meeting Panel 无需重启即可刷新；Browser 自动化仍属于 `Not Covered`。

## 4. 目标链路与当前断点

完整链路固定为：

```text
DSH locale preference / browser provisional locale
  -> @deepseek-ai/dsh-client-locale LocaleRuntime
  -> convivium.meeting typed zh/en dictionaries
  -> conversation.view label thunk + slot locale seat
  -> ConviviumMeetingPanel receives typed t
  -> layout / observability sections translate client-owned copy and enum labels
  -> MeetingView user-authored content remains byte-for-byte unchanged
```

当前断点如下：

| 断点 | 当前事实 | 证据 |
| --- | --- | --- |
| 正式需求 | 只规定列表、选择详情、控制和权限投影，没有 i18n 验收标准 | `docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md` Acceptance Criteria 29；`docs/30-designs/DSH-PLUGIN-DESIGN.md` Local Client And Remote Boundary |
| Client 组合 | `dsh.client.inject` 未声明 `@deepseek-ai/dsh-client-locale`，client plugin 的 `inject` 只有 `remote` | `plugin/package.json`；`plugin/src/client/index.tsx` 的 `inject` |
| 标签 | `conversation.view` 的 `label` 是字符串 `"Meetings"`，未声明 `locale` | `plugin/src/client/index.tsx` 的 `apply` |
| Panel 文案 | 标题、按钮、ARIA、空状态、section/field 名、枚举值均直接渲染英文或原始 enum | `plugin/src/client/meeting-panel-layout.tsx`；`plugin/src/client/meeting-panel-sections.tsx` |
| 错误提示 | `failureMessage` 直接显示 `ProtocolFailure.message`，非协议错误使用硬编码英文 | `plugin/src/client/meeting-panel.tsx` 的 `failureMessage` |
| 测试 | Client tests 固定查询英文按钮和 section，未验证中文、动态切换或 namespace 注册 | `plugin/tests/client/meeting-panel*.spec.ts` |
| 外部验证 | target runtime 没有 Browser smoke；现有 smoke 只能证明真实 Loader/Host/runtime 组合 | `docs/50-operations/HOW-TO-DSH-SMOKE.md` 的 Scope 与 Not Covered |

## 5. Scope 与 Non-goals

### Scope

- 在正式需求中增加 Meeting Panel i18n 行为和可验收条件。
- 在 DSH Plugin Design 中固定 locale owner、namespace、依赖和 presentation 边界。
- 为 Client package 声明 `@deepseek-ai/dsh-client-locale` 的 browser injection 和 optional peer pairing。
- 新增一个 typed locale namespace `convivium.meeting`，一次注册完整 `zh`、`en` dictionaries。
- 让 `conversation.view` 标签和 Meeting Panel 所有 client-owned copy 使用同一个 typed translation seat。
- 把当前展示的 lifecycle、round status 和 archive status 映射为本地化 label。
- 本地化客户端错误外壳，同时保留稳定 Protocol error code。
- 保持全部现有 Meeting list/read/control 行为和 payload 不变。
- 增加能识别硬编码英文、缺失注册、错误 enum 映射和内容误翻译的 Client tests。
- 完成 focused、全量 plugin 验证、真实 profile smoke 和隔离 Web UI 人工切换检查，并同步 readiness 的实际证据与 Browser 自动化未覆盖边界。

### Non-goals

- Timeline Panel；Meeting Panel 布局、样式或信息架构优化。
- 新增或修改 MeetingView、MeetingSummary、Remote method、Storage record、Domain event、receipt、outbox 或 archive。
- 翻译用户/Agent 内容、动态 server message、协议 key/value、错误码或 command reason。
- 新增 locale preference、Settings row、第三种语言、plural engine、bidi engine 或外部翻译依赖。
- Browser 自动化 smoke、断线重连、性能、移动端和视觉快照。
- 顺带重构 `meeting-client.ts`、Remote transport 或现有控制动作。

## 6. 真相源、公开契约与唯一实现决定

### 6.1 关联真相源

- [Architecture — Runtime Boundaries 与 Dependency Rules](../00-governance/ARCHITECTURE.md)
- [Engineering Rules — Implementation Economy、Engineering Checks 与 Validation And Evidence](../00-governance/ENGINEERING-RULES.md)
- [Test Rules — Behavior And Oracle](../00-governance/TEST-RULES.md)
- [Meeting Orchestration Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)
- [Meeting Interface — Read, Remote And Projection](../20-interfaces/MEETING-INTERFACE.md#read-remote-and-projection)
- [DSH Plugin Design — Local Client And Remote Boundary](./DSH-PLUGIN-DESIGN.md#local-client-and-remote-boundary)
- [Current Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)
- [DSH Smoke Operations](../50-operations/HOW-TO-DSH-SMOKE.md)
- DSH `0.1.2-rc.1` public types：`@deepseek-ai/dsh-client-locale/client` 的 `LocaleRuntime.register`、`LocaleRuntime.bind`；`@deepseek-ai/dsh-client-ui-slots` 的 `LocaleNamespaceMap`、`TranslateNS`、`SlotLabel`、`PropsLocale`。

### 6.2 Locale 数据结构

唯一新增 production 文件是 `plugin/src/client/locales.ts`。它必须定义并导出：

```ts
export const MEETING_LOCALE_NS = "convivium.meeting";
export const zh = { /* 下表全部 key */ } as const;
export type MeetingLocaleKey = keyof typeof zh;
export const en: Record<MeetingLocaleKey, string> = { /* 同一 key set */ };
export type MeetingTranslate = TranslateNS<typeof MEETING_LOCALE_NS>;
```

同一文件必须 augmentation：

```ts
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        "convivium.meeting": MeetingLocaleKey;
    }
}
```

字典由 Convivium Client plugin 生产，由 DSH `LocaleRuntime` 持有并在 plugin fiber dispose 时释放。字典不持久化；当前 locale preference 仍由 DSH 持久化。不得新增 Convivium config、state 或 storage 字段。

### 6.3 固定 key 与文案

下表是本任务允许的完整 key set；执行者不得增删同义 key。模板参数名必须保持表中 `{id}`、`{count}`、`{code}`。

| key | `zh` | `en` |
| --- | --- | --- |
| `tab.meetings` | 会议 | Meetings |
| `panel.aria` | Convivium 会议 | Convivium meetings |
| `panel.title` | 会议 | Meetings |
| `action.refresh` | 刷新 | Refresh |
| `action.pause` | 暂停会议 | Pause meeting |
| `action.resume` | 继续会议 | Resume meeting |
| `action.end` | 结束会议 | End meeting |
| `list.aria` | 会议列表 | Meeting list |
| `selection.prompt` | 请选择一个会议。 | Select a meeting. |
| `detail.loading` | 正在加载会议。 | Loading meeting. |
| `detail.unavailable` | 无会议详情。 | No detail. |
| `detail.aria` | 会议 {id} | Meeting {id} |
| `error.protocol` | 会议请求失败（{code}）。 | Meeting request failed ({code}). |
| `error.unavailable` | 会议数据不可用。 | Meeting data is unavailable. |
| `value.none` | 无 | None |
| `section.summary` | 会议摘要 | Meeting summary |
| `field.version` | 会议版本 | Meeting version |
| `field.lifecycle` | 生命周期 | Lifecycle |
| `field.objective` | 目标 | Objective |
| `field.activeAgenda` | 当前议题 | Active agenda |
| `section.rounds` | 轮次 | Rounds |
| `round.summary` | {id}：{status}（{count} 个贡献） | {id}: {status} ({count} contributions) |
| `section.evidenceReviews` | 证据与审核 | Evidence and reviews |
| `field.visibleEvidencePackages` | 可见证据包 | Visible evidence packages |
| `field.visibleEvidenceReviews` | 可见证据审核 | Visible evidence reviews |
| `field.publications` | 发布 | Publications |
| `section.formalMessages` | 正式发言 | Formal messages |
| `section.outcomes` | 结果 | Outcomes |
| `field.decisions` | 决策 | Decisions |
| `field.completionFacts` | 完成事实 | Completion facts |
| `field.issues` | 问题 | Issues |
| `section.archive` | 归档 | Archive |
| `field.archiveStatus` | 归档状态 | Archive status |
| `field.archiveVersion` | 归档版本 | Archive version |
| `field.archiveMessages` | 归档发言 | Archive messages |
| `lifecycle.preparing` | 准备中 | Preparing |
| `lifecycle.running` | 进行中 | Running |
| `lifecycle.paused` | 已暂停 | Paused |
| `lifecycle.converging` | 收敛中 | Converging |
| `lifecycle.ending` | 结束中 | Ending |
| `lifecycle.terminal` | 已结束 | Ended |
| `lifecycle.archiving` | 归档中 | Archiving |
| `lifecycle.archived` | 已归档 | Archived |
| `round.open` | 开放 | Open |
| `round.published` | 已发布 | Published |
| `round.aborted` | 已中止 | Aborted |
| `archive.pending` | 待处理 | Pending |
| `archive.complete` | 已完成 | Complete |
| `archive.failed` | 失败 | Failed |

DSH 当前不提供 plural engine；`round.summary` 对 English 的 `count === 1` 仍显示 `1 contributions`，保持现有单模板行为，不新增 plural 分支。

### 6.4 调用链与 symbol 映射

| 文件 / symbol | 唯一职责 | 输入 | 输出 / 下游 |
| --- | --- | --- | --- |
| `plugin/src/client/locales.ts` / `MEETING_LOCALE_NS`, `zh`, `en` | 定义 typed namespace 和平衡词典 | 固定 key table | `LocaleRuntime.register` 与所有 `MeetingTranslate` consumer |
| `plugin/src/client/index.tsx` / `inject` | 声明 `remote`、`locale` service 依赖 | Client composition | Cordis activation 门槛 |
| `plugin/src/client/index.tsx` / `apply` | mount Remote，注册/释放 dictionary，绑定 label translator，注册 slot | `ctx.remote`, `ctx.locale`, `ctx.slots` | `conversation.view` contribution |
| `plugin/src/client/meeting-panel.tsx` / `ConviviumMeetingPanel` | 保持 list/read/control 状态，并把 `t` 传给 layout | `api`, `t` | `renderMeetingPanelLayout` |
| `plugin/src/client/meeting-panel.tsx` / `failureMessage` | 把异常转换为本地化 UI 提示 | `unknown`, `t` | list/detail alert；不修改原 error |
| `plugin/src/client/meeting-panel-layout.tsx` / `renderMeetingPanelLayout` | 翻译 panel shell、controls、selection/detail states 和 list lifecycle label | `MeetingPanelLayoutProps`, `t` | React element |
| `plugin/src/client/meeting-panel-sections.tsx` / `lifecycleLabel` | exhaustive 映射 lifecycle enum → locale key → label | lifecycle enum, `t` | list 与 summary 共用 label |
| `plugin/src/client/meeting-panel-sections.tsx` / `renderObservabilitySections` | 翻译 section、field、empty、round/archive status；原样渲染业务内容 | `MeetingView`, `t` | React element |

`apply` 的唯一接线顺序：

1. `await ctx.remote.$mount(contribution)`；
2. `ctx.effect(() => ctx.locale.register(MEETING_LOCALE_NS, { zh, en }), "convivium-client: dictionaries")`；
3. `const t = ctx.locale.bind(MEETING_LOCALE_NS)` 仅用于动态 slot label thunk；
4. 在现有 `ctx.inject(["slots", "remote", "remote.conviviumMeetings"], ...)` 内注册 `conversation.view`；
5. slot options 固定为 `id: "convivium-meetings"`、`order: 100`、`label: () => t("tab.meetings")`、`locale: MEETING_LOCALE_NS`；
6. slot component 从框架接收 `props.t`，再创建 `ConviviumMeetingPanel`；不得把步骤 3 的 `t` 直接传给 component，以保留 renderer 对 locale revision 的订阅。

### 6.5 Not Applicable

- 数据库、Storage Domain、migration、transaction、version、receipt、outbox、replay、recovery：本任务无新增或修改。
- Meeting Domain state、event、actor、ID、时间、权限、terminal immutability：本任务无新增或修改。
- Remote/HTTP/Protocol schema 与兼容版本：本任务无新增或修改。
- caller、authority、capability、idempotency、数组原子性：现有行为必须保持，由既有测试和全量验证回归覆盖。
- 第三方语言注册、plural、bidi：当前需求不包含。

## 7. 不可违反的不变量与反例

### 不变量

1. `MeetingView` 和 `MeetingSummary` 仍是 UI 的唯一会议事实输入；翻译层不得推导领域状态。
2. `zh`、`en` 必须拥有完全相同的 key set；缺 key 或额外 key必须导致 typecheck 失败。
3. 每个 client-owned 用户可见字符串只能来自 `MeetingTranslate`；组件内不得保留 English/Chinese fallback literal。
4. locale 切换只改变 presentation；同一操作产生的 `MeetingCommand` 必须与切换前完全相同。
5. objective、Agenda title、FormalMessage body、displayName 等业务内容不得作为 translation key，也不得被改写。
6. lifecycle、round status、archive status 使用 exhaustive mapping；新增 enum 未映射时必须编译失败。
7. dictionary registration 和 slot registration 由 Cordis/plugin lifecycle 拥有并随 fiber teardown；不得创建 module-global mutable locale state。
8. DSH locale 未安装或缺失时 plugin activation 必须 fail loud，不以本地 English fallback 静默运行。
9. 不修改 `plugin/src/client/meeting-client.ts` 的 Protocol/Remote 解包行为。

### 必须由测试识别的错误实现

- DSH 已为 `zh`，标签仍显示 `Meetings`。
- 标签随语言切换，但已挂载 Panel 仍显示 `Refresh`、`Pause meeting`。
- 中文面板把 lifecycle 原始值显示成 `running`。
- 翻译函数改写了 fixture 中的中文 objective 或 FormalMessage body。
- `ProtocolFailure` 把 English `message` 直接显示给中文 UI，或丢失稳定 `code`。
- 切换 locale 后 pause/end command 的 action、reason 或 version 发生变化。
- plugin dispose 后 dictionary 或 slot contribution 仍残留。

## 8. 机械执行步骤

### T5：实现 namespace、package composition 与 slot locale seat

前置状态：T4 已观察到目标 RED。

允许修改：

- 新增 `plugin/src/client/locales.ts`
- `plugin/src/client/index.tsx`
- `plugin/src/client/meeting-panel.tsx`，仅允许在 props 类型中增加 `t: MeetingTranslate`；T5 不得使用该 prop 改变渲染或错误文案
- `plugin/package.json`
- `plugin/tests/client/meeting-client-plugin.client.spec.ts`，仅允许修正与真实公开类型签名不一致的 fixture typing，不得降低行为断言

禁止修改：其他 production、tests、lockfile、Protocol、Remote 和文档。

执行：

1. 按 6.2 和 6.3 原样建立 namespace、types 和 balanced dictionaries。
2. 在 `plugin/package.json` 的 `dsh.client.inject` 增加 `@deepseek-ai/dsh-client-locale`；在 `peerDependencies` 增加精确版本 `0.1.2-rc.1`，并在 `peerDependenciesMeta` 标记 optional。该包已存在于 `devDependencies`，不得改 lockfile。
3. 把 `inject` 改为 `remote`、`locale`，并严格按 6.4 的六步顺序修改 `apply`。
4. 在 `ConviviumMeetingPanel` props 类型中增加 required `t: MeetingTranslate`，但函数体仍只读取 `api`，不得在 T5 改变 Panel 文案或错误处理；该类型接缝只用于让 slot component 合法传入 locale seat。
5. slot label 使用 `() => t("tab.meetings")`；slot options 声明 `locale: MEETING_LOCALE_NS`；component 使用框架传入的 `props.t`。
6. 运行 T4 测试、Client typecheck 和 package contract 验证。

验证：

```bash
pnpm --dir=plugin exec vitest run --project client tests/client/meeting-client-plugin.client.spec.ts
pnpm --dir=plugin typecheck:client
pnpm --dir=plugin verify:contract
```

PASS：三条命令退出码均为 0；测试观察到 label 在 `zh`/`en` 间切换、slot locale 为 `convivium.meeting`、dictionary disposer 被调用；typecheck 证明词典 key 平衡；contract 检查接受新增 client injection。

STOP：必须改变 namespace、增加 runtime dependency、修改 lockfile、绕过 slot locale seat，或 contract 认为 package composition 非法；报告实际错误，不采用本地 fallback。

失败恢复：Cordis/locale 测试创建的 context 必须在 `finally`/test cleanup 中 dispose；不得留下进程或外部文件。

### T6：先写 Meeting Panel 本地化行为测试并观察 RED

前置状态：T5 PASS；Panel production 仍保留原英文渲染。

允许修改：

- 新增 `plugin/tests/client/meeting-panel-locales.client.spec.ts`
- 新增 `plugin/tests/client/meeting-panel-locale-fixtures.ts`
- `plugin/tests/client/meeting-panel.client.spec.ts`
- `plugin/tests/client/meeting-panel-lifecycle.client.spec.ts`
- `plugin/tests/client/meeting-panel-local-controls.client.spec.ts`

禁止修改：production、其他测试和文档。

执行：

1. fixture 只负责从 production `zh`/`en` dictionary 生成 typed translator 并替换 `{param}`；不得在 fixture 复制翻译文案。
2. 新 spec 使用 literal oracle 分别断言中文和英文的 panel title、buttons、ARIA、empty/loading、summary fields、lifecycle、round/archive labels、Protocol error code shell 和 unknown error shell。
3. 使用包含中文 objective 与 FormalMessage body 的既有 projection fixture，断言两种 locale 下内容完全不变。
4. 修改现有 component tests 使其显式传入 English translator；控制测试继续断言原有 command payload，包括 English `reason`，证明 presentation locale 不改变 command。
5. 运行 locale spec；预期失败必须来自 hardcoded copy/raw enum/旧 component signature，不得来自 fixture 自身。

验证：

```bash
pnpm --dir=plugin exec vitest run --project client tests/client/meeting-panel-locales.client.spec.ts tests/client/meeting-panel.client.spec.ts tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-local-controls.client.spec.ts
```

PASS：本步骤的 PASS 是命令非零退出，且失败断言至少识别一个中文期望实际得到英文或 raw enum；tests 均被收集，没有 import、syntax 或 async cleanup 错误。

STOP：测试直接通过、只检查 production dictionary 自身、或要求修改业务内容/command payload；报告不一致的验收决定。

失败恢复：保留行为测试；不得改变既有 fixture 的领域数据来迁就翻译。

### T7：本地化 Panel shell、错误与控制

前置状态：T6 已观察目标 RED。

允许修改：

- `plugin/src/client/meeting-panel.tsx`
- `plugin/src/client/meeting-panel-layout.tsx`
- `plugin/src/client/meeting-panel-sections.tsx`，仅允许新增并导出 `lifecycleLabel` 及其 exhaustive lifecycle key map；其他 section 文案和 round/archive mapping 留在 T8
- `plugin/tests/client/meeting-panel-locales.client.spec.ts`，仅允许修正与实际 React 可访问名称结构不一致的查询，不得改变 literal oracle

禁止修改：除上述 `lifecycleLabel` 外的 sections 行为、meeting client、Protocol、projection、其他 tests 和文档。

执行：

1. `ConviviumMeetingPanel` 开始读取 T5 已声明的 `t: MeetingTranslate` prop，并传给 `renderMeetingPanelLayout`。
2. `failureMessage(error, t)` 对 `ProtocolFailure` 返回 `t("error.protocol", { code: error.protocolError.code })`，其他异常返回 `t("error.unavailable")`；不得修改或匹配 server message。
3. 在 `meeting-panel-sections.tsx` 新增并导出 `lifecycleLabel(status, t)`，使用 `Record<MeetingView["lifecycle"]["status"], MeetingLocaleKey>` exhaustive mapping；不得在 T7 翻译其他 section 文案或新增 round/archive mapping。
4. `renderMeetingPanelLayout(ctx, t)` 翻译 panel/list/detail ARIA、title、四个按钮、选择/加载/无详情文本，并用 `lifecycleLabel` 翻译 list lifecycle。
5. `meeting.objective`、`meeting.meetingId` 和所有 callbacks 保持原样。
6. 运行 focused tests；sections 相关中文断言可继续失败，但 shell/control/error 断言必须通过。

验证：

```bash
pnpm --dir=plugin exec vitest run --project client tests/client/meeting-panel-lifecycle.client.spec.ts tests/client/meeting-panel-local-controls.client.spec.ts
pnpm --dir=plugin exec vitest run --project client tests/client/meeting-panel-locales.client.spec.ts
```

PASS：前一条命令退出码为 0；后一条只允许因尚未实施的 section/field/status 断言失败，shell、control、error、业务内容不变断言均通过。

STOP：控制 payload 变化、需要改 `meeting-client.ts`、或测试失败超出尚未实施的 sections；报告实际 diff。

失败恢复：没有外部副作用；不要删除 T6 断言来取得 PASS。

### T8：本地化 observability sections 与 enum labels

前置状态：T7 PASS；locale spec 只剩 sections/status 目标失败。

允许修改：

- `plugin/src/client/meeting-panel-sections.tsx`
- `plugin/src/client/meeting-panel-layout.tsx`，仅允许把现有调用改为 `renderObservabilitySections(ctx.detail, t)`，不得改变其他 layout 行为
- `plugin/tests/client/meeting-panel-locales.client.spec.ts`，仅允许修正 React 查询，不得改变 literal oracle
- `plugin/tests/client/meeting-panel.client.spec.ts`，仅允许接入 translator 和保持原 projection boundary 断言

禁止修改：Domain、Protocol、projection、layout、client transport、其他 tests 和文档。

执行：

1. 复用 T7 已新增的 `lifecycleLabel(status, t)`；不得建立第二份 lifecycle mapping。
2. 在同文件为 `RoundView["status"]` 和 `ArchiveView["status"]` 建立 private exhaustive map；不得使用 default branch 返回 raw enum。
3. `row`、`section`、`list` 接收已翻译 label/value；`list` 空值使用 `t("value.none")`。
4. `renderObservabilitySections(viewInput, t)` 只翻译 6.3 列出的 copy 和 enum labels；objective statement、active Agenda title、message body 保持原值。
5. 在 `meeting-panel-layout.tsx` 只把现有调用改为 `renderObservabilitySections(ctx.detail, t)`，使真实 Panel 继续传递 slot locale seat。
6. 运行所有 Client tests 和 Client typecheck。

验证：

```bash
pnpm --dir=plugin exec vitest run --project client
pnpm --dir=plugin typecheck:client
```

PASS：两条命令退出码均为 0；中英文 literal assertions、内容不变、error code、command payload 和 projection boundary 均通过；TypeScript 对全部 dictionary key 与 enum map 完整性通过。

STOP：必须显示 raw enum、增加未列出的文案 key、翻译业务内容或使用非穷尽 cast；报告具体类型或断言。

失败恢复：无外部副作用；不得放宽 `MeetingLocaleKey` 或 enum 类型。

### T9：完整验证、readiness 收口与 RUNBOOK 删除准备

前置状态：T8 PASS；实现范围与本 RUNBOOK 双向追踪无缺口。

允许修改：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- 本 RUNBOOK；只有全部完成条件满足后才允许执行删除步骤
- 临时创建并在 PASS 前删除 `/Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation`；该路径在本步骤开始时必须不存在

禁止修改：production、tests、requirements、interfaces、其他 designs 和 operations。

执行：

1. 运行固定完整自动化验证集合。
2. 确认 `/Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation` 不存在；存在时 STOP，不删除或复用。
3. 从仓库根执行 `./scripts/install-from-source.sh --workspace /Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation`，只把当前分支 artifact 安装到该隔离 workspace。
4. 在专用前台终端执行 `/Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation/convivium-user/start.sh`，等待 Host 明确报告监听 `127.0.0.1:31828`；启动失败时 STOP。
5. 在 Browser 打开 `http://127.0.0.1:31828`，进入任一 Session，使 `conversation.view` 标签可见；不得创建会议、调用模型或改动既有 profile。
6. 在 DSH `Settings → General` 选择中文，保持同一页面已挂载，观察标签为“会议”，Panel 标题为“会议”，按钮为“刷新”，空状态为“请选择一个会议。”。
7. 不刷新页面，在同一设置位置选择 English，观察同一标签和 Panel 分别变为 `Meetings`、`Meetings`、`Refresh`、`Select a meeting.`。
8. 再切回中文，确认无需 Host 重启、plugin 重装或页面刷新即可恢复中文；记录这三次观察为 Web UI 人工证据。任一文案未切换或必须刷新时 STOP。
9. 在 Host 终端发送一次 `Ctrl-C`，等待进程退出；执行 `lsof -nP -iTCP:31828 -sTCP:LISTEN`，命令必须无输出且退出码非 0。
10. 仅在第 9 项成立后删除任务创建的精确目录 `/Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation`，随后确认该路径不存在；不得删除 `dsh-workspace/convivium-user` 或任何其他 profile。
11. 在 readiness 的实现矩阵增加 Meeting Panel i18n 行，记录日期、分支/基线、实际命令、自动化 PASS 断言和第 6–8 项人工观察；不得写未运行的检查。
12. 明确保留 `Browser 自动化 smoke` 为 `Not Covered`；不得把人工观察描述为自动化证据。真实 profile smoke 只证明 Loader/Host/runtime 组合，人工 Web UI 检查证明语言切换。
13. 核对 Scope 每项均有测试/实现/证据，Non-goals 未进入 diff。
14. 执行关闭前文档迁移检查：长期产品行为已在 requirement、稳定接线已在 design、验证事实已在 readiness；interfaces/operations 无变化。
15. 使用 `rg` 查找本 RUNBOOK 文件名和标题引用；没有其他临时引用后，删除本 RUNBOOK。
16. 删除后再次运行 doc links 和 `git diff --check`；失败则恢复 RUNBOOK 并 STOP。

验证：

```bash
pnpm --dir=plugin verify
pnpm --dir=plugin smoke:profile --json
test ! -e /Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation
./scripts/install-from-source.sh --workspace /Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation
# 在专用前台终端启动：
/Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation/convivium-user/start.sh
# 完成人工切换并 Ctrl-C 停止 Host 后：
! lsof -nP -iTCP:31828 -sTCP:LISTEN
rm -rf -- /Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation
test ! -e /Volumes/storage/workspace/convivium/dsh-workspace/convivium-i18n-validation
node .github/scripts/check-doc-links.mjs
git diff --check
git status --short
```

PASS：`verify`、smoke、隔离安装、清理、文档和 diff 命令均满足上述退出码要求；smoke JSON 的全部场景和 Restore 为 `PASS`；中文 → English → 中文在同一已挂载页面即时切换且出现第 6–8 项固定文案；端口释放、隔离 workspace 已删除；`git status --short` 只包含本任务已列出的 requirements/design/readiness、Client production/tests 和 `plugin/package.json`，不含 RUNBOOK 或无关文件。

STOP：任一固定验证失败、smoke 缺凭据/超时/Restore 失败、隔离路径预先存在、Host/Browser 无法启动、固定文案未即时切换、端口未释放、隔离 workspace 未删除、出现无关 diff、Browser 自动化被写成 PASS，或删除后链接/diff 检查失败。报告复现命令和输出；不得缩减 `verify`、跳过 smoke/人工 Web UI 检查或清理用户 profile。

失败恢复：smoke 按 `HOW-TO-DSH-SMOKE.md` 只清理脚本创建的精确临时根；不得操作日常 `DSH_HOME`。RUNBOOK 删除后检查失败时必须用 `apply_patch` 恢复本文件。

## 9. 验证矩阵

| 行为 / 风险 | 证据 | 预期 |
| --- | --- | --- |
| typed `zh`/`en` key balance | `pnpm --dir=plugin typecheck:client` | 缺失/额外 key 编译失败；当前 key set 通过 |
| DSH locale register/bind/switch/dispose | `meeting-client-plugin.client.spec.ts` | `zh`/`en` 标签切换且 disposer 释放 |
| slot 动态标签和 locale seat | 同上 | label thunk 随 locale 变化；component 使用 framework `props.t` |
| 中文/英文 Panel shell | `meeting-panel-locales.client.spec.ts` | title、buttons、ARIA、states 与固定 literal 一致 |
| enum display mapping | 同上 + typecheck | lifecycle/round/archive 均显示本地化 label，无 raw enum |
| 业务内容不变 | 同上 | objective、Agenda title、message body 两种 locale 完全相同 |
| Protocol error UI | 同上 | 本地化 shell + 稳定 code，不显示 server message |
| unknown error UI | 同上 | 本地化 unavailable 文案 |
| control 语义不变 | `meeting-panel-local-controls.client.spec.ts` | version、action、reason、IDs 与 baseline 相同 |
| projection 权限边界 | `meeting-panel.client.spec.ts`、`meeting-panel-visibility.client.spec.ts` | 不新增隐藏字段或领域推导 |
| Client 回归 | 全部 client project tests | 全部通过 |
| 包组合与公开契约 | `verify:contract`、`verify` | locale injection、build、package contract 全部通过 |
| 真实 DSH Loader/Host/runtime | `smoke:profile --json` | 全场景及 Restore PASS |
| Browser 实际切换 | T9 隔离 DSH Web profile 人工检查 | 同一已挂载页面按中文 → English → 中文即时切换固定文案，无需刷新或重启 |
| Browser 自动化 | `Not Covered` | target runtime 尚无 Browser smoke；readiness 必须保留缺口 |
| 数据/事务/恢复/权限新行为 | `Not Applicable` | 本任务没有此类变更；全量 verify 只承担回归证据 |

## 10. 完成定义、迁移与删除条件

只有同时满足以下条件，任务才完成：

1. RUNBOOK 状态为 `Executable`，正式 requirement 与用户确认完全一致。
2. T1–T9 按顺序 PASS，没有未解决 STOP。
3. `convivium.meeting` 只有一个 owner，balanced `zh`/`en` dictionaries 通过 typecheck。
4. label 和已挂载 Panel 的运行时 locale 切换由自动化行为测试覆盖。
5. 当前 Meeting Panel 的全部 client-owned visible copy 与枚举展示 label 已本地化。
6. 用户/Agent 内容、commands、Protocol、Remote、Domain、Storage 和权限行为没有改变。
7. 固定完整验证、真实 profile smoke 和隔离 Web UI 人工切换检查实际通过，Browser 自动化缺口如实记录。
8. 长期行为已迁移到 requirements，稳定接线已迁移到 design，实际证据已迁移到 readiness。
9. RUNBOOK 没有剩余引用，删除后 doc links 与 `git diff --check` 仍通过。

本 RUNBOOK 不以 `completed` 或 archive 状态长期保留；满足上述条件后必须删除。未满足任一条件时保留文件和准确状态，不得宣称完成。

## 11. Author Audit

- Required Structure：已覆盖状态、契约、目标、断点、Scope/Non-goals、真相源、结构、调用链、文件/symbol、不变量、步骤、验证、收口。
- Decision Completeness：实现方案、namespace、key set、文案、错误策略、文件、symbol、命令和 PASS/STOP 已固定。
- 双向追踪：每个 Scope 项均进入 T1–T9 和验证矩阵；步骤未引入 Non-goals。
- 路径与 symbol：当前路径和现有 symbol 已核对；新增路径与 symbol 只有一个指定位置。
- 产品决定：第 3 节十项口径已由用户于 2026-09-22 确认；T1 已获得将其提升为正式 requirement 的依据。
- 外部验证：隔离 workspace、启动、三次语言观察、停止、端口断言和精确清理路径均已固定；Browser 自动化明确为 `Not Covered`。
- 审计结论：`Executable`。执行者无需选择产品、架构、接口、翻译范围、错误策略或验证豁免。
