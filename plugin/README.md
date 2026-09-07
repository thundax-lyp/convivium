# Convivium DSH Plugin

Convivium is a DSH plugin for continuous, structured multi-agent meetings.

The product is implemented independently in this directory. Product behavior and engineering contracts are defined by the repository-level `docs/` tree.

## Meeting Agent Definition

FR-14 首版通过创建前切面为初始 Manager/Participant 注入角色配置，共享 Captain 已挂载的父 Preset。Host/profile 的 Convivium config 可内联定义，例如：

```yaml
agentDefinitions:
    - agentDefinitionId: architecture-reviewer
      definitionVersion: 1.0.0
      roleDefinitionId: domain_architect
      displayName: 架构评审者
      summary: 检查职责和依赖边界
      persona: 检查当前方案的职责和依赖边界，引用证据说明问题。
      dshPresetId: minimal
      requiredSkillNames: [domain-architecture]
      expertiseTags: [architecture]
      evidenceScopes: [repository]
```

使用前须由宿主安装并挂载 `minimal`，并提供模型可调用且内容非空的 `domain-architecture` Skill；示例不会自动安装这些能力。`dshPresetId` 必须等于父 Preset，不能用来切换 child Preset。可选 `toolFilter` 仅收窄已有工具，不授予权限。

Captain 调用 `convivium_create_meeting` 时，在已有合法创建请求中选择定义：

```ts
const input = {
    ...existingCreateInput,
    participants: existingCreateInput.participants.map((participant) => ({
        ...participant,
        agentDefinitionId: "architecture-reviewer"
    }))
};
```

Manager 使用独立的 `managerAgentDefinitionId` 字段，只能引用 `roleDefinitionId: meeting_manager` 的已配置定义；Participant 不能引用该角色。省略选择保持原行为。所有选择在首个 child 分配前校验；失败返回 `UNSUPPORTED_CAPABILITY`、`retryable: false` 和固定消息 `Meeting role composition is unavailable.`，不会发布 ready Meeting。配置格式错误在 Host 启动时报固定错误，不输出 persona 正文。

创建后保存不可变定义 ID、version、hash；ready 重放和冷恢复沿用已创建身份，不重新读取当前定义。独立 per-child Preset 不纳入 Convivium 后续实施计划，等待 DSH 升级。

字段限制和恢复边界见 [Definition Interface](../docs/20-interfaces/MEETING-AGENT-DEFINITION-INTERFACE.md)，真实验证入口见 [DSH Smoke](../docs/50-operations/HOW-TO-DSH-SMOKE.md)，完成范围见 [FR-14 Evidence](../docs/40-readiness/FR14-SHARED-PRESET-ROLE-COMPOSITION-EVIDENCE.md)。
