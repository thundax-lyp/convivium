# Code Alignment Evidence

> 2026-09-07 阶段更新：CA-01–06 已有本地实现与新增回归，尚未完成修复后的真实 smoke 和最终验收。下文为修复前审计基线，不能再直接视为当前源码缺口；本轮状态、验证与待办见 [HANDOFF](../../HANDOFF.md)。

## Scope

- 日期：2026-09-07。
- 代码及正式文档基线：`743edbee564d34402fedc2bb44ebbb006790fe1a`，分支 `codex/align-code`。本次只修改 readiness，未修改产品代码、测试或正式需求。
- 环境：Darwin 25.5.0 arm64、Node `v22.23.2`、pnpm `10.7.0`；真实 smoke 使用 DSH `0.1.1-rc.2`、`web` profile、`spawn` provider。
- 读取 `10-requirements/` 的会议需求、`20-interfaces/` 的五份接口以及 `30-designs/` 的六份设计；沿创建、调度、提交、完成、持久化、恢复、归档、角色组合、HTTP 和 Client 路径核对实现与测试。此项是覆盖核对，不宣称穷举全部代码组合。
- 下列确定性反例直接调用当前源码；它们不是现有 Vitest suite 的失败项，也不是已经修复的缺陷。

## Validated Contract

| 依据 | 当前源码与相称验证 |
| --- | --- |
| [Requirements](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-1/2/3/9 | `src/index.ts`、`src/runtime/meeting-runtime.ts`、`src/dsh/`；provider gate、ownership、独立 continuable Session、顺序提交、timeout/reassign，当前真实 smoke 通过；完整冷恢复仍有下述缺口 |
| [Protocol](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md) | `src/protocol/`、`src/tools/register-tools.ts`、`src/http/index.ts`、`src/runtime/application-service/`；Schema、caller、receipt、版本及终态检查；contract tests 和真实工具/HTTP 场景通过 |
| [Storage Interface](../20-interfaces/MEETING-STORAGE-INTERFACE.md) 与 [Persistence Design](../30-designs/MEETING-PERSISTENCE-SPECIAL-DESIGN.md) | `src/repository/domain/`、`src/storage/`、`src/runtime/outbox-worker.ts`；单 commit 发布、checkpoint/tail、JSONL reopen、lease、私聊独立持久状态；contract/recovery/storage tests 与真实 cold-rebind 通过 |
| [Orchestration Design](../30-designs/MEETING-ORCHESTRATION-DESIGN.md) §12–13、D6–D10 | `src/domain/planning.ts`、`src/domain/transitions/turn-advancement.ts`、`src/domain/completion.ts`；已有规划、waiting/fallback/refocus/replan/termination 路径；当前 smoke 通过不排除下述四个反例 |
| [Domain Model](../30-designs/DOMAIN-MODEL-DESIGN.md) 与 Protocol 的 claims/Decision/minutes | `src/domain/transitions/`、`src/projection/status.ts`、`src/runtime/services/meeting-archive-service.ts`；Question、Proposal revision、Position、Decision/risk、纪要和归档的既有 contract tests 通过 |
| [Role Catalog](../20-interfaces/MEETING-AGENT-ROLE-CATALOG-INTERFACE.md) | `src/runtime/services/agent-catalog.ts`、`meeting-turn.ts`、`meeting-attendance.ts`、`attendance-rejection.ts`；optional consumer、attempt snapshot、安全 projection、pending/rejected；没有 approve/admission/research dedup 实现 |
| [Definition Interface](../20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md) 与 [Role Composition](../30-designs/ROLE-COMPOSITION-DESIGN.md) | `src/role-composition/`、创建前预检、`startContinuable` persona/toolFilter、ownership provenance；当前真实 role-composition 的双 Host、工具拒绝和 V1 配置恢复通过 |
| [Developer Markdown](../20-interfaces/DEVELOPER-MARKDOWN-PROJECTION-INTERFACE.md) | `src/projection/developer-markdown.ts`、`src/runtime/services/developer-markdown-service.ts`；提交后 callback、白名单、stale/原子替换、失败隔离和 dispose 单测通过；枚举文档漂移见下文 |
| [Implementation Design](../30-designs/CONVIVIUM-IMPLEMENTATION-DESIGN.md) 与 [Scope Control](../30-designs/MEETING-ORCHESTRATION-SCOPE-CONTROL-SPECIAL-DESIGN.md) | 单 package 与模块边界测试通过；当前 Client 支持列表、主要事实与本地控制；不因本次核对新增 adapter、恢复机制、产品功能或扩大协议 |

上述源码路径相对 `plugin/`。当前验证与下列缺口共同构成结论，不能只引用通过项。

## Executed Validation

| 执行方式 | 实际结果 |
| --- | --- |
| `pnpm --dir plugin verify` | exit 0；82 test files、1039 tests PASS；format、lint、Host/Client typecheck、build、environment、plugin contract、9 个 Definition 样本及 package verifier 全部通过 |
| `pnpm --dir plugin smoke:profile --all` | exit 0；16/16 PASS；总计 140404ms，一次构建；每个场景 `restore=PASS`；逐项结果见 [Smoke Evidence](./SMOKE-VALIDATION-EVIDENCE.md#current-baseline-validation) |
| 下方 Node 源码反例 | 先以两次一次性 `node --input-type=module` 调用复现，再提取本文两个代码块合并重跑，均 exit 0；打印的四项行为均与正式规则不符。exit 0 表示复现执行完成，不表示产品验收通过 |
| `git diff --check`、readiness 相对链接检查 | 本次文档完成后通过；产品源码 diff 为空 |

真实 smoke 按 [操作规程](../50-operations/HOW-TO-DSH-SMOKE.md) 使用每场景独立临时 Host/profile/workspace/DSH_HOME/端口。脚本只在 Host 停止、精确临时根删除、端口可独占绑定后输出 PASS，命令结束清理共享构建目录。没有打印或持久化凭据。确定性 driver 使用真实 DSH Session/tool/storage，不请求 LLM。

### Confirmed Code Gaps

| ID | 正式依据与触发条件 | 当前源码及观察 | 影响与补齐验收 |
| --- | --- | --- | --- |
| CA-01 | FR-8.5、Orchestration §13.2–13.3：存在当前 revision 的 blocking `object/needs_revision`，其余完成条件满足 | `completion.ts::isObjectiveSatisfied` 未检查 Position；`meeting-guards.ts::assertCompletionReady` 复用该函数。反例中 judge 返回 completed，`endMeeting(...outcome=completed)` 也成功且保留 `pos-a` 异议 | 仍有阻塞异议却可宣告业务完成。应使完成判断及 Captain/local completed 入口拒绝该组合，同时允许非阻塞少数意见；不能用已有 Decision acceptance 的 Position guard 代替会议完成 guard |
| CA-02 | D6/D7、Orchestration §12.4：同一 active agenda 下两个独立 Proposal 各有一个不同 Participant 的当前 blocking Position；没有末席同分竞争 | `planning.ts::currentProposal` 对整个议题按 revision 排序后只取第一项；`needsSemanticArbitration` 仅从这一项收集 owners。反例应为 true，实际 false；评分中的 blocking owner 集合也使用同一窄集合 | hybrid 漏掉跨 Proposal 的语义裁决条件。应覆盖每个 Proposal 的当前 revision，排除 superseded revision，验证独立 Proposal 的 revision 数不可互相比较 |
| CA-03 | D10、Domain Model 的 canonical-ID-sorted fingerprint：同一 Proposal 的两个 blocking Positions 仅交换数组顺序 | `turn-advancement.ts::createProgressFingerprint` 的 Position comparator 只比较 tuple 首项 proposal ID，同 Proposal 内不排序。反例 fingerprint 相等性为 false | 指纹依赖非语义数组顺序，不能证明相同事实稳定。需对同 Proposal 的 Position 身份提供稳定排序；本次只验证纯函数，不宣称普通 command 或冷恢复已经实际重排数组 |
| CA-04 | Orchestration §12.3 `previous turn did not speak +20`：Participant 曾在 turn 1 发言，turn 3 未发言，当前 turnSeq=3 | `planning.ts::rankRulePlanningCandidates` 用 `neverSpoke` 决定 +20。反例该 Participant 只有 recency=2，实际总分 2，按规则应为 22 | 历史发过言但上一 Turn 缺席的 Participant 少得 20 分，可能改变有名额限制时的计划。应按上一已提交 Turn 判断该分项，保持既定 recency 与同分顺序 |
| CA-05 | FR-9.4/7/8、Orchestration §14.2：创建中断或持久 Session 缺失后的恢复 | `meeting-recovery-service.ts::rehydrate` 跳过非 ready bootstrap；ready Meeting 仅恢复 repository 并保持 parent 未绑定。`rebindCaptainParent` 有导出/单测，但生产应用服务未调用；`startManagerSession/startParticipantSession` 只由创建路径调用 | 已有完整 ownership 的 cold-rebind 不等于中断创建对账、缺失 Manager/Participant 补建。尚无完整自动清理/补建路径及对应当前真实故障注入证据；应先按正式边界补齐并验证跨 Meeting 不误操作 |
| CA-06 | FR-11、Orchestration §17.4、Implementation Design 的 observability | `projectMeetingStatus` 提供 proposals/positions、pendingHandRaises 和收敛计数；`src/client/` 没有这些字段的展示消费。Runtime 只有局部错误处理和 Markdown warning，没有设计要求的完整结构化日志/metrics 采集 | 后端 projection 可读不代表面板全部可观察；列表、Decision/risk 控制通过不覆盖这些区域。需要独立补齐 UI 展示与相应观测验收，metrics 不以新的状态真相源实现 |

CA-01–04 为已执行的确定性反例；CA-05–06 为源码接线和字段消费核对，不标成真实故障场景 PASS。它们均未在本次修复。

### Reproduction Inputs

从 `plugin/` 执行 `node --input-type=module`，先加载以下只读 TypeScript loader。它使用已有 `typescript`，不安装依赖、不生成文件、不修改源码。

```js
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
      }).outputText
    };
    return next(url, context);
  }
});
const { questionState, now } = await import('./tests/unit/domain/transitions/fixtures.ts');
const { needsSemanticArbitration, rankRulePlanningCandidates } = await import('./src/domain/planning.ts');
const { createProgressFingerprint } = await import('./src/domain/transitions/turn-advancement.ts');
const { judgeTurnCompletion } = await import('./src/domain/completion.ts');
const { endMeeting } = await import('./src/domain/transitions/termination.ts');
const position = (id, participantId) => ({ id, participantId, position: 'object', blocking: true, proposalRevision: 1 });
const proposal = (id, positions) => ({ id, title: id, description: id, proposedBy: 'participant-1', agendaItemId: 'agenda-1', revision: 1, status: 'under_review', positions, createdAt: now, updatedAt: now });
```

在同一进程追加以下输入；与本次两次执行的输入等价，各观察相互隔离：

```js
const completion = questionState();
completion.agenda[0].status = 'resolved';
completion.proposals = [proposal('proposal-a', [position('pos-a', 'participant-1')])];
console.log('CA-01 judge', judgeTurnCompletion(completion, now).kind); // completed，预期不可完成
console.log('CA-01 end', endMeeting(completion, {
  meetingId: completion.id, captainBinding: 'captain:captain-1', outcome: 'completed',
  reason: 'completion probe', acceptedDecisionIds: [], deferredAgendaItemIds: [], waivers: [],
  now, factId: i => 'fact-' + i
}).state.status); // completed，预期拒绝
const arbitration = questionState();
arbitration.proposals = [proposal('proposal-a', [position('pos-a', 'participant-1')]), proposal('proposal-b', [position('pos-b', 'participant-2')])];
console.log('CA-02', needsSemanticArbitration(arbitration, rankRulePlanningCandidates(arbitration), 'normal')); // false，预期 true
const fingerprint = questionState();
fingerprint.proposals = [proposal('proposal-a', [position('pos-a', 'participant-1'), position('pos-b', 'participant-2')])];
const before = createProgressFingerprint(fingerprint);
fingerprint.proposals[0].positions.reverse();
console.log('CA-03', before === createProgressFingerprint(fingerprint)); // false，预期 true
const ranking = questionState();
ranking.turnSeq = 3;
const message = (id, speaker, turnSeq, seq) => ({ id, seq, turnSeq, turnId: 'turn-' + turnSeq, stepId: id, attemptId: id, speaker, agendaItemId: 'agenda-1', agendaRelation: 'on_topic', kind: 'statement', content: 'same', mentions: [], taskIds: [], createdAt: 1 });
ranking.transcript = [message('m1', 'participant-1', 1, 1), message('m2', 'participant-2', 3, 2)];
console.log('CA-04', rankRulePlanningCandidates(ranking).find(x => x.participantId === 'participant-1').score); // 2，预期 22
```

### Documentation Alignment

以下不作为新增产品实现许可：

- Protocol 明确 required-review/risk evidence 不属于 V1 Question claim；Decision candidate 不持久化 status、不提供 reject/revoke。因此移除旧 coverage 对这两项的“未实现”描述。
- 旧 coverage 的“收敛真实链路未覆盖”与专项记录冲突；当前全量 smoke 又实际覆盖 `convergence`、`convergence-stalled`、Turn budget completion，按本次结果更新。已删除的三个 selector 只保留原历史证据。
- Developer Markdown Interface 的 `DeveloperDecision.acceptanceMode` 枚举遗漏 `local_host_acceptance`；源码 mapper 直接保留当前领域值。当前 local 来源由 Requirements/Protocol 明确授权，应记录为该辅助接口文档漂移，不能删除 local provenance 来迎合旧枚举。
- Orchestration 的早期示例还包含 `agentSessionId`、`lastSpokeTurn`、TeamState task lock、§12.5“Meeting creation 不读取 Catalog”、§20 Definition“待实现”等旧表述；Architecture、Domain Model、Role Catalog 的 initial planning 契约和 Role Composition 分别提供更明确的当前依据。Implementation Design 模块表中的 `transitions.ts`、`turn-runner.ts`、`mail-processor.ts`、`recovery.ts`、`archive.ts` 也不是当前文件落点。此次只在 readiness 记录，未按旧示例给代码补字段或另建模块。

## Not Covered

- 本次没有 Browser UI 交互或真实 LLM 请求；Client tests 使用 jsdom，普通 smoke 的 HTTP/Client 产物检查不替代 Browser。既有 Browser 证据仅适用于专项文档注明的基线。
- CA-01–04 未新增 HTTP/真实 DSH 反例；CA-03 未证明现有正常写路径会重排 Position。CA-05 没有删除真实 Session 或在创建中途强杀 Host。
- FR-13 的 approve/admission/provisioning、research evidence freshness/dedup、自动 expired/cancelled 尚未实现；真实 Host producer 成功推荐→Captain reject 和这一子闭环的 Host 冷重启无当前 selector 证据。内联初始 Definition 不补足这些能力。
- 邮件“发送后推进 transcript、延迟开始处理、重试仍固定上界”的完整跨层动态组合仍未独立验证；`mail-race` 不扩展为该组合的证明。
- stress 脚本仍是 `--passWithNoTests` 加 `Not Covered: stress tests`；本次未执行该占位命令。长期容量、资源泄漏、完整结构化 metrics、生产发布和高于最低 DSH 版本兼容未验证。
- 本文不把单测成功、pack/install 成功或 smoke PASS 等同于完整需求验收；上述已发现代码缺口仍开放。

## Closure

已完成本次文档与代码覆盖核对，并取得当前基线完整 verify 和 16 场景真实 DSH smoke 证据。当前是“已有主要会议运行路径且关键跨层回归通过，但仍有已复现完成/调度偏差及恢复/展示缺口”的状态，不是完整产品或发布就绪。TODO 原本无登记项，本次不新增修复任务或关闭未完成能力；缺口保存在本文供后续明确实施范围。
