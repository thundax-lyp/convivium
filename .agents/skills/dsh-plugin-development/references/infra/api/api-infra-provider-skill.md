# Agent Skill provider

## 对象关系与使用场景

`@deepseek-ai/dsh-skill` 的 `SkillRegistry` 注册为 `ctx.skills`。provider 负责发现与加载 Skill，registry 合并候选、按名称与 rank 选胜者；`@deepseek-ai/dsh-tool-skill` 才向模型提供加载工具。插件可以提供虚拟 Skill，无需把 Markdown 文件放在本地目录。操作见 [HOW-TO](../how-to/how-to-infra-provider-skill.md#注册虚拟-agent-skill)。

## SkillRegistry

**公开导出**：`SkillRegistry` 来自 `@deepseek-ai/dsh-skill`。
`registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void` 必须在同步 `apply` 中注册；远端初始化放到 provider 的 `list`。重复 provider 名或保留名 `runtime` 会拒绝。注册落在调用 context 的 global 或 Agent scope，fiber 卸载时中止 `control.signal`、撤销候选并失效缓存。`control.invalidate()` 仅在该注册仍存活时通知 catalog 变化。

`list(options?: SkillViewOptions): Promise<SkillSummary[]>` 返回当前视图的胜出摘要；`snapshot()` 还报告 `complete`，不完整观察不能缓存；`get(name, options?)` 载入胜出 Skill，非法名称或已失效候选返回 `undefined`。`options.cwd` 选择工作区，`options.scope` 选择 Agent 可见层，`options.signal` 取消查询。`register(skill: SkillRegistration)` 是单个只读 runtime Skill 的更短入口，默认可被模型与用户调用；同层同名先到者胜出。

## SkillProvider

`SkillProvider` 有唯一 `name`、`list(options)` 与 `get(candidate, options)`。`list` 返回 `SkillCandidate[]`，或 `{ candidates, complete }`；`get` 接收先前候选及其 `locator`，返回完整 `SkillDefinition` 或 `undefined`。provider 必须对取消及时结算，不能在同步注册工厂中等待网络。候选 `rank` 越小越优先；同名胜出后，载入定义仍须与候选同名。

## SkillCandidate

**公开导出**：`SkillCandidate` 来自 `@deepseek-ai/dsh-skill`。
候选包含 kebab-case `name`、简短 `description`、`invocation`、`source`、`provider`、`rank` 与 provider 自有 `locator`；可有 `path`、`whenToUse`、`resourceBase`、`metadata`。`invocation.modelInvocable` 与 `userInvocable` 分别控制两类入口，不应凭可发现性推断可调用性。`resourceBase` 用目录、URL 或 opaque 描述帮助读者按需打开相对资源。

## SkillDefinition

**公开导出**：`SkillDefinition` 来自 `@deepseek-ai/dsh-skill`。
完整定义有与候选一致的名称和摘要字段，并增加 `content` Markdown 主体。provider 对资源路径及内容真实性负责；registry 的 `get` 验证定义并在候选失效时返回 `undefined`。虚拟 Skill 可以不提供 `path`，但应给出有意义的 `resourceBase` 或在正文中说明资源获取方式。

继承的 `name: string` 是 kebab-case 标识符，必须与 `SkillCandidate.name` 一致；它用于 `ctx.skills.get(name)` 寻址，也用于同名 rank 竞争。名称不合法或载入后的名称与胜出候选不符时，该定义不能作为有效结果；不能用展示标题或文件路径代替 `name`。

## 装载与验证

Profile 先装载 `@deepseek-ai/dsh-skill`，然后装载 provider 插件；需要模型加载再装载 `@deepseek-ai/dsh-tool-skill`。用 `ctx.skills.list`/`get` 分别核对摘要与正文，按 Agent scope 和 `cwd` 测可见性、取消、同名 rank 与卸载。Skill 本身不是持久会话状态；需要跨重启保留时由 provider 的外部来源负责。
