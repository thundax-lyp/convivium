# RUNBOOK：会议面板 UI Primitives 迁移

状态：剩余证据迁移与收口。
建立日期：2026-09-09。工作分支：`codex/ui-primitives-research`。
执行从仓库根目录开始。

## 1. 执行者契约

本任务同时跨越呈现、选择交互、测试依赖转换、浏览器装配和正式文档边界，不是一次标签替换，适用 RUNBOOK。

本文件固定用户已同意的迁移范围和其技术实现。依据为 FR-9/FR-11、现有 Protocol 与用户已同意的结束结果单选组方向。控件技术决定已在正式设计的 Client control primitives 小节固定；不新增产品能力。

执行者只能顺序执行 T11 → T12，每一步 PASS 后才进入下一步。失败记录最后 PASS 步骤、文件/symbol、命令、输出与所需人工决定后 STOP。不得跳过、换工具结果冒充 Browser、改用 mocks 绕过真实 primitives、放宽类型/断言/Schema、扩大修改范围或修改本 RUNBOOK 后自行继续。

用户已授权依次执行 TODO，一任务一提交；已完成项按 TODO Rules 在对应提交中删除，剩余项移入当前任务并补充确认依据。恢复顺序为 T11 → T12。不得 push、PR 或 merge。不得修改相邻 DSH checkout、用户凭据或常用 profile。保留用户已有内容；human 调查稿不进入本分支提交。

## 2. 起点、终点与断点

目标终点：所有现有普通按钮使用 DSH Button；Pause/Skip/End reason 使用 DSH Input；End outcome 使用三个互斥 radio 语义的 Button；现有业务请求、禁写和事实刷新保持；全部固定验证通过并迁移证据后删除本 RUNBOOK。

| 当前断点 | 代码/文档证据 | 解决步骤 |
| --- | --- | --- |
| 正式设计仍为迁移待执行，readiness 缺本次证据 | Implementation Design 的 Client control primitives；SMOKE-VALIDATION-EVIDENCE | T11 |
| 临时方案与剩余任务尚未收口 | 本 RUNBOOK、TODO | T12 |

## 3. Scope、Non-goals 与真相源

剩余 Scope：将控件迁移、工程与真实 Browser 验证证据迁入 readiness，同步设计并关闭临时任务。

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
| `docs/40-readiness/assets/ui-primitives/` | 只读核对六张 PNG：skip-after、light-wide、light-narrow、dark-wide、dark-narrow、archived |
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

共同 STOP 输出：最后 PASS 的步骤、失败步骤、文件/symbol、实际执行命令或 Browser 动作、退出码/DOM/脱敏日志、仍存活的本次进程/目录以及需要作者解决的具体问题。任何非零测试/检查退出立即 STOP；仅已知 primitives 的 index.js.map 缺失警告允许保留输出后继续。无论何种失败，不减断言、不 mock primitives、不改 Schema、不改依赖、不顺手修复非允许文件。源码失败保留 diff，不回滚用户修改；

认证修复和完整工程验证已通过。此后任何源码变更都 STOP 交回作者，不复用旧结果。

## 7. 机械步骤

### T11：迁移设计与实际验证证据

前置状态：Skip 与 End Browser 验证和资源清理通过；六张截图已核对内容。
允许修改：Implementation Design、SMOKE-VALIDATION-EVIDENCE.md、CURRENT-IMPLEMENTATION-COVERAGE.md。
禁止修改：源码、历史验证数字、其他 Not Covered、Skill。

执行：
1. 将 Implementation Design 的 Client control primitives 小节中的唯一 `实施状态：迁移待执行。` 改为 `实施状态：已实现；验证见 [UI primitives migration](../40-readiness/SMOKE-VALIDATION-EVIDENCE.md#ui-primitives-migration)。`。
2. 在 SMOKE-VALIDATION-EVIDENCE.md 末尾新增 `## UI primitives migration`。写入下列固定字段；值直接取本次实际工具结果，缺值 STOP，不补猜测：日期；实际工作树/commit边界；React及primitives版本；本次已执行的控件迁移与回归测试命令/数量/退出码（来自既有工具输出，不要求重做已完成步骤）；认证修复测试、verify各子命令与artifact；Skip 与 End 的 Browser 产品名、两个ready场景、每项断言、截图链接；两个R的退出码/cleanup/路径不存在结果；sourcemap警告是否出现。
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

前置状态：T11 PASS；实际验证证据已迁移到T11。
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

## 8. 验证矩阵与适用边界

| Scope/不变量 | 正式依据与入口 | 剩余步骤 | 验证/证据 |
| --- | --- | --- | --- |
| 证据迁移 | Document Rules；实际测试与 Browser 工具输出 | T11 | 正式设计、readiness、六张截图与链接 |
| 关闭任务 | TODO Rules、RUNBOOK Rules | T12 | 删除检查与引用清理 |

Not Applicable：本任务不改变caller/capability、后端幂等、事务、数组原子性、存储重放、重启恢复、事件/receipt/outbox，因此不新增相应专项外部验证；现有verify仍必须通过。真实模型质量、长期压力与完整无障碍审计不由这次局部迁移证明。依赖/Schema/生成器修改不在scope，遇到即STOP。
