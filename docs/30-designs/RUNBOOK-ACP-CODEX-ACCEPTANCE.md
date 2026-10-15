# RUNBOOK: ACP Codex — 环境、真实验收与全组收口

## Status, Dependency And Boundary

2026-10-15；Author / Audit；**Executable（实施计划，尚未执行）**。必读[总入口](./RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md)的执行者契约、文件计数、共同依据、不变量和失败收口；本册补齐当前范围，不能跳过前序册。本册不授权提交、安装到人工环境或额外模型用量。

前置：D5 PASS。Scope：官方环境预检、专项脚本与真实两轮、完整验证及删除全组。Non-goals 沿总入口，不新增业务决定。

当前断点：尚无新lane或官方安装组合的实际运行证据。输入、精确字段、owner 和失败语义在 A 册迁入正式文档后消费；生产文件/symbol 与本册每步白名单一一对应。新文件明确为计划新增，不代表已实现。

## Mechanical Steps

## Formal Inputs And Evidence

读取 [DSH Smoke](../50-operations/HOW-TO-DSH-SMOKE.md)、A2 的 ACP interface 与 [Coverage](../40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md)。官方binary/model选择沿正式ACP interface；本次专项结果JSON/来源断言见E2，不升为产品公开接口；不再从已删除草稿取值。权限/恢复确定性证据复用P/D册；真实专项不能用fixture替代。

### E1：编写并执行官方环境预检

前置状态：D5 PASS；允许本次官方环境探测，不发模型prompt。
允许修改（2 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/scripts/acp-codex-preflight.mjs`
- `plugin/package.json`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. preflight脚本唯一入口直接Node运行；固定从plugin/node_modules解析官方codex-acp/Codex package bin，CODEX_PATH固定锁定CLI，检查已登录状态，仅输出boolean/版本。验证lock完整性、记录bridge入口及平台binary SHA256/版本，不dump环境或认证。
2. 只initialize/new/configOption/close，默认选择model.currentValue及其reasoning.currentValue；若存在CONVIVIUM_ACP_CODEX_MODEL/REASONING则严格验证指定值。无合法默认/认证失败STOP，不自动猜模型或发prompt验证。输入不用必须由用户手填。
3. 添加package script `acp:preflight`；smoke内部调用相同preflight函数 `preflightCodexAcp():Promise<{command:string;args:readonly string[];model:string;reasoningEffort?:string;versions:Record<string,string>;binarySha256:Record<string,string>}>`，函数定义在新脚本并支持直接执行打印脱敏JSON；脚本不是新增产品抽象。
4. 支持直接执行及import两种入口，导出preflightCodexAcp；import不自行运行。只做版本/登录/initialize/new/configOption/close；保留既有登录。具体锁定和默认model/reasoning规则沿正式ACP合同。本期真实lane仅macOS：darwin/arm64取@openai/codex-darwin-arm64和aarch64-apple-darwin，darwin/x64取@openai/codex-darwin-x64和x86_64-apple-darwin；从锁定Codex包入口的createRequire解析平台包/package.json，再取vendor/<triple>/bin/codex。CODEX_PATH显式指向此原生binary；缺包/文件或非darwin立即STOP，不取系统CLI。

验证：

```bash
pnpm --dir plugin acp:preflight
pnpm --dir plugin build
```

PASS：精确版本/binary hash/合法默认选择输出且无session/prompt；构建通过，只证明可开始真实验收；本步实际变更路径 2–10 个且均在清单内。
STOP：认证/目录/能力失败、缺binary或需重新登录/复制凭据；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### E2：实现专项脚本并完成真实两轮冷恢复

前置状态：E1 PASS；真实测试用量已获Execute授权。
允许修改（7 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `plugin/scripts/smoke-profile/index.mjs`
- `plugin/scripts/smoke-profile/environment.mjs`
- `plugin/scripts/smoke-profile/result.mjs`
- `plugin/scripts/smoke-profile/probe/index.mjs`
- `plugin/scripts/smoke-profile/probe/support.mjs`
- `plugin/scripts/smoke-profile/probe/scenarios/acp-codex-reviewer-web.mjs`
- `plugin/tests/contract/meeting-roles-deployment.spec.ts`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. 按正式合同修改原三个lane的临时Definition配置，退役脚本中的overrides；CORE_SCENARIOS继续原显式角色，SMOKE_SCENARIOS加入acp-codex-reviewer-web。
2. runScenario复用现有hot/cold启动方式，新增runAcpCodexReviewerWebScenario(runtime)和validateAcpCodexReviewerWebResult(value)；preflight从E1脚本import。临时profile仅Reviewer选Codex，真实caller/tools/result/checkpoint采证。
3. 一场会议两轮，Manager/Reviewer/GitHub/arXiv/Web五独立root；每轮每contributor一份Evidence，目标六个合法Review，worker机制spawn且模型继承Codex。失败重试另按原预算；20分钟软时限失败STOP，不能宣传费用/token上限。
4. 议题固定“DSH通过ACP连接外部Agent的公开机制、权限和恢复边界”。Web每轮至少一次真实search和两个不同域名正文读取，限定agentclientprotocol.com及deepseek-harness.github.io。保存URL/标题/发布时间（缺失unknown）/访问时间/正文sha256，实际工具事件和正式证据相互印证，不硬编码措辞。起始页面固定为 [ACP Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup) 与 [DSH Architecture](https://deepseek-harness.github.io/deepseek-harness/en/reference/)，只作为实际搜索后读取的定位起点，不预填正文或claim；DSH域名根路径返回404，禁止把域名直接拼成根URL作为读取成功条件。
5. 第一轮发布后等待每个已观察发送的原deliveryId都有delivery-completed、对应请求有committed事件，且相关outbox已delivered；使用事件和Repository交叉检查，不访问owner私有字段，暂停并停稳隔离Host；同目录重启load原ACP ID，hydrate不重复工具；第二轮真正再经Reviewer和新spawn worker审核，最终正常结束/归档。未知故障恢复由P5/D3/D4确定性测试承担，不强迫付费真实请求中重复kill。
6. result必须为严格JSON：`{ok:true,scenario:"acp-codex-reviewer-web",meetingId:string,observed:{sessionIds:Record<string,string>,reviewer:{provider:"acp-codex",model:string,reasoningEffort?:string,workerProvider:"spawn",workerModel:string,structuredReviews:number},web:{searchCalls:number,sources:Array<{roundId:string,url:string,title:string,publishedAt:string,accessedAt:string,contentSha256:string}>},rounds:number,coldRecovery:boolean,authorizationRejected:boolean,archiveComplete:boolean}}`；sessionIds键精确五role，structuredReviews=6、rounds=2，其余boolean=true；每轮域名集合都含两个指定域，workerModel=model。验证器拒绝未知/缺失字段，不接受模型自述代替事件。
7. Prepare/Execute/Assert/Restore：隔离mkdtemp profile，不复制Codex凭据；停止/等待本次进程，脱敏证据先保存到CONVIVIUM_SMOKE_RECORD_DIR；只清理自己创建的临时根，失败也保存并收敛。

验证：

```bash
pnpm --dir plugin exec vitest run tests/contract/meeting-roles-deployment.spec.ts
pnpm --dir plugin build
test ! -e /tmp/convivium-acp-codex-evidence
CONVIVIUM_SMOKE_RECORD_DIR=/tmp/convivium-acp-codex-evidence CONVIVIUM_SMOKE_SCENARIO=acp-codex-reviewer-web pnpm --dir plugin smoke:profile --json
```

PASS：strict JSON、五Session/两轮/六Review、真实搜索/两域正文、同绑定cold后真正新执行、跨身份拒绝及归档/Restore全部成立；本步实际变更路径 2–10 个且均在清单内。
STOP：模型/网络/未知block/软时限/任一断言失败；证据目录已存在也先STOP，不覆盖或另开会议掩盖；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

### E3：完整验证、迁移证据并删除全部 RUNBOOK

前置状态：E2 PASS。
允许修改（9 个文件；新增、修改和删除合计，实际须 2–10 个）：

- `docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md`
- `docs/50-operations/HOW-TO-MEETING-ROLES.md`
- `docs/50-operations/HOW-TO-DSH-SMOKE.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-REVIEWER-WEB-ANALYZER.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-CONTRACTS.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-CONFIGURATION.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-PROVIDER.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-MEETING-INTEGRATION.md`
- `docs/30-designs/RUNBOOK-ACP-CODEX-ACCEPTANCE.md`

禁止修改：禁止超出文件清单、相邻功能及入口所列 Non-goals；不修改第三方源码或固定人工环境。

执行：

1. readiness分开记录静态/确定性/真实验收、版本/binary/model、恢复注入与Not Covered；操作文档记录安装/Definition迁移/预检/失败处置。草稿已在A3删除，此处不得重建“已迁移”草稿。
2. 运行下列完整verify与原三lane；E2新lane证据仅在源码、配置、构建物、binary/model未变时复用，避免重复用量。任一失败保留全部RUNBOOK，不先删除。
3. rg核对本组RUNBOOK与草稿文件名引用。存活正式文档只能指向长期正式来源；本组之外出现残留引用且不在本步清单时STOP，由作者调整，禁止直接扩大文件数。
4. 所有scope/门禁/迁移证据齐全后一次删除本组六份RUNBOOK，计入本步9个文件预算。删除前保留仓库外可恢复字节；删除后再运行链接/diff检查，失败恢复六册和相应引用并STOP。不留completed/archive副本，不提交/PR/merge。

验证：

```bash
pnpm --dir plugin verify
CONVIVIUM_SMOKE_SCENARIO=identity-admission pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=meeting-business-loop pnpm --dir plugin smoke:profile --json
CONVIVIUM_SMOKE_SCENARIO=peer-meeting-agents pnpm --dir plugin smoke:profile --json
rg -n 'RUNBOOK-ACP-CODEX-|ACP-CONTRIBUTOR-CONFIGURATION-DESIGN-DRAFT' docs TODO.md
node .github/scripts/check-doc-links.mjs
git diff --check
```

以上命令在删除前运行。实际删除后，固定执行下列检查；rg 的“无匹配”退出码 1 在这里显式转换为成功，不能将它误报为失败或忽略其它错误：

```bash
if rg -n 'RUNBOOK-ACP-CODEX-|ACP-CONTRIBUTOR-CONFIGURATION-DESIGN-DRAFT' docs TODO.md; then
    exit 1
else
    test "$?" -eq 1
fi
node .github/scripts/check-doc-links.mjs
git diff --check
```

PASS：完整verify+原三lane+E2专项证据齐全，正式文档承接长期内容，六册和草稿均不存在、删除后链接/diff退出0；本步实际变更路径 2–10 个且均在清单内。
STOP：缺证据/门禁失败/有外部残留引用；删除后检查失败恢复册后停止；文件预算不符、需要额外文件或人为凑改动均停止。保留原数据/最后 PASS/脱敏复现，按入口 Restore 收敛，不自行扩张。

## Validation And Final Restoration

E1只有目录/登录/版本探测，E2才有真实模型与互联网证据，E3负责全局交付门禁；三者不互代。E2实际测试已合并到脚本变更步骤，E3完整验证已合并到长期文档/删除步骤，不另设零文件步骤。

Prepare/Execute/Assert/Restore沿总入口：隔离profile，不复制凭据；成功失败均停止本次进程/租约，只清自己的临时根，先保存脱敏证据。旧Meeting/outbox/claim/技术记录不得删除以绕过unknown。所有失败保留最后PASS及原错误；未全部通过不能删除RUNBOOK或宣称交付完成。
