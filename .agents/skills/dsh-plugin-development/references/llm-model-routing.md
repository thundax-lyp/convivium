# 模型目录、内置 Adapter 与图像请求

本 reference 固定 `dsh-v0.1.2-rc.1` 的已实现路由，不以外部厂商当前能力替代本 tag。实现新 Adapter 的 stream/replay 规则见 [LLM Adapter](llm-provider-adapters.md)。

## LLM Service 的能力边界

`ctx.llm` 注册 Adapter routes、configurable provider metadata、listProviders/listModels、endpoint discovery 与 exact model resolution；它不是带 retry/cache/rate-limit 的网络客户端。每个 stream 是一次 attempt，以唯一 terminal finish 表达正常、error 或 aborted；BlockAssembler 聚合核心 blocks，插件新增 block 也必须正确闭合。

请求模型能力在 I/O 前验证，省略 maxTokens 才物化 adapter/model 默认。GenerateOptions sampling 只有 temperature/maxTokens/stop；没有 tool_choice/top_p/penalty、prefill、per-tool strict 或 cache hint 的公共承诺。不同 Adapter 可以明确拒绝公共可选项，不能因类型允许便推定都支持。

## 官方 DeepSeek route

llm-deepseek 注册 deepseek-official。ApiKeyEnv 默认 DEEPSEEK_API_KEY，endpoint 的环境覆盖与 Credential/Settings 按一次 operation snapshot 解析；拒绝的 settings generation 不贡献部分新字段。默认 thinking enabled、reasoningEffort high、maxTokens 256000、defaultContextWindow 1000000、streamIdleTimeoutMs 300000。这些是该 tag 的配置，不保证任意模型实际容量。

默认 advisory models 为 deepseek-v4-flash、deepseek-v4-pro、deepseek-v4-flash-vision-exp；显式 models 整体替换，未列出的 model id 仍可按 text-only 转发。Effort 为 off/low/high/max，unsupported 在网络前失败；thinking disabled 拒绝非 off 配置，session-title purpose 强制 off。不要把标签指导当价格或外部服务可用性证明。

Image-capable route 把 durable ref 投影为确定 request bytes，默认 pixel budget 640000，low 为 512×512，byte target 默认 1MiB。请求前文字说明 attachment id/实际尺寸，执行环境可映射时附只读路径；text-only route 用稳定 placeholder，不删除 durable attachment。

Files API 默认优先：以 endpoint+key 隔离缓存，singleflight 的 waiter 可独立取消；期限前刷新，stale-file 错误失效后允许一次 replacement chat attempt。上传超时/失败改整个请求为同一版本的 base64，不混用 file-id 与 inline。Quota 最多清理一批 Harness-owned oldest files 后重试上传，不能删除用户其他文件。

Files 高水位默认 128MiB/600 张，inline 独立 20MiB；oldest-prefix offload quantum 分别 64MiB/10MiB/20 张。每个被移除图像保留可见 placeholder，这些 cap 不等于整个 HTTP body cap。Files deadline 60000ms，requested expiry 604800s、refresh margin 3600s、quota batch 100。图像输入来自 durable attachments，不支持任意外部 image URL 或 assistant image output。

## pi-ai routes 与授权

llm-pi-ai 的 providers dictionary key 是 route。Installed catalog 可沿用 api/baseURL/models；未知 route 必须有 api、baseURL 和非空 models。Models 整体替换；modelOverrides 只改已知 catalog 中指定项，不能与 models 并用，不能对 hand-declared route 或未知 model 静默生效。

ReasoningEfforts 把 UI key 映射到 wire spelling，false 声明 non-reasoning，省略保留 installed capability。Compat 可在 route/model 层配置，一 route 只用一个 wire protocol。容量 fallback 为 context 262144/output 32768；stop 返回 UNSUPPORTED_OPTION，不依赖 SDK 隐式忽略。

ApiKeyEnv 显式 reference 优先，缺值 MISSING_CREDENTIAL；省略可用 stored sign-in，再沿 provider-native ambient discovery。受支持登录用 [Authorization](credentials-authorization.md) 存在 llm-pi-ai/provider-id，refresh 走 record lock；不满足 key grammar 的 route 不能登录（UNSTORABLE_PROVIDER_ID），仍可配置 reference/ambient。Owner 原生读取 credential 文件内容可能绕过 reference seam，不能声称所有 SDK 认证都集中在 env resolver。

Settings 按 provider/key 分层合并，可加/覆盖，不能删除 composition routes 或底层 dict keys。Route/retry-policy 改动原子 re-register，冲突保持旧集合。发现 catalog route 不联网；未知 route 的支持协议可 GET models，候选返回不写 settings。Headers 是 plain strings，不保证 redactor 能识别其中 secret；使用 credential reference。

Pi image 默认 pixel 4194304、每张 byte target 1MiB、aggregate base64 20MiB，排除正文/tools/JSON envelope，gateway cap 需要余量。Image modality declaration 不探测实际服务器，错误声明可在 admission 后失败；switch text-only 可继续使用 placeholder。

## 验证

覆盖 exact model/effort/option failure、models 与 overrides、settings atomic last-good、credential precedence/login、discovery 不写配置、图像 request version/offload、Files fallback/singleflight/stale/quota、terminal finish/error 和各 Provider 的 replay。离线编译不验证外部模型目录实际在线。
