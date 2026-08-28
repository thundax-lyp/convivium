# Codex 实现复杂度控制修改 RUNBOOK

状态：待执行

## 1. Purpose

本文固定 Convivium 仓库中 Codex 实现、模块审查、PR Review 和 Codex review comment 修复工作流的复杂度控制改动。目标是让 Codex 默认采用满足当前行为与必要边界的最小安全结构，同时避免把“减少复杂度”误用为拒绝正确性、安全性、事务、权限或生命周期边界的理由。

本文是一次性执行 RUNBOOK，不是长期规则真相源。执行完成后，长期规则分别落入本文件指定的 `AGENTS.md`、专项设计和 Skill；验证并提交后删除本 RUNBOOK。

## 2. Scope And Non-goals

### 2.1 Scope

本任务只修改以下六个长期文件：

1. `AGENTS.md`
2. `docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md`
3. `.agents/skills/dsh-plugin-development/SKILL.md`
4. `.agents/skills/convivium-module-review/SKILL.md`
5. `.agents/skills/convivium-pr-review/references/review-checks.md`
6. `.agents/skills/convivium-codex-comment-fix/SKILL.md`

本 RUNBOOK 自身是第七个任务文件，只用于执行期间保存固定方案。

### 2.2 Non-goals

- 不修改 `plugin/` 源码、测试、配置、依赖或构建入口。
- 不修改产品需求、Agent Meeting Protocol、SQLite Repository Interface 或 Domain Model。
- 不新增 `convivium-business-loop-design`、通用架构设计或复杂度控制 Skill。
- 不修改任何 `agents/openai.yaml` 的隐式触发策略、展示名或默认 Prompt。
- 不修改 `convivium-push-pr`、`convivium-readiness-review` 或 PR Review 的其他 reference。
- 不以文件数、调用方数量、抽象层数量或代码行数单独判定过度设计。
- 不把现有安全边界、权限边界、事务边界、DSH adapter、持久化边界或生命周期隔离视为应当删除的复杂度。
- 不在本任务中处理根 `AGENTS.md` 的 Current State 是否过时；该问题必须另行确认和收口。
- `TODO.md` 只按 `TODO-RULES.md` 追踪本 RUNBOOK 的未关闭任务，不作为第七个长期目标文件；用户确认执行前，任务保持在“待审阅任务项”。

## 3. Related Requirements And Interfaces

- 仓库架构边界：[`../00-governance/ARCHITECTURE.md`](../00-governance/ARCHITECTURE.md)。
- 文档治理：[`../00-governance/DOCUMENT-RULES.md`](../00-governance/DOCUMENT-RULES.md)。
- TODO 与 RUNBOOK 收口：[`../00-governance/TODO-RULES.md`](../00-governance/TODO-RULES.md)。
- 会议编排范围控制：[`MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md`](./MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md)。

本任务不改变产品行为或跨边界协议，因此不修改 `10-requirements/` 或 `20-interfaces/`。

## 4. Fixed Principles

六个长期文件必须共同表达以下固定语义，不得在执行时改写为更宽或更窄的规则：

1. 默认采用满足当前行为和不变量的最小安全改动。
2. 只禁止没有当前证据价值、仅为假设性未来能力预建的复杂度。
3. 新机制可以由当前需求、接口契约、架构或安全不变量、可复现失败、必要隔离边界或多个当前消费者中的任一项证明；不得强制同时满足全部条件。
4. 单一消费者、单一实现、文件数量或代码行数只是调查信号，不能单独形成 finding。
5. finding 是否成立与 reviewer 建议的具体方案是否合适必须分别判断。
6. finding 成立但建议方案过大时，接受 finding，实施能够消除同一触发条件的更小修复。
7. 明确不成立或明确超出已确认范围的评论可以拒绝并 resolve；真实但暂缓的 finding 和需要决策的 finding 必须保持 unresolved。
8. 范围收窄不能削弱 caller binding、authorization、ownership、事务、幂等、恢复、资源释放或其他必要边界。

## 5. File-by-file Fixed Changes

执行时必须按本节顺序修改。若任何插入锚点不存在或原文与本节不一致，停止执行并重新审阅 RUNBOOK，不得猜测新位置。

### T1：更新根 `AGENTS.md`

目标文件：`AGENTS.md`

插入位置：在 `## Project Direction` 的最后一条与 `## Documentation Governance` 之间插入以下完整章节：

```md
## Implementation Economy

- 默认采用满足当前已确认行为和必要不变量的最小安全改动，不为仅有假设性未来价值的能力预建机制。
- 新增抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点前，必须指出至少一项当前依据：需求或接口契约、架构或安全不变量、可复现失败、必要隔离边界，或多个当前消费者需要的稳定共享语义。
- 单一消费者、单一实现、文件数量或代码行数只能触发进一步检查，不能单独证明过度设计；权限、事务、持久化、外部系统和生命周期边界可以因隔离责任而独立存在。
- finding 是否成立与建议方案是否合适必须分别判断；较小方案能够消除同一触发条件并保持必要边界时，采用较小方案。
- 未经当前任务确认，不顺带重构稳定路径、建立通用框架、扩展协议或实现后续阶段；完成当前范围必须扩张时，停止并报告新增范围。
```

不得修改 `AGENTS.md` 的其他章节。

验收：

- 章节只出现一次。
- 明确包含“最小安全改动”，不能缩写为单纯的“最少代码”。
- 明确保留单消费者的必要隔离例外。
- 明确区分 finding 与建议方案。

### T2：修正会议编排范围控制的绝对消费者门槛

目标文件：`docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md`

#### T2.1 替换 Responsibilities 第 4 条

将以下原文：

```md
4. **机制必须有当前消费者**：新增 adapter、状态机、计数器、timer、rebind 或日志 schema，必须由当前范围内的调用方使用，并对应明确验收点；不得为假设中的后续阶段预建。
```

完整替换为：

```md
4. **机制必须有当前证据价值**：新增 adapter、状态机、计数器、timer、rebind 或日志 schema，必须由当前需求或接口契约、架构或安全不变量、可复现失败、必要隔离边界，或当前范围内的消费者及验收点证明；仅有假设性未来用途不足以引入。单一消费者不自动构成过度设计，仍需判断该机制是否提供必要隔离或跨 command 语义。
```

#### T2.2 替换 Acceptance 第 1 条

将以下原文：

```md
1. 每个新增机制都能定位到当前消费者、依据文档和验收点。
```

完整替换为：

```md
1. 每个新增机制都能定位到当前需求或契约、已确认不变量、可复现失败、必要隔离边界，或当前消费者和验收点中的至少一类证据；没有机制仅以未来可能使用为依据。
```

不得修改本专项设计的其他条目，不得扩大其 Scope。

验收：

- 文件中不再出现“机制必须有当前消费者”这一绝对标题。
- `State And Failure Handling` 与 `Security And Observability` 保持原文。
- 新规则不能被解释为允许无消费者、无失败、无边界、无正式依据的预建机制。

### T3：给 DSH 开发 Skill 增加实现前复杂度门禁

目标文件：`.agents/skills/dsh-plugin-development/SKILL.md`

插入位置：在 `## 工作流` 的编号列表之后、`## 不可违反的边界` 之前插入以下完整章节：

```md
## 范围与复杂度门禁

实现前先定义当前行为、必要失败路径、权限边界和最窄验证。默认复用现有模块和状态，只完成当前已确认范围。

新增抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点前，至少记录一项当前依据：

- 当前需求或接口契约；
- 已确认的架构或安全不变量；
- 可复现的正确性、并发、恢复或生命周期失败；
- 必须隔离的外部系统、权限、事务、持久化或生命周期边界；
- 多个当前消费者需要的稳定共享语义。

仅有假设性未来用途时不得新增。单一消费者、单一实现、文件数量或代码行数不能单独证明机制多余；若现有实现能够在不削弱必要边界的前提下清楚承载当前行为，选择更小方案。完成当前任务必须扩大范围时停止实现，报告新增范围及依据，不自行扩张。
```

同时在 `## 输出要求` 第一段末尾追加以下两句：

```md
说明本次新增机制的当前依据，或明确说明没有新增机制。若在候选方案中舍弃了更复杂方案，简述更小方案如何覆盖同一触发条件和必要边界。
```

不得修改该 Skill 的 front matter、官方来源优先级、验证顺序或不可违反的 DSH 边界。

验收：

- 复杂度门禁位于工作流之后，不能放入 reference 代替主 Skill 指令。
- 不把“多个消费者”写成所有抽象的强制条件。
- 运行时、权限、事务和生命周期隔离明确作为独立依据保留。

### T4：给模块审查 Skill 增加复杂度 finding 门槛

目标文件：`.agents/skills/convivium-module-review/SKILL.md`

#### T4.1 增加检查项

在 `## Convivium-specific checks` 的最后一个检查项之后、`不要因为没有使用某个具体 Skill` 段落之前，插入以下完整内容：

```md
- 检查新增或现存机制是否只有假设性未来用途，是否增加了无当前证据价值的状态、分支、持久化或维护成本。
- 检查是否能够用更小结构消除同一触发条件，同时保持权限、事务、持久化、外部系统和生命周期隔离。

复杂度 finding 必须指出多余机制的当前成本、缺失的依据和可行的更小边界。单一消费者、单一实现、文件数量、代码行数或个人风格不能单独达到 finding 门槛。必要的安全、授权、事务、持久化、DSH adapter 和生命周期边界即使只有一个消费者，也不能仅因“抽象较多”报告为缺陷。
```

#### T4.2 扩展 finding 类型

将输出模板中的：

```md
- 类型：正确性 / 架构 / 接口 / 生命周期 / 持久化 / 安全 / 性能 / 测试
```

替换为：

```md
- 类型：正确性 / 架构 / 接口 / 生命周期 / 持久化 / 安全 / 性能 / 测试 / 范围与复杂度
```

不得调整该 Skill 的审查范围、只读边界、Required context 或其他 finding 格式。

验收：

- 复杂度 finding 必须同时包含实际成本和更小安全边界。
- 单消费者只能触发调查，不能直接形成 finding。
- “更小结构”明确受必要边界约束。

### T5：给 PR Review 检查表增加复杂度证据链

目标文件：`.agents/skills/convivium-pr-review/references/review-checks.md`

#### T5.1 扩展必经基础检查

在 `架构维护性` 基础检查之后追加：

```md
- 范围与复杂度：新增机制是否有当前需求、契约、不变量、可复现失败、必要隔离边界或当前消费者作为依据；是否存在覆盖同一触发条件的更小安全改动。
```

#### T5.2 扩展 changed surface 检查

在 `验证链` 之后追加：

```md
- **复杂度链**：新增抽象、状态、事件、adapter、worker、依赖、兼容层或扩展点逐项连接到当前依据、实际成本和必要 consumer/sink；仅有假设性未来用途时标记为候选 finding。
```

#### T5.3 扩展 Findings 门槛

在 `## Findings 门槛` 现有段落之后追加：

```md
范围与复杂度 finding 还必须同时证明：

1. 当前 diff 引入或实质放大了额外状态、分支、持久化、依赖或维护成本；
2. 该成本没有当前需求、契约、不变量、可复现失败、必要隔离边界或当前消费者支撑；
3. 存在能够保持必要安全、权限、事务、持久化和生命周期边界的更小方案。

单一消费者、单一实现、文件数量、代码行数和个人设计偏好不能单独形成 finding。finding 是否成立与 diff 作者选择的具体修复方案必须分别评价。
```

不得修改 PR Review 的 evidence matrix、ledger、优先级定义或只审当前 diff 的边界。

验收：

- `复杂度链` 与现有七条链并列，不替代契约、安全或验证检查。
- P3 仍要求“确实值得修改”，不能把建议性简化批量报告为 finding。
- 不因抽象只有一个消费者而自动报错。

### T6：修正 Comment Fix 的分类、最小修复与 resolve 语义

目标文件：`.agents/skills/convivium-codex-comment-fix/SKILL.md`

#### T6.1 修正 front matter 描述

将 front matter 中以下原文：

```yaml
description: Explicitly invoked workflow for processing unresolved Codex review threads on a Convivium pull request, fixing actionable findings, and closing each thread. Accepts #5 or 5; when omitted, resolves the PR for the current branch.
```

完整替换为：

```yaml
description: Explicitly invoked workflow for processing unresolved Codex review threads on a Convivium pull request, applying minimal safe fixes to accepted findings, resolving accepted or rejected threads, and leaving deferred or decision-blocked threads unresolved. Accepts #5 or 5; when omitted, selects the open PR for the current branch.
```

不得修改 front matter 的 `name` 或分隔符。

#### T6.2 修正目标终点

将 `参数与目标` 中以下原文：

```md
- 目标终点是：每条评论已分类、已 reaction、已修复或说明不采纳、已回复并 resolved；仅报告审查额度不足的冗余 Codex 评论直接删除。代码修复必须形成 commit。
```

完整替换为：

```md
- 目标终点是：每条评论已分类并完成对应 reaction；已接受 finding 已修复、验证、回复并 resolved，明确拒绝的 finding 已说明依据、回复并 resolved，真实但暂缓或需要决策的 finding 已说明状态并保持 unresolved；仅报告审查额度不足的冗余 Codex 评论直接删除。代码修复必须形成 commit。
```

#### T6.3 新增 finding 与方案分离章节

在 `## 评论来源与修复归属` 完整章节之后、`## 固定流程` 之前插入：

```md
## Finding 与建议方案分离

评论指出的 finding 是否成立，与评论建议的具体修复方案是否合适必须分别判断。finding 的有效依据可以来自当前需求或验收点、接口契约、架构或安全不变量、已有行为，或可复现的正确性、并发、恢复、权限和生命周期失败；不得只因没有逐字对应的验收点而拒绝真实缺陷。

处理结果固定分为四类：

- `accept-as-proposed`：finding 成立，建议方案是消除触发条件的最小安全改动；添加 👍 并按建议修复。
- `accept-with-smaller-fix`：finding 成立，但建议方案引入没有当前证据价值的抽象、状态、依赖、兼容层、worker、协议扩张或无关重构；仍添加 👍，实施保持必要边界的更小修复，并在回复中说明替代关系。
- `reject`：finding 不成立、重复，或建议只服务于明确未确认的未来能力且不存在当前缺陷或必要边界；添加 👎，不修改代码，回复具体依据后可以 resolve。
- `defer-or-decision`：finding 成立但当前无法安全修复，或需要产品、接口、架构、权限或范围决策；添加 👎，不把不确定性伪装成过度设计，回复 blocker 或所需决策并保持 unresolved。

选择最小修复时必须保留 caller binding、authorization、ownership、事务、幂等、持久化、恢复、资源释放和生命周期边界。单一消费者、单一实现、文件数量或代码行数不能单独证明评论方案过度设计。
```

#### T6.4 替换固定流程第 3 步

将第 3 步及其两个子项完整替换为：

```md
3. 先按“冗余额度提示”规则删除可确认的额度提示，并重新读取其来源和 threads；再对每条剩余 Codex finding 建立触发条件、影响、代码证据和正式依据，按“Finding 与建议方案分离”分类：
   - `accept-as-proposed` 或 `accept-with-smaller-fix`：先对原评论添加 👍，再实现最小安全修复和回归测试。
   - `reject`：添加 👎，不修改代码，并在回复中说明 finding 不成立或明确超出当前范围的具体依据。
   - `defer-or-decision`：添加 👎，不修改代码，回复 blocker、缺失决策或 follow-up 条件，并保持 thread unresolved。
```

#### T6.5 收紧回复要求

在固定流程第 7 步末尾追加：

```md
`accept-with-smaller-fix` 的回复还必须分别说明原 finding 的触发条件、未采用建议方案的原因，以及更小修复如何消除同一触发条件并保持必要边界。
```

#### T6.6 增加禁止顺带重构规则

在 `## 安全与停止条件` 中，紧接“不自动 merge”条目后插入：

```md
- 不因 review comment 提出重构就顺带整理无关代码、拆分模块、建立通用框架、扩展协议或实现后续阶段；修复范围以消除已确认触发条件并保持必要边界的最小改动为准。
```

除 T6.1 固定的 `description` 外，不得修改 Comment Fix 的其他 front matter。不得修改显式调用要求、GitHub 删除规则、commit/push 授权、两轮上限或 reaction → reply → resolve 顺序。

验收：

- `accept-with-smaller-fix` 仍使用 👍，不能因拒绝原方案而使用 👎。
- `reject` 与 `defer-or-decision` 的 resolve 结果明确不同。
- 没有显式验收点不能单独成为拒绝真实缺陷的理由。
- finding 成立但没有 commit 时仍不得声称已修复或 resolve。
- 目标终点不再与“暂缓 finding 不得 resolve”冲突。
- front matter 不再承诺关闭所有 thread，也不再把省略参数描述为 resolve PR。

## 6. Explicitly Unchanged Files

执行时必须确认以下文件无 diff：

- `docs/00-governance/ARCHITECTURE.md`
- `docs/00-governance/DOCUMENT-RULES.md`
- `docs/00-governance/TODO-RULES.md`
- `docs/AGENTS.md`
- `.agents/skills/*/agents/openai.yaml`
- `.agents/skills/convivium-pr-review/SKILL.md`
- `.agents/skills/convivium-pr-review/references/evidence-matrix.md`
- `.agents/skills/convivium-pr-review/references/review-dimensions.md`
- `.agents/skills/convivium-pr-review/references/coverage-and-output.md`
- `.agents/skills/convivium-push-pr/SKILL.md`
- `.agents/skills/convivium-readiness-review/SKILL.md`
- `plugin/**`

如果这些文件因用户已有改动而在执行前已经 dirty，只能保留并披露，不得将其纳入本任务。

## 7. Execution Sequence

### T0：准备

1. 读取 `docs/AGENTS.md`、`ARCHITECTURE.md`、`DOCUMENT-RULES.md`、`TODO-RULES.md`。
2. 创建位于当前 Git worktree metadata 下的本任务专用状态目录，并记录执行前所有 tracked、staged 和 untracked 文件路径。固定路径必须原本不存在；存在时说明有未收口的前次执行，必须停止并人工处理，不能覆盖：

```sh
CONVIVIUM_ECONOMY_STATE="$(git rev-parse --git-path convivium-economy-runbook-state)"
test -n "$CONVIVIUM_ECONOMY_STATE"
test ! -e "$CONVIVIUM_ECONOMY_STATE"
mkdir "$CONVIVIUM_ECONOMY_STATE"
{
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u > "$CONVIVIUM_ECONOMY_STATE/files.before"
git status --short --branch
```

3. 后续 T7 和 T9 在各自 shell 中重新通过 `git rev-parse --git-path convivium-economy-runbook-state` 解析同一路径，不依赖环境变量跨命令保留。
4. 逐一确认第 5 节六个长期文件中的替换原文和插入锚点仍精确存在。
5. 若任一锚点漂移，停止；不得部分执行剩余任务。

### T1–T6：按文件修改

严格按第 5 节顺序执行，每完成一个文件后立即运行：

```sh
git diff --check -- <target-file>
git diff -- <target-file>
```

每一步只检查，不提交。发现语义与第 4 节固定原则不一致时立即回到当前文件修正，不把修正扩散到其他文件。

### T7：整体语义验证

运行：

```sh
CONVIVIUM_ECONOMY_STATE="$(git rev-parse --git-path convivium-economy-runbook-state)"
test -n "$CONVIVIUM_ECONOMY_STATE" && test -d "$CONVIVIUM_ECONOMY_STATE"
git diff --check
pnpm --dir plugin exec prettier --check \
  ../AGENTS.md \
  ../docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md \
  ../docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md \
  ../.agents/skills/dsh-plugin-development/SKILL.md \
  ../.agents/skills/convivium-module-review/SKILL.md \
  ../.agents/skills/convivium-pr-review/references/review-checks.md \
  ../.agents/skills/convivium-codex-comment-fix/SKILL.md
rg -n "Implementation Economy|当前证据价值|范围与复杂度门禁|复杂度 finding|复杂度链|Finding 与建议方案分离|accept-with-smaller-fix|defer-or-decision" AGENTS.md docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md .agents/skills
rg -n -F "4. **机制必须有当前消费者**" docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md
rg -n -F "已修复或说明不采纳、已回复并 resolved" .agents/skills/convivium-codex-comment-fix/SKILL.md
{
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u > "$CONVIVIUM_ECONOMY_STATE/files.after"
comm -13 "$CONVIVIUM_ECONOMY_STATE/files.before" "$CONVIVIUM_ECONOMY_STATE/files.after"
comm -23 "$CONVIVIUM_ECONOMY_STATE/files.before" "$CONVIVIUM_ECONOMY_STATE/files.after"
node --input-type=module -e '
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const missing = [];
for (const file of process.argv.slice(1)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let target = match[1].replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = decodeURIComponent(target);
    const path = resolve(dirname(file), target);
    if (!existsSync(path)) missing.push(`${file} -> ${target}`);
  }
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}
' AGENTS.md \
  docs/30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md \
  docs/30-designs/RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY.md \
  .agents/skills/dsh-plugin-development/SKILL.md \
  .agents/skills/convivium-module-review/SKILL.md \
  .agents/skills/convivium-pr-review/references/review-checks.md \
  .agents/skills/convivium-codex-comment-fix/SKILL.md
```

断言：

- 第一条 `rg` 找到第 5 节要求的所有新术语。
- Prettier 检查通过，覆盖本 RUNBOOK 和六个长期文件，包括 Git 尚未跟踪的文件。
- 两条固定字符串 `rg` 均无输出。
- 第一条 `comm` 只输出第 2.1 节六个长期文件；本 RUNBOOK 如果在 T0 前已经存在，则属于 baseline，不应再次出现在新增路径中。
- 第二条 `comm` 无输出，证明执行前已有的用户文件变化没有被清除或隐藏。
- Node 链接检查退出码为 `0`，证明本 RUNBOOK 和六个长期文件中的相对 Markdown 本地链接均可解析；带 scheme 的外部链接不属于本检查。
- 不运行 `plugin` 的 format、typecheck、test、build 或 runtime smoke，因为本任务不修改产品代码、包契约或运行时行为。

### T8：场景验收

人工逐项用修改后的规则推演以下场景；每项必须得到固定结果：

| 场景                                                      | 必须得到的结果                                               |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| 为可能的未来第二个 provider 新增通用 registry             | 没有当前契约、失败或消费者时拒绝新增                         |
| 单一 DSH caller resolver 隔离宿主身份                     | 因权限和外部系统边界允许独立存在，不能仅以单消费者报 finding |
| 评论正确指出 stale attempt 可写入，但建议重写整个 runtime | finding 使用 👍；采用能够阻止 stale write 的更小安全修复     |
| 评论只建议“以后可能有多数据库，先抽象 driver”             | 没有当前缺陷或确认范围时使用 👎，说明依据后 resolve          |
| 评论指出真实资源泄漏，但当前修复需要未决生命周期决策      | 使用 `defer-or-decision`，回复并保持 unresolved              |
| 评论没有对应逐字验收点，但能复现路径越权                  | 不能以缺少验收点拒绝；按安全不变量接受 finding               |
| 一个新字段只在同一事务内使用，恢复和投影均不消费          | 保持局部变量，不持久化                                       |
| 更少文件的方案会绕过 authorization validator              | 不采用；“更小”不能削弱必要边界                               |

### T9：关闭

1. 确认六个长期文件已承载全部长期规则。
2. 确认本任务没有产生产品 readiness 事实，无需修改 `docs/40-readiness/`。
3. 在真正提交本任务的同一 commit 中删除本 RUNBOOK，并删除 `TODO.md` 中本 RUNBOOK 对应的全部已完成任务项。
4. 运行：

```sh
CONVIVIUM_ECONOMY_STATE="$(git rev-parse --git-path convivium-economy-runbook-state)"
rg -n "RUNBOOK-CODEX-IMPLEMENTATION-ECONOMY" . --glob '!plugin/node_modules/**' --glob '!plugin/lib/**'
git diff --check
git status --short
test -n "$CONVIVIUM_ECONOMY_STATE" && test -d "$CONVIVIUM_ECONOMY_STATE"
rm -rf -- "$CONVIVIUM_ECONOMY_STATE"
unset CONVIVIUM_ECONOMY_STATE
```

5. `rg` 必须无残留引用；`git status --short` 只显示六个长期文件、`TODO.md` 的任务删除以及执行前已披露的用户改动；只删除 T0 创建且通过非空和目录断言的精确 Git metadata 状态目录。

本 RUNBOOK 不授予 commit、push、PR 或 merge 权限；这些操作仍需遵守对应治理规则和用户授权。

## 8. State And Failure Handling

- 原文锚点不存在：停止，不猜测替换位置。
- 六个文件出现语义冲突：以第 4 节固定原则为本次执行依据，先修订 RUNBOOK，获得确认后再继续，不直接选择某一 Skill 的方便表述。
- 工作区出现归属不明修改：停止并报告，不覆盖、不 reset。
- 修改后 `reject` 与 `defer-or-decision` 仍无法区分 resolve 行为：任务失败，不得关闭 RUNBOOK。
- 修改后规则把单一消费者自动判为 finding：任务失败，不得关闭 RUNBOOK。
- 修改后规则允许以“最少代码”为由弱化必要边界：任务失败，不得关闭 RUNBOOK。
- 本地链接或 Markdown 检查失败：修复当前任务引入的问题；既有问题单独披露，不顺带扩大范围。

## 9. Security And Observability

- complexity control 只约束实现范围，不能降低安全、权限、事务、持久化、恢复和资源生命周期要求。
- Comment Fix 对 GitHub 的 reaction、reply、resolve、delete、commit 和 push 授权保持不变。
- 执行证据由最终 diff、`git diff --check`、术语 `rg` 结果和场景验收组成，不新增日志 schema、脚本或 readiness 文档。
- 不使用真实 GitHub PR 评论执行写操作来验证 Skill；场景验收采用静态推演，避免产生外部副作用。

## 10. Acceptance

只有同时满足以下条件，任务才可关闭：

1. 六个长期文件严格按第 5 节修改，没有额外长期文件变化。
2. 根 `AGENTS.md` 建立默认最小安全改动和停止扩张规则。
3. 范围控制专项设计不再把当前消费者作为唯一依据。
4. DSH 开发 Skill 在实现前执行复杂度门禁。
5. Module Review 和 PR Review 只有在证明实际成本、依据缺失和更小安全方案后才报告复杂度 finding。
6. Comment Fix 明确区分 finding 与建议方案，并固定四类处理结果。
7. `accept-with-smaller-fix` 使用 👍；`reject` 可 resolve；`defer-or-decision` 保持 unresolved。
8. 任何“更小方案”都不能削弱必要的安全、授权、事务、持久化、恢复和生命周期边界。
9. 第 7 节命令和第 8 节场景验收全部通过。
10. 长期规则迁移后，本 RUNBOOK 和 `TODO.md` 中对应的全部已完成任务项在同一收口 commit 中删除且无残留引用。
