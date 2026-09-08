# v0.1.2-rc.1 真相源映射

本映射仅用于维护 Skill，唯一目标为 `dsh-v0.1.2-rc.1`，commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`。先确认 checkout 精确命中该 tag，再读取下列 DSH repository path。不得以 moving branch 的同名文件替代。

## 使用方法

每个 reference 在下方只有一个证据入口。先按其主题查公开类型与实现，再查可执行 gate、行为测试、所属包 README 和其他文档；冲突按此顺序裁决。路径均相对于目标 DSH 仓库根目录，文档链接相对于本文件。

“类型与实现”定位具体契约；“规则与验证工具”定位仓库要求；“行为测试”用于核对边界，但路径存在不等于测试已运行；“包与目录”用于继续查 exports、配置、Provider 或平台变体，不表示整个目录都已逐行验证；“文档参考”只作辅助。模型工具的动态配置名和 MCP 远端 discovery 不具有固定全集。

维护时区分已实现行为、仓库规则、由现有原语推导的指导和外部协议要求。私有实验包或 snapshot 不构成已发布默认能力的证据。正常插件开发使用 [路由](../references/plugin-development-routing.md)，插件验证由 [测试与文档交付](../references/testing-docs.md) 指导，Skill 发布与升级流程由 [维护流程](skill-maintenance.md) 拥有；本文件不复制验证结果或临时审计清单。

## 文档冲突的裁决

目标版本 Gateway 的 stream method、carrier 和调用方已实现，不能沿用总览只支持 unary 的限制。Session projection 虽允许可选注册 contributor，agent-loop 与实际 Host reader 已有强制依赖；不得把旧 optional 描述推导为空值 fallback。

## 专题证据

### 需求澄清流程

对应 [requirements-discovery.md](../references/requirements-discovery.md)。

这是 Skill 自有的需求整理方法，不宣称 DSH 实现了需求管理能力。流程中的 DSH 可行性判断转入对应能力专题核对；不以源码路径数量证明需求覆盖。

### Storage Backend 开发

对应 [storage-backend-development.md](../references/storage-backend-development.md)。

**类型与实现**

- `packages/storage/storage/src/backend.ts`
- `packages/storage/storage/src/index.ts`
- `packages/storage/storage/src/registry.ts`
- `packages/storage/storage/src/error.ts`
- `packages/storage/storage-domain/src/index.ts`
- `packages/storage/storage-json/src/index.ts`
- `packages/storage/storage-json/src/format.ts`
- `packages/storage/storage-json/src/per-record-unit.ts`

**行为测试**

- `packages/storage/storage/tests/contract.ts`

**文档参考**

- `packages/storage/storage/README.md`

### HOW-TO：事件驱动应用案例

对应 [how-to-build-event-driven-app.md](../references/how-to-build-event-driven-app.md)。

案例行为取自上游 GitHub review guide 与真实 overlay/rule；步骤组织和迁移问题为 Skill 导读。`assets/github-review/` 提供改编模块与配置：直接使用 self-binding register，仓库和 Workspace 改为必填环境配置。本地探针由 Skill 编写，只验证入站 acknowledgement，不能替代 DSH 组合测试。外部 patch 的相对模块路径按 profile Loader 解析规则核对，不因 guide 展示启动命令而推断相对于 patch 目录。

**类型与实现**

- `apps/cli/config/examples/github-review/cordis.yml`
- `apps/cli/config/examples/github-review/github-ready-review-rule.mjs`
- `packages/webhook/webhook/src/index.ts`
- `packages/webhook/webhook-github/src/index.ts`
- `packages/boot/app-boot/src/profile.ts`

**行为测试**

- `packages/webhook/webhook/tests/runtime.spec.ts`
- `packages/webhook/webhook/tests/session.spec.ts`
- `packages/webhook/webhook/tests/loader-composition.spec.ts`
- `packages/webhook/webhook-github/tests/handler.spec.ts`
- `packages/webhook/webhook-github/tests/loader-composition.spec.ts`

**文档参考**

- `docs/user/guide/github-review.md`
- `docs/user/develop/basic/index.md`
- `docs/user/develop/basic/tool.md`
- `docs/user/develop/practice/index.md`
- `packages/webhook/webhook/README.md`

### 应用设计与能力组合

对应 [application-design.md](../references/application-design.md)。

本专题的能力选择和组合边界来自下列基线材料；设计流程、设计交付表和分析助手示例是基于公开原语整理的指导，不是上游已实现的业务应用。各能力的精确接口、状态和失败契约继续按所属专题核对。上游 cookbook 的通用 “Scheduled tasks (cron)” 行不能覆盖 Schedule 实现的 Session-local fixed-interval 限制；不要照抄成已支持通用 Cron 的结论。

**类型与实现**

- `packages/boot/app-boot/src/profile.ts`
- `packages/boot/app-boot/src/index.ts`
- `packages/bundle/base/cordis.patch.yml`
- `packages/bundle/web-app/cordis.patch.yml`
- `packages/bundle/headless/cordis.patch.yml`
- `packages/bundle/sdk-app/cordis.patch.yml`
- `packages/bundle/sdk-minimal/cordis.patch.yml`
- `packages/bundle/acp-app/cordis.patch.yml`

**规则与验证工具**

- `scripts/verify-application-entrypoints.ts`

**行为测试**

- `packages/boot/app-boot/tests/profile.spec.ts`
- `packages/boot/app-boot/tests/loader-shape.compat.spec.ts`
- `packages/bundle/sdk-minimal/tests/sdk-minimal.spec.ts`
- `apps/cli/tests/profiles/sdk/keyless-smoke.e2e.ts`
- `apps/cli/tests/profiles/headless/tests/keyless-smoke.e2e.ts`

**文档参考**

- `docs/architecture.md`
- `docs/cookbook/extension-cookbook.md`
- `docs/cookbook/adding-a-package.md`
- `packages/boot/app-boot/README.md`
- `packages/bundle/sdk-minimal/README.md`

### Agent、Subagent、Agent Teams 与 Workflow

对应 [agent-subagent-workflow.md](../references/agent-subagent-workflow.md)。

**类型与实现**

- `packages/core/agent-default-model/src/index.ts`
- `packages/core/agent-loop/src/agent.ts`
- `packages/core/agent-loop/src/index.ts`
- `packages/core/agent/src/index.ts`
- `packages/core/agent/src/runtime-types.ts`
- `packages/experimental/agent-team-profile/cordis.patch.yml`
- `packages/experimental/agent-team/src/index.ts`
- `packages/experimental/agent-team/src/projection.ts`
- `packages/subagent/subagent-acp/src/index.ts`
- `packages/subagent/subagent-claude-code/src/index.ts`
- `packages/subagent/subagent-codex/src/index.ts`
- `packages/subagent/subagent-dsh-sdk/src/index.ts`
- `packages/subagent/subagent/src/continuation.ts`
- `packages/subagent/subagent/src/descriptor.ts`
- `packages/subagent/subagent/src/index.ts`
- `packages/subagent/subagent/src/types.ts`
- `packages/subagent/tool-subagent/src/model-selection-settings.ts`
- `packages/workflow/workflow/src/index.ts`

**包与目录**

- `packages/core/agent`
- `packages/core/agent-default-model`
- `packages/core/agent-loop`
- `packages/experimental/agent-team`
- `packages/experimental/agent-team-profile`
- `packages/experimental/agent-team-web-profile`
- `packages/experimental/agent-team/src`
- `packages/experimental/client-ui-agent-team`
- `packages/subagent/subagent`
- `packages/subagent/subagent-acp`
- `packages/subagent/subagent-claude-code`
- `packages/subagent/subagent-codex`
- `packages/subagent/subagent-dsh-sdk`
- `packages/subagent/subagent-fork-in-process`
- `packages/subagent/subagent-in-process-driver`
- `packages/subagent/subagent-spawn-in-process`
- `packages/subagent/subagent/tests`
- `packages/subagent/tool-subagent`
- `packages/subagent/tool-subagent-control`
- `packages/workflow/tool-workflow`
- `packages/workflow/workflow`
- `packages/workflow/workflow-worker-thread/tests`

**文档参考**

- `docs/subsystems/subagent.md`
- `docs/subsystems/workflow.md`
- `packages/core/agent-loop/README.md`
- `packages/experimental/agent-team/README.md`
- `packages/experimental/tool-agent-team/README.md`
- `packages/subagent/subagent/README.md`
- `packages/workflow/workflow-worker-thread/README.md`
- `packages/workflow/workflow/README.md`

### 内置工具的组合与行为契约

对应 [builtin-tool-contracts.md](../references/builtin-tool-contracts.md)。

**类型与实现**

- `packages/experimental/tool-agent-team/src/index.ts`
- `packages/fs/tool-fs-search/src/index.ts`
- `packages/fs/tool-str-replace-editor/src/index.ts`
- `packages/shell/tool-bash-persistent/src/index.ts`
- `packages/shell/tool-pwsh-persistent/src/index.ts`
- `packages/workflow/tool-ralph/src/index.ts`
- `packages/workflow/workflow-worker-thread/src/index.ts`
- `packages/workflow/workflow-worker-thread/src/types.ts`

**包与目录**

- `packages/experimental/tool-agent-team`
- `packages/experimental/tool-agent-team/package.json`
- `packages/fs/tool-fs-search`
- `packages/fs/tool-fs-search/package.json`
- `packages/fs/tool-str-replace-editor`
- `packages/fs/tool-str-replace-editor/package.json`
- `packages/shell/tool-bash-persistent`
- `packages/shell/tool-bash-persistent/package.json`
- `packages/shell/tool-pwsh-persistent`
- `packages/shell/tool-pwsh-persistent/package.json`
- `packages/workflow/tool-ralph`
- `packages/workflow/tool-ralph/package.json`
- `packages/workflow/workflow-worker-thread`
- `packages/workflow/workflow-worker-thread/package.json`

**文档参考**

- `packages/experimental/tool-agent-team/README.md`
- `packages/fs/tool-fs-search/README.md`
- `packages/fs/tool-str-replace-editor/README.md`
- `packages/shell/tool-bash-persistent/README.md`
- `packages/shell/tool-pwsh-persistent/README.md`
- `packages/workflow/tool-ralph/README.md`
- `packages/workflow/workflow-worker-thread/README.md`

### 能力接缝与 Provider

对应 [capability-seams-providers.md](../references/capability-seams-providers.md)。

**类型与实现**

- `packages/shell/bash-local/src/index.ts`
- `packages/shell/shell/src/index.ts`
- `packages/shell/tool-bash/src/index.ts`

**规则与验证工具**

- `packages/AGENTS.md`

**文档参考**

- `docs/architecture.md`
- `docs/capability-seams.md`
- `docs/glossary.md`

### Client Conversation Node

对应 [client-conversation-nodes.md](../references/client-conversation-nodes.md)。

**类型与实现**

- `packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`
- `packages/client/ui-chat/src/client/conversation-nodes/inbox.ts`
- `packages/client/ui-chat/src/client/conversation-nodes/message.ts`
- `packages/client/ui-chat/src/client/conversation-nodes/register.ts`
- `packages/client/ui-conversation/src/client/contract/conversation.ts`
- `packages/client/ui-conversation/src/client/contract/input.ts`
- `packages/client/ui-conversation/src/client/conversation/assembler.ts`
- `packages/client/ui-conversation/src/client/conversation/assembly.ts`
- `packages/client/ui-conversation/src/client/conversation/event-registry.ts`
- `packages/client/ui-conversation/src/client/index.ts`

**行为测试**

- `packages/client/ui-conversation/tests/conversation-assembler.client.spec.ts`

**包与目录**

- `packages/api/session-controller/src/client`
- `packages/client/ui-conversation`

**文档参考**

- `docs/subsystems/conversation.md`

### DSH Client UI

对应 [client-ui.md](../references/client-ui.md)。

**类型与实现**

- `packages/client/locale/src/client/index.ts`
- `packages/client/modules/src/client/manifest.ts`
- `packages/client/modules/src/index.ts`
- `packages/client/store/src/index.ts`
- `packages/client/ui-attachment/src/client/index.ts`
- `packages/client/ui-chat/src/client/contract/slots.ts`
- `packages/client/ui-commands/src/client/index.ts`
- `packages/client/ui-commands/src/client/service.ts`
- `packages/client/ui-input-trigger/src/client/index.ts`
- `packages/client/ui-layout/src/client/index.ts`
- `packages/client/ui-model-selection/src/client/service.ts`
- `packages/client/ui-renderer/src/client/index.ts`
- `packages/client/ui-renderer/src/client/registry.ts`
- `packages/client/ui-session/src/client/index.ts`
- `packages/client/ui-settings/src/client/schema.ts`
- `packages/client/ui-settings/src/client/settings-scope.ts`
- `packages/client/ui-slots/src/index.ts`
- `packages/client/ui-theme/src/client/index.ts`
- `packages/client/ui-workspace/src/client/navigation.ts`

**规则与验证工具**

- `packages/client/AGENTS.md`
- `scripts/package-dependency-policy.ts`
- `scripts/verify-client-packages.ts`
- `scripts/verify-package-dependencies.ts`

**包与目录**

- `packages/client/hmr`
- `packages/client/locale`
- `packages/client/modules`
- `packages/client/store`
- `packages/client/ui-agent-preset`
- `packages/client/ui-approval`
- `packages/client/ui-attachment`
- `packages/client/ui-attachment/package.json`
- `packages/client/ui-brand-official`
- `packages/client/ui-chat`
- `packages/client/ui-commands`
- `packages/client/ui-conversation/tests`
- `packages/client/ui-deliverables`
- `packages/client/ui-directory-picker-browse`
- `packages/client/ui-directory-picker-native`
- `packages/client/ui-goal`
- `packages/client/ui-input-trigger`
- `packages/client/ui-jobs`
- `packages/client/ui-layout`
- `packages/client/ui-message-feedback`
- `packages/client/ui-model-selection`
- `packages/client/ui-permission-presets`
- `packages/client/ui-plan`
- `packages/client/ui-primitives`
- `packages/client/ui-reference`
- `packages/client/ui-renderer`
- `packages/client/ui-schedule`
- `packages/client/ui-session`
- `packages/client/ui-settings`
- `packages/client/ui-settings-general`
- `packages/client/ui-settings-models`
- `packages/client/ui-settings-plugin-inventory`
- `packages/client/ui-settings-plugins`
- `packages/client/ui-sidebar`
- `packages/client/ui-skill`
- `packages/client/ui-slots`
- `packages/client/ui-subagent`
- `packages/client/ui-theme`
- `packages/client/ui-tool`
- `packages/client/ui-trajectory`
- `packages/client/ui-user-questions`
- `packages/client/ui-workflow-run`
- `packages/client/ui-workspace`
- `packages/client/web`

**文档参考**

- `docs/subsystems/slots.md`
- `docs/subsystems/web-client.md`
- `packages/client/ui-slots/README.md`

### 组合、配置与凭证

对应 [composition-config-credentials.md](../references/composition-config-credentials.md)。

**类型与实现**

- `packages/boot/app-boot/src/index.ts`
- `packages/boot/app-boot/src/profile.ts`
- `packages/boot/cmdline/src/index.ts`
- `packages/bundle/acp-app/cordis.patch.yml`
- `packages/bundle/base/cordis.patch.yml`
- `packages/bundle/sdk-app/cordis.patch.yml`
- `packages/bundle/sdk-minimal/cordis.patch.yml`
- `packages/bundle/web-app/cordis.patch.yml`
- `packages/credentials/credentials-local/src/index.ts`
- `packages/credentials/credentials/src/index.ts`
- `packages/preset/agent-presets/src/index.ts`
- `packages/preset/agent-presets/src/types.ts`
- `packages/session/session-telemetry/src/index.ts`
- `vendor/hmr/src/index.ts`
- `vendor/loader/src/index.ts`

**规则与验证工具**

- `scripts/verify-application-entrypoints.ts`
- `scripts/verify-cordis-config.ts`

**行为测试**

- `packages/credentials/credentials-local/tests/local.spec.ts`

**包与目录**

- `apps/cli`
- `apps/cli/tests/profiles`
- `packages/acp/acp/src`
- `packages/boot/app-boot`
- `packages/boot/cmdline`
- `packages/bundle/acp-app`
- `packages/bundle/base`
- `packages/bundle/headless`
- `packages/bundle/sdk-app`
- `packages/bundle/sdk-minimal`
- `packages/bundle/web-app`
- `packages/sdk/client/src`
- `packages/session/session-telemetry`
- `packages/session/session-telemetry-otel`
- `vendor/group`
- `vendor/hmr`
- `vendor/include`
- `vendor/loader`

**文档参考**

- `docs/cordis-primer.md`
- `docs/subsystems/credentials.md`
- `docs/subsystems/session-telemetry.md`
- `packages/credentials/credentials/README.md`
- `vendor/loader/README.md`

### 上下文压缩、计量与持久恢复

对应 [context-recovery.md](../references/context-recovery.md)。

**类型与实现**

- `packages/compaction/compaction-basic/src/index.ts`
- `packages/compaction/compaction-tool-result-pruner/src/index.ts`
- `packages/compaction/compaction/src/index.ts`
- `packages/compaction/compaction/src/tool-pairing.ts`
- `packages/compaction/compaction/src/types.ts`
- `packages/llm/token-meter/src/estimate.ts`
- `packages/llm/token-meter/src/index.ts`
- `packages/llm/token-meter/src/types.ts`
- `packages/session/session-persistence/src/coordinator.ts`
- `packages/session/session-persistence/src/index.ts`
- `packages/session/session-persistence/src/preparations.ts`
- `packages/session/session-persistence/src/write-behind.ts`

**包与目录**

- `packages/compaction/command-compact`
- `packages/compaction/compaction`
- `packages/compaction/compaction-basic`
- `packages/compaction/compaction-tool-result-pruner`
- `packages/llm/token-meter`
- `packages/session/session-checkpoint-policy`
- `packages/session/session-persistence`
- `packages/session/session-persistence-jsonl`

**文档参考**

- `docs/subsystems/compaction.md`
- `docs/subsystems/persistence.md`
- `docs/subsystems/token-meter.md`

### Cordis 生命周期

对应 [cordis-lifecycle.md](../references/cordis-lifecycle.md)。

**类型与实现**

- `packages/core/scope/src/index.ts`
- `packages/core/scope/src/store.ts`
- `packages/core/system-prompt/src/index.ts`
- `packages/core/tools/src/index.ts`
- `packages/llm/llm/src/index.ts`
- `vendor/cordis/src/context.ts`
- `vendor/cordis/src/events.ts`
- `vendor/timer/src/index.ts`

**包与目录**

- `vendor/cordis`
- `vendor/cosmokit`
- `vendor/logger-console`
- `vendor/schemastery`
- `vendor/timer`

**文档参考**

- `docs/cordis-primer.md`
- `docs/subsystems/scope.md`
- `packages/core/system-prompt/README.md`
- `packages/core/tools/README.md`
- `packages/llm/llm/README.md`

### Credential records 与交互授权

对应 [credentials-authorization.md](../references/credentials-authorization.md)。

**类型与实现**

- `packages/credentials/authorization/src/index.ts`
- `packages/credentials/authorization/src/types.ts`
- `packages/credentials/credentials-local/src/index.ts`
- `packages/credentials/credentials/src/index.ts`
- `packages/credentials/credentials/src/types.ts`

**行为测试**

- `packages/credentials/authorization/tests/authorization.spec.ts`
- `packages/credentials/credentials/tests/credentials.spec.ts`

**包与目录**

- `packages/credentials/authorization`
- `packages/credentials/authorization/package.json`
- `packages/credentials/credentials`
- `packages/credentials/credentials-local`
- `packages/credentials/credentials-local/package.json`
- `packages/credentials/credentials/package.json`

**文档参考**

- `packages/credentials/authorization/README.md`
- `packages/credentials/credentials-local/README.md`
- `packages/credentials/credentials/README.md`

### 防御性生命周期

对应 [defensive-lifecycle.md](../references/defensive-lifecycle.md)。

**类型与实现**

- `packages/jobs/jobs/src/index.ts`
- `packages/subagent/subagent/src/continuation.ts`
- `packages/subprocess/subprocess-local/src/index.ts`
- `packages/workflow/workflow-worker-thread/src/index.ts`

**文档参考**

- `docs/defensive-patterns.md`
- `docs/testing.md`

### 动态 Cordis 扩展

对应 [dynamic-cordis.md](../references/dynamic-cordis.md)。

**类型与实现**

- `packages/extensions/cordis-client-runner/src/client/index.ts`
- `packages/extensions/cordis-client-runner/src/client/inspect-registry.ts`
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
- `packages/extensions/cordis-client-runner/src/client/timer.ts`
- `packages/extensions/cordis-host-runner/src/index.ts`
- `packages/extensions/cordis-host-runner/src/inspect-registry.ts`
- `packages/extensions/cordis-host-runner/src/registry.ts`
- `packages/extensions/cordis-host-runner/src/sandbox.ts`
- `packages/extensions/cordis-host-runner/src/types.ts`
- `packages/extensions/tool-cordis/src/api-catalog.ts`
- `packages/extensions/tool-cordis/src/index.ts`

**包与目录**

- `packages/extensions/cordis-client-runner`
- `packages/extensions/cordis-host-runner`
- `packages/extensions/tool-cordis`
- `packages/extensions/ui-cordis`

**文档参考**

- `docs/user/develop/practice/dynamic-cordis.md`

### 文件系统与观察策略

对应 [filesystem-policy.md](../references/filesystem-policy.md)。

**类型与实现**

- `packages/fs/fs-local/src/fsio.ts`
- `packages/fs/fs-local/src/index.ts`
- `packages/fs/fs-observation-policy/src/index.ts`
- `packages/fs/fs/src/index.ts`
- `packages/fs/fs/src/types.ts`
- `packages/fs/tool-fs/src/index.ts`

**包与目录**

- `packages/fs/fs`
- `packages/fs/fs-local`
- `packages/fs/fs-observation-policy`
- `packages/fs/fs-sandbox`
- `packages/fs/tool-fs`

**文档参考**

- `docs/subsystems/filesystem.md`

### Claude Code 与 Codex Hook 桥接

对应 [hooks-compatibility.md](../references/hooks-compatibility.md)。

**类型与实现**

- `packages/hooks/hook-protocol/src/events.ts`
- `packages/hooks/hook-protocol/src/index.ts`
- `packages/hooks/hook-protocol/src/types.ts`
- `packages/hooks/hooks-claude-code/src/index.ts`
- `packages/hooks/hooks-codex/src/index.ts`

**行为测试**

- `packages/hooks/hook-protocol/tests/events.spec.ts`
- `packages/hooks/hooks-claude-code/tests/bridge.spec.ts`
- `packages/hooks/hooks-codex/tests/bridge.spec.ts`

**包与目录**

- `packages/hooks/hook-protocol`
- `packages/hooks/hook-protocol/package.json`
- `packages/hooks/hooks-claude-code`
- `packages/hooks/hooks-claude-code/package.json`
- `packages/hooks/hooks-codex`
- `packages/hooks/hooks-codex/package.json`

**文档参考**

- `packages/hooks/hook-protocol/README.md`
- `packages/hooks/hooks-claude-code/README.md`
- `packages/hooks/hooks-codex/README.md`

### Host 平台、启动环境与支持库

对应 [host-platform-support.md](../references/host-platform-support.md)。

**类型与实现**

- `native/landlock-run/packages/entry/src/index.ts`
- `packages/experimental/code-runtime-python/src/index.ts`
- `packages/experimental/inspector/src/client/plugin.ts`
- `packages/experimental/inspector/src/index.ts`
- `packages/experimental/webworker-packer/src/index.ts`
- `packages/experimental/webworker-runtime/src/index.ts`
- `packages/host/directory-picker-auto/src/index.ts`
- `packages/host/directory-picker-browse/src/index.ts`
- `packages/host/directory-picker-native/src/index.ts`
- `packages/host/directory-picker/src/index.ts`
- `packages/host/directory-picker/src/types.ts`
- `packages/host/plugin-inventory/src/index.ts`
- `packages/host/plugin-inventory/src/types.ts`
- `packages/identity/anonymous-user-id/src/index.ts`
- `packages/shell/shell-env/src/index.ts`
- `packages/util/atomic-write/src/index.ts`
- `packages/util/brand/src/index.ts`
- `packages/util/crypto/src/index.ts`
- `packages/util/deque/src/index.ts`
- `packages/util/home-paths/src/index.ts`
- `packages/util/launch-environment/src/index.ts`
- `packages/util/native-command/src/index.ts`
- `packages/util/output-retention/src/index.ts`
- `packages/util/time/src/index.ts`
- `packages/util/timeout/src/index.ts`
- `packages/util/values/src/index.ts`
- `packages/util/workspace-path/src/index.ts`

**包与目录**

- `apps/web`
- `apps/web/package.json`
- `native/landlock-run`
- `native/landlock-run/package.json`
- `native/landlock-run/packages/entry`
- `native/landlock-run/packages/entry/package.json`
- `native/landlock-run/packages/linux-arm64`
- `native/landlock-run/packages/linux-arm64/package.json`
- `native/landlock-run/packages/linux-x64`
- `native/landlock-run/packages/linux-x64/package.json`
- `packages/experimental/code-runtime-python`
- `packages/experimental/code-runtime-python/package.json`
- `packages/experimental/inspector`
- `packages/experimental/inspector/package.json`
- `packages/experimental/webworker-packer`
- `packages/experimental/webworker-packer/package.json`
- `packages/experimental/webworker-runtime`
- `packages/experimental/webworker-runtime/package.json`
- `packages/host/directory-picker`
- `packages/host/directory-picker-auto`
- `packages/host/directory-picker-auto/package.json`
- `packages/host/directory-picker-browse`
- `packages/host/directory-picker-browse/package.json`
- `packages/host/directory-picker-native`
- `packages/host/directory-picker-native/package.json`
- `packages/host/directory-picker/package.json`
- `packages/host/plugin-inventory`
- `packages/host/plugin-inventory/package.json`
- `packages/identity/anonymous-user-id`
- `packages/identity/anonymous-user-id/package.json`
- `packages/shell/shell-env`
- `packages/shell/shell-env/package.json`
- `packages/util/atomic-write`
- `packages/util/atomic-write/package.json`
- `packages/util/brand`
- `packages/util/brand/package.json`
- `packages/util/crypto`
- `packages/util/crypto/package.json`
- `packages/util/deque`
- `packages/util/deque/package.json`
- `packages/util/home-paths`
- `packages/util/home-paths/package.json`
- `packages/util/launch-environment`
- `packages/util/launch-environment/package.json`
- `packages/util/native-command`
- `packages/util/native-command/package.json`
- `packages/util/output-retention`
- `packages/util/output-retention/package.json`
- `packages/util/time`
- `packages/util/time/package.json`
- `packages/util/timeout`
- `packages/util/timeout/package.json`
- `packages/util/values`
- `packages/util/values/package.json`
- `packages/util/workspace-path`
- `packages/util/workspace-path/package.json`

**文档参考**

- `native/landlock-run/README.md`
- `native/landlock-run/packages/entry/README.md`
- `native/landlock-run/packages/linux-arm64/README.md`
- `native/landlock-run/packages/linux-x64/README.md`
- `packages/experimental/code-runtime-python/README.md`
- `packages/experimental/inspector/README.md`
- `packages/experimental/webworker-packer/README.md`
- `packages/experimental/webworker-runtime/README.md`
- `packages/host/directory-picker-auto/README.md`
- `packages/host/directory-picker-browse/README.md`
- `packages/host/directory-picker-native/README.md`
- `packages/host/directory-picker/README.md`
- `packages/host/plugin-inventory/README.md`
- `packages/identity/anonymous-user-id/README.md`
- `packages/shell/shell-env/README.md`
- `packages/util/atomic-write/README.md`
- `packages/util/brand/README.md`
- `packages/util/crypto/README.md`
- `packages/util/deque/README.md`
- `packages/util/home-paths/README.md`
- `packages/util/launch-environment/README.md`
- `packages/util/native-command/README.md`
- `packages/util/output-retention/README.md`
- `packages/util/time/README.md`
- `packages/util/timeout/README.md`
- `packages/util/values/README.md`
- `packages/util/workspace-path/README.md`

### 人类交互

对应 [human-interaction.md](../references/human-interaction.md)。

**类型与实现**

- `packages/api/remotes/src/index.ts`
- `packages/interaction/commands/src/index.ts`
- `packages/interaction/commands/src/types.ts`
- `packages/interaction/permission-presets/src/index.ts`
- `packages/interaction/user-approval/src/index.ts`
- `packages/interaction/user-approval/src/types.ts`
- `packages/interaction/user-questions/src/index.ts`
- `packages/interaction/user-questions/src/types.ts`
- `packages/sandbox/sandbox-policy/src/index.ts`
- `packages/sandbox/sandbox/src/index.ts`

**包与目录**

- `packages/feedback/command-feedback`
- `packages/interaction/commands`
- `packages/interaction/permission-presets`
- `packages/interaction/tool-ask-user`
- `packages/interaction/user-approval`
- `packages/interaction/user-questions`
- `packages/interaction/user-questions/tests`
- `packages/sandbox/sandbox`
- `packages/sandbox/sandbox-local`
- `packages/sandbox/sandbox-policy`
- `packages/sandbox/sandbox-windows-acl`

**文档参考**

- `docs/subsystems/approval.md`
- `docs/subsystems/commands.md`
- `docs/subsystems/permission-presets.md`
- `docs/subsystems/sandbox.md`
- `docs/subsystems/user-questions.md`

### Jobs 后台工作与完成通知

对应 [jobs-background-work.md](../references/jobs-background-work.md)。

**类型与实现**

- `packages/jobs/jobs-local/src/index.ts`
- `packages/jobs/jobs/src/index.ts`
- `packages/jobs/jobs/src/types.ts`
- `packages/jobs/tool-jobs/src/index.ts`

**行为测试**

- `packages/jobs/jobs-local/tests/jobs.spec.ts`

**包与目录**

- `packages/jobs/jobs`
- `packages/jobs/jobs-local`
- `packages/jobs/jobs-local/package.json`
- `packages/jobs/jobs/package.json`
- `packages/jobs/tool-jobs`
- `packages/jobs/tool-jobs/package.json`

**文档参考**

- `packages/jobs/jobs-local/README.md`
- `packages/jobs/jobs/README.md`
- `packages/jobs/tool-jobs/README.md`

### 模型目录、内置 Adapter 与图像请求

对应 [llm-model-routing.md](../references/llm-model-routing.md)。

**类型与实现**

- `packages/llm/llm-deepseek/src/index.ts`
- `packages/llm/llm-deepseek/src/types.ts`
- `packages/llm/llm-pi-ai/src/index.ts`

**包与目录**

- `packages/llm/llm-deepseek`
- `packages/llm/llm-deepseek/package.json`
- `packages/llm/llm-pi-ai`
- `packages/llm/llm-pi-ai/package.json`

**文档参考**

- `packages/llm/llm-deepseek/README.md`
- `packages/llm/llm-pi-ai/README.md`

### LLM Provider Adapter

对应 [llm-provider-adapters.md](../references/llm-provider-adapters.md)。

**类型与实现**

- `packages/llm/deepseek-llm-api-extensions/src/index.ts`
- `packages/llm/deepseek-llm-api-extensions/src/types.ts`
- `packages/llm/llm-deepseek/src/adapter.ts`
- `packages/llm/llm-deepseek/src/index.ts`
- `packages/llm/llm-pi-ai/src/index.ts`
- `packages/llm/llm/src/index.ts`
- `packages/llm/llm/src/types.ts`
- `packages/llm/plugin-package-inventory-deepseek/src/index.ts`
- `packages/llm/token-meter/src/route-pricing.ts`
- `packages/session/session-log-deepseek/src/index.ts`

**行为测试**

- `packages/llm/llm-deepseek/tests/adapter.spec.ts`
- `packages/llm/llm-pi-ai/tests/adapter.spec.ts`
- `packages/llm/token-meter/tests/route-pricing.spec.ts`

**包与目录**

- `packages/llm/deepseek-llm-api-extensions`
- `packages/llm/deepseek-llm-api-extensions/tests`
- `packages/llm/llm`
- `packages/llm/llm-retry`
- `packages/llm/plugin-package-inventory-deepseek`
- `packages/session/session-log-deepseek`

**文档参考**

- `docs/deepseek-llm-api-wire-extensions.md`
- `packages/llm/llm/README.md`

### DSH 包开发

对应 [package-authoring.md](../references/package-authoring.md)。

**类型与实现**

- `packages/core/agent/src/runtime-types.ts`
- `packages/core/tools/src/invariant.ts`
- `packages/util/values/src/index.ts`

**规则与验证工具**

- `packages/AGENTS.md`
- `scripts/check-workspace-constraints.ts`
- `scripts/package-dependency-policy.ts`
- `scripts/package-invariants.spec.ts`
- `scripts/package-invariants.ts`
- `scripts/verify-package-dependencies.ts`
- `scripts/verify-package-readme-limitations.ts`
- `scripts/verify-package-readme-model-experience.ts`

**包与目录**

- `packages/api/session-controller/tsconfig.client.json`
- `packages/api/session-controller/tsconfig.host.json`
- `packages/api/session-controller/tsconfig.json`
- `packages/core/tools/package.json`
- `packages/core/tools/tsconfig.json`
- `tsconfig.client.json`
- `tsconfig.host.json`

**文档参考**

- `docs/cookbook/adding-a-package.md`

### Plan、Goal、Todo 与 Schedule

对应 [planning-scheduling.md](../references/planning-scheduling.md)。

**类型与实现**

- `packages/goal/goal/src/domain.ts`
- `packages/goal/goal/src/index.ts`
- `packages/plan/plan-mode/src/index.ts`
- `packages/plan/plan-mode/src/types.ts`
- `packages/schedule/schedule/src/domain.ts`
- `packages/schedule/schedule/src/index.ts`
- `packages/schedule/schedule/src/runtime.ts`
- `packages/schedule/schedule/src/tools.ts`
- `packages/schedule/schedule/src/transaction.ts`
- `packages/schedule/schedule/src/types.ts`

**行为测试**

- `packages/schedule/schedule/tests/plugin.spec.ts`

**包与目录**

- `packages/goal/command-goal`
- `packages/goal/goal`
- `packages/goal/goal-round-driver`
- `packages/goal/tool-goal`
- `packages/plan/plan-mode`
- `packages/schedule/schedule`
- `packages/todo/tool-todo`

**文档参考**

- `docs/subsystems/goal.md`
- `docs/subsystems/plan.md`
- `docs/subsystems/schedule.md`
- `docs/subsystems/todo.md`
- `docs/user/guide/schedule.md`

### 插件开发路由

对应 [plugin-development-routing.md](../references/plugin-development-routing.md)。

**类型与实现**

- `packages/api/gateway/src/index.ts`
- `packages/boot/app-boot/src/profile.ts`
- `packages/webhook/webhook/src/index.ts`

**规则与验证工具**

- `packages/AGENTS.md`

**文档参考**

- `docs/architecture.md`
- `docs/glossary.md`
- `docs/testing.md`

### Agent Preset、Persona 与上下文插件

对应 [presets-context.md](../references/presets-context.md)。

**类型与实现**

- `packages/context/agent-instructions/src/index.ts`
- `packages/context/time-context/src/index.ts`
- `packages/context/tmux-context/src/index.ts`
- `packages/preset/agent-presets/src/index.ts`
- `packages/preset/agent-presets/src/types.ts`
- `packages/preset/persona/src/index.ts`

**行为测试**

- `packages/preset/agent-presets/tests/authoring.spec.ts`
- `packages/preset/agent-presets/tests/session.spec.ts`
- `packages/preset/persona/tests/persona.spec.ts`

**包与目录**

- `packages/context/agent-instructions`
- `packages/context/agent-instructions/package.json`
- `packages/context/time-context`
- `packages/context/time-context/package.json`
- `packages/context/tmux-context`
- `packages/context/tmux-context/package.json`
- `packages/preset/agent-presets`
- `packages/preset/agent-presets/package.json`
- `packages/preset/persona`
- `packages/preset/persona/package.json`

**文档参考**

- `packages/context/agent-instructions/README.md`
- `packages/context/time-context/README.md`
- `packages/context/tmux-context/README.md`
- `packages/preset/agent-presets/README.md`
- `packages/preset/persona/README.md`

### E2B 远程执行环境

对应 [remote-execution.md](../references/remote-execution.md)。

**类型与实现**

- `packages/e2b/e2b/src/index.ts`
- `packages/e2b/fs-e2b/src/index.ts`
- `packages/e2b/subprocess-e2b/src/index.ts`

**行为测试**

- `packages/e2b/e2b/tests/e2b.spec.ts`
- `packages/e2b/fs-e2b/tests/filesystem.spec.ts`
- `packages/e2b/subprocess-e2b/tests/subprocess.spec.ts`

**包与目录**

- `packages/e2b/e2b`
- `packages/e2b/e2b/package.json`
- `packages/e2b/fs-e2b`
- `packages/e2b/fs-e2b/package.json`
- `packages/e2b/subprocess-e2b`
- `packages/e2b/subprocess-e2b/package.json`

**文档参考**

- `packages/e2b/e2b/README.md`
- `packages/e2b/fs-e2b/README.md`
- `packages/e2b/subprocess-e2b/README.md`

### 文件、图片、Spill 与进程资源

对应 [runtime-resources.md](../references/runtime-resources.md)。

**类型与实现**

- `packages/attachment/attachment-local/src/index.ts`
- `packages/attachment/attachment/src/admission.ts`
- `packages/attachment/attachment/src/index.ts`
- `packages/fs/fs/src/index.ts`
- `packages/fs/tool-fs/src/read-image.ts`
- `packages/lsp/lsp/src/index.ts`
- `packages/lsp/lsp/src/types.ts`
- `packages/mcp/mcp-client/src/index.ts`
- `packages/shell/shell/src/index.ts`
- `packages/shell/shell/src/types.ts`
- `packages/spill/spill-local/src/cleanup.ts`
- `packages/spill/spill-local/src/index.ts`
- `packages/spill/spill-policy/src/index.ts`
- `packages/spill/spill/src/index.ts`
- `packages/subprocess/subprocess/src/index.ts`
- `packages/subprocess/subprocess/src/types.ts`
- `packages/subprocess/win32-process/src/index.ts`
- `packages/terminal/terminal-bash/src/index.ts`
- `packages/terminal/terminal/src/index.ts`
- `packages/terminal/terminal/src/types.ts`

**行为测试**

- `packages/attachment/attachment/tests/admission.spec.ts`
- `packages/fs/tool-fs/tests/read-image.spec.ts`
- `packages/mcp/mcp-client/tests/apply.spec.ts`

**包与目录**

- `packages/attachment/attachment`
- `packages/attachment/attachment-local`
- `packages/lsp/lsp`
- `packages/lsp/lsp-stdio`
- `packages/lsp/tool-lsp`
- `packages/mcp/mcp-client`
- `packages/shell/bash-local`
- `packages/shell/bash-sandbox`
- `packages/shell/pwsh-local`
- `packages/shell/pwsh-sandbox`
- `packages/shell/shell`
- `packages/shell/tool-bash`
- `packages/shell/tool-pwsh`
- `packages/spill/spill`
- `packages/spill/spill-local`
- `packages/spill/spill-local/tests`
- `packages/spill/spill-policy`
- `packages/subprocess/subprocess`
- `packages/subprocess/subprocess-local`
- `packages/subprocess/win32-process`
- `packages/terminal/terminal`
- `packages/terminal/terminal-bash`
- `packages/terminal/tool-terminal`

**文档参考**

- `docs/subsystems/lsp.md`
- `docs/subsystems/shell.md`
- `docs/subsystems/subprocess.md`
- `docs/subsystems/terminal.md`

### Scoped registration

对应 [scoped-registration.md](../references/scoped-registration.md)。

**类型与实现**

- `packages/core/scope/src/index.ts`
- `packages/core/scope/src/store.ts`

**包与目录**

- `packages/core/scope`
- `packages/core/scope/tests`

**文档参考**

- `docs/subsystems/scope.md`

### SDK 与 ACP 集成

对应 [sdk-acp-integration.md](../references/sdk-acp-integration.md)。

**类型与实现**

- `packages/acp/acp/src/index.ts`
- `packages/acp/acp/src/session.ts`
- `packages/sdk/client/src/api.ts`
- `packages/sdk/client/src/client.ts`
- `packages/sdk/client/src/launch.ts`
- `packages/sdk/client/src/types.ts`
- `packages/sdk/protocol/src/types.ts`
- `packages/sdk/server/src/server.ts`
- `python/sdk/src/deepseek_harness/client.py`

**行为测试**

- `packages/sdk/client/tests/launch.spec.ts`
- `packages/sdk/client/tests/sdk-client.spec.ts`
- `python/sdk/tests/test_client.py`

**包与目录**

- `packages/acp/acp`
- `packages/sdk/client`
- `packages/sdk/protocol`
- `packages/sdk/server`

### Session event 与持久模型上下文

对应 [session-durable-context.md](../references/session-durable-context.md)。

**类型与实现**

- `packages/api/session-controller/src/skill-catalog.ts`
- `packages/context/file-reference/src/index.ts`
- `packages/context/file-reference/src/types.ts`
- `packages/context/session-reference/src/index.ts`
- `packages/context/session-reference/src/types.ts`
- `packages/core/agent-loop/src/agent.ts`
- `packages/core/agent/src/runtime-types.ts`
- `packages/core/session/src/index.ts`
- `packages/core/session/src/types.ts`
- `packages/core/system-prompt/src/index.ts`
- `packages/session/session-persistence-jsonl/src/index.ts`
- `packages/session/session-persistence/src/index.ts`
- `packages/session/session-title-llm/src/index.ts`
- `packages/session/session-title/src/index.ts`
- `packages/util/values/src/index.ts`

**包与目录**

- `packages/context/file-reference`
- `packages/context/file-reference-local`
- `packages/context/session-reference`
- `packages/core/session`
- `packages/core/system-prompt`
- `packages/session/session-title`
- `packages/session/session-title-all-prompts-llm`
- `packages/session/session-title-first-prompt-llm`
- `packages/session/session-title-llm`

**文档参考**

- `docs/architecture.md`
- `docs/subsystems/session-reference.md`
- `docs/subsystems/session-title.md`
- `docs/subsystems/session.md`
- `docs/subsystems/system-prompt.md`
- `packages/core/agent-loop/README.md`
- `packages/core/system-prompt/README.md`

### Session 查询、索引与导出

对应 [session-query-index.md](../references/session-query-index.md)。

**类型与实现**

- `packages/session-query/session-log-export/src/client/index.ts`
- `packages/session-query/session-log-export/src/index.ts`
- `packages/session-query/session-query-sqlite/src/index.ts`
- `packages/session-query/session-query/src/index.ts`
- `packages/session-query/session-query/src/types.ts`
- `packages/session-query/tool-session-query/src/index.ts`

**行为测试**

- `packages/session-query/session-query-sqlite/tests/query.spec.ts`

**包与目录**

- `packages/session-query/session-log-export`
- `packages/session-query/session-log-export/package.json`
- `packages/session-query/session-query`
- `packages/session-query/session-query-sqlite`
- `packages/session-query/session-query-sqlite/package.json`
- `packages/session-query/session-query/package.json`
- `packages/session-query/tool-session-query`
- `packages/session-query/tool-session-query/package.json`

**文档参考**

- `packages/session-query/session-log-export/README.md`
- `packages/session-query/session-query-sqlite/README.md`
- `packages/session-query/session-query/README.md`
- `packages/session-query/tool-session-query/README.md`

### Session 与 Workspace 的应用 API

对应 [session-workspace-api.md](../references/session-workspace-api.md)。

**类型与实现**

- `packages/api/gateway/src/client/journal-stream.ts`
- `packages/api/remotes/src/client/index.ts`
- `packages/api/session-controller/src/client/index.ts`
- `packages/api/session-controller/src/file-references.ts`
- `packages/api/session-controller/src/history.ts`
- `packages/api/session-controller/src/index.ts`
- `packages/api/session-controller/src/skill-catalog.ts`
- `packages/api/session-controller/src/types.ts`
- `packages/api/workspace-controller/src/client/index.ts`
- `packages/api/workspace-controller/src/directory-picker.ts`
- `packages/api/workspace-controller/src/index.ts`
- `packages/api/workspace-controller/src/types.ts`
- `packages/client/connection/src/client/index.ts`
- `packages/client/connection/src/rpc-host.ts`
- `packages/session-query/session-query/src/observation.ts`
- `packages/workspace/workspace/src/index.ts`

**行为测试**

- `packages/api/gateway/tests/journal-stream.client.spec.ts`
- `packages/session-query/session-query/tests/observation.spec.ts`

**包与目录**

- `packages/api/session-controller`
- `packages/api/workspace-controller`
- `packages/client/connection`
- `packages/workspace/workspace`

### DSH Skill Provider 与调用策略

对应 [skill-providers.md](../references/skill-providers.md)。

**类型与实现**

- `packages/skill/skill-filesystem/src/index.ts`
- `packages/skill/skill/src/index.ts`
- `packages/skill/tool-skill/src/index.ts`

**包与目录**

- `packages/skill/skill`
- `packages/skill/skill-badge`
- `packages/skill/skill-filesystem`
- `packages/skill/tool-skill`

**文档参考**

- `docs/subsystems/skills.md`

### Storage 与 Session projection

对应 [storage-projections.md](../references/storage-projections.md)。

**类型与实现**

- `packages/core/agent-loop/src/index.ts`
- `packages/core/agent/src/types.ts`
- `packages/feedback/message-feedback/src/index.ts`
- `packages/feedback/message-feedback/src/types.ts`
- `packages/goal/goal/src/fold.ts`
- `packages/goal/goal/src/types.ts`
- `packages/schedule/schedule/src/projection.ts`
- `packages/session/session-projection-cache/src/index.ts`
- `packages/session/session-projection/src/index.ts`
- `packages/session/session-projection/src/types.ts`
- `packages/session/session-turn-outline/src/index.ts`
- `packages/session/session-turn-outline/src/types.ts`
- `packages/storage/storage-domain/src/domain.ts`
- `packages/storage/storage-domain/src/events.ts`
- `packages/storage/storage-domain/src/index.ts`
- `packages/storage/storage-domain/src/spec.ts`
- `packages/storage/storage/src/backend.ts`
- `packages/storage/storage/src/index.ts`

**包与目录**

- `packages/feedback/message-feedback`
- `packages/session/session-projection`
- `packages/session/session-projection-cache`
- `packages/session/session-projection-cache/src`
- `packages/session/session-projection/tests`
- `packages/session/session-stats`
- `packages/session/session-turn-outline`
- `packages/storage/storage`
- `packages/storage/storage-domain`
- `packages/storage/storage-domain/tests`
- `packages/storage/storage-json`
- `packages/storage/storage-json/src`
- `packages/storage/storage-sqlite`

**文档参考**

- `docs/subsystems/feedback.md`
- `docs/subsystems/session-projection.md`
- `docs/subsystems/storage.md`

### 测试、文档与 Skill 维护

对应 [testing-docs.md](../references/testing-docs.md)。

**类型与实现**

- `packages/runtime-diagnostics/invariants/src/index.ts`

**规则与验证工具**

- `AGENTS.md`
- `packages/AGENTS.md`
- `scripts/doc-typecheck-paths.ts`
- `scripts/doc-typecheck.ts`
- `scripts/package-invariants.ts`
- `scripts/run-gates.ts`
- `scripts/verify-package-invariants.ts`
- `snapshots/AGENTS.md`
- `vitest.expected.config.ts`

**包与目录**

- `package.json`
- `packages/runtime-diagnostics/invariants`
- `packages/test-support/agent-loop-testkit`
- `packages/test-support/client-runtime`
- `packages/test-support/llm-mock-server`
- `packages/test-support/llm-replay`
- `packages/test-support/loader-smoke`
- `packages/test-support/session-snapshot`

**文档参考**

- `docs/subsystems/invariants.md`
- `docs/testing.md`
- `packages/test-support/session-snapshot/README.md`

### 模型工具

对应 [tools.md](../references/tools.md)。

**类型与实现**

- `packages/code-runtime/code-runtime/src/index.ts`
- `packages/code-runtime/code-runtime/src/types.ts`
- `packages/core/tools/src/index.ts`
- `packages/core/tools/src/presentation.ts`
- `packages/core/tools/src/ptc.ts`
- `packages/core/tools/src/schema.ts`
- `packages/fs/tool-fs/src/read-render.ts`
- `packages/fs/tool-fs/src/read.ts`
- `packages/jobs/jobs/src/index.ts`

**行为测试**

- `packages/core/agent-loop/tests/coverage-edges.spec.ts`

**包与目录**

- `packages/code-runtime/code-runtime`
- `packages/code-runtime/code-runtime-worker-thread`
- `packages/core/agent-tool-presentation`
- `packages/core/tools`
- `packages/core/tools/tests`
- `packages/experimental/code-runtime-python/package.json`
- `packages/guard/repeat-tool-reminder`
- `packages/guard/timeout-policy`

**文档参考**

- `docs/cookbook/adding-a-tool.md`
- `docs/subsystems/code-runtime.md`
- `docs/subsystems/jobs.md`
- `packages/core/tools/README.md`

### Typert Remote API

对应 [typert-remote-api.md](../references/typert-remote-api.md)。

**类型与实现**

- `packages/api/gateway/src/client/index.ts`
- `packages/api/gateway/src/client/remote-stream.ts`
- `packages/api/gateway/src/index.ts`
- `packages/api/gateway/src/types.ts`
- `packages/api/remotes/src/client/index.ts`
- `packages/api/workspace-controller/src/index.ts`
- `packages/typert/protocol/src/index.ts`
- `packages/typert/protocol/src/remote-error.ts`
- `packages/typert/protocol/src/types.ts`

**行为测试**

- `packages/typert/protocol/tests/protocol.spec.ts`

**包与目录**

- `packages/api/gateway`
- `packages/api/gateway/tests`
- `packages/api/remotes`
- `packages/typert/generator`
- `packages/typert/loader`
- `packages/typert/protocol`
- `packages/typert/registry`

**文档参考**

- `docs/cookbook/adding-a-remote-api.md`
- `packages/typert/generator/README.md`
- `packages/typert/protocol/README.md`

### 用户设置

对应 [user-settings.md](../references/user-settings.md)。

**类型与实现**

- `packages/api/settings-controller/src/credentials.ts`
- `packages/api/settings-controller/src/index.ts`
- `packages/client/ui-settings/src/client/settings-scope.ts`
- `packages/settings/settings/src/index.ts`
- `packages/settings/settings/src/types.ts`

**包与目录**

- `packages/api/settings-controller`
- `packages/settings/settings`
- `packages/settings/settings-file`
- `packages/settings/settings/tests`

**文档参考**

- `docs/cookbook/adding-a-settings-card.md`
- `docs/subsystems/settings.md`
- `packages/client/ui-settings-plugins/README.md`

### Web 搜索与抓取

对应 [web-capabilities.md](../references/web-capabilities.md)。

**类型与实现**

- `packages/bundle/base/cordis.patch.yml`
- `packages/web/tool-web/src/fetch.ts`
- `packages/web/web-fetch-http/src/network.ts`
- `packages/web/web-fetch-http/src/policy.ts`
- `packages/web/web-fetch-http/src/provider.ts`
- `packages/web/web/src/index.ts`

**行为测试**

- `packages/web/web-fetch-http/tests/fetch-http.spec.ts`

**包与目录**

- `packages/preset/agent-presets/presets`
- `packages/web/tool-web`
- `packages/web/web`
- `packages/web/web-fetch-http`
- `packages/web/web-search-deepseek`
- `packages/web/web-search-exa`
- `packages/web/web-search-perplexity`

**文档参考**

- `docs/subsystems/web.md`

### Web ingress

对应 [web-ingress.md](../references/web-ingress.md)。

**类型与实现**

- `packages/client/connection/src/index.ts`
- `packages/client/connection/src/browser-auth.ts`
- `packages/client/connection/src/api-request-trust.ts`
- `packages/client/hmr/src/index.ts`
- `packages/client/modules/src/index.ts`
- `packages/credentials/credentials/src/index.ts`
- `packages/host/webserver/src/index.ts`
- `packages/webhook/webhook-github/src/handler.ts`
- `packages/webhook/webhook-github/src/index.ts`
- `packages/webhook/webhook/src/index.ts`
- `packages/webhook/webhook/src/session.ts`
- `packages/webhook/webhook/src/types.ts`
- `vendor/cordis/src/events.ts`

**行为测试**

- `packages/host/webserver/tests/webserver.spec.ts`

**包与目录**

- `packages/host/frontend-static`
- `packages/host/webserver`
- `packages/webhook/webhook`
- `packages/webhook/webhook-github`
- `packages/webhook/webhook-github/tests`
- `packages/webhook/webhook/tests`

**文档参考**

- `docs/subsystems/webhook.md`
