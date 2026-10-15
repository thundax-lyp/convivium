# ACP Contributor Configuration Design Draft

## Status And Confirmed Decisions

状态：设计讨论稿，2026-10-15 修订；不是已实现能力或正式工程依据。进入编码前按 [RUNBOOK](../30-designs/RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md) A1–A3 将已确认结论迁入正式文档。RUNBOOK 的 Executable 仅指实施步骤决策完备，不证明当前产品或真实运行已经通过。

本轮用户确认取代此前第三方适配器与完整自动恢复方案：

1. **不安装、不依赖 `dsh-acp-adapter`**。只参考其机制，自行编写 Codex 专用 ACP provider，不复制第三方源码、文档、命名体系或 sidecar 格式。
2. 允许安装 ACP 项目的官方桥接包 `@agentclientprotocol/codex-acp`；这里的“官方”指 [agentclientprotocol/codex-acp](https://github.com/agentclientprotocol/codex-acp)，不把它称为 OpenAI 官方 DSH 插件。
3. 本期仅 `acp-codex`，不做通用 ACP 平台；支持安全空闲点的原会话冷恢复。中断后结果未知则持久阻断，不自动续执行、重发或建立空白替代会话；用户可暂停或异常结束会议。
4. Definition.agentOptions 为新身份唯一显式模型配置入口，退役 agentModelOverrides；完整选择、不逐字段继承；动态准入采用不可变快照；保留 descriptor 到期规则。
5. Reviewer 主 Session 选择 acp-codex；专用审核 worker 委派机制仍为 spawn，未显式覆盖模型时继承 Reviewer 的 Codex 模型。新增 WEB ANALYZER，沿 Host 默认模型执行真实互联网搜索、读取与分析。

## Migration And Deletion Gate

本草稿不是长期保留文档。执行[契约迁移册](../30-designs/RUNBOOK-ACP-CODEX-CONTRACTS.md)：A1迁正式需求/架构，A2迁接口，A3迁稳定设计并逐段核对覆盖。**A3完成迁移后立即删除本文件，同时清理全部指向它的链接；不等待产品实现或最终smoke，不保留“已迁移”空壳/归档副本。** 未完整迁移则STOP并保留草稿，不得丢弃未落位内容。

当前仅调整计划，尚未执行正式迁移，故本轮不删除。代码施工从C册开始，前置要求A3 PASS且本文件已不存在；后续RUNBOOK只引用正式来源。

## Authority And Current Source

正式依据：[Architecture](../00-governance/ARCHITECTURE.md)、[Engineering Rules](../00-governance/ENGINEERING-RULES.md)、[Document Rules](../00-governance/DOCUMENT-RULES.md)、[Meeting Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) MO-FR-4/9/14、[Evidence Round](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)、[DSH Role Interface](../20-interfaces/DSH-ROLE-INTERFACE.md)、[Peer Meeting Agents](../30-designs/PEER-MEETING-AGENTS-DESIGN.md)、[DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。实际覆盖仍以 [Implementation Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 为准。

DSH 固定 0.2.0-rc.2。已核查公开包声明：LlmAdapter.stream/resolveModel/prepareCall、ctx.llm.registerAdapter/listModels/resolveModelInfo/resolveCallConfig、Agent.ctx/options/session、agents.create/resume、tools.schemas/execute、sessionPersistence.open/read/close、sessions.flush、subprocess.spawn/terminate/waitForExit、storageDomain.open 与 KvTable 持久写。这些接口可以支撑本期保守恢复，不需要虚构上游原输入自动续执行服务。

当前 Convivium 尚无 ACP 实现；`model-options.ts` 仍合并外部 overrides，`dsh-capabilities.ts` 未使用解析后的 reasoning，`definitionHash` 仍展开整个 Definition。七角色/五能力的源码及正式契约须扩为八角色/六能力；正式需求当前排除 Web 角色，T1 根据本轮确认修订。

只读参考为 [dsh-acp-adapter 调研提交](https://github.com/zaimokuza-yoshiteru/dsh-acp-adapter/tree/74dfc5da809fb6941feaf1330b4ddbb05c0b9b7e)。其 Remote 的 retryOriginal 只恢复原绑定、不重发中断 prompt；本方案不依赖它，也不沿用其协议或持久 schema。

## Scope And Ownership

```text
Convivium Host 插件
  ├─ CodexAcpProvider 注册 acp-codex（DSH LlmAdapter）
  ├─ Definition / descriptor / ownership
  └─ 独立 Reviewer DSH AgentSession
       └─ ACP stdio → codex-acp → Codex App Server
            └─ 本 Session 的 MCP HTTP 工具桥 → ctx.tools.execute({agent: 原 Agent})
                 └─ convivium_run_review_worker → DSH spawn
                      └─ 独立 worker DSH Session → acp-codex → structured_output

WEB ANALYZER 独立 DSH Session → Host 默认模型 → DSH web search/fetch → Meeting Evidence
```

Convivium 仍是单工程、单安装包。provider 是插件内 Host 能力；不新增顶层工程、安装器、第三方插件依赖或任意 provider registry。Host 管理 bridge 安装、登录和可执行路径；Definition 不存 command/env/凭据。Meeting Repository 只存会议身份与模型绑定；新建 provider 技术 Storage Domain 保存外部会话与防重放记录，不成为第二份 Meeting 事实源。

Architecture 中“外部项目只读调研”继续约束 dsh-acp-adapter；T1 明确 codex-acp 是用户授权的外部协议桥接程序，允许运行，但不作为复制源码或私有持久格式的依据。

Non-goals：其它 ACP Agent、Teams、Codex 原生多 Agent 投影、已有会议热切换、任意环境变量表单、API key 登录流程、自动重连后续跑中断任务、未知结果人工强制清锁、原输入自动补发、隐藏推理留存、长会话压缩兼容认证。Web 不提供付费或登录后数据访问。

## Host Configuration And Provider Registration

唯一新配置为可选 `Config.acpCodex: {command:string; args:readonly string[]}`。command 必须绝对且可执行，args 必须显式数组；对象严格校验、不允许 env 或任意 Codex 配置。省略则不注册路由、不探测、不引入新的必需 Host 服务，不影响原生部署。安装和登录只在 Execute 阶段进行，本轮未安装。

启用时要求已有 agents、llm、tools、sessions、sessionPersistence、subprocess、storageDomain；在会议恢复和工具投递前创建 provider 并注册一次 `acp-codex`。无服务、重复路由、打开技术 domain 失败均 fail closed，不等待一个永远不会出现的匿名服务。卸载先停止会议投递和 owner，再关闭 provider/技术 domain。

固定实施依赖：ACP SDK 1.5.1、MCP SDK 1.26.0、codex-acp 1.11.0、Codex CLI 0.161.0；前两者为产品依赖，后两者为开发/专项验收依赖，发行包不内置 bridge、不自动安装。执行期生成并锁定 lockfile（本轮不提交）；smoke 显式设置 CODEX_PATH 为该锁定 Codex 的入口，记录实际平台 binary 的版本和 SHA256；禁止 latest/preview 或 PATH 静默替换。

Host 显式提供锁定原生CLI的 CODEX_PATH；provider 计算其版本/hash，不推断系统CLI。provider 通过 DSH subprocess 运行 argv，不经 shell；stdin/stdout 为 pipe，stderr 只保留 64KiB 脱敏尾部，graceMs=5000。会话 cwd 使用原 Session header；每个 DSH Session 独占一个 bridge 进程、一个外部 ACP Session 和一个进程生命周期 MCP lease；每个 prompt 更新活动请求上下文，空闲时拒绝工具执行。只声明 text prompt，客户端 fs/terminal 能力 false，不协商 steering、AIR 或 Codex 原生 subagent 扩展。固定 INITIAL_AGENT_MODE=read-only；ACP requestPermission 返回 cancelled，不自动批准升级。仍不声称该策略禁用了 Codex 全部原生只读工具，cwd 不构成文件隔离。

认证使用当前用户已有 Codex 登录，不复制或解析 auth.json，不自动执行 authenticate/打开浏览器；需要认证返回 ACP_CODEX_AUTH_REQUIRED。只向子进程传入 PATH、HOME、CODEX_HOME（存在时）及明确的 CODEX_PATH、INITIAL_AGENT_MODE、NO_BROWSER=1；不透传 OPENAI_API_KEY、DEEPSEEK_API_KEY 或 DSH_*。CODEX_HOME 由宿主已有配置选择，不能改写系统 HOME。

模型目录通过独立短命 probe 的 initialize → newSession 获取 configOptions；检查 loadSession 与 HTTP MCP 能力。使用 configOptions 中 model 的精确选项值作模型 ID（不拆分旧 models.currentModelId 的编码），setSessionConfigOption(model) 后读取 reasoning_effort 的选项和 currentValue。元数据只声明 text；未公开的上下文长度/usage 不编造。设置 model、reasoning 后显式设 mode=read-only，逐项核对返回 currentValue 与固定选择一致。

smoke 未提供模型输入时，固定选择规则为 probe 公开的 model.currentValue 和该模型 reasoning_effort.currentValue；必须均为其目录成员。显式输入时严格验证，不 fallback。探测只查询/配置会话，不发 session/prompt；关闭探测资源，不把目录查询算真实推理认证通过。

## Proposed Configuration

### Definition-local Agent Options

按已确认方向，在 [definitions.json](../../plugin/config/definitions.json) 中对应 Definition 的同级字段新增可选 `agentOptions`。下面仅为现有 Definition 的字段增量示意，不是完整 Definition，不能覆盖现有文件或省略身份资源、Skill、toolFilter 等字段：

```json
{
  "agentDefinitionId": "convivium.verification_reviewer",
  "agentOptions": {
    "provider": "acp-codex",
    "model": "<ACP 目录中的精确模型 ID>",
    "reasoningEffort": "<所选模型支持的值>"
  }
}
```

拟议类型：

```ts
agentOptions?: {
    provider: string;
    model: string;
    reasoningEffort?: string;
};
```

字段语义属于 Convivium 配置契约；内部执行字段对应 DSH `AgentOptions`。不允许嵌入 command、env、凭据、任意 Codex config、MCP 配置或完整 AgentOptions。

| 输入                               | 新身份的解析行为                                                     |
| ---------------------------------- | -------------------------------------------------------------------- |
| 缺省 `agentOptions`                | 取得创建时 Host 当前完整默认模型选择                                 |
| 提供 `agentOptions`                | 使用其中完整 provider/model 选择，不逐字段继承 Host 默认值           |
| provider 或 model 缺失、空白       | 拒绝配置，不猜测或补齐                                               |
| reasoningEffort 缺省               | 通过所选 provider/model 的公开解析能力取得默认值；不继承其它模型的值 |
| route、精确模型或 reasoning 不可用 | 预检拒绝，不静默选择替代模型                                         |

配置粒度为 Definition。它影响之后使用该 Definition 创建的身份，包括其它新会议中的同类 contributor；不是只作用于某个已有 Session 的配置。

### Host Composition

[发行 patch](../../plugin/config/cordis.patch.yml) 继续装载完整 Definition 集合；执行选择随 Definition 一起读取。示意关系如下，不是完整可安装 patch：

```yaml
- id: convivium
  config:
    provider: spawn
    initialContributorRoleIds:
      - github_research_analyst
      - arxiv_research_analyst
      - web_research_analyst
    # agentDefinitions 仍装载完整集合，沿用发行 patch 的资源读取表达式。
```

`config.provider: spawn` 不改成 `acp-codex`，该配置与 contributor 的模型路由用途不同。当前专用审核工具通过 `reviewWorkers.start("spawn", ...)` 启动 worker。本次真实验收改变 Reviewer Definition 的执行选择；worker 的模型仍默认继承父 Reviewer，不将其加入 DSH `agent-loop.config.agents`，也不向 `dsh-agent-preset.config` 添加不支持的模型字段。

## State And Failure Handling

### Creation And Persistence

1. 初始创建和动态准入共用执行选择解析规则。
2. 在发布身份前验证 route、精确模型、推理强度、角色资源与 scoped 能力。
3. 使用 `resolveCallConfig` 返回的有效配置，而非仅等待其成功；将其中 provider、model 和解析后的 reasoningEffort 组成完整 `EffectiveAgentOptions`，先固化该值，再计算 `compositionHash`、descriptorHash，最后持久化 descriptor 和 ownership。不得把 auxiliary 请求参数或其它完整 AgentOptions 一并写入。
4. Meeting Agent owner 使用该选择创建独立 DSH Session；未激活 ownership 不得取得会议工具权限。
5. Host 默认值或 Definition 新建默认值之后改变，只影响新身份，不修改既有 ownership。

当前 [dsh-capabilities.ts](../../plugin/src/role-composition/dsh-capabilities.ts) 通过 `resolveCallConfig` 验证模型参数，但没有使用其返回值；这是需要修改的现状，不能作为已完成默认值固化的证据。DSH 核心目录为 advisory；自行实现的 Codex provider 必须拒绝目录外模型，因此不能只依赖核心的宽松解析。对本次可枚举目录的 ACP 接入，应补目录存在性验证；目录发现也不能代替真实推理权限验证。

### Resolved Reasoning Binding

上述解析顺序同时适用于 Definition 显式选择和 Host 默认选择。提供显式 reasoningEffort 时，必须由所选 provider/model 校验；缺省且公开解析返回默认值时，把该默认值明确写入 descriptor/ownership。恢复使用已保存的值，不再次应用当前默认值；原绑定的 reasoning 已不受支持时拒绝恢复，不静默替换。

若公开解析未返回 reasoning 默认值，须区分“模型不支持 reasoning 控制”与“默认值无法被固化”：前者允许省略字段；后者不能承诺恢复后的有效推理配置不漂移，应作为该执行组合的预检阻塞，直至公开能力能提供确定选择或用户在 Definition 中显式指定合法值。不能自行把缺省解释成 `none`。既有缺少该字段的 ownership 不按新规则补写，保留原绑定及其已知验证边界。

### Fingerprints And Dynamic Admission

当前契约将身份资源与执行绑定区分：模型选择不改变 `definitionHash`，但改变 `compositionHash`。新字段作为新建默认选择延续这一语义。

当前 [definitionHash](../../plugin/src/role-composition/resolve.ts) 使用 Definition 对象展开。新增 `agentOptions` 时必须显式定义参与身份哈希的字段，不能无意把执行默认值纳入身份指纹。恢复已有身份应使用已固化执行选择计算资源绑定，而不是用当前默认值重算。

动态准入采用已确认的 **不可变配置快照语义**：一次 provisioning 尝试捕获当前已装载 Definition 的完整执行选择，或在其缺省时捕获 Host 的完整默认选择；该尝试始终预检这一快照。admit 固定候选身份及 Definition hash，表示准入意图，不表示执行后端已经固定。首份 descriptor 与 provisioning ownership 原子持久化后，该快照成为此 admissionId 的权威执行绑定。

| 阶段                                | 配置读取与重试规则                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog 读取及 admit 提交           | 检查当时 snapshot 的 candidate、版本、可用性与 Definition hash；不把 Catalog 当成执行选择快照                                                                      |
| 尚无持久 descriptor 的 provisioning | 从已装载配置捕获不可变选择快照；解析并固化 reasoning 默认值，预检这一快照，不在异步步骤间混入其它配置值                                                            |
| 预检后、descriptor/ownership 提交前 | 保持本次快照，不因 Host 默认值后来改变而重选；预检仍须在有效期内。并发尝试以首份 descriptor/ownership 原子提交为准，同值重放、异值冲突，失败尝试不得覆盖已提交绑定 |
| 提交前失败且没有持久绑定            | 下次尝试可以重新捕获当时配置；不得把尚未持久化的快照称为跨重启承诺                                                                                                 |
| 已持久化且仍为 provisioning         | 使用原 descriptor 和执行选择；激活必须仍在 descriptor 有效期内，并满足当前 ownership、准入意图和生命周期条件                                                       |
| 已 active 的身份                    | 恢复使用原 ownership 中的执行选择和资源；不因 descriptor 原有效期已经过去而重新预检准入或撤权，不应用当前默认值                                                    |

这里不保证提交瞬间快照仍是最新配置。DSH 的 `agentDefaultModel.currentSelection()` 返回分离值，`saveSelection()` 保存默认选择，但没有可与 Meeting Repository 提交共同验证的配置 revision/CAS；`llm.prepareCall()` 仅绑定单次调用的 adapter generation，不是持久配置事务。Definition 配置也来自当前已装载的解析结果，不承诺未重新装载的文件编辑即时生效。快照固定的是 provider/model/reasoning 选择，不固定远端服务可用性或 ACP 启动配置；后续不可用仍须 fail closed。

配置在本次捕获前改变，会进入该次快照；捕获后改变，不影响本次已准备快照，但可影响其它尚未捕获的新尝试。首份绑定提交后的重试、重启及恢复只使用原值，不读取新默认，不因新默认不可用替换或拒绝原绑定。首次创建会议同样以已持久 descriptor 为重放依据。

**descriptor 到期处理：** 当前 descriptor 有效期为预检时钟起 300000ms，`now >= expiresAt` 即到期。固定执行选择不延长其激活授权：若 ownership 尚为 provisioning，重启后发现到期，按现有 `PREFLIGHT_EXPIRED` 路径撤权并清理已证明归属的资源，记录准入失败；不能为同一 admissionId 生成新 descriptor、刷新期限、重选模型或绕过 Repository 的激活门禁。若清理或失败记录未完成，保留原绑定重试收口，不激活。已 active 的 ownership 不再次用准入有效期判断恢复资格，仍核验资源、模型与 lifecycle/capability。截止前预检、提交或 Agent 创建成功均不能代替激活提交时的期限检查。

当前 [meeting-lifecycle.ts](../../plugin/src/runtime/meeting-lifecycle.ts) 的 Catalog 入口仅转发 Host 的 `convivium.agentCatalog`，本仓库没有可据此确认刷新行为的生产 producer。拟议契约要求：影响可用性或候选内容的执行配置变化后，producer 重新预检；下一次读取不得以旧缓存继续报告 available，并为更新后的快照提供新的不透明 catalogVersion，旧版本 admit 请求拒绝。新建默认值仍不进入 definitionHash，也不在公开 Catalog 中暴露 provider/model、凭据或启动配置。

生产 producer 是否能遵守上述刷新契约必须先核查；未提供 producer 时保持 CATALOG_UNAVAILABLE，不能由确定性夹具宣称动态准入已可用。首轮可只验初始 Contributor，但不得据此宣称完成动态准入验收。已提交 admit 意图在 provisioning 阶段仍独立预检，不因历史 Catalog 曾 available 而跳过检查。

### Recovery And Termination

此前要求上游提供完整原输入续执行契约的阻塞撤销；本期以自行实现的持久防重放与保守阻断替代，不承诺自动恢复未知结果。

新技术 domain `convivium_acp_codex` 格式初始 version=1（数据版本，不是符号后缀），通过 Host Storage Domain 使用既有介质，不指定数据库路径。不读取第三方 sidecar，不向 DSH Session 写自定义事件。精确 schema/函数/路径见 RUNBOOK Fixed Contracts。外部会话ID在blocked记录可以缺省，ready时必须存在；缺技术记录但已有ACP痕迹时仍须能持久阻断。

- bindings：每个 DSH Session 的 acpSessionId、rootSessionId、cwd、launchFingerprint、完整选择、ready/blocked 和公开错误 code。
- requests：每次调用发送前持久化 requestId、输入 ID/哈希和 sending；收到正常 stop 后持久化 responded；只有 DSH 原生 assistant/message 中存在匹配 replay receipt 且 flush 成功后，才可标 committed。
- deliveries：owner 首次入队前持久化原 deliveryId 的 admitting；本地 flush 后 queued；whenIdle、provider checkpoint 和正式事实核对后 completed。相同键不同文本拒绝；已存在未完成记录绝不再次 followup/wake。它不是新的会议 outbox，只是外部副作用接收门禁。

一次写入一个完整记录；不同表无原子事务承诺，以写入顺序和保守阻断处理跨边界 crash。持久记录不可读/写失败立即关闭该 provider 的新调用，不凭内存认定安全；本期不做数据 GC。requestId 由 provider randomUUID 生成；deliveryId 沿用会议 outbox；两者与工具 callId 不混用。

| 可证明的状态                                     | 本期唯一处理                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 原 delivery 从未记录、provider ready             | 持久 admitting，再首次入队；只有新输入可走此路                                                                 |
| admitting/queued 且进程内原调用仍在运行          | 等待原任务；不重复 enqueue，不发 wake 文本                                                                     |
| Host 重启存在 admitting/queued 且不能证明完成    | 持久 blocked；即使可能尚未发到远端也不自动重投                                                                 |
| requests 全部 committed、delivery 全部 completed | 校验模型/资源/launchFingerprint，再 loadSession 原 acpSessionId，重装新的 MCP lease；禁止 newSession fallback  |
| sending，或 responded 但无 DSH 持久 receipt      | 结果未知，blocked；不重发、不补造回答、不宣称执行失败                                                          |
| responded 且找到匹配持久 assistant receipt       | 仅把该 request 标 committed；不发 prompt。delivery 完成仍须核对原 turn 正常结束，不能只凭 receipt 推定整批完成 |
| loadSession 失败、会话不存在、配置或资源不匹配   | blocked / ACP_CODEX_RECOVERY_REQUIRED；保留原绑定；不创建空白会话                                              |
| 已提交合法 Review/Evidence，随后出现断连         | 保留正式事实；相应效果可补本地结算，但该 Session 仍可被阻断，不再次执行原任务                                  |
| 已确认发送前失败                                 | 报配置/认证错误；不存在发送记录时仍可重新预检。已有 delivery 接收记录不自动重新入队                            |

请求进行中取消、超时、进程退出和本地结果持久化失败均按结果未知处理；即使 ACP cancel 返回，也不据此证明无远端副作用。取消先阻止 MCP 新调用，向原会话 cancel，终止并等待所属进程范围和已有 DSH 工具调用收敛；不影响其它身份。

同一 rootSessionId 下 worker 出现未知结果时，Reviewer 根绑定也 blocked。审核工具拿到 result 后先检查技术阻断；不得把子执行失败摘要当作已知业务失败或另起 replacement。同一active claim的重复审核工具调用只复用原执行Promise，不另起worker；恢复不依赖这份内存缓存。现有合法 structured result 仍须按原 claim/version/权限提交。

dispatcher 在重试及 claim 分配前检查阻断，已存在正式 Review/Evidence 优先补结算。未知不能合成 contribution failure、dispatch_failed 或 review_interrupted；outbox 只核对和等待，retryable=true、terminalOnAttemptLimit=false，retryAt=now+30000，不重新投递。**真实业务截止时间仍生效**：贡献超时由原 deadline handler 结算；review claim 确实到期可按原 review_timeout 幂等结算一次并按原规则计预算，但仍不得在 blocked Session 派新 worker。不能把“未知不罚预算”解释为冻结真正超时。

可见处置：MeetingView 新增可选 executionBlocks 数组，仅暴露 identityId、稳定错误 code、since 和 allowedActions=[pause_meeting,end_meeting]；从技术记录与当前 ownership 关联投影，不写入 Meeting 领域事件/版本，不暴露外部 Session ID/路径/凭据。面板显示身份、原因及“已停止自动执行，可暂停或异常结束”的提示；操作仍经现有 Captain 入口，无自动暂停、清锁或伪造 Captain 权限。继续会议不会解除技术阻断；本期解除路径是异常结束、归档后另建会议，不复用旧绑定。

归档与关闭仍先撤权，再 owner cancel/drain/dispose 和 provider.stopSession；停止根时 worker descendants 一并收敛，停止 worker 本身不得反向取消 Reviewer。进程或工具未停稳则不能记 cleanup 成功。未知状态不是无限存活进程的理由，历史记录保留。

## Protocol, Tools And Prompt Implementation

1. ACP SDK Agent-facing client 使用 ndJsonStream 与 Node/Web stream 转换；每 Session 串行一个 prompt。initialize/newSession/loadSession 配置响应超时 30s，prompt 120s；超时取消并进入上述保守门禁，不自动 retry。providerRetryPolicy.maxRetries=0；仅支持 Loop 有真实 sessionId 的调用。
2. root在owner.setup完成资源校验后、发布Agent前await prepareSession；worker在公开agent/created初始化，先通过恢复门禁再允许处理inbox。首次把当前完整 system/AGENTS、developer context 与尚未发送的持久 user inputs 作为标注 text 发送；后续仅发新 user inputs，并再次附当前有效身份/工具规则。按 request 记录的 inputMessageIds 排除已发送输入，校验累计已发送 user 的 ID/content 摘要（另存 prefixMessageIds），当前 system/developer 不参与历史不可变摘要；不把旧 assistant/tool 历史再投给外部上下文。没有新 user input、身份缺失、匿名输入、非 text 或历史被改写均发送前拒绝。
3. system 上下文在 ACP text 中没有原生 system 优先级保证。测试分别验证字节到达与真实模型遵循。MCP 由进程生命周期 loopback HTTP server 暴露，128-bit 随机 bearer token、严格 Host/Origin/路径校验；token 只存活在 lease 内，不持久化。只接受 SDK Streamable HTTP JSON-RPC，body 上限 1MiB。
4. tools/list 与 tools/call 取 `options.tools` 和 `agent.ctx.tools.schemas(agent)` 的交集；每次调用重新检查当前 scope、binding、活动 request 和取消状态。绝不调用未经过 ToolRuntime 的原 execute。callId=ToolCallId(`acp:${requestId}:${rpcRequestId}`)，原 agent 与请求 signal 传入 tools.execute。相同 rpcRequestId/参数在本 prompt 内只执行一次；异参数拒绝；断线后不跨进程重放。
5. bridge 串行外部工具调用；审核工具可等待另一个 worker Session 的独立 bridge，不持有阻塞所有 Session 的全局锁。通过 DSH 原 tools/result 触发 structured_output 捕获；不额外发 DSH tool-call chunk，防止 AgentLoop 再执行一次工具。ToolRuntime.additionalContexts保持原ID通过agent.inject进入DSH next-step队列并flush，不丢弃、也不再拼入同次MCP响应；本地补存失败触发持久block。concludesTurn后禁止该prompt额外工具副作用，等待正常结束，不能cancel冒充成功。普通工具结果按 DSH content 映射 MCP text/structuredContent/isError，不解析模型文本替代工具调用。
6. ACP agent_message_chunk 只映射公开 text；agent_thought_chunk 不记录、不转发。native tool 通知不转换成 Meeting 操作。正常 end_turn 映射完整 block-start/text-delta/block-end，再 finish stop；max_tokens 对应 max-tokens。usage 仅在有权威 input/output 计数时输出，必须在 finish 前；本期不伪造 0。finish 携带 ReplayEnvelope.response 下的 `{conviviumAcp:{requestId}}`。ACP cancelled/异常抛稳定 LlmError，由 DSH 标准化，独立技术门禁保证不被错误码丢失绕过。
7. `agent/created`（setup 完成后、首次执行前）仅对 acp-codex Agent 在 agent.ctx 挂载 CodexCompactionBoundary；自动 compactIfNeeded 返回 null，显式 compactNow/compactRegion 在写入前拒绝。非 ACP scope 保持原 compaction。purpose=compaction/session-title 的 provider 调用发送前拒绝，不污染主会话或令其 blocked；本期不宣称长会话压缩兼容。worker 同样经过该公开 hook，身份 setup 不在 hook 重写。

## Web Analyzer And Reviewer Acceptance

新增 roleDefinitionId=web_research_analyst、agentDefinitionId=convivium.web_research_analyst、displayName=WEB ANALYZER、preset=convivium-web-research-analyst。requiredSkillNames=[web]、evidenceScopes=[web]、expertiseTags=[web-research,source-verification,information-analysis]；contributor 工具 deny 集合沿 GitHub 角色。只加第六能力 web，不赋予管理/审核权限。八角色持久枚举、样本验证器、发行资源、创建目录一并更新；初始 contributors 为 GitHub/arXiv/Web。

AGENTS 声明身份和会议边界，web Skill 定义实际搜索、阅读原始来源、交叉核验、时间窗、URL/标题/发布时间未知标注/访问时间、事实/推断/限制；不把搜索摘要当已读正文，不编造来源。Preset 沿 GitHub 组合替换 web Skill 目录；其它七角色 AGENTS 不改。

真实专项一场会议、两轮、五个平级 Session；第一轮发布并确认所有调用/投递完成后暂停、关闭隔离 Host，以同数据目录重启，第二轮实际再经 Codex Reviewer + spawn worker 审核后归档。各 Contributor 每轮一份 Evidence，六份合法 Review；失败重试另按正式预算统计。Web 每轮实际 search 且读取两个不同官方域名页面，固定域名 agentclientprotocol.com 与 deepseek-harness.github.io，实际定位起点为 [ACP Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup) 与 [DSH Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/)；后者域根为404，不以根URL作为读取目标。20 分钟软时限不是费用上限，超限 STOP。

provider另外发出本进程 `convivium/acp-checkpoint` 脱敏事件，观察绑定哈希、load、request commit、delivery完成与进程关闭；不持久到DSH Session，不暴露原ACP ID或prompt。真实smoke通过该事件、DSH工具/Session事件与Repository正式事实交叉验收，不读取provider私有store。

## Validation And Not Covered

先确定性 ACP 子进程 + 真实 DSH AgentLoop/ToolRuntime/Storage Domain，再独立真实 Codex/互联网专项。必须覆盖 role text、真实 caller、worker structured_output、撤权、幂等/异 payload、动态快照/TTL、发送前持久化失败、发送中 kill、responded-before-flush、flush-before-checkpoint、冷 load 失败、worker 未知传播、deadline 与已提交事实竞争、归档收敛。

Catalog producer 当前仍由 Host 提供；本期保持缺失时 CATALOG_UNAVAILABLE，测试覆盖 provisioning 快照/期限，不新增生产 Catalog 服务或宣称动态目录上线。未知结果自动续跑、远端结果自动核对、长会话压缩、其它 bridge/OS/模型组合均 Not Covered 或明确 Non-goal，不能纳入本期 PASS。

本轮只核查公开声明、官方 1.11.0 tarball 与静态代码并修改文档；未安装运行依赖、未发推理请求、未做产品实现或真实 smoke。正常冷恢复的计划可实施与实际跨进程成功是两种不同结论。完整机械步骤、允许文件和验证命令以 RUNBOOK 为准；不存在等待第三方恢复服务的前置阻塞。
