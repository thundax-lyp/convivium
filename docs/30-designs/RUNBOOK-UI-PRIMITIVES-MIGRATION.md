# RUNBOOK：会议面板 UI Primitives 迁移

状态：T9 尚未完成，真实 Browser 验证尚未通过。
建立日期：2026-09-09。工作分支：`codex/ui-primitives-research`。
执行从仓库根目录开始。

## 1. 执行者契约

本任务同时跨越呈现、选择交互、测试依赖转换、浏览器装配和正式文档边界，不是一次标签替换，适用 RUNBOOK。

本文件固定用户已同意的迁移范围和其技术实现。依据为 FR-9/FR-11、现有 Protocol 与用户已同意的结束结果单选组方向。控件技术决定已在正式设计的 Client control primitives 小节固定；不新增产品能力。

执行者只能顺序执行 T9 → T10 → T11 → T12，每一步 PASS 后才进入下一步。失败记录最后 PASS 步骤、文件/symbol、命令、输出与所需人工决定后 STOP。不得跳过、换工具结果冒充 Browser、改用 mocks 绕过真实 primitives、放宽类型/断言/Schema、扩大修改范围或修改本 RUNBOOK 后自行继续。

用户已授权依次执行 TODO，一任务一提交；已完成项按 TODO Rules 在对应提交中删除，剩余项移入当前任务并补充确认依据。恢复顺序为 T9 → T10 → T11 → T12。不得 push、PR 或 merge。不得修改相邻 DSH checkout、用户凭据或常用 profile。保留用户已有内容；human 调查稿不进入本分支提交。

## 2. 起点、终点与断点

目标终点：所有现有普通按钮使用 DSH Button；Pause/Skip/End reason 使用 DSH Input；End outcome 使用三个互斥 radio 语义的 Button；现有业务请求、禁写和事实刷新保持；全部固定验证通过并迁移证据后删除本 RUNBOOK。

| 当前断点 | 代码/文档证据 | 解决步骤 |
| --- | --- | --- |
| 真实 Skip、单选键盘、主题及归档交互尚未验证 | 本次 T9 未到 ready；当前 Client 单元测试不替代 Browser | T9–T10 |
| 正式设计仍为迁移待执行，readiness 缺本次证据 | Implementation Design 的 Client control primitives；SMOKE-VALIDATION-EVIDENCE | T11 |
| 临时方案与剩余任务尚未收口 | 本 RUNBOOK、TODO | T12 |

## 3. Scope、Non-goals 与真相源

剩余 Scope S1：修复 smoke Browser 认证接线并重跑工程门禁。S2：验证既有 Button/Input 和结束结果单选组的真实交互。S3：验证 React 与 Client artifact/宿主装配。S4：同步设计、readiness 并关闭临时任务。

Non-goals：改 DSH；升级 React/依赖/锁文件；Typert/轮询/locale；Pill/Toast/Markdown/StateDot；替代候选 select、证据 checkbox、textarea；新增页面/slot/服务/公共控件库；后端协议、权限、状态机、数据库与归档逻辑；Skill 更新。

正式依据：

- [Architecture](../00-governance/ARCHITECTURE.md)：Plugin Frontend 与公开模块入口边界。
- [Engineering Rules](../00-governance/ENGINEERING-RULES.md)：Implementation Economy、Engineering Checks。
- [Meeting Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)：FR-9 暂停/继续、FR-11 完整事实、缓存禁写及行内处置；不新增二次确认。
- [Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)：`EndMeetingInputV1`、Meeting Web routes、Local decision and risk control、Error And Permission Semantics。
- [Implementation Design](CONVIVIUM-IMPLEMENTATION-DESIGN.md)：Client fact visibility、Frontend、打包依赖与本地处置。
- [Current Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)：Client Fact Visibility、Not Covered。
- [Smoke 操作手册](../50-operations/HOW-TO-DSH-SMOKE.md)：Reassign browser-ready 模式、scribe-minutes Browser 入口及 Restore。

## 4. 数据、调用链与文件/symbol

### 4.1 局部数据

`endOutcome` 属于 ConviviumMeetingPanel 的 React 临时状态。值集合固定 `partial | no_consensus | cancelled`，required、非 nullable、默认 partial。现有会议选择/清空重置仍设置 partial。不写入持久状态、URL 或独立 store。

现有常量位于 `plugin/src/client/meeting-panel.tsx` 的 meetingsPath 之后：

```ts
const END_OUTCOMES = [
    { value: "partial", label: "Partial" },
    { value: "no_consensus", label: "No consensus" },
    { value: "cancelled", label: "Cancelled" }
] as const;
type EndOutcome = (typeof END_OUTCOMES)[number]["value"];
```

二者均不 export；endOutcome 的 useState 泛型为 EndOutcome，保持现有状态实现。控件选中态由 `endOutcome === option.value` 派生，不新增 selectedIndex 状态。

### 4.2 提交契约保持不变

`plugin/src/protocol/types.ts::EndMeetingInputV1` 的全部字段 required、非 nullable：

| 字段 | 类型与本 UI 的来源 |
| --- | --- |
| protocolVersion | 字面量 1 |
| meetingId | string，当前 selectedIdRef 与 detail.meetingId 一致性检查后的目标 |
| expectedMeetingVersion | number，当前已验证 detail.meetingVersion |
| outcome | 协议支持 completed/partial/no_consensus/cancelled；本 UI 只提交后三者 |
| reason | string，endReason；trim 后为空时禁止按钮提交 |
| acceptedDecisionIds | readonly string[]，本 UI 固定 [] |
| deferredAgendaItemIds | readonly string[]，本 UI 固定 [] |
| waivers | readonly { subjectId: string; kind: required_review 或 agenda_item; reason: string }[]，本 UI 固定 [] |
| requestId | string，现有 crypto.randomUUID()，每次真实提交生成 |

`commands.ts::EndMeetingInputSchema` 和 `results.ts::EndMeetingResultSchema` 不修改。成功 result 为 status（协议四种终止结果之一）与 terminationCode:string，使用现有 ProtocolSuccess envelope。400/404/409/503/500、ProtocolErrorV1 和无 body 情况全部沿用现有解析，不增加错误码或 fallback。

完整 UI 链路：list GET → 用户选择 → detail GET/Schema → endOutcome/reason 草稿 → End meeting → `controlMeeting("end")` 现有 guard → POST meetingPath/end → `readEnd` → `refreshSelectedMeeting` → 完整事实替换/错误缓存与禁写。选择 radio 只修改草稿，不产生 POST。

后端继续通过现有 HTTP/Runtime 受控路径提交领域事实与归档；本任务不改任何后端生产文件，不从 UI 宣告持久完成。actor、时间、领域事件、receipt、request hash、transaction、outbox 与恢复不新增字段或映射，完全沿用现有 owner，界面不生成这些事实。

### 4.3 允许文件与职责

| 文件 | 允许 symbol/内容 |
| --- | --- |
| `docs/30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md` | T11 更新既有 Client control primitives 实施状态及证据链接 |
| `docs/40-readiness/SMOKE-VALIDATION-EVIDENCE.md` | 新增 UI primitives migration 小节，记录实际命令/Browser/Restore |
| `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md` | Client Fact Visibility 增加本次证据索引，保留其他 Not Covered |
| `docs/50-operations/HOW-TO-DSH-SMOKE.md` | T9/T10 Browser 入口与 Restore 约束 |
| `docs/40-readiness/assets/ui-primitives/` | T9/T10 仅新增下文指定的6张 PNG：skip-after、light-wide、light-narrow、dark-wide、dark-narrow、archived |
| `TODO.md` | 按 TODO Rules 在获得执行授权后移动本次 `UI primitives/` 任务并填写确认依据；T12 删除已完成的本次任务及其顺序说明，保留其他内容 |
| 本 RUNBOOK | T12 删除；执行期间不回填进度或日志 |

不新增 production/test 文件；不改 manifest、tsdown、tsconfig、index.tsx、meeting-panel-view.tsx、meeting-panel-sections.tsx。若编译或装配必须修改这些文件，STOP 报告，不临场扩大。

## 5. 不变量

I1：选择选项零 POST；点击 End meeting 才提交，submitted outcome 必须是所选的三个协议值之一。
I2：任何时刻恰有一个选中项；默认与会议切换重置 partial；选择不跨会议延续。
I3：writesDisabled 或 writePendingRef.current 为真时 radio 点击/键盘均不可改变草稿；现有全部写 guard 与 fieldset disabled 不减弱。
I4：所有原 aria-label、data 属性、文案与操作回调保持；Submit type=submit，其余按钮 type=button；checkbox/select/textarea 原生交互保持。
I5：正式事实只能来自完整已校验 detail；错误持续可见，成功/拒绝刷新与无 POST 自动重试保持。
I6：从包根共享导入 Button/Input，不私带 React，不引入 JSX、React 19 ref 模式或另一 feature 内部组件。

## 6. 执行格式、检查与故障恢复

执行期间不修改本 RUNBOOK；失败交回作者修订，不能改步骤后自行继续。文件短名均按第4.3节唯一映射，禁止自行找同名替代文件。代码块标为“目标代码”的内容必须原样采用，再运行该步指定 Prettier；不是供执行者挑选的伪代码。

共同 STOP 输出：最后 PASS 的步骤、失败步骤、文件/symbol、实际执行命令或 Browser 动作、退出码/DOM/脱敏日志、仍存活的本次进程/目录以及需要作者解决的具体问题。任何非零测试/检查退出立即 STOP；仅已知 primitives 的 index.js.map 缺失警告允许保留输出后继续。无论何种失败，不减断言、不 mock primitives、不改 Schema、不改依赖、不顺手修复非允许文件。源码失败保留 diff，不回滚用户修改；Browser 失败先执行 R（第8节）再报告。

认证修复和完整工程验证已通过。此后任何源码变更都 STOP 交回作者，不复用旧结果。

## 7. 机械步骤

### T9：真实 Skip 控件验证

前置状态：认证修复与完整工程、artifact 检查已通过；Browser 工具必须支持 Chrome、只读 DOM 属性查询、真实键盘、视口设置和保存截图。只有 AX/截图能力不足以执行 N/G，必须在启动 Host 前 STOP，不能先消耗 attempt 窗口。
允许修改：本次新建临时 profile/workspace；截图 `docs/40-readiness/assets/ui-primitives/skip-after.png`。
禁止修改：smoke 源码、常用 profile、凭据；不发聊天消息或直接发 HTTP 业务命令。

执行：
1. 按第8节 B 的固定方法启动 reassign，保存 PTY handle。命令：

```bash
env CONVIVIUM_SMOKE_SCENARIO=reassign CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

2. 使用第8节 N 的唯一导航方法进入面板，按下表逐项操作和只读断言，不凭截图主观判定。

| 顺序 | 操作 | 必须成立 |
| --- | --- | --- |
| 1 | 在面板会议列表选含 data-meeting-id=probe.meetingId 的唯一按钮 | Meeting summary 的 Status 为 running；Current activity 当前 speaker 显示 participant-a；Skip current speaker 与 Skip reason 都存在 |
| 2 | 保持 Skip reason 空 | Skip current speaker.disabled=true |
| 3 | 在 Skip reason 输入 `Browser reassign evidence` | 输入 value 完全相等，Skip current speaker.disabled=false |
| 4 | 点击 Skip current speaker 一次 | 30秒内该控件消失；面板 role=alert 数量0 |
| 5 | 浏览器刷新，重复 N 导航并选择同一会议 | 旧 Skip 控件不出现；保存 skip-after.png；面板无加载/React错误 |

3. 无论表中通过还是失败，都执行 R；R PASS 后本步骤才可 PASS。

验证：上表全部 DOM 断言、B 的 ready 判据和 R 的清理断言。
PASS：全部满足，截图已写入唯一文件，实际输出与 R 结果均可从工具结果核对。
STOP：若初见页面时旧 attempt 已超时或 Skip 消失，先 R，再报告“attempt窗口失效”，不得把此轮计作 Browser Pass，也不现场延长 timeout/重试；其他断言失败同样先 R。

### T10：真实单选键盘、布局、主题与结束验证

前置状态：T9 含 R 已 PASS。
允许修改：本次临时 profile/workspace；下表指定5张截图。
禁止修改：任何源码、profile 外设置、根 CSS/token 注入、HTTP 直接提交、真实聊天输入。

执行：
1. 按 B 启动 scribe-minutes，再按 N 导航；命令：

```bash
env CONVIVIUM_SMOKE_SCENARIO=scribe-minutes CONVIVIUM_SMOKE_BROWSER_MODE=1 pnpm --dir plugin smoke:profile
```

2. 选 probe.meetingId 对应唯一会议。radiogroup End outcome 必须存在，恰有 Partial/No consensus/Cancelled，Partial aria-checked=true、tabIndex=0，另外两项 false/-1；End reason 空时 End meeting.disabled=true。
3. 点击 Partial 以固定焦点，按下 Shift+Tab 后再按 Tab，焦点必须回到 Partial。此后逐个发送真实按键并读 document.activeElement：ArrowRight→No consensus；ArrowRight→Cancelled；ArrowRight→Partial；ArrowLeft→Cancelled；Home→Partial；End→Cancelled；Home→Partial；Space→Partial。每步唯一选中态与焦点一致，会议仍未终止。最后 Tab 应离开组到 End reason，组内未选项不成为额外 Tab 站点。
4. 依次执行下面4行主题/视口场景。主题选择按第8节 H 完成。每次关闭设置回到面板后点击 Partial，再读第8节 G 几何结果，保存截图。截图根目录固定 `docs/40-readiness/assets/ui-primitives/`。

| 主题 | 视口 CSS 像素 | 截图文件 |
| --- | --- | --- |
| light | 1280×900 | light-wide.png |
| light | 768×900 | light-narrow.png |
| dark | 1280×900 | dark-wide.png |
| dark | 768×900 | dark-narrow.png |

5. 通过 H 恢复初始主题，视口恢复本次新标签初始尺寸。输入 End reason=`UI primitives browser evidence`，Partial 保持唯一选中，End meeting 应启用；点击一次。
6. 最长30秒内，按每次新的 DOM snapshot 读取 Meeting summary 中 dt 文本为 Status 的相邻 dd，必须最终为 archived。刷新并重复 N 后选择 probe.meetingId，Status 仍 archived；End meeting、End outcome 不存在；`Minutes draft (non-authoritative)` 文本存在，probe.observed.source.id 与 probe.observed.draft.id 对应消息内容仍可读。保存 archived.png。
7. 运行期间 console 不得出现 Invalid hook call、React加载失败、Convivium evaluate/activate error；如出现立即失败。无论成功或失败，执行 R。

验证：上表4行均通过 G，键盘各步通过，刷新后 archived 与引用纪要保持，5张截图可读取，R PASS。
PASS：全部条件满足；不把按钮消失或 ready JSON 当作归档完成。
STOP：任何步骤无法定位、键盘/几何/主题断言失败、等待超过30秒；先 R 再报告，不换 selector 猜流程或改 smoke。

### T11：迁移设计与实际验证证据

前置状态：T10 含 R PASS。
允许修改：Implementation Design、SMOKE-VALIDATION-EVIDENCE.md、CURRENT-IMPLEMENTATION-COVERAGE.md。
禁止修改：源码、历史验证数字、其他 Not Covered、Skill。

执行：
1. 将 Implementation Design 的 Client control primitives 小节中的唯一 `实施状态：迁移待执行。` 改为 `实施状态：已实现；验证见 [UI primitives migration](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#ui-primitives-migration)。`。
2. 在 SMOKE-VALIDATION-EVIDENCE.md 末尾新增 `## UI primitives migration`。写入下列固定字段；值直接取本次实际工具结果，缺值 STOP，不补猜测：日期；实际工作树/commit边界；React及primitives版本；本次已执行的控件迁移与回归测试命令/数量/退出码（来自既有工具输出，不要求重做已完成步骤）；认证修复测试、verify各子命令与artifact；T9/T10的Browser产品名、两个ready场景、每项断言、截图链接；两个R的退出码/cleanup/路径不存在结果；sourcemap警告是否出现。
3. 同小节写 `Not Covered`：未采用的组件、其他DSH/React版本、非Web、完整可访问性审计、真实模型质量、压力/长期资源泄漏。Closure 只有在全部门禁通过时写“本次迁移验证完成”，不能扩大到 FR-11 全量验收。
4. Current Coverage 的 `### Client Fact Visibility` 表追加一行：`UI controls | Button/Input 与 End outcome 单选组的真实包、键盘、缓存禁写、重复提交、Browser/Restore；见 [UI primitives migration](./SMOKE-VALIDATION-EVIDENCE.md#ui-primitives-migration)`。保留现有其他行与全局 Not Covered。

验证：
```bash
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：两命令退出0；每个实际结果有本次实际工具输出依据、6张图片路径有效、没有将本文件作为长期依据的新增引用。
STOP：任何证据缺失、图片不可读或历史边界被覆盖；保留 RUNBOOK。

### T12：关闭与删除

前置状态：T9、T10、T11全部PASS；实际验证证据已迁移到T11。
允许修改：删除本 RUNBOOK；按 [TODO Rules](../00-governance/TODO-RULES.md) 删除 `TODO.md` 中本次已完成的 `UI primitives/` 任务及其顺序说明。禁止修改：其他 TODO、用户其他文件、源码；按一任务一提交执行收口 commit；不push/PR/merge。

执行：
1. 运行下列查询。rg 预期仅匹配本文件和 `TODO.md` 中本次 `UI primitives/` 任务的依据链接；若有其他引用，STOP交作者处理，不删除陌生引用。git diff 白名单只允许第4.3节指定文件与6张PNG；后端/依赖检查必须零diff。

```bash
rg -n 'RUNBOOK-UI-PRIMITIVES-MIGRATION|RUNBOOK：会议面板 UI Primitives 迁移' TODO.md docs .agents
git status --short
git diff --stat
git diff --exit-code -- plugin/src/http plugin/src/protocol plugin/src/runtime plugin/src/domain plugin/src/repository plugin/package.json plugin/pnpm-lock.yaml plugin/tsdown.config.ts
node .github/scripts/check-doc-links.mjs
git diff --check
```

2. 在工具会话内保留本文件与 `TODO.md` 完整文本。核对本次剩余 `UI primitives/` 任务的验收点均已满足（T12 的删除后检查在本步完成）；删除这些任务及其顺序说明，保留三个固定区域和其他任务。然后使用文件编辑工具删除本 RUNBOOK，不创建archive副本。此时 TODO 删除为工作区同步，只有本步 PASS 才视为完成；删除后检查通过再创建本任务 commit。再运行：

```bash
node .github/scripts/check-doc-links.mjs
git diff --check
```

3. 再运行步骤1的 rg 查询，预期零匹配、退出码1；匹配到任何内容均 STOP。

PASS：删除前后检查均通过；本次 TODO 与 RUNBOOK 引用已清理；设计/证据与图片在长期文件中；最终回复报告删除后检查。
STOP：删除后任一检查失败，必须先从保留文本恢复本 RUNBOOK 与本步删除的 TODO 内容，再报告；不回滚用户改动。

## 8. Browser 固定操作规约

本节属于 T9/T10 的必需动作，不是可选建议。动作使用 Browser 工具；读取 DOM/计算样式只读执行，不从页面脚本调用业务服务。工具不能执行某一指定动作时 STOP，不自行改为 HTTP 或源码注入。

### B：启动与唯一 ready 数据

用 exec_command 分配 tty=true 启动该步骤命令，保留其返回的 session handle；每次读取输出的等待不超过60秒。ready前失败同样调用R。脚本boot超时固定沿用现有120秒，不改环境覆盖。

必须从同一个 stdout JSON 对象读取：顶层 ok=true、profile=web、provider=spawn、scenario=本次场景；`probe.ok=true`、`probe.scenario=本次场景`、`probe.browserReady=true`、`probe.meetingId` 非空、`probe.captainSessionId=convivium-smoke-captain`。URL取唯一 `CONVIVIUM_SMOKE_BROWSER_URL=` 行，根目录取唯一 `CONVIVIUM_SMOKE_TEMP_ROOT=` 行。把根目录和JSON顶层port分别在工具会话中保存为 UI_SMOKE_TEMP_ROOT 与 UI_SMOKE_PORT；port必须是1–65535的整数，且与URL端口一致。URL必须为本次 127.0.0.1 origin 的 `/`，只包含一个43字符 base64url token；不能丢弃 query。Browser 首次访问由 DSH 交换 cookie 并重定向到裸 `/`，后续刷新沿用 cookie。token/cookie 不进入提交、截图或 readiness，报告 URL 时将 token 值替换为 `<redacted>`。不能从旧输出或端口猜测。

reassign 另要求 probe.assertions 精确为 [browser-reassign-ready]，probe.observed.currentSpeakerId=participant-a、currentAttemptId=oldAttemptId，且oldAttemptId非空。scribe-minutes 另要求 assertions精确为 [minutes-context-visible, minutes-invalid-atomic, minutes-replay-stable, minutes-http-equal]；source/draft取probe.observed.source/draft。

### N：新标签页与会议导航

在 Chrome 新建只用于本步骤的标签，URL严格来自B。首次读取页面状态，在role=treeitem中找到可见标题包含 `Convivium smoke` 且有aria-expanded属性的唯一workspace行；false时点击一次，true时不点击。展开后重新获取该行，再用以下唯一DOM关系定位Session，不依赖CSS module生成的class名：

1. `tree = workspace.closest('[role="tree"]')`，必须存在。
2. 在 `Array.from(tree.children)` 中选 `child.contains(workspace)` 为true的唯一直接子元素，记为group；必须为DIV。该元素对应上游WorkspaceBrowser的groupSection，workspace行与Session行在其中为相邻分支，不在workspace treeitem内部查询Session。
3. 在group内查找 `[role="treeitem"][aria-expanded]`，可见节点必须恰有一个且就是workspace；否则STOP，不能向更高祖先扩大范围。
4. 在同一group内查询 `[role="treeitem"]:not([aria-expanded])`，只保留getClientRects().length>0且computed visibility不为hidden的节点。必须恰有一个，点击它。fixture只attach了captain；零个或多个均STOP，不选first()。

不要按可见标题猜session ID——上游会用工作目录basename作为标题。上述关系依据固定版本的WorkspaceBrowser groupSection和ProjectRowItem/HoverCard包装结构；如实际DOM结构不符合，交作者核对，不临场换selector。

点击叶子后，等待role=tab、名称精确为Meetings的唯一节点，点击它；等待data-testid=convivium-meeting-panel。选择面板内data-meeting-id等于B中probe.meetingId的唯一按钮。每个等待上限30秒；刷新后重复此同一流程。严禁新增导航fallback。

### H：主题选择

从当前DOM选择名称精确为Settings或设置的唯一button：只允许其中恰好一个可见，零个或多个STOP。点击后读取唯一dialog；在dialog内点击General或通用设置的唯一button。Light/浅色、Dark/深色、System/跟随系统按这三个双语对识别，每一对只能有一个可见项；用aria-pressed=true读取并在工具会话中保存初始选项。

切换时点击目标项，等待其aria-pressed=true；关闭dialog使用其中名称精确为Close或关闭的唯一button。恢复时重新打开同一设置路径并点击该初始项。不能以直接改document.style、localStorage或theme服务代替。

### G：四种布局状态的只读数值检查

只读DOM从面板取得radiogroup和三个role=radio、End reason input、其parentElement、End meeting。每个节点都必须唯一存在；读取每个getBoundingClientRect()和computedStyle。

断言全部为true：

- 每个radio的height与28差值≤1px，Input parent的height与32差值≤1px；width/height均>0。
- 每个radio、Input parent、End meeting的left≥面板left−1，right≤面板right+1。
- 三个radio任意一对的矩形交叠宽度≤1或交叠高度≤1；Input parent与End meeting也满足此条件。
- 三个radio都是可见、可用；Partial aria-checked=true；其backgroundColor不同于No consensus，且两者computed color均非透明。
- 点击Partial后document.activeElement是该radio；用真实Tab出组再Shift+Tab回来，焦点仍为Partial。读取focus时outlineStyle/outlineWidth；若outline为none或宽度为0且boxShadow为none，STOP，不能宣称可见焦点。

不以人类审美判断替代这些断言；截图补充可审阅证据。截图用工具写到T9/T10指定精确PNG路径，文件可读取才通过。

### R：分别判断任务结果与清理结果

本节不改变任何失败步骤的STOP结论。任务失败但清理成功仍为STOP；不能把进程退出1直接解释为清理失败，也不能把清理成功解释为场景PASS。

1. 在工具会话中保存本次是否创建标签、初始视口、初始主题及PTY状态。已改主题则按H恢复；已建标签则恢复视口并关闭。任何UI恢复失败都保留该失败并继续以下进程停止，不因浏览器失败留下Host。
2. 先查看本次PTY工具返回的状态。若已提供最终exit_code，则保存它，不向已退出的handle发送Ctrl-C。只有仍在运行的PTY才发送一次Ctrl-C；分段等待，每次最多30秒、总计最多120秒，直到工具提供最终退出状态。超时不强杀未知进程，报告handle和本次输出并STOP。
3. 正常场景完成后主动停止wrapper：要求最终exit_code=0且stdout出现 `CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok`。这表示脚本成功路径已走完Host停止、场景根/构建根清理和端口检查。仍使用下方命令独立核对已公开的场景根和端口。
4. 脚本在ready前或运行中异常退出：允许最终exit_code非0且缺少cleanup标记，因为该标记在main成功返回路径上，异常时不会打印。如果UI_SMOKE_TEMP_ROOT和UI_SMOKE_PORT均已从本次B输出取得，运行下方独立检查；通过时只能报告“原任务失败；已公开场景资源清理通过”，未知的构建根/进程树仍Not Verified。该分支不能让T9/T10获得PASS。
5. 若异常发生在资源信息输出之前，缺少根路径或端口，则不运行缺参命令、不猜路径、不glob扫描。报告“原任务失败；资源信息未公开，清理结果Not Verified”，附最终退出状态与脱敏错误。缺少成功标记本身不是清理失败证据。后续由作者决定如何取得缺失诊断，执行者不改smoke脚本。

独立检查命令只在两个变量都已取得时执行：在同一检查shell中，将 UI_SMOKE_TEMP_ROOT 与 UI_SMOKE_PORT 分别设为工具会话保存的本次精确值并export；不得取环境中先前残留值。命令只检查根存在性并临时独占绑定该loopback端口，成功后立即关闭监听，不发HTTP请求、不删除文件。

```bash
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createServer } from 'node:net';
const root = process.env.UI_SMOKE_TEMP_ROOT;
const portText = process.env.UI_SMOKE_PORT;
assert.ok(root && isAbsolute(root), 'Missing exact smoke root');
assert.ok(portText && /^[0-9]+$/.test(portText), 'Missing exact smoke port');
const port = Number(portText);
assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535);
try {
    await lstat(root);
    assert.fail('Smoke root still exists');
} catch (error) {
    if (error?.code !== 'ENOENT') throw error;
}
const server = createServer();
try {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
    });
} finally {
    if (server.listening) await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}
console.log('Published smoke root absent and port released');
JS
```

正常场景R PASS：UI恢复完成，wrapper退出0、成功标记存在、独立命令退出0。异常场景只有“公开资源已清理”或“Not Verified/清理失败”的诊断，不产生步骤PASS。目录仍存在、独占绑定失败、进程未退出或UI恢复失败均需明确报告；不得删除或终止无关资源。

## 9. 验证矩阵与适用边界

| Scope/不变量 | 正式依据与入口 | 剩余步骤 | 验证/证据 |
| --- | --- | --- | --- |
| S1/I6 | DSH 启动认证、smoke preflight | 已完成 | token交换、cookie隔离、错误脱敏、完整verify |
| S2/I1–I5 | FR-9/11；Client control primitives | T9/T10 | Skip、radio键盘、Input、主题、刷新与归档；现有70项Client测试由verify重跑 |
| S3/I6 | Architecture；平台共享入口 | T9/T10 | artifact外部依赖已验证；真实宿主加载及交互待验证 |
| S4 | Document Rules、TODO Rules | T11/T12 | 正式设计、readiness、6张截图、链接及删除检查 |

Not Applicable：本任务不改变caller/capability、后端幂等、事务、数组原子性、存储重放、重启恢复、事件/receipt/outbox，因此不新增相应专项外部验证；现有verify仍必须通过。真实模型质量、长期压力与完整无障碍审计不由这次局部迁移证明。依赖/Schema/生成器修改不在scope，遇到即STOP。
