# DSH ACP Execution Interface

## Purpose And Authority

本文定义已确认、尚待实现的 Codex 专用执行契约。正式需求见 [Meeting Orchestration](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md#acp-codex-acceptance-boundary) 的 ACP Codex Acceptance Boundary 和 [Evidence Round](../10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md)。身份与准入由 [DSH Role Interface](./DSH-ROLE-INTERFACE.md) 约束；公开诊断由 [Meeting Interface](./MEETING-INTERFACE.md) 约束。装配职责见 [DSH Plugin Design](../30-designs/DSH-PLUGIN-DESIGN.md)。本文不宣称运行验证通过。

仅支持 DSH 0.2.0-rc.2 的公开 LlmAdapter、ctx.llm.registerAdapter/listModels/resolveModelInfo/resolveCallConfig、Agent.ctx/options/session、agents.create/resume、tools.schemas/execute、sessionPersistence.open/read/close、sessions.flush、subprocess.spawn/terminate/waitForExit、storageDomain.open/KvTable。不依赖不存在的完整原输入续执行接口；保守恢复以持久记录及原生 receipt 为依据。

不安装 dsh-acp-adapter、不复制其源码或 sidecar 格式；只读调研基线为 [74dfc5d](https://github.com/zaimokuza-yoshiteru/dsh-acp-adapter/tree/74dfc5da809fb6941feaf1330b4ddbb05c0b9b7e)。其 retryOriginal 不重发中断 prompt，本期不依赖该机制。允许的官方 bridge 是 [ACP 项目 codex-acp](https://github.com/agentclientprotocol/codex-acp)，不称为 OpenAI 官方 DSH 插件。

Non-goals：通用 ACP、其它 bridge/Teams、Codex 原生多 Agent 投影、热换已绑定执行配置、API key 登录、远端未知结果自动核对/续跑、强制清锁、隐藏推理留存和长会话压缩认证。

## Dependency, Host And Public API

- 产品 dependencies 精确增加 `@agentclientprotocol/sdk:1.5.1`、`@modelcontextprotocol/sdk:1.26.0`；Host peerDependencies/devDependencies 增加 `@deepseek-ai/dsh-subprocess`、`@deepseek-ai/dsh-compaction` 与 `@deepseek-ai/dsh-compaction-basic`，均 0.2.0-rc.2，peer optional 与已有 Host 包一致。测试宿主增加 devDependency `@deepseek-ai/dsh-subprocess-local:0.2.0-rc.2`；沿用已有 storage-sqlite，不引入第二种测试介质。官方 bridge/CLI 仅 devDependencies：`@agentclientprotocol/codex-acp:1.11.0`、`@openai/codex:0.161.0`。pnpm.overrides 固定 `@agentclientprotocol/codex-acp>@openai/codex` 为 0.161.0；其余传递依赖按新 lockfile integrity 冻结，不手改 integrity。无需新顶层 package。
- Config 新增 `acpCodex?: {command:string; args:readonly string[]}`，command 绝对可执行；args required，允许空；禁止额外字段/env。Definition 内不接受进程配置。旧 agentModelOverrides 退役，删除类型、Schema、解析器、使用方与专用测试；不新建旧输入识别或兼容解析器。未知配置字段统一拒绝，包含旧字段。
- 缺省不注册 route、不启动进程、不探测。启用先通过显式 ctx.inject([subprocess,storageDomain,...原 meetingServices]) 组合 provider 与 consumer，创建失败使本次插件启动失败；不要用可选服务缺失时悄悄切原生模型。
- `LlmAdapter` 注册键仅 acp-codex；实现 providerInfo、listModels、resolveModel、prepareCall、stream、providerRetryPolicy。`ctx.llm` 上方法为 resolveModelInfo（不是 resolveModel）。prepareCall 固定启动配置/目录代次；插件配置 reload 必须重新装载并校验旧 binding，禁止热改旧会话。
- subprocess.spawn spec 固定 argv=[command,...args]、cwd=Session.header.cwd、stdio={stdin:pipe,stdout:pipe,stderr:{maxBytes:65536}}、graceMs=5000、Session lifetime signal；terminate 后 await waitForExit。认证沿已有用户登录，env 只显式允许 PATH/HOME/CODEX_HOME/CODEX_PATH/INITIAL_AGENT_MODE=read-only/NO_BROWSER=1；不读 auth.json、不传 API key、不自动登录。
- ACP SDK `ClientSideConnection` + ndJsonStream；只用 initialize/newSession/loadSession/setSessionConfigOption/prompt/cancel。initialize用SDK PROTOCOL_VERSION及clientInfo.name=convivium、version取本插件package.json；probe.newSession传realpath(process.cwd())和空mcpServers，正常newSession传原cwd与该Session稳定mcpServer，loadSession再加原sessionId。initialize的clientCapabilities精确为 `{fs:{readTextFile:false,writeTextFile:false},terminal:false}`，prompt仅text，不启用 AIR/native subagent/steering。requires loadSession=true、mcpCapabilities.http=true；请求权限总返回 `{outcome:{outcome:"cancelled"}}`；不宣称接管 Codex 原生全部工具。
- 配置与加载 RPC 超时 30000ms，prompt 120000ms；取消/超时请求后阻止新 MCP 调用，cancel 后 terminate/drain，记录未知。providerRetryPolicy 采用目标公开 ResolvedRetryPolicy，返回 `{mode:"normal",maxRetries:0,retryableCodes:[],initialDelayMs:0,maxDelayMs:0,jitterRatio:0}`；不能依赖错误文本猜测是否发送。
- 对 purpose=compaction/session-title、无 sessionId、非 text 输入、temperature/maxTokens/stop 显式非缺省、没有可发送新 user、历史前缀不匹配，发送前稳定拒绝 ACP_CODEX_UNSUPPORTED_REQUEST，不污染主 binding。不对其它 provider 施加限制。

错误闭集：ACP_CODEX_CONFIG_INVALID（命令/缺服务/协议能力/启动失败）、ACP_CODEX_AUTH_REQUIRED（需登录）、ACP_CODEX_MODEL_UNAVAILABLE（精确模型/推理值不可用）、ACP_CODEX_UNSUPPORTED_REQUEST（发送前不支持的请求）、ACP_CODEX_DELIVERY_CONFLICT（同键异文本）、ACP_CODEX_OUTCOME_UNKNOWN（发送后无持久结果）、ACP_CODEX_RECOVERY_REQUIRED（绑定/存储/历史/加载无法证明可继续）。前五项仅发送前使用；进入sending后的所有异常不得映射成可自动重发的配置错误。只有最后两项产生CodexAcpBlock，存储整体失败使所有新请求拒绝RECOVERY_REQUIRED。预检对外仍映射既有CAPABILITY_MISSING，不新增领域command错误。

模型目录取独立 probe 的 newSession.configOptions：model 组选项值原样作 ID；set model 后取 reasoning_effort 的合法选项和 currentValue；不解析旧 modelId 的组合编码。不虚构 contextWindow 或 token usage。resolveModel 精确目录拒绝，不允许 adapter fallback。正常 Session 设置 model 后 reasoning，再设configId=mode,value=read-only，核对所有返回currentValue；mode能力缺失拒绝。缺省 reasoning 若有公开 currentValue 则固化，否则预检拒绝，明确无 reasoning 控制才允许字段省略。

官方 1.11.0 tarball registry SRI：`sha512-opPKsRaekgdmQpOpHrR0EEDn9chgtiN+b+h0V78fTuQP84TNzB7vrn3EtKODwbiJQTBHJAlynjSFQazFfaT+VQ==`。该 SRI 来自设计阶段只读源码审计，没有安装执行证据；不安装 @zaimokuza/dsh-acp-adapter。

## New Module And Exact Signatures

唯一新增生产目录 `plugin/src/dsh/acp-codex/`，每个文件职责固定，index.ts 仅具名 re-export。跨目录经入口；不复制参考实现。表中签名是本期目标，不是已存在 API。

| 文件           | 唯一符号/职责                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| types.ts       | CodexAcpConfig、CodexAcpBinding、CodexAcpRequest、CodexAcpDelivery、CodexAcpBlock、CodexAcpProviderPort，字段见下文                                                                                                                                                                                                                                                                                                                |
| store.ts       | `openCodexAcpStore(ctx: Context): Promise<CodexAcpStore>`；仅 defineDomain/open/get/put/update/close 与 schema，不发 DSH/ACP 请求                                                                                                                                                                                                                                                                                                  |
| connection.ts  | `openCodexAcpConnection(ctx: Context, config: CodexAcpConfig, cwd: string, signal: AbortSignal, onUpdate: (notification: SessionNotification) => Promise<void>): Promise<CodexAcpConnection>`；进程/SDK/RPC/cancel/close，无领域操作                                                                                                                                                                                               |
| tool-bridge.ts | `openCodexToolBridge(input: {agent:Agent; signal:AbortSignal; isBlocked:()=>boolean; onUnsafeSettlement:()=>Promise<void>}): Promise<CodexToolBridge>`；有 owner 的 HTTP MCP server、调用去重/取消/drain                                                                                                                                                                                                                           |
| prompt.ts      | `buildCodexPrompt(options: GenerateOptions, committedPrefix: {messageIds:readonly string[];sha256:string}                                                                                                                            \| undefined): {prompt:ContentBlock[]; inputMessageIds:readonly string[]; prefixSha256:string; prefixMessageIds:readonly string[]}`；ContentBlock 来自 ACP SDK，纯文本/稳定前缀验证，不发 I/O |
| provider.ts    | `CodexAcpProvider extends LlmAdapter`；`createCodexAcpProvider(ctx:Context, config:CodexAcpConfig):Promise<CodexAcpProvider>`；编排 store/connection/tool bridge 与公开事件，无 Meeting command                                                                                                                                                                                                                                    |
| compaction.ts  | `CodexCompactionBoundary extends BasicCompactionEngine`；ACP 自动返回 null、显式方法写入前抛 ACP_CODEX_UNSUPPORTED_REQUEST；其它 provider 委派 super                                                                                                                                                                                                                                                                                                                  |
| index.ts       | 仅导出 createCodexAcpProvider 与 CodexAcpProviderPort/CodexAcpConfig/CodexAcpBlock；内部 schema/工具不全部转发                                                                                                                                                                                                                                                                                                                     |

provider 额外消费面固定如下（签名的 string ID 不替换为跨层领域类型；全部由真实 ownership/Session 构造）：

```ts
interface CodexAcpProviderPort {
  prepareSession(
    agent: Agent,
    purpose: "provisioning" | "delivery" | "cleanup",
    signal: AbortSignal,
  ): Promise<void>;
  reconcileSession(sessionId: string, signal: AbortSignal): Promise<void>;
  deliveryState(
    sessionId: string,
    deliveryId: string,
  ): "unseen" | "pending" | "completed" | "blocked";
  beginDelivery(input: {
    sessionId: string;
    deliveryId: string;
    text: string;
  }): Promise<void>;
  markDeliveryQueued(sessionId: string, deliveryId: string): Promise<void>;
  finishDelivery(
    sessionId: string,
    deliveryId: string,
    signal: AbortSignal,
  ): Promise<void>;
  checkpoint(sessionId: string, signal: AbortSignal): Promise<void>;
  blockFor(sessionId: string): CodexAcpBlock | undefined;
  subscribeBlocks(listener: (rootSessionId: string) => void): () => void;
  stopSession(sessionId: string): Promise<void>;
  close(): Promise<void>;
}
```

`CodexAcpConfig` 是 Config.acpCodex 冻结结果。CodexAcpStore（types.ts）仅在本目录使用：`binding(sessionId)`、`request(requestId)`、`delivery(sessionId,deliveryId)` 返回记录或 undefined；`bindings()`、`requests(sessionId)`、`deliveries(sessionId)` 返回只读数组；`putBinding/putRequest/putDelivery(record):Promise<void>`、`close():Promise<void>`。写入仅在 provider 每 Session 串行队列内进行，root blocked 写入也通过该队列，工具执行等待期间不占 root 的状态写锁，避免 parent/child 死锁。

CodexAcpConnection 为 `{client:ClientSideConnection,initialized:InitializeResponse,close:()=>Promise<void>}`（SDK类型）；关闭必须取消所有 RPC 并等待进程范围。onUpdate 是ACP SDK SessionNotification回调，在构造ClientSideConnection时安装；connection内部实现requestPermission=cancelled。连接signal属于provider拥有的Session lifetime controller，不直接持有某次create/delivery信号；创建期间临时监听调用方取消，open成功后移除。每次prompt使用lifetime与本次options.signal的组合，结束后移除本次监听。CodexToolBridge 为 `mcpServer`（精确 `{type:"http",name:"convivium",url:string,headers:[{name:"Authorization",value:string}]}`，value为`Bearer ${token}`）、`setRequest(input: {requestId:string;tools:readonly ToolSchema[];signal:AbortSignal}|undefined):void` 和 `close():Promise<void>`；返回前 HTTP 已监听，URL/token 在本进程内保持到关闭，在活动 prompt 之外 tools/call 一律拒绝。new/load 的工具发现可 tools/list，但绝不执行工具。root blocked 通过 provider 内共享内存只读标志先同步禁止工具，持久写随后 await；持久失败将整个 provider 的后续调用关闭。

## Technical Durable Records

唯一新技术 domain `convivium_acp_codex`，version=1、三张表 bindings/requests/deliveries，Zod strict schema、默认 invalid-record 拒读，使用已有 Host backend/routes，不新增物理路径。DSH Session 日志和 Meeting domain 不改版本，不写插件自定义 Session event。

所有 timestamp 为 Date.now() 的安全非负整数毫秒；所有 hash 为 lowercase SHA256 hex，ID 均非空字符串。没有注明 optional 的字段 required；没有 null/default。数组记录深冻结/不原地修改。

```ts
type CodexAcpBlock = {
  code: "ACP_CODEX_OUTCOME_UNKNOWN" | "ACP_CODEX_RECOVERY_REQUIRED";
  since: number;
};
type CodexAcpBinding = {
  sessionId: string;
  rootSessionId: string;
  acpSessionId?: string;
  cwd: string;
  launchFingerprint: string;
  provider: "acp-codex";
  model: string;
  reasoningEffort?: string;
  state: "ready" | "blocked";
  block?: CodexAcpBlock;
  createdAt: number;
  updatedAt: number;
};
type CodexAcpRequest = {
  requestId: string;
  sessionId: string;
  rootSessionId: string;
  inputMessageIds: readonly string[];
  prefixMessageIds: readonly string[];
  prefixSha256: string;
  phase: "sending" | "responded" | "committed";
  startedAt: number;
  respondedAt?: number;
  committedAt?: number;
};
type CodexAcpDelivery = {
  sessionId: string;
  deliveryId: string;
  textSha256: string;
  state: "admitting" | "queued" | "completed" | "blocked";
  createdAt: number;
  updatedAt: number;
};
```

bindings 键=sessionId；requests 键=provider 生成的 randomUUID requestId；deliveries 键=sha256(canonicalJson([sessionId,deliveryId]))。binding.state=blocked iff block 存在；ready 必须有 acpSessionId，blocked 可缺省（原技术记录缺失但DSH已存在ACP执行痕迹时，没有可信远端ID也必须能持久阻断）；request phase 必须匹配时间字段；delivery 相同键不同 textSha256 拒绝 ACP_CODEX_DELIVERY_CONFLICT，不修改原记录。rootSessionId 从可信 Session.header.parentSession 链取得根，普通 Reviewer 为自己；worker 无 Meeting ownership，不接受模型参数提供 root。

launchFingerprint=sha256(canonicalJson({commandRealpath,commandSha256,args,codexVersion,codexExecutableSha256,cwd,mode:"read-only",codeHomeRealpath}))；使用明文 HOME 等不是 ID 输入之外的日志输出；记录不含 token、凭据或完整 prompt。CODEX_PATH/binary 由已核查的桥接启动环境确定；运行期缺 binary 信息则启动前拒绝，不留半有效 binding。技术表只记录协议相关事实，不记录 Review 内容或隐藏推理；不做 GC/覆盖旧 binding。

写序：新外部会话创建后先持久 binding，成功前不 prompt；请求先持久 sending 再发送，正常返回后持久 responded，再 yield finish；DSH assistant/message 含匹配 message.source.replayState.response.conviviumAcp.requestId 后，checkpoint 先 await ctx.sessions.flush(session)，再通过 sessionPersistence.open(id,"read")/handle.read().events 核对 receipt，finally close handle，然后标 committed。不得使用 deprecated ownEvents/snapshotEvents 作新恢复依据。

各表不是跨表事务。任意 crash 或写失败都向保守方向处理：不能证明就 blocked，绝不因“写了 responded”推定 DSH 已落盘。两次 checkpoint/重启重放只补 committed，不重复 prompt。receipt必须来自同Session原生assistant/message、source.provider=acp-codex、requestId匹配且无interrupted标记；不能使用assistant/attempt或临时stream帧。body、MCP bearer 和 stdout 原始 JSON 不写这些表。

## Process-local Verification Events

provider 在 types.ts 为 Cordis Events 声明 `convivium/acp-checkpoint(payload)`，只供本进程观察，不写 DSH Session/Meeting/domain事件表。payload精确 `{sessionId:string;rootSessionId:string;phase:"bound"|"loaded"|"committed"|"delivery-completed"|"closed";bindingSha256:string;requestId?:string;deliveryId?:string}`；committed必须requestId、delivery-completed必须deliveryId，其它不得带这两项。bindingSha256=sha256(canonicalJson({sessionId,acpSessionId,launchFingerprint,provider,model,reasoningEffort}))，排除状态/时间/lease token。bound在binding持久成功后、loaded在同ID加载与模型校验后、committed/delivery-completed在对应持久写后、closed在进程和MCP静默后发出。事件不暴露raw ACP ID/工具参数，外部用户不能写此事件获得权限。

真实probe订阅这些事件并与DSH agent/tools/result及Repository outbox交叉验证；不读取私有store/owner字段。事件只证明当时检查成功，不能替代cold后的新loaded及第二轮真实执行；同一根bound/loaded的bindingSha256必须一致。若probe在事件之后装载，只能用新执行可观察事件或显式等待订阅就绪，不能补造历史。

## Reviewer And Worker

Reviewer Definition 和三个允许工具不变；测试 profile 内其 agentOptions 精确为 acp-codex 和测试输入的模型/推理选择。发行 definitions.json 不写账户特有模型或 command/env。worker 继续 start("spawn", request)，保持 parent=exec.agent、原 claim/version、outputSchema、toolFilter.allow=[]，不增加显式 agentOptions override。

DSH 公开 `resolveChildAgentOptions` 默认继承父模型；因此本专项预期 worker 也解析到 Reviewer 的 Codex 模型，但委派机制仍是 spawn。one-shot driver 在 scoped setup 中注册 structured_output。测试须证明该工具经 ACP MCP 可用且只有合法 structured 结果被接纳；纯文字 JSON、错 version、取消、无 structured、重复 worker 均不得形成审核成功。worker 无 Meeting ownership，直接调用会议工具必须拒绝。

## Prompt, MCP And Stream

root 的 provider 初始化在 owner.setup 的资源/Skill 校验末尾 `await acpCodex.prepareSession(agent,purpose,signal)`，先于 Agent 发布/处理inbox：provisioning 创建首外部绑定（尚无任务工具授权），delivery 恢复原绑定，cleanup 不创建/加载外部进程。同一 owner 持有的 ACP root 在 durable ownership 激活后，由 provisioning 首次升为 delivery 时保留原 Agent/进程/MCP/绑定；prepareSession 完成既有资源、模型、指纹、reconcile 和 block 校验，且 lease 无活动 request，才升级 warm lease 的 purpose。owner 仅解除自己保存的 provisioning allow=[] disposer，保留角色 toolFilter。无 warm lease、不同 Agent 或冷恢复仍重新挂 scope/MCP 并 load 原 binding；禁止 newSession fallback。provider 的 agent/created hook 对可信 parentSession 指向已准备acp root的 fresh worker 调用 prepareSession(provisioning)，并核对继承的 Preset compaction boundary；worker source必须startup，resume/clear/compact均拒绝。其它未由owner准备的root拒绝使用本路由，本期不支持全局默认输入Agent选择acp-codex。root 的 prepareSession 只接受 ownership 已校验后的调用；provisioning 若发现旧ACP header/已消费任务却无绑定也阻断，不能当新建。

- buildCodexPrompt 从完整 GenerateOptions 的 system/最后有效 system message 及 developer context 构造标注文本，携带 scoped AGENTS 与工具规则；只发送不在 committed requests.inputMessageIds 中的新持久 user messages。prefixMessageIds 为累计已发送 user ID（含本次），inputMessageIds 仅本次增量；prefixSha256=sha256(canonicalJson(累计 user 的 {id,content}))。下次校验已消费 user 前缀，不把含运行时间的 system/persona 当成不可变历史。当前有效 system/developer 每次重新附文本；身份资源仍由 owner 指纹校验。上一committedPrefix选累计prefixMessageIds最长的已committed记录（每次至少一条新输入，长度必须严格增加）；校验其ID/content hash，再生成本次累计prefixMessageIds。不能把既有 user 删改当成新任务。所有历史 assistant/tool messages 不重复注入外部会话；没有新 user、非持久匿名 user 或 text 之外内容均拒绝。不记录隐藏推理；身份 text 不保证 system 优先级。
- openCodexToolBridge 用 `@modelcontextprotocol/sdk/server/index.js` 的 Server 和 `server/streamableHttp.js` 的 StreamableHTTPServerTransport；绑定127.0.0.1随机端口，128-bit bearer、随机路径，Host 仅监听地址，Origin 缺省或精确 loopback 来源才允许，POST JSON 最大1MiB，禁用任意 CORS；认证发生在 SDK dispatch 前。HTTP MCP initialize/工具发现可在 new/load 阶段进行；tools/list 取当时scope和本次请求schema交集（尚无请求时仅公开scope），tools/call必须有活动request。每次 prompt 前 setRequest、终止后清除，MCP端点不能每次换URI而假定外部Session自动重配。
- tools/list 与 tools/call 均使用 request.options.tools 和 agent.ctx.tools.schemas(agent) 交集，调用时重新检查实际 Agent 注册实例、scope、block、signal。callId=`acp:${requestId}:${rpcRequestId}`（ToolCallId 品牌）；`agent.ctx.tools.execute({callId,name,arguments,agent,signal})` 触发 DSH 原 pipeline/guards/tools/result。不依赖模型自报 sessionId/identity。MCP 同一请求 ID+参数只调用一次，同 ID 异参数拒绝；不跨重启恢复 RPC。
- 每 bridge 串行 tools/call；Reviewer 等待 worker 不占跨 Session 全局锁。schema 捕获实际 structured_output；toolFilter.allow=[] 不能屏蔽 one-shot driver 后注册的结构化工具。tools/result 后检查 blocked；成功工具结果映射 text/structuredContent，DSH isError/error 保持 MCP isError，不将工具失败装成功文本。MCP 断开不自动重新执行未知工具。
- ToolRuntime 的 additionalContexts 不丢弃、不重新生成ID：经原agent.inject(context)进入DSH正常next-step队列，await sessions.flush成功后才向MCP返回工具结果；不再把这些上下文另拼进同一MCP结果，后续由下一次DSH请求作为新user上下文发送一次。flush失败或派发后本地结果无法安全交付时await onUnsafeSettlement持久block并拒绝结果；不能让Codex忽略MCP错误后把root当成功。concludesTurn=true时该prompt后续tools/call拒绝，并在MCP结果附固定“结束当前响应”指令，等待正常prompt stop，不通过cancel伪造成功；additionalContexts仍按DSH契约保留。
- ACP agent_message_chunk 映射公开 text；只在正常 stop 返回后生成一个 text block（buffered，不承诺 token 级实时展示），用 DSH block-start/text-delta/block-end/finish stop；无文本正常响应允许直接 finish。max_tokens→max-tokens；其它已知终止stopReason（refusal/max_turn_requests）持久RECOVERY_REQUIRED且不自动继续；cancelled/异常→稳定 LlmError 并保留发送门禁。权威 usage 存在才输出且在 finish 前，不补0。agent_thought_chunk 丢弃；native tool update 不转换成 DSH tool-call chunk，避免 loop 二次执行。
- finish.replayState={response:{conviviumAcp:{requestId}}}。provider 使用 agent/assistant-stream 的 committed end 触发异步 checkpoint，并在 before next request、owner.finishDelivery、turn-stopping 中 await 同一 checkpoint 队列；不是仅凭 transient end 标持久完成。冷读必须用 SessionPersistence。checkpoint 失败使 provider fail closed。
- compaction 在 Preset 的既有隔离组装配，禁止在 agent/created 中重复注册 Service。`compaction.ts` 的 CodexCompactionBoundary 继承锁定 `@deepseek-ai/dsh-compaction-basic@0.2.0-rc.2` 的 BasicCompactionEngine，继承 Config/inject/构造与自动事件注册；覆盖 compactIfNeeded/compactNow/compactRegion，以真实 agent.options.provider 精确判断 acp-codex：自动返回 null，显式方法在调用 super 前抛 ACP_CODEX_UNSUPPORTED_REQUEST；其它 provider 原参数委派 super，不复制默认算法。作为独立 Cordis 包入口 `@convivium/dsh-plugin/acp-compaction` 发布，默认导出该 class；八个发行 Preset 的既有 compaction 隔离组只替换 backend name，保留 toolResultPruner 与配置。spawn 经 composeFrom 继承父 Preset，因此共享 backend 但每次按真实调用 Agent 判断，不使用全局模式开关。
- prepareSession 在 new/load 前通过公开 `agentPresets.serviceFor(agent,"compaction")` 核对实际 Preset backend 为 CodexCompactionBoundary；缺 Preset、未装边界的自定义 Preset 或不能证明该能力时发送前拒绝 ACP_CODEX_CONFIG_INVALID，不改动现有 binding。provider 的 agent/created hook 只做 trusted worker 初始化/核查，不安装 compaction 服务；不修改 Agent.ctx、Cordis isolation map 或 Host backend 实例。拒绝 auxiliary 不建立外部会话、不写发送记录、不阻断正常主 Session。

## Delivery, Recovery, Deadlines And User Handling

对 ACP 的 deliver/deliverObserved 共用 observed 流程；owner 构造参数增加可选 acpCodex port，非 ACP 原行为不变。owner先读取deliveryState，再总是调用beginDelivery校验相同键的textSha256；匹配既有记录的beginDelivery不写入。仅原状态unseen时首次持久 admitting → 原 deliveryId followup → sessions.flush 成功 → queued → whenIdle → checkpoint → 验原 turn 无错误/所有对应请求 committed → completed。不允许原 wake 文本；same-key completed 返回原 durable completion，pending 只能等待进程内原 Promise；重启无原 Promise、admitting/queued/失败/unknown 均 block，不能再次入队。

owner.resume 在 purpose=delivery 且 ACP 时先复核 resources/options/header，再 reconcileSession；只在 ready/全部请求 committed/全部交付 completed（或唯一明确的持久 user/message(原deliveryId)→turn/end(reason.kind=completed) 且该turn所有request committed可证明完成；其它turn-end不算）时 loadSession 原 acpSessionId 并绑定新进程生命周期 MCP lease。正常同进程后续 prompt 复用原 MCP endpoint，只有request上下文更新。load 返回历史通知为 hydration，丢弃而不执行工具/写新事实；校验返回 model/reasoning 与绑定，再允许新输入。不调用 newSession fallback。purpose=cleanup 不 load 外部会话，仅停稳已持有资源并保留记录。

旧已接收输入但没有 provider/delivery 记录时，不猜测其执行状况：只允许从未进入过 acp-codex 的全新 Session 建立首绑定；持久 Session 已出现 acp-codex 请求 header 或 consumed input 而记录缺失，ACP_CODEX_RECOVERY_REQUIRED。worker Session 每次新建，不重用中断 worker；若父 Reviewer 已 blocked 不得再 spawn。

sending 遗留、responded 无持久 receipt、取消中 prompt、发送后异常、load/指纹不匹配→blocked；不区分网络是否已经送达，允许保守误阻断。root/worker 同链未知传播到根；stopSession(sessionId) 只停以该输入Session为根的子树：传Reviewer停Reviewer及其descendants，传worker只停该worker，不得反向停其父。冷恢复只核对旧worker技术记录、向root传播未知，不复活旧worker。不能停其它根。stop 不删除技术历史。provider.close 先拒绝新请求、取消并 drain 所有 MCP/进程，再关 domain/注销 route；process未静默不得记归档 cleanup成功。

dispatchers 固定顺序：重读正式事实，已有合法 Review/Evidence 按原规则补结算 → 检查原 contribution/claim 期限及撤权 → 查询 root block → 有 block 只抛带 `code=block.code,retryable=true,terminalOnAttemptLimit=false,retryAt=now+30000` 的现有 dispatch Error → 无 block 才创建 claim/投递。未知不新增 dispatch_failed/review_interrupted/contribution failure，不受普通 outbox 尝试上限强制失败；outbox 每30s仅核对，不触发模型。真正 contribution deadline 仍交原 handler；review claim 确实到期允许原 review_timeout 幂等结算一次并按原规则计预算，blocked 仍禁止 replacement/new claim。已提交结果优先，不因迟到错误改判。

`registerReviewWorkerTool` 注册闭包为每个真实 exec.agent.id 只保留一项 `{meetingId,claimId,result:Promise<JsonValue>}`：同一active claim的重复工具调用复用原Promise，不再start；claim改变替换这一项，撤销注册时清空，不建立跨会议通用缓存。claim仍须每次由reviewPrompts.resolve/真实caller授权，已撤权或已提交后不能靠缓存返回成功。跨重启由持久delivery/request门禁阻断，不能靠丢失内存缓存重新start旧输入。`registerReviewWorkerTool` start/result/finally dispose 不改委派协议；start 前和 result 后检查 exec.agent 根阻断，若 blocked 返回 `{kind:"failed",code:block.code}`，不得提交结果或 replacement；dispatcher 仍以持久 block 作依据，不只看模型/工具返回文本。若合法 Review 已提交则保留其事实。

可见诊断目标：新增 `MeetingView.executionBlocks?: readonly {identityId:string;code:"ACP_CODEX_OUTCOME_UNKNOWN"|"ACP_CODEX_RECOVERY_REQUIRED";since:number;allowedActions:readonly ["pause_meeting","end_meeting"]}[]`；数组由 runtime 用 ownership 关联 provider 技术记录生成，空时省略，依 identityId 排序。无 Meeting version/event 变化，不能冒充领域错误；不输出路径、ACP Session ID、model、凭据。provider 持久 block 后通过 subscribeBlocks 通知 runtime 现有 refreshListeners 发送当前 committedVersion，Client 对该刷新重新读取，即使领域 version 未变。

`plugin/src/client/meeting/panel.tsx::ConviviumMeetingPanel` 在详情区域显示 role=alert 的本地化提示，指出身份、停止自动执行及可暂停/异常结束；只复用现有 Captain 控制，不加清锁按钮，不把 resume 当解除。继续/新通知仍被门禁挡住。本期异常结束/归档后另建会议是唯一重做入口；不支持原 Session 人工标 healthy。

## Local And Remote Acceptance Boundary

`followup`/flush 只证明本地 inbox 接收与持久化，不能证明远端接受 prompt；sending 先于网络发送只形成防重放门禁，不能证明远端未执行。ACP 正常 stop/responded 也不能证明 DSH 已持久化回答；只有原生 assistant receipt、flush 及原 turn 正常结束分别满足后，才能推进 request/delivery 状态。loadSession 的 hydration 不代表新执行，目录探测不证明推理账户权限。

Host 显式提供锁定 CLI 的 CODEX_PATH，计算实际 binary 版本/hash，不经 shell、不从 PATH 静默选替代 CLI。省略 acpCodex 不增加新的必需服务；启用需要 agents、llm、tools、sessions、sessionPersistence、subprocess、storageDomain，缺失、重复 route 或 domain 打开失败拒绝启动。发行包不内置 bridge、不自动安装/登录或打开浏览器，不透传 OPENAI_API_KEY、DEEPSEEK_API_KEY、DSH_*。

专项未给模型输入时精确选 probe 公开的 model.currentValue 和该模型 reasoning_effort.currentValue，均须为目录成员；显式输入严格验证。probe 不发 prompt，并关闭进程/MCP lease。身份指令在 ACP 中作为标注 text 发送，必须分别验证字节到达和真实模型遵循，不宣称原生 system 优先级。

## Acceptance Outbox Read

仅供可信本地验收插件使用的包导出 `readMeetingOutboxForAcceptance(input: {storageDomain: {get(name: string): {table(name: string): Pick<KvTable<string, unknown>, "get" | "entries">} | undefined}; meetingId: string; deliveryIds: readonly string[]}): readonly {id: string; deliveryId: string; status: "pending" | "leased" | "delivered" | "failed"}[]`。它通过 Host 公开 `storageDomain.get` 借用已打开的 catalog/meeting domain，复用 Repository 的 Schema 和提交链/checkpoint 校验；不 open、close、recover、claim、put、delete，不修改 lease 或领域 version。调用者不取得 Repository/domain handle。缺少已打开 domain、catalog 非 ready、会议身份不匹配、空/重复输入、未知 deliveryId 或损坏提交链均拒绝；每个 deliveryId 必须恰有一项 outbox，返回顺序沿输入，返回值为冻结的字段白名单。只允许本地同进程插件传入 Host facility；不注册模型工具或 Web/Remote API，不代表用户或 Meeting authority。停稳/冷恢复仍由原 Host 生命周期负责。
