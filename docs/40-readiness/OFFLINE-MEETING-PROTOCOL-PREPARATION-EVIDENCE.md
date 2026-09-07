# 离线会议协议准备验证证据

## Scope

日期：2026-09-07。本次交付仅为可复用、无外部副作用的协议样例和生产函数 contract suite，不证明真实模型会议闭环。

- [样例工厂](../../plugin/tests/fixtures/offline-meeting-protocol.ts)：`OfflineMeetingProtocolFixture`、`createOfflineMeetingProtocolFixture`，十个 required 字段，固定时间 `1700000000000`，每次 transition 输入及各返回字段独立深拷贝。
- [Contract suite](../../plugin/tests/contract/offline-meeting-protocol.spec.ts)：八个测试，私有 `runManagerPlan` 和 `collectToolDefinitions`。没有新增运行入口、配置、依赖或产品代码。
- 依据：[会议需求](../10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md) FR-2/3/4/12、[Agent 协议](../20-interfaces/AGENT-MEETING-PROTOCOL-INTERFACE.md)、[会议设计](../30-designs/MEETING-ORCHESTRATION-DESIGN.md)。样例不得注入模型冒充产品 prompt 或能力安装。

工程基线 `1dd23b318f41531d02f7d03d3d543edef8259071`；最终测试实现 `908c78178ea4cf95eb2525795a0c49ea83fff89f`；完整验证 HEAD `a8d2f12cc62d6e7ba5b0126912a5a5dfb5bfc5a5`；证据迁移前 HEAD `bed6ed9d5009e16ce5a557846e7289a5c9bc7608`。其后到证据收口只有文档变化。

| 文件 | SHA-256 |
| --- | --- |
| `plugin/tests/fixtures/offline-meeting-protocol.ts` | `2a5366888683051096da2914aa361778a7566998a2e352762c0fb520619b68c4` |
| `plugin/tests/contract/offline-meeting-protocol.spec.ts` | `c3a60ec9c1e8baec8d8b85d20944c7c04d4194908c514dc325ded940a046fc57` |

## Validated Contract

链路使用生产 `prepareMeetingCreation` → `startManagerPlanning` → `projectManagerMeetingContext` → `submitManagerPlan` → A `projectSpeakerMeetingContext` → `submitSpeakerAndAdvanceMeeting` → B `projectSpeakerMeetingContext`。Create、Manager、A、B 输入经过生产 Schema；领域 input 只传对应允许字段。没有工具 execute、repository commit 或实际 B 提交。

| 对象或状态 | 固定证据 |
| --- | --- |
| Meeting/Team | `offline-meeting` / `offline-team` |
| Participants | 输入 keys `a` / `b` 由生产 allocator 转为 `participant-a` / `participant-b` |
| Agenda/Criterion | `agenda-reference` / `criterion-reference`；planning 时议程 discussing，criterion satisfied=false |
| Planning | `offline-planning-1`；version=1；Manager context 有 planningAttemptId，agentCatalog=null |
| Plan | `offline-turn-1`；version=2；steps 顺序 A→B，状态 running/pending，仅 A 有 attempt |
| A 提交后 | version=3；唯一消息 `offline-message-a`，seq=1、speaker=participant-a |
| B context/input | step=`offline-step-1`；contextThroughSeq=1；生产 projector 返回唯一 A 消息，replyTo 指向它；A/B attemptId 和 deliveryId 不同 |

A 正文逐字为 `Marker: amber-47. Reason: a local fixture needs no network.`；B 输入正文逐字为 `I cite amber-47: a local fixture needs no network.`。B 输入只构造和校验，没有继续规划、Captain end 或归档。

生产注册器输出的 `convivium_create_meeting`、`convivium_submit_manager_plan`、`convivium_submit_turn` 名称各唯一，parameters 均精确为：

```json
{"type":"object","properties":{"input":{"description":"Protocol v1 command input."}},"required":["input"]}
```

这记录当前 DSH `0.1.1-rc.2` `defineTool` 的实际输出；内部 Manager/Turn 字段未展开，根对象没有 additionalProperties。19 个 runtime 方法与 caller.resolve 共享同一个抛错 `vi.fn`，注册后明确断言未调用；未使用假 Agent 或执行工具。

生产 Manager provisioning envelope 的 kind=`convivium.session.provisioning`、version=1、role=manager、capability=none，不含 participantId。instruction 精确为：

```text
This message establishes your meeting identity only. You have no planning or speaker capability yet. Wait for a later request that includes attemptId and deliveryId before using any meeting write tool.
```

Manager context 有 planningAttemptId，但没有 own attemptId/deliveryId；A/B context.attempt 两字段均为非空字符串。这是当前措辞和字段不对齐的离线观察，不是模型失败复现，也未修复 prompt、Schema 或 context。

## Executed Validation

环境：本地 macOS，Node `v22.23.2`，pnpm `10.7.0`，Vitest `3.2.7`；依赖已安装，未 install/upgrade。

| 验证 | 实际结果 |
| --- | --- |
| T0 既有 manager-planning/tool-registration/status-projection focused baseline | 3 files / 33 tests；退出 0 |
| 最终新增 contract suite | 1 file / 8 tests；退出 0 |
| 两新增文件 Prettier | 无格式变化；退出 0 |
| 两新增文件独立 strict tsc | 退出 0；不依赖排除 tests 的项目 tsconfig |
| `pnpm --dir plugin verify` | 退出 0；75 files / 589 tests，包含新增 8 tests |
| 完整 gate 子项 | format、lint、host/client typecheck、test、build、environment、contract、9 Agent Definition samples、package 全部通过 |
| 构建提示 | 现有 `INEFFECTIVE_DYNAMIC_IMPORT` 提示涉及 storage/jsonl；不影响退出码，未为此修改产品 |

八个测试的实际验收：

| ID | 测试名称 | 验收内容 |
| --- | --- | --- |
| V1 | `builds schema-valid offline inputs` | 四类输入独立 Schema 调用、create keys、canonical IDs/criterion/agenda、version 1→2→3 |
| V2 | `plans only A before B` | 精确 speaker/status 顺序、唯一 attempt、A 身份/空 recentMessages/throughSeq=0、无 Catalog/recommendations |
| V3 | `projects the submitted A message into B context` | transcript/B recentMessages 唯一且 id/seq/speaker/content 精确，B step/throughSeq/replyTo/正文、独立 attempt/delivery |
| V4 | `rejects missing protocol fields and text-only replies` | 缺 planningAttemptId、缺 deliveryId、仅 content=OK 均拒绝，原 packet JSON 不变 |
| V5 | `rejects stale planning and unassigned speaker projection` | wrong version 抛 DomainError.STALE_MANAGER_ATTEMPT；未分配 B 与 A 配 B attempt 均 TypeError，源 JSON 不变 |
| V6 | `separates schema validity from reply reference evidence` | 错误 replyTo 字符串仍通过 Schema，但上下文无引用；正确引用唯一匹配 A |
| V7 | `records current tool and provisioning surfaces` | 三工具名称唯一/完整参数、runtime/caller never-called、完整 envelope instruction 与 context 字段差异 |
| V8 | `returns detached repeatable fixtures` | 两次 packet JSON 相同；修改第一份 B 消息后第一份 afterA transcript 与第二份整个 packet 不变 |

最终 focused/type 命令：

```sh
pnpm --dir plugin exec prettier tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts --write
pnpm --dir plugin exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --verbatimModuleSyntax tests/fixtures/offline-meeting-protocol.ts tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin exec vitest run --project contract tests/contract/offline-meeting-protocol.spec.ts
pnpm --dir plugin verify
```

早期 focused 通过曾遗漏部分固定断言，先前 PASS 记录不能替代上述最终结果；`908c781` 补齐整个矩阵，最终 8 项及完整 gate 重新验证。所有既有提交保留，未重写历史。

| 步骤 | 本地提交追溯 |
| --- | --- |
| 计划固定 | `9267fff` |
| T0 | `0fdce26` |
| T1 与纠正 | `38e337e`、`c71599d`、`c01d6b6` |
| T2 与最终纠正 | `6983ddf`、`55e0b5c`、`908c781` |
| T3 与最终重验 | `ce5a227`、`a8d2f12` |
| T4 | `bed6ed9` |
| T5 | 本证据首次提交，同时删除临时执行说明 |

## Not Covered

- 真实模型自主生成会议协议、实际 provider/model/preset 选择与配置、请求/费用硬上限、凭据授权与实际 Host graph；后续需独立决定及授权。
- 真实 Captain/Manager/Participant continuable Session、调用方 authority/capability、Session ownership、模型或工具实际执行、真实 B 回复与语义质量。这里的固定字符串不是模型输出。
- B 后续提交/规划与 Captain end 时序、会议结束归档、capability revoke、Activation drain、Host/profile/端口清理。没有启动这些资源，不以本次进程退出代替真实生命周期证据。
- repository stale version、幂等重放/冲突、事务原子性与回滚、receipt/outbox/event commit、restart/reopen/recovery、Archive 一致性：本新增纯数据准备边界不适用；既有全量 suite 通过不等于本新增场景完成真实运行。
- UI、deterministic smoke、FR-13 admission/推荐、FR-14 composition、prompt/schema 产品修复、后台任务/私聊、HTTP/存储/恢复模拟、通用 fixture 框架均不在本次交付范围。

未读取 dev.env，未修改个人 profile，未运行 `smoke:profile` / `verify:runtime`，未调用真实 LLM。原真实模型闭环目标没有完成，不能以离线测试代替。

## Closure

稳定成果仅为两个 test-only 文件；生产语义、接口与运行入口未变，因此 requirements/interfaces/designs/operations 无新增规范需迁移。全部离线验证事实与移出范围保存于本文；共享 coverage/TODO 由协调任务整合，已通知其证据路径及未覆盖边界。

T5 删除前检查 81 个本地 Markdown 链接目标全部存在；删除后检查 71 个目标全部存在。文件名/标题残留引用搜索退出 1（无匹配），git diff --check 退出 0；新增证据 whitespace 检查通过。临时执行说明已删除，可从 Git 历史恢复；长期事实和全部未覆盖项已迁移。

最终交付这两个测试文件及本文。测试/验证命令已退出，本任务未创建 Host、Session、profile 或端口；fixture 仅内存数据，无待清理运行资源。现有 build 更新的忽略目录 `plugin/lib/` 保留，未删除用户资源。此次仅本地逐步提交，未 push、PR 或合并。
